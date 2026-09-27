---
schema: task-brief.v1
task_id: "12.3"
task_type: integration
generated_at: 2026-09-25
---

# Brief: 12.3 — Contrato de ingestión v2

**Estado: aprobado el 2026-09-25 por el usuario, con las recomendaciones de D-1 a D-11**: v2 como ruta nueva con v1 congelada (D-1), el rótulo en la pantalla 9 (D-5) y tres etapas, sin cerrar la 12.3 antes de validar con el agente como emisor real (D-9, opción A). La aprobación no autoriza commits, pushes, migraciones contra staging, despliegues ni ningún cambio en el agente o en su instancia: cada uno se pide en su turno.

## Objetivo

Publicar el **contrato de ingestión v2**. Guarda el **tipo original** de cada mensaje y **quién envió** una salida (B-6), y le dice al emisor qué hacer ante cada respuesta, incluidos `CONFLICT`, el timeout y la caída del CRM. Después, **validarlo con requests reales del agente** en staging, detrás del modo de prueba y con datos sintéticos (O-35), y medir con ellos la métrica 12 (O-34) y la cantidad de pedidos por turno (pregunta 5).

**Resultado verificable**:
- un audio transcripto llega como `kind: "audio"` y se ve así en la pantalla 9;
- una respuesta del agente queda con `sent_by: "agent"`;
- un request **emitido por el agente**, no por un script del CRM, pasa la autenticación y el validador de staging, y su captura queda versionada como fixture con forma **capturada**, ya no asumida.

## Situación en la fase

- **Necesario ahora (12.3)**:
  - B-6 completa: tipo y autor, más el manejo de errores del lado del emisor;
  - O-35 y O-34, asignadas a esta subfase por el mapa de la [evaluación 10.1](evaluacion-10.1-mvp.md) (brief-10, §Resultados de la 10.3);
  - la medición de la pregunta 5, que [Risks](../planning/Risks.md) le asignó a la 12.3.
- **Heredado y tomado acá**:
  - **E-1**: la primera corrida real del README de staging corregido, en el despliegue de la 12.3.2;
  - **el plan de la consulta de la conversación vigente**, sin medir desde la 12.2 (R-7);
  - **R-6 de la 12.1**: el teléfono como nombre, que se revisa con capturas reales;
  - **la correlación en los `429`**, que Risks registró como hueco de la lectura.
- **Heredado y que propongo no tomar**: R-8 de la 12.2 (D-10).
- **Lo usan las subfases siguientes**: la 12.4 (historial) devuelve el tipo y el autor, y la 12.5 recorre el turno completo con v2.
- **Antes de producción, no acá**: disponibilidad (13.3), retención (13.4) y el plan genérico de las sentencias preparadas (13.2).

## Contexto de negocio

Leído del documento de brechas del usuario (repositorio del agente, commit `b75e484`, §B-6 y §5), **solo como contexto**, nunca como dependencia técnica:
- **Hoy** un audio se guarda solo como su transcripción, sin decir que fue un audio.
- **Hoy** ninguna salida guarda quién la envió: el agente o una persona.
- **Falta** definir qué hace el agente cuando la ingestión responde `CONFLICT` o falla.
- **Del lado del agente**, fuera de este repositorio: reemplazar sus nodos de Airtable por llamadas al CRM y registrar las respuestas enviadas. **Cada uno necesita su propio brief y su autorización**; el agente sigue en `9f30bc1`, pausado.

**En el CRM**:
- `messages` no tiene tipo ni autor: `direction`, `sent_at`, `body_text` y `external_ref` ([DataModel](../architecture/DataModel.md) §`messages`). Es de solo inserción (ADR 0013).
- El esquema de v1 es estricto, y [ingestion-v1](../contracts/ingestion-v1.md) §Versionado exige v2 para agregar campos o cambiar respuestas. **Ningún emisor usa v1**.
- La ingestión **no tiene correlación**; la lectura sí (`X-Correlation-Id`, [read-v1](../contracts/read-v1.md)). La lectura la valida después del límite, así que un `429` no la tiene (Risks).
- **Staging corre `f241f62`**, con las migraciones hasta `0020` ([HANDOFF](../../HANDOFF.md)). Le faltan `0021` y `0022`, de la 11.x y la 12.1, y la 12.2 entera.

## Hallazgos antes de diseñar (paso 5 de la planificación)

Reabrí con `grep` Overview, IntegrationBoundaries, el contrato v1 y las guardas.

**C-1 — «Validar con el emisor real» exige trabajo fuera de este repositorio.**
- El Roadmap le asigna a la 12.3 validar con **requests reales del emisor** (O-35). Pero el agente no emite nada hacia el CRM, y cambiarlo es trabajo de **su** repositorio y de **su** instancia, con su brief (brechas §5).
- Desde el CRM no se puede ni se debe hacer: IntegrationBoundaries prohíbe que el CRM dependa del agente o lo toque.
- Entonces **el cierre de la 12.3 depende de algo que este repositorio no controla**. No lo resuelvo solo: es **D-9**.

**C-2 — Las capturas son datos del agente, no código.**
- Para derivar fixtures de capturas reales (IntegrationBoundaries, §Conocimiento transversal) hace falta leer requests que emitió el agente.
- El log del CRM no guarda payloads, por diseño (DataModel, §`ingestion_events`, «Sanitización»), y no propongo cambiarlo.
- Queda leerlas del lado del emisor: por ejemplo, las ejecuciones de n8n. Son la **salida del agente hacia nuestro contrato**, con datos sintéticos, y no su código ni su esquema, así que no chocan con la prohibición de referenciar su repositorio.
- **Leer su instancia es un efecto externo que autoriza el usuario**, en el turno en que se haga (D-9).

**C-3 — La superficie expuesta crece.** `tests/guards/exposed-surface.test.ts` declara los Route Handlers uno por uno. La ruta v2 se agrega ahí, con su exigencia de credencial. Está en la lista de archivos.

**C-4 — Correlación y límite.**
- Si v2 valida la correlación **antes** del límite, un `429` la lleva.
- **Costo**: una correlación inválida responde `400` sin consumir el límite. No abre una puerta: ese `400` no lee el cuerpo ni toca la base, igual que los rechazos de credencial que ya van antes del límite.
- **Recomiendo** validarla antes y registrarla en el `429` (D-6). La lectura v1 no cambia.

## Decisiones previas (las decide el usuario al aprobar)

### D-1 — v2 como ruta nueva, y qué pasa con v1

