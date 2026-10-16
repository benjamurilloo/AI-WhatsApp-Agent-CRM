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

## Resultados — 2026-10-16 (autoevaluación)

Implementado el 2026-10-16. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvíos de texto de D-9, sin cambiar una decisión** (N-1 de la revisión):

- la página de la anulación de una recepción sin anular dice «Esta recepción no está anulada.», y no «no encontrada»: la recepción existe;
- la historia dice «Anulación ARC-000001: {motivo}», con dos puntos y no con «·», como el resto de los resúmenes de auditoría del módulo;
- los botones de la confirmación siguen el molde de la anulación de la venta: «No, volver» y «Sí, anular la recepción».

**Precisiones que no cambian una decisión:**

- **La anulación vive en un archivo nuevo del módulo**, `goods-receipt-voids.ts`. El repositorio de la recepción suma su inserción, su lectura por recepción y el rescate del `UNIQUE` (`isGoodsReceiptAlreadyVoided`), con su test unitario.
- **«Vigente» es un `NOT EXISTS` sobre `goods_receipt_voids`**, en un solo fragmento que usan lo recibido por línea (`sumReceivedByOrderLine`) y el recuento de recepciones de la orden (`countOrderGoodsReceipts`), del que dependen `has_receipts` y `no_receipts`.
- **Todo rechazo posterior a los bloqueos se lanza** dentro de la transacción (`AlreadyVoided`, `InsufficientStock`) y se traduce fuera, como en `voidSale` y en R-1 de la 22.4. Ante una falta, la segunda mirada de «ya anulada» va antes de lanzar (H-3).
- **Los `CHECK` de la tabla se prueban con una recepción inexistente**: con una real, el trigger de la copia de moneda y total los adelanta y el caso no discriminaría el `CHECK`.
- **`status` y `voidNumber` del filtro de la lista son opcionales**, con «todas» por defecto, para no cambiar los casos de la 22.4.
- **Los 15 `TRUNCATE` de 13 specs end-to-end** empiezan ahora por `goods_receipt_voids`, porque su trigger impide borrar la recepción antes.
- **Los archivos nuevos entraron al índice con `git add -N`**, porque `exposed-surface` lee `git ls-files`.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `goods-receipt-voids-schema.test.ts`, 13 casos con el rol dueño: los privilegios y el 42501 de `crm_app` en `UPDATE` y `DELETE`, cada `CHECK`, los dos únicos, la clave compuesta con una recepción de otra organización, y el trigger contra `UPDATE`, `DELETE` y una moneda o un total distintos de los de la recepción |
| AC-2 | cumplido | `goods-receipt-voids.test.ts`: la salida con su movimiento y su motivo, lo reservado intacto, y las faltas por el saldo, por lo reservado y con un producto sin fila de saldo, sin escribir ni pedir el motivo; `service.test.ts` de `inventory`: el ajuste rechaza `goods_receipt_void` y el filtro de la historia lo acepta |
| AC-3 | cumplido | `goods-receipt-voids.test.ts`: con orden y sin orden, la anulación con `ARC`, los movimientos, la auditoría `void`, el costo y el estado de la orden sin cambio; lo recibido sin la anulada, volver a recibir, la cancelación permitida y el cierre a mano rechazado; la orden cerrada que sigue cerrada; el filtro por estado y la búsqueda por `ARC` |
| AC-4 | cumplido | `goods-receipt-voids.test.ts`, los cinco escenarios; el de la venta, en los dos órdenes de llegada. Mutaciones abajo |
| AC-5 | cumplido | `goods-receipt-voids.test.ts`: cada respuesta de D-6 sin escribir, auditar, mover stock ni consumir número, con una línea que no alcanza por lo reservado y otra sin fila de saldo; `FORBIDDEN` para un `viewer` |
| AC-6 | cumplido | `organization-isolation.test.ts`: la anulación, su lectura y la lista con una recepción de otra organización |
| AC-7 | cumplido | en local, con 2.000 recepciones y 500 anuladas: la lista en la página 40, sola, filtrada por estado o por proveedor, de 11,2 a 14,7 ms; buscada por `ARC`, 7,8 ms. El detalle de una orden de 50 líneas con 100 recepciones, 30 de ellas anuladas: 24,8 ms. El umbral es de 754 ms |
| AC-8 | cumplido | `goods-receipt-voids.spec.ts`, 7 casos sobre `next start`: un `admin` anula con el teclado una recepción sin orden y ve la marca y el aviso del costo; el comprobante, su vista de impresión y el movimiento en el producto; la anulación de una recepción con orden, con lo recibido en cero, la cancelación y sin el cierre a mano; el rechazo por falta de stock; la lista con la marca, el filtro por estado y la búsqueda por `ARC`; un `viewer` con el movimiento sin costo ni proveedor y el aviso en la anulación; y la anulación sin JavaScript. axe sin violaciones en claro y en oscuro, también en la vista de impresión |
| AC-9 | cumplido | `stock-writes` fija `applyGoodsReceiptVoid`, llamada solo desde `removeReceivedStock`, y que `receiveStock` y `removeReceivedStock` solo se llaman desde `purchasing`, con 6 casos que detecta y 2 que permite, vista en rojo antes de extenderla; `exposed-surface` declara `voidGoodsReceiptAction`, vista en rojo antes |
| AC-10 | cumplido | `purchasing` importa `audit`, `catalog`, `inventory`, `numbering`, `organizations`, `src/shared` y los esquemas de `auth`, `catalog` y `organizations` que ya usaba; ningún módulo importa `purchasing`; de los módulos existentes, solo `inventory` y `numbering` están en el diff, dentro de lo autorizado |
| AC-11 | cumplido | `read-api`, `read-api-v2` e `ingestion-v2` pasan en la integración completa sin cambios; `goods-receipt-voids.test.ts` lee el stock por `getProductBalanceForService` y devuelve el saldo después de la anulación |
| AC-12 | cumplido | la batería local, abajo: todo pasa, con el end-to-end en dos mitades por la caída del servidor de prueba y la falla por carga de `organization-bootstrap`, que pasa sola. La CI 38958472171 de `49db51c` terminó en `success` en 16 minutos al primer intento, con la suite completa, y se leyó por el SHA completo |
| AC-13 | cumplido | DataModel (`goods_receipt_voids`), Overview, FunctionalRequirements (`FR-COMP-16` y `17`, y la precisión de `FR-COMP-14`), Screens (la 49, y la 5, la 42, la 45, la 46 y la 48), TraceabilityMatrix y SecurityModel (154 puntos de entrada) |
| AC-14 | cumplido | desplegado el 2026-10-16 y recorrido por el usuario; conciliado contra la base (§Cierre) |

