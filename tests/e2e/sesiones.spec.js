// Sesiones: crear, renombrar, borrar, persistencia, sesión desaparecida y texto con HTML.
import { test, expect, uniqueName, openSession, createSessionViaUi, rateViaUi, uploadPhoto, storedPhotoSize, shot } from './fixtures.js';

test.describe('historial y creación', () => {
  test('la app carga, muestra el historial y no deja la pantalla de carga', async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByTestId('history-view')).toBeVisible();
    await expect(page.getByTestId('app-loading')).toBeHidden();
    await expect(page.getByTestId('app-error')).toBeHidden();
    await expect(page.locator('body')).toHaveAttribute('data-view', 'history');
    await shot(page, testInfo, 'historial', { fullPage: true });
  });

  test('crear una sesión la abre con su nombre, sus notas y la paleta de 48 colores', async ({ page, api }, testInfo) => {
    const name = uniqueName('Luz de mañana');
    const id = await createSessionViaUi(page, name, 'Junto a la ventana, sin maquillaje');
    expect(id).toBeGreaterThan(0);
    await expect(page.getByTestId('session-title')).toHaveText(name);
    await expect(page.getByTestId('session-notes')).toHaveText('Junto a la ventana, sin maquillaje');
    await expect(page.getByTestId('session-meta')).toContainText('0 colores valorados');
    await expect(page.getByTestId('swatches').locator('button')).toHaveCount(48);
    await expect(page.getByTestId('tab-try')).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle(new RegExp(name));
    const stored = (await api.getSession(id)).session;
    expect(stored.name).toBe(name);
    expect(stored.notes).toBe('Junto a la ventana, sin maquillaje');
    await shot(page, testInfo, 'sesion-recien-creada', { fullPage: true });
  });

  test('una sesión sin notas no muestra el bloque de notas', async ({ page }) => {
    await createSessionViaUi(page, uniqueName('Sin notas'));
    await expect(page.getByTestId('session-notes')).toBeHidden();
  });

  test('no deja crear una sesión sin nombre ni con solo espacios y explica por qué', async ({ page }) => {
    let posts = 0;
    page.on('request', (request) => { if (request.method() === 'POST') posts++; });
    await page.goto('/');
    await page.getByTestId('new-session-button').click();
    await expect(page.getByTestId('session-form-error')).toBeVisible();
    await expect(page.getByTestId('session-form-error')).not.toBeEmpty();
    await page.getByTestId('session-name-input').fill('     ');
    await page.getByTestId('new-session-button').click();
    await expect(page.getByTestId('session-form-error')).toBeVisible();
    await expect(page.getByTestId('history-view')).toBeVisible();
    await page.waitForTimeout(200);
    expect(posts, 'no debe enviarse nada al servidor').toBe(0);
  });

  test('el aviso de error del formulario desaparece al crear bien la sesión', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-session-button').click();
    await expect(page.getByTestId('session-form-error')).toBeVisible();
    await page.getByTestId('session-name-input').fill(uniqueName('Tras error'));
    await page.getByTestId('new-session-button').click();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await page.getByTestId('back-to-history').click();
    await expect(page.getByTestId('session-form-error')).toBeHidden();
    await expect(page.getByTestId('session-name-input')).toHaveValue('');
  });

  test('doble clic en «Crear sesión» crea una sola sesión', async ({ page, api }) => {
    const name = uniqueName('Doble clic');
    await page.goto('/');
    await page.getByTestId('session-name-input').fill(name);
    await page.getByTestId('new-session-button').dblclick();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await page.waitForTimeout(400);
    expect((await api.listSessions()).filter((s) => s.name === name)).toHaveLength(1);
  });

  test('pulsar Intro en el nombre crea la sesión', async ({ page }) => {
    const name = uniqueName('Con Intro');
    await page.goto('/');
    await page.getByTestId('session-name-input').fill(name);
    await page.getByTestId('session-name-input').press('Enter');
    await expect(page.getByTestId('session-title')).toHaveText(name);
  });

  test('el nombre admite 80 caracteres y el campo no deja escribir más', async ({ page }) => {
    await page.goto('/');
    const long = 'N'.repeat(95);
    await page.getByTestId('session-name-input').pressSequentially(long, { delay: 0 });
    expect((await page.getByTestId('session-name-input').inputValue()).length).toBe(80);
    await page.getByTestId('new-session-button').click();
    await expect(page.getByTestId('session-title')).toHaveText('N'.repeat(80));
  });

  test('el historial lista las sesiones más recientes primero con sus colores valorados', async ({ page, api }) => {
    const first = await api.createSession(uniqueName('Antigua'));
    const second = await api.createSession(uniqueName('Reciente'), 'nota visible');
    await api.rate(first.id, 'negro', 3);
    await page.goto('/');
    const rows = page.getByTestId('session-list').locator('li.session-row');
    const ids = await rows.evaluateAll((nodes) => nodes.map((n) => Number(n.dataset.sessionId)));
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    expect(ids).toEqual([...ids].sort((a, b) => b - a));
    await expect(page.getByTestId(`session-row-${first.id}`)).toContainText('1 color valorado');
    await expect(page.getByTestId(`session-row-${second.id}`)).toContainText('0 colores valorados');
    await expect(page.getByTestId(`session-row-${second.id}`)).toContainText('nota visible');
    await expect(page.getByTestId(`session-row-${first.id}`)).toContainText('Sin estación sugerida');
  });

  test('el historial muestra la estación sugerida de una sesión completa', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Completa'));
    const analysis = await api.rateAllFor(session.id, 'otono-calido');
    expect(analysis.top.id).toBe('otono-calido');
    await page.goto('/');
    await expect(page.getByTestId(`session-row-${session.id}`)).toContainText('Estación sugerida: Otoño Cálido');
    await expect(page.getByTestId(`session-row-${session.id}`)).toContainText('48 colores valorados');
  });
});

