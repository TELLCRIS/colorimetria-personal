// Subir foto y «Analizar mi rostro» (tres puntos: piel, cabello y ojos).
import {
  test, expect, uniqueName, openSession, uploadPhoto, faceFile, facePng, makePng, markPoint, canvasPixels,
  closeTo, storedPhotoSize, FACE, shot,
} from './fixtures.js';

let session;
test.beforeEach(async ({ page, api }) => {
  session = await api.createSession(uniqueName('Foto'));
  await openSession(page, session.id);
});

async function openAnalyze(page) {
  await page.getByTestId('analyze-start').click();
  await expect(page.getByTestId('analyze-panel')).toBeVisible();
  await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'skin');
}

async function markAll(page) {
  await markPoint(page, FACE.points.skin);
  await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'hair');
  await markPoint(page, FACE.points.hair);
  await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'eyes');
  await markPoint(page, FACE.points.eyes);
  await expect(page.getByTestId('feature-swatch-eyes')).not.toHaveAttribute('data-hex', '');
}

test.describe('subir foto', () => {
  test('una foto subida se muestra en el escenario, se guarda en el navegador y habilita el análisis', async ({ page }, testInfo) => {
    await expect(page.getByTestId('analyze-start')).toBeDisabled();
    await uploadPhoto(page);
    await expect(page.getByTestId('photo-canvas')).toBeVisible();
    await expect(page.getByTestId('camera-status')).toBeHidden();
    await expect(page.getByTestId('toast')).toContainText(/Foto cargada/);
    await expect(page.getByTestId('photo-status')).toContainText(/solo en este navegador/);
    await expect(page.getByTestId('photo-remove')).toBeVisible();
    await expect(page.getByTestId('analyze-start')).toBeEnabled();
    const photo = await canvasPixels(page, 'photo-canvas', [FACE.points.skin, FACE.points.hair, FACE.points.eyes]);
    expect([photo.width, photo.height]).toEqual([600, 800]);
    expect(closeTo(photo.pixels[0], FACE.skin, 2)).toBe(true);
    expect(closeTo(photo.pixels[1], FACE.hair, 2)).toBe(true);
    expect(closeTo(photo.pixels[2], FACE.eyes, 2)).toBe(true);
    await expect.poll(() => storedPhotoSize(page, session.id)).toBeGreaterThan(500);
    await shot(page, testInfo, 'foto-subida', { fullPage: true });
  });

  test('la foto nunca se envía al servidor', async ({ page }) => {
    const bodies = [];
    page.on('request', (request) => {
      if (request.method() !== 'GET') bodies.push({ url: request.url(), size: (request.postData() ?? '').length, type: request.headers()['content-type'] ?? '' });
    });
    await uploadPhoto(page);
    await page.getByTestId('analyze-start').click();
    await markAll(page);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.type, body.url).toMatch(/application\/json/);
      expect(body.size, `cuerpo sospechosamente grande hacia ${body.url}`).toBeLessThan(500);
    }
  });

  test('la foto sigue ahí tras recargar y en la misma sesión al volver desde el historial', async ({ page }) => {
    await uploadPhoto(page);
    await expect.poll(() => storedPhotoSize(page, session.id)).toBeGreaterThan(500);
    await page.reload();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    const photo = await canvasPixels(page, 'photo-canvas', [FACE.points.skin, FACE.points.hair]);
    expect(closeTo(photo.pixels[0], FACE.skin, 10), 'la foto recuperada conserva el color (JPEG)').toBe(true);
    expect(closeTo(photo.pixels[1], FACE.hair, 10)).toBe(true);
    await page.getByTestId('back-to-history').click();
    await page.getByTestId(`session-open-${session.id}`).click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
  });

  test('una foto grande se reduce a 1280 px de lado como máximo sin deformarse', async ({ page }) => {
    await uploadPhoto(page, faceFile(2400, 3200));
    const photo = await canvasPixels(page, 'photo-canvas', [FACE.points.skin]);
    expect(Math.max(photo.width, photo.height)).toBe(1280);
    expect(photo.width / photo.height).toBeCloseTo(0.75, 2);
    expect(closeTo(photo.pixels[0], FACE.skin, 3)).toBe(true);
  });

  test('una foto apaisada o muy pequeña también se acepta', async ({ page }) => {
    await uploadPhoto(page, { name: 'apaisada.png', mimeType: 'image/png', buffer: facePng(800, 300) });
    expect((await canvasPixels(page, 'photo-canvas', [])).width).toBe(800);
    await uploadPhoto(page, { name: 'mini.png', mimeType: 'image/png', buffer: makePng(4, 4, () => [232, 196, 168]) });
    await expect.poll(async () => (await canvasPixels(page, 'photo-canvas', [])).width).toBe(4);
    await page.getByTestId('analyze-start').click();
    await markPoint(page, [0.5, 0.5]);
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', '#E8C4A8');
  });

  test('subir otra foto sustituye a la anterior', async ({ page }) => {
    await uploadPhoto(page);
    await uploadPhoto(page, { name: 'verde.png', mimeType: 'image/png', buffer: makePng(300, 300, () => [20, 160, 60]) });
    await expect.poll(async () => (await canvasPixels(page, 'photo-canvas', [])).width).toBe(300);
    const photo = await canvasPixels(page, 'photo-canvas', [[0.5, 0.5]]);
    expect(closeTo(photo.pixels[0], '#14A03C', 2)).toBe(true);
  });

  test('se puede volver a subir el mismo archivo después de quitar la foto', async ({ page }) => {
    await uploadPhoto(page);
    await page.getByTestId('photo-remove').click();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    await uploadPhoto(page);
    await expect(page.getByTestId('photo-canvas')).toBeVisible();
  });

  test('un archivo que no es imagen se rechaza con un mensaje claro y no cambia nada', async ({ page }) => {
    await page.getByTestId('photo-file-input').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') });
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('toast')).toContainText(/no es una imagen/i);
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'none');
    await expect(page.getByTestId('analyze-start')).toBeDisabled();
  });

  test('una imagen corrupta se rechaza con un mensaje claro y conserva la foto anterior', async ({ page }) => {
    await uploadPhoto(page);
    await page.getByTestId('photo-file-input').setInputFiles({ name: 'rota.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('esto no es un jpeg') });
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('toast')).toContainText(/No se pudo leer/i);
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    expect((await canvasPixels(page, 'photo-canvas', [])).width).toBe(600);
  });

  test('el botón «Subir foto» abre el selector de archivos del sistema', async ({ page }) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByTestId('photo-upload').click()]);
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles(faceFile());
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
  });

  test('la tela se dibuja sobre la foto y deja ver el rostro', async ({ page }) => {
    await uploadPhoto(page);
    await page.getByTestId('swatch-fucsia-frio').click();
    const canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.95], [0.5, 0.2]]);
    expect(closeTo(canvas.pixels[0], '#C21870')).toBe(true);
    expect(canvas.pixels[0][3]).toBe(255);
    expect(canvas.pixels[1][3], 'la zona del rostro debe quedar transparente').toBe(0);
  });
});

