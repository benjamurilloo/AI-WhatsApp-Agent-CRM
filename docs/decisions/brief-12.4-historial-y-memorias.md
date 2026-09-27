---
schema: task-brief.v1
task_id: "12.4"
task_type: implementation
generated_at: 2026-09-26
---

# Brief: 12.4 — Historial y memorias

**Estado: aprobado el 2026-09-26 por el usuario, con las recomendaciones de D-1 a D-11**: las memorias tienen al CRM como dueño y las genera el emisor, pero no se construyen en la Fase 12 (D-1, opción C, con la enmienda del Roadmap de C-1); el historial sale solo de la conversación pedida (D-2), con un alcance de credencial nuevo, `context` (D-6, opción b); no se despliega en esta subfase (D-9, opción b), y lleva revisión independiente (D-10). La aprobación no autoriza commits, pushes, migraciones contra staging ni despliegues: cada uno se pide en su turno.

## Objetivo

Dos cosas:

1. **Una lectura de servicio del historial.** Un sistema externo lee los **últimos N mensajes** de una conversación de su organización, en orden cronológico, con la dirección, el tipo y el autor de cada uno (B-7).
2. **Contestar la pregunta 3 de las brechas.** ¿Las memorias del cliente viven en el CRM o en el agente, y quién las genera? (B-10). Se decide acá y queda escrita.

**Resultado verificable**: en una conversación con 30 mensajes, un pedido con `limit=20` devuelve los mensajes 11 a 30, del más viejo al más nuevo. Nunca devuelve los 20 primeros. La respuesta a la pregunta 3 queda en este brief y en el Roadmap, con la conducta que sigue de ella.

## Situación en la fase

- **Necesario ahora (12.4)**:
  - B-7, la lectura del historial. Es la última operación del contexto del turno que falta. Con ella, la 12.5 puede recorrer un turno completo.
  - La pregunta 3 de las brechas (B-10), asignada a esta subfase por el mapa del [brief-10](brief-10-evaluacion-del-mvp.md) (§Resultados de la 10.3, tabla y AC-15).
- **En paralelo con la 12.3**, que espera al agente para su etapa 12.3.3. Lo permite el [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md), D-9. La 12.4 no toca el contrato de ingestión.
- **La usa la 12.5**, el turno completo en staging, que cierra el gate de la fase.
- **Antes de producción, no acá**:
  - la retención de `messages` (13.4): la lectura del historial expone mensajes, pero no cambia cuánto tiempo se guardan;
  - el plan de la consulta con volumen (13.2), que ya reúne las mediciones previas a exponer datos reales.

## Contexto de negocio

Leído del documento de brechas del usuario (repositorio del agente, rama `agent/brechas-crm-airtable`, commit `b75e484`, con `git show` y sin cambiar de rama). Es **solo contexto**, nunca una dependencia técnica.

- **Hoy** el agente lee el historial de la conversación: dirección, contenido y hora (§2, `CTX - Get History`).
- **Esa lectura tiene una falla medida**: trae los 15 mensajes **más antiguos**, así que el historial se congela desde el mensaje 15. Además, ningún workflow guardaba las respuestas del agente, así que el historial solo traía los mensajes del cliente (§2, hallazgos del piloto). Lo segundo ya lo resuelve el contrato v2, con `message.recorded` y `sent_by`.
- **Hoy** el agente lee memorias por cliente, con tipo, prioridad, contenido y resumen. Pero **ningún workflow las escribe**: todas las ejecuciones revisadas devolvieron `memory_count: 0` (§2 y B-10). **Funcionalmente, el agente trabaja hoy sin memorias.**
- **B-10** está marcada como **necesaria**, no bloqueante. Dice que falta «decidir el dueño —el CRM, visible para el operador, o el agente— y construir el productor que las genere».
- **Presupuesto de lecturas**: un turno hace hoy, según las brechas, unas cuatro lecturas de catálogo e información. El historial suma una más ([Risks](../planning/Risks.md), fila del límite de 120).

**En el CRM**:
- `messages` guarda la dirección, `sent_at`, `body_text` y `external_ref`, y desde la 12.3 también `kind` y `sent_by`, que son nulos en los mensajes de v1 y de los seeds ([DataModel](../architecture/DataModel.md) §`messages`).
- Ya existe el índice `messages_conversation_sent_idx`, sobre `(conversation_id, sent_at)`. `findMessagesBefore` (`conversations/repository.ts:223`) ordena por `sent_at desc, id desc` con `LIMIT` en SQL, y alimenta la pantalla 9. La consulta de los últimos N ya está resuelta del lado de la base: **no hace falta migración para leer**.
- La conversación se identifica, para un servicio, por `(organization_id, channel, external_ref)`, único. Es la referencia que devuelve `conversation.resolved` ([ingestion-v2](../contracts/ingestion-v2.md)).
- La [API de lectura v1](../contracts/read-v1.md) ya tiene su borde: modo de prueba, credencial con alcance, allowlist, límite, correlación y log con ruta fija (`src/app/api/read/v1/serve.ts`). Su §Versionado dice que **una ruta nueva es un cambio compatible dentro de v1**, y que un campo nuevo en una respuesta existente no lo es.
- **Hasta hoy, la API de lectura solo expone datos del negocio**: catálogo e información. El historial es la **primera lectura de servicio que devuelve datos personales**, lo que escribió un cliente. Eso pesa en D-6 y en D-10.

