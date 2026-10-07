---
schema: task-brief.v1
task_id: "16.2"
task_type: integration
generated_at: 2026-10-07
---

# Brief 16.2 — Etiquetas puestas por el agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `integration`
- **Nivel de evidencia objetivo**: `deterministic` para el contrato, el validador, el servicio y la ruta de lectura, contra PostgreSQL real; `isolated-runtime` para el despliegue; `producer-consumer` para el agente como emisor real.
- **Nivel de validación alcanzable**: **validado localmente y en CI**, desplegado en producción y **validado en integración** con el agente. No es «preparado para producción»: ninguna subfase de la Fase 16 lo reclama.
- **Orden**: segunda subfase de la Fase 16 ([Roadmap](../planning/Roadmap.md) §Fase 16). Depende de la 16.1, que dejó el catálogo y las asignaciones ([brief-16.1](brief-16.1-etiquetas-de-clientes.md)).
- **Estado**: aprobado el 2026-10-07 con las recomendaciones de D-1 a D-13; **cerrado el 2026-10-07** (§Cierre).
- **No abre ni cierra gate**, pero **cambia un contrato con el agente**: el Roadmap deja que el brief decida la revisión independiente (D-11).
- **Estado de este documento**: **aprobado el 2026-10-07** por el usuario, con las recomendaciones de D-1 a D-13 y la nota de H-1. La aprobación no autoriza ningún commit, cambio en Notion, despliegue ni pedido al agente: cada uno se autoriza en su turno.

## Objetivo

Que el agente de WhatsApp pueda poner y quitar etiquetas del catálogo de la organización en un cliente («Interesado», «Reclamo», etc.), por el contrato de ingestión v2, con las mismas reglas que un admin en la ficha y con la credencial como autor en el historial.

Resultado verificable: un `client.tag_added` del agente deja la etiqueta en el cliente, visible en la ficha y en el filtro de la lista, con una entrada «Etiqueta agregada» cuyo autor es la credencial; un reenvío idéntico no escribe nada.

**«Quiere señar» sigue siendo solo una etiqueta** ([brief-16.1](brief-16.1-etiquetas-de-clientes.md); [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md)): que la ponga el agente no dispara nada.

## Lo que se verificó antes de escribir este brief

- **El contrato v2 admite tipos nuevos sin versión nueva**: «agregar un `event_type` o un canal que el modelo admita es compatible dentro de v2» ([ingestion-v2](../contracts/ingestion-v2.md) §Versionado). v1 está congelada.
- **La lectura admite rutas nuevas dentro de v1**, pero no campos nuevos en una respuesta existente ([read-v1](../contracts/read-v1.md) §Versionado).
- **El patrón de escritura por servicio ya existe**: `ingestion` abre la transacción, reserva el evento en `ingestion_events` y llama a una función de `crm` que escribe y audita con `actorCredentialId` (`resolveClientByPhone`, `crm/service.ts`, desde la 12.1). `ingestion` ya importa `crm` ([Overview](../architecture/Overview.md), tabla de módulos). No hace falta ninguna dependencia nueva entre módulos.
- **No hace falta migración**: `ingestion_events.event_type` es texto; `tag_change` y `client_tag` ya existen en los enums de auditoría (0026); `audit_logs.actor_credential_id` existe desde la 0022.
- **Las reglas de la 16.1 viven en `crm`**: la etiqueta activa para poner (D-8), el límite de 10 por cliente (D-11), el cliente bloqueado `FOR UPDATE` y la etiqueta `FOR SHARE` (revisión independiente de la 16.1.1, hallazgo 4). Al escribir este brief estaban dentro de `changeClientTag`, que exige un `AuthContext` de usuario; la 16.2.1 las pasó a `applyClientTagChange`, que comparten la ficha y la ingestión.
- **La métrica 12 excluye por tipo** los eventos que no son mensajes (`client.resolved` y `conversation.escalated`, `analytics/repository.ts`), y [MetricsCatalog](../analytics/MetricsCatalog.md) §12 pide que cada subfase que agregue un tipo decida si cuenta.
- **Producción**: la ingestión y la lectura están encendidas solo para las credenciales `agente-demo`, de la organización «Demostración Vixora», cuyo único cliente es el usuario (HANDOFF). Staging corre `6705457`, muy atrás de producción.

