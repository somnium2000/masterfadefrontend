# Checkout público con dos modalidades PixelPay

El handoff backend declara `continuation_mode=direct_api` o `songbird`. El adaptador valida la modalidad antes de iniciar el SDK:

| Modalidad | Inicio nativo | Desafío | Transporte al backend |
| --- | --- | --- | --- |
| Direct API | `manager.init(payload, collection_url)` con colección CAS válida | Collect y StepUp, si procede | lookup, retry, resultado financiero backend |
| Songbird | `manager.init(payload)` exclusivamente sin propiedad collection_url | Cardinal.setup init y Cardinal.continue, si procede | lookup, continue con JWT validado, retry, resultado financiero backend |

Un valor presente null/vacío/rechazado no selecciona Songbird. Se conserva el arreglo de namespaces window de PR123 (`0b741a8`): el bundle browser del SDK obtiene Requests, Models y Responses de exports o de window. No se introduce una bandera VITE para forzar Init.

El historial previo a frontend PR125 (`fc236c6^`) mantenía Songbird; PR125 restringió el handoff público a Direct API. Se recupera ese contrato explícito junto con los controles públicos actuales. Un evento SUCCESS del navegador no confirma un pago: el desafío Songbird necesita authenticationContinue aceptado por el servidor, y la UI solo refleja el resultado financiero devuelto por el backend.

La prueba compilada del SDK cubre lookup200/202, Songbird frictionless, Direct API, origen/ventana de iframe, duplicados, cancelación y caducidad. Los errores asíncronos de callbacks nativos se observan y detienen el flujo sin permitir otro Sale. El PR independiente de diagnóstico conserva códigos permitidos cuando el flujo no puede iniciarse o continuar, sin texto libre, tokens ni payloads.

## Prueba integrada reproducible

Con ambos checkouts instalados, ejecutar desde frontend:

```powershell
$env:PIXELPAY_INTEGRATION_BACKEND='RUTA_ABSOLUTA_AL_BACKEND_COMPANERO'
node scripts/pixelpay-public-integration.mjs
```

El workflow fija el backend compañero por SHA. El script exige esa ruta y falla si no existe; no omite silenciosamente la integración. Compila el hook useBookingPayment, publicBookingApi, el panel público real y el SDK browser con Vite. React habla HTTP en loopback con las rutas Fastify, autenticación y CSRF reales. El worker importa applicationWorker intacto después de sustituir únicamente el transporte del SDK. La DB y los mensajes remotos son sintéticos; sockets y fetch externos se bloquean.

Casos: Songbird completo, Direct API con desafío, Direct API frictionless, URL rechazada sin fallback, authenticationContinue rechazado y aprobación con hash incorrecto. Verifica un solo Sale ante doble clic, panel activo durante la autenticación, fases y cantidades correctas, una sola confirmación sintética backend cuando corresponde, rechazo financiero y ausencia de tarjeta/payload/token en sessionStorage.

Esto acredita control de flujo local y compatibilidad con el SDK instalado. No acredita el submotivo del unsupported Live ni un desafío bancario real. No modifica banderas de apertura ni archivos de entorno; no ejecuta despliegues, migraciones o pagos externos.
