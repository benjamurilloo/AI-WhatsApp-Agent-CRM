---
schema: task-brief.v1
task_id: "19.2"
task_type: implementation
generated_at: 2026-10-11
---

# Brief 19.2 — El pedido

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, los triggers, el servicio, el contador, las guardas y los scripts de datos de un cliente, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y para los contratos del agente, que no cambian;
  - `isolated-runtime` para el despliegue, si se autoriza (D-14).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, **validado en integración** para las pantallas y, con D-14, **desplegado en producción** con el recorrido del usuario. No es «preparado para producción».
- **Orden**: segunda subfase de la Fase 19 — Pedidos ([Roadmap](../planning/Roadmap.md) §Fase 19), después de la 19.1, cerrada el 2026-10-11. Implementa las filas «19.2» del punto 11 del [ADR 0020](0020-el-pedido.md).
- **No abre ni cierra gate.** Crea tres tablas, dos módulos y la primera tabla con una lista de columnas y transiciones permitidas. Por eso se recomienda la revisión independiente (D-13).
- **Estado de este documento**: **aprobado el 2026-10-11** por el usuario, con las recomendaciones de D-1 a D-14. La tarea 19.2 (`3f6702be6f4e813390b6f25fcb2cef76`) está en «En proceso» en Notion desde ese día.

## Objetivo

Que un `admin` pueda **crear un pedido pendiente** para un cliente, con sus líneas, su total y su número, **cancelarlo** mientras esté pendiente, y que los dos roles vean **la lista y el detalle** de los pedidos. El pedido no toca el stock: eso es de la 19.3.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código el 2026-10-11.

**Ya está fijado** por el ADR 0020, puntos 2, 3, 6, 8, 10 y 11:
- el número `P-000123` desde el alta, del contador del módulo `numbering` (`document_counters`, clave `(organization_id, kind)`, `kind` con el único valor `order`), escrito por una sola función con la guarda `counter-writes`; con `INSERT … ON CONFLICT DO NOTHING` y después el bloqueo `FOR UPDATE` (ADR 0019, punto 2);
- `orders` sin `DELETE`, con un trigger que solo deja cambiar `status`, `confirmed_at`, `delivered_at`, `cancelled_at` y `updated_at`, que rechaza transiciones fuera de la tabla del punto 4 y con un `CHECK` que ata cada fecha a su estado; `order_lines` de solo inserción;
- los montos copiados al crear, las reglas de las líneas (precio vigente, misma moneda, producto activo, cantidad mayor que cero, total redondeado distinto de cero, `MAX_AMOUNT`, un producto por pedido), el cliente activo;
- solo `admin` escribe; un `viewer` ve sin el contacto del cliente; ningún pedido muestra costo ni margen;
- la clave compuesta hacia `clients` con `RESTRICT`, sin texto libre, los pedidos en la exportación y el cambio de criterio del borrado de un cliente.

**Lo que hay en el código y se reutiliza**:
- `catalog`: `lockProductForStockChange(tx, …)` bloquea un producto en modo compartido (`repository.lockProductShared`) y devuelve si está activo; `getCurrentPrices` lee el precio vigente **fuera** de una transacción. **Falta una función que, dentro de la transacción del pedido, bloquee varios productos ordenados y lea su precio vigente**: la suma esta subfase en `catalog`.
- `crm`: `getClientsByIds` (con el contacto nulo para un `viewer`), `suggestClients` para el buscador. **No hay una función que bloquee un cliente por id dentro de una transacción ajena**: la suma esta subfase.
- `src/shared/money/` (`MAX_AMOUNT`, `currencyDecimals`, `moneyToDatabase`, `formatMoney`) y `src/shared/quantity/` (`parseQuantityInput`, `MAX_QUANTITY`). El producto precio × cantidad con redondeo no existe: va como función pura en `orders`, como `margin.ts` en `catalog`.
- `audit`: `recordAudit(tx, …)`; los enums `audit_entity_type` (sin `order`) y `audit_action` (ya tiene `create` y `status_change`).
- El test de privilegios de `crm_app` (`tests/integration/audit.test.ts`) tiene las listas `INSERT_ONLY_TABLES`, `NO_DELETE_TABLES` y `NO_UPDATE_TABLES`; `tests/integration/identity-schema.test.ts` lista todas las tablas.
- `scripts/client-data-delete.ts`: `deletable` es `conversations === 0`, y `--borrar` borra la ficha. `scripts/client-data-export.ts` no conoce los pedidos. El vaciado lleva el nombre a «Cliente eliminado …» y los datos a nulo, **pero no desactiva al cliente** (H-3).
- **Once specs end-to-end** vacían `clients` o `products` con un `TRUNCATE` explícito: `client-fields`, `client-tags`, `clients`, `conversations`, `dashboard-sin-ingestion`, `dashboard`, `ingestion`, `product-fields`, `product-images`, `products` y `security-headers`. Con pedidos que los referencian, cada una suma `orders` y `order_lines`.
- **Producción** corre `0c2f322`, con la migración `0035`. La de esta subfase es la `0036`.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre Overview, DataModel, ADR 0019, ADR 0020, el runbook y los scripts):
- **H-1. `orders` no depende de `inventory` en la 19.2.** El ADR 0020, §Consecuencias, lista `inventory` entre sus dependencias, pero la 19.2 no toca el stock. La dependencia entra con la 19.3. No es una contradicción: es el orden.
- **H-2. El orden de bloqueo del ADR 0020, punto 6, no nombra al cliente.** El alta tiene que leer el cliente activo sin que una desactivación simultánea se cruce. Ningún otro camino bloquea productos y después un cliente (la ingestión bloquea cliente y conversación, nunca productos), así que bloquear el cliente primero no crea un ciclo. Lo decide D-3.
- **H-3. El ADR 0020, punto 3, deja a esta subfase cómo se trata un cliente vaciado.** Hoy el vaciado no lo desactiva, así que un cliente vaciado seguiría admitiendo pedidos nuevos con «Cliente eliminado …» como nombre. Lo decide D-9.
- **H-4. El nombre del producto no se copia en la línea.** El ADR 0020, punto 3, fija lo que guarda la línea (producto, cantidad, precio, moneda y total). El detalle muestra el nombre **actual** del producto: si se renombra, un pedido viejo lo muestra con el nombre nuevo. Es consecuencia de una decisión aceptada; se escribe como límite conocido en DataModel.
- **H-5. La leyenda «Documento no válido como factura»** (ADR 0019, punto 6) es de los comprobantes. El pedido no lo es (ADR 0020, punto 3): no la lleva.
- **H-6. DataModel, regla 8**: el pedido no tiene `is_active`; nunca se borra y se cancela por estado. Se suma a la lista de lo que no se borra nunca.
- **No apareció ninguna contradicción** que obligue a cambiar el ADR 0020. D-3 y D-9 lo precisan en lo que deja abierto.

