---
schema: task-brief.v1
task_id: "21.5"
task_type: implementation
generated_at: 2026-10-14
---

# Brief 21.5 — La anulación y la devolución

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, los servicios, la imputación con anulaciones y devoluciones, la caja, la serialización, las guardas y las fronteras, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-15).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-15, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: quinta subfase de la Fase 21 — Caja y cobros ([Roadmap](../planning/Roadmap.md) §Fase 21), después de la 21.4, cerrada el 2026-10-14. Implementa la fila «21.5» del punto 15 del [ADR 0022](0022-cobros-y-caja.md).
- **No abre ni cierra gate.** Pero es **la primera salida de dinero** del sistema y la primera escritura que **puede achicar el remanente** de una cuenta (H-3), y toca el arqueo de sesiones ya cerradas. Por eso se recomienda la revisión independiente (D-14).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-14, con las recomendaciones de D-1 a D-15 (entre ellas D-5, la lectura del remanente con su nota fechada en el ADR 0022, y D-12, la variante de AC-5 que la 21.5 produce). La tarea 21.5 (`3f8702be6f4e81fa8839d28020eb58c3`) sigue en «Esperando» hasta que el usuario autorice pasarla.

## Objetivo

Que un `admin` pueda **corregir y devolver dinero** con tres comprobantes nuevos, de solo inserción y con su serie:

- **la anulación de un cobro** (`AR-000001`): deja sin efecto un cobro mal registrado, entero y una sola vez, con un motivo de una lista cerrada. Vale también para una seña, y para un cobro en efectivo con su sesión ya cerrada;
- **la devolución** (`D-000001`): registra que la plata salió hacia el cliente, solo por lo que está a favor de su cuenta o a devolver de una venta sin cliente anulada, y si es en efectivo, desde la sesión abierta;
- **la anulación de una devolución** (`AD-000001`): deja sin efecto una devolución mal registrada, con las mismas reglas que la anulación de un cobro.

**Nunca queda devuelto más de lo cobrado.** Lo esperado de la caja descuenta las devoluciones en efectivo y deja de contar lo anulado con la sesión abierta; el arqueo de una sesión cerrada no cambia y muestra lo anulado después como explicación de su diferencia. La regla de imputación de la 21.3 no cambia: esta subfase le pasa las devoluciones y le deja de pasar lo anulado.

## Lo que se verificó antes de escribir este brief

Contra `main` (`991ecab`), el 2026-10-14:

- **El ADR 0022 en la fuente**, entero. Lo que fija para esta subfase:
  - las tres operaciones, su efecto por el tipo del comprobante, los montos copiados y positivos, el motivo de una lista cerrada y la anulación entera a lo sumo una vez (punto 7);
  - la anulación se rechaza **si dejaría devuelto más de lo cobrado**, en la cuenta de un cliente por moneda y en una venta sin cliente (punto 7);
  - el efectivo anulado con la sesión abierta deja de contar en lo esperado; con la sesión cerrada, el arqueo no cambia y la sesión muestra la anulación posterior (puntos 7 y 8);
  - **ninguna salida de la sesión abierta deja lo esperado por debajo de cero**: el retiro, la devolución en efectivo y la anulación de un cobro en efectivo (punto 8);
  - la devolución lleva medio de pago y no lleva texto libre (punto 7); el comprobante imprimible de la devolución (punto 11);
  - los tipos `receipt_void` (`AR`), `refund` (`D`) y `refund_void` (`AD`), y los nombres `receipt_voids`, `refunds` y `refund_voids` (punto 11);
  - las tres en la exportación de un cliente, sin el saldo (punto 14);
  - los motivos exactos de las listas cerradas los decide este brief (§«Lo que este ADR no decide»).
- **DataModel**: la regla 14 ya nombra las tres tablas para la 21.5; `receipts` tiene `UNIQUE (organization_id, id)` como «destino de las anulaciones de la 21.5» (l. 825), y `cash_session_closing_amounts.expected` dice que desde la 21.5 resta las devoluciones (l. 795).
- **La §Cierre del brief de la 21.4** y HANDOFF §3, paso 0.
- **El código**: `cash` (`imputeAccount`, `standaloneSale`, `clientAccount`, `saleStanding`, `orderStanding`, `computeCashTotals`, `readTotals`, `recordCashMovement`, `closeCashSession`, los ayudantes compartidos de la 21.4), la `0041` (`sale_voids`, el molde de una anulación), la `0042` y la `0043` (los triggers reutilizables), `numbering`, las specs end-to-end y los scripts de datos de un cliente.

Lo que encontró y el ADR no dice:

- **H-1. La imputación ya recibe las devoluciones.** `imputeAccount` tiene `refunds` desde la 21.3, y su comentario dice que recibe solo lo vigente: «los cobros y las devoluciones anulados (21.5) no se pasan». **`imputeAccount` no cambia**: lo nuevo es filtrar lo anulado y pasarle las devoluciones de la cuenta. **`standaloneSale` sí cambia**: hoy no recibe devoluciones, y lo que queda a devolver de una venta sin cliente anulada es lo cobrado menos lo devuelto.
- **H-2. Lo que se puede devolver de una cuenta es el paso 4, no el remanente.** El punto 7 dice «el saldo a favor de la cuenta de un cliente». En `imputeAccount` es `inFavor`: lo que sobra del remanente después de repartirlo entre las ventas con saldo. Devolver hasta `inFavor` no cambia lo que le falta a ninguna venta; devolver hasta el remanente se lo cobraría dos veces a la venta que lo recibió.
- **H-3. El punto 7 tiene dos lecturas de la regla de la anulación, y dan resultados distintos.** Dice: «el haber sin ese cobro no puede quedar por debajo de sus devoluciones vigentes (el remanente del punto 9 nunca es negativo)». **El haber** incluye los cobros directos de las ventas vigentes; **el remanente**, no. Un caso en que divergen:
  - la venta vigente `A`, de 100, cobrada entera con `r1`; la venta `B`, anulada, con un cobro `r2` de 50, que pasó al remanente; una devolución de 50;
  - anular `r2`: el haber sin `r2` es 100, que no baja de 50, y la primera lectura lo acepta; **el remanente sin `r2` es 0, menos 50 devueltos**, y `imputeAccount` lanza `InconsistentAccount`.

  **Solo la lectura del remanente deja la cuenta consistente.** D-5 la recomienda: la comprobación es armar la cuenta sin ese cobro y verificar que el remanente no quede negativo, en cada moneda. Es lo que dice el paréntesis del ADR, así que no cambia su decisión; D-5 propone una nota fechada que lo precise.
