---
schema: task-brief.v1
task_id: "29.4.3"
task_type: implementation
generated_at: 2026-10-19
---

# Brief 29.4.3 — Devoluciones y pagos en otra moneda

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Nivel de validación alcanzable**: validado localmente y en CI, validado en integración, y desplegado y recorrido por el usuario en la organización demo «iPhone Demo».
- **Orden**: la última de las tres subfases del tipo de cambio según el [ADR 0025](0025-tipo-de-cambio.md), punto 13. En Notion, la tarea `3fd702be6f4e813784ded5c9d22adad0` está en «En proceso» desde el 2026-10-19.
- **No abre ni cierra un gate.**
- **Estado de este documento**: **aprobado el 2026-10-19** por el usuario, con las recomendaciones de D-1 a D-11.

## Decisión del usuario que abre la construcción

La misma de la 29.2 y la 29.4: **el 2026-10-18 el usuario decidió construir la Fase 29 sin el negocio confirmado**, sobre «iPhone Demo». El 2026-10-19, mientras la 29.4.2 esperaba la prueba de su alerta, pidió seguir con la 29.4.3.

## Objetivo

Que una organización con moneda principal **devuelva a un cliente y pague a un proveedor en la otra moneda, sin que la cuenta ni la caja mientan**:

- la devolución desde la cuenta o de una venta anulada, entregada en pesos contra un saldo en dólares, con la cotización vigente o una acordada;
- el pago de una recepción o a cuenta de un proveedor, en pesos contra dólares;
- sus anulaciones, que devuelven a la caja lo que salió y a la cuenta lo aplicado;
- el total de referencia en la ficha del proveedor, su estado de cuenta y la lista «A pagar».

Es la misma regla que la 29.4 construyó para los cobros (ADR 0025, punto 5), del lado de las salidas.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-19 contra `main` (`1599324`). Dos relevamientos de solo lectura del código citaron cada punto, y los centrales (`createRefund`, `readInput` y `createSupplierPayment`, el script de exportación) se volvieron a leer.

- **Lo que la 29.4 dejó hecho para los cobros**, que esta subfase reutiliza:
  - las cuatro columnas (`tendered_currency`, `tendered_amount`, `exchange_rate`, `exchange_rate_id`), la clave compuesta contra `exchange_rates` y los seis `CHECK`, en `receipts` y `receipt_voids` (`0053:31-59`); el trigger de copia de la anulación las compara (`0053:80-125`);
  - `src/modules/cash/tender.ts`: `readTender` (la vigente, la acordada, `no_exchange_rate`, `exchange_rate_changed`, el monto con los decimales de la moneda que entra), `canConvert` (solo la otra moneda contra un destino en la principal, R1-1 de la 29.4), `fitToOutstanding` (la tolerancia de un centavo), `tenderColumns`, `cashSideOf` y `accountReceiptCurrencies`;
  - `readPayment` con tres firmas: **sin** `tenderInput` devuelve las fallas de siempre, y es la que usan la devolución (`service.ts:2718`) y el pago (`supplier-payments.ts:387`) (brief-29.4, P-7);
  - en la pantalla, `caja/exchange.ts` (`receiptExchange`, `tenderNote`), `caja/exchange-fields.tsx` (`TenderCurrencyChoice`, `TenderedAmountFields`) y `caja/reference-total.tsx`.
