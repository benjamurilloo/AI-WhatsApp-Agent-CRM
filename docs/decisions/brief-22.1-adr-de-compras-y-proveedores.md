---
schema: task-brief.v1
task_id: "22.1"
task_type: design
generated_at: 2026-10-15
---

# Brief 22.1 — ADR de compras y proveedores

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: es la primera subfase de la Fase 22 — Compras y proveedores. El usuario abrió la fase el 2026-10-15, con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3), y aprobó ese día este orden:
  1. **22.1 — ADR de compras y proveedores**;
  2. **22.2 — los proveedores**;
  3. **22.3 — la orden de compra**;
  4. **22.4 — la recepción**, que suma stock y actualiza el costo;
  5. **22.5 — la anulación de la recepción**;
  6. **22.6 — los pagos a proveedores y la cuenta corriente con proveedores**, según lo que decida el ADR (D-8 y D-9).

  De la 22.2 a la 22.6 son provisionales: el ADR fija qué crea cada una y puede unirlas, reordenarlas o sacar la 22.6 de la fase (D-14).
- **No abre ni cierra un gate.** Fija el diseño que implementan las subfases siguientes. La revisión independiente se hace igual (D-15), como en la 19.1, la 20.1 y la 21.1.
- **Estado de este documento**: **aprobado el 2026-10-15** por el usuario, con las recomendaciones de D-1 a D-15. Los pagos a proveedores y la cuenta corriente con ellos entran en la fase (D-8 y D-9, recomendación (a)).

  El proyecto de la fase (`3fa702be6f4e811289acd5ce80642815`, creado con la plantilla «Nuevo Proyecto») y su tarea espejo en el proyecto raíz (`3fa702be6f4e8167aeb7fde039a67f98`) se crearon en Notion el 2026-10-15, con la autorización del usuario. También las seis subfases: la 22.1 (`3fa702be6f4e817c8f7cd3bca79ab5cd`) en «En proceso» y las demás en «Esperando».

## Objetivo

Decidir con un ADR, el **0023**, **qué es una compra en el CRM**:

- qué es un proveedor;
- si hay orden de compra, qué estados tiene y si admite la recepción parcial;
- qué es la recepción, cómo suma stock y cómo actualiza el costo;
- cómo se anula una recepción sin dejar el stock negativo;
- si los pagos a proveedores y la cuenta corriente con ellos entran en la fase, y cómo toca la caja un pago en efectivo;
- el IVA de la compra;
- el número, los nombres, los roles, el agente, los datos personales del proveedor y qué crea cada subfase.

El ADR **no crea tablas**: las crean las subfases siguientes.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-15 contra el código y los documentos de `main` (`6219989`):

- **El perímetro** (Roadmap §Fase 22): «proveedores, órdenes de compra y recepción, que suma stock y actualiza el costo». Los pagos a proveedores no aparecen en esa línea. **El ADR 0022 los dejó fuera de la caja «para la Fase 22 o sin fase»** (punto 1, l. 67), y en el punto 8 dice que **«un gasto no es un movimiento de caja: los pagos son de la Fase 22»**.
- **El ADR 0016**:
  - punto 4: el dinero es `numeric` con moneda; lo que mueve dinero o stock es de solo inserción, y un comprobante emitido se anula con otro; el stock nunca queda negativo; cada fase agrega su módulo, con sus fronteras (da `purchasing` como ejemplo);
  - punto 5: el agente nunca registra un cobro, un pago ni un movimiento de caja;
  - punto 6: los comprobantes son internos, no fiscales.

  *Precisión*: el HANDOFF resume el punto 4 como «un módulo propio y nadie depende de él». **El ADR no dice «nadie depende de él»**: dice «con sus fronteras». Ninguna decisión se apoya en esa frase del HANDOFF (H-7).
- **El ADR 0019**:
  - punto 2: la numeración sin huecos por `(organization_id, tipo)` en `document_counters`, con el contador al final;
  - punto 3: una moneda por comprobante, la de su primera línea, que **copia el precio vigente** del producto; sin tipos de cambio;
  - **punto 5: el costo es lo que el negocio paga por una unidad, con el IVA incluido, lo recupere o no**. Si el negocio es responsable inscripto, el margen pasa a montos netos con la 13.5.2-b;
  - punto 6: la leyenda «Documento no válido como factura».
