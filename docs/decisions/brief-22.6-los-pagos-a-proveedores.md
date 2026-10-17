---
schema: task-brief.v1
task_id: "22.6"
task_type: implementation
generated_at: 2026-10-16
---

# Brief 22.6 — Los pagos a proveedores

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, los triggers, el servicio, la regla de imputación, lo esperado de la caja, la serialización, las guardas y las fronteras, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-17).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-17, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: sexta subfase de la Fase 22 — Compras y proveedores ([Roadmap](../planning/Roadmap.md) §Fase 22), después de la 22.5, cerrada el 2026-10-16. Implementa la fila «22.6» del punto 15 del [ADR 0023](0023-compras-y-proveedores.md) y sus puntos 8, 9 y 10. **Con D-1 recomendada**, implementa las escrituras de esa fila, y las pantallas de la cuenta del proveedor pasan a una 22.7.
- **No abre ni cierra gate.** Es **la primera salida de plata de la caja hacia afuera del negocio**, y **la primera vez que `cash` depende de `purchasing`**. Se recomienda la revisión independiente (D-16).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-16, con las recomendaciones de D-1 a D-17. Con D-1, la fila «22.6» del ADR 0023 se divide en la 22.6 (este brief) y la 22.7 — La cuenta del proveedor. La tarea 22.6 es `3fa702be6f4e814baad9fa8771421f38` en Notion; la 22.7 se crea en «Esperando» con autorización.

## Objetivo

Que un `admin` pueda **pagarle a un proveedor**, con un medio de pago activo:

- **contra una recepción**, sin superar lo que le falta pagar;
- **a cuenta del proveedor**, sin tope: lo que exceda queda a favor del negocio;
- **en efectivo**, sacando la plata de la sesión de caja abierta de su moneda, sin dejar lo esperado por debajo de cero;
- y **anular un pago** entero, con un motivo de una lista cerrada.

Cada pago y cada anulación tienen su comprobante imprimible (`PP-000001`, `APP-000001`). La recepción muestra lo pagado y lo que falta, y el arqueo de la caja descuenta los pagos en efectivo. Un `viewer` ve en la caja el total de esos pagos, sin el detalle. El agente no ve nada.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-16, sobre `main` (`f839c3d`, el cierre de la 22.5):

- **El ADR 0023**, en la fuente: los puntos 2, 8, 9, 10, 11, 12, 13 y 15, y §Riesgos.
- **Con `grep`** (`supplier_payment`, `22.6`, `PP-`, `cash`, `purchasing`, «depende de», «no importa»): DataModel, el Overview, FunctionalRequirements, Screens, el Roadmap y el HANDOFF.
- **En la fuente, de `cash`**:
  - `schema.ts`: `receipts`, `receipt_voids`, `refunds` y `refund_voids`;
  - `imputation.ts` (`imputeAccount`) y `totals.ts` (`computeCashTotals`);
  - de `service.ts`: `createSaleReceipt`, `createAccountReceipt`, `voidReceipt`, `createRefund`, `readPayment`, `readTotalsInput`, `exceedsCashLimit`, `impactedSession`, el detalle de una sesión, `getClientStatement` y `listDebtors`;
  - `index.ts`.
- **En la fuente, de `purchasing`**: `index.ts`, `findSupplier` (con `forShare`) y el repositorio de la recepción.
- **Las guardas**: `cash-writes`, `exposed-surface`, `service-read-entry-points` y la configuración de fronteras de `eslint.config.mjs`.
- **Los end-to-end** que vacían tablas con `TRUNCATE`.

**Ya está fijado** por el ADR 0023, puntos 8 a 13:

- **los pagos viven en `cash`**, que depende de `purchasing` para leer y bloquear al proveedor y leer las recepciones y si están anuladas. **`purchasing` no depende de `cash`** y nunca toma el bloqueo `cash:`;
- **el pago es un comprobante emitido, de solo inserción**, con la forma del cobro:
  - un monto positivo, en un medio activo de `payment_methods`;
  - **un solo destino**: una recepción, o la cuenta de un proveedor. Una columna discriminadora y un `CHECK` exigen la clave de su destino y ninguna otra;
  - **copia el proveedor de su destino**, y lo asegura el servicio;
  - la moneda es la de la recepción, o la que se elija en un pago a cuenta;
  - sin texto libre;
- **cuánto**:
  - un pago contra una recepción **nunca supera lo que le falta pagar**, derivado con la regla del punto 9, y se rechaza con `BUSINESS_RULE_VIOLATION`, informando lo que falta;
  - **no se paga una recepción anulada**;
  - **un pago a cuenta no tiene tope**;
- **el pago en efectivo sale de la sesión abierta de su moneda**, y sin una se rechaza. **No deja lo esperado por debajo de cero.** Lo esperado queda así: inicial + cobros en efectivo − cobros anulados en la sesión − devoluciones en efectivo + devoluciones anuladas en la sesión + aportes − retiros **− pagos a proveedores en efectivo + pagos a proveedores anulados en la sesión**;
- **la anulación del pago** es otro comprobante de solo inserción, a lo sumo una por pago, con los montos copiados y un motivo de una lista cerrada. **Su sesión es la del pago si sigue abierta, y ninguna si cerró**;
- **los nombres**:
  - las tablas son `supplier_payments` y `supplier_payment_voids`;
  - los tipos de `document_kind` son `supplier_payment` (`PP`) y `supplier_payment_void` (`APP`);
  - el `entity_type` es `supplier_payment`, con las acciones `create` y `void`;
- **la cuenta del proveedor**:
  - se deriva, sin tabla, por proveedor y por moneda: al debe, sus recepciones vigentes; al haber, sus pagos vigentes;
  - **se calcula con `imputeAccount`, sin cambiar la regla**. Una recepción ocupa el lugar de una venta, y un pago, el de un cobro contra una venta o a cuenta. Las señas y las devoluciones llegan vacías;
- **un proveedor desactivado recibe pagos**, contra sus recepciones y a cuenta (punto 2);
- **la serialización** (punto 10):
  - los pagos siguen el orden del ADR 0022, punto 4: el bloqueo `cash:` primero, el proveedor en modo compartido, la comprobación y el contador al final;
  - **una recepción que se anula mientras se registra un pago contra ella no se serializa**: el monto pasa a la cuenta del proveedor, sin perderse ni contarse dos veces. **El brief de la 22.6 prueba el caso**;
- **los roles** (punto 12):
  - solo un `admin` ve y opera los pagos y la cuenta;
  - **un `viewer` ve en el arqueo el total de los pagos en efectivo de la sesión, sin el detalle de cada pago**. Puede inferir un costo, y es un límite aceptado por el usuario el 2026-10-15;
- **el agente** no lee ni registra pagos (ADR 0016, punto 5), y no recibe ningún aviso;
- **las páginas imprimibles** del pago, de su anulación y del estado de cuenta, con la leyenda «Documento no válido como factura».

**Hallazgos de esta verificación**:

- **H-1. La fila «22.6» del punto 15 es la más grande de la fase.** Junta, en una subfase:
  - dos tablas con sus triggers;
  - dos casos de uso que escriben plata, cada uno con dos destinos;
  - los términos nuevos de lo esperado, que tocan todas las escrituras de la caja que lo leen;
  - la primera dependencia de `cash` hacia `purchasing`;
  - la cuenta con su estado de cuenta y su lista;
  - cinco pantallas nuevas.

  Su equivalente de la Fase 21 se repartió en tres subfases: la 21.3, el cobro con la regla entera; la 21.5, la anulación; y la 21.6, la cuenta (D-1).
- **H-2. Todo lo que lee lo esperado pasa por `readTotalsInput` y `computeCashTotals`.** Lo leen:
  - el retiro (`insufficient_cash`), el aporte y el cobro (el tope de `numeric(14, 2)`);
  - la anulación del cobro y la devolución (`insufficient_cash`), y la anulación de la devolución (el tope);
  - la vista previa y el cierre, con las monedas que faltan contar;
  - el detalle y la lista de sesiones.

  **Sumar los dos términos ahí los alcanza a todos sin tocar cada caso de uso.** Un caso de uso que leyera lo esperado por otro camino quedaría desfasado: la batería lo tiene que mostrar (AC-4).
