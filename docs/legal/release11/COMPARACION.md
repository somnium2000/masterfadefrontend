# Comparación QA → propuesta Producción

QA original íntegro: `qa-original.v0.3-RC2-MP.json`. SHA256: `d42a3c1f1047676d724b519cacf22183e60239071ac212e1fa66c282369f68c3`. Se conservan los ocho documentos, 62 apartados y la tabla de almacenamiento. Metadatos de aprobación y vigencia nulos.

## politica-de-privacidad / 5. Proveedores y destinatarios / párrafo 1

Motivo: Reflejar las solicitudes de fuentes presentes en el CSS actual, sin asumir aprobación jurídica del tratamiento.

**QA:** Para prestar el servicio pueden intervenir, según los sistemas efectivamente habilitados, Supabase (autenticación, base de datos o almacenamiento), infraestructura de alojamiento y conectividad, servicios de correo, procesadores de pago como PixelPay y entidades financieras. Si el usuario elige inicio de sesión social, podrá intervenir Google como proveedor de autenticación.

**Propuesta:** Para prestar el servicio pueden intervenir, según los sistemas efectivamente habilitados, Supabase (autenticación, base de datos o almacenamiento), infraestructura de alojamiento y conectividad, servicios de correo, procesadores de pago como PixelPay y entidades financieras. Si el usuario elige inicio de sesión social, podrá intervenir Google como proveedor de autenticación. El diseño actual también solicita fuentes tipográficas a Google Fonts, lo que genera conexiones técnicas del navegador con ese proveedor.

## terminos-y-condiciones / 6. Reservas para acompañantes / párrafo 2

Motivo: Separar reserva disponible de beneficios futuros de Release 10.

**QA:** Las membresías, recompensas y demás coberturas personales del titular no pagan automáticamente los servicios de los acompañantes. Sin embargo, cuando un cliente autenticado realiza una reserva grupal, cada cita elegible del titular y de sus acompañantes, con o sin cuenta propia, genera un (1) MasterPunto exclusivamente para quien creó la reserva, una vez confirmado el pago válido y la reserva. Los puntos no se distribuyen entre los perfiles de los acompañantes.

**Propuesta:** Las membresías, recompensas y demás coberturas personales del titular no pagan automáticamente los servicios de los acompañantes. La posibilidad de reservar en grupo y sus condiciones dependen del flujo efectivamente habilitado. La consulta de estos documentos no concede puntos por acompañantes ni anticipa las reglas de una versión futura.

## terminos-y-condiciones / 7. Reprogramaciones, cancelaciones e inasistencia / párrafo 2

Motivo: Retirar la promesa de puntos al pagar y preservar derechos ya reconocidos.

**QA:** Se recomienda llegar cinco (5) minutos antes de la cita. El procedimiento operativo actual contempla un margen de cinco (5) minutos desde el inicio programado para identificar inasistencias cuando la cita continúe confirmada. Si el cliente no se presenta, los MasterPuntos correctamente acreditados al confirmar su pago y reserva se conservan. La inasistencia no genera una devolución voluntaria automática, sin perjuicio de los derechos legalmente exigibles.

**Propuesta:** Se recomienda llegar cinco (5) minutos antes de la cita. El procedimiento operativo contempla un margen de cinco (5) minutos desde el inicio programado para identificar inasistencias de citas que continúen confirmadas. Este estado no autoriza a retirar saldos legítimamente reconocidos. Las consecuencias comerciales de una inasistencia se revisan según las condiciones de la operación y los derechos legalmente exigibles.

## terminos-y-condiciones / 13. Modificaciones y registro de aceptación / párrafo 1

Motivo: No inventar versión aprobada, vigencia ni plazo contractual definitivo.

**QA:** Cada edición pública deberá identificarse por número de versión y fecha de entrada en vigor y mantenerse disponible para consulta. Como compromiso propuesto, los cambios sustanciales se comunicarán con al menos quince (15) días calendario de anticipación, salvo circunstancias justificadas o exigencias legales diferentes; no alterarán retroactivamente los derechos de operaciones ya celebradas.

**Propuesta:** Una edición solo se considerará aprobada y vigente después de la aprobación comercial y jurídica correspondiente y de identificar su versión, fecha de aprobación y entrada en vigor reales. Esta propuesta no incorpora esos datos ni sustituye aceptaciones anteriores. El plazo comercial propuesto de quince (15) días de aviso de cambios sustanciales requiere aprobación expresa y no limita los derechos derivados de operaciones ya celebradas.

