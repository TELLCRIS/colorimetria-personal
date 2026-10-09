// Cálculo de la estación de colorimetría. Lógica pura: sin Express ni SQL.
//
// FÓRMULA
// 1. Puntuación de un color: score = round(100 × suma / (3 × answered)), donde `answered`
//    es el nº de criterios no nulos ("No sé" no cuenta ni suma). Sin respuestas → null,
//    y ese color no se considera "valorado".
// 2. Ejes (subtono, profundidad, intensidad): media redondeada del score de los colores
//    valorados de cada grupo; null si no hay ninguno.
// 3. Estación: media bayesiana de sus colores valorados, encogida hacia la media global g
//    de todos los colores valorados:
//        score_e = round((Σ score_i + K × g) / (n + K)),  K = SHRINK_WEIGHT = 2
//    Así una estación con un solo color y una nota alta queda cerca de la media global.
//    Sin colores valorados → null.
// 4. Orden de las 12: score descendente (null al final), después más colores valorados,
//    después el orden canónico de estaciones (desempate estable y determinista).
// 5. `top` y `runnerUp`: las dos primeras de esa lista que tengan al menos
//    MIN_SEASON_RATED (2) colores valorados; solo si ratedCount ≥ MIN_REQUIRED (12).
// 6. Confianza:
//      insuficiente → no hay bastantes colores o ninguna estación elegible.
//      baja  → top < 50, o distancia top−segunda < 3, o top con menos de 3 colores valorados.
//              Excepción (empate entre hermanas): si top y segunda son de la misma familia, la distancia
//              es < 3 y esa familia destaca con claridad, la confianza es «media» y el aviso dice que
//              encaja en la familia. La familia destaca si la media de sus colores valorados (≥ 4)
//              supera en ≥ 8 puntos a la de cualquier otra familia (FAMILY_CLEAR_GAP).
//      alta  → distancia ≥ 8, top con ≥ 4 colores valorados, ≥ 24 colores valorados en total
//              y al menos 2 colores valorados en cada una de las 4 familias.
//      media → el resto.
// 8. auto: estimación independiente a partir de los colores del rostro (ver features.js).
//    agreesWithRatings = true si la primera estación de `auto` es top o runnerUp, o es de la
//    misma familia que top; false si hay top y no coincide; null si no hay top.
// 7. recommended: colores de la estación top que no estén en `avoid`: primero los valorados
//    con score ≥ 50 (mejor primero), luego los no probados, luego los valorados < 50.
//    Nunca incluye un color valorado con score < 40, esté o no entre los 8 de `avoid`.
//    avoid: colores valorados con score < 40, peor primero, máximo 8. avoidCount: cuántos hay en total.

import { estimateFromFeatures } from './features.js';
import { SEASONS, FAMILIES, FAMILY_NAMES, UNDERTONES, DEPTHS, CHROMAS } from './colors.js';

export const CRITERIA = ['even', 'eyes', 'shadows', 'harmony'];
export const MIN_REQUIRED = 12;
export const MIN_SEASON_RATED = 2;
export const SHRINK_WEIGHT = 2;

const TIE_GAP = 2;
const LOW_SCORE = 50;
const AVOID_BELOW = 40;
const AVOID_MAX = 8;
const FAMILY_CLEAR_GAP = 8;
const FAMILY_MIN_RATED = 4;

const UNDERTONE_LABELS = { calido: 'cálido', frio: 'frío', neutro: 'neutro' };

/** Devuelve { answered, score } para un conjunto de 4 criterios (null o 0..3). */
export function computeScore(rating) {
  let answered = 0;
  let sum = 0;
  for (const key of CRITERIA) {
    const value = rating[key];
    if (value !== null && value !== undefined) {
      answered += 1;
      sum += value;
    }
  }
  return { answered, score: answered === 0 ? null : Math.round((100 * sum) / (3 * answered)) };
}

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const roundedMean = (values) => (values.length === 0 ? null : Math.round(mean(values)));

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function axisMeans(rated, key, groups) {
  const out = {};
  for (const group of groups) {
    out[group] = roundedMean(rated.filter((r) => r.color[key] === group).map((r) => r.score));
  }
  return out;
}

const summary = (s) => ({ id: s.id, name: s.name, family: s.family, score: s.score });

