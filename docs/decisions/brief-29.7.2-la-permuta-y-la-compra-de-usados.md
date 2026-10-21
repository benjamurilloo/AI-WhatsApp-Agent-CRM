---
schema: task-brief.v1
task_id: "29.7.2"
task_type: implementation
generated_at: 2026-10-21
---

# Brief 29.7.2 — La permuta y la compra de usados

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado** por el usuario el 2026-10-21, con las recomendaciones. Las decisiones U-1 a U-4 las tomó el 2026-10-21, todas con la opción recomendada (a) (abajo).
- **Fuentes**: [ADR 0024](0024-rubros-y-capacidades.md), puntos 8, 14 y 16, y su nota de la 29.7; [ADR 0025](0025-tipo-de-cambio.md), punto 5 (R-B5 y la tabla del punto 12); [ADR 0022](0022-cobros-y-caja.md), puntos 2 a 8, 10 y 12; [ADR 0023](0023-compras-y-proveedores.md), puntos 8 a 12, el molde del pago; [brief-29.7](brief-29.7-la-recepcion-de-usados.md); [brief-22.6](brief-22.6-los-pagos-a-proveedores.md); [brief-29.4.3](brief-29.4.3-devoluciones-y-pagos-en-otra-moneda.md); [DataModel](../architecture/DataModel.md).

## Objetivo

Que el valor reconocido de un usado **llegue a la plata**, según el destino que se eligió al recibirlo:

- **`sale_credit`, la permuta**: el usado paga, entero o en parte, una venta del mismo cliente, con un cobro con el medio de sistema «Permuta»;
- **`purchase`, la compra**: el negocio le paga al cliente con un comprobante propio, `PPU-`, por cualquier medio, y en efectivo sale de la caja.

Y que **la anulación del usado** se rechace mientras un cobro o un pago vigente lo use.

Hasta hoy, el CRM registra el usado y su destino, pero la permuta y el pago se hacen fuera del sistema (brief-29.7, §Contexto).

## Hallazgos (verificados contra el código en `0ac6983`, 2026-10-21)

- **H-1. `payment_methods` no distingue un medio de sistema** (`cash/schema.ts:41-79`). Tiene nombre, `is_cash` (fijo desde el alta) e `is_active`. Los medios los crea un `admin` o el botón de la lista inicial (`createInitialPaymentMethods`, `service.ts:217`), y un `admin` los renombra y los desactiva (`service.ts:321-431`). Ninguna organización de producción tiene un medio llamado «Permuta» (consulta de solo lectura, 2026-10-21: «iPhone Demo» y «Demostración Vixora» tienen cuatro cada una; «Vixora», ninguno).
- **H-2. Un solo punto lee el medio de cualquier movimiento de dinero**: `readPayment` (`service.ts:1995`). Lo llaman el cobro de una venta (l. 2195), la seña (l. 2305), la devolución (l. 2775), el cobro a cuenta (l. 4340) y el pago a proveedor (`supplier-payments.ts:430`). Una regla ahí cubre los cinco caminos.
- **H-3. El cobro de una venta acepta una venta sin cliente** (`createSaleReceipt`, `service.ts:2161`): el cobro copia el cliente de la venta, que puede ser nulo. El usado, en cambio, siempre tiene cliente (ADR 0024, punto 8). Lleva a U-2.
- **H-4. Una venta anulada deja sus cobros vigentes**, y su monto pasa a la cuenta del cliente, como saldo a favor, o a devolver si la venta no tiene cliente (ADR 0022, punto 4; comentario de `createSaleReceipt`, l. 2159). La devolución desde la cuenta sale con cualquier medio activo, también en efectivo (`createRefund`, l. 2706). **Un cobro con «Permuta» de una venta que después se anula se vuelve saldo a favor, y ese saldo se puede devolver en plata**: el valor del usado sale de la caja sin un `PPU`. Ni el ADR 0024 ni el 0022 lo prevén. Lleva a U-3.
- **H-5. La anulación del usado ya vive en `cash`** (`cash/trade-in-voids.ts`), bajo `lockCash`, y hoy solo comprueba el estado de la unidad (brief-29.7, U-4). Todo cobro, devolución y pago de esta subfase toma también `lockCash`: las comprobaciones de la anulación se leen con el bloqueo que serializa a todos los que escriben.
- **H-6. El molde del pago es `supplier_payments`** (`cash/supplier-payments.ts`, 1.032 líneas): numerado, de solo inserción, con lo recibido en otra moneda desde la 29.4.3, la salida de la sesión abierta sin dejarla en negativo, la anulación numerada aparte con motivo de una lista, y la lista y el total en la caja.
- **H-7. La activación de una capacidad ya activa no hace nada** (`scripts/activar-capacidad.ts`), y «iPhone Demo» ya tiene `trade_ins`. Un medio «Permuta» que se cree solo al activar no le llegaría. Lleva a U-4.
- **H-8. El usado es de solo inserción** (`trade_ins`, sin `UPDATE` para `crm_app`): no se puede bloquear su fila (nota de la 29.7 en el ADR 0024, punto 8). El tope de lo usado se mide con `lockCash` tomado, como el resto.
- **H-9. El destino del usado no cambia** (`trade_ins.destination`, comprobante de solo inserción). Si el cliente cambia de idea, el usado se anula y se recibe de nuevo.

