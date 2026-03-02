# Phase 1 Manual Test Checklist

## Backend /v1/auth/me

1. Inicia el backend con variables JWT validas.
2. Haz login valido por usuario o email.
3. Copia el token retornado.
4. Ejecuta `GET /v1/auth/me` con `Authorization: Bearer <token>`.
5. Verifica:
   - `200`
   - `ok: true`
   - `data.roles` contiene roles reales
   - `data.branch_ids` refleja `roles_usuarios.id_sucursal`
   - `data.empresa_id` es un UUID unico o `null`
   - `data.empleado_id` y `data.cliente_id` son UUID o `null`
6. Repite con token invalido y verifica `401`.
7. Repite sin token y verifica `401` con `AUTH_TOKEN_REQUIRED`.

## Frontend auth e hidratacion

1. Borra `mf_auth_token` y `mf_auth_user` de `localStorage`.
2. Abre `/login`.
3. Inicia sesion con credenciales validas.
4. Verifica:
   - se guarda el token
   - se llama `/v1/auth/me`
   - el contexto queda con `user`, `roles`, `branchIds`, `empresaId`, `empleadoId`, `clienteId`
   - no hay recarga completa del navegador
5. Refresca una ruta protegida con `remember=true`.
6. Verifica que la sesion se rehidrata sin rebotar a `/unauthorized`.
7. Haz login con `remember=false`.
8. Verifica que la sesion vive solo en memoria y se pierde al refrescar.

## Routing y guardas

1. Entra a `/home` con `super_admin` y verifica redirect a `/home/super_admin`.
2. Entra a `/home` con `admin` y verifica redirect a `/home/admin`.
3. Entra a `/home` con `barbero` y verifica redirect a `/home/barbero`.
4. Entra a `/home` con `cliente` y verifica redirect a `/home/cliente`.
5. Intenta abrir una alias no permitida y verifica redirect a `/unauthorized`.
6. Sin autenticacion, intenta abrir `/home`, `/home/admin` y `/home/barbero`.
7. Verifica redirect a `/login`.

## Regresion visual y funcional

1. Verifica que `/`, `/login`, `/forgot-password`, `/reset-password` siguen funcionando.
2. Verifica que `Landing`, `Login` y `Home` muestran el nuevo logo script encima de `MASTERFADE`.
3. En tema oscuro, verifica que se usa la variante clara del logo.
4. En tema claro, verifica que se usa la variante oscura del logo.
5. Verifica que el halo dorado sutil del logo sea visible sin romper el layout existente.

## Build y smoke

1. En `masterfadefrontend`, ejecuta `npm.cmd run build`.
2. En `masterfadebackend`, valida que el servidor inicie y responda `POST /v1/auth/login` y `GET /v1/auth/me`.
