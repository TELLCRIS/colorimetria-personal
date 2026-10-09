// Coherencia de la paleta y del catálogo de estaciones.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, SEASONS, getColor, colorOrder } from '../../public/js/core/colors.js';

const EXPECTED_SEASONS = [
  'primavera-clara', 'primavera-calida', 'primavera-brillante',
  'verano-claro', 'verano-frio', 'verano-suave',
  'otono-suave', 'otono-calido', 'otono-profundo',
  'invierno-profundo', 'invierno-frio', 'invierno-brillante',
];

describe('catálogo de estaciones', () => {
  test('son exactamente las 12 estaciones del contrato, sin repetidos', () => {
    assert.deepEqual(SEASONS.map((s) => s.id).sort(), [...EXPECTED_SEASONS].sort());
  });
  test('cada estación tiene nombre, descripción y una familia coherente con su id', () => {
    for (const s of SEASONS) {
      assert.ok(typeof s.name === 'string' && s.name.trim().length > 0);
      assert.ok(typeof s.description === 'string' && s.description.trim().length > 0);
      assert.ok(['primavera', 'verano', 'otono', 'invierno'].includes(s.family));
      assert.ok(s.id.startsWith(`${s.family}-`), `${s.id} no empieza por su familia ${s.family}`);
    }
    assert.equal(new Set(SEASONS.map((s) => s.name)).size, 12);
  });
});

describe('guía de estilo de las estaciones (campo opcional añadido al catálogo)', () => {
  const walk = (value, path, visit) => {
    visit(value, path);
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, visit);
  };
  test('si una estación trae guía, no tiene textos vacíos ni hex inválidos y todas las estaciones la traen', () => {
    const withGuide = SEASONS.filter((s) => s.guide !== undefined);
    if (withGuide.length === 0) return;
    assert.equal(withGuide.length, SEASONS.length, 'solo algunas estaciones tienen guía');
    for (const s of SEASONS) {
      assert.ok(s.guide && typeof s.guide === 'object', `${s.id} sin guía`);
      walk(s.guide, s.id, (value, path) => {
        assert.notEqual(value, undefined, `${path} es undefined`);
        assert.notEqual(value, null, `${path} es null`);
        if (typeof value === 'string') assert.ok(value.trim().length > 0, `${path} está vacío`);
        if (Array.isArray(value)) assert.ok(value.length > 0, `${path} es una lista vacía`);
        if (value && typeof value === 'object' && 'hex' in value) {
          assert.match(value.hex, /^#[0-9A-Fa-f]{6}$/, `${path}.hex inválido: ${value.hex}`);
          assert.ok(typeof value.name === 'string' && value.name.trim().length > 0, `${path} sin nombre`);
        }
      });
    }
  });
  test('todas las guías tienen la misma estructura de claves', () => {
    const shapes = SEASONS.filter((s) => s.guide).map((s) => {
      const keys = [];
      walk(s.guide, '', (value, path) => { if (value && typeof value === 'object' && !Array.isArray(value) && !('hex' in value)) keys.push(`${path.replace(/[d+]/g, '[]')}:${Object.keys(value).sort().join(',')}`); });
      return [...new Set(keys)].sort().join('|');
    });
    assert.ok(new Set(shapes).size <= 1, 'las guías de estilo no tienen todas la misma forma');
  });
});

describe('paleta', () => {
  test('tiene 48 colores', () => {
    assert.equal(COLORS.length, 48);
  });
  test('ids únicos, en kebab-case, y nombres únicos', () => {
    assert.equal(new Set(COLORS.map((c) => c.id)).size, COLORS.length);
    assert.equal(new Set(COLORS.map((c) => c.name)).size, COLORS.length);
    for (const c of COLORS) assert.match(c.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
  test('hex válidos (#RRGGBB) y sin dos colores con el mismo hex', () => {
    for (const c of COLORS) assert.match(c.hex, /^#[0-9A-Fa-f]{6}$/, `${c.id}: ${c.hex}`);
    assert.equal(new Set(COLORS.map((c) => c.hex.toUpperCase())).size, COLORS.length);
  });
  test('subtono, profundidad e intensidad están dentro de los valores del contrato', () => {
    for (const c of COLORS) {
      assert.ok(['calido', 'frio', 'neutro'].includes(c.undertone), `${c.id}: ${c.undertone}`);
      assert.ok(['claro', 'medio', 'oscuro'].includes(c.depth), `${c.id}: ${c.depth}`);
      assert.ok(['suave', 'medio', 'brillante'].includes(c.chroma), `${c.id}: ${c.chroma}`);
    }
  });
  test('todo color pertenece al menos a una estación, todas existentes y sin repetir', () => {
    const ids = new Set(SEASONS.map((s) => s.id));
    for (const c of COLORS) {
      assert.ok(Array.isArray(c.seasons) && c.seasons.length >= 1, `${c.id} sin estaciones`);
      assert.equal(new Set(c.seasons).size, c.seasons.length, `${c.id} repite estación`);
      for (const s of c.seasons) assert.ok(ids.has(s), `${c.id} referencia la estación inexistente ${s}`);
    }
  });
  test('cada estación tiene al menos 4 colores', () => {
    for (const s of SEASONS) {
      const n = COLORS.filter((c) => c.seasons.includes(s.id)).length;
      assert.ok(n >= 4, `${s.id} solo tiene ${n} colores`);
    }
  });
  test('cada subtono, profundidad e intensidad tiene colores con los que comparar', () => {
    for (const [key, values] of [['undertone', ['calido', 'frio', 'neutro']], ['depth', ['claro', 'medio', 'oscuro']], ['chroma', ['suave', 'medio', 'brillante']]]) {
      for (const v of values) assert.ok(COLORS.filter((c) => c[key] === v).length >= 3, `${key}=${v}`);
    }
  });
  test('la profundidad declarada es coherente con la luminosidad real del hex', () => {
    const luma = (hex) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    for (const c of COLORS) {
      if (c.depth === 'claro') assert.ok(luma(c.hex) > 0.5, `${c.id} es "claro" con luminancia ${luma(c.hex).toFixed(2)}`);
      if (c.depth === 'oscuro') assert.ok(luma(c.hex) < 0.5, `${c.id} es "oscuro" con luminancia ${luma(c.hex).toFixed(2)}`);
    }
  });
  test('la paleta es inmutable y getColor/colorOrder responden de forma coherente', () => {
    assert.ok(Object.isFrozen(COLORS));
    assert.ok(COLORS.every((c) => Object.isFrozen(c) && Object.isFrozen(c.seasons)));
    assert.equal(getColor('negro').hex, '#171719');
    assert.equal(getColor('no-existe'), null);
    assert.equal(getColor('__proto__'), null);
    assert.equal(getColor('constructor'), null);
    assert.equal(colorOrder(COLORS[0].id), 0);
    assert.equal(colorOrder('no-existe'), Infinity);
  });
});
