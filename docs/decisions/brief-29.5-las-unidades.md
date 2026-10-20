---
schema: task-brief.v1
task_id: "29.5"
task_type: implementation
generated_at: 2026-10-19
---

# Brief 29.5 — Las unidades, con IMEI

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Migración, código, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado por el usuario el 2026-10-19, con las recomendaciones** (D-1 (a): la 29.5 y la 29.5.2).
- **Gate**: la Fase 29 se construye sin el negocio confirmado por decisión del usuario del 2026-10-18 (brief-29.2), sobre «iPhone Demo».

## Objetivo

Que un producto pueda llevarse **por unidad**, cada una con su número de serie o IMEI, su costo y su estado, y que el saldo de ese producto sea siempre la cantidad de sus unidades vendibles. Es el punto 6 del [ADR 0024](0024-rubros-y-capacidades.md) y la primera parte de su fila 29.5 (punto 17).

## Contexto

El ADR 0024 decidió el diseño: `products.tracking` (`quantity` o `unit`), la condición `used`, la tabla `stock_units` en `inventory`, los grados del perfil, las líneas hijas con las unidades de cada línea, la tabla de caminos del stock con una función y un llamador por camino, el test de invariante y la exclusión de `used` en `read-v1` y `read-v2`.

El mapa del código (2026-10-19, contra `93c2be1`) confirma que existen las siete funciones de la tabla, con esos nombres y en esos módulos. También muestra que el punto 6 no entra en una sola subfase sin riesgo. Toca el saldo de **todas** las organizaciones a través de seis caminos en cuatro módulos, y el pedido choca con la tabla del ADR (H-4).

## Hallazgos (verificados contra el código)

- **H-1. El saldo hoy es solo una cantidad.** `inventories` tiene `quantity_on_hand` y `quantity_reserved`, y `inventory_movements` no tiene `unit_id` (`inventory/schema.ts:21-124`). Las escrituras pasan solo por `inventory/repository.ts`. Los seeds y algunos end-to-end escriben el saldo con SQL directo (`seeds/pilot.ts:598`, `seeds/volume.ts:745`, `tests/e2e/sales.spec.ts:631` y otros).
- **H-2. La guarda `stock-writes` no fija la función que llama a inventory, solo el archivo o la carpeta** (`tests/guards/stock-writes.test.ts:312-340`). Todo `src/modules/purchasing/` puede llamar a `receiveStock`, y `adjustStock` no tiene guarda de llamador. El ADR, punto 6, dice «`stock-writes` fija cada función y su único llamador». Hoy eso no se cumple a nivel de función.
- **H-3. `lockLines` es privada de inventory y ordena por producto** (`inventory/service.ts:827-854`). `StockLine` no lleva unidades. El orden común de bloqueo es: la cabecera o el cliente, los productos `FOR SHARE` por id, los saldos `FOR UPDATE` por producto, el contador y los inserts. La unidad no tiene lugar en ese orden. El ADR, punto 16, fija «la unidad después del producto y antes del saldo».
- **H-4. El pedido fija el precio de cada línea al crearse pendiente** (`orders/service.ts:257-274`). `order_lines` es de solo inserción y `orders_guard` solo deja cambiar el estado (`drizzle/0036`). El ADR quiere que la línea valga la suma de los precios de sus unidades y que la unidad se reserve al confirmar, así que el pedido tiene que elegir sus unidades al crearse. El del agente nace pendiente y no puede elegirlas. **Es una contradicción del ADR con el código**, que se resuelve en la 29.5.2 (D-1).
- **H-5. `releaseStock` y `deliverStock` lanzan errores en vez de devolver un resultado**, y ninguna firma lleva unidades (`inventory/service.ts:887, 909`).
- **H-6. La recepción escribe `product_costs` en todas sus líneas** (`purchasing/goods-receipts.ts:511`). El ADR, punto 6, dice que en un producto `unit` no lo hace.
- **H-7. El contrato de lectura del agente acepta solo `new` y `refurbished`** (`api/read/v1/contract.ts:103`; v2 lo reutiliza), y no filtra la condición en ningún lado. La búsqueda del agente usa la **misma consulta** que los buscadores de la aplicación (`catalog/repository.ts:231`, usada por `suggestProducts` y por `searchActiveProductsForService`). Si se agrega `used` al enum, `toContractProduct` (`contract.ts:300`) deja de compilar.
- **H-8. `updateProduct` cambia la condición en cualquier momento** (`catalog/service.ts:593-676`).
- **H-9. El test de conciliación del saldo suma mal**: suma solo `adjustment_positive` y resta todos los demás tipos, incluidos `goods_receipt` y `sale_void` (`tests/integration/orders-cycle.test.ts:969`). Hoy no falla porque esa suite no usa esos tipos.
- **H-10. Los enums.** `capability` tiene solo `variants`, `attribute_entity` solo `product`, `audit_entity_type` no tiene tipo para la unidad, y `product_condition` tiene `new` y `refurbished`. `scripts/migrar.ts` aplica todas las migraciones pendientes **en una sola transacción**, así que un valor nuevo no se puede usar en la misma corrida (DataModel:755; nota «A New Enum Value Cannot Be Used…» de la 29.4.2).
- **H-11. El script `activar-capacidad.ts` y los perfiles** tienen su propia lista de capacidades (`scripts/activar-capacidad.ts:24`; `profiles/index.ts:20`). El perfil de iPhone copia hoy solo atributos. Una copia nueva necesita su regla en `capability-reads`.
- **H-12. No hay pantalla de stock propia.** El stock de un producto vive en `/productos/[productId]` y `/productos/[productId]/movimientos`, con el ajuste solo para `admin`. El `viewer` no ve costos (FR-PROD-21).

