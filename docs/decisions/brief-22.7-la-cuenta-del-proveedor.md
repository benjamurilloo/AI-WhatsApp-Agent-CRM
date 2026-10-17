---
schema: task-brief.v1
task_id: "22.7"
task_type: implementation
generated_at: 2026-10-17
---

# Brief 22.7 — La cuenta del proveedor

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para las lecturas, la regla, las fronteras, las guardas y el rendimiento, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-12).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-12, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: séptima y **última** subfase de la Fase 22 — Compras y proveedores ([Roadmap](../planning/Roadmap.md) §Fase 22), después de la 22.6, cerrada el 2026-10-17. Implementa la fila «22.7» de la nota fechada del 2026-10-16 en el punto 15 del [ADR 0023](0023-compras-y-proveedores.md) ([brief-22.6](brief-22.6-los-pagos-a-proveedores.md), D-1). **Al cerrarla se cierra la fase** (D-13).
- **No abre ni cierra gate.** Es solo lectura y sin migración. Pero suma una lectura de toda la organización a `purchasing`, cierra la fase, y la 21.6, su molde, no cumplió el umbral de su lista a la primera. Por eso se recomienda la revisión independiente (D-11).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-17, con las recomendaciones de D-1 a D-13 (entre ellas D-6, una sola foto en las seis lecturas sin bloqueo de la cuenta del proveedor, con la tarea aparte para las de un cliente, y D-8, los umbrales fijados antes de medir). La tarea 22.7 (`3fb702be6f4e811f8230d2dadab11c13`) sigue en «Esperando» hasta que el usuario autorice el cambio.

## Objetivo

Que un `admin` vea **cuánto le debe el negocio a cada proveedor**, con la misma regla que ya limita el pago:

- **el estado de cuenta** de un proveedor, imprimible: sus recepciones, sus anulaciones, sus pagos y las anulaciones de los pagos, el saldo por moneda y **a qué recepción se aplicó cada peso** pagado a cuenta;
- **el resumen en la ficha del proveedor**: por moneda, lo que se le debe o lo que está a favor del negocio;
- **la lista de proveedores a los que se les debe**, medida antes de aceptarla.

No hay escritura nueva: el pago, su anulación y la cuenta con `imputeAccount` son de la 22.6. `supplierLedger` y `summarizeSupplierAccount` ya existen y ya los usa el tope del pago.

## Lo que se verificó antes de escribir este brief

Contra `main` (`8d07582`), el 2026-10-17:

- **El ADR 0023**, puntos 8 a 15 con sus notas fechadas. Lo que fija para esta subfase:
  - la cuenta se deriva, sin tabla de saldos: al debe las recepciones vigentes, al haber los pagos vigentes, con `imputeAccount` sin cambiar la regla (punto 9);
  - el estado de cuenta, imprimible y con la leyenda «Documento no válido como factura», y la lista de proveedores a los que se les debe, **sin vencimientos ni intereses** (puntos 9 y 13);
  - **solo un `admin`** ve la cuenta del proveedor; un `viewer` no ve nada de compras (punto 12);
  - `cash` depende de `purchasing`, y `purchasing` no depende de `cash` (punto 11).
- **El brief de la 22.6**: D-1 (el corte), D-5 (las tres lecturas y la guarda), D-6 (`supplierLedger`, «una sola función», también para la 22.7), D-13 (las pantallas) y D-14 (el rendimiento), con §Resultados, §Revisión independiente (R4) y §Cierre.
- **El molde de la 21.6** ([brief-21.6](brief-21.6-la-cuenta-corriente.md)): el estado de cuenta (D-4, pantalla 37), la lista de deudores (D-6, pantalla 39) con su medición, su límite aceptado y su instantánea (B-1), y el resumen en la ficha (D-7).
- **Overview**, buscado de nuevo con `grep` (paso 5 de la skill de briefs): «una lista con datos de dos módulos se compone en memoria, sin `JOIN`», con el límite medido de la lista de deudores (l. 56). La fila de `cash` enumera las tres lecturas de `purchasing` de D-5 (l. 36), y la de `purchasing` dice que «solo `cash` depende de `purchasing`, por tres lecturas» y que las pantallas componen el nombre con `getSupplierNames` (l. 37).
- **El código**:
  - `cash`: `supplierLedger`, `supplierAccountInput`, `receiptStanding`, `summarizeSupplierAccount`, `getSupplierAccountPaymentForm`, `getGoodsReceiptPayments` y `getGoodsReceiptPaymentForm` en `supplier-payments.ts`; `receiptsOf` y `supplierPaymentListItems` en `supplier-payment-views.ts`; `findSupplierPayments` en `supplier-payment-repository.ts`; `withSnapshot` en `repository.ts`; `getClientStatement`, `STATEMENT_DOCUMENTS_LIMIT`, `readDebts` y `listDebtors` en `service.ts`; `imputeAccount` en `imputation.ts`;
  - `purchasing`: `payment-reads.ts` y `findSupplierGoodsReceiptsForAccount` en `goods-receipt-repository.ts`;
  - las pantallas: la ficha del proveedor (`compras/proveedores/[supplierId]/page.tsx`, la tarjeta «Pagos»), `purchasing-sub-nav.tsx`, y los de clientes `clientes/[clientId]/cuenta/`, `client-account.tsx` y `caja/deudores/`;
  - la guarda `purchasing-dependencies.test.ts` y `scripts/medir-caminos.ts`.
