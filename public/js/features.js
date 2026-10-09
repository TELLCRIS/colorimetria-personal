// "Analizar mi rostro": la persona marca piel, cabello y ojos sobre su foto;
// de cada punto se promedia un parche de 9×9 píxeles y solo esos tres colores
// se guardan con la sesión (la imagen no se analiza fuera de este navegador).
import { api } from './api.js';
import { $, el, clear, FEATURES } from './dom.js';
import { state, on, applyFeatures } from './store.js';
import { photo } from './photo.js';
import { toast } from './ui.js';

const PATCH = 9;
const LOUPE_CSS = 120;

const draft = {
  open: false,
  step: 0,
  values: { skin: null, hair: null, eyes: null },
  points: {},
  skipped: {},
  cursor: { x: 0.5, y: 0.4 },
  pressing: false,
};

const canvas = () => $('analyze-canvas');
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Color medio de un parche de 9×9 px centrado en el punto (coordenadas de la foto). */
function samplePatch(source, nx, ny) {
  const w = source.width;
  const h = source.height;
  const side = Math.min(PATCH, w, h);
  const x0 = Math.max(0, Math.min(w - side, Math.round(nx * (w - 1)) - Math.floor(side / 2)));
  const y0 = Math.max(0, Math.min(h - side, Math.round(ny * (h - 1)) - Math.floor(side / 2)));
  const { data } = source.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, side, side);
  let r = 0, g = 0, b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const hex = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

