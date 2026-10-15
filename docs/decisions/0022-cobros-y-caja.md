# 0022 — Cobros, caja y cuenta corriente

- Estado: **aceptada** (decisión del usuario del 2026-10-13), con las correcciones de la revisión independiente del 2026-10-13 (R1: 3 bloqueantes, 6 medios y 6 bajos, verificados uno por uno; los tres bloqueantes cambian el diseño: la caja por moneda, la anulación de un cobro en efectivo con la sesión cerrada y la regla que impide dejar devuelto más de lo cobrado, y R-7 suma la anulación de la devolución). Subfase 21.1, [brief-21.1](brief-21.1-adr-de-cobros-y-caja.md), aprobado el 2026-10-13 con las recomendaciones de D-1 a D-14, sin Mercado Pago en la lista inicial de medios y con la cuenta corriente agregada como D-15, confirmada por el usuario ese día.
- Fecha: 2026-10-13
- Nivel: **diseñado**. No hay código, tablas ni ejecución.
- *Nota del 2026-10-15*: el [ADR 0023](0023-compras-y-proveedores.md), compras y proveedores, suma a `cash` los pagos a proveedores desde la 22.6, sin cambiar el texto de este ADR:
  - **punto 4**: escriben dinero también el pago a un proveedor y su anulación, con el bloqueo de cobros primero, **el proveedor en modo compartido en el lugar del cliente** y el contador al final;
  - **punto 8**: lo esperado suma «− pagos a proveedores en efectivo + pagos a proveedores anulados en la sesión», y un pago en efectivo no deja lo esperado por debajo de cero;
  - **punto 11**: los pagos se llaman `supplier_payments` y `supplier_payment_voids`, con los prefijos `PP` y `APP`; ninguna tabla se llama `payments`;
  - **punto 12**: la cuenta de un proveedor y los pagos son solo de `admin`. Un `viewer` ve el arqueo con el total de los pagos en efectivo, y puede inferir de ahí un costo: es un límite aceptado por el usuario (ADR 0023, punto 12);
  - **punto 13**: `cash` depende de `purchasing`, y `purchasing` no depende de `cash`. La cuenta del proveedor usa `imputeAccount` sin cambiar la regla.

## Contexto

El [Roadmap](../planning/Roadmap.md) §Fase 21 pide «medios de pago, cobros contra una venta o un pedido (incluidas las señas), apertura y cierre de caja con arqueo. El agente nunca registra un cobro». El usuario abrió la Fase 21 el 2026-10-13, con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3). Ese mismo día, al aprobar el brief, **sumó la cuenta corriente de clientes**, que el ADR 0016 (punto 1) y el Roadmap dejaban «sin fase hasta que el uso los pida».

Lo que acota la decisión, verificado el 2026-10-13 contra `main` (`9add7d5`):

- **El ADR 0016**:
  - punto 4: el dinero es `numeric` con moneda explícita; lo que mueve dinero es de solo inserción, y un comprobante emitido se anula con otro; cada fase agrega su módulo, y da `cash` como ejemplo;
  - punto 5: **el agente nunca registra un cobro, un pago ni un movimiento de caja**, y «Quiere señar» sigue siendo una etiqueta;
  - punto 6: los comprobantes son internos, no fiscales.
- **El [ADR 0019](0019-bases-de-los-comprobantes.md)** fija:
  - la numeración sin huecos por `(organization_id, tipo)` con el contador al final;
  - una moneda por comprobante, sin tipos de cambio;
  - `numeric(14, 2)` con `src/shared/money/`, cuyo `moneyToDatabase` rechaza un monto negativo;
  - la leyenda «Documento no válido como factura».
- **El [ADR 0020](0020-el-pedido.md)**: el pedido es un compromiso con estado (`pending`, `confirmed`, `delivered`, `cancelled`, los dos últimos finales), y sus transiciones bloquean la cabecera `FOR UPDATE`.
- **El [ADR 0021](0021-la-venta.md)**:
  - la venta es un comprobante de solo inserción y sin estados, y «anulada» se deriva de que exista su `sale_voids`;
  - se emite solo desde un pedido `delivered`, y «si el negocio cobra antes de entregar, lo resuelve la Fase 21 con un cobro contra el pedido» (§Alternativas descartadas);
  - las ventas de un pedido forman una cadena (`replaces_sale_id`) de la que solo el último eslabón puede estar vigente (punto 3);
  - punto 9: **«Ningún módulo depende de `sales`»**, y la venta en el detalle del pedido la compone la página.
- **DataModel**:
  - la regla 14 dice que los pagos siguen sin modelo, y §«Explícitamente fuera» lista `payments` y `cash_accounts`;
  - §`knowledge_entries`: «“aceptamos transferencia” es una entrada, no una tabla de medios de pago»; el agente la lee como texto por `read-v1`;
  - §`sale_voids`: `crm_app` no tiene `UPDATE` en `sales` y no puede bloquear una venta.
