---
schema: task-brief.v1
task_id: 6.5.2
task_type: implementation
generated_at: 2026-09-17
---

# Brief: 6.5.2 — Registro idempotente y proyección

## Objetivo

Implementar el caso de uso de ingestión del [contrato v1](../contracts/ingestion-v1.md), sin exponerlo todavía por HTTP:

1. **Registrar** cada evento válido en `ingestion_events`, de forma atómica e idempotente por `(organization_id, source, external_ref)`.
2. **Proyectar** el mensaje sobre `conversations` y `messages`, en la misma transacción, con las reglas del contrato:
   - la conversación nace con su primer mensaje;
   - `started_at` y `last_message_at` son el menor y el mayor `sent_at`;
   - el estado no cambia;
   - el cliente se resuelve por teléfono y nunca se crea.
3. **Responder a los reenvíos**:
   - mismo contenido: `duplicate`, sin escribir nada;
   - otro contenido: `CONFLICT`, sin modificar nada;
   - evento `failed`: terminal.
4. **Probarlo contra PostgreSQL real**, incluidas dos entregas simultáneas del mismo evento y dos eventos simultáneos de una conversación nueva.

Nivel esperado: **validado localmente y en CI** (`deterministic`) para el registro y la proyección, con fixtures sintéticos de forma asumida. El endpoint y la credencial siguen **diseñados** (6.5.3).

## Ubicación en la Fase 6

- **Orden previsto**: 6.5.1 (cerrada) → **6.5.2** → 6.5.3 (credencial de servicio, límite de tasa, modo de prueba y endpoint, según D-1) → cierre de la Fase 6.
- **Notion**: la tarea 6.5.2 (`3d8702be6f4e818fbd61e5dc99b683a3`) está en "Bandeja de Entrada" según HANDOFF. La madre 6.5 la describe como "ledger idempotente". Notion no estaba disponible al preparar el brief; con la conexión restablecida, la tarea pasó a "En proceso" (ver Resolución).
- **Necesario ahora**: el caso de uso, las funciones de `conversations` y `crm` que necesita, y sus tests.
- **Lo que llega después**:
  - el Route Handler y el mapeo a HTTP, la credencial, el límite de tasa, la allowlist y la decisión sobre `Origin` (6.5.3);
  - la métrica 12 (Fase 7).
- **Gates de entrada**:
  1. 6.5.1 cerrada, con la CI en verde en `6f026a9` y en el cierre `9fd2fed`. Verificado el 2026-09-17.
  2. Contenedor de PostgreSQL en marcha.

## Hallazgos de la verificación previa (2026-09-17)

1. **Dependencias entre módulos** (Overview):
   - `ingestion` depende de `conversations` y `organizations`, no de `crm`;
   - `conversations` depende de `crm`.

   Por eso la búsqueda del cliente la hace `conversations`, que llama a `crm`.
2. **Convención de transacciones**: el módulo dueño del caso de uso abre la transacción y la pasa a los demás, que la exigen por tipo (`DbTransaction`), como `recordAudit` y `lockProductForStockChange`.
3. **`crm` solo expone funciones con `AuthContext`**, y la ingestión no tiene usuario. Hace falta una función nueva que busque un cliente por teléfono sin rol. Debe exigir una transacción, para que no se pueda usar desde una pantalla, y devolver solo el id.
4. **`conversations` no tiene escrituras de inserción**: solo `updateConversationStatus`.
5. **Unicidades disponibles**:
   - `ingestion_events` tiene un constraint con nombre;
   - `conversations` y `messages` tienen índices únicos parciales (`WHERE external_ref IS NOT NULL`), que `ON CONFLICT` puede usar si repite el predicado.
