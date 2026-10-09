// Informe imprimible (window.print / guardar como PDF) y lámina de drapeado.
// Se genera al mostrarlo o al imprimir, no en cada valoración.
import { $, el, clear, colorChip, formatDate, percent, plural, safeHex, valueLabel, canvasToBlob, downloadBlob, stamp, CONFIDENCE, CRITERIA } from './dom.js';
import { state, on } from './store.js';
import { rankedRatings, missingCount, avoidMore } from './results.js';
import { buildFicha, fichaBasis, FICHA_W, FICHA_H } from './ficha.js';
import { jpegToPdf } from './pdf.js';
import { autoNodes } from './auto.js';
import { photo } from './photo.js';
import { drawCloth, drawFitHeight, drapeHeightRatio, drapeNeckRatio, sourceFrame } from './drape.js';
import { showError, toast } from './ui.js';

const CELL_W = 480;
const CELL_H = 360;
const MAX_RECOMMENDED = 8;
const MAX_AVOID = 4;
const DISCLAIMER = 'Este informe es una guía orientativa y comparativa basada en tus propias observaciones; no es un diagnóstico automático de estación. La cámara altera el balance de blancos, la exposición y el contraste: para mayor fiabilidad, confirma el resultado con telas reales y luz diurna indirecta, sin maquillaje ni filtros.';

let dirty = true;
let sheet = null; // { recommended: [{color, canvas}], avoid: [...], origin }
let ficha = null; // { canvas, basis } de la ficha final, o null si aún no puede generarse

function chipList(ids, emptyText, testid) {
  const colors = (ids ?? []).map((id) => state.colorById.get(id)).filter(Boolean);
  return colors.length
    ? el('ul', { class: 'chips', 'data-testid': testid }, colors.map(colorChip))
    : el('p', { class: 'muted', 'data-testid': testid, text: emptyText });
}

function seasonBlock(analysis) {
  if (!analysis?.enough || !analysis.top) {
    const missing = missingCount(analysis);
    return [
      el('p', { class: 'lead', text: 'Sin estación sugerida todavía' }),
      el('p', {
        text: missing > 0
          ? `Faltan ${plural(missing, 'color', 'colores')} por valorar para poder sugerir una estación (${analysis?.ratedCount ?? 0} de ${analysis?.minRequired ?? 0}).`
          : 'Aún no hay datos suficientes para sugerir una estación.',
      }),
    ];
  }
  const { top, runnerUp } = analysis;
  const description = state.seasonById.get(top.id)?.description;
  return [
    el('p', { class: 'lead', 'data-testid': 'report-season', text: top.name }),
    el('p', { text: `Afinidad: ${percent(top.score)} · Confianza: ${CONFIDENCE[analysis.confidence] ?? analysis.confidence}` }),
    description ? el('p', { class: 'muted', text: description }) : null,
    runnerUp ? el('p', { text: `Segunda opción: ${runnerUp.name} (${percent(runnerUp.score)})` }) : null,
  ];
}

function scoreTable() {
  const entries = rankedRatings();
  if (!entries.length) return el('p', { class: 'muted', text: 'Aún no has evaluado colores.' });
  return el('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Tabla de puntuaciones' },
    el('table', { 'data-testid': 'report-table' },
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', text: 'Color' }),
        el('th', { scope: 'col', text: 'Hex' }),
        ...CRITERIA.map((c) => el('th', { scope: 'col', text: c.short })),
        el('th', { scope: 'col', text: 'Puntuación' }))),
      el('tbody', {}, entries.map(({ rating, color }) => el('tr', {},
        el('th', { scope: 'row' }, el('span', { class: 'cell-color' },
          el('span', { class: 'dot', style: { backgroundColor: safeHex(color.hex) } }),
          el('span', { text: color.name }))),
        el('td', { text: safeHex(color.hex) }),
        ...CRITERIA.map((c) => el('td', { text: valueLabel(rating[c.key]) })),
        el('td', { class: 'num', text: rating.score == null ? '—' : percent(rating.score) }))))));
}

// --- Prueba de drapeado sobre la foto ------------------------------------

