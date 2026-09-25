---
schema: task-brief.v1
task_id: "12.2"
task_type: implementation
generated_at: 2026-09-25
---

# Brief: 12.2 — Conversación vigente y derivación

**Estado: aprobado el 2026-09-25 por el usuario, con las recomendaciones de D-1 a D-11 y las de C-1 y C-2**: la ventana de vigencia es de 24 horas (D-3), «Escalada a humano» es `pending` (D-4) y los rechazos de negocio de los tipos nuevos usan solo `422` (C-2). La aprobación no autoriza commits, pushes ni despliegues: se piden en su turno.

## Objetivo

Que un servicio autenticado pueda registrar el mensaje entrante de un cliente **en su conversación vigente, o en una nueva si no tiene**, con la regla de vigencia modelada en el CRM y no copiada del emisor. Y que pueda **derivar una conversación a una persona**, con un cambio de estado auditado con el actor de servicio de la 12.1.

Resultado verificable: dos mensajes del mismo cliente dentro de la ventana de vigencia quedan en la misma conversación, y uno fuera de ella abre otra. Un pedido de derivación deja la conversación en el estado acordado, con una fila de auditoría firmada por la credencial.

## Situación en la fase

- **Necesario ahora (12.2)**: la conversación vigente (B-4), quién genera `external_ref`, y la derivación (B-5). Las preguntas 1 y 2 de las brechas se contestan acá ([Roadmap](../planning/Roadmap.md) §Fase 12; [brief-10](brief-10-evaluacion-del-mvp.md) §Resultados de la 10.3).
- **Lo usan las subfases siguientes**: la 12.3 (contrato v2: tipo y autor del mensaje, validación con el emisor real) y la 12.4 (historial de los últimos N) trabajan sobre la conversación que esta subfase resuelve.
- **Antes de producción, no acá**: la disponibilidad (13.3) y la retención (13.4).

## Contexto de negocio

Leído del documento de brechas del usuario (repositorio del agente, commit `b75e484`), **solo como contexto**, nunca como dependencia técnica:
- **Hoy** el emisor reutiliza la conversación «activa» del cliente mientras no venza, y si no hay una, la crea. La regla de vencimiento vive en el emisor. **El Roadmap nombra como riesgo copiarla**, así que este brief no la toma como fuente: la regla se diseña desde el modelo del CRM (D-3).
- **Hoy** la derivación marca la conversación como «Escalada a humano».

En el CRM:
- `conversations.status` es `open`, `pending` o `closed` (FR-CONV-03). `pending` no tiene significado escrito: solo el rótulo «Pendiente».
- `message.recorded` busca la conversación por `(organization_id, channel, conversation.external_ref)`, que **genera el emisor**. Si no existe, la crea con ese mensaje. No cambia el estado y nunca reabre una `closed` ([ingestion-v1](../contracts/ingestion-v1.md) §Proyección).
- Una conversación **nace con su primer mensaje** (brief-6.5.1, D-2), y `started_at` coincide con el primer `sent_at` (DataModel, regla que garantizan los productores).
- Ninguna pantalla muestra la auditoría de una conversación. El cambio de estado de un `admin` se audita (6.3) pero no se lee.

## Hallazgo antes de diseñar (paso 5 de la planificación)

**C-1 — El contrato v1 excluye los cambios de estado.** [ingestion-v1](../contracts/ingestion-v1.md) §Evento `message.recorded` dice «Fuera de v1: … cambios de estado de la conversación». La derivación es exactamente eso. Al mismo tiempo, §Versionado dice que «agregar un `event_type` nuevo» es compatible dentro de v1, y la 12.1 lo usó así con `client.resolved`.
- Las dos frases no se contradicen del todo: «Fuera de v1» describía el alcance que se diseñó en la 6.5.1, no una prohibición. Pero **leerla así es una interpretación**, y no la resuelvo sola. Se decide en D-6.

