// Cámara en vivo (dispositivo falso: mitad izquierda roja, mitad derecha azul), espejo, foto y captura PNG.
import {
  test, expect, uniqueName, openSession, readImage, canvasPixels, isReddish, isBluish, closeTo,
  storedPhotoSize, shot,
} from './fixtures.js';

const TOP_LEFT = [0.15, 0.15];
const TOP_RIGHT = [0.85, 0.15];

async function startCamera(page) {
  await page.getByTestId('camera-start').click();
  await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'camera');
  await expect.poll(() => page.locator('#video').evaluate((v) => v.videoWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.locator('#video').evaluate((v) => v.readyState)).toBeGreaterThanOrEqual(2);
}

/** Lo que la persona ve en el escenario: captura real de pantalla de esa zona. */
async function stageScreenshotPixels(page, points) {
  const buffer = await page.getByTestId('drape-stage').screenshot();
  return (await readImage(page, buffer, points)).pixels;
}

test.beforeEach(async ({ page, api }) => {
  const session = await api.createSession(uniqueName('Cámara'));
  test.info().annotations.push({ type: 'sessionId', description: String(session.id) });
  await openSession(page, session.id);
});
const sessionId = () => Number(test.info().annotations.find((a) => a.type === 'sessionId').description);

test.describe('cámara en vivo', () => {
  test('antes de activar: no se pide la cámara, hay texto de ayuda y «Tomar foto» está deshabilitado', async ({ page }) => {
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    await expect(page.getByTestId('camera-status')).toBeVisible();
    await expect(page.getByTestId('camera-status')).not.toBeEmpty();
    await expect(page.getByTestId('camera-start')).toBeEnabled();
    await expect(page.getByTestId('camera-stop')).toBeDisabled();
    await expect(page.getByTestId('photo-take')).toBeDisabled();
    await expect(page.getByTestId('camera-insecure')).toBeHidden();
    expect(await page.locator('#video').evaluate((v) => v.srcObject)).toBeNull();
  });

  test('«Activar cámara» muestra el vídeo en vivo y habilita apagar y tomar foto', async ({ page }, testInfo) => {
    await startCamera(page);
    await expect(page.locator('#video')).toBeVisible();
    await expect(page.getByTestId('camera-start')).toBeDisabled();
    await expect(page.getByTestId('camera-stop')).toBeEnabled();
    await expect(page.getByTestId('photo-take')).toBeEnabled();
    await expect(page.getByTestId('camera-status')).toBeHidden();
    expect(await page.locator('#video').evaluate((v) => !v.paused && v.srcObject.getVideoTracks()[0].readyState)).toBe('live');
    expect(await page.locator('#video').evaluate((v) => v.srcObject.getAudioTracks().length), 'no debe pedir micrófono').toBe(0);
    await shot(page, testInfo, 'camara-en-vivo');
  });

  test('la vista arranca en espejo: lo que está a la izquierda de la cámara se ve a la derecha', async ({ page }) => {
    await startCamera(page);
    await expect(page.getByTestId('camera-mirror')).toHaveAttribute('aria-pressed', 'true');
    const [left, right] = await stageScreenshotPixels(page, [TOP_LEFT, TOP_RIGHT]);
    expect(isBluish(left), `izquierda en pantalla ${left}`).toBe(true);
    expect(isReddish(right), `derecha en pantalla ${right}`).toBe(true);
  });

  test('«Voltear vista» quita y vuelve a poner el espejo', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('camera-mirror').click();
    await expect(page.getByTestId('camera-mirror')).toHaveAttribute('aria-pressed', 'false');
    let [left, right] = await stageScreenshotPixels(page, [TOP_LEFT, TOP_RIGHT]);
    expect(isReddish(left), `sin espejo, izquierda ${left}`).toBe(true);
    expect(isBluish(right), `sin espejo, derecha ${right}`).toBe(true);
    await page.getByTestId('camera-mirror').click();
    await expect(page.getByTestId('camera-mirror')).toHaveAttribute('aria-pressed', 'true');
    [left, right] = await stageScreenshotPixels(page, [TOP_LEFT, TOP_RIGHT]);
    expect(isBluish(left)).toBe(true);
    expect(isReddish(right)).toBe(true);
  });

  test('la tela se dibuja encima del vídeo con el color elegido', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('swatch-cobalto').click();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'cobalto');
    const [bottom, top] = await stageScreenshotPixels(page, [[0.5, 0.95], TOP_RIGHT]);
    expect(closeTo(bottom, '#2449A8'), `tela ${bottom}`).toBe(true);
    expect(isReddish(top), 'la zona del rostro no debe quedar tapada').toBe(true);
  });

  test('«Apagar cámara» libera la cámara de verdad y vuelve al estado inicial', async ({ page }) => {
    await startCamera(page);
    await page.locator('#video').evaluate((v) => { window.__stream = v.srcObject; });
    await page.getByTestId('camera-stop').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    expect(await page.evaluate(() => window.__stream.getTracks().map((t) => t.readyState))).toEqual(['ended']);
    expect(await page.locator('#video').evaluate((v) => v.srcObject)).toBeNull();
    await expect(page.getByTestId('camera-start')).toBeEnabled();
    await expect(page.getByTestId('camera-stop')).toBeDisabled();
    await expect(page.getByTestId('photo-take')).toBeDisabled();
    await expect(page.getByTestId('camera-status')).toBeVisible();
    await expect(page.getByTestId('camera-status')).not.toBeEmpty();
  });

  test('se puede apagar y volver a activar varias veces', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await startCamera(page);
      await page.getByTestId('camera-stop').click();
      await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    }
    await startCamera(page);
  });

  test('doble clic en «Activar cámara» abre una sola cámara', async ({ page }) => {
    await page.evaluate(() => {
      window.__opened = 0;
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...args) => { window.__opened++; return original(...args); };
    });
    await page.getByTestId('camera-start').dblclick();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'camera');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__opened)).toBe(1);
  });

  for (const [label, leave] of [
    ['cambiar a la pestaña Resultados', (page) => page.getByTestId('tab-results').click()],
    ['abrir el Informe', (page) => page.getByTestId('report-button').click()],
    ['volver al historial', (page) => page.getByTestId('back-to-history').click()],
  ]) {
    test(`la cámara se apaga sola al ${label}`, async ({ page }) => {
      await startCamera(page);
      await page.locator('#video').evaluate((v) => { window.__stream = v.srcObject; });
      await leave(page);
      await expect.poll(() => page.evaluate(() => window.__stream.getTracks().every((t) => t.readyState === 'ended'))).toBe(true);
      await expect(page.getByTestId('drape-stage')).not.toHaveAttribute('data-source', 'camera');
    });
  }

  test('con una sola cámara no se ofrece «Cambiar de cámara»', async ({ page }) => {
    await startCamera(page);
    const cameras = await page.evaluate(async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput').length);
    if (cameras > 1) await expect(page.getByTestId('camera-switch')).toBeVisible();
    else await expect(page.getByTestId('camera-switch')).toBeHidden();
  });
});

