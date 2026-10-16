---
schema: task-brief.v1
task_id: "22.3"
task_type: implementation
generated_at: 2026-10-15
---

# Brief 22.3 — La orden de compra

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el trigger de estados, el servicio, la serialización, las guardas y la frontera del módulo, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-14).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-14, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: tercera subfase de la Fase 22 — Compras y proveedores ([Roadmap](../planning/Roadmap.md) §Fase 22), después de la 22.2, cerrada el 2026-10-15. Implementa la fila «22.3» del punto 15 del [ADR 0023](0023-compras-y-proveedores.md), y suma el mensaje del CUIT que el usuario mandó a esta subfase el 2026-10-15.
- **No abre ni cierra gate.** Es el primer comprobante numerado de `purchasing`, con montos, estados y la primera dependencia del módulo hacia `catalog`, `numbering` y `auth`. No toca el stock ni el costo. Se recomienda la revisión independiente (D-13).
- **Estado de este documento**: **aprobado** por el usuario el 2026-10-15, con las recomendaciones de D-1 a D-14, incluida D-3 (el cierre a mano pasa a la 22.4). **Cerrado** el 2026-10-16 (§Cierre). La tarea 22.3 es `3fa702be6f4e81c68ed6d92b6102c2a8` en Notion.

## Objetivo

Que un `admin` pueda **pedirle mercadería a un proveedor** con una orden de compra:

- crear una orden para un proveedor activo, con sus líneas (producto, cantidad y costo unitario esperado) y su moneda;
- verla, imprimirla para mandársela al proveedor y cancelarla;
- ver la lista de órdenes, filtrarla y buscar por número, y ver las órdenes de cada proveedor en su ficha.

La orden no toca el stock ni el costo: los mueve la recepción, en la 22.4. Un `viewer` no ve nada de esto, y el agente tampoco.

Además, **el mensaje del CUIT** distingue el dígito verificador equivocado de la cantidad de dígitos (decisión del usuario del 2026-10-15; D-12).

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-15, sobre `main` (`5ac5a7a`, el cierre de la 22.2; CI 38816527357 `success`, leída por el SHA completo). DataModel, el Overview y FunctionalRequirements se releyeron con `grep` (`purchase_order`, `purchasing`, `22.3`) para este brief.

**Ya está fijado** por el ADR 0023, puntos 3, 10, 11, 12, 13, 14 y 15:

- **la orden es un compromiso con estado**, como el pedido, no un comprobante emitido. Es opcional: una recepción puede ir sin orden (22.4);
- **se crea con un proveedor activo y sus líneas**: el producto, la cantidad y el costo unitario esperado, con el IVA incluido. Un producto va en una sola línea, y la cantidad es positiva y cabe en `numeric(14, 3)`. **El total de cada línea, redondeado, no es cero ni desborda `numeric(14, 2)`** (`zero_total` y `amount_too_large`, punto 4);
- **la moneda la elige la persona** al crearla, de la lista de monedas del sistema, y todas las líneas van en ella. El total es la suma de las líneas redondeadas una por una;
- **los estados**: `open` → `closed` (sola con la recepción que completa todo, o a mano, «cerrada con faltante», solo con alguna recepción vigente) y `open` → `cancelled` (solo sin recepciones vigentes). Los finales no cambian. Un trigger fija las columnas que cambian y las transiciones, como `orders_guard`;
- **lo recibido se deriva** de las recepciones vigentes y no se guarda;
- **las líneas son de solo inserción y la orden no se edita**: si cambia lo pedido, se cancela y se hace otra;
- **los privilegios**: `purchase_orders` con `SELECT`, `INSERT` y `UPDATE`, sin `DELETE`; `purchase_order_lines` con `SELECT` e `INSERT` y el trigger de solo inserción;
- **no reserva ni toca el stock, y no tiene pagos**;
- **la auditoría**, con el `entity_type` nuevo `purchase_order`: `create` al crearla y `status_change` al cerrarla o cancelarla;
- **la serialización** (punto 10): el alta bloquea el proveedor y los productos en modo compartido, comprueba y toma el contador al final; la cancelación y el cierre bloquean la cabecera `FOR UPDATE`;
- **el número**: el tipo `purchase_order` de `document_kind`, con el prefijo `OC`;
- **`purchasing` depende de** `catalog`, `numbering`, `organizations`, `audit` y `auth` (este solo en `schema.ts`). `inventory` llega en la 22.4. **Ningún módulo depende de `purchasing`**;
- **solo `admin`** ve y opera las órdenes: sus montos muestran el costo (punto 12);
- **la página imprimible**, con la leyenda «Documento no válido como factura»;
- **la orden no copia datos del proveedor**: lo nombra por su clave (punto 14).

**Hallazgos de esta verificación**:

- **H-1. Las reglas de línea compartidas evalúan precios, no costos.**
  - `evaluateLines` de `src/shared/lines/` toma el precio vigente de cada producto, rechaza `no_price` y `price_changed`, y saca la moneda de la primera línea. La orden de compra no tiene nada de eso: el costo lo escribe la persona y la moneda la elige ella.
  - Sí sirven tal cual `duplicateLines`, `computeLineTotal` (con `zero_total` y `amount_too_large`) y `sumLineTotals`, y `parseQuantityInput` y `parseMoneyInput` para leer la entrada.
  - Decide D-4.
- **H-2. En la 22.3 no puede haber recepciones, y dos reglas de estado dependen de ellas.**
  - El cierre a mano exige «alguna recepción vigente», y la recepción llega en la 22.4. **Construido en la 22.3, siempre rechazaría**: el botón no se podría usar y la regla solo se probaría por su rechazo.
  - La cancelación exige «sin recepciones vigentes», que en la 22.3 siempre se cumple. La comprobación tiene que sumarla la 22.4, con la cabecera bloqueada.
  - **Es una diferencia con el punto 15 del ADR**, que pone el cierre a mano en la 22.3. No se resuelve en silencio: decide el usuario en D-3.
