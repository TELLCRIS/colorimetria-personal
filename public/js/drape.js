// Drapeado virtual: dibuja la "tela" sobre el vídeo o la foto y compone la captura.
// Todo ocurre en el navegador; la captura se descarga, nunca se sube.
import { $, el, clear, safeHex, textColorFor, canvasToBlob, downloadBlob, stamp } from './dom.js';
import { state, on, setSelection } from './store.js';
import { camera } from './camera.js';
import { photo } from './photo.js';
import { showError, toast } from './ui.js';

const NEUTRAL = '#CFC7BD';
const CAPTURE_W = 1280;
const CAPTURE_H = 960;

const DEFAULT_NECK = 0.38;

/**
 * Franja horizontal que ocupa la imagen (vídeo o foto) dentro de w×h cuando se dibuja con
 * drawFitHeight. La tela se ciñe a esa franja para caer sobre los hombros y no sobre las bandas.
 */
export function sourceFrame(sw, sh, w, h) {
  if (!sw || !sh) return { x: 0, w, imgX: 0, imgW: w };
  const imgW = (sw * h) / sh; // la imagen completa, aunque se recorte por los lados
  const dw = Math.min(w, imgW);
  return { x: (w - dw) / 2, w: dw, imgX: (w - imgW) / 2, imgW };
}

// Silueta de prenda con ajuste manual: cuello centrado en la imagen, hombros que caen hacia los lados.
function manualPath(h, heightRatio, frame, neckRatio) {
  const left = frame.x;
  const right = frame.x + frame.w;
  const cx = frame.x + frame.w / 2;
  const top = h * (1 - heightRatio); // base del cuello
  const clothH = h - top;
  const neckHalf = (frame.w * neckRatio) / 2;
  const drop = Math.min(clothH * 0.45, frame.w * 0.16); // caída del hombro hasta el borde
  const dip = Math.min(clothH * 0.55, neckHalf * 0.9); // profundidad del escote
  const shoulderW = cx - neckHalf - left;
  const path = new Path2D();
  path.moveTo(left, h);
  path.lineTo(left, top + drop);
  path.quadraticCurveTo(left + shoulderW * 0.55, top + drop * 0.12, cx - neckHalf, top);
  // Escote curvo bajo la barbilla
  path.bezierCurveTo(cx - neckHalf * 0.55, top + dip * 1.33, cx + neckHalf * 0.55, top + dip * 1.33, cx + neckHalf, top);
  path.quadraticCurveTo(right - shoulderW * 0.55, top + drop * 0.12, right, top + drop);
  path.lineTo(right, h);
  path.closePath();
  return { path, top, cx };
}

// Silueta de prenda sobre los hombros detectados (pose en proporciones de la imagen).
function posePath(h, frame, pose) {
  const left = frame.x;
  const right = frame.x + frame.w;
  const px = (nx) => frame.imgX + nx * frame.imgW;
  const clampX = (x) => Math.min(right, Math.max(left, x));
  const cx = clampX(px(pose.cx));
  const neckHalf = pose.neckHalf * frame.imgW;
  const shoulderY = Math.min(h * 0.97, pose.sy * h);
  const top = Math.min(shoulderY, pose.top * h);
  const lx = clampX(px(pose.lx));
  const rx = clampX(px(pose.rx));
  const neckL = Math.max(lx, cx - neckHalf);
  const neckR = Math.min(rx, cx + neckHalf);
  const dip = Math.min((h - top) * 0.55, neckHalf * 0.75);
  // Más allá del hombro, la manga baja casi recta: la prenda cubre torso y brazos, no el fondo.
  const sleeve = (rx - lx) * 0.16;
  const armL = clampX(lx - sleeve);
  const armR = clampX(rx + sleeve);
  const path = new Path2D();
  path.moveTo(armL, h);
  path.lineTo(armL, Math.min(h, shoulderY + sleeve * 1.6));
  path.quadraticCurveTo(armL, shoulderY, lx, shoulderY);
  path.quadraticCurveTo((lx + neckL) / 2, shoulderY - (shoulderY - top) * 0.25, neckL, top);
  path.bezierCurveTo(cx - neckHalf * 0.55, top + dip * 1.33, cx + neckHalf * 0.55, top + dip * 1.33, neckR, top);
  path.quadraticCurveTo((rx + neckR) / 2, shoulderY - (shoulderY - top) * 0.25, rx, shoulderY);
  path.quadraticCurveTo(armR, shoulderY, armR, Math.min(h, shoulderY + sleeve * 1.6));
  path.lineTo(armR, h);
  path.closePath();
  return { path, top, cx };
}