6. **Los seeds dejan `external_ref` nulo**, así que no chocan con eventos ingeridos.
7. **No existe ningún Route Handler mutante.** Un endpoint expuesto antes de la 6.5.3 no tendría autenticación.
8. **Precedente de concurrencia**: `inventory-concurrency.test.ts` retiene un bloqueo desde otra conexión y espera en `pg_stat_activity` antes de soltarlo (4.3.2).
9. **`messages` es de solo inserción** y `conversations` admite `UPDATE`. `ingestion_events` solo permite cambiar `status`, `error_code` y `processed_at` (trigger de la 6.1).
10. **La ingestión no tiene autor humano**: `audit_logs.actor_user_id` no aplica. El registro de cada evento es `ingestion_events`.

## Alcance incluido

1. Registrar la resolución de D-1 a D-3.
2. **`src/modules/crm/`**: `findClientIdByPhone(tx, organizationId, phoneE164)`. Devuelve el id del cliente de esa organización con ese teléfono, activo o no, o `null`. Solo acepta una transacción y no devuelve datos personales. Se exporta en `index.ts`.
3. **`src/modules/conversations/`**: `recordIngestedMessage(tx, input)`, que:
   - crea o bloquea la conversación por `(organization_id, channel, external_ref)` con `INSERT … ON CONFLICT DO NOTHING` y `SELECT … FOR UPDATE`;
   - al crearla, resuelve el cliente con `crm.findClientIdByPhone` y la deja `open`;
   - inserta el mensaje con `ON CONFLICT DO NOTHING`;
   - si el mensaje ya existía, devuelve `CONFLICT` sin tocar la conversación;
   - si no, ajusta `started_at` con `LEAST` y `last_message_at` con `GREATEST`;
   - devuelve solo si creó la conversación.

   Se exporta en `index.ts`.
4. **`src/modules/ingestion/`**: `service.ts` y `repository.ts`, con `recordIngestionEvent(context, body, receivedAt)`, donde `context` es `{ organizationId, source }`. El caso de uso:
   - valida `source` como referencia opaca;
   - valida el cuerpo con `parseIngestionEventV1`: un rechazo no escribe nada;
   - calcula `payload_hash`;
   - en una transacción, reserva el evento con `ON CONFLICT ON CONSTRAINT … DO NOTHING`;
   - si ya existía, lo lee y responde: `duplicate` si el hash coincide y está `processed`; el mismo `CONFLICT` si coincide y está `failed`; `CONFLICT` sin cambios si el hash difiere;
   - si es nuevo, llama a `recordIngestedMessage` y marca el evento `processed` o `failed` con su `error_code`;
   - un error inesperado revierte la transacción entera, reserva incluida.

   Devuelve un resultado tipado, sin HTTP:
   - `{ ok: true, result: "accepted" | "duplicate", eventId, conversationExternalRef, messageExternalRef }`;
   - `VALIDATION_ERROR` con `fields`;
   - `CONFLICT` con `recorded: boolean`.
5. **Tests de integración** en `tests/integration/ingestion.test.ts`, con los fixtures de `tests/fixtures/ingestion/v1/` y eventos derivados de ellos, contra PostgreSQL real:
   - un evento crea la conversación y el mensaje. Se verifican `started_at = last_message_at = sent_at`, `status = 'open'`, el cliente resuelto por teléfono (también inactivo), el cliente de otra organización no resuelto y el evento `processed` con su hash;
   - un segundo mensaje de la misma conversación no cambia el cliente aunque traiga otro teléfono. Un mensaje anterior adelanta `started_at` y uno posterior mueve `last_message_at`. Una conversación `closed` sigue `closed`;
   - el reenvío idéntico, o con otro formato y el mismo contenido, devuelve `duplicate` sin filas nuevas ni cambios;
   - el reenvío con otro contenido devuelve `CONFLICT` sin cambios;
   - el mismo mensaje con otro `event_id` deja el segundo evento `failed` con `CONFLICT`, sin mensaje nuevo ni cambio de fechas, y su reenvío devuelve el mismo `CONFLICT`;
   - un payload inválido o un `source` inválido no escriben nada;
   - el mismo `event_id` en otra organización o con otro `source` es otro evento;
   - aislamiento: el mismo `conversation.external_ref` en dos organizaciones da dos conversaciones;
   - un error inesperado en la proyección (forzado en una transacción de prueba) no deja el evento reservado;
   - **concurrencia**:
     - dos entregas simultáneas del mismo evento dejan un solo mensaje, una respuesta `accepted` y otra `duplicate`;
     - dos eventos simultáneos de una conversación nueva dejan una sola conversación con los dos mensajes y las fechas correctas.

     Cada caso retiene el bloqueo desde otra conexión y espera en `pg_stat_activity`, como en la 4.3.2, y se corre una vez sin la protección para registrar que falla.
   - el invariante de fechas de DataModel se verifica sobre todas las conversaciones creadas por el test.
