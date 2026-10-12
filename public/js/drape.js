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
const DEFAULT_HEIGHT = 0.34; // valor neutro del control de altura

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

/**
 * Polo de molde colocado bajo el rostro detectado (fit en proporciones de la imagen). Es amplio a
 * propósito: hombros y mangas más anchos que el cuerpo y cuello alto, para tapar por completo la
 * ropa real. Los controles de altura y cuello hacen el ajuste fino sobre esa posición.
 */
function moldPath(h, frame, fit, heightRatio, neckRatio, mirrored) {
  const left = frame.x;
  const right = frame.x + frame.w;
  const clampX = (x) => Math.min(right, Math.max(left, x));
  const cx = clampX(frame.imgX + (mirrored ? 1 - fit.cx : fit.cx) * frame.imgW);
  const faceW = fit.fw * frame.imgW;
  const faceH = fit.fh * h;
  const lift = (heightRatio - DEFAULT_HEIGHT) * h; // subir el control sube el polo
  // Lados del cuello a la altura de la barbilla: como una tela de drapeado, sube hasta el rostro
  // y así no asoma el cuello de la ropa real.
  const top = Math.min(h * 0.97, fit.chin * h - faceH * 0.04 - lift);
  const neckHalf = faceW * 0.42 * (neckRatio / DEFAULT_NECK);
  const dip = faceH * 0.12;
  const shoulderHalf = Math.max(neckHalf * 1.5, faceW * 1.7);
  const armHalf = faceW * 2.2;
  const shoulderY = top + faceH * 0.12;
  const sleeveY = Math.min(h, shoulderY + faceH * 0.6);
  const neckL = cx - neckHalf;
  const neckR = cx + neckHalf;
  const path = new Path2D();
  path.moveTo(clampX(cx - armHalf), h);
  path.lineTo(clampX(cx - armHalf), sleeveY);
  path.quadraticCurveTo(clampX(cx - armHalf), shoulderY, clampX(cx - shoulderHalf), shoulderY);
  path.lineTo(neckL, top);
  path.bezierCurveTo(cx - neckHalf * 0.55, top + dip * 1.33, cx + neckHalf * 0.55, top + dip * 1.33, neckR, top);
  path.lineTo(clampX(cx + shoulderHalf), shoulderY);
  path.quadraticCurveTo(clampX(cx + armHalf), shoulderY, clampX(cx + armHalf), sleeveY);
  path.lineTo(clampX(cx + armHalf), h);
  path.closePath();
  const collar = new Path2D();
  collar.moveTo(neckL, top);
  collar.bezierCurveTo(cx - neckHalf * 0.55, top + dip * 1.33, cx + neckHalf * 0.55, top + dip * 1.33, neckR, top);
  return { path, top, cx, collar: { path: collar, width: Math.max(2, faceH * 0.1) } };
}

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const layer = document.createElement('canvas');

// Tiñe la prenda detectada: cada píxel de ropa toma el color de prueba con la luz que tenía,
// así se conservan pliegues y sombras. En comparación, cada mitad de la pantalla lleva su color.
function drawGarment(ctx, w, h, frame, garment, { colorA, colorB, compare }, mirrored) {
  const { w: gw, h: gh, alpha, shade } = garment;
  layer.width = gw;
  layer.height = gh;
  const layerCtx = layer.getContext('2d');
  const image = layerCtx.createImageData(gw, gh);
  const out = image.data;
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!alpha[i]) continue;
      const screenX = mirrored ? gw - 1 - x : x;
      const color = compare && screenX >= gw / 2 ? b : a;
      const light = shade[i];
      out[i * 4] = Math.min(255, color[0] * light);
      out[i * 4 + 1] = Math.min(255, color[1] * light);
      out[i * 4 + 2] = Math.min(255, color[2] * light);
      out[i * 4 + 3] = alpha[i]; // borde suavizado
    }
  }
  layerCtx.putImageData(image, 0, 0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, 0, frame.w, h);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(layer, frame.imgX, 0, frame.imgW, h);
  ctx.restore();
}