- **PostgreSQL 18**, [documentación de `SELECT`](https://www.postgresql.org/docs/18/sql-select.html), §Description, leída el 2026-10-13: «The use of `FOR NO KEY UPDATE`, `FOR UPDATE`, `FOR SHARE` or `FOR KEY SHARE` requires `UPDATE` privilege as well». **Una venta no se puede bloquear en ningún modo** desde `crm_app` (H-3 del brief).
- **El código**:
  - no hay módulo de cobros ni de caja;
  - `voidSale` y `cancelOrder` **no consultan cobros**. `voidSale` bloquea el pedido con `lockOrderForSale` y los productos con `lockProductsForOrder`, y las transiciones del pedido bloquean los productos; ninguna lee nada de dinero fuera de su módulo;
  - `sales.currency` es por venta: una organización puede vender en más de una moneda;
  - `orders` expone `lockOrderForSale`, que bloquea la cabecera en la transacción de otro módulo;
  - el CRM ya serializa por organización con `pg_advisory_xact_lock(hashtextextended(…, 0))`, en `crm/repository.ts` (el catálogo de etiquetas) y en `knowledge/hours-repository.ts` (el horario);
  - `document_kind` tiene `order`, `sale` y `sale_void`, y `formatDocumentNumber` arma el número con el prefijo del tipo;
  - `member_role` es `admin` o `viewer`.
- **No hay un negocio real** (13.5.2-b): los medios de pago y la forma de operar la caja se diseñan para un comercio chico, sin datos de uno.

## Decisión

### 1. Qué decide este ADR

**Decide**:

- el cobro y contra qué se registra;
- la seña;
- lo cobrado de una venta anulada o de un pedido cancelado;
- la anulación del cobro, la devolución y la anulación de la devolución;
- los medios de pago;
- la caja, su apertura, su cierre, el arqueo y sus movimientos;
- la cuenta corriente del cliente;
- la serialización;
- el número y el comprobante entregable;
- las dependencias, los roles, el agente y los datos de un cliente;
- qué crea cada subfase.

**«Devolución» quiere decir aquí devolver plata al cliente** (`refunds`). La devolución de mercadería, que el ADR 0021 llama «las devoluciones como operación propia», **sigue fuera**: si la mercadería vuelve, es un ajuste de stock y, si corresponde, la anulación de la venta.

**No decide**:

- los intereses, los vencimientos y los recordatorios de deuda;
- un límite de crédito que bloquee una venta;
- los pagos a proveedores y los gastos (Fase 22 o sin fase);
- la conciliación bancaria y cualquier integración con un medio de pago;
- las cuotas, los recargos, los descuentos por medio de pago y los tipos de cambio;
- la factura de ARCA y la discriminación del IVA;
- las métricas de cobros y de caja.

### 2. El cobro es un comprobante emitido, de solo inserción

- **Registra un monto, en un medio de pago, contra un solo destino**:
  - una venta;
  - un pedido (la seña, punto 5);
  - o la cuenta de un cliente (el cobro a cuenta, punto 9).

  Nunca contra dos ni contra ninguno. **El destino es una columna discriminadora** (`sale`, `order`, `account`) con un `CHECK` que exige la clave de su destino y ninguna otra: `sale_id` solo con `sale`, `order_id` solo con `order`, y con `account` solo el cliente. No sirve un `num_nonnulls` sobre la venta, el pedido y el cliente, porque el cliente también se copia en los otros dos destinos (revisión independiente, R-11).
- **Es de solo inserción**: `crm_app` con `SELECT` e `INSERT`, y un trigger que rechaza `UPDATE` y `DELETE` para cualquier rol ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md), regla 10 de DataModel).
- **No tiene estados.** Lo que lo deja sin efecto es otro comprobante, su anulación (punto 7).
- **La moneda es la de su destino**: la de la venta o el pedido. Un cobro a cuenta va en la moneda que se elija, y la cuenta tiene un saldo por moneda (punto 9). Sin tipos de cambio (ADR 0019, punto 3).
- **El monto es positivo** y en `numeric(14, 2)`. `src/shared/money/` no cambia.
- **Copia el cliente de su destino**: el de la venta o del pedido, o el de la cuenta. Es nulo solo en el cobro de una venta sin cliente. Así la cuenta de un cliente se lee en el módulo de cobros sin cruzar módulos (punto 13). **Que la copia sea la del destino lo asegura el servicio**, que lee el destino por la interfaz de su módulo con el bloqueo de cobros tomado, y un test lo fija. Un trigger de `cash` que leyera `sales` u `orders` cruzaría módulos en la base, y no se hace (revisión independiente, R-11).
- **Si el medio es efectivo**, el cobro queda en la sesión de caja abierta, y sin una se rechaza (punto 8).
- **Sin texto libre**: ni referencia de la operación ni observaciones, como la venta.
- Se audita en la misma transacción, con un `entity_type` nuevo y la acción `create`.

### 3. Cuánto y cuántas veces se cobra

- **Un destino admite varios cobros**: parciales, en distintos medios y en distintos días. Es el caso del pago dividido entre efectivo y tarjeta y de la seña seguida del saldo.
- **Lo que falta cobrar se deriva y no se guarda**, con la regla de imputación del punto 9. Para una venta sin cliente es su total menos sus cobros vigentes.
- **Un cobro contra una venta o un pedido nunca supera lo que le falta cobrar.** Se rechaza con `BUSINESS_RULE_VIOLATION` e informa lo que falta. No hay vuelto registrado: el vuelto del efectivo se resuelve en el mostrador y se registra lo cobrado.
- **Lo que excede**, solo por un cobro a cuenta o por lo cobrado de un comprobante que se anuló o se canceló, es **saldo a favor de la cuenta del cliente**, nunca de un comprobante (punto 9).

### 4. La serialización

Ninguna venta se puede bloquear (§Contexto, PostgreSQL), y la imputación del punto 9 cruza todas las ventas de un cliente. **Toda escritura de dinero del módulo de cobros toma primero un bloqueo de transacción por organización**, `pg_advisory_xact_lock(hashtextextended('cash:' || organization_id, 0))`, el mismo patrón del catálogo de etiquetas y del horario. Escriben dinero:

- el cobro y su anulación;
- la devolución y su anulación;
- la apertura y el cierre de una sesión de caja;
- un movimiento manual de caja.

