// Informe imprimible: contenido, cuadrícula de rostro con tela, lámina PNG e impresión.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  test, expect, uniqueName, openSession, uploadPhoto, readImage, closeTo, expectNoHorizontalOverflow, FACE, shot,
} from './fixtures.js';

const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '.artifacts');

let session;
test.beforeEach(async ({ api }) => {
  session = await api.createSession(uniqueName('Informe'), 'Luz natural, 10 de la mañana');
});

async function waitForCellImages(page) {
  await expect.poll(() => page.locator('.drape-cell img').evaluateAll((imgs) => imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0))).toBe(true);
}

/** Píxeles de la imagen de una celda del informe (coordenadas relativas). */
async function cellPixels(page, testId, points) {
  return page.getByTestId(testId).locator('img').evaluate(async (img, points) => {
    await img.decode();
    const canvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      pixels: points.map(([fx, fy]) => Array.from(ctx.getImageData(Math.round(fx * (canvas.width - 1)), Math.round(fy * (canvas.height - 1)), 1, 1).data.slice(0, 3))),
    };
  }, points);
}

test.describe('contenido del informe', () => {
  test('sesión vacía: el informe se genera y explica qué falta', async ({ page }) => {
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-title')).toHaveText(session.name);
    await expect(page.getByTestId('report')).toContainText('Sin estación sugerida todavía');
    await expect(page.getByTestId('report')).toContainText(/Faltan 12 colores/);
    await expect(page.getByTestId('report-notes')).toHaveText('Luz natural, 10 de la mañana');
    await expect(page.getByTestId('report-photo-hint')).toBeVisible();
    await expect(page.getByTestId('report-auto')).toHaveAttribute('data-has-auto', 'false');
    await expect(page.getByTestId('report-disclaimer')).toBeVisible();
    await expect(page.getByTestId('report-table')).toHaveCount(0);
    await expect(page.getByTestId('report-sheet-download')).toBeHidden();
    await expect(page.getByTestId('report-print')).toBeVisible();
  });

  test('sesión completa: estación, paletas y tabla coinciden con el análisis del servidor', async ({ page, api }, testInfo) => {
    const analysis = await api.rateAllFor(session.id, 'verano-frio');
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-season')).toHaveText('Verano Frío');
    await expect(page.getByTestId('report')).toContainText(`Afinidad: ${analysis.top.score}%`);
    await expect(page.getByTestId('report')).toContainText('48 colores valorados');
    expect(await page.getByTestId('report-recommended').locator('li').evaluateAll((n) => n.map((x) => x.dataset.colorId))).toEqual(analysis.recommended);
    expect(await page.getByTestId('report-avoid').locator('li').evaluateAll((n) => n.map((x) => x.dataset.colorId))).toEqual(analysis.avoid);
    const rows = page.getByTestId('report-table').locator('tbody tr');
    await expect(rows).toHaveCount(48);
    const scores = await rows.locator('td.num').evaluateAll((cells) => cells.map((c) => parseInt(c.textContent, 10)));
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await expect(rows.first()).toContainText('Mucho');
    await expect(rows.last()).toContainText('Nada');
    await expectNoHorizontalOverflow(page, 'en el informe');
    await shot(page, testInfo, 'informe-completo', { fullPage: true });
  });

  test('la tabla distingue «No sé» de «Nada»', async ({ page, api }) => {
    await api.rate(session.id, 'negro', { even: 3, eyes: null, shadows: 0, harmony: 1 });
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    const cells = await page.getByTestId('report-table').locator('tbody tr').first().locator('td').allTextContents();
    expect(cells).toEqual(['#171719', 'Mucho', 'No sé', 'Nada', 'Poco', '44%']);
  });

  test('el informe se actualiza al volver tras cambiar valoraciones, nombre o notas', async ({ page, api }) => {
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report')).toContainText('0 colores valorados');
    await page.getByTestId('tab-try').click();
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'true');
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report')).toContainText('1 color valorado');
    await expect(page.getByTestId('report-table').locator('tbody tr')).toHaveCount(1);
    // Editar con el informe abierto lo refresca en el acto.
    await page.getByTestId('session-edit-button').click();
    await page.getByTestId('edit-name-input').fill('Nombre nuevo del informe');
    await page.getByTestId('edit-notes-input').fill('Notas nuevas');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('report-title')).toHaveText('Nombre nuevo del informe');
    await expect(page.getByTestId('report-notes')).toHaveText('Notas nuevas');
  });

  test('incluye la estimación automática cuando existe', async ({ page, api }) => {
    await api.features(session.id, { skin: FACE.skin, hair: FACE.hair, eyes: FACE.eyes });
    const { analysis } = await api.getSession(session.id);
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-auto')).toHaveAttribute('data-has-auto', 'true');
    await expect(page.getByTestId('report-auto-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
    await expect(page.getByTestId('report-auto-seasons').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('report-auto-seasons').locator('li').first()).toContainText(analysis.auto.seasons[0].name);
    await expect(page.getByTestId('report-auto').locator('button')).toHaveCount(0);
  });
});

