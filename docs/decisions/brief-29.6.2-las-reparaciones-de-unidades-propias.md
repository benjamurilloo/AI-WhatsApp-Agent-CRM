---
schema: task-brief.v1
task_id: "29.6.2"
task_type: implementation
generated_at: 2026-10-20
---

# Brief 29.6.2 — Las reparaciones de unidades propias

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado** por el usuario el 2026-10-20, con las recomendaciones del brief tal como están; **cerrado** el 2026-10-20, desplegado (`0967593`) y recorrido (§Cierre). Las decisiones U-1 a U-3 las tomó ese mismo día (abajo).
- **Fuentes**: [ADR 0024](0024-rubros-y-capacidades.md), puntos 6, 10, 14, 16 y 17, y su nota de la 29.6; [ADR 0025](0025-tipo-de-cambio.md), puntos 1 y 5; [brief-29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md), U-1 y U-3; [brief-29.5](brief-29.5-las-unidades.md) y [brief-29.5.2](brief-29.5.2-las-unidades-en-pedidos-y-ventas.md); [DataModel](../architecture/DataModel.md).

## Objetivo

Que un negocio con `repairs` y `serialized_units` **mande a reparar una unidad de su stock**, la reciba de vuelta con **lo que cobró el técnico sumado a su costo**, y la **libere a la venta** cuando la revisó. Mientras está en el técnico o en revisión, la unidad está en el local pero **fuera del saldo**: no se vende ni se reserva.

## Contexto

La 29.6 se dividió por decisión del usuario (brief-29.6, U-1). Esta es la segunda mitad: la orden `own_unit`, los estados `in_repair` e `in_review`, `sendUnitToRepair`, `returnUnitFromRepair`, `releaseUnit` y el costo sumado a la unidad. **`in_review` lo crea esta subfase** (U-3 de la 29.6), y la 29.7 lo reutiliza para los usados recibidos.

## Hallazgos (verificados contra el código en `fe10450`, 2026-10-20)

- **H-1. El costo de la unidad es un monto y una moneda.** `stock_units.cost` y `cost_currency`, los dos obligatorios (`0056`). Hoy nada lo cambia: `correctUnit` corrige el grado, la batería y el precio propio, no el costo (`inventory/units.ts:556`). Sumarle lo del técnico en otra moneda exigiría convertir, y **el ADR 0025 no decide convertir** costos ni líneas (punto 1). La permuta, en el mismo caso, rechaza (punto 5, R-B5). Lleva a U-1.
- **H-2. La orden de la 29.6 supone un cliente y un presupuesto.** `service_orders.client_id` y `model_id` son `NOT NULL`; `service_orders_dates_chain` exige `approved_at` para `repaired_at`, y `service_orders_quote_together` ata el técnico a las monedas y totales del presupuesto. El trigger de `INSERT` exige nacer `received` con lo que reporta el cliente (`0058`, l.197). La orden `own_unit` salta `quoted` y `approved` (ADR 0024, punto 10): hay que reescribir esos `CHECK` por tipo.
- **H-3. Las líneas exigen precio al cliente.** `service_order_lines.price` es `NOT NULL`, y su trigger solo admite líneas con la orden `quoted` (`service_order_lines_guard`). En una unidad propia no hay precio al cliente (punto 10).
- **H-4. La deuda con el técnico ya cuenta cualquier orden reparada.** `findTechnicianCharges` (`service/repository.ts:522`) lee las órdenes con `repaired_at`, sin mirar el tipo. Una orden propia reparada con su total del técnico entra sola en la cuenta, el tope del pago y «A pagar». Su comentario supone el presupuesto, y hay que corregirlo.
- **H-5. El trigger de la unidad compara como texto.** `stock_units_guard_change` (`0057`, l.49) lista los pares permitidos como texto, para que una subfase con estados nuevos cambie solo esa función. Un valor nuevo de un enum no se usa en el mismo lote (`scripts/migrar.ts`).
- **H-6. Una unidad en revisión no tiene salida si no se arregla.** El ADR 0024 (punto 6) da `in_review → written_off` solo a `writeOffTradeInUnit`, de `tradeins` (29.7). `writeOffUnit` acepta solo `available` (`units.ts:490`). Una unidad propia que vuelve sin arreglo quedaría en revisión para siempre, o liberada a la venta a la fuerza. Lleva a U-2.
- **H-7. El orden de bloqueo de la unidad** es el producto (`lockProductForStockChange`), la unidad y el saldo (`writeOffUnit`, `units.ts:481-505`), como pide el ADR 0024, punto 16.
- **H-8. El modelo del producto es opcional.** `products.model_id` admite null (`catalog/schema.ts:141`). La orden necesita un modelo para armar las líneas con la lista.