## Decisiones del usuario

**Decididas el 2026-10-21, las cuatro con la opción recomendada (a).** Las opciones, como se presentaron:

- **U-1, contra qué se usa la permuta.**
  - **(a) Elegida. Solo contra una venta**, como dicen el ADR 0024 (punto 8) y el 0025 (R-B5). La seña y el cobro a cuenta rechazan «Permuta». **Recomendada**: es lo diseñado, y una seña con permuta suma un caso a la anulación de un pedido que hoy nadie pidió.
  - (b) También contra un pedido, como seña.
- **U-2, el cliente de la venta** (H-3).
  - **(a) Elegida. La venta tiene que ser del mismo cliente que el usado.** Una venta sin cliente, o de otro, rechaza «Permuta». **Recomendada**: el usado le reconoce un valor a una persona, y así el valor no sale de su cuenta.
  - (b) Cualquier venta, también sin cliente.
- **U-3, la permuta de una venta anulada** (H-4).
  - **(a) Elegida. Como cualquier cobro (ADR 0022, punto 4)**: pasa al saldo a favor del cliente, que se usa en otra venta o se devuelve. Se declara que así el valor del usado puede salir de la caja sin un `PPU`, siempre por un `admin`, con la anulación y la devolución auditadas. **Recomendada**: no suma reglas a la anulación de la venta ni a la devolución, y el camino correcto (anular primero el cobro con «Permuta», que deja el usado libre) sigue disponible.
  - (b) La devolución desde la cuenta no puede usar lo que vino de una permuta. Exige saber de dónde viene cada peso a favor, y la imputación hoy no lo sabe (`imputation.ts`, una moneda por pasada): es un rediseño de la cuenta del cliente.
- **U-4, el medio «Permuta» de una organización que ya tiene `trade_ins`** (H-7).
  - **(a) Elegida. Lo crea `org:capability`**: al activar `trade_ins`, y al volver a correrlo con `trade_ins` ya activa, si falta, auditado con el `admin` como autor. El usuario lo corre en «iPhone Demo» después del despliegue, como en la 29.7. **Recomendada**: deja la auditoría completa y no escribe datos desde una migración.
  - (b) Lo inserta la migración `0061` en cada organización con `trade_ins`, sin autor en la auditoría.

## Decisiones

### D-1 — El medio «Permuta» (ADR 0024, punto 8; H-1, H-2)

- **`payment_methods.system_role`**, un enum nuevo `payment_method_system_role` con un solo valor, `trade_in`, nulo en los medios de siempre. Un índice único parcial deja **a lo sumo uno por organización**. Se fija al crearlo: el trigger de la `0042` suma rechazar que cambie.
- **El medio de sistema se llama «Permuta»**, no es efectivo, y **no se renombra ni se desactiva**: el servicio lo rechaza con `system_payment_method`, y el trigger, con su mensaje. La lista de medios lo muestra con la marca «del sistema», sin acciones.
- **`readPayment` lo rechaza** con `trade_in_method_requires_trade_in`, salvo en el cobro de una venta que nombra un usado (D-2). Así lo rechazan la seña y el cobro a cuenta (U-1 (a)), la devolución y el pago a proveedor. El pago de un usado (D-3) lo rechaza con la misma regla.
- **Se crea según U-4**, con la función `ensureTradeInPaymentMethod` de `cash`, que llama `org:capability`.
- **Sin `trade_ins`, el medio no existe**, y nada de esta subfase cambia.

### D-2 — El cobro con «Permuta» (ADR 0024, punto 8; ADR 0025, R-B5)