**El orden de bloqueo de cada escritura**:

1. el bloqueo de cobros de la organización;
2. si el destino es un pedido, su cabecera `FOR UPDATE`, por la interfaz de `orders` (punto 13);
3. si la escritura lleva cliente, su ficha en modo compartido, por la interfaz de `crm`, porque el `INSERT` la toma por su clave foránea. Es la precisión del ADR 0021, punto 7, del 2026-10-13. Sin este paso, el `INSERT` esperaría detrás de una edición del cliente, que `crm` bloquea `FOR UPDATE`, reteniendo el bloqueo de cobros y frenando todo el dinero de la organización (revisión independiente, R-8);
4. la comprobación: el destino, lo que falta cobrar, la sesión abierta y el medio activo;
5. al final, el contador del tipo de comprobante (ADR 0019, punto 2).

*Precisado el 2026-10-14 en la 21.5, sin cambiar el texto de arriba* ([brief-21.5](brief-21.5-la-anulacion-y-la-devolucion.md), D-11 precisado tras la revisión independiente, aprobado por el usuario): **la devolución desde la cuenta toma la ficha en modo exclusivo** (`FOR NO KEY UPDATE`, con `lockClientForRefund` de `crm`), no compartido. Su tope es lo que está a favor, y emitir una venta, que toma la ficha en modo compartido sin el bloqueo de cobros, lo achica: con el modo compartido las dos no se esperaban y la devolución podía llevarse lo que la venta nueva tenía que absorber. El paso sigue antes de la comprobación y del contador, y `FOR NO KEY UPDATE` no choca con las claves foráneas que apuntan al cliente.

**El aislamiento**: las transacciones corren en `READ COMMITTED`, el nivel por defecto, que es el que usa hoy el CRM. **Toda lectura que decide se hace después de tomar el bloqueo de cobros**: en `READ COMMITTED` cada sentencia ve lo confirmado hasta ese momento. Con `REPEATABLE READ`, la foto se tomaría antes de esperar el bloqueo y la serialización no valdría (revisión independiente, R-15).

**Por qué no hay ciclos**: `sales` y `orders` nunca toman el bloqueo de cobros. Los caminos que toman el pedido y el cliente lo hacen en el mismo orden que `sales`: primero el pedido y después el cliente.

**Lo que este bloqueo no serializa**: la emisión y la anulación de una venta, que siguen en `sales` sin mirar los cobros (punto 6). Si una venta se anula mientras se registra un cobro contra ella, el cobro queda contra una venta anulada, y su monto pasa a la cuenta del cliente o queda a devolver (punto 6). **No se pierde ni se cuenta dos veces.** El brief de la subfase que implemente el cobro de una venta prueba este caso.

**El costo**: los cobros de una organización se serializan entre sí. Es el mismo trato que la numeración (ADR 0019) y es aceptable para el volumen de un negocio chico.

### 5. La seña

- **La seña es un cobro contra un pedido**, no un comprobante aparte (ADR 0021, §Alternativas).
- Se cobra contra un pedido **`pending` o `confirmed`**. Contra uno `delivered` o `cancelled` se rechaza: el pedido entregado se cobra por su venta.
- **Mientras el pedido no se vende, su seña no es saldo a favor**: queda retenida para ese pedido. No entra en la imputación de otras ventas.
- **Cuando el pedido se vende**, los cobros del pedido **cuentan para la venta vigente de su cadena** (`replaces_sale_id`). Si la venta se anula y se vuelve a emitir, cuentan para la nueva. El cobro sigue apuntando al pedido: no se mueve ni se copia.
- **Cuando el pedido se cancela**, lo cobrado pasa a la cuenta del cliente como saldo a favor (punto 6).
- **Si el pedido está entregado y su última venta está anulada sin reemplazo**, la seña sigue retenida para el pedido hasta que se vuelva a emitir.
- «Quiere señar» sigue siendo una etiqueta: no crea ni sugiere un cobro (ADR 0016, punto 5).

### 6. Lo cobrado de una venta anulada o de un pedido cancelado

- **Anular una venta y cancelar un pedido no miran los cobros.** `sales` y `orders` no cambian y no dependen del módulo de cobros.
- **La plata ya entró, y el sistema no la devuelve solo.** Lo cobrado contra una venta anulada o un pedido cancelado deja de estar retenido para ese comprobante:
  - **con cliente**, pasa a su cuenta como saldo a favor (punto 9). Ahí se imputa a sus otras ventas con saldo o se devuelve (punto 7);
  - **sin cliente** (venta a consumidor final), queda **a devolver** sobre esa venta, y solo una devolución lo salda.
- Si la venta de un pedido se anula y se vuelve a emitir, los cobros **del pedido** siguen contando para la venta nueva (punto 5). Solo lo cobrado **contra la venta anulada** pasa a la cuenta.
- Lo que está a devolver o a favor se muestra en el detalle de la venta, en el del pedido y en la cuenta del cliente.

### 7. La anulación del cobro, la devolución y la anulación de la devolución

Son operaciones distintas, cada una con su comprobante de solo inserción y su serie.

**La anulación de un cobro** corrige un cobro mal registrado: la plata no entró, entró por otro medio o por otro monto, o se cargó en el destino equivocado. Después se registra el cobro correcto.

