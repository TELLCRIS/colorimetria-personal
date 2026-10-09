// Unitarias de la estimación automática a partir de piel, cabello y ojos.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estimateFromFeatures, hexToLab } from '../../public/js/core/features.js';
import { COLORS, SEASONS } from '../../public/js/core/colors.js';

const estimate = (skin, hair = null, eyes = null) => estimateFromFeatures({ skin, hair, eyes }, COLORS, SEASONS);
const SEASON_IDS = new Set(SEASONS.map((s) => s.id));
const DARK_OR_AUTUMN = /^otono-|^invierno-profundo$/;
const LIGHT = ['primavera-clara', 'verano-claro'];

function assertWellFormed(auto) {
  assert.ok(['calido', 'frio', 'neutro'].includes(auto.undertone));
  assert.ok(['claro', 'medio', 'oscuro'].includes(auto.depth));
  assert.ok([null, 'bajo', 'medio', 'alto'].includes(auto.contrast));
  assert.ok([null, 'suave', 'medio', 'brillante'].includes(auto.chroma));
  assert.equal(auto.seasons.length, 3);
  assert.equal(new Set(auto.seasons.map((s) => s.id)).size, 3);
  let prev = Infinity;
  for (const s of auto.seasons) {
    assert.ok(SEASON_IDS.has(s.id));
    assert.equal(s.name, SEASONS.find((x) => x.id === s.id).name);
    assert.equal(s.family, SEASONS.find((x) => x.id === s.id).family);
    assert.ok(Number.isInteger(s.score) && s.score >= 0 && s.score <= 100, `score fuera de rango: ${s.score}`);
    assert.ok(s.score <= prev);
    prev = s.score;
  }
  assert.ok(auto.recommended.length >= 1 && auto.recommended.length <= 12);
  assert.equal(new Set(auto.recommended).size, auto.recommended.length);
  for (const id of auto.recommended) {
    const color = COLORS.find((c) => c.id === id);
    assert.ok(color, `color recomendado desconocido: ${id}`);
    assert.ok(color.seasons.includes(auto.seasons[0].id), `${id} no es de la primera estación estimada`);
  }
  assert.equal(auto.agreesWithRatings, null);
  assert.ok(Array.isArray(auto.messages) && auto.messages.length >= 1 && auto.messages.every((m) => typeof m === 'string' && m.length > 0));
}

describe('hexToLab', () => {
  test('blanco, negro y gris medio dan los L* de referencia y croma ~0', () => {
    const white = hexToLab('#FFFFFF');
    const black = hexToLab('#000000');
    const grey = hexToLab('#777777');
    assert.ok(Math.abs(white.L - 100) < 0.01 && white.C < 0.05);
    assert.ok(Math.abs(black.L) < 0.01 && black.C < 0.05);
    assert.ok(Math.abs(grey.L - 50.03) < 0.1 && grey.C < 0.05);
  });
  test('rojo puro coincide con el valor CIELAB conocido (53.24, 80.09, 67.20)', () => {
    const red = hexToLab('#FF0000');
    assert.ok(Math.abs(red.L - 53.24) < 0.05);
    assert.ok(Math.abs(red.a - 80.09) < 0.1);
    assert.ok(Math.abs(red.b - 67.2) < 0.1);
    assert.ok(red.h >= 0 && red.h < 360);
  });
  test('acepta minúsculas y da lo mismo que en mayúsculas', () => {
    assert.deepEqual(hexToLab('#e8c4a8'), hexToLab('#E8C4A8'));
  });
});

describe('estimateFromFeatures: sensatez', () => {
  const lightCool = [
    ['#F2D3CB', '#C9BCA3', '#7A9CC0'],
    ['#F5D0C8', '#BFB39C', '#6E94B8'],
    ['#FBE3DC', '#D8CDB8', '#8FB2D6'],
    ['#F3DCD4', '#E2D9C6', '#9AA7B5'],
    ['#EFCFC9', '#B9AD98', '#88A4C4'],
  ];
  for (const [skin, hair, eyes] of lightCool) {
    test(`piel clara rosada ${skin} + rubio ceniza ${hair} + ojos azules ${eyes}: no da otoño ni invierno profundo`, () => {
      const auto = estimate(skin, hair, eyes);
      assertWellFormed(auto);
      assert.doesNotMatch(auto.seasons[0].id, DARK_OR_AUTUMN);
      assert.notEqual(auto.depth, 'oscuro');
      assert.notEqual(auto.undertone, 'calido');
    });
  }

  const dark = [
    ['#5C3A21', '#0F0D0C', '#2B1A10'],
    ['#4A2E1F', '#141211', '#1E130C'],
    ['#3B2416', '#050505', '#120B07'],
    ['#6B4630', '#1A1512', '#33211A'],
    ['#5C3A21', '#0F0D0C', null],
  ];
  for (const [skin, hair, eyes] of dark) {
    test(`piel oscura ${skin} + cabello negro ${hair}: no da una estación clara`, () => {
      const auto = estimate(skin, hair, eyes);
      assertWellFormed(auto);
      assert.ok(!LIGHT.includes(auto.seasons[0].id), `dio ${auto.seasons[0].id}`);
      assert.ok(!auto.seasons.some((s) => LIGHT.includes(s.id)), 'una estación clara aparece entre las 3 primeras');
      assert.equal(auto.depth, 'oscuro');
    });
  }

  test('piel dorada + pelirrojo + ojos verdes: subtono cálido y estación de primavera u otoño', () => {
    const auto = estimate('#E8BE98', '#A8501F', '#5E7F4A');
    assert.equal(auto.undertone, 'calido');
    assert.match(auto.seasons[0].family, /^(primavera|otono)$/);
  });

  test('piel clara + cabello negro + ojos azules: contraste alto y nunca una estación suave', () => {
    const auto = estimate('#F0D9D0', '#15120F', '#3C6FB0');
    assert.equal(auto.contrast, 'alto');
    assert.doesNotMatch(auto.seasons[0].id, /suave/);
  });
});

