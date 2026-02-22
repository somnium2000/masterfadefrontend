import { createContext, useContext, useMemo, useState } from 'react';
import { http } from '../services/httpClient.js';

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

  const isAuthenticated = Boolean(token);

  async function login(nombre_usuario, contrasena, remember) {
    // Validación mínima (evita requests innecesarios)
    const username = String(nombre_usuario || '').trim();
    const pass = String(contrasena || '').trim();

    if (!username || !pass) {
      return { ok: false, message: 'Usuario y contraseña son requeridos.' };
    }

    try {
      // Backend: POST /v1/auth/login
      const data = await http.post('/v1/auth/login', {
        nombre_usuario: username,
        contrasena: pass,
      });

      if (!data?.ok || !data?.token) {
        return { ok: false, message: data?.message || 'Credenciales inválidas.' };
      }

      // Guardamos en memoria
      setToken(data.token);
      setUser(data.user || null);

      // Persistencia opcional
      if (remember) {
        localStorage.setItem(LS_TOKEN_KEY, data.token);
        localStorage.setItem(LS_USER_KEY, JSON.stringify(data.user || null));
      } else {
        localStorage.removeItem(LS_TOKEN_KEY);
        localStorage.removeItem(LS_USER_KEY);
      }

      return { ok: true, message: data.message || 'Login exitoso' };
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Error al intentar iniciar sesión.',
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