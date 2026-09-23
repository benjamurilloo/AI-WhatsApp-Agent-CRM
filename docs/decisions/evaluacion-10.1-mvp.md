# Evaluación 10.1 — El MVP contra su Definición de Terminado

- **Brief**: [brief-10](brief-10-evaluacion-del-mvp.md), subfase 10.1, criterios AC-1 a AC-7.
- **Base evaluada**: la Definición de Terminado y los criterios del [Roadmap](../planning/Roadmap.md) **tal como están en `15c8faf`** (D-2). El código evaluado es `967e357`, cuya corrida de CI [35910742436](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35910742436) terminó en `success` sin pasos fallidos, leída por `headSha` y `conclusion` el 2026-09-23.
- **Quién evalúa**: el mismo agente que planificó e implementó las Fases 0 a 9. **Todo este documento es autoevaluación.** La revisión independiente de la Fase 10 (D-7) lo cubre al cierre de la 10.3.
- **Estado**: **cerrada el 2026-09-23 con aprobación del usuario.** AC-1 a AC-7 ejecutados. La decisión de la fase (§3) y los números de las fases de integración los pone la 10.3.

## Destinos provisionales

La 10.3 numera las fases de integración. Mientras tanto, este documento asigna destinos con **cuatro rótulos provisionales**, uno por fase del orden acordado. La 10.3 está obligada a reemplazar cada rótulo por su número en todos los documentos donde aparezca (ver §Traspaso a la 10.3), para que ninguna obligación quede apuntando a un nombre que no existe.

| Rótulo | Fase del orden acordado | Número (10.3) |
|---|---|---|
| **I-Lectura** | Catálogo comercial, información del negocio y API de servicio de solo lectura; termina con el piloto | **Fase 11** |
| **I-Turno** | Contexto del turno: cliente, conversación, derivación, mensajes e historial | **Fase 12** |
| **I-Producción** | Producción | **Fase 13** |
| **I-Migración** | Migración por CSV | **Fase 14** |

## 1. Definición de Terminado (AC-1)

Seis criterios, contados en [Roadmap](../planning/Roadmap.md) §Definición de Terminado del MVP.

| # | Criterio | Veredicto | Evidencia | Nivel |
|---|---|---|---|---|
| 1 | Todos los FR de `FunctionalRequirements.md` implementados y probados | **cumplido** | §2: 29 de 29, cada uno con un caso de test concreto | según el FR: validado en integración (los de pantalla) o validado localmente y en CI (los de servicio, esquema y contrato). Ninguno con tráfico real |
| 2 | Las 12 métricas de `MetricsCatalog.md` validadas contra fixtures | **cumplido** | 1 a 6 y 10 en `tests/integration/analytics.test.ts` (7.1); 7, 8, 9 y 11 en `analytics-response.test.ts` (7.2); 12 en `analytics-ingestion.test.ts` (7.3): 7 + 4 + 1 = 12. En pantalla, `tests/e2e/dashboard.spec.ts` caso 2 («las doce métricas muestran los valores calculados a mano»). CI de `967e357` en verde | validado localmente y en CI (`deterministic`) para el cálculo; validado en integración para la pantalla. **Ninguna con datos reales**: la 12 no tiene emisor |
| 3 | `SecurityModel.md` verificado, sin hallazgos críticos abiertos | **cumplido, con una condición que viaja** | [SecurityModel.md:5](../architecture/SecurityModel.md): «ninguno es crítico». Revisado ítem por ítem en la 8.4, corregido por la primera revisión independiente del proyecto; los tres hallazgos mayores cerrados (H-1 y H-7 en la 9.0.1, H-3 en staging en la 9.1); las seis afirmaciones `no-verificable-aquí` verificadas en la 9.1 y la 9.2. **Condición**: H-3 es `crítico` en cualquier entorno compartido donde `TRUSTED_PROXY` no sea `true` ([Risks](../planning/Risks.md), fila de H-3). Resuelto en staging no significa resuelto en producción | validado en staging. Las verificaciones de la 9.1 las revisaron cuatro agentes independientes; el resto del modelo es autoevaluación corregida una vez |
| 4 | Piloto en staging sin bloqueantes, con datos sintéticos | **incumplido por decisión** | No hubo piloto. La 9.4 se disolvió sin abrirse el 2026-09-23 por decisión del usuario, y el gate de salida de la Fase 9 se enmendó ese día ([Roadmap](../planning/Roadmap.md) §Fase 9). El piloto se reasignó, con condición escrita, como subfase propia de **I-Lectura** | — |
| 5 | Cero referencias a Airtable o al repositorio del agente en código y configuración, verificado por la guarda de CI | **cumplido** | `tests/guards/forbidden-references.test.ts`, en el paso «Guardas del repositorio» de la corrida 35910742436 en `success`. La guarda tiene casos que prueban que detecta cada patrón | validado en CI |
| 6 | `CHANGELOG.md` con la entrada de cierre de cada fase | **cumplido para las Fases 0 a 9**; la de la Fase 10 se escribe al cerrarla | `grep -nE "^## .*Fase [0-9]+ cerrada" CHANGELOG.md`: diez entradas, de la Fase 0 (2026-09-11) a la Fase 9 (2026-09-23) | revisión documental |

