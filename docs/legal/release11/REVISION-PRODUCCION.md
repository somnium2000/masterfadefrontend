# Release 11 — publicación del texto aprobado de QA

## Aprobación del propietario

El 15 de noviembre de 2026 el propietario aprobó el contenido legal **exactamente como aparece en QA**. El candidato ahora reproduce íntegramente el texto RC2 de los ocho documentos y 62 apartados, sin sustitución de cláusulas ni reinterpretación comercial. Solo cambian metadatos de publicación y los avisos editoriales que indicaban revisión pendiente.

Versión aprobada: `0.3-RC2-MP`. Fecha de aprobación: 15/11/2026. **Entrada en vigor: desde la publicación efectiva en la aplicación**, sin fecha retroactiva inventada. La publicación depende del merge autorizado y del despliegue manual del propietario.

Documento de referencia íntegro: `qa-original.v0.3-RC2-MP.json`. La comparación reproducible y el generador están en este PR.

## Alcance técnico conservado

Ruta pública `/terminos-y-condiciones`; ocho documentos y 62 apartados, índice y anclas, responsive, temas claro/oscuro, enlaces desde landing, registro, registro de invitados y OAuth, consentimientos separados obligatorios/opcionales inicialmente desmarcados; administración únicamente muestra los registros existentes sin poder aceptarlos por el usuario.

No se modifican API, backend, historiales de consentimiento, SQL, Supabase, flags comerciales, autenticación ni los PR de PixelPay Hosted. Leer documentos no constituye aceptación; solo las acciones explícitas del usuario pueden registrar la aceptación ya admitida por la API.

## Dependencias y alcance operativo

La aprobación de un documento no activa compras, reservas, pagos ni nuevas reglas de MasterPuntos. Las operaciones efectivas continúan sujetas a los controles desplegados; el Release 10 de acreditación por pago confirmado sigue pendiente. Se conserva la redacción QA solicitada expresamente por el propietario sin alterar las reglas actuales.

El contenido aprobado se incorpora al PR en borrador para verificar CI final (Vitest, Node, lint, build, Chromium) sobre el SHA nuevo. La integración y despliegue deben verificarse de manera independiente; no se ejecutan desde este paquete financiero/SQL.

## Pruebas exigidas

Comparación exacta de cada `chapter.blocks` con QA, ocho documentos y 62 apartados, ruta pública, enlaces de consentimiento, marketing opcional, ninguna aceptación por lectura, responsive claro/oscuro, integridad de la CI completa. Reproducir con `node scripts/prepare-release11-legal.mjs` y verificar el diff limpio.