## Decisiones del usuario

**Decididas el 2026-10-20**, las tres con la opción recomendada (a): **U-1**, la orden propia en la moneda del costo de la unidad, sin conversión; **U-2**, la baja de una unidad en revisión, sin movimiento; **U-3**, la corrección de una unidad en revisión. Las opciones, como se presentaron:

- **U-1, la moneda de lo que cobra el técnico.** **Recomendada (a)**: la orden propia va **en la moneda del costo de la unidad**. La pantalla la fija, y propone de la lista solo los costos en esa moneda; el resto se carga a mano. Sin conversión, como la permuta. El técnico que cobra en pesos se paga con la cuenta en dólares por el pago en otra moneda de la 29.4.3 (ADR 0025, punto 5). (b) convertir con la cotización vigente y guardar la cotización en la orden: suma una decisión que el ADR 0025 dejó fuera, y necesita su nota.
- **U-2, la baja de una unidad en revisión.** **Recomendada (a)**: `writeOffUnit` acepta también `in_review → written_off`, **sin movimiento**, porque la unidad ya está fuera del saldo. Es una nota al ADR 0024, punto 6, y la 29.7 la puede reutilizar. (b) dejarla para la 29.7: hasta entonces, una unidad sin arreglo solo sale liberándola y dándola de baja.
- **U-3, la corrección de una unidad en revisión.** **Recomendada (a)**: `correctUnit` acepta también `in_review`, para cargar el grado y la batería después de la reparación, antes de liberarla. (b) solo en `available`, como hoy: se libera y después se corrige.

## Decisiones

### D-1 — Los estados de la unidad (ADR 0024, punto 6)

- **`stock_unit_status` suma `in_repair` e `in_review`.** Transiciones nuevas, además de las de la 29.5.2:
  - `available → in_repair` y `in_review → in_repair`: mandar a reparar;
  - `in_repair → in_review`: volver de reparación, o cancelar la orden;
  - `in_review → available`: liberar a la venta;
  - `in_review → written_off`: la baja, sin movimiento (U-2).
- **Una unidad nunca nace en esos estados** en esta subfase. La 29.7 suma el nacimiento en `in_review`.
- **El saldo cuenta solo `available` y `reserved`**: una unidad `in_repair` o `in_review` está en el local y fuera del saldo. El test de invariante suma las suites de `service`.
- **`inventory_movement_type` suma `unit_to_repair` y `unit_released`.**

### D-2 — Las funciones de `inventory` (ADR 0024, punto 6, tabla de caminos)

Cada una recibe la transacción del llamador, cambia la unidad y el saldo juntos, y se audita como `status_change` de `stock_unit`. **`unit-writes` y `stock-writes` fijan cada función y su único llamador.**

| Función | Unidad | Saldo y movimiento | Llamador |
|---|---|---|---|
| `sendUnitToRepair` | `available` o `in_review` → `in_repair` | −1, `unit_to_repair`, si estaba `available` | `service` (la orden) |
| `returnUnitFromRepair` | `in_repair` → `in_review`, **y suma el costo** | ninguno | `service` (marcar reparada) |
| `cancelUnitRepair` | `in_repair` → `in_review`, sin costo | ninguno | `service` (cancelar la orden) |
| `releaseUnit` | `in_review` → `available` | +1, `unit_released` | `inventory` (acción de `admin`) |

