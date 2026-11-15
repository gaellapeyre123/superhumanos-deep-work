import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { buildRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middlewares/index.js';

/** Crea la app de Express. Recibe la instancia de Knex para poder testear con SQLite en memoria. */
export function createApp(db) {
  const app = express();
  app.locals.db = db;
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((_, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
    next();
  });
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/', (_req, res) => res.json({ servicio: 'SuperHumanos · Deep Work API', docs: '/api/health' }));
  app.use('/api', buildRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
