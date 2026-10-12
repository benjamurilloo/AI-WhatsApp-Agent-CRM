---
schema: task-brief.v1
task_id: "20.1"
task_type: design
generated_at: 2026-10-12
---

# Brief 20.1 — ADR de la venta

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: primera subfase de la Fase 20 — Ventas, abierta el 2026-10-12 por decisión del usuario con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3). Orden aprobado por el usuario ese día:
  1. **20.1 — ADR de la venta**;
  2. **20.2 — la venta de un pedido entregado** (módulo `sales`, el comprobante interno con su número, sin tocar el stock; lista y detalle);
  3. **20.3 — la venta sin pedido** (descuenta el stock con un movimiento nuevo);
  4. **20.4 — la anulación** (un comprobante que anula otro y, si la venta descontó, repone).

  El orden se ajusta al cerrar la 20.1 si el ADR lo pide.
- **No abre ni cierra un gate.** Fija el diseño que van a implementar la 20.2 a la 20.4. La revisión independiente se hace igual (D-15), como en la 19.1.
- **Estado de este documento**: **aprobado el 2026-10-12** por el usuario, con las recomendaciones de D-1 a D-15. La tarea 20.1 (`3f7702be6f4e81a1811ff4b8fd2c35f0`) está en «En proceso» en Notion desde el 2026-10-12.

## Objetivo

Decidir con un ADR, el **0021**, **qué es una venta en el CRM**:

- cómo se vincula a un pedido;
- cómo es la venta sin pedido y qué hace con el stock;
- su número y su comprobante interno;
- cómo se anula;
- qué pasa con el IVA y con los datos fiscales del cliente;
- quién la opera, qué ve el agente y qué pasa con los datos de un cliente.

El ADR **no crea tablas**: las crean la 20.2 a la 20.4.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-12 contra el código y los documentos de `main` (`89dc3ef`):

- **El perímetro**: el Roadmap §Fase 20, enmendado por el ADR 0020, punto 4:
  - una venta que corresponde a un pedido **no vuelve a descontar**, porque entregar ya descontó;
  - solo una venta sin pedido descuenta;
  - la venta no «confirma» un pedido;
  - **cómo se vincula la venta al pedido** (en qué estado, una o varias ventas por pedido, con qué clave) **lo decide esta fase**.

  La factura de ARCA es un ADR aparte (ADR 0016, punto 6).
- **El ADR 0019** fija:
  - la numeración sin huecos por `(organization_id, tipo)`;
  - una moneda por comprobante, la de su primera línea;
  - el rechazo de una línea sin precio o en otra moneda;
  - los montos copiados al emitir y el redondeo por línea;
  - que un comprobante emitido no se edita ni se borra y **se anula con otro**, conservando su número;
  - la leyenda «Documento no válido como factura».

  **Deja a esta fase**:
  - la condición de la organización frente al IVA y la alícuota de cada producto, que se crean «con la primera fase que discrimine el IVA (la 20), o antes si la 13.5.2-b cambia la base del margen» (punto 7);
  - **el signo de los montos de una anulación** (§Lo que este ADR no decide).
- **El ADR 0020**:
  - el pedido es un compromiso con estado, no un comprobante emitido;
  - `delivered` y `cancelled` son finales;
  - las líneas guardan el precio unitario, la moneda y el total copiados al crear;
  - el contador es del módulo `numbering` precisamente «para que la venta de la Fase 20 numere sin depender de `orders`» (punto 2).
- **`numbering`**: `document_kind` es un enum con un solo valor, `order` (`src/modules/numbering/schema.ts`). La única escritura del contador es `takeNextNumber`, vigilada por `counter-writes`, y se llama con `nextDocumentNumber`. La interfaz pública exporta además `formatDocumentNumber`.
- **`inventory`**:
  - `inventory_movement_type` tiene `adjustment_positive`, `adjustment_negative` y `order_delivery`, y el ajuste manual acepta solo los dos primeros;
  - lo disponible es `quantity_on_hand − quantity_reserved`;
  - la interfaz exporta `reserveStock`, `releaseStock`, `deliverStock` y `getAvailableStock`;
  - las escrituras las fija la guarda `stock-writes`.
