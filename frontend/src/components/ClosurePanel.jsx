import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtMin } from '../lib.js';

function Choice({ value, onChange, options, disabled, name }) {
  return (
    <div className="choice" role="radiogroup" aria-label={name}>
      {options.map(([v, label]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v} disabled={disabled}
          className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

function MetricInput({ m, value, onChange }) {
  if (m.tipo === 'escala') {
    return (
      <div className="scale" role="radiogroup" aria-label={m.nombre}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button type="button" key={n} className={String(value) === String(n) ? 'on' : ''} aria-checked={String(value) === String(n)} role="radio" onClick={() => onChange(String(n))}>{n}</button>
        ))}
      </div>
    );
  }
  if (m.tipo === 'sino') return <Choice name={m.nombre} value={value} onChange={onChange} options={[['si', 'Sí'], ['no', 'No']]} />;
  if (m.tipo === 'numero') return <input type="number" className="num" value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={m.nombre} />;
  return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} aria-label={m.nombre} />;
}

/** Campos comunes a los dos modos de cierre. */
function CommonFields({ detail, state, set, showMetrics }) {
  return (
    <>
      <div className="field">
        <span className="label">¿Se completó la sesión?</span>
        <Choice name="Sesión completada" value={state.sesion_completada} onChange={(v) => set({ sesion_completada: v })} options={[[true, 'Sí'], [false, 'No']]} />
      </div>
      {detail.task && (
        <div className="field">
          <span className="label">¿Y la tarea «{detail.task.titulo}»?</span>
          <Choice name="Tarea completada" value={state.tarea_completada} onChange={(v) => set({ tarea_completada: v })} options={[['si', 'Completa'], ['parcial', 'Parcial'], ['no', 'No']]} />
          <span className="muted small">La sesión se puede completar aunque la tarea no.</span>
        </div>
      )}
      {detail.objectives.length > 0 && (
        <div className="field">
          <span className="label">Objetivos clave logrados</span>
          <ul className="checklist">
            {detail.objectives.map((o) => (
              <li key={o.id}><label className={state.objetivos[o.id] ? 'done' : ''}>
                <input type="checkbox" checked={!!state.objetivos[o.id]} onChange={(e) => set({ objetivos: { ...state.objetivos, [o.id]: e.target.checked } })} />
                <span>{o.texto}</span>
              </label></li>
            ))}
          </ul>
        </div>
      )}
      {showMetrics && detail.metrics.map((m) => (
        <div className="field" key={m.id}>
          <span className="label">{m.nombre}{m.tipo === 'escala' ? ' (1–10)' : ''}</span>
          <MetricInput m={m} value={state.metricas[m.id]} onChange={(v) => set({ metricas: { ...state.metricas, [m.id]: v } })} />
        </div>
      ))}
      <label className="field">Resumen de la sesión
        <textarea rows={3} value={state.resumen} onChange={(e) => set({ resumen: e.target.value })} placeholder="Qué salió, qué quedó, qué aprendiste." />
      </label>
    </>
  );
}

function commonPayload(detail, st) {
  return {
    sesion_completada: st.sesion_completada,
    tarea_completada: detail.task ? st.tarea_completada : null,
    resumen: st.resumen || null,
    objetivos: detail.objectives.map((o) => ({ id: o.id, logrado: !!st.objetivos[o.id] })),
    ajuste: st.ajuste || null,
  };
}

function initialState(detail) {
  const metricas = { ...detail.metric_values };
  const distr = detail.metrics.find((m) => m.clave === 'distracciones');
  if (distr && metricas[distr.id] == null) metricas[distr.id] = String(detail.distractions.length);
  return {
    sesion_completada: null, tarea_completada: null, resumen: '', objetivos: {}, metricas, ajuste: '', por_que: '',
  };
}

