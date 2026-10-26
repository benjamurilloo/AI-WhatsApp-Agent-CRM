---
schema: task-brief.v1
task_id: "29.9"
task_type: implementation
generated_at: 2026-10-25
---

# Brief 29.9 — La garantía

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado por el usuario el 2026-10-25, con las recomendaciones: U-1 a U-4 en su opción (a).** El reclamo pasa a la 29.9.2, con su propio brief.
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md): punto 6 (la unidad y sus días de garantía), punto 11 (la garantía), punto 13 (los valores sueltos), punto 14 (roles) y punto 16 (las dependencias); R-7 (30 días para todo);
  - [brief-29.1](brief-29.1-adr-de-rubros-y-capacidades.md), D-11;
  - [brief-29.5](brief-29.5-las-unidades.md), que dejó los días de la unidad para esta subfase;
  - [brief-29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md) y [brief-29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md), que dejaron el reclamo para esta subfase;
  - [brief-29.7.3](brief-29.7.3-la-cotizacion-de-usados.md), U-4: cómo llegan los valores sueltos a una organización que ya tiene la capacidad;
  - [DataModel](../architecture/DataModel.md) y [Overview](../architecture/Overview.md).

## Objetivo

Que el negocio sepa **si un equipo sigue en garantía y hasta cuándo**, sin guardar ese dato. Un equipo puede ser una unidad vendida o el de un cliente reparado y entregado. Se ve en la unidad, en la ficha del cliente y en una búsqueda por IMEI. Y que un `admin` configure los días: los del perfil (30, R-7) y, si hace falta, los propios de una unidad.

**El reclamo**, la orden de servicio que vuelve por garantía, es la segunda parte del punto 11. La U-1 propone hacerlo en una subfase propia, la 29.9.2.

**Ningún contrato del agente cambia.** El ADR 0024, punto 15, no le da la garantía al agente.

## Hallazgos (verificados contra el código en `7b84412`, 2026-10-25)

- **H-1. La unidad no tiene días de garantía.** `stock_units` no tiene la columna. La 29.5 la dejó para esta subfase (brief-29.5, l.64). El trigger `stock_units_guard_change` (0060) enumera las columnas que no cambian, así que una columna nueva queda editable.
- **H-2. Ninguna capacidad tiene dónde guardar los días del perfil.** Hay valores sueltos de `trade_ins` (`trade_in_settings`) y del tipo de cambio (`exchange_rate_settings`), pero ninguno de `serialized_units` ni de `repairs`. El ADR 0024, punto 13, pone «los días de garantía» entre los valores sueltos, con **una fila por organización y capacidad**. La garantía no es una capacidad, así que el ADR no dice de qué capacidad es esa fila. Lleva a U-2.
- **H-3. La fecha en que una unidad salió está en `inventory`.** Una unidad sale con un movimiento de 1 que lleva su `unit_id`:
  - `sale`, en una venta sin pedido;
  - `order_delivery`, en la entrega de un pedido (`deliverStock`, `inventory/service.ts:1120`).

  Si se anula una venta sin pedido, la unidad vuelve a `available` con `sale_void`. Una venta de un pedido no toca la unidad (H-15 del ADR). Hay un índice por unidad (`inventory_movements_unit_idx`). **Esa fecha es la que el punto 11 llama «la fecha de la venta, o de la entrega del pedido»**, y se lee sin que `inventory` lea `sales` ni `orders`, que son módulos que dependen de él.
