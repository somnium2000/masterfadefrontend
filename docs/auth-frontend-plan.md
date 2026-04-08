# MasterFade - Auth Frontend Plan (Phase 1)

## Scope (frozen functional behavior)

- Operational auth token in app: APP JWT from backend.
- Password verification source of truth: Supabase Auth.
- Login identifier in this phase: email.
- No changes to endpoints, contracts, roles, redirects, or session strategy.

## Active flow (current behavior)

1. User enters `email + password` in `/login`.
2. Frontend calls `POST /v1/auth/login` with `identifier/email` and `contrasena`.
3. Backend authenticates with Supabase.
4. Backend verifies internal profile in `public.usuarios` and returns APP JWT.
5. Frontend persists token based on remember mode and hydrates with `GET /v1/auth/me`.
6. Guards/routing use internal roles from hydrated claims.
7. Social login path uses `/auth/callback` and `POST /v1/auth/exchange`, then continues to `/home`.

## Non-invasive improvements implemented

- Auth pages now expose accessible status/error semantics (`role=\"alert\"`, `role=\"status\"`, `aria-live`, `aria-busy`).
- Submit/interaction states are hardened to reduce duplicate actions during loading.
- `ForgotPasswordPage` uses shared `http` client (same endpoint and payload).
- Login visual layer was improved for desktop composition and premium consistency.
- Client shell/dashboard received visual continuity improvements from auth entry.

## Explicitly blocked in this phase (to protect functionality)

- Session refresh redesign.
- APP JWT cookie migration (`httpOnly`).
- OAuth policy changes (state model, callback business redirects, exchange semantics).
- Role/guard navigation behavior changes.

## No-regression checklist

- Login success still redirects to `/home`.
- Login error behavior remains equivalent.
- Google OAuth callback still ends in `/home`.
- Forgot/reset flows keep same endpoint contracts and user journey.
- Protected client pages still require valid hydrated session.
- `npm run lint` and `npm run build` remain green after auth UI changes.
