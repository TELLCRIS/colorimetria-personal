// Paleta de colores filtrable, con marca en los ya valorados.
import { $, el, clear, safeHex, textColorFor, UNDERTONE, DEPTH } from './dom.js';
import { state, on, setFilters, pickColor, visibleColors, isRated, ratedCount, suggestedIds } from './store.js';

function fillSelect(select, allLabel, entries) {
  clear(select).append(
    el('option', { value: '', text: allLabel }),
    ...entries.map(([value, label]) => el('option', { value, text: label })));
}

function swatch(color) {
  const hex = safeHex(color.hex);
  return el('button', {
    type: 'button', class: 'swatch', 'data-testid': `swatch-${color.id}`, 'data-color-id': color.id,
    'aria-pressed': 'false', onClick: () => pickColor(color.id),
  },
    el('span', { class: 'chip', style: { backgroundColor: hex, color: textColorFor(hex) }, 'aria-hidden': 'true' },
      el('span', { class: 'mark' }),
      el('span', { class: 'slot' })),
    el('span', { class: 'label' },
      el('span', { class: 'name', text: color.name }),
      el('span', { class: 'sr-only extra' })));
}

function syncFilters() {
  const { undertone, depth, season, suggested } = state.filters;
  $('filter-undertone').value = undertone;
  $('filter-depth').value = depth;
  $('filter-season').value = season;
  const available = suggestedIds().length;
  const box = $('filter-suggested');
  box.disabled = !available;
  box.checked = Boolean(suggested && available);
  $('filter-suggested-label').textContent = available
    ? `Solo los ${available} colores sugeridos por el análisis del rostro`
    : 'Solo los colores sugeridos por el análisis del rostro (analiza tu rostro primero)';
}

function build() {
  syncFilters();
  const list = visibleColors();
  const grid = clear($('swatches'));
  grid.append(...list.map(swatch));
  grid.dataset.suggested = String(Boolean(state.filters.suggested));
  $('palette-status').textContent = !state.colors.length
    ? 'No hay colores disponibles.'
    : !list.length
      ? 'Ningún color coincide con estos filtros. Cambia o quita algún filtro.'
      : `Mostrando ${list.length} de ${state.colors.length} colores · ${ratedCount()} valorados en esta sesión.`;
  mark();
}

function mark() {
  const { a, b, compare } = state.selection;
  for (const button of $('swatches').children) {
    const id = button.dataset.colorId;
    const rating = isRated(id) ? state.ratings.get(id) : null;
    const isA = id === a;
    const isB = compare && id === b;
    button.setAttribute('aria-pressed', String(isA || isB));
    button.dataset.rated = String(Boolean(rating));
    button.querySelector('.mark').textContent = rating ? (rating.score == null ? '✓' : `✓ ${rating.score}%`) : '';
    button.querySelector('.slot').textContent = !compare ? '' : isA && isB ? 'Izq. y der.' : isA ? 'Izq.' : isB ? 'Der.' : '';
    const extra = [];
    if (rating) extra.push(rating.score == null ? 'valorado' : `valorado con ${rating.score}%`);
    if (compare && isA) extra.push('mitad izquierda');
    if (isB) extra.push('mitad derecha');
    button.querySelector('.extra').textContent = extra.length ? ` (${extra.join(', ')})` : '';
  }
}

export function initPalette() {
  $('filter-undertone').addEventListener('change', (e) => setFilters({ undertone: e.target.value }));
  $('filter-depth').addEventListener('change', (e) => setFilters({ depth: e.target.value }));
  $('filter-season').addEventListener('change', (e) => setFilters({ season: e.target.value }));
  $('filter-suggested').addEventListener('change', (e) => setFilters({ suggested: e.target.checked }));

  on('session', () => {
    fillSelect($('filter-undertone'), 'Todos', Object.entries(UNDERTONE));
    fillSelect($('filter-depth'), 'Todas', Object.entries(DEPTH));
    fillSelect($('filter-season'), 'Todas', state.seasons.map((s) => [s.id, s.name]));
    build();
  });
  on('filters', build);
  on('selection', mark);
  on('ratings', build);
}
