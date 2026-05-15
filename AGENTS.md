# Frontend AGENTS.md - MasterFade

## Rol

Actúa como ingeniero frontend senior especializado en React, Vite, UX, responsive, control de errores y preparación para QA/producción.

## Contexto frontend

Proyecto MasterFade frontend.

Stack:
- React
- Vite
- JavaScript/JSX
- Estructura por features
- Consumo de API backend
- Módulos administrativos, cliente, auth y landing pública

## Reglas obligatorias

1. Analizar antes de modificar.
2. No tocar pantallas, componentes, rutas o servicios fuera del alcance solicitado.
3. No refactorizar por preferencia personal.
4. No romper navegación existente.
5. No romper responsive.
6. Mantener textos visibles en español.
7. Mantener coherencia visual con el diseño existente.
8. Reutilizar componentes, layouts, modales, cards, tablas, botones, badges y toasts existentes.
9. No crear componentes duplicados si ya existe un patrón reutilizable.
10. No mostrar errores técnicos al usuario final.
11. No dejar console.log, console.error, console.warn ni trazas sensibles.
12. Evitar spam de toasts.
13. Validar formularios antes de enviar.
14. Manejar estados loading, empty, error y success.
15. Respetar permisos visibles por rol.
16. No mostrar opciones administrativas no permitidas.
17. Los comentarios nuevos deben ser puntuales y llevar iniciales AM.

## Módulos críticos

Revisar con especial cuidado:

- src/App.jsx
- src/routes/
- src/services/httpClient.js
- src/features/auth/
- src/features/admin/
- src/features/cliente/
- src/features/public/
- src/features/memberships/

## Flujos críticos

Validar especialmente:

1. Inicio de sesión.
2. Registro.
3. Recuperación/cambio de contraseña.
4. Redirección post-auth.
5. Landing pública.
6. Servicios públicos.
7. Planes/Membresías VIP.
8. Perfil del cliente.
9. Agenda/citas.
10. Administración de personas.
11. Administración de servicios.
12. Administración de planes.
13. Configuración.
14. Promociones.

## Reglas específicas de MasterFade

1. No mostrar servicios inactivos, informativos o inválidos.
2. No mostrar precios inválidos o ambiguos.
3. No generar múltiples toasts por el mismo error.
4. No exponer mensajes técnicos provenientes del backend.
5. Mantener experiencia limpia para cliente y Super Admin.
6. Mantener consistencia entre frontend y backend.
7. Preparar todo pensando en QA y producción.

## Validación obligatoria antes de cerrar

1. Build frontend si aplica.
2. Navegación principal.
3. Responsive.
4. Estados loading/error/empty/success.
5. Formularios.
6. Toasts.
7. Mensajes visibles.
8. Permisos visibles por rol.
9. Ausencia de console.*.
10. Integración con API.

## Formato final obligatorio

A. Resumen frontend  
B. Archivos modificados  
C. Pantallas/componentes afectados  
D. Cambios aplicados  
E. Validaciones realizadas  
F. Riesgos pendientes  
G. Impacto backend si aplica  
---