## Hallazgos antes de diseñar (paso 5 de la planificación)

Reabrí y busqué con `grep` [Overview](../architecture/Overview.md) (`JOIN`, «depende de», «no importa»), [IntegrationBoundaries](../architecture/IntegrationBoundaries.md), [read-v1](../contracts/read-v1.md), [DataModel](../architecture/DataModel.md) y el Roadmap.

**C-1 — La recomendación de D-1 no calza con la letra del Roadmap.** El Roadmap (§Fase 12, 12.4) dice que la pregunta de las memorias «se decide en esta subfase; si la respuesta es el CRM, su construcción entra como subfase nueva de esta fase, con su brief». La opción que recomiendo en D-1 hace al CRM dueño de las memorias, pero **no las construye en la Fase 12**.
- El Roadmap no previó esa combinación.
- Si se aprueba, el Roadmap lleva una **enmienda fechada** que lo diga, sin reescribir la frase original. No lo resuelvo sola: **es parte de lo que se aprueba**.

**C-2 — Alcance de la credencial y el orden de corte del agente.** [read-v1](../contracts/read-v1.md) §Transporte fija «una credencial, un alcance», con dos alcances: `ingest` y `read`. Las brechas (§6) y el Roadmap fijan que el agente se corta **primero en las tools de catálogo y después en el contexto del turno**. Si el historial usa el alcance `read`, la credencial que el agente cargue para el catálogo puede leer, desde ese día, toda conversación cuya referencia conozca, semanas antes de usar el historial. **No es una contradicción entre documentos, sino una consecuencia no escrita.** Se decide en D-6.

**Sin contradicción**:
- La ruta nueva la sirve el borde de `src/app/api/read/v1/` y le pide los datos a la **interfaz pública** de `conversations`. No hace falta ningún `JOIN` entre módulos, ni que `conversations` conozca HTTP (Overview, reglas de módulos).
- El historial sale de una sola tabla del módulo dueño.

## Decisiones previas (las decide el usuario al aprobar)

Cada una lleva mi recomendación. **Si el usuario elige (A) en D-1 o (b) en D-2, el brief se reescribe antes de aprobarse.**

### D-1 — Las memorias (pregunta 3, B-10)

- **(A) En el CRM, construidas ahora.**
  - Una subfase nueva, la 12.6, antes de la 12.5, con su brief.
  - Llevaría una tabla de memorias por cliente, un evento de escritura en el contrato de ingestión, una lectura de servicio y su lugar en la pantalla del cliente.
  - Las generaría el agente, que es quien tiene el modelo de lenguaje.
  - **Costo**: una subfase entera y un productor que todavía no existe en ningún lado. Hoy el agente lee memorias que **nadie escribe**.
- **(B) En el agente**, en su propia base, generadas por él. El CRM no hace nada.
  - **Contra**: son **datos personales del cliente fuera del sistema de registro**. El operador no las ve ni las corrige, y quedan fuera de la retención que decida la 13.4.
- **(C) El dueño es el CRM, pero no se construyen en la Fase 12.** **Recomendada.**
  - **Respuesta a la pregunta 3**: si existen, las memorias viven en el CRM, visibles para el operador y bajo su retención, y **las genera el emisor**, el agente, por el contrato de ingestión. **El CRM nunca llama a un modelo de lenguaje** sin un ADR que lo decida.
  - **No se construyen ahora**: ni tabla, ni evento, ni ruta. El agente sigue sin memorias, que es como funciona hoy de hecho (`memory_count: 0`), y el historial de los últimos N le da el contexto de la conversación.
  - **Condición para construirlas**, escrita en el Roadmap: que el agente tenga un productor diseñado **y** que el uso real muestre que el historial de la conversación no alcanza, por ejemplo un cliente que vuelve después de la ventana de 24 horas. Entran entonces como subfase con su brief, en la fase que corresponda.
  - **Por qué**: una tabla sin productor es exactamente la «tabla vacía por si acaso» que prohíbe `CLAUDE.md`. Fijar el dueño ahora evita que el agente arme su propio almacén de datos personales, que es la opción (B) por omisión.
  - **Enmienda del Roadmap** (C-1): la 12.4 decide que el dueño es el CRM y que la construcción queda condicionada, no programada.