### Mutaciones

Corridas una por una con un script que aplica el cambio, verifica que aparezca una sola vez, corre el caso que debería atraparlo y restaura el archivo. Al terminar, el hash del diff es idéntico al de antes.

- **M1**, la anulación sin el `FOR UPDATE` de la cabecera de la orden: detectada por «la cancelación que espera la cabecera». Cae porque la cancelación ya no espera: `waitForLockWaiters` agota su tiempo (N-3, abajo).
- **M2**, sin la segunda mirada de «ya anulada» ante una falta (H-3): detectada por «dos anulaciones de la misma recepción sin orden», que responde `insufficient_stock` en vez de `already_voided`.
- **M3**, sin comprobar lo disponible: detectada por «la anulación contra una venta» con la venta primero. **Sobrevivió en la primera corrida**, porque el caso solo probaba la anulación primero, y entonces la que comprueba es la venta. Con el caso en los dos órdenes, la base rechaza el saldo negativo con un error, no con `insufficient_stock`, y cae.
- **M4**, comprobar el saldo y no lo disponible: detectada por el rechazo con una línea que no alcanza por lo reservado.
- **M5**, el contador antes de los bloqueos: detectada por «una anulación que espera sus saldos no frena el número de otra».
- **M6**, el rechazo por stock devuelto con `return` dentro de la transacción: detectada por el rechazo con un producto sin fila de saldo, cuya fila en 0 quedaba confirmada.
- **M7**, lo recibido contando también las anuladas: detectada por «con orden: lo recibido deja de contarla».
- **M8**, `has_receipts` y `no_receipts` contando también las anuladas: detectada por el caso de la cancelación.
- **M9**, la lectura de la anulación por recepción sin `organization_id`: detectada por `organization-isolation.test.ts`.
- **M10**, un `viewer` que anula: detectada por el caso de `FORBIDDEN`.
- **M11**, sin rescatar el `UNIQUE` como «ya anulada», sola: **sobrevive, por diseño**. Es la última defensa: la mirada del motivo, antes del contador, frena primero la segunda anulación. La cubren el test unitario de `isGoodsReceiptAlreadyVoided` y M13.
- **M12**, sin la mirada del motivo: **sobrevive, como control**. Sin esa mirada, el `UNIQUE` frena la segunda anulación y su rescate responde `already_voided`.
- **M13**, sin la mirada del motivo ni el rescate del `UNIQUE`: detectada por «dos anulaciones de la misma recepción sin orden, con stock de sobra», que recibe un error en vez de `already_voided`.
- **La clave compuesta y el trigger** los prueba `goods-receipt-voids-schema.test.ts` contra la base, con el rol dueño.