## reservas-cancelaciones-reembolsos / 2. Pago anticipado y confirmación / párrafo 2

Motivo: No prometer acreditación por pago confirmado antes del despliegue.

**QA:** Podrán existir reservas de importe cero cuando estén legítimamente cubiertas por una membresía VIP efectivamente pagada, una promoción, una recompensa MasterPuntos o una cortesía autorizada. La reserva puede quedar confirmada sin un nuevo cobro, pero ello no equivale por sí solo a un pago válido para generar MasterPuntos: deben cumplirse las condiciones específicas de elegibilidad y, en su caso, la cobertura de una membresía pagada. Los pagos pendientes, fallidos o simulados no acreditan puntos.

**Propuesta:** Podrán confirmarse reservas sin un nuevo cobro cuando el importe esté legítimamente cubierto por una membresía aplicable, promoción, recompensa o cortesía y el flujo esté habilitado para esa sesión. Una confirmación de importe cero no crea por sí misma derechos a nuevas acreditaciones de MasterPuntos. Las condiciones sobre puntos futuros se aprobarán y comunicarán por separado.

## reservas-cancelaciones-reembolsos / 3. Reprogramación solicitada por el cliente / párrafo 2

Motivo: Conservar derechos sin anunciar el motor futuro de acreditación.

**QA:** Si no existe una función de reprogramación habilitada para el cliente, este podrá solicitar el cambio por los canales oficiales. La solicitud no modifica el horario original hasta su aceptación. Reagendar una cita confirmada y pagada mantiene el derecho al punto ya acreditado y no genera puntos adicionales por cambiar la fecha, la hora o el barbero; una eventual sustitución técnica de la cita deberá evitar duplicar el beneficio.

**Propuesta:** Si la autogestión no está habilitada, el cambio se solicita por los canales oficiales y no modifica la cita hasta su aceptación. Reprogramar no autoriza a duplicar ni a retirar puntos legítimamente reconocidos. No se promete en esta propuesta una nueva acreditación por cambiar la fecha, la hora o el profesional.

## reservas-cancelaciones-reembolsos / 4. Cancelación voluntaria del cliente / párrafo 1

Motivo: Someter la política de no reembolso voluntario a revisión expresa.

**QA:** Como condición comercial, no se conceden reembolsos voluntarios automáticos por cambio de horario, reprogramación o cancelación solicitada por el cliente. Se podrá ofrecer reagendamiento sujeto a disponibilidad y a las condiciones comunicadas. Esta política no limita reembolsos, restituciones, anulaciones, garantías ni otros derechos obligatorios por cobros duplicados o indebidos, incumplimiento atribuible a MASTERFADE u otras causas reconocidas por la legislación aplicable.

**Propuesta:** Propuesta comercial pendiente de aprobación jurídica: las cancelaciones voluntarias no darían lugar a reembolsos voluntarios automáticos y podría ofrecerse reprogramación sujeta a disponibilidad. Esta propuesta no decide solicitudes concretas ni restringe restituciones, anulaciones, garantías u otros remedios obligatorios por cargos duplicados o indebidos, incumplimiento u otras causas legalmente protegidas.

## reservas-cancelaciones-reembolsos / 5. Puntualidad e inasistencia / párrafo 1

Motivo: No atribuir a Producción la regla futura de crédito al pagar.

**QA:** Se recomienda presentarse cinco (5) minutos antes de la cita. El margen operativo de inasistencia es de cinco (5) minutos desde la hora programada para citas que continúen confirmadas. Si el cliente no llega, la cita podrá pasar a «No asistió» conforme al sistema. Este estado no revoca los MasterPuntos correctamente acreditados al confirmar pago y reserva.

**Propuesta:** Se recomienda presentarse cinco (5) minutos antes. El margen operativo de inasistencia es de cinco (5) minutos desde el inicio programado para citas que continúen confirmadas. El estado «No asistió» no es una autorización para retirar saldos legítimamente reconocidos.

## reservas-cancelaciones-reembolsos / 5. Puntualidad e inasistencia / párrafo 2

Motivo: Distinguir propuesta de cancelación de política definitiva.

