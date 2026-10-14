---
schema: task-brief.v1
task_id: "21.4"
task_type: implementation
generated_at: 2026-10-14
---

# Brief 21.4 — La seña

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el servicio, la imputación alimentada con las señas, la serialización, las guardas y las fronteras, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-14).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-14, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: cuarta subfase de la Fase 21 — Caja y cobros ([Roadmap](../planning/Roadmap.md) §Fase 21), después de la 21.3, cerrada el 2026-10-14. Implementa la fila «21.4» del punto 15 del [ADR 0022](0022-cobros-y-caja.md).
- **No abre ni cierra gate.** Pero crea **la primera dependencia de un módulo hacia `orders` para bloquear**, y la primera migración que suma un valor de enum y lo usa en la misma transacción (H-2). Por eso se recomienda la revisión independiente (D-13).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-14, con las recomendaciones de D-1 a D-14 (entre ellas D-11, el escenario de AC-5 diferido pasa a la 21.6, y D-12, el tope de la CI a 35 minutos). La tarea 21.4 (`3f8702be6f4e81d0923cc66d8fdd3033`) pasó a «En proceso» el 2026-10-14, con la autorización del usuario. **Cerrada el 2026-10-14** (§Cierre).

## Objetivo

Que un `admin` pueda **cobrar una seña** desde el detalle de un pedido `pending` o `confirmed`:

- en uno o varios cobros, parciales y en distintos medios;
- nunca por más de lo que le falta al pedido;
- y, si el medio es efectivo, dentro de la sesión de caja abierta, como el cobro de una venta.

La seña es un cobro (`R-000123`) con destino pedido, no un comprobante aparte. **Mientras el pedido no se vende, queda retenida** para ese pedido. **Cuando se vende**, cuenta para la venta vigente de su cadena. **Cuando se cancela**, pasa a la cuenta del cliente como saldo a favor. La regla de imputación de la 21.3 ya hace todo eso: esta subfase la alimenta con las señas. El detalle del pedido muestra lo señado y qué pasó con eso, y el de la venta, la seña de su pedido.

## Lo que se verificó antes de escribir este brief

Contra `main` (`d87157c`), el 2026-10-14:

- **El ADR 0022 en la fuente**, puntos 2 a 6, 9, 11 a 15 y §Consecuencias. Lo que fija para esta subfase:
  - la seña es un cobro contra un pedido `pending` o `confirmed`; contra uno `delivered` o `cancelled` se rechaza (punto 5);
  - el orden de bloqueo: cobros, **la cabecera del pedido `FOR UPDATE` por la interfaz de `orders`**, el cliente en modo compartido, la comprobación y al final el contador (punto 4);
  - la seña retenida no entra en la imputación; con venta vigente cuenta para ella; con el pedido cancelado, al remanente; con el pedido entregado y su última venta anulada sin reemplazo, sigue retenida (puntos 5 y 9);
  - **«si `lockOrderForSale` sirve tal cual, se generaliza su nombre; si no, `orders` suma una función hermana. Lo decide el brief de la seña»** (punto 13);
  - el Overview actualiza la fila de `orders` desde la 21.4 (§Consecuencias);
  - un test de cada estado del pedido y de la cadena de ventas, incluido el pedido entregado con su venta anulada sin reemplazo (§Consecuencias).
- **DataModel** §`receipts`: «la 21.4 suma `order` y la 21.6, `account`, con `ALTER TYPE`», y el `CHECK receipts_target_check` «que la 21.4 y la 21.6 reescriben con sus destinos».
- **Overview**, l. 34 (la fila de `orders`) y l. 150 a 153 (la enmienda del ADR 0022). **El ADR 0020 ya tiene la nota fechada** (l. 6): desde la 21.4, `cash` también depende de `orders`.
- **El código**: `cash` (`imputation.ts`, `createSaleReceipt`, `saleStanding`), `orders` (`lockOrderForSale`, las transiciones), `sales` (`findSaleForReceipt`, `findClientSalesForAccount`), la `0043`, el migrador de Drizzle instalado, las specs end-to-end y los scripts de datos de un cliente.

Lo que encontró y el ADR no dice:

