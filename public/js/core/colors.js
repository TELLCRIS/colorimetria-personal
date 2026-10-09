// Paleta de prueba y catálogo de las 12 estaciones de la colorimetría estacional.
// Los 18 primeros colores son los del prototipo original (mismo nombre y hex).
// Un color puede pertenecer a varias estaciones vecinas.

import { GUIDES } from './guides.js';

export const FAMILIES = ['primavera', 'verano', 'otono', 'invierno'];

export const FAMILY_NAMES = {
  primavera: 'Primavera',
  verano: 'Verano',
  otono: 'Otoño',
  invierno: 'Invierno',
};

export const UNDERTONES = ['calido', 'frio', 'neutro'];
export const DEPTHS = ['claro', 'medio', 'oscuro'];
export const CHROMAS = ['suave', 'medio', 'brillante'];

const SEASON_LIST = [
  {
    id: 'primavera-clara',
    name: 'Primavera Clara',
    family: 'primavera',
    description: 'Colores claros, cálidos y frescos: melocotón, coral suave, aguamarina. Poca profundidad y calidez delicada.',
  },
  {
    id: 'primavera-calida',
    name: 'Primavera Cálida',
    family: 'primavera',
    description: 'Colores dorados, luminosos y alegres: coral, mandarina, verde hierba. La calidez es el rasgo dominante.',
  },
  {
    id: 'primavera-brillante',
    name: 'Primavera Brillante',
    family: 'primavera',
    description: 'Colores muy saturados y nítidos con un punto cálido: rojo amapola, turquesa, verde vivo. Alto contraste.',
  },
  {
    id: 'verano-claro',
    name: 'Verano Claro',
    family: 'verano',
    description: 'Colores claros, frescos y delicados: rosa palo, azul cielo, lavanda. Poca profundidad y subtono frío suave.',
  },
  {
    id: 'verano-frio',
    name: 'Verano Frío',
    family: 'verano',
    description: 'Colores azulados de intensidad media: frambuesa, azul pizarra, malva. El subtono frío es el rasgo dominante.',
  },
  {
    id: 'verano-suave',
    name: 'Verano Suave',
    family: 'verano',
    description: 'Colores apagados y grisáceos de subtono fresco: rosa viejo, topo, gris perla. Bajo contraste.',
  },
  {
    id: 'otono-suave',
    name: 'Otoño Suave',
    family: 'otono',
    description: 'Colores apagados y terrosos de subtono cálido: salvia, camel, oliva. Bajo contraste y calidez discreta.',
  },
  {
    id: 'otono-calido',
    name: 'Otoño Cálido',
    family: 'otono',
    description: 'Colores dorados, especiados y ricos: terracota, mostaza, calabaza. La calidez es el rasgo dominante.',
  },
  {
    id: 'otono-profundo',
    name: 'Otoño Profundo',
    family: 'otono',
    description: 'Colores oscuros y cálidos: chocolate, verde bosque, borgoña. La profundidad es el rasgo dominante.',
  },
  {
    id: 'invierno-profundo',
    name: 'Invierno Profundo',
    family: 'invierno',
    description: 'Colores oscuros y fríos: negro, ciruela, azul marino, granate. La profundidad es el rasgo dominante.',
  },
  {
    id: 'invierno-frio',
    name: 'Invierno Frío',
    family: 'invierno',
    description: 'Colores helados y azulados de alto contraste: cobalto, fucsia, blanco óptico. El subtono frío es el rasgo dominante.',
  },
  {
    id: 'invierno-brillante',
    name: 'Invierno Brillante',
    family: 'invierno',
    description: 'Colores puros y muy saturados de subtono frío: rojo cereza, violeta vivo, amarillo limón. Máximo contraste.',
  },
];

// Cada estación lleva su guía de estilo (ver guides.js).
export const SEASONS = Object.freeze(SEASON_LIST.map((season) => Object.freeze({ ...season, guide: GUIDES[season.id] })));