### D-2 — De qué conversación sale el historial

- **(a) Solo de la conversación pedida.** **Recomendada.**
  - Es lo que el agente lee hoy (B-7: «el historial de la conversación»).
  - Calza con la conversación vigente de la 12.2: un cliente que vuelve después de 24 horas abre otra conversación, y su historial empieza de nuevo. **El contexto entre conversaciones es lo que resolverían las memorias** (D-1).
- **(b) De todas las conversaciones del cliente**, por teléfono. Descartada:
  - pondría en el contexto del turno lo que el cliente habló hace meses, con otra persona o sobre otro tema;
  - la lectura cruzaría conversaciones, y el teléfono viajaría en una lectura, que hoy nunca lo recibe.

### D-3 — La ruta

- **`GET /api/read/v1/messages?conversation_ref=<ref>&limit=<n>`**, una ruta nueva dentro de la lectura v1, que su §Versionado admite como compatible. **Recomendada.**
  - `conversation_ref`: obligatorio. Es la referencia de la conversación que devolvió `conversation.resolved`, con las reglas de las referencias opacas (de 1 a 200 caracteres, sin caracteres de control).
  - `limit`: entero de 1 a 50, sin signo ni ceros de relleno; por defecto, **20**. El agente usa hoy 15, así que 20 le deja margen. El tope de 50 acota una respuesta con texto de clientes.
  - Canal fijo `whatsapp`, el único del modelo. No es un parámetro: si llega un segundo canal, se agrega como parámetro opcional, que es un cambio compatible.
- **Descartado: la referencia en la ruta** (`/conversations/{ref}/messages`). La referencia es opaca y la genera el emisor, así que puede traer `/`, `%` u otros caracteres que cambian cómo se enruta.
- **Descartado: devolver el historial en la respuesta de `conversation.resolved`.** Ahorraría un pedido por turno, pero:
  - cambia una respuesta del contrato v2, recién publicado y todavía sin validar con el agente;
  - mezcla lectura y escritura en la misma credencial;
  - un reenvío idéntico tendría que devolver el historial actual, no el de la primera entrega.

### D-4 — La forma de la respuesta

**Respuesta `200`**: `{ "contract_version": "1", "items": [mensaje, …] }`, del **más viejo al más nuevo**. Una conversación sin mensajes da `items: []`. El objeto es estricto, como el resto de la lectura v1.

| Campo | Tipo | Nulable | Notas |
|---|---|---|---|
| `external_ref` | string | sí | la referencia del mensaje en el canal, la que mandó el emisor. `null` en los mensajes sin referencia, como los del seed de conversaciones (`seeds/conversations.ts`) |
| `direction` | string | no | `inbound` u `outbound` |
| `kind` | string | sí | `text`, `audio`, `image`, `video`, `document` u `other`. `null` es «sin dato»: mensajes de v1 y de los seeds |
| `sent_by` | string | sí | `agent` o `person`, solo en salidas. `null` en toda entrada y en las salidas de v1 |
| `sent_at` | string | no | ISO 8601 en UTC, con milisegundos |
| `body_text` | string | sí | tal como se guardó; el consumidor lo escapa si lo muestra |

**Lo que no trae, a propósito**: el id interno del mensaje y de la conversación, el cliente, su teléfono, el estado de la conversación y un indicador de «hay más».
- El estado ya lo devuelve `conversation.resolved`.
- «Hay más» no tiene consumidor: el agente pide N y usa lo que llega.

**Ojo**: por el §Versionado, **agregar después cualquiera de estos campos es un cambio de v2 de la lectura**. Por eso se decide ahora.

### D-5 — Orden, empates y qué entra

- **Los últimos N por `sent_at`**, con desempate por `id`, y devueltos en orden ascendente. Es el orden del timeline de la pantalla 9: un mensaje que llegó tarde, con un `sent_at` anterior, queda en su lugar y no al final.
- **Entra el mensaje recién registrado.** El turno es: `conversation.resolved` registra el entrante y después se lee el historial, así que el último ítem es el mensaje que el agente está por contestar. El consumidor lo reconoce por `external_ref`. Excluirlo necesitaría otro parámetro, sin necesidad.
- **Una conversación `closed` también se lee.** La lectura no cambia nada, y el operador puede haberla cerrado entre dos pedidos.

### D-6 — Con qué credencial se lee (C-2)

