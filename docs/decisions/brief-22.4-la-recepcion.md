---
schema: task-brief.v1
task_id: "22.4"
task_type: implementation
generated_at: 2026-10-16
---

# Brief 22.4 — La recepción

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, los triggers, el servicio, la entrada de stock, el costo, la serialización, las guardas y la frontera del módulo, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-16).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-16, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: cuarta subfase de la Fase 22 — Compras y proveedores ([Roadmap](../planning/Roadmap.md) §Fase 22), después de la 22.3, cerrada el 2026-10-16. Implementa la fila «22.4» del punto 15 del [ADR 0023](0023-compras-y-proveedores.md), más lo que la nota fechada de ese punto le pasó desde la 22.3 (D-3 de la 22.3): el cierre a mano de la orden y la comprobación de recepciones al cancelarla.
- **No abre ni cierra gate.** Es la primera escritura de `purchasing` en el stock y en el costo, por funciones nuevas de `inventory` y de `catalog`, y suma la dependencia de `purchasing` hacia `inventory`. Se recomienda la revisión independiente (D-15).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-16, con las recomendaciones de D-1 a D-16. La tarea 22.4 es `3fa702be6f4e8178bc3dda9d92f221e9` en Notion.

## Objetivo

Que un `admin` pueda **registrar la mercadería que llega de un proveedor** con una recepción:

- contra una orden de compra abierta de ese proveedor, recibiendo todo o una parte de lo que falta, o sin orden;
- con el costo unitario que cobró el proveedor y, si quiere, el número de su remito o factura;
- que **sume el stock** de cada producto y **fije su costo** con el último recibido;
- verla e imprimirla, ver la lista de recepciones y las de cada proveedor.

Además, **la orden de compra** se cierra sola cuando una recepción completa todas sus líneas, se puede **cerrar a mano** con faltante si ya recibió algo, y **no se cancela** si tiene recepciones. Un `viewer` ve el stock que entra y el movimiento en el historial del producto, sin costo ni proveedor. El agente lee el stock nuevo sin ningún cambio de contrato.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-16, sobre `main` (`f17b584`, el cierre de la 22.3). El ADR 0023 se releyó entero en la fuente. DataModel, FunctionalRequirements y el Overview se buscaron con `grep` (`goods_receipt`, `22.4`, `recepción`, `purchasing`, `FR-PROD-19`). Las guardas `stock-writes` y `cost-writes`, `inventory/service.ts`, `catalog/service.ts` y `catalog/repository.ts` se leyeron en la fuente.

**Ya está fijado** por el ADR 0023, puntos 2, 3, 4, 5, 10 a 15:

- **la recepción es un comprobante emitido, de solo inserción**, sin estados: `crm_app` con `SELECT` e `INSERT` y un trigger que rechaza `UPDATE` y `DELETE`;
- **registra qué entró, de qué proveedor y a qué costo**: el producto, la cantidad y el costo unitario con el IVA incluido, y el total por línea redondeado a los decimales de la moneda; el total es la suma de las líneas;
- **va contra una orden `open` de ese proveedor, o sin orden**:
  - **con orden**: cada línea es de una línea de la orden; **nunca se recibe más de lo que falta** de esa línea; el costo empieza en el esperado y la persona lo corrige; la moneda es la de la orden; si la orden queda completa, pasa a `closed` en la misma transacción;
  - **sin orden**: la persona elige el proveedor y la moneda;
- **las reglas de línea**: un producto en una sola línea; el producto existe y está activo; cantidad positiva en `numeric(14, 3)`; costo positivo; el total de la línea no es cero ni desborda (`zero_total`, `amount_too_large`);
- **un proveedor desactivado no recibe recepciones nuevas** (punto 2);
- **suma stock** con un movimiento `goods_receipt` por línea y el motivo «Recepción RC-000123», **sin nombrar al proveedor**. Lo escribe **una función nueva de `inventory`** con la transacción de `purchasing`: bloquea los saldos ordenados por producto, creando la fila en 0 si falta, y suma sin tocar lo reservado; si un saldo no cabe, `stock_limit`; el motivo llega como función. `stock-writes` la fija a ella y a su llamador, y el ajuste manual no acepta el tipo;
- **fija el costo**: si el costo unitario o la moneda difieren del vigente, una fila nueva en `product_costs`, auditada como `cost_change` con el origen en claves planas; si son iguales, nada. Lo escribe **una función nueva de `catalog`**, sin la comparación optimista de la ficha. `cost-writes` pasa a fijar quién llama `insertProductCost` y quién llama la función nueva. **Si la moneda de la recepción no es la del precio**, la pantalla lo advierte por línea antes de emitir;
- **el número del documento del proveedor**: opcional, hasta 40 caracteres entre letras, dígitos, espacios, guiones y barras;
- **la auditoría**: `entity_type` `goods_receipt`, acción `create`;
- **la serialización** (punto 10): la cabecera de la orden `FOR UPDATE`; el proveedor y los productos en modo compartido; la comprobación; los saldos dentro de `inventory`, con el contador al armar el motivo; y después solo filas cuyos padres ya están tomados: los movimientos, la recepción y sus líneas, el costo, el cierre automático y la auditoría. **La cancelación y el cierre a mano** bloquean la cabecera `FOR UPDATE` y comprueban las recepciones vigentes después;
- **el número**: `goods_receipt` en `document_kind` con el prefijo `RC`; `goods_receipt` en `inventory_movement_type` y en el `entity_type`;
- **`purchasing` depende de** `catalog`, `inventory`, `numbering`, `organizations`, `audit` y el esquema de `auth`; **ningún módulo depende de `purchasing`**;
- **solo `admin`** ve y opera las recepciones; un `viewer` ve el stock y el movimiento con su motivo; **el agente** lee el stock por `read-v1` y `read-v2`, sin cambio de contrato y sin aviso;
- **la página imprimible**, con la leyenda «Documento no válido como factura»;
- **la recepción no copia datos del proveedor**: lo nombra por su clave.