- **H-1. La imputación ya recibe la seña.** `AccountReceipt` tiene el destino `order` con `currentSaleId` y `cancelled` desde la 21.3 (`cash/imputation.ts`), y sus propiedades ya la cubren («las señas retenidas no entran», M4). **`imputation.ts` no cambia**: lo nuevo es armarle las filas, y para eso hacen falta el estado de cada pedido del cliente y su venta vigente.
- **H-2. Sumar `order` al enum y usarlo en el `CHECK` en la misma migración falla.** El migrador de Drizzle aplica **todas las migraciones pendientes en una sola transacción** (`node_modules/drizzle-orm/pg-core/dialect.js`, l. 60, versión 0.45.2). PostgreSQL no deja usar un valor de enum agregado con `ALTER TYPE … ADD VALUE` antes de confirmar la transacción que lo agregó. **Ninguna migración anterior lo hizo**: la `0037`, la `0040` y la `0041` agregaron valores sin usarlos en el mismo archivo. D-1 recomienda escribir el `CHECK` sobre `target::text`, que no interpreta el literal como valor del enum. La base de test se recrea y migra entera en cada corrida, así que el caso queda probado en cada corrida.
- **H-3. `lockOrderForSale` serviría, pero lee de más.** Bloquea la cabecera `FOR UPDATE` y devuelve estado, cliente, moneda y total, que es lo que necesita la seña, **y además las líneas**, que la seña no usa. Generalizar su nombre cambia la importación en `sales`, una operación cerrada. D-2 recomienda una función hermana que lea solo la cabecera.
- **H-4. La venta vigente de un pedido se deriva de `sales`.** La cadena `replaces_sale_id` deja a lo sumo una venta vigente por pedido (ADR 0021, punto 3). **Las lecturas de `sales` para `cash` no traen el pedido** (`SaleForReceiptRow`). D-3 recomienda sumarle `orderId`: la venta vigente de un pedido es la no anulada con ese pedido.
- **H-5. Lo que le falta a un pedido no pasa por el remanente.** El punto 9 reparte el remanente entre **ventas** con saldo, no entre pedidos. Lo que le falta a un pedido es su total menos sus señas. El total de un pedido no cambia: `orders` no tiene edición de líneas.
- **H-6. La seña y las transiciones del pedido se serializan en la cabecera.** Confirmar, entregar y cancelar bloquean la cabecera `FOR UPDATE` (`transitionOrder`), y la emisión de la venta también (`lockOrderForSale`). Con la cabecera tomada por la seña, ninguna puede cruzarse: una seña nunca cae en un pedido que se canceló o se entregó en el medio.
- **H-7. Cancelar un pedido sí puede cruzarse con un cobro de otra venta.** `cancelOrder` no toma el bloqueo de cobros (punto 6). Si un pedido con señas se cancela mientras se cobra otra venta del mismo cliente, su seña pasa al remanente y lo que le falta a esa venta baja después de que el cobro lo leyó. **Es el mismo caso que la venta anulada durante un cobro** (brief-21.3, D-10): el exceso queda como saldo a favor, no se pierde ni se cuenta dos veces. Se prueba igual, reteniendo el contador `receipt` desde otra conexión.
- **H-8. El escenario de AC-5 que el usuario pasó a la 21.4–21.6 sigue sin poder darse en la 21.4.** El escenario: dos cobros de ventas distintas del mismo cliente en cola, con un remanente que alcanza para una sola, y que el segundo vea lo imputado por el primero. Para que el primer cobro cambie lo que le falta a la otra venta, tiene que mover el remanente. **Una seña no lo mueve**: queda retenida mientras el pedido no se vende, y solo puede cobrarse sobre un pedido sin venta. La primera escritura de `cash` que mueve el remanente es **el cobro a cuenta de la 21.6**. D-11 lo propone ahí. Es la lección del cierre de la 21.3: preguntar antes si el sistema puede producir la precondición.
- **H-9. Las specs end-to-end ya vacían `receipts` antes que `orders`.** Las trece que vacían `orders` tienen `receipts` en la misma sentencia desde la 21.3. No hay que tocarlas.
- **H-10. La CI está cerca de su límite.** La corrida de `0543ef6` tardó 18 de los 25 minutos, y el primer intento lo cortó un runner lento. Esta subfase suma casos de end-to-end. D-12 lo trata.
- **H-11. La demostración tiene con qué recorrerlo.** En Demostración Vixora: el cliente de `P-000005` tiene `V-000004`, a la que le faltan 300.000; los pedidos `P-000001`, `P-000002` y `P-000004` están cancelados, `P-000003` y `P-000005` entregados, y la caja cerrada (`C-000002`). No hay un pedido abierto: el recorrido crea los suyos (D-14).

## Alcance incluido

1. **Esquema** (migración `0044`, generada con `drizzle-kit generate` y completada a mano):
   - `order` en `receipt_target` (valor aditivo);
   - `receipts.order_id`, nulable, con su clave foránea compuesta y su índice;
   - `receipts_target_check` reescrito con los dos destinos, sobre `target::text` (H-2).
2. **`orders`**: el bloqueo de la cabecera para `cash` y dos lecturas sin bloqueo (D-2), sin escrituras.
3. **`sales`**: el pedido en las lecturas para `cash` (D-3), sin escrituras.
4. **`cash`**:
   - la seña (D-4);
   - la imputación alimentada con las señas (D-5), en el cobro de una venta, en la seña y en las lecturas;
   - lo señado de un pedido (D-5), para su detalle;
   - las respuestas de D-6.
5. **Pantallas** (D-8): la sección de cobros en el detalle del pedido y el formulario de la seña; la seña del pedido en el detalle de la venta; el destino en el comprobante y en la lista de cobros.
6. **Datos de un cliente** (D-9): el pedido en la exportación de los cobros, y el runbook.
7. **Guardas**:
   - `cash-writes`: el segundo llamador de `insertReceipt`;
   - `exposed-surface`: la acción nueva.
8. **La CI** (D-12): `timeout-minutes` del job.
9. **Documentación**:
   - DataModel: `receipts`, la nota de §Ventas;
   - Overview: la fila de `orders` y la de `cash`;
   - FunctionalRequirements, `FR-CAJ`;
   - Screens;
   - TraceabilityMatrix;
   - SecurityModel, con los recuentos;
   - EngineeringStandards, si cambia el recuento de una guarda o el tope de la CI.

## Alcance excluido