- **(a) El alcance `read`**, el mismo del catálogo. Cero cambios en las credenciales, pero la credencial del catálogo lee conversaciones desde el día en que se carga (C-2).
- **(b) Un alcance nuevo, `context`**, con prefijo de token `crm_ctx_`. **Recomendada.**
  - La credencial del catálogo **no** lee conversaciones, y la del historial no lee el catálogo: «una credencial, un alcance» se sostiene.
  - Cada una se revoca por separado y tiene su propio presupuesto de 120 por minuto, así que el historial no le quita cupo a la búsqueda de productos.
  - La sirve el mismo borde de lectura, con el mismo modo de prueba: `READ_API_ENABLED` y la allowlist `READ_API_ALLOWED_CREDENTIALS`.
  - **Costo**:
    - una migración chica, la `0024`, que amplía el `CHECK ingestion_credentials_scope_valid`;
    - el alcance nuevo en `CREDENTIAL_SCOPES`, `TOKEN_PREFIXES` y el patrón del token;
    - `--scope context` en `scripts/ingestion-credential.ts`;
    - para el agente, una tercera credencial.
- **(c) El alcance `ingest`**: quien escribió la conversación la lee. Descartada: contradice FR-API-03 y el brief-11.3, D-2 («una credencial de ingestión no lee»), y suma lectura de datos personales a la credencial que ya puede escribirlos.

### D-7 — Errores

- **Conversación inexistente, de otra organización o sin referencia**: `404 NOT_FOUND`, **sin distinguir** entre los casos, como un producto ajeno en la lectura v1.
- **`conversation_ref` ausente o inválida, o `limit` inválido**: `400 VALIDATION_ERROR`, con `fields` (`conversation_ref` o `limit`).
- El resto de los errores son los del borde de la lectura v1, sin cambios.

### D-8 — Log y privacidad

- El log registra la ruta **fija** `/api/read/v1/messages`, el código, la duración, la organización, el `source` y la correlación.
- **Nunca** registra la referencia de la conversación, el `limit`, un texto ni el token. La referencia la genera el emisor, y el CRM no puede comprobar que no traiga un teléfono.
- No es una decisión nueva: es la regla de la lectura v1 (§Log) aplicada a la ruta nueva. Se prueba igual.

### D-9 — Despliegue

- **(a)** Desplegar en la 12.4 y correr una prueba sintética del historial en staging.
- **(b) No desplegar en la 12.4.** **Recomendada.** La ruta llega a staging con el despliegue de la 12.5, que recorre el turno completo, historial incluido.
  - Un despliegue cuesta un backup, migraciones, build y las cinco comprobaciones, y el último dejó un `502` de 3 minutos (evidencia-12.3).
  - La 12.4 no tiene nada que solo staging pueda probar: el borde de lectura ya se validó allí en la 11.4, y el de ingestión v2, en la 12.3.2.
  - **Nivel que alcanza la 12.4: validado localmente y en CI**, y se dice.

### D-10 — Revisión independiente

- **Recomendación: sí**, al terminar, aunque la 12.4 no abre ni cierra un gate.
- **Motivo**: es la **primera lectura de servicio que devuelve datos personales**. Un agujero de aislamiento entre organizaciones o de alcance es el defecto más caro que puede dejar esta fase, y la regla del proyecto, medida en la 8.4, es que la autoevaluación no lo encuentra con fiabilidad.

### D-11 — Etapas

- **Una sola etapa**: la decisión de las memorias es documental y la lectura es chica. Si el usuario elige (A) en D-1, la 12.6 lleva su propio brief y esta subfase no cambia.

## Alcance incluido

1. **La decisión de D-1**, escrita:
   - en este brief;
   - en el Roadmap, con la enmienda fechada de C-1;
   - en IntegrationBoundaries, como parte del contexto del turno.
2. **La lectura del historial** (D-2 a D-8):
   - un servicio en `conversations` que devuelve los últimos N mensajes de una conversación, por organización, canal y referencia, sin conocer HTTP;
   - la ruta `GET /api/read/v1/messages` sobre `serveRead`;
   - el validador estricto de la respuesta en `src/app/api/read/v1/contract.ts`;
   - fixtures en `tests/fixtures/read/v1/`, con `"shape": "assumed"`.
3. **El alcance `context`**, si D-6 queda en (b): la migración `0024`, el esquema, las credenciales y el script.
4. **FR-API-08**, con su identificador en cada caso de test que lo prueba.
5. **Documentación**:
   - [read-v1](../contracts/read-v1.md): la ruta, el alcance y la evidencia;
   - FunctionalRequirements, TraceabilityMatrix, DataModel (el `CHECK` de alcances) e IntegrationBoundaries;
   - [Risks](../planning/Risks.md): la lectura que suma el historial por turno.
6. **La guarda de superficie expuesta**, con la ruta nueva.

## Alcance excluido