**Resultado**: cinco de seis cumplidos y uno incumplido por decisión. El incumplido no es una falla del sistema sino una actividad que no se hizo, y ya tiene destino.

## 2. Los requisitos funcionales, uno por uno (AC-2)

**29 requisitos.** Contados con `grep -oE "^\- \*\*FR-[A-Z]+-[0-9]+\*\*" docs/product/FunctionalRequirements.md`, y comparados con las filas de `TraceabilityMatrix.md` con `comm`: **29 con fila, ninguno sin fila, ninguna fila sin requisito.**

La matriz dice *dónde* se satisface cada uno, casi siempre por pantalla, no *qué test* lo prueba. Buscando el identificador en `tests/` y `src/`, **solo 15 de los 29 aparecen etiquetados** en algún test. Para los otros 14 se buscó el caso concreto por su nombre. Los 14 tienen al menos uno:

| FR | Caso que lo prueba |
|---|---|
| FR-ORG-01 | `organization-isolation.test.ts`: «las siete escrituras de H-7 no alcanzan a otra organización» y los casos siguientes |
| FR-ORG-02 | `users.spec.ts` casos 3, 4 y 6 (alta, cambio de rol, último `admin`) |
| FR-PROD-02 | `products.spec.ts` caso 3 («editar deja el cambio en la auditoría del producto») |
| FR-PROD-03 | `products.spec.ts` caso 4 y `catalog.test.ts` («desactivan y reactivan con auditoría») |
| FR-PROD-08 | `inventory-adjustment.test.ts` («−0,001 viola negative_stock…», «un primer ajuste negativo rechazado no deja la fila») |
| FR-CLI-02 | `clients.spec.ts` casos 5 y 6 |
| FR-CLI-03 | `clients.spec.ts` caso 4 («busca por nombre y por teléfono, filtra y pagina») |
| FR-CLI-05 | `client-data.test.ts` («cliente con conversaciones: se minimiza, no se borra») y la revisión contra el esquema de la 8.4 |
| FR-CLI-07 | `clients-schema.test.ts` («unicidad del teléfono») y `crm.test.ts` (`CONFLICT`) |
| FR-CONV-02 | `conversations.spec.ts` casos 5 y 6 (timeline escapado, carga de anteriores) |
| FR-CONV-04 | `ingestion.test.ts` («reenvíos», casos 6 y 8) y `contract.test.ts`, `ingestion-http.test.ts` |
| FR-CONV-05 | `contract.test.ts` («fixtures del contrato (forma asumida)»), `credentials.test.ts` («apagado por defecto»), `ingestion-http.test.ts` caso 5 |
| FR-MET-01 | `dashboard.spec.ts` casos 2, 7 y 8 |
| FR-MET-02 | `dashboard.spec.ts` casos 1 y 4 |

> **Corrección del 2026-09-23** (revisión independiente de la Fase 10, M-2): «15 de los 29 aparecen etiquetados en algún test» es falso. **En los tests aparecen 8**: FR-AUD-02, FR-CLI-04, FR-CLI-06, FR-CONV-01, FR-CONV-03, FR-ORG-03, FR-PROD-05 y FR-PROD-07. Los otros siete del recuento —FR-AUD-01, FR-CLI-01, FR-MET-03, FR-PROD-01, FR-PROD-04, FR-PROD-06 y FR-PROD-09— estaban etiquetados en código de `src/`, no en tests, y la tabla de arriba no les daba caso. Buscado ahora por nombre:
>
> | FR | Caso que lo prueba |
> |---|---|
> | FR-PROD-01 | `products.spec.ts` caso 1; `catalog.test.ts`, `describe("createProduct")`; `catalog-inventory-schema.test.ts` («rechaza un SKU repetido…») |
> | FR-PROD-04 | `catalog.test.ts` («busca por prefijo de nombre o SKU exacto…» y «filtra por estado de stock y por actividad») |
> | FR-PROD-06 | `products.spec.ts` casos 5 a 7; `inventory-adjustment.test.ts` |
> | FR-PROD-09 | `inventory-history.test.ts`; `products.spec.ts` caso 9 |
> | FR-CLI-01 | `crm.test.ts` («crea el cliente normalizado y lo audita en la misma transacción»); `clients.spec.ts` caso 1 |
> | FR-AUD-01 | `crm.test.ts`, el mismo caso; `products.spec.ts` caso 3; `clients.spec.ts` caso 5 |
> | FR-MET-03 | **Ningún caso lo afirma.** Se sostiene de forma indirecta: cada test de métricas calcula el valor desde filas sembradas, y el esquema no tiene ninguna tabla de valores de métricas que se pueda editar |
>
> El criterio 1 de §1 sigue **cumplido**, con esa salvedad: 28 de 29 con un caso concreto y FR-MET-03 probado solo de forma indirecta. El «29 de 29» de arriba no se sostenía como estaba escrito.

**Observación, no defecto**: la trazabilidad requisito → caso existe, pero para la mitad de los requisitos solo se reconstruye leyendo nombres de tests. Las fases de integración van a agregar requisitos; conviene que su brief exija la etiqueta en el caso que los prueba. Destino: **I-Lectura**, como convención del primer brief.

