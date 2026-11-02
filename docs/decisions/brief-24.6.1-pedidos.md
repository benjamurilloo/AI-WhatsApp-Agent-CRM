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

- **V-13 · Un `viewer` que pide `/senar` llega a la ficha, sin mensaje.** Hasta la 21.4,
  `/pedidos/<id>/senar` era una página con su propia guarda y le decía «Solo un administrador
  puede registrar señas.». Ahora redirige al panel, y el panel **no se le dibuja**: el parámetro
  `panel` se lee solo para un `admin`. Queda la ficha, correcta, sin explicación de por qué no
  hay panel. Se declara en vez de arreglarse porque la alternativa —dibujarle un panel a un
  `viewer` para decirle que no puede— contradice D-5 y la regla de la 24.4.1 de no entregarle al
  `viewer` lo que no va a poder usar. Si molesta en el recorrido, es un pendiente de una línea.

- **V-14 · La barra de estados son pestañas, no pastillas.** La lámina 01 la dibuja como pastillas
  con un punto de color por estado, dentro de la tarjeta de filtros. La implementación usa
  `SubNav`, el mismo componente con el que la 24.3 hizo la bandeja, la 24.4.1 la ficha del
  cliente y la 24.5.2 el Resumen de unidades: pestañas subrayadas con la cantidad en una insignia,
  que ya incorpora al nombre accesible. Se eligió la consistencia con lo que la propia fase viene
  construyendo antes que la forma de esta lámina, y **se declara en vez de callarse**: si el
  recorrido prefiere las pastillas, es un cambio acotado a `pedidos/page.tsx`.
- **V-15 · «Ver ventas →» no se agrega.** La lámina 01 pone un enlace secundario a Ventas en el
  encabezado. El panel lateral ya agrupa Pedidos y Ventas bajo «Comercial», que es de donde la
  propia lámina los cuelga; un atajo más en el encabezado no agrega un destino que no esté a un
  clic.
- **V-16 · Quién creó el pedido no se muestra en Resumen.** Las láminas 03 y 07 dibujan «Carla
  Méndez» en «Origen del pedido» y «Pedido creado por Carla Méndez». `OrderDetail` **no trae el
  usuario que lo creó**: la columna existe en la base, pero exponerla pide ampliar el tipo, el
  repositorio y una lectura de nombres de usuario que hoy vive en `_audit/actor.ts`, fuera de la
  lista cerrada. **El dato no se pierde**: la pestaña Actividad lo muestra en la historia de
  auditoría, que es donde el README dice que vive el actor. Queda como pendiente **P-6**.

- **V-17 · En la cancelación, «Conservar pedido» tiene la prioridad del teclado, no la del
  relleno** (*decidido por el usuario el 2026-11-02, a partir de F-3 de la revisión
  independiente*). El README pide «en cancelación la prioridad inicial es Conservar pedido» y no
  hay lámina de ese panel, solo el texto. Se cumple por **orden del DOM y de tabulación**:
  «Conservar pedido» va primero y recibe el foco antes que el destructivo. Lo que no se invierte
  es el peso visual: «Cancelar pedido» sigue siendo el botón relleno en rojo, que es el patrón de
  las otras confirmaciones destructivas de la aplicación —anular una venta, cancelar una orden de
  compra—. Romperlo acá habría hecho que el mismo gesto se dibujara distinto en dos pantallas.
- **V-18 · El foco no vuelve al disparador al cerrar un panel** (*declarado el 2026-11-02, F-4*).
  El README lo pide. Cerrar un panel es **una navegación de ruta**: el botón «Volver» es un
  `<Link>` a la ficha, no un control que cierra una capa, porque los paneles se abren y cierran
  por la URL a propósito (D-5) y tienen que andar sin JavaScript. Devolver el foco exigiría
  JavaScript y un estado que la pantalla no tiene. Es el mismo límite que la 24.5.3 declaró para
  sus paneles, y el mismo motivo por el que estos no se declaran `aria-modal`.

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

1. **`/pedidos` con la forma de la lámina 01**: encabezado con «+ Nuevo pedido» —«Ver ventas» **no se agrega**: ver V-15, enmendado el 2026-11-02 por la revisión independiente (F-7)—;
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

**Ampliaciones autorizadas por el usuario al implementar**, cada una en su turno:

- **`src/app/(autenticado)/pedidos/client-filter.tsx`** (*2026-11-01*), el combobox del filtro por
  cliente de D-11. La lista no previó que el buscador necesita un componente de cliente propio.
- **`src/app/(autenticado)/caja/exchange.ts`** (*2026-11-02*), una línea: unir el `basePath` con
  `&` cuando ya trae una consulta. Sin eso, los enlaces de moneda del panel de la seña arman
  `?panel=senar?moneda=USD`, que está rota. Los **otros seis** usos del ayudante pasan rutas sin
  consulta, así que para ellos no cambia nada; igual se vuelven a correr sus recorridos.
