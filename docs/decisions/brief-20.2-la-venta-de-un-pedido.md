---
schema: task-brief.v1
task_id: "20.2"
task_type: implementation
generated_at: 2026-10-12
---

# Brief 20.2 — La venta de un pedido entregado

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, los triggers, el servicio, la guarda y los scripts de datos de un cliente, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-12).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-12, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: segunda subfase de la Fase 20 — Ventas ([Roadmap](../planning/Roadmap.md) §Fase 20), después de la 20.1, cerrada el 2026-10-12. Implementa la fila «20.2» del punto 13 del [ADR 0021](0021-la-venta.md).
- **No abre ni cierra gate.** Crea el primer comprobante del CRM, dos tablas de solo inserción y un módulo nuevo que depende de `orders`. Por eso se recomienda la revisión independiente (D-11).
- **Estado de este documento**: **aprobado el 2026-10-13** por el usuario, con las recomendaciones de D-1 a D-12. **Cerrado el 2026-10-13** (§Cierre). La tarea 20.2 (`3f7702be6f4e8197b004dc9ea04a48da`) pasó a «Completado» ese día.

## Objetivo

Que un `admin` pueda **emitir la venta de un pedido entregado**: un comprobante numerado `V-000123`, de solo inserción, que copia el cliente, las líneas y el total del pedido y no toca el stock; que los dos roles vean **la lista y el detalle** de las ventas; que el detalle se pueda **imprimir o guardar como PDF** desde el navegador; y que el detalle del pedido muestre su venta. Sin venta sin pedido (20.3) y sin anulación (20.4).

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-12, sobre `main` (`997df39`).

**Ya está fijado** por el ADR 0021, puntos 2, 3, 7 a 10, 12 y 13:
- la venta y sus líneas son de solo inserción (`SELECT` e `INSERT` para `crm_app`, trigger que rechaza `UPDATE` y `DELETE`), sin estados, auditadas en la misma transacción con `entity_type` `sale` y la acción `create`;
- se emite solo desde un pedido `delivered`, copia del pedido el cliente, la moneda, las líneas en su orden y el total, sin volver a cotizar y sin exigir que el cliente o los productos estén activos;
- un pedido tiene a lo sumo una venta: el servicio bloquea la cabecera del pedido `FOR UPDATE` y comprueba, y en la 20.2 la base lo respalda con un **índice único sobre `(organization_id, order_id)`**, que la 20.4 reemplaza por el parcial;
- el número `V-000123` del contador de `numbering`, con el tipo nuevo `sale`; `UNIQUE (organization_id, number)`; el orden de bloqueo «cabecera del pedido, después el contador»;
- las claves compuestas hacia `clients`, `orders` y `products`, con `RESTRICT`; sin texto libre;
- una página imprimible con `@media print`, sin dependencias nuevas, con la leyenda «Documento no válido como factura»;
- solo `admin` emite; un `viewer` ve sin el contacto del cliente; ninguna venta muestra costo ni margen; el agente no emite ni lee ventas;
- la exportación y el informe de borrado de un cliente cuentan las ventas.

