# 0024 — Rubros y capacidades

- Estado: **aceptada** (decisión del usuario del 2026-10-18), con las correcciones de la revisión independiente del 2026-10-18 (R1: 7 bloqueantes, 10 medios y 7 bajos, verificados uno por uno contra el código; §Revisión). El usuario decidió R-6 (el DNI) y R-8 (la permuta que ve un `viewer`) con la recomendación de cada uno (U-5 y U-6). Las correcciones no tuvieron una segunda revisión independiente: su verificación es autoevaluación. Subfase 29.1, [brief-29.1](brief-29.1-adr-de-rubros-y-capacidades.md), aprobado por el usuario el 2026-10-18 con las recomendaciones de D-1 a D-17.
- Fecha: 2026-10-18
- *Nota del 2026-10-18 por el [ADR 0025](0025-tipo-de-cambio.md)*, sin cambiar el texto: en el **punto 8**, un cobro con «Permuta» solo se acepta contra una venta en la moneda del valor reconocido; en el **punto 15**, el agente da el precio también en pesos, con la cotización vigente, desde el contrato de la 29.8; en el **punto 17**, la 29.4 se divide en tres: 29.4 el tipo de cambio, 29.4.2 la lectura de la cotización y 29.4.3 devoluciones y pagos en otra moneda. La cotización sale de DolarAPI más un ajuste de la organización, no de infodolar.
- *Nota del 2026-10-19, por la 29.5* ([brief-29.5](brief-29.5-las-unidades.md), aprobado por el usuario con la división de D-1), sin cambiar el texto:
  - **punto 17**, la fila 29.5 se divide en dos: **29.5**, las unidades con sus entradas y salidas fuera de pedidos y ventas (la recepción, su anulación, el alta y la baja manual), el invariante y la exclusión de `used` para el agente; y **29.5.2**, las unidades en pedidos y ventas (`order_line_units`, `sale_line_units`, el precio propio, los estados `reserved` y `sold`). Hasta la 29.5.2, un producto `unit` no entra en un pedido ni en una venta;
  - **punto 6, las líneas**: el pedido fija el precio de cada línea al crearse pendiente, y `order_lines` es de solo inserción (brief-29.5, H-4). Que la línea valga la suma de los precios de sus unidades exige que **el pedido elija sus unidades al crearse**, y el pendiente del agente no puede elegirlas. Es una contradicción de este punto con el código, que resuelve el brief de la 29.5.2;
  - **punto 6, el IMEI**: es único por organización **entre las unidades que no están dadas de baja** (índice único parcial). Así una recepción anulada se vuelve a recibir y un IMEI mal cargado se corrige con la baja y un alta nueva, como dice este mismo punto; único entre todas, ninguna de las dos cosas sería posible. La vuelta de una unidad vendida como usado la decide el brief de la 29.7;
  - **punto 6, los estados**: el enum nace con `available` y `written_off`, y cada estado entra con la subfase que lo usa (R-19);
  - **punto 6, la condición**: la de un producto `unit` no cambia (`unit_condition_locked`), una regla más estricta que «mientras tenga unidades vigentes», porque `catalog` no lee `inventory`;
  - **punto 6, «stock-writes fija cada función y su único llamador»**: lo cumplen las funciones nuevas, en `tests/guards/unit-writes.test.ts`; las reglas de la 19.3 a la 22.5 siguen fijando el archivo o la carpeta (H-2), y endurecerlas queda fuera;
  - **la auditoría**: además de `stock_unit`, la `0056` suma la entidad `unit_grade` a `audit_entity_type`, para el alta, la edición, el orden y la desactivación de un grado; la copia del perfil se audita igual. Ninguna sentencia de la `0056` usa los valores que agrega.
- *Nota del 2026-10-20, por la 29.5.2* ([brief-29.5.2](brief-29.5.2-las-unidades-en-pedidos-y-ventas.md), aprobado por el usuario con D-1 (a) y D-2 (a)), sin cambiar el texto:
  - **punto 6, las líneas**: se resuelve la contradicción que dejó la nota de la 29.5. **El pedido elige sus unidades al crearse**, en la pantalla, y las guarda en `order_line_units` sin reservarlas; confirmarlo reserva exactamente esas, o rechaza todo nombrando las que ya no están disponibles. **El pedido del agente de un producto `unit` sigue rechazado** como `product_not_found`, sin cambio de contrato, hasta la 29.8;
  - **punto 6, el precio de cada unidad**: entra `stock_units.price` con su moneda, opcional, que fija el alta manual y corrige un `admin` con auditoría `price_change`. La línea vale la suma de sus unidades, cada una con su precio propio o el del producto. **El producto sigue necesitando un precio**: da el precio esperado y la moneda del comprobante. En una línea con unidades de distinto precio, `order_lines.unit_price` guarda el del producto, y el de cada unidad queda en `order_line_units.unit_price`;
  - **punto 6, los estados**: la `0057` suma `reserved` y `sold`, con las transiciones `available → reserved → available`, `reserved → sold`, `available → sold` y `sold → available`; `written_off` sigue final;
  - **punto 16, el orden de bloqueo**: la anulación de una venta sin pedido no bloquea la venta, así que dos anulaciones se serializan en sus unidades; la segunda vuelve a mirar la anulación previa con las unidades bloqueadas (revisión independiente de la 29.5.2, H-2).
- *Nota del 2026-10-20, por la 29.6* ([brief-29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md), aprobado por el usuario con sus decisiones U-1 a U-3 y las recomendaciones del brief), sin cambiar el texto:
  - **punto 17, la división**: la 29.6 implementa la capacidad `repairs`, la lista, el técnico, el producto de servicio y la orden `customer_device` con su venta. **La orden `own_unit`, los estados `in_repair` e `in_review`, `sendUnitToRepair`, `returnUnitFromRepair`, `releaseUnit` y el costo sumado a la unidad pasan a la 29.6.2**, que crea también `in_review`: la 29.7 lo reutiliza (U-1 y U-3);
  - **punto 10, el pago al técnico**: «sin cambios en `cash`» deja de valer. **La orden reparada pone su costo al debe de la cuenta del técnico**, con su fecha de reparación, y `cash` la lee de `service` (`listTechnicianChargesForAccount`) y la suma a las recepciones en `supplierAccountInput`. El pago a cuenta de la 22.6 la cancela de la deuda más vieja a la más nueva. `imputeAccount` y `supplier_payments` no cambian, y no hay pago contra una orden (U-2);
  - **punto 10, el presupuesto y la entrega**: un presupuesto por orden, armado con la lista del modelo y editable antes de guardarlo; las líneas se insertan al presupuestar y no cambian, y otro presupuesto es otra orden. Una orden rechazada se entrega sin venta; una reparada no se cancela; **la anulación de la venta de una reparación deja la orden entregada**. El cobro de un diagnóstico queda fuera;
  - **punto 10, el producto de servicio**: lo crea `org:capability` al activar `repairs`, uno por organización (`products.is_service`), y **se vende solo por su orden**: el pedido, la venta de la pantalla, el ajuste, la orden de compra y la recepción lo rechazan;
  - **punto 16, las dependencias**: `service` depende de `catalog`, `crm`, `purchasing`, `sales`, `numbering`, `organizations` y `audit`, y no de `inventory` hasta la 29.6.2; `cash` depende de `service`. Lo fijan las guardas `service-dependencies` y `purchasing-dependencies`.
