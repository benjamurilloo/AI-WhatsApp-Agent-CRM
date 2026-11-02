# Brief 24.6.1 — Pedidos

- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe.
- **Tipo de tarea**: `implementation` (rediseño de dos pantallas existentes, con lecturas nuevas).
- **Estado**: **aprobado por el usuario el 2026-11-01, con las recomendaciones.** Las cinco decisiones abiertas quedaron resueltas tal como se recomendaba: grado y batería **entran** (D-6); la imagen del producto **no** (D-7); la medición usa un **fixture propio** y no toca el seed (D-9); el filtro por cliente es un **buscador** (D-11); y la lámina 02, el alta, **queda fuera y abre la 24.6.1-b** (D-12). La **revisión independiente se hace** (D-13).
- **Contrato**: `task-brief.v1`. Los ids `AC-n` los reutiliza la revisión tal cual.

## Objetivo

Llevar a la forma de la v2 **las dos pantallas de Pedidos que ya existen** —el listado y la ficha—
y convertir las cuatro operaciones del pedido (confirmar, señar, entregar y emitir la venta) en
**paneles que abren y cierran por la URL**, con el siguiente paso en el encabezado. Sumar las
**lecturas nuevas** que el rediseño necesita, medidas. Sin migraciones, sin tablas y sin contratos
nuevos.

Lo que esta subfase **no** es: no cambia ninguna regla del pedido. Las transiciones, qué reserva,
qué descuenta, qué pasa con la seña al cancelar y cuándo se puede emitir la venta están decididas
en el [ADR 0020](0020-el-pedido.md), el [ADR 0021](0021-la-venta.md) y el
[ADR 0022](0022-cobros-y-caja.md), y esta subfase las **dibuja mejor, no las toca**. La propia v2 lo
dice: «Entregar no exige que se haya señado o cobrado el total; el rediseño informa lo que falta,
pero no añade ese bloqueo».

## Punto de partida verificado

Leído el 2026-11-01 sobre `078fe43`, el commit que corre en producción.

### El código que ya existe

| Archivo | Líneas | Qué hace hoy |
| --- | --- | --- |
| `pedidos/page.tsx` | 310 | Listado: filtros número + estado (`<select>`) + cliente oculto, tabla de 7 columnas, tarjetas en móvil, paginación de 25 |
| `pedidos/[orderId]/page.tsx` | 452 | Ficha: `DetailHeader` y una grilla de 3 columnas con Líneas + Cliente, Estado, Venta, Señas y auditoría |
| `pedidos/[orderId]/transition-form.tsx` | 170 | Confirmar, entregar y cancelar, cada una con su confirmación en línea; anda sin JavaScript |
| `pedidos/[orderId]/issue-sale.tsx` | 79 | «Emitir venta» con el paso `?confirmar=venta` |
| `pedidos/[orderId]/senar/` | 466 | La seña, hoy en **una página aparte** |
| `pedidos/nuevo/` | 668 | El alta con su buscador de productos y su lista de unidades |
| `pedidos/messages.ts` y `filters.ts` | 455 | Textos y lectura de los filtros |
| `src/modules/orders/service.ts` | 1.574 | El módulo |

**2.961 líneas** sin contar las pruebas, más `tests/e2e/orders.spec.ts` (634) y
`tests/integration/orders.test.ts` (1.143).

### Lo que ya está resuelto y se reutiliza

- **`SubNav`** (`src/app/_components/sub-nav.tsx`) ya **acepta una cantidad por ítem** desde la 24.3
  («Abiertas 12», con el número dentro del nombre accesible). Es exactamente la barra de estados
  con contadores de la lámina 01, y además es lo que la **ficha del cliente usa como pestañas**
  desde la 24.4.1. **No hace falta un componente nuevo.**
- El patrón de pestañas por URL de la ficha del cliente: `clientes/[clientId]/tabs.ts`, enlaces con
  `?pestana=`, y **cada lectura solo en la pestaña que la muestra** (brief-24.4.1, D-1).
- El patrón de panel lateral por URL de la 24.5.3: `<aside>` servido por el servidor, con el cuerpo
  de la pantalla en `inert`, **sin `aria-modal`** porque `inert` cubre el cuerpo y no el marco.
