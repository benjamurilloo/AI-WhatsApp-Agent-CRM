---
schema: task-brief.v1
task_id: "29.5.2"
task_type: implementation
generated_at: 2026-10-20
---

# Brief 29.5.2 — Las unidades en pedidos y ventas

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado** por el usuario el 2026-10-20, con las recomendaciones: D-1 (a), las unidades se eligen al crear el pedido, y D-2 (a), el precio propio de la unidad entra.
- **Gate**: la Fase 29 se construye sin el negocio confirmado por decisión del usuario del 2026-10-18 (brief-29.2), sobre «iPhone Demo».

## Objetivo

Que un producto llevado por unidad se pueda pedir y vender **eligiendo sus unidades**, por su IMEI, y que cada unidad cambie de estado con el pedido y la venta: reservada, vendida y de vuelta disponible al anular. Es la segunda parte de la fila 29.5 del [ADR 0024](0024-rubros-y-capacidades.md) (punto 17), dividida por el [brief-29.5](brief-29.5-las-unidades.md), D-1 (a), y resuelve su hallazgo H-4.

## Contexto

La 29.5 dejó las unidades con sus entradas y salidas fuera de pedidos y ventas. Hoy un producto `unit` se rechaza en el pedido, en el pedido del agente, al confirmar un pedido y en la venta sin pedido, y una red de seguridad en `inventory` lanza un error si alguno llegara (H-1). El ADR 0024, punto 6, ya fija la tabla de caminos de pedidos y ventas, las tablas hijas de las líneas y el precio de cada unidad. Lo que no resuelve es **cuándo** elige el pedido sus unidades, porque el pedido fija sus montos al crearse y el del agente no puede elegirlas (H-4).

## Hallazgos (verificados contra el código en `8ae535e`, 2026-10-20)