**`FR-CONV-05` se cumple hoy** —el contrato no está conectado a tráfico real— y es precisamente el requisito que la 10.2 enmienda. Se evalúa cumplido porque la base es `15c8faf` (D-2).

## 3. El criterio de «continuar» (AC-3)

El [Roadmap](../planning/Roadmap.md) §Criterios pide para continuar dos cosas: la Definición de Terminado cumplida sin hallazgos críticos, **y** que el usuario confirme que el backoffice resuelve el dolor descrito en [Vision.md](../product/Vision.md).

- **La primera no se cumple como está escrita**: el criterio 4 está incumplido. Es el hallazgo C-2 del brief, y por eso la decisión se registra como decisión del usuario con la brecha a la vista, no como consecuencia de los criterios.
- **La segunda la confirmó el usuario el 2026-09-23**, con sus palabras: «Sí, creo que resuelve el dolor».

Una observación que la 10.3 tiene que tener delante: el análisis de brechas del usuario cumplió, sin haberse llamado así, la función que el Roadmap le daba al piloto en la opción **iterar** —«el piloto revela datos o flujos no anticipados»—. Precio, marca, categoría, condición, información del negocio, actor de servicio, vencimiento de sesión: nada de eso estaba en el alcance del MVP. El camino elegido es una mezcla de las dos opciones escritas: **continúa** sobre el backend validado y **amplía** el alcance con lo que el uso real reveló. Ninguna de las tres opciones del Roadmap lo describe, y la 10.3 lo escribe (C-2).

## 4. Reevaluaciones heredadas de la 9.4 (AC-4)

Cada una contra el criterio fijado en el brief antes de mirar.

### R-1. APM y tracing — **hace falta antes de producción, en su forma mínima**

La pregunta: ¿los logs con `request_id` alcanzan para diagnosticar una lectura lenta o fallida del agente, que depende del CRM de forma sincrónica en cada turno?

Lo que se encontró:

- **El «log por request» de [Overview.md](../architecture/Overview.md) §Observabilidad es diseño, no comportamiento.** La 8.2 midió que `next start` no registra las peticiones. Lo que queda registrado es lo que el código registra con `logEvent`: las Server Actions y el Route Handler de ingestión. Una ruta de servicio nueva que no llame a `logEvent` sería invisible.
- **No existe correlación entre el agente y el CRM.** Si un turno del agente tarda, hoy no hay forma de encontrar las peticiones al CRM que ese turno hizo.
- **No existe ninguna medición de disponibilidad desde afuera.** `/api/health` existe, pero nadie lo consulta periódicamente.

Resultado:

- **Una herramienta de APM o de tracing distribuido: no hace falta ahora**, y no se elige herramienta. Se reevalúa con tráfico real en **I-Producción**.
- **Tres cosas mínimas sí hacen falta, antes de producción**:
  1. cada ruta de la API de servicio registra `logEvent` con `request_id`, `source`, ruta, resultado y duración — **I-Lectura**, en el diseño del contrato de lectura, porque es ahí donde nacen las rutas;
  2. el contrato de servicio acepta un identificador de correlación del emisor y el CRM lo registra — **I-Lectura**, mismo motivo;
  3. medición externa de disponibilidad y latencia, con alerta, contra un criterio de disponibilidad decidido (pregunta 6 de las brechas) — **I-Producción**.

### R-2. Protección de rama — **no se decide ahora; lo decide el usuario antes del primer despliegue a producción**

Lo que se verificó el 2026-09-23:

- El repositorio es **privado**. La API de GitHub responde `403` a la protección de rama y a los rulesets: «Upgrade to GitHub Pro or make this repository public to enable this feature».
- La documentación de planes de GitHub lista «Protected branches» entre las herramientas de repositorios privados que incluye **GitHub Pro**. La página de precios muestra **Team a USD 4 por usuario por mes (los primeros 12 meses)**. **El precio de GitHub Pro no figura en ninguna de las dos páginas oficiales consultadas, así que queda sin verificar**; no se escribe de memoria.
- **El dato que motivaba la reevaluación no apunta a la protección de rama.** Los cinco refs `cancelled` de la 9.3 los produce [ci.yml:9-11](../../.github/workflows/ci.yml): `concurrency` con `cancel-in-progress: true` por rama, que cancela la corrida de un commit cuando llega el siguiente. Una regla de protección no habría cambiado eso, y el error de aquel día —informar en verde un `cancelled`— fue de lectura, no de mecanismo. La fila de [Risks](../planning/Risks.md) que lo presentaba como «un dato que antes no había» a favor de la protección se corrige.

Opciones, con lo que cuestan:

- **(a) Seguir sin protección** con la disciplina actual: ningún cierre sin leer `headSha` y `conclusion` de la corrida de su commit. Costo: cero. Riesgo: un commit en rojo en `main` que nadie mira.
- **(b) Un plan pago** (Pro o Team) y una regla que exija la CI en verde para integrar a `main`. Obliga a trabajar con ramas y pull requests, que el proyecto no usa. Costo: el del plan, a verificar el día que se decida.
- **(c) Hacer público el repositorio**: se descarta acá sin más análisis, porque `deploy/staging/` versiona nombres de host y configuración de infraestructura. Si el usuario quiere considerarlo, es una decisión de seguridad aparte.

