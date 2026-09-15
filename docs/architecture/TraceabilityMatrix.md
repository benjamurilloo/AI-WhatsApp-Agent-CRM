# Matriz de Trazabilidad

**Estado: diseñado.** Construida en la subfase 1.2 ([brief-1.2](../decisions/brief-1.2-validacion-cruzada-del-modelo.md)) sobre el modelo ya corregido. Relaciona pantallas ([Screens.md](../product/Screens.md), [wireframes](../product/wireframes/README.md)), requisitos ([FunctionalRequirements.md](../product/FunctionalRequirements.md)), tablas e índices ([DataModel.md](DataModel.md)) y métricas ([MetricsCatalog.md](../analytics/MetricsCatalog.md)).

Ninguna consulta se ejecutó: los índices se asignan por la forma de la consulta descrita, no por un plan real. En la Fase 4 en adelante, cada consulta se confirma con `EXPLAIN` sobre el seed de volumen.

## 1. Por pantalla

| Pantalla | FR | Tablas | Índices que usa |
|---|---|---|---|
| 1 Inicio de sesión | FR-ORG-02 (cambio de contraseña), FR-ORG-03 | `users`, `organization_members` | `users UNIQUE(email)`; `organization_members UNIQUE(user_id)` |
| 2 Dashboard | FR-MET-01, 02, 03 | `organizations`, `conversations`, `messages`, `clients`, `ingestion_events` | ver vista 4 |
| 3 Lista de productos | FR-PROD-01, 03, 04, 05 | `products`, `inventories` | `products UNIQUE(organization_id, lower(sku))`; `products (organization_id, lower(name) text_pattern_ops)`; `inventories UNIQUE(product_id)` |
| 4 Detalle de producto | FR-PROD-01, 02, 03, 05, 09; FR-AUD-02 | `products`, `inventories`, `inventory_movements`, `audit_logs`, `users` | PK de `products`; `inventories UNIQUE(product_id)`; `inventory_movements (organization_id, product_id, created_at desc)`; `audit_logs (organization_id, entity_type, entity_id, created_at desc)` |
| 5 Ajuste e historial | FR-PROD-06, 07, 08, 09 | `inventories`, `inventory_movements`, `products`, `users` | `inventories UNIQUE(product_id)` (bloqueo de fila del ajuste); `inventory_movements (organization_id, product_id, created_at desc)` |
| 6 Lista de clientes | FR-CLI-01, 03, 05, 06 | `clients`, `conversations` | `clients UNIQUE(organization_id, phone_e164) WHERE phone_e164 IS NOT NULL`; `clients (organization_id, display_name text_pattern_ops)`; `conversations (organization_id, client_id, last_message_at desc)` |
| 7 Detalle de cliente | FR-CLI-01, 02, 04, 05, 06, 07; FR-AUD-02 | `clients`, `conversations`, `messages`, `audit_logs`, `users` | PK de `clients`; `conversations (organization_id, client_id, last_message_at desc)`; `messages (conversation_id, sent_at)`; `audit_logs (organization_id, entity_type, entity_id, created_at desc)` |
| 8 Lista de conversaciones | FR-CONV-01, 03 | `conversations`, `clients`, `messages` | `conversations (organization_id, last_message_at desc)`; `messages (conversation_id, sent_at)` |
| 9 Detalle de conversación | FR-CONV-02, 03; FR-AUD-01 | `conversations`, `messages`, `clients`, `audit_logs` | PK de `conversations`; `messages (conversation_id, sent_at)` |
| 10 Usuarios y roles | FR-ORG-01, 02; FR-AUD-01 | `users`, `organization_members`, `audit_logs` | `organization_members (organization_id)`; `users UNIQUE(email)` |

Marco común (pantallas 2 a 10): `organizations.name`, `users.name`, `organization_members.role`, resueltos con el `UNIQUE(user_id)` de la membresía en cada request.

## 2. Por requisito funcional