- **`refunds` y `refund_voids`** (`0045:33-71`) no tienen las columnas. `target` es `account` (con `client_id`) o `sale` (una venta anulada sin cliente). El trigger de copia (`0045:163-196`) compara solo moneda y monto.
- **`createRefund`** (`service.ts:2651-2778`): la moneda la elige la persona entre todas las aceptadas, contra la cuenta (2672-2674, 2700); contra una venta, es la de la venta (2712). El tope es lo que está a favor (`inFavorOf`) o lo que queda por devolver, **sin tolerancia** (2721-2729). El control de la caja mide **en la moneda aplicada** (2730-2740). `voidRefund` (2792-2877) controla el máximo de la caja también en la aplicada.
- **`supplier_payments` y `supplier_payment_voids`** (`0051:6-44`) no tienen las columnas; su trigger de copia (`0051:92-125`) compara solo moneda y monto. **Viven en `cash`**, no en `purchasing` (`supplier-payments.ts:52-56`): pueden usar `fx` sin que `purchasing` dependa de `fx`.
- **`createSupplierPayment`** (`supplier-payments.ts:333-458`): contra una recepción, la moneda es la de la recepción (373) y el tope es lo que falta, sin tolerancia (390-402); a cuenta, **cualquier moneda aceptada y sin tope** (286-288, 384). `cashShortfall` (308-318) y `voidSupplierPayment` (526-546) miden en la aplicada.
- **La caja**: `totalsOf` (`service.ts:569-576`) pasa por `cashSideOf` **solo los cobros**. `findSessionRefundVoids` (`repository.ts:1103`), la rama de devoluciones de `findLateVoids` (1162-1163), `findSessionSupplierPaymentVoids` y `findLateSupplierPaymentVoids` (`supplier-payment-repository.ts:231, 262`) leen la moneda y el monto aplicados.
- **Las cuentas de proveedores** (`supplier-accounts.ts`): `getSupplierAccountSummary` (56), `getSupplierStatement` (236) y `listSuppliersOwed` (351) no tienen total de referencia. `referenceView` es privada de `service.ts` (124).
- **Las pantallas**: `devoluciones/refund-form.tsx` (moneda por radio y monto) y `compras/pagos/payment-form.tsx` (moneda a cuenta con un selector) no tienen campos de la otra moneda. `devoluciones/messages.ts:230` filtra los rechazos compartidos: «Una devolución no recibe en otra moneda hasta la 29.4.3».
- **Los comprobantes**: la devolución (`devoluciones/[refundId]/page.tsx`, D, con el sello de su anulación), el pago (`compras/pagos/[paymentId]/page.tsx`, PP) y su anulación (`…/anulacion/page.tsx`, APP) muestran solo lo aplicado.
- **Roles**: la devolución la crea y la anula un `admin`; un `viewer` la ve. Todo lo de proveedores es de `admin`, también las lecturas (`SecurityModel.md:11`).
- **El script de exportación de los datos de un cliente** (`scripts/client-data-export.ts:171-211`) saca de los cobros, las anulaciones y las devoluciones solo `currency` y `amount`. La 29.4 no le sumó lo recibido.
- **La próxima migración** es la `0055`.

### Hallazgos

- **H-1. La devolución y el pago necesitan las mismas columnas que el cobro, y sus anulaciones también**, con sus triggers de copia. Es lo que dice el ADR (punto 5), y lo que la 29.4 hizo con `receipt_voids` (H-1 de la 29.4).
- **H-2. Una salida se mide al revés que una entrada en la caja.** En un cobro, el control es el máximo (`exceedsCashLimit`). En una devolución y en un pago es **que lo esperado no quede negativo en la moneda que sale** (ADR, punto 6), y en su anulación, el máximo en esa moneda. Hoy los cuatro controles miden en la aplicada.
- **H-3. Los dos movimientos a cuenta eligen la moneda libremente.** La devolución desde la cuenta solo ofrece las monedas con saldo a favor, así que ya cumple la regla del ADR (R-M2). **El pago a cuenta de un proveedor no**: ofrece cualquiera y no tiene tope. Con moneda principal, unos pesos pagados a cuenta de un proveedor al que se le deben dólares quedarían como saldo a favor en pesos, que la imputación nunca cruza con la deuda.
- **H-4. La devolución usa la vigente de hoy**, no la del cobro original (decisión del usuario del 2026-10-18, ADR punto 5, R-M3). El cliente recibe el equivalente de hoy de lo que tiene a favor en dólares.
- **H-5. La vigente es la de venta del blue más el ajuste** (29.4.2). Para un pago a un proveedor puede no ser la que se acuerda con él. El ADR lo resuelve con la **cotización acordada** que escribe el `admin` para ese movimiento, y esta subfase no cambia nada de eso.
- **H-6. La exportación de los datos de un cliente omite lo que entró en otra moneda** desde la 29.4, y omitiría lo que salió desde esta. Es un dato del cliente: cuántos pesos entregó o recibió.
- **H-7. `referenceView` no se puede usar desde `supplier-accounts.ts`**: es privada.

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué entra y qué no

**Recomendada**:

