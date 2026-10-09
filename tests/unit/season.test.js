// Unitarias de la lógica pura de estación. Se prueba contra el contrato, no contra la implementación.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, computeScore } from '../../public/js/core/season.js';
import { COLORS, SEASONS } from '../../public/js/core/colors.js';

const rate = (colorId, v) => ({ colorId, even: v, eyes: v, shadows: v, harmony: v });
const inSeason = (seasonId) => COLORS.filter((c) => c.seasons.includes(seasonId));
const familyOf = (seasonId) => SEASONS.find((s) => s.id === seasonId).family;
const scoreOf = (ratings) => new Map(ratings.map((r) => [r.colorId, computeScore(r).score]));
const CONFIDENCES = ['insuficiente', 'baja', 'media', 'alta'];

describe('computeScore', () => {
  test('todo "Mucho" da 100 con 4 respondidos', () => {
    assert.deepEqual(computeScore({ even: 3, eyes: 3, shadows: 3, harmony: 3 }), { answered: 4, score: 100 });
  });
  test('todo "Nada" da 0 (no null) con 4 respondidos', () => {
    assert.deepEqual(computeScore({ even: 0, eyes: 0, shadows: 0, harmony: 0 }), { answered: 4, score: 0 });
  });
  test('sin respuestas ("No sé" en los 4) da answered 0 y score null', () => {
    assert.deepEqual(computeScore({ even: null, eyes: null, shadows: null, harmony: null }), { answered: 0, score: null });
  });
  test('"No sé" no cuenta ni resta: la media se hace solo con los respondidos', () => {
    assert.deepEqual(computeScore({ even: 3, eyes: null, shadows: null, harmony: null }), { answered: 1, score: 100 });
    assert.deepEqual(computeScore({ even: 3, eyes: 0, shadows: null, harmony: null }), { answered: 2, score: 50 });
    assert.deepEqual(computeScore({ even: 2, eyes: 2, shadows: 1, harmony: null }), { answered: 3, score: 56 });
  });
  test('redondea round(100·suma/(3·answered)) en los casos frontera', () => {
    assert.equal(computeScore({ even: 1, eyes: 1, shadows: 1, harmony: 1 }).score, 33);
    assert.equal(computeScore({ even: 2, eyes: 2, shadows: 2, harmony: 2 }).score, 67);
    assert.equal(computeScore({ even: 3, eyes: 3, shadows: 0, harmony: 0 }).score, 50);
    assert.equal(computeScore({ even: 1, eyes: 0, shadows: 0, harmony: 0 }).score, 8);
    assert.equal(computeScore({ even: 3, eyes: 3, shadows: 3, harmony: 2 }).score, 92);
    assert.equal(computeScore({ even: 1, eyes: 2, shadows: null, harmony: null }).score, 50);
  });
  test('la puntuación siempre es un entero entre 0 y 100 para toda combinación válida', () => {
    const values = [null, 0, 1, 2, 3];
    for (const even of values) for (const eyes of values) for (const shadows of values) for (const harmony of values) {
      const { answered, score } = computeScore({ even, eyes, shadows, harmony });
      const expectedAnswered = [even, eyes, shadows, harmony].filter((v) => v !== null).length;
      assert.equal(answered, expectedAnswered);
      if (answered === 0) assert.equal(score, null);
      else {
        const sum = [even, eyes, shadows, harmony].reduce((a, v) => a + (v ?? 0), 0);
        assert.equal(score, Math.round((100 * sum) / (3 * answered)));
        assert.ok(Number.isInteger(score) && score >= 0 && score <= 100);
      }
    }
  });
});

