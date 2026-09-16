---
schema: task-brief.v1
task_id: 6.1
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 6.1 — Migraciones de conversaciones

## Objetivo

1. Crear en PostgreSQL las tablas `conversations`, `messages` e `ingestion_events` de [DataModel.md](../architecture/DataModel.md), con sus enums, claves foráneas, unicidades parciales, el `UNIQUE` del registro de ingestión y los índices de la [TraceabilityMatrix](../architecture/TraceabilityMatrix.md).
2. Sumar `UNIQUE(organization_id, id)` a `clients`, para la clave foránea compuesta de `conversations` (brief-5.1, D-4).
3. Otorgar los privilegios a `crm_app` y aplicar las protecciones de solo inserción que resuelva D-3 ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)).
4. Validar cada invariante **localmente y en CI** contra PostgreSQL real, intentando violarlo.

Esta subfase solo toca el esquema: no crea servicios, casos de uso, seeds, pantallas, endpoints ni lógica del registro de ingestión.

## Ubicación en la Fase 6

- **Orden previsto**: **6.1** → 6.2 (seeds sintéticos) → 6.3 (servicio de consulta y estado) → 6.4 (UI), con 6.5.1 (contrato) → 6.5.2 (registro idempotente) → 6.5.3 (autenticación de servicio) en paralelo.
- **Notion**: "M. conversations, messages e ingestion_events, con unicidades parciales y el UNIQUE del ledger". Estado: "Bandeja de Entrada". El proyecto de la Fase 6 y su tarea espejo pasaron a "En progreso" / "En proceso" el 2026-09-16.
- **Necesario ahora**: tablas, enums, constraints, índices, privilegios y sus tests.
- **Lo que llega después en la fase**:
  - la reserva atómica y los reenvíos (6.5.2);
  - la forma del payload y el algoritmo de `payload_hash` (6.5.1);
  - la credencial de servicio (6.5.3);
  - la regla "`started_at` coincide con el primer mensaje" (TestingStrategy), que la garantizan la ingestión y los seeds, no un constraint.
- **Fuera de esta fase**:
  - la retención de `messages` (Fase 9);
  - la eliminación de datos de un cliente (Fase 8);
  - conectar la aplicación con `crm_app` (Fases 8 y 9).
- **Gates de entrada**:
  1. Fase 5 cerrada, con la CI en verde en `a3fe750` ([ejecución 35133324419](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35133324419)). Verificado el 2026-09-16.
  2. Contenedor de PostgreSQL en marcha.
  3. **Autorización para ejecutar las migraciones** contra la base local de desarrollo. Las bases `_test` y `_e2e` se recrean solas.

## Hallazgos de la verificación previa (2026-09-16)

1. **Estado**: `main` limpio en `a3fe750`, igual que `origin/main`. Existen las migraciones 0000 a 0009.
2. **Alcance, HANDOFF frente a Notion**:
   - el HANDOFF describe la 6.1 con `conversations` y `messages`;
   - Notion suma `ingestion_events`, y deja a la 6.5.2 la lógica del registro ("reserva atómica; mismo hash…").
   Roadmap no reparte las tablas entre subfases. Se resuelve en D-1.
3. **Módulos dueños**: [Overview.md](../architecture/Overview.md) asigna conversaciones y mensajes a `conversations` (depende de `organizations` y `crm`), y el registro de eventos a `ingestion` (depende de `conversations` y `organizations`). Ninguna de las dos carpetas existe todavía. Nacen solo con `schema.ts`, como `crm` en la 5.1. [RepositoryStructure.md](../architecture/RepositoryStructure.md) ya las asigna a la Fase 6.
4. **`messages.conversation_id` está escrita como clave simple** en DataModel. La convención de la 4.1 (D-3) pide clave compuesta hacia un `UNIQUE(organization_id, id)` del dueño, para que un mensaje no apunte a la conversación de otra organización. Aplicarla exige `UNIQUE(organization_id, id)` también en `conversations`. Es la convención vigente, no una decisión nueva.
5. **"No se borran nunca" no tiene mecanismo**:
   - la regla 8 de DataModel dice que `messages` e `ingestion_events` no se borran nunca;
   - la regla 10 y el ADR 0013 solo protegen `audit_logs` e `inventory_movements`;
   - `ingestion_events` necesita `UPDATE` para pasar de `received` a `processed` o `failed`.
   Se resuelve en D-3.