- **`receipts.trade_in_id`**, nulo salvo en un cobro con «Permuta», con clave foránea compuesta a `trade_ins`. Un `CHECK` exige que, si tiene usado, el destino sea `sale` y no haya lo recibido en otra moneda. Un trigger de `cash` exige que el medio de sistema vaya siempre con usado, y el usado siempre con ese medio.
- **`createSaleReceipt` suma `tradeInId`**, solo con el medio de sistema. Con `lockCash`, la venta y su cliente tomados como hoy, comprueba, con su nombre:
  - el usado existe, es de la organización y no está anulado (`trade_in_voided`);
  - su destino es `sale_credit` (`trade_in_not_sale_credit`);
  - es del mismo cliente que la venta (`trade_in_other_client`, U-2 (a));
  - está en la moneda de la venta (`trade_in_currency_mismatch`, R-B5), sin conversión;
  - el monto **no supera lo disponible del usado**: su valor menos los cobros vigentes con «Permuta» que lo usan (`exceeds_trade_in_available`), ni lo que falta de la venta (`exceeds_outstanding`, como hoy).
- **El usado se lee por `tradeins`** (`getTradeInForPayment`, nueva), sin bloquearlo (H-8): lo usado se suma con `lockCash` tomado, y todo lo que cambia lo usado (otro cobro, la anulación de un cobro, la anulación del usado) lo toma.
- **Anular un cobro con «Permuta»** es la anulación de siempre (`voidReceipt`): no toca la caja, porque no es efectivo, y deja el valor disponible otra vez.
- **El recibo** muestra el medio «Permuta» y el número del usado (`PU-000123`). Un `viewer` lo ve como ve cualquier cobro (ADR 0024, punto 14, U-6).
- **La venta anulada**, según U-3.

### D-3 — El pago de un usado: `trade_in_payments` (ADR 0024, punto 8; ADR 0025, punto 5)

Como `supplier_payments`, de `cash`, con el molde de la 22.6 y la 29.4.3:

- **`trade_in_payments`**, de solo inserción, numerado `PPU-000123` (`document_kind` `trade_in_payment`), contra un usado: el usado, el medio, la sesión si es efectivo, la moneda y el monto aplicados (siempre los del usado), y lo que salió en la otra moneda con la cotización, como en un pago a proveedor (29.4.3).
- **Comprobaciones**, con `lockCash` tomado y su nombre: el usado vigente, con destino `purchase` (`trade_in_not_purchase`); el medio activo y no de sistema; la sesión abierta si es efectivo; **que no supere lo que falta pagar**, el valor menos los pagos vigentes (`exceeds_outstanding`, con la tolerancia de un centavo del ADR 0025, R-M4); y en efectivo, que lo esperado de la moneda que sale alcance (`insufficient_cash`).
- **El cliente no se bloquea**: el pago no lo referencia, y llega a él por el usado. El usado es de solo inserción y el vaciado no lo toca (nota de la 29.7, B-4).
- **`trade_in_payment_voids`**, numerada `APPU-000012`, a lo sumo una por pago, con motivo de una lista cerrada (`not_paid`, `wrong_method`, `wrong_amount`, `wrong_target` si se pagó otro usado, `other`, los del pago a proveedor) y sin texto libre. Copia lo del pago, y la plata vuelve a la caja solo si la sesión del pago sigue abierta (ADR 0022, punto 5). Un trigger de copia la defiende, como la de `supplier_payment_voids`.
- **Solo un `admin`** lee y escribe pagos (ADR 0022, punto 12). El arqueo que ve un `viewer` deja despejar lo pagado en efectivo: límite aceptado (ADR 0024, punto 14, U-4).

### D-4 — La anulación del usado (ADR 0024, punto 8, R-5; H-5)

`voidTradeIn` suma, antes de llamar a `tradeins` y con `lockCash` tomado:

- **ningún cobro vigente con «Permuta» lo usa** (`trade_in_used_in_receipt`, nombrando el primer `R-`);
- **ningún pago vigente lo paga** (`trade_in_paid`, nombrando el primer `PPU-`).

Lo demás no cambia. El cobro y el pago se anulan antes, y después el usado.

### D-5 — La caja

- **Los pagos en efectivo restan de lo esperado** de la moneda que sale, y sus anulaciones suman si la sesión del pago sigue abierta. Lo hacen los mismos llamadores de `computeCashTotals` que suman los pagos a proveedores (ADR 0025, punto 6): la función no cambia.
- **La sesión muestra el total de los pagos de usados** a los dos roles, y su lista solo a un `admin`, como los pagos a proveedores.
- **El cierre y el historial** los cuentan igual.