- **`orders`**: el detalle se lee con `getOrder`. **Ningún módulo depende de `orders` salvo `ingestion`**, desde la 19.4 ([Overview](../architecture/Overview.md), fila `orders`, releída con `grep`).
- **Fronteras** (Overview §Reglas de dependencia, releídas con `grep` en esta pasada):
  - un módulo solo usa otro por su `index.ts`;
  - no hay `JOIN` contra tablas ajenas fuera de `analytics`;
  - un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla y la pasa a los demás;
  - una lista con datos de dos módulos se compone en memoria.
- **Dinero**: `moneyToDatabase` lanza «Monto negativo.» con un monto menor que cero (`src/shared/money/index.ts:112`).
- **El cliente**: el [ADR 0007](0007-identificador-de-cliente-solo-telefono.md) dice «No se agregan columnas de documento ni de código interno». La 17.1 dejó documento y CUIT/CUIL «para la Fase 20, con la condición frente al IVA» (DataModel §`clients`, C-1 de brief-17.1). `client_kind` es `person` o `company`, y «consumidor final» no es un tipo: es una condición frente al IVA.
- **La auditoría**: `audit_entity_type` llega hasta `order`, y `audit_action` tiene `create` y `status_change`, entre otros.
- **El runbook de datos de un cliente** cuenta, exporta y vacía los pedidos desde la 19.2. Un cliente con pedidos va al vaciado (caso B).
- **No hay ninguna vista de impresión**: ningún `@media print` ni `window.print` en `src/`, y ninguna dependencia de PDF en `package.json`.
- **MetricsCatalog** no tiene ninguna métrica de ventas.

### Hallazgos

- **H-1. Una venta sin pedido puede llevarse unidades reservadas.** Si descuenta contra el saldo físico, se lleva unidades que un pedido confirmado ya tiene, y ese pedido no se puede entregar. Con el `CHECK` de la 19.3 (lo reservado nunca supera el saldo), la base lo rechazaría como un defecto y no como una regla de negocio. La venta sin pedido tiene que comprobar **lo disponible**, con el mismo orden de bloqueo que confirmar (D-5).
- **H-2. Mostrar la venta en el detalle del pedido invierte una dependencia si lo hace `orders`.** `sales` va a depender de `orders` para leer y bloquear el pedido. Si `orders` leyera las ventas para mostrarlas, la dependencia sería circular. Lo compone la página, como ya se hace con el emisor de la credencial en la 19.4 (D-11).
- **H-3. «Emitir un comprobante» no tiene hoy cómo entregarse.** No hay vista de impresión ni dependencia de PDF. El ADR tiene que decir qué es emitir: una página imprimible desde el navegador, o un PDF generado en el servidor, que necesita una dependencia autorizada (D-8).
- **H-4. El ADR 0019 anticipó que la Fase 20 discriminaría el IVA, pero no hay un negocio real.** Su condición frente al IVA no se conoce (13.5.2-b). Crear ahora la condición de la organización y la alícuota de cada producto es crear estructura para un caso que nadie confirmó. El punto 7 del ADR 0019 dice «la primera fase que discrimine el IVA», y la 20 puede no ser esa fase sin contradecirlo (D-9).
- **H-5. Documento y CUIT/CUIL dependen de H-4.** Un comprobante interno a consumidor final no los necesita. Agregarlos enmienda el ADR 0007 y suma datos personales al vaciado. Si el IVA no se discrimina, no tienen un uso que los justifique (D-10).
- **H-6. El signo de la anulación.** `moneyToDatabase` rechaza negativos. Montos negativos obligarían a cambiar `src/shared/money/` y cada suma. Con el efecto dado por el tipo, como en `inventory_movements`, nada de eso cambia (D-7).

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:

- **Entran**:
  - el vínculo con el pedido y la venta sin pedido;
  - el número y la naturaleza del comprobante;
  - qué se guarda al emitir;
  - el stock;
  - la anulación;
  - el comprobante entregable;
  - el IVA y los datos fiscales del cliente;
  - los roles, el agente y los datos de un cliente;
  - qué crea cada subfase.
- **No entran**:
  - los cobros, los medios de pago y las señas (Fase 21);
  - las devoluciones con reingreso de mercadería distintas de una anulación;
  - las notas de crédito o débito parciales;
  - los descuentos, las listas de precios y los tipos de cambio;
  - la factura de ARCA;
  - las métricas de ventas.

### D-2 — La venta es un comprobante emitido, de solo inserción

- **(a) Recomendada**: la venta **es el comprobante del ADR 0019**.
  - La cabecera (`sales`) y las líneas (`sale_lines`) son **de solo inserción**, con trigger: `crm_app` con `SELECT` e `INSERT`, sin `UPDATE` ni `DELETE` (ADR 0013, regla 10 de DataModel).
  - **No tiene estados**: una venta anulada no cambia. Lo que la anula es otro comprobante (D-7), y «anulada» se deriva de que exista.
  - Se audita en la misma transacción, con un `entity_type` nuevo, `sale`, y la acción `create`.
- (b) Una cabecera con estado (`issued`, `voided`) y un trigger de columnas permitidas, como `orders`. Es más simple de leer, pero un comprobante emitido cambiaría una columna, y el ADR 0016, punto 4, dice que lo que mueve dinero es de solo inserción.

### D-3 — La venta de un pedido

- **(a) Recomendada**:
  - **Se emite solo desde un pedido `delivered`.** Es cuando la mercadería salió y el stock ya bajó: la venta registra la operación comercial y no toca el stock (ADR 0020, punto 4).
  - **Copia del pedido** el cliente, la moneda, las líneas (producto, cantidad, precio unitario y total) y el total. **No vuelve a cotizar**: el cliente aceptó el precio del pedido.
  - **Un pedido tiene a lo sumo una venta vigente.** Si se anula, se puede emitir otra para corregir. Cómo lo impide la base frente a dos emisiones simultáneas lo fija el ADR: la propuesta es que la venta bloquee la cabecera del pedido `FOR UPDATE` por la interfaz de `orders` y compruebe que no haya una venta sin anular; y, si se puede, una restricción de la base (por ejemplo, una tabla de vínculo con `UNIQUE`).
  - La venta guarda `order_id` con una clave compuesta `(organization_id, order_id)` hacia `orders`. **`sales` depende de `orders`; `orders` no depende de `sales`.**
- (b) También desde un pedido `confirmed` (vender antes de entregar). La entrega seguiría descontando, pero la venta existiría sin que la mercadería saliera. Si el negocio cobra antes de entregar, eso lo resuelve la Fase 21 con un cobro contra el pedido (Roadmap §Fase 21), no una venta.
- (c) Varias ventas por pedido (entregas parciales). El pedido no tiene entregas parciales (ADR 0020).

### D-4 — La venta sin pedido

- **(a) Recomendada**:
  - **Se arma con líneas, como un pedido**, con las reglas del ADR 0019, puntos 3 y 4, y las del ADR 0020, punto 3:
    - precio vigente copiado con el producto bloqueado en modo compartido;
    - una moneda, la de la primera línea;
    - se rechaza el producto sin precio, en otra moneda o inactivo;
    - un producto por línea;
    - cantidad mayor que cero;
    - redondeo por línea con el medio hacia afuera del cero;
    - límites de `numeric(14, 2)`.

    **Se comparten con el pedido sin duplicarlas.** Dónde vive el código compartido (por ejemplo, el cálculo de la línea de `orders/line-total.ts`, movido a `src/shared/` o expuesto por la interfaz de `orders`) lo decide el brief de la 20.3.
  - **El cliente es opcional.** Sin cliente es una venta a consumidor final no identificado, la de mostrador. Con cliente, el cliente tiene que estar activo, como en el pedido.
