# MasterFade - Auth Frontend Plan (Phase 1)

## Scope

- Current operational auth token in app: APP JWT from backend.
- Password verification source of truth: Supabase Auth only.
- Login identifier in this phase: email.

## Active flow

1. User enters `email + password` in `/login`.
2. Frontend calls `POST /v1/auth/login` with `identifier/email` and `contrasena`.
3. Backend authenticates with Supabase `signInWithPassword`.
4. Backend verifies internal profile in `public.usuarios` and returns APP JWT.
5. Frontend stores APP JWT (remember mode), then hydrates with `GET /v1/auth/me`.
6. Guards/routing use internal roles from hydrated claims.

## Notes

- AM: Legacy identifier keys (`nombre_usuario`, `username`) are temporary API aliases only.
- AM: They are normalized to one identifier, and Phase 1 requires that identifier to be email.
- Password reset remains Supabase-based (`forgot-password` + `reset-password` flow).

## Pending (not in this phase)

- OAuth social callback integration.
- httpOnly cookie migration for APP JWT.
- refresh token strategy.
