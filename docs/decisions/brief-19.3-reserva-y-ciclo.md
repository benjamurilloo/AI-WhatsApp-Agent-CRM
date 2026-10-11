---
schema: task-brief.v1
task_id: "19.3"
task_type: implementation
generated_at: 2026-10-11
---

# Brief 19.3 — Reserva y ciclo del pedido

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, las funciones de stock, las transiciones, la conciliación y las guardas, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para `read-v1`, que no cambia;
  - `isolated-runtime` para el despliegue, si se autoriza (D-15).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-15, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: tercera subfase de la Fase 19 — Pedidos ([Roadmap](../planning/Roadmap.md) §Fase 19), después de la 19.2, cerrada el 2026-10-11. Implementa la fila «19.3» del punto 11 del [ADR 0020](0020-el-pedido.md).
- **No abre ni cierra gate.** Es la primera vez que algo distinto de un ajuste manual cambia el stock, y la primera escritura de `inventories` sin movimiento. Por eso se recomienda la revisión independiente (D-14).
- **Estado de este documento**: **aprobado el 2026-10-11** por el usuario, con las recomendaciones de D-1 a D-15. La tarea 19.3 (`3f6702be6f4e811bacafc4d413b55023`) está en «En proceso» en Notion desde ese día.

## Objetivo

Que un `admin` pueda **confirmar** un pedido pendiente, que reserva su stock; **entregar** uno confirmado, que descuenta el stock con un movimiento; y **cancelar** uno confirmado, que libera lo reservado. Las pantallas del CRM muestran el saldo físico, lo reservado y lo disponible, y el estado de stock pasa a usar lo disponible. Lo que lee el agente no cambia.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código y en producción el 2026-10-11.

**Ya está fijado** por el ADR 0020, puntos 4 a 7 y 11:
- la tabla de transiciones y su efecto en el saldo físico y en lo reservado; `delivered` y `cancelled` son finales;
- `quantity_reserved numeric(14, 3) not null default 0` en `inventories`, con `CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)`; lo disponible es la resta, sin columna;
- confirmar se rechaza si alguna línea pide más que lo disponible, informando lo disponible de cada una, sin reservas parciales, y si algún producto está inactivo; cancelar y entregar nunca se rechazan por un producto inactivo;
- entregar inserta un movimiento `order_delivery` por línea, sin clave foránea al pedido y con el motivo `Entrega del pedido P-000123`, y cambia saldo y reservado **en una sola sentencia**; es una función nueva de `inventory`, no una extensión de `applyStockChange`;
- el ajuste manual acepta solo sus dos tipos; un ajuste negativo por debajo de lo reservado se rechaza con la regla `below_reserved`;
- reservar y liberar no son movimientos; su traza es la auditoría del pedido;
- `orders` abre la transacción y la pasa a tres funciones nuevas de `inventory`, que la exigen por tipo; `stock-writes` se extiende a ellas;
- el orden de bloqueo: cabecera `FOR UPDATE`, productos en modo compartido por id, saldos `FOR UPDATE` en el mismo orden;
- las pantallas usan lo disponible para el estado y el orden por stock; `read-v1` sigue con el saldo físico, y un test lo fija;
- un test de conciliación: lo reservado de cada producto es la suma de las líneas de sus pedidos confirmados.