6. **Tests unitarios** de lo que no necesita base: la validación de `source` y la traducción de un evento existente a su respuesta.
7. **Documentos**:
   - el contrato: su estado y la sección "Evidencia";
   - DataModel: los productores del invariante de fechas y la nota de `ingestion_events`;
   - Overview: `ingestion` usa `crm` solo a través de `conversations`, sin dependencia nueva;
   - TestingStrategy, TraceabilityMatrix (FR-CONV-04) y RepositoryStructure;
   - el índice de decisiones.

## Alcance excluido

- El Route Handler, el mapeo a HTTP, los encabezados, la credencial, el límite de tasa, la allowlist y `Origin` (6.5.3, según D-1).
- Migraciones, dependencias nuevas, seeds y pantallas. Mostrar datos ingeridos en la UI no requiere cambios: la 6.4 ya lee `conversations`.
- Auditoría de la ingestión en `audit_logs`: el registro es `ingestion_events` (hallazgo 10).
- Otros tipos de evento, lotes y reprocesamiento de eventos `failed`.
- Cualquier emisor real, URL o credencial.

## Archivos o componentes autorizados

- `src/modules/ingestion/service.ts`, `repository.ts`, `service.test.ts` e `index.ts`.
- `src/modules/conversations/service.ts`, `repository.ts` e `index.ts`: solo las funciones de ingestión.
- `src/modules/crm/service.ts`, `repository.ts` e `index.ts`: solo `findClientIdByPhone`.
- `tests/integration/ingestion.test.ts` (nuevo). Los fixtures existentes solo se leen.
- Documentos: el contrato, DataModel, Overview, TestingStrategy, TraceabilityMatrix, RepositoryStructure y `docs/decisions/README.md`.

## Fuentes de verdad

1. [contracts/ingestion-v1.md](../contracts/ingestion-v1.md) y [src/modules/ingestion/contract.ts](../../src/modules/ingestion/contract.ts).
2. Los esquemas y las migraciones 0011 y 0012; [DataModel](../architecture/DataModel.md).
3. [Overview](../architecture/Overview.md), en las dependencias entre módulos y la taxonomía.
4. [brief-6.5.1](brief-6.5.1-contrato-de-ingestion.md), [brief-6.1](brief-6.1-migraciones-de-conversaciones.md) (D-3) y [brief-4.3.2](brief-4.3.2-concurrencia-de-ajustes.md) (tests de concurrencia).
5. [TestingStrategy](../development/TestingStrategy.md) (idempotencia de ingestión).

## Dependencias

- 6.5.1 cerrada.
- La 6.5.3 depende de este caso de uso.
- La métrica 12 (Fase 7) depende de los `failed` que esta subfase registra.

## Resolución (2026-09-17)

El usuario aprobó el brief con D-1 a D-3 según la recomendación, todas (a), y autorizó pasar la 6.5.2 a "En proceso" en Notion, que se hizo con la conexión restablecida. También pidió levantar el CRM en local: se abrió Docker Desktop, se aplicaron las migraciones pendientes (ninguna nueva) y `npm run dev` responde en `http://localhost:3000`.

## Decisiones pendientes

### D-1 — ¿El endpoint HTTP llega en esta subfase?

- **Opciones**:
  - (a) **No**: la 6.5.2 entrega el caso de uso y sus tests. El Route Handler llega en la 6.5.3, junto con la credencial.
  - (b) Sí, con la organización y el `source` en encabezados provisionales, detrás de una variable de entorno apagada por defecto.