function cellCanvas(source, color, heightRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#CFC7BD'; // bandas neutras si la foto es vertical
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  drawFitHeight(ctx, source, source.width, source.height, CELL_W, CELL_H);
  const hex = safeHex(color.hex);
  drawCloth(ctx, CELL_W, CELL_H, {
    colorA: hex, colorB: hex, compare: false, heightRatio,
    neckRatio: drapeNeckRatio(),
    frame: sourceFrame(source.width, source.height, CELL_W, CELL_H),
  });
  return canvas;
}

function figure({ color, canvas }, testid) {
  return el('figure', { class: 'drape-cell', 'data-testid': testid, 'data-color-id': color.id },
    el('img', {
      src: canvas.toDataURL('image/jpeg', 0.86), width: canvas.width, height: canvas.height,
      alt: `Tu foto con una tela de color ${color.name}`,
    }),
    el('figcaption', {},
      el('span', { text: color.name }),
      el('span', { class: 'hex', text: safeHex(color.hex) })));
}

function drapeProof(analysis) {
  sheet = null;
  const source = photo.canvas;
  if (!source) {
    return [el('p', {
      class: 'muted', 'data-testid': 'report-photo-hint',
      text: 'Este informe puede incluir una prueba de drapeado sobre tu rostro: en «Probar colores», toma o sube una foto y vuelve aquí.',
    })];
  }
  const pick = (ids, max) => (ids ?? []).map((id) => state.colorById.get(id)).filter(Boolean).slice(0, max);
  let recommended = pick(analysis?.recommended, MAX_RECOMMENDED);
  let origin = 'ratings';
  if (!recommended.length) {
    recommended = pick(analysis?.auto?.recommended, MAX_RECOMMENDED);
    origin = 'auto';
  }
  if (!recommended.length) {
    return [el('p', {
      class: 'muted', 'data-testid': 'report-drape-empty',
      text: 'Ya hay foto, pero aún no hay colores recomendados: valora más colores o analiza tu rostro para generar la prueba de drapeado.',
    })];
  }
  const heightRatio = drapeHeightRatio();
  const build = (colors) => colors.map((color) => ({ color, canvas: cellCanvas(source, color, heightRatio) }));
  sheet = { recommended: build(recommended), avoid: build(pick(analysis?.avoid, MAX_AVOID)), origin };
  return [
    el('p', {
      class: 'muted', 'data-testid': 'report-drape-origin', 'data-origin': origin,
      text: origin === 'ratings'
        ? 'Tu foto con la tela virtual de los colores recomendados según tus valoraciones.'
        : 'Tu foto con la tela virtual de los colores sugeridos por la estimación automática (aún no hay recomendados por valoraciones).',
    }),
    el('div', { class: 'drape-grid', 'data-testid': 'report-drape-grid' },
      sheet.recommended.map((cell) => figure(cell, `report-drape-cell-${cell.color.id}`))),
    sheet.avoid.length ? el('h4', { text: 'Para comparar: colores a evitar' }) : null,
    sheet.avoid.length
      ? el('div', { class: 'drape-grid', 'data-testid': 'report-avoid-grid' },
        sheet.avoid.map((cell) => figure(cell, `report-avoid-cell-${cell.color.id}`)))
      : null,
  ];
}