- **H-1. Dónde se rechaza hoy un producto `unit`.** `evaluateLines` devuelve `unit_tracked` (`src/shared/lines/rules.ts:170-171`), que usan `createOrder` (`orders/service.ts:198`) y `issueSale` (`sales/service.ts:377`). El pedido del agente lo rechaza como `product_not_found` para no cambiar su contrato (`orders/service.ts:382-386`). Confirmar un pedido lo rechaza con `unit_tracked` (`orders/service.ts:567-580`). `adjustStock` también (`inventory/service.ts:621-627`). La red de seguridad `rejectUnitTracked` (`inventory/service.ts:887-903`) está al principio de `reserveStock`, `releaseStock`, `deliverStock`, `sellStock` y `restoreSaleStock`. Los textos están en `pedidos/messages.ts:92-93` y `:277-284` y en `ventas/messages.ts:135-136`.
- **H-2. El precio de la línea se fija al crear y `order_lines` es de solo inserción** (`orders/service.ts:266-273`; `drizzle/0036`, trigger `order_lines_insert_only` y `orders_guard_change`, que solo deja cambiar el estado y sus fechas). Ninguna migración posterior lo cambia. Es la H-4 de la 29.5: si el precio de la línea depende de sus unidades, las unidades se eligen al crear.
- **H-3. El pedido del agente nace pendiente, sin mirar el stock ni los precios esperados** (`placeOrderFromIngestion`, `orders/service.ts:333-426`; contrato `order.placed` de ingestión v2, `ingestion/contract-v2.ts:152-182`, que lleva `product_id` y `quantity`, sin unidades). El agente nunca confirma (ADR 0020, punto 9).
- **H-4. La venta de un pedido copia sus líneas tal cual y no toca el stock** (`issueSaleFromOrder`, `sales/service.ts:122-241`, con `insertSaleLines` en `:181-186`). Su anulación tampoco toca el stock: el pedido sigue entregado (`voidSale`, `:588-599`). La venta sin pedido descuenta con `sellStock` (`:410`) y su anulación devuelve con `restoreSaleStock` (`:611`). Las devoluciones son solo dinero y viven en `cash`, que no importa `inventory`.
- **H-5. Las funciones de pedidos y ventas en `inventory` reciben `StockLine {productId, quantity}`, sin unidades** (`inventory/service.ts:840`). `reserveStock` y `sellStock` devuelven un resultado; `releaseStock` (`:946`) y `deliverStock` (`:973`) lanzan si lo reservado no alcanza, que es un defecto y no una regla. `applySale` y `applySaleVoid` no escriben `unit_id` aunque el tipo `Sale` lo admite (`repository.ts:273-334`); `applyDelivery` no lo admite (`:233-241`). El patrón con unidades ya existe en `receiveStock` y `removeReceivedStock`: líneas con `units` o `unitIds`, `checkUnitLines` (`:1127-1146`), `lockUnits` después de los productos y antes de los saldos, y un movimiento de cantidad 1 por unidad con su `unit_id`.
- **H-6. La unidad solo conoce `available` y `written_off`.** El enum `stock_unit_status` y el trigger `stock_units_guard_change` (`drizzle/0056`, `:81-115`) solo permiten `available → written_off`; su comentario prevé que una subfase con un estado nuevo cambie solo esa función. `writeOffUnit` y `correctUnit` exigen `available` (`inventory/units.ts:410`, `:510`). La anulación de una recepción ya rechaza una unidad que no esté `available` (`units_unavailable`, `inventory/service.ts:1339-1350`).
- **H-7. El invariante de prueba solo cubre `available`**: saldo igual a las unidades `available` y reservado en 0 (`tests/integration/stock-invariant.ts:6-15`), y corre solo en las suites de `inventory` y `purchasing`.
- **H-8. Las pantallas.** El formulario del pedido (`pedidos/nuevo/order-form.tsx`) y el de la venta (`ventas/nueva/sale-form.tsx`, que reutiliza el `Picker` y las acciones de búsqueda de pedidos) cargan producto y cantidad, sin campo de precio; sin JavaScript, el producto se resuelve por SKU exacto (`pedidos/actions.ts:98-142`). La opción del buscador descarta `tracking` (`pedidos/actions.ts:291-296`). La recepción de mercadería ya pide los IMEI de una línea como texto, y su detalle los muestra (`compras/recepciones/[receiptId]/page.tsx:277-282`): es el único comprobante que hoy muestra IMEI. El comprobante imprimible de la venta (`ventas/[saleId]/page.tsx:270-330`), el de su anulación (`ventas/[saleId]/anulacion/page.tsx:181-200`) y el detalle del pedido (`pedidos/[orderId]/page.tsx:229-277`) no tienen dónde mostrarlo.
- **H-9. La lectura v2 del agente** entrega `quantity_reserved` y deriva lo disponible y el estado de stock de `on_hand − reserved` (`read/v2/contract.ts`; `inventory/service.ts:94-116`, `:434-449`). Con las reservas de unidades, esos números se mueven como con cualquier reserva: no cambia la forma ni la regla. La v1 entrega el saldo físico. Ninguna ruta de lectura expone pedidos ni sus líneas.
- **H-10. Las guardas.** `stock-writes` fija las funciones del repositorio por función y sus llamadores fuera de `inventory` solo por archivo (`tests/guards/stock-writes.test.ts:326-379`). `unit-writes` fija por función las escrituras de `stock_units` y cada llamador (`tests/guards/unit-writes.test.ts:29-35`, `:99-162`). `order-writes` y `sale-writes` fijan las funciones que escriben pedidos y ventas.
- **H-11. Las dependencias.** `purchasing/schema.ts:20` ya importa `stockUnits` de `inventory/schema` para la clave de `goods_receipt_line_units`: es el precedente para `order_line_units` y `sale_line_units` (DataModel, regla de esquemas). `orders` y `sales` ya dependen de `inventory` (Overview).
- **H-12. Correcciones a la 29.5.** Las líneas que citaba el brief-29.5 en H-3 y H-5 se corrieron: `lockLines` está en `:855` y los `throw` en `:946` y `:973`.

## Decisiones

### D-1 — Cuándo elige el pedido sus unidades (H-2, H-3; la H-4 de la 29.5)

- **(a) Recomendada: al crear el pedido, en la pantalla.**
  - El pendiente guarda sus unidades en `order_line_units`, de solo inserción, **sin reservarlas**: un pendiente no toca el stock (ADR 0020, punto 4).
  - **Confirmar reserva exactamente esas unidades** (`available → reserved`). Si alguna ya no está `available` (la reservó otro pedido, se vendió o se dio de baja), se rechaza, informando cuáles, y no se reserva nada. Para cambiarlas, se cancela y se crea otro pedido, como hoy con cualquier cambio (ADR 0020, punto 3).
  - **El pedido del agente de un producto `unit` sigue rechazado** como `product_not_found`, sin cambio de contrato. El agente no ve IMEI (invariante 6 de la 29.5) y no puede elegirlos. Pedir por unidad desde el agente lo diseña la 29.8, con su contrato nuevo.
  - Cumple el ADR tal como está: el precio de la línea puede depender de sus unidades (D-2), porque se conocen al crear.
