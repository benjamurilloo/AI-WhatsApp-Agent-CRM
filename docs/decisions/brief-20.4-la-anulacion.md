---
schema: task-brief.v1
task_id: "20.4"
task_type: implementation
generated_at: 2026-10-13
---

# Brief 20.4 — La anulación

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el servicio, la reposición de stock, la cadena de reemplazos, las guardas y los scripts de datos de un cliente, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-13).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-13, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: cuarta y última subfase de la Fase 20 — Ventas ([Roadmap](../planning/Roadmap.md) §Fase 20), después de la 20.3, cerrada el 2026-10-13. Implementa la fila «20.4» del punto 13 del [ADR 0021](0021-la-venta.md). **Al cerrarla se cierra la Fase 20** (D-14).
- **No abre ni cierra gate.** Suma el segundo comprobante de solo inserción, la segunda escritura de stock desde `sales` y una cadena de reemplazos que la base defiende con un trigger. Por eso se recomienda la revisión independiente (D-12).
- **Estado de este documento**: **aprobado por el usuario el 2026-10-13**, con todas las recomendaciones, de D-1 a D-14. La tarea 20.4 (`3f7702be6f4e817ea2c6d270d7a9f2b3`) sigue en «Esperando» en Notion hasta que se autorice pasarla a «En proceso».

## Objetivo

Que un `admin` pueda **anular una venta entera** con otro comprobante, la anulación `A-000045`, con un motivo de una lista cerrada. Si la venta no tenía pedido, la anulación **repone el stock** que descontó, con un movimiento `sale_void` por línea. Si tenía pedido, no toca el stock y **deja el pedido libre** para emitir otra venta, que queda encadenada a la anulada. La lista, el detalle y el comprobante muestran la anulación, y la anulación tiene su propio comprobante imprimible.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-13, sobre `main` (`315f990` más el cierre de la 20.3 sin commit).

**Ya está fijado** por el ADR 0021, puntos 3, 6, 7, 8, 9, 10, 12 y 13, con la precisión del punto 7 del 2026-10-13:
- la anulación es **otro comprobante**, `sale_voids`, de solo inserción, con su propia serie: `sale_void` en `document_kind`, prefijo `A`. Sin anulaciones parciales;
- una venta se anula **a lo sumo una vez**: `UNIQUE (sale_id)`; el choque se informa como `already_voided`, no como error;
- **montos positivos**, copiados de la venta (moneda y total), **sin líneas propias**; `src/shared/money/` no cambia;
- la de una **venta sin pedido** repone con un movimiento **`sale_void`** por línea, motivo `Anulación A-000045 de la venta V-000123`; **no se rechaza por un producto inactivo**; se rechaza con `stock_limit` si el saldo no cabe en `numeric(14, 3)`; lo reservado no cambia;
- la de una **venta de pedido no toca el stock** y **deja el pedido libre** para otra venta;
- la cadena de reemplazos: `replaces_sale_id` (solo con pedido, `CHECK`), un **índice único parcial** `(organization_id, order_id) WHERE replaces_sale_id IS NULL` en lugar del índice de hoy, `UNIQUE (replaces_sale_id)` y un **trigger de alta** que rechaza un reemplazo cuya venta reemplazada no esté anulada o sea de otro pedido (con `IS DISTINCT FROM`);
- el motivo es un **enum nuevo, `sale_void_reason`**, sin texto libre; la lista exacta la fija este brief (D-2);
- la auditoría: `entity_type` `sale`, **acción nueva `void`**, con el número de la anulación y el motivo **y nada más**, en la misma transacción;
- el orden de bloqueo: la anulación de una venta de pedido, la cabecera del pedido `FOR UPDATE` y el contador de `sale_void`; la de una venta sin pedido, los productos en modo compartido por `product_id`, sus saldos `FOR UPDATE` y el contador;
- la reposición es **una función nueva de `inventory`**, que recibe la transacción de `sales`; `stock-writes` se extiende a ella y a sus llamadores; el ajuste manual no acepta `sale_void`;
- una página imprimible de la anulación, con la venta que anula, el motivo y la leyenda «Documento no válido como factura»; la lista filtra por «anulada»; el detalle muestra su anulación;
- solo `admin` anula; un `viewer` ve, sin el contacto del cliente; el agente no anula ni lee; ningún contrato cambia;
- la exportación incluye las anulaciones de las ventas del cliente, y el runbook y `client-data-delete.ts` las cuentan.

**Lo que dejó abierto el ADR para este brief**: la lista exacta del motivo (D-2). El resto de las decisiones de abajo resuelven cómo se implementa lo fijado.