- **Construir memorias**: tabla, evento, ruta o pantalla (D-1).
- **Todo cambio al contrato de ingestión**, v1 o v2, y a sus respuestas.
- **Historial entre conversaciones**, o por cliente (D-2).
- **Paginación hacia atrás, o un cursor.** Si hace falta, es un parámetro opcional, compatible dentro de v1.
- **Cambios en la pantalla 9** o en cualquier otra pantalla.
- **Desplegar en staging** (D-9).
- **Tocar el repositorio del agente** o su instancia.
- **Retención y borrado de mensajes** (13.4).

## Archivos o componentes autorizados

- `src/modules/conversations/`: `repository.ts`, `service.ts`, `index.ts` y sus tests.
- `src/app/api/read/v1/messages/route.ts` y `handler.ts` (nuevos), `src/app/api/read/v1/contract.ts` y `contract.test.ts`.
- Si D-6 es (b):
  - `src/modules/ingestion/schema.ts`, `credentials.ts`, `index.ts` y sus tests;
  - `drizzle/0024_*.sql`, con `meta/_journal.json` y el snapshot;
  - `scripts/ingestion-credential.ts`.
- `tests/fixtures/read/v1/messages-*.json` (nuevos).
- `tests/integration/read-api.test.ts`, o un archivo nuevo `tests/integration/read-api-messages.test.ts`.
- `tests/e2e/read-api.spec.ts`: las cabeceras de `proxy.ts` sobre la ruta nueva.
- `tests/guards/exposed-surface.test.ts`.
- **Documentación**:
  - `docs/contracts/read-v1.md`;
  - `docs/product/FunctionalRequirements.md`;
  - `docs/architecture/TraceabilityMatrix.md`, `DataModel.md` e `IntegrationBoundaries.md`;
  - `docs/planning/Roadmap.md` y `docs/planning/Risks.md`;
  - `docs/decisions/README.md` y este brief.

Todo archivo fuera de esta lista se pide antes de tocarlo.

## Fuentes de verdad

1. El código y las migraciones: `conversations/repository.ts` (`findMessagesBefore`), `api/read/v1/serve.ts` e `ingestion/credentials.ts`.
2. [DataModel](../architecture/DataModel.md) §`messages`, §`conversations` e §`ingestion_credentials`.
3. [read-v1](../contracts/read-v1.md), [ingestion-v2](../contracts/ingestion-v2.md), [brief-11.3](brief-11.3-api-de-lectura.md) (D-2 a D-7), [brief-12.2](brief-12.2-conversacion-vigente-y-derivacion.md) (D-2 y D-3) y [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md).
4. El Roadmap, §Fase 12.
5. El documento de brechas del agente (`b75e484`), **solo como contexto de negocio**.

## Invariantes

- **Nunca los primeros N**: el historial trae los últimos N (criterio de aceptación de la Fase 12).
- **Aislamiento**: una credencial nunca lee una conversación de otra organización, y la respuesta no distingue «ajena» de «inexistente».
- **Una credencial, un alcance**: ninguna credencial de otro alcance lee el historial, y la del historial no lee otra superficie.
- **Solo lectura**: la ruta no escribe nada, tampoco en `audit_logs` ni en `ingestion_events`. Consume el límite de tasa como toda la lectura.
- **El log no lleva la referencia ni el texto** de ningún mensaje.
- **`conversations` no conoce HTTP**, y ningún módulo hace `JOIN` contra tablas ajenas.
- **Los mensajes sin tipo ni autor salen con `null`**, nunca con un valor inventado.

## Criterios de aceptación

- **AC-1 — Pregunta 3 contestada.** La opción aprobada en D-1 queda escrita en este brief, en el Roadmap (con la enmienda de C-1, si corresponde) y en IntegrationBoundaries. Si es (C), no se crea ninguna tabla, módulo ni ruta de memorias, y el `grep` de `memor` en `src/` y `drizzle/` no encuentra nada nuevo.
- **AC-2 — Los últimos N.** Con 30 mensajes y `limit=20`, la respuesta trae los mensajes 11 a 30, en orden ascendente. Sin `limit`, trae los últimos 20. Con `limit=50` y 30 mensajes, los 30. **Mutación M18**: si se invierte el orden de la consulta, el test falla.
- **AC-3 — Orden por la hora del mensaje.** Un mensaje insertado después pero con un `sent_at` anterior queda en su lugar. Dos mensajes con el mismo `sent_at` salen desempatados por `id`, de forma estable entre pedidos.
- **AC-4 — Forma.** Toda respuesta de éxito pasa el validador estricto: un campo de más o de menos es falla. Un mensaje de v1 sale con `kind` y `sent_by` en `null`, uno de v2, con sus valores, y una entrada, siempre con `sent_by: null`. Los fixtures pasan el validador y se declaran con forma asumida.
- **AC-5 — Aislamiento.** Leer la referencia de una conversación de otra organización da el mismo `404` que una referencia inexistente, con el mismo cuerpo salvo el `request_id`. Una conversación `closed` se lee. **Mutación M19**: si se quita el filtro de organización, el test falla.
- **AC-6 — Alcance.**
  - Una credencial de ingestión da `403` en la ruta.
  - Si D-6 es (b): una credencial `read` da `403` en el historial y una `context` da `403` en productos y en información del negocio. **Mutación M20**: si la ruta acepta `read`, el test falla.
  - Una sesión de usuario no autentica.
