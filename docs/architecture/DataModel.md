# Modelo de Datos

**Estado: diseñado. Ninguna migración ha sido ejecutada todavía.**

## Reglas de diseño aplicadas a todas las tablas

1. Claves primarias `UUID` generadas por la aplicación o por `gen_random_uuid()`, independientes de cualquier identificador externo (Airtable, WhatsApp, etc.).
2. Toda tabla de datos de negocio tiene `organization_id` y ninguna consulta de negocio se ejecuta sin filtrarlo — aislamiento por organización desde el diseño, no como capa añadida después.
3. Todos los timestamps son `timestamptz` almacenados en UTC. La conversión a zona horaria de visualización ocurre en la capa de presentación/consulta, usando `organizations.timezone`.
4. Los enums de negocio se implementan como `CHECK` constraints o tipos `ENUM` de PostgreSQL explícitos, nunca como texto libre sin restricción.
5. Toda relación referencial usa `FOREIGN KEY` real con política `ON DELETE` explícita (`RESTRICT` por defecto; `CASCADE` solo donde el borrado lógico no aplica, ej. tablas puramente dependientes como `organization_members`).
6. Los índices se crean solo para consultas concretas del MVP (ver sección de índices), no especulativamente.
7. Unicidad e idempotencia se expresan como constraints `UNIQUE` de base de datos, no solo como validación de aplicación.
8. Borrado lógico (`deleted_at timestamptz null` o `is_active boolean`) en entidades editables por el usuario (`products`, `clients`, `users`). Las tablas de eventos (`inventory_movements`, `audit_logs`, `ingestion_events`, `messages`) no se borran nunca, ni física ni lógicamente.
9. Auditoría de cambios sensibles vía `audit_logs`, poblada por la capa de aplicación dentro de la misma transacción que el cambio.
10. `inventory_movements` es estrictamente insert-only: la aplicación no otorga a ningún rol de base de datos permisos de `UPDATE`/`DELETE` sobre esta tabla.
11. Todo ajuste de stock ocurre dentro de una transacción de base de datos que actualiza `inventories` e inserta en `inventory_movements` atómicamente.
12. `inventories.quantity_on_hand >= 0` por `CHECK` constraint — no se permiten cantidades negativas en el MVP (ver ADR correspondiente si el negocio decide lo contrario explícitamente).
13. El modelo de `conversations`/`messages` incluye `channel` como enum extensible desde el día uno, aunque el MVP solo usa `whatsapp`, para no rediseñar el dominio al agregar un segundo canal.
14. Ningún modelo de ventas, compras, proveedores o pagos existe en este schema.

