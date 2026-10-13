---
schema: task-brief.v1
task_id: "20.3"
task_type: implementation
generated_at: 2026-10-13
---

# Brief 20.3 — La venta sin pedido

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el servicio, la salida de stock, las reglas de línea compartidas, las guardas y los scripts de datos de un cliente, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-12).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-12, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: tercera subfase de la Fase 20 — Ventas ([Roadmap](../planning/Roadmap.md) §Fase 20), después de la 20.2, cerrada el 2026-10-13. Implementa la fila «20.3» del punto 13 del [ADR 0021](0021-la-venta.md).
- **No abre ni cierra gate.** Es la primera salida de stock que no viene de un pedido y la primera escritura de `inventory` desde `sales`. Por eso se recomienda la revisión independiente (D-11).
- **Estado de este documento**: **aprobado por el usuario el 2026-10-13**, con todas las recomendaciones: D-1(a), D-2, D-3, D-4, D-5(a), D-6 a D-12. **Cerrado el 2026-10-13** (§Cierre). La tarea 20.3 (`3f7702be6f4e8100866cf66f074f3ee3`) pasó a «En proceso» ese día y a «Completado» con el cierre.

## Objetivo

Que un `admin` pueda **emitir una venta sin pedido**, la de mostrador: elige productos y cantidades, con o sin cliente, y la venta toma el precio vigente, **descuenta lo disponible** con un movimiento `sale` por línea y lleva su número `V-000123` en la misma serie que la venta de un pedido. La lista, el detalle y el comprobante imprimible de la 20.2 la muestran igual, con «Consumidor final» cuando no hay cliente. Las reglas de línea se comparten con el pedido sin duplicarlas. Sin anulación (20.4).

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-13, sobre `main` (`6dea3a0`).

**Ya está fijado** por el ADR 0021, puntos 4, 5, 7, 9, 10, 12 y 13, con la precisión del punto 7 del 2026-10-13:
- la venta sin pedido se arma con líneas, con las reglas del pedido: el precio vigente leído con el producto bloqueado en modo compartido, una moneda por venta (la de la primera línea), el rechazo de un producto sin precio, con el precio en otra moneda o inactivo, un producto por línea, cantidad mayor que cero, el redondeo del ADR 0019, una línea en cero o un monto que no cabe se rechazan, y el límite de líneas del pedido;
- **el cliente es opcional**; si hay, tiene que estar activo y se bloquea en modo compartido;
- descuenta al emitir con un movimiento del **tipo nuevo `sale`**, uno por línea, con `balance_after` y el motivo `Venta V-000123`, **sin clave foránea a la venta**;
- comprueba **lo disponible** (`quantity_on_hand − quantity_reserved`) y rechaza con `BUSINESS_RULE_VIOLATION` y la regla `insufficient_stock`, informando lo disponible de cada línea que no alcanza; no descuenta nada parcialmente; **lo reservado no cambia**;
- la salida es **una función nueva de `inventory`**, que recibe la transacción de `sales`, bloquea los saldos y escribe saldo y movimiento juntos; **no extiende `applyStockChange`**; `stock-writes` se extiende a ella y a sus llamadores; el ajuste manual sigue aceptando solo sus dos tipos;
- el orden de bloqueo: el cliente en modo compartido, si hay; los productos en modo compartido por `product_id`; sus saldos `FOR UPDATE` en el mismo orden; al final el contador de `sale`;
- `order_id` y `client_id` pasan a nulables; las claves compuestas y `RESTRICT` no cambian;
- solo `admin` emite; el agente no emite ni lee ventas; ningún contrato con el agente cambia;
- la exportación incluye las ventas del cliente.

**Lo que dejó abierto el ADR para este brief** (§«Lo que este ADR no decide»): dónde vive el código de las reglas de línea compartidas (D-1), si la venta rechaza con `CONFLICT` un precio que cambió mientras se cargaba (D-4) y si busca el producto por su código de barras (D-5).