### Hallazgo H-1 (contraste con las reglas vigentes)

El [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), punto 1, dice que el agente «escribe conversaciones y mensajes por el contrato de ingestión», con una nota del 2026-09-25 que agrega la resolución del cliente. Poner etiquetas es otra escritura por la misma superficie. **No es una tercera superficie y no cambia la decisión**, pero el texto queda incompleto. Recomendación: una nota fechada en el ADR 0014 y en [IntegrationBoundaries](../architecture/IntegrationBoundaries.md), como hizo la 12.1. Lo decide el usuario al aprobar este brief.

## Alcance incluido

1. **Contrato** ([ingestion-v2](../contracts/ingestion-v2.md)): dos tipos nuevos (D-1), con su forma, sus reglas, sus respuestas, sus vectores de prueba con `payload_hash` calculado a mano sobre el texto canónico, y la fila de la guía para el emisor.
2. **Validador** (`ingestion/contract-v2.ts`) y fixtures de forma asumida en `tests/fixtures/ingestion/v2/`.
3. **Proyección** (`ingestion/service.ts`): reservar, proyectar con `crm` y responder; el reenvío idéntico responde `duplicate` sin escribir (D-5).
4. **`crm`**: una función de servicio para poner o quitar una etiqueta con la credencial como actor, que comparta las reglas con la de la ficha sin duplicarlas.
5. **Lectura del catálogo** (D-7): `GET /api/read/v1/client-tags`, con alcance `read`, que devuelve las etiquetas activas de la organización.
6. **Métrica 12** (D-9): los tipos nuevos no cuentan.
7. **Pantalla 7**: el historial ya muestra el autor de servicio; se comprueba que un `tag_change` del agente se lee bien. Sin cambios de UI previstos.
8. **Documentación**: los dos contratos, DataModel (la nota de quién escribe asignaciones), MetricsCatalog, IntegrationBoundaries, SecurityModel (la ruta nueva en la superficie expuesta), FunctionalRequirements (requisito nuevo, FR-CLI-11), TraceabilityMatrix y, según H-1, el ADR 0014.
9. **Pedido al agente** (D-12), escrito fuera del repositorio.
10. **Etapas** (D-10): 16.2.1 local, 16.2.2 producción, 16.2.3 integración con el agente.

## Alcance excluido

- **El repositorio del agente y su n8n**: el agente implementa su parte con sus propios briefs. El CRM no importa, copia ni referencia nada de allá ([ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)).
- **Crear, renombrar o desactivar etiquetas desde el agente**: el catálogo es del admin.
- **Que el agente lea las etiquetas de un cliente**: son datos sobre una persona. Si hace falta, es una ruta del alcance `context` en otra subfase.
- **Cuándo pone cada etiqueta el agente**: es decisión de su prompt y de su repositorio.
- **Cambios en v1** de ingestión, que está congelada.
- **Migraciones**: si aparece la necesidad de una, es condición de detención.
- **Pausar al agente, notas de la conversación y responder desde el CRM**: son la 16.3, la 16.4 y la 16.5.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `src/modules/ingestion/`: `contract-v2.ts`, `contract-v2.test.ts`, `service.ts`, `service.test.ts`, `index.ts`
- `src/modules/crm/`: `service.ts`, `repository.ts`, `index.ts`, `service.test.ts`
- `src/modules/analytics/repository.ts`: **solo** la lista de tipos excluidos de la métrica 12
- `src/app/api/ingestion/v2/events/handler.ts`: **solo** si las respuestas de los tipos nuevos lo exigen
- `src/app/api/read/v1/`: `contract.ts`, `contract.test.ts`, y `client-tags/` (nueva: `route.ts` y `handler.ts`)
- `src/app/(autenticado)/clientes/[clientId]/audit-summary.ts` y su test: **solo** si el texto del autor de servicio no se lee bien
- `tests/fixtures/ingestion/v2/`: fixtures nuevos de forma asumida
- `tests/integration/`: `ingestion-v2.test.ts`, `ingestion-v2-http.test.ts`, `read-api.test.ts`, `analytics-ingestion.test.ts`, `client-tags.test.ts` y uno nuevo, `client-tags-ingestion.test.ts`
- `tests/guards/exposed-surface.test.ts`: **solo** el Route Handler nuevo
- `tests/e2e/client-tags.spec.ts`: **solo** un caso con una etiqueta puesta por el agente en la ficha
- `scripts/probar-ingestion.ts` y `scripts/probar-api-lectura.ts`: **solo** los casos nuevos, si la 16.2.3 los usa
- `docs/contracts/ingestion-v2.md` y `read-v1.md`; `docs/architecture/DataModel.md`, `IntegrationBoundaries.md`, `SecurityModel.md` y `TraceabilityMatrix.md`; `docs/analytics/MetricsCatalog.md`; `docs/product/FunctionalRequirements.md`; `docs/decisions/0014-…md` (**solo** la nota de H-1)
- al cerrar: este brief, `docs/decisions/README.md`, `docs/planning/Roadmap.md`, `CHANGELOG.md` y `HANDOFF.md`

