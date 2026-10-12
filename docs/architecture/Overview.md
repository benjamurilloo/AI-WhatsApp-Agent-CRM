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
| `catalog` | Productos, estados de stock derivados, historial de auditoría del producto; desde la 11.3, la búsqueda de servicio de los activos con su precio vigente | `organizations`, `audit`, `auth` (nombre del autor, brief-4.4) |
| `inventory` | Movimientos de inventario, ajustes transaccionales, saldo, historial de movimientos; desde la 11.3, la lectura de servicio del catálogo, con el estado de stock y sin la cantidad; desde la 16.6, la cantidad de un producto activo, solo por su propia ruta de lectura ([brief-16.6](../decisions/brief-16.6-la-cantidad-de-stock-para-el-agente.md)); desde la 19.4, las mismas lecturas con lo disponible para la lectura v2 ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), D-12) | `catalog`, `organizations`, `audit`, `auth` (nombre del autor, brief-4.3.3) |
| `crm` | Clientes, teléfono enmascarado por rol, historial de auditoría del cliente | `organizations`, `audit`, `auth` (nombre del autor, brief-5.2) |
| `conversations` | Conversaciones, mensajes, timeline, cambio de estado auditado, pausa del agente (16.3), notas internas (16.4), actividad del cliente y lista de clientes por última interacción | `organizations`, `crm`, `audit` (brief-6.3); desde la 16.4, `auth` solo en `schema.ts`, para la clave foránea del autor de `conversation_notes` |
| `ingestion` | Contrato de idempotencia, registro de eventos; abre la transacción y le pide la proyección a `conversations`, que resuelve el cliente con `crm` (brief-6.5.2). Desde la 11.3 guarda también las credenciales de la API de lectura, con su alcance, y las autentica ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md), D-2). Desde la 12.1 le pide a `crm` la resolución del cliente de `client.resolved`, y desde la 12.2 a `conversations` la conversación vigente y la derivación. *Desde la 19.4* ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), D-7) le pasa a `orders` la transacción de `order.placed` | `conversations`, `crm` (*agregado el 2026-09-25: lo importa desde la 12.1, y esta celda no se había actualizado; lo encontró la revisión independiente de la 12.2*), `organizations`; *desde la 19.4*, `orders` (`placeOrderFromIngestion` y `findOrderPlacedByIngestion`) |
| `knowledge` | Información del negocio: entradas con título, categoría, contenido y vigencia, editables con auditoría y sin borrado; lista y búsqueda por palabras; estado de vigencia calculado con el día de la zona de la organización ([brief-11.2](../decisions/brief-11.2-informacion-del-negocio.md)). La 11.3.2 expone las vigentes por la API de lectura | `organizations` (autorización, zona y nombre del autor), `audit` |
| `analytics` | Cálculo de métricas desde datos transaccionales, de solo lectura: resolución del período y una función por tarjeta del dashboard ([brief-7.1](../decisions/brief-7.1-metricas-de-volumen.md), D-1 y D-2). Desde la 7.2 suma las métricas de respuesta y estado, con la única lectura que sale del período: la primera respuesta de una conversación ([brief-7.2](../decisions/brief-7.2-metricas-de-respuesta-y-estado.md), D-2). Desde la 7.4 expone además `getMetricsPeriod`, que resuelve el período compartido de la pantalla sin leer ninguna tabla de datos ([brief-7.4](../decisions/brief-7.4-dashboard.md), D-6). Desde la 7.3 suma la métrica 12, que lee `ingestion_events` desde `ingestion/schema` y la configuración del entorno con `readIngestionConfig` de la interfaz pública de `ingestion`, para distinguir "no disponible" de "sin datos" ([brief-7.3](../decisions/brief-7.3-metrica-de-errores-de-ingestion.md), D-1). Lee `conversations` y `messages` desde `conversations/schema`, y la zona con `getOrganizationTimezone` | `conversations` (solo su `schema.ts`), `ingestion` (su `schema.ts` y su interfaz pública), `organizations` |
| `numbering` | *Desde la 19.2*: la numeración sin huecos de los documentos, por organización y tipo ([ADR 0019](../decisions/0019-bases-de-los-comprobantes.md), punto 2; [ADR 0020](../decisions/0020-el-pedido.md), punto 2). Sin pantalla: una función que recibe la transacción del módulo que crea el documento | `organizations`, solo en `schema.ts` |
| `orders` | *Desde la 19.2*: el pedido de un cliente, con sus líneas, su total, su número y sus estados; el alta de un pendiente, su cancelación, la lista y el detalle ([ADR 0020](../decisions/0020-el-pedido.md); [brief-19.2](../decisions/brief-19.2-el-pedido.md)). Abre la transacción del alta y se la pasa a `crm` (el cliente), `catalog` (los productos y su precio), `numbering` y `audit` | `crm`, `catalog`, `numbering`, `organizations`, `audit`; `auth`, solo en `schema.ts` para la clave del autor. Desde la 19.3, `inventory` (la reserva y la entrega; en vigor desde el 2026-10-11, brief-19.3): `orders` le pasa su transacción a `reserveStock`, `releaseStock` y `deliverStock`, y lee lo disponible con `getAvailableStock`. `inventory` no depende de `orders`: recibe líneas y el motivo ya escrito. Ningún módulo depende de `orders`. *Corregido el 2026-10-11 en la 19.4* ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), H-3 y D-7): **`ingestion` depende de `orders`**, que recibe su transacción para dejar el pendiente del agente con las reglas del alta, compartidas con `createOrder`, y bloquea al cliente por teléfono con `crm`. `orders` no depende de `ingestion` salvo en `schema.ts`, para las dos claves compuestas del autor de servicio y del evento, como `audit`; el emisor de la credencial lo compone la página |
| `audit` | Registro inmutable de cambios sensibles y su lectura por entidad | `auth` y `organizations`, solo en `schema.ts` para sus claves foráneas ([brief-3.6](../decisions/brief-3.6-modulo-de-auditoria.md), D-5). Lo usan `catalog`, `inventory`, `crm`, `conversations`, `organizations`, desde la 11.2 `knowledge` y desde la 19.2 `orders`. Su lectura no autoriza ni compone nombres: eso lo hace el módulo dueño de la entidad, para no invertir esta dependencia ([brief-4.4](../decisions/brief-4.4-ui-de-productos-e-inventario.md), D-1) |

