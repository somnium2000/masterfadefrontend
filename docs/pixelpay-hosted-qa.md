# PixelPay Hosted en reservas de QA

La opción Hosted usa la reserva temporal y el intento canónico existentes. La integración SDK sigue siendo el canal predeterminado. No hay una bandera de frontend que habilite Hosted: el selector aparece únicamente cuando el backend devuelve `hosted_available: true` en `/crear-intent` o `/estado`.

## Contrato

Las bases son `/v1/public/pagos` para grupos públicos y `/v1/pagos/reservas` para reservas de cliente autenticado. Se conserva la identidad y autorización actuales del grupo.

| Operación | Solicitud |
| --- | --- |
| Crear intento canónico | `POST /crear-intent`, contrato existente |
| Iniciar Hosted | `POST /pixelpay/hosted/start` |
| Consultar Hosted durable | `POST /pixelpay/hosted/status` |
| Recuperar canal y estado canónicos | `POST /estado` |

Las tres consultas con intento envían `{ id_grupo_cita, id_intent, titular_email }` en el cuerpo sensible, sin caché ni deduplicación del cliente HTTP. La deduplicación de inicio ocurre antes del request y la idempotencia definitiva corresponde al backend.

`Hosted start` devuelve `payment_channel: "hosted"`, los identificadores canónicos, `pending_confirmation: true`, `booking_confirmed: false`, `hosted_state` y, cuando está disponible, `checkout_url`. Una respuesta pendiente sin URL no provoca reenvío automático.

Antes de enviar el inicio se guarda el canal y la identidad en el contexto de recuperación de `sessionStorage`. No se persisten la URL de checkout, `paymentHash`, firma, credenciales, tarjeta o CVV.

### Validación de URL Sandbox

Backend y frontend exigen HTTPS, origen exacto `https://pixelpay.app`, `https://www.pixelpay.app` o `https://pixelpay.dev`, sin credenciales, puertos alternativos, fragmento, controles ni rutas codificadas ambiguas. Se permite `/sandbox/<token>/checkout/example`, que aparece en [Hosted Sandbox EN](https://pixelpay.zendesk.com/hc/en-us/articles/26640565481748-SandBox-PixelPay-Hosted-Payment), y se conserva la variante sin `/example`; no se admiten sufijos arbitrarios.

Los ejemplos generales de [Hosted ES](https://pixelpay.zendesk.com/hc/es-419/articles/360039834392-Hosted-Payment-Gateway) incluyen `/<comercio>/P-<uuid>/checkout`, y [Hosted EN](https://pixelpay.zendesk.com/hc/en-us/articles/26775620656148-Hosted-Payment-Gateway) muestra `/<comercio>/<identificador-opaco>/checkout`. Se reconocen como formas documentadas de Hosted, pero no demuestran ambiente Sandbox y siguen bloqueadas en QA. Tampoco existe evidencia Hosted suficiente para permitir `/<comercio>/S-<uuid>/checkout` solo por el prefijo observado en SDK. Falta una respuesta Sandbox auténtica que permita revisar esa frontera sin admitir un checkout Live.

La query admite únicamente `success=0|1`, `slug=sandbox`, `merchant=sandbox`, `payload` con alfabeto Base64 y `lang=es|en`. El `url=` del ejemplo oficial puede contener un solo enlace al mismo origen y ruta/token de checkout, sin otro `url=` anidado. Se rechazan otra ruta/token anidado, destinos directos externos, duplicados y overrides directos `callback`, `_callback`, `_complete`, `_cancel`, `redirect` o `next` en query. El payload permanece opaco: el validador no comprueba la orden ni los destinos internos o las redirecciones posteriores del checkout. Nunca demuestra titular, ambiente o pago; los destinos de terceros del ejemplo público no se ejecutan en las pruebas.

## Retorno y errores

Ambos retornos del proveedor apuntan a `/agendar/pagar?id_grupo_cita=<id>&id_intent=<id>`, sin correo en la URL. Los parámetros solo localizan la consulta autenticada. `_complete`, `hosted_return`, `paid`, `status` y `payment_hash` no confirman ni cancelan un pago.

Hosted no muestra campos locales de tarjeta ni facturación y nunca invoca Sale o Status del SDK. Al volver, el frontend consulta el estado durable. Un `paid` sin `booking_confirmed: true` del backend permanece en verificación.

Un timeout, aborto o pérdida de conexión después de iniciar conserva el bloqueo para otra creación o cobro. Si un rechazo HTTP determinista previo al claim permite recuperar un canal SDK, el cambio requiere que `/estado` responda explícitamente `payment_channel: "sdk"`. Un 404 de Hosted por sí solo no desbloquea una creación incierta.

Si vence el horario después de iniciar Hosted, se conserva la consulta del pago y no se ofrece otro cobro ni otra reserva desde esa operación. Cerrar el checkout o regresar por cancelación no equivale a anulación bancaria.

## Validación de QA

Validación local actualizada: suite de booking completa, **32 archivos y 353 pruebas aprobadas**, `npm run lint`, `npm run build` y `git diff --check` con código 0. El build conserva la advertencia habitual de tamaño de chunks. Estas pruebas usan contratos simulados; no acreditan checkout/callback reales del proveedor ni habilitación de la cuenta.

1. Mantener `PIXELPAY_HOSTED_ENABLED` apagada al desplegar ambos PR; ninguna variable `VITE_` activa comercio o la confirmación.
2. Tras autorización de despliegue y configuración de QA/Sandbox, verificar que el backend devuelve capacidad Hosted únicamente a la identidad autorizada.
3. Verificar selección SDK por defecto y posibilidad de elegir Hosted, sin campos de tarjeta locales.
4. En Sandbox, comprobar redirección a URL permitida, retorno de éxito, fallo y cancelación; todos consultan el estado canónico y conservan pendiente mientras el backend no pueda autenticar la evidencia financiera.
5. Comprobar doble clic, reload durante inicio, pérdida de conexión y expiración; no debe emitirse otro inicio, Sale o Status SDK para el mismo Hosted.

No se habilita Live ni se considera demostrada la viabilidad para la cuenta MasterFade. La documentación de `paymentHash` no autentica el cuerpo financiero completo; la confirmación automática requiere resolver ese bloqueo en backend/proveedor antes de cualquier prueba Live.

Documentación oficial: [Hosted Payment Gateway](https://pixelpay.zendesk.com/hc/es-419/articles/360039834392-Hosted-Payment-Gateway), [Hosted Sandbox](https://pixelpay.zendesk.com/hc/es-419/articles/360043039752-SandBox-PixelPay-Hosted-Payment), [guía de integración](https://docs.pixelpay.com/page/integrations/hosted-payment).