### D-6 — Las pantallas

- **El cobro de una venta**: con `trade_ins` y un cliente con usados `sale_credit` disponibles en la moneda de la venta, el formulario ofrece «Permuta» con la lista de esos usados (número, fecha y disponible) y propone el menor entre lo disponible y lo que falta. Sin usados disponibles, «Permuta» no aparece.
- **El detalle del usado** (solo `admin`, como el valor):
  - `sale_credit`: los cobros que lo usan, con su venta, y el disponible;
  - `purchase`: los pagos con sus anulaciones, lo que falta pagar y la acción «Pagar».
- **El formulario del pago**, con el medio, el monto propuesto (lo que falta) y lo que sale en la otra moneda, como el pago a proveedor.
- **El comprobante imprimible** del `PPU` y del `APPU`, como el de un pago a proveedor, con el nombre del cliente leído de su ficha al imprimir (como el `PU`, U-5 de la 29.7), y la leyenda «Documento no válido como factura».
- **La lista de usados** suma el filtro «Falta pagar», para los usados `purchase` vigentes con saldo.
- **La lista de medios** muestra «Permuta» como «del sistema».
- No hay una lista aparte de pagos de usados: se ven en el usado y en la sesión de caja.

### D-7 — La migración `0061`

- El enum `payment_method_system_role` y la columna `payment_methods.system_role`, con su índice parcial y el trigger.
- `receipts.trade_in_id`, con su clave foránea, su índice, su `CHECK` y el trigger del medio.
- `trade_in_payments` y `trade_in_payment_voids`, con sus claves compuestas, sus `CHECK`, `SELECT` e `INSERT` para `crm_app`, el trigger de solo inserción y el de copia.
- `document_kind` suma `trade_in_payment` y `trade_in_payment_void`; `audit_entity_type`, `trade_in_payment`.
- **Ninguna sentencia de la `0061` usa los valores que agrega a un enum existente**, y todo lo que compara un valor de enum de otra migración lo compara como texto: una base en la `0059` o antes no salta a la `0061` de una vez, por la `0060` (brief-29.7, desviación 6), pero la `0061` sola tiene que poder correr sobre la `0060` confirmada.
- **Sin datos** (U-4 (a)).

### D-8 — Roles, datos personales y el agente

- **Un `viewer`** ve los cobros con «Permuta» de una venta (ADR 0024, U-6), y no ve los pagos, el disponible ni lo que falta pagar.
- **El agente** no ve nada de esta subfase. Ningún contrato cambia.
- **El vaciado** no cambia: los pagos no tienen datos de la persona, y un cliente con usados ya no se borra (caso B). **La exportación** suma los pagos y sus anulaciones de los usados del cliente, con el runbook de datos de un cliente.

### D-9 — Pruebas

- **Integración**:
  - el cobro con «Permuta»: el camino feliz con el disponible y lo que falta; cada rechazo de D-2 por su nombre; dos cobros que juntos superan el disponible, rechazado el segundo; la anulación del cobro libera el disponible;
  - el medio de sistema: no se renombra, no se desactiva, y la seña, el cobro a cuenta, la devolución y el pago a proveedor lo rechazan; la base rechaza el medio sin usado y el usado sin el medio;
  - el pago: el camino feliz en la moneda del usado y en la otra; cada rechazo de D-3; en efectivo, la caja; la anulación con la sesión abierta y cerrada;
  - la anulación del usado, rechazada con un cobro vigente y con un pago vigente, y aceptada después de anularlos;
  - **la carrera**: un cobro con «Permuta» contra la anulación del usado, y un pago contra la anulación del usado, cada una con una tercera conexión que retiene `lockCash`;
  - la venta anulada con un cobro con «Permuta», según U-3;
  - los triggers de solo inserción y de copia, cada rechazo por su mensaje;
  - `org:capability` crea el medio al activar y al volver a correr, una sola vez, con su auditoría;
  - sin `trade_ins`, nada cambia;
  - el `viewer`;
  - la migración `0061` sola sobre una base en la `0060` confirmada, con medios, cobros y usados existentes.