/** Compone la cuadrícula en una sola imagen PNG y la descarga en el dispositivo. */
async function downloadSheet() {
  if (!sheet || !state.session) return;
  const cols = 4;
  const gap = 24;
  const caption = 64;
  const width = cols * CELL_W + (cols + 1) * gap;
  const rowsOf = (cells) => Math.ceil(cells.length / cols);
  const blockHeight = (cells) => rowsOf(cells) * (CELL_H + caption + gap);
  const header = 150;
  const subtitle = sheet.avoid.length ? 70 : 0;
  const footer = 80;
  const height = header + blockHeight(sheet.recommended) + subtitle + blockHeight(sheet.avoid) + footer;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFDF9';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2C2927';
  ctx.font = '700 44px system-ui, sans-serif';
  ctx.fillText(state.session.name, gap, 64, width - 2 * gap);
  ctx.font = '26px system-ui, sans-serif';
  ctx.fillStyle = '#6A635D';
  const top = state.analysis?.enough && state.analysis?.top ? ` · Estación sugerida: ${state.analysis.top.name}` : '';
  ctx.fillText(`Prueba de drapeado · ${formatDate(state.session.createdAt)}${top}`, gap, 108, width - 2 * gap);

  const drawBlock = (cells, y0) => {
    cells.forEach(({ color, canvas: cell }, i) => {
      const x = gap + (i % cols) * (CELL_W + gap);
      const y = y0 + Math.floor(i / cols) * (CELL_H + caption + gap);
      ctx.drawImage(cell, x, y);
      ctx.fillStyle = '#2C2927';
      ctx.font = '600 26px system-ui, sans-serif';
      ctx.fillText(color.name, x, y + CELL_H + 30, CELL_W);
      ctx.fillStyle = '#6A635D';
      ctx.font = '22px ui-monospace, Consolas, monospace';
      ctx.fillText(safeHex(color.hex), x, y + CELL_H + 56, CELL_W);
    });
    return y0 + blockHeight(cells);
  };
  let y = drawBlock(sheet.recommended, header);
  if (sheet.avoid.length) {
    ctx.fillStyle = '#2C2927';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText('Para comparar: colores a evitar', gap, y + 36, width - 2 * gap);
    y = drawBlock(sheet.avoid, y + subtitle);
  }
  ctx.fillStyle = '#6A635D';
  ctx.font = '22px system-ui, sans-serif';
  ctx.fillText('Guía orientativa: la tela es virtual y la cámara altera los colores. Confírmalo con telas reales y luz natural.', gap, height - 36, width - 2 * gap);

  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, `lamina-colorimetria-sesion-${state.session.id}-${stamp()}.png`);
  toast('Lámina descargada en tu dispositivo. No se ha enviado a ningún servidor.');
}

// --- Composición del informe ---------------------------------------------

function render() {
  const { session, analysis } = state;
  if (!session) return;
  const proof = drapeProof(analysis);
  const parts = [
    el('h2', { 'data-testid': 'report-title', text: session.name }),
    fichaPreview(),
    el('p', { class: 'muted', text: `Informe de colorimetría personal · Sesión del ${formatDate(session.createdAt)} · ${plural(analysis?.ratedCount ?? 0, 'color valorado', 'colores valorados')}` }),

    el('h3', { text: 'Estación sugerida (según tus valoraciones)' }),
    ...seasonBlock(analysis),
    (analysis?.messages ?? []).length
      ? el('ul', { class: 'messages' }, analysis.messages.map((m) => el('li', { text: m })))
      : null,

    el('h3', { text: 'Estimación automática (orientativa, según la foto)' }),
    el('div', { class: 'auto-estimate', 'data-testid': 'report-auto', 'data-has-auto': String(Boolean(analysis?.auto)) },
      autoNodes({ prefix: 'report-auto' })),

    el('h3', { text: 'Paleta recomendada' }),
    chipList(analysis?.recommended, 'Todavía no hay colores recomendados.', 'report-recommended'),

    el('h3', { text: 'Colores a evitar' }),
    chipList(analysis?.avoid, 'Todavía no hay colores a evitar.', 'report-avoid'),
    avoidMore(analysis)
      ? el('p', { class: 'muted', 'data-testid': 'report-avoid-more', text: `y ${avoidMore(analysis)} más con menos del 40 %.` })
      : null,

    el('h3', { text: 'Prueba de drapeado sobre tu foto' }),
    el('section', { class: 'drape-proof', 'data-testid': 'report-drape', 'data-has-photo': String(Boolean(photo.canvas)) }, proof),

    el('h3', { text: 'Puntuaciones' }),
    el('p', { class: 'table-hint', text: 'Desliza la tabla hacia los lados para ver todas las columnas.' }),
    scoreTable(),

    el('h3', { text: 'Notas' }),
    el('p', { class: 'notes', 'data-testid': 'report-notes', text: session.notes || 'Sin notas.' }),

    el('p', { class: 'disclaimer', 'data-testid': 'report-disclaimer', text: DISCLAIMER }),
  ];
  clear($('report')).append(...parts.filter(Boolean));
  $('report-sheet-download').hidden = !sheet;
  syncFinalButton();
  dirty = false;
}