test.describe('analizar mi rostro', () => {
  test.beforeEach(async ({ page }) => { await uploadPhoto(page); });

  test('marcar piel, cabello y ojos toma el color exacto de cada punto y avanza de paso', async ({ page }, testInfo) => {
    await openAnalyze(page);
    await expect(page.getByTestId('analyze-instruction')).toContainText('Paso 1 de 3');
    await expect(page.getByTestId('analyze-confirm')).toBeDisabled();
    await expect(page.getByTestId('analyze-skip'), 'la piel no se puede omitir').toBeDisabled();
    await expect(page.getByTestId('feature-value-skin')).toHaveText('Sin marcar');

    await markPoint(page, FACE.points.skin);
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
    await expect(page.getByTestId('feature-value-skin')).toHaveText(FACE.skin);
    await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'hair');
    await expect(page.getByTestId('analyze-instruction')).toContainText('Paso 2 de 3');
    await expect(page.getByTestId('analyze-confirm')).toBeEnabled();
    await expect(page.getByTestId('analyze-skip')).toBeEnabled();

    await markPoint(page, FACE.points.hair);
    await expect(page.getByTestId('feature-swatch-hair')).toHaveAttribute('data-hex', FACE.hair);
    await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'eyes');

    await markPoint(page, FACE.points.eyes);
    await expect(page.getByTestId('feature-swatch-eyes')).toHaveAttribute('data-hex', FACE.eyes);
    await expect(page.getByTestId('feature-value-eyes')).toHaveText(FACE.eyes);
    await shot(page, testInfo, 'analisis-tres-puntos', { fullPage: true });
  });

  test('confirmar guarda los tres colores, cierra el panel y muestra la estimación en Resultados', async ({ page, api }, testInfo) => {
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await expect(page.getByTestId('toast')).toContainText(/Estimación automática lista/);
    await expect(page.getByTestId('drape-stage'), 'el escenario vuelve a verse').toBeVisible();
    await expect(page.getByTestId('analyze-clear')).toBeVisible();

    const stored = await api.getSession(session.id);
    expect(stored.session.features).toEqual({ skin: FACE.skin, hair: FACE.hair, eyes: FACE.eyes });
    const auto = stored.analysis.auto;
    expect(auto.seasons).toHaveLength(3);

    await page.getByTestId('tab-results').click();
    const box = page.getByTestId('auto-estimate');
    await expect(box).toHaveAttribute('data-has-auto', 'true');
    await expect(page.getByTestId('auto-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
    await expect(page.getByTestId('auto-swatch-hair')).toHaveAttribute('data-hex', FACE.hair);
    await expect(page.getByTestId('auto-swatch-eyes')).toHaveAttribute('data-hex', FACE.eyes);
    await expect(page.getByTestId('auto-seasons').locator('li')).toHaveCount(3);
    for (const season of auto.seasons) {
      await expect(page.getByTestId(`auto-season-${season.id}`)).toContainText(season.name);
      await expect(page.getByTestId(`auto-season-${season.id}`)).toContainText(`${season.score}%`);
    }
    await expect(page.getByTestId('auto-seasons').locator('li').first()).toContainText(auto.seasons[0].name);
    await expect(page.getByTestId('auto-agreement')).toHaveAttribute('data-agrees', 'unknown');
    await expect(page.getByTestId('auto-recommended').locator('li')).toHaveCount(auto.recommended.length);
    await expect(page.getByTestId('auto-traits')).toContainText('Subtono');
    // Sin valoraciones, la estimación automática no se presenta como estación sugerida.
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-enough', 'false');
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-season-id', '');
    await shot(page, testInfo, 'resultados-estimacion-automatica', { fullPage: true });
  });

  test('«Probar los colores sugeridos» lleva a la paleta filtrada por la estimación', async ({ page, api }) => {
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    const { recommended } = (await api.getSession(session.id)).analysis.auto;
    await page.getByTestId('tab-results').click();
    await page.getByTestId('try-suggested').click();
    await expect(page.getByTestId('panel-try')).toBeVisible();
    await expect(page.getByTestId('filter-suggested')).toBeChecked();
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(recommended.length);
    for (const id of recommended) await expect(page.getByTestId(`swatch-${id}`)).toBeVisible();
    await page.getByTestId('filter-suggested').uncheck();
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(48);
  });

  test('la estimación sobrevive a una recarga y «Quitar estimación» la borra', async ({ page, api }) => {
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('analyze-clear')).toBeVisible();
    await expect(page.getByTestId('filter-suggested')).toBeEnabled();
    await page.getByTestId('analyze-clear').click();
    await expect(page.getByTestId('toast')).toContainText(/quitada/);
    await expect(page.getByTestId('analyze-clear')).toBeHidden();
    await expect(page.getByTestId('filter-suggested')).toBeDisabled();
    expect((await api.getSession(session.id)).session.features).toEqual({ skin: null, hair: null, eyes: null });
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('auto-estimate')).toHaveAttribute('data-has-auto', 'false');
    await expect(page.getByTestId('auto-empty')).toBeVisible();
  });

  test('se pueden omitir cabello y ojos: la estimación sale solo con la piel y lo avisa', async ({ page, api }) => {
    await openAnalyze(page);
    await markPoint(page, FACE.points.skin);
    await page.getByTestId('analyze-skip').click();
    await expect(page.getByTestId('feature-value-hair')).toHaveText('Omitido');
    await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'eyes');
    await page.getByTestId('analyze-skip').click();
    await expect(page.getByTestId('feature-value-eyes')).toHaveText('Omitido');
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    const stored = await api.getSession(session.id);
    expect(stored.session.features).toEqual({ skin: FACE.skin, hair: null, eyes: null });
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('auto-swatch-hair')).toContainText('Sin muestra');
    await expect(page.getByTestId('auto-messages')).toContainText(/Solo hay muestra de piel/);
  });

  test('se puede repetir un punto ya marcado sin perder los demás', async ({ page }) => {
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-step-skin').click();
    await expect(page.getByTestId('analyze-panel')).toHaveAttribute('data-step', 'skin');
    await markPoint(page, FACE.points.hair); // a propósito: la «piel» pasa a ser el color del cabello
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.hair);
    await expect(page.getByTestId('feature-swatch-hair')).toHaveAttribute('data-hex', FACE.hair);
    await expect(page.getByTestId('feature-swatch-eyes')).toHaveAttribute('data-hex', FACE.eyes);
  });

  test('cancelar no guarda nada', async ({ page, api }) => {
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-cancel').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await expect(page.getByTestId('drape-stage')).toBeVisible();
    expect((await api.getSession(session.id)).session.features).toEqual({ skin: null, hair: null, eyes: null });
    await expect(page.getByTestId('analyze-clear')).toBeHidden();
  });

  test('recargar a mitad del análisis no guarda nada y la foto se conserva', async ({ page, api }) => {
    await expect.poll(() => storedPhotoSize(page, session.id)).toBeGreaterThan(500);
    await openAnalyze(page);
    await markPoint(page, FACE.points.skin);
    await page.reload();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    expect((await api.getSession(session.id)).session.features).toEqual({ skin: null, hair: null, eyes: null });
  });

  test('con teclado: las flechas mueven la cruz e Intro toma la muestra', async ({ page }) => {
    await openAnalyze(page);
    const canvas = page.getByTestId('analyze-canvas');
    await canvas.focus();
    await expect(page.getByTestId('analyze-loupe')).toBeVisible();
    // La cruz empieza en (0.5, 0.4); 6 pasos largos hacia arriba la llevan a la franja de cabello (y = 0.1).
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.hair);
    for (let i = 0; i < 9; i++) await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('feature-swatch-hair')).toHaveAttribute('data-hex', FACE.skin);
  });

  test('las flechas sobre la imagen no desplazan la página', async ({ page }) => {
    await openAnalyze(page);
    await page.getByTestId('analyze-canvas').focus();
    const before = await page.evaluate(() => window.scrollY);
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('arrastrar con el ratón muestra la lupa y la muestra se toma al soltar, no al pulsar', async ({ page }) => {
    await openAnalyze(page);
    const canvas = page.getByTestId('analyze-canvas');
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    const at = ([fx, fy]) => [box.x + box.width * fx, box.y + box.height * fy];
    await page.mouse.move(...at(FACE.points.hair));
    await page.mouse.down();
    await expect(page.getByTestId('analyze-loupe')).toBeVisible();
    await expect(page.getByTestId('feature-value-skin')).toHaveText('Sin marcar');
    await page.mouse.move(...at(FACE.points.skin), { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
  });

  test('un punto en el borde mismo de la imagen no rompe la muestra', async ({ page }) => {
    await openAnalyze(page);
    await markPoint(page, [0.99, 0.99]);
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
    await markPoint(page, [0.01, 0.01]);
    await expect(page.getByTestId('feature-swatch-hair')).toHaveAttribute('data-hex', FACE.hair);
  });

  test('doble clic en «Confirmar y estimar» envía una sola vez', async ({ page }) => {
    let puts = 0;
    page.on('request', (request) => { if (request.method() === 'PUT' && request.url().endsWith('/features')) puts++; });
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-confirm').dblclick();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await page.waitForTimeout(300);
    expect(puts).toBe(1);
  });

  test('al reabrir el análisis se conservan las muestras guardadas y se puede cambiar solo una', async ({ page, api }) => {
    await openAnalyze(page);
    await markAll(page);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await page.getByTestId('analyze-start').click();
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
    await expect(page.getByTestId('feature-swatch-eyes')).toHaveAttribute('data-hex', FACE.eyes);
    await page.getByTestId('analyze-step-eyes').click();
    await markPoint(page, FACE.points.hair);
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    expect((await api.getSession(session.id)).session.features).toEqual({ skin: FACE.skin, hair: FACE.hair, eyes: FACE.hair });
  });

  test('quitar la foto con el análisis abierto cierra el panel', async ({ page }) => {
    await openAnalyze(page);
    await page.getByTestId('photo-remove').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    await expect(page.getByTestId('analyze-start')).toBeDisabled();
  });

  test('si el servidor falla al confirmar, el error se muestra dentro del panel y se puede reintentar', async ({ page, allowedErrors }) => {
    allowedErrors.push(/500/);
    await openAnalyze(page);
    await markAll(page);
    await page.route('**/api/sessions/*/features', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL', message: 'Fallo simulado.' } }) }));
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-error')).toBeVisible();
    await expect(page.getByTestId('analyze-error')).toContainText('Fallo simulado.');
    await expect(page.getByTestId('analyze-panel')).toBeVisible();
    await expect(page.getByTestId('analyze-confirm')).toBeEnabled();
    await page.unroute('**/api/sessions/*/features');
    await page.getByTestId('analyze-confirm').click();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
  });
});