- (b) Al confirmar. El pendiente nace sin unidades, también el del agente, y el `admin` las elige al confirmar.
  - A favor: el agente podría dejar pedidos de iPhone.
  - En contra: el precio de la línea ya se fijó al crear con el del producto, así que el precio propio de la unidad (D-2) no podría aplicarse a un pedido sin editar `order_lines`, que es de solo inserción. Habría que enmendar el ADR 0024, punto 6 (el precio de cada unidad), para los pedidos.

Cualquiera de las dos se registra con una nota fechada en el ADR 0024, punto 6, que cierra la contradicción.

### D-2 — El precio propio de la unidad (ADR 0024, punto 6)

- **(a) Recomendada: entra**, con D-1 (a).
  - `stock_units.price` y `price_currency`, opcionales y juntos (`CHECK`). Lo fija el alta manual y lo corrige un `admin` en «Corregir», con auditoría `price_change` sobre la unidad (ADR 0024, R-24). La recepción no lo fija: es un costo, no un precio.
  - **El precio de cada unidad en un pedido o una venta** es su precio propio si lo tiene, y si no, el vigente del producto. El monto de la línea es la suma de sus unidades, redondeada como hoy (ADR 0020, punto 3).
  - Una unidad con precio en otra moneda que el comprobante se rechaza, con un motivo propio, hasta que el ADR 0025 diga otra cosa (ADR 0024, punto 6).
  - **Por qué entra ahora**: en el rubro, dos unidades del mismo producto valen distinto por su grado y su batería. Sin precio propio, la única forma de cobrarlas distinto es crear un producto por grado, que es lo que el grado vino a evitar.
- (b) No entra. Cada unidad vale el precio del producto, y el precio propio queda para una subfase posterior. Achica la subfase (sin columna, sin campo, sin regla de moneda nueva), pero deja el grado sin efecto en el precio.

### D-3 — Los caminos (ADR 0024, punto 6; H-4, H-5)

| Operación | Unidad | Saldo y movimiento | Función (llamador) |
|---|---|---|---|
| Crear el pedido | ninguna: se guardan en `order_line_units` | ninguno | `createOrder` |
| Confirmar el pedido | `available` → `reserved` | reservado +1 por unidad, sin movimiento | `reserveStock` extendida (`transitionOrder`) |
| Cancelar un confirmado | `reserved` → `available` | reservado −1 por unidad, sin movimiento | `releaseStock` extendida (`transitionOrder`) |
| Cancelar un pendiente | ninguna | ninguno | — |
| Entregar el pedido | `reserved` → `sold` | −1 y reservado −1 por unidad, `order_delivery`, con `unit_id` | `deliverStock` extendida (`transitionOrder`) |
| Venta del pedido entregado, y su anulación | **no cambia**: ya salió con la entrega | ninguno; la venta copia `order_line_units` a `sale_line_units` | `issueSaleFromOrder` |
| Venta sin pedido | `available` → `sold` | −1 por unidad, `sale`, con `unit_id` | `sellStock` extendida (`issueSale`) |
| Anulación de la venta sin pedido | `sold` → `available` | +1 por unidad, `sale_void`, con `unit_id` | `restoreSaleStock` extendida (`voidSale`) |

- **El trigger `stock_units_guard_change`** suma las transiciones `available → reserved`, `reserved → available`, `reserved → sold`, `available → sold` y `sold → available`. `written_off` sigue final.
- **Lo que ya existe no cambia**: la baja manual y la corrección siguen exigiendo `available`, y la anulación de una recepción sigue rechazando una unidad que no esté `available`. Una unidad reservada o vendida no se da de baja.
- **Un movimiento por unidad**, con su `unit_id`, como en la 29.5. `applyDelivery` suma `unitId`, y `applySale` y `applySaleVoid` lo escriben.
- **El orden de bloqueo** (ADR 0024, punto 16): la cabecera del pedido o de la venta, el cliente, los productos `FOR SHARE`, **las unidades `FOR UPDATE` por id**, los saldos `FOR UPDATE` por producto, el contador y los inserts.
- **Las firmas (H-5)**: las líneas de `reserveStock`, `releaseStock`, `deliverStock`, `sellStock` y `restoreSaleStock` suman `unitIds` opcional, como `RemovalStockLine`, comprobado con `checkUnitLines`. `reserveStock` y `sellStock` suman un resultado `units_unavailable`, con las unidades que no están `available`. `releaseStock` y `deliverStock` **siguen lanzando**: que una unidad reservada por un pedido no esté `reserved` al liberarlo o entregarlo es un defecto que el trigger ya impide, no una regla de negocio. La red de seguridad de H-1 pasa a rechazar una línea `unit` **sin** sus unidades y una línea `quantity` **con** unidades.
- **La reserva de un producto `quantity` no cambia.**

