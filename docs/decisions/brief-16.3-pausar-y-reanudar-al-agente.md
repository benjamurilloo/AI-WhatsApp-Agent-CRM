---
schema: task-brief.v1
task_id: "16.3"
task_type: integration
generated_at: 2026-10-07
---

# Brief 16.3 — Pausar y reanudar al agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `integration`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el modelo, el servicio, la pantalla y la ruta de lectura, contra PostgreSQL real;
  - `isolated-runtime` para el despliegue;
  - `producer-consumer` para el agente como consumidor real.
- **Nivel de validación alcanzable**: validado localmente y en CI, desplegado en producción y validado en integración con el agente. No es «preparado para producción».
- **Orden**: tercera subfase de la Fase 16 ([Roadmap](../planning/Roadmap.md) §Fase 16), después de la 16.2.
- **Estado**: aprobado el 2026-10-07 con las recomendaciones de D-1 a D-11; precisión de D-4 aprobada el mismo día; **cerrado el 2026-10-07** (§Cierre).

## Objetivo

Un admin del CRM pausa al agente en una conversación, para atenderla él, y lo reanuda cuando termina. El agente lee la marca en cada turno y, mientras la conversación está pausada, no contesta.

Respeta el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md): el CRM no llama al agente, el agente la lee. El candidato del Roadmap lo pide así:

> una marca que pone un usuario del CRM y que el agente lee en el contexto que ya pide en cada turno

## Lo que se verificó antes de escribir este brief

- **Estados de una conversación** ([DataModel](../architecture/DataModel.md) §`conversations`): `open`, `pending` y `closed`.
  - `pending` significa «espera a una persona» desde la 12.2. Lo pone el agente con `conversation.escalated`, o un admin desde la pantalla 9.
  - No hay ninguna marca de pausa.
- **Qué recibe el agente en cada turno**:
  - el estado de la conversación, en la respuesta de `conversation.resolved` ([ingestion-v2](../contracts/ingestion-v2.md));
  - el historial, de `GET /api/read/v1/messages` con alcance `context` ([read-v1](../contracts/read-v1.md)).
  - **Ninguna de las dos respuestas admite un campo nuevo sin cambiar de versión**: v3 para la ingestión, v2 para la lectura (§Versionado de cada contrato). Una ruta nueva sí es compatible dentro de read-v1.
- **Quién escribe**:
  - los roles son `admin` y `viewer`, y solo el admin cambia el estado de una conversación (pantalla 9, `changeConversationStatus`);
  - la pantalla 9 no muestra el historial de auditoría: el `status_change` queda en `audit_logs` sin pantalla.
- **La exportación de los datos de un cliente** lee `conversations` con `select *`: una columna nueva entra sola, sin tocar el script.
- **El tráfico de la ventana 16.2.3**: el agente siguió contestando turnos en una conversación ya derivada a una persona. Con el diseño actual, `pending` no lo frena. Se observó desde el CRM y el agente no lo confirmó.

### Hallazgo H-1 (contraste con las reglas vigentes)

- **Contrastado**: con el ADR 0014, [IntegrationBoundaries](../architecture/IntegrationBoundaries.md), §Versionado de los dos contratos y DataModel.
- **Lo único que choca** es leer la marca «en el contexto que ya pide»: no entra en ninguna respuesta existente sin cambiar de versión. Lo resuelve D-3, con una ruta nueva compatible.
- **Costo de D-3**: el agente hace una lectura más por turno. Entra holgado en el presupuesto de la credencial `context`, de 120 pedidos por minuto: la 12.5 midió de 1 a 3 lecturas por turno.

## Alcance incluido

