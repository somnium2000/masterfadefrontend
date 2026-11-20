# Traza temporal del retorno de StepUp

Para el intento Live del 20 de noviembre, la secuencia registrada (UTC) es
`start_result` a las 16:21:13.185, `handoff_ready` a las 16:21:13.199 y
`challenge_ready` a las 16:21:26.603. La última fase confirma que el backend
aceptó el lookup para StepUp. Falta el despacho de continuación y no consta
confirmación de la reserva ni del pago. El registro no observa el iframe,
el envío del formulario ni el callback del navegador.

En el SDK 2.5.8, `handleDirectApiLookup` invoca `submitChallengeForm` para
`action=continue`. El SDK puede crear el iframe y retornar antes de crear
el formulario si no encuentra contenedor. Si crea el formulario, llama a
`form.submit()` de forma síncrona. El listener nativo espera
`pixelpay_continue` desde el origen del endpoint de PixelPay. El adaptador
exige además la ventana del iframe StepUp. El SDK impide el retry si el
callback trae error o carece de identificador. La caducidad también impide
el avance. Cada punto puede explicar la ausencia de despacho. Ninguno se
puede atribuir al intento con la evidencia disponible.

Visa documenta la navegación a la return URL dentro del iframe tras el
desafío del emisor. La URL de StepUp identifica el destino inicial, mientras
que el callback browser específico de PixelPay se comprueba contra el
contrato del SDK instalado. El ticket #9834 trata incidencias anteriores
de Sandbox y Status y aconseja seguir el SDK. No aporta el callback ni la
respuesta de la return URL para este intento.
[Visa Step-Up Iframe](https://developer.visaacceptance.com/docs/cybs/en-us/payer-authentication/developer/all/so/payer-auth/pa2-ccdc-stepup-frame-intro.html).
[PixelPay Requests](https://docs.pixelpay.com/page/sdk/requests?locale=en).

## Captura local en una sesión de prueba autorizada

La traza está apagada por defecto. En DevTools, antes de la sesión, registra
un colector local y activa la clave de la pestaña. El colector recibe solo
nombres de fase fijos, tiempo Unix en milisegundos y valores booleanos.

```js
const stepUpTrace = [];
const collectStepUpTrace = ({ detail }) => stepUpTrace.push(detail);
window.addEventListener('masterfade:pixelpay-stepup', collectStepUpTrace);
sessionStorage.setItem('mf_pixelpay_stepup_trace', '1');
```

Lee `stepUpTrace` tras finalizar. Para desactivar la captura, elimina el
listener y la clave en esa pestaña.

```js
window.removeEventListener('masterfade:pixelpay-stepup', collectStepUpTrace);
sessionStorage.removeItem('mf_pixelpay_stepup_trace');
```

- `iframe_created` indica que se encontró el iframe al retornar del SDK.
  `form_submit_returned` indica que el método nativo retornó con el formulario
  creado. En 2.5.8, esto implica que su llamada a submit retornó. No acredita
  el POST en el servidor remoto.
- `iframe_load` y `iframe_error` son eventos DOM después de conectar el
  observador. Un load puede corresponder a una página inicial, un redirect
  o una página de error. No representa el resultado del desafío.
- `callback_observed` clasifica origen, presencia de ventana, coincidencia
  de iframe, duplicado, error, identificador y contexto cerrado mediante
  booleanos. `callback_accepted` indica aceptación por el filtro del browser.
- `retry_armed` señala el permiso local tras validar origen y ventana.
  `retry_transport_started` solo aparece si el SDK invoca retry y el
  contexto sigue vigente. La evidencia financiera sigue en backend.
- `context_expired`, `context_aborted`, `context_closed` y las fases
  `sdk_*` o `retry_transport_failed` ayudan a localizar el corte.

La aplicación limita la emisión a ocho eventos por fase e intento. El
colector de arriba vive en memoria local. La aplicación no envía la traza
a servicios ni guarda sus detalles. No se deben compartir HAR, cuerpos
de POST ni capturas que expongan datos de pago.
