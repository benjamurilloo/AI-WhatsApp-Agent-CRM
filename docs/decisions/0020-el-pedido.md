# 0020 — El pedido

- Estado: **aceptada** (decisión del usuario del 2026-10-11, después de la revisión independiente y con sus correcciones, entre ellas R-5, R-7 y R-9, que cambian o suman decisiones del brief; subfase 19.1, [brief-19.1](brief-19.1-adr-del-pedido.md), aprobado el 2026-10-11 con las recomendaciones de D-1 a D-12).
- Fecha: 2026-10-11
- Nivel: **diseñado**. No hay código, tablas ni ejecución.

## Contexto

El [Roadmap](../planning/Roadmap.md) §Fase 19 pide «el pedido de un cliente, con sus líneas, su total y sus estados (pendiente, confirmado, entregado, cancelado), y la reserva de stock, que nunca lo deja negativo», y deja a esta fase decidir si el agente puede dejar un pedido pendiente. El usuario abrió la Fase 19 el 2026-10-11 con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3).

Lo que acota la decisión, verificado el 2026-10-11:

- **El [ADR 0019](0019-bases-de-los-comprobantes.md)** fija la numeración sin huecos por `(organization_id, tipo)` con una fila bloqueada `FOR UPDATE`, una moneda por comprobante, los montos copiados al emitir y el redondeo por línea a los decimales de la moneda. Deja abierto si un pedido numerado es un comprobante emitido.
- **El [ADR 0008](0008-stock-nunca-negativo.md)**: el saldo nunca queda negativo, sin excepciones. Un compromiso de entrega se modela «como una entidad propia (reserva o pedido pendiente)», no relajando el `CHECK`.
- **El [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)** distingue tablas comunes, de solo inserción con trigger y, desde la 6.1, la categoría de `ingestion_events`: `UPDATE` de su estado, sin `DELETE`, con un trigger que protege su identidad.
- **El ADR 0016**, punto 4: lo que mueve dinero o stock es de solo inserción, y un comprobante emitido se anula con otro. Punto 5: el agente nunca registra un cobro, y un pedido pendiente del agente lleva su propio contrato.
- **`inventories`** tiene solo `quantity_on_hand`, con `CHECK (>= 0)`; `inventory_movements` admite `adjustment_positive` y `adjustment_negative`, y la 1.2 (D-11) previó «entradas y salidas … como valores nuevos del enum». Solo `lockBalance` y `applyStockChange` escriben esas tablas (guarda `stock-writes`). `adjustStock` es solo de `admin` y bloquea el producto en modo compartido y después su saldo.
- **El estado de stock** lo deriva `deriveStockStatus` de `catalog` a partir de `quantity_on_hand` y del punto de reposición.
- **[`read-v1`](../contracts/read-v1.md)**: `quantity_available` de `GET /products/{id}/stock` es hoy `quantity_on_hand`, y cada producto trae su `stock_status`. Cambiar una regla de cálculo exige v2 (§Versionado).
- **Fronteras** ([Overview](../architecture/Overview.md) §Reglas de dependencia): ningún `JOIN` entre módulos; un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla y la pasa a los demás, que la exigen por tipo.
- **Datos de un cliente** ([runbook](../runbooks/datos-de-un-cliente.md)): una ficha con mensajes no se borra, se vacía; la exportación y el vaciado alcanzan cada tabla con datos de la persona.

**Dos problemas que el diseño tiene que resolver** (brief-19.1, H-1 y H-3):

- **El Roadmap se contradice**: la Fase 19 tiene un estado «entregado», y la Fase 20 dice que la venta «descuenta el stock». Un pedido entregado que no descuenta deja el saldo mal hasta la Fase 20.
- **Un ajuste negativo puede dejar el saldo por debajo de lo reservado**, y entonces un pedido confirmado no se puede entregar sin romper el ADR 0008.

## Decisión

### 1. Qué decide este ADR

**Decide**: el número, la naturaleza del pedido frente al comprobante, sus estados y transiciones, qué se guarda al crearlo, la reserva y la salida de stock, los ajustes frente a lo reservado, el orden de bloqueo, los roles, el agente, los datos de un cliente y qué crea cada subfase.

**No decide**: la venta y su comprobante interno (Fase 20), los cobros y las señas (Fase 21), el envío, la dirección de entrega, los descuentos y las listas de precios, ni **la forma** del contrato del agente, que se diseña con él en la 19.4.

### 2. El número

