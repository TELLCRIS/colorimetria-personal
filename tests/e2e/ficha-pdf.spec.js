// Informe final: ficha A4 (vista previa) y su descarga en PDF de una página.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  test, expect, uniqueName, openSession, uploadPhoto, faceFile, readImage, closeTo, expectNoHorizontalOverflow, FACE,
} from './fixtures.js';

const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '.artifacts', 'screens');
const require = createRequire(import.meta.url);
const FEATURES = { skin: FACE.skin, hair: FACE.hair, eyes: FACE.eyes };

/**
 * Espía de lo que la app dibuja en el lienzo de la ficha (1654×2339): textos, cajas y círculos con su color.
 * Es la única forma de saber qué contiene una imagen sin depender de OCR.
 */
async function spyFicha(page) {
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const isFicha = (ctx) => ctx.canvas && ctx.canvas.width === 1654 && ctx.canvas.height === 2339;
    const log = (ctx) => {
      if (!ctx.__log) { ctx.__log = []; ctx.__shape = null; (window.__fichas ||= []).push(ctx.__log); }
      return ctx.__log;
    };
    const wrap = (name, fn) => {
      const original = proto[name];
      proto[name] = function (...args) { if (isFicha(this)) fn(this, args); return original.apply(this, args); };
    };
    wrap('fillText', (ctx, [t, x, y]) => log(ctx).push({ kind: 'text', t: String(t), x, y, color: String(ctx.fillStyle).toUpperCase(), font: ctx.font, align: ctx.textAlign }));
    wrap('beginPath', (ctx) => { log(ctx); ctx.__shape = null; });
    wrap('roundRect', (ctx, [x, y, w, h]) => { log(ctx); ctx.__shape = { kind: 'box', x, y, w, h }; });
    wrap('arc', (ctx, [x, y, r]) => { log(ctx); ctx.__shape = { kind: 'circle', x, y, r }; });
    wrap('fill', (ctx) => { if (ctx.__shape) log(ctx).push({ ...ctx.__shape, color: String(ctx.fillStyle).toUpperCase() }); });
    wrap('drawImage', (ctx, args) => log(ctx).push({ kind: 'image', w: args[0]?.width, h: args[0]?.height }));
  });
}

/** Última ficha dibujada, ya interpretada por secciones (las secciones se localizan por su título). */
async function fichaContent(page, colors) {
  const log = await page.evaluate(() => (window.__fichas ?? []).at(-1) ?? null);
  if (!log) return null;
  const texts = log.filter((e) => e.kind === 'text');
  const title = (name) => texts.find((e) => e.t === name);
  const titles = ['Subtono', 'Tu mejor familia de color', 'Paleta recomendada', 'Colores a evitar', 'Guía de maquillaje', 'Ropa: neutros y acentos']
    .map((name) => ({ name, at: title(name) }));
  const yOf = (name) => titles.find((x) => x.name === name)?.at?.y ?? null;
  const byHex = new Map(colors.map((c) => [c.hex.toUpperCase(), c.id]));
  const between = (e, from, to) => (e.y ?? 0) > yOf(from) - 10 && (e.y ?? 0) < yOf(to) - 46;
  const recX = title('Paleta recomendada')?.x ?? 0;
  const ids = (shapes) => shapes.map((s) => byHex.get(s.color)).filter(Boolean);
  return {
    log,
    texts: texts.map((e) => e.t),
    missingTitles: titles.filter((x) => !x.at).map((x) => x.name),
    axisTexts: texts.filter((e) => between(e, 'Subtono', 'Tu mejor familia de color')).map((e) => e.t),
    headTexts: texts.filter((e) => e.y < yOf('Subtono') - 46).map((e) => e.t),
    recommended: ids(log.filter((e) => e.kind === 'box' && between(e, 'Paleta recomendada', 'Colores a evitar') && e.x >= recX - 30)),
    family: ids(log.filter((e) => e.kind === 'circle' && between(e, 'Tu mejor familia de color', 'Colores a evitar') && e.x < recX - 30)),
    avoid: ids(log.filter((e) => e.kind === 'box' && between(e, 'Colores a evitar', 'Guía de maquillaje'))),
    avoidTexts: texts.filter((e) => between(e, 'Colores a evitar', 'Guía de maquillaje')).map((e) => e.t),
    hasPhoto: log.some((e) => e.kind === 'image'),
    overflowing: texts.filter((e) => e.align !== 'right' && e.align !== 'center' && e.x > 1654 - 64).map((e) => e.t),
  };
}

async function openReport(page) {
  await page.getByTestId('report-button').click();
  await expect(page.getByTestId('report-title')).toBeVisible();
}

async function previewInfo(page) {
  const img = page.getByTestId('report-final-preview');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((node) => node.complete && node.naturalWidth)).toBe(1654);
  return img.evaluate((node) => ({ w: node.naturalWidth, h: node.naturalHeight, src: node.src, source: node.dataset.source, alt: node.alt }));
}

async function downloadPdf(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-final-download').click()]);
  return { name: download.suggestedFilename(), buffer: fs.readFileSync(await download.path()) };
}