**Lo que hay en el código y se reutiliza**:
- `sales`: `issueSaleFromOrder` bloquea la cabecera con `lockOrderForSale`, busca la venta con `findSaleByOrder` (que hoy devuelve **cualquier** venta del pedido, con `limit 1`), bloquea cliente y productos y toma el contador al final. El rescate `isOrderAlreadySold` traduce un `23505` **por el nombre** de la restricción `sales_organization_order_unique`. `issueSale` usa `sellStock` con el motivo como función.
- `inventory`: `lockLines` (saldos ordenados por producto, fila en 0 si falta), `sellStock` y `applySale` son el molde exacto de la reposición. `computeBalanceAfter` ya devuelve `stock_limit` con `MAX_QUANTITY` de `src/shared/quantity`. **Convención de la 19.3**: un rechazo después de bloquear saldos se lanza.
- `numbering`: `document_kind` (`order`, `sale`) y `PREFIXES` (`P`, `V`); `numbering.test.ts` fija los formatos.
- La 0039 dejó la función `sales_reject_change()`, que la anulación reutiliza para su trigger de solo inserción.
- Las pantallas de la 20.2 y la 20.3: la lista con sus filtros en la URL, el detalle con `?confirmar=venta` y la confirmación de la emisión en el pedido, el comprobante con `print:hidden`.
- **El detalle del pedido** pide su venta con `getSaleForOrder` y muestra «Emitir venta» si no hay. Si `getSaleForOrder` pasa a devolver **la vigente**, la página no cambia: después de anular, el pedido vuelve a ofrecer la emisión.
- **Producción** corre `315f990`, con 41 migraciones (`0000` a `0040`). La de esta subfase es la `0041`. Tiene `V-000001` (del pedido `P-000005`), `V-000002` (sin pedido y sin cliente) y `V-000003` (sin pedido, con cliente).

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre DataModel, Overview, los ADR 0015, 0019 y 0021, FunctionalRequirements, Screens, SecurityModel, el runbook, las guardas y los tests que enumeran enums):
- **H-1. FR-VEN-02** dice «Un pedido tiene a lo sumo una venta: una segunda emisión se rechaza». Con la 20.4 es **una venta vigente**: anulada, se emite otra. Se precisa con fecha, sin borrar el texto. El ADR 0021, punto 3, ya lo dice.
- **H-2. Screens §18** dice «No mostrar: editar, borrar ni anular la venta (la anulación es de la 20.4)». Se precisa con fecha.
- **H-3. El runbook de datos de un cliente** anuncia «Si está anulada se suma con la 20.4». Se cumple.
- **H-4. `findSaleByOrder` con `limit 1`** devolvería, con dos ventas del mismo pedido, cualquiera de las dos. La emisión y `getSaleForOrder` pasan a leer **la vigente**: la última de la cadena, y si está anulada.
- **H-5. El rescate por nombre de restricción.** La tabla pasa a tener tres reglas únicas que puede tocar una emisión: el número, el índice parcial y `UNIQUE (replaces_sale_id)`. Las dos últimas significan `already_sold`, y el número no (vault: «Map a Unique Violation by Constraint Name Once a Table Has a Second Unique Rule»). El rescate se amplía por nombre.
- **H-6. Las claves foráneas después del contador** (R-7 de la 20.2). El `INSERT` de `sale_voids` toma `FOR KEY SHARE` sobre la venta y sobre el autor. **Ningún camino bloquea una venta `FOR UPDATE`**: `crm_app` no tiene `UPDATE` en `sales`, así que ni siquiera puede pedir `SELECT … FOR UPDATE` sobre ella. El autor sigue como en el alta del pedido y la venta. No hace falta un bloqueo nuevo antes del contador, y lo dice un comentario.
- **H-7. La venta no se puede bloquear.** Por lo mismo de H-6, dos anulaciones simultáneas de una venta **sin pedido** no se serializan en la venta, sino en los saldos de sus productos, y la comprobación «ya anulada» tiene que hacerse **después** de esos bloqueos (D-4).
- **H-8. Los tests que enumeran tablas de solo inserción** (`audit.test.ts`, `identity-schema.test.ts`) y los valores de enums (`catalog-inventory-schema.test.ts`, `numbering.test.ts`, `inventory/service.test.ts`, `orders-cycle.test.ts`) suman lo nuevo. **Ningún test usa `void`, `sale_void`, `anulacion` ni `anulada` como valor desconocido**: buscado con `grep` por la lección de la 20.3 (vault: «A Test That Uses a Value as Unknown Breaks When That Value Becomes Real»).
- **H-9. Los 13 end-to-end que vacían `sales`** (`truncate table sale_lines, sales, …`) fallarían con la clave de `sale_voids` hacia `sales`. Suman `sale_voids` al `TRUNCATE`, como la 20.2 sumó `sales`.
- **H-10. El vaciado no cambia.** La anulación no guarda texto de la persona y no apunta al cliente: el vaciado no la toca (ADR 0021, punto 12; ADR 0015).
- **No apareció ninguna contradicción** que obligue a cambiar el ADR 0021.

## Alcance incluido

1. **Esquema** (migración `0041`, generada con `drizzle-kit generate` y completada a mano):
   - `sale_void` en `document_kind` y en `inventory_movement_type`; `void` en `audit_action` (valores aditivos);
   - el enum `sale_void_reason` (D-2);
   - **`sale_voids`** (D-1): `id`, `organization_id`, `number`, `sale_id`, `currency`, `total`, `reason`, `created_by`, `created_at`; `UNIQUE (organization_id, number)`, `UNIQUE (sale_id)`, clave compuesta hacia `sales`, `CHECK` de número, total y moneda; `SELECT` e `INSERT` para `crm_app` y el trigger de solo inserción con `sales_reject_change()`; un trigger de alta que exige la moneda y el total de su venta (D-1);
   - **`sales.replaces_sale_id`**, nulable, con clave compuesta hacia `sales`, `UNIQUE (replaces_sale_id)` y `CHECK (replaces_sale_id IS NULL OR order_id IS NOT NULL)`; el índice único de hoy se reemplaza por el parcial `WHERE replaces_sale_id IS NULL`; el trigger de alta de la cadena (D-3).