- **H-3. El detalle de una sesión lo ve un `viewer`, y hoy lista cada cobro y cada devolución con su monto.** Los pagos a proveedores no pueden ir en esa lista para un `viewer` (punto 12). Lo mismo vale para las anulaciones posteriores al cierre (`lateVoids`), que nombran cada documento.
- **H-4. La copia del proveedor no la puede asegurar un trigger sin cruzar módulos en la base**, como en el cobro (ADR 0022, punto 2). Una clave foránea triple contra `goods_receipts (organization_id, id, supplier_id)` sí podría, pero exige un `UNIQUE` nuevo en una tabla de `purchasing` para servir a `cash`. El ADR dice «lo asegura el servicio», y este brief lo conserva (D-2).
- **H-5. La regla no conoce proveedores, solo nombres.** `AccountSale` y `AccountReceipt` con el destino `sale` o `account` tienen exactamente los campos que hacen falta. El ADR deja el cambio de nombres a la 22.6, «conservando las propiedades probadas» (D-6).
- **H-6. Lo que falta pagar de una recepción incluye lo imputado desde la cuenta.** Un pago a cuenta, o lo pagado contra una recepción anulada, se reparte de la recepción más vieja a la más nueva. Lo que falta pagar de una recepción depende entonces de toda la cuenta del proveedor en su moneda, como lo que falta cobrar de una venta con cliente. **La pantalla y el tope del pago leen la misma cuenta**, armada por una sola función.
- **H-7. Anular un pago no tiene la comprobación de la anulación del cobro.** `voidReceipt` mira que lo devuelto no supere lo cobrado (`refundsExceedReceipts`), porque un cliente puede tener devoluciones. Un proveedor no las tiene (ADR 0023, punto 1), así que **anular un pago nunca deja la cuenta inconsistente**: solo agranda lo que falta pagar. Le queda la comprobación de la caja, que va al revés que en el cobro: anular un pago en efectivo devuelve plata a lo esperado, así que **lo que mira es el tope de `numeric(14, 2)`**, como `voidRefund`.
- **H-8. La migración es la `0051`.** Suma valores a `document_kind` y `audit_entity_type`, y crea dos tipos nuevos: el destino y el motivo. Un valor nuevo de un enum existente no se usa en la misma transacción (H-2 de la 21.4). Ningún `CHECK` ni trigger de la `0051` usa los valores nuevos de los enums existentes; los tipos nuevos sí se pueden usar, porque nacen enteros en ella (H-7 de la 21.5).
- **H-9. `supplier_payments` apunta a cuatro tablas**: `suppliers`, `goods_receipts`, `payment_methods` y `cash_sessions`. **Quince end-to-end** vacían alguna de ellas con `TRUNCATE` (buscados por archivo entero):
  - `accounts`, `cash`, `goods-receipt-voids` y `goods-receipts`;
  - `order-receipts`, `orders`, `product-fields` y `product-images`;
  - `products`, `purchase-orders`, `receipts` y `refunds`;
  - `sales`, `security-headers` y `suppliers`.

  Las dos tablas nuevas tienen que ir en sus `truncate`, porque si no, falla con `0A000`.
- **H-10. Las guardas que crecen**:
  - `cash-writes` fija las escrituras y sus llamadores, y hoy da por hecho que viven en `cash/repository.ts` y `cash/service.ts` (D-12);
  - `exposed-surface` declara las acciones nuevas;
  - `identity-schema`, `audit`, `numbering` y `cash-schema` fijan listas de tablas, de prefijos y de `entity_type`.
- **H-11. No hay guarda de la dirección de las dependencias entre módulos** (Notion `3f7702be6f4e81119e1ccf0577cb750e`). `module-boundary` y `eslint.config.mjs` solo prohíben entrar a un módulo por fuera de su `index.ts`. El HANDOFF pide que este brief fije cómo se vigila que **`purchasing` no importe `cash`** (D-5).

## Alcance incluido

Con D-1 recomendada:

1. **La migración `0051`**:
   - los valores nuevos de `document_kind` y `audit_entity_type`;
   - los tipos `supplier_payment_target` y `supplier_payment_void_reason`;
   - las tablas `supplier_payments` y `supplier_payment_voids`, con sus triggers y sus privilegios (D-2, D-3, D-4).
2. **Las lecturas de `purchasing` para `cash`** y la guarda de la dirección (D-5).
3. **La cuenta del proveedor en `cash`**, con `imputeAccount` (D-6). Es la función que usan el tope del pago y las pantallas de esta subfase.
4. **El pago, contra una recepción y a cuenta** (D-7), y **su anulación** (D-8), con su auditoría (D-11).
5. **La caja** (D-9): los dos términos de lo esperado; el arqueo; el detalle de la sesión según el rol.
6. **Las pantallas** (D-13):
   - el formulario del pago desde la recepción y desde el proveedor;
   - el comprobante del pago y el de su anulación, imprimibles;
   - la lista de pagos;
   - lo pagado en la recepción;
   - los términos en la caja.
7. **Las pruebas**: el esquema, la regla, el servicio, la caja, la serialización, el aislamiento, las guardas, las pantallas y las mutaciones.
8. **La documentación**: DataModel, el Overview, FunctionalRequirements (FR-COMP-18 en adelante; FR-CAJ-04 a FR-CAJ-06 en vigor), Screens, TraceabilityMatrix y SecurityModel.

## Alcance excluido

- **Con D-1**, pasan a la 22.7 —La cuenta del proveedor—:
  - el estado de cuenta imprimible;
  - el resumen de la cuenta en la ficha del proveedor;
  - la lista de proveedores a los que se les debe.

  La función de la cuenta (D-6) se escribe en esta subfase, porque el tope del pago la necesita.