**Lo que hay en el código y se reutiliza**:
- `numbering`: `nextDocumentNumber(tx, organizationId, kind)` y `formatDocumentNumber(kind, value)`, con `PREFIXES` que hoy tiene solo `order: "P"`. El enum `document_kind` tiene solo `order` (`numbering/schema.ts`).
- `orders`: `repository.findOrder(…, tx, { forUpdate: true })` bloquea la cabecera, y `repository.findOrderLines(…, tx)` lee las líneas, **pero los dos son internos**. La interfaz no tiene una lectura con bloqueo para otro módulo: la suma esta subfase (ADR 0021, punto 3).
- `crm`: `getClientsByIds` (con el contacto nulo para un `viewer`). `catalog`: `getProductsByIds`, para el nombre actual de cada producto.
- `organizations`: `getAppFrame` (el nombre de la organización) y `getOrganizationTimezone`.
- `audit`: `recordAudit(tx, …)`, que admite solo valores planos (brief-19.2, §Resultados): las líneas van con claves numeradas.
- El test de privilegios (`tests/integration/audit.test.ts`, `INSERT_ONLY_TABLES`) y `identity-schema.test.ts`.
- Las guardas `order-writes` y `counter-writes`, como molde de `sale-writes`; `exposed-surface` y `module-boundary`.
- `scripts/client-data-export.ts` (exporta `orders` y `order_lines`) y `scripts/client-data-delete.ts` (`deletable` exige `conversations === 0` y `orders === 0`).
- **Producción** corre `9c8bc54`, con la migración `0038`. La de esta subfase es la `0039`.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre Overview, DataModel, los ADR 0019, 0020 y 0021, `eslint.config.mjs`, los scripts y las specs):
- **H-1. En la 20.2 las ventas no cambian quién se puede borrar.** Toda venta de la 20.2 tiene un pedido, y un cliente con pedidos ya no es borrable. Contar las ventas en `deletable` es redundante hasta la 20.3, donde la venta sin pedido lo vuelve necesario. Se hace igual, porque el ADR 0021, punto 13, lo asigna a la 20.2, y un test lo fija con un cliente que tiene pedidos y ventas.
- **H-2. Doce specs end-to-end vacían `orders` con `TRUNCATE`** (`client-fields`, `client-tags`, `clients`, `conversations`, `dashboard-sin-ingestion`, `dashboard`, `ingestion`, `orders`, `product-fields`, `product-images`, `products` y `security-headers`). Con `sales` apuntando a `orders`, `clients` y `products`, un `TRUNCATE` sin `sales` falla. Cada una suma `sale_lines, sales` al principio de la lista.
- **H-3. El nombre del producto no se copia en la línea** (ADR 0021, punto 7, como el pedido: brief-19.2, H-4). El comprobante muestra el nombre **actual**: si un producto se renombra, reimprimir una venta vieja lo muestra con el nombre nuevo. Es consecuencia de una decisión aceptada y se escribe como límite conocido en DataModel. Es también la razón por la que la demo desactivó los productos viejos en lugar de renombrarlos.
- **H-4. La venta en el detalle del pedido la compone la página** (ADR 0021, punto 9): `pedidos/[orderId]/page.tsx` llama a `sales`. `orders` no lee `sales`, y la condición de detención lo vigila.
- **H-5. Overview, fila de `orders`**, dice «Ningún módulo depende de `orders`» y después lo corrige por `ingestion`. La 20.2 suma `sales` como segundo módulo que depende de `orders`, y agrega la fila de `sales`.
- **H-6. La navegación suma «Ventas»**, una parada más de tabulación antes del formulario de cada pantalla. Las specs con tope de tabulaciones (`clients`, `knowledge`, `products` y `users`, de 16 desde la 19.2) pueden necesitar subirlo a 17. Se autoriza solo ese número (§Archivos autorizados).
- **H-7. La Ley 27.743** (ADR 0021, §Consecuencias): el comprobante imprimible queda disponible en producción para las dos organizaciones que existen, la del operador y la de demostración. No hay un negocio real, así que nadie entrega un comprobante a un consumidor final. La pregunta sigue pendiente para la 13.5.2-b.
- **No apareció ninguna contradicción** que obligue a cambiar el ADR 0021. Las decisiones de abajo precisan lo que deja abierto.

## Alcance incluido

1. **Esquema** (migración `0039`, generada con `drizzle-kit generate` y completada a mano):
   - **`sale`** en `document_kind` y en `audit_entity_type` (valores aditivos).
   - **`sales`**: `id`, `organization_id`, `number bigint` con `UNIQUE (organization_id, number)` y `CHECK (number > 0)`, `order_id` **obligatorio** con la clave compuesta hacia `orders (organization_id, id)` y `RESTRICT`, `client_id` **obligatorio** con la clave compuesta hacia `clients (organization_id, id)` y `RESTRICT`, `currency` con el formato de tres letras, `total numeric(14, 2)` con `CHECK (total > 0)`, `created_by` hacia `users`, `created_at`. `UNIQUE (organization_id, id)` para la clave de las líneas. **Índice único `(organization_id, order_id)`**. Índices de la lista (D-6).
   - **`sale_lines`**: `id`, `organization_id`, `sale_id` con clave compuesta hacia `sales (organization_id, id)`, `product_id` con clave compuesta hacia `products (organization_id, id)` y `RESTRICT`, `position smallint`, `quantity numeric(14, 3)`, `unit_price numeric(14, 2)` y `line_total numeric(14, 2)`, los tres con `CHECK (> 0)`, `currency`; `UNIQUE (sale_id, product_id)` y `UNIQUE (sale_id, position)`.
   - **Privilegios** (ADR 0013): `SELECT, INSERT` para `crm_app` en las dos. Un trigger de solo inserción en cada una, con `P0001`, como `order_lines`.
2. **Módulo `sales`** (nuevo): `schema.ts`, `repository.ts`, `service.ts` e `index.ts`.
   - `issueSaleFromOrder(context, orderId)` (solo `admin`): abre la transacción, le pide a `orders` el pedido bloqueado, comprueba que esté `delivered` y que no tenga venta, toma el número de `sale`, inserta cabecera y líneas copiadas del pedido y audita `create` (D-7). Respuestas en D-4.
   - `listSales` y `getSale` (los dos roles), con el contacto del cliente nulo para un `viewer`; `getSaleForOrder(context, orderId)`, para el detalle del pedido; `listSaleAudit`, solo `admin`.
   - `formatSaleNumber` y `parseSaleNumberSearch`, como los del pedido.