**C-2 — Dos códigos de error nuevos en el contrato.** La tabla de errores de v1 no tiene `BUSINESS_RULE_VIOLATION` (`422`) ni `NOT_FOUND` (`404`), y §Versionado manda a v2 «cambiar … respuestas». D-6 y D-7 los necesitan **solo para los tipos nuevos**: `message.recorded` y `client.resolved` no los devuelven nunca.
- Es la misma interpretación que la 12.1 aprobó para la respuesta de `client.resolved`: una respuesta propia de un tipo nuevo no cambia las existentes. **Es parte de lo que se aprueba.**
- **Choque a resolver**: el endpoint apagado ya responde `404` **sin cuerpo**. Un `NOT_FOUND` de negocio lleva cuerpo con `code`, así que el emisor los distingue por el cuerpo. **Alternativa**: usar `BUSINESS_RULE_VIOLATION` con regla `conversation_not_found` y dejar el `404` solo para el endpoint apagado. **Recomiendo la alternativa**: un `404` ambiguo es exactamente lo que confunde a un emisor real.

## Decisiones previas (las decide el usuario al aprobar)

Cada una lleva mi recomendación. **Si el usuario elige otra opción en D-1 o D-6, el brief se reescribe antes de aprobarse.**

### D-1 — Cómo se resuelve la conversación vigente

- **(A) Evento nuevo del contrato v1, `conversation.resolved`, que trae el mensaje entrante.** **Recomendada.**
  - El CRM busca la conversación vigente del cliente (D-3). Si la hay, registra el mensaje en ella. Si no, crea una nueva **con ese mensaje**, así que la conversación sigue naciendo con su primer mensaje y `started_at` no cambia de regla.
  - Responde con la conversación (D-5), para que el emisor registre después las salidas con `message.recorded`.
  - Todo en una transacción, con la reserva en el ledger, como `message.recorded`.
- **(B) `conversation.resolved` sin mensaje**, que crea una conversación vacía si no hay vigente. Descartada:
  - rompe «nace con su primer mensaje» (6.5.1, D-2) y deja `started_at` sin su primer mensaje;
  - si el emisor falla antes de registrar el mensaje, queda una conversación fantasma que las métricas 1 y 10 cuentan.
- **(C) Solo lectura** de la conversación vigente, y el emisor la crea con `message.recorded`. Descartada: la decisión de crear queda en el emisor, y dos mensajes simultáneos del mismo cliente sin conversación vigente crean dos.

### D-2 — Quién genera `external_ref`

- **Recomendación: el emisor, siempre. El CRM decide si se usa.**
  - `conversation.resolved` trae `conversation.external_ref` como **referencia propuesta**, opaca y estable entre reintentos. Solo se usa si el CRM crea la conversación. Si hay una vigente, se ignora y la respuesta trae la referencia de la vigente.
  - El emisor usa **la referencia de la respuesta** para las salidas con `message.recorded`.
  - Así no cambia la semántica de `external_ref` («referencia del sistema origen», DataModel) ni la de `message.recorded`.
- **Descartado**: que el CRM genere la referencia. Mezclaría en la misma columna referencias del emisor y del CRM.

### D-3 — Cuándo vence una sesión (pregunta 2)

- **Recomendación**: la conversación vigente de un cliente en un canal es **la más reciente con estado `open` o `pending` cuyo último mensaje tenga como mucho 24 horas** respecto del `sent_at` del mensaje nuevo.
  - **Se mide contra el `sent_at` del mensaje, no contra la hora de recepción**: la decisión no depende de cuánto tarde la entrega.
  - **Una `closed` nunca es vigente**, igual que hoy ningún mensaje la reabre.
  - **24 horas** es la ventana de atención de la Cloud API de WhatsApp ([IntegrationBoundaries](../architecture/IntegrationBoundaries.md), §Conocimiento transversal), no una regla del emisor. **El valor lo decide el usuario**: es una regla de negocio.
  - **Constante en el código**, no configurable por organización. Si un negocio necesita otra, se agrega la columna con su brief.
- **La conversación vencida no se toca**: no se cierra sola. Cerrarla sería un cambio de estado de servicio que nadie pidió, y una `pending` vencida perdería la señal de que espera a una persona. El vencimiento se deriva, no se guarda.

### D-4 — Qué equivale a «Escalada a humano» (pregunta 1)

- **(A) `pending`, con significado escrito: «espera a una persona».** **Recomendada.**
  - Sin migración ni estado nuevo. La métrica 11, los filtros y las pantallas ya lo muestran.
  - FR-CONV-03 y DataModel escriben el significado, con fecha.
  - **Costo**: si mañana el negocio necesita otro «pendiente» (por ejemplo, «esperando al cliente»), hará falta un estado nuevo con su brief.