- Anula el cobro entero, a lo sumo una vez, con `UNIQUE` sobre el cobro.
- Lleva un motivo de una lista cerrada, sin texto libre, como la anulación de la venta (ADR 0021, punto 6).
- El cobro anulado deja de contar en toda imputación.
- **Se rechaza si dejaría devuelto más de lo cobrado** (revisión independiente, R-2). La comprobación se hace con el bloqueo de cobros tomado:
  - **en la cuenta de un cliente**, en cada moneda, el haber sin ese cobro no puede quedar por debajo de sus devoluciones vigentes (el remanente del punto 9 nunca es negativo);
  - **en una venta sin cliente**, sus cobros vigentes sin ese cobro no pueden quedar por debajo de sus devoluciones vigentes.

  Si la plata ya se devolvió, primero se anula la devolución, si fue un error, o se acepta que lo devuelto queda como está.

  *Precisado el 2026-10-14 en la 21.5, sin cambiar el texto de arriba* ([brief-21.5](brief-21.5-la-anulacion-y-la-devolucion.md), H-3 y D-5, aprobado por el usuario): «el haber sin ese cobro» se lee como **el remanente** del paréntesis, no como el haber del saldo. El haber incluye los cobros directos de las ventas vigentes, y con esa lectura se aceptaría anular un cobro que estaba en el remanente aunque lo ya devuelto dejara de caber, y la regla de imputación quedaría inconsistente. La comprobación arma la cuenta sin ese cobro y verifica que el remanente de su moneda no quede por debajo de lo devuelto.
- **Un cobro en efectivo se anula también con su sesión cerrada** (revisión independiente, R-3; reemplaza la regla de este punto que lo prohibía):
  - **con la sesión abierta**, el cobro anulado deja de contar en lo esperado de esa sesión;
  - **con la sesión cerrada**, el arqueo guardado no cambia: es historia. Esa sesión muestra la anulación posterior como explicación de su diferencia, y la sesión abierta no se toca, porque esa plata nunca entró a la caja de hoy.
- Sus montos son los del cobro, positivos, con un trigger que los compara, como `sale_voids_copy_sale`.

**La devolución** registra que la plata salió hacia el cliente.

- Se devuelve solo lo que está a favor o a devolver:
  - el saldo a favor de la cuenta de un cliente;
  - o lo que queda a devolver de una venta sin cliente que se anuló.

  Nunca más que eso, en la moneda de lo que se devuelve. La comprobación se hace con el bloqueo de cobros tomado.
- Lleva un medio de pago. **Si es efectivo, sale de la sesión de caja abierta**, que la exige, y **nunca deja lo esperado por debajo de cero** en esa moneda (revisión independiente, R-6).
- Sin texto libre.

**La anulación de una devolución** corrige una devolución mal registrada (revisión independiente, R-7; el ADR 0016, punto 4, pide que todo comprobante emitido se anule con otro):

- tiene las mismas reglas que la anulación de un cobro: entera, a lo sumo una vez, un motivo de una lista cerrada y los montos copiados;
- la devolución anulada deja de contar, así que lo devuelto vuelve a estar a favor o a devolver;
- **con su sesión abierta**, la devolución en efectivo anulada deja de restar en lo esperado; **con la sesión cerrada**, el arqueo guardado no cambia, como en la anulación de un cobro.

En todas, el efecto lo da el tipo del comprobante, como en `sale_voids`. Ningún monto es negativo.

### 8. La caja

- **Una caja por organización: la del efectivo.** Los demás medios no pasan por la caja: van al banco o a una billetera, cuya conciliación está fuera de este ADR.
- **La caja se opera por sesiones (turnos).** Abrir y cerrar son dos registros de solo inserción, no un estado que cambia:
  - **la apertura** crea la sesión con el efectivo inicial contado, el autor y la fecha. Se encadena a la sesión anterior con una clave foránea compuesta `(organization_id, anterior)`, y la base impide que haya dos abiertas así:
    - `UNIQUE` sobre la anterior: cada sesión tiene a lo sumo una siguiente;
    - **un índice único parcial por organización `WHERE anterior IS NULL`**: una sola primera sesión por organización. `UNIQUE` admite varios nulos, y por eso `sales` tiene su índice parcial aparte (revisión independiente, R-5);
    - un trigger que rechaza abrir si la anterior no tiene cierre.

    Con las tres, las sesiones de una organización forman una sola cadena, y solo la última puede estar abierta;
  - **el cierre** es otra fila, a lo sumo una por sesión (`UNIQUE`). Guarda lo contado y lo esperado, que el servicio calcula con el bloqueo de cobros tomado:

    > **esperado** = inicial + cobros en efectivo − devoluciones en efectivo + aportes − retiros

    Los cobros y las devoluciones anulados con la sesión abierta no cuentan. La diferencia es contado − esperado y no se guarda aparte. **Una sesión cerrada no cambia**, y la base lo defiende: un trigger rechaza un cobro, una devolución o un movimiento que apunte a una sesión con cierre (R-5).
- **La caja es por moneda** (revisión independiente, R-1). El ADR 0019 no da a la organización una moneda por defecto, y una venta puede estar en cualquiera que se acepte. Por eso:
  - el inicial, lo contado y lo esperado se guardan **por moneda**: una fila por moneda en la apertura y en el cierre;
  - cada cobro, devolución y movimiento en efectivo lleva su moneda;
  - lo esperado de una moneda nunca se suma con el de otra;
  - el cierre exige contar cada moneda que tuvo inicial o movimientos en la sesión.

  Un negocio que opera solo en pesos ve una sola moneda.
- **Los movimientos manuales**: un **aporte** o un **retiro** de efectivo, en la sesión abierta, con su moneda, un monto positivo y un motivo de una lista cerrada (por ejemplo, el cambio inicial o el retiro al banco), sin texto libre. **Ninguna salida de la sesión abierta deja lo esperado por debajo de cero** en su moneda: ni un retiro, ni una devolución en efectivo (R-6), ni la anulación de un cobro en efectivo. **Un gasto no es un movimiento de caja**: los pagos son de la Fase 22.
- **Abierta** o **cerrada** se deriva de que exista el cierre.
- La sesión lleva número, para nombrarla en el arqueo y en la auditoría (punto 11).