2. **`numbering`**: el tipo `sale_void` con el prefijo `A`.
3. **`inventory`**:
   - `restoreSaleStock(tx, { organizationId, lines, reason, createdBy })` en el servicio y la interfaz: bloquea los saldos ordenados por producto, comprueba que cada saldo nuevo quepa y, si todos caben, pide el motivo y escribe un movimiento `sale_void` y el saldo nuevo de cada uno. Si alguno no cabe, no escribe y devuelve cuáles (D-5);
   - `applySaleVoid(tx, …)` en el repositorio, con el tipo fijo;
   - el ajuste manual sigue rechazando `sale_void`.
4. **`sales`**:
   - `voidSale(context, saleId, reason)` (solo `admin`), con los dos caminos de D-4 y las respuestas de D-6;
   - la emisión desde un pedido lee **la vigente** y, si la última está anulada, emite la nueva con `replaces_sale_id` (D-3);
   - las lecturas muestran la anulación: la lista (con el filtro y la búsqueda de D-8), el detalle, `getSaleForOrder` (la vigente), y una lectura de la anulación para su comprobante.
5. **Pantallas** (D-7 y D-8):
   - en el detalle de la venta, «Anular venta» para `admin`, con la confirmación y el motivo; la anulación, si la hay, y la venta que reemplaza o que la reemplazó;
   - el comprobante imprimible de la anulación, `/ventas/{id}/anulacion`;
   - en la lista, la marca «Anulada», el filtro por estado y la búsqueda por el número `A-…`;
   - «Anulación de venta» en el historial de movimientos de un producto, con su filtro;
   - la historia de la venta muestra la acción `void`.
6. **Guardas**:
   - `sale-writes`: `sale_voids` y su única escritura, `insertSaleVoid`;
   - `stock-writes`: `applySaleVoid` solo desde `restoreSaleStock`, y `restoreSaleStock` fuera de `inventory` solo desde `src/modules/sales/service.ts`, con sus casos de fallo versionados;
   - `exposed-surface`: la acción nueva.
7. **Datos de un cliente**: la exportación incluye si cada venta está anulada y sus anulaciones; el informe de `client-data-delete.ts` las cuenta.
8. **Deuda de la 20.3** (D-11), si se aprueba.
9. **Documentación**: DataModel (`sale_voids`, `sales`, `document_counters`, `inventory_movements.type`, `inventories`, `audit_logs`), Overview, FunctionalRequirements (FR-VEN nuevos y H-1), Screens (17, 18, la nueva 20 y H-2), TraceabilityMatrix, SecurityModel (recuentos), EngineeringStandards (guardas) y el runbook de datos de un cliente.

## Alcance excluido

- **Anulaciones parciales, notas de crédito o débito, devoluciones como operación propia** (ADR 0021, punto 6).
- **Reponer el stock al anular una venta de pedido**: si la mercadería vuelve, es un ajuste manual (punto 6).
- **Cambiar el estado del pedido** al anular su venta: el pedido sigue entregado.
- **Un motivo de texto libre** o un campo de observaciones.
- **La venta en la ficha del cliente y del producto**, las métricas de ventas y el dashboard.
- **Cobros, señas, medios de pago y caja** (Fase 21); el IVA, documento y CUIT/CUIL; la factura de ARCA.
- **El agente**: `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **R-4 y R-9 de la 20.3**, salvo lo que decida D-11.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0041_*.sql` y `drizzle/meta/*`
- `src/modules/sales/`, con sus tests unitarios
- `src/modules/inventory/`: `schema.ts` (el valor del enum), `repository.ts` (`applySaleVoid`), `service.ts` (`restoreSaleStock` y el comentario del ajuste), `index.ts` y `service.test.ts`
- `src/modules/numbering/`: `schema.ts` y `service.ts`, **solo** el tipo `sale_void` y su prefijo
- `src/modules/audit/schema.ts`, **solo** la acción `void`
- `src/app/(autenticado)/ventas/` (con `[saleId]/anulacion/`, nuevo); `src/app/(autenticado)/productos/[productId]/movimientos/page.tsx`, `filters.ts` y `filters.test.ts`, **solo** el tipo `sale_void`
- `src/app/(autenticado)/pedidos/nuevo/order-form.tsx`, **solo** el texto del buscador, si D-11
- `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`
- `tests/integration/`: `sales.test.ts`, `sales-schema.test.ts`, `client-data.test.ts` y `numbering.test.ts`; `catalog-inventory-schema.test.ts`, `orders-cycle.test.ts`, `audit.test.ts` e `identity-schema.test.ts`, **solo** los valores y la tabla nuevos
- `tests/guards/sale-writes.test.ts` y `stock-writes.test.ts`; `exposed-surface.test.ts`, **solo** la acción nueva
- `tests/e2e/sales.spec.ts`; los otros 12 end-to-end que vacían `sales` (`client-fields`, `client-tags`, `clients`, `conversations`, `dashboard-sin-ingestion`, `dashboard`, `ingestion`, `orders`, `product-fields`, `product-images`, `products` y `security-headers`), **solo** `sale_voids` en el `TRUNCATE` (H-9)
- `docs/architecture/DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`; `docs/development/EngineeringStandards.md`; `docs/runbooks/datos-de-un-cliente.md`
- al cerrar la subfase y la fase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