- **El ADR 0008**: el saldo nunca queda negativo, sin excepción. El ADR 0020, punto 5, suma que **un ajuste negativo no baja el saldo por debajo de lo reservado** (`below_reserved`).
- **El ADR 0020** (el pedido): un compromiso con estado, no un comprobante emitido, con un trigger que fija las columnas que cambian y sus transiciones. La cabecera se bloquea `FOR UPDATE`, y los padres de las claves foráneas, antes del contador (ADR 0021, punto 7).
- **El ADR 0022**: todo lo que mueve dinero toma primero `pg_advisory_xact_lock('cash:' || org)`, porque `crm_app` no puede bloquear filas de solo inserción. La caja es de efectivo, por sesiones y por moneda, y **lo esperado lo calcula `cash`**. La cuenta corriente de clientes se deriva con `imputeAccount` (`cash/imputation.ts`), de la más vieja a la más nueva. **El nombre `payments` quedó reservado para los pagos a proveedores.** Los motivos del retiro de efectivo son una lista cerrada: `change_fund`, `owner_contribution`, `bank_deposit`, `owner_withdrawal`, `correction` y `other` (`cash/schema.ts`).
- **DataModel**:
  - **la regla 14**: «Compras, proveedores y pagos siguen sin modelo»;
  - **§«Explícitamente fuera de este modelo»**: lista `purchases`, `purchase_details`, `suppliers` y `payments`;
  - **§`product_costs`**: el costo vigente es la última fila. La única escritura es `insertProductCost` de `catalog/repository.ts`, vigilada por `tests/guards/cost-writes.test.ts`, y cada cambio se audita como `cost_change`. **Solo la leen los `admin`** (FR-PROD-21), y ninguna lectura de servicio la lee;
  - **§`inventory_movements`**: los tipos son `adjustment_positive`, `adjustment_negative`, `order_delivery`, `sale` y `sale_void`. «Entradas y salidas llegarían con compras y ventas, fuera de alcance, como valores nuevos del enum» (subfase 1.2, D-11). La venta ya lo hizo, y la compra sería la entrada;
  - **§`inventories`**: el saldo físico no cambia nunca sin su movimiento, y cada escritura nueva de `inventory` recibe la transacción del módulo dueño, con el motivo como función, y `stock-writes` fija quién la llama (19.3, 20.3 y 20.4);
  - §`document_counters`: `document_kind` llega hasta `refund_void`.
- **El código**:
  - `src/modules/` tiene `analytics`, `audit`, `auth`, `cash`, `catalog`, `conversations`, `crm`, `ingestion`, `inventory`, `knowledge`, `numbering`, `orders`, `organizations` y `sales`: **no hay ningún módulo de compras ni de proveedores**, y nada en `src/` ni en `eslint.config.mjs` los nombra (la única coincidencia es un caso de `inventory/service.test.ts` que **rechaza** el tipo `purchase` en el ajuste manual);
  - el costo lo cambia `setProductCost` de `catalog/service.ts`, que compara contra el costo que el usuario vio (rechaza con `CONFLICT` si cambió), no escribe si el costo es el mismo, y audita `cost_change`;
  - `numbering/schema.ts`: `document_kind` es `order`, `sale`, `sale_void`, `cash_session`, `receipt`, `receipt_void`, `refund` y `refund_void`;
  - `member_role` es `admin` o `viewer`.
- **Fronteras** (Overview §Reglas de dependencia, releídas con `grep` en esta pasada): un módulo usa otro solo por su `index.ts`; no hay `JOIN` contra tablas ajenas fuera de `analytics`; un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla; una lista con datos de dos módulos se compone en memoria.
- **MetricsCatalog** no tiene ninguna métrica de compras.
- **El boceto de negocio** (notas de Notion de julio de 2026: «Página 1 — Dashboard Compras», «Página 2 — Proveedores»): por su título y su ubicación son, como las de caja de la 21.1, diseños de pantallas **para Airtable** de otro proyecto. Se leen solo como contexto de negocio, y no se toma de ellos ningún diseño.

### Hallazgos

- **H-1. «Recepción» no puede llamarse `receipts`.** En el CRM, `receipts` es el cobro (21.3) y la serie `R` es suya. En inglés, la recepción de mercadería se suele llamar *goods receipt*. El ADR fija nombres que no se confundan con los de `cash`: la tabla, el tipo de `document_kind`, el `entity_type` y el prefijo (D-12).
- **H-2. Los montos de una compra revelan el costo, que es solo de `admin`.** FR-PROD-21 y DataModel §`product_costs` hacen del costo el primer dato que un `viewer` no ve. Una orden de compra o una recepción con sus precios unitarios le mostraría el costo a un `viewer` por otro camino. Es D-11.
- **H-3. La recepción no puede usar `setProductCost` tal como está.** Esa función compara contra el costo que el usuario vio y rechaza con `CONFLICT`, que es la defensa correcta en la ficha del producto. Una recepción fija el costo desde la línea que se recibe, dentro de la transacción de `purchasing`. Hace falta una función de `catalog` que reciba esa transacción, y `cost-writes` tiene que fijar quién la llama, como `stock-writes` (D-5, D-10).
- **H-4. Un costo promedio no se puede calcular con los datos que hay.** El costo promedio ponderado necesita el valor del stock existente, y hoy:
  - parte del stock entró por ajustes manuales, sin costo;
  - el costo vigente puede estar en otra moneda que la compra, y no hay tipos de cambio (ADR 0019, punto 3).

  El último costo no tiene ninguno de los dos problemas (D-5).
- **H-5. Anular una recepción saca stock que pudo venderse o reservarse.** El ADR 0008 y el `CHECK` de `inventories` impiden el saldo negativo, y el ADR 0020, punto 5, impide bajar el saldo por debajo de lo reservado. La anulación tiene que comprobar **lo disponible**, como la venta sin pedido (D-6).
- **H-6. Un pago en efectivo que viva en `purchasing` arma un ciclo con `cash`.** Lo esperado de la sesión lo calcula `cash`, así que `cash` tendría que leer los pagos (`cash` → `purchasing`). Y el pago tendría que escribir en la sesión abierta y tomar el bloqueo `cash:` (`purchasing` → `cash`). Hay tres salidas:
  - los pagos viven en `cash`, que depende de `purchasing` para leer la compra, como depende de `sales` para leer la venta;
  - los pagos viven en `purchasing` y nunca tocan la caja;
  - no hay pagos en la fase.

  Es D-8.
