// Avisos y diálogos compartidos.
import { $ } from './dom.js';

let toastTimer = null;

export function toast(message, type = 'info') {
  const node = $('toast');
  node.textContent = message;
  node.dataset.type = type;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, type === 'error' ? 8000 : 4500);
}

export function showError(err) {
  toast(err?.message || 'Ha ocurrido un error inesperado.', 'error');
}

/** Diálogo de confirmación. Resuelve true solo si se pulsa el botón de aceptar. */
export function confirmDialog(message, acceptLabel = 'Borrar') {
  const dialog = $('confirm-dialog');
  $('confirm-message').textContent = message;
  $('confirm-accept').textContent = acceptLabel;
  return new Promise((resolve) => {
    // Los botones resuelven directamente; el evento 'close' solo cubre Escape.
    const finish = (value) => {
      $('confirm-accept').removeEventListener('click', accept);
      $('confirm-cancel').removeEventListener('click', cancel);
      dialog.removeEventListener('close', dismissed);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const accept = () => finish(true);
    const cancel = () => finish(false);
    const dismissed = () => finish(false);
    $('confirm-accept').addEventListener('click', accept);
    $('confirm-cancel').addEventListener('click', cancel);
    dialog.addEventListener('close', dismissed);
    dialog.showModal();
    $('confirm-cancel').focus();
  });
}

export function validateSessionFields(name, notes) {
  if (name.length < 1) return 'Escribe un nombre para la sesión.';
  if (name.length > 80) return 'El nombre no puede superar los 80 caracteres.';
  if (notes.length > 1000) return 'Las notas no pueden superar los 1000 caracteres.';
  return null;
}

/**
 * Diálogo para renombrar / editar notas. `onSave({name, notes})` hace la petición;
 * si falla, el error se muestra dentro del diálogo y este sigue abierto.
 */
export function openEditDialog(session, onSave) {
  const dialog = $('edit-dialog');
  const form = $('edit-form');
  const error = $('edit-error');
  $('edit-name').value = session.name ?? '';
  $('edit-notes').value = session.notes ?? '';
  error.hidden = true;

  const fail = (message) => { error.textContent = message; error.hidden = false; };
  const submit = async (event) => {
    event.preventDefault();
    const name = $('edit-name').value.trim();
    const notes = $('edit-notes').value.trim();
    const problem = validateSessionFields(name, notes);
    if (problem) return fail(problem);
    try {
      await onSave({ name, notes });
      dialog.close();
    } catch (err) {
      fail(err?.message || 'No se pudieron guardar los cambios.');
    }
  };
  // Asignación directa: cada apertura sustituye a los manejadores de la anterior.
  form.onsubmit = submit;
  $('edit-cancel').onclick = () => dialog.close();
  dialog.showModal();
  $('edit-name').focus();
}