- *Nota del 2026-10-20, por la 29.6.2* ([brief-29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md), aprobado por el usuario con las recomendaciones y sus decisiones U-1 a U-3), sin cambiar el texto:
  - **punto 6, los estados**: la `0059` suma `in_repair` e `in_review`, con `available → in_repair`, `in_review → in_repair`, `in_repair → in_review`, `in_review → available` e `in_review → written_off`. Una unidad nunca nace en esos estados hasta la 29.7;
  - **punto 6, la baja y la corrección** (U-2 y U-3): **una unidad `in_review` se da de baja con `writeOffUnit`, sin movimiento**, porque ya está fuera del saldo, y se corrige con `correctUnit` antes de liberarla. Amplía la tabla de caminos, que daba `in_review → written_off` solo a `writeOffTradeInUnit`;
  - **punto 6, el costo**: sube solo al marcar reparada la orden propia de la unidad, con auditoría `cost_change` que nombra la orden, y su moneda no cambia nunca. Los dos los fija el trigger de la unidad. `cancelUnitRepair` devuelve la unidad a `in_review` sin tocar el costo;
  - **punto 10, la orden propia** (U-1): va **en la moneda del costo de la unidad, sin conversión**, como la permuta (ADR 0025, punto 5, R-B5). **Nace `sent`**, porque la unidad ya está en el local, y **`repaired` es final**: no hay entrega. Las líneas llevan solo el costo del técnico. Una unidad tiene a lo sumo una orden propia abierta, y un producto sin modelo no se manda a reparar;
  - **punto 16, el orden de bloqueo**: mandar a reparar toma **el técnico antes que el producto y la unidad**, como el proveedor de una recepción antes que sus productos; marcarla reparada y cancelarla, la orden antes que el producto y la unidad. `service` depende de `inventory` desde esta subfase, sin la vuelta.

## Contexto

El usuario va a ofrecerle el CRM a un negocio de venta de iPhone. **El negocio no está confirmado.** El CRM tiene que servirle sin dejar de ser uno solo para todos los negocios: cada rubro trae lo suyo, y el siguiente no puede pagar por el anterior.

**Lo que dijo el usuario el 2026-10-18**, por su experiencia en el rubro y lo que conoce de este cliente. Son **respuestas del usuario**, no una confirmación del negocio (brief-29.1, §Supuestos):

| # | Tema | Respuesta |
|---|---|---|
| R-1 | Qué vende | Nuevos y usados, más usados. Cerca de **100 iPhone por mes**. |
| R-2 | Monedas | Publica y cobra en **USD**. También acepta **pesos al dólar blue de Córdoba, precio de venta**, que consulta todo el tiempo en infodolar.com para cobrar y para cotizar. |
| R-3 | Medios de pago | Efectivo en USD o en ARS, transferencia en ARS, tarjetas y USDT. **Combina varios en una misma venta** si el cliente quiere. El recargo de las cuotas **no se sabe**. |
| R-4 | Cotización de usados | No se sabe cómo cotiza. Por ahora, **costos de ejemplo por cada arreglo** que el equipo necesite, y **a cada equipo se le descuenta además un monto de ganancia**. |
| R-5 | Recepción de un usado | Revisa las dos cámaras, el micrófono, True Tone, el táctil, los parlantes y Face ID; si tiene **piezas desconocidas** (pantalla, cámara o batería); la **condición de la batería**; los **daños estéticos** (carcasa, bordes, rayones de pantalla); que **tome señal**; y que **no tenga cuenta de iCloud**. Pide **nombre, DNI y teléfono**, y como mucho Instagram o email. |
| R-6 | Servicio técnico | **Repara los dos tipos de equipos**: los de clientes y los propios. Trabaja con **un técnico principal y algunos alternativos**, todos tercerizados. |
| R-7 | Garantía | **30 días para todo.** |
| R-8 | El agente | Precios, stock, modelos, colores y batería; **cotizar un celular**; **reservar un equipo**; **reservar un turno para visitar el local**; **precios de reparaciones y qué reparaciones hace**; información del local; información técnica de un iPhone y de sus cámaras; y preguntas generales del rubro. |

**Lo que decidió el usuario el 2026-10-18**, después de leer la primera versión de este ADR:

- **U-1. Los turnos entran**: un calendario sobre el horario del local, con turnos de, por ejemplo, media hora o una hora (punto 12).
- **U-2. El dólar es la moneda fuerte.** Todo se lleva en dólares, también la caja, aunque se cobre en pesos. Pasa al ADR 0025.
- **U-3. La cotización se lee de infodolar automáticamente**, no se carga a mano. Pasa al ADR 0025.
- **U-4. Acepta el límite** de que un `viewer` deduzca, desde el arqueo, lo pagado en una compra pura (punto 14).
- **U-5. El DNI entra como dato opcional del cliente, nunca como identificador**, con una nota fechada en el ADR 0007 (revisión, R-6; punto 14).
- **U-6. El límite del `viewer` se extiende a los cobros con «Permuta»**: ve su monto, como ve el arqueo (revisión, R-8; punto 14).

**El brief verificó** (§Lo que se verificó, H-1 a H-9), contra `main` en `5c1430b`:

- el stock es una cantidad por producto, con su movimiento y la guarda `stock-writes` (ADR 0008; DataModel §`inventories`);
- `product_condition` solo tiene `new` y `refurbished`;
- el comprobante toma el precio vigente del producto, y no hay tipos de cambio (ADR 0019, punto 3);
- el proveedor es una ficha separada de los clientes (ADR 0023, punto 2);
- `organizations` no tiene dónde guardar qué capacidades tiene (ADR 0010);
- las variantes esperaban su propio ADR (Roadmap §«Fuera del rediseño»).

**Las respuestas y la revisión suman estos hechos**:

- **H-10. Un cobro no puede ir en otra moneda que su venta.** El ADR 0022 dice que «la moneda es la de su destino» y que no hay tipos de cambio. Cobrar en pesos una venta en dólares (R-2, U-2) supera **dos** ADR aceptados: el 0019, punto 3, y el 0022, en la moneda del cobro. Lo resuelve el ADR 0025, no este.
- **H-11. La cotización sale de una página de terceros** (R-2, U-3). Leerla de forma automática sería la primera dependencia del CRM con un servicio externo que no controla. **Ningún ADR decide hoy si el CRM puede leer un servicio externo**: el ADR 0016, punto 7, habla solo de producir efectos externos. Es una decisión nueva, del ADR 0025.
- **H-12. Los turnos no estaban en el brief** (R-8). Entran por decisión del usuario (U-1), como capacidad genérica.
- **H-13. La cotización de un usado y la lista de reparaciones comparten un dato.** Lo que cuesta arreglar algo es lo que se le descuenta a un usado que lo necesita. Lo que se cobra por arreglarlo es lo que el agente le contesta a un cliente. Una sola lista sirve a las dos cosas (puntos 7 y 9).
- **H-14. Un producto va en una sola línea** de un pedido, una venta, una orden de compra o una recepción. Lo exigen los `UNIQUE` `order_lines_order_product_unique`, `sale_lines_sale_product_unique` y `goods_receipt_lines_receipt_product_unique`, la regla `duplicateLines` y `lockLines` (ADR 0020, punto 3; 0021; 0023). Cinco unidades del mismo producto no caben en cinco líneas (revisión, R-3).
- **H-15. El stock de un pedido sale con la entrega, no con la venta.** `deliverStock` baja el saldo y lo reservado. La venta de un pedido entregado no toca el stock, y su anulación tampoco: «el pedido sigue entregado» (`sales/service.ts:586-591`; ADR 0021). Solo la venta sin pedido descuenta, y solo su anulación repone (revisión, R-1).