Cada FR tiene al menos una pantalla, endpoint o invariante con test que lo satisface.

| FR | Se satisface en | Tipo |
|---|---|---|
| FR-ORG-01 | Toda consulta filtrada por `organization_id`; test de aislamiento entre organizaciones ([TestingStrategy](../development/TestingStrategy.md)); [ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md) | invariante con test |
| FR-ORG-02 | Pantalla 10; paso de cambio de contraseña de la pantalla 1 | pantalla |
| FR-ORG-03 | Redirección a la pantalla 1 desde toda ruta protegida | pantalla e invariante |
| FR-PROD-01 | Pantalla 3 (acción crear) y formulario de la pantalla 4 en modo alta | pantalla |
| FR-PROD-02 | Pantalla 4 | pantalla |
| FR-PROD-03 | Pantalla 4 (desactivar); filtro "solo activos" de la pantalla 3; rechazo de ajuste en la pantalla 5 | pantalla |
| FR-PROD-04 | Pantalla 3 | pantalla |
| FR-PROD-05 | Pantallas 3 y 4; test unitario de la derivación | pantalla e invariante |
| FR-PROD-06 | Pantalla 5 | pantalla |
| FR-PROD-07 | Sin vía de escritura directa; test de que `balance_after` coincide con el saldo | invariante con test |
| FR-PROD-08 | Pantalla 5; test de rechazo sin movimiento ([ADR 0008](../decisions/0008-stock-nunca-negativo.md)) | pantalla e invariante |
| FR-PROD-09 | Pantallas 4 y 5 | pantalla |
| FR-CLI-01 | Pantalla 6 (acción crear) y formulario de la pantalla 7 en modo alta | pantalla |
| FR-CLI-02 | Pantalla 7 | pantalla |
| FR-CLI-03 | Pantalla 6 | pantalla |
| FR-CLI-04 | Pantalla 7 | pantalla |
| FR-CLI-05 | Pantallas 6 y 7; revisión de minimización en la Fase 8 | pantalla y revisión |
| FR-CLI-06 | Pantallas 6 y 7, enmascarado en el servidor | pantalla |
| FR-CLI-07 | `UNIQUE(organization_id, phone_e164)`; test de unicidad | invariante con test |
| FR-CONV-01 | Pantalla 8 | pantalla |
| FR-CONV-02 | Pantalla 9 | pantalla |
| FR-CONV-03 | Pantalla 8 (filtro) y pantalla 9 (cambio) | pantalla |
| FR-CONV-04 | Endpoint de ingestión (subfase 6.5); test de idempotencia | endpoint |
| FR-CONV-05 | Configuración sin orígenes reales; verificación en el gate de la Fase 6 | invariante |
| FR-MET-01 | Pantalla 2 | pantalla |
| FR-MET-02 | Pantalla 2 (período y zona horaria) | pantalla |
| FR-MET-03 | Pantalla 2 sin valores editables; cálculo por consulta ([ADR 0005](../decisions/0005-metricas-desde-datos-transaccionales.md)) | pantalla e invariante |
| FR-AUD-01 | Escritura de `audit_logs` en la misma transacción que cada cambio (pantallas 4, 5, 7, 9 y 10) | invariante |
| FR-AUD-02 | Pantallas 4 y 7 | pantalla |

## 3. Por índice

Cada índice tiene al menos una consulta real que lo usa.