describe('analyze: forma y datos insuficientes', () => {
  test('sin valoraciones: 12 estaciones sin puntuación, sin top y confianza insuficiente', () => {
    const a = analyze([], COLORS, SEASONS);
    assert.equal(a.ratedCount, 0);
    assert.equal(a.minRequired, 12);
    assert.equal(a.enough, false);
    assert.equal(a.top, null);
    assert.equal(a.runnerUp, null);
    assert.equal(a.confidence, 'insuficiente');
    assert.deepEqual(a.recommended, []);
    assert.deepEqual(a.avoid, []);
    assert.equal(a.auto, null);
    assert.equal(a.seasons.length, 12);
    assert.deepEqual(a.seasons.map((s) => s.id), SEASONS.map((s) => s.id), 'sin datos, orden canónico');
    assert.ok(a.seasons.every((s) => s.score === null));
    assert.ok(Array.isArray(a.messages) && a.messages.length >= 1);
    for (const axis of ['undertone', 'depth', 'chroma']) {
      assert.ok(Object.values(a.axes[axis]).every((v) => v === null));
    }
    assert.deepEqual(Object.keys(a.axes.undertone).sort(), ['calido', 'frio', 'neutro']);
    assert.deepEqual(Object.keys(a.axes.depth).sort(), ['claro', 'medio', 'oscuro']);
    assert.deepEqual(Object.keys(a.axes.chroma).sort(), ['brillante', 'medio', 'suave']);
  });

  test('acepta ratings null o undefined sin lanzar', () => {
    assert.equal(analyze(null, COLORS, SEASONS).ratedCount, 0);
    assert.equal(analyze(undefined, COLORS).ratedCount, 0);
  });

  test('con 11 colores valorados no hay top; con 12 sí', () => {
    const ids = inSeason('otono-calido').concat(inSeason('invierno-frio')).map((c) => c.id);
    const unique = [...new Set(ids)];
    assert.ok(unique.length >= 12);
    const eleven = analyze(unique.slice(0, 11).map((id) => rate(id, 2)), COLORS, SEASONS);
    assert.equal(eleven.ratedCount, 11);
    assert.equal(eleven.enough, false);
    assert.equal(eleven.top, null);
    assert.equal(eleven.runnerUp, null);
    assert.equal(eleven.confidence, 'insuficiente');
    assert.deepEqual(eleven.recommended, []);
    const twelve = analyze(unique.slice(0, 12).map((id) => rate(id, 2)), COLORS, SEASONS);
    assert.equal(twelve.ratedCount, 12);
    assert.equal(twelve.enough, true);
    assert.notEqual(twelve.top, null);
    assert.notEqual(twelve.confidence, 'insuficiente');
  });

  test('una valoración con los 4 criterios en "No sé" no cuenta como color valorado', () => {
    const ratings = COLORS.slice(0, 11).map((c) => rate(c.id, 3));
    ratings.push(rate(COLORS[11].id, null));
    const a = analyze(ratings, COLORS, SEASONS);
    assert.equal(a.ratedCount, 11);
    assert.equal(a.enough, false);
    assert.equal(a.top, null);
  });

  test('un color con un solo criterio respondido sí cuenta como valorado', () => {
    const a = analyze([{ colorId: 'negro', even: 2, eyes: null, shadows: null, harmony: null }], COLORS, SEASONS);
    assert.equal(a.ratedCount, 1);
    assert.equal(a.axes.undertone.frio, 67);
  });

  test('ignora colores desconocidos y cuenta una sola vez un color repetido', () => {
    const a = analyze([rate('no-existe', 3), rate('negro', 3), rate('negro', 0)], COLORS, SEASONS);
    assert.equal(a.ratedCount, 1);
  });

  test('no muta las valoraciones ni la paleta de entrada', () => {
    const ratings = COLORS.slice(0, 20).map((c, i) => rate(c.id, i % 4));
    const snapshot = JSON.stringify(ratings);
    analyze(ratings, COLORS, SEASONS, { skin: '#E8C4A8', hair: null, eyes: null });
    assert.equal(JSON.stringify(ratings), snapshot);
  });
});

