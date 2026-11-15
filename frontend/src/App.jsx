import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Planner from './pages/Planner.jsx';
import Session from './pages/Session.jsx';
import Stats from './pages/Stats.jsx';
import Settings from './pages/Settings.jsx';

function Private({ children }) {
  const { user } = useAuth();
  if (user === undefined) return <div className="boot"><img src="/brand/isotipo-blanco.png" alt="" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/registro" element={user ? <Navigate to="/" replace /> : <Login registro />} />
      <Route path="/" element={<Private><Planner /></Private>} />
      <Route path="/sesion/:id" element={<Private><Session /></Private>} />
      <Route path="/datos" element={<Private><Stats /></Private>} />
      <Route path="/ajustes" element={<Private><Settings /></Private>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
