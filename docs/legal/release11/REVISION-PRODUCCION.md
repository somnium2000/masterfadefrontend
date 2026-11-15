# Release 11 — módulo legal independiente

Preparación técnica: 15/11/2026, America/Tegucigalpa. Base frontend `origin/main=2b26226b9b113f22ba712c826286f348afecd8bf`. Backend de referencia `3a77863038f866f2b30787a8e67cf69bd8e8adaa`. No requiere el despliegue de Release 10 para preparar ni probar esta página.

## Estado de aprobación

**GO para revisión técnica del candidato. NO-GO para publicación jurídica definitiva, merge o despliegue sin aprobación.** El paso de las pruebas no aprueba el texto. `version`, `approval_date` y `effective_date` permanecen en `null`; no hay fechas retroactivas ni una versión publicada inventada. La página muestra expresamente que es una propuesta sin entrada en vigor.

El propietario reconoció expresamente como legítimos los 56 puntos migrados de papel. La propuesta los protege sin usar la fecha de captura digital como fecha de obtención. Las nuevas reglas de acreditación por pago confirmado, atribución al titular de puntos de acompañantes y ciclos anuales se describen como futuras. Esta publicación no las habilita ni anuncia su despliegue. La disponibilidad comercial sigue determinada por las guardas actuales.

## Ocho documentos conservados

| Documento | Revisión pendiente principal |
|---|---|
| Aviso legal e identificación del proveedor | Confirmar razón social, RTN, dirección, correo, teléfono, horarios y metas internas de atención 2/5/10 días. Son datos y propuestas del texto QA, no verificación corporativa nueva. |
| Términos y condiciones | Capacidad y menores, prepagos, reglas de acompañantes, plazo propuesto de aviso de cambios y evidencia de aceptación. |
| Política de privacidad | Bases y finalidades aplicables, destinatarios, transferencias, retención, tratamiento de menores, fotografías y derechos del titular. Se añade Google Fonts por las conexiones que declara `index.html`. |
| Cookies y almacenamiento | Validar inventario real, duraciones, atributos y clasificación antes de aprobarlo. No se incorporan nuevas herramientas de seguimiento. |
| Reservas, cancelaciones y reembolsos | Aprobar o modificar 48/24 horas, margen operativo, cancelaciones, reprogramación y restituciones exigibles. La ausencia de reembolso voluntario automático queda como propuesta sujeta a revisión. |
| Membresías VIP | Validar titularidad, cobertura, renovación manual, consumos y consecuencias de cancelación; no aplicar esta propuesta a derechos ya contratados. |
| Promociones y ofertas | Confirmar condiciones de cada campaña, cupos, vigencia y compatibilidad; no prometer ofertas inexistentes. |
| MasterPuntos | Conservar el histórico legítimo; reglas futuras y canales habilitados separados. No imponer caducidad a los puntos de papel. |

La copia íntegra QA permanece en `qa-original.v0.3-RC2-MP.json`. `COMPARACION.md` contiene el antes/después y motivo de cada cambio; `comparison.json` permite revisión automatizada. El hash se calcula sobre UTF-8 con finales LF para hacerlo reproducible en Windows y Linux. Se conservan ocho documentos, 62 apartados y una tabla. No se han suprimido documentos ni se presentan como aprobados.

## Alcance de implementación

- Ruta pública `/terminos-y-condiciones`, lazy loading y boundary propios; sin exigir sesión.
- Índice por documento y apartado, enlaces directos, retorno al índice, tabla con desplazamiento accesible, temas y responsive.
- Enlaces separados de las casillas, con nueva pestaña y `noopener noreferrer`, desde landing, registro, confirmación de invitados y consentimiento OAuth. Leer no acepta ni envía consentimientos.
- Términos obligatorios y marketing opcional; ambos siguen inicialmente desmarcados. Se conservan estados, validaciones, handlers y payloads existentes. La UI no registra una aceptación de esta nueva propuesta por el simple hecho de abrirla.
- Administración muestra los consentimientos existentes en modo lectura, sin casillas editables ni aceptación en nombre del cliente. Conserva el contrato y los registros existentes; no migra consentimientos previos ni añade un nuevo versionado contractual en backend.

No cambian AuthContext, httpClient, Supabase client, proveedores de pago, rutas de compras, hooks comerciales, PixelPay Hosted, flags, Dockerfile ni contratos API. La única modificación de App añade la ruta; se mantiene `PublicBookingAccess`. Los PR #111/#93 quedan fuera.

## Evidencia y reproducción

Validación local: Vitest completo 152 archivos / 1955 pruebas; Node 65/65; ESLint sin errores ni advertencias; build productivo correcto, con la advertencia previa de chunks grandes. Chromium: ocho combinaciones 360/390/768/1440 × claro/oscuro de lectura, índice, enlaces y registro/invitados, más cuatro de landing/OAuth/pausas (390/1440 × claro/oscuro): 12/12. El comunicado temporal existente se cierra mediante su botón visible, sin desactivarlo ni cambiar sus fechas. No se interactúa con cuentas o servicios reales; APIs e identidades son sintéticas.

El workflow de Release main ejecuta Vitest, Node, lint, build y Chromium sobre el SHA del PR. Playwright 1.64.1 se instala como herramienta efímera fuera del proyecto; no cambia dependencias ni lockfile. Las capturas se conservan en el artifact `release11-legal-chromium`. Los resultados definitivos del SHA están en el PR.

```powershell
node scripts/prepare-release11-legal.mjs
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --exclude test/accountDeletionClientFlow.test.js --exclude test/adminAccountDeletionFlow.test.js --exclude test/internalAccountDeletionFlow.test.js
npm run test:node
npm run lint
npm run build
# Con preview local y Playwright disponible, exclusivamente APIs sintéticas:
node --test --test-concurrency=1 test/legalTerms.browser.mjs test/releaseLegalConsent.browser.mjs
git diff --check
```

Los comentarios antiguos con mojibake en el archivo de Administración tocado se corrigen puntualmente. La revisión anti-mojibake y `console.*` de todos los archivos funcionales tocados no introduce nuevas coincidencias. No se refactorizan archivos ajenos para corregir deuda antigua.

## Fuentes y aprobación jurídica

La revisión conserva el acceso a reclamos y evita excluir remedios obligatorios. Como referencia para el abogado, el [Reglamento de Protección al Consumidor publicado por SDE](https://sde.gob.hn/wp-content/uploads/2022/03/Acuerdo-084-2021_ley-de-proteccion-al-consumidor_27-de-dicimbre-del-2021-4.pdf) aborda comercio electrónico y obligaciones de información; no se infiere de él que cualquier política de cancelación propuesta sea válida para todos los casos. El acceso a reclamos se describe en el [canal oficial DGPC](https://sde.gob.hn/proteccion-al-consumidor/).

El régimen concreto de privacidad, conservación, transferencias y capacidad contractual debe confirmarse por asesoría jurídica hondureña. No se presenta un proyecto de ley de datos personales ni el régimen de transparencia pública como una aprobación automática del tratamiento de una empresa privada. No se certifican cumplimiento legal integral, aceptación de procesadores ni alcance PCI por pruebas de interfaz.

Antes de publicar: aprobación del propietario de datos comerciales y políticas, revisión jurídica de los ocho documentos y sus diferencias, identificación de versión y fechas reales, comprobación del alcance de consentimientos existentes y aprobación expresa de merge/despliegue. La reversión técnica consiste en revertir el commit frontend aprobado y reconstruir; no ejecuta SQL ni cambia consentimientos o saldos.