- **(B) Un estado nuevo, `escalated`.** Descartada por ahora: `ALTER TYPE … ADD VALUE`, cambia la métrica 11 (devuelve los estados del dominio en orden, con `0` explícito), los filtros, los rótulos, el dashboard y sus tests. Todo eso para un significado que `pending` puede tener sin costo.

### D-5 — Respuesta de `conversation.resolved`

- **Recomendación**: `200` con `{ "contract_version", "result": "accepted" | "duplicate", "event_id", "conversation": { "external_ref", "status" } }`.
  - **Sin el id interno ni el teléfono.** El emisor identifica la conversación por su referencia, como en `message.recorded`.
  - **Sin `created`**: `ingestion_events` no guarda resultados (6.5.1, D-5), así que un reenvío no podría responderlo igual.
- **Reenvío** (mismo `event_id` y mismo hash): responde `duplicate` con la conversación que contiene el mensaje del evento, buscado por su `external_ref` entre las conversaciones del cliente. **Un reenvío nunca crea ni registra.**

### D-6 — Cómo entra la derivación, y C-1

- **(A) Evento nuevo del contrato v1, `conversation.escalated`**, que lleva la conversación por su `external_ref` y `channel`. **Recomendada**, con **una nota fechada en ingestion-v1, junto a «Fuera de v1»**: «Fuera de v1» describe el alcance de la 6.5.1, y agregar un tipo sigue siendo compatible según §Versionado. Es la misma interpretación que la 12.1 aprobó para `client.resolved`.
  - Pone la conversación en `pending` (D-4) y audita `status_change` con la credencial como actor (FR-AUD-03).
  - **Ya `pending`**: no escribe ni audita, y responde `accepted`.
  - **`closed`**: se rechaza con `BUSINESS_RULE_VIOLATION`, regla `conversation_closed`, y el evento queda `failed`, como los demás rechazos de negocio. El CRM no reabre por servicio.
  - **Conversación inexistente**: `BUSINESS_RULE_VIOLATION`, regla `conversation_not_found`, registrado como `failed` (C-2).
  - Respuesta: `200` con `{ "contract_version", "result", "event_id", "conversation": { "external_ref", "status" } }`.
- **(B) La derivación va en el contrato v2**, en la 12.3. Descartada: la 12.3 depende de la 12.2, y la derivación quedaría para después del contrato que la tendría que usar.
- **(C) Un evento genérico `conversation.status_changed`** con el estado destino. Descartado: le daría al servicio la capacidad de cerrar o reabrir conversaciones, que nadie pidió.

### D-7 — Cliente del evento

- **`conversation.resolved` exige que el teléfono sea de un cliente de la organización**, activo o no. Si no lo es, `BUSINESS_RULE_VIOLATION`, regla `client_not_found`, registrado como `failed`. El emisor resuelve antes el cliente con `client.resolved` (12.1).
  - **Por qué**: una conversación sin cliente no tiene teléfono, así que no se le puede calcular la vigencia.
- **Un cliente inactivo** recibe su conversación como cualquier otro. El CRM informa y no actúa (12.1, D-7).

### D-8 — Dos mensajes simultáneos del mismo cliente

- **Recomendación**: la resolución **bloquea la fila del cliente** (`FOR UPDATE`) antes de buscar la vigente, con una función de `crm` que recibe la transacción, como `lockProductForStockChange` de `catalog`. Sin `JOIN`: `conversations` pide el cliente a `crm` y busca sus conversaciones en su propia tabla.
- Dos mensajes simultáneos sin vigente dejan **una sola conversación con los dos mensajes**. Se prueba con el bloqueo retenido desde una tercera conexión, las esperas comprobadas en `pg_stat_activity` y una corrida sin el bloqueo.

### D-9 — Métrica 12

- La métrica cuenta los fallos de ingestión de mensajes. Desde la 12.1 excluye `client.resolved`.
- **Recomendación**:
  - `conversation.resolved` **cuenta**, porque registra un mensaje, y su fallo es la pérdida de un mensaje;
  - `conversation.escalated` **no cuenta**, porque no es un mensaje.
- MetricsCatalog se actualiza, con un caso por tipo y una corrida de mutación.

### D-10 — Datos, despliegue y etapas