**Lo que hay en el código y se reutiliza**:
- `inventory/repository.ts`: `lockBalance(tx, …)` crea la fila en 0 y la bloquea, y hoy devuelve solo `quantity_on_hand`; `applyStockChange` inserta el movimiento y actualiza el saldo. `stock-writes` autoriza exactamente esas dos.
- `inventory/service.ts`: `withStock` deriva el estado de `quantity_on_hand` y lo comparten **las pantallas y las tres lecturas de servicio** (`searchCatalogForService`, `getCatalogProductForService`, `getProductStockForService`); `adjustStock` valida el tipo contra **todos** los valores del enum (`z.enum(inventoryMovementType.enumValues)`); `computeBalanceAfter` conoce `negative_stock` y `stock_limit`.
- `catalog`: `lockProductsForOrder(tx, …)` de la 19.2 ya bloquea los productos en modo compartido, ordenados por id, y devuelve si existen y si están activos. Sirve igual para las transiciones.
- `orders`: `updateOrderStatus` acepta hoy solo `cancelled`; el trigger de la `0036` ya admite las cuatro transiciones y sus fechas, y el `CHECK orders_status_dates` ya las ata. **La 19.3 no cambia el esquema de `orders`.**
- Las pantallas de stock: la lista de productos (columna de stock, filtro por estado y orden por stock), la ficha del producto y `/productos/[id]/movimientos` (el saldo, el historial con su filtro por tipo y el formulario de ajuste con el saldo resultante).
- **Producción** corre `ef75da3` con la migración `0036`; la de esta subfase es la `0037`. La organización de demostración tiene 4 productos con saldo positivo y 4 movimientos; la del operador, ninguno.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre Overview, DataModel, FunctionalRequirements, Screens, `read-v1` y el código):
- **H-1. FunctionalRequirements, FR-PROD-05, define el estado de stock con `quantity_on_hand`.** El ADR 0020, punto 7, lo pasa a lo disponible en las pantallas. El ADR está por encima: FR-PROD-05 se enmienda con fecha, conservando el texto, y dice que `read-v1` sigue con el saldo físico. También FR-PROD-08 (suma `below_reserved`) y Screens §Movimientos (el saldo y el error nuevo).
- **H-2. `withStock` es compartido** entre pantallas y servicio: si se cambia en un lugar, cambia en los dos. La 19.3 separa las dos derivaciones (D-10), como pide el ADR.
- **H-3. `lockBalance` está vigilada por `stock-writes`** y devuelve un solo valor. Las funciones nuevas necesitan también lo reservado bajo el mismo bloqueo. Cambiar lo que devuelve no cambia lo que escribe, así que la guarda no se afloja (D-2).
- **H-4. El historial de movimientos y su filtro** conocen solo los dos tipos de ajuste: la etiqueta, el filtro de la URL (`positivo`, `negativo`) y el signo. El tipo nuevo necesita su etiqueta y su filtro.
- **H-5. Overview** ya anticipa la dependencia `orders → inventory` «desde la 19.3». `inventory` no depende de `orders`: el motivo del movimiento llega como texto.
- **H-6. Entregar en producción cambia el stock real de la demostración**, que el agente lee por `read-v1`. Lo decide D-15.
- **No apareció ninguna contradicción** que obligue a cambiar el ADR 0020. H-1 es una enmienda que el propio ADR implica.

## Alcance incluido

1. **Esquema** (migración `0037`, generada con `drizzle-kit generate` y completada a mano si hace falta):
   - `inventories.quantity_reserved numeric(14, 3) not null default 0` con `CHECK (quantity_reserved >= 0 AND quantity_reserved <= quantity_on_hand)`;
   - `order_delivery` en `inventory_movement_type`;
   - sin privilegios nuevos: `crm_app` ya tiene `UPDATE` en `inventories`.
2. **`inventory`** (D-2):
   - `lockBalance` devuelve el saldo físico y lo reservado;
   - `reserveStock(tx, organizationId, lines)`: bloquea los saldos ordenados por producto y, si todas las líneas alcanzan, suma lo reservado; si no, no escribe nada y devuelve las líneas que no alcanzan con lo disponible;
   - `releaseStock(tx, organizationId, lines)`: resta lo reservado;
   - `deliverStock(tx, { organizationId, lines, reason, createdBy })`: un movimiento `order_delivery` por línea con su `balance_after`, y saldo y reservado en una sola sentencia;
   - `adjustStock` acepta solo los dos tipos de ajuste, y suma la regla `below_reserved` con el saldo, lo reservado y la cantidad pedida;
   - las lecturas de las pantallas con lo disponible; las de servicio, con el saldo físico (D-10);
   - una lectura de lo disponible por ids, para el detalle del pedido (D-9).
3. **`orders`**:
   - `confirmOrder`, `deliverOrder` y `cancelOrder` (este ya existe para un pendiente; suma el confirmado), solo `admin`, con el orden de bloqueo del ADR y el resultado de D-4 y D-5;
   - cada transición audita `status_change` en la misma transacción (D-6);
   - `updateOrderStatus` acepta los tres estados de destino.
