import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const notifications = useNotifications();

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = location.hash || '';
    if (hash.includes('type=recovery') && hash.includes('access_token=')) {
      navigate(`/reset-password${hash}`, { replace: true });
    }
  }, [location.hash, navigate]);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');

    // AM: Fase 1 usa correo como identificador oficial de login.
    const user = correo.trim().toLowerCase();
    const pass = contrasena.trim();

    if (!user || !pass) {
      const message = 'Por favor ingresa correo y contrasena.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-login-required-fields' });
      return;
    }

    if (!user.includes('@')) {
      const message = 'Ingresa un correo valido.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-login-invalid-email' });
      return;
    }

    setLoading(true);
    const result = await login(user, pass, remember);
    setLoading(false);

    if (!result.ok) {
      const message = result.message || 'No se pudo iniciar sesion.';
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-login-error' });
      return;
    }

    notifications.success('Sesion iniciada correctamente.', { dedupeKey: 'auth-login-ok' });
    navigate('/home', { replace: true });
  }

  return (
    <div className="mf-login-page mf-page-gradient">
      <div className="mf-login-shell mf-mobile-frame mf-screen-pad mf-safe-top">
        <div className="mf-login-topbar">
          <Link className="mf-login-back" to="/">
            <ArrowLeft size={16} strokeWidth={1.9} />
            <span>Volver al inicio</span>
          </Link>
          <ThemeSwitcher />
        </div>

        <div className="mf-login-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.15, ease: 'easeOut' }}
            className="mf-login-brand"
          >
            <MasterfadeLogo variant="compact" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: 'easeOut' }}
            className="mf-login-card mf-glass-surface"
          >
            <div className="mf-login-card-header">
              <p className="mf-login-kicker">Acceso premium</p>
              <h1 className="mf-login-title">Iniciar sesion</h1>
              <p className="mf-login-subtitle">
                Ingresa con tu correo y contrasena para continuar a tu experiencia MASTERFADE.
              </p>
            </div>

            <form className="mf-login-form" onSubmit={onSubmit}>
              <div className="mf-form-group">
                <label className="mf-label" htmlFor="correo_login">
                  Correo
                </label>
                <input
                  id="correo_login"
                  className="mf-input"
                  type="email"
                  autoComplete="email"
                  value={correo}
                  onChange={(event) => setCorreo(event.target.value)}
                  placeholder="admin@masterfade.hn"
                />
              </div>

              <div className="mf-form-group">
                <div className="mf-row-between">
                  <label className="mf-label" htmlFor="contrasena">
                    Contrasena
                  </label>

                  <Link className="mf-link" to="/forgot-password">
                    Olvidaste tu contrasena?
                  </Link>
                </div>

                <input
                  id="contrasena"
                  className="mf-input"
                  type="password"
                  autoComplete="current-password"
                  value={contrasena}
                  onChange={(event) => setContrasena(event.target.value)}
                  placeholder="********"
                />
              </div>

              {error ? <div className="mf-error">{error}</div> : null}

              <div className="mf-actions">
                <label className="mf-checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                  />
                  <span>Recordarme</span>
                </label>

                <button className="mf-btn" type="submit" disabled={loading}>
                  {loading ? 'Cargando...' : 'Entrar'}
                </button>
              </div>

              <div className="mf-login-footer">
                <span>El acceso te llevara directamente a tu panel en /home.</span>
                <Link className="mf-link" to="/">
                  Ir al landing
                </Link>
              </div>
            </form>
          </motion.div>

          <div className="mf-login-copy">MASTERFADE · Honduras</div>
        </div>
      </div>
    </div>
  );
}