- **Datos sintéticos y sin despliegue**, como toda la Fase 12 (brief-12.1, D-2). La subfase termina validada localmente y en CI.
- **12.2.1**: `conversation.resolved` (D-1, D-2, D-3, D-5, D-7, D-8 y la parte de D-9 que le toca).
- **12.2.2**: `conversation.escalated` (D-4, D-6 y el resto de D-9).
- La 12.2.2 no empieza sin la CI de la 12.2.1 en verde.

### D-11 — Revisión independiente

La 12.2 no abre ni cierra un gate, así que la revisión es opcional.
- **Recomendación: hacerla igual**, al final de la 12.2.2. Amplía el contrato externo otra vez, agrega concurrencia sobre un bloqueo nuevo y cambia una métrica. En la 12.1 encontró dos mayores que la autoevaluación no vio.

## Alcance incluido

**12.2.1**
- `conversation.resolved` en el contrato v1: esquema estricto (canal, teléfono, referencia propuesta y el mensaje entrante, sin `direction`, porque siempre es `inbound`), validador, `payload_hash`, vector de prueba y fixtures con `"shape": "assumed"`.
- Caso de uso en `conversations`, llamado por `ingestion` con su transacción: bloquea el cliente vía `crm`, busca la vigente (D-3), registra el mensaje en ella o crea la conversación con ese mensaje.
- En `crm`: una función que bloquea y devuelve el cliente de un teléfono dentro de la transacción recibida.
- El handler responde según D-5. `logEvent` sin teléfono ni texto.
- Métrica 12: `conversation.resolved` cuenta (D-9).
- FR-API-05 (conversación vigente) en FunctionalRequirements, y su fila en TraceabilityMatrix.

**12.2.2**
- `conversation.escalated` en el contrato v1, con su esquema, validador, vector y fixtures.
- Caso de uso en `conversations` que pone `pending` y audita con el actor de servicio.
- Métrica 12: `conversation.escalated` no cuenta (D-9).
- FR-API-06 (derivación), la nota fechada de C-1 en el contrato, el significado de `pending` en FR-CONV-03 y DataModel (D-4), y su fila en TraceabilityMatrix.

## Alcance excluido

- `message.recorded` y `client.resolved`: ni su forma ni su proyección.
- Cerrar, reabrir o vencer conversaciones por servicio (D-3, D-6).
- Una columna o configuración de vigencia por organización (D-3).
- Un estado nuevo de conversación (D-4).
- Mostrar la auditoría de una conversación en pantalla. Ninguna pantalla la lee hoy, y agregarla es su propio brief.
- El tipo y el autor del mensaje (12.3) y el historial (12.4).
- Despliegue a staging y datos no sintéticos (D-10).
- El repositorio del agente, Airtable y cualquier cosa de ERP.

## Archivos o componentes autorizados

Lista cerrada. Tocar otro archivo es un hallazgo bloqueante, salvo ampliación autorizada por el usuario y registrada acá.

**12.2.1**
- `src/modules/ingestion/`: `contract.ts`, `contract.test.ts`, `service.ts`, `service.test.ts` e `index.ts`
- `src/modules/conversations/`: `service.ts`, `repository.ts`, `index.ts` y sus tests unitarios
- `src/modules/crm/`: `service.ts`, `repository.ts` e `index.ts`, solo para el bloqueo del cliente
- `src/modules/analytics/repository.ts`
- `src/app/api/ingestion/v1/events/handler.ts`
- `tests/fixtures/ingestion/v1/` (fixtures nuevos)
- `tests/integration/conversation-resolution.test.ts` (nuevo), `tests/integration/ingestion-http.test.ts` y `tests/integration/analytics-ingestion.test.ts`
- `docs/contracts/ingestion-v1.md`, `docs/analytics/MetricsCatalog.md`, `docs/product/FunctionalRequirements.md` y `docs/architecture/TraceabilityMatrix.md`

**12.2.2**
- Los mismos de `ingestion`, `conversations`, `analytics` y el handler
- `tests/fixtures/ingestion/v1/`, `tests/integration/conversation-escalation.test.ts` (nuevo), `ingestion-http.test.ts` y `analytics-ingestion.test.ts`
- Los mismos documentos, más `docs/architecture/DataModel.md` (el significado de `pending` junto a la columna `status`). No hay glosario en el repositorio: el significado va en FR-CONV-03 y en DataModel.

**Las dos etapas**: este brief, `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md`, al cerrar.

## Fuentes de verdad