- **Todo pedido lleva número**, del contador del ADR 0019, punto 2, con el tipo `order`. Se muestra con el prefijo **`P`** y seis dígitos: `P-000123`. La base guarda un entero, con `UNIQUE (organization_id, number)`: equivale al `UNIQUE (organization_id, tipo, número)` del ADR 0019 porque `orders` guarda un solo tipo.
- **El contador es de un módulo propio, `numbering`**, con una tabla (`document_counters`, clave `(organization_id, kind)`) y **una sola función que la escribe**, que recibe la transacción del módulo que emite (Overview §Reglas de dependencia) y la vigila una guarda de escrituras, `counter-writes`, como `price-writes` y `stock-writes` (ADR 0019, punto 2). Así la venta de la Fase 20 numera sin depender de `orders`. `kind` es un enum que hoy solo tiene `order`; la Fase 20 le suma su valor.
- **Se asigna al crear el pedido**, también si queda pendiente, en la misma transacción. Si la transacción se revierte, el número no se consume.
- **No se reutiliza nunca**: un pedido cancelado conserva su número. La serie no tiene huecos aunque haya cancelados, porque ningún pedido se borra (punto 3).

### 3. El pedido es un compromiso con estado, no un comprobante emitido

El comprobante del ADR 0019 es el de la venta (Fase 20). El pedido no mueve dinero: es lo que el negocio se comprometió a entregar.

- **La cabecera (`orders`) es una cuarta categoría del ADR 0013**, emparentada con `ingestion_events` (nota de la 6.1): `crm_app` con `SELECT`, `INSERT` y `UPDATE`, **sin `DELETE`**. Su trigger, en lugar de una lista de columnas prohibidas, tiene **una lista de columnas permitidas**: rechaza con `P0001` el borrado y todo `UPDATE` que cambie algo distinto de `status`, `confirmed_at`, `delivered_at`, `cancelled_at` y `updated_at`. Número, organización, cliente, moneda, total, autor y fecha de alta quedan fijos. El test de cobertura de privilegios la suma a la lista de tablas sin borrado.
- **La base también protege las transiciones**: el mismo trigger rechaza un cambio de `status` que no esté en la tabla del punto 4, así que nada sale de `delivered` ni de `cancelled`. Un `CHECK` exige que cada marca de tiempo esté puesta si y solo si el pedido pasó por ese estado. Como en el ADR 0008, la base es la última defensa: el servicio rechaza antes.
- **Quién hizo cada transición** está en la auditoría, no en la cabecera.
- **Las líneas (`order_lines`) son de solo inserción**: `crm_app` con `SELECT` e `INSERT`, y un trigger que rechaza `UPDATE` y `DELETE` (regla 10 de DataModel). Cada línea guarda el producto, la cantidad, el precio unitario, la moneda y su total.
- **Los montos se copian al crear el pedido y nunca se recalculan**, ni al confirmar ni al entregar. Se aplican los puntos 3 y 4 del ADR 0019, con «emitir» leído como «crear el pedido»:
  - una moneda por pedido, la de su primera línea; un pedido sin líneas no se crea;
  - se rechaza la línea de un producto sin precio vigente, con el precio en otra moneda o inactivo;
  - el precio unitario es el vigente de `product_prices` (final al consumidor), leído con el producto bloqueado en modo compartido, así que un cambio de precio simultáneo no se cruza con el alta;
  - el total de la línea es el precio unitario por la cantidad, **redondeado a los decimales de la moneda con el medio hacia afuera del cero**; el total del pedido es la suma de los totales de las líneas. El cálculo es exacto: centésimos por milésimas en `bigint`, nunca `number`;
  - **los límites**: la cantidad es mayor que cero (`CHECK`); se rechaza con `BUSINESS_RULE_VIOLATION` una línea cuyo total redondeado sea cero y una línea o un total que no quepan en `numeric(14, 2)` (`MAX_AMOUNT`), con una regla propia, como `stock_limit` en los ajustes;
  - un producto no se repite dentro de un pedido: la cantidad va en una sola línea;
  - **el cliente tiene que estar activo** al crear el pedido. Cómo se trata un cliente ya vaciado lo fija la 19.2.
- **Las líneas no se editan**: para cambiar un pedido, se cancela y se crea otro.
- **Un pedido nunca se borra.** Todo se audita en la misma transacción, con un `entity_type` nuevo, `order` (valor aditivo del enum): **el alta con `create`** y **cada transición con `status_change`**, dos acciones que ya existen.