1. **La marca en la conversación**, con su migración: una columna `agent_paused_at`, nula cuando el agente está activo (D-1, D-2).
2. **Pausar y reanudar desde la pantalla 9**, solo el admin, en una conversación `open` o `pending` (D-4, D-5).
3. **Ver la marca**: la pantalla 9 muestra desde cuándo está pausada, y la lista de conversaciones (pantalla 8) la marca en la fila (D-4).
4. **Auditoría**: cada cambio queda en `audit_logs` como `agent_pause_change`, con el usuario como autor (D-6).
5. **`GET /api/read/v1/conversation-state`**, con alcance `context`: la marca de una conversación por su referencia (D-3).
6. **El contrato**, los documentos y los tests de la lista.
7. **Pedido al agente** (D-9), escrito fuera del repositorio.
8. **Etapas** (D-8): 16.3.1 local, 16.3.2 producción y 16.3.3 integración con el agente.

## Alcance excluido

- **Responder desde el CRM**: la persona contesta desde la app de WhatsApp, por fuera del CRM, como hoy. Es la 16.5, que solo es un ADR. Esas respuestas no quedan en el CRM: es el riesgo que ya está escrito en el Roadmap.
- **Que el agente se pause solo**, o que pause él al derivar: el agente sigue usando `conversation.escalated`, que no cambia.
- **Rechazar mensajes del agente** en una conversación pausada: ver D-7.
- **Pausar a nivel cliente u organización**: ver D-2.
- **Cambios en la ingestión**, v1 o v2, y en las respuestas existentes de la lectura.
- **Una pantalla de auditoría** de la conversación.
- **Notificaciones** a quien pausó.

## Archivos autorizados

- `drizzle/0028_*.sql` y `drizzle/meta/*`: la columna y el valor nuevo de `audit_action`;
- `src/modules/conversations/schema.ts`, `service.ts`, `repository.ts`, `index.ts` y `service.test.ts`;
- `src/modules/audit/schema.ts`: el valor nuevo de `audit_action`;
- `src/app/(autenticado)/conversaciones/actions.ts`, `messages.ts`, `conversation-table.tsx` y `page.tsx`;
- `src/app/(autenticado)/conversaciones/[conversationId]/page.tsx`, y un archivo nuevo, `agent-pause-form.tsx`;
- `src/app/api/read/v1/contract.ts` y `contract.test.ts`;
- `src/app/api/read/v1/conversation-state/handler.ts` y `route.ts`, los dos nuevos;
- tests:
  - `tests/integration/conversation-agent-pause.test.ts`, nuevo;
  - `tests/integration/read-api-conversation-state.test.ts`, nuevo;
  - `tests/integration/conversations-schema.test.ts`;
  - `tests/integration/conversations.test.ts`, solo para sumar `agentPausedAt: null` a dos expectativas que comparan la conversación entera (autorizado por el usuario el 2026-10-07, durante la 16.3.1);
  - `tests/guards/exposed-surface.test.ts`;
  - `tests/e2e/conversations.spec.ts` y `tests/e2e/read-api.spec.ts`;
  - `tests/fixtures/read/v1/conversation-state*.json`, nuevos;
