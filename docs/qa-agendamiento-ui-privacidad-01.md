# QA-AGENDAMIENTO-UI-PRIVACIDAD-01 — Frontend

Fecha: 13 de noviembre de 2026. Base `origin/dev`: `67a825f` (incluye los commits `532704a`, `08c6bd6` y `67a825f` de legal RC2-MP). Se trabajó en un worktree independiente, conservando los cambios locales de ServiciosF.

## A. Resumen frontend

Los conflictos horarios dejan de presentar nombres de clientes en tarjetas, tooltips, avisos y nombres accesibles. Las fotografías de barberos se muestran completas, centradas y con proporción natural, dentro de marcos que mantienen sus dimensiones antes y después de cargar.

## B. Archivos modificados

- `src/features/public/booking/PublicBookingAgendaStep.jsx`
- `src/features/public/booking/PublicBookingFlow.jsx`
- `src/features/public/booking/PublicBookingFlow.css`
- `src/features/public/booking/PublicBookingBarberosStep.jsx`
- `src/features/public/booking/__tests__/PublicBookingAgendaStep.curated.test.jsx`
- `src/features/public/booking/__tests__/PublicBookingBarberosStep.catalogs.test.jsx`
- `test/bookingUiPrivacy.browser.mjs`
- `test/legalTerms.browser.mjs`
- Este informe.

Se revisó `PublicBookingBlocks.jsx`: su manejador de error, fallback de iniciales, recuperación al recibir una URL nueva y selección del profesional ya eran correctos. Se conservan y se prueban sin modificar ese archivo.

## C. Pantallas/componentes afectados

Selección de barbero, agenda de titular/acompañantes y avisos de recuperación de horario del agendamiento público/autenticado. La pantalla legal RC2-MP se incluye únicamente como regresión.

## D. Cambios aplicados

- Se sustituye «Solapa con [nombre]» y el aviso de conflicto con alias por «Horario no disponible: coincide con otra cita del grupo». El tooltip y el nombre accesible del botón reciben ese mismo mensaje.
- El estado de conflicto no transporta alias de clientes. Los avisos al recuperar una selección inválida o recibir un conflicto de backend usan mensajes genéricos. Los contactos y el resumen de las citas del propio grupo se conservan en sus lugares autorizados.
- Los cálculos de duración, comparación de intervalos, restricciones del mismo barbero y sugerencias de otro profesional no se cambian.
- El marco fotográfico mide 212 px de alto en escritorio y 200 px hasta 768 px. Se eliminan la tarjeta cuadrada forzada y su altura fotográfica del 72 %, evitando dependencia de la altura intrínseca.
- Las imágenes usan `object-fit: contain`, posición central, dimensiones automáticas y máximos del 100 %. Las imágenes pequeñas conservan su tamaño natural. No se deforman ni se recortan.
- El skeleton utiliza la misma clase de marco, y se conservan iniciales cuando no hay imagen o falla.
- No se crean módulos funcionales nuevos. No cambian MasterPuntos, pagos, reglas de negocio, Supabase ni contenido legal.

## E. Validaciones realizadas

| Validación final | Resultado |
|---|---|
| Vitest: agenda real, privacidad en texto/tooltip/nombre accesible, restricciones y cambio de barbero, catálogo, fallback, fechas, ranking, acompañantes, SSE y legal | **82 PASS**, 8 archivos, 0 FAIL |
| Backend: privacidad de respuesta pública/diagnóstico y regresiones de agenda/administrador/holds | **47 PASS**, 0 FAIL |
| Chrome, fotos y conflictos: 360/390/768/1440 px × claro/oscuro | **8 PASS**, 0 FAIL, 0 omitidas |
| Chrome, regresión completa de la pantalla legal RC2-MP en la misma matriz | **8 PASS**, 0 FAIL, 0 omitidas |
| Build frontend | **PASS**, aviso existente de chunks >500 kB |
| ESLint de los archivos JS/JSX/MJS afectados, sintaxis de pruebas y `git diff --check` | **PASS** |

