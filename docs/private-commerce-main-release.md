# Piloto privado: promocion minima a main

Base main: 15cd052. Origen: piloto integrado en dev por #79, merge caaf69d.
Solo se trasladan elegibilidad backend, entradas de reserva/VIP/Cliente y pruebas asociadas.
Se conservan registro, login, httpClient, flags globales, Dockerfile, branding y hotfixes.
No se incluyen agenda, puntos, acompanantes ni paginacion adicionales de dev.

Adaptaciones indispensables de main:

- VIP privado disponible con elegibilidad positiva aun cuando el catalogo global esta
  pausado. La pausa publica se conserva. Los effects esperan elegibilidad tardia y se
  puede seleccionar oferta y preparar el pago sin activar flags globales.
- Enlace de recompensa espera checking; denegacion resuelta conserva el aviso de pausa.
- Recuperacion de pantalla: se reclama el efecto antes de restaurar paymentIntent,
  evitando el bucle de renders. Es solo el hunk necesario de abf1c4a, no el commit completo.
  Un test con PublicBookingFlow/useBookingPayment reales falla antes y pasa despues,
  sin nuevos intents, Sale ni red. No cambia verificaciones ni contabilidad financiera.

Pruebas focalizadas: hook, acceso Cliente, MasterPuntos, VIP, planes pausados y restauracion
de pago. Los dos positivos independientes de seleccion manual/formulario usan adaptadores
simulados. Se conservan las once expectativas heredadas y no se repite su investigacion.
Ejecutar lint, build y diff-check. Los resultados se documentan en el PR de promocion.

La configuracion exacta de cuenta/IP/Traefik, activacion y reversion esta en el backend:
docs/private-commerce-pilot.md. Mantener VITE_PUBLIC_BOOKING_ENABLED=false y
VITE_VIP_MEMBERSHIPS_PURCHASE_ENABLED=false; ningun cliente se autoriza por un flag Vite.
Este PR no autoriza fusion, despliegue ni activacion. Sin Supabase, credenciales o pagos reales.

Resultado local: 204/204 pruebas focalizadas de acceso/VIP/Cliente, 17/17 de recuperacion
real/recarga y 2/2 positivos manuales seleccionados (36 casos no seleccionados).
Lint sin errores/advertencias, build y diff-check correctos. No se ejecuta la suite completa.