- `MoreActions` y `DetailHeader` (24.1), `StatTile`, `dangerButtonClass` para la cancelación.
- El paso `?confirmar=venta` de la 20.2 ya es, en pequeño, el panel que la lámina 06 dibuja.

### Las fronteras entre módulos, releídas hoy

Releídos con `grep` el [ADR 0020](0020-el-pedido.md), el [ADR 0021](0021-la-venta.md) y
`docs/architecture/DataModel.md`, aunque ya se hubieran leído antes en esta sesión:

- **«Ningún `JOIN` entre módulos»** ([ADR 0020](0020-el-pedido.md) §Fronteras).
- **`orders` depende de `crm`, `catalog`, `inventory`, `numbering`, `organizations` y `audit`**, y
  de `auth` solo en `schema.ts` ([ADR 0020](0020-el-pedido.md)).
- **`orders` no depende de `cash` ni de `sales`.** Es al revés: `sales` depende de `orders`
  ([ADR 0021](0021-la-venta.md)) y `cash` depende de `orders` desde la 21.4. Hoy la ficha compone
  `getOrderReceipts` de `cash` y `getSaleForOrder` de `sales` **en la página**, no dentro de
  `orders`, y así tiene que seguir.

Esto decide una cosa concreta del rediseño: **las tarjetas «Señado» y «Falta» no pueden salir de
una lectura de `orders`**, porque lo señado vive en `cash`. Se componen en la página. Es la misma
restricción que la 24.5.3 tuvo con `sumStockByModel`, y es una condición de detención.

### Lo que el modelo de hoy sí y no tiene

- `repository.countOrders(query)` **ya existe** y ya filtra por estado, cliente y número: los
  contadores son **una consulta agrupada**, no cinco.
- `OrderLineUnit` trae `serial`, `unitPrice` y `status`. **No trae grado ni batería**, que las
  láminas 02 y 07 dibujan como chips. Las dos columnas existen en `stock_units`
  (`battery_health`, el grado por su clave), así que es una **ampliación de lectura**, no un dato
  nuevo (D-6).
- `OrderLine.product` trae `name`, `sku`, `unit` e `isActive`. **No trae la imagen**, que cuatro
  láminas dibujan. Las imágenes existen en `product_images` (17.5), así que también sería una
  ampliación de lectura (D-7).
- **`seeds/volume.ts` no crea ni un pedido.** Siembra organizaciones, usuarios, clientes,
  conversaciones, mensajes, productos, precios, modelos, unidades, inventarios y movimientos. Para
  medir las lecturas nuevas al volumen hay que resolverlo antes (D-9).
- Los **medios de pago son configurables por organización** (`form.paymentMethods`), no los dos
  botones de radio que dibuja la lámina 04.

### Las láminas

[V2-09 · Pedidos](../ui-redesign/v2/19-pedidos/README.md), ocho imágenes:

| # | Lámina | En el alcance |
| --- | --- | --- |
| 01 | Listado y filtros por estado | **sí** |
| 02 | Alta y selección de equipos | **no**: abre la **24.6.1-b** (D-12) |
| 03 | Ficha pendiente y revisión de reserva | **sí** |
| 04 | Señas, recibo previo y previsión | **sí** |
| 05 | Confirmado y revisión de entrega | **sí** |
| 06 | Entregado y revisión de emisión | **sí** |
| 07 | Ficha operativa en móvil | **sí** |
| 08 | Conflictos y decisiones compartidas | **sí**, las tres de Pedidos; las de Ventas van a la 24.6.2 |

**Hallazgo del punto de partida: las cuatro láminas de escritorio de la ficha no dibujan la misma
ficha.** No es una ambigüedad menor, es la estructura:

| | 03 | 04 | 05 | 06 |
| --- | --- | --- | --- | --- |
| Pestañas | sí | sí | **no** | sí |
| Encabezado | `P-000204 · Nadia Castro` + badge | `P-000204` + badge, cliente abajo | `P-000204` + badge, cliente abajo | `Pedido P-000204` + badge, meta en fila |
| Tarjetas de resumen | tres `StatTile` | tres `StatTile` | **ninguna**: una fila de definición | **ninguna**: un recuadro de totales |
| Cronología | no | no | **un stepper** Creado → Confirmado → Entregado | no |
| Columnas de la tabla | Producto · Unidad/IMEI · Cantidad · Precio · Total | — | Equipo · Código · IMEI · Estado de stock · Cantidad · Precio · Subtotal | Código · Producto · IMEI/Serie · Cantidad · Precio · Subtotal |
| El panel | **en línea, al pie** | **lateral, a la derecha** | lateral | lateral |

