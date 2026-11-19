# QA-MASTERPUNTOS-PAGO-CONFIRMADO-01 — Frontend

Fecha: 13 de noviembre de 2026. Base `origin/dev`: `3bb6271`. Cambios en worktree separado de ServiciosF; sus modificaciones locales se conservaron.

## A. Resumen frontend

Perfil y Ruta a tu cortesía leen automáticamente el saldo al regresar después del pago. El historial y la disponibilidad del canje se actualizan desde la misma lectura del resumen. Los textos operativos explican la acreditación al confirmar pago y reserva, la atribución al titular y la conservación ante inasistencia.

## B. Archivos modificados

- `src/features/cliente/hooks/useRefreshOnReturn.js`
- `src/features/cliente/pages/ClientePerfilPage.jsx`
- `src/features/cliente/components/ClienteCourtesyRouteSection.jsx`
- `src/features/public/booking/PublicBookingConfirmStep.jsx`
- `src/features/public/booking/PublicBookingFlow.jsx`
- `src/features/cliente/pages/__tests__/ClientePerfilPage.http-stale-401.test.jsx`
- `src/features/cliente/pages/__tests__/MasterPuntos.qa18c.test.jsx`
- `src/features/public/booking/__tests__/bookingCompanions.mf118.test.jsx`
- `test/masterpuntosIntegral.browser.mjs`
- `test/companionsMf118.browser.mjs`
- `docs/masterpuntos-borrador-pago-confirmado-01.md`
- Este informe.

## C. Pantallas/componentes afectados

`/home/cliente`, `/home/cliente/perfil`, resumen de reserva y aviso de acompañantes del flujo público/autenticado. No cambian formularios de tarjeta, pasarelas, montos, navegación principal, permisos ni endpoints.

## D. Cambios aplicados

- Lectura silenciosa al recibir focus o visibilitychange y al restaurar una página con pageshow.persisted. Los eventos se agrupan durante 100 ms y se retiran al desmontar o dejar de estar autenticado.
- El resumen también recarga cuando cambia la entrada de navegación. Perfil recarga al montarse y refresca el shell después de una respuesta vigente.
- Se mantienen aborts, generación de solicitud y aislamiento por identidad. Una lectura silenciosa que sustituye la carga inicial ahora libera correctamente el skeleton.
- Se sustituyen los mensajes de obtención después de completar/asistir por pago y reserva confirmados. Se mantiene la exclusión del titular canjeado y se explican los puntos de acompañantes.
- El borrador 0.3-RC2-MP enumera las cláusulas incompatibles del documento 08 y las menciones a diez minutos en documentos 01/05. Propone cinco minutos, coherente con el backend, y deja devoluciones/contracargos por aprobar. **No se modifica ni se importa otra versión de `legalTerms.v0.3-RC1.json`; el borrador nuevo no tiene vigencia legal.**

## E. Validaciones realizadas

| Validación | Resultado |
|---|---|
| Vitest: MasterPuntos, perfil, cambio de identidad, retorno de pago, acompañantes y documento legal anterior | **139 PASS**, 7 archivos, 0 FAIL |
| Chrome instalado, app compilada, grupos, canjes, VIP, móvil/escritorio, claro/oscuro, comercio activo/pausado | **26 PASS**, 0 FAIL |
| Refresco automático en Chrome de saldos 0/9/10/11/20 e historial, perfil 20 → 21 y retorno al dashboard, sin pulsar Actualizar | **PASS** en los ocho escenarios de perfil/resumen |
| Ausencia de excepciones JavaScript y desbordamiento horizontal | **PASS** |
| Inspección visual de capturas reales de 390 px oscuro y 1440 px claro | **PASS** |
| Build y ESLint de todos los archivos JS/JSX/MJS afectados | **PASS**; aviso existente de chunks >500 kB |
| `git diff --check` y ausencia de nuevas trazas console.* | **PASS** |

Las APIs del navegador están interceptadas con datos sintéticos; ninguna petición de prueba accede a QA, Supabase, pagos reales o correo. Se usan los componentes, router, autenticación cliente y cliente HTTP de la app compilada. El intento inicial con motores Playwright empaquetados falló al arrancar; el resultado final corresponde a Chrome instalado. No se presenta como certificación remota ni como prueba de una pasarela en vivo.

Para reproducir:

```powershell
npm ci --no-audit --no-fund
npm run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4189 --strictPort
```

En otra consola, configurar `MASTERFADE_PLAYWRIGHT_MODULE` hacia Playwright instalado, `MASTERFADE_BROWSER_URL=http://127.0.0.1:4189`, `MASTERFADE_CHROMIUM_CHANNEL=chrome` y `MASTERFADE_BROWSER_ENGINES=chromium`:

```powershell
node --test test/masterpuntosIntegral.browser.mjs test/companionsMf118.browser.mjs
npx vitest run src/features/cliente/pages/__tests__/MasterPuntos.qa18b.test.jsx src/features/cliente/pages/__tests__/MasterPuntos.qa18c.test.jsx src/features/cliente/pages/__tests__/ClientePerfilPage.http-stale-401.test.jsx src/features/public/booking/__tests__/bookingCompanions.mf118.test.jsx src/features/public/booking/__tests__/PublicBookingFlow.rewardSession.qa18d.test.jsx src/features/public/booking/__tests__/PublicBookingFlow.paymentReload.test.jsx src/features/public/pages/__tests__/LegalTermsPage.test.jsx
```

Capturas locales de esta ejecución: `%TEMP%/mf-masterpuntos-integral-evidence` y `%TEMP%/mf-points-companions-evidence`.

## F. Riesgos pendientes

La nueva migración manual backend debe aplicarse en QA antes de activar esta política operativa. Publicar código en `origin/dev` no aplica SQL ni despliega. Mientras QA conserve la función anterior, la acreditación seguirá dependiendo de completar la cita. No se aplicó SQL remoto ni se tocó Producción.

La aprobación comercial/legal del borrador y de la política de reembolsos/contracargos sigue pendiente. No se activa legalmente ningún texto nuevo.

## G. Impacto backend

El frontend utiliza los endpoints existentes de perfil y resumen. Requiere que backend haya confirmado su transacción y que QA tenga aplicada `db/manual/20261113161929_masterpuntos_paid_confirmation_v1.sql`. Backend entrega por separado su informe, SQL de inspección y pruebas de integridad, concurrencia y acreditación.