3. **`numbering`**: el prefijo `sale: "V"` en `PREFIXES` y el valor del enum.
4. **`orders`**: `lockOrderForSale(tx, organizationId, orderId)` en su interfaz. Bloquea la cabecera `FOR UPDATE` en la transacción de `sales` y devuelve el estado, el cliente, la moneda, el total y las líneas en su orden, o `null` si no existe en esa organización. **No escribe nada** y no cambia ningún estado.
5. **Pantallas** (D-4 a D-6, D-8 y D-9):
   - `/ventas`: la lista, con número, fecha, cliente, pedido, total; filtros de D-6; paginada;
   - `/ventas/[saleId]`: el detalle, que es también el comprobante imprimible (D-5);
   - en `/pedidos/[orderId]`: si el pedido tiene venta, su número con un enlace; si está entregado y no tiene venta, el botón «Emitir venta» con confirmación, solo para `admin`;
   - «Ventas» en la navegación, para los dos roles.
6. **Guardas** (D-3): `tests/guards/sale-writes.test.ts`, con sus casos de fallo versionados; `exposed-surface`, la acción nueva declarada con `sesion`; `module-boundary`, los casos de `sales`.
7. **Datos de un cliente** (ADR 0021, punto 12; H-1): la exportación suma las ventas del cliente y sus líneas (número, fecha, pedido, moneda, total); el informe cuenta las ventas y `deletable` exige cero; el vaciado no las toca; el runbook lo dice.
8. **`eslint.config.mjs`**: `sales` en el bloque de los módulos de dominio.
9. **Documentación**:
   - `DataModel.md`: las dos tablas, la regla 14 pasada a «implementada» en lo que corresponde, la regla 10 (solo inserción), los valores nuevos de los dos enums y el límite de H-3;
   - `Overview.md`: la fila de `sales`, la de `orders` (H-5), `sales` entre los que usan `audit` y entre los módulos de dominio;
   - `RepositoryStructure.md`: el módulo en su tabla y en la frontera;
   - `FunctionalRequirements.md`: una sección «Ventas» (FR-VEN-01 en adelante) y FR-AUD con la entidad nueva;
   - `Screens.md` (pantallas 17 y 18, y el cambio de la 16), `TraceabilityMatrix.md`, `SecurityModel.md` (recuentos de superficie) y `EngineeringStandards.md` (la guarda).

## Alcance excluido

- **La venta sin pedido**, el cliente opcional, el tipo de movimiento `sale` y toda escritura de stock (20.3). `inventory` no cambia.
- **La anulación**, `sale_voids`, `replaces_sale_id`, el índice parcial, la acción `void` y el filtro «anulada» de la lista (20.4).
- **Las reglas de línea compartidas** con el pedido (20.3): la venta de un pedido copia montos ya calculados y no usa `computeLineTotal`.
- **La venta en la ficha del cliente** y en la del producto (D-8).
- **El IVA, documento y CUIT/CUIL**; cobros, señas y medios de pago (Fase 21); descuentos.
- **Un PDF generado en el servidor** y mandar el comprobante por WhatsApp o por correo.
- **El agente**: `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **Métricas y dashboard**; datos de volumen y staging; el repositorio del agente.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0039_*.sql` y `drizzle/meta/*`
- `src/modules/sales/` (nuevo), con sus tests unitarios
- `src/modules/numbering/`: `schema.ts` y `service.ts`, **solo** el valor `sale` y su prefijo
- `src/modules/orders/`: `repository.ts`, `service.ts` e `index.ts`, **solo** `lockOrderForSale`
- `src/modules/audit/schema.ts`: **solo** el valor nuevo del enum
- `src/app/(autenticado)/ventas/` (nuevo); `src/app/(autenticado)/pedidos/[orderId]/page.tsx` y un componente nuevo en esa carpeta para emitir; `src/app/(autenticado)/layout.tsx` (la navegación); `src/app/globals.css`, **solo** las reglas `@media print`; `src/app/_components/icons.tsx`, **solo** si hace falta un ícono nuevo
- `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`
- `tests/integration/`: `sales.test.ts` y `sales-schema.test.ts` (nuevos); `numbering.test.ts`, **solo** la serie de `sale`; `client-data.test.ts`; `identity-schema.test.ts` y `audit.test.ts`, **solo** las tablas nuevas en sus listas
- `tests/guards/sale-writes.test.ts` (nuevo); `exposed-surface.test.ts` y `module-boundary.test.ts`, **solo** lo de `sales`
- `tests/e2e/sales.spec.ts` (nuevo); las doce specs de H-2, **solo** `sale_lines, sales` en su `TRUNCATE`; las cuatro de H-6, **solo** el tope de tabulaciones
- `eslint.config.mjs`, **solo** `sales` en el bloque de dominio
- `docs/architecture/DataModel.md`, `Overview.md`, `RepositoryStructure.md`, `TraceabilityMatrix.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`; `docs/development/EngineeringStandards.md`; `docs/runbooks/datos-de-un-cliente.md`
- al cerrar: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

`inventory`, `catalog`, `crm`, `src/shared/money/`, `src/shared/quantity/`, los seeds y los contratos del agente **no** se tocan.

## Fuentes de verdad

