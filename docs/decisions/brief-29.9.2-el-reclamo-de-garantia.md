---
schema: task-brief.v1
task_id: "29.9.2"
task_type: implementation
generated_at: 2026-10-26
---

# Brief 29.9.2 — El reclamo de garantía

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado por el usuario el 2026-10-26**, con la opción (a) en U-1 a U-5.
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md): punto 10 (la orden de servicio y la cuenta del técnico), punto 11 (la garantía y el reclamo), punto 15 (el agente) y punto 16 (las dependencias);
  - [brief-29.9](brief-29.9-la-garantia.md): U-1 (la división), H-7, H-8 y NB-1;
  - [brief-29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md) (D-4 los estados, D-6 la entrega, D-7 la deuda del técnico) y [brief-29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md) (la orden sin presupuesto, con el costo al repararla);
  - [brief-29.8.2](brief-29.8.2-las-reparaciones-para-el-agente.md) y [read-v3](../contracts/read-v3.md), `service-orders`;
  - [DataModel](../architecture/DataModel.md) y [Overview](../architecture/Overview.md).

## Objetivo

Que el negocio pueda **recibir un equipo que vuelve en garantía y repararlo sin cobrarle al cliente**. El equipo puede ser una unidad que el local vendió o el de un cliente que el local reparó. El reclamo es una orden de servicio con su propio camino: se recibe, se manda al técnico, se repara y se entrega, **sin presupuesto y sin venta**. Lo que cobre el técnico es costo del negocio y va a su cuenta, como cualquier reparación (ADR 0024, punto 11).

## Hallazgos (verificados contra el código en `98e92ca`, 2026-10-26)

- **H-1. La orden ya apunta a una venta** (`service_orders.sale_id`, la venta de la entrega; D-6 de la 29.6). La arista `service → sales` existe. El reclamo no la necesita si apunta a la unidad (H-8 de la 29.9, U-1 de este brief).
- **H-2. Las restricciones de `service_orders` nombran dos tipos.** `service_orders_kind_subject` ata `customer_device` al cliente y `own_unit` a la unidad. `service_orders_quote_together` exige el costo del técnico desde el presupuesto, o desde la reparación en una unidad propia. `service_orders_sale_delivered` exige la venta en toda orden entregada y reparada. El trigger de la `0059` fija las transiciones de cada tipo. Un reclamo cambia las cuatro.
- **H-3. La cuenta del técnico supone que toda orden reparada tiene costo.** `findTechnicianCharges` (`service/repository.ts:737`) toma toda orden con `repaired_at` y usa `technicianTotal!`. Hoy es cierto por el `CHECK`. Un reclamo que el técnico hace sin cargo (su propia garantía) rompería esa suposición: la lectura tiene que filtrar el total nulo.
- **H-4. El agente solo lee órdenes `customer_device`** (`repository.ts:663`). Un tipo nuevo queda fuera de `read-v3` sin cambiar el contrato. Lleva a U-4.
- **H-5. Saber de quién es una unidad vendida exige dos módulos.** La ficha del cliente lo compone (29.9, desviación 1): `sales` da las unidades de sus ventas sin pedido y `orders`, las de sus pedidos entregados. `service` importa `sales` pero no `orders`: comprobar en el servicio que la unidad es del cliente sería una arista nueva (`service → orders`), que es una condición de detención.
- **H-6. La garantía ya se deriva en cada módulo**: `inventory` da la de una unidad (`getUnitWarranties`) y `service`, la de una orden entregada (`serviceOrderWarranty`). Las dos sirven para decidir si se puede abrir un reclamo, sin lógica nueva.
- **H-7. Una orden propia ya hace el camino corto**: nace `sent`, pasa a `repaired` y ahí inserta las líneas con solo el costo y el total del técnico (`own-unit-orders.ts`, `markOwnUnitRepaired`). El reclamo puede reusar ese armado.
- **H-8. Agregar valores a un enum y usarlos en la misma migración** falla con el migrador de Drizzle (nota del vault «A New Enum Value Cannot Be Used in the Transaction That Adds It»). La `0059` lo resolvió con `CHECK` que nombran solo valores viejos y funciones que comparan como texto.

- **H-9. Contraste con la arquitectura** ([Overview](../architecture/Overview.md), las dependencias de la Fase 29; ADR 0024, punto 16). `service` depende de `sales`, `purchasing` e `inventory` (esta, desde la 29.6.2), y no de `orders`. La única contradicción con un documento aceptado es la de U-1: el ADR dice que el reclamo «apunta a la venta». No hay otra.