describe('analyze: orden, empates y estabilidad', () => {
  const mixed = COLORS.map((c, i) => rate(c.id, (i * 7) % 4));

  test('las 12 estaciones salen en orden descendente de puntuación con null al final', () => {
    const subset = inSeason('otono-calido').concat(inSeason('otono-profundo')).map((c) => rate(c.id, 3));
    const a = analyze(subset, COLORS, SEASONS);
    assert.equal(a.seasons.length, 12);
    assert.equal(new Set(a.seasons.map((s) => s.id)).size, 12);
    let seenNull = false;
    let prev = Infinity;
    for (const s of a.seasons) {
      if (s.score === null) { seenNull = true; continue; }
      assert.equal(seenNull, false, 'una estación con puntuación aparece después de una sin datos');
      assert.ok(s.score <= prev, 'orden no descendente');
      assert.ok(Number.isInteger(s.score) && s.score >= 0 && s.score <= 100);
      prev = s.score;
    }
    assert.ok(seenNull, 'debería haber estaciones sin datos en este caso');
  });

  test('el resultado no depende del orden en que llegan las valoraciones', () => {
    const forward = analyze(mixed, COLORS, SEASONS);
    const reversed = analyze([...mixed].reverse(), COLORS, SEASONS);
    const shuffled = analyze([...mixed].sort((a, b) => a.colorId.localeCompare(b.colorId)), COLORS, SEASONS);
    assert.deepEqual(reversed, forward);
    assert.deepEqual(shuffled, forward);
  });

  test('es determinista: dos llamadas iguales dan resultados idénticos', () => {
    assert.deepEqual(analyze(mixed, COLORS, SEASONS), analyze(mixed, COLORS, SEASONS));
  });

  test('empate total (todo a 100): hay top y runnerUp distintos, misma nota, aviso de empate y confianza baja', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, 3)), COLORS, SEASONS);
    assert.ok(a.top && a.runnerUp);
    assert.notEqual(a.top.id, a.runnerUp.id);
    assert.equal(a.top.score, a.runnerUp.score);
    assert.equal(a.confidence, 'baja');
    assert.ok(a.messages.some((m) => /empate/i.test(m)), 'falta el aviso de empate técnico');
    assert.deepEqual(a.avoid, []);
  });

  test('empate entre estaciones: gana la que tiene más colores valorados y, a igualdad, la primera en orden canónico', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, 3)), COLORS, SEASONS);
    const order = new Map(SEASONS.map((s, i) => [s.id, i]));
    for (let i = 1; i < a.seasons.length; i++) {
      const p = a.seasons[i - 1];
      const q = a.seasons[i];
      if (p.score !== q.score) continue;
      assert.ok(p.ratedCount > q.ratedCount || (p.ratedCount === q.ratedCount && order.get(p.id) < order.get(q.id)),
        `desempate inestable entre ${p.id} y ${q.id}`);
    }
  });

  test('top y runnerUp son las dos primeras estaciones elegibles de la lista ordenada', () => {
    const a = analyze(mixed, COLORS, SEASONS);
    const eligible = a.seasons.filter((s) => s.ratedCount >= 2);
    assert.equal(a.top.id, eligible[0].id);
    assert.equal(a.runnerUp.id, eligible[1].id);
    assert.deepEqual(Object.keys(a.top).sort(), ['family', 'id', 'name', 'score']);
  });
});

describe('analyze: estación con un solo color valorado', () => {
  test('no puede ser top aunque su único color tenga 100', () => {
    // borgona-calido solo pertenece a otono-profundo; el resto de valorados no son de esa estación.
    const others = COLORS.filter((c) => !c.seasons.includes('otono-profundo')).slice(0, 14).map((c) => rate(c.id, 1));
    const a = analyze([rate('borgona-calido', 3), ...others], COLORS, SEASONS);
    assert.equal(a.enough, true);
    const row = a.seasons.find((s) => s.id === 'otono-profundo');
    assert.equal(row.ratedCount, 1);
    assert.notEqual(a.top?.id, 'otono-profundo');
    assert.notEqual(a.runnerUp?.id, 'otono-profundo');
    if (a.top) assert.ok(a.seasons.find((s) => s.id === a.top.id).ratedCount >= 2);
  });

  test('si ninguna estación tiene 2 colores valorados no hay top y se explica', () => {
    // 12 colores de una sola estación cada uno no existen; se fuerza con un catálogo reducido.
    const seasons = SEASONS;
    const colors = COLORS.map((c, i) => ({ ...c, seasons: [seasons[i % 12].id] })).slice(0, 12);
    const a = analyze(colors.map((c) => rate(c.id, 3)), colors, seasons);
    assert.equal(a.enough, true);
    assert.equal(a.top, null);
    assert.equal(a.confidence, 'insuficiente');
    assert.deepEqual(a.recommended, []);
    assert.ok(a.messages.length >= 1);
  });
});