- **H-7. El HANDOFF dice más que el ADR 0016.** «Nadie depende de él» no está en el ADR 0016, punto 4. Si los pagos van a `cash` (H-6), `cash` depende de `purchasing`, y eso no contradice ningún ADR. Se corrige el HANDOFF al cerrar.
- **H-8. La moneda de la compra no puede salir del precio vigente.** El ADR 0019, punto 3, toma la moneda del comprobante del precio vigente de su primera línea. En una compra, el monto de cada línea lo carga la persona: es lo que cobra el proveedor, no el precio de venta. El ADR precisa cómo se elige la moneda de una compra, con una nota fechada en el 0019 (D-4).
- **H-9. Un proveedor puede ser una persona física.** Un monotributista que vende es una persona, con nombre, teléfono y quizás CUIT. El runbook de datos de un cliente cubre clientes, no proveedores. El ADR decide qué datos se guardan y qué pasa si una persona pide los suyos (D-13).
- **H-10. La regla 14 y §«Explícitamente fuera» de DataModel**, que está por encima de los ADR en la jerarquía de `CLAUDE.md`, quedan contradichas al aceptarse el ADR. Se enmiendan con fecha, como hicieron el 0021 y el 0022 (D-15). `purchase_details` sigue la convención de `sale_lines`, no la de la lista.

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:

- **Entran**:
  - el proveedor;
  - la orden de compra y sus estados;
  - la recepción, el stock y el costo;
  - la anulación de la recepción;
  - los pagos a proveedores y la cuenta corriente con ellos, **si el usuario los mete en la fase** (D-8, D-9);
  - el IVA de la compra;
  - el número, los nombres y los comprobantes;
  - las dependencias, los roles, el agente y los datos personales del proveedor;
  - qué crea cada subfase.
- **No entran**:
  - **los gastos que no son compras de mercadería** (alquiler, servicios, sueldos): siguen sin fase;
  - la devolución de mercadería al proveedor y las notas de crédito del proveedor;
  - el costo promedio, la valuación del inventario y los reportes de rentabilidad (sin fase en el Roadmap);
  - la sugerencia de compra por stock mínimo (`products.min_stock` se quitó en la 1.2);
  - las listas de precios de proveedores y la comparación entre ellos;
  - los tipos de cambio, la factura de ARCA, las percepciones, las retenciones y el crédito fiscal;
  - la conciliación bancaria y cualquier integración externa;
  - las métricas de compras.

### D-2 — El proveedor

- **(a) Recomendada**: **una ficha por organización, editable, con borrado lógico** (regla 8), como `clients`, pero **separada de `clients`**.
  - Lleva un nombre obligatorio y, como opcionales, un teléfono, un email y el CUIT (D-7). Sin texto libre que hable de otra persona (D-13).
  - El nombre es único por organización sin distinguir mayúsculas, como `payment_methods`.
  - Solo `admin` la crea, la edita y la desactiva (D-11).
  - **Un proveedor no es un cliente**, aunque tenga el mismo teléfono. No entra en la lista de clientes, en las conversaciones ni en nada que lea el agente.
- (b) Un cliente con una marca de proveedor. Mezcla dos listas con reglas distintas (el teléfono es el identificador del cliente, ADR 0007) y le muestra los proveedores al agente.
- (c) El nombre del proveedor como texto en cada compra. No hay lista, ni cuenta corriente, ni forma de buscar sus compras.

### D-3 — La orden de compra

- **(a) Recomendada**: **la orden de compra es un compromiso con estado, como el pedido** (ADR 0020, punto 3), y **es opcional**: una recepción puede ir con orden o sin ella (D-4).
  - Se crea con un proveedor y sus líneas: el producto, la cantidad y el costo unitario esperado, con una moneda por orden.
  - **Estados**: `open` → `closed`, y `open` → `cancelled`. Un trigger fija las columnas que cambian y las transiciones, como `orders_guard`.
  - **Admite la recepción parcial**: lo recibido de cada línea **se deriva** de sus recepciones vigentes y no se guarda. La orden pasa a `closed` sola cuando se recibió todo, o a mano, «cerrada con faltante».
  - **Se cancela solo si no tiene recepciones vigentes.** Con recepciones, se cierra.
  - **No reserva ni toca el stock.** El stock entra con la recepción.
  - Las líneas son de solo inserción: **la orden no se edita**. Si cambia lo pedido, se cancela y se hace otra.
- (b) Sin orden de compra, solo la recepción. Es lo más simple para un negocio chico, pero el Roadmap la nombra y el usuario aprobó la 22.3. Si el ADR la descarta, la 22.3 sale de la fase.
- (c) La orden de compra con líneas editables mientras está abierta. Suma una auditoría por línea y un estado intermedio para algo que se resuelve cancelando y rehaciendo.

### D-4 — La recepción (H-1, H-8)