- **H-4. Lo que se cruza con la anulación y la devolución sin tomar el bloqueo de cobros solo agranda el remanente** (inferido; D-11 lo prueba). Anular una venta pasa sus cobros al remanente; cancelar un pedido pasa sus señas; emitir una venta solo le imputa lo que hay. Ninguno lo achica, y ninguno es reversible: una venta anulada no vuelve, ni un pedido cancelado. Por eso una devolución o una anulación decididas con el bloqueo de cobros siguen valiendo cuando eso se confirma después, **sin bloquear el pedido ni la venta**.

  *Precisado el 2026-10-14, tras la revisión independiente (hallazgo medio, verificado en el código y aprobado por el usuario)*: vale para el **remanente**, que es lo que mira D-5, pero **no para lo que está a favor**, el tope de D-7 (H-2): emitir una venta sí lo achica. Por eso la devolución desde la cuenta toma la ficha del cliente en modo exclusivo (D-11).
- **H-5. Lo esperado de una sesión necesita saber en qué sesión se anuló.** «Anulado con la sesión abierta» no se puede derivar de las fechas: `created_at` es el comienzo de cada sentencia, no el orden en que el bloqueo serializó las transacciones. D-1 propone que la anulación guarde **la sesión en la que impacta**, la misma del cobro si estaba abierta, o ninguna, y que la base lo defienda.
- **H-6. Los triggers de la `0042` y la `0043` sirven para las tablas nuevas.** `cash_reject_closed_session()` lee `NEW.session_id`, y `receipts_check_cash_session()` lee `NEW.payment_method_id` y `NEW.session_id`: los dos son genéricos. `cash_reject_change()` defiende la solo inserción.
- **H-7. La migración no usa ningún valor de enum agregado en ella** (lección de la 21.4, H-2). Los valores nuevos de `document_kind` y `audit_entity_type` se usan en el código, después de confirmada la migración. Los enums nuevos (los motivos y el destino de la devolución) se crean con `CREATE TYPE`, cuyos valores sí se pueden usar en la misma transacción.
- **H-8. Dieciséis specs end-to-end vacían `receipts` con `TRUNCATE`**, y `cash.spec.ts` vacía además las sesiones y los medios de pago. PostgreSQL rechaza vaciar una tabla referenciada por otra que no está en la misma sentencia. **Cada una suma las tres tablas nuevas**, como la 21.3 sumó `receipts` en trece. `resetDatabase` de integración vacía todo con `cascade` y no cambia.
- **H-9. El escenario de AC-5 diferido a la 21.6 tiene una variante que la 21.5 sí produce.** El escenario era dos cobros de ventas distintas del mismo cliente en cola, con un remanente que cambia entre los dos. **La anulación de una devolución agranda el remanente**, y por eso baja lo que le falta a una venta con saldo; **la anulación de un cobro que estaba en el remanente lo achica**, y por eso sube. Un cobro en cola detrás de cualquiera de las dos tiene que leer lo que falta después de ella. Es la pregunta del cierre de la 21.4, hecha antes del brief: la 21.5 puede producir la precondición. D-12 propone probar esa variante acá y dejar la literal, con dos cobros, en la 21.6.
- **H-10. No hay pantalla del saldo de un cliente hasta la 21.6** (punto 15). Lo que está a favor de una cuenta hoy se ve indirectamente: la venta anulada con cliente dice que «pasó a la cuenta», y el pedido cancelado, que sus señas también. La devolución desde la cuenta necesita un lugar que muestre cuánto hay a favor, sin adelantar el estado de cuenta (D-9).
- **H-11. La demostración tiene con qué recorrerlo.** En Demostración Vixora, ARS: `C-000002` cerrada con dos cobros en efectivo (`R-000001` de `V-000002` y `R-000003` de `V-000004`) y `C-000003` cerrada con la seña en efectivo `R-000004`; `V-000002` sin cliente, cobrada entera; a `V-000004` le faltan 240.000. Ningún cliente tiene saldo a favor: el recorrido lo produce (D-15).

## Alcance incluido

1. **Esquema** (migración `0045`, generada con `drizzle-kit generate` y completada a mano), D-1 a D-3:
   - `receipt_voids`, `refunds` y `refund_voids`, con sus claves compuestas, índices, `CHECK` y triggers;
   - los enums `receipt_void_reason`, `refund_void_reason` y `refund_target`;
   - `receipt_void`, `refund` y `refund_void` en `document_kind`, y `refund` en `audit_entity_type`.
2. **`numbering`**: los prefijos `AR`, `D` y `AD`.
3. **`cash`**:
   - `voidReceipt`, `createRefund` y `voidRefund` (D-4 a D-7);
   - la cuenta y las situaciones sin lo anulado y con las devoluciones (D-8): `clientAccount`, `saleStanding`, `orderStanding` y `standaloneSale`;
   - lo esperado de la caja y el cierre con las devoluciones y las anulaciones (D-6);
   - las lecturas de las pantallas de D-9.
4. **Pantallas** (D-9).
5. **Datos de un cliente** (D-10): las tres en la exportación, el criterio y el informe del borrado, y el runbook.
6. **Guardas**: `cash-writes`, con las tres escrituras nuevas y su llamador; `exposed-surface`, con las acciones nuevas.
7. **Tests**: las tablas nuevas en la cobertura de privilegios y de solo inserción, los prefijos en `numbering`, y las tres tablas en los `TRUNCATE` de las specs (H-8).
8. **Documentación**:
   - DataModel: las tres tablas, `document_counters`, la regla 14 y la nota de `cash_session_closing_amounts`;
   - Overview: la fila de `cash`;
   - FunctionalRequirements, `FR-CAJ`;
   - Screens;
   - TraceabilityMatrix;
   - SecurityModel, con los recuentos;
   - EngineeringStandards, si cambia el recuento de una guarda;
   - el ADR 0022, **solo** la nota fechada de D-5, si se aprueba.

## Alcance excluido

