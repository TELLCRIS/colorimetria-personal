// Ficha de análisis de color personal: una lámina A4 vertical compuesta en un canvas
// (200 ppp) con la foto, la estación, los ejes, las paletas y la guía de la estación.
// Solo usa datos del análisis y del catálogo: lo que falta se marca «sin datos».
import { safeHex, textColorFor, formatDate, UNDERTONE, DEPTH, CHROMA, CONTRAST, CONFIDENCE } from './dom.js';
import { state } from './store.js';
import { photo } from './photo.js';
import { drawCover } from './drape.js';

// A4 a 200 ppp. 8 pt ≈ 22 px: ningún texto baja de ahí.
export const FICHA_W = 1654;
export const FICHA_H = 2339;
const M = 64;
const GAP = 24;
const SMALL = 22;
const BODY = 24;
// Misma identidad que la interfaz: papel neutro cálido, tinta y títulos en serif del sistema.
const C = {
  bg: '#F3EFE8', card: '#FFFDFA', line: '#DDD3C7', ink: '#221E1B', muted: '#665D55',
  accent: '#2A2420', earth: '#855538', soft: '#ECE5DB', track: '#E3DACF', stage: '#CFC7BD',
  noticeBg: '#FBF0D9', noticeLine: '#E5CF9C',
};
const SEASON_HUES = ['#F2A65A', '#8FA8C8', '#A64F32', '#1F3A6E']; // primavera, verano, otoño, invierno
const AUTHOR = 'by TelloCris';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, "Times New Roman", serif';
const font = (size, weight = 400, serif = false) => `${weight} ${size}px ${serif ? SERIF : SANS}`;

/**
 * Qué estación usa la ficha y de dónde sale.
 * @returns {{ ok: boolean, source: 'ratings'|'auto'|null, season: object|null, hasPhoto: boolean }}
 */
export function fichaBasis() {
  const analysis = state.analysis;
  const hasPhoto = Boolean(photo.canvas);
  if (analysis?.enough && analysis.top) return { ok: true, source: 'ratings', season: analysis.top, hasPhoto };
  const estimated = analysis?.auto?.seasons?.[0];
  if (estimated) return { ok: true, source: 'auto', season: estimated, hasPhoto };
  return { ok: false, source: null, season: null, hasPhoto };
}

