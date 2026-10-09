// Permiso de cámara denegado: este proyecto se lanza SIN --use-fake-ui-for-media-stream,
// así que el navegador rechaza getUserMedia como cuando la persona pulsa «Bloquear».
import { test, expect, uniqueName, openSession, uploadPhoto, rateViaUi, shot } from './fixtures.js';

test.beforeEach(async ({ page, api }) => {
  const session = await api.createSession(uniqueName('Sin permiso'));
  await openSession(page, session.id);
});

test('al denegar el permiso se explica qué hacer y la app sigue utilizable', async ({ page }, testInfo) => {
  await page.getByTestId('camera-start').click();
  const status = page.getByTestId('camera-status');
  await expect(status).toContainText(/permiso/i);
  await expect(status).toContainText(/Subir foto/);
  await expect(status).toBeVisible();
  await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
  await expect(page.getByTestId('camera-start'), 'debe poder reintentarse').toBeEnabled();
  await expect(page.getByTestId('camera-stop')).toBeDisabled();
  await expect(page.getByTestId('photo-take')).toBeDisabled();
  await expect(page.locator('#video')).toBeHidden();
  expect(await page.locator('#video').evaluate((v) => v.srcObject)).toBeNull();
  await shot(page, testInfo, 'permiso-denegado');
});

test('el mensaje de permiso denegado se lee entero y no queda tapado por la tela', async ({ page }) => {
  await page.getByTestId('camera-start').click();
  const status = page.getByTestId('camera-status');
  await expect(status).toContainText(/permiso/i);
  const overlap = await page.evaluate(() => {
    const text = document.getElementById('stage-placeholder').getBoundingClientRect();
    const stage = document.getElementById('stage').getBoundingClientRect();
    const height = Number(document.getElementById('drape-height').value) / 100;
    const clothTop = stage.top + stage.height * (1 - height);
    return { textBottom: Math.round(text.bottom), clothTop: Math.round(clothTop), stageBottom: Math.round(stage.bottom) };
  });
  expect(overlap.textBottom, `el texto llega a ${overlap.textBottom}px y la tela empieza en ${overlap.clothTop}px`).toBeLessThanOrEqual(overlap.clothTop);
});

test('tras denegar se puede reintentar sin que se acumulen errores', async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('camera-start').click();
    await expect(page.getByTestId('camera-status')).toContainText(/permiso/i);
    await expect(page.getByTestId('camera-start')).toBeEnabled();
  }
});

test('sin cámara se puede subir una foto, probar colores, valorar y capturar', async ({ page }) => {
  await page.getByTestId('camera-start').click();
  await expect(page.getByTestId('camera-status')).toContainText(/permiso/i);
  await uploadPhoto(page);
  await expect(page.getByTestId('photo-canvas')).toBeVisible();
  await expect(page.getByTestId('camera-status')).toBeHidden();
  await rateViaUi(page, 'terracota', 3);
  await expect(page.getByTestId('my-palette-chip-terracota')).toHaveAttribute('data-group', 'good');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('capture-button').click()]);
  expect(download.suggestedFilename()).toMatch(/^colorimetria-terracota-/);
});

test('sin cámara ni foto, la tela virtual sigue funcionando sobre fondo neutro', async ({ page }) => {
  await page.getByTestId('camera-start').click();
  await expect(page.getByTestId('camera-status')).toContainText(/permiso/i);
  await page.getByTestId('swatch-cobalto').click();
  await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'cobalto');
  const painted = await page.getByTestId('drape-canvas').evaluate((c) => {
    const d = c.getContext('2d').getImageData(Math.round(c.width / 2), Math.round(c.height * 0.95), 1, 1).data;
    return Array.from(d);
  });
  expect(painted[3]).toBeGreaterThan(200);
  expect(painted[2]).toBeGreaterThan(painted[0]);
});
