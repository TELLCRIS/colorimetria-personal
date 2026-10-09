// Historial: crear, listar, abrir, editar y borrar sesiones.
import { api } from './api.js';
import { $, el, clear, formatDate, plural } from './dom.js';
import { confirmDialog, openEditDialog, showError, toast, validateSessionFields } from './ui.js';

let onOpen = () => {};
let onCreated = () => {};

function setStatus(text, { retry = false } = {}) {
  $('history-status').textContent = text;
  $('history-status').hidden = !text;
  $('history-retry').hidden = !retry;
}

function row(session) {
  const rated = plural(session.ratedCount ?? 0, 'color valorado', 'colores valorados');
  const season = session.topSeason?.name
    ? `Estación sugerida: ${session.topSeason.name}`
    : 'Sin estación sugerida todavía';
  return el('li', { class: 'session-row', 'data-testid': `session-row-${session.id}`, 'data-session-id': session.id },
    el('span', { class: 'name', 'data-testid': 'session-row-name', text: session.name }),
    el('p', { class: 'meta', text: `${formatDate(session.createdAt)} · ${rated} · ${season}` }),
    session.notes ? el('p', { class: 'notes', text: session.notes }) : null,
    el('div', { class: 'controls' },
      el('button', {
        type: 'button', class: 'primary', 'data-testid': `session-open-${session.id}`,
        'aria-label': `Abrir la sesión ${session.name}`, text: 'Abrir', onClick: () => onOpen(session.id),
      }),
      el('button', {
        type: 'button', 'data-testid': `session-edit-${session.id}`,
        'aria-label': `Editar la sesión ${session.name}`, text: 'Editar', onClick: () => edit(session),
      }),
      el('button', {
        type: 'button', class: 'danger', 'data-testid': `session-delete-${session.id}`,
        'aria-label': `Borrar la sesión ${session.name}`, text: 'Borrar', onClick: () => remove(session),
      })));
}

export async function loadHistory() {
  const list = $('session-list');
  if (!list.children.length) setStatus('Cargando sesiones…');
  try {
    const { sessions } = await api.listSessions();
    clear(list);
    if (!sessions?.length) {
      setStatus('Todavía no hay sesiones. Crea la primera para empezar a probar colores.');
      return;
    }
    setStatus('');
    list.append(...sessions.map(row));
  } catch (err) {
    clear(list);
    setStatus(err.message, { retry: true });
  }
}

function edit(session) {
  openEditDialog(session, async (values) => {
    await api.updateSession(session.id, values);
    toast('Sesión actualizada.');
    await loadHistory();
  });
}

async function remove(session) {
  const ok = await confirmDialog(`¿Borrar la sesión «${session.name}», todas sus valoraciones y su foto guardada en este navegador? Esta acción no se puede deshacer.`);
  if (!ok) return;
  try {
    await api.deleteSession(session.id);
    toast('Sesión borrada.');
  } catch (err) {
    showError(err);
  }
  await loadHistory();
}

export function initHistory(options) {
  onOpen = options.onOpen;
  onCreated = options.onCreated;
  const form = $('session-form');
  const error = $('session-form-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('session-name').value.trim();
    const notes = $('session-notes').value.trim();
    const problem = validateSessionFields(name, notes);
    error.hidden = !problem;
    if (problem) {
      error.textContent = problem;
      $('session-name').focus();
      return;
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const { session } = await api.createSession(notes ? { name, notes } : { name });
      form.reset();
      onCreated(); // primer dato guardado: se pide almacenamiento persistente
      await onOpen(session.id);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });

  $('history-retry').addEventListener('click', loadHistory);
}
