---
schema: task-brief.v1
task_id: "22.5"
task_type: implementation
generated_at: 2026-10-16
---

# Brief 22.5 — La anulación de la recepción

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el trigger, el servicio, la salida de stock, la serialización, las guardas y la frontera del módulo, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-13).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-13, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: quinta subfase de la Fase 22 — Compras y proveedores ([Roadmap](../planning/Roadmap.md) §Fase 22), después de la 22.4, cerrada el 2026-10-16. Implementa la fila «22.5» del punto 15 del [ADR 0023](0023-compras-y-proveedores.md) y su punto 6.
- **No abre ni cierra gate.** Es la primera **salida** de stock que escribe `purchasing`, por una función nueva de `inventory` que comprueba lo disponible. Se recomienda la revisión independiente (D-12).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-16, con las recomendaciones de D-1 a D-13. La tarea 22.5 es `3fa702be6f4e8130b032d9d89ec2e9ee` en Notion.

## Objetivo

Que un `admin` pueda **anular una recepción de mercadería** entera, con un motivo de una lista cerrada:

- que **saque del stock** lo que la recepción sumó, solo si alcanza lo disponible de cada producto;
- que **no toque el costo**, y que la pantalla lo diga;
- que la recepción anulada **deje de contar como recibida** en su orden, sin reabrir una orden cerrada;
- con su comprobante imprimible `ARC-000001`, la marca «Anulada» en la recepción y en las listas, y el movimiento en el historial del producto.

Un `viewer` ve el stock que sale y el movimiento, sin costo ni proveedor. El agente lee el stock nuevo sin ningún cambio de contrato.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-16, sobre `main` (`38fa326`, el cierre de la 22.4). El ADR 0023 se releyó en la fuente: puntos 3, 6, 10, 12, 13 y 15. DataModel, FunctionalRequirements, Screens, el Overview y el Roadmap se buscaron con `grep` (`goods_receipt_void`, `22.5`, `ARC-`, `anulación de la recepción`). Se leyeron en la fuente `voidSale` de `sales/service.ts`, `sellStock` y `restoreSaleStock` de `inventory/service.ts`, el esquema de `sale_voids`, la página de la anulación de la venta y los end-to-end que vacían `goods_receipts`.

**Ya está fijado** por el ADR 0023, puntos 3, 6, 10, 12 y 13:

- **la anulación es otro comprobante**, de solo inserción, **a lo sumo uno por recepción** (`UNIQUE`), con un motivo de una lista cerrada y sin texto libre, como `sale_voids`. Las cantidades y los montos se copian de la recepción y son positivos;
- **anula la recepción entera**: no hay anulación parcial. Si la mercadería ya se vendió, se corrige con un ajuste o no se anula;
- **saca del stock** lo que la recepción sumó, con un movimiento `goods_receipt_void` por línea y el motivo «Anulación ARC-000045 de la recepción RC-000123». Lo escribe **una función nueva de `inventory`**, con la transacción de `purchasing` y el motivo como función; `stock-writes` la fija a ella y a su llamador;
- **comprueba lo disponible, no el saldo**: si sacar una línea dejaría el saldo por debajo de lo reservado, o negativo, **no escribe y devuelve los productos que no alcanzan**, con lo disponible y lo que hay que sacar;
- **no mira si el producto está activo**, como la reposición de la 20.4;
- **no restaura el costo**, y la pantalla de la anulación lo dice;
- **con orden**: lo recibido de la orden deja de contarla; **una orden `closed` no se reabre**. La cancelación y el cierre a mano miran las recepciones **vigentes** (punto 3);
- **la serialización** (punto 10): con orden, su cabecera `FOR UPDATE`; los productos en modo compartido, por id, sin mirar si están activos; la comprobación; los saldos dentro de `inventory`, con **una segunda comprobación con los saldos tomados** (que no esté anulada y lo disponible) y el contador al armar el motivo. **Una carrera entre dos anulaciones** la cierra el `UNIQUE`, que se rescata como «ya anulada», como la 20.4;
- **la anulación no copia al proveedor**: apunta solo a la recepción;
- **la auditoría**: la acción `void` sobre la recepción (`entity_type` `goods_receipt`);
- **el número**: `goods_receipt_void` en `document_kind` con el prefijo `ARC`, y `goods_receipt_void` en `inventory_movement_type`;
- **solo `admin`** ve y opera las anulaciones; un `viewer` ve el stock y el movimiento con su motivo; **el agente** lee el stock por `read-v1` y `read-v2`, sin cambio de contrato y sin aviso;
- **la página imprimible** de la anulación, con la leyenda «Documento no válido como factura»;
- **la deuda con el proveedor y los pagos** son de la 22.6: la anulación no mira pagos, porque `purchasing` no depende de `cash`.