- **H-4. Un mismo IMEI puede estar en varias unidades.** El `UNIQUE` de `stock_units` excluye las `sold` y las `written_off` (brief-29.7, U-2). Un equipo que el local vendió y después recibió como usado tiene dos filas: la vieja, `sold`, y la nueva.
- **H-5. No hay búsqueda por IMEI.** `/buscar` no busca unidades, y el IMEI solo se ve dentro de un producto. El punto 11 pide la búsqueda. Lleva a U-3.
- **H-6. La organización tiene zona horaria** (`organizations.timezone`, con `America/Argentina/Buenos_Aires` por defecto). La usa el horario del local (`knowledge/hours-repository.ts`).
- **H-7. Las reglas de la base de una orden de servicio impiden hoy un reclamo sin cobro.** Una orden `customer_device` presupuestada exige `customer_total > 0` (`service_orders_quote_together`). Una entregada y reparada exige su venta (`service_orders_sale_delivered`). Un reclamo cambia esas dos reglas y el trigger de la 0059. Lleva a U-1.
- **H-8. Contradicción con el ADR 0024, punto 11** (para la 29.9.2), dicha acá para que no se resuelva en silencio. El ADR dice que el reclamo «apunta a la venta o a la orden original», y que eso es `service → sales`. Pero:
  - la garantía de una unidad se deriva **de la unidad** (H-3), no de la venta;
  - una venta de un pedido puede tener una cadena de reemplazos (`replaces_sale_id`);
  - una venta puede tener varias unidades.

  Apuntar a la unidad vendida evita la lectura de `sales` y no deja dudas de qué equipo vuelve. Es una decisión del brief de la 29.9.2, con una nota fechada en el ADR. No se resuelve acá.

## Decisiones del usuario

- **U-1, la división** (H-7).
  - **(a) Recomendada. Dos subfases.** La **29.9, la garantía derivada**: los días, la regla, dónde se ve y la búsqueda por IMEI, sin tocar las órdenes de servicio. La **29.9.2, el reclamo**: la marca, a qué apunta (H-8), su camino sin cobro y los cambios de las reglas y el trigger de `service_orders`. Es la misma división de la 29.7, y cada una se despliega y se recorre sola.
  - (b) Una sola subfase con las dos partes. Una migración más grande, que cambia reglas de una tabla con datos en producción junto con todo lo demás.
- **U-2, dónde viven los días del perfil** (H-2).
  - **(a) Recomendada. Una fila por capacidad, como manda el punto 13:**
    - `unit_settings`, de `inventory`, con `serialized_units`: los días de una unidad vendida;
    - `service_settings`, de `service`, con `repairs`: los días de una reparación entregada.

    Cada fila tiene `warranty_days` y `is_example`. El perfil de iPhone copia 30 en las dos (R-7). Son dos tablas de una columna, pero la 29.10 ya va a sumar los valores de `appointments`, y cada módulo es dueño de lo suyo.
  - (b) Una sola fila en `inventory`, que `service` lee. Una organización con `repairs` y sin `serialized_units` no tendría garantía de sus reparaciones.
- **U-3, la búsqueda por IMEI** (H-5).
  - **(a) Recomendada. En `/buscar`**, por IMEI exacto sin distinguir mayúsculas, un grupo «Equipos». Trae todas las unidades con ese IMEI, cada una con su estado y su garantía, y, con `repairs`, las órdenes `customer_device` con ese IMEI. Un `viewer` ve el grupo, sin costos.
  - (b) Solo un filtro por IMEI en las unidades de un producto: no encuentra el equipo de un cliente, ni una unidad cuyo producto no se conoce.
- **U-4, la garantía de un equipo que volvió al local** (H-4).
  - **(a) Recomendada. Una unidad `sold` no tiene garantía si hay otra unidad posterior con el mismo IMEI**: el equipo volvió al local y el cliente ya no lo tiene. La pantalla lo dice («volvió al local»), sin fecha.
  - (b) Mostrar la garantía igual. La ficha de quien lo vendió diría que su equipo está en garantía cuando ya no lo tiene.

## Decisiones

### D-1 — Los días (U-2 (a); ADR 0024, puntos 6 y 13)