test.describe('renombrar y editar notas', () => {
  test('renombrar desde la sesión abierta actualiza título, pestaña del navegador y servidor', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Original'), 'nota original');
    await openSession(page, session.id);
    await page.getByTestId('session-edit-button').click();
    await expect(page.getByTestId('edit-dialog')).toBeVisible();
    await expect(page.getByTestId('edit-name-input')).toHaveValue(session.name);
    await expect(page.getByTestId('edit-notes-input')).toHaveValue('nota original');
    const renamed = uniqueName('Renombrada');
    await page.getByTestId('edit-name-input').fill(renamed);
    await page.getByTestId('edit-notes-input').fill('nota nueva');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-dialog')).toBeHidden();
    await expect(page.getByTestId('session-title')).toHaveText(renamed);
    await expect(page.getByTestId('session-notes')).toHaveText('nota nueva');
    await expect(page).toHaveTitle(new RegExp(renamed));
    expect((await api.getSession(session.id)).session).toMatchObject({ name: renamed, notes: 'nota nueva' });
    await page.reload();
    await expect(page.getByTestId('session-title')).toHaveText(renamed);
  });

  test('renombrar desde el historial actualiza la fila', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Fila'));
    await page.goto('/');
    await page.getByTestId(`session-edit-${session.id}`).click();
    const renamed = uniqueName('Fila renombrada');
    await page.getByTestId('edit-name-input').fill(renamed);
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-dialog')).toBeHidden();
    await expect(page.getByTestId(`session-row-${session.id}`).getByTestId('session-row-name')).toHaveText(renamed);
    await expect(page.getByTestId('history-view')).toBeVisible();
  });

  test('no deja guardar un nombre vacío y el diálogo sigue abierto con el error', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('No vaciar'));
    await openSession(page, session.id);
    await page.getByTestId('session-edit-button').click();
    await page.getByTestId('edit-name-input').fill('   ');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-error')).toBeVisible();
    await expect(page.getByTestId('edit-dialog')).toBeVisible();
    expect((await api.getSession(session.id)).session.name).toBe(session.name);
  });

  test('cancelar o pulsar Escape no cambia nada, y al reabrir se ven los valores guardados', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Cancelar'), 'intacta');
    await openSession(page, session.id);
    await page.getByTestId('session-edit-button').click();
    await page.getByTestId('edit-name-input').fill('Cambio descartado');
    await page.getByTestId('edit-cancel').click();
    await expect(page.getByTestId('edit-dialog')).toBeHidden();
    await expect(page.getByTestId('session-title')).toHaveText(session.name);
    await page.getByTestId('session-edit-button').click();
    await expect(page.getByTestId('edit-name-input')).toHaveValue(session.name);
    await page.getByTestId('edit-name-input').fill('Otro descartado');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('edit-dialog')).toBeHidden();
    expect((await api.getSession(session.id)).session.name).toBe(session.name);
  });

  test('se pueden vaciar las notas desde el diálogo', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Vaciar notas'), 'para borrar');
    await openSession(page, session.id);
    await page.getByTestId('session-edit-button').click();
    await page.getByTestId('edit-notes-input').fill('');
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-dialog')).toBeHidden();
    await expect(page.getByTestId('session-notes')).toBeHidden();
    expect((await api.getSession(session.id)).session.notes).toBe('');
  });

  test('renombrar no borra las valoraciones ni cambia el color seleccionado', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Con datos'));
    await api.rate(session.id, 'terracota', 3);
    await openSession(page, session.id);
    await page.getByTestId('swatch-cobalto').click();
    await page.getByTestId('rating-even').selectOption('2');
    await page.getByTestId('session-edit-button').click();
    await page.getByTestId('edit-name-input').fill(uniqueName('Con datos 2'));
    await page.getByTestId('edit-save').click();
    await expect(page.getByTestId('edit-dialog')).toBeHidden();
    await expect(page.getByTestId('rating-color')).toHaveAttribute('data-color-id', 'cobalto');
    await expect(page.getByTestId('rating-even')).toHaveValue('2');
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'true');
  });
});