## Decisiones

### D-1 — División de la subfase (H-4, H-5)

- **(a) Recomendada: dos subfases**, como la 29.4.
  - **29.5 — Las unidades**: el producto por unidad, la unidad, sus entradas y salidas fuera de pedidos y ventas (recepción de mercadería, alta y baja manual), el saldo derivado, la guarda, el invariante, las pantallas y la exclusión de `used` para el agente. **Mientras no exista la 29.5.2, un producto `unit` no entra en un pedido ni en una venta**: se rechaza con un motivo, también en el pedido del agente. Así el invariante nunca se rompe.
  - **29.5.2 — Las unidades en pedidos y ventas**: `order_line_units` y `sale_line_units`, el precio propio de la unidad, elegir las unidades al crear el pedido (resuelve H-4 con una nota fechada al ADR 0024), reservar, liberar, entregar, vender y anular, con las firmas de H-5.
- (b) Una sola 29.5 con todo: un cambio que toca seis caminos del stock de todas las organizaciones y tiene que resolver H-4 a mitad de camino.

### D-2 — La migración `0056` (H-10)

Una sola migración, aditiva:
- `ALTER TYPE capability ADD VALUE 'serialized_units'`, `product_condition ADD VALUE 'used'` y `audit_entity_type ADD VALUE 'stock_unit'`. **Ningún `CHECK`, trigger ni dato de la `0056` nombra esos valores**: los usa el código en tiempo de ejecución. Un test migra hasta la `0055`, confirma y aplica la `0056` sola, como en la 29.4.2.
- Enum nuevo `stock_tracking` (`quantity`, `unit`) y `products.tracking not null default 'quantity'`.
- Enum nuevo `stock_unit_status` **solo con `available` y `written_off`**. Cada estado entra con la subfase que lo usa (ADR 0024, R-19): `reserved` y `sold` en la 29.5.2, `in_repair` en la 29.6 e `in_review` en la 29.7.
- Enum nuevo `stock_unit_origin` con `goods_receipt` y `manual`. `trade_in` entra en la 29.7.
- `unit_grades` (de `inventory`): por organización, con el nombre, el orden, `is_active` e `is_example`, y nombre único por organización.
- `stock_units` (de `inventory`): `organization_id`, `product_id` (FK compuesta), `serial` (texto de 1 a 32, sin espacios en los extremos), `status`, `grade_id` (FK compuesta, opcional), `battery_health` (0 a 100, opcional), `cost` y `cost_currency`, `origin_type` y `origin_id` (clave plana, sin FK, ADR 0024 R-16), `created_by`, `created_at` y `updated_at`.
  - **El IMEI es único por organización sin distinguir mayúsculas, entre las unidades que no están dadas de baja** (índice único parcial sobre `lower(serial)` con `status <> 'written_off'`). Así, una recepción anulada se puede volver a recibir y un IMEI mal cargado se corrige con la baja y un alta nueva (ADR 0024, punto 6). Si se lo hiciera único entre todas, ninguna de las dos cosas sería posible. **La vuelta de una unidad vendida como usado (29.7)** la decide ese brief.
  - El `serial` no se edita: un trigger lo rechaza. Las transiciones de `status` las fija un trigger, como `orders_guard`: en la 29.5, solo `available → written_off`.
  - `crm_app`: `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`.