function drawMarker(ctx, x, y, r, letter) {
  ctx.lineWidth = Math.max(2, r / 4);
  ctx.strokeStyle = '#000';
  ctx.beginPath();
  ctx.arc(x, y, r + ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `700 ${Math.round(r * 1.4)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = Math.max(3, r / 3);
  ctx.strokeStyle = '#000';
  ctx.strokeText(letter, x, y - r * 1.3);
  ctx.fillStyle = '#fff';
  ctx.fillText(letter, x, y - r * 1.3);
}

function drawCursor(ctx, x, y, r) {
  // Cruz con hueco central para no tapar el punto exacto
  for (const [color, width] of [['#000', Math.max(4, r / 2.5)], ['#fff', Math.max(2, r / 5)]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x - r * 2.2, y); ctx.lineTo(x - r * 0.6, y);
    ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r * 2.2, y);
    ctx.moveTo(x, y - r * 2.2); ctx.lineTo(x, y - r * 0.6);
    ctx.moveTo(x, y + r * 0.6); ctx.lineTo(x, y + r * 2.2);
    ctx.stroke();
  }
}

function drawImage() {
  const source = photo.canvas;
  const view = canvas();
  if (!source) return;
  if (view.width !== source.width || view.height !== source.height) {
    view.width = source.width;
    view.height = source.height;
  }
  const ctx = view.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const r = Math.max(8, Math.max(view.width, view.height) / 70);
  for (const feature of FEATURES) {
    const p = draft.points[feature.key];
    if (p) drawMarker(ctx, p.x * view.width, p.y * view.height, r, feature.letter);
  }
  drawCursor(ctx, draft.cursor.x * view.width, draft.cursor.y * view.height, r);
}

/** Lupa: amplía la zona bajo el dedo y se coloca donde el dedo no la tape. */
function drawLoupe() {
  const loupe = $('analyze-loupe');
  const source = photo.canvas;
  const view = canvas();
  const show = draft.open && source && (draft.pressing || document.activeElement === view);
  loupe.hidden = !show;
  if (!show) return;
  const ctx = loupe.getContext('2d');
  const size = loupe.width;
  const side = Math.max(27, Math.round(Math.max(source.width, source.height) / 26));
  const cx = draft.cursor.x * (source.width - 1);
  const cy = draft.cursor.y * (source.height - 1);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(source, cx - side / 2, cy - side / 2, side, side, 0, 0, size, size);
  // Recuadro del parche que se promedia
  const box = (PATCH / side) * size;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  ctx.strokeRect((size - box) / 2, (size - box) / 2, box, box);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect((size - box) / 2, (size - box) / 2, box, box);

  const stage = $('analyze-stage');
  const rect = view.getBoundingClientRect();
  const frame = stage.getBoundingClientRect();
  const px = rect.left - frame.left + draft.cursor.x * rect.width;
  const py = rect.top - frame.top + draft.cursor.y * rect.height;
  let left = px - LOUPE_CSS / 2;
  let top = py - LOUPE_CSS - 48; // por encima del dedo
  if (top < 0) {
    // Sin sitio arriba: a un lado, a la altura del punto
    top = Math.max(0, py - LOUPE_CSS / 2);
    left = px < frame.width / 2 ? px + 56 : px - LOUPE_CSS - 56;
  }
  loupe.style.left = `${Math.max(0, Math.min(frame.width - LOUPE_CSS, left))}px`;
  loupe.style.top = `${Math.max(0, Math.min(frame.height - LOUPE_CSS, top))}px`;
}

function renderList() {
  for (const [index, feature] of FEATURES.entries()) {
    const value = draft.values[feature.key];
    const button = $(`analyze-step-${feature.key}`);
    button.textContent = `${index + 1}. ${value ? 'Repetir' : 'Marcar'} ${feature.label.toLowerCase()}`;
    if (index === draft.step) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    const swatch = $(`feature-swatch-${feature.key}`);
    swatch.style.background = value ?? '';
    swatch.dataset.hex = value ?? '';
    swatch.setAttribute('aria-label', value ? `${feature.label}: ${value}` : `${feature.label}: sin muestra`);
    $(`feature-value-${feature.key}`).textContent = value ?? (draft.skipped[feature.key] ? 'Omitido' : 'Sin marcar');
  }
}

function render() {
  const feature = FEATURES[draft.step];
  $('analyze-panel').dataset.step = feature.key;
  $('analyze-instruction').textContent = `Paso ${draft.step + 1} de ${FEATURES.length} · ${feature.label}: ${feature.hint}`;
  $('analyze-skip').disabled = feature.key === 'skin';
  $('analyze-confirm').disabled = !draft.values.skin;
  canvas().setAttribute('aria-label', `Tu foto. Elige el punto de muestra para ${feature.label.toLowerCase()}.`);
  renderList();
  drawImage();
  drawLoupe();
}

function announce(text) {
  $('analyze-status').textContent = text;
}

function goToStep(index) {
  draft.step = Math.max(0, Math.min(FEATURES.length - 1, index));
  render();
}

function commit() {
  const source = photo.canvas;
  if (!source) return;
  const feature = FEATURES[draft.step];
  const hex = samplePatch(source, draft.cursor.x, draft.cursor.y);
  draft.values[feature.key] = hex;
  draft.points[feature.key] = { ...draft.cursor };
  draft.skipped[feature.key] = false;
  announce(`${feature.label}: muestra ${hex} tomada.`);
  if (draft.step < FEATURES.length - 1) draft.step++;
  render();
}

function skip() {
  const feature = FEATURES[draft.step];
  if (feature.key === 'skin') return;
  draft.values[feature.key] = null;
  delete draft.points[feature.key];
  draft.skipped[feature.key] = true;
  announce(`${feature.label}: paso omitido.`);
  if (draft.step < FEATURES.length - 1) draft.step++;
  render();
}

function moveTo(event) {
  const rect = canvas().getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  draft.cursor = {
    x: clamp01((event.clientX - rect.left) / rect.width),
    y: clamp01((event.clientY - rect.top) / rect.height),
  };
  drawImage();
  drawLoupe();
}

function syncEntry() {
  const hasPhoto = Boolean(photo.canvas);
  const features = state.session?.features;
  $('analyze-start').disabled = !hasPhoto || !state.session;
  $('analyze-clear').hidden = !(features?.skin || features?.hair || features?.eyes);
  $('analyze-hint').textContent = hasPhoto
    ? 'Marca tres puntos en tu foto (piel, cabello y ojos) para obtener una estimación orientativa y una lista de colores por los que empezar.'
    : 'Toma o sube una foto para poder analizar tu rostro: marcarás piel, cabello y ojos, y obtendrás una estimación orientativa.';
  if (!hasPhoto && draft.open) closeAnalyze();
}

function openAnalyze() {
  if (!photo.canvas || !state.session) return;
  const saved = state.session.features ?? {};
  draft.open = true;
  draft.step = 0;
  draft.values = { skin: saved.skin ?? null, hair: saved.hair ?? null, eyes: saved.eyes ?? null };
  draft.points = {};
  draft.skipped = {};
  draft.cursor = { x: 0.5, y: 0.4 };
  draft.pressing = false;
  $('analyze-error').hidden = true;
  $('analyze-panel').hidden = false;
  $('panel-try').classList.add('analyzing');
  $('analyze-start').setAttribute('aria-expanded', 'true');
  render();
  $('analyze-panel').scrollIntoView({ block: 'start' });
  canvas().focus({ preventScroll: true });
  drawLoupe();
}

export function closeAnalyze() {
  if (!draft.open) return;
  draft.open = false;
  draft.pressing = false;
  $('analyze-panel').hidden = true;
  $('analyze-loupe').hidden = true;
  $('panel-try').classList.remove('analyzing');
  $('analyze-start').setAttribute('aria-expanded', 'false');
  window.dispatchEvent(new Event('resize')); // el escenario vuelve a mostrarse: que la tela se redibuje
}

async function save(values, message) {
  const { session, analysis } = await api.putFeatures(state.session.id, values);
  applyFeatures(session, analysis);
  toast(message);
}

async function confirm() {
  if (!draft.values.skin || !state.session) return;
  const error = $('analyze-error');
  error.hidden = true;
  $('analyze-confirm').disabled = true;
  try {
    await save({ ...draft.values }, 'Estimación automática lista: mírala en «Resultados».');
    closeAnalyze();
    $('analyze-start').focus();
  } catch (err) {
    error.textContent = err?.message || 'No se pudo guardar el análisis.';
    error.hidden = false;
    $('analyze-confirm').disabled = false;
  }
}

async function clearFeatures() {
  if (!state.session) return;
  try {
    await save({ skin: null, hair: null, eyes: null }, 'Estimación automática quitada.');
  } catch (err) {
    toast(err?.message || 'No se pudo quitar la estimación.', 'error');
  }
}

function buildList() {
  clear($('feature-list')).append(...FEATURES.map((feature, index) =>
    el('li', { class: 'feature-row', 'data-testid': `feature-row-${feature.key}` },
      el('button', {
        type: 'button', id: `analyze-step-${feature.key}`, 'data-testid': `analyze-step-${feature.key}`,
        onClick: () => { goToStep(index); canvas().focus({ preventScroll: true }); },
      }),
      el('span', {
        class: 'feature-swatch', id: `feature-swatch-${feature.key}`, role: 'img',
        'data-testid': `feature-swatch-${feature.key}`,
      }),
      el('span', { class: 'feature-value', id: `feature-value-${feature.key}`, 'data-testid': `feature-value-${feature.key}` }))));
}

export function initFeatures() {
  buildList();
  const view = canvas();

  // Puntero (dedo, lápiz o ratón): pulsar y arrastrar mueve la cruz con la lupa; soltar toma la muestra.
  view.addEventListener('pointerdown', (event) => {
    if (event.button > 0) return;
    event.preventDefault();
    draft.pressing = true;
    try { view.setPointerCapture(event.pointerId); } catch { /* puntero sintético */ }
    moveTo(event);
  });
  view.addEventListener('pointermove', (event) => { if (draft.pressing) moveTo(event); });
  view.addEventListener('pointerup', (event) => {
    if (!draft.pressing) return;
    moveTo(event);
    draft.pressing = false;
    commit();
  });
  view.addEventListener('pointercancel', () => { draft.pressing = false; drawLoupe(); });
  view.addEventListener('contextmenu', (event) => event.preventDefault());

  // Teclado: flechas mueven la cruz, Intro o Espacio toman la muestra.
  view.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      draft.cursor = { x: clamp01(draft.cursor.x + moves[event.key][0]), y: clamp01(draft.cursor.y + moves[event.key][1]) };
      drawImage();
      drawLoupe();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      commit();
    }
  });
  view.addEventListener('focus', drawLoupe);
  view.addEventListener('blur', drawLoupe);

  $('analyze-start').addEventListener('click', openAnalyze);
  $('analyze-cancel').addEventListener('click', () => { closeAnalyze(); $('analyze-start').focus(); });
  $('analyze-skip').addEventListener('click', skip);
  $('analyze-confirm').addEventListener('click', confirm);
  $('analyze-clear').addEventListener('click', clearFeatures);

  photo.onChange(() => { closeAnalyze(); syncEntry(); }); // los puntos marcados ya no valen para otra foto
  on('session', () => { closeAnalyze(); syncEntry(); });
  on('sessionMeta', syncEntry);
  syncEntry();
}