- **Una unidad `reserved`** (con un pedido confirmado), **`sold`** o **`written_off`** no se manda a reparar: `unit_not_available`.
- **El orden de bloqueo**: el producto, la unidad y el saldo, como `writeOffUnit` (H-7).
- **La suma del costo** se audita como `cost_change` de `stock_unit`, con el costo anterior, el nuevo y el número de la orden. Es el historial del costo (ADR 0024, punto 6: la auditoría es el historial).
- **`cancelUnitRepair`** es una función aparte de `returnUnitFromRepair` para que la guarda fije que la única que cambia el costo la llama marcar reparada.

### D-3 — La orden de una unidad propia (ADR 0024, punto 10)

- **`service_order_kind` suma `own_unit`.** `service_orders` suma **`unit_id`**, con clave foránea compuesta a `stock_units` (`RESTRICT`).
- **Por tipo**, con `CHECK` comparados como texto (H-5):
  - `customer_device`: cliente obligatorio, sin unidad, como hoy;
  - `own_unit`: **unidad obligatoria, sin cliente ni IMEI propio** (el IMEI es el de la unidad), y **sin precio al cliente** ni venta.
- **El modelo** sale del producto de la unidad. Si el producto no tiene modelo, la orden se rechaza con `unit_without_model` (H-8), porque las líneas se arman con la lista del modelo.
- **Lo que reporta** pasa a ser, en una unidad propia, «qué hay que reparar»: obligatorio, hasta 1000 caracteres, como hoy.
- **Estados** de una orden propia:
  - **nace `sent`**: mandarla a reparar elige el técnico en la misma acción, porque la unidad ya está en el local y no hay recepción;
  - `sent → repaired`: **marcar reparada carga las líneas** (los tipos de reparación y lo que cobró el técnico por cada uno, propuestos de la lista del modelo y editables), fija el total del técnico, suma el costo a la unidad y la devuelve a `in_review`;
  - `sent → cancelled`, con motivo de la lista: la unidad vuelve a `in_review`, sin costo;
  - **`repaired` es final**: no hay entrega, porque la unidad no sale del local.
- **El trigger** `service_orders_guard` suma esas transiciones con sus columnas exactas, en el `CASE` por transición de la 29.6: el nacimiento en `sent` (solo `own_unit`), y `sent → repaired` (`repaired_at`, `technician_currency` y `technician_total`). `quoted`, `approved`, `rejected` y `delivered` se rechazan en una orden propia.
- **Las líneas** (`service_order_lines`): `price` admite null; el trigger exige **precio en una orden de cliente y sin precio en una propia**, y en una propia admite las líneas con la orden `repaired`, sin pasar el total del técnico. La regla de solo inserción no cambia.
- **Una unidad tiene a lo sumo una orden propia abierta**: un índice único parcial sobre `unit_id` mientras la orden esté `sent`.

### D-4 — La deuda con el técnico

Sin cambios de código en `cash` (H-4): una orden propia reparada entra en la cuenta del técnico, el tope del pago, el estado de cuenta y «A pagar», con un enlace a la orden. Se prueba. **La invariante de la 29.6 no cambia**: lo que se le debe a un técnico es la suma de sus recepciones vigentes y sus órdenes reparadas o entregadas, de los dos tipos.

### D-5 — Los módulos y las guardas (ADR 0024, punto 16)

- **`service` suma la dependencia de `inventory`**, que la 29.6 dejó fuera. `inventory` no importa `service`. Sin ciclos.
- **`service-dependencies`** suma `inventory`. **`service-writes`** fija las escrituras nuevas de la orden propia. **`unit-writes` y `stock-writes`** fijan las cuatro funciones de D-2 con su llamador.

### D-6 — El orden de bloqueo

- **Mandar a reparar**: el producto, la unidad `FOR UPDATE`, el saldo, el técnico `FOR SHARE`, el contador de la orden y su inserción.
- **Marcar reparada y cancelar**: la orden `FOR UPDATE`, después el producto, la unidad y su saldo.
- **Mandar a reparar contra confirmar un pedido** que reserva la misma unidad: gana uno y el otro se rechaza nombrando la unidad. **Se prueba con una tercera conexión** que retiene la unidad.

### D-7 — Las pantallas

- **Las unidades del producto** (`/productos/[id]/unidades`): los estados nuevos con su nombre («En reparación», «En revisión»), y las acciones de cada estado:
  - «Mandar a reparar», en una `available` o `in_review`: el técnico, qué hay que reparar;
  - «Liberar a la venta», en una `in_review`;
  - «Dar de baja» y «Corregir», en una `in_review` (U-2 y U-3).