describe('estimateFromFeatures: entradas parciales y extremas', () => {
  test('sin piel (null, vacío, objeto nulo o hex inválido) devuelve null', () => {
    assert.equal(estimateFromFeatures(null, COLORS, SEASONS), null);
    assert.equal(estimateFromFeatures(undefined, COLORS, SEASONS), null);
    assert.equal(estimateFromFeatures({}, COLORS, SEASONS), null);
    assert.equal(estimate(null, '#3B2A20', '#5B7FA6'), null);
    assert.equal(estimate('', '#3B2A20', '#5B7FA6'), null);
    assert.equal(estimate('E8C4A8'), null);
    assert.equal(estimate('#E8C4A'), null);
    assert.equal(estimate('#GGGGGG'), null);
    assert.equal(estimate(123456), null);
  });

  test('solo piel: hay estimación, sin contraste ni intensidad, y se pide completar', () => {
    const auto = estimate('#F2D3CB');
    assertWellFormed(auto);
    assert.equal(auto.contrast, null);
    assert.equal(auto.chroma, null);
    assert.ok(auto.messages.some((m) => /cabello y ojos/i.test(m)));
  });

  test('solo piel oscura: no da una estación clara', () => {
    const auto = estimate('#5C3A21');
    assertWellFormed(auto);
    assert.ok(!LIGHT.includes(auto.seasons[0].id));
  });

  test('cabello u ojos inválidos se tratan como ausentes, no rompen', () => {
    const auto = estimate('#E8C4A8', 'no-es-hex', '#12');
    assertWellFormed(auto);
    assert.deepEqual(auto, estimate('#E8C4A8', null, null));
  });

  test('piel + cabello sin ojos y piel + ojos sin cabello dan resultados bien formados con aviso', () => {
    const noEyes = estimate('#E8C4A8', '#3B2A20', null);
    assertWellFormed(noEyes);
    assert.notEqual(noEyes.contrast, null);
    assert.ok(noEyes.messages.some((m) => /ojos/i.test(m)));
    const noHair = estimate('#E8C4A8', null, '#5B7FA6');
    assertWellFormed(noHair);
    assert.ok(noHair.messages.some((m) => /cabello/i.test(m)));
  });

  const extremes = [
    ['blanco puro en los tres', ['#FFFFFF', '#FFFFFF', '#FFFFFF']],
    ['negro puro en los tres', ['#000000', '#000000', '#000000']],
    ['piel blanca y cabello/ojos negros', ['#FFFFFF', '#000000', '#000000']],
    ['piel negra y cabello blanco', ['#000000', '#FFFFFF', null]],
    ['primarios saturados', ['#0000FF', '#00FF00', '#FF0000']],
    ['solo piel blanca', ['#FFFFFF', null, null]],
    ['solo piel negra', ['#000000', null, null]],
    ['magenta', ['#FF00FF', '#FF00FF', '#FF00FF']],
  ];
  for (const [label, [skin, hair, eyes]] of extremes) {
    test(`entrada extrema (${label}): no lanza, sin NaN y con puntuaciones 0..100`, () => {
      const auto = estimate(skin, hair, eyes);
      assertWellFormed(auto);
      assert.ok(!JSON.stringify(auto).includes('null,"score"'));
      assert.doesNotMatch(JSON.stringify(auto), /NaN|Infinity/);
    });
  }

  test('blanco o negro puros como piel avisan de que no parece un tono de piel', () => {
    for (const skin of ['#FFFFFF', '#000000', '#0000FF', '#00FF00']) {
      const auto = estimate(skin, '#3B2A20', '#5B7FA6');
      assert.ok(auto.messages.some((m) => /no parece un tono de piel/i.test(m)), `sin aviso para ${skin}`);
    }
  });

  test('piel negra pura no se clasifica como clara ni piel blanca pura como oscura', () => {
    assert.equal(estimate('#000000').depth, 'oscuro');
    assert.equal(estimate('#FFFFFF').depth, 'claro');
  });
});

describe('estimateFromFeatures: determinismo', () => {
  test('la misma entrada da exactamente la misma salida y no se muta la entrada', () => {
    const features = { skin: '#E8C4A8', hair: '#3B2A20', eyes: '#5B7FA6' };
    const frozen = Object.freeze({ ...features });
    const first = estimateFromFeatures(frozen, COLORS, SEASONS);
    const second = estimateFromFeatures(features, COLORS, SEASONS);
    assert.deepEqual(first, second);
    first.messages.push('mutado');
    assert.notDeepEqual(estimateFromFeatures(features, COLORS, SEASONS).messages, first.messages, 'las llamadas comparten el array de mensajes');
  });

  test('mayúsculas y minúsculas dan el mismo resultado', () => {
    assert.deepEqual(estimate('#e8c4a8', '#3b2a20', '#5b7fa6'), estimate('#E8C4A8', '#3B2A20', '#5B7FA6'));
  });

  test('un cambio mínimo de un nivel en la piel no cambia la familia estimada (sin saltos bruscos)', () => {
    const a = estimate('#F2D3CB', '#C9BCA3', '#7A9CC0');
    const b = estimate('#F2D3CC', '#C9BCA3', '#7A9CC0');
    assert.equal(a.seasons[0].family, b.seasons[0].family);
  });
});