test.describe('borrar', () => {
  test('borrar pide confirmación; cancelar conserva la sesión y aceptar la elimina del historial y del servidor', async ({ page, api }, testInfo) => {
    const session = await api.createSession(uniqueName('Para borrar'));
    const other = await api.createSession(uniqueName('Se queda'));
    await api.rate(session.id, 'negro', 3);
    await page.goto('/');
    await page.getByTestId(`session-delete-${session.id}`).click();
    await expect(page.getByTestId('confirm-dialog')).toBeVisible();
    await expect(page.getByTestId('confirm-message')).toContainText(session.name);
    await shot(page, testInfo, 'dialogo-borrar');
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
    await expect(page.getByTestId(`session-row-${session.id}`)).toBeVisible();
    expect(await api.sessionStatus(session.id)).toBe(200);

    await page.getByTestId(`session-delete-${session.id}`).click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId(`session-row-${session.id}`)).toHaveCount(0);
    await expect(page.getByTestId(`session-row-${other.id}`)).toBeVisible();
    expect(await api.sessionStatus(session.id)).toBe(404);
    expect(await api.sessionStatus(other.id)).toBe(200);
  });

  test('Escape en la confirmación no borra', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Escape'));
    await page.goto('/');
    await page.getByTestId(`session-delete-${session.id}`).click();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
    expect(await api.sessionStatus(session.id)).toBe(200);
    // Tras descartar con Escape, el siguiente borrado debe seguir pidiendo confirmación y funcionar una sola vez.
    await page.getByTestId(`session-delete-${session.id}`).click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId(`session-row-${session.id}`)).toHaveCount(0);
  });

  test('borrar una sesión elimina también su foto guardada en el navegador', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Con foto'));
    await openSession(page, session.id);
    await uploadPhoto(page);
    await expect.poll(() => storedPhotoSize(page, session.id)).toBeGreaterThan(0);
    await page.getByTestId('back-to-history').click();
    await page.getByTestId(`session-delete-${session.id}`).click();
    await page.getByTestId('confirm-accept').click();
    await expect(page.getByTestId(`session-row-${session.id}`)).toHaveCount(0);
    await expect.poll(() => storedPhotoSize(page, session.id)).toBeNull();
  });
});