- **La unidad muestra su orden abierta** y sus órdenes anteriores, con un enlace.
- **«Órdenes de servicio»**: la lista suma un filtro por tipo, y una orden propia dice «Unidad propia» con el producto y el IMEI de la unidad en lugar del cliente.
- **El detalle de una orden propia**: la unidad, el técnico, qué hay que reparar y las acciones de su estado: «Marcar reparada», con las líneas y el costo del técnico, y «Cancelar». No tiene presupuesto, comprobante de recepción ni entrega.
- **«Nueva orden»** sigue siendo solo para un equipo de cliente: una orden propia nace desde la unidad.
- Todo se ve con y sin JavaScript, en claro y oscuro, a 1280 y 375 px, con axe sin violaciones.

### D-8 — Roles

- **Un `admin`** manda a reparar, marca reparada, cancela, libera y da de baja.
- **Un `viewer`** ve las órdenes propias y el estado de las unidades, **sin el técnico, su costo ni el costo de la unidad** (ADR 0024, punto 14). No ve las acciones.
- **Sin datos personales nuevos**: la orden propia no tiene cliente, y el IMEI es de una unidad del stock. El vaciado de datos de un cliente no la toca.

### D-9 — La migración `0059`

Aditiva y por pasos:
- `stock_unit_status` suma `in_repair` e `in_review`; `inventory_movement_type` suma `unit_to_repair` y `unit_released`; `service_order_kind` suma `own_unit`;
- `service_orders` suma `unit_id` con su clave foránea, y `client_id` admite null; `model_id` sigue obligatorio (D-3); `service_order_lines.price` admite null;
- los `CHECK` de `service_orders` se reescriben por tipo;
- `stock_units_guard_change`, `service_orders_guard_change` y `service_order_lines_guard_change` se reemplazan;
- el índice único parcial de D-3.

**Ninguna sentencia nombra como enum un valor que agrega la misma migración** (H-5): un test migra hasta la 0058 y aplica la 0059 sola. Las órdenes existentes de la 29.6 siguen valiendo con los `CHECK` nuevos.

### D-10 — Pruebas

- **Integración**:
  - cada transición nueva de la unidad, y cada rechazo de su trigger;
  - mandar a reparar desde `available` (baja el saldo con su movimiento) y desde `in_review` (no lo toca); rechazado en `reserved`, `sold` y `written_off`;
  - marcar reparada: las líneas, el total del técnico, **el costo de la unidad sumado** con su auditoría, y la unidad en `in_review`;
  - cancelar: la unidad en `in_review` sin costo;
  - liberar: sube el saldo con su movimiento; la baja en revisión, sin movimiento, y la corrección en revisión (U-2 y U-3);
  - una orden propia en otra moneda que el costo de la unidad, rechazada (U-1);
  - la orden propia en la cuenta del técnico y su pago a cuenta;
  - cada transición rechazada por el trigger de la orden propia, cada una por su mensaje, y una línea con precio en una orden propia;
  - **la unidad con una orden abierta no recibe otra**;
  - mandar a reparar contra confirmar un pedido de la misma unidad, **con una tercera conexión**;
  - el `viewer`;
  - el invariante del saldo después de cada escritura de `service`;
  - sin `repairs` o sin `serialized_units`, nada cambia.
- **Unitarias**: las transiciones de los dos tipos de orden.
- **End-to-end**: mandar una unidad a reparar, marcarla reparada con su costo, liberarla y venderla; la cancelación; la cuenta del técnico.
- **Las suites existentes** pasan sin cambios de conducta, incluidas las órdenes de cliente de la 29.6.

### D-11 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue (`CLAUDE.md`).
- **Despliegue** con el servicio detenido durante el build y **el heap de 1.536 MB** del README de producción.
- **Sin activación nueva**: «iPhone Demo» ya tiene `repairs` y `serialized_units`.
- **Recorrido del usuario.**
- **Cierre**: DataModel, FR-SRV, las notas fechadas del ADR 0024 (puntos 6 y 10, y U-1 a U-3), Overview, CHANGELOG, HANDOFF, Roadmap, Notion y Knowledge Capture.

