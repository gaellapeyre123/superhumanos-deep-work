import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { beep, ESTADOS, fmtClock, fmtDay, fmtMin, notify } from '../lib.js';
import ClosurePanel from '../components/ClosurePanel.jsx';

// ── Timer ─────────────────────────────────────────────────────
function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Timer({ s, offset, onAction, busy, hideWork }) {
  const running = ['trabajando', 'pausada', 'descansando'].includes(s.estado);
  const now = useNow(running) + offset;
  const planWork = s.work_min_plan * 60000;
  const planBreak = s.break_min_plan * 60000;
  let phase = 'Trabajo';
  let elapsed = 0;
  let plan = planWork;
  if (s.estado === 'trabajando' || s.estado === 'pausada') {
    const end = s.estado === 'pausada' ? s.pause_started_at : now;
    elapsed = end - s.started_at - s.paused_ms;
  } else if (s.estado === 'descansando' || s.estado === 'descanso_terminado') {
    phase = 'Descanso';
    plan = planBreak;
    elapsed = (s.break_ended_at || now) - s.break_started_at;
  } else if (s.work_ended_at) {
    elapsed = s.work_ended_at - s.started_at - s.paused_ms;
  }
  // Con el trabajo terminado se muestra lo trabajado (no lo que faltaba).
  const finishedWork = !running && phase === 'Trabajo' && Boolean(s.work_ended_at);
  const over = !finishedWork && elapsed > plan;
  const shown = finishedWork ? elapsed : over ? elapsed - plan : plan - elapsed;
  const pct = Math.min(1, plan ? elapsed / plan : 0);

  // Aviso único al llegar al tiempo planificado: no cambia de fase (spec R8).
  const notified = useRef({});
  useEffect(() => {
    const key = `${phase}-${s.id}`;
    if (running && s.estado !== 'pausada' && over && !notified.current[key]) {
      notified.current[key] = true;
      beep();
      notify(phase === 'Trabajo' ? 'Terminó el tiempo de trabajo' : 'Terminó el descanso',
        phase === 'Trabajo' ? 'Cuando quieras, terminá el trabajo y empezá el descanso.' : 'Cuando quieras, volvé.');
    }
  }, [over, running, phase, s.id, s.estado]);

  useEffect(() => {
    if (!running) { document.title = 'Deep Work · SuperHumanos'; return undefined; }
    document.title = `${over ? '+' : ''}${fmtClock(shown)} · ${phase}`;
    return () => { document.title = 'Deep Work · SuperHumanos'; };
  }, [shown, over, phase, running]);

  const R = 120;
  const C = 2 * Math.PI * R;
  return (
    <div className={`timer${over ? ' over' : ''}${s.estado === 'pausada' ? ' paused' : ''}`}>
      <div className="timer-ring">
        <svg viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r={R} className="ring-bg" />
          <circle cx="140" cy="140" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
        </svg>
        <div className="timer-center">
          <span className="timer-phase">{s.estado === 'planificada' ? 'Listo para empezar' : ESTADOS[s.estado]}</span>
          {hideWork && phase === 'Trabajo' ? (
            <span className="timer-clock hidden-clock" title="Se muestra después del cierre, para no sesgar la estimación a ciegas">oculto</span>
          ) : (
            <span className="timer-clock" aria-live="off">{over ? '+' : ''}{fmtClock(s.estado === 'planificada' ? planWork : shown)}</span>
          )}
          <span className="timer-sub">
            {hideWork && phase === 'Trabajo' ? 'tiempo oculto hasta cerrar' : finishedWork ? `trabajados de ${s.work_min_plan} min planificados` : over ? 'tiempo extra' : s.estado === 'planificada' ? `${s.work_min_plan} min de trabajo · ${s.break_min_plan} de descanso` : `de ${phase === 'Trabajo' ? s.work_min_plan : s.break_min_plan} min`}
          </span>
        </div>
      </div>
      <div className="timer-actions">
        {s.estado === 'planificada' && <button className="btn primary big glow-btn" disabled={busy} onClick={() => onAction('start')}>Empezar</button>}
        {s.estado === 'trabajando' && <>
          <button className="btn ghost" disabled={busy} onClick={() => onAction('pause')}>Pausar</button>
          <button className="btn primary" disabled={busy} onClick={() => onAction('end-work')}>Terminar trabajo</button>
        </>}
        {s.estado === 'pausada' && <>
          <button className="btn primary" disabled={busy} onClick={() => onAction('resume')}>Reanudar</button>
          <button className="btn ghost" disabled={busy} onClick={() => onAction('end-work')}>Terminar trabajo</button>
        </>}
        {s.estado === 'trabajo_terminado' && <button className="btn ghost" disabled={busy} onClick={() => onAction('start-break')}>Empezar descanso</button>}
        {s.estado === 'descansando' && <button className="btn ghost" disabled={busy} onClick={() => onAction('end-break')}>Terminar descanso</button>}
      </div>
    </div>
  );
}