- `inventory_movements.unit_id` (FK compuesta, opcional). Que sea obligatorio en un producto `unit` lo asegura el servicio y lo prueba el invariante. Un `CHECK` no lo puede ver, porque `tracking` está en otra tabla.
- `goods_receipt_line_units` (de `purchasing`): la línea y la unidad, una fila por unidad, de solo inserción.
- **El precio propio y los días de garantía de la unidad no entran**: los usan la 29.5.2 y la 29.9, y el proyecto no crea columnas sin uso.

### D-3 — `products.tracking` (ADR 0024, punto 6; H-8)

- Lo cambia `inventory`, que comprueba que el producto no tiene saldo ni movimientos, y llama a una función de escritura de `catalog` con su transacción (ADR 0024, R-16). Una guarda fija ese único llamador.
- Pasar a `unit` exige la capacidad `serialized_units`.
- En un producto `unit`, **cambiar la condición** también se rechaza si tiene unidades no dadas de baja. Así, una unidad nunca cambia de nuevo a usado sin pasar por la baja.
- La pantalla: un selector «Se lleva por: cantidad / unidad (con IMEI)» en la ficha del producto, solo con la capacidad y mientras no tenga movimientos, con la explicación al lado.

### D-4 — Los caminos de la 29.5 (ADR 0024, punto 6; H-2, H-3)

| Operación | Unidad | Saldo y movimiento | Función (llamador) |
|---|---|---|---|
| Recepción de mercadería | se crea `available`, con el IMEI de la línea y el costo unitario de la línea | +1 por unidad, `goods_receipt`, con `unit_id` | `receiveStock` extendida (`createGoodsReceipt`) |
| Anulación de la recepción | `available` → `written_off`; si alguna ya no está `available`, se rechaza | −1 por unidad, `goods_receipt_void` | `removeReceivedStock` extendida (`voidGoodsReceipt`) |
| Alta manual | se crea `available`, con su IMEI, su costo, su grado y su batería | +1, `adjustment_positive` | `registerUnit`, nueva (acción de `admin`) |
| Baja manual | `available` → `written_off`, con motivo | −1, `adjustment_negative` | `writeOffUnit`, nueva (acción de `admin`) |
| Ajuste de cantidad | — | **se rechaza** en un producto `unit` | `adjustStock` |
| Pedido o venta de un producto `unit` | — | **se rechaza hasta la 29.5.2** (D-1) | `createOrder`, `placeOrderFromIngestion`, `issueSale` |

- **Un movimiento por unidad**, cada uno con su `unit_id`. Así, el historial de movimientos dice qué IMEI entró o salió.
- **El orden de bloqueo** (ADR 0024, punto 16; H-3): los productos `FOR SHARE`, **las unidades `FOR UPDATE` por id**, los saldos `FOR UPDATE` por producto, el contador y los inserts.
- **La recepción no escribe `product_costs` en un producto `unit`** (H-6): el costo vive en la unidad. En un producto `quantity`, no cambia.
- **El grado y la batería** los fija el alta y los corrige un `admin`, con auditoría. **El costo no se corrige en la 29.5**: lo cambian la recepción, el alta y, desde la 29.6, las reparaciones.
- **La guarda `stock-writes`** fija las funciones nuevas **a nivel de función**: cada una con su único llamador, como pide el ADR. Las existentes, que hoy fijan el archivo o la carpeta (H-2), quedan como están; endurecerlas es un hallazgo aparte, no un cambio de esta subfase.

### D-5 — Los grados y el perfil (ADR 0024, punto 13; H-11)