/** Dibuja la tela en un contexto de w×h. Se usa igual en pantalla, en la captura y en el informe. */
export function drawCloth(ctx, w, h, { colorA, colorB, compare, heightRatio, frame = { x: 0, w, imgX: 0, imgW: w }, neckRatio = DEFAULT_NECK, garment = null, fit = null, mirrored = false }) {
  if (garment) {
    drawGarment(ctx, w, h, frame, garment, { colorA, colorB, compare }, mirrored);
    return;
  }
  const { path, top, cx, collar } = fit
    ? moldPath(h, frame, fit, heightRatio, neckRatio, mirrored)
    : manualPath(h, heightRatio, frame, neckRatio);
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
  if (collar) {
    // Ribete del cuello: da al polo un borde definido, como una prenda real.
    ctx.lineWidth = collar.width;
    ctx.strokeStyle = 'rgba(0,0,0,0.16)';
    ctx.stroke(collar.path);
  }
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

// --- Dos formas de ver el color: polo de molde (ligero) o teñir la propia ropa (pesado) ---
const MODE_KEY = 'colorimetria.drapeMode';
const LIVE_INTERVAL_MS = 70;
const LOAD_TIMEOUT_MS = 120000;
const SLOW_MS = 250; // por encima de esto el vídeo en vivo no puede seguir el movimiento con soltura
let garment = null; // modo «ropa»: máscara de la prenda detectada, o null
let fit = null; // modo «molde»: posición del rostro para colocar el polo, o null (ajuste manual)
let trackRun = 0; // invalida las detecciones en curso cuando cambia la fuente o el modo
let trackFailed = false; // el detector no se pudo cargar: no se reintenta hasta cambiar de modo
let trackIdle = true; // no hay ninguna detección en marcha
let trackDone = false; // la foto visible ya se analizó
let loadingShown = false; // esperando el primer resultado del teñido

function drapeMode() {
  return $('drape-mode-garment').checked ? 'garment' : 'mold';
}

/** Lo que drawCloth necesita para dibujar igual que en pantalla (prenda teñida o polo colocado). */
export function currentDrape() {
  return { garment, fit };
}

function setLoading(value) {
  loadingShown = value;
  $('drape-loading').hidden = !value;
}

function setResult({ nextGarment = null, nextFit = null }, status) {
  const changed = Boolean(garment) !== Boolean(nextGarment) || Boolean(fit) !== Boolean(nextFit);
  garment = nextGarment;
  fit = nextFit;
  setLoading(false);
  $('drape-auto-status').textContent = status;
  // Con la ropa teñida no hay nada que colocar; con el polo, los controles hacen el ajuste fino.
  $('drape-height').disabled = Boolean(garment);
  $('drape-neck').disabled = Boolean(garment);
  redraw();
  if (changed || !camera.isOn) document.dispatchEvent(new CustomEvent('drape:garment'));
}

// Suaviza el movimiento en vídeo para que el polo no tiemble.
function blendFit(previous, next) {
  if (!previous) return next;
  const mixed = {};
  for (const key of Object.keys(next)) mixed[key] = previous[key] * 0.5 + next[key] * 0.5;
  return mixed;
}

async function track() {
  const run = ++trackRun;
  const mode = drapeMode();
  trackIdle = false;
  trackDone = false;
  try {
    if (trackFailed) return;
    if (!currentSource()) {
      setResult({}, mode === 'garment'
        ? 'Activa la cámara o sube una foto para teñir tu ropa con el color de prueba.'
        : 'Activa la cámara o sube una foto: el polo se colocará solo bajo tu rostro.');
      return;
    }
    if (mode === 'garment' && !garment) {
      // El detector de ropa pesa: hasta el primer resultado se muestra un indicador de carga,
      // para que no parezca que la app no hace nada.
      fit = null;
      $('drape-auto-status').textContent = 'Buscando tu ropa…';
      setLoading(true);
      redraw();
    }
    if (mode === 'mold' && garment) setResult({ nextFit: fit }, ''); // el polo se ve al instante
    while (run === trackRun) {
      const source = currentSource();
      if (!source || !$('stage').clientWidth) return; // sin imagen o pestaña oculta: se reintenta al redibujar
      let found;
      let started = performance.now();
      try {
        const detector = await (mode === 'garment' ? import('./segment.js') : import('./face.js'));
        // Si la descarga se atasca, no se deja al usuario esperando sin fin.
        let timer;
        const giveUp = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('la descarga tardó demasiado')), LOAD_TIMEOUT_MS);
        });
        try {
          await Promise.race([detector.load(), giveUp]);
        } finally {
          clearTimeout(timer);
        }
        started = performance.now(); // solo cuenta el cálculo, no la descarga inicial
        found = await detector.detect(source.el, source.sw, source.sh);
      } catch (error) {
        if (run !== trackRun) return;
        trackFailed = true;
        const reason = error?.message || 'error desconocido';
        setResult({}, mode === 'garment'
          ? `No se pudo preparar el teñido de la ropa (${reason}). Comprueba la conexión o usa el polo de molde.`
          : `No se pudo cargar el ajuste automático del polo (${reason}): colócalo con los controles de altura y cuello.`);
        return;
      }
      const elapsed = performance.now() - started;
      if (run !== trackRun) return;
      if (!source.live) trackDone = true; // en una foto basta con una detección
      if (mode === 'garment') {
        if (found) {
          setResult({ nextGarment: found }, source.live && elapsed > SLOW_MS
            ? 'Ropa detectada. En este dispositivo el vídeo en vivo actualiza el color despacio: usa «Tomar foto» o el polo de molde para ir con fluidez.'
            : 'Ropa detectada: se tiñe con el color de prueba. Con ropa clara y lisa el color se ve más fiel.');
        } else {
          setResult({}, 'No se ve tu ropa en la imagen: aléjate un poco para que se vean los hombros, o usa el polo de molde.');
        }
      } else if (found) {
        setResult({ nextFit: source.live ? blendFit(fit, found) : found },
          'Polo colocado bajo tu rostro. Si hace falta, afínalo con los controles de altura y cuello.');
      } else {
        setResult({}, 'No se encontró tu rostro en la imagen: coloca el polo con los controles de altura y cuello.');
      }
      if (!source.live) return;
      // En equipos lentos se deja respirar al navegador: la pausa crece con lo que tardó el cálculo.
      await new Promise((resolve) => setTimeout(resolve, Math.max(LIVE_INTERVAL_MS, elapsed * 3)));
    }
  } finally {
    if (run === trackRun) {
      trackIdle = true;
      if (loadingShown) { setLoading(false); redraw(); }
    }
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
  if (trackIdle && !trackDone && !trackFailed && currentSource()) track();
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
  canvas.dataset.auto = String(Boolean(source && (garment || fit)));
  canvas.dataset.mode = drapeMode();
  if (colorA && !loadingShown) {
    drawCloth(ctx, w, h, {
      ...options,
      ...(source ? currentDrape() : {}),
      frame: source ? sourceFrame(source.sw, source.sh, w, h) : undefined,
      mirrored: Boolean(source?.mirrored),
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
    ...(source ? currentDrape() : {}),
    frame: source ? sourceFrame(source.sw, source.sh, CAPTURE_W, CAPTURE_H) : undefined,
    mirrored: Boolean(source?.mirrored),
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
  const sourceChanged = () => { redraw(); track(); };
  camera.video.addEventListener('loadedmetadata', sourceChanged);
  camera.video.addEventListener('resize', redraw);
  photo.onChange(sourceChanged);
  camera.onChange(sourceChanged);

  // El polo de molde es el modo por defecto: es ligero y funciona también sin detector.
  try { $('drape-mode-garment').checked = localStorage.getItem(MODE_KEY) === 'garment'; } catch { /* sin almacenamiento: polo de molde */ }
  document.querySelectorAll('input[name="drape-mode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      try { localStorage.setItem(MODE_KEY, drapeMode()); } catch { /* preferencia no guardada */ }
      trackFailed = false;
      track();
    });
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
  on('session', track);
  on('selection', sync);
  on('session', sync);
}