- [ingestion-v1](../contracts/ingestion-v1.md): §Formato, §Proyección y §Versionado.
- [DataModel](../architecture/DataModel.md): `conversations`, `messages`, `audit_logs` y `ingestion_events`.
- [Overview](../architecture/Overview.md): sin `JOIN` entre módulos; `conversations` depende de `crm`.
- [MetricsCatalog](../analytics/MetricsCatalog.md): métricas 1, 10, 11 y 12.
- [brief-6.5.1](brief-6.5.1-contrato-de-ingestion.md) (D-2 y D-5), [brief-6.5.2](brief-6.5.2-registro-idempotente-y-proyeccion.md) y [brief-12.1](brief-12.1-actor-de-servicio-y-cliente-por-telefono.md).
- [Roadmap](../planning/Roadmap.md) §Fase 12.

## Invariantes

- Una conversación nace con su primer mensaje. `started_at` es el menor `sent_at`, y `last_message_at` el mayor.
- Una `closed` nunca se reabre ni recibe un mensaje nuevo por `conversation.resolved`.
- `conversation.resolved` nunca crea una conversación si el cliente ya tiene una vigente en ese canal. *(`message.recorded` sigue creando por la referencia del emisor, sin mirar la vigencia: no cambia, AC-2.)*
- Todo cambio de estado de servicio se audita con la credencial como actor, y solo si cambió.
- Un reenvío nunca produce una segunda escritura.
- Ni los logs ni las respuestas llevan el teléfono ni el texto del mensaje.
- La organización sale de la credencial, nunca del payload.
- Sin referencias a Airtable ni al repositorio del agente.

## Criterios de aceptación

**12.2.1 — `conversation.resolved`**

- **AC-1**: el contrato documenta el evento con su tabla de campos, sus reglas, su respuesta (D-5), su vector y su `payload_hash`. El validador es estricto y rechaza NUL, UTF-16 inválido y `direction`. Los fixtures declaran `"shape": "assumed"`.
- **AC-2**: `message.recorded` y `client.resolved` no cambian: sus vectores dan el mismo hash y sus tests pasan sin tocar ninguna aserción.
- **AC-3**: sin conversación vigente, se crea una con la referencia propuesta, `status = 'open'` y el mensaje, y `started_at = last_message_at = sent_at`. Con una vigente, el mensaje entra en ella, la referencia propuesta se ignora y la respuesta trae la de la vigente.
- **AC-4**: la vigencia (D-3) con bordes calculados a mano: exactamente 24 horas (vigente), 24 horas y 1 milisegundo (no vigente), una `pending` dentro de la ventana (vigente), una `closed` dentro de la ventana (no vigente), dos candidatas (la más reciente) y un mensaje que llega desordenado.
- **AC-5**: un reenvío responde `duplicate` con la misma conversación, sin otro mensaje. Con el mismo `event_id` y otro contenido, `CONFLICT`. Un teléfono sin cliente da `422` con `client_not_found`, registrado como `failed`, sin escribir la conversación. El contrato agrega la fila de `422` a la tabla de errores (C-2).
- **AC-6**: dos resoluciones simultáneas del mismo cliente sin vigente dejan una conversación con los dos mensajes. Se prueba con el bloqueo retenido desde una tercera conexión y las esperas comprobadas en `pg_stat_activity`, más una corrida sin el bloqueo que falla.
- **AC-7**: por HTTP rige la cadena de `message.recorded`: modo de prueba, credencial, alcance `ingest` (`read` da `FORBIDDEN`), allowlist y límite compartido. El log no lleva el teléfono ni el texto.
- **AC-8**: aislamiento. La conversación vigente de otra organización con un cliente del mismo teléfono no se usa.
- **AC-9**: métrica 12: un `conversation.resolved` fallido cuenta, con su corrida de mutación.

**12.2.2 — `conversation.escalated`**

