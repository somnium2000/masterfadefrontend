import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { http, setTokenGetter } from '../services/httpClient.js';
import { supabase } from '../config/supabaseClient.js';

const AuthContext = createContext(null);

const LS_TOKEN_KEY = 'mf_auth_token';
const LS_USER_KEY = 'mf_auth_user';

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
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

function resolveLoginErrorMessage(rawMessage) {
  const fallback = 'Correo o contraseña incorrecta, inténtalo de nuevo.';
  const normalized = String(rawMessage || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes('invalid login credentials')) return fallback;
  if (normalized.includes('credenciales invalidas') || normalized.includes('credenciales inválidas')) return fallback;
  return String(rawMessage).trim();
}

export function AuthProvider({ children }) {
  const initialToken = localStorage.getItem(LS_TOKEN_KEY) || '';
  const initialUser = initialToken ? safeJsonParse(localStorage.getItem(LS_USER_KEY) || 'null') : null;

  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState(initialUser);
  const [roles, setRoles] = useState(normalizeRoles(initialUser?.roles));
  const [branchIds, setBranchIds] = useState(normalizeBranchIds(initialUser?.branch_ids));
  const [empresaId, setEmpresaId] = useState(initialUser?.empresa_id ?? null);
  const [empleadoId, setEmpleadoId] = useState(initialUser?.empleado_id ?? null);
  const [clienteId, setClienteId] = useState(initialUser?.cliente_id ?? null);
  const [isHydrating, setIsHydrating] = useState(Boolean(initialToken));
  const [isHydrated, setIsHydrated] = useState(!initialToken);

  const tokenRef = useRef(initialToken);
  const shouldPersistRef = useRef(Boolean(initialToken));

  const writeLocalSession = useCallback((nextToken, nextUser) => {
    if (shouldPersistRef.current && nextToken) {
      localStorage.setItem(LS_TOKEN_KEY, nextToken);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(nextUser));
      return;
    }

    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }, []);

  const applyUserState = useCallback((nextUser) => {
    setUser(nextUser);
    setRoles(normalizeRoles(nextUser?.roles));
    setBranchIds(normalizeBranchIds(nextUser?.branch_ids));
    setEmpresaId(nextUser?.empresa_id ?? null);
    setEmpleadoId(nextUser?.empleado_id ?? null);
    setClienteId(nextUser?.cliente_id ?? null);
  }, []);

  const clearSessionState = useCallback(() => {
    tokenRef.current = '';
    shouldPersistRef.current = false;
    setToken('');
    applyUserState(null);
    setIsHydrating(false);
    setIsHydrated(true);
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }, [applyUserState]);

  useEffect(() => {
    tokenRef.current = token;
    setTokenGetter(() => tokenRef.current || null);
  }, [token]);

  useEffect(() => {
    setTokenGetter(() => tokenRef.current || null);
    return () => setTokenGetter(null);
  }, []);

  const hydrateSession = useCallback(async (options = {}) => {
    const resolvedToken = options.tokenOverride ?? tokenRef.current;

    if (!resolvedToken) {
      clearSessionState();
      return { ok: false, message: 'No hay una sesion activa.' };
    }

    setIsHydrating(true);
    setIsHydrated(false);

    try {
      const response = await http.get('/v1/auth/me', { token: resolvedToken });
      const payload = response?.data || response;

      if (!response?.ok || !payload?.user) {
        clearSessionState();
        return { ok: false, message: response?.error?.message || 'No se pudo hidratar la sesion.' };
      }

      const enrichedUser = buildEnrichedUser(payload);

      tokenRef.current = resolvedToken;
      setToken(resolvedToken);
      applyUserState(enrichedUser);
      writeLocalSession(resolvedToken, enrichedUser);
      setIsHydrating(false);
      setIsHydrated(true);

      return { ok: true };
    } catch (err) {
      clearSessionState();
      return {
        ok: false,
        message: err?.data?.error?.message || err?.message || 'No se pudo hidratar la sesion.',
      };
    }
  }, [applyUserState, clearSessionState, writeLocalSession]);

  const login = useCallback(async (identifier, contrasena, remember) => {
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    const password = String(contrasena || '');

    if (!normalizedIdentifier || !password) {
      return { ok: false, message: 'Correo y contraseña son requeridos.' };
    }

    // AM: Fase 1 exige correo como identificador formal de autenticacion.
    if (!isLikelyEmail(normalizedIdentifier)) {
      return { ok: false, message: 'Ingresa un correo valido para iniciar sesion.' };
    }

    try {
      const response = await http.post('/v1/auth/login', {
        identifier: normalizedIdentifier,
        email: normalizedIdentifier,
        contrasena: password,
      });

      const payload = response?.data || response;

      if (!response?.ok || !payload?.token) {
        return {
          ok: false,
          code: response?.error?.code || response?.data?.error?.code || null,
          message: resolveLoginErrorMessage(response?.error?.message || response?.message),
        };
      }

      const resolvedToken = String(payload.token || '').trim();
      shouldPersistRef.current = Boolean(remember);
      tokenRef.current = resolvedToken;
      setToken(resolvedToken);
      setIsHydrating(true);
      setIsHydrated(false);

      if (shouldPersistRef.current) {
        localStorage.setItem(LS_TOKEN_KEY, resolvedToken);
      } else {
        localStorage.removeItem(LS_TOKEN_KEY);
        localStorage.removeItem(LS_USER_KEY);
      }

      const hydrated = await hydrateSession({ tokenOverride: resolvedToken });

      if (!hydrated.ok) {
        return { ok: false, message: hydrated.message || 'La sesion no se pudo completar.' };
      }

      return { ok: true, message: 'Login exitoso' };
    } catch (err) {
      clearSessionState();
      return {
        ok: false,
        code: err?.data?.error?.code || null,
        message: resolveLoginErrorMessage(err?.data?.error?.message || err?.message),
      };
    }
  }, [clearSessionState, hydrateSession]);

  const completeExchangeLogin = useCallback(async (appToken, options = {}) => {
    const resolvedToken = String(appToken || '').trim();
    if (!resolvedToken) {
      return { ok: false, message: 'Token de aplicacion invalido para completar sesion.' };
    }

    shouldPersistRef.current = options.remember !== false;
    tokenRef.current = resolvedToken;
    setToken(resolvedToken);
    setIsHydrating(true);
    setIsHydrated(false);

    if (shouldPersistRef.current) {
      localStorage.setItem(LS_TOKEN_KEY, resolvedToken);
    } else {
      localStorage.removeItem(LS_TOKEN_KEY);
      localStorage.removeItem(LS_USER_KEY);
    }

    const hydrated = await hydrateSession({ tokenOverride: resolvedToken });
    if (!hydrated.ok) {
      return { ok: false, message: hydrated.message || 'No se pudo completar la sesion social.' };
    }

    return { ok: true };
  }, [hydrateSession]);

  const logout = useCallback(() => {
    clearSessionState();
    if (supabase) {
      // AM: Limpieza defensiva de sesion social para evitar efectos residuales en callbacks futuros.
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }, [clearSessionState]);

  useEffect(() => {
    if (!tokenRef.current) return;
    // Hidrata sesión persistida en el arranque (lectura inicial de auth/me).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void hydrateSession();
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
      isAuthenticated: Boolean(token),
      isHydrating,
      isHydrated,
      login,
      completeExchangeLogin,
      hydrateSession,
      logout,
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