- **El código y las migraciones**: `orders`, `numbering`, `audit`, `drizzle/0036_*` (el molde de `orders` y `order_lines`), los dos scripts de datos de un cliente y las guardas `order-writes` y `counter-writes`.
- **Las decisiones**: el [ADR 0021](0021-la-venta.md); el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 a 6; el [ADR 0020](0020-el-pedido.md), puntos 4 y 6; el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md); el [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md); el [brief-19.2](brief-19.2-el-pedido.md), como molde.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. La forma de `sales` en la 20.2.** **Recomendada**: `order_id` y `client_id` **obligatorios** (`NOT NULL`), y el índice único completo sobre `(organization_id, order_id)`, como fija el ADR 0021, punto 13. La 20.3 los vuelve nulables con su migración, y la 20.4 cambia el índice por el parcial. Crear hoy columnas nulables o `replaces_sale_id` sería adelantar diseño sin productor.

**D-2. Qué defiende la base además del índice único.**
- (a) **Solo inserción, claves, `CHECK` e índice único; el estado `delivered` y la copia exacta del pedido los comprueba el servicio con la cabecera bloqueada. Recomendada.** Un trigger que leyera `orders` desde `sales` para exigir el estado sería una regla entre tablas en la base, y `delivered` es final: una vez comprobado bajo bloqueo no cambia.
- (b) Un trigger de alta en `sales` que rechace un pedido que no esté `delivered` o con otro cliente, moneda o total. Una defensa más, al costo de una regla cruzada que hoy no existe en ninguna otra tabla.

**D-3. Una guarda de escrituras para `sales`.** **Recomendada**: sí, `sale-writes`, como `order-writes`: solo el repositorio de `sales` escribe `sales` y `sale_lines`, y nada las actualiza ni las borra. El trigger es la segunda defensa.

**D-4. Emitir desde el detalle del pedido.** **Recomendada**:
- el botón «Emitir venta» aparece solo para `admin` y solo en un pedido `delivered` sin venta; pide confirmación con un paso `?confirmar=venta`, como «Desactivar» en productos, y al emitir lleva al detalle de la venta con «Venta emitida»;
- las respuestas del servicio: `FORBIDDEN` a un `viewer`; `NOT_FOUND` con un pedido inexistente o de otra organización; `BUSINESS_RULE_VIOLATION` con la regla `order_not_delivered` (con el estado) o `already_sold` (con el número de la venta existente, que la pantalla enlaza); `VALIDATION_ERROR` con un id inválido;
- dos emisiones simultáneas del mismo pedido: una emite y la otra recibe `already_sold`, sin error ni número consumido. Si el índice único llega a dispararse (un camino que el bloqueo no cubrió), se informa también como `already_sold`, no como error.

**D-5. La página imprimible.**
- (a) **El detalle de la venta es el comprobante**, con un botón «Imprimir» (`window.print()`, un componente de cliente mínimo) y reglas `@media print` en `globals.css` que ocultan la navegación, los botones y la historia, y dejan el comprobante: el nombre de la organización, el número, la fecha en la zona de la organización, el nombre del cliente, el número del pedido, las líneas con el nombre actual del producto, el total y la leyenda. **Recomendada**: una sola página, una sola fuente de lo que se muestra.
- (b) Una ruta aparte, `/ventas/[saleId]/comprobante`, sin el marco de la aplicación. Más limpia al imprimir, pero son dos vistas de lo mismo, y la ruta tiene que salir del layout autenticado sin perder la sesión.

**D-6. La lista.** **Recomendada**: de 25 en 25, de la más reciente a la más vieja (`created_at desc, id desc`); filtro por fecha con «desde» y «hasta» (días en la zona de la organización), por cliente (`?cliente=`, al que se llega desde el detalle de una venta) y búsqueda por número (`V-000123`, `000123` o `123`). Los nombres de los clientes se componen en memoria, sin `JOIN`. Índices: `(organization_id, created_at desc, id desc)` y `(organization_id, client_id, created_at desc)`; el número y el pedido ya tienen el suyo por sus `UNIQUE`. El filtro «anulada» llega con la 20.4.

**D-7. Qué guarda la auditoría.** **Recomendada**: `after` con el número, el id del pedido, el id del cliente, la moneda, el total, `lines` y cada línea con claves numeradas (`line_1_product_id`, `line_1_quantity`, `line_1_unit_price`, `line_1_total`), como el pedido. **Ningún nombre ni texto del cliente**, y un test lo fija.

**D-8. La venta en la ficha del cliente.** **Recomendada**: no en la 20.2. El ADR 0021 no la pide, la ficha ya muestra los pedidos y cada pedido entregado muestra su venta. Se suma si el uso lo pide.

**D-9. Qué muestra el detalle según el rol.** **Recomendada**: los dos roles ven la venta completa; el contacto del cliente, solo un `admin`, y **el comprobante impreso lleva solo el nombre del cliente**, nunca el teléfono ni el email, también para un `admin`. La historia de la venta, solo para `admin`.