- **H-3. `catalog` ya tiene el bloqueo de productos que la orden necesita.** `lockProductsForOrder` bloquea en modo compartido, ordenado por id, y devuelve si cada producto está activo. También trae el precio, que la orden no mira. Reusarlo deja a `catalog` sin cambios. Decide D-6.
- **H-4. `purchasing` no tiene un bloqueo compartido del proveedor.**
  - La 22.2 solo lee con `FOR UPDATE`, para editar.
  - **La clave foránea no basta**: la verificación del `INSERT` toma `FOR KEY SHARE`, espera a una desactivación que retiene `FOR UPDATE` y después sigue sin mirar si el proveedor quedó inactivo. Es la lección de la 16.1 con las etiquetas (nota «Prove a Row Lock…» del vault).
  - Hace falta leerlo `FOR SHARE` (D-7).
- **H-5. `numbering` cambia.** El tipo `purchase_order` va en el enum de `numbering/schema.ts`, y el prefijo `OC` en `PREFIXES` de `numbering/service.ts`. `numbering.test.ts` fija los prefijos.
- **H-6. Tres tests fijan listas que crecen con esta subfase.**
  - `identity-schema.test.ts` (la lista de tablas);
  - `audit.test.ts` (las tablas de solo inserción y las que no se borran);
  - `numbering.test.ts` (los prefijos).

  En la 22.2 los dos primeros fueron un desvío. **Esta vez van en la lista autorizada desde el principio**, como dejó anotado el HANDOFF.
- **H-7. La migración es la `0048`.** Suma valores a `document_kind` y a `audit_entity_type`. El migrador aplica todas las pendientes en una transacción, y **un valor nuevo de un enum no se puede usar en ella** (H-2 de la 21.4). Ningún `CHECK` ni trigger de la `0048` usa esos valores. El tipo nuevo `purchase_order_status` sí se puede usar: se crea, no se altera.
- **H-8. El buscador de productos ya se comparte**: `pedidos/nuevo/picker.tsx` lo usa también la venta (`ventas/nueva/sale-form.tsx`). La orden lo importa igual, sin moverlo.
- **H-9. La página imprimible tiene molde**: el detalle de la venta, con `print:hidden` y la leyenda. Cada sección declara su `NOT_AN_INVOICE_LEGEND` en su `messages.ts`, y Compras hace lo mismo.
- **H-10. El autor de la orden** es un usuario (`created_by` → `users`), como el pedido de la app. `purchasing/schema.ts` importa el esquema de `auth`, lo único de `auth` que el ADR le permite.

## Alcance incluido

1. **Esquema** (migración `0048`, generada con `drizzle-kit generate` y completada a mano):
   - los valores `purchase_order` en `document_kind` y en `audit_entity_type` (aditivos);
   - el tipo `purchase_order_status` (`open`, `closed`, `cancelled`);
   - **`purchase_orders`** y **`purchase_order_lines`** (D-1), con sus privilegios y sus triggers (D-2).
2. **`numbering`**: el tipo `purchase_order` y el prefijo `OC`.
3. **`purchasing`**:
   - el esquema y el repositorio de la orden y sus líneas;
   - el bloqueo compartido del proveedor (D-7);
   - la lectura y la evaluación de las líneas (D-4), la moneda (D-5) y los productos (D-6);
   - crear, cancelar, listar, ver una orden y su historia, y las órdenes de un proveedor (D-8 a D-11);
   - **el mensaje del CUIT** (D-12).
4. **Pantallas** (D-10): la navegación interna de Compras, la lista de órdenes, el alta, el detalle imprimible con la cancelación, y las órdenes en la ficha del proveedor.
5. **Guardas**:
   - `exposed-surface`: las acciones nuevas;
   - `organization-isolation`: las escrituras y las lecturas por id de la orden.
6. **Documentación**:
   - DataModel: `purchase_orders` y `purchase_order_lines`, las reglas 8 y 10, `document_counters`, `audit_logs` y la nota de §«Explícitamente fuera»;
   - Overview: la fila de `purchasing`, con sus dependencias nuevas;
   - FunctionalRequirements: `FR-COMP-05` en adelante;
   - Screens, TraceabilityMatrix y SecurityModel, con sus recuentos;
   - y, si D-3 se aprueba como está, la nota fechada del ADR 0023 (punto 15) y el Roadmap.

## Alcance excluido