- **AC-7 — Borde.** Apagada responde `404` sin cuerpo; fuera de la allowlist, `403`; al pasar el límite, `429` con `Retry-After`. La correlación se devuelve. Con `conversation_ref` ausente, vacío, con un carácter de control o de 201 caracteres, y con `limit` 0, 51, `+5`, `05` o `abc`, responde `400` con su campo. En `next start`, la ruta lleva las cabeceras de `proxy.ts`.
- **AC-8 — Log.** Un pedido con una referencia y mensajes de texto conocidos deja una línea con la ruta fija, **sin** la referencia, sin ningún texto de los mensajes y sin el token. El `500` también queda en el log.
- **AC-9 — La consulta.** El plan capturado de la consulta, tal como la ejecuta la lectura, usa `messages_conversation_sent_idx` y corta con `LIMIT` en SQL: no lee todos los mensajes de la conversación.
- **AC-10 — Alcance `context`**, si D-6 es (b). La migración `0024` pasa de `ingest|read` a `ingest|read|context` sin tocar filas. Un `INSERT` con un alcance desconocido sigue fallando. El script crea una credencial `context` con prefijo `crm_ctx_`, y el token nunca se guarda.
- **AC-11 — Documentación.** FR-API-08 existe y cada caso de test que lo prueba lleva su identificador. read-v1, TraceabilityMatrix, DataModel, IntegrationBoundaries, Risks y la guarda de superficie están al día.
- **AC-12 — Verificación.** Pasan lint, tipos, formato, unitarios, guardas, integración y end-to-end completos en local, y la CI queda en verde en el commit.
- **AC-13 — Revisión independiente** (si D-10 se aprueba). Un agente que no participó revisa contra este brief, y cada hallazgo se verifica contra el código antes de aceptarse.

## Pruebas y evidencia requerida

- **Nivel esperado: validado localmente y en CI** (`deterministic`), contra PostgreSQL real. **No** en staging (D-9), y **no** en integración: ningún consumidor la usa todavía.
- Cada mutación (M18 a M20) se aplica, se ve fallar el test y se revierte. Queda registrada en los resultados.
- Toda revisión propia se declara autoevaluación.

## Condiciones de detención

- Si el usuario elige (A) en D-1 o (b) en D-2: se reescribe el brief antes de implementar.
- Si la lectura necesita un `JOIN` contra una tabla de otro módulo, o que `conversations` conozca HTTP.
- Si el plan no usa el índice existente y hace falta uno nuevo: se para y se decide, porque sería una migración que este brief no autoriza.
- Si algo obliga a cambiar el contrato de ingestión v2, o una respuesta existente de la lectura v1.
- Si una prueba necesita datos reales.
- Si aparece un archivo fuera de la lista autorizada.

## Decisiones del usuario durante la implementación

Del 2026-09-26, sobre los hallazgos H-1 y H-2 de abajo:

- **H-1: el renombre de `ingestion` se posterga**, con una enmienda fechada en DataModel. La deuda sigue registrada y se paga en su propia subfase, con su brief, fuera de la Fase 12.
- **H-2: la ampliación queda autorizada** para los cuatro archivos: `serve.ts`, los dos handlers existentes e `ingestion/repository.ts`.

## Resultados — implementación

**Autoevaluación** (`self_assessment: true`), del 2026-09-26. La revisión independiente (AC-13) todavía no se hizo.

### Hallazgos durante la implementación

- **H-1 — Deuda de nombre que vence con el tercer alcance.** [DataModel](../architecture/DataModel.md) §`ingestion_credentials` dice que la tabla y el módulo `ingestion` «se renombran cuando aparezca un tercer alcance, no antes». `context` es ese tercer alcance. El brief no lo vio: el paso 5 de la planificación reabrió DataModel buscando `messages`, no las credenciales. Renombrar queda fuera de la lista autorizada, así que **no se hizo**. La frase de DataModel queda sin tocar y se eleva al usuario.
- **H-2 — Cuatro archivos fuera de la lista autorizada**, tocados antes de pedirlos:
  - `src/app/api/read/v1/serve.ts`: el borde de la lectura tenía el alcance `read` fijo. Ahora cada ruta pasa el suyo (D-6);
  - `products/handler.ts` y `knowledge/handler.ts`: pasan `"read"` explícito, sin cambio de conducta;
  - `src/modules/ingestion/repository.ts`: tenía el tipo `"ingest" | "read"` escrito a mano. Ahora sale del esquema, y sin el cambio no compila.

  Se elevan al usuario para autorizarlos o revertirlos.
