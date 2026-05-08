import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  KeyRound,
  Mail,
  Megaphone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { http } from '../../../services/httpClient.js';
import AuthLandingBrandBlock from '../components/AuthLandingBrandBlock.jsx';
import './LoginPage.css';
import './RegisterPage.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const notifications = useNotifications();
  const { login } = useAuth();

  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const nextPath = useMemo(() => getSafeNextPath(queryParams.get('next')), [queryParams]);
  const intent = useMemo(() => String(queryParams.get('intent') || '').trim().toLowerCase(), [queryParams]);
  const branchId = useMemo(() => normalizeBranchId(queryParams.get('id_sucursal')), [queryParams]);
  const planId = useMemo(() => String(queryParams.get('id_plan') || '').trim(), [queryParams]);

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [confirmarContrasena, setConfirmarContrasena] = useState('');
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [consentimientoMarketing, setConsentimientoMarketing] = useState(false);
  const [showPasswordWhilePress, setShowPasswordWhilePress] = useState(false);
  const [showConfirmPasswordWhilePress, setShowConfirmPasswordWhilePress] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loginHref = useMemo(() => {
    const params = new URLSearchParams();
    // AM: Conserva intencion de retorno cuando el registro se origino desde membresias.
    if (nextPath) params.set('next', nextPath);
    if (intent) params.set('intent', intent);
    if (branchId) params.set('id_sucursal', branchId);
    if (planId) params.set('id_plan', planId);
    const query = params.toString();
    return query ? `/login?${query}` : '/login';
  }, [nextPath, intent, branchId, planId]);

  function handlePasswordRevealStart(field, event) {
    event.preventDefault();
    if (field === 'password') {
      setShowPasswordWhilePress(true);
      return;
    }
    setShowConfirmPasswordWhilePress(true);
  }

  function handlePasswordRevealEnd(field) {
    if (field === 'password') {
      setShowPasswordWhilePress(false);
      return;
    }
    setShowConfirmPasswordWhilePress(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    const normalizedNombres = String(nombres || '').normalize('NFC').trim();
    const normalizedApellidos = String(apellidos || '').normalize('NFC').trim();
    const normalizedCorreo = String(correo || '').trim().toLowerCase();
    const password = String(contrasena || '');
    const passwordConfirm = String(confirmarContrasena || '');

    if (!normalizedNombres || !normalizedApellidos) {
      const message = 'Nombre y apellido son obligatorios.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-register-required-name' });
      return;
    }

    if (!EMAIL_REGEX.test(normalizedCorreo)) {
      const message = 'Debes ingresar un correo valido.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-register-invalid-email' });
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      const message = 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula y número.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-register-weak-password' });
      return;
    }

    if (password !== passwordConfirm) {
      const message = 'La confirmación de contraseña no coincide.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-register-password-mismatch' });
      return;
    }

    if (!aceptaTerminos || !consentimientoMarketing) {
      const message = 'para crear un usuario debes seleccionar los consentimientos de cuenta para una MASTER experiencia.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-register-terms-required' });
      return;
    }

    setLoading(true);
    try {
      await http.post('/v1/auth/register', {
        nombres: normalizedNombres,
        apellidos: normalizedApellidos,
        email: normalizedCorreo,
        contrasena: password,
        confirmar_contrasena: passwordConfirm,
        acepta_terminos: true,
        consentimiento_marketing: consentimientoMarketing,
        id_sucursal_origen: branchId || null,
      }, {
        skipCsrf: true,
      });

      // AM: Registro exitoso: iniciamos sesion automaticamente para mantener UX fluida.
      const loginResult = await login(normalizedCorreo, password, false);
      if (!loginResult.ok) {
        notifications.info('Cuenta creada correctamente. Inicia sesion para continuar.', {
          dedupeKey: 'auth-register-created-login-required',
        });
        navigate(loginHref, { replace: true });
        return;
      }

      notifications.success('Cuenta creada correctamente. Bienvenido a MasterFade.', {
        dedupeKey: 'auth-register-ok',
      });
      navigate(nextPath || '/home', { replace: true });
    } catch (submitError) {
      const message =
        submitError?.data?.error?.message ||
        submitError?.message ||
        'No se pudo completar el registro.';
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-register-error' });
    } finally {
      setLoading(false);
    }
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
              <p className="mf-login-kicker">Cuenta cliente</p>
              <h1 className="mf-login-title">Registrarte</h1>
              <p className="mf-login-subtitle">
                Crea tu cuenta para acceder a privilegios, membresias VIP y una experiencia personalizada en
                MASTERFADE.
              </p>

              {/* AM: Indicadores comerciales compactos para dar contexto premium sin recargar la vista. */}
              <div className="mf-register-benefit-chips">
                <span className="mf-register-chip">
                  <ShieldCheck size={13} strokeWidth={1.9} />
                  Acceso seguro
                </span>
                <span className="mf-register-chip">
                  <Sparkles size={13} strokeWidth={1.9} />
                  Beneficios VIP
                </span>
              </div>

              {intent === 'seleccionar_plan' ? (
                <div className="mf-login-intent-note">
                  <CheckCircle2 size={14} strokeWidth={1.8} />
                  <span>Registrate para continuar con la seleccion de tu plan VIP.</span>
                </div>
              ) : null}
            </div>

            <form className="mf-login-form" onSubmit={handleSubmit}>
              <div className="mf-register-grid">
                <div className="mf-form-group">
                  <label className="mf-label mf-register-label" htmlFor="register_nombres">
                    <UserRound size={12} strokeWidth={2} />
                    Nombre
                  </label>
                  <div className="mf-register-input-wrap">
                    <UserRound className="mf-register-input-icon" size={15} strokeWidth={1.9} />
                    <input
                      id="register_nombres"
                      className="mf-input mf-register-input"
                      type="text"
                      autoComplete="given-name"
                      value={nombres}
                      onChange={(event) => setNombres(event.target.value)}
                      placeholder="Samir"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="mf-form-group">
                  <label className="mf-label mf-register-label" htmlFor="register_apellidos">
                    <UserRound size={12} strokeWidth={2} />
                    Apellido
                  </label>
                  <div className="mf-register-input-wrap">
                    <UserRound className="mf-register-input-icon" size={15} strokeWidth={1.9} />
                    <input
                      id="register_apellidos"
                      className="mf-input mf-register-input"
                      type="text"
                      autoComplete="family-name"
                      value={apellidos}
                      onChange={(event) => setApellidos(event.target.value)}
                      placeholder="Lobo"
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <div className="mf-form-group">
                <label className="mf-label mf-register-label" htmlFor="register_correo">
                  <Mail size={12} strokeWidth={2} />
                  Correo (sera tu usuario/login)
                </label>
                <div className="mf-register-input-wrap">
                  <Mail className="mf-register-input-icon" size={15} strokeWidth={1.9} />
                  <input
                    id="register_correo"
                    className="mf-input mf-register-input"
                    type="email"
                    autoComplete="email"
                    value={correo}
                    onChange={(event) => setCorreo(event.target.value)}
                    placeholder="cliente@masterfadeapp.com"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="mf-register-grid">
                <div className="mf-form-group">
                  <label className="mf-label mf-register-label" htmlFor="register_contrasena">
                    <KeyRound size={12} strokeWidth={2} />
                    Contraseña
                  </label>
                  <div className="mf-register-input-wrap">
                    <KeyRound className="mf-register-input-icon" size={15} strokeWidth={1.9} />
                    <input
                      id="register_contrasena"
                      className="mf-input mf-register-input mf-register-input-password"
                      type={showPasswordWhilePress ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={contrasena}
                      onChange={(event) => setContrasena(event.target.value)}
                      placeholder="********"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="mf-register-password-peek"
                      aria-label="Mantén presionado para ver la contraseña"
                      title="Mantén presionado para ver la contraseña"
                      disabled={loading}
                      onPointerDown={(event) => handlePasswordRevealStart('password', event)}
                      onPointerUp={() => handlePasswordRevealEnd('password')}
                      onPointerLeave={() => handlePasswordRevealEnd('password')}
                      onPointerCancel={() => handlePasswordRevealEnd('password')}
                      onBlur={() => handlePasswordRevealEnd('password')}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>

                <div className="mf-form-group">
                  <label className="mf-label mf-register-label" htmlFor="register_confirmar">
                    <KeyRound size={12} strokeWidth={2} />
                    Confirmar contraseña
                  </label>
                  <div className="mf-register-input-wrap">
                    <KeyRound className="mf-register-input-icon" size={15} strokeWidth={1.9} />
                    <input
                      id="register_confirmar"
                      className="mf-input mf-register-input mf-register-input-password"
                      type={showConfirmPasswordWhilePress ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmarContrasena}
                      onChange={(event) => setConfirmarContrasena(event.target.value)}
                      placeholder="********"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="mf-register-password-peek"
                      aria-label="Mantén presionado para ver la contraseña"
                      title="Mantén presionado para ver la contraseña"
                      disabled={loading}
                      onPointerDown={(event) => handlePasswordRevealStart('confirm', event)}
                      onPointerUp={() => handlePasswordRevealEnd('confirm')}
                      onPointerLeave={() => handlePasswordRevealEnd('confirm')}
                      onPointerCancel={() => handlePasswordRevealEnd('confirm')}
                      onBlur={() => handlePasswordRevealEnd('confirm')}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <p className="mf-register-help">
                Mínimo 8 caracteres con mayúscula, minúscula y número.
              </p>

              {/* AM: Panel de consentimientos para separar legal/marketing y mejorar legibilidad. */}
              <div className="mf-register-consent-panel">
                <p className="mf-register-consent-title">
                  <ShieldCheck size={14} strokeWidth={1.9} />
                  Consentimientos de cuenta
                </p>

                <div className="mf-register-checkboxes">
                  <label className="mf-checkbox mf-checkbox-block">
                    <input
                      type="checkbox"
                      checked={aceptaTerminos}
                      onChange={(event) => setAceptaTerminos(event.target.checked)}
                      disabled={loading}
                    />
                    <span>
                      Acepto terminos y condiciones para crear mi cuenta.
                    </span>
                  </label>

                  <label className="mf-checkbox mf-checkbox-block">
                    <input
                      type="checkbox"
                      checked={consentimientoMarketing}
                      onChange={(event) => setConsentimientoMarketing(event.target.checked)}
                      disabled={loading}
                    />
                    <span className="mf-register-checkbox-content">
                      <Megaphone size={13} strokeWidth={1.9} />
                      Acepto recibir comunicaciones por correo sobre servicios, novedades y promociones.
                    </span>
                  </label>
                </div>
              </div>

              {error ? <div className="mf-error">{error}</div> : null}

              <div className="mf-actions mf-actions-end">
                <button className="mf-btn" type="submit" disabled={loading}>
                  {loading ? 'Creando cuenta...' : 'Crear cuenta'}
                </button>
              </div>

              <div className="mf-login-footer">
                <span>Ya tienes cuenta?</span>
                <Link className="mf-link" to={loginHref}>
                  Iniciar sesion
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