| Tabla | Índice | Consulta | Dónde |
|---|---|---|---|
| `users` | `UNIQUE(email)` | login por email; `CONFLICT` al crear usuario | pantallas 1 y 10 |
| `organization_members` | `UNIQUE(user_id)` | membresía y rol del usuario en cada request | todas |
| `organization_members` | `(organization_id)` | lista de usuarios de la organización; conteo de `admin` activos para la regla del último `admin` | pantalla 10 |
| `clients` | `UNIQUE(organization_id, phone_e164) WHERE phone_e164 IS NOT NULL` | búsqueda por teléfono completo; `CONFLICT` por duplicado | pantallas 6 y 7 |
| `clients` | `(organization_id, display_name text_pattern_ops)` | búsqueda por prefijo de nombre | pantalla 6 |
| `products` | `UNIQUE(organization_id, lower(sku))` | búsqueda exacta por SKU sin distinguir mayúsculas; `CONFLICT` por duplicado (brief-4.1, D-6) | pantallas 3 y 4 |
| `products` | `UNIQUE(organization_id, id)` | destino de las claves foráneas compuestas de `inventories` e `inventory_movements`; ninguna consulta lo usa (brief-4.1, D-3) | — |
| `products` | `(organization_id, lower(name) text_pattern_ops)` | búsqueda por prefijo de nombre sin distinguir mayúsculas (brief-4.2, D-3) | pantalla 3 |
| `inventories` | `UNIQUE(product_id)` | saldo del producto y bloqueo de fila del ajuste | pantallas 3, 4 y 5 |
| `inventory_movements` | `(organization_id, product_id, created_at desc)` | historial del producto, del más reciente al más antiguo | pantallas 4 y 5 |
| `conversations` | `UNIQUE(organization_id, channel, external_ref) WHERE external_ref IS NOT NULL` | idempotencia de ingestión (segunda defensa) | endpoint de ingestión |
| `conversations` | `(organization_id, last_message_at desc)` | lista filtrada por período y ordenada por último mensaje | pantalla 8 |
| `conversations` | `(organization_id, client_id, last_message_at desc)` | última interacción por cliente; conversaciones de un cliente | pantallas 6 y 7 |
| `conversations` | `(organization_id, started_at)` | conversaciones iniciadas en el intervalo | métricas 1 y 10 |
| `messages` | `UNIQUE(organization_id, conversation_id, external_ref) WHERE external_ref IS NOT NULL` | idempotencia de ingestión (segunda defensa) | endpoint de ingestión |
| `messages` | `(conversation_id, sent_at)` | timeline; conteo por conversación; primer mensaje de la conversación | pantallas 7, 8 y 9; métrica 9 |
| `messages` | `(organization_id, sent_at)` | mensajes de la organización en el intervalo | métricas 2 a 10 |
| `ingestion_events` | `UNIQUE(organization_id, source, external_ref)` | reserva atómica del ledger | endpoint de ingestión |
| `ingestion_events` | `(organization_id, received_at)` | eventos recibidos en el intervalo | métrica 12 |
| `audit_logs` | `(organization_id, entity_type, entity_id, created_at desc)` | historial de auditoría de una entidad | pantallas 4 y 7 |

### Índices quitados en esta subfase

- `conversations (organization_id, status, started_at desc)`: ninguna consulta ordena por inicio dentro de un estado. El filtro por estado de la pantalla 8 se aplica sobre `(organization_id, last_message_at desc)`, y la métrica 1 usa `(organization_id, started_at)`.
- `conversations (client_id, started_at desc)`: las conversaciones del cliente se ordenan por último mensaje y las sirve `(organization_id, client_id, last_message_at desc)`.

### Consultas que filtran u ordenan sin índice propio, con justificación