- **H-3 — El plan depende de la forma de los datos.** La primera versión del test de AC-9 usaba una conversación de 5000 mensajes sobre 15 000 de la organización, y todos eran los más recientes. En una corrida, el planificador recorrió `messages_organization_sent_idx` hacia atrás, filtrando por conversación, con `Incremental Sort`. En otra corrida usó el índice de la conversación. Con esa proporción, los dos caminos cuestan parecido.
  - El test pasó a la forma del caso real: 200 conversaciones de 50 mensajes, intercaladas en el tiempo. Así quedó estable en **seis corridas seguidas**.
  - **El caso de una conversación con una fracción grande de los mensajes de la organización queda sin medir.** Su costo está acotado por esa misma fracción. Corresponde a la 13.2, que mide planes con volumen.

  No hizo falta un índice nuevo, así que la condición de detención no se activó.

### Contraste por criterio

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | cumplido | D-1 en este brief, en la enmienda del Roadmap (§12.4) y en IntegrationBoundaries. `git diff` de `src/` y `drizzle/`: **0** líneas nuevas con `memor` |
| AC-2 | cumplido | `read-api-messages.test.ts` caso 1: 11 a 30 con `limit=20` y sin `limit`, 1 a 30 con 50, y el 30 con 1. M18 |
| AC-3 | cumplido | caso 2: el mensaje tardío queda en su lugar, y tres empates en el mismo microsegundo salen por id, igual en tres pedidos |
| AC-4 | cumplido | caso 3, con `toStrictEqual` sobre la respuesta entera; `contract.test.ts`: validador estricto y dos fixtures nuevos con forma asumida |
| AC-5 | cumplido | caso 4: el `404` de una conversación ajena y el de una inexistente son iguales salvo el `request_id`; la misma referencia en dos organizaciones; una cerrada y una vacía. M19 |
| AC-6 | cumplido | caso 5: `read` e `ingest` dan `403` en el historial, `context` da `403` en productos y en información del negocio, sin consumir el límite. Caso 12: una sesión válida no autentica; caso 13: una `context` no escribe por la ingestión v2 (los dos, por R-5 de la revisión). M20 |
| AC-7 | cumplido | casos 6 y 7, y `read-api.spec.ts` con la ruta nueva sobre `next start` |
| AC-8 | cumplido | caso 8: el log no trae la referencia (que tiene un teléfono sintético adentro), el texto ni los tokens; caso 9: el `500`, con una falla que cita la referencia (R-6). M21 |
| AC-9 | cumplido, con H-3 | caso 10: primera línea `Limit`, `messages_conversation_sent_idx` con `Index Cond` sobre `conversation_id`, sin `Seq Scan` |
| AC-10 | cumplido | `0024` solo cambia el `CHECK` (un `DROP` y un `ADD`, sin tocar filas); caso 11: crea una credencial `context` con `crm_ctx_`, y el `CHECK` rechaza `write`, `CONTEXT`, `ctx` y la cadena vacía; `credentials.test.ts`: el prefijo y los tres alcances |
| AC-11 | cumplido | FR-API-08 en los casos de test; read-v1, TraceabilityMatrix, DataModel, IntegrationBoundaries, Risks y la guarda de superficie al día |
| AC-12 | cumplido en local; la CI, con el commit | ver abajo |
| AC-13 | cumplido | revisión independiente del 2026-09-26: R1, 8 hallazgos menores, todos verificados y corregidos (ver abajo) |

### Mutaciones

Cada una se aplicó sobre una copia del archivo, se corrió `read-api-messages.test.ts`, y el archivo se restauró. `cmp` confirmó los dos archivos idénticos al original.

| Id | Mutación | Resultado |
|---|---|---|
| M18 | `findLatestMessages` ordena ascendente | fallan los casos 1, 2 y 3: devuelve los primeros N |
| M19 | `findConversationIdByExternalRef` sin el filtro de organización | fallan los casos 4 y 6: la credencial de A recibe `200` con `items: []` por una conversación de B, en vez del `404`. Revela que la conversación existe; no lee sus mensajes, porque `findLatestMessages` vuelve a filtrar por organización. Ese segundo filtro no tiene mutación propia (revisión independiente, R-7) |
| M20 | la ruta acepta el alcance `read` | fallan 10 de 11, el 5 entre ellos |
| M21 | el log registra el mensaje del error (agregada por R-6 de la revisión) | falla el caso 9: la referencia de la conversación aparece en el log. `src/shared/log/index.ts` se restauró y `git diff` lo da idéntico a `HEAD` |