- **Entran**:
  - las columnas, los `CHECK`, las claves y los triggers de copia en `refunds`, `refund_voids`, `supplier_payments` y `supplier_payment_voids` (D-2);
  - la devolución y el pago en la otra moneda, con la vigente o una acordada, y sus anulaciones (D-3, D-4);
  - la caja contando lo que salió (D-5);
  - los totales de referencia de las cuentas de proveedores (D-6);
  - las pantallas, los comprobantes y las listas (D-7);
  - la exportación de los datos de un cliente con lo que entró y salió (D-8).
- **No entran**:
  - la permuta y `trade_in_payments` (29.7);
  - cambios en `read-v1`, `read-v2` o el agente (29.8);
  - cambios en la cotización, el lector o su fuente (29.4.2);
  - convertir precios, costos o líneas de un comprobante.

### D-2 — La migración `0055` (H-1)

**(a) Recomendada**: la misma forma de la `0053` para los cobros:
- en las cuatro tablas, `tendered_currency text`, `tendered_amount numeric(14, 2)`, `exchange_rate numeric(18, 6)` y `exchange_rate_id uuid`, con la clave compuesta contra `exchange_rates(organization_id, id)` y los seis `CHECK` del ADR (las tres juntas o ninguna, el id solo con ellas, la moneda distinta de `currency` y con formato, el monto positivo, la cotización `>= 1`);
- `CREATE OR REPLACE` de `refund_voids_check_copy()` y `supplier_payment_voids_check_copy()`, que también comparan las cuatro;
- es aditiva, no agrega valores a ningún enum y **no necesita `GRANT`**: el `SELECT` y el `INSERT` de `crm_app` son de la tabla.

### D-3 — La devolución en la otra moneda (H-2, H-4)

**(a) Recomendada**:
- **lo que sale**: con moneda principal y vigente, contra un saldo a favor **en la principal** (la cuenta) o una venta anulada **en la principal**, la persona elige **«Moneda que sale»**: la del destino o la otra. Es la regla de `canConvert`, sin cambios;
- **la cotización**: la vigente (H-4) o una **acordada** por el `admin`, que no pasa a ser la vigente. Sin vigente, se rechaza, también con una acordada (R1-2 de la 29.4). Si la vigente cambió mientras se cargaba, `exchange_rate_changed` y la página se vuelve a leer (R1-3 de la 29.4);
- **lo aplicado** se calcula una vez con `readTender`, y **el tope** (lo que está a favor o lo que queda por devolver) se mide con lo aplicado y la tolerancia de un centavo (`fitToOutstanding`). Hoy el tope no tiene tolerancia: la tiene solo una devolución convertida, como en los cobros;
- **la caja**: lo esperado **en la moneda que sale** no queda negativo;
- **la anulación** copia lo que salió, sin cotización nueva. El control del máximo de la caja mide en la moneda que vuelve a entrar;
- **la auditoría** del alta suma `tendered_currency`, `tendered_amount` y `exchange_rate`.

### D-4 — El pago a un proveedor en la otra moneda (H-2, H-3, H-5)

**(a) Recomendada**, con la misma regla de D-3:
- **contra una recepción en la principal**, «Moneda que sale», el tope con lo aplicado y la tolerancia de un centavo;
- **a cuenta** (H-3), con moneda principal: **la moneda aplicada es la principal, o una en la que el proveedor tenga un saldo pendiente o a favor**, como el cobro a cuenta de la 29.4 (`accountReceiptCurrencies`, y su P-1). Lo que sale puede ser la otra moneda, aplicada en la principal. **Sin moneda principal, sigue como hoy**: cualquier moneda aceptada;
- **sin tope a cuenta**, como hoy: lo que excede queda a favor, en la moneda aplicada;
- la caja, la anulación y la auditoría, como D-3.
- (b) Dejar el pago a cuenta con cualquier moneda. Repite el problema que el ADR resolvió para los cobros (R-M2).

### D-5 — La caja (H-2)

**(a) Recomendada**:
- **`totalsOf` pasa también por `cashSideOf`** las devoluciones, sus anulaciones, los pagos y sus anulaciones. `computeCashTotals` no cambia;
- **`findSessionRefundVoids`, `findLateVoids`, `findSessionSupplierPaymentVoids` y `findLateSupplierPaymentVoids`** leen lo que salió o volvió, con el mismo `coalesce` de los cobros;
- **las tablas de la sesión** muestran lo que salió como cifra de caja, con «Aplicado: …», como los cobros.

### D-6 — Las cuentas de proveedores (H-7)