- `unit_grades` se copia del perfil de iPhone con `is_example`: «A», «B» y «C», con su descripción corta («como nuevo», «marcas leves», «marcas visibles»).
- `scripts/activar-capacidad.ts` y el perfil suman `serialized_units`. Al activarla, el script copia los grados en la misma transacción, con su auditoría. Una regla nueva en `capability-reads` fija ese único camino.
- Un `admin` agrega, renombra, ordena y desactiva grados desde una pantalla de la capacidad, en `/modelos/grados` o una ruta hermana. Un grado en uso no se borra: se desactiva.

### D-6 — Las pantallas (H-12)

- **Ficha del producto `unit`**: una sección «Unidades» con las unidades disponibles (IMEI, grado, batería y fecha) y las dadas de baja aparte, más «Cargar unidad» y «Dar de baja» para un `admin`. El costo de cada unidad solo lo ve un `admin` (FR-PROD-21).
- **La recepción de mercadería** pide, en cada línea de un producto `unit`, un IMEI por unidad. La cantidad de IMEI tiene que ser igual a la cantidad de la línea, y el servicio lo comprueba.
- **El historial de movimientos** muestra el IMEI de cada movimiento que tiene unidad.
- **El ajuste de stock** no se ofrece en un producto `unit`: en su lugar, «Cargar unidad» y «Dar de baja».
- **El pedido y la venta** rechazan un producto `unit` con el texto «Este producto se vende por unidad: todavía no se puede agregar a un pedido ni a una venta». El buscador lo muestra igual. Lo resuelve la 29.5.2.
- Funciona sin JavaScript, con axe en claro y oscuro y a 375 px, como el resto.

### D-7 — El agente (ADR 0024, punto 15; H-7)

- **`read-v1` y `read-v2` excluyen los productos `used`** de la búsqueda, el detalle y el stock, **solo en las funciones `…ForService`**. Los buscadores de la aplicación siguen mostrándolos. No cambia la forma del contrato.
- El tipo del contrato se acota con un mapeo explícito, para que `used` no pueda llegar al objeto estricto ni romper la compilación.
- **El pedido del agente** rechaza un producto `unit` (D-1) con el mismo error que un producto que no se vende. **Un producto `unit` nuevo sigue apareciendo** en la búsqueda con su stock, como cualquier producto, porque su saldo es exacto.
- Hoy ninguna organización tiene productos `used`, así que en producción el agente no ve ningún cambio.

### D-8 — El invariante (ADR 0024, punto 6; H-1, H-9)

- **Un helper de test** compara el saldo con las unidades: `quantity_on_hand` es igual a las unidades `available` (en la 29.5, sin `reserved`), y la suma de los movimientos con su signo es igual al saldo. Se corre después de cada escritura de las suites de `inventory` y `purchasing`, y la 29.5.2 lo suma a `orders` y `sales`.
- Se corrige el signo de la conciliación de `orders-cycle.test.ts:969` (H-9), con un mapa de signo por tipo de movimiento.

### D-9 — Roles

Un `admin` cambia el seguimiento, carga y da de baja unidades, recibe mercadería con IMEI y configura los grados. Un `viewer` ve las unidades, sus grados, su batería y sus movimientos, sin el costo.

### D-10 — Pruebas

- **Unitarias**: la validación del IMEI, el signo de cada tipo de movimiento y la regla del cambio de seguimiento.
- **Integración contra PostgreSQL**:
  - el esquema: los `CHECK`, el índice único parcial (incluido que una unidad dada de baja libera su IMEI), el trigger del `serial` y el de las transiciones, y que un valor nuevo de enum no se usa en su lote (migra hasta la `0055` y aplica la `0056` sola);
  - cada camino de D-4, con el invariante después de cada escritura;
  - el rechazo del ajuste, del pedido, del pedido del agente y de la venta de un producto `unit`;
  - la anulación de una recepción con una unidad ya dada de baja, que se rechaza;
  - dos altas concurrentes del mismo IMEI, y una baja concurrente con una anulación de la recepción;
  - el cambio de seguimiento con movimientos, que se rechaza, y sin la capacidad;
  - la recepción sin `product_costs` en un producto `unit`;
  - `read-v1` y `read-v2` sin productos `used`, y los buscadores de la aplicación con ellos;
  - el `viewer` sin costos;
  - el aislamiento: una organización no ve ni toca las unidades de otra;
  - **sin la capacidad, nada cambia**: las suites de siempre pasan sin tocarlas.
