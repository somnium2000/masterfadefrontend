# Adaptador experimental Node / React para PixelPay 2.5.8

Este componente no está montado en `App`, `useBookingPayment` ni el checkout. Es un prototipo ejecutable de escritorio con SDK real, Cardinal/proveedor simulados y transporte HTTP real de loopback. No confirma reservas ni garantiza que una Sale inicial exija 3DS.

## Recorrido

`DelegatedPixelPayPrototype` inicia una sola vez `runDelegatedPixelPay`. Crea `SaleTransaction` en el cliente y aplica `withAuthenticationRequest()`, sin credenciales, tarjeta ni par de claves. Solicita al transporte vinculado al intento que Node ejecute su Sale inicial independiente. Esa petición Node mantiene la rama sin bandera del flujo actual; no se desactiva una bandera previa ni se envía el objeto React para alterar su serialización.

Al recibir un 202 songbird capturado por Node, construye el gestor **interno** `@pixelpay/sdk-core/lib/libraries/CardinalManager.js` y asigna el servicio delegado a su instancia. `manager.init(payload, collection_url)` sigue siendo nativo. SDK controla eventos/challenge; el adaptador sólo transporta:

- `authenticationLookup`: referencia y campos de dispositivo permitidos.
- `authenticationContinue`: payload opaco, sin decodificarlo ni interpretar JWT.
- `retryTransaction`: body vacío; Node selecciona su transacción original y el identificador recibido del proveedor.

Las respuestas reales del SDK Node se serializan con campos permitidos y se rehidratan para el gestor. No se fabrican respuestas exitosas para forzar avance. Tras terminar el gestor, se consulta el estado de Node; el resultado del navegador por sí solo nunca confirma pago. Un fallo durante el transporte detiene el avance, conserva incertidumbre y no inicia otra Sale. Se permite un gestor por página por los eventos globales de Cardinal; ante interrupción incierta hay que recargar antes de otra sesión de prueba.

La sustitución de `manager.service` es una **extensión de aplicación experimental**, no una API pública documentada de PixelPay. No se modifican archivos ni prototipos del SDK. `doSale()` nunca se llama en este adaptador React.

## Pruebas

Con dependencias instaladas y el checkout backend del PR compañero:

```powershell
$env:PIXELPAY_PROTOTYPE_BACKEND = 'C:\ruta\al\backend-del-prototipo'
npm run test:vitest -- src/features/payments/__tests__/delegatedPixelPay.test.jsx
npm run lint
npm run build
```

Tres casos focalizados: gestor real con transporte controlado y estado financiero decidido por Node; componente React con HTTP real al servidor Node aislado (incluye rechazo de capability ajena y doble clic); fallo de transporte sin avance ni nueva sesión. Sin la variable, CI omite sólo el caso que requiere ambos repositorios. La ejecución local conjunta sí lo incluye. jsdom y Cardinal son simulados, no un navegador con iframe bancario real. Los workers backend bloquean toda conexión externa, conservan el contexto criptográfico y aíslan el estático `runningTransaction` por intento. Las credenciales del servidor de escritorio son inventadas.

El servidor de escritorio vive en `scripts/pixelpay-delegated-desktop.mjs` del backend; se inicia/cierra automáticamente desde el test. No se despliega ni se conecta al VPS. Sólo acepta operaciones fijas ligadas a capabilities efímeras, sin proxy de URL ni parámetros financieros elegibles por React. El resto de las validaciones de identidad/roles/CSRF y persistencia deben conectarse al flujo actual antes de QA real.

Resultado: continuación del 202 demostrada localmente; garantía de solicitud inicial 3DS pendiente. La bandera true en Node sigue produciendo `InvalidTransactionTypeException` antes de HTTP. Un 200 sin autenticación nunca se considera validación de 3DS. No se usa `getStatus()` remoto: `status` es memoria local; el contrato anidado `last_response.data` y la evidencia durable siguen pendientes para una integración financiera completa.

Backend contiene el reporte detallado `docs/pixelpay-delegated-desktop.md`, instrucciones, matriz de pruebas, límites y condiciones previas a QA. El PR documental #144 y el catálogo #143 se mantienen separados. Este cambio no requiere despliegue y se revierte sin tocar datos ni infraestructura.