- **Notion**: la 22.6 en «Completado» y la 22.7 en «Esperando».

Lo que encontró y el ADR no dice:

- **H-1. La lista de proveedores a los que se les debe necesita leer de `purchasing` las recepciones de toda la organización, y hoy no hay cómo.** `listSupplierGoodsReceiptsForAccount` lee un proveedor. Llamar `supplierLedger` por cada proveedor son dos consultas por proveedor, y leer `goods_receipts` desde `cash` es el `JOIN` que el Overview prohíbe. Hace falta **una lectura nueva de `purchasing`**, como la 21.6 sumó `listSalesForAccounts` a `sales` (D-3).
- **H-2. La guarda de la 22.6 vigila la dirección, no la lista de funciones.** `purchasing-dependencies.test.ts` fija que `purchasing` no importa `cash` y que, entre los módulos, solo `cash` importa `purchasing`, pero **no** fija qué funciones importa. Una lectura nueva no la rompe. Lo que sí la enumera son los documentos: D-5 de la 22.6 y las filas de `cash` y `purchasing` del Overview. El HANDOFF del cierre de la 22.6 decía que la guarda «fija la lista de lo que `cash` importa». **Es una imprecisión de la autoevaluación**, y este brief la corrige.
- **H-3. Las lecturas de la cuenta sin bloqueo pueden lanzar con una escritura en el medio.** `supplierLedger` lee primero las recepciones y después los pagos, y en `READ COMMITTED` cada sentencia ve su propia foto. Si entre las dos lecturas se confirman una recepción nueva y un pago contra ella, los pagos traen uno contra una recepción que la primera lectura no vio, e `imputeAccount` lanza («contra la venta …, que no está»; `imputation.ts`, l. 111-114). **En el pago no pasa**: corre con el bloqueo de cobros tomado, y ningún pago nuevo entra en el medio. **Sí pasa en tres lecturas de la 22.6** que van sin bloqueo (`getGoodsReceiptPayments`, `getGoodsReceiptPaymentForm` y `getSupplierAccountPaymentForm`), y pasaría en las tres de esta subfase. El efecto es un error transitorio de la página, no un saldo mal sumado: es B-1 de la 21.6, que el usuario resolvió con una sola foto (`withSnapshot`) para la lista de deudores. La revisión de la 21.6 anotó que **las lecturas de un cliente tienen el mismo patrón**, y siguen así. D-6.
- **H-4. El estado de cuenta necesita la fecha de la anulación de una recepción, y la lectura no la trae.** `GoodsReceiptForPayment` tiene `voidDisplayNumber` y no su fecha. Es H-7 de la 21.6, con las ventas. D-3 propone sumarla a la lectura, como un campo más.
- **H-5. El estado de cuenta no necesita leer de a una las recepciones.** La salvedad de AC-8 de la 22.6 (R4) viene de `receiptsOf`, que lee el número de cada recepción de a una. El estado de cuenta ya tiene **todas** las recepciones del proveedor en `supplierLedger`, así que el número de cada pago sale de ahí. Con usar `receiptsOf` en el estado de cuenta, un proveedor con 500 pagos contra recepciones haría 500 lecturas. D-4 lo prohíbe.
- **H-6. La imputación no es historia.** Como en la 21.6 (H-5), se deriva en cada lectura: anular un pago o una recepción cambia a qué recepción va cada peso. El estado de cuenta muestra **la imputación de hoy**, y lo dice.
- **H-7. Ninguna tabla nueva, ningún tipo nuevo, ninguna escritura.** No hay migración, auditoría ni número nuevos. **Volver a `5251770` es limpio**: solo cambian lecturas y pantallas.
- **H-8. La demostración tiene con qué recorrerlo, pero no tiene deuda.** En producción, «Importaciones Sur» tiene 1.000.000 ARS a favor del negocio, y no hay otro proveedor con recepciones sin pagar (§Cierre de la 22.6). Sin deuda, la lista sale vacía. El recorrido de D-12 carga primero una recepción.
- **H-9. La lista de archivos se derivó del alcance con `grep`**, no de memoria. Por cada parte visible se buscó qué componente la dibuja y en qué rutas se usa. Es la lección de la 21.4 y la 22.6: `session-tables.tsx` quedó dos veces fuera de una lista escrita por pantalla. Lo compartido que esta subfase toca es `purchasing-sub-nav.tsx`, que usan las cuatro listas de Compras. Solo cambia el archivo, no las páginas que lo usan.

