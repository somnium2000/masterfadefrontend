import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext.jsx';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [nombreUsuario, setNombreUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [remember, setRemember] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ✅ Si vienes del correo de Supabase con "#access_token=...&type=recovery"
  // te mandamos a /reset-password conservando el hash.
  useEffect(() => {
    const h = location.hash || '';
    if (h.includes('type=recovery') && h.includes('access_token=')) {
      navigate(`/reset-password${h}`, { replace: true });
    }
  }, [location.hash, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');

    const user = nombreUsuario.trim();
    const pass = contrasena.trim();

    if (!user || !pass) {
      setError('Por favor ingresa usuario y contraseña.');
      return;
    }

    setLoading(true);
    const result = await login(user, pass, remember);
    setLoading(false);

    if (!result.ok) {
      setError(result.message || 'No se pudo iniciar sesión.');
      return;
    }

    navigate('/home', { replace: true });
  }

  return (
    <div className="mf-login-page">
      <div className="mf-login-container">
        <div className="mf-login-logo" aria-hidden="true">
          <span className="mf-login-logo-badge">B</span>
        </div>

        <div className="mf-login-card">
          <div className="mf-login-card-header">
            <h1 className="mf-login-title">Login</h1>
          </div>

          <form className="mf-login-form" onSubmit={onSubmit}>
            <div className="mf-form-group">
              <label className="mf-label" htmlFor="nombre_usuario">
                E-Mail Address
              </label>
              <input
                id="nombre_usuario"
                className="mf-input"
                type="text"
                autoComplete="username"
                value={nombreUsuario}
                onChange={(e) => setNombreUsuario(e.target.value)}
                placeholder="super_admin"
              />
            </div>

            <div className="mf-form-group">
              <div className="mf-row-between">
                <label className="mf-label" htmlFor="contrasena">
                  Password
                </label>

                {/* ✅ Link real */}
                <Link className="mf-link" to="/forgot-password">
                  Forgot Password?
                </Link>
              </div>

              <input
                id="contrasena"
                className="mf-input"
                type="password"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error ? <div className="mf-error">{error}</div> : null}

            <div className="mf-actions">
              <label className="mf-checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember Me</span>
              </label>

              <button className="mf-btn" type="submit" disabled={loading}>
                {loading ? 'Cargando…' : 'Login'}
              </button>
            </div>

            <div className="mf-login-footer">
              <span>Don&apos;t have an account? </span>
              <a className="mf-link" href="#" onClick={(e) => e.preventDefault()}>
                Create One
              </a>
            </div>
          </form>
        </div>

        <div className="mf-login-copy">Copyright © 2017-2021 — Your Company</div>
      </div>
    </div>
  );
}