- **El cobro a cuenta, el estado de cuenta, la lista de deudores y el saldo en la ficha del cliente y en la venta** (21.6).
- **El escenario literal de AC-5 con dos cobros** (D-12), que sigue en la 21.6.
- **Devolver una seña retenida**: mientras el pedido no se vende ni se cancela, la seña no está a favor (punto 5). Si se cargó mal, se anula; si el cliente se arrepiente, se cancela el pedido y se devuelve lo que pasó a la cuenta.
- **Una devolución parcial imputada a una venta o a un pedido**: la devolución sale de la cuenta o de una venta sin cliente, nunca de un comprobante con cliente (punto 7).
- **La devolución de mercadería**, que sigue fuera (punto 1): es un ajuste de stock y, si corresponde, la anulación de la venta.
- **Que anular una venta o cancelar un pedido genere una devolución** (§Alternativas del ADR) o miren los cobros: `sales` y `orders` no cambian.
- **Corregir el arqueo de una sesión cerrada**: es historia (punto 8). El riesgo aceptado del ADR, el cobro correcto en efectivo cargado en otra sesión, se corrige con un retiro de motivo `correction`, que ya existe.
- **Un comprobante imprimible de las anulaciones**: el punto 11 pide el del cobro y el de la devolución. La anulación se muestra en el comprobante que anula (D-9).
- **Que el agente lea o registre algo de esto**: `read-v1`, `read-v2` e `ingestion-v2` no cambian (punto 12).
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0045_*.sql` y `drizzle/meta/*`
- `src/modules/cash/`, con sus tests unitarios. En `imputation.ts`, **solo** `standaloneSale` y los comentarios (H-1)
- `src/modules/numbering/schema.ts` y `service.ts`, **solo** los tres tipos y sus prefijos
- `src/modules/audit/schema.ts`, **solo** `refund` en `audit_entity_type`
- pantallas:
  - `src/app/(autenticado)/cobros/[receiptId]/`: `page.tsx` y la carpeta nueva de la anulación;
  - `src/app/(autenticado)/devoluciones/` (nueva): el comprobante y su anulación;
  - `src/app/(autenticado)/ventas/[saleId]/`: `page.tsx`, `cobrar/sale-receipts-section.tsx`, `cobrar/messages.ts` y la carpeta nueva de la devolución de una venta sin cliente;
  - `src/app/(autenticado)/pedidos/[orderId]/senar/order-receipts-section.tsx`, **solo** lo anulado y el enlace a la devolución;
  - `src/app/(autenticado)/clientes/[clientId]/`: la carpeta nueva de la devolución desde la cuenta (D-9), **sin** tocar la ficha;
  - `src/app/(autenticado)/caja/`: `page.tsx`, `session-tables.tsx`, `messages.ts`, `cash-sub-nav.tsx`, `cobros/page.tsx`, `sesiones/[sessionId]/page.tsx`, `cerrar/` y la carpeta nueva `devoluciones/`
- `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`, **solo** lo de D-10
- `docs/runbooks/datos-de-un-cliente.md`
- `tests/integration/`:
  - nuevos: `receipt-voids.test.ts`, `refunds.test.ts` y `refunds-schema.test.ts`;
  - `receipts-schema.test.ts`, `receipts.test.ts`, `order-receipts.test.ts` y `cash.test.ts`, **solo** si un caso existente cambia por lo anulado o las devoluciones;
  - `client-data.test.ts`, `identity-schema.test.ts`, `audit.test.ts` y `numbering.test.ts`, **solo** las tablas, los tipos y los prefijos nuevos
- `tests/guards/`: `cash-writes.test.ts` y `exposed-surface.test.ts`
- `tests/e2e/`:
  - nuevo: `refunds.spec.ts`;
  - las dieciséis specs de H-8, **solo** las tres tablas en sus `TRUNCATE`
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- `docs/development/EngineeringStandards.md`
- `docs/decisions/0022-cobros-y-caja.md`, **solo** la nota fechada de D-5, si se aprueba
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `sales`, `orders`, `crm`, `catalog`, `inventory`, `knowledge`, `conversations` e `ingestion`: la 21.5 usa sus lecturas y sus bloqueos tal como están;
- en `cash/imputation.ts`, `imputeAccount`;
- la ficha del cliente, `clientes/[clientId]/page.tsx` (el saldo es de la 21.6);
- `src/shared/`;
- los seeds y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - `cash`: `imputeAccount`, `standaloneSale`, `clientAccount`, `saleStanding`, `orderStanding`, `computeCashTotals`, `readTotals`, `recordCashMovement`, `closeCashSession`, `readPayment`, `exceedsCashLimit` y `auditReceipt`;
  - la `0041` (`sale_voids` y `sale_voids_check_copy`), la `0042` (`cash_reject_change`, `cash_reject_closed_session`) y la `0043` (`receipts_check_cash_session`);
  - `getSaleForReceipt` de `sales`, `getOrderForReceipt` de `orders` y `lockClientForOrder` de `crm`;
  - las guardas `cash-writes` y `exposed-surface`.
- **Las decisiones**:
  - el [ADR 0022](0022-cobros-y-caja.md), puntos 4 y 6 a 15;
  - el [ADR 0021](0021-la-venta.md), punto 6 (la anulación como comprobante, el motivo de una lista cerrada);
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 y 3;
  - el [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 4;
  - el [brief-21.3](brief-21.3-el-cobro-de-una-venta.md) y el [brief-21.4](brief-21.4-la-sena.md), como molde y por lo que dejaron probado: la cola determinista, la aserción de la regla antes del ayudante de la cola, los ayudantes compartidos y una escritura por caso de uso.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. `receipt_voids`.** **Recomendado**, en la migración `0045`:

- `id`, `organization_id`, `number` (serie `receipt_void`, `UNIQUE (organization_id, number)`), `receipt_id` (`UNIQUE`: a lo sumo una anulación por cobro), `currency`, `amount`, `reason`, **`session_id`** nulable, `created_by` y `created_at`;
- claves compuestas hacia `receipts` y `cash_sessions`, `ON DELETE RESTRICT`, como `sale_voids`;
- **sin `client_id`**: llega al cliente por su cobro, como `sale_voids` llega por su venta. No hay texto de la persona;
- **los triggers**:
  - de solo inserción, con `cash_reject_change()`;
  - `cash_reject_closed_session()`, que ya rechaza una sesión con cierre (H-6);
  - **`receipt_voids_check_copy()`**: la moneda y el monto son los del cobro, y **la sesión es la del cobro si esa sesión no tiene cierre, y ninguna si lo tiene o si el cobro no fue en efectivo** (H-5). Así lo esperado de una sesión cuenta solo lo anulado mientras estaba abierta, y la base lo defiende.

**D-2. `refunds`.** **Recomendado**:

- `id`, `organization_id`, `number` (serie `refund`), **`target`** (enum `refund_target`: `account` o `sale`), `client_id`, `sale_id`, `payment_method_id`, `session_id`, `currency`, `amount`, `created_by` y `created_at`;
- **`refunds_target_check`**: con `account`, el cliente y ninguna venta; con `sale`, la venta y **ningún cliente**. La devolución contra una venta es solo la de una venta sin cliente (punto 7); con cliente, se devuelve desde la cuenta. El enum es nuevo, así que el `CHECK` puede usar sus literales (H-7);
- claves compuestas hacia `clients`, `sales`, `payment_methods` y `cash_sessions`;
- **sin motivo ni texto libre** (punto 7);
- **los triggers**: de solo inserción, de sesión cerrada, y `receipts_check_cash_session()` reutilizado: en efectivo, con sesión; si no, sin ella (H-6).

**D-3. `refund_voids`.** **Recomendado**: lo mismo que D-1 sobre `refunds`, con `refund_voids_check_copy()`.

**Los motivos** de las dos anulaciones, en enums nuevos (punto 7, «lista cerrada»):

| `receipt_void_reason` | Texto | `refund_void_reason` | Texto |
|---|---|---|---|
| `not_received` | La plata no entró | `not_paid` | La plata no salió |
| `wrong_method` | Otro medio de pago | `wrong_method` | Otro medio de pago |
| `wrong_amount` | Otro monto | `wrong_amount` | Otro monto |
| `wrong_target` | Otro destino | `wrong_client` | Otro cliente o venta |
| `other` | Otro motivo | `other` | Otro motivo |

**Alternativa**: un solo enum para las dos. Mezcla «no entró» con «no salió».

**D-4. La anulación de un cobro.** **Recomendado**: `voidReceipt(context, { receiptId, reason })`, solo de `admin`, en `READ COMMITTED`:

1. **el bloqueo de cobros** de la organización;
2. **el cobro** y si ya tiene anulación, leídos con el bloqueo tomado;
3. **la comprobación**:
   - el cobro existe y no está anulado;
   - **no deja devuelto más de lo cobrado** (D-5);
   - si fue en efectivo y su sesión está abierta, lo esperado de su moneda sin ese cobro no queda por debajo de cero (punto 8);
4. **al final, el contador** `receipt_void`, la fila y la auditoría.

**No bloquea el pedido, la venta ni el cliente**: la anulación no referencia a ninguno, y lo que se cruza sin el bloqueo de cobros solo agranda el remanente (H-4).

**D-5. «Nunca queda devuelto más de lo cobrado».** **Recomendado**, la lectura del remanente (H-3):

- **con cliente**: la cuenta armada **sin ese cobro** no deja el remanente negativo en ninguna moneda. Es la misma `clientAccount`, con el cobro excluido; si `imputeAccount` lo rechazaría, la anulación se rechaza con `refunds_exceed_receipts`, la moneda y lo devuelto;
- **sin cliente**: los cobros vigentes de la venta, sin ese cobro, no quedan por debajo de sus devoluciones vigentes.

Y **una nota fechada en el ADR 0022, punto 7**, sin cambiar su texto: «Precisado en la 21.5: la comprobación es la del remanente, no la del haber (brief-21.5, H-3)».

**Alternativa**: la lectura del haber. Acepta anulaciones que dejan la cuenta inconsistente (H-3).

**D-6. La caja.** **Recomendado**:

- **lo esperado**, por moneda: inicial + cobros en efectivo − **los anulados en la sesión** − devoluciones en efectivo + **las anuladas en la sesión** + aportes − retiros. «En la sesión» es la `session_id` de la anulación (D-1), así que lo anulado después del cierre no cuenta;
- **`computeCashTotals`** suma los términos de las devoluciones y de las anulaciones, y **el cierre exige contar** también cada moneda con devoluciones;
- **ninguna salida deja lo esperado por debajo de cero** (`insufficient_cash`, como el retiro): la devolución en efectivo y la anulación de un cobro en efectivo con la sesión abierta. La anulación de una devolución con la sesión abierta, que es una entrada, respeta el tope de `numeric(14, 2)`, como un aporte;
- **el detalle de una sesión cerrada** lista **las anulaciones posteriores al cierre** de sus cobros y de sus devoluciones, con número, fecha, motivo y monto, como explicación de su diferencia. El arqueo guardado no cambia.

**D-7. La devolución y su anulación.** **Recomendado**:

- **`createRefund(context, { target, clientId | saleId, currency, paymentMethodId, amount })`**, solo de `admin`:
  1. el bloqueo de cobros;
  2. **con `account`, el cliente en modo compartido** por `lockClientForOrder` de `crm` (punto 4, paso 3: el `INSERT` toma su ficha por la clave). Con `sale`, la venta se lee por `getSaleForReceipt`, sin bloquearla;
  3. la comprobación: el medio activo; si es efectivo, la sesión abierta y lo esperado que alcanza (D-6); y **el monto no supera lo disponible**: con `account`, el `inFavor` de la moneda (H-2); con `sale`, que sea una venta **sin cliente y anulada**, y lo que queda a devolver (H-1);
  4. el contador `refund`, la fila y la auditoría.
- **`voidRefund(context, { refundId, reason })`**, como D-4, sin la comprobación de lo devuelto: anular una devolución solo agranda lo que está a favor o a devolver.

**D-8. La cuenta y las situaciones, sin lo anulado y con las devoluciones.** **Recomendado**:

- **`clientAccount`** filtra los cobros anulados y pasa las devoluciones vigentes de la cuenta del cliente. Una sola función, como en la 21.4;
- **`standaloneSale`** recibe lo devuelto: lo que queda a devolver es lo cobrado menos lo devuelto (H-1);
- **`orderStanding`**: lo señado y lo que le falta, sin las señas anuladas;
- **las lecturas muestran lo anulado**, marcado y con su `AR-…`, pero no lo cuentan.

**D-9. Las pantallas.** **Recomendadas**:

- **El recibo `/cobros/[receiptId]`**: si está anulado, el sello «Anulado», con el `AR-…`, la fecha, el motivo y el autor. Para `admin`, «Anular cobro» si no lo está.
- **`/cobros/[receiptId]/anular`**: el motivo y la confirmación, con lo que va a pasar: si es efectivo con la sesión abierta, que sale de lo esperado; si la sesión está cerrada, que el arqueo no cambia. Sin JavaScript también.
- **La devolución desde la cuenta, `/clientes/[clientId]/devolver`** (H-10): muestra **lo que está a favor por moneda**, sin el estado de cuenta, y el formulario (moneda, medio, monto propuesto en lo disponible). Se llega desde donde hoy se ve que algo pasó a la cuenta: la venta anulada con cliente y el pedido cancelado con señas, con el enlace «Devolver saldo a favor» si hay algo a favor.
- **La devolución de una venta sin cliente, `/ventas/[saleId]/devolver`**: desde el detalle de la venta anulada, si queda algo a devolver.
- **El comprobante `/devoluciones/[refundId]`**, imprimible (punto 11): la organización, el número y la fecha, el cliente o «Consumidor final», el destino («Cuenta del cliente» o «Venta V-…»), el medio, el monto y la leyenda «Documento no válido como factura». Si está anulada, el sello con el `AD-…`; para `admin`, «Anular devolución».
- **`/devoluciones/[refundId]/anular`**, como la del cobro.
- **`/caja/devoluciones`**: la lista paginada, con búsqueda por número `D-…`, como `/caja/cobros`. **`/caja/cobros`** marca los anulados.
- **La caja y el detalle de una sesión**: la tarjeta de las devoluciones en efectivo, lo anulado marcado, lo esperado de D-6 y, en una sesión cerrada, las anulaciones posteriores.
- **El detalle de la venta y el del pedido**: los cobros y las señas anulados, marcados; en una venta sin cliente anulada, lo devuelto y lo que queda a devolver.

Un `viewer` ve todo sin acciones y sin los datos de contacto del cliente.

**D-10. Los datos de un cliente.** **Recomendado**:

- **la exportación** suma las anulaciones de sus cobros, sus devoluciones y las anulaciones de sus devoluciones: los comprobantes, no el saldo (punto 14);
- **el borrado**: `refunds_client_fk` impide borrar un cliente con devoluciones, y el criterio y el informe las cuentan, como los cobros. Las anulaciones se cuentan por su cobro o su devolución;
- **el runbook** lo registra con fecha.

**D-11. Lo que se cruza.** **Recomendado**, probar lo de H-4 y no agregar bloqueos:

- **una devolución desde la cuenta y la anulación de una venta del mismo cliente**, cruzadas: lo devuelto sigue dentro de lo que está a favor;
- **una devolución desde la cuenta y la cancelación de un pedido con señas**, cruzadas: igual.

*Precisado el 2026-10-14, tras la revisión independiente*: **una devolución desde la cuenta y la emisión de una venta del mismo cliente** sí se cruzaban mal: las dos tomaban la ficha en modo compartido, y la devolución podía llevarse lo que la venta tenía que absorber. La devolución desde la cuenta toma ahora la ficha **en modo exclusivo** (`FOR NO KEY UPDATE`) con `lockClientForRefund`, una función nueva de `crm` (`crm/service.ts`, `crm/repository.ts`, `crm/index.ts`), fuera de la lista autorizada por aprobación expresa del usuario. `sales` y `orders` no cambian; un test prueba el cruce en los dos órdenes.

**D-12. AC-5 con un remanente que cambia** (H-9). **Recomendado**: probar en esta subfase la variante que sí produce, **una anulación que mueve el remanente y un cobro de otra venta del mismo cliente en cola detrás de ella**, en los dos sentidos (la anulación de una devolución baja lo que falta; la de un cobro del remanente lo sube). El cobro tiene que ver lo que falta después de la anulación. La literal, con dos cobros, sigue en la 21.6.

**D-13. Las respuestas.** **Recomendadas**, en el molde de la 21.3 y la 21.4:

- **`FORBIDDEN`** a un `viewer`.
- **`VALIDATION_ERROR`**: un id que no es uuid, un motivo fuera de la lista, un destino o una moneda inválidos, un monto inválido o en cero, o `limit`.
- **`NOT_FOUND`**: el cobro, la devolución, el cliente, la venta o el medio no existen en la organización.
- **`BUSINESS_RULE_VIOLATION`**, con su razón:
  - `already_voided`, con el número de la anulación;
  - `refunds_exceed_receipts`, con la moneda y lo devuelto (D-5);
  - `exceeds_refundable`, con lo disponible;
  - `sale_not_refundable`: la venta tiene cliente o no está anulada;
  - `insufficient_cash`, con lo esperado;
  - `payment_method_inactive`;
  - `no_open_session`.
- **Al escribir**: el id y el número.

**Ningún rechazo escribe, numera ni audita.**

**La auditoría**: la anulación de un cobro, `receipt` con la acción `void`, como la de la venta; la devolución, `refund` con `create`, y su anulación, `refund` con `void`. Claves planas, con los números y el motivo, sin datos de la persona.

**D-14. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0022 y las reglas vigentes. Esta subfase es la primera salida de dinero, achica el remanente y cambia lo esperado de la caja.

**D-15. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno, después de la revisión independiente y con la CI del SHA exacto en `success`, con la migración `0045`.

**Volver a `991ecab` no es limpio si hay anulaciones o devoluciones**: ese código no las conoce, y contaría los cobros anulados y dejaría afuera lo devuelto. Si hay que volver atrás con alguna cargada, se avisa antes de cobrar nada.

El recorrido, en Demostración Vixora (H-11). Los documentos exactos se eligen al recorrerlo:

1. abrir la caja;
2. cobrar en efectivo una venta y **anular ese cobro con la sesión abierta**: lo esperado baja, y a la venta le vuelve a faltar;
3. **anular un cobro en efectivo de una sesión cerrada** (por ejemplo, de `C-000002`): su arqueo no cambia y muestra la anulación posterior, y la sesión abierta no se toca;
4. **anular `V-000002`**, la venta sin cliente cobrada, y **devolver en efectivo** lo que queda a devolver; anular esa devolución y volver a devolver;
5. producir un saldo a favor de un cliente (por ejemplo, cancelando un pedido señado sin ventas con saldo) y **devolverlo desde la cuenta**;
6. intentar devolver de más, y anular un cobro que dejaría devuelto más de lo cobrado;
7. cerrar la caja con las devoluciones y las anulaciones en lo esperado.

## Invariantes

- Un cobro, una devolución y sus anulaciones nunca cambian ni se borran: la base lo impide para cualquier rol.
- Un cobro y una devolución se anulan enteros, a lo sumo una vez, con los montos copiados y un motivo de la lista.
- **Nunca queda devuelto más de lo cobrado**: el remanente de cada moneda de una cuenta nunca es negativo, y lo devuelto de una venta sin cliente nunca supera sus cobros vigentes.
- Una devolución desde la cuenta nunca supera lo que está a favor; una de una venta, solo si no tiene cliente y está anulada, y nunca más de lo que queda a devolver.
- Lo anulado no cuenta en ninguna imputación ni en lo esperado; lo decide una sola función, `imputeAccount`, alimentada por una sola, `clientAccount`.
- Lo esperado de una sesión cuenta solo lo anulado mientras estaba abierta, y ninguna salida lo deja por debajo de cero. Una sesión cerrada no cambia.
- Una devolución en efectivo está en la sesión abierta; una que no es en efectivo, en ninguna.
- Toda escritura de `cash` toma primero el bloqueo de cobros, el cliente después si lo lleva, y el contador último.
- Ningún rechazo escribe, numera ni audita. Las series `AR`, `D` y `AD` no tienen huecos ni repetidos, por organización.
- `sales`, `orders` y `crm` no importan `cash`, y `cash` no bloquea ninguna venta.

## Criterios de aceptación

- **AC-1 (esquema)**: la `0045` crea las tres tablas, sus enums y sus tipos, y corre en la misma transacción que las anteriores (H-7). En `refunds-schema.test.ts`, con el rol dueño:
  - **solo inserción** de las tres, para cualquier rol;
  - **a lo sumo una anulación** por cobro y por devolución;
  - **la copia**: rechaza una anulación con otra moneda, otro monto u otra sesión que la de D-1, y una con sesión si la del cobro está cerrada;
  - **el destino de la devolución**: el `CHECK` rechaza una de cuenta sin cliente o con venta, y una de venta con cliente;
  - **el efectivo y la sesión**: una devolución en efectivo sin sesión, una que no es en efectivo con sesión, y una en una sesión cerrada;
  - **las claves compuestas**: rechazan referencias de otra organización.
- **AC-2 (anulación de un cobro)**: numera en `AR`; un cobro anulado deja de contar en lo que falta de su venta, en lo señado de su pedido y en la cuenta; vale para una seña retenida, aplicada y cancelada; en efectivo con la sesión abierta baja lo esperado; con la sesión cerrada, el arqueo guardado no cambia y la sesión la lista como posterior; `already_voided`.
- **AC-3 (devolución)**: numera en `D`; desde la cuenta, hasta lo que está a favor (H-2) y sin cambiar lo que le falta a ninguna venta; desde una venta sin cliente anulada, hasta lo que queda a devolver; `sale_not_refundable` con una venta con cliente o vigente; en efectivo, desde la sesión abierta, baja lo esperado y nunca lo deja negativo.
- **AC-4 (anulación de una devolución)**: numera en `AD`; lo devuelto vuelve a estar a favor o a devolver; con la sesión abierta, sube lo esperado; con la cerrada, no lo toca y se lista como posterior.
- **AC-5 («nunca devuelto más de lo cobrado»)**: el caso de H-3 se rechaza con `refunds_exceed_receipts`; un cobro retenido o directo se anula aunque haya devoluciones; en una venta sin cliente, la anulación de un cobro que dejaría lo devuelto por encima de lo cobrado se rechaza.
- **AC-6 (rechazos)**: cada respuesta de D-13, sin escribir, numerar ni auditar; un `viewer` recibe `FORBIDDEN`.
- **AC-7 (serialización)**:
  - **el bloqueo**: cada una de las tres escrituras espera el bloqueo de cobros retenido desde otra conexión, con la aserción de la regla antes del ayudante de la cola (lección de la 21.4); otra organización no espera;
  - **dos anulaciones del mismo cobro en cola**: una escrita y un `already_voided`;
  - **una devolución y una anulación de cobro del mismo cliente en cola** que juntas dejarían devuelto más de lo cobrado: una escrita y un rechazo, en los dos órdenes;
  - **dos devoluciones de la misma cuenta en cola** que juntas superan lo que está a favor;
  - **una anulación de un cobro en efectivo y el cierre de su sesión en cola**, en los dos órdenes: antes del cierre, lo esperado la descuenta; después, el arqueo no cambia y la anulación queda sin sesión;
  - **una devolución en efectivo y un cierre en cola**, en los dos órdenes;
  - **D-11**: la devolución cruzada con la anulación de una venta y con la cancelación de un pedido;
  - **D-12**: un cobro en cola detrás de la anulación de una devolución y detrás de la de un cobro del remanente.

  Cada escenario lleva su mutación, que lo tumbe **por su regla y no por su andamio**.
- **AC-8 (lecturas)**: los dos roles ven lo anulado marcado, las devoluciones, lo que está a favor, la caja con lo de D-6 y las anulaciones posteriores de una sesión cerrada; un `viewer` sin los datos de contacto; otra organización da `NOT_FOUND`.
- **AC-9 (pantallas)**: un end-to-end sobre `next start`:
  - `admin`, con teclado: anula un cobro en efectivo con la sesión abierta y ve lo esperado; anula una venta sin cliente cobrada, devuelve en efectivo, anula la devolución y vuelve a devolver; devuelve el saldo a favor de un cliente; ve el rechazo de una devolución de más;
  - una sesión cerrada con una anulación posterior;
  - sin JavaScript: una anulación y una devolución;
  - un `viewer` no ve ninguna acción;
  - axe sin violaciones en claro y en oscuro.
- **AC-10 (guardas)**: `cash-writes` fija un llamador por escritura nueva (`voidReceipt`, `createRefund` y `voidRefund`) y falla con un caso nuevo de cada una; `exposed-surface` declara las acciones nuevas.
- **AC-11 (fronteras)**: `sales`, `orders` y `crm` no cambian ni importan `cash`; `cash` usa de ellos solo lecturas y bloqueos que ya existen; `imputeAccount` y `src/shared/` no cambian.
- **AC-12 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-13 (datos de un cliente)**: la exportación trae las tres, con su test; el borrado cuenta las devoluciones.
- **AC-14**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-15**: la documentación del punto 8 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-16** (si D-15): producción corre el SHA del cierre con la `0045`. En Demostración Vixora, el recorrido de D-15 se concilia contra la base:
  - las anulaciones y las devoluciones, con sus montos copiados, su sesión y su motivo;
  - lo que le falta a cada venta y lo que está a favor o a devolver, igual a la regla;
  - lo esperado del cierre, y el arqueo sin cambios de la sesión cerrada;
  - los contadores `receipt_void`, `refund` y `refund_void`;
  - la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-8, AC-10 a AC-13, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-9 (UI ↔ servicio ↔ base) y AC-12.
- `isolated-runtime`: AC-16, si se despliega.
- **Las mutaciones** se corren y se revierten una por una, **con reemplazos literales**, y **un «detectada» se valida por el caso que falla y por dónde falla**: si cae por el ayudante de la cola o un timeout, no cuenta. Su resultado va a §Resultados. Como mínimo:
  - cada escritura sin el bloqueo de cobros;
  - la anulación sin comprobar lo devuelto (D-5), y con la lectura del haber en lugar del remanente;
  - la devolución desde la cuenta hasta el remanente en lugar de `inFavor` (H-2);
  - `standaloneSale` sin restar lo devuelto;
  - `clientAccount` sin filtrar los cobros anulados;
  - lo esperado sin restar las devoluciones, o contando lo anulado después del cierre;
  - la anulación en efectivo sin comprobar lo esperado;
  - `receipt_voids_check_copy()` sin la regla de la sesión;
  - el `CHECK` del destino de la devolución aceptando una venta con cliente;
  - un segundo llamador de cada escritura nueva en la guarda;
  - la exportación sin las devoluciones.
- La batería se corre **desde Git Bash**, sin nada en paralelo con el end-to-end, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial `sales`, `orders`, `crm`, `imputeAccount`, `src/shared/` o la ficha del cliente;
- el diseño exigiría cambiar el texto del ADR 0022 (más allá de la nota de D-5), del 0021, del 0019 o del 0016;
- `sales`, `orders` o `crm` tendrían que importar `cash`, o `cash` bloquear una venta;
- alguna secuencia pudiera dejar devuelto más de lo cobrado, devolver más de lo que está a favor, dejar lo esperado de la sesión abierta negativo o cambiar una sesión cerrada;
- una anulación pudiera contarse a la vez como vigente y anulada, o un comprobante anularse dos veces;
- la migración no corriera en la misma transacción que las anteriores;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- aparece una vía por la que un `viewer` escribe, o un texto libre o un dato personal entra a las tablas nuevas;
- hace falta una dependencia nueva;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.

## Resultados — 2026-10-14 (autoevaluación)

Implementado el 2026-10-14. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-14 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvío aprobado por el usuario el 2026-10-14, tras la revisión independiente:**

- **La devolución desde la cuenta toma la ficha del cliente en modo exclusivo** (hallazgo medio de la revisión; D-11 y H-4 precisados arriba).
  - H-4 valía para el remanente, pero no para lo que está a favor, el tope de D-7: emitir una venta lo achica, y tomaba la ficha en modo compartido igual que la devolución, así que las dos no se esperaban.
  - `crm` suma `lockClientForRefund` (`FOR NO KEY UPDATE`), en `crm/service.ts`, `crm/repository.ts` y `crm/index.ts`, fuera de la lista autorizada. `sales` y `orders` no cambian, y ninguno importa `cash`.
  - No hay ciclo: `cash` toma siempre primero el bloqueo de cobros y después la ficha, y `sales`, `orders` y `crm` nunca toman el bloqueo de cobros.
  - **El ADR 0022 lleva una segunda precisión fechada** en el punto 4, debajo del orden de bloqueo y sin cambiar su texto. La lista autorizaba solo la nota de D-5.

**Precisiones que no cambian una decisión:**

- **Las acciones de la devolución y de su anulación viven en `devoluciones/actions.ts`**, y las páginas de la cuenta y de la venta las importan desde ahí. **El formulario de la anulación (`void-form.tsx`) vive en `cobros/[receiptId]/anular/`** y lo reusa la anulación de una devolución. Las dos carpetas estaban autorizadas.
- **`readTotalsInput` lee sus seis consultas una tras otra**, no en paralelo: en paralelo sobre la misma transacción, `pg` avisaba de consultas superpuestas.
- **El end-to-end abre la caja por SQL**, como `receipts.spec.ts` y `order-receipts.spec.ts`. La apertura con el teclado ya la cubre `cash.spec.ts`.
- **EngineeringStandards tenía dos recuentos atrasados de subfases anteriores**, corregidos con nota fechada y sin reescribir el texto: son veintiuna guardas desde la 21.2, y la 21.4 no había anotado `createOrderReceipt` en `cash-writes`.
- **HANDOFF y Roadmap se tocaron antes del cierre**, a pedido del usuario: los tres recordatorios para fases futuras (la estética, las métricas por sección y Meta Ads). La línea de estado de HANDOFF se actualiza al cerrar.
- **Una descarga fuera del proyecto**: un `npx prettier` corrido por error fuera del repositorio bajó `prettier@3.9.10` a la caché global de `npx`. No entró a `package.json` ni al lockfile, y no formateó ningún archivo. Se declara porque la regla prohíbe instalar sin autorización.
- **Lo que no tiene mutación propia** en AC-7: los cruces de D-11 con la anulación de una venta y con la cancelación de un pedido, y D-12. Prueban que algo **sigue** cabiendo o que un cobro ve lo que falta después, y no se encontró un reemplazo literal en `cash` que los tumbe sin tumbar antes otro caso. El cruce nuevo, con la emisión de una venta, sí la tiene (M22).
- **Un mensaje de error cosmético**: `receipts_check_cash_session()` de la `0043` se reusa para `refunds` y dice «cobro» en su texto. No llega a la pantalla, porque el servicio rechaza antes.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | La `0045` corre con toda la cadena en la base de test. `refunds-schema.test.ts`, 34 casos: solo inserción de las tres para cualquier rol, a lo sumo una anulación, la copia con la regla de la sesión, el `CHECK` del destino, el efectivo y su sesión, y las claves compuestas |
| AC-2 | cumplido | `receipt-voids.test.ts`: la serie `AR`; lo que deja de contar en la venta, el pedido y la cuenta; la seña retenida, aplicada y cancelada; lo esperado con la sesión abierta; el arqueo sin cambios y la anulación posterior con la cerrada; `already_voided` |
| AC-3 | cumplido | `refunds.test.ts`: la serie `D`; desde la cuenta, hasta lo que está a favor sin tocar lo que le falta a ninguna venta; desde una venta sin cliente anulada; `sale_not_refundable`; el efectivo y lo esperado |
| AC-4 | cumplido | `refunds.test.ts`: la serie `AD`; lo devuelto que vuelve a estar a favor o a devolver; la sesión abierta y la cerrada |
| AC-5 | cumplido | El caso de H-3 con `refunds_exceed_receipts`; un cobro retenido o directo que se anula con devoluciones; la venta sin cliente |
| AC-6 | cumplido | Cada respuesta de D-13 sin escribir, numerar ni auditar, con la foto de las tablas antes y después; `FORBIDDEN` para un `viewer` |
| AC-7 | cumplido, con la precisión de arriba | El bloqueo y otra organización, para las tres escrituras (la parte de otra organización en la devolución y su anulación la sumó la revisión independiente); las colas de AC-7; D-11 con la anulación de una venta, la cancelación de un pedido y, desde la revisión, la emisión de una venta en los dos órdenes; D-12 |
| AC-8 | cumplido | Los dos roles leen lo anulado, las devoluciones, lo que está a favor, la caja y las anulaciones posteriores; un `viewer` sin el contacto; otra organización da `NOT_FOUND` |
| AC-9 | cumplido | `refunds.spec.ts` sobre `next start`, cuatro casos: el recorrido del admin con el teclado, la sesión cerrada con una anulación posterior, el `viewer`, y la anulación y la devolución sin JavaScript. axe en claro y en oscuro |
| AC-10 | cumplido | `cash-writes` fija `voidReceipt`, `createRefund` y `voidRefund`, con un caso nuevo de cada una (M16 a M18); `exposed-surface` declara las acciones nuevas |
| AC-11 | cumplido, con el desvío aprobado | `sales`, `orders` y `crm` no importan `cash`, y `sales` y `orders` no cambian. `crm` suma `lockClientForRefund`. En `imputation.ts` solo cambian `standaloneSale` y los comentarios; `src/shared/` no está en el diff |
| AC-12 | cumplido en local | `read-api`, `read-api-v2` e `ingestion-v2` en la batería; `docs/contracts/` no está en el diff |
| AC-13 | cumplido | `client-data.test.ts`, casos 47 a 49; el runbook está actualizado |
| AC-14 | ver la batería | Abajo. La CI corre al hacer push |
| AC-15 | cumplido | DataModel, Overview, FunctionalRequirements (FR-CAJ-16 a 20), Screens (§32 a §36 y las notas de §16, §18, §21, §26, §29 y §30), TraceabilityMatrix, SecurityModel (126 puntos de entrada), EngineeringStandards, el runbook y las dos precisiones fechadas del ADR 0022 |
| AC-16 | pendiente | El despliegue, si se autoriza (D-15) |

### Mutaciones

Cada mutación se aplicó al código real con un reemplazo literal, se corrió y se revirtió con un script, que compara el md5 de cada archivo antes y después. «Detectada» quiere decir que falló **el caso previsto**, leído por su nombre en el reporte JSON de vitest, y no por su andamio (el ayudante de la cola o un timeout). Entre paréntesis, cuántos casos del archivo fallaron.

| Id | Mutación | Resultado |
|---|---|---|
| M1 | la anulación de un cobro sin el bloqueo de cobros | Detectada (5 de 14) |
| M2 | la devolución sin el bloqueo de cobros | Detectada (4 de 14) |
| M3 | la anulación de una devolución sin el bloqueo de cobros | Detectada (4 de 14) |
| M4 | la anulación sin comprobar lo devuelto (D-5) | Detectada (3 de 28) |
| M5 | la anulación con la lectura del haber en lugar del remanente (H-3) | Detectada (1 de 14) |
| M6 | la devolución desde la cuenta hasta el remanente en lugar de lo que está a favor (H-2) | Detectada (1 de 14) |
| M7 | `standaloneSale` sin restar lo devuelto (H-1) | Detectada (1 de 14) |
| M8 | `clientAccount` sin filtrar los cobros anulados (D-8) | Detectada (5 de 14) |
| M9 | `clientAccount` sin pasar las devoluciones a la regla | Detectada (7 de 14) |
| M10 | lo esperado sin restar las devoluciones (D-6) | Detectada (3 de 14) |
| M11 | lo esperado sin restar los cobros anulados en la sesión (D-6) | Detectada (2 de 14) |
| M12 | la anulación de una sesión cerrada contada en esa sesión | Detectada (2 de 14) |
| M13 | la anulación en efectivo sin comprobar lo esperado (punto 8) | Detectada (1 de 14) |
| M14 | `receipt_voids_check_copy()` sin la regla de la sesión abierta | Detectada (1 de 34) |
| M15 | el `CHECK` del destino aceptando una venta con cliente | Detectada (1 de 34) |
| M16 | la guarda: la anulación de un cobro escrita desde un ayudante | Detectada (1 de 40) |
| M17 | la guarda: la devolución escrita desde la anulación de un cobro | Detectada (1 de 40) |
| M18 | la guarda: la anulación de una devolución escrita desde la devolución | Detectada (1 de 40) |
| M19 | la exportación sin las devoluciones (D-10) | Detectada (1 de 50) |
| M20 | dos anulaciones del mismo cobro sin comprobar si ya está anulado | Detectada (2 de 14) |
| M21 | lo esperado del arqueo sin las devoluciones, en unitarios | Detectada (2 de 11) |
| M22 | la devolución desde la cuenta con la ficha en modo compartido (después de la revisión) | Detectada (2 de 16): los dos órdenes del cruce con la emisión de una venta caen en la aserción de la regla, antes del ayudante. Corrida a mano con el mismo método: reemplazo literal, md5 antes y después |

### La batería

Desde Git Bash, una etapa tras otra y sin nada en paralelo con el end-to-end.

- **Primera corrida, antes de los cambios de la revisión**: formato, lint, typecheck, unitarios (767), guardas (654), integración (1284) y build pasaron. El end-to-end dio 189 de 191: fallaron `clients.spec.ts`, caso 9, y `products.spec.ts`, caso 22, los dos por timeout (el segundo marcó una hora, con la máquina suspendida). Corridos solos, pasaron los dos. No son de esta subfase.
- **Corrida final, con los cambios de la revisión**: formato, lint, typecheck, unitarios (767), guardas (654), integración (1286, con los casos nuevos) y build pasaron.
- **El end-to-end, en dos mitades, el 2026-10-15**: las 13 specs anteriores a `orders.spec.ts`, 104 de 104; de `orders.spec.ts` al final, 87 de 87. Son los 191 casos de la suite, todos sobre el mismo código.
- **Las tres corridas completas del end-to-end posteriores fallaron por el entorno, no por una aserción**: el servidor de `next start` terminó sin dejar error en stderr en un punto distinto cada vez (casos 108, 117 y 153), y todo lo que siguió cayó con `ERR_CONNECTION_REFUSED`. La base no se reinició (`RestartCount` 0, sin OOM), y la máquina tenía 7,7 GB con 0,7 libres, con Docker Desktop y una instancia de SQL Server ajena al proyecto corriendo. La causa más probable es la presión de memoria, **inferida y no demostrada**. La evidencia definitiva es la CI, que corre la suite completa al hacer push.

## Revisión independiente — 2026-10-14

Un agente que no participó del trabajo, con acceso de solo lectura, revisó contra este brief, el ADR 0022 y las reglas vigentes (D-14). Sus hallazgos se verificaron contra el código antes de aceptarse. **No otorga ninguna autorización.**

| Hallazgo | Severidad | Verificación | Qué se hizo |
|---|---|---|---|
| Emitir una venta cruzada con una devolución desde la cuenta permite devolver lo que la venta tenía que absorber; H-4 no lo cubre | medio | **Confirmado**: `createRefund` y `issueSaleFromOrder` tomaban la ficha con `lockClientForOrder`, los dos en modo compartido. Era una condición de detención; se elevó al usuario | Con su aprobación, `lockClientForRefund` en modo exclusivo; el cruce en los dos órdenes; M22; H-4, D-11, el ADR 0022 y DataModel precisados con fecha |
| HANDOFF y Roadmap modificados antes del cierre, y la línea de estado de HANDOFF falsa | bajo | **Confirmado en parte**: se tocaron a pedido del usuario, por los recordatorios. La línea de estado es la del cierre de la 21.4 | Declarado arriba; la línea se actualiza al cerrar |
| AC-7, «otra organización no espera», solo probado para la anulación de un cobro | bajo | **Confirmado** | El caso de la devolución y su anulación suma las dos escrituras de otra organización con el bloqueo retenido |
| Con varias monedas, cambiar la moneda no cambiaba el monto propuesto | menor | **Confirmado** | `refund-form.tsx` propone lo disponible en la moneda elegida |
| La nota de `expected` en DataModel no mencionaba las anulaciones | menor | **Confirmado** | Corregida |
| El trigger reusado dice «cobro» en una devolución | menor | **Confirmado** | Declarado, sin cambiar la `0043` |

El revisor no pudo ver diffs ni la lista completa de archivos tocados. **Se completó acá**: todo lo tocado está en la lista autorizada, salvo `crm` (el desvío aprobado), HANDOFF y Roadmap (a pedido del usuario); el diff de `imputation.ts` toca solo `standaloneSale` y comentarios.
