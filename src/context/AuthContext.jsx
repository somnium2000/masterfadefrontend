import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { http, setTokenGetter } from '../services/httpClient.js';

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

  function writeLocalSession(nextToken, nextUser) {
    if (shouldPersistRef.current && nextToken) {
      localStorage.setItem(LS_TOKEN_KEY, nextToken);
      localStorage.setItem(LS_USER_KEY, JSON.stringify(nextUser));
      return;
    }

    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }

  function applyUserState(nextUser) {
    setUser(nextUser);
    setRoles(normalizeRoles(nextUser?.roles));
    setBranchIds(normalizeBranchIds(nextUser?.branch_ids));
    setEmpresaId(nextUser?.empresa_id ?? null);
    setEmpleadoId(nextUser?.empleado_id ?? null);
    setClienteId(nextUser?.cliente_id ?? null);
  }

  function clearSessionState() {
    tokenRef.current = '';
    shouldPersistRef.current = false;
    setToken('');
    applyUserState(null);
    setIsHydrating(false);
    setIsHydrated(true);
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }

  useEffect(() => {
    tokenRef.current = token;
    setTokenGetter(() => tokenRef.current || null);
  }, [token]);

  useEffect(() => {
    setTokenGetter(() => tokenRef.current || null);
    return () => setTokenGetter(null);
  }, []);

  async function hydrateSession(options = {}) {
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
  }

  async function login(nombre_usuario, contrasena, remember) {
    const username = String(nombre_usuario || '').trim();
    const password = String(contrasena || '').trim();

    if (!username || !password) {
      return { ok: false, message: 'Usuario y contrasena son requeridos.' };
    }

    try {
      const response = await http.post('/v1/auth/login', {
        nombre_usuario: username,
        contrasena: password,
      });

      const payload = response?.data || response;

      if (!response?.ok || !payload?.token) {
        return { ok: false, message: response?.error?.message || response?.message || 'Credenciales invalidas.' };
      }

      shouldPersistRef.current = Boolean(remember);
      tokenRef.current = payload.token;
      setToken(payload.token);
      setIsHydrating(true);
      setIsHydrated(false);

      if (shouldPersistRef.current) {
        localStorage.setItem(LS_TOKEN_KEY, payload.token);
      } else {
        localStorage.removeItem(LS_TOKEN_KEY);
        localStorage.removeItem(LS_USER_KEY);
      }

      const hydrated = await hydrateSession({ tokenOverride: payload.token });

      if (!hydrated.ok) {
        return { ok: false, message: hydrated.message || 'La sesion no se pudo completar.' };
      }

      return { ok: true, message: 'Login exitoso' };
    } catch (err) {
      clearSessionState();
      return {
        ok: false,
        message: err?.data?.error?.message || err?.message || 'Error al intentar iniciar sesion.',
      };
    }
  }

  function logout() {
    clearSessionState();
  }

  useEffect(() => {
    if (!tokenRef.current) {
      setIsHydrated(true);
      setIsHydrating(false);
      return;
    }

    void hydrateSession();
  }, []);

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
      hydrateSession,
      logout,
    }),
    [token, user, roles, branchIds, empresaId, empleadoId, clienteId, isHydrating, isHydrated]
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