## Alcance incluido

1. **`purchasing`, solo lecturas** (D-3):
   - una lectura nueva por organización, `listGoodsReceiptsForAccounts(tx, organizationId)`;
   - la fecha de la anulación en las tres lecturas que dan recepciones a `cash` (H-4).

   Sin escrituras, sin bloqueos y sin dependencias nuevas.
2. **`cash`, solo lecturas** (D-4 a D-7):
   - `getSupplierStatement`, el estado de cuenta;
   - `getSupplierAccountSummary`, el resumen de la ficha;
   - `listSuppliersOwed`, la lista;
   - la lectura de los pagos vigentes de toda la organización, en `supplier-payment-repository.ts`;
   - `withSnapshot` en las lecturas sin bloqueo de la cuenta del proveedor, también las tres de la 22.6 (D-6).
3. **Pantallas** (D-4, D-5 y D-7): el estado de cuenta (pantalla nueva 55), la lista (pantalla nueva 56) con «A pagar» en el submenú, y la tarjeta de la cuenta en la ficha del proveedor (pantalla 42).
4. **Medición** de la lista (D-8), con `scripts/medir-caminos.ts`, y del estado de cuenta y el resumen, en el test de rendimiento de la 22.6.
5. **Tests**: las lecturas contra la regla, la lectura nueva de `purchasing`, el rendimiento y el end-to-end.
6. **Documentación**:
   - el Overview: las filas de `cash` y `purchasing`, y la lista nueva junto a los listados compuestos, con su medición;
   - FunctionalRequirements, `FR-COMP`;
   - Screens: la 42, y la 55 y la 56 nuevas;
   - TraceabilityMatrix;
   - SecurityModel, si cambia algún recuento;
   - DataModel, solo si la lectura nueva lo pide (no hay columnas nuevas).

## Alcance excluido

