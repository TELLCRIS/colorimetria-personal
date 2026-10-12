// Resultados: estación sugerida, ejes, 12 estaciones, ranking y paletas.
import { $, el, clear, bar, colorChip, percent, plural, safeHex, CONFIDENCE, UNDERTONE, DEPTH, CHROMA } from './dom.js';
import { state, on, isRated } from './store.js';
import { autoNodes } from './auto.js';
import { seasonBand, familyOf } from './swatchbook.js';

const FAMILY = { primavera: 'Primavera', verano: 'Verano', otono: 'Otoño', invierno: 'Invierno' };

/** Valoraciones con su color, ordenadas por puntuación (sin puntuación al final). */
export function rankedRatings() {
  return [...state.ratings.values()]
    .map((rating) => ({ rating, color: state.colorById.get(rating.colorId) }))
    .filter((entry) => entry.color && isRated(entry.rating.colorId))
    .sort((x, y) => (y.rating.score ?? -1) - (x.rating.score ?? -1) || x.color.name.localeCompare(y.color.name, 'es'));
}

/** Colores a evitar que existen pero no se muestran en la lista (el análisis lista como mucho 8). */
export function avoidMore(analysis) {
  return Math.max(0, (analysis?.avoidCount ?? 0) - (analysis?.avoid?.length ?? 0));
}

export function missingCount(analysis) {
  return Math.max(0, (analysis?.minRequired ?? 0) - (analysis?.ratedCount ?? 0));
}

function renderSuggested(analysis) {
  const box = clear($('season-suggested'));
  box.dataset.enough = String(Boolean(analysis?.enough));
  box.dataset.seasonId = '';
  box.dataset.confidence = analysis?.confidence ?? '';
  delete box.dataset.family;
  if (!analysis) {
    box.append(el('p', { class: 'muted', text: 'Todavía no hay análisis para esta sesión.' }));
    return;
  }
  if (!analysis.enough || !analysis.top) {
    const missing = missingCount(analysis);
    box.append(
      el('strong', { text: 'Aún no hay datos suficientes para sugerir una estación' }),
      el('p', {
        'data-testid': 'season-missing',
        text: missing > 0
          ? `Te ${missing === 1 ? 'falta' : 'faltan'} ${plural(missing, 'color', 'colores')} por valorar (llevas ${analysis.ratedCount} de ${analysis.minRequired}).`
          : `Llevas ${plural(analysis.ratedCount, 'color valorado', 'colores valorados')}; valora colores más variados para obtener una sugerencia.`,
      }),
      bar(analysis.minRequired ? (analysis.ratedCount / analysis.minRequired) * 100 : 0));
    return;
  }
  const { top, runnerUp } = analysis;
  box.dataset.seasonId = top.id;
  box.dataset.family = familyOf(top.id);
  const description = state.seasonById.get(top.id)?.description;
  box.append(
    seasonBand(top.id, { max: 10, className: 'band band-lg' }),
    FAMILY[familyOf(top.id)] ? el('span', { class: 'family', text: `Familia ${FAMILY[familyOf(top.id)]}` }) : null,
    el('span', { class: 'season-name', 'data-testid': 'season-top-name', text: top.name }),
    el('p', {},
      el('span', { text: `Afinidad: ${percent(top.score)} · Confianza: ` }),
      el('strong', { 'data-testid': 'season-confidence', text: CONFIDENCE[analysis.confidence] ?? analysis.confidence })),
    bar(top.score),
    description ? el('p', { class: 'muted', text: description }) : null,
    runnerUp
      ? el('p', { 'data-testid': 'season-runner-up', text: `Segunda opción: ${runnerUp.name} (${percent(runnerUp.score)})` })
      : null);
}

function renderChips(listNode, ids, emptyText) {
  const colors = (ids ?? []).map((id) => state.colorById.get(id)).filter(Boolean);
  clear(listNode).append(...(colors.length
    ? colors.map(colorChip)
    : [el('li', { class: 'empty', text: emptyText })]));
}

function renderAxes(analysis) {
  const groups = [
    ['Subtono', 'undertone', UNDERTONE],
    ['Profundidad', 'depth', DEPTH],
    ['Intensidad', 'chroma', CHROMA],
  ];
  clear($('axes')).append(...groups.map(([title, key, labels]) =>
    el('div', { class: 'axis', 'data-testid': `axis-${key}` },
      el('h3', { text: title }),
      ...Object.entries(labels).map(([value, label]) => {
        const score = analysis?.axes?.[key]?.[value] ?? null;
        return el('div', { class: 'meter', 'data-axis-value': value },
          el('span', { text: label }),
          bar(score),
          el('span', { class: 'val', text: score == null ? 'Sin datos' : percent(score) }));
      }))));
}

function renderSeasons(analysis) {
  const topId = analysis?.enough ? analysis?.top?.id : null;
  clear($('season-scores')).append(...(analysis?.seasons ?? []).map((season) =>
    el('li', { class: season.id === topId ? 'top' : '', 'data-testid': `season-score-${season.id}`, 'data-family': familyOf(season.id) },
      el('div', { class: 'rank-head' },
        el('span', { class: 'who' },
          el('span', { class: 'season-label', text: season.name }),
          el('span', { class: 'tag', text: plural(season.ratedCount ?? 0, 'valorado', 'valorados') })),
        el('span', { class: 'val', text: season.score == null ? 'Sin datos' : percent(season.score) })),
      el('div', { class: 'season-row' },
        seasonBand(season.id, { max: 6, className: 'band band-sm' }),
        bar(season.score)))));
}

function renderRanking() {
  const entries = rankedRatings();
  $('ranking-empty').hidden = entries.length > 0;
  clear($('ranking-list')).append(...entries.map(({ rating, color }) =>
    el('li', { 'data-testid': `ranking-item-${color.id}`, 'data-color-id': color.id },
      el('div', { class: 'rank-head' },
        el('span', { class: 'who' },
          el('span', { class: 'dot', style: { backgroundColor: safeHex(color.hex) } }),
          el('span', { text: color.name }),
          el('span', { class: 'tag', text: UNDERTONE[color.undertone] ?? color.undertone })),
        el('strong', { text: rating.score == null ? 'Sin puntuación' : percent(rating.score) })),
      bar(rating.score))));
}

let actions = {};

function renderAuto() {
  const box = clear($('auto-estimate'));
  box.dataset.hasAuto = String(Boolean(state.analysis?.auto));
  box.append(...autoNodes({ prefix: 'auto', onTry: actions.onTrySuggested, onAnalyze: actions.onAnalyze }));
}

function render() {
  if (!state.session) return;
  const analysis = state.analysis;
  renderSuggested(analysis);
  clear($('analysis-messages')).append(...(analysis?.messages ?? []).map((m) => el('li', { text: m })));
  renderChips($('recommended-list'), analysis?.recommended, 'Todavía no hay colores recomendados.');
  renderChips($('avoid-list'), analysis?.avoid, 'Todavía no hay colores a evitar.');
  const more = avoidMore(analysis);
  $('avoid-more').textContent = more ? `y ${more} más con menos del 40 %.` : '';
  $('avoid-more').hidden = !more;
  renderAuto();
  renderAxes(analysis);
  renderSeasons(analysis);
  renderRanking();
}

export function initResults(options = {}) {
  actions = options;
  on('session', render);
  on('sessionMeta', renderAuto);
  on('ratings', render);
}
