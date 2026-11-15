# SDK oficial y sesión Sandbox QA

Se parte de dev con #107. La integración usa la capacidad de elegibilidad existente
y la marca backend `qa_sandbox_session`: no hay flag de navegador que autorice Sales.
El checkout informa que cada reserva nueva permite una operación inicial y que
un resultado pendiente no se reenvía. La marca se conserva al recargar; no guarda
tarjeta, JWT ni payload. No cambia las decisiones de monto/identidad/pago de backend.

## Reproducción sin alterar métodos internos

`src/features/payments/__tests__/fixtures/officialPixelPaySale.js` reproduce los
modelos y llamadas públicas del ejemplo oficial, con identidad/credenciales/endpoint
sintéticos y L 1. Usa fecha 07/2028 del ejemplo SDK. La única alternativa ejecutada
es async/await, no además el ejemplo callback (sería otra invocación).

`officialPixelPaySdk.test.jsx` ejecuta Transaction.doSale y CardinalManager nativos.
Axios.defaults.adapter sustituye solo transporte; script y Cardinal son dependencias
externas simuladas. No se reemplazan doSale, Helpers ni métodos de CardinalManager.
Se comprueba la identidad de los métodos. Socket, fetch y XHR externos están bloqueados.
El test no usa songbirdSession.js ni su reemplazo de service/retryTransaction.

El flujo nativo probado llega a script → setup → lookup → challenge → continue →
intento de segundo POST Sale, que se bloquea en la frontera HTTP. También se observa
ese intento con continue.success=false. Esto caracteriza el SDK; NO demuestra que
Cardinal/PixelPay hayan autenticado un pago real. No se habilita esa continuación.

El ejemplo completo necesita Settings con autenticación: el test demuestra que
x-auth-key/x-auth-hash configurados acompañan las llamadas. setupSandbox trae sus
credenciales públicas de prueba en el SDK, que no deben confundirse con llaves del
comercio. No se envían estas últimas al frontend. Sin Settings autenticado, firma
por orden sola no inicia HTTP. verifyPaymentHash tampoco funciona en el navegador.

Las muestras temporales de los dos videos fueron revisadas localmente: Hosted/firma
en el primero, y Peticiones 3DS/venta JavaScript en el segundo, concordantes con MCP.
No son una ejecución bancaria ni evidencia de interoperabilidad React/Node.

Fuentes:
- https://docs.pixelpay.com/page/sdk/requests#3ds
- https://docs.pixelpay.com/use-case?case=sdk%2Fpayments%2Fwithout-tokenization&lang=javascript&locale=es
- https://docs.pixelpay.com/page/sandbox/installation#test-cases-3ds

## Uso futuro, límites y retirada

El backend companion detalla activación única QA_PIXELPAY_SANDBOX_SESSION_ENABLED,
UNTIL UTC máximo cuatro horas, cuenta autorizada y nuevas órdenes/intents sin
configurar UUID por operación. Solo casos oficiales básicos/3DS con L 1 canónico;
montos 2–14 no se fuerzan. Se conservan holds QA de 30 minutos y restricciones Live/VIP.
El modo sigue apagado, no desplegado ni activado por este PR.

Falta la API pública soportada para entregar el 202 de Node al navegador, ejecutar
lookup/continue de forma segura y garantizar que el segundo POST sea la misma
operación remota deduplicada. PixelPay debe explicar también el retry tras continue
fallido. El puente previo permanece contract_blocked: no se disfraza de flujo nativo.

CI agrega la prueba nativa y conserva regresiones de recarga, doble envío, timeout,
sesión/identidad, VIP, incertidumbre y build QA. Rollback: backend revoca la sesión,
mantiene estados/claims y no reenvía pagos. No hay cambios remotos, merge o despliegue.