6. **DataModel no restringe la coherencia interna de las filas**. Hoy se aceptarían:
   - `external_ref` o `source` vacíos, que rompen la identidad del evento ("Identidad lógica estable", IntegrationBoundaries);
   - un `last_message_at` anterior a `started_at`;
   - un evento `processed` sin `processed_at`, o `failed` sin `error_code`.
   Se resuelve en D-2.
7. **El registro no guarda qué creó cada evento.** "Reenvío con el mismo `payload_hash`: devuelve el resultado original", pero `ingestion_events` no tiene columnas de resultado (conversación o mensaje). Lo que devuelve la respuesta lo define el contrato de la 6.5.1. Se resuelve en D-4.
8. **Drizzle 0.45.2** ya expresó en la 4.1 y la 5.1 enums, claves compuestas (`foreignKey`), `unique()`, índices únicos parciales, índices con `desc()` y `check()`. Los privilegios y triggers necesitan una migración a medida, como la 0005 y la 0009.
9. **Tests existentes que hay que tocar**:
   - `identity-schema.test.ts` exige la lista exacta de tablas de `public`;
   - `audit.test.ts` clasifica cada tabla como escribible o de solo inserción (`INSERT_ONLY_TABLES`). Según D-3 hay que sumar `messages`, y `ingestion_events` necesita una tercera categoría (inserción y actualización, sin borrado).
10. **`audit_logs` ya admite** `conversation` como `entity_type` y `status_change` como acción. Sus enums no se tocan.
11. **`resetDatabase` vacía todas las tablas de `public` con `TRUNCATE`**, que no dispara triggers de fila, como ya ocurre con `inventory_movements`. Ningún end-to-end crea conversaciones, así que el `ON DELETE RESTRICT` no bloquea su `beforeEach`.
12. **Documentación desalineada** en [docs/decisions/README.md](README.md): la fila del brief-5.3 dice "aprobado el 2026-09-16" y no registra el cierre. Se corrige al sumar la fila de este brief.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. **`src/modules/crm/schema.ts`**: `unique("clients_organization_id_id_unique").on(organizationId, id)`. Es lo único que cambia en ese archivo.
3. **`src/modules/conversations/schema.ts`**:
   - enums `conversation_channel` (`whatsapp`), `conversation_status` (`open`, `pending`, `closed`) y `message_direction` (`inbound`, `outbound`);
   - `conversations` con las columnas de DataModel. `organization_id` con `ON DELETE RESTRICT`. `status` con default `'open'`. `updated_at` con `$onUpdate`. Clave compuesta `conversations_client_fk` `(organization_id, client_id)` → `clients(organization_id, id)`, `ON DELETE RESTRICT`: con `client_id` nulo no se verifica (`MATCH SIMPLE`). `UNIQUE(organization_id, id)`. Índice único parcial `(organization_id, channel, external_ref) WHERE external_ref IS NOT NULL`. Índices `(organization_id, last_message_at desc)`, `(organization_id, client_id, last_message_at desc)` y `(organization_id, started_at)`;
   - `messages` con las columnas de DataModel. `organization_id` con `ON DELETE RESTRICT`. Clave compuesta `messages_conversation_fk` `(organization_id, conversation_id)` → `conversations(organization_id, id)`, `ON DELETE RESTRICT` (hallazgo 4). Índice único parcial `(organization_id, conversation_id, external_ref) WHERE external_ref IS NOT NULL`. Índices `(conversation_id, sent_at)` y `(organization_id, sent_at)`. `created_at` con default `now()`;
   - los `CHECK` que resuelva D-2.
4. **`src/modules/ingestion/schema.ts`**, según D-1:
   - enum `ingestion_event_status` (`received`, `processed`, `failed`);
   - `ingestion_events` con las columnas de DataModel, `organization_id` con `ON DELETE RESTRICT`, `status` con default `'received'` y `received_at` con default `now()`;
   - `UNIQUE(organization_id, source, external_ref)` como constraint con nombre, porque la 6.5.2 lo usa en `ON CONFLICT`;
   - índice `(organization_id, received_at)`;
   - los `CHECK` que resuelva D-2 y las columnas que resuelva D-4.
5. **Migraciones**:
   - `drizzle/0010_*`, generada por `drizzle-kit generate`;
   - `drizzle/0011_*`, a medida (`--custom`), con los `GRANT` y los triggers que resuelva D-3.
   Las migraciones anteriores no se modifican.
