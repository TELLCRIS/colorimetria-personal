// Reglas de validación de la capa de datos. Lanzan AppError(400, VALIDATION) con mensaje en español.
import { validationError } from './errors.js';
import { CRITERIA } from './season.js';

export const NAME_MAX = 80;
export const NOTES_MAX = 1000;

const CRITERIA_LABELS = {
  even: 'even (piel uniforme)',
  eyes: 'eyes (resalta ojos)',
  shadows: 'shadows (sombras/rojeces)',
  harmony: 'harmony (armonía)',
};

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function requireObject(body) {
  if (!isPlainObject(body)) throw validationError('El cuerpo de la petición debe ser un objeto JSON.');
  return body;
}

export function parseSessionId(raw) {
  if (!/^[1-9]\d{0,14}$/.test(raw)) throw validationError('El identificador de sesión debe ser un entero positivo.');
  return Number(raw);
}

function parseName(value) {
  if (typeof value !== 'string') throw validationError('El nombre es obligatorio y debe ser un texto.');
  const name = value.trim();
  if (name.length < 1) throw validationError('El nombre no puede estar vacío.');
  if (name.length > NAME_MAX) throw validationError(`El nombre no puede superar los ${NAME_MAX} caracteres.`);
  return name;
}

function parseNotes(value) {
  if (value === null) return '';
  if (typeof value !== 'string') throw validationError('Las notas deben ser un texto.');
  const notes = value.trim();
  if (notes.length > NOTES_MAX) throw validationError(`Las notas no pueden superar los ${NOTES_MAX} caracteres.`);
  return notes;
}

export function parseSessionCreate(body) {
  const input = requireObject(body);
  return {
    name: parseName(input.name),
    notes: input.notes === undefined ? '' : parseNotes(input.notes),
  };
}

export function parseSessionPatch(body) {
  const input = requireObject(body);
  const patch = {};
  if (input.name !== undefined) patch.name = parseName(input.name);
  if (input.notes !== undefined) patch.notes = parseNotes(input.notes);
  if (Object.keys(patch).length === 0) {
    throw validationError('Indica al menos un campo que modificar: name o notes.');
  }
  return patch;
}

const FEATURES = ['skin', 'hair', 'eyes'];
const FEATURE_LABELS = { skin: 'skin (piel)', hair: 'hair (cabello)', eyes: 'eyes (ojos)' };
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function parseFeaturesBody(body) {
  const input = requireObject(body);
  const out = {};
  for (const key of FEATURES) {
    const value = input[key];
    if (value === undefined) {
      throw validationError(`Falta el color ${FEATURE_LABELS[key]}; usa null si no lo tienes.`);
    }
    if (value !== null && !(typeof value === 'string' && HEX_COLOR.test(value))) {
      throw validationError(`El color ${FEATURE_LABELS[key]} debe ser null o un hex con formato #RRGGBB.`);
    }
    out[key] = value === null ? null : value.toUpperCase();
  }
  return out;
}

export function parseRatingBody(body) {
  const input = requireObject(body);
  const out = {};
  for (const key of CRITERIA) {
    const value = input[key];
    if (value === undefined) {
      throw validationError(`Falta el criterio ${CRITERIA_LABELS[key]}; usa null para "No sé".`);
    }
    if (value !== null && !(Number.isInteger(value) && value >= 0 && value <= 3)) {
      throw validationError(`El criterio ${CRITERIA_LABELS[key]} debe ser null o un entero entre 0 y 3.`);
    }
    out[key] = value;
  }
  return out;
}
