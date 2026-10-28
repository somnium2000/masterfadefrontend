import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  abortInFlightRequests,
  http,
  registerSessionInvalidationHandler,
  resetSessionInvalidation,
} from '../services/httpClient.js';
import { supabase } from '../config/supabaseClient.js';
import { setAdminReportesSessionScope } from '../features/admin/lib/adminReportesApi.js';

const AuthContext = createContext(null);
const IDLE_SESSION_TIMEOUT_MS = 20 * 60 * 1000;
const IDLE_MOUSEMOVE_THROTTLE_MS = 5000;
const IDLE_BACKEND_TOUCH_THROTTLE_MS = 60 * 1000;
const IDLE_SESSION_MESSAGE = 'Sesión expirada por inactividad. Vuelve a iniciar sesión.';
const IDLE_SESSION_MESSAGE_KEY = 'mf_idle_session_message';
const SESSION_LAST_ACTIVITY_KEY = 'mf_session_last_activity_at';
const SESSION_LAST_BACKEND_TOUCH_KEY = 'mf_session_last_backend_touch_at';
const SESSION_IDLE_EXPIRED_KEY = 'mf_session_idle_expired_at';
const SESSION_MANUAL_LOGOUT_KEY = 'mf_session_manual_logout_at';
const SESSION_ACTIVITY_EVENTS = ['click', 'keydown', 'touchstart', 'scroll'];
const REWARD_BOOKING_CONTEXT_STORAGE_KEY = 'mf_reward_redeem_context_v1';

function restrictRewardContextToUser(user = null) {
  try {
    const raw = window.sessionStorage.getItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY);
    if (!raw) return;
    const context = JSON.parse(raw);
    if (user?.id_usuario && user?.cliente_id
      && context?.owner_id_usuario === user.id_usuario && context?.owner_id_cliente === user.cliente_id) return;
    window.sessionStorage.removeItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY);
  } catch {
    try { window.sessionStorage.removeItem(REWARD_BOOKING_CONTEXT_STORAGE_KEY); } catch { /* AM: Storage puede estar bloqueado. */ }
  }
}

function normalizeRoles(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeBranchIds(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function buildEnrichedUser(payload) {
  const baseUser = payload?.user || {};
  const roles = normalizeRoles(payload?.roles);
  const branchIds = normalizeBranchIds(payload?.branch_ids);

  return {
    id_usuario: baseUser.id_usuario || '',
    id_persona: baseUser.id_persona ?? null,
    email: baseUser.email ?? null,
    nombres: baseUser.nombres ?? null,
    apellidos: baseUser.apellidos ?? null,
    telefono_principal: baseUser.telefono_principal ?? null,
    roles,
    branch_ids: branchIds,
    empresa_id: payload?.empresa_id ?? null,
    empleado_id: payload?.empleado_id ?? null,
    cliente_id: payload?.cliente_id ?? null,
  };
}

export function getUserDisplayName(user) {
  const nombres = String(user?.nombres || '').trim();
  const apellidos = String(user?.apellidos || '').trim();
  const nombreCompleto = [nombres, apellidos].filter(Boolean).join(' ').trim();

  return nombreCompleto || user?.email || user?.id_usuario || 'Usuario';
}

function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function resolveLoginErrorMessage(rawMessage, errorCode) {
  const fallback = 'Correo o contrasena incorrecta, intentalo de nuevo.';
  const code = String(errorCode || '').trim().toUpperCase();
  const tooManyAttemptsMessage = 'No fue posible iniciar sesion en este momento. Intenta nuevamente mas tarde.';

  if (code === 'AUTH_INVALID_CREDENTIALS') return fallback;
  if (code === 'AUTH_LOGIN_RATE_LIMITED') return tooManyAttemptsMessage;
  if (code === 'AUTH_USER_TEMPORARILY_LOCKED') return tooManyAttemptsMessage;

  const normalized = String(rawMessage || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes('invalid login credentials')) return fallback;
  if (normalized.includes('credenciales invalidas')) return fallback;
  if (normalized.includes('failed to fetch')) return 'No fue posible iniciar sesion en este momento. Intenta nuevamente.';
  if (normalized.includes('network')) return 'No fue posible iniciar sesion en este momento. Intenta nuevamente.';
  if (normalized.includes('timeout')) return 'No fue posible iniciar sesion en este momento. Intenta nuevamente.';

  return String(rawMessage).trim();
}

function shouldHydrateForPath(pathname) {
  const path = String(pathname || '').trim();
  if (!path) return false;
  if (path.startsWith('/auth/callback')) return false;
  if (path.startsWith('/home')) return true;
  if (path.startsWith('/admin')) return true;
  if (path === '/agendar' || path.startsWith('/agendar/')) return true;
  if (path === '/login' || path === '/register') return true;
  return false;
}

function isPublicBookingPath(pathname) {
  const path = String(pathname || '').trim();
  return path === '/agendar' || path.startsWith('/agendar/');
}

function shouldTrackIdleSession(pathname) {
  const path = String(pathname || '').trim();
  if (!path) return false;
  if (path === '/') return false;
  if (path === '/login' || path === '/register') return false;
  if (path === '/forgot-password' || path === '/reset-password') return false;
  if (path.startsWith('/auth/callback')) return false;
  if (path === '/servicios' || path === '/promociones' || path === '/barberos') return false;
  if (isPublicBookingPath(path)) return false;
  return true;
}

function persistIdleSessionMessage(message = IDLE_SESSION_MESSAGE) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(IDLE_SESSION_MESSAGE_KEY, message);
  } catch {
    // no-op
  }
}