- **`stock_units.warranty_days`**: un entero opcional, de 0 a 3650, con su `CHECK`. Nulo quiere decir «los del perfil». Cero quiere decir «sin garantía», por ejemplo para un equipo que se vende como está.
- **`unit_settings`** (de `inventory`) y **`service_settings`** (de `service`): una fila por organización, `UNIQUE (organization_id)`, con `warranty_days` entre 0 y 3650, `is_example` y las fechas. Se crean con la capacidad y el perfil, en la misma transacción de `org:capability`, con su auditoría.
- **Una organización que ya tiene la capacidad**, como «iPhone Demo», recibe la fila al volver a correr `org:capability --profile iphone`. Es el mismo camino de la 29.7.3, U-4 (a).
- **Sin fila**, no hay garantía que mostrar: la pantalla dice «sin configurar». Nunca se inventa un valor.
- **Lo edita un `admin`**:
  - los días del perfil, en una sección «Garantía» de la configuración de cada capacidad: la de las unidades, junto a los grados, y la de reparaciones;
  - los de una unidad, desde la unidad, con su auditoría (`update`, con el diff). Se puede en cualquier estado, también en `sold`: es el caso de una garantía extendida que se acordó al vender.
  - Guardar apaga `is_example`, como en `trade_in_settings`.

### D-2 — La regla (ADR 0024, punto 11; H-3, H-6)

Una sola función pura por caso, con sus pruebas unitarias. Las lecturas de cada módulo le pasan los datos.

- **Una unidad vendida** (`inventory`, `getUnitWarranty`):
  - tiene garantía solo si está `sold` y no hay una unidad posterior con su IMEI (U-4 (a));
  - **el inicio** es la fecha del último movimiento `sale` u `order_delivery` de la unidad. Es la fecha de la venta sin pedido o de la entrega del pedido, sin leer `sales` ni `orders` (H-3);
  - **los días** son los de la unidad, o los de `unit_settings` si la unidad no tiene.
- **Una reparación entregada** (`service`, `getServiceOrderWarranty`):
  - tiene garantía una orden `customer_device` `delivered` que se reparó, no una rechazada;
  - **el inicio** es `delivered_at`, y **los días**, los de `service_settings`.
- **El vencimiento** es la fecha local del inicio, en la zona de la organización, más los días. **La garantía cubre todo ese día.** Con cero días, vence el mismo día del inicio. El resultado es uno de cuatro:
  - `in_warranty`, con la fecha de vencimiento;
  - `expired`, con la fecha;
  - `returned`, el equipo volvió al local (U-4);
  - `not_configured`, sin días.

  Una unidad que no se vendió, o una orden sin entregar, no tiene resultado.
- **No se guarda nada.** Cambiar los días del perfil cambia la garantía de todo lo vendido, y eso es lo que el ADR quiere: el dato se deriva (ADR 0024, punto 11; alternativas, «una tabla de garantías»).

### D-3 — Dónde se ve (ADR 0024, punto 11; U-3 (a))

- **La unidad**: en las unidades del producto, el estado de la garantía de cada unidad `sold`, y en su detalle, el inicio, los días y su origen (de la unidad o del perfil).
- **La ficha del cliente**:
  - **«Equipos comprados»**, una sección nueva, con las unidades de sus ventas no anuladas y su garantía. De una cadena de reemplazos, la última venta. La página la compone: `sales` da las unidades del cliente y `inventory`, la garantía de cada una;
  - en sus órdenes de servicio, el estado de la garantía de las entregadas.
- **La búsqueda por IMEI** en `/buscar` (U-3 (a)).
- **Cada página respeta la capacidad**: sin `serialized_units`, no hay garantía de unidades; sin `repairs`, no hay garantía de reparaciones. La búsqueda no muestra el grupo, o la parte del grupo, que la organización no tiene.

### D-4 — Las dependencias (ADR 0024, punto 16)

**No hay aristas nuevas.** `inventory` lee sus movimientos y sus unidades. `service` lee sus órdenes. `sales` da las unidades de las ventas de un cliente, con lo que ya lee. La página compone. `sales` no conoce `service`, e `inventory` no conoce a nadie nuevo.

### D-5 — La migración `0063`

- `stock_units.warranty_days`, con su `CHECK`.
- `unit_settings` y `service_settings`, con sus `CHECK`, su `UNIQUE` y sus privilegios: `SELECT`, `INSERT` y `UPDATE` para `crm_app`, sin `DELETE`, como `trade_in_settings`.
- Sin cambios en los datos: las filas las crea `org:capability`.
- Las entradas del módulo de auditoría para las dos tablas nuevas, como `trade_in_settings` (`audit/schema.ts:81`).

### D-6 — Roles, datos personales y el agente