4. **Pantallas** (D-7 a D-9):
   - productos: la lista, la ficha y los movimientos muestran lo disponible y lo reservado; el estado y el orden por stock usan lo disponible; el historial etiqueta y filtra las entregas; el ajuste avisa si bajaría de lo reservado;
   - pedidos: los botones «Confirmar», «Entregar» y «Cancelar» según el estado, con confirmación; lo disponible por línea en un pendiente; los filtros y etiquetas de los cuatro estados en la lista y en la tarjeta del cliente.
5. **Guardas** (D-12): `stock-writes` autoriza las tres funciones nuevas, cada una con sus escrituras exactas y sus casos de fallo versionados; `order-writes` sin cambios de alcance; `exposed-surface` con las acciones nuevas.
6. **Tests**: integración del esquema, de las tres funciones, de las transiciones (roles, organización, idempotencia, rechazos, concurrencia y bloqueos), de `below_reserved`, del tipo restringido del ajuste, de `read-v1` con reservas y la conciliación (D-11); unitarios de lo puro; end-to-end del ciclo.
7. **Documentación**:
   - `DataModel.md`: `quantity_reserved` y `order_delivery` pasan de «en vigor desde la 19.3» a implementados; la nota de las tablas que vienen;
   - `FunctionalRequirements.md`: FR-PROD-05 y FR-PROD-08 enmendados con fecha (H-1), FR-ORD con las transiciones;
   - `Screens.md` (productos, movimientos y pedido), `TraceabilityMatrix.md`, `SecurityModel.md` (recuentos) y `EngineeringStandards.md` (la guarda);
   - `Overview.md`: la dependencia `orders → inventory` en vigor.

## Alcance excluido

