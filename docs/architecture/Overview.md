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
| `catalog` | Productos, estados de stock derivados, historial de auditoría del producto | `organizations`, `audit`, `auth` (nombre del autor, brief-4.4) |
| `inventory` | Movimientos de inventario, ajustes transaccionales, saldo, historial de movimientos | `catalog`, `organizations`, `audit`, `auth` (nombre del autor, brief-4.3.3) |
| `crm` | Clientes, teléfono enmascarado por rol, historial de auditoría del cliente | `organizations`, `audit`, `auth` (nombre del autor, brief-5.2) |
| `conversations` | Conversaciones, mensajes, timeline, cambio de estado auditado, actividad del cliente y lista de clientes por última interacción | `organizations`, `crm`, `audit` (brief-6.3) |
| `ingestion` | Contrato de idempotencia, registro de eventos; abre la transacción y le pide la proyección a `conversations`, que resuelve el cliente con `crm` (brief-6.5.2) | `conversations`, `organizations` |
| `analytics` | Cálculo de métricas desde datos transaccionales, de solo lectura: resolución del período y una función por tarjeta del dashboard ([brief-7.1](../decisions/brief-7.1-metricas-de-volumen.md), D-1 y D-2). Desde la 7.2 suma las métricas de respuesta y estado, con la única lectura que sale del período: la primera respuesta de una conversación ([brief-7.2](../decisions/brief-7.2-metricas-de-respuesta-y-estado.md), D-2). Desde la 7.4 expone además `getMetricsPeriod`, que resuelve el período compartido de la pantalla sin leer ninguna tabla de datos ([brief-7.4](../decisions/brief-7.4-dashboard.md), D-6). Desde la 7.3 suma la métrica 12, que lee `ingestion_events` desde `ingestion/schema` y la configuración del entorno con `readIngestionConfig` de la interfaz pública de `ingestion`, para distinguir "no disponible" de "sin datos" ([brief-7.3](../decisions/brief-7.3-metrica-de-errores-de-ingestion.md), D-1). Lee `conversations` y `messages` desde `conversations/schema`, y la zona con `getOrganizationTimezone` | `conversations` (solo su `schema.ts`), `ingestion` (su `schema.ts` y su interfaz pública), `organizations` |
| `audit` | Registro inmutable de cambios sensibles y su lectura por entidad | `auth` y `organizations`, solo en `schema.ts` para sus claves foráneas ([brief-3.6](../decisions/brief-3.6-modulo-de-auditoria.md), D-5). Lo usan `catalog`, `inventory`, `crm`, `conversations` y `organizations`. Su lectura no autoriza ni compone nombres: eso lo hace el módulo dueño de la entidad, para no invertir esta dependencia ([brief-4.4](../decisions/brief-4.4-ui-de-productos-e-inventario.md), D-1) |

## Reglas de dependencia

- La UI llama a servicios de aplicación de un módulo; nunca hace queries SQL directas.
- Un módulo no importa código interno de otro módulo salvo a través de su interfaz pública (`index.ts` del módulo, que expone sus servicios y tipos). Se permite leer tablas de otro módulo desde `analytics` porque su función es agregación de solo lectura entre dominios — es la única excepción documentada.
- Ningún módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`) conoce detalles de HTTP, sesiones o presentación.
- La base de datos es compartida (un único schema), pero el acceso está encapsulado por módulo: cada módulo posee sus tablas y expone su propio repositorio; otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`.
- Un cambio auditado le pasa su transacción a `audit`: `recordAudit(tx, entry)` solo acepta una transacción, así que el registro persiste o se revierte junto con el cambio ([brief-3.6](../decisions/brief-3.6-modulo-de-auditoria.md), D-3).
- Un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla de negocio y la pasa a las funciones de los otros módulos, que la exigen por tipo. El alta de un miembro la abre `organizations`, que escribe `users` a través de `auth` y `audit_logs` a través de `audit` ([brief-3.7](../decisions/brief-3.7-gestion-de-usuarios-y-roles.md), D-2).
- Una lista con datos de dos módulos se compone en memoria, sin `JOIN`. La lista de miembros lee las membresías en `organizations` (filtradas por organización en SQL), pide a `auth` nombre, email y estado por ids, y filtra, ordena y pagina en memoria (brief-3.7, D-3). **Límite aceptado**: el costo crece con la cantidad de miembros; **medido en la 8.5** con 500 miembros, exactamente el límite: 8,7 ms de camino completo ([brief-8.5](../decisions/brief-8.5-rendimiento-de-listados.md)). El límite se sostiene.
- El estado de stock cruza `catalog` e `inventory` ([brief-4.2](../decisions/brief-4.2-servicio-de-catalogo.md), D-1). `catalog` lo deriva con `deriveStockStatus`, una función pura. `inventory`, que depende de `catalog`, compone la lista y el detalle: lee los productos por la interfaz de `catalog` (texto y actividad filtrados en SQL), sus saldos por ids con 0 si no hay fila, y filtra por estado, ordena y pagina en memoria. `catalog` nunca importa `inventory`. **Límite aceptado**: la lista lee todos los productos que cumplen texto y actividad; **medido en la 8.5** con 10 000 productos, cinco veces el límite: 133 ms de camino completo, de los cuales solo 4,5 ms son la consulta ([brief-8.5](../decisions/brief-8.5-rendimiento-de-listados.md)). El límite se sostiene con holgura.
- La lista de clientes por última interacción cruza `crm` y `conversations` ([brief-6.3](../decisions/brief-6.3-servicio-de-consulta-y-estado.md), D-1). La compone `conversations`, que depende de `crm`:
  1. `crm` devuelve, con `listClientOrderKeys`, los ids que cumplen texto y actividad, en orden de nombre y sin datos del cliente;
  2. `conversations` lee la última interacción por cliente con una consulta agrupada, ordena de forma estable y corta la página en memoria;
  3. `crm` devuelve los clientes de la página con `getClientsByIds`, con el teléfono según el rol.

  Los nombres de los clientes de las conversaciones también llegan por `getClientsByIds`, y `conversations` descarta el teléfono. `crm` nunca importa `conversations`. **Límite aceptado**: la lista lee los ids de todos los clientes que cumplen el filtro. Con 10.000 clientes tarda menos de 100 ms en local (medición en el brief-6.3), confirmado en la **8.5**: 53,6 ms de camino completo.

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