## Decisiones del usuario

- **U-1, a qué apunta el reclamo** (H-8 de la 29.9; contradice el texto del ADR 0024, punto 11).
  - **(a) Recomendada. Al equipo, no a la venta**: a la **unidad vendida** (`claim_unit_id`) o a la **orden de servicio original** (`claim_service_order_id`), exactamente una. Es de donde sale la garantía (29.9, D-2), no hay dudas de qué equipo vuelve aunque la venta tenga varias unidades o una cadena de reemplazos, y no suma lecturas de `sales`. Se agrega una nota fechada en el ADR.
  - (b) A la venta o a la orden, como dice el ADR. Una venta con varias unidades no dice cuál volvió, y la garantía no se deriva de la venta.
- **U-2, el costo del técnico.**
  - **(a) Recomendada. Opcional, al marcarlo reparado**, como en una unidad propia: líneas con solo el costo, o **sin cargo** si el técnico lo cubre con su propia garantía. Con costo, va a su cuenta (D-7 de la 29.6); sin costo, no hay deuda (H-3).
  - (b) Obligatorio, como en una unidad propia. Un técnico que repara gratis su propio trabajo no se puede registrar.
- **U-3, un reclamo que no corresponde** (el técnico encuentra un golpe o humedad).
  - **(a) Recomendada. Se cancela con un motivo nuevo, `not_covered` («no lo cubre la garantía»)**, y si el cliente quiere pagar la reparación se abre una orden común. El reclamo cancelado queda en la historia del equipo.
  - (b) Convertir el reclamo en una orden con presupuesto. Cambia el tipo de una orden ya creada, que el trigger hoy no deja, y mezcla dos caminos en una misma fila.
- **U-4, el agente** (H-4).
  - **(a) Recomendada. No ve los reclamos**, y ningún contrato cambia: `read-v3` ya filtra `customer_device`. Un cliente que pregunta por su reclamo habla con una persona. Se declara como límite.
  - (b) Mostrarlos en `read-v3`, con un campo nuevo. Es un cambio de contrato con su ventana del agente: otra subfase.
- **U-5, NB-1 de la 29.9** (una unidad posterior dada de baja cuenta como «volvió al local»).
  - **(a) Recomendada. Queda como está.** El reclamo no crea unidades, así que no lo empeora, y una baja sigue sin distinguir «volvió y se descartó» de «fue un error de carga». Si aparece el caso real, se resuelve con un motivo de baja.
  - (b) No contar las unidades posteriores dadas de baja. Un equipo que volvió y se descartó recupera la garantía.

## Decisiones

### D-1 — La orden de reclamo (U-1 (a); ADR 0024, punto 11)

- **Un tipo nuevo de orden, `warranty_claim`**, junto a `customer_device` y `own_unit`. Es la «marca» del punto 11 hecha tipo, como la 29.6.2 hizo con `own_unit`: tiene su propio camino.
- **Nombra al cliente** (obligatorio), **el IMEI** (el de la unidad o el de la orden original) y **el modelo** (el del producto de la unidad o el de la orden original), y **exactamente uno** de `claim_unit_id` (FK compuesta a `stock_units`) o `claim_service_order_id` (FK compuesta a `service_orders`). Lo que reporta el cliente es obligatorio, como en toda orden.
- **A lo sumo un reclamo abierto por equipo**: un índice único parcial sobre cada destino, con la orden abierta.
- **Solo se abre en garantía**: el servicio deriva la garantía con las lecturas de la 29.9 (H-6) y rechaza `not_in_warranty` si el resultado no es `in_warranty`. Una unidad que no está `sold`, o una orden que no es `customer_device` entregada y reparada, se rechaza igual. Un `admin` que quiera cubrir un caso fuera de plazo cambia los días de la unidad (29.9, D-1), con su auditoría.
- **El cliente sale de la pantalla**: el reclamo de una unidad se abre desde «Equipos comprados» de la ficha del cliente, que ya compone de quién es (H-5). El servicio no lo vuelve a comprobar, porque necesitaría leer `orders`. El de una reparación toma el cliente de la orden original, que `service` sí conoce. Es un límite declarado: lo usa solo un `admin` y queda auditado.

### D-2 — El camino (U-2 (a), U-3 (a))

