---
schema: task-brief.v1
task_id: "21.6"
task_type: implementation
generated_at: 2026-10-15
---

# Brief 21.6 — La cuenta corriente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el cobro a cuenta, la imputación, las lecturas de la cuenta, la serialización, las guardas y las fronteras, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-14).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-14, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: sexta y **última** subfase de la Fase 21 — Caja y cobros ([Roadmap](../planning/Roadmap.md) §Fase 21), después de la 21.5, cerrada el 2026-10-15. Implementa la fila «21.6» del punto 15 del [ADR 0022](0022-cobros-y-caja.md). **Al cerrarla se cierra la fase** (D-15).
- **No abre ni cierra gate.** Pero es la primera escritura de dinero **sin un comprobante que la limite** (el cobro a cuenta no tiene tope), suma lecturas nuevas a `sales` y `orders`, y cierra la fase. Por eso se recomienda la revisión independiente (D-13).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-15, con las recomendaciones de D-1 a D-15 (entre ellas D-6, la lista de deudores con lecturas nuevas de `sales` y `orders` y su medición con el umbral fijado antes de medir, y D-11, el escenario literal de AC-5 cerrado como inalcanzable con una propiedad). La tarea 21.6 (`3f8702be6f4e8186bb32f23990a6d2da`) sigue en «Esperando» hasta que el usuario autorice el cambio.

## Objetivo

Que un `admin` pueda **cobrar a cuenta** a un cliente, sin elegir una venta, y que cualquier miembro pueda **ver la cuenta corriente**:

- **el cobro a cuenta** (`R-000123`, la misma serie del recibo): se imputa con la regla de la 21.3 a las ventas con saldo del cliente, de la más vieja a la más nueva, y lo que sobra queda a favor;
- **el estado de cuenta** de un cliente, imprimible: sus ventas, anulaciones, cobros, devoluciones, señas retenidas, el saldo por moneda y **a qué venta se aplicó cada peso** del remanente;
- **la lista de deudores** de la organización, medida antes de aceptarla (ADR 0022, punto 9);
- **el saldo en la ficha del cliente y en el detalle de la venta**, compuestos por las páginas;
- **el texto del pedido cancelado y de la venta anulada**, que hoy llama «saldo a favor» a lo que puede terminar pagando otra venta (hallazgo del recorrido de la 21.5).

La regla de imputación no cambia: `imputeAccount` ya recibe los cobros a cuenta desde la 21.3.

## Lo que se verificó antes de escribir este brief

Contra `main` (`97356c1`), el 2026-10-15:

- **El ADR 0022 en la fuente**, entero. Lo que fija para esta subfase:
  - el destino `account` en `receipts`, con un `CHECK` que exige el cliente y ninguna otra clave (punto 2);
  - el cobro a cuenta va **en la moneda que se elija**, no elige una venta, se imputa con la regla y **puede dejar saldo a favor** (puntos 2, 3 y 9);
  - el estado de cuenta, imprimible, y la lista de clientes con saldo deudor; **la lista se mide en su subfase antes de aceptarla**, y si no alcanza, la decisión vuelve con la medición (punto 9 y §Riesgos);
  - el saldo en la ficha y en la venta lo componen las páginas: ni `sales`, ni `orders`, ni `crm` dependen de `cash` (punto 13);
  - **sin** intereses, vencimientos, recordatorios, límite de crédito ni imputación manual (punto 1 y §«Lo que este ADR no decide»).
