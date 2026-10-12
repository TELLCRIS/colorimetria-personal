// "Mi paleta": tira que se llena sola a medida que se valora.
// score ≥ 60 → "Me favorecen"; score < 40 → "Mejor evitar".
import { $, el, clear, safeHex, textColorFor } from './dom.js';
import { state, on, pickColor, evaluatedColorId, isRated } from './store.js';

const GOOD_MIN = 60;
const AVOID_MAX = 40;
const GROUP_NAME = { good: 'Me favorecen', avoid: 'Mejor evitar' };

let previous = new Map(); // colorId → 'good' | 'avoid'

function groups() {
  const good = [];
  const avoid = [];
  for (const rating of state.ratings.values()) {
    const color = state.colorById.get(rating.colorId);
    if (!color || !isRated(rating.colorId) || rating.score == null) continue;
    if (rating.score >= GOOD_MIN) good.push({ color, score: rating.score });
    else if (rating.score < AVOID_MAX) avoid.push({ color, score: rating.score });
  }
  const byName = (x, y) => x.color.name.localeCompare(y.color.name, 'es');
  good.sort((x, y) => y.score - x.score || byName(x, y));
  avoid.sort((x, y) => x.score - y.score || byName(x, y));
  return { good, avoid };
}

function chip({ color, score }, group) {
  const hex = safeHex(color.hex);
  return el('li', {},
    el('button', {
      type: 'button', class: 'mp-chip', 'data-testid': `my-palette-chip-${color.id}`,
      'data-color-id': color.id, 'data-group': group, 'aria-pressed': 'false',
      'aria-label': `${color.name}, ${score}%, ${GROUP_NAME[group].toLowerCase()}. Probar este color`,
      onClick: () => pickColor(color.id),
    },
      // Retal de tela con el borde cortado en zigzag; el nombre va debajo, como en un muestrario.
      el('span', { class: 'cloth', style: { backgroundColor: hex, color: textColorFor(hex) } },
        el('span', { class: 'pct', text: `${score}%` })),
      el('span', { class: 'name', text: color.name })));
}

function markSelected() {
  const current = evaluatedColorId();
  document.querySelectorAll('.mp-chip').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.colorId === current));
  });
}

function render(announce) {
  const { good, avoid } = groups();
  clear($('my-palette-good')).append(...good.map((entry) => chip(entry, 'good')));
  clear($('my-palette-avoid')).append(...avoid.map((entry) => chip(entry, 'avoid')));
  $('my-palette-good-group').hidden = !good.length;
  $('my-palette-avoid-group').hidden = !avoid.length;
  $('my-palette-empty').hidden = good.length + avoid.length > 0;

  const now = new Map([
    ...good.map((entry) => [entry.color.id, 'good']),
    ...avoid.map((entry) => [entry.color.id, 'avoid']),
  ]);
  if (announce) {
    const changes = [];
    for (const [id, group] of now) {
      if (previous.get(id) !== group) changes.push(`${state.colorById.get(id).name} entra en «${GROUP_NAME[group]}».`);
    }
    for (const id of previous.keys()) {
      if (!now.has(id)) changes.push(`${state.colorById.get(id)?.name ?? 'Un color'} sale de Mi paleta.`);
    }
    if (changes.length) {
      $('my-palette-status').textContent =
        `${changes.join(' ')} Me favorecen: ${good.length}. Mejor evitar: ${avoid.length}.`;
    }
  } else {
    $('my-palette-status').textContent = '';
  }
  previous = now;
  markSelected();
}

export function initMyPalette() {
  on('session', () => render(false));
  on('ratings', () => render(true));
  on('selection', markSelected);
}
