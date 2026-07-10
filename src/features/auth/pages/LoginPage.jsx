import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle2, Eye } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { consumeIdleSessionMessage, useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { supabase } from '../../../config/supabaseClient.js';
import AuthLandingBrandBlock from '../components/AuthLandingBrandBlock.jsx';
import './LoginPage.css';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTH_SESSION_LIMIT_REACHED_CODE = 'AUTH_SESSION_LIMIT_REACHED';
const AUTH_INVALID_CREDENTIALS_CODE = 'AUTH_INVALID_CREDENTIALS';
const AUTH_LOGIN_RATE_LIMITED_CODE = 'AUTH_LOGIN_RATE_LIMITED';
const AUTH_USER_TEMPORARILY_LOCKED_CODE = 'AUTH_USER_TEMPORARILY_LOCKED';

const SESSION_LIMIT_TITLE = 'Ya tienes una sesion activa';
const SESSION_LIMIT_MESSAGE =
  'Por seguridad, las cuentas de cliente solo pueden tener una sesion activa. Puedes cerrar la sesion anterior y continuar en este dispositivo.';
const GENERIC_LOGIN_ERROR = 'No fue posible iniciar sesion en este momento. Intenta nuevamente.';
const GENERIC_INVALID_CREDENTIALS = 'Credenciales invalidas o acceso no permitido.';
const GENERIC_LOCKED_LOGIN = 'No fue posible iniciar sesion en este momento. Intenta nuevamente mas tarde.';

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

function buildSafeAuthQuery({ nextPath, intent, branchId, planId }) {
  const params = new URLSearchParams();
  if (nextPath) params.set('next', nextPath);
  if (intent) params.set('intent', intent);
  if (branchId) params.set('id_sucursal', branchId);
  if (planId) params.set('id_plan', planId);
  return params.toString();
}

function isInvalidUserForAuth(result) {
  const code = String(result?.code || '').trim();
  const message = String(result?.message || '').trim().toLowerCase();
  return (
    code === 'AUTH_ACCESS_BLOCKED' ||
    code === 'AUTH_USER_NOT_ONBOARDED' ||
    /bloqueado|inactivo|perfil interno activo|not onboarded/.test(message)
  );
}

function resolveSafeLoginMessage(result) {
  const code = String(result?.code || '').trim().toUpperCase();
  if (code === AUTH_INVALID_CREDENTIALS_CODE) return GENERIC_INVALID_CREDENTIALS;
  if (code === AUTH_LOGIN_RATE_LIMITED_CODE) return GENERIC_LOCKED_LOGIN;
  if (code === AUTH_USER_TEMPORARILY_LOCKED_CODE) return GENERIC_LOCKED_LOGIN;

  const message = String(result?.message || '').trim();
  if (!message) return GENERIC_LOGIN_ERROR;

  const normalizedMessage = message.toLowerCase();
  if (normalizedMessage.includes('correo o contrasena')) return GENERIC_INVALID_CREDENTIALS;
  if (normalizedMessage.includes('credenciales invalidas')) return GENERIC_INVALID_CREDENTIALS;
  if (normalizedMessage.includes('invalid login credentials')) return GENERIC_INVALID_CREDENTIALS;
  if (normalizedMessage.includes('failed to fetch')) return GENERIC_LOGIN_ERROR;
  if (normalizedMessage.includes('timeout')) return GENERIC_LOCKED_LOGIN;
  if (normalizedMessage.includes('network')) return GENERIC_LOGIN_ERROR;
  if (normalizedMessage.includes('stack')) return GENERIC_LOGIN_ERROR;
  if (normalizedMessage.includes('sql')) return GENERIC_LOGIN_ERROR;
  if (normalizedMessage.includes('token')) return GENERIC_LOGIN_ERROR;
  if (normalizedMessage.includes('acceso no permitido')) return GENERIC_INVALID_CREDENTIALS;

  return GENERIC_LOGIN_ERROR;
}

function GoogleMark(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.2-1.9 2.9l3 2.3c1.8-1.6 2.8-4 2.8-6.8 0-.7-.1-1.5-.2-2.2H12z" />
      <path fill="#34A853" d="M12 21.5c2.6 0 4.8-.9 6.3-2.3l-3-2.3c-.8.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4l-3.1 2.4c1.5 3.1 4.7 5.3 8.5 5.3z" />
      <path fill="#4A90E2" d="M6.6 13.8c-.2-.6-.3-1.2-.3-1.8s.1-1.3.3-1.8l-3.1-2.4C2.9 9 2.6 10.5 2.6 12s.3 3 1 4.2l3-2.4z" />
      <path fill="#FBBC05" d="M12 6.2c1.4 0 2.7.5 3.7 1.4l2.7-2.7C16.8 3.4 14.6 2.5 12 2.5c-3.8 0-7 2.2-8.5 5.3l3.1 2.4c.8-2.3 2.9-4 5.4-4z" />
    </svg>
  );
}

