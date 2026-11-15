import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { usersRepo } from '../repositories/users.repo.js';
import { metricsRepo, templatesRepo, typesRepo } from '../repositories/catalog.repo.js';
import { bankRepo } from '../repositories/bank.repo.js';

const bankSeed = JSON.parse(readFileSync(new URL('../db/seeds/bank.json', import.meta.url), 'utf8'));

export const DEFAULT_TYPES = [
  { nombre: 'Deep Work', color: '#111111' },
  { nombre: 'Shallow Work', color: '#8a8a8a' },
  { nombre: 'Creative Work', color: '#4a4a4a' },
];

export const DEFAULT_RITUAL = [
  'Mesa despejada: solo lo que necesita la tarea',
  'Agua a mano',
  'Celular en otro ambiente o en modo avión',
  'Notificaciones de la computadora apagadas',
  'Post-it escrito: objetivo y minutos estimados',
  'Primer paso de la tarea definido',
];

/** Crea todo lo que un usuario nuevo necesita para arrancar (spec RF1). */
export async function provisionUser(trx, userId) {
  const typeIds = [];
  for (const t of DEFAULT_TYPES) typeIds.push(await typesRepo.create(trx, userId, t));
  await templatesRepo.create(trx, userId, {
    nombre: 'Deep Work 90/20', work_min: 90, break_min: 20, type_id: typeIds[0], items: DEFAULT_RITUAL,
  });
  await templatesRepo.create(trx, userId, {
    nombre: 'Bloque corto 50/10', work_min: 50, break_min: 10, type_id: typeIds[1], items: DEFAULT_RITUAL.slice(0, 4),
  });
  await metricsRepo.create(trx, userId, { nombre: 'Distracciones', tipo: 'numero', clave: 'distracciones', activa: true, posicion: 1 });
  await metricsRepo.create(trx, userId, { nombre: 'Energía', tipo: 'escala', clave: 'energia', activa: true, posicion: 2 });
  await bankRepo.insertMany(trx, bankSeed.preguntas.map((q) => ({
    user_id: userId,
    id: q.id,
    tema: q.tema,
    subvariable: q.sub,
    modo: q.modo,
    texto: q.texto,
    problema_si: q.problema_si,
    por_que: q.por_que || null,
    na_auto: q.na_auto || null,
    dato: q.dato || null,
    ritual: Boolean(q.ritual),
    activa: !q.ritual,
    origen: 'banco',
  })));
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: '30d' });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export async function register(db, { nombre, email, password, timezone }) {
  const normalized = email.trim().toLowerCase();
  if (await usersRepo.findByEmail(db, normalized)) throw conflict('Ya existe una cuenta con ese email.', 'EMAIL_TAKEN');
  const hash = await bcrypt.hash(password, 10);
  const userId = await db.transaction(async (trx) => {
    const id = await usersRepo.create(trx, {
      nombre: nombre.trim(),
      email: normalized,
      password_hash: hash,
      timezone: timezone || 'America/Argentina/Buenos_Aires',
      created_at: Date.now(),
    });
    await provisionUser(trx, id);
    return id;
  });
  return usersRepo.findById(db, userId);
}

export async function login(db, { email, password }) {
  const row = await usersRepo.findByEmail(db, email.trim().toLowerCase());
  const ok = row && (await bcrypt.compare(password, row.password_hash));
  if (!ok) throw unauthorized('Email o contraseña incorrectos.');
  return usersRepo.findById(db, row.id);
}
