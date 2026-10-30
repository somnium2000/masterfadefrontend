import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import { http } from '../../../services/httpClient.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { PASSWORD_POLICY_MESSAGE, publicAuthError } from '../lib/publicAuthErrors.js';
import './LoginPage.css';
import './PasswordRecovery.css';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function parseHash(hash) {
  const h = (hash || '').startsWith('#') ? hash.slice(1) : (hash || '');
  const params = new URLSearchParams(h);
  return {
    token_hash: params.get('token_hash') || '',
    type: params.get('type') || '',
    error: params.get('error') || '',
    error_code: params.get('error_code') || '',
  };
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();

  const [hashData] = useState(() => parseHash(location.hash));
  const { logout } = useAuth();
  const requestRef = useRef(null);
  const submitLockRef = useRef(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNewPasswordWhilePress, setShowNewPasswordWhilePress] = useState(false);
  const [showConfirmPasswordWhilePress, setShowConfirmPasswordWhilePress] = useState(false);
  const [loading, setLoading] = useState(false);

  const ready = hashData.type === 'recovery' && /^[A-Za-z0-9_-]{20,2048}$/.test(hashData.token_hash) && !hashData.error && !hashData.error_code;
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (!ready) setError(publicAuthError({ code: hashData.error_code || hashData.error }, 'link'));
    return () => requestRef.current?.abort();
  }, [hashData, ready]);

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

  function handlePasswordRevealKeyDown(field, event) {
    if (event.key === ' ' || event.key === 'Enter') handlePasswordRevealStart(field, event);
  }

  function handlePasswordRevealKeyUp(field, event) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    handlePasswordRevealEnd(field);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMsg('');

    if (!ready || submitLockRef.current) return;

    if (!passwordUpdated && !PASSWORD_REGEX.test(newPass)) {
      const message = PASSWORD_POLICY_MESSAGE;
      setError(message);
      return;
    }
    if (!passwordUpdated && newPass !== confirm) {
      const message = 'Las contraseñas no coinciden.';
      setError(message);
      return;
    }

    submitLockRef.current = true;
    const controller = new AbortController(); requestRef.current = controller;
    setLoading(true);
    try {
      if (!passwordUpdated) {
        const resetResponse = await http.post('/v1/auth/reset-password', { token_hash: hashData.token_hash, contrasena: newPass, confirmar_contrasena: confirm },
          { skipCsrf: true, sensitiveBody: true, skipAuthInvalidation: true, signal: controller.signal });
        if (controller.signal.aborted) return;
        setPasswordUpdated(true); setNewPass(''); setConfirm('');
        const resetData = resetResponse?.data || resetResponse;
        if (resetData?.session_revocation_confirmed === false) {
          setError('Contraseña actualizada, pero no se confirmó el cierre de todas las sesiones. Intenta finalizar el cierre antes de iniciar sesión.');
          return;
        }
      }
      const closed = await logout();
      if (controller.signal.aborted) return;
      if (!closed?.ok) {
        setError('Contraseña actualizada, pero no se confirmó el cierre de esta sesión. Intenta finalizar el cierre.'); return;
      }
      const successMessage = 'Contraseña actualizada. Ahora puedes iniciar sesión con tu nueva contraseña.';
      setMsg(successMessage);
      notifications.success(successMessage, { dedupeKey: 'auth-reset-password-ok' });
      navigate('/login', { replace: true });
    } catch (requestError) {
      if (!controller.signal.aborted) setError(publicAuthError(requestError,
        requestError?.status === 401 ? 'link' : 'update'));
    } finally {
      submitLockRef.current = false;
      if (!controller.signal.aborted) setLoading(false);
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
            <h1 className="mf-login-title">Restablecer contraseña</h1>
          </div>

          <form className="mf-login-form" onSubmit={onSubmit} aria-busy={loading}>
            {!ready ? (
              <>
                {error ? (
                  <div className="mf-error" role="alert" aria-live="assertive">{error}</div>
                ) : (
                  <div className="mf-help" role="status" aria-live="polite">Validando enlace...</div>
                )}
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
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="mf-password-peek"
                      aria-label="Mantén presionado para ver la contraseña"
                      title="Mantén presionado para ver la contraseña"
                      onPointerDown={(event) => handlePasswordRevealStart('new', event)}
                      onKeyDown={(event) => handlePasswordRevealKeyDown('new', event)}
                      onKeyUp={(event) => handlePasswordRevealKeyUp('new', event)}
                      onPointerUp={() => handlePasswordRevealEnd('new')}
                      onPointerLeave={() => handlePasswordRevealEnd('new')}
                      onPointerCancel={() => handlePasswordRevealEnd('new')}
                      onBlur={() => handlePasswordRevealEnd('new')}
                      disabled={loading}
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
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="mf-password-peek"
                      aria-label="Mantén presionado para ver la contraseña"
                      title="Mantén presionado para ver la contraseña"
                      onPointerDown={(event) => handlePasswordRevealStart('confirm', event)}
                      onKeyDown={(event) => handlePasswordRevealKeyDown('confirm', event)}
                      onKeyUp={(event) => handlePasswordRevealKeyUp('confirm', event)}
                      onPointerUp={() => handlePasswordRevealEnd('confirm')}
                      onPointerLeave={() => handlePasswordRevealEnd('confirm')}
                      onPointerCancel={() => handlePasswordRevealEnd('confirm')}
                      onBlur={() => handlePasswordRevealEnd('confirm')}
                      disabled={loading}
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>

                {error ? <div className="mf-error" role="alert" aria-live="assertive">{error}</div> : null}
                {msg ? <div className="mf-success" role="status" aria-live="polite">{msg}</div> : null}

                <div className="mf-actions">
                  <Link className="mf-link" to="/login">Volver a login</Link>
                  <button className="mf-btn" type="submit" disabled={loading}>
                    {loading ? 'Guardando...' : passwordUpdated ? 'Finalizar cierre de sesión' : 'Actualizar contraseña'}
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
