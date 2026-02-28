import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../../config/supabaseClient.js';
import './LoginPage.css';
import './PasswordRecovery.css';

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

  const hashData = useMemo(() => parseHash(location.hash), [location.hash]);

  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // 1) Asegurar sesión (desde hash) y limpiar URL
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

      // Si el link trae tokens (recovery), setSession para poder hacer updateUser()
      if (hashData.access_token && hashData.refresh_token) {
        const { error } = await supabase.auth.setSession({
          access_token: hashData.access_token,
          refresh_token: hashData.refresh_token,
        });
        if (error) {
          setError(error.message || 'No se pudo validar la sesión de recuperación.');
          return;
        }

        // Limpia el hash del navegador (para no dejar tokens visibles)
        if (!cancelled) navigate('/reset-password', { replace: true });
      }

      // Confirmar que existe sesión
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setError('No hay una sesión de recuperación activa. Vuelve a pedir el enlace.');
        return;
      }

      if (!cancelled) setReady(true);
    }

    init();
    return () => { cancelled = true; };
  }, [hashData.access_token, hashData.refresh_token, hashData.error, hashData.error_description, navigate]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setMsg('');

    if (!supabase) return;

    if (newPass.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (newPass !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setLoading(false);

    if (error) {
      setError(error.message || 'No se pudo actualizar la contraseña.');
      return;
    }

    setMsg('Contraseña actualizada. Ahora puedes iniciar sesión con tu nueva contraseña.');

    // Opcional: cerrar sesión supabase para limpiar
    await supabase.auth.signOut();

    // Enviar al login después de 1.2s
    setTimeout(() => navigate('/login', { replace: true }), 1200);
  }

  return (
    <div className="mf-login-page">
      <div className="mf-login-container">
        <div className="mf-login-logo" aria-hidden="true">
          <span className="mf-login-logo-badge">B</span>
        </div>

        <div className="mf-login-card">
          <div className="mf-login-card-header">
            <h1 className="mf-login-title">Restablecer contraseña</h1>
          </div>

          <form className="mf-login-form" onSubmit={onSubmit}>
            {!ready ? (
              <>
                {error ? <div className="mf-error">{error}</div> : <div className="mf-help">Validando enlace…</div>}
                <div className="mf-actions">
                  <Link className="mf-link" to="/forgot-password">Volver</Link>
                  <Link className="mf-link" to="/login">Login</Link>
                </div>
              </>
            ) : (
              <>
                <div className="mf-form-group">
                  <label className="mf-label" htmlFor="newPass">Nueva contraseña</label>
                  <input
                    id="newPass"
                    className="mf-input"
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                <div className="mf-form-group">
                  <label className="mf-label" htmlFor="confirm">Confirmar contraseña</label>
                  <input
                    id="confirm"
                    className="mf-input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>

                {error ? <div className="mf-error">{error}</div> : null}
                {msg ? <div className="mf-success">{msg}</div> : null}

                <div className="mf-actions">
                  <Link className="mf-link" to="/login">Volver a login</Link>
                  <button className="mf-btn" type="submit" disabled={loading}>
                    {loading ? 'Guardando…' : 'Actualizar contraseña'}
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