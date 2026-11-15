import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

// Carpeta de datos persistente, fuera del código desplegado (no se pisa en cada deploy).
const dataDir = env.DATA_DIR || path.join(os.homedir(), 'deepwork-data');

/**
 * Secreto de las sesiones. Si no viene por variable de entorno, en producción se genera uno
 * aleatorio la primera vez y se guarda en la carpeta de datos: así ningún secreto vive en el
 * código ni hace falta copiarlo a mano en el panel del hosting.
 */
function resolveJwtSecret() {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (!isProd) return 'dev-secret-no-usar-en-produccion';
  const file = path.join(dataDir, 'jwt-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  mkdirSync(dataDir, { recursive: true });
  const secret = randomBytes(48).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const config = {
  env: env.NODE_ENV || 'development',
  isProd,
  port: Number(env.PORT) || 3001,
  dataDir,
  jwtSecret: resolveJwtSecret(),
  corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  cookieDomain: env.COOKIE_DOMAIN || undefined,
  db: {
    client: env.DB_CLIENT || 'sqlite',
    sqliteFile: env.SQLITE_FILE || (isProd ? path.join(dataDir, 'deepwork.sqlite3') : './dev.sqlite3'),
    host: env.DB_HOST,
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
};

if (config.db.client !== 'mysql') {
  const dir = path.dirname(path.resolve(config.db.sqliteFile));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
