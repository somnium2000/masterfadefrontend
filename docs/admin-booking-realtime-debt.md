# Deuda pendiente: agendamiento administrativo

La administracion operativa de citas en `/home/admin/citas` y `/home/super/citas`
mantiene integracion directa con Supabase Realtime para refrescar citas
existentes. Esta etapa no cambia ese flujo.

Antes de implementar agendamiento interno asistido real, se debe definir una
integracion canónica que evite duplicar reglas de disponibilidad, holds,
confirmacion y totales fuera del backend.

La pantalla `/home/admin/citas/preview` sigue siendo una simulacion. No debe
crear holds ni citas hasta que exista un contrato administrativo explicito.
