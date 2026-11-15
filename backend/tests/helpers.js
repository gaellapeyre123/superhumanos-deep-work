import request from 'supertest';
import { createDb } from '../src/db/knex.js';
import { createApp } from '../src/app.js';

/** App + base SQLite en memoria, migrada, aislada por test. */
export async function setup() {
  const db = createDb({ client: 'sqlite', filename: ':memory:' });
  await db.migrate.latest();
  const app = createApp(db);
  return { db, app, api: request(app) };
}

let counter = 0;
/** Registra un usuario y devuelve un cliente con el header de auth ya puesto. */
export async function user(api, extra = {}) {
  counter += 1;
  const res = await api.post('/api/auth/register').send({
    nombre: 'Test', email: `u${counter}-${Date.now()}@test.com`, password: 'password123', ...extra,
  });
  if (res.status !== 201) throw new Error(`register falló: ${res.status} ${JSON.stringify(res.body)}`);
  const auth = { Authorization: `Bearer ${res.body.token}` };
  const call = (method) => (url, body) => {
    const r = api[method](url).set(auth);
    return body === undefined ? r : r.send(body);
  };
  return { id: res.body.user.id, get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), del: call('delete') };
}
