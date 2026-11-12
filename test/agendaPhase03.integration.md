# QA-AGENDA-FASE-03 — Integración aislada

`agendaPhase03.integration.mjs` ejecuta controladores y guardas reales del backend junto con el build del frontend. No usa `.env`, Supabase ni una base remota: crea y elimina su propio cluster PostgreSQL en loopback y un proxy HTTP efímero para servir `dist`.

Requisitos externos al repositorio: binarios PostgreSQL, checkout backend con dependencias instaladas, Playwright con Chromium. No añade dependencias al producto.

```powershell
npm run build
$env:MASTERFADE_BACKEND_ROOT='C:\ruta\masterfadebackend'
$env:MASTERFADE_PHASE03_PG_BIN='C:\ruta\postgresql\bin'
$env:MASTERFADE_PLAYWRIGHT_MODULE='C:\ruta\node_modules\playwright'
node --test test/agendaPhase03.integration.mjs
```

Opcionales: `MASTERFADE_PHASE03_BUILD_DIR` (por defecto `dist`) y `MASTERFADE_PHASE03_EVIDENCE` (por defecto carpeta temporal `mf-phase03-evidence`). Sin Playwright se ejecutan las pruebas SQL/HTTP, pero no se debe informar validación de navegador.

Cobertura: búsqueda y reagendación existentes, roles/sucursal/estado, disponibilidad, rollback, LISTEN/NOTIFY real, SSE real, dos sesiones Chromium a 390/1440 px con zona Asia/Tokyo, cierre de Buscar reserva, hora hondureña persistida, nueva cita automática, evento perdido durante desconexión, reconexión, cambio de sucursal/jornada y capturas.

Límites explícitos: los perfiles/sesiones de autenticación, `/auth/me` y el contexto de sucursales son fixtures. La caducidad y el mantenimiento financiero ajenos al caso se interceptan. Las consultas de citas, disponibilidad, reagendación, autorización del controlador y SSE usan el backend real y SQL real. El trigger es sintético y reproduce el contrato del canal; no valida la definición ni configuración desplegada en QA. No ejecuta correos ni cobros.

La configuración remota debe conservar una conexión compatible con sesiones para LISTEN. Con pooler transaccional 6543, el backend existente exige `DATABASE_LISTEN_URL` con conexión directa/sesión; su prueba de configuración está en `test/db-connection-config.test.mjs` del backend. No se cambian esas variables mediante este script.