export function buildFicha() {
  const basis = fichaBasis();
  const { session, analysis } = state;
  if (!basis.ok || !session) return null;
  const season = basis.season;
  const guide = state.seasonById.get(season.id)?.guide ?? null;
  const auto = analysis.auto ?? null;
  const fromRatings = basis.source === 'ratings';

  const canvas = document.createElement('canvas');
  canvas.width = FICHA_W;
  canvas.height = FICHA_H;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  // --- utilidades de dibujo ---
  const box = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const text = (value, x, y, { size = BODY, weight = 400, color = C.ink, align = 'left', serif = false } = {}) => {
    ctx.font = font(size, weight, serif);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(value, x, y);
    ctx.textAlign = 'left';
  };
  const width = (value, size, weight = 400, serif = false) => { ctx.font = font(size, weight, serif); return ctx.measureText(value).width; };
  const fit = (value, maxW, size, weight = 400) => {
    if (width(value, size, weight) <= maxW) return value;
    let cut = String(value);
    while (cut.length > 1 && width(`${cut}…`, size, weight) > maxW) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };
  const wrap = (value, maxW, size, weight = 400, maxLines = 99) => {
    const lines = [];
    let line = '';
    for (const word of String(value ?? '').split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && width(candidate, size, weight) > maxW) { lines.push(line); line = word; } else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const kept = lines.slice(0, maxLines);
      kept[maxLines - 1] = fit(`${kept[maxLines - 1]} ${lines[maxLines]}`, maxW, size, weight);
      return kept;
    }
    return lines.map((l) => fit(l, maxW, size, weight));
  };
  /** Párrafo; devuelve la y de la siguiente línea. */
  const paragraph = (value, x, y, maxW, { size = BODY, weight = 400, color = C.ink, lineHeight = size * 1.4, maxLines = 99 } = {}) => {
    for (const line of wrap(value, maxW, size, weight, maxLines)) { text(line, x, y, { size, weight, color }); y += lineHeight; }
    return y;
  };
  /** Tarjeta con título; devuelve el rectángulo interior. */
  const card = (x, y, w, h, title, aside) => {
    box(x, y, w, h, 20); ctx.fillStyle = C.card; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    text(title, x + 24, y + 47, { size: 29, weight: 600, serif: true });
    const titleW = width(title, 29, 600, true);
    if (aside) text(fit(aside, w - 72 - titleW, SMALL), x + 40 + titleW, y + 46, { size: SMALL, color: C.muted });
    return { x: x + 24, y: y + 70, w: w - 48, h: h - 94 };
  };
  /** Muestra rectangular con el nombre dentro, en tinta clara u oscura según la luminancia. */
  const tile = (x, y, w, h, color) => {
    const hex = safeHex(color.hex);
    box(x, y, w, h, 10); ctx.fillStyle = hex; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2; ctx.stroke();
    const lines = wrap(color.name, w - 14, SMALL, 600, 2);
    const lh = 26;
    let ty = y + h / 2 - (lines.length * lh) / 2 + 20;
    for (const line of lines) { text(line, x + w / 2, ty, { size: SMALL, weight: 600, color: textColorFor(hex), align: 'center' }); ty += lh; }
  };
  /** Punto de color + nombre a su derecha; devuelve el alto ocupado. */
  const dotItem = (x, y, maxW, color) => {
    ctx.beginPath(); ctx.arc(x + 17, y + 17, 17, 0, Math.PI * 2);
    ctx.fillStyle = safeHex(color.hex); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2; ctx.stroke();
    const lines = wrap(color.name, maxW - 46, SMALL, 400, 2);
    lines.forEach((line, i) => text(line, x + 46, y + (lines.length === 1 ? 25 : 14) + i * 25, { size: SMALL }));
    return lines.length === 1 ? 46 : 58;
  };
  const pill = (label, x, y, { bg = C.soft, line = null, color = C.ink, size = SMALL, weight = 600, padX = 18, h = 44 } = {}) => {
    const w = width(label, size, weight) + padX * 2;
    box(x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke(); }
    text(label, x + padX, y + h / 2 + size * 0.35, { size, weight, color });
    return w;
  };

  // --- fondo ---
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, FICHA_W, FICHA_H);
  const fullW = FICHA_W - 2 * M;

  // --- cabecera: foto + estación ---
  const photoW = 450;
  const headH = 590;
  ctx.save();
  box(M, M, photoW, headH, 20); ctx.clip();
  ctx.fillStyle = C.stage; ctx.fillRect(M, M, photoW, headH);
  if (photo.canvas) {
    ctx.translate(M, M);
    drawCover(ctx, photo.canvas, photo.canvas.width, photo.canvas.height, photoW, headH);
  } else {
    text('Sin foto', M + photoW / 2, M + headH / 2 - 10, { size: 34, weight: 700, align: 'center' });
    paragraphCentered('Añade una en «Probar colores» para que aparezca aquí.', M + photoW / 2, M + headH / 2 + 34, photoW - 80);
  }
  ctx.restore();
  box(M, M, photoW, headH, 20); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();

  function paragraphCentered(value, cx, y, maxW) {
    for (const line of wrap(value, maxW, SMALL)) { text(line, cx, y, { size: SMALL, align: 'center' }); y += 30; }
  }

  const hx = M + photoW + 44;
  const hw = FICHA_W - M - hx;
  let y = M + 26;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
  text('FICHA DE ANÁLISIS DE COLOR PERSONAL', hx, y, { size: SMALL, weight: 700, color: C.earth });
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  y += 44;
  text(fit(session.name, hw, 30, 600), hx, y, { size: 30, weight: 600 });
  y += 34;
  text(`Sesión del ${formatDate(session.createdAt)}`, hx, y, { size: SMALL, color: C.muted });
  y += 62;
  text(fromRatings ? 'Tu estación' : 'Tu estación estimada', hx, y, { size: 28, color: C.muted });
  let nameSize = 92;
  while (nameSize > 56 && width(season.name, nameSize, 600, true) > hw) nameSize -= 4;
  y += nameSize + 2;
  text(season.name, hx, y, { size: nameSize, weight: 600, color: C.accent, serif: true });
  y += 30;

  // Origen y confianza, siempre visibles
  const confidence = CONFIDENCE[analysis.confidence] ?? analysis.confidence ?? 'sin datos';
  if (fromRatings) {
    pill(fit(`Según tus valoraciones · Afinidad ${season.score} % · Confianza: ${confidence}`, hw - 40, SMALL, 600), hx, y);
    y += 44 + 26;
  } else {
    const lines = [
      'Estimación automática a partir de la foto, no de tus valoraciones.',
      `Compatibilidad ${season.score} % · Confianza de tus valoraciones: ${confidence}.`,
    ].map((l) => fit(l, hw - 44, SMALL, 600));
    box(hx, y, hw, 92, 18); ctx.fillStyle = C.noticeBg; ctx.fill();
    ctx.strokeStyle = C.noticeLine; ctx.lineWidth = 2; ctx.stroke();
    lines.forEach((line, i) => text(line, hx + 22, y + 38 + i * 32, { size: SMALL, weight: i === 0 ? 700 : 400 }));
    y += 92 + 26;
  }
  // Rasgos de la estación
  let px = hx;
  for (const trait of guide?.traits ?? []) {
    const w = width(trait, BODY, 600) + 44;
    if (px + w > hx + hw) break;
    pill(trait, px, y, { bg: C.card, line: C.accent, color: C.accent, size: BODY, padX: 22, h: 50 });
    px += w + 12;
  }
  if (guide?.traits?.length) y += 50 + 40;
  y = paragraph(guide?.summary ?? state.seasonById.get(season.id)?.description ?? '', hx, y, hw, { size: 25, lineHeight: 36, maxLines: 4 });
  const others = fromRatings
    ? (analysis.runnerUp ? `Segunda opción: ${analysis.runnerUp.name} (${analysis.runnerUp.score} %).` : '')
    : (auto?.seasons ?? []).slice(1).length
      ? `También compatibles: ${auto.seasons.slice(1).map((s) => `${s.name} (${s.score} %)`).join(', ')}.`
      : '';
  if (others && y + 20 < M + headH) text(fit(others, hw, SMALL), hx, Math.min(y + 14, M + headH - 8), { size: SMALL, color: C.muted });

  // --- ejes ---
  y = M + headH + 28;
  const axisH = 262;
  const axisW = (fullW - 3 * 22) / 4;
  const axisCard = (index, title, labels, order, scores, category) => {
    const x = M + index * (axisW + 22);
    const inner = card(x, y, axisW, axisH, title);
    const hasScores = scores && order.some((k) => scores[k] != null);
    if (hasScores) {
      order.forEach((key, i) => {
        const ry = inner.y + 8 + i * 46;
        const value = scores[key];
        text(labels[key], inner.x, ry + 20, { size: SMALL });
        const bx = inner.x + 112;
        const bw = inner.w - 112 - 78;
        if (value != null) { box(bx, ry + 4, bw, 18, 9); ctx.fillStyle = C.track; ctx.fill(); }
        if (value != null && value > 0) { box(bx, ry + 4, Math.max(18, bw * Math.min(100, value) / 100), 18, 9); ctx.fillStyle = C.accent; ctx.fill(); }
        text(value == null ? 'sin datos' : `${value} %`, inner.x + inner.w, ry + 20, { size: SMALL, weight: 600, align: 'right', color: value == null ? C.muted : C.ink });
      });
      text('Según tus valoraciones', inner.x, inner.y + inner.h + 6, { size: SMALL, color: C.muted });
    } else if (category && labels[category]) {
      const sw = (inner.w - 16) / 3;
      order.forEach((key, i) => {
        const active = key === category;
        box(inner.x + i * (sw + 8), inner.y + 26, sw, 62, 14);
        ctx.fillStyle = active ? C.accent : C.track; ctx.fill();
        text(fit(labels[key], sw - 8, SMALL, active ? 700 : 400), inner.x + i * (sw + 8) + sw / 2, inner.y + 65, { size: SMALL, weight: active ? 700 : 400, color: active ? '#FFFFFF' : C.ink, align: 'center' });
      });
      text('Estimado por la foto', inner.x, inner.y + inner.h + 6, { size: SMALL, color: C.muted });
    } else {
      paragraph(title === 'Contraste' ? 'Sin datos: se estima al analizar tu rostro con una foto.' : 'Sin datos todavía.', inner.x, inner.y + 40, inner.w, { size: SMALL, color: C.muted, lineHeight: 30 });
    }
  };
  const axes = analysis.axes ?? {};
  axisCard(0, 'Subtono', UNDERTONE, ['calido', 'neutro', 'frio'], axes.undertone, auto?.undertone);
  axisCard(1, 'Profundidad', DEPTH, ['claro', 'medio', 'oscuro'], axes.depth, auto?.depth);
  axisCard(2, 'Intensidad', CHROMA, ['suave', 'medio', 'brillante'], axes.chroma, auto?.chroma);
  axisCard(3, 'Contraste', CONTRAST, ['bajo', 'medio', 'alto'], null, auto?.contrast);

  // --- familia de color y paleta recomendada ---
  y += axisH + GAP;
  const palH = 330;
  const famW = 520;
  const fam = card(M, y, famW, palH, 'Tu mejor familia de color');
  // Un color que la persona valoró por debajo del 40 % nunca se muestra como favorable.
  const ratedLow = (id) => { const score = state.ratings.get(id)?.score; return score != null && score < 40; };
  const family = state.colors.filter((c) => (c.seasons ?? []).includes(season.id) && !ratedLow(c.id)).slice(0, 8);
  family.forEach((color, i) => {
    const cx = fam.x + (fam.w / 4) * (i % 4) + fam.w / 8;
    const cy = fam.y + 50 + Math.floor(i / 4) * 112;
    ctx.beginPath(); ctx.arc(cx, cy, 46, 0, Math.PI * 2);
    ctx.fillStyle = safeHex(color.hex); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2; ctx.stroke();
  });
  text(fit(`Colores de ${season.name} en el catálogo`, fam.w, SMALL), fam.x, fam.y + fam.h + 6, { size: SMALL, color: C.muted });

  const pick = (ids, max) => (ids ?? []).map((id) => state.colorById.get(id)).filter(Boolean).slice(0, max);
  const good = (ids) => (ids ?? []).filter((id) => !ratedLow(id));
  let recommended = fromRatings ? pick(good(analysis.recommended), 12) : [];
  let recommendedFrom = 'según tus valoraciones';
  if (!recommended.length) { recommended = pick(good(auto?.recommended), 12); recommendedFrom = 'sugerida por la estimación automática'; }
  const recX = M + famW + 22;
  const rec = card(recX, y, fullW - famW - 22, palH, 'Paleta recomendada', recommended.length ? recommendedFrom : '');
  if (recommended.length) {
    const tw = (rec.w - 5 * 12) / 6;
    recommended.forEach((color, i) => tile(rec.x + (i % 6) * (tw + 12), rec.y + Math.floor(i / 6) * 120, tw, 108, color));
  } else {
    paragraph('Todavía no hay colores recomendados: valora más colores o analiza tu rostro.', rec.x, rec.y + 40, rec.w, { size: SMALL, color: C.muted });
  }

  // --- colores a evitar ---
  y += palH + GAP;
  const avoidH = 236;
  const avoidColors = pick(analysis.avoid, 8);
  const more = Math.max(0, (analysis.avoidCount ?? 0) - (analysis.avoid?.length ?? 0));
  const av = card(M, y, fullW, avoidH, 'Colores a evitar', avoidColors.length ? `los que valoraste por debajo del 40 %${more ? ` · y ${more} más` : ''}` : '');
  let noteY = av.y + 30;
  if (avoidColors.length) {
    const tw = (av.w - 7 * 12) / 8;
    avoidColors.forEach((color, i) => tile(av.x + i * (tw + 12), av.y, tw, 76, color));
    noteY = av.y + 76 + 38;
  } else {
    text('Aún no has valorado ningún color por debajo del 40 %.', av.x, noteY, { size: SMALL, color: C.muted });
    noteY += 40;
  }
  if (guide?.avoidNote) paragraph(guide.avoidNote, av.x, noteY, av.w, { size: SMALL, lineHeight: 30, maxLines: 2 });

  // --- maquillaje y cabello ---
  y += avoidH + GAP;
  const guideH = 300;
  const wideW = fullW - famW - 22;
  const mk = card(M, y, wideW, guideH, 'Guía de maquillaje');
  const groups = [['Colorete', guide?.makeup?.blush], ['Labios', guide?.makeup?.lips], ['Sombras', guide?.makeup?.eyeshadow], ['Delineador', guide?.makeup?.eyeliner]];
  const colW = mk.w / 4;
  groups.forEach(([label, items], i) => {
    const gx = mk.x + i * colW;
    text(label, gx, mk.y + 22, { size: BODY, weight: 700, color: C.accent });
    let gy = mk.y + 42;
    for (const item of items ?? []) gy += dotItem(gx, gy, colW - 10, item) + 6;
    if (!items?.length) text('Sin datos', gx, gy + 24, { size: SMALL, color: C.muted });
  });
  const hairX = M + wideW + 22;
  const hr = card(hairX, y, famW, guideH, 'Color de cabello');
  (guide?.hair?.best ?? []).forEach((item, i) => dotItem(hr.x + (i % 2) * (hr.w / 2), hr.y + 2 + Math.floor(i / 2) * 60, hr.w / 2 - 8, item));
  if (guide?.hair?.note) paragraph(guide.hair.note, hr.x, hr.y + 146, hr.w, { size: SMALL, lineHeight: 28, maxLines: 3 });

  // --- ropa y metales ---
  y += guideH + GAP;
  const lastH = 236;
  const cl = card(M, y, wideW, lastH, 'Ropa: neutros y acentos');
  [['Neutros', guide?.neutrals], ['Acentos', guide?.accents]].forEach(([label, items], row) => {
    const ry = cl.y + row * 76;
    text(label, cl.x, ry + 40, { size: BODY, weight: 700, color: C.accent });
    const tx = cl.x + 124;
    const tw = (cl.w - 124 - 4 * 10) / 5;
    (items ?? []).slice(0, 5).forEach((item, i) => tile(tx + i * (tw + 10), ry, tw, 66, item));
  });
  const mt = card(hairX, y, famW, lastH, 'Joyería y metales');
  let my = mt.y + 22;
  for (const [label, items] of [['Mejor', guide?.metals?.best], ['También', guide?.metals?.alsoGood], ['Evitar', guide?.metals?.avoid]]) {
    text(`${label}:`, mt.x, my, { size: SMALL, weight: 700, color: C.accent });
    my = paragraph((items ?? []).join(', ') || 'sin datos', mt.x + 108, my, mt.w - 108, { size: SMALL, lineHeight: 28, maxLines: 2 }) + 12;
  }

  // --- pie ---
  y += lastH + 40;
  // Firma: las cuatro estaciones y la autoría, a la derecha de la frase final.
  const authorW = width(AUTHOR, 26, 400, true);
  const sign = 4 * 14 + 3 * 5 + 16 + authorW; // cuatro muestras + separación + texto
  text(fit(`Tu color es una herramienta: úsalo cerca del rostro y deja que ${season.name} haga el resto.`, fullW - sign - 32, BODY, 600), M, y, { size: BODY, weight: 600, color: C.accent });
  SEASON_HUES.forEach((hue, i) => { box(M + fullW - sign + i * 19, y - 22, 14, 28, 3); ctx.fillStyle = hue; ctx.fill(); });
  ctx.font = `italic 400 26px ${SERIF}`;
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'right';
  ctx.fillText(AUTHOR, M + fullW, y);
  ctx.textAlign = 'left';
  paragraph(`Guía orientativa basada en ${fromRatings ? 'tus propias valoraciones' : 'una estimación automática a partir de tu foto'}; no es un diagnóstico. La cámara y la pantalla alteran los colores: confírmalo con telas reales y luz natural.`,
    M, y + 36, fullW, { size: SMALL, color: C.muted, lineHeight: 30, maxLines: 2 });

  return { canvas, basis };
}
