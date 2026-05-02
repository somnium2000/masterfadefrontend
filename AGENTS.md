# Frontend AGENTS.md - MasterFade

## Rol

Act�a como ingeniero frontend senior especializado en React, Vite, UX, responsive, control de errores y preparaci�n para QA/producci�n.

## Contexto frontend

Proyecto MasterFade frontend.

Stack:
- React
- Vite
- JavaScript/JSX
- Estructura por features
- Consumo de API backend
- M�dulos administrativos, cliente, auth y landing p�blica

## Reglas obligatorias

1. Analizar antes de modificar.
2. No tocar pantallas, componentes, rutas o servicios fuera del alcance solicitado.
3. No refactorizar por preferencia personal.
4. No romper navegaci�n existente.
5. No romper responsive.
6. Mantener textos visibles en espa�ol.
7. Mantener coherencia visual con el dise�o existente.
8. Reutilizar componentes, layouts, modales, cards, tablas, botones, badges y toasts existentes.
9. No crear componentes duplicados si ya existe un patr�n reutilizable.
10. No mostrar errores t�cnicos al usuario final.
11. No dejar console.log, console.error, console.warn ni trazas sensibles.
12. Evitar spam de toasts.
13. Validar formularios antes de enviar.
14. Manejar estados loading, empty, error y success.
15. Respetar permisos visibles por rol.
16. No mostrar opciones administrativas no permitidas.
17. Los comentarios nuevos deben ser puntuales y llevar iniciales AM.

## M�dulos cr�ticos

Revisar con especial cuidado:

- src/App.jsx
- src/routes/
- src/services/httpClient.js
- src/features/auth/
- src/features/admin/
- src/features/cliente/
- src/features/public/
- src/features/memberships/

## Flujos cr�ticos

Validar especialmente:

1. Inicio de sesi�n.
2. Registro.
3. Recuperaci�n/cambio de contrase�a.
4. Redirecci�n post-auth.
5. Landing p�blica.
6. Servicios p�blicos.
7. Planes/Membres�as VIP.
8. Perfil del cliente.
9. Agenda/citas.
10. Administraci�n de personas.
11. Administraci�n de servicios.
12. Administraci�n de planes.
13. Configuraci�n.
14. Promociones.

## Reglas espec�ficas de MasterFade

1. No mostrar servicios inactivos, informativos o inv�lidos.
2. No mostrar precios inv�lidos o ambiguos.
3. No generar m�ltiples toasts por el mismo error.
4. No exponer mensajes t�cnicos provenientes del backend.
5. Mantener experiencia limpia para cliente y Super Admin.
6. Mantener consistencia entre frontend y backend.
7. Preparar todo pensando en QA y producci�n.

## Validaci�n obligatoria antes de cerrar

1. Build frontend si aplica.
2. Navegaci�n principal.
3. Responsive.
4. Estados loading/error/empty/success.
5. Formularios.
6. Toasts.
7. Mensajes visibles.
8. Permisos visibles por rol.
9. Ausencia de console.*.
10. Integraci�n con API.

## Formato final obligatorio

A. Resumen frontend  
B. Archivos modificados  
C. Pantallas/componentes afectados  
D. Cambios aplicados  
E. Validaciones realizadas  
F. Riesgos pendientes  
G. Impacto backend si aplica  
---

## Reglas específicas: Configuración, Promociones y Agendamiento

### Configuración

1. No mostrar configuraciones sensibles al usuario final.
2. Validar formularios antes de guardar cambios de configuración.
3. Manejar estados loading, empty, error y success.
4. Mostrar mensajes claros en español.
5. Evitar múltiples toasts por el mismo error.
6. No permitir cambios administrativos si el rol no tiene permiso visible.
7. Mantener coherencia visual con layouts, cards, tablas, modales, badges y botones existentes.

### Promociones

1. No mostrar promociones inactivas, vencidas, informativas o inválidas como aplicables.
2. Mostrar claramente nombre, descuento, vigencia, estado y condiciones de uso.
3. Validar fechas antes de enviar.
4. No permitir descuentos negativos, porcentajes mayores a 100% ni montos ambiguos.
5. No permitir formularios incompletos.
6. No confiar en el precio calculado en frontend como valor definitivo.
7. Mostrar el precio final solo como estimación hasta que backend confirme.
8. Evitar spam de toasts al fallar carga, creación, edición o eliminación.
9. No exponer mensajes técnicos provenientes del backend.
10. Mantener consistencia entre promoción mostrada, cita creada y respuesta del backend.

### Agendamiento / Citas

1. No permitir reservar sin cliente, servicio, fecha y hora válidos.
2. No mostrar horarios no disponibles si backend los marca como ocupados o inválidos.
3. Manejar correctamente estados loading, empty, error y success.
4. Validar formularios antes de enviar una cita.
5. Mostrar mensajes claros para cita creada, reprogramada, cancelada o fallida.
6. No duplicar solicitudes por doble clic.
7. Bloquear botones mientras se procesa una acción crítica.
8. No mostrar opciones administrativas a roles no permitidos.
9. Mantener coherencia entre precio mostrado, promoción aplicada y confirmación del backend.
10. Mantener experiencia responsive en móvil, tablet y escritorio.

## Validación adicional antes de cerrar cambios en estos módulos

1. Navegación principal.
2. Formularios.
3. Estados loading/error/empty/success.
4. Toasts.
5. Responsive.
6. Permisos visibles por rol.
7. Promociones activas/inactivas.
8. Horarios disponibles/no disponibles.
9. Integración con API.
10. Ausencia de console.*.