- **Vencimientos, intereses, recordatorios, condiciones de pago y un límite de crédito del proveedor** (ADR 0023, punto 9).
- **La imputación manual** de un pago a cuenta a una recepción elegida: el pago a cuenta no elige.
- **Que el proveedor devuelva un saldo a favor del negocio** (punto 9 y punto 1).
- **Guardar la imputación o un saldo**: se deriva en cada lectura (H-6).
- **Un saldo corrido** fila por fila en el estado de cuenta, como la 21.6.
- **Mandar el estado de cuenta** al proveedor por WhatsApp, email u otro canal: se imprime.
- **Cualquier escritura**, migración, número, tipo de auditoría o cambio en el pago o en su anulación.
- **Cambiar `imputeAccount`**, `supplierAccountInput` o la regla del tope.
- **La lectura en lote del número de las recepciones** para el detalle de una sesión (AC-8 de la 22.6): el usuario la aceptó sin tarea.
- **Las lecturas sin bloqueo de la cuenta de un cliente** (H-3): tienen el mismo patrón, pero son de la Fase 21. D-6 propone una tarea aparte.
- **Que el agente lea compras o cuentas de proveedores** (ADR 0016, punto 5): `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **Las métricas de compras** y la guarda general de dependencias entre módulos, que sigue como tarea aparte (`3f7702be6f4e81119e1ccf0577cb750e`).

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención: **el primer archivo fuera de la lista detiene el trabajo**, aunque el cambio parezca obvio, y se pregunta antes de seguir.

- `src/modules/purchasing/`: `payment-reads.ts`, `goods-receipt-repository.ts` e `index.ts`, **solo** las lecturas de D-3
- `src/modules/cash/`:
  - `supplier-payments.ts`: las lecturas nuevas y `withSnapshot` en las tres de la 22.6 (D-6). Ningún cambio en `createSupplierPayment`, `voidSupplierPayment`, `supplierAccountInput` ni en el tope;
  - `supplier-payment-repository.ts`: **solo** la lectura de los pagos de toda la organización;
  - un archivo nuevo, `supplier-accounts.ts`, si el estado de cuenta y la lista no caben con claridad en `supplier-payments.ts`;
  - `index.ts`;
  - sus tests unitarios
- pantallas:
  - `src/app/(autenticado)/compras/proveedores/[supplierId]/page.tsx`: la tarjeta «Pagos» pasa a ser la tarjeta de la cuenta (D-5); un componente nuevo `supplier-account.tsx` en esa carpeta, como `client-account.tsx`; y la carpeta nueva `cuenta/` (el estado de cuenta, D-4);
  - `src/app/(autenticado)/compras/proveedores/[supplierId]/pagar/page.tsx`, **solo** el enlace al estado de cuenta;
  - `src/app/(autenticado)/compras/purchasing-sub-nav.tsx`, **solo** «A pagar» (H-9);
  - la carpeta nueva `src/app/(autenticado)/compras/a-pagar/` (la lista, D-7)
- `scripts/medir-caminos.ts`, **solo** el camino de la lista
- `tests/integration/`:
  - nuevo: `supplier-accounts.test.ts`;
  - `supplier-payments.test.ts`, **solo** el bloque de rendimiento (D-8);
  - los tests de `purchasing` que cubran la lectura nueva y la fecha de la anulación
- `tests/guards/`: `purchasing-dependencies.test.ts`, **solo** si hace falta un caso de la lectura nueva; `exposed-surface.test.ts`, **solo** si se suma alguna acción (D-4 y D-7 no proponen ninguna)
- `tests/e2e/`: nuevo `supplier-accounts.spec.ts`
- en `docs/architecture/`: `Overview.md`, `TraceabilityMatrix.md`, `SecurityModel.md` y `DataModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- al cerrar la subfase y la fase: este brief, el [ADR 0023](0023-compras-y-proveedores.md) (**solo** una nota fechada si la fase cierra con algo que el ADR no dice), `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `crm`, `catalog`, `inventory`, `sales`, `orders`, `knowledge`, `conversations`, `ingestion`, `numbering` y `audit`;
- en `purchasing`, ninguna escritura ni ningún bloqueo;
- `cash/imputation.ts`, `cash/service.ts` (la cuenta de clientes y la caja) y `cash/totals.ts`;
- `src/shared/`, `drizzle/`, los seeds y los contratos del agente;
- las pantallas de los pagos, de las recepciones y de la caja.

## Fuentes de verdad

- **El código**:
  - de `cash`, `supplierLedger`, `supplierAccountInput`, `receiptStanding`, `summarizeSupplierAccount`, `getSupplierAccountPaymentForm`, `withSnapshot`, `imputeAccount`, y como molde `getClientStatement`, `readDebts` y `listDebtors`;
  - de `purchasing`, `payment-reads.ts` y `findSupplierGoodsReceiptsForAccount`;
  - la guarda `purchasing-dependencies` y `scripts/medir-caminos.ts`.
- **Las decisiones**:
  - el [ADR 0023](0023-compras-y-proveedores.md), puntos 9, 11 a 13 y 15, con sus notas fechadas;
  - el [brief-22.6](brief-22.6-los-pagos-a-proveedores.md), D-1, D-5, D-6, D-13 y D-14, con R4;
  - el [brief-21.6](brief-21.6-la-cuenta-corriente.md), D-4, D-6 (con sus dos precisiones) y D-7, como molde;
  - el [brief-8.5](brief-8.5-rendimiento-de-listados.md), D-1: el umbral de un camino compuesto en memoria.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Quién lo ve.** **Recomendado**: **solo `admin`** (ADR 0023, punto 12). Un `viewer` que entra por la URL al estado de cuenta o a la lista ve el aviso de página prohibida, y el servicio responde `FORBIDDEN`. La ficha del proveedor ya es solo de `admin`.

**D-2. La regla.** **Recomendado**: **todo sale de `supplierLedger`**, con su entrada `supplierAccountInput`, la misma que usa el tope del pago (brief-22.6, D-6). El estado de cuenta, el resumen, la lista, el formulario del pago a cuenta y lo pagado de una recepción leen la misma cuenta y no pueden contradecirse. La lista arma la entrada de cada proveedor con `supplierAccountInput`, a partir de lo leído para toda la organización, sin otra función.

**D-3. Lo que `purchasing` suma para `cash` (H-1 y H-4).** **Recomendado**, en `payment-reads.ts`:

- **`listGoodsReceiptsForAccounts(tx, organizationId)`**: las recepciones de **toda** la organización, anuladas incluidas, con los campos de `GoodsReceiptForPayment`, ordenadas por proveedor, fecha de emisión y número. Recibe la transacción de `cash`, sin `authorize` y sin bloqueo, como las otras tres;
- **`voidedAt: Date | null`** en `GoodsReceiptForPayment`, en las tres lecturas, tomada de la anulación con el mismo `LEFT JOIN` que ya da su número. Lo que ya usa el tipo no cambia;
- **`getSupplierNames`** pasa a usarse también desde `cash`, para el nombre del encabezado y de la página de la lista. No es una lectura nueva: ya existe, y es solo de `admin`. `cash` la llama con el `context` después de su propio `authorize`, como `listDebtors` llama `getClientsByIds` de `crm`;
- **la guarda**: no cambia, porque fija la dirección y no las funciones (H-2). El Overview y D-5 de la 22.6 quedan enumerando **cuatro lecturas de `purchasing` para `cash`, más `getSupplierNames`**, con una precisión fechada.

*Alternativa*: llamar `supplierLedger` por cada proveedor con recepciones. Con 500 proveedores son 1.000 consultas por página.

**D-4. El estado de cuenta.** **Recomendado**: `/compras/proveedores/[supplierId]/cuenta` (pantalla nueva 55), solo `admin`, imprimible como los comprobantes, con `getSupplierStatement(context, supplierId)`:

- **el encabezado**: la organización, **el proveedor con su CUIT si lo tiene** (sin teléfono ni email), la fecha y la hora de la lectura, y la leyenda «Documento no válido como factura» (punto 13). El CUIT, porque el estado de cuenta es lo que se le muestra a un proveedor para conciliar, y la ficha ya lo guarda (punto 14, «lo mínimo»);
- **por moneda, el resumen**: debe (las recepciones vigentes), haber (los pagos vigentes), el saldo y lo que está a favor del negocio;
- **por moneda, las recepciones vigentes con su imputación**: número, fecha, total, lo pagado directo, lo recibido de la cuenta y lo que falta, con la aclaración de H-6: «Según la cuenta de hoy: anular un pago o una recepción cambia la imputación»;
- **los comprobantes**, de los más nuevos a los más viejos: recepciones, anulaciones de recepciones (`ARC`, con su fecha, H-4), pagos con su destino (la recepción o «a cuenta») y anulaciones de pagos (`APP`). Lo anulado va marcado, cada número enlaza a su comprobante y no hay saldo corrido;
- **el número de la recepción de cada pago sale de las recepciones del ledger** (H-5), nunca de `receiptsOf`;
- **sin paginar**, con el límite de la 21.6: más de 500 comprobantes muestra el aviso y los 500 más nuevos, pero el resumen y la imputación siempre son enteros. Se reutiliza `STATEMENT_DOCUMENTS_LIMIT`;
- **la respuesta**: `NOT_FOUND` si el proveedor no es de la organización (`getSupplierNames` no lo trae), `VALIDATION_ERROR` si el id no es uuid, y `FORBIDDEN` a un `viewer`. Un proveedor desactivado tiene estado de cuenta.

*Alternativa*: el encabezado sin CUIT, como el del cliente sin datos de contacto. Ese criterio protege a un cliente frente a un `viewer`, y acá no hay `viewer`.

**D-5. La tarjeta en la ficha del proveedor.** **Recomendado**: la tarjeta «Pagos» de la 22.6 pasa a ser **«Cuenta»**, en un componente `supplier-account.tsx`, con `getSupplierAccountSummary(context, supplierId)`:

- **por moneda**: «Se le debe 150.000 ARS» o «150.000 ARS a favor del negocio». Si no hay nada, «No se le debe nada»;
- **los enlaces**: «Estado de cuenta», «Pago a cuenta» y «Ver los pagos de este proveedor», que ya estaban;
- **sin movimientos**: son del estado de cuenta.

El formulario del pago a cuenta (pantalla 51) suma el enlace «Estado de cuenta» y nada más.

**D-6. Una sola foto en las lecturas sin bloqueo (H-3).** **Recomendado**:

- **las tres lecturas nuevas** (el estado de cuenta, el resumen y la lista) leen con `withSnapshot`, en `repeatable read` y solo lectura, como la lista de deudores;
- **también las tres de la 22.6** que leen la cuenta sin bloqueo: `getGoodsReceiptPayments`, `getGoodsReceiptPaymentForm` y `getSupplierAccountPaymentForm`. Es cambiar `withTransaction` por `withSnapshot`, sin otro cambio. El pago y su anulación siguen en `READ COMMITTED` detrás del bloqueo de cobros (ADR 0022, punto 4);
- **las lecturas de un cliente** (`getClientAccountSummary`, `getClientStatement` y las demás de `service.ts` que llaman `clientAccount` sin bloqueo) tienen el mismo patrón y quedan fuera: **se propone una tarea en Notion**, en «Esperando», con autorización.

**Cómo se prueba**: el error depende de un intervalo entre dos sentencias que un test no puede fijar sin un gancho en el código. Se propone **declararlo verificado por lectura**, como B-1 de la 21.6. La revisión independiente comprueba que cada lectura sin bloqueo de la cuenta del proveedor pasa por `withSnapshot`, y un caso de la guarda lo fija con texto (D-10).

*Alternativa*: invertir el orden de `supplierLedger` y leer primero los pagos. Un pago visto tiene su recepción confirmada antes, así que la lectura de las recepciones la ve. Cierra el caso que lanza, pero no el de un pago anulado entre las dos lecturas, que deja una foto incoherente aunque no lance. Y cambia la función que usa el pago.

**D-7. La lista de proveedores a los que se les debe.** **Recomendado**: `/compras/a-pagar` (pantalla nueva 56), solo `admin`, con «A pagar» en el submenú de Compras, después de «Pagos», y `listSuppliersOwed(context, { currency, page })`:

- **una fila por proveedor y moneda con algo por pagar**: el proveedor (enlace a su estado de cuenta), la moneda, lo que se le debe, la fecha de la recepción con saldo más vieja y cuántas recepciones tiene con saldo. Ordenada por moneda y por lo que se le debe, de mayor a menor. Tiene filtro por moneda y se pagina de a 25 en memoria, como la de deudores;
- **un proveedor con algo a favor del negocio no está**, y **un proveedor desactivado al que se le debe, sí**, marcado «Desactivado» si `getSupplierNames` lo permite sin otra lectura. Si no lo permite, sin marca y se declara;
- **cómo se lee**, en una sola foto (D-6) y en dos consultas por organización, sin `JOIN` entre módulos:
  - de `purchasing`, `listGoodsReceiptsForAccounts` (D-3);
  - de `cash`, los pagos **vigentes** de toda la organización, con las columnas que mira la regla, como `findAccountsReceipts` de la 21.6;
  - se agrupa por proveedor, cada cuenta pasa por `supplierAccountInput` e `imputeAccount`, y se resume con `summarizeSupplierAccount`. Los nombres, con `getSupplierNames`, solo para la página que se muestra.

**D-8. La medición, antes de aceptarla.** **Recomendado**, con los umbrales fijados **antes de medir**:

- **la lista**: **400 ms de camino completo** (el umbral de la 8.5), con `scripts/medir-caminos.ts` llamando al servicio real, sobre una base de medición con **500 proveedores, 10.000 recepciones (1.000 anuladas) y 10.000 pagos (1.000 anulados)**, en dos monedas. Es cinco veces lo que se espera de un negocio chico (100 proveedores, 2.000 recepciones y 2.000 pagos), como la 21.6. Se registra también 1× y el plan de cada consulta. **Si no cumple con 5×, la subfase se detiene** y la decisión vuelve al usuario con la medición, como en la 21.6;
- **el estado de cuenta y el resumen**: **754 ms** (el umbral de la 13.2), en el bloque de rendimiento de `supplier-payments.test.ts`, con el proveedor que ya siembra la 22.6 (2.000 recepciones y 3.000 pagos, la mitad contra recepciones). El estado de cuenta tiene 5.000 comprobantes y muestra 500.

**D-9. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`** a un `viewer`, en los tres servicios;
- **`VALIDATION_ERROR`**: un id que no es uuid, una moneda que no es de tres letras, una página inválida;
- **`NOT_FOUND`**: el proveedor no es de la organización (el estado de cuenta y el resumen).