**D-10. Un pedido entregado antes de la 20.2.** **Recomendada**: se puede emitir su venta igual que la de uno nuevo. No hay migración de datos: la venta se emite cuando alguien la pide. En producción hay un pedido entregado, `P-000003`, en Demostración Vixora, con productos que hoy están desactivados (H-3).

**D-11. La revisión independiente.** **Recomendada**: un agente de solo lectura, contra este brief, el ADR 0021 y las reglas vigentes, antes del commit. Es el primer comprobante, el primer módulo que depende de `orders` desde la pantalla y desde el servicio, y la primera vista de impresión.

**D-12. El despliegue a producción y el recorrido.** **Recomendado**: sí, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar. Lleva la migración `0039` y se autoriza aparte, en su turno. Los valores nuevos de enum no se revierten con un rollback de código, pero el código anterior no los lee, así que volver a `9c8bc54` sigue siendo seguro. Para el recorrido, en Demostración Vixora: un pedido nuevo con productos de Tecnex, confirmado y entregado, y su venta `V-000001`, impresa a PDF. **Esa venta queda para siempre** y hasta la 20.4 no se puede anular; por eso se recomienda emitirla sobre un pedido nuevo y no sobre `P-000003`.

## Invariantes

- Una venta y sus líneas nunca cambian ni se borran; la base lo impide para cualquier rol.
- Toda venta de la 20.2 tiene un pedido `delivered` de su organización, y un pedido tiene a lo sumo una venta.
- Los montos, la moneda, el cliente y las líneas de la venta son exactamente los del pedido.
- La serie `V` de una organización no tiene huecos ni repetidos, y es independiente de la serie `P`.
- La venta no toca el stock ni el estado del pedido.
- Un `viewer` no emite ni ve el contacto del cliente; nadie ve costo ni margen en una venta; el comprobante impreso no lleva el contacto.
- `orders` no depende de `sales`; ningún módulo depende de `sales`.
- Cada emisión queda auditada en la misma transacción, sin datos personales en el `diff`.
- `read-v1`, `read-v2`, `ingestion-v2` e `inventory` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0039` crea `sales` y `sale_lines` con sus claves compuestas, `CHECK`, `UNIQUE` e índices, y suma `sale` a `document_kind` y a `audit_entity_type`. `crm_app` tiene `SELECT, INSERT` en las dos, y el test de privilegios las clasifica de solo inserción. Con el rol dueño: cambiar o borrar una venta o una línea da `P0001`; una segunda venta del mismo pedido viola el índice único; una venta hacia un pedido, cliente o producto de otra organización viola la clave. Lo prueba `sales-schema.test.ts` contra PostgreSQL.
- **AC-2 (numeración)**: la primera venta de una organización es `V-000001`; la serie `V` no depende de la `P`; dos organizaciones tienen series independientes; una emisión rechazada o revertida no consume número.
- **AC-3 (emisión)**: `issueSaleFromOrder` copia del pedido el cliente, la moneda, cada línea en su orden y el total, sin tocar `inventories`, `inventory_movements` ni el estado del pedido, con un cliente y productos desactivados después de la entrega incluidos. Rechaza según D-4: `FORBIDDEN`, `NOT_FOUND` (inexistente y de otra organización), `order_not_delivered` desde `pending`, `confirmed` y `cancelled`, `already_sold` con el número existente, y `VALIDATION_ERROR`. Un rechazo no escribe, no numera ni audita.
- **AC-4 (concurrencia)**: dos emisiones simultáneas del mismo pedido terminan en una venta y un `already_sold`, sin error ni número perdido; una emisión simultánea con un `cancelOrder` del mismo pedido entregado termina coherente (la cancelación lo rechaza por ser final), sin deadlock.
- **AC-5 (lecturas)**: `listSales` pagina, filtra por fecha y por cliente y busca por número, aislado por organización; `getSale` devuelve cabecera, pedido, líneas con el nombre actual del producto y cliente, con el contacto nulo para un `viewer`; `getSaleForOrder` devuelve la venta del pedido o nada; la historia es solo de `admin`.
- **AC-6 (auditoría)**: el `diff` de la emisión tiene la forma de D-7, y un test fija que no contiene el nombre, el teléfono ni ningún texto del cliente.
- **AC-7 (pantallas)**: un end-to-end sobre `next start` con los dos roles: `admin` entrega un pedido, emite su venta desde el detalle con confirmación, ve el número, la encuentra en la lista y vuelve al pedido, que muestra la venta; un segundo intento muestra el enlace a la venta existente; la vista de impresión (`emulateMedia({ media: "print" })`) muestra el comprobante con la leyenda y sin navegación, botones, historia ni contacto; un `viewer` ve la lista y el detalle sin contacto y sin el botón. axe sin violaciones en claro y en oscuro, y todo se usa con teclado.
- **AC-8 (datos de un cliente)**: la exportación incluye las ventas y sus líneas; el informe las cuenta; `deletable` exige cero ventas (H-1); `--vaciar` deja las ventas intactas. Lo prueba `client-data.test.ts`, y el runbook lo dice.
- **AC-9 (guardas)**: `sale-writes` pasa con el código y falla con cada uno de sus casos versionados; `exposed-surface` declara la acción nueva; `module-boundary` cubre `sales`.
- **AC-10 (fronteras)**: ningún archivo de `src/modules/` fuera de `sales` importa `@/modules/sales`; `orders` solo suma `lockOrderForSale`, sin escribir; `inventory`, `catalog` y `crm` no están en el diff.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios en sus tests.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 9 queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-12): producción corre el SHA del cierre con la `0039` aplicada; en Demostración Vixora, un `admin` entrega un pedido y emite su venta, la ve en el pedido y en la lista y la guarda como PDF; la base tiene una venta con las líneas del pedido y su evento de auditoría, y el stock no se movió por la venta.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-6 y AC-8 a AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-7 (UI ↔ servicio ↔ base) y AC-11 (los contratos que consume el agente, que no cambian).
- `isolated-runtime`: AC-14, si se despliega.
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada, en especial `inventory`, `catalog`, `crm`, `src/shared/money/` o `src/shared/quantity/`;
- el diseño exigiría cambiar el texto de los ADR 0019, 0020 o 0021, o adelantar algo de la 20.3 o la 20.4;
- `orders` tendría que escribir algo por la venta, o leer `sales`; o un módulo existente tendría que depender de `sales`;
- `read-v1`, `read-v2`, `ingestion-v2` o el stock tendrían que cambiar;
- aparece una vía por la que un `viewer` emite una venta o ve el contacto del cliente, el comprobante impreso muestra el contacto, o un dato personal entra al `diff` de la auditoría;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, y desplegar. Cada una necesita autorización explícita en su turno.

## Resultados — 2026-10-13 (autoevaluación)

Implementado el 2026-10-13. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-11 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

- **La lista no muestra el número del pedido.** `sales` no tiene cómo leerlo sin una lectura nueva de `orders` por ids, que el brief no autoriza (solo `lockOrderForSale`). La columna «Pedido» es un enlace «Ver pedido», con el número de la venta en su nombre accesible. El detalle de la venta sí muestra el número del pedido, con `getOrder`, que ya existía.
- **La confirmación de D-4 usa el paso `?confirmar=venta`**, como «Desactivar» en productos, y no la confirmación en la página de las transiciones del pedido: funciona sin JavaScript.
- **Un rechazo de la emisión no revalida la página.** Con la venta ya emitida, el detalle del pedido dejaría de mostrar la confirmación y, con ella, el mensaje que enlaza la venta existente. Lo encontró `sales.spec.ts`, caso 2.
- **Ocultar al imprimir.** D-5 decía «reglas `@media print` en `globals.css`». `globals.css` fuerza en papel la paleta clara, también con el tema oscuro, y lo que se oculta lo dice cada pantalla con `print:hidden` de Tailwind, que genera las mismas reglas `@media print`. Para eso `layout.tsx` suma `print:hidden` al panel lateral **y a la barra superior** (organización, tema, usuario y «Salir»), y `print:block` al contenedor de la grilla (R-1). El brief autorizaba `layout.tsx` para «la navegación»: la barra superior y la grilla quedaban fuera de ese paréntesis. **El usuario aprobó la ampliación el 2026-10-13** (R-6).
- **Los íconos `receipt` y `printer`** en `icons.tsx`, para «Ventas» en la navegación, la tarjeta del pedido y el botón de imprimir.
- **El rescate del 23505 casi no se puede alcanzar**: el `INSERT` de otra venta del mismo pedido necesita `FOR KEY SHARE` sobre el pedido por la clave foránea, y la emisión lo tiene `FOR UPDATE`. Es una defensa de respaldo; su test apaga las claves foráneas solo en la transacción que fabrica el choque (R-4).
- **Los topes de tabulación de las cuatro specs de H-6 no hicieron falta**: siguen en 16 y pasan.

### Archivos

Todos los tocados están en la lista autorizada, con la ampliación de `layout.tsx` de arriba (R-6) y, por la decisión del usuario sobre R-7, una precisión fechada en el ADR 0021, punto 7. No se tocaron `inventory`, `catalog`, `crm`, `src/shared/money/`, `src/shared/quantity/`, los seeds ni los contratos del agente.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `sales-schema.test.ts` (17 casos): claves compuestas, `CHECK`, `UNIQUE`, el índice único por pedido, `RESTRICT`, índices, enums, privilegios de `crm_app` (`42501`) y el trigger con el rol dueño (`P0001`); `audit.test.ts` e `identity-schema.test.ts` con las tablas nuevas |
| AC-2 | cumplido | `sales.test.ts`: la serie `V` por organización e independiente de la `P`, y ningún rechazo numera; `numbering.test.ts`: la serie de `sale` y el prefijo |
| AC-3 | cumplido | `sales.test.ts`: la copia exacta (cabecera y líneas), sin movimientos ni cambio de saldos y con la fila del pedido idéntica; cliente y producto desactivados y precio cambiado; cada rechazo con su código, sin escribir, numerar ni auditar |
| AC-4 | cumplido | `sales.test.ts`: dos emisiones simultáneas; las dos esperando la cabecera retenida desde una tercera conexión; una emisión y una cancelación superpuestas de la misma forma (R-4); y el choque con el índice único, que responde `already_sold` sin consumir número (R-4) |
| AC-5 | cumplido | `sales.test.ts`: lista, filtros, número en cuatro formas, período en la zona de la organización con sus dos errores, página fuera de rango, detalle por rol sin contacto, la venta de un pedido, historia solo de `admin` |
| AC-6 | cumplido | `sales.test.ts`: el `diff` exacto, sin el nombre, el teléfono ni el email |
| AC-7 | cumplido | `sales.spec.ts`, cinco casos sobre `next start`: la emisión con teclado, la segunda emisión en otra pestaña, la impresión en claro y en oscuro (sin navegación, botones, historia ni contacto, con el ancho de la página: R-1 y R-5), el `viewer` (teléfono enmascarado, sin email ni botón) y los filtros; axe en cada estado |
| AC-8 | cumplido | `client-data.test.ts`, casos 35 a 37, y el runbook |
| AC-9 | cumplido | `sale-writes` con cuatro mutaciones sobre el código real (abajo); `exposed-surface` con `issueSaleAction`; `module-boundary` con cuatro casos de `sales` |
| AC-10 | cumplido | `@/modules/sales` solo se importa desde `src/app/`; `orders` suma solo `lockOrderForSale`, que lee; `inventory`, `catalog` y `crm` no están en el diff |
| AC-11 | cumplido | `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios en la batería |
| AC-12 | cumplido | la batería, abajo, y la CI de `ceb5692` (§Cierre) |
| AC-13 | cumplido | DataModel, Overview, RepositoryStructure, FunctionalRequirements (FR-VEN-01 a 06 y FR-AUD), Screens (16 a 18), TraceabilityMatrix, SecurityModel (91 puntos de entrada), EngineeringStandards (20 guardas, 32 casos de frontera) y el runbook |
| AC-14 | cumplido | el despliegue de `ceb5692` y el recorrido del usuario, conciliado contra la base (§Cierre) |