- **Guardas**: `stock-writes` con las funciones nuevas fijadas por función, `capability-reads` con la copia de los grados, `module-boundary` (`inventory` no importa `purchasing`), `exposed-surface` con las acciones nuevas.
- **End-to-end**: activar el seguimiento por unidad, recibir mercadería con IMEI, ver las unidades y el historial, cargar y dar de baja una unidad, el rechazo del pedido, el `viewer` sin costos, sin JavaScript, axe en claro y oscuro, y 375 px.
- **Antes del commit**: `npm run format:check` completo y `npm run build` antes de cada corrida end-to-end.

### D-11 — Revisión independiente, despliegue y cierre

- **Revisión independiente**: sí, antes del despliegue. Toca el saldo de todas las organizaciones. Un agente de solo lectura contra este brief, el ADR 0024, el ADR 0008, el ADR 0023 y el código.
- **Despliegue**, con la autorización del usuario: la `0056` y el código.
- **El operador** activa `serialized_units` en «iPhone Demo» con el script, en su terminal, como en la 29.2.
- **Recorrido del usuario**: pasar un producto a «por unidad», recibir mercadería con IMEI de un proveedor, ver las unidades, dar de baja una y ver el rechazo en un pedido. «Demostración Vixora» se comprueba con recuentos.
- **Cierre**: DataModel, FunctionalRequirements, Overview (dependencias), una nota al ADR 0024 (H-4 y la división, el índice parcial y los estados por subfase) y otra al 0023 (punto 5), el runbook de la capacidad, el CHANGELOG, el HANDOFF, el Roadmap, Notion (la 29.5.2 nueva en «Esperando») y Knowledge Capture.

## Alcance incluido

- `drizzle/0056_*.sql` y su snapshot.
- `src/modules/inventory/` (esquema, repositorio y servicio: unidades, grados, caminos).
- `src/modules/catalog/` (`tracking`, `used`, la función de escritura del seguimiento, la condición, y el filtro del servicio para el agente).
- `src/modules/organizations/` (la capacidad, el perfil).
- `src/modules/purchasing/` (la recepción y su anulación con IMEI).
- `src/modules/orders/` y `src/modules/sales/`: **solo el rechazo** de un producto `unit`.
- `src/modules/audit/` (el tipo de entidad).
- `src/app/api/read/` (el mapeo de la condición).
- `src/app/(autenticado)/`: `productos/`, `modelos/` (los grados) y `compras/recepciones/`.
- `scripts/activar-capacidad.ts`.
- `tests/` (unitarias, integración, guardas y end-to-end).
- La documentación del cierre.

## Alcance excluido

- Todo lo de la 29.5.2: las unidades en pedidos y ventas, `order_line_units`, `sale_line_units`, el precio propio de la unidad, y los estados `reserved` y `sold`.
- Los atributos definidos de la unidad (`attribute_entity` `unit`): ningún dato del perfil de iPhone los necesita todavía. Entran cuando uno los pida.
- Los días de garantía de la unidad (29.9), las reparaciones (29.6), el usado recibido y la permuta (29.7), el contrato nuevo del agente (29.8).
- Endurecer las reglas existentes de `stock-writes` (H-2).
- Cambios en «Demostración Vixora» o en cualquier organización que no sea «iPhone Demo».
- Dependencias nuevas y cambios en el agente o en su repositorio.

## Invariantes

1. **Una organización sin la capacidad, y un producto `quantity`, se comportan exactamente como hoy.**
2. **El saldo de un producto `unit` es igual a sus unidades `available`**, y nunca cambia sin su movimiento, que lleva la unidad (ADR 0008).
3. **Un IMEI no se repite entre las unidades vigentes de una organización**, sin distinguir mayúsculas.
4. **El IMEI de una unidad no se edita.**
5. **Un producto `unit` no entra en un pedido ni en una venta hasta la 29.5.2.**
6. **El agente nunca ve un producto `used`, un IMEI ni un costo.**
7. **Aislamiento por organización**: las claves compuestas lo exigen en la base.
8. **La migración es aditiva**, y ningún valor nuevo de enum se usa en su lote.
9. **`inventory` no importa `purchasing`, y ningún módulo del núcleo importa un módulo de capacidad.**
10. **Los contratos del agente no cambian de forma.**

