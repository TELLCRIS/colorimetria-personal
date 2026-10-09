// Copia de seguridad: los datos solo viven en este navegador, así que se pueden guardar en un
// archivo .json y restaurar aquí o en otro dispositivo. Restaurar AÑADE sesiones; nunca sobrescribe.
import { api } from './api.js';
import { $, downloadBlob, plural } from './dom.js';
import { buildBackup, parseBackup } from './core/backup.js';
import { normalizePhoto } from './photo.js';

const MAX_FILE_BYTES = 80 * 1024 * 1024;
let afterRestore = () => {};

function setStatus(text, type = 'info') {
  const node = $('backup-status');
  node.textContent = text;
  node.dataset.type = type;
  node.hidden = !text;
}

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

function fromDataUrl(dataUrl) {
  const [head, body] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.slice(5, head.indexOf(';')) });
}

/** Pide al navegador que no borre los datos por su cuenta (lo concede o no según su criterio). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* sin API de almacenamiento persistente */
  }
  await showStorageNotice();
}

/** Aviso discreto si los datos no están protegidos o no se pueden guardar. */
async function showStorageNotice() {
  const notice = $('storage-notice');
  let text = '';
  if (typeof indexedDB === 'undefined') {
    text = 'Este navegador no permite guardar datos (puede ser una ventana privada): lo que hagas se perderá al cerrar.';
  } else {
    try {
      if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
        text = 'El navegador puede borrar estos datos si necesita espacio o si limpias los datos de navegación: guarda una copia de vez en cuando.';
      }
    } catch {
      /* no se puede saber: no se avisa */
    }
  }
  notice.textContent = text;
  notice.hidden = !text;
}

async function save() {
  const withPhotos = $('backup-include-photos').checked;
  const sessions = await api.exportSessions({ photos: withPhotos });
  if (!sessions.length) {
    setStatus('Todavía no hay sesiones que guardar.');
    return;
  }
  let photos = 0;
  for (const session of sessions) {
    if (session.photoBlob) {
      session.photo = await toDataUrl(session.photoBlob);
      photos++;
    }
  }
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const file = new Blob([JSON.stringify(buildBackup(sessions))], { type: 'application/json' });
  downloadBlob(file, `colorimetria-copia-${date}.json`);
  setStatus(`Copia guardada en tu dispositivo: ${plural(sessions.length, 'sesión', 'sesiones')}${withPhotos ? ` y ${plural(photos, 'foto', 'fotos')}` : ', sin fotos'}.`);
}

async function restore(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setStatus('El archivo es demasiado grande para ser una copia de esta aplicación.', 'error');
    return;
  }
  setStatus('Leyendo la copia…');
  const parsed = parseBackup(await file.text()); // valida versión, tipos, rangos y tamaños
  let photosRejected = parsed.skippedPhotos;
  for (const session of parsed.sessions) {
    session.photoBlob = null;
    if (!session.photo) continue;
    try {
      session.photoBlob = await normalizePhoto(fromDataUrl(session.photo)); // se vuelve a codificar: no se guarda tal cual
    } catch {
      photosRejected++;
    }
  }
  const { imported, duplicates } = await api.importSessions(parsed.sessions);
  const parts = [
    imported ? `${plural(imported, 'sesión restaurada', 'sesiones restauradas')}.` : 'No se ha añadido ninguna sesión.',
    duplicates ? `${plural(duplicates, 'ya estaba', 'ya estaban')} en este navegador y no se ${duplicates === 1 ? 'ha' : 'han'} duplicado.` : '',
    parsed.rejected ? `${plural(parsed.rejected, 'sesión rechazada', 'sesiones rechazadas')} por contener datos no válidos.` : '',
    parsed.skippedRatings ? `${plural(parsed.skippedRatings, 'valoración omitida', 'valoraciones omitidas')} por ser de colores que ya no existen.` : '',
    photosRejected ? `${plural(photosRejected, 'foto descartada', 'fotos descartadas')} por no ser una imagen válida.` : '',
  ];
  setStatus(parts.filter(Boolean).join(' '), imported || duplicates ? 'info' : 'error');
  $('backup-status').dataset.imported = String(imported);
  $('backup-status').dataset.duplicates = String(duplicates);
  $('backup-status').dataset.rejected = String(parsed.rejected);
  if (imported) requestPersistence();
  await afterRestore();
}

export function initBackup(options) {
  afterRestore = options.afterRestore;
  const fail = (err) => setStatus(err?.message || 'No se pudo completar la operación.', 'error');
  const input = $('backup-file');
  $('backup-save').addEventListener('click', () => save().catch(fail));
  $('backup-restore').addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    restore(file).catch(fail);
  });
  showStorageNotice();
}
