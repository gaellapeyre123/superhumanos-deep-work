import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const DEMO = { email: 'demo@superhumanos.app', password: 'superhumanos' };

export default function Login({ registro = false }) {
  const { login, register } = useAuth();
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e, override) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (registro && !override) await register(form);
      else await login((override || form).email, (override || form).password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="backdrop" aria-hidden="true"><div className="backdrop-grid" /></div>
      <div className="auth-card">
        <img src="/brand/isotipo-blanco.png" alt="" width="56" height="56" className="auth-logo" />
        <p className="indice">SuperHumanos · Deep Work</p>
        <h1 className="auth-title">{registro ? 'Creá tu cuenta' : <>Que cada hora <span className="glow">cuente el doble</span>.</>}</h1>
        <p className="muted">Planificá tus sesiones de foco, ejecutalas con un timer que respeta tu criterio y medí tu constancia.</p>
        <form onSubmit={submit} className="stack">
          {registro && (
            <label>Nombre<input value={form.nombre} onChange={set('nombre')} required autoComplete="name" /></label>
          )}
          <label>Email<input type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></label>
          <label>Contraseña
            <input type="password" value={form.password} onChange={set('password')} required minLength={registro ? 8 : 1}
              autoComplete={registro ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Un momento…' : registro ? 'Crear cuenta' : 'Entrar'}</button>
        </form>
        {!registro && (
          <button className="btn ghost wide" disabled={busy} onClick={() => submit(null, DEMO)}>Probar con la cuenta demo</button>
        )}
        <p className="muted small center">
          {registro ? <>¿Ya tenés cuenta? <Link to="/login">Entrá</Link></> : <>¿No tenés cuenta? <Link to="/registro">Registrate</Link></>}
        </p>
      </div>
    </div>
  );
}
