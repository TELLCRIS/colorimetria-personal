// Capa de datos local. Mismas funciones, formas de datos, reglas y errores que la antigua API HTTP,
// pero todo se calcula y se guarda en este navegador (IndexedDB): no hay servidor.
// Cada operación es una única transacción.
import { COLORS, SEASONS, getColor, colorOrder } from './core/colors.js';
import { analyze, computeScore } from './core/season.js';
import { notFoundError } from './core/errors.js';
import { parseSessionId, parseSessionCreate, parseSessionPatch, parseRatingBody, parseFeaturesBody } from './core/validation.js';
import { transact, req } from './db.js';

const ALL = ['sessions', 'ratings', 'photos'];
const now = () => new Date().toISOString();

/** Identificador estable de sesión para las copias (crypto.randomUUID no existe fuera de HTTPS). */
function newUid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const toSession = (row) => ({
  id: row.id,
  name: row.name,
  notes: row.notes,
  features: { skin: row.features?.skin ?? null, hair: row.features?.hair ?? null, eyes: row.features?.eyes ?? null },
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toRating = (row) => {
  const { answered, score } = computeScore(row);
  return {
    colorId: row.colorId,
    even: row.even,
    eyes: row.eyes,
    shadows: row.shadows,
    harmony: row.harmony,
    answered,
    score,
    updatedAt: row.updatedAt,
  };
};

/** Puntuaciones de la paleta vigente, en orden de paleta. */
const toRatings = (rows) =>
  rows
    .filter((row) => getColor(row.colorId))
    .sort((a, b) => colorOrder(a.colorId) - colorOrder(b.colorId))
    .map(toRating);

async function loadSession(store, rawId) {
  const id = parseSessionId(String(rawId));
  const row = await req(store('sessions').get(id));
  if (!row) throw notFoundError(`No existe la sesión ${id}.`);
  return row;
}

function loadColor(colorId) {
  const color = getColor(colorId);
  if (!color) throw notFoundError(`No existe el color "${colorId}".`);
  return color;
}

const ratingRows = (store, sessionId) => req(store('ratings').index('sessionId').getAll(sessionId));

async function analysisFor(store, row) {
  return analyze(toRatings(await ratingRows(store, row.id)), COLORS, SEASONS, toSession(row).features);
}

export const api = {
  getColors: async () => ({ colors: COLORS, seasons: SEASONS }),

  /** Sesiones más recientes primero, con nº de colores valorados y estación sugerida. */
  listSessions: () => transact(['sessions', 'ratings'], 'readonly', async (store) => {
    const [rows, ratings] = await Promise.all([req(store('sessions').getAll()), req(store('ratings').getAll())]);
    const bySession = new Map();
    for (const rating of ratings) {
      if (!bySession.has(rating.sessionId)) bySession.set(rating.sessionId, []);
      bySession.get(rating.sessionId).push(rating);
    }
    const sessions = rows
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : b.id - a.id))
      .map((row) => {
        const analysis = analyze(toRatings(bySession.get(row.id) ?? []), COLORS);
        const top = analysis.top;
        return {
          ...toSession(row),
          ratedCount: analysis.ratedCount,
          topSeason: top ? { id: top.id, name: top.name, score: top.score } : null,
        };
      });
    return { sessions };
  }),

  createSession: async (payload) => {
    const { name, notes } = parseSessionCreate(payload);
    return transact(['sessions'], 'readwrite', async (store) => {
      const at = now();
      const row = { uid: newUid(), name, notes, features: { skin: null, hair: null, eyes: null }, createdAt: at, updatedAt: at };
      row.id = await req(store('sessions').add(row));
      return { session: toSession(row) };
    });
  },

  getSession: (id) => transact(['sessions', 'ratings'], 'readonly', async (store) => {
    const row = await loadSession(store, id);
    const session = toSession(row);
    const ratings = toRatings(await ratingRows(store, row.id));
    return { session, ratings, analysis: analyze(ratings, COLORS, SEASONS, session.features) };
  }),

  updateSession: (id, payload) => transact(['sessions'], 'readwrite', async (store) => {
    const row = await loadSession(store, id);
    const patch = parseSessionPatch(payload);
    Object.assign(row, patch, { updatedAt: now() });
    await req(store('sessions').put(row));
    return { session: toSession(row) };
  }),

  /** Borra la sesión y, en cascada, sus valoraciones y su foto. */
  deleteSession: (id) => transact(ALL, 'readwrite', async (store) => {
    const row = await loadSession(store, id);
    store('sessions').delete(row.id);
    store('photos').delete(row.id);
    for (const key of await req(store('ratings').index('sessionId').getAllKeys(row.id))) store('ratings').delete(key);
    return null;
  }),

  putRating: (id, colorId, values) => transact(['sessions', 'ratings'], 'readwrite', async (store) => {
    const row = await loadSession(store, id);
    const color = loadColor(colorId);
    const parsed = parseRatingBody(values);
    const at = now();
    const record = { sessionId: row.id, colorId: color.id, ...parsed, updatedAt: at };
    store('ratings').put(record);
    row.updatedAt = at;
    store('sessions').put(row);
    return { rating: toRating(record), analysis: await analysisFor(store, row) };
  }),

  deleteRating: (id, colorId) => transact(['sessions', 'ratings'], 'readwrite', async (store) => {
    const row = await loadSession(store, id);
    const color = loadColor(colorId);
    const key = [row.id, color.id];
    if (await req(store('ratings').getKey(key))) {
      store('ratings').delete(key);
      row.updatedAt = now();
      store('sessions').put(row);
    }
    return null;
  }),

  putFeatures: (id, features) => transact(['sessions', 'ratings'], 'readwrite', async (store) => {
    const row = await loadSession(store, id);
    row.features = parseFeaturesBody(features);
    row.updatedAt = now();
    store('sessions').put(row);
    return { session: toSession(row), analysis: await analysisFor(store, row) };
  }),

  getAnalysis: (id) => transact(['sessions', 'ratings'], 'readonly', async (store) => {
    const row = await loadSession(store, id);
    return { analysis: await analysisFor(store, row) };
  }),

  // --- Copia de seguridad ---

  /** Todas las sesiones con su uid, valoraciones y, si se pide, el Blob de su foto. */
  exportSessions: ({ photos = true } = {}) => transact(ALL, 'readonly', async (store) => {
    const [rows, ratings] = await Promise.all([req(store('sessions').getAll()), req(store('ratings').getAll())]);
    const blobs = photos ? await Promise.all(rows.map((row) => req(store('photos').get(row.id)))) : [];
    return rows.map((row, i) => ({
      ...toSession(row),
      uid: row.uid,
      ratings: ratings.filter((r) => r.sessionId === row.id),
      photoBlob: blobs[i] ?? null,
    }));
  }),

  /**
   * Añade como sesiones NUEVAS las de una copia ya validada (core/backup.js); nunca sobrescribe.
   * Las que ya existen (mismo uid) se saltan. Cada una: { uid, name, notes, features, createdAt, updatedAt, ratings, photoBlob, legacyId }.
   */
  importSessions: (list) => transact(ALL, 'readwrite', async (store) => {
    let imported = 0;
    let duplicates = 0;
    for (const item of list) {
      if (await req(store('sessions').index('uid').getKey(item.uid))) { duplicates++; continue; }
      const id = await req(store('sessions').add({
        uid: item.uid, name: item.name, notes: item.notes, features: item.features,
        createdAt: item.createdAt, updatedAt: item.updatedAt,
      }));
      for (const r of item.ratings) {
        store('ratings').put({ sessionId: id, colorId: r.colorId, even: r.even, eyes: r.eyes, shadows: r.shadows, harmony: r.harmony, updatedAt: r.updatedAt });
      }
      if (item.photoBlob) {
        store('photos').put(item.photoBlob, id);
      } else if (item.legacyId) {
        // Sesión migrada del antiguo servidor: su foto ya estaba en este navegador con el id antiguo.
        const legacyKey = `legacy:${item.legacyId}`;
        const blob = await req(store('photos').get(legacyKey));
        if (blob) {
          store('photos').put(blob, id);
          store('photos').delete(legacyKey);
        }
      }
      imported++;
    }
    return { imported, duplicates };
  }),
};