Ningún servicio escribe ni audita.

**D-10. Las guardas.** **Recomendado**:

- **`purchasing-dependencies`** no cambia sus reglas (H-2). Suma un caso que fija, **por texto**, que las funciones de la cuenta del proveedor que no escriben y que leen la cuenta llaman `withSnapshot` y no `withTransaction` (D-6), con su caso en rojo;
- **`exposed-surface`** no cambia: D-4 y D-7 no suman acciones, solo páginas que leen con `GET`.

*Alternativa*: sin el caso de texto, y que la revisión lo verifique por lectura. Una guarda de texto es frágil frente a un cambio de nombres, pero es la única defensa automática de H-3.

**D-11. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, los ADR 0022 y 0023 y las reglas vigentes. `purchasing` suma una lectura de toda la organización, D-6 cambia lecturas de la 22.6 y la subfase cierra la fase.

**D-12. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, **sin migración**. El paso 3 corre en modo manual. Volver a `5251770` es limpio (H-7).

El recorrido, en Demostración Vixora, con una recepción cargada primero para que haya deuda (H-8):

1. registrar una recepción de un proveedor que no sea «Importaciones Sur», sin pagarla;
2. ver la lista «A pagar» con ese proveedor, y el filtro por moneda;
3. abrir su ficha: la tarjeta de la cuenta dice lo que se le debe;
4. abrir el estado de cuenta e imprimirlo;
5. pagar una parte a cuenta y ver la imputación en el estado de cuenta, y lo que falta en la lista;
6. ver la ficha y el estado de cuenta de «Importaciones Sur»: 1.000.000 ARS a favor del negocio, con las dos recepciones anuladas, los pagos y sus anulaciones de la 22.6, y fuera de la lista;
7. entrar con un `viewer` a `/compras/a-pagar` y al estado de cuenta por la URL: página prohibida.