## Alcance incluido

1. **Esquema** (migración `0036`, generada con `drizzle-kit generate` y completada a mano):
   - **`document_counters`** del módulo `numbering`: `organization_id`, `kind` (enum `document_kind` con `order`), `last_number bigint`, `updated_at`; clave `(organization_id, kind)`; privilegios y trigger según D-2.
   - **`orders`**: `id`, `organization_id`, `number bigint` con `UNIQUE (organization_id, number)` y `CHECK (number > 0)`, `client_id` con la clave compuesta hacia `clients (organization_id, id)` y `RESTRICT`, `currency` con el formato de tres letras, `total numeric(14, 2)` con `CHECK (total > 0)`, `status` (enum `order_status`, según D-1), las fechas de estado, `created_by` hacia `users`, `created_at`, `updated_at`. `UNIQUE (organization_id, id)` para la clave de las líneas. Índices para la lista (D-10).
   - **`order_lines`**: `id`, `organization_id`, `order_id` con clave compuesta hacia `orders (organization_id, id)`, `product_id` con clave compuesta hacia `products (organization_id, id)`, `quantity numeric(14, 3)` con `CHECK (> 0)`, `unit_price numeric(14, 2)` con `CHECK (> 0)`, `currency`, `line_total numeric(14, 2)` con `CHECK (> 0)`, `position smallint`; `UNIQUE (order_id, product_id)`.
   - **Privilegios** (ADR 0013): `orders` con `SELECT, INSERT, UPDATE` para `crm_app`; `order_lines` con `SELECT, INSERT`. Triggers con `P0001`: el de `orders` con su lista de columnas permitidas y sus transiciones; el de `order_lines`, de solo inserción.
   - **`order`** en `audit_entity_type`.
2. **Módulo `numbering`** (nuevo): `schema.ts`, `repository.ts`, `service.ts` e `index.ts`. Una sola función pública, `nextDocumentNumber(tx, organizationId, kind)`, que exige la transacción por tipo. Sin pantalla.
3. **Módulo `orders`** (nuevo):
   - `createOrder` (solo `admin`), con el orden de bloqueo de D-3 y los precios esperados de D-5; audita `create` en la misma transacción, con el `diff` de D-11;
   - `cancelOrder` (solo `admin`), para un pedido pendiente: bloquea la cabecera `FOR UPDATE`, pasa a `cancelled` con `cancelled_at` y audita `status_change`. Un pedido ya cancelado devuelve `changed: false` sin escribir ni auditar;
   - `listOrders` y `getOrder` (los dos roles), con el contacto del cliente nulo para un `viewer`; la historia del pedido, solo para `admin` (D-12);
   - `line-total.ts`, puro y probado: centésimos × milésimas, redondeado a los decimales de la moneda con el medio hacia afuera del cero, con los límites de `MAX_AMOUNT`.