### La batería local

Desde Git Bash, sin nada en paralelo:

- formato, lint, typecheck y build pasan;
- 847 unitarios y 687 guardas pasan;
- integración, 1.475 de 1.476. Falló `organization-bootstrap.test.ts` («todos los seeds rechazan la base productiva») por timeout, a los 30,1 s con la suite entera. Corrido solo pasa, 6 de 6, en 19 s. Esta subfase no toca ni el test ni los seeds, y la 21.6 registró la misma falla por carga;
- end-to-end, en dos mitades. La corrida completa pasó los primeros 173 casos, entre ellos los 7 de `goods-receipt-voids.spec.ts`, y los 2 de `chromium-sin-ingestion`. En el caso 174, el segundo de `receipts.spec.ts`, el servidor de prueba se cayó sin dejar error: ese caso agotó su tiempo y los 40 que siguieron fallaron con `ERR_CONNECTION_REFUSED`. Es la misma caída que registró la 22.4, y esa corrida no cuenta para ellos. Las seis specs que quedaron (`receipts`, `refunds`, `sales`, `security-headers`, `suppliers` y `users`), corridas solas: 42 de 42. Entre las dos, los 216 casos.

## Revisión independiente — 2026-10-16

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0023 y las reglas vigentes. No ejecutó nada. Encontró **7 hallazgos: ninguno crítico ni mayor, dos menores y cinco notas**. Cada uno se verificó contra el código o los documentos antes de aceptarlo.

- **M-1 (menor), corregido**: `FR-COMP-14` decía que una orden «con recepciones» no se cancela, y `FR-COMP-17` que se cancela si todas sus recepciones se anularon. `FR-COMP-14` lleva ahora una nota, «Precisado el 2026-10-16 en la 22.5», que remite al punto 3 del ADR 0023: cuentan las recepciones vigentes. No se reescribe el requisito.
- **M-2 (menor), corregido**: Overview y Screens decían todavía que la anulación «llega con la 22.5». Las dos frases llevan «*Llegó el 2026-10-16*».
- **N-1 (nota), declarado**: los desvíos de texto de D-9, arriba.
- **N-2 (nota), aceptado sin cambio**: ningún caso discrimina la mirada de «ya anulada» del paso 1, después del `FOR UPDATE` de la cabecera, con orden. Sin ella, la segunda anulación sigue frenada por la mirada del paso 4, la del motivo o el `UNIQUE`: es defensa en profundidad, como M11 y M12.
- **N-3 (nota), aceptado sin cambio**: M1 cae porque `waitForLockWaiters` agota su tiempo, no por una aserción sobre el resultado. Además, un `return` en lugar del `AlreadyVoided` del paso 4 no se vería, porque ese rechazo no escribe nada que la foto pueda mostrar.
- **N-4 (nota), resuelto con esta sección**: DataModel remitía a §Resultados, que todavía no existía.
- **N-5 (nota), verificado**: el revisor no pudo correr `git diff`. Con `git status` completo, todos los archivos del cambio están en la lista autorizada, y `docs/ui-redesign/` y `.claude/settings.json` quedan fuera.