El texto del README decide por las láminas en lo estructural —«La ficha reúne Resumen, Señas y
Actividad»—, así que **la ficha lleva pestañas** y el stepper de la 05 se va a Actividad (V-1). Las
demás diferencias se resuelven eligiendo una y declarándola, no promediándolas.

## Diferencias con la v2, declaradas antes de implementar

- **V-1 · La ficha lleva pestañas, y el stepper va a Actividad.** La lámina 05 dibuja la ficha sin
  pestañas y con un stepper arriba; las otras tres y el móvil llevan pestañas. Gana el texto del
  README y las tres láminas; el stepper se conserva, dentro de **Actividad**, que es donde el
  README pone la cronología.
- **V-2 · Un solo juego de columnas para la tabla de productos.** Las tres láminas dibujan tres.
  Se adopta **Producto · Unidad / IMEI · Estado de stock · Cantidad · Precio unitario · Subtotal**,
  que es la unión sin repetidos: «Código» e «IMEI» de la 05 son la misma celda que «Unidad / IMEI»
  de la 03, y «Estado de stock» aparece en la 03 (chip «Disponible») y en la 05 (chip
  «Reservada»). En un pedido por cantidad, sin unidades, la columna de unidad queda vacía y
  «Estado de stock» muestra lo disponible de hoy, como ya hace la columna «Disponible» de un
  pendiente (19.3, D-9).
- **V-3 · Un solo encabezado.** Se adopta el de la 06: `Pedido P-000204` + badge de estado, y
  debajo una fila de metadatos con cliente, fecha y origen. Es el único que entra en el teléfono
  sin partir el título, y es el que ya usa `DetailHeader`.
- **V-4 · Los paneles son todos laterales.** La 03 dibuja la confirmación **en línea al pie de la
  página** y las otras tres, a la derecha. Gana el lateral, por tres razones: es el patrón que la
  24.5.3 dejó escrito, es lo que hacen tres de las cuatro láminas, y una confirmación al pie de
  una página larga queda fuera de la pantalla justo cuando hay que leerla.
- **V-5 · «Falta» y «Falta del total» son la misma tarjeta.** La 03 la llama «Falta», la 04 «Falta
  del total», el móvil «Falta». Se adopta **«Falta del total»** en las dos pestañas, que es lo que
  el README define: «la parte no cubierta del pedido, no una obligación de señar el cien por
  ciento».
- **V-6 · Los medios de pago siguen siendo la lista de la organización.** La lámina 04 dibuja dos
  botones de radio, Transferencia y Efectivo. El sistema tiene medios configurables y efectivo
  exige sesión de caja abierta. El panel muestra **los que la organización tenga**; el dibujo es un
  ejemplo con dos, no una decisión de reducirlos.
- **V-7 · El selector «Todos los clientes» no se implementa como un desplegable de todos los
  clientes.** Ver D-11.
- **V-8 · «Se lee: cincuenta dólares» queda fuera.** La lámina 04 lee el importe en palabras. No
  existe en el proyecto ninguna función de número a palabras en castellano, escribirla bien
  —géneros, apócopes, centavos, millones— es trabajo propio y ningún criterio la pide. El importe
  ya se muestra formateado y la previsión «Estimado después de registrar» cumple la función de
  verificación que la lectura buscaba. Queda como pendiente **P-3**.
- **V-9 · La cámara no se incorpora.** El README ya lo dice: «el icono de escaneo no certifica
  acceso a cámara». No aplica, porque el alta quedó fuera (D-12).
- **V-10 · El IMEI se sigue mostrando entero.** El enmascarado de las láminas quedó **fuera de la
  Fase 24 y sin subfase**, por decisión del usuario del 2026-10-31, anotada en el Roadmap. Las
  láminas de este lote lo dibujan enmascarado; esta subfase no lo enmascara ni lo declara resuelto.
