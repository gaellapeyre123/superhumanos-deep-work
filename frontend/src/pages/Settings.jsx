import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const TABS = [
  ['general', 'General'], ['tipos', 'Tipos de tarea'], ['plantillas', 'Plantillas'],
  ['metricas', 'Métricas'], ['banco', 'Banco periodizado'], ['estado', 'Estado'],
];
const TEMAS = { C: 'Concentración', A: 'Apalancamiento', E: 'Energía', S: 'Estrés', SI: 'Sistemas', O: 'Output' };

function useFlash() {
  const [msg, setMsg] = useState(null);
  const show = (m) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };
  return [msg, show];
}

function General() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ ...user });
  const [msg, flash] = useFlash();
  const [error, setError] = useState(null);
  const set = (k, num) => (e) => setF({ ...f, [k]: num ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value });
  async function save(e) {
    e.preventDefault();
    setError(null);
    try {
      const keys = ['nombre', 'timezone', 'work_min', 'break_min', 'valor_hora', 'moneda', 'min_por_distraccion', 'objetivo_semanal', 'modo_cierre'];
      const r = await api.patch('/settings', Object.fromEntries(keys.map((k) => [k, f[k]])));
      setUser(r.user);
      flash('Guardado ✓');
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="panel stack" onSubmit={save}>
      <label>Nombre<input value={f.nombre} onChange={set('nombre')} /></label>
      <div className="grid2">
        <label>Trabajo por defecto (min)<input type="number" min="1" max="600" value={f.work_min} onChange={set('work_min', true)} /></label>
        <label>Descanso por defecto (min)<input type="number" min="0" max="120" value={f.break_min} onChange={set('break_min', true)} /></label>
        <label>Valor de tu hora<input type="number" min="0" step="1" value={f.valor_hora} onChange={set('valor_hora', true)} /></label>
        <label>Moneda<input value={f.moneda} maxLength={8} onChange={set('moneda')} /></label>
        <label>Minutos perdidos por distracción sin medir<input type="number" min="0" max="60" value={f.min_por_distraccion} onChange={set('min_por_distraccion', true)} />
          <span className="muted small">Estimación tuya, no un dato científico. Con «Volví» se mide la duración real.</span></label>
        <label>Objetivo semanal (sesiones)<input type="number" min="1" max="84" value={f.objetivo_semanal} onChange={set('objetivo_semanal', true)} />
          <span className="muted small">Define la racha semanal.</span></label>
        <label>Zona horaria<input value={f.timezone} onChange={set('timezone')} /></label>
      </div>
      <div className="field">
        <span className="label">Modo de cierre</span>
        <div className="choice">
          <button type="button" className={f.modo_cierre === 'simple' ? 'on' : ''} onClick={() => setF({ ...f, modo_cierre: 'simple' })}>Simple</button>
          <button type="button" className={f.modo_cierre === 'periodizado' ? 'on' : ''} onClick={() => setF({ ...f, modo_cierre: 'periodizado' })}>Periodizado (avanzado)</button>
        </div>
        <span className="muted small">
          {f.modo_cierre === 'simple'
            ? 'Simple: al cerrar cargás tus métricas (por defecto, distracciones y energía).'
            : 'Periodizado: en cada cierre se sortean 6 preguntas Sí/No, una por tema (Concentración, Apalancamiento, Energía, Estrés, Sistemas y Output), que rotan para no volverse automáticas.'}
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn primary">{msg || 'Guardar'}</button>
    </form>
  );
}