- **Un `viewer` ve la garantía** donde ve la unidad y la orden: es un dato de la venta, no un costo. **No edita** los días.
- **La búsqueda por IMEI** muestra el IMEI del equipo de un cliente a quien ya lo ve en la orden. No suma ningún dato personal nuevo. La sección «Equipos comprados» sale de ventas que el `viewer` ya ve.
- **El agente no lee la garantía**: no está en el punto 15, y ningún contrato cambia.
- **El runbook de datos de un cliente** no cambia: las tablas nuevas no tienen datos del cliente.

### D-7 — Pruebas

- **Unitarias**:
  - la regla, con días de la unidad y del perfil, cero días, nulo y sin fila;
  - el último día cubierto, y el vencimiento en el cambio de día de la zona horaria;
  - la unidad que volvió al local;
  - una orden rechazada, y una sin entregar.
- **Integración**, contra PostgreSQL:
  - una venta sin pedido;
  - un pedido entregado;
  - una venta anulada, que deja la unidad sin garantía, y una vendida otra vez, que toma la nueva fecha;
  - un equipo recibido como usado después de venderse;
  - una reparación entregada;
  - `org:capability` en una organización nueva y en una que ya tiene la capacidad;
  - la edición de los días, con su auditoría;
  - el aislamiento por organización en las tres lecturas;
  - los `CHECK` de la migración.
- **End-to-end**: un `admin` cambia los días del perfil y los de una unidad, busca un IMEI y ve la garantía en la ficha del cliente; un `viewer` la ve y no la edita.
- **Guardas**: las de siempre, sin cambios. `stock-writes` no cambia, porque `warranty_days` no mueve el saldo.

### D-8 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue, contra este brief y las reglas vigentes. Esta subfase no abre ni cierra un gate, pero cambia `stock_units`, que tiene datos en producción.
- **Despliegue** con el runbook de `deploy/production/README.md`, la migración `0063` y, después, `org:capability --profile iphone` en «iPhone Demo», que crea las dos filas. Las dos cosas necesitan la autorización del usuario.
- **El recorrido**: el usuario ve la garantía de una unidad vendida y de una reparación entregada de «iPhone Demo», y busca un IMEI.

## Alcance incluido

- `stock_units.warranty_days`, `unit_settings` y `service_settings`, en la migración `0063`.
- La copia del perfil en `org:capability`, con los 30 días de R-7, para una organización nueva y para una que ya tiene la capacidad.
- La regla, con sus cuatro resultados.
- Las pantallas de D-3, y la edición de los días por un `admin`.
- La búsqueda por IMEI en `/buscar`.

## Alcance excluido

- **El reclamo**: la marca `warranty_claim`, a qué apunta (H-8), su camino sin cobro y los cambios de `service_orders` (U-1 (a): la 29.9.2).
- La garantía en un contrato del agente.
- La garantía en el comprobante imprimible de la venta. Es una mejora, y el comprobante es de solo inserción.
- Días distintos por condición o por producto. R-7 dice 30 para todo; la unidad cubre la excepción.
- Avisos de vencimiento: el CRM no envía mensajes (Scope, §Sigue fuera).
- La garantía de un producto por cantidad, que no tiene IMEI.

## Invariantes

- **La garantía nunca se guarda**: no hay tabla ni columna con la fecha de vencimiento.
- **El saldo no cambia**: ninguna función de esta subfase escribe movimientos ni estados de unidad.
- **Ningún módulo del núcleo depende de uno de capacidad**, y no hay aristas nuevas (D-4).
- **Sin días configurados no hay garantía mostrada**, ni un valor por defecto en el código.
- **Cada lectura filtra por organización.**

## Criterios de aceptación