*Ampliada el 2026-10-07 con autorización del usuario*, durante la 16.2.1:

- `src/app/api/ingestion/v1/events/handler.ts`: **solo** la rama de la respuesta de etiquetas en `acceptedResponse`, que arma las respuestas de éxito de las dos versiones; v1 nunca la alcanza;
- `tests/e2e/read-api.spec.ts`: **solo** la ruta nueva en su lista, para las cabeceras de `proxy.ts`.

## Fuentes de verdad

- **El código y las migraciones**: `ingestion` (reserva, proyección, `duplicate`), `crm` (`changeClientTag`, `resolveClientByPhone`), `audit` (actor de servicio), `analytics` (métrica 12) y `drizzle/0022` y `0026`.
- **Los contratos**: [ingestion-v2](../contracts/ingestion-v2.md), [ingestion-v1](../contracts/ingestion-v1.md) (reglas heredadas, `422` y `CONFLICT`) y [read-v1](../contracts/read-v1.md).
- **Las decisiones anteriores**: [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), [brief-12.1](brief-12.1-actor-de-servicio-y-cliente-por-telefono.md) (actor de servicio), [brief-12.2](brief-12.2-conversacion-vigente-y-derivacion.md) (un tipo nuevo dentro del contrato y su `422`), [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md) (v2 y la guía), [brief-13.4](brief-13.4-retencion-y-borrado.md) (identificadores sin datos personales) y [brief-16.1](brief-16.1-etiquetas-de-clientes.md).

## Decisiones pendientes

### D-1 — Forma del evento

- **(a) Recomendada: dos tipos, `client.tag_added` y `client.tag_removed`**, con el cliente y la etiqueta. Cada uno es un hecho: reenviarlo es idempotente y se audita como `tag_change`, igual que en la ficha.
- (b) Un solo `client.tags_set` con la lista completa, que reemplaza las del cliente. Quitaría en silencio las que puso una persona, y dos turnos desordenados se pisarían.
- (c) Un solo tipo con un campo `action`. Equivale a (a) con un campo más que validar.

### D-2 — Cómo se identifica al cliente

- **(a) Recomendada: por `client.phone`** en E.164, como `client.resolved` y `conversation.resolved`. El cliente tiene que existir: si no, `422` con `client_not_found`, terminal. El evento nunca crea un cliente; para eso está `client.resolved`, que el agente ya manda en cada turno.
- (b) Por la referencia de la conversación. Ata la etiqueta a una conversación, cuando es un dato del cliente.

### D-3 — Cómo se identifica la etiqueta

