import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ESTADOS } from '../lib.js';

/** Fondo de la marca: retícula fija + brillo que sigue al cursor (se apaga con reduced-motion y en touch). */
function Backdrop() {
  const glow = useRef(null);
  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || still) return undefined;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let raf;
    const move = (e) => { tx = e.clientX; ty = e.clientY; };
    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      if (glow.current) glow.current.style.transform = `translate3d(${x - 300}px, ${y - 300}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', move, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-grid" />
      <div className="backdrop-glow" ref={glow} />
    </div>
  );
}

function ActiveBanner() {
  const [active, setActive] = useState(null);
  const location = useLocation();
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/active').then((r) => alive && setActive(r.session)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [location.pathname]);
  if (!active || location.pathname === `/sesion/${active.id}`) return null;
  return (
    <Link to={`/sesion/${active.id}`} className="active-banner">
      <span className="pulse" /> {ESTADOS[active.estado]}: {active.task?.titulo || 'sesión sin tarea'} <span className="arrow">→ volver al timer</span>
    </Link>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <>
      <Backdrop />
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Inicio">
          <img src="/brand/isotipo-blanco.png" alt="" width="28" height="28" />
          <span className="brand-name">SuperHumanos</span>
          <span className="brand-sub">Deep Work</span>
        </Link>
        <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menú">
          <span /><span />
        </button>
        <nav className={open ? 'nav open' : 'nav'}>
          <NavLink to="/" end>Semana</NavLink>
          <NavLink to="/datos">Datos</NavLink>
          <NavLink to="/ajustes">Ajustes</NavLink>
          <button className="link" onClick={logout} title={user?.email}>Salir</button>
        </nav>
      </header>
      <ActiveBanner />
      <main className="page">{children}</main>
    </>
  );
}
