---
schema: task-brief.v1
task_id: "19.1"
task_type: design
generated_at: 2026-10-11
---

# Brief 19.1 — ADR del pedido

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: primera subfase de la Fase 19 — Pedidos, abierta el 2026-10-11 por decisión del usuario con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3). Orden aprobado por el usuario ese día: **19.1 — ADR del pedido**; **19.2 — el pedido** (tablas, alta, lista, detalle y cancelación de un pendiente, sin tocar el stock); **19.3 — la reserva y el ciclo** (confirmar, cancelar un confirmado, entregar y ajustes que respetan lo reservado); **19.4 — el pedido desde el agente**, solo si el agente confirma que lo usaría.
- **No abre ni cierra un gate.** Fija el diseño que van a implementar la 19.2 a la 19.4; la revisión independiente se recomienda (D-11).
- **Estado de este documento**: **aprobado el 2026-10-11** por el usuario, con las recomendaciones de D-1 a D-12. La tarea 19.1 (`3f6702be6f4e816ea547f449df0e1ab2`) está en «En proceso» en Notion desde ese día, con la aprobación del orden.

## Objetivo

Decidir, con un ADR (el **0020**), **qué es un pedido en el CRM**: su número, sus estados, qué se guarda y qué no cambia nunca, **cuándo reserva stock y cuándo lo descuenta**, quién lo opera, qué ve el agente y qué pasa con los datos de un cliente. El ADR **no crea tablas**: las crean la 19.2 y la 19.3.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-11:

- **El perímetro**: el Roadmap §Fase 19 pide «el pedido de un cliente, con sus líneas, su total y sus estados (pendiente, confirmado, entregado, cancelado), y la reserva de stock, que nunca lo deja negativo» y deja a esta fase decidir si el agente puede dejar un pedido pendiente.
- **El ADR 0019** fija la numeración sin huecos por `(organization_id, tipo)` con una fila `FOR UPDATE`, una moneda por comprobante tomada de la primera línea, el rechazo de una línea sin precio o en otra moneda, los montos copiados al emitir y el redondeo por línea a los decimales de la moneda, con el medio hacia afuera del cero. **Deja abierto** si un pedido numerado es un comprobante emitido (§Lo que este ADR no decide).
- **El ADR 0008**: el saldo nunca queda negativo, sin excepciones. Su §Consecuencias dice que un compromiso de entrega se modela «como una entidad propia (reserva o pedido pendiente)», no relajando el `CHECK`.
- **El ADR 0013** tiene tres categorías de tabla: común, de solo inserción con trigger, y la de `ingestion_events` (con `UPDATE` de su estado y un trigger que protege su identidad).
- **El ADR 0016, punto 4**: lo que mueve dinero o stock es de solo inserción, y un comprobante emitido no se edita, se anula con otro. **Punto 5**: el agente nunca registra un cobro; un pedido pendiente del agente, con su propio contrato.
- **`inventories`** tiene solo `quantity_on_hand`, con `CHECK (>= 0)`. `inventory_movements` solo admite `adjustment_positive` y `adjustment_negative`; la 1.2 (D-11) dejó dicho que «entradas y salidas llegarían con compras y ventas, como valores nuevos del enum». Solo `lockBalance` y `applyStockChange` escriben esas tablas (guarda `stock-writes`). `adjustStock` es solo para `admin`, bloquea el producto y después el saldo, y solo comprueba que el saldo no quede negativo.
- **El estado de stock** lo deriva `deriveStockStatus` de `catalog` a partir de `quantity_on_hand` y del punto de reposición.
- **`read-v1`**: `GET /products/{id}/stock` devuelve `quantity_available`, que **hoy es `quantity_on_hand`** (`getProductStockForService`), y cada producto lleva `stock_status`. §Versionado: cambiar una regla de cálculo exige v2.
- **Fronteras** ([Overview](../architecture/Overview.md) §Reglas de dependencia, releídas con `grep`): un módulo no hace `JOIN` contra tablas ajenas; **un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla y la pasa a los demás**, que la exigen por tipo (`DbTransaction`); `recordAudit(tx, entry)` solo acepta una transacción. El ADR 0016, punto 4, nombra el módulo `orders`.
- **Datos de un cliente** ([runbook](../runbooks/datos-de-un-cliente.md)): la ficha no se borra si tiene mensajes (`RESTRICT`); se vacía. La exportación y el vaciado alcanzan cada tabla con datos de la persona.