- (b) Cliente obligatorio. Obliga a crear una ficha ficticia («Consumidor final»), que contaminaría la lista de clientes, sus filtros y las métricas por cliente.

### D-5 — El stock de una venta sin pedido (H-1)

**Recomendada**:

- **Descuenta al emitir**, con un movimiento de `inventory_movements` de un **tipo nuevo, `sale`** (valor aditivo del enum), uno por línea, con `balance_after` y el motivo `Venta V-000123`. **Sin clave foránea a la venta**: `inventory` no depende de `sales`.
- **Se rechaza con `BUSINESS_RULE_VIOLATION` si alguna línea pide más que lo disponible** (`quantity_on_hand − quantity_reserved`), informando lo disponible de cada línea que no alcanza, sin descontar nada parcialmente. Una venta sin pedido no se lleva unidades reservadas.
- **Orden de bloqueo**, el del ADR 0020, punto 6:
  1. el cliente en modo compartido, si hay;
  2. los productos en modo compartido, ordenados por `product_id`;
  3. sus saldos `FOR UPDATE`, en el mismo orden;
  4. el contador, al final.
- **Las escrituras**: `sales` abre la transacción y la pasa a una función nueva de `inventory`. La guarda `stock-writes` se extiende a ella, y el ajuste manual sigue aceptando solo sus dos tipos.

### D-6 — El número y lo que se guarda

**Recomendada**:

- **Toda venta lleva número** del contador de `numbering`, con un tipo nuevo `sale` en `document_kind` y el prefijo **`V`** (`V-000123`). Se asigna al emitir, en la misma transacción.
- **`UNIQUE (organization_id, number)`**, como en `orders`.
- La cabecera guarda:
  - el número, la organización, el cliente (nulable), el pedido (nulable), la moneda y el total;
  - el autor (un usuario: el agente no emite, D-12) y la fecha de emisión.
- Cada línea guarda el producto, la cantidad, el precio unitario, la moneda y el total.
- **Sin texto libre** (ni notas ni dirección), como el pedido.

### D-7 — La anulación (H-6)

- **(a) Recomendada**:
  - **Una venta se anula entera con otro comprobante, la anulación**, de solo inserción, con su propia serie: tipo `sale_void` en `document_kind` y prefijo **`A`** (`A-000045`).
  - Apunta a la venta con `UNIQUE`: **una venta se anula a lo sumo una vez**, y la base lo impide.
  - **Sin anulaciones parciales.**
  - **Los montos de la anulación son los de la venta, positivos**: el efecto lo da el tipo del comprobante, como en `inventory_movements`. `src/shared/money/` no cambia. Una anulación no tiene líneas propias: anula todas las de su venta.
  - **El stock**:
    - la anulación de una venta sin pedido **repone** lo que esa venta descontó, con un movimiento de un tipo nuevo, `sale_void`, uno por línea;
    - la de una venta de pedido **no toca el stock**: el pedido sigue entregado, y si la mercadería vuelve, es un ajuste manual. Las devoluciones como operación propia quedan fuera.
  - **La anulación de una venta de pedido** deja el pedido libre para otra venta (D-3).
  - Lleva un motivo obligatorio y corto, de 1 a 200 caracteres, porque explicar por qué se anula es parte del registro. **El motivo no debe describir a la persona**, como el motivo de un ajuste.
- (b) Montos negativos en una tabla de comprobantes común. Exige cambiar `src/shared/money/` y cada suma, y mezcla dos tipos de comprobante en una serie.
- (c) Anular sin un comprobante: una marca en la venta. Contradice D-2 y el ADR 0016, punto 4.