- **Unitarias**: lo disponible y lo que falta pagar.
- **End-to-end**: un cobro con «Permuta» desde la venta; el pago de un usado en efectivo con la caja abierta y su anulación; la anulación del usado rechazada y después aceptada; el `viewer`; 375 px; sin JavaScript.
- **Las suites existentes** pasan sin cambios de conducta.

### D-10 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue (`CLAUDE.md`).
- **Despliegue** con el servicio detenido durante el build y el heap de 1.536 MB.
- **El medio «Permuta» en «iPhone Demo»** lo crea el usuario con `org:capability --profile iphone` (U-4 (a)).
- **Recorrido del usuario.**
- **Cierre**: DataModel, FR nuevos, la nota fechada del ADR 0024 (punto 8, con U-1 a U-4), Overview, runbooks de datos de un cliente y de alta, CHANGELOG, HANDOFF, Roadmap, Notion y Knowledge Capture.

## Alcance incluido

Todo lo de D-1 a D-10.

## Alcance excluido

- **La cotización de un usado**, los márgenes y el tipo de reparación de cada punto: la 29.7.3.
- **La permuta como seña o cobro a cuenta** (U-1).
- **Cambiar el destino de un usado**: se anula y se recibe otro (H-9).
- **Convertir monedas en la permuta** (R-B5).
- **Saber de dónde viene el saldo a favor de un cliente** (U-3).
- **Lo que lee el agente**: la 29.8.
- **Una lista aparte de pagos de usados.**

## Invariantes

- Sin `trade_ins`, ninguna pantalla, acción ni dato cambia.
- **Lo cobrado con «Permuta» contra un usado, sumando los cobros vigentes, nunca supera su valor.**
- **Lo pagado por un usado, sumando los pagos vigentes, nunca supera su valor.**
- Un usado `sale_credit` nunca tiene pagos, y uno `purchase` nunca tiene cobros con «Permuta».
- **Un usado anulado no tiene cobros con «Permuta» ni pagos vigentes.**
- El medio de sistema solo aparece en cobros de venta con usado, y un cobro con usado siempre lo usa.
- Ninguna salida deja lo esperado de la caja en negativo en la moneda en que sale.
- `trade_in_payments` y `trade_in_payment_voids` nunca cambian ni se borran.
- **Ningún módulo del núcleo importa `tradeins`, salvo `cash`**, y `tradeins` no importa `cash`. No hay ciclos.
- Un `viewer` y el agente nunca reciben los pagos, el disponible ni lo que falta pagar.

## Criterios de aceptación

- **AC-1**: un `admin` cobra una venta con «Permuta» contra un usado `sale_credit` del mismo cliente y la misma moneda, hasta lo menor entre lo disponible y lo que falta; queda el `R` con el usado, y la venta y el usado lo reflejan.
- **AC-2**: cada rechazo de D-2 tiene su nombre; dos cobros que juntos superan el disponible dejan uno; anular el cobro libera el disponible.
- **AC-3**: «Permuta» no se renombra ni se desactiva, y la seña, el cobro a cuenta, la devolución, el pago a proveedor y el pago de un usado lo rechazan; la base rechaza el medio sin usado y el usado sin el medio.
- **AC-4**: un `admin` paga un usado `purchase` con cualquier medio activo, también en la otra moneda, hasta lo que falta; en efectivo sale de la sesión abierta sin dejarla en negativo; queda el `PPU`.
- **AC-5**: el pago se anula una vez, con motivo, como `APPU`, y la plata vuelve a la caja solo con la sesión del pago abierta.
- **AC-6**: la anulación del usado se rechaza con un cobro con «Permuta» vigente o un pago vigente, nombrando el comprobante, y pasa después de anularlos.
- **AC-7**: un cobro con «Permuta» o un pago contra la anulación del mismo usado deja un solo ganador, probado con una tercera conexión.
- **AC-8**: la venta anulada con un cobro con «Permuta» se comporta según U-3, probado.
- **AC-9**: los triggers de solo inserción, de copia y del medio rechazan cada cambio con su mensaje.
- **AC-10**: `org:capability` crea «Permuta» una sola vez por organización con `trade_ins`, con su auditoría, también en una organización que ya la tenía activa (U-4).
- **AC-11**: la caja cuenta los pagos y sus anulaciones en lo esperado, el cierre y el historial; la sesión muestra el total a los dos roles y la lista solo a un `admin`.
- **AC-12**: un `viewer` ve los cobros con «Permuta» y no ve pagos, disponible ni lo que falta; el agente no ve nada nuevo.
- **AC-13**: sin `trade_ins` nada cambia; las suites existentes pasan sin cambios de conducta, salvo los de forma que declare la implementación.
- **AC-14**: la `0061` corre sola sobre una base en la `0060` confirmada con datos, probado.
- **AC-15**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-16**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-17**: desplegada, «Permuta» creada en «iPhone Demo» y recorrida por el usuario; «Demostración Vixora» y «Vixora» intactas.

