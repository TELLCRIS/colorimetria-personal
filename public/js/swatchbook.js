// Piezas de muestrario compartidas: tiras con los colores reales de una estación del catálogo.
import { el, safeHex } from './dom.js';
import { state } from './store.js';

/** Colores del catálogo que pertenecen a una estación. */
export function seasonColors(seasonId, max = 8) {
  return state.colors.filter((color) => (color.seasons ?? []).includes(seasonId)).slice(0, max);
}

/** Familia (primavera, verano, otono, invierno) de una estación. */
export function familyOf(seasonId) {
  return state.seasonById.get(seasonId)?.family ?? String(seasonId ?? '').split('-')[0];
}

/** Tira decorativa con los colores de una estación; null si el catálogo no tiene ninguno. */
export function seasonBand(seasonId, { max = 8, className = 'band' } = {}) {
  const colors = seasonColors(seasonId, max);
  if (!colors.length) return null;
  return el('span', { class: className, 'aria-hidden': 'true' },
    colors.map((color) => el('i', { style: { backgroundColor: safeHex(color.hex) } })));
}