describe('analyze: confianza', () => {
  test('siempre es uno de los 4 valores e "insuficiente" si y solo si no hay top', () => {
    for (let seed = 0; seed < 40; seed++) {
      const n = 1 + ((seed * 5) % 48);
      const ratings = COLORS.slice(0, n).map((c, i) => rate(c.id, (i * (seed + 3) + seed) % 4));
      const a = analyze(ratings, COLORS, SEASONS);
      assert.ok(CONFIDENCES.includes(a.confidence));
      assert.equal(a.confidence === 'insuficiente', a.top === null, `seed ${seed}`);
      if (!a.enough) assert.equal(a.top, null);
    }
  });

  test('todo a cero: la confianza es baja (nunca media o alta) y se avisa de puntuaciones bajas', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, 0)), COLORS, SEASONS);
    assert.equal(a.ratedCount, 48);
    assert.equal(a.confidence, 'baja');
    assert.ok(a.seasons.every((s) => s.score === 0));
    assert.ok(a.messages.length >= 1);
  });

  test('top por debajo de 50 implica confianza baja', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, 1)), COLORS, SEASONS);
    assert.ok(a.top.score < 50);
    assert.equal(a.confidence, 'baja');
  });

  for (const season of SEASONS) {
    test(`ganadora clara (${season.id}) con las 48 valoradas: top correcto y confianza alta`, () => {
      const ratings = COLORS.map((c) => rate(c.id, c.seasons.includes(season.id) ? 3 : 0));
      const a = analyze(ratings, COLORS, SEASONS);
      assert.equal(a.top.id, season.id);
      assert.ok(a.top.score - a.runnerUp.score >= 8);
      assert.equal(a.confidence, 'alta');
    });
  }

  test('con menos de 24 colores valorados la confianza nunca es alta', () => {
    const season = 'invierno-frio';
    const liked = inSeason(season).map((c) => rate(c.id, 3));
    const disliked = COLORS.filter((c) => !c.seasons.includes(season)).slice(0, 23 - liked.length).map((c) => rate(c.id, 0));
    const a = analyze([...liked, ...disliked], COLORS, SEASONS);
    assert.equal(a.ratedCount, 23);
    assert.equal(a.top.id, season);
    assert.notEqual(a.confidence, 'alta');
  });

  test('si falta una familia entera por probar, la confianza no es alta y se avisa', () => {
    const noSpring = COLORS.filter((c) => !c.seasons.some((s) => familyOf(s) === 'primavera'));
    assert.ok(noSpring.length >= 24);
    const a = analyze(noSpring.map((c) => rate(c.id, c.seasons.includes('invierno-profundo') ? 3 : 0)), COLORS, SEASONS);
    assert.equal(a.top.id, 'invierno-profundo');
    assert.notEqual(a.confidence, 'alta');
    assert.ok(a.messages.some((m) => /Primavera/.test(m)));
  });

  test('empate (< 3 puntos) entre estaciones de familias distintas implica confianza baja y aviso de empate técnico', () => {
    const liked = (c) => c.seasons.includes('primavera-calida') || c.seasons.includes('verano-frio');
    const a = analyze(COLORS.map((c) => rate(c.id, liked(c) ? 3 : 0)), COLORS, SEASONS);
    assert.notEqual(a.top.family, a.runnerUp.family);
    assert.ok(a.top.score - a.runnerUp.score < 3);
    assert.equal(a.confidence, 'baja');
    assert.ok(a.messages.some((m) => /empate técnico/i.test(m)));
    assert.ok(!a.messages.some((m) => /Encajas claramente/.test(m)));
  });
});