/** Dibuja la tela en un contexto de w×h. Se usa igual en pantalla, en la captura y en el informe. */
export function drawCloth(ctx, w, h, { colorA, colorB, compare, heightRatio, frame = { x: 0, w, imgX: 0, imgW: w }, neckRatio = DEFAULT_NECK, pose = null }) {
  const { path, top, cx } = pose ? posePath(h, frame, pose) : manualPath(h, heightRatio, frame, neckRatio);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, compare ? cx : w, h);
  if (compare) {
    ctx.fillStyle = colorB;
    ctx.fillRect(cx, 0, w - cx, h);
  }
  // Sombreado suave para que parezca tejido y no un bloque plano
  const shade = ctx.createLinearGradient(0, top, 0, h);
  shade.addColorStop(0, 'rgba(255,255,255,0.10)');
  shade.addColorStop(0.35, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, w, h);
  if (compare) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(cx - Math.max(1, w / 400), 0, Math.max(2, w / 200), h);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(1, w / 500);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.stroke(path);
}

/**
 * Dibuja una fuente (vídeo, foto) ajustada al ALTO de w×h, centrada y sin deformarla:
 * si es más vertical que el hueco se ve entera, con bandas a los lados (lo que ya hubiera pintado);
 * si es más apaisada, se recorta solo por los lados. Así nunca se pierde frente ni barbilla.
 */
export function drawFitHeight(ctx, source, sw, sh, w, h, mirrored = false) {
  const scale = h / sh;
  const dw = sw * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  if (mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (w - dw) / 2, 0, dw, h);
  ctx.restore();
}

/** Dibuja una fuente cubriendo w×h sin deformarla, como object-fit: cover. */
export function drawCover(ctx, source, sw, sh, w, h, mirrored = false) {
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.save();
  if (mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
}

export function drapeHeightRatio() {
  return Number($('drape-height').value) / 100;
}

export function drapeNeckRatio() {
  return Number($('drape-neck').value) / 100;
}

/** Tamaño de la imagen visible en el escenario (vídeo en vivo o foto), o null si no hay. */
function currentSource() {
  const video = camera.video;
  if (camera.isOn && video.videoWidth > 0) {
    return { el: video, sw: video.videoWidth, sh: video.videoHeight, mirrored: camera.mirrored, live: true };
  }
  if (photo.canvas) return { el: photo.canvas, sw: photo.canvas.width, sh: photo.canvas.height, mirrored: false, live: false };
  return null;
}

// --- Ajuste automático a los hombros ---
const AUTO_KEY = 'colorimetria.drapeAuto';
const LIVE_INTERVAL_MS = 120;
const LOAD_TIMEOUT_MS = 30000;
let pose = null; // geometría detectada para la fuente visible, o null
let poseRun = 0; // invalida las detecciones en curso cuando cambia la fuente
let poseFailed = false; // el modelo no se pudo cargar: no se reintenta hasta volver a marcar la casilla
let poseIdle = true; // no hay ninguna detección en marcha
let poseDone = false; // la foto visible ya se analizó

/** Hombros detectados para la fuente visible, o null si el ajuste es manual. */
export function currentPose() {
  return pose;
}

function setPose(next, status) {
  const changed = Boolean(pose) !== Boolean(next);
  pose = next;
  $('drape-auto-status').textContent = status;
  $('drape-height').disabled = Boolean(pose);
  $('drape-neck').disabled = Boolean(pose);
  redraw();
  if (changed || !camera.isOn) document.dispatchEvent(new CustomEvent('drape:pose'));
}

// Suaviza el movimiento en vídeo para que la tela no tiemble.
function blend(previous, next) {
  if (!previous) return next;
  const mixed = {};
  for (const key of Object.keys(next)) mixed[key] = previous[key] * 0.6 + next[key] * 0.4;
  return mixed;
}

async function trackPose() {
  const run = ++poseRun;
  poseIdle = false;
  poseDone = false;
  try {
    if (!$('drape-auto').checked) { setPose(null, ''); return; }
    if (poseFailed) return;
    if (!currentSource()) { setPose(null, 'Activa la cámara o sube una foto para ajustar la tela a tus hombros.'); return; }
    if (!pose) $('drape-auto-status').textContent = 'Buscando tus hombros…';
    let first = true;
    while (run === poseRun) {
      const source = currentSource();
      if (!source || !$('stage').clientWidth) return; // sin imagen o pestaña oculta: se reintenta al redibujar
      let found;
      try {
        const { detectPose } = await import('./pose.js');
        // Si la descarga del modelo se atasca, no se deja al usuario esperando sin fin.
        const giveUp = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS));
        found = await Promise.race([detectPose(source.el, source.sw, source.sh, source.mirrored), giveUp]);
      } catch {
        if (run !== poseRun) return;
        poseFailed = true;
        setPose(null, 'No se pudo cargar el ajuste automático (hace falta conexión a internet). Usa los controles de abajo, o desmarca y vuelve a marcar la casilla para reintentar.');
        return;
      }
      if (run !== poseRun) return;
      if (!source.live) poseDone = true; // en una foto basta con una detección
      if (found) {
        setPose(source.live && !first ? blend(pose, found) : found, 'Hombros detectados: la tela se ajusta sola.');
      } else {
        setPose(null, 'No se ven bien los hombros: aléjate un poco o ajusta la tela con los controles de abajo.');
      }
      first = false;
      if (!source.live) return;
      await new Promise((resolve) => setTimeout(resolve, LIVE_INTERVAL_MS));
    }
  } finally {
    if (run === poseRun) poseIdle = true;
  }
}

