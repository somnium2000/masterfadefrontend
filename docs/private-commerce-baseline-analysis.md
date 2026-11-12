# Private Commerce: auditoria de los 19 fallos originales

Base original main: `15cd0521de455e4c93be297d7fd1bc28fa5947e9`. Comparacion focalizada,
sin repetir la suite completa. Se conservan las aserciones originales de los 19 fallos.
Los JSON completos con mensajes/DOM originales se generaron como artefactos locales
`private-commerce-baseline-affected-results.json` y `private-commerce-pilot-affected-results.json`.

| Grupo | Originales | Clasificacion | Evidencia y decision |
| --- | ---: | --- | --- |
| ClienteAppShell.qa15 | 8 | Preexistente que impide el piloto | La entrada Nueva cita dependia de un flag global false. Se sustituye por elegibilidad del backend. Sus ocho aserciones originales pasan con elegibilidad positiva explicita. Un test adicional verifica rechazo y navegacion preservada al denegar elegibilidad. |
| PublicBookingFlow.rewardSession.qa18d | 7 | Preexistente, fixture desactualizado | `prepare()` espera servicio preseleccionado; el componente inicia selectedServiceId vacio y exige seleccion manual. No se cambia la seleccion ni las siete aserciones. Test adicional selecciona explicitamente, prepara recompensa y llega a PublicBookingFlow real. Se conecta tambien esta entrada al piloto para no bloquear cuentas con saldo de recompensa. |
| TodoPagoHostedModal | 3 | Preexistente y no relacionado (copy retirado) | El checkout fue redisenado y los controles permanecen operativos. Se preservan las tres aserciones de texto. Test adicional envía el formulario Live actual a un adaptador exclusivamente simulado. |
| AdminReportesAuthorization | 1 | Preexistente y no relacionado | Discrepancia de navegacion de Reportes vs expectativa de shell. Fuera de alcance. |

## Mensajes originales (sin reinterpretarlos como PASS)

Los ocho casos de ClienteAppShell compartian:
`TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Nueva cita"`.
Casos: nueva cita con 9/10; nueva cita con 10/10; doble clic; error 401; error 403;
error 500; error de red; respuesta de puntos de identidad anterior.

Los siete casos de PublicBookingFlow compartian:
`Error: Unable to find role="button" and name /Servicio QA\s*Seleccionado/`.
Casos: A prepara/navega/consume; logout con MasterPuntos desmontado y login B; cambio A -> B;
invalidacion 401; expiracion; logout no confirmado; rehidratacion pendiente.

TodoPagoHostedModal:
- `TestingLibraryElementError: Unable to find an element with the text: PixelPay Sandbox: usa exclusivamente una tarjeta de prueba..`
- `TestingLibraryElementError: Unable to find an element with the text: Ingresa los datos de tu tarjeta para procesar el pago de forma segura..`
- `TestingLibraryElementError: Unable to find an element with the text: TodoPago test.`

Reportes:
`AssertionError: expected [ 'personas', 'servicios', …(4) ] to deeply equal ArrayContaining{…}`.

## Limites de la validacion

No hay regresiones nuevas en estos 19 casos: ocho pasan tras reparar su bloqueo y once
siguen fallando con los mensajes originales. Los mocks de elegibilidad agregados a los
harness representan la respuesta del backend, no una habilitacion global; no se cambiaron
sus expectativas de negocio. Los tests reales del hook cubren denegacion, red, logout y cambios
de identidad. Los flags Vite globales siguen apagados. Los formularios/servicios/pagos estan
simulados en pruebas: no hay trafico financiero ni cambios de credenciales/Supabase.

La publicacion es para revision en dev; ninguna fusion ni despliegue. CI distingue los checks
del piloto de los contratos heredados: los fallos originales no se ocultan ni se declaran verdes.