- **(a) Recomendada: por el `id` del CRM**, que el agente lee de la ruta de D-7. Renombrar una etiqueta en el CRM no rompe nada, y lo que el agente manda no depende de mayúsculas ni acentos.
- (b) Por el nombre, sin distinguir mayúsculas. Es más simple para el agente, pero si el admin renombra «Reclamo» a «Queja», los eventos con el nombre viejo dan `422` y esas etiquetas no se ponen.

En los dos casos: una etiqueta inexistente o de otra organización da `422` con `tag_not_found`; **poner** una inactiva, también (D-8 de la 16.1); **quitar** una inactiva se acepta, como en la ficha.

### D-4 — Qué etiquetas puede tocar el agente

- **(a) Recomendada: todas las activas, para poner y quitar.** El historial dice quién lo hizo, y un admin puede corregir desde la ficha. Sin columna nueva ni migración.
- (b) Solo las que el admin marque como «del agente»: una columna en `client_tags`, una migración y un control en la pantalla 13. Da más control, a costa de una migración y de UI.
- (c) Solo poner, nunca quitar. Pasar de «Interesado» a «No interesado» exigiría a una persona.

### D-5 — Respuesta

- **(a) Recomendada: `200` siempre**, con `{ "contract_version": "2", "result": "accepted" | "duplicate", "event_id" }`, como `conversation.escalated`. **Sin datos del cliente ni sus etiquetas**, que el agente no necesita. Poner una etiqueta que el cliente ya tiene, o quitar una que no tiene, es `accepted` sin escritura ni auditoría, porque el estado pedido ya se cumple.
- (b) Devolver además las etiquetas actuales del cliente. Es leer datos de una persona con la credencial de escritura.

### D-6 — Reglas de negocio

Todas `422 BUSINESS_RULE_VIOLATION`, terminales, con la regla en `error_code`, como en la 12.2:

- `client_not_found` (D-2);
- `tag_not_found` (D-3);
- `client_tag_limit`: el cliente ya tiene 10 (D-11 de la 16.1).

Un cliente **desactivado** se puede etiquetar, como en la ficha. Recomendación: así, sin regla nueva.

### D-7 — Lectura del catálogo

- **(a) Recomendada: `GET /api/read/v1/client-tags`**, con alcance `read`: las etiquetas **activas**, con `id` y `name`, ordenadas por nombre, sin paginación (son 50 como mucho). Es una ruta nueva, compatible dentro de v1. El catálogo es configuración de la organización, no datos de una persona, así que no necesita `context`.
- (b) Sin ruta: el agente carga los nombres a mano en su configuración. Solo sirve con D-3 (b), y se desincroniza al primer cambio del catálogo.

### D-8 — Versión del contrato

- **(a) Recomendada: solo en v2**, que admite tipos nuevos como cambio compatible. v1 queda congelada y responde a estos tipos como a cualquier `event_type` desconocido.

### D-9 — Métrica 12

- **(a) Recomendada: no cuentan**, ni fallidos ni procesados, como `conversation.escalated`: no son mensajes, y un fallo no pierde un mensaje. Se agregan a la exclusión de `analytics/repository.ts` y a [MetricsCatalog](../analytics/MetricsCatalog.md) §12.
- (b) Cuentan. Bajarían la tasa sin que fallen menos mensajes, que es lo que la métrica mide.

### D-10 — Etapas

- **(a) Recomendada: tres.**
  - **16.2.1 — Local**: contrato, validador, servicio, ruta de lectura, métrica, tests y documentos. Un commit con autorización.
  - **16.2.2 — Producción**: despliegue **sin migraciones**. Las credenciales `agente-demo` ya tienen `ingest` y `read`; nada cambia hasta que el agente mande los tipos nuevos.
  - **16.2.3 — Integración con el agente**: cuando el agente implemente su parte, una ventana en **la organización de demostración de producción**, con el teléfono del usuario como único cliente, como la 13.5.2-a. Se concilia lo que mandó con las asignaciones, la auditoría y `ingestion_events`.