Cada recorrido visual carga imágenes sintéticas verticales (180×300), horizontales (360×180), cuadradas (240×240), pequeñas (24×24), ausentes y fallidas. Se retiene la carga para medir las tarjetas antes de recibir imágenes y se comparan ancho/alto del marco y de la tarjeta después de cargarlas. Se comprueban centrado, proporción, límites de tamaño y ausencia de ampliación. Las esquinas de colores permiten inspeccionar recortes en las capturas.

El recorrido de agenda configura titular y dos acompañantes con nombres reservados sintéticos. Verifica restricciones por mismo barbero, texto, title y árbol accesible sin esos nombres, selección de horarios válidos y cambio de barbero. También responde 409 a un hold simulado con un nombre externo en el mensaje del error y comprueba que el aviso público sea genérico. No se crea una reserva real ni se solicita un pago.

Se revisaron visualmente capturas de 360 px oscuro y 1440 px claro. Las APIs están interceptadas: ninguna petición alcanza QA, Supabase o pasarelas. Se conserva la app compilada, router, componentes y cliente HTTP reales.

La regresión legal se actualiza para leer `legalTerms.v0.3-RC2-MP.json`, sustituyendo la referencia obsoleta del test a RC1. Verifica los ocho documentos, 62 capítulos, 115 párrafos y tabla completos, navegación por anclas, responsive, enlaces, consentimiento sin marcar automáticamente y envío simulado del formulario. La espera de los enlaces contempla la animación de entrada y redondeo subpixel, manteniendo la exigencia CSS de 44 px.

Archivos legales preservados:

| Archivo | SHA-256 |
|---|---|
| `legalTerms.v0.3-RC1.json` | `a03303b016034d13edd868c2876389d201af272242ed7dfbc395a740994fd9ef` |
| `legalTerms.v0.3-RC2-MP.json` | `cb8fb012f540ef7eab7d06336516ddcb19093f9937cd058e58264e166d3d7d91` |

Comandos principales:

```powershell
npm run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4191 --strictPort
npx vitest run src/features/public/booking/__tests__/PublicBookingAgendaStep.curated.test.jsx src/features/public/booking/__tests__/PublicBookingBarberosStep.catalogs.test.jsx src/features/public/booking/__tests__/bookingDates.test.js src/features/public/booking/__tests__/bookingSlotModels.test.js src/features/public/booking/__tests__/bookingHardening.test.jsx src/features/public/booking/__tests__/bookingCompanions.mf118.test.jsx src/features/public/booking/__tests__/bookingAvailabilitySse.test.jsx src/features/public/pages/__tests__/LegalTermsPage.test.jsx
```

Con `MASTERFADE_PLAYWRIGHT_MODULE` hacia el runtime Playwright instalado, `MASTERFADE_BROWSER_URL=http://127.0.0.1:4191`, `MASTERFADE_CHROMIUM_CHANNEL=chrome` y `MASTERFADE_BROWSER_ENGINES=chromium`:

```powershell
node --test test/bookingUiPrivacy.browser.mjs test/legalTerms.browser.mjs
git diff --check
```

Capturas: `%TEMP%/mf-booking-ui-privacy-01` y `%TEMP%/mf-legal-ux01-evidence`. Incidencias de preparación resueltas: medición del contenedor real frente al wrapper `display:contents` del compilador, selección exacta de la hora inicial y espera del bloque saliente de AnimatePresence. No se alteró disponibilidad para resolverlas.

## F. Riesgos pendientes

Las pruebas son locales y sintéticas; no certifican datos remotos. Los márgenes alrededor de imágenes con proporción distinta son el comportamiento esperado para mostrarlas completas. Se conserva el aviso previo de bundle grande, fuera de alcance.

Publicación exclusivamente en `origin/dev`, sin merge ni despliegue. No se modifican archivos de pagos, MasterPuntos, configuración Supabase ni documentos legales.

## G. Impacto backend

El endpoint público mantiene horarios, precios y disponibilidad; el diagnóstico autorizado filtra únicamente los campos arbitrarios ajenos a sus razones, fechas y métricas. No requiere migración ni operación manual sobre la BD.