- **Regla general, decidida el 2026-11-02**: **la prueba colocada de un archivo de la lista entra
  en la lista con él.** Cubre `pedidos/filters.test.ts` y `pedidos/messages.test.ts`, y vale para
  lo que quede de la subfase. Nace de que es la **tercera vez en dos subfases** que la lista,
  escrita pantalla por pantalla, se queda corta con un archivo que viaja pegado a otro que sí
  está: en la 24.5.1 fue un componente compartido y en la 24.5.3, dos archivos.

- **Tres pruebas de extremo a extremo** (*2026-11-02*): `tests/e2e/order-receipts.spec.ts`
  (8 líneas), `tests/e2e/units.spec.ts` (4) y `tests/e2e/sales.spec.ts` (12). Las tres recorren
  pantallas que esta subfase rediseñó y fallaban **por lo mismo**: la operación es ahora un panel
  con sus etiquetas propias —«Confirmar reserva», «Confirmar entrega», «Emitir venta», «Volver»—
  en vez de la pregunta en línea de antes —«Sí, confirmar el pedido», «No, volver»—, las señas
  registradas viven en su pestaña, y `/senar` redirige a `?panel=senar`. **Ninguna regla del
  pedido cambió**: lo que cambió es por dónde se llega. El usuario autorizó las tres, caso por
  caso, el 2026-11-02; eligió no fijar una regla general, a diferencia de lo decidido ese mismo
  día para las pruebas colocadas.

- **Una cuarta prueba de extremo a extremo** (*2026-11-02*): `tests/e2e/accounts.spec.ts`, una
  línea. Miraba el texto de lo que pasa con lo señado al cancelar sobre `/pedidos/<id>`, que
  ahora vive en la pestaña Señas. Apareció al correr la batería completa, después de las tres
  anteriores, y el usuario volvió a autorizarla caso por caso.

- **`src/app/(autenticado)/pedidos/[orderId]/senar/actions.ts`** (*2026-11-02*), una línea.
  Es el archivo que el brief nombraba como el que **no** había que tocar, y la revisión
  independiente encontró por qué sí: su `revalidatePath` apuntaba a la ruta que esta subfase
  convirtió en redirección. El usuario lo autorizó caso por caso. **No cambia ninguna regla**:
  revalida la página donde el formulario vive ahora.

Son **25 archivos** más esas ampliaciones. `src/app/(autenticado)/pedidos/actions.ts` y
`pedidos/[orderId]/senar/actions.ts` **no están en la lista**: las acciones de servidor no deberían
cambiar, porque ninguna regla cambia. Si el panel exige tocarlas, **se para y se pregunta** — que
es exactamente lo que pasó con `modelos/actions.ts` en la 24.5.3.

**Enmienda del 2026-11-02, por la revisión independiente (F-8)**: D-5 hablaba de **cuatro**
paneles y de **un parámetro por operación** (`?confirmar=1`, `?senar=1`, `?entregar=1`,
`?emitir=1`), y AC-7 y AC-13 repiten «los cuatro paneles». La implementación usa **un solo
parámetro con cinco valores** —`?panel=confirmar|senar|entregar|cancelar|emitir`—. Las dos
desviaciones tienen motivo: con un parámetro por operación habría que resolver a mano
`?confirmar=1&entregar=1`, que con uno solo es imposible; y el quinto panel es la cancelación,
que D-8 ya pedía como confirmación propia con «Conservar pedido» y el destructivo en rojo. Donde
D-5, AC-7 y AC-13 dicen «cuatro», léase **cinco**, y donde dicen cuatro parámetros, **uno**.
`Screens.md` y el Roadmap ya documentan la forma implementada.

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
| **AC-11** | **La frontera se respeta**: `orders` no importa `cash` ni `sales`, no hay `JOIN` contra tablas ajenas, «Señado» y «Falta del total» se componen en la página. *Enmendado el 2026-11-02 (F-10)*: el criterio decía «y la guarda `module-boundary` pasa», y **esa guarda no fija esta regla**: permite que un módulo importe la interfaz pública de otro —registra `orders/service` → `@/modules/sales` como permitido— y lo que prohíbe es alcanzar las entrañas ajenas. El [ADR 0020](0020-el-pedido.md) ya lo dice: «Hoy no la fija ninguna guarda (R-2)». La evidencia real es el `grep`: **cero** importaciones de `cash` o `sales` en `src/modules/orders/**`, verificado por la revisión independiente |
| **AC-12** | **Sin migraciones**: `npm run db:generate` deja `drizzle/` sin cambios y el recuento sigue en **67** |
| **AC-13** | **Desbordamiento cero a 320, 390, 640, 1082 y 1440 px** en las dos pantallas, **sus tres pestañas y sus cuatro paneles**, y **axe sin violaciones** en claro y en oscuro |
| **AC-14** | **Medición de las dos lecturas nuevas** en §Mediciones, con la cantidad de consultas y el tiempo, y la comprobación de que **el listado no hace una consulta por pedido** |
| **AC-15** | **Comparación visual** contra las láminas 01, 03, 04, 05, 06, 07 y 08, con **cada diferencia numerada y clasificada** en «resuelta», «declarada» (V-1 a V-18) o «nueva» |
| **AC-16** | **Batería local completa en verde**, y **CI en `success` sobre el SHA exacto que se despliega**. Un `cancelled` no es `success` |
| **AC-17** | `Screens.md` 14 y 16 reescritas y la fila del Roadmap al día |
| **AC-18** | Recorrido del usuario sobre producción, anotado con su fecha |
| **AC-19** | **Revisión independiente** (D-13): la hace un agente que no participó, de solo lectura; **cada hallazgo se verifica contra el código antes de aceptarse**, los bloqueantes se resuelven y los no bloqueantes se corrigen o se declaran uno por uno, incluidos los falsos |
| **AC-20** | La ficha móvil muestra, por unidad, **el grado y la batería** (D-6), y la ampliación de `UnitSummary` **no saca la unión de `inventory`** |

