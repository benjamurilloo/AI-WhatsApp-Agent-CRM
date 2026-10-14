---
schema: task-brief.v1
task_id: "21.3"
task_type: implementation
generated_at: 2026-10-14
---

# Brief 21.3 — El cobro de una venta

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, la regla de imputación, el servicio, la serialización, las guardas y las fronteras, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-12).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-12, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: tercera subfase de la Fase 21 — Caja y cobros ([Roadmap](../planning/Roadmap.md) §Fase 21), después de la 21.2, cerrada el 2026-10-14. Implementa la fila «21.3» del punto 15 del [ADR 0022](0022-cobros-y-caja.md).
- **No abre ni cierra gate.** Pero crea el primer comprobante de dinero, la regla de imputación que van a usar la 21.4 a la 21.6, y **la primera dependencia de un módulo hacia `sales`**. Por eso se recomienda la revisión independiente (D-11).
- **Estado de este documento**: **aprobado el 2026-10-14**, con las recomendaciones de D-1 a D-12 tal como están escritas. **Cerrado el 2026-10-14** (§Cierre). La tarea 21.3 (`3f8702be6f4e814d824ae1c87cb0b95c`) pasó a «En proceso» con la autorización del usuario y pasa a «Completado» al cierre, con su autorización.

## Objetivo

Que un `admin` pueda **cobrar una venta** desde su detalle:

- en uno o varios cobros, parciales y en distintos medios;
- nunca por más de lo que le falta cobrar;
- y, si el medio es efectivo, dentro de la sesión de caja abierta, que suma el cobro a lo esperado de su moneda.

Cada cobro es un comprobante de solo inserción, `R-000123`, con su página imprimible. El detalle de la venta muestra lo cobrado y lo que falta. Si la venta tiene cliente, lo que falta sale de la **regla de imputación** del punto 9 del ADR: una función pura que esta subfase escribe entera y que las siguientes alimentan con las señas, los cobros a cuenta y las devoluciones. Un `viewer` ve todo sin escribir nada.

## Lo que se verificó antes de escribir este brief

Contra `main` (`11b9f0b`), el 2026-10-14:

- **El ADR 0022 en la fuente**, puntos 2 a 4, 6, 8, 9, 11 a 15 y §Consecuencias. Lo que fija para esta subfase:
  - el cobro tiene un solo destino, en una columna discriminadora con un `CHECK`;
  - copia el cliente de su destino, y eso lo asegura el servicio, no un trigger;
  - no tiene texto libre;
  - nunca supera lo que le falta cobrar al destino;
  - el orden de bloqueo: cobros, después el cliente en modo compartido por `crm`, la comprobación y al final el contador;
  - la caja suma los cobros en efectivo;
  - la imputación entera como función pura con tests de propiedades;
  - el caso de la venta anulada durante un cobro, con su test.
- **DataModel**, nota del 2026-10-13 al final de §Ventas: «la 21.3 crea `receipts` con el destino venta; la 21.4 le suma el destino pedido, y la 21.6, el destino cuenta». Y §`cash_session_closing_amounts`: lo esperado suma los cobros en efectivo desde la 21.3.
- **Overview**, l. 148 a 152: «Ningún módulo depende de `sales`», con la enmienda del ADR 0022 de que la 21.3 actualiza la fila de `sales`. **El ADR 0021 ya tiene la nota fechada** (l. 7): desde la 21.3, `cash` depende de `sales` para leer, y `sales` no suma ninguna dependencia.
- **El código**: `sales`, `crm`, `cash`, `numbering`, la `0042`, `scripts/client-data-export.ts`, `scripts/client-data-delete.ts` y los end-to-end.

Lo que encontró y el ADR no dice:

- **H-1. El bloqueo del cliente ya existe.** `crm` exporta `lockClientForOrder`, que bloquea la ficha en modo compartido, y **`sales` ya la usa para la venta** (`sales/service.ts`, l. 161 y 357), aunque el nombre diga «pedido». `cash` puede usarla igual, sin tocar `crm`. D-3 lo recomienda. Renombrarla sería un cambio de `crm`, `orders` y `sales` sin nada que lo pida.
- **H-2. `sales` no tiene las lecturas que `cash` necesita.** `getSale` es para una pantalla: pide un `AuthContext` y devuelve el cliente según el rol. Hace falta:
  - leer una venta dentro de la transacción de `cash`: total, moneda, cliente, si está anulada y su fecha;
  - leer las ventas de un cliente, para la imputación.

  D-4 recomienda dos lecturas nuevas, que reciben la transacción. **Es la primera vez que un módulo importa `sales`**: los comentarios de `sales/index.ts` y de `sales/service.ts` (l. 58) dicen «Ningún módulo depende de sales» y se corrigen, como pide el ADR 0022, §Consecuencias.