- **Recomendación**: (a).
  - Con (b) existiría, aunque fuera apagado, un endpoint que escribe sin autenticación. Un error de configuración lo expondría.
  - El caso de uso se prueba igual de bien sin HTTP.
  - El contrato y el HANDOFF asignaban el endpoint a la 6.5.2: se corrigen, y la 6.5.3 suma el endpoint a su alcance.

### D-2 — ¿Dónde vive la proyección?

- **Opciones**:
  - (a) **En `conversations`**: `recordIngestedMessage(tx, …)` escribe sus tablas y pide el cliente a `crm` con la transacción. `ingestion` abre la transacción y registra el evento.
  - (b) `ingestion` escribe `conversations` y `messages` directamente.
- **Recomendación**: (a). Respeta la regla de que cada módulo escribe solo sus tablas y las dependencias de Overview, sin sumar ninguna, y sigue la convención de pasar la transacción. (b) rompe la frontera que la guarda y el lint verifican.

### D-3 — Estrategia de concurrencia

- **Opciones**:
  - (a) **`READ COMMITTED`** con reservas `INSERT … ON CONFLICT DO NOTHING` y bloqueo `FOR UPDATE` de la conversación. Una segunda entrega espera en el índice único hasta que la primera confirma, y después lee el evento ya confirmado.
  - (b) `SERIALIZABLE` con reintentos ante `40001`.
- **Recomendación**: (a).
  - Es el patrón del proyecto (4.3.1 y 4.3.2), y las esperas se pueden observar y probar con `pg_stat_activity`.
  - Con (b) harían falta reintentos, y los fallos quedarían en un código que el caso de uso tendría que traducir.
  - Con (a), si la primera transacción se revierte, la segunda inserta el evento normalmente.

## Invariantes

- Nunca hay dos eventos con la misma identidad, ni dos mensajes con el mismo `external_ref` en una conversación, ni dos conversaciones con el mismo `external_ref` y canal en una organización.
- Cada conversación creada por la ingestión cumple que `started_at` es el menor `sent_at` y `last_message_at` el mayor.
- Un reenvío con otro contenido no modifica ninguna fila, tampoco la del evento.
- Un evento `failed` no deja mensaje ni cambios en la conversación.
- Un rechazo de validación no escribe ninguna fila. Un error inesperado no deja ninguna fila de su transacción.
- La ingestión no cambia el `status` ni el `client_id` de una conversación existente, y no crea clientes.
- Ningún resultado ni error del caso de uso incluye el payload, el teléfono, el cuerpo ni ids internos.
- `ingestion` no importa `crm`, y ningún módulo escribe tablas de otro.
- Sin dependencias nuevas ni migraciones: `db:generate` no produce cambios.
- Nada apunta a un emisor real.

## Criterios de aceptación