## Comparación visual con la v2 (AC-15)

Del **2026-11-02**, contra las siete láminas del alcance —01, 03, 04, 05, 06, 07 y 08—, leídas
una por una junto a la pantalla implementada. Cada entrada se clasifica en **resuelta** (la
pantalla hace lo que dibuja la lámina), **declarada** (diferencia ya numerada antes de
implementar, V-1 a V-13) o **nueva** (apareció al comparar y se decide acá).

### Lámina 01 · Listado

| # | Qué | Clasificación |
|---|---|---|
| C-1 | Título, subtítulo «Reservas y entregas de clientes.» y «+ Nuevo pedido» | **resuelta** |
| C-2 | Buscador de número con su ícono, y «Todos los clientes» como buscador | **resuelta** / **declarada** (V-7) |
| C-3 | Barra de estados con el contador de cada uno y el ámbito compartido | **resuelta** |
| C-4 | Columnas Pedido (número y fecha), Cliente, Resumen, Estado con ícono y texto, Origen, Total y «Ver» | **resuelta** |
| C-5 | Leyenda de qué compromete cada estado, al pie | **resuelta** |
| C-6 | **La barra de estados son pastillas con un punto de color por estado, dentro de la tarjeta de filtros**; la implementación usa `SubNav`: pestañas subrayadas con la cantidad en una insignia | **nueva → V-14** |
| C-7 | **«Ver ventas →»**, enlace secundario del encabezado | **nueva → V-15** |
| C-8 | La leyenda y la paginación van en la misma fila del pie de la tarjeta; acá la paginación va debajo de la tabla y la leyenda, fuera de la tarjeta | **nueva**, cosmética: se acepta |
| C-9 | «Limpiar filtros» siempre visible; acá aparece solo con un filtro puesto | **nueva**, se acepta: un botón que no hace nada es ruido |

### Lámina 03 · Ficha pendiente y revisión de reserva

| # | Qué | Clasificación |
|---|---|---|
| C-10 | Pestañas Resumen · Señas · Actividad, subrayadas | **resuelta** |
| C-11 | Encabezado `P-000204 · Nadia Castro` + badge | **declarada** (V-3): se adopta el de la 06 |
| C-12 | Acción principal **deshabilitada** mientras el panel está abierto, «Registrar seña» al lado y «···» al final | **resuelta** |
| C-13 | Tres tarjetas: Total del pedido · Señado · Falta | **resuelta** / **declarada** (V-5) por el nombre |
| C-14 | Franja «Pendiente · Todavía no reserva stock.» en ámbar con su ícono | **resuelta** |
| C-15 | «Productos (1)» con «Precios fijados al crear el pedido» a la derecha | **resuelta** |
| C-16 | Columnas de la tabla y «Disponible» como chip bajo el IMEI | **declarada** (V-2) |
| C-17 | Miniatura del producto en la línea | **declarada** (V-12) |
| C-18 | «Siguiente paso» y «Origen del pedido» en la columna derecha | **resuelta** |
| C-19 | Panel de confirmación **en línea al pie**, a lo ancho, con una × para cerrar | **declarada** (V-4) |
| C-20 | Contenido del panel: título, chip del equipo, efecto, «Volver» y «Confirmar reserva» | **resuelta** |
| C-21 | **«Carla Méndez», quién creó el pedido**, en «Origen del pedido» | **nueva → V-16** |
| C-22 | Las tarjetas de la lámina llevan la etiqueta arriba y el número abajo, sin ícono; `StatTile` lleva un ícono a la izquierda | **nueva**, cosmética: `StatTile` es compartido y está fuera de la lista |
| C-23 | La última columna se llama «Total»; acá «Subtotal» | **nueva**, se acepta: «Total» a la derecha de «Total del pedido» en el pie confundía |

