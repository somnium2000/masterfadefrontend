import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../../config/supabaseClient.js';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { http } from '../../../services/httpClient.js';

function isInvalidUserForAuth(errorLike) {
  const code = String(errorLike?.data?.error?.code || errorLike?.code || '').trim();
  const message = String(errorLike?.data?.error?.message || errorLike?.message || '').trim().toLowerCase();
  return (
    code === 'AUTH_ACCESS_BLOCKED' ||
    code === 'AUTH_USER_NOT_ONBOARDED' ||
    /bloqueado|inactivo|perfil interno activo|not onboarded/.test(message)
  );
}

function readHashParams() {
  const rawHash = String(window.location.hash || '');
  const normalizedHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  return new URLSearchParams(normalizedHash);
}

async function resolveOAuthSessionToken(supabase) {
  const query = new URLSearchParams(window.location.search);
  const hash = readHashParams();
  const authCode = String(query.get('code') || '').trim();

  if (authCode) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (error) throw error;
    const codeToken = String(data?.session?.access_token || '').trim();
    if (codeToken) return codeToken;
  }

  const hashAccessToken = String(hash.get('access_token') || '').trim();
  const hashRefreshToken = String(hash.get('refresh_token') || '').trim();
  if (hashAccessToken && hashRefreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: hashAccessToken,
      refresh_token: hashRefreshToken,
    });
    if (error) throw error;
    const hashToken = String(data?.session?.access_token || '').trim();
    if (hashToken) return hashToken;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const supabaseToken = String(sessionData?.session?.access_token || '').trim();
  if (!supabaseToken) {
    throw new Error('No se encontro sesion de Supabase para completar el exchange.');
  }

  return supabaseToken;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { completeExchangeLogin, isAuthenticated } = useAuth();
  const [error, setError] = useState('');
  const [showInvalidUserAuthBox, setShowInvalidUserAuthBox] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home', { replace: true });
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    async function runExchange() {
      const query = new URLSearchParams(window.location.search);
      const hash = readHashParams();
      const oauthError = String(query.get('error') || '').trim();
      const oauthErrorDescription = String(query.get('error_description') || '').trim();
      const oauthHashError = String(hash.get('error') || '').trim();
      const oauthHashErrorDescription = String(hash.get('error_description') || '').trim();

      if (oauthError || oauthHashError) {
        const message =
          oauthErrorDescription ||
          oauthHashErrorDescription ||
          'Google login no pudo completarse.';
        setShowInvalidUserAuthBox(false);
        setError(message);
        notifications.error(message, { dedupeKey: 'auth-callback-oauth-query-error' });
        if (supabase) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
        return;
      }

      if (!supabase) {
        const message = 'Supabase no esta configurado en frontend.';
        setShowInvalidUserAuthBox(false);
        setError(message);
        notifications.error(message, { dedupeKey: 'auth-callback-supabase-missing' });
        return;
      }

      try {
        const supabaseToken = await resolveOAuthSessionToken(supabase);

        if (window.location.hash || window.location.search) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const exchangeResponse = await http.post('/v1/auth/exchange', {
          supabase_token: supabaseToken,
        });

        const payload = exchangeResponse?.data || exchangeResponse;
        const appToken = String(payload?.token || '').trim();
        if (!appToken) {
          throw new Error('Backend no devolvio APP JWT en auth exchange.');
        }

        const completed = await completeExchangeLogin(appToken, { remember: true });
        if (!completed.ok) {
          throw new Error(completed.message || 'No se pudo completar la sesion.');
        }

        if (cancelled) return;
        notifications.success('Sesion iniciada con Google.', { dedupeKey: 'auth-callback-success' });
        navigate('/home', { replace: true });
      } catch (exchangeError) {
        if (cancelled) return;

        if (isInvalidUserForAuth(exchangeError)) {
          setShowInvalidUserAuthBox(true);
          setError('');
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          return;
        }

        setShowInvalidUserAuthBox(false);
        const message =
          exchangeError?.data?.error?.message ||
          exchangeError?.message ||
          'No se pudo completar el ingreso con Google.';
        setError(message);
        notifications.error(message, { dedupeKey: 'auth-callback-exchange-error' });
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    }

    // AM: En React StrictMode (dev), evita doble llamada real al exchange en el primer render.
    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        void runExchange();
      }
    }, 0);

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [completeExchangeLogin, isAuthenticated, navigate, notifications]);

  return (
    <div className="mf-page-gradient min-h-screen px-6 py-6">
      <div className="mx-auto w-full max-w-sm">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 text-xs font-medium tracking-[0.05em] text-[var(--mf-text-2)] transition-colors hover:text-[var(--mf-accent)]"
        >
          <ArrowLeft size={14} strokeWidth={1.9} />
          <span>Regresar al inicio</span>
        </Link>

        <div className="mf-glass-surface w-full rounded-[28px] p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
          Autenticacion
        </p>
        <div className="mf-hairline mx-auto my-5 w-16" />
        <h1 className="mf-font-display text-[30px] leading-none text-[var(--mf-text)]">Conectando tu sesion</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
          Validando identidad con Google y preparando tu acceso en MasterFade.
        </p>
        {showInvalidUserAuthBox ? (
          <div className="mt-5 rounded-[14px] border border-[rgba(251,113,133,0.22)] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-left text-[13px] text-[#fda29b]">
            <p className="font-semibold uppercase tracking-[0.08em]">USUARIO INVALIDO</p>
            <p className="mt-1">Contacta MASTERFADE o escribe al correo soporte@masterfadeapp.com</p>
          </div>
        ) : null}
        {!showInvalidUserAuthBox && error ? (
          <div className="mt-5 rounded-[14px] border border-[rgba(251,113,133,0.22)] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-left text-[13px] text-[#fda29b]">
            {error}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