### D-4 — La migración `0057`

Una sola migración, aditiva:
- `ALTER TYPE stock_unit_status ADD VALUE 'reserved'` y `'sold'`. **Ningún `CHECK`, índice ni dato de la `0057` usa esos valores como enum**: el trigger compara `status::text`, como en la `0056`. Un test migra hasta la `0056`, confirma y aplica la `0057` sola (la nota del vault «A New Enum Value Cannot Be Used in the Transaction That Adds It»).
- `CREATE OR REPLACE FUNCTION stock_units_guard_change()` con las transiciones de D-3.
- Con D-2 (a): `stock_units.price numeric(14, 2)` y `price_currency text`, los dos nulos o los dos puestos, el precio mayor que cero y la moneda con el `CHECK` de tres letras.
- `order_line_units` (de `orders`): la organización, la línea (FK compuesta a `order_lines`, que suma el `UNIQUE (organization_id, id)` que la exige), la unidad (FK compuesta a `stock_units` con el producto, para que la unidad sea del producto de la línea) y su precio. `UNIQUE (order_line_id, unit_id)`. **Sin `UNIQUE (unit_id)`**: una unidad puede estar en un pedido cancelado y después en otro. De solo inserción.
- `sale_line_units` (de `sales`): lo mismo contra `sale_lines`. De solo inserción.
- `crm_app`: `SELECT` e `INSERT` en las dos tablas nuevas, con su trigger de solo inserción.

Que la unidad sea del producto de la línea lo asegura la clave compuesta `(organization_id, product_id, unit_id)` si la línea guarda el producto en la fila hija; si no, lo asegura el servicio y lo prueba un test. Lo decide la implementación con la forma de `goods_receipt_line_units` como referencia, y lo declara.

### D-5 — Las pantallas (H-8)

- **El pedido y la venta nuevos**: en una línea de un producto `unit`, la cantidad se reemplaza por **un campo de IMEI, uno por renglón**, como en la recepción, y la cantidad es la cantidad de IMEI. Funciona sin JavaScript y con un lector de códigos. Con JavaScript, debajo del campo se listan las unidades `available` del producto (IMEI, grado, batería y precio), y elegir una la agrega al campo. El servicio rechaza un IMEI que no sea de una unidad `available` de ese producto, o repetido, nombrándolo.
- **El precio estimado** de la línea usa el precio de cada unidad (D-2), y el servicio vuelve a comprobarlo como hoy comprueba el precio esperado.
- **El detalle del pedido** muestra los IMEI de cada línea. En un pendiente, marca las unidades que ya no están disponibles, porque confirmar las va a rechazar.
- **El comprobante imprimible de la venta y el de su anulación** muestran los IMEI de cada línea, debajo del producto, como la recepción. Es lo que el cliente se lleva.
- **Los mensajes** de `unit_tracked` en el pedido, la venta y la confirmación se retiran; los del ajuste de stock quedan.
- **El historial de movimientos** ya muestra el IMEI de cada movimiento con unidad (29.5): ahora también los de entrega, venta y anulación.
- La pantalla de unidades del producto muestra el estado de cada una (disponible, reservada, vendida) y, en una reservada o vendida, el pedido o la venta.
- Funciona sin JavaScript, con axe en claro y oscuro y a 375 px, como el resto.

### D-6 — El agente (H-3, H-9)

- **Con D-1 (a)**, el pedido del agente de un producto `unit` sigue rechazado como `product_not_found`, sin cambio de contrato.
- **La lectura v2** refleja las reservas de unidades en `quantity_reserved`, lo disponible y el estado de stock, como cualquier reserva. No cambia la forma ni la regla, y no hace falta avisarle al agente.
- **El agente nunca ve un IMEI, un precio propio ni un costo.** Las lecturas de servicio del producto siguen dando el precio del producto.