// ── Distracciones ─────────────────────────────────────────────
function Distractions({ s, list, onAdd, onUpdate }) {
  const canAdd = ['trabajando', 'pausada'].includes(s.estado);
  useEffect(() => {
    if (!canAdd) return undefined;
    const key = (e) => {
      if (e.key.toLowerCase() === 'd' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) onAdd();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [canAdd, onAdd]);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Distracciones</h2>
        <span className="big-n">{list.length}</span>
      </div>
      {canAdd && (
        <button className="btn distraction" onClick={onAdd} title="Atajo: tecla D">
          Me distraje <kbd>D</kbd>
        </button>
      )}
      <ul className="distr-list">
        {list.map((d) => (
          <li key={d.id}>
            <span className="distr-min">min {Math.round(d.minuto)}</span>
            <input defaultValue={d.nota || ''} placeholder="¿Qué fue?" aria-label="Nota de la distracción"
              onBlur={(e) => e.target.value !== (d.nota || '') && onUpdate(d.id, { nota: e.target.value })} />
            {d.duracion_s == null
              ? (canAdd && <button className="btn small ghost" onClick={() => onUpdate(d.id, { volvio: true })}>Volví</button>)
              : <span className="muted small">{Math.max(1, Math.round(d.duracion_s / 60))} min</span>}
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="muted small">Un toque registra la distracción con su minuto. «Volví» mide cuánto duró.</p>}
    </section>
  );
}

// ── Preparación ───────────────────────────────────────────────
function Prep({ d, onReload, locked }) {
  const s = d.session;
  const [objetivo, setObjetivo] = useState(s.postit_objetivo || '');
  const [est, setEst] = useState(s.postit_estimado_min || '');
  const [saved, setSaved] = useState(false);
  const [newObj, setNewObj] = useState('');
  const cal = d.calibracion;
  const ratio = cal?.tipo?.ratio ?? cal?.general?.ratio;
  const ratioN = cal?.tipo?.ratio != null ? cal.tipo.n : cal?.general?.n;

  async function savePostit(e) {
    e.preventDefault();
    await api.put(`/sessions/${s.id}/postit`, { objetivo: objetivo || null, estimado_min: est ? Number(est) : null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onReload();
  }
  const done = d.checklist.filter((i) => i.hecho).length;
  return (
    <div className="prep">
      <section className="panel">
        <div className="panel-head">
          <h2>Ritual previo</h2>
          <span className="muted small">{done}/{d.checklist.length}</span>
        </div>
        <ul className="checklist">
          {d.checklist.map((i) => (
            <li key={i.id}>
              <label className={i.hecho ? 'done' : ''}>
                <input type="checkbox" checked={i.hecho} disabled={locked}
                  onChange={async (e) => { await api.put(`/sessions/${s.id}/checklist/${i.id}`, { hecho: e.target.checked }); onReload(); }} />
                <span>{i.texto}</span>
              </label>
            </li>
          ))}
        </ul>
        {d.checklist.length === 0 && <p className="muted small">Esta sesión no tiene ritual. Agregalo a la plantilla en Ajustes.</p>}
      </section>

      <section className="panel postit">
        <div className="panel-head"><h2>Post-it</h2></div>
        {d.ajuste_pendiente && <p className="ajuste">Ajuste del cierre anterior: <strong>{d.ajuste_pendiente}</strong></p>}
        {s.ajuste_mostrado && !d.ajuste_pendiente && <p className="ajuste muted">Ajuste entregado: {s.ajuste_mostrado}</p>}
        <form onSubmit={savePostit} className="stack">
          <label>Objetivo (terminado / no terminado)
            <textarea rows={2} value={objetivo} onChange={(e) => setObjetivo(e.target.value)} disabled={locked}
              placeholder="Ej: primera versión completa del guion, sin pulir" />
          </label>
          <label>Minutos estimados
            <input type="number" min="1" max="600" value={est} onChange={(e) => setEst(e.target.value)} disabled={locked} className="num" />
          </label>
          {ratio != null ? (
            <p className="calib">
              Calibrador: tus sesiones{cal?.tipo?.ratio != null ? ` de ${cal.tipo.nombre}` : ''} duran <strong>{String(ratio).replace('.', ',')}×</strong> lo estimado ({ratioN} datos).
              {est && <> Con ese ritmo, {est} min serían ≈ <strong>{Math.round(est * ratio)} min</strong>.</>}
            </p>
          ) : <p className="calib muted">Calibrador: con 3 sesiones cerradas con estimado empezás a ver tu ratio real/estimado.</p>}
          {!locked && <button className="btn small">{saved ? 'Guardado ✓' : 'Guardar post-it'}</button>}
        </form>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Objetivos clave</h2></div>
        <ul className="checklist">
          {d.objectives.map((o) => (
            <li key={o.id} className="obj-row">
              <span>{o.texto}</span>
              {!locked && <button className="link muted" onClick={async () => { await api.del(`/sessions/${s.id}/objectives/${o.id}`); onReload(); }} aria-label="Quitar objetivo">×</button>}
            </li>
          ))}
        </ul>
        {!locked && (
          <form className="row" onSubmit={async (e) => { e.preventDefault(); if (!newObj.trim()) return; await api.post(`/sessions/${s.id}/objectives`, { texto: newObj }); setNewObj(''); onReload(); }}>
            <input value={newObj} onChange={(e) => setNewObj(e.target.value)} placeholder="Agregar objetivo…" aria-label="Nuevo objetivo" />
            <button className="btn small">+</button>
          </form>
        )}
      </section>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────
export default function Session() {
  const { id } = useParams();
  const [d, setD] = useState(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const t0 = Date.now();
      const r = await api.get(`/sessions/${id}`);
      setOffset(r.server_now - Math.round((t0 + Date.now()) / 2));
      setD(r);
    } catch (e) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function action(name) {
    setBusy(true);
    setError(null);
    try {
      if (name === 'start' && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      const r = await api.post(`/sessions/${id}/${name}`);
      setD(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const addDistraction = useCallback(async () => {
    try { await api.post(`/sessions/${id}/distractions`, {}); load(); } catch (e) { setError(e.message); }
  }, [id, load]);
  const updateDistraction = async (did, patch) => { await api.patch(`/distractions/${did}`, patch); load(); };

  if (!d) return <div className="loading">{error || 'Cargando la sesión…'}</div>;
  const s = d.session;
  const locked = ['cerrada', 'omitida'].includes(s.estado);
  const closable = ['trabajo_terminado', 'descansando', 'descanso_terminado'].includes(s.estado);
  const working = ['trabajando', 'pausada'].includes(s.estado);

  return (
    <div className="session-page">
      <div className="session-head">
        <div>
          <p className="indice"><Link to="/">Semana</Link> · {fmtDay(s.fecha)} · {d.template?.nombre || 'Sesión'}</p>
          <h1 className="h1">Vamos a trabajar en <span className="glow">{d.task?.titulo || 'una sesión sin tarea'}</span></h1>
          {!d.task && s.estado === 'planificada' && <p className="muted small">Podés asignarle una tarea desde la semana (arrastrándola), o trabajar igual.</p>}
        </div>
        {s.estado === 'planificada' && <button className="link muted" onClick={() => action('skip')}>Omitir sesión</button>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <div className={`session-grid${working ? ' focus' : ''}`}>
        <div className="col-main">
          <Timer s={s} offset={offset} onAction={action} busy={busy}
            hideWork={closable && (d.modo_cierre === 'periodizado' || d.closure?.estado === 'borrador')} />
          {(working || d.distractions.length > 0) && (
            <Distractions s={s} list={d.distractions} onAdd={addDistraction} onUpdate={updateDistraction} />
          )}
        </div>
        <div className="col-side">
          {(closable || locked) ? (
            <ClosurePanel detail={d} onDone={load} />
          ) : (
            <Prep d={d} onReload={load} locked={locked} />
          )}
        </div>
      </div>
      {s.estado === 'cerrada' && (
        <div className="closed-strip">
          Sesión cerrada · real {fmtMin(s.real_min)} de {s.work_min_plan} min planificados
          {s.postit_estimado_min ? ` · estimado ${s.postit_estimado_min} min` : ''}
        </div>
      )}
    </div>
  );
}
