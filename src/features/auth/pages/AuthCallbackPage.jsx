import { useEffect, useMemo, useRef, useState } from 'react';
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

function getSafeNextPath(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value.startsWith('/')) return '';
  if (value.startsWith('//')) return '';
  return value;
}

function resolveCallbackErrorMessage(errorLike) {
  const raw = String(errorLike?.data?.error?.message || errorLike?.message || '').trim();
  if (!raw) return 'No se pudo completar el ingreso con Google.';
  if (/payload oauth|exchange/i.test(raw)) {
    return 'La sesion social ya no esta disponible. Inicia nuevamente con Google.';
  }
  if (/supabase|config|provider|jwt|database|db/i.test(raw)) {
    return 'No se pudo completar el ingreso con Google.';
  }
  return raw;
}

async function resolveOAuthSessionToken(supabase, { authCode, hashAccessToken, hashRefreshToken }) {
  // AM: Si el callback trae access_token en hash, priorizamos ese valor
  // y evitamos depender de que supabase-js procese la URL.
  if (hashAccessToken) {
    return hashAccessToken;
  }

  if (authCode) {
    if (!supabase) {
      throw new Error('No se pudo resolver el codigo OAuth por configuracion de Supabase.');
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
    if (error) throw error;
    const codeToken = String(data?.session?.access_token || '').trim();
    if (codeToken) return codeToken;
  }

  if (hashAccessToken && hashRefreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: hashAccessToken,
      refresh_token: hashRefreshToken,
    });
    if (error) throw error;
    const hashToken = String(data?.session?.access_token || '').trim();
    if (hashToken) return hashToken;
  }

  // AM: Si no llega code ni tokens hash, evitamos llamadas repetitivas a Supabase
  // (caso comun al volver atras a /auth/callback sin payload OAuth).
  throw new Error('No se encontro payload OAuth para completar el exchange.');
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { completeExchangeLogin, isAuthenticated } = useAuth();
  const callbackQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  const safeNextPath = useMemo(() => getSafeNextPath(callbackQuery.get('next')), [callbackQuery]);
  const [error, setError] = useState('');
  const [showInvalidUserAuthBox, setShowInvalidUserAuthBox] = useState(false);
  const [pendingSocialConfirmation, setPendingSocialConfirmation] = useState(null);
  const [stepMessage, setStepMessage] = useState('Validando identidad con Google...');
  const exchangeStartedRef = useRef(false);
  const callbackSignature = useMemo(
    () => `${window.location.pathname}|${window.location.search}|${window.location.hash}`,
    []
  );

  useEffect(() => {
    if (isAuthenticated) {
      navigate(safeNextPath || '/home', { replace: true });
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;

    if (exchangeStartedRef.current) {
      return undefined;
    }

    let runStarted = false;

    async function runExchange() {
      const query = new URLSearchParams(window.location.search);
      const hash = readHashParams();
      const callbackNextPath = getSafeNextPath(query.get('next'));
      const socialConfirmToken = String(query.get('social_confirm_token') || '').trim();
      const oauthCode = String(query.get('code') || '').trim();
      const hashAccessToken = String(hash.get('access_token') || '').trim();
      const hashRefreshToken = String(hash.get('refresh_token') || '').trim();

      if (socialConfirmToken) {
        try {
          setPendingSocialConfirmation(null);
          setShowInvalidUserAuthBox(false);
          setError('');
          setStepMessage('Confirmando tu correo de seguridad...');

          const confirmationResponse = await http.post('/v1/auth/social/confirm', {
            social_confirm_token: socialConfirmToken,
          }, {
            skipCsrf: true,
          });
          const confirmationPayload = confirmationResponse?.data || confirmationResponse;
          if (!confirmationResponse?.ok || !confirmationPayload?.session?.authenticated) {
            throw new Error('No se pudo establecer la sesion tras confirmar el correo.');
          }

          if (window.location.hash || window.location.search) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          setStepMessage('Preparando sesion segura...');
          const completed = await completeExchangeLogin();
          if (!completed.ok) {
            throw new Error(completed.message || 'No se pudo completar la sesion tras confirmar el correo.');
          }

          if (cancelled) return;
          notifications.success('Correo confirmado. Tu perfil ya esta activo.', { dedupeKey: 'auth-callback-social-confirm-success' });
          navigate(callbackNextPath || '/home', { replace: true });
          return;
        } catch (confirmError) {
          if (cancelled) return;
          const message =
            confirmError?.data?.error?.message ||
            confirmError?.message ||
            'No se pudo confirmar tu acceso social. Inicia nuevamente con Google.';
          setPendingSocialConfirmation(null);
          setShowInvalidUserAuthBox(false);
          setError(message);
          notifications.error(message, { dedupeKey: 'auth-callback-social-confirm-error' });
          if (supabase) {
            await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          }
          return;
        }
      }

      const oauthError = String(query.get('error') || '').trim();
      const oauthErrorDescription = String(query.get('error_description') || '').trim();
      const oauthHashError = String(hash.get('error') || '').trim();
      const oauthHashErrorDescription = String(hash.get('error_description') || '').trim();
      const hasEphemeralPayload = Boolean(
        socialConfirmToken ||
        oauthCode ||
        hashAccessToken ||
        hashRefreshToken ||
        oauthError ||
        oauthHashError ||
        oauthErrorDescription ||
        oauthHashErrorDescription
      );

      if (hasEphemeralPayload) {
        const cleanQuery = callbackNextPath
          ? `?next=${encodeURIComponent(callbackNextPath)}`
          : '';
        window.history.replaceState({}, document.title, `${window.location.pathname}${cleanQuery}`);
      }

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

      if (!oauthCode && !hashAccessToken) {
        // Sin payload OAuth (F5 o boton atras sobre /auth/callback).
        // Intentamos hidratar por cookie existente antes de mostrar error.
        try {
          const hydrated = await completeExchangeLogin();
          if (hydrated.ok) {
            navigate(callbackNextPath || '/home', { replace: true });
            return;
          }
        } catch {
          // ignore
        }

        // Si no hay sesion y no hay payload, redirigimos a login de forma controlada
        const message = 'La sesión social ya no está disponible. Inicia nuevamente con Google.';
        notifications.error(message, { dedupeKey: 'auth-callback-no-payload-redirect' });
        navigate('/login', { replace: true });
        return;
      }

      exchangeStartedRef.current = true;
      runStarted = true;

      try {
        setStepMessage('Validando sesion social...');
        const supabaseToken = await resolveOAuthSessionToken(supabase, {
          authCode: oauthCode,
          hashAccessToken,
          hashRefreshToken,
        });

        setStepMessage('Verificando cuenta MasterFade...');
        const exchangeResponse = await http.post('/v1/auth/exchange', {
          supabase_token: supabaseToken,
        }, {
          skipCsrf: true,
        });

        const payload = exchangeResponse?.data || exchangeResponse;
        if (payload?.pending_social_confirmation) {
          setPendingSocialConfirmation({
            emailMasked: payload?.email_masked || null,
            message:
              payload?.message ||
              'Revisa tu correo para confirmar la creacion de tu perfil en MasterFade.',
          });
          setShowInvalidUserAuthBox(false);
          setError('');
          setStepMessage('Confirmacion pendiente de correo...');
          notifications.info(payload?.message || 'Revisa tu correo para confirmar el acceso social.', {
            dedupeKey: 'auth-callback-social-confirm-pending',
          });
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          return;
        }

        if (!exchangeResponse?.ok || !payload?.session?.authenticated) {
          throw new Error('Backend no pudo establecer sesion en auth exchange.');
        }

        setStepMessage('Preparando sesion segura...');
        const completed = await completeExchangeLogin();
        if (!completed.ok) {
          throw new Error(completed.message || 'No se pudo completar la sesion.');
        }

        notifications.success('Sesion iniciada con Google.', { dedupeKey: 'auth-callback-success' });
        navigate(callbackNextPath || '/home', { replace: true });
      } catch (exchangeError) {

        if (isInvalidUserForAuth(exchangeError)) {
          setShowInvalidUserAuthBox(true);
          setError('');
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          return;
        }

        setShowInvalidUserAuthBox(false);
          const message = resolveCallbackErrorMessage(exchangeError);
        setError(message);
        notifications.error(message, { dedupeKey: 'auth-callback-exchange-error' });
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    }

    // AM: En React StrictMode (dev), evita doble llamada real al exchange en el primer render.
    timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        void runExchange().catch(() => {
          const message = 'Error inesperado al conectar con Google.';
          setError(message);
          notifications.error(message, { dedupeKey: 'auth-callback-uncaught-catch' });
        });
      }
    }, 0);

    return () => {
      cancelled = true;
      if (!runStarted) {
        exchangeStartedRef.current = false;
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [callbackSignature, completeExchangeLogin, isAuthenticated, navigate, notifications, safeNextPath]);

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

        <div className="mf-glass-surface w-full rounded-[28px] p-8 text-center" aria-busy={!error && !showInvalidUserAuthBox && !pendingSocialConfirmation}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
          Autenticacion
        </p>
        <div className="mf-hairline mx-auto my-5 w-16" />
        <h1 className="mf-font-display text-[30px] leading-none text-[var(--mf-text)]">Conectando tu sesion</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]" role="status" aria-live="polite">
          {stepMessage}
        </p>
        {showInvalidUserAuthBox ? (
          <div className="mt-5 rounded-[14px] border border-[rgba(251,113,133,0.22)] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-left text-[13px] text-[#fda29b]" role="alert" aria-live="assertive">
            <p className="font-semibold uppercase tracking-[0.08em]">USUARIO INVALIDO</p>
            <p className="mt-1">Contacta MASTERFADE o escribe al correo soporte@masterfadeapp.com</p>
          </div>
        ) : null}
        {!showInvalidUserAuthBox && !error && pendingSocialConfirmation ? (
          <div className="mt-5 rounded-[14px] border border-[color:var(--mf-btn-border)] bg-[color:var(--mf-btn-bg)] px-4 py-3 text-left text-[13px] text-[var(--mf-text)]" role="status" aria-live="polite">
            <p className="font-semibold uppercase tracking-[0.08em] text-[var(--mf-accent)]">CONFIRMACION REQUERIDA</p>
            <p className="mt-1">{pendingSocialConfirmation.message}</p>
            {pendingSocialConfirmation.emailMasked ? (
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">Correo de seguridad enviado a: {pendingSocialConfirmation.emailMasked}</p>
            ) : null}
          </div>
        ) : null}
        {!showInvalidUserAuthBox && error ? (
          <div className="mt-5 rounded-[14px] border border-[rgba(251,113,133,0.22)] bg-[rgba(127,29,29,0.22)] px-4 py-3 text-left text-[13px] text-[#fda29b]" role="alert" aria-live="assertive">
            {error}
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