- (b) La 16.2.3 en staging, como la 12.5. Exige desplegar en staging todo lo que hay desde `6705457`, con las migraciones `0026` y `0027`, y crear credenciales de prueba allá.

### D-11 — Revisión independiente

- **(a) Recomendada: sí, antes del commit de la 16.2.1**, contra este brief y los contratos. Un contrato que consume otro sistema es caro de corregir después de que lo implementa.
- (b) Solo autoevaluación declarada.

### D-12 — Coordinación con el agente

- **(a) Recomendada**: un pedido escrito en el Escritorio del usuario (`Pedido-16.2-CRM-al-Agente.md`), fuera del repositorio, como en la 12.5 y la 13.5, **después** de desplegar la 16.2.2 y con el contrato ya publicado. Dice qué tipos nuevos hay, la ruta del catálogo, la guía de reenvío y qué se concilia en la ventana. El usuario lo lleva a la sesión del agente.

### D-13 — Cuándo cierra la 16.2

- **(a) Recomendada: no cierra sin la 16.2.3**, como la 12.3 (D-9 A): el objetivo es que el agente etiquete, y sin el emisor real queda «validado localmente». Mientras se espera al agente puede prepararse la 16.4, que no depende de él.
- (b) Cierra con la 16.2.2, y la integración se registra después como nota.

## Invariantes

1. **Aislamiento**: un evento solo toca clientes y etiquetas de la organización de su credencial; un `id` de etiqueta ajeno da `tag_not_found`, igual que uno inexistente.
2. **Las reglas son las de la ficha**: activa para poner, 10 por cliente y los mismos bloqueos, en un solo lugar de `crm`, sin copia en `ingestion`.
3. **Idempotencia**: un reenvío idéntico no escribe ni audita; uno con otro contenido bajo el mismo `event_id` da `409 event_payload_mismatch`.
4. **Exactamente un actor**: cada `tag_change` del agente lleva `actor_credential_id` y no `actor_user_id`.
5. **v1, los cuatro tipos existentes de v2 y sus vectores no cambian.**
6. **La lectura**: ninguna respuesta existente de read-v1 cambia; la ruta nueva no devuelve datos de clientes.
7. **El enmascarado del teléfono y los permisos de la 16.1 no cambian**: un viewer sigue sin escribir.
8. **Sin migraciones.**

## Criterios de aceptación

**16.2.1**

- **AC-1** (D-1, D-2, D-3): `client.tag_added` pone la etiqueta y `client.tag_removed` la quita, por v2, con la forma del contrato; el validador rechaza con `400` y el campo cada forma inválida (teléfono, `id`, campos desconocidos y faltantes), probado con fixtures.
- **AC-2** (D-6): `client_not_found`, `tag_not_found` (inexistente, ajena e inactiva al poner) y `client_tag_limit` responden `422`, terminales, con la regla en `error_code` y sin escribir la asignación; un reenvío responde la misma regla.
- **AC-3** (D-5): `accepted` con y sin cambio, `duplicate` en el reenvío, sin escritura ni auditoría de más; `409 event_payload_mismatch`.
- **AC-4** (invariante 4): el `tag_change` lleva la credencial como actor, y la pantalla 7 lo muestra con el `source`.
- **AC-5** (invariante 2): poner desde el agente mientras un admin desactiva la etiqueta espera y termina en `tag_not_found`, con la desactivación retenida desde una tercera conexión; y el límite de 10 no se pasa con un evento y una acción de la ficha simultáneos.
- **AC-6** (D-7): `GET /api/read/v1/client-tags` devuelve las activas de la organización con `id` y `name`, valida contra su esquema estricto, exige alcance `read`, aísla organizaciones y no lleva datos de clientes.
- **AC-7** (D-9): la métrica 12 no cuenta los tipos nuevos, probado en `analytics-ingestion.test.ts`.
- **AC-8** (D-8, invariante 5): v1 responde `400` a los tipos nuevos; los vectores existentes y sus hashes siguen iguales, y los nuevos se calcularon a mano.
- **AC-9**: la ruta nueva está en la guarda de superficie expuesta y en SecurityModel; los documentos de la lista quedan sin contradicciones; FR-CLI-11 en los tests.
- **AC-10**: la batería completa en verde (formato, lint, tipos, unitarios, guardas, integración, build y end-to-end) y una mutación por regla nueva en rojo: sin la comprobación de etiqueta activa, sin el límite y sin el filtro por organización de la ruta.
- **AC-11** (D-11, si se aprueba): revisión independiente antes del commit, con cada hallazgo verificado contra el código.

