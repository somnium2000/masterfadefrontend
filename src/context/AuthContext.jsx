import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  abortInFlightRequests,
  http,
  registerSessionInvalidationHandler,
  resetSessionInvalidation,
} from '../services/httpClient.js';
import { supabase } from '../config/supabaseClient.js';

const AuthContext = createContext(null);
const IDLE_SESSION_TIMEOUT_MS = 20 * 60 * 1000;
const IDLE_MOUSEMOVE_THROTTLE_MS = 5000;
const IDLE_SESSION_MESSAGE = 'Sesión expirada por inactividad. Vuelve a iniciar sesión.';
const IDLE_SESSION_MESSAGE_KEY = 'mf_idle_session_message';
const SESSION_ACTIVITY_EVENTS = ['click', 'keydown', 'touchstart', 'scroll'];

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

function persistIdleSessionMessage() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(IDLE_SESSION_MESSAGE_KEY, IDLE_SESSION_MESSAGE);
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
  const idleTimerRef = useRef(null);
  const lastMouseMoveAtRef = useRef(0);
  const idleExpirationHandledRef = useRef(false);

  const applyUserState = useCallback((nextUser) => {
    if (nextUser?.id_usuario) {
      idleExpirationHandledRef.current = false;
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
    abortInFlightRequests(reason);
    clearSessionState();
    if (supabase) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }, [clearSessionState]);

  const hydrateSession = useCallback(async () => {
    setIsHydrating(true);
    setIsHydrated(false);

    try {
      const currentPathname = typeof window !== 'undefined' ? window.location?.pathname || '' : '';
      const response = await http.get('/v1/auth/me', {
        skipAuthInvalidation: isPublicBookingPath(currentPathname),
      });
      const payload = response?.data || response;

      if (!response?.ok || !payload?.user) {
        clearSessionState();
        return { ok: false, message: response?.error?.message || 'No se pudo hidratar la sesion.' };
      }

      const enrichedUser = buildEnrichedUser(payload);
      applyUserState(enrichedUser);
      resetSessionInvalidation();
      setIsHydrating(false);
      setIsHydrated(true);
      return { ok: true };
    } catch (err) {
      clearSessionState();
      if (Number(err?.status) === 401) {
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

  const logout = useCallback(async () => {
    invalidateSession('logout');
    try {
      await http.post('/v1/auth/logout', {}, { skipAuthInvalidation: true });
    } catch {
      // noop: de todas formas limpiamos estado local.
    }
  }, [invalidateSession]);

  const expireIdleSession = useCallback(async () => {
    if (idleExpirationHandledRef.current) return;
    idleExpirationHandledRef.current = true;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    persistIdleSessionMessage();
    abortInFlightRequests('AUTH_SESSION_IDLE_EXPIRED');
    clearSessionState();
    if (supabase) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    try {
      await http.post('/v1/auth/logout', {}, {
        skipAuthInvalidation: true,
      });
    } catch {
      // no-op: la sesion local ya quedo cerrada para UX.
    }
    navigate('/login', { replace: true });
  }, [clearSessionState, navigate]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      void expireIdleSession();
    }, IDLE_SESSION_TIMEOUT_MS);
  }, [expireIdleSession]);

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

    resetIdleTimer();

    const resetFromActivity = () => {
      resetIdleTimer();
    };
    const resetFromMouseMove = () => {
      const now = Date.now();
      if (now - lastMouseMoveAtRef.current < IDLE_MOUSEMOVE_THROTTLE_MS) return;
      lastMouseMoveAtRef.current = now;
      resetIdleTimer();
    };

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
  }, [location.pathname, location.search, resetIdleTimer, user?.id_usuario]);

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
      invalidateSession,
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
      invalidateSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);

  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }

  return ctx;
}