**Hallazgos de esta verificación**:

- **H-1. La entrada de stock ya tiene molde exacto.** `restoreSaleStock` (20.4) bloquea los saldos ordenados por producto con `lockLines` (que crea la fila en 0), suma con `computeBalanceAfter`, rechaza con los productos si no caben (`stock_limit`), pide el motivo una sola vez después de comprobar y escribe por `applySaleVoid`. La entrada de la recepción es la misma función con otro tipo de movimiento. Decide D-3.
- **H-2. Lo que ordena dos recepciones del mismo producto es el saldo, no el producto.**
  - La recepción toma los productos en **modo compartido**, como el pedido y la venta. Dos recepciones del mismo producto los tienen a la vez, y **las dos pueden leer el mismo costo vigente**.
  - Las ordena el bloqueo del saldo (`FOR UPDATE`, dentro de `lockBalance`): la segunda espera ahí hasta que la primera confirma. Con `READ COMMITTED`, **una lectura del costo hecha después de ese bloqueo** ve el costo que dejó la primera.
  - **Si el costo se leyera antes del saldo**, la segunda compararía contra un costo viejo. Ejemplo: vigente A, la primera recibe a B y la segunda a A. La segunda ve A, no escribe, y queda vigente B, que no es el último recibido.
  - El punto 10 del ADR ya pone el costo después del contador, que va después de los saldos. **Este brief lo fija como invariante, con su test y su mutación** (D-4, AC-5).
  - `setProductCost` de la ficha bloquea el producto `FOR UPDATE`, así que espera a las recepciones en curso y ellas a él, sin ciclo.
- **H-3. La auditoría exige las mismas claves antes y después.** Fuera de `create`, `recordAudit` rechaza un `diff` cuyo `before` y `after` no tengan las mismas claves. El origen del costo (`source` y el número de la recepción) no puede ir solo en `after`. Decide D-6.
- **H-4. FR-PROD-19 dice que «el historial la muestra como origen», y `product_costs` no guarda origen.**
  - El historial de costos de la ficha lee `product_costs`, que tiene el monto, la moneda, el autor y la fecha. Agregar una columna con la recepción haría que `catalog` guardara un dato de `purchasing`, y una clave foránea hacia `goods_receipts` haría depender `catalog` de `purchasing`, que el punto 11 prohíbe.
  - La auditoría del producto sí guarda el origen (H-3), y la historia de la ficha la muestra.
  - Decide D-5.
- **H-5. El historial de movimientos del producto enumera los tipos en la app.** `productos/[productId]/movimientos/` tiene la etiqueta de cada tipo, la clave del filtro y el conjunto de los que suman (`INCOMING`, que la 20.4 olvidó y corrigió su revisión, R-1). Sin tocarlos, el movimiento `goods_receipt` se mostraría sin etiqueta y con el signo de una salida. Esos archivos van en la lista autorizada (D-14).
- **H-6. Doce end-to-end vacían con `TRUNCATE` tablas a las que va a apuntar la recepción.** Buscados **por archivo entero** (la lección de R-1 de la 22.3): `accounts`, `order-receipts`, `orders`, `product-fields`, `product-images`, `products`, `purchase-orders`, `receipts`, `refunds`, `sales`, `security-headers` y `suppliers`. Cada uno suma `goods_receipt_lines, goods_receipts` a su `truncate`. **Van en la lista autorizada desde el principio.** Los tests de integración no vacían esas tablas.
- **H-7. La migración es la `0049`.** Suma valores a `document_kind`, `audit_entity_type` e `inventory_movement_type`. El migrador aplica todo en una transacción, y **un valor nuevo de un enum no se usa en ella** (H-2 de la 21.4): ningún `CHECK` ni trigger de la `0049` los usa. También agrega a `purchase_order_lines` el `UNIQUE (organization_id, id)` que la 22.3 dejó para esta subfase (su D-1), y los únicos que necesiten las claves de D-1.
- **H-8. Lo de la orden que la 22.3 dejó para acá:**
  - el trigger de estados ya admite `open → closed` con `closed_at`: la 22.4 no lo cambia;
  - `cancelPurchaseOrder` no comprueba recepciones (D-3 de la 22.3);
  - la historia de la orden rotula todo `status_change` como «Cancelación» (R-6 de la 22.3).