/** Validación estricta de la estructura del PDF (sin tolerancias de visor). */
function inspectPdf(buffer) {
  const s = buffer.toString('latin1');
  const problems = [];
  if (!s.startsWith('%PDF-1.')) problems.push('no empieza por %PDF-1.x');
  if (!/%%EOF\s*$/.test(s)) problems.push('no termina en %%EOF');
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(s)?.[1]);
  if (s.slice(startxref, startxref + 4) !== 'xref') problems.push(`startxref (${startxref}) no apunta a la tabla xref`);
  const head = /^xref\r?\n(\d+) (\d+)\r?\n/.exec(s.slice(startxref));
  const count = Number(head?.[2]);
  const entries = [];
  let pos = startxref + (head?.[0].length ?? 0);
  for (let i = 0; i < count; i++) {
    const line = s.slice(pos, pos + 20);
    if (!/^\d{10} \d{5} [nf][ \r][\r\n]$/.test(line)) problems.push(`entrada xref ${i} mal formada: ${JSON.stringify(line)}`);
    entries.push({ offset: Number(line.slice(0, 10)), free: line[17] === 'f' });
    pos += 20;
  }
  if (!s.slice(pos).startsWith('trailer')) problems.push('tras la tabla xref no viene el trailer');
  entries.forEach((entry, n) => {
    if (entry.free) return;
    if (!s.slice(entry.offset).startsWith(`${n} 0 obj`)) problems.push(`el objeto ${n} no está en el desplazamiento ${entry.offset} de la xref`);
  });
  const size = Number(/trailer\s*<<[^>]*\/Size (\d+)/.exec(s)?.[1]);
  if (size !== count) problems.push(`/Size ${size} ≠ entradas de la xref ${count}`);
  if (!/\/Root \d+ 0 R/.test(s.slice(pos))) problems.push('trailer sin /Root');
  const pages = (s.match(/\/Type \/Page(?![a-zA-Z])/g) ?? []).length;
  const pageCount = Number(/\/Type \/Pages[^>]*\/Count (\d+)/.exec(s)?.[1]);
  const mediaBox = /\/MediaBox \[([^\]]+)\]/.exec(s)?.[1].trim().split(/\s+/).map(Number);
  // Imagen incrustada
  const image = /(\d+) 0 obj\n<<[^>]*\/Subtype \/Image[^>]*>>\nstream\n/.exec(s);
  const dict = image?.[0] ?? '';
  const length = Number(/\/Length (\d+)/.exec(dict)?.[1]);
  const begin = (image?.index ?? 0) + dict.length;
  const jpeg = buffer.subarray(begin, begin + length);
  if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) problems.push('el flujo de imagen no empieza como JPEG (FFD8)');
  if (!(jpeg[jpeg.length - 2] === 0xff && jpeg[jpeg.length - 1] === 0xd9)) problems.push('el flujo de imagen no termina como JPEG (FFD9)');
  if (!s.slice(begin + length).startsWith('\nendstream')) problems.push('/Length de la imagen no coincide con el flujo real');
  // Flujo de contenido
  const content = /<< \/Length (\d+) >>\nstream\n/.exec(s);
  const contentBody = content ? s.slice(content.index + content[0].length, content.index + content[0].length + Number(content[1])) : '';
  if (content && !s.slice(content.index + content[0].length + Number(content[1])).startsWith('\nendstream')) problems.push('/Length del contenido no coincide');
  return {
    problems, pages, pageCount, mediaBox, jpeg, contentBody,
    image: {
      width: Number(/\/Width (\d+)/.exec(dict)?.[1]), height: Number(/\/Height (\d+)/.exec(dict)?.[1]),
      filter: /\/Filter \/(\w+)/.exec(dict)?.[1], colorSpace: /\/ColorSpace \/(\w+)/.exec(dict)?.[1], bits: Number(/\/BitsPerComponent (\d+)/.exec(dict)?.[1]),
    },
  };
}

/** Abre el PDF con pdf.js (el motor del visor de Firefox) dentro de Chromium y rasteriza la página 1. */
async function rasterize(page, buffer, points) {
  const dir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  await page.route('**/__pdfjs/*', (route) => {
    const file = path.join(dir, 'build', path.basename(new URL(route.request().url()).pathname));
    route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(file) });
  });
  const result = await page.evaluate(async ({ b64, points }) => {
    const pdfjs = await import('/__pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/__pdfjs/pdf.worker.min.mjs';
    const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data, stopAtErrors: true }).promise;
    const first = await doc.getPage(1);
    const meta = await doc.getMetadata();
    const viewport = first.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    await first.render({ canvasContext: ctx, viewport }).promise;
    const out = {
      numPages: doc.numPages, view: first.view, title: meta.info?.Title ?? null, producer: meta.info?.Producer ?? null,
      width: canvas.width, height: canvas.height,
      pixels: points.map(([fx, fy]) => Array.from(ctx.getImageData(Math.round(fx * (canvas.width - 1)), Math.round(fy * (canvas.height - 1)), 1, 1).data.slice(0, 3))),
      png: canvas.toDataURL('image/png').split(',')[1],
    };
    try { await (doc.loadingTask ? doc.loadingTask.destroy() : doc.cleanup()); } catch { /* limpieza opcional */ }
    return out;
  }, { b64: buffer.toString('base64'), points });
  await page.unroute('**/__pdfjs/*');
  return result;
}

