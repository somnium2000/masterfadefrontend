# Master Fade — Auth Frontend Plan

## Overview

El frontend maneja dos flujos de autenticación que convergen en un solo estado de sesión:

1. **Social Login** (Google/Facebook/Apple) via Supabase Auth
2. **Login Local** (email/password) via backend API

Ambos flujos terminan con un **APP JWT** emitido por el backend que es el token operativo para toda la app.

---

## Diagrama de estados

```
┌─────────────┐
│  NO_AUTH     │  (sin token, sin sesión)
└──────┬──────┘
       │
       ├── Social Login ──► Supabase Auth ──► /v1/auth/exchange ──┐
       │                                                          │
       ├── Login Local ──► /v1/auth/login ────────────────────────┤
       │                                                          │
       ▼                                                          ▼
┌─────────────┐                                         ┌────────────────┐
│  LOADING     │ ◄──────────────────────────────────────│  EXCHANGE_OK   │
└──────┬──────┘                                         └────────────────┘
       │
       ▼
┌─────────────┐
│  AUTH_OK     │  (APP JWT + user data en contexto)
└──────┬──────┘
       │
       ├── Token expirado ──► Redirect a /login
       │
       ├── Logout ──► Limpiar todo ──► NO_AUTH
       │
       └── Refresh (futuro) ──► /v1/auth/refresh
```

---

## AuthContext: Estado unificado

```
AuthContext {
  // Estado
  token: string | null        // APP JWT (del backend)
  user: {
    id_usuario, nombres, apellidos,
    roles: string[],
    branch_ids: uuid[]
  } | null
  isAuthenticated: boolean
  isLoading: boolean

  // Acciones
  loginLocal(email, password, remember): Promise<Result>
  loginSocial(provider: 'google'|'facebook'|'apple'): Promise<Result>
  logout(): void
}
```

---

## Flujo: Social Login

### Paso a paso

1. Usuario hace click en "Continuar con Google"
2. `AuthContext.loginSocial('google')` llama:
   ```js
   supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } })
   ```
3. Supabase redirige al provider, usuario autoriza, Supabase redirige de vuelta a `/auth/callback`
4. Componente `AuthCallback.jsx` (nuevo) se monta:
   ```js
   const { data: { session } } = await supabase.auth.getSession();
   ```
5. Con el `session.access_token` de Supabase, llama al backend:
   ```js
   const result = await http.post('/v1/auth/exchange', {
     supabase_token: session.access_token
   });
   ```
6. Backend verifica token con Supabase, busca/crea usuario, retorna APP JWT
7. `AuthContext` guarda el APP JWT y datos del usuario
8. Redirect a `/home`

### Archivos nuevos necesarios

- `src/pages/AuthCallback.jsx` — Componente que procesa el redirect de OAuth
- Agregar ruta `/auth/callback` en `App.jsx`

---

## Flujo: Login Local (ya implementado)

1. Usuario ingresa email + password en LoginPage
2. `AuthContext.loginLocal()` llama `POST /v1/auth/login`
3. Backend verifica con `fn_login_usuario`, retorna APP JWT
4. AuthContext guarda token + user
5. Redirect a `/home`

---

## Almacenamiento del Token

### Estrategia actual (Fase 0)
- **localStorage** para persistencia con "Remember me"
- **useState** (memoria) si no marca "Remember me"

### Estrategia futura (recomendada)
- Backend envía APP JWT como **httpOnly cookie** (`mf_token`)
- Frontend NO almacena token en JS
- `credentials: "include"` en fetch envía cookie automáticamente
- localStorage solo guarda datos no-sensibles del user (para UI)

### Migración
Cuando se implemente el cookie flow:
1. Backend agrega `Set-Cookie` en response de login/exchange
2. Frontend deja de leer `data.token` y lo remueve del state
3. httpClient ya tiene `credentials: "include"` (agregar en fetch options)
4. El token getter se vuelve innecesario (la cookie va sola)

---

## ProtectedRoute: Roles

```jsx
// Solo autenticados
<ProtectedRoute>
  <HomePage />
</ProtectedRoute>

// Solo admin y super_admin
<ProtectedRoute allowedRoles={['admin', 'super_admin']}>
  <AdminDashboard />
</ProtectedRoute>

// Solo barberos
<ProtectedRoute allowedRoles={['barbero', 'admin', 'super_admin']}>
  <BarberAgenda />
</ProtectedRoute>
```

Si el usuario no tiene el rol requerido, se redirige a `/unauthorized`.

---

## Refresh Strategy (futuro, no Fase 0)

- APP JWT tiene TTL de 12h
- Cuando expire, interceptar 401 en httpClient
- Intentar refresh: `POST /v1/auth/refresh` con refresh token (en cookie httpOnly)
- Si refresh falla, logout automático

---

## Checklist de implementación

- [x] AuthContext con login local
- [x] httpClient con token interceptor (setTokenGetter)
- [x] ProtectedRoute con roles
- [x] Supabase client configurado (`src/config/supabaseClient.js`)
- [ ] `loginSocial()` en AuthContext
- [ ] `AuthCallback.jsx` para procesar redirect OAuth
- [ ] Ruta `/auth/callback` en App.jsx
- [ ] Página `/unauthorized` (403)
- [ ] Migración a httpOnly cookie (post-MVP)