// --- Ficha final (vista previa + PDF) ------------------------------------

function fichaPreview() {
  ficha = buildFicha();
  if (!ficha) return null;
  return el('figure', { class: 'ficha' },
    el('img', {
      'data-testid': 'report-final-preview', 'data-source': ficha.basis.source,
      src: ficha.canvas.toDataURL('image/jpeg', 0.88), width: FICHA_W, height: FICHA_H,
      alt: `Ficha de análisis de color personal: ${ficha.basis.season.name}${ficha.basis.source === 'auto' ? ' (estimación automática a partir de la foto)' : ''}, con rasgos, ejes, paleta recomendada, colores a evitar y guía de maquillaje, cabello, ropa y metales. El mismo contenido está en texto en este informe.`,
    }),
    el('figcaption', { class: 'muted', text: 'Vista previa de la ficha final. «Descargar informe final (PDF)» la guarda en una página A4.' }));
}

/** Estado del botón de descarga: qué estación usa la ficha, o qué falta para poder generarla. */
function syncFinalButton() {
  const basis = fichaBasis();
  const button = $('report-final-download');
  button.disabled = !basis.ok;
  button.dataset.source = basis.source ?? '';
  const missing = missingCount(state.analysis);
  const photoNote = basis.hasPhoto ? '' : ' Sin foto, la ficha lleva un hueco neutro: puedes añadir una en «Probar colores».';
  $('report-final-status').textContent = basis.source === 'ratings'
    ? `La ficha usa tu estación sugerida según tus valoraciones (${basis.season.name}).${photoNote}`
    : basis.source === 'auto'
      ? `La ficha usa la estimación automática a partir de la foto (${basis.season.name}), no tus valoraciones${missing > 0 ? `: valora ${plural(missing, 'color', 'colores')} más para confirmarla` : ''}.${photoNote}`
      : `Para generar la ficha falta una estación: valora ${missing > 0 ? `${plural(missing, 'color', 'colores')} más` : 'más colores'}, o sube una foto y pulsa «Analizar mi rostro».`;
}

function slug(name) {
  const clean = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return clean || 'sesion';
}

/** Envuelve el JPEG de la ficha en un PDF A4 de una página y lo descarga. Todo ocurre en el navegador. */
async function downloadFinal() {
  refreshReport();
  if (!ficha || !state.session) return;
  const jpeg = await canvasToBlob(ficha.canvas, 'image/jpeg', 0.92);
  const pdf = jpegToPdf(new Uint8Array(await jpeg.arrayBuffer()), FICHA_W, FICHA_H, `Colorimetría personal · ${state.session.name}`);
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  downloadBlob(pdf, `colorimetria-${slug(state.session.name)}-${date}.pdf`);
  toast('Informe final descargado en tu dispositivo. No se ha enviado a ningún servidor.');
}

/** Regenera el informe si algo cambió. Se llama al abrir la pestaña y antes de imprimir. */
export function refreshReport() {
  if (dirty && state.session) render();
}

function invalidate() {
  dirty = true;
  syncFinalButton();
  if (!$('panel-report').hidden && !$('view-session').hidden) refreshReport();
}

export function initReport() {
  $('report-print').addEventListener('click', () => { refreshReport(); window.print(); });
  $('report-sheet-download').addEventListener('click', () => downloadSheet().catch(showError));
  $('report-final-download').addEventListener('click', () => downloadFinal().catch(showError));
  $('drape-height').addEventListener('input', invalidate); // las celdas usan la altura de tela actual
  $('drape-neck').addEventListener('input', invalidate);
  window.addEventListener('beforeprint', refreshReport);
  on('session', invalidate);
  on('sessionMeta', invalidate);
  on('ratings', invalidate);
  photo.onChange(invalidate);
}