## Decisión

### 1. Qué decide este ADR

**Decide**:
- las tres capas;
- cómo se activa una capacidad;
- la regla de columna o atributo;
- las variantes, las unidades, la condición de usado y el grado;
- la lista de reparaciones;
- la recepción de usados, la permuta y la compra de usados;
- la cotización de un usado;
- el servicio técnico tercerizado;
- la garantía y los turnos;
- el agente, los roles y los datos personales;
- los módulos y sus dependencias;
- qué crea cada subfase.

**No decide**:
- el tipo de cambio, la moneda principal ni la lectura de infodolar, que van en el ADR 0025 (H-10, H-11, U-2, U-3);
- el recargo de las cuotas (R-3), hasta que se sepa;
- un taller propio, con técnicos que usen el CRM;
- la consulta automática del IMEI en una base externa;
- las listas de precios, los descuentos, la factura de ARCA y la contabilidad;
- **la forma** de cada contrato con el agente, que se diseña en su subfase (ADR 0014);
- **los órdenes de bloqueo** de cada operación, que fija el brief de cada subfase, verificados contra los privilegios de `crm_app`;
- un segundo rubro.

### 2. Las tres capas

- **El núcleo** es lo que ya existe: organizaciones, usuarios, clientes, conversaciones, información del negocio, catálogo, stock, pedidos, ventas, caja y compras. **No cambia de conducta en una organización que no tiene una capacidad.**
- **Una capacidad** es código del monolito, con sus tablas y sus fronteras (ADR 0002). Puede ser un módulo nuevo o una parte acotada de uno del núcleo. Sirve a más de un rubro. Las de esta fase:

  | Capacidad | Para qué | Dónde vive |
  |---|---|---|
  | `variants` | modelo, atributos de variante y atributos definidos | `catalog` |
  | `serialized_units` | unidades con número de serie o IMEI | `inventory` |
  | `repairs` | lista de reparaciones y órdenes de servicio con técnicos tercerizados | módulo nuevo `service` |
  | `trade_ins` | recepción de usados, permuta y compra de usados | módulo nuevo `tradeins` |
  | `appointments` | turnos para visitar el local | módulo nuevo `appointments` |

- **Un perfil de rubro** son **datos, no código** (punto 13). El de iPhone es el primero.
- **Lo propio de un cliente** es su copia del perfil, que ajusta un `admin`.

### 3. Cómo se activa una capacidad

- **`organization_capabilities`**, del módulo `organizations`, tiene una fila por capacidad activada:
  - la organización;
  - la capacidad, de un enum `capability`;
  - quién la activó y cuándo;
  - `UNIQUE (organization_id, capability)`.
- **Cada valor del enum entra con la subfase que lo usa**, con `ALTER TYPE … ADD VALUE`, como manda DataModel. La 29.2 crea el enum solo con `variants` (revisión, R-19).
- **La activa quien opera el CRM**, con un script, como se crea hoy una organización.
  - **El autor** es un `admin` de esa organización, que el script exige nombrar, igual que el alta de una organización audita con su `admin` (`organizations/service.ts`). La auditoría guarda que vino del script (revisión, R-20).
  - No hay pantalla.
  - **No se desactiva** una capacidad con datos: eso necesita su propio ADR.
- **Una sola función de lectura**, `hasCapability(organizationId, capability)`, en el `index.ts` de `organizations`. Una guarda fija que nadie lee la tabla por otro camino.
- **El marco** arma el menú con las capacidades de la organización. **Cada página, acción y ruta de servicio de una capacidad** responde 404, o rechaza, si la organización no la tiene. Es la misma regla que la autorización por rol, en el servidor.

### 4. Columna tipada o atributo definido

**Lo que el sistema usa para calcular, validar, identificar o buscar va en una columna tipada. Lo que solo se muestra o se filtra va en un atributo definido.**

- **Columnas**: el IMEI, el estado, el costo, el precio, el grado y la salud de la batería de una unidad. La batería es columna porque la cotización la usa (punto 9).
- **Atributos**: el color y la capacidad como atributos de variante (punto 5), el origen, si trae caja y lo que el perfil sume.
- **`attribute_definitions`** (de `catalog`), por organización:
  - la entidad: `product` en la 29.2, y `unit` con la 29.5;
  - la clave, única por organización y entidad;
  - el nombre;
  - el tipo (`text`, `number`, `boolean`, `option`);
  - las opciones de un `option`, en una tabla hija con una fila por opción;
  - si es obligatorio;
  - si es **de variante** (solo para `product`);
  - el orden.

  Una definición con valores no cambia de tipo ni de entidad: se desactiva y se crea otra.
- **`attribute_values`**: una fila por entidad y definición, con **una columna por tipo y un `CHECK` de que hay exactamente una**. El servicio valida el valor contra su definición. Sin `jsonb`, por lo que descartó el brief-17.4, D-1.
- **Un atributo que pasa a usarse en un cálculo pasa a columna**, con su migración y su brief.

### 5. Las variantes

- **Cada combinación sigue siendo un producto**, con su SKU, su precio, su costo y su stock, como hoy. Por ejemplo, «iPhone 13 128 GB Azul usado».
- **`product_models`** (de `catalog`) agrupa productos por modelo («iPhone 13»), por organización y con nombre único. `products.model_id` es una columna nueva, opcional.
- **Los atributos de variante** (capacidad, color) son atributos definidos con la marca de variante. **Dos productos activos del mismo modelo, con la misma condición y los mismos valores de variante, son un duplicado**, y el servicio lo rechaza.
- **Nada del núcleo cambia**: pedidos, ventas y compras siguen apuntando a un producto. Generar las combinaciones de una vez es una mejora de pantalla, para después.

### 6. Las unidades serializadas, la condición y el grado

**El producto y la condición**

- **`products.tracking`**, un enum `stock_tracking` (`quantity`, `unit`) con `quantity` por defecto.
  - **Solo cambia mientras el producto no tenga saldo ni movimientos.**
  - Como `catalog` no lee `inventory` (Overview), **el cambio lo hace `inventory`**: comprueba que no hay movimientos y llama a una función de escritura de `catalog` con su transacción. Una guarda fija ese único llamador (revisión, R-16).
  - **Un producto `unit` exige la capacidad `serialized_units`.**
- **`product_condition` suma `used`.** La condición sigue siendo del producto: el nuevo y el usado del mismo modelo son productos distintos, con precios distintos.

**La unidad**

- **`stock_units`** (de `inventory`), por organización:
  - el producto;
  - el **número de serie o IMEI**: texto de 1 a 32 caracteres, único por organización sin distinguir mayúsculas, y que no se edita;
  - el estado;
  - el grado, de la lista del perfil;
  - la salud de la batería, de 0 a 100, opcional;
  - **el costo de la unidad**, con su moneda;
  - un **precio propio** opcional, con su moneda;
  - los días de garantía, opcionales;
  - el origen: un tipo (`goods_receipt`, `trade_in`, `manual`), cada valor con la subfase que lo usa, y **una clave plana, sin clave foránea**, para que `inventory` no importe esquemas de `purchasing` ni de `tradeins` (revisión, R-16);
  - las fechas.