### Verificación

- `lint`, `typecheck` y `format:check` limpios.
- Vitest completo: **1365 de 1365** en 98 archivos (antes 1345), después de las correcciones de la revisión.
  - Suma 13 casos de integración, 4 del contrato, 2 de fixtures y 1 de credenciales.
- Guardas: 296 de 296.
- End-to-end completos sobre un build nuevo: **100 de 100** (antes 99).
  - La primera corrida usó un build viejo, y el caso de la ruta nueva falló con el 404 HTML de Next. Se reconstruyó y se volvió a correr completo.
- **Nivel**: la lectura del historial queda **validada localmente** (`deterministic`) contra PostgreSQL real. No en staging (D-9) ni en integración.

### Revisión independiente (AC-13)

Del 2026-09-26, por un agente de solo lectura que no participó del trabajo, contra este brief y las reglas vigentes. **Veredicto: R1**, con 8 hallazgos menores, ninguno bloqueante ni mayor. Sobre aislamiento y alcance, no encontró ningún camino por el que una credencial lea mensajes de otra organización, distinga «ajena» de «inexistente», o por el que `read` o `ingest` lean el historial.

Cada hallazgo se verificó contra el código antes de aceptarlo. Se aceptaron los ocho:

| Id | Hallazgo | Corrección |
|---|---|---|
| R-1 | read-v1 decía que el contrato se valida con el agente en la 12.3, y el historial no llega a staging antes de la 12.5; «tres rutas» en el e2e; §Propósito sin el historial | estado y evidencia por ruta, «cuatro desde la 12.4» y el propósito ampliado |
| R-2 | FR-API-03 decía que toda la lectura exige `read` | precisión fechada: salvo el historial, que exige `context` |
| R-3 | Risks prometía contar las lecturas por turno en la 12.3, que no incluye el historial | el historial se cuenta en la 12.5 |
| R-4 | el caso 10 y el test de los tres alcances no llevaban `FR-API-08` | los dos lo llevan, y la matriz dice «casos 1 a 13» |
| R-5 | sin test de que la sesión no autentique el historial, ni de que `context` no escriba | casos 12 y 13 |
| R-6 | la aserción de privacidad del caso 9 no podía fallar: la falla iba en una consulta sin la referencia | la falla va en la consulta de `conversations` y su mensaje cita la referencia. M21 prueba que ahora puede fallar |
| R-7 | la descripción de M19 exageraba: sin el primer filtro, A recibe `200` vacío, no los mensajes de B | descripción corregida; el segundo filtro queda sin mutación propia, declarado |
| R-8 | el caso desfavorable del plan (H-3) solo estaba en este brief | agregado a la entrada de la 13.2 del Roadmap |

**Lo que la revisión no pudo verificar sin ejecutar**: las corridas, la CI y la estabilidad del plan en seis corridas. Las corridas están en §Verificación. La CI se registra con el commit.

**CI de la subfase 12.4**: commit `225b35a`, run 36337842640, `success` en el intento 1. Queda **validada localmente y en CI**.

## Cierre de la subfase 12.4, 2026-09-27

1. **Confirmación**: el usuario confirmó el cierre el 2026-09-27 («Confirmo cierre junto con commit y push»), después de la CI en verde.
2. **Criterios**: AC-1 a AC-13 cumplidos. AC-12 se completa con la CI de `225b35a`; AC-13, con la revisión independiente.
3. **Pregunta 3 de las brechas contestada** (B-10): las memorias tienen dueño en el CRM y las genera el emisor, pero no se construyen en la Fase 12 (D-1 C, enmienda C-1 del Roadmap).
4. **Nivel**: validado localmente y en CI (`deterministic`, datos sintéticos). **No** se certifica nada en staging, porque la 12.4 no desplegó (D-9). Tampoco compatibilidad con un consumidor real: los fixtures del historial tienen forma asumida, y el agente lo consume recién en la 12.5.
5. **Revisión independiente**: hecha (AC-13). R1, 8 hallazgos menores, todos verificados y corregidos.
6. **Decisiones del usuario durante la implementación**: H-1, el renombre de `ingestion` se posterga con una enmienda en DataModel; H-2, cuatro archivos más en la lista (`serve.ts`, los handlers de productos y de información, y `ingestion/repository.ts`).
7. **Lo que queda abierto**:
   - **a la 13.2**: el plan del historial de una conversación que concentra gran parte de los mensajes de su organización (H-3, R-8);
   - **a la 12.5**: contar las lecturas por turno con el historial contra el presupuesto de `context`, y validar el historial con el agente;
   - **la migración `0024`** no está en staging; se aplica con el próximo despliegue;
   - **el segundo filtro por organización** de la lectura de mensajes no tiene mutación propia (R-7).