6. **Tests de integración** en `tests/integration/conversations-schema.test.ts`, con SQL directo, verificando el SQLSTATE **y el nombre de la constraint** en cada rechazo:
   - defaults: `id`, `status = 'open'`, `ingestion_events.status = 'received'` y los timestamps; nulabilidad de `client_id`, `external_ref`, `last_message_at`, `body_text`, `error_code` y `processed_at`;
   - `NOT NULL` de las columnas obligatorias → `23502`, y un valor fuera de enum → `22P02`;
   - `external_ref` repetido en la misma organización y canal → `23505`. Se aceptan: el mismo `external_ref` en otra organización, varias conversaciones sin `external_ref` y el mismo `external_ref` en otra conversación para `messages`;
   - `ingestion_events` con `(organization_id, source, external_ref)` repetido → `23505`. Se aceptan otra `source` u otra organización. `INSERT … ON CONFLICT ON CONSTRAINT … DO NOTHING` no inserta la segunda fila (solo el mecanismo de base; la lógica es de la 6.5.2);
   - **aislamiento**: una conversación con el `client_id` de otra organización → `23503`, y un mensaje con el `conversation_id` de otra organización → `23503`. Una conversación sin cliente se acepta;
   - borrar un cliente con conversaciones, una conversación con mensajes o una organización con cualquiera de las tres → `23001`;
   - los casos de D-2 y D-3;
   - privilegios de `crm_app` (`SET LOCAL ROLE`) sobre cada tabla, según D-3.
7. **Tests existentes**, solo en esto:
   - `identity-schema.test.ts` suma las tres tablas a la lista exacta y ajusta el título del caso;
   - `audit.test.ts` ajusta la clasificación de privilegios según D-3, sin debilitar el caso que demuestra que falla con una tabla sin privilegios;
   - `clients-schema.test.ts` suma un caso para `clients_organization_id_id_unique`, si no lo cubre ya `conversations-schema.test.ts`.
8. **Documentación**:
   - DataModel: estado de las tres tablas, módulos dueños, la clave compuesta de `messages`, las resoluciones de D-1 a D-4, las reglas 8 y 10 según D-3, la línea "Los esquemas viven en el módulo dueño" y la nota de `clients` sobre su `UNIQUE(organization_id, id)`;
   - TraceabilityMatrix: nombres de índices, solo si cambian;
   - TestingStrategy: invariantes de esquema de conversaciones e ingestión cubiertos;
   - RepositoryStructure: fila de la 6.1 y las carpetas `conversations/` e `ingestion/`;
   - ADR 0013: una nota con el alcance extendido, si D-3 resuelve (a);
   - Overview no cambia.

## Alcance excluido