### Lectura del historial

Implementada a nivel de servicio desde la 4.3.3 ([brief-4.3.3](../decisions/brief-4.3.3-historial-de-movimientos.md)); las pantallas 4 y 5 la usan desde la 4.4.

1. `listStockMovements` de `inventory`, para `admin` y `viewer`, resuelve autorización, id y organización con `getProduct` de `catalog`: un producto desactivado conserva su historial.
2. Valida los filtros de la URL: tipo, fechas `YYYY-MM-DD` inclusivas y período no invertido.
3. `getOrganizationTimezone` de `organizations` aporta la zona IANA (D-4). PostgreSQL convierte el período a `[desde 00:00, hasta + 1 día 00:00)` en esa zona (D-3).
4. Cuenta y pagina de a 25 en SQL, del más reciente al más antiguo (D-2). `created_at` es la hora del `INSERT`, que ocurre con el saldo bloqueado, así que ese orden sigue la cadena de saldos también bajo concurrencia (D-1).
5. Compone el nombre del autor con `getUserSummaries` de `auth`, sin `JOIN`, y devuelve la zona usada.

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
- No hay APM ni tracing distribuido en el MVP: en un monolito alcanza con logs correlacionados por `request_id`. **Se reevalúa en la Fase 10**, no en la 8 (brief-8.4, D-6): la reevaluación pide evidencia, y sin un entorno desplegado ni tráfico la respuesta saldría de la falta de datos y no de un criterio. Estaba asignada a la 9.4; la 9.4 se disolvió el 2026-09-23 al cerrar la Fase 9 con su gate enmendado, y la reevaluación pasó a la Fase 10. Llega con un insumo más fuerte que el tráfico sintético que se esperaba: la decisión de que el agente de WhatsApp dependa del CRM de forma sincrónica.

## Despliegue (implementado en staging; producción sigue siendo diseño)

- Una única imagen/proceso de aplicación por entorno, sin estado en memoria compartido entre requests salvo cache local no crítico.
- Base de datos PostgreSQL gestionada por entorno (dev local vía Docker Compose; staging resuelto en la 9.1 el 2026-09-22 como **VM dedicada** —un droplet con PostgreSQL 18.6 en la misma máquina— y los secretos en archivos `0600` de `root` bajo `/etc/crm-staging/`, sin gestor; **producción sigue a decidir**, y la 9.2 le agregó una incógnita concreta: está sin verificar si un servicio gestionado exige superusuario para restaurar. La 8.4 quitó el "Fase 8/9" porque una decisión que cabe en dos fases no se toma en ninguna).
- Migraciones SQL versionadas se aplican como paso explícito del pipeline de despliegue, nunca automáticamente contra producción sin aprobación.

## Backups (implementado en staging)

- Backup lógico automático diario de la base de datos desde que exista staging persistente.
- Prueba de restauración periódica **ejecutada**, no solo documentada, para que un backup no probado no se asuma válido. **Cadencia fijada en la 9.2 el 2026-09-22**: backup diario, ejercicio de restauración mensual, con control negativo que demuestra que el ejercicio puede fallar.

## Evolución hacia ERP

El núcleo (`organizations`, `catalog`/`inventory`, `crm`) está diseñado para que un futuro módulo de `sales` pueda referenciar `clients` y `products` existentes sin modificar su forma actual — agregando sus propias tablas (`sales`, `sale_details`, etc.) y sus propias claves foráneas hacia las tablas existentes, sin alterar el dominio de catálogo, inventario o clientes. Ese trabajo es explícitamente una fase futura no planificada en detalle todavía (ver [planning/Roadmap.md](../planning/Roadmap.md), fases futuras de ERP).