- **(a) Recomendada**: **la recepción es un comprobante emitido, de solo inserción**, sin estados (ADR 0019, punto 2).
  - Registra **qué entró, de qué proveedor y a qué costo**: líneas con el producto, la cantidad y el costo unitario **con el IVA incluido** (ADR 0019, punto 5).
  - **Va contra una orden de compra `open` de ese proveedor, o sin orden**, como la venta con pedido o sin él.
  - **Con orden**: cada línea sale de una línea de la orden. **No se recibe más de lo que falta recibir** de esa línea. Lo que llegue de más se registra en una recepción sin orden.
  - **La moneda**: con orden, la de la orden; sin orden, la elige la persona al empezar, de la lista del sistema. Todas las líneas van en esa moneda. Precisa el ADR 0019, punto 3, con una nota fechada (H-8).
  - **Suma stock** con un movimiento de un tipo nuevo de `inventory` por línea (por ejemplo `purchase_receipt`), con el motivo «Recepción RC-000123». Lo escribe una función nueva del servicio de `inventory` que recibe la transacción de `purchasing`, y `stock-writes` la fija a ella y a su llamador. Una entrada **no toca lo reservado**.
  - **Si el saldo nuevo no cabe en `numeric(14, 3)`**, rechaza, como la reposición de la 20.4 (`stock_limit`).
  - **No recibe un producto desactivado**, como el pedido y la venta.
- (b) La recepción como un estado de la orden de compra («recibida»). No admite la recepción parcial ni la recepción sin orden, y el stock entraría por un `UPDATE`.
- (c) La recepción como un ajuste positivo del stock con un motivo. No guarda el proveedor ni el costo, y el ajuste manual no actualiza el costo.

### D-5 — El costo al recibir (H-3, H-4)

- **(a) Recomendada**: **la recepción fija como costo vigente el último costo recibido**, en la moneda de la recepción.
  - Por cada línea, si el costo unitario o la moneda difieren del costo vigente del producto, **inserta una fila nueva en `product_costs`** y la audita como `cost_change`, con la recepción como origen. Si es igual, no escribe, como `setProductCost`.
  - **Si dos líneas de la misma recepción traen el mismo producto**, gana la última, y el ADR fija cuál es la última.
  - **Lo escribe una función nueva de `catalog`** que recibe la transacción de `purchasing`, sin la comparación optimista de la ficha. `cost-writes` pasa a fijar las funciones que escriben y quién las llama.
  - **Si la moneda de la recepción no es la del precio de venta**, el producto queda sin margen, como dice el ADR 0019, punto 5. La pantalla de la recepción lo advierte antes de emitir.
  - **Anular la recepción no restaura el costo** (D-6): el historial de costos es de solo inserción, y el costo anterior puede no ser el correcto. El `admin` lo corrige en la ficha si hace falta.
- (b) El costo promedio ponderado. No se puede calcular sin la valuación del stock existente ni con monedas distintas (H-4).
- (c) La recepción no toca el costo, y el `admin` lo actualiza a mano. Contradice la línea del Roadmap («actualiza el costo»).
- (d) Preguntar en cada recepción si se actualiza el costo. Suma una decisión por línea que casi siempre se responde igual. Se puede sumar después, si el uso lo pide.

### D-6 — La anulación de la recepción (H-5)

- **(a) Recomendada**: **se anula entera con otro comprobante**, a lo sumo una vez (`UNIQUE`), con montos y cantidades positivos y un motivo de una lista cerrada, como `sale_voids`.
  - **Saca del stock lo que la recepción sumó**, con un movimiento de otro tipo nuevo por línea (por ejemplo `purchase_receipt_void`), escrito por una función nueva de `inventory` que fija `stock-writes`.
  - **Comprueba lo disponible, no el saldo**: si sacar la cantidad dejaría el saldo por debajo de lo reservado o en negativo, rechaza y dice qué productos no alcanzan (ADR 0008; ADR 0020, punto 5). No hay anulación parcial.
  - **No restaura el costo** (D-5).
  - **Si la recepción tenía orden**, lo recibido de la orden deja de contarla. Una orden `closed` sola **no se reabre**: el `admin` hace otra.
  - **Si D-8 entra**: la recepción anulada deja de sumar a la deuda con el proveedor, y lo pagado contra ella pasa a la cuenta del proveedor (D-9), como la venta anulada en el ADR 0022, punto 6.
- (b) La anulación parcial, por línea. Suma un comprobante por línea y una regla para la orden.
- (c) Permitir el saldo negativo al anular. Contradice el ADR 0008.

### D-7 — El IVA de la compra

- **(a) Recomendada**: **la compra no discrimina el IVA.** El costo unitario se carga con el IVA incluido para cualquier condición (ADR 0019, punto 5), como la venta no lo discrimina (ADR 0021, punto 11).
  - La condición del negocio y el crédito fiscal siguen esperando a la 13.5.2-b.
  - **El CUIT del proveedor** es un campo opcional de la ficha, validado por su forma (once dígitos y el dígito verificador), y **no se usa en ningún cálculo**. Si el usuario prefiere no guardarlo hasta que una fase lo use, sale de D-2.
- (b) Guardar el neto, la alícuota y el IVA por línea desde ahora. Exige la condición del negocio, que no se conoce.

### D-8 — Los pagos a proveedores y la caja (H-6)