`orders`, `crm`, `catalog`, `ingestion`, `src/shared/`, `src/app/(autenticado)/pedidos/[orderId]/`, los seeds y los contratos del agente **no** se tocan.

## Fuentes de verdad

- **El código y las migraciones**: `sales` y las `0039` y `0040`; `inventory` (`lockLines`, `sellStock`, `applySale`, `computeBalanceAfter`); `numbering`; `sale-writes` y `stock-writes`.
- **Las decisiones**: el [ADR 0021](0021-la-venta.md), puntos 3, 6, 7 (con su precisión del 2026-10-13), 8, 9, 10, 12 y 13; el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 y 6; el [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md) (el vaciado); el [brief-20.2](brief-20.2-la-venta-de-un-pedido.md) y el [brief-20.3](brief-20.3-la-venta-sin-pedido.md), como molde.
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. La forma de `sale_voids`.** **Recomendada**: las columnas del ADR 0021, punto 7 (número, organización, venta, moneda, total, motivo, autor y fecha), sin cliente ni pedido propios: los lee de su venta. Y **un trigger de alta que exige que la moneda y el total sean los de la venta anulada**. El ADR fija que se copian; el trigger hace de la copia un invariante de la base, como la cadena de reemplazos, para que una anulación nunca diga otro monto que su venta. Cuesta una consulta por anulación.

**D-2. La lista del motivo.** **Recomendada**: las cuatro que propuso el ADR, con valores en inglés como el resto de los enums y el texto en las pantallas:
- `data_entry_error`: «Error de carga»;
- `not_completed`: «Operación no concretada»;
- `wrong_client`: «Cliente equivocado»;
- `other`: «Otro».

**No** se suma «devolución»: en una venta de pedido la anulación no repone, y el motivo diría lo contrario de lo que pasa con el stock. Un valor nuevo se agrega después con un `ALTER TYPE` aditivo.

**D-3. La cadena de reemplazos.** **Recomendada**:
- **la base**: `replaces_sale_id` con su `CHECK`, `UNIQUE (replaces_sale_id)`, el índice parcial `sales_organization_order_first_unique (organization_id, order_id) WHERE replaces_sale_id IS NULL` en lugar de `sales_organization_order_unique`, y el trigger `BEFORE INSERT` que rechaza con `P0001` un reemplazo cuya venta no exista en la organización, no esté anulada o sea de otro pedido;
- **el servicio**: con el pedido bloqueado, `issueSaleFromOrder` lee la **última** venta del pedido. Si no hay, emite la primera; si la última está vigente, responde `already_sold` como hoy; si está anulada, emite la nueva con `replaces_sale_id` apuntándole. La nueva **vuelve a copiar el pedido** (ADR 0021, punto 3: no cotiza);
- **el rescate**: un `23505` del índice parcial o de `UNIQUE (replaces_sale_id)` es `already_sold`, por el nombre de la restricción; el del número no se traduce (H-5).

**D-4. Los dos caminos de la anulación.** **Recomendado**. La venta se lee sin bloqueo: es inmutable, y su pedido no cambia (H-7).
- **Venta de un pedido**: bloquea la cabecera del pedido `FOR UPDATE` (`lockOrderForSale`, de la interfaz de `orders`, que ya existe). Con el pedido bloqueado, comprueba que no haya anulación, toma el contador, inserta la anulación y audita. Dos anulaciones de la misma venta, o una anulación y una nueva emisión del mismo pedido, se serializan en la cabecera.
- **Venta sin pedido**: comprueba antes que no esté anulada, para no bloquear saldos en vano. Después bloquea los productos en modo compartido por `product_id`, sin mirar si están activos, y llama a `restoreSaleStock` con las líneas de la venta. **El motivo es la función de la 20.3, que además vuelve a comprobar que no haya anulación**, ya con los saldos bloqueados: dos anulaciones simultáneas se serializan en los saldos, y la segunda lanza `already_voided` antes de escribir. Ahí toma el número.
- **En los dos**, `UNIQUE (sale_id)` es la defensa de la base: un `23505` de esa restricción se traduce a `already_voided`, por su nombre.

**D-5. La reposición en `inventory`.** **Recomendada**:
- `restoreSaleStock` devuelve `{ ok: true }` o `{ ok: false, lines }` con los productos cuyo saldo nuevo no cabría (`stock_limit`, con `computeBalanceAfter`). `sales` **lanza** el rechazo para revertir la transacción y lo traduce fuera;
- `applySaleVoid` en el repositorio: el movimiento `sale_void` y el saldo nuevo en la misma función, sin tocar lo reservado (sumar al saldo nunca deja lo reservado por encima);
- la cantidad de cada movimiento es la de la línea de la venta: **repone lo que esa venta vendió**, no lo que diga otro cálculo;
- `stock-writes`: `applySaleVoid` autorizada con `insert inventory_movements` y `update inventories`; solo desde `restoreSaleStock`; `restoreSaleStock` fuera de `inventory` solo desde `src/modules/sales/service.ts`.

**D-6. Las respuestas de `voidSale`.** **Recomendadas**:
- `FORBIDDEN` a un `viewer`;
- `VALIDATION_ERROR` por un id que no es uuid o un motivo fuera de la lista;
- `NOT_FOUND` si la venta no existe en la organización;
- `BUSINESS_RULE_VIOLATION` con `already_voided` (con el número de la anulación existente, para enlazarla) o `stock_limit` (con los productos);
- al anular, el id y el número de la anulación.

