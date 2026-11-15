export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'VALIDATION', message, details);
export const unauthorized = (message = 'Necesitás iniciar sesión.') => new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} no encontrado.`);
export const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
export const tooMany = (message) => new AppError(429, 'TOO_MANY_REQUESTS', message);