Resultado: **se asigna a I-Producción**, con la condición de que el usuario elija entre (a) y (b) antes del primer despliegue a producción, que es cuando un commit en rojo empieza a tener un camino hasta datos reales. Aparte de esto, y **sin decidirlo acá**: `cancel-in-progress` en `main` deja sin resultado a commits intermedios. Se registra para el primer brief que toque la CI (**I-Lectura**).

### R-3. Retención de `messages` — **la política vigente sigue; se reabre en I-Producción, antes del primer mensaje real**

La condición de reapertura escrita en la 9.2 es «el primer tráfico real». Ni I-Lectura ni I-Turno lo traen: I-Lectura carga el catálogo y la información del primer negocio, no mensajes, e I-Turno trabaja en staging detrás del modo de prueba. El primer mensaje real llega con el corte a producción. *Corrección del 2026-09-23, decidida por el usuario (revisión independiente de la Fase 10, M-1): I-Lectura (Fase 11) no carga los datos reales del primer negocio, porque staging no recibe datos reales. Los carga la 13.5. El resultado de esta reevaluación no cambia.*

Resultado: **conservar indefinidamente** sigue vigente, y se reabre en **I-Producción**, en una subfase de datos reales que decide la retención junto con el borrado real de los datos de un cliente (§5, O-11). Cualquier horizonte de borrado exige revisar el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md): el trigger `messages_insert_only` rechaza `DELETE` para todo rol.

**Se conserva la segunda mitad de la condición**, que [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md) escribió más estricta que la 9.2: la reapertura se adelanta **si entra un dato personal que no sea sintético**. Eso puede ocurrir antes de I-Producción: si las pruebas de I-Turno contra staging usan teléfonos o mensajes reales, aunque sean de quienes prueban, ya son datos personales no sintéticos. El brief de I-Turno tiene que decir cuál de las dos cosas hace, y si es la segunda, la reapertura se adelanta a esa fase.

## 5. Inventario de obligaciones abiertas (AC-6)

Fuentes barridas: [HANDOFF.md](../../HANDOFF.md) §3.2 (lo que deja la 9.3), §3.3 (lo abierto de la 9.1), §6 «Pendientes», y las filas de [Risks.md](../planning/Risks.md) con fase límite en la 9 o la 10. Destinos: un rótulo de fase, **aceptada** (con motivo o con la condición que la reabre) o **cerrada** (con evidencia).