### Láminas 04, 05 y 06 · Seña, entrega y emisión

| # | Qué | Clasificación |
|---|---|---|
| C-24 | Pestaña Señas con las tres tarjetas, qué compromete una seña y la lista de recibos | **resuelta** |
| C-25 | Dos botones de radio de medio de pago | **declarada** (V-6) |
| C-26 | «Se lee: cincuenta dólares» | **declarada** (V-8) |
| C-27 | Ficha de la 05 **sin pestañas**, con el stepper arriba | **declarada** (V-1) |
| C-28 | Panel de entrega con el efecto y «no se puede deshacer» | **resuelta** |
| C-29 | Panel de emisión con total, seña, «Faltará cobrar» y las tres afirmaciones | **resuelta** |
| C-30 | Tarjeta «Venta» del entregado | **resuelta**, después de restituirla (ver §Hallazgos, punto 2) |

### Lámina 07 · Ficha móvil

| # | Qué | Clasificación |
|---|---|---|
| C-31 | Pestañas, tres tarjetas y franja, en una columna | **resuelta** |
| C-32 | Chips por unidad: estado de stock, **Grado A** y **Batería 88 %** | **resuelta** (D-6) |
| C-33 | Los chips de la lámina llevan ícono —punto, medalla, batería—; acá son texto con borde | **nueva**, cosmética: se acepta |
| C-34 | La sección se llama «Equipos (1)» en móvil y «Productos (1)» en escritorio; acá «Productos» en los dos | **nueva**, se acepta: un pedido por cantidad no tiene equipos |
| C-35 | «Pedido creado por Carla Méndez» | **nueva → V-16**, el mismo de C-21 |
| C-36 | «···  Más» con ícono **y** texto | **resuelta** en móvil; la 03 lo dibuja solo con el ícono y acá lleva texto en los dos |
| C-37 | Sin desbordamiento horizontal a 390 px, medido | **resuelta** tras el defecto 1 de §Hallazgos |

### Lámina 08 · Conflictos

| # | Qué | Clasificación |
|---|---|---|
| C-38 | Unidad no disponible: identifica la unidad, mantiene Pendiente y no reserva nada | **resuelta** |
| C-39 | «Ver disponibilidad» desde el rechazo | **resuelta**: lleva a la columna «Estado de stock» del Resumen |
| C-40 | Venta ya existente: se enlaza, no se emite otra | **resuelta** |
| C-41 | Cambio de precio al crear | fuera del alcance: es la lámina 02, la **24.6.1-b** |

**Resumen**: **41 entradas**. Dos de ellas —C-2 y C-13— cuentan en dos cubos, porque parte de lo
que la lámina dibuja está resuelto y parte está declarado; por eso los cubos suman 43 y no 41.

| Cubo | Entradas |
|---|---|
| Resueltas | **23** (21 puras + C-2 y C-13) |
| Declaradas de antemano (V-1 a V-13) | **9** (7 puras + C-2 y C-13) |
| Nuevas, adoptadas como diferencia (V-14 a V-16) | **4 entradas**, 3 diferencias: C-21 y C-35 son la misma, V-16 |
| Cosméticas que se aceptan, con su motivo escrito | **6** |
| Fuera del alcance | **1** (C-41, que es la lámina 02) |

*Corregido el 2026-11-02 por la revisión independiente (F-5)*: el resumen decía «24 resueltas, 8
declaradas, 3 nuevas y 6 cosméticas», tres números desviados en uno cada uno y C-41 sin cubo. La
suma cerraba en 41 **porque los errores se compensaban**, que es exactamente el modo de falla que
`CLAUDE.md` registra de la 8.4. Ninguna entrada se resolvió inventando un dato que el modelo no
tiene.

## Hallazgos de la implementación

Cinco defectos propios, encontrados por las pruebas y por la comparación visual de esta subfase, y
corregidos **dentro de la lista cerrada**:

1. **La ficha desbordaba de costado.** Los dos ítems de la grilla de Resumen no llevaban
   `min-w-0`, así que su ancho mínimo era el de la tabla de productos —siete columnas, con los
   chips de grado y batería— en vez de dejarla desplazarse dentro de su `overflow-x-auto`.
   Medido por el barrido de AC-13: **361 px** de desbordamiento a 320 px y **374 px** a 390 px con
   equipos. Es el mismo defecto que la 24.5.1 encontró en el título del encabezado, por tercera
   vez en la fase.