### Hallazgos

- **H-1. El Roadmap se contradice entre la Fase 19 y la 20.** El pedido tiene un estado «entregado» (Fase 19), y la Fase 20 dice que la venta «confirma un pedido o se registra sola, **descuenta el stock**». Si un pedido entregado no descuenta, la mercadería sale del local y el saldo no baja hasta la Fase 20. El ADR tiene que decidir quién descuenta (D-4) y enmendar el Roadmap.
- **H-2. «Disponible» va a dejar de ser igual al saldo físico.** Con reservas, lo que se puede ofrecer es el saldo menos lo reservado. `read-v1` ya llama `quantity_available` al saldo físico, y el `stock_status` que ve el agente se deriva de ese saldo. Cambiar el cálculo es cambiar una regla del contrato (§Versionado).
- **H-3. Un ajuste negativo puede dejar el saldo por debajo de lo reservado**, y entonces un pedido confirmado no se puede entregar sin romper el ADR 0008. Hoy `adjustStock` no lo impide porque no hay reservas.
- **H-4. Confirmar un pedido bloquea varios saldos a la vez.** Dos confirmaciones simultáneas con los mismos productos en distinto orden pueden trabarse entre sí (deadlock) si el orden de bloqueo no es fijo.

## Decisiones

Cada una trae una recomendación, ya presentada al usuario el 2026-10-11 junto con el orden. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:
- **Entran**: el número, la naturaleza del pedido frente al comprobante, sus estados y transiciones, qué se guarda al crearlo, la reserva y la salida de stock, los ajustes frente a lo reservado, los roles, el agente, los datos de un cliente y qué crea cada subfase.
- **No entran**: la venta y su comprobante interno (Fase 20), los cobros y las señas (Fase 21), las zonas y los costos de envío, la dirección de entrega, los descuentos y las listas de precios. **La forma** del contrato del agente se diseña en la 19.4, con él.

### D-2 — El número

- **(a) Recomendada**: **sí lleva número**, con el contador del ADR 0019, punto 2, tipo `order`, prefijo **`P`** y seis dígitos (`P-000123`). Se asigna **al crear el pedido**, también si queda pendiente, y no se reutiliza: un pedido cancelado conserva su número. Así la serie no tiene huecos aunque haya cancelados. El contador lo crea la 19.2 (ADR 0019, punto 7).
- (b) Número al confirmar. Los pendientes no tendrían cómo nombrarse ante el cliente («tu pedido P-…»), y un pendiente del agente no tendría referencia.
- (c) Sin número: el UUID. El ADR 0019 ya lo descartó: no se le dicta a un cliente.

### D-3 — El pedido no es un comprobante emitido

- **(a) Recomendada**: el pedido es un **compromiso con estado**, no el comprobante del ADR 0019 (ese es el de la venta, Fase 20). Su forma:
  - **la cabecera** (`orders`) es una **cuarta categoría** del ADR 0013, como `ingestion_events`: `crm_app` con `SELECT`, `INSERT` y `UPDATE`, **sin `DELETE`**, y un trigger que rechaza con `P0001` todo cambio que no sea **el estado y sus marcas de tiempo**: número, organización, cliente, moneda, total, autor y fecha de alta quedan fijos;
  - **las líneas** (`order_lines`) son **de solo inserción**, con trigger: producto, cantidad, precio unitario, moneda y total de la línea, copiados al crear el pedido;
  - **los montos se copian al crear el pedido y no se recalculan**, ni al confirmar ni al entregar. Se aplican los puntos 3 y 4 del ADR 0019 con «emitir» leído como «crear»: una moneda por pedido, la de la primera línea; se rechaza una línea sin precio, en otra moneda o de un producto inactivo; redondeo por línea; el total es la suma;
  - **no se editan las líneas**: para cambiar un pedido, se cancela y se crea otro;
  - **un pedido nunca se borra**; cada transición se audita (`entity_type` nuevo `order`, valor aditivo del enum).
