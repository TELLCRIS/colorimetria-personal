// Utilidades de DOM, color y formato. Nada aquí usa innerHTML.

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') Object.assign(node.style, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

// --- Color ---------------------------------------------------------------

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function safeHex(hex) {
  return typeof hex === 'string' && HEX_RE.test(hex) ? hex.toUpperCase() : '#888888';
}

function luminance(hex) {
  const h = safeHex(hex);
  const channel = (i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const DARK_INK = '#1f1c1a';
const LIGHT_INK = '#ffffff';

/** Elige tinta oscura o clara según el contraste WCAG real con el fondo. */
export function textColorFor(hex) {
  const l = luminance(hex);
  const withWhite = 1.05 / (l + 0.05);
  const withDark = (l + 0.05) / (luminance(DARK_INK) + 0.05);
  return withDark >= withWhite ? DARK_INK : LIGHT_INK;
}

// --- Etiquetas -----------------------------------------------------------

export const UNDERTONE = { calido: 'Cálido', frio: 'Frío', neutro: 'Neutro' };
export const DEPTH = { claro: 'Claro', medio: 'Medio', oscuro: 'Oscuro' };
export const CHROMA = { suave: 'Suave', medio: 'Medio', brillante: 'Brillante' };
export const CONFIDENCE = { insuficiente: 'Insuficiente', baja: 'Baja', media: 'Media', alta: 'Alta' };

export const CRITERIA = [
  { key: 'even', label: 'La piel se ve más uniforme', short: 'Piel uniforme' },
  { key: 'eyes', label: 'Resalta mis ojos', short: 'Ojos' },
  { key: 'shadows', label: 'Reduce sombras/rojeces', short: 'Sombras/rojeces' },
  { key: 'harmony', label: 'Armoniza con mis rasgos', short: 'Armonía' },
];

export const VALUE_OPTIONS = [
  { value: '', label: 'No sé' },
  { value: '0', label: 'Nada' },
  { value: '1', label: 'Poco' },
  { value: '2', label: 'Algo' },
  { value: '3', label: 'Mucho' },
];

export function valueLabel(v) {
  if (v == null) return 'No sé';
  return VALUE_OPTIONS.find((o) => o.value === String(v))?.label ?? String(v);
}

export function percent(v) {
  return v == null ? '—' : `${v}%`;
}

const dateFmt = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

// --- Piezas reutilizadas -------------------------------------------------

export function bar(value) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return el('div', { class: 'bar' }, el('span', { style: { width: `${pct}%` } }));
}

/** Tarjeta pequeña de color: muestra + nombre + hex. */
export function colorChip(color) {
  const hex = safeHex(color.hex);
  return el('li', { class: 'color-chip', 'data-color-id': color.id },
    el('span', { class: 'dot', style: { backgroundColor: hex } }),
    el('span', { class: 'txt' },
      el('span', { text: color.name }),
      el('span', { class: 'hex', text: hex })));
}

export const CONTRAST = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto' };

export const FEATURES = [
  { key: 'skin', label: 'Piel', letter: 'P', hint: 'marca una zona de la mejilla o la frente, sin sombra ni brillo.' },
  { key: 'hair', label: 'Cabello', letter: 'C', hint: 'marca una zona del cabello con luz uniforme, o pulsa «Omitir este paso».' },
  { key: 'eyes', label: 'Ojos', letter: 'O', hint: 'marca el iris, evitando la pupila y los reflejos, o pulsa «Omitir este paso».' },
];

/** Muestra de un rasgo (piel, cabello, ojos): color + etiqueta + hex u "Omitido". */
export function featureChip(label, hex, testid) {
  const has = typeof hex === 'string' && HEX_RE.test(hex);
  return el('li', { class: 'color-chip', 'data-testid': testid, 'data-hex': has ? hex.toUpperCase() : '' },
    el('span', { class: has ? 'dot' : 'dot none', style: has ? { backgroundColor: hex } : {} }),
    el('span', { class: 'txt' },
      el('span', { text: label }),
      el('span', { class: 'hex', text: has ? hex.toUpperCase() : 'Sin muestra' })));
}

// --- Descargas locales ---------------------------------------------------

export function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen.'))), type, quality);
  });
}

/** Descarga un blob en el dispositivo; no hay ninguna petición de red. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
