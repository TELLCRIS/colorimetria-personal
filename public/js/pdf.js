// PDF mínimo escrito a mano: una página A4 vertical que contiene una imagen JPEG
// a página completa (filtro DCTDecode). Sin dependencias: funciona sin internet.

const A4_W = 595.28; // puntos (210 mm)
const A4_H = 841.89; // puntos (297 mm)

/** Cadena PDF en UTF-16BE hexadecimal, para títulos con tildes o eñes. */
function hexString(text) {
  let hex = 'FEFF';
  for (const unit of String(text)) {
    for (let i = 0; i < unit.length; i++) hex += unit.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
  }
  return `<${hex}>`;
}

/**
 * @param {Uint8Array} jpeg  bytes de un JPEG RGB (el que produce canvas.toBlob)
 * @param {number} width     ancho de la imagen en píxeles
 * @param {number} height    alto de la imagen en píxeles
 * @param {string} title     título del documento
 * @returns {Blob} application/pdf
 */
export function jpegToPdf(jpeg, width, height, title) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (number, dictionary, stream) => {
    offsets[number] = length;
    push(`${number} 0 obj\n${dictionary}\n`);
    if (stream !== undefined) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A])); // marca de archivo binario
  const content = `q ${A4_W} 0 0 ${A4_H} 0 0 cm /Im0 Do Q`;
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  object(4, `<< /Length ${content.length} >>`, content);
  object(5, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  object(6, `<< /Title ${hexString(title)} /Producer (Probador de colorimetria personal) >>`);

  const xrefAt = length;
  const count = offsets.length; // objetos 1..6 más la entrada libre 0
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}