- **H-9. `purchasing` suma `inventory`.** `module-boundary` solo prohíbe entrar por fuera del `index.ts`, así que `eslint.config.mjs` no cambia. La fila del Overview sí.
- **H-10. Tres tests fijan listas que crecen**: `identity-schema.test.ts` (las tablas), `audit.test.ts` (las de solo inserción) y `numbering.test.ts` (los prefijos). Van en la lista autorizada. Las listas de enums de los tests de esquema usan `toContain`, y no cambian.
- **H-11. `lockProductsForOrder` ya devuelve el precio vigente.** La recepción lo usa para bloquear y para saber si la moneda del costo difiere de la del precio, sin una función nueva de lectura en `catalog`.

## Alcance incluido

1. **Esquema** (migración `0049`, generada con `drizzle-kit generate` y completada a mano):
   - `goods_receipt` en `document_kind`, `audit_entity_type` e `inventory_movement_type` (aditivos);
   - **`goods_receipts`** y **`goods_receipt_lines`** (D-1), con sus privilegios y sus triggers (D-2);
   - los únicos nuevos sobre `purchase_orders` y `purchase_order_lines` que piden las claves de D-1.
2. **`numbering`**: el tipo `goods_receipt` y el prefijo `RC`.
3. **`inventory`**: la entrada de stock de la recepción (D-3).
4. **`catalog`**: la escritura del costo recibido (D-4).
5. **`purchasing`**:
   - el esquema y el repositorio de la recepción y sus líneas, y lo recibido de cada línea de una orden;
   - registrar una recepción con orden y sin orden (D-7, D-8);
   - el cierre automático, el cierre a mano y la comprobación al cancelar (D-9);
   - listar, ver una recepción y su historia, y las recepciones de un proveedor (D-11, D-12).
6. **Pantallas** (D-11): la pestaña «Recepciones» de Compras, la lista, el alta, el detalle imprimible; en la orden, lo recibido, lo que falta, sus recepciones y el cierre a mano; en la ficha del proveedor, sus recepciones; en el producto, el movimiento nuevo (D-14) y el origen del costo en su historia (D-5).
7. **Guardas**:
   - `stock-writes`: la escritura nueva y sus llamadores;
   - `cost-writes`: los llamadores de `insertProductCost` y de la función nueva;
   - `exposed-surface`: las acciones nuevas;
   - `organization-isolation`: las escrituras y las lecturas por id de la recepción.
8. **Documentación**:
   - DataModel: las dos tablas, las reglas 8 y 10, `document_counters`, `audit_logs`, `inventory_movements`, la implementación de las enmiendas de `product_costs` e `inventories`, y la nota de §«Explícitamente fuera»;
   - Overview: la fila de `purchasing`, con `inventory`;
   - FunctionalRequirements: `FR-COMP-10` en adelante, y la precisión de FR-PROD-19 si D-5 se aprueba como está;
   - Screens, TraceabilityMatrix y SecurityModel, con sus recuentos.

## Alcance excluido

- **La anulación de la recepción** y su salida de stock (22.5); los pagos y la cuenta del proveedor (22.6).
- **Recibir más de lo que falta en una línea de la orden**, o un producto que la orden no tiene, dentro de la recepción con orden: va en otra recepción sin orden (punto 4).
- **Editar una recepción**: es de solo inserción. Si está mal, se anula en la 22.5.
- **Reabrir una orden cerrada o cancelada** (punto 6).
- **El costo promedio**, la valuación del inventario y preguntar por línea si se actualiza el costo (puntos 1 y 5).
- **Las recepciones de un producto en su ficha** (punto 11): el historial de movimientos ya muestra cada una con su número. Si el uso lo pide, lo suma una subfase posterior.
- **Proponer el costo** en la recepción sin orden: la persona lo escribe, como en la orden (D-6 de la 22.3).
- **Que un `viewer` o el agente vean algo de compras**: `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0049_*.sql` y `drizzle/meta/*`
- `src/modules/purchasing/`, con sus tests unitarios
- `src/modules/inventory/`: `schema.ts` (**solo** el tipo nuevo), `repository.ts` y `service.ts` (**solo** la escritura y la función de D-3, y el comentario del ajuste manual), `index.ts` (**solo** la exportación) y `service.test.ts` (**solo** que el ajuste no acepta el tipo y que el filtro del historial sí)
- `src/modules/catalog/`: `service.ts` e `index.ts`, **solo** la función de D-4 y su exportación
- `src/modules/numbering/schema.ts` y `service.ts`, **solo** `goods_receipt` y su prefijo
- `src/modules/audit/schema.ts`, **solo** `goods_receipt`
- `src/app/(autenticado)/compras/` (lo existente y lo nuevo)
- `src/app/(autenticado)/productos/[productId]/movimientos/` (`page.tsx`, `filters.ts` y su test), **solo** el tipo nuevo (D-14)
- `src/app/(autenticado)/productos/[productId]/audit-summary.ts` y su test, **solo** el origen del costo (D-5)
- `tests/integration/`:
  - `goods-receipts.test.ts` y `goods-receipts-schema.test.ts` (nuevos);
  - `purchase-orders.test.ts`, **solo** el cierre a mano y la cancelación con recepciones;
  - `purchase-orders-schema.test.ts`, **solo** los únicos nuevos de H-7;
  - `identity-schema.test.ts`, `audit.test.ts` y `numbering.test.ts`, **solo** las tablas, el valor y el prefijo nuevos (H-10);
  - `catalog-inventory-schema.test.ts`, **solo** el tipo de movimiento nuevo;
  - `organization-isolation.test.ts`, **solo** lo de la recepción
