// Formato del archivo de copia de seguridad (.json) y su validación. Lógica pura.
// El archivo es entrada NO confiable: se comprueba versión, tipos, rangos y tamaños con las
// mismas reglas que la capa de datos, y solo se copian los campos conocidos.
//
// {
//   "app": "colorimetria-personal", "version": 1, "exportedAt": "<ISO 8601>",
//   "sessions": [{
//     "uid": "<identificador estable de la sesión>", "name", "notes", "createdAt", "updatedAt",
//     "features": { "skin", "hair", "eyes" },                 // "#RRGGBB" o null
//     "ratings": [{ "colorId", "even", "eyes", "shadows", "harmony", "updatedAt" }],
//     "photo": "data:image/jpeg;base64,…"                     // opcional
//   }]
// }
import { validationError } from './errors.js';
import { parseSessionCreate, parseFeaturesBody, parseRatingBody } from './validation.js';
import { getColor } from './colors.js';

export const BACKUP_APP = 'colorimetria-personal';
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_SESSIONS = 500;
export const BACKUP_MAX_RATINGS = 500;
export const BACKUP_MAX_PHOTO_CHARS = 4_000_000;

const UID = /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/;
const PHOTO = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Compone el objeto de copia a partir de sesiones ya leídas del almacén. */
export function buildBackup(sessions, exportedAt = new Date().toISOString()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt,
    sessions: sessions.map((s) => ({
      uid: s.uid,
      name: s.name,
      notes: s.notes,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      features: { skin: s.features?.skin ?? null, hair: s.features?.hair ?? null, eyes: s.features?.eyes ?? null },
      ratings: (s.ratings ?? []).map((r) => ({
        colorId: r.colorId, even: r.even, eyes: r.eyes, shadows: r.shadows, harmony: r.harmony, updatedAt: r.updatedAt,
      })),
      ...(s.photo ? { photo: s.photo } : {}),
      ...(s.legacyId ? { legacyId: s.legacyId } : {}),
    })),
  };
}

function parseDate(value) {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw validationError('Fecha no válida.');
  }
  return new Date(value).toISOString();
}

function parseSession(raw, counters) {
  if (!isPlainObject(raw)) throw validationError('La sesión debe ser un objeto.');
  if (typeof raw.uid !== 'string' || !UID.test(raw.uid)) throw validationError('Identificador de sesión no válido.');
  const { name, notes } = parseSessionCreate({ name: raw.name, notes: raw.notes });
  const features = parseFeaturesBody(raw.features);
  if (!Array.isArray(raw.ratings) || raw.ratings.length > BACKUP_MAX_RATINGS) throw validationError('Lista de valoraciones no válida.');
  const ratings = new Map();
  for (const item of raw.ratings) {
    if (!isPlainObject(item) || typeof item.colorId !== 'string') throw validationError('Valoración no válida.');
    if (!getColor(item.colorId)) { counters.skippedRatings++; continue; } // color que ya no está en la paleta
    ratings.set(item.colorId, { colorId: item.colorId, ...parseRatingBody(item), updatedAt: parseDate(item.updatedAt) });
  }
  let photo = null;
  if (raw.photo != null) {
    if (typeof raw.photo === 'string' && raw.photo.length <= BACKUP_MAX_PHOTO_CHARS && PHOTO.test(raw.photo)) photo = raw.photo;
    else counters.skippedPhotos++;
  }
  // Solo lo escribe la migración desde el antiguo servidor: permite recuperar la foto que ya estaba en este navegador.
  const legacyId = Number.isInteger(raw.legacyId) && raw.legacyId > 0 && raw.legacyId < 1e9 ? raw.legacyId : null;
  return {
    uid: raw.uid, name, notes, features,
    createdAt: parseDate(raw.createdAt), updatedAt: parseDate(raw.updatedAt),
    ratings: [...ratings.values()], photo, legacyId,
  };
}

/**
 * Lee el texto de un archivo de copia.
 * Lanza VALIDATION si el archivo entero no sirve; las sesiones inválidas se descartan y se cuentan.
 * @returns {{ sessions: object[], rejected: number, skippedRatings: number, skippedPhotos: number }}
 */
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw validationError('El archivo no es una copia de seguridad válida: no se pudo leer como JSON.');
  }
  if (!isPlainObject(data) || data.app !== BACKUP_APP) {
    throw validationError('El archivo no es una copia de seguridad de esta aplicación.');
  }
  if (data.version !== BACKUP_VERSION) {
    throw validationError('La copia es de una versión que esta aplicación no sabe leer.');
  }
  if (!Array.isArray(data.sessions)) throw validationError('La copia no contiene una lista de sesiones.');
  if (data.sessions.length > BACKUP_MAX_SESSIONS) {
    throw validationError(`La copia tiene demasiadas sesiones (máximo ${BACKUP_MAX_SESSIONS}).`);
  }
  const counters = { skippedRatings: 0, skippedPhotos: 0 };
  const sessions = [];
  const seen = new Set();
  let rejected = 0;
  for (const raw of data.sessions) {
    try {
      const session = parseSession(raw, counters);
      if (seen.has(session.uid)) { rejected++; continue; }
      seen.add(session.uid);
      sessions.push(session);
    } catch {
      rejected++;
    }
  }
  return { sessions, rejected, ...counters };
}