- **V-11 · El botón «Ver» por fila se conserva.** Es redundante con el enlace del número, pero es
  **una sola acción** y respeta la regla del README: «No se llenan las filas con botones Confirmar,
  Entregar, Señar y Cancelar». La columna «Acción» lleva solo «Ver».
- **V-12 · Sin la miniatura del producto.** Cuatro láminas dibujan la foto del equipo en las líneas
  y en los paneles. Queda fuera por D-7: la celda muestra el nombre del producto y su descripción
  corta, sin imagen.

## Decisiones

- **D-1 · Los contadores por estado son una lectura nueva en `orders`, de una consulta agrupada.**
  `countOrdersByStatus(context, filters)` devuelve el total por estado **con el mismo ámbito de
  cliente y número que el listado**, como el README exige. Se apoya en la consulta que
  `countOrders` ya arma: es un `GROUP BY status`, **una consulta**, no cinco ni una por estado. El
  total de «Todos» se suma en memoria de los cuatro, sin una sexta consulta.
- **D-2 · La columna «Resumen» del listado se resuelve ampliando `listOrders`, no con una lectura
  aparte.** Hoy `summarize()` ya hace una lectura por lote de clientes; se le suma **una lectura
  por lote de productos** para la primera línea de cada pedido, que es la dirección permitida
  (`orders` → `catalog`) y no es un `JOIN`. El texto es «‹producto› · N equipo(s)» con el nombre de
  hoy del producto de la primera línea y la cantidad total de unidades o de líneas. **Se mide**
  (AC-14).
- **D-3 · «Señado» y «Falta del total» se componen en la página, nunca dentro de `orders`.** Lo
  señado vive en `cash` y `orders` no depende de `cash`. La página pide el pedido a `orders` y los
  recibos a `cash` —como ya hace— y resta. Que esta cuenta termine dentro de una lectura de
  `orders` es **condición de detención**.
- **D-4 · Las pestañas son `SubNav` con `?pestana=`, y cada pestaña lee solo lo suyo.** Resumen,
  Señas y Actividad, igual que la ficha del cliente: enlaces, sin JavaScript, y las lecturas
  condicionadas a la pestaña elegida. **Resumen** no pide la auditoría; **Actividad** no pide los
  recibos.
- **D-5 · Las cuatro operaciones son paneles por URL.** `?confirmar=1`, `?senar=1`, `?entregar=1` y
  `?emitir=1`, con el cuerpo de la página en `inert`, el disparador deshabilitado mientras el panel
  está abierto —que es lo que dibujan la 03 y la 06— y una sola acción primaria por panel. La
  **página `/pedidos/[orderId]/senar` deja de ser una página** y su contenido pasa al panel; la
  ruta se conserva redirigiendo a `?senar=1`, para no romper los enlaces que ya existen en los
  avisos.
- **D-6 · Grado y batería por unidad: `sí`** (*decidido por el usuario el 2026-11-01*). La lámina
  07, que está en el alcance, dibuja los chips «Grado A» y «Batería 88 %». `OrderLineUnit` no los
  trae. Las dos columnas existen en `stock_units` y ampliarlas es una lectura más ancha, sin
  migración: es una lámina del alcance, el dato existe y el costo es una columna más y una unión
  con grados **dentro de `inventory`**, que ya es quien resuelve las unidades. `UnitSummary` suma
  los dos campos y `OrderLineUnit` los expone; **la unión no sale de `inventory`**, que es lo que
  la haría cruzar la frontera.
- **D-7 · La imagen del producto: `no` en esta subfase** (*decidido por el usuario el 2026-11-01*).
  Cuatro láminas dibujan la miniatura del equipo. Existe `product_images` desde la 17.5, pero
  `OrderLine` no la trae y el listado tampoco. Suma una lectura por lote más —en el listado, una
  por página— a cambio de decoración; el pedido se identifica por número, cliente y producto, no
  por la foto. Queda como pendiente **P-1**, para la subfase que decida mostrar imágenes en listas,
  y se declara como diferencia con la v2 al comparar.