function currentCloth() {
  const { a, b, compare } = state.selection;
  const colorA = state.colorById.get(a);
  const colorB = state.colorById.get(b);
  const comparing = Boolean(compare && colorA && colorB);
  return {
    colorA, colorB, comparing,
    options: {
      colorA: safeHex(colorA?.hex),
      colorB: safeHex(colorB?.hex),
      compare: comparing,
      heightRatio: drapeHeightRatio(),
      neckRatio: drapeNeckRatio(),
    },
  };
}

function pill(prefix, color) {
  const hex = safeHex(color.hex);
  return el('span', {
    class: 'color-pill',
    style: { backgroundColor: hex, color: textColorFor(hex) },
    text: `${prefix}${color.name}`,
  });
}

export function redraw() {
  const canvas = $('drape-canvas');
  const stage = $('stage');
  const cssW = stage.clientWidth;
  const cssH = stage.clientHeight;
  const { colorA, colorB, comparing, options } = currentCloth();

  canvas.dataset.colorA = colorA?.id ?? '';
  canvas.dataset.colorB = comparing ? colorB.id : '';
  canvas.dataset.compare = String(comparing);
  canvas.dataset.height = $('drape-height').value;

  const label = clear($('drape-label'));
  if (colorA) {
    label.append(comparing ? pill('Izquierda: ', colorA) : pill('Color de prueba: ', colorA));
    if (comparing) label.append(pill('Derecha: ', colorB));
    canvas.setAttribute('aria-label', comparing
      ? `Tela virtual: ${colorA.name} a la izquierda y ${colorB.name} a la derecha`
      : `Tela virtual de color ${colorA.name}`);
  }

  if (!cssW || !cssH) return; // pestaña oculta: se redibuja al volver a mostrarse
  // Si la detección quedó pendiente (la vista estaba oculta), se retoma ahora.
  if (poseIdle && !poseDone && !poseFailed && $('drape-auto').checked && currentSource()) trackPose();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const source = currentSource();
  canvas.dataset.auto = String(Boolean(pose && source));
  if (colorA) {
    drawCloth(ctx, w, h, {
      ...options,
      frame: source ? sourceFrame(source.sw, source.sh, w, h) : undefined,
      pose: source ? pose : null,
    });
  }
}