- **Lo que lee el agente**: `read-v1` sigue entregando el saldo físico; descontar lo reservado es una v2 de la ruta que se decide en la 19.4 o al cerrar la fase (ADR 0020, punto 7).
- **El pedido del agente** y el actor de servicio (19.4).
- **Entregas parciales**, devoluciones, deshacer una entrega, reabrir un cancelado.
- **La venta y su comprobante** (Fase 20), cobros y señas (Fase 21).
- **Editar las líneas** de un pedido.
- **Alertas** de stock bajo o de reservas.
- **El dashboard y las métricas.**
- **Datos de volumen** (`seeds/volume.ts`), seeds y staging.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0037_*.sql` y `drizzle/meta/*`
- `src/modules/inventory/` (todos sus archivos, con sus tests unitarios)
- `src/modules/orders/` (todos sus archivos)
- `src/app/(autenticado)/pedidos/` y `src/app/(autenticado)/clientes/[clientId]/client-orders.tsx`
- `src/app/(autenticado)/productos/`: `page.tsx`, `filters.ts`, `messages.ts`, `actions.ts`, `[productId]/page.tsx` y `[productId]/movimientos/` (con sus tests)
- `tests/integration/`: los de `orders` e `inventory` y `catalog-inventory-schema.test.ts`; `read-api.test.ts` y `read-api-product-stock.test.ts`, **solo** los casos con reservas; un `orders-cycle.test.ts` nuevo si conviene separarlo
- `tests/guards/stock-writes.test.ts` y `tests/guards/exposed-surface.test.ts` (**solo** las acciones nuevas)
- `tests/e2e/orders.spec.ts` y `tests/e2e/products.spec.ts`
- `docs/architecture/DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`; `docs/development/EngineeringStandards.md`
- al cerrar: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

`catalog`, `crm`, `numbering`, `audit`, `src/shared/`, `src/app/api/` y los contratos **no** se tocan.

## Fuentes de verdad

- **El código y las migraciones**: `inventory`, `orders`, `catalog` (`lockProductsForOrder`, `deriveStockStatus`), `drizzle/0036_orders.sql` y las migraciones de `inventories`.
- **Las decisiones**: el [ADR 0020](0020-el-pedido.md), puntos 4 a 7; el [ADR 0008](0008-stock-nunca-negativo.md); el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md); el [brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md) (el ajuste) y el [brief-19.2](brief-19.2-el-pedido.md).
- **Los contratos**: [read-v1](../contracts/read-v1.md), que no cambia.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. La migración.** **Recomendada**: una sola, la `0037`, con la columna, su `CHECK` y el valor nuevo del enum. Las filas existentes quedan con 0 reservado, así que el `CHECK` vale desde el principio. Sin trigger nuevo: los dos `CHECK` son la última defensa (ADR 0008), y las escrituras las vigila `stock-writes`.

**D-2. Las funciones de `inventory`.** **Recomendada**: reciben la transacción por tipo y una lista de líneas `{ productId, quantity }`; **ordenan por producto y bloquean cada saldo con `lockBalance`** en ese orden, aunque `orders` ya los haya pedido ordenados, para que el orden no dependa de quien llama. `lockBalance` pasa a devolver `{ onHand, reserved }`: sigue escribiendo solo la fila en 0. Un producto que aparece dos veces en las líneas es un defecto de quien llama y se rechaza (en un pedido no puede pasar, por el `UNIQUE` de las líneas).

**D-3. El orden de bloqueo de las transiciones.** **Recomendada**: cabecera `FOR UPDATE`; si la transición toca stock, los productos con `lockProductsForOrder` (en modo compartido, por id) y después los saldos en `inventory`. Cancelar un **pendiente** sigue sin bloquear productos ni saldos, como en la 19.2. Ninguna transición bloquea al cliente.

**D-4. Repetir una transición.** **Recomendada**: como la cancelación de la 19.2. Confirmar un confirmado, entregar un entregado y cancelar un cancelado devuelven `changed: false` sin escribir ni auditar; cualquier otro origen da `BUSINESS_RULE_VIOLATION` con `invalid_transition` y el estado actual. Dos confirmaciones simultáneas reservan y auditan una sola vez.

**D-5. El rechazo por falta de stock.** **Recomendada**: `BUSINESS_RULE_VIOLATION` con la regla **`insufficient_stock`** y, por cada línea que no alcanza, su posición, el producto, lo pedido y lo disponible. No se reserva nada. Un producto inactivo da `inactive_product` con sus líneas, antes de mirar el stock. La pantalla los muestra por línea, como los errores del alta.

**D-6. La auditoría.** **Recomendada**: cada transición audita `status_change` en el pedido con `before` y `after` del estado, como la cancelación de la 19.2. **Reservar, liberar y entregar no auditan en el producto**: la traza de lo reservado es la transición del pedido (sus líneas no cambian), y la de la entrega es además el movimiento, de solo inserción. La historia del producto sigue mostrando ediciones y ajustes; el historial de movimientos muestra las entregas.

**D-7. Productos en pantalla.**
- La **lista** muestra en la columna de stock lo **disponible** y, si hay algo reservado, «N reservado» debajo; el estado, el filtro por estado y el orden por stock usan lo disponible.
- La **ficha** y **movimientos** muestran el saldo físico, lo reservado y lo disponible.
- El **historial** etiqueta el tipo nuevo como «Entrega de pedido», con signo «−», y lo filtra con `?tipo=entrega`.
- El **ajuste** muestra lo reservado y, si el saldo resultante quedaría por debajo, lo avisa antes de enviar; el servidor responde `below_reserved` con un mensaje que dice cuánto está reservado y que primero hay que cancelar un pedido.

**D-8. El detalle del pedido.** **Recomendada**: para `admin`, «Confirmar pedido» y «Cancelar pedido» en un pendiente; «Marcar entregado» y «Cancelar pedido» en un confirmado; nada en un entregado o un cancelado. Cada uno con su confirmación, que dice lo que va a pasar con el stock («Reserva…», «Descuenta…», «Libera…»). Las fechas de confirmación y de entrega en la cabecera. Un `viewer` ve el estado y las fechas, sin botones.

**D-9. Lo disponible en un pendiente.** **Recomendada**: el detalle de un pedido **pendiente** suma una columna «Disponible» por línea, para los dos roles (un `viewer` ya ve el stock en productos), marcando las que no alcanzan. Así el operador sabe antes de confirmar. En un confirmado no se muestra: ya está reservado.

**D-10. La separación de `withStock`.** **Recomendada**: las lecturas de servicio siguen con `withStock` tal como está (saldo físico), y las pantallas usan una derivación nueva con lo disponible y lo reservado. Un test de `read-api-product-stock.test.ts` y uno de `read-api.test.ts` fijan, **con un producto que tiene stock reservado**, que la cantidad y el estado del agente siguen con el saldo físico. Una mutación que pase las lecturas de servicio a lo disponible los hace fallar.

**D-11. La conciliación.** **Recomendada**: un test de integración que corre una secuencia de altas, confirmaciones, cancelaciones, entregas y ajustes sobre varios productos, y al final comprueba, con una consulta de prueba que cruza `orders`, `order_lines` e `inventories`, que lo reservado de cada producto es la suma de las líneas de sus pedidos confirmados, y que el saldo físico es la suma de sus movimientos. Es una comprobación de prueba, no una lectura de producción.

**D-12. La guarda `stock-writes`.** **Recomendada**: autoriza exactamente `reserveStock` y `releaseStock` (`update inventories`) y `deliverStock` (`insert inventory_movements`, `update inventories`), además de las dos de hoy, con un caso de fallo versionado por cada una y la evidencia de mutación. La regla «`quantity_on_hand` solo con su movimiento» la fija un test de integración, no la guarda, que no distingue columnas: se declara como límite.

**D-13. Cancelar un confirmado con un producto inactivo o sin saldo.** **Recomendada**: se cancela siempre y libera lo reservado (ADR 0020, punto 4). Si lo reservado no alcanzara para liberar, es un defecto y lo frena el `CHECK`; un test lo fija como imposible por la vía de la aplicación.

**D-14. La revisión independiente.** **Recomendada**: un agente de solo lectura, contra este brief, el ADR 0020 y las reglas vigentes, antes del commit. Es la primera escritura de stock fuera del ajuste y la primera de `inventories` sin movimiento.

**D-15. El despliegue a producción y el recorrido.** **Recomendado**: sí, después de la revisión independiente y con la CI del SHA exacto en `success`, autorizado aparte. Lleva la `0037`. El recorrido, en «Demostración Vixora», donde trabaja el usuario (la organización del operador no tiene productos): crear un pedido de una unidad de un producto con stock, confirmarlo y ver lo reservado en el producto, cancelarlo y ver que se libera; crear otro, confirmarlo y **entregarlo**, ver el movimiento, y **reponer esa unidad con un ajuste positivo** con el motivo «Reposición del recorrido de la 19.3». Entregar baja por un momento el stock que el agente lee en la demostración (H-6); la reposición lo deja como estaba, con dos movimientos más en el historial. Volver a `ef75da3` es posible: el código anterior no conoce `order_delivery` ni lo reservado, pero los `CHECK` siguen protegiendo el saldo; un ajuste que bajara de lo reservado fallaría con un error en lugar de un mensaje.

## Invariantes

- El saldo físico nunca es negativo y lo reservado nunca supera al saldo físico ni es negativo (ADR 0008, ADR 0020).
- El saldo físico nunca cambia sin su movimiento; lo reservado cambia solo con una transición del pedido, en la misma transacción que su auditoría.
- Lo reservado de cada producto es la suma de las líneas de sus pedidos confirmados.
- `inventory` no depende de `orders`; ningún módulo existente depende de `orders`.
- `read-v1` entrega lo mismo que antes, con o sin reservas.
- Un `viewer` no confirma, entrega ni cancela; la base sigue impidiendo cualquier transición fuera de la tabla.
- Las cantidades nunca pasan por `number`.

## Criterios de aceptación

- **AC-1 (esquema)**: la `0037` suma la columna con su `CHECK` y el valor del enum. Con el rol dueño y con `crm_app`, lo reservado negativo, mayor que el saldo, o un saldo que baja por debajo de lo reservado dan la violación del `CHECK`. Lo prueba `catalog-inventory-schema.test.ts`.
- **AC-2 (funciones de stock)**: `reserveStock`, `releaseStock` y `deliverStock` escriben exactamente lo del ADR, en el orden de D-2; `reserveStock` sin stock suficiente no escribe nada y devuelve las líneas; `deliverStock` deja un movimiento por línea con su `balance_after` y su motivo, y funciona cuando todo el saldo está reservado.
- **AC-3 (transiciones)**: `confirmOrder`, `deliverOrder` y `cancelOrder` hacen cada transición del punto 4 con su efecto exacto en el saldo, lo reservado, las fechas y la auditoría; `FORBIDDEN` a un `viewer`; `NOT_FOUND` de otra organización; `invalid_transition` y `changed: false` según D-4; `insufficient_stock` e `inactive_product` según D-5; cancelar y entregar con un producto inactivo funcionan. Un rechazo no escribe nada.
- **AC-4 (concurrencia)**: dos confirmaciones de pedidos que compiten por el mismo stock reservan solo lo que alcanza; una confirmación simultánea con un ajuste negativo termina coherente; dos transiciones del mismo pedido se serializan; transiciones de pedidos con los mismos productos en otro orden no se traban.
- **AC-5 (ajuste)**: `adjustStock` rechaza `order_delivery` como tipo y rechaza con `below_reserved` (saldo, reservado y cantidad) un ajuste negativo que dejaría el saldo por debajo de lo reservado; los ajustes que no lo hacen siguen igual.
- **AC-6 (lo que lee el agente)**: con stock reservado, las tres lecturas de servicio entregan el saldo físico y su estado, igual que antes (D-10), y la mutación de D-10 los hace fallar.
- **AC-7 (conciliación)**: el test de D-11 pasa.
- **AC-8 (pantallas)**: un end-to-end sobre `next start`: `admin` confirma un pedido y ve lo reservado y lo disponible en el producto; confirmar sin stock suficiente muestra las líneas que no alcanzan; entrega y ve la entrega en el historial de movimientos; cancela un confirmado y ve lo liberado; un ajuste por debajo de lo reservado muestra su mensaje; un `viewer` ve los estados sin botones. axe sin violaciones en claro y en oscuro, y los botones se usan con teclado.
- **AC-9 (guardas)**: `stock-writes` pasa con el código y falla con cada caso versionado, con la evidencia de mutación; `exposed-surface` declara las acciones nuevas.
- **AC-10 (contratos)**: `read-api` e `ingestion-v2` pasan, y los únicos cambios en sus tests son los casos con reservas de D-10.
- **AC-11**: la batería de la CI completa pasa en local y en la CI del SHA del cierre.
- **AC-12**: la documentación del punto 7 queda actualizada, con las enmiendas fechadas de H-1, sin reescribir ninguna decisión anterior.
- **AC-13** (si D-15): producción corre el SHA del cierre con la `0037` aplicada, y el recorrido de D-15 deja lo reservado en 0, el stock de la demostración como estaba y la conciliación en cero diferencias.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7 y AC-9, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-6 y AC-10 (lo que consume el agente).
- `isolated-runtime`: AC-13, si se despliega.
- La batería se corre **desde Git Bash**, y cada archivo nuevo va al índice con `git add -N` al crearlo.

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada, incluidos `catalog`, `crm`, `src/shared/` y `src/app/api/`;
- el diseño exigiría cambiar el texto del ADR 0020 o de los ADR 0008 y 0013, o el esquema de `orders`;
- `read-v1` o `ingestion-v2` tendrían que cambiar;
- `inventory` tendría que depender de `orders`;
- aparece un camino por el que el saldo físico cambia sin movimiento, lo reservado cambia sin una transición, o un `viewer` cambia un pedido;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, y desplegar. Cada una necesita autorización explícita en su turno.

## Resultados — 2026-10-11 (autoevaluación)

Implementado el 2026-10-11. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-14 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

- **Las escrituras que autoriza `stock-writes` son las del repositorio**, no las funciones del servicio que nombraba D-12.
  - `reserveStock`, `releaseStock` y `deliverStock` son el servicio que recibe la transacción de `orders`.
  - Escriben por `setReserved` (solo lo reservado) y `applyDelivery` (el movimiento, y después saldo y reservado en una sentencia). Esas son las funciones de `repository.ts` que la guarda autoriza, como antes `lockBalance` y `applyStockChange`.
  - Desde la revisión independiente (R-3), la guarda fija además **los llamadores**: `setReserved` y `applyDelivery` se llaman solo desde esas tres, y esas tres, fuera de `inventory`, solo desde `src/modules/orders/service.ts`.

  Es una precisión de D-12; el ADR 0020 no cambia.
- **Un rechazo después de bloquear saldos se lanza** para revertir la transacción. `lockBalance` crea la fila en 0 de un producto sin saldo, y un `insufficient_stock` devuelto sin lanzar la habría dejado. Lo prueba `orders-cycle.test.ts`.
- **El rechazo del ajuste suma `currentQuantityReserved`** a las tres reglas de saldo, no solo a `below_reserved`. Por eso se actualizaron tres aserciones de `inventory-adjustment.test.ts` y dos de `productos/messages.test.ts`.
- **Un test de la 19.2 cambió a propósito**: «un pedido confirmado no se cancela en la 19.2» pasó a «un pedido entregado no se cancela», porque la 19.3 habilita cancelar un confirmado.
- **El aviso del ajuste no bloquea el envío** cuando el saldo quedaría por debajo de lo reservado. Sí lo bloquea con un saldo negativo. Lo reservado puede cambiar entre la vista y el envío, y quien decide es el servidor, con `below_reserved`.
- **`getAvailableStock` exige `authorize`** para los dos roles y devuelve un resultado, como las demás lecturas de `inventory`. Se corrigió antes de la batería final.
- **`cancel-form.tsx` se reemplazó por `transition-form.tsx`**, común a las tres transiciones, con los mismos textos de la cancelación que fijaba el end-to-end de la 19.2.
- **La columna de la lista de productos** se llama «Disponible».
- **`products.spec.ts` no se tocó.** Los casos de la 19.3 viven en `orders.spec.ts` (casos 5 y 6), y los 29 casos de productos pasan sin cambios.
- **Las fechas de cada estado** se muestran en la tarjeta «Estado» del detalle, no en la cabecera que nombraba D-8 (N-3 de la revisión).

### Archivos

Todos los archivos tocados están en la lista autorizada, más `docs/development/TestingStrategy.md`, que el usuario sumó el 2026-10-11 por R-8. Tres casos de borde quedan dentro de ella así:

- `productos/messages.test.ts`, como test de `messages.ts`;
- `pedidos/messages.test.ts` y `pedidos/filters.test.ts`, dentro de `pedidos/`.

No se tocaron `catalog`, `crm`, `numbering`, `audit`, `src/shared/`, `src/app/api/`, los contratos ni el esquema de `orders`.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `catalog-inventory-schema.test.ts`: lo reservado arranca en 0; se rechaza negativo, mayor que el saldo, y el saldo que baja por debajo. Con el dueño y, desde R-5, también con `crm_app`. `order_delivery` se acepta |
| AC-2 | cumplido | `orders-cycle.test.ts`: las funciones a través de las transiciones y, desde R-4, directas (todo o nada, producto repetido, liberar o entregar más de lo reservado), y la entrega con todo el saldo reservado |
| AC-3 | cumplido | `orders-cycle.test.ts`: cada transición con su efecto; roles, organización, id e idempotencia; `invalid_transition`; `insufficient_stock` sin escribir ni la fila en 0; `inactive_product`; entregar y cancelar con un producto inactivo |
| AC-4 | cumplido | `orders-cycle.test.ts`, cinco escenarios concurrentes, ninguno se traba: dos pedidos por el mismo stock, dos confirmaciones del mismo pedido, confirmación contra ajuste negativo con el saldo retenido, cinco rondas con los productos en otro orden, y entrega contra cancelación con la cabecera retenida |
| AC-5 | cumplido | `orders-cycle.test.ts` (`below_reserved` y `order_delivery` rechazado), `service.test.ts` e `inventory-adjustment.test.ts` |
| AC-6 | cumplido | `read-api.test.ts` 6d y `read-api-product-stock.test.ts` 8b; la mutación de D-10 los hace fallar a los dos |
| AC-7 | cumplido | `orders-cycle.test.ts`, la conciliación: lo reservado contra los confirmados y el saldo contra los movimientos |
| AC-8 | cumplido | `orders.spec.ts` casos 5 y 6, y el 4 con el viewer en un confirmado; axe en claro y oscuro, y desde R-6 el foco recorrido con el teclado |
| AC-9 | cumplido | `stock-writes` con sus casos y las mutaciones de abajo; `exposed-surface` con las dos acciones |
| AC-10 | cumplido | `read-api` e `ingestion-v2` pasan; los únicos cambios son 6d y 8b |
| AC-11 | local cumplido; CI pendiente | la batería local, abajo; la CI, con el commit |
| AC-12 | cumplido | DataModel, Overview, FunctionalRequirements (FR-PROD-05 y 08 enmendados, FR-ORD-08 a 10), Screens, TraceabilityMatrix, SecurityModel (85) y EngineeringStandards |
| AC-13 | pendiente | el despliegue, con su autorización |

**Mutaciones** (EngineeringStandards), cada una sobre el código real, corrida y revertida:

| Mutación | Test | Resultado |
|---|---|---|
| `withPhysicalStock` usa lo disponible (D-10) | `read-api` 6d y 8b | fallan los dos |
| `setReserved` inserta un movimiento | `stock-writes` | falla, 2 casos |
| `applyDelivery` borra `inventories` | `stock-writes` | falla, 2 casos |
| `reserveStock` actualiza `inventories` en el servicio | `stock-writes` | falla, 1 caso |
| una función de `orders/repository.ts` escribe lo reservado con SQL | `stock-writes` | falla, 1 caso |
| `adjustStock` llama a `setReserved` (R-3) | `stock-writes`, llamadores | falla, 1 caso |
| `catalog` llama a `releaseStock` (R-3) | `stock-writes`, llamadores | falla, 1 caso |
| sin mutación | `stock-writes` | 39 en verde |

**Batería local final** (2026-10-11, Git Bash, después de las correcciones de la revisión): formato, lint, typecheck y build en verde; 685 unitarios, 559 guardas, 980 de integración en 57 archivos, y el end-to-end en dos tandas sobre `next start`, 81 y 80, sin fallos ni reintentos. Una corrida anterior, interrumpida para aplicar las correcciones, dio en integración «975 de 977» en 56 de 57 archivos; el filtro de su salida no mostró los nombres, así que esos dos no se identificaron (fallo intermitente o salteados). Se declara, no se explica.

## Revisión independiente — 2026-10-11

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0020 y las reglas vigentes. **Veredicto R1**: 4 hallazgos medios y 5 bajos, ninguno bloqueante. Cada uno se verificó contra el código antes de aceptarlo:

- **R-1 (medio, verificado)**: SecurityModel decía 85 en el texto, pero su tabla seguía en 41 acciones bajo `(autenticado)` y su texto en «58 que no son páginas». **Corregido**: 43 y 60.
- **R-2 (medio, verificado)**: Overview seguía diciendo que `applyStockChange` es la única escritura del saldo, y no nombraba `below_reserved`. **Corregido** con una nota fechada.
- **R-3 (medio, verificado)**: la guarda autorizaba las funciones del repositorio y no veía quién las llama, y D-12 nombraba las del servicio. **Corregido**: la guarda suma los llamadores, con cinco casos de fallo y dos mutaciones; D-12 queda precisado arriba.
- **R-4 (medio, verificado)**: faltaban tres tests: los de D-13 (liberar o entregar más de lo reservado), el del producto repetido de D-2 y el de las funciones directas. **Agregados**.
- **R-5 (bajo, verificado)**: AC-1 con `crm_app` probaba solo un caso. **Agregados** los otros dos.
- **R-6 (bajo-medio, verificado)**: la confirmación desmontaba el botón sin mover el foco, y el end-to-end lo tapaba con `.focus()`. **Corregido**:
  - el foco va a «Sí, …», que lleva la pregunta como descripción, y vuelve al botón con «No, volver»;
  - el end-to-end lo recorre con Enter y Tab;
  - la cancelación de la 19.2 tenía el mismo defecto, y queda corregida con el mismo componente.
- **R-7 (bajo, verificado)**: faltaban el viewer en un confirmado, lo liberado en pantalla y los filtros nuevos. **Agregados** en `orders.spec.ts` y `filters.test.ts`.
- **R-8 (bajo, verificado)**: Screens §14 y FunctionalRequirements seguían en futuro (**corregidos**), y EngineeringStandards citaba una evidencia que esta sección ahora contiene. **`docs/development/TestingStrategy.md` también dice que solo `lockBalance` y `applyStockChange` escriben esas tablas**, y no está en la lista autorizada. **El usuario autorizó corregirlo el 2026-10-11** (ampliación de la lista): **corregido** con una nota fechada.
- **R-9 (bajo, verificado)**: la clave de React de los detalles del rechazo podía repetirse. **Corregido** con la posición.

Las notas N-1 a N-8 no son defectos:

- los rechazos no escriben;
- no hay un ciclo de bloqueos posible;
- `read-v1` sigue con el saldo físico;
- `inventory` no importa `orders`;
- N-4: el aviso del ajuste usa lo reservado que se cargó con la página. Es solo orientativo: decide el servidor;
- N-7: el `quantity_available` que lee el agente es el saldo físico. Es el límite que acepta el ADR 0020, punto 7.