- **La recepción, el cierre automático, el cierre a mano** (si D-3 se aprueba como está), la comprobación de recepciones al cancelar, **el stock y el costo** (22.4).
- La anulación de la recepción (22.5), los pagos y la cuenta del proveedor (22.6).
- **Editar una orden o sus líneas** (punto 3): se cancela y se hace otra.
- **Mandar la orden por email o por WhatsApp**: se imprime o se guarda como PDF desde el navegador.
- **Proponer el costo** a partir del costo vigente o de la última compra (D-6), y la sugerencia de compra por stock mínimo (punto 1).
- **Que la desactivación de un proveedor haga algo con sus órdenes abiertas** (D-7).
- **Que un `viewer` o el agente vean algo**: `read-v1`, `read-v2` e `ingestion-v2` no cambian.
- **La guarda de dependencias entre módulos** (brief-19.4, R-2), que sigue como tarea aparte.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0048_*.sql` y `drizzle/meta/*`
- `src/modules/purchasing/`, con sus tests unitarios
- `src/modules/numbering/schema.ts` y `service.ts`, **solo** el tipo `purchase_order` y su prefijo
- `src/modules/audit/schema.ts`, **solo** `purchase_order`
- `src/app/(autenticado)/compras/` (lo existente y lo nuevo)
- `tests/integration/`:
  - `purchase-orders.test.ts` y `purchase-orders-schema.test.ts` (nuevos);
  - `suppliers.test.ts`, **solo** el mensaje del CUIT (D-12);
  - `identity-schema.test.ts` y `audit.test.ts`, **solo** las dos tablas nuevas y el valor nuevo (H-6);
  - `numbering.test.ts`, **solo** el prefijo `OC`;
  - `organization-isolation.test.ts`, **solo** lo de la orden
- `tests/guards/exposed-surface.test.ts`, **solo** las acciones nuevas
- `tests/e2e/purchase-orders.spec.ts` (nuevo), y `tests/e2e/suppliers.spec.ts` **solo** si el mensaje del CUIT lo pide
- en `docs/architecture/`: `DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`
- `docs/product/FunctionalRequirements.md` y `Screens.md`
- si D-3 se aprueba como está: `docs/decisions/0023-compras-y-proveedores.md`, **solo** la nota fechada del punto 15
- al cerrar la subfase: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

**No se tocan**:

- los módulos `catalog` (D-6), `inventory`, `cash`, `sales`, `orders`, `crm`, `knowledge`, `conversations` e `ingestion`;
- `src/shared/` (D-4), incluido `pedidos/nuevo/picker.tsx`, que se importa sin moverlo (H-8);
- `eslint.config.mjs` y `module-boundary`: `purchasing` ya es un módulo de dominio desde la 22.2;
- `scripts/`, los seeds y los contratos del agente.

## Fuentes de verdad

- **El código y las migraciones**:
  - la `0036` (`orders`, `order_lines`, `orders_guard`, `order_lines_insert_only` y `document_counters`), como molde;
  - `orders/service.ts` (`createOrder`, `writeOrder` y las transiciones) y `catalog` (`lockProductsForOrder`);
  - `src/shared/lines/`, `src/shared/money` y `src/shared/quantity`;
  - `numbering` (`nextDocumentNumber`, `formatDocumentNumber`);
  - `purchasing` de la 22.2;
  - el detalle imprimible de la venta (`ventas/[saleId]/page.tsx`).
- **Las decisiones**:
  - el [ADR 0023](0023-compras-y-proveedores.md), puntos 3, 10 a 15;
  - el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 a 4;
  - el [ADR 0020](0020-el-pedido.md), puntos 3 y 6, como molde del compromiso con estado;
  - el [ADR 0021](0021-la-venta.md), punto 7, con su precisión del 2026-10-13;
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md);
  - el [brief-19.2](brief-19.2-el-pedido.md) y el [brief-22.2](brief-22.2-los-proveedores.md).
- **Los contratos**: [read-v1](../contracts/read-v1.md), [read-v2](../contracts/read-v2.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Las tablas.** **Recomendadas**:

- **`purchase_orders`**:
  - **columnas**: `id`, `organization_id`, `number`, `supplier_id`, `currency`, `total`, `status` (por defecto `open`), `closed_at`, `cancelled_at`, `created_by`, `created_at` (con `clock_timestamp()`, como `orders`) y `updated_at`;
  - `UNIQUE (organization_id, number)` y `UNIQUE (organization_id, id)`, el destino de la clave compuesta de la 22.4;
  - **claves foráneas**: el proveedor por `(organization_id, supplier_id)` hacia `suppliers`, el autor hacia `users` y la organización, todas `ON DELETE RESTRICT`;
  - **los `CHECK`**: el número y el total positivos; la moneda con `^[A-Z]{3}$`; y las fechas atadas al estado (`closed_at` solo y siempre en `closed`, `cancelled_at` solo y siempre en `cancelled`);
  - **los índices**: la lista, `(organization_id, created_at desc, id desc)`, y las órdenes de un proveedor, `(organization_id, supplier_id, created_at desc)`, como `orders_list_idx` y `orders_client_idx`.
- **`purchase_order_lines`**:
  - **columnas**: `id`, `organization_id`, `purchase_order_id`, `product_id`, `position`, `quantity` (`numeric(14, 3)`), `unit_cost` y `line_total` (`numeric(14, 2)`);
  - **sin moneda por línea**: va en la cabecera, y todas las líneas la comparten (punto 3). `order_lines` la repite porque cada línea copia un precio con su moneda; acá no hay nada que copiar;
  - `UNIQUE (purchase_order_id, product_id)` y `UNIQUE (purchase_order_id, position)`; la posición entre 1 y 50; cantidad, costo y total positivos;
  - **claves foráneas** compuestas hacia la orden y hacia el producto, `ON DELETE RESTRICT`.

  `UNIQUE (organization_id, id)` en las líneas, que la recepción va a necesitar para apuntar a una línea, **lo agrega la 22.4**: crearlo ahora sería anticipar su diseño (regla 6).

*Alternativa*: la moneda también en cada línea, como `order_lines`. Repite un dato que no puede diferir.

**D-2. Los triggers.** **Recomendados**, con el molde de la `0036`:

- **`purchase_orders_guard`**:
  - una orden nace `open`, sin `closed_at` ni `cancelled_at`;
  - no se borra;
  - un `UPDATE` solo cambia `status`, `closed_at`, `cancelled_at` y `updated_at`. La lista es de columnas permitidas, así que una columna nueva queda fija sin tocar el trigger;
  - las transiciones: `open` → `closed` y `open` → `cancelled`. Ninguna otra;
  - una fecha de estado puesta no cambia.

  La transición a `closed` queda permitida en la base desde ahora, aunque en la 22.3 ningún código la use (D-3). Así la 22.4 no cambia el trigger.
- **`purchase_order_lines_insert_only`**: rechaza `UPDATE` y `DELETE` para cualquier rol.
- **Los privilegios**: `SELECT, INSERT, UPDATE` sobre `purchase_orders`; `SELECT, INSERT` sobre `purchase_order_lines`.

**D-3. El cierre a mano y la comprobación al cancelar (H-2).** **Recomendado**:

- **el cierre a mano pasa a la 22.4**, con la recepción, que es la que lo hace posible y la que lo prueba;
- **la cancelación de la 22.3 no comprueba recepciones**, porque no puede haber. La 22.4 suma la comprobación con la cabecera tomada `FOR UPDATE`, y la prueba con la carrera contra una recepción;
- **se deja escrito**: una nota fechada en el ADR 0023, punto 15, que conserva el texto, y la fila de la 22.3 y la 22.4 en el Roadmap.

*Alternativa*: construir el cierre a mano en la 22.3, con la comprobación contra la tabla de recepciones, que todavía no existe. No hay contra qué consultar. Habría que crear `goods_receipts` vacía, que la regla de las tablas especulativas no admite ([CLAUDE.md](../../CLAUDE.md)), o un cierre que rechaza siempre.

**D-4. Las líneas (H-1).** **Recomendadas**:

- **viven en `purchasing`** (`lines.ts`, puro y con su test), y `src/shared/lines/` no cambia;
- **la entrada** de cada línea: el producto (uuid), la cantidad y el costo unitario, como texto;
- **la lectura**:
  - la cantidad, con `parseQuantityInput` (positiva y en `numeric(14, 3)`);
  - el costo, con `parseMoneyInput` y los decimales de la moneda elegida, con sus mismas razones (`separator`, `decimals`, `too_large`, `zero` e `invalid`);
- **las reglas, en este orden**:
  1. de 1 a 50 líneas (`MAX_PURCHASE_ORDER_LINES`, como `MAX_ORDER_LINES`);
  2. un producto en una sola línea (`duplicateLines`);
  3. el producto existe en la organización y está activo (D-6);
  4. el total de cada línea con `computeLineTotal` (`zero_total`, `amount_too_large`);
  5. la suma con `sumLineTotals` (`total_too_large`).
- **Por qué no en `src/shared/lines/`**: hoy solo la usa la orden. Si la recepción de la 22.4 la necesita, ya está en el mismo módulo.

*Alternativa*: generalizar `evaluateLines` para costos. Cambia una función que usan el pedido y la venta, para un solo consumidor nuevo.

**D-5. La moneda.** **Recomendada**:

- un campo de selección con `acceptedCurrencies()`, como la apertura de la caja, **sin una moneda preseleccionada**: la persona la elige, como pide el punto 3, y no se le cuela una por defecto;
- los costos se leen con los decimales de esa moneda;
- **cambiar la moneda** en el formulario con JavaScript vuelve a leer los costos escritos. Sin JavaScript, la acción los lee con la moneda que llegó.

**D-6. Los productos (H-3).** **Recomendado**:

- **el alta usa `lockProductsForOrder` de `catalog`** sin cambiarlo: el bloqueo compartido ordenado por id y el estado activo. El precio que también devuelve no se mira;
- **un producto inactivo** se rechaza (`inactive_product`), y uno que no existe en la organización responde `NOT_FOUND` con sus líneas, como el pedido;
- **el buscador** del formulario usa `suggestProducts` de `catalog`, como el pedido (H-8);
- **el costo no se propone**: la persona lo escribe. Proponer el costo vigente exigiría leerlo de `catalog`, y puede estar en otra moneda. Si el uso lo pide, lo suma una subfase posterior.

**D-7. La serialización.** **Recomendada**:

- **el alta**, en este orden:
  1. el proveedor `FOR SHARE`, con una función nueva del repositorio de `purchasing` (H-4). Choca con la edición y la desactivación, que lo toman `FOR UPDATE`, y relee el estado ya confirmado;
  2. los productos en modo compartido, ordenados por id (D-6);
  3. la comprobación: el proveedor activo y las reglas de D-4;
  4. el contador (`nextDocumentNumber`), **al final**;
  5. la cabecera, las líneas y la auditoría.

  Ningún camino bloquea un contador y después otra fila (ADR 0021, punto 7), y el proveedor y los productos, que el `INSERT` toma por clave foránea, ya están tomados antes del contador.
- **la cancelación**: la cabecera `FOR UPDATE`, la comprobación del estado (`open`) con lo leído, el `UPDATE` y la auditoría;
- **desactivar un proveedor con órdenes abiertas** se permite y no las toca. La 22.4 decide qué pasa con sus recepciones (el punto 2 ya dice que un desactivado no recibe recepciones);
- **toda escritura y toda lectura por id filtra por `organization_id`**;
- **el aislamiento sigue siendo `READ COMMITTED`.**

**D-8. Las respuestas.** **Recomendadas**:

- **`FORBIDDEN`**: a un `viewer`, en toda lectura y toda escritura de órdenes;
- **`VALIDATION_ERROR`**, con el campo y la línea: un id que no es uuid, la moneda que no se acepta, una cantidad o un costo que no se leen (con su razón), y ninguna línea o más de 50;
- **`NOT_FOUND`**: el proveedor, los productos (con sus líneas) o la orden, si no existen en la organización;
- **`BUSINESS_RULE_VIOLATION`**, con su razón:
  - `inactive_supplier`;
  - las reglas de línea, con su posición: `duplicate_product`, `inactive_product`, `zero_total` y `amount_too_large`;
  - `total_too_large`;
  - al cancelar, `not_open`, con el estado actual;
- **al escribir**: el id y el número de la orden.

**Ningún rechazo escribe, audita ni consume número.**

**D-9. La auditoría.** **Recomendada**, con `entity_type` `purchase_order` y el id de la orden:

- **`create`**: el proveedor (su id), la moneda, el total, el estado y cada línea con claves numeradas (producto, cantidad, costo unitario y total), como el pedido. **Sin datos del proveedor**: solo su id (punto 14);
- **`status_change`**: `{ before: { status: "open" }, after: { status: "cancelled" } }`.

La historia de la orden la muestra como «Alta» y «Cancelación».

**D-10. Las pantallas.** **Recomendadas**:

- **la navegación interna de Compras**: dos pestañas, «Órdenes de compra» y «Proveedores», como la de Caja (`cash-sub-nav.tsx`). **`/compras` pasa a llevar a las órdenes**, que es el trabajo de todos los días;
- **`/compras/ordenes`**: la lista, con el número, el proveedor, la fecha, la moneda, el total y el estado; el filtro de estado, el de proveedor y la búsqueda por número (D-11); y el botón «Nueva orden de compra»;
- **`/compras/ordenes/nueva`**:
  - el proveedor, con un buscador de proveedores activos;
  - la moneda (D-5);
  - las líneas, con el buscador de productos, la cantidad, el costo unitario y el total de la línea estimado mientras se escribe, como el pedido;
  - funciona sin JavaScript, como el pedido;
  - **se puede llegar desde la ficha del proveedor** con el proveedor ya elegido;
- **`/compras/ordenes/[orderId]`**: el detalle, **imprimible**:
  - el número, la fecha, el proveedor con su nombre, teléfono, email y CUIT leídos de la ficha, las líneas, el total y la leyenda;
  - al imprimir queda solo la orden (`print:hidden`), como la venta;
  - el botón «Imprimir» y «Cancelar la orden», con su confirmación (`?confirmar=cancelar`), solo en una abierta;
  - la historia;
- **en la ficha del proveedor**: «Órdenes de compra», con las 5 últimas y un enlace a la lista filtrada por él;
- **un `viewer`** que entra por la URL ve el aviso de página prohibida, y no ve la entrada en la navegación (ya es así desde la 22.2).

**D-11. La lista.** **Recomendada**:

- **el orden**: la más nueva primero, por `created_at desc, id desc`, con el índice de D-1;
- **el filtro de estado**: todas (por defecto), abiertas, cerradas o canceladas;
- **el filtro de proveedor**, por su id, que usa el segundo índice;
- **la búsqueda por número**: `OC-000123`, `oc123` o `123`, como la de pedidos (`parseOrderNumberSearch`);
- **la página**: de 25;
- **el rendimiento**: con 2.000 órdenes, la lista con cada filtro queda bajo 754 ms en local, contra el umbral de la 13.2.

**D-12. El mensaje del CUIT** (decisión del usuario del 2026-10-15). **Recomendado**:

- `parseCuitInput` distingue dos razones: `format` (otra cantidad de dígitos, letras u otros separadores) y `check_digit` (once dígitos con el verificador que no cierra);
- **los textos**:
  - `format`: «Ingresá un CUIT de 11 dígitos, con o sin guiones, por ejemplo 20-12345678-6.»;
  - `check_digit`: «El dígito verificador no corresponde a este CUIT. Revisá el último número.»;
- **la respuesta** sigue siendo `VALIDATION_ERROR` con el campo `cuit`, y suma la razón;
- **el test de propiedades** sigue igual: cada CUIT con un dígito cambiado se rechaza, ahora con su razón.

**D-13. La revisión independiente.** **Recomendada**: un agente de solo lectura, antes del commit, contra este brief, el ADR 0023 y las reglas vigentes. Es el primer comprobante numerado del módulo, con un trigger de estados, montos y su primera dependencia hacia `catalog` y `numbering`.

**D-14. El despliegue a producción y el recorrido.** **Recomendado**: sí, con autorización aparte en su turno:

- **cuándo**: después de la revisión independiente y con la CI del SHA exacto en `success`;
- **cómo**: según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con la migración `0048`. El paso 3 lo corre el usuario o lo destraba en modo manual: el clasificador del modo automático frena el despliegue aunque la regla de `ssh` esté (brief-22.2, §Cierre).

**Volver a `317750d`, que es lo que corre hoy, es limpio**: ese código no conoce las tablas nuevas, que quedan sin usar, y nada fuera de ellas las referencia. El recorrido, en Demostración Vixora:

1. crear una orden para «Importaciones Sur» con dos productos, desde su ficha, en pesos;
2. intentar un costo con más decimales de los que tiene la moneda, y un producto repetido;
3. imprimirla, o ver la vista de impresión;
4. crear otra y cancelarla;
5. filtrar la lista por estado y por proveedor, y buscar por número;
6. desactivar un proveedor e intentar crearle una orden;
7. en un proveedor, cargar un CUIT con el verificador mal y ver el mensaje nuevo;
8. entrar con un `viewer` y no ver «Compras».

## Invariantes

1. Una orden nunca se borra, y sus líneas nunca cambian. `crm_app` no tiene `DELETE` sobre ninguna de las dos ni `UPDATE` sobre las líneas.
2. Una orden solo cambia de `open` a `closed` o a `cancelled`, y un estado final no cambia. Lo asegura la base, para cualquier rol.
3. Toda orden tiene un proveedor que estaba activo al crearla, al menos una línea, y una sola moneda. Ningún producto se repite en una orden.
4. El total de cada línea es el costo por la cantidad, redondeado a los decimales de la moneda y mayor que cero, y el total de la orden es la suma de las líneas.
5. Los números `OC` no tienen huecos por organización, y un rechazo no consume número.
6. La orden no toca el stock ni el costo: ninguna fila de `inventories`, `inventory_movements` ni `product_costs` cambia.
7. Ninguna escritura ni lectura por id alcanza a otra organización.
8. Solo un `admin` lee o escribe órdenes. Ninguna lectura del agente las incluye.
9. La orden no copia datos del proveedor ni guarda texto libre.
10. `purchasing` importa solo `catalog`, `numbering`, `organizations`, `audit`, `src/shared` y el esquema de `auth`, y **ningún módulo importa `purchasing`**.
11. `read-v1`, `read-v2` e `ingestion-v2` no cambian.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0048` suma `purchase_order` a `document_kind` y a `audit_entity_type`, crea `purchase_order_status` y las dos tablas. En `purchase-orders-schema.test.ts`, con el rol dueño:
  - **privilegios**: los de D-2;
  - **los `CHECK`**: cada uno con su caso, incluidas las fechas atadas al estado;
  - **los índices únicos**: el número por organización, el producto y la posición por orden;
  - **el trigger de la orden**: nace `open`; no se borra; rechaza cambiar otra columna, `closed` → `open`, `cancelled` → `closed` y cambiar una fecha puesta; admite `open` → `closed` y `open` → `cancelled`;
  - **el de las líneas** rechaza `UPDATE` y `DELETE`.
- **AC-2 (líneas)**: `lines.ts` tiene sus tests: cada regla de D-4 en su orden, el redondeo por línea con monedas de 0 y 2 decimales, y el costo leído con los decimales de la moneda.
- **AC-3 (operaciones)**:
  - el alta escribe la cabecera, las líneas, el número `OC` y la auditoría de D-9;
  - la cancelación pasa a `cancelled` con su fecha y su auditoría;
  - la lista ordena, filtra por estado y por proveedor, busca por número y pagina; las órdenes de un proveedor salen en su ficha.
- **AC-4 (rechazos)**: cada respuesta de D-8, **sin escribir, auditar ni consumir número**. Un `viewer` recibe `FORBIDDEN` en cada lectura y cada escritura. Cancelar una cancelada responde `not_open` y no audita.
- **AC-5 (serialización)**, cada escenario con su mutación:
  - **la desactivación del proveedor contra el alta**: con el proveedor retenido `FOR UPDATE` desde otra conexión, el alta espera, y si la desactivación confirma, responde `inactive_supplier` sin escribir. Sin el `FOR SHARE`, el alta pasa por la clave foránea con el proveedor inactivo (H-4);
  - **la desactivación de un producto contra el alta**, con el mismo molde;
  - **dos cancelaciones simultáneas**: una cancela y la otra responde `not_open`, con **una sola** auditoría. Es el escenario de actualización perdida que distingue el `FOR UPDATE` (nota «Prove a Row Lock…», evidencia de la 22.2);
  - **dos altas simultáneas** toman números consecutivos sin hueco.
- **AC-6 (aislamiento)**: `organization-isolation` prueba que la cancelación, el detalle y la lista no alcanzan a otra organización, y que un proveedor o un producto de otra organización responde `NOT_FOUND` al crear.
- **AC-7 (rendimiento)**: con 2.000 órdenes en una organización, la lista con cada filtro queda bajo 754 ms en local. El resultado va a §Resultados.
- **AC-8 (pantallas)**: un end-to-end sobre `next start`:
  - **un `admin`**, con teclado y sin JavaScript donde el formulario lo permite:
    - crea una orden con dos líneas y ve el total;
    - ve el rechazo de un costo inválido y de un producto repetido;
    - la ve en la lista, la filtra y la busca por número;
    - ve el detalle con la leyenda y la vista de impresión sin la navegación;
    - la cancela con la confirmación y ve su historia;
    - la ve en la ficha del proveedor;
  - **el mensaje del CUIT** con el verificador mal;
  - **un `viewer`** no ve «Compras» y recibe el aviso en `/compras/ordenes`;
  - **axe** sin violaciones en claro y en oscuro, también en la vista de impresión.
- **AC-9 (guardas)**: `exposed-surface` declara las acciones nuevas.
- **AC-10 (fronteras)**:
  - `purchasing` no importa nada fuera de la invariante 10;
  - ningún módulo importa `purchasing`;
  - ningún módulo existente está en el diff, salvo `numbering` y `audit` en lo autorizado.
- **AC-11 (contratos)**: `read-api`, `read-api-v2` e `ingestion-v2` pasan sin cambios.
- **AC-12 (CUIT)**: `cuit.test.ts` y `suppliers.test.ts` prueban las dos razones de D-12, y `messages.test.ts`, sus textos.
- **AC-13**: la batería de la CI completa pasa en local (formato, lint, typecheck, build, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-14**: la documentación del punto 6 del alcance queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-15** (si D-14): producción corre el SHA del cierre con la `0048`. En Demostración Vixora, el recorrido de D-14 se concilia contra la base: las órdenes, sus líneas, sus estados, el contador de `purchase_order` y la auditoría, y que el stock y los costos no cambiaron.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7, AC-9 a AC-12, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-11.
- `isolated-runtime`: AC-15, si se despliega.
- **Las mutaciones** se corren y se revierten una por una, y su resultado va a §Resultados. Como mínimo:
  - el alta sin el `FOR SHARE` del proveedor;
  - el alta sin comprobar que el proveedor esté activo;
  - la cancelación sin `FOR UPDATE`;
  - la cancelación sin comprobar el estado;
  - el contador antes de los bloqueos;
  - el redondeo de la línea sin los decimales de la moneda;
  - una escritura o una lectura por id sin `organization_id`;
  - un `viewer` que lee la lista.
- **Las mutaciones del trigger** (una transición de más, una columna de más) se prueban contra la base con el rol dueño, en `purchase-orders-schema.test.ts`.
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final. El end-to-end, en dos mitades si la máquina no alcanza.

## Condiciones de detención

Parar e informar antes de seguir si:

- hace falta tocar un archivo fuera de la lista autorizada, en especial `catalog`, `inventory`, `src/shared/` o los contratos del agente;
- `purchasing` tendría que importar algo fuera de la invariante 10, o un módulo existente importar `purchasing`;
- el diseño exigiría cambiar el texto del ADR 0023 (salvo la nota de D-3, si se aprueba), del 0019, del 0020 o del 0013;
- una orden pudiera borrarse, editarse, volver de un estado final, repetir un producto, mezclar monedas o crearse para un proveedor inactivo;
- un rechazo escribe, audita o consume número;
- la orden tocara el stock o el costo;
- aparece una vía por la que un `viewer` o el agente lea o escriba una orden;
- `read-v1`, `read-v2` o `ingestion-v2` tendrían que cambiar;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de cada una de estas acciones, que necesita autorización explícita en su turno:

- el commit y el push;
- pasar tareas de estado en Notion;
- ejecutar migraciones contra una base que no sea la local o la de la CI;
- desplegar.

## Resultados — 2026-10-15 (autoevaluación)

Implementado el 2026-10-15. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-13 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

**Desvío aprobado por el usuario el 2026-10-15** (condición de detención, informada antes de seguir):

- **Siete end-to-end vaciaban `products` o `suppliers` con `TRUNCATE`.** PostgreSQL no vacía una tabla a la que apunta una clave foránea si la tabla que apunta no va en la misma sentencia (`0A000`, comprobado contra la base local de test), y `purchase_orders` y `purchase_order_lines` apuntan a las dos. A `orders`, `product-fields`, `product-images`, `products`, `sales`, `security-headers` y `suppliers.spec.ts` se les sumaron solo esas dos tablas en su `truncate`. Ninguno estaba en la lista autorizada, salvo `suppliers.spec.ts` para el mensaje del CUIT.
- **`suppliers.spec.ts` esperaba que «Compras» llevara a los proveedores.** Con D-10 lleva a las órdenes; el caso ahora entra por la pestaña «Proveedores».
- **El comentario del menú en `src/app/(autenticado)/layout.tsx`** decía que `/compras` lleva a los proveedores. Se corrigió el comentario, sin cambiar el código.

**Precisiones que no cambian una decisión:**

- **El código de la orden vive en dos archivos nuevos del módulo**, `purchase-orders.ts` (los casos de uso) y `purchase-order-repository.ts`, junto a `service.ts` y `repository.ts` de los proveedores. `index.ts` exporta los dos.
- **`purchasing/schema.ts` importa también el esquema de `catalog`**, para la clave foránea de las líneas hacia `products`, como `orders/schema.ts`. La invariante 10 ya admite `catalog`.
- **El bloqueo compartido del proveedor es una opción de `findSupplier`** (`forShare`), junto a `forUpdate`, y no una función aparte (D-7).
- **Todas las reglas de D-4 corren dentro de la transacción**, después de bloquear el proveedor y los productos, en el orden de D-7. El pedido revisa los repetidos antes de abrirla; acá un producto repetido de un proveedor inactivo responde `inactive_supplier`.
- **La razón del CUIT es opcional en la respuesta** (`cuitReason`): solo aparece cuando el CUIT está entre los campos inválidos, así las respuestas de los demás campos no cambian (D-12).
- **El buscador de proveedores del alta** usa `listSuppliers` con los activos y devuelve los diez primeros; sin JavaScript, el proveedor se reconoce por su nombre exacto entre los activos.
- **El proveedor de cada fila de la lista filtra la lista por él**: es la forma de llegar al filtro de proveedor desde la pantalla, además de la ficha (D-11).
- **Se sumó un caso de serialización que el brief no nombraba**, «un alta que espera a su proveedor no frena el número del alta de otro». Sin él, la mutación del contador antes de los bloqueos no tenía quien la detectara.
- **Los archivos nuevos entraron al índice con `git add -N`**, porque `exposed-surface` lee `git ls-files`.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `purchase-orders-schema.test.ts`, 27 casos: los privilegios y el 42501 de `crm_app`, los valores de los dos enums, cada `CHECK` (también las fechas atadas al estado, con el trigger apagado en la transacción), los índices únicos, las tres claves compuestas y el 23001 al borrar un proveedor con órdenes, el trigger de la orden (nace abierta, no se borra, otra columna, las transiciones prohibidas y la fecha puesta) y el de las líneas |
| AC-2 | cumplido | `lines.test.ts`, 9 casos: de 1 a 50 líneas, cada campo con su razón, el costo con 0 y 2 decimales, y las reglas 2 a 5 en su orden con el redondeo por línea |
| AC-3 | cumplido | `purchase-orders.test.ts`: el alta con la cabecera, las líneas, `OC-000001` y la auditoría exacta; la cancelación con su fecha y su auditoría; la historia; la lista con su orden, sus filtros, la búsqueda por número y la página; las cinco últimas de un proveedor; el detalle con los datos de hoy; y que el stock y el costo no cambian |
| AC-4 | cumplido | `purchase-orders.test.ts`: `FORBIDDEN` en las seis funciones; cada `VALIDATION_ERROR`, `NOT_FOUND` y `BUSINESS_RULE_VIOLATION` de D-8 sin escribir, auditar ni consumir número (la foto incluye `document_counters`); `not_open` sin auditar |
| AC-5 | cumplido | `purchase-orders.test.ts`: la desactivación del proveedor y la de un producto en curso, dos cancelaciones simultáneas con una sola auditoría, el contador al final y tres altas simultáneas con números 1, 2 y 3. Mutaciones abajo |
| AC-6 | cumplido | `organization-isolation.test.ts`, 4 casos: `cancelPurchaseOrderRow`, `findPurchaseOrder` y `findPurchaseOrderLines`, la lista con cada filtro, y el alta con el proveedor o el producto de otra organización |
| AC-7 | cumplido | con 2.000 órdenes en local, la lista entera en la página 40 en 14 a 56 ms; las canceladas, 9,5 a 17 ms; las abiertas, 8 ms; un proveedor con cien órdenes, 7,5 a 14 ms; un número, 4 a 12 ms. El umbral es de 754 ms |
| AC-8 | cumplido | `purchase-orders.spec.ts`, 4 casos, uno sin JavaScript, con axe en claro y en oscuro, también en la vista de impresión; el mensaje del CUIT, en `suppliers.spec.ts` |
| AC-9 | cumplido | `exposed-surface` declara las 4 acciones nuevas |
| AC-10 | cumplido | `purchasing` importa `catalog`, `numbering`, `organizations`, `audit`, `src/shared` y los esquemas de `auth`, `catalog` y `organizations`; ningún módulo importa `purchasing`; de los módulos existentes, solo `numbering` y `audit` están en el diff |
| AC-11 | cumplido | `read-api`, `read-api-v2` e `ingestion-v2` pasan en la integración completa |
| AC-12 | cumplido | `cuit.test.ts` (las dos razones, con la propiedad del dígito cambiado), `suppliers.test.ts` y `messages.test.ts` |
| AC-13 | cumplido | formato, lint, typecheck, build, 821 unitarios, 660 guardas y 1.394 de integración pasan. El end-to-end completo, con los cuatro specs de R-1 corregidos, dio 202 de 203: la falla es `sales.spec.ts:136`, que se pasó de los 30 s con la máquina cargada, como en la corrida anterior, sin `0A000`; corrido solo, `sales.spec.ts` pasa entero, 12 de 12. La CI 38839565148 de `1225040` terminó en `success` en 21 minutos al primer intento |
| AC-14 | cumplido | DataModel, Overview, FunctionalRequirements (`FR-COMP-05` a `09`), Screens (43 a 45 y la 40 a 42), TraceabilityMatrix, SecurityModel (146 puntos de entrada), la nota del ADR 0023 y el Roadmap |
| AC-15 | cumplido | desplegado el 2026-10-16 y recorrido por el usuario; conciliado contra la base (§Cierre) |

### Mutaciones

Corridas una por una con un script que aplica el cambio, verifica que aparezca una sola vez, corre los tests que deberían atraparlo y restaura el archivo; al terminar, el código compila igual.

- **M1**, el alta sin el `FOR SHARE` del proveedor: detectada por «una desactivación del proveedor en curso».
- **M2**, el alta sin comprobar que el proveedor esté activo: 2 fallas.
- **M3**, la cancelación sin `FOR UPDATE`: detectada por «dos cancelaciones simultáneas».
- **M4**, la cancelación sin comprobar el estado: 2 fallas.
- **M5**, el contador antes de los bloqueos: detectada por «un alta que espera a su proveedor no frena el número del alta de otro» y por las altas simultáneas.
- **M6**, el redondeo de la línea con dos decimales fijos: detectada por el alta en `CLP` de la integración y por `lines.test.ts`.
- **M7**, `cancelPurchaseOrderRow` y `findPurchaseOrder` sin `organization_id`: cada una detectada por `organization-isolation.test.ts`.
- **M8**, un `viewer` que lee la lista: detectada por el caso de `FORBIDDEN`.
- **M9**, los productos sin el bloqueo compartido (`lockProductsShared` de `catalog` sin `FOR SHARE`, solo durante la corrida): detectada por «una desactivación de un producto en curso». La sumó la revisión independiente (R-5); `catalog` quedó sin cambios.
- **Las mutaciones del trigger** (una transición de más, una columna de más) las prueba `purchase-orders-schema.test.ts` contra la base.

## Revisión independiente — 2026-10-15

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0023 y las reglas vigentes (D-13). No ejecutó nada. Encontró **6 hallazgos: uno mayor, tres menores y dos notas**. Cada uno se verificó contra el código antes de aceptarlo.

- **R-1 (mayor), aceptado y verificado**: otros cuatro end-to-end, `accounts`, `order-receipts`, `receipts` y `refunds`, vacían `products` sin las tablas de la orden. La búsqueda de la implementación miraba solo tres líneas después de cada `truncate`, y en esos cuatro `products` aparece más abajo. **Lo confirmó la batería completa**: sus 16 casos fallan con `0A000`. Son once specs, no siete, y los cuatro están fuera de la lista autorizada: el usuario autorizó sumarlos, se agregaron las dos tablas a su `truncate` y **la batería completa ya no da ningún `0A000`**.
- **R-2 (menor), corregido**: el comentario del repositorio nombraba `updatePurchaseOrderStatus`, que no existe; la escritura es `cancelPurchaseOrderRow`.
- **R-3 (menor), corregido**: DataModel no tenía `purchase_order` en las listas de valores de `document_kind` y de `entity_type`.
- **R-4 (nota), documentado**: el buscador de productos del alta responde a cualquier sesión con el nombre y el SKU de los productos activos, como los buscadores que ya existían. No expone órdenes, precios ni costos; SecurityModel lo dice ahora.
- **R-5 (menor), corregido**: la desactivación de un producto contra el alta no tenía mutación (ahora M9, arriba), y el comentario del caso de las dos cancelaciones decía que sin el `FOR UPDATE` habría dos auditorías. En realidad la segunda cancelación choca con el trigger («una fecha de estado no cambia»): el caso falla igual, pero por la segunda defensa. El comentario lo dice así.
- **R-6 (nota), corregido en parte**: las tarjetas de la lista en un teléfono no enlazaban al proveedor, como sí lo hacía la tabla, y el Overview no decía que `schema.ts` importa el esquema de `catalog`. Los dos se corrigieron. Que la historia rotule todo `status_change` como «Cancelación» es correcto en la 22.3; lo cambia la 22.4, con el cierre.

## Cierre de la subfase 22.3, 2026-10-16

Cierra el 2026-10-16, después del recorrido del usuario en producción («Listo, esta todo perfecto») y de la conciliación contra la base.

- **AC-1 a AC-15 cumplidos**, con el desvío aprobado (los once end-to-end que vacían `products` o `suppliers`, siete al implementar y cuatro con R-1, y el destino de «Compras» en `suppliers.spec.ts`).
- **Commit, CI y despliegue**:
  - `1225040`, la implementación. La CI 38839565148 terminó en `success` en 21 minutos al primer intento, con la suite completa, y se leyó por el SHA completo.
  - Desplegado el 2026-10-16 según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar, con `317750d` anotado como la versión para volver atrás. La migración `0048` se aplicó, y la última línea comparó HEAD con el SHA pedido. El paso 3 corrió con el usuario en modo manual, que lo aprobó: el modo automático lo frena, como en la 22.2.
  - Después del despliegue: el servicio, `active`; `/login` en `127.0.0.1:3000`, con `200`; 49 migraciones aplicadas; `purchase_orders` con `SELECT`, `INSERT` y `UPDATE` para `crm_app` y `purchase_order_lines` con `SELECT` e `INSERT`; los triggers `purchase_orders_guard` y `purchase_order_lines_insert_only`; los índices y las restricciones únicas; `purchase_order` en `audit_entity_type` y en `document_kind`; las dos tablas vacías.
- **El recorrido del usuario (AC-15)**, en «Demostración Vixora». **Conciliado contra la base**, solo con lecturas:
  - una orden, `OC-000001`, de «Importaciones Sur» (activo), en ARS, con dos líneas: 3 × 370.000 y 5 × 600.000; cada `line_total` es su cantidad por su costo, y el total, 4.110.000, es la suma de las líneas; las líneas son de la misma organización y de productos activos;
  - la orden está `cancelled`, con la fecha de anulación posterior al alta y sin fecha de cierre;
  - el contador de `purchase_order` en 1; ninguna otra organización tiene órdenes;
  - la auditoría: un alta y un cambio de estado de la orden, con su organización y su usuario, ninguna suelta.
- **Nivel**: validado localmente y en CI, validado en integración para las pantallas, desplegado en producción y recorrido por el usuario. No es «preparado para producción».
- **Revisión**: la independiente (arriba). La batería, el despliegue, la conciliación y este cierre son autoevaluación declarada.