## Criterios de aceptación

- **AC-1**: un `admin` pasa a «por unidad» un producto sin movimientos, en una organización con la capacidad; con movimientos o sin la capacidad, se rechaza.
- **AC-2**: un `admin` recibe mercadería de un producto `unit` con un IMEI por unidad: se crean las unidades `available`, el saldo sube una por unidad con su movimiento, y no se escribe `product_costs`. La anulación las da de baja, o se rechaza si alguna ya no está disponible.
- **AC-3**: un `admin` carga una unidad a mano y la da de baja; el saldo y el historial lo reflejan, con el IMEI.
- **AC-4**: un IMEI repetido entre unidades vigentes se rechaza, también en dos altas concurrentes; el de una unidad dada de baja se puede volver a cargar.
- **AC-5**: el ajuste de cantidad, el pedido (también el del agente) y la venta de un producto `unit` se rechazan con su motivo.
- **AC-6**: el invariante del saldo y las unidades se cumple después de cada escritura de las suites de `inventory` y `purchasing`.
- **AC-7**: `read-v1` y `read-v2` no devuelven productos `used`; los buscadores de la aplicación sí.
- **AC-8**: un `viewer` ve las unidades sin su costo.
- **AC-9**: sin la capacidad, y en un producto `quantity`, nada cambia.
- **AC-10**: guardas, unitarias, integración y end-to-end pasan en CI, con axe sin violaciones.
- **AC-11**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-12**: desplegada, con la capacidad activada en «iPhone Demo» y recorrida por el usuario, con «Demostración Vixora» intacta.

## Pruebas y evidencia requerida

Las de D-10, en CI sobre el SHA desplegado; el recorrido del usuario en «iPhone Demo»; y una consulta de solo conteos que muestre que «Demostración Vixora» no tiene la capacidad, unidades ni productos `unit`.

## Condiciones de detención

Detenerse y avisar si:

- el invariante obliga a cambiar el saldo por un camino que no pase por `inventory`;
- un producto `quantity` o una organización sin la capacidad cambia en cualquier forma;
- hace falta que `inventory` importe `purchasing`, o que un módulo del núcleo importe uno de capacidad;
- la exclusión de `used` obliga a cambiar la forma de un contrato del agente;
- hace falta tocar un contrato del agente, una dependencia o un archivo fuera del alcance;
- la migración necesita usar un valor de enum en su propio lote.

Pedir autorización explícita, en su turno, **antes de**:

- cualquier commit, push o despliegue;
- ejecutar la migración en producción;
- activar la capacidad en producción (lo corre el operador).

## Cierre

*Parcial, del 2026-10-19, antes del despliegue. Se completa con el despliegue, la activación y el recorrido (AC-12).*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `inventory/units.ts` (`changeProductTracking`); `tests/integration/units.test.ts`, «el seguimiento» |
| AC-2 | cumple | `purchasing/goods-receipts.ts`, `inventory/service.ts` (`receiveStock`, `removeReceivedStock`); `units.test.ts`, «la recepción de mercadería con IMEI» |
| AC-3 | cumple | `units.ts` (`registerUnit`, `writeOffUnit`); el IMEI en el historial; `units.test.ts` y `tests/e2e/units.spec.ts` |
| AC-4 | cumple | índice único parcial de la `0056`; dos altas concurrentes y, desde la revisión, dos recepciones concurrentes en `units.test.ts` |
| AC-5 | cumple | `unit_tracked` en el ajuste, el pedido, el pedido del agente, la confirmación y la venta; `units.test.ts`, `orders-agent.test.ts` y el e2e |
| AC-6 | parcial | `tests/integration/stock-invariant.ts` corre después de cada test de las suites de `inventory` y `purchasing`; la suma de movimientos se compara solo en `units.test.ts`, porque las demás arman los saldos con SQL directo (desviación 5) |
| AC-7 | cumple | `findActiveProductsRanked` con `excludeUsed` en las lecturas del agente; `units.test.ts`, «el agente no ve los usados» |
| AC-8 | cumple | `listProductUnits` sin costo para un `viewer`; `units.test.ts` y el e2e |
| AC-9 | cumple localmente | las suites existentes pasan; falta CI sobre el SHA desplegado |
| AC-10 | pendiente de CI | local: typecheck, lint, formato, unitarias y guardas (1797), e2e completo (261, con axe), integración (ver «Corridas») |
| AC-11 | cumple | revisión independiente del 2026-10-19, antes del despliegue (abajo) |
| AC-12 | pendiente | despliegue, activación en «iPhone Demo» y recorrido del usuario |