- (b) El pedido como comprobante emitido, de solo inserción, con cada cambio de estado como una fila nueva. Más fiel al ADR 0016, punto 4, pero el estado vigente sale de la última fila (como el precio) y cada lista lo recalcula. El dinero no se mueve en un pedido, así que el punto 4 no lo exige.
- (c) Volver a cotizar al confirmar. El cliente aceptó un precio; si cambia entre el alta y la confirmación, el pedido diría otra cosa.

### D-4 — Estados y stock

- **(a) Recomendada**:
  - **Estados**: `pending → confirmed → delivered`, y `cancelled` desde `pending` o desde `confirmed`. `delivered` y `cancelled` son finales. Ninguna otra transición.
  - **Un pendiente no toca el stock.** Confirmar **reserva** cada línea; cancelar un confirmado **libera** la reserva; entregar **libera la reserva y registra la salida física**.
  - **La reserva** es una columna `quantity_reserved` de `inventories`, `numeric(14, 3)`, con `CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)`. Así **el saldo nunca queda negativo, ni lo reservado por encima del saldo**: el ADR 0008 se cumple sin excepciones. Confirmar se rechaza con `BUSINESS_RULE_VIOLATION` si alguna línea pide más que `quantity_on_hand − quantity_reserved`, con el disponible de cada línea.
  - **La salida física es un movimiento** de `inventory_movements` con un **tipo nuevo**, `order_delivery`, valor aditivo del enum, como lo había previsto la 1.2 (D-11). El motivo lleva el número del pedido. **Sin clave foránea al pedido**: `inventory` no depende de `orders`.
  - **Reservar y liberar no son movimientos**: no cambian el saldo físico, y `balance_after` sigue siendo la cadena del saldo físico. La traza de una reserva es la auditoría del pedido.
  - **Resuelve H-1**: en la Fase 19, **entregar descuenta el stock**. La venta de la Fase 20 se vincula al pedido entregado y no vuelve a descontar; una venta sin pedido descuenta sola. Se enmienda el Roadmap §Fase 20.
  - **Las escrituras**: `orders` abre la transacción (dueño de la regla) y la pasa a funciones nuevas de `inventory` (reservar, liberar y entregar), que son las únicas que escriben `quantity_reserved` o el tipo nuevo. La guarda `stock-writes` se extiende a ellas.
  - **El orden de bloqueo** (H-4): primero la cabecera del pedido `FOR UPDATE`, después los saldos de sus productos **ordenados por `product_id`**. Un ajuste manual bloquea un solo saldo y no cambia su orden.
- (b) Reservar al crear, también los pendientes. Un pendiente que nadie confirma, sobre todo uno del agente, bloquea stock sin que una persona lo haya aceptado.
- (c) Entregar sin descontar, y descontar con la venta (Fase 20). Deja el saldo físico mal entre la entrega y la venta, y obliga a la Fase 20 a existir para que el stock sea correcto.
- (d) La reserva como derivada (suma de líneas confirmadas) en lugar de una columna. Sin una columna no hay `CHECK`: el invariante quedaría solo en la aplicación, y cada lectura de stock tendría que leer los pedidos, que es un `JOIN` entre módulos o una dependencia de `inventory` hacia `orders`.

### D-5 — Los ajustes de stock frente a lo reservado (H-3)

**Recomendada**: un ajuste negativo que dejaría `quantity_on_hand` por debajo de `quantity_reserved` se rechaza con `BUSINESS_RULE_VIOLATION` y una regla nueva (`below_reserved`), informando el saldo, lo reservado y la cantidad pedida. El `CHECK` de D-4 es la última defensa. Para corregir un faltante real con pedidos confirmados, primero se cancela el pedido que no se puede cumplir. **No enmienda el ADR 0008**: lo aplica a una cantidad más.