- `tests/guards/`: `stock-writes.test.ts`, `cost-writes.test.ts` y `exposed-surface.test.ts`, **solo** lo de esta subfase
- `tests/e2e/goods-receipts.spec.ts` (nuevo); `tests/e2e/purchase-orders.spec.ts`, **solo** el cierre a mano y la cancelación rechazada; y los doce specs de H-6, **solo** las dos tablas en su `truncate`
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `cash`, `sales`, `orders`, `crm`, `knowledge`, `conversations` e `ingestion`;
- de `catalog`, `repository.ts` (`insertProductCost` sigue siendo la única escritura), `setProductCost` y `lockProductsForOrder`;
- `src/shared/`, `eslint.config.mjs` y `module-boundary` (H-9);
- `scripts/`, los seeds, los ADR y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - la `0048` (`purchase_orders`, `purchase_order_lines`, `purchase_orders_guard`), la `0041` (`sale_voids` y `sale_void`) y la `0035` (`product_costs`);
  - `inventory/service.ts` (`restoreSaleStock`, `lockLines`, `computeBalanceAfter`) y su repositorio;
  - `catalog/service.ts` (`setProductCost`, `lockProductsForOrder`) y `insertProductCost`;
  - `purchasing` de la 22.3 (`purchase-orders.ts`, `lines.ts`, la página de la orden);
  - `audit/service.ts` (la validación del `diff`);
  - las guardas `stock-writes` y `cost-writes`.
- **Las decisiones**:
  - el [ADR 0023](0023-compras-y-proveedores.md), puntos 2 a 5, 10 a 15, con su nota fechada del punto 15;
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 a 5;
  - el [ADR 0021](0021-la-venta.md), punto 7, con su precisión del 2026-10-13;
  - el [ADR 0008](0008-stock-nunca-negativo.md) y el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md);
  - el [brief-20.4](brief-20.4-la-anulacion.md) (la reposición) y el [brief-22.3](brief-22.3-la-orden-de-compra.md).
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Las tablas.** **Recomendadas**:

- **`goods_receipts`**:
  - **columnas**: `id`, `organization_id`, `number`, `supplier_id`, `purchase_order_id` (nulo sin orden), `currency`, `total`, `supplier_reference` (nulo si no se carga, D-13), `created_by` y `created_at` (con `clock_timestamp()`). La fecha de emisión es `created_at`;
  - `UNIQUE (organization_id, number)` y `UNIQUE (organization_id, id)`, el destino de las líneas y de la anulación de la 22.5;
  - **claves foráneas**, todas `ON DELETE RESTRICT`: el proveedor por `(organization_id, supplier_id)`; el autor; la organización; y **la orden por `(organization_id, purchase_order_id, supplier_id, currency)`** hacia un `UNIQUE (organization_id, id, supplier_id, currency)` nuevo de `purchase_orders`. Así **la base exige** que una recepción con orden sea del proveedor y de la moneda de su orden. Sin orden, la clave no se mira (`MATCH SIMPLE`);
  - **los `CHECK`**: número y total positivos; la moneda con `^[A-Z]{3}$`; la referencia con su forma (D-13);
  - **los índices**: la lista, `(organization_id, created_at desc, id desc)`; las de un proveedor, `(organization_id, supplier_id, created_at desc)`; y las de una orden, `(organization_id, purchase_order_id)` donde no es nula.
- **`goods_receipt_lines`**:
  - **columnas**: `id`, `organization_id`, `goods_receipt_id`, `purchase_order_line_id` (nulo sin orden), `product_id`, `position`, `quantity` (`numeric(14, 3)`), `unit_cost` y `line_total` (`numeric(14, 2)`), sin moneda por línea, como la orden;
  - `UNIQUE (goods_receipt_id, product_id)` y `UNIQUE (goods_receipt_id, position)`; la posición entre 1 y 50; cantidad, costo y total positivos;
  - **claves foráneas** compuestas hacia la recepción y el producto, y **la línea de la orden por `(organization_id, purchase_order_line_id, product_id)`** hacia un `UNIQUE (organization_id, id, product_id)` nuevo de `purchase_order_lines`: **la base exige** que la línea recibida sea del mismo producto que la pedida;
  - **el índice** de lo recibido: `(organization_id, purchase_order_line_id)` donde no es nula.
