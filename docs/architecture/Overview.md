# Arquitectura — Overview

**Estado: diseñado.**

## Contexto del sistema

```mermaid
graph LR
    User[Usuario admin/viewer] -->|HTTPS, sesión| App[CRM Web App]
    App -->|SQL| DB[(PostgreSQL propio)]
    Future[Sistema externo futuro\n(fuera del MVP, no conectado)] -.->|Contrato de ingestión\nHTTP idempotente| App
```

No hay hoy ninguna flecha hacia Airtable ni hacia el repositorio del agente de WhatsApp. La única superficie de integración futura es el contrato de ingestión, descrito en [IntegrationBoundaries.md](IntegrationBoundaries.md), y no está conectada a ningún origen real en el MVP.

## Estilo arquitectónico

Monolito modular en TypeScript. Una sola aplicación desplegable, organizada internamente en módulos con responsabilidad única y dependencias explícitas. Se descarta microservicios, colas de mensajes, event sourcing y orquestación distribuida: no hay necesidad concreta demostrada que lo justifique a esta escala (ver [decisions/README.md](../decisions/README.md), ADR-0002).

## Módulos y responsabilidades

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `auth` | Login, sesión, hash de contraseña, cierre de sesión | — |
| `organizations` | Organización, membresías, roles | `auth` |
| `catalog` | Productos, estados de stock derivados | `organizations` |
| `inventory` | Movimientos de inventario, ajustes transaccionales, saldo | `catalog`, `organizations` |
| `crm` | Clientes | `organizations` |
| `conversations` | Conversaciones, mensajes, timeline | `organizations`, `crm` |
| `ingestion` | Contrato de idempotencia, registro de eventos | `conversations`, `organizations` |
| `analytics` | Cálculo de métricas desde datos transaccionales | `conversations`, `organizations` |
| `audit` | Registro inmutable de cambios sensibles | `auth` y `organizations`, solo en `schema.ts` para sus claves foráneas ([brief-3.6](../decisions/brief-3.6-modulo-de-auditoria.md), D-5). Lo usan `catalog`, `inventory`, `crm`, `conversations` y `organizations` |

## Reglas de dependencia

- La UI llama a servicios de aplicación de un módulo; nunca hace queries SQL directas.
- Un módulo no importa código interno de otro módulo salvo a través de su interfaz pública (`index.ts` del módulo, que expone sus servicios y tipos). Se permite leer tablas de otro módulo desde `analytics` porque su función es agregación de solo lectura entre dominios — es la única excepción documentada.
- Ningún módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`) conoce detalles de HTTP, sesiones o presentación.
- La base de datos es compartida (un único schema), pero el acceso está encapsulado por módulo: cada módulo posee sus tablas y expone su propio repositorio; otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`.
- Un cambio auditado le pasa su transacción a `audit`: `recordAudit(tx, entry)` solo acepta una transacción, así que el registro persiste o se revierte junto con el cambio ([brief-3.6](../decisions/brief-3.6-modulo-de-auditoria.md), D-3).
- Un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla de negocio y la pasa a las funciones de los otros módulos, que la exigen por tipo. El alta de un miembro la abre `organizations`, que escribe `users` a través de `auth` y `audit_logs` a través de `audit` ([brief-3.7](../decisions/brief-3.7-gestion-de-usuarios-y-roles.md), D-2).
- Una lista con datos de dos módulos se compone en memoria, sin `JOIN`. La lista de miembros lee las membresías en `organizations` (filtradas por organización en SQL), pide a `auth` nombre, email y estado por ids, y filtra, ordena y pagina en memoria (brief-3.7, D-3). **Límite aceptado**: el costo crece con la cantidad de miembros; se revisa en la Fase 8 o si una organización supera los 500.
- El estado de stock cruza `catalog` e `inventory` ([brief-4.2](../decisions/brief-4.2-servicio-de-catalogo.md), D-1). `catalog` lo deriva con `deriveStockStatus`, una función pura. `inventory`, que depende de `catalog`, compone la lista y el detalle: lee los productos por la interfaz de `catalog` (texto y actividad filtrados en SQL), sus saldos por ids con 0 si no hay fila, y filtra por estado, ordena y pagina en memoria. `catalog` nunca importa `inventory`. **Límite aceptado**: la lista lee todos los productos que cumplen texto y actividad; se revisa en la Fase 8 o si una organización supera los 2 000 productos.

Dónde vive cada módulo en el repositorio y cómo se hacen cumplir estas reglas: [RepositoryStructure.md](RepositoryStructure.md).

## Flujo de datos — ejemplo: ajuste de stock

Implementado a nivel de servicio desde la 4.3.1 ([brief-4.3.1](../decisions/brief-4.3.1-transaccion-de-ajuste-de-stock.md)); la pantalla 5 y su Server Action llegan en la 4.4.

