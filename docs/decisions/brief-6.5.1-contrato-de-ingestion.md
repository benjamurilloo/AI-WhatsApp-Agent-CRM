---
schema: task-brief.v1
task_id: 6.5.1
task_type: design
generated_at: 2026-09-16
---

# Brief: 6.5.1 — Contrato de ingestión y validación

## Objetivo

Fijar el contrato de ingestión v1 (FR-CONV-04 y 05) antes de escribir su lógica:

1. **`docs/contracts/ingestion-v1.md`**: transporte, forma del evento, nulabilidad, invariantes, identidad e idempotencia, algoritmo de `payload_hash`, respuestas y taxonomía de errores.
2. **Validación ejecutable del payload** en `src/modules/ingestion/`: un esquema `zod` y el cálculo de `payload_hash`, puros, sin base de datos ni HTTP.
3. **Fixtures sintéticos** del contrato, marcados como **forma asumida, no verificada** (TestingStrategy).

Nivel esperado: **validado localmente** (`deterministic`) para la validación y el hash. El contrato queda **diseñado** en lo que toca a la reserva en el registro (6.5.2) y a la credencial de servicio (6.5.3). Ningún emisor real lo ejercita, y ninguna afirmación de compatibilidad con un emisor sale de esta subfase.

## Ubicación en la Fase 6

- **Orden previsto**: 6.1 a 6.4 (cerradas) → **6.5.1** → 6.5.2 (registro idempotente y proyección sobre `conversations` y `messages`) → 6.5.3 (autenticación de servicio y límite de tasa) → cierre de la Fase 6.
- **Notion**: "S. docs/contracts/ingestion-v1.md con invariantes, nulabilidad y taxonomía de errores. Fixtures marcados como forma asumida, no verificada." Estado: "Bandeja de Entrada". La tarea madre 6.5 dice "sin conexión a ningún emisor real".
- **Necesario ahora**: el contrato, el validador, el hash, los fixtures y sus tests.
- **Lo que llega después**:
  - el Route Handler, la reserva atómica, los reenvíos y la proyección (6.5.2);
  - la credencial de servicio, la verificación de `Origin` si aplica, y el límite de tasa (6.5.3);
  - la métrica 12 (Fase 7).
- **Requisito antes de producción**, fuera de esta fase: validar el contrato y la autenticación con tráfico real del emisor, en el proyecto de integración (Risks).
- **Gates de entrada**:
  1. 6.4 cerrada, con la CI en verde en `3904548`; el cierre `c43450f` pasó en su segundo intento.
  2. La CI del arreglo del caso 9 de `clients.spec.ts` (`8d8c34f`) en verde. Se verifica antes de implementar.

## Hallazgos de la verificación previa (2026-09-16)

1. **No existe `docs/contracts/`.** Roadmap lo pide como entregable de la Fase 6.
2. **IntegrationBoundaries** fija:
   - la identidad `(organization_id, source, external_ref)`;
   - el registro antes de proyectar;
   - una credencial de servicio distinta de la sesión humana;
   - el versionado explícito;
   - `external_ref` estable entre reintentos y nunca armado con teléfono ni contenido.

   El nombre del endpoint (`POST /api/ingestion/events`) es indicativo.
3. **FR-CONV-04**: reenviar el mismo evento no duplica datos, y reenviarlo con otro contenido devuelve `CONFLICT` sin modificar nada. TestingStrategy lo precisa: el "otro contenido" se detecta por `payload_hash`.
4. **`ingestion_events` (6.1)**:
   - `payload_hash` es obligatorio y no vacío, y su algoritmo quedó para este contrato;
   - `event_type` es texto libre;
   - `error_code` es un código de la taxonomía y solo existe si `status = 'failed'`;
   - no hay columnas de resultado: el brief-6.1 (D-4) dejó para este contrato decidir qué devuelve un reenvío.