## Diagrama entidad-relación

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ ORGANIZATION_MEMBERS : has
    USERS ||--o{ ORGANIZATION_MEMBERS : has
    ORGANIZATIONS ||--o{ CLIENTS : owns
    ORGANIZATIONS ||--o{ PRODUCTS : owns
    PRODUCTS ||--|| INVENTORIES : has
    PRODUCTS ||--o{ INVENTORY_MOVEMENTS : tracks
    ORGANIZATIONS ||--o{ INVENTORY_MOVEMENTS : scopes
    ORGANIZATIONS ||--o{ CONVERSATIONS : owns
    CLIENTS ||--o{ CONVERSATIONS : participates
    CONVERSATIONS ||--o{ MESSAGES : contains
    ORGANIZATIONS ||--o{ MESSAGES : scopes
    ORGANIZATIONS ||--o{ INGESTION_EVENTS : receives
    ORGANIZATIONS ||--o{ AUDIT_LOGS : scopes
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ INVENTORY_MOVEMENTS : performs
```

## Tablas

### `organizations`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `name` | text not null | |
| `slug` | text not null unique | usado en URLs |
| `timezone` | text not null default `'America/Argentina/Buenos_Aires'` | IANA tz, usada para presentar métricas. Valor por defecto fijado en la subfase 1.3 (D-5); en el MVP no hay pantalla para editarlo, pero la columna es real y el cálculo de métricas la respeta |
| `created_at`, `updated_at` | timestamptz not null | |

### `users`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `email` | text not null unique | |
| `password_hash` | text not null | argon2id/bcrypt |
| `name` | text not null | |
| `is_active` | boolean not null default true | |
| `created_at`, `updated_at` | timestamptz not null | |
| `deleted_at` | timestamptz null | borrado lógico |

### `organization_members`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `user_id` | uuid FK → users, not null | |
| `role` | enum(`admin`,`viewer`) not null | |
| `created_at`, `updated_at` | timestamptz not null | |
| — | `UNIQUE(organization_id, user_id)` | un usuario tiene un único rol por organización |

Índice: `(organization_id, user_id)` (cubre la unicidad y el lookup de membresía en cada request).

### `clients`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `display_name` | text not null | |
| `phone_e164` | text null | formato E.164 |
| `notes` | text null | |
| `is_active` | boolean not null default true | |
| `created_at`, `updated_at` | timestamptz not null | |
| `deleted_at` | timestamptz null | |
| — | `UNIQUE(organization_id, phone_e164) WHERE phone_e164 IS NOT NULL` | evita duplicados de teléfono por organización sin bloquear clientes sin teléfono |

Índices: `(organization_id, display_name text_pattern_ops)` para búsqueda por nombre; el `UNIQUE` parcial ya cubre búsqueda por teléfono.

### `products`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `sku` | text not null | |
| `name` | text not null | |
| `description` | text null | |
| `unit` | text not null default `'unidad'` | |
| `min_stock` | numeric not null default 0 | |
| `reorder_point` | numeric not null default 0 | |
| `is_active` | boolean not null default true | |
| `created_at`, `updated_at` | timestamptz not null | |
| `deleted_at` | timestamptz null | |
| — | `UNIQUE(organization_id, sku)` | |

Índices: `(organization_id, sku)` (unicidad + lookup), `(organization_id, name text_pattern_ops)` para búsqueda.

### `inventories`

Saldo actual, un registro por producto. Se mantiene siempre junto con `inventory_movements` en la misma transacción — nunca se escribe de forma aislada.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `product_id` | uuid FK → products, not null unique | 1:1 con producto |
| `quantity_on_hand` | numeric not null default 0 | `CHECK (quantity_on_hand >= 0)` |
| `updated_at` | timestamptz not null | |

Índice: `UNIQUE(product_id)` ya cubre el lookup principal.

### `inventory_movements`

Insert-only. Nunca se actualiza ni se borra.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `product_id` | uuid FK → products, not null | |
| `type` | enum(`inbound`,`outbound`,`adjustment_positive`,`adjustment_negative`) not null | |
| `quantity` | numeric not null | `CHECK (quantity > 0)`; el signo del efecto lo da `type`, no la cantidad |
| `reason` | text not null | motivo obligatorio, incluso para ajustes |
| `created_by` | uuid FK → users, not null | |
| `created_at` | timestamptz not null | |

Índices: `(organization_id, product_id, created_at desc)` para el historial por producto ordenado.

### `conversations`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `client_id` | uuid FK → clients, null | puede no resolverse a un cliente conocido |
| `channel` | enum(`whatsapp`) not null | extensible a futuro |
| `external_ref` | text null | referencia del sistema origen, para idempotencia |
| `status` | enum(`open`,`pending`,`closed`) not null default `'open'` | |
| `started_at` | timestamptz not null | |
| `last_message_at` | timestamptz null | |
| `created_at`, `updated_at` | timestamptz not null | |
| — | `UNIQUE(organization_id, channel, external_ref) WHERE external_ref IS NOT NULL` | idempotencia de ingestión |

Índices: `(organization_id, status, started_at desc)` para listado filtrado; `(client_id, started_at desc)` para "conversaciones del cliente".

### `messages`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `conversation_id` | uuid FK → conversations, not null | |
| `direction` | enum(`inbound`,`outbound`) not null | |
| `external_ref` | text null | referencia del sistema origen |
| `sent_at` | timestamptz not null | |
| `body_text` | text null | contenido textual; adjuntos fuera de alcance del MVP |
| `created_at` | timestamptz not null | |
| — | `UNIQUE(organization_id, conversation_id, external_ref) WHERE external_ref IS NOT NULL` | idempotencia |

Índice: `(conversation_id, sent_at)` para el timeline.

### `ingestion_events`

Ledger de idempotencia para el contrato de ingestión (diseñado, no conectado a tráfico real en el MVP).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `source` | text not null | identifica el sistema emisor |
| `external_ref` | text not null | id del evento en el sistema origen |
| `event_type` | text not null | |
| `payload_hash` | text not null | hash del payload canónico; detecta reenvíos con contenido distinto bajo la misma ref |
| `status` | enum(`received`,`processed`,`failed`) not null default `'received'` | |
| `error_code` | text null | código normalizado de la taxonomía de [Overview.md](Overview.md#estrategia-de-errores-diseño); nunca payload crudo, headers ni credenciales |
| `received_at` | timestamptz not null | |
| `processed_at` | timestamptz null | |
| — | `UNIQUE(organization_id, source, external_ref)` | idempotencia dura |

Reglas del ledger, derivadas del patrón *Reliable External Effects* del vault:

- **Reserva atómica**: `INSERT ... ON CONFLICT (organization_id, source, external_ref) DO NOTHING`, en la misma transacción que crea `conversations` y `messages`. Si no se insertó nada, es un reenvío.
- **Reenvío con el mismo `payload_hash`**: devuelve el resultado original sin generar efectos nuevos.
- **Reenvío con otro `payload_hash`**: `CONFLICT`, sin modificar datos. Nunca se sobrescribe en silencio.
- **Tabla dedicada**: la unicidad de `conversations.external_ref` y `messages.external_ref` es una segunda defensa, no el mecanismo de idempotencia.
- **Sanitización**: no se guarda el payload completo. El contenido útil ya vive en `messages` y el ledger solo guarda identidad, hash y resultado.

### `audit_logs`

Justificación de necesidad real: requisitos FR-AUD-01 y FR-AUD-02 sobre productos, clientes, stock, estado de conversaciones y roles. No se crea especulativamente.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organization_id` | uuid FK → organizations, not null | |
| `actor_user_id` | uuid FK → users, not null | |
| `entity_type` | enum(`product`,`client`,`inventory`,`conversation`,`organization_member`) not null | |
| `entity_id` | uuid not null | |
| `action` | enum(`create`,`update`,`deactivate`,`reactivate`,`stock_adjustment`,`status_change`,`role_change`) not null | |
| `diff` | jsonb not null | antes/después relevante |
| `created_at` | timestamptz not null | |

Índice: `(organization_id, entity_type, entity_id, created_at desc)` para "historial de esta entidad".

## Explícitamente fuera de este modelo

`sales`, `sale_details`, `purchases`, `purchase_details`, `suppliers`, `payments`, `cash_accounts`, cualquier tabla de contabilidad. Ninguna se crea vacía "para después".

## Preguntas abiertas sobre el modelo

- Política de retención de `messages` cuando exista tráfico real: ¿se conservan indefinidamente o hay un horizonte de borrado? **Diferida a la Fase 9** (subfase 1.3, D-7): en el MVP no hay tráfico ni volumen, así que decidirlo ahora sería decidirlo sin datos. En el MVP se conservan indefinidamente y `messages` no lleva columna de expiración; agregarla después es una migración aditiva, sin backfill.

Cerradas en la subfase 1.3 (2026-09-11):

- Identificador único de cliente: `(organization_id, phone_e164)` y nada más — [ADR 0007](../decisions/0007-identificador-de-cliente-solo-telefono.md).
- Excepciones al stock no negativo: no hay — [ADR 0008](../decisions/0008-stock-nunca-negativo.md).