## Reglas de dependencia

- La UI llama a servicios de aplicación de un módulo; nunca hace queries SQL directas.
- Un módulo no importa código interno de otro módulo salvo a través de su interfaz pública (`index.ts` del módulo, que expone sus servicios y tipos). Se permite leer tablas de otro módulo desde `analytics` porque su función es agregación de solo lectura entre dominios — es la única excepción documentada.
- Ningún módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`, desde la 11.2 `knowledge` y desde la 19.2 `orders` y `numbering`) conoce detalles de HTTP, sesiones o presentación.
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
5. El saldo resultante se calcula en milésimas: negativo → `rule: negative_stock`; mayor que el máximo de `numeric(14, 3)` → `rule: stock_limit`. Ambos llevan `currentQuantityOnHand` y `requestedQuantity` como texto en la escala de la base (D-3, [ADR 0008](../decisions/0008-stock-nunca-negativo.md)). *Desde la 19.3* ([brief-19.3](../decisions/brief-19.3-reserva-y-ciclo.md)): por debajo de lo reservado → `rule: below_reserved` (ADR 0020, punto 5), y todos llevan además `currentQuantityReserved`.
6. `applyStockChange` inserta el movimiento con `balance_after` y actualiza `quantity_on_hand`; después `recordAudit` registra el ajuste (D-4). Es la única escritura del saldo en la aplicación, y `tests/guards/stock-writes.test.ts` lo hace cumplir (D-6). *Corregido el 2026-10-11 en la 19.3* (revisión independiente, R-2): desde la 19.3 hay una segunda, `applyDelivery`, la entrega de un pedido, que también inserta antes su movimiento; y `setReserved` escribe solo lo reservado. Las dos las autoriza la misma guarda.
7. Todo rechazo dentro de la transacción la revierte entera, incluida la fila de `inventories` que acababa de crear el primer ajuste. Nada queda a medias.

**Límite aceptado** (D-6): SQL escrito a mano contra la base puede cambiar el saldo sin movimiento; el `CHECK` sigue impidiendo el negativo.

### Lectura del historial

Implementada a nivel de servicio desde la 4.3.3 ([brief-4.3.3](../decisions/brief-4.3.3-historial-de-movimientos.md)); las pantallas 4 y 5 la usan desde la 4.4.

1. `listStockMovements` de `inventory`, para `admin` y `viewer`, resuelve autorización, id y organización con `getProduct` de `catalog`: un producto desactivado conserva su historial.
2. Valida los filtros de la URL: tipo, fechas `YYYY-MM-DD` inclusivas y período no invertido.
3. `getOrganizationTimezone` de `organizations` aporta la zona IANA (D-4). PostgreSQL convierte el período a `[desde 00:00, hasta + 1 día 00:00)` en esa zona (D-3).
4. Cuenta y pagina de a 25 en SQL, del más reciente al más antiguo (D-2). `created_at` es la hora del `INSERT`, que ocurre con el saldo bloqueado, así que ese orden sigue la cadena de saldos también bajo concurrencia (D-1).
5. Compone el nombre del autor con `getMemberSummaries` de `organizations`, sin `JOIN`, y devuelve la zona usada. *Corregido el 2026-10-07* ([brief-16.4](../decisions/brief-16.4-notas-de-la-conversacion.md), H-2): decía «con `getUserSummaries` de `auth`»; desde la 9.0.1 todos los módulos pasan por `organizations`, que filtra por la organización.

### Notas de una conversación

Implementadas desde la 16.4 ([brief-16.4](../decisions/brief-16.4-notas-de-la-conversacion.md)), en la pantalla 9.

1. `addConversationNote` de `conversations` exige `admin` y valida el id y el texto, recortado, de 1 a 1000 caracteres.
2. En una transacción, lee la conversación filtrada por organización, inserta la nota en `conversation_notes` y registra `note_added` con `recordAudit`, con el id de la nota y sin el texto (D-4). Si la auditoría falla, la nota no queda. La clave foránea retiene la conversación hasta confirmar, así que un vaciado que empieza mientras se guarda la nota espera y la alcanza. En el otro orden, la nota espera al vaciado y se guarda después con su texto, como un mensaje que llega después: la alcanza un vaciado repetido (revisión de la 16.4, R-1 y R-2).
3. `listConversationNotes`, para `admin` y `viewer`, lee de a 25 de la más reciente a la más vieja, con cursor `(created_at, id)`, y compone el nombre del autor con `getMemberSummaries` de `organizations`, sin `JOIN` y sin dependencia nueva.
4. Ninguna ruta de la API de lectura ni evento de ingestión toca las notas: el agente no las ve (D-7).

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
- **Log estructurado con `request_id`**: implementado en la 3.5 en `src/shared/log/` ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-9). JSON a la salida estándar con nivel, `request_id`, ruta, código de resultado y `user_id`; de un error, solo tipo y código. Lo usan las Server Actions de ingreso, cambio de contraseña y cierre de sesión, y el `request_id` se muestra al usuario solo en errores inesperados. *Corregido el 2026-09-30 (revisión independiente de la 13.3)*: esta línea decía que `organization_id` y la duración todavía no se registraban. `logEvent` tiene los dos campos desde la 4.4, y las rutas de la API de servicio los registran desde la Fase 11 (R-1, piezas 1 y 2), con `source` y `correlation_id`. Las Server Actions siguen sin duración.
- **Verificación de `Origin`** para Route Handlers mutantes: se ubica en `src/shared/http/` y se implementa con el primero que exista (D-5).

## Observabilidad (diseño)

- Un log estructurado (JSON) por request, con `request_id`, `organization_id`, `user_id`, ruta, código de resultado y duración. No incluye contenido de mensajes ni PII ([SecurityModel.md](SecurityModel.md)).
- Cada evento de ingestión queda en `ingestion_events` con estado terminal y `error_code` normalizado. Esa tabla, y no los logs, es la fuente de la métrica de errores de ingestión.
- Un endpoint `/api/health` verifica la conectividad con la base sin exponer detalles.
- No hay APM ni tracing distribuido en el MVP: en un monolito alcanza con logs correlacionados por `request_id`. **Se reevalúa en la Fase 10**, no en la 8 (brief-8.4, D-6): la reevaluación pide evidencia, y sin un entorno desplegado ni tráfico la respuesta saldría de la falta de datos y no de un criterio. Estaba asignada a la 9.4; la 9.4 se disolvió el 2026-09-23 al cerrar la Fase 9 con su gate enmendado, y la reevaluación pasó a la Fase 10. Llega con un insumo más fuerte que el tráfico sintético que se esperaba: la decisión de que el agente de WhatsApp dependa del CRM de forma sincrónica. **Reevaluada en la 10.1 el 2026-09-23** ([evaluación](../decisions/evaluacion-10.1-mvp.md), R-1): una herramienta de APM o tracing distribuido **no hace falta ahora**, y se reevalúa con tráfico real en la fase de producción de la integración (Fase 13). **Sí hacen falta, antes de producción, tres piezas mínimas**: `logEvent` en cada ruta de la API de servicio y un identificador de correlación del emisor, las dos en la primera fase de integración (Fase 11), donde nacen esas rutas; y medición externa de disponibilidad y latencia con alerta, en la fase de producción (Fase 13). El «log por request» de la primera línea de esta sección es diseño: la 8.2 midió que `next start` no registra peticiones, y solo queda lo que el código registra con `logEvent`. **La tercera pieza existe desde la 13.3** ([brief-13.3](../decisions/brief-13.3-disponibilidad-y-observabilidad.md)): un chequeo externo consulta `/api/health` de producción, que hasta entonces nadie consultaba, contra un objetivo del 99,5 % mensual. Cada trabajo programado de producción manda un aviso de vida al terminar bien, y el disco y la memoria tienen alertas. **Se vieron llegar con su falla provocada**, el 2026-09-30: la caída de la aplicación, la base en `503`, un aviso de vida que no llegó (con un chequeo de prueba) y el disco. **Configuradas y no provocadas**: la memoria, la latencia y el vencimiento del certificado. El aviso de un trabajo real se ve con la primera corrida programada. El procedimiento está en el [runbook de alertas](../runbooks/responder-a-una-alerta.md). **La reevaluación del APM pasó a la 13.5** (brief-13.3, D-6), con tráfico real.

## Despliegue (implementado en staging y, desde la 13.1, en producción)

*Actualizado el 2026-09-30 (revisión independiente de la 13.3)*: producción existe desde la 13.1, en un droplet propio con PostgreSQL en la misma máquina y los secretos en `/etc/crm-production/` ([brief-13.1](../decisions/brief-13.1-entorno-productivo.md), [README de producción](../../deploy/production/README.md)). Lo que sigue describe el diseño con que se abrió esta sección; donde dice «producción sigue a decidir», ya se decidió.

- Una única imagen/proceso de aplicación por entorno, sin estado en memoria compartido entre requests salvo cache local no crítico.
- Base de datos PostgreSQL gestionada por entorno (dev local vía Docker Compose; staging resuelto en la 9.1 el 2026-09-22 como **VM dedicada** —un droplet con PostgreSQL 18.6 en la misma máquina— y los secretos en archivos `0600` de `root` bajo `/etc/crm-staging/`, sin gestor; **producción sigue a decidir**, y la 9.2 le agregó una incógnita concreta: está sin verificar si un servicio gestionado exige superusuario para restaurar. La 8.4 quitó el "Fase 8/9" porque una decisión que cabe en dos fases no se toma en ninguna).
- Migraciones SQL versionadas se aplican como paso explícito del pipeline de despliegue, nunca automáticamente contra producción sin aprobación.

## Backups (implementado en staging)

- Backup lógico automático diario de la base de datos desde que exista staging persistente.
- Prueba de restauración periódica **ejecutada**, no solo documentada, para que un backup no probado no se asuma válido. **Cadencia fijada en la 9.2 el 2026-09-22**: backup diario, ejercicio de restauración mensual, con control negativo que demuestra que el ejercicio puede fallar.

## Evolución hacia ERP

El núcleo (`organizations`, `catalog`/`inventory`, `crm`) está diseñado para que un futuro módulo de `sales` pueda referenciar `clients` y `products` existentes sin modificar su forma actual — agregando sus propias tablas (`sales`, `sale_details`, etc.) y sus propias claves foráneas hacia las tablas existentes, sin alterar el dominio de catálogo, inventario o clientes. Ese trabajo es explícitamente una fase futura no planificada en detalle todavía (ver [planning/Roadmap.md](../planning/Roadmap.md), fases futuras de ERP).

*Enmendado el 2026-10-12 por el [ADR 0021](../decisions/0021-la-venta.md); el texto anterior se conserva arriba*: `sales` llega con la Fase 20 y **sí suma algo a dominios existentes**, sin cambiar la forma de sus tablas:
- a `inventory`, dos tipos de movimiento (`sale` y `sale_void`) y dos funciones que reciben su transacción;
- a `orders`, una función de su interfaz que bloquea un pedido entregado para la venta;
- a `numbering`, dos tipos de documento.

Sus tablas son `sales`, `sale_lines` y `sale_voids`. **Ningún módulo depende de `sales`**, y la venta en el detalle del pedido la compone la página. La 20.2 suma `sales` a la tabla de módulos y actualiza la fila de `orders`, que deja de tener a `ingestion` como único módulo que depende de él.
