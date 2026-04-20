import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { http } from '../services/httpClient.js';
import { supabase } from '../config/supabaseClient.js';

const AuthContext = createContext(null);

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
  const fallback = 'Correo o contrasena incorrecta, intentalo de nuevo.';
  const normalized = String(rawMessage || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized.includes('invalid login credentials')) return fallback;
  if (normalized.includes('credenciales invalidas')) return fallback;
  return String(rawMessage).trim();
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [branchIds, setBranchIds] = useState([]);
  const [empresaId, setEmpresaId] = useState(null);
  const [empleadoId, setEmpleadoId] = useState(null);
  const [clienteId, setClienteId] = useState(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  const applyUserState = useCallback((nextUser) => {
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

  const hydrateSession = useCallback(async () => {
    setIsHydrating(true);
    setIsHydrated(false);

    try {
      const response = await http.get('/v1/auth/me');
      const payload = response?.data || response;

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
      clearSessionState();
      return {
        ok: false,
        message: err?.data?.error?.message || err?.message || 'No se pudo hidratar la sesion.',
      };
    }
  }, [applyUserState, clearSessionState]);

  const login = useCallback(async (identifier, contrasena, remember) => {
    const normalizedIdentifier = String(identifier || '').trim().toLowerCase();
    const password = String(contrasena || '');

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
      });

      if (!response?.ok) {
        return {
          ok: false,
          code: response?.error?.code || null,
          message: resolveLoginErrorMessage(response?.error?.message || response?.message),
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
        message: resolveLoginErrorMessage(err?.data?.error?.message || err?.message),
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
    try {
      await http.post('/v1/auth/logout', {});
    } catch {
      // noop: de todas formas limpiamos estado local.
    }

    clearSessionState();
    if (supabase) {
      void supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }, [clearSessionState]);

  useEffect(() => {
    // AM: No hidratar sesion si estamos en /auth/callback — esa pagina maneja
    // su propio intercambio de tokens. Hidratacion prematura aqui generaria un
    // 401 en /v1/auth/me antes de que el exchange termine.
    if (window.location.pathname.startsWith('/auth/callback')) {
      // La pagina callback llama a completeExchangeLogin() cuando el exchange
      // termina exitosamente, lo que triggerea hydrateSession() en el momento correcto.
      setIsHydrating(false);
      setIsHydrated(true);
      return;
    }
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
      isAuthenticated: Boolean(user?.id_usuario),
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