### 9. La cuenta corriente del cliente

La cuenta es una **lectura derivada**, sin tabla de saldos ni de movimientos.

**El saldo de un cliente**, por moneda, se calcula así:

- **al debe**: sus ventas vigentes. Una venta anulada deja de contar;
- **al haber**:
  - los cobros vigentes de sus ventas, vigentes o anuladas;
  - los de sus pedidos **cancelados**, o **con una venta vigente**;
  - los cobros a cuenta;
- **restan del haber**: sus devoluciones vigentes;
- **no cuentan, retenidas**: las señas de los pedidos sin venta vigente que no están cancelados. Es decir, los `pending` y `confirmed`, y los `delivered` cuya última venta está anulada sin reemplazo. Se muestran aparte (punto 5) y vuelven al haber cuando el pedido se vende o se cancela (revisión independiente, R-4).

Un saldo positivo es deuda del cliente; uno negativo, saldo a favor.

**La imputación** se deriva en cada lectura y no se guarda. Para cada moneda:

1. cada venta vigente recibe primero sus cobros directos y los de su pedido si es la venta vigente de la cadena, hasta su total;
2. todo lo demás del haber, menos las devoluciones, forma un remanente: los cobros a cuenta y lo cobrado de comprobantes anulados o cancelados. **El remanente nunca es negativo**: lo aseguran la devolución, que nunca supera lo que está a favor, y la anulación de un cobro, que se rechaza si dejaría devuelto más de lo cobrado (punto 7);
3. el remanente se reparte entre las ventas con saldo, **de la más vieja a la más nueva**, por fecha de emisión y después por número;
4. lo que sobra es **saldo a favor**.

**Lo que falta cobrar de una venta** sale del paso 3. El saldo del cliente y el de cada venta salen de la misma regla, y no pueden contradecirse. Es una función pura del módulo de cobros, con sus tests.

**Lo demás**:

- **El cobro a cuenta** no elige una venta. Se imputa con la regla. Puede dejar saldo a favor: es la única vía, junto con el punto 6, por la que una cuenta queda a favor.
- **Toda venta con cliente entra en su cuenta.** La venta sin cliente no tiene cuenta, y se cobra y se devuelve contra el comprobante.
- **No hay un límite de crédito que bloquee.** Impedir la venta por el saldo haría depender a `sales` del módulo de cobros (punto 13). La página de la venta puede **mostrar** el saldo del cliente, compuesto por la página.
- **El estado de cuenta**: por cliente, una pantalla con sus ventas, sus anulaciones, sus cobros, sus devoluciones, las señas retenidas y el saldo, imprimible como los comprobantes. Hay también **una lista de clientes con saldo deudor**.
- **Costo conocido**: la lectura compone en memoria las ventas del cliente, leídas por la interfaz de `sales`, y sus cobros. Es aceptable para la cantidad de ventas por cliente de un negocio chico, como las listas compuestas del Overview. La lista de deudores, que lee todas las cuentas de la organización, se mide en su subfase antes de aceptarla.

### 10. Los medios de pago

- **Una lista por organización**, editable con borrado lógico (regla 8 de DataModel), solo de un `admin`.
- Nombre único por organización. **Si es efectivo** se fija al crearlo y no se edita, para que un cobro viejo no cambie de caja.
- **Nace con una lista inicial**: efectivo, transferencia, tarjeta de débito y tarjeta de crédito. Se crea con un botón cuando la lista está vacía, como las etiquetas sugeridas de la 16.1, y no con una migración. *Mercado Pago no va en la lista inicial, por decisión del usuario del 2026-10-13.* El `admin` desactiva o agrega los que use.
- Un medio inactivo no se elige para un cobro nuevo, y los cobros viejos lo conservan.
- **Es la lista de con qué se registró un cobro, no la de qué acepta el negocio.** El agente sigue leyendo los medios de pago como texto de la información del negocio. **`read-v1` no cambia.** Estructurar lo que lee el agente sigue siendo una candidata aparte, con su contrato.

### 11. El número, los nombres y el comprobante entregable

- **Tipos nuevos de `document_kind`**, con su prefijo:

  | Tipo | Qué numera | Prefijo |
  |---|---|---|
  | `receipt` | el cobro, como recibo | `R-000123` |
  | `receipt_void` | la anulación de un cobro | `AR-000012` |
  | `refund` | la devolución | `D-000007` |
  | `refund_void` | la anulación de una devolución | `AD-000002` |
  | `cash_session` | la sesión de caja | `C-000045` |

  Los movimientos manuales no llevan número: se nombran dentro de su sesión. Los buscadores por número de hoy (`sales/service.ts`) no aceptan estos prefijos: cada subfase suma el suyo.
- **Nombres de las tablas**: `payment_methods`, `receipts`, `receipt_voids`, `refunds`, `refund_voids`, `cash_sessions`, `cash_session_closings` y `cash_movements`. Las filas por moneda de la apertura y del cierre (punto 8) las precisa el brief de la 21.2. **Ninguna se llama `payments`**: ese nombre queda para los pagos de la Fase 22 (H-4 del brief). Cada subfase puede precisar columnas, no cambiar lo que guarda cada tabla.
- **El comprobante entregable**: el cobro y la devolución tienen su página imprimible, como la venta (ADR 0021, punto 8), sin dependencias. Muestran:
  - la organización;
  - el número y la fecha;
  - el cliente, o «Consumidor final»;
  - el destino;
  - el medio y el monto;
  - la leyenda **«Documento no válido como factura»**.

  También son imprimibles el estado de cuenta y el arqueo de una sesión cerrada.