**16.2.2**

- **AC-12**: con autorización, despliegue en producción sin migraciones (28 siguen siendo 28), recuentos iguales antes y después, y la ruta nueva responde `401` sin token.

**16.2.3**

- **AC-13**: en una ventana con el agente sobre la organización de demostración, cada evento que el agente mandó queda conciliado con su fila de `ingestion_events`, la asignación y la auditoría; el usuario ve las etiquetas en la ficha y aprueba el cierre.

## Pruebas y evidencia requerida

- `deterministic`: validador con fixtures, servicio e integración contra PostgreSQL real, con las mutaciones de AC-10 en rojo.
- `isolated-runtime`: el despliegue de la 16.2.2, con los comandos y las salidas registrados en este brief, sin secretos ni IP.
- `producer-consumer`: la conciliación de la 16.2.3. Los fixtures de forma asumida se declaran como tales y no cuentan como evidencia de integración.

## Condiciones de detención

Detenerse y elevar al usuario si:

- hace falta tocar un archivo fuera de la lista, o una migración;
- un vector o una respuesta existente de ingestión v1, v2 o de lectura cambia;
- compartir las reglas de la 16.1 exige cambiar el comportamiento de la ficha;
- el agente pide algo que exige v3, un campo nuevo en una respuesta existente, o que el CRM lo llame;
- aparece un dato personal en un identificador o en el log.

Y siempre **antes de**: el commit de la 16.2.1, el push, el despliegue, el pedido al agente, la ventana de la 16.2.3, los cambios en Notion y el cierre. Cada uno necesita autorización explícita en su turno.

## Resultados — etapa 16.2.1 (local)

- **Precisión de D-7**: la respuesta de `GET /api/read/v1/client-tags` nombra el campo `tag_id`, no `id`, como `product_id` y `entry_id` del mismo contrato. **Aprobada por el usuario el 2026-10-07.**
- **Base local**: Docker Desktop estaba apagado; se levantó el contenedor con `docker compose up -d --wait`.
- **Batería**: formato, lint, tipos y build limpios; Vitest 1.811 casos, con la única falla de la guarda de superficie expuesta mientras la ruta nueva no estaba en el índice (con `git add -N`, las 16 guardas dan 485 de 485); Playwright 127 de 127 sobre `next start`, con el caso 7 nuevo y la ruta en `read-api.spec.ts`.
- **Mutaciones**, todas en rojo y restauradas: M5, sin la comprobación de etiqueta activa (fallan 2 casos de `client-tags-ingestion`); M6, sin el límite de 10 (fallan 2); M7, `findActiveTags` sin el filtro por organización (falla el caso del catálogo de `read-api`); M8, la métrica 12 contando los tipos nuevos (falla su caso de `analytics-ingestion`).
- **Revisión independiente (D-11, AC-11)**, de solo lectura, por un agente que no participó: 12 hallazgos (2 medios, 10 bajos) y 4 dudas, verificados contra el código:
  - 1 (medio), qué gana cuando la etiqueta ya está puesta: el código ya daba `accepted` antes de mirar si está inactiva o el límite, **igual que la ficha en HEAD** (se comparó con `git show HEAD`); se escribió en el contrato y tiene test. **Precisión aprobada por el usuario el 2026-10-07**, junto con la de D-7;
  - 2 (medio), DataModel no nombraba las reglas nuevas en `error_code` ni el reenvío de los tipos nuevos: corregido;
  - 3, 4, 5, 6 y 9, textos: la ruta en §Log de read-v1, los recuentos de ingestion-v2, `tag_id` marcado como pendiente, el `FOR SHARE` solo al poner y una frase de este brief que quedó vieja;
  - 7, `countClientTags` sin uso: borrada. **Ya no se usaba en HEAD**: era código muerto de la 16.1;
  - 8, `.claude/settings.json`: ajeno, queda fuera del commit;
  - 10 y 11, el reenvío de `tag_not_found` y `client_tag_limit` y la sesión que no autentica la ruta: tests nuevos;
  - 12, la lista de `service-read-entry-points.test.ts` no nombra `listActiveTagsForService`: la guarda la cubre por patrón, y el archivo está fuera de la lista. Queda declarado, sin cambio;
  - dudas: D-1 (¿cambió la ficha?) descartada contra HEAD; D-2, `AGENT_SOURCE` y su limpieza son la preparación del caso 7; D-3 (orden con `client.resolved`) y D-4 (uuid en mayúsculas) quedaron escritas en la guía del contrato.