### 4. Estados, transiciones y stock

| Transición | Quién | Saldo físico (`quantity_on_hand`) | Reservado (`quantity_reserved`) |
|---|---|---|---|
| alta → `pending` | `admin` (y, desde la 19.4, el agente) | no cambia | no cambia |
| `pending` → `confirmed` | `admin` | no cambia | **suma** la cantidad de cada línea |
| `pending` → `cancelled` | `admin` | no cambia | no cambia |
| `confirmed` → `cancelled` | `admin` | no cambia | **resta** la cantidad de cada línea |
| `confirmed` → `delivered` | `admin` | **resta** la cantidad de cada línea, con un movimiento | **resta** la cantidad de cada línea |

- **No hay otras transiciones.** `delivered` y `cancelled` son finales. Un pedido pendiente no toca el stock.
- **La reserva es una columna de `inventories`**: `quantity_reserved numeric(14, 3) not null default 0`, con `CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)`. Con los dos `CHECK`, ningún camino deja el saldo negativo ni lo reservado por encima del saldo, y el ADR 0008 se cumple sin excepciones. **Lo disponible es `quantity_on_hand − quantity_reserved`**, derivado, sin columna.
- **Confirmar** se rechaza con `BUSINESS_RULE_VIOLATION` si alguna línea pide más que lo disponible de su producto, informando lo disponible de cada línea que no alcanza; no se reserva nada parcialmente. También se rechaza si algún producto del pedido está inactivo (`inactive_product`, como un ajuste).
- **Cancelar y entregar no se rechazan por un producto inactivo**: lo reservado tiene que poder liberarse siempre. Desactivar un producto no toca sus reservas.
- **Entregar registra la salida física** como un movimiento de `inventory_movements` de un **tipo nuevo, `order_delivery`** (valor aditivo del enum), uno por línea, con `balance_after` y un motivo con el número del pedido (`Entrega del pedido P-000123`). **Sin clave foránea al pedido**: `inventory` no depende de `orders`. Es la salida que la 1.2 (D-11) esperaba de las ventas: llega con el pedido.
- **La entrega cambia el saldo y lo reservado en una sola sentencia** (`UPDATE … SET quantity_on_hand = …, quantity_reserved = …`), después de insertar el movimiento. En dos sentencias, el caso válido en que todo el saldo está reservado violaría el `CHECK` entre una y otra. Es una función nueva de `inventory`, no una extensión de `applyStockChange`.
- **El tipo `order_delivery` no lo admite el ajuste manual**: `adjustStock` acepta solo `adjustment_positive` y `adjustment_negative`, y un test lo fija. Hoy valida contra todos los valores del enum, así que la 19.3 lo restringe.
- **Reservar y liberar no son movimientos**: no cambian el saldo físico, y la cadena de `balance_after` sigue siendo la del saldo físico. La traza de una reserva es la auditoría del pedido, que es de solo inserción.
- **Las escrituras**: `orders` es dueño de la regla, abre la transacción y la pasa a funciones nuevas de `inventory` (reservar, liberar y entregar), que la exigen por tipo. Desde la 19.3, las únicas escrituras de `inventories` e `inventory_movements` son `lockBalance`, `applyStockChange` y esas tres, y la guarda `stock-writes` se extiende a ellas:
  - `quantity_on_hand` lo cambian solo `applyStockChange` (ajustes) y la entrega, **siempre con su movimiento**;
  - `quantity_reserved` lo cambian solo reservar, liberar y la entrega, **sin movimiento**. Es la única escritura de `inventories` sin movimiento, y por eso se enmienda DataModel (§Consecuencias).
- **Conciliación**: un test de la 19.3 comprueba que `quantity_reserved` de cada producto es la suma de las líneas de sus pedidos confirmados. Es una comprobación de prueba, no una lectura de producción.

**Por qué esto cumple el ADR 0016, punto 4** («todo lo que mueve dinero o stock es de solo inserción»): lo que mueve stock es la salida física, y queda en `inventory_movements`, de solo inserción, como cada ajuste. El saldo de `inventories` ya era mutable antes de este ADR: es el acumulado de esos movimientos. Lo reservado es otro acumulado en la misma fila, que no mueve unidades, y cada cambio suyo queda en la auditoría, también de solo inserción, junto con la transición que lo produjo. La cabecera del pedido cambia solo su estado, y la base impide editar o borrar lo demás.