- **Cada cambio del precio o del costo de una unidad se audita**, como `price_change` y `cost_change` con el tipo de entidad de la unidad. No hay tabla de historial: el historial es la auditoría (revisión, R-24).
- **Estados**: `in_review`, `available`, `reserved`, `sold`, `in_repair` y `written_off`. Un trigger fija las transiciones, como `orders_guard`. **`sold` quiere decir que salió del local**: entregada o vendida sin pedido.

**El saldo**

- **El saldo cuenta solo lo que se puede vender.** En un producto `unit`:
  - `quantity_on_hand` es igual a sus unidades `available` y `reserved`;
  - `quantity_reserved` es igual a sus `reserved`.
- **Una unidad `in_review` o `in_repair` está en el local, pero fuera del saldo.**
- **El ADR 0008 no cambia**, y el saldo nunca cambia sin su movimiento. `inventory_movements` suma `unit_id`, obligatorio en un producto `unit`.
- **Un test de invariante** compara el saldo con las unidades después de cada escritura de las suites de `inventory`, `orders`, `sales`, `purchasing`, `tradeins` y `service`.

**Cada camino del stock en un producto `unit`** (revisión, R-1 y R-2). Escribe siempre una función de `inventory` que recibe la transacción del módulo dueño y cambia la unidad y el saldo juntos. **`stock-writes` fija cada función y su único llamador.**

| Operación | Unidad | Saldo y movimiento | Función (llamador) |
|---|---|---|---|
| Recepción de mercadería | se crea `available` | +1, `goods_receipt` | `receiveStock` extendida (`purchasing`) |
| Anulación de la recepción | `available` → `written_off`; si alguna ya no está `available`, rechaza | −1, `goods_receipt_void` | `removeReceivedStock` extendida (`purchasing`) |
| Alta manual de una unidad | se crea `available`, con su IMEI y su costo | +1, `adjustment_positive` | `registerUnit`, nueva (`inventory`, acción de `admin`) |
| Baja manual de una unidad | `available` → `written_off` | −1, `adjustment_negative` | `writeOffUnit`, nueva (`inventory`, acción de `admin`) |
| **Ajuste de cantidad** | — | **se rechaza**: en un producto `unit`, el saldo solo se mueve por una unidad | `adjustStock` lo rechaza |
| Confirmar un pedido | `available` → `reserved` | reservado +1, sin movimiento | `reserveStock` extendida (`orders`) |
| Liberar un pedido | `reserved` → `available` | reservado −1, sin movimiento | `releaseStock` extendida (`orders`) |
| **Entregar un pedido** | `reserved` → `sold` | −1 y reservado −1, `order_delivery` | `deliverStock` extendida (`orders`) |
| Venta de un pedido entregado, y su anulación | **no cambia**: ya salió con la entrega | ninguno | — |
| Venta sin pedido | `available` → `sold` | −1, `sale` | `sellStock` extendida (`sales`) |
| Anulación de una venta sin pedido | `sold` → `available` | +1, `sale_void` | `restoreSaleStock` extendida (`sales`) |
| Usado recibido | se crea `in_review` | ninguno: fuera del saldo | `registerTradeInUnit`, nueva (`tradeins`) |
| Liberar a la venta | `in_review` → `available` | +1, `unit_released` | `releaseUnit`, nueva (`inventory`, acción de `admin`) |
| Mandar a reparar | `in_review` o `available` → `in_repair` | −1, `unit_to_repair`, si estaba `available` | `sendUnitToRepair`, nueva (`service`) |
| Volver de reparación | `in_repair` → `in_review` | ninguno | `returnUnitFromRepair`, nueva (`service`) |
| Anulación del usado | `in_review` → `written_off`, sin movimiento; `available` → `written_off`, −1, `unit_written_off` | según el estado | `writeOffTradeInUnit`, nueva (`tradeins`) |

- **Un IMEI mal cargado** se corrige con la baja manual y un alta nueva.
- **Los tipos nuevos de movimiento** (`unit_released`, `unit_to_repair`, `unit_written_off`) entran con la subfase que los usa.

**Las líneas** (revisión, R-3; H-14)

- **Un producto `unit` sigue en una sola línea, con su cantidad**, y la línea **lleva sus unidades en una tabla hija**: `order_line_units`, `sale_line_units` y `goods_receipt_line_units`. Cada fila tiene la unidad y, en la venta y el pedido, **su precio**.
- **El número de filas hijas es igual a la cantidad de la línea.** Lo comprueban el servicio y un test.
- Los `UNIQUE` de producto por línea, `duplicateLines` y `lockLines` **no cambian**.
- **En la recepción**, la línea lleva el IMEI de cada unidad que crea, con el costo de la línea.
- **En la venta y el pedido, el precio de cada unidad** es su precio propio si lo tiene, y si no, el del producto. **El monto de la línea es la suma de sus unidades.**
  - Si el precio de una unidad está en otra moneda que el comprobante, la línea se rechaza, hasta que el ADR 0025 diga otra cosa.
  - Esto relee el ADR 0019, punto 3, y el 0020, punto 3, con **notas fechadas**, sin enmendar su texto.

**El costo**

- **El costo de la unidad** es:
  - el de su línea en la recepción de mercadería;
  - o lo reconocido en la recepción del usado (punto 8);
  - **más** lo que cobró el técnico por cada reparación de esa unidad (punto 10).
- **Una recepción de mercadería no escribe `product_costs` en un producto `unit`**: el costo vive en la unidad. Es una nota al ADR 0023, punto 5 (revisión, R-17). En un producto `quantity`, `product_costs` sigue igual.
- **El margen de una venta de un producto `unit` es exacto**: lo que se cobró por cada unidad menos su costo. La Fase 25 lo lee de ahí.

### 7. La lista de reparaciones

- **`repair_types`** (de `service`), por organización: el nombre («Cambio de batería», «Cambio de pantalla», «Cámara trasera»), activo o no, y el orden.
- **`repair_prices`**: por tipo de reparación y **modelo** (punto 5):
  - el **precio al cliente**, con su moneda;
  - el **costo estimado** del técnico, con su moneda.

  La edita un `admin`, y cada cambio se audita. Es una lista de referencia, no un comprobante.
- **Sirve a tres cosas**:
  - lo que el agente contesta sobre qué reparaciones se hacen y cuánto cuestan, **solo con el precio al cliente**;
  - el presupuesto de una orden de servicio de un cliente (punto 10);
  - **el descuento por arreglo en la cotización de un usado**, que usa el costo estimado (punto 9).
- El perfil de iPhone trae los tipos y **valores de ejemplo** (punto 13), hasta que el negocio dé los suyos (R-4).

### 8. La recepción de usados, la permuta y la compra de usados

**El comprobante**

- **`trade_ins`** (de `tradeins`) es un **comprobante de solo inserción**, numerado (`PU-000123`, con su tipo en `document_kind`), **contra un cliente**. Nunca contra un proveedor, por el ADR 0023, punto 2. Lleva:
  - el producto de destino: modelo, variante y condición `used`;
  - el IMEI;
  - el resultado del checklist, en una tabla hija con una fila por punto;
  - la salud de la batería y el grado propuesto;
  - **el valor reconocido**, con su moneda;
  - el destino: `sale_credit` o `purchase`.
