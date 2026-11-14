# Entrada publica de reservas

Frontend basado en main `8a245bb0255f2f91fc5ce696050e17fbcbc7ad34`. Requiere el PR backend de controles publicos basado en `9279962c6011485061740f114dbd369a76368942`.

## Contrato y configuracion

No se agregan variables frontend. Mantener `VITE_PAYMENT_PROVIDER=pixelpay` y la URL de API productiva existente. El backend publica `publicBooking/publicVipPurchase` para anunciar disponibilidad y `booking/vipPurchase` para el cliente autenticado. Estos campos se leen con comparacion estricta a true; fallo o ausencia no abre funciones.

Backend nuevo:

```dotenv
PUBLIC_BOOKING_ENABLED=false
PUBLIC_VIP_PURCHASE_ENABLED=false
```

Ambos valores son false por defecto. Desplegar el codigo cerrado y activar posteriormente solo `PUBLIC_BOOKING_ENABLED=true` con autorizacion separada. Mantener piloto false, VIP false, PixelPay Live y el modo administrativo desactivado. No se ejecuta esa activacion en este PR.

## Comportamiento

- Visitante ve Agendar solo si lo anuncia el servidor. Pasa a login con retorno local seguro; no crea holds ni paga anonimamente.
- Despues del login se espera hidratacion, rol cliente y elegibilidad personal. El adaptador usa `/v1/citas/hold` y `/v1/pagos/reservas`, conservando los controles de propietario.
- Refrescar elegibilidad de la misma identidad no desmonta un checkout durante la peticion. Logout/cambio de cuenta invalida la decision previa y denegacion/error del servidor revoca acceso.
- VIP se autoriza separadamente y permanece suspendido con su control false.
- Se corrige liberacion de hold a `POST /v1/citas/pendiente/:id/descartar`, existente y protegido; no se crean rutas financieras.

## Validacion y limites

233 PASS / 0 FAIL / 0 SKIP en 17 suites focalizadas: hooks, acceso, landing, login, aislamiento admin, shell cliente, recuperacion/recarga, unicidad de Sale simulada, adaptadores, VIP y liberacion. La primera corrida paralela encontro un timeout de catalogo; paso aislada y toda la matriz final paso con un worker, sin modificar ese test ni omitirlo.

Build con PixelPay: PASS (advertencia existente de bundle grande). Lint completo y diff-check: PASS. Navegador local 390x844 con APIs sinteticas: CTA cerrado/abierto, visitante→login→cliente→reserva, foco sin desmontaje y cierre tras denegacion, sin overflow. Cero llamadas financieras y todos los recursos externos bloqueados. Esto no comprueba una compra Live ni el catalogo productivo.

Para revertir la admision, apagar ambos controles de backend y actualizar sus instancias por el procedimiento manual autorizado. No requiere compilar frontend de nuevo. Los pagos pendientes no se eliminan; webhook y API autenticada de recuperacion del #101 siguen disponibles en backend. No se implementa un fallback automatico de esa API en el checkout cerrado: usar el canal de conciliacion autorizado, nunca reabrir Sale o reintentar un cargo incierto.

El procedimiento completo, orden de despliegue y controles operativos se documentan tambien en `docs/public-commerce-opening.md` del PR backend. No se fusiono ni desplego este cambio, ni se tocaron variables reales, Supabase o credenciales.
