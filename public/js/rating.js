// Evaluación del color activo: 4 criterios, guardar, borrar y pasar al siguiente.
import { api } from './api.js';
import { $, el, clear, bar, safeHex, textColorFor, CRITERIA, VALUE_OPTIONS, UNDERTONE, DEPTH, CHROMA } from './dom.js';
import { state, on, applyRating, removeRating, evaluatedColorId, pickColor, nextUnratedId, isRated } from './store.js';
import { showError, toast } from './ui.js';

let loadedFor = null;
let busy = false;

const select = (key) => $(`rating-${key}`);

function readValues() {
  return Object.fromEntries(CRITERIA.map(({ key }) => {
    const raw = select(key).value;
    return [key, raw === '' ? null : Number(raw)];
  }));
}

function loadValues() {
  const rating = state.ratings.get(evaluatedColorId());
  for (const { key } of CRITERIA) {
    const v = rating?.[key];
    select(key).value = v == null ? '' : String(v);
  }
}

function renderCurrent() {
  const color = state.colorById.get(evaluatedColorId());
  const head = clear($('rating-current'));
  const box = clear($('rating-result'));
  $('rating-delete').disabled = !color || !state.ratings.has(color.id);
  if (!color) {
    box.append(el('p', { class: 'muted', text: 'Elige un color de la paleta para empezar.' }));
    return;
  }
  const hex = safeHex(color.hex);
  head.append(
    el('span', { text: 'Evaluando:' }),
    el('span', {
      class: 'color-pill', 'data-testid': 'rating-color', 'data-color-id': color.id,
      style: { backgroundColor: hex, color: textColorFor(hex), flex: 'none' }, text: color.name,
    }),
    el('span', { class: 'tag', text: UNDERTONE[color.undertone] ?? color.undertone }),
    el('span', { class: 'tag', text: DEPTH[color.depth] ?? color.depth }),
    el('span', { class: 'tag', text: CHROMA[color.chroma] ?? color.chroma }));

  const rating = isRated(color.id) ? state.ratings.get(color.id) : null;
  if (!rating) {
    box.append(
      el('strong', { text: color.name }),
      el('p', { class: 'muted', text: 'Aún no puntuado. Evalúa los cuatro criterios y pulsa «Guardar puntuación».' }));
    return;
  }
  box.append(
    el('strong', { 'data-testid': 'rating-score', text: rating.score == null ? `${color.name}: sin puntuación` : `${color.name}: ${rating.score}%` }),
    bar(rating.score),
    el('p', { class: 'muted', text: `Puntuación registrada (${rating.answered} de 4 criterios respondidos). Puedes volver a evaluar el mismo color o comparar otro.` }));
}

async function save() {
  const colorId = evaluatedColorId();
  if (busy || !colorId || !state.session) return false;
  const values = readValues();
  if (Object.values(values).every((v) => v == null)) {
    toast('Responde al menos un criterio antes de guardar, o usa «Siguiente sin valorar».', 'error');
    return false;
  }
  busy = true;
  try {
    const { rating, analysis } = await api.putRating(state.session.id, colorId, values);
    applyRating(rating, analysis);
    toast('Puntuación guardada.');
    return true;
  } catch (err) {
    showError(err);
    return false;
  } finally {
    busy = false;
  }
}

async function remove() {
  const colorId = evaluatedColorId();
  if (busy || !colorId || !state.session || !state.ratings.has(colorId)) return;
  busy = true;
  try {
    const sessionId = state.session.id;
    await api.deleteRating(sessionId, colorId);
    const { analysis } = await api.getAnalysis(sessionId);
    removeRating(colorId, analysis);
    loadValues();
    toast('Valoración borrada.');
  } catch (err) {
    showError(err);
  } finally {
    busy = false;
  }
}

function goToNextUnrated() {
  const next = nextUnratedId();
  if (!next) {
    toast('No quedan colores sin valorar con los filtros actuales.');
    return;
  }
  pickColor(next);
  document.querySelector(`[data-testid="swatch-${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
}

export function initRating() {
  for (const { key } of CRITERIA) {
    clear(select(key)).append(...VALUE_OPTIONS.map((o) => el('option', { value: o.value, text: o.label })));
  }
  $('rating-form').addEventListener('submit', (event) => { event.preventDefault(); save(); });
  $('rating-save-next').addEventListener('click', async () => { if (await save()) goToNextUnrated(); });
  $('rating-next').addEventListener('click', goToNextUnrated);
  $('rating-delete').addEventListener('click', remove);

  document.addEventListener('keydown', (event) => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'n') return;
    if ($('panel-try').hidden || $('view-session').hidden || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    goToNextUnrated();
  });

  on('session', () => { loadedFor = evaluatedColorId(); loadValues(); renderCurrent(); });
  on('selection', () => {
    const id = evaluatedColorId();
    if (id !== loadedFor) { loadedFor = id; loadValues(); }
    renderCurrent();
  });
  on('ratings', renderCurrent);
}
