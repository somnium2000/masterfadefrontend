# QA-PAYMENT-RUNTIME-CRASH-02

## Incidente reproducido

En el HEAD 75380a8, Chromium y WebKit móviles mostraron RouteErrorBoundary al
abrir la confirmación desde Inicio. El build emitió React #185. En desarrollo:

```text
Maximum update depth exceeded.
dispatchSetState → useBookingPayment.js: restorePaymentContext
→ PublicBookingFlow.jsx: efecto de retorno de pago
```

El efecto restauraba un objeto nuevo de paymentIntent antes de comprobar
paymentReturnStatusCheckRef. La actualización volvía a disparar el efecto.
Abrir el diálogo terminaba excediendo el límite de actualizaciones de React;
el stack final incluía los refs de Radix Presence. No era un fallo financiero
ni un problema del botón. El diagnóstico temporal se hizo solo en el navegador
local con fixtures, sin modificar RouteErrorBoundary ni publicar trazas.

Además, volver al resumen de un intento recuperado sin la selección original
mostraba “Barbero por asignar” y un total cero. Ahora ofrece el diálogo de
salida protegido. El recorrido completo conserva el resumen original.

## Ejecución

La prueba carga el entrypoint compilado completo (main.jsx, App.jsx, Router,
providers, pasos y hooks reales). Solo intercepta red con fixtures sintéticos;
no contacta QA, Supabase ni proveedores. Usa fecha fija y no imprime bodies,
tarjetas, CVV, cookies, correos ni tokens. Las capturas opcionales se toman con
el formulario vacío y enmascaran el campo de correo.

Instalar Playwright en una carpeta temporal, sin cambiar package.json:

```powershell
npm install --prefix "$env:TEMP/masterfade-runtime-browser" playwright --no-package-lock --no-audit --no-fund
& "$env:TEMP/masterfade-runtime-browser/node_modules/.bin/playwright.cmd" install chromium webkit
```

Compilar localmente con la configuración QA PixelPay Sandbox. Estos valores
son exclusivos del proceso de prueba; no cambian archivos de entorno ni EasyPanel:

```powershell
$env:VITE_PAYMENT_PROVIDER='pixelpay'
$env:VITE_PIXELPAY_ENV='sandbox'
npm run build
npx vite preview --host 127.0.0.1 --port 4173
```

En otra terminal:

```powershell
$env:MASTERFADE_PLAYWRIGHT_MODULE="$env:TEMP/masterfade-runtime-browser/node_modules/playwright"
node --test test/paymentRuntime.browser.js
```

MASTERFADE_BROWSER_URL permite seleccionar otro preview local.
MASTERFADE_BROWSER_ARTIFACTS habilita capturas fuera del repositorio.
No requiere añadir dependencias al proyecto. Está separada de Vitest porque
necesita navegadores y un servidor de build, no JSDOM.

## Matriz

En Chromium y WebKit, iPhone 390×844 y escritorio 1440×900, visitante y Cliente:

| Caso | Comprobaciones |
| --- | --- |
| Agendar → Resumen → Tarjeta | Resumen real, hold e intento únicos |
| Inicio → Continuar pagando | Sin boundary/excepciones; formulario intacto |
| Volver al resumen completo | Resumen real; formulario limpio al regresar a Tarjeta |
| Salir → Continuar / Salir | Diálogo funcional; destino correcto; recuperación conservada |
| Atrás/Adelante durante Sale diferida | Seguimiento conservado, una sola petición de cobro y un solo intento |
| Recuperación link_generado / pendiente | Sin resumen ficticio, salida protegida, sin cobros ni liberaciones |
| Fallido terminal | Recuperación existente a agenda, sin nuevas operaciones |
| Confirmado | Éxito e Inicio directo, sin cancelación ni liberación |

Cada escenario rechaza errores de consola, pageerror y RouteErrorBoundary.
Las respuestas de Sale son exclusivamente sintéticas; no se ejecutan cargos.
WebKit con emulación móvil en Windows no equivale a un iPhone físico.

## Regresiones independientes

TodoPagoHostedModal.test.jsx mantiene tres fallos reproducidos también en
la base limpia 73c111e57ff0aa19aed59d7cd4c81ccd9dffbf81:

- PixelPay normal muestra su formulario sin contenido TodoPago
- PixelPay live elimina textos Sandbox y tarjetas de prueba
- simulator conserva su formulario y accion local

Son expectativas de presentación previas al incidente. No se modifican esos
tests ni TodoPago para ocultarlos; no se presenta la suite de regresión como PASS.