**Lo que hay en el código y se reutiliza**:
- `src/modules/orders/line-total.ts`: `computeLineTotal` y `sumOrderTotal` son **puras** y solo importan `@/shared/money` y `@/shared/quantity`. Las usan `createOrder` y `placeOrderFromIngestion` de `orders/service.ts` y la estimación del formulario (`pedidos/estimate.ts`).
- `createOrder` aplica las reglas de línea en un bucle propio: valida la entrada (`validateOrderInput`), rechaza los repetidos (`duplicateLines`), bloquea cliente y productos y después revisa `inactive_product`, `no_price`, el precio esperado (`CONFLICT`), la moneda y los montos. `placeOrderFromIngestion` tiene otro bucle, con las reglas del contrato del agente y una sola respuesta por regla.
- `crm.lockClientForOrder` y `catalog.lockProductsForOrder` (modo compartido, con el precio vigente), que ya usa la 20.2.
- `inventory`: `lockLines` (bloquea los saldos ordenados por producto, creando la fila en 0 si falta), `reserveStock` (comprueba lo disponible, todo o nada) y `deliverStock` con `repository.applyDelivery` (movimiento y saldo juntos) son el molde. **Convención de la 19.3**: un rechazo después de bloquear saldos **se lanza**, para revertir la fila en 0 que crea `lockBalance`.
- `stock-writes` autoriza funciones del repositorio (`AUTHORIZED`) y fija quién las llama (`CALLERS`), desde la 19.3.
- `sales`: `issueSaleFromOrder`, `insertSale`, `insertSaleLines`, la auditoría y las pantallas de la 20.2; `sale-writes` ya autoriza las dos inserciones.
- El formulario del alta de un pedido (`pedidos/nuevo/order-form.tsx`, `picker.tsx`, `pedidos/estimate.ts`) y sus buscadores (`searchOrderProductsAction`, `searchOrderClientsAction` en `pedidos/actions.ts`). **Hay precedente de importar entre rutas**: `clientes/` importa de `pedidos/` y de `conversaciones/`.
- `src/shared/` no importa módulos (regla de `eslint.config.mjs`).
- **Producción** corre `ceb5692`, con la migración `0039`. La de esta subfase es la `0040`.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre DataModel, Overview, los ADR 0019 a 0021, FunctionalRequirements, `stock-writes`, los scripts y las pantallas de movimientos):
- **H-1. DataModel, `inventory_movements.type`**, dice que son «solo los tipos con productor en el MVP; entradas y salidas llegarían con compras y ventas, fuera de alcance». Con la 20.3, `sale` tiene productor. Se precisa con fecha, sin borrar el texto. La enmienda del ADR 0021 en §`inventories` ya anuncia la función de la 20.3.
- **H-2. El historial de movimientos de un producto** (`productos/[productId]/movimientos/`) tiene una etiqueta y un valor de filtro por tipo (`entrega` → `order_delivery`). Sin `sale`, la venta aparecería sin nombre y no se podría filtrar. Se suma «Venta» (`?tipo=venta`). Está en la lista autorizada.
- **H-3. `catalog-inventory-schema.test.ts`** fija los valores del enum de movimientos, y `inventory/service.test.ts` y `orders-cycle.test.ts` fijan que el ajuste rechaza `order_delivery`. Suman el caso de `sale`.
- **H-4. El rescate del `23505` de la 20.2** traduce un choque con el índice único del pedido a `already_sold`. La venta sin pedido no pasa por ese índice (`order_id` nulo, y en PostgreSQL los nulos no chocan en un índice único), así que su camino **no** traduce un `23505`: sería un defecto, y se informa como error.
- **H-5. La venta de un pedido siempre tiene cliente.** Al volver nulable `client_id`, un `CHECK (order_id IS NULL OR client_id IS NOT NULL)` impide una venta de pedido sin cliente (D-2).
- **H-6. Overview**: la fila de `sales` suma `inventory` a lo que usa, y la de `inventory` suma a `sales` como segundo módulo que escribe stock con su transacción. El ADR 0021, punto 9, ya lo prevé.
- **H-7. La lectura del agente**: `read-v1` informa el saldo físico y `read-v2`, lo disponible. Una venta sin pedido baja el saldo físico y el agente lo ve en las dos **sin cambiar ningún contrato** (ADR 0021, punto 5). Los tests de contrato no cambian.
- **H-8. FR-PROD-15 y el brief-17.2, D-4** dicen que las sugerencias del buscador **no** buscan por código de barras («la búsqueda del agente y las sugerencias del buscador no cambian»). D-5 lo cambiaría con una precisión fechada.
- **H-9. `scripts/client-data-export.ts`** une `sales` con `orders` por un `JOIN` interno y lo anota (revisión independiente de la 20.2, R-8). Una venta sin pedido **con** cliente se perdería en la exportación. Pasa a `LEFT JOIN`. `client-data-delete.ts` ya cuenta las ventas por `client_id`, así que una venta sin pedido con cliente ya impide borrarlo; una sin cliente no cuenta, y es correcto.
- **No apareció ninguna contradicción** que obligue a cambiar el ADR 0021. Las decisiones de abajo resuelven lo que dejó abierto.

## Alcance incluido

1. **Esquema** (migración `0040`, generada con `drizzle-kit generate` y completada a mano):
   - **`sale`** en `inventory_movement_type` (valor aditivo).
   - **`sales.order_id` y `sales.client_id` nulables.** Las claves compuestas, el índice único `(organization_id, order_id)` y los índices de la lista no cambian.
   - **`CHECK (order_id IS NULL OR client_id IS NOT NULL)`** (D-2).
2. **Reglas de línea compartidas** (D-1): un módulo puro nuevo, `src/shared/lines/`, con el total de la línea, la suma y la evaluación de las líneas contra los productos bloqueados. `createOrder` pasa a usarlo **sin cambiar su comportamiento**, y `placeOrderFromIngestion` usa de ahí el total y la suma.
3. **`inventory`**:
   - `sellStock(tx, { organizationId, lines, reason, createdBy })` en el servicio y la interfaz: bloquea los saldos ordenados por producto, comprueba lo disponible de cada línea y, si todas alcanzan, escribe un movimiento `sale` y el saldo nuevo de cada una. Si alguna no alcanza, no escribe y devuelve las faltas (D-3).
   - `applySale(tx, …)` en el repositorio: el movimiento `sale` y el saldo en la misma función, sin tocar lo reservado.
   - El ajuste manual sigue rechazando `sale` como tipo.