2. **La tarjeta «Venta» del entregado se había perdido.** El rediseño movió «Emitir venta» al
   encabezado y, con eso, dejó de decir si el pedido ya tiene su venta. Un `viewer`, que no ve
   ningún botón, se quedaba sin saberlo. Se restituyó como tarjeta de la columna derecha de
   Resumen, con el texto de la 20.2.
3. **El botón «Registrar seña» desaparecía en la pestaña Actividad.** Se decidía con
   `receipts.open`, y Actividad **no pide los recibos** a propósito (AC-5), así que ahí
   `receipts` es `null` y el botón no se dibujaba. Es el choque de dos criterios del propio
   brief: el encabezado tiene que ser el mismo en las tres pestañas y cada pestaña paga solo sus
   lecturas. Se resolvió decidiéndolo con **el estado del pedido**, que es lo que la tabla de
   acciones del README dice; el panel, que sí lee los recibos, avisa si ya no queda nada por
   cubrir.
4. **«Más acciones» recibía un `<Link>` desnudo**, no envuelto en `<li>` y con clases que no
   eran las de `more-action-styles.ts`. El enlace quedaba fuera del árbol de accesibilidad del
   `<ul role="list">` y el recorrido no lo encontraba. Corregido a la convención de la 24.1 (D-8),
   y el nombre del botón pasó a «Más acciones del pedido», que es lo que esa convención pide.
5. **Había dos «Registrar seña» activos.** El de la tarjeta de recibos seguía apuntando a
   `/senar` —que redirige— y **no** se deshabilitaba con el panel abierto, que es exactamente lo
   que AC-7 prohíbe. Ahora recibe de la página la dirección del panel de su pestaña y se dibuja
   deshabilitado cuando ya está abierto.

También se corrigieron **seis recuentos** de la spec de pedidos: el nombre accesible de un enlace
se compara **por subcadena**, y la columna «Acción» de la lámina 01 agregó un «Ver el pedido
P-000001» que contiene el número. Los `toHaveCount(1)` de la 19.2 pasaron a `exact: true`.

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

## Mediciones

Del **2026-11-02**, contra PostgreSQL real de integración. El volumen es el de D-9: la
organización que `seeds/volume.ts` siembra con 1.000 productos y sus clientes, más **N pedidos
creados por el propio instrumento**, con la distribución 40 % pendiente, 30 % confirmado, 20 %
entregado y 10 % cancelado. Mediana de cinco corridas después de una de calentamiento. El arnés
fue un test temporal que **no se versiona**.

**Las sentencias se contaron, no se estimaron**, interceptando las **dos** vías por las que sale
una consulta: `pool.query` y el cliente que devuelve `pool.connect()`, que es la que usa una
transacción. Esto importa: la primera versión del arnés solo miraba `pool.query` y por eso
`getOrderReceipts` daba **cero** sentencias. Un cero así es la señal de que el instrumento no
mide, no de que la lectura sea gratis — el mismo error que la 24.5.3 cometió midiendo solo el
tiempo. El recuento va **al lado del tiempo** en todas las tablas.

### Las dos lecturas nuevas (AC-14)

| Lectura | 1.000 pedidos | 10.000 pedidos |
|---|---|---|
| `countOrdersByStatus` (sin filtro) | **1** sentencia · 2 ms | **1** sentencia · 3 ms |
| `countOrdersByStatus` (con cliente) | **1** · 1 ms | **1** · 1 ms |
| `listOrders` página 1, con el resumen | **5** · 11 ms | **5** · 40 ms |
| `listOrders` página 1, filtrada por cliente | **5** · 8 ms | **5** · 38 ms |
| Las dos juntas, como las pide `/pedidos` | **6** · 9 ms | **6** · 39 ms |

**Los contadores son una sola sentencia**, no una por estado, que es lo que §Mediciones pedía
comprobar: un `select status, count(*) … group by status`. Con cuatro estados, una por estado
habría dado 4 o 5.

**El resumen no es un `N+1`.** Las cinco sentencias de `listOrders`, desglosadas sobre 25 filas:

1. `select count(*) from orders …` — el total para la paginación.
2. `select … from orders …` — la página, **con las dos subconsultas correlacionadas adentro**:
   el producto de la primera línea y el recuento de equipos. No agregan sentencias.
3. `select … from clients …` — los clientes, por lote (ya estaba).
4. `select … from products …` — los productos de las primeras líneas, por lote. **Es la única
   que agregó el rediseño.**
5. `select … from client_tag_assignments …` — las etiquetas, que viajan con la lectura de
   clientes (ya estaba).

Un `N+1` sobre 25 filas habría dado 27 o más. **Con 25 filas o con una, son cinco.**

