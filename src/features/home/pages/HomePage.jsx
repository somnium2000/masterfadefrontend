import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div style={{ minHeight: '100vh', padding: 24 }}>
      <h1 style={{ margin: 0 }}>Bienvenido</h1>
      {user?.nombre_usuario ? (
        <p style={{ marginTop: 8, color: '#6b7280' }}>
          Sesión iniciada como <strong>{user.nombre_usuario}</strong>
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleLogout}
        style={{ marginTop: 16 }}
      >
        Cerrar sesión
      </button>
    </div>
  );
}