1. `adjustStock` de `inventory`, solo `admin`, valida antes de abrir la transacción el id, el tipo, la cantidad mayor a 0, el saldo que vio el usuario y el motivo, de 1 a 500 caracteres (D-2 y D-5).
2. Dentro de la transacción, `lockProductForStockChange` de `catalog` bloquea el producto con `FOR SHARE` (D-1). Inexistente o de otra organización → `NOT_FOUND`; desactivado → `BUSINESS_RULE_VIOLATION` con `rule: inactive_product`. Varios ajustes del mismo producto conviven en ese bloqueo; una edición o una desactivación, que toman `FOR UPDATE`, esperan a que el ajuste termine, y viceversa.
3. `inventory` crea la fila de `inventories` en 0 si falta (`INSERT … ON CONFLICT DO NOTHING`) y la bloquea con `FOR UPDATE`. El orden de bloqueos es siempre producto y después saldo.
4. Si el saldo difiere del esperado → `CONFLICT` con `currentQuantityOnHand` (D-2).
5. El saldo resultante se calcula en milésimas: negativo → `rule: negative_stock`; mayor que el máximo de `numeric(14, 3)` → `rule: stock_limit`. Ambos llevan `currentQuantityOnHand` y `requestedQuantity` como texto en la escala de la base (D-3, [ADR 0008](../decisions/0008-stock-nunca-negativo.md)).
6. `applyStockChange` inserta el movimiento con `balance_after` y actualiza `quantity_on_hand`; después `recordAudit` registra el ajuste (D-4). Es la única escritura del saldo en la aplicación, y `tests/guards/stock-writes.test.ts` lo hace cumplir (D-6).
7. Todo rechazo dentro de la transacción la revierte entera, incluida la fila de `inventories` que acababa de crear el primer ajuste. Nada queda a medias.

**Límite aceptado** (D-6): SQL escrito a mano contra la base puede cambiar el saldo sin movimiento; el `CHECK` sigue impidiendo el negativo.

## Estrategia de errores (diseño)

Todos los módulos comparten una taxonomía de errores con código estable:

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | La entrada no cumple el esquema (tipo, formato, longitud). |
| `UNAUTHENTICATED` | 401 | No hay sesión válida. |
| `FORBIDDEN` | 403 | Hay sesión, pero el rol no permite la acción dentro de la propia organización. |
| `NOT_FOUND` | 404 | El recurso no existe **o pertenece a otra organización**. Así no se revela su existencia. |
| `CONFLICT` | 409 | Se viola una unicidad (SKU, teléfono, email), hay una modificación concurrente o un reenvío de ingestión trae otro contenido. |
| `BUSINESS_RULE_VIOLATION` | 422 | Se viola una regla de dominio: stock negativo, ajuste sobre un producto desactivado, quitar el último `admin`. |
| `RATE_LIMITED` | 429 | Se superó el límite en login o ingestión. |
| `INTERNAL` | 500 | Error inesperado. |

Reglas:

- Los servicios de dominio producen errores tipados. Solo la capa HTTP o la UI los traduce a código de estado y mensaje visible. Un error de dominio nunca termina en `INTERNAL`.
- La validación del servicio es la primera defensa y las constraints de PostgreSQL (unique, check, FK) la última. Cuando salta una constraint, se traduce explícitamente a `CONFLICT` o `BUSINESS_RULE_VIOLATION`, sin propagarla como error genérico.
- Todo caso de uso que escribe en más de una tabla es atómico. No existen estados parciales que reconciliar en el MVP.
- Al usuario nunca se le muestran stack traces ni SQL. Los errores inesperados se registran completos en el servidor con un `request_id` que también ve el usuario.

Implementación ([brief-3.4](../decisions/brief-3.4-autorizacion-y-errores.md)):

- **Taxonomía** en `src/shared/errors/`: `ErrorCode`, `HTTP_STATUS` y `Failure`. Los servicios devuelven resultados tipados (`{ ok: true, ... } | Failure`) y solo lanzan ante lo inesperado, que la capa HTTP o la UI traduce a `INTERNAL` (D-1).
- **Log estructurado con `request_id`**: implementado en la 3.5 en `src/shared/log/` ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-9). JSON a la salida estándar con nivel, `request_id`, ruta, código de resultado y `user_id`; de un error, solo tipo y código. Lo usan las Server Actions de ingreso, cambio de contraseña y cierre de sesión, y el `request_id` se muestra al usuario solo en errores inesperados. `organization_id` y duración todavía no se registran.
- **Verificación de `Origin`** para Route Handlers mutantes: se ubica en `src/shared/http/` y se implementa con el primero que exista (D-5).

## Observabilidad (diseño)

- Un log estructurado (JSON) por request, con `request_id`, `organization_id`, `user_id`, ruta, código de resultado y duración. No incluye contenido de mensajes ni PII ([SecurityModel.md](SecurityModel.md)).
- Cada evento de ingestión queda en `ingestion_events` con estado terminal y `error_code` normalizado. Esa tabla, y no los logs, es la fuente de la métrica de errores de ingestión.
- Un endpoint `/api/health` verifica la conectividad con la base sin exponer detalles.
- No hay APM ni tracing distribuido en el MVP: en un monolito alcanza con logs correlacionados por `request_id`. Se reevalúa en la Fase 8 con evidencia.

## Despliegue (diseño, no implementado)

- Una única imagen/proceso de aplicación por entorno, sin estado en memoria compartido entre requests salvo cache local no crítico.
- Base de datos PostgreSQL gestionada por entorno (dev local vía Docker Compose; staging/producción como servicio gestionado o VM dedicada, a decidir en Fase 8/9).
- Migraciones SQL versionadas se aplican como paso explícito del pipeline de despliegue, nunca automáticamente contra producción sin aprobación.

## Backups (diseño)

- Backup lógico automático diario de la base de datos desde que exista staging persistente.
- Prueba de restauración periódica documentada (frecuencia a definir en la subfase 9.2) para que un backup no probado no se asuma válido.

## Evolución hacia ERP

El núcleo (`organizations`, `catalog`/`inventory`, `crm`) está diseñado para que un futuro módulo de `sales` pueda referenciar `clients` y `products` existentes sin modificar su forma actual — agregando sus propias tablas (`sales`, `sale_details`, etc.) y sus propias claves foráneas hacia las tablas existentes, sin alterar el dominio de catálogo, inventario o clientes. Ese trabajo es explícitamente una fase futura no planificada en detalle todavía (ver [planning/Roadmap.md](../planning/Roadmap.md), fases futuras de ERP).