Ningún rechazo escribe, numera, mueve stock ni audita.

**D-7. La anulación en las pantallas.** **Recomendada**:
- en el detalle de la venta, «Anular venta» (solo `admin`, solo si no está anulada) abre una confirmación en la misma página (`?confirmar=anular`, como `?confirmar=venta` en el pedido), con el motivo como grupo de opciones obligatorio y un aviso que dice qué pasa con el stock: «Se repone el stock de cada línea» o «El stock no cambia: el pedido sigue entregado y se puede emitir otra venta»;
- al anular, vuelve al detalle con «Venta anulada» y un enlace al comprobante de la anulación;
- el detalle de una venta anulada lo dice arriba: «Anulada por A-000045 el {fecha}: {motivo}», y no ofrece anular. Si reemplaza a otra venta, «Reemplaza a V-…»; si otra la reemplazó, «Reemplazada por V-…»;
- **el comprobante de la anulación** en `/ventas/{id}/anulacion`: el nombre de la organización, «Anulación A-000045», la fecha, la venta que anula con su número y fecha, el cliente o «Consumidor final», el pedido si hay, las líneas y el total de la venta, el motivo y la leyenda «Documento no válido como factura». Una venta tiene a lo sumo una anulación, así que la ruta cuelga de la venta. El comprobante de una venta anulada se sigue imprimiendo, con la marca «Anulada»;
- el historial de movimientos de un producto muestra «Anulación de venta» (`?tipo=anulacion`).

**D-8. La lista.** **Recomendada**:
- una marca «Anulada» en la fila de cada venta anulada;
- un filtro por estado, «Todas», «Vigentes» y «Anuladas» (`?estado=vigente|anulada`), como pide el ADR 0021, punto 9;
- la búsqueda por número acepta también `A-000045` y encuentra la venta que esa anulación anula: el número de un papel tiene que llevar a su comprobante.

**D-9. Qué guarda la auditoría.** **Recomendada**: sobre la venta, `entity_type` `sale`, acción `void`, `diff` `{ before: null, after: { void_number, reason } }`, y nada más (ADR 0021, punto 6). La historia de la venta la muestra como «Anulación A-000045: {motivo}». Los movimientos de la reposición llevan su autor y su fecha, sin auditoría aparte, como la venta sin pedido. La venta que reemplaza a otra se audita con el `diff` de la 20.2 más `replaces_sale_id`.

**D-10. Los datos de un cliente.** **Recomendada**: la exportación suma a cada venta del cliente `voided` y el número de su anulación, y una lista `sale_voids` con el número, la fecha, la venta, la moneda, el total y el motivo de cada anulación de sus ventas. El informe de `client-data-delete.ts` cuenta las anulaciones y dice que quedan, como las ventas. El vaciado no cambia (H-10).

**D-11. La deuda de la 20.3.**
- **El texto del buscador del pedido**, que dice «Nombre o SKU» y desde D-5 de la 20.3 también encuentra por código de barras. **Recomendado: corregirlo**, una línea de `order-form.tsx`.
- **AC-5 en parte de la 20.3**: no hay test del estado de stock ni de la lectura v2 después de un movimiento `sale`. **Recomendado: sumarlo ahora**, junto con el de `sale_void`, en `sales.test.ts`, leyendo por la interfaz de `inventory` lo que leen las pantallas y la v2. La reposición cambia esos números, y es el momento de fijarlo.
- **R-4** (`stock-writes` fija el archivo que llama, no la función) y **R-9** (la lectura del formulario duplicada entre `ventas/actions.ts` y `pedidos/actions.ts`): **recomendado dejarlos declarados**. R-4 cambiaría la regla de una guarda que funciona, y R-9 exige tocar `pedidos/actions.ts`.

**D-12. La revisión independiente.** **Recomendada**: un agente de solo lectura, contra este brief, el ADR 0021 y las reglas vigentes, antes del commit. Suma un trigger que lee otra tabla, una segunda escritura de stock desde `sales` y cierra la fase.