### D-8 — El comprobante entregable (H-3)

- **(a) Recomendada**: **una página imprimible del detalle de la venta y de la anulación**, con estilos `@media print` y sin dependencias. El usuario la imprime o la guarda como PDF desde el navegador. Muestra:
  - el nombre de la organización;
  - el número, la fecha, el cliente si hay y el pedido si hay;
  - las líneas y el total;
  - la leyenda **«Documento no válido como factura»**.

  La hace la 20.2 y la reutilizan la 20.3 y la 20.4.
- (b) Un PDF generado en el servidor. Exige una dependencia nueva (con autorización) y la CSP para servir el archivo, para un resultado que el navegador ya da.
- (c) Mandar el comprobante al cliente por WhatsApp: el CRM no produce efectos externos (ADR 0014; ADR 0016, punto 7). Fuera.

### D-9 — El IVA (H-4)

- **(a) Recomendada**: **la Fase 20 no discrimina el IVA.**
  - El comprobante muestra el precio final, con los impuestos incluidos si corresponden (ADR 0019, punto 4), sin alícuota, neto ni IVA.
  - La condición de la organización y la alícuota de cada producto **siguen sin tabla** hasta que la 13.5.2-b conozca la condición del negocio real. Si es responsable inscripto, se abre una subfase que las crea, junto con la revisión del margen (ADR 0019, punto 5).
  - **No contradice el ADR 0019**: el punto 7 dice «la primera fase que discrimine el IVA», y la 20 deja de ser esa fase. Se le agrega una nota fechada.
- (b) Crear ahora la condición y la alícuota, con monotributo por defecto. Son tablas para una condición que nadie confirmó, y un monotributista no discrimina.

### D-10 — Documento y CUIT/CUIL del cliente (H-5)

- **(a) Recomendada**: **no entran en la Fase 20.**
  - Un comprobante interno a consumidor final no los necesita, y sin discriminar el IVA no tienen uso.
  - Entran con la subfase que discrimine el IVA o con el ADR de la factura de ARCA, con una enmienda del ADR 0007 («se agregan como datos, no como identificadores») y su lugar en el vaciado.
  - **El ADR 0007 no cambia.** Se anota en DataModel §`clients` que la 17.1 los mandó a la Fase 20 y que la 20.1 los posterga.
- (b) Agregarlos opcionales a la ficha ahora. Son datos personales sin uso, contra FR-CLI-05.

### D-11 — Pantallas y dependencias (H-2)

**Recomendada**:

- **Una lista de ventas** con filtros por fecha, cliente y si está anulada, y **un detalle** con su anulación si la hay.
- **El detalle del pedido muestra su venta y el detalle de la venta muestra su pedido.** Las dos cosas las compone la página llamando a la interfaz de cada módulo, **nunca `orders` leyendo `sales`**.
- **El módulo `sales`** depende de:
  - `crm`, `catalog`, `inventory`, `numbering`, `organizations` y `audit`;
  - `orders`, para leer y bloquear el pedido por su interfaz;
  - `auth`, solo en `schema.ts`, para el autor.

  **Ningún módulo depende de `sales`.**

### D-12 — Roles y agente

**Recomendada**:

- **Solo un `admin`** emite y anula, como los pedidos y los ajustes.
- **Un `viewer`** ve la lista y el detalle, **sin los datos de contacto del cliente**, como en `orders`.
- Ninguna venta muestra el costo ni el margen.
- **El agente no emite, no anula ni lee ventas** en la Fase 20 (ADR 0016, punto 5: el agente nunca registra un cobro, y una venta es la operación comercial cerrada). Ningún contrato con el agente cambia. **La lectura de los pedidos del cliente que el agente pidió** (`Respuesta-19.4-Agente-al-CRM.md` §4) sigue siendo una candidata aparte, fuera de esta fase.