**La Fase 20 no vuelve a descontar.** En la Fase 19, entregar descuenta el stock. Lo que este ADR decide de la venta es solo eso: **una venta que corresponde a un pedido no genera otro movimiento de stock**, y una venta sin pedido descuenta sola. Cómo se vincula la venta al pedido (en qué estado, una o varias ventas por pedido, con qué clave) lo decide la Fase 20. Se enmienda el Roadmap §Fase 20, también el verbo: la venta ya no «confirma» un pedido, porque confirmar es una transición del pedido.

### 5. Los ajustes manuales frente a lo reservado

- **Un ajuste negativo que dejaría `quantity_on_hand` por debajo de `quantity_reserved` se rechaza** con `BUSINESS_RULE_VIOLATION` y una regla nueva, `below_reserved`, informando el saldo, lo reservado y la cantidad pedida. El `CHECK` es la última defensa: si se dispara, es un defecto del servicio, como dice el ADR 0008.
- **Para corregir un faltante real con pedidos confirmados**, primero se cancela el pedido que no se puede cumplir y después se ajusta.
- **No enmienda el ADR 0008**: lo aplica a una cantidad más.

### 6. El orden de bloqueo

Un mismo orden en todas las operaciones evita que dos de ellas se traben entre sí:

1. la cabecera del pedido, `FOR UPDATE` (solo las transiciones);
2. los productos del pedido, en modo compartido, **ordenados por `product_id`**;
3. los saldos de esos productos, `FOR UPDATE`, **en el mismo orden**, creando la fila en 0 si no existe, como `lockBalance`;
4. en el alta, la fila del contador de numeración, al final, para retenerla lo menos posible.

Un ajuste manual bloquea un producto y después su saldo: es el mismo orden con un solo producto. El alta no bloquea saldos, porque un pendiente no toca el stock.

*Precisado el 2026-10-11 en la 19.2* ([brief-19.2](brief-19.2-el-pedido.md), H-2 y D-3): el orden de arriba no nombraba al cliente. **El alta bloquea primero la ficha del cliente en modo compartido**, antes de los productos, para esperar a una desactivación en curso (que la bloquea `FOR UPDATE`). Ningún otro camino bloquea productos y después un cliente, así que no se forma un ciclo. Las transiciones no bloquean al cliente: cancelar nunca depende de él.

### 7. Lo que ven las pantallas y el agente

- **Las pantallas del CRM**, desde la 19.3, muestran el saldo físico, lo reservado y lo disponible. **El estado de stock** (`disponible`, `bajo_stock`, `sin_stock`) **y el orden por stock** de la lista **pasan a usar lo disponible**: es lo que se puede ofrecer. `deriveStockStatus` no cambia: cambia la cantidad que recibe.
- **`read-v1` no cambia en la 19.3**: la lectura de servicio sigue entregando el saldo físico como `quantity_available` y derivando el `stock_status` del agente de ese saldo. Hoy pantallas y servicio comparten `withStock`, así que la 19.3 separa las dos derivaciones, y un test fija que la ruta de servicio sigue con el saldo físico.
- **Hacer que el agente descuente lo reservado es un cambio de regla de `read-v1`** (§Versionado): exige una v2 de la ruta, diseñada con el agente y con su aviso. **Se decide en la 19.4 si se hace, o al cerrar la Fase 19 si no**: la decisión no depende de que el agente deje pedidos.
- **Límite aceptado mientras tanto**: el agente puede decir que hay stock de unidades que ya están reservadas. Hoy no hay un negocio real con pedidos (13.5.2-b), así que no alcanza a ningún cliente. Si la 13.5.2-b llega antes de esa decisión, el límite se revisa antes de encender al cliente.

### 8. Roles

- **Solo un `admin`** crea, confirma, cancela y entrega un pedido, como los ajustes de stock.
- **Un `viewer`** ve la lista y el detalle, **sin los datos de contacto del cliente** (`contact` nulo, como en `crm`).
- **Ningún pedido muestra el costo ni el margen**: siguen siendo solo de un `admin`, en el producto (brief-18.2).

### 9. El agente

- **El agente puede dejar un pedido `pending`.** Nunca lo confirma, lo cancela ni lo entrega, y nunca registra un cobro (ADR 0016, punto 5).
- **Se implementa en la 19.4, solo si el agente confirma que lo usaría**, con un `event_type` nuevo de ingestión v2 (cambio compatible según su §Versionado), diseñado con él y con su aviso como paso del cierre.
- **Cuando llegue**, la cabecera suma un actor de servicio como `audit_logs`: exactamente uno, usuario o credencial, con una migración aditiva. **La 19.2 no lo crea**: nada especulativo.