**(a) Recomendada**:
- la tarjeta «Cuenta» del proveedor, su estado de cuenta y la lista «A pagar» suman un **total de referencia** en la principal, con la vigente, marcado «de referencia», sin guardarse. La regla de las monedas sin convertir es la de la caja y los clientes;
- `referenceView` y `accountReferences` se exportan dentro de `cash` (no por `index.ts`), para que `supplier-accounts.ts` los use;
- las lecturas siguen con `withSnapshot`, como fija `purchasing-dependencies.test.ts` (regla 3).
- (b) Solo en «A pagar». La ficha es donde el `admin` paga, y ahí es donde más sirve, como en los clientes (D-8 de la 29.4).

### D-7 — Las pantallas y los comprobantes

**(a) Recomendada**:
- **los cuatro formularios** (la devolución desde la cuenta, la de una venta anulada, el pago de una recepción y el pago a cuenta) eligen la moneda que sale con un **enlace** (`?moneda=ARS`), como el cobro de una venta (P-5 de la 29.4). Así funcionan sin JavaScript. Con la otra, muestran la vigente y su equivalencia («A favor USD 100,00 = ARS 157.000,00»), proponen ese monto y permiten una cotización acordada, con `TenderedAmountFields` adaptado al texto de una salida («Monto que sale», «Se aplican»);
- en los dos formularios **a cuenta**, elegir la otra moneda que sale deja la aplicada en la principal (D-4);
- **los comprobantes D, PP y APP**, el sello de la anulación de la devolución, la lista de devoluciones, la de pagos y la sección de pagos de una recepción muestran «USD 100,00 (salieron ARS 157.000,00 a 1.570,00)», con «acordada» si lo fue;
- `devoluciones/messages.ts` deja de filtrar los rechazos de la otra moneda.
- (b) Un selector dentro del formulario, como el cobro a cuenta. Pide JavaScript para la vista previa, y los cuatro formularios no tienen un paso de confirmación.

### D-8 — La exportación de los datos de un cliente (H-6)

- **(a) Recomendada**: `client-data-export.ts` suma `tendered_currency`, `tendered_amount` y `exchange_rate` a los cobros, las anulaciones de cobros, las devoluciones y las anulaciones de devoluciones. **Corrige también la omisión de la 29.4** en los cobros: es el mismo dato y el mismo archivo. Los proveedores no tienen exportación.
- (b) Solo las devoluciones, y la omisión de los cobros como hallazgo aparte.

### D-9 — Roles

**Recomendada**: los de hoy. Un `admin` devuelve, paga y anula, con la vigente o una acordada; un `viewer` ve las devoluciones con lo que salió, y no ve nada de proveedores (ADR 0025, punto 11; ADR 0023).

### D-10 — Pruebas

**Recomendadas**:

- **Unitarias**: lo que cambie en `tender.ts` (las monedas del pago a cuenta) y las vistas de lo que salió.
- **Integración contra PostgreSQL**:
  - los `CHECK` de las cuatro tablas y los dos triggers de copia con las columnas nuevas;
  - la devolución desde la cuenta y la de una venta anulada, en pesos contra dólares: lo aplicado, el tope, la tolerancia de un centavo, la acordada, sin vigente y la vigente que cambió;
  - el pago de una recepción y a cuenta en pesos, con la regla de la moneda aplicada a cuenta;
  - las anulaciones: la caja recibe lo que salió y la cuenta, lo aplicado;
  - la caja: lo esperado por moneda con salidas en las dos, y el rechazo por efectivo insuficiente **en la moneda que sale**;
  - los totales de referencia de proveedores;
  - la exportación con las columnas nuevas;
  - **sin moneda principal, cada devolución, pago y pantalla se comportan como hoy**;
  - el aislamiento: una organización no usa la cotización de otra.
- **Guardas**: `cash-writes`, `purchasing-dependencies` (sin cambios en sus reglas), `fx-dependencies` (`cash` sigue siendo el único que importa `fx`), `exposed-surface` si cambia una acción.
- **End-to-end**: devolver en pesos un saldo a favor en dólares y ver la caja; pagar en pesos una recepción en dólares y anularlo; el total de referencia en la ficha del proveedor y en «A pagar»; un `viewer` ve la devolución con lo que salió; axe en claro y oscuro, y a 375 px.
- **Antes del commit**: `npm run format:check` completo.