- Servicios, repositorios, `index.ts` y casos de uso de `conversations` e `ingestion`: 6.3 y 6.5.
- Seeds básicos o de volumen: 6.2.
- Lista de clientes por última interacción y conversaciones en la pantalla 7 (FR-CLI-04): 6.3 y 6.4.
- Pantallas 8 y 9, escape del cuerpo de los mensajes y verificación de `Origin`: 6.4 y el primer Route Handler mutante.
- Endpoint, contrato `docs/contracts/ingestion-v1.md`, fixtures, reserva atómica, comparación de `payload_hash` y su algoritmo: 6.5.1 y 6.5.2.
- Credenciales de servicio, su tabla y el límite de tasa: 6.5.3.
- Cambios en `audit_logs`, en sus enums o en `recordAudit`.
- Columnas que DataModel no declara, salvo las que resuelva D-4. Entre ellas: adjuntos, `message_count` (brief-1.2, D-3) y expiración de mensajes (brief-1.3, D-7).
- Canales distintos de `whatsapp`.
- Cualquier configuración, variable de entorno o credencial de un emisor real (FR-CONV-05, IntegrationBoundaries).
- Conectar la aplicación con `crm_app`: Fases 8 y 9.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/crm/schema.ts`, solo en lo que dice el punto 2.
- `src/modules/conversations/schema.ts` y `src/modules/ingestion/schema.ts`.
- `drizzle/0010_*.sql`, `drizzle/0011_*.sql` y los archivos de `drizzle/meta/` que genera Drizzle Kit.
- `tests/integration/conversations-schema.test.ts`.
- `tests/integration/identity-schema.test.ts`, `tests/integration/audit.test.ts` y `tests/integration/clients-schema.test.ts`, solo en lo que dice el punto 7.
- Los documentos del punto 8.
- Este brief y su fila en `docs/decisions/README.md`, más la corrección de la fila del brief-5.3 (hallazgo 12).
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md): reglas de diseño 1 a 14, tablas `conversations`, `messages` e `ingestion_events` y reglas del registro.
2. [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) y [ADR 0005](0005-metricas-desde-datos-transaccionales.md).
3. [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md): índices de las pantallas 6 a 9 y de las métricas 1 a 12.
4. [IntegrationBoundaries.md](../architecture/IntegrationBoundaries.md) y FR-CONV-01 a 05 en [FunctionalRequirements.md](../product/FunctionalRequirements.md).
5. [MetricsCatalog.md](../analytics/MetricsCatalog.md): nulabilidad que las métricas asumen.
6. [brief-1.2](brief-1.2-validacion-cruzada-del-modelo.md), D-2 a D-4, y [brief-1.3](brief-1.3-decisiones-de-producto-abiertas.md), D-7.
7. [Overview.md](../architecture/Overview.md): módulos y dependencias.
8. Precedentes: [brief-4.1](brief-4.1-migraciones-de-catalogo-e-inventario.md) (D-3, clave compuesta; solo inserción) y [brief-5.1](brief-5.1-migracion-de-clientes.md) (D-4).

## Dependencias

- Fase 5 cerrada (verificado).
- Contenedor de PostgreSQL en marcha.
- Autorización para `npm run db:migrate` contra la base de desarrollo.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-4 según la recomendación: (a) en D-1, D-2 y D-3, y (b) en D-4. La ejecución de las migraciones contra la base local de desarrollo sigue sin autorizar.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — `ingestion_events` en esta subfase

- **Opciones**:
  - (a) **Ahora**, como dice Notion: las tres tablas en la 6.1, y la 6.5.2 solo implementa la lógica del registro.
  - (b) **En la 6.5.2**, junto con su primer consumidor.
- **Recomendación**: (a).
  - El diseño de la tabla ya está completo en DataModel y la TraceabilityMatrix. Su consumidor (6.5.2) está en esta misma fase, así que no es una tabla especulativa.
  - Deja a la 6.5.2 concentrada en lo difícil: la reserva atómica y los reenvíos.
  - Con (b), la 6.5.2 mezcla migración y lógica, y la 6.5 ya es la subfase grande de la fase (L).
- **Consecuencia**: `src/modules/ingestion/` nace con `schema.ts`. Si D-4 resuelve (b), la 6.5.2 puede sumar columnas con una migración aditiva.

### D-2 — Coherencia interna de las filas

- **Opciones**:
  - (a) **Sumar estos `CHECK`**:
    - `btrim(external_ref) <> ''` en las tres tablas (cuando no es nulo), y `btrim(source) <> ''` y `btrim(event_type) <> ''` en `ingestion_events`;
    - `last_message_at IS NULL OR last_message_at >= started_at` en `conversations`;
    - en `ingestion_events`, `processed_at IS NULL` si y solo si `status = 'received'`, y `error_code IS NOT NULL` si y solo si `status = 'failed'`.
  - (b) **Solo los de identidad** (`external_ref`, `source` y `event_type` no vacíos).
  - (c) **Ninguno**, como DataModel: la coherencia la garantizan la ingestión y los seeds.
- **Recomendación**: (a).
  - Son las filas de las que salen las métricas (ADR 0005). Una conversación cuyo último mensaje es anterior a su inicio, o un evento `failed` sin código, corrompe las métricas 9 y 12 sin que nadie lo note.
  - Estas tablas las escriben dos caminos distintos (ingestión y seeds), y no hay pantalla para corregirlas. Por eso la base es la última defensa, con el mismo criterio que la 4.1 (D-5) para `inventory_movements.reason`.
  - `payload_hash` solo se valida como no vacío. Su formato depende del algoritmo, que decide la 6.5.1.
- **Consecuencia**:
  - la 6.5.2 escribe `status`, `processed_at` y `error_code` en un mismo `UPDATE`;
  - la regla "`started_at` coincide con el primer mensaje" sigue sin constraint, porque cruza filas: la prueban la 6.2 y la 6.5.2.

### D-3 — Protección de `messages` e `ingestion_events`

- **Opciones**:
  - (a) **Proteger las dos**:
    - `messages` de solo inserción como el ADR 0013: `crm_app` con `SELECT` e `INSERT`, y un trigger que rechaza `UPDATE` y `DELETE` para cualquier rol (`P0001`);
    - `ingestion_events` con `SELECT`, `INSERT` y `UPDATE` para `crm_app`, sin `DELETE`, y un trigger que rechaza `DELETE` y todo `UPDATE` que cambie `organization_id`, `source`, `external_ref`, `event_type`, `payload_hash` o `received_at`.
  - (b) **Solo privilegios**: los mismos `GRANT` que en (a), sin triggers.
  - (c) **Tablas escribibles**: `SELECT`, `INSERT`, `UPDATE` y `DELETE` en las dos, como `clients`.
- **Recomendación**: (a).
  - DataModel (regla 8) ya dice que estas tablas no se borran nunca. Hoy nada lo impide.
  - La aplicación todavía se conecta con el rol dueño (Fases 8 y 9), así que solo un trigger protege de verdad; el `GRANT` solo protege a `crm_app` (ADR 0013).
  - Si la identidad de un evento cambia, el registro deja de detectar reenvíos, y esa es la garantía central de FR-CONV-04.
  - La edición de mensajes no existe en el MVP. La retención de la Fase 9 revisará el trigger con su propia decisión.
- **Consecuencia**:
  - la regla 10 de DataModel y una nota en el ADR 0013 suman `messages` y la protección parcial de `ingestion_events`;
  - `audit.test.ts` pasa a tres categorías de privilegios;
  - `conversations` queda escribible (su estado cambia en la 6.3) y sin `DELETE` por ninguna pantalla, igual que `clients`.

### D-4 — Resultado del evento en el registro

- **Opciones**:
  - (a) **Ahora**: `ingestion_events` suma `conversation_id` y `message_id` nulos, con claves compuestas hacia sus tablas, para que un reenvío con el mismo hash devuelva el resultado original.
  - (b) **En la 6.5.2**, cuando el contrato (6.5.1) haya fijado qué devuelve la respuesta.
- **Recomendación**: (b).
  - La forma de la respuesta todavía no está decidida. Puede que baste con los `external_ref`, que ya permiten encontrar las filas por sus unicidades.
  - Una columna sin consumidor definido contradice la regla 6 de DataModel y la prohibición de adelantar diseño.
  - Sumarlas después es una migración aditiva sin backfill, porque la tabla no tiene datos reales.
- **Consecuencia**: DataModel registra el hueco en `ingestion_events` como pendiente de la 6.5.1 y la 6.5.2.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp. No hay configuración de ningún emisor real.
- Las tres tablas tienen `organization_id` con `ON DELETE RESTRICT`.
- Ninguna conversación referencia al cliente de otra organización, y ningún mensaje a la conversación de otra organización, cualquiera sea la vía de escritura.
- Nunca hay dos eventos con el mismo `(organization_id, source, external_ref)`.
- `messages` no guarda adjuntos ni columnas fuera de DataModel.
- Cada tabla de `public` tiene los privilegios esperados para `crm_app`.
- Sin código de servicio, sin `index.ts` en los módulos nuevos y sin `JOIN` entre módulos: esta subfase es solo esquema. Cada `schema.ts` importa solo los `schema.ts` de sus dependencias declaradas en Overview.
- Sin dependencias ni extensiones de PostgreSQL nuevas.
- `drizzle-kit generate` no produce migraciones después de la 0011.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: las migraciones 0010 y 0011 se aplican sobre una base vacía y sobre la de desarrollo, y aplicarlas otra vez no hace nada.
- **AC-3**: los casos del punto 6 pasan contra PostgreSQL real, cada uno con el SQLSTATE y el nombre de constraint esperados.
- **AC-4**: el test de cobertura de privilegios de `audit.test.ts` pasa con las tres tablas nuevas y sigue demostrando que falla ante una tabla sin sus privilegios.
- **AC-5**: `npm run test` pasa completo; los tests existentes solo cambiaron en lo que indica el punto 7.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones nuevas.
- **AC-7**: `npm run test:e2e` sigue pasando 50 de 50.
- **AC-8**: la CI queda en verde en el commit de la subfase, incluido el paso de desfase de migraciones, verificado con `gh run view`.
- **AC-9**: `git status` muestra solo archivos autorizados, y los documentos del punto 8 reflejan las resoluciones.
- **AC-10**: una búsqueda en el repositorio confirma que no se agregó ninguna variable de entorno, URL ni credencial de un emisor real (FR-CONV-05).

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: salida de `npm run test` con los tests de integración contra PostgreSQL 18.6 real, más las verificaciones con la base detenida.
- **Evidencia de protección**, si D-3 resuelve (a): los casos de trigger se corren una vez sin el trigger (quitándolo dentro de la transacción del test o en una corrida local descartada) para registrar que fallan, con el mismo criterio que la 4.3.2.
- **Evidencia de CI**: ejecución en verde con el paso de desfase y la integración.

**Nivel resultante esperado**: **validado localmente y en CI** para el esquema de conversaciones, mensajes e ingestión.

**No se valida**:

- la idempotencia del contrato de ingestión, que es lógica de la 6.5.2 (acá solo se prueba el mecanismo de base);
- la regla "`started_at` coincide con el primer mensaje" (6.2 y 6.5.2);
- las consultas y el rendimiento de los índices con volumen (6.2, 6.3 y Fase 8);
- la aplicación conectada con `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si Drizzle Kit no puede generar una clave compuesta, un índice parcial, un índice con `desc()` o un `CHECK`, y hace falta SQL a mano fuera de la 0011.
- Si la clave compuesta con `client_id` nulo no se comporta como `MATCH SIMPLE`.
- Si algún test existente necesita cambios distintos de los del punto 7.
- Si el paso de desfase de la CI detecta diferencias después de la 0011.
- Si aparece la necesidad de código de servicio, seeds, una dependencia, una extensión de PostgreSQL o una columna fuera de DataModel no resuelta en D-4.
- Antes de ejecutar migraciones contra la base de desarrollo, y antes de cualquier commit, push o cambio en Notion.

