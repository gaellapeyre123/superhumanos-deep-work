import { ZodError } from 'zod';
import { config } from '../config.js';
import { AppError, badRequest, tooMany, unauthorized } from '../lib/errors.js';
import { verifyToken } from '../services/auth.service.js';

export const COOKIE_NAME = 'sh_dw';

/** Envuelve un controlador async y manda cualquier error al manejador central. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Autenticación: cookie httpOnly (principal) o header Authorization: Bearer (clientes de API y tests). */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization;
  const token = req.cookies?.[COOKIE_NAME] || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  const payload = token && verifyToken(token);
  if (!payload) return next(unauthorized());
  req.userId = Number(payload.sub);
  return next();
}

/** Valida body / query / params contra esquemas zod y reemplaza por los datos parseados. */
export const validate = (schemas) => (req, _res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key] ?? {});
    }
    next();
  } catch (e) {
    next(e instanceof ZodError ? badRequest('Datos inválidos.', e.flatten()) : e);
  }
};

/** Límite simple en memoria (por IP) para el login: 10 intentos cada 15 minutos. */
export function loginLimiter({ max = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return (req, _res, next) => {
    const key = req.ip;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, n: 1 });
      return next();
    }
    entry.n += 1;
    if (entry.n > max) return next(tooMany('Demasiados intentos. Probá de nuevo en unos minutos.'));
    return next();
  };
}

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Ruta no encontrada.'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: 'JSON mal formado.' } });
  }
  console.error(err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Error interno del servidor.', ...(config.isProd ? {} : { details: String(err?.message || err) }) },
  });
}