describe('analyze: empate entre subestaciones hermanas', () => {
  const inFamily = (c, family) => c.seasons.some((s) => familyOf(s) === family);
  const NAMES = { primavera: 'Primavera', verano: 'Verano', otono: 'Otoño', invierno: 'Invierno' };

  for (const family of ['primavera', 'verano', 'otono', 'invierno']) {
    test(`toda la familia ${family} gusta y el resto no: confianza media y mensaje de familia, no de empate`, () => {
      const a = analyze(COLORS.map((c) => rate(c.id, inFamily(c, family) ? 3 : 0)), COLORS, SEASONS);
      assert.equal(a.top.family, family);
      assert.equal(a.runnerUp.family, family);
      assert.ok(a.top.score - a.runnerUp.score < 3, 'el caso debe ser un empate entre hermanas');
      assert.equal(a.confidence, 'media');
      const message = a.messages.find((m) => /Encajas claramente/.test(m));
      assert.ok(message, `falta el mensaje de familia: ${a.messages.join(' | ')}`);
      assert.ok(message.includes(NAMES[family]), message);
      assert.ok(message.includes(a.top.name) && message.includes(a.runnerUp.name), message);
      assert.ok(!a.messages.some((m) => /empate técnico/i.test(m)), 'no debe hablar de empate técnico');
    });
  }

  test('un empate entre hermanas nunca da confianza alta, aunque se hayan valorado las 48', () => {
    for (const family of ['primavera', 'verano', 'otono', 'invierno']) {
      for (const low of [0, 1, 2]) {
        const a = analyze(COLORS.map((c) => rate(c.id, inFamily(c, family) ? 3 : low)), COLORS, SEASONS);
        if (a.top.family === a.runnerUp.family && a.top.score - a.runnerUp.score < 3) assert.notEqual(a.confidence, 'alta', `${family}/${low}`);
      }
    }
  });

  test('límite: si la familia no destaca al menos 8 puntos sobre otra, sigue siendo empate técnico con confianza baja', () => {
    // Verano a 100 y todo lo demás a 92: la media de las otras familias queda a menos de 8 puntos.
    const almost = { even: 3, eyes: 3, shadows: 3, harmony: 2 };
    const a = analyze(COLORS.map((c) => (inFamily(c, 'verano') ? rate(c.id, 3) : { colorId: c.id, ...almost })), COLORS, SEASONS);
    assert.equal(a.top.family, 'verano');
    assert.equal(a.runnerUp.family, 'verano');
    assert.equal(a.confidence, 'baja');
    assert.ok(a.messages.some((m) => /empate técnico/i.test(m)));
    assert.ok(!a.messages.some((m) => /Encajas claramente/.test(m)));
  });

  test('límite: con la familia claramente por encima (100 frente a 67) sí es confianza media', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, inFamily(c, 'verano') ? 3 : 2)), COLORS, SEASONS);
    assert.equal(a.top.family, 'verano');
    assert.equal(a.runnerUp.family, 'verano');
    assert.equal(a.confidence, 'media');
  });

  test('límite: dos familias gustan por igual: las hermanas empatadas no bastan, confianza baja', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, inFamily(c, 'otono') || inFamily(c, 'invierno') ? 3 : 0)), COLORS, SEASONS);
    assert.equal(a.top.family, a.runnerUp.family);
    assert.equal(a.confidence, 'baja');
    assert.ok(!a.messages.some((m) => /Encajas claramente/.test(m)));
  });

  test('límite: con menos de 4 colores valorados de la familia no se afirma que encaja en ella', () => {
    const three = ['rosa-palo', 'azul-cielo', 'lavanda']; // los tres son de Verano Claro y Verano Frío
    const others = COLORS.filter((c) => !inFamily(c, 'verano') && !inFamily(c, 'primavera')).slice(0, 9);
    const a = analyze([...three.map((id) => rate(id, 3)), ...others.map((c) => rate(c.id, 0))], COLORS, SEASONS);
    assert.equal(a.ratedCount, 12);
    assert.equal(a.top.family, 'verano');
    assert.equal(a.runnerUp.family, 'verano');
    assert.ok(a.top.score - a.runnerUp.score < 3);
    assert.equal(a.confidence, 'baja');
    assert.ok(!a.messages.some((m) => /Encajas claramente/.test(m)));
  });

  test('empate total (todo a 100) sigue siendo confianza baja aunque las dos primeras sean hermanas', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, 3)), COLORS, SEASONS);
    assert.equal(a.confidence, 'baja');
    assert.ok(a.messages.some((m) => /empate técnico/i.test(m)));
  });
});