test.describe('persistencia y recarga', () => {
  test('tras recargar se vuelve a la misma sesión con sus valoraciones', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Persistente'), 'mis notas');
    await openSession(page, session.id);
    await rateViaUi(page, 'terracota', 3);
    await rateViaUi(page, 'cobalto', 0);
    expect(await page.evaluate(() => localStorage.getItem('colorimetria.sessionId'))).toBe(String(session.id));
    await page.reload();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await expect(page.getByTestId('session-title')).toHaveText(session.name);
    await expect(page.getByTestId('session-meta')).toContainText('2 colores valorados');
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'true');
    await expect(page.getByTestId('swatch-terracota')).toContainText('100%');
    await expect(page.getByTestId('swatch-cobalto')).toContainText('0%');
    await expect(page.getByTestId('my-palette-chip-terracota')).toHaveAttribute('data-group', 'good');
    await expect(page.getByTestId('my-palette-chip-cobalto')).toHaveAttribute('data-group', 'avoid');
  });

  test('al volver al historial se olvida la sesión y una recarga se queda en el historial', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Olvidar'));
    await openSession(page, session.id);
    await page.getByTestId('back-to-history').click();
    await expect(page.getByTestId('history-view')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('colorimetria.sessionId'))).toBeNull();
    await page.reload();
    await expect(page.getByTestId('history-view')).toBeVisible();
    await expect(page.getByTestId('session-view')).toBeHidden();
  });

  test('recargar a mitad de una valoración sin guardar no guarda nada a medias', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('A medias'));
    await openSession(page, session.id);
    await page.getByTestId('swatch-mostaza').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-eyes').selectOption('2');
    await page.reload();
    await expect(page.getByTestId('session-view')).toBeVisible();
    await expect(page.getByTestId('swatch-mostaza')).toHaveAttribute('data-rated', 'false');
    expect((await api.getSession(session.id)).ratings).toEqual([]);
  });

  test('una sesión recordada que ya no existe lleva al historial con un aviso y se olvida', async ({ page, api, allowedErrors }) => {
    allowedErrors.push(/404/); // la consulta de la sesión borrada responde 404: es lo esperado
    const session = await api.createSession(uniqueName('Fantasma'));
    await openSession(page, session.id);
    await uploadPhoto(page);
    await expect.poll(() => storedPhotoSize(page, session.id)).toBeGreaterThan(0);
    await api.deleteSession(session.id);
    await page.reload();
    await expect(page.getByTestId('history-view')).toBeVisible();
    await expect(page.getByTestId('session-view')).toBeHidden();
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('toast')).toContainText(/ya no existe/i);
    expect(await page.evaluate(() => localStorage.getItem('colorimetria.sessionId'))).toBeNull();
    await expect(page.getByTestId(`session-row-${session.id}`)).toHaveCount(0);
    await expect.poll(() => storedPhotoSize(page, session.id), 'la foto de la sesión desaparecida debe borrarse').toBeNull();
    await page.reload();
    await expect(page.getByTestId('history-view')).toBeVisible();
  });

  test('un id recordado corrupto en localStorage no rompe el arranque', async ({ page }) => {
    await page.goto('/');
    for (const value of ['abc', '-5', '1.5', '<script>', '']) {
      await page.evaluate((v) => localStorage.setItem('colorimetria.sessionId', v), value);
      await page.reload();
      await expect(page.getByTestId('history-view'), `valor ${JSON.stringify(value)}`).toBeVisible();
    }
  });

  test('un id recordado "0" lleva al historial sin mostrar un error técnico', async ({ page, allowedErrors }) => {
    allowedErrors.push(/400|404/);
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('colorimetria.sessionId', '0'));
    await page.reload();
    await expect(page.getByTestId('history-view')).toBeVisible();
    const toast = page.getByTestId('toast');
    if (await toast.isVisible()) await expect(toast).not.toContainText(/identificador|entero positivo/i);
  });

  test('si otra pestaña borra la sesión abierta, guardar una valoración avisa y no deja la app rota', async ({ page, api, allowedErrors }) => {
    allowedErrors.push(/404/);
    const session = await api.createSession(uniqueName('Borrada por detrás'));
    await openSession(page, session.id);
    await api.deleteSession(session.id);
    await page.getByTestId('swatch-terracota').click();
    await page.getByTestId('rating-even').selectOption('3');
    await page.getByTestId('rating-save').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('toast')).toHaveAttribute('data-type', 'error');
    await expect(page.getByTestId('swatch-terracota')).toHaveAttribute('data-rated', 'false');
    await page.getByTestId('back-to-history').click();
    await expect(page.getByTestId('history-view')).toBeVisible();
  });
});