## Cierre (2026-09-16)

Cerrado con autorización del usuario. Se cumplen los diez criterios, con las dos desviaciones autorizadas que se describen abajo. Las migraciones se aplicaron en la base de desarrollo y una segunda corrida no hizo nada. La CI quedó en verde en el commit `5a60334` ([ejecución 35137789102](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35137789102), segundo intento, todos los pasos). El primer intento falló en el caso 1 de `clients.spec.ts`: axe encontró el `<title>` vacío justo después de una navegación en el cliente. Es una carrera ajena a esta subfase; el caso no espera el título antes de analizar. Queda como pendiente en el HANDOFF. Nivel alcanzado: **validado localmente y en CI**. La evidencia está en [CHANGELOG.md](../../CHANGELOG.md).

## Ejecución (2026-09-16)

Se activaron dos condiciones de detención, y el usuario autorizó cómo seguir en cada una:

1. **Orden de la migración generada.** Drizzle Kit emitió el `UNIQUE(organization_id, id)` de `clients` al final de la migración, después de la clave foránea de `conversations` que lo usa, y PostgreSQL la rechazó (`42830`). Sin editar SQL a mano, se generó en dos pasos:
   - `drizzle/0010_*`, solo con ese `UNIQUE`;
   - `drizzle/0011_*`, con las tres tablas;
   - `drizzle/0012_*`, a medida, con privilegios y triggers.
   La lista autorizada pasa de 0010 y 0011 a 0010, 0011 y 0012.