**Mutaciones de `sale-writes`**, cada una agregada al código real, corrida y revertida: `tx.update(sales)` en `sales/service.ts` (falla 1 caso), `delete from sale_lines` en `orders/repository.ts` (1), `tx.insert(saleLines)` en una función nueva del repositorio (2) e `insert into ${sales}` en `ventas/actions.ts` (1); sin mutación, 18 en verde. **Y la del rescate del 23505**: sin él, el caso nuevo de `sales.test.ts` falla.

**Batería local** (2026-10-13, Git Bash):
- formato, lint, typecheck y build en verde; 708 unitarios y 581 guardas;
- integración, 1041 de 1042. El que falló es `product-images.test.ts`, «D-9: el aviso de tamaño», que lanza un script de bash y tardó 13,6 s bajo la carga de la suite; corrido solo pasa, y no toca ventas;
- end-to-end en dos tandas sobre `next start`: la 2, 74 de 74; la 1 dio 17 pasados en su primera corrida, sin que el filtro de la salida conservara los fallos, y 93 de 93 al repetirla, como la intermitencia sin causa encontrada de la 19.2;
- después de las correcciones de la revisión: `sales.test.ts` 15 de 15, y `sales.spec.ts`, `frame.spec.ts` y `users.spec.ts` 21 de 21.

