# Private Commerce: revision y promocion selectiva

Snapshot 2026-11-12: main 15cd0521de455e4c93be297d7fd1bc28fa5947e9;
dev 280ce91a5995ed7b53e9d98c2f250aa2a53e4afa. Divergencia 21 / 14 commits,
incluyendo merges; el cambio RBAC e309e3f / 73c111e es equivalente por patch.

## CI y cobertura que se conserva

https://github.com/somnium2000/masterfadefrontend/actions/runs/43276899540 corresponde
a 5601893: pilot-checks 233 PASS; original-contracts 61 PASS / 11 FAIL y artefacto JSON.
No se repite la suite completa ni se modifican las once aserciones. Su clasificacion
y mensajes originales estan en private-commerce-baseline-analysis.md.

Se repitieron solo cinco positivos seleccionados en cuatro archivos: seleccion manual
de recompensa con AuthProvider real y HTTP simulado, formulario Live hacia adaptador
simulado, seleccion manual de oferta VIP, persistencia de orden y aislamiento del intent
tras logout. Pasan 5/5. El catalogo VIP usa fixtures de Auth/elegibilidad; la verificacion
servidor de cookie/sesion/cliente la cubren los cuatro positivos HTTP del backend.
No se presenta esa composicion por capas como un E2E Live ni una cuenta real comprobada.

El hook distingue ahora checking de una denegacion resuelta. Durante comprobacion ambos
permisos siguen false; error/logout/cambio de identidad tambien cierran. Esto permite
preservar la pausa de main sin consumir prematuramente un enlace de recompensa antes
de recibir elegibilidad. Los cuatro tests del hook mantienen los assertions de permisos
y agregan los del estado de comprobacion. Lint, build y diff-check se ejecutan localmente.

Los ajustes se publican con [skip ci] por la instruccion de no repetir suites completas.
El workflow anterior sigue ROJO y solo evidencia su SHA original. El nuevo HEAD tiene
validacion focalizada local; no se declara CI verde ni se omiten requisitos de ramas.

## Preservar main, sin promocionar dev completo

main contiene pausa de reservas, pausa VIP, acceso Cliente y protecciones para reanudar
pagos que no deben sustituirse por archivos completos de dev. Conservar tambien auth,
registro/login, httpClient, Dockerfile, assets/branding, flags globales y hotfixes administrativos.
Agenda, puntos, acompanantes y paginacion QA de dev no forman parte de esta promocion.

Se preparo una copia local desde main con los deltas equivalentes del piloto y dos
adaptaciones verificadas por fallos reales:

- VIP: catalogAvailable = VIP_MEMBERSHIPS_ENABLED || elegibilidad.vipPurchase. El flag
  global permanece apagado; solo el propietario elegible accede al catalogo privado.
  Carga, effects y modal responden a elegibilidad tardia. Se prueba seleccionar sucursal,
  oferta y preparar intent, sin confirmar ni invocar Sale.
- Recompensa: esperar checking antes de consumir accion=canjear; denegacion resuelta
  conserva el aviso de pausa original. Se prueba esperar, seleccionar servicio manualmente
  y preparar el canje. La prueba de pausa original conserva todas sus aserciones.

Compatibilidad local main: 133/133 en catalogo VIP, MasterPuntos b/c, Planes pausados y hook.
Los handlers y servicios de registro/login no tienen diff; tampoco flags globales ni
Dockerfile/assets. Las adaptaciones de main siguen locales: no se publican ni fusionan aqui.

Riesgo adicional de promocion: dev tiene abf1c4a (QA-PAYMENT-RUNTIME-CRASH-02) que main no
contiene. Su evidencia en test/paymentRuntime.browser.md identifica un bucle React en
recuperacion de pago: restorePaymentContext cambia paymentIntent antes de reclamar el
efecto. El piloto no debe abrirse en main sin validar ese escenario y proponer, si corresponde,
un PR UI separado con solo la correccion necesaria. No copiar todo el commit/dev ni tocar
finanzas o reinterpretar contratos Status. No se declara que las pruebas de formulario
o los 133 casos certifiquen ese recorrido de navegador.

## Revision e integracion

Primero revisar #79 y backend #91 hacia dev, con sus excepciones CI expresas. No fusionar
en esta tarea. Tras aprobacion e integracion dev, abrir ramas desde main actualizado y PRs
minimos: backend guard/configuracion/contratos de acceso; frontend elegibilidad/entradas
y adaptaciones de pausa verificadas. Revisar aparte el requisito de recuperacion UI.
Comparar el diff contra main, no contra dev, y exigir que todos los hotfixes anteriores
permanezcan. PRs a main todavia no abiertos. Sin despliegue ni activacion automatica.

La IP real/peer Traefik y la cuenta real del propietario siguen pendientes de validacion
operativa autorizada. La sonda preparada usa solo GET /v1/commerce/eligibility. Invitado y
otra cuenta reciben false; los proxies y cabeceras falsas no autorizan comercio. No se
modificaron configuraciones operativas, credenciales, Supabase ni datos historicos.