- documentos:
  - `docs/contracts/read-v1.md`;
  - `docs/architecture/DataModel.md`, `SecurityModel.md`, `IntegrationBoundaries.md` y `TraceabilityMatrix.md`;
  - `docs/product/FunctionalRequirements.md`: FR-CONV-06;
  - `docs/product/Screens.md`: las pantallas 8 y 9;
  - este brief;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md`, `docs/decisions/README.md` y `docs/planning/Roadmap.md`.

## Fuentes de verdad

- Las migraciones y el código.
- DataModel, read-v1 e ingestion-v2.
- El ADR 0014 y el Roadmap.

## Decisiones pendientes

### D-1 — Qué es la pausa

- **(a) Recomendada: una marca propia en la conversación**, independiente del estado.
  - `pending` sigue significando «espera a una persona» y lo sigue poniendo el agente al derivar.
  - La pausa significa «una persona la está atendiendo: el agente no contesta».
  - Una conversación puede estar `pending` y pausada, o `open` y pausada.
- (b) Usar `pending` como pausa. No hace falta migración ni ruta nueva: el agente ya recibe el estado en cada turno. Pero tiene tres costos:
  - toda derivación callaría al agente, y un cliente que pidió una persona y nadie atiende quedaría sin respuesta;
  - reanudar exigiría volver a `open`, y se perdería que la conversación se había derivado;
  - cambia el comportamiento del agente con las derivaciones, que hoy funcionan.

### D-2 — Alcance de la pausa

- **(a) Recomendada: la conversación.**
  - Es lo que pide el Roadmap.
  - Una conversación nueva del mismo cliente, que nace cuando la anterior quedó sin mensajes más de 24 horas, empieza con el agente activo. Si la persona se olvida de reanudar, el cliente no queda sin respuesta para siempre.
  - La pantalla 9 lo dice al pausar.
- (b) El cliente. La pausa sigue en sus conversaciones siguientes hasta que alguien la quite. Es más segura si la persona quiere atenderlo siempre, pero un olvido calla al agente para ese cliente sin fecha.

### D-3 — Cómo lo lee el agente

- **(a) Recomendada: una ruta nueva, `GET /api/read/v1/conversation-state?conversation_ref=…`, con alcance `context`.**
  - Usa la misma credencial y el mismo parámetro que `messages`, y es compatible dentro de read-v1.
  - Responde `{ "contract_version": "1", "agent_paused": true, "agent_paused_at": "…" }`, con `agent_paused_at` nulo si no está pausada.
  - Una conversación ajena o inexistente da `404`, sin distinguir, como `messages`.
  - El agente la lee después de `conversation.resolved` y antes de generar la respuesta.
- (b) Sumar la marca a la respuesta de `conversation.resolved`. Exige ingestión v3.
- (c) Sumarla a `messages`. Exige read-v2.

### D-4 — Dónde se pausa y dónde se ve

- **(a) Recomendada: un botón «Pausar al agente» o «Reanudar al agente» en la pantalla 9, solo para el admin.**
  - Junto al botón, el texto «Agente pausado desde las HH:MM».
  - En la lista de conversaciones (pantalla 8), una marca «Agente pausado» en la fila, para cualquier rol.
- (b) Solo la pantalla 9, sin marca en la lista.

### D-5 — En qué estados

- **(a) Recomendada: pausar solo en `open` o `pending`.**
  - Una `closed` no recibe mensajes nuevos: el agente abre otra conversación.
  - Reanudar se puede siempre.
  - Cerrar una conversación pausada no quita la marca, porque ya no importa.
- (b) Pausar en cualquier estado.

### D-6 — Auditoría

- **(a) Recomendada: un valor nuevo de `audit_action`, `agent_pause_change`**, sobre la conversación, con el usuario como autor.
  - El diff es `{ before: { agentPaused: false }, after: { agentPaused: true } }`, como `tag_change`.
  - Pausar una ya pausada, o reanudar una activa, no escribe ni audita.
- (b) Usar `update` con ese mismo diff. No necesita migración del enumerado, pero mezcla la pausa con cualquier otra edición de la conversación.

### D-7 — Lo que el CRM hace con un mensaje del agente en una conversación pausada

- **(a) Recomendada: lo registra igual.**
  - El mensaje ya le llegó al cliente por WhatsApp: rechazarlo dejaría al CRM sin el registro de algo que pasó.
  - Puede ocurrir en una carrera: el admin pausa entre la lectura del agente y su envío. Queda declarado en el contrato.
  - El agente es quien respeta la marca.
- (b) Rechazarlo con un `422`. Perdería el registro y cambiaría las reglas de la ingestión v2, lo que exige v3.

### D-8 — Etapas

- **16.3.1 — Local**: migración, servicio, pantallas, ruta, tests y documentos. Commit y push con autorización.
- **16.3.2 — Producción**: despliegue **con la migración `0028`**, con autorización, recuentos antes y después, y la ruta nueva responde `401` sin token.
- **16.3.3 — Integración con el agente**: una ventana en la organización de demostración de producción, como la 16.2.3. Un admin pausa, el agente no contesta, el admin reanuda y el agente vuelve a contestar. Se concilia con `audit_logs`, `messages` y el log de la ruta.

### D-9 — Coordinación con el agente

- **(a) Recomendada: un pedido escrito en el Escritorio del usuario**, `Pedido-16.3-CRM-al-Agente.md`, después de la 16.3.2 y con el contrato publicado, como en la 16.2.
- (b) Antes de implementar, para que el agente opine sobre la forma de la ruta.

### D-10 — Revisión independiente

- **(a) Recomendada: sí, antes del commit de la 16.3.1.** La subfase cambia un contrato con el agente y trae una migración.

### D-11 — Cuándo cierra

- **(a) Recomendada: no cierra sin la 16.3.3**, como la 16.2: el objetivo es que el agente respete la pausa.

## Invariantes

1. **La pausa no cambia `status`, y la derivación no cambia la pausa.**
2. **Solo el admin pausa y reanuda**, solo en su organización, y cada cambio con escritura queda auditado.
3. **La ruta nueva** solo devuelve la marca de una conversación de la organización de la credencial:
   - sin datos del cliente, su teléfono ni mensajes;
   - con el mismo `404` para una conversación ajena y una inexistente.
4. **Ninguna respuesta existente cambia**: ni las de la ingestión v1 y v2, ni las de la lectura.
5. **El CRM no llama al agente.**

## Criterios de aceptación

- **AC-1** (D-1, D-5): un admin pausa una conversación `open` o `pending` y la reanuda.
  - El estado no cambia.
  - Pausar una `closed` se rechaza.
  - Repetir la misma acción no escribe.
- **AC-2** (D-6): cada cambio con escritura deja un `agent_pause_change` con el usuario como autor y su diff, y la repetición no audita.
- **AC-3** (invariante 2): un `viewer` no puede pausar, ni desde la pantalla ni llamando a la acción. Ninguna organización ve ni cambia la marca de otra.
- **AC-4** (invariante 1): `conversation.escalated` sobre una conversación pausada la pone en `pending` y la deja pausada. Cambiar el estado desde la pantalla 9 tampoco toca la marca.
- **AC-5** (D-4): la pantalla 9 muestra el botón y «Agente pausado desde…», y la lista de conversaciones marca la fila. Lo cubre un end-to-end con teclado y axe, también a 375 px.
- **AC-6** (D-3, invariante 3): `GET /api/read/v1/conversation-state` cumple lo siguiente:
  - devuelve la marca, validada contra su esquema estricto;
  - exige alcance `context`: `401` sin token, `403` con `read` o `ingest`;
  - da el mismo `404` para una conversación ajena y una inexistente;
  - en el log, no registra la referencia;
  - tiene fixtures de forma asumida.
- **AC-7** (invariante 4): todos los vectores y los tests existentes de la ingestión y de la lectura siguen iguales.
- **AC-8**:
  - la ruta nueva está en la guarda de superficie expuesta y en SecurityModel;
  - FR-CONV-06 aparece en los tests;
  - los documentos de la lista no se contradicen.
- **AC-9**: la batería completa da verde: formato, lint, tipos, unitarios, guardas, integración, build y end-to-end. Además, cada una de estas mutaciones da rojo:
  - pausar sin comprobar el rol;
  - la ruta sin filtrar por organización;
  - la derivación borrando la marca.
- **AC-10** (D-10): hay revisión independiente antes del commit, con cada hallazgo verificado contra el código.
- **AC-11** (16.3.2), con autorización:
  - el despliegue aplica la `0028` y quedan 29 migraciones;
  - los recuentos son iguales antes y después;
  - la ruta nueva responde `401` sin token.
- **AC-12** (16.3.3), en la ventana con el agente:
  - con la conversación pausada, un turno no deja ninguna salida del agente;
  - después de reanudar, el turno siguiente sí la deja;
  - se concilia con `audit_logs`, `messages` y el log de la ruta;
  - el usuario aprueba el cierre.

## Pruebas y evidencia requerida

- `deterministic`: servicio, ruta e integración contra PostgreSQL real, con las mutaciones de AC-9 en rojo.
- `isolated-runtime`: el despliegue de la 16.3.2, con comandos y salidas en este brief, sin secretos ni IP.
- `producer-consumer`: la conciliación de la 16.3.3. Los fixtures de forma asumida se declaran como tales.

## Condiciones de detención

Detenerse y avisar al usuario si pasa algo de esto:

- hace falta tocar un archivo fuera de la lista, o una segunda migración;
- cambia un vector o una respuesta existente de la ingestión o de la lectura;
- pausar exige tocar `status` o la derivación;
- el agente pide algo que exige ingestión v3 o read-v2, o que el CRM lo llame;
- aparece un dato personal en la respuesta de la ruta o en el log.

También hay que pedir autorización explícita en su turno **antes de** cada uno de estos pasos:

- el commit de la 16.3.1 y el push;
- el despliegue con la migración;
- el pedido al agente;
- la ventana de la 16.3.3;
- los cambios en Notion;
- el cierre.

## Resultados 16.3.1

**Nivel alcanzado**: validado localmente (`deterministic`), sin commit hasta la autorización del usuario. No desplegado ni validado en integración.

- **Implementado**:
  - la migración `drizzle/0028_agent_pause.sql`, con el valor `agent_pause_change` y la columna nula `agent_paused_at`. Sin grant nuevo: `crm_app` ya tenía `UPDATE` de tabla (0012);
  - `changeAgentPause` y `getAgentPauseForService` en `conversations`;
  - `changeAgentPauseAction` y la sección «Agente» de la pantalla 9, y la marca «Agente pausado» en `ConversationTable`;
  - `GET /api/read/v1/conversation-state`, con su esquema estricto y tres fixtures de forma asumida.
- **Archivo sumado a la lista** con autorización del usuario: `tests/integration/conversations.test.ts`. Dos expectativas comparaban la conversación entera y ahora llevan `agentPausedAt: null`.
- **Batería** (2026-10-07):
  - formato, lint, tipos y build pasan;
  - unitarios y guardas: 1067 tests;
  - integración: 772 tests, incluidos los 9 de `conversation-agent-pause.test.ts` y los 8 de `read-api-conversation-state.test.ts`;
  - end-to-end: 130, con los casos 14 y 15 de conversaciones.
  - **Cómo se corrieron las guardas**: lo hice con `git add -N` de los archivos nuevos y `git reset` después, porque la guarda de superficie lista con `git ls-files`. Sin eso da por faltante la ruta nueva (revisión independiente, R-2).
- **Mutaciones de AC-9**, cada una en rojo y revertida:
  - pausar sin comprobar el rol: 2 tests en rojo;
  - la ruta sin el filtro por organización: 1 test;
  - la derivación borrando la marca: 3 tests.
- **Precisión de D-4**, aprobada por el usuario el 2026-10-07:
  - el texto dice «Pausado desde el DD/MM HH:MM», con la fecha, porque una pausa puede venir de otro día;
  - está en la tarjeta «Conversación», junto a la marca, para que también lo vea el viewer, y no junto al botón.

### Revisión independiente (D-10, AC-10)

La hizo un agente que no participó del trabajo, con acceso de solo lectura. Fijó la escala antes de mirar. Cada hallazgo se verificó contra el código.

- **R-1**, bloqueante por AC-8: la tabla de SecurityModel seguía en 29 Server Actions bajo `(autenticado)` y 8 Route Handlers. **Confirmado y corregido**: ahora dice 30 y 9, y suma 63.
- **R-2**, menor: con los archivos nuevos fuera del índice, la guarda de superficie no puede dar verde. **Confirmado**: el verde reportado se obtuvo con `git add -N`. Queda anotado arriba.
- **R-3**, menor: el texto y la ubicación de la marca se apartan de D-4. **Confirmado**: es la precisión de arriba, aprobada por el usuario el 2026-10-07.
- **R-4**, nota:
  1. Pausar una cerrada que ya estaba pausada devuelve `changed: false`, no un rechazo. **Confirmado**: no escribe ni audita. Ahora lo fija un test.
  2. La pantalla 7 reutiliza `ConversationTable` y también muestra la marca. **Confirmado**: no expone datos. Screens §7 no está en la lista de esta subfase; se registra en el cierre.
  3. read-v1 sigue diciendo que `context` es «para el historial», pero la sección de la ruta nueva lo aclara. Se ajusta en el cierre.

## Resultados 16.3.2 (AC-11)

Desplegado en producción el 2026-10-07, con autorización del usuario en el turno, siguiendo «Desplegar un cambio» de `deploy/production/README.md`.

1. **CI del SHA exacto**: `259d23f7ccb9e162915cbcafe10f208d240f19bd`, `"conclusion":"success"`.
2. **Lo que estaba desplegado**, anotado en `/var/lib/crm-production/despliegues`: `95493648f82b22a62fa69f5ee96abe956a881218`. Es el SHA para volver atrás.
3. **Código, dependencias, migración, build y reinicio**: la última línea dio `desplegado: 259d23f7ccb9e162915cbcafe10f208d240f19bd`, y el servicio quedó `active`.
4. **Recuentos de `crm_production`**, en una transacción de solo lectura, antes y después: las 19 tablas no cambian. Solo cambia `migraciones`, de 28 a 29.
5. **La migración `0028`**, también en solo lectura:
   - `conversations.agent_paused_at` existe, `timestamp with time zone`, nullable;
   - hay 0 conversaciones pausadas, como corresponde a una columna nueva;
   - `audit_action` tiene el valor `agent_pause_change`.
6. **La ruta nueva**: `GET /api/read/v1/conversation-state` responde `401` sin token, con parámetros y sin ellos. `/login` responde `200`.

Nivel: `isolated-runtime` para el despliegue. Pausar desde la pantalla 9 en producción no se ejecutó: no lo pide AC-11, y la integración con el agente es la 16.3.3.

## Resultados 16.3.3 (AC-12)

Ventana del 2026-10-07 en la organización de demostración de producción, con el teléfono del usuario como único cliente y el guion del agente. El agente lee `conversation-state` en producción desde alrededor de las 21:00 UTC. Antes, a las 20:55:26 UTC, hizo una lectura de prueba (`200`, `agent_paused: false`), que está en el log con su correlación. La conciliación es del lado del CRM: log estructurado, `messages`, `ingestion_events` y `audit_logs`, todo en solo lectura. Horas en UTC.

| Paso | Turno | Qué pasó |
|---|---|---|
| 1, activa | `7987` | `client.resolved` y `conversation.resolved` a las 21:07:47 y 21:07:48; `conversation-state` `OK`; `messages` `OK`; respuesta del agente registrada a las 21:08:07 |
| 2, pausa | — | `conversaciones.pausar_agente` `OK` a las 21:08:20; `agent_pause_change` con `agentPaused: true`, autor el usuario, sobre la misma conversación del paso 1 |
| 3, pausada | `8022` | `client.resolved` y `conversation.resolved` a las 21:09:58 y 21:09:59, con el entrante registrado; `conversation-state` `OK`; **nada más**: ni `messages`, ni salida del agente, ni otro evento |
| 4, reanudación | — | `conversaciones.pausar_agente` `OK` a las 21:11:10; `agent_pause_change` con `agentPaused: false` |
| 5, activa | `8038` | `client.resolved` y `conversation.resolved` a las 21:14:00 y 21:14:01; `conversation-state` `OK`; `messages` `OK`; respuesta del agente registrada a las 21:14:12 |

- **La conversación** estaba `pending` desde antes de la ventana, y la pausa funcionó igual: la marca no depende del estado (D-1).
- **Recuentos**: `messages` pasó de 53 a 58 (3 entrantes y 2 respuestas del agente) e `ingestion_events`, de 90 a 98, todos `processed`. Las otras dos conversaciones de la organización no cambiaron.
- **El usuario confirmó** desde su teléfono que el agente no contestó en el paso 3.
- **La conciliación del agente coincide en los tres turnos.** Su registro guarda el valor leído: `agent_paused: true` en `8022`, con `agent_paused_at` 21:08:20.883, y `false` en `7987` y `8038`. La auditoría de la pausa tiene `created_at` 21:08:20.884, de la misma transacción. Sin lecturas fallidas, sin mensajes de emergencia y sin carrera.

Nivel: `producer-consumer` en producción, con el agente como consumidor real de la ruta, sobre una conversación. La ruta queda **validada en integración**. Sus fixtures siguen con forma asumida hasta que se agregue una captura.

**Límites del lado del agente**, informados por el agente en su respuesta al pedido y aceptados para esta subfase:
- **La pausa es de mejor esfuerzo.** Si la lectura falla, por timeout, `5xx`, `429` o `404`, el agente contesta igual.
- **El mensaje de emergencia** del agente sale antes de la lectura y no respeta la pausa.
- **La carrera de D-7**: entre la lectura y el envío pasan de 3 a 12 segundos.
- **El límite de lectura.** Con dos lecturas por turno, 120 pedidos por minuto por credencial dan unos 60 turnos por minuto.

## Cierre

**Cerrada el 2026-10-07**, con la aprobación del usuario.

| Criterio | Estado |
|---|---|
| AC-1 a AC-9 | cumplidos en la 16.3.1 (§Resultados 16.3.1) |
| AC-10 | revisión independiente: R-1 a R-4, verificados; R-1 corregido, R-3 resuelto con la precisión de D-4 |
| AC-11 | cumplido en la 16.3.2 |
| AC-12 | cumplido en la ventana 16.3.3, con la conciliación del agente coincidente |

- **Nivel**: validado localmente y en CI; desplegado en producción con la migración `0028` (`isolated-runtime`); **validado en integración** (`producer-consumer`) con el agente como consumidor real de `conversation-state`, en una conversación de la organización de demostración. No es «preparado para producción».
- **Precisión aprobada por el usuario el 2026-10-07**: D-4, «Pausado desde el DD/MM HH:MM» en la tarjeta «Conversación», visible también para el viewer.
- **Decisión del usuario durante la subfase**: `tests/integration/conversations.test.ts`, fuera de la lista original, con dos expectativas que suman `agentPausedAt: null`.
- **Pendientes de R-4, resueltos en el cierre**: la marca en la pantalla 7 queda en Screens §7, y `read-v1.md` §Transporte dice que `context` también lee la marca.
- **Límites del lado del agente** (§Resultados 16.3.3): la pausa es de mejor esfuerzo, el mensaje de emergencia no la respeta, la carrera de D-7, y unos 60 turnos por minuto por credencial con dos lecturas por turno. Quedan también en `read-v1.md`.
- **No certifica**:
  - una lectura fallida con la conversación pausada, que no se provocó;
  - una persona contestando desde la app de WhatsApp durante la pausa: el número de prueba de Meta no lo permite, y esas respuestas no llegan al CRM (16.5);
  - una captura de la respuesta como fixture: los tres siguen con forma asumida.
- **Autoevaluación declarada** para la 16.3.2, la 16.3.3 y este cierre. La revisión independiente cubrió la 16.3.1.