Se concilia contra la base, solo con lecturas: lo que se le debe a cada proveedor recorrido, igual a la regla.

**D-13. El cierre de la Fase 22.** **Recomendado**: al cerrar la 22.7, con la skill `closing-and-reconciling-phases`, conciliar la fase entera contra el ADR 0023 (punto 15 y sus notas) y el Roadmap. Después, pedir en su turno la autorización para pasar a «Completado» en Notion el proyecto de la fase y su tarea espejo. Este brief no lo autoriza. El Roadmap registra la fase como cerrada, y lo que sigue lo decide el usuario: la 13.5.2-b conserva su prioridad.

## Invariantes

- La cuenta del proveedor se imputa con `imputeAccount` y con ninguna otra función. El estado de cuenta, el resumen, la lista, el formulario del pago a cuenta y el tope del pago leen la misma cuenta.
- Lo que se le debe a un proveedor en una moneda es la suma de lo que falta de sus recepciones vigentes, y es cero si hay algo a favor del negocio.
- Una recepción anulada no debe nada, y lo pagado contra ella cuenta en la cuenta del proveedor.
- Ninguna lectura de esta subfase escribe, numera, audita ni bloquea.
- `purchasing` no importa `cash`, y `cash` no lee tablas de `purchasing`.
- Solo un `admin` ve la cuenta de un proveedor.