## Alcance incluido

Todo lo de D-1 a D-11.

## Alcance excluido

- **El usado recibido** (nacer en `in_review`), `writeOffTradeInUnit` y la cotización: la 29.7.
- **El reclamo de garantía** de una unidad vendida: la 29.9.
- **Lo que lee el agente**: la 29.8. Las lecturas actuales no cambian; una unidad en reparación o en revisión no está disponible.
- **Mandar a reparar un producto `quantity`**: solo unidades.
- **Convertir monedas** en el costo (U-1).
- **El margen de la venta** con el costo sumado: la Fase 25 lo lee de la unidad.
- **Avisos**: el CRM no envía mensajes.

## Invariantes

- Sin `repairs` y `serialized_units`, ninguna pantalla, acción ni dato cambia.
- **El saldo de un producto `unit` es igual a sus unidades `available` y `reserved`**, después de cada escritura.
- **El saldo nunca cambia sin su movimiento**, y una unidad `in_repair` o `in_review` nunca está en el saldo.
- **El costo de una unidad solo sube**, y solo al marcar reparada su orden, con su auditoría.
- Una unidad tiene a lo sumo una orden propia abierta.
- Una orden propia nunca tiene cliente, precio al cliente ni venta.
- `inventory`, `sales` y `cash` no importan `service` por esta subfase. No hay ciclos.
- Un `viewer` nunca recibe el técnico, su costo ni el costo de una unidad.

## Criterios de aceptación

- **AC-1**: una unidad `available` o `in_review` se manda a reparar con un técnico y qué hay que reparar; queda `in_repair` y, si estaba disponible, el saldo baja con `unit_to_repair`. Una `reserved`, `sold` o `written_off` se rechaza.
- **AC-2**: marcar reparada carga las líneas con lo que cobró el técnico, suma ese total al costo de la unidad con auditoría `cost_change`, y deja la unidad `in_review` sin tocar el saldo.
- **AC-3**: cancelar una orden propia deja la unidad `in_review` sin cambiar su costo.
- **AC-4**: liberar una unidad `in_review` la deja `available` y sube el saldo con `unit_released`; después se reserva y se vende como cualquier unidad.
- **AC-5**: los triggers rechazan toda otra transición de la unidad y de la orden propia, cada una con su mensaje, y una orden propia nunca tiene cliente, precio ni venta.
- **AC-6**: la orden propia reparada aparece al debe de la cuenta del técnico y un pago a cuenta la cancela.
- **AC-7**: una unidad no tiene dos órdenes propias abiertas.
- **AC-8**: mandar a reparar y confirmar un pedido de la misma unidad, a la vez, dejan un solo ganador, probado con una tercera conexión.
- **AC-9**: el invariante del saldo se cumple después de cada escritura de `service` y de las funciones nuevas de `inventory`.
- **AC-10**: un `viewer` ve las órdenes propias y los estados sin el técnico ni los costos, y sin acciones.
- **AC-11**: la orden propia va en la moneda del costo de la unidad (U-1); una unidad `in_review` se da de baja sin movimiento (U-2) y se corrige (U-3). Cada una con su prueba.
- **AC-12**: sin las capacidades nada cambia, y las suites existentes pasan sin cambios de conducta, incluidas las órdenes de cliente.
- **AC-13**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-14**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-15**: desplegada y recorrida por el usuario en «iPhone Demo»; «Demostración Vixora» y «Vixora» intactas.

## Pruebas y evidencia requerida

Las de D-10, más la CI en verde sobre el SHA desplegado y los recuentos por organización después del recorrido.

## Condiciones de detención

Pedir autorización explícita, en su turno, **antes de**:
- el commit, el push y el despliegue;
- migrar una base real.

**Detenerse y consultar** si:
- sumar el costo exige convertir monedas (U-1);
- `inventory` necesita conocer `service`, o aparece un ciclo;
- reescribir los `CHECK` de `service_orders` invalida una orden existente;
- una suite existente cambia de conducta;
- `cash` necesita un cambio para contar la orden propia.