const save = (name, data) => { fs.mkdirSync(ARTIFACTS, { recursive: true }); fs.writeFileSync(path.join(ARTIFACTS, name), data); };
const NONSENSE = /undefined|null|NaN|\[object/;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Puntos relativos de la ficha: centro del hueco de la foto y esquina del fondo.
const PHOTO_CENTER = [(64 + 225) / 1654, (64 + 330) / 2339];
const CORNER = [10 / 1654, 10 / 2339];

let session;
let colors;
test.beforeEach(async ({ page, api }) => {
  session = await api.createSession(uniqueName('Ficha'), 'Luz natural');
  colors = (await api.colors()).colors;
  await spyFicha(page);
});

test.describe('ficha final: los cuatro casos', () => {
  test('valoraciones + foto: ficha completa basada en las valoraciones', async ({ page, api }, testInfo) => {
    const analysis = await api.rateAllFor(session.id, 'invierno-frio');
    await api.features(session.id, FEATURES);
    await openSession(page, session.id);
    await uploadPhoto(page);
    await openReport(page);

    const button = page.getByTestId('report-final-download');
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('data-source', 'ratings');
    await expect(button).toHaveText(/Descargar informe final \(PDF\)/);
    await expect(page.getByTestId('report-final-status')).toContainText('Invierno Frío');
    await expect(page.getByTestId('report-final-status')).toContainText(/según tus valoraciones/i);
    const preview = await previewInfo(page);
    expect([preview.w, preview.h, preview.source]).toEqual([1654, 2339, 'ratings']);
    expect(preview.alt).toContain('Invierno Frío');

    const ficha = await fichaContent(page, colors);
    expect(ficha.missingTitles).toEqual([]);
    expect(ficha.texts).toContain('Invierno Frío');
    expect(ficha.texts).toContain('Tu estación');
    expect(ficha.texts).not.toContain('Tu estación estimada');
    expect(ficha.headTexts.join(' ')).toMatch(new RegExp(`Según tus valoraciones · Afinidad ${analysis.top.score} % · Confianza: Alta`));
    expect(ficha.headTexts.join(' ')).toContain(session.name);
    for (const required of ['Guía de maquillaje', 'Color de cabello', 'Ropa: neutros y acentos', 'Joyería y metales', 'Colorete', 'Labios', 'Sombras', 'Delineador', 'Neutros', 'Acentos', 'Contraste', 'Profundidad', 'Intensidad']) {
      expect(ficha.texts, `falta «${required}»`).toContain(required);
    }
    // Ejes con los porcentajes reales del análisis.
    for (const value of [analysis.axes.undertone.frio, analysis.axes.undertone.calido, analysis.axes.depth.oscuro, analysis.axes.chroma.brillante]) {
      expect(ficha.axisTexts).toContain(`${value} %`);
    }
    // Paletas exactamente como el análisis.
    expect(ficha.recommended).toEqual(analysis.recommended.slice(0, 12));
    expect(ficha.avoid).toEqual(analysis.avoid);
    expect(ficha.avoidTexts.join(' ')).toContain(`y ${analysis.avoidCount - 8} más`);
    // Guía de la estación: maquillaje, cabello, neutros y metales con los nombres de la guía.
    const guide = (await api.colors()).seasons.find((s) => s.id === 'invierno-frio').guide;
    const all = ficha.texts.join(' | ');
    for (const item of [...guide.makeup.blush, ...guide.makeup.lips, ...guide.makeup.eyeshadow, ...guide.makeup.eyeliner, ...guide.hair.best, ...guide.neutrals, ...guide.accents]) {
      expect(all, `falta «${item.name}» de la guía`).toContain(item.name.split(' ')[0]);
    }
    for (const trait of guide.traits) expect(ficha.texts, `falta el rasgo ${trait}`).toContain(trait);
    expect(all).toContain(guide.metals.best[0]);
    expect(ficha.texts.filter((t) => NONSENSE.test(t))).toEqual([]);
    expect(ficha.texts.filter((t) => t.trim() === '')).toEqual([]);
    // La foto está en la ficha.
    expect(ficha.hasPhoto).toBe(true);
    const jpeg = Buffer.from(preview.src.split(',')[1], 'base64');
    const image = await readImage(page, jpeg, [PHOTO_CENTER, CORNER], 'image/jpeg');
    expect(closeTo(image.pixels[0], FACE.skin, 14), `centro de la foto ${image.pixels[0]}`).toBe(true);
    expect(closeTo(image.pixels[1], '#F6F2ED', 6)).toBe(true);
    save(`${testInfo.project.name}--ficha-valoraciones-foto.jpg`, jpeg);
    await expectNoHorizontalOverflow(page, 'con la vista previa de la ficha');
  });

  test('solo estimación automática: se indica visiblemente y no se inventan porcentajes', async ({ page, api }, testInfo) => {
    await api.features(session.id, FEATURES);
    const { analysis } = await api.getSession(session.id);
    const estimated = analysis.auto.seasons[0];
    await openSession(page, session.id);
    await uploadPhoto(page);
    await openReport(page);

    const button = page.getByTestId('report-final-download');
    await expect(button).toBeEnabled();
    await expect(button).toHaveAttribute('data-source', 'auto');
    const status = page.getByTestId('report-final-status');
    await expect(status).toContainText(estimated.name);
    await expect(status).toContainText(/estimación automática/i);
    await expect(status).toContainText(/no tus valoraciones/i);
    const preview = await previewInfo(page);
    expect(preview.source).toBe('auto');
    expect(preview.alt).toMatch(/estimación automática/i);

    const ficha = await fichaContent(page, colors);
    expect(ficha.texts).toContain(estimated.name);
    expect(ficha.texts).toContain('Tu estación estimada');
    expect(ficha.texts).not.toContain('Tu estación');
    expect(ficha.headTexts.join(' ')).toMatch(/Estimación automática a partir de la foto, no de tus valoraciones/);
    expect(ficha.headTexts.join(' ')).not.toMatch(/Según tus valoraciones/);
    // Sin valoraciones no hay porcentajes en los ejes: solo la categoría estimada.
    expect(ficha.axisTexts.filter((t) => /\d\s*%/.test(t)), 'porcentajes inventados en los ejes').toEqual([]);
    expect(ficha.axisTexts.filter((t) => t === 'Estimado por la foto')).toHaveLength(4);
    expect(ficha.axisTexts).not.toContain('Según tus valoraciones');
    expect(ficha.recommended).toEqual(analysis.auto.recommended.slice(0, 12));
    expect(ficha.texts.join(' ')).toMatch(/sugerida por la estimación automática/);
    expect(ficha.avoid).toEqual([]);
    expect(ficha.texts.join(' ')).toMatch(/una estimación automática a partir de tu foto/);
    expect(ficha.texts.filter((t) => NONSENSE.test(t))).toEqual([]);
    save(`${testInfo.project.name}--ficha-solo-estimacion.jpg`, Buffer.from(preview.src.split(',')[1], 'base64'));
  });

  test('solo piel (sin cabello ni ojos): contraste e intensidad salen «Sin datos», no inventados', async ({ page, api }) => {
    await api.features(session.id, { skin: FACE.skin, hair: null, eyes: null });
    await openSession(page, session.id);
    await openReport(page);
    await previewInfo(page);
    const ficha = await fichaContent(page, colors);
    expect(ficha.axisTexts.filter((t) => /^Sin datos/.test(t)).length, `textos de ejes: ${ficha.axisTexts.join(' | ')}`).toBeGreaterThanOrEqual(2);
    expect(ficha.axisTexts.filter((t) => t === 'Estimado por la foto')).toHaveLength(2);
    expect(ficha.axisTexts.filter((t) => /\d\s*%/.test(t))).toEqual([]);
    expect(ficha.texts.filter((t) => NONSENSE.test(t))).toEqual([]);
  });

  test('sin foto: la ficha se genera igual, con un hueco y una nota', async ({ page, api }, testInfo) => {
    await api.rateAllFor(session.id, 'otono-calido');
    await openSession(page, session.id);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeEnabled();
    await expect(page.getByTestId('report-final-status')).toContainText(/Sin foto/);
    const preview = await previewInfo(page);
    const ficha = await fichaContent(page, colors);
    expect(ficha.hasPhoto).toBe(false);
    expect(ficha.texts).toContain('Sin foto');
    expect(ficha.texts.join(' ')).toMatch(/Añade una en «Probar colores»/);
    expect(ficha.texts).toContain('Otoño Cálido');
    const jpeg = Buffer.from(preview.src.split(',')[1], 'base64');
    const image = await readImage(page, jpeg, [[(64 + 30) / 1654, (64 + 500) / 2339]], 'image/jpeg');
    expect(closeTo(image.pixels[0], '#CFC7BD', 8), 'hueco neutro donde iría la foto').toBe(true);
    save(`${testInfo.project.name}--ficha-sin-foto.jpg`, jpeg);
    const { buffer } = await downloadPdf(page);
    expect(inspectPdf(buffer).problems).toEqual([]);
  });

  test('sin valoraciones ni estimación: botón deshabilitado y se dice qué falta', async ({ page }) => {
    await openSession(page, session.id);
    await openReport(page);
    const button = page.getByTestId('report-final-download');
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('data-source', '');
    await expect(page.getByTestId('report-final-preview')).toHaveCount(0);
    const status = page.getByTestId('report-final-status');
    await expect(status).toContainText(/falta/i);
    await expect(status).toContainText(/12 colores/);
    await expect(status).toContainText(/Analizar mi rostro/);
    expect(await button.getAttribute('aria-describedby')).toBe('report-final-status');
    expect(await page.evaluate(() => (window.__fichas ?? []).length)).toBe(0);
  });

  test('con foto pero sin estación sigue deshabilitado; con 11 valoraciones dice que falta 1', async ({ page, api }) => {
    for (const color of colors.slice(0, 11)) await api.rate(session.id, color.id, 3);
    await openSession(page, session.id);
    await uploadPhoto(page);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeDisabled();
    await expect(page.getByTestId('report-final-status')).toContainText(/1 color más/);
    await expect(page.getByTestId('report-final-preview')).toHaveCount(0);
  });

  test('con estimación y valoraciones insuficientes usa la estimación y dice cuántos colores faltan', async ({ page, api }) => {
    await api.features(session.id, FEATURES);
    for (const color of colors.slice(0, 5)) await api.rate(session.id, color.id, 3);
    await openSession(page, session.id);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toHaveAttribute('data-source', 'auto');
    await expect(page.getByTestId('report-final-status')).toContainText(/7 colores más/);
    const ficha = await fichaContent(page, colors);
    expect(ficha.texts).toContain('Tu estación estimada');
    expect(ficha.headTexts.join(' ')).toMatch(/no de tus valoraciones/);
  });
});

test.describe('ficha final: nunca recomienda lo que la persona valoró mal', () => {
  test('con estación por valoraciones, ningún color < 40 aparece como recomendado', async ({ page, api }) => {
    for (const color of colors) {
      const value = color.id === 'petroleo' || color.id === 'berenjena' ? 1 : color.seasons.includes('otono-profundo') ? 3 : 0;
      await api.rate(session.id, color.id, value);
    }
    const { analysis, ratings } = await api.getSession(session.id);
    expect(analysis.top.id).toBe('otono-profundo');
    const bad = new Set(ratings.filter((r) => r.score < 40).map((r) => r.colorId));
    await openSession(page, session.id);
    await openReport(page);
    await previewInfo(page);
    const ficha = await fichaContent(page, colors);
    expect(ficha.recommended.length).toBeGreaterThan(0);
    expect(ficha.recommended.filter((id) => bad.has(id)), 'recomendados valorados < 40').toEqual([]);
    expect(ficha.family.filter((id) => bad.has(id)), '«Tu mejor familia de color» incluye colores que la persona valoró < 40 (y que la misma ficha manda evitar)').toEqual([]);
  });

  test('con estación estimada, los colores que ya valoró < 40 no salen en la paleta recomendada', async ({ page, api }) => {
    await api.features(session.id, FEATURES);
    const suggested = (await api.getSession(session.id)).analysis.auto.recommended;
    const disliked = suggested.slice(0, 3);
    for (const id of disliked) await api.rate(session.id, id, 0);
    await openSession(page, session.id);
    await openReport(page);
    await previewInfo(page);
    const ficha = await fichaContent(page, colors);
    expect(ficha.avoid.sort()).toEqual([...disliked].sort());
    expect(ficha.recommended.filter((id) => disliked.includes(id)), 'colores valorados con 0 % que aparecen como recomendados').toEqual([]);
    expect(ficha.family.filter((id) => disliked.includes(id)), 'colores valorados con 0 % dentro de «Tu mejor familia de color»').toEqual([]);
  });

  test('todo valorado a 0 con estimación: la ficha no presenta como recomendado nada puntuado con 0', async ({ page, api }) => {
    await api.features(session.id, FEATURES);
    for (const color of colors) await api.rate(session.id, color.id, 0);
    await openSession(page, session.id);
    await openReport(page);
    await previewInfo(page);
    const ficha = await fichaContent(page, colors);
    expect(ficha.recommended, 'recomendados pese a estar todos valorados con 0 %').toEqual([]);
  });
});

test.describe('ficha final: descarga en PDF', () => {
  test.beforeEach(async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    await api.features(session.id, FEATURES);
    await openSession(page, session.id);
    await uploadPhoto(page);
    await openReport(page);
    await previewInfo(page);
  });

  test('descarga un PDF válido: cabecera, una página A4, xref coherente y JPEG de 1654×2339', async ({ page }, testInfo) => {
    const { name, buffer } = await downloadPdf(page);
    expect(name).toMatch(/^colorimetria-[a-z0-9]+(-[a-z0-9]+)*-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(name.endsWith(`-${today()}.pdf`)).toBe(true);
    await expect(page.getByTestId('toast')).toContainText(/Informe final descargado/);
    save(`${testInfo.project.name}--informe-final.pdf`, buffer);

    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const pdf = inspectPdf(buffer);
    expect(pdf.problems).toEqual([]);
    expect(pdf.pages).toBe(1);
    expect(pdf.pageCount).toBe(1);
    expect(pdf.mediaBox[0]).toBe(0);
    expect(pdf.mediaBox[1]).toBe(0);
    expect(pdf.mediaBox[2]).toBeCloseTo(595.28, 1); // 210 mm
    expect(pdf.mediaBox[3]).toBeCloseTo(841.89, 1); // 297 mm
    expect(pdf.image).toEqual({ width: 1654, height: 2339, filter: 'DCTDecode', colorSpace: 'DeviceRGB', bits: 8 });
    expect(pdf.contentBody).toMatch(/^q 595\.28 0 0 841\.89 0 0 cm \/Im0 Do Q$/);
    // El JPEG incrustado se decodifica y es la ficha (foto y fondo donde toca).
    const image = await readImage(page, pdf.jpeg, [PHOTO_CENTER, CORNER], 'image/jpeg');
    expect([image.width, image.height]).toEqual([1654, 2339]);
    expect(closeTo(image.pixels[0], FACE.skin, 14)).toBe(true);
    expect(closeTo(image.pixels[1], '#F6F2ED', 6)).toBe(true);
    expect(buffer.length, 'tamaño razonable para enviar por mensajería').toBeLessThan(3_000_000);
    expect(buffer.length).toBeGreaterThan(100_000);
  });

  test('un visor real (pdf.js) lo abre sin errores y pinta la ficha a página completa', async ({ page }, testInfo) => {
    const { buffer } = await downloadPdf(page);
    const view = await rasterize(page, buffer, [PHOTO_CENTER, CORNER, [0.5, 0.999], [0.999, 0.5]]);
    save(`${testInfo.project.name}--informe-final-rasterizado.png`, Buffer.from(view.png, 'base64'));
    expect(view.numPages).toBe(1);
    expect(view.view[2] - view.view[0]).toBeCloseTo(595.28, 1);
    expect(view.view[3] - view.view[1]).toBeCloseTo(841.89, 1);
    expect(view.width / view.height).toBeCloseTo(1654 / 2339, 2);
    expect(view.title).toBe(`Colorimetría personal · ${session.name}`);
    expect(closeTo(view.pixels[0], FACE.skin, 14), `foto en el PDF ${view.pixels[0]}`).toBe(true);
    expect(closeTo(view.pixels[1], '#F6F2ED', 6), `fondo en el PDF ${view.pixels[1]}`).toBe(true);
    // La imagen llega a los bordes: ni márgenes blancos ni recortes.
    expect(closeTo(view.pixels[2], '#F6F2ED', 6), `borde inferior ${view.pixels[2]}`).toBe(true);
    expect(closeTo(view.pixels[3], '#F6F2ED', 6), `borde derecho ${view.pixels[3]}`).toBe(true);
  });

  test('el PDF descargado contiene la misma ficha que la vista previa', async ({ page }) => {
    const preview = await previewInfo(page);
    const points = [PHOTO_CENTER, CORNER, [0.5, 0.45], [0.8, 0.47], [0.3, 0.75], [0.7, 0.9]];
    const shown = await readImage(page, Buffer.from(preview.src.split(',')[1], 'base64'), points, 'image/jpeg');
    const { buffer } = await downloadPdf(page);
    const inside = await readImage(page, inspectPdf(buffer).jpeg, points, 'image/jpeg');
    inside.pixels.forEach((pixel, i) => {
      expect(pixel.every((v, c) => Math.abs(v - shown.pixels[i][c]) <= 14), `punto ${i}: ${pixel} frente a ${shown.pixels[i]}`).toBe(true);
    });
  });

  test('doble clic en descargar no rompe nada y cada descarga es un PDF válido', async ({ page }) => {
    const downloads = [];
    page.on('download', (d) => downloads.push(d));
    await page.getByTestId('report-final-download').dblclick();
    await expect.poll(() => downloads.length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(500);
    for (const d of downloads) expect(inspectPdf(fs.readFileSync(await d.path())).problems).toEqual([]);
  });

  test('el PDF no se envía a ningún servidor', async ({ page }) => {
    const sent = [];
    page.on('request', (request) => { if (request.method() !== 'GET') sent.push(request.url()); });
    await downloadPdf(page);
    expect(sent).toEqual([]);
  });
});

test.describe('ficha final: nombre de archivo y título con nombres difíciles', () => {
  const cases = [
    ['caracteres prohibidos en nombres de archivo', 'a/b\\c:d*e?f"g<h>i|j'],
    ['solo emojis', '🎨🌈✨'],
    ['emojis y texto', 'Luz 🎨 de mañana'],
    ['80 caracteres', 'N'.repeat(80)],
    ['HTML', '<img src=x onerror=alert(1)>'],
    ['tildes y eñe', 'Sesión de Ñandú, mañana'],
    ['puntos y rutas', '../../etc/passwd .. .pdf'],
    ['nombre reservado de Windows', 'CON'],
    ['solo símbolos', '¿¡!?'],
    ['otro alfabeto', '色彩診断'],
  ];
  for (const [label, name] of cases) {
    test(`${label}: el archivo tiene un nombre seguro y el PDF sigue siendo válido`, async ({ page, api }) => {
      const hard = await api.createSession(name);
      await api.features(hard.id, FEATURES);
      await openSession(page, hard.id);
      await openReport(page);
      await previewInfo(page);
      const { name: file, buffer } = await downloadPdf(page);
      expect(file, `nombre generado: ${file}`).toMatch(/^colorimetria-[a-z0-9]+(-[a-z0-9]+)*-\d{4}-\d{2}-\d{2}\.pdf$/);
      expect(file.length).toBeLessThanOrEqual(80);
      const pdf = inspectPdf(buffer);
      expect(pdf.problems).toEqual([]);
      const view = await rasterize(page, buffer, [CORNER]);
      expect(view.numPages).toBe(1);
      expect(view.title, 'el título del documento conserva el nombre tal cual').toBe(`Colorimetría personal · ${name}`);
      // En la ficha el nombre se ve (entero o recortado con «…»), nunca interpretado.
      const ficha = await fichaContent(page, colors);
      const shown = ficha.headTexts.find((t) => t === name || (t.endsWith('…') && name.startsWith(t.slice(0, -1).trimEnd())));
      expect(shown, `el nombre no aparece en la cabecera: ${ficha.headTexts.slice(0, 4).join(' | ')}`).toBeTruthy();
      await api.deleteSession(hard.id);
    });
  }

  test('con tildes el nombre del archivo conserva las letras sin tilde (legible)', async ({ page, api }) => {
    const hard = await api.createSession('Sesión de mañana');
    await api.features(hard.id, FEATURES);
    await openSession(page, hard.id);
    await openReport(page);
    await previewInfo(page);
    const { name } = await downloadPdf(page);
    expect(name).toBe(`colorimetria-sesion-de-manana-${today()}.pdf`);
    await api.deleteSession(hard.id);
  });
});

test.describe('ficha final: se regenera cuando cambian los datos', () => {
  test('cambiar valoraciones pasa de estimación a valoraciones y actualiza la ficha', async ({ page, api }) => {
    await api.features(session.id, FEATURES);
    for (const color of colors.slice(0, 11)) await api.rate(session.id, color.id, 3);
    await openSession(page, session.id);
    await openReport(page);
    const before = await previewInfo(page);
    expect(before.source).toBe('auto');
    await page.getByTestId('tab-try').click();
    await page.getByTestId(`swatch-${colors[11].id}`).click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId(`swatch-${colors[11].id}`)).toHaveAttribute('data-rated', 'true');
    await openReport(page);
    const after = await previewInfo(page);
    expect(after.source).toBe('ratings');
    expect(after.src).not.toBe(before.src);
    await expect(page.getByTestId('report-final-download')).toHaveAttribute('data-source', 'ratings');
    const { analysis } = await api.getSession(session.id);
    const ficha = await fichaContent(page, colors);
    expect(ficha.texts).toContain(analysis.top.name);
    expect(ficha.texts).toContain('Tu estación');
    expect(ficha.recommended).toEqual(analysis.recommended.slice(0, 12));
  });

  test('borrar una valoración por debajo de 12 sin estimación vuelve a deshabilitar la descarga', async ({ page, api }) => {
    for (const color of colors.slice(0, 12)) await api.rate(session.id, color.id, 3);
    await openSession(page, session.id);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeEnabled();
    await page.getByTestId('tab-try').click();
    await page.getByTestId(`swatch-${colors[0].id}`).click();
    await page.getByTestId('rating-delete').click();
    await expect(page.getByTestId(`swatch-${colors[0].id}`)).toHaveAttribute('data-rated', 'false');
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeDisabled();
    await expect(page.getByTestId('report-final-preview')).toHaveCount(0);
    await expect(page.getByTestId('report-final-status')).toContainText(/falta/i);
  });

  test('poner, cambiar y quitar la foto actualiza la ficha', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    await openSession(page, session.id);
    await openReport(page);
    const none = await previewInfo(page);
    expect((await fichaContent(page, colors)).hasPhoto).toBe(false);
    await page.getByTestId('tab-try').click();
    await uploadPhoto(page);
    await openReport(page);
    const withPhoto = await previewInfo(page);
    expect(withPhoto.src).not.toBe(none.src);
    expect((await fichaContent(page, colors)).hasPhoto).toBe(true);
    await expect(page.getByTestId('report-final-status')).not.toContainText(/Sin foto/);
    await page.getByTestId('tab-try').click();
    await uploadPhoto(page, { name: 'verde.png', mimeType: 'image/png', buffer: (await import('./fixtures.js')).makePng(300, 400, () => [20, 160, 60]) });
    await openReport(page);
    const changed = await previewInfo(page);
    expect(changed.src).not.toBe(withPhoto.src);
    const image = await readImage(page, Buffer.from(changed.src.split(',')[1], 'base64'), [PHOTO_CENTER], 'image/jpeg');
    expect(closeTo(image.pixels[0], '#14A03C', 14)).toBe(true);
    await page.getByTestId('tab-try').click();
    await page.getByTestId('photo-remove').click();
    await openReport(page);
    await previewInfo(page);
    expect((await fichaContent(page, colors)).hasPhoto).toBe(false);
    await expect(page.getByTestId('report-final-status')).toContainText(/Sin foto/);
  });

  test('analizar el rostro y quitar la estimación actualizan la ficha y el botón', async ({ page }) => {
    await openSession(page, session.id);
    await uploadPhoto(page);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeDisabled();
    await page.getByTestId('tab-try').click();
    await page.getByTestId('analyze-start').click();
    const { markPoint } = await import('./fixtures.js');
    await markPoint(page, FACE.points.skin);
    await markPoint(page, FACE.points.hair);
    await markPoint(page, FACE.points.eyes);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeEnabled();
    expect((await previewInfo(page)).source).toBe('auto');
    await page.getByTestId('tab-try').click();
    await page.getByTestId('analyze-clear').click();
    await expect(page.getByTestId('analyze-clear')).toBeHidden();
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeDisabled();
    await expect(page.getByTestId('report-final-preview')).toHaveCount(0);
  });

  test('renombrar la sesión con el informe abierto cambia el nombre en la ficha y en el archivo', async ({ page, api }) => {
    await api.features(session.id, FEATURES);
    await openSession(page, session.id);
    await openReport(page);
    const before = await previewInfo(page);
    await page.getByTestId('session-edit-button').click();
    await page.getByTestId('edit-name-input').fill('Nombre cambiado');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('report-title')).toHaveText('Nombre cambiado');
    const after = await previewInfo(page);
    expect(after.src).not.toBe(before.src);
    expect((await fichaContent(page, colors)).headTexts).toContain('Nombre cambiado');
    expect((await downloadPdf(page)).name).toBe(`colorimetria-nombre-cambiado-${today()}.pdf`);
  });

  test('cambiar la altura de la tela regenera el informe y la ficha sigue siendo válida', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    await openSession(page, session.id);
    await uploadPhoto(page);
    await openReport(page);
    await previewInfo(page);
    const built = await page.evaluate(() => window.__fichas.length);
    await page.getByTestId('tab-try').click();
    await page.getByTestId('drape-height').press('End');
    await openReport(page);
    await previewInfo(page);
    expect(await page.evaluate(() => window.__fichas.length), 'el informe se regenera tras mover la altura').toBeGreaterThan(built);
    expect(inspectPdf((await downloadPdf(page)).buffer).problems).toEqual([]);
  });

  test('al cambiar de sesión, la ficha y el botón son los de la sesión nueva', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    const empty = await api.createSession(uniqueName('Vacía'));
    await openSession(page, session.id);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeEnabled();
    await page.getByTestId('back-to-history').click();
    await page.getByTestId(`session-open-${empty.id}`).click();
    await expect(page.getByTestId('session-title')).toHaveText(empty.name);
    await openReport(page);
    await expect(page.getByTestId('report-final-download')).toBeDisabled();
    await expect(page.getByTestId('report-final-preview')).toHaveCount(0);
  });
});