describe('analyze: avoidCount', () => {
  test('es 0 sin valoraciones y sin colores por debajo de 40', () => {
    assert.equal(analyze([], COLORS, SEASONS).avoidCount, 0);
    assert.equal(analyze(COLORS.map((c) => rate(c.id, 2)), COLORS, SEASONS).avoidCount, 0);
  });
  test('cuenta todos los valorados por debajo de 40 aunque avoid se limite a 8', () => {
    const ratings = COLORS.map((c, i) => rate(c.id, i % 4));
    const a = analyze(ratings, COLORS, SEASONS);
    const real = ratings.filter((r) => computeScore(r).score < 40).length;
    assert.equal(real, 24);
    assert.equal(a.avoidCount, real);
    assert.equal(a.avoid.length, 8);
    assert.ok(Number.isInteger(a.avoidCount));
  });
  test('con 8 o menos coincide con la longitud de avoid, y no cuenta los "No sé" ni los 40 o más', () => {
    const a = analyze([rate('negro', 0), rate('crema', 1), rate('oxido', null), { colorId: 'camel', even: 2, eyes: 1, shadows: 1, harmony: 1 }], COLORS, SEASONS);
    assert.equal(a.avoidCount, 2);
    assert.deepEqual(a.avoid, ['negro', 'crema']);
  });
});

describe('analyze: recommended y avoid', () => {
  test('avoid: solo colores valorados con menos de 40, peor primero, máximo 8', () => {
    const ratings = COLORS.map((c, i) => rate(c.id, i % 4));
    const scores = scoreOf(ratings);
    const a = analyze(ratings, COLORS, SEASONS);
    assert.ok(a.avoid.length <= 8);
    assert.equal(new Set(a.avoid).size, a.avoid.length);
    let prev = -1;
    for (const id of a.avoid) {
      assert.ok(scores.get(id) < 40, `${id} está en avoid con ${scores.get(id)}`);
      assert.ok(scores.get(id) >= prev, 'avoid no va de peor a mejor');
      prev = scores.get(id);
    }
  });

  test('un color con 40 exactos o más no entra en avoid; con 33 sí', () => {
    const base = COLORS.slice(2, 14).map((c) => rate(c.id, 3));
    const a = analyze([
      { colorId: 'terracota', even: 1, eyes: 1, shadows: 1, harmony: 1 }, // 33
      { colorId: 'oxido', even: 2, eyes: 1, shadows: 1, harmony: 1 }, // 42
      ...base,
    ], COLORS, SEASONS);
    assert.ok(a.avoid.includes('terracota'));
    assert.ok(!a.avoid.includes('oxido'));
  });

  test('recommended: solo colores de la estación top, sin repetidos y ninguno en avoid', () => {
    const ratings = COLORS.map((c) => rate(c.id, c.seasons.includes('otono-calido') ? 3 : 1));
    const a = analyze(ratings, COLORS, SEASONS);
    assert.equal(a.top.id, 'otono-calido');
    assert.ok(a.recommended.length >= 4);
    assert.equal(new Set(a.recommended).size, a.recommended.length);
    for (const id of a.recommended) {
      assert.ok(COLORS.find((c) => c.id === id).seasons.includes('otono-calido'), `${id} no es de la estación top`);
      assert.ok(!a.avoid.includes(id));
    }
  });

  test('recommended: primero los valorados altos (mejor primero), luego los no probados', () => {
    const season = 'verano-frio';
    const members = inSeason(season);
    const ratings = [
      rate(members[0].id, 2), rate(members[1].id, 3), rate(members[2].id, 2), rate(members[3].id, 3),
      ...COLORS.filter((c) => !c.seasons.includes(season)).slice(0, 12).map((c) => rate(c.id, 0)),
    ];
    const a = analyze(ratings, COLORS, SEASONS);
    assert.equal(a.top.id, season);
    const scores = scoreOf(ratings);
    const ratedPart = a.recommended.filter((id) => scores.has(id));
    const firstUnrated = a.recommended.findIndex((id) => !scores.has(id));
    assert.deepEqual(a.recommended.slice(0, 2).sort(), [members[1].id, members[3].id].sort());
    assert.equal(firstUnrated, ratedPart.length, 'los no probados deben ir después de los valorados altos');
    assert.equal(a.recommended.length, members.length);
  });

  test('recommended nunca incluye un color que la persona valoró por debajo de 40 (aunque haya más de 8 malos)', () => {
    // Persona claramente de otoño que puntúa mal casi todo lo demás, incluidos dos colores compartidos con su estación.
    const top = 'otono-profundo';
    const ratings = COLORS.map((c) => {
      if (c.id === 'petroleo' || c.id === 'berenjena') return rate(c.id, 1); // 33 %, pertenecen a otono-profundo
      return rate(c.id, c.seasons.includes(top) ? 3 : 0);
    });
    const scores = scoreOf(ratings);
    const a = analyze(ratings, COLORS, SEASONS);
    assert.equal(a.top.id, top);
    const bad = a.recommended.filter((id) => scores.get(id) < 40);
    assert.deepEqual(bad, [], `recommended contiene colores valorados < 40: ${bad.map((id) => `${id}=${scores.get(id)}`).join(', ')}`);
  });

  test('todo a cero: no se recomienda ningún color que la persona puntuó con 0', () => {
    const a = analyze(COLORS.map((c) => rate(c.id, 0)), COLORS, SEASONS);
    assert.deepEqual(a.recommended, [], 'se recomiendan colores valorados con 0 %');
  });

  test('sin top no hay recommended, pero avoid sigue funcionando', () => {
    const a = analyze([rate('negro', 0), rate('crema', 3)], COLORS, SEASONS);
    assert.deepEqual(a.recommended, []);
    assert.deepEqual(a.avoid, ['negro']);
  });
});

