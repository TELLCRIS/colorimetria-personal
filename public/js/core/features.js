// Estimación orientativa de la estación a partir de tres colores medios del rostro
// (piel, cabello, ojos) muestreados en el navegador. Lógica pura, sin dependencias.
// Es MENOS fiable que la prueba de drapeado: depende de la luz y del balance de blancos.
//
// FÓRMULA
// 1. Cada hex sRGB se pasa a CIELAB (D65): L* (luminosidad), a*, b*, C* = √(a*²+b*²),
//    h = atan2(b*, a*) en grados.
// 2. Tres ejes continuos en [-1, 1]:
//    · Calidez w. Piel: wp = clamp((h_piel − 57) / 15)  (h bajo = rosado/frío, h alto = dorado/cálido);
//      si C_piel < 6 (gris, sin tono fiable) wp = 0.
//      Cabello: wc = clamp((C_cabello − 18) / 20)  (ceniza/gris/negro = frío, dorado/cobrizo = cálido),
//      con peso p = 0,3 × clamp01((L_cabello − 10) / 30) (el cabello muy oscuro casi no informa).
//      w = (1 − p)·wp + p·wc.   Subtono: w > 0,25 cálido · w < −0,25 frío · resto neutro.
//    · Oscuridad d. Con cabello: V = (L_piel + L_cabello)/2, d = clamp((52 − V)/20).
//      Solo piel: d = clamp((61 − L_piel)/20).   Profundidad: d ≤ −0,5 claro · d ≥ 0,5 oscuro · resto medio.
//    · Contraste k (requiere al menos dos rasgos): R = max L* − min L* entre los rasgos presentes,
//      k = clamp((R − 47,5)/25).   Contraste: R < 35 bajo · R ≥ 60 alto · resto medio.
//    · Intensidad q: con ojos, q0 = 0,6·k + 0,4·clamp((C_ojos − 18)/14); sin ojos, q0 = k; solo piel, null.
//      q = clamp(q0 + 0,8·max(0, d)): un conjunto oscuro tiene poco rango de L* pero no por eso es "suave".
//      Intensidad: q > 0,33 brillante · q < −0,33 suave · resto medio.
// 3. Cada estación tiene un perfil ideal (w, d, q) y pesos que doblan su rasgo dominante
//    (tabla PROFILES). score = round(100 × (1 − Σ peso·|eje − ideal| / (2 × Σ peso))).
//    Si q es null, ese eje no participa.
// 4. Se devuelven las 3 estaciones con mayor score; desempate por el orden canónico de estaciones.
// 5. recommended: colores de la paleta de la primera estación, en orden de paleta, máximo 12.

const clamp = (x, lo = -1, hi = 1) => Math.min(hi, Math.max(lo, x));

const HEX = /^#[0-9a-fA-F]{6}$/;

/** "#RRGGBB" → { L, a, b, C, h } en CIELAB (D65). */
export function hexToLab(hex) {
  const lin = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const xyz = [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883,
  ];
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116));
  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { L, a, b: bb, C: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}

// Perfil ideal de cada estación: [calidez, oscuridad, intensidad] y pesos de cada eje.
const PROFILES = {
  'primavera-clara': { ideal: [0.5, -1, 0], weight: [1, 2, 1] },
  'primavera-calida': { ideal: [1, -0.3, 0.3], weight: [2, 1, 1] },
  'primavera-brillante': { ideal: [0.3, 0, 1], weight: [1, 1, 2] },
  'verano-claro': { ideal: [-0.5, -1, -0.3], weight: [1, 2, 1] },
  'verano-frio': { ideal: [-1, -0.2, -0.3], weight: [2, 1, 1] },
  'verano-suave': { ideal: [-0.3, 0, -1], weight: [1, 1, 2] },
  'otono-suave': { ideal: [0.3, 0, -1], weight: [1, 1, 2] },
  'otono-calido': { ideal: [1, 0.3, -0.2], weight: [2, 1, 1] },
  'otono-profundo': { ideal: [0.5, 1, 0.2], weight: [1, 2, 1] },
  'invierno-profundo': { ideal: [-0.5, 1, 0.4], weight: [1, 2, 1] },
  'invierno-frio': { ideal: [-1, 0.3, 0.5], weight: [2, 1, 1] },
  'invierno-brillante': { ideal: [-0.3, 0, 1], weight: [1, 1, 2] },
};