## Pruebas y evidencia requerida

Las de D-9, más la CI en verde sobre el SHA desplegado y los recuentos por organización después del recorrido.

## Condiciones de detención

Pedir autorización explícita, en su turno, **antes de**:
- el commit, el push y el despliegue;
- migrar una base real;
- crear «Permuta» en producción, si no lo corre el usuario.

**Detenerse y consultar** si:
- algún módulo del núcleo, salvo `cash`, necesita importar `tradeins`, o `tradeins` necesita importar `cash`;
- el tope de lo usado o de lo pagado necesita un bloqueo que no sea `lockCash`;
- la permuta necesita convertir monedas;
- `computeCashTotals` o `imputeAccount` necesitan cambiar sus reglas;
- una suite existente cambia de conducta.

## Implementación

### Desviaciones y decisiones de implementación

Registradas al implementar, el 2026-10-21, para la revisión independiente. Ninguna toca una condición de detención: solo `cash` importa `tradeins`, y `tradeins` no importa `cash`; el tope de lo usado y de lo pagado se mide con `lockCash` tomado; la permuta no convierte; `imputeAccount` no cambia, y ninguna suite existente cambia de conducta.

1. **`computeCashTotals` suma dos términos**, los pagos de usados y sus anulaciones en la sesión, con la misma regla que los pagos a proveedores. D-5 decía que la función no cambiaba. Sus reglas no cambian: se suman dos filas de entrada y dos columnas de salida, como hizo la 22.6 con los pagos a proveedores. Sin eso, la sesión no podía mostrar el total de los pagos de usados aparte. Tiene su prueba unitaria.
2. **El medio de sistema no cuenta** para el límite de 20 activos ni para «la lista vacía» de la lista inicial (`countPaymentMethods`). Sin esto, una organización que activa `trade_ins` antes de crear sus medios no podría crear la lista inicial. La pantalla de medios lo muestra como «Del sistema», sin acciones.
3. **Si la organización ya tiene un medio llamado «Permuta»**, `org:capability` no activa ni crea nada, y dice que lo renombren. En producción no hay ninguno (H-1).
4. **El filtro «Falta pagar»**: `tradeins` no lee las tablas de `cash`. `cash` calcula los usados pagados del todo, una fila por usado con pagos vigentes, y `listTradeIns` los deja afuera (`excludeIds`). La lista crece con los usados pagados, no con todos.
5. **«Permuta» en el formulario del cobro** va como una opción más del medio, una por usado disponible, con el valor «medio|usado». Así funciona sin JavaScript y el cobro sigue siendo un solo paso. El campo `tradeIn` se suma a los del cobro de una venta; el cobro a cuenta lo filtra, porque no lo tiene.
6. **El número del usado** aparece también en las listas de cobros (la venta y la caja), además del recibo, con su enlace.
7. **La anulación de un pago de usado** es de un paso, con el motivo y lo que pasa con la caja, como la anulación del usado. El pago a proveedor usa un paso de confirmación aparte.
8. **La sesión de caja** muestra la sección de pagos de usados solo si la sesión tuvo alguno, y la columna de los totales igual: sin `trade_ins`, la caja no cambia.
9. **Cambios de forma en suites existentes**, declarados por AC-13:
   - `totals.test.ts` suma las dos entradas nuevas en cada caso;
   - las 29 specs end-to-end que vacían `trade_ins`, `cash_sessions` o `exchange_rates` suman las dos tablas nuevas a su `TRUNCATE`;
   - las guardas `cash-writes` y `exposed-surface` suman las tablas y las acciones nuevas.
   - en integración, `audit.test.ts` (privilegios de solo inserción) e `identity-schema.test.ts` suman las dos tablas, y `cash.test.ts` suma `tradeInPayments` y `tradeInPaymentVoids` a los totales por moneda de la sesión.