4. **`sales`**:
   - `issueSale(context, input)` (solo `admin`): valida la entrada, bloquea el cliente si hay, los productos y los saldos, aplica las reglas de línea y el precio esperado, toma el número, inserta cabecera y líneas, descuenta el stock con el motivo `Venta V-000123` y audita `create` (D-8). Respuestas en D-9.
   - Las lecturas de la 20.2 aceptan `orderId` y `clientId` nulos.
5. **Pantallas** (D-6 y D-7):
   - `/ventas/nueva`, solo `admin`: cliente opcional, líneas con buscador, precio vigente y subtotal estimado, como el alta del pedido;
   - «Nueva venta» en la lista de ventas, solo para `admin`;
   - el detalle, la lista y el comprobante con «Consumidor final» sin cliente y sin pedido cuando no lo hay;
   - «Venta» en el historial de movimientos de un producto, con su filtro (H-2).
6. **Buscador por código de barras** (D-5), si se aprueba: las sugerencias de productos encuentran también por código de barras exacto.
7. **Guardas**:
   - `stock-writes`: `applySale` autorizada, con lo suyo y nada más; `applySale` solo desde `sellStock`, y `sellStock` fuera de `inventory` solo desde `src/modules/sales/service.ts`, con sus casos de fallo versionados;
   - `exposed-surface`: la acción nueva;
   - `module-boundary`: `sales` → `inventory`.
8. **Datos de un cliente** (H-9): la exportación con `LEFT JOIN`, para incluir las ventas sin pedido del cliente.
9. **Documentación**:
   - `DataModel.md`: `sales` (columnas nulables, el `CHECK`, el orden de bloqueo de la venta sin pedido), `inventories` (la función implementada), `inventory_movements.type` (H-1);
   - `Overview.md` (H-6), `FunctionalRequirements.md` (FR-VEN, y FR-PROD-15 si D-5), `Screens.md` (la pantalla nueva, el cambio de la 17, la 18 y el historial de movimientos), `TraceabilityMatrix.md`, `SecurityModel.md` (recuentos), `EngineeringStandards.md` (la guarda) y el runbook de datos de un cliente.

## Alcance excluido

- **La anulación**, `sale_voids`, `replaces_sale_id`, el índice parcial, la reposición `sale_void`, la acción `void` y el filtro «anulada» (20.4).
- **Cambiar las reglas de respuesta del pedido del agente**: `placeOrderFromIngestion` conserva sus reglas, su orden y sus códigos (`ingestion-v2` no cambia). Solo toma el total y la suma del lugar nuevo.
- **Mostrar lo disponible en el formulario** antes de emitir (D-6).
- **La venta en la ficha del cliente** y en la del producto (D-8 de la 20.2 sigue).
- **Descuentos, listas de precios, el IVA, documento y CUIT/CUIL; cobros, señas, medios de pago y caja** (Fase 21).
- **Un lector de código de barras con la cámara** o cualquier dependencia nueva.
- **El agente**: `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **Métricas y dashboard**; datos de volumen y staging.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0040_*.sql` y `drizzle/meta/*`
- `src/shared/lines/` (nuevo), con sus tests unitarios
- `src/modules/orders/`: `line-total.ts` y `line-total.test.ts` (se mueven a `src/shared/lines/`) y `service.ts`, **solo** para usar el módulo compartido sin cambiar el comportamiento
- `src/modules/inventory/`: `schema.ts` (el valor del enum), `repository.ts` (`applySale`), `service.ts` (`sellStock` y el comentario del ajuste), `index.ts` y `service.test.ts`
- `src/modules/catalog/repository.ts` y su test, **solo** si D-5
- `src/modules/sales/`, con sus tests unitarios
- `src/app/(autenticado)/ventas/` (con `nueva/`, nuevo); `src/app/(autenticado)/pedidos/estimate.ts`, **solo** para usar `src/shared/lines/` en lugar de su copia (D-1); `src/app/(autenticado)/productos/[productId]/movimientos/page.tsx`, `filters.ts` y `filters.test.ts`, **solo** el tipo `sale`
- `scripts/client-data-export.ts`
- `tests/integration/`: `sales.test.ts`, `sales-schema.test.ts`, `client-data.test.ts`, `catalog-inventory-schema.test.ts` y `orders-cycle.test.ts`, **solo** el tipo `sale`; un test de `catalog` si D-5
- `tests/guards/stock-writes.test.ts`; `exposed-surface.test.ts` y `module-boundary.test.ts`, **solo** lo de `sales`
- `tests/e2e/sales.spec.ts`
- `docs/architecture/DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`; `docs/development/EngineeringStandards.md`; `docs/runbooks/datos-de-un-cliente.md`
- al cerrar: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

`crm`, `numbering`, `audit`, `src/shared/money/`, `src/shared/quantity/`, `ingestion`, los seeds y los contratos del agente **no** se tocan.

## Fuentes de verdad