describe('analyze: ejes y bloque auto', () => {
  test('los ejes son la media redondeada por grupo y null donde no hay datos', () => {
    const a = analyze([rate('negro', 3), rate('cobalto', 0), rate('crema', 2)], COLORS, SEASONS);
    assert.equal(a.axes.undertone.frio, 50);
    assert.equal(a.axes.undertone.calido, 67);
    assert.equal(a.axes.undertone.neutro, null);
    assert.equal(a.axes.depth.oscuro, 50);
    assert.equal(a.axes.depth.claro, 67);
    assert.equal(a.axes.depth.medio, null);
  });

  test('auto es null sin piel y no altera top, confidence ni recommended cuando existe', () => {
    const ratings = COLORS.map((c) => rate(c.id, c.seasons.includes('otono-calido') ? 3 : 0));
    const plain = analyze(ratings, COLORS, SEASONS);
    const noSkin = analyze(ratings, COLORS, SEASONS, { skin: null, hair: '#3B2A20', eyes: '#5B7FA6' });
    assert.equal(plain.auto, null);
    assert.equal(noSkin.auto, null);
    const withAuto = analyze(ratings, COLORS, SEASONS, { skin: '#F2D3CB', hair: '#C9BCA3', eyes: '#7A9CC0' });
    assert.notEqual(withAuto.auto, null);
    const strip = ({ auto, ...rest }) => rest;
    assert.deepEqual(strip(withAuto), strip(plain));
    assert.equal(withAuto.auto.agreesWithRatings, false, 'verano estimado frente a otoño valorado no coincide');
  });

  test('agreesWithRatings es null sin top y true cuando la familia coincide', () => {
    const features = { skin: '#F2D3CB', hair: '#C9BCA3', eyes: '#7A9CC0' };
    assert.equal(analyze([], COLORS, SEASONS, features).auto.agreesWithRatings, null);
    const ratings = COLORS.map((c) => rate(c.id, c.seasons.includes('verano-suave') ? 3 : 0));
    const a = analyze(ratings, COLORS, SEASONS, features);
    assert.equal(a.top.id, 'verano-suave');
    assert.equal(a.auto.agreesWithRatings, true);
  });
});