function Types() {
  const [types, setTypes] = useState([]);
  const [nuevo, setNuevo] = useState({ nombre: '', color: '#777777' });
  const [error, setError] = useState(null);
  const load = () => api.get('/types').then((r) => setTypes(r.types));
  useEffect(() => { load(); }, []);
  const run = async (fn) => { setError(null); try { await fn(); } catch (e) { setError(e.message); } load(); };
  return (
    <div className="panel">
      <p className="muted small">Por defecto: Deep Work, Shallow Work y Creative Work. Podés renombrarlos, cambiarles el color o crear otros. Un tipo en uso no se borra: se archiva.</p>
      <ul className="edit-list">
        {types.map((t) => (
          <li key={t.id} className={t.archivado ? 'archived' : ''}>
            <input type="color" defaultValue={t.color} aria-label="Color" onBlur={(e) => e.target.value !== t.color && run(() => api.patch(`/types/${t.id}`, { color: e.target.value }))} />
            <input defaultValue={t.nombre} aria-label="Nombre" onBlur={(e) => e.target.value.trim() && e.target.value !== t.nombre && run(() => api.patch(`/types/${t.id}`, { nombre: e.target.value }))} />
            {t.archivado
              ? <button className="link" onClick={() => run(() => api.patch(`/types/${t.id}`, { archivado: false }))}>Restaurar</button>
              : <button className="link muted" onClick={() => run(() => api.del(`/types/${t.id}`))}>Borrar</button>}
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (nuevo.nombre.trim()) run(async () => { await api.post('/types', nuevo); setNuevo({ nombre: '', color: '#777777' }); }); }}>
        <input type="color" value={nuevo.color} onChange={(e) => setNuevo({ ...nuevo, color: e.target.value })} aria-label="Color" />
        <input placeholder="Nuevo tipo…" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <button className="btn small">Agregar</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function TemplateEditor({ tpl, types, onSaved, onDelete }) {
  const [f, setF] = useState({ nombre: tpl.nombre, work_min: tpl.work_min, break_min: tpl.break_min, type_id: tpl.type_id ?? '', items: tpl.items.map((i) => i.texto).join('\n') });
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);
  async function save(e) {
    e.preventDefault();
    setError(null);
    const body = {
      nombre: f.nombre, work_min: Number(f.work_min), break_min: Number(f.break_min),
      type_id: f.type_id ? Number(f.type_id) : null,
      items: f.items.split('\n').map((s) => s.trim()).filter(Boolean),
    };
    try {
      if (tpl.id) await api.patch(`/templates/${tpl.id}`, body); else await api.post('/templates', body);
      setOk(true); setTimeout(() => setOk(false), 1500);
      onSaved();
    } catch (err) { setError(err.message); }
  }
  return (
    <form className="panel stack" onSubmit={save}>
      <div className="grid2">
        <label>Nombre<input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required /></label>
        <label>Tipo por defecto
          <select value={f.type_id} onChange={(e) => setF({ ...f, type_id: e.target.value })}>
            <option value="">—</option>
            {types.filter((t) => !t.archivado).map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </label>
        <label>Trabajo (min)<input type="number" min="1" max="600" value={f.work_min} onChange={(e) => setF({ ...f, work_min: e.target.value })} /></label>
        <label>Descanso (min)<input type="number" min="0" max="120" value={f.break_min} onChange={(e) => setF({ ...f, break_min: e.target.value })} /></label>
      </div>
      <label>Ritual previo (un paso por línea)
        <textarea rows={6} value={f.items} onChange={(e) => setF({ ...f, items: e.target.value })} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn primary small">{ok ? 'Guardada ✓' : tpl.id ? 'Guardar plantilla' : 'Crear plantilla'}</button>
        {tpl.id && <button type="button" className="link muted" onClick={onDelete}>Borrar</button>}
      </div>
    </form>
  );
}

function Templates() {
  const [list, setList] = useState(null);
  const [types, setTypes] = useState([]);
  const [msg, setMsg] = useState(null);
  const load = () => Promise.all([api.get('/templates'), api.get('/types')]).then(([a, b]) => { setList(a.templates); setTypes(b.types); });
  useEffect(() => { load(); }, []);
  if (!list) return null;
  return (
    <div className="stack">
      <p className="muted small">Una plantilla define la duración y el ritual previo. Al crear una sesión se copia su checklist: editar la plantilla no cambia sesiones pasadas.</p>
      {list.map((t) => (
        <TemplateEditor key={t.id} tpl={t} types={types} onSaved={load}
          onDelete={async () => { const r = await api.del(`/templates/${t.id}`); setMsg(r.archivada ? `«${t.nombre}» se usó en sesiones: quedó archivada.` : null); load(); }} />
      ))}
      {msg && <p className="muted small">{msg}</p>}
      <h3 className="h3">Nueva plantilla</h3>
      <TemplateEditor key={`new-${list.length}`} tpl={{ nombre: '', work_min: 90, break_min: 20, type_id: null, items: [] }} types={types} onSaved={load} />
    </div>
  );
}

function Metrics() {
  const [list, setList] = useState([]);
  const [nuevo, setNuevo] = useState({ nombre: '', tipo: 'escala' });
  const [error, setError] = useState(null);
  const load = () => api.get('/metrics').then((r) => setList(r.metrics));
  useEffect(() => { load(); }, []);
  const run = async (fn) => { setError(null); try { await fn(); } catch (e) { setError(e.message); } load(); };
  const tipos = { escala: 'Escala 1–10', sino: 'Sí / No', numero: 'Número', texto: 'Texto' };
  return (
    <div className="panel">
      <p className="muted small">Se cargan en el cierre simple. «Distracciones» se completa sola con los toques del botón durante la sesión.</p>
      <ul className="edit-list">
        {list.map((m) => (
          <li key={m.id} className={m.activa ? '' : 'archived'}>
            <input defaultValue={m.nombre} aria-label="Nombre" onBlur={(e) => e.target.value.trim() && e.target.value !== m.nombre && run(() => api.patch(`/metrics/${m.id}`, { nombre: e.target.value }))} />
            <span className="muted small">{tipos[m.tipo]}{m.clave ? ' · por defecto' : ''}</span>
            <label className="switch"><input type="checkbox" checked={m.activa} onChange={(e) => run(() => api.patch(`/metrics/${m.id}`, { activa: e.target.checked }))} /> activa</label>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (nuevo.nombre.trim()) run(async () => { await api.post('/metrics', nuevo); setNuevo({ nombre: '', tipo: 'escala' }); }); }}>
        <input placeholder="Nueva métrica (ej. Claridad)" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
        <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}>
          {Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn small">Agregar</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Bank() {
  const [list, setList] = useState(null);
  const [tema, setTema] = useState('C');
  const load = () => api.get('/bank').then((r) => setList(r.questions));
  useEffect(() => { load(); }, []);
  if (!list) return null;
  const mine = list.filter((q) => q.tema === tema);
  const activas = mine.filter((q) => q.activa).length;
  return (
    <div className="panel">
      <p className="muted small">Banco del cierre periodizado. Las preguntas atadas a un ritual personal (mantra, lápiz, aceite, mentalización) vienen desactivadas. Una pregunta es candidata a graduación con 8 respuestas aplicables sin ningún problema.</p>
      <div className="tabs small">
        {Object.entries(TEMAS).map(([k, v]) => <button key={k} className={tema === k ? 'on' : ''} onClick={() => setTema(k)}>{v}</button>)}
      </div>
      <p className="muted small">{activas} activas · el ciclo se reinicia a las {Math.ceil((2 * activas) / 3)} preguntas distintas.</p>
      <ul className="bank-list">
        {mine.map((q) => (
          <li key={q.id} className={q.activa ? '' : 'archived'}>
            <label className="switch"><input type="checkbox" checked={q.activa} onChange={async (e) => { await api.patch(`/bank/${q.id}`, { activa: e.target.checked }); load(); }} /></label>
            <span className="badge">{q.id}</span>
            <span className="bank-text">{q.texto}<span className="muted small"> · {q.subvariable} · {q.modo}</span></span>
            <span className="bank-stats muted small">{q.stats.problemas}/{q.stats.aplicables}{q.candidata_graduacion && <span className="badge warn">graduación</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StateTab() {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  async function exportar() {
    const data = await api.get('/state/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `estado-deep-work-${data.exportado.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importar(e) {
    setError(null);
    setMsg(null);
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const r = await api.post('/state/import', data);
      setMsg(`Estado importado: ${r.cierres_totales} cierres, ${r.banco_activas.length} preguntas activas.`);
    } catch (err) {
      setError(err instanceof SyntaxError ? 'El archivo no es un JSON válido.' : err.message);
    }
    e.target.value = '';
  }
  return (
    <div className="panel stack">
      <p className="muted small">El estado es un bloque compacto con todo lo necesario para retomar el cierre periodizado: IDs usados por tema en el ciclo, último modo por tema, conteos por pregunta, cierres totales, fecha del último cierre, ajuste pendiente y tus ajustes.</p>
      <div className="row">
        <button className="btn" onClick={exportar}>Exportar estado</button>
        <button className="btn ghost" onClick={() => fileRef.current.click()}>Importar estado…</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importar} />
      </div>
      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('general');
  return (
    <div className="settings-page">
      <p className="indice">Ajustes</p>
      <h1 className="h1">Tu sistema</h1>
      <div className="tabs">
        {TABS.map(([k, v]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v}</button>)}
      </div>
      {tab === 'general' && <General />}
      {tab === 'tipos' && <Types />}
      {tab === 'plantillas' && <Templates />}
      {tab === 'metricas' && <Metrics />}
      {tab === 'banco' && <Bank />}
      {tab === 'estado' && <StateTab />}
    </div>
  );
}