- **El código y las migraciones**: `sales` y la `0039`; `inventory` (`lockLines`, `reserveStock`, `deliverStock`, `applyDelivery`) y la `0037`; `orders/line-total.ts` y `createOrder`; `stock-writes`.
- **Las decisiones**: el [ADR 0021](0021-la-venta.md), puntos 4, 5, 7 (con su precisión del 2026-10-13), 9, 10 y 12; el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 3 y 4; el [ADR 0020](0020-el-pedido.md), puntos 3, 4 y 6; el [brief-19.2](brief-19.2-el-pedido.md), D-5 (el precio esperado); el [brief-19.3](brief-19.3-reserva-y-ciclo.md), D-12 (la guarda); el [brief-17.2](brief-17.2-campos-de-productos.md), D-4 (el código de barras); el [brief-20.2](brief-20.2-la-venta-de-un-pedido.md), como molde.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Dónde viven las reglas de línea compartidas.**
- (a) **Un módulo puro nuevo, `src/shared/lines/`. Recomendada.** Contiene `computeLineTotal` y la suma (movidas desde `orders`, con sus tests) y una función que recibe las líneas ya validadas y los productos bloqueados (id, activo, precio) y devuelve las líneas con precio y total, o las faltas por regla (`inactive_product`, `no_price`, `currency_mismatch`, `zero_total`, `amount_too_large`, el precio que cambió y `total_too_large`), en el orden en que hoy las revisa `createOrder`. También la validación de las líneas del formulario (`duplicate_product`, cantidad, ids, límite de líneas). Son reglas de los comprobantes (ADR 0019), no del pedido; `src/shared/` no importa módulos, así que los tipos del producto se escriben ahí con su forma mínima. `createOrder` pasa a llamarla y sus tests de hoy fijan que no cambió nada. `placeOrderFromIngestion` conserva su bucle, porque responde otras reglas con otros códigos (contrato del agente), y solo toma de ahí el total y la suma. **Y la estimación del formulario deja de ser una copia**: `pedidos/estimate.ts` repite hoy la regla del redondeo porque el navegador no puede importar `orders`, y su test fija los mismos casos; con un módulo puro en `src/shared/`, la usa directamente.
- (b) `orders` expone las reglas en su interfaz y `sales` las llama: `sales` ya depende de `orders`. Mueve menos código, pero deja reglas comunes de los comprobantes dentro del pedido, y la Fase 22 (compras) tendría que depender de `orders` para lo mismo.

**D-2. La forma de `sales` en la 20.3.** **Recomendada**: `order_id` y `client_id` nulables, con `CHECK (order_id IS NULL OR client_id IS NOT NULL)` (H-5). Sin columna de «tipo»: que haya pedido o no ya lo dice `order_id`. El índice único `(organization_id, order_id)` sigue (los nulos no chocan) hasta que la 20.4 lo cambie por el parcial. La base no comprueba que la venta sin pedido haya descontado: lo hace el servicio en la misma transacción, y un test lo fija. Un trigger que lo exigiera leería `inventory_movements` desde `sales`, que no tiene clave hacia la venta (ADR 0021, punto 5).

**D-3. La salida de stock en `inventory`.** **Recomendada**:
- `sellStock` devuelve `{ ok: true }` o `{ ok: false, shortages }` con lo pedido y lo disponible de cada línea que no alcanza, como `reserveStock`. `sales` **lanza** un rechazo interno con las faltas, para revertir la fila en 0 que pudo crear `lockBalance` (convención de la 19.3), y lo traduce a `insufficient_stock` fuera de la transacción;
- `applySale` en el repositorio, con el tipo `sale` fijo: el movimiento y el saldo nuevo en la misma función, sin tocar `quantity_reserved`. Saldo físico menos lo vendido nunca queda por debajo de lo reservado, porque se comprobó lo disponible con el saldo bloqueado; el `CHECK` es la última defensa;
- `stock-writes`: `applySale` autorizada con `insert inventory_movements` y `update inventories`; `applySale` solo desde `sellStock`; `sellStock` fuera de `inventory` solo desde `src/modules/sales/service.ts`.

**D-4. El precio que cambió mientras se cargaba.** **Recomendada**: sí, `CONFLICT` como el alta del pedido (brief-19.2, D-5). Cada línea lleva el id del precio que mostró el formulario; si el vigente es otro, no se emite nada y la línea muestra el precio nuevo para confirmar. Una venta cobra lo que dice el comprobante: emitir con un precio distinto del que vio quien vende sería peor que en un pedido, que todavía no se cobró.

**D-5. Buscar el producto por su código de barras.**
- (a) **Las sugerencias de productos encuentran también por código de barras exacto, sin distinguir mayúsculas. Recomendada.** Un lector USB escribe el código como teclado, así que no hace falta ninguna dependencia: el código escaneado aparece como sugerencia y se elige. Sirve al formulario de la venta y, por compartir el buscador, al del pedido. Es lo que el brief-17.2 reservó para las ventas (FR-PROD-15) y cambia, con una precisión fechada, lo que dijo su D-4 (H-8). Toca una consulta de `catalog` y un test.
- (b) Dejarlo para una subfase posterior, cuando un negocio real use un lector. El formulario busca por nombre y SKU, como el del pedido.

**D-6. El formulario de la venta.** **Recomendada**:
- `/ventas/nueva`, con el formulario del alta del pedido como molde: el cliente es opcional (vacío es «Consumidor final»); las líneas con buscador, precio vigente y subtotal estimado; el total estimado al pie. Reutiliza `Picker`, `estimate.ts` y los dos buscadores de `pedidos/`, importados como ya hace `clientes/`: **una sola acción nueva**, `createSaleAction` (`issueSaleAction` ya es la de la venta de un pedido);
- **no muestra lo disponible antes de emitir**: lo dice el rechazo `insufficient_stock`, con lo disponible de cada línea. Mostrarlo en el buscador sumaría una lectura por sugerencia y el número podría quedar viejo al emitir;
- al emitir, lleva al detalle de la venta con «Venta emitida», como la 20.2; un rechazo conserva lo cargado.