test.describe('«y N más» en colores a evitar', () => {
  test('con más de 8 colores por debajo de 40 se indica cuántos más hay, en Resultados y en el Informe', async ({ page, api }) => {
    const analysis = await api.rateAllFor(session.id, 'invierno-frio');
    expect(analysis.avoidCount).toBeGreaterThan(8);
    const more = analysis.avoidCount - 8;
    await openSession(page, session.id);
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('avoid-list').locator('li[data-color-id]')).toHaveCount(8);
    await expect(page.getByTestId('avoid-more')).toBeVisible();
    await expect(page.getByTestId('avoid-more')).toHaveText(new RegExp(`^y ${more} más\\b`));
    await openReport(page);
    await expect(page.getByTestId('report-avoid').locator('li')).toHaveCount(8);
    await expect(page.getByTestId('report-avoid-more')).toHaveText(new RegExp(`^y ${more} más\\b`));
  });

  test('con 8 o menos no aparece, y aparece justo al llegar al noveno', async ({ page, api }) => {
    for (const color of colors.slice(0, 8)) await api.rate(session.id, color.id, 0);
    await openSession(page, session.id);
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('avoid-list').locator('li[data-color-id]')).toHaveCount(8);
    await expect(page.getByTestId('avoid-more')).toBeHidden();
    await openReport(page);
    await expect(page.getByTestId('report-avoid-more')).toHaveCount(0);
    await page.getByTestId('tab-try').click();
    await page.getByTestId(`swatch-${colors[8].id}`).click();
    await page.getByTestId('rating-even').selectOption('0');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId(`swatch-${colors[8].id}`)).toHaveAttribute('data-rated', 'true');
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('avoid-more')).toHaveText(/^y 1 más\b/);
    await openReport(page);
    await expect(page.getByTestId('report-avoid-more')).toHaveText(/^y 1 más\b/);
  });

  test('sin valoraciones no aparece', async ({ page }) => {
    await openSession(page, session.id);
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('avoid-more')).toBeHidden();
  });
});

test.describe('ficha final: impresión', () => {
  test('al imprimir el informe, la ficha no rompe la página ni se sale del papel', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    await openSession(page, session.id);
    await uploadPhoto(page, faceFile());
    await openReport(page);
    await previewInfo(page);
    await page.setViewportSize({ width: 680, height: 960 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('report-final-download')).toBeHidden();
    await expect(page.getByTestId('report-title')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'en la impresión con ficha');
  });
});
