import { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import { supabase } from '../../../config/supabaseClient.js';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import './LoginPage.css';
import './PasswordRecovery.css';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function parseHash(hash) {
  const h = (hash || '').startsWith('#') ? hash.slice(1) : (hash || '');
  const params = new URLSearchParams(h);
  return {
    access_token: params.get('access_token') || '',
    refresh_token: params.get('refresh_token') || '',
    type: params.get('type') || '',
    error: params.get('error') || '',
    error_description: params.get('error_description') || '',
  };
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();

  const hashData = useMemo(() => parseHash(location.hash), [location.hash]);

  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNewPasswordWhilePress, setShowNewPasswordWhilePress] = useState(false);
  const [showConfirmPasswordWhilePress, setShowConfirmPasswordWhilePress] = useState(false);
  const [loading, setLoading] = useState(false);

  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setError('');
      setMsg('');

      if (!supabase) {
        setError('Supabase no está configurado (revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).');
        return;
      }

      if (hashData.error) {
        setError(hashData.error_description || 'Enlace inválido o expirado.');
        return;
      }

      if (hashData.access_token && hashData.refresh_token) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: hashData.access_token,
          refresh_token: hashData.refresh_token,
        });
        if (setSessionError) {
          setError(setSessionError.message || 'No se pudo validar la sesión de recuperación.');
          return;
        }

        if (!cancelled) navigate('/reset-password', { replace: true });
      }

      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setError('No hay una sesión de recuperación activa. Vuelve a pedir el enlace.');
        return;
      }

      if (!cancelled) setReady(true);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [hashData.access_token, hashData.refresh_token, hashData.error, hashData.error_description, navigate]);

  function handlePasswordRevealStart(field, event) {
    event.preventDefault();
    if (field === 'new') {
      setShowNewPasswordWhilePress(true);
      return;
    }
    setShowConfirmPasswordWhilePress(true);
  }

  function handlePasswordRevealEnd(field) {
    if (field === 'new') {
      setShowNewPasswordWhilePress(false);
      return;
    }
    setShowConfirmPasswordWhilePress(false);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMsg('');

    if (!supabase) return;

    if (!PASSWORD_REGEX.test(newPass)) {
      const message = 'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula y número.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-reset-password-policy' });
      return;
    }
    if (newPass !== confirm) {
      const message = 'Las contraseñas no coinciden.';
      setError(message);
      notifications.warning(message, { dedupeKey: 'auth-reset-password-match' });
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);

    if (updateError) {
      const message = updateError.message || 'No se pudo actualizar la contraseña.';
      setError(message);
      notifications.error(message, { dedupeKey: 'auth-reset-password-error' });
      return;
    }

    const successMessage = 'Contraseña actualizada. Ahora puedes iniciar sesión con tu nueva contraseña.';
    setMsg(successMessage);
    notifications.success(successMessage, { dedupeKey: 'auth-reset-password-ok' });

    await supabase.auth.signOut();
    setTimeout(() => navigate('/login', { replace: true }), 1200);
  }

  return (
    <div className="mf-login-page">
      <div className="mf-login-container">
        <div className="mf-login-brand" aria-hidden="true">
          <MasterfadeLogo variant="publicPromotions" className="-my-6 sm:-my-8 md:-my-10" />
        </div>

        <div className="mf-login-card">
          <div className="mf-login-card-header">
            <h1 className="mf-login-title">Restablecer contraseña</h1>
          </div>

          <form className="mf-login-form" onSubmit={onSubmit}>
            {!ready ? (
              <>
                {error ? <div className="mf-error">{error}</div> : <div className="mf-help">Validando enlace...</div>}
                <div className="mf-actions">
                  <Link className="mf-link" to="/forgot-password">Volver</Link>
                  <Link className="mf-link" to="/login">Login</Link>
                </div>
              </>
            ) : (
              <>
                <div className="mf-form-group">
                  <label className="mf-label" htmlFor="newPass">Nueva contraseña</label>
                  <div className="mf-password-field">
                    <input
                      id="newPass"
                      className="mf-input mf-password-input"
                      type={showNewPasswordWhilePress ? 'text' : 'password'}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="mf-password-peek"
                      aria-label="Mantén presionado para ver la contraseña"
                      title="Mantén presionado para ver la contraseña"
                      onPointerDown={(event) => handlePasswordRevealStart('new', event)}
                      onPointerUp={() => handlePasswordRevealEnd('new')}
                      onPointerLeave={() => handlePasswordRevealEnd('new')}
                      onPointerCancel={() => handlePasswordRevealEnd('new')}
                      onBlur={() => handlePasswordRevealEnd('new')}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>

                <div className="mf-form-group">
                  <label className="mf-label" htmlFor="confirm">Confirmar contraseña</label>
                  <div className="mf-password-field">
                    <input
                      id="confirm"
                      className="mf-input mf-password-input"
                      type={showConfirmPasswordWhilePress ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      className="mf-password-peek"
                      aria-label="Mantén presionado para ver la contraseña"
                      title="Mantén presionado para ver la contraseña"
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

                {error ? <div className="mf-error">{error}</div> : null}
                {msg ? <div className="mf-success">{msg}</div> : null}

                <div className="mf-actions">
                  <Link className="mf-link" to="/login">Volver a login</Link>
                  <button className="mf-btn" type="submit" disabled={loading}>
                    {loading ? 'Guardando...' : 'Actualizar contraseña'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