- **D-8 · Las tres situaciones de la lámina 08 que son de Pedidos se implementan como mensajes, no
  como pantallas.** «El equipo ya no está disponible» y «Cambió el precio» **ya existen** en el
  servicio y se anuncian con `role="alert"`; lo que cambia es que el rechazo de confirmación nombre
  la unidad y ofrezca «Ver disponibilidad», y que la cancelación diga lo que la lámina dice sobre
  la seña y la reserva, con **«Conservar pedido» como prioridad inicial** y «Cancelar pedido» en
  rojo. «Este pedido ya tiene venta» ya está resuelto desde la 20.2.
- **D-9 · La medición usa un fixture propio y no toca el seed** (*decidido por el usuario el
  2026-11-01*). `seeds/volume.ts` no crea pedidos, así que la medición crea **N pedidos sobre la
  organización que el seed ya siembra**, con su distribución de estados, dentro del propio
  instrumento de medición. Razones: el seed lo comparten cuatro pruebas de integración y una
  guarda de identidad, cambiarlo las toca a todas, y la medición necesita una distribución que el
  seed no tendría por qué fijar. La alternativa —extender `seeds/volume.ts` con pedidos— dejaría el
  volumen disponible para toda la 24.6 y la 24.7, pero **está fuera de cualquier lista cerrada y
  pide autorización aparte**; queda como pendiente **P-5**. Esta es la **tercera vez** que una
  medición choca con que el seed solo ejercita los caminos de las entidades que crea; la nota del
  vault lo tiene registrado.
- **D-10 · `Screens.md` se reescribe en sus secciones 14 y 16**, que hoy describen el listado y la
  ficha anteriores. No se agregan secciones nuevas: las dos pantallas ya están documentadas. La
  sección 15 solo se toca si D-12 entra.
- **D-11 · El filtro por cliente es un buscador, no un desplegable** (*decidido por el usuario el
  2026-11-01*). La lámina 01 dibuja un desplegable «Todos los clientes». Hoy el filtro por cliente
  existe pero **solo llega desde la ficha de un cliente**, por parámetro, y un `<select>` con todos
  los clientes no escala: la organización sembrada tiene miles. Se usa **el mismo combobox de ARIA
  1.2 que el alta** (`pedidos/nuevo`): se parece al dibujo, escala y ya existe en el proyecto, con
  su recorrido sin JavaScript —el cliente se reconoce por su nombre exacto—. El enlace «Ver los de
  todos los clientes» que la ficha del cliente ya produce se conserva.
- **D-12 · La lámina 02, el alta con selección de equipos, queda fuera y abre la 24.6.1-b**
  (*decidido por el usuario el 2026-11-01*). El Roadmap describe la 24.6.1 como «Contadores. Ficha
  con cronología. Paneles para confirmar, señar, entregar y emitir» — **el alta no está nombrada**.
  La lámina 02 es trabajo propio y grande: panel «Elegir unidades» con búsqueda por IMEI, chips de
  unidades elegidas, grado y batería por unidad, campo de escaneo y resumen lateral, sobre las 668
  líneas que el alta ya tiene. Es el mismo caso de la lámina 02 de Productos, que sigue sin subfase
  asignada, y meterla acá haría de esta la subfase más grande de la fase. **La 24.6.1-b hereda**:
  la lámina 02, el panel de unidades, el campo de escaneo, el conflicto de precio al crear
  (lámina 08) y el chip de grado y batería que D-6 deja ya resuelto en la lectura.
- **D-13 · La revisión independiente se hace** (*decidido por el usuario el 2026-11-01*). Las
  Fases 23 a 25 **no abren ni cierran un gate
  de producción**, así que el Roadmap permite cerrar con autoevaluación declarada «salvo que su
  brief diga otra cosa». Este brief dice otra cosa, por evidencia: las cuatro últimas subfases la
  llevaron y las cuatro encontraron defectos reales —**R2, R2, R1 y R2, con diez hallazgos y
  ninguno falso en la última**—, y el más valioso de la 24.5.3 no era el bloqueante. Esta subfase
  toca **transiciones irreversibles y dinero**, que es más riesgoso que cualquiera de las cuatro.

## Alcance

### Incluido

1. **`/pedidos` con la forma de la lámina 01**: encabezado con «Ver ventas» y «+ Nuevo pedido»;
   buscador por número; **barra de estados con contadores** (`SubNav`), que reemplaza el
   `<select>`; tabla **Pedido (número y fecha) · Cliente · Resumen · Estado · Origen · Total ·
   Acción**; la leyenda de los tres estados al pie de la tarjeta; tarjetas en el teléfono; la
   paginación de 25 que ya existe.