// ── Modo simple ───────────────────────────────────────────────
function SimpleClosure({ detail, onDone }) {
  const [st, setSt] = useState(() => initialState(detail));
  const [error, setError] = useState(null);
  const set = (p) => setSt((x) => ({ ...x, ...p }));
  async function submit(e) {
    e.preventDefault();
    if (st.sesion_completada == null) return setError('Indicá si completaste la sesión.');
    if (detail.task && !st.tarea_completada) return setError('Indicá si completaste la tarea.');
    try {
      await api.post(`/sessions/${detail.session.id}/close`, {
        ...commonPayload(detail, st),
        metricas: detail.metrics.map((m) => ({ metric_id: m.id, valor: st.metricas[m.id] ?? null })),
      });
      onDone();
    } catch (err) { setError(err.message); }
    return undefined;
  }
  return (
    <form className="panel closure" onSubmit={submit}>
      <div className="panel-head"><h2>Cierre</h2></div>
      <CommonFields detail={detail} state={st} set={set} showMetrics />
      <label className="field">Ajuste para el próximo post-it (opcional)
        <input value={st.ajuste} onChange={(e) => set({ ajuste: e.target.value })} placeholder="Ej: dejar el celular en otra habitación" />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary">Confirmar cierre</button>
    </form>
  );
}

// ── Modo periodizado ──────────────────────────────────────────
function PeriodizedClosure({ detail, onDone }) {
  const [c, setC] = useState(null);
  const [st, setSt] = useState(() => initialState(detail));
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState(null);
  const set = (p) => setSt((x) => ({ ...x, ...p }));

  useEffect(() => {
    api.post('/closures', { session_id: detail.session.id }).then((r) => {
      setC(r);
      setAnswers(Object.fromEntries(r.preguntas.map((p) => [p.item_id, { respuesta: p.respuesta, dato: p.dato }])));
    }).catch((e) => setError(e.message));
  }, [detail.session.id]);

  async function answer(p, respuesta, dato) {
    setAnswers((a) => ({ ...a, [p.item_id]: { respuesta, dato } }));
    // Se guarda al instante: recargar no pierde lo respondido ni vuelve a sortear.
    api.put(`/closures/${c.closure.id}/items/${p.item_id}`, { respuesta, dato: dato || null }).catch(() => {});
  }

  async function submit(e) {
    e.preventDefault();
    if (st.sesion_completada == null) return setError('Indicá si completaste la sesión.');
    if (detail.task && !st.tarea_completada) return setError('Indicá si completaste la tarea.');
    const pending = c.preguntas.filter((p) => !p.sin_pregunta && !p.na_automatico && (() => {
      const a = answers[p.item_id] || {};
      return p.requiere ? !(a.respuesta === 'na' || a.dato?.estimado_min) : !a.respuesta;
    })());
    if (pending.length) return setError(`Falta responder la pregunta ${pending[0].numero}: elegí Sí, No o N/A.`);
    try {
      const r = await api.post(`/closures/${c.closure.id}/confirm`, {
        ...commonPayload(detail, st),
        por_que: st.por_que || null,
        respuestas: c.preguntas.filter((p) => !p.sin_pregunta && !p.na_automatico).map((p) => {
          const a = answers[p.item_id] || {};
          return p.requiere && a.respuesta !== 'na' ? { item_id: p.item_id, dato: a.dato } : { item_id: p.item_id, respuesta: a.respuesta };
        }),
      });
      setC(r);
      onDone();
    } catch (err) { setError(err.message); }
    return undefined;
  }

  if (!c) return <div className="panel">{error ? <p className="error">{error}</p> : 'Sorteando las preguntas…'}</div>;
  if (c.result) return <PeriodizedResult c={c} detail={detail} />;
  return (
    <form className="panel closure" onSubmit={submit}>
      <div className="panel-head"><h2>{c.titulo}</h2><span className="muted small">{c.closure.fecha_local} · sesión {c.closure.sesion_del_dia} del día</span></div>
      {c.closure.avisos?.map((a) => <p key={a} className="warn-box">{a}</p>)}
      <ol className="questions">
        {c.preguntas.map((p) => {
          const a = answers[p.item_id] || {};
          return (
            <li key={p.item_id} className="question">
              <p>{p.texto}</p>
              {p.sin_pregunta ? null : p.na_automatico ? (
                <span className="badge">N/A · primera sesión del día</span>
              ) : p.requiere ? (
                <div className="row">
                  <input type="number" min="1" max="600" className="num" placeholder="min" aria-label="Minutos estimados a ciegas"
                    value={a.respuesta === 'na' ? '' : a.dato?.estimado_min ?? ''}
                    onChange={(e) => answer(p, null, e.target.value ? { estimado_min: Number(e.target.value) } : null)} />
                  <span className="muted small">minutos (sin mirar el timer)</span>
                  <Choice name="N/A" value={a.respuesta} onChange={() => answer(p, 'na', null)} options={[['na', 'N/A']]} />
                </div>
              ) : (
                <Choice name={`Pregunta ${p.numero}`} value={a.respuesta} onChange={(v) => answer(p, v)} options={[['si', 'Sí'], ['no', 'No'], ['na', 'N/A']]} />
              )}
            </li>
          );
        })}
      </ol>
      <CommonFields detail={detail} state={st} set={set} showMetrics={false} />
      <label className="field">POR QUÉ (opcional)
        <textarea rows={2} value={st.por_que} onChange={(e) => set({ por_que: e.target.value })} placeholder="Una línea sobre lo que marcó problema." />
      </label>
      <label className="field">Ajuste para el próximo post-it (opcional)
        <input value={st.ajuste} onChange={(e) => set({ ajuste: e.target.value })} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary">Confirmar cierre</button>
    </form>
  );
}