4. **`catalog`**: `lockProductsForOrder(tx, organizationId, productIds)`, que bloquea los productos en modo compartido **ordenados por id** y devuelve, de cada uno, si existe, si está activo y su precio vigente leído en la misma transacción.
5. **`crm`**: `lockClientForOrder(tx, organizationId, clientId)`, que bloquea la ficha en modo compartido y devuelve si existe y si está activa (D-3).
6. **Pantallas** (D-6 a D-8):
   - `/pedidos`: la lista, con número, fecha, cliente, cantidad de líneas, total y estado; filtros por estado y por cliente; búsqueda por número; paginada;
   - `/pedidos/nuevo` (solo `admin`): el cliente con el buscador de clientes, las líneas con el buscador de productos, la cantidad y el precio vigente a la vista, y el total estimado. El total que vale es el del servidor;
   - `/pedidos/[orderId]`: cabecera, cliente, líneas con el nombre actual del producto, total, estado y fechas; el botón «Cancelar pedido» con confirmación, solo para `admin` y solo si está pendiente; la historia, solo para `admin`;
   - «Pedidos» en la navegación, para los dos roles;
   - en la ficha del cliente, una tarjeta con sus últimos pedidos y, para `admin`, «Nuevo pedido» con el cliente ya elegido.
7. **Guardas** (D-4):
   - `tests/guards/counter-writes.test.ts`: solo la función del contador escribe `document_counters`;
   - `tests/guards/order-writes.test.ts`: solo las funciones del repositorio de `orders` escriben `orders` y `order_lines`, y ninguna borra;
   - las dos con sus casos de fallo versionados, como `price-writes`;
   - `exposed-surface`: las acciones nuevas declaradas con `sesion`.
8. **Datos de un cliente** (ADR 0020, punto 10; D-9):
   - la exportación suma los pedidos del cliente y sus líneas;
   - el informe y el borrado: un cliente con pedidos **no es borrable**, aunque no tenga conversaciones; `--borrar` lo rechaza y remite a `--vaciar`;
   - el vaciado no toca los pedidos, y además desactiva la ficha (D-9);
   - `docs/runbooks/datos-de-un-cliente.md` con el criterio nuevo.
9. **Seed básico**: pedidos pendientes y cancelados, con líneas en una moneda, uno con varias líneas y uno de un cliente desactivado después del alta.
10. **Documentación**:
    - `DataModel.md`: las tres tablas, los dos enums, las reglas 8 y 10, el valor nuevo de `audit_entity_type`, el límite de H-4 y la nota de §«Explícitamente fuera de este modelo» pasada a «implementada» en lo que corresponde;
    - `Overview.md`: los módulos `orders` y `numbering` con sus dependencias, y `orders` entre los que usan `audit`;
    - `FunctionalRequirements.md`: una sección «Pedidos» (FR-ORD-01 en adelante) y FR-AUD con la entidad nueva;
    - `Screens.md` (pantallas 14 a 16), `TraceabilityMatrix.md`, `SecurityModel.md` (recuentos de superficie) y `EngineeringStandards.md` (las guardas);
    - al cerrar: una precisión fechada en el ADR 0020, punto 6, si D-3 se aprueba.

## Alcance excluido