**Corrección al punto de partida de este brief**: decía que `/pedidos` pasaba «de 3 a 5»
consultas. Medido, pasa de **4 a 6**: la cuenta vieja no incluía la lectura de etiquetas de
clientes, que ya estaba. El rediseño agrega **dos** sentencias en total —los productos y los
contadores—, no tres.

**El costo del rediseño**: a 10.000 pedidos, `/pedidos` tarda **39 ms** en sus seis sentencias
y a 1.000, **9 ms**. Lo que crece es el `count(*)` sobre la tabla entera, que ya existía; los
contadores agregan 3 ms al peor volumen.

### La ficha, por pestaña (AC-5)

| Lectura | Sentencias | Mediana | Qué pestaña la paga |
|---|---|---|---|
| `getOrder` | **7** | 8 ms | las tres |
| `getOrderReceipts` | **7** | 12 ms | Resumen y Señas, **no** Actividad |
| `listOrderAudit` | **2** | 2 ms | solo Actividad, y solo `admin` |

**Lo que esta tabla sí prueba** es la comparación relativa, que es lo que AC-5 pide: **ninguna
pestaña paga lo de otra**. Resumen no pide la auditoría —2 sentencias— y Actividad no pide los
recibos —7—; un `viewer` en Actividad tampoco paga la auditoría, porque no se le pide.

**Lo que no prueba**, corregido el 2026-11-02 por la revisión independiente (F-15): sumar estas
tres lecturas **no da el costo de la pestaña**. La página hace además `getOrganizationTimezone`
en las tres, `getCredentialSources` cuando el pedido es del agente, y lo que consuma
`requireSession`. Una versión anterior de esta sección decía «Resumen paga 14 sentencias, Señas
14 y Actividad 9»: esos números son la suma de la tabla, no la pantalla.

## Revisión independiente (D-13, AC-19)

Del **2026-11-02**, por un agente que **no participó del trabajo**, con acceso de solo lectura
(Read, Grep y Glob), contra este brief, `CLAUDE.md`, los ADR 0020, 0021 y 0022 y los 25 archivos
del cambio. **Veredicto: R2**, con **2 bloqueantes, 11 no bloqueantes y 2 cosméticos**. El agente
declaró además qué **no** revisó: no ejecutó nada —ni pruebas, ni build, ni axe, ni
`db:generate`—, no pudo hacer `git diff` con sus herramientas, y **no abrió los PNG de la v2**,
así que las seis entradas cosméticas de §Comparación visual quedan sin segunda lectura.

Cada hallazgo se verificó contra el código antes de aceptarse. **Ninguno resultó falso.**

| # | Severidad | Qué | Resolución |
|---|---|---|---|
| F-1 | **bloqueante** | Desde la pestaña Actividad, los paneles de entregar, cancelar y emitir **perdían el bloque de dinero en silencio**: `needsReceipts` era `tab !== "actividad"` y los paneles se abren conservando la pestaña | **corregido**: con un panel abierto los recibos se piden siempre. AC-5 se mantiene para Actividad sin panel. Se agregó el caso que lo habría visto |
| F-2 | **bloqueante** | `senar/actions.ts` revalidaba `/pedidos/<id>/senar`, que desde esta subfase **solo redirige** | **corregido con autorización del usuario** (el archivo está fuera de la lista cerrada): apunta a `/pedidos/<id>`, que es donde el formulario vive ahora |
| F-3 | no bloqueante | «Conservar pedido» no tiene la prioridad **visual** que el README pide | **declarado**: V-17, por decisión del usuario |
| F-4 | no bloqueante | El foco no vuelve al disparador al cerrar un panel | **declarado**: V-18 |
| F-5 | no bloqueante | Los recuentos de §Comparación visual no cerraban: tres cubos desviados en uno y una entrada sin cubo | **corregido**: la tabla de cubos, con la nota de que dos entradas cuentan dos veces |
| F-6 | no bloqueante | Una aserción nueva **no podía fallar**: `expect(strip.icon).not.toBe("")` sobre una unión de literales, y dos `not.toBe("")` que pasaban con los textos cruzados entre estados | **corregido**: cada estado tiene que decir su consecuencia y los cuatro íconos tienen que ser distintos. **Demostrada capaz de fallar**: darle al confirmado el ícono del pendiente la enrojece (3 ≠ 4) |
| F-7 | no bloqueante | §Alcance seguía pidiendo «Ver ventas», que V-15 dejó fuera | **corregido**: enmendado |
| F-8 | no bloqueante | D-5, AC-7 y AC-13 hablan de **cuatro** paneles y de un parámetro por operación; son **cinco** y **uno** | **corregido**: enmienda escrita antes de los criterios |
| F-9 | no bloqueante | `Screens.md` §16 describía la regla vieja del botón de la seña | **corregido**: dice la regla de cada uno de los dos controles |
| F-10 | no bloqueante | AC-11 ofrecía como evidencia que «la guarda `module-boundary` pasa», y **esa guarda no fija esta regla** | **corregido**: el criterio dice ahora que la evidencia es el `grep`, y cita al ADR 0020, que ya lo advertía |
| F-11 | no bloqueante | `.claude/settings.json`, sin seguimiento y fuera de la lista | **no es de esta subfase**: viene de varias atrás, el `HANDOFF` lo registra y el usuario decidió dejarlo así. Los commits se arman con rutas explícitas |
| F-12 | no bloqueante | `HANDOFF.md` quedó con el estado del corte anterior y hoy es falso | **corregido** al cerrar |
| F-13 | no bloqueante | El CHANGELOG no tenía entrada de la 24.6.1, que §Alcance pedía | **corregido** al cerrar |
| F-14 | cosmético | Valor por omisión muerto apuntando a la ruta que redirige | **se deja**: es la defensa de un llamador futuro; el único que hay pasa siempre la dirección |
| F-15 | no bloqueante | Los totales por pestaña de §Mediciones no eran los de la pantalla: omitían `getOrganizationTimezone` y `getCredentialSources` | **corregido**: la sección dice qué prueba la tabla y qué no |
| F-16 | cosmético | AC-1 nombra `getBoundingClientRect` y la evidencia es por rol y por texto | **se acepta**: para *contenido*, el rol y el texto son evidencia más fuerte que un rectángulo. La única medición geométrica es la de AC-13 |