test.describe('prueba de drapeado sobre la foto', () => {
  test('con foto y estación sugerida: una celda por color recomendado (máx. 8) con el rostro arriba y la tela abajo', async ({ page, api }, testInfo) => {
    const analysis = await api.rateAllFor(session.id, 'invierno-frio');
    const { colors } = await api.colors();
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape')).toHaveAttribute('data-has-photo', 'true');
    await expect(page.getByTestId('report-drape-origin')).toHaveAttribute('data-origin', 'ratings');
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
    const expected = analysis.recommended.slice(0, 8);
    expect(expected.length).toBeGreaterThanOrEqual(4);
    const shown = await page.getByTestId('report-drape-grid').locator('figure').evaluateAll((n) => n.map((x) => x.dataset.colorId));
    expect(shown).toEqual(expected);
    await waitForCellImages(page);
    for (const id of expected) {
      const color = colors.find((c) => c.id === id);
      const cell = page.getByTestId(`report-drape-cell-${id}`);
      await expect(cell).toBeVisible();
      await expect(cell.locator('figcaption')).toContainText(color.name);
      await expect(cell.locator('figcaption')).toContainText(color.hex.toUpperCase());
      await expect(cell.locator('img')).toHaveAttribute('alt', new RegExp(color.name));
      const image = await cellPixels(page, `report-drape-cell-${id}`, [[0.5, 0.95], [0.5, 0.02], [0.5, 0.5]]);
      expect([image.width, image.height]).toEqual([480, 360]);
      expect(closeTo(image.pixels[0], color.hex), `tela de ${id}: ${image.pixels[0]}`).toBe(true);
      expect(closeTo(image.pixels[1], FACE.hair, 12), `cabello en la celda de ${id}: ${image.pixels[1]}`).toBe(true);
      expect(closeTo(image.pixels[2], FACE.skin, 12), `piel en la celda de ${id}: ${image.pixels[2]}`).toBe(true);
    }
    // Colores a evitar para comparar (máx. 4).
    const avoid = analysis.avoid.slice(0, 4);
    expect(await page.getByTestId('report-avoid-grid').locator('figure').evaluateAll((n) => n.map((x) => x.dataset.colorId))).toEqual(avoid);
    await expect(page.getByTestId('report-sheet-download')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'en el informe con cuadrícula');
    await shot(page, testInfo, 'informe-con-rostro', { fullPage: true });
  });

  test('con foto pero sin recomendados lo explica y no ofrece la lámina', async ({ page }) => {
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape-empty')).toBeVisible();
    await expect(page.getByTestId('report-drape-grid')).toHaveCount(0);
    await expect(page.getByTestId('report-sheet-download')).toBeHidden();
  });

  test('con foto y solo estimación automática usa los colores sugeridos y lo indica', async ({ page, api }) => {
    await api.features(session.id, { skin: FACE.skin, hair: FACE.hair, eyes: FACE.eyes });
    const { analysis } = await api.getSession(session.id);
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape-origin')).toHaveAttribute('data-origin', 'auto');
    const shown = await page.getByTestId('report-drape-grid').locator('figure').evaluateAll((n) => n.map((x) => x.dataset.colorId));
    expect(shown).toEqual(analysis.auto.recommended.slice(0, 8));
  });

  test('quitar la foto con el informe generado retira la cuadrícula al volver', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
    await page.getByTestId('tab-try').click();
    await page.getByTestId('photo-remove').click();
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape-grid')).toHaveCount(0);
    await expect(page.getByTestId('report-photo-hint')).toBeVisible();
    await expect(page.getByTestId('report-sheet-download')).toBeHidden();
  });

  test('tras recargar, el informe abierto justo después sigue incluyendo la foto guardada', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'invierno-frio');
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.reload();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
  });

  test('la cuadrícula usa la altura de tela que la persona ha dejado ajustada', async ({ page, api }) => {
    const analysis = await api.rateAllFor(session.id, 'invierno-frio');
    const id = analysis.recommended[0];
    const { colors } = await api.colors();
    const hex = colors.find((c) => c.id === id).hex;
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.getByTestId('drape-height').press('Home'); // tela baja (15 %)
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    let image = await cellPixels(page, `report-drape-cell-${id}`, [[0.5, 0.6]]);
    expect(closeTo(image.pixels[0], FACE.skin, 12), 'con la tela baja, a media altura se ve la piel').toBe(true);
    await page.getByTestId('tab-try').click();
    await page.getByTestId('drape-height').press('End'); // tela alta (65 %)
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    image = await cellPixels(page, `report-drape-cell-${id}`, [[0.5, 0.6]]);
    expect(closeTo(image.pixels[0], hex), `tras subir la tela, el informe sigue con la altura anterior: ${image.pixels[0]}`).toBe(true);
  });

  test('«Descargar lámina (PNG)» descarga una imagen con el nombre de la sesión, el rostro y los colores', async ({ page, api }, testInfo) => {
    const analysis = await api.rateAllFor(session.id, 'invierno-frio');
    const { colors } = await api.colors();
    await openSession(page, session.id);
    await uploadPhoto(page);
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-sheet-download').click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^lamina-colorimetria-sesion-${session.id}-\\d{8}-\\d{6}\\.png$`));
    const buffer = fs.readFileSync(await download.path());
    fs.mkdirSync(path.join(ARTIFACTS, 'screens'), { recursive: true });
    fs.writeFileSync(path.join(ARTIFACTS, 'screens', `${testInfo.project.name}--lamina.png`), buffer);
    // Geometría documentada: 4 columnas de 480×360 con 24 px de separación y cabecera de 150 px.
    const first = colors.find((c) => c.id === analysis.recommended[0]);
    const fifth = colors.find((c) => c.id === analysis.recommended[4]);
    const image = await readImage(page, buffer, []);
    expect(image.width).toBe(4 * 480 + 5 * 24);
    expect(image.height).toBeGreaterThan(150 + 2 * 360);
    const at = (x, y) => [x / (image.width - 1), y / (image.height - 1)];
    const cell = (col, row) => ({ x: 24 + col * (480 + 24), y: 150 + row * (360 + 64 + 24) });
    const c0 = cell(0, 0);
    const c4 = cell(0, 1);
    const sampled = await readImage(page, buffer, [
      at(c0.x + 240, c0.y + 340), at(c0.x + 240, c0.y + 6), at(c0.x + 240, c0.y + 180),
      at(c4.x + 240, c4.y + 340), at(5, 5),
    ]);
    expect(closeTo(sampled.pixels[0], first.hex), `tela 1.ª celda ${sampled.pixels[0]}`).toBe(true);
    expect(closeTo(sampled.pixels[1], FACE.hair, 12), `cabello 1.ª celda ${sampled.pixels[1]}`).toBe(true);
    expect(closeTo(sampled.pixels[2], FACE.skin, 12), `piel 1.ª celda ${sampled.pixels[2]}`).toBe(true);
    expect(closeTo(sampled.pixels[3], fifth.hex), `tela 5.ª celda ${sampled.pixels[3]}`).toBe(true);
    expect(closeTo(sampled.pixels[4], '#FFFDF9', 3)).toBe(true);
    await expect(page.getByTestId('toast')).toContainText(/Lámina descargada/);
  });
});

