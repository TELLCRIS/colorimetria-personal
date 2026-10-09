// Errores de la capa de datos: `code` estable (VALIDATION / NOT_FOUND / STORAGE) y `message` en español
// para mostrar tal cual. `status` conserva el equivalente HTTP de la API anterior (400 / 404).
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export const validationError = (message) => new AppError(400, 'VALIDATION', message);
export const notFoundError = (message) => new AppError(404, 'NOT_FOUND', message);
export const storageError = (message) => new AppError(0, 'STORAGE', message);