Las intermitencias se declaran, no se explican.

## Revisión independiente — 2026-10-13

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0021 y las reglas vigentes, sin ejecutar nada. **Veredicto R1**: 1 hallazgo medio y 7 bajos, ninguno bloqueante. Cada uno se verificó contra el código antes de aceptarlo:

- **R-1 (medio, verificado con un test)**: al imprimir con un ancho que activa `lg` (A4 apaisado, o los 1280 px de la prueba), el comprobante quedaba en la columna de 16rem del panel oculto: medía 256 px. **Corregido** con `print:block` en el contenedor de `layout.tsx`, y `sales.spec.ts` mide ahora el ancho.
- **R-2 (bajo, verificado)**: DataModel seguía nombrando `sales` en «Explícitamente fuera de este modelo». **Corregido** con una precisión fechada.
- **R-3 (bajo, verificado)**: el comentario de `deleteClientRow` no nombraba las ventas. **Corregido**.
- **R-4 (bajo, verificado)**: el rescate del 23505 no tenía test, y la emisión y la cancelación simultáneas no se superponían a la fuerza. **Corregido**: un caso que choca con el índice (con su mutación) y la cancelación con la cabecera retenida.
- **R-5 (bajo, verificado)**: los end-to-end no comprobaban la ausencia del teléfono al imprimir ni para el `viewer`. **Corregido**. El `viewer` ve el teléfono enmascarado («•••• 3333»), como en el detalle del pedido (FR-CLI-06): es lo que D-9 entiende por «sin los datos de contacto», que en `crm` son el email y la dirección.
- **R-6 (bajo, decisión del usuario)**: `print:hidden` en la barra superior y, desde R-1, `print:block` en la grilla quedan fuera del paréntesis «la navegación» con que el brief autorizaba `layout.tsx`. **El usuario aprobó la ampliación el 2026-10-13.**
- **R-7 (bajo, por inferencia, verificado por lectura; decisión del usuario)**: después de tomar el contador, los `INSERT` toman `FOR KEY SHARE` sobre `clients` (la cabecera) y `products` (las líneas) por sus claves foráneas, y el ADR 0021, punto 7, dice que ningún camino bloquea un contador y después otra fila. No forma un ciclo: ningún camino tiene esas filas `FOR UPDATE` mientras espera el contador `sale`. Pero un vaciado en curso, que bloquea la ficha `FOR UPDATE`, puede dejar a una emisión esperando con el contador tomado y frenar las demás emisiones de la organización mientras dura. El alta del pedido tiene el mismo patrón con `users`, el autor. **Decisión del usuario del 2026-10-13: bloquear antes.** La emisión bloquea el cliente y los productos en modo compartido entre la cabecera y el contador, con `lockClientForOrder` y `lockProductsForOrder`, que ya usa el alta del pedido, y el ADR 0021, punto 7, lleva una precisión fechada. Un caso nuevo de `sales.test.ts` retiene la ficha del cliente y comprueba que la emisión de otro cliente sigue de largo; sin el bloqueo del cliente, falla. El autor (`users`) se sigue tomando después del contador, como en el alta del pedido: ningún camino lo bloquea `FOR UPDATE` durante una emisión.
- **R-8 (bajo, para la 20.3)**: la exportación une `sales` con `orders` por un `JOIN` interno, que perdería las ventas sin pedido cuando `order_id` sea nulable. **Anotado** en el código para la 20.3.

