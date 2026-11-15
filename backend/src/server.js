import { config } from './config.js';
import { createDb } from './db/knex.js';
import { createApp } from './app.js';

const db = createDb();

// Aplica migraciones pendientes al arrancar: en hosting compartido no siempre hay consola.
await db.migrate.latest();

// En el primer arranque en producción se crea el usuario demo (para que se pueda probar sin registrarse).
if (process.env.SEED_DEMO === '1') {
  const { seedDemo } = await import('./db/seedDemo.js');
  const res = await seedDemo(db);
  if (res.creado) console.log('Usuario demo creado.');
}

const app = createApp(db);
app.listen(config.port, () => {
  console.log(`API escuchando en el puerto ${config.port} (${config.env}, DB: ${config.db.client})`);
});
