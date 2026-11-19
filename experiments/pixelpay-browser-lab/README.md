# Laboratorio aislado del SDK PixelPay en navegador

Experimento fuera de `src`, de `public` y del checkout. No se integra en el bundle Vite, no tiene acceso a MasterFade, no consume `.env` y no admite entrada de credenciales, JWT, intents ni URLs del operador. Requiere Node 22+, las dependencias del repositorio y Chrome instalado. Usa un perfil efímero headless propio; no controla Chrome del usuario.

## Reproducción

Desde la raíz del frontend:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:pixelpay:browser
npm run lab:pixelpay:offline
node experiments/pixelpay-browser-lab/run.mjs --continue-false
node experiments/pixelpay-browser-lab/run.mjs --noaction
```

Estos comandos interceptan todas las solicitudes externas. El navegador resuelve únicamente loopback; los transportes externos se satisfacen con fixtures o se abortan. El SDK y su cifrado son reales; PixelPay, Cardinal y el challenge son simulados en este modo. No demuestra autenticación ni aprobación reales.

La observación no financiera ejecutada separadamente:

```sh
npm run lab:pixelpay:real-script
```

Permite **solo dos GET públicos estáticos exactos** definidos en `policy.mjs`: Songbird Sandbox y su chunk observado. Cada URL se despacha como máximo una vez, sin seguir redirecciones ni reintentos. Playwright obtiene el script con `route.fetch` y entrega su respuesta real al navegador en la URL original. No se modifica el script ni el SDK. No se usa un proxy financiero. Todo PixelPay sigue siendo sintético; **toda inicialización remota Cardinal, DDC, lookup, continue, callback, Status y POST financiero reales permanecen bloqueados**. Un cambio en la versión/ruta del chunk falla cerrado; no hay autorización por dominio completo.

CI ejecuta exclusivamente el modo offline. No se guardan consola del SDK, HAR, trazas, capturas, cuerpos ni cabeceras. El SDK activa internamente logging en Sandbox: el laboratorio no captura esa consola. Solo publica códigos fijos, contadores, booleanos, versiones y hashes. Las rutas estáticas públicas se distinguen de cualquier query o payload, que no se publica.

## Resultado reproducido

El SDK se sirve directamente de `@pixelpay/sdk-core` **2.5.8**, `lib/browser/index.js`, sin recompilar ni sustituir métodos. SHA-256:

`762380fba627c785d33662e3386c80d757a94311bea874155254051c9a342293`

Su metadato interno `sdk_version` es **2.5.8-beta.0**, aunque la versión instalada del paquete es 2.5.8. Se conserva sin modificar.

El ejemplo construye `Settings`, `Card`, `Billing`, `Item`, `Order`, `SaleTransaction`, llama `withAuthenticationRequest()` y `Transaction.doSale()`. Usa el preset público `setupSandbox()`; no configura credenciales del comercio ni firma privada. Los datos de orden y tarjeta son fixtures fijos. La suficiencia de ese preset para operaciones reales del comercio **no se probó**.

| Etapa | Navegador con transporte sintético | Songbird real, resto sintético/bloqueado |
| --- | --- | --- |
| Construcción nativa y solicitud 3DS | PASS | PASS |
| `merchant/public_key`, cifrado, Sale inicial | Fixture 200, cifrado nativo, fixture 202 `songbird` | Iguales; cero solicitudes PixelPay reales |
| Carga Songbird | Fixture | Dos scripts reales HTTP 200; API Cardinal presente |
| Inicialización | Evento `setupComplete` simulado | Validación Cardinal real termina con error 10004 y entrada JWT sintética |
| DDC | No real; sessionId simulado | No completado; no comunicación DDC real |
| Lookup / challenge / continue | Fixtures; no desafío bancario | No alcanzados |
| Segundo POST Sale | Intentado por el SDK; bloqueado antes del despacho | No alcanzado |
| Pago / cita | Ninguno | Ninguno |

La muestra real sanitizada se conserva en `real-script-result.json`: Chrome 157.0.8103.79, **2026-11-16 00:06:54 UTC** (15 de noviembre en Tegucigalpa). Son dos GET estáticos reales y cero operaciones financieras. El estado 520 pertenece al `FailureResponse` construido por el SDK a partir del error Cardinal; **no es una respuesta HTTP 520 del gateway PixelPay**. El código 10004 con entrada sintética no permite diagnosticar el JWT de una operación histórica ni atribuir otros problemas al proveedor.

En transporte sintético se observan dos POST Sale intentados, el mismo `order_id`, monto y moneda, y `authentication_identifier` en el segundo. Ambos se contienen en el interceptor: el primero recibe un fixture; el segundo se aborta. La misma finalización se intenta después de `continue.success=false` y del evento `NOACTION` sin JWT. Esto caracteriza al cliente; **no acredita idempotencia remota**. El bloqueo es obligatorio y el resultado financiero permanece falso. La validación de hash del SDK rechaza su ejecución en navegador y debe permanecer en backend.

## Correlación de la última operación QA

El wrapper SSH autorizado respondió, pero las 120 líneas filtradas disponibles no contienen el identificador de la última operación. No se pudo atribuir a esa operación `songbird` ni presencia de payload. No se amplió el acceso ni se consultó Status. El HTTP 202, la marca durable y la ausencia de captura aportados por el operador son evidencia distinta del experimento y no se presentan como una nueva consulta Supabase. No se reutilizó esa operación ni su payload.

## Separación React / Node que sigue faltando

Documentación consultada mediante MCP oficial:

- [Venta sin tokenización JavaScript](https://docs.pixelpay.com/page/sdk/use-cases/payments/without-tokenization/javascript).
- [Peticiones 3DS](https://docs.pixelpay.com/page/sdk/requests#3ds).

El ejemplo demuestra que el SDK puede gestionar Songbird dentro del navegador cuando **él inicia** `doSale`. No demuestra cómo reanudar públicamente un HTTP 202 emitido por Node sin iniciar otra Sale. `Services.Transaction` exporta `doSale`, `doAuth`, operaciones financieras y Status; no expone un método documentado de reanudación de una respuesta Node. `CardinalManager` existe como módulo interno, recibe `Settings` y la transacción, y utiliza servicios que construyen `x-auth-key`/`x-auth-hash`; no se sustituye, parchea ni se presenta ese import interno como contrato público acreditado.

`dev` ya contiene `createSongbirdSession` y `SongbirdBridgePanel`: handoff `songbird-sandbox-v1`, lease, expiración, transportes backend `setup`/`validated` y finalización bloqueada. No se propone otro protocolo. Ese adaptador sustituye `manager.service` y utiliza una fachada Cardinal; este laboratorio deliberadamente no lo importa ni lo modifica, porque la prueba solicitada exige el SDK nativo sin esas sustituciones.

La adaptación mínima pendiente es reutilizar ese handoff durable, acreditando una entrada de continuación **oficialmente soportada** que entregue solo un token efímero a la sesión autenticada del navegador y mantenga las credenciales reutilizables y verificaciones financieras en Node. Hay que confirmar cómo correlacionar setup, sessionId, lookup, autenticación y finalización con la misma operación, y qué adaptación del servicio SDK respalda el proveedor. No basta ejecutar un segundo `doSale()` en React ni considerar el éxito 3DS como pago. Este experimento no acredita ni reemplaza el contrato del puente existente.

La siguiente prueba completa requiere una operación nueva autorizada y un JWT auténtico nuevo; no el intent incierto existente. Antes de permitir el segundo POST hay que acreditar con PixelPay la semántica de continuación, los identificadores obligatorios, la garantía de no duplicación y el comportamiento con `continue.success=false`, timeout, replay y recarga. El laboratorio **no contiene un modo de desbloquearlo**. El error de la entrada sintética no prueba que un JWT auténtico falle ni que necesariamente se requiera una credencial privada para iniciar Songbird; esos extremos permanecen sin acreditar.

**Dictamen:** GO para cargar/observar el SDK y Songbird en aislamiento; NO-GO para DDC/challenge autenticados o finalización financiera con la evidencia actual. No hace falta investigar infraestructura ni repetir Sales para acreditar la carga del script.

## Aislamiento y rollback

No cambia ningún archivo de `src`, backend, esquema, variable operativa, contrato v2, claim, marca durable QA ni callback. No hay despliegue o merge. Para retirar el experimento se revierte este PR: carpeta, workflow, scripts npm y dependencia exclusivamente de desarrollo `playwright-core`. No hay datos que revertir ni flags que apagar.
