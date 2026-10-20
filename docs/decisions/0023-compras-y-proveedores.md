# 0023 — Compras y proveedores

- Estado: **aceptada** (decisión del usuario del 2026-10-15), con las correcciones de la revisión independiente del 2026-10-15 (R1: 2 bloqueantes, 3 medios y 5 bajos, verificados uno por uno; R-1 se acepta como límite por decisión del usuario, y R-3 cambia D-2 del brief: un proveedor desactivado recibe pagos). Subfase 22.1, [brief-22.1](brief-22.1-adr-de-compras-y-proveedores.md), aprobado por el usuario el 2026-10-15 con las recomendaciones de D-1 a D-15.
- Fecha: 2026-10-15
- Nivel: **diseñado**. No hay código, tablas ni ejecución.
- *Nota del 2026-10-18 por el [ADR 0024](0024-rubros-y-capacidades.md), puntos 6, 8, 10 y 16*, sin cambiar el texto de este ADR: **punto 2**, un técnico tercerizado es un proveedor con la marca `is_technician`, y quien entrega un usado es un cliente, nunca un proveedor; **punto 5**, la recepción de un producto con unidades crea cada unidad con el costo de su línea y **no escribe `product_costs`**; **punto 11**, `service` también depende de `purchasing`, así que la regla «solo `cash` importa `purchasing`» de la guarda cambia con la 29.6; **punto 12**, un `viewer` ve las órdenes de servicio sin el técnico ni su costo, y sigue sin ver nada de compras.
- *Nota del 2026-10-18 por el [ADR 0025](0025-tipo-de-cambio.md), punto 5*: en el punto 8, **la moneda del pago es la aplicada**: el pago a un proveedor puede pagarse en otra moneda que la de la recepción, con la cotización guardada, y el efectivo sale de la sesión en la moneda pagada. En un pago a cuenta, con moneda principal, la aplicada es la principal salvo que haya saldo en la otra. Lo implementa la 29.4.3.
- *Nota del 2026-10-19, al cerrar la 29.4.3* ([brief-29.4.3](brief-29.4.3-devoluciones-y-pagos-en-otra-moneda.md), D-4): en el punto 8, «en un pago a cuenta, la que se elija» vale **sin moneda principal**. Con ella, la moneda aplicada a cuenta es la principal o una en la que se le deba al proveedor, y el servicio rechaza otra. El pago en la otra moneda guarda lo que salió, y su anulación lo copia. La cuenta del proveedor (punto 9) sigue usando lo aplicado, y la ficha, el estado de cuenta y «A pagar» suman un total de referencia en la principal. `purchasing` no depende de `fx`: la regla vive en `cash`.
- *Nota del 2026-10-19, por la 29.5* ([brief-29.5](brief-29.5-las-unidades.md), D-4 y H-6): lo que anunció la nota del ADR 0024 sobre el **punto 5** está implementado: la recepción de un producto por unidad pide un IMEI por unidad, crea cada unidad con el costo de su línea y no escribe `product_costs`; en un producto por cantidad, nada cambia. En el **punto 6**, la anulación da de baja esas unidades, o se rechaza si alguna ya no está disponible.
- *Nota del 2026-10-20, por la 29.6* ([brief-29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md), D-3 y D-7; decisión del usuario U-2): en el **punto 2**, el proveedor suma la marca `is_technician`, que marca un `admin` con la capacidad `repairs`. En el **punto 9**, la cuenta de un técnico suma al debe sus órdenes de servicio reparadas, como recepciones, y el pago a cuenta las cancela con la misma regla. En el **punto 11**, también `service` depende de `purchasing` (el técnico de la orden); `purchasing` no depende de `service`. En el **punto 12**, el estado de cuenta, el resumen y «A pagar» las muestran, solo a un `admin`. El texto no cambia.

## Contexto

El [Roadmap](../planning/Roadmap.md) §Fase 22 pide «proveedores, órdenes de compra y recepción, que suma stock y actualiza el costo». El usuario abrió la Fase 22 el 2026-10-15, con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3), y aprobó el brief con sus recomendaciones: **los pagos a proveedores y la cuenta corriente con ellos entran en la fase**, al final (brief, D-8 y D-9).

Lo que acota la decisión, verificado el 2026-10-15 contra `main` (`6219989`):

- **El ADR 0016**:
  - punto 4: el dinero es `numeric` con moneda; lo que mueve dinero o stock es de solo inserción, y un comprobante emitido se anula con otro; el stock no queda negativo; cada fase agrega su módulo, con sus fronteras, y da `purchasing` como ejemplo;
  - punto 5: **el agente nunca registra un cobro, un pago ni un movimiento de caja**;
  - punto 6: los comprobantes son internos, no fiscales.
- **El [ADR 0019](0019-bases-de-los-comprobantes.md)**:
  - punto 2: la numeración sin huecos por `(organization_id, tipo)`, con el contador al final;
  - punto 3: una moneda por comprobante, la del precio vigente de su primera línea; sin tipos de cambio. «Si el usuario puede elegir la moneda antes de cargar líneas, lo decide la fase que crea el comprobante»;
  - punto 4: el redondeo es por línea, a los decimales de la moneda;
  - **punto 5: el costo es lo que el negocio paga por una unidad, con el IVA incluido, lo recupere o no.**
