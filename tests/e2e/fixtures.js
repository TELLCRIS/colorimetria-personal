// Utilidades compartidas por las pruebas end-to-end.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCREENS = path.join(here, '.artifacts', 'screens');

export { expect };

/**
 * `page` vigilada: cualquier error de consola, excepción o diálogo nativo hace fallar la prueba,
 * salvo los que la propia prueba declare esperados con `allowedErrors.push(/regex/)`.
 */
export const test = base.extend({
  allowedErrors: async ({}, use) => { await use([]); },

  page: async ({ page, allowedErrors }, use) => {
    const problems = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console.error: ${message.text()} (${message.location().url ?? ''})`);
    });
    page.on('pageerror', (error) => problems.push(`excepción no capturada: ${error.message}`));
    page.on('dialog', async (dialog) => {
      problems.push(`diálogo nativo inesperado (${dialog.type()}): ${dialog.message()}`);
      await dialog.dismiss().catch(() => {});
    });
    await use(page);
    const unexpected = problems.filter((text) => !allowedErrors.some((rx) => rx.test(text)));
    expect(unexpected, 'errores de consola o excepciones durante la prueba').toEqual([]);
  },

  /** Atajos de la API para preparar datos sin pasar por la interfaz. */
  api: async ({ request }, use) => {
    const json = async (res) => {
      if (!res.ok()) throw new Error(`API ${res.url()} → ${res.status()} ${await res.text()}`);
      return res.status() === 204 ? null : res.json();
    };
    const api = {
      colors: async () => json(await request.get('/api/colors')),
      createSession: async (name, notes) => (await json(await request.post('/api/sessions', { data: notes === undefined ? { name } : { name, notes } }))).session,
      getSession: async (id) => json(await request.get(`/api/sessions/${id}`)),
      sessionStatus: async (id) => (await request.get(`/api/sessions/${id}`)).status(),
      listSessions: async () => (await json(await request.get('/api/sessions'))).sessions,
      deleteSession: async (id) => json(await request.delete(`/api/sessions/${id}`)),
      rate: async (id, colorId, value) => json(await request.put(`/api/sessions/${id}/ratings/${colorId}`, {
        data: typeof value === 'object' && value !== null ? value : { even: value, eyes: value, shadows: value, harmony: value },
      })),
      features: async (id, features) => json(await request.put(`/api/sessions/${id}/features`, { data: features })),
      /** Valora las 48 dejando clara una estación: 3 a sus colores, 0 al resto. */
      rateAllFor: async (id, seasonId) => {
        const { colors } = await api.colors();
        for (const color of colors) await api.rate(id, color.id, color.seasons.includes(seasonId) ? 3 : 0);
        return (await api.getSession(id)).analysis;
      },
    };
    await use(api);
  },
});

let counter = 0;
export const uniqueName = (prefix = 'Sesión') => `${prefix} ${Date.now().toString(36)}-${process.pid}-${++counter}`;

/** Abre la app y entra en la sesión desde el historial, como haría la persona. */
export async function openSession(page, id) {
  await page.goto('/');
  await page.getByTestId(`session-open-${id}`).click();
  await expect(page.getByTestId('session-view')).toBeVisible();
  await expect(page.getByTestId('swatches').locator('button').first()).toBeVisible();
}

export async function createSessionViaUi(page, name, notes) {
  await page.goto('/');
  await page.getByTestId('session-name-input').fill(name);
  if (notes !== undefined) await page.getByTestId('session-notes-input').fill(notes);
  await page.getByTestId('new-session-button').click();
  await expect(page.getByTestId('session-view')).toBeVisible();
  return Number(await page.evaluate(() => localStorage.getItem('colorimetria.sessionId')));
}

/** Valora el color con la interfaz: elige la muestra, rellena los 4 criterios y guarda. */
export async function rateViaUi(page, colorId, values) {
  const v = typeof values === 'object' ? values : { even: values, eyes: values, shadows: values, harmony: values };
  await page.getByTestId(`swatch-${colorId}`).click();
  await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', colorId);
  for (const key of ['even', 'eyes', 'shadows', 'harmony']) {
    await page.getByTestId(`rating-${key}`).selectOption(v[key] == null ? '' : String(v[key]));
  }
  await page.getByTestId('rating-save').click();
  await expect(page.getByTestId(`swatch-${colorId}`)).toHaveAttribute('data-rated', 'true');
}

// --- Imágenes ---------------------------------------------------------------

/** PNG RGB sin dependencias. `pixel(x, y)` devuelve [r, g, b]. */
export function makePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 2; header[10] = 0; header[11] = 0; header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** "Rostro" sintético: franja de cabello arriba, piel debajo y dos ojos. Colores planos y conocidos. */
export const FACE = {
  skin: '#E8C4A8', hair: '#3B2A20', eyes: '#5B7FA6',
  points: { skin: [0.5, 0.65], hair: [0.5, 0.1], eyes: [0.35, 0.425] },
};
export function facePng(width = 600, height = 800) {
  const skin = rgb(FACE.skin), hair = rgb(FACE.hair), eyes = rgb(FACE.eyes);
  return makePng(width, height, (x, y) => {
    const fx = x / width, fy = y / height;
    if (fy < 0.25) return hair;
    if (fy > 0.38 && fy < 0.47 && ((fx > 0.27 && fx < 0.43) || (fx > 0.57 && fx < 0.73))) return eyes;
    return skin;
  });
}
export const faceFile = (width, height) => ({ name: 'rostro.png', mimeType: 'image/png', buffer: facePng(width, height) });

export async function uploadPhoto(page, file = faceFile()) {
  await page.getByTestId('photo-file-input').setInputFiles(file);
  await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
}

/** Marca un punto del lienzo de análisis en coordenadas relativas (0..1). */
export async function markPoint(page, [fx, fy], { tap = false } = {}) {
  const canvas = page.getByTestId('analyze-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const position = { x: Math.round(box.width * fx), y: Math.round(box.height * fy) };
  if (tap) await canvas.tap({ position });
  else await canvas.click({ position });
}

/** Decodifica una imagen (PNG/JPEG) en el navegador y devuelve tamaño y píxeles en puntos relativos. */
export async function readImage(page, buffer, points = [], mime = 'image/png') {
  return page.evaluate(async ({ b64, points, mime }) => {
    const blob = await (await fetch(`data:${mime};base64,${b64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      pixels: points.map(([fx, fy]) => Array.from(ctx.getImageData(
        Math.round(fx * (bitmap.width - 1)), Math.round(fy * (bitmap.height - 1)), 1, 1).data.slice(0, 3))),
    };
  }, { b64: buffer.toString('base64'), points, mime });
}