**Hallazgos de esta verificación**:

- **H-1. La salida tiene molde exacto.** `sellStock` (20.3) bloquea los saldos ordenados por producto con `lockLines`, compara cada línea con lo disponible (saldo menos reservado), devuelve las faltas con `requested` y `available` sin escribir, y si todas alcanzan pide el motivo y escribe un movimiento por línea. La anulación de la recepción necesita exactamente esa conducta, con otro tipo de movimiento.
- **H-2. «Vigente» se cuenta hoy en tres lugares, y los tres cuentan todas las recepciones** (D-9 de la 22.4): lo recibido por línea (`sumReceivedByOrderLine`, que también decide el cierre automático), las recepciones de la orden para `has_receipts` y `no_receipts` (`countOrderGoodsReceipts`), y las recepciones que muestra el detalle de la orden. La 22.5 los cambia a vigentes en los dos primeros, y marca las anuladas en el tercero.
- **H-3. La segunda comprobación del punto 10 tiene un orden que el molde no da.** En `sellStock` la comprobación de lo disponible va **antes** del motivo. Si dos anulaciones de la misma recepción **sin orden** llegan juntas, la segunda espera los saldos; cuando los obtiene, la primera ya sacó el stock. Si lo que queda no alcanza, `sellStock` respondería «stock insuficiente» antes de llegar al motivo, donde se mira si ya está anulada. **La respuesta correcta es «ya anulada»**, y el punto 10 nombra las dos comprobaciones en ese orden. Con orden no pasa: la cabecera `FOR UPDATE` serializa las dos antes de tocar saldos.
- **H-4. Trece end-to-end vacían `goods_receipts`** con `TRUNCATE` (buscados por archivo entero): `accounts`, `goods-receipts`, `order-receipts`, `orders`, `product-fields`, `product-images`, `products`, `purchase-orders`, `receipts`, `refunds`, `sales`, `security-headers` y `suppliers`. `goods_receipt_voids` apunta a `goods_receipts`, así que tiene que ir en esos trece `truncate` (`0A000`).
- **H-5. La migración es la `0050`.** Suma valores a `document_kind` e `inventory_movement_type`, y crea un tipo nuevo para el motivo. Un valor nuevo de un enum existente no se usa en la misma transacción (H-2 de la 21.4): ningún `CHECK` ni trigger de la `0050` los usa. El tipo nuevo del motivo sí se puede usar, porque se crea entero en ella.
- **H-6. El historial de movimientos del producto enumera los tipos en la app** (`movimientos/filters.ts`: etiquetas, clave del filtro y `INCOMING`). `goods_receipt_void` resta, como `sale` y `order_delivery`.
- **H-7. Cuatro tests fijan listas que crecen**: `identity-schema.test.ts` (las tablas), `audit.test.ts` (las de solo inserción), `numbering.test.ts` (los prefijos) y `catalog-inventory-schema.test.ts` (los tipos de movimiento). Van en la lista autorizada.
- **H-8. El prefijo de tres letras es el primero.** `formatDocumentNumber` toma el prefijo de una tabla; su largo no cambia la regla (ADR 0023, punto 13). La búsqueda por número de la lista y su test lo tienen que aceptar.
- **H-9. Una orden cerrada por la recepción que se anula queda `closed` con faltante.** El ADR lo quiere así: «el `admin` hace otra». El detalle de una orden cerrada muestra «Falta» mayor que cero y ninguna acción.

## Alcance incluido

