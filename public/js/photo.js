// Foto fija de la sesión: tomada de la cámara o subida desde el dispositivo.
// Se guarda SOLO en este navegador (IndexedDB, una por sesión, máx. 1280 px de lado).
// No se envía a ningún sitio.
import { $, canvasToBlob } from './dom.js';
import { camera } from './camera.js';
import { showError, toast } from './ui.js';
import { transact, req } from './db.js';

const MAX_SIDE = 1280;

/** Almacén local de fotos, con el id de sesión como clave. */
const photoStore = {
  get: (sessionId) => transact(['photos'], 'readonly', (store) => req(store('photos').get(Number(sessionId)))),
  put: (sessionId, blob) => transact(['photos'], 'readwrite', (store) => req(store('photos').put(blob, Number(sessionId)))),
  delete: (sessionId) => transact(['photos'], 'readwrite', (store) => req(store('photos').delete(Number(sessionId)))),
};

/** Borra la foto guardada de una sesión sin fallar si no hay almacenamiento. */
export async function deleteStoredPhoto(sessionId) {
  try {
    await photoStore.delete(sessionId);
  } catch {
    /* sin IndexedDB no hay nada que borrar */
  }
}

/** Copia una fuente a un canvas reducido a MAX_SIDE; el canvas es la "imagen original" de trabajo. */
function toCanvas(source, sw, sh, mirrored = false) {
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (mirrored) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decodifica respetando la orientación EXIF (fotos de móvil en vertical). */
async function decode(blob) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, w: bitmap.width, h: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* se intenta con <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, close: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Vuelve a codificar una imagen de origen no confiable (p. ej. la de un archivo de copia) como
 * JPEG de MAX_SIDE como mucho. Si no es una imagen legible, lanza.
 */
export async function normalizePhoto(blob) {
  const decoded = await decode(blob);
  const canvas = toCanvas(decoded.source, decoded.w, decoded.h);
  decoded.close();
  return canvasToBlob(canvas, 'image/jpeg', 0.9);
}

let current = null; // canvas con la foto, o null
let sessionId = null;
let token = 0;
const listeners = new Set();

function render() {
  const view = $('photo-canvas');
  const showing = Boolean(current) && !camera.isOn;
  if (current && (view.dataset.stamp !== current.dataset.stamp)) {
    view.width = current.width;
    view.height = current.height;
    view.getContext('2d').drawImage(current, 0, 0);
    view.dataset.stamp = current.dataset.stamp;
  }
  if (!current) delete view.dataset.stamp;
  view.hidden = !showing;
  const stage = $('stage');
  stage.classList.toggle('has-photo', showing);
  stage.dataset.source = camera.isOn ? 'camera' : current ? 'photo' : 'none';
  stage.dataset.hasPhoto = String(Boolean(current));
  // «Voltear vista» actúa sobre lo que se ve: el vídeo (espejo) o la foto fija (se voltea y se guarda así).
  const mirror = $('camera-mirror');
  mirror.disabled = !camera.isOn && !current;
  if (camera.isOn) mirror.setAttribute('aria-pressed', String(camera.mirrored));
  else mirror.removeAttribute('aria-pressed');
  $('photo-take').disabled = !camera.isOn;
  $('photo-remove').hidden = !current;
  $('photo-status').textContent = current
    ? 'Foto de la sesión guardada solo en este navegador. La tela, la comparación y la captura funcionan sobre ella.'
    : '';
}

function notify() {
  render();
  listeners.forEach((fn) => fn());
}

async function adopt(canvas, message) {
  canvas.dataset.stamp = `${Date.now()}-${Math.random()}`;
  current = canvas;
  const owner = sessionId;
  notify();
  try {
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
    if (owner != null) await photoStore.put(owner, blob);
    toast(message);
  } catch {
    toast('La foto se usará ahora, pero este navegador no permite guardarla: se perderá al recargar.', 'error');
  }
}

export const photo = {
  /** Canvas con la foto de la sesión (como mucho 1280 px de lado), o null. */
  get canvas() { return current; },
  onChange(fn) { listeners.add(fn); },

  async load(id) {
    const mine = ++token;
    sessionId = id;
    current = null;
    notify();
    let blob = null;
    try {
      blob = await photoStore.get(id);
    } catch {
      /* sin IndexedDB: la sesión simplemente no tiene foto guardada */
    }
    if (mine !== token || !blob) return;
    try {
      const decoded = await decode(blob);
      if (mine !== token) { decoded.close(); return; }
      const canvas = toCanvas(decoded.source, decoded.w, decoded.h);
      decoded.close();
      canvas.dataset.stamp = `${Date.now()}-${Math.random()}`;
      current = canvas;
      notify();
    } catch {
      /* foto guardada ilegible: se ignora */
    }
  },

  unload() {
    token++;
    sessionId = null;
    current = null;
    notify();
  },

  async setFromFile(file) {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) {
      throw new Error('Ese archivo no es una imagen. Elige una foto en formato JPG, PNG o similar.');
    }
    let decoded;
    try {
      decoded = await decode(file);
    } catch {
      throw new Error('No se pudo leer esa imagen. Prueba con otra foto (JPG o PNG).');
    }
    const canvas = toCanvas(decoded.source, decoded.w, decoded.h);
    decoded.close();
    camera.stop();
    await adopt(canvas, 'Foto cargada. Se guarda solo en este navegador.');
  },

  /** Congela el fotograma actual de la cámara, tal como se ve (con espejo si está activo). */
  async takeFromCamera() {
    const video = camera.video;
    if (!camera.isOn || !video.videoWidth) {
      toast('Activa la cámara y espera a que se vea la imagen antes de tomar la foto.', 'error');
      return;
    }
    const canvas = toCanvas(video, video.videoWidth, video.videoHeight, camera.mirrored);
    camera.stop();
    await adopt(canvas, 'Foto tomada. Se guarda solo en este navegador.');
  },

  /** Voltea la foto en horizontal (y la guarda volteada: tela, análisis e informe la usan así). */
  async flip() {
    if (!current) return;
    await adopt(toCanvas(current, current.width, current.height, true), 'Foto volteada.');
  },

  async remove() {
    const owner = sessionId;
    current = null;
    notify();
    if (owner != null) await deleteStoredPhoto(owner);
    toast('Foto quitada de este navegador.');
  },
};

export function initPhoto() {
  const input = $('photo-file');
  $('photo-upload').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    try {
      await photo.setFromFile(file);
    } catch (err) {
      showError(err);
    }
  });
  $('photo-take').addEventListener('click', () => photo.takeFromCamera().catch(showError));
  $('photo-remove').addEventListener('click', () => photo.remove().catch(showError));
  camera.onChange(render);
  camera.setStillFlip(() => photo.flip().catch(showError));
  render();
}