- **(A) `POST /api/ingestion/v2/events`, con los cuatro tipos de evento y los campos nuevos. v1 queda congelada: sigue funcionando y no recibe nada nuevo.** **Recomendada.**
  - **Comparten** credencial `ingest`, modo de prueba, allowlist, límite de tasa (un solo presupuesto por credencial), ledger y proyección.
  - **Identidad**: la de siempre, `(organization_id, source, event_id)`. El mismo `event_id` enviado por v1 y por v2 da `CONFLICT`, porque `contract_version` entra en el hash. Es lo correcto: son dos contenidos distintos.
  - **Quién retira v1**: se decide cuando el agente use v2 en producción (Fase 13). §Versionado lo permite en cuanto ningún emisor use v1, y hoy no la usa ninguno. Retirarla ahora cambiaría tests y end-to-end sin ganar nada.
- **(B) Retirar v1 ya**, porque no tiene emisores. Descartada por ahora: el costo es real y el beneficio llega recién cuando haya que mantener las dos.
- **(C) Campos opcionales en v1.** Descartada: §Versionado lo prohíbe, y un emisor v1 que mande un campo nuevo recibiría hoy un `400`.

### D-2 — Tipo original del mensaje (`kind`)

- **Recomendación**: `message.kind` obligatorio en v2 para todo mensaje, con el enum `text | audio | image | video | document | other`.
  - **`body_text` sigue siendo el texto útil**: la transcripción de un audio o el epígrafe de una imagen. Puede ser `null`, como en v1.
  - **Sin adjuntos**: el CRM no guarda el archivo ni su URL. Siguen fuera de alcance, igual que en v1.
  - **`other`** cubre lo que el CRM no distingue (ubicación, contacto, sticker). El enum se amplía con su brief si el negocio lo necesita.
  - **El enum sale del modelo del CRM**, de lo que el operador necesita saber («esto era un audio»), y no de la lista de tipos de ningún emisor.
- **Columna**: `messages.kind`, un enum nuevo `message_kind`, **nulable**. `null` significa «sin dato»: son los mensajes de v1 y de los seeds. **No se rellenan con `text`**, porque sería afirmar algo que nadie registró.

### D-3 — Autor de una salida (`sent_by`)

- **Recomendación**: `message.sent_by` en v2, con los valores `agent | person`:
  - **obligatorio** si `direction = "outbound"`;
  - **prohibido** si es `inbound`, porque el autor de una entrada siempre es el cliente. Mandarlo da `400` con el campo `message`, como `direction` en `conversation.resolved`.
- **Columna**: `messages.sent_by`, un enum nuevo `message_sender`, nulable, con `CHECK (direction = 'outbound' OR sent_by IS NULL)`. En las salidas de v1 queda `null`, o sea «sin dato».
- **`person` no identifica a qué persona.** El CRM no sabe qué usuario respondió desde el teléfono del negocio. Si hace falta, será una columna con clave foránea a `users` y su brief.

### D-4 — Migración

- **Una sola migración**, `0023`:
  - crea los dos enums;
  - agrega las dos columnas, nulables y sin default;
  - agrega el `CHECK`.
- **No reescribe filas**: el trigger de solo inserción no se toca, y `ALTER TABLE … ADD COLUMN` sin default no toca las existentes.
- **Contra la base local y la de test**, en la 12.3.1. **Contra staging**, solo en el despliegue de la 12.3.2, con backup previo y autorización del usuario.

### D-5 — Cómo se muestran el tipo y el autor en la pantalla 9

- **Recomendación: un rótulo mínimo en el timeline.** Sin él, el operador lee una transcripción como si el cliente la hubiera escrito, y esa lectura equivocada es la que B-6 quiere evitar.
  - **Tipo**: «Audio (transcripción)», «Imagen», «Video», «Documento» u «Otro», junto al mensaje. `text` y `null` no llevan rótulo.
  - **Autor**, solo en las salidas: «Agente» o «Persona». `null` no lleva rótulo.
  - Sin filtros, sin columnas en la lista y sin métricas nuevas.
- **Alternativa**: sin UI en la 12.3. El dato llega al agente en la 12.4, pero el operador no lo ve.

### D-6 — Correlación en v2

- **Recomendación**: `X-Correlation-Id` opcional, con las reglas de [read-v1](../contracts/read-v1.md), registrado como `correlation_id` y devuelto en la respuesta.
  - **Se valida antes del límite de tasa** (C-4), así que el `429` la registra.
  - Una inválida responde `400 VALIDATION_ERROR` con el campo `correlation_id`.
- El orden de v2 queda así: modo de prueba, credencial, allowlist, correlación, límite, cuerpo y evento.

### D-7 — `CONFLICT` distinguible y la guía del emisor

- **`409` con `reason`** en v2, para que el emisor sepa si perdió algo:

  | `reason` | Qué pasó | ¿Se perdió el mensaje? | Qué hace el emisor |
  |---|---|---|---|
  | `event_payload_mismatch` | mismo `event_id`, otro contenido | **puede**: el CRM guardó el primero | **alerta**: es un defecto del emisor, que armó dos contenidos con el mismo id |
  | `message_already_recorded` | el mensaje ya está en la conversación, llegado con otro `event_id` | **no**: ya está guardado | lo trata como guardado |
  | `conversation_ref_taken` | la referencia propuesta ya es de otra conversación | **sí, si no reintenta** | reintenta con una referencia propuesta **y** un `event_id` nuevos |

  En el ledger quedan igual que en v1 (`failed`, `error_code = 'CONFLICT'`), así que la métrica 12 no cambia de definición.
- **Una sección nueva del contrato: «Guía para el emisor»**, con una fila por respuesta que dice si se reintenta, con qué y cuándo. Sus reglas:
  - **el `event_id` es estable por hecho**: se deriva de la identidad del mensaje en el canal y del tipo de evento, nunca del teléfono ni del contenido;
  - **ante un timeout, un `500` o la caída del CRM**, se reenvía el **mismo** evento, con el mismo `event_id` y el mismo contenido. Es seguro: si el CRM ya había confirmado, responde `duplicate` con los mismos datos; si no, lo procesa.
  - **ante un `429`**, se espera `Retry-After`.
  - **ante un `400`, `401`, `403` o `422`**, no se reintenta el mismo evento.
- **Lo que el CRM garantiza**, con un test por afirmación: con un reenvío idéntico no se pierde ni se duplica ningún mensaje. **Lo que no garantiza**: un mensaje que el emisor deja de reenviar. Cuántas veces reintenta y qué hace mientras tanto es decisión del agente, fuera de este repositorio.

### D-8 — R-6 de la 12.1: el teléfono como nombre

- **Recomendación**: en v2, `client.display_name` se rechaza con `400` si sus dígitos son los del teléfono del evento. Se comparan quitando todo lo que no es dígito, así que se detecta también «+54 9 11 5555-0001».
  - **Se rechaza, no se reemplaza por «Sin nombre»**: el emisor se entera y corrige, en vez de perder el dato en silencio. Es el criterio de la 11.3 con la correlación.
  - Un nombre que **contiene** otros dígitos, como «Local 12», se acepta.