### D-13 — Datos de un cliente

**Recomendada**:

- la venta apunta al cliente con la clave compuesta y `ON DELETE RESTRICT`: **un cliente con ventas no se borra**, se vacía, como con los pedidos;
- la venta no guarda texto de la persona, así que el vaciado no la toca;
- el motivo de una anulación se trata como el de un ajuste;
- **la exportación incluye sus ventas y anulaciones**, y el informe del runbook las cuenta.

Lo implementa la 20.2 para las ventas y la 20.4 para las anulaciones, con su test.

### D-14 — Qué crea cada subfase

**Recomendada**:

| Qué | Subfase |
|---|---|
| El módulo `sales`, `sales` y `sale_lines` (con `order_id` obligatorio en la 20.2), el tipo `sale` de `document_kind`, el `entity_type` `sale`, la emisión desde un pedido entregado, la lista, el detalle, la página imprimible, la venta en el detalle del pedido y en los datos de un cliente | **20.2** |
| La venta sin pedido: `order_id` y el cliente nulables, el tipo de movimiento `sale` y su función en `inventory`, la regla de lo disponible y las reglas de línea compartidas con el pedido | **20.3** |
| La anulación: su tabla, el tipo `sale_void` de `document_kind` y del movimiento, la reposición, el motivo y su lugar en los datos de un cliente | **20.4** |

### D-15 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes de pedir la aceptación, como en la 19.1. La hace un agente de solo lectura contra:
  - este brief;
  - los ADR 0007, 0008, 0013, 0014, 0016, 0019 y 0020;
  - DataModel, Overview, el runbook de datos de un cliente;
  - `src/modules/numbering/`, `src/modules/inventory/`, `src/modules/orders/` y `src/shared/money/`.
- **Cuándo cierra**: cuando el ADR esté aceptado o rechazado y estén escritas estas enmiendas, con fecha y conservando el texto anterior:
  - **Roadmap** §Fase 20, con las subfases;
  - **DataModel**: §«Explícitamente fuera de este modelo», una nota de diseño con las tablas que vienen, sin tablas; y §`clients`, la nota de D-10;
  - **ADR 0019** y **ADR 0020**: una nota fechada que remite al 0021, sin cambiar su texto;
  - **`docs/decisions/README.md`**: el ADR 0021 y este brief.

## Alcance incluido

- `docs/decisions/0021-la-venta.md`, nuevo, y este brief;
- la entrada del Roadmap que registra la apertura de la Fase 20 con fecha (escrita el 2026-10-12, junto con este brief);
- con el ADR aceptado, las enmiendas de D-15;
- en el cierre: `CHANGELOG.md` y `HANDOFF.md`.

## Alcance excluido

- **Código, migraciones, tablas, dependencias y cambios en la forma de un contrato.** Las tablas son de la 20.2 a la 20.4.
- Los cobros, los medios de pago, las señas y la caja (Fase 21); las compras (Fase 22).
- Las devoluciones como operación propia, las notas de crédito o débito parciales, los descuentos, las listas de precios y los tipos de cambio.
- La factura de ARCA, los puntos de venta, las percepciones y las retenciones.
- La discriminación del IVA, la condición de la organización, las alícuotas, el documento y el CUIT/CUIL, salvo que el usuario cambie D-9 o D-10.
- Las métricas de ventas en el dashboard.
- Cambios en el agente o en su repositorio, y avisos al agente.

## Fuentes de verdad