- **El [ADR 0008](0008-stock-nunca-negativo.md)**: el saldo nunca queda negativo. El [ADR 0020](0020-el-pedido.md), punto 5, suma que un ajuste negativo no baja el saldo por debajo de lo reservado (`below_reserved`).
- **El ADR 0020**: el pedido es un compromiso con estado, con un trigger que fija qué columnas cambian y por qué transiciones (`orders_guard`). Su cabecera se bloquea `FOR UPDATE`.
- **El [ADR 0021](0021-la-venta.md)**: la venta es un comprobante de solo inserción, con pedido o sin él. Se anula entera con otro comprobante, a lo sumo una vez, con un motivo de una lista cerrada, y la anulación de una venta sin pedido repone el stock. Punto 7, precisado el 2026-10-13: un comprobante bloquea los padres que sus `INSERT` tomarían por clave foránea antes del contador.
- **El [ADR 0022](0022-cobros-y-caja.md)**:
  - todo lo que escribe dinero toma primero `pg_advisory_xact_lock(hashtextextended('cash:' || organization_id, 0))` (punto 4);
  - la caja es de efectivo, por sesiones y por moneda; lo esperado lo calcula `cash`, y **ninguna salida deja lo esperado por debajo de cero** (punto 8);
  - **«un gasto no es un movimiento de caja: los pagos son de la Fase 22»** (punto 8);
  - la cuenta corriente de clientes se deriva con una regla pura, de la venta más vieja a la más nueva (punto 9);
  - **el nombre `payments` quedó reservado para los pagos a proveedores** (punto 11).
