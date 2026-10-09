// Conexión a IndexedDB: una sola base local, `colorimetria`, con sesiones, valoraciones y fotos.
// Nada sale de este navegador.
import { storageError } from './core/errors.js';

const DB_NAME = 'colorimetria';
const DB_VERSION = 2;
const UNAVAILABLE = 'Este navegador no permite guardar datos ahora mismo (puede ser una ventana privada o que el almacenamiento esté bloqueado).';

let connection = null;

/** La v1 guardaba las fotos con el id de sesión del antiguo servidor: se conservan como «legacy:<id>». */
function relabelLegacyPhotos(photos) {
  photos.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (!cursor) return;
    if (typeof cursor.key === 'number') {
      photos.put(cursor.value, `legacy:${cursor.key}`);
      cursor.delete();
    }
    cursor.continue();
  };
}

function open() {
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(storageError(UNAVAILABLE));
      return;
    }
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (event.oldVersion < 1) db.createObjectStore('photos'); // clave: id de sesión
      if (event.oldVersion < 2) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        sessions.createIndex('uid', 'uid', { unique: true });
        const ratings = db.createObjectStore('ratings', { keyPath: ['sessionId', 'colorId'] });
        ratings.createIndex('sessionId', 'sessionId');
        if (event.oldVersion === 1) relabelLegacyPhotos(request.transaction.objectStore('photos'));
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = null; };
      db.onclose = () => { connection = null; };
      resolve(db);
    };
    request.onerror = () => reject(storageError(UNAVAILABLE));
    request.onblocked = () => reject(storageError('Cierra las otras pestañas de esta aplicación y vuelve a cargar la página.'));
  });
}

/** Promesa con el resultado de una petición de IndexedDB. */
export const req = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

/**
 * Ejecuta `work` dentro de UNA transacción: o se guarda todo o nada.
 * `work(store)` recibe una función que devuelve cada almacén; dentro solo se puede esperar a peticiones de IndexedDB.
 */
export async function transact(storeNames, mode, work) {
  if (typeof indexedDB === 'undefined') throw storageError(UNAVAILABLE);
  if (!connection) connection = open().catch((err) => { connection = null; throw err; });
  const db = await connection;
  let tx;
  try {
    tx = db.transaction(storeNames, mode);
  } catch {
    connection = null;
    throw storageError(UNAVAILABLE);
  }
  const done = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transacción cancelada.'));
  });
  let result;
  try {
    result = await work((name) => tx.objectStore(name));
  } catch (err) {
    try { tx.abort(); } catch { /* ya terminada */ }
    await done.catch(() => {});
    throw err;
  }
  try {
    await done;
  } catch {
    throw storageError('No se pudieron guardar los cambios: puede que el navegador se haya quedado sin espacio.');
  }
  return result;
}
