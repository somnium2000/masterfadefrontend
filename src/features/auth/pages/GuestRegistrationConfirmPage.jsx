import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { http } from '../../../services/httpClient.js';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import './LoginPage.css';

export default function GuestRegistrationConfirmPage() {
  const [link] = useState(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return { operation: hash.get('operation') || '', token: hash.get('token') || '' };
  });
  const valid = /^[a-f0-9-]{36}$/i.test(link.operation || '') && /^[a-f0-9]{64}$/.test(link.token || '');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const lock = useRef(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !valid || done) return;
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    if (!fields.nombres.trim() || !fields.apellidos.trim() || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(fields.contrasena)
      || fields.contrasena !== fields.confirmar_contrasena || fields.acepta_terminos !== 'on') {
      setError('Revisa tus datos, contraseña, confirmación y aceptación de términos.'); return;
    }
    lock.current = true; setLoading(true); setError('');
    const controller = new AbortController(); request.current = controller;
    try {
      await http.post('/v1/auth/register/confirm', { ...link, nombres: fields.nombres, apellidos: fields.apellidos,
        contrasena: fields.contrasena, confirmar_contrasena: fields.confirmar_contrasena,
        acepta_terminos: true, consentimiento_marketing: fields.consentimiento_marketing === 'on' },
      { skipCsrf: true, sensitiveBody: true, skipAuthInvalidation: true, signal: controller.signal });
      if (controller.signal.aborted) return;
      form.reset(); setDone(true);
      window.history.replaceState(null, '', window.location.pathname);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure?.status === 410 ? 'El enlace expiró. Solicita uno nuevo desde Registro.'
        : failure?.status === 401 ? 'El enlace no es válido. Solicita uno nuevo desde Registro.'
          : 'No se pudo completar el registro. Intenta nuevamente o solicita otro enlace.');
    } finally { lock.current = false; setLoading(false); }
  }
  return <div className="mf-login-page mf-page-gradient"><main className="mf-login-shell mf-mobile-frame mf-screen-pad">
    <div className="mf-login-topbar"><Link to="/register">Volver a Registro</Link><ThemeSwitcher /></div>
    <section className="mf-login-card mf-glass-surface">
      <h1 className="mf-login-title">Confirmar registro</h1>
      {done ? <div role="status"><p>Registro completado. Ya puedes iniciar sesión con tu contraseña final.</p>
        <p>No se inició sesión automáticamente. Si tienes otra cuenta abierta, ciérrala antes de ingresar.</p><Link to="/login">Iniciar sesión</Link></div>
        : !valid ? <p role="alert">El enlace no es válido. Solicita uno nuevo desde Registro.</p>
          : <form onSubmit={submit} className="mf-form">
            <p>Confirma tu correo eligiendo tu contraseña final. No se incorporarán reservas anteriores.</p>
            <label>Nombre<input className="mf-input" name="nombres" required maxLength={120} autoComplete="given-name" disabled={loading} /></label>
            <label>Apellido<input className="mf-input" name="apellidos" required maxLength={120} autoComplete="family-name" disabled={loading} /></label>
            <label>Contraseña final<input className="mf-input" name="contrasena" type="password" required minLength={8} maxLength={120} autoComplete="new-password" disabled={loading} /></label>
            <p>Mínimo 8 caracteres, mayúscula, minúscula y número.</p>
            <label>Confirmar contraseña<input className="mf-input" name="confirmar_contrasena" type="password" required autoComplete="new-password" disabled={loading} /></label>
            <label className="mf-checkbox"><input type="checkbox" name="acepta_terminos" required disabled={loading} />Acepto términos y condiciones para crear mi cuenta.</label>
            <label className="mf-checkbox"><input type="checkbox" name="consentimiento_marketing" disabled={loading} />Acepto recibir comunicaciones comerciales.</label>
            {error ? <p role="alert">{error}</p> : null}
            <button className="mf-btn" type="submit" disabled={loading}>{loading ? 'Confirmando…' : 'Completar registro'}</button>
          </form>}
    </section></main></div>;
}