**QA:** La inasistencia atribuible al cliente no genera devolución voluntaria automática ni un servicio sustituto gratuito. Los puntos correctamente acreditados permanecen en su cuenta. Se estudiarán reclamaciones por errores de cobro, incumplimientos o derechos legalmente exigibles, mediante los canales oficiales.

**Propuesta:** La consecuencia comercial propuesta para inasistencias atribuibles al cliente, sin devolución voluntaria automática ni servicio sustituto gratuito, requiere revisión jurídica. En cualquier caso, se atenderán reclamaciones por errores de cobro, incumplimientos y derechos legalmente exigibles mediante los canales oficiales.

## reservas-cancelaciones-reembolsos / 8. Membresías, beneficios y acompañantes / párrafo 1

Motivo: Eliminar atribución grupal futura como prestación actual.

**QA:** La elegibilidad de beneficios VIP, promociones y MasterPuntos se determina según las condiciones vigentes de cada programa. Una reserva grupal realizada por un cliente autenticado atribuye al titular los puntos de todas las citas pagadas y confirmadas que califiquen, incluidos acompañantes con o sin cuenta propia. La cobertura VIP o recompensa del titular no cubre automáticamente el precio de los acompañantes. Reagendar la misma cita no otorga otro punto.

**Propuesta:** La elegibilidad de beneficios VIP, promociones y MasterPuntos depende de las condiciones aplicables y de las operaciones habilitadas. La cobertura del titular no paga automáticamente servicios de acompañantes. Este documento no promete atribución grupal de puntos ni habilita reservas o pagos que estén pausados.

## membresias-vip / 4. Concurrencia con otros programas / párrafo 1

Motivo: Retirar promesa de GANAR puntos con el motor aún no desplegado.

**QA:** La membresía VIP no acumula automáticamente descuentos con promociones, cortesías o servicios canjeados con MasterPuntos, salvo compatibilidad expresa de la oferta. Esta restricción de descuentos no elimina la posibilidad de GANAR MasterPuntos por una cita elegible cubierta por una membresía efectivamente pagada y confirmada. La compra del plan por sí sola no concede puntos por citas futuras todavía no confirmadas.

**Propuesta:** Las membresías VIP no combinan automáticamente descuentos con promociones, cortesías o canjes de MasterPuntos; cualquier compatibilidad debe constar en la oferta aplicable. La compra de un plan no concede por sí misma puntos por citas futuras. Las reglas de acreditación automática vinculadas a cobertura pagada forman parte de una propuesta futura, todavía no anunciada como operativa en Producción.

## membresias-vip / 5. Cancelación de la membresía activa / párrafo 1

Motivo: No convertir una propuesta de cancelación VIP en condición aprobada.

**QA:** Como condición comercial propuesta, la cancelación voluntaria de una membresía vigente tiene efecto inmediato sobre beneficios no consumidos y no genera un reembolso proporcional voluntario automático. El usuario deberá recibir información clara sobre las consecuencias antes de confirmar la cancelación.

**Propuesta:** Propuesta comercial para revisión: la cancelación voluntaria de una membresía tendría efecto sobre beneficios no consumidos y no generaría un reembolso proporcional voluntario automático. Antes de aprobar esta regla deben validarse sus efectos, la información previa y su compatibilidad con los derechos del consumidor. No se modifican por esta propuesta las condiciones de membresías ya contratadas.

## masterpuntos / 2. Obtención de puntos / párrafo 1

Motivo: Describir operación vigente sin prometer Release 10.

**QA:** Se acredita un (1) MasterPunto por cada cita individual elegible cuando estén confirmados tanto el pago válido como la reserva. La creación de la reserva, el código de confirmación, el horario retenido, un cobro pendiente, rechazado o simulado no generan puntos. En citas cubiertas por una membresía VIP, se requiere una cobertura válida respaldada por una membresía previamente pagada. La asistencia, el paso del tiempo y la finalización de la atención no son requisitos posteriores para ganar el punto.

**Propuesta:** La consulta de MasterPuntos muestra los saldos reconocidos y los movimientos registrados. Pagar, reservar o leer estos documentos no constituye una promesa de acreditación automática. Los ajustes y canjes se tramitan únicamente por los canales efectivamente habilitados y conforme a las condiciones aplicables.

## masterpuntos / 2. Obtención de puntos / párrafo 2

Motivo: Identificar expresamente las funciones futuras.