- **Se confirma con las capturas de la 12.3.3**: si el agente manda el teléfono como nombre, la regla ya está; si no lo manda, queda igual como defensa.
- v1 no cambia (D-1).

### D-9 — Qué pasa si el emisor real no está listo (C-1)

- **(A) Tres etapas. La 12.3 no cierra sin la 12.3.3.** **Recomendada.**
  - La 12.3.3 empieza cuando el agente emita hacia staging, con **su** brief en **su** repositorio, sus cambios de ingestión y datos sintéticos.
  - **La 12.4 puede empezar mientras tanto**: el Roadmap la hace depender solo de la 12.2.
  - **Por qué**: si la autenticación rechaza el tráfico real, el arreglo es un cambio de v2. Descubrirlo en la 12.5, con el historial ya construido encima, es más caro. Es el problema del vault *An Auth Mechanism Validated Only With Synthetic Requests Can Reject All Real Traffic*.
- **(B) La 12.3 cierra en la 12.3.2**, validada en staging con un script del CRM; O-35 y O-34 pasan a la 12.5, con una enmienda fechada del Roadmap.
  - Sirve si el usuario prefiere adaptar el agente de una sola vez, después de la 12.4.
  - **Costo**: el contrato llega a la 12.5 sin haber visto un request real.
- **Cómo emite el agente** lo decide su brief. Del lado del CRM hay dos condiciones:
  - **el request lo arma el agente con su propia configuración**: su nodo HTTP, sus encabezados y su serialización. Si un script del CRM imita al agente, no vale como emisor real;
  - **los datos son sintéticos**, con teléfonos del rango `+54911555500xx` (brief-12.1, D-2). Una captura con un dato personal real se descarta sin versionarla, y se detiene (§Condiciones de detención).

### D-10 — R-8 de la 12.2 y el plan de la vigente

- **El plan se mide en la 12.3.2**, con `EXPLAIN (ANALYZE, BUFFERS)` contra el volumen de staging (seed de la 9.3). Se versiona la salida cruda en la evidencia, con la regla de la 10.1: plan y tiempo, no solo la forma.
- **R-8** (`FOR NO KEY UPDATE` y la candidata que cierra un `admin` en ese momento): **recomiendo moverla a la 13.2**, con una enmienda fechada del Roadmap.
  - El tráfico sintético de un solo emisor en staging no produce esa concurrencia, así que la 12.3 **no la puede medir**, aunque se la hayan asignado.
  - Cambiar el modo de bloqueo exige volver a medir M1, y no hay un defecto demostrado.

### D-11 — Etapas, despliegue y revisión

- **12.3.1 — Contrato v2** (`deterministic`): D-1 a D-8, local y en CI. Sin despliegue.
- **12.3.2 — Staging** (`isolated-runtime`):
  - el despliegue de `main`, con las migraciones `0021` a `0023` y el README corregido (**E-1**: se corrige con lo que funcionó y se registra);
  - la ingestión encendida, con una credencial nueva de la organización del piloto en la allowlist;
  - `scripts/probar-ingestion.ts`, gemelo de `probar-api-lectura.ts`, que recorre el borde real con los fixtures v2;
  - el plan de la vigente (D-10).
  - **Termina con la ingestión apagada y la credencial revocada**, como la 11.4.2, salvo que la 12.3.3 empiece enseguida.
- **12.3.3 — Emisor real** (`producer-consumer`), si el usuario elige D-9 (A):
  - la ingestión se enciende otra vez;
  - el agente emite: al menos un turno con `client.resolved`, `conversation.resolved`, `message.recorded` de salida con `sent_by` y `conversation.escalated`, más un reenvío;
  - las capturas quedan como fixtures con `"shape": "captured"`;
  - la métrica 12 se calcula a mano sobre `ingestion_events` y se compara con el dashboard (O-34);
  - se cuentan los pedidos por turno y los `429` (pregunta 5);
  - se revisa el nombre (R-6).
- **Cada etapa empieza con la CI de la anterior en verde.**
- **Revisión independiente obligatoria**, al final de la 12.3.3 o de la 12.3.2 si se elige D-9 (B). O-35 es el gate que IntegrationBoundaries le fijó a la integración, y **una subfase que abre o cierra un gate no cierra solo con autoevaluación** (CLAUDE.md).

## Alcance incluido

**12.3.1**
- [ingestion-v2](../contracts/ingestion-v2.md) (nuevo), con los cuatro eventos, `kind`, `sent_by`, la correlación, el `409` con `reason`, la regla de D-8 y la guía del emisor. Cada evento lleva su vector y su `payload_hash` escritos a mano.
- Validador v2 estricto y fixtures v2 con `"shape": "assumed"`.
- La ruta v2, compartiendo el borde y la proyección con v1.
- La migración `0023` (D-4).
- La proyección guarda `kind` y `sent_by`. Con v1 quedan `null`.
- El rótulo de la pantalla 9 (D-5), si se aprueba.
- Documentos:
  - FR-API-07 (contrato v2), con su fila en TraceabilityMatrix;
  - DataModel: las columnas y la nota de `null`;
  - una nota fechada en ingestion-v1 que apunta a v2;
  - IntegrationBoundaries.

**12.3.2**
- El despliegue, la corrida de E-1, el script de prueba y la evidencia.
- La medición del plan de la vigente.

**12.3.3**
- Las capturas, los fixtures capturados y la evidencia de O-35 y O-34.
- La respuesta medida a la pregunta 5 en Risks, y R-6 confirmada o descartada.

## Alcance excluido

- **Cambiar v1**: su forma, sus respuestas o sus reglas. La nota fechada es la única excepción.
- Retirar v1 (D-1).
- **Adjuntos**: archivos, URLs o almacenamiento de medios (D-2).
- Qué persona respondió (D-3).
- Filtros, métricas o columnas nuevas por tipo o por autor (D-5).
- R-8 (D-10), la disponibilidad (13.3) y la retención (13.4).
- El historial (12.4) y las memorias.
- **Cualquier cambio en el repositorio del agente o en su instancia**: los hace el agente, con su brief. **Leer** sus ejecuciones para las capturas se autoriza aparte (C-2).
- Datos personales reales (brief-12.1, D-2).
- Airtable y cualquier cosa de ERP.

## Archivos o componentes autorizados

Lista cerrada. Tocar otro archivo es un hallazgo bloqueante, salvo una ampliación que autorice el usuario y quede registrada acá.

**12.3.1**
- **Migración**: `drizzle/0023_*.sql` y `drizzle/meta/` (lo que genera `drizzle-kit`).
- **`src/modules/conversations/`**: `schema.ts`, `service.ts`, `repository.ts`, `index.ts` y sus tests unitarios.
- **`src/modules/ingestion/`**:
  - `contract-v2.ts` y `contract-v2.test.ts` (nuevos);
  - `service.ts`, `service.test.ts` e `index.ts`;
  - `contract.ts`, **solo** para exportar lo que v2 reutiliza, sin cambiar ninguna regla de v1.