**D-7. Cómo se muestra una venta sin cliente o sin pedido.** **Recomendada**: «Consumidor final» donde iría el cliente, en la lista, el detalle y el comprobante; sin la línea del pedido cuando no lo hay. El filtro por cliente no cambia: una venta sin cliente no aparece al filtrar por uno. La lista no suma un filtro «con o sin pedido»: no lo pidió nadie.

**D-8. Qué guarda la auditoría.** **Recomendada**: el mismo `diff` de la 20.2, con `order_id` y `client_id` nulos cuando no los hay. El motivo del movimiento es `Venta V-000123`, sin nombre del cliente. El historial del movimiento lo da `inventory_movements` (autor y fecha), sin una auditoría aparte, como la entrega del pedido.

**D-9. Las respuestas de `issueSale`.** **Recomendadas**, como el alta del pedido:
- `FORBIDDEN` a un `viewer`;
- `VALIDATION_ERROR` con el motivo (`client`, `no_lines`, `too_many_lines`, `lines`, con la posición y el campo);
- `NOT_FOUND` del cliente o de los productos, con las posiciones;
- `BUSINESS_RULE_VIOLATION` con `inactive_client`, `line_rules` (con la posición, el producto y la regla de cada línea), `total_too_large` o `insufficient_stock` (con lo pedido y lo disponible de cada línea);
- `CONFLICT` con los precios nuevos (D-4).

Ningún rechazo escribe, numera, mueve stock ni audita. El orden: primero la validación, después el cliente, los productos y sus reglas, el precio esperado y al final el stock, para no bloquear saldos de una venta que igual se rechazaría.

**D-10. Lo que queda en producción.** **Recomendado**: una venta sin pedido es para siempre y hasta la 20.4 no se anula. El stock que descontó se repone, si hiciera falta, con un ajuste manual, que deja su movimiento.

**D-11. La revisión independiente.** **Recomendada**: un agente de solo lectura, contra este brief, el ADR 0021 y las reglas vigentes, antes del commit. Es la primera escritura de stock desde `sales` y cambia código compartido con el pedido.

**D-12. El despliegue a producción y el recorrido.** **Recomendado**: sí, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar. Lleva la migración `0040` y se autoriza aparte, en su turno. Volver a `ceb5692` sigue siendo seguro: el código anterior no escribe ventas sin pedido. Pero una venta sin cliente o sin pedido emitida en producción **sí la lee** ese código, que asumía las dos columnas no nulas. Si hubiera que volver atrás después del recorrido, la lista y el detalle de esas ventas podrían fallar, y se resuelve volviendo a desplegar la 20.3. Para el recorrido, en Demostración Vixora con productos de Tecnex:
- una venta sin cliente de un producto con stock: el saldo baja y el historial del producto muestra «Venta V-00000X»;
- una venta con cliente;
- un intento con más de lo disponible, que se rechaza sin mover nada.

## Invariantes