## Criterios de aceptación

- **AC-1 (lecturas de `purchasing`)**: `listGoodsReceiptsForAccounts` trae las recepciones de la organización y ninguna de otra, con las anuladas, en el orden de D-3. `voidedAt` es la fecha de la anulación en las tres lecturas, y nula en una vigente. Ninguna escribe ni bloquea. `purchasing` sigue sin importar `cash`.
- **AC-2 (estado de cuenta)**:
  - coincide con `supplierLedger` en casos con recepciones vigentes y anuladas, un pago contra una anulada, pagos a cuenta y lo pagado de más, anulaciones de pagos, dos monedas y saldo a favor;
  - el número de la recepción de cada pago sale del ledger;
  - con más de 500 comprobantes, el aviso y los 500 más nuevos, con el resumen entero;
  - otra organización da `NOT_FOUND`, y un `viewer`, `FORBIDDEN`.
- **AC-3 (resumen)**: el resumen de la ficha, el estado de cuenta, la lista y el formulario del pago a cuenta de la 22.6 dan los mismos números para el mismo proveedor.
- **AC-4 (lista)**:
  - una fila por proveedor y moneda con algo que pagar;
  - un proveedor con algo a favor, o en cero, no está, y uno desactivado al que se le debe, sí;
  - el filtro por moneda, el orden y la paginación funcionan;
  - otra organización no aparece;
  - **para cada proveedor sembrado, su fila es igual a `summarizeSupplierAccount` de su `supplierLedger`**.