- **El checklist** es de la copia del perfil (`trade_in_checklist_items`, punto 13). Cada punto tiene un nombre, si es obligatorio para aceptar el equipo y, opcionalmente, **el tipo de reparación** que hace falta si falla. El perfil de iPhone trae los puntos de R-5. **iCloud desvinculado y que tome señal** son obligatorios.
- **Al emitirse, crea la unidad en `in_review`**, fuera del saldo, con el valor reconocido como costo (punto 6).

**El destino del valor**

- **`sale_credit`, la permuta**: un **medio de pago nuevo, de sistema, «Permuta»**, en `payment_methods`, que **no es efectivo**.
  - El cobro con ese medio apunta a la recepción del usado.
  - **Nunca suma más que su valor**, contando todos los cobros vigentes que la usan.
  - Vive en `cash`, que depende de `tradeins` para leerla, como depende de `purchasing`.
  - **Combinar medios en una venta ya funciona** (R-3): son varios cobros contra la misma venta (ADR 0022, punto 3). Lo que todavía no se puede es combinar monedas (H-10).
- **`purchase`, la compra de usados**: el negocio le paga al cliente con un **comprobante de pago propio, `trade_in_payments`**, de `cash`, como `supplier_payments` (revisión, R-13):
  - con cualquier medio de pago;
  - si es efectivo, sale de la sesión abierta de su moneda, sin dejarla por debajo de cero;
  - nunca por más que el valor reconocido;
  - se anula con otro comprobante.

  No es un retiro de caja ni un pago a proveedor.

**La anulación** (revisión, R-5)

- La recepción del usado se anula con otro comprobante, a lo sumo una vez, solo si:
  - la unidad sigue `in_review` o `available`;
  - **ningún cobro vigente con «Permuta» la usa**;
  - y **ningún pago de compra vigente** la paga.
- **La orquesta `cash`**, bajo el bloqueo `cash:` de la organización, porque es la dueña de esas comprobaciones. Llama a `tradeins` para escribir la anulación y a `inventory` para dar de baja la unidad. **`tradeins` no depende de `cash`**, como `purchasing` no depende de `cash` en el ADR 0023, punto 11.

**Los datos personales** van en la ficha del cliente, no en el comprobante (punto 14).

### 9. La cotización de un usado

**El CRM calcula. El agente pregunta y presenta.** La regla vive en una sola función de `tradeins`:

```
valor orientativo = precio de referencia del usado
                    − Σ costo estimado de cada reparación que necesita
                    − margen del equipo
```

- **El precio de referencia** es el precio vigente del producto usado de ese modelo y variante, con el grado de referencia del perfil.
- **Las reparaciones** salen de las respuestas del checklist: cada punto que falla y tiene un tipo de reparación suma el costo estimado de `repair_prices` para ese modelo. **La batería** suma «Cambio de batería» si su salud está por debajo del umbral del perfil (el de ejemplo es 80 %).
- **El margen del equipo** es un monto por modelo (`trade_in_margins`, punto 13), de la copia del perfil (R-4).
- **No hay cotización si falta un dato** (un modelo sin precio de referencia, una reparación sin costo) **o si los montos están en monedas distintas** (revisión, R-12). El resultado lo dice, y el agente deriva a una persona.
- **El resultado es un rango redondeado**: el valor y el valor menos el porcentaje del perfil, **los dos redondeados hacia abajo al múltiplo del perfil** (el de ejemplo es 10 USD). Así, dos cotizaciones que difieren en un punto no dejan despejar el costo exacto de una reparación. Queda como límite: una diferencia grande sigue dejando ver un orden de magnitud (revisión, R-21).
- **Es orientativo y no se guarda.** El precio final lo fija una persona al revisar el equipo, en la recepción del punto 8. No es un compromiso del negocio (brief, H-7).

### 10. El servicio técnico tercerizado

**El técnico y la orden**

- **El técnico es un proveedor** del ADR 0023 con una marca nueva, `is_technician`, de `purchasing`. Puede haber varios: el principal y los alternativos (R-6).
- **`service_orders`** (de `service`) es un compromiso con estado, como el pedido. No es un comprobante. Va numerada (`OS-000123`) y tiene **dos tipos**:
  - **`own_unit`**: una unidad propia va a reparar (`sendUnitToRepair`). Al volver, **lo que cobró el técnico suma al costo de la unidad**, que vuelve a `in_review` (punto 6).
  - **`customer_device`**: el equipo de un cliente, con el modelo, el IMEI y lo que reporta. **No es una unidad del stock.** El negocio le da un presupuesto con los precios de la lista (punto 7), lo manda al técnico, lo cobra y se lo entrega.
- **Estados**: `received` → `sent` → `quoted` → `approved` o `rejected` → `repaired` → `delivered`, y `cancelled` mientras no esté reparada. Un `own_unit` salta `quoted` y `approved`. Un trigger fija las transiciones.
- **Las líneas** son las reparaciones de la lista, cada una con el **precio al cliente** (solo en `customer_device`) y el **costo del técnico**. Se cargan al presupuestar y se fijan al aprobar.
- **El pago al técnico** es un pago a proveedor de la 22.6, sin cambios en `cash`.

**El cobro al cliente** (revisión, R-4 y R-7)

- **Una orden `customer_device` reparada se cobra con una venta sin pedido**, que **emite `service` llamando a `sales`**.
  - La venta tiene **una sola línea**, con un producto de servicio («Reparación»), y **el monto es el total aprobado de la orden**, no el precio vigente del producto. Es otra relectura del ADR 0019, punto 3, con nota fechada, como la del ADR 0021 para la venta de un pedido.
  - **`sales` no conoce `service`**: el enlace va de `service_orders.sale_id` a la venta.
- **El producto de servicio** (revisión, R-11):
  - es `products.is_service`, que **exige la capacidad `repairs`** y `tracking = quantity`;
  - **no tiene fila en `inventories`**: no reserva, no descuenta y la venta sin pedido salta la comprobación de lo disponible para él;
  - **un pedido lo rechaza**;
  - **el ajuste manual lo rechaza**;
  - **no aparece en las listas de stock, en el estado de stock ni en `read-v1` y `read-v2`**, donde el agente lo vería como agotado;
  - **queda fuera del valor de inventario y del stock bajo** de la Fase 25.

**Lo que ve un `viewer`** (revisión, R-9): las órdenes de servicio, **sin el técnico ni su costo**. El ADR 0023, punto 12, sigue entero: un `viewer` no ve nada de compras.

### 11. La garantía

- **Se deriva y no tiene tabla**: la fecha de la venta, o de la entrega del pedido, más los días de garantía de la unidad, o los del perfil (30, R-7). También vale para la entrega de una orden de servicio `customer_device`.
- **La ficha del cliente, la búsqueda por IMEI y la unidad** muestran si un equipo sigue en garantía.
- **Un reclamo** es una orden de servicio con la marca `warranty_claim`, que apunta a la venta o a la orden original. Eso es `service → sales`, la misma dirección que el cobro del punto 10. **No se le cobra al cliente**, y lo que cobre el técnico es costo del negocio.

### 12. Los turnos

**Entran por decisión del usuario del 2026-10-18 (U-1).**

- **`appointments`** (de `appointments`), por organización. Lleva:
  - el cliente, por su teléfono (ADR 0007);
  - la fecha, la hora de inicio y la de fin;
  - el motivo, de la lista de la copia del perfil;
  - una referencia opcional a un producto o a una unidad;
  - el estado: `requested`, `confirmed`, `cancelled`, `attended` o `no_show`.