### 10. Datos de un cliente

- **El pedido apunta al cliente** con la clave compuesta `(organization_id, client_id)` hacia `clients (organization_id, id)`, `ON DELETE RESTRICT`. **Un cliente con pedidos no se borra**: se vacía, como un cliente con mensajes.
- **El pedido no guarda texto libre** (ni notas ni dirección): sus columnas son ids, cantidades, montos, estados y fechas, que no describen a la persona. **El vaciado no los toca**, y las cifras de los pedidos quedan.
- **La exportación incluye los pedidos del cliente** (número, estado, fechas, líneas y total), y el informe del runbook los cuenta. Lo implementa la 19.2.
- **El borrado de la ficha cambia de criterio**: hoy el runbook borra de verdad a un cliente sin conversaciones (caso A). Desde la 19.2, **un cliente con pedidos va al vaciado (caso B) aunque no tenga conversaciones**, porque la clave del pedido impide borrarlo. La 19.2 ajusta el runbook y `scripts/client-data-delete.ts`, con su test.
- **Si una fase futura agrega texto libre al pedido**, lo suma al vaciado, con el mismo test de columnas que `clients`.

### 11. Qué crea cada subfase

| Qué | Subfase |
|---|---|
| Los módulos `orders` y `numbering`, `orders`, `order_lines`, `document_counters` con la guarda `counter-writes`, el `entity_type` `order`, el alta, la lista, el detalle y la cancelación de un pendiente, y los pedidos en la exportación y en el criterio de borrado de un cliente | **19.2** |
| `quantity_reserved`, el tipo `order_delivery`, las funciones de reserva y entrega de `inventory`, la regla `below_reserved`, el ajuste restringido a sus dos tipos, confirmar, cancelar un confirmado, entregar, lo disponible en las pantallas y el test de conciliación | **19.3** |
| El evento del agente y el actor de servicio del pedido | **19.4**, si el agente lo usaría |
| La decisión sobre lo que lee el agente en `read-v1` (punto 7) | la **19.4**, o el cierre de la Fase 19 si la 19.4 no se hace |

## Alternativas descartadas

- **Número al confirmar**: un pendiente, sobre todo uno del agente, no tendría cómo nombrarse ante el cliente.
- **El UUID como identificador**: no se le dicta a un cliente (ADR 0019).
- **El pedido como comprobante emitido de solo inserción**, con cada cambio de estado como una fila nueva: el estado vigente saldría de la última fila, como el precio, y cada lista lo recalcularía. El pedido no mueve dinero, así que el ADR 0016, punto 4, no lo exige; la auditoría ya guarda cada transición.
- **Volver a cotizar al confirmar**: el cliente aceptó un precio, y el pedido diría otra cosa si el precio cambia en el medio.
- **Editar las líneas de un pedido pendiente**: obligaría a que las líneas admitan `UPDATE` y `DELETE`. Cancelar y crear otro deja la traza completa.
- **Reservar al crear**: un pendiente que nadie confirma bloquearía stock sin que una persona lo haya aceptado.
- **Entregar sin descontar y descontar con la venta**: el saldo físico quedaría mal entre la entrega y la venta, y la Fase 19 dependería de la 20 para que el stock fuera correcto.
- **La reserva derivada de las líneas confirmadas**, sin columna: sin columna no hay `CHECK`, el invariante quedaría solo en la aplicación, y cada lectura de stock tendría que leer los pedidos, con un `JOIN` entre módulos o una dependencia de `inventory` hacia `orders`.
- **Reservar y liberar como movimientos**: `balance_after` dejaría de ser la cadena del saldo físico, que es lo que cuentan el historial y la conciliación.
- **Una clave foránea del movimiento al pedido**: invertiría la dependencia entre `inventory` y `orders`.
- **El contador dentro de `orders`**: la venta de la Fase 20 dependería de `orders` para numerar, aunque no tenga pedido.
- **Cambiar ya el `quantity_available` del agente**: es un cambio de regla de `read-v1`, y su §Versionado exige v2.
- **Un acuerdo escrito con el agente sobre la semántica de «disponible», sin v2**: el valor que hoy recibe cambiaría de cálculo, y eso es cambiar una regla según el mismo §Versionado.
- **Que un ajuste negativo cancele solo los pedidos que no alcanzan**: una persona perdería un pedido confirmado sin decidirlo. El rechazo la obliga a elegir cuál cancelar.
- **Permitir que lo reservado supere el saldo después de un ajuste**: un pedido confirmado quedaría sin poder entregarse, y el ADR 0008 no admite excepciones.
- **Que un `viewer` cree o confirme pedidos**: comprometería stock, y en el CRM las escrituras que mueven stock son de `admin`. Se revisa si el negocio real lo pide.
- **Que el agente confirme pedidos**: confirmar reserva stock y compromete al negocio, y el ADR 0016, punto 5, deja la confirmación a una persona.
- **Que el agente no pueda dejar pedidos**: la conversación de WhatsApp termina en un pedido (ADR 0016, §Alternativas), y transcribirlo a mano es el trabajo que el agente puede ahorrar. Igual queda condicionado a que el agente lo use.
- **`ON DELETE CASCADE` o `SET NULL` hacia el cliente**: borrar una ficha borraría pedidos o dejaría pedidos sin cliente, y el registro comercial tiene que sobrevivir a un borrado a pedido. El vaciado ya resuelve los datos personales.
- **Notas o dirección de texto libre en el pedido desde la 19.2**: serían datos de la persona que el vaciado tendría que alcanzar, sin un uso pedido todavía.