test.describe('tomar foto', () => {
  test('«Tomar foto» congela la imagen tal como se ve (en espejo), apaga la cámara y la guarda en el navegador', async ({ page }, testInfo) => {
    await startCamera(page);
    await page.locator('#video').evaluate((v) => { window.__stream = v.srcObject; });
    await page.getByTestId('photo-take').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    await expect(page.getByTestId('photo-canvas')).toBeVisible();
    await expect(page.locator('#video')).toBeHidden();
    expect(await page.evaluate(() => window.__stream.getTracks().every((t) => t.readyState === 'ended'))).toBe(true);
    await expect(page.getByTestId('toast')).toContainText(/Foto tomada/);
    await expect(page.getByTestId('photo-status')).not.toBeEmpty();
    await expect(page.getByTestId('photo-remove')).toBeVisible();
    await expect(page.getByTestId('analyze-start')).toBeEnabled();
    await expect(page.getByTestId('camera-start')).toBeEnabled();

    const photo = await canvasPixels(page, 'photo-canvas', [TOP_LEFT, TOP_RIGHT]);
    expect(photo.width).toBe(640);
    expect(photo.height).toBe(480);
    expect(isBluish(photo.pixels[0]), `foto, izquierda ${photo.pixels[0]}`).toBe(true);
    expect(isReddish(photo.pixels[1]), `foto, derecha ${photo.pixels[1]}`).toBe(true);
    // Y lo que se ve en pantalla coincide con la foto guardada (no se vuelve a voltear).
    const [left, right] = await stageScreenshotPixels(page, [TOP_LEFT, TOP_RIGHT]);
    expect(isBluish(left)).toBe(true);
    expect(isReddish(right)).toBe(true);
    await expect.poll(() => storedPhotoSize(page, sessionId())).toBeGreaterThan(1000);
    await shot(page, testInfo, 'foto-tomada');
  });

  test('con el espejo desactivado, la foto se guarda sin voltear', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('camera-mirror').click();
    await page.getByTestId('photo-take').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    const photo = await canvasPixels(page, 'photo-canvas', [TOP_LEFT, TOP_RIGHT]);
    expect(isReddish(photo.pixels[0])).toBe(true);
    expect(isBluish(photo.pixels[1])).toBe(true);
  });

  test('la foto tomada sigue ahí tras recargar la página', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('photo-take').click();
    await expect.poll(() => storedPhotoSize(page, sessionId())).toBeGreaterThan(1000);
    await page.reload();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    await expect(page.getByTestId('photo-canvas')).toBeVisible();
    const photo = await canvasPixels(page, 'photo-canvas', [TOP_LEFT, TOP_RIGHT]);
    expect(isBluish(photo.pixels[0])).toBe(true);
    expect(isReddish(photo.pixels[1])).toBe(true);
    await expect(page.getByTestId('analyze-start')).toBeEnabled();
  });

  test('«Voltear vista» con una foto fija también voltea lo que se ve (o no se ofrece)', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('photo-take').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    const mirror = page.getByTestId('camera-mirror');
    if (!(await mirror.isVisible()) || !(await mirror.isEnabled())) return; // no ofrecerlo es correcto
    const before = await stageScreenshotPixels(page, [TOP_LEFT, TOP_RIGHT]);
    await mirror.click();
    const after = await stageScreenshotPixels(page, [TOP_LEFT, TOP_RIGHT]);
    expect(isBluish(before[0]) !== isBluish(after[0]), 'el botón «Voltear vista» está activo pero no hace nada visible sobre la foto').toBe(true);
  });

  test('voltear una foto fija la guarda volteada: sigue así tras recargar, en el análisis y en la captura', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('camera-mirror').click(); // sin espejo: rojo a la izquierda
    await page.getByTestId('photo-take').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    await expect.poll(() => storedPhotoSize(page, sessionId())).toBeGreaterThan(1000);
    let photo = await canvasPixels(page, 'photo-canvas', [TOP_LEFT, TOP_RIGHT]);
    expect(isReddish(photo.pixels[0])).toBe(true);
    await expect(page.getByTestId('camera-mirror')).toBeEnabled();
    await page.getByTestId('camera-mirror').click();
    await expect.poll(async () => isBluish((await canvasPixels(page, 'photo-canvas', [TOP_LEFT])).pixels[0])).toBe(true);
    photo = await canvasPixels(page, 'photo-canvas', [TOP_LEFT, TOP_RIGHT]);
    expect(isReddish(photo.pixels[1])).toBe(true);
    expect([photo.width, photo.height]).toEqual([640, 480]);
    const [left] = await stageScreenshotPixels(page, [[0.3, 0.15]]);
    expect(isBluish(left), 'lo que se ve coincide con la foto volteada').toBe(true);
    await page.waitForTimeout(600); // deja terminar el guardado en el navegador
    await page.reload();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    photo = await canvasPixels(page, 'photo-canvas', [TOP_LEFT, TOP_RIGHT]);
    expect(isBluish(photo.pixels[0]), 'tras recargar la foto sigue volteada').toBe(true);
    expect(isReddish(photo.pixels[1])).toBe(true);
    // El análisis trabaja sobre la foto volteada.
    await page.getByTestId('analyze-start').click();
    const analyze = await canvasPixels(page, 'analyze-canvas', [[0.1, 0.9], [0.9, 0.9]]);
    expect(isBluish(analyze.pixels[0])).toBe(true);
    expect(isReddish(analyze.pixels[1])).toBe(true);
    await page.getByTestId('analyze-cancel').click();
    // Voltear dos veces deja la foto como estaba.
    await page.getByTestId('camera-mirror').click();
    await expect.poll(async () => isReddish((await canvasPixels(page, 'photo-canvas', [TOP_LEFT])).pixels[0])).toBe(true);
  });

  test('sin cámara ni foto, «Voltear vista» está deshabilitado', async ({ page }) => {
    await expect(page.getByTestId('camera-mirror')).toBeDisabled();
  });

  test('con una foto puesta, activar la cámara vuelve al vídeo y al apagarla reaparece la foto', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('photo-take').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    await startCamera(page);
    await expect(page.getByTestId('photo-canvas')).toBeHidden();
    await page.getByTestId('camera-stop').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    await expect(page.getByTestId('photo-canvas')).toBeVisible();
  });

  test('«Quitar foto» la elimina de la pantalla y del navegador', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('photo-take').click();
    await expect.poll(() => storedPhotoSize(page, sessionId())).toBeGreaterThan(1000);
    await page.getByTestId('photo-remove').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    await expect(page.getByTestId('photo-canvas')).toBeHidden();
    await expect(page.getByTestId('photo-remove')).toBeHidden();
    await expect(page.getByTestId('analyze-start')).toBeDisabled();
    await expect(page.getByTestId('camera-status')).toBeVisible();
    await expect.poll(() => storedPhotoSize(page, sessionId())).toBeNull();
    await page.reload();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
  });

  test('la foto de una sesión no aparece en otra sesión', async ({ page, api }) => {
    await startCamera(page);
    await page.getByTestId('photo-take').click();
    await expect.poll(() => storedPhotoSize(page, sessionId())).toBeGreaterThan(1000);
    const other = await api.createSession(uniqueName('Otra sin foto'));
    await page.getByTestId('back-to-history').click();
    await page.getByTestId(`session-open-${other.id}`).click();
    await expect(page.getByTestId('session-title')).toHaveText(other.name);
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    await expect(page.getByTestId('photo-canvas')).toBeHidden();
    await expect(page.getByTestId('analyze-start')).toBeDisabled();
  });
});