- **AC-5 (una sola foto)**: las seis lecturas de D-6 pasan por `withSnapshot`, verificado por el caso de texto de D-10 y por la revisión independiente. **Se declara que no hay un test de la carrera** (D-6).
- **AC-6 (medición de la lista)**: cumple 400 ms de camino completo con el volumen 5× de D-8, con 1× y el plan de cada consulta registrados. Si no cumple, se detiene.
- **AC-7 (rendimiento del estado de cuenta y del resumen)**: por debajo de 754 ms con el proveedor de la 22.6.
- **AC-8 (pantallas)**: un end-to-end sobre `next start`:
  - un `admin`, con teclado, va de la lista «A pagar» a la ficha, de la tarjeta al estado de cuenta y de un comprobante del estado de cuenta a su página;
  - la vista de impresión del estado de cuenta;
  - el filtro por moneda;
  - un `viewer` ve la página prohibida en las dos URLs;
  - axe sin violaciones, en claro y en oscuro, también en la vista de impresión.
- **AC-9 (guardas)**: `purchasing-dependencies` pasa con el caso de D-10, que falla si una de las seis lecturas vuelve a `withTransaction`.
- **AC-10 (fronteras)**:
  - sin migración;
  - `imputeAccount`, `supplierAccountInput`, el pago, su anulación, `cash/service.ts`, `cash/totals.ts` y `src/shared/` no cambian;
  - `purchasing` suma solo lecturas.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 6 del alcance queda actualizada, con la precisión de H-2, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-12): producción corre el SHA del cierre, sin migración nueva (52 aplicadas). En Demostración Vixora, el recorrido de D-12 se concilia contra la base. Lo que se le debe a cada proveedor recorrido y lo que tiene a favor el negocio tienen que ser iguales a la regla.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7, AC-9, AC-10 y AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-11.
- `isolated-runtime`: AC-14, si se despliega.
- **Las mutaciones** se corren y se revierten una por una, **con reemplazos literales**. **Un «detectada» se valida por el caso que falla y por dónde falla.** Su resultado va a §Resultados. Como mínimo:
  - la lista que cuenta como deuda a un proveedor con algo a favor, o que no descarta los pagos anulados;
  - la lista que omite a un proveedor desactivado;
  - `listGoodsReceiptsForAccounts` sin el filtro de organización, o sin las anuladas;
  - el estado de cuenta con una imputación propia, por ejemplo de la más nueva a la más vieja;
  - el estado de cuenta que no cuenta lo pagado contra una recepción anulada;
  - el resumen que suma lo que está a favor como deuda;
  - `voidedAt` tomado de la recepción y no de su anulación;
  - una de las seis lecturas con `withTransaction` (la guarda de D-10);
  - el filtro por moneda que no filtra.
- **La medición** se corre contra una base de medición, nunca contra la de un entorno con datos, y su resultado va a §Resultados con el umbral fijado arriba.
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada: el primero detiene el trabajo;
- hace falta una migración, una escritura o un bloqueo, o cambiar el pago, su anulación, `imputeAccount` o `supplierAccountInput`;
- el diseño exigiría cambiar el texto del ADR 0023, del 0022 o del 0016;
- `purchasing` tendría que importar `cash`, o `cash` leer tablas de `purchasing`;
- el estado de cuenta, la lista, la ficha o el formulario del pago a cuenta dan, para un mismo proveedor, un saldo distinto del de `supplierLedger`;
- **la lista no cumple el umbral de AC-6**;
- una mutación solo cae por el andamio;
- la batería de la CI falla por algo que no es del entorno.

## Situación en la fase

- **Necesario ahora**: el estado de cuenta, el resumen en la ficha, la lista medida y una sola foto en las lecturas de la cuenta del proveedor.
- **Al cerrar**: la Fase 22 entera, con su conciliación (D-13).
- **Requisito antes de un negocio real** (13.5.2-b, no de esta subfase): lo que ya está en el HANDOFF.
- **Mejora posterior, fuera de la fase**:
  - vencimientos y condiciones de pago;
  - la devolución de un saldo a favor por el proveedor;
  - la lectura en lote de las recepciones en la caja;
  - una sola foto en las lecturas de un cliente (D-6);
  - las métricas de compras;
  - la guarda general de dependencias entre módulos.