1. **La migración `0050`**: los valores `goods_receipt_void` en `document_kind` y en `inventory_movement_type`; el tipo `goods_receipt_void_reason` (D-2); la tabla `goods_receipt_voids` con su trigger y sus privilegios (D-1).
2. **La salida de stock en `inventory`** (D-3), con `stock-writes` extendida.
3. **La anulación en `purchasing`** (D-4, D-5, D-6), con su auditoría (D-7).
4. **«Vigente» en la orden** (D-8): lo recibido, la cancelación y el cierre a mano cuentan solo las recepciones vigentes.
5. **Las pantallas** (D-9): la confirmación en el detalle de la recepción, el comprobante imprimible de la anulación, la marca «Anulada», el filtro de estado en la lista, el movimiento en el producto.
6. **Las pruebas**: el esquema, la salida, la anulación, la serialización, el aislamiento, las guardas, las pantallas y las mutaciones.
7. **La documentación**: DataModel, Overview, FunctionalRequirements (FR-COMP-16 y FR-COMP-17), Screens, TraceabilityMatrix y SecurityModel.

## Alcance excluido

- **Los pagos a proveedores y la cuenta del proveedor** (22.6): lo pagado contra una recepción anulada.
- **Restaurar el costo** (ADR 0023, punto 6; §Alternativas descartadas).
- **La anulación parcial**, por línea.
- **Reabrir una orden cerrada.**
- **Anular una orden de compra cancelada o cerrada**: la orden no se anula; se cancela o se cierra.
- **Cambios en `read-v1`, `read-v2` o `ingestion-v2`**, y cualquier aviso al agente.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0050_*.sql` y `drizzle/meta/*`
- `src/modules/purchasing/`, con sus tests unitarios
- `src/modules/inventory/`: `schema.ts` (**solo** el tipo nuevo), `repository.ts` y `service.ts` (**solo** la escritura y la función de D-3, y el comentario del ajuste manual), `index.ts` (**solo** la exportación) y `service.test.ts` (**solo** que el ajuste no acepta el tipo y que el filtro del historial sí)
- `src/modules/numbering/schema.ts` y `service.ts`, **solo** `goods_receipt_void` y su prefijo
- `src/app/(autenticado)/compras/` (lo existente y lo nuevo)
- `src/app/(autenticado)/productos/[productId]/movimientos/` (`page.tsx`, `filters.ts` y su test), **solo** el tipo nuevo
- `tests/integration/`:
  - `goods-receipt-voids.test.ts` y `goods-receipt-voids-schema.test.ts` (nuevos);
  - `goods-receipts.test.ts`, **solo** lo vigente en la orden (D-8);
  - `identity-schema.test.ts`, `audit.test.ts`, `numbering.test.ts` y `catalog-inventory-schema.test.ts`, **solo** la tabla, el prefijo y el tipo nuevos (H-7);
  - `organization-isolation.test.ts`, **solo** lo de la anulación
- `tests/guards/`: `stock-writes.test.ts` y `exposed-surface.test.ts`, **solo** lo de esta subfase
- `tests/e2e/goods-receipt-voids.spec.ts` (nuevo); y los trece specs de H-4, **solo** la tabla nueva en su `truncate`
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `cash`, `sales`, `orders`, `crm`, `catalog`, `knowledge`, `conversations`, `ingestion` y `audit` (la acción `void` y el `entity_type` `goods_receipt` ya existen);
- `src/shared/`, `eslint.config.mjs` y `module-boundary`;
- `scripts/`, los seeds, los ADR y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - la `0049` (`goods_receipts`, `goods_receipt_lines`) y la `0041` (`sale_voids`, `sale_void_reason`, el movimiento `sale_void`);
  - `inventory/service.ts` (`sellStock`, `lockLines`) y su repositorio (`applySale`);
  - `sales/service.ts` (`voidSale`: el rescate del `UNIQUE`, `AlreadyVoided`, `StockLimit`);
  - `purchasing` de la 22.4 (`goods-receipts.ts`, `goods-receipt-repository.ts`, `purchase-orders.ts`, las páginas de la recepción y de la orden);
  - la página de la anulación de la venta (`ventas/[saleId]/anulacion/`) y su confirmación (`void-sale.tsx`);
  - la guarda `stock-writes`.
- **Las decisiones**:
  - el [ADR 0023](0023-compras-y-proveedores.md), puntos 3, 6, 10, 12, 13 y 15;
  - el [ADR 0021](0021-la-venta.md), puntos 6 y 7, con su precisión del 2026-10-13;
  - el [ADR 0008](0008-stock-nunca-negativo.md), el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) y el [ADR 0020](0020-el-pedido.md), punto 5;
  - el [brief-20.4](brief-20.4-la-anulacion.md) y el [brief-22.4](brief-22.4-la-recepcion.md).
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. La tabla.** **Recomendada**, `goods_receipt_voids`, con el molde de `sale_voids`:

- **columnas**: `id`, `organization_id`, `number`, `goods_receipt_id`, `currency`, `total`, `reason`, `created_by` y `created_at` (con `clock_timestamp()`). **Sin líneas propias**: las cantidades se leen de la recepción, y cada movimiento las guarda;
- `UNIQUE (organization_id, number)` y **`UNIQUE (goods_receipt_id)`**: una recepción se anula a lo sumo una vez;
- **claves foráneas**, todas `ON DELETE RESTRICT`: la recepción por `(organization_id, goods_receipt_id)` hacia `goods_receipts_organization_id_id_unique`; el autor; la organización;
- **los `CHECK`**: número y total positivos; la moneda con `^[A-Z]{3}$`;
- **el trigger** `goods_receipt_voids_guard`: rechaza `UPDATE` y `DELETE` para cualquier rol, y en el `INSERT` **exige que la moneda y el total sean los de su recepción**, como `sale_voids_copy_sale`;
- `crm_app` con `SELECT` e `INSERT`.

*Alternativa*: sin copiar la moneda y el total, leyéndolos de la recepción. Es menos esquema; el comprobante impreso dependería de otra tabla, y la 22.6 lo sumaría igual para la cuenta del proveedor.

**D-2. El motivo.** **Recomendada**, la lista cerrada `goods_receipt_void_reason`:

| Valor | Etiqueta |
|---|---|
| `data_entry_error` | «Error de carga» |
| `duplicate` | «Cargada dos veces» |
| `returned_to_supplier` | «Mercadería devuelta al proveedor» |
| `other` | «Otro» |

Un valor nuevo se suma con un `ALTER TYPE` aditivo. *Alternativa*: la lista de la venta sin «Cliente equivocado» («Error de carga», «Operación no concretada», «Otro»).

**D-3. La salida de stock (H-1).** **Recomendada**:

- **`removeReceivedStock`** en el servicio de `inventory`, con la firma y la conducta de `sellStock`: la transacción, la organización, las líneas, el motivo como función y el autor; bloquea los saldos ordenados por producto; si alguna línea no alcanza lo disponible, **no escribe y devuelve las faltas** (`productId`, `requested`, `available`); si alcanzan, pide el motivo una sola vez y escribe un movimiento `goods_receipt_void` por línea, sin tocar lo reservado. **No mira si el producto está activo**;
- **`applyGoodsReceiptVoid`** en el repositorio, la escritura nueva: el movimiento y el saldo, como `applySale`;
- **`stock-writes`**: autoriza `applyGoodsReceiptVoid`, que solo llama `removeReceivedStock`, y `removeReceivedStock`, fuera de `inventory`, solo desde `src/modules/purchasing/`;
- **el ajuste manual** sigue aceptando solo sus dos tipos, con su test.

*Alternativa*: generalizar `sellStock` con el tipo como parámetro. Junta dos llamadores de módulos distintos en una función, y la guarda dejaría de distinguirlos (el mismo motivo que D-3 de la 22.4).

**D-4. La operación.** **Recomendada**, `voidGoodsReceipt(context, receiptId, reason)`:

1. `admin`; el id y el motivo se validan (`VALIDATION_ERROR`);
2. la recepción y sus líneas se leen sin bloqueo, porque son inmutables (`NOT_FOUND` si no es de la organización). **Una ya anulada se rechaza antes de bloquear nada** (`already_voided`);
3. dentro de la transacción, en el orden del punto 10 (D-5);
4. la anulación con la moneda y el total de la recepción, y la auditoría (D-7);
5. **no toca la orden**: su estado no cambia, y lo recibido se deriva (D-8).

**D-5. La serialización (H-3).** **Recomendada**:

1. **con orden**, su cabecera `FOR UPDATE`, y después **se vuelve a mirar si la recepción ya está anulada**: dos anulaciones de una recepción con orden se serializan acá;
2. los productos en modo compartido, ordenados por id (`lockProductsForOrder`), sin mirar si están activos;
3. `removeReceivedStock` (D-3), que bloquea los saldos;
4. **si devuelve faltas, antes de responder `insufficient_stock` se vuelve a mirar si ya está anulada**, con los saldos tomados. Si lo está, la respuesta es `already_voided` (H-3);
5. **el motivo** vuelve a mirar si ya está anulada y **toma el contador**;
6. la anulación y la auditoría.

**Todo rechazo después de bloquear se lanza** y se traduce fuera de la transacción (convención de la 19.3; R-1 de la 22.4). El `UNIQUE` es la última defensa: un `23505` en `goods_receipt_voids_goods_receipt_unique` se rescata como `already_voided`, como la 20.4. **Ningún camino bloquea un contador y después otra fila.** **Toda escritura y toda lectura por id filtra por `organization_id`.**

*Alternativa para H-3*: aceptar `insufficient_stock` como respuesta de la segunda anulación sin orden. Es una respuesta falsa (el stock alcanzaba para la primera, que ya ocurrió) y la persona reintentaría.

**D-6. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`**: a un `viewer`, en la anulación y en toda lectura de anulaciones;
- **`VALIDATION_ERROR`**: el id que no es uuid, el motivo que no es de la lista;
- **`NOT_FOUND`**: la recepción, si no existe en la organización;
- **`BUSINESS_RULE_VIOLATION`**:
  - `already_voided`, con el id y el número de la anulación;
  - `insufficient_stock`, con cada producto que no alcanza, lo que hay que sacar y lo disponible;
- **al escribir**: el id y el número de la anulación.

**Ningún rechazo escribe, audita, mueve stock ni consume número.**

**D-7. La auditoría.** **Recomendada**: `entity_type` `goods_receipt`, acción `void`, sobre la recepción, con `before: { void_number: null, reason: null }` y `after: { void_number, reason }`, como la venta. Sin datos del proveedor. **La orden no se audita**: su estado no cambia. La historia de la recepción la muestra: «Anulación ARC-000001 · Error de carga».

**D-8. «Vigente» en la orden (H-2, H-9).** **Recomendado**:

- **lo recibido por línea** cuenta solo las recepciones sin anulación (`NOT EXISTS` sobre `goods_receipt_voids`). Es la misma cuenta que decide el cierre automático y `exceeds_pending`, así que **después de anular, lo anulado se puede volver a recibir** con la misma orden si sigue abierta;
- **`has_receipts` y `no_receipts`** cuentan solo las vigentes: una orden abierta cuyas recepciones se anularon todas **se puede cancelar**, y **no se puede cerrar a mano**;
- **una orden `closed` sigue `closed`**: muestra lo que falta y ninguna acción (H-9);
- **el detalle de la orden** lista todas sus recepciones, con la marca «Anulada» en las anuladas.

**D-9. Las pantallas.** **Recomendadas**, con el molde de la 20.4:

- **en el detalle de la recepción** (pantalla 48), para un `admin` y una recepción vigente, «Anular la recepción» lleva a `?confirmar=anular`: el motivo de la lista; **lo que va a salir del stock** por producto, con lo disponible hoy; **«Anular no restaura el costo: si hace falta, corregilo en la ficha del producto.»**; «Anular» y «Volver». Un rechazo `insufficient_stock` dice qué productos no alcanzan, con lo disponible y lo que hay que sacar, y sugiere el ajuste. Funciona sin JavaScript;
- **una recepción anulada** muestra «Anulada por ARC-000001 el 16/10/2026», con el enlace a su comprobante; en la vista de impresión, la marca «Anulada»;
- **`/compras/recepciones/[receiptId]/anulacion`** (pantalla nueva 49): el comprobante **imprimible** de la anulación, con la organización, el número y la fecha, la recepción que anula (enlazada), el proveedor, la orden si hay, las líneas y el total de la recepción, el motivo y la leyenda. Una recepción sin anular devuelve «no encontrada»;
- **la lista** (pantalla 46): la marca «Anulada»; el filtro de estado: todas, las vigentes o las anuladas (`?estado=`); la búsqueda por número acepta también `ARC-000001` y encuentra su recepción (H-8);
- **la ficha del proveedor** y **el detalle de la orden**: la marca «Anulada» en sus recepciones;
- **el historial de movimientos del producto** (H-6): la etiqueta «Anulación de recepción», la clave de filtro `anulacion-recepcion` y el signo «−». El motivo nombra la anulación y la recepción, no el proveedor;
- **un `viewer`** que entra por la URL a la anulación ve el aviso de página prohibida.

**D-10. El rendimiento.** **Recomendado**: con 2.000 recepciones y 500 anuladas en local, la lista con cada estado y la búsqueda por número `ARC`, y el detalle de una orden de 50 líneas con 100 recepciones y 30 anuladas, quedan bajo 754 ms, contra el umbral de la 13.2. `UNIQUE (goods_receipt_id)` sirve al `NOT EXISTS`.

**D-11. Las e2e de H-4.** **Recomendado**: sumar `goods_receipt_voids` al `truncate` de los trece, delante de `goods_receipt_lines, goods_receipts`, sin otro cambio.

**D-12. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0023 y las reglas vigentes. Es la primera salida de stock que escribe `purchasing`, con una función nueva de `inventory` y la guarda que cambia.

**D-13. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0050`. El paso 3 corre en modo manual.

**Volver a `12209c8` no es limpio** si ya hay anulaciones: ese código no conoce `goods_receipt_voids`, mostraría la recepción anulada como vigente y la contaría como recibida en su orden. Los saldos quedan bien. El recorrido, en Demostración Vixora:

1. anular `RC-000003` (sin orden) con «Error de carga»: ver el comprobante `ARC-000001`, imprimirlo, ver la marca en la recepción y en la lista, y el stock y el movimiento en el producto; ver que el costo no cambió;
2. crear una orden, recibirla en parte, anular esa recepción: ver que lo recibido vuelve a cero, que la orden se puede cancelar y que «Cerrar con faltante» desaparece;
3. intentar anular una recepción cuyo stock ya no alcanza (por ejemplo, después de un ajuste negativo) y ver el rechazo;
4. intentar anular otra vez una anulada;
5. entrar con un `viewer`: ve el movimiento, no ve «Compras».

## Invariantes

1. Una anulación nunca cambia ni se borra. `crm_app` no tiene `UPDATE` ni `DELETE` sobre ella.
2. **Una recepción se anula a lo sumo una vez**, entera, y la anulación copia su moneda y su total.
3. **Cada línea saca exactamente lo que sumó**, con un movimiento `goods_receipt_void` cuyo motivo nombra la anulación y la recepción, y no el proveedor. Lo reservado no cambia. **Ningún saldo queda negativo ni por debajo de lo reservado.**
4. **La anulación no cambia ningún costo.**
5. **Una recepción anulada no cuenta como recibida** en su orden, ni para `has_receipts` ni para `no_receipts`. **Una orden `closed` no se reabre.**
6. Los números `ARC` no tienen huecos por organización, y un rechazo no consume número ni escribe nada.
7. Ninguna escritura ni lectura por id alcanza a otra organización.
8. Solo un `admin` lee o escribe anulaciones. Ninguna lectura del agente las incluye.
9. `purchasing` importa solo `catalog`, `inventory`, `numbering`, `organizations`, `audit`, `src/shared` y el esquema de `auth`; **ningún módulo importa `purchasing`**.
10. `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0050` suma los dos valores de enum, el tipo del motivo y la tabla. En `goods-receipt-voids-schema.test.ts`, con el rol dueño: los privilegios de D-1; cada `CHECK`; los dos únicos; la clave compuesta con una recepción de otra organización; **el trigger rechaza `UPDATE`, `DELETE` y una moneda o un total distintos de los de la recepción**. (Borrar la recepción anulada lo frena antes su propio trigger de solo inserción, de la `0049`.)
- **AC-2 (stock)**: `removeReceivedStock` saca con su movimiento, no toca lo reservado, y con una línea que no alcanza lo disponible —por saldo o por reservado— no escribe nada ni pide el motivo, y devuelve las faltas.
- **AC-3 (operación)**: una anulación con orden y una sin orden escriben la anulación con `ARC`, los movimientos, la auditoría de D-7, y **no cambian ningún costo ni el estado de la orden**; lo recibido de la orden deja de contar la anulada, se puede volver a recibir, la cancelación vuelve a estar permitida y el cierre a mano no; una orden cerrada sigue cerrada; la lista filtra por estado y busca por `ARC`.
- **AC-4 (serialización)**, cada escenario con su mutación:
  - **dos anulaciones de la misma recepción sin orden**, con lo justo de stock: una entra y la otra responde `already_voided`, nunca `insufficient_stock`. Sin la segunda mirada de D-5, paso 4, responde `insufficient_stock` (H-3);
  - **dos anulaciones de la misma recepción con orden**: una entra y la otra `already_voided`. Sin el `FOR UPDATE` de la cabecera, cae en la segunda defensa o en el `UNIQUE`;
  - **la anulación contra una venta sin pedido** del mismo producto, con lo justo para una: entra una y la otra responde por falta de stock; **ningún saldo queda negativo**. Sin la comprobación de lo disponible, el saldo queda negativo o la base lo rechaza;
  - **la anulación contra la cancelación de su orden**: la cancelación que espera la cabecera ve la recepción anulada y entra. Sin el `FOR UPDATE` de la cabecera en la anulación, responde `has_receipts`;
  - **una anulación que espera sus saldos no frena el número de otra**. El contador antes de los bloqueos lo tumba.
- **AC-5 (rechazos)**: cada respuesta de D-6, **sin escribir, auditar, mover stock ni consumir número**. Un `viewer` recibe `FORBIDDEN`.
- **AC-6 (aislamiento)**: `organization-isolation` prueba que la anulación, su lectura y la lista no alcanzan a otra organización.
- **AC-7 (rendimiento)**: las mediciones de D-10, en §Resultados.
- **AC-8 (pantallas)**: un end-to-end sobre `next start`:
  - **un `admin`**, con teclado y sin JavaScript donde el formulario lo permite: anula una recepción sin orden y ve el comprobante, la marca y la vista de impresión; anula una con orden y ve lo recibido, la cancelación permitida y el cierre a mano ausente; ve el rechazo por falta de stock; filtra la lista por estado y busca por `ARC`; ve el movimiento en el producto y el costo sin cambio;
  - **un `viewer`** ve el movimiento «Anulación de recepción» sin costo ni proveedor, y el aviso en la anulación;
  - **axe** sin violaciones en claro y en oscuro, también en la vista de impresión.
- **AC-9 (guardas)**: `stock-writes` fija la escritura y el llamador nuevos, con su caso en rojo; `exposed-surface` declara la acción nueva.
- **AC-10 (fronteras)**: `purchasing` no importa nada fuera de la invariante 9; ningún módulo importa `purchasing`; de los módulos existentes, solo `inventory` y `numbering` están en el diff, en lo autorizado.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios, y la lectura del stock de un producto con la recepción anulada devuelve el saldo nuevo.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 7 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-13): producción corre el SHA del cierre con la `0050`. El recorrido de D-13 se concilia contra la base: las anulaciones, los movimientos y los saldos, los costos sin cambio, lo recibido y el estado de las órdenes, la auditoría y el contador de `goods_receipt_void`.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7, AC-9 a AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-11.
- `isolated-runtime`: AC-14, si se despliega.
- **Las mutaciones** se corren y se revierten una por una, cada «detectada» validada por el caso que cae y por qué cae, y su resultado va a §Resultados. Como mínimo:
  - la anulación sin el `FOR UPDATE` de la cabecera de la orden;
  - sin la segunda mirada de «ya anulada» ante una falta (H-3);
  - sin comprobar lo disponible;
  - el contador antes de los bloqueos;
  - un rechazo devuelto con `return` dentro de la transacción;
  - lo recibido contando también las anuladas, y `has_receipts` contando también las anuladas;
  - una escritura o una lectura por id sin `organization_id`;
  - un `viewer` que anula.
- **La clave compuesta y el trigger** se prueban contra la base con el rol dueño.
- **El caso de los rechazos incluye una línea cuyo producto no alcanza por lo reservado** y no solo por el saldo (lección de R-1 de la 22.4: la foto discrimina solo con el dato que el defecto toca).
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end; los archivos nuevos van al índice con `git add -N` antes de la batería final; el end-to-end, en dos mitades si la máquina no alcanza.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial `cash`, `sales`, `catalog`, `audit`, `src/shared/` o los contratos del agente;
- `purchasing` tendría que importar algo fuera de la invariante 9, o un módulo existente importar `purchasing`;
- el diseño exigiría cambiar el texto de un ADR;
- una anulación pudiera editarse o borrarse, anular dos veces la misma recepción, anular una parte, o dejar un saldo negativo o por debajo de lo reservado;
- el stock pudiera cambiar sin su movimiento, o un movimiento nombrar al proveedor;
- la anulación pudiera cambiar un costo o el estado de una orden;
- un rechazo escribe, audita, mueve stock o consume número;
- aparece una vía por la que un `viewer` vea un costo o una compra, o el agente lea algo de compras;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.