- **Rutas**:
  - `src/app/api/ingestion/v2/events/route.ts` y `handler.ts` (nuevos);
  - `src/app/api/ingestion/v1/events/handler.ts`, **solo** para extraer el borde compartido, con los tests de v1 intactos.
- **Pantalla 9**: `src/app/(autenticado)/conversaciones/[conversationId]/timeline.tsx`, `page.tsx` y la función de lectura del timeline en `conversations` (D-5).
- **Tests**:
  - `tests/fixtures/ingestion/v2/` (nuevo);
  - `tests/integration/ingestion-v2.test.ts` e `ingestion-v2-http.test.ts` (nuevos);
  - `tests/e2e/conversations.spec.ts`, solo el caso del rótulo;
  - `tests/guards/exposed-surface.test.ts`, solo la ruta nueva (C-3).
- **Documentos**:
  - `docs/contracts/ingestion-v2.md` (nuevo) y `docs/contracts/ingestion-v1.md`, solo la nota;
  - `docs/architecture/DataModel.md`, `docs/architecture/IntegrationBoundaries.md` y `docs/architecture/TraceabilityMatrix.md`;
  - `docs/product/FunctionalRequirements.md`.

**12.3.2**
- `deploy/staging/README.md` (E-1)
- `scripts/probar-ingestion.ts` (nuevo)
- `docs/decisions/evidencia-12.3-ingestion-v2.md` (nuevo)

**12.3.3**
- `tests/fixtures/ingestion/v2/` (las capturas) y `src/modules/ingestion/contract-v2.test.ts` (su recorrido)
- `docs/decisions/evidencia-12.3-ingestion-v2.md`
- `docs/planning/Risks.md` (pregunta 5, O-34, O-35 y R-6)
- `docs/analytics/MetricsCatalog.md`, solo la nota de la primera medición real

**Todas las etapas**:
- este brief, `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md`;
- `docs/planning/Roadmap.md`, para las enmiendas de D-9 (B) y D-10.

## Fuentes de verdad

- [ingestion-v1](../contracts/ingestion-v1.md): §Versionado, §Respuestas y §Proyección.
- [DataModel](../architecture/DataModel.md): `messages`, `ingestion_events` y la regla 10.
- [IntegrationBoundaries](../architecture/IntegrationBoundaries.md) y el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md).
- [read-v1](../contracts/read-v1.md) (correlación) y [brief-11.3](brief-11.3-api-de-lectura.md) (D-5 y D-6).
- [brief-12.1](brief-12.1-actor-de-servicio-y-cliente-por-telefono.md) (D-2 y R-6) y [brief-12.2](brief-12.2-conversacion-vigente-y-derivacion.md) (R-7 y R-8).
- [evaluación 10.1](evaluacion-10.1-mvp.md) (O-34 y O-35), [Risks](../planning/Risks.md) y [Roadmap](../planning/Roadmap.md) §Fase 12.
- `deploy/staging/README.md` y [evidencia-11.4](evidencia-11.4-piloto.md), que es el procedimiento de despliegue anterior.

## Invariantes

- **v1 no cambia**: sus vectores dan el mismo hash, y sus tests pasan sin tocar ninguna aserción.
- Un mensaje de v1 guarda `kind` y `sent_by` en `null`. Nunca se rellenan.
- Una entrada nunca tiene `sent_by`.
- `messages` sigue siendo de solo inserción, y ninguna migración reescribe filas.
- **Un reenvío idéntico no pierde ni duplica** un mensaje, por v1 o por v2.
- Ni los logs ni las respuestas llevan el teléfono, el nombre ni el texto. La correlación se registra; el payload, no.
- La organización y el `source` salen de la credencial.
- **Staging sin datos personales reales.** El CRM no llama al agente.
- Sin referencias a Airtable ni al código del agente.

## Criterios de aceptación

**12.3.1 — Contrato v2**

- **AC-1**: ingestion-v2 documenta los cuatro eventos con su tabla de campos, sus reglas, sus respuestas, un vector escrito a mano y el `payload_hash` de cada uno, comparados con el validador. Los fixtures declaran `"shape": "assumed"`.
- **AC-2**: el validador v2 es estricto:
  - exige `kind`;
  - exige `sent_by` en una salida y lo rechaza en una entrada;
  - rechaza un `kind` o un `sent_by` desconocido, NUL, UTF-16 inválido y campos desconocidos;
  - aplica la regla de D-8, con un caso con separadores y otro con dígitos ajenos que se acepta.
- **AC-3**: v1 no cambia. Sus vectores dan el mismo hash, sus tests pasan sin tocar ninguna aserción, y un mensaje de v1 queda con `kind` y `sent_by` en `null`.
- **AC-4**: la migración `0023` crea los enums, las columnas y el `CHECK`, sin reescribir filas. El `CHECK` rechaza una entrada con `sent_by`, probado contra PostgreSQL. `messages` sigue rechazando `UPDATE` y `DELETE`.
- **AC-5**: la proyección guarda `kind` y `sent_by` en los dos eventos que registran mensajes. `conversation.resolved` v2 sigue las reglas de vigencia de la 12.2 sin cambios. Los tests de vigencia pasan contra v2.
- **AC-6**: `409` con `reason` en los tres casos de D-7, cada uno registrado como en v1. El mismo `event_id` enviado por v1 y por v2 da `CONFLICT` con `event_payload_mismatch`.
- **AC-7**: cada afirmación de la guía del emisor tiene su test:
  - un reenvío idéntico después de confirmar responde `duplicate` con los mismos datos;
  - un `500` revierte la reserva, así que el reenvío lo procesa;
  - `429` lleva `Retry-After`;
  - un `422` es terminal.
- **AC-8**: por HTTP, la cadena completa de v1 en v2: apagado, credencial, `read`, allowlist y límite compartido con v1.
  - La correlación se registra y se devuelve, también en el `429` (D-6).
  - Una correlación inválida da `400` sin consumir el límite.
  - El log no lleva teléfono, nombre ni texto.
  - La guarda de superficie expuesta declara la ruta nueva.
- **AC-9**: aislamiento entre organizaciones en v2, en un caso por tipo que escribe.
- **AC-10**: la pantalla 9 muestra el tipo y el autor según D-5, con un caso end-to-end. Si se elige la alternativa, este criterio no aplica y se dice.
- **AC-11**: FR-API-07 está en FunctionalRequirements y en TraceabilityMatrix. DataModel y IntegrationBoundaries llevan texto fechado, e ingestion-v1 su nota.
- **AC-12**: hay una corrida de mutación por regla nueva, cada una detectada y restaurada:
  - sin el `CHECK`;
  - con `kind` opcional;
  - sin la regla de D-8;
  - con la correlación después del límite.