## Implementación

### Desviaciones y decisiones de implementación

Registradas al implementar, el 2026-10-20, para la revisión independiente. Ninguna toca una condición de detención: no hubo que convertir monedas, `inventory` no conoce `service`, no hay ciclos, los `CHECK` nuevos valen para las órdenes existentes (`migration-0059.test.ts`), y `cash` no cambió.

1. **Mandar a reparar toma el técnico primero**, antes que el producto, la unidad y el saldo. D-6 lo ponía después del saldo. El técnico es un proveedor, y la recepción toma el proveedor antes que sus productos: tomarlo después invertiría ese orden. El contador sigue después del saldo, por el motivo del movimiento.
2. **El trigger de la unidad también fija el costo y su moneda**: el costo cambia solo en `in_repair → in_review` y solo hacia arriba, y la moneda no cambia nunca. D-1 no lo pedía; es la defensa de los invariantes «el costo solo sube» y U-1.
3. **Los casos de uso de una orden de cliente exigen una orden de cliente**: mandarla, presupuestarla, aprobarla, rechazarla, marcarla reparada sin líneas y entregarla responden `invalid_transition` ante una orden propia. La cancelación sirve para los dos tipos, y en la propia devuelve la unidad.
4. **«En curso» distingue por tipo**: una orden propia está en curso solo mientras está en el técnico, porque reparada ya terminó, y la de un cliente sigue en curso reparada hasta la entrega.
5. **El historial de movimientos** nombra los dos tipos nuevos («A reparación» y «Liberada a la venta»), les da su signo y su filtro. El motivo de la liberación es fijo, «Liberada a la venta»; el de la ida, el número de la orden.
6. **`getUnitSummaries` devuelve también el producto de la unidad**, para enlazar la unidad desde la orden; y **`writeOffUnit` dice de qué estado salió**, para el aviso.
7. **El comprobante de recepción de una orden propia responde 404**: no hay recepción.
8. **La creación de la orden propia audita qué hay que reparar**: no es un dato personal, como sí lo es lo que reporta un cliente.
9. **`stock-writes` no cambió; `unit-writes` fija las cuatro funciones de D-2 y su llamador**, y también que `applyStockChange` se llama desde `unit-repairs` solo en `sendUnitToRepair` y `releaseUnit`. D-2 y D-5 pedían las dos guardas. `stock-writes` fija los llamadores de las escrituras de lo reservado, la venta y la recepción, no los de `applyStockChange` en ningún camino: sumar ahí solo los de la reparación duplicaría la guarda sin cerrar nada.

### Lo que corrigió la revisión independiente

La revisión del 2026-10-20 dio R1, con diez hallazgos no bloqueantes. Verificados contra el código, los diez eran ciertos:

1. **El trigger dejaba nacer una orden propia con la reparación hecha** y el costo del técnico, que la cuenta le habría debido. El `INSERT` de una orden propia exige ahora `repaired_at` y `technician_total` en null (`0059`, antes de desplegarla).
2. **La unidad muestra todas sus órdenes**: las que están en el local, todas las suyas; las que ya salieron, en «Reparaciones anteriores» (D-7).
3. **`stock-writes`**: desviación 9.
4. **El end-to-end vende la unidad liberada** y ve su orden en «Reparaciones anteriores» (D-10).
5. **La prueba de la capacidad** cubre ahora una organización con `repairs` y sin `serialized_units`: ni se manda a reparar ni se libera.
6. **Los rechazos de los triggers que faltaban**, uno por uno y por su mensaje: `sent → approved | rejected | received` y `repaired → cancelled` en la orden propia, cambiar `unit_id` o `kind`, `sent → cancelled` con columnas de más, `in_repair → written_off | reserved | sold`, `in_review → reserved`, `available → in_review`, y la línea sin precio de un equipo de cliente.
7. **El texto de las dadas de baja** ya no dice que todas tienen su motivo en los movimientos: la baja de una unidad en revisión no es un movimiento. Su motivo queda solo en la auditoría, que hoy ninguna pantalla muestra.
8. **El aviso de anular una recepción** decía que las unidades no disponibles «se dieron de baja»; ya era inexacto desde la 29.5.2. Ahora nombra los cinco destinos.
9. **La lista y la orden muestran el producto de la unidad** (D-7), por la interfaz de `catalog`.
10. **La carrera comprueba que el rechazo nombra la unidad** y dónde está.

