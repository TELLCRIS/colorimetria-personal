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

function clothPath(w, h, heightRatio) {
  const top = h * (1 - heightRatio);
  const shoulder = top + h * 0.05;
  const dip = Math.min(h * 0.13, (h - top) * 0.6);
  const path = new Path2D();
  path.moveTo(0, h);
  path.lineTo(0, shoulder);
  path.quadraticCurveTo(w * 0.16, top, w * 0.3, top);
  // Escote curvo bajo la barbilla
  path.bezierCurveTo(w * 0.37, top + dip * 1.33, w * 0.63, top + dip * 1.33, w * 0.7, top);
  path.quadraticCurveTo(w * 0.84, top, w, shoulder);
  path.lineTo(w, h);
  path.closePath();
  return { path, top };
}

/** Dibuja la tela en un contexto de w×h. Se usa igual en pantalla, en la captura y en el informe. */
export function drawCloth(ctx, w, h, { colorA, colorB, compare, heightRatio }) {
  const { path, top } = clothPath(w, h, heightRatio);
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = colorA;
  ctx.fillRect(0, 0, compare ? w / 2 : w, h);
  if (compare) {
    ctx.fillStyle = colorB;
    ctx.fillRect(w / 2, 0, w / 2, h);
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
    ctx.fillRect(w / 2 - Math.max(1, w / 400), 0, Math.max(2, w / 200), h);
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (colorA) drawCloth(ctx, w, h, options);
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
  drawCloth(ctx, CAPTURE_W, CAPTURE_H, options);

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
  on('selection', sync);
  on('session', sync);
}