### D-11 — Revisión independiente, despliegue y cierre

**Recomendada**:
- **Revisión independiente**: sí, antes del despliegue. Toca el dinero, la caja y las cuentas de todas las organizaciones. Un agente de solo lectura contra este brief, el ADR 0025, el ADR 0022, el ADR 0023 y el código.
- **Despliegue**, con la autorización del usuario: la `0055` y el código. No hay pasos de operador ni secretos.
- **Recorrido del usuario** en «iPhone Demo»: una devolución y un pago a un proveedor en pesos, y una anulación. Si la demo no tiene proveedor ni recepción, el usuario los crea desde la pantalla. «Demostración Vixora» se comprueba con recuentos.
- **Cierre**: DataModel, FunctionalRequirements, la nota fechada en el ADR 0025 (D-4 a cuenta, D-8) y en el ADR 0023, el CHANGELOG, el HANDOFF, el Roadmap, Notion y Knowledge Capture.

## Alcance incluido

- `drizzle/0055_*.sql` y su snapshot.
- `src/modules/cash/`: `schema.ts`, `repository.ts`, `supplier-payment-repository.ts`, `service.ts` (la devolución, su anulación, la caja, `referenceView`), `supplier-payments.ts`, `supplier-accounts.ts`, `supplier-payment-views.ts`, `tender.ts`.
- `src/app/(autenticado)/`: `devoluciones/`, `clientes/[clientId]/devolver/`, `ventas/[saleId]/devolver/`, `caja/devoluciones/`, `caja/session-tables.tsx`, `caja/exchange.ts` y `caja/exchange-fields.tsx`, `compras/pagos/`, `compras/recepciones/[receiptId]/pagar/`, `compras/proveedores/[supplierId]/` (la cuenta, el estado de cuenta y el pago), `compras/a-pagar/`.
- `scripts/client-data-export.ts`.
- `tests/` (unitarias, integración, guardas y end-to-end).
- La documentación del cierre.

## Alcance excluido

- La permuta y todo lo de la 29.5 en adelante.
- El módulo `fx`, el lector y la pantalla de la cotización.
- `read-v1`, `read-v2`, la ingestión y la búsqueda global.
- `imputeAccount` y `computeCashTotals`: no cambian.
- Cambios en «Demostración Vixora» o en cualquier organización que no sea «iPhone Demo».
- Dependencias nuevas.
- Cambios en el agente o en su repositorio.

## Invariantes

1. **Una organización sin moneda principal se comporta exactamente como hoy**: devoluciones, pagos, caja, cuentas de proveedores y formularios.
2. **`currency` y `amount` no cambian de significado**: siguen siendo lo aplicado, en la moneda del destino.
3. **`imputeAccount` y `computeCashTotals` no cambian sus reglas.**
4. **El dinero y la cotización nunca pasan por `number`.**
5. **Lo aplicado se calcula una vez, al registrar**, y nunca se recalcula. La anulación copia.
6. **Ninguna salida deja lo esperado negativo en la moneda en que sale.**
7. **Aislamiento por organización**: las claves compuestas lo exigen en la base.
8. **La migración es aditiva.**
9. **`purchasing` no depende de `fx`, y solo `cash` importa `fx`.**
10. **Los contratos del agente no cambian.**

## Criterios de aceptación

- **AC-1**: un `admin` devuelve en pesos un saldo a favor en dólares, con la vigente o una acordada; la cuenta baja en dólares y la caja resta pesos. Lo mismo la devolución de una venta anulada en dólares.
- **AC-2**: un `admin` paga en pesos una recepción en dólares y paga a cuenta con la regla de la moneda aplicada; la cuenta del proveedor baja en dólares y la caja resta pesos.
- **AC-3**: las anulaciones devuelven los pesos a la caja y los dólares a la cuenta, y los triggers rechazan una anulación que no copia lo que salió.
- **AC-4**: una salida en pesos sin pesos suficientes en la caja se rechaza, aunque haya dólares.
- **AC-5**: la ficha del proveedor, su estado de cuenta y «A pagar» muestran el total de referencia, marcado como tal.
- **AC-6**: la exportación de un cliente trae lo que entró y salió en la otra moneda.
- **AC-7**: sin moneda principal, nada cambia.
- **AC-8**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-9**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-10**: desplegada y recorrida por el usuario en «iPhone Demo», con «Demostración Vixora» intacta.