- **Que la línea de la orden sea de la orden de la cabecera** lo asegura el servicio, con su test: exigirlo en la base pediría repetir la orden en cada línea.

*Alternativa*: solo `(organization_id, purchase_order_id)` y `(organization_id, purchase_order_line_id)`, con el proveedor, la moneda y el producto comprobados en el servicio. Es menos esquema y una defensa menos.

**D-2. Los triggers y los privilegios.** **Recomendados**: `goods_receipts_insert_only` y `goods_receipt_lines_insert_only`, que rechazan `UPDATE` y `DELETE` para cualquier rol, con el molde de la `0041`; `crm_app` con `SELECT` e `INSERT` sobre las dos.

**D-3. La entrada de stock (H-1).** **Recomendada**:

- **`receiveStock`** en el servicio de `inventory`, con la firma de `restoreSaleStock` (la transacción, la organización, las líneas, el motivo como función y el autor) y la misma conducta: saldos ordenados con la fila en 0 si falta, `computeBalanceAfter` positivo, `{ ok: false, productIds }` si alguno no cabe (`stock_limit`), el motivo una sola vez después de comprobar, y un movimiento `goods_receipt` por línea sin tocar lo reservado. **No mira si el producto está activo**: eso lo comprueba `purchasing` con los productos bloqueados;
- **`applyGoodsReceipt`** en el repositorio, la escritura nueva: el movimiento y el saldo, como `applySaleVoid`;
- **`stock-writes`**: autoriza `applyGoodsReceipt`, que solo llama `receiveStock`, y `receiveStock`, fuera de `inventory`, solo desde `src/modules/purchasing/`;
- **el ajuste manual** sigue aceptando solo sus dos tipos, con su test.

*Alternativa*: generalizar `restoreSaleStock` y `applySaleVoid` con el tipo como parámetro. Junta dos llamadores de módulos distintos en una función, y la guarda dejaría de distinguirlos.

**D-4. El costo recibido (H-2).** **Recomendado**:

- **`recordReceivedCosts`** en el servicio de `catalog`: recibe la transacción de `purchasing`, la organización, el autor, el número de la recepción y una línea por producto con el costo y la moneda. Por cada una **lee el costo vigente en esa transacción**, y si el monto o la moneda difieren, escribe por `insertProductCost` y audita `cost_change` (D-6). Si son iguales, nada. **No bloquea ni compara con lo que alguien vio**: los productos ya están tomados por `purchasing` (punto 5). Devuelve qué productos cambiaron;
- **se llama después de la entrada de stock**, con los saldos tomados (H-2). Es invariante, con su test y su mutación;
- **`cost-writes`**: `insertProductCost` la llaman solo `setProductCost` y `recordReceivedCosts`, y `recordReceivedCosts`, fuera de `catalog`, solo `src/modules/purchasing/`;
- **no mira si el producto está activo**: lo comprobó `purchasing`.

**D-5. El origen del costo (H-4).** **Recomendado**:

- **`product_costs` no cambia.** El historial de costos de la ficha sigue mostrando el monto, la moneda, la fecha y el autor;
- **la historia del producto** muestra el origen: «Costo: $ 1.000,00 → $ 1.200,00 · por la recepción RC-000123», leído de la auditoría (D-6);
- **FR-PROD-19 se precisa con fecha**: «el historial la muestra como origen» se cumple en la historia del producto, porque guardar el origen en `product_costs` haría que `catalog` conociera las recepciones (H-4).

*Alternativa*: una columna de texto `source_reference` en `product_costs` («RC-000123»), sin clave foránea, como el motivo de un movimiento. Muestra el origen en el historial de costos, y cambia una tabla de solo inserción de `catalog` y su escritura única.

**D-6. La auditoría (H-3).** **Recomendada**:

- **la recepción**, `entity_type` `goods_receipt`, `create`, con claves planas: `number`, `supplier_id`, `purchase_order_number` (o nulo), `currency`, `total`, `supplier_reference` y cada línea con claves numeradas (producto, cantidad, costo unitario y total). **Sin datos del proveedor**: solo su id;
- **el costo**, `entity_type` `product`, `cost_change`: `before` y `after` con `amount` y `currency`, **y el origen con las mismas claves a los dos lados**: `source: "goods_receipt"` y `goods_receipt_number: "RC-000123"`. Cumple la validación de H-3 sin un `before` inventado;
- **el cierre automático**, `entity_type` `purchase_order`, `status_change`: `{ status: "open" }` → `{ status: "closed" }`, con `closed_by: "goods_receipt"` y el número a los dos lados; **el cierre a mano**, con `closed_by: "manual"`;
- **la historia de la orden** rotula según el estado nuevo: «Cierre por la recepción RC-000123», «Cierre a mano» y «Cancelación» (R-6 de la 22.3).