/** Píxeles de un <canvas> de la página en puntos relativos. */
export async function canvasPixels(page, testId, points) {
  return page.getByTestId(testId).evaluate((canvas, points) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return {
      width: canvas.width,
      height: canvas.height,
      pixels: points.map(([fx, fy]) => Array.from(ctx.getImageData(
        Math.round(fx * (canvas.width - 1)), Math.round(fy * (canvas.height - 1)), 1, 1).data)),
    };
  }, points);
}

export const hexToRgb = rgb;
export const isReddish = ([r, , b]) => r > b + 60;
export const isBluish = ([r, , b]) => b > r + 60;
/** La tela lleva un sombreado suave: se acepta el color con una tolerancia amplia por canal. */
export function closeTo(pixel, hex, tolerance = 48) {
  const target = rgb(hex);
  return pixel.slice(0, 3).every((value, i) => Math.abs(value - target[i]) <= tolerance);
}

/** Foto guardada en IndexedDB para una sesión: tamaño en bytes, o null si no hay. */
export async function storedPhotoSize(page, sessionId) {
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const open = indexedDB.open('colorimetria', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('photos');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('photos', 'readonly').objectStore('photos').get(Number(id));
      request.onsuccess = () => { db.close(); resolve(request.result ? request.result.size : null); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }), sessionId);
}

// --- Maquetación --------------------------------------------------------------

/** Comprueba que la página no se desborda en horizontal y lista los elementos culpables. */
export async function expectNoHorizontalOverflow(page, label = '') {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const vw = doc.clientWidth;
    const clippedByAncestor = (node) => {
      for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          const r = p.getBoundingClientRect();
          if (r.right <= vw + 1 && r.left >= -1) return true;
        }
      }
      return false;
    };
    const offenders = [];
    for (const node of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.position === 'fixed') continue;
      if (node.closest('.sr-only, dialog:not([open]), [hidden]')) continue;
      const r = node.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Solo cuenta lo que sobresale por la derecha: es lo que provoca desplazamiento horizontal.
      if (r.right > vw + 1 && r.left < vw && !clippedByAncestor(node)) {
        offenders.push(`${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${node.dataset.testid ? `[${node.dataset.testid}]` : ''}.${String(node.className).slice(0, 30)} → ${Math.round(r.left)}..${Math.round(r.right)} de ${vw}`);
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: vw, bodyScrollWidth: document.body.scrollWidth, offenders: offenders.slice(0, 8) };
  });
  expect(result.offenders, `elementos que se salen de la pantalla ${label}`).toEqual([]);
  expect(result.scrollWidth, `desborde horizontal del documento ${label}`).toBeLessThanOrEqual(result.clientWidth + 1);
}

/** Todo control visible del contenedor mide al menos `min` px en ambos ejes (objetivo táctil). */
export async function expectTouchTargets(page, containerTestId, min = 40) {
  const small = await page.getByTestId(containerTestId).evaluate((root, min) => {
    const out = [];
    for (const node of root.querySelectorAll('button, select, input:not([type=file]):not(.sr-only), a[href]')) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || node.closest('[hidden]')) continue;
      let r = node.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Casillas y radios: cuenta el <label> que los envuelve, que es lo que se pulsa.
      if (node.matches('input[type=checkbox], input[type=radio]') && node.closest('label')) r = node.closest('label').getBoundingClientRect();
      if (r.width < min || r.height < min) out.push(`${node.dataset.testid || node.id || node.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return out;
  }, min);
  expect(small, `controles demasiado pequeños para el dedo en ${containerTestId}`).toEqual([]);
}

export async function shot(page, testInfo, name, options = {}) {
  fs.mkdirSync(SCREENS, { recursive: true });
  const file = path.join(SCREENS, `${testInfo.project.name}--${name}.png`);
  // Las capturas de página entera se hacen a escala CSS: a 3× superan el tiempo límite en páginas largas.
  await page.screenshot({ path: file, timeout: 30_000, ...(options.fullPage ? { scale: 'css' } : {}), ...options });
  return file;
}
