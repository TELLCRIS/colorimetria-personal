// Guía de encuadre: óvalo del rostro, línea de ojos, línea de barbilla, hombros y marcas de tercios,
// superpuestos al escenario. Es un SVG aparte del lienzo de la tela: no recibe toques y no entra en
// la captura, en el informe ni en la ficha. Si el detector de rostro está activo (polo de molde),
// indica además si el encuadre es correcto o qué corregir.
import { $ } from './dom.js';
import { camera } from './camera.js';
import { photo } from './photo.js';
import { sourceFrame, faceTracking } from './drape.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PREF_KEY = 'colorimetria.guide';

// Encuadre objetivo, en proporciones del alto de la imagen.
const TARGET = { top: 0.17, eyes: 0.36, chin: 0.62, shoulders: 0.8 };
const LIMITS = {
  tooBig: 0.43, // alto del rostro detectado por encima del cual está demasiado cerca
  tooSmall: 0.26,
  offCenter: 0.055, // desvío horizontal admitido, en proporción del alto
  chinHigh: 0.555,
  chinLow: 0.675,
};

const MESSAGES = {
  ok: 'Encuadre correcto',
  far: 'Acércate un poco',
  near: 'Aléjate un poco',
  center: 'Centra el rostro en el óvalo',
  up: 'Sube un poco la cámara',
  down: 'Baja un poco la cámara',
  missing: 'No veo tu rostro: colócalo dentro del óvalo',
};

const STABLE_MS = 650; // en vídeo, un aviso nuevo debe mantenerse este tiempo antes de mostrarse (evita parpadeos)
const ANNOUNCE_AFTER_MS = 1400; // el lector de pantalla solo oye lo que se mantiene
const ANNOUNCE_GAP_MS = 4000;

let enabled = true;
let drawnKey = '';
let shown = 'idle'; // clave de MESSAGES, o 'idle' si no hay nada que decir
let candidate = 'idle';
let candidateSince = 0;
let announceTimer = null;
let lastAnnounced = '';
let lastAnnouncedAt = 0;
let tipsTouched = false;

function currentSource() {
  const video = camera.video;
  if (camera.isOn && video.videoWidth > 0) return { sw: video.videoWidth, sh: video.videoHeight, live: true };
  if (photo.canvas) return { sw: photo.canvas.width, sh: photo.canvas.height, live: false };
  return null;
}

function node(tag, attrs) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

const round = (value) => Math.round(value * 10) / 10;

/** Trazos de la guía para una franja de imagen de w×h píxeles CSS. */
function shapes(w, h) {
  const cx = w / 2;
  const top = TARGET.top * h;
  const chin = TARGET.chin * h;
  const eyes = TARGET.eyes * h;
  const ry = (chin - top) / 2;
  const rx = Math.min(ry * 0.74, w * 0.4);
  const cy = top + ry;
  const edge = Math.max(8, Math.min(14, w * 0.04)); // margen de las marcas respecto al borde
  const reach = Math.min(w / 2 - edge, rx + h * 0.2); // hasta dónde llegan las líneas laterales
  const corner = Math.max(12, Math.min(22, h * 0.07));
  const tick = Math.max(6, Math.min(10, h * 0.03));
  const paths = [];
  const line = (x1, y1, x2, y2) => paths.push(`M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}`);

  // Esquinas del visor
  for (const [x, sx] of [[edge, 1], [w - edge, -1]]) {
    for (const [y, sy] of [[edge, 1], [h - edge, -1]]) {
      paths.push(`M${round(x)} ${round(y + sy * corner)}L${round(x)} ${round(y)}L${round(x + sx * corner)} ${round(y)}`);
    }
  }
  // Tercios: marcas cortas arriba y abajo, no líneas que crucen la cara
  for (const third of [1 / 3, 2 / 3]) {
    line(w * third, edge, w * third, edge + tick);
    line(w * third, h - edge, w * third, h - edge - tick);
  }
  // Eje vertical: marcas arriba y abajo
  line(cx, edge, cx, edge + tick * 1.6);
  // Línea de ojos: a ambos lados del óvalo, sin cruzarlo
  const gap = 5;
  line(cx - reach, eyes, cx - rx - gap, eyes);
  line(cx + rx + gap, eyes, cx + reach, eyes);
  // Línea de barbilla, tangente al óvalo
  line(cx - rx * 0.62, chin, cx + rx * 0.62, chin);
  line(cx + rx + gap, chin, cx + reach, chin);
  // Hombros: del cuello hacia los lados
  const shoulderY = TARGET.shoulders * h;
  const neck = rx * 0.62;
  const span = Math.min(w / 2 - edge, rx * 2.75);
  const neckY = chin + (shoulderY - chin) * 0.45;
  for (const side of [-1, 1]) {
    paths.push(`M${round(cx + side * neck)} ${round(neckY)}Q${round(cx + side * neck * 1.25)} ${round(shoulderY - h * 0.035)} ${round(cx + side * span)} ${round(shoulderY)}`);
  }

  const labelSize = Math.max(8.5, Math.min(11, h * 0.034));
  const labels = [
    { text: 'OJOS', x: cx + reach, y: eyes - 4 },
    { text: 'BARBILLA', x: cx + reach, y: chin - 4 },
  ];
  // «Hombros» solo si hay sitio a la derecha de la curva
  if (span > rx * 1.6) labels.push({ text: 'HOMBROS', x: cx + span, y: shoulderY - 5 });
  return { d: paths.join(''), oval: { cx, cy, rx, ry }, labels, labelSize };
}