**12.3.2 — Staging**

- **AC-13**: el despliegue sigue `deploy/staging/README.md` línea por línea:
  - backup previo, de 21 a 24 migraciones, las comprobaciones posteriores de la 11.4 y el `diff` contra lo desplegado;
  - cada línea del README que falló se corrigió con lo que funcionó y quedó registrada (**E-1**).
- **AC-14**: `probar-ingestion.ts` recorre el borde real (nginx, TLS y `TRUSTED_PROXY`) con cada fixture v2 válido e inválido. El resultado:
  - 0 fallas contra el validador;
  - una línea de log por pedido, sin secretos;
  - la ingestión apagada y la credencial revocada al terminar, salvo que la 12.3.3 empiece enseguida.
- **AC-15**: el plan de la vigente, medido con `EXPLAIN (ANALYZE, BUFFERS)` sobre el volumen de staging. La salida cruda y el tiempo están en la evidencia, con una organización grande y una chica.

**12.3.3 — Emisor real** (D-9 A)

- **AC-16**: **requests emitidos por el agente**, con datos sintéticos, pasan la autenticación y el validador de staging:
  - al menos un turno con los cuatro tipos, una salida con `sent_by` y un reenvío;
  - todo rechazo inesperado queda registrado como hallazgo **antes** de tocar el contrato.
- **AC-17**: las capturas quedan como fixtures con `"shape": "captured"`, sin token ni dato personal real, y pasan el validador en CI.
- **AC-18**: la métrica 12 medida sobre esos eventos coincide con el conteo a mano de `ingestion_events` (O-34).
- **AC-19**: en Risks, la pregunta 5 tiene los pedidos por turno medidos, en ingestión y en lectura, y los `429` observados. R-6 queda confirmada o descartada con las capturas.

**Todas las etapas**

- **AC-20**: cada caso nuevo lleva en su nombre el requisito que prueba, o la salvedad de los fixtures de la 12.1 (R-3).

## Pruebas y evidencia requerida

- **12.3.1: `deterministic`**, o sea validado localmente y en CI. Por etapa se corren `lint`, `typecheck`, formato, `test`, `build` y `test:e2e`, y se lee la CI del commit por `headSha` y `conclusion`.
- **12.3.2: `isolated-runtime`**, o sea validado en staging, con requests sintéticos a través del borde real. **No certifica compatibilidad con el agente.**
- **12.3.3: `producer-consumer`**, o sea validado en integración, solo para el contrato de ingestión v2 con el agente como emisor y datos sintéticos. **No es** el turno completo (12.5) ni producción.
- Cada corrida de mutación se registra en este brief con su salida, incluida la que no tenga efecto.

## Condiciones de detención

- Antes de cualquier commit, push, merge o despliegue.
- Antes de aplicar una migración contra staging o cualquier base que no sea la local o la de test.
- Antes de encender la ingestión en staging, crear o revocar una credencial allí, o leer las ejecuciones o la instancia del agente.
- Antes de instalar cualquier dependencia (no se prevé ninguna).
- Si hace falta cambiar algo de v1 que no sea la nota, o una regla de vigencia de la 12.2.
- **Si una captura trae un dato personal real**: se descarta sin versionarla y se avisa al usuario.
- **Si el agente es rechazado por la autenticación o el validador**: se registra el hallazgo y se eleva al usuario. El contrato no se ajusta en el momento para hacerlo pasar.
- Si la medición muestra `429` con tráfico normal: subir el límite es una decisión del usuario (Risks).
- Si hace falta tocar un archivo fuera de la lista.
- Antes de cambiar estados en Notion sin la confirmación del usuario.

## Decisiones del usuario durante la 12.3.1

Del 2026-09-25, antes de terminar la etapa.

- **Enmienda de D-7: dónde queda el `reason`.**
  - D-7 decía que el `409` de v2 lleva `reason` y, a la vez, que el ledger guarda `CONFLICT` como en v1. Así, un reenvío no podría responder el `reason`, y es justo el caso del timeout, cuando el emisor no vio la primera respuesta.
  - El usuario eligió, entre tres opciones (guardarlo en `error_code`, reenvío sin `reason`, o recalcularlo al reenviar), **guardarlo en `error_code`, solo en los eventos de v2**: `message_already_recorded` o `conversation_ref_taken`.
  - `event_payload_mismatch` no se guarda, porque el registro existente no se modifica. Los eventos de v1 siguen guardando `CONFLICT`.
  - La métrica 12 muestra esos códigos: su taxonomía de grupos ya es abierta (MetricsCatalog, brief-7.3, D-3).
- **Ampliación de la lista de archivos**, para D-5: `src/app/(autenticado)/conversaciones/messages.ts`, `messages.test.ts` y `[conversationId]/timeline-items.ts`. El rótulo y el armado del timeline viven ahí, no en `timeline.tsx`.

## Resultados — etapa 12.3.1

**Autoevaluación** (`self_assessment: true`), del 2026-09-25. La revisión independiente de D-11 va al final de la 12.3.3.

### Decisiones de implementación

1. **El borde HTTP es uno solo.** `v1/events/handler.ts` exporta `serveIngestion`, que recibe una especificación con la ruta, la versión, el caso de uso y las dos cosas que solo tiene v2: la correlación y el `reason`. v2 importa ese borde y no lo duplica. Con la especificación de v1, el comportamiento es el mismo: los 25 casos HTTP de v1 pasan sin tocar ninguna aserción, también los que comparan el cuerpo con `toStrictEqual`.
2. **El ledger y la proyección son los de v1.** `recordIngestionEventV2` valida con v2 y llama al mismo `recordEvent`. La versión solo decide qué se guarda y qué se responde en un `CONFLICT`.
3. **`conversations` dice por qué no registró un mensaje.** Devuelve `message_already_recorded` o `conversation_ref_taken`, e `ingestion` lo traduce según la versión. Antes, las dos causas volvían como el mismo `CONFLICT`.
4. **Las piezas de v1 que v2 reutiliza se exportan de `contract.ts`**: `externalRef`, `timestamp`, `bodyText`, `clientName`, `E164` y `toUtc`. No cambió ninguna regla, y los vectores de v1 dan el mismo hash.
5. **El rótulo de la pantalla 9 va en la línea del autor**: «Negocio · Agente · 09:01». El tipo va como una línea chica sobre el cuerpo, por ejemplo «Audio (transcripción)». `text` y `null` no llevan rótulo.
6. **D-8 compara solo los dígitos**, sin agregar el código de país. «11 5555-0001», el teléfono en formato local, se acepta. El contrato lo escribe como límite, y la 12.3.3 lo revisa con capturas.