- **received → sent → repaired → delivered**, y **cancelled desde received o sent**. Sin presupuesto, sin aprobación y sin rechazo.
- **Al mandarlo**, el técnico, como en toda orden.
- **Al marcarlo reparado**, las líneas con los tipos de reparación y su costo, en una moneda, como en una unidad propia (H-7), **o sin líneas y sin costo** (U-2 (a)). Con costo, `technician_total` y `technician_currency`; sin costo, los dos nulos.
- **Al entregarlo, no hay venta**: `delivered` con `sale_id` nulo. El cliente no paga nada (punto 11).
- **El motivo nuevo de cancelación, `not_covered`**, vale solo para un reclamo (U-3 (a)).
- **El reclamo no da garantía propia ni reinicia la del equipo**: la garantía se deriva de la venta o de la entrega original (29.9, D-2), y un reclamo no es ninguna de las dos. `serviceOrderWarranty` sigue mirando solo `customer_device`.

### D-3 — La migración `0064` (H-2, H-8)

- `service_order_kind` suma `warranty_claim`, y `service_order_cancel_reason`, `not_covered`.
- `service_orders` suma `claim_unit_id` y `claim_service_order_id`, con sus FK compuestas, sus índices y el índice único parcial del reclamo abierto.
- **Las restricciones se reescriben nombrando solo valores viejos o comparando como texto** (H-8), como la `0059`: el sujeto de cada tipo, el camino sin presupuesto, el costo del técnico opcional en el reclamo, la venta solo en `customer_device`, y `not_covered` solo en un reclamo.
- **El trigger de la `0059`** suma las transiciones del reclamo y fija que `claim_*`, el cliente y el IMEI no cambian.
- Sin cambios en los datos: las órdenes existentes no se tocan. Un test migra hasta la `0063`, confirma con órdenes de los dos tipos en varios estados y aplica la `0064` sola, como la 29.6.2.

### D-4 — La cuenta del técnico (H-3)

`findTechnicianCharges` filtra `technician_total is not null`. Un reclamo con costo es una deuda más, con su número de orden; uno sin costo no aparece en la cuenta. **Ningún otro cambio en `cash`**: la cuenta sigue leyendo lo mismo.

### D-5 — Dónde se ve y quién lo usa

- **Abrirlo**, un `admin`, con `repairs`:
  - desde «Equipos comprados» de la ficha del cliente, en una unidad en garantía;
  - desde una orden entregada y reparada en garantía.
- **La lista y el detalle** de reparaciones muestran el reclamo como «Reclamo de garantía», con el equipo original enlazado y sin presupuesto. Los pasos (mandar, reparado, entregar, cancelar) son los de D-2.
- **La ficha del cliente** lo muestra en sus órdenes de servicio, y **la búsqueda por IMEI** (`/buscar`, grupo «Equipos»), en las órdenes del IMEI.
- **El equipo original** muestra sus reclamos: la unidad en su detalle y la orden en el suyo.
- **Un `viewer`** ve los reclamos donde ve las órdenes, sin costos, y no los abre ni los mueve.
- **El agente no los ve** (U-4 (a)).

### D-6 — Las dependencias (ADR 0024, punto 16)

**No hay aristas nuevas.** `service` ya lee `inventory` (la unidad y su garantía) y es dueño de sus órdenes. No lee `sales` para el reclamo ni `orders` (H-5).

### D-7 — Pruebas

- **Unitarias**: las transiciones del reclamo y que ningún otro tipo las toma; las líneas con solo el costo y el reclamo sin cargo.
- **Integración**, contra PostgreSQL:
  - el reclamo de una unidad vendida y el de una reparación entregada, de punta a punta, sin venta;
  - el rechazo fuera de garantía, con la unidad no vendida, con la orden no reparada y con un reclamo ya abierto;
  - con costo, la deuda en la cuenta del técnico; sin costo, ninguna, y la cuenta sigue cerrando;
  - la cancelación con `not_covered`, y el rechazo de ese motivo en otro tipo;
  - cada restricción y el trigger, con una fila fuera de regla escrita directo en la base;
  - la `0064` aplicada sola sobre órdenes existentes;
  - que la garantía del equipo no cambia con el reclamo;
  - el aislamiento por organización: un reclamo no puede apuntar a una unidad ni a una orden de otra;
  - `read-v3` `service-orders` no devuelve el reclamo.
- **End-to-end**: un `admin` abre un reclamo desde «Equipos comprados», lo manda, lo marca reparado sin cargo y lo entrega, y lo ve en la ficha y en `/buscar`; un `viewer` lo ve y no lo mueve.
- **Guardas**: `exposed-surface` suma las Server Actions nuevas; `agent-contract-fields` no cambia.