- Una venta y sus líneas nunca cambian ni se borran; la base lo impide para cualquier rol.
- Toda venta de pedido tiene cliente; una venta sin pedido puede no tenerlo.
- Una venta sin pedido descuenta exactamente sus cantidades, con un movimiento `sale` por línea, en la misma transacción; nunca deja lo disponible negativo ni toca lo reservado.
- Ninguna venta rechazada escribe, numera, mueve stock ni audita.
- La serie `V` sigue sin huecos ni repetidos, compartida por las ventas con y sin pedido.
- El ajuste manual no escribe movimientos `sale`; solo `sellStock` los escribe, y solo `sales` la llama.
- Las reglas de línea son las mismas para el pedido de la app y la venta; el pedido del agente responde como hoy.
- `orders` no depende de `sales`; ningún módulo depende de `sales`; `inventory` no conoce las ventas.
- `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0040` suma `sale` a `inventory_movement_type`, vuelve nulables `order_id` y `client_id` y agrega el `CHECK`. Con el rol dueño: una venta de pedido sin cliente viola el `CHECK`; una venta sin pedido y sin cliente se inserta; las claves compuestas siguen rechazando otra organización; el trigger de solo inserción sigue. Lo prueba `sales-schema.test.ts`.
- **AC-2 (reglas compartidas)**: `src/shared/lines/` tiene sus tests unitarios (los de `line-total` movidos y los de la evaluación de líneas); los tests de `orders` (`orders.test.ts`, `orders-cycle.test.ts` y `orders-agent.test.ts`) pasan sin cambios en sus aserciones; `sales` usa las mismas funciones.
- **AC-3 (emisión)**: `issueSale` emite con y sin cliente: cabecera, líneas con el precio vigente y los totales redondeados, un movimiento `sale` por línea con `balance_after` y el motivo `Venta V-…`, lo reservado igual, la auditoría de D-8. Rechaza cada caso de D-9, sin escribir, numerar, mover stock ni auditar, y `insufficient_stock` informa lo disponible de cada línea que no alcanza. Una venta que pide justo lo disponible con unidades reservadas se emite, y una que pide una unidad más se rechaza.
- **AC-4 (concurrencia)**: con el saldo retenido desde una tercera conexión, dos ventas que juntas piden más que lo disponible terminan en una emitida y un `insufficient_stock`, con el saldo y los movimientos cuadrando; una venta y la confirmación de un pedido sobre el mismo producto se serializan sin quedar lo reservado por encima del saldo; una venta con el cliente retenido no retiene el contador (R-7 de la 20.2). Cada escenario lleva su mutación.
- **AC-5 (`inventory`)**: `sellStock` descuenta todo o nada; el ajuste manual rechaza `sale`; `getAvailableStock`, el estado de stock y la lectura v2 reflejan la venta sin cambiar su cálculo.
- **AC-6 (lecturas)**: la lista, el detalle y el comprobante muestran una venta sin cliente como «Consumidor final» y una sin pedido sin el pedido; el filtro por cliente las excluye; un `viewer` ve igual que en la 20.2.
- **AC-7 (pantallas)**: un end-to-end sobre `next start`: `admin` emite una venta sin cliente desde `/ventas/nueva` con teclado, la ve en el detalle, la imprime y la encuentra en la lista; el historial del producto muestra «Venta» y su filtro; un intento con más de lo disponible muestra el rechazo con lo disponible y conserva lo cargado; un `viewer` no ve «Nueva venta» ni entra a la ruta. axe sin violaciones en claro y en oscuro.
- **AC-8 (datos de un cliente)**: la exportación incluye una venta sin pedido del cliente y sus líneas (H-9); el informe la cuenta y el cliente no es borrable; una venta sin cliente no aparece en ningún cliente.
- **AC-9 (guardas)**: `stock-writes` pasa con el código y falla con cada uno de sus casos nuevos; `exposed-surface` declara `createSaleAction`; `module-boundary` cubre `sales` → `inventory`.
- **AC-10 (fronteras)**: `inventory` no importa `sales`; `orders` no importa `sales`; `src/shared/lines/` no importa módulos; `ingestion` no está en el diff.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 9 queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-12): producción corre el SHA del cierre con la `0040`; en Demostración Vixora, el recorrido de D-12, conciliado contra la base: las ventas, sus líneas, un movimiento `sale` por línea con el saldo que cuadra, lo reservado sin cambios y la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-6 y AC-8 a AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-7 (UI ↔ servicio ↔ base) y AC-11 (los contratos que consume el agente, que no cambian).
- `isolated-runtime`: AC-14, si se despliega.
- Las mutaciones de AC-4 y de `stock-writes`, cada una corrida y revertida, con su resultado en §Resultados.
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada, en especial `crm`, `numbering`, `audit`, `ingestion`, `src/shared/money/` o `src/shared/quantity/`;
- compartir las reglas cambiaría una respuesta del alta del pedido o del pedido del agente;
- el diseño exigiría cambiar el texto de los ADR 0019, 0020 o 0021, o adelantar algo de la 20.4;
- `inventory` tendría que conocer las ventas, `orders` leer `sales`, o un módulo existente depender de `sales`;
- una venta pudiera llevarse unidades reservadas, cambiar lo reservado o mover el saldo sin su movimiento;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- aparece una vía por la que un `viewer` emite una venta, o un dato personal entra al `diff` de la auditoría o al motivo del movimiento;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, y desplegar. Cada una necesita autorización explícita en su turno.

## Resultados — 2026-10-13 (autoevaluación)

Implementado el 2026-10-13. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-11 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