2. **La ficha con tres pestañas** por URL: **Resumen**, **Señas** y **Actividad**.
   - **Resumen**: las tres tarjetas (Total del pedido · Señado · Falta del total), la franja de
     estado con lo que el estado significa para el stock, la tabla de productos de V-2, los totales
     y, a la derecha, «Siguiente paso» y «Origen del pedido».
   - **Señas**: las tres tarjetas, la franja de qué pasa con lo señado y la tabla de recibos con su
     estado (vigente o anulado) y su enlace.
   - **Actividad**: el **stepper** Creado → Confirmado → Entregado o Cancelado con sus fechas, y
     debajo la auditoría que hoy existe, **solo para `admin`**.
3. **El siguiente paso en el encabezado**, según el estado, con la tabla de acciones del README:
   pendiente → «Confirmar pedido»; confirmado → «Marcar entregado»; entregado sin venta → «Emitir
   venta»; entregado con venta → «Ver venta»; cancelado → ninguna. «Registrar seña» como acción
   complementaria mientras corresponda, y «Cancelar pedido» **dentro de «Más acciones»**, en rojo.
4. **Los cuatro paneles por URL** (D-5), cada uno con lo que su lámina muestra antes del cambio:
   qué equipo, qué efecto sobre el stock, qué efecto sobre el dinero y qué no se puede deshacer.
5. **Las lecturas nuevas**: los contadores (D-1) y el resumen de productos del listado (D-2), las
   dos medidas.
6. **Las tres situaciones de Pedidos de la lámina 08** (D-8).
7. **`Screens.md` 14 y 16 al día**, la fila del Roadmap y el CHANGELOG.

### Excluido

- **La lámina 02 y toda la pantalla `/pedidos/nuevo`**: son la **24.6.1-b** (D-12).
- **Ventas**: el listado, la ficha, el cobro, la permuta, la anulación y el comprobante son la
  **24.6.2**, y las tres situaciones de Ventas de la lámina 08 van con ella.
- **Cualquier cambio de regla del pedido**: nada de bloquear la entrega por falta de cobro, nada de
  reabrir un cancelado, nada de editar líneas, nada de confirmar parcialmente.
- **El enmascarado del IMEI** (V-10).
- **La imagen del producto** (D-7).
- **La lectura del importe en palabras** (V-8).
- **Migraciones, tablas, columnas y contratos.** El contrato `read-v1` del agente no se toca.
- **El marco, el menú y la búsqueda global.**
- Cualquier archivo fuera de la lista de abajo. Salirse **se para y se pregunta**, sin excepción
  por tamaño: es la regla que falló en la 24.5.1 y que la 24.5.3 volvió a necesitar dos veces.

### Lista cerrada de archivos

**Pantallas** (9):

- `src/app/(autenticado)/pedidos/page.tsx`
- `src/app/(autenticado)/pedidos/messages.ts`
- `src/app/(autenticado)/pedidos/filters.ts`
- `src/app/(autenticado)/pedidos/line-unit-list.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/page.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/transition-form.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/issue-sale.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/senar/page.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/senar/order-receipts-section.tsx`

**Archivos nuevos de la ficha** (4), por el mismo criterio que la ficha del cliente:

- `src/app/(autenticado)/pedidos/[orderId]/tabs.ts`
- `src/app/(autenticado)/pedidos/[orderId]/summary-tab.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/deposits-tab.tsx`
- `src/app/(autenticado)/pedidos/[orderId]/activity-tab.tsx`

**Módulo** (3):

- `src/modules/orders/service.ts`
- `src/modules/orders/repository.ts`
- `src/modules/orders/index.ts`

**Inventario, por D-6** (2): `src/modules/inventory/units.ts` y `src/modules/inventory/index.ts`,
solo para que `UnitSummary` traiga el grado y la batería que la ficha móvil muestra.

**Pruebas** (2): `tests/e2e/orders.spec.ts` y `tests/integration/orders.test.ts`.

**Documentación** (5): `docs/product/Screens.md`, `docs/planning/Roadmap.md`, `CHANGELOG.md`,
`HANDOFF.md` y este brief.