- **AC-10**: el contrato documenta el evento y la nota fechada de C-1. Validador estricto, vector, `payload_hash` y fixtures con forma asumida.
- **AC-11**: una conversación `open` pasa a `pending`, con una fila `status_change` cuyo actor es la credencial y cuyo `diff` es `{ before: { status: "open" }, after: { status: "pending" } }`. Una `pending` no escribe ni audita. Una `closed` da `conversation_closed`, y una inexistente `conversation_not_found`, las dos con `422`, registradas como `failed` y sin escribir. El contrato agrega la fila de `422` a la tabla de errores, solo para los tipos nuevos (C-2).
- **AC-12**: un reenvío no audita otra vez. Con otro contenido, `CONFLICT`.
- **AC-13**: por HTTP, la misma cadena que AC-7. Aislamiento: la conversación de otra organización con la misma referencia no se toca.
- **AC-14**: métrica 12: `conversation.escalated` no cuenta, con su corrida de mutación.
- **AC-15**: FR-CONV-03 escribe el significado de `pending`, con fecha. FR-API-05 y FR-API-06 están en FunctionalRequirements y en TraceabilityMatrix.

**Las dos etapas**

- **AC-16**: cada caso nuevo lleva en su nombre el identificador del requisito que prueba, incluidos los de los fixtures, o la salvedad escrita (la de R-3 de la 12.1).

## Pruebas y evidencia requerida

- **Nivel: `deterministic`**, o sea validado localmente y en CI, con requests sintéticos.
- **No se certifica** compatibilidad con ningún emisor real: eso es la 12.3.
- Por etapa: `npm run lint`, `npm run typecheck`, formato, `npm run test`, `npm run build` y `npm run test:e2e`, más la CI del commit leída por `headSha` y `conclusion`.
- Cada corrida de mutación se registra en este brief con su salida, incluida la que no tenga efecto.

## Condiciones de detención

- Antes de cualquier commit, push, merge o despliegue.
- Antes de ejecutar migraciones contra una base que no sea la local o la de test. **No se prevé ninguna migración.** Si aparece una, se detiene y se pregunta.
- Antes de instalar cualquier dependencia (no se prevé ninguna).
- Si la resolución exige cambiar algo de `message.recorded` o de `client.resolved`.
- Si el bloqueo de D-8 choca con una regla de frontera o con una guarda.
- Si hace falta tocar un archivo fuera de la lista.
- Antes de cambiar estados en Notion sin la confirmación del usuario.

## Resultados — etapa 12.2.1

**Autoevaluación** (`self_assessment: true`), del 2026-09-25. La revisión independiente es la de D-11, al final de la 12.2.2.

### Decisiones de implementación

1. **Qué guarda `error_code` en un rechazo de negocio**: el código de la taxonomía, `BUSINESS_RULE_VIOLATION`, como dice DataModel. La regla no se guarda: un reenvío la deduce del tipo, porque `conversation.resolved` tiene una sola (`client_not_found`). **Queda abierto para la 12.2.2**: `conversation.escalated` tiene dos reglas (`conversation_closed` y `conversation_not_found`), así que la regla ya no se deduce del tipo. Antes de implementarla hay que decidir dónde se guarda. Se eleva al usuario al empezar la etapa.
2. **La conversación vigente exige `external_ref`**: una conversación sin referencia, como las de los seeds, no es candidata, porque el emisor no podría seguir usándola con `message.recorded`.
3. **Una referencia propuesta que ya es de otra conversación** (vencida, cerrada o de otro cliente) responde `CONFLICT`, registrado como `failed`, sin escribir. El brief no lo previó: es la unicidad de `(organization_id, channel, external_ref)`, que la conversación nueva no puede saltear. El contrato lo documenta en §Errores.
4. **El reenvío busca el mensaje por su referencia** entre las conversaciones del cliente del teléfono, con un `JOIN` dentro del mismo módulo. Si el teléfono ya no es de ningún cliente, responde `conversation: null`, como `client.resolved`.
5. **Registrar un mensaje no audita nada**, igual que `message.recorded`: no cambia ningún estado.

### Fuera de la etapa, registrado

- **DataModel**: las reglas del ledger (líneas 318 y 319) no mencionan `conversation.resolved`, y lo que dicen del reenvío queda incompleto para él. DataModel está en la lista de la 12.2.2 y no en la de la 12.2.1, así que **se corrige en la 12.2.2**. Es la clase de hallazgo que la revisión de la 12.1 marcó como R-4.
- **§Evidencia de ingestion-v1** seguía diciendo «seis resoluciones simultáneas» y «casos 15 a 17» para `client.resolved`, cosa que la corrección de R-1 de la 12.1 volvió falsa. Se corrigió acá, porque el archivo está en la lista.