- **AC-1**: D-1 a D-3 tienen resolución del usuario con fecha.
- **AC-2**: `tests/integration/ingestion.test.ts` pasa con cada caso del alcance 5, contra PostgreSQL real.
- **AC-3**: los dos casos de concurrencia muestran la espera en `pg_stat_activity`. Cada uno se corrió una vez sin su protección (`DO NOTHING` o `FOR UPDATE`) y falló, con la evidencia en este brief.
- **AC-4**: `npm run test` pasa completo, sin cambios en los tests ni en las guardas existentes.
- **AC-5**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-6**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`.
- **AC-7**: `git status` muestra solo archivos autorizados, y los documentos reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: los tests de integración contra PostgreSQL 18 real, en local y en CI, con fixtures sintéticos de forma asumida.
- **Evidencia de mutación**:
  - las dos de AC-3;
  - una más: con la proyección sin `LEAST`, falla el caso del mensaje anterior.

  Cada archivo se restaura después de su corrida.
- **Evidencia de CI**: una ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para el registro y la proyección.

**No se valida**:

- el endpoint ni la autenticación (6.5.3);
- la compatibilidad con un emisor real;
- el rendimiento con volumen de ingestión (Fase 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si el caso de uso necesita una migración, una dependencia, una dependencia nueva entre módulos o un cambio en el contrato v1 más allá de reasignar el endpoint (D-1).
- Si un test existente o una guarda necesitan cambios.
- Si una regla del contrato resulta imposible de cumplir con las unicidades existentes.
- Antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-17)

La implementación está terminada y el cierre está pendiente. No se activó ninguna condición de detención.

### Desvío respecto del brief

- **`src/modules/ingestion/contract.ts` suma `isOpaqueReference`**, aunque ese archivo no estaba en la lista autorizada. El `source` se valida con la misma regla que las referencias del contrato, y exportarla evita duplicarla. Es un agregado sin cambios de comportamiento: los 28 tests de la 6.5.1 siguen iguales y en verde. El usuario lo confirmó el 2026-09-17.

### Precisiones de la implementación

- **Concurrencia (D-3)**:
  - La reserva del evento y la creación de la conversación usan `INSERT … ON CONFLICT DO NOTHING`. La de la conversación repite el predicado del índice parcial (`where external_ref is not null`).
  - Una conversación existente se bloquea con `FOR UPDATE` antes de insertar el mensaje. La corrección de las fechas no depende de ese bloqueo: el `UPDATE` con `LEAST` y `GREATEST` relee la fila después de esperar. Por eso, la mutación del caso 13 quita el `DO NOTHING` de la conversación, no el `FOR UPDATE`, como permitía AC-3.
- **`processed_at` usa `clock_timestamp()`**, la hora real del cierre del evento.
- **Un evento guardado como `received`** es imposible, porque la reserva y su cierre van en la misma transacción. Si apareciera, el caso de uso lo trata como error inesperado.
- **Un `failed` con un código distinto de `CONFLICT`** también se trata como error inesperado: v1 no registra otros rechazos.
- **El caso 11** fuerza el error inesperado con un trigger temporal sobre `messages` en la base de test, y lo quita al terminar.

### Evidencia

- **`tests/integration/ingestion.test.ts`**: 13 casos en verde contra PostgreSQL 18.6 real, con los fixtures de forma asumida de la 6.5.1. Las esperas de los casos 12 y 13 se observaron en `pg_stat_activity`.
- **Mutaciones (AC-3)**, con cada archivo restaurado después y los 13 casos en verde otra vez:
  - sin el `ON CONFLICT … DO NOTHING` de la reserva del evento, fallan 4 casos, entre ellos el 12 (entregas simultáneas) y los de reenvío (6, 7 y 8);
  - sin el `ON CONFLICT … DO NOTHING` de la conversación, fallan 5, entre ellos el 13 (conversación nueva simultánea);
  - sin el `LEAST` de `started_at`, fallan el caso 4 (mensaje anterior) y el 13.
- **`src/modules/ingestion/service.test.ts`**: 7 unitarios (respuesta a un evento existente y validación del `source`).
- **Suite local**: `npm run test` pasa 594 de 594.
- **Con el contenedor detenido**: pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (246) y `build`, y `db:generate` no produce migraciones.
- **Sin cambios**: los tests existentes, las guardas, las dependencias, las migraciones y el contrato fuera de su estado y su evidencia.
- **CRM local**: `npm run dev` sigue respondiendo en `http://localhost:3000` después de detener y volver a levantar la base.

## Cierre (2026-09-17)

- **Commit y push** `6d7626a`, autorizados por el usuario el 2026-09-17.
- **AC-6**: CI en verde en la [ejecución 35227372751](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35227372751), con todos los pasos.
- **Nivel alcanzado**: **validado localmente y en CI** para el registro idempotente, los reenvíos y la proyección. El endpoint, la credencial y el límite de tasa siguen en nivel **diseñado** (6.5.3).
- **Revisión**: autoevaluación del mismo agente, sin revisión independiente.
- **Queda para la 6.5.3**: el Route Handler `POST /api/ingestion/v1/events`, la credencial que fija organización y `source`, el límite de tasa, la allowlist del modo de prueba y la decisión sobre `Origin` en un endpoint de servicio.