Son **25 archivos**. `src/app/(autenticado)/pedidos/actions.ts` y
`pedidos/[orderId]/senar/actions.ts` **no están en la lista**: las acciones de servidor no deberían
cambiar, porque ninguna regla cambia. Si el panel exige tocarlas, **se para y se pregunta** — que
es exactamente lo que pasó con `modelos/actions.ts` en la 24.5.3.

## Criterios de aceptación

| # | Criterio |
| --- | --- |
| **AC-1** | `/pedidos` muestra, por fila, **número y fecha, cliente, resumen, estado con ícono y texto, origen, total y la acción «Ver»**, verificado con texto y `getBoundingClientRect`, no a ojo |
| **AC-2** | La **barra de estados muestra el contador de cada estado** y el de «Todos», y **cada número coincide con la cantidad de filas** que ese filtro devuelve, comprobado sobre una organización con pedidos en los cuatro estados |
| **AC-3** | Los contadores **respetan el ámbito del listado**: con un cliente o un número filtrado, cuentan solo dentro de ese ámbito, y **nunca suman monedas** |
| **AC-4** | El «Resumen» de una fila nombra el **producto de la primera línea y la cantidad de equipos**, y un pedido de varias líneas no miente sobre cuántas hay |
| **AC-5** | La ficha tiene **tres pestañas por URL** y **cada una pide solo sus lecturas**: Resumen no pide la auditoría y Actividad no pide los recibos, comprobado contando consultas |
| **AC-6** | El **siguiente paso del encabezado** es el que la tabla del README fija para cada uno de los cinco estados, y «Cancelar pedido» vive en «Más acciones», en rojo, con **«Conservar pedido» como prioridad inicial** en su confirmación |
| **AC-7** | Los **cuatro paneles abren y cierran por la URL**, andan **sin JavaScript**, dejan el cuerpo `inert`, y **el disparador queda deshabilitado mientras el panel está abierto**: no hay dos botones activos que ejecuten la misma transición |
| **AC-8** | Cada panel **dice el efecto antes del cambio**: qué equipo, qué pasa con el stock, qué pasa con el dinero y si no se puede deshacer, con los textos de su lámina |
| **AC-9** | **Ninguna regla del pedido cambió**: las pruebas de integración y de ciclo que ya existen pasan **sin modificarse**, salvo las que esta subfase amplíe para las lecturas nuevas |
| **AC-10** | **Las capacidades y los roles siguen mandando**: un `viewer` ve lista, ficha, equipos, precios y recibos **y ningún botón de gestión**, y no ve la auditoría |
| **AC-11** | **La frontera se respeta**: `orders` no importa `cash` ni `sales`, no hay `JOIN` contra tablas ajenas, «Señado» y «Falta del total» se componen en la página y la guarda `module-boundary` pasa |
| **AC-12** | **Sin migraciones**: `npm run db:generate` deja `drizzle/` sin cambios y el recuento sigue en **67** |
| **AC-13** | **Desbordamiento cero a 320, 390, 640, 1082 y 1440 px** en las dos pantallas, **sus tres pestañas y sus cuatro paneles**, y **axe sin violaciones** en claro y en oscuro |
| **AC-14** | **Medición de las dos lecturas nuevas** en §Mediciones, con la cantidad de consultas y el tiempo, y la comprobación de que **el listado no hace una consulta por pedido** |
| **AC-15** | **Comparación visual** contra las láminas 01, 03, 04, 05, 06, 07 y 08, con **cada diferencia numerada y clasificada** en «resuelta», «declarada» (V-1 a V-12) o «nueva» |
| **AC-16** | **Batería local completa en verde**, y **CI en `success` sobre el SHA exacto que se despliega**. Un `cancelled` no es `success` |
| **AC-17** | `Screens.md` 14 y 16 reescritas y la fila del Roadmap al día |
| **AC-18** | Recorrido del usuario sobre producción, anotado con su fecha |
| **AC-19** | **Revisión independiente** (D-13): la hace un agente que no participó, de solo lectura; **cada hallazgo se verifica contra el código antes de aceptarse**, los bloqueantes se resuelven y los no bloqueantes se corrigen o se declaran uno por uno, incluidos los falsos |
| **AC-20** | La ficha móvil muestra, por unidad, **el grado y la batería** (D-6), y la ampliación de `UnitSummary` **no saca la unión de `inventory`** |