### D-6 — Lo que ven las pantallas y el agente (H-2)

**Recomendada**:
- **Pantallas del CRM** (19.3): muestran saldo físico, reservado y disponible. **El estado de stock** (`disponible`, `bajo_stock`, `sin_stock`) **pasa a derivarse del disponible**, porque es lo que se puede ofrecer.
- **`read-v1`**: hasta la 19.4, **el agente sigue leyendo el saldo físico** como hoy. En la 19.3, con reservas reales, la lectura de servicio conserva su regla actual. **La 19.4 decide con el agente** si `quantity_available` y el `stock_status` del agente pasan a descontar lo reservado (v2 de la ruta, o un acuerdo escrito con el agente de que la semántica de «disponible» es esa), con su aviso.
- **Límite aceptado mientras tanto**: entre la 19.3 y la 19.4 el agente puede decir que hay stock de unidades reservadas. Hoy no hay un negocio real con pedidos (13.5.2-b), así que el límite no alcanza a ningún cliente.

### D-7 — Roles

**Recomendada**: **solo un `admin`** crea, confirma, cancela y entrega, como los ajustes de stock. **Un `viewer`** ve la lista y el detalle, **sin los datos de contacto del cliente** (`contact` nulo, como en `crm`). Ninguno ve el costo ni el margen en un pedido.

### D-8 — El agente

**Recomendada**: **el agente puede dejar un pedido `pending`**, nunca confirmarlo, cancelarlo ni entregarlo, y nunca registra un cobro (ADR 0016, punto 5). Se implementa en la **19.4**, solo si el agente confirma que lo usaría, con un `event_type` nuevo de ingestión v2 (cambio compatible, §Versionado), diseñado con él. Cuando llegue, la cabecera suma un actor de servicio como `audit_logs` (exactamente uno, usuario o credencial), con una migración aditiva. **La 19.2 no lo crea** (nada especulativo).

### D-9 — Datos de un cliente

**Recomendada**:
- el pedido apunta al cliente con clave compuesta `(organization_id, client_id)` y `ON DELETE RESTRICT`: **un cliente con pedidos no se borra**, se vacía, como con los mensajes;
- **el pedido no guarda texto libre** (ni notas ni dirección) en la 19.2: sus columnas son ids, cantidades, montos, estados y fechas, que no describen a la persona. Por eso **el vaciado no los toca** y las cifras de los pedidos quedan;
- **la exportación incluye sus pedidos** (número, estado, fechas, líneas y total), y el informe del runbook los cuenta. Lo implementa la 19.2;
- si una fase futura agrega texto libre al pedido, lo suma al vaciado, con el mismo test de columnas que `clients`.

### D-10 — Qué crea cada subfase

**Recomendada**:

| Qué | Subfase |
|---|---|
| `orders`, `order_lines`, el contador de numeración, `entity_type` `order`, el módulo `orders` | 19.2 |
| `quantity_reserved`, el tipo `order_delivery`, las funciones de reserva de `inventory`, la regla `below_reserved` | 19.3 |
| El evento del agente, el actor de servicio del pedido y la decisión sobre `read-v1` | 19.4 |

### D-11 — Revisión independiente

**Recomendada: sí**, antes de pedir la aceptación. La hace un agente de solo lectura contra este brief, los ADR 0008, 0013, 0016 y 0019, DataModel, Overview, `read-v1`, el runbook de datos de un cliente y `src/modules/inventory/`.

### D-12 — Cuándo cierra

**Recomendada**: cuando el ADR esté aceptado o rechazado y las enmiendas estén escritas:
- **Roadmap** §Fase 19 (las subfases) y §Fase 20 (la venta no vuelve a descontar un pedido entregado, H-1);
- **DataModel**: una nota de diseño en §«Explícitamente fuera de este modelo» con las tablas que vienen, sin tablas todavía;
- **ADR 0019** y **ADR 0008**: una nota fechada que remite al 0020, sin cambiar su texto;
- **`docs/decisions/README.md`**: el ADR 0020.