test.describe('impresión', () => {
  async function prepare(page, api) {
    await api.rateAllFor(session.id, 'invierno-frio');
    await api.features(session.id, { skin: FACE.skin, hair: FACE.hair, eyes: FACE.eyes });
    await openSession(page, session.id);
    await uploadPhoto(page);
  }

  test('al imprimir desde el informe solo se ve el informe: sin cabecera, pestañas ni botones', async ({ page, api }, testInfo) => {
    await prepare(page, api);
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('report')).toBeVisible();
    await expect(page.getByTestId('report-title')).toBeVisible();
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
    await expect(page.getByTestId('report-table')).toBeVisible();
    await expect(page.getByTestId('report-disclaimer')).toBeVisible();
    for (const hidden of ['report-print', 'report-sheet-download', 'tab-try', 'tab-results', 'report-button', 'back-to-history', 'session-edit-button', 'panel-try', 'panel-results', 'toast']) {
      await expect(page.getByTestId(hidden), `${hidden} no debe imprimirse`).toBeHidden();
    }
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.getByTestId('report').locator('button')).toHaveCount(0);
    await shot(page, testInfo, 'impresion-informe', { fullPage: true });
  });

  test('los colores del informe se imprimen aunque el navegador no imprima fondos', async ({ page, api }) => {
    await prepare(page, api);
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    await page.emulateMedia({ media: 'print' });
    const economy = await page.getByTestId('report').evaluate((report) => {
      const out = [];
      const check = (selector, label) => {
        for (const node of report.querySelectorAll(selector)) {
          const style = getComputedStyle(node);
          const hasColor = style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none';
          if (hasColor && style.printColorAdjust !== 'exact') { out.push(label); break; }
        }
      };
      check('.color-chip .dot', 'muestras de las paletas recomendada / a evitar');
      check('.cell-color .dot', 'muestras de la tabla de puntuaciones');
      check('[data-testid^="report-auto-swatch-"] .dot', 'muestras de piel, cabello y ojos');
      check('.bar span', 'barras de afinidad de la estimación automática');
      return out;
    });
    expect(economy, 'elementos cuyo color desaparece al imprimir sin «gráficos de fondo»').toEqual([]);
  });

  test('en papel la cuadrícula va a 4 por fila y nada se sale del ancho de la página', async ({ page, api }) => {
    await prepare(page, api);
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    await page.setViewportSize({ width: 680, height: 960 }); // ≈ A4 con márgenes de 16 mm
    await page.emulateMedia({ media: 'print' });
    const tops = await page.getByTestId('report-drape-grid').locator('figure').evaluateAll((n) => n.map((x) => Math.round(x.getBoundingClientRect().top)));
    expect(new Set(tops.slice(0, 4)).size, 'las 4 primeras celdas van en la misma fila').toBe(1);
    expect(tops[4]).toBeGreaterThan(tops[0]);
    await expectNoHorizontalOverflow(page, 'en la vista de impresión');
    const table = await page.getByTestId('report-table').evaluate((t) => ({ right: t.getBoundingClientRect().right, width: document.documentElement.clientWidth }));
    expect(table.right, 'la tabla de puntuaciones se corta por la derecha al imprimir').toBeLessThanOrEqual(table.width + 1);
  });

  test('imprimir desde «Probar colores» (Ctrl+P) también saca el informe, ya generado', async ({ page, api }) => {
    await prepare(page, api);
    await expect(page.getByTestId('panel-try')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); // lo que dispara el navegador al imprimir
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('report')).toBeVisible();
    await expect(page.getByTestId('report-title')).toHaveText(session.name);
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
    await expect(page.getByTestId('panel-try')).toBeHidden();
  });

  test('el botón «Imprimir o guardar como PDF» abre la impresión del navegador', async ({ page, api }) => {
    await api.rate(session.id, 'negro', 3);
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.getByTestId('report-print').click();
    expect(await page.evaluate(() => window.__printed)).toBe(1);
  });

  test('se genera un PDF real del informe con contenido en todas sus páginas', async ({ page, api }, testInfo) => {
    await prepare(page, api);
    await page.getByTestId('report-button').click();
    await waitForCellImages(page);
    const file = path.join(ARTIFACTS, 'screens', `${testInfo.project.name}--informe.pdf`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const pdf = await page.pdf({ path: file, format: 'A4', printBackground: false });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThanOrEqual(1);
    expect(pages, 'el informe ocupa demasiadas páginas').toBeLessThanOrEqual(6);
  });

  test('desde el historial la impresión no queda en blanco', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('history-view')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('history-view')).toBeVisible();
  });
});