- **El calendario sale del horario del local**: `business_hours` y sus excepciones (11.2, 17.4).
  - Los turnos son franjas de la **duración del perfil** (30 o 60 minutos).
  - **Cuántos caben a la vez** también es del perfil (el de ejemplo es 1).
  - Un turno fuera de horario, o en una franja llena, se rechaza.
- **La pantalla es un calendario** por día y por semana, con las franjas libres y ocupadas.
- **El agente pide un turno**, que queda `requested` hasta que una persona lo confirma, como el pedido pendiente de la 19.4. Una franja con un turno `requested` cuenta como ocupada.
- Sin recordatorios ni avisos: el CRM no envía mensajes (Scope, §Sigue fuera; el [ADR 0017](0017-responder-desde-el-crm.md) espera un negocio real).

### 13. El perfil de rubro

**La plantilla** está versionada en el repositorio (`src/modules/organizations/profiles/`), como los seeds. **Se copia a la organización** con el mismo script que activa las capacidades, en una sola transacción, con su auditoría.

**Dónde vive cada parte de la copia** (revisión, R-15). Cada tabla la crea la subfase de su capacidad, nunca antes:

| Parte | Tabla | Módulo | Subfase |
|---|---|---|---|
| Atributos y sus opciones | `attribute_definitions` y su tabla de opciones | `catalog` | 29.2 |
| Grados | `unit_grades` | `inventory` | 29.5 |
| Tipos y precios de reparación | `repair_types`, `repair_prices` | `service` | 29.6 |
| Checklist | `trade_in_checklist_items` | `tradeins` | 29.7 |
| Márgenes por modelo | `trade_in_margins` | `tradeins` | 29.7 |
| Motivos de turno | `appointment_reasons` | `appointments` | 29.10 |
| Valores sueltos | **una fila por organización y capacidad**, con columnas tipadas y su `CHECK`: el umbral de batería, el porcentaje y el redondeo del rango, el grado de referencia, los días de garantía, la duración y el cupo de los turnos | el módulo de cada capacidad | la de su capacidad |

- **Después de copiada, un `admin` la ajusta.** Cambiar la plantilla no toca las organizaciones que ya la copiaron.
- **Los valores de ejemplo** llevan la marca `is_example`, que la pantalla muestra hasta que un `admin` los cambia. **El agente no cotiza con un valor de ejemplo** en una organización con tráfico real.

### 14. Roles y datos personales

**Roles**

- **Un `admin`** configura la copia del perfil, carga unidades, recibe usados, fija precios, opera órdenes de servicio y turnos, y ve costos.
- **Un `viewer`** ve unidades, atributos, órdenes de servicio (sin técnico, punto 10) y turnos. **No ve** el costo de una unidad, el valor reconocido en la recepción de un usado ni el costo del técnico (FR-PROD-21). Ve el precio al cliente de la lista de reparaciones.
- **Límite aceptado por el usuario** (U-4), el mismo del R-1 de la 22.1 (ADR 0023, punto 12): el arqueo que ve un `viewer` deja despejar lo pagado en efectivo por una compra de usados.
- **Límite extendido por el usuario** (U-6; revisión, R-8): un `viewer` ve los cobros de una venta, con su medio y su monto (FR-CAJ-11; ADR 0022, punto 12), así que un cobro con «Permuta» le muestra el valor reconocido del usado. Se acepta como el del arqueo. Se descartó ocultarle esos montos, porque sumaba una regla nueva sobre una lista que hoy no distingue medios.

**Datos personales** (R-5)

- Lo que pide el negocio va en la ficha del cliente, no en el comprobante:
  - **`clients.document_number`**: el DNI, de 7 u 8 dígitos, opcional y sin unicidad;
  - **`clients.instagram`**: el usuario, opcional;
  - el email ya existe (17.1).
- **El DNI choca con decisiones vigentes** (revisión, R-6):
  - el ADR 0007 dice «no se agregan columnas de documento»;
  - DataModel §`clients` y FR-CLI-05 dejan el documento para la subfase que discrimine el IVA o para el ADR de la factura de ARCA, **con una enmienda del ADR 0007**.

  **Decidido por el usuario** (U-5): una **nota fechada en el ADR 0007** admite el documento **como dato opcional y nunca como identificador**. La identidad sigue siendo solo el teléfono, que es la decisión del 0007. Se enmiendan con fecha DataModel §`clients` y FR-CLI-05, y el documento entra en el vaciado. Se descartó no guardar el DNI hasta la factura de ARCA, porque el negocio lo pide hoy (R-5).
- **Las dos columnas nuevas no llegan a un `viewer` ni al agente**, y **se vacían con el cliente** (ADR 0015).
- **Las tablas nuevas del cliente** también entran en el runbook de datos de un cliente, para exportarlas y vaciarlas (revisión, R-22). Sus claves al cliente son `RESTRICT`, como las de hoy. Son:
  - `trade_ins`;
  - `service_orders`, con el IMEI de un equipo de cliente;
  - `appointments`.
- **El agente nunca lee** el DNI, el Instagram, un IMEI, un costo ni un margen.

### 15. El agente

**Lo que el CRM le da**, cada cosa por un contrato versionado de su subfase (ADR 0014):

- las capacidades de la organización, para que no ofrezca lo que no existe;
- **modelos, variantes, colores, condición y stock**, y **las unidades disponibles** con su grado, su batería, su precio y sus fotos;
- **la cotización orientativa de un usado** (punto 9), con un rango y la marca de orientativa;
- **el pedido de una unidad** (revisión, R-10). Va con el contrato del pedido pendiente de la 19.4, extendido. **Un pendiente no reserva**, porque reservar es confirmar (ADR 0020), así que dos pendientes pueden pedir la misma unidad. La primera confirmación la reserva, y la segunda falla con un motivo. **El contrato le dice al agente que es una solicitud sujeta a confirmación**, y el agente nunca dice «te la reservo»;
- **qué reparaciones se hacen y su precio al cliente**, por modelo (punto 7);
- **el estado de las órdenes de servicio** del cliente con el que habla, por su teléfono;
- **los horarios libres y el pedido de un turno** (punto 12);
- la información del local, que ya lee (11.2, 17.4).

**Lo que el CRM no le da**: la información técnica de un iPhone, sus cámaras y las preguntas generales del rubro (R-8). **No son datos del negocio.** Las contesta el agente con su propio conocimiento, en su repositorio, y es responsabilidad suya no inventar especificaciones. Lo que sí es del negocio, como «no vendemos equipos con piezas cambiadas», va en la información del negocio, que ya existe.

**Lo que no registra el agente**: recepciones de usados, órdenes de servicio, cobros ni pagos (ADR 0016, punto 5). Escribe solo el pedido pendiente y el turno pedido, y una persona los confirma.

**Precios en pesos**: hasta el ADR 0025, el agente da el precio en la moneda del producto (USD) y no convierte.

**Entre la 29.5 y la 29.8** (revisión, R-14): `read-v1` y `read-v2` admiten solo `new` y `refurbished` en un objeto estricto. Hasta el contrato nuevo, **los dos excluyen los productos `used` y los de servicio** de sus listas y búsquedas. No cambia la forma, cambia qué productos aparecen. El agente no ofrece usados hasta la 29.8, y el usuario lo sabe.

### 16. Los módulos y las dependencias