### D-7 — El invariante (H-7)

- El helper pasa a la regla completa del ADR: el saldo de un producto `unit` es igual a sus unidades `available` y `reserved`, y lo reservado es igual a sus `reserved`. La suma de movimientos con signo se compara donde la suite no arma los saldos con SQL directo (desviación 5 de la 29.5).
- Se corre después de cada escritura de las suites de `orders` y `sales`, además de las de `inventory` y `purchasing`.
- **La conciliación de la 19.3** (lo reservado es la suma de las líneas de los pedidos confirmados) se mantiene y suma la de las unidades: cada unidad `reserved` está en exactamente un pedido confirmado.

### D-8 — Roles

Como hoy: solo un `admin` crea, confirma, cancela y entrega pedidos y emite y anula ventas, y fija o corrige el precio de una unidad. Un `viewer` ve los IMEI de los pedidos y las ventas y el precio de cada unidad, **sin el costo** (FR-PROD-21).

### D-9 — Pruebas

- **Unitarias**: las reglas de línea con unidades (cantidad igual a la cantidad de IMEI, IMEI repetido, precio por unidad, moneda de la unidad) y el monto de la línea como suma.
- **Integración contra PostgreSQL**:
  - el esquema: los `CHECK`, el trigger con cada transición permitida y una prohibida, las claves compuestas, el solo inserción de las tablas nuevas, y la `0057` aplicada sola sobre la `0056` confirmada;
  - cada camino de D-3, con el invariante después de cada escritura;
  - confirmar con una unidad ya reservada por otro pedido, vendida o dada de baja, que se rechaza sin reservar nada;
  - dos confirmaciones concurrentes de pedidos con la misma unidad, y una venta sin pedido concurrente con una confirmación: una gana y la otra se rechaza;
  - la baja y la anulación de la recepción de una unidad reservada o vendida, que se rechazan;
  - la venta de un pedido con sus IMEI copiados, y su anulación sin tocar las unidades;
  - la anulación de una venta sin pedido, que devuelve sus unidades a `available`;
  - el pedido del agente de un producto `unit`, que se sigue rechazando;
  - la lectura v2 con lo reservado de unidades;
  - el aislamiento entre organizaciones;
  - **un producto `quantity` y una organización sin la capacidad no cambian**: las suites de siempre pasan sin tocarlas.
- **Guardas**: `stock-writes` y `unit-writes` con las funciones nuevas fijadas por función y su único llamador; `order-writes` y `sale-writes` con la escritura de las tablas hijas; `exposed-surface` si hay acciones nuevas.
- **End-to-end**: crear un pedido eligiendo unidades, confirmarlo, entregarlo y emitir su venta con los IMEI en el comprobante; una venta sin pedido y su anulación; el rechazo de una unidad ya reservada; sin JavaScript; axe en claro y oscuro, y 375 px.
- **Antes del commit**: `git add -N` a cada archivo nuevo al crearlo, `npm run format:check` completo y `npm run build` antes de cada corrida end-to-end. **Nunca dos corridas de integración o una de integración y otra de end-to-end a la vez.**

### D-10 — Revisión independiente, despliegue y cierre

- **Revisión independiente**: sí, antes del despliegue. Toca el stock y la venta de todas las organizaciones. Un agente de solo lectura contra este brief, el ADR 0024, el 0020, el 0021, el 0008 y el código.
- **Despliegue**, con la autorización del usuario: la `0057` y el código, con el servicio detenido durante el build (README de producción). No hay pasos de operador.
- **Recorrido del usuario** en «iPhone Demo»: un pedido con dos unidades, su confirmación, su entrega y su venta con los IMEI en el comprobante; una venta sin pedido y su anulación. «Demostración Vixora» se comprueba con recuentos.
- **Cierre**: DataModel, FunctionalRequirements (FR-PROD-30 y los de pedidos y ventas), una nota fechada al ADR 0024, punto 6 (D-1 y D-2), y otras al 0020 y al 0021, el CHANGELOG, el HANDOFF, el Roadmap, Notion y Knowledge Capture.

## Alcance incluido