- **(a) Recomendada**: **entran en la fase, al final (22.6), y viven en `cash`.**
  - **El pago es un comprobante emitido de solo inserción**, contra **una recepción** o **a cuenta del proveedor**, en un medio de pago de `payment_methods`, con la moneda del destino. Se anula con otro comprobante.
  - **Un pago en efectivo sale de la sesión abierta de esa moneda**, y no la deja por debajo de cero (ADR 0022, punto 8). Lo esperado suma un término: «− pagos en efectivo + pagos en efectivo anulados en la sesión».
  - **Toma el bloqueo `cash:`** primero y el contador al final, como todo lo de `cash`.
  - **`cash` depende de `purchasing`** para leer la recepción, su proveedor y si está anulada. **`purchasing` no depende de `cash`.** El pago en el detalle de la recepción lo compone la página, como el cobro en el detalle de la venta.
  - **El nombre**: el ADR 0022 reservó `payments` para estos pagos. Se recomienda **`supplier_payments`**, que no se confunde con «medios de pago» (`payment_methods`), y el ADR lo dice.
- (b) **Entran y viven en `purchasing`, sin tocar la caja.** Un pago en efectivo no sale del arqueo, y la caja daría una diferencia por cada uno. Tampoco se puede corregir con un retiro, porque el pago ya lo registró.
- (c) **No entran: quedan sin fase.** La 22.6 sale de la fase. Un pago en efectivo se registra como un retiro de caja con el motivo `other`, sin proveedor ni comprobante, y lo que se debe a cada proveedor no se ve en el CRM.

### D-9 — La cuenta corriente con proveedores

Solo si D-8 es (a) o (b).

- **(a) Recomendada**: **una cuenta derivada, sin tabla de saldos**, como la de clientes (ADR 0022, punto 9).
  - **Lo que se le debe a un proveedor**: sus recepciones vigentes, menos los pagos vigentes.
  - **Un pago a cuenta** se imputa de la recepción más vieja a la más nueva, con la misma regla pura que los clientes (`imputeAccount`), si sirve sin cambios. Si no sirve, el ADR dice por qué.
  - **Lo pagado de más es un saldo a favor** del negocio frente al proveedor (un anticipo).
  - **Pantallas**: el estado de cuenta del proveedor y la lista de proveedores a los que se les debe. Sin vencimientos ni intereses.
- (b) Solo pagos contra una recepción, sin cuenta. No cubre el anticipo ni el pago de varias recepciones juntas, que son habituales con un proveedor.
- (c) Una tabla de movimientos con saldo corrido. Duplica lo que dicen las recepciones y los pagos, como la alternativa (b) del ADR 0022, punto 9.

### D-10 — El módulo, las dependencias y el orden de bloqueo (H-3, H-6)

**Recomendada**:

- **Un módulo nuevo, `purchasing`** (el nombre del ADR 0016, punto 4), dueño de los proveedores, las órdenes de compra, las recepciones y sus anulaciones.
- **`purchasing` depende de**:
  - `catalog`, para leer y bloquear los productos y para escribir el costo (D-5);
  - `inventory`, para la entrada y la salida del stock (D-4, D-6);
  - `numbering`, `organizations` y `audit`;
  - `auth`, solo en `schema.ts`, para el autor.
- **Ni `catalog` ni `inventory` dependen de `purchasing`.** Las recepciones en la ficha del producto las compone la página.
- **Si D-8 es (a)**, `cash` depende de `purchasing`, y no al revés.
- **El orden de bloqueo de una recepción**:
  1. la cabecera de la orden de compra, `FOR UPDATE`, si hay orden;
  2. el proveedor en modo compartido;
  3. los productos en modo compartido, ordenados por id;
  4. los saldos, ordenados por producto, dentro de `inventory`;
  5. el contador, al final (ADR 0021, punto 7).

  El ADR lo verifica contra los privilegios de `crm_app`: **la recepción es de solo inserción y no se puede bloquear** (lo mismo que H-3 del brief-21.1). La anulación de una recepción se serializa con el `UNIQUE` y una segunda comprobación con los bloqueos tomados, como la 20.4. El ADR dice si hace falta además un `pg_advisory_xact_lock` por organización.
- `purchasing` entra en la lista de módulos de dominio de `eslint.config.mjs` y del Overview.

### D-11 — Roles y agente (H-2)

**Recomendada**:

- **Solo un `admin`** ve y opera las compras: los proveedores, las órdenes, las recepciones, sus anulaciones y, si entran, los pagos y la cuenta del proveedor.
- **Un `viewer` no ve nada de compras**, porque los montos revelan el costo (H-2). Ve el efecto en el stock y el movimiento en el historial del producto, **con el motivo pero sin el costo**.
- **El agente no lee ni registra compras, proveedores, costos ni pagos** (ADR 0016, punto 5). Lee el stock que las recepciones suman, por `read-v1` y `read-v2`, **sin cambio de contrato**. Ningún aviso al agente.

### D-12 — El número, los nombres y el comprobante entregable (H-1)

**Recomendada**:

- **Llevan número**, cada uno con su tipo en `document_kind` y su prefijo:
  - la orden de compra (por ejemplo `OC-000123`);
  - la recepción (por ejemplo `RC-000123`), **nunca `R`**, que es del cobro;
  - la anulación de la recepción (por ejemplo `ARC-000123`);
  - y, si D-8 entra, el pago (por ejemplo `PP-000123`) y su anulación.