### Contraste por criterio

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | cumplido | [ingestion-v2](../contracts/ingestion-v2.md) documenta los cuatro eventos, las respuestas, el `409` con motivo, la correlación y la guía del emisor. Cada vector tiene su texto canónico escrito a mano y su SHA-256 calculado sobre ese texto; `contract-v2.test.ts` los compara con el validador. 13 fixtures con `"shape": "assumed"`: 6 válidos, 4 de ellos los vectores, y 7 inválidos. Los hashes de los 2 válidos que no son vectores salen del validador, como en v1. |
| AC-2 | cumplido | `contract-v2.test.ts`: `kind` obligatorio y del enum (`null`, `"TEXT"`, `""` y `"sticker"` rechazados); `sent_by` obligatorio en una salida y rechazado en una entrada, también con `null`; en `conversation.resolved`, campo desconocido. D-8 con cuatro formas del teléfono rechazadas y cuatro nombres aceptados, entre ellos «Local 12». NUL, UTF-16 inválido, fecha futura y campo desconocido. |
| AC-3 | cumplido | Todos los tests de v1 pasan sin tocar ninguna aserción: `contract.test.ts`, `ingestion.test.ts`, `ingestion-http.test.ts` (25 casos), `client-resolution`, `conversation-resolution` y `conversation-escalation`. `ingestion-v2.test.ts`: un `message.recorded` y un `conversation.resolved` de v1 quedan con `kind` y `sent_by` en `null`. |
| AC-4 | cumplido | La migración `0023` crea los dos enums, las dos columnas nulables sin default y el `CHECK`, sin reescribir filas. Contra PostgreSQL, el `CHECK` rechaza una entrada con autor (`23514`, `messages_sent_by_only_outbound`) y acepta las otras tres combinaciones; un `UPDATE` de `kind` sigue dando `P0001`. |
| AC-5 | cumplido | Un turno completo por v2 (cliente, audio entrante, respuesta del agente y derivación) deja `audio`/`null` y `text`/`agent`. Una entrada sin teléfono queda `document`/`null`, y una imagen de una persona, `image`/`person`. La vigencia por v2: 24 horas exactas es vigente, 24 horas y 1 ms no, y una `closed` nunca. |
| AC-6 | cumplido | Los tres motivos: `message_already_recorded` por `message.recorded` y por `conversation.resolved`, y `conversation_ref_taken`, los dos guardados en `error_code` y **repetidos al reenviar**; `event_payload_mismatch` sin tocar el registro, y también con el mismo `event_id` por v1 y por v2. v1 sigue guardando `CONFLICT` y responde sin motivo, también por HTTP. |
| AC-7 | cumplido | Un reenvío idéntico después de confirmar responde `duplicate` con los mismos datos, sin otro mensaje. Un error inesperado no deja el evento, y el reenvío del mismo evento se procesa. Un `422` es terminal. Por HTTP, el `429` lleva `Retry-After`. |
| AC-8 | cumplido | `ingestion-v2-http.test.ts`: `404` sin cuerpo y sin correlación con el endpoint apagado; `401` con `WWW-Authenticate`; `403` para una credencial `read` y para una fuera de la allowlist, sin escribir ni abrir ventana. La correlación se devuelve y se registra en el `201`, el `400`, el `429` y el `500`; una inválida da `400` sin consumir el límite. El límite es compartido: 120 pedidos por v1 dejan el siguiente de v2 en `429`. El log no lleva token, teléfono, nombre ni texto. `exposed-surface.test.ts` declara la ruta nueva. |
| AC-9 | cumplido | Los cuatro tipos por v2 en la organización A no tocan la B, que tiene un cliente con el mismo teléfono y una conversación con la misma referencia. La B queda sin mensajes nuevos ni auditoría, y su conversación sigue `open`. |
| AC-10 | cumplido | `messages.test.ts`: los rótulos, y nada sin dato. `conversations.spec.ts` caso 11, contra `next start`: «Audio (transcripción)», «Negocio · Agente», «Negocio · Persona» con «Imagen», y un mensaje sin dato sin rótulo, con el chequeo de accesibilidad. Los casos 5 y 10 siguen pasando. |
| AC-11 | cumplido | FR-API-07 en FunctionalRequirements y en TraceabilityMatrix. DataModel escribe las dos columnas, el `CHECK`, el motivo en `error_code` y el ledger compartido. IntegrationBoundaries lleva texto fechado, e ingestion-v1 su nota de congelamiento. |
| AC-12 | cumplido | Seis mutaciones, todas detectadas y restauradas (ver abajo). |
| AC-20 | cumplido, con la salvedad de la 12.1 | Los casos nuevos llevan FR-API-07, o FR-API-05 los de vigencia. Los 13 fixtures corren con el `it.each` que los nombra por archivo (R-3 de la 12.1). |

### Mutaciones (AC-12)

| # | Qué se rompió | Resultado |
|---|---|---|
| M12 | Sin el `CHECK` en la migración `0023` | **Detectada**: falla el caso del `CHECK`. *El primer intento no midió nada*: borré la restricción de la base de test, pero el `global-setup` de vitest recrea esa base desde las migraciones en cada corrida, así que el test corrió con el `CHECK` puesto y pasó. La mutación válida es sobre el archivo de la migración. |
| M13 | `kind` opcional en los dos esquemas | **Detectada**: 2 casos fallan. |
| M14 | Sin la regla de D-8 | **Detectada**: 5 casos fallan, las cuatro formas del teléfono y el fixture. |
| M15 | La correlación después del límite de tasa | **Detectada**: fallan el caso 5, porque la correlación inválida consume el límite, y el caso 6, porque el `429` no la lleva. |
| M16 | Sin la regla de `sent_by` | **Detectada**: 5 casos fallan. |
| M17 | v2 guarda `CONFLICT` en lugar del motivo | **Detectada**: 3 casos fallan, porque el reenvío pierde el motivo. |

Todas se restauraron desde una copia, y `diff` confirmó que cada archivo, la migración incluida, quedó igual a su copia.

### Verificación de la etapa

- `lint`, `typecheck` y `format:check`: 0.
- `npm run test`: **1345 de 1345 en 97 archivos**. Son los 1265 de la 12.2 más 80: 52 de `contract-v2.test.ts`, 18 de `ingestion-v2.test.ts`, 9 de `ingestion-v2-http.test.ts` y 1 de `messages.test.ts`.
- `npm run build`: 0.
- `npm run test:e2e`: **99 de 99**, los 98 de antes más el caso 11.

**Alcance real contra la lista**: los 43 archivos tocados (30 más los 13 fixtures) están en la lista de la 12.3.1 o en la ampliación autorizada. `page.tsx` estaba en la lista y no hizo falta tocarlo.

**Nivel**: validado localmente (`deterministic`, requests sintéticos). **No** está validado en staging ni con un emisor real. Falta la CI del commit.

**CI de la etapa 12.3.1**: commit `49a3cb4`, run 36199681876, `success` en el intento 1. Queda **validada localmente y en CI**.