- **AC-1**: la migración `0063` crea la columna y las dos tablas, con sus `CHECK`, su `UNIQUE` y sus privilegios. Un valor fuera de rango, o una segunda fila de una organización, se rechazan en la base.
- **AC-2**: `org:capability --profile iphone` crea `unit_settings` y `service_settings` con 30 días y `is_example`, en una organización nueva y en una que ya tiene la capacidad, una sola vez y con su auditoría.
- **AC-3**: la garantía de una unidad vendida empieza en la fecha de su último movimiento `sale` u `order_delivery`. Usa los días de la unidad, o los del perfil si la unidad no tiene, y cubre el último día en la zona de la organización.
- **AC-4**: una unidad con la venta anulada no tiene garantía, y vendida otra vez toma la fecha nueva. Una unidad con otra posterior del mismo IMEI da `returned`.
- **AC-5**: una orden `customer_device` reparada y entregada tiene garantía desde `delivered_at`, con los días de `service_settings`. Una orden rechazada o sin entregar no tiene.
- **AC-6**: sin fila de configuración, el resultado es `not_configured`.
- **AC-7**: un `admin` edita los días del perfil y los de una unidad, con su auditoría, y guardar el perfil apaga `is_example`. Un `viewer` ve la garantía y no puede editar: la acción lo rechaza en el servidor.
- **AC-8**: la unidad, la ficha del cliente («Equipos comprados» y sus órdenes) y `/buscar` por IMEI muestran la garantía. Cada una respeta las capacidades de la organización.
- **AC-9**: ninguna lectura devuelve datos de otra organización. Lo prueba un test con dos organizaciones y el mismo IMEI.
- **AC-10**: las suites de `inventory`, `orders`, `sales`, `service` y `tradeins`, el invariante del saldo y las guardas pasan sin cambios en la CI, junto con la integración y el end-to-end nuevos.
- **AC-11**: revisión independiente antes del despliegue, con sus hallazgos verificados y resueltos.
- **AC-12**: desplegada, con `org:capability` corrido en «iPhone Demo» y el recorrido del usuario.

## Pruebas y evidencia requerida

- Los tests de D-7, y una CI en `success` sobre el SHA que se despliega.
- Antes del despliegue, los recuentos en producción, solo leyendo: unidades `sold` y órdenes entregadas de «iPhone Demo». Después, las dos filas creadas.
- El recorrido del usuario, con lo que vio.

## Condiciones de detención

- **Si la fecha del movimiento no coincide con la de la venta** en algún camino (por ejemplo, una venta sin pedido que no escriba `sale` con su `unit_id`), se para y se informa. Sería leer `sales`, y eso cambia D-4.
- Si la regla necesita una arista nueva entre módulos.
- Si mostrar «Equipos comprados» exige que `sales` lea `inventory` de una forma que hoy no lee, o que la página haga más de una lectura por unidad.
- Si `org:capability` no puede completar una organización que ya tiene la capacidad sin tocar otros datos.
- Si la migración necesita cambiar datos de producción.
- Cualquier cambio en un contrato del agente.

## Implementación

*Del 2026-10-25, sobre `7b84412`. Sin commit hasta la autorización del usuario.*

### Desviaciones y decisiones de implementación

