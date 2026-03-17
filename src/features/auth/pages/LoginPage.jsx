import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import './LoginPage.css';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSafeNextPath(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value.startsWith('/')) return '';
  if (value.startsWith('//')) return '';
  return value;
}

function normalizeBranchId(rawBranchId) {
  const value = String(rawBranchId || '').trim();
  return UUID_REGEX.test(value) ? value : '';
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const notifications = useNotifications();

  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const nextPath = useMemo(() => getSafeNextPath(queryParams.get('next')), [queryParams]);
  const intent = useMemo(() => String(queryParams.get('intent') || '').trim().toLowerCase(), [queryParams]);
  const branchId = useMemo(() => normalizeBranchId(queryParams.get('id_sucursal')), [queryParams]);
  const planId = useMemo(() => String(queryParams.get('id_plan') || '').trim(), [queryParams]);

  const registerHref = useMemo(() => {
    const params = new URLSearchParams();
    // AM: Conserva intencion de retorno cuando se abre login desde seleccion de plan.
    if (nextPath) params.set('next', nextPath);
    if (intent) params.set('intent', intent);
    if (branchId) params.set('id_sucursal', branchId);
    if (planId) params.set('id_plan', planId);
    const query = params.toString();
    return query ? `/register?${query}` : '/register';
  }, [nextPath, intent, branchId, planId]);

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
    navigate(nextPath || '/home', { replace: true });
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
              {intent === 'seleccionar_plan' ? (
                <div className="mf-login-intent-note">
                  <CheckCircle2 size={14} strokeWidth={1.8} />
                  <span>Inicia sesion o registrate para continuar con tu plan VIP.</span>
                </div>
              ) : null}
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

              <div className="mf-register-inline">
                <span>No tienes cuenta?</span>
                <Link className="mf-link" to={registerHref}>
                  Registrarte
                </Link>
              </div>

            </form>
          </motion.div>

          <div className="mf-login-copy">MASTERFADE - Honduras</div>
        </div>
      </div>
    </div>
  );
}