**D-13. El despliegue a producción y el recorrido.** **Recomendado**: sí, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0041`, autorizado aparte en su turno. **Volver a `315f990` después de anular no sería limpio**: ese código no conoce las anulaciones y mostraría una venta anulada como vigente, y con dos ventas del mismo pedido su `findSaleByOrder` leería cualquiera. No falla, pero muestra mal; se resuelve volviendo a desplegar la 20.4. Para el recorrido, en Demostración Vixora:
- anular `V-000003` (sin pedido, con cliente): el stock de su producto sube con «Anulación A-000001 de la venta V-000003»;
- anular `V-000001` (del pedido `P-000005`): el stock no cambia, el pedido vuelve a ofrecer «Emitir venta», y la nueva venta (`V-000004`) dice que reemplaza a `V-000001`;
- imprimir el comprobante de una anulación y filtrar la lista por «Anuladas».

**D-14. El cierre de la Fase 20.** **Recomendado**: al cerrar la 20.4, con la aprobación del usuario, también se cierra la fase: el Roadmap §Fase 20, el CHANGELOG con una entrada de la fase, el HANDOFF con el estado sin fase de ERP abierta y las candidatas (la Fase 14, la Fase 21, la ruta de la imagen para el agente, la guarda de dependencias entre módulos y la lectura de pedidos que pidió el agente), y en Notion la 20.4, el proyecto de la Fase 20 y su tarea espejo en «Completado», cada cosa con su autorización.

## Invariantes

- Una venta, sus líneas y su anulación nunca cambian ni se borran; la base lo impide para cualquier rol.
- Una venta se anula a lo sumo una vez, entera, con montos iguales a los suyos y positivos.
- Un pedido tiene a lo sumo una venta vigente, y sus ventas forman una sola cadena en la que cada eslabón reemplaza al anterior anulado.
- La anulación de una venta sin pedido repone exactamente lo que esa venta descontó, con un movimiento `sale_void` por línea, en la misma transacción; nunca toca lo reservado. La de una venta de pedido no mueve el stock.
- Ninguna anulación rechazada escribe, numera, mueve stock ni audita.
- Las series `V` y `A` siguen sin huecos ni repetidos, cada una por organización.
- El ajuste manual no escribe `sale_void`; solo `restoreSaleStock` lo escribe, y solo `sales` la llama.
- `orders` no depende de `sales`; ningún módulo depende de `sales`; `inventory` no conoce las ventas.
- Ninguna anulación guarda texto de la persona; el vaciado no las toca.
- `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0041` suma los valores de enum, `sale_void_reason`, `sale_voids` y `replaces_sale_id`, y cambia el índice. Con el rol dueño, en `sales-schema.test.ts`: `crm_app` tiene `SELECT` e `INSERT` en `sale_voids`; el trigger rechaza `UPDATE` y `DELETE` con `P0001`; una segunda anulación de la misma venta viola `UNIQUE (sale_id)`; una anulación con otro total o moneda la rechaza el trigger; la clave compuesta rechaza otra organización; un reemplazo de una venta vigente, de otro pedido o sin pedido se rechaza; dos primeras ventas del mismo pedido chocan con el índice parcial, y dos reemplazos de la misma venta, con `UNIQUE (replaces_sale_id)`.
- **AC-2 (anular una venta sin pedido)**: `voidSale` inserta la anulación con la moneda y el total de la venta, un movimiento `sale_void` por línea con la cantidad de la línea, `balance_after` y el motivo `Anulación A-… de la venta V-…`, lo reservado igual, y la auditoría de D-9. Repone también un producto inactivo. Con un saldo que no cabría, responde `stock_limit` sin escribir nada.
- **AC-3 (anular una venta de pedido y volver a emitir)**: `voidSale` inserta la anulación sin mover el stock ni cambiar el pedido; `getSaleForOrder` devuelve nada; `issueSaleFromOrder` emite otra venta con `replaces_sale_id`, copiando de nuevo el pedido, y una tercera emisión responde `already_sold` con la nueva.
- **AC-4 (rechazos)**: cada respuesta de D-6, sin escribir, numerar, mover stock ni auditar; un `viewer` recibe `FORBIDDEN`.
- **AC-5 (concurrencia)**: dos anulaciones simultáneas de la misma venta sin pedido terminan en una anulada y un `already_voided`, con el stock repuesto una sola vez; lo mismo para una venta de pedido, serializadas en la cabecera; una anulación y una nueva emisión del mismo pedido se serializan; el rescate de `23505` de `sale_voids_sale_unique` responde `already_voided`. Cada escenario lleva su mutación.
- **AC-6 (lecturas)**: la lista marca las anuladas, filtra por estado y encuentra una venta por el número de su anulación; el detalle muestra la anulación y la cadena; un `viewer` ve la anulación y el motivo, sin el contacto del cliente. Si D-11: el estado de stock y lo disponible de la v2 reflejan una venta y su anulación.
- **AC-7 (pantallas)**: un end-to-end sobre `next start`: `admin` anula una venta sin pedido con teclado, eligiendo el motivo, ve «Anulada», imprime el comprobante de la anulación y la encuentra con el filtro; anula la venta de un pedido y vuelve a emitirla desde el pedido; el historial del producto muestra «Anulación de venta»; un `viewer` no ve «Anular venta». axe sin violaciones en claro y en oscuro.
- **AC-8 (datos de un cliente)**: la exportación incluye la anulación de una venta del cliente; el informe la cuenta; el vaciado deja la anulación intacta.
- **AC-9 (guardas)**: `sale-writes` y `stock-writes` pasan con el código y fallan con cada uno de sus casos nuevos; `exposed-surface` declara la acción nueva.
- **AC-10 (fronteras)**: `orders`, `inventory` y `crm` no importan `sales`; `orders`, `crm`, `catalog` e `ingestion` no están en el diff.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-12**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-13**: la documentación del punto 9 queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-14** (si D-13): producción corre el SHA del cierre con la `0041`; en Demostración Vixora, el recorrido de D-13, conciliado contra la base: las anulaciones, sus totales iguales a los de sus ventas, los movimientos `sale_void` con saldos que cuadran, la venta nueva con su `replaces_sale_id`, los contadores y la auditoría.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-6 y AC-8 a AC-11, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-7 (UI ↔ servicio ↔ base) y AC-11.
- `isolated-runtime`: AC-14, si se despliega.
- Las mutaciones de AC-5 y de las guardas, cada una corrida y revertida, con su resultado en §Resultados. Como mínimo: sin la segunda comprobación con los saldos bloqueados; sin el rescate de `sale_voids_sale_unique`; la emisión que lee cualquier venta del pedido en lugar de la última; el trigger de la cadena sin la comprobación de «anulada».
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada, en especial `orders`, `crm`, `catalog`, `ingestion`, `src/shared/` o el detalle del pedido;
- el diseño exigiría cambiar el texto del ADR 0021 o de los ADR 0015 y 0019;
- `inventory` tendría que conocer las ventas, `orders` leer `sales`, o un módulo existente depender de `sales`;
- una anulación pudiera cambiar lo reservado, mover el saldo sin su movimiento, reponer una venta de pedido o reponer otra cantidad que la vendida;
- una venta pudiera quedar con dos anulaciones o un pedido con dos ventas vigentes;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- aparece una vía por la que un `viewer` anula, o un dato personal entra al `diff`, al motivo del movimiento o a la anulación;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, y desplegar. Cada una necesita autorización explícita en su turno.

## Resultados — 2026-10-13 (autoevaluación)

Implementado el 2026-10-13. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-12 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

- **El `diff` de la auditoría de la anulación no puede llevar `before: null`** (desvío de D-9). `recordAudit` reserva `before` nulo para `create`, y fuera de `create` exige las mismas claves en los dos lados (`audit/service.ts`). Lleva `{ before: { void_number: null, reason: null }, after: { void_number, reason } }`, como `note_added` y `tag_change`: sigue siendo el número y el motivo y nada más. Lo registra DataModel.
- **`voidSale` devuelve también el pedido de la venta** (`orderId`), para que la acción revalide el detalle del pedido, que vuelve a ofrecer la emisión. No es un dato nuevo: es el `order_id` de la venta.
- **La búsqueda de la última venta de un pedido perdía su índice**: la `0041` reemplaza el índice único completo por el parcial, que no cubre las filas con `replaces_sale_id`. Se suma `sales_order_idx (organization_id, order_id)`, no único (R-6, abajo).
- **La segunda comprobación con los bloqueos tomados no se podía ver por el resultado**: sin ella, la anulación repetida choca con `sale_voids_sale_unique`, el rescate la traduce a `already_voided` y el estado final es idéntico. Lo que cambia es que toma el contador antes de chocar. Dos casos nuevos retienen el contador desde una tercera conexión y comprueban que la anulación responde sin esperarlo (R-2).
- **Un caso end-to-end largo se partió en dos**: con siete análisis de axe en claro y en oscuro quedaba al borde del límite de 30 s por caso y se cortó dos veces por tiempo, sin aserción en rojo.
- **Un test de índices ordenaba por `indexname` con la collation de la base**, que no ordena el guion bajo como el código: pasa a `collate "C"`.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `sales-schema.test.ts`: los valores de enum y la lista del motivo; `sale_voids` con privilegios, trigger de solo inserción, `UNIQUE (sale_id)`, número único y positivo, la copia de la venta (`P0001`), la clave compuesta y el motivo fuera de la lista (`22P02`); la cadena: un reemplazo de una venta vigente, de otro pedido, sin pedido o de otra organización (`P0001`), `sales_replaces_sale_unique`, el índice parcial y el `CHECK` con el trigger apagado; los índices, con `sales_order_idx` |
| AC-2 | cumplido | `sales.test.ts`: la reposición con un movimiento `sale_void` por línea, el motivo, `balance_after`, lo reservado igual, la moneda y el total copiados y la auditoría; un producto desactivado; `stock_limit` sin escribir ni numerar |
| AC-3 | cumplido | `sales.test.ts`: la anulación de una venta de pedido sin stock ni cambio del pedido, `getSaleForOrder` sin venta, la nueva emisión con `replaces_sale_id` que vuelve a copiar el pedido, la cadena en los dos detalles, la auditoría del reemplazo y la tercera emisión `already_sold` |
| AC-4 | cumplido | `sales.test.ts`: `viewer`, id, motivo, otra organización y una venta ya anulada, sin escribir ni numerar |
| AC-5 | cumplido | `sales.test.ts`: dos anulaciones de una venta sin pedido serializadas en los saldos; dos de una venta de pedido en la cabecera, con la regla y sin movimientos; anulación y nueva emisión del mismo pedido; el rescate de `sale_voids_sale_unique`; y la segunda comprobación en los dos caminos, con el contador retenido. Con sus mutaciones (abajo) |
| AC-6 | cumplido | `sales.test.ts`: la lista marcada, el filtro por estado, la búsqueda por `A-000001` y por número de venta, el detalle y la historia para los dos roles; y, por D-11, el estado de stock, lo disponible de la v2 y el saldo de la v2 después de una venta y de su anulación |
| AC-7 | cumplido | `sales.spec.ts`, cuatro casos sobre `next start`: la anulación con teclado, el comprobante impreso y el historial; la lista filtrada, la búsqueda por la anulación y la fila del historial (tipo, signo y saldo) de una anulación hecha en la pantalla; la venta de pedido anulada y vuelta a emitir; el `viewer`. axe en claro y en oscuro |
| AC-8 | cumplido | `client-data.test.ts`, casos 41 a 43, y el runbook |
| AC-9 | cumplido | `sale-writes` con cuatro casos de fallo nuevos y `stock-writes` con siete, con sus mutaciones; `exposed-surface` con `voidSaleAction` |
| AC-10 | cumplido | nadie fuera de `sales` importa `@/modules/sales`; `orders`, `crm`, `catalog`, `ingestion` y `src/shared/` no están en el diff |
| AC-11 | cumplido en local | `read-api`, `read-api-v2` e `ingestion-v2` en la batería; `docs/contracts/` no está en el diff |
| AC-12 | cumplido en local | la batería completa en verde (abajo); el CI, al empujar |
| AC-13 | cumplido | DataModel, Overview, FunctionalRequirements (FR-VEN-02 precisado, FR-VEN-09 y 10), Screens (5, 17, 18 y la 20 nueva), TraceabilityMatrix, SecurityModel (95 puntos de entrada), EngineeringStandards y el runbook |
| AC-14 | pendiente | el despliegue, si se autoriza (D-13) |

**Mutaciones**, cada una agregada al código real, corrida y revertida (`sales.test.ts` filtrado por la 20.4, salvo las de la base y las guardas):
- M1, sin la segunda comprobación en una venta sin pedido: falla «anulada mientras esperaba los saldos… sin esperar el contador». Antes de R-2 no fallaba ningún caso;
- M9, sin la segunda comprobación en una venta de pedido: falla su caso equivalente con la cabecera;
- M2, sin el rescate de `sale_voids_sale_unique`: falla el caso del rescate;
- M3 y M4, sin la comprobación ni el rescate, en cada camino: fallan además las dos anulaciones simultáneas;
- M5, la emisión lee cualquier venta del pedido y no la última: falla la nueva emisión;
- M6, el trigger de la cadena sin la comprobación de «anulada»: falla «una venta vigente no se reemplaza»;
- M7, el trigger de la anulación sin la copia del total: falla su caso;
- M8, la venta de pedido por el camino que repone: fallan cuatro casos de la venta de pedido, y un quinto, puro, en cascada, porque el `beforeEach` no puede vaciar la base con transacciones que quedaron abiertas;
- en las guardas: `restoreSaleStock` desde `orders/service.ts` y `applySaleVoid` desde una función nueva de `inventory` (1 caso cada una en `stock-writes`); un `update` de `sale_voids` en el repositorio (2 casos en `sale-writes`);
- R-1, el signo viejo del historial: falla el end-to-end de la lista y el historial («+ 3»).

**Batería local**: formato, lint, typecheck y build en verde; 724 unitarios (70 archivos), 608 de guardas (20), 1087 de integración (61) contra PostgreSQL real de desarrollo y 174 end-to-end sobre `next start` (15,7 min). Corrida desde Git Bash el 2026-10-13, después de las correcciones de la revisión independiente.

## Revisión independiente — 2026-10-13

Un agente que no participó del trabajo, de solo lectura, contra este brief, el ADR 0021 y las reglas vigentes. Informó 9 hallazgos: uno alto, dos medios y seis bajos, ninguno bloqueante. Cada uno se verificó contra el código antes de aceptarlo.

- **R-1 (alto)**: el historial de movimientos mostraba la reposición con «−», porque el signo solo era «+» para el ajuste positivo, y ningún test miraba la fila. **Corregido**: el signo sale del tipo (`adjustment_positive` y `sale_void` suman), y el end-to-end comprueba el tipo, el signo y el saldo de la fila; la mutación con el signo viejo lo hace fallar.
- **R-2 (medio)**: las mutaciones de la segunda comprobación no las detectaba ningún test, en ninguno de los dos caminos, y el caso de la venta de pedido no miraba la regla ni el stock. **Corregido**: dos casos con el contador retenido y las aserciones que faltaban (arriba).
- **R-3 (medio)**: el historial y el filtro del end-to-end salían de una anulación y un movimiento insertados por SQL, una forma asumida. **Corregido**: la anulación se hace en la pantalla; solo la venta es un fixture.
- **R-4 (bajo)**: los desvíos de D-9 (el `before` del `diff`) y el `orderId` del resultado no estaban en el brief. **Registrados** arriba; el usuario aprobó los dos desvíos el 2026-10-13.
- **R-5 (bajo)**: el número de la anulación de la subconsulta llegaba como texto con el tipo `number`. **Corregido** con `mapWith(Number)`.
- **R-6 (bajo, por inferencia)**: la búsqueda de la última venta de un pedido perdió su índice. **Corregido** con `sales_order_idx`, en la `0041` regenerada; la diferencia con la anterior es solo esa línea.
- **R-7 (bajo)**: el rechazo `already_voided` no enlazaba la anulación existente, contra D-6. **Corregido**: «Ver la anulación A-…».
- **R-8 (bajo)**: un comentario de `schema.ts` quedó sobre la columna equivocada. **Corregido**.
- **R-9 (bajo, por inferencia)**: la anulación no revalidaba `/productos`, y la reposición cambia el stock. **Corregido**: revalida el pedido en una venta de pedido y los productos en una venta sin pedido.

La revisión confirmó además el orden de bloqueo contra el ADR 0021, punto 7, la serialización en los dos caminos, los rescates por nombre de restricción, que la cadena es lineal y `findLastSaleByOrder` devuelve una sola fila, la reposición, que ningún rechazo escribe, que un `viewer` no anula, que no entran datos personales, los recuentos de SecurityModel y de las guardas, y la confirmación sin JavaScript.