- **DataModel**: `receipts.target` dice que «la 21.6 sumará `account`» y que reescribe `receipts_target_check` (l. 828-829); la regla de la `0044`, comparar `target::text`, sigue vigente.
- **Overview**, buscado de nuevo con `grep` (paso 5 de la skill de briefs): «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`» (l. 44), y «una lista con datos de dos módulos se compone en memoria, sin `JOIN`» con su límite medido (l. 47-48). La fila de `cash` dice que depende de `sales` y `orders` solo por las lecturas y bloqueos nombrados (l. 34-36).
- **La §Cierre del brief de la 21.5** y HANDOFF §3, paso 0.
- **El código**: `cash` (`imputeAccount`, `toAccountReceipt`, `clientLedger`, `clientAccount`, `saleStanding`, `orderStanding`, `createOrderReceipt`, `voidReceipt`, `destinationsOf`, `getClientRefundForm`), `receipts_target_check` en `cash/schema.ts`, `listClientSalesForAccount` y `SaleForReceipt` de `sales`, `lockClientForOrder` de `crm`, las guardas `cash-writes` y `exposed-surface`, `scripts/medir-caminos.ts` y los textos de `order-receipts-section.tsx` y `sale-receipts-section.tsx`.

Lo que encontró y el ADR no dice:

- **H-1. La regla ya sabe imputar un cobro a cuenta; lo que falta está alrededor.** `AccountReceipt` tiene la variante `account` desde la 21.3, y `imputeAccount` la suma al remanente. Pero **`toAccountReceipt` lanza** con un cobro que no es `sale` ni `order` («cobro sin la clave de su destino»), y `destinationsOf` solo nombra ventas y pedidos. Hay que sumar la rama en las dos; `imputeAccount` no cambia.
- **H-2. El escenario literal de AC-5 no se puede dar nunca, tampoco en la 21.6.** El escenario, diferido desde la 21.3: dos cobros **de ventas distintas** del mismo cliente en cola, con un remanente que alcanza para una sola, y que el segundo vea lo imputado por el primero. **Un cobro contra una venta nunca mueve lo imputado a otra**: si la venta X recibe un cobro `d` con `d` ≤ lo que le falta, lo que X toma del remanente es `min(R, total − directo)`, y como `directo + d + imputado` sigue sin pasar el total, lo imputado a X no cambia, ni lo que queda para las demás. Es el álgebra de R-2 de la 21.3, y vale igual para la seña. **Lo que sí mueve el remanente es el cobro a cuenta**, que no es un cobro de una venta. D-11 propone probar el escenario alcanzable, fijar con una propiedad de `imputation.test.ts` que el literal es inalcanzable, y darlo por cerrado con la aprobación del usuario.
- **H-3. La lista de deudores necesita leer todas las cuentas de la organización, y hoy no hay cómo sin un `JOIN` o un `N+1`.** `listClientSalesForAccount` y `listClientOrdersForAccount` leen **un** cliente. Armar la lista llamando `clientAccount` por cliente son cuatro consultas por cliente. Leer las tablas de `sales` desde `cash` es el `JOIN` que el Overview prohíbe. El ADR 0022, punto 13, prevé que `sales` sume lecturas a su interfaz; `orders` también tiene que sumar una. D-6 propone dos lecturas por organización, sin bloqueo, y componer en memoria.
- **H-4. El cobro a cuenta no tiene tope, y por eso no se cruza mal con nada.** Solo agranda el remanente y lo que está a favor. Con la devolución desde la cuenta, que toma la ficha en modo exclusivo (D-11 de la 21.5), se serializa por el bloqueo de cobros, que las dos toman primero. Con la emisión de una venta, que no toma el bloqueo de cobros, no hay regla que decida con una lectura que la otra cambie: el cobro no tiene tope que la venta achique (es la comprobación «tope por tope» de la 21.5). Toma la ficha **en modo compartido**, como el cobro de una venta (punto 4, paso 3). D-11 prueba el cruce con la devolución.
- **H-5. La imputación no es historia.** Se deriva en cada lectura: anular un cobro o una venta, o cancelar un pedido, cambia a qué venta va cada peso. El estado de cuenta muestra **la imputación de hoy**, y el recibo de un cobro a cuenta no puede decir «se aplicó a V-…» como un hecho fijo. D-5 propone decirlo así en las pantallas.
- **H-6. El texto del pedido cancelado y el de la venta anulada con cliente afirman un saldo a favor que puede no existir.** `order-receipts-section.tsx` dice «lo señado pasó a la cuenta del cliente como saldo a favor», y `sale-receipts-section.tsx`, «Lo cobrado (…) pasó a la cuenta del cliente como saldo a favor». Si el cliente tiene ventas con saldo, el remanente va primero a ellas y lo que queda a favor puede ser cero: es lo que vio el usuario en el paso 5 del recorrido de la 21.5. D-8 propone el texto.
- **H-7. Las anulaciones de venta no tienen número ni fecha en lo que `cash` lee.** `SaleForReceipt` trae `voided: boolean`. El estado de cuenta lista las anulaciones (punto 9), y para eso necesita el número `A-…` y la fecha. D-6 propone que la lectura de `sales` sume la referencia de la anulación.
- **H-8. Ninguna tabla nueva**: la `0046` solo suma un valor al enum y reescribe el `CHECK`. **Las diecisiete specs end-to-end que vacían `receipts` no cambian.** No hay tipo nuevo de `document_kind` (el cobro a cuenta es un recibo `R`) ni de `audit_entity_type`.
- **H-9. La guarda `cash-writes` ya tiene `createAccountReceipt` como caso que tiene que fallar** (`tests/guards/cash-writes.test.ts`, l. 314): un tercer llamador de `insertReceipt` se rechaza. La 21.6 lo suma a los llamadores permitidos de `insertReceipt` (l. 50) y cambia ese caso por otro llamador ajeno.
- **H-10. Volver a `52353a9` no es limpio con un cobro a cuenta cargado**: ese código lanza en `toAccountReceipt` (H-1), y la ficha, la venta y el pedido de ese cliente dejan de cargar. No es solo un número mal sumado: es una página caída.
- **H-11. La demostración tiene con qué recorrerlo.** En Demostración Vixora hay un cliente con ventas, señas aplicadas, una devolución desde la cuenta y anulaciones (recorrido de la 21.5). Los documentos exactos se eligen al recorrerlo (D-14).

## Alcance incluido

1. **Esquema** (migración `0046`, generada con `drizzle-kit generate` y completada a mano), D-1: `account` en `receipt_target` y `receipts_target_check` reescrito.
2. **`cash`**:
   - `createAccountReceipt` (D-2 y D-3);
   - la rama `account` en `toAccountReceipt` y en `destinationsOf` (H-1); `voidReceipt` acepta un cobro a cuenta, con la comprobación de D-5 de la 21.5 tal cual;
   - las lecturas: el estado de cuenta, la lista de deudores, el resumen de la cuenta para la ficha y para la venta, y el formulario del cobro a cuenta (D-4 a D-7).
3. **`sales` y `orders`, solo lecturas** (D-6): una lectura por organización en cada uno, y la referencia de la anulación en las ventas que lee `cash`. Sin escrituras, sin bloqueos y sin dependencias nuevas.
4. **Pantallas** (D-4, D-5, D-7 y D-8).
5. **Medición** de la lista de deudores (D-6), con `scripts/medir-caminos.ts`.
6. **Guardas**: `cash-writes`, con el tercer llamador de `insertReceipt` (H-9); `exposed-surface`, con las acciones nuevas.
7. **Tests**: el `CHECK` nuevo, la imputación con cobros a cuenta, la propiedad de H-2, la serialización y la exportación.
8. **Documentación**:
   - DataModel: `receipts.target`, `receipts_target_check` y la regla 14;
   - Overview: las filas de `cash`, `sales` y `orders`, y el límite medido de la lista de deudores (como l. 47-48);
   - FunctionalRequirements, `FR-CAJ`;
   - Screens;
   - TraceabilityMatrix;
   - SecurityModel, con los recuentos;
   - EngineeringStandards, si cambia el recuento de una guarda.

## Alcance excluido

- **Intereses, vencimientos, recordatorios de deuda y un límite de crédito que bloquee** (ADR 0022, punto 1).
- **La imputación manual de un cobro a cuenta** (§«Lo que este ADR no decide»): el cobro a cuenta no elige una venta.
- **Guardar la imputación**: se deriva en cada lectura (H-5).
- **Un saldo corrido** fila por fila en el estado de cuenta (D-4): una seña retenida cuenta recién cuando su pedido se vende o se cancela, y un saldo corrido por fecha la contaría en un momento que no es el suyo.
- **Que el agente lea la cuenta o el saldo** (punto 12 y §Alternativas): `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **Avisar o cobrar al cliente** por WhatsApp o por otro canal.
- **Las métricas de cobros y de caja**, y las métricas por sección del dashboard (Roadmap §«Fases futuras»).
- **Cambiar `imputeAccount`, `sales` u `orders` más allá de las lecturas de D-6**, y que alguno de ellos importe `cash`.
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0046_*.sql` y `drizzle/meta/*`
- `src/modules/cash/`, con sus tests unitarios. En `imputation.ts`, **solo** comentarios; en `imputation.test.ts`, la propiedad de H-2 y casos con cobros a cuenta
- `src/modules/sales/`: `repository.ts`, `service.ts` e `index.ts`, **solo** las lecturas de D-6
- `src/modules/orders/`: `repository.ts`, `service.ts` e `index.ts`, **solo** la lectura de D-6
- pantallas:
  - `src/app/(autenticado)/clientes/[clientId]/`: `page.tsx` (la tarjeta de la cuenta, D-7), la carpeta nueva `cuenta/` (el estado de cuenta, D-4) y la carpeta nueva `cobrar/` (el cobro a cuenta, D-5); `devolver/page.tsx`, **solo** el enlace al estado de cuenta;
  - `src/app/(autenticado)/caja/`: `cash-sub-nav.tsx` y la carpeta nueva `deudores/` (D-6);
  - `src/app/(autenticado)/cobros/[receiptId]/page.tsx` y `src/app/(autenticado)/caja/cobros/page.tsx`, **solo** el destino «Cuenta del cliente»;
  - `src/app/(autenticado)/ventas/[saleId]/cobrar/sale-receipts-section.tsx` y `messages.ts`, y `src/app/(autenticado)/ventas/[saleId]/page.tsx` si hace falta para el saldo (D-7 y D-8);
  - `src/app/(autenticado)/pedidos/[orderId]/senar/order-receipts-section.tsx`, **solo** el texto de D-8 y el enlace al estado de cuenta
- `scripts/medir-caminos.ts`, **solo** el camino de la lista de deudores
- *Precisado el 2026-10-15 en la implementación, dentro de lo que D-7 y D-9 ya deciden*: `src/app/(autenticado)/clientes/[clientId]/client-account.tsx`, la tarjeta de la ficha como componente aparte, como `client-orders.tsx`; y `src/app/(autenticado)/caja/session-tables.tsx`, **solo** el destino «A cuenta» en los cobros de una sesión, que D-9 pide y la lista de arriba no nombraba
- `tests/integration/`:
  - nuevos: `account-receipts.test.ts` y `client-accounts.test.ts`;
  - `receipts-schema.test.ts`, **solo** el `CHECK` del destino;
  - `receipt-voids.test.ts`, **solo** la anulación de un cobro a cuenta;
  - `client-data.test.ts`, **solo** el cobro a cuenta en la exportación;
  - los tests de `sales` y `orders` que cubran sus lecturas nuevas
- `tests/guards/`: `cash-writes.test.ts` y `exposed-surface.test.ts`
- `tests/e2e/`: nuevo `accounts.spec.ts`
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- `docs/development/EngineeringStandards.md`
- al cerrar la subfase y la fase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `crm`, `catalog`, `inventory`, `knowledge`, `conversations`, `ingestion`, `numbering` y `audit`;
- en `sales` y `orders`, ninguna escritura ni ningún bloqueo;
- en `cash/imputation.ts`, `imputeAccount` y `standaloneSale`;
- `src/shared/`;
- los seeds, los scripts de datos de un cliente y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - `cash`: `imputeAccount`, `toAccountReceipt`, `clientLedger`, `clientAccount`, `remainderBeforeRefunds`, `saleStanding`, `orderStanding`, `createSaleReceipt`, `createOrderReceipt`, `readPayment`, `exceedsCashLimit`, `auditReceipt`, `voidReceipt`, `createRefund` y `destinationsOf`;
  - la `0044` (el `ALTER TYPE` del destino pedido y `receipts_target_check` con `target::text`);
  - `listClientSalesForAccount` y `getSaleForReceipt` de `sales`, `listClientOrdersForAccount` de `orders`, `lockClientForOrder` y `getClientsByIds` de `crm`;
  - las guardas `cash-writes` y `exposed-surface`, y `scripts/medir-caminos.ts`.
- **Las decisiones**:
  - el [ADR 0022](0022-cobros-y-caja.md), puntos 2 a 4, 9 y 11 a 15, con sus notas fechadas de la 21.5;
  - el [brief-8.5](brief-8.5-rendimiento-de-listados.md), D-1: el umbral de un camino compuesto en memoria;
  - el [brief-21.3](brief-21.3-el-cobro-de-una-venta.md) (R-2, el álgebra del escenario de AC-5), el [brief-21.4](brief-21.4-la-sena.md) (H-8) y el [brief-21.5](brief-21.5-la-anulacion-y-la-devolucion.md) (D-11 y su precisión, el hallazgo del recorrido), como molde y por lo que dejaron probado.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. El esquema.** **Recomendado**, en la migración `0046`:

- `ALTER TYPE receipt_target ADD VALUE 'account'`;
- **`receipts_target_check` reescrito**, comparando `target::text` como en la `0044`, porque el migrador aplica todo en una transacción y no deja usar el valor recién agregado (brief-21.4, H-2):

  ```sql
  (target::text = 'sale'    AND sale_id  IS NOT NULL AND order_id IS NULL)
  OR (target::text = 'order'   AND order_id IS NOT NULL AND sale_id  IS NULL)
  OR (target::text = 'account' AND client_id IS NOT NULL AND sale_id IS NULL AND order_id IS NULL)
  ```

- **nada más**: ni columnas, ni índices, ni triggers. `receipts_client_idx` ya sirve para leer los cobros de un cliente, y los triggers de la sesión y de la sesión cerrada son genéricos.

**D-2. El cobro a cuenta.** **Recomendado**: `createAccountReceipt(context, { clientId, currency, paymentMethodId, amount })`, solo de `admin`, en `READ COMMITTED`, como `createOrderReceipt`:

1. **el bloqueo de cobros** de la organización;
2. **el cliente en modo compartido** con `lockClientForOrder` de `crm` (punto 4, paso 3). `not_found` da `NOT_FOUND` (D-3 para el desactivado);
3. **la comprobación**, con `readPayment` y `exceedsCashLimit`: el medio activo; si es efectivo, la sesión abierta; el monto válido en la moneda elegida. **Sin tope contra lo que debe** (H-4): lo que excede queda a favor (puntos 3 y 9);
4. **al final, el contador** `receipt`, la fila con `target = 'account'`, el cliente y ninguna venta ni pedido, y la auditoría con `auditReceipt`.

**Alternativa**: rechazar lo que exceda la deuda. Contradice el punto 9, que dice que el cobro a cuenta puede dejar saldo a favor.

**D-3. El cliente y la moneda.** **Recomendado**:

- **un cliente desactivado se puede cobrar**: su deuda no se cancela al desactivarlo, y el pedido de un cliente desactivado ya sigue abierto en la seña;
- **la moneda**, un código de tres letras en mayúsculas, como las demás. El formulario propone la moneda de la venta con saldo más vieja; si no debe nada, la de la venta más reciente; si no tiene ventas, ninguna, y el `admin` la escribe. Sin lista cerrada de monedas: el ADR 0019 no da a la organización una moneda por defecto.

**D-4. El estado de cuenta.** **Recomendado**: `/clientes/[clientId]/cuenta`, para los dos roles, imprimible como los comprobantes, con `getClientStatement(context, clientId)`:

- **el encabezado**: la organización, el cliente (sin datos de contacto), la fecha y la hora de la lectura, y la leyenda «Documento no válido como factura»;
- **por moneda, el resumen**: debe (ventas vigentes), haber (cobros que cuentan menos devoluciones), saldo, lo que está a favor y las señas retenidas aparte (punto 9);
- **por moneda, las ventas vigentes con su imputación**: número, fecha, total, lo cobrado directo (con las señas de su pedido), lo recibido del remanente y lo que falta. Es «a dónde se aplicó cada peso», con la aclaración de H-5: «Según la cuenta de hoy: anular un cobro, una venta o una devolución cambia la imputación»;
- **los comprobantes**, de la más nueva a la más vieja: ventas, anulaciones de ventas (`A-…`, H-7), cobros con su destino (venta, seña de un pedido o a cuenta), anulaciones de cobros, devoluciones y sus anulaciones. Lo anulado, marcado. **Sin saldo corrido** (§Alcance excluido);
- **sin paginar**: es la lectura que el ADR ya acepta para un cliente (punto 9, «Costo conocido»). Si un cliente supera 500 comprobantes, se muestra el aviso y los primeros 500; el resumen y la imputación siempre son enteros.

**D-5. El cobro a cuenta en pantalla.** **Recomendado**: `/clientes/[clientId]/cobrar`, solo `admin`, con teclado y sin JavaScript:

- muestra, por moneda, **lo que debe hoy** y las ventas con saldo de la más vieja a la más nueva;
- el formulario: moneda, medio y monto, propuesto en lo que debe en la moneda elegida;
- **antes de confirmar**, la vista previa de la regla: «Se aplica a V-000004 (150.000) y V-000007 (50.000); quedan 20.000 a favor», calculada con `imputeAccount` sobre la cuenta más el cobro, sin escribir. La escritura vuelve a leer todo con el bloqueo tomado;
- al escribir, el recibo. El recibo de un cobro a cuenta dice **«Destino: cuenta del cliente»**, con el enlace al estado de cuenta, y **no** afirma a qué venta se aplicó (H-5).

**D-6. La lista de deudores.** **Recomendado**: `/caja/deudores`, para los dos roles, con la pestaña «Deudores» en la navegación de la caja, y `listDebtors(context, { currency?, page })`:

- **una fila por cliente y moneda con saldo deudor**: el cliente (enlace a su estado de cuenta), la moneda, lo que debe, la fecha de la venta con saldo más vieja y cuántas ventas tiene con saldo. Ordenada por moneda y por lo que debe, de mayor a menor; filtro por moneda; paginada de a 25, en memoria;
- **cómo se lee** (H-3), en cuatro consultas por organización y sin `JOIN` entre módulos:
  - de `sales`, una lectura nueva, `listSalesForAccounts(tx, organizationId)`: las ventas **con cliente** de la organización, con los mismos campos que `listClientSalesForAccount`;
  - de `orders`, una lectura nueva, `getOrdersForAccountsByIds(tx, organizationId, ids)`: solo los pedidos que tienen señas;
  - de `cash`, los cobros con cliente y las devoluciones desde la cuenta;
  - se agrupa por cliente y cada cuenta pasa por `imputeAccount`, la misma función. Los nombres, con `getClientsByIds` de `crm`, solo para la página que se muestra.
- **la referencia de la anulación** (H-7): `listClientSalesForAccount` y `listSalesForAccounts` suman, en cada venta anulada, el número y la fecha de su anulación. `SaleForReceipt` suma un campo opcional; nada de lo que ya lo usa cambia;
- **la medición, antes de aceptarla** (punto 9 y §Riesgos), con el umbral fijado **antes de medir**: el de la 8.5, **400 ms el camino completo**, con `scripts/medir-caminos.ts` llamando al servicio real, sobre una organización sembrada con **2.000 clientes, 20.000 ventas, 20.000 cobros y 1.000 señas**, cinco veces lo que se espera de un negocio chico, como la 8.5 sembró cinco veces el límite. Se registra también el plan de cada consulta. **Si no cumple, la subfase se detiene** y la decisión vuelve al usuario con la medición.

**Alternativa**: llamar `clientAccount` por cada cliente con ventas. Son cuatro consultas por cliente: con 2.000 clientes, 8.000 consultas por página.

*Precisado el 2026-10-15, tras la medición (AC-7), por decisión del usuario* («Optimizar y aceptar con límite»): **la lista no cumplió el umbral con el volumen de D-6** (930 a 1.110 ms de mediana) y la subfase se detuvo, como pide §Condiciones de detención. Con el volumen esperado (400 clientes, 4.000 ventas) cumplía (190 a 240 ms). La consulta SQL era la menor parte: el costo es traer y convertir unas 40.000 filas. El usuario eligió optimizar las lecturas sin cambiar la regla ni el diseño y aceptar el límite medido. Se hizo: `sales` lee la anulación de cada venta con un `LEFT JOIN` en lugar de tres subconsultas por fila, y la lista trae solo los cobros vigentes y las columnas que mira la regla (`findAccountsReceipts`), con `ledgerFrom` genérico en los cobros. Después: **170 a 200 ms con 1×, 390 a 620 ms con 5×**. El límite queda en el Overview, junto a los otros listados compuestos, con la condición de revisarlo si un negocio se acerca a 20.000 ventas con cliente. El umbral no se cambió: el veredicto con 5× sigue siendo «no cumple», aceptado.

*Precisado el 2026-10-15, tras la revisión independiente (B-1), por decisión del usuario*: las lecturas de la lista van en una única instantánea (`repeatable read`, solo lectura). En `READ COMMITTED` cada sentencia veía su propia foto, y un cobro o una venta confirmados entre dos de ellas podían hacer lanzar a `imputeAccount`.

**D-7. El saldo en la ficha y en la venta.** **Recomendado**, compuesto por cada página con una lectura de `cash`, `getClientAccountSummary(context, clientId)`:

- **en la ficha del cliente**, una tarjeta «Cuenta corriente»: por moneda, lo que debe o lo que está a favor, y las señas retenidas; los enlaces «Estado de cuenta» y, para `admin`, «Cobrar a cuenta» y, si hay algo a favor, «Devolver saldo a favor». Sin movimientos: son del estado de cuenta;
- **en el detalle de una venta con cliente**, debajo de lo cobrado: «Cuenta del cliente: debe 150.000 ARS» o «tiene 20.000 ARS a favor», con el enlace al estado de cuenta. Solo muestra: no bloquea nada (punto 9, sin límite de crédito).

**D-8. Los textos de lo que pasó a la cuenta** (H-6). **Recomendado**:

- **el pedido cancelado**: «El pedido se canceló: lo señado pasó a la cuenta del cliente. Se aplica primero a sus ventas con saldo, y lo que sobra queda a favor.» Debajo, **lo que está a favor hoy** en esa moneda, si es más que cero, con «Devolver saldo a favor», y siempre el enlace «Ver estado de cuenta»;
- **la venta anulada con cliente**: lo mismo, con «lo cobrado (…)».

**D-9. Las lecturas de un cobro a cuenta en lo que ya existe.** **Recomendado**: el recibo, la lista `/caja/cobros`, la sesión de caja y la anulación muestran el destino «Cuenta del cliente» con el nombre del cliente; la búsqueda por número `R-…` no cambia. La anulación de un cobro a cuenta usa la regla de D-5 de la 21.5 sin cambios: si lo ya devuelto dejaría el remanente negativo, `refunds_exceed_receipts`.

**D-10. Las respuestas.** **Recomendadas**, en el molde de la 21.3 a la 21.5:

- **`FORBIDDEN`** a un `viewer` en el cobro a cuenta y en su formulario.
- **`VALIDATION_ERROR`**: un id que no es uuid, una moneda que no es de tres letras, un monto inválido o en cero, o `limit`.
- **`NOT_FOUND`**: el cliente o el medio no existen en la organización.
- **`BUSINESS_RULE_VIOLATION`**: `payment_method_inactive` y `no_open_session`. No hay `exceeds_outstanding` (D-2).
- **Al escribir**: el id y el número.

**Ningún rechazo escribe, numera ni audita.** La auditoría, `receipt` con `create`, como los otros cobros, con `target: account` y sin datos de la persona.

**D-11. Lo que se cruza, y el escenario de AC-5** (H-2 y H-4). **Recomendado**:

- **el escenario alcanzable**: un cobro a cuenta en cola delante de un cobro de una venta del mismo cliente. El cobro de la venta tiene que leer lo que le falta **después** del cobro a cuenta: si el remanente nuevo ya cubre parte, un monto que antes cabía da `exceeds_outstanding` con lo que falta ahora. Y en el orden inverso, el cobro a cuenta deja a favor lo que la venta ya no necesita;
- **el literal, cerrado como inalcanzable**: una propiedad en `imputation.test.ts` que fija que un cobro directo de una venta, hasta lo que le falta, no cambia lo imputado ni lo que falta de ninguna otra venta del cliente. Con la aprobación del usuario, el escenario literal deja de estar pendiente;
- **un cobro a cuenta y una devolución desde la cuenta en cola**, en los dos órdenes: la devolución que espera ve lo que el cobro dejó a favor;
- **un cobro a cuenta en efectivo y el cierre de la caja en cola**, en los dos órdenes, como el cobro de una venta.

Sin bloqueos nuevos (H-4).

**D-12. Los datos de un cliente.** **Recomendado**: sin cambios en los scripts. El cobro a cuenta es un `receipts` con `client_id`, así que la exportación ya lo trae y `receipts_client_fk` ya impide borrar al cliente. Un test lo fija.

**D-13. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0022 y las reglas vigentes. El cobro a cuenta no tiene tope, `sales` y `orders` suman lecturas, y la subfase cierra la fase.

**D-14. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, con la migración `0046`.

**Volver a `52353a9` no es limpio con un cobro a cuenta cargado** (H-10). Si hay que volver atrás con alguno, primero se anula.

El recorrido, en Demostración Vixora (H-11). Los documentos exactos se eligen al recorrerlo:

1. abrir la caja;
2. ver en la ficha de un cliente con deuda la tarjeta de la cuenta, y abrir su estado de cuenta;
3. **cobrar a cuenta** menos de lo que debe, ver la vista previa y después la imputación en el estado de cuenta;
4. cobrar a cuenta más de lo que debe: la deuda queda en cero y lo que sobra, a favor; **devolverlo** desde la cuenta;
5. anular un cobro a cuenta y ver que la deuda vuelve;
6. ver la lista de deudores, con el filtro por moneda, y el saldo en el detalle de una venta;
7. ver el texto nuevo del pedido cancelado de la 21.5 (`P-000008`);
8. imprimir el estado de cuenta;
9. cerrar la caja con el cobro a cuenta en efectivo en lo esperado.

**D-15. El cierre de la Fase 21.** **Recomendado**: al cerrar la 21.6, con la skill `closing-and-reconciling-phases`, conciliar la fase entera contra el ADR 0022 (punto 15) y el Roadmap, y pedir en su turno la autorización para pasar el proyecto de la fase y su tarea espejo a «Completado» en Notion. Este brief no lo autoriza.

## Invariantes

- Un cobro a cuenta tiene cliente y no tiene venta ni pedido; la base lo exige.
- Es un comprobante de solo inserción de la serie `R`, sin huecos ni repetidos.
- Se imputa con `imputeAccount` y con ninguna otra función: el estado de cuenta, la lista de deudores, la ficha, la venta y el pedido leen la misma cuenta y no pueden contradecirse.
- Lo que debe un cliente en una moneda es la suma de lo que falta de sus ventas, y es cero si tiene algo a favor.
- Un cobro de una venta nunca cambia lo que falta de otra venta del mismo cliente (H-2).
- Nunca queda devuelto más de lo cobrado, también al anular un cobro a cuenta.
- Toda escritura de `cash` toma primero el bloqueo de cobros, el cliente después, y el contador último.
- `sales`, `orders` y `crm` no importan `cash`; `cash` no lee tablas de otros módulos ni bloquea una venta.
- Un `viewer` ve las cuentas sin los datos de contacto del cliente y sin acciones.

## Criterios de aceptación

- **AC-1 (esquema)**: la `0046` corre en la misma transacción que las anteriores. En `receipts-schema.test.ts`: el `CHECK` acepta un cobro a cuenta con cliente y rechaza uno sin cliente, uno con venta y uno con pedido; los destinos `sale` y `order` siguen como estaban.
- **AC-2 (cobro a cuenta)**: numera en `R`; se imputa a las ventas con saldo de la más vieja a la más nueva; lo que excede queda a favor; en una moneda sin ventas queda todo a favor; con un cliente desactivado se cobra (D-3); en efectivo, en la sesión abierta y en lo esperado.
- **AC-3 (anulación)**: un cobro a cuenta se anula; la deuda vuelve; si lo devuelto lo exige, `refunds_exceed_receipts` (D-9).
- **AC-4 (rechazos)**: cada respuesta de D-10, sin escribir, numerar ni auditar; un `viewer` recibe `FORBIDDEN`.
- **AC-5 (serialización)**:
  - **el bloqueo**: el cobro a cuenta espera el bloqueo de cobros retenido desde otra conexión, con la aserción de la regla antes del ayudante de la cola; otra organización no espera;
  - **los escenarios de D-11**, cada uno en los dos órdenes;
  - **la propiedad de H-2** en `imputation.test.ts`.

  Cada escenario lleva su mutación, que lo tumbe **por su regla y no por su andamio**.
- **AC-6 (lecturas)**: el estado de cuenta, el resumen, la vista previa y la lista de deudores coinciden con `imputeAccount` en casos con ventas, anulaciones, señas retenidas, aplicadas y canceladas, cobros a cuenta, devoluciones y varias monedas; un cliente con algo a favor no está en la lista de deudores; otra organización da `NOT_FOUND`; un `viewer` lee sin datos de contacto.
- **AC-7 (medición)**: la lista de deudores cumple 400 ms de camino completo con el volumen de D-6, con el plan de cada consulta registrado. Si no cumple, se detiene.
- **AC-8 (pantallas)**: un end-to-end sobre `next start`:
  - `admin`, con teclado: abre el estado de cuenta desde la ficha, cobra a cuenta con la vista previa, ve la imputación y lo que queda a favor, y lo devuelve;
  - la lista de deudores con el filtro por moneda;
  - el texto nuevo del pedido cancelado y de la venta anulada con cliente (D-8);
  - sin JavaScript: un cobro a cuenta;
  - un `viewer` ve la cuenta y los deudores sin ninguna acción;
  - axe sin violaciones en claro y en oscuro, también en la vista de impresión del estado de cuenta.
- **AC-9 (guardas)**: `cash-writes` fija `createAccountReceipt` como tercer llamador de `insertReceipt` y falla con un cuarto; `exposed-surface` declara las acciones nuevas.
- **AC-10 (fronteras)**: `sales` y `orders` suman solo lecturas, sin escrituras ni bloqueos; ni ellos ni `crm` importan `cash`; `cash` no lee sus tablas; `imputeAccount`, `standaloneSale` y `src/shared/` no cambian.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-12 (datos de un cliente)**: la exportación trae el cobro a cuenta, con su test.
- **AC-13**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-14**: la documentación del punto 8 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-15** (si D-14): producción corre el SHA del cierre con la `0046`. En Demostración Vixora, el recorrido de D-14 se concilia contra la base: los cobros a cuenta con su cliente y sin venta ni pedido; lo que debe cada cliente recorrido y lo que tiene a favor, igual a la regla; lo esperado del cierre; el contador `receipt`; la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7, AC-9 a AC-12, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-11.
- `isolated-runtime`: AC-15, si se despliega.
- **Las mutaciones** se corren y se revierten una por una, **con reemplazos literales**, y **un «detectada» se valida por el caso que falla y por dónde falla**: si cae por el ayudante de la cola o un timeout, no cuenta. Su resultado va a §Resultados. Como mínimo:
  - el cobro a cuenta sin el bloqueo de cobros;
  - `toAccountReceipt` que trata el cobro a cuenta como seña retenida (no cuenta) o lo descarta;
  - la lista de deudores que cuenta como deudor a un cliente con algo a favor, o que no filtra lo anulado;
  - el estado de cuenta que usa una imputación propia en lugar de `imputeAccount` (por ejemplo, de la más nueva a la más vieja);
  - el `CHECK` aceptando un cobro a cuenta con venta;
  - la propiedad de H-2 contra una regla que reparte el remanente después de los cobros directos de otra venta;
  - un cuarto llamador de `insertReceipt` en la guarda;
  - la exportación sin los cobros a cuenta.
- **La medición** se corre contra una base de medición, nunca contra la de un entorno con datos, y su resultado va a §Resultados con el umbral fijado arriba.
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end, y los archivos nuevos van al índice con `git add -N` antes de la batería final. Si el end-to-end completo vuelve a caerse por memoria, se corre en dos mitades y se declara, como en la 21.5; la CI es la prueba.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial `crm`, una escritura o un bloqueo de `sales` u `orders`, `imputeAccount` o `src/shared/`;
- el diseño exigiría cambiar el texto del ADR 0022, del 0021, del 0019 o del 0016;
- `sales`, `orders` o `crm` tendrían que importar `cash`, o `cash` leer sus tablas o bloquear una venta;
- alguna secuencia pudiera dejar devuelto más de lo cobrado, imputar un peso dos veces, o dar en el estado de cuenta, la lista o la ficha un saldo distinto del de `imputeAccount`;
- **la lista de deudores no cumple el umbral de AC-7**;
- una mutación de la lista solo cae por el andamio;
- la migración no corre en la misma transacción que las anteriores;
- la batería de la CI falla por algo que no es del entorno.

## Situación en la fase

- **Necesario ahora**: el cobro a cuenta, el estado de cuenta, la lista de deudores medida, el saldo en la ficha y en la venta, y los textos de D-8.
- **Requisito antes de un negocio real** (13.5.2-b, no de esta subfase): la pregunta de la Ley 27.743 sobre los comprobantes entregados, que ya está en el HANDOFF.
- **Mejora posterior, fuera de la fase**: vencimientos, intereses, recordatorios, la imputación manual, las métricas de cobros y la guarda de dependencias entre módulos.

## Resultados — 2026-10-15 (autoevaluación)

Implementado el 2026-10-15. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-13 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**La detención de AC-7, resuelta por el usuario** (precisión fechada en D-6): la lista de deudores no cumplió 400 ms con el volumen de D-6. Se optimizaron las lecturas sin cambiar la regla ni el diseño, y el límite medido quedó en el Overview. El veredicto con 5× sigue siendo «no cumple», aceptado.

**Precisiones que no cambian una decisión:**

- **Dos archivos fuera de la lista**, precisados arriba en §Archivos autorizados: `client-account.tsx` y `caja/session-tables.tsx`.
- **La optimización de AC-7 tocó lecturas de `sales` que ya existían**: las tres lecturas de ventas que usa `cash` traen la anulación con un `LEFT JOIN` en lugar de tres subconsultas por fila. Son lecturas, sin escrituras ni bloqueos, y las mismas columnas; la autorizó la decisión del usuario sobre AC-7.
- **La anulación de un cobro a cuenta se prueba en `account-receipts.test.ts`** (AC-3), no en `receipt-voids.test.ts`, que no cambió.
- **Las lecturas nuevas de `sales` y `orders` no tienen tests propios**: las cubren las lecturas de la cuenta de `client-accounts.test.ts` y las mutaciones M4 a M6.
- **La `0046` no lleva comentario de cabecera.** El clasificador de permisos de la sesión bloqueó editar el archivo generado, y no se forzó. Por la misma razón, **la migración no corrió contra la base local de desarrollo** (`npm run db:migrate` bloqueado): corre en la base de test, con toda la cadena, cada vez que arranca la integración.
- **La siembra de la medición** vive en el scratchpad de la sesión, fuera del repositorio (`sembrar-cuentas.sql` para 5× y `sembrar-cuentas-1x.sql` para 1×), y corrió contra la base `_test`, nunca contra una con datos. Sus dos organizaciones quedaron en esa base.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | La `0046` corre con toda la cadena en la base de test. `receipts-schema.test.ts`, 31 casos: el `CHECK` acepta el cobro a cuenta con cliente y rechaza uno sin cliente, con venta y con pedido; `sale` y `order` como estaban |
| AC-2 | cumplido | `account-receipts.test.ts`: la serie `R`, la imputación de la más vieja a la más nueva y lo que queda a favor; una moneda sin ventas; un cliente desactivado; el efectivo en la sesión abierta y en lo esperado |
| AC-3 | cumplido | `account-receipts.test.ts`: la deuda vuelve, y `refunds_exceed_receipts` si lo devuelto lo exige |
| AC-4 | cumplido | Cada rechazo de D-10 sin escribir, numerar ni auditar, también el tope del efectivo (`amount: "limit"`, sumado tras la revisión); `FORBIDDEN` para un `viewer` |
| AC-5 | cumplido, con la precisión de abajo | El bloqueo y otra organización; las tres colas de D-11 en los dos órdenes; la propiedad de H-2 en `imputation.test.ts` (500 casos de semilla fija), con el ejemplo de D-11 |
| AC-6 | cumplido | `client-accounts.test.ts`, 6 casos (el de la seña aplicada, sumado tras la revisión): el estado de cuenta, el resumen, el detalle de la venta, la vista previa y la lista de deudores contra la misma regla; quien tiene algo a favor no es deudor; `NOT_FOUND` y el `viewer` |
| AC-7 | no cumple con 5×, aceptado por el usuario | Abajo, en §La medición |
| AC-8 | ver la batería | `accounts.spec.ts` sobre `next start`, cuatro casos: el recorrido del admin con el teclado, hasta el estado de cuenta al día (sumado tras la revisión); los deudores con el filtro y los textos de D-8, el del pedido cancelado entero (sumado tras la revisión); el `viewer`, y el cobro a cuenta sin JavaScript. axe en claro y en oscuro, también en la impresión |
| AC-9 | cumplido | `cash-writes` fija `createAccountReceipt` y falla con un cuarto llamador (M9); `exposed-surface` declara `accountReceiptAction` |
| AC-10 | cumplido, con la precisión de arriba | `sales`, `orders` y `crm` no importan `cash`; `sales` y `orders` suman lecturas sin escrituras ni bloqueos; `crm`, `imputation.ts` y `src/shared/` no están en el diff |
| AC-11 | cumplido en local | `read-api`, `read-api-v2` e `ingestion-v2` en la batería; `docs/contracts/` no está en el diff |
| AC-12 | cumplido | `client-data.test.ts`, caso 44 c |
| AC-13 | ver la batería | Abajo. La CI corre al hacer push |
| AC-14 | cumplido | DataModel (regla 14, el destino y su `CHECK`, el cobro a cuenta y la cuenta corriente), Overview (el límite de la lista y las filas de los módulos), FunctionalRequirements (FR-CAJ-21 a 24), Screens (§37 a §39 y las notas), TraceabilityMatrix y SecurityModel (130 puntos de entrada). EngineeringStandards no necesitó cambios |
| AC-15 | pendiente | El despliegue, si se autoriza (D-14) |

**La precisión de AC-5**: la mutación de la lista para el bloqueo (M1) cae por su regla en el caso del bloqueo. La cola con el cobro de una venta tiene además su propia mutación, que la tumba por su regla (M3). **La cola con la devolución desde la cuenta y la cola con el cierre no la tienen**: corrida M1 contra las tres colas, caen las tres, pero al menos dos por el ayudante de la cola («se esperaban 1 conexiones en un bloqueo y hay 0»), es decir, por el andamio, y eso no cuenta. Esas dos prueban que el resultado es correcto en los dos órdenes, no que lo garantice el bloqueo de cobros; eso lo prueba el caso del bloqueo.

### Mutaciones

Cada mutación se aplicó al código real con un reemplazo literal, se corrió y se revirtió con un script, que restaura el archivo pase lo que pase. «Detectada» quiere decir que falló **el caso previsto**, leído por su nombre y por su aserción, y no por su andamio.

| Id | Mutación | Resultado |
|---|---|---|
| M1 | el cobro a cuenta sin el bloqueo de cobros | Detectada: el caso del bloqueo, en su aserción |
| M2 | `toAccountReceipt` trata el cobro a cuenta como seña retenida | Detectada: la imputación de AC-2 |
| M3 | el cobro a cuenta descartado de la cuenta | Detectada: 10 casos, entre ellos la cola con el cobro de una venta |
| M4 | la lista de deudores cuenta a un cliente sin saldo deudor | Detectada: la lista de deudores |
| M5 | la lista de deudores sin filtrar los cobros anulados | Detectada: la lista de deudores |
| M6 | el estado de cuenta con una imputación propia | Detectada: «salen de la misma regla» |
| M7 | el `CHECK` aceptando un cobro a cuenta con venta | **No corrida**: es una edición de la `0046`, que el clasificador de permisos bloqueó. El rechazo lo prueba `receipts-schema.test.ts` sin mutación |
| M8 | la regla reparte el remanente por lo que falta y no por la fecha | Detectada: las dos propiedades, entre ellas la de H-2 |
| M9 | la guarda: un cuarto llamador de `insertReceipt` | Detectada |
| M10 | la exportación sin los cobros a cuenta | Detectada: caso 44 c |
| M11 | la vista previa calcula sin el cobro | Detectada: la vista previa |

### La medición (AC-7)

`scripts/medir-caminos.ts` contra la base `_test` sembrada, con `ANALYZE` hecho. El umbral, fijado antes de medir: 400 ms de camino completo con 5×.

| Volumen | Antes | Después de optimizar |
|---|---|---|
| 1× (400 clientes, 4.000 ventas) | 190 a 240 ms | 170 a 200 ms |
| 5× | 930 a 1.110 ms | 390 a 620 ms |

Los planes con 5×: ventas, `Hash Left Join`, unos 90 ms; cobros vigentes, `Anti Join`, unos 110 ms; pedidos, unos 3 ms; nombres, 0,3 ms. El resto es traer y convertir las filas. Las corridas fallidas del script son caminos ajenos (productos y conversaciones) que esa organización no tiene.

### La batería

Desde Git Bash, una etapa tras otra y sin nada en paralelo con el end-to-end.

- **Formato, lint y typecheck**: limpios.
- **Unitarios**: 769 de 769. **Guardas**: 654 de 654.
- **Integración**: 1.304 de 1.305. Falló `catalog.test.ts`, «la búsqueda usa el índice GIN» (FR-PROD-11), que depende de la elección del planificador; corrido solo y con su archivo entero pasa, 43 de 43. No es de esta subfase.
- **Build**: pasa.
- **End-to-end**: 195 de 195 en una sola corrida completa sobre `next start` (los 191 anteriores y los 4 de `accounts.spec.ts`). El servidor dejó en su salida dos errores sin efecto en ningún caso: «The destination stream closed early» e «Invalid Server Actions request».

- **Corrida final, con los cambios de la revisión**, en una máquina más cargada (el end-to-end tardó 44 minutos contra 21):
  - formato, lint, typecheck y build limpios; unitarios 769 de 769; guardas 654 de 654;
  - integración, 1.304 de 1.306: fallaron `organization-bootstrap.test.ts` («todos los seeds rechazan la base productiva», por timeout) y `product-images.test.ts` (D-9, el aviso de tamaño). Corridos solos, 19 de 19;
  - end-to-end, 188 de 195. Los siete caídos son de `clients`, `orders`, `product-fields` y `products`. Como la 21.6 toca la sección de señas del pedido, se corrieron esas cuatro specs enteras: 53 de 55. Los dos que quedaron, el caso 9 de `clients.spec.ts` y el 24 de `products.spec.ts`, cayeron por el timeout de 30 s y pasan solos. Ninguno es de esta subfase. La evidencia definitiva es la CI.

## Revisión independiente — 2026-10-15

Un agente que no participó del trabajo, con acceso de solo lectura, revisó contra este brief, el ADR 0022 y las reglas vigentes (D-13). Fijó la escala antes de mirar. Sus hallazgos se verificaron contra el código antes de aceptarse. **No otorga ninguna autorización.**

| Hallazgo | Severidad | Verificación | Qué se hizo |
|---|---|---|---|
| A-1. El estado de cuenta se cae con una moneda en saldo cero: la página formatea `"0"`, y `formatMoney` exige dos decimales | alto | **Confirmado**: cualquier cliente al día en una moneda | `money("0.00")`. El end-to-end del admin termina en el estado de cuenta al día; con el defecto repuesto falla por «Monto con un formato distinto de numeric(14, 2)» (corrido con el build, y revertido) |
| M-1. Ningún test prueba el texto nuevo del pedido cancelado: el de `order-receipts.spec.ts` busca un fragmento que el texto viejo también tiene | medio | **Confirmado** | `accounts.spec.ts` afirma el texto entero, con lo que tiene a favor hoy y el enlace al estado de cuenta |
| M-2. AC-6 no cubre las señas aplicadas, y es el camino propio de la lista de deudores (`ordersById` de toda la organización) | medio | **Confirmado** | Un caso nuevo compara el estado de cuenta, el resumen, el detalle de la venta y la lista con una seña aplicada |
| B-1. La lista de deudores lee en `READ COMMITTED`: con escrituras concurrentes entre sus lecturas, `imputeAccount` puede lanzar | bajo | **Confirmado**: las cuatro lecturas van en una transacción, pero cada sentencia ve su propia foto. El efecto es un error transitorio de la página, no un saldo mal sumado. Las lecturas sin bloqueo de un cliente ya tenían el mismo patrón | **El usuario eligió una sola foto** (2026-10-15): `readDebts` lee en `repeatable read`, solo lectura, con `withSnapshot` en `cash/repository.ts`, como el horario de `knowledge`. Precisado en D-6 |
| B-2. Los dos archivos sumados a §Archivos autorizados en la implementación, y el `LEFT JOIN` en una lectura previa, necesitan ratificación | bajo | **Confirmado**: están declarados, pero no aprobados expresamente | **Ratificados por el usuario** el 2026-10-15, los tres |
| B-3. AC-4 no prueba el rechazo por el tope del efectivo | bajo | **Confirmado** | Sumado al caso de los rechazos |
| B-4. M7 no se corrió | bajo | Declarado arriba | Sin cambios |
| Notas: el Overview decía «las dos lecturas» y son tres; `voidRef` es obligatorio y admite `null`, no opcional; el cobro redirige al estado de cuenta con un aviso que enlaza el recibo, no al recibo (D-5) | nota | **Confirmadas** | El Overview, corregido. Las otras dos se declaran acá: no cambian lo que se ve ni lo que se guarda |

El revisor no pudo ver diffs ni correr nada. **Se completó acá**: el `LEFT JOIN` no duplica filas porque `sale_voids_sale_unique` admite una anulación por venta, y las tres lecturas devuelven las mismas columnas; las mutaciones y la batería son las de §Resultados, más las corridas de los casos nuevos.