- **Módulos nuevos**: `service`, `tradeins` y `appointments`. Los tres entran en la lista de módulos de dominio de `eslint.config.mjs` y del Overview.
- **`service`** depende de `catalog`, `inventory`, `purchasing` (el técnico), **`sales`** (emite la venta de una reparación y lee la venta de un reclamo), `crm`, `numbering`, `organizations` y `audit`.
- **`tradeins`** depende de `catalog`, `inventory`, `crm`, `numbering`, `organizations`, `audit` y **`service`**, solo para leer los costos de reparación de la cotización.
- **`appointments`** depende de `crm`, `knowledge` (el horario), `catalog` e `inventory` (la referencia opcional), `organizations` y `audit` (revisión, R-16).
- **`cash`** suma la dependencia de `tradeins`: la permuta, la compra de usados y la anulación del usado.
- **Ningún módulo del núcleo depende de un módulo de capacidad**, salvo `cash`, como ya depende de `purchasing` (brief, AC-7). En particular, **ni `sales` ni `inventory` conocen `service` ni `tradeins`**.
- **No hay ciclos.** Las aristas nuevas son `service → sales`, `service → purchasing`, `tradeins → service`, `cash → tradeins`, y las de `appointments` hacia el núcleo. Ninguna tiene la vuelta.
- **Guardas**: `purchasing-dependencies` cambia su regla 2 («solo `cash` importa `purchasing`»), porque `service` también la importa. Cada módulo nuevo lleva su guarda de dependencias, como esa.
- **Una regla de bloqueo para todos**: **la unidad se bloquea después del producto y antes del saldo**. El orden completo de cada operación lo fija su brief.

### 17. Qué crea cada subfase

Ajusta el D-15 del brief. El tipo de cambio sube, porque el negocio vende en dos monedas desde el primer día (R-2, U-2). La lista de reparaciones va antes que la permuta, porque la cotización la usa (H-13). Los turnos entran (U-1).

| Subfase | Crea |
|---|---|
| **29.1 — ADR de rubros y capacidades** | este ADR, sin tablas |
| **29.2 — Capacidades y variantes** | `organization_capabilities` con `variants`, `hasCapability`, la guarda, el menú por capacidad, `product_models`, `attribute_definitions` y sus opciones, `attribute_values`, el script de activación y la plantilla del perfil de iPhone (atributos) |
| **29.3 — ADR del tipo de cambio** | el ADR 0025, sin tablas: la moneda principal (U-2), la cotización, la moneda del cobro (H-10) y la lectura de infodolar (H-11, U-3) |
| **29.4 — El tipo de cambio** | lo que decida el 0025 |
| **29.5 — Las unidades** | `serialized_units`, `products.tracking`, `used`, `stock_units`, `unit_grades`, las líneas hijas, los caminos del punto 6, el invariante y la exclusión de `used` en `read-v1` y `read-v2` |
| **29.6 — Las reparaciones y el servicio técnico** | `repairs`, `products.is_service`, `is_technician`, `repair_types`, `repair_prices`, `service_orders` con sus dos tipos y la venta de una reparación |
| **29.7 — La recepción de usados y la permuta** | `trade_ins`, el checklist, `trade_in_margins`, la cotización, «Permuta», `trade_in_payments`, la anulación en `cash`, y el DNI y el Instagram del cliente (U-5) |
| **29.8 — El agente del rubro** | los contratos del punto 15, salvo los turnos |
| **29.9 — La garantía** | la garantía derivada y el reclamo |
| **29.10 — Los turnos** | `appointments`, `appointment_reasons`, el calendario y su contrato con el agente |

**Desde la 29.2**, la fase se construye con el negocio confirmado o por decisión explícita del usuario registrada con fecha (brief-29.1, D-16).

## Alternativas descartadas

**De las tres capas y la activación** (brief, D-2 y D-3)

- **Un fork o una rama por cliente**: cada arreglo se aplica N veces.
- **Un módulo por cliente**: mezcla el rubro con el cliente, y el segundo negocio del rubro no lo reutiliza.
- **Las capacidades en una columna de arreglo de `organizations`**: sin `CHECK` por valor ni fecha por capacidad.
- **Las capacidades en una variable de entorno**: hay un solo despliegue para todas las organizaciones.
- **Que el `admin` del negocio las active desde una pantalla**: le da un interruptor con efectos que no puede medir.

**De los atributos y las variantes** (brief, D-4 y D-5)

- **Atributos en `jsonb`**: se pierden los `CHECK` y el contrato estable con el agente (brief-17.4, D-1).
- **Solo columnas, sin atributos definidos**: cada rubro pide una migración, aunque el dato solo se muestre.
- **Una matriz de variantes con su propio stock**: duplica el producto en pedidos, ventas y compras.
- **Sin variantes, con el color en el nombre**: el agente no puede filtrar por color.

**De las unidades** (brief, D-6 y D-7)

- **Un stock aparte para las unidades**: dos caminos en cada módulo del núcleo.
- **Un producto por unidad**: llena el catálogo de productos de un solo uso, y el agente no puede agrupar.
- **Contar la unidad en revisión dentro del saldo**: la ofrecería a la venta.
- **Una línea por unidad, relajando el `UNIQUE` de producto** (revisión, R-3): cambia la regla de líneas compartida por pedidos, ventas y compras, y obliga a enmendar tres ADR.
- **La condición en la unidad, no en el producto**: un producto mezclaría nuevos y usados con un solo precio.

**Del usado, la permuta y la compra**

- **La permuta como un descuento de la venta**: pierde el costo de la unidad recibida, el IMEI y el checklist.
- **La recepción de usados como recepción de mercadería, con el cliente como proveedor**: rompe el ADR 0023, punto 2.
- **La compra de usados como un retiro de caja** (revisión, R-13): no sirve para una transferencia, no tiene tope ni se anula con otro comprobante.
- **Que `tradeins` mire los cobros al anular** (revisión, R-5): arma el ciclo `cash ↔ tradeins`.
- **Guardar la cotización orientativa**: convierte un cálculo en un compromiso, y suma datos sin uso.

**Del servicio técnico y la garantía** (brief, D-10 y D-11)

- **Solo el caso de la unidad propia**: el negocio también repara equipos de clientes (R-6).
- **Un taller propio**: el rubro lo terceriza.
- **Que `sales` guarde la orden de servicio** (revisión, R-4): el núcleo dependería de una capacidad.
- **Una línea por reparación en la venta**: necesita un producto por tipo de reparación con un precio que cambia por modelo, o romper el `UNIQUE` de `sale_lines`.
- **Una tabla de garantías**: guarda un dato que se deriva.

**Del perfil** (brief, D-13)

- **Plantillas en tablas globales**: rompen el aislamiento por organización y crean tablas sin dueño.
- **Sin plantilla**: el segundo negocio del rubro repite todo.

**De lo que lee el agente y de la moneda**

- **El DNI en el comprobante del usado**: copia un dato personal en una tabla de solo inserción, que el ADR 0015 obliga a vaciar con más pasos.
- **Las especificaciones de Apple como datos del CRM**: un catálogo que el negocio no mantiene y que envejece con cada modelo.
- **Decidir el tipo de cambio acá**: supera dos ADR del núcleo (H-10) dentro de una decisión de rubro.

## Consecuencias

Al aceptarse, se enmiendan con fecha y conservando el texto anterior:

- **el ADR 0007**: la nota del DNI (U-5);
- **el ADR 0019**, notas en el punto 3: el precio de la unidad, el monto de la venta de una reparación y la referencia al 0025;
- **el ADR 0020**, nota en el punto 3: la línea con sus unidades, y que un pendiente no reserva la unidad;
- **el ADR 0021**: la venta sin pedido de un producto de servicio, y que la venta de un pedido no toca la unidad;
- **el ADR 0022**, una nota:
  - el medio «Permuta»;
  - `trade_in_payments`;
  - la anulación del usado en `cash`;
  - la dependencia de `tradeins`;
  - la moneda del cobro, que pasa al 0025;
  - y el límite de la permuta que ve un `viewer` (U-6);
- **el ADR 0023**, notas:
  - en el punto 2: el técnico es un proveedor marcado, y quien entrega un usado es un cliente;
  - en el punto 5: la recepción no escribe `product_costs` en un producto `unit`;
  - en el punto 11: `service` depende de `purchasing`;
- **DataModel**: una nota de diseño en §«Explícitamente fuera de este modelo» con las tablas que vienen, **sin tablas**, y §`clients` por el DNI (U-5);
- **FunctionalRequirements**: FR-CLI-05 (U-5) y FR-CAJ-11 (U-6);
- **Overview**: las capacidades como forma de extender el monolito, y los módulos nuevos;
- **Scope**: el perímetro de la fase y lo que sigue fuera;
- **Roadmap**: §Fase 29 con las subfases del punto 17;
- **Notion**: los nombres y el orden de las subfases, y la 29.10 nueva, con la autorización del usuario;
- **el runbook de datos de un cliente**: el DNI y el Instagram (U-5); `trade_ins`, `service_orders` y `appointments`;
- **`docs/decisions/README.md`**: el ADR 0024.

`eslint.config.mjs`, las guardas, FunctionalRequirements y los `index.ts` los enmienda la subfase que crea cada cosa.

## Riesgos

- **Que el negocio no se confirme** y la fase quede en la 29.1. Lo mitiga el gate de la 29.2.
- **Que el negocio cotice distinto** de la fórmula del punto 9 (R-4). La fórmula está en una sola función y sus datos en la copia del perfil. Cambiarla es un brief, no un rediseño.
- **El invariante del saldo y las unidades** toca seis módulos. Lo mitigan la tabla de caminos del punto 6, cada uno con su función y su llamador, el test de invariante y la guarda.
- **El producto de servicio** es la primera excepción a la comprobación de stock del núcleo. El punto 10 la acota a la venta sin pedido.
- **Que el agente no ofrezca usados entre la 29.5 y la 29.8** (punto 15). Es la mayor parte de lo que vende el negocio (R-1). Si la 29.8 tarda, conviene adelantarla.
- **Que el agente dé datos técnicos falsos** de un iPhone. No es del CRM (punto 15), pero el negocio lo va a ver como un error del sistema. Se le avisa al usuario al publicar el contrato.
- **Los límites del `viewer`**: el arqueo (U-4) y la permuta en los cobros (U-6), los dos aceptados por el usuario.

## Revisión independiente

La hizo el 2026-10-18 un agente que no participó del trabajo, con acceso de solo lectura, contra el brief, `CLAUDE.md`, los ADR del núcleo, DataModel, Overview, Roadmap, Scope, FunctionalRequirements, el runbook de datos de un cliente, el código de los módulos y las guardas. Fijó la escala antes de mirar. No leyó enteros los ADR 0002, 0010, 0013, 0014, 0015, 0017, 0020 y 0021.

**Veredicto: R1**, con 24 hallazgos (7 bloqueantes, 10 medios y 7 bajos) y 7 notas sólidas. Cada hallazgo se verificó contra el código o el documento citado antes de aceptarlo. Los centrales se comprobaron uno por uno: la venta de un pedido no toca el stock (`sales/service.ts:586-591`), los `UNIQUE` de producto por línea, la prohibición de documento del ADR 0007 (l.14), `cash_movements` sin referencia y `read-v1` con solo `new` y `refurbished` (`read/v1/contract.ts:103`).

| Hallazgo | Severidad | Corrección |
|---|---|---|
| R-1: el invariante se rompía en la venta de un pedido | bloqueante | la unidad sale con la entrega; la venta de un pedido no la toca (punto 6, H-15) |
| R-2: ajuste, anulación del usado y corrección del IMEI sin regla | bloqueante | la tabla de caminos del punto 6, con su función y su llamador |
| R-3: una línea por unidad chocaba con el `UNIQUE` de producto | bloqueante | una línea por producto con sus unidades en una tabla hija (punto 6, H-14) |
| R-4: `sales → service` y el ciclo de la garantía | bloqueante | `service` emite la venta y `sales` no conoce `service` (puntos 10 y 16) |
| R-5: el ciclo `cash ↔ tradeins` | bloqueante | la anulación del usado la orquesta `cash` (punto 8) |
| R-6: el DNI contradice el ADR 0007 | bloqueante | decidido por el usuario con la recomendación: nota en el ADR 0007 (U-5, punto 14) |
| R-7: el precio de la venta de una reparación | bloqueante | una línea con el total aprobado, con nota al 0019 (punto 10) |
| R-8: el `viewer` ve la permuta en los cobros | medio | decidido por el usuario con la recomendación: límite extendido (U-6, punto 14) |
| R-9: el `viewer` y el técnico | medio | ve la orden sin el técnico (punto 10) |
| R-10: el pendiente del agente no reserva | medio | solicitud sujeta a confirmación (punto 15) |
| R-11: `is_service` sin acotar | medio | sus reglas en el punto 10 |
| R-12: monedas mezcladas | medio | se rechaza o se deriva hasta el 0025 (puntos 6 y 9) |
| R-13: la compra de usados sin comprobante | medio | `trade_in_payments` (punto 8) |
| R-14: `used` antes que el contrato nuevo | medio | `read-v1` y `read-v2` lo excluyen hasta la 29.8 (punto 15) |
| R-15: dónde vive la copia del perfil | medio | la tabla del punto 13 |
| R-16: dependencias implícitas | medio | `tracking` por `inventory`, el origen como clave plana y las dependencias de `appointments` (puntos 6 y 16) |
| R-17: `product_costs` en un producto `unit` | medio | no se escribe, con nota al 0023, punto 5 (punto 6) |
| R-18: H-11 citaba mal el ADR 0016 | bajo | corregido en H-11 |
| R-19: valores de enum por adelantado | bajo | cada valor con su subfase (puntos 3, 4 y 6) |
| R-20: el autor de la activación | bajo | un `admin` nombrado por el script (punto 3) |
| R-21: costos despejables con dos cotizaciones | bajo | el rango redondeado, y el resto como límite (punto 9) |
| R-22: el runbook | bajo | las tres tablas nuevas del cliente (punto 14) |
| R-23: dos consecuencias imprecisas | bajo | la nota de DataModel y la regla 2 de `purchasing-dependencies` (punto 16, §Consecuencias) |
| R-24: el precio y el costo de la unidad sin auditoría | bajo | auditados como `price_change` y `cost_change` (punto 6) |

**El estado documental** que señaló la revisión se corrige con el ADR: el HANDOFF (l.7 y l.24), el Roadmap (las subfases y la frase de las variantes, que vale solo si el ADR se acepta) y Notion.

La verificación de las correcciones contra los hallazgos es **autoevaluación**.

## Lo que este ADR no decide

- el tipo de cambio, la moneda principal y la lectura de infodolar (ADR 0025);
- el recargo de las cuotas;
- la forma de cada contrato con el agente;
- los órdenes de bloqueo de cada operación (cada brief).
