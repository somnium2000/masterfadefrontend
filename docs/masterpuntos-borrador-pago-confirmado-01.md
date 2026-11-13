# MasterPuntos — borrador revisado para aprobación

Versión propuesta: 0.3-RC2-MP, 13 de noviembre de 2026. **Sin vigencia legal. Pendiente de aprobación comercial y legal y de publicación autorizada.** Este archivo no se importa a la aplicación ni sustituye `src/features/public/data/legalTerms.v0.3-RC1.json`.

## Textos incompatibles identificados

En el documento 08, «Condiciones del programa MasterPuntos», del borrador 0.3-RC1:

- Capítulo 2, párrafo 1: condiciona la obtención a completar efectivamente la cita.
- Capítulo 2, párrafo 2: deja incierta la atribución de acompañantes sin cuenta al titular.
- Capítulo 3, párrafo 1: debe precisar el débito único al confirmar, distinguiéndolo de preparar un canje.
- Capítulo 5: la referencia a compatibilidad VIP no debe interpretarse como exclusión de clientes con membresía para acumular puntos por citas elegibles.
- Capítulo 6, párrafo 1: «derivados de citas no realizadas» permitiría retirar puntos por inasistencia, en conflicto con conservarlos después del pago confirmado.

También se identifican diez minutos de tolerancia en el documento 01, capítulo 7, y documento 05, capítulo 5. El margen operativo actual es **cinco minutos** y se conserva. Se propone corregir esas dos menciones a cinco minutos en una futura revisión aprobada; el JSON original permanece intacto.

## Texto propuesto del documento 08

### 1. Descripción y naturaleza

MasterPuntos es un programa de fidelización para clientes elegibles de MASTERFADE. Sus puntos son beneficios promocionales, no constituyen depósitos ni dinero de curso legal y no se convierten en efectivo.

### 2. Obtención y atribución

Cada cita elegible acredita un (1) MasterPunto cuando exista pago efectivamente confirmado y reserva confirmada. La creación de una reserva, una retención de horario, la generación de un código y un intento de pago pendiente, fallido o simulado no generan puntos. La asistencia y la finalización del servicio no son requisitos posteriores para esta acreditación.

En una reserva creada por un cliente autenticado, todos los puntos de sus citas elegibles se acreditan exclusivamente a la cuenta del titular que creó la reserva. Una reserva con titular y uno a cuatro acompañantes puede acreditar de dos a cinco puntos si todas esas citas califican. Esto incluye acompañantes con o sin cuenta; no se distribuyen puntos a sus cuentas.

Los clientes con membresía VIP mantienen su elegibilidad. Una cita cubierta por membresía exige cobertura válida de una membresía efectivamente pagada y confirmada. La mera existencia de una suscripción, una reserva gratuita, una promoción, una cortesía o una simulación no acredita un pago. Comprar una membresía por sí solo no acredita puntos por citas todavía no confirmadas.

Si posteriormente una cita se registra como «No asistió», conserva los puntos ya acreditados. Al completarse una cita previamente acreditada no se suma un segundo punto. Se mantiene el margen operativo de cinco minutos para la gestión de inasistencias.

### 3. Recompensas y canje

El canje estándar elegible requiere diez (10) puntos y los servicios disponibles se muestran en el catálogo autorizado. Preparar el canje no descuenta puntos. Confirmarlo descuenta diez puntos una sola vez, sujeto a disponibilidad y saldo suficiente. Un saldo de veinte puntos no autoriza descontar veinte por un solo canje.

La cita canjeada del titular no genera un nuevo punto, incluso si incluye extras. Las citas elegibles de acompañantes mantienen su acreditación al confirmarse su pago y reserva. La confirmación aplica controles para impedir duplicados y consumos concurrentes del mismo saldo.

### 4. Vigencia

Los nuevos puntos se integran al ciclo aplicable de doce meses. El ciclo nuevo comienza con la primera acreditación, no con la creación de la reserva. Los puntos no utilizados pueden vencer conforme a las condiciones notificadas; no se trasladan automáticamente al siguiente ciclo. El cliente puede consultar saldo, historial y fechas aplicables.

### 5. Carácter personal y compatibilidad

Los puntos pertenecen a la cuenta beneficiaria según las reglas de atribución anteriores, no son transferibles y no tienen valor de devolución en efectivo. La elegibilidad para acumular de un cliente VIP se mantiene. La combinación de descuentos, promociones, membresías y recompensas se sujeta a las condiciones específicas anunciadas de cada oferta.

### 6. Correcciones y reclamaciones

Las duplicaciones y errores verificables requieren revisión y trazabilidad. La inasistencia posterior no es, por sí sola, motivo para retirar puntos correctamente acreditados. El cliente puede solicitar aclaración por los canales oficiales. Los cambios sustanciales deberán documentarse y comunicarse conforme a las condiciones y derechos aplicables.

## Decisiones comerciales pendientes, fuera de este cambio

No se define reversión automática por reembolsos parciales o totales, contracargos, anulaciones posteriores ni fraude confirmado. Deben aprobarse alcance, momento, prorrateo por cita o grupo, tratamiento de puntos ya canjeados, saldo insuficiente, ciclo vencido, efecto sobre acompañantes y comunicación al cliente. Tampoco se introduce una regla nueva de devolución por cancelación. El cambio técnico no crea débitos automáticos por esos eventos ni corrige saldos históricos.