| # | Obligación | Origen | Destino |
|---|---|---|---|
| O-1 | La 9.3 se cerró sin revisión independiente | HANDOFF §3.2 | **En curso en esta subfase** (D-6, AC-7). *Hecha el 2026-09-23 (§6); cerrada, como la cuenta el recuento de abajo* |
| O-2 | Los planes de la 9.3 son *custom*; no se midió si alguno pasa al plan genérico de las sentencias preparadas | HANDOFF §3.2 | **I-Producción**. Antes de medir, leer en el paquete instalado cómo prepara las sentencias el driver: si no las nombra, la pregunta puede no aplicar |
| O-3 | El dueño a nivel de base cambia de `postgres` a `crm_owner` al restaurar | HANDOFF §3.2 | **I-Producción**, en el runbook de restauración del entorno productivo |
| O-4 | AC-2 de la 9.1: la corrida en seco de `certbot renew` y el estado del timer sin salida capturada | HANDOFF §3.3 | **I-Producción**: el certificado productivo no puede depender de algo que nunca se vio renovar |
| O-5 | AC-6 de la 9.1: la discrepancia `account\|13\|17` sin explicación | HANDOFF §3.3 | **Aceptada**: la conclusión del criterio no depende de ella y se reapoyó en otro argumento. Se reabre si H-3 se vuelve a medir |
| O-6 | AC-4 de la 9.1: la cookie verificada por inferencia, no sobre el `Set-Cookie` crudo | HANDOFF §3.3 | **I-Producción**, verificada sobre la respuesta cruda en el entorno productivo |
| O-7 | La migración `0003` no corre sin `CREATEROLE` | HANDOFF §3.3 | **I-Producción**: decidir antes de crear la base productiva si se documenta o si la migración deja de crear roles |
| O-8 | `drizzle-kit migrate` sale con código 1 sin imprimir error | HANDOFF §3.3 | **I-Lectura**: es la primera fase que despliega migraciones nuevas a staging, y ahí este defecto deja de ser teórico |
| O-9 | El servidor no se puede leer desde un test; la comparación con lo desplegado es un paso manual | HANDOFF §3.3 | **Aceptada** como mitigación de H-1, con su paso manual en `deploy/staging/README.md`. Se reabre en I-Producción si el despliegue productivo no puede seguir ese paso |
| O-10 | La suite end-to-end nunca corrió contra staging | HANDOFF §3.3 | **I-Lectura**, en la subfase del piloto, que decide qué recorrido sobre staging hace falta |
| O-11 | Borrado real de los datos de un cliente frente a `audit_logs` de solo inserción | HANDOFF §6 | **I-Producción**, junto con la retención (R-3): los dos son decisiones sobre datos reales y los dos chocan con el ADR 0013 |
| O-12 | Recorridos completos de `conversations` con una sola organización | HANDOFF §6 | **Cerrada** en la 9.3 ([evidencia-9.3](evidencia-9.3-volumen.md)) |
| O-13 | Volumen de productos e inventario y `EXPLAIN` de las Fases 4 y 5 | HANDOFF §6 | **Cerrada** en la 8.5 y medida con varias organizaciones en la 9.3 |
| O-14 | Cliente «Matias Garavano» creado a mano en desarrollo | HANDOFF §6 | **Aceptada**: dato de la base de desarrollo, sin efecto fuera de ella |
| O-15 | Retención de `messages` | HANDOFF §6 | **R-3** |
| O-16 | Verificación de `Origin` con el primer Route Handler que use la sesión | HANDOFF §6 | **Aceptada con condición**: la API de servicio no usa la sesión, así que no la dispara. Sigue vigente para cualquier ruta nueva con sesión |
| O-17 | Token de advertencia para «bajo stock» | HANDOFF §6 | **Aceptada con condición**: se suma si una subfase autoriza `globals.css`. I-Lectura toca las pantallas 3 a 5 y puede ser esa subfase |
| O-18 | `audit_logs.created_at` con `now()` y desempate por `id` | HANDOFF §6 | **Aceptada con condición**: se revisa si una pantalla lo necesita |
| O-19 | Un worker de Vitest murió una vez con `0xC0000409` en `db-connectivity.test.ts` | HANDOFF §6 | **Aceptada con condición**: no se reprodujo. Se reabre si se repite. El HANDOFF pedía mirarlo «antes de la 9.1» y no se hizo; queda dicho |
| O-20 | Intermitencia del proyecto `guards` (dos veces) | HANDOFF §6 y §7 | **Aceptada con condición**, igual que O-19 |
| O-21 | Fallas end-to-end «Target page, context or browser has been closed» y un caso que se multiplicó por catorce en CI | HANDOFF §6 | **I-Lectura**: subir los artefactos de Playwright cuando el paso falla. Es lo que faltó para diagnosticarlo, y la primera fase de integración (Fase 11) va a agregar pantallas y end-to-end |
| O-22 | `proxy.ts` se reevalúa con más rutas protegidas | HANDOFF §6 | **Aceptada con condición**: `proxy.ts` solo emite cabeceras. I-Lectura agrega rutas de servicio y verifica que las cabeceras sigan aplicando |
| O-23 | Los índices de `unaccent` dependen de que el diccionario no cambie | HANDOFF §6 | **Aceptada**, documentada en `drizzle/0015_*` y en DataModel. Se reabre ante cualquier cambio de versión de la extensión |
| O-24 | Los tests de `EXPLAIN` de la 9.0.2 prueban forma, no tiempo | HANDOFF §6 | **Aceptada**: el tiempo se midió en la 9.3 |
| O-25 | Lint de accesibilidad con `eslint-plugin-jsx-a11y` | HANDOFF §6 | **Aceptada con condición**: cuando soporte ESLint 10 |
| O-26 | Timeouts bajo carga en local | HANDOFF §6 | **Aceptada con condición**: si se repiten en CI |
| O-27 | `CREATEROLE` en un servicio gestionado | HANDOFF §6 | **I-Producción**, con la elección del hosting productivo. La conexión con un rol miembro de `crm_app` ya está verificada en staging (9.1) |
| O-28 | Cuatro avisos moderados de `npm audit` | HANDOFF §6 | **Aceptada** en la 8.3 con condición de salida verificable (Drizzle Kit 1.0) |
| O-29 | H-3 en todo entorno sin `TRUSTED_PROXY=true` | HANDOFF §6, Risks | **I-Producción**, como **precondición bloqueante** del entorno productivo, igual que lo fue de la 9.1 |
| O-30 | Protección de rama | HANDOFF §6, Risks | **R-2** |
| O-31 | Revisiones del stack: Node 26 LTS (2026-10-28), TypeScript 7.1, Drizzle 1.0, `crypto.argon2` nativo | HANDOFF §6 | **I-Producción**: la versión de runtime se fija antes del primer despliegue productivo. Node 26 entra a LTS antes |
| O-32 | APM y tracing | Overview, Risks | **R-1** |
| O-33 | `revokeCredential` filtra solo por id; diferida con condición | Risks | **Aceptada con condición**: se reabre si la revocación se expone por HTTP o pasa a manos no operativas. I-Lectura diseña la API de servicio y comprueba que no la dispara |
| O-34 | La métrica 12 nunca se midió con datos de ingestión reales | Risks | **I-Turno**, que conecta al primer emisor real de ingestión en staging, detrás del modo de prueba |
| O-35 | La autenticación y los fixtures del contrato solo se validaron con requests sintéticos | Risks | **I-Turno**: es el gate que [IntegrationBoundaries](../architecture/IntegrationBoundaries.md) ya le asigna al proyecto de integración |
| O-36 | Validación de las personas contra el uso real (fase límite: Fase 9) | Risks, índice | **I-Lectura**, en el piloto: la 9.4 era donde iba a ocurrir y se disolvió. **La fase límite venció sin cumplirse**, y queda dicho |
| O-37 | Cuándo priorizar un segundo canal además de WhatsApp (fase límite: Fase 10) | Risks, índice | **Aceptada con condición**: no antes de que el primer canal esté en producción. El ERP ya está detrás de esa misma línea por decisión del usuario |
| O-38 | Gestión de secretos: `EnvironmentFile` con `0600` de `root` en staging, que «no se lleva a producción sin volver a decidirlo» | Risks, índice (fila resuelta en la 9.1) | **I-Producción**. **No estaba en las fuentes que el brief nombró**: apareció al editar Risks para el AC-5, escrito dentro de una fila tachada como resuelta. Una obligación vigente dentro de una fila cerrada es exactamente la forma en que se pierde |
| O-39 | Lo que la 9.3 no midió aunque su cierre lo diera por medido: planes con salida cruda y tiempo para todo su alcance, el peor caso de la paginación profunda, el dashboard completo con la métrica 12 y el resultado de cada llamada, la ventana del manifiesto de la 9.2 | §6: R-3, R-4, R-6, R-9, R-10 | **I-Producción**, junto con O-2: es la medición que la integración va a citar antes de exponer datos reales |
| O-40 | Instrumentos que pasan en verde sin medir lo que dicen: el contenido de `recorrer-pantallas.ts`, su control negativo por clase, el resultado del dashboard en `medir-caminos.ts`, las formas sintácticas de la guarda de PostgreSQL de staging, las mutaciones de la guarda de identidad del seed y la idempotencia de `users` en el seed; y el comentario de `deploy/staging/crm-backup.sh:76` que dice «se vuelve a medir en la 9.3» | §6: R-7, R-8, R-9, R-10, R-12, R-13, R-14 | **I-Lectura**, en su primera subfase: el piloto reutiliza `recorrer-pantallas.ts`, y usarlo sin corregir repetiría R-7 |
| O-41 | ¿Sigue encendido `log_min_duration_statement = 0` en el rol `crm_owner` de staging? | §6: R-16 | **Cerrada el 2026-09-23: está apagado.** El usuario autorizó la consulta de solo lectura; el clasificador de permisos de Claude Code la bloqueó la primera vez, y el usuario agregó una regla acotada a `psql` con `default_transaction_read_only=on`. Salida cruda: `filas: 0` en `pg_db_role_setting` (ninguna configuración por rol ni por base) · `servidor: log_min_duration_statement=-1 (default)` · `read_only=on`. **Lo que esto no dice**: cuándo se apagó. Los logs de PostgreSQL escritos durante la medición de la 9.3 sí pueden tener sentencias con parámetros; son de datos sintéticos del seed de volumen, así que no hay datos personales en ellos |
| O-42 | Números defectuosos de la 9.3 propagados en `CHANGELOG.md`, `Roadmap.md`, `TraceabilityMatrix.md`, `HANDOFF.md`, `brief-9.3`, `evidencia-9.3` y un comentario de `deploy/staging/crm-backup.sh` | §6: R-5, R-1, R-6, R-10 | **Esta fase.** El usuario amplió la lista cerrada el 2026-09-23: `brief-9.3`, `evidencia-9.3` y `TraceabilityMatrix.md` **corregidos en la 10.1**, con nota fechada y sin borrar el texto. `Roadmap.md`, `CHANGELOG.md` y `HANDOFF.md` en la 10.3, que los tiene autorizados. El comentario de `crm-backup.sh:76` pasa a **O-40** (I-Lectura), por recomendación aceptada: tocarlo es tocar `deploy/` |