- **Nombres**: tablas `suppliers`, `purchase_orders` y `purchase_order_lines`, `goods_receipts` y `goods_receipt_lines`, `goods_receipt_voids` y, si D-8 entra, `supplier_payments` y `supplier_payment_voids`. **`purchases` y `purchase_details` no van a existir con esos nombres** (H-10). El ADR puede cambiarlos, siempre que ninguno use `receipt` sin calificar.
- **La orden de compra es una página imprimible**: se le manda al proveedor. La recepción y el pago también, con la leyenda «Documento no válido como factura». Sin texto libre en ninguno de los tres.
- **El número del remito o de la factura del proveedor**: el ADR decide si la recepción guarda la referencia del documento del proveedor, como un texto corto validado y sin datos personales. Recomendado: **sí, opcional**, porque es lo que el negocio usa para conciliar con el proveedor.

### D-13 — Los datos personales del proveedor (H-9)

**Recomendada**:

- La ficha guarda **lo mínimo**: nombre, teléfono, email y CUIT, todos menos el nombre opcionales, sin notas libres.
- **Un proveedor con compras no se borra: se desactiva** (regla 8). Si una persona pide sus datos, el ADR decide entre:
  - **vaciar la ficha**: el nombre pasa a un marcador y los contactos a nulo, con el mismo criterio de una sola dirección que los clientes (ADR 0015);
  - o dejarlo para cuando un caso lo pida.

  Recomendado: **dejar escrito el vaciado en el ADR y construirlo cuando haga falta**, con una nota en el runbook de datos de un cliente que diga que no cubre a los proveedores.
- Las órdenes, las recepciones y los pagos no copian datos del proveedor: lo nombran por su clave.

### D-14 — Qué crea cada subfase

**Recomendada**, sujeta a lo que se decida arriba:

| Subfase | Crea |
|---|---|
| **22.2 — Los proveedores** | el módulo `purchasing`, `suppliers` con su lista, su alta, su edición y su desactivación, y `purchasing` en `eslint.config.mjs` |
| **22.3 — La orden de compra** | `purchase_orders` y `purchase_order_lines`, su tipo de `document_kind`, el trigger de estados, la creación, la cancelación, el cierre a mano y la página imprimible |
| **22.4 — La recepción** | `goods_receipts` y `goods_receipt_lines`, su tipo, el movimiento de entrada en `inventory`, la escritura del costo en `catalog`, `stock-writes` y `cost-writes` extendidas, el cierre automático de la orden y la página imprimible |
| **22.5 — La anulación de la recepción** | `goods_receipt_voids`, su tipo y su motivo, el movimiento de salida en `inventory` y la comprobación de lo disponible |
| **22.6 — Los pagos y la cuenta del proveedor** | solo si D-8 entra: `supplier_payments` y su anulación en `cash`, el término nuevo de lo esperado en la caja, el estado de cuenta y la lista de proveedores a los que se les debe |

### D-15 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes de pedir la aceptación, como en la 21.1. La hace un agente de solo lectura contra:
  - este brief;
  - los ADR 0008, 0013, 0015, 0016, 0019, 0020, 0021 y 0022;
  - DataModel, Overview, Roadmap, Scope, FR-PROD-20 y FR-PROD-21, y el runbook de datos de un cliente;
  - `src/modules/catalog/`, `src/modules/inventory/`, `src/modules/cash/`, `src/modules/numbering/` y las guardas `stock-writes`, `cost-writes` y `counter-writes`.
- **Cuándo cierra**: cuando el ADR esté aceptado o rechazado y estén escritas sus enmiendas, con fecha y conservando el texto anterior. Como mínimo:
  - **DataModel**: la regla 14, §«Explícitamente fuera de este modelo» (una nota de diseño con las tablas que vienen, sin tablas), §`product_costs` (quién más escribe el costo), §`inventory_movements` (los tipos nuevos) y §`document_counters`;
  - **Overview**: §Evolución hacia ERP;
  - **el ADR 0019**: una nota fechada por el punto 3 (H-8) y el punto 5, si el ADR lo precisa;
  - **el ADR 0022**: una nota fechada por el nombre `payments` y por lo esperado de la caja, si D-8 entra;
  - **Scope** §Después de la integración: los gastos que no son compras y lo demás que quede fuera;
  - **Roadmap** §Fase 22, con las subfases;
  - **`docs/decisions/README.md`**: el ADR 0023 y este brief;
  - **HANDOFF**: la frase de H-7.

  La revisión independiente puede encontrar más, como en la 20.1 y la 21.1.

## Alcance incluido