**D-7. Las líneas.** **Recomendadas**:

- **reusan `lines.ts` de `purchasing`** (`parsePurchaseOrderLines` y `evaluatePurchaseOrderLines`), con el mismo orden: de 1 a 50 líneas, repetidos, productos que no existen, inactivos, total de la línea y total;
- **con orden**, además, después de leer lo recibido con la cabecera tomada:
  - cada línea nombra una línea de **esa** orden (`NOT_FOUND` si no);
  - su cantidad no supera lo que falta (`exceeds_pending`, con lo que falta);
  - la moneda es la de la orden y no se elige;
- **el formulario con orden** propone una línea por cada línea con faltante, con lo que falta y el costo esperado. La persona baja la cantidad, la deja en 0 para no recibirla o corrige el costo. Una línea en 0 no se manda;
- **la advertencia de moneda**: si la moneda de la recepción difiere de la del precio vigente de un producto, la línea lo dice antes de emitir («Este producto se vende en USD: con este costo queda sin margen»), leyendo el precio que ya trae `lockProductsForOrder` (H-11) o `getCurrentPrices` en el formulario.

**D-8. La serialización.** **Recomendada**, en el orden del punto 10:

1. **con orden**, su cabecera `FOR UPDATE`;
2. el proveedor `FOR SHARE` (`findSupplier` con `forShare`, de la 22.3);
3. los productos en modo compartido, ordenados por id (`lockProductsForOrder`);
4. la comprobación: el proveedor activo, la orden abierta y de ese proveedor, **lo recibido de cada línea leído ahora**, y las reglas de D-7;
5. `receiveStock` (D-3), que bloquea los saldos y **toma el contador al armar el motivo**;
6. la recepción y sus líneas, **el costo** (D-4), el cierre automático si todo quedó recibido, y la auditoría.

**La cancelación y el cierre a mano**: la cabecera `FOR UPDATE` y después la cuenta de recepciones de la orden. **Ningún camino bloquea un contador y después otra fila**, y los padres de los `INSERT` (proveedor, productos, orden) ya están tomados antes del contador. **Toda escritura y toda lectura por id filtra por `organization_id`.** El aislamiento sigue siendo `READ COMMITTED`.

**D-9. El cierre y la cancelación de la orden.** **Recomendados**:

- **el cierre automático**: en la misma transacción, si después de esta recepción cada línea de la orden quedó con lo recibido igual a lo pedido, la orden pasa a `closed` con `closed_at`;
- **el cierre a mano**, «cerrar con faltante»: solo una orden `open` **con alguna recepción**; si no tiene, `no_receipts`. Lleva confirmación, como la cancelación;
- **la cancelación** suma la comprobación: una orden con alguna recepción no se cancela (`has_receipts`), y se cierra a mano;
- **«vigente»**: en la 22.4 toda recepción lo es, porque la anulación llega en la 22.5. La 22.5 cambia la cuenta para excluir las anuladas.

**D-10. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`**: a un `viewer`, en toda lectura y escritura de recepciones;
- **`VALIDATION_ERROR`**, con el campo y la línea: ids que no son uuid, la moneda que no se acepta, una cantidad o un costo que no se leen, la referencia con otra forma, ninguna línea o más de 50;
- **`NOT_FOUND`**: el proveedor, la orden, los productos o la línea de la orden, si no existen en la organización o no son de esa orden;
- **`BUSINESS_RULE_VIOLATION`**, con su razón: `inactive_supplier`; `order_not_open` (con el estado); las de línea con su posición (`duplicate_product`, `inactive_product`, `zero_total`, `amount_too_large`, `exceeds_pending`); `total_too_large`; `stock_limit` con sus productos; y en la orden, `has_receipts` y `no_receipts`;
- **al escribir**: el id y el número de la recepción, y si cerró la orden.

**Ningún rechazo escribe, audita, mueve stock, cambia un costo ni consume número.**

**D-11. Las pantallas.** **Recomendadas**:

- **la navegación de Compras**: tres pestañas, «Órdenes de compra», «Recepciones» y «Proveedores»;
- **`/compras/recepciones`**: la lista, con el número, el proveedor, la orden (si tiene), la fecha, la moneda y el total; el filtro de proveedor y la búsqueda por número (D-12); y «Nueva recepción»;
- **`/compras/recepciones/nueva`**:
  - **sin orden**: el proveedor (buscador de activos), la moneda, la referencia y las líneas con el buscador de productos;
  - **con orden** (`?orden=<id>`, desde el detalle de la orden): el proveedor y la moneda fijos, y las líneas propuestas (D-7);
  - el total de cada línea estimado mientras se escribe y la advertencia de moneda (D-7);
  - funciona sin JavaScript, como la orden;
- **`/compras/recepciones/[receiptId]`**: el detalle **imprimible**, con el número, la fecha, el proveedor con sus datos de hoy, la orden (enlazada), la referencia, las líneas, el total y la leyenda; «Imprimir»; la historia;
- **en el detalle de la orden**: por línea, lo pedido, lo recibido y lo que falta; sus recepciones; «Registrar recepción» y «Cerrar con faltante» en una abierta con faltante; «Cancelar la orden» solo sin recepciones;
- **en la ficha del proveedor**: «Recepciones», con las 5 últimas y un enlace a la lista filtrada;
- **un `viewer`** que entra por la URL ve el aviso de página prohibida.

**D-12. La lista.** **Recomendada**: la más nueva primero (`created_at desc, id desc`); el filtro de proveedor; la búsqueda por número (`RC-000123`, `rc123` o `123`); de a 25. **El rendimiento**: con 2.000 recepciones, la lista con cada filtro, y el detalle de una orden de 50 líneas con 100 recepciones, quedan bajo 754 ms en local, contra el umbral de la 13.2.

**D-13. La referencia del proveedor.** **Recomendada**: opcional; se recorta y se guarda nula si queda vacía; de 1 a 40 caracteres de `^[A-Za-z0-9 /-]+$`, con un `CHECK` igual; no se busca por ella en esta subfase.

**D-14. El movimiento en el producto (H-5).** **Recomendado**: la etiqueta «Recepción», la clave de filtro `recepcion` y `goods_receipt` en `INCOMING`, con su test. El motivo ya lleva el número; un `viewer` lo ve sin costo ni proveedor (punto 12).

**D-15. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0023 y las reglas vigentes. Es la primera escritura de `purchasing` en el stock y el costo de otros módulos, con dos guardas que cambian.

**D-16. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0049`. El paso 3 corre en modo manual.