- **El cobro a cuenta**, **las anulaciones de cobros, las devoluciones y sus anulaciones**, y **el estado de cuenta y la lista de deudores** (21.5 y 21.6).
- **Devolver una seña**: con el pedido cancelado pasa a la cuenta como saldo a favor; devolverla es la devolución de la 21.5.
- **Corregir una seña mal cargada**: es la anulación del cobro de la 21.5. Hasta entonces, como en la 21.3, un efectivo de más se compensa con un retiro de la caja.
- **Que cancelar un pedido o anular su venta mire las señas**: `orders` y `sales` no cambian sus escrituras (punto 6).
- **Lo señado en la lista de pedidos**: haría componer las señas de cada fila. Queda para cuando lo pida el uso.
- **Que el agente lea o registre señas**: `read-v1`, `read-v2` e `ingestion-v2` no cambian, y el pedido que deja el agente se seña como cualquier otro, desde la pantalla (punto 12). «Quiere señar» sigue siendo una etiqueta.
- **El escenario de AC-5 diferido** (H-8), que pasa a la 21.6 (D-11).
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte. Esta subfase suma otra razón: desde ahora, `orders` tampoco debe importar `cash`.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0044_*.sql` y `drizzle/meta/*`
- `src/modules/cash/`, con sus tests unitarios
- `src/modules/orders/`: `index.ts`, `service.ts` y `repository.ts`, **solo** el bloqueo y las lecturas de D-2
- `src/modules/sales/`: `index.ts`, `service.ts` y `repository.ts`, **solo** el pedido en las lecturas de D-3
- `src/app/(autenticado)/pedidos/[orderId]/`: `page.tsx` y la carpeta nueva de la seña (D-8)
- `src/app/(autenticado)/ventas/[saleId]/`: `page.tsx` y `cobrar/`, **solo** la seña del pedido en la sección de cobros
- `src/app/(autenticado)/cobros/` y `src/app/(autenticado)/caja/cobros/`, **solo** el destino
- `scripts/client-data-export.ts`, **solo** el pedido de los cobros (D-9)
- `docs/runbooks/datos-de-un-cliente.md`
- `tests/integration/`:
  - nuevo: `order-receipts.test.ts`;
  - `receipts-schema.test.ts`, solo el destino pedido;
  - `receipts.test.ts`, solo si un caso existente cambia por las señas;
  - `client-data.test.ts`, solo el pedido de los cobros
- `tests/guards/`: `cash-writes.test.ts` y `exposed-surface.test.ts`, **solo** lo de la seña
- `tests/e2e/`: `order-receipts.spec.ts` (nuevo)
- `.github/workflows/ci.yml`, **solo** `timeout-minutes`, si se aprueba D-12
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- `docs/development/EngineeringStandards.md`
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `crm`, `catalog`, `inventory`, `knowledge`, `conversations` e `ingestion`;
- en `orders`, ninguna escritura: `createOrder`, `placeOrderFromIngestion`, las transiciones y `lockOrderForSale` no cambian;
- en `sales`, ninguna escritura: `issueSale`, `issueSaleFromOrder` y `voidSale` no cambian;
- `cash/imputation.ts`, salvo un comentario (H-1);
- `scripts/client-data-delete.ts`: un cliente con pedidos ya no se borra;
- `src/shared/`;
- los seeds y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - `cash` y la `0043`: `imputeAccount`, `createSaleReceipt`, `saleStanding` y los triggers de `receipts`;
  - `orders` (`transitionOrder`, `lockOrderForSale`) y `sales` (`findSaleForReceipt`, `findClientSalesForAccount`);
  - `lockClientForOrder` de `crm`;
  - el migrador de Drizzle instalado (H-2);
  - las guardas `cash-writes` y `exposed-surface`.
- **Las decisiones**:
  - el [ADR 0022](0022-cobros-y-caja.md), puntos 2 a 6, 9, 11 a 15;
  - el [ADR 0020](0020-el-pedido.md), puntos 4 y 6, con su nota del 2026-10-13;
  - el [ADR 0021](0021-la-venta.md), puntos 3 y 9;
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 y 3;
  - el [brief-21.3](brief-21.3-el-cobro-de-una-venta.md), como molde y por lo que dejó probado: la cola determinista, el contador retenido desde otra conexión, `outstandingInput` y los tres desvíos aprobados.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. El destino pedido en `receipts`.** **Recomendado**, en la migración `0044`:

- `ALTER TYPE receipt_target ADD VALUE 'order'`;
- **`order_id`**, uuid nulable, con la clave foránea compuesta `receipts_order_fk` hacia `orders (organization_id, id)`, `ON DELETE RESTRICT`, y el índice `(organization_id, order_id)`;
- **`receipts_target_check`**, reescrito:

  ```
  (target::text = 'sale'  AND sale_id IS NOT NULL AND order_id IS NULL)
  OR (target::text = 'order' AND order_id IS NOT NULL AND sale_id IS NULL)
  ```

  Sobre `target::text` por H-2. La 21.6 lo vuelve a reescribir con `account`.

Los triggers de la `0043` sirven tal cual: el de solo inserción, el de la sesión cerrada y el del efectivo no miran el destino. Que el cliente, la moneda y el tope sean los del pedido lo asegura el servicio, con un test.

**Alternativa**: separar el `ALTER TYPE` en su propia migración. No alcanza: el migrador las aplica todas en la misma transacción (H-2).

**D-2. Lo que `cash` usa de `orders`.** **Recomendado**, en la interfaz de `orders`, sin `AuthContext` y con la transacción de quien llama:

- **`lockOrderForReceipt(tx, organizationId, orderId)`**: la cabecera `FOR UPDATE` (id, número, estado, cliente, moneda, total), o `null`. Es la función hermana de `lockOrderForSale`, sobre el mismo `findOrder`, sin las líneas (H-3);
- **`getOrderForReceipt(tx, organizationId, orderId)`**: lo mismo sin bloquear, para las lecturas;
- **`listClientOrdersForAccount(tx, organizationId, clientId)`**: los pedidos del cliente con su estado, sin bloquear, para armar la imputación.

**Alternativa**: generalizar el nombre de `lockOrderForSale` y usarla tal cual, como dice primero el punto 13 del ADR. Lee las líneas en cada seña y cambia la importación en `sales`, una operación cerrada, sin nada que lo pida.

**D-3. El pedido en las lecturas de `sales`.** **Recomendado**: `SaleForReceipt` suma `orderId`, en `getSaleForReceipt` y en `listClientSalesForAccount`. **La venta vigente de un pedido** es la no anulada con ese `orderId` (H-4). Sin lecturas nuevas en `sales`.

**D-4. La seña.** **Recomendado**: `createOrderReceipt(context, { orderId, paymentMethodId, amount })`, solo de `admin`, en `READ COMMITTED`:

1. **el bloqueo de cobros** de la organización;
2. **la cabecera del pedido** con `lockOrderForReceipt` (D-2);
3. **su cliente** en modo compartido con `lockClientForOrder` de `crm`. Todo pedido tiene cliente;
4. **la comprobación**:
   - el pedido existe y está `pending` o `confirmed`;
   - el medio existe y está activo;
   - si es efectivo, hay una sesión de caja abierta, y lo esperado sigue cabiendo en `numeric(14, 2)` (R-3 de la 21.3);
   - el monto es válido en la moneda del pedido y no supera lo que le falta: su total menos sus señas (H-5);
5. **al final, el contador** `receipt`, la fila y la auditoría.

La seña guarda la moneda y el cliente del pedido. Es un `R` como cualquier cobro: no hay serie aparte.

**Comparte con `createSaleReceipt`** el medio, la sesión, el monto, el contador, la fila y la auditoría, en una función interna del módulo. La guarda `cash-writes` fija los dos llamadores de `insertReceipt`.

**D-5. La imputación alimentada con las señas.** **Recomendado**:

- **una sola función interna arma la cuenta de un cliente**: sus ventas y sus pedidos (D-2, D-3) y sus cobros. Cada cobro con destino pedido lleva `cancelled` (el estado del pedido) y `currentSaleId` (la venta vigente de ese pedido, o ninguna). Con eso, `imputeAccount` decide lo retenido, lo que cuenta para la venta y lo que va al remanente (H-1);
- **el cobro de una venta** la usa: lo que le falta a una venta de un pedido ya descuenta su seña;
- **lo señado de un pedido**, para su detalle:
  - lo señado y lo que le falta (H-5);
  - y su situación: **retenida** (`pending` o `confirmed`, o `delivered` con su última venta anulada sin reemplazo), **aplicada a la venta** `V-…` (con venta vigente), o **pasó a la cuenta del cliente** (`cancelled`);
- **lo cobrado de una venta**, en su detalle, suma la seña de su pedido, con su número.

**D-6. Las respuestas de la seña.** **Recomendadas**, las de la 21.3 con el pedido:

- **`FORBIDDEN`** a un `viewer`.
- **`VALIDATION_ERROR`**: un id que no es uuid, un monto inválido o en cero, o `limit` en efectivo.
- **`NOT_FOUND`**: el pedido o el medio no existen en la organización.
- **`BUSINESS_RULE_VIOLATION`**, con su razón:
  - `order_not_open`, con el estado del pedido (`delivered` o `cancelled`);
  - `exceeds_outstanding`, con lo que falta;
  - `payment_method_inactive`;
  - `no_open_session`.
- **Al escribir**: el id y el número del cobro.

**Ningún rechazo escribe, numera ni audita.**

**D-7. La auditoría.** **Recomendada**: la del cobro (`receipt`, `create`), con `order_number` en lugar de `sale_number`.

**D-8. Las pantallas.** **Recomendadas**:

- **El detalle del pedido, `/pedidos/[orderId]`**: una sección «Señas», compuesta por la página con `cash`:
  - lo señado y lo que le falta;
  - la situación de D-5, con la venta enlazada si se aplicó;
  - la lista de señas: número enlazado, fecha, medio y monto;
  - para `admin`, «Registrar seña» mientras el pedido esté `pending` o `confirmed` y le falte algo.
- **`/pedidos/[orderId]/senar`**: el mismo formulario del cobro de la 21.3 (el medio, el monto propuesto en lo que falta, la lectura del monto y el enlace a «Abrir caja»). Sin JavaScript también. Al guardar, vuelve al pedido con el aviso.
- **El detalle de la venta**: en «Cobros», la seña del pedido de la venta vigente, con su número y el pedido, dentro de lo cobrado.
- **El comprobante `/cobros/[receiptId]`**: el destino es «Pedido P-…» o «Venta V-…».
- **`/caja/cobros`**: la columna «Venta» pasa a «Destino».

Un `viewer` ve todo sin acciones y sin los datos de contacto del cliente.

**D-9. Los datos de un cliente.** **Recomendado**: la exportación de los cobros suma el número del pedido para las señas. El informe del borrado no cambia: los cobros ya se cuentan, y un cliente con pedidos ya no se borra. El runbook lo registra con fecha.

**D-10. Lo que se cruza con la seña.** **Recomendado**, aceptar lo que dice el punto 6 del ADR y probarlo:

- **la seña y las transiciones del pedido** se serializan en la cabecera (H-6): una seña nunca cae en un pedido que se canceló o se entregó mientras tanto;
- **cancelar un pedido durante el cobro de otra venta del mismo cliente** (H-7): el cobro puede quedar por encima de lo que pasó a faltarle, y el exceso queda como saldo a favor de la cuenta. No se pierde ni se cuenta dos veces. **No se agrega una segunda comprobación**, como no se agregó en la 21.3 (D-10): `cancelOrder` no toma el bloqueo de cobros.

**D-11. El escenario de AC-5 diferido.** **Recomendado**: pasarlo a **la 21.6**, con el cobro a cuenta, que es la primera escritura que mueve el remanente (H-8). Sigue dentro de lo que aprobaste («21.4–21.6»). En esta subfase se prueban los escenarios que la seña sí produce (AC-5).

**D-12. El tope de la CI.** **Recomendado**: subir `timeout-minutes` de 25 a **35** en `.github/workflows/ci.yml`, una sola línea (H-10). La corrida de la 21.3 tardó 18 minutos, esta subfase suma end-to-end, y un runner lento ya cortó una. El tope sigue siendo una red ante un cuelgue.

**Alternativa**: dejarlo en 25 y relanzar los intentos cortados. Cada uno cuesta una corrida entera y demora el despliegue, que exige la CI en `success`.

**D-13. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0022 y las reglas vigentes. Esta subfase crea la primera dependencia de `cash` hacia `orders` con bloqueo y cambia el `CHECK` del destino.

**D-14. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, con la migración `0044`.

**Volver a `0543ef6` no es limpio si hay señas**: ese código no conoce el destino pedido, y sus lecturas de la cuenta las dejarían afuera. Lo que le falta a una venta de un pedido señado se vería sin la seña. Si hay que volver atrás con señas cargadas, se avisa antes de cobrar nada.

El recorrido, en Demostración Vixora (H-11), con el cliente de `V-000004`:

1. abrir la caja;
2. crear un pedido, señarlo en efectivo, confirmarlo y entregarlo;
3. emitir su venta: el detalle muestra la seña aplicada y lo que falta;
4. cobrar el resto;
5. crear otro pedido, señarlo por transferencia y cancelarlo: la seña pasa a la cuenta, y a `V-000004` le falta menos;
6. intentar una seña sobre un pedido entregado o una seña de más;
7. cerrar la caja con la seña en efectivo en lo esperado.

## Invariantes

- Un cobro nunca cambia ni se borra: la base lo impide para cualquier rol.
- Un cobro tiene un solo destino: una venta o un pedido, nunca los dos ni ninguno.
- La moneda y el cliente de una seña son los de su pedido.
- Una seña solo entra en un pedido `pending` o `confirmed`, con su cabecera bloqueada, y nunca supera lo que le falta.
- Una seña retenida no cuenta para ninguna venta ni para el saldo; con venta vigente cuenta para ella, y con el pedido cancelado, para el remanente. Lo decide una sola función, `imputeAccount`.
- Un cobro contra una venta nunca supera lo que le falta, con la seña de su pedido ya descontada.
- Un cobro en efectivo está en una sesión abierta; uno que no es en efectivo, en ninguna.
- Toda escritura de `cash` toma primero el bloqueo de cobros; el pedido va después, después el cliente, y el contador último.
- Ningún rechazo escribe, numera ni audita. La serie `R` sigue sin huecos ni repetidos, por organización.
- `cash` bloquea el pedido solo por la interfaz de `orders`, y lee `sales` sin bloquearla. `sales`, `orders` y `crm` no importan `cash`.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0044` suma `order` al enum, `order_id` con su clave y su índice, y el `CHECK` nuevo; corre en la misma transacción que las anteriores (H-2). En `receipts-schema.test.ts`, con el rol dueño:
  - **el destino**: el `CHECK` rechaza una seña sin pedido, un cobro con venta y pedido, y uno de venta con pedido;
  - **la clave compuesta**: rechaza un pedido de otra organización;
  - **el pedido con señas** no se borra;
  - los triggers de la `0043` valen igual para una seña (efectivo sin sesión, sesión cerrada, solo inserción).
- **AC-2 (la seña)**:
  - numera en la serie `R`, con la moneda y el cliente del pedido;
  - admite varias señas parciales en distintos medios, hasta lo que le falta al pedido;
  - rechaza `exceeds_outstanding` con lo que falta;
  - en efectivo, queda en la sesión abierta y suma a lo esperado;
  - la auditoría es la de D-7.
- **AC-3 (la seña en la cuenta)**, un caso por estado:
  - `pending` y `confirmed`: retenida; no baja lo que le falta a ninguna venta ni cambia el saldo;
  - `delivered` con venta vigente: cuenta para esa venta, y su cobro tiene como tope el total menos la seña;
  - la venta anulada y vuelta a emitir: cuenta para la nueva;
  - `delivered` con su última venta anulada sin reemplazo: retenida otra vez;
  - `cancelled`: pasa al remanente, y baja lo que le falta a la venta vigente más vieja del cliente.
- **AC-4 (rechazos)**: cada respuesta de D-6, sin escribir, numerar ni auditar; un `viewer` recibe `FORBIDDEN`.
- **AC-5 (serialización)**:
  - **el bloqueo**: la seña retenida desde otra conexión espera el bloqueo de cobros, y otra organización no espera;
  - **el pedido**: una seña espera una transición del mismo pedido retenida desde otra conexión, y después ve el estado nuevo: `order_not_open` si se canceló o se entregó;
  - **dos señas del mismo pedido en cola** que juntas superan lo que falta: una escrita y un `exceeds_outstanding`;
  - **una seña en efectivo y un cierre de caja en cola**, en los dos órdenes;
  - **el pedido cancelado durante el cobro de otra venta del mismo cliente** (H-7): el exceso queda a favor, una sola vez.

  Cada escenario lleva su mutación, que lo tumbe **por su regla y no por su andamio** (lección de la 21.3, R-2).
- **AC-6 (lecturas)**: los dos roles ven lo señado de un pedido, su situación, la seña en el detalle de la venta, el comprobante con su destino y la lista con la columna «Destino»; un `viewer` sin los datos de contacto; otra organización da `NOT_FOUND`.
- **AC-7 (pantallas)**: un end-to-end sobre `next start`:
  - `admin`, con teclado: abre la caja, seña un pedido en dos medios, ve el rechazo de una seña de más, lo confirma, lo entrega, emite la venta y ve la seña aplicada; cancela otro pedido señado y ve que pasó a la cuenta;
  - sin JavaScript: una seña;
  - un `viewer` no ve ninguna acción;
  - axe sin violaciones en claro y en oscuro.
- **AC-8 (guardas)**: `cash-writes` fija los dos llamadores de `insertReceipt` y falla con su caso nuevo; `exposed-surface` declara la acción nueva.
- **AC-9 (fronteras)**:
  - `cash` usa de `orders` solo las tres funciones de D-2, y de `sales`, las dos lecturas con el pedido;
  - `sales`, `orders` y `crm` no importan `cash`;
  - en `orders` y `sales` solo cambia lo autorizado; `cash/imputation.ts` y `src/shared/` no cambian.
- **AC-10 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-11 (datos de un cliente)**: la exportación trae el pedido de cada seña, con su test.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 9 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-14): producción corre el SHA del cierre con la `0044`. En Demostración Vixora, el recorrido de D-14 se concilia contra la base:
  - las señas, con su pedido, su moneda, su cliente y su medio;
  - lo que le falta a cada venta y a cada pedido, igual a la regla;
  - lo esperado del cierre, con las señas en efectivo;
  - el contador `receipt`;
  - la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-6, AC-8 a AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-7 (UI ↔ servicio ↔ base) y AC-10.
- `isolated-runtime`: AC-14, si se despliega.
- **Las mutaciones** de AC-3, AC-5 y de las guardas se corren y se revierten una por una, **con reemplazos literales**. **Un «detectada» se valida por el caso que falla y por dónde falla**: si el error sale del ayudante de la cola y no de la aserción de la regla, no cuenta (lección de la 21.3, R-2). Su resultado va a §Resultados. Como mínimo:
  - la seña sin el bloqueo de cobros;
  - la seña sin el bloqueo del pedido;
  - el estado del pedido leído antes de su bloqueo;
  - lo que le falta al pedido sin restar sus señas;
  - la seña de un pedido cancelado contada como retenida (`cancelled` sin pasar);
  - la venta vigente del pedido sin descartar las anuladas;
  - el `CHECK` del destino sin exigir que la venta sea nula en una seña;
  - el segundo llamador en la guarda.
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial una escritura de `orders` o de `sales`, otro módulo, `src/shared/`, `cash/imputation.ts` o los contratos del agente;
- el diseño exigiría cambiar el texto del ADR 0022, del 0021, del 0020 o del 0019;
- `sales`, `orders` o `crm` tendrían que importar `cash`, o `cash` bloquear una venta;
- una seña pudiera entrar en un pedido entregado o cancelado, superar lo que le falta, cambiar de moneda o de cliente, o quedar sin sesión siendo efectivo;
- una seña pudiera contar a la vez como retenida y para una venta, o contarse dos veces;
- la migración no corriera en la misma transacción que las anteriores;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- aparece una vía por la que un `viewer` escribe, o un texto libre o un dato personal entra a `receipts`;
- hace falta una dependencia nueva;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.

## Resultados — 2026-10-14 (autoevaluación)

Implementado el 2026-10-14. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-13 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvíos aprobados por el usuario el 2026-10-14:**

- **D-4: cada caso de uso llama a `insertReceipt`.** D-4 pide dos cosas que no caben juntas:
  - compartir con `createSaleReceipt` «el medio, la sesión, el monto, el contador, la fila y la auditoría, en una función interna»;
  - que la guarda fije **los dos** llamadores de `insertReceipt`. Con la escritura en una función interna, el llamador sería uno solo.

  Se siguió AC-8:
  - lo compartido son ayudantes que no escriben: `readReceiptFields`, `readPayment`, `exceedsOutstanding`, `exceedsCashLimit` y `auditReceipt`;
  - `createSaleReceipt` y `createOrderReceipt` llaman cada uno a `insertReceipt`, y la guarda `cash-writes` fija los dos.
- **AC-7: el end-to-end abre la caja por SQL** (revisión independiente, R-3), como `receipts.spec.ts` de la 21.3.
  - Con el teclado se recorre el formulario de la seña.
  - La apertura con el teclado ya la cubre `cash.spec.ts`.
- **El formulario del cobro se reusa para la seña** (revisión independiente, R-4).
  - `ventas/[saleId]/cobrar/receipt-form.tsx` recibe la acción, el destino, el enlace de cancelar y el texto del botón.
  - La lista autorizaba `cobrar/` solo para la seña en la sección de cobros.
  - La alternativa era copiar el formulario en `pedidos/[orderId]/senar/`.
- **La tarjeta «Cobros en efectivo» de la caja dice el destino** (revisión independiente, R-2).
  - Para una seña, la columna «Venta» mostraba «—».
  - `caja/session-tables.tsx` no estaba en la lista autorizada. El usuario lo autorizó, y la columna pasó a «Destino», como en `/caja/cobros`.
  - Lo comprueba el primer caso de `order-receipts.spec.ts`, y lo registran Screens §21 y §26.

**Precisiones que no cambian una decisión:**

- **El recuento de la guarda en SecurityModel estaba atrasado.**
  - Decía «66 que no son páginas», el número de la 20.4. La 21.2 y la 21.3 no lo actualizaron.
  - Con la 21.4, la guarda declara 76. Se corrigió con la nota «corregido en la 21.4», sin reescribir los recuentos anteriores.
- **El pedido con señas no se borra** (AC-1).
  - La guarda de solo inserción de `orders` ya impide borrar cualquier pedido. Sin apagarla, el borrado nunca llegaría a la clave.
  - Por eso el caso apaga `orders_guard` dentro de una transacción que se revierte, y así comprueba la clave.
- **La situación del pedido**, en la lectura, es `none`, `retained`, `applied` o `to_account`. Sale de la misma regla que la imputación.
- **Si un pedido tuviera dos ventas vigentes**, la lectura de la cuenta falla con un error en lugar de elegir una.
  - La cadena `replaces_sale_id` no lo permite (ADR 0021, punto 3).
  - Por eso N6 cae en ese error y no en una aserción.
- **`destinationsOf` lee las ventas y los pedidos uno tras otro** dentro de la transacción, como `saleStanding` en la 21.3.
- **Lo que la 21.4 no prueba**, declarado:
  - **el saldo del cliente**: no hay pantalla que lo lea hasta la 21.6;
  - **las transiciones retenidas de AC-5**: se emulan con un `UPDATE` crudo desde otra conexión, con la cabecera tomada `FOR UPDATE`, y no llaman a `transitionOrder`. El bloqueo que se prueba es el mismo.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | La `0044` corre con toda la cadena en la base de test (H-2). `receipts-schema.test.ts`, 27 casos: el enum con `order`, los tres rechazos del `CHECK`, la seña aceptada, `receipts_order_fk` compuesta, el pedido con señas que no se borra y los triggers de la `0043` sobre una seña |
| AC-2 | cumplido | `order-receipts.test.ts`: la serie `R` con la moneda y el cliente del pedido; las parciales en dos medios hasta lo que falta; `exceeds_outstanding`; el efectivo en la sesión y en lo esperado; la auditoría |
| AC-3 | cumplido | `order-receipts.test.ts`, un caso por estado: `pending` y `confirmed`; `delivered` sin venta (R-6); `delivered` con venta vigente y su tope; la venta anulada sin reemplazo; la anulada y vuelta a emitir; `cancelled` hacia la venta más vieja |
| AC-4 | cumplido | Cada respuesta de D-6, incluido `order_not_open` con el estado, sin escribir, numerar ni auditar; el tope de lo esperado |
| AC-5 | cumplido, con las precisiones de arriba | El bloqueo y otra organización (R-1); las transiciones a `cancelled` y a `delivered`; dos señas en cola; la seña en efectivo y el cierre, en los dos órdenes; H-7 |
| AC-6 | cumplido | Los dos roles leen lo señado, la situación, la seña en la venta (también un `viewer`, R-6), el comprobante y la lista; otra organización da `NOT_FOUND` |
| AC-7 | cumplido, con el desvío de R-3 | `order-receipts.spec.ts`, cuatro casos sobre `next start`: la seña en dos medios con el teclado, el rechazo, el recibo, la caja con el destino, la entrega y la venta con la seña; el pedido cancelado que pasa a la cuenta y la lista con «Destino»; el `viewer`; una seña sin JavaScript. axe en claro y en oscuro |
| AC-8 | cumplido | `cash-writes` fija `createSaleReceipt` y `createOrderReceipt` como llamadores, con su caso nuevo (N8); `exposed-surface` declara `createOrderReceiptAction` |
| AC-9 | cumplido | `cash` usa de `orders` `lockOrderForReceipt`, `getOrderForReceipt` y `listClientOrdersForAccount`, y de `sales` las dos lecturas con `orderId`. `sales`, `orders` y `crm` no importan `cash`. En `orders` y `sales` no cambia ninguna escritura. `cash/imputation.ts` y `src/shared/` no están en el diff |
| AC-10 | cumplido en local | `read-api`, `read-api-v2` e `ingestion-v2` en la batería; `docs/contracts/` no está en el diff |
| AC-11 | cumplido | `client-data.test.ts`, caso 44 b: la exportación trae cada seña con su pedido. El runbook está actualizado |
| AC-12 | cumplido en local, con la nota de la batería | Abajo. La CI corre al hacer push |
| AC-13 | cumplido | DataModel (con la enmienda fechada de R-5), Overview, FunctionalRequirements (FR-CAJ-13 a 15), Screens (§31 nueva; §16, §18, §21, §26, §29 y §30), TraceabilityMatrix, SecurityModel (116 puntos de entrada), EngineeringStandards (35 minutos) y el runbook |
| AC-14 | pendiente | El despliegue, si se autoriza (D-14) |

### Mutaciones

Cada mutación se aplicó al código real con un reemplazo literal, se corrió y se revirtió con un script, que compara el md5 del archivo antes y después.

«Detectada» quiere decir que falló el caso previsto, leído por su nombre en el reporte JSON de vitest, y no todo el archivo. El script, además, descarta el caso previsto si cae por su andamio: el ayudante de la cola o un timeout (lección de la 21.3, R-2).

| Id | Mutación | Resultado |
|---|---|---|
| N1 | la seña sin el bloqueo de cobros | Detectada. El caso del bloqueo cae en `expect(settled).toBe(false)`, antes del ayudante (R-1). Fallan 5 casos de 19: tres caen por el andamio de la cola y uno en la limpieza, que encuentra una conexión retenida |
| N2 | la seña sin el bloqueo del pedido | Detectada por las dos transiciones retenidas |
| N3 | el estado del pedido leído antes de su bloqueo | Detectada por las dos transiciones retenidas |
| N4 | lo que falta sin restar las señas | Detectada por las parciales y por las dos señas en cola |
| N5 | la seña de un pedido cancelado contada como retenida | Detectada por `cancelled` y por H-7 |
| N6 | la venta vigente sin descartar las anuladas | Detectada por los dos casos de la venta anulada. **Cae en el invariante del código** («no está vigente»), no en una aserción |
| N7 | el `CHECK` sin exigir la venta nula en una seña | Detectada en `receipts-schema.test.ts` |
| N8 | un tercer llamador de `insertReceipt` | Detectada por la guarda |
| N9 | la seña sin comprobar el estado del pedido | Detectada por los rechazos de D-6 y por las transiciones |
| N10 | la seña que nunca cuenta para la venta vigente | Detectada por los dos casos de la venta vigente |
| N11 | la exportación sin el pedido de la seña | Detectada por el caso 44 b |
| N12 | la seña sin copiar el cliente del pedido | Detectada por el caso de la serie |

N1 se volvió a correr después de corregir R-1. En la primera corrida, su caso caía solo en el ayudante que cuenta las conexiones en espera, y el script lo aceptaba por una excepción declarada. Esa excepción ya no existe.

### La batería

Desde Git Bash, en serie, con los archivos nuevos en el índice por `git add -N`, el 2026-10-14:

| Paso | Resultado |
|---|---|
| `format:check`, `lint`, `typecheck` | exit 0 |
| `test:unit` | 763 casos en 74 archivos |
| `test:guards` | 647 casos en 21 archivos |
| `test:integration` | exit 1: pasaron 1213 casos de 1217. El worker de `read-api-messages.test.ts` se cerró con `3221226505` (`0xC0000409`) sin llegar a una aserción |
| `build` | exit 0 |
| `test:e2e` | exit 1: pasaron 185, y 2 casos de `receipts.spec.ts` (de la 21.3) superaron los 30 s |

**Ninguna de las dos caídas es una aserción, y las dos se repitieron:**

- `read-api-messages.test.ts` pasó corrido solo: 13 casos. Es el mismo cierre forzado del proceso en Windows que la 21.3 vio en `cash.test.ts` y `orders-schema.test.ts`.
- Corridos solos, los dos casos de `receipts.spec.ts` tardan 17,4 s y 10,7 s, y pasaron junto con los otros seis de `receipts.spec.ts` y `order-receipts.spec.ts`. En la corrida completa, el end-to-end tardó 26,7 minutos.
- **El end-to-end completo se repitió** después de R-2, con el paso nuevo de la caja, y pasó: 187 casos en 18,0 minutos.

Después de R-1, R-2 y R-6 pasaron:
- `format:check` de los archivos tocados;
- `order-receipts.test.ts`, 19 casos;
- los dos end-to-end de la caja y la seña.

## Revisión independiente — 2026-10-14

Un agente que no participó del trabajo revisó la entrega contra este brief y contra las reglas vigentes, con acceso de solo lectura. **No encontró bloqueantes.** Cada hallazgo se verificó contra el código antes de aceptarlo:

| Hallazgo | Severidad | Tratamiento |
|---|---|---|
| R-1. N1 solo caía por el ayudante de la cola: el caso del bloqueo no tenía una aserción de la regla | importante | Corregido. Antes del ayudante, el caso espera un segundo y comprueba que la seña no terminó ni escribió. N1 cae ahí |
| R-2. La tarjeta «Cobros en efectivo» de la caja muestra «—» para una seña | importante | Corregido con la autorización del usuario: la columna es «Destino» |
| R-3. AC-7 pide abrir la caja con el teclado, y la spec la abre por SQL | importante | Desvío aprobado por el usuario |
| R-4. El formulario del cobro se parametrizó, fuera de lo autorizado en `cobrar/` | menor | Desvío aprobado por el usuario |
| R-5. La nota de DataModel sobre el `CHECK` cambiaba un texto anterior sin fecha | menor | Corregido: enmienda fechada «Enmendado el 2026-10-14 en la 21.4» |
| R-6. Faltaban `delivered` sin venta y la lectura de un `viewer` con una seña; y dos límites sin declarar | menor | Corregido: un caso nuevo, y los límites declarados arriba |
| R-7. `.claude/settings.json` está sin versionar en el árbol | nota | No entra en el commit |

El revisor también señaló la contradicción interna de D-4: está registrada arriba, y el usuario aprobó el desvío. El revisor no otorga autorizaciones.

## Cierre de la subfase 21.4, 2026-10-14

Cierra el 2026-10-14, después del recorrido del usuario en producción («listo, todo esta perfecto») y del cierre de la caja que completó el paso 7.

- **AC-1 a AC-14 cumplidos**, con los cuatro desvíos aprobados. AC-12 se cumple con la batería de arriba y la CI. AC-14, con el despliegue y el recorrido de abajo.
- **Commit, CI y despliegue**:
  - `44dcdb1`, la implementación. La CI 38632388142 terminó en `success` en 18 minutos al primer intento, ya con el tope de 35 (D-12), y se leyó por el SHA completo.
  - Desplegado el 2026-10-14 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `0543ef6` anotado como la versión para volver atrás. La migración `0044` se aplicó, y la última línea comparó HEAD con el SHA pedido.
  - Después del despliegue:
    - el servicio, `active`;
    - `/login`, con `200`;
    - 45 migraciones aplicadas;
    - `receipt_target` con `{sale,order}`;
    - los 3 cobros de la 21.3, sin cambios.
- **El recorrido del usuario (AC-14)**, en «Demostración Vixora»: los siete pasos de D-14. **Conciliado contra la base**, solo con lecturas y sin datos de la persona:
  - tres cobros nuevos en ARS, cada uno con la moneda y el cliente de su destino:
    - `R-000004`: 150.000,00 de seña de `P-000006`, en efectivo, en `C-000003`;
    - `R-000005`: 360.000,00 de `V-000005`, con tarjeta de crédito, sin sesión;
    - `R-000006`: 60.000,00 de seña de `P-000007`, por transferencia bancaria, sin sesión;
  - **`P-000006` entregado y `V-000005` emitida desde él**:
    - total 510.000,00: la seña más el cobro la cubren entera, así que le falta 0;
    - la seña cuenta para esa venta, y no se cuenta dos veces.
  - **`P-000007` cancelado**, del cliente de `V-000004`:
    - su seña pasó al remanente, y a `V-000004` le faltan 240.000,00, antes 300.000,00. Es lo que da la regla;
    - las ventas anuladas de la organización, `V-000001` y `V-000003`, no tienen cobros, así que no suman al remanente.
  - **`C-000003` cerrada**: el inicial de 2.550.000,00 más la seña en efectivo dan 2.700.000,00, sin movimientos. Es lo esperado que guardó el cierre, y lo contado es igual;
  - **los contadores**: `receipt` en 6, `order` en 7, `sale` en 5 y `cash_session` en 3. La seña de más y la seña sobre un pedido entregado, que se rechazaron, no consumieron número;
  - **la auditoría**: tres `create` de `receipt` con claves planas. Las señas llevan `order_number` y el cobro `sale_number`; solo la de efectivo lleva `session_number`, y ninguno tiene datos de la persona.

  Las dos señas rechazadas y lo que se vio en pantalla no dejan rastro en la base: la evidencia es la confirmación del usuario.
- **Revisión**: la independiente (R-1 a R-7, arriba). La batería, el despliegue, la conciliación y este cierre son autoevaluación declarada.
- **Decisiones del usuario**:
  - el brief, con las recomendaciones de D-1 a D-14;
  - **los cuatro desvíos, aprobados el 2026-10-14**: los dos llamadores de `insertReceipt` (D-4), la caja abierta por SQL en el end-to-end (R-3), el formulario del cobro reusado (R-4) y `caja/session-tables.tsx` con «Destino» (R-2);
  - la tarea en «En proceso», el commit con su push, el despliegue después de la CI y las reglas de permiso locales para `ssh crm-production` y `gh run list`.
- **Nivel**:
  - validado localmente y en CI;
  - **validado en integración** para las pantallas (end-to-end sobre `next start`);
  - desplegado en producción y recorrido por el usuario en la organización de demostración.

  No es «preparado para producción».
- **No certifica**:
  - **que volver a `0543ef6` sea limpio**: hay señas cargadas, y ese código no las conoce. Lo que le falta a `V-000004` se vería sin los 60.000,00 de `P-000007`, y lo cobrado de `V-000005`, sin la seña (D-14);
  - en producción, los rechazos de AC-4 y la concurrencia de AC-5, que cubren los tests;
  - el saldo del cliente, que no tiene pantalla hasta la 21.6;
  - el escenario de AC-5 con un remanente que cambia: pasó a la 21.6 (D-11);
  - que el recibo de una seña cumpla una exigencia fiscal: es un comprobante interno.
- **Queda anotado**:
  - en la batería local, un proceso de vitest cayó con `0xC0000409` y dos end-to-end de la 21.3 pasaron los 30 s en la corrida completa. Repetidos, en verde, y en la CI pasaron;
  - la regla `Bash(ssh crm-production:*)` habilita cualquier comando en producción, no solo lecturas. Conviene quitarla de `.claude/settings.local.json` si no se va a desplegar pronto.