Lo que la revisión **confirmó que está bien**, para que no se vuelva a hacer: la frontera entre
módulos, releída hoy con `grep` y no de memoria; el ámbito compartido de los contadores, con los
dos caminos imposibles —cliente que no es un UUID, número que no parsea— resueltos por el mismo
lugar; que las seis pruebas nuevas de integración muerden y que su preparación por SQL no rompe
`expectStockInvariant`; y que al `viewer` se le cierra del lado del servidor, no de la pantalla.

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
- **P-6**: mostrar en Resumen quién creó el pedido (V-16), que hoy solo está en Actividad.
- **P-5**: si `seeds/volume.ts` debería sembrar pedidos, ventas y recibos para las subfases de
  Comercial que vienen (D-9). Tercera vez que aparece.

## Cierre

**Estado al 2026-11-02: implementada, medida, revisada, desplegada y recorrida.**

| Criterio | Estado |
|---|---|
| AC-1 a AC-4 | **cumplidos**, con prueba de extremo a extremo |
| AC-5 | **cumplido**: cada pestaña paga solo sus lecturas, **contado**; con un panel abierto los recibos se piden siempre, que es la enmienda de F-1 |
| AC-6 a AC-10 | **cumplidos**, con prueba |
| AC-11 | **cumplido**: `grep` con **cero** importaciones de `cash` o `sales` en `src/modules/orders/**`, verificado también por la revisión independiente. *La guarda `module-boundary` no fija esta regla*: ver la enmienda de F-10 |
| AC-12 | **cumplido**: `db:generate` dice «No schema changes», `git status --porcelain drizzle/` vacío y **67** migraciones, contadas el 2026-11-02 contra `crm_production` |
| AC-13 | **cumplido**: desbordamiento cero a 320, 390, 640, 1082 y 1440 px en las dos pantallas, sus tres pestañas y sus cinco paneles, y axe sin violaciones en claro y oscuro |
| AC-14 | **cumplido**: §Mediciones, con el desglose por sentencia a 1.000 y a 10.000 pedidos |
| AC-15 | **cumplido**: §Comparación visual, 41 entradas con su cubo |
| AC-16 | **cumplido**: batería local en verde —typecheck, ESLint y Prettier limpios, **2.212** de `unit` y `guards`, **1.902** de `integration` y la de extremo a extremo en cuatro tandas— **y CI en `success` sobre el SHA desplegado**, `2d4a6fd` (run 41452113369, 33 min 44 s, con los end-to-end **enteros de una sola vez** y «Alcance del cambio» **sin recortar**) |
| AC-17 | **cumplido**: §14 y §16 de `Screens.md` reescritas y la fila del Roadmap |
| AC-18 | **cumplido**: recorrido del usuario sobre producción el 2026-11-02, sin objeciones |
| AC-19 | **cumplido**: §Revisión independiente, R2, quince hallazgos, ninguno falso |
| AC-20 | **cumplido**: los cinco paneles andan sin JavaScript, con dos pruebas servidas |

**Las condiciones de detención no se dispararon**: no hay migración, tabla, columna ni contrato
nuevo; no se cruzó la frontera entre módulos; ninguna regla del pedido cambió; y ninguna diferencia
con la v2 exige un dato que el modelo no tiene.

