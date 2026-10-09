// Bloque "Estimación automática" (a partir de las muestras de piel, cabello y ojos).
// Se usa en Resultados y en el informe; `prefix` evita data-testid repetidos.
import { el, bar, colorChip, featureChip, percent, UNDERTONE, DEPTH, CHROMA, CONTRAST, FEATURES } from './dom.js';
import { state } from './store.js';

const DISCLAIMER = 'Estimación orientativa calculada con tres muestras de color de tu foto. Depende mucho de la luz, de la cámara y del punto elegido: no es un diagnóstico. Dale más peso a lo que ves al probar los colores.';

function trait(label, value, labels) {
  return el('span', { class: 'tag' }, `${label}: `, el('strong', { text: value ? (labels[value] ?? value) : 'sin datos' }));
}

/**
 * @param {{ prefix: string, onTry?: () => void, onAnalyze?: () => void }} options
 * @returns {Node[]}
 */
export function autoNodes({ prefix, onTry, onAnalyze }) {
  const auto = state.analysis?.auto ?? null;
  const features = state.session?.features ?? {};
  const t = (name) => `${prefix}-${name}`;

  if (!auto) {
    return [
      el('p', { 'data-testid': t('empty'), text: 'Todavía no hay estimación automática. En «Probar colores», toma o sube una foto y pulsa «Analizar mi rostro» para marcar piel, cabello y ojos.' }),
      onAnalyze ? el('div', { class: 'controls' },
        el('button', { type: 'button', 'data-testid': t('go-analyze'), text: 'Ir a analizar mi rostro', onClick: onAnalyze })) : null,
      el('p', { class: 'note', text: DISCLAIMER }),
    ].filter(Boolean);
  }

  const recommended = (auto.recommended ?? []).map((id) => state.colorById.get(id)).filter(Boolean);
  const agrees = auto.agreesWithRatings;
  const agreementText = agrees === true
    ? 'Coincide con lo que indican tus valoraciones.'
    : agrees === false
      ? 'No coincide con tus valoraciones. Da prioridad a tus valoraciones: reflejan lo que ves con cada color.'
      : 'Todavía no se puede comparar con tus valoraciones: faltan colores por valorar.';

  return [
    el('ul', { class: 'chips', 'data-testid': t('features') },
      FEATURES.map((f) => featureChip(f.label, features[f.key], t(`swatch-${f.key}`)))),
    el('p', { class: 'traits', 'data-testid': t('traits') },
      trait('Subtono', auto.undertone, UNDERTONE),
      trait('Profundidad', auto.depth, DEPTH),
      trait('Contraste', auto.contrast, CONTRAST),
      trait('Intensidad', auto.chroma, CHROMA)),
    el('h3', { text: 'Estaciones más compatibles' }),
    el('ol', { class: 'auto-seasons', 'data-testid': t('seasons') },
      (auto.seasons ?? []).map((season) =>
        el('li', { 'data-testid': t(`season-${season.id}`) },
          el('div', { class: 'rank-head' },
            el('span', { text: season.name }),
            el('span', { text: percent(season.score) })),
          bar(season.score)))),
    el('p', {
      class: 'agreement', 'data-testid': t('agreement'),
      'data-agrees': agrees == null ? 'unknown' : String(agrees), text: agreementText,
    }),
    (auto.messages ?? []).length
      ? el('ul', { class: 'messages', 'data-testid': t('messages') }, auto.messages.map((m) => el('li', { text: m })))
      : null,
    recommended.length ? el('h3', { text: 'Colores por los que empezar' }) : null,
    recommended.length ? el('ul', { class: 'chips', 'data-testid': t('recommended') }, recommended.map(colorChip)) : null,
    recommended.length && onTry ? el('div', { class: 'controls' },
      el('button', { type: 'button', class: 'primary', 'data-testid': 'try-suggested', text: 'Probar los colores sugeridos', onClick: onTry })) : null,
    el('p', { class: 'note', text: DISCLAIMER }),
  ].filter(Boolean);
}