5. **La regla "`started_at` es el primer `sent_at`, y `last_message_at` el último"** no tiene constraint; la ingestión la garantiza (DataModel). Hace falta que el contrato diga qué pasa con un mensaje que llega fuera de orden.
6. **`conversations` y `messages`** tienen unicidades parciales por `external_ref` (segunda defensa) y `channel` solo admite `whatsapp`.
7. **`crm`** normaliza teléfonos a E.164 y ya expone la búsqueda por teléfono exacto (`searchClients`), pero exige un contexto de usuario humano. Resolver el cliente desde la ingestión necesitará en la 6.5.2 una función de `crm` para un contexto de servicio. Esta subfase solo fija la regla.
8. **Taxonomía** (Overview): `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `CONFLICT` 409, `RATE_LIMITED` 429 e `INTERNAL` 500. No hay código para "cuerpo demasiado grande".
9. **Métrica 12**: cuenta los eventos `failed` por `source` y `error_code`, así que importa qué rechazos quedan en el registro.
10. **`zod` 4.6.4 y `node:crypto`** alcanzan: no hace falta ninguna dependencia nueva.
11. **La guarda de referencias prohibidas** rechaza el nombre del repositorio del agente. El contrato habla de "un emisor" y no cita a ese sistema.

## Alcance incluido

1. Registrar la resolución de D-1 a D-7.
2. **`docs/contracts/ingestion-v1.md`** (nuevo), con:
   - estado (diseñado; validación implementada en la 6.5.1) y la advertencia de que no hay emisor real;
   - transporte: `POST /api/ingestion/v1/events`, JSON UTF-8, un evento por request, límite de tamaño del cuerpo;
   - la forma del evento según D-2, con tipo, nulabilidad, límites y ejemplo de cada campo;
   - identidad e idempotencia según D-3;
   - el algoritmo de `payload_hash` según D-4, con un vector de prueba;
   - las respuestas de éxito y de reenvío según D-5, y la tabla de errores con código, HTTP, si se registra en `ingestion_events` (D-6) y si el emisor debe reintentar;
   - la resolución del cliente según D-7;
   - los invariantes de la proyección que implementa la 6.5.2 (orden de mensajes, `started_at` y `last_message_at`, estado de la conversación);
   - qué no cubre v1 y cómo se versiona;
   - la sección "Evidencia": qué valida esta subfase y qué no.
3. **`src/modules/ingestion/contract.ts`** (nuevo): el esquema `zod` estricto del evento v1, `parseIngestionEventV1` (devuelve el evento normalizado o `VALIDATION_ERROR` con `fields`), `ingestionPayloadHash` y las constantes de límites. Sin base de datos, sin HTTP y sin importar otros módulos, salvo `src/shared/`.
4. **`src/modules/ingestion/index.ts`** (nuevo): la interfaz pública con lo anterior.
5. **`src/modules/ingestion/contract.test.ts`**: tests unitarios de cada regla de validación, de la normalización y del hash (canonicalización, sensibilidad a cada campo y el vector del contrato).
6. **Fixtures en `tests/fixtures/ingestion/v1/`**: un archivo JSON por caso, con `"shape": "assumed"`, una descripción, el payload y el resultado esperado de la validación. Incluyen:
   - un mensaje entrante con cliente;
   - uno saliente sin teléfono;
   - un cuerpo con marcado y otro nulo;
   - un `sent_at` con otra zona horaria;
   - casos inválidos (campo desconocido, fecha sin zona, teléfono sin `+`, identificadores vacíos o largos).

   Un test recorre la carpeta y exige el marcador en cada archivo.
7. **Documentos**:
   - IntegrationBoundaries: el enlace al contrato y el endpoint definitivo;
   - DataModel, en `ingestion_events`: el algoritmo de `payload_hash`, el cierre del hueco de columnas de resultado según D-5 y qué rechazos se registran según D-6;
   - MetricsCatalog: qué cuenta la métrica 12 según D-6;
   - TestingStrategy: los fixtures y su marcador;
   - TraceabilityMatrix: FR-CONV-04 y 05;
   - RepositoryStructure: la fila de la 6.5.1 y `docs/contracts/`;
   - el índice de `docs/README.md` y el de decisiones.

## Alcance excluido

- El Route Handler, cualquier escritura en `ingestion_events`, `conversations` o `messages`, y la función de `crm` para el contexto de servicio (6.5.2).
- La credencial de servicio, su almacenamiento, el límite de tasa y la allowlist del modo de prueba (6.5.3).
- Migraciones, seeds, pantallas y dependencias nuevas.
- Adjuntos, mensajes que no son texto, eventos de estado de entrega, lotes y cualquier canal además de `whatsapp`.
- Cualquier configuración, URL o credencial de un emisor real. No se copia ni se deriva la forma de eventos de ningún sistema existente (IntegrationBoundaries).
- La métrica 12 y su pantalla.

## Archivos o componentes autorizados

- `docs/contracts/ingestion-v1.md` (nuevo).
- `src/modules/ingestion/contract.ts`, `contract.test.ts` e `index.ts` (nuevos). `schema.ts` no cambia.
- `tests/fixtures/ingestion/v1/*.json` (nuevos).
- Documentos: IntegrationBoundaries, DataModel, MetricsCatalog (la nota de la métrica 12 según D-6), TestingStrategy, TraceabilityMatrix, RepositoryStructure, `docs/README.md` y `docs/decisions/README.md`.

## Fuentes de verdad

1. [src/modules/ingestion/schema.ts](../../src/modules/ingestion/schema.ts) y las migraciones 0011 y 0012.
2. [DataModel](../architecture/DataModel.md), en `conversations`, `messages` e `ingestion_events`, y la métrica 12 de [MetricsCatalog](../analytics/MetricsCatalog.md).
3. [IntegrationBoundaries](../architecture/IntegrationBoundaries.md), la taxonomía de [Overview](../architecture/Overview.md) y [SecurityModel](../architecture/SecurityModel.md) (límite de tasa por credencial).
4. FR-CONV-04 y 05 en [FunctionalRequirements](../product/FunctionalRequirements.md), y [TestingStrategy](../development/TestingStrategy.md).
5. [brief-6.1](brief-6.1-migraciones-de-conversaciones.md), D-2 a D-4, y [brief-1.2](brief-1.2-validacion-cruzada-del-modelo.md), D-7.
6. [Risks](../planning/Risks.md): la validación sintética de la autenticación y los fixtures con forma asumida.

## Dependencias

- 6.1 cerrada (esquema del registro). No depende de la 6.3 ni de la 6.4.
- La 6.5.2 y la 6.5.3 dependen de este contrato.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-7 según la recomendación, todas (a), y autorizó pasar la 6.5.1 a "En proceso" en Notion. La CI del arreglo del caso 9 (`8d8c34f`, ejecución 35156502469) quedó en verde antes de implementar (gate 2).

## Decisiones pendientes

### D-1 — Qué entrega la 6.5.1

- **Opciones**:
  - (a) El documento, más el validador `zod`, el hash y los fixtures, con sus tests.
  - (b) Solo el documento; el validador llega con la 6.5.2.
- **Recomendación**: (a).
  - Notion nombra la tarea "Contrato y validación".
  - Un contrato con un validador ejecutable y un vector de hash no puede desalinearse en silencio de su documento.
  - La 6.5.2 queda enfocada en la concurrencia y la proyección.

### D-2 — Forma del evento v1

- **Opciones**:
  - (a) **Un solo tipo, `message.recorded`**: cada evento es un mensaje, con la referencia de su conversación. La conversación nace con su primer mensaje.
  - (b) Dos tipos, `conversation.started` y `message.recorded`, con la conversación creada explícitamente.
- **Recomendación**: (a).
  - Con (b), una conversación puede existir sin mensajes, o un mensaje puede llegar antes que su conversación. Hay que decidir qué hacer en ambos casos.
  - Con (a), `started_at` sale siempre de un mensaje, que es la regla de DataModel.
  - Otro tipo puede sumarse en v1 sin romper nada, porque `event_type` es texto libre y el validador rechaza los tipos desconocidos.
- **Forma propuesta**, sin campos desconocidos (esquema estricto):
  - `contract_version`: `"1"`.
  - `event_type`: `"message.recorded"`.
  - `event_id`: el `external_ref` del evento. Texto de 1 a 200 caracteres, sin espacios al borde, y nunca un teléfono ni contenido.
  - `occurred_at`: fecha ISO 8601 con zona.
  - `conversation`:
    - `external_ref`: texto, como `event_id`;
    - `channel`: `"whatsapp"`;
    - `client_phone`: E.164 o `null`.
  - `message`:
    - `external_ref`: texto, como `event_id`;
    - `direction`: `"inbound"` o `"outbound"`;
    - `sent_at`: fecha ISO 8601 con zona, no más de 5 minutos en el futuro respecto de la recepción;
    - `body_text`: texto de hasta 4096 caracteres, o `null`.
- **Límites**: un cuerpo HTTP de 16 KB como máximo, que se rechaza con `VALIDATION_ERROR` (hallazgo 8).

### D-3 — De dónde salen la organización y el `source`

- **Opciones**:
  - (a) **De la credencial de servicio** (6.5.3): el payload no los trae.
  - (b) Del payload, verificados contra la credencial.
- **Recomendación**: (a). Un emisor no puede escribir en otra organización ni hacerse pasar por otro origen, porque no tiene cómo nombrarlos. Con (b), un error de configuración se vuelve un rechazo más para explicar. Hasta la 6.5.3, los tests de la 6.5.2 pasan organización y `source` como contexto explícito.

### D-4 — Algoritmo de `payload_hash`

- **Opciones**:
  - (a) **SHA-256 en hexadecimal** sobre la serialización canónica del evento **ya validado y normalizado**: claves ordenadas, sin espacios, fechas en UTC con milisegundos y teléfono en E.164. Lo calcula el CRM; el emisor no lo envía.
  - (b) SHA-256 sobre los bytes crudos del cuerpo.
- **Recomendación**: (a).
  - Con (b), un reintento que solo cambia espacios, el orden de las claves o la zona en que se escribió una fecha daría `CONFLICT`.
  - Con (a), `CONFLICT` significa otro contenido.
  - El hash incluye `event_id`, así que nunca coincide entre eventos distintos.
  - Se implementa con `node:crypto`, sin dependencias.
  - El contrato publica un vector de prueba.

### D-5 — Qué devuelve un reenvío

- **Opciones**:
  - (a) La respuesta solo trae referencias del emisor: `event_id`, un `result` (`accepted` o `duplicate`), y los `external_ref` de la conversación y del mensaje. `ingestion_events` no suma columnas.
  - (b) La respuesta trae además los ids internos de la conversación y del mensaje, y la 6.5.2 suma `conversation_id` y `message_id` a `ingestion_events`.
- **Recomendación**: (a).
  - El emisor ya conoce sus referencias, y los ids internos no le sirven para nada que el contrato ofrezca.
  - Exponerlos acopla al emisor con el modelo interno, algo que IntegrationBoundaries quiere evitar.
  - Cierra el hueco del brief-6.1 (D-4) sin columnas especulativas.
  - Si una versión futura los necesita, la migración es aditiva.
- **Respuestas**:
  - evento nuevo: `201` con `result: "accepted"`;
  - mismo `event_id` y mismo hash, ya procesado: `200` con `result: "duplicate"` y el mismo cuerpo;
  - mismo `event_id` y otro hash: `409 CONFLICT`, sin cambios.

### D-6 — Qué rechazos quedan en `ingestion_events`

- **Opciones**:
  - (a) **Solo los rechazos de negocio posteriores a la validación**, con `status = 'failed'` y su `error_code`. Por ejemplo, un evento nuevo cuyo mensaje ya existe en esa conversación con el mismo `external_ref`, llegado con otro `event_id`. Un payload inválido, una credencial inválida o un exceso de tasa se responden sin registrar.
  - (b) También los payloads inválidos, cuando se puede leer su `event_id`.
- **Recomendación**: (a).
  - Un payload inválido no tiene identidad confiable, y guardarlo abriría el registro a basura sin autenticar.
  - Los rechazos sin registro van al log estructurado, sin payload.
  - La métrica 12 mide los eventos que el CRM aceptó procesar y falló. El contrato lo aclara, y MetricsCatalog suma la nota.
- **Consecuencia**: un evento `failed` es terminal. Reenviarlo con el mismo hash devuelve el mismo error, y con otro hash, `CONFLICT`. El emisor corrige con un `event_id` nuevo.

### D-7 — Resolución del cliente

- **Opciones**:
  - (a) Si `client_phone` coincide con un cliente de la organización (activo o no), la conversación lo referencia. Si no coincide, queda sin cliente. La ingestión nunca crea clientes.
  - (b) Crear el cliente cuando el teléfono no existe.
- **Recomendación**: (a).
  - DataModel admite conversaciones sin cliente.
  - Crear clientes desde un origen automático agrega datos personales sin que un `admin` lo decida, contra la minimización (FR-CLI-05).
  - La conversación se resuelve una sola vez, con su primer mensaje. Los mensajes siguientes no cambian su cliente, aunque traigan otro teléfono.

## Invariantes

- Nada apunta a un emisor real: ni URLs, ni credenciales, ni variables de entorno. La guarda de referencias prohibidas sigue pasando.
- El validador es puro y determinista: el mismo cuerpo produce el mismo resultado y el mismo hash.
- Ningún payload, teléfono ni cuerpo aparece en mensajes de error ni en `fields`. Los errores nombran el campo y la regla.
- `event_id` y los `external_ref` se validan como opacos: el CRM no los interpreta.
- Cada fixture declara `"shape": "assumed"`.
- Invariantes de la proyección, escritos en el contrato para la 6.5.2:
  - `started_at` es el menor `sent_at` de la conversación, y `last_message_at` el mayor, aunque los mensajes lleguen desordenados;
  - la ingestión no cambia el `status` de una conversación existente, y una conversación nueva nace `open`;
  - el registro y la proyección van en la misma transacción.
- `src/modules/ingestion/` no importa otros módulos en esta subfase, y `src/modules/` fuera de `ingestion` no cambia.
- Sin dependencias nuevas ni migraciones: `db:generate` no produce cambios.

## Criterios de aceptación

- **AC-1**: D-1 a D-7 tienen resolución del usuario con fecha.
- **AC-2**: `docs/contracts/ingestion-v1.md` cubre cada punto del alcance 2, sin decisiones abiertas salvo las asignadas a la 6.5.2 o la 6.5.3, nombradas como tales.
- **AC-3**: los tests de `contract.test.ts` pasan y cubren cada regla del esquema, la normalización, el vector de hash del contrato y la sensibilidad del hash a cada campo. Queda registrada una corrida de mutación: con el hash calculado sin ordenar las claves, falla el caso de canonicalización.
- **AC-4**: cada fixture tiene el marcador y valida con el resultado que declara.
- **AC-5**: `npm run test` pasa completo sin cambios en los tests existentes.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-7**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`.
- **AC-8**: `git status` muestra solo archivos autorizados, y los documentos reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: los tests unitarios y los fixtures. Los fixtures tienen forma asumida y **no** cuentan como evidencia de compatibilidad con un emisor.
- **Evidencia de mutación**: la de AC-3. El archivo se restaura después de la corrida.
- **Evidencia de CI**: una ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para la validación del payload y el hash; **diseñado** para el resto del contrato.

**No se valida**:

- la reserva, los reenvíos y la proyección (6.5.2);
- la autenticación y el límite de tasa (6.5.3);
- la compatibilidad con un emisor real (proyecto de integración).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si el contrato necesita una migración, una dependencia, un cambio en la configuración de Vitest o un cambio en otro módulo.
- Si una regla del contrato contradice DataModel, IntegrationBoundaries o FR-CONV-04 y 05.
- Si cualquier paso requiere configurar o consultar un emisor real.
- Antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-16)

La implementación está terminada y el cierre está pendiente. No se activó ninguna condición de detención.

### Desvío respecto del brief

- **Límite del cuerpo HTTP: 64 KiB en lugar de 16 KB (D-2).** Los dos valores aprobados no eran compatibles. Un cuerpo de mensaje de 4096 puntos de código puede ocupar 16 KB en UTF-8 por sí solo (4 bytes por emoji), y hasta unos 48 KB si el emisor lo escribe con escapes `\uXXXX`. Con 16 KB, el contrato rechazaría mensajes que su propia regla de largo acepta. Se mantuvo el largo del cuerpo y se subió el límite del request. El usuario confirmó el cambio el 2026-09-16.

### Precisiones del contrato

- **Reglas de datos que PostgreSQL impone**: el cuerpo del mensaje rechaza el carácter NUL, y todos los textos rechazan UTF-16 inválido (surrogates sueltos). Sin esto, la 6.5.2 fallaría con `INTERNAL` al insertar.
- **Referencias opacas sin caracteres de control**, para que no rompan logs ni pantallas.
- **Un cuerpo de mensaje vacío se rechaza**: la ausencia de texto se expresa con `null`, que es como lo guarda `messages`.
- **Precisión de las fechas**: como máximo milisegundos, para que dos fechas distintas no se normalicen a la misma y compartan hash.
- **Campos desconocidos**: se informan por el objeto que los contiene (`event`, `conversation` o `message`), nunca por su nombre, que lo elige el emisor.
- **Qué rechazo registra el CRM**: el contrato nombra el `CONFLICT` de un mensaje repetido con otro `event_id` como el rechazo de negocio que queda `failed` (D-6).

### Evidencia

- **`src/modules/ingestion/contract.test.ts`**: 28 casos, todos en verde. Cubren:
  - cada regla del esquema, sus límites exactos y la normalización;
  - el vector del contrato, con la serialización canónica escrita a mano y su SHA-256;
  - que el hash no cambia con el orden, los espacios ni la zona de las fechas, y sí con cada campo;
  - los 11 fixtures de `tests/fixtures/ingestion/v1/` (5 válidos y 6 inválidos), cada uno con `"shape": "assumed"`.
- **Mutación (AC-3)**: con `canonicalJson` sin ordenar las claves fallan 8 casos, entre ellos el vector, el de orden y formato, y los 5 fixtures válidos. Con el archivo restaurado vuelven a pasar los 28.
- **Suite local**: `npm run test` pasa 574 de 574.
- **Con el contenedor detenido**: pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (239) y `build`, y `db:generate` no produce migraciones.
- **Sin cambios**: `src/modules/` fuera de `ingestion`, los tests existentes, las dependencias y la configuración.
- **Guarda de referencias prohibidas**: en verde.

Pendiente: commit, push, CI (AC-7) y cierre.