## Mediciones requeridas

Por la regla de la Fase 24, **toda lectura nueva que lee por lote se mide**:

1. **Los contadores**: cuántas consultas agrega `/pedidos` y cuánto tardan, con y sin filtro de
   cliente. Si hace **una consulta por estado**, se corrige antes de cerrar: tiene que ser una.
2. **El resumen de productos del listado**: cuántas consultas agrega. Si hace **una por pedido**,
   es un `N+1` sobre 25 filas y se corrige antes de cerrar.
3. **El total de `/pedidos`**, en consultas y en milisegundos, contra el estado de hoy, para saber
   qué cuesta el rediseño.
4. **La ficha, por pestaña**: que Resumen no pague la auditoría ni Actividad los recibos.

El instrumento es el de la 24.5.3 —contar sentencias interceptando `getDb().$client.query` y
escribir el resultado a un archivo, porque vitest se come `console.log`— y **el recuento se imprime
al lado del tiempo**, que es lo que descubrió que la primera medición de la 24.5.3 no medía nada.
El volumen sale de D-9.

## Riesgos

- **El más probable: salirse de la lista cerrada.** La ficha toca cuatro componentes compartidos y
  dos módulos vecinos; `pedidos/actions.ts` está a un paso. Pasó en la 24.5.1 y dos veces en la
  24.5.3.
- **Que una tarjeta de resumen termine adentro de una lectura de `orders`.** Es la frontera, y el
  camino corto es tentador porque la página ya tiene las dos cosas a mano.
- **Que el panel de la seña pierda algo al dejar de ser página.** La página de hoy tiene 466 líneas
  entre validación, medios de pago, sesión de caja y mensajes; el panel tiene que conservarlas
  todas, incluido el recorrido sin JavaScript.
- **Que la comparación visual se haga contra una lámina sola** y no contra las cuatro, dándole a la
  ficha la forma de la que se miró último. V-1 a V-5 existen para que eso no pase.
- **Que las pruebas nuevas no puedan fallar.** Dos de los diez hallazgos de la 24.5.3 fueron eso.
  Cada aserción nueva se demuestra capaz de fallar con una mutación.
- **Que el rediseño cambie una regla sin querer** —por ejemplo, deshabilitar «Marcar entregado»
  porque falta cobrar, que la lámina **no** pide y el README prohíbe explícitamente.

## Condiciones de detención

Se para y se pregunta si:

1. hace falta **una migración, una tabla, una columna o un contrato nuevo**;
2. hace falta **cruzar la frontera**: que `orders` importe `cash` o `sales`, o un `JOIN` contra
   tablas de otro módulo;
3. hace falta **tocar un archivo fuera de la lista cerrada**, incluidos los `actions.ts`;
4. hace falta **cambiar una regla del pedido** o el contrato del agente;
5. una lámina **exige un dato que no existe** y no está ya declarado en §Diferencias;
6. una lectura nueva resulta **`N+1`** y arreglarla pide salir del alcance.

## Nivel de validación objetivo

**Validado en integración**, con el vocabulario del proyecto: cada criterio medible sale de
`getBoundingClientRect`, `getComputedStyle`, del conteo de consultas o de una aserción de texto,
contra el build de producción con PostgreSQL real. Sube a **validado en staging** cuando el usuario
recorra producción (AC-18). **No** alcanza «preparado para producción», que además pide backups
probados, rollback y observabilidad revisados para este cambio.

## Pendientes que esta subfase deja abiertos

- **P-1**: la imagen del producto en las líneas y en el listado (D-7).
- **P-2**: la lámina 02, el alta con selección de equipos: es la **24.6.1-b** (D-12), que hay que
  crear en Notion y en el Roadmap como hermana, no como subtarea, siguiendo el precedente de la
  24.4.3 y de la 24.5.2-b.
- **P-3**: la lectura del importe en palabras (V-8).
- **P-4**: el enmascarado del IMEI, que ya estaba fuera de la fase desde el 2026-10-31 y esta
  subfase no mueve.
- **P-5**: si `seeds/volume.ts` debería sembrar pedidos, ventas y recibos para las subfases de
  Comercial que vienen (D-9). Tercera vez que aparece.