- **PostgreSQL 18**, [documentación de `SELECT`](https://www.postgresql.org/docs/18/sql-select.html), §Description, citada por el ADR 0022: las cuatro cláusulas de bloqueo exigen el privilegio `UPDATE`. **Una tabla de solo inserción no se puede bloquear desde `crm_app`.**
- **DataModel**:
  - la regla 14: «Compras, proveedores y pagos siguen sin modelo»;
  - §«Explícitamente fuera de este modelo»: `purchases`, `purchase_details`, `suppliers` y `payments`;
  - §`product_costs`: el costo vigente es la última fila; la única escritura es `insertProductCost` de `catalog`, vigilada por `cost-writes`; cada cambio se audita como `cost_change`; **solo lo leen los `admin`** (FR-PROD-21);
  - §`inventory_movements`: las entradas por compras «llegarían como valores nuevos del enum» (subfase 1.2, D-11);
  - §`inventories`: el saldo físico no cambia nunca sin su movimiento, y cada escritura de stock que llega de otro módulo es una función del servicio de `inventory` que recibe la transacción del módulo dueño, con el motivo como función, fijada por `stock-writes`.
- **El código**:
  - no hay módulo de compras ni de proveedores;
  - `setProductCost` de `catalog/service.ts` compara contra el costo que vio el usuario, rechaza con `CONFLICT` si cambió, no escribe si el costo es el mismo y audita `cost_change`;
  - **las reglas de línea compartidas rechazan un producto repetido** (`duplicateLines` de `src/shared/lines/`, regla `duplicate_product`; ADR 0020, punto 3);
  - `imputeAccount` de `cash/imputation.ts` es una función pura que recibe comprobantes al debe (`id`, `number`, `currency`, `total`, `issuedAt`, `voided`), los cobros contra una venta, un pedido o a cuenta, y las devoluciones;
  - **los pedidos ya bloquean `products` en modo compartido** (ADR 0020, punto 6): `crm_app` tiene `UPDATE` en `products`;
  - una anulación se audita con la acción `void` sobre el comprobante que anula (`sale`, `receipt`, `refund`);
  - `formatDocumentNumber` arma el número con un prefijo por tipo, de una o dos letras (`numbering/service.ts`).
- **No hay un negocio real** (13.5.2-b): la forma de comprar se diseña para un comercio chico, sin datos de uno.

## Decisión

### 1. Qué decide este ADR

**Decide**:

- el proveedor;
- la orden de compra y sus estados;
- la recepción, el stock y el costo;
- la anulación de la recepción;
- los pagos a proveedores, su anulación y su efecto en la caja;
- la cuenta corriente con proveedores;
- el IVA de la compra;
- la serialización;
- el número, los nombres y los comprobantes;
- las dependencias, los roles, el agente y los datos personales del proveedor;
- qué crea cada subfase.

**No decide**:

- **los gastos que no son compras de mercadería** (alquiler, servicios, sueldos), que siguen sin fase;
- la devolución de mercadería al proveedor, sus notas de crédito y la devolución de un anticipo por el proveedor;
- el costo promedio, la valuación del inventario y los reportes de rentabilidad;
- la sugerencia de compra por stock mínimo;
- las listas de precios de proveedores;
- los tipos de cambio, la factura de ARCA, las percepciones, las retenciones y el crédito fiscal;
- los vencimientos y los recordatorios de deuda con proveedores;
- la conciliación bancaria y cualquier integración externa;
- las métricas de compras.

### 2. El proveedor

- **Una ficha por organización, separada de `clients`**, editable y con borrado lógico (regla 8 de DataModel): `crm_app` con `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`.
- **Guarda lo mínimo** (punto 14):
  - el nombre, obligatorio, **único por organización sin distinguir mayúsculas**, como `payment_methods`;
  - el teléfono, el email y el CUIT, opcionales.

  Sin notas ni texto libre.
- **El CUIT** se valida por su forma: once dígitos con el dígito verificador. **No se usa en ningún cálculo** (punto 7).
- **Un proveedor no es un cliente**, aunque comparta el teléfono. No aparece en la lista de clientes, en las conversaciones ni en nada que lea el agente.
- **Un proveedor desactivado** no recibe órdenes ni recepciones nuevas, y sus comprobantes siguen a la vista. **Sí recibe pagos**, contra sus recepciones y a cuenta: lo que se le debe no se cancela al desactivarlo, como un cliente desactivado se sigue cobrando (brief-21.6, D-3; revisión independiente, R-3).
- Se audita con un `entity_type` nuevo, `supplier`.

### 3. La orden de compra

- **Es un compromiso con estado, como el pedido**, no un comprobante emitido (ADR 0020, punto 3). **Es opcional**: una recepción puede ir sin orden (punto 4).
- **Se crea con un proveedor activo y sus líneas**: el producto, la cantidad y el costo unitario esperado, con el IVA incluido. Las líneas siguen las reglas compartidas que aplican: un producto va en una sola línea, y la cantidad es positiva y cabe en `numeric(14, 3)`.
- **La moneda la elige la persona al crearla**, de la lista de monedas del sistema, y todas las líneas van en ella. Es una precisión del ADR 0019, punto 3: el monto de una compra no sale del precio de venta, así que la moneda tampoco (H-8 del brief). El total es la suma de las líneas, redondeadas una por una (ADR 0019, punto 4).
- **Estados**:
  - `open` → `closed`: sola, cuando una recepción completa todas las líneas; o a mano, «cerrada con faltante», solo si tiene alguna recepción vigente;
  - `open` → `cancelled`: solo si no tiene recepciones vigentes.

  Los dos estados finales no cambian. Un trigger fija las columnas que cambian (el estado, sus fechas y `updated_at`) y las transiciones, como `orders_guard`.
- **Lo recibido de cada línea se deriva** de las recepciones vigentes y no se guarda.
- **Las líneas son de solo inserción y la orden no se edita.** Si cambia lo pedido, se cancela y se hace otra.
- **Los privilegios de `crm_app`**: sobre `purchase_orders`, `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`, como `orders`; sobre `purchase_order_lines`, `SELECT` e `INSERT`, con el trigger de solo inserción (revisión independiente, R-9).
- **No reserva ni toca el stock.** El stock entra con la recepción.
- **No tiene pagos**: se paga una recepción o a cuenta (punto 8). Un pago anticipado al proveedor es un pago a cuenta.
- Se audita con un `entity_type` nuevo, `purchase_order`: `create` al crearla y `status_change` al cerrarla o cancelarla.

### 4. La recepción

- **Es un comprobante emitido, de solo inserción**, sin estados (ADR 0019, punto 2): `crm_app` con `SELECT` e `INSERT`, y un trigger que rechaza `UPDATE` y `DELETE` para cualquier rol (ADR 0013).
- **Registra qué entró, de qué proveedor y a qué costo**: líneas con el producto, la cantidad y el costo unitario **con el IVA incluido** (ADR 0019, punto 5), y el total por línea redondeado a los decimales de la moneda. El total de la recepción es la suma de las líneas.
- **Va contra una orden `open` de ese mismo proveedor, o sin orden.**
  - **Con orden**: cada línea es de una línea de la orden. **Nunca se recibe más de lo que falta recibir** de esa línea; lo que llegue de más va en una recepción sin orden. El costo unitario se carga en la recepción: empieza en el esperado de la orden y la persona lo corrige si el proveedor cobró otro. La moneda es la de la orden. Si con esta recepción la orden queda completa, pasa a `closed` en la misma transacción.
  - **Sin orden**: la persona elige el proveedor y la moneda al empezar.
- **Las reglas de línea**: un producto va en una sola línea; el producto existe y está activo; la cantidad es positiva y cabe en `numeric(14, 3)`; el costo unitario es positivo; **el total de la línea, redondeado, no es cero ni desborda `numeric(14, 2)`** (`zero_total` y `amount_too_large` de `src/shared/lines/`: con un costo de 0,01 y una cantidad de 0,001 el total redondea a cero; revisión independiente, R-10). Las mismas reglas valen para las líneas de la orden de compra.
- **Suma stock**: un movimiento por línea de un tipo nuevo de `inventory`, `goods_receipt`, con el motivo «Recepción RC-000123». **El motivo no nombra al proveedor**: un movimiento es de solo inserción y no se vacía (punto 14).
  - Lo escribe **una función nueva del servicio de `inventory`** que recibe la transacción de `purchasing`, bloquea los saldos ordenados por producto (creando la fila en 0 si falta) y suma la cantidad, sin tocar lo reservado.
  - Si un saldo nuevo no cabe en `numeric(14, 3)`, no escribe y devuelve los productos (`stock_limit`), como la reposición de la 20.4.
  - Recibe el motivo como una función, para que el contador quede último, como `sellStock` y `restoreSaleStock`.
  - `stock-writes` la autoriza y fija que, fuera de `inventory`, la llama solo `purchasing`.
  - El ajuste manual no acepta el tipo `goods_receipt`.
- **Actualiza el costo** (punto 5).
- **El número del documento del proveedor** (su remito o su factura) es una referencia opcional, de hasta 40 caracteres entre letras, dígitos, espacios, guiones y barras. No es texto libre: es lo que el negocio usa para cotejar con el proveedor.
- Se audita con un `entity_type` nuevo, `goods_receipt`, y la acción `create`.

### 5. El costo al recibir

- **La recepción fija como costo vigente el último costo recibido, en la moneda de la recepción.** Por cada línea:
  - si el costo unitario o la moneda difieren del costo vigente del producto, **inserta una fila en `product_costs`** y la audita como `cost_change` sobre el producto, con el origen en claves planas (`source: "goods_receipt"` y el número de la recepción);
  - si son iguales, no escribe, como `setProductCost`.

  Un producto va en una sola línea (punto 4), así que una recepción fija a lo sumo un costo por producto.
- **Lo escribe una función nueva del servicio de `catalog`** que recibe la transacción de `purchasing`, **sin la comparación optimista de la ficha**: la recepción no fija el costo que vio alguien, sino el que se pagó. `setProductCost` sigue igual para la ficha.
- **`cost-writes` pasa a fijar quién llama cada escritura**, como `stock-writes`: `insertProductCost` la llaman solo `setProductCost` y la función nueva, y a la función nueva, fuera de `catalog`, solo `purchasing`.
- **Si la moneda de la recepción no es la del precio de venta**, el producto queda sin margen (ADR 0019, punto 5). La pantalla de la recepción lo advierte, por línea, antes de emitir.
- **Por qué el último costo y no un promedio** (H-4 del brief): el promedio ponderado necesita el valor del stock existente, y parte del stock entró por ajustes manuales, sin costo; y el costo vigente puede estar en otra moneda que la compra, sin tipos de cambio para convertirla.
- **Anular la recepción no restaura el costo** (punto 6).

### 6. La anulación de la recepción

- **Se anula entera con otro comprobante**, de solo inserción, a lo sumo una vez por recepción (`UNIQUE`), con un motivo de una lista cerrada y sin texto libre, como `sale_voids`. Las cantidades y los montos se copian de la recepción y son positivos: el efecto lo da el tipo.
- **Saca del stock lo que la recepción sumó**: un movimiento por línea de otro tipo nuevo, `goods_receipt_void`, con el motivo «Anulación ARC-000045 de la recepción RC-000123». Lo escribe otra función nueva de `inventory`, con la transacción de `purchasing` y el motivo como función, y `stock-writes` la fija a ella y a su llamador.
- **Comprueba lo disponible, no el saldo**: si sacar la cantidad de una línea dejaría el saldo por debajo de lo reservado, o negativo, **no escribe y devuelve los productos que no alcanzan**, con lo disponible y lo que hay que sacar (ADR 0008; ADR 0020, punto 5). No hay anulación parcial: si la mercadería ya se vendió, se corrige con un ajuste o no se anula.
- **No mira si el producto está activo**, como la reposición de la 20.4.
- **No restaura el costo.** El historial de costos es de solo inserción, y el costo anterior puede no ser el correcto: el `admin` lo corrige en la ficha si hace falta. La pantalla de la anulación lo dice.
- **Con orden**: lo recibido de la orden deja de contarla. **Una orden `closed` no se reabre**: el `admin` hace otra.
- **La deuda con el proveedor**: la recepción anulada deja de estar al debe, y lo pagado contra ella pasa a la cuenta del proveedor (punto 9), como lo cobrado de una venta anulada (ADR 0022, punto 6). **La anulación no mira los pagos**: `purchasing` no depende de `cash` (punto 11).
- Se audita con la acción `void` sobre la recepción.

### 7. El IVA de la compra

- **La compra no discrimina el IVA.** El costo unitario se carga con el IVA incluido para cualquier condición del negocio (ADR 0019, punto 5), como la venta no lo discrimina (ADR 0021, punto 11).
- La condición del negocio frente al IVA, el crédito fiscal y el margen en montos netos siguen esperando a la 13.5.2-b.
- El CUIT del proveedor es un dato de la ficha (punto 2) y no entra en ningún cálculo ni en ningún comprobante fiscal.

### 8. Los pagos a proveedores

- **Entran en la fase, al final (22.6), y viven en `cash`.** Si vivieran en `purchasing`, `cash` tendría que leerlos para calcular lo esperado de la caja, y `purchasing` tendría que escribir en la sesión y tomar el bloqueo `cash:`: un ciclo (H-6 del brief).
- **El pago es un comprobante emitido, de solo inserción**, con la forma del cobro (ADR 0022, punto 2):
  - un monto positivo, en un medio de pago activo de `payment_methods`;
  - **contra un solo destino**: una recepción, o la cuenta de un proveedor (el pago a cuenta). Una columna discriminadora y un `CHECK` exigen la clave de su destino y ninguna otra;
  - **copia el proveedor de su destino**, para leer la cuenta sin cruzar módulos. Que la copia sea la del destino lo asegura el servicio, como en el cobro;
  - **la moneda es la de la recepción**; en un pago a cuenta, la que se elija;
  - sin texto libre.
- **Cuánto**: un pago contra una recepción **nunca supera lo que le falta pagar**, derivado con la regla del punto 9, y se rechaza con `BUSINESS_RULE_VIOLATION` e informa lo que falta. No se paga una recepción anulada. **Un pago a cuenta no tiene tope**: lo que exceda es un saldo a favor del negocio (un anticipo).
- **El pago en efectivo sale de la sesión abierta de su moneda**, y sin una se rechaza. **No deja lo esperado por debajo de cero.** Lo esperado de la sesión suma dos términos, y queda así:

  > **esperado** = inicial + cobros en efectivo − cobros anulados en la sesión − devoluciones en efectivo + devoluciones anuladas en la sesión + aportes − retiros **− pagos a proveedores en efectivo + pagos a proveedores anulados en la sesión**

  Es una enmienda del ADR 0022, punto 8, con una nota fechada.
- **La anulación del pago** es otro comprobante de solo inserción, a lo sumo una vez por pago, con los montos copiados y un motivo de una lista cerrada. **Su sesión** es la del pago si sigue abierta, y ninguna si cerró, como la anulación del cobro (ADR 0022, punto 7). Una sesión cerrada no cambia.
- **El nombre**: `supplier_payments` y `supplier_payment_voids`. El ADR 0022 reservó `payments` para estos pagos; se usa el nombre calificado para que no se confunda con «medios de pago» (`payment_methods`). Ninguna tabla se llama `payments`.
- Se audita con un `entity_type` nuevo, `supplier_payment`: `create` al emitirlo y `void` al anularlo.

### 9. La cuenta corriente con proveedores

- **Se deriva, sin tabla de saldos**, como la de clientes (ADR 0022, punto 9). Por proveedor y por moneda:
  - **al debe**: sus recepciones vigentes;
  - **al haber**: sus pagos vigentes, contra recepciones y a cuenta.
- **La imputación es la misma regla**: el pago contra una recepción va a ella, hasta su total; el remanente (los pagos a cuenta, lo pagado de más contra una recepción y lo pagado contra una recepción anulada) se reparte de la recepción más vieja a la más nueva, por fecha de emisión y número; lo que sobra es el saldo a favor.
- **Se usa `imputeAccount` sin cambiar la regla**: una recepción tiene los campos de una venta en la cuenta (`id`, `number`, `currency`, `total`, `issuedAt`, `voided`), y un pago, los de un cobro contra una venta o a cuenta. No hay señas ni devoluciones de proveedores, así que esos términos llegan vacíos. Una regla, no dos. Si la 22.6 quiere nombres neutros en los tipos, el cambio es de nombres y conserva las propiedades probadas.
- **Pantallas**: el estado de cuenta del proveedor, imprimible, y la lista de proveedores a los que se les debe. Sin vencimientos ni intereses.
- **El saldo a favor del negocio** se imputa a las recepciones que vengan. Que el proveedor lo devuelva queda fuera (punto 1).

### 10. La serialización

- **Una recepción y su anulación no se pueden bloquear** (§Contexto, PostgreSQL): son de solo inserción. La orden de compra y el proveedor sí, porque `crm_app` tiene `UPDATE` en ellos.
- **La regla** (ADR 0021, punto 7, con su precisión del 2026-10-13): ningún camino bloquea un contador y después otra fila, ni saldos antes que productos, y los padres que un `INSERT` toma por clave foránea se bloquean antes del contador.
- **El orden de bloqueo de una recepción**:
  1. si hay orden, su cabecera `FOR UPDATE`. Serializa dos recepciones de la misma orden, que no pueden pasar entre las dos lo que falta recibir, y la recepción frente a la cancelación, el cierre o la anulación de otra recepción de la orden;
  2. el proveedor en modo compartido, porque el `INSERT` lo toma por su clave foránea;
  3. los productos en modo compartido, ordenados por id, como el pedido;
  4. la comprobación: el proveedor activo, la orden abierta, lo que falta recibir y los productos activos;
  5. los saldos, ordenados por producto, dentro de `inventory`. **El contador se toma ahí**, al armar el motivo, después de comprobar los saldos y antes de escribir los movimientos, como en `sellStock`;
  6. después del contador solo se escriben filas cuyos padres ya están tomados: los movimientos, la recepción y sus líneas, el costo (dentro de `catalog`, sobre productos ya bloqueados), el cierre automático de la orden y la auditoría (revisión independiente, R-6).
- **La anulación de una recepción**, con el mismo molde que la anulación de una venta sin pedido (revisión independiente, R-2 y R-7):
  1. si la recepción tiene orden, su cabecera `FOR UPDATE`, para que la anulación no se cruce con el cierre de la orden ni con una recepción de ella;
  2. los productos en modo compartido, ordenados por id, **sin mirar si están activos**;
  3. la comprobación;
  4. los saldos, ordenados por producto, dentro de `inventory`, con **una segunda comprobación con los saldos tomados** (que no esté anulada y lo disponible) y el contador al armar el motivo.

  La anulación no copia al proveedor: apunta solo a la recepción. Una carrera entre dos anulaciones de la misma recepción la cierra el `UNIQUE`, que se rescata como «ya anulada», como la 20.4.
- **La orden de compra**: el alta bloquea el proveedor y los productos en modo compartido, comprueba y toma el contador al final; la cancelación y el cierre a mano bloquean la cabecera `FOR UPDATE` y comprueban las recepciones vigentes después. **La edición del proveedor** lo bloquea `FOR UPDATE`, como la del cliente (revisión independiente, R-8).
- **Los pagos** siguen el orden del ADR 0022, punto 4: el bloqueo `cash:` primero, el proveedor en modo compartido, la comprobación y el contador al final.
- **Por qué no hay ciclos**: todos los caminos que toman productos y saldos los toman en ese orden, productos primero y saldos después, como el pedido y la venta. `purchasing` nunca toma el bloqueo `cash:`. Las ediciones del proveedor y del producto los toman `FOR UPDATE` y esperan, o hacen esperar, sin ciclo.
- **Lo que no se serializa**: una recepción que se anula mientras se registra un pago contra ella. El pago queda contra una recepción anulada, y su monto pasa a la cuenta del proveedor (punto 9). **No se pierde ni se cuenta dos veces.** El brief de la 22.6 prueba el caso.
- El aislamiento sigue siendo `READ COMMITTED`, y toda lectura que decide va después de los bloqueos (ADR 0022, punto 4).

### 11. El módulo y las dependencias

- **Un módulo nuevo, `purchasing`**, dueño de los proveedores, las órdenes de compra, las recepciones y sus anulaciones.
- **`purchasing` depende de**:
  - `catalog`, para leer y bloquear los productos y escribir el costo (punto 5);
  - `inventory`, para la entrada y la salida del stock (puntos 4 y 6);
  - `numbering`, `organizations` y `audit`;
  - `auth`, solo en `schema.ts`, para el autor.
- **`cash` depende de `purchasing`** desde la 22.6, para leer y bloquear al proveedor y leer las recepciones y si están anuladas. **`purchasing` no depende de `cash`.** Lo pagado en el detalle de una recepción lo compone la página, como lo cobrado en el detalle de la venta.
- **Ni `catalog`, ni `inventory`, ni `sales`, ni `orders`, ni `crm` dependen de `purchasing`.** Las recepciones de un producto en su ficha las compone la página.
- `purchasing` entra en la lista de módulos de dominio de `eslint.config.mjs` y del Overview. La guarda de dependencias entre módulos sigue siendo una tarea aparte (`3f7702be6f4e81119e1ccf0577cb750e`), y esta fase la hace más necesaria.

### 12. Roles y agente

- **Solo un `admin` ve y opera las compras**: los proveedores, las órdenes, las recepciones, sus anulaciones, los pagos, sus anulaciones y la cuenta del proveedor. **Los montos de una compra muestran el costo**, que es solo de `admin` (FR-PROD-21; H-2 del brief).
- **Un `viewer` no ve nada de compras.** Ve el stock que suman y sacan, y en el historial del producto el movimiento con su motivo («Recepción RC-000123»), que no lleva costo ni proveedor. **En la caja**, el `viewer` ve el arqueo con el total de los pagos en efectivo de la sesión, sin el detalle de cada pago.
- **El límite aceptado** (revisión independiente, R-1; decisión del usuario del 2026-10-15): el arqueo deja derivar lo que se pagó en efectivo en la sesión, también despejándolo de lo esperado, y el historial del producto muestra la cantidad de cada recepción. Con una recepción de un solo producto pagada en efectivo en esa sesión, **un `viewer` puede inferir su costo**. Se acepta: quien cuenta la caja ya ve salir esa plata. La regla queda así: **ninguna pantalla de compras ni la ficha del producto le muestran el costo a un `viewer`**, y la caja puede dejarlo inferir. Ocultar lo esperado o el arqueo entero al `viewer` se descartó (§Alternativas descartadas).
- **El agente no lee ni registra compras, proveedores, costos ni pagos** (ADR 0016, punto 5). Lee el stock que las recepciones suman, por `read-v1` y `read-v2`, **sin cambio de contrato**. Ningún aviso al agente.

### 13. El número, los nombres y los comprobantes

- **Los tipos nuevos de `document_kind` y sus prefijos**:

  | Tipo | Prefijo | Qué es |
  |---|---|---|
  | `purchase_order` | `OC` | la orden de compra |
  | `goods_receipt` | `RC` | la recepción |
  | `goods_receipt_void` | `ARC` | la anulación de la recepción |
  | `supplier_payment` | `PP` | el pago a un proveedor |
  | `supplier_payment_void` | `APP` | la anulación del pago |

  **La recepción nunca usa `R`**, que es del cobro. Los prefijos de tres letras son los primeros: `formatDocumentNumber` toma el prefijo de una tabla, y su largo no cambia la regla.
- **Las tablas**: `suppliers`; `purchase_orders` y `purchase_order_lines`; `goods_receipts` y `goods_receipt_lines`; `goods_receipt_voids`; `supplier_payments` y `supplier_payment_voids`. **Ninguna usa `receipt` sin calificar**, y `purchases`, `purchase_details` y `payments` no van a existir con esos nombres. Cada subfase puede precisar columnas, no cambiar lo que guarda cada tabla.
- **Los tipos nuevos de `inventory_movement_type`**: `goods_receipt` y `goods_receipt_void`.
- **Los motivos** de la anulación de la recepción y de la anulación del pago son listas cerradas, que fijan los briefs de la 22.5 y la 22.6.
- **Páginas imprimibles**, con la leyenda «Documento no válido como factura» (ADR 0019, punto 6):
  - la orden de compra, que se le manda al proveedor;
  - la recepción y su anulación;
  - el pago y su anulación;
  - el estado de cuenta del proveedor.

### 14. Los datos personales del proveedor

- **Un proveedor puede ser una persona física** (un monotributista). La ficha guarda lo mínimo del punto 2.
- **Las órdenes, las recepciones y los pagos no copian datos del proveedor**: lo nombran por su clave. Los movimientos de stock tampoco lo nombran (punto 4).
- **Un proveedor con compras o pagos no se borra: se desactiva.**
- **Si una persona pide sus datos**, la respuesta es **vaciar la ficha**: el nombre pasa a un marcador, y el teléfono, el email y el CUIT a nulo, con el criterio de una sola dirección del [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md). Incluye las entradas de auditoría del proveedor, que hoy el trigger de `audit_logs` no deja vaciar: **extender esa excepción a `supplier` necesita su propia decisión**, como la necesitó la del cliente. **El vaciado queda diseñado acá y se construye cuando un caso lo pida.** El runbook de datos de un cliente dice que no cubre a los proveedores.

### 15. Qué crea cada subfase

| Subfase | Crea |
|---|---|
| **22.2 — Los proveedores** | el módulo `purchasing`, `suppliers`, el `entity_type` `supplier`, la lista, el alta, la edición y la desactivación, y `purchasing` en `eslint.config.mjs` y en el Overview |
| **22.3 — La orden de compra** | `purchase_orders` y `purchase_order_lines`, el tipo `purchase_order` de `document_kind` y del `entity_type`, el trigger de estados, la creación, la cancelación, el cierre a mano y la página imprimible |
| **22.4 — La recepción** | `goods_receipts` y `goods_receipt_lines`, el tipo `goods_receipt` de `document_kind`, del `entity_type` y de `inventory_movement_type`, la entrada de stock en `inventory`, la escritura del costo en `catalog`, `stock-writes` y `cost-writes` extendidas, el cierre automático de la orden y la página imprimible |
| **22.5 — La anulación de la recepción** | `goods_receipt_voids`, el tipo `goods_receipt_void` de `document_kind` y de `inventory_movement_type`, su motivo, la salida de stock en `inventory` con la comprobación de lo disponible y la página imprimible |
| **22.6 — Los pagos y la cuenta del proveedor** | `supplier_payments` y `supplier_payment_voids` en `cash`, sus tipos de `document_kind` y el `entity_type`, sus motivos, los términos nuevos de lo esperado en la caja, la cuenta del proveedor con `imputeAccount`, su estado de cuenta, la lista de proveedores a los que se les debe y las páginas imprimibles |

**El orden no cambia** respecto del que aprobó el usuario el 2026-10-15.

*Precisado el 2026-10-15 por decisión del usuario, en la 22.3, sin cambiar la tabla de arriba* ([brief-22.3](brief-22.3-la-orden-de-compra.md), H-2 y D-3): **el cierre a mano pasa de la 22.3 a la 22.4**. El punto 3 solo lo admite con alguna recepción vigente, y la recepción recién existe en la 22.4: construido en la 22.3, habría rechazado siempre. Por lo mismo, **la cancelación de la 22.3 no comprueba recepciones**, porque no puede haber; la 22.4 suma esa comprobación, con la cabecera tomada `FOR UPDATE` (punto 10). El trigger de estados de la 22.3 ya admite `open → closed`, así que la 22.4 no lo cambia.

*Precisado el 2026-10-16 por decisión del usuario, en la 22.6, sin cambiar la tabla de arriba* ([brief-22.6](brief-22.6-los-pagos-a-proveedores.md), H-1 y D-1): **la fila «22.6» se divide en dos subfases**. La **22.6 — Los pagos a proveedores** crea todo lo que escribe plata: `supplier_payments` y `supplier_payment_voids`, sus tipos de `document_kind` y el `entity_type`, sus motivos, los términos nuevos de lo esperado en la caja, la cuenta del proveedor con `imputeAccount` (la necesita el tope del pago) y las páginas imprimibles del pago y de su anulación. La **22.7 — La cuenta del proveedor**, solo lecturas y sin migración, crea el estado de cuenta imprimible, el resumen en la ficha del proveedor y la lista de proveedores a los que se les debe. Lo que se crea y el diseño no cambian.

## Alternativas descartadas

- **El proveedor como un cliente con una marca** (punto 2): mezcla dos listas con reglas distintas (el teléfono identifica al cliente, ADR 0007) y le mostraría los proveedores al agente.
- **El nombre del proveedor como texto en cada compra** (punto 2): no hay lista, ni cuenta, ni forma de buscar sus compras.
- **Sin orden de compra, solo la recepción** (punto 3): es lo más simple, pero el Roadmap la nombra y el usuario la aprobó como subfase. Que sea opcional deja el camino simple abierto.
- **La orden de compra con líneas editables** (punto 3): suma una auditoría por línea y un estado intermedio para algo que se resuelve cancelando y rehaciendo.
- **La recepción como un estado de la orden** (punto 4): no admite la recepción parcial ni sin orden, y el stock entraría por un `UPDATE`.
- **La recepción como un ajuste positivo** (punto 4): no guarda el proveedor ni el costo.
- **El costo promedio ponderado** (punto 5): no se puede calcular con los datos que hay.
- **La recepción no toca el costo** (punto 5): contradice el Roadmap.
- **Preguntar en cada línea si se actualiza el costo** (punto 5): una decisión por línea que casi siempre se responde igual. Se puede sumar si el uso lo pide.
- **Restaurar el costo anterior al anular** (punto 6): escribiría un costo que puede no ser el vigente que el negocio quiere, y ocultaría un cambio de precio del proveedor que sí ocurrió.
- **La anulación parcial, por línea** (punto 6): suma un comprobante por línea y una regla para la orden.
- **Permitir el saldo negativo al anular una recepción** (punto 6): contradice el ADR 0008, que no admite excepciones (revisión independiente, R-10).
- **Discriminar el IVA desde ahora** (punto 7): exige la condición del negocio, que no se conoce.
- **Los pagos en `purchasing`, sin tocar la caja** (punto 8): un pago en efectivo no saldría del arqueo, y la caja daría una diferencia por cada uno.
- **Los pagos sin fase** (punto 8): el pago en efectivo quedaría como un retiro con el motivo `other`, sin proveedor, y lo que se le debe a cada proveedor no se vería.
- **Solo pagos contra una recepción, sin cuenta** (punto 9): no cubre el anticipo ni el pago de varias recepciones juntas.
- **Una tabla de movimientos de la cuenta** (punto 9): duplica lo que dicen las recepciones y los pagos, como en el ADR 0022, punto 9.
- **Una regla de imputación propia para proveedores** (punto 9): dos reglas para la misma cuenta pueden contradecirse.
- **Que un `viewer` vea las compras sin montos** (punto 12): una lista de compras sin montos no le sirve, y la cantidad recibida ya la ve en el stock.
- **Ocultarle al `viewer` lo esperado y la diferencia en las monedas con pagos a proveedores, o el arqueo entero de esa sesión** (punto 12, R-1): le saca la caja a quien la cuenta, para proteger un dato que la plata en la mano ya muestra. El usuario eligió aceptar el límite el 2026-10-15.

## Consecuencias

- **Enmiendas, con fecha y conservando el texto anterior**, al aceptarse:
  - **DataModel**:
    - la regla 14: compras, proveedores y pagos a proveedores dejan de estar sin modelo desde la 22.2;
    - §«Explícitamente fuera de este modelo»: una nota de diseño con las tablas que vienen, sin tablas; `purchases`, `purchase_details` y `payments` no van a existir con esos nombres;
    - §`product_costs`: la recepción también escribe el costo, desde la 22.4;
    - §`inventories`: la lista de quién cambia `quantity_on_hand` suma las dos funciones nuevas, con la transacción de `purchasing`;
    - §`inventory_movements`: los tipos `goods_receipt` (22.4) y `goods_receipt_void` (22.5);
    - §`document_counters`: los cinco tipos nuevos;
    - §`audit_logs`: los cuatro `entity_type` nuevos;
    - las reglas 8 y 10, cuando exista cada tabla, en la subfase que la crea;
  - **FunctionalRequirements**: FR-PROD-19 (el costo también lo fija la recepción, sin `CONFLICT`), FR-PROD-21 (el límite de la caja del punto 12) y FR-CAJ-04 a FR-CAJ-06 (lo esperado y el arqueo con los pagos a proveedores), con fecha;
  - **Overview** §Evolución hacia ERP: el módulo `purchasing` y la dependencia de `cash` hacia él;
  - **el ADR 0016**: una nota fechada por el punto 1, que deja «la cuenta corriente» sin fase: la de clientes entró en la Fase 21 y la de proveedores entra en esta;
  - **el ADR 0019**: una nota fechada por el punto 3 (la moneda de una compra la elige la persona);
  - **el ADR 0022**: una nota fechada por el punto 4 (escriben dinero también el pago a un proveedor y su anulación, con el proveedor en el lugar del cliente), el punto 8 (lo esperado suma los pagos a proveedores), el punto 11 (el nombre `supplier_payments`), el punto 12 (la cuenta de un proveedor es solo de `admin`) y el punto 13 (`cash` depende de `purchasing`);
  - **Scope**: los gastos que no son compras, la devolución de mercadería al proveedor y la valuación del inventario siguen fuera;
  - **Roadmap** §Fase 22 y «Sin fase todavía»;
  - **el runbook de datos de un cliente**: una nota que dice que no cubre a los proveedores (punto 14);
  - **`docs/decisions/README.md`**: este ADR y el brief;
  - **HANDOFF**: la frase «nadie depende de él» (H-7 del brief) y el estado de la fase.
- **Las que dependen del código** las hace la subfase que lo escribe: las filas del Overview, `eslint.config.mjs`, los comentarios de los `index.ts` y las guardas.
- **El agente no cambia**: ningún contrato cambia de forma, y no recibe ningún aviso.

## Riesgos

- **El último costo sigue al último precio del proveedor**: una compra chica a un precio alto mueve el costo de todo el stock. Es lo que el negocio ve en la ficha, y el `admin` lo corrige a mano. Un costo promedio necesita la valuación, que está fuera.
- **Una recepción en otra moneda deja el producto sin margen** (punto 5). La pantalla lo advierte antes de emitir.
- **Anular una recepción deja el costo que fijó.** La pantalla lo dice, y el `admin` lo corrige en la ficha.
- **Un pago en efectivo anulado con su sesión ya cerrada** no toca ninguna sesión (punto 8). Hay dos casos (revisión independiente, R-4):
  - **el pago no se hizo**: la plata nunca salió, el cierre de esa sesión ya mostró el sobrante, y la apertura siguiente lo trae en lo contado. **No se corrige nada**: un aporte la contaría dos veces;
  - **el pago se cargó contra el destino equivocado** y se vuelve a registrar en la sesión abierta: esa sesión da un faltante por el monto, porque la plata salió en la anterior. Se corrige con un aporte con su motivo. Es el mismo límite aceptado del ADR 0022 (§Riesgos) para un cobro.
- **Un `viewer` puede inferir un costo desde el arqueo** (punto 12): es un límite aceptado por el usuario el 2026-10-15.
- **Los datos personales de un proveedor quedan en la auditoría** hasta que se construya su vaciado (punto 14).

## Lo que este ADR no decide

- Las columnas exactas de cada tabla, que precisa el brief de cada subfase sin cambiar lo que guarda.
- Los motivos exactos de las listas cerradas de la anulación de la recepción y del pago (los briefs de la 22.5 y la 22.6).
- El vaciado de un proveedor y la extensión del trigger de `audit_logs`, que se construyen cuando un caso lo pida (punto 14).
- Los gastos, la devolución de mercadería al proveedor, la valuación del inventario y el costo promedio.
