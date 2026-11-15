import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import { api } from '../api.js';
import { addDays, DIAS, ESTADOS, fmtDay, fmtMin } from '../lib.js';

function TaskCard({ task, type, dragging, moved }) {
  return (
    <div className={`task-card${dragging ? ' dragging' : ''}`}>
      <span className="dot" style={{ background: type?.color || '#666' }} />
      <div className="task-main">
        <span className="task-title">{task.titulo}</span>
        <span className="task-meta">
          {type?.nombre || 'Sin tipo'}{task.estimado_min ? ` · ${fmtMin(task.estimado_min)}` : ''}
          {moved >= 3 && <span className="badge warn" title="Se movió de sesión varias veces">movida {moved}×</span>}
        </span>
      </div>
    </div>
  );
}

function DraggableTask({ task, type }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task-${task.id}`, data: { task_id: task.id } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="draggable" style={{ opacity: isDragging ? 0.35 : 1 }}>
      <TaskCard task={task} type={type} moved={task.veces_movida} />
    </div>
  );
}

function SessionSlot({ session, typeById, onOpen, onUnassign, onDelete, index }) {
  const locked = ['cerrada', 'omitida'].includes(session.estado);
  const { setNodeRef, isOver } = useDroppable({ id: `session-${session.id}`, disabled: locked, data: { session_id: session.id } });
  const drag = useDraggable({
    id: `stask-${session.id}`,
    disabled: !session.task || locked,
    data: { task_id: session.task?.id, from_session_id: session.id },
  });
  const type = session.task ? typeById[session.task.type_id] : null;
  const state = session.estado;
  const cls = [
    'slot',
    session.task ? 'has-task' : 'no-task',
    `st-${state}`,
    isOver ? 'over' : '',
  ].join(' ');
  return (
    <div ref={setNodeRef} className={cls}>
      <div className="slot-head">
        <span className="slot-n">S{index + 1}</span>
        <span className="slot-state">{state === 'planificada' ? (session.task ? 'Con tarea' : 'Sin tarea') : ESTADOS[state]}</span>
        <span className="slot-plan">{session.work_min_plan}/{session.break_min_plan}</span>
      </div>
      {session.task ? (
        <div ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} className="slot-task" style={{ opacity: drag.isDragging ? 0.35 : 1 }}>
          <span className="dot" style={{ background: type?.color || '#666' }} />
          <span className="slot-task-title">{session.task.titulo}</span>
        </div>
      ) : (
        <div className="slot-empty">{locked ? '—' : 'Arrastrá una tarea acá'}</div>
      )}
      {state === 'cerrada' && <div className="slot-done">✓ {fmtMin(session.real_min)}</div>}
      <div className="slot-actions">
        {state !== 'omitida' && (
          <button className="link" onClick={() => onOpen(session)}>
            {state === 'planificada' ? 'Abrir' : state === 'cerrada' ? 'Ver' : 'Ir al timer'}
          </button>
        )}
        {session.task && !locked && <button className="link muted" onClick={() => onUnassign(session)} aria-label="Quitar tarea">Quitar tarea</button>}
        {(state === 'planificada' || state === 'omitida') && (
          <button className="link muted" onClick={() => onDelete(session)} aria-label="Borrar sesión">Borrar</button>
        )}
      </div>
    </div>
  );
}

function DayColumn({ day, idx, isToday, isPast, typeById, templateId, onAdd, ...handlers }) {
  return (
    <section className={`day${isToday ? ' today' : ''}${isPast ? ' past' : ''}`}>
      <header className="day-head">
        <span className="day-name">{DIAS[idx]}</span>
        <span className="day-date">{fmtDay(day.fecha)}</span>
      </header>
      <div className="day-body">
        {day.sessions.map((s, i) => (
          <SessionSlot key={s.id} session={s} index={i} typeById={typeById} {...handlers} />
        ))}
        <button className="add-slot" onClick={() => onAdd(day.fecha, templateId)}>+ sesión</button>
      </div>
    </section>
  );
}

function TaskPanel({ tasks, types, onCreate }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'panel' });
  const [titulo, setTitulo] = useState('');
  const [typeId, setTypeId] = useState('');
  const [est, setEst] = useState('');
  const typeById = Object.fromEntries(types.map((t) => [t.id, t]));
  const active = types.filter((t) => !t.archivado);
  async function submit(e) {
    e.preventDefault();
    if (!titulo.trim()) return;
    await onCreate({ titulo, type_id: typeId ? Number(typeId) : active[0]?.id ?? null, estimado_min: est ? Number(est) : null });
    setTitulo('');
    setEst('');
  }
  return (
    <aside ref={setNodeRef} className={`panel tasks-panel${isOver ? ' over' : ''}`}>
      <div className="panel-head">
        <h2>Tareas</h2>
        <span className="muted small">{tasks.length} pendientes</span>
      </div>
      <form onSubmit={submit} className="task-form">
        <input placeholder="Nueva tarea…" value={titulo} onChange={(e) => setTitulo(e.target.value)} aria-label="Título de la tarea" />
        <div className="row">
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Tipo">
            {active.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <input type="number" min="1" placeholder="min" value={est} onChange={(e) => setEst(e.target.value)} aria-label="Minutos estimados" className="num" />
          <button className="btn small">Agregar</button>
        </div>
      </form>
      <div className="task-list">
        {tasks.length === 0 && <p className="muted small">Sin tareas pendientes. Creá una y arrastrala a una sesión.</p>}
        {tasks.map((t) => <DraggableTask key={t.id} task={t} type={typeById[t.type_id]} />)}
      </div>
      <p className="muted small hint">Soltá una tarea acá para sacarla de su sesión.</p>
    </aside>
  );
}

export default function Planner() {
  const navigate = useNavigate();
  const [start, setStart] = useState(null);
  const [week, setWeek] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [types, setTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [dragData, setDragData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [w, t, ty, tp] = await Promise.all([
        api.get(`/week${start ? `?start=${start}` : ''}`),
        api.get('/tasks?estado=pendiente'),
        api.get('/types'),
        api.get('/templates'),
      ]);
      setWeek(w);
      setTasks(t.tasks);
      setTypes(ty.types);
      setTemplates(tp.templates);
      setTemplateId((cur) => cur || String(tp.templates[0]?.id || ''));
    } catch (e) {
      setError(e.message);
    }
  }, [start]);

  useEffect(() => { load(); }, [load]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])), [types]);
  const allTasks = useMemo(() => {
    const map = Object.fromEntries(tasks.map((t) => [t.id, t]));
    week?.days.forEach((d) => d.sessions.forEach((s) => { if (s.task) map[s.task.id] = s.task; }));
    return map;
  }, [tasks, week]);

  const run = async (fn) => {
    setError(null);
    try { await fn(); } catch (e) { setError(e.message); }
    await load();
  };

  async function onDragEnd({ active, over }) {
    setDragData(null);
    if (!over) return;
    const data = active.data.current;
    if (over.id === 'panel') {
      if (data.from_session_id) await run(() => api.del(`/sessions/${data.from_session_id}/task`));
      return;
    }
    const sessionId = over.data.current.session_id;
    if (sessionId === data.from_session_id) return;
    await run(() => api.put(`/sessions/${sessionId}/task`, { task_id: data.task_id, from_session_id: data.from_session_id || null }));
  }

  const handlers = {
    onOpen: (s) => navigate(`/sesion/${s.id}`),
    onUnassign: (s) => run(() => api.del(`/sessions/${s.id}/task`)),
    onDelete: (s) => run(() => api.del(`/sessions/${s.id}`)),
    onAdd: (fecha, tpl) => run(() => api.post('/sessions', { fecha, template_id: tpl ? Number(tpl) : null })),
  };

  if (!week) return <div className="loading">{error || 'Cargando la semana…'}</div>;
  const c = week.counts;
  return (
    <DndContext sensors={sensors} onDragStart={({ active }) => setDragData(active.data.current)} onDragEnd={onDragEnd} onDragCancel={() => setDragData(null)}>
      <div className="planner-head">
        <div>
          <p className="indice">Semana</p>
          <h1 className="h1">Del {fmtDay(week.monday)} al {fmtDay(addDays(week.monday, 6))}</h1>
        </div>
        <div className="week-nav">
          <button className="btn ghost small" onClick={() => setStart(addDays(week.monday, -7))} aria-label="Semana anterior">←</button>
          <button className="btn ghost small" onClick={() => setStart(null)}>Hoy</button>
          <button className="btn ghost small" onClick={() => setStart(addDays(week.monday, 7))} aria-label="Semana siguiente">→</button>
        </div>
      </div>
      <div className="counters">
        <div className="counter"><span className="n">{c.agendadas}</span><span>agendadas</span></div>
        <div className="counter solid"><span className="n">{c.con_tarea}</span><span>con tarea</span></div>
        <div className="counter dashed"><span className="n">{c.sin_tarea}</span><span>sin tarea</span></div>
        <div className="counter"><span className="n">{c.cerradas}</span><span>cerradas</span></div>
        <label className="tpl-pick">Plantilla para nuevas sesiones
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="planner">
        <TaskPanel tasks={tasks} types={types} onCreate={(d) => run(() => api.post('/tasks', d))} />
        <div className="week-grid">
          {week.days.map((day, idx) => (
            <DayColumn key={day.fecha} day={day} idx={idx} isToday={day.fecha === week.today} isPast={day.fecha < week.today}
              typeById={typeById} templateId={templateId} {...handlers} />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>
        {dragData?.task_id && allTasks[dragData.task_id] ? (
          <TaskCard task={allTasks[dragData.task_id]} type={typeById[allTasks[dragData.task_id].type_id]} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