### 12. Roles y agente

- **Solo un `admin`** cobra, anula, devuelve, opera la caja y edita los medios de pago.
- **Un `viewer`** ve los cobros, las devoluciones, las sesiones con su arqueo y las cuentas, **sin los datos de contacto del cliente**, como en `sales`.
- **El agente no registra ni lee cobros, devoluciones, caja ni cuentas corrientes** (ADR 0016, punto 5). **Ningún contrato con el agente cambia**, y el agente no recibe ningún aviso en esta fase.

### 13. El módulo y las dependencias

- **Un módulo nuevo, `cash`**, dueño de los medios de pago, los cobros, sus anulaciones, las devoluciones, las sesiones, sus cierres, los movimientos y la lectura de la cuenta corriente.
- **`cash` depende de**:
  - `sales`: las ventas de un cliente, su total, su moneda, si están anuladas y su cadena, todo por lecturas de su interfaz y sin bloqueo;
  - `orders`: leer el pedido y bloquear su cabecera en la transacción de `cash`. Si `lockOrderForSale` sirve tal cual, se generaliza su nombre; si no, `orders` suma una función hermana. Lo decide el brief de la seña;
  - `crm`, para el nombre del cliente en las lecturas;
  - `numbering`, `organizations` y `audit`;
  - `auth`, solo en `schema.ts`, para el autor.
- **Ni `sales`, ni `orders`, ni `crm` dependen de `cash`.** Lo cobrado en el detalle de una venta o de un pedido, y el saldo en la ficha del cliente, los compone la página, como la venta en el detalle del pedido (ADR 0021, punto 9).
- **`sales` suma lecturas a su interfaz** (por ejemplo, las ventas de un cliente con su estado), sin escrituras nuevas.
- **Claves foráneas compuestas** `(organization_id, …)` hacia `sales`, `orders` y `clients`, con `ON DELETE RESTRICT`, como las de `sale_voids`. Una clave foránea no es una dependencia de código: las tablas de otros módulos se referencian en `schema.ts`, como hace `sales` con `orders`.

### 14. Datos de un cliente

- Los cobros, sus anulaciones y las devoluciones **no guardan texto de la persona**. Llegan al cliente por su `client_id` copiado.
- **Un cliente con cobros no se borra**, se vacía, como con ventas y pedidos (`ON DELETE RESTRICT`).
- **La exportación de un cliente** incluye sus cobros, las anulaciones de sus cobros, sus devoluciones y las anulaciones de sus devoluciones: **los comprobantes, no el saldo**. El estado de cuenta se deriva de ellos, y calcularlo en `scripts/client-data-export.ts`, que es SQL directo sobre `@/shared/db`, sería una segunda implementación de la regla del punto 9 (revisión independiente, R-14). El informe del runbook los cuenta. Cada subfase lo hace con lo que crea.
- Las sesiones de caja y los movimientos manuales no son de ningún cliente.

### 15. Qué crea cada subfase

El orden queda como lo fija D-9 del brief: **la caja va antes que los cobros**, porque un cobro en efectivo la exige. Las tareas de Notion se renombran al aceptarse este ADR.

| Subfase | Qué crea |
|---|---|
| **21.2 — Los medios de pago y la caja** | el módulo `cash`, `payment_methods` con su lista inicial por botón, `cash_sessions`, `cash_session_closings` y `cash_movements`, los tipos `cash_session` de `document_kind` y del `entity_type`, el bloqueo de cobros, la apertura, el cierre con su arqueo imprimible, los aportes y retiros, y `cash` en la lista de módulos de dominio de `eslint.config.mjs` |
| **21.3 — El cobro de una venta** | `receipts` con destino venta, el tipo `receipt`, la regla de imputación entera (punto 9) como función pura, el cobro desde el detalle de la venta, su comprobante imprimible, lo cobrado y lo que falta en el detalle de la venta (lo compone la página), las lecturas nuevas de `sales`, y los cobros en la exportación y en el criterio de borrado de un cliente |
| **21.4 — La seña** | el destino pedido en `receipts`, la función de `orders` que bloquea el pedido para `cash`, la seña retenida y su paso a la venta o a la cuenta, y lo cobrado en el detalle del pedido |
| **21.5 — La anulación y la devolución** | `receipt_voids`, `refunds` y `refund_voids`, los tipos `receipt_void`, `refund` y `refund_void`, sus motivos, la regla que impide dejar devuelto más de lo cobrado, la anulación del efectivo con la sesión cerrada y su explicación en el arqueo, el comprobante imprimible de la devolución, y las tres en la exportación |
| **21.6 — La cuenta corriente** | el destino cuenta en `receipts` (el cobro a cuenta), el estado de cuenta imprimible, la lista de deudores con su medición, y el saldo en la ficha del cliente y en la venta (lo componen las páginas) |

## Alternativas descartadas