test.describe('captura PNG', () => {
  async function capture(page) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('capture-button').click()]);
    const fs = await import('node:fs');
    return { name: download.suggestedFilename(), buffer: fs.readFileSync(await download.path()) };
  }

  test('con la cámara en vivo descarga un PNG 1280×960 con el vídeo en espejo y la tela del color', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('swatch-terracota').click();
    const { name, buffer } = await capture(page);
    expect(name).toMatch(/^colorimetria-terracota-\d{8}-\d{6}\.png$/);
    expect(buffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const image = await readImage(page, buffer, [TOP_LEFT, TOP_RIGHT, [0.5, 0.95]]);
    expect([image.width, image.height]).toEqual([1280, 960]);
    expect(isBluish(image.pixels[0]), `captura, izquierda ${image.pixels[0]}`).toBe(true);
    expect(isReddish(image.pixels[1]), `captura, derecha ${image.pixels[1]}`).toBe(true);
    expect(closeTo(image.pixels[2], '#A64F32'), `tela ${image.pixels[2]}`).toBe(true);
    await expect(page.getByTestId('toast')).toContainText(/cámara/);
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'camera');
  });

  test('sin espejo, la captura tampoco va volteada (coincide con lo que se ve)', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('camera-mirror').click();
    const { buffer } = await capture(page);
    const image = await readImage(page, buffer, [TOP_LEFT, TOP_RIGHT]);
    expect(isReddish(image.pixels[0])).toBe(true);
    expect(isBluish(image.pixels[1])).toBe(true);
  });

  test('con una foto tomada, la captura usa la foto de fondo', async ({ page }) => {
    await startCamera(page);
    await page.getByTestId('photo-take').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    await page.getByTestId('swatch-negro').click();
    const { name, buffer } = await capture(page);
    expect(name).toMatch(/^colorimetria-negro-/);
    const image = await readImage(page, buffer, [TOP_LEFT, TOP_RIGHT, [0.5, 0.95]]);
    expect(isBluish(image.pixels[0])).toBe(true);
    expect(isReddish(image.pixels[1])).toBe(true);
    expect(closeTo(image.pixels[2], '#171719')).toBe(true);
    await expect(page.getByTestId('toast')).toContainText(/foto/);
  });

  test('sin cámara ni foto descarga la tela sobre fondo neutro y lo avisa', async ({ page }) => {
    await page.getByTestId('swatch-mostaza').click();
    const { buffer } = await capture(page);
    const image = await readImage(page, buffer, [TOP_LEFT, [0.5, 0.95]]);
    expect([image.width, image.height]).toEqual([1280, 960]);
    expect(closeTo(image.pixels[0], '#CFC7BD', 6), `fondo ${image.pixels[0]}`).toBe(true);
    expect(closeTo(image.pixels[1], '#C49A28')).toBe(true);
    await expect(page.getByTestId('toast')).toContainText(/fondo neutro/);
  });

  test('en modo comparación la captura lleva los dos colores y los dos nombres en el archivo', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('compare-toggle').check();
    await page.getByTestId('swatch-cobalto').click();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-b', 'cobalto');
    const { name, buffer } = await capture(page);
    expect(name).toMatch(/^colorimetria-terracota-vs-cobalto-\d{8}-\d{6}\.png$/);
    const image = await readImage(page, buffer, [[0.25, 0.95], [0.75, 0.95]]);
    expect(closeTo(image.pixels[0], '#A64F32')).toBe(true);
    expect(closeTo(image.pixels[1], '#2449A8')).toBe(true);
  });

  test('la captura respeta la altura de la tela elegida', async ({ page }) => {
    await page.getByTestId('swatch-cobalto').click();
    await page.getByTestId('drape-height').press('Home'); // mínimo: 15
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-height', '15');
    const low = await readImage(page, (await capture(page)).buffer, [[0.5, 0.6], [0.5, 0.97]]);
    expect(closeTo(low.pixels[0], '#CFC7BD', 6), 'con la tela baja, el 60 % de altura es fondo').toBe(true);
    expect(closeTo(low.pixels[1], '#2449A8')).toBe(true);
    await page.getByTestId('drape-height').press('End'); // máximo: 65
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-height', '65');
    const high = await readImage(page, (await capture(page)).buffer, [[0.5, 0.6]]);
    expect(closeTo(high.pixels[0], '#2449A8'), 'con la tela alta, el 60 % de altura es tela').toBe(true);
  });
});