2. **`tests/e2e/clients.spec.ts`.** Su `TRUNCATE` de `clients` falló, porque PostgreSQL no vacía una tabla referenciada por otra sin vaciar las dos en la misma sentencia, aunque estén vacías. El hallazgo 11 solo había revisado el borrado de organizaciones. Se sumaron `messages` y `conversations` a las dos sentencias, sin `CASCADE`.

Otros ajustes dentro del alcance:

- `payload_hash` entra en el `CHECK` de identidad no vacía, como anticipaba D-2.
- El caso de `clients_organization_id_id_unique` quedó en `conversations-schema.test.ts`; `clients-schema.test.ts` no cambió.
- `audit.test.ts` suma un caso que demuestra que la verificación detecta un `DELETE` otorgado sobre `ingestion_events`.
- Los defaults de hora se comparan en el `RETURNING` de la inserción, porque `now()` es la hora de la transacción.
- La evidencia de los triggers quedó como tests permanentes: cada uno quita su trigger en una transacción revertida y demuestra que el cambio pasaría.
- TraceabilityMatrix no cambió: los índices conservan sus columnas.

Evidencia local:

- `npm run test`: 481 de 481, con 31 casos en `conversations-schema.test.ts`.
- Con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (188) y `build`, y `db:generate` no produce migraciones.
- `npm run test:e2e`: 50 de 50.
- AC-10: los archivos nuevos y modificados no agregan URLs, variables de entorno ni credenciales. `.env.example` no cambió.

Pendiente al terminar la ejecución (resuelto en el cierre):

- ejecutar las migraciones contra la base de desarrollo (sin autorizar);
- la CI del commit (AC-8);
- el cierre.