**Recuento: 42 obligaciones**, contadas fila por fila y no por rangos (un primer borrador de esta línea contó por rangos y dio 15 aceptadas en lugar de 16):

| Destino | Filas | Total |
|---|---|---|
| Cerradas | O-1, O-12, O-13, O-41 | 4 |
| Reevaluaciones de §4 | O-15, O-30, O-32 | 3 |
| I-Lectura | O-8, O-10, O-21, O-36, O-40 | 5 |
| I-Turno | O-34, O-35 | 2 |
| I-Producción | O-2, O-3, O-4, O-6, O-7, O-11, O-27, O-29, O-31, O-38, O-39 | 11 |
| Aceptadas, con motivo o condición | O-5, O-9, O-14, O-16, O-17, O-18, O-19, O-20, O-22, O-23, O-24, O-25, O-26, O-28, O-33, O-37 | 16 |
| Esta fase | O-42 | 1 |
| | | **42** |

La convención de etiquetar los FR (§2) y las dos piezas mínimas de observabilidad (R-1) también van a I-Lectura, pero son decisiones de esta subfase, no obligaciones heredadas, y no entran en la tabla.

**Ninguna obligación queda asignada a una fase sin llegar a una subfase**: las que tienen rótulo llegan a la 10.3, que al numerar las fases las baja a subfase (ver §Traspaso).

## 6. Revisión independiente de la 9.3 (AC-7)

