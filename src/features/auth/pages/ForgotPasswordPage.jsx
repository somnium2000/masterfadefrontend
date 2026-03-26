import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import './LoginPage.css';
import './PasswordRecovery.css';

export default function ForgotPasswordPage() {
  const notifications = useNotifications();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // ✅ Meta de rate limit (por correo)
  // { max, remaining, windowSeconds, resetInSeconds, blockSeconds }
  const [rateInfo, setRateInfo] = useState(null);

  // ✅ Contador de bloqueo (segundos)
  const [retryAfter, setRetryAfter] = useState(0);

  // ✅ countdown automático cuando está bloqueado
  useEffect(() => {
    if (retryAfter <= 0) return;

    const t = setInterval(() => {
      setRetryAfter((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(t);
  }, [retryAfter]);

  function formatSecondsToMinSec(totalSeconds) {
    const s = Math.max(0, Number(totalSeconds) || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}m ${r}s`;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMsg('');

    const value = email.trim().toLowerCase();
    if (!value || !value.includes('@')) {
      const message = 'Ingresa un correo valido.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-forgot-invalid-email' });
      return;
    }

    // AM: Respeta bloqueo temporal informado por backend para no disparar intentos extra.
    if (retryAfter > 0) {
      const message = 'Este correo esta temporalmente bloqueado por demasiados intentos.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-forgot-temporary-blocked' });
      return;
    }

    const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3002';

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const rl = data?.error?.details?.rateLimit;
        const ra = data?.error?.details?.retryAfterSeconds;

        if (rl) setRateInfo(rl);
        if (typeof ra === 'number') setRetryAfter(ra);

        const message = data?.error?.message || 'No se pudo enviar el enlace.';
        setError(message);
        notifications.error(message, { dedupeKey: 'auth-forgot-send-error' });
        return;
      }

      const successMessage =
        data?.data?.message ||
        'Si el correo existe, recibiras un enlace para restablecer tu contrasena.';

      setMsg(successMessage);
      notifications.success(successMessage, { dedupeKey: 'auth-forgot-send-ok' });

      if (data?.data?.rateLimit) setRateInfo(data.data.rateLimit);
      setRetryAfter(0);
    } catch {
      const message = 'No se pudo conectar con el backend. Verifica que este corriendo en 3002.';
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-forgot-connect-error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mf-login-page">
      <div className="mf-login-container">
        <div className="mf-login-brand" aria-hidden="true">
          <MasterfadeLogo variant="publicPromotions" className="-my-6 sm:-my-8 md:-my-10" />
        </div>

        <div className="mf-login-card">
          <div className="mf-login-card-header">
            <h1 className="mf-login-title">Recuperar contraseña</h1>
          </div>

          <form className="mf-login-form" onSubmit={onSubmit}>
            <div className="mf-form-group">
              <label className="mf-label" htmlFor="email">
                Correo
              </label>
              <input
                id="email"
                className="mf-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@masterfade.hn"
                disabled={loading}
              />
            </div>

            {/* Mensajes */}
            {error ? <div className="mf-error">{error}</div> : null}
            {msg ? <div className="mf-success">{msg}</div> : null}

            {/* ✅ Visualización del rate limit */}
            {rateInfo ? (
              <div className="mf-help">
                {retryAfter > 0 ? (
                  <>
                    <b>Bloqueado para este correo.</b> Intenta de nuevo en{' '}
                    <b>{formatSecondsToMinSec(retryAfter)}</b>.
                  </>
                ) : (
                  <>
                    Intentos restantes: <b>{rateInfo.remaining}</b> / {rateInfo.max}.{' '}
                    Se reinicia en <b>{formatSecondsToMinSec(rateInfo.resetInSeconds)}</b>.
                  </>
                )}
              </div>
            ) : null}

            <div className="mf-actions">
              <Link className="mf-link" to="/login">
                Volver a login
              </Link>

              <button
                className="mf-btn"
                type="submit"
                disabled={loading || retryAfter > 0}
                title={retryAfter > 0 ? 'Bloqueado temporalmente por demasiados intentos' : 'Enviar enlace'}
              >
                {loading ? 'Enviando…' : retryAfter > 0 ? 'Bloqueado' : 'Enviar enlace'}
              </button>
            </div>

            <div className="mf-help">
              Mantén tu front corriendo mientras abres el enlace del correo.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