/** Compone el fondo visible (vídeo, foto o neutro) + tela y descarga un PNG en el dispositivo. */
async function capture() {
  const { colorA, colorB, comparing, options } = currentCloth();
  if (!colorA) return;
  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_W;
  canvas.height = CAPTURE_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = NEUTRAL;
  ctx.fillRect(0, 0, CAPTURE_W, CAPTURE_H);
  const video = camera.video;
  let background = 'neutro';
  if (camera.isOn && video.videoWidth > 0) {
    drawFitHeight(ctx, video, video.videoWidth, video.videoHeight, CAPTURE_W, CAPTURE_H, camera.mirrored);
    background = 'cámara';
  } else if (photo.canvas) {
    drawFitHeight(ctx, photo.canvas, photo.canvas.width, photo.canvas.height, CAPTURE_W, CAPTURE_H);
    background = 'foto';
  }
  const source = currentSource();
  drawCloth(ctx, CAPTURE_W, CAPTURE_H, {
    ...options,
    frame: source ? sourceFrame(source.sw, source.sh, CAPTURE_W, CAPTURE_H) : undefined,
    pose: source ? pose : null,
  });

  const blob = await canvasToBlob(canvas);
  const name = comparing ? `${colorA.id}-vs-${colorB.id}` : colorA.id;
  downloadBlob(blob, `colorimetria-${name}-${stamp()}.png`);
  toast(background === 'neutro'
    ? 'Imagen descargada (sin cámara ni foto, sobre fondo neutro). No se ha enviado a ningún servidor.'
    : `Imagen descargada en tu dispositivo (fondo: ${background}). No se ha enviado a ningún servidor.`);
}

function syncCompareControls() {
  const { compare, slot } = state.selection;
  $('compare-toggle').checked = compare;
  $('compare-slots').hidden = !compare;
  const radio = document.querySelector(`input[name="compare-slot"][value="${slot === 'b' ? 'b' : 'a'}"]`);
  if (radio) radio.checked = true;
}

export function initDrape() {
  $('drape-height').addEventListener('input', redraw);
  $('drape-neck').addEventListener('input', redraw);
  // La tela se ciñe a la imagen: hay que redibujar cuando cambia la fuente o su tamaño.
  const sourceChanged = () => { redraw(); trackPose(); };
  camera.video.addEventListener('loadedmetadata', sourceChanged);
  camera.video.addEventListener('resize', redraw);
  photo.onChange(sourceChanged);
  camera.onChange(sourceChanged);

  const auto = $('drape-auto');
  try { auto.checked = localStorage.getItem(AUTO_KEY) !== 'off'; } catch { /* sin almacenamiento: queda activado */ }
  auto.addEventListener('change', () => {
    try { localStorage.setItem(AUTO_KEY, auto.checked ? 'on' : 'off'); } catch { /* preferencia no guardada */ }
    poseFailed = false;
    trackPose();
  });
  $('capture').addEventListener('click', () => capture().catch(showError));

  $('compare-toggle').addEventListener('change', (event) => {
    if (!event.target.checked) {
      setSelection({ compare: false, slot: 'a' });
      return;
    }
    // Al activar, la mitad derecha arranca con otro color y queda lista para elegir.
    let { a, b } = state.selection;
    if (!b || b === a) {
      const index = state.colors.findIndex((c) => c.id === a);
      b = state.colors[(index + 1) % state.colors.length]?.id ?? a;
    }
    setSelection({ compare: true, b, slot: 'b' });
  });

  document.querySelectorAll('input[name="compare-slot"]').forEach((radio) => {
    radio.addEventListener('change', () => { if (radio.checked) setSelection({ slot: radio.value }); });
  });

  // El lienzo sigue al escenario: cambios de tamaño, giro del teléfono y barra del navegador.
  new ResizeObserver(redraw).observe($('stage'));
  window.addEventListener('resize', redraw);
  window.addEventListener('orientationchange', () => setTimeout(redraw, 150));
  const sync = () => { syncCompareControls(); redraw(); };
  on('session', trackPose);
  on('selection', sync);
  on('session', sync);
}