Hecha el 2026-09-23 con el subagente `independent-reviewer`, de solo lectura, contra el brief-9.3, la evidencia-9.3 y los instrumentos que dejó. `self_assessment: false`. Informó **22 hallazgos: 0 bloqueantes, 10 mayores, 6 menores y 6 notas**, y recalculó los recuentos que sí cierran (clientes, miembros, eventos, mensajes, la calibración 0,82×–4,17× con mediana 2,29× y umbral 916 ms, y los 924 tests). No pudo leer Git, la CI ni el servidor.

El cierre de la 9.3 no se borra: [brief-9.3](brief-9.3-datos-de-volumen-en-staging.md) y [evidencia-9.3](evidencia-9.3-volumen.md) siguen diciendo lo que decían, y las correcciones se registran acá y en `Risks.md`.

### Verificados contra el código y aceptados

| # | Severidad | Hallazgo | Verificación |
|---|---|---|---|
| R-1 | mayor | El «dashboard de doce métricas» (226,8 ms / 39,3 ms) mide **diez llamadas** y no incluye la métrica 12 | `scripts/medir-caminos.ts:239-288`: diez funciones de `analytics`, ninguna `getIngestionErrors`. Confirmado |
| R-2 | mayor | El plan de la métrica 12 no pudo salir del log de ese script, como dice la evidencia; su origen no consta | se sigue de R-1: el script no llama a la métrica. Aceptado como «origen no verificable» |
| R-3 | mayor | AC-6 no sostenido: seis planes en tabla resumida, sin salida cruda de `EXPLAIN` ni tiempo, contra un alcance de decenas de consultas | `evidencia-9.3:234-241`. Confirmado por lectura |
| R-4 | mayor | AC-7 («todo recorrido secuencial registrado») cubre solo esos seis | mismo lugar. Confirmado |
| R-5 | mayor | «4.309 productos ajenos» es falso: son 3.800 ajenos y 509 inactivos propios | 13.800 − 9.491 = 4.309, y 13.800 − 10.000 = 3.800. Confirmado. Se propagó a `CHANGELOG.md`, `Risks.md`, `Roadmap.md`, `TraceabilityMatrix.md` y `HANDOFF.md` |
| R-6 | mayor | La «paginación profunda» es la página 100 (offset 2.475), no la última; la calibración compara la página 380 de la 8.5 con la 20 | `scripts/medir-caminos.ts:185,194`. Confirmado. La aritmética del factor cierra; la comparabilidad no |
| R-7 | mayor | La comprobación de contenido de `scripts/recorrer-pantallas.ts` pasa con el menú: en 6 de 9 pantallas la expresión esperada es una etiqueta de navegación | expresiones de `:157,159,190,238` contra los rótulos de `src/app/(autenticado)/layout.tsx:21-26`. Confirmado |
| R-9 | mayor | En el dashboard, `medir-caminos.ts` descarta lo que devuelve `Promise.all`: un `Failure` en microsegundos vuelve a poder pasar por rápido, que es el defecto que la 9.3 dijo haber corregido | `:286-288`. Confirmado |
| R-10 | mayor | AC-12 a medias: la ventana del manifiesto que la 9.2 difirió no se midió, y «sin deriva con la aplicación corriendo» no prueba nada sin escrituras | por lectura de la evidencia. Aceptado |
| R-12 | menor | La guarda `staging-postgres-config` descarta las líneas sin `=` y distingue mayúsculas: `effective_cache_size 4GB` al final del archivo cambia el servidor con la guarda en verde | `tests/guards/staging-postgres-config.test.ts:42-43`. Confirmado. **Es la sexta guarda del proyecto que nace viendo una sola forma sintáctica, y otra vez la encontró una revisión independiente** |
| R-14 | menor | La segunda corrida del seed sí cambia filas: `users` se reescribe con un hash nuevo, porque argon2 usa sal aleatoria | `seeds/volume.ts:292,312-315`. Confirmado |
| R-16 | menor | No consta que se haya apagado `log_min_duration_statement = 0` en el rol `crm_owner`. Si sigue encendido, el servidor registra toda sentencia de ese rol **con sus parámetros**, incluido el backup diario | `scripts/medir-caminos.ts:16` dice «se apaga al terminar»; ningún documento registraba el `RESET`. **Verificado en el servidor el 2026-09-23: está apagado** (O-41). El hallazgo era correcto como hallazgo de registro: el apagado no constaba en ningún lado |

### Aceptados sin verificación propia, por ser de lectura documental

R-8 (el control negativo no ejercitó dos de sus clases), R-11 (parámetros registrados una sola vez), R-13 (las mutaciones de la guarda de identidad son simuladas y una codificación aditiva pasaría), R-15 (la causa del cambio de índice en «Clientes, total» no se separó de `random_page_cost`), R-17 (nivel de validación inflado), R-19 (`effective_cache_size`: 4.096 / 961 = 4,26 veces, no «seis»), R-20 (el «1» previo de `n_distinct` no se midió), R-21 (el recorrido escribe sesiones), R-22 (+11 % del dashboard llamado ruido sin evidencia).