10. **La prueba de la `0061` sola** (`migration-0061.test.ts`) cayó una vez con el error del worker de vitest en Windows (`0xC0000409`), el mismo de la 29.7, y pasó al reintentarla sola. En la corrida completa de integración, `migration-0057.test.ts` agotó el plazo de 60 s de su `afterAll` y pasó al reintentarla; no toca nada de esta subfase.
11. **`cash.spec.ts` no estaba entre las specs del `TRUNCATE`**: vacía `cash_sessions` y `payment_methods` sin nombrar `trade_ins`, y falló al correr la suite end-to-end («cannot truncate a table referenced in a foreign key constraint»). Suma las dos tablas nuevas, como las otras 29.

### Revisión independiente

Hecha el 2026-10-21 por un agente que no participó del trabajo, con acceso de solo lectura, contra el brief y las reglas vigentes. Veredicto: **sin hallazgos bloqueantes**, cinco no bloqueantes y siete observaciones. Cada uno se verificó contra el código antes de aceptarlo:

- **NB-1, aceptado y corregido.** El formulario proponía siempre lo que falta de la venta, no el menor entre eso y lo que queda del usado (D-6). Cada usado de la permuta suma el enlace «Proponer lo que queda» (`?usado=`), que vuelve a armar el formulario con ese usado elegido y el menor de los dos montos, sin JavaScript. El end-to-end lo recorre, y encontró que después de un rechazo el enlace dejaba lo enviado en lugar de lo propuesto: el formulario se vuelve a montar con cada usado elegido (`key`).
- **NB-2, aceptado y corregido.** La prueba del rechazo de «Permuta» no llamaba a la seña ni a la devolución; ahora sí.
- **NB-3, aceptado y corregido.** La prueba de `org:capability` comprueba que crea «Permuta» una sola vez al activar y al volver a correrlo, y una prueba nueva, que con un medio ya llamado «Permuta» el comando se detiene sin activar nada.
- **NB-4, aceptado y corregido.** La ayuda del destino en el alta del usado decía que la permuta y el pago se hacían fuera del sistema.
- **NB-5, para el usuario.** La desviación 1 contradice la letra de D-5 («la función no cambia») y roza la condición de detención sobre las reglas de `computeCashTotals`. La fórmula de lo esperado suma `− tradeInPayments + tradeInPaymentVoids`, con la misma regla que los pagos a proveedores. La revisión señala además que esos pagos ya estaban dentro de la función, así que la premisa de D-5 era inexacta. Se elevó al usuario, que **la aceptó como desviación** el 2026-10-21.
- **O-1, corregido.** El cobro con «Permuta» y su oferta exigen ahora la capacidad `trade_ins` (`hasCapability`), además del medio. Hoy no se podía explotar: ninguna capacidad se desactiva.
- **O-2, corregido.** Cada opción de la permuta muestra la fecha del usado.
- **O-3, corregido.** El texto del rechazo de «Permuta» sirve para todos los flujos que lo heredan: «Permuta» solo descuenta un usado elegido en el cobro de una venta.
- **O-4, corregido.** Con «Falta pagar», el filtro del destino queda en «Compra».
- **O-5, aceptado sin cambio.** El end-to-end no recorre la anulación del usado aceptada después de anular el pago; la integración sí.
- **O-6, corregido.** Los comentarios de `tradeins/schema.ts` que hablaban de la 29.7.2 en futuro.
- **O-7, corregido en parte.** Suma la prueba directa del trigger de sesión (efectivo sin sesión). La sesión cerrada (`trade_in_payments_open_session`) y las ramas de otra moneda del trigger de copia siguen sin prueba directa: usan las funciones de la `0042` y la `0055`, ya probadas en sus tablas, y el camino de otra moneda tiene su prueba por el servicio.

**Corridas finales.** La suite end-to-end completa corrió dos veces con la máquina cargada: la primera perdió el servidor en la prueba 10 (`ERR_CONNECTION_REFUSED` en las 276 siguientes); la segunda dio 278 pasadas y 9 fallidas, ocho por tiempo o por el navegador caído (`Target crashed`) y una real, la de NB-1. Con la corrección, las nueve specs de esas fallas corrieron solas: 67 de 67.

**El rendimiento de la sesión de caja.** En la corrida completa de integración (1720 de 1721), la prueba de rendimiento de `supplier-payments.test.ts` superó el umbral de 754 ms en el detalle de una sesión con 500 pagos en efectivo (925 ms), donde la 29.7.2 suma dos lecturas a los totales. Se midió aparte, cinco corridas con las lecturas y cinco sin ellas: medianas de 510 ms y 517 ms, con picos de 1247 ms y 775 ms en cada lado. La diferencia es ruido de la máquina y no de la subfase; la prueba quedó sin cambios.