- `drizzle/0057_*.sql` y su snapshot.
- `src/modules/inventory/` (los estados, las funciones de pedidos y ventas con unidades, el precio propio con D-2 (a)).
- `src/modules/orders/` (las unidades del pedido y sus transiciones) y `src/modules/sales/` (las unidades de la venta y su anulación).
- `src/shared/lines/` (las reglas de línea con unidades).
- `src/modules/catalog/`, solo si hace falta para leer el seguimiento en las líneas.
- `src/modules/audit/`, solo si el precio de la unidad necesita un tipo de entidad o una acción.
- `src/app/(autenticado)/`: `pedidos/`, `ventas/` y `productos/[productId]/unidades/`.
- `tests/` (unitarias, integración, guardas y end-to-end).
- La documentación del cierre.

## Alcance excluido

- **Cambiar el contrato del agente** (ingestión o lectura): el pedido del agente por unidad es de la 29.8.
- **La exportación de los datos de un cliente**: sigue con las líneas como hoy, sin IMEI. Si el usuario quiere los IMEI ahí, es una decisión aparte.
- La devolución de un equipo: las devoluciones siguen siendo solo dinero (ADR 0022).
- El margen por unidad en reportes (Fase 25), la garantía (29.9), las reparaciones (29.6) y el usado recibido (29.7).
- Endurecer las reglas existentes de `stock-writes` para los productos `quantity` (H-2 de la 29.5).
- Cambios en «Demostración Vixora» o en cualquier organización que no sea «iPhone Demo».
- Dependencias nuevas y cambios en el agente o en su repositorio.

## Invariantes

1. **Un producto `quantity`, y una organización sin la capacidad, se comportan exactamente como hoy.**
2. **El saldo de un producto `unit` es igual a sus unidades `available` y `reserved`, y lo reservado, a sus `reserved`**; el saldo nunca cambia sin su movimiento, que lleva la unidad (ADR 0008).
3. **Una unidad está reservada por, a lo sumo, un pedido confirmado**, y una vendida salió por una entrega o una venta sin pedido.
4. **El número de unidades de una línea es igual a su cantidad**, y cada una es del producto de la línea.
5. **Los montos de un pedido y de una venta no se recalculan** después de crearse (ADR 0020, punto 3).
6. **El agente nunca ve un IMEI, un precio propio ni un costo.**
7. **Aislamiento por organización**: las claves compuestas lo exigen en la base.
8. **La migración es aditiva**, y ningún valor nuevo de enum se usa en su lote.

## Criterios de aceptación

- **AC-1**: un `admin` crea un pedido de un producto `unit` eligiendo sus unidades por IMEI; la cantidad es la cantidad de IMEI, y un IMEI ajeno, repetido o no disponible se rechaza nombrándolo.
- **AC-2**: confirmar reserva esas unidades; si alguna ya no está `available`, se rechaza sin reservar nada. Cancelar un confirmado las libera; entregarlo las vende, con un movimiento por unidad.
- **AC-3**: la venta de un pedido entregado lleva sus IMEI, también en el comprobante imprimible, y ni ella ni su anulación tocan las unidades.
- **AC-4**: un `admin` emite una venta sin pedido eligiendo unidades; salen como vendidas, con un movimiento por unidad; la anulación las devuelve a `available`.
- **AC-5**: (con D-2 (a)) el precio de cada unidad es el propio o el del producto, el monto de la línea es la suma, y una unidad con precio en otra moneda se rechaza; el precio propio se fija y se corrige con auditoría.
- **AC-6**: dos operaciones concurrentes sobre la misma unidad no la reservan ni la venden dos veces.
- **AC-7**: la baja y la anulación de una recepción se rechazan para una unidad reservada o vendida.
- **AC-8**: el pedido del agente de un producto `unit` sigue rechazado, y la lectura v2 refleja lo reservado sin cambiar de forma.
- **AC-9**: el invariante completo se cumple después de cada escritura de las suites de `inventory`, `purchasing`, `orders` y `sales`.
- **AC-10**: un `viewer` ve los IMEI y los precios de las unidades en pedidos y ventas, sin el costo.
- **AC-11**: sin la capacidad, y en un producto `quantity`, nada cambia.
- **AC-12**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-13**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-14**: desplegada y recorrida por el usuario en «iPhone Demo», con «Demostración Vixora» intacta.

## Pruebas y evidencia requerida

Las de D-9, en CI sobre el SHA desplegado; el recorrido del usuario en «iPhone Demo»; y una consulta de solo recuentos que muestre que «Demostración Vixora» no tiene unidades ni filas en las tablas nuevas.

## Condiciones de detención

Detenerse y avisar si:

