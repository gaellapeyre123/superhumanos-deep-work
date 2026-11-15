import knexFactory from 'knex';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const migrationsDir = path.join(here, 'migrations');

/** Crea una instancia de Knex. `override` permite usar SQLite en memoria en los tests. */
export function createDb(override) {
  const db = override?.client || config.db.client;
  if (db === 'sqlite' || db === 'better-sqlite3') {
    return knexFactory({
      client: 'better-sqlite3',
      connection: { filename: override?.filename ?? config.db.sqliteFile },
      useNullAsDefault: true,
      migrations: { directory: migrationsDir, loadExtensions: ['.js'] },
      pool: {
        afterCreate: (conn, done) => {
          conn.pragma('foreign_keys = ON');
          done();
        },
      },
    });
  }
  return knexFactory({
    client: 'mysql2',
    connection: {
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: 'utf8mb4',
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: true,
    },
    pool: { min: 0, max: 5 },
    migrations: { directory: migrationsDir, loadExtensions: ['.js'] },
  });
}
