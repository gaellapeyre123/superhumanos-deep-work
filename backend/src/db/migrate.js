import { createDb } from './knex.js';

const db = createDb();
const [batch, files] = await db.migrate.latest();
console.log(files.length ? `Lote ${batch}: ${files.join(', ')}` : 'No hay migraciones pendientes.');
await db.destroy();