- hace falta editar `order_lines` o `sale_lines`, o recalcular un monto ya fijado;
- un producto `quantity` o una organización sin la capacidad cambia en cualquier forma;
- hace falta cambiar un contrato del agente;
- la reserva o la venta de una unidad necesita un camino que no pase por `inventory`;
- `orders` o `sales` necesitan importar algo de `inventory` que no sea su `index.ts` o su esquema;
- la migración necesita usar un valor de enum en su propio lote;
- hace falta tocar un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cualquier commit, push o despliegue;
- ejecutar la migración en producción.

## Cierre

*Del 2026-10-20, antes del despliegue; completado ese día con el despliegue y el recorrido.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `resolveLineUnits` (`inventory/service.ts`) y las reglas de `src/shared/lines/rules.ts`; el IMEI ajeno, de otro producto, no disponible, repetido o mal escrito se nombra, desde la revisión también el repetido y el de otra moneda (H-4); `units-orders-sales.test.ts`, «el alta del pedido con unidades» |
| AC-2 | cumple | `reserveStock`, `releaseStock` y `deliverStock` con unidades; `units-orders-sales.test.ts`, «los caminos del pedido» |
| AC-3 | cumple | `issueSaleFromOrder` copia `order_line_units`; el comprobante y la anulación muestran los IMEI (`line-unit-list.tsx`); integración y `tests/e2e/units.spec.ts` |
| AC-4 | cumple | `sellStock` y `restoreSaleStock` con unidades; «la venta sin pedido» y el e2e |
| AC-5 | cumple | el precio de cada unidad y la línea como suma en `evaluateLines`; `price_change` en `correctUnit`; `rules.test.ts`, `units.test.ts` y la integración (desviaciones 2 y 3) |
| AC-6 | cumple | dos confirmaciones, una venta contra una confirmación y, desde la revisión, dos anulaciones de una venta con unidades (H-2); «la concurrencia» |
| AC-7 | cumple | la baja, la corrección y la anulación de la recepción siguen exigiendo `available`; «lo que no cambia» |
| AC-8 | cumple | `placeOrderFromIngestion` sin cambios; la lectura v2 con lo reservado por `getProductBalanceForService` (desviación 6) |
| AC-9 | cumple | `tests/integration/stock-invariant.ts`, con la regla completa y cada reservada en exactamente un pedido confirmado, corre después de cada test de `inventory`, `purchasing`, `orders` y `sales` (en `sales`, sin la suma de movimientos: desviación 5) |
| AC-10 | cumple | `getSale` y `listProductUnits` para un `viewer`, con los IMEI y los precios, sin costo; integración |
| AC-11 | cumple | las suites existentes pasan sin cambios de conducta; solo se ajustaron las aserciones de los campos nuevos (`reason`, `lineTotal`) y las listas de tablas |
| AC-12 | cumple | CI run 39450745241 en `success` sobre `6d07f030235a0f032bfff17c439e5bdb1e99e7db`; en local, typecheck, lint, formato, unitarias y guardas (1820), integración y e2e completo (264, con axe) (ver «Corridas») |
| AC-13 | cumple | revisión independiente del 2026-10-20, antes del despliegue (abajo) |
| AC-14 | cumple | desplegada (`6d07f03`, 58 migraciones, con el servicio detenido durante el build); el usuario recorrió en «iPhone Demo» la unidad con precio propio, el pedido con dos unidades (el total como suma, confirmar, entregar y la venta con los IMEI en el comprobante), la venta sin pedido y su anulación, y dijo «esta todo perfecto». Recuentos después del recorrido: «iPhone Demo» con 4 unidades (2 vendidas, 1 disponible, 1 dada de baja), 2 en `order_line_units`, 3 en `sale_line_units` y 1 con precio propio, y 0 productos por unidad cuyo saldo o reservado no coincide con sus unidades; «Demostración Vixora» y «Vixora» con 0 unidades y 0 filas en las dos tablas nuevas |

**Nivel alcanzado**: validado en integración (`producer-consumer`), desplegado y recorrido en producción sobre una organización demo. No hay negocio real, y el pedido del agente de un producto por unidad sigue rechazado hasta la 29.8.

### Desviaciones y decisiones de implementación

