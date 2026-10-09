// Cámara en vivo. El permiso se pide solo al pulsar "Activar cámara";
// las pistas se liberan al apagar, al cambiar de pestaña o al salir.
import { $ } from './dom.js';

let stream = null;
let facing = 'user';
let mirrored = true;
let multiple = false;
let requestId = 0;
const listeners = new Set();
let stillFlip = null; // con la cámara apagada, «Voltear vista» voltea la foto fija

const video = () => $('video');

/** 'ok' | 'insecure' (http por red local: no hay getUserMedia) | 'unsupported' */
function cameraSupport() {
  if (window.isSecureContext === false) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return 'ok';
}

function idleText() {
  const support = cameraSupport();
  if (support === 'insecure') return 'Sube una foto para empezar: en esta dirección la cámara en vivo no está disponible.';
  if (support === 'unsupported') return 'Sube una foto para empezar: este navegador no ofrece cámara en vivo.';
  return 'Activa la cámara o sube una foto, y coloca el rostro centrado, frente a luz natural indirecta.';
}

function describeError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No hay permiso para usar la cámara. Concédelo en el navegador y vuelve a intentarlo, o usa «Subir foto». La tela virtual sigue disponible sobre fondo neutro.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró ninguna cámara en este equipo. Puedes subir una foto o seguir usando la tela virtual sobre fondo neutro.';
    case 'NotReadableError':
    case 'AbortError':
      return 'La cámara está en uso por otra aplicación o no responde. Ciérrala allí y vuelve a intentarlo.';
    default:
      return 'No se pudo acceder a la cámara. Revisa los permisos y abre la página desde HTTPS o localhost, o usa «Subir foto».';
  }
}

function render(message) {
  const live = Boolean(stream);
  const support = cameraSupport();
  $('stage').classList.toggle('live', live);
  video().hidden = !live;
  video().classList.toggle('mirrored', mirrored);
  $('camera-start').disabled = live || support !== 'ok';
  $('camera-stop').disabled = !live;
  $('camera-switch').hidden = !multiple;
  $('camera-switch').disabled = !live;
  $('camera-mirror').setAttribute('aria-pressed', String(mirrored));
  // Sin cámara en vivo, "Subir foto" pasa a ser el camino principal.
  $('camera-start').classList.toggle('primary', support === 'ok');
  $('photo-upload').classList.toggle('primary', support !== 'ok');
  const notice = $('camera-insecure');
  notice.hidden = support === 'ok';
  if (support === 'insecure') {
    notice.textContent = 'La cámara en vivo solo funciona en una dirección segura. Abre la app con una dirección que empiece por https:// (o con localhost en el mismo equipo). Mientras tanto usa «Subir foto»: en el teléfono te deja hacerte la foto con la cámara del sistema.';
  } else if (support === 'unsupported') {
    notice.textContent = 'Este navegador no ofrece cámara en vivo. Usa «Subir foto»: en el teléfono te deja hacerte la foto con la cámara del sistema.';
  }
  $('stage').dataset.cameraSupport = support;
  if (message !== undefined) $('stage-placeholder').textContent = message;
  listeners.forEach((fn) => fn());
}

function release(target) {
  target?.getTracks().forEach((track) => track.stop());
}

async function detectCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    multiple = devices.filter((d) => d.kind === 'videoinput').length > 1;
  } catch {
    multiple = false;
  }
}

async function open(mode) {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false });
  } catch (err) {
    // Equipos con una sola cámara que no admite la orientación pedida
    if (err?.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    throw err;
  }
}

export const camera = {
  get isOn() { return Boolean(stream); },
  get mirrored() { return mirrored; },
  get video() { return video(); },
  onChange(fn) { listeners.add(fn); },
  /** Registra qué hacer con «Voltear vista» cuando lo que se ve es una foto fija. */
  setStillFlip(fn) { stillFlip = fn; },
  refresh() { render(stream ? undefined : idleText()); },

  async start() {
    if (stream) return;
    if (cameraSupport() !== 'ok') {
      render(idleText());
      return;
    }
    const mine = ++requestId;
    $('camera-start').disabled = true;
    $('stage-placeholder').textContent = 'Esperando el permiso de la cámara…';
    try {
      const got = await open(facing);
      if (mine !== requestId) { release(got); return; } // se salió de la vista mientras se pedía permiso
      stream = got;
      got.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (stream === got) camera.stop('La cámara se ha desconectado.');
      });
      video().srcObject = got;
      await detectCameras();
      if (mine !== requestId) return;
      render('');
      await video().play().catch(() => {});
    } catch (err) {
      if (mine !== requestId) return;
      stream = null;
      render(describeError(err));
    }
  },

  stop(message = 'Cámara apagada. Actívala cuando quieras continuar.') {
    requestId++;
    const wasOn = Boolean(stream);
    release(stream);
    stream = null;
    video().srcObject = null;
    render(wasOn ? message : undefined);
  },

  reset() {
    this.stop();
    render(idleText());
  },

  toggleMirror() {
    mirrored = !mirrored;
    render();
  },

  /** Cambia entre cámara frontal y trasera (la trasera no se muestra en espejo). */
  async switchFacing() {
    facing = facing === 'user' ? 'environment' : 'user';
    mirrored = facing === 'user';
    if (!stream) { render(); return; }
    requestId++;
    release(stream);
    stream = null;
    video().srcObject = null;
    await this.start();
  },
};

export function initCamera() {
  $('camera-start').addEventListener('click', () => camera.start());
  $('camera-stop').addEventListener('click', () => camera.stop());
  $('camera-mirror').addEventListener('click', () => (stream || !stillFlip ? camera.toggleMirror() : stillFlip()));
  $('camera-switch').addEventListener('click', () => camera.switchFacing());
  window.addEventListener('pagehide', () => camera.stop());
  render(idleText());
}