## Alcance incluido

- `docs/decisions/0020-el-pedido.md`, nuevo, y este brief;
- con el ADR aceptado, las enmiendas de D-12;
- en el cierre: `CHANGELOG.md` y `HANDOFF.md`.

## Alcance excluido

- **Código, migraciones, tablas, dependencias y cambios en la forma de un contrato.** Las tablas son de la 19.2 y la 19.3; el contrato del agente, de la 19.4.
- La venta, el comprobante interno, los cobros, las señas, el envío, la dirección de entrega, los descuentos y las listas de precios.
- Cambios en el agente o en su repositorio, y avisos al agente: la 19.1 no cambia nada de lo que lee o escribe.

## Fuentes de verdad

- ADR 0008, 0013, 0014, 0016 y 0019.
- DataModel §Reglas de diseño, §`inventories`, §`inventory_movements`, §`product_prices`, §`audit_logs`.
- Overview §Módulos y §Reglas de dependencia.
- `read-v1` §Productos, §`/products/{id}/stock` y §Versionado; `ingestion-v2` §Versionado.
- Runbook de datos de un cliente.
- `src/modules/inventory/` y `deriveStockStatus` de `catalog`.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **El saldo nunca queda negativo** y lo reservado nunca supera el saldo (ADR 0008).
3. **Lo que el agente lee no cambia** en la 19.1, y el CRM no llama al agente (ADR 0014).
4. **El dinero no pasa nunca por un `number`**, y los montos de un pedido no se recalculan.
5. **Ninguna dependencia de `inventory` o `catalog` hacia `orders`**, y ningún `JOIN` entre módulos.

## Criterios de aceptación

- **AC-1**: el ADR 0020 responde D-2 a D-9, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR resuelve H-1 y dice cómo se enmienda el Roadmap.
- **AC-3**: el ADR fija las transiciones de estado completas y, para cada una, su efecto sobre el saldo físico y lo reservado, sin ningún camino que deje uno de los dos negativo o lo reservado por encima del saldo.
- **AC-4**: el ADR fija el orden de bloqueo de una confirmación, una cancelación y una entrega frente a un ajuste manual (H-4).
- **AC-5**: el ADR dice qué lee el agente antes y después de la 19.4, y deja escrito el límite de D-6.
- **AC-6**: el ADR dice qué tabla crea cada subfase y no crea ninguna en la 19.1.
- **AC-7**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado.
- **AC-8**: con el ADR aceptado, las enmiendas de D-12 están escritas, fechadas, conservan el texto anterior y no contradicen al ADR.
- **AC-9**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato o enmendar el texto del ADR 0008, el 0014 o el 0016, o una prohibición de `CLAUDE.md`;
- una decisión obliga a `inventory` o a `catalog` a depender de `orders`;
- hace falta tocar un archivo fuera de la lista.