/**
 * @param {Array<{colorId:string, even:number|null, eyes:number|null, shadows:number|null, harmony:number|null}>} ratings
 * @param {Array<object>} colors paleta (Color[])
 * @param {Array<object>} [seasons] catálogo de estaciones
 * @param {{skin:string|null, hair:string|null, eyes:string|null}|null} [features] colores del rostro
 */
export function analyze(ratings, colors, seasons = SEASONS, features = null) {
  const colorById = new Map(colors.map((color, index) => [color.id, { color, index }]));

  // Colores valorados (answered > 0), uno por color, en orden de paleta.
  const ratedByColor = new Map();
  for (const rating of ratings ?? []) {
    const entry = colorById.get(rating.colorId);
    if (!entry) continue;
    const { answered, score } = computeScore(rating);
    if (answered === 0) continue;
    ratedByColor.set(entry.color.id, { color: entry.color, index: entry.index, score });
  }
  const rated = [...ratedByColor.values()].sort((a, b) => a.index - b.index);
  const ratedCount = rated.length;
  const enough = ratedCount >= MIN_REQUIRED;
  const globalMean = ratedCount > 0 ? mean(rated.map((r) => r.score)) : null;

  const axes = {
    undertone: axisMeans(rated, 'undertone', UNDERTONES),
    depth: axisMeans(rated, 'depth', DEPTHS),
    chroma: axisMeans(rated, 'chroma', CHROMAS),
  };

  const seasonRows = seasons.map((season, order) => {
    const members = rated.filter((r) => r.color.seasons.includes(season.id));
    const n = members.length;
    const score =
      n === 0
        ? null
        : Math.round((members.reduce((a, r) => a + r.score, 0) + SHRINK_WEIGHT * globalMean) / (n + SHRINK_WEIGHT));
    return { id: season.id, name: season.name, family: season.family, score, ratedCount: n, order };
  });
  seasonRows.sort((a, b) => {
    if (a.score === null || b.score === null) {
      if (a.score !== b.score) return a.score === null ? 1 : -1;
      return a.order - b.order;
    }
    return b.score - a.score || b.ratedCount - a.ratedCount || a.order - b.order;
  });

  const eligible = enough ? seasonRows.filter((s) => s.ratedCount >= MIN_SEASON_RATED) : [];
  const topRow = eligible[0] ?? null;
  const runnerRow = eligible[1] ?? null;
  const gap = topRow && runnerRow ? topRow.score - runnerRow.score : null;

  const familyRated = {};
  const familyMean = {};
  for (const family of FAMILIES) {
    const ids = new Set(seasons.filter((s) => s.family === family).map((s) => s.id));
    const members = rated.filter((r) => r.color.seasons.some((id) => ids.has(id)));
    familyRated[family] = members.length;
    familyMean[family] = members.length > 0 ? mean(members.map((r) => r.score)) : null;
  }

  // Empate entre subestaciones hermanas dentro de una familia que destaca sobre las demás.
  const closeGap = gap !== null && gap < 3;
  const siblingTie =
    closeGap &&
    topRow.family === runnerRow.family &&
    familyRated[topRow.family] >= FAMILY_MIN_RATED &&
    FAMILIES.every(
      (family) =>
        family === topRow.family ||
        familyMean[family] === null ||
        familyMean[topRow.family] - familyMean[family] >= FAMILY_CLEAR_GAP
    );

  let confidence;
  if (!topRow) {
    confidence = 'insuficiente';
  } else if (topRow.score < LOW_SCORE || (closeGap && !siblingTie) || topRow.ratedCount < 3) {
    confidence = 'baja';
  } else if (
    !siblingTie &&
    (gap === null || gap >= 8) &&
    topRow.ratedCount >= 4 &&
    ratedCount >= 2 * MIN_REQUIRED &&
    FAMILIES.every((family) => familyRated[family] >= 2)
  ) {
    confidence = 'alta';
  } else {
    confidence = 'media';
  }

  const disliked = rated
    .filter((r) => r.score < AVOID_BELOW)
    .sort((a, b) => a.score - b.score || a.index - b.index);
  const avoidCount = disliked.length;
  const avoid = disliked.slice(0, AVOID_MAX).map((r) => r.color.id);

  let recommended = [];
  if (topRow) {
    const dislikedSet = new Set(disliked.map((r) => r.color.id));
    const tier = (entry) => {
      const r = ratedByColor.get(entry.color.id);
      if (!r) return { tier: 1, score: 0 };
      return { tier: r.score >= LOW_SCORE ? 0 : 2, score: r.score };
    };
    recommended = colors
      .map((color, index) => ({ color, index }))
      .filter((e) => e.color.seasons.includes(topRow.id) && !dislikedSet.has(e.color.id))
      .map((e) => ({ ...e, ...tier(e) }))
      .sort((a, b) => a.tier - b.tier || b.score - a.score || a.index - b.index)
      .map((e) => e.color.id);
  }

  // --- Avisos ---
  const messages = [];
  if (ratedCount === 0) {
    messages.push(`Aún no has valorado ningún color. Prueba al menos ${MIN_REQUIRED} para obtener una sugerencia de estación.`);
  } else if (!enough) {
    const missing = MIN_REQUIRED - ratedCount;
    messages.push(
      `Has valorado ${ratedCount} de los ${MIN_REQUIRED} colores mínimos; prueba ${missing} más para obtener una sugerencia de estación.`
    );
  }
  if (ratedCount > 0) {
    const uncovered = FAMILIES.filter((family) => familyRated[family] === 0).map((f) => FAMILY_NAMES[f]);
    if (uncovered.length > 0) {
      messages.push(`Aún no has probado ningún color de ${joinList(uncovered)}; el resultado puede estar sesgado.`);
    }
    const missingUndertones = UNDERTONES.filter((u) => axes.undertone[u] === null).map((u) => UNDERTONE_LABELS[u]);
    if (missingUndertones.length > 0) {
      messages.push(`Faltan colores de subtono ${joinList(missingUndertones)} por probar para poder comparar.`);
    }
  }
  if (enough && !topRow) {
    messages.push(
      `Ninguna estación tiene al menos ${MIN_SEASON_RATED} colores valorados; prueba más colores de una misma estación.`
    );
  }
  if (topRow) {
    if (siblingTie) {
      messages.push(
        `Encajas claramente en la familia ${FAMILY_NAMES[topRow.family]}; entre ${topRow.name} (${topRow.score}) y ${runnerRow.name} (${runnerRow.score}) la diferencia es mínima: prueba más colores de ambas para afinar.`
      );
    } else if (runnerRow && gap <= TIE_GAP) {
      messages.push(
        `Empate técnico entre ${topRow.name} (${topRow.score}) y ${runnerRow.name} (${runnerRow.score}); prueba más colores de ambas para desempatar.`
      );
    }
    if (topRow.score < LOW_SCORE) {
      messages.push('Ninguna estación destaca con claridad: las puntuaciones son bajas en general. Revisa la luz y repite la prueba.');
    }
    const total = colors.filter((color) => color.seasons.includes(topRow.id)).length;
    if (topRow.ratedCount < total && topRow.ratedCount < 4) {
      messages.push(
        `Solo has valorado ${topRow.ratedCount} de los ${total} colores de ${topRow.name}; prueba el resto para confirmar el resultado.`
      );
    }
  }

  // --- Estimación automática (independiente de las valoraciones) ---
  const auto = estimateFromFeatures(features, colors, seasons);
  if (auto && topRow && auto.seasons[0]) {
    const first = auto.seasons[0];
    auto.agreesWithRatings = first.id === topRow.id || first.id === runnerRow?.id || first.family === topRow.family;
    auto.messages.push(
      auto.agreesWithRatings
        ? `La estimación automática (${first.name}) es coherente con tus valoraciones (${topRow.name}).`
        : `La estimación automática (${first.name}) no coincide con tus valoraciones (${topRow.name}); da más peso a las valoraciones.`
    );
  }

  return {
    ratedCount,
    minRequired: MIN_REQUIRED,
    enough,
    axes,
    seasons: seasonRows.map(({ order, ...row }) => row),
    top: topRow ? summary(topRow) : null,
    runnerUp: runnerRow ? summary(runnerRow) : null,
    confidence,
    recommended,
    avoid,
    avoidCount,
    messages,
    auto,
  };
}