## Cierre de la subfase 20.2, 2026-10-13

Cierra el 2026-10-13 con la aprobación del usuario, después de su recorrido en producción («Ya lo revisé y está perfecto»).

- **AC-1 a AC-14 cumplidos.**
- **La batería final**, después de R-7 (Git Bash): formato, lint y typecheck en verde; 708 unitarios, 581 guardas e integración 1043 de 1044. El que falló es otra vez «D-9: el aviso de tamaño» de `product-images.test.ts`, por tiempo bajo la carga de la suite; corrido solo, pasa.
- **Commit, CI y despliegue**: `ceb5692`, CI 38393803291 `success` leída por `headSha`. Desplegado en producción el 2026-10-13 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `9c8bc54` anotado como la versión para volver atrás. La migración `0039` quedó aplicada (40 en `drizzle.__drizzle_migrations`), el servicio `active`, `/api/health` en `200` y `/ventas` en `307` al login.
- **El recorrido del usuario (AC-14)**, en «Demostración Vixora» y con los productos de Tecnex cargados por el navegador en esta subfase: el pedido `P-000005`, entregado, y su venta `V-000001`, abierta desde «Ventas» e impresa. **Conciliado contra la base**, en una transacción de solo lectura y sin datos de la persona:
  - una venta, de la demo, de un pedido `delivered`, con el cliente y el total del pedido (2.300.000,00 ARS);
  - una línea, igual en producto, cantidad, precio y total a la del pedido, y la suma de las líneas igual al total;
  - el contador de `sale` en 1;
  - una auditoría `create` de `sale`, sin el teléfono ni el nombre en el `diff`;
  - los saldos sin nada reservado.
- **Revisión**: la independiente (R-1 a R-8, arriba). La batería, el despliegue, la conciliación y este cierre son autoevaluación declarada.
- **Decisiones del usuario**:
  - el brief, con las recomendaciones de D-1 a D-12;
  - R-6, la ampliación de `layout.tsx`;
  - R-7, bloquear antes, con la precisión fechada del ADR 0021, punto 7;
  - el commit y el push, el despliegue después de la CI y este cierre.
- **Nivel**:
  - validado localmente y en CI;
  - **validado en integración** para las pantallas (end-to-end sobre `next start`);
  - desplegado en producción y recorrido por el usuario en la organización de demostración.

  No es «preparado para producción».
- **No certifica**:
  - la venta sin pedido ni la anulación: son la 20.3 y la 20.4;
  - que el comprobante interno entregado a un consumidor final quede fuera de la Ley 27.743: sigue pendiente para la 13.5.2-b;
  - la impresión en otros navegadores que el del usuario y Chromium de Playwright;
  - en producción, el rechazo `already_sold` ni `order_not_delivered`: los cubren los tests de integración y el end-to-end;
  - que el autor (`users`) se bloquee antes del contador: se toma después, como en el alta del pedido (R-7).
- **Para la 20.3**: R-8, el `JOIN` interno de la exportación, anotado en el código.
