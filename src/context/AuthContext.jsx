import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { http } from '../services/httpClient.js';
import { setTokenGetter } from '../services/httpClient.js';

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

export function AuthProvider({ children }) {
  const initialToken = localStorage.getItem(LS_TOKEN_KEY) || '';
  const initialUser = safeJsonParse(localStorage.getItem(LS_USER_KEY) || 'null');

  const [token, setToken] = useState(initialToken);
  const [user, setUser] = useState(initialUser);
  const tokenRef = useRef(token);

  // Mantener ref sincronizado para que httpClient siempre lea el valor actual
  useEffect(() => {
    tokenRef.current = token;
    setTokenGetter(() => tokenRef.current || null);
  }, [token]);

  // Registrar getter al montar, limpiar al desmontar
  useEffect(() => {
    setTokenGetter(() => tokenRef.current || null);
    return () => setTokenGetter(null);
  }, []);

  const isAuthenticated = Boolean(token);

  async function login(nombre_usuario, contrasena, remember) {
    const username = String(nombre_usuario || '').trim();
    const pass = String(contrasena || '').trim();

    if (!username || !pass) {
      return { ok: false, message: 'Usuario y contraseña son requeridos.' };
    }

    try {
      const data = await http.post('/v1/auth/login', {
        nombre_usuario: username,
        contrasena: pass,
      });

      // El backend ahora retorna { ok, data: { token, user } }
      const payload = data?.data || data;

      if (!data?.ok || !payload?.token) {
        return { ok: false, message: data?.error?.message || data?.message || 'Credenciales inválidas.' };
      }

      setToken(payload.token);
      setUser(payload.user || null);

      if (remember) {
        localStorage.setItem(LS_TOKEN_KEY, payload.token);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(payload.user || null));
      } else {
        localStorage.removeItem(LS_TOKEN_KEY);
        localStorage.removeItem(LS_USER_KEY);
      }

      return { ok: true, message: 'Login exitoso' };
    } catch (err) {
      return {
        ok: false,
        message: err?.data?.error?.message || err?.message || 'Error al intentar iniciar sesión.',
      };
    }
  }

  function logout() {
    setToken('');
    setUser(null);
    localStorage.removeItem(LS_TOKEN_KEY);
    localStorage.removeItem(LS_USER_KEY);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated,
      login,
      logout,
    }),
    [token, user, isAuthenticated]
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