- **Todo lo del stock**: `quantity_reserved`, `order_delivery`, confirmar, entregar, cancelar un confirmado, lo disponible y la regla `below_reserved`. Son de la 19.3. `inventory` no cambia.
- **Editar un pedido o sus líneas**, borrar un pedido, duplicarlo.
- **El agente**: ni `read-v1` ni `ingestion-v2` cambian; el actor de servicio del pedido es de la 19.4.
- **Descuentos, recargos, envío, dirección de entrega, notas o cualquier texto libre** en el pedido.
- **Imprimir o exportar un pedido** a PDF o a otro formato, y enviarlo al cliente.
- **El dashboard y las métricas**: ninguna métrica de pedidos.
- **El pedido en la ficha del producto.**
- **Datos de volumen** (`seeds/volume.ts`) y staging.
- **El repositorio del agente.**

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0036_*.sql` y `drizzle/meta/*`
- `src/modules/numbering/` (nuevo) y `src/modules/orders/` (nuevo), con sus tests unitarios
- `src/modules/catalog/`: `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`, **solo** `lockProductsForOrder`
- `src/modules/crm/`: `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`, **solo** `lockClientForOrder`
- `src/modules/audit/schema.ts`: **solo** el valor nuevo del enum
- `src/app/(autenticado)/pedidos/` (nuevo), `src/app/(autenticado)/layout.tsx` (la navegación), `src/app/_components/icons.tsx` (**solo** si hace falta un ícono nuevo), `src/app/(autenticado)/clientes/[clientId]/page.tsx` y un componente nuevo de la tarjeta en esa carpeta
- `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`
- `tests/integration/`: `orders.test.ts`, `orders-schema.test.ts` y `numbering.test.ts` (nuevos); `client-data.test.ts`; `identity-schema.test.ts` y `audit.test.ts`, **solo** las tablas nuevas en sus listas
- `tests/guards/counter-writes.test.ts` y `tests/guards/order-writes.test.ts` (nuevos); `tests/guards/exposed-surface.test.ts`, **solo** las acciones nuevas
- `tests/e2e/orders.spec.ts` (nuevo); las once specs de §Lo que se verificó, **solo** `orders` y `order_lines` en su `TRUNCATE`
- `seeds/basic.ts`
- `docs/architecture/DataModel.md`, `Overview.md`, `TraceabilityMatrix.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`; `docs/development/EngineeringStandards.md`; `docs/runbooks/datos-de-un-cliente.md`
- al cerrar: este brief, el ADR 0020 (la precisión de D-3), `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

*Ampliada el 2026-10-11 por el usuario, durante la implementación*: `catalog` suma también `getProductsByIds(context, ids)`, una lectura para los dos roles que devuelve varios productos por id en una consulta, para componer los nombres de las líneas sin `JOIN`. `catalog` no tenía una lectura por ids.

*Ampliada otra vez el 2026-10-11 por el usuario, después de la revisión independiente*: `tests/e2e/clients.spec.ts`, `knowledge.spec.ts`, `products.spec.ts` y `users.spec.ts`, **solo** el tope de tabulaciones de su recorrido con teclado (de 12 a 16), porque el ítem «Pedidos» de la navegación suma una parada antes del formulario; y, por R-2 y R-3, `eslint.config.mjs` (`orders` y `numbering` en el bloque de los módulos de dominio), `tests/guards/module-boundary.test.ts` (sus casos) y `docs/architecture/RepositoryStructure.md` (los dos módulos en su tabla y en la frontera).

`src/shared/money/`, `src/shared/quantity/` e `inventory` **no** se tocan.

## Fuentes de verdad

- **El código y las migraciones**: `catalog`, `crm`, `audit`, `drizzle/0017_*` y `drizzle/0035_*` (los moldes de solo inserción), `src/shared/money/` y `src/shared/quantity/`, y los dos scripts de datos de un cliente.
- **Las decisiones**: el [ADR 0020](0020-el-pedido.md); el [ADR 0019](0019-bases-de-los-comprobantes.md), puntos 2 a 4; el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md); el [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md); el [brief-13.4](brief-13.4-retencion-y-borrado.md), sobre el borrado de un cliente.
- **Los contratos**: [read-v1](../contracts/read-v1.md) e [ingestion-v2](../contracts/ingestion-v2.md), que no cambian.

## Decisiones pendientes

Cada una con su recomendación. El usuario aprueba o cambia.

**D-1. Qué estados y fechas crea la 19.2.**
- (a) **El modelo completo del ADR desde ahora. Recomendada.** El enum con los cuatro estados, las tres fechas, el `CHECK` que ata cada fecha a su estado y el trigger con toda la tabla de transiciones del punto 4. La forma del pedido la fija un ADR aceptado, no es especulativa; el trigger se prueba entero en la 19.2 con SQL; y la 19.3 no tiene que cambiar a la vez un enum, un `CHECK` y un trigger (un valor nuevo de enum no se puede usar en la misma transacción que lo agrega). La aplicación de la 19.2 solo produce `pending` y `cancelled`.
- (b) Solo `pending` y `cancelled`, con `cancelled_at`, y la 19.3 suma lo demás. Cumple al pie de la letra «todos los valores tienen productor» (brief-3.6, D-1), con una migración más delicada en la 19.3.

**D-2. Las defensas del contador.**
- (a) **`crm_app` con `SELECT, INSERT, UPDATE`, sin `DELETE`, y un trigger que rechaza con `P0001` el borrado, todo cambio de `organization_id` o `kind`, y todo `UPDATE` que no sume exactamente 1 a `last_number`. Recomendada.** Un contador que retrocede repite números, y el `UNIQUE` de `orders` lo frenaría tarde, con un error. Es la categoría de `ingestion_events` (sin borrado, identidad protegida) con una regla más.
- (b) Solo sin `DELETE`, sin trigger.

**D-3. El cliente en el orden de bloqueo.** **Recomendada**: el alta bloquea **primero la ficha del cliente en modo compartido** (espera a una desactivación en curso, que la bloquea `FOR UPDATE`), después los productos ordenados por id y al final el contador. Se registra al cerrar como una precisión fechada del ADR 0020, punto 6 (H-2). Las transiciones no bloquean al cliente: cancelar nunca depende de él.

**D-4. Una guarda de escrituras para `orders`.** **Recomendada**: sí, `order-writes`, además de `counter-writes`. `orders` es la primera tabla de negocio con `UPDATE` y lista de columnas permitidas; la guarda fija que solo el repositorio de `orders` la escribe y que nada la borra, como `stock-writes` con `inventories`. El trigger es la segunda defensa.

**D-5. Los precios esperados.** **Recomendada**: el formulario envía, con cada línea, el precio vigente que mostró. Si al crear algún precio cambió, **no se crea nada** y el servicio devuelve `CONFLICT` con los precios nuevos, que la pantalla muestra para que el operador confirme de nuevo. Es lo que hace `setProductPrice` con el precio esperado, y evita que un pedido diga un precio distinto del que se le dijo al cliente.

**D-6. Cuántas líneas tiene un pedido como máximo.** **Recomendada**: 50. Acota el formulario, la transacción y los bloqueos; un pedido de un negocio chico rara vez tiene más. Más de 50 da `VALIDATION_ERROR`. Se revisa si el uso lo pide.

**D-7. El formulario del alta.** **Recomendada**: un componente de cliente con «Agregar línea» y «Quitar línea», el buscador de productos de la 15.2 (`SuggestInput`) en cada línea, la cantidad con hasta tres decimales y el precio vigente con el subtotal a la vista. **Sin JavaScript** se degrada a cinco líneas fijas con el producto por buscador de texto. Los errores de validación vuelven por línea, con el producto y el motivo (`sin precio`, `otra moneda`, `inactivo`, `repetido`, `total en cero`, `monto demasiado grande`).

**D-8. La ficha del cliente.** **Recomendada**: una tarjeta «Pedidos» con sus cinco últimos pedidos (número, fecha, estado y total) y un enlace a la lista filtrada por ese cliente; para `admin`, «Nuevo pedido» con el cliente ya elegido. Es donde el operador empieza un pedido después de hablar con el cliente.

**D-9. El cliente vaciado.**
- (a) **El vaciado también desactiva la ficha. Recomendada.** Un cliente vaciado no tiene nombre ni teléfono: no hay a quién hacerle un pedido, y el alta ya rechaza a un cliente inactivo. La ingestión no lo resuelve (no tiene teléfono). El runbook lo dice, y un test lo prueba. Reactivarlo a mano sigue siendo posible, a propósito.
- (b) El alta rechaza a un cliente cuyo nombre empiece con «Cliente eliminado». Depende de un texto, y es frágil.

**D-10. La lista.** **Recomendada**: de 25 en 25 como las demás, de la más reciente a la más vieja (`created_at desc, id desc`), con filtro por estado (todos, pendientes, cancelados; los demás aparecen con la 19.3), por cliente (desde la ficha) y búsqueda por número (`P-000123`, `000123` o `123`). Los nombres de los clientes se componen en memoria con `getClientsByIds`, sin `JOIN`. Índices: `(organization_id, created_at desc, id desc)` y `(organization_id, client_id, created_at desc)`; el número ya tiene el suyo por el `UNIQUE`.

**D-11. Qué guarda la auditoría.** **Recomendada**: en el alta, `after` con el número, el id del cliente, la moneda, el total y cada línea (id del producto, cantidad, precio unitario y total); en cada transición, `before` y `after` con el estado. **Ningún nombre ni texto del cliente**: así el vaciado no tiene que alcanzar la auditoría de los pedidos, y un test lo fija.

**D-12. Quién ve la historia del pedido.** **Recomendada**: solo `admin`, como la de productos y clientes. Un `viewer` ve el estado y sus fechas en la cabecera.

**D-13. La revisión independiente.** **Recomendada**: un agente de solo lectura, contra este brief, el ADR 0020 y las reglas vigentes, antes del commit. Es la primera tabla con columnas y transiciones permitidas por trigger, y la primera escritura que cruza tres módulos con un orden de bloqueo.

**D-14. El despliegue a producción.** **Recomendado**: sí, después de la revisión independiente y con la CI del SHA exacto en `success`, según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar. Lleva la migración `0036` y se autoriza aparte, en su turno. Los valores nuevos de enum no se revierten con un rollback de código, pero el código anterior no los lee, así que volver a `0c2f322` sigue siendo seguro.

## Invariantes

- Un pedido nunca se borra; sus líneas nunca cambian ni se borran; su cabecera solo cambia el estado y sus fechas, por las transiciones del ADR 0020. La base lo impide para cualquier rol.
- La serie de números de una organización no tiene huecos ni repetidos: un alta revertida no consume número, y el contador nunca retrocede.
- Los montos de un pedido no cambian después del alta, aunque cambien los precios.
- Ningún pedido ni línea apunta a un cliente o un producto de otra organización.
- Un `viewer` no escribe pedidos y no ve el contacto del cliente; nadie ve costo ni margen en un pedido.
- El stock, `read-v1` e `ingestion-v2` no cambian.
- El dinero y las cantidades nunca pasan por `number`.
- Cada alta y cada transición quedan auditadas en la misma transacción, sin datos personales en el `diff`.

## Criterios de aceptación

- **AC-1 (esquema)**: la migración `0036` crea las tres tablas con sus claves compuestas, `CHECK`, `UNIQUE` e índices, los enums y `order` en `audit_entity_type`. Los privilegios de `crm_app` son los del punto 1 del alcance, y el test de privilegios los clasifica. Con el rol dueño: borrar un pedido o una línea, cambiar una línea, cambiar una columna fija de la cabecera, una transición fuera de la tabla y una fecha que no corresponde a su estado dan `P0001` o la violación del `CHECK`; y, según D-2, también borrar el contador o moverlo de otra forma que +1. Lo prueba un test de integración contra PostgreSQL.
- **AC-2 (numeración)**: el primer pedido de una organización es el 1 y crea la fila del contador; los siguientes, 2, 3…; dos organizaciones tienen series independientes; un alta revertida no consume número; dos altas simultáneas de la misma organización reciben números consecutivos distintos, sin error.
- **AC-3 (alta)**: `createOrder` aplica cada regla del ADR 0020, punto 3, con su resultado: `FORBIDDEN` a un `viewer`; `NOT_FOUND` con un cliente o producto inexistente o de otra organización; `BUSINESS_RULE_VIOLATION` con la regla y la línea para cliente inactivo, producto inactivo, sin precio, otra moneda, producto repetido, total redondeado en cero y monto fuera de `MAX_AMOUNT`; `VALIDATION_ERROR` sin líneas, con más de D-6 líneas o con cantidad inválida; `CONFLICT` con los precios nuevos si cambió un precio esperado (D-5). Un rechazo no escribe nada, ni consume número, ni audita.
- **AC-4 (montos)**: la función del total de línea, con pruebas unitarias: el redondeo con el medio hacia afuera del cero en ARS y en CLP, cantidades con tres decimales, el total en cero, el límite de `MAX_AMOUNT` en la línea y en la suma; el total del pedido es la suma de las líneas. Un test de integración prueba que cambiar el precio después del alta no cambia el pedido.
- **AC-5 (bloqueos)**: el alta bloquea en el orden de D-3. Un test de concurrencia prueba que desactivar el cliente o el producto mientras se crea un pedido termina con un resultado coherente (el pedido se crea con lo que estaba confirmado, o se rechaza), sin deadlock.
- **AC-6 (cancelación)**: `cancelOrder` pasa un pendiente a `cancelled` con `cancelled_at` y audita `status_change`; `FORBIDDEN` a un `viewer`; `NOT_FOUND` de otra organización; un cancelado devuelve `changed: false` sin auditar; dos cancelaciones simultáneas auditan una sola vez. Cancelar no depende del cliente ni de los productos activos.
- **AC-7 (lecturas)**: `listOrders` pagina, filtra por estado y por cliente y busca por número, aislado por organización; `getOrder` devuelve cabecera, líneas y cliente, con el contacto nulo para un `viewer`; la historia es solo de `admin`.
- **AC-8 (auditoría)**: el `diff` del alta y de cada transición tiene la forma de D-11, y un test fija que no contiene el nombre, el teléfono ni ningún texto del cliente.
- **AC-9 (pantallas)**: un end-to-end sobre `next start` con los dos roles: `admin` crea un pedido de dos líneas, ve su número y su total, lo encuentra en la lista y en la ficha del cliente, y lo cancela; un precio cambiado entre la vista y el envío muestra los precios nuevos; un `viewer` ve la lista y el detalle sin contacto y sin los botones, y la página `/pedidos/nuevo` le muestra el acceso denegado. axe sin violaciones en claro y en oscuro, y el formulario se usa con teclado.
- **AC-10 (datos de un cliente)**: la exportación incluye los pedidos y sus líneas; el informe cuenta los pedidos; `--borrar` rechaza un cliente con pedidos y sin conversaciones; `--vaciar` deja los pedidos intactos y, según D-9, desactiva la ficha. Lo prueba `client-data.test.ts`, y el runbook lo dice.
- **AC-11 (guardas)**: `counter-writes` y `order-writes` pasan con el código y fallan con cada uno de sus casos versionados; `exposed-surface` declara las acciones nuevas.
- **AC-12 (contratos)**: `read-api` e `ingestion-v2` pasan sin cambios en sus tests, y `inventory` no tiene cambios en el diff.
- **AC-13**: la batería de la CI completa pasa en local (formato, lint, typecheck, unitarios, guardas, integración y end-to-end) y en la CI del SHA del cierre.
- **AC-14**: la documentación del punto 10 queda actualizada, sin reescribir ninguna decisión anterior.
- **AC-15** (si D-14): producción corre el SHA del cierre con la `0036` aplicada; un `admin` crea y cancela un pedido en la organización del operador, y la lectura del agente de la demostración sigue respondiendo igual.

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-8, AC-10 a AC-12, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-9 (UI ↔ servicio ↔ base) y AC-12 (los contratos que consume el agente, que no cambian).
- `isolated-runtime`: AC-15, si se despliega.
- La batería se corre **desde Git Bash**, y los archivos nuevos van al índice con `git add -N` antes de la batería final.

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada, `inventory`, `src/shared/money/` o `src/shared/quantity/` incluidos;
- el diseño exigiría cambiar el ADR 0020 más allá de la precisión de D-3, o el texto de los ADR 0008, 0013, 0015 o 0019;
- `read-v1`, `ingestion-v2` o el stock tendrían que cambiar;
- un módulo existente tendría que depender de `orders` o de `numbering` (salvo la pantalla de la ficha del cliente, que es de `src/app`);
- aparece una vía por la que un `viewer` escribe un pedido o ve el contacto del cliente, o un dato personal entra al `diff` de la auditoría;
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, y desplegar. Cada una necesita autorización explícita en su turno.

## Resultados — 2026-10-11 (autoevaluación)

Implementado el 2026-10-11. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-13 va aparte.

### Lo que la implementación encontró que el brief no decía

- **`catalog` no tenía una lectura de productos por ids.** El detalle del pedido necesita el nombre de cada producto. Se detuvo el trabajo y **el usuario aprobó el 2026-10-11 sumar `getProductsByIds`** (§Archivos autorizados, ampliación).
- **El seed básico no tiene productos ni clientes** (alcance, punto 9). `seeds/basic.ts` solo crea la organización y los usuarios, igual que en la 18.2, donde el usuario decidió no agregar costos a ningún seed. **No se tocó ningún seed**: los casos que pedía el punto 9 (pendientes, cancelados, varias líneas, un cliente desactivado después del alta) los cubren `orders.test.ts` y `orders.spec.ts`. **Decisión del usuario del 2026-10-11**, como en la 18.2: sin seed de pedidos. El punto 9 del alcance queda corregido así.
- **La auditoría solo admite valores planos** (`audit/service.ts`: texto, número, booleano o nulo). El `diff` del alta de D-11 lleva cada línea con claves numeradas (`line_1_product_id`, `line_1_quantity`, `line_1_unit_price`, `line_1_total`) y la cantidad de líneas en `lines`.
- **Sin JavaScript** (D-7), el cliente se reconoce por su nombre exacto (con las sugerencias de `crm`) y el producto por su SKU exacto (con `searchProducts`). Como quien carga no vio el precio, el esperado es el vigente de ese momento: D-5 protege solo el alta con JavaScript. Lo prueba `orders.spec.ts`, caso 5.
- **El subtotal y el total estimados del formulario** repiten la regla de redondeo del ADR 0019 en `pedidos/estimate.ts`, porque el formulario corre en el navegador y `orders` no se puede importar ahí. `estimate.test.ts` fija los mismos casos que `line-total.test.ts`. El total que vale es el de `orders`, y la pantalla lo dice.
- **El trigger de `orders` también rechaza un alta que no sea pendiente** o que traiga fechas de estado. El ADR dice «alta → `pending`»; el brief no lo pedía en la base. Por eso los tests crean los cancelados cancelándolos.
- **`ON DELETE RESTRICT` responde `23001`** (`restrict_violation`), no `23503`: lo fija `orders-schema.test.ts`.
- **La ficha del cliente lee siempre la zona de la organización**: antes la pedía solo para la auditoría de un `admin`, y la tarjeta de pedidos la necesita para los dos roles.
- **El formulario arranca con cinco líneas** y no envía las vacías, para que sin JavaScript también se puedan cargar varias; con JavaScript se agregan y se quitan hasta 50.
- **Las once specs** que vacían `clients` o `products` suman `orders` y `order_lines` al principio de su `TRUNCATE`.

### Archivos

Todos los tocados están en la lista autorizada, más la ampliación de `catalog`. No se tocaron `inventory`, `src/shared/money/`, `src/shared/quantity/`, ningún seed, `read-v1` ni `ingestion-v2`, ni `src/app/_components/icons.tsx` (alcanzó el ícono `list`).

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `orders-schema.test.ts` (22 casos, con R-1): claves, `CHECK`, índices, privilegios, los tres triggers con el rol dueño y con `crm_app`; `audit.test.ts` e `identity-schema.test.ts` con las tablas nuevas |
| AC-2 | cumplido | `numbering.test.ts`: serie, organizaciones independientes, reversión y ocho altas simultáneas, también la primera vez |
| AC-3 | cumplido | `orders.test.ts`, bloque del alta: cada rechazo con su código, su regla y su línea; ninguno escribe, numera ni audita |
| AC-4 | cumplido | `line-total.test.ts` y `estimate.test.ts`; `orders.test.ts`, el precio cambiado después del alta |
| AC-5 | cumplido | `orders.test.ts`, bloqueos: una desactivación del cliente en curso, un cambio de precio en curso, dos altas con los productos en otro orden y una edición simultánea, y `deactivateClient` simultáneo; desde la revisión independiente (R-4), también un producto desactivado durante el alta; ninguno se traba |
| AC-6 | cumplido | `orders.test.ts`, cancelación: estado y fecha, `changed: false`, roles, organización, sin depender del cliente ni de los productos, un confirmado rechazado y dos cancelaciones simultáneas con una sola auditoría |
| AC-7 | cumplido | `orders.test.ts`, lecturas: lista, filtros, búsqueda por número en cuatro formas, página fuera de rango, detalle por rol sin el teléfono, historia solo de `admin` |
| AC-8 | cumplido | `orders.test.ts`: el `diff` exacto y la ausencia del nombre, el teléfono y el email; `client-data.test.ts`, caso 33 |
| AC-9 | cumplido | `orders.spec.ts`, cinco casos sobre `next start`, con axe en claro y oscuro en cada estado, el buscador con teclado y el alta sin JavaScript |
| AC-10 | cumplido | `client-data.test.ts`, casos 30 a 33, y el runbook |
| AC-11 | cumplido | las dos guardas, con seis mutaciones sobre el código real (abajo); `exposed-surface` con las cuatro acciones |
| AC-12 | cumplido | `read-api` e `ingestion-v2` pasan sin cambios; `inventory` no está en el diff |
| AC-13 | local cumplido; CI pendiente | la batería local, abajo; la CI, con el commit |
| AC-14 | cumplido | DataModel, Overview, FunctionalRequirements (FR-ORD-01 a 07), Screens (14 a 16), TraceabilityMatrix, SecurityModel (83 puntos de entrada), EngineeringStandards (19 guardas) y el runbook |
| AC-15 | pendiente | el despliegue, con su autorización |

**Mutaciones de las guardas nuevas** (EngineeringStandards), cada una agregada al código real, corrida y revertida:

| Mutación | Guarda | Resultado |
|---|---|---|
| SQL literal `update orders` en `crm/repository.ts` | `order-writes` | falla, 1 caso |
| `tx.delete(orders)` en `orders/repository.ts` | `order-writes` | falla, 2 casos |
| `insert into ${orderLines}` en `orders/service.ts` | `order-writes` | falla, 1 caso |
| `tx.update(orderLines)` en una función nueva del repositorio | `order-writes` | falla, 2 casos |
| `tx.update(documentCounters)` en `orders/service.ts` | `counter-writes` | falla, 1 caso |
| `delete from document_counters` en `numbering/repository.ts` | `counter-writes` | falla, 2 casos |
| sin mutación | las dos | 19 y 12 en verde |

**Batería local después de las correcciones de la revisión** (2026-10-11, Git Bash): formato, lint, typecheck y build en verde; 676 unitarios, 542 guardas y 955 de integración. End-to-end en dos tandas sobre `next start`: la 1, 81 de 81 en su segunda corrida (la primera dio 40 fallos sin causa encontrada; antes, el caso 9 de `clients.spec` falló una vez y pasó al repetirlo); la 2, 77 pasados y 1 fallido, el caso 1 de `product-images.spec.ts`, que no toca pedidos; corrido aparte pasó 4 de 4. La tanda 2 tardó 1,1 h contra unos 7 minutos habituales; se atribuye a la máquina, sin comprobarlo. Las intermitencias se declaran, no se explican.

## Revisión independiente — 2026-10-11

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0020 y las reglas vigentes. **Veredicto R1**: 3 hallazgos medios y 4 bajos, ninguno bloqueante. Cada uno se verificó contra el código antes de aceptarlo:

- **R-1 (medio, verificado)**: la base aceptaba un `confirmed_at` en un pedido que nunca se confirmó (al cancelar un pendiente, o después en un cancelado). El `CHECK` no puede atarlo, porque un cancelado pudo pasar o no por `confirmed`. **Corregido** en el trigger de la 0036, con un caso nuevo en `orders-schema.test.ts`.
- **R-2 (medio, verificado)**: `orders` y `numbering` no estaban en el bloque de ESLint que prohíbe a los módulos de dominio importar `next` o `@/app`. **Corregido** con la ampliación del usuario, con cuatro casos en `module-boundary.test.ts`.
- **R-3 (medio, verificado)**: `RepositoryStructure.md` decía «No hay otros módulos». **Corregido** con la ampliación.
- **R-4 (bajo, verificado)**: AC-5 pedía también un producto desactivado durante el alta, y no había test. **Agregado**.
- **R-5 (bajo, verificado)**: la exportación usaba `lpad(number::text, 6, '0')`, que trunca un número de siete dígitos (`P-1234567` salía como `P-123456`). **Corregido**, con el caso 34 de `client-data.test.ts`.
- **R-6 (bajo, verificado)**: `lockClientForOrder` había quedado entre el comentario de `lockClientByPhone` y su función. **Corregido**.
- **R-7 (bajo)**: el seed del punto 9 no se entregó. **Decisión del usuario**: sin seed de pedidos (§Resultados).

Las notas N-1 a N-8 no son defectos: la superficie cierra en 83, no hay `JOIN` nuevo entre módulos en `src/`, no hay un orden de bloqueo que se cruce, el dinero no pasa por `number`, y un `viewer` no recibe el teléfono completo ni el email. N-6 suma un límite a los ya declarados de las guardas de escritura: no ven `MERGE INTO`.
