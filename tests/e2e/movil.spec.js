// Recorridos principales en tamaño de teléfono (360×740 y 390×844, táctil).
// Se comprueba que no hay desborde horizontal y que los controles se pueden pulsar con el dedo.
import {
  test, expect, uniqueName, openSession, uploadPhoto, markPoint, rateViaUi, canvasPixels, closeTo,
  expectNoHorizontalOverflow, expectTouchTargets, isBluish, isReddish, FACE, shot,
} from './fixtures.js';

test.describe('teléfono', () => {
  test('recorrido completo: crear sesión, foto, análisis, 12 valoraciones, resultados e informe', async ({ page, api }, testInfo) => {
    test.setTimeout(120_000);
    const name = uniqueName('Móvil');
    await page.goto('/');
    await expectNoHorizontalOverflow(page, 'en el historial');
    await expectTouchTargets(page, 'history-view');
    await shot(page, testInfo, '01-historial', { fullPage: true });

    await page.getByTestId('session-name-input').fill(name);
    await page.getByTestId('session-notes-input').fill('Prueba desde el teléfono');
    await page.getByTestId('new-session-button').tap();
    await expect(page.getByTestId('session-view')).toBeVisible();
    const id = Number(await page.evaluate(() => localStorage.getItem('colorimetria.sessionId')));
    await expectNoHorizontalOverflow(page, 'en la sesión recién abierta');
    await shot(page, testInfo, '02-sesion', { fullPage: false });
    await shot(page, testInfo, '02-sesion-completa', { fullPage: true });

    // Foto y análisis con el dedo
    await uploadPhoto(page);
    await expectNoHorizontalOverflow(page, 'con foto');
    await page.getByTestId('drape-stage').scrollIntoViewIfNeeded();
    await shot(page, testInfo, '02b-foto-vertical-en-escenario', { fullPage: false });
    const fit = await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      const photo = document.getElementById('photo-canvas').getBoundingClientRect();
      return { stageW: Math.round(stage.width), stageH: Math.round(stage.height), photoW: Math.round(photo.width), photoH: Math.round(photo.height) };
    });
    test.info().annotations.push({ type: 'foto-vertical', description: JSON.stringify(fit) });
    expect(fit.photoH, 'la foto vertical se ve entera en alto').toBeLessThanOrEqual(fit.stageH + 1);
    await page.getByTestId('analyze-start').tap();
    await expect(page.getByTestId('analyze-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'con el análisis abierto');
    await markPoint(page, FACE.points.skin, { tap: true });
    await expect(page.getByTestId('feature-swatch-skin')).toHaveAttribute('data-hex', FACE.skin);
    await markPoint(page, FACE.points.hair, { tap: true });
    await expect(page.getByTestId('feature-swatch-hair')).toHaveAttribute('data-hex', FACE.hair);
    await markPoint(page, FACE.points.eyes, { tap: true });
    await expect(page.getByTestId('feature-swatch-eyes')).toHaveAttribute('data-hex', FACE.eyes);
    await expectTouchTargets(page, 'analyze-panel');
    await shot(page, testInfo, '03-analisis', { fullPage: true });
    await page.getByTestId('analyze-confirm').tap();
    await expect(page.getByTestId('analyze-panel')).toBeHidden();
    expect((await api.getSession(id)).session.features).toEqual({ skin: FACE.skin, hair: FACE.hair, eyes: FACE.eyes });

    // 12 valoraciones con la interfaz
    const { colors } = await api.colors();
    const liked = colors.filter((c) => c.seasons.includes('otono-calido')).map((c) => c.id);
    const disliked = colors.filter((c) => c.seasons.every((s) => s.startsWith('invierno'))).map((c) => c.id);
    const plan = [...liked.map((c) => [c, 3]), ...disliked.map((c) => [c, 0])].slice(0, 12);
    for (const [colorId, value] of plan) await rateViaUi(page, colorId, value);
    await expect(page.getByTestId('session-meta')).toContainText('12 colores valorados');
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveAttribute('data-group', 'good');
    await expect(page.getByTestId('my-palette-chip-negro')).toHaveAttribute('data-group', 'avoid');
    await expectNoHorizontalOverflow(page, 'tras valorar');
    await expectTouchTargets(page, 'panel-try');
    await shot(page, testInfo, '04-valorado', { fullPage: true });

    // Resultados
    await page.getByTestId('tab-results').tap();
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-enough', 'true');
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-season-id', 'otono-calido');
    await expect(page.getByTestId('auto-estimate')).toHaveAttribute('data-has-auto', 'true');
    await expectNoHorizontalOverflow(page, 'en Resultados');
    await expectTouchTargets(page, 'panel-results');
    await shot(page, testInfo, '05-resultados', { fullPage: true });

    // Informe
    await page.getByTestId('report-button').tap();
    await expect(page.getByTestId('report-season')).toHaveText('Otoño Cálido');
    await expect(page.getByTestId('report-drape-grid')).toBeVisible();
    await expect(page.getByTestId('report-sheet-download')).toBeVisible();
    // Informe final: vista previa de la ficha dentro del ancho del teléfono y botón pulsable.
    const preview = page.getByTestId('report-final-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveAttribute('data-source', 'ratings');
    const box = await preview.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, 'la vista previa de la ficha se sale del ancho').toBeLessThanOrEqual(page.viewportSize().width + 1);
    expect(box.width / box.height, 'la vista previa conserva la proporción A4').toBeCloseTo(1654 / 2339, 2);
    await expect(page.getByTestId('report-final-download')).toBeEnabled();
    await preview.scrollIntoViewIfNeeded();
    await shot(page, testInfo, '06b-ficha-vista-previa', { fullPage: false });
    const [finalPdf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-final-download').tap()]);
    expect(finalPdf.suggestedFilename()).toMatch(/^colorimetria-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.pdf$/);
    await expectNoHorizontalOverflow(page, 'en el Informe');
    await expectTouchTargets(page, 'panel-report');
    const columns = await page.getByTestId('report-drape-grid').locator('figure').evaluateAll((n) => new Set(n.map((x) => Math.round(x.getBoundingClientRect().left))).size);
    expect(columns, 'en el teléfono la cuadrícula va a 2 columnas').toBe(2);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('report-sheet-download').tap()]);
    expect(download.suggestedFilename()).toMatch(/^lamina-colorimetria-sesion-/);
    await shot(page, testInfo, '06-informe', { fullPage: true });

    // Impresión desde el teléfono
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('report')).toBeVisible();
    await expect(page.getByTestId('tab-try')).toBeHidden();
    // El ancho de impresión es el del papel, no el de la pantalla del teléfono: el desborde en papel
    // se comprueba en informe.spec.js con un ancho de A4.
    await shot(page, testInfo, '07-impresion', { fullPage: true });
    await page.emulateMedia({ media: null });

    // Volver al historial
    await page.getByTestId('back-to-history').tap();
    await expect(page.getByTestId(`session-row-${id}`)).toContainText('Estación sugerida: Otoño Cálido');
    await expectNoHorizontalOverflow(page, 'en el historial con sesiones');
    await expectTouchTargets(page, 'session-list');
  });

  test('cámara en vivo, espejo, tomar foto y captura con tela', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Móvil cámara'));
    await openSession(page, session.id);
    await page.getByTestId('camera-start').tap();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'camera');
    await expect.poll(() => page.locator('#video').evaluate((v) => v.videoWidth)).toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page, 'con la cámara encendida');
    await shot(page, testInfo, '10-camara', { fullPage: false });
    await page.getByTestId('photo-take').tap();
    await expect(page.getByTestId('drape-stage')).toHaveAttribute('data-source', 'photo');
    const photo = await canvasPixels(page, 'photo-canvas', [[0.15, 0.15], [0.85, 0.15]]);
    expect(isBluish(photo.pixels[0])).toBe(true);
    expect(isReddish(photo.pixels[1])).toBe(true);
    await page.getByTestId('swatch-terracota').tap();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('capture-button').tap()]);
    expect(download.suggestedFilename()).toMatch(/^colorimetria-terracota-/);
    await expectNoHorizontalOverflow(page, 'con foto tomada');
  });

  test('el escenario fijo deja sitio para elegir color y valorar sin tener que desplazarse a ciegas', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Móvil escenario'));
    await openSession(page, session.id);
    await uploadPhoto(page);
    const layout = await page.evaluate(() => {
      const stage = document.getElementById('stage').getBoundingClientRect();
      return { stageHeight: stage.height, stageWidth: stage.width, viewport: window.innerHeight, vw: window.innerWidth };
    });
    expect(layout.stageWidth, 'el escenario ocupa todo el ancho').toBeGreaterThanOrEqual(layout.vw - 2);
    expect(layout.stageHeight, 'el escenario tiene tamaño útil').toBeGreaterThan(150);
    expect(layout.stageHeight / layout.viewport, 'el escenario fijo no debe comerse más del 45 % de la pantalla').toBeLessThanOrEqual(0.45);

    // Con la paleta a la vista, el escenario sigue visible (pegado arriba) para ver el efecto del color.
    await page.getByTestId('swatch-terracota').scrollIntoViewIfNeeded();
    await page.getByTestId('swatches').evaluate((node) => node.scrollIntoView({ block: 'center' }));
    const stageBox = await page.getByTestId('drape-stage').boundingBox();
    expect(stageBox.y, 'el escenario se queda pegado arriba al bajar').toBeGreaterThanOrEqual(-1);
    expect(stageBox.y).toBeLessThan(60);
    await page.getByTestId('swatch-cobalto').tap();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'cobalto');
    const canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.95]]);
    expect(closeTo(canvas.pixels[0], '#2449A8')).toBe(true);
    await shot(page, testInfo, '11-escenario-pegado', { fullPage: false });

    // El formulario de valoración cabe entero bajo el escenario fijo.
    await page.getByTestId('rating-save').scrollIntoViewIfNeeded();
    const fits = await page.evaluate(() => {
      const stage = document.getElementById('stage-wrap').getBoundingClientRect();
      const first = document.getElementById('rating-even').getBoundingClientRect();
      const save = document.querySelector('[data-testid="rating-save"]').getBoundingClientRect();
      return { stageBottom: stage.bottom, firstTop: first.top, saveBottom: save.bottom, viewport: window.innerHeight };
    });
    await shot(page, testInfo, '12-valoracion-bajo-escenario', { fullPage: false });
    expect(fits.saveBottom, 'el botón Guardar queda dentro de la pantalla').toBeLessThanOrEqual(fits.viewport + 1);
    expect(fits.firstTop, `el primer criterio queda tapado por el escenario fijo (escenario hasta ${Math.round(fits.stageBottom)}px, criterio en ${Math.round(fits.firstTop)}px)`).toBeGreaterThanOrEqual(fits.stageBottom - 1);
  });

  test('el aviso emergente no tapa los botones de guardar mientras se valora seguido', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Móvil aviso'));
    await openSession(page, session.id);
    await page.getByTestId('swatch-terracota').tap();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save-next').tap();
    await expect(page.getByTestId('toast')).toBeVisible();
    await page.getByTestId('rating-even').selectOption('2');
    await page.getByTestId('rating-save-next').scrollIntoViewIfNeeded();
    const covered = await page.evaluate(() => {
      const toast = document.getElementById('toast').getBoundingClientRect();
      const hits = [];
      for (const id of ['rating-save', 'rating-save-next', 'rating-next', 'rating-delete']) {
        const r = document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
        const overlap = !(r.right <= toast.left || r.left >= toast.right || r.bottom <= toast.top || r.top >= toast.bottom);
        if (overlap) hits.push(id);
      }
      return { hits, pointerEvents: getComputedStyle(document.getElementById('toast')).pointerEvents };
    });
    if (covered.pointerEvents !== 'none') {
      expect(covered.hits, 'el aviso «Puntuación guardada» tapa botones de la valoración durante varios segundos').toEqual([]);
    }
  });

  test('comparación de dos colores y controles de la tela caben y se pueden pulsar', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Móvil comparar'));
    await openSession(page, session.id);
    await page.getByTestId('swatch-terracota').tap();
    await page.getByTestId('compare-toggle').check();
    await expect(page.getByTestId('compare-slots')).toBeVisible();
    await page.getByTestId('swatch-cobalto').tap();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-b', 'cobalto');
    const pixels = await canvasPixels(page, 'drape-canvas', [[0.25, 0.95], [0.75, 0.95]]);
    expect(closeTo(pixels.pixels[0], '#A64F32')).toBe(true);
    expect(closeTo(pixels.pixels[1], '#2449A8')).toBe(true);
    await page.getByTestId('compare-slot-a').check();
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
    await expectNoHorizontalOverflow(page, 'en comparación');
    await page.getByTestId('compare-toggle').scrollIntoViewIfNeeded();
    await shot(page, testInfo, '13-comparacion', { fullPage: false });
  });

  test('la paleta en tira se puede recorrer hasta el último color y elegirlo', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Móvil tira'));
    await openSession(page, session.id);
    const { colors } = await api.colors();
    const last = colors[colors.length - 1];
    await page.getByTestId(`swatch-${last.id}`).tap();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', last.id);
    await expectNoHorizontalOverflow(page, 'con la tira desplazada');
    const names = await page.getByTestId('swatches').locator('button .label').evaluateAll((nodes) => nodes.filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent));
    // Observación de usabilidad (no es un fallo funcional): se anota para el informe de pruebas.
    test.info().annotations.push({ type: 'usabilidad', description: `${names.length} de 48 nombres de color salen cortados con «…» en la tira: ${names.slice(0, 6).join(', ')}` });
  });

  test('diálogos de editar y borrar caben en pantalla con sus botones a la vista', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Móvil diálogos'), 'x'.repeat(600));
    await page.goto('/');
    await page.getByTestId(`session-edit-${session.id}`).tap();
    await expect(page.getByTestId('edit-dialog')).toBeVisible();
    for (const id of ['edit-dialog', 'edit-save', 'edit-cancel']) {
      const box = await page.getByTestId(id).boundingBox();
      const vp = page.viewportSize();
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(vp.width + 1);
      expect(box.y + box.height, `${id} queda fuera por abajo`).toBeLessThanOrEqual(vp.height + 1);
    }
    await shot(page, testInfo, '14-dialogo-editar');
    await page.getByTestId('edit-cancel').tap();
    await page.getByTestId(`session-delete-${session.id}`).tap();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    for (const id of ['confirm-accept', 'confirm-cancel']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.y + box.height, id).toBeLessThanOrEqual(page.viewportSize().height + 1);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    await page.getByTestId('confirm-accept').tap();
    await expect(page.getByTestId(`session-row-${session.id}`)).toHaveCount(0);
  });

  test('un nombre y unas notas muy largos sin espacios no rompen el ancho', async ({ page, api }, testInfo) => {
    const session = await api.createSession('N'.repeat(80), 'https://ejemplo.test/' + 'a'.repeat(300));
    await page.goto('/');
    await expectNoHorizontalOverflow(page, 'en el historial con textos largos');
    await page.getByTestId(`session-open-${session.id}`).tap();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'en la sesión con textos largos');
    await shot(page, testInfo, '15-textos-largos', { fullPage: false });
    await page.getByTestId('report-button').tap();
    await expectNoHorizontalOverflow(page, 'en el informe con textos largos');
    await api.deleteSession(session.id);
  });

  test('el informe con 48 valoraciones: la tabla se desplaza dentro de su marco, no la página', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Móvil tabla'));
    await api.rateAllFor(session.id, 'verano-suave');
    await openSession(page, session.id);
    await page.getByTestId('report-button').tap();
    await expect(page.getByTestId('report-table')).toBeVisible();
    await expectNoHorizontalOverflow(page, 'en el informe con tabla');
    const wrap = await page.locator('.table-wrap').evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    if (wrap.scroll > wrap.client) {
      // Hay columnas ocultas a la derecha: debe verse la columna «Puntuación» al desplazar.
      await page.locator('.table-wrap').evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      const cell = await page.getByTestId('report-table').locator('tbody tr td.num').first().boundingBox();
      expect(cell.x, 'la columna «Puntuación» se alcanza desplazando la tabla').toBeGreaterThanOrEqual(0);
      expect(cell.x + cell.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
    }
    await page.getByTestId('report-table').scrollIntoViewIfNeeded();
    await shot(page, testInfo, '16-informe-tabla', { fullPage: false });
  });

  test('en horizontal (teléfono girado) tampoco hay desborde y la tela sigue visible', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Móvil girado'));
    await openSession(page, session.id);
    const { width, height } = page.viewportSize();
    await page.setViewportSize({ width: height, height: width });
    await page.getByTestId('swatch-cobalto').tap();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'cobalto');
    await expectNoHorizontalOverflow(page, 'en horizontal');
    await expect.poll(async () => closeTo((await canvasPixels(page, 'drape-canvas', [[0.5, 0.95]])).pixels[0], '#2449A8')).toBe(true);
    await shot(page, testInfo, '17-horizontal', { fullPage: false });
    await page.getByTestId('tab-results').tap();
    await expectNoHorizontalOverflow(page, 'en Resultados en horizontal');
  });
});