1. **Un archivo fuera del alcance**: `src/modules/purchasing/lines.ts` suma `serials: []` y `expectedLineTotal: null` para cumplir el tipo nuevo de `ParsedLine`. No cambia la conducta de las compras. Lo encontró la revisión (H-1), y **el usuario lo aceptó como enmienda del alcance el 2026-10-20**.
2. **`order_lines.unit_price` y `sale_lines.unit_price` en una línea por unidad** (H-3): si todas sus unidades valen lo mismo, ese precio, aunque sea el propio; si valen distinto, el del producto, y el monto de la línea es la suma de las unidades. El precio de cada una queda en `order_line_units.unit_price` y `sale_line_units.unit_price`, y la pantalla muestra «Por unidad». DataModel lo dice desde este cierre.
3. **El producto necesita precio aunque todas sus unidades tengan precio propio** (H-5): el precio vigente del producto da el precio esperado de la línea y la moneda del comprobante. Se rechaza con `no_price`, como hoy.
4. **El monto esperado de una línea por unidad** se compara solo cuando todos sus IMEI salieron de la lista que mostró la pantalla. Sin JavaScript, o con un IMEI tipeado a mano, vale el de ahora, como el precio esperado sin JavaScript (H-6).
5. **AC-9 en `sales`**: el invariante corre sin la suma de movimientos, porque esa suite arma los saldos con SQL directo (como la desviación 5 de la 29.5).
6. **AC-8**: la lectura v2 se prueba con `getProductBalanceForService`, no por la ruta HTTP, porque la ruta no cambió.
7. **`src/app/(autenticado)/pedidos/form-lines.ts`**: la lectura de las líneas del formulario se sacó de `actions.ts` para compartirla con la venta. Un archivo `"use server"` solo exporta acciones.
8. **La cobertura que pide D-9 y no tiene test** (H-7): el pedido sin JavaScript (sí la venta), el detalle del pedido visto por un `viewer`, y el trigger transición por transición con SQL (`reserved → available` se prueba solo a través del servicio).

### Revisión independiente

Del 2026-10-20, antes del despliegue, por un agente que no participó, de solo lectura: 1 bloqueante de procedimiento, 1 mayor y 5 menores. Cada hallazgo se verificó contra el código; las correcciones son autoevaluación y no tuvieron una segunda revisión.

- **H-1** (confirmado, de procedimiento): el archivo fuera del alcance. Desviación 1, aceptada por el usuario.
- **H-2** (confirmado, mayor): dos anulaciones simultáneas de una venta sin pedido con unidades. La segunda se serializaba en las unidades, las veía `available` y terminaba en un error interno en lugar de `already_voided`. La premisa de D-3, que un estado inesperado es un defecto que el trigger impide, valía para el pedido, serializado en su cabecera, pero no para la venta, que no se bloquea. Corregido: `restoreSaleStock` acepta un `recheck` que corre con las unidades bloqueadas, antes de exigirlas vendidas, y `voidSale` mira ahí la anulación previa. El contador sigue después de los saldos. Con test.
- **H-3** (confirmado): desviación 2.
- **H-4** (confirmado): el IMEI repetido dentro de una línea o entre líneas, y el de una unidad con precio en otra moneda, no se nombraban. Corregido: los rechazos llevan `serial` y los mensajes lo nombran. Con test.
- **H-5** (confirmado): desviación 3.
- **H-6** (confirmado): desviación 4.
- **H-7** (confirmado): se agregaron el test de las dos anulaciones y el de solo inserción de `sale_line_units`; el resto, desviación 8.

### Corridas

- **Integración**: la primera corrida completa (43 minutos con la máquina saturada) dio 18 fallos. Cinco eran aserciones de contrato que había que actualizar (`reason: "insufficient"`, `lineTotal: null` y las dos tablas nuevas en `audit` e `identity-schema`); el resto, tiempos agotados y un PostgreSQL local que se reinició a mitad de la corrida. Después de reiniciar la máquina, los 13 archivos afectados pasaron (203 tests). La corrida completa siguiente (16 minutos) dio 1650 de 1651, con dos archivos que crean y borran bases (`migration-0054` y `organization-bootstrap`) por tiempo agotado; repetidos solos, pasaron.
- **End-to-end**: `units.spec.ts`, 9 de 9, después de hacer exacto un selector que también encontraba «Subtotal estimado:». El completo, 264 de 264.
- **El despliegue (2026-10-20)**: con el servicio detenido durante el build, como pide el runbook desde la 29.5; terminó bien a la primera. Producción anotó `3a9a69b` como SHA anterior para volver atrás.