Pedir autorización explícita, en su turno, **antes de**: cada commit y push, mandarle un aviso al agente y el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0020-el-pedido.md`, escrito el 2026-10-11 como **propuesto**. Nivel: diseñado.

### Revisión independiente (D-11, AC-7)

La hizo el 2026-10-11 un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, los ADR 0008, 0013, 0014, 0016 y 0019, DataModel, Overview, `read-v1`, `ingestion-v2`, el runbook de datos de un cliente, el Roadmap y el código de `inventory`, `catalog`, `audit` y `src/shared/`. Fijó la escala antes de mirar. Veredicto: **R1**, con 17 hallazgos (1 bloqueante, 9 medios, 7 bajos) y 6 notas. Encontró ciertas las afirmaciones del ADR sobre el estado actual (N-4), y ninguna dependencia invertida ni `JOIN` implícito (N-6). Los hallazgos que dependen del código se verificaron contra él: `applyStockChange` actualiza solo `quantity_on_hand` (R-2), el ajuste valida contra todos los valores del enum (R-3), el caso A del runbook borra la ficha (R-9), los límites de `numeric(14, 2)` y `numeric(14, 3)` (R-11) y `withStock` compartido por pantallas y servicio (R-14). Todos se confirmaron y se resolvieron en el ADR:

- **R-1, bloqueante**: reservar y entregar contradicen DataModel §`inventories` («nunca se escribe de forma aislada») y la regla 11, que el ADR no enmendaba. **Corrección**: §Consecuencias enmienda DataModel al aceptarse, con vigencia desde la 19.3; la regla que se conserva es que el saldo físico nunca cambia sin su movimiento.
- **R-2, medio**: la entrega en dos sentencias viola el `CHECK` cuando todo el saldo está reservado. Ahora cambia saldo y reservado en una sola sentencia, con una función nueva.
- **R-3, medio**: el tipo `order_delivery` quedaba disponible en el ajuste manual. Ahora el ajuste admite solo sus dos tipos, con un test.
- **R-4, medio**: la decisión sobre `read-v1` dependía de una 19.4 condicional. Ahora se toma en la 19.4 o al cerrar la Fase 19.
- **R-5, medio**: el «acuerdo escrito» sin v2 no cabía en §Versionado. **Se quitó esa vía**: cambiar lo que lee el agente exige v2.
- **R-6, medio**: el ADR solo argumentaba el ADR 0016, punto 4, frente al dinero. Ahora lo argumenta frente al stock.
- **R-7, medio**: no decía qué módulo es dueño del contador. Ahora es un módulo propio, `numbering`, con la guarda `counter-writes`, para que la venta numere sin depender de `orders`.
- **R-8, medio**: no fijaba las columnas mutables ni la defensa de la base. Ahora el trigger tiene una lista de columnas permitidas y rechaza las transiciones fuera de la tabla; se llama cuarta categoría.
- **R-9, medio**: el caso A del runbook borraría a un cliente con pedidos. Ahora la 19.2 cambia el criterio de borrado.
- **R-10, medio**: faltaban alternativas y consecuencias para §5, §8, §9 y §10. Agregadas.
- **R-11 a R-17, bajos**: límites de monto y línea en cero; dependencias `auth` e `ingestion`; la venta y el pedido (solo se decide que no se vuelve a descontar, y el verbo del Roadmap); la separación de `withStock` y el orden por stock; `create` para el alta; la cita a §Versionado y no al ADR 0014; el cliente activo en el alta.
- **Notas**: N-1, el test de conciliación de la 19.3, agregado; N-2, la equivalencia del `UNIQUE`, agregada; N-3, la salida que la 1.2 esperaba de las ventas, precisada. N-5 señaló `.claude/settings.json` sin seguimiento: es conocido y nunca entra en un commit.

**Tres correcciones cambian recomendaciones aprobadas o suman decisiones**, y se someten a la decisión del usuario junto con la aceptación (AC-9): R-5 quita la vía del acuerdo escrito de D-6; R-7 crea el módulo `numbering`, que el brief no nombraba; R-9 suma a la 19.2 el cambio de criterio del borrado de un cliente.

## Cierre

- **2026-10-11**: el usuario **aceptó el ADR 0020** con las correcciones de la revisión independiente, incluidas las tres que cambian o suman decisiones (R-5, R-7 y R-9). AC-9 cumplido.
- **Enmiendas escritas ese día, con fecha y conservando el texto anterior**: el Roadmap §Fase 19 (sus cuatro subfases) y §Fase 20 (la venta de un pedido no vuelve a descontar; la venta no «confirma» un pedido); DataModel, regla 11, §`inventories` (en vigor desde la 19.3) y la nota de §«Explícitamente fuera de este modelo»; las notas de los ADR 0008 y 0019; el README de decisiones.
- **Nivel**: diseñado. No hay código, tablas, migraciones ni cambios en la forma de ningún contrato. El agente no recibe ningún aviso en esta subfase.
- **Revisión**: la del ADR fue independiente (§Resultados); la verificación de las enmiendas contra el ADR es autoevaluación.