## Cierre

*Del 2026-10-21, después del despliegue y el recorrido del usuario.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | el cobro con «Permuta» en `cash` (`readPermuta` bajo `lockCash`), con el `R` que guarda el usado; `trade-in-payments.test.ts` y el end-to-end del cobro; desde la revisión, el formulario propone el menor de los dos montos (NB-1) |
| AC-2 | cumple | los rechazos de D-2 por su nombre en `trade-in-payments.test.ts`; los dos cobros que superan el disponible dejan uno; la anulación del cobro libera el disponible |
| AC-3 | cumple | «Permuta» sin renombrar ni desactivar; la seña, el cobro a cuenta, la devolución, el pago a proveedor y el pago de un usado lo rechazan, probados desde la revisión (NB-2); el `CHECK` y el trigger del medio en la base |
| AC-4 | cumple | el pago de un usado con cualquier medio activo, también en la otra moneda, hasta lo que falta; el efectivo sin dejar la sesión en negativo; el `PPU` |
| AC-5 | cumple | la anulación `APPU`, una sola vez y con motivo; la plata vuelve a la caja solo con la sesión del pago abierta |
| AC-6 | cumple | `voidTradeIn` rechaza con un cobro o un pago vigente nombrando el comprobante, y pasa después de anularlos, en integración |
| AC-7 | cumple | el cobro y el pago contra la anulación del mismo usado, cada uno con una tercera conexión: un solo ganador |
| AC-8 | cumple | la venta anulada con un cobro con «Permuta», según U-3, probada |
| AC-9 | cumple | los triggers de solo inserción, de copia y del medio, cada rechazo por su mensaje; la sesión cerrada y las ramas de otra moneda del trigger de copia, sin prueba directa (O-7) |
| AC-10 | cumple | `org:capability` crea «Permuta» una vez y lo dice al repetirse; con un medio ya llamado «Permuta» se detiene sin activar nada (NB-3); en producción lo corrió el usuario sobre «iPhone Demo», que ya tenía `trade_ins` |
| AC-11 | cumple, con una desviación aceptada | `computeCashTotals` suma los pagos y sus anulaciones con la regla de los pagos a proveedores (desviación 1, NB-5, aceptada por el usuario); la sesión con el total a los dos roles y la lista solo a un `admin` |
| AC-12 | cumple | el `viewer` en integración y en el end-to-end; los contratos del agente sin cambios |
| AC-13 | cumple | sin `trade_ins` nada cambia; los cambios de forma de las suites existentes, en las desviaciones 9 y 11 |
| AC-14 | cumple | `migration-0061.test.ts` sobre una base en la `0060` con datos; en producción, la `0061` corrió sola |
| AC-15 | cumple | CI run 39668254399 en `success` sobre `703c334c28e558deadad03d408af22d253d9de52`: guardas 845, unitarias 1059, integración 1721 y end-to-end 287, con axe |
| AC-16 | cumple | revisión independiente del 2026-10-21, antes del despliegue (§«Revisión independiente») |
| AC-17 | cumple | desplegada (`703c334`, 62 migraciones, las dos tablas verificadas en la base); el usuario creó «Permuta» en «iPhone Demo» y recorrió el flujo: «todo perfecto». Recuentos después: «iPhone Demo» con 1 medio de sistema, 3 usados, 1 cobro con «Permuta», 1 pago de usado y 1 anulación de pago; «Demostración Vixora» y «Vixora» sin medios de sistema, usados, cobros con «Permuta» ni pagos |

**Nivel alcanzado**: validado en integración (`producer-consumer`), desplegado y recorrido en producción sobre una organización demo. No hay negocio real.

### Lo que queda

- **La cotización de usados** (la 29.7.3), en Notion, en «Esperando».
- **Las correcciones de la revisión no tuvieron una segunda revisión independiente**: son autoevaluación, verificadas por sus pruebas y la CI.
- **La prueba de rendimiento del detalle de una sesión** de `supplier-payments.test.ts` sigue al borde de su umbral en la máquina local; en la CI pasó.

### El despliegue

Sin incidentes: la `0061` se aplicó antes de detener el servicio, y el build, con el heap de 1.536 MB, terminó a la primera. Producción estaba en la `0060`, así que la `0061` corrió sola. Después, el servicio activo y `/api/health` en 200 desde afuera. Para volver atrás, `43ce6fb`.