## Resultados — etapa 16.2.2 (producción)

- **2026-10-07**, autorizado por el usuario en su turno. Se siguió `deploy/production/README.md` §Desplegar un cambio.
- **Paso 1**: la CI de `95493648f82b22a62fa69f5ee96abe956a881218` en `success` (corrida `37634311710`, leída por `headSha`).
- **Paso 2**: quedó anotado `b5544d6`, la versión que corría y la ref de vuelta atrás.
- **Paso 3**: `npm ci`, `db:migrate` sin migraciones nuevas (siguen 28), build y reinicio; la última línea dio `desplegado: 9549364…`, y `crm-production` quedó `active`.
- **Recuentos de solo lectura**, de todas las tablas de `public` y de `drizzle.__drizzle_migrations`, dentro de `begin read only`: iguales antes y después.
- **Desde afuera**: `GET /api/read/v1/client-tags` sin token da `401` (AC-12), igual que `GET /api/read/v1/products` y `POST /api/ingestion/v2/events`; `/login` da `200`.
- **Nivel**: `isolated-runtime` del código desplegado. El emisor real todavía no manda los tipos nuevos: eso es la 16.2.3.

## Coordinación con el agente (D-12)

- **2026-10-07**: el pedido se escribió en el Escritorio del usuario, fuera del repositorio, después de la 16.2.2. El agente respondió ese mismo día, sin cambios de contrato.
- **Lo que el agente hace**, en lo contractual:
  - pone etiquetas por `tag_id`, con reglas fijas, no con el modelo;
  - manda la etiqueta recién cuando respondió el `client.resolved` del mismo cliente;
  - el `event_id` es estable ante un reintento y no lleva el teléfono;
  - `occurred_at` es la hora del mensaje que originó el turno;
  - lee el catálogo con caché, y otra vez ante un `tag_not_found`;
  - usa sus credenciales `read` e `ingest` de producción, que ya existen. Que la de lectura tenga alcance `read` lo afirma el agente y no se verificó del lado del CRM.
- **Decisiones del usuario, 2026-10-07**:
  - las tres etiquetas de la primera versión son «Derivado» (pidió una persona), «Reclamo» (soporte) e «Interesado» (ventas con un producto);
  - en la 16.2.3, el `client.tag_removed` lo manda un llamador de prueba del agente, con su credencial y por el borde real, y se declara así. Valida el contrato de quitar, pero no que el agente quite etiquetas en un turno: en su primera versión solo pone;
  - el pedido aparte del agente, la cantidad de stock en la lectura, **no entra en la 16.2**. Pasa a la subfase 16.6 ([Roadmap](../planning/Roadmap.md), Fase 16).

## Resultados — etapa 16.2.3 (integración con el agente)