> **Corrección del 2026-09-23** (revisión independiente de la Fase 10, M-3): aceptar sin verificar no cumplía AC-7. Verificados después, contra la evidencia y los scripts:
>
> - **Confirmados (5)**: R-8 —la salida del control negativo (`evidencia-9.3`, §El control negativo) no tiene ninguna línea de la clase «petición fallida»: el 404 aparece como error de consola, y la clase de contenido se ejercitó con una expresión imposible—; R-15 —el cambio de índice de «Clientes, total» coincide con el cambio de parámetros y con las veinte organizaciones, y ninguna medición los separa—; R-19 —`brief-9.3:54` dice «unas seis veces», y 4.096 / 961 = 4,26—; R-20 —la evidencia solo tiene el `n_distinct` posterior a `ANALYZE`; el «1» previo que cita el Roadmap no se midió—; R-21 —`recorrer-pantallas.ts` ingresa por `/login`, y cada ingreso crea una sesión en la base de staging.
> - **De criterio, aceptado (1)**: R-17. La evidencia declara «validado en staging», y con R-3, R-4 y R-7 confirmados el nivel no se sostiene para todo el alcance.
> - **No reproducidos (3)**: R-11, R-13 y R-22. No encontré en la evidencia el «+11 %» de R-22, ni pude comprobar la codificación aditiva de R-13 o el registro único de parámetros de R-11 sin ejecutar nada. **Quedan como no verificados, no como aceptados**, y no sostienen ninguna conclusión de esta evaluación.

### R-18 — lo que toca al gate de la Fase 9

El revisor señala una contradicción que no le corresponde resolver, y que este documento tampoco resuelve solo: el [ExecutionProtocol](../development/ExecutionProtocol.md) exige revisión independiente a toda subfase cuyo resultado abra o cierre un gate; el brief-9.3 dice que no cierra ninguno; y el [Roadmap](../planning/Roadmap.md) §Fase 9 cerró el gate de salida contando el AC-10 de la 9.3 como uno de sus dos criterios cumplidos.

La consecuencia, sumada a R-7: **de los dos criterios con que se cerró el gate enmendado de la Fase 9, uno —«las 10 pantallas funcionan sin errores con volumen»— se sostiene en un instrumento que no discrimina el contenido en 6 de 9 pantallas.** Lo que sí quedó probado es que las diez cargan sin error de consola, excepción ni petición fallida. No invalida el cierre —el gate era decisión del usuario—, pero el criterio vale menos de lo que el cierre dijo. **Elevado al usuario, que el 2026-09-23 estuvo de acuerdo en registrarlo así, sin reabrir el cierre.** Queda escrito en el [brief-9.3](brief-9.3-datos-de-volumen-en-staging.md) §Revisión independiente posterior al cierre, donde además consta que la subfase no cumple la condición de cierre que ella misma se fijó.

### Lo que cambia en esta evaluación

- **Ningún veredicto de la Definición de Terminado cambia**: ninguno de los seis criterios descansa en la 9.3.
- **Cambian números que la integración iba a citar.** No se citan más como estaban: el dashboard «de doce métricas», los «productos ajenos» y la «paginación profunda» quedan corregidos en `Risks.md` y el resto de los documentos se corrige según §Traspaso.
- **Cuatro obligaciones nuevas**, O-39 a O-42, en §5.

## Traspaso a la 10.3

Lo que la 10.3 recibe de esta subfase, y tiene que cumplir para no dejar huérfano nada de lo de arriba:

- Reemplazar **I-Lectura, I-Turno, I-Producción e I-Migración** por los números de fase, aquí y en todos los documentos que los usen, y bajar cada obligación asignada a una subfase de esa fase. Fuera de este documento los rótulos se escribieron en prosa, así que la búsqueda tiene que cubrir las dos formas: `grep -rn "I-Lectura\|I-Turno\|I-Producción\|I-Migración\|primera fase de integración\|fase del contexto del turno\|fase de producción de la integración" docs`. Los documentos tocados por esta subfase son `Overview.md`, `DataModel.md`, `SecurityModel.md`, `NonFunctionalRequirements.md` y `Risks.md`.
- Escribir la opción de decisión que el Roadmap no tiene (§3).
- Dejar la protección de rama (R-2) como decisión del usuario con fecha límite en I-Producción.

## 7. Decisión del usuario (10.3, AC-17)

**2026-09-23: continuar ampliando el alcance.** Con las palabras del usuario: «Continuar ampliando». Es la opción que la 10.3 agregó al [Roadmap](../planning/Roadmap.md) §Criterios (C-2): sobre el backend validado, sin volver a la Fase 1, con el alcance nuevo en las Fases 11 a 14.

Tomada con la brecha a la vista, no derivada de los criterios:

- **Criterios de la Definición de Terminado incumplidos: uno**, el 4 (piloto en staging sin bloqueantes, con datos sintéticos), **incumplido por decisión**. El piloto es ahora la subfase 11.4.
- **Salvedad sobre un criterio cumplido**: el 1 (todos los FR probados) se sostiene con 28 de 29 FR con un caso concreto y FR-MET-03 probado solo de forma indirecta (§2, corrección).
- **El criterio de «continuar» como estaba escrito no se cumplía** (§3): la decisión es del usuario, como lo permite el gate de salida.