function readSharedTimestamp(key) {
  if (typeof window === 'undefined') return 0;
  try {
    const value = Number(window.localStorage.getItem(key) || 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeSharedTimestamp(key, value = Date.now()) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // no-op
  }
}

function removeSharedTimestamp(key) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // no-op
  }
}

export function consumeIdleSessionMessage() {
  if (typeof window === 'undefined') return '';
  try {
    const message = String(window.sessionStorage.getItem(IDLE_SESSION_MESSAGE_KEY) || '').trim();
    if (message) window.sessionStorage.removeItem(IDLE_SESSION_MESSAGE_KEY);
    return message;
  } catch {
    return '';
  }
}

export function AuthProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const initialPathname = typeof window !== 'undefined' ? String(window.location?.pathname || '').trim() : '';
  const shouldHydrateOnBoot = shouldHydrateForPath(initialPathname);
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [branchIds, setBranchIds] = useState([]);
  const [empresaId, setEmpresaId] = useState(null);
  const [empleadoId, setEmpleadoId] = useState(null);
  const [clienteId, setClienteId] = useState(null);
  const [isHydrating, setIsHydrating] = useState(shouldHydrateOnBoot);
  const [isHydrated, setIsHydrated] = useState(!shouldHydrateOnBoot);
  const [logoutError, setLogoutError] = useState('');
  const logoutRequestRef = useRef(null);
  const sessionGenerationRef = useRef(0);
  const idleTimerRef = useRef(null);
  const lastMouseMoveAtRef = useRef(0);
  const idleExpirationHandledRef = useRef(false);
  const backendTouchInFlightRef = useRef(false);

  const profileSyncGeneration = sessionGenerationRef.current;
  const syncClienteProfile = useCallback((cliente, expectedUserId) => {
    if (!expectedUserId || !cliente?.id_cliente
      || typeof cliente.telefono_principal !== 'string' || !cliente.telefono_principal.trim()
      || (cliente.id_usuario && cliente.id_usuario !== expectedUserId)
      || profileSyncGeneration !== sessionGenerationRef.current) return;
    // AM: Solo el telefono confirmado de la misma identidad y epoca puede actualizar Auth.
    setUser((current) => {
      if (profileSyncGeneration !== sessionGenerationRef.current
        || current?.id_usuario !== expectedUserId
        || current?.cliente_id !== cliente.id_cliente) return current;
      return { ...current, telefono_principal: cliente.telefono_principal };
    });
  }, [profileSyncGeneration]);

  const applyUserState = useCallback((nextUser) => {
    if (nextUser?.id_usuario) restrictRewardContextToUser(nextUser);
    setAdminReportesSessionScope({
      userId: nextUser?.id_usuario,
      roles: normalizeRoles(nextUser?.roles),
      branchIds: normalizeBranchIds(nextUser?.branch_ids),
      empresaId: nextUser?.empresa_id ?? null,
    });
    if (nextUser?.id_usuario) {
      idleExpirationHandledRef.current = false;
      const now = Date.now();
      writeSharedTimestamp(SESSION_LAST_ACTIVITY_KEY, now);
      removeSharedTimestamp(SESSION_IDLE_EXPIRED_KEY);
    }
    setUser(nextUser);
    setRoles(normalizeRoles(nextUser?.roles));
    setBranchIds(normalizeBranchIds(nextUser?.branch_ids));
    setEmpresaId(nextUser?.empresa_id ?? null);
    setEmpleadoId(nextUser?.empleado_id ?? null);
    setClienteId(nextUser?.cliente_id ?? null);
    setToken(nextUser?.id_usuario ? 'cookie-session' : '');
  }, []);

  const clearSessionState = useCallback(() => {
    applyUserState(null);
    setIsHydrating(false);
    setIsHydrated(true);
  }, [applyUserState]);

  const invalidateSession = useCallback((reason = 'session_invalidated') => {
    sessionGenerationRef.current += 1;
    abortInFlightRequests(reason);
    restrictRewardContextToUser();
    clearSessionState();
    if (supabase) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }, [clearSessionState]);

  const hydrateSession = useCallback(async () => {
    const generation = ++sessionGenerationRef.current;
    resetSessionInvalidation();
    setIsHydrating(true);
    setIsHydrated(false);

    try {
      const currentPathname = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
      const response = await http.get('/v1/auth/me', {
        skipAuthInvalidation: isPublicBookingPath(currentPathname),
      });
      const payload = response?.data || response;
      if (generation !== sessionGenerationRef.current) return { ok: false, message: '' };

      if (!response?.ok || !payload?.user) {
        clearSessionState();
        return { ok: false, message: response?.error?.message || 'No se pudo hidratar la sesion.' };
      }

      const enrichedUser = buildEnrichedUser(payload);
      applyUserState(enrichedUser);
      setIsHydrating(false);
      setIsHydrated(true);
      return { ok: true };
    } catch (err) {
      if (generation !== sessionGenerationRef.current) return { ok: false, message: '' };
      clearSessionState();
      if (Number(err?.status) === 401) {
        restrictRewardContextToUser();
        return {
          ok: false,
          expectedUnauthenticated: true,
          message: '',
        };
      }
      return {
        ok: false,
        message: err?.data?.error?.message || err?.message || 'No se pudo hidratar la sesion.',
      };
    }
  }, [applyUserState, clearSessionState]);

  const login = useCallback(async (identifier, contrasena, remember, options = {}) => {
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    const password = String(contrasena || '');
    const replaceActiveSession = Boolean(options?.replaceActiveSession);

    if (!normalizedIdentifier || !password) {
      return { ok: false, message: 'Correo y contrasena son requeridos.' };
    }

    if (!isLikelyEmail(normalizedIdentifier)) {
      return { ok: false, message: 'Ingresa un correo valido para iniciar sesion.' };
    }

    const generation = ++sessionGenerationRef.current;
    try {
      const response = await http.post('/v1/auth/login', {
        identifier: normalizedIdentifier,
        email: normalizedIdentifier,
        contrasena: password,
        remember: Boolean(remember),
        ...(replaceActiveSession ? { replace_active_session: true } : {}),
      }, {
        skipCsrf: true,
      });

      if (generation !== sessionGenerationRef.current) return { ok: false, message: '' };
      if (!response?.ok) {
        return {
          ok: false,
          code: response?.error?.code || null,
          message: resolveLoginErrorMessage(response?.error?.message || response?.message, response?.error?.code),
        };
      }

      const hydrated = await hydrateSession();
      if (!hydrated.ok) {
        return { ok: false, message: hydrated.message || 'La sesion no se pudo completar.' };
      }

      return { ok: true, message: 'Login exitoso' };
    } catch (err) {
      if (generation !== sessionGenerationRef.current) return { ok: false, message: '' };
      clearSessionState();
      return {
        ok: false,
        code: err?.data?.error?.code || null,
        message: resolveLoginErrorMessage(err?.data?.error?.message || err?.message, err?.data?.error?.code),
      };
    }
  }, [clearSessionState, hydrateSession]);

  const completeExchangeLogin = useCallback(async () => {
    const hydrated = await hydrateSession();
    if (!hydrated.ok) {
      return { ok: false, message: hydrated.message || 'No se pudo completar la sesion social.' };
    }
    return { ok: true };
  }, [hydrateSession]);

  const logout = useCallback(() => {
    if (logoutRequestRef.current) return logoutRequestRef.current;
    const request = (async () => {
      try {
        const response = await http.post('/v1/auth/logout', {}, { skipAuthInvalidation: true });
        const payload = response?.data || response;
        if (response?.ok !== true || payload?.logged_out !== true) throw new Error('LOGOUT_UNCONFIRMED');
        setLogoutError('');
        writeSharedTimestamp(SESSION_MANUAL_LOGOUT_KEY);
        removeSharedTimestamp(SESSION_IDLE_EXPIRED_KEY);
        invalidateSession('logout');
        return { ok: true, logged_out: true };
      } catch {
        const message = 'No se confirmó el cierre de sesión en el servidor. Intenta nuevamente.';
        setLogoutError(message);
        return { ok: false, logged_out: false, message };
      } finally {
        logoutRequestRef.current = null;
      }
    })();
    logoutRequestRef.current = request;
    return request;
  }, [invalidateSession]);

  const expireIdleSession = useCallback(async ({ broadcast = true } = {}) => {
    if (idleExpirationHandledRef.current) return;
    idleExpirationHandledRef.current = true;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (broadcast) {
      writeSharedTimestamp(SESSION_IDLE_EXPIRED_KEY);
    }
    persistIdleSessionMessage();
    sessionGenerationRef.current += 1;
    abortInFlightRequests('AUTH_SESSION_IDLE_EXPIRED');
    restrictRewardContextToUser();
    clearSessionState();
    if (supabase) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    try {
      const response = await http.post('/v1/auth/logout', {}, {
        skipAuthInvalidation: true,
      });
      if (response?.ok !== true || (response?.data || response)?.logged_out !== true) throw new Error('LOGOUT_UNCONFIRMED');
      setLogoutError('');
    } catch {
      const message = 'Se ocultó la sesión local por inactividad, pero no se confirmó su cierre en el servidor.';
      setLogoutError(message);
      persistIdleSessionMessage(message);
    }
    navigate('/login', { replace: true });
  }, [clearSessionState, navigate]);

  const touchBackendSession = useCallback(async () => {
    if (backendTouchInFlightRef.current) return;
    const now = Date.now();
    const lastSharedTouchAt = readSharedTimestamp(SESSION_LAST_BACKEND_TOUCH_KEY);
    if (now - lastSharedTouchAt < IDLE_BACKEND_TOUCH_THROTTLE_MS) return;

    backendTouchInFlightRef.current = true;
    writeSharedTimestamp(SESSION_LAST_BACKEND_TOUCH_KEY, now);
    try {
      await http.post('/v1/auth/session/touch', {}, {
        cache: false,
        dedupe: false,
      });
    } catch (error) {
      if (String(error?.code || error?.data?.error?.code || '').trim().toUpperCase() === 'AUTH_SESSION_IDLE_EXPIRED') {
        void expireIdleSession();
      }
    } finally {
      backendTouchInFlightRef.current = false;
    }
  }, [expireIdleSession]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    const now = Date.now();
    const lastActivityAt = readSharedTimestamp(SESSION_LAST_ACTIVITY_KEY) || now;
    const expiresInMs = Math.max(0, IDLE_SESSION_TIMEOUT_MS - (now - lastActivityAt));
    idleTimerRef.current = setTimeout(() => {
      const latestActivityAt = readSharedTimestamp(SESSION_LAST_ACTIVITY_KEY) || lastActivityAt;
      if (Date.now() - latestActivityAt >= IDLE_SESSION_TIMEOUT_MS) {
        void expireIdleSession();
        return;
      }
      resetIdleTimer();
    }, expiresInMs);
  }, [expireIdleSession]);

  const recordSessionActivity = useCallback(({ touchBackend = true } = {}) => {
    if (!user?.id_usuario || !shouldTrackIdleSession(location.pathname)) return;
    writeSharedTimestamp(SESSION_LAST_ACTIVITY_KEY);
    removeSharedTimestamp(SESSION_IDLE_EXPIRED_KEY);
    resetIdleTimer();
    if (touchBackend) {
      void touchBackendSession();
    }
  }, [location.pathname, resetIdleTimer, touchBackendSession, user?.id_usuario]);

  useEffect(() => {
    const unsubscribe = registerSessionInvalidationHandler((event) => {
      const reason = String(event?.reason || event?.code || '').trim().toUpperCase();
      if (reason === 'AUTH_SESSION_IDLE_EXPIRED') {
        void expireIdleSession();
        return;
      }
      invalidateSession('private_endpoint_401');
    });
    return unsubscribe;
  }, [expireIdleSession, invalidateSession]);

  useEffect(() => {
    if (!user?.id_usuario || !shouldTrackIdleSession(location.pathname)) {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return undefined;
    }

    const resetFromActivity = () => {
      recordSessionActivity();
    };
    const resetFromMouseMove = () => {
      const now = Date.now();
      if (now - lastMouseMoveAtRef.current < IDLE_MOUSEMOVE_THROTTLE_MS) return;
      lastMouseMoveAtRef.current = now;
      recordSessionActivity();
    };

    recordSessionActivity();

    SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetFromActivity, { passive: true });
    });
    window.addEventListener('mousemove', resetFromMouseMove, { passive: true });

    return () => {
      SESSION_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetFromActivity);
      });
      window.removeEventListener('mousemove', resetFromMouseMove);
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [location.pathname, location.search, recordSessionActivity, user?.id_usuario]);

  useEffect(() => {
    if (!user?.id_usuario || !shouldTrackIdleSession(location.pathname)) return undefined;

    const handleStorage = (event) => {
      if (event.key === SESSION_LAST_ACTIVITY_KEY && event.newValue) {
        resetIdleTimer();
        return;
      }
      if (event.key === SESSION_IDLE_EXPIRED_KEY && event.newValue) {
        void expireIdleSession({ broadcast: false });
        return;
      }
      if (event.key === SESSION_MANUAL_LOGOUT_KEY && event.newValue) {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        invalidateSession('manual_logout_other_tab');
        navigate('/login', { replace: true });
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [expireIdleSession, invalidateSession, location.pathname, navigate, resetIdleTimer, user?.id_usuario]);

  useEffect(() => {
    recordSessionActivity();
  }, [location.key, recordSessionActivity]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentPathname = window.location?.pathname || '';

    if (currentPathname.startsWith('/auth/callback')) {
      return;
    }
    if (shouldHydrateForPath(currentPathname)) {
      const timer = setTimeout(() => {
        void hydrateSession();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [hydrateSession]);

  const value = useMemo(
    () => ({
      token,
      user,
      roles,
      branchIds,
      empresaId,
      empleadoId,
      clienteId,
      isAuthenticated: Boolean(user?.id_usuario),
      isHydrating,
      isHydrated,
      login,
      completeExchangeLogin,
      hydrateSession,
      logout,
      logoutError,
      invalidateSession,
      syncClienteProfile,
    }),
    [
      token,
      user,
      roles,
      branchIds,
      empresaId,
      empleadoId,
      clienteId,
      isHydrating,
      isHydrated,
      login,
      completeExchangeLogin,
      hydrateSession,
      logout,
      logoutError,
      invalidateSession,
      syncClienteProfile,
    ]
  );

  return <AuthContext.Provider value={value}>
    {logoutError ? <div role="alert" className="p-3 text-sm text-[var(--mf-text)]">
      <p>{logoutError}</p>
      <button type="button" className="mt-2 underline" onClick={() => void logout()}>Reintentar cierre</button>
    </div> : null}
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }

  return ctx;
}