| Consulta | Dónde | Por qué no lleva índice propio |
|---|---|---|
| Filtro por estado de stock | pantalla 3 | Es derivado (FR-PROD-05) y no se puede indexar sin desnormalizar. Se evalúa sobre los productos de una organización, un volumen del orden de cientos en el MVP. |
| Orden por nombre de productos | pantalla 3 | Un índice `text_pattern_ops` sirve prefijos pero no el orden con la collation de la base. Se ordena después de filtrar por organización; se confirma con `EXPLAIN` en la Fase 4. |
| Búsqueda por contenido (no prefijo) de nombre o SKU | pantallas 3 y 6 | La especificación no define si la búsqueda es por prefijo o por contenido. Los índices soportan prefijo; buscar por contenido necesitaría otro tipo de índice, a decidir en las fases 4 y 5 si se requiere. Ver hallazgo H-3. |
| Filtro activos o inactivos | pantallas 3, 6 y 10 | Columna booleana de baja selectividad; se aplica sobre el índice de la organización. |
| Filtro por estado y canal de conversación | pantallas 7 y 8 | Se aplica sobre el índice por último mensaje. `channel` solo tiene un valor en el MVP. |
| Filtro por tipo y período de movimientos | pantalla 5 | Se aplica sobre el historial de un solo producto, ya acotado por su índice. |
| Filtro por rol | pantalla 10 | Se aplica sobre los miembros de una organización, pocas filas. |
| Agrupación por estado | métrica 11 | Se aplica sobre la población A, ya acotada por `messages (organization_id, sent_at)`. |
| Cambio de estado y lecturas por id | pantallas 4, 7 y 9 | Clave primaria. |

## 4. Por métrica

| Métrica | Tablas | Índices |
|---|---|---|
| 1 Conversaciones iniciadas | `conversations` | `(organization_id, started_at)` |
| 2 Conversaciones con actividad | `messages`, `conversations` | `messages (organization_id, sent_at)` |
| 3 Clientes únicos | `messages`, `conversations` | `messages (organization_id, sent_at)`; PK de `conversations` |
| 4 y 5 Mensajes entrantes y salientes | `messages` | `(organization_id, sent_at)` |
| 6 Mensajes por conversación | `messages` | `(organization_id, sent_at)` |
| 7 Conversaciones respondidas | `messages` | `(organization_id, sent_at)` |
| 8 Cobertura de respuesta | `messages` | `(organization_id, sent_at)` |
| 9 Mediana del tiempo a primera respuesta | `messages` | `(organization_id, sent_at)` para acotar candidatos; `(conversation_id, sent_at)` para confirmar el primer `inbound` y el primer `outbound` posterior |
| 10 Evolución diaria | `conversations`, `messages` | `conversations (organization_id, started_at)`; `messages (organization_id, sent_at)` |
| 11 Distribución por estado | `messages`, `conversations` | `messages (organization_id, sent_at)`; PK de `conversations` |
| 12 Errores de ingestión | `ingestion_events` | `(organization_id, received_at)`. La disponibilidad sale de la configuración del entorno (D-7) |

La zona horaria de todas las métricas sale de `organizations.timezone`.

## Hallazgos

Aparecieron al armar la matriz, fuera de las once decisiones del brief. Resueltos o diferidos por el usuario el 2026-09-12.

| Id | Hallazgo | Resolución |
|---|---|---|
| H-1 | `users`, `clients` y `products` tenían a la vez `is_active` y `deleted_at`, y ninguna pantalla borra. | Resuelto: se quitó `deleted_at`; el borrado lógico es solo `is_active`. |
| H-2 | `organizations.slug` ("usado en URLs") no tenía consumidor con una organización por usuario. | Resuelto: se quitó la columna con su índice único. |
| H-3 | La búsqueda de las pantallas 3 y 6 no define si es por prefijo o por contenido. | Diferido a las Fases 4 (productos) y 5 (clientes), registrado en [Risks.md](../planning/Risks.md). |
| H-4 | [SecurityModel.md](SecurityModel.md) decía "organización(es)", contra el ADR 0010. | Resuelto: corregido, junto con `Scope.md` (mínimos) y el riesgo de sesión multi-organización de `Risks.md`. |
| H-5 | Falta un test de que la respuesta a un `viewer` no contiene el teléfono completo (FR-CLI-06). | Diferido a la Fase 5, registrado en [Risks.md](../planning/Risks.md). |

## Observaciones

- **Alta de productos y clientes**: ninguna pantalla define un formulario de alta separado. La matriz asume que el alta usa el mismo formulario de las pantallas 4 y 7 en modo alta, lo que es coherente con los wireframes pero no está escrito en `Screens.md`.