**Volver a `1225040` no es del todo limpio** si ya hay recepciones: ese código no conoce `goods_receipt`, y el historial del producto mostraría esos movimientos sin etiqueta. Los saldos y los costos quedan bien. El recorrido, en Demostración Vixora:

1. crear una orden para «Importaciones Sur» con dos productos;
2. registrar una recepción parcial de una línea, con un costo distinto del esperado, y ver la advertencia si la moneda difiere;
3. ver en el producto el stock nuevo, el movimiento «Recepción RC-…» y el costo nuevo con su origen en la historia;
4. intentar recibir más de lo que falta;
5. intentar cancelar la orden y ver el rechazo; cerrarla con faltante;
6. crear otra orden y recibirla entera: se cierra sola;
7. registrar una recepción sin orden, con la referencia del remito, e imprimirla;
8. entrar con un `viewer`: ve el stock y el movimiento, no ve «Compras».

## Invariantes

1. Una recepción y sus líneas nunca cambian ni se borran. `crm_app` no tiene `UPDATE` ni `DELETE` sobre ellas.
2. Toda recepción tiene un proveedor que estaba activo al emitirla, al menos una línea, una sola moneda, y ningún producto repetido. **Con orden, es del proveedor y la moneda de su orden, y cada línea es del producto de su línea de la orden.**
3. **Nunca se recibe más de lo pedido** en una línea de una orden.
4. El total de cada línea es el costo por la cantidad, redondeado a los decimales de la moneda y mayor que cero; el total es la suma de las líneas.
5. **Cada línea suma exactamente su cantidad al saldo físico**, con un movimiento `goods_receipt` cuyo motivo nombra la recepción y no el proveedor. Lo reservado no cambia. Ningún saldo pasa el máximo de `numeric(14, 3)`.
6. **Después de una recepción, el costo vigente de cada producto recibido es el de esa recepción**, en su moneda. Con dos recepciones del mismo producto, queda el de la que confirmó última.
7. Una orden pasa a `closed` sola cuando todo quedó recibido; a mano, solo con alguna recepción; y no se cancela con recepciones.
8. Los números `RC` no tienen huecos por organización, y un rechazo no consume número ni escribe nada.
9. Ninguna escritura ni lectura por id alcanza a otra organización.
10. Solo un `admin` lee o escribe recepciones. Ninguna lectura del agente las incluye.
11. `purchasing` importa solo `catalog`, `inventory`, `numbering`, `organizations`, `audit`, `src/shared` y el esquema de `auth`; **ningún módulo importa `purchasing`**.
12. `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0049` suma los tres valores de enum y crea las dos tablas y los únicos nuevos. En `goods-receipts-schema.test.ts`, con el rol dueño: los privilegios de D-2; cada `CHECK`; los únicos; **las claves compuestas de D-1 rechazan una recepción con otro proveedor o moneda que su orden, y una línea con otro producto que su línea de la orden**; los dos triggers rechazan `UPDATE` y `DELETE`.
- **AC-2 (stock)**: `receiveStock` suma con su movimiento, crea el saldo en 0 si falta, no toca lo reservado, y con un saldo que no cabe no escribe nada ni pide el motivo.
- **AC-3 (costo)**: `recordReceivedCosts` escribe y audita solo si el monto o la moneda difieren, con el origen de D-6; con el mismo costo no escribe.
- **AC-4 (operaciones)**: una recepción con orden y una sin orden escriben la cabecera, las líneas, el número `RC`, los movimientos, los costos y la auditoría de D-6; una que completa la orden la cierra con su auditoría; el cierre a mano y la cancelación con su regla nueva; la lista filtra, busca y pagina; el detalle de la orden muestra lo recibido y lo que falta.
- **AC-5 (serialización)**, cada escenario con su mutación:
  - **dos recepciones de la misma orden** que juntas pasan lo que falta: una entra y la otra responde `exceeds_pending`. Sin el `FOR UPDATE` de la cabecera, pasan las dos;
  - **la cancelación contra una recepción**: la que llega segunda ve a la otra (`has_receipts` u `order_not_open`);
  - **la desactivación del proveedor** y **la de un producto** contra la recepción, con el molde de la 22.3;
  - **dos recepciones del mismo producto con costos distintos**, la segunda con el costo vigente original: queda el costo de la que confirmó última. **Leer el costo antes de la entrada de stock** lo tumba (H-2);
  - **una recepción que espera a su proveedor no frena el número de otra**. El contador antes de los bloqueos lo tumba.