test.describe('texto con HTML en nombre y notas', () => {
  const NAME = '<img src=x onerror="window.__xss=1"><b>negrita</b> & "comillas"';
  const NOTES = '<script>window.__xss=2</script>\n<i>cursiva</i> línea 2';

  test('se muestra literal en historial, sesión, diálogos e informe, y no se ejecuta', async ({ page }) => {
    const id = await createSessionViaUi(page, NAME, NOTES);
    await expect(page.getByTestId('session-title')).toHaveText(NAME);
    await expect(page.getByTestId('session-notes')).toContainText('<script>window.__xss=2</script>');
    await expect(page.getByTestId('session-notes')).toContainText('<i>cursiva</i> línea 2');

    await page.getByTestId('report-button').click();
    await expect(page.getByTestId('report-title')).toHaveText(NAME);
    await expect(page.getByTestId('report-notes')).toContainText('<i>cursiva</i>');

    await page.getByTestId('session-edit-button').click();
    await expect(page.getByTestId('edit-name-input')).toHaveValue(NAME);
    await expect(page.getByTestId('edit-notes-input')).toHaveValue(NOTES);
    await page.getByTestId('edit-cancel').click();

    await page.getByTestId('back-to-history').click();
    const row = page.getByTestId(`session-row-${id}`);
    await expect(row.getByTestId('session-row-name')).toHaveText(NAME);
    await expect(row).toContainText('<i>cursiva</i>');
    await page.getByTestId(`session-delete-${id}`).click();
    await expect(page.getByTestId('confirm-message')).toContainText(NAME);
    await page.getByTestId('confirm-cancel').click();

    // Nada del texto se interpretó como marcado: ni elementos inyectados ni código ejecutado.
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    expect(await page.locator('main img[src="x"], main b, main i, main script, dialog img, dialog b').count()).toBe(0);
  });

  test('las notas conservan los saltos de línea en el informe', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Saltos'), 'primera línea\nsegunda línea');
    await openSession(page, session.id);
    await page.getByTestId('report-button').click();
    const notes = page.getByTestId('report-notes');
    await expect(notes).toHaveText(/primera línea\s+segunda línea/);
    expect(await notes.evaluate((node) => getComputedStyle(node).whiteSpace)).toMatch(/pre/);
  });

  test('las notas de varias líneas se ven en varias líneas también en la cabecera de la sesión', async ({ page, api }) => {
    const session = await api.createSession(uniqueName('Saltos cabecera'), 'primera línea\nsegunda línea');
    await openSession(page, session.id);
    expect(await page.getByTestId('session-notes').evaluate((node) => getComputedStyle(node).whiteSpace)).toMatch(/pre/);
  });
});