1. **«Equipos comprados» lo dan `orders` y `sales`, no solo `sales`** (D-3). Una unidad que salió en un pedido entregado y todavía no tiene venta también es del cliente, así que `orders` da las de sus pedidos entregados (`listClientDeliveredUnits`) y `sales`, las de sus ventas sin pedido vigentes (`listClientSoldUnits`). La venta de un pedido copia las unidades del pedido, así que no se cuentan dos veces. La página compone, como dice D-3, y no hay aristas nuevas (D-4).
2. **La escritura de los días se llama `updateUnitWarrantyDays`**, y el caso de uso, `setUnitWarrantyDays`. `unit-writes` fija las dos con su llamador: la del repositorio desde el caso de uso, y este desde su Server Action. Con el mismo nombre, la guarda habría confundido las dos llamadas.
3. **Los nombres de los productos los pide `inventory` a `catalog`** (`getProductsByIds`), en vez de unir `products` en el repositorio: la regla de lint `no-restricted-imports` no deja leer el esquema de otro módulo. Es lo que ya hace `service` con las unidades propias.
4. **El grupo «Equipos» de `/buscar` no tiene «Ver todos»**: no hay una lista de equipos. El enlace pasa a ser opcional en los grupos (`moreHref: null`), sin cambiar los otros seis. Por eso, en `/buscar` el grupo no se corta en ocho: muestra todas las unidades del IMEI y hasta 20 órdenes (revisión independiente, NB-5). En las sugerencias se corta en tres, como los demás, y Enter lleva a `/buscar`.
5. **Los días de una unidad también se editan con la unidad disponible**, con un enlace «Garantía» en sus acciones. D-1 no restringe el estado. La unidad dada de baja la excluye el trigger `stock_units_guard_change` (`0060`), y el caso de uso la rechaza antes (`unit_written_off`).
6. **Un texto que no tiene la forma de un IMEI no busca nada** (`UNIT_SERIAL_PATTERN` y `DEVICE_SERIAL_PATTERN`): la búsqueda global recibe cualquier texto, y no hace una consulta por cada palabra.
7. **Una unidad `sold` sin su movimiento de salida queda sin garantía que mostrar**: no hay inicio, y no se inventa uno. Al principio la lectura fallaba. La revisión independiente (NB-4) mostró dos cosas: que la afirmación de que «el test de invariante lo cubre» era falsa, porque `stock-invariant.ts` no compara las unidades `sold` con sus movimientos; y que un solo dato así tiraba la página de unidades del producto y la ficha del cliente. Antes del despliegue se cuentan en producción las unidades `sold` sin movimiento de salida.
8. **Las secciones de los días de la organización solo las ve un `admin`**. Un `viewer` ve la garantía de cada unidad y de cada orden, que es lo que pide D-6, pero no la configuración.
9. **No hay requisito funcional de la garantía** en FunctionalRequirements: el punto 11 del ADR es la fuente, y no se agrega uno nuevo en esta subfase.

### Evidencia (autoevaluación)

- **Unitarias**: `inventory/warranty.test.ts` y `service/warranties.test.ts`: la regla con días de la unidad y del perfil, cero, nulo, el último día cubierto, el cambio de día en la zona horaria, fin de mes, fin de año y año bisiesto; y la orden rechazada, sin entregar o propia. Más el ajuste de `buscar/groups.test.ts`.
- **Integración** contra PostgreSQL local: `tests/integration/warranty.test.ts`, 11 casos:
  - los `CHECK` y los `UNIQUE` de la `0063`;
  - la copia del perfil una sola vez, con su auditoría;
  - la venta sin pedido y el pedido entregado;
  - los días de la unidad (también cero y vacío), con su auditoría;
  - la venta anulada y la venta otra vez;
  - el equipo que volvió al local y la búsqueda con su historia;
  - «sin configurar»;
  - la reparación entregada y su búsqueda;
  - la validación y la marca de ejemplo;
  - los roles, el aislamiento con el mismo IMEI en dos organizaciones, y la unidad dada de baja.
  
  **Quitar el filtro por organización de la lectura de unidades hace fallar el caso del aislamiento**; se probó y se restauró. Pasan sin cambios las suites de `units`, `units-orders-sales`, `service-orders`, `service-own-units`, `trade-ins`, `trade-in-quotes`, `sales` y `read-api-v3-trade-in-quote`. `audit.test.ts` suma las dos tablas nuevas a las que se editan y no se borran.
- **Guardas**: `capability-reads` suma las dos copias del perfil; `unit-writes`, la escritura de los días con sus dos llamadores; `exposed-surface`, las tres Server Actions nuevas.
- **End-to-end**, `tests/e2e/warranty.spec.ts`, 3 casos:
  - un `admin` vende, ve la garantía en la unidad, cambia sus días con un rechazo antes, busca el IMEI y la ve en la ficha del cliente;
  - un `admin` cambia los días de la organización de las unidades y de las reparaciones;
  - un `viewer` la ve y no edita.
  
  Con axe en los dos temas. En la máquina local, el primer ingreso de una corrida a veces vence el tiempo, también en `login.spec.ts`, que no cambió; la segunda corrida pasó entera.
- **Specs vecinas**: `search`, `units`, `repairs`, `clients` y `repairs-own-units` en una corrida. Pasaron 36 y fallaron 10, siempre por tiempo, en pasos distintos en cada corrida, con cortes de conexión del servidor a PostgreSQL. Solas pasan `search:226` y `clients:882`. `repairs:246` y `repairs-own-units:213` siguen fallando, y **fallan igual en la línea base `7b84412`**, construida sin nada de esta subfase. No son de la 29.9; decide la CI. Además quedaba un `next start` huérfano de una corrida anterior en el puerto 3100.