## Cierre

*Del 2026-10-20, después del despliegue y el recorrido del usuario.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `unit-repairs.ts` (`sendUnitToRepair`, con `unit_to_repair` solo desde `available`); `service-own-units.test.ts`, «el ciclo de una unidad propia» y «los rechazos al mandar a reparar» |
| AC-2 | cumple | `markOwnUnitRepaired` y `returnUnitFromRepair`, con la auditoría `cost_change`; «el ciclo de una unidad propia»; el end-to-end (costo de 800 a 840) |
| AC-3 | cumple | `cancelServiceOrder` con `cancelUnitRepair`; «el ciclo de una unidad propia»; el end-to-end de la cancelación |
| AC-4 | cumple | `releaseUnit` con `unit_released`; la integración la libera y la vende, y desde la revisión también el end-to-end (hallazgo 4) |
| AC-5 | cumple | los tres triggers de la `0059` y los CHECK `service_orders_kind_subject` y `service_orders_own_unit_path`; «los triggers de la orden propia y de la unidad», tres tests, cada rechazo por su mensaje, completados en la revisión (hallazgos 1 y 6) |
| AC-6 | cumple | `findTechnicianCharges` lee `repaired_at` sin mirar el tipo; «la cuenta del técnico», con el pago a cuenta; el end-to-end ve la orden al debe |
| AC-7 | cumple | el índice único parcial `service_orders_unit_open_unique`; «los rechazos al mandar a reparar» |
| AC-8 | cumple | «mandar a reparar contra confirmar un pedido», con una tercera conexión; desde la revisión, el rechazo nombra la unidad (hallazgo 10) |
| AC-9 | cumple, con la convención del proyecto | `expectStockInvariant` corre después de cada test de `service-own-units.test.ts`, no de cada escritura |
| AC-10 | cumple | «el viewer y la capacidad»; el end-to-end del viewer |
| AC-11 | cumple | «la moneda, la baja y la corrección en revisión», un test por decisión |
| AC-12 | cumple | «sin repairs no se manda a reparar; sin serialized_units, ni se manda ni se libera» (hallazgo 5); las suites existentes pasan, con un solo cambio de forma: `writeOffUnit` devuelve `from` (desviación 6, `units.test.ts`) |
| AC-13 | cumple | CI run 39525450244 en `success` sobre `0967593c8053b8fc2f519b66df45f18a423a2d36`: unitarias 1051, guardas 818, integración 1685 y end-to-end 275, con axe |
| AC-14 | cumple | revisión independiente del 2026-10-20, antes del despliegue (§«Lo que corrigió la revisión independiente») |
| AC-15 | cumple | desplegada (`0967593`, 60 migraciones, la `0059` verificada en la base); el usuario recorrió el flujo en «iPhone Demo» y dijo «esta todo perfecto». Recuentos después: «iPhone Demo» con 2 órdenes propias reparadas, sus 4 unidades vendidas o dadas de baja, 2 movimientos `unit_to_repair` y 1 `unit_released`; «Demostración Vixora» y «Vixora» sin órdenes de servicio ni unidades |

**Nivel alcanzado**: validado en integración (`producer-consumer`), desplegado y recorrido en producción sobre una organización demo. No hay negocio real.

### Lo que queda

- **El motivo de la baja de una unidad en revisión** y la historia del costo de una unidad no se muestran en ninguna pantalla: quedan en la auditoría. Es una tarea en Notion, en «Esperando», por decisión del usuario del 2026-10-20.
- **Las correcciones de la revisión no tuvieron una segunda revisión independiente**: son autoevaluación, verificadas por sus pruebas y la CI.
- **La 29.7** reutiliza `in_review` y `releaseUnit` para los usados.

### El despliegue

Sin incidentes: la `0059` se aplicó antes de detener el servicio, y el build, con el heap de 1.536 MB, terminó a la primera. Después, el servicio activo, `/login` en 200 desde el servidor y desde afuera, y ningún error en el journal.