- **El cobro con estado, o un «pagado» en la venta**: contradicen el ADR 0016, punto 4, y la venta inmutable del ADR 0021, punto 2.
- **Un solo cobro por comprobante, por el total**: no cubre la seña ni el pago dividido entre medios, dos casos reales del boceto del negocio.
- **Cobros sin tope contra un comprobante**: el exceso sería saldo a favor de un comprobante, cuando el saldo a favor es de la cuenta.
- **Bloquear la venta para serializar**: imposible sin dar `UPDATE` sobre `sales` a `crm_app`, que la regla 10 prohíbe (§Contexto). **Volver a comprobar con el contador tomado**, como en la 20.4, serializa los cobros entre sí pero no con las devoluciones ni con el cierre de caja, que usan otros contadores. El bloqueo por organización los cubre a todos.
- **La seña como comprobante aparte, o movida a la venta al emitirla**: agrega un comprobante y una escritura en la emisión, y `sales` tendría que depender de `cash`.
- **Prohibir anular una venta o cancelar un pedido con cobros vigentes**: obliga a que `cash` abra esas transacciones y a que las pantallas dejen de llamar a `voidSale` y `cancelOrder`. Cambia dos operaciones cerradas y obliga a anular cobros de plata que sí entró.
- **Que la anulación de la venta genere la devolución**: registraría una salida de caja que nadie hizo.
- **Una sola operación para corregir y para devolver**: mezcla un error de carga con una salida real de dinero, y el arqueo no los distingue.
- **Montos negativos**: obligan a cambiar `src/shared/money/` y cada suma, como en el ADR 0021.
- **Varias cajas por organización (efectivo, banco, billetera)**: sin conciliación, la caja de banco sería un saldo que nadie verifica.
- **Una sola moneda por sesión de caja** (revisión independiente, R-1): obliga a abrir una sesión por moneda o a rechazar el efectivo en otra, cuando un negocio puede recibir pesos y dólares en el mismo turno. La caja por moneda cubre los dos casos.
- **Prohibir anular un cobro en efectivo con la sesión cerrada** (lo que decía este ADR antes de la revisión, R-3): dejaba sin corrección posible un cobro mal cargado, porque la devolución solo alcanza lo que está a favor. La venta quedaba cobrada con plata que no entró.
- **No anular devoluciones** (R-7): una devolución mal cargada quedaría para siempre en el arqueo y en la cuenta, contra el ADR 0016, punto 4.
- **Dos módulos, uno para la caja y otro para los cobros** (D-10 del brief, sin alternativa allí; R-13): el cobro en efectivo y su arqueo son una sola regla bajo un solo bloqueo (punto 4). Separarlos obligaría a un módulo a abrir la transacción del otro en cada cobro.
- **Que el agente lea el saldo de un cliente** (D-11 del brief, sin alternativa allí; R-13): nadie lo pidió, es un dato sensible, y el ADR 0016, punto 5, aleja al agente del dinero.
- **La caja con estado y sin sesiones**: el cierre cambiaría una fila que mueve dinero; sin sesiones no hay arqueo.
- **La caja al final y el efectivo cobrado sin sesión**: deja cobros en efectivo que ningún arqueo cuenta.
- **Los medios de pago como enum fijo**: cada medio nuevo sería una migración. **Como fuente de lo que lee el agente**: cambia un contrato que nadie pidió cambiar.
- **La cuenta con su tabla de movimientos y saldo corrido**: duplica lo que dicen las ventas y los cobros, y cada venta tendría que escribirla, con `sales` dependiendo de `cash`.
- **La imputación manual de los cobros a cuenta**: hay que guardar la imputación y protegerla de las anulaciones posteriores. Se puede sumar si el uso lo pide.
- **Un límite de crédito que bloquee**: el ciclo de dependencias del punto 13.
- **Texto libre en el cobro (referencia, observaciones)**: sumaría datos de la persona a tablas de solo inserción fuera del vaciado, el problema de R-2 de la 20.1.

## Consecuencias

**Enmiendas, con fecha y conservando el texto anterior**, al aceptarse:

- **DataModel**, que está por encima de los ADR en la jerarquía de `CLAUDE.md`, con la vigencia de cada parte:
  - **la regla 14**: los cobros y la caja dejan de estar sin modelo desde la 21.2. Los pagos a proveedores siguen sin modelo;
  - **§«Explícitamente fuera de este modelo»**: una nota de diseño con las tablas que vienen, sin tablas. `payments` no va a existir con ese nombre para los cobros, y `cash_accounts` no va a existir: la caja son sesiones;
  - **§`knowledge_entries`**: la lista de medios de pago de `cash` no reemplaza la entrada de texto que lee el agente;
  - **§`document_counters`**: la Fase 21 suma cinco tipos;
  - **§`client_tags`** (l. 181): «“Quiere señar” es una etiqueta, nunca un pago (regla 14)» sigue cierto, pero la regla 14 cambia: la cita pasa a remitir a este ADR, punto 5;
  - **las reglas 8 y 10**, cuando cada tabla exista.
- **Overview**: §Evolución hacia ERP, con fecha. `cash` es el primer módulo que depende de `sales`. Con el código de cada subfase (revisión independiente, R-9):
  - la 21.2 suma la fila de `cash` y lo agrega a la lista de módulos de dominio (l. 42) y a la fila de `audit` («Lo usan…», l. 36);
  - la 21.3 actualiza la fila de `sales` (l. 35);
  - la 21.4 actualiza la de `orders` (l. 34), porque `cash` también depende de él.
- **Notas fechadas, sin cambiar el texto**:
  - **el ADR 0021**, por el punto 9 («Ningún módulo depende de `sales`»: desde la 21.3, `cash` sí) y por la alternativa del cobro antes de entregar, que este ADR resuelve con la seña;
  - **el ADR 0016**, por el punto 1: la cuenta corriente, «sin fase», entra en la Fase 21 por decisión del usuario del 2026-10-13. El punto 5 no cambia: este ADR lo aplica;
  - **el ADR 0019**, por el punto 2: el bloqueo de cobros va antes que el contador, que sigue al final; y por el punto 3: la caja guarda el efectivo por moneda (punto 8);
  - **el ADR 0020**, l. 189-190 («Es la única dependencia hacia `orders`»), que ya había dejado de ser cierta con `sales` y deja de serlo también con `cash`, desde la 21.4.
