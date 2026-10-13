---
schema: task-brief.v1
task_id: "21.1"
task_type: design
generated_at: 2026-10-13
---

# Brief 21.1 — ADR de cobros y caja

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que ordene. No hay código, migraciones, dependencias ni cambios en la forma de ningún contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución.
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: primera subfase de la Fase 21 — Caja y cobros, abierta el 2026-10-13 por decisión del usuario con la Fase 13 abierta ([ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 3). Orden aprobado por el usuario ese día:
  1. **21.1 — ADR de cobros y caja**;
  2. **21.2 — medios de pago y el cobro de una venta**;
  3. **21.3 — la seña** (el cobro contra un pedido);
  4. **21.4 — la anulación del cobro** (incluida la devolución);
  5. **21.5 — la caja** (apertura, cierre y arqueo).

  De la 21.2 a la 21.5 son provisionales: el ADR fija qué crea cada una y puede unirlas o reordenarlas (D-9 puede adelantar la caja).
- **No abre ni cierra un gate.** Fija el diseño que implementan las subfases siguientes. La revisión independiente se hace igual (D-14), como en la 19.1 y la 20.1.
- **Estado de este documento**: **aprobado el 2026-10-13** por el usuario, con las recomendaciones de D-1 a D-14 y dos cambios:
  - **sin Mercado Pago en la lista inicial de medios de pago** (D-3);
  - **la cuenta corriente de clientes entra en la Fase 21** (D-15, H-8). Hasta ese día no tenía fase (Roadmap, «Sin fase todavía»). D-15 se escribió después de la aprobación, y el usuario **confirmó su recomendación el mismo día**: el límite de crédito se muestra y no bloquea, y el cobro a cuenta se imputa solo, de la venta más vieja a la más nueva.

  El proyecto de la fase (`3f8702be6f4e811aad02f07b1f23d5f8`) y la tarea 21.1 (`3f8702be6f4e81b1aa1df3d40bafb09d`, en «Esperando») se crearon en Notion ese día, con la autorización del usuario.

## Objetivo

Decidir con un ADR, el **0022**, **qué es un cobro en el CRM y qué es la caja**:

- contra qué se cobra (una venta, un pedido) y cuántas veces;
- qué es una seña y qué le pasa cuando el pedido se vende o se cancela;
- qué pasa con lo cobrado cuando la venta se anula o el pedido se cancela;
- los medios de pago;
- qué es una caja, quién la abre y la cierra y qué guarda el arqueo;
- el número y el comprobante entregable;
- quién lo opera, qué ve el agente y qué pasa con los datos de un cliente.

El ADR **no crea tablas**: las crean las subfases siguientes.

## Lo que se verificó antes de escribir este brief

Releído el 2026-10-13 contra el código y los documentos de `main` (`9add7d5`):

- **El perímetro** (Roadmap §Fase 21): medios de pago, cobros contra una venta o un pedido (incluidas las señas) y apertura y cierre de caja con arqueo. El agente nunca registra un cobro. **La cuenta corriente de clientes no tiene fase** (Roadmap, «Sin fase todavía»), y la Fase 22 es la de compras y proveedores.
- **El ADR 0016**:
  - punto 4: el dinero es `numeric` con moneda explícita; lo que mueve dinero es de solo inserción, y un comprobante emitido se anula con otro; cada fase agrega su módulo (da `cash` como ejemplo);
  - punto 5: **el agente nunca registra un cobro, un pago ni un movimiento de caja**, y «Quiere señar» sigue siendo una etiqueta;
  - punto 6: los comprobantes son internos, no fiscales.
- **El ADR 0019**: numeración sin huecos por `(organization_id, tipo)` con `numbering`; una moneda por comprobante, sin tipos de cambio; `numeric(14, 2)` con `src/shared/money/`, donde `moneyToDatabase` rechaza un monto negativo; la leyenda «Documento no válido como factura».
- **El ADR 0020**: el pedido es un compromiso con estado (`pending`, `confirmed`, `delivered`, `cancelled`, los dos últimos finales). Se bloquea `FOR UPDATE` por su cabecera.
- **El ADR 0021**:
  - la venta es un comprobante de solo inserción, sin estados; «anulada» se deriva de que exista su `sale_voids`;
  - una venta se emite solo desde un pedido `delivered`, y **«si el negocio cobra antes de entregar, lo resuelve la Fase 21 con un cobro contra el pedido»** (§Alternativas descartadas);
  - un pedido puede tener una cadena de ventas, de la que solo el último eslabón puede estar vigente (`replaces_sale_id`, punto 3);
  - punto 9: **«Ningún módulo depende de `sales`»**; la venta en el detalle del pedido la compone la página;
  - punto 10: solo `admin` emite y anula; `viewer` ve sin los datos de contacto del cliente.
- **DataModel**:
  - **la regla 14**: «Compras, proveedores y pagos siguen sin modelo»;
  - **§«Explícitamente fuera de este modelo»**: lista `payments` y `cash_accounts`;
  - **§`knowledge_entries`**: «“aceptamos transferencia” es una entrada, no una tabla de medios de pago (regla 14)». La lee el agente por `read-v1`;
  - **§`sale_voids`**: «La venta se lee sin bloqueo: es inmutable, y `crm_app` no puede pedirla `FOR UPDATE` porque no tiene `UPDATE` en `sales`»;
  - §`document_counters`: `document_kind` tiene `order`, `sale` y `sale_void` (igual en `src/modules/numbering/schema.ts`).
- **El código**:
  - `src/modules/` tiene `analytics`, `audit`, `auth`, `catalog`, `conversations`, `crm`, `ingestion`, `inventory`, `knowledge`, `numbering`, `orders`, `organizations` y `sales`: no hay ningún módulo de cobros ni de caja;
  - `src/modules/sales/index.ts` dice «Ningún módulo depende de sales: la usan solo las pantallas», y exporta `getSale`, `getSaleForOrder`, `issueSale`, `issueSaleFromOrder` y `voidSale`, entre otros;
  - `voidSale` (sales) y `cancelOrder` (orders) no consultan nada fuera de su módulo, salvo el stock;
  - `audit_entity_type` llega hasta `sale`, y `audit_action` incluye `create`, `status_change` y, desde la 20.4, `void`;
  - `member_role` es `admin` o `viewer`.
- **Fronteras** (Overview §Reglas de dependencia, releídas con `grep` en esta pasada): un módulo usa otro solo por su `index.ts`; no hay `JOIN` contra tablas ajenas fuera de `analytics`; un caso de uso que escribe tablas de varios módulos abre la transacción en el módulo dueño de la regla; una lista con datos de dos módulos se compone en memoria.
- **MetricsCatalog** no tiene ninguna métrica de cobros ni de caja.
- **El boceto de negocio** (tres notas de Notion de junio y julio de 2026: «Página 2 — Caja», «Página 4 — Cobros», «Flujo de cobros»): son diseños de pantallas **para Airtable** de otro proyecto. Se leyeron solo como contexto de negocio y no se toma de ellos ningún diseño. Aportan los medios usados (efectivo, transferencia, tarjeta, Mercado Pago) y dos excepciones reales: el cobro parcial y la venta anulada antes de cobrarse.

### Hallazgos

- **H-1. Un cobro contra una venta crea la primera dependencia hacia `sales`.** El ADR 0021, punto 9, el Overview (fila `sales` y §Evolución hacia ERP) y el comentario de `sales/index.ts` dicen «ningún módulo depende de `sales`». No es una prohibición: describe el grafo de la Fase 20. El ADR 0022 lo cambia con una nota fechada en el 0021 y la enmienda del Overview (D-10).
- **H-2. La anulación de una venta y la cancelación de un pedido no pueden consultar los cobros sin crear un ciclo.** Si el módulo de cobros depende de `sales` y de `orders` para leer y bloquear, ninguno de los dos puede leer los cobros. Hay dos salidas:
  - la anulación y la cancelación **no miran los cobros**, y lo cobrado de una venta anulada o de un pedido cancelado queda **a devolver**, a la vista en el módulo de cobros;
  - o la regla «no se anula lo que tiene cobros vigentes» la lleva el módulo de cobros, que abre la transacción y llama a `voidSale` o `cancelOrder` con ella, y las pantallas dejan de llamarlos directamente.

  Es D-6.
- **H-3. La venta no se puede bloquear.** Según DataModel §`sale_voids`, `crm_app` no tiene `UPDATE` en `sales` y no puede pedir la fila `FOR UPDATE`. **A verificar en el ADR contra la documentación de PostgreSQL**, no suponerlo: la cláusula de bloqueo pediría el privilegio `UPDATE` también en `FOR SHARE` y `FOR KEY SHARE`. Si un cobro no puede superar lo que falta cobrar, dos cobros parciales simultáneos de la misma venta necesitan otro punto de serialización (D-4).
- **H-4. «Pagos» es ambiguo.** DataModel y Scope usan «pagos» y `payments` para lo que el ERP paga (Fase 22), y el Roadmap usa «medios de pago» para cómo cobra el negocio. Llamar `payments` a la tabla de cobros chocaría con la Fase 22. El ADR fija los nombres (D-12).
- **H-5. Los medios de pago tendrían dos fuentes.** Hoy son texto de `knowledge_entries`, y el agente los lee así. Una lista estructurada para registrar cobros no tiene por qué reemplazar ese texto: la 17.4 (H-2 y H-3) ya concluyó que, como lista, no cambian lo que el agente responde. Si el ADR la hace la fuente de «qué acepta el negocio», cambia lo que el agente lee y exige un contrato (D-3).
- **H-6. Los cobros parciales se acercan a la cuenta corriente, que no tiene fase.** «Lo que falta cobrar de esta venta» es un saldo por comprobante. El saldo del cliente, un cobro imputado a varias ventas o el saldo a favor son la cuenta corriente. El ADR tiene que trazar esa línea (D-4).
- **H-7. La regla 14 y §«Explícitamente fuera» de DataModel**, que está por encima de los ADR en la jerarquía de `CLAUDE.md`, quedan contradichas al aceptarse el ADR. Se enmiendan con fecha, como hizo el ADR 0021 (D-14).
- **H-8. La cuenta corriente entra en la fase por decisión del usuario del 2026-10-13**, al aprobar este brief. El Roadmap la tenía en «Sin fase todavía», con la regla «entran cuando el uso los pida, con su decisión»: esta es esa decisión, y el Roadmap se enmienda con fecha. Cambia H-6: la línea que había que trazar pasa a ser el diseño de la cuenta corriente (D-15). **Una restricción que se mantiene**: `sales` no puede depender del módulo de cobros (H-2). Un límite de crédito que impidiera emitir una venta crearía ese ciclo.

## Decisiones

Cada una trae una recomendación. El usuario la aprueba, la cambia o la rechaza.

### D-1 — Qué decide el ADR y qué no

**Recomendada**:

- **Entran**:
  - el cobro y contra qué se registra;
  - la seña;
  - lo cobrado de una venta anulada o de un pedido cancelado;
  - la anulación del cobro y la devolución;
  - los medios de pago;
  - la caja, su apertura, su cierre y el arqueo;
  - el número y el comprobante entregable;
  - las dependencias, los roles, el agente y los datos de un cliente;
  - *agregada por el usuario el 2026-10-13*: la cuenta corriente del cliente (D-15);
  - qué crea cada subfase.
- **No entran**:
  - ~~la cuenta corriente del cliente (H-6)~~ (pasó a entrar, H-8);
  - los intereses, los vencimientos y los recordatorios de deuda;
  - los pagos a proveedores y los gastos (Fase 22 o sin fase);
  - la conciliación bancaria o de Mercado Pago, y cualquier integración con un medio de pago;
  - las cuotas, los recargos, los descuentos por medio de pago y los tipos de cambio;
  - la factura de ARCA;
  - las métricas de cobros y de caja.

### D-2 — El cobro es un comprobante emitido, de solo inserción

- **(a) Recomendada**: **el cobro es un comprobante del ADR 0019.**
  - Es de solo inserción, con trigger: `crm_app` tiene `SELECT` e `INSERT` (ADR 0013, regla 10 de DataModel).
  - **No tiene estados.** Lo que lo anula es otro comprobante (D-7).
  - Registra **un monto, en un medio de pago**, contra **una venta o un pedido**, nunca contra los dos ni contra ninguno.
  - **La moneda es la del comprobante cobrado**, sin tipos de cambio (ADR 0019).
  - Se audita en la misma transacción.
- (b) Un cobro con estado (`registrado`, `anulado`). Contradice el ADR 0016, punto 4, como la alternativa (b) del ADR 0021, punto 2.
- (c) Un campo «pagado» en la venta. La venta es inmutable (ADR 0021, punto 2).

### D-3 — Los medios de pago (H-5)

- **(a) Recomendada**: **una lista por organización, editable con borrado lógico** (regla 8), solo de `admin`.
  - Cada medio dice **si es efectivo**. Solo el efectivo pasa por la caja (D-8).
  - Nace con los medios de una lista inicial: efectivo, transferencia, tarjeta de débito y tarjeta de crédito. El `admin` la desactiva o la amplía. *Cambiado por el usuario el 2026-10-13*: la recomendación incluía Mercado Pago, y la lista inicial no lo lleva.
  - **Es la lista de con qué se registró un cobro, no la de qué acepta el negocio.** El agente sigue leyendo los medios de pago como texto de la información del negocio. **`read-v1` no cambia**, y estructurar lo que lee el agente sigue siendo una candidata aparte.
- (b) Un enum fijo. No deja agregar el medio de un negocio, y cada medio nuevo sería una migración.
- (c) Que la lista reemplace la entrada de texto y la lea el agente. Cambia un contrato con el agente para un uso que nadie pidió.

### D-4 — Cuánto y cuántas veces se cobra (H-3, H-6)

- **(a) Recomendada**:
  - **Un comprobante admite varios cobros**: parciales, en distintos medios y en distintos días.
  - **Lo que falta cobrar se deriva**: el total menos los cobros vigentes. No se guarda en ninguna columna.
  - **Un cobro no puede superar lo que falta cobrar.** No hay saldo a favor ni vuelto registrado: el vuelto del efectivo se resuelve en el mostrador y se registra lo que queda.
  - **La serialización** de dos cobros simultáneos del mismo comprobante la fija el ADR después de verificar H-3:
    - el pedido se bloquea `FOR UPDATE` por la interfaz de `orders`;
    - para la venta, la propuesta es la del contador: comprobar, tomar el contador del cobro y **volver a comprobar con el contador tomado**, que serializa los cobros de la organización. El patrón y su prueba vienen de la 20.4 (DataModel §`sale_voids`, y la nota de conocimiento sobre retener la fila desde una tercera conexión);
    - la otra opción es una fila propia por comprobante cobrado que se pueda bloquear.
  - **La línea con la cuenta corriente**: el saldo es **por comprobante**. Un cobro va a un solo comprobante. El saldo total del cliente, un cobro repartido entre varias ventas y el saldo a favor son la cuenta corriente, sin fase. *Superado el 2026-10-13 por H-8*: la cuenta corriente entra en la fase y la diseña D-15. Lo que sigue en pie de este punto es que **un cobro contra una venta o un pedido nunca supera lo que le falta cobrar**. El cobro a cuenta y el saldo a favor son de D-15.
- (b) Un solo cobro por comprobante, por el total. No cubre la seña ni el pago dividido entre efectivo y tarjeta, que el boceto registra como casos reales.
- (c) Cobros sin tope. El exceso sería un saldo a favor, que es cuenta corriente.

### D-5 — La seña

- **(a) Recomendada**: **la seña es un cobro contra un pedido** (ADR 0021, §Alternativas descartadas), no un comprobante aparte.
  - Se cobra contra un pedido `pending` o `confirmed`, nunca contra uno `delivered` o `cancelled`.
  - **Cuando el pedido se entrega y se vende**, lo que falta cobrar de la venta descuenta lo cobrado contra su pedido: **los cobros del pedido cuentan para todas las ventas de su cadena** (`replaces_sale_id`). El cobro sigue apuntando al pedido, sin moverse ni copiarse.
  - **Cuando el pedido se cancela**, lo cobrado queda a devolver (D-6).
  - «Quiere señar» sigue siendo una etiqueta: no crea ni sugiere un cobro (ADR 0016, punto 5).
- (b) Mover la seña a la venta al emitirla, con otro comprobante. Agrega un comprobante y una escritura en la emisión de `sales`, que tendría que depender del módulo de cobros (H-2).
- (c) Cobrar contra un pedido `delivered` sin vender. Deja cobros sobre un pedido que tiene que convertirse en venta. El cobro va a la venta.

### D-6 — Lo cobrado de una venta anulada o de un pedido cancelado (H-2)

- **(a) Recomendada**: **anular una venta y cancelar un pedido no miran los cobros.**
  - Lo cobrado de una venta anulada o de un pedido cancelado **queda a devolver**. El módulo de cobros lo deriva, y la lista de cobros y el detalle del comprobante lo muestran.
  - La plata ya entró: el sistema no la devuelve sola. La devolución es una operación explícita (D-7).
  - Si la venta de un pedido se anula y se vuelve a emitir, los cobros del pedido cuentan para la venta nueva (D-5). **Solo queda a devolver lo cobrado contra la venta anulada.**
  - `sales` y `orders` **no cambian**. Ningún ciclo.
- (b) Prohibir anular o cancelar con cobros vigentes. La regla la lleva el módulo de cobros, que abre la transacción y llama a `voidSale` o `cancelOrder` con ella, y las pantallas dejan de llamarlos directamente. Cambia dos operaciones cerradas (20.4 y 19.3) y obliga a anular cada cobro antes, aunque la plata no se haya devuelto.
- (c) La anulación genera la devolución automáticamente. Registra una salida de caja que nadie hizo.

### D-7 — La anulación del cobro y la devolución

- **(a) Recomendada**: **dos operaciones distintas, cada una con su comprobante de solo inserción**:
  - **la anulación** corrige un cobro mal registrado: la plata nunca entró, o entró por otro medio. Anula el cobro entero, a lo sumo una vez (`UNIQUE`), con un motivo de una lista cerrada, como la anulación de la venta (ADR 0021, punto 6, R-2 de la 20.1). El cobro anulado deja de contar;
  - **la devolución** registra que la plata salió hacia el cliente. Solo se registra lo que está a devolver (D-6), por un medio de pago y por un monto de hasta lo que falta devolver. Si es en efectivo, sale de la caja.
  - **Los montos son positivos en los dos**: el efecto lo da el tipo, como en `sale_voids`. `src/shared/money/` no cambia.
- (b) Una sola operación, «anular», que sirva para las dos. Mezcla un error de carga con una salida real de dinero, y el arqueo no los distingue.
- (c) Montos negativos. Exige cambiar `src/shared/money/` y cada suma (H-6 de la 20.1).

### D-8 — La caja

- **(a) Recomendada**:
  - **Una caja por organización: la de efectivo.** Los demás medios no pasan por la caja: van al banco o a la billetera, y su conciliación está fuera (D-1).
  - **La caja se abre y se cierra por turnos (sesiones).** Una sola sesión abierta a la vez, por restricción de la base. La apertura guarda el efectivo inicial contado.
  - **El cierre guarda el arqueo**:
    - lo contado;
    - lo esperado, que se calcula como el inicial más los cobros en efectivo, menos las devoluciones en efectivo, más o menos los movimientos manuales;
    - la diferencia.

    Una sesión cerrada no cambia.
  - **Movimientos manuales de caja** (retiro y aporte de efectivo), con un motivo de una lista cerrada. **Un gasto no es un movimiento de caja**: los pagos son de la Fase 22.
  - Solo `admin` abre, cierra y registra movimientos. Un `viewer` ve las sesiones y su arqueo.
- (b) Varias cajas por organización (efectivo, banco, Mercado Pago), como el boceto. Sin conciliación, una «caja» de banco sería un saldo que nadie verifica.
- (c) Sin sesiones: solo un saldo corrido. No hay arqueo, y el Roadmap lo pide.

### D-9 — El cobro en efectivo y la caja abierta

- **(a) Recomendada**: **un cobro o una devolución en efectivo exige una sesión de caja abierta**, y queda en ella. Sin caja abierta, se rechaza.
  - Consecuencia en el orden: **la caja pasa antes que los cobros**, y queda así:
    1. **21.2 — los medios de pago y la caja**: apertura, cierre, arqueo y los movimientos manuales;
    2. **21.3 — el cobro de una venta**;
    3. **21.4 — la seña**;
    4. **21.5 — la anulación y la devolución**;
    5. **21.6 — la cuenta corriente** (D-15, agregada el 2026-10-13).

    Las tareas de Notion se renombran al aceptarse el ADR.
- (b) La caja al final, como en el orden provisional, y el efectivo cobrado antes de la 21.5 sin sesión. Deja cobros en efectivo que ningún arqueo cuenta. Hoy solo afectaría a la demo.

### D-10 — El módulo y las dependencias (H-1, H-2)

**Recomendada**:

- **Un solo módulo nuevo, `cash`** (el nombre del ADR 0016, punto 4), dueño de los medios de pago, los cobros, sus anulaciones, las devoluciones, las sesiones de caja y sus movimientos.
- **`cash` depende de**:
  - `sales`, para leer la venta, su total, si está anulada y su cadena;
  - `orders`, para leer y bloquear el pedido;
  - `numbering`, `organizations` y `audit`;
  - `crm`, para el nombre del cliente en las lecturas;
  - `auth`, solo en `schema.ts`, para el autor.
- **Ni `sales` ni `orders` dependen de `cash`.** Lo cobrado en el detalle de la venta y del pedido lo compone la página, como la venta en el detalle del pedido (ADR 0021, punto 9).
- Se enmiendan, con fecha, el ADR 0021, punto 9 (nota), el Overview y el comentario de `sales/index.ts` (en la subfase que cree la dependencia).
- Si `sales` o `orders` necesitan una función nueva en su interfaz (por ejemplo, para bloquear el pedido para un cobro), el ADR la nombra.

### D-11 — Roles y agente

**Recomendada**:

- **Solo un `admin`** cobra, anula, devuelve y opera la caja.
- **Un `viewer`** ve los cobros, las devoluciones y las sesiones, **sin los datos de contacto del cliente**, como en `sales`.
- **El agente no registra ni lee cobros, devoluciones ni movimientos de caja** (ADR 0016, punto 5). **Ningún contrato con el agente cambia**, y el agente no recibe ningún aviso en esta fase.

### D-12 — El número, los nombres y el comprobante entregable (H-4)

**Recomendada**:

- **El cobro lleva número**, con un tipo nuevo en `document_kind` y su prefijo, como recibo (por ejemplo `R-000123`).
- **La anulación del cobro y la devolución** llevan cada una su serie.
- **La sesión de caja** se numera o no: lo decide el ADR. No es un comprobante entregable.
- **Nombres**: ninguna tabla se llama `payments`, para no chocar con los pagos de la Fase 22. El ADR fija los nombres.
- **El comprobante del cobro y el de la devolución son páginas imprimibles**, como el de la venta (ADR 0021, punto 8): la organización, el número, la fecha, el cliente, el comprobante cobrado, el medio, el monto y la leyenda «Documento no válido como factura».
- **Sin texto libre** en el cobro (ni referencia de la operación ni observaciones), como la venta.

### D-13 — Datos de un cliente

**Recomendada**:

- Los cobros y las devoluciones no guardan texto de la persona. Llegan al cliente por su comprobante.
- **La exportación de un cliente incluye sus cobros, anulaciones y devoluciones**, y el informe del runbook los cuenta.
- Un cliente con cobros no se borra, se vacía, como con ventas y pedidos.
- Las sesiones y los movimientos de caja no son de ningún cliente.

### D-15 — La cuenta corriente del cliente (H-8)

*Agregada el 2026-10-13 por decisión del usuario, que confirmó la recomendación (a) ese día.*

- **(a) Recomendada: una cuenta derivada, sin tabla de saldos.**
  - **El saldo de un cliente se deriva** de sus comprobantes:
    - al debe, las ventas vigentes con ese cliente (una venta anulada deja de contar);
    - al haber, los cobros vigentes de esas ventas y de sus pedidos, y los cobros a cuenta;
    - las devoluciones restan del haber.

    No se guarda en ninguna columna, igual que lo que falta cobrar de un comprobante (D-4).
  - **El cobro a cuenta**: un cobro contra la cuenta del cliente, sin elegir un comprobante. Es el mismo comprobante de D-2, con la cuenta como destino. D-2 pasa a «contra una venta, un pedido o la cuenta de un cliente, siempre uno solo».
  - **La imputación se deriva, y no se guarda**:
    - el cobro contra un comprobante va a ese comprobante;
    - el cobro a cuenta se reparte entre las ventas con saldo, de la más vieja a la más nueva;
    - lo que sobra es saldo a favor.

    Así, lo que falta cobrar de una venta y el saldo del cliente salen de la misma regla y no pueden contradecirse.
  - **El saldo a favor** existe solo en la cuenta de un cliente. Lo que queda a devolver de un cliente (D-6) puede **quedar a favor en su cuenta en lugar de devolverse**, sin otro comprobante: es la misma plata, imputada a lo que venga.
  - **Toda venta con cliente entra en su cuenta.** Una venta sin cliente (consumidor final) no tiene cuenta y se cobra contra el comprobante.
  - **Sin límite de crédito que bloquee**: impedir emitir una venta por el saldo obligaría a `sales` a depender de `cash` (H-2, H-8). La página de la venta puede **mostrar** el saldo del cliente, compuesto por la página.
  - **El estado de cuenta**: una pantalla por cliente con sus comprobantes, cobros, devoluciones y saldo, imprimible como los comprobantes. También la lista de clientes con saldo deudor.
  - **La dependencia**: `cash` lee las ventas de un cliente por la interfaz de `sales`, y las compone en memoria. `crm` no depende de `cash`: el saldo en la ficha del cliente lo compone la página.
  - **Subfase**: una propia y al final, **21.6 — la cuenta corriente** (provisional), porque se apoya en los cobros, la seña y la devolución.
- (b) **Una cuenta con su tabla de movimientos** (debe, haber y saldo corrido, de solo inserción). Duplica en otra tabla lo que ya dicen las ventas y los cobros: dos fuentes que pueden contradecirse, y cada venta nueva tendría que escribir en `cash`, es decir, `sales` dependiendo de `cash`.
- (c) **La imputación manual**: elegir a qué ventas va cada cobro a cuenta. Hay que guardar la imputación y cuidar que no la contradiga una anulación posterior. Se puede sumar después, si el uso lo pide.
- (d) **Habilitar la cuenta corriente por cliente, con un límite de crédito.** El límite que bloquea tiene el problema de H-2. Una marca que solo informa no cambia nada de lo que el sistema hace.

### D-14 — Revisión independiente y cierre

**Recomendada**:

- **Revisión independiente**: sí, antes de pedir la aceptación, como en la 20.1. La hace un agente de solo lectura contra:
  - este brief;
  - los ADR 0013, 0014, 0016, 0019, 0020 y 0021;
  - DataModel, Overview, Roadmap, Scope y el runbook de datos de un cliente;
  - `src/modules/sales/`, `src/modules/orders/`, `src/modules/numbering/`, `src/modules/knowledge/` y `src/shared/money/`.
- **Cuándo cierra**: cuando el ADR esté aceptado o rechazado y estén escritas sus enmiendas, con fecha y conservando el texto anterior. Como mínimo:
  - **DataModel**: la regla 14, §«Explícitamente fuera de este modelo» (una nota de diseño con las tablas que vienen, sin tablas), §`knowledge_entries` (la lista de medios no reemplaza el texto) y §`document_counters`;
  - **Overview**: §Evolución hacia ERP;
  - **el ADR 0021**: una nota fechada por el punto 9 y por la alternativa del cobro antes de entregar;
  - **el ADR 0016**: una nota fechada, sin cambiar su texto, porque deja la cuenta corriente «sin fase hasta que el uso los pida» (l. 30) y la decisión del usuario del 2026-10-13 la mete en esta (H-8); y por el punto 5, si el ADR lo precisa;
  - **Scope** §Después de la integración (l. 63): la cuenta corriente sale de la lista sin fase, con fecha;
  - **Roadmap** §Fase 21, con las subfases, y «Sin fase todavía», de donde sale la cuenta corriente (H-8);
  - **`docs/decisions/README.md`**: el ADR 0022 y este brief.

  La revisión independiente puede encontrar más, como en la 20.1.

## Alcance incluido

- `docs/decisions/0022-cobros-y-caja.md`, nuevo, y este brief;
- la entrada del Roadmap §Fase 21 con el orden aprobado el 2026-10-13;
- con el ADR aceptado, las enmiendas de D-14;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md` y la tarea de Notion.

## Alcance excluido

- **Código, migraciones, tablas, dependencias y cambios en la forma de un contrato.** Las tablas son de la 21.2 en adelante.
- ~~La cuenta corriente, el saldo a favor y la imputación de un cobro a varios comprobantes.~~ *Entran desde el 2026-10-13* (D-15). Siguen fuera los intereses, los vencimientos, los recordatorios de deuda y un límite de crédito que bloquee.
- Los pagos a proveedores y los gastos (Fase 22 o sin fase).
- La conciliación bancaria, las integraciones con medios de pago, las cuotas, los recargos y los tipos de cambio.
- La factura de ARCA y la discriminación del IVA.
- Las métricas de cobros y de caja.
- Cambios en el agente o en su repositorio, y avisos al agente.

## Fuentes de verdad

- ADR 0013, 0014, 0016, 0019, 0020 y 0021.
- DataModel §Reglas de diseño, §`knowledge_entries`, §`document_counters`, §`orders`, §`sales`, §`sale_voids`, §«Explícitamente fuera de este modelo».
- Overview §Módulos, §Reglas de dependencia y §Evolución hacia ERP.
- Roadmap §Fase 21 y «Sin fase todavía»; Scope.
- Runbook de datos de un cliente.
- `src/modules/sales/`, `src/modules/orders/`, `src/modules/numbering/`, `src/shared/money/`.

## Invariantes

1. **Ninguna tabla nueva** en esta subfase.
2. **Un comprobante emitido no se edita ni se borra**: se anula con otro (ADR 0016, punto 4; ADR 0019, punto 2).
3. **El dinero no pasa nunca por un `number`**, y los montos no son negativos.
4. **Lo cobrado de un comprobante nunca supera su total**, tampoco con dos cobros simultáneos. Lo que excede, solo por un cobro a cuenta o por lo que queda a favor, es saldo a favor de la cuenta del cliente (D-15), nunca de un comprobante.
5. **Ni `sales`, ni `orders`, ni `crm` dependen del módulo de cobros**, y ningún `JOIN` cruza módulos.
6. **El agente no registra ni lee cobros, caja ni cuentas corrientes**; lo que el agente lee y escribe no cambia, y el CRM no llama al agente (ADR 0014; ADR 0016, punto 5).
7. **El saldo de la cuenta y lo que falta cobrar de cada comprobante salen de la misma regla de imputación**, y ninguno se guarda (D-15).

## Criterios de aceptación

- **AC-1**: el ADR 0022 responde D-2 a D-13 y D-15, cada una con la decisión, las alternativas descartadas con su motivo y las consecuencias.
- **AC-2**: el ADR fija contra qué se cobra, cuánto y cuántas veces, y cómo se impide superar lo que falta cobrar con dos cobros simultáneos, con H-3 verificado contra la documentación de PostgreSQL y no supuesto.
- **AC-3**: el ADR fija qué pasa con lo cobrado de un pedido que se vende, que se cancela o cuya venta se anula y se vuelve a emitir, sin un camino que cuente un cobro dos veces ni lo pierda.
- **AC-4**: el ADR fija las dependencias del módulo nuevo sin ciclos: ni `sales` ni `orders` dependen de él (H-1, H-2).
- **AC-5**: el ADR fija qué es la caja, su sesión y su arqueo, qué movimientos la afectan, y si un cobro en efectivo exige una caja abierta, con su efecto en el orden de las subfases (D-8, D-9).
- **AC-6**: el ADR fija la cuenta corriente: cómo se deriva el saldo, cómo se imputa un cobro a cuenta, qué es el saldo a favor y por qué no hay límite de crédito que bloquee, sin que `sales` ni `crm` dependan del módulo de cobros (D-15, H-8). Dice también qué pasa con los medios de pago del texto que lee el agente (H-5). *El texto anterior pedía trazar la línea con la cuenta corriente (H-6).*
- **AC-7**: el ADR dice qué crea cada subfase y no crea ninguna tabla en la 21.1.
- **AC-8**: hay una revisión independiente antes de pedir la aceptación, con cada hallazgo verificado contra el código o el documento citado.
- **AC-9**: con el ADR aceptado, las enmiendas están escritas, fechadas, conservan el texto anterior y no contradicen al ADR.
- **AC-10**: el usuario acepta o rechaza el ADR.

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y los diffs de las enmiendas.

## Condiciones de detención

Detenerse y avisar si:

- el ADR necesita crear una tabla, cambiar la forma de un contrato con el agente, o enmendar el texto de un ADR aceptado o una prohibición de `CLAUDE.md`. Una nota fechada no es enmendar el texto;
- una decisión obliga a `sales`, `orders`, `inventory`, `catalog` o `numbering` a depender del módulo de cobros;
- una decisión necesita una dependencia nueva;
- hace falta tocar un archivo fuera del alcance.

Pedir autorización explícita, en su turno, **antes de**:

- cada commit y push;
- lanzar la revisión independiente si el usuario cambia una decisión que afecta su alcance;
- el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0022-cobros-y-caja.md`, escrito el 2026-10-13 como **propuesto**. Nivel: diseñado. H-3 se verificó contra la documentación de PostgreSQL 18 (`SELECT`, §Description): las cuatro cláusulas de bloqueo exigen el privilegio `UPDATE`, así que una venta no se puede bloquear en ningún modo. El punto de serialización es un `pg_advisory_xact_lock` por organización, el patrón que ya usan el catálogo de etiquetas y el horario.

### Revisión independiente (D-14, AC-8)

La hizo el 2026-10-13 un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, los ADR 0013, 0014, 0016, 0019, 0020 y 0021, DataModel, Overview, Roadmap, Scope, el runbook de datos de un cliente, el código de `sales`, `orders`, `numbering`, `crm`, `knowledge` y `src/shared/money/`, los privilegios de las migraciones y las guardas. Fijó la escala antes de mirar. No abrió la cita de PostgreSQL: no tenía acceso web.

**Veredicto: R1**, con 15 hallazgos (3 bloqueantes, 6 medios y 6 bajos) y 9 notas. Encontró sólidos los privilegios de `crm_app` sobre `sales` (N-1), el patrón del bloqueo (N-2), la ausencia de ciclos de deadlock (N-3) y las afirmaciones de §Contexto sobre el código, salvo R-10 (N-6).

Cada hallazgo se verificó contra la fuente citada antes de aceptarlo, y los quince se confirmaron:

- **R-1, bloqueante**: la caja no tenía moneda, y `sales.currency` es por venta. **Corrección**: la caja es por moneda (punto 8). Cambia el diseño de D-8.
- **R-2, bloqueante**: anular un cobro ya devuelto dejaba el remanente en negativo, y el saldo y las ventas se contradecían. **Corrección**: la anulación se rechaza si dejaría devuelto más de lo cobrado, y el remanente nunca es negativo (puntos 7 y 9).
- **R-3, bloqueante**: un cobro en efectivo de una sesión cerrada no tenía corrección posible. **Corrección**: se anula también con la sesión cerrada, sin tocar el arqueo guardado ni la sesión abierta (punto 7). Queda un límite declarado: el cobro correcto en efectivo de un destino equivocado entra en la sesión abierta (§Riesgos).
- **R-4, medio**: la seña de un pedido entregado con su venta anulada sin reemplazo no estaba clasificada en el punto 9. Corregido.
- **R-5, medio**: `UNIQUE` admite varios nulos, así que la cadena de sesiones no impedía dos abiertas. **Corrección**: un índice parcial de la primera sesión por organización, la clave compuesta y un trigger contra las escrituras en una sesión cerrada.
- **R-6, medio**: una devolución en efectivo podía dejar lo esperado en negativo. **Corrección**: ninguna salida lo deja negativo.
- **R-7, medio**: la devolución no tenía anulación, contra el ADR 0016, punto 4. **Corrección**: se suma la anulación de la devolución (`refund_voids`, `AD`).
- **R-8, medio**: el orden de bloqueo no tenía al cliente que toma la clave foránea. Agregado (punto 4).
- **R-9, medio**: faltaban enmiendas (Overview l. 34, 36 y 42, `sales/service.ts:58`, DataModel l. 181, ADR 0020 l. 189-190, Scope l. 56, Roadmap l. 361 y HANDOFF). Agregadas a §Consecuencias.
- **R-10 a R-15, bajos**:
  - la cita de `voidSale` y `cancelOrder`, precisada;
  - el `CHECK` del destino, con una columna discriminadora y la copia del cliente defendida por el servicio;
  - «devolución» de plata y no de mercadería;
  - las alternativas y consecuencias por punto;
  - la exportación lleva los comprobantes y no el saldo;
  - el aislamiento `READ COMMITTED`, y la guarda de dependencias que sigue como tarea aparte.

**Cuatro correcciones cambian el diseño aprobado**: R-1 (D-8), R-2 y R-3 (D-7) y R-7 (D-7). Las demás completan el ADR sin cambiar ninguna recomendación. Una nota fuera de alcance: `.claude/settings.json`, sin seguimiento, tiene permisos viejos; es conocido y nunca entra en un commit.

## Cierre

- **2026-10-13**: el usuario **aceptó el ADR 0022** con las correcciones de la revisión independiente, incluidas las cuatro que cambian o suman decisiones (R-1, R-2, R-3 y R-7). AC-10 cumplido.
- **Enmiendas escritas ese día, con fecha y conservando el texto anterior** (AC-9):
  - DataModel: la regla 14, §`client_tags`, §`knowledge_entries`, §`document_counters` y la nota de §«Explícitamente fuera de este modelo»;
  - Overview §Evolución hacia ERP;
  - Scope (las listas «Entra» y «Sigue fuera»);
  - el Roadmap §Fase 21 (la 21.1 cerrada y el orden nuevo), §Fase 17 (los medios de pago) y «Sin fase todavía»;
  - las notas de los ADR 0016, 0019, 0020 y 0021;
  - el README de decisiones.

  Son más que las que preveía D-14: la revisión independiente encontró las que faltaban (R-9). Las que dependen del código las hace la subfase que lo escribe: las filas del Overview y los comentarios de `sales/index.ts` y `sales/service.ts`.
- **Notion**, con la autorización del usuario: la 21.1 pasó a «En proceso»; las subfases se renombraron al orden del ADR 0022, punto 15; y se creó la **21.6 — La cuenta corriente** (`3f8702be6f4e8186bb32f23990a6d2da`) en «Esperando». Todo se releyó.
- **Nivel**: diseñado. No hay código, tablas, migraciones ni cambios en la forma de ningún contrato. El agente no recibe ningún aviso en esta subfase.
- **Revisión**: la del ADR fue independiente (§Resultados). La verificación de las enmiendas contra el ADR es autoevaluación.
- **Siguiente**: el brief de la 21.2, los medios de pago y la caja.