## Revisión independiente

*Del 2026-10-25, por un agente que no participó del trabajo, con acceso de solo lectura, contra este brief y las reglas vigentes. Veredicto: R1, sin bloqueantes. Cada hallazgo se verificó contra el código antes de aceptarlo.*

| Hallazgo | Verificación | Qué se hizo |
|---|---|---|
| NB-1. «Volvió al local» cuenta cualquier unidad posterior con el IMEI, también una dada de baja: el usado anulado o el IMEI mal cargado y corregido con baja y alta | Cierto (`warranty-repository.ts`, subconsulta `returned`). Cumple U-4 (a) al pie de la letra | **Decidido por el usuario el 2026-10-26: (a), queda así**, como limitación aceptada. Una baja no distingue «el equipo volvió y se descartó» de «la carga fue un error»; se revisa en la 29.9.2, con el reclamo |
| NB-2. El filtro por organización de la subconsulta `returned` no lo fijaba ningún test | Cierto | El caso del aislamiento vuelve a leer la unidad de A después de crear el mismo IMEI en B. Quitar el filtro lo hace fallar («returned» en vez de «in_warranty»); se probó y se restauró |
| NB-3. D-3 pide el inicio en el detalle de la unidad, y no se mostraba | Cierto | `Warranty` suma `startsOn`, la fecha local del inicio, y la unidad dice «30 días desde el 01/10/2026, los de la organización». Unitaria y e2e ajustadas |
| NB-4. La desviación 7 afirmaba algo falso, y el `throw` tiraba páginas enteras; además, ningún test corría el script en una organización con la capacidad ya activa y sin días | Cierto, las dos cosas | La lectura ya no falla (desviación 7). `variants.test.ts` corre el script de verdad: crea los días al activar, no crea otros al repetirlo, y los crea al correrlo otra vez sobre una organización activa sin las filas, que es el caso de «iPhone Demo» |
| NB-5. El grupo «Equipos» se cortaba en ocho sin aviso y podía esconder las órdenes | Cierto | En `/buscar` el grupo va entero (desviación 4), con un test unitario |
| NB-6. D-7 nombra el usado recibido y se probó con un alta manual; AC-7 nombra la Server Action y se probó el servicio | Cierto | Se declara: la regla es la misma (cualquier unidad posterior con el IMEI), y el rol lo exige el servicio, que es lo que llama la acción. Sin cambios |
| O-1. Desvíos 1, 5 y 8 a aceptar | — | El 5 se corrigió: la exclusión es del trigger, no de D-1. El 1 y el 8 los aceptó el usuario el 2026-10-26 |
| O-2. El script decía «el perfil no se copió» y después creaba la garantía | Cierto | Dice qué no copió: «Los atributos, los grados, los tipos de reparación y el checklist del perfil … no se copiaron» |
| O-3. `soldAtOf` agregaba todas las salidas de la organización en cada búsqueda | Cierto por lectura, no medido | Una subconsulta correlacionada por unidad, con `inventory_movements_unit_idx`. Al cambiarla, la suite agarró una regresión: sin el `JOIN`, drizzle no califica las columnas y la correlación quedaba ligada a la tabla de adentro. Las subconsultas nombran `"stock_units"` a mano |
| O-4. Milisegundos entre la venta y su movimiento | — | Sin acción |
| O-5. `.claude/settings.json` sin trackear | — | Queda fuera del commit |
| O-6. Dos tablas de una columna | — | Es lo aprobado en U-2 (a) |

Fuera de la revisión, al correr las suites juntas falló una vez un test de `units-orders-sales`: el de la corrección del precio, que ordena por `created_at` dos auditorías de la misma transacción, con el mismo `now()`. Solo pasa. Es de antes y no se toca aquí. El test del medio «Permuta» de `variants.test.ts` lanza el script y tardaba más que los 5 s por defecto. Ahora tiene 60 s, como su vecino.
