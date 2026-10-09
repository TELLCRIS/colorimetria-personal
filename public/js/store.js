// Estado compartido de la app y un emisor de eventos mínimo.
// Eventos: 'session' (se abre otra sesión), 'sessionMeta' (nombre/notas/rasgos),
// 'ratings' (valoraciones o análisis), 'selection', 'filters'.

const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
}

function emit(event) {
  listeners.get(event)?.forEach((fn) => fn());
}

const NO_FILTERS = { undertone: '', depth: '', season: '', suggested: false };

export const state = {
  colors: [],
  colorById: new Map(),
  seasons: [],
  seasonById: new Map(),
  session: null,
  ratings: new Map(),
  analysis: null,
  selection: { a: null, b: null, compare: false, slot: 'a' },
  filters: { ...NO_FILTERS },
};

/** Una valoración cuenta como tal solo si responde al menos un criterio. */
export function isRated(colorId) {
  return (state.ratings.get(colorId)?.answered ?? 0) > 0;
}

export function ratedCount() {
  let n = 0;
  for (const rating of state.ratings.values()) if ((rating.answered ?? 0) > 0) n++;
  return n;
}

/** Colores sugeridos por la estimación automática (vacío si no hay). */
export function suggestedIds() {
  return (state.analysis?.auto?.recommended ?? []).filter((id) => state.colorById.has(id));
}

export function setCatalog(colors, seasons) {
  state.colors = Array.isArray(colors) ? colors : [];
  state.colorById = new Map(state.colors.map((c) => [c.id, c]));
  state.seasons = Array.isArray(seasons) ? seasons : [];
  state.seasonById = new Map(state.seasons.map((s) => [s.id, s]));
}

export function setSession({ session, ratings, analysis }) {
  state.session = session;
  state.ratings = new Map((ratings ?? []).map((r) => [r.colorId, r]));
  state.analysis = analysis ?? null;
  const firstUnrated = state.colors.find((c) => !isRated(c.id));
  state.selection = { a: (firstUnrated ?? state.colors[0])?.id ?? null, b: null, compare: false, slot: 'a' };
  state.filters = { ...NO_FILTERS };
  emit('session');
}

export function clearSession() {
  state.session = null;
  state.ratings = new Map();
  state.analysis = null;
}

export function updateSessionMeta(session) {
  state.session = session;
  emit('sessionMeta');
}

/** Tras guardar los rasgos (piel, cabello, ojos): cambian la sesión y el análisis. */
export function applyFeatures(session, analysis) {
  state.session = session;
  if (analysis) state.analysis = analysis;
  if (!suggestedIds().length) state.filters = { ...state.filters, suggested: false };
  emit('sessionMeta');
  emit('ratings');
}

export function applyRating(rating, analysis) {
  state.ratings.set(rating.colorId, rating);
  if (analysis) state.analysis = analysis;
  emit('ratings');
}

export function removeRating(colorId, analysis) {
  state.ratings.delete(colorId);
  if (analysis) state.analysis = analysis;
  emit('ratings');
}

export function setSelection(patch) {
  state.selection = { ...state.selection, ...patch };
  emit('selection');
}

export function setFilters(patch) {
  state.filters = { ...state.filters, ...patch };
  emit('filters');
}

/** Color que se está evaluando: el de la mitad activa en comparación, o el único elegido. */
export function evaluatedColorId() {
  const { a, b, compare, slot } = state.selection;
  return compare && slot === 'b' && b ? b : a;
}

/** Pone un color en la mitad activa (o como único color si no se compara). */
export function pickColor(colorId) {
  const { compare, slot } = state.selection;
  setSelection(compare && slot === 'b' ? { b: colorId } : { a: colorId });
}

export function visibleColors() {
  const { undertone, depth, season, suggested } = state.filters;
  const only = suggested ? new Set(suggestedIds()) : null;
  return state.colors.filter((c) =>
    (!only || only.has(c.id)) &&
    (!undertone || c.undertone === undertone) &&
    (!depth || c.depth === depth) &&
    (!season || (c.seasons ?? []).includes(season)));
}

/** Siguiente color sin valorar dentro del filtro actual, empezando tras el evaluado. */
export function nextUnratedId() {
  const list = visibleColors();
  if (!list.length) return null;
  const current = evaluatedColorId();
  const start = list.findIndex((c) => c.id === current);
  for (let i = 1; i <= list.length; i++) {
    const c = list[(start + i + list.length) % list.length];
    if (c.id !== current && !isRated(c.id)) return c.id;
  }
  return null;
}