- **La devolución de plata por el proveedor**, sus notas de crédito y la devolución de mercadería (ADR 0023, punto 1).
- **Los gastos que no son compras de mercadería.**
- **Los vencimientos, los intereses y los recordatorios de deuda.**
- **Las retenciones, las percepciones y los tipos de cambio.**
- **Pagar varias recepciones en un solo comprobante.** Se paga a cuenta, y la regla lo reparte de la más vieja a la más nueva.
- **Las métricas de pagos.**
- **El vaciado de un proveedor** (ADR 0023, punto 14).
- **Cambios en `read-v1`, `read-v2` o `ingestion-v2`**, y cualquier aviso al agente.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0051_*.sql` y `drizzle/meta/*`.
- **`src/modules/cash/`**:
  - `schema.ts`, `imputation.ts` (**solo** comentarios, si D-6 se aprueba como se recomienda), `totals.ts` y su test, `repository.ts`, `service.ts` (**solo** lo que comparte con los pagos, lo esperado y el detalle de la sesión) e `index.ts`;
  - los archivos nuevos de D-12, con sus tests unitarios.
- **`src/modules/purchasing/`**: `index.ts`, `repository.ts` y `goods-receipt-repository.ts`, **solo** las lecturas y el bloqueo de D-5; y un archivo nuevo para ellas.
- `src/modules/numbering/schema.ts` y `service.ts`, **solo** los dos tipos y sus prefijos.
- `src/modules/audit/schema.ts`, **solo** el `entity_type` nuevo.
- **Las pantallas**:
  - `src/app/(autenticado)/compras/`: lo existente que muestra pagos y lo nuevo de D-13;
  - `src/app/(autenticado)/caja/sesiones/` y `caja/cerrar/`, **solo** los términos nuevos y lo que ve cada rol.
- **`tests/integration/`**:
  - nuevos: `supplier-payments.test.ts`, `supplier-payments-schema.test.ts` y `supplier-accounts.test.ts`;
  - `cash.test.ts`, **solo** lo esperado con los términos nuevos;
  - `identity-schema.test.ts`, `audit.test.ts`, `numbering.test.ts` y `cash-schema.test.ts`, **solo** las tablas, los prefijos y el tipo nuevos (H-10);
  - `organization-isolation.test.ts`, **solo** lo de los pagos.
- **`tests/guards/`**:
  - `cash-writes.test.ts` y `exposed-surface.test.ts`, **solo** lo de esta subfase;
  - la guarda nueva de D-5.
- **`tests/e2e/`**: `supplier-payments.spec.ts` (nuevo); y los quince specs de H-9, **solo** las dos tablas nuevas en su `truncate`.
- **La documentación de esta subfase**:
  - en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`;
  - `docs/product/FunctionalRequirements.md` y `Screens.md`.
- **Al aprobarse este brief, con D-1**: una nota fechada en el punto 15 del ADR 0023 y la línea de la 22.7 en el Roadmap.
- **Al cerrar la subfase**: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`.

**No se tocan**:

- los módulos `sales`, `orders`, `crm`, `catalog`, `inventory`, `knowledge`, `conversations` e `ingestion`;
- la escritura de `purchasing`: proveedores, órdenes, recepciones y anulaciones;
- `src/shared/`, `eslint.config.mjs` y `module-boundary`;
- `scripts/`, los seeds, el texto de los ADR (salvo la nota de D-1) y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - la `0043` (`receipts`, `receipts_check_cash_session()`, `cash_reject_closed_session()`) y la `0045` (`receipt_voids_check_copy()`, `refunds`, `refund_voids`);
  - la `0049` (`goods_receipts`) y la `0050` (`goods_receipt_voids`);
  - de `cash/service.ts`: `createSaleReceipt`, `createAccountReceipt`, `voidReceipt`, `createRefund`, `voidRefund`, `readTotalsInput`, `impactedSession`, `exceedsCashLimit` y el detalle de la sesión;
  - `cash/imputation.ts` y `cash/totals.ts`;
  - de `purchasing`: `findSupplier` (`forShare`) y `findGoodsReceipt`;
  - las páginas del cobro (`ventas/[saleId]/cobrar`, `clientes/[clientId]/cobrar`, `cobros/[receiptId]`, `cobros/[receiptId]/anular`) y las de la recepción;
  - la guarda `cash-writes`.
- **Las decisiones**:
  - el [ADR 0023](0023-compras-y-proveedores.md), puntos 2 y 8 a 15, y §Riesgos;
  - el [ADR 0022](0022-cobros-y-caja.md), puntos 2, 4 y 6 a 9;
  - el [ADR 0021](0021-la-venta.md), punto 7, con su precisión del 2026-10-13;
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md);
  - los briefs [21.3](brief-21.3-el-cobro-de-una-venta.md), [21.5](brief-21.5-la-anulacion-y-la-devolucion.md) y [21.6](brief-21.6-la-cuenta-corriente.md).
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Dividir la fila «22.6» (H-1).** **Recomendado**, dos subfases:

| Subfase | Contenido |
|---|---|
| **22.6 — Los pagos a proveedores** | todo lo que escribe plata: las dos tablas, el pago contra una recepción y a cuenta, su anulación, la caja, la función de la cuenta que usa el tope, los comprobantes, la lista de pagos y lo pagado en la recepción |
| **22.7 — La cuenta del proveedor** | solo lecturas, sin migración: el estado de cuenta imprimible, el resumen en la ficha del proveedor y la lista de proveedores a los que se les debe, con su medición |

- **Por qué este corte**: todas las escrituras, con su serialización y sus mutaciones, quedan en una subfase, y la siguiente no toca la base. El tope del pago ya necesita la cuenta entera (H-6), así que la regla se prueba en la 22.6, como la 21.3 escribió la regla entera para la 21.6.
- **Qué cambia en otros documentos**:
  - **el ADR**: una nota fechada en su punto 15, «precisado por decisión del usuario», como la que movió el cierre a mano de la 22.3 a la 22.4. No cambia lo que se crea ni el diseño;
  - **el Roadmap**: la línea de la 22.7;
  - **Notion**: crear la tarea 22.7 en «Esperando», con autorización.

*Alternativa*: todo en la 22.6, como dice el ADR. Es una subfase de unas cinco pantallas nuevas y dos casos de uso con dos destinos cada uno, más la cuenta y su lista, que la 21.6 midió con 5× del volumen.

**D-2. La tabla del pago.** **Recomendada**, `supplier_payments`, con el molde de `receipts`:

- **las columnas**:
  - `id`, `organization_id` y `number`;
  - `target`, del tipo nuevo `supplier_payment_target`, con los valores `goods_receipt` y `account`;
  - `goods_receipt_id`, nulo en un pago a cuenta;
  - **`supplier_id`, siempre presente**: la copia de la recepción, o el de la cuenta;
  - `payment_method_id`;
  - `session_id`, solo si el medio es efectivo;
  - `currency` y `amount`;
  - `created_by` y `created_at`, con `clock_timestamp()`;
- **los únicos**: `UNIQUE (organization_id, number)`, y `UNIQUE (organization_id, id)` para la clave compuesta de la anulación;
- **las claves foráneas**, todas compuestas por `organization_id` y `ON DELETE RESTRICT`:
  - la recepción, contra `goods_receipts_organization_id_id_unique`;
  - el proveedor, contra `suppliers_organization_id_id_unique`. Es la que impide borrar un proveedor con pagos (punto 14);
  - el medio y la sesión;
  - el autor y la organización;
- **los índices**: `(organization_id, supplier_id)`, `(organization_id, goods_receipt_id)` y `(organization_id, session_id)`;
- **los `CHECK`**:
  - el número y el monto, positivos;
  - la moneda, con `^[A-Z]{3}$`;
  - **`supplier_payments_target_check`**: con la recepción, `goods_receipt_id` no nulo; a cuenta, nulo. Usa los literales del tipo nuevo, porque nace en la `0051`;
- **los triggers**, todos reutilizados de la caja, sin funciones nuevas:
  - `cash_reject_change()`: solo inserción;
  - `receipts_check_cash_session()`: la sesión, si y solo si el medio es efectivo;
  - `cash_reject_closed_session()`;
- **los privilegios**: `crm_app` con `SELECT` e `INSERT`.

**La copia del proveedor la asegura el servicio** (H-4), como en el cobro. *Alternativa*: la clave foránea triple de H-4. Exige un `UNIQUE (organization_id, id, supplier_id)` en `goods_receipts`, una tabla de `purchasing`, para servir a `cash`.

**D-3. La tabla de la anulación.** **Recomendada**, `supplier_payment_voids`, con el molde de `receipt_voids`:

- **las columnas**:
  - `id`, `organization_id`, `number` y `supplier_payment_id`;
  - `currency` y `amount`, copiados del pago;
  - `reason`;
  - `session_id`;
  - `created_by` y `created_at`;
- **los únicos**: `UNIQUE (organization_id, number)` y **`UNIQUE (supplier_payment_id)`**;
- **las claves foráneas**, compuestas, hacia el pago y hacia la sesión;
- **los `CHECK`**: el número y el monto, positivos; la moneda;
- **el trigger nuevo `supplier_payment_voids_check_copy()`**, como `receipt_voids_check_copy()`:
  - la moneda y el monto son los del pago;
  - **la sesión es la del pago si esa sesión no tiene cierre, y ninguna si lo tiene o si el pago no fue en efectivo**;
- **los triggers reutilizados**: `cash_reject_change()` y `cash_reject_closed_session()`;
- `crm_app` con `SELECT` e `INSERT`.

Sin proveedor: llega a él por su pago.

**D-4. El motivo de la anulación.** **Recomendada**, la lista cerrada `supplier_payment_void_reason`, con el molde de la del cobro:

| Valor | Etiqueta |
|---|---|
| `not_paid` | «El pago no se hizo» |
| `wrong_method` | «Medio de pago equivocado» |
| `wrong_amount` | «Monto equivocado» |
| `wrong_target` | «Recepción o proveedor equivocados» |
| `other` | «Otro» |

Un valor nuevo se suma con un `ALTER TYPE` aditivo.

**D-5. Lo que `purchasing` le da a `cash`, y la guarda de la dirección (H-11).** **Recomendado**:

- **en un archivo nuevo de `purchasing`, exportado por su `index.ts`**, tres funciones que reciben la transacción de `cash`, como `getSaleForReceipt` de `sales`:
  - **`lockSupplierForPayment(tx, organizationId, supplierId)`**: `findSupplier` con `forShare`. Devuelve `active`, `inactive` o `not_found`;
  - **`getGoodsReceiptForPayment(tx, organizationId, receiptId)`**: id, número, proveedor, moneda, total, fecha de emisión y si está anulada, con el número de su anulación;
  - **`listSupplierGoodsReceiptsForAccount(tx, organizationId, supplierId)`**: las recepciones del proveedor, anuladas incluidas, con los mismos campos;
- **sin `authorize`**: las llama `cash` después de su propio `authorize(admin)`, como las de `sales`;
- **ninguna escribe**, y ninguna toma el bloqueo `cash:`;
- **la guarda nueva `tests/guards/purchasing-dependencies.test.ts`**, con un caso en rojo por regla:
  - lee los `import` de `src/modules/purchasing/**`, y solo admite `catalog`, `inventory`, `numbering`, `organizations`, `audit`, el esquema de `auth` y `src/shared`;
  - entre los módulos, **solo `cash` importa `purchasing`**.

  Es una guarda acotada a la dirección que esta fase fija, y no sustituye la tarea general.

*Precisado el 2026-10-17 en la 22.7* ([brief-22.7](brief-22.7-la-cuenta-del-proveedor.md), H-2 y D-3; autorizado por el usuario por R2 de su revisión): **`cash` usa cuatro lecturas de `purchasing`, más `getSupplierNames`**.

- La cuarta es `listGoodsReceiptsForAccounts(tx, organizationId)`, las recepciones de toda la organización, para la lista de proveedores a los que se les debe.
- Las tres que dan recepciones traen también `voidedAt`, la fecha de la anulación.
- `getSupplierNames` la llamaban solo las pantallas (§Resultados, desvíos) y desde la 22.7 la llama también `cash`.

La guarda fija la dirección, no la lista de funciones. Desde la 22.7 fija además, por texto, que las lecturas de la cuenta del proveedor sin bloqueo leen en una sola foto.

*Alternativa*: comprobarlo con `grep` en §Resultados, como de la 22.2 a la 22.5. Desde ahora hay una dependencia real, y un import de `cash` en `purchasing` cerraría un ciclo que nada detectaría.

**D-6. La cuenta del proveedor (H-5, H-6).** **Recomendado**:

- **`imputeAccount` no cambia, ni de regla ni de nombres.** Una función de `cash` arma su entrada desde las lecturas de D-5 y los pagos vigentes del proveedor:
  - cada recepción va como una venta, con `id`, `number`, `currency`, `total`, `issuedAt` (su `created_at`) y `voided`;
  - cada pago contra una recepción va como un cobro contra una venta;
  - cada pago a cuenta va como un cobro a cuenta;
  - las señas y las devoluciones van vacías;
- **una sola función**, `supplierLedger`, arma la cuenta para el tope del pago, la vista previa, lo pagado en la recepción y, en la 22.7, el estado de cuenta y la lista. Con eso, la pantalla y el tope no pueden contradecirse;
- **lo que falta pagar de una recepción vigente** es su `outstanding` en la cuenta;
- **lo que estaba pagado de una anulada** pasa a la cuenta: «Pagado: $ X — pasó a la cuenta del proveedor»;
- **un comentario en `imputation.ts`** dice que la regla también sirve a los proveedores, y con qué correspondencia.

*Alternativa*: renombrar los tipos a nombres neutros (`AccountDocument`, `AccountPayment`). Toca `imputation.ts`, su test de 618 líneas y la cuenta de clientes por un cambio de nombres, sin cambiar ninguna conducta.

**D-7. El pago.** **Recomendado**, `createSupplierPayment(context, input)`, con el destino en el input, y el orden del ADR 0022, punto 4.

**Contra una recepción**:

1. `admin`. Se validan los ids, el medio y el monto (`VALIDATION_ERROR`, con los campos);
2. **el bloqueo `cash:`** de la organización;
3. la recepción, por `getGoodsReceiptForPayment` (`NOT_FOUND` si no es de la organización);
4. **su proveedor, con `lockSupplierForPayment`**, en modo compartido: el `INSERT` lo toma por la clave foránea, y una edición del proveedor no puede dejarlo esperando con el contador tomado (ADR 0021, punto 7). Lo que devuelve no se mira: un proveedor desactivado se paga;
5. **la comprobación**, toda con los bloqueos tomados:
   - la recepción no está anulada (`goods_receipt_voided`);
   - el medio existe y está activo, y si es efectivo, hay una sesión abierta (`readPayment`);
   - **el monto no supera lo que falta** (`exceeds_outstanding`, con lo que falta);
   - **en efectivo, lo esperado de su moneda menos el monto no queda por debajo de cero** (`insufficient_cash`, con lo esperado);
6. **al final**, el contador `supplier_payment`, el pago con el proveedor y la moneda de la recepción, y la auditoría.

**A cuenta**: igual, con el proveedor en el paso 3, por `lockSupplierForPayment` (`NOT_FOUND` si no existe), la moneda elegida de `acceptedCurrencies()` y **sin el tope de lo que falta**.

**Los rechazos son como en los cobros**: van antes del contador y no escriben nada. **Toda escritura y toda lectura por id filtra por `organization_id`.**

**La recepción que se anula en paralelo** (punto 10) no se serializa. Si el pago leyó la recepción vigente y la anulación entra antes de que el pago confirme, el pago queda contra una recepción anulada, y la regla pasa su monto al remanente de la cuenta. AC-4 lo prueba en los dos órdenes.

**D-8. La anulación del pago (H-7).** **Recomendada**, `voidSupplierPayment(context, paymentId, reason)`, con el molde de `voidRefund`:

1. `admin`; el id y el motivo se validan;
2. el bloqueo `cash:`;
3. el pago y su anulación, si la tiene, leídos con el bloqueo tomado (`NOT_FOUND`; `already_voided`, con el número);
4. **la sesión que impacta**, con `impactedSession`: la del pago si sigue abierta, o ninguna;
5. **con sesión, lo esperado más el monto tiene que caber en `numeric(14, 2)`** (`VALIDATION_ERROR`, `amount: "limit"`), como `voidRefund`;
6. el contador `supplier_payment_void`, la anulación y la auditoría.

**Sin comprobación de la cuenta**: anular un pago solo agranda lo que falta pagar. El `UNIQUE` es la última defensa: un `23505` en `supplier_payment_voids_supplier_payment_unique` se rescata como `already_voided`.

**D-9. La caja (H-2, H-3).** **Recomendado**:

- **`computeCashTotals`** suma dos términos, `supplierPayments` y `supplierPaymentVoids`, con la fórmula del punto 8. **`readTotalsInput`** suma dos lecturas: los pagos en efectivo de la sesión, y las anulaciones de pagos cuya sesión es esa. Todo lo que lee lo esperado los ve sin otro cambio (H-2);
- **el arqueo** (detalle e impresión), por moneda: «Pagos a proveedores» y «Pagos a proveedores anulados», **para los dos roles** (punto 12);
- **el detalle de la sesión**:
  - **solo para un `admin`**, la lista de los pagos en efectivo de la sesión, con su número enlazado y su proveedor;
  - y las anulaciones de pagos posteriores al cierre, en `lateVoids`;
  - **un `viewer` no recibe esas filas**: el servicio las omite, no solo la página;
- **el cierre**: una moneda con un pago en efectivo se cuenta, como las de los cobros (FR-CAJ-05). Sale de las filas de `computeCashTotals`, sin cambio propio.

**D-10. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`**: a un `viewer`, en todo pago, toda anulación y toda lectura de pagos;
- **`VALIDATION_ERROR`**:
  - los campos `target`, `paymentMethod`, `amount` y `currency`, con el motivo del monto (`required`, el de `parseCashAmount` o `limit`);
  - los ids que no son uuid;
  - el motivo de la anulación;
- **`NOT_FOUND`**: `goods_receipt`, `supplier`, `payment_method` o `supplier_payment`;
- **`BUSINESS_RULE_VIOLATION`**:
  - `goods_receipt_voided`;
  - `exceeds_outstanding`, con la moneda y lo que falta;
  - `payment_method_inactive` y `no_open_session`;
  - `insufficient_cash`, con la moneda y lo esperado;
  - `already_voided`, con el número de la anulación;
- **al escribir**: el id y el número del pago o de la anulación.

**Ningún rechazo escribe, audita ni consume número.**

**D-11. La auditoría.** **Recomendada**, con el `entity_type` `supplier_payment`, como el cobro, sin datos del proveedor:

- **`create`**, con:
  - el número;
  - el destino: `goods_receipt_number`, o `target: "account"` con `supplier_id`;
  - el nombre del medio, la moneda y el monto;
  - si es efectivo, `session_number`;
- **`void`** sobre el pago, con `before: { void_number: null, reason: null }` y `after: { void_number, reason }`. Si impactó en una sesión, también `session_number`.

**D-12. Dónde vive el código (H-10).** **Recomendado**:

- **los casos de uso**, en `cash/supplier-payments.ts`;
- **las escrituras y sus lecturas**, en `cash/supplier-payment-repository.ts`. `service.ts` ya tiene 4.148 líneas;
- **lo que comparten con los cobros** (`lockCash`, `readPayment`, `readTotals`, `impactedSession`, `exceedsCashLimit`) se exporta dentro del módulo, sin pasar por `index.ts` y sin copiarlo;
- **`cash-writes`** pasa a leer también los dos archivos nuevos, y fija:
  - `insertSupplierPayment`, que llama solo `createSupplierPayment`;
  - `insertSupplierPaymentVoid`, que llama solo `voidSupplierPayment`;
  - y su caso en rojo.

*Alternativa*: todo en `service.ts` y `repository.ts`, sin cambiar la forma de la guarda.

**D-13. Las pantallas.** **Recomendadas**, con el molde de los cobros y la sección «Compras»:

- **en el detalle de la recepción** (pantalla 48), para un `admin`:
  - «Pagado», «Falta pagar» y la lista de sus pagos, con la marca «Anulado»;
  - en una vigente con algo que falta, «Registrar un pago»;
  - **en una anulada**, lo que pasó a la cuenta del proveedor;
- **`/compras/recepciones/[receiptId]/pagar`** (pantalla nueva 50, el pago de una recepción): el proveedor, lo que falta, el medio, y el monto propuesto en lo que falta. En efectivo, la sesión abierta. Funciona sin JavaScript;
- **`/compras/proveedores/[supplierId]/pagar`** (pantalla nueva 51, el pago a cuenta):
  - por moneda, lo que se le debe y lo que está a favor, de la misma cuenta;
  - la moneda propuesta es la de la recepción con saldo más vieja;
  - el aviso de que lo que exceda queda a favor del negocio;
  - en la ficha del proveedor (pantalla 42), el botón «Pago a cuenta»;
- **`/compras/pagos`** (pantalla nueva 52, la lista):
  - el número, la fecha, el proveedor, el destino, el medio y el monto, y la marca «Anulado»;
  - los filtros de estado (todos, vigentes o anulados) y de proveedor;
  - la búsqueda por `PP-000001` o `APP-000001`;
  - en el submenú de «Compras», «Pagos»;
- **`/compras/pagos/[paymentId]`** (pantalla nueva 53, el comprobante **imprimible**):
  - la organización, el número, la fecha y el autor;
  - el proveedor y el destino enlazado;
  - el medio, la sesión si la hay, el monto y la leyenda;
  - para uno vigente, «Anular el pago» lleva a `?confirmar=anular`, con el motivo y lo que pasa con la caja: «vuelve a la sesión abierta C-000012», o «la sesión ya cerró: la caja no cambia»;
- **`/compras/pagos/[paymentId]/anulacion`** (pantalla nueva 54): el comprobante imprimible de la anulación;
- **la caja**: los términos de D-9 en el detalle, la impresión y la vista previa del cierre;
- **un `viewer`** que entra por la URL a cualquiera de estas páginas ve el aviso de página prohibida.

**D-14. El rendimiento.** **Recomendado**, en local, contra el umbral de 754 ms de la 13.2:

- **el proveedor de la medición**: 2.000 recepciones (200 anuladas) y 3.000 pagos (300 anulados), en dos monedas;
- **lo que se mide**:
  - el detalle de una de sus recepciones, con lo pagado;
  - el formulario del pago a cuenta;
  - el pago mismo;
  - la lista de pagos con 10.000 en la organización, con cada filtro y la búsqueda por número;
  - el detalle de una sesión con 500 pagos en efectivo;
- **los índices de D-2** sirven a la cuenta y a la sesión.

**D-15. Los end-to-end de H-9.** **Recomendado**: sumar `supplier_payment_voids, supplier_payments` al `truncate` de los quince, delante de las tablas a las que apuntan, sin otro cambio.

**D-16. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, los ADR 0022 y 0023 y las reglas vigentes. Es la primera salida de plata hacia un tercero, cambia lo esperado de toda la caja, y estrena la dependencia de `cash` hacia `purchasing`.

**D-17. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0051`. El paso 3 corre en modo manual.

**Volver a `49db51c` no es limpio** si ya hay pagos: ese código no conoce `supplier_payments`, así que lo esperado de una sesión con pagos en efectivo saldría más alto que la plata en la caja. Con un pago en efectivo registrado, volver atrás necesita cerrar antes esa sesión.

El recorrido, en Demostración Vixora:

1. pagar en parte una recepción vigente, por transferencia: ver el comprobante `PP-000001`, imprimirlo, y ver lo pagado y lo que falta en la recepción;
2. abrir la caja y pagar en efectivo el resto: ver el término en el arqueo y lo esperado más bajo;
3. intentar pagar más de lo que falta, y pagar en efectivo más de lo que hay en la caja: ver los dos rechazos;
4. hacer un pago a cuenta mayor que la deuda de una moneda: ver lo que queda a favor, y ver que se imputa a la recepción más vieja con saldo;
5. anular el pago en efectivo con la sesión abierta: ver `APP-000001`, el término en la caja y lo que vuelve a faltar en la recepción;
6. anular una recepción pagada (22.5) y ver que su pago pasa a la cuenta;
7. entrar con un `viewer`: ve en la sesión el total de pagos a proveedores, sin la lista, y no ve «Compras».

## Invariantes

1. Un pago o una anulación nunca cambian ni se borran. `crm_app` no tiene `UPDATE` ni `DELETE` sobre ellos.
2. **Un pago tiene exactamente un destino**, y su proveedor es el de su recepción o el de su cuenta.
3. **Un pago contra una recepción nunca supera lo que le falta pagar** al momento de registrarlo, y nunca va contra una recepción anulada al leerla.
4. **Un pago se anula a lo sumo una vez**, entero, con su moneda y su monto copiados.
5. **Lo esperado de una sesión nunca queda por debajo de cero ni fuera de `numeric(14, 2)`**, y una sesión cerrada no cambia.
6. **Ningún monto se pierde ni se cuenta dos veces** en la cuenta del proveedor: el haber es la suma de los pagos vigentes, también los que van contra una recepción anulada.
7. Los números `PP` y `APP` no tienen huecos por organización, y un rechazo no consume número ni escribe nada.
8. Ninguna escritura ni lectura por id alcanza a otra organización.
9. **Solo un `admin` lee o escribe pagos.** Un `viewer` ve solo los totales del arqueo. Ninguna lectura del agente los incluye.
10. **`purchasing` no importa `cash`**, ni ningún otro módulo fuera de su lista; **solo `cash` importa `purchasing`**. `purchasing` nunca toma el bloqueo `cash:`.
11. `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la `0051` suma los valores de enum, los dos tipos y las dos tablas. En `supplier-payments-schema.test.ts`, con el rol dueño, se prueban:
  - los privilegios de D-2 y D-3;
  - cada `CHECK`, incluido el destino en sus cuatro combinaciones;
  - los únicos;
  - cada clave compuesta, con una fila de otra organización;
  - **los triggers**: rechazan `UPDATE` y `DELETE`; exigen la sesión si y solo si el medio es efectivo; rechazan una sesión cerrada; y en la anulación, rechazan una moneda, un monto o una sesión distintos de los del pago.
- **AC-2 (la cuenta)**: `supplier-accounts.test.ts` prueba, con la cuenta de un proveedor en dos monedas:
  - lo que falta de cada recepción;
  - el remanente de un pago a cuenta, imputado de la más vieja a la más nueva;
  - lo pagado contra una recepción anulada, que pasa al remanente;
  - un pago anulado, que no cuenta.

  El haber es siempre la suma de los pagos vigentes. Los tests de `imputation.test.ts` pasan sin cambios.
- **AC-3 (operación)**:
  - un pago contra una recepción y uno a cuenta, cada uno por transferencia y en efectivo, escriben el pago con `PP`, el proveedor y la moneda correctos, la sesión solo si es efectivo, y la auditoría de D-11;
  - un pago a un proveedor desactivado entra;
  - la anulación escribe `APP` con la sesión de D-8, y lo que falta vuelve a crecer;
  - la lista filtra por estado y por proveedor, y busca por los dos números.
- **AC-4 (caja)**: lo esperado incluye los dos términos en el detalle, la impresión, la vista previa y el cierre. Un pago en efectivo baja lo esperado, y anularlo con la sesión abierta lo repone; con la sesión cerrada, no toca ninguna. **Un retiro, una devolución y la anulación de un cobro posteriores a un pago en efectivo ven lo esperado ya descontado**, y rechazan con `insufficient_cash` si no alcanza (H-2).
- **AC-5 (serialización)**, cada escenario con su mutación:
  - **dos pagos a la misma recepción** con lo justo: uno entra y el otro responde `exceeds_outstanding`. Sin el bloqueo `cash:`, entran los dos;
  - **un pago en efectivo contra un retiro**, con lo justo en la caja: uno entra y el otro responde `insufficient_cash`. Lo esperado nunca queda negativo;
  - **un pago contra la anulación de su recepción**, en los dos órdenes de llegada: los dos entran, o el pago responde `goods_receipt_voided`. Nunca se pierde ni se cuenta dos veces: el haber es la suma de los pagos vigentes (invariante 6);
  - **un pago que espera al proveedor**, tomado `FOR UPDATE` por una tercera conexión, **no tiene tomado el contador**: la tercera conexión lo toma con `NOWAIT`. Con el contador antes del bloqueo del proveedor, el `NOWAIT` falla;
  - **dos anulaciones del mismo pago**: una entra y la otra `already_voided`;
  - **la anulación de un pago en efectivo contra el cierre de su sesión**: si el cierre entra primero, la anulación no impacta en ninguna sesión; si entra la anulación, el cierre la cuenta en lo esperado.
- **AC-6 (rechazos)**: cada respuesta de D-10, **sin escribir, auditar ni consumir número**. Un `viewer` recibe `FORBIDDEN`. El detalle de una sesión, leído por un `viewer`, no trae pagos ni anulaciones de pagos, y sí sus totales.
- **AC-7 (aislamiento)**: `organization-isolation` prueba que el pago, la anulación, sus lecturas, la lista y la cuenta no alcanzan a otra organización. Se prueba también con una recepción y un proveedor de otra organización como destino.
- **AC-8 (rendimiento)**: las mediciones de D-14, en §Resultados.
- **AC-9 (pantallas)**: un end-to-end sobre `next start`:
  - **un `admin`**, con teclado y sin JavaScript donde el formulario lo permite:
    - paga en parte una recepción y ve lo que falta; la paga en efectivo y ve el arqueo;
    - ve los dos rechazos;
    - paga a cuenta y ve el remanente imputado;
    - anula un pago y ve los dos comprobantes y su impresión;
    - filtra y busca en la lista;
  - **un `viewer`** ve en la sesión los totales sin la lista, y el aviso en cada página de pagos;
  - **axe** sin violaciones en claro y en oscuro, también en las vistas de impresión.
- **AC-10 (guardas)**:
  - `cash-writes` fija las dos escrituras y sus llamadores, con su caso en rojo;
  - la guarda de D-5 fija las dos reglas, con un caso en rojo por regla;
  - `exposed-surface` declara las acciones nuevas.
- **AC-11 (fronteras)**:
  - `cash` importa de `purchasing` solo las tres funciones de D-5, más su esquema en `schema.ts`;
  - `purchasing` no importa `cash`;
  - de los módulos existentes, solo `cash`, `purchasing`, `numbering` y `audit` están en el diff, en lo autorizado.
- **AC-12 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-13**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-14**: la documentación del punto 8 del alcance queda actualizada, sin reescribir ninguna decisión anterior. Con D-1, también la nota fechada del ADR 0023, punto 15, y la línea de la 22.7 en el Roadmap.
- **AC-15** (si D-17): producción corre el SHA del cierre con la `0051`. El recorrido de D-17 se concilia contra la base:
  - los pagos y sus anulaciones, con su sesión;
  - lo esperado y lo contado de las sesiones del recorrido;
  - lo que falta de cada recepción, recalculado con la regla;
  - la auditoría y los contadores `supplier_payment` y `supplier_payment_void`.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-8, AC-10 a AC-12, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-9 (UI ↔ servicio ↔ base) y AC-12.
- `isolated-runtime`: AC-15, si se despliega.
- **Las mutaciones** se corren y se revierten una por una. Cada «detectada» se valida por el caso que cae y por qué cae, y el resultado va a §Resultados. Como mínimo:
  - el pago sin el bloqueo `cash:`;
  - sin el bloqueo del proveedor, o con el contador antes de él;
  - sin el tope de lo que falta;
  - sin mirar si la recepción está anulada;
  - sin comprobar lo esperado en un pago en efectivo;
  - lo esperado sin uno de los dos términos, por separado;
  - la anulación con la sesión del pago aunque esté cerrada;
  - la anulación sin el tope de `numeric(14, 2)`;
  - el pago con el proveedor de la entrada en vez del de la recepción;
  - una escritura o una lectura por id sin `organization_id`;
  - un `viewer` que paga, o que recibe la lista de pagos de una sesión;
  - un import de `cash` en `purchasing`, contra la guarda de D-5.
- **Las claves compuestas y los triggers** se prueban contra la base con el rol dueño.
- **La serialización**: cada escenario de AC-5 con su mutación. Cuando hay dos órdenes de llegada, se prueban los dos: cada uno prueba solo la comprobación del que llega segundo (lección de la 22.5).
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end. Los archivos nuevos van al índice con `git add -N` antes de la batería final, y el end-to-end va en dos mitades si la máquina no alcanza.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial `sales`, `orders`, `crm`, `catalog`, `inventory`, la escritura de `purchasing`, `src/shared/` o los contratos del agente;
- `purchasing` tendría que importar `cash`, o tomar el bloqueo `cash:`;
- hiciera falta cambiar `imputeAccount` o su regla, o una regla que no sea la misma para clientes y proveedores;
- el diseño exigiría cambiar el texto de un ADR, salvo la nota de D-1;
- un pago o una anulación pudieran editarse o borrarse;
- un pago pudiera superar lo que falta, ir contra una recepción anulada leída como tal, o anularse dos veces;
- lo esperado de una sesión pudiera quedar negativo, o cambiar una sesión cerrada;
- un monto de la cuenta pudiera perderse o contarse dos veces;
- un rechazo escribe, audita o consume número;
- aparece una vía por la que un `viewer` vea un pago, un proveedor o un costo fuera de los totales del arqueo, o el agente lea algo de pagos;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- crear la tarea 22.7 o pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.

## Situación en la fase

- **Necesario ahora**: todo lo de §Alcance incluido.
- **Antes de dar la fase por cerrada**:
  - la 22.7, con D-1;
  - el cierre de la Fase 22, con su Knowledge Capture de fase.
- **Mejora posterior, sin fase**:
  - la devolución de plata por el proveedor;
  - los vencimientos;
  - pagar varias recepciones en un solo comprobante con un reparto elegido;
  - las métricas de compras;
  - el vaciado de un proveedor;
  - la guarda general de dependencias entre módulos.

## Resultados — 2026-10-16 (autoevaluación)

Implementado el 2026-10-16. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Tres desvíos de lo autorizado**, más la salvedad de AC-8, **aceptados por el usuario el 2026-10-16** («acepto los desvios»). El primero es una condición de detención y no se detuvo a tiempo; los otros dos los encontró la revisión independiente (R3 y R4):

- se modificaron `src/app/(autenticado)/caja/page.tsx` (la pantalla 21, la caja abierta) y `caja/session-tables.tsx` (las tablas que comparten la 21 y la 26). La lista autoriza solo `caja/sesiones/` y `caja/cerrar/`, pero D-13 y el punto 6 del alcance piden «los términos en la caja», y la pantalla 21 muestra lo esperado de la sesión abierta con las mismas tablas. El cambio es solo la columna «Pagos a proveedores», la lista de pagos en efectivo para un `admin` y los nombres de los proveedores por `getSupplierNames`. `caja/cerrar/` no cambió, porque solo muestra lo esperado.
- **`purchasing` suma una cuarta lectura que D-5 no enumera**: `getSupplierNames` (`payment-reads.ts`, con `findSupplierNames` en `repository.ts`), solo de `admin` y filtrada por organización, para los nombres de los proveedores en la lista de pagos de la caja. La llaman las páginas de la caja, no `cash`.
- **El arqueo muestra una columna neta y no los dos términos de D-9**: «Pagos a proveedores» es lo pagado menos lo anulado en la sesión, y aparece solo si la sesión tuvo alguno. Sigue el molde de «Cobros» y «Devoluciones», que la tabla ya mostraba netas de sus anulaciones desde la 21.5. Lo esperado sí suma los dos términos por separado (`totals.ts`). FR-CAJ-06 y Screens describen lo que hace el código.

**Precisiones que no cambian una decisión:**

- **El servicio vive en archivos nuevos de `cash`**: `supplier-payments.ts`, `supplier-payment-repository.ts` y `supplier-payment-views.ts`. `service.ts` exporta, solo dentro del módulo, lo que comparte con los cobros: el bloqueo, lo esperado, `readPayment`, `impactedSession` y los tipos de rechazo.
- **Los rechazos dentro de la transacción se devuelven**, como en los cobros, antes del contador: ninguno escribe, audita ni consume número (AC-6).
- **El rescate del `UNIQUE` de la anulación** (`supplier_payment_voids_supplier_payment_unique`) se hace fuera de la transacción, con `isSupplierPaymentAlreadyVoided`.
- **`ON DELETE RESTRICT` responde 23001, no 23503**: el test del esquema espera ese código.
- **Los 15 specs end-to-end de H-9** suman `supplier_payment_voids, supplier_payments` a su `truncate`.
- **`cash.test.ts`** suma los dos términos en cero a la foto de la apertura, dentro de lo autorizado.
- **El test de rendimiento lleva el contador de a uno** hasta el último número sembrado, porque `document_counters_guard_change` no deja nacer un contador en otro número que 0 ni sumar más de 1.
- **Los archivos nuevos entraron al índice con `git add -N`**, porque `exposed-surface` lee `git ls-files`.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `supplier-payments-schema.test.ts`, 24 casos con el rol dueño: los privilegios, cada `CHECK` con el destino en sus cuatro combinaciones, los únicos, cada clave compuesta con una fila de otra organización (las de la sesión, en las dos tablas, se sumaron por R1), y los triggers: sin `UPDATE` ni `DELETE`, la sesión si y solo si el medio es efectivo, la sesión cerrada, y la copia de moneda, monto y sesión en la anulación (`supplier_payment_voids_check_copy()`) |
| AC-2 | cumplido | `supplier-accounts.test.ts`, 5 casos en dos monedas: lo que falta de cada recepción, el remanente de la más vieja a la más nueva, lo pagado contra una anulada que pasa al remanente, el pago anulado que no cuenta y la moneda propuesta. `imputation.test.ts` pasa sin cambios |
| AC-3 | cumplido | `supplier-payments.test.ts`: el pago contra una recepción y a cuenta, por transferencia y en efectivo, con `PP`, el proveedor y la moneda de la recepción aunque la entrada traiga otros, la sesión solo en efectivo y la auditoría; el proveedor desactivado; la anulación con `APP` y la sesión de D-8; la lista por estado, por proveedor y por los dos números |
| AC-4 | cumplido | `totals.test.ts` (los dos términos y una moneda solo con pagos) y `supplier-payments.test.ts`: lo esperado más bajo, repuesto con la sesión abierta, sin tocar ninguna con la sesión cerrada; la vista previa y el cierre; y **un retiro, una devolución y la anulación de un cobro posteriores** a un pago en efectivo, que ven lo esperado descontado y responden `insufficient_cash`. Los dos últimos casos faltaban y se sumaron al escribir esta sección |
| AC-5 | cumplido | `supplier-payments.test.ts`, los seis escenarios; el del pago contra la anulación de su recepción, en las dos ventanas (el proveedor tomado y el contador tomado). Mutaciones abajo |
| AC-6 | cumplido | «cada rechazo no escribe, no audita ni consume número», con `payment_method_inactive` y el proveedor que no es uuid sumados por R2, y su par de la anulación; `FORBIDDEN` para un `viewer`; el detalle de la sesión para un `viewer`, con los totales y sin pagos ni anulaciones |
| AC-7 | cumplido | `organization-isolation.test.ts`: el pago, la anulación, sus lecturas, la lista y la cuenta, con una recepción y un proveedor de otra organización como destino |
| AC-8 | cumplido, con una salvedad | en local, con un proveedor de 2.000 recepciones (200 anuladas) y 3.000 pagos (300 anulados), 10.000 pagos en la organización y una sesión con 500 pagos en efectivo, 250 de ellos contra recepciones distintas: lo pagado de una recepción, 103,1 ms; su formulario, 93,3 ms; el formulario a cuenta, 132,8 ms; el pago a cuenta, 38,9 ms; el pago contra una recepción, 127,0 ms; la lista en sus seis variantes, de 7,7 a 18,3 ms; **el detalle de la sesión, 566,2 ms**. El umbral es de 754 ms. La primera medición, 34,3 ms, tenía solo pagos a cuenta en la sesión y no medía la lectura del número de cada recepción, que se hace una por una (R4 de la revisión). Bajarla pide una lectura en lote en `purchasing`, una función más que D-5 no autoriza: el usuario la aceptó así el 2026-10-16 |
| AC-9 | cumplido | `supplier-payments.spec.ts`, 7 casos sobre `next start`: el pago en parte con el teclado y su comprobante impreso; el efectivo y el arqueo, con los dos rechazos; el pago a cuenta imputado; la anulación con los dos comprobantes; la lista filtrada y buscada; el `viewer`; y el pago sin JavaScript. axe sin violaciones en claro y en oscuro, también en impresión |
| AC-10 | cumplido | `cash-writes` fija `insertSupplierPayment` e `insertSupplierPaymentVoid` y sus llamadores; `purchasing-dependencies.test.ts`, la guarda de D-5, con las dos reglas y un caso en rojo por regla; `exposed-surface` declara las dos acciones |
| AC-11 | cumplido | `cash` importa de `purchasing` las tres funciones de D-5 y su esquema en `schema.ts`. Las pantallas de la caja importan además `getSupplierNames`, declarada arriba como desvío. `purchasing` no importa `cash` (M17). De los módulos existentes, solo `cash`, `purchasing`, `numbering` y `audit` están en el diff |
| AC-12 | cumplido | `read-api`, `read-api-v2` e `ingestion-v2` pasan en la integración completa sin cambios |
| AC-13 | pendiente | la batería local, abajo. Falta la CI del SHA del cierre, al hacer el commit |
| AC-14 | cumplido | DataModel, Overview, FunctionalRequirements (FR-COMP-18 a 22, y FR-CAJ-04 a 06 implementados), Screens (50 a 54, y notas en 21, 26, 42 y 48), TraceabilityMatrix y SecurityModel (161 puntos de entrada). La nota del ADR 0023 y la línea de la 22.7 entraron con `68c60e5` |
| AC-15 | pendiente | si se autoriza el despliegue |

### Mutaciones

Corridas una por una con un script que aplica el cambio, verifica que aparezca una sola vez, corre los casos que deberían atraparlo y restaura el archivo. Las 17 quedaron detectadas:

- **M1**, el pago sin el bloqueo `cash:`: los dos pagos con lo justo entran.
- **M2**, sin el `FOR SHARE` del proveedor, y **M3**, el contador antes de él: cae «la recepción se anula mientras el pago espera el proveedor» y, en M3, el `NOWAIT` sobre `document_counters`.
- **M4**, sin el tope de lo que falta: «el tope es lo que falta según la cuenta entera».
- **M5**, sin mirar si la recepción está anulada: tres casos, entre ellos los rechazos y la carrera con la anulación.
- **M6**, sin la segunda lectura con el proveedor tomado: la carrera con la anulación.
- **M7**, sin comprobar lo esperado en efectivo: los rechazos.
- **M8** y **M9**, lo esperado sin cada término, por separado: 10 y 2 casos de integración, y 2 unitarios cada una.
- **M10**, la anulación con la sesión aunque esté cerrada: la sesión cerrada y la anulación contra el cierre, con el cierre primero.
- **M11**, la anulación sin el tope de `numeric(14, 2)`: su caso.
- **M12**, el proveedor de la entrada: su caso (punto 8).
- **M13**, la lectura por id sin `organization_id`: el aislamiento.
- **M14**, un `viewer` que paga, y **M15**, un `viewer` que recibe la lista de una sesión: sus casos.
- **M16**, la anulación sin el bloqueo `cash:`: las dos anulaciones y la anulación contra el cierre, en los dos órdenes.
- **M17**, un import de `cash` en `purchasing`: la guarda de D-5.

No se mutó una escritura sin `organization_id`: las inserciones toman la organización del contexto, y las claves compuestas de AC-1 rechazan una fila cruzada.

### La batería local

Desde Git Bash, sin nada en paralelo:

- typecheck y build pasan; 859 unitarios y 706 guardas pasan;
- el formato y el lint fallaron en la primera corrida por el bloque de rendimiento recién agregado y un import sin usar; corregidos, pasan;
- integración, 1.522 de 1.524 en la primera corrida. Falló `cash.test.ts` («abre C-000001»), cuya foto de lo esperado no tenía los dos términos nuevos: corregido. Falló `organization-bootstrap.test.ts` por timeout a los 30,5 s con la suite entera, la misma falla por carga de la 21.6 y la 22.5. Después de corregir, `cash.test.ts`, `supplier-payments.test.ts` (con los dos casos nuevos de AC-4) y `organization-bootstrap.test.ts`, solos: 67 de 67;
- end-to-end, 222 de 223 en una sola corrida. Falló el caso 10 de `clients.spec.ts` con `Connection terminated due to connection timeout` contra la base; corrido solo junto con `supplier-payments.spec.ts`, 25 de 25;
- después de la revisión, `supplier-payments.test.ts` y `supplier-payments-schema.test.ts`, 52 de 52.

## Revisión independiente — 2026-10-16

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, los ADR 0022 y 0023 y las reglas vigentes. No ejecutó nada ni pudo leer el diff. Encontró **6 hallazgos: ninguno crítico ni mayor, cuatro menores y dos notas**, más tres notas de estado documental. Cada uno se verificó contra el código antes de aceptarlo.

- **R1 (menor), corregido**: AC-1 decía «las claves compuestas con filas de otra organización», y ningún test probaba la sesión de otra organización. Se sumaron los dos casos; el de la anulación apaga la copia dentro de una transacción que se revierte, porque el trigger rechaza antes una sesión distinta de la del pago.
- **R2 (menor), corregido**: AC-6 no probaba `payment_method_inactive` ni el proveedor que no es uuid. Se sumaron a la lista de rechazos, con la misma foto.
- **R3 (menor), declarado**: `getSupplierNames` es una lectura de `purchasing` que D-5 no enumera y que §Resultados contaba como precisión. Pasó a los desvíos, arriba.
- **R4 (menor), declarado y medido**: el arqueo muestra la columna neta en vez de los dos términos de D-9, sin declararlo. Pasó a los desvíos. La salvedad de la medición era cierta: con pagos contra recepciones en la sesión, el detalle tarda 566,2 ms (AC-8).
- **N1 (nota), ya declarado**: el tercer archivo nuevo de `cash` y `caja/cerrar/` sin cambios.
- **N2 (nota), aceptado sin cambio**: el trigger reutilizado `receipts_check_cash_session()` dice «cobro» también cuando rechaza un pago, porque es la función de la `0043` sin cambios. Las tres lecturas de D-5 salen sin `authorize` porque toman la transacción de quien llama, como `getSaleForReceipt`; hoy solo las usa `cash`, y la guarda de D-5 fija quién importa `purchasing`.
- **Estado documental**: DataModel tenía dos líneas viejas. La de `payments` lleva ahora una precisión fechada, y la de la 22.5, su «Implementada». `HANDOFF.md` se actualiza al cerrar. La frase de FR-COMP sobre la 22.7 sigue siendo cierta.
- **Lo inferido por el revisor, verificado**: el diff de `service.ts` en los cobros es solo agregar `export` a `expectedIn` y a `insufficientCash`, sin cambiar ningún caso de uso.

## Cierre de la subfase 22.6, 2026-10-17

Cierra el 2026-10-17, después del recorrido del usuario en producción («Listo, esta todo perfecto») y de la conciliación contra la base.

- **AC-1 a AC-15 cumplidos**, con los tres desvíos y la salvedad de AC-8 aceptados por el usuario el 2026-10-16 (§Resultados).
- **Commit, CI y despliegue**:
  - `5251770`, la implementación. La CI 38982560939 terminó en `success` en 23 minutos al primer intento, con la suite completa, y se leyó por el SHA completo.
  - Desplegado el 2026-10-17 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `49db51c` anotado como la versión para volver atrás. La migración `0051` se aplicó, y la última línea comparó HEAD con el SHA pedido. Los pasos 2 y 3 corrieron con el usuario en modo manual.
  - Después del despliegue: el servicio, `active`; `/login` en `127.0.0.1:3000`, con `200`; 52 migraciones aplicadas; `supplier_payments` y `supplier_payment_voids` con `SELECT` e `INSERT` para `crm_app` y sus seis triggers (`*_insert_only` sobre `UPDATE` y `DELETE`, `*_open_session`, `supplier_payments_cash_session` y `supplier_payment_voids_copy_payment`); `supplier_payment` y `supplier_payment_void` en `document_kind`, `supplier_payment` en `audit_entity_type` y los cinco motivos; las dos tablas vacías.
- **La conciliación del recorrido**, solo con lecturas, en Demostración Vixora, con «Importaciones Sur»:
  - `PP-000001` (transferencia), `PP-000002` y `PP-000003` (efectivo, en `C-000005`), de 600.000 cada uno contra `RC-000006` (1.200.000); `PP-000004`, a cuenta, 7.050.000 por transferencia;
  - `APP-000001` anula `PP-000001` sin sesión, y `APP-000002` anula `PP-000003` en `C-000005`, que sigue abierta: lo esperado recuperó esos 600.000. Las dos con «El pago no se hizo» y con la moneda, el monto y la sesión de su pago;
  - la cuenta: se le debe por las recepciones vigentes 1, 2, 5 y 6, 6.650.000; pagado vigente, 7.650.000 (600.000 directos contra `RC-000006` y 7.050.000 a cuenta). La regla imputa el pago a cuenta a `RC-000001`, `RC-000002`, `RC-000005` y a los 600.000 que le faltaban a `RC-000006`, y deja 1.000.000 a favor del negocio. Las anuladas `RC-000003` y `RC-000004` no tienen pagos;
  - los contadores de `supplier_payment` en 4 y de `supplier_payment_void` en 2, iguales a los mayores números, y la auditoría con 4 `create` y 2 `void` de `supplier_payment`: los rechazos del recorrido no escribieron, no auditaron ni consumieron número.
- **Volver a `49db51c` ya no es limpio**: hay pagos que ese código no conoce y que no restaría de lo esperado de `C-000005`.
- **Revisión independiente**: ninguno crítico ni mayor; R1 y R2 corregidos con tests, R3 y R4 declarados y aceptados, y dos notas (§Resultados).
- **Pendiente para después**: la 22.7, la cuenta del proveedor (D-1). La lectura en lote del número de las recepciones para el detalle de una sesión con muchos pagos (AC-8) queda sin tarea, aceptada así por el usuario.
