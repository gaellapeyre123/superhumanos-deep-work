import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { addDays, fmtDay, fmtMin, fmtMoney, MESES } from '../lib.js';

function level(min) {
  if (!min) return 0;
  if (min < 60) return 1;
  if (min < 120) return 2;
  if (min < 180) return 3;
  return 4;
}

/** Mapa estilo GitHub: columnas = semanas, filas = lunes a domingo. */
function Heatmap({ data }) {
  const [hover, setHover] = useState(null);
  const weeks = useMemo(() => {
    const first = data.dias[0].fecha;
    const pad = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
    const cells = [...Array(pad).fill(null), ...data.dias];
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [data]);
  const monthLabels = weeks.map((w, i) => {
    const d = w.find(Boolean);
    if (!d) return '';
    const m = Number(d.fecha.slice(5, 7)) - 1;
    const prev = i > 0 ? weeks[i - 1].find(Boolean) : null;
    return !prev || Number(prev.fecha.slice(5, 7)) - 1 !== m ? MESES[m] : '';
  });
  const total = data.dias.reduce((a, d) => a + d.cerradas, 0);
  const activos = data.dias.filter((d) => d.cerradas > 0).length;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Constancia · últimos 12 meses</h2>
        <span className="muted small">{total} sesiones · {activos} días con Deep Work</span>
      </div>
      <div className="heatmap-wrap">
        <div className="heatmap" role="img" aria-label={`${total} sesiones cerradas en los últimos 12 meses`}>
          <div className="hm-months">{monthLabels.map((m, i) => <span key={i}>{m}</span>)}</div>
          <div className="hm-grid">
            {weeks.map((w, i) => (
              <div className="hm-col" key={i}>
                {w.map((d, j) => d ? (
                  <span key={d.fecha} className={`hm-cell l${level(d.minutos)}${d.agendadas && !d.cerradas ? ' missed' : ''}`}
                    onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} />
                ) : <span key={`p${j}`} className="hm-cell empty" />)}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="hm-foot">
        <span className="muted small">{hover ? `${fmtDay(hover.fecha)}: ${hover.cerradas} sesiones · ${fmtMin(hover.minutos)}${hover.agendadas ? ` · ${hover.agendadas} agendadas` : ''}` : 'Pasá el mouse por un día para ver el detalle.'}</span>
        <span className="hm-legend">menos {[0, 1, 2, 3, 4].map((l) => <span key={l} className={`hm-cell l${l}`} />)} más</span>
      </div>
      <div className="months-bars">
        {data.meses.map((m) => (
          <div key={m.mes} className="mbar" title={`${m.cerradas}/${m.agendadas} sesiones`}>
            <div className="mbar-track"><div className="mbar-fill" style={{ height: `${m.constancia ?? 0}%` }} /></div>
            <span className="mbar-v">{m.constancia == null ? '—' : `${m.constancia}%`}</span>
            <span className="mbar-l">{MESES[Number(m.mes.slice(5, 7)) - 1]}</span>
          </div>
        ))}
      </div>
      <p className="muted small">Constancia mensual = sesiones cerradas / sesiones agendadas.</p>
    </section>
  );
}

function Stat({ n, label, sub, warn }) {
  return (
    <div className={`stat${warn ? ' warn' : ''}`}>
      <span className="stat-n">{n}</span>
      <span className="stat-l">{label}</span>
      {sub && <span className="stat-s">{sub}</span>}
    </div>
  );
}

export default function Stats() {
  const [hm, setHm] = useState(null);
  const [streaks, setStreaks] = useState(null);
  const [start, setStart] = useState(null);
  const [week, setWeek] = useState(null);
  const [cal, setCal] = useState(null);
  const [per, setPer] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/stats/heatmap'), api.get('/stats/streaks'), api.get('/stats/calibration')])
      .then(([h, s, c]) => { setHm(h); setStreaks(s); setCal(c); })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const q = start ? `?start=${start}` : '';
    Promise.all([api.get(`/stats/week${q}`), api.get(`/stats/periodized${q}`)])
      .then(([w, p]) => { setWeek(w); setPer(p); })
      .catch((e) => setError(e.message));
  }, [start]);

  if (!hm || !week) return <div className="loading">{error || 'Calculando…'}</div>;
  const ratioWarn = week.ratio_promedio != null && (week.ratio_promedio < 0.8 || week.ratio_promedio > 1.25);
  const maxTipo = Math.max(1, ...week.por_tipo.map((t) => t.minutos));
  const showPer = per && (per.cierres_totales > 0);

  return (
    <div className="stats-page">
      <p className="indice">Datos</p>
      <h1 className="h1">Tu entrenamiento, <span className="glow">medido</span>.</h1>

      <div className="streaks">
        <Stat n={streaks.diaria.actual} label="días de racha" sub={`mejor: ${streaks.diaria.mejor}`} />
        <Stat n={streaks.semanal.actual} label="semanas de racha" sub={`objetivo: ${streaks.semanal.objetivo ?? '—'} sesiones / semana · mejor: ${streaks.semanal.mejor}`} />
      </div>
      <p className="muted small">Un día sin sesiones agendadas es descanso planificado: no corta la racha. Un día con sesiones agendadas y ninguna cerrada, sí.</p>

      <Heatmap data={hm} />

      <section className="panel">
        <div className="panel-head">
          <h2>Resumen semanal · {fmtDay(week.monday)} – {fmtDay(week.sunday)}</h2>
          <div className="week-nav">
            <button className="btn ghost small" onClick={() => setStart(addDays(week.monday, -7))} aria-label="Semana anterior">←</button>
            <button className="btn ghost small" onClick={() => setStart(null)}>Esta</button>
            <button className="btn ghost small" onClick={() => setStart(addDays(week.monday, 7))} aria-label="Semana siguiente">→</button>
          </div>
        </div>
        <div className="stat-grid">
          <Stat n={fmtMin(week.minutos.reales)} label="de Deep Work real" sub={`planificado: ${fmtMin(week.minutos.planificados)}`} />
          <Stat n={`${week.sesiones.cerradas}/${week.sesiones.agendadas}`} label="sesiones cerradas" sub={`${week.sesiones.sin_tarea} agendadas sin tarea`} />
          <Stat n={week.tareas_completadas} label="tareas completadas" sub={`${week.sesiones.tarea_completada} sesiones con la tarea terminada`} />
          <Stat n={week.ratio_promedio == null ? '—' : String(week.ratio_promedio).replace('.', ',')} label="real / estimado" sub={`${week.ratio_n} sesiones con estimado · rango 0,8–1,25`} warn={ratioWarn} />
          <Stat n={week.distracciones.total} label="distracciones" sub={week.distracciones.por_hora != null ? `${String(week.distracciones.por_hora).replace('.', ',')} por hora de foco` : null} />
          {week.metricas.filter((m) => m.tipo === 'escala').map((m) => (
            <Stat key={m.id} n={m.promedio == null ? '—' : String(m.promedio).replace('.', ',')} label={`${m.nombre} promedio`} sub={`${m.n} registros`} />
          ))}
          <Stat n={fmtMoney(week.dinero.valor_invertido, week.dinero.moneda)} label="valor de tus horas de foco" sub={week.dinero.valor_hora ? `a ${fmtMoney(week.dinero.valor_hora, week.dinero.moneda)} la hora` : 'Configurá el valor de tu hora en Ajustes'} />
          <Stat n={fmtMoney(week.dinero.costo_distracciones, week.dinero.moneda)} label="costo estimado de distracciones" sub={`${fmtMin(week.distracciones.minutos_perdidos)} perdidos (${week.distracciones.sin_medir} sin medir × ${week.dinero.min_por_distraccion} min)`} warn={week.dinero.costo_distracciones > 0} />
        </div>
        {week.por_tipo.length > 0 && (
          <div className="bars">
            <span className="label">Minutos por tipo</span>
            {week.por_tipo.map((t) => (
              <div key={t.nombre} className="bar-row">
                <span className="bar-l">{t.nombre}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(t.minutos / maxTipo) * 100}%` }} /></div>
                <span className="bar-v">{fmtMin(t.minutos)}</span>
              </div>
            ))}
          </div>
        )}
        {week.metricas.filter((m) => m.tipo !== 'escala').length > 0 && (
          <ul className="metric-list">
            {week.metricas.filter((m) => m.tipo !== 'escala').map((m) => (
              <li key={m.id}><strong>{m.nombre}:</strong> {m.tipo === 'numero' ? (m.promedio ?? '—') + ' promedio' : m.tipo === 'sino' ? `${m.si ?? 0} «sí» de ${m.n}` : `${m.n} registros`}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Calibrador de estimaciones</h2><span className="muted small">real / estimado · ideal 0,8–1,25</span></div>
        <table className="table">
          <thead><tr><th>Tipo</th><th>Sesiones</th><th>Ratio</th></tr></thead>
          <tbody>
            <tr><td><strong>General</strong></td><td>{cal.general.n}</td><td>{cal.general.ratio == null ? 'sin datos suficientes' : `${String(cal.general.ratio).replace('.', ',')}×`}</td></tr>
            {cal.por_tipo.map((t) => (
              <tr key={t.nombre}><td>{t.nombre}</td><td>{t.n}</td>
                <td className={t.ratio != null && (t.ratio < 0.8 || t.ratio > 1.25) ? 'warn' : ''}>{t.ratio == null ? 'sin datos suficientes' : `${String(t.ratio).replace('.', ',')}×`}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Si tus tareas de un tipo tardan 1,4× lo que estimás, el post-it te lo recuerda la próxima vez.</p>
      </section>

      {showPer && (
        <section className="panel">
          <div className="panel-head"><h2>Cierre periodizado · semana</h2><span className="muted small">{per.cierres_totales} cierres en total · último: {per.ultimo_cierre || '—'}</span></div>
          <table className="table">
            <thead><tr><th>Tema</th><th>Problemas / aplicables</th><th>%</th></tr></thead>
            <tbody>
              {per.temas.map((t) => (
                <tr key={t.tema}><td>{t.nombre}</td>
                  <td>{t.aplicables ? `${t.problemas} / ${t.aplicables}` : 'sin datos'}</td>
                  <td>{t.porcentaje == null ? '—' : `${t.porcentaje} %`}</td></tr>
              ))}
            </tbody>
          </table>
          {per.graduacion.length > 0 && (
            <>
              <h3 className="h3">Candidatas a graduación</h3>
              <p className="muted small">Ocho respuestas aplicables sin marcar nunca un problema. No se retiran solas: decidí en Ajustes → Banco si la reescribís o la desactivás.</p>
              <ul className="grad-list">{per.graduacion.map((g) => <li key={g.id}><span className="badge">{g.id}</span> {g.texto}</li>)}</ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