- **2026-10-07, de 18:35 a 18:55 UTC**, en la organización de demostración de producción, con el teléfono del usuario como único cliente. La autorizó el usuario. El agente usó sus credenciales `read` e `ingest` de producción. Su lectura del catálogo respondió `200`, lo que confirma el alcance `read`.
- **Etiquetas**: «Derivado» la creó el admin para la ventana; «Interesado» y «Reclamo» ya estaban, de la 16.1. El agente leyó sus tres `tag_id` del catálogo, y coinciden con la base.
- **Conciliación** de lo que reportó el agente contra `ingestion_events`, `client_tag_assignments` y `audit_logs`, con consultas de solo lectura:
  - **8 eventos de etiqueta en los dos lados**, con los mismos `event_id` y horas: 6 `client.tag_added` y 2 `client.tag_removed`. 7 terminaron `processed` y 1 `failed` con `tag_not_found` en `error_code`.
  - **5 `tag_change` con la credencial como actor**: «Interesado» puesta y quitada dos veces, y «Derivado» puesta una vez. Las otras dos veces que el agente mandó «Derivado», el cliente ya la tenía: respondieron `accepted` sin escribir ni auditar.
  - **El `422`**: el agente puso «Interesado» con la etiqueta desactivada, porque todavía la tenía en su caché del catálogo. Después releyó el catálogo y no mandó más la etiqueta (paso 8). El cliente recibió todas las respuestas en esos turnos.
  - **Un `accepted` del paso 7 que el agente marcó para revisar**: según la auditoría, el admin desactivó «Interesado» a las 18:53:38, después del evento de las 18:49:37. El CRM aceptó la etiqueta porque en ese momento estaba activa. El usuario confirmó que la desactivó más tarde de lo que se había dicho.
  - **Estado final**: el cliente tiene «Derivado»; «Interesado» está desactivada y sin asignaciones. La ficha muestra la etiqueta, y su historial muestra los 5 cambios con autor «Servicio · agente-demo» (AC-4).
- **Límites declarados**:
  - «Reclamo» no se puso: el agente deriva casi todo reclamo a una persona antes de que responda el agente de soporte, y eso es «Derivado». Lo resuelve el agente en una subfase propia.
  - Los dos `client.tag_removed` los mandó un llamador de prueba del agente, con su credencial y por su emisor real, no un turno: en su primera versión el agente solo pone etiquetas.
  - `client_not_found` y `client_tag_limit` no ocurrieron en la ventana: quedan validadas localmente.
- **Después de la ventana**, el agente sigue etiquetando en la organización de demostración, por decisión del usuario.

## Cierre

**Cerrada el 2026-10-07**, con la aprobación del usuario.

| Criterio | Estado |
|---|---|
| AC-1 a AC-10 | cumplidos en la 16.2.1 (§Resultados 16.2.1) |
| AC-11 | revisión independiente: 12 hallazgos y 4 dudas, verificados; el 12 queda declarado sin cambios |
| AC-12 | cumplido en la 16.2.2 |
| AC-13 | cumplido, con los límites de §Resultados 16.2.3 |

- **Nivel**: validado localmente y en CI; desplegado en producción (`isolated-runtime`); **validado en integración** (`producer-consumer`) con el agente como emisor real, para poner, quitar, `accepted` sin escritura y `tag_not_found`. No es «preparado para producción».
- **Precisiones aprobadas por el usuario el 2026-10-07**:
  - D-7: el campo se llama `tag_id`;
  - qué gana cuando el cliente ya tiene la etiqueta: `accepted`, aunque la etiqueta esté desactivada o el cliente tenga 10.
- **Decisiones del usuario durante la subfase**:
  - los dos archivos fuera de la lista, el handler de ingestión v1 y `read-api.spec.ts`;
  - las tres etiquetas del agente y el `client.tag_removed` por un llamador de prueba;
  - el pedido de la cantidad de stock pasa a la 16.6;
  - el agente sigue etiquetando después de la ventana.
- **Fuera de la lista, en el cierre**: `deploy/production/README.md`. Su paso 6 de «Verificar después de desplegar» todavía esperaba `404` de la ingestión y de la lectura, que responden `401` desde la 13.5.2-a.
- **Autoevaluación declarada** para la 16.2.2, la 16.2.3 y este cierre. La revisión independiente cubrió la 16.2.1.
