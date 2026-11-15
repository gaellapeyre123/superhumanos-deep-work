import { z } from 'zod';

const id = z.coerce.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha con formato YYYY-MM-DD');
const minutes = z.number().int().min(1).max(600);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal (#RRGGBB)');

export const params = {
  id: z.object({ id }),
  idItem: z.object({ id, itemId: id }),
  idObjective: z.object({ id, objectiveId: id }),
  idQuestion: z.object({ id: z.string().regex(/^(C|A|E|S|SI|O)\d{2}$/) }),
};

export const auth = {
  register: z.object({
    nombre: z.string().trim().min(1, 'Ingresá tu nombre').max(120),
    email: z.string().trim().email('Email inválido').max(190),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
    timezone: z.string().max(64).optional(),
  }),
  login: z.object({ email: z.string().trim().email(), password: z.string().min(1).max(200) }),
};

export const settings = z.object({
  nombre: z.string().trim().min(1).max(120),
  timezone: z.string().max(64).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Zona horaria inválida'),
  work_min: minutes,
  break_min: z.number().int().min(0).max(120),
  valor_hora: z.number().min(0).max(1_000_000),
  moneda: z.string().trim().min(1).max(8),
  min_por_distraccion: z.number().int().min(0).max(60),
  objetivo_semanal: z.number().int().min(1).max(84),
  modo_cierre: z.enum(['simple', 'periodizado']),
}).partial().strict();

export const types = {
  create: z.object({ nombre: z.string().trim().min(1).max(60), color: color.optional() }),
  update: z.object({ nombre: z.string().trim().min(1).max(60), color, archivado: z.boolean() }).partial().strict(),
};

export const tasks = {
  query: z.object({ estado: z.enum(['pendiente', 'completada', 'archivada']).optional() }),
  create: z.object({
    titulo: z.string().trim().min(1, 'La tarea necesita un título').max(200),
    notas: z.string().max(5000).nullish(),
    type_id: id.nullish(),
    estimado_min: z.number().int().min(1).max(10000).nullish(),
  }),
  update: z.object({
    titulo: z.string().trim().min(1).max(200),
    notas: z.string().max(5000).nullable(),
    type_id: id.nullable(),
    estimado_min: z.number().int().min(1).max(10000).nullable(),
    estado: z.enum(['pendiente', 'completada', 'archivada']),
  }).partial().strict(),
};

export const templates = {
  create: z.object({
    nombre: z.string().trim().min(1).max(80),
    work_min: minutes,
    break_min: z.number().int().min(0).max(120),
    type_id: id.nullish(),
    items: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  }),
  update: z.object({
    nombre: z.string().trim().min(1).max(80),
    work_min: minutes,
    break_min: z.number().int().min(0).max(120),
    type_id: id.nullable(),
    items: z.array(z.string().trim().min(1).max(200)).max(30),
  }).partial().strict(),
};

export const metrics = {
  create: z.object({ nombre: z.string().trim().min(1).max(60), tipo: z.enum(['escala', 'sino', 'numero', 'texto']) }),
  update: z.object({
    nombre: z.string().trim().min(1).max(60),
    tipo: z.enum(['escala', 'sino', 'numero', 'texto']),
    activa: z.boolean(),
    posicion: z.number().int().min(0).max(1000),
  }).partial().strict(),
};

export const sessions = {
  week: z.object({ start: fecha.optional() }),
  create: z.object({ fecha, template_id: id.nullish(), cantidad: z.number().int().min(1).max(12).default(1) }),
  update: z.object({ fecha, template_id: id.nullable(), work_min_plan: minutes, break_min_plan: z.number().int().min(0).max(120) }).partial().strict(),
  assign: z.object({ task_id: id, from_session_id: id.nullish() }),
  postit: z.object({
    objetivo: z.string().trim().max(1000).nullish(),
    estimado_min: z.number().int().min(1).max(600).nullish(),
  }),
  checklist: z.object({ hecho: z.boolean() }),
  objective: z.object({ texto: z.string().trim().min(1).max(300) }),
  objectiveUpdate: z.object({ texto: z.string().trim().min(1).max(300), logrado: z.boolean() }).partial().strict(),
  distraction: z.object({ nota: z.string().trim().max(300).nullish() }),
  distractionUpdate: z.object({ nota: z.string().trim().max(300).nullable(), volvio: z.boolean() }).partial().strict(),
};

const commonClose = {
  sesion_completada: z.boolean({ required_error: 'Indicá si completaste la sesión' }),
  tarea_completada: z.enum(['si', 'no', 'parcial']).nullish(),
  resumen: z.string().max(5000).nullish(),
  objetivos: z.array(z.object({ id, logrado: z.boolean() })).default([]),
  metricas: z.array(z.object({ metric_id: id, valor: z.union([z.string().max(500), z.number(), z.boolean()]).nullable() })).default([]),
  ajuste: z.string().max(1000).nullish(),
};

export const closures = {
  simple: z.object(commonClose),
  open: z.object({ session_id: id }),
  answer: z.object({
    respuesta: z.enum(['si', 'no', 'na']).nullable(),
    dato: z.object({ estimado_min: z.number().min(1).max(600) }).nullish(),
  }),
  confirm: z.object({
    ...commonClose,
    respuestas: z.array(z.object({
      item_id: id,
      respuesta: z.enum(['si', 'no', 'na']).nullish(),
      dato: z.object({ estimado_min: z.number().min(1).max(600) }).nullish(),
    })).default([]),
    por_que: z.string().max(2000).nullish(),
  }),
};

export const bank = { update: z.object({ activa: z.boolean() }).strict() };
export const weekQuery = z.object({ start: fecha.optional() });