- ADR 0007, 0008, 0013, 0014, 0016, 0019 y 0020.
- DataModel §Reglas de diseño, §`clients`, §`inventories`, §`inventory_movements`, §`orders`, §`order_lines`, §`document_counters`, §`audit_logs`, §«Explícitamente fuera de este modelo».
- Overview §Módulos y §Reglas de dependencia.
- Runbook de datos de un cliente.
- `src/modules/numbering/`, `src/modules/inventory/`, `src/modules/orders/`, `src/shared/money/`.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **El saldo nunca queda negativo** y lo reservado nunca supera el saldo (ADR 0008, ADR 0020).
3. **Una venta de un pedido nunca vuelve a descontar** (ADR 0020, punto 4).
4. **Un comprobante emitido no se edita ni se borra**: se anula con otro (ADR 0016, punto 4; ADR 0019, punto 2).
5. **El dinero no pasa nunca por un `number`**, y los montos de un comprobante no se recalculan.
6. **Ninguna dependencia de `orders`, `inventory`, `catalog` o `numbering` hacia `sales`**, y ningún `JOIN` entre módulos.
7. **Lo que el agente lee y escribe no cambia**, y el CRM no llama al agente (ADR 0014).

## Criterios de aceptación

- **AC-1**: el ADR 0021 responde D-2 a D-13, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR fija, para la venta de un pedido, la venta sin pedido y la anulación de cada una, su efecto sobre el saldo físico y lo reservado, sin ningún camino que descuente dos veces, que deje un saldo negativo o que se lleve unidades reservadas (H-1).
- **AC-3**: el ADR fija cómo se impiden dos ventas vigentes del mismo pedido y dos anulaciones de la misma venta, también con emisiones simultáneas, y el orden de bloqueo de cada operación frente a las del pedido y al ajuste manual.
- **AC-4**: el ADR fija las dependencias del módulo `sales` y cómo se compone la venta en el detalle del pedido sin que `orders` dependa de `sales` (H-2).
- **AC-5**: el ADR resuelve el signo de los montos de la anulación (H-6) y qué es emitir un comprobante entregable (H-3).
- **AC-6**: el ADR dice qué pasa con el IVA, la condición de la organización, las alícuotas, el documento y el CUIT/CUIL, y cómo queda el ADR 0019, punto 7, sin contradecirlo (H-4, H-5).
- **AC-7**: el ADR dice qué tabla crea cada subfase y no crea ninguna en la 20.1.
- **AC-8**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado contra el código o el documento citado.
- **AC-9**: con el ADR aceptado, las enmiendas de D-15 están escritas, fechadas, conservan el texto anterior y no contradicen al ADR.
- **AC-10**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato con el agente o enmendar el texto del ADR 0007, 0008, 0014, 0016, 0019 o 0020, o una prohibición de `CLAUDE.md`;
- una decisión obliga a `orders`, `inventory`, `catalog` o `numbering` a depender de `sales`;
- una decisión necesita una dependencia nueva;
- hace falta tocar un archivo fuera de la lista.

Pedir autorización explícita, en su turno, **antes de**:

- cada commit y push;
- lanzar la revisión independiente si el usuario cambia una decisión que afecta su alcance;
- el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0021-la-venta.md`, escrito el 2026-10-12 como **propuesto**. Nivel: diseñado.

### Revisión independiente (D-15, AC-8)

La hizo el 2026-10-12 un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, los ADR 0007, 0008, 0013, 0016, 0019 y 0020, DataModel, Overview, el runbook de datos de un cliente, el Roadmap, Scope y el código de `numbering`, `inventory`, `orders`, `audit`, `src/shared/money/`, las migraciones `0036` a `0038` y las guardas de escrituras y de módulos. Fijó la escala antes de mirar. Veredicto: **R1**, con 12 hallazgos (3 bloqueantes, 5 medios, 4 bajos) y 7 notas. Encontró sólidos el diseño de stock, la cadena de reemplazos, el orden de bloqueo y las dependencias (N-1 a N-3), y ciertas las afirmaciones del ADR sobre el estado actual (N-5).

Cada hallazgo se verificó contra la fuente citada antes de aceptarlo, y los doce se confirmaron:

- **R-1, bloqueante**: el ADR contradecía DataModel sin enmendarlo: §`inventories` (lista cerrada de quién cambia el saldo), la regla 14, §`clients` («consumidor final … llega con el comprobante de la Fase 20»), §`document_counters` (un tipo, no dos) y la nota del ADR 0019 en §«Explícitamente fuera». **Corrección**: §Consecuencias lista cada enmienda, con su vigencia.
- **R-2, bloqueante**: el motivo libre de la anulación quedaba en una tabla de solo inserción que cuelga de un cliente, fuera del alcance del vaciado, y la regla «como el motivo de un ajuste, no describe a la persona» no existe. **Decidido por el usuario el 2026-10-12**: un motivo de **lista cerrada**, sin texto libre (cambia D-7).
- **R-3, bloqueante por AC-1**: D-6 y D-13 no tenían alternativas descartadas. Agregadas.
- **R-4, medio**: la venta de un pedido relee el punto 3 del ADR 0019 sin decirlo, y la cita del punto 7 omitía «(la 20)». Declarada la relectura y citado el paréntesis; la nota del 0019 cubre las dos.
- **R-5, medio**: la nota del ADR 0020 cubría menos de lo que cambia. Ahora suma las escrituras de `inventories`, el tipo de `document_kind` y la dependencia hacia `orders`.
- **R-6, medio**: Overview §Evolución hacia ERP quedaba contradicha. Enmienda agregada, y la 20.2 actualiza la tabla de módulos.
- **R-7, medio**: FR-CLI-05 y el Roadmap §Fase 17 mandaban documento y CUIT/CUIL a la Fase 20. Enmiendas agregadas.
- **R-8, medio**: faltaba el pendiente de la Ley 27.743 frente a un comprobante interno entregado. Agregado como riesgo, a resolver con la 13.5.2-b antes de que un negocio real entregue comprobantes.
- **R-9 a R-12, bajos**: el `CHECK` de `replaces_sale_id` con `IS DISTINCT FROM` y las claves compuestas; `sales` en la lista de módulos de ESLint a cargo de la 20.2; el `CONFLICT` por precio cambiado y el código de barras, pasados al brief de la 20.3; la cita del ADR 0016, punto 5, que no habla de ventas, reescrita.
- **Notas**: N-3, que la reposición puede chocar con el máximo de `numeric(14, 3)`: agregada la regla `stock_limit`; N-6, `.claude/settings.json` sin seguimiento: es conocido y nunca entra en un commit.

**Una corrección cambia una decisión aprobada**: R-2, sobre D-7, ya decidida por el usuario. Las demás completan el ADR sin cambiar ninguna recomendación.

## Cierre

- **2026-10-12**: el usuario **aceptó el ADR 0021** con las correcciones de la revisión independiente, incluida la de R-2, que cambia D-7 (el motivo de la anulación pasa a una lista cerrada). AC-10 cumplido.
- **Enmiendas escritas ese día, con fecha y conservando el texto anterior** (AC-9):
  - el Roadmap §Fase 20 (la 20.1 cerrada) y §Fase 17 (documento y CUIT/CUIL);
  - DataModel: la regla 14, §`clients` (la tabla y los campos ampliados), §`inventories`, §`document_counters` y la nota de §«Explícitamente fuera de este modelo»;
  - Overview §Evolución hacia ERP;
  - FR-CLI-05;
  - las notas de los ADR 0019 y 0020;
  - el README de decisiones.

  Son más que las que preveía D-15: la revisión independiente encontró las que faltaban (R-1, R-5, R-6 y R-7).
- **Nivel**: diseñado. No hay código, tablas, migraciones ni cambios en la forma de ningún contrato. El agente no recibe ningún aviso en esta subfase.
- **Revisión**: la del ADR fue independiente (§Resultados). La verificación de las enmiendas contra el ADR es autoevaluación.
- **Siguiente**: el brief de la 20.2, la venta de un pedido entregado.