## Cierre de la subfase 22.5, 2026-10-16

Cierra el 2026-10-16, después del recorrido del usuario en producción («ya lo revise, esta todo perfecto») y de la conciliación contra la base.

- **AC-1 a AC-14 cumplidos**, con los desvíos de texto de D-9 declarados en §Resultados.
- **Commit, CI y despliegue**:
  - `49db51c`, la implementación. La CI 38958472171 terminó en `success` en 16 minutos al primer intento, con la suite completa, y se leyó por el SHA completo.
  - Desplegado el 2026-10-16 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `12209c8` anotado como la versión para volver atrás. La migración `0050` se aplicó, y la última línea comparó HEAD con el SHA pedido. El paso 3 corrió con el usuario en modo manual, como en la 22.2, la 22.3 y la 22.4.
  - Después del despliegue: el servicio, `active`; `/login` en `127.0.0.1:3000`, con `200`; 51 migraciones aplicadas; `goods_receipt_voids` con `SELECT` e `INSERT` para `crm_app` y su trigger `goods_receipt_voids_guard` sobre `INSERT`, `UPDATE` y `DELETE`; `goods_receipt_void` en `inventory_movement_type` y `document_kind`; los cuatro motivos; los dos únicos; la tabla vacía.
- **La conciliación del recorrido**, solo con lecturas, en Demostración Vixora:
  - dos anulaciones con «Error de carga»: `ARC-000001` de `RC-000003`, sin orden, y `ARC-000002` de `RC-000004`, con orden; cada una con la moneda y el total de su recepción;
  - cada línea sacó exactamente lo que sumó (2 y 1), con un movimiento `goods_receipt_void` cuyo motivo nombra la anulación y la recepción, sin el proveedor;
  - los 12 saldos de la base cuadran con la suma de sus movimientos con signo, y ninguno queda negativo ni por debajo de lo reservado. El producto anulado tiene 3, que es su historia: `2 −1 −1 +1 +1 +1 +2 +2 −2 +1 −1 +4 −6`;
  - ningún costo escrito por una anulación: el único costo posterior a la primera es un cambio a mano, con su auditoría `cost_change` del producto, entre la segunda anulación y `RC-000005`;
  - la orden 3: la anulación de `RC-000004` la dejó en cero recibido sin cambiar su estado; después `RC-000005` recibió las 4 unidades y la cerró sola, su único cambio de estado. Pedido 4, recibido vigente 4;
  - el rechazo por stock (paso 3, después del ajuste negativo «Test» de 6) y la segunda anulación de una anulada (paso 4) no escribieron nada: hay dos anulaciones, dos auditorías `void` de `goods_receipt` y el contador de `goods_receipt_void` en 2, igual al mayor número.
- **Volver a `12209c8` ya no es limpio**: hay anulaciones, que ese código mostraría como recepciones vigentes (D-13).
- **Revisión independiente**: ninguno crítico ni mayor; los dos menores, corregidos; las cinco notas, en §Resultados.
- **Pendiente para después**: nada de esta subfase. La siguiente es la 22.6, los pagos a proveedores y la cuenta corriente con proveedores (puntos 8 y 9 del ADR 0023), con su brief.