- `docs/decisions/0023-compras-y-proveedores.md`, nuevo, y este brief;
- la entrada del Roadmap §Fase 22 con el orden aprobado el 2026-10-15;
- con el ADR aceptado, las enmiendas de D-15;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md` y la tarea de Notion.

## Alcance excluido

- **Código, migraciones, tablas, dependencias y cambios en la forma de un contrato.** Las tablas son de la 22.2 en adelante.
- Los gastos que no son compras de mercadería.
- La devolución de mercadería al proveedor y sus notas de crédito.
- El costo promedio, la valuación del inventario y los reportes de rentabilidad.
- Los tipos de cambio, la factura de ARCA, las percepciones, las retenciones y el crédito fiscal.
- La conciliación bancaria y cualquier integración externa.
- Las métricas de compras.
- Cambios en el agente o en su repositorio, y avisos al agente.

## Fuentes de verdad

- ADR 0008, 0013, 0015, 0016, 0019, 0020, 0021 y 0022.
- DataModel §Reglas de diseño, §`product_costs`, §`inventories`, §`inventory_movements`, §`document_counters`, §`orders`, §`sale_voids`, §`cash_movements`, §`receipts` y §«Explícitamente fuera de este modelo».
- Overview §Módulos, §Reglas de dependencia y §Evolución hacia ERP.
- Roadmap §Fase 22 y «Sin fase todavía»; Scope.
- FR-PROD-20 y FR-PROD-21; el runbook de datos de un cliente.
- `src/modules/catalog/`, `src/modules/inventory/`, `src/modules/cash/`, `src/modules/numbering/` y las guardas de escrituras.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **Un comprobante emitido no se edita ni se borra**: se anula con otro (ADR 0016, punto 4; ADR 0019, punto 2).
3. **El dinero no pasa nunca por un `number`**, y los montos no son negativos.
4. **El stock nunca queda negativo ni por debajo de lo reservado**, tampoco al anular una recepción (ADR 0008; ADR 0020, punto 5).
5. **El saldo físico no cambia nunca sin su movimiento**, y cada escritura de stock la fija `stock-writes` (DataModel, regla 11).
6. **Ni `catalog`, ni `inventory`, ni `sales`, ni `orders`, ni `crm` dependen de `purchasing`**, y ningún `JOIN` cruza módulos. Si los pagos van a `cash`, `purchasing` no depende de `cash`.
7. **El costo sigue siendo solo de `admin`**: ninguna pantalla de `viewer` ni ninguna lectura de servicio lo muestra por el camino de las compras. *Precisado el 2026-10-15 por decisión del usuario (revisión independiente, R-1)*: el arqueo de la caja puede dejar inferirlo, y es un límite aceptado (ADR 0023, punto 12).
8. **El agente no lee ni registra compras, proveedores, costos ni pagos**, y lo que el agente lee y escribe no cambia de forma (ADR 0014; ADR 0016, punto 5).

## Criterios de aceptación

- **AC-1**: el ADR 0023 responde de D-2 a D-14, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR fija qué es la recepción, cómo suma stock y cómo actualiza el costo, con la función que escribe cada cosa y quién la llama (H-3), y por qué no se usa un costo promedio (H-4).
- **AC-3**: el ADR fija la orden de compra, sus estados y la recepción parcial, sin un camino que reciba más de lo pedido contra una orden ni cuente una recepción dos veces.
- **AC-4**: el ADR fija la anulación de la recepción sin un camino que deje el stock negativo o por debajo de lo reservado (H-5), y qué pasa con el costo y con la orden.
- **AC-5**: el ADR fija si los pagos a proveedores y la cuenta corriente entran en la fase y, si entran, cómo toca la caja un pago en efectivo, sin ciclos entre `cash` y `purchasing` (H-6).
- **AC-6**: el ADR fija las dependencias de `purchasing` y el orden de bloqueo de la recepción y de su anulación, verificado contra los privilegios de `crm_app` y no supuesto.
- **AC-7**: el ADR fija quién ve los montos de una compra sin que un `viewer` vea el costo (H-2), y que el agente no cambia.
- **AC-8**: el ADR fija los nombres y los prefijos sin chocar con los de `cash` (H-1), y qué crea cada subfase, sin crear ninguna tabla en la 22.1.
- **AC-9**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado contra el código o el documento citado.
- **AC-10**: con el ADR aceptado, las enmiendas están escritas, fechadas, conservan el texto anterior y no contradicen al ADR.
- **AC-11**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato con el agente, o enmendar el texto de un ADR aceptado o una prohibición de `CLAUDE.md`. Una nota fechada no es enmendar el texto;
- una decisión obliga a `catalog`, `inventory`, `sales`, `orders`, `crm` o `numbering` a depender de `purchasing`, o arma un ciclo entre `cash` y `purchasing`;
- una decisión necesita una dependencia nueva;
- hace falta tocar un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cada commit y push;
- lanzar la revisión independiente si el usuario cambia una decisión que afecta su alcance;
- el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0023-compras-y-proveedores.md`, escrito el 2026-10-15 como **propuesto**. Nivel: diseñado. Al escribirlo se precisaron tres puntos de este brief, por autoevaluación:

- **D-5**: dos líneas del mismo producto no pueden darse, porque las reglas de línea compartidas rechazan un producto repetido (`duplicate_product`). Una recepción fija a lo sumo un costo por producto.
- **D-9**: `imputeAccount` sirve sin cambiar la regla. Una recepción tiene los campos de una venta en la cuenta, y un pago, los de un cobro contra una venta o a cuenta.
- **D-13**: vaciar la ficha de un proveedor exige también vaciar sus entradas de auditoría, y el trigger de `audit_logs` solo lo admite para clientes (`drizzle/0025`). El ADR deja el vaciado diseñado y la extensión del trigger como una decisión propia.