function PeriodizedResult({ c, detail }) {
  const r = c.result;
  return (
    <section className="panel closure-result">
      <div className="panel-head"><h2>{c.titulo}</h2><span className="muted small">{c.closure.fecha_local}</span></div>
      <ul className="result-lines">
        {r.lineas.map((l) => (
          <li key={l.tema} className={l.marca === '✗' ? 'bad' : l.marca === '✓' ? 'good' : 'na'}>
            <span className="mark">{l.marca}</span> {l.nombre}
          </li>
        ))}
      </ul>
      {r.hechos_problematicos && <p className="facts">Hechos reportados: {r.hechos_problematicos}</p>}
      {r.ratio != null && (
        <p className={r.ratio_fuera_de_rango ? 'facts warn' : 'facts'}>
          Real / estimado: <strong>{String(r.ratio).replace('.', ',')}</strong>
          {r.ratio_fuera_de_rango ? ' — fuera de 0,8–1,25' : ' — dentro de 0,8–1,25'}
          {' '}({fmtMin(detail.session.real_min)} reales)
        </p>
      )}
      {r.ajuste && <p className="facts">Ajuste para el próximo post-it: <strong>{r.ajuste}</strong></p>}
    </section>
  );
}

function SimpleResult({ detail }) {
  const s = detail.session;
  const est = s.postit_estimado_min || detail.task?.estimado_min;
  const ratio = est && s.real_min != null ? Math.round((s.real_min / est) * 100) / 100 : null;
  return (
    <section className="panel closure-result">
      <div className="panel-head"><h2>Cierre</h2></div>
      <dl className="kv">
        <dt>Sesión</dt><dd>{s.sesion_completada ? 'Completada' : 'No completada'}</dd>
        {detail.task && <><dt>Tarea</dt><dd>{{ si: 'Completa', parcial: 'Parcial', no: 'No' }[s.tarea_completada] || '—'}</dd></>}
        <dt>Tiempo real</dt><dd>{fmtMin(s.real_min)} <span className="muted">/ {s.work_min_plan} planificados</span></dd>
        {ratio != null && <><dt>Real / estimado</dt><dd className={ratio < 0.8 || ratio > 1.25 ? 'warn' : ''}>{String(ratio).replace('.', ',')}</dd></>}
        {detail.metrics.map((m) => (
          <span key={m.id} className="kv-pair"><dt>{m.nombre}</dt><dd>{detail.metric_values[m.id] ?? '—'}</dd></span>
        ))}
        {s.resumen && <><dt>Resumen</dt><dd>{s.resumen}</dd></>}
      </dl>
      {detail.objectives.length > 0 && (
        <ul className="checklist">{detail.objectives.map((o) => <li key={o.id} className={o.logrado ? 'done' : ''}>{o.logrado ? '✓' : '·'} {o.texto}</li>)}</ul>
      )}
    </section>
  );
}

export default function ClosurePanel({ detail, onDone }) {
  const closed = detail.session.estado === 'cerrada';
  const periodized = detail.closure ? true : detail.modo_cierre === 'periodizado';
  if (closed && !detail.closure) return <SimpleResult detail={detail} />;
  if (periodized) return <PeriodizedClosure detail={detail} onDone={onDone} />;
  return <SimpleClosure detail={detail} onDone={onDone} />;
}