function draw(svg, w, h) {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (key === drawnKey) return;
  drawnKey = key;
  const { d, oval, labels, labelSize } = shapes(w, h);
  svg.setAttribute('viewBox', `0 0 ${round(w)} ${round(h)}`);
  const halo = node('g', { class: 'guide-halo' });
  const ink = node('g', { class: 'guide-ink' });
  for (const group of [halo, ink]) {
    group.append(node('path', { d }), node('ellipse', { cx: round(oval.cx), cy: round(oval.cy), rx: round(oval.rx), ry: round(oval.ry), class: 'guide-oval' }));
  }
  const text = node('g', { class: 'guide-labels', 'font-size': round(labelSize) });
  for (const label of labels) {
    const item = node('text', { x: round(label.x), y: round(label.y), 'text-anchor': 'end' });
    item.textContent = label.text;
    text.append(item);
  }
  svg.replaceChildren(halo, ink, text);
}

/** Qué decir de un rostro detectado (proporciones de la imagen) para una franja visible dada. */
export function assess(fit, frame, h) {
  const dx = ((fit.cx - 0.5) * frame.imgW) / h;
  if (fit.fh > LIMITS.tooBig) return 'near';
  if (fit.fh < LIMITS.tooSmall) return 'far';
  if (Math.abs(dx) > LIMITS.offCenter) return 'center';
  if (fit.chin < LIMITS.chinHigh) return 'up';
  if (fit.chin > LIMITS.chinLow) return 'down';
  return 'ok';
}

function announce(key) {
  clearTimeout(announceTimer);
  if (key === 'idle') return;
  const wait = Math.max(ANNOUNCE_AFTER_MS, ANNOUNCE_GAP_MS - (Date.now() - lastAnnouncedAt));
  announceTimer = setTimeout(() => {
    if (shown !== key || key === lastAnnounced) return;
    lastAnnounced = key;
    lastAnnouncedAt = Date.now();
    $('guide-status').textContent = `Guía de encuadre. ${MESSAGES[key]}.`;
  }, wait);
}

function show(key) {
  if (key === shown) return;
  shown = key;
  const state = key === 'idle' ? 'idle' : key === 'ok' ? 'ok' : 'adjust';
  $('frame-guide').dataset.state = state;
  const badge = $('guide-badge');
  badge.dataset.state = state;
  badge.dataset.hint = key;
  badge.hidden = key === 'idle' || !enabled;
  $('guide-badge-text').textContent = key === 'idle' ? '' : MESSAGES[key];
  if (key === 'idle') {
    clearTimeout(announceTimer);
    lastAnnounced = '';
    $('guide-status').textContent = '';
  } else {
    announce(key);
  }
}

function update() {
  const svg = $('frame-guide');
  const stage = $('stage');
  const source = currentSource();
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const visible = enabled && Boolean(source) && w > 0 && h > 0;
  svg.toggleAttribute('hidden', !visible); // un <svg> no tiene la propiedad `hidden` de HTML
  $('guide-toggle').setAttribute('aria-pressed', String(enabled));
  if (!visible) {
    candidate = 'idle';
    show('idle');
    return;
  }
  // La guía se ciñe a la franja que ocupa la imagen, no al escenario entero (bandas laterales).
  const frame = sourceFrame(source.sw, source.sh, w, h);
  svg.style.left = `${round(frame.x)}px`;
  svg.style.width = `${round(frame.w)}px`;
  $('guide-badge').style.maxWidth = `${Math.max(150, Math.round(frame.w - 16))}px`;
  draw(svg, frame.w, h);

  const { active, fit } = faceTracking();
  const next = !active ? 'idle' : fit ? assess(fit, frame, h) : 'missing';
  if (!source.live || next === 'idle' || shown === 'idle') {
    candidate = next;
    show(next);
    return;
  }
  // En vídeo, el aviso cambia solo cuando el nuevo estado se mantiene un momento.
  const now = performance.now();
  if (next !== candidate) { candidate = next; candidateSince = now; }
  if (now - candidateSince >= STABLE_MS) show(next);
}

function syncTips() {
  // Los consejos se ven abiertos mientras no hay imagen; después quedan a un toque.
  if (tipsTouched) return;
  const tips = $('shot-tips');
  const open = !currentSource() && !photo.canvas;
  if (tips.open !== open) {
    tips.dataset.auto = 'true';
    tips.open = open;
  }
}

export function initGuide() {
  try { enabled = localStorage.getItem(PREF_KEY) !== 'off'; } catch { /* sin almacenamiento: guía visible */ }
  $('guide-toggle').addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off'); } catch { /* preferencia no guardada */ }
    update();
  });
  $('shot-tips').addEventListener('toggle', () => {
    const tips = $('shot-tips');
    if (tips.dataset.auto === 'true') delete tips.dataset.auto; // lo cambió la app, no la persona
    else tipsTouched = true;
  });

  const changed = () => { update(); syncTips(); };
  document.addEventListener('drape:track', update);
  document.querySelectorAll('input[name="drape-mode"]').forEach((radio) => radio.addEventListener('change', update));
  camera.video.addEventListener('loadedmetadata', changed);
  camera.video.addEventListener('resize', update);
  camera.onChange(changed);
  photo.onChange(changed);
  new ResizeObserver(update).observe($('stage'));
  changed();
}