## Consecuencias

- **Enmiendas, con fecha y conservando el texto anterior**:
  - el **Roadmap** §Fase 19, con sus cuatro subfases, y §Fase 20: la venta no vuelve a descontar un pedido entregado;
  - **DataModel** §«Explícitamente fuera de este modelo»: una nota de diseño con las tablas que vienen, sin tablas;
  - **DataModel** §`inventories` y **regla 11**: hoy dicen que `inventories` «se mantiene siempre junto con `inventory_movements` … nunca se escribe de forma aislada» y que `applyStockChange` es la única que cambia `quantity_on_hand`. **Este ADR los contradice desde la 19.3** (punto 4): `quantity_reserved` se escribe sin movimiento, y la entrega también cambia `quantity_on_hand`. DataModel está por encima de los ADR en la jerarquía de `CLAUDE.md`, así que la enmienda se escribe en DataModel al aceptarse este ADR, con fecha, y entra en vigor con la 19.3. **La regla que se conserva**: el saldo físico no cambia nunca sin su movimiento;
  - **el ADR 0019** y **el ADR 0008**: una nota fechada que remite a este, sin cambiar su texto;
  - **`docs/decisions/README.md`**: este ADR.
- **Por decisión**:
  - **número (2)**: la 19.2 crea `numbering`, el primer módulo sin pantalla propia;
  - **pedido (3)**: el test de cobertura de privilegios suma una categoría; la lista de tablas sin borrado crece;
  - **stock (4) y ajustes (5)**: la 19.3 cambia la regla de `adjustStock`, restringe sus tipos y extiende `stock-writes`;
  - **pantallas y agente (7)**: la 19.3 separa la derivación de las pantallas de la del servicio;
  - **roles (8)**: un `viewer` no opera pedidos;
  - **agente (9)**: la 19.4 suma un actor de servicio a la cabecera;
  - **datos de un cliente (10)**: el runbook y el script de borrado cambian de criterio en la 19.2.
- **La 19.2** crea las tablas del punto 11 y el módulo `orders`, que depende de `crm`, `catalog`, `inventory`, `numbering`, `organizations`, `audit` y, solo en `schema.ts` por la clave del autor, `auth`. Desde la 19.4 suma `ingestion` en `schema.ts`, por el actor de servicio, como `audit`. Ningún módulo existente depende de `orders`.
- **La 19.4** cambia un contrato con el agente y lleva revisión independiente obligatoria.
- **Riesgo**: una organización con muchos pedidos simultáneos se serializa en la fila del contador y en los saldos de los productos más pedidos. Es aceptable mientras el volumen sea el de un negocio chico, como en el ADR 0019.

## Lo que este ADR no decide

- La venta, el comprobante interno y su relación exacta con el pedido entregado (Fase 20).
- Los cobros y las señas (Fase 21): «Quiere señar» sigue siendo una etiqueta.
- El envío, sus zonas y costos, y la dirección de entrega.
- La forma del evento del agente y de una eventual v2 de la ruta de stock (19.4).
- Una fecha de vencimiento de los pendientes o de las reservas: no hay ninguna; se revisa si el uso lo pide.