- **El motivo de `sellStock` es una función, no un texto** (desvío de la firma de D-3). El motivo `Venta V-000123` lleva el número, y el contador va después de los saldos (ADR 0021, punto 7): con un texto fijo las dos reglas no se podían cumplir a la vez. `sellStock` bloquea los saldos, comprueba lo disponible y, solo si alcanza, llama una vez a la función, en la que `sales` toma el número, y después escribe. Lo fija `sales.test.ts`, «una venta con el cliente retenido no retiene el contador», y la mutación que toma el número primero lo rompe.
- **D-5 exigía `catalog/service.ts`**, que la lista no autorizaba: `findActiveProductsRanked` la comparte la búsqueda del agente (`read-v1` y `read-v2`), así que el código de barras entra por una opción que solo pasa `suggestProducts`. Se detuvo, y **el usuario autorizó el archivo el 2026-10-13**. El test de la 17.2 que fijaba lo contrario se actualizó con una precisión fechada, como FR-PROD-15. El buscador del pedido también encuentra por código de barras, pero su texto sigue diciendo «Nombre o SKU»: `order-form.tsx` no está autorizado.
- **H-3 no era exacto**: ningún test fijaba los valores del enum. Tres tests usaban `sale` (o `venta`) como ejemplo de tipo **desconocido** y dejaban de pasar: `movimientos/filters.test.ts`, `inventory/service.test.ts` e `inventory-history.test.ts`. Este último no estaba autorizado: lo encontró la revisión (R-1) y **el usuario lo autorizó**. Los tres usan ahora otro valor, y los dos primeros suman el caso de `sale`.
- **`ventas/actions.ts` repite la lectura del formulario** de `pedidos/actions.ts`: un archivo `"use server"` solo exporta acciones, y `pedidos/actions.ts` no estaba autorizado (R-9).
- **Un cliente escrito que no se reconoce** se envía como un id inválido, para que `sales` lo rechace como cliente y no lo tome como «Consumidor final».
- **`RepositoryStructure.md` y el comentario de `pedidos/estimate.test.ts`** quedaban fuera de la lista; **el usuario los autorizó** (R-6).

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `sales-schema.test.ts`: columnas nulables, el `CHECK sales_order_has_client` (`23514`), dos ventas sin pedido que no chocan en el índice, la clave compuesta del cliente sin pedido, y el trigger; `catalog-inventory-schema.test.ts` acepta `sale` |
| AC-2 | cumplido | `src/shared/lines/` con sus unitarios (los de `line-total`, movidos, y los de `rules.test.ts`); `orders.test.ts`, `orders-cycle.test.ts` y `orders-agent.test.ts` pasan sin cambiar una aserción; `estimate.test.ts`, sin cambiar sus casos |
| AC-3 | cumplido | `sales.test.ts`: la venta con y sin cliente (cabecera, líneas, totales redondeados, un movimiento `sale` por línea con `balance_after` y el motivo, lo reservado igual, el `diff` exacto), la misma serie que la venta de un pedido, cada rechazo de D-9 sin escribir ni numerar (también `too_many_lines`, `currency_mismatch` y `total_too_large`, R-5), lo disponible con unidades reservadas y la fila en 0 revertida |
| AC-4 | cumplido | `sales.test.ts`: dos ventas con el saldo retenido desde una tercera conexión, una venta y una confirmación serializadas, y la venta con el cliente retenido que no retiene el contador; con sus mutaciones (abajo) |
| AC-5 | cumplido en parte | `sellStock` todo o nada y el ajuste que rechaza `sale` (`service.test.ts` y `orders-cycle.test.ts`); `getAvailableStock` después de una venta. **No hay test del estado de stock ni de `read-v2` después de un movimiento `sale`** (R-5): esas lecturas no se tocaron |
| AC-6 | cumplido | `sales.test.ts`: lista, filtro por cliente y detalle, para `admin` y `viewer` |
| AC-7 | cumplido | `sales.spec.ts`, tres casos sobre `next start`: la venta sin cliente con teclado, el comprobante impreso, la lista y el historial con `?tipo=venta`; el rechazo por stock con lo disponible y lo cargado conservado; el `viewer` sin «Nueva venta» ni la ruta. axe en claro y en oscuro |
| AC-8 | cumplido | `client-data.test.ts`, casos 38 a 40, y el runbook |
| AC-9 | cumplido | `stock-writes` con ocho casos de fallo nuevos y sus mutaciones; `exposed-surface` con `createSaleAction`; `module-boundary` con tres casos |
| AC-10 | cumplido | `inventory` y `orders` no importan `sales`; `src/shared/lines` solo importa `zod`, `money` y `quantity`; `ingestion` no está en el diff |
| AC-11 | cumplido | `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios; `read-api.test.ts`, caso 6b, sigue fijando que el agente no busca por código de barras |
| AC-12 | cumplido | la batería, abajo, y la CI de `315f990` (§Cierre) |
| AC-13 | cumplido | DataModel, Overview, RepositoryStructure, FunctionalRequirements (FR-VEN-07 y 08, FR-PROD-15), Screens (5, 17, 18 y la 19 nueva), TraceabilityMatrix, SecurityModel (93 puntos de entrada), EngineeringStandards y el runbook |
| AC-14 | cumplido | el despliegue de `315f990` y el recorrido del usuario, conciliado contra la base (§Cierre) |

**Mutaciones**, cada una agregada al código real, corrida y revertida:
- lo disponible sin restar lo reservado en `sellStock`: falla «vende justo lo disponible…»;
- `sellStock` sin comprobar el stock: fallan ese caso y el de las dos ventas con el saldo retenido;
- el número tomado antes del cliente en `issueSale`: falla la venta con el cliente retenido (y la numeración de otros tres casos);
- `stock-writes`: `sellStock` llamada desde `orders/service.ts` (1 caso), `applySale` desde una función nueva del servicio de `inventory` (1) y un `delete` de movimientos en `applySale` (2);
- D-5: `suggestProducts` sin la opción `barcode`: fallan los dos casos de `catalog.test.ts`.

**Batería local** (2026-10-13, Git Bash, con los archivos nuevos en el índice por `git add -N`):
- formato, lint, typecheck y build en verde; 720 unitarios y 594 guardas;
- integración, 1058 de 1060: el proceso que corría `db-connectivity.test.ts` se cerró de golpe en Windows (código 0xC0000409) y no dio resultado; corrido solo, 5 de 5. En la corrida anterior, la misma batería dio 1029 de 1060 con otra caída de un proceso, sin detalle;
- end-to-end completo, 170 de 170 en 13,8 minutos. La corrida anterior dio solo 27 aprobados y la salida filtrada no conservó los fallos; `users.spec.ts` y `security-headers.spec.ts`, que figuraban sin resultado, pasaron 18 de 18 al repetirlos.

Las intermitencias se declaran, no se explican.

## Revisión independiente — 2026-10-13

Un agente que no participó del trabajo, de solo lectura, contra este brief, el ADR 0021 y las reglas vigentes. Informó 9 hallazgos: uno alto y ocho bajos. Cada uno se verificó contra el código antes de aceptarlo.

- **R-1 (alto)**: `inventory-history.test.ts` usaba `sale` como tipo desconocido y dejaba de pasar; fuera de la lista. **Corregido con la autorización del usuario.** La batería también lo había mostrado.
- **R-2**: SecurityModel decía 92 puntos de entrada; 28 + 49 + 16 = 93. Corregido.
- **R-3**: EngineeringStandards decía 32 archivos virtuales en la cabeza y 35 en el paréntesis. Corregido a 35.
- **R-4**: `stock-writes` fija el archivo que llama a `sellStock`, no la función: no vería una llamada desde `adjustStock` ni desde `issueSaleFromOrder`, y no mira el tipo que recibe `applyStockChange`. Declarado en el comentario de la guarda; no se cambió la regla, que es la de D-3.
- **R-5**: rechazos de D-9 sin test por `issueSale`, y AC-5 sin el estado de stock ni `read-v2`. Se sumaron los tres rechazos; lo de AC-5 queda declarado como cobertura parcial.
- **R-6**: DataModel (moneda y total de una venta sin pedido), Overview (el motivo como función), RepositoryStructure y `estimate.test.ts`. Corregidos, los dos últimos con la autorización del usuario.
- **R-7**: el desvío de la firma de D-3. La revisión lo verificó correcto contra el orden del ADR 0021, punto 7; queda registrado arriba.
- **R-8**: el caso de `src/shared/lines` en `module-boundary`, fuera de la letra de la lista («solo lo de `sales`»), lo pide AC-10. Y `.claude/settings.json` no entra en el commit.
- **R-9**: la duplicación de `ventas/actions.ts`, verificada y justificada. Queda como deuda: un helper sin `"use server"` compartido por las dos rutas.

La revisión confirmó además que D-5 estaba bien detenido, que `createOrder` y `placeOrderFromIngestion` responden como antes según sus tests, que ningún rechazo escribe y que ninguna lectura falla con `order_id` o `client_id` nulos.

## Cierre de la subfase 20.3, 2026-10-13

Cierra el 2026-10-13 con la aprobación del usuario, después de su recorrido en producción («Listo, funciona perfecto»).

- **AC-1 a AC-14 cumplidos**, con AC-5 en parte: no hay test del estado de stock ni de `read-v2` después de un movimiento `sale` (R-5).
- **Commit, CI y despliegue**: `315f990`, CI 38427868045 `success` leída por el SHA completo. Desplegado en producción el 2026-10-13 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `ceb5692` anotado como la versión para volver atrás. La migración `0040` quedó aplicada (41 en `drizzle.__drizzle_migrations`): `sale` en `inventory_movement_type`, `order_id` y `client_id` nulables en `sales` y `sales_order_has_client` presente. El servicio `active` y `/api/health` en `200`.
- **El recorrido del usuario (AC-14)**, en «Demostración Vixora» con los productos de Tecnex: una venta sin cliente, una con cliente y un intento por más de lo disponible. **Conciliado contra la base**, en una transacción de solo lectura y sin datos de la persona:
  - `V-000002`, sin pedido y sin cliente, con dos líneas, y `V-000003`, sin pedido y con cliente, con una; en las dos, la suma de las líneas es igual al total (960.000,00 y 450.000,00 ARS);
  - un movimiento `sale` por línea, con el motivo `Venta V-00000X` y la cantidad de la línea; en cada uno, el saldo anterior menos la cantidad da el `balance_after` (2→1, 6→5 y 1→0);
  - el stock de cada producto vendido igual a su último `balance_after`, nada reservado, y el stock de la demo de 70 a 67;
  - una auditoría `create` de `sale` por venta;
  - el rechazo no escribió: 3 movimientos `sale` en total, ninguna `V-000004`, y el contador de `sale` en 3, igual al último número.
- **Revisión**: la independiente (R-1 a R-9, arriba). La batería, el despliegue, la conciliación y este cierre son autoevaluación declarada.
- **Decisiones del usuario**:
  - el brief, con las recomendaciones de D-1 a D-12;
  - los cuatro archivos fuera de la lista: `catalog/service.ts` (D-5), `inventory-history.test.ts` (R-1), `RepositoryStructure.md` y `estimate.test.ts` (R-6);
  - el commit y el push, el despliegue después de la CI, la tarea en «En proceso» y este cierre.
- **Nivel**:
  - validado localmente y en CI;
  - **validado en integración** para las pantallas (end-to-end sobre `next start`);
  - desplegado en producción y recorrido por el usuario en la organización de demostración.

  No es «preparado para producción».
- **No certifica**:
  - la anulación ni la reposición del stock: son la 20.4;
  - el estado de stock ni la lectura `read-v2` después de una venta, que no se tocaron (AC-5 en parte);
  - que `stock-writes` vea una llamada a `sellStock` desde otra función del mismo archivo (R-4);
  - que el comprobante interno entregado a un consumidor final quede fuera de la Ley 27.743: sigue pendiente para la 13.5.2-b;
  - en producción, los rechazos de D-9 distintos del de stock: los cubren los tests;
  - que volver a `ceb5692` sea limpio: esa versión no lee bien una venta sin pedido o sin cliente, y producción ya tiene dos.
- **Deuda anotada**: R-9, la lectura del formulario duplicada en `ventas/actions.ts` y `pedidos/actions.ts`; el texto «Nombre o SKU» del buscador del pedido, que también encuentra por código de barras desde D-5.