## Resultados — etapa 12.3.2

**Autoevaluación** (`self_assessment: true`), del 2026-09-25. Las salidas están en [evidencia-12.3](evidencia-12.3-ingestion-v2.md).

### Autorizaciones y decisiones del usuario durante la etapa

- **Tres pasos autorizados**: el script, el despliegue y la prueba en staging.
- **Permiso `Bash(ssh crm-staging:*)`**: el usuario lo agregó a su configuración local cuando el clasificador del modo automático bloqueó la primera escritura remota. Conviene sacarlo al cerrar la 12.3.3.
- **AC-15 trasladado a la 13.2**, entre tres opciones. Staging tenía solo el seed del piloto, no el volumen de la 9.3. El Roadmap lleva la enmienda, junto con la de R-8 que D-10 ya había aprobado.

### Contraste por criterio

| AC | Resultado | Evidencia |
|---|---|---|
| AC-13 | cumplido | Backup previo (`crm_staging-20260925T231942Z.dump`, 74 533 bytes), de 21 a 24 migraciones, y los nueve `diff` en cero. **E-1**: la línea del build falló por falta de heap y quedó corregida en el README con lo que funcionó. **Un error de quien desplegó dejó staging en `502` durante 3 min 11 s**: encadenó el reinicio con `;`. Las cinco comprobaciones posteriores están hechas. La 2 (un solo salto de proxy) y la 5 (el rol de la aplicación no borra) se hicieron después, con la autorización del usuario: la 2 con control desde otra IP por un túnel SOCKS, y la 5 dio `permission denied`. |
| AC-14 | cumplido | `probar-ingestion.ts` por el borde real: **0 fallas en 18 pedidos**, con respuestas de esquema estricto, los dos `409` con su `reason`, los siete inválidos con sus campos, la correlación inválida y el `401`. El log tiene 18 líneas, 16 con la correlación, y ningún secreto ni dato del mensaje. La base de staging tiene el tipo, el autor y el motivo guardados. La ingestión quedó apagada (v1 y v2 en `404`) y la credencial revocada. **Incidente**: 6 caracteres del token se imprimieron en la conversación con el asistente; registrado en la evidencia. |
| AC-15 | **trasladado a la 13.2** | Decisión del usuario. No se midió en staging. |

### Verificación de la etapa

- `scripts/probar-ingestion.ts`: lint y tipos limpios, y 0 fallas contra `next start` local antes de staging.
- `format:check`: 0. Guardas: 296 de 296.

**Nivel**: el contrato v2 está **validado en staging** con requests sintéticos a través del borde real (`isolated-runtime`). **No** con un emisor real: eso es la 12.3.3, que empieza cuando el agente emita.

**CI de la etapa 12.3.2**: commit `cc90eaf`, run 36202372270, `success` en el intento 1. El commit solo trae documentación y el script, así que staging sigue en `49a3cb4` sin redesplegar.

## Resultados — etapa 12.3.3

**Autoevaluación** (`self_assessment: true`), del 2026-09-27. Las salidas están en [evidencia-12.3](evidencia-12.3-ingestion-v2.md), §12.3.3. El emisor fue la instancia de n8n del agente, conducida por la sesión de su repositorio con su brief-3.22. El CRM leyó su informe y sus capturas como insumo y las cruzó con su log y su base.

### Autorizaciones y decisiones del usuario durante la etapa

- **La ventana de staging**, de 15:00 a 16:00 ART, y tocar staging para abrirla y cerrarla. Se usó de 18:10 a 18:30 UTC.
- **El token lo creó el usuario en su propia terminal** y fue directo a la credencial de n8n, para que no pasara por la conversación con el asistente, como sí pasó en la 12.3.2.
- **Una línea más en la guía del emisor de `ingestion-v2.md`**, «Contenido reproducible», a partir del hallazgo H-1 del agente. Es una aclaración, no un cambio de contrato, y **ese archivo no estaba en la lista de la 12.3.3**: lo autorizó el usuario.
- **Las lecturas de la base de staging las hizo el usuario**: el clasificador del modo automático bloqueó la del asistente, y no se reintentó por otro camino.
- **Respuestas al agente**, fuera del repositorio (`Respuesta-12.3.3-CRM-al-Agente.md`, en el Escritorio del usuario):
  - H-3, una correlación por turno, ya estaba en la guía;
  - su filtro de tokens tiene que cubrir `crm_ctx_`;
  - **H-2, el turno consolidado, es condición de entrada de la 12.5**.

### Contraste por criterio

| AC | Resultado | Evidencia |
|---|---|---|
| AC-16 | cumplido | 7 pedidos del emisor real: los cuatro tipos, dos salidas con `sent_by: agent`, un reenvío `duplicate` con el mismo `client.id` y un `400` deliberado. Siete líneas del log con la correlación, sin secretos ni datos del mensaje. Ningún rechazo inesperado. Cinco filas `processed` en `ingestion_events` |
| AC-17 | cumplido en local; la CI, con el commit | 6 fixtures `captured-*.json` con el cuerpo tal como salió; el validador da lo mismo que staging. Un caso nuevo con FR-API-07 y una corrida de mutación |
| AC-18 | cumplido | 3 eventos y 0 fallidos, a mano y en el dashboard. **El valor anunciado antes de mirar fue 4, por un error de quien hizo el trabajo**: olvidó que `conversation.escalated` no cuenta desde la 12.2. Registrado en la evidencia |
| AC-19 | **cumplido en parte** | **Trasladado a la 12.5 por decisión del usuario** (2026-09-27, revisión independiente H-1): las lecturas por turno y R-6, con la enmienda del Roadmap y la fila de R-6 en Risks. 5 escrituras por turno, 0 lecturas y ningún `429`, en Risks. Las lecturas por turno se miden en la 12.5. **R-6 ni confirmada ni descartada**: el nombre sintético no trae el teléfono |
| AC-20 | cumplido, con la salvedad de la 12.1 | el caso de cobertura lleva FR-API-07; los seis del recorrido por archivo se nombran por el archivo (R-3 de la 12.1) |

### Limitaciones

- **El turno fue sintético**, y el emisor del agente sigue sin cablear a su pipeline.
- **La referencia devuelta no se puso a prueba**: el CRM devolvió la propuesta. Tampoco se ejercitaron los dos `409` con el emisor real.
- **Los encabezados de las capturas son los que declara el emisor.** La correlación sí se ve en el log del CRM.

### Verificación de la etapa

- `lint`, `typecheck` y `format:check` limpios.
- Vitest `unit`: **483 de 483**; guardas: **296 de 296**. **Integración y end-to-end no se corrieron en local** en esta etapa: Docker estaba apagado, y la etapa no cambió código de producción. Los corre la CI con el commit.
- **Corridas de mutación**, todas restauradas y comprobadas:

| Id | Mutación | Resultado |
|---|---|---|
| M22 | sin el `sent_by` de la captura del segmento 1 | falla el recorrido de ese archivo: el validador rechaza una salida sin autor |
| M23 | sin la captura de `conversation.escalated` (agregada por H-6 de la revisión) | falla el caso de cobertura de FR-API-07 |
| M24 | un teléfono fuera del rango `+54911555500xx` | falla el recorrido del archivo, en la aserción del rango |
| M25 | un prefijo `crm_ing_` en la nota de una captura | falla el recorrido del archivo, en la aserción de prefijos |

- **Pendiente del usuario**: sacar de su configuración local los permisos `Bash(ssh crm-staging:*)`, el del túnel SOCKS y el de `pkill`, que la 12.3.2 dejó para cerrar con la 12.3.3.

### Revisión independiente (D-11)

Del 2026-09-27, por un agente de solo lectura que no participó del trabajo, contra este brief y las reglas vigentes. **Veredicto: R2**, con 2 hallazgos mayores y 6 menores, ninguno bloqueante. El nivel `producer-consumer` quedó bien acotado, y las cifras del dashboard son coherentes con el turno.

Cada hallazgo se verificó contra el código antes de aceptarlo. Se aceptaron los ocho:

| Id | Severidad | Hallazgo | Resolución |
|---|---|---|---|
| H-1 | mayor | AC-19 pedía las lecturas por turno y R-6 confirmada o descartada, se lo dio por cumplido para la ingestión sin decisión registrada, y Risks no tenía fila para R-6 | **decisión del usuario**: las dos pasan a la 12.5. Enmienda del Roadmap, fila de R-6 en Risks y AC-19 «cumplido en parte» |
| H-2 | mayor | la fidelidad del cuerpo de las capturas se apoyaba solo en la captura del emisor, y el `payload_hash` del fixture salía del propio validador | se cruzaron los 5 `payload_hash` guardados por staging, consulta del usuario, y **coinciden**. La evidencia separa lo que vio el CRM de lo que solo consta en el agente |
| H-3 | menor | Risks seguía diciendo que las lecturas se medían en la 12.3 | enmienda fechada: pasan a la 12.5 |
| H-4 | menor | «la fórmula es firme» y «24 turnos por minuto», a partir de un solo turno | «observada en un solo turno de un mensaje», condicionada al turno consolidado |
| H-5 | menor | la verificación de la etapa estaba vacía, sin las mutaciones ni el pendiente del permiso `ssh` | completada, con M22 a M25 y el pendiente del usuario |
| H-6 | menor | el caso de cobertura no tenía mutación propia; los prefijos de token se buscaban solo en el cuerpo; el rango de teléfonos no se comprobaba | M23; prefijos en todo el archivo (M25) y rango `+54911555500xx` (M24) |
| H-7 | menor | AC-20 «cumplido» sin la salvedad de los casos por archivo | con la salvedad de la 12.1 |
| H-8 | menor | el conteo a mano filtraba por `source` y el dashboard cuenta por organización y período | consulta de la organización en el día: 5 filas, las mismas |

**Estado documental** que la revisión marcó como viejo: HANDOFF, Roadmap, `IntegrationBoundaries.md` (el gate como pendiente) e `ingestion-v2.md`, línea de `client.display_name` («la 12.3.3 revisa con capturas»). **Se actualizan al cerrar la 12.3**, por decisión del usuario. `IntegrationBoundaries.md` no estaba en la lista y lo autorizó el usuario.

**Lo que la revisión no pudo verificar**:
- el `git diff`, porque no tenía shell;
- los datos de staging, que tomó como provistos;
- que el cuerpo lo haya armado el nodo HTTP del agente con su propia serialización (D-9). Del lado del CRM hay un indicio: el token solo vivía en la credencial de n8n;
- las afirmaciones sobre el código del agente;
- la CI.

**Nivel**: el contrato de ingestión v2 queda **validado en integración** (`producer-consumer`), con el agente como emisor y datos sintéticos. **No** es el turno completo (12.5) ni producción.

**CI de la etapa 12.3.3**: commit `b778850`, run 36342686970, `success` en el intento 1. Corrió la integración y el end-to-end completos, que en local no se habían corrido. Queda **validada en integración**.

## Cierre de la subfase 12.3, 2026-09-27

1. **Confirmación**: el usuario confirmó el cierre el 2026-09-27 («Confirmo cierre»), con la CI de las tres etapas en verde.
2. **Etapas**: 12.3.1 en `49a3cb4`, 12.3.2 en `cc90eaf` y 12.3.3 en `b778850`, todas con la CI en verde en el intento 1.
3. **Criterios**: AC-1 a AC-14 y AC-16 a AC-20 cumplidos, con sus salvedades escritas.
   - **AC-15**, trasladado a la 13.2 por decisión del usuario.
   - **AC-19**, cumplido en parte: las lecturas por turno y R-6 pasan a la 12.5, por decisión del usuario.
4. **Gates**:
   - **O-35 cumplido para la ingestión v2**: autenticación y fixtures validados con requests del emisor real, en staging y detrás del modo de prueba;
   - **O-34 hecho**: la métrica 12 se midió por primera vez con eventos de un emisor real.
5. **Nivel**: el contrato de ingestión v2 queda **validado en integración** (`producer-consumer`), con el agente como emisor y datos sintéticos.
   - **No** se certifica el turno completo, que es la 12.5, ni producción.
   - **No** se certifica un turno que haya recorrido la cadena real del agente.
6. **Revisión independiente**: hecha (D-11). R2, 8 hallazgos, todos verificados y resueltos.
7. **Lo que queda abierto**:
   - **para la 12.5**:
     - las lecturas por turno;
     - R-6;
     - **condición de entrada**: un `conversation.resolved` por cada mensaje real de WhatsApp (H-2 del agente), y la emisión no bloqueante del agente conciliada con «sin pérdida de mensajes»;
     - la referencia devuelta distinta de la propuesta y los dos `409`, con el emisor real;
   - **para la 13.2**: AC-15, el plan de la vigente, y R-8 de la 12.2;
   - **del lado del agente**: cubrir `crm_ctx_` en su filtro de tokens, y cablear el emisor a su pipeline.
8. **Limpieza**: la ingestión de staging quedó apagada y la credencial `8c516f09-…` revocada.
   - El usuario borró de su configuración local los permisos de `ssh`, del túnel SOCKS y de `pkill`.
   - La copia `app.env.bak-12-3-3` del servidor se borró: era idéntica al `app.env` vigente.
   - **Ampliaciones autorizadas por el usuario al cerrar**:
     - `IntegrationBoundaries.md`, el gate cumplido;
     - `ingestion-v2.md`: la línea de R-6, y el estado y la evidencia, que habían quedado viejos.