- **Scope**: la cuenta corriente sale de la lista sin fase (l. 63) y entra en la lista «Entra» (l. 56).
- **Roadmap**: §Fase 21, con las subfases en el orden del punto 15. La cuenta corriente ya salió de «Sin fase todavía» el 2026-10-13. Y §Fase 17 (l. 361), que hizo de los medios de pago estructurados una candidata de la Fase 21: la lista de `cash` existe, y estructurar lo que lee el agente sigue siendo una candidata aparte (punto 10).
- **`docs/decisions/README.md`**: este ADR y su brief.
- **Los comentarios de `src/modules/sales/index.ts` y de `src/modules/sales/service.ts`** (l. 58), «Ningún módulo depende de sales», los corrige la 21.3, con el código.
- **HANDOFF** §3, que dice que la cuenta corriente «no tiene fase», se corrige al cerrar la 21.1.

**Por decisión**:

- **solo inserción (2, 7, 8)**: el test de cobertura de privilegios suma cada tabla nueva, y cada una lleva su guarda de escrituras, como `sale-writes`;
- **serialización (4)**: un test por camino que retenga el bloqueo de cobros desde otra conexión y mida que la escritura lo espera, y el caso de la venta anulada durante un cobro;
- **imputación (9)**: una función pura con tests de propiedades (el saldo es el debe menos el haber; ninguna venta recibe más que su total; el remanente se reparte de la más vieja a la más nueva);
- **cobro y destino (2, 3)**: el `CHECK` del destino, un test de que la copia del cliente es la de su destino, y el rechazo por exceso con lo que falta;
- **seña (5) y cobros de lo anulado o cancelado (6)**: tests de cada estado del pedido y de la cadena de ventas, incluido el pedido entregado con su venta anulada sin reemplazo;
- **anulaciones y devoluciones (7)**: un test del rechazo que impide dejar devuelto más de lo cobrado, y uno de la anulación de un cobro en efectivo con la sesión abierta y con la sesión cerrada;
- **caja (8)**: tests de la cadena de sesiones (dos primeras, dos abiertas y escritura en una cerrada, todas rechazadas por la base), de lo esperado por moneda y de que ninguna salida lo deja negativo;
- **medios de pago (10)**: `read-v1` no cambia, y su test de forma lo fija;
- **numeración (11)**: `document_kind` suma cinco tipos, y `audit_entity_type` los suyos;
- **roles (12)**: el test de que un `viewer` no escribe ni ve contactos, como en `sales`;
- **dependencias (13)**: ni `sales`, ni `orders`, ni `crm` importan `cash`. Hoy no lo vigila ninguna guarda, porque `module-boundary` controla los puntos de entrada y no la dirección. La guarda de dependencias entre módulos sigue como tarea aparte (brief-19.4, R-2), y esta fase **suma una razón** para hacerla (revisión independiente, R-15);
- **datos de un cliente (14)**: el runbook y `scripts/client-data-delete.ts` cuentan lo que crea cada subfase.

**Ningún contrato con el agente cambia**, y el agente no recibe ningún aviso en esta fase.

**Riesgos**:

- **La lectura de la cuenta crece con las ventas del cliente** (punto 9). Es aceptable para un negocio chico; la lista de deudores se mide en la 21.6, y si no alcanza, la decisión vuelve con la medición.

  *Precisado el 2026-10-15 en la 21.6, sin cambiar el texto de arriba* ([brief-21.6](brief-21.6-la-cuenta-corriente.md), D-6 y AC-7, decisión del usuario): la decisión volvió con la medición. Con el volumen esperado la lista cumplía 400 ms; con 5×, no (930 a 1.110 ms). El usuario eligió optimizar las lecturas sin cambiar la regla ni el diseño y aceptar el límite medido: 170 a 200 ms con 1× y 390 a 620 ms con 5×. El límite está en el [Overview](../architecture/Overview.md), con la condición de revisarlo si un negocio se acerca a 20.000 ventas con cliente.
- **Los cobros de una organización se serializan** (punto 4), como la numeración.
- **Un cobro en efectivo cargado en el destino equivocado, con su sesión ya cerrada**: se anula (punto 7), pero el cobro correcto en efectivo entra en la sesión abierta, y el arqueo de esa sesión da una diferencia por ese monto, porque la plata se contó en la sesión anterior. Se corrige con un retiro de la sesión abierta, con su motivo. Es un límite aceptado, y la alternativa (escribir en una sesión cerrada) rompe el punto 8.
- **Sin conciliación**, lo cobrado por transferencia o tarjeta es lo que registró una persona, no lo que acreditó el banco. El comprobante es interno (ADR 0016, punto 6).
- **La Ley 27.743** sigue pendiente para cualquier comprobante entregado a un consumidor final, como en el ADR 0021: se confirma con la 13.5.2-b antes de que un negocio real entregue comprobantes.

## Lo que este ADR no decide

- Los intereses, los vencimientos, los recordatorios de deuda y un límite de crédito que bloquee.
- La imputación manual de un cobro a cuenta.
- Los pagos a proveedores, los gastos y la conciliación bancaria.
- Las columnas exactas de cada tabla, dentro de lo que fija el punto 11 (los briefs de cada subfase).
- Si `lockOrderForSale` se generaliza o se suma una función hermana (brief de la 21.4).
- Los motivos exactos de las listas cerradas de la anulación del cobro, de la anulación de la devolución y de los movimientos manuales (los briefs de la 21.2 y la 21.5).
- Las métricas de cobros y de caja.
