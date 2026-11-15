import 'dotenv/config';

const env = process.env;

export const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 3001,
  jwtSecret: env.JWT_SECRET || (env.NODE_ENV === 'production' ? null : 'dev-secret-no-usar-en-produccion'),
  corsOrigins: (env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  cookieDomain: env.COOKIE_DOMAIN || undefined,
  db: {
    client: env.DB_CLIENT || 'sqlite',
    sqliteFile: env.SQLITE_FILE || './dev.sqlite3',
    host: env.DB_HOST,
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  },
};

if (!config.jwtSecret) {
  throw new Error('Falta JWT_SECRET en las variables de entorno.');
}
