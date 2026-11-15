# Puente React Songbird QA

Base frontend `3fc3e952b4eabf7f01116b841407a59e193d9afd`. Complementa el puente
Fastify de la rama backend `codex/songbird-bridge-20261115`, hacia `dev`.
GO de revisión/local; NO-GO de continuación real. No se ejecutó ningún pago,
Status externo, desafío Cardinal real, cambio operativo ni despliegue.

## Comportamiento

La capacidad estricta `pixelpaySongbirdBridge === true` solo vale en QA PixelPay
Sandbox con booking autorizado. Se revoca durante revalidación, error y cambio de
identidad. No concede Sale ni VIP. Un intent diagnóstico pendiente muestra estado
local del puente; no restaura tarjeta ni vuelve a enviar Sale al recargar.
El panel se activa después del inicio pendiente, fuera de la petición inicial en
curso. Si la recarga precede a la respuesta del proveedor, Actualizar estado 3DS
consulta solo metadatos; nunca reclama automáticamente el handoff.

`SongbirdBridgePanel` guarda únicamente estado visible. El handoff transitorio no
pasa por estado React ni storage/logs. Debe contener protocolo, orden canónica,
lease, caducidad y `ephemeral_contract_verified=true` otorgado por backend.
Sin esa acreditación no carga SDK ni script. La implementación backend actual
siempre devuelve `contract_blocked`: ningún flag habilita por sí solo el JWT.

`songbirdSession.js` fija `@pixelpay/sdk-core` 2.5.8 y reutiliza su
`CardinalManager.startCardinalTransaction`, exactamente la fase nativa que `init`
llama tras cargar/configurar Songbird. Conserva sus eventos y UI; no modifica el
SDK ni fabrica validaciones de origen. El único script admitido es el Sandbox
`https://songbirdstag.cardinalcommerce.com/edge/v1/songbird.js`. Logging Cardinal
apagado. No acepta URL desde el navegador/intent ni configura merchant credentials.

El transporte de la instancia SDK se sustituye por métodos cerrados que hablan
con Fastify: setupComplete → `setup`; validated → `validated`.
El servidor será quien deba autenticar lookup/continue cuando exista un contrato
acreditado. La implementación actual solo tiene fixtures sintéticos en tests.
`retryTransaction` nunca llama a un servicio financiero: devuelve fallo local,
incluso si el SDK intenta continuar después de NOACTION o una validación fallida.

Una sesión por navegador, un envío por fase, lease durable del servidor, abort por
cambio de cuenta/intent, cierre o TTL. El timeout también limita carga de script.
Se limpian handlers/UI y se borra la propiedad JWT al entregarla al SDK.
Esto no promete borrado físico de memoria de Cardinal. Recarga/pérdida de respuesta
recupera metadatos, sin reclamar/reemitir JWT ni repetir lookup/validación/Sale.
Un cierre local no libera el claim remoto: queda ocupado o expira de forma segura.

Una autenticación completa siempre informa que el pago sigue sin confirmar.
No se cambian callback financiero v2, captura, fecha financiera ni confirmación de
cita. El retorno del navegador tampoco constituye aprobación.

## Pruebas y límites

```text
npx vitest run src/hooks/usePrivateCommerce.test.jsx src/features/payments/__tests__/songbirdSession.test.jsx src/features/payments/__tests__/SongbirdBridgePanel.test.jsx src/features/public/booking/__tests__/qa3dsDiagnostic.test.jsx --maxWorkers=2
npm run lint
npm run build
```

El workflow incluye estos tests y las regresiones de reservas, recarga, timeout,
autorización explícita de Sale, VIP y navegación. Build QA usa VITE_ENTORNO=qa,
VITE_PAYMENT_PROVIDER=pixelpay, VITE_PIXELPAY_ENV=sandbox, solo en el proceso local/CI.
El SDK es real, Cardinal y respuestas de autenticación son simulados. No se acredita
un handoff remoto ni un pago 3DS con estos resultados. La dependencia agrega chunks
dinámicos; no carga Songbird mientras el contrato siga bloqueado.

## Dependencia contractual y retiro

Solicitar a PixelPay únicamente las garantías de JWT efímero ligado a la orden,
lookup/continue Node con EMV mínimo y validación de JWT/ACS, y continuación financiera
con deduplicación remota y recuperación sin repetir cobro. El backend detalla las
preguntas en `docs/qa-songbird-bridge.md`. No basta el mutex en memoria del SDK.

Rollback: backend revoca la capacidad; el frontend no carga ni reclama sesiones.
La lectura local de estados se conserva. No borrar claims/datos ni reutilizar el
intent histórico. Después de cerrar estados, retirar panel, sesión y dependencia
SDK en un cambio separado. No hay nueva bandera pública que habilite pagos.