## Pruebas y evidencia requerida

Las de D-10, en CI sobre el SHA desplegado; el recorrido del usuario en «iPhone Demo»; y una consulta de solo conteos que muestre que «Demostración Vixora» no tiene movimientos en otra moneda.

## Condiciones de detención

Detenerse y avisar si:

- la regla de lo aplicado obliga a cambiar `imputeAccount` o `computeCashTotals`;
- una devolución o un pago sin moneda principal cambia en cualquier forma;
- `purchasing` necesita importar `fx`;
- la conversión necesita pasar por `number`;
- hace falta tocar un contrato del agente, una dependencia, el lector o un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cualquier commit, push o despliegue;
- ejecutar la migración en producción.

## Implementación: precisiones y desvíos (2026-10-19)

Registrados al implementar, antes de la revisión independiente.

- **P-1. Las columnas y las restricciones de las cuatro tablas salen de dos funciones de `cash/schema.ts`** (`tenderedColumns` y `tenderedConstraints`), con los mismos nombres que la `0053` usó para los cobros. Los cobros siguen declarándolas en línea: no se tocó su esquema.
- **P-2. La tolerancia de un centavo solo vale para una salida convertida.** Una devolución o un pago en la moneda del destino tienen el tope de siempre, sin tolerancia, como antes de la 29.4.3.
- **P-3. Los dos controles de la caja de una salida son funciones compartidas** de `cash/service.ts`: `outgoingShortfall` (que lo esperado en la moneda que sale no quede negativo) y `returnExceedsLimit` (que lo que vuelve al anular quepa en `numeric(14, 2)`). `cashShortfall` de `supplier-payments.ts` se quitó: la reemplaza la primera.
- **P-4. El pago a cuenta** (D-4): con moneda principal, el formulario ofrece solo las monedas aplicables y, si no se le debe nada al proveedor, propone la principal. El servicio lo vuelve a comprobar con el ledger del proveedor.
- **P-5. Los textos de una salida** («Moneda que sale», «Cotización acordada para esta devolución», «Salieron …», y el aviso sin vigente «sin ella no sale plata en la otra moneda») salen de los mismos componentes de la 29.4, con el tipo de movimiento como parámetro. Los textos de los cobros no cambian.
- **P-6. La tabla de pagos a proveedores** muestra lo que salió con lo aplicado debajo en la sesión de caja, y lo aplicado con lo que salió debajo en las demás listas.
- **P-7. Archivos fuera de la lista del alcance**:
  - `ventas/[saleId]/cobrar/sale-receipts-section.tsx`: la sección de cobros de una venta lista también sus devoluciones, que ahora muestran lo que salió;
  - `caja/outgoing-exchange-messages.ts`, nuevo: los rechazos de la otra moneda de una devolución.

  No se tocó ningún contrato del agente ni ninguna dependencia.