- **H-3. El trigger de la sesión cerrada sirve tal cual.** `cash_reject_closed_session()` lee `NEW.session_id`. Si la columna del cobro se llama igual y es nulable, un cobro que no es en efectivo pasa sin consultar nada, y uno en efectivo en una sesión cerrada se rechaza. D-1 lo recomienda.
- **H-4. «Es efectivo» y la sesión los puede atar la base.** `is_cash` vive en `payment_methods`, del mismo módulo. Un trigger de `receipts` puede exigir sesión si el medio es efectivo, y ninguna si no lo es, sin cruzar módulos (D-1). **La copia del cliente, la moneda y el tope contra la venta no**: leerían `sales`, y el ADR (punto 2) dice que eso lo asegura el servicio, con un test.
- **H-5. La venta anulada durante un cobro se puede reproducir.** `voidSale` no toma el bloqueo de cobros. El cobro lee la venta después de los bloqueos y antes del contador. Si otra conexión retiene la fila del contador de `receipt`, el cobro queda esperando con la venta ya leída. En ese momento se anula la venta y se suelta el contador. AC-5 lo usa.
- **H-6. La imputación es entera, pero esta subfase la alimenta en parte.** En la 21.3 solo hay cobros contra ventas, y anulaciones de venta desde la 20.4. Señas, cobros a cuenta y devoluciones llegan en la 21.4 a la 21.6. El ADR pide la función entera ahora (punto 15). D-2 recomienda que reciba todos los términos del punto 9, que la 21.3 pase vacíos los que no existen y que los tests de propiedades los cubran a todos. **No es una tabla vacía**: es la regla aceptada, escrita una sola vez.
- **H-7. No hay librería de tests de propiedades.** `package.json` no tiene `fast-check` ni otra, e instalar una necesita autorización. D-2 recomienda un generador propio con semilla fija dentro del test, sin dependencia nueva.
- **H-8. Los cobros de una venta anulada ya tienen un lugar.** Por el punto 6, con cliente pasan a su cuenta como saldo a favor, y la imputación los reparte entre sus otras ventas con saldo. Sin cliente, quedan a devolver. **En la 21.3 ya se ve**: el cobro de una venta anulada de un cliente reduce lo que falta en su venta vigente más vieja. D-8 lo muestra en el detalle de las dos ventas.
- **H-9. Trece end-to-end vacían `sales` con `TRUNCATE`**, y `cash.spec.ts` vacía las tablas de la caja. `receipts` apunta a las dos, así que tiene que entrar en esas sentencias. Es lo mismo que pasó con `sale_voids` en la 20.4, H-9.
- **H-10. Los tests que enumeran tablas y valores** suman lo nuevo:
  - `identity-schema.test.ts` (la tabla; lección de la 21.2);
  - `audit.test.ts` (`INSERT_ONLY_TABLES`);
  - `numbering.test.ts` (el prefijo `R`).
- **H-11. Los datos de un cliente.** `client-data-export.ts` y `client-data-delete.ts` son SQL directo sobre `@/shared/db`. Suman los cobros del cliente (los comprobantes, no el saldo: punto 14 y R-14 del ADR) y su recuento. Un cliente con cobros ya no se borra por sus ventas, así que el criterio de borrado no cambia en la práctica, pero la clave foránea lo fija igual.
- **H-12. La demostración tiene ventas para el recorrido.** En Demostración Vixora, según el HANDOFF del 2026-10-14:
  - `V-000002`, sin cliente;
  - `V-000004`, con cliente, desde `P-000005`;
  - `V-000001` y `V-000003`, anuladas;
  - y la caja cerrada (`C-000001`).

  D-12 propone el recorrido con esas.

## Alcance incluido

1. **Esquema** (migración `0043`, generada con `drizzle-kit generate` y completada a mano):
   - `receipt` en `document_kind` y en `audit_entity_type` (valores aditivos);
   - el enum `receipt_target`, con `sale` (D-1);
   - **`receipts`** (D-1), con:
     - `SELECT` e `INSERT` para `crm_app`;
     - `cash_reject_change()`;
     - `cash_reject_closed_session()`;
     - el trigger del efectivo (H-4).
2. **`numbering`**: el tipo `receipt` con el prefijo `R`.
3. **`sales`**: dos lecturas nuevas para `cash` (D-4), sin escrituras, y los comentarios de H-2.
4. **`cash`**:
   - la regla de imputación, función pura en su archivo, con sus tests de propiedades (D-2);
   - el cobro de una venta (D-3);
   - lo cobrado de una venta (D-2), para el detalle;
   - los cobros en la caja (D-5);
   - las lecturas del cobro: su comprobante, los de una venta, los de una sesión y la lista (D-8);
   - las respuestas de D-6.
5. **Pantallas** (D-8): la sección de cobros en el detalle de la venta, el formulario del cobro, el comprobante y la lista de cobros; los cobros en la caja y en el arqueo.
6. **Datos de un cliente** (D-9): la exportación, el informe del borrado y el runbook.
7. **Guardas**:
   - `cash-writes`: `receipts` y su única escritura;
   - `exposed-surface`: las acciones nuevas.
8. **Documentación**:
   - DataModel: `receipts`, `document_counters`, `audit_logs`, la regla 10 y la nota de §Ventas;
   - Overview: la fila de `sales` y la de `cash`;
   - FunctionalRequirements, `FR-CAJ`;
   - Screens;
   - TraceabilityMatrix;
   - SecurityModel, con los recuentos;
   - EngineeringStandards, si cambia el recuento de una guarda.

## Alcance excluido