### Revisión independiente (D-15, AC-9)

La hizo el 2026-10-15 un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, `CLAUDE.md`, los ADR 0016, 0019, 0020, 0021 y 0022, DataModel, Overview, Roadmap, Scope, FunctionalRequirements, el runbook de datos de un cliente y el código de `catalog`, `inventory`, `cash`, `numbering`, `sales`, `src/shared/lines/`, las guardas y las migraciones. Fijó la escala antes de mirar. No leyó enteros los ADR 0008, 0013 y 0015, ni el texto de PostgreSQL.

**Veredicto: R1**, con 10 hallazgos (2 bloqueantes, 3 medios y 5 bajos) y 10 notas. Encontró sólidos: que `imputeAccount` sirve sin cambiar la regla (N-1), la fórmula de lo esperado (N-2), la ausencia de ciclos en la recepción (N-3), que la anulación no deja el stock negativo ni bajo lo reservado con concurrencia (N-4), que no se recibe más de lo pedido (N-5), la serialización del costo (N-6), los nombres y prefijos (N-7) y las afirmaciones de §Contexto sobre el código (N-8).

Cada hallazgo se verificó contra la fuente citada antes de aceptarlo, y los diez se confirmaron:

- **R-1, bloqueante**: un `viewer` ve el arqueo con lo esperado por moneda (ADR 0022, punto 12; FR-CAJ-06), y de ahí puede despejar lo pagado en efectivo a un proveedor y, con una recepción de un solo producto, su costo. **Decisión del usuario del 2026-10-15: aceptarlo como límite**, escrito en el ADR (punto 12, §Alternativas, §Riesgos) y en el invariante 7 de este brief. FR-PROD-21 se precisa al aceptar el ADR.
- **R-2, bloqueante**: la anulación de una recepción bloqueaba saldos sin bloquear antes los productos, contra el ADR 0021, punto 7. **Corrección**: bloquea los productos en modo compartido, por id y sin mirar si están activos, antes de los saldos, como `voidSale` (`sales/service.ts:606`).
- **R-3, medio**: a un proveedor desactivado no se le podía pagar. **Corrección**: recibe pagos, como un cliente desactivado se cobra (brief-21.6, D-3).
- **R-4, medio**: §Riesgos proponía un aporte para todo pago en efectivo anulado con la sesión cerrada, que contaría la plata dos veces si el pago no se hizo. **Corrección**: los dos casos, separados.
- **R-5, medio**: faltaban enmiendas: FR-PROD-19, FR-CAJ-04 a 06, la nota del ADR 0016 por la cuenta corriente, los puntos 4 y 12 del ADR 0022, y DataModel §`inventories`, §`audit_logs` y las reglas 8 y 10. Agregadas a §Consecuencias.
- **R-6 a R-10, bajos**:
  - el contador se toma al armar el motivo, dentro del paso de los saldos;
  - la anulación de una recepción con orden bloquea primero la cabecera, para no cruzarse con el cierre de la orden;
  - el orden de bloqueo de la orden de compra y de la edición del proveedor, y el proveedor activo en la comprobación de la recepción;
  - los privilegios de `purchase_orders` y dos precisiones de §Contexto;
  - la alternativa D-6 (c) y las reglas de línea `zero_total` y `amount_too_large`.

**Una corrección cambia una decisión aprobada**: R-3 (D-2, el proveedor desactivado recibe pagos). R-1 suma un límite que decidió el usuario. Las demás completan el ADR sin cambiar ninguna recomendación. Una nota fuera de alcance: `.claude/settings.json`, sin seguimiento, es conocido y nunca entra en un commit.

## Cierre

- **2026-10-15**: el usuario **aceptó el ADR 0023** con las correcciones de la revisión independiente, incluidas R-1, que eligió aceptar como límite, y R-3, que cambia D-2. AC-11 cumplido.
- **Enmiendas escritas ese día, con fecha y conservando el texto anterior** (AC-10):
  - DataModel: la regla 14, §`product_costs`, §`inventories`, §`inventory_movements`, §`document_counters`, §`audit_logs` y la nota de §«Explícitamente fuera de este modelo»;
  - FunctionalRequirements: FR-PROD-19, FR-PROD-21 y FR-CAJ-04 a FR-CAJ-06;
  - Overview §Evolución hacia ERP;
  - Scope (§Sigue fuera);
  - el Roadmap §Fase 22 (la 22.1 cerrada) y «Sin fase todavía»;
  - las notas de los ADR 0016, 0019 y 0022;
  - el runbook de datos de un cliente;
  - el README de decisiones, el CHANGELOG y el HANDOFF (con la frase de H-7).

  Las reglas 8 y 10 de DataModel, las filas del Overview, `eslint.config.mjs`, los comentarios de los `index.ts` y las guardas las enmienda la subfase que crea cada tabla o cada función (ADR 0023, §Consecuencias).
- **Nivel**: diseñado. No hay código, tablas, migraciones ni cambios en la forma de ningún contrato. El agente no recibe ningún aviso.
- **Revisión**: la del ADR fue independiente (§Resultados). La verificación de las enmiendas contra el ADR es autoevaluación.
- **Siguiente**: el brief de la 22.2, los proveedores.