const c = (id, name, hex, undertone, depth, chroma, seasons) =>
  Object.freeze({ id, name, hex, undertone, depth, chroma, seasons: Object.freeze(seasons) });

export const COLORS = Object.freeze([
  // --- Los 18 del prototipo ---
  c('terracota', 'Terracota', '#A64F32', 'calido', 'medio', 'medio', ['otono-calido', 'otono-profundo']),
  c('oxido', 'Óxido', '#9A3F25', 'calido', 'oscuro', 'medio', ['otono-calido', 'otono-profundo']),
  c('mostaza', 'Mostaza', '#C49A28', 'calido', 'medio', 'medio', ['otono-calido', 'otono-suave']),
  c('camel', 'Camel', '#B88755', 'calido', 'medio', 'suave', ['otono-suave', 'otono-calido']),
  c('chocolate', 'Chocolate', '#4A2C23', 'calido', 'oscuro', 'medio', ['otono-profundo', 'otono-calido']),
  c('oliva', 'Oliva', '#626B32', 'calido', 'oscuro', 'suave', ['otono-suave', 'otono-calido', 'otono-profundo']),
  c('verde-bosque', 'Verde bosque', '#234B38', 'neutro', 'oscuro', 'medio', ['otono-profundo', 'invierno-profundo']),
  c('petroleo', 'Petróleo', '#17636A', 'neutro', 'oscuro', 'medio', ['otono-profundo', 'invierno-profundo']),
  c('borgona-calido', 'Borgoña cálido', '#71333B', 'calido', 'oscuro', 'medio', ['otono-profundo']),
  c('salvia', 'Salvia', '#9BA58A', 'neutro', 'medio', 'suave', ['otono-suave', 'verano-suave']),
  c('fucsia-frio', 'Fucsia frío', '#C21870', 'frio', 'medio', 'brillante', ['invierno-brillante', 'invierno-frio']),
  c('cobalto', 'Cobalto', '#2449A8', 'frio', 'oscuro', 'brillante', ['invierno-frio', 'invierno-brillante']),
  c('esmeralda-frio', 'Esmeralda frío', '#08785B', 'frio', 'oscuro', 'brillante', ['invierno-frio', 'invierno-profundo']),
  c('ciruela', 'Ciruela', '#63345D', 'frio', 'oscuro', 'medio', ['invierno-profundo']),
  c('negro', 'Negro', '#171719', 'frio', 'oscuro', 'medio', ['invierno-profundo', 'invierno-frio', 'invierno-brillante']),
  c('blanco-optico', 'Blanco óptico', '#F8F8F5', 'frio', 'claro', 'brillante', ['invierno-frio', 'invierno-brillante']),
  c('crema', 'Crema', '#F0E1C5', 'calido', 'claro', 'suave', ['primavera-clara', 'otono-suave']),
  c('gris-frio', 'Gris frío', '#85888E', 'frio', 'medio', 'suave', ['verano-frio', 'verano-suave']),

  // --- Primavera ---
  c('melocoton', 'Melocotón', '#FFCBA4', 'calido', 'claro', 'medio', ['primavera-clara', 'primavera-calida']),
  c('coral-claro', 'Coral claro', '#F7A08C', 'calido', 'claro', 'medio', ['primavera-clara']),
  c('verde-pistacho', 'Verde pistacho', '#B2D88A', 'calido', 'claro', 'medio', ['primavera-clara']),
  c('aguamarina-claro', 'Aguamarina claro', '#8FD9CB', 'neutro', 'claro', 'medio', ['primavera-clara', 'verano-claro']),
  c('amarillo-mantequilla', 'Amarillo mantequilla', '#FBE69A', 'calido', 'claro', 'suave', ['primavera-clara']),
  c('azul-bigaro', 'Azul bígaro', '#8FA6E8', 'neutro', 'claro', 'medio', ['primavera-clara', 'verano-claro']),
  c('coral-vivo', 'Coral vivo', '#FF6F52', 'calido', 'medio', 'brillante', ['primavera-calida', 'primavera-brillante']),
  c('mandarina', 'Mandarina', '#F28A1E', 'calido', 'medio', 'brillante', ['primavera-calida']),
  c('verde-hierba', 'Verde hierba', '#6FB53A', 'calido', 'medio', 'brillante', ['primavera-calida', 'primavera-brillante']),
  c('turquesa', 'Turquesa', '#1FB5A8', 'neutro', 'medio', 'brillante', ['primavera-calida', 'primavera-brillante']),
  c('rojo-amapola', 'Rojo amapola', '#E8322A', 'calido', 'medio', 'brillante', ['primavera-brillante', 'primavera-calida']),
  c('rosa-intenso', 'Rosa intenso', '#F2447E', 'neutro', 'medio', 'brillante', ['primavera-brillante', 'invierno-brillante']),
  c('violeta-vivo', 'Violeta vivo', '#6A3FC4', 'neutro', 'medio', 'brillante', ['primavera-brillante', 'invierno-brillante']),
  c('verde-trebol', 'Verde trébol', '#12A150', 'neutro', 'medio', 'brillante', ['primavera-brillante', 'invierno-brillante']),

  // --- Verano ---
  c('rosa-palo', 'Rosa palo', '#F2C4CF', 'frio', 'claro', 'suave', ['verano-claro', 'verano-frio']),
  c('azul-cielo', 'Azul cielo', '#A9CCEA', 'frio', 'claro', 'suave', ['verano-claro', 'verano-frio']),
  c('lavanda', 'Lavanda', '#BFB2E3', 'frio', 'claro', 'suave', ['verano-claro', 'verano-frio']),
  c('gris-perla', 'Gris perla', '#D5D7DC', 'frio', 'claro', 'suave', ['verano-claro', 'verano-suave']),
  c('azul-pizarra', 'Azul pizarra', '#4F6D9C', 'frio', 'medio', 'suave', ['verano-frio', 'verano-suave']),
  c('frambuesa', 'Frambuesa', '#B33A68', 'frio', 'medio', 'medio', ['verano-frio', 'invierno-frio']),
  c('malva-empolvado', 'Malva empolvado', '#A88A9E', 'frio', 'medio', 'suave', ['verano-suave', 'verano-frio']),
  c('rosa-viejo', 'Rosa viejo', '#C08A8E', 'neutro', 'medio', 'suave', ['verano-suave', 'otono-suave']),
  c('topo', 'Topo', '#8C7B70', 'neutro', 'medio', 'suave', ['verano-suave', 'otono-suave']),

  // --- Otoño ---
  c('calabaza', 'Calabaza', '#D2691E', 'calido', 'medio', 'medio', ['otono-calido', 'primavera-calida']),
  c('berenjena', 'Berenjena', '#4B2A45', 'neutro', 'oscuro', 'medio', ['otono-profundo', 'invierno-profundo']),

  // --- Invierno ---
  c('azul-marino', 'Azul marino', '#1F2A52', 'frio', 'oscuro', 'medio', ['invierno-profundo', 'verano-frio']),
  c('granate', 'Granate', '#7B1630', 'frio', 'oscuro', 'medio', ['invierno-profundo', 'invierno-frio']),
  c('rojo-cereza', 'Rojo cereza', '#C1122F', 'frio', 'medio', 'brillante', ['invierno-frio', 'invierno-brillante']),
  c('rosa-hielo', 'Rosa hielo', '#F4DDE8', 'frio', 'claro', 'medio', ['invierno-frio']),
  c('amarillo-limon', 'Amarillo limón', '#F4E62A', 'frio', 'claro', 'brillante', ['invierno-brillante', 'primavera-brillante']),
]);

const COLOR_INDEX = new Map(COLORS.map((color, index) => [color.id, { color, index }]));

export function getColor(id) {
  return COLOR_INDEX.get(id)?.color ?? null;
}

/** Posición del color en la paleta (orden estable de presentación); Infinity si no existe. */
export function colorOrder(id) {
  return COLOR_INDEX.get(id)?.index ?? Number.POSITIVE_INFINITY;
}