- **La seña** (cobro contra un pedido), **el cobro a cuenta**, **las anulaciones de cobros, las devoluciones y sus anulaciones**, y **el estado de cuenta y la lista de deudores** (21.4 a 21.6). La regla de imputación los recibe vacíos (H-6).
- **Una forma de corregir un cobro mal cargado**: la anulación del cobro es de la 21.5. Hasta entonces, un cobro mal cargado queda. Un cobro en efectivo de más se compensa con un retiro de la caja, con el motivo «Corrección de caja».
- **El saldo del cliente** en su ficha y en la venta, y la cuenta corriente como pantalla (21.6). En la 21.3 el detalle de la venta muestra lo que le falta a **esa** venta.
- **Si una venta está cobrada, en la lista de ventas**: haría componer la cuenta de cada fila. Queda para cuando la pida el uso.
- **Vuelto, cuotas, recargos, descuentos por medio y tipos de cambio** (ADR 0022, puntos 1 y 3).
- **Que el agente lea o registre cobros**: `read-v1`, `read-v2` e `ingestion-v2` no cambian (punto 12).
- **Métricas de cobros.**
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte. Esta subfase suma otra razón para hacerla: desde ahora, `sales` no debe importar `cash`, y nada lo vigila.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0043_*.sql` y `drizzle/meta/*`
- `src/modules/cash/`, con sus tests unitarios
- `src/modules/sales/`: `index.ts`, `service.ts` y `repository.ts`, **solo** las dos lecturas de D-4 y los comentarios de H-2
- `src/modules/numbering/`: `schema.ts` y `service.ts`, **solo** el tipo `receipt` y su prefijo
- `src/modules/audit/schema.ts`, **solo** `receipt`
- `src/app/(autenticado)/caja/`
- `src/app/(autenticado)/ventas/[saleId]/`: `page.tsx` y la carpeta nueva del cobro (D-8)
- `src/app/(autenticado)/cobros/` (nuevo), el comprobante
- `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`, **solo** los cobros (D-9)
- `docs/runbooks/datos-de-un-cliente.md`
- `tests/integration/`:
  - nuevos: `receipts.test.ts` y `receipts-schema.test.ts`;
  - `cash.test.ts`, solo lo esperado con cobros;
  - `numbering.test.ts`;
  - `audit.test.ts` e `identity-schema.test.ts`, solo la tabla y los valores nuevos (H-10);
  - `client-data.test.ts`, solo los cobros
- `tests/guards/`: `cash-writes.test.ts` y `exposed-surface.test.ts`, **solo** lo de los cobros
- `tests/e2e/`:
  - `receipts.spec.ts` (nuevo);
  - `cash.spec.ts`;
  - y los trece que vacían `sales` con `TRUNCATE`, **solo** para sumar `receipts` a esa sentencia (H-9)
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- `docs/development/EngineeringStandards.md`
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `orders`, `crm`, `catalog`, `inventory`, `knowledge`, `conversations` e `ingestion`;
- en `sales`, ninguna escritura: `issueSale`, `issueSaleFromOrder` y `voidSale` no cambian;
- `src/shared/`;
- los seeds y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - `cash` y la `0042`: el bloqueo, los triggers, `computeCashTotals` y `planClosing`;
  - `sales` (`voidSale`, `sale_voids`) y `lockClientForOrder` de `crm`;
  - `numbering`, `audit` y `src/shared/money`;
  - las guardas `cash-writes` y `exposed-surface`.
- **Las decisiones**:
  - el [ADR 0022](0022-cobros-y-caja.md), puntos 2 a 4, 6, 8, 9, 11 a 15;
  - el [ADR 0021](0021-la-venta.md), puntos 3, 7 y 9, con su nota del 2026-10-13;
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 y 3;
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md);
  - el [brief-21.2](brief-21.2-los-medios-de-pago-y-la-caja.md), como molde y por lo que dejó probado: la cola determinista, los rescates por restricción y la confirmación que envía lo que mostró.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. La tabla `receipts`.** **Recomendada**:

- **columnas**:
  - `id`, `organization_id`, `number`;
  - `target`, del enum `receipt_target`, que nace con un solo valor, `sale`. La 21.4 le suma `order` y la 21.6, `account`, con `ALTER TYPE`;
  - `sale_id`;
  - `client_id`, nulable: la copia del cliente de la venta;
  - `payment_method_id`;
  - `session_id`, nulable: la sesión de caja, solo si el medio es efectivo (H-3);
  - `currency`, `amount`;
  - `created_by`, `created_at`.
- **`CHECK`**:
  - `receipts_target_check`: `target = 'sale' AND sale_id IS NOT NULL`. La 21.4 y la 21.6 lo reescriben con sus destinos, como dice el punto 2 del ADR;
  - `amount > 0`;
  - la moneda, `^[A-Z]{3}$`;
  - `number > 0`.
- **Claves**:
  - `UNIQUE (organization_id, number)` y `UNIQUE (organization_id, id)`;
  - compuestas, con `ON DELETE RESTRICT`, hacia `sales`, `clients`, `payment_methods` y `cash_sessions`. La de `clients` es la que impide borrar un cliente con cobros;
  - `created_by` hacia `users`.
- **Triggers**:
  - `cash_reject_change()`, de solo inserción;
  - `cash_reject_closed_session()`, `BEFORE INSERT`. Con `session_id` nulo no consulta nada;
  - **`receipts_cash_session`**, `BEFORE INSERT`: lee el medio y exige `session_id` si es efectivo, y que sea nulo si no lo es. Rechaza con `P0001`.
- **Índices**: `(organization_id, sale_id)` para los cobros de una venta, `(organization_id, client_id)` para la imputación y `(organization_id, session_id)` para la caja.

Que el cliente, la moneda y el tope sean los de la venta lo asegura el servicio, con un test (H-4).

**Alternativa**: las columnas `order_id` y el `CHECK` completo de los tres destinos desde ahora. Serían columnas que ninguna escritura usa hasta la 21.4, lo que `CLAUDE.md` llama especulativo.

**D-2. La regla de imputación y lo que falta cobrar.** **Recomendada**:

- **`imputation.ts`, una función pura**, sin base, que recibe por moneda:
  - las ventas vigentes del cliente, con su total, fecha de emisión y número;
  - los cobros con su destino: una venta (con si está vigente), un pedido (con su estado y su venta vigente) o la cuenta;
  - las devoluciones vigentes.

  Devuelve, por moneda y por venta, lo cobrado directo, lo imputado del remanente y lo que falta, además de lo retenido en señas y el saldo a favor. Sigue el punto 9 paso a paso: primero los cobros directos de cada venta, hasta su total; después el remanente, de la venta más vieja a la más nueva, por fecha y luego por número; y lo que sobra es saldo a favor.
- **En la 21.3** la alimentan las ventas del cliente y sus cobros contra ventas. Pedidos, cuenta y devoluciones van vacíos (H-6).
- **La venta sin cliente** no pasa por la regla: lo que falta es su total menos sus cobros. Si está anulada, lo cobrado queda **a devolver**.
- **Los tests de propiedades**, con un generador propio de semilla fija y unos cientos de casos por propiedad (H-7):
  - ninguna venta recibe más que su total;
  - el saldo del cliente es el debe menos el haber, y coincide con la suma de lo que falta menos el saldo a favor;
  - el remanente se reparte de la más vieja a la más nueva: si una venta tiene saldo, ninguna más vieja lo tiene sin que el remanente se haya agotado;
  - ninguna moneda se mezcla con otra;
  - las señas retenidas no entran;
  - la función no depende del orden en que llegan las filas.

  Más los casos de ejemplo del punto 9, escritos a mano.

**Alternativa**: instalar `fast-check`. Necesita tu autorización para la dependencia, y el generador propio alcanza para estas propiedades.

**D-3. El cobro.** **Recomendado**: `createSaleReceipt(context, { saleId, paymentMethodId, amount })`, solo de `admin`, en una transacción en `READ COMMITTED`:

1. **el bloqueo de cobros** de la organización;
2. **la venta**, leída por `sales` (D-4). Si tiene cliente, su ficha en modo compartido con `lockClientForOrder` de `crm` (H-1), y después se vuelve a leer la venta;
3. **la comprobación**:
   - la venta existe y no está anulada;
   - el medio existe y está activo;
   - si es efectivo, hay una sesión de caja abierta: se toma la que esté abierta;
   - el monto es válido en la moneda de la venta y no supera lo que falta, calculado con D-2 sobre las ventas y los cobros del cliente leídos ahora;
4. **al final, el contador** `receipt`, después la fila y la auditoría.

El cobro guarda la moneda y el cliente de la venta. **No lleva una confirmación en dos pasos**: es un solo formulario, con el monto propuesto en lo que falta.

**Por qué la sesión se busca adentro y no viaja en el formulario**, al revés de los movimientos de la 21.2 (R-1): el cobro no es «de esta sesión». Es plata que entra ahora, y cuenta en la sesión que esté abierta cuando se registra. Si la caja se cerró y se volvió a abrir en el medio, va a la nueva, y está bien.

**D-4. Las lecturas nuevas de `sales`.** **Recomendadas**, en la interfaz de `sales`, sin `AuthContext` y con la transacción de quien llama:

- `getSaleForReceipt(tx, organizationId, saleId)`: id, número, cliente, moneda, total, fecha de emisión y si está anulada, o `null`;
- `listClientSalesForAccount(tx, organizationId, clientId)`: lo mismo para todas las ventas del cliente, anuladas incluidas.

Ninguna bloquea, porque una venta no se puede bloquear (ADR 0022, punto 4). Las dos leen dentro de la transacción de `cash`, después del bloqueo de cobros. **El pedido de la venta y su cadena** (`replaces_sale_id`) los suma la 21.4, que los necesita para las señas.

**D-5. Los cobros en la caja.** **Recomendado**:

- **lo esperado** suma los cobros en efectivo de la sesión, por moneda: `computeCashTotals` recibe sus filas y `planClosing` los cuenta;
- **el cierre exige** contar también cada moneda que tuvo un cobro en efectivo;
- **el estado de la caja y el arqueo** suman la columna «Cobros» por moneda y la lista de los cobros en efectivo de la sesión, con su número enlazado;
- **un retiro** sigue sin poder dejar lo esperado en negativo, ahora con los cobros sumados.

**D-6. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`** a un `viewer` en el cobro.
- **`VALIDATION_ERROR`**: un id que no es uuid, o un monto inválido o en cero.
- **`NOT_FOUND`**: la venta o el medio no existen en la organización.
- **`BUSINESS_RULE_VIOLATION`**, con su razón:
  - `sale_voided`;
  - `exceeds_outstanding`, con lo que falta (que puede ser cero);
  - `payment_method_inactive`;
  - `no_open_session`, para un cobro en efectivo con la caja cerrada.
- **Al escribir**: el id y el número del cobro.

**Ningún rechazo escribe, numera ni audita.**

**D-7. La auditoría.** **Recomendada**: `entity_type` `receipt`, acción `create`. El `diff`, con claves planas como el de la 21.2 (R-4): `number`, `sale_number`, `payment_method`, `currency`, `amount` y, si es efectivo, `session_number`. Sin datos de la persona. La historia de la venta no lo muestra, porque `sales` no lee `cash`. El cobro se ve en la sección de cobros y en su comprobante.

**D-8. Las pantallas.** **Recomendadas**:

- **El detalle de la venta, `/ventas/[saleId]`**: una sección «Cobros», compuesta por la página con `cash`:
  - el total, lo cobrado directo y, si hay cliente, lo imputado desde su cuenta;
  - lo que falta, o «Cobrada»;
  - la lista de cobros: número enlazado, fecha, medio y monto;
  - para `admin`, «Registrar cobro» mientras falte algo y la venta no esté anulada.

  **En una venta anulada**, en lugar de lo que falta:
  - con cliente: «Lo cobrado pasó a la cuenta del cliente como saldo a favor» (H-8);
  - sin cliente: «A devolver: …». La devolución es de la 21.5.
- **`/ventas/[saleId]/cobrar`**:
  - el medio, como grupo de opciones con los activos;
  - el monto, propuesto en lo que falta, con la lectura del monto de la 21.2 («Se lee: $ …»);
  - si se elige efectivo sin caja abierta, el rechazo `no_open_session` enlaza a «Abrir caja».

  Funciona sin JavaScript. Al guardar, vuelve al detalle de la venta con el aviso y el enlace al comprobante.
- **`/cobros/[receiptId]`**, el comprobante imprimible (punto 11 del ADR):
  - la organización;
  - «Recibo R-000123» y la fecha;
  - el cliente, o «Consumidor final»;
  - la venta enlazada;
  - el medio y el monto;
  - la leyenda «Documento no válido como factura».

  Está fuera de `/ventas` porque la 21.4 y la 21.6 suman otros destinos.
- **`/caja/cobros`**, en la barra de la caja: la lista paginada de cobros, del más nuevo al más viejo, con número, fecha, venta, cliente, medio y monto. Busca por número (`R-000123` o `123`), que es «el buscador que suma su prefijo» del punto 11.
- **`/caja` y el arqueo**: lo de D-5.

Un `viewer` ve todo sin acciones y sin los datos de contacto del cliente.

**D-9. Los datos de un cliente.** **Recomendado**:

- la exportación suma `receipts`: número, fecha, número de venta, medio, moneda y monto;
- el informe del borrado los cuenta y dice que quedan, sin texto de la persona;
- el runbook lo registra con fecha.

**D-10. La venta anulada durante un cobro.** **Recomendado**: aceptarlo como dice el punto 4 del ADR, y probarlo.

- Si la venta se anula después de que el cobro la leyó, el cobro queda contra una venta anulada.
- Con cliente, su monto pasa a la cuenta como saldo a favor y se imputa a sus otras ventas. Sin cliente, queda a devolver.
- No se pierde ni se cuenta dos veces.

El test retiene el contador `receipt` desde otra conexión (H-5). **No se agrega una segunda comprobación** como la de la 20.4: `voidSale` no toma el bloqueo de cobros, así que la anulación podría llegar igual después de comprobar.

**D-11. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0022 y las reglas vigentes. Esta subfase crea el primer comprobante de dinero, la regla de imputación de toda la fase y la primera dependencia hacia `sales`.

**D-12. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, con la migración `0043`.

**Volver a `3cda4f8` es limpio en la base**: ese código no lee `receipts`. Pero la caja de ese código no suma los cobros en efectivo, así que **una sesión abierta con cobros se cerraría con lo esperado equivocado**. Si hay que volver atrás, primero se cierra la sesión con el código nuevo.

El recorrido, en Demostración Vixora (H-12):

1. abrir la caja;
2. cobrar `V-000002` (sin cliente) en dos partes, una en efectivo y otra con otro medio, hasta «Cobrada»;
3. intentar un cobro de más;
4. cobrar una parte de `V-000004`;
5. imprimir un recibo;
6. buscarlo en «Cobros»;
7. cerrar la caja con el cobro en efectivo en lo esperado.

## Invariantes

- Un cobro nunca cambia ni se borra: la base lo impide para cualquier rol.
- Un cobro tiene un solo destino; en esta subfase, una venta.
- La moneda y el cliente de un cobro son los de su venta.
- Un cobro contra una venta nunca supera lo que le falta, calculado con la regla de imputación con el bloqueo de cobros tomado.
- Un cobro en efectivo está en una sesión abierta; uno que no es en efectivo, en ninguna.
- Lo esperado de una moneda suma sus cobros en efectivo y nunca baja de cero.
- La regla de imputación es una sola función, y lo que falta de una venta y el saldo del cliente salen de ella.
- Toda escritura de `cash` toma primero el bloqueo de cobros de su organización; el contador va último.
- Ningún rechazo escribe, numera ni audita. La serie `R` sigue sin huecos ni repetidos, por organización.
- `cash` lee `sales` sin bloquearla y sin escribir en ella; `sales`, `orders` y `crm` no importan `cash`.
- Ningún cobro guarda texto libre ni datos de una persona.
- `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0043` suma los valores de enum, el enum `receipt_target` y `receipts`. En `receipts-schema.test.ts`, con el rol dueño:
  - **privilegios**: `crm_app` tiene `SELECT` e `INSERT`;
  - **solo inserción**: `UPDATE` y `DELETE` rechazados con `P0001`;
  - **el destino**: el `CHECK` rechaza un cobro sin venta;
  - **el efectivo**: el trigger rechaza un cobro en efectivo sin sesión y uno que no es en efectivo con sesión;
  - **la sesión cerrada**: el trigger rechaza un cobro en una sesión con cierre;
  - **las claves compuestas**: rechazan una venta, un cliente, un medio o una sesión de otra organización;
  - **los `CHECK`** del monto, la moneda y el número;
  - **el cliente con cobros** no se borra.
- **AC-2 (la imputación)**: `imputation.test.ts` pasa con las propiedades y los ejemplos de D-2, y cada propiedad tiene una mutación que la tumba.
- **AC-3 (el cobro)**:
  - el cobro numera `R-000001` y sigue la serie;
  - guarda la moneda y el cliente de la venta, y una venta sin cliente lo deja nulo;
  - admite varios cobros parciales en distintos medios hasta «Cobrada»;
  - rechaza `exceeds_outstanding` con lo que falta;
  - en efectivo, queda en la sesión abierta y suma a lo esperado de su moneda; el cierre lo exige contado;
  - con un cliente que tiene un cobro en una venta anulada, lo que falta en su venta vigente más vieja baja por ese monto (H-8);
  - la auditoría es la de D-7.
- **AC-4 (rechazos)**: cada respuesta de D-6, sin escribir, numerar ni auditar; un `viewer` recibe `FORBIDDEN`.
- **AC-5 (serialización)**:
  - **el bloqueo**: el cobro retenido desde otra conexión espera el bloqueo de cobros, y otra organización no espera;
  - **dos cobros de la misma venta en cola determinista**, que juntos superan lo que falta: uno escrito y un `exceeds_outstanding`;
  - **dos cobros de ventas distintas del mismo cliente en cola**, con un remanente que alcanza para una sola: el segundo ve lo imputado por el primero;
  - **un cobro en efectivo y un cierre de caja en cola, en los dos órdenes**: el cobro dentro del arqueo, o un `no_open_session`;
  - **la venta anulada durante un cobro** (D-10, H-5): el cobro queda contra la venta anulada, y su monto aparece como saldo a favor o a devolver, una sola vez;
  - **el cliente**: un cobro de una venta con cliente espera una edición del cliente retenida desde otra conexión, y no retiene el bloqueo de cobros de forma que frene otra organización.

  Cada escenario lleva su mutación.
- **AC-6 (lecturas)**: los dos roles ven lo cobrado de una venta, el comprobante, la lista de cobros con la búsqueda y los cobros de una sesión; un `viewer` sin los datos de contacto; otra organización da `NOT_FOUND`.
- **AC-7 (pantallas)**: un end-to-end sobre `next start`:
  - `admin`, con teclado: abre la caja, cobra una venta en dos partes y en dos medios hasta «Cobrada», ve el rechazo de un cobro de más, imprime el recibo, lo busca en «Cobros» y cierra la caja con el cobro en lo esperado;
  - sin JavaScript: un cobro;
  - un `viewer` no ve ninguna acción;
  - axe sin violaciones en claro y en oscuro.
- **AC-8 (guardas)**: `cash-writes` cubre `receipts` y falla con sus casos nuevos; `exposed-surface` declara las acciones nuevas.
- **AC-9 (fronteras)**:
  - `cash` importa `sales` solo por las dos lecturas de D-4, y `crm` solo por `lockClientForOrder` y la lectura del cliente;
  - `sales`, `orders` y `crm` no importan `cash`;
  - en `sales` solo cambian lo autorizado; `src/shared/` no está en el diff.
- **AC-10 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-11 (datos de un cliente)**: la exportación trae sus cobros y el informe del borrado los cuenta, con sus tests.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 8 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-12): producción corre el SHA del cierre con la `0043`. En Demostración Vixora, el recorrido de D-12 se concilia contra la base:
  - los cobros, con su moneda, su cliente y su medio;
  - lo cobrado de cada venta, igual a la regla;
  - lo esperado del cierre, con los cobros en efectivo;
  - el contador `receipt`;
  - la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-6, AC-8 a AC-11, contra PostgreSQL real de desarrollo y de la CI; AC-2, puro.
- `producer-consumer`: AC-7 (UI ↔ servicio ↔ base) y AC-10.
- `isolated-runtime`: AC-14, si se despliega.
- **Las mutaciones** de AC-2, AC-5 y de las guardas se corren y se revierten una por una, **con reemplazos literales** (lección de la 21.2: un «detectada» se valida por el caso que falla, no por el código de salida). Su resultado va a §Resultados. Como mínimo:
  - cada propiedad de la imputación (el orden de reparto, el tope por venta, la mezcla de monedas, las señas retenidas);
  - sin el bloqueo de cobros en el cobro;
  - lo que falta leído antes del bloqueo;
  - sin el bloqueo del cliente;
  - el trigger del efectivo desactivado;
  - el cierre sin exigir las monedas de los cobros.
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial una escritura de `sales`, otro módulo, `src/shared/` o los contratos del agente;
- el diseño exigiría cambiar el texto del ADR 0022, del 0021, del 0019 o del 0013;
- `sales`, `orders` o `crm` tendrían que importar `cash`, o `cash` bloquear una venta;
- un cobro pudiera superar lo que le falta a su venta, cambiar de moneda o de cliente, o quedar sin sesión siendo efectivo;
- la regla de imputación y lo que se muestra pudieran contradecirse, o un monto contarse dos veces;
- lo esperado pudiera quedar negativo, mezclar monedas o cambiar después del cierre;
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

Implementado el 2026-10-14. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-11 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvíos aprobados por el usuario el 2026-10-14** (los tres, con la propuesta del primero):

- **El tercer escenario de AC-5 no se puede dar en la 21.3** (revisión independiente, R-2).
  - El escenario pide dos cobros de ventas distintas del mismo cliente, con un remanente que alcanza para una sola, y que el segundo vea lo imputado por el primero.
  - En la 21.3 el remanente solo nace de lo cobrado en ventas anuladas, y un cobro directo de una venta X no puede superar lo que le falta. Con ese tope, X sigue tomando del remanente la misma parte que antes, así que lo que le falta a otra venta Y no cambia: el segundo cobro no tiene nada nuevo que ver. La revisión independiente lo confirmó por álgebra sobre `imputation.ts`.
  - Se reemplazó por «dos cobros de ventas distintas del mismo cliente en cola, cada uno hasta su tope: la cuenta cuadra».
  - **Ese caso no tiene una mutación que lo tumbe por su regla**: M8 lo hace fallar solo porque el ayudante `queued` espera una conexión bloqueada que ya no llega. Es un rojo del andamio.
  - **Aprobado**: el escenario original pasa a la 21.4–21.6, donde el cobro a cuenta, la seña y la devolución mueven el remanente y lo vuelven alcanzable.
- **Un cobro en efectivo que pasaría lo que cabe en `numeric(14, 2)` se rechaza** con `VALIDATION_ERROR`, `amount: "limit"` (revisión independiente, R-3).
  - D-6 no lista esa respuesta. Es la misma del aporte desde la 21.2: sin ella, varios cobros grandes dejarían una sesión que no se puede cerrar.
  - Su texto: «Con este cobro, lo esperado de la caja pasaría el máximo que se puede guardar». Lo cubre un caso de `receipts.test.ts`, y M16 lo tumba.
- **`cash/schema.ts` importa `sales/schema` y `crm/schema`** para las claves compuestas del cobro (revisión independiente, R-5).
  - AC-9 dice que `cash` importa `sales` solo por las dos lecturas de D-4 y `crm` solo por `lockClientForOrder` y la lectura del cliente.
  - Es el mismo uso que ya tenían `auth` y `organizations` en `schema.ts`: solo la tabla para la clave, sin ninguna llamada. El Overview lo dice.

**Precisiones que no cambian una decisión:**

- **La venta anulada durante un cobro (H-5)** se reproduce y pasa, pero ninguna mutación de la lista apunta a ese escenario. La regla que comprueba, que el monto aparezca una sola vez, la cubren las propiedades de la imputación (M5 y M6), del lado puro.
- **Lo que falta, para el formulario, va con los decimales de la moneda** (`outstandingInput`): «7400» en pesos chilenos. Con «7400.00» el cobro rechazaba lo que proponía, como la apertura de la 21.2 antes de su R-2.
- **`saleStanding` lee los cobros del cliente uno tras otro**, sin `Promise.all` sobre la transacción: `pg` avisa si un mismo cliente recibe consultas concurrentes.
- **Un cliente desactivado se cobra igual** (revisión independiente, R-6): el cobro toma su ficha en modo compartido, pero no mira el resultado. La venta sigue vigente y le falta plata. Un comentario en `createSaleReceipt` lo dice.
- **Las pantallas son la 28, la 29 y la 30**, no la 27 a la 29: la 27 ya existía.
- **La pantalla del cobro importa de la carpeta de la caja** `AmountReading` y `ROW_PROBLEM_TEXT`, que pasó a exportarse (revisión independiente, R-4). Las dos carpetas están en la lista autorizada, y es la práctica de las pantallas existentes. El recibo tiene su propio botón de imprimir.
- **El primer caso de `cash.spec.ts` se partió en dos**, con la sesión como fixture SQL en el segundo: con los cobros en la caja, se acercaba al límite de 30 s por caso. Los end-to-end no insertan en `document_counters`, porque su trigger exige que el contador nazca en 0.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `receipts-schema.test.ts`, 20 casos: los valores de enum y el destino; privilegios y solo inserción, también para el dueño; el cobro sin venta; el efectivo sin sesión y la transferencia con sesión; la sesión cerrada; las claves compuestas; el cliente con cobros, que no se borra (`23001` sobre `receipts_client_fk`); los `CHECK`; la hora de `clock_timestamp()` |
| AC-2 | cumplido | `imputation.test.ts`, 21 casos: los ejemplos del punto 9, la venta sin cliente, siete propiedades con 500 casos cada una y semilla fija, y la cobertura del generador. M1 a M7 |
| AC-3 | cumplido | `receipts.test.ts`: la serie `R-000001`, la copia de la moneda y del cliente, los cobros parciales hasta «Cobrada», `exceeds_outstanding`, el efectivo en la sesión y en el cierre, H-8, la venta sin cliente anulada y la auditoría de D-7 |
| AC-4 | cumplido, con el desvío de R-3 | `receipts.test.ts`: cada respuesta de D-6 sin escribir, numerar ni auditar, el `viewer`, `no_open_session` con la caja cerrada, y el tope de lo esperado |
| AC-5 | cumplido, con el desvío de R-2 | `receipts.test.ts`, nueve casos en cola determinista: el bloqueo y otra organización; la misma venta; dos ventas del mismo cliente (el reemplazo); el efectivo y el cierre en los dos órdenes; la venta anulada durante el cobro, con cliente y sin cliente; el cliente retenido; la venta anulada mientras se espera al cliente. M8 a M11 y M14 |
| AC-6 | cumplido | `receipts.test.ts`: los dos roles ven lo cobrado, el recibo y la lista; el `viewer` sin el contacto; otra organización; el formulario, solo `admin`; la búsqueda por número |
| AC-7 | cumplido | `receipts.spec.ts`, cuatro casos sobre `next start`: el cobro en dos partes y en dos medios con el teclado, el rechazo y el recibo impreso; la búsqueda en «Cobros» y el cierre con el cobro en lo esperado; el `viewer`; y un cobro sin JavaScript. axe en claro y en oscuro |
| AC-8 | cumplido | `cash-writes` suma `receipts`, `insertReceipt` y su único llamador, con sus casos (M15); `exposed-surface` declara `createSaleReceiptAction` |
| AC-9 | cumplido, con el desvío de R-5 | `cash` llama de `sales` solo a `getSaleForReceipt` y `listClientSalesForAccount`, y de `crm` a `lockClientForOrder` y `getClientsByIds`; en `schema.ts` importa sus tablas para las claves. `sales`, `orders` y `crm` no importan `cash`. En `sales` cambian solo las dos lecturas y los comentarios de H-2; `src/shared/` no está en el diff |
| AC-10 | cumplido en local | `read-api`, `read-api-v2` e `ingestion-v2` en la batería; `docs/contracts/` no está en el diff |
| AC-11 | cumplido | `client-data.test.ts`, casos 44 a 46: la exportación trae los cobros, el informe los cuenta y un cliente con cobros no se borra. El runbook está actualizado (R-1) |
| AC-12 | cumplido en local | la batería, abajo; la de CI, al hacer push |
| AC-13 | cumplido | DataModel, Overview, FunctionalRequirements (FR-CAJ-09 a 12), Screens (§28 a §30, y §18, §21 y §26 precisadas), TraceabilityMatrix, SecurityModel (114 puntos de entrada), EngineeringStandards y el runbook de datos de un cliente |
| AC-14 | pendiente | el despliegue, si se autoriza (D-12) |

### Mutaciones

Cada una se aplicó al código real con un reemplazo literal, se corrió y se revirtió con un script. «Detectada» quiere decir que falló el caso previsto, leído por su nombre en el reporte JSON de vitest, y no todo el archivo.

- **M1 a M7, la imputación**: el remanente de la más nueva a la más vieja; sin el tope por venta; las monedas mezcladas; las señas retenidas dentro del remanente; el haber sin restar las devoluciones; el exceso de un cobro directo perdido; y, a igual fecha, sin desempatar por número. Cada una la tumba su propiedad.
- **M8**: el cobro sin el bloqueo de cobros. Fallan 5 casos: el del bloqueo, la misma venta en cola, el efectivo y el cierre en los dos órdenes, y el reemplazo de R-2, este último por el andamio.
- **M9**: lo que falta leído antes del bloqueo. Lo detecta la misma venta en cola.
- **M10**: sin el bloqueo del cliente. Lo detecta el caso del cliente retenido.
- **M11**: la venta no se relee después de esperar al cliente. Lo detecta la venta anulada mientras se espera al cliente.
- **M12**: el cobro sin copiar el cliente. Lo detecta el caso de la serie.
- **M13**: el trigger del efectivo apagado. Fallan los dos casos del efectivo en el esquema.
- **M14**: el cierre sin las monedas de los cobros. Lo detecta el efectivo en la sesión abierta.
- **M15**, en la guarda: una escritura de `receipts` desde otro caso de uso.
- **M16**: el efectivo sin el tope de lo esperado (R-3). Lo detecta su caso.

M8 y M16 se volvieron a correr después de las correcciones de la revisión, y siguen detectadas.

### La batería

Desde Git Bash, en serie y sin nada en paralelo, con los archivos nuevos en el índice por `git add -N`, el 2026-10-14:

| Paso | Resultado |
|---|---|
| `format:check`, `lint`, `typecheck` | exit 0 |
| `test:unit` | 763 casos en 74 archivos |
| `test:guards` | 646 casos en 21 archivos |
| `test:integration` | exit 1: 1163 casos pasaron, 1 superó los 30 s y 2 archivos no terminaron |
| `build` | exit 0 |
| `test:e2e` | 183 casos |

**La integración no pasó en esa corrida, y no fue por esta subfase.**

- `organization-bootstrap.test.ts` superó los 30 s en el caso que lanza todos los seeds como procesos aparte.
- Los workers de `cash.test.ts` y `orders-schema.test.ts` se cerraron con el código `3221226505` (`0xC0000409`), un cierre forzado del proceso en Windows, sin llegar a una aserción.
- **Los tres archivos se repitieron solos y pasaron**: 65 casos de 65.

Después de las correcciones de la revisión pasaron `typecheck`, `format:check`, `lint`, `test:guards` (646 casos) y `receipts.test.ts` (24 casos). La batería entera vuelve a correr en la CI con el push.

## Revisión independiente — 2026-10-14

Un agente que no participó del trabajo, con acceso de solo lectura, revisó contra este brief y contra las reglas vigentes. **Sin bloqueantes.** Sus hallazgos se verificaron contra el código antes de aceptarlos:

| Hallazgo | Severidad | Tratamiento |
|---|---|---|
| R-1. El runbook de datos de un cliente no decía nada de los cobros | importante | corregido: la exportación, el informe, el caso A y el caso B |
| R-2. El tercer escenario de AC-5 se reemplazó sin registrarlo, y su reemplazo no tiene una mutación propia | importante | registrado arriba; desvío aprobado el 2026-10-14 |
| R-3. El cobro en efectivo no comprobaba el máximo de lo esperado, como el aporte | menor | corregido, con su caso y M16; desvío de D-6 |
| R-4. La pantalla del cobro importa de la carpeta de la caja | nota | se deja: es la práctica existente, dentro de lo autorizado |
| R-5. El Overview no decía que `cash/schema.ts` importa `sales` y `crm` | nota | corregido en el Overview; desvío de AC-9 |
| R-6. Un cliente desactivado se cobra igual, sin que el código lo diga | nota | comentario en `createSaleReceipt` |

El revisor no otorga autorizaciones. El usuario aprobó los tres desvíos y autorizó el commit, el push y Notion el 2026-10-14; el despliegue (D-12), aparte, ese mismo día.

## Cierre de la subfase 21.3, 2026-10-14

Cierra el 2026-10-14, después del recorrido del usuario en producción («Ya lo revisé, está perfecto»).

- **AC-1 a AC-14 cumplidos**, con los tres desvíos aprobados. AC-12 con la batería de arriba y la CI; AC-14 con el despliegue y el recorrido de abajo.
- **Commit, CI y despliegue**:
  - `0543ef6`, la implementación. **El primer intento de la CI 38583961530 quedó `cancelled`**: corrió todos sus pasos de 3 a 4 veces más lento que la corrida anterior, por ejemplo el lint de 10 a 37 s y el build de 36 a 130 s, y el `timeout-minutes: 25` lo cortó en los end-to-end. Ningún test falló, y la integración completa pasó en ese intento. El segundo intento, sin cambios, terminó en `success` en 18 minutos, leído por el SHA completo.
  - Desplegado el 2026-10-14 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `3cda4f8` anotado como la versión para volver atrás. La última línea comparó HEAD con el SHA pedido.
  - Después, el servicio `active`, `receipts` vacía y sin sesiones abiertas, y `/caja/cobros` redirigiendo a `/login` desde afuera.
- **El recorrido del usuario (AC-14)**, en «Demostración Vixora»: los siete pasos de D-12. **Conciliado contra la base** con el rol de la aplicación, solo con lecturas y sin datos de la persona:
  - tres cobros en ARS, todos con la moneda de su venta y con el cliente copiado de ella:
    - `R-000001`: 500.000,00 de `V-000002`, en efectivo, en `C-000002`;
    - `R-000002`: 460.000,00 de `V-000002`, por transferencia bancaria, sin sesión;
    - `R-000003`: 2.000.000,00 de `V-000004`, en efectivo, en `C-000002`;
  - `V-000002`, sin cliente: total 960.000,00, cobrado entero, le falta 0. `V-000004`: total 2.300.000,00, le faltan 300.000,00. Es lo que da la regla: las ventas anuladas de la organización, `V-000001` y `V-000003`, no tienen cobros, así que no hay remanente;
  - `C-000002` cerrada: el inicial de 50.000,00 más los dos cobros en efectivo, 2.500.000,00, dan 2.550.000,00. Es lo esperado que guardó el cierre, y lo contado es igual. `C-000001` sigue en los 55.000,00 que se recalculan;
  - el contador `receipt` en 3, igual a la cantidad de cobros: el cobro de más que se rechazó no consumió número;
  - la auditoría: tres `create` de `receipt`, con claves planas, `session_number` solo en los de efectivo y sin datos de la persona.

  La impresión del recibo y la búsqueda en «Cobros» no dejan rastro en la base: su evidencia es la confirmación del usuario.
- **Revisión**: la independiente (R-1 a R-6, arriba). La batería, el despliegue, la conciliación y este cierre son autoevaluación declarada.
- **Decisiones del usuario**:
  - el brief, con las recomendaciones de D-1 a D-12;
  - **los tres desvíos, aprobados el 2026-10-14**: el escenario de AC-5 pasa a la 21.4–21.6 (R-2), el rechazo `limit` del efectivo (R-3) y las tablas de `sales` y `crm` en `cash/schema.ts` (R-5);
  - la tarea en «En proceso», el commit con su push, el despliegue después de la CI y una regla de permiso local para leer producción por `ssh`, que conviene quitar al cerrar.
- **Nivel**:
  - validado localmente y en CI;
  - **validado en integración** para las pantallas (end-to-end sobre `next start`);
  - desplegado en producción y recorrido por el usuario en la organización de demostración.

  No es «preparado para producción».
- **No certifica**:
  - que volver a `3cda4f8` sea seguro con una sesión de caja abierta que tenga cobros: ese código no suma los cobros a lo esperado. Antes hay que cerrar la sesión con el código nuevo;
  - en producción, los rechazos de AC-4 y la concurrencia de AC-5: los cubren los tests;
  - el escenario de AC-5 con un remanente que cambia, que pasa a la 21.4–21.6;
  - que el recibo cumpla una exigencia fiscal: es un comprobante interno.
- **Queda anotado**:
  - **la CI está cerca de su límite**: la corrida que pasó tardó 18 de los 25 minutos, y un runner lento la corta. Sin una corrida en `success` no se despliega. Conviene decidir si se sube `timeout-minutes`, que está fuera de esta subfase;
  - en la batería local, dos procesos de vitest cayeron con `0xC0000409` y un caso de seeds pasó los 30 s. Vueltos a correr, en verde, y en la CI pasaron.