### Contraste por criterio

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | cumplido | El contrato documenta el evento, su tabla, su respuesta y su vector escrito a mano (`d6e436aa…`, calculado sobre el texto canónico y comparado con el del validador). `contract.test.ts`: 7 casos nuevos y 3 fixtures con `"shape": "assumed"` (2 válidos con su `payload_hash` y 1 inválido). Rechaza NUL, UTF-16 inválido, `direction`, el teléfono nulo o no canónico, la referencia con espacios y los campos desconocidos. |
| AC-2 | cumplido | Los vectores de `message.recorded` (`529004aa…`) y `client.resolved` (`69779577…`) no cambiaron, y sus tests pasan sin tocar ninguna aserción. `contract.test.ts` solo agregó un bloque. |
| AC-3 | cumplido | `conversation-resolution.test.ts`: la conversación nueva con la referencia propuesta, `open`, el cliente, las dos fechas en el `sent_at` y el mensaje `inbound`; con una vigente, el mensaje entra en ella, se ignora la propuesta y se amplían las fechas. |
| AC-4 | cumplido | Bordes calculados a mano: 24 horas exactas vigente y 24 horas y 1 ms no (con la vencida intacta y `open`), la `pending` vigente que sigue `pending`, la `closed` a un minuto que no se reabre, la más reciente de dos candidatas con una tercera sin referencia descartada, y un mensaje desordenado que adelanta `started_at`. **M2**: con `>` en lugar de `>=`, falla el caso del borde. **M3**: con `closed` entre los estados vigentes, falla el caso de la cerrada. |
| AC-5 | cumplido | Reenvío `duplicate` con la misma conversación y sin otro mensaje; `conversation: null` si el teléfono ya no es de nadie; `CONFLICT` con otro contenido; `client_not_found` registrado como `failed` y **terminal**: el reenvío responde lo mismo aunque el cliente ya exista. Más los dos `CONFLICT` de la decisión 3. |
| AC-6 | cumplido | Una tercera conexión bloquea al cliente, **2 esperas comprobadas en `pg_stat_activity`**, y al soltarla queda una conversación con los dos mensajes y las dos respuestas con la misma referencia. **M1**: sin el `FOR UPDATE`, quedan **2 conversaciones**. La espera en `pg_stat_activity` se cumplió igual, porque la clave foránea hacia `clients` también espera al `FOR UPDATE` retenido. Por eso el test afirma el resultado y no solo la espera, como advierte la nota del vault sobre este patrón. |
| AC-7 | cumplido | `ingestion-http.test.ts` casos 19 a 22: `200` con referencia y estado, sin id, teléfono ni texto, también al reenvío; `422` con `rule` y con cuerpo, distinto del `404` sin cuerpo del endpoint apagado; `401`, `403` para la credencial `read` y la que está fuera de la allowlist; límite compartido (`429`); log sin teléfono ni texto, con códigos `BUSINESS_RULE_VIOLATION` y `OK`. **M5**: con el teléfono en la respuesta, el caso 19 falla. |
| AC-8 | cumplido | La vigente de otra organización con un cliente del mismo teléfono no se usa ni recibe el mensaje. |
| AC-9 | cumplido | `analytics-ingestion.test.ts`: un `conversation.resolved` fallido da total 8 y fallidos 6, calculados a mano sobre el fixture de la 7.3 (7 y 5), con el grupo `BUSINESS_RULE_VIOLATION`. **M4**: excluyéndolo, el total da 7. |
| AC-16 | cumplido, con la salvedad de la 12.1 | Los casos nuevos llevan FR-API-05 en su nombre. Los 3 fixtures corren con el `it.each` compartido, que los nombra por archivo (R-3 de la 12.1). |

### Verificación de la etapa

- `lint`, `typecheck` y `format:check`: 0.
- `npm run test`: **1240 de 1240 en 93 archivos**. Son los 1209 de la 12.1 más 31: 10 de `contract.test.ts`, 16 de `conversation-resolution.test.ts`, 4 de HTTP y 1 de la métrica 12.
- `npm run build`: 0.
- `npm run test:e2e`: **98 de 98**.
- **Mutaciones**: M1 a M5, las cinco detectadas y restauradas. Se verificó con `grep` que no quedó ninguna en el código.

**Nivel**: validado localmente (`deterministic`, requests sintéticos). **No** se certifica compatibilidad con ningún emisor real: eso es la 12.3. Falta la CI del commit de la etapa.