### D-8 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue: cambia restricciones y el trigger de una tabla con datos en producción.
- **Antes del despliegue**, solo leyendo, el recuento de órdenes de «iPhone Demo» por tipo y estado.
- **Despliegue** con el runbook y la `0064`, con la autorización del usuario. No hace falta `org:capability`.
- **El recorrido**: el usuario abre un reclamo de una unidad vendida y uno de una reparación entregada en «iPhone Demo», y los lleva hasta la entrega.

## Alcance incluido

- La migración `0064`: el tipo, el motivo, las dos columnas, las restricciones y el trigger.
- Abrir, mandar, marcar reparado (con o sin costo), entregar y cancelar un reclamo.
- El filtro de la cuenta del técnico.
- Las pantallas de D-5.
- La nota fechada en el ADR 0024, punto 11 (U-1) y el DataModel.

## Alcance excluido

- **El reclamo en `read-v3`** y cualquier cambio de contrato del agente (U-4 (a)).
- Convertir un reclamo en una orden con presupuesto (U-3 (a)).
- Un reclamo de un producto por cantidad, sin IMEI.
- Un comprobante imprimible del reclamo.
- Reclamarle al técnico su propia garantía como una cuenta aparte: si no cobra, el reclamo va sin cargo (U-2 (a)).
- Cambiar NB-1 (U-5 (a)).
- Métricas de reclamos o de costo de garantía.

## Invariantes

- **Un reclamo nunca emite una venta ni le cobra al cliente.**
- **Ninguna orden existente cambia** con la migración.
- **La garantía sigue sin guardarse**, y un reclamo no la cambia.
- **Toda deuda de un técnico tiene un total**: la cuenta no lee órdenes sin costo.
- **Ningún contrato del agente cambia.**
- **Cada lectura y cada FK filtran por organización.**

## Criterios de aceptación

- **AC-1**: la `0064` agrega el tipo, el motivo, las columnas, los índices, las restricciones y el trigger, y aplicada sola no cambia ninguna orden existente.
- **AC-2**: un `admin` abre un reclamo de una unidad `sold` en garantía y de una orden `customer_device` entregada y reparada en garantía, con exactamente un destino, el cliente, el IMEI y el modelo, auditado.
- **AC-3**: abrirlo se rechaza fuera de garantía, sobre una unidad no vendida, sobre una orden no reparada o con otro reclamo abierto del mismo equipo.
- **AC-4**: el reclamo hace received → sent → repaired → delivered, y cancelled desde received o sent, y ninguna otra transición. La base lo exige aunque se salte el servicio.
- **AC-5**: al marcarlo reparado, con costo queda la deuda en la cuenta del técnico; sin costo, ninguna, y la cuenta sigue leyéndose sin error.
- **AC-6**: la entrega no emite venta. `not_covered` solo vale en un reclamo.
- **AC-7**: la garantía del equipo original no cambia, y el reclamo no tiene garantía propia.
- **AC-8**: las pantallas de D-5 muestran el reclamo y su equipo; un `viewer` lo ve sin costos y la acción lo rechaza en el servidor.
- **AC-9**: un reclamo no puede apuntar a una unidad ni a una orden de otra organización, y ninguna lectura cruza organizaciones.
- **AC-10**: `read-v3` no devuelve reclamos, y su contrato no cambia.
- **AC-11**: las suites de `service`, `inventory`, `cash`, `sales` y `read-api-v3`, las guardas, la integración entera y el end-to-end pasan en la CI.
- **AC-12**: revisión independiente antes del despliegue, con sus hallazgos verificados y resueltos.
- **AC-13**: desplegada y recorrida por el usuario.

## Pruebas y evidencia requerida

- Los tests de D-7 y una CI en `success` sobre el SHA que se despliega.
- **La integración entera en local antes del push** (nota del vault «Version the Failing Case of Every Project Guard», segunda observación de la 29.9).
- Los recuentos de producción antes y después, solo leyendo.
- El recorrido del usuario.

## Condiciones de detención

- Si el reclamo necesita leer `orders`, o cualquier otra arista nueva entre módulos.
- Si cambiar una restricción o el trigger obliga a tocar filas existentes.
- Si la cuenta del técnico o el saldo de caja necesitan un cambio fuera de D-4.
- Cualquier cambio en un contrato del agente.
- Si algún camino emitiría una venta o un cobro para un reclamo.