function FacebookMark(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <path fill="#1877F2" d="M24 12c0-6.6-5.4-12-12-12S0 5.4 0 12c0 6 4.4 10.9 10.1 11.9v-8.4H7.1V12h3V9.3c0-3 1.8-4.6 4.4-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-2 1-2 1.9V12H17l-.6 3.5h-2.8v8.4C19.6 22.9 24 18 24 12z" />
      <path fill="#FFFFFF" d="M16.4 15.5L17 12h-3.4V9.7c0-1 .5-1.9 2-1.9h1.5V4.9s-1.3-.2-2.6-.2c-2.7 0-4.4 1.6-4.4 4.6V12h-3v3.5h3v8.4c.6.1 1.2.1 1.9.1s1.3 0 1.9-.1v-8.4h2.5z" />
    </svg>
  );
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
  const authQuery = useMemo(
    () => buildSafeAuthQuery({ nextPath, intent, branchId, planId }),
    [nextPath, intent, branchId, planId]
  );

  const registerHref = useMemo(() => {
    return authQuery ? `/register?${authQuery}` : '/register';
  }, [authQuery]);

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState('');
  const [showInvalidUserAuthBox, setShowInvalidUserAuthBox] = useState(false);
  const [showPasswordWhilePress, setShowPasswordWhilePress] = useState(false);
  const [sessionLimitModalOpen, setSessionLimitModalOpen] = useState(false);
  const [replacingSession, setReplacingSession] = useState(false);
  const pendingSessionReplaceRef = useRef(null);

  const isSubmitting = loading || loadingGoogle || replacingSession;
  const errorMessageId = 'login-error-message';

  useEffect(() => {
    const hash = location.hash || '';
    if (hash.includes('type=recovery') && hash.includes('access_token=')) {
      navigate(`/reset-password${hash}`, { replace: true });
    }
  }, [location.hash, navigate]);

  useEffect(() => {
    const idleMessage = consumeIdleSessionMessage();
    if (!idleMessage) return;
    setError(idleMessage);
    notifications.error(idleMessage, { dedupeKey: 'auth-idle-session-expired' });
  }, [notifications]);

  async function onSubmit(event) {
    event.preventDefault();
    if (isSubmitting || sessionLimitModalOpen) return;

    setError('');
    setShowInvalidUserAuthBox(false);

    const user = correo.trim().toLowerCase();
    const pass = contrasena;

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
    setContrasena('');

    if (!result.ok) {
      if (String(result?.code || '').trim().toUpperCase() === AUTH_SESSION_LIMIT_REACHED_CODE) {
        pendingSessionReplaceRef.current = {
          identifier: user,
          contrasena: pass,
          remember: Boolean(remember),
        };
        setSessionLimitModalOpen(true);
        return;
      }

      if (isInvalidUserForAuth(result)) {
        pendingSessionReplaceRef.current = null;
        setShowInvalidUserAuthBox(true);
        setError('');
        return;
      }

      pendingSessionReplaceRef.current = null;
      const message = resolveSafeLoginMessage(result);
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-login-error' });
      return;
    }

    pendingSessionReplaceRef.current = null;
    setSessionLimitModalOpen(false);
    notifications.success('Sesion iniciada correctamente.', { dedupeKey: 'auth-login-ok' });
    navigate(nextPath || '/home', { replace: true });
  }

  function handleSessionLimitCancel() {
    pendingSessionReplaceRef.current = null;
    setSessionLimitModalOpen(false);
    setReplacingSession(false);
    setLoading(false);
  }

  async function handleSessionLimitConfirm() {
    const pendingAttempt = pendingSessionReplaceRef.current;
    if (!pendingAttempt?.identifier || !pendingAttempt?.contrasena) {
      handleSessionLimitCancel();
      const message = GENERIC_LOGIN_ERROR;
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-login-session-replace-missing' });
      return;
    }

    setReplacingSession(true);
    setError('');
    setShowInvalidUserAuthBox(false);

    try {
      const replaceResult = await login(
        pendingAttempt.identifier,
        pendingAttempt.contrasena,
        pendingAttempt.remember,
        { replaceActiveSession: true }
      );

      if (!replaceResult.ok) {
        const message = GENERIC_LOGIN_ERROR;
        setError(message);
        notifications.error(message, { dedupeKey: 'auth-login-session-replace-error' });
        return;
      }

      notifications.success('Sesion iniciada correctamente.', { dedupeKey: 'auth-login-ok' });
      navigate(nextPath || '/home', { replace: true });
    } finally {
      pendingSessionReplaceRef.current = null;
      setContrasena('');
      setReplacingSession(false);
      setSessionLimitModalOpen(false);
    }
  }

  async function onContinueWithGoogle() {
    if (sessionLimitModalOpen || replacingSession) return;

    setError('');
    setShowInvalidUserAuthBox(false);

    if (!supabase) {
      const message = 'No fue posible iniciar autenticacion con Google en este momento.';
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-google-supabase-missing' });
      return;
    }

    try {
      setLoadingGoogle(true);
      const redirectTo = `${window.location.origin}/auth/callback${authQuery ? `?${authQuery}` : ''}`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch {
      const message = 'No fue posible iniciar autenticacion con Google en este momento.';
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-google-oauth-error' });
      setLoadingGoogle(false);
    }
  }

  function handlePasswordRevealStart(event) {
    event.preventDefault();
    setShowPasswordWhilePress(true);
  }

  function handlePasswordRevealEnd() {
    setShowPasswordWhilePress(false);
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
            <AuthLandingBrandBlock />
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
              <p className="mf-login-trust-copy">
                Tu acceso se valida de forma segura antes de entrar a tu panel privado.
              </p>
              {intent === 'seleccionar_plan' ? (
                <div className="mf-login-intent-note">
                  <CheckCircle2 size={14} strokeWidth={1.8} />
                  <span>Inicia sesion o registrate para continuar con tu plan VIP.</span>
                </div>
              ) : null}
            </div>

            <form
              className="mf-login-form"
              onSubmit={onSubmit}
              aria-busy={isSubmitting}
              aria-describedby={!showInvalidUserAuthBox && error ? errorMessageId : undefined}
            >
              <div className="mf-social-block">
                <div className="mf-social-head">
                  <p className="mf-social-title">Acceso social</p>
                  <p className="mf-social-caption">Acceso seguro con proveedores verificados</p>
                </div>

                <div className="mf-social-grid">
                  <button
                    className="mf-btn mf-social-btn mf-social-btn-google"
                    type="button"
                    onClick={onContinueWithGoogle}
                    disabled={isSubmitting}
                    aria-label="Continuar con Google"
                  >
                    <span className="mf-social-icon-wrap" aria-hidden="true">
                      <GoogleMark className="mf-social-icon" />
                    </span>
                    <span className="mf-social-text">
                      {loadingGoogle ? 'Redirigiendo...' : 'Google'}
                    </span>
                  </button>

                  <button
                    className="mf-btn mf-social-btn mf-social-btn-facebook"
                    type="button"
                    disabled
                    aria-disabled="true"
                    aria-label="Facebook próximamente"
                    title="Facebook estará disponible próximamente"
                  >
                    <span className="mf-social-icon-wrap" aria-hidden="true">
                      <FacebookMark className="mf-social-icon" />
                    </span>
                    <span className="mf-social-text">Facebook</span>
                    <span className="mf-social-soon">Próximamente</span>
                  </button>
                </div>
              </div>

              <div className="mf-login-divider" role="separator" aria-label="O CONTINUAR CON USUARIO">
                <span>O CONTINUAR CON USUARIO</span>
              </div>

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
                  disabled={isSubmitting}
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

                <div className="mf-password-field">
                  <input
                    id="contrasena"
                    className="mf-input mf-password-input"
                    type={showPasswordWhilePress ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={contrasena}
                    onChange={(event) => setContrasena(event.target.value)}
                    placeholder="********"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="mf-password-peek"
                    aria-label="Manten presionado para ver la contrasena"
                    title="Manten presionado para ver la contrasena"
                    onPointerDown={handlePasswordRevealStart}
                    onPointerUp={handlePasswordRevealEnd}
                    onPointerLeave={handlePasswordRevealEnd}
                    onPointerCancel={handlePasswordRevealEnd}
                    onBlur={handlePasswordRevealEnd}
                    disabled={isSubmitting}
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>

              {showInvalidUserAuthBox ? (
                <div className="mf-error" role="alert" aria-live="assertive">
                  <p className="font-semibold uppercase tracking-[0.08em]">USUARIO INVALIDO</p>
                  <p className="mt-1">Contacta MASTERFADE o escribe al correo soporte@masterfadeapp.com</p>
                </div>
              ) : null}
              {!showInvalidUserAuthBox && error ? (
                <div className="mf-error" id={errorMessageId} role="alert" aria-live="assertive">
                  {error}
                </div>
              ) : null}
              {isSubmitting ? (
                <div className="mf-help mt-2" role="status" aria-live="polite">
                  {loadingGoogle ? 'Conectando con Google...' : 'Validando tus credenciales...'}
                </div>
              ) : null}

              <div className="mf-actions">
                <label className="mf-checkbox">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    disabled={isSubmitting}
                  />
                  <span>Recordarme</span>
                </label>

                <button className="mf-btn" type="submit" disabled={isSubmitting}>
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

        <ActionConfirmDialog
          open={sessionLimitModalOpen}
          onOpenChange={(open) => {
            if (!open) handleSessionLimitCancel();
          }}
          title={SESSION_LIMIT_TITLE}
          description={SESSION_LIMIT_MESSAGE}
          cancelLabel="Cancelar"
          confirmLabel="Cerrar sesion anterior y continuar"
          loading={replacingSession}
          onConfirm={handleSessionLimitConfirm}
        />
      </div>
    </div>
  );
}