**QA:** Cuando una persona con cuenta de cliente autenticada crea una reserva para sí y entre uno (1) y cuatro (4) acompañantes, los puntos de todas las citas elegibles se asignan EXCLUSIVAMENTE al perfil del titular que creó esa reserva. Esto incluye acompañantes registrados y acompañantes sin cuenta: si todas las citas cumplen los requisitos, el titular recibe entre dos (2) y cinco (5) puntos. No se reparten puntos a las cuentas de los acompañantes. Una cita del titular cubierta con un servicio de recompensa canjeado no genera un punto adicional.

**Propuesta:** La acreditación automática por pago confirmado, la atribución de puntos de acompañantes al titular y los nuevos ciclos de doce meses son funcionalidades propuestas pendientes de despliegue y comunicación de sus condiciones aprobadas. Este documento no las presenta como beneficios operativos ni las activa.

## masterpuntos / 3. Recompensas y canje / párrafo 1

Motivo: Conservar regla de referencia sin prometer un canal deshabilitado.

**QA:** El canje estándar exige diez (10) puntos. El servicio de recompensa debe pertenecer al catálogo disponible para la sucursal y la condición del cliente (con o sin membresía). Consultar o preparar el canje no descuenta puntos. Solo su confirmación descuenta diez (10) puntos una vez, con saldo y elegibilidad suficientes; un canje no puede descontar veinte puntos por una sola recompensa. La reserva de titular con acompañantes permite canjear el servicio elegible del titular y pagar separadamente los extras y acompañantes.

**Propuesta:** La regla de canje de referencia es de diez (10) puntos por un servicio elegible, según el catálogo y las condiciones aplicables al cliente y a la sucursal. Consultar o preparar un canje no implica que haya sido consumido. Debe confirmarse una sola vez por el canal habilitado y con saldo suficiente. Este documento no habilita canjes en línea, reservas grupales ni compras que estén pausados o limitados.

## masterpuntos / 4. Vigencia de los ciclos / párrafo 1

Motivo: Aplicar la decisión expresa del propietario sobre el histórico de papel.

**QA:** Los nuevos puntos se asignan al ciclo activo de doce (12) meses contado desde la primera acreditación válida. Un cambio de horario o reagendamiento de la misma cita no inicia otro ciclo ni añade otro punto. Los puntos no utilizados pueden vencer al concluir su ciclo según las condiciones notificadas; no se trasladan automáticamente a uno posterior.

**Propuesta:** Los puntos legítimos trasladados desde registros físicos de papel conservan su saldo, titularidad y derecho de uso por los canales habilitados. La fecha de captura digital no demuestra cuándo se ganaron ni inicia una caducidad. La migración no los elimina, descuenta, duplica ni les impone vencimiento retroactivo o automático mientras no exista una política específica aprobada, compatible con los derechos del cliente.

## masterpuntos / 4. Vigencia de los ciclos / párrafo 2

Motivo: Separar nuevos ciclos de la fecha de captura histórica.

**QA:** El cliente podrá solicitar información sobre el saldo, el inicio y el fin del ciclo aplicable y el detalle de las operaciones que afecten sus puntos mediante los canales oficiales.

**Propuesta:** Los ciclos anuales propuestos para nuevas acreditaciones se evaluarán y comunicarán por separado antes de su aplicación. No se utilizarán para caducar los saldos de papel reconocidos. El cliente puede solicitar el detalle de los movimientos y de cualquier regla de vigencia que efectivamente le resulte aplicable.

## masterpuntos / 5. Carácter personal y no acumulación / párrafo 1

Motivo: No anunciar atribución automática futura.

**QA:** Los puntos pertenecen al titular beneficiario, no se transfieren a terceros ni tienen valor de devolución en efectivo. Los clientes VIP pueden acumular puntos por citas elegibles con cobertura pagada, aunque los descuentos del plan no se combinan automáticamente con servicios canjeados. Al confirmar una reserva con canje, el servicio del titular cubierto por recompensa no acredita otro punto; los acompañantes sí acreditan el suyo al titular cuando sus citas pagadas cumplan las condiciones.

**Propuesta:** Los puntos corresponden a su beneficiario reconocido, no se transfieren automáticamente a terceros ni tienen valor de devolución en efectivo. La existencia de una membresía o de acompañantes no garantiza nuevos puntos ni acumulación de descuentos. Las condiciones de compatibilidad deben informarse antes de la operación habilitada.
