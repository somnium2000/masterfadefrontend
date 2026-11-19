# QA-MASTERPUNTOS-AJUSTE-ADMIN-01 — Frontend

Fecha: 2026-11-13. Base `origin/dev`: `6a04fbbcde14e198da73a50d1a15862d40b219ce`.
Rama de entrega: `qa/masterpuntos-ajuste-admin-01` en frontend y backend.

## A. Causa y resumen

El dev revisado ya tenía dos campos de ajuste y soportaba RESTAR. El bloqueo observado por diseño es el alcance de sucursal para admin; super admin puede restar globalmente. El cambio hace explícita la elección SUMAR/RESTAR con una cantidad única, sin relajar permisos ni la suma global existente. No se comprobó la versión desplegada de QA.

## B. Archivos

- `src/features/admin/pages/AdminMasterPuntosPage.jsx`.
- `src/features/admin/pages/__tests__/AdminMasterPuntosPage.qa18.test.jsx`.
- `scripts/masterpuntosAdminAdjustment.browser.mjs`.
- Este documento.

## C. Comportamiento

La misma pantalla `/home/admin/superpuntos` (o `/home/super/superpuntos`) envía al endpoint existente `/v1/admin/puntos/clientes/:id_cliente/ajuste` una acción `sumar`/`restar`, cantidad positiva y motivo obligatorio de 5 a 300 caracteres. Reutiliza el cliente HTTP y `x-idempotency-key`. Muestra operación y saldo previsto antes del botón; la resta conserva el modal e incluye cliente, motivo y ambos saldos. Bloquea cantidades inválidas y restas mayores al saldo visible; el backend valida definitivamente. Después de guardar recarga saldo/historial y limpia cantidad/motivo. Los reintentos del mismo payload conservan UUID.

## D. Validación

- PASS: 160 pruebas en cinco archivos (admin, lecturas y MasterPuntos cliente).
- PASS: cuatro casos Chrome, admin y super admin, 390 y 1440 px, temas claro y oscuro, suma/resta, confirmación/cancelación, historial y alcance visible. Sin desbordamiento horizontal ni errores JavaScript.
- PASS: build y lint de archivos modificados. Advertencia de tamaño de chunks en build.
- Backend asociado: PASS 118 pruebas; PASS 221 pruebas de PostgreSQL real aislado, sin skips.
- El primer intento del script de navegador detectó que el fixture omitía el nombre en el resumen; se completó el dato sintético y los cuatro casos pasaron. No fue una falla de la aplicación.

Reproducción:

```powershell
npx vitest run src/features/admin/pages/__tests__/AdminMasterPuntosPage.qa18.test.jsx src/features/admin/pages/__tests__/AdminMasterPuntosPage.reads.qa15.test.jsx src/features/admin/lib/__tests__/adminMasterPuntosApi.reads.qa15.test.js src/features/cliente/pages/__tests__/MasterPuntos.qa18b.test.jsx src/features/cliente/pages/__tests__/MasterPuntos.qa18c.test.jsx
npm run build
npx eslint src/features/admin/pages/AdminMasterPuntosPage.jsx src/features/admin/pages/__tests__/AdminMasterPuntosPage.qa18.test.jsx scripts/masterpuntosAdminAdjustment.browser.mjs
git diff --check
```

Navegador: en una consola iniciar `npx vite --host 127.0.0.1 --port 4197 --strictPort` con `VITE_API_URL=http://127.0.0.1:4197`; en otra, definir `MASTERFADE_PLAYWRIGHT_MODULE` con la ruta absoluta a una instalación local de Playwright y ejecutar `node --test scripts/masterpuntosAdminAdjustment.browser.mjs`. El script intercepta todas las APIs y produce capturas en `%TEMP%/mf-masterpuntos-admin-adjustment-evidence`. No envía solicitudes a QA, Supabase ni producción. No se agregaron dependencias ni se modificaron lockfiles.

## E. Riesgos, publicación y aceptación QA

La resta fuera de sucursal para admin seguirá rechazada. Se mantiene el alcance global de la suma vigente. Las demás operaciones de MasterPuntos, pagos, PixelPay, membresías y acumulación automática no se editaron; sus regresiones pertinentes pasaron. No se encontró un endpoint independiente de reversos de puntos: se verificó la compensación con un nuevo ajuste y la preservación del historial.

No requiere SQL/migración ni cambios de permisos Supabase. No se desplegó ni se fusionó a dev/main. Publicación en rama de revisión; SHAs finales en la entrega del chat, comprobables mediante `git ls-remote origin refs/heads/qa/masterpuntos-ajuste-admin-01`.

El propietario debe revisar/integrar ambas ramas y desplegar primero backend QA y después frontend QA. Usar cliente sintético activo de la sucursal del admin: saldo 5 → SUMAR 2 → 7 → RESTAR 3 → 4. Cancelar primero el modal no debe escribir. Confirmar y recargar deben mostrar +2/-3 con sus motivos y la historia anterior intacta. RESTAR 5 con saldo 4 debe bloquearse; cero/negativos/fracciones/texto deben rechazarse. Reenviar UUID y payload idénticos debe reproducir el mismo movimiento. Verificar rechazo a cliente/barbero y admin fuera de alcance de resta; super admin conserva alcance global. Realizar el smoke habitual de acumulación/canje/compensación en QA.

El informe técnico completo, comandos PostgreSQL y checklist de API están en `docs/qa-masterpuntos-ajuste-admin-01.md` del backend asociado. La aceptación sobre el despliegue QA corresponde al propietario.