**Las decisiones que quedaban abiertas las resolvió el usuario** el 2026-11-02: autorizó la línea de
`senar/actions.ts` (F-2), fuera de la lista cerrada, y decidió dejar «Conservar pedido» con la
prioridad del teclado y no la del relleno, que quedó declarada como V-17 (F-3).

### Despliegue

**`2d4a6fd0f16ba519014e1765e46713953a99408f`, en producción desde el 2026-11-02**, autorizado por el
usuario en el turno. Sin migraciones nuevas: siguen **67**, contadas contra `crm_production` y no
contra los archivos del repositorio. Para volver atrás,
**`078fe437f9289656ee39720004a993f79b62ded4`**, anotado en `/var/lib/crm-production/despliegues`
**antes** de desplegar, que es el orden que el runbook pide.

Las **siete verificaciones** de [`deploy/production/README.md`](../../deploy/production/README.md)
pasaron:

| # | Verificación | Resultado |
|---|---|---|
| 1 | Configuración desplegada igual a la versionada | **18 de 18** archivos idénticos, con la cuenta del `ls` coincidiendo con el bucle |
| 2 | Un solo salto de proxy | **una** fila en la ventana de 15 min —la ventana se arrancó **en cero a propósito**—, escrita a las 14:02:57 UTC y leída a las 14:03:34, con la clave **igual** a la del operador y **distinta** de `sha256('sin-proxy')`; el control negativo dejó una clave **distinta** |
| 3 | HSTS | `max-age=31536000; includeSubDomains` sobre HTTPS, **ausente** sobre HTTP, que responde `301` |
| 4 | La aplicación escucha solo en loopback | `LISTEN 127.0.0.1:3000` |
| 5 | El rol de la aplicación no es el dueño de la bitácora | `crm_app_login` ≠ `crm_owner`, con `INSERT=t`, `DELETE=f` y `UPDATE=f` sobre `audit_logs`, leído del catálogo y **sin mandar ninguna escritura destructiva** |
| 6 | Los tres endpoints desde afuera | `401`, `401`, `401`: encendidos y pidiendo token |
| 7 | La organización real sigue en cero | `Vixora 0 / 0 / 0`, con los datos en «Demostración Vixora» e «iPhone Demo» |

El **control negativo del paso 2** volvió a necesitar la variante que el runbook incorporó al cerrar
la 24.5.1-b: el túnel SOCKS siguió bloqueado del lado del operador, así que el intento se corrió
**dentro del droplet contra el dominio público** —nunca contra `localhost`, que saltearía nginx y no
probaría nada de la cadena de proxy—. Dos orígenes dejaron dos claves distintas, que es lo que el
control busca demostrar. **En ningún momento se imprimió ni se versionó una IP ni su hash**: la
comparación se hizo dentro de la shell y lo único que salió fue el veredicto.

Las tres condiciones que hacen válida esa comparación se comprobaron una por una, y no se dieron por
hechas: que la fila fuera **de recién** (37 segundos), que fuera **la única** de la ventana —de ahí
el recuento en cero antes del intento— y que su clave **no** fuera la de `'sin-proxy'`, que es lo
que la aplicación guardaría si no recibiera IP. Es el paso que en esta fase se dio por hecho tres
despliegues seguidos.

Comprobaciones propias de esta subfase, además de las siete: el `HEAD` desplegado es el SHA exacto;
el servicio quedó **activo desde las 14:00:20 UTC con cero reinicios** y el journal **sin una sola
advertencia**; el build pasó **en el primer intento** con el servicio detenido y
`--max-old-space-size=1536`, sin repetirse ni quedarse sin memoria; y `/`, `/pedidos`,
`/productos` y `/clientes` responden **`307` a `/login`** sin sesión, no `500`.

**Recorrido del usuario** sobre producción el 2026-11-02, **sin objeciones** (AC-18). Con esto **los
veinte criterios quedan cumplidos** y la subfase sube a **validado en staging**. Vale decir qué
cerró ese recorrido y qué no: cerró el nivel de validación, que no se infiere de que la CI esté en
verde ni de que el despliegue haya salido bien. **No** alcanza «preparado para producción», que
además pide backups probados, rollback y observabilidad revisados para este cambio, ni cierra los
seis pendientes P-1 a P-6, que siguen abiertos a propósito.

Dos de las tres veces anteriores de esta fase, el recorrido del usuario **encontró defectos** que
los instrumentos de la subfase no habían visto —la 24.5.2 volvió con el desbordamiento horizontal y
las filas demasiado anchas de `/usados`, y la 24.5.1 con el selector de moneda saliéndose de su
tarjeta, que terminó siendo la 24.5.1-b—. Esta vez no, y lo que más probablemente explica la
diferencia es que los cinco defectos propios de esta subfase los encontraron sus propias pruebas
antes del recorrido, no el ojo del usuario después.