### Desviaciones

1. Una entidad de auditoría más, `unit_grade`, para los grados (registrada en la nota del ADR 0024).
2. La condición de un producto `unit` no cambia nunca (`unit_condition_locked`), más estricto que «mientras tenga unidades vigentes», porque `catalog` no lee `inventory`. Consecuencia: un producto `unit` con movimientos no corrige su condición aunque todas sus unidades estén dadas de baja.
3. La guarda de la copia de grados vive en `tests/guards/unit-writes.test.ts`, no en `capability-reads`.
4. Los IMEI del detalle de una recepción salen en orden alfabético; la auditoría conserva el orden escrito.
5. AC-6 / D-8: la suma de movimientos con signo se compara solo en `units.test.ts` (ver AC-6).
6. `activar-capacidad` copia los grados solo con `--profile`. Con `--capability serialized_units` lo avisa en la salida; el runbook exige `--profile iphone`.

### Revisión independiente

Del 2026-10-19, antes del despliegue, por un agente que no participó, de solo lectura: R1, 1 mayor, 7 menores y 9 notas, sin críticos. Cada hallazgo se verificó contra el código; las correcciones son autoevaluación y no tuvieron una segunda revisión.

- **M-1** (confirmado): las 8 Server Actions nuevas no estaban en `tests/guards/exposed-surface.test.ts`, que enumera con `git ls-files` y por eso pasaba en verde con los archivos sin seguimiento. Declaradas.
- **m-1** (confirmado): cuatro comentarios nombraban una guarda que no es la que fija la regla. Corregidos.
- **m-2** (confirmado): el cambio de seguimiento se veía en blanco en el historial del producto. Etiqueta «Se lleva», con test.
- **m-3** (confirmado): desviación 5.
- **m-4** (no alcanzable): el deadlock de dos recepciones con IMEI cruzados no ocurre: el índice es por organización, y dentro de una organización las dos toman el contador de la recepción antes de insertar unidades, así que la segunda choca en 23505. Se agregó el test que faltaba de ese camino.
- **m-5** (confirmado): DataModel decía «sin tablas todavía». Nota fechada.
- **m-6** (confirmado): desviación 6.
- **m-7** (confirmado): mover un grado auditaba solo el movido y con índices de la lista. Ahora audita cada grado que cambia de posición, con la posición guardada.
- **Notas sin cambio**: n-1, el trigger deja cambiar el costo de una unidad y lo impide solo el servicio; n-2, que la unidad de una línea de recepción sea de su producto lo asegura el servicio; n-4, un producto `used` llevado por cantidad entra en el pedido del agente si este conoce su id (el brief solo pide rechazar `unit`); n-7, el grado de un alta se lee sin bloqueo.

### Corridas e incidentes

- Tres corridas de integración no midieron nada: dos se solaparon sobre la misma base de test (deadlocks y claves foráneas entre procesos en el log de PostgreSQL), y PostgreSQL se reinició en recuperación con la máquina sin memoria. Es la quinta vez que una medición se arruina por compartir la base.
- Con la máquina saturada (una llamada de Zoom en curso), el e2e mostró caídas del navegador, timeouts de conexión y procesos que Windows no dejó crear. Liberada la memoria, el e2e de unidades pasó 6 de 6 y el completo 261 de 261.
- La integración completa dio 9 fallos: 3 de esta subfase (tests de esquema que no conocían las tablas nuevas, y uno que usaba `used` como condición inválida), corregidos; los otros, del entorno. `product-images` D-9 falla en esta máquina porque `bash` es el de WSL, que no hereda las variables de Windows; no cambió en la 29.5.
- El e2e encontró dos defectos del propio test: localizadores ambiguos y la búsqueda del producto por un prefijo del SKU, que solo se encuentra completo.