- **P-8. Revisión independiente R1 (2026-10-19)**: un agente de solo lectura que no participó en el trabajo, contra este brief, los ADR 0022, 0023 y 0025 y el código. Encontró 8 hallazgos, ninguno bloqueante ni alto. Cada uno se verificó contra el código antes de aceptarlo; las correcciones son autoevaluación.
  - **R1-1 (medio), aceptado.** Con la principal elegida en «Moneda que sale», debajo seguía la elección de la moneda aplicada con todas las monedas a favor o con saldo. Elegir ARS ahí registraba una salida en ARS aplicada en ARS mientras la navegación decía USD. No era un error de dinero: el formulario no manda la moneda que sale y el servidor aplica en la misma. Era un texto que contradecía lo registrado. Ahora «Moneda que sale» va después de la elección de la moneda y solo se muestra cuando la aplicada es la principal (o ya se eligió la otra). El rechazo de D-4 explica la regla: «Con una moneda principal, a cuenta se paga en ella o en una moneda en la que se le deba al proveedor».
  - **R1-2 (medio), aceptado.** Se agregó la prueba del aislamiento: la base rechaza con `refunds_exchange_rate_fk` y `supplier_payments_exchange_rate_fk` una fila de A con la cotización de B, y el servicio responde `exchange_rate_changed` a una devolución o un pago de A con el id de la cotización de B.
  - **R1-3 (medio), aceptado.** Se agregaron tres casos de caja:
    - lo esperado con salidas en las dos monedas, el pago en pesos rechazado por `insufficient_cash` en ARS aunque haya dólares, y las anulaciones de una devolución y un pago posteriores al cierre, que la sesión muestra en pesos;
    - el tope de lo que vuelve al anular, medido en la moneda que vuelve: con los dólares de la caja en el tope, la anulación de una salida en pesos se acepta;
    - el pago con la vigente cambiada y con una acordada.
  - **R1-4 (bajo), aceptado.** La prueba sin moneda principal incluye ahora la devolución: el formulario no ofrece otra moneda y `createRefund` con `tenderedCurrency` se rechaza con `VALIDATION_ERROR`.
  - **R1-5 (bajo), aceptado.** El end-to-end de la devolución en pesos abre la caja, devuelve en efectivo y comprueba lo esperado (US$ 27,39 de referencia por ARS 43.000).
  - **R1-6 (bajo), aceptado y más amplio.** `format:check` encontró cuatro archivos sin formato, no dos: `service.ts`, `supplier-payment-repository.ts`, `supplier-payments.ts` y `tender.ts`. Se formatearon; el cambio es solo de formato.
  - **R1-7 (bajo), aceptado en parte.** La etiqueta de una salida es «Monto que sale en ARS». Los `id` siguen siendo `cobro-*`: no se ven y no cambian lo que lee un lector de pantalla, que usa la etiqueta.
  - **R1-8 (bajo), aceptado.** El sello de la anulación de una devolución nombra lo que salió: «Salieron $ 157.000,00, que vuelven a la caja si fue en efectivo».
  - **Estado documental**: la nota fechada del ADR 0023 (moneda del pago a cuenta) y la del ADR 0025 (que además corrige la referencia a `cashShortfall`, que ya no existe) se escriben al cierre, como prevé D-11. DataModel también se actualiza al cierre.

## Cierre (2026-10-19)

Cerrada el 2026-10-19 con la aprobación del usuario, después de su recorrido en producción.

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | integración `exchange-outgoing.test.ts` (vigente, acordada, venta anulada, tolerancia); end-to-end de la devolución en pesos en efectivo con la caja; recorrido del usuario |
| AC-2 | cumplido | integración (recepción, a cuenta con la regla de la moneda aplicada, vigente cambiada, acordada); end-to-end del pago en pesos; recorrido del usuario |
| AC-3 | cumplido | integración (anulaciones, triggers de copia, anulaciones posteriores al cierre); end-to-end de la anulación del pago; recorrido del usuario (pago anulado) |
| AC-4 | cumplido | integración: la devolución y el pago en pesos rechazados por `insufficient_cash` en ARS con dólares en la caja (R1-3) |
| AC-5 | cumplido | integración y end-to-end de la ficha y «A pagar» (US$ 110,00 de referencia) |
| AC-6 | cumplido | integración de la exportación |
| AC-7 | cumplido | integración sin moneda principal (pago, pago a cuenta, devolución; R1-4) y las suites de siempre sin cambios |
| AC-8 | cumplido | CI run 39322804355 en `success` sobre `93c2be13c4bf5d5a31fab9127a2f38e66d19f664`; en local, 1759 unitarias y guardas, la integración completa sin fallas y 33 end-to-end de las specs relacionadas |
| AC-9 | cumplido | revisión independiente R1 antes del despliegue, cada hallazgo verificado (P-8) |
| AC-10 | cumplido | desplegada (`93c2be1`, 56 migraciones); el usuario registró una devolución y un pago en pesos y anuló el pago en «iPhone Demo», y dijo «Esta todo perfecto»; recuentos: «Demostración Vixora» y «Vixora» con 0 devoluciones y 0 pagos en otra moneda |

**Nivel alcanzado**: validado en integración (`producer-consumer`), desplegado y recorrido en producción sobre una organización demo. No hay negocio real.

**Lo que queda**: la otra moneda en el pago de un usado (29.7). Las correcciones de la revisión no tuvieron una segunda revisión independiente: son autoevaluación.

**Incidentes del trabajo**, sin efecto en producción: una corrida de un archivo de integración mientras corría la suite completa contra la misma base contaminó las dos (se repitió sola); un servidor de pruebas que quedó vivo ocupó el puerto 3100, y el end-to-end usó un build viejo hasta correr `npm run build` (Playwright sirve el último build con `next start`).