- **AC-6 (rechazos)**: cada respuesta de D-10, **sin escribir, auditar, mover stock, cambiar costos ni consumir número**. Un `viewer` recibe `FORBIDDEN` en cada lectura y escritura.
- **AC-7 (aislamiento)**: `organization-isolation` prueba que la recepción, su detalle y la lista no alcanzan a otra organización, y que un proveedor, una orden o un producto de otra responde `NOT_FOUND`.
- **AC-8 (rendimiento)**: las mediciones de D-12, en §Resultados.
- **AC-9 (pantallas)**: un end-to-end sobre `next start`:
  - **un `admin`**, con teclado y sin JavaScript donde el formulario lo permite: recibe parte de una orden, ve lo que falta, ve el rechazo de recibir de más, intenta cancelarla, la cierra con faltante; recibe otra entera y la ve cerrada; registra una sin orden con referencia; ve el detalle con la leyenda y la vista de impresión; ve el movimiento en el producto y el origen del costo en su historia;
  - **un `viewer`** ve el movimiento «Recepción» en el historial del producto, sin costo, y recibe el aviso en `/compras/recepciones`;
  - **axe** sin violaciones en claro y en oscuro, también en la vista de impresión.
- **AC-10 (guardas)**: `stock-writes` y `cost-writes` fijan las escrituras y los llamadores nuevos, cada uno con su caso en rojo; `exposed-surface` declara las acciones nuevas.
- **AC-11 (fronteras)**: `purchasing` no importa nada fuera de la invariante 11; ningún módulo importa `purchasing`; de los módulos existentes, solo `inventory`, `catalog`, `numbering` y `audit` están en el diff, en lo autorizado.
- **AC-12 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios, y la lectura del stock de un producto recibido devuelve el saldo nuevo.
- **AC-13**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-14**: la documentación del punto 8 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-15** (si D-16): producción corre el SHA del cierre con la `0049`. El recorrido de D-16 se concilia contra la base: las recepciones, sus líneas, los movimientos y los saldos, los costos y su auditoría, los estados de las órdenes y el contador de `goods_receipt`.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-8, AC-10 a AC-12, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-9 (UI ↔ servicio ↔ base) y AC-12.
- `isolated-runtime`: AC-15, si se despliega.
- **Las mutaciones** se corren y se revierten una por una, y su resultado va a §Resultados. Como mínimo:
  - la recepción sin el `FOR UPDATE` de la cabecera de la orden;
  - sin comprobar lo que falta recibir;
  - sin el `FOR SHARE` del proveedor, y sin comprobar que esté activo;
  - el costo leído antes de la entrada de stock;
  - el contador antes de los bloqueos;
  - el cierre automático que no mira todas las líneas;
  - la cancelación sin comprobar recepciones, y el cierre a mano sin exigirlas;
  - una escritura o una lectura por id sin `organization_id`;
  - un `viewer` que lee la lista.
- **Las claves compuestas y los triggers** se prueban contra la base con el rol dueño.
- La batería se corre **desde Git Bash**; los archivos nuevos van al índice con `git add -N` antes de la batería final; el end-to-end, en dos mitades si la máquina no alcanza.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial `cash`, `sales`, `orders`, `src/shared/`, el repositorio de `catalog` o los contratos del agente;
- `purchasing` tendría que importar algo fuera de la invariante 11, o un módulo existente importar `purchasing`;
- el diseño exigiría cambiar el texto de un ADR;
- una recepción pudiera editarse o borrarse, recibir más de lo pedido, mezclar monedas o proveedores con su orden, o emitirse para un proveedor o un producto inactivo;
- el stock pudiera cambiar sin su movimiento, o un movimiento nombrar al proveedor;
- el costo vigente después de una recepción pudiera no ser el último recibido;
- un rechazo escribe, audita, mueve stock, cambia un costo o consume número;
- aparece una vía por la que un `viewer` vea un costo o una compra, o el agente lea algo de compras;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.