const LIGHT_WARNING =
  'Estimación orientativa: depende de la luz y del balance de blancos de la cámara, y es menos fiable que la prueba de colores junto al rostro.';

const valid = (hex) => (typeof hex === 'string' && HEX.test(hex) ? hex : null);

/**
 * @param {{skin:string|null, hair:string|null, eyes:string|null}|null} features
 * @param {Array<object>} colors paleta
 * @param {Array<object>} seasons catálogo de estaciones
 * @returns {object|null} bloque `auto` del análisis (agreesWithRatings queda en null) o null si falta la piel
 */
export function estimateFromFeatures(features, colors, seasons) {
  const skinHex = valid(features?.skin);
  if (!skinHex) return null;
  const hairHex = valid(features?.hair);
  const eyesHex = valid(features?.eyes);
  const skin = hexToLab(skinHex);
  const hair = hairHex ? hexToLab(hairHex) : null;
  const eyes = eyesHex ? hexToLab(eyesHex) : null;

  // Calidez
  const skinWarmth = skin.C < 6 ? 0 : clamp(((skin.h > 180 ? skin.h - 360 : skin.h) - 57) / 15);
  let warmth = skinWarmth;
  if (hair) {
    const p = 0.3 * clamp((hair.L - 10) / 30, 0, 1);
    warmth = (1 - p) * skinWarmth + p * clamp((hair.C - 18) / 20);
  }
  const undertone = warmth > 0.25 ? 'calido' : warmth < -0.25 ? 'frio' : 'neutro';

  // Oscuridad
  const darkness = hair ? clamp((52 - (skin.L + hair.L) / 2) / 20) : clamp((61 - skin.L) / 20);
  const depth = darkness <= -0.5 ? 'claro' : darkness >= 0.5 ? 'oscuro' : 'medio';

  // Contraste e intensidad
  const lights = [skin, hair, eyes].filter(Boolean).map((lab) => lab.L);
  let contrast = null;
  let intensity = null;
  if (lights.length >= 2) {
    const range = Math.max(...lights) - Math.min(...lights);
    contrast = range < 35 ? 'bajo' : range >= 60 ? 'alto' : 'medio';
    const k = clamp((range - 47.5) / 25);
    const base = eyes ? 0.6 * k + 0.4 * clamp((eyes.C - 18) / 14) : k;
    intensity = clamp(base + 0.8 * Math.max(0, darkness));
  }
  const chroma = intensity === null ? null : intensity > 0.33 ? 'brillante' : intensity < -0.33 ? 'suave' : 'medio';

  // Puntuación de las 12 estaciones
  const axes = [warmth, darkness, intensity];
  const scored = seasons
    .map((season, order) => {
      const profile = PROFILES[season.id];
      if (!profile) return null;
      let distance = 0;
      let total = 0;
      axes.forEach((value, i) => {
        if (value === null) return;
        distance += profile.weight[i] * Math.abs(value - profile.ideal[i]);
        total += profile.weight[i];
      });
      const score = Math.round(100 * (1 - distance / (2 * total)));
      return { id: season.id, name: season.name, family: season.family, score, order };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const best = scored.slice(0, 3).map(({ order, ...row }) => row);

  const recommended = best[0]
    ? colors.filter((color) => color.seasons.includes(best[0].id)).slice(0, 12).map((color) => color.id)
    : [];

  const messages = [LIGHT_WARNING];
  if (skin.C < 6 || skin.h < 20 || skin.h > 100) {
    messages.push('El color de piel muestreado no parece un tono de piel; repite la muestra con luz natural y sin filtros.');
  }
  if (!hair && !eyes) {
    messages.push('Solo hay muestra de piel: añade cabello y ojos para estimar el contraste y la intensidad.');
  } else if (!hair) {
    messages.push('Falta la muestra de cabello: la profundidad se ha estimado solo con la piel.');
  } else if (!eyes) {
    messages.push('Falta la muestra de ojos: la intensidad se ha estimado solo con el contraste entre piel y cabello.');
  }
  if (best.length >= 2 && best[0].score - best[1].score <= 2) {
    messages.push(`${best[0].name} y ${best[1].name} quedan muy igualadas; compáralas con la prueba de colores.`);
  }

  return { undertone, depth, contrast, chroma, seasons: best, recommended, agreesWithRatings: null, messages };
}
