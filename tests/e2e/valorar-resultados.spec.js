// Probar colores, valorar, Mi paleta, comparación de dos colores y pestaña Resultados.
import { test, expect, uniqueName, openSession, rateViaUi, canvasPixels, closeTo, shot } from './fixtures.js';

let session;
test.beforeEach(async ({ page, api }) => {
  session = await api.createSession(uniqueName('Valorar'));
  await openSession(page, session.id);
});

test.describe('tela virtual', () => {
  test('al abrir una sesión nueva ya hay un color elegido y la tela dibujada', async ({ page }) => {
    const first = await page.getByTestId('swatches').locator('button').first().getAttribute('data-color-id');
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', first);
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-compare', 'false');
    await expect(page.getByTestId(`swatch-${first}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', first);
    const canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.95]]);
    expect(canvas.width).toBeGreaterThan(100);
    expect(canvas.pixels[0][3]).toBe(255);
  });

  test('elegir un color cambia la tela, la etiqueta y el color que se evalúa', async ({ page }) => {
    await page.getByTestId('swatch-esmeralda-frio').click();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'esmeralda-frio');
    await expect(page.getByTestId('drape-label')).toContainText('Esmeralda frío');
    await expect(page.getByTestId('rating-color')).toHaveText('Esmeralda frío');
    await expect(page.getByTestId('swatch-esmeralda-frio')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('swatches').locator('button[aria-pressed="true"]')).toHaveCount(1);
    const canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.95], [0.5, 0.1]]);
    expect(closeTo(canvas.pixels[0], '#08785B')).toBe(true);
    expect(canvas.pixels[1][3]).toBe(0);
  });

  test('cada uno de los 48 colores pinta la tela con su propio hex', async ({ page, api }) => {
    const { colors } = await api.colors();
    for (const color of colors) {
      await page.getByTestId(`swatch-${color.id}`).click();
      await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', color.id);
      const canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.97]]);
      expect(closeTo(canvas.pixels[0], color.hex), `${color.id}: ${canvas.pixels[0]} frente a ${color.hex}`).toBe(true);
    }
  });

  test('la altura de la tela se ajusta con el control y se refleja en el lienzo', async ({ page }) => {
    await page.getByTestId('swatch-cobalto').click();
    const slider = page.getByTestId('drape-height');
    await slider.press('Home');
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-height', '15');
    let canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.6]]);
    expect(canvas.pixels[0][3], 'tela baja: a media altura no hay tela').toBe(0);
    await slider.press('End');
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-height', '65');
    canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.6]]);
    expect(canvas.pixels[0][3], 'tela alta: a media altura hay tela').toBe(255);
  });

  test('el lienzo de la tela se adapta al cambiar el tamaño de la ventana', async ({ page }) => {
    await page.getByTestId('swatch-cobalto').click();
    await page.setViewportSize({ width: 800, height: 700 });
    await expect.poll(async () => {
      const ratio = await page.evaluate(() => {
        const canvas = document.getElementById('drape-canvas');
        const stage = document.getElementById('stage');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        return [canvas.width - Math.round(stage.clientWidth * dpr), canvas.height - Math.round(stage.clientHeight * dpr)];
      });
      return ratio;
    }).toEqual([0, 0]);
    const canvas = await canvasPixels(page, 'drape-canvas', [[0.5, 0.95]]);
    expect(closeTo(canvas.pixels[0], '#2449A8')).toBe(true);
  });
});

test.describe('valorar un color', () => {
  test('guardar una valoración muestra la puntuación, marca la muestra y actualiza el contador', async ({ page, api }, testInfo) => {
    await rateViaUi(page, 'terracota', { even: 3, eyes: 2, shadows: null, harmony: 1 });
    await expect(page.getByTestId('toast')).toContainText('Puntuación guardada');
    await expect(page.getByTestId('rating-score')).toHaveText('Terracota: 67%');
    await expect(page.getByTestId('rating-result')).toContainText('3 de 4 criterios');
    await expect(page.getByTestId('swatch-terracota')).toContainText('67%');
    await expect(page.getByTestId('session-meta')).toContainText('1 color valorado');
    await expect(page.getByTestId('palette-status')).toContainText('1 valorados');
    await expect(page.getByTestId('rating-delete')).toBeEnabled();
    const stored = (await api.getSession(session.id)).ratings;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ colorId: 'terracota', even: 3, eyes: 2, shadows: null, harmony: 1, answered: 3, score: 67 });
    await shot(page, testInfo, 'color-valorado', { fullPage: true });
  });

  test('guardar con los cuatro criterios en «No sé» avisa y no guarda nada', async ({ page, api }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('toast')).toContainText(/al menos un criterio/i);
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'false');
    expect((await api.getSession(session.id)).ratings).toEqual([]);
  });

  test('«Nada» en los cuatro guarda un 0 % (no se confunde con «No sé»)', async ({ page }) => {
    await rateViaUi(page, 'negro', 0);
    await expect(page.getByTestId('rating-score')).toHaveText('Negro: 0%');
    await expect(page.getByTestId('swatch-negro')).toContainText('0%');
    await expect(page.getByTestId('my-palette-chip-negro')).toHaveAttribute('data-group', 'avoid');
  });

  test('al volver a un color valorado se recuperan sus respuestas; uno sin valorar sale en blanco', async ({ page }) => {
    await rateViaUi(page, 'terracota', { even: 3, eyes: 0, shadows: null, harmony: 2 });
    await page.getByTestId('swatch-cobalto').click();
    for (const key of ['even', 'eyes', 'shadows', 'harmony']) await expect(page.getByTestId(`rating-${key}`)).toHaveValue('');
    await expect(page.getByTestId('rating-delete')).toBeDisabled();
    await page.getByTestId('swatch-terracota').click();
    await expect(page.getByTestId('rating-even')).toHaveValue('3');
    await expect(page.getByTestId('rating-eyes')).toHaveValue('0');
    await expect(page.getByTestId('rating-shadows')).toHaveValue('');
    await expect(page.getByTestId('rating-harmony')).toHaveValue('2');
  });

  test('se puede corregir una valoración y la nueva sustituye a la anterior', async ({ page, api }) => {
    await rateViaUi(page, 'terracota', 3);
    await rateViaUi(page, 'terracota', 0);
    await expect(page.getByTestId('rating-score')).toHaveText('Terracota: 0%');
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveAttribute('data-group', 'avoid');
    await expect(page.getByTestId('my-palette-good').locator('button')).toHaveCount(0);
    expect((await api.getSession(session.id)).ratings).toHaveLength(1);
    await expect(page.getByTestId('session-meta')).toContainText('1 color valorado');
  });

  test('«Borrar valoración» la elimina de la muestra, de Mi paleta y del servidor', async ({ page, api }) => {
    await rateViaUi(page, 'terracota', 3);
    await rateViaUi(page, 'cobalto', 3);
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-delete').click();
    await expect(page.getByTestId('toast')).toContainText('Valoración borrada');
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'false');
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveCount(0);
    await expect(page.getByTestId('my-palette-chip-cobalto')).toBeVisible();
    await expect(page.getByTestId('session-meta')).toContainText('1 color valorado');
    await expect(page.getByTestId('rating-delete')).toBeDisabled();
    for (const key of ['even', 'eyes', 'shadows', 'harmony']) await expect(page.getByTestId(`rating-${key}`)).toHaveValue('');
    expect((await api.getSession(session.id)).ratings.map((r) => r.colorId)).toEqual(['cobalto']);
  });

  test('doble clic en «Guardar puntuación» envía una sola petición', async ({ page }) => {
    let puts = 0;
    page.on('request', (request) => { if (request.method() === 'PUT' && request.url().includes('/ratings/')) puts++; });
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').dblclick();
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'true');
    await page.waitForTimeout(300);
    expect(puts).toBe(1);
  });

  test('«Guardar y siguiente» guarda y pasa al siguiente color sin valorar con el formulario en blanco', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save-next').click();
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'true');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'oxido');
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'oxido');
    for (const key of ['even', 'eyes', 'shadows', 'harmony']) await expect(page.getByTestId(`rating-${key}`)).toHaveValue('');
  });

  test('«Guardar y siguiente» sin responder nada no avanza de color', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-save-next').click();
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
  });

  test('«Siguiente sin valorar» y Alt+N saltan los colores ya valorados', async ({ page, api }) => {
    await api.rate(session.id, 'oxido', 2);
    await api.rate(session.id, 'mostaza', 2);
    await page.reload();
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-next').click();
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'camel');
    await page.keyboard.press('Alt+n');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'chocolate');
  });

  test('cambiar de color con respuestas sin guardar no las pasa al color siguiente', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-harmony').selectOption('3');
    await page.getByTestId('swatch-cobalto').click();
    for (const key of ['even', 'eyes', 'shadows', 'harmony']) await expect(page.getByTestId(`rating-${key}`)).toHaveValue('');
  });

  test('las respuestas a medias no se pierden al guardar otra cosa ni al cambiar filtros', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('2');
    await page.getByTestId('filter-undertone').selectOption('calido');
    await expect(page.getByTestId('rating-even')).toHaveValue('2');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
  });

  test('al abrir otra sesión no se arrastran las valoraciones ni las respuestas de la anterior', async ({ page, api }) => {
    await rateViaUi(page, 'terracota', 3);
    const other = await api.createSession(uniqueName('Otra'));
    await page.getByTestId('back-to-history').click();
    await page.getByTestId(`session-open-${other.id}`).click();
    await expect(page.getByTestId('session-title')).toHaveText(other.name);
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'false');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
    for (const key of ['even', 'eyes', 'shadows', 'harmony']) await expect(page.getByTestId(`rating-${key}`)).toHaveValue('');
    await expect(page.getByTestId('my-palette-empty')).toBeVisible();
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveCount(0);
    await expect(page.getByTestId('session-meta')).toContainText('0 colores valorados');
  });

  test('si el servidor falla al guardar se avisa y la muestra no queda marcada', async ({ page, allowedErrors }) => {
    allowedErrors.push(/500/);
    await page.route('**/api/sessions/*/ratings/*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"INTERNAL","message":"Fallo simulado."}}' }));
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('toast')).toContainText('Fallo simulado.');
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'false');
    await page.unroute('**/api/sessions/*/ratings/*');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'true');
  });

  test('si se cae el servidor se avisa con un mensaje comprensible', async ({ page, allowedErrors }) => {
    allowedErrors.push(/Failed to load resource|ERR_FAILED|net::/);
    await page.route('**/api/sessions/*/ratings/*', (route) => route.abort());
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('toast')).toContainText(/No se pudo conectar/);
  });
});

test.describe('Mi paleta', () => {
  test('empieza vacía con la explicación de cómo se llena', async ({ page }) => {
    await expect(page.getByTestId('my-palette-empty')).toBeVisible();
    await expect(page.getByTestId('my-palette-good')).toBeHidden();
    await expect(page.getByTestId('my-palette-avoid')).toBeHidden();
  });

  test('≥ 60 entra en «Me favorecen», < 40 en «Mejor evitar» y lo intermedio en ninguna', async ({ page }, testInfo) => {
    await rateViaUi(page, 'terracota', 3); // 100
    await rateViaUi(page, 'oxido', 2); // 67
    await rateViaUi(page, 'mostaza', { even: 2, eyes: 2, shadows: 2, harmony: 1 }); // 58
    await rateViaUi(page, 'camel', { even: 3, eyes: 0, shadows: null, harmony: null }); // 50
    await rateViaUi(page, 'chocolate', { even: 2, eyes: 1, shadows: 1, harmony: 1 }); // 42
    await rateViaUi(page, 'oliva', 1); // 33
    await rateViaUi(page, 'verde-bosque', 0); // 0
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveAttribute('data-group', 'good');
    await expect(page.getByTestId('my-palette-chip-oxido')).toHaveAttribute('data-group', 'good');
    await expect(page.getByTestId('my-palette-chip-oliva')).toHaveAttribute('data-group', 'avoid');
    await expect(page.getByTestId('my-palette-chip-verde-bosque')).toHaveAttribute('data-group', 'avoid');
    for (const id of ['mostaza', 'camel', 'chocolate']) await expect(page.getByTestId(`my-palette-chip-${id}`)).toHaveCount(0);
    await expect(page.getByTestId('my-palette-good').locator('button')).toHaveCount(2);
    await expect(page.getByTestId('my-palette-avoid').locator('button')).toHaveCount(2);
    await expect(page.getByTestId('my-palette-empty')).toBeHidden();
    // Mejor primero en favorables; peor primero en evitar.
    expect(await page.getByTestId('my-palette-good').locator('button').evaluateAll((n) => n.map((b) => b.dataset.colorId))).toEqual(['terracota', 'oxido']);
    expect(await page.getByTestId('my-palette-avoid').locator('button').evaluateAll((n) => n.map((b) => b.dataset.colorId))).toEqual(['verde-bosque', 'oliva']);
    await expect(page.getByTestId('my-palette-chip-terracota')).toContainText('100%');
    await shot(page, testInfo, 'mi-paleta', { fullPage: true });
  });

  test('pulsar un color de Mi paleta lo pone en la tela para volver a probarlo', async ({ page }) => {
    await rateViaUi(page, 'terracota', 3);
    await page.getByTestId('swatch-cobalto').click();
    await page.getByTestId('my-palette-chip-terracota').click();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'terracota');
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rating-even')).toHaveValue('3');
  });

  test('un color con solo «No sé» guardado por otra vía no aparece en Mi paleta ni cuenta como valorado', async ({ page, api }) => {
    await api.rate(session.id, 'terracota', null);
    await page.reload();
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'false');
    await expect(page.getByTestId('my-palette-empty')).toBeVisible();
    await expect(page.getByTestId('session-meta')).toContainText('0 colores valorados');
  });
});

test.describe('comparación de dos colores', () => {
  test('al activarla la tela se parte en dos mitades con dos colores distintos', async ({ page }, testInfo) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('compare-toggle').check();
    const canvas = page.getByTestId('drape-canvas');
    await expect(canvas).toHaveAttribute('data-compare', 'true');
    await expect(canvas).toHaveAttribute('data-color-a', 'terracota');
    await expect(canvas).not.toHaveAttribute('data-color-b', '');
    await expect(canvas).not.toHaveAttribute('data-color-b', 'terracota');
    await expect(page.getByTestId('compare-slots')).toBeVisible();
    await expect(page.getByTestId('compare-slot-b'), 'la mitad derecha queda lista para elegir').toBeChecked();

    await page.getByTestId('swatch-cobalto').click();
    await expect(canvas).toHaveAttribute('data-color-a', 'terracota');
    await expect(canvas).toHaveAttribute('data-color-b', 'cobalto');
    const pixels = await canvasPixels(page, 'drape-canvas', [[0.25, 0.95], [0.75, 0.95]]);
    expect(closeTo(pixels.pixels[0], '#A64F32'), `izquierda ${pixels.pixels[0]}`).toBe(true);
    expect(closeTo(pixels.pixels[1], '#2449A8'), `derecha ${pixels.pixels[1]}`).toBe(true);
    await expect(page.getByTestId('drape-label')).toContainText('Izquierda: Terracota');
    await expect(page.getByTestId('drape-label')).toContainText('Derecha: Cobalto');
    await expect(page.getByTestId('swatch-terracota')).toContainText('Izq.');
    await expect(page.getByTestId('swatch-cobalto')).toContainText('Der.');
    await shot(page, testInfo, 'comparacion');
  });

  test('se elige en qué mitad cae el color y se valora el de la mitad activa', async ({ page, api }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('compare-toggle').check();
    await page.getByTestId('swatch-cobalto').click();
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'cobalto');
    await page.getByTestId('compare-slot-a').check();
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
    await page.getByTestId('swatch-negro').click();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-a', 'negro');
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-b', 'cobalto');
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('swatch-negro')).toHaveAttribute('data-rated', 'true');
    expect((await api.getSession(session.id)).ratings.map((r) => r.colorId)).toEqual(['negro']);
  });

  test('al cambiar de mitad con respuestas sin guardar no se guardan en el color equivocado', async ({ page, api }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('compare-toggle').check();
    await page.getByTestId('swatch-cobalto').click(); // mitad derecha activa
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('compare-slot-a').check(); // ahora se evalúa terracota
    await expect(page.getByTestId('rating-even'), 'las respuestas de cobalto no deben pasar a terracota').toHaveValue('');
    expect((await api.getSession(session.id)).ratings).toEqual([]);
  });

  test('al desactivarla vuelve a un solo color (el de la izquierda)', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('compare-toggle').check();
    await page.getByTestId('swatch-cobalto').click();
    await page.getByTestId('compare-toggle').uncheck();
    const canvas = page.getByTestId('drape-canvas');
    await expect(canvas).toHaveAttribute('data-compare', 'false');
    await expect(canvas).toHaveAttribute('data-color-a', 'terracota');
    await expect(canvas).toHaveAttribute('data-color-b', '');
    await expect(page.getByTestId('compare-slots')).toBeHidden();
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'terracota');
    const pixels = await canvasPixels(page, 'drape-canvas', [[0.25, 0.95], [0.75, 0.95]]);
    expect(closeTo(pixels.pixels[0], '#A64F32')).toBe(true);
    expect(closeTo(pixels.pixels[1], '#A64F32')).toBe(true);
  });

  test('elegir el mismo color en las dos mitades no rompe nada', async ({ page }) => {
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('compare-toggle').check();
    await page.getByTestId('swatch-terracota').click();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-color-b', 'terracota');
    await expect(page.getByTestId('swatch-terracota')).toContainText('Izq. y der.');
  });

  test('la comparación no se arrastra a otra sesión', async ({ page, api }) => {
    await page.getByTestId('compare-toggle').check();
    const other = await api.createSession(uniqueName('Sin comparar'));
    await page.getByTestId('back-to-history').click();
    await page.getByTestId(`session-open-${other.id}`).click();
    await expect(page.getByTestId('session-title')).toHaveText(other.name);
    await expect(page.getByTestId('compare-toggle')).not.toBeChecked();
    await expect(page.getByTestId('drape-canvas')).toHaveAttribute('data-compare', 'false');
    await expect(page.getByTestId('compare-slots')).toBeHidden();
  });
});

test.describe('filtros de la paleta', () => {
  test('filtrar por subtono, profundidad y estación reduce la lista de forma coherente', async ({ page, api }) => {
    const { colors } = await api.colors();
    await page.getByTestId('filter-undertone').selectOption('frio');
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(colors.filter((c) => c.undertone === 'frio').length);
    await page.getByTestId('filter-depth').selectOption('oscuro');
    const expected = colors.filter((c) => c.undertone === 'frio' && c.depth === 'oscuro');
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(expected.length);
    await expect(page.getByTestId('palette-status')).toContainText(`Mostrando ${expected.length} de 48`);
    await page.getByTestId('filter-undertone').selectOption('');
    await page.getByTestId('filter-depth').selectOption('');
    await page.getByTestId('filter-season').selectOption('otono-calido');
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(colors.filter((c) => c.seasons.includes('otono-calido')).length);
    await expect(page.getByTestId('filter-season').locator('option')).toHaveCount(13);
  });

  test('una combinación sin colores lo explica en vez de dejar la paleta en blanco', async ({ page }) => {
    await page.getByTestId('filter-undertone').selectOption('calido');
    await page.getByTestId('filter-season').selectOption('invierno-profundo');
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(0);
    await expect(page.getByTestId('palette-status')).toContainText(/Ningún color coincide/);
    await page.getByTestId('rating-next').click();
    await expect(page.getByTestId('toast')).toBeVisible();
  });

  test('el filtro de sugeridos está deshabilitado sin análisis del rostro y lo explica', async ({ page }) => {
    await expect(page.getByTestId('filter-suggested')).toBeDisabled();
    await expect(page.locator('#filter-suggested-label')).toContainText(/analiza tu rostro/i);
  });

  test('las marcas de valorado siguen visibles tras filtrar', async ({ page }) => {
    await rateViaUi(page, 'cobalto', 3);
    await page.getByTestId('filter-undertone').selectOption('frio');
    await expect(page.getByTestId('swatch-cobalto')).toHaveAttribute('data-rated', 'true');
    await expect(page.getByTestId('swatch-cobalto')).toContainText('100%');
  });
});

test.describe('resultados y estación sugerida', () => {
  test('sin valoraciones, Resultados explica cuántos colores faltan', async ({ page }) => {
    await page.getByTestId('tab-results').click();
    const box = page.getByTestId('season-suggested');
    await expect(box).toHaveAttribute('data-enough', 'false');
    await expect(box).toHaveAttribute('data-season-id', '');
    await expect(page.getByTestId('season-missing')).toContainText('faltan 12 colores');
    await expect(page.getByTestId('ranking-empty')).toBeVisible();
    await expect(page.getByTestId('season-scores').locator('li')).toHaveCount(12);
    await expect(page.getByTestId('recommended-list')).toContainText(/Todavía no hay/);
    await expect(page.getByTestId('avoid-list')).toContainText(/Todavía no hay/);
    await expect(page.getByTestId('auto-empty')).toBeVisible();
  });

  test('con 11 colores valorados aún no hay estación; al valorar el 12.º aparece', async ({ page, api }, testInfo) => {
    test.slow();
    const { colors } = await api.colors();
    const liked = colors.filter((c) => c.seasons.includes('otono-calido')).map((c) => c.id);
    const disliked = colors.filter((c) => c.seasons.every((s) => s.startsWith('invierno'))).map((c) => c.id);
    const plan = [...liked.map((id) => [id, 3]), ...disliked.map((id) => [id, 0])].slice(0, 12);
    expect(plan).toHaveLength(12);

    for (const [id, value] of plan.slice(0, 11)) await rateViaUi(page, id, value);
    await expect(page.getByTestId('session-meta')).toContainText('11 colores valorados');
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-enough', 'false');
    await expect(page.getByTestId('season-missing')).toContainText('falta 1 color');
    await expect(page.getByTestId('season-missing')).toContainText('11 de 12');

    await page.getByTestId('tab-try').click();
    await rateViaUi(page, plan[11][0], plan[11][1]);
    await page.getByTestId('tab-results').click();
    const analysis = (await api.getSession(session.id)).analysis;
    expect(analysis.top.id).toBe('otono-calido');
    const box = page.getByTestId('season-suggested');
    await expect(box).toHaveAttribute('data-enough', 'true');
    await expect(box).toHaveAttribute('data-season-id', 'otono-calido');
    await expect(box).toHaveAttribute('data-confidence', analysis.confidence);
    await expect(page.getByTestId('season-top-name')).toHaveText('Otoño Cálido');
    await expect(box).toContainText(`Afinidad: ${analysis.top.score}%`);
    await expect(page.getByTestId('season-runner-up')).toContainText(analysis.runnerUp.name);
    await expect(page.getByTestId('season-score-otono-calido')).toHaveClass(/top/);
    // Recomendados y a evitar coinciden con el análisis del servidor, en el mismo orden.
    expect(await page.getByTestId('recommended-list').locator('li[data-color-id]').evaluateAll((n) => n.map((x) => x.dataset.colorId))).toEqual(analysis.recommended);
    expect(await page.getByTestId('avoid-list').locator('li[data-color-id]').evaluateAll((n) => n.map((x) => x.dataset.colorId))).toEqual(analysis.avoid);
    // Ranking: de mayor a menor.
    const scores = await page.getByTestId('ranking-list').locator('li strong').evaluateAll((n) => n.map((x) => parseInt(x.textContent, 10)));
    expect(scores).toHaveLength(12);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    await shot(page, testInfo, 'resultados-estacion-sugerida', { fullPage: true });

    // El historial refleja la misma estación.
    await page.getByTestId('back-to-history').click();
    await expect(page.getByTestId(`session-row-${session.id}`)).toContainText('Estación sugerida: Otoño Cálido');
  });

  test('las 12 estaciones se listan en el orden del análisis con sus puntuaciones', async ({ page, api }) => {
    const analysis = await api.rateAllFor(session.id, 'invierno-profundo');
    await page.reload();
    await page.getByTestId('tab-results').click();
    const ids = await page.getByTestId('season-scores').locator('li').evaluateAll((n) => n.map((x) => x.dataset.testid.replace('season-score-', '')));
    expect(ids).toEqual(analysis.seasons.map((s) => s.id));
    for (const season of analysis.seasons.slice(0, 4)) {
      await expect(page.getByTestId(`season-score-${season.id}`)).toContainText(`${season.score}%`);
    }
    await expect(page.getByTestId('season-confidence')).toHaveText('Alta');
    await expect(page.getByTestId('axis-undertone')).toContainText(`${analysis.axes.undertone.frio}%`);
    await expect(page.getByTestId('axis-depth')).toContainText(`${analysis.axes.depth.oscuro}%`);
    await expect(page.getByTestId('analysis-messages').locator('li')).toHaveCount(analysis.messages.length);
  });

  test('borrar una valoración por debajo de 12 retira la estación sugerida sin recargar', async ({ page, api }) => {
    const { colors } = await api.colors();
    for (const color of colors.slice(0, 12)) await api.rate(session.id, color.id, 3);
    await page.reload();
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-enough', 'true');
    await page.getByTestId('tab-try').click();
    await page.getByTestId(`swatch-${colors[0].id}`).click();
    await page.getByTestId('rating-delete').click();
    await expect(page.getByTestId(`swatch-${colors[0].id}`)).toHaveAttribute('data-rated', 'false');
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-enough', 'false');
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-season-id', '');
    await expect(page.getByTestId('season-missing')).toContainText('11 de 12');
  });

  test('con valoraciones y análisis del rostro se indica si coinciden', async ({ page, api }) => {
    await api.rateAllFor(session.id, 'otono-calido');
    await api.features(session.id, { skin: '#F2D3CB', hair: '#C9BCA3', eyes: '#7A9CC0' });
    await page.reload();
    await page.getByTestId('tab-results').click();
    await expect(page.getByTestId('auto-agreement')).toHaveAttribute('data-agrees', 'false');
    await expect(page.getByTestId('auto-agreement')).toContainText(/No coincide/);
    // La estación sugerida sigue siendo la de las valoraciones.
    await expect(page.getByTestId('season-suggested')).toHaveAttribute('data-season-id', 'otono-calido');
  });

  test('«Ir a analizar mi rostro» lleva a la pestaña de probar', async ({ page }) => {
    await page.getByTestId('tab-results').click();
    await page.getByTestId('auto-go-analyze').click();
    await expect(page.getByTestId('panel-try')).toBeVisible();
    await expect(page.getByTestId('tab-try')).toHaveAttribute('aria-current', 'page');
  });

  test('la pestaña abierta no se pierde al guardar: las pestañas muestran un solo panel cada vez', async ({ page }) => {
    for (const [tab, panel] of [['tab-results', 'panel-results'], ['report-button', 'panel-report'], ['tab-try', 'panel-try']]) {
      await page.getByTestId(tab).click();
      await expect(page.getByTestId(panel)).toBeVisible();
      for (const other of ['panel-try', 'panel-results', 'panel-report'].filter((p) => p !== panel)) {
        await expect(page.getByTestId(other)).toBeHidden();
      }
    }
  });
});
