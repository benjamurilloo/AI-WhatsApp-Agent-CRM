# Brief 24.6.1-b — Pedidos: el alta con selección de equipos

- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe
- **Subfase**: 24.6.1-b, hermana de la 24.6.1 y no subtarea ([Roadmap](../planning/Roadmap.md) §Fases 23 a 28)
- **Tipo de tarea**: `implementation`
- **Tarea en Notion**: `40c702be6f4e81299e0cf72885ff46d8`, en «Esperando» (leído en Notion el 2026-11-02)
- **Estado**: **aprobado por el usuario el 2026-11-02**, con las siete recomendaciones tal como están escritas (D-1, D-2 (a), D-3 (a), D-4, D-5 (a), D-6 sí, D-7 fuera). La aprobación es del alcance: **no** autoriza commit, push, deploy ni cambios en Notion, que se piden en su turno
- **Lámina**: [`02-nuevo-pedido-unidades-v2.png`](../ui-redesign/v2/19-pedidos/desktop/02-nuevo-pedido-unidades-v2.png), con el [README del lote V2-09](../ui-redesign/v2/19-pedidos/README.md) §«Crear y seleccionar equipos» y §«Móvil y accesibilidad» como contrato de diseño

## Objetivo

Rediseñar **`/pedidos/nuevo`**, que ya existe, con la forma de la lámina 02: la elección de los
equipos en un **panel «Elegir unidades»** con buscador, selección múltiple y el precio de cada
unidad a la vista; lo elegido como **chips** en el formulario, con un campo de escaneo o entrada
manual al lado; y el resumen con el total estimado junto a «Crear pedido».

**Ninguna regla del alta cambia.** Qué valida, qué compara el servidor antes de crear, qué pasa con
un precio que cambió y el hecho de que elegir un equipo **no reserva stock** son de la 29.5.2 y del
[ADR 0020](0020-el-pedido.md), y esta subfase no los toca. Lo que cambia es **cómo se eligen los
equipos**.

Es la mitad que la 24.6.1 dejó afuera a propósito (su D-12): meter el alta adentro habría duplicado
su alcance, y la 24.5.1 ya volvió **R2** de la revisión independiente por exceso de alcance.

## Punto de partida verificado

Verificado en el código el 2026-11-02, sobre `main` (`9b1e3a4`), **no de memoria**:

- **`/pedidos/nuevo` son cuatro archivos, 848 líneas**: `page.tsx` (78), `order-form.tsx` (330),
  `line-units.tsx` (260) y `picker.tsx` (180).
- **El selector de equipos de hoy** es un `textarea` de IMEI **uno por renglón** más una lista en
  línea de «Unidades disponibles» con un botón «Agregar» por unidad, que muestra grado, batería y
  precio. Ya tiene mejora progresiva: sin JavaScript se ven los dos campos —cantidad e IMEI— y el
  servicio decide cuál vale por el producto; con JavaScript, el de IMEI reemplaza a la cantidad.
- **El total estimado y «Crear pedido» ya existen**; el subtotal de cada línea hoy es un texto
  dentro de la fila, no un campo.
- **Las unidades las lee** `searchOrderUnitsAction` → `listAvailableUnits` de `inventory`, por su
  interfaz pública. `orders` **ya depende de `inventory`**, que [Overview](../architecture/Overview.md)
  §Reglas de dependencia permite: lo prohibido es el `JOIN` contra tablas ajenas y alcanzar las
  entrañas de otro módulo, no importar su `index.ts`.
- **El borrador vive en estado de cliente**: `order-form.tsx` es `"use client"` y guarda cliente y
  filas en `useState`.
- **`findAvailableUnitsOfProduct` no tiene `LIMIT`**: devuelve todas las unidades disponibles del
  producto, de la más vieja a la más nueva.
- **`stock_units` no tiene código legible**: solo `serial` —el IMEI— y un `id` UUID.
- **No hay helper de enmascarado de IMEI**: las pantallas muestran el serial completo.
- **Las imágenes de producto existen** (`product_images`, `productos/product-image-view.tsx` y el
  handler `/productos/[productId]/imagen`), así que una miniatura es reutilizable, no un desarrollo.
- **`24.6.2 Ventas` es una subfase aparte** y tiene su propia lámina 02 de alta de mostrador.

## Hallazgos que condicionan el alcance

Cinco, todos verificados, y los tres primeros cambian el diseño antes de escribirlo.

- **H-1 · El panel no puede abrirse por la URL.** La convención que la 24.6.1 dejó es que un panel
  se abre y se cierra con `?panel=`, sin JavaScript. **Acá no sirve**: el borrador vive en estado de
  cliente, y una navegación de ruta lo perdería. El README de la v2 lo pide explícitamente —«mensajes
  de carga/error que no borren el borrador»—. El panel de esta subfase es, necesariamente, **un
  diálogo de cliente**, y el camino sin JavaScript tiene que seguir siendo el actual, servido.
- **H-2 · `line-units.tsx` lo comparten `/pedidos/nuevo` y `/ventas/nueva`.** Rediseñar el selector
  ahí toca una pantalla que es de la **24.6.2**, que tiene su propia lámina y su propia comparación
  visual. Es el modo de falla que la 24.5.1 pagó y que el vault registra como «A Shared Component
  Falls Outside a File Allowlist Written Per Screen». `picker.tsx` es peor: lo comparten **siete**
  pantallas, y su tipo de opción es `{ id, label, detail? }`, solo texto.
- **H-3 · El «U-0102» de la lámina es un dato que el modelo no tiene.** No hay código de unidad:
  agregarlo es una columna nueva, y una columna nueva está fuera de una fase que rediseña lo que ya
  existe. Es la lección de la 24.5.3: **un mockup codifica también sus datos de ejemplo**.
- **H-4 · La lectura de disponibles no tiene tope**, y el panel de la lámina agrega un buscador, que
  es justo lo que invita a usarla con muchos equipos. Hoy el costo ya se paga —la lista en línea
  carga lo mismo—, así que el rediseño **no empeora** nada, pero el límite hay que medirlo y
  declararlo en vez de descubrirlo con un cliente real.
- **H-5 · La lámina enmascara el IMEI** («…1422») y la aplicación lo muestra completo. El
  enmascarado es **P-4 de la 24.6.1** y está fuera de la fase por decisión del usuario desde el
  2026-10-31.

## Diferencias con la v2, declaradas antes de implementar

- **V-1 · Las unidades se identifican por su IMEI, no por un código `U-0102`** (H-3). El buscador
  dice «Buscar por IMEI», no «por IMEI o código de unidad».
- **V-2 · El IMEI se muestra completo**, no enmascarado (H-5). Cuando P-4 se haga, se aplica a todas
  las pantallas a la vez y no solo a esta.
- **V-3 · Sin JavaScript no hay panel**: queda el camino actual, el `textarea` de IMEI más la lista
  servida de disponibles (H-1). El README acepta esto: pide que la entrada manual y el lector de
  códigos sigan funcionando sin JavaScript, no que el panel exista sin él.
- **V-4 · El panel no se declara `aria-modal`** y el cuerpo queda `inert`, por el mismo motivo que
  los cinco paneles de la 24.6.1: `inert` cubre el cuerpo de la página, no el marco de la
  aplicación.
- **V-5 · No se dibuja la cámara.** El ícono de escaneo de la lámina es un campo de texto que un
  lector de códigos llena; el README dice explícitamente que no certifica acceso a cámara.
- **V-6 · «Cantidad» y «Subtotal» quedan como campos de solo lectura con el aspecto de la lámina**,
  pero el subtotal sigue siendo un estimado del cliente: **el total definitivo lo calcula el
  servidor** con aritmética exacta, como hoy.

## Decisiones

**Las siete quedaron aprobadas el 2026-11-02 por la recomendación**, sin cambios: D-1, **D-2 (a)**,
**D-3 (a)**, D-4, **D-5 (a)**, D-6 sí y D-7 fuera. Se dejan escritas con sus alternativas porque la
alternativa descartada es parte del registro: explica por qué el código quedó así y qué habría que
revisar si la decisión se reabre.

- **D-1 · El panel es un diálogo de cliente y no una ruta** (H-1). **Recomendado**: aceptarlo y
  declararlo como V-3 y V-4. Diverge de la convención de la 24.6.1 **por una razón de fondo**, no
  por comodidad: aquel panel muestra datos guardados y este edita un borrador que todavía no existe
  en la base. La alternativa —guardar el borrador en la URL o en `sessionStorage` para poder
  navegar— agrega un mecanismo de persistencia que ninguna otra pantalla tiene.
- **D-2 · Qué hacer con `line-units.tsx`, compartido con `/ventas/nueva`** (H-2). **Recomendado:
  (a)** el selector nuevo entra en el componente compartido **detrás de una propiedad que solo
  `/pedidos/nuevo` enciende**; `/ventas/nueva` sigue exactamente como está hasta la 24.6.2, que la
  enciende en una línea. El README de Ventas dice que sus líneas se arman «con los mismos patrones
  de producto, cantidad o equipos de Pedidos», así que la divergencia es **temporal por diseño**.
  Costo declarado: dos conductas conviviendo en un archivo hasta la 24.6.2, y las dos hay que
  probarlas. Alternativas: **(b)** cambiar las dos pantallas ahora, que mete alcance de la 24.6.2
  sin su lámina ni su recorrido; **(c)** duplicar el componente, que obliga a reconverger después.
- **D-3 · La imagen del producto (P-1 de la 24.6.1)**, que la lámina dibuja en el selector de
  producto y en la cabecera del panel. **Recomendado: (a)** solo en **la cabecera del panel**, que
  es un componente nuevo de esta subfase, reutilizando `product-image-view.tsx`, y **no tocar
  `picker.tsx`**, que son siete pantallas y un tipo de opción de solo texto. Así P-1 se cierra
  donde la lámina lo pide sin abrir un frente de siete pantallas. Alternativas: **(b)** también en
  el `Picker`, que habría que ampliar para todas; **(c)** ninguna, y declarar P-1 otra vez.
- **D-4 · La búsqueda dentro del panel es en memoria**, sobre la lista que ya se cargó.
  **Recomendado**: sí. Son **cero consultas nuevas**, y la lista ya viaja entera al navegador hoy.
- **D-5 · El tope de la lectura de disponibles** (H-4). **Recomendado: (a)** no agregar tope en esta
  subfase: **medir** el camino con un producto de muchas unidades y **declarar** el límite como
  pendiente con su número. Agregar paginación al panel es una lectura nueva y una regla nueva, y
  esta subfase rediseña. Alternativa **(b)**: tope y paginación ahora, que es media subfase más.
- **D-6 · Revisión independiente al cerrar.** **Recomendado**: sí. No por el tamaño, que es chico,
  sino por **D-2**: un cambio en un componente compartido con una pantalla que nadie va a recorrer
  en esta subfase es exactamente lo que una autoevaluación no ve.
- **D-7 · Qué hacer con P-3 y P-6 de la 24.6.1** (el importe en palabras, y quién creó el pedido en
  Resumen). **Recomendado**: **fuera**. P-6 es de la ficha, no del alta; P-3 es del recibo. Entran
  cuando tengan su subfase, no de arrastre.

## Alcance

### Incluido

1. **El panel «Elegir unidades»**: cabecera con el producto, su miniatura y su precio; buscador por
   IMEI; el recuento «N disponibles · M seleccionadas»; la lista con casilla por unidad, IMEI,
   grado, batería y precio alineado a la derecha, con la fila elegida resaltada; y el pie con
   «Volver» y «Usar selección».
2. **Los chips de «Equipos seleccionados»** en la fila del producto, cada uno con su IMEI y un
   «Quitar» que **identifica la unidad** en su nombre accesible.
3. **El campo «Escanear o agregar IMEI»**, de entrada manual o por lector, al lado del disparador
   «Elegir unidades».
4. **«Cantidad» y «Subtotal» como campos de solo lectura** con la forma de la lámina.
5. **El aviso «El pedido se crea pendiente. Elegir un equipo no lo reserva.»**, que es información
   que hoy no está y que el ADR 0020 respalda.
6. **«Crear pedido» deshabilitado mientras el panel está abierto**, con el cuerpo `inert`, que es la
   convención AC-7 de la 24.6.1.
7. **El recorrido sin JavaScript**, intacto.

### Excluido

- **`/ventas/nueva`**: es de la 24.6.2 (D-2).
- **`picker.tsx`** y las otras seis pantallas que lo usan (D-3).
- **Cualquier migración, tabla, columna o contrato nuevo**, incluido un código de unidad (H-3).
- **El enmascarado del IMEI** (P-4, fuera de la fase).
- **Tope o paginación de la lectura de disponibles** (D-5).
- **P-3 y P-6 de la 24.6.1** (D-7).
- **Cámara** (V-5).
- **Reservar stock al elegir**: elegir no reserva, y eso no cambia.

## Lista cerrada de archivos

Salirse de esta lista **se para y se pregunta en el turno**, sin excepción por tamaño.

| Archivo | Qué |
|---|---|
| `src/app/(autenticado)/pedidos/nuevo/unit-dialog.tsx` | **nuevo**: el panel «Elegir unidades» |
| `src/app/(autenticado)/pedidos/nuevo/line-units.tsx` | los chips, el campo de escaneo y la propiedad de D-2 |
| `src/app/(autenticado)/pedidos/nuevo/order-form.tsx` | el aviso, el resumen y el disparador deshabilitado |
| `src/app/(autenticado)/pedidos/nuevo/page.tsx` | lo que el panel necesite servido |
| `docs/product/Screens.md` | §15, el alta |
| `docs/planning/Roadmap.md` | la fila de la 24.6.1-b |
| `CHANGELOG.md`, `HANDOFF.md`, este brief | el cierre |
| `tests/e2e/orders.spec.ts` | los casos nuevos |
| *su prueba colocada, si el archivo listado tiene una* | regla general ratificada en la 24.6.1 |

## Criterios de aceptación

- **AC-1 · La forma de la lámina**: el panel tiene cabecera con producto, miniatura y precio,
  buscador, recuento, lista con casillas y pie con dos acciones, verificado **por rol y por texto**.
- **AC-2 · La selección múltiple funciona**: elegir dos unidades y usar la selección deja **dos
  chips**, «Cantidad» en «2 equipos» y el subtotal con la suma de los dos precios.
- **AC-3 · El buscador filtra en memoria y no pide nada**: con el panel abierto, buscar un IMEI
  **no agrega ninguna consulta** —contado, no estimado—.
- **AC-4 · El recuento dice la verdad**. *Enmendado el 2026-11-02*: su segunda mitad —«incluso
  después de quitar un chip con el panel abierto»— **es inalcanzable por diseño y lo vuelve así
  AC-6**: con el panel abierto el cuerpo queda `inert`, así que los botones «Quitar» de los chips no
  se pueden accionar. Los dos criterios se contradicen y se queda con AC-6. Lo que se exige y se
  demuestra es que el recuento coincida con la lista y con los chips **mientras la selección cambia
  dentro del panel**. La revisión independiente lo encontró declarado como cumplido sin prueba
  (N-1), y además midió que, si se alcanzara, el recuento mentiría: la selección se congela al
  montar el panel. El texto original: «N disponibles · M seleccionadas» coincide con la lista y
  con los chips, incluso después de quitar un chip con el panel abierto.
- **AC-5 · Quitar un chip identifica la unidad** en su nombre accesible, y los chips se anuncian con
  producto, IMEI y precio.
- **AC-6 · Con el panel abierto, «Crear pedido» está deshabilitado** y el cuerpo `inert`; con el
  panel cerrado, vuelve a estar activo.
- **AC-7 · El borrador sobrevive**: abrir el panel, usar la selección y cerrarlo **no pierde** el
  cliente, las otras filas ni los valores escritos. Un error del servidor tampoco.
- **AC-8 · Sin JavaScript, el alta sigue andando**: con `javaScriptEnabled: false`, el `textarea` de
  IMEI y la lista servida crean un pedido con una unidad.
- **AC-9 · `/ventas/nueva` no cambió** (D-2): su alta se dibuja y funciona exactamente como antes,
  demostrado con su propia prueba de extremo a extremo.
- **AC-10 · Ninguna regla del pedido cambió**: las pruebas de creación, de precio cambiado y de
  unidad no disponible siguen pasando sin tocarlas.
- **AC-11 · Sin migraciones**: `db:generate` dice «No schema changes» y siguen **67**.
- **AC-12 · Desbordamiento cero y axe limpio** a 320, 390, 640, 1082 y 1440 px, con el panel abierto
  y cerrado, en claro y en oscuro.
- **AC-13 · Comparación visual contra la lámina**, entrada por entrada, con su clase: resuelta,
  declarada, nueva o cosmética aceptada con su motivo.
- **AC-14 · Las mediciones de §Mediciones están hechas y publicadas.**
- **AC-15 · Las conductas nuevas, demostradas capaces de fallar** con mutaciones, cada una
  enrojeciendo la aserción prevista.
- **AC-16 · La batería completa en verde**, con la CI en `success` sobre el SHA desplegado.
- **AC-17 · `Screens.md` §15 y la fila del Roadmap, al día.**
- **AC-18 · Revisión independiente** (D-6), de un agente que no participó, de solo lectura.
- **AC-19 · Recorrido del usuario** sobre producción.

## Mediciones requeridas

1. **Las consultas del alta, antes y después**, contadas. *Enmendado el 2026-11-02, al autorizar la
   ampliación de `pedidos/actions.ts`*: decía «tienen que ser **las mismas**», y con D-3 el camino de
   Pedidos paga **una lectura más**, la de la versión de la imagen. La exigencia vigente es: **las
   mismas para toda pantalla que no dibuje la miniatura**, y una más, declarada con su número, para
   la que sí. Lo encontró la revisión independiente como contradicción interna (N-9). El panel no
   agrega lecturas; reusa la que ya hace `searchOrderUnitsAction`.
2. **El costo de la lectura sin tope** (H-4, D-5), con un producto de **200 unidades disponibles**:
   cuánto tarda la acción y cuántos bytes manda al navegador. El número se publica y se declara como
   el límite conocido.
3. **El ancho a 320 px** con dos chips largos, que es donde los chips desbordan si desbordan.

## Condiciones de detención

Se para y se pregunta si aparece cualquiera de estas:

1. Haría falta una **migración, tabla, columna o contrato nuevo** —por ejemplo, un código de unidad—.
2. Habría que tocar **`picker.tsx`** o cualquier pantalla fuera de `/pedidos/nuevo`.
3. **`/ventas/nueva` cambiaría** de aspecto o de conducta.
4. Alguna **regla del pedido** tendría que cambiar para que la pantalla funcione.
5. El panel **no puede andar sin perder el borrador**, o exigiría un mecanismo de persistencia nuevo.
6. Una diferencia nueva con la v2 **exige un dato que el modelo no tiene**.
7. Haría falta **salirse de la lista cerrada de archivos**.

## Nivel de validación objetivo

**Validado en integración**, con el vocabulario del proyecto: cada criterio medible sale de una
aserción por rol y por texto, de `getBoundingClientRect`, de `getComputedStyle` o del conteo de
consultas, contra el build de producción con PostgreSQL real. Sube a **validado en staging** cuando
el usuario recorra producción (AC-19). **No** alcanza «preparado para producción».

## Ampliaciones de la lista cerrada, autorizadas en el turno

Las dos se pidieron **antes** de escribir el código que las necesitaba, como manda el proyecto.

| Archivo | Por qué | Cuándo |
|---|---|---|
| `src/app/(autenticado)/pedidos/actions.ts` | D-3 pide la miniatura en la cabecera del panel, y la versión de la imagen **no viaja** ni en la sugerencia del producto ni en la unidad: sale de `getProductImageVersions`, que es una lectura aparte | 2026-11-02 |
| `tests/e2e/sales.spec.ts` | AC-9 exige demostrar que `/ventas/nueva` no cambió «con su propia prueba», y la spec **no nombraba** «unidad», «equipo» ni «IMEI» en ninguna de sus 764 líneas: el camino por equipos no tenía cobertura | 2026-11-02 |
| `tests/e2e/units.spec.ts` | **Dos casos preexistentes quedaron rojos** con el rediseño: manejan `/pedidos/nuevo` con el selector viejo —el `textarea` de IMEI y los botones «Agregar el IMEI»—, que ya no existe en esa pantalla. Lo encontró la revisión independiente (B-1); se confirmó corriéndolos | 2026-11-02 |

## Resultado de las mediciones

**1 · Las sentencias del camino de las unidades.** Contadas interviniendo `pool.query` **y** la conexión que devuelve `pool.connect()`, sobre el mismo `getDb()` que usan los servicios.

| | Sentencias |
|---|---|
| `listAvailableUnits` | 2 |
| `getProductImageVersions` | 1 |
| **Pedidos**, que dibuja la miniatura | **3** |
| **Ventas**, que no la dibuja | **2** — las mismas que antes de esta subfase |

La Medición 1 pedía que fueran **las mismas**. Son las mismas para Ventas y **una más** para Pedidos, que es el costo declarado de D-3: una lectura indexada por `productId`, una sola vez por producto elegido, la misma que ya hace la lista de productos. Queda encerrada detrás de la propiedad de D-2, así que ninguna otra pantalla la paga.

**El primer intento de esta medición dio 0 sentencias.** El instrumento intervenía un pool creado con `createDb`, que ningún servicio usa. Es el mismo modo de falla que la 24.6.1 midió y publicó, y `scripts/medir-caminos.ts` advierte por escrito desde la 9.3.

**2 · La lectura sin tope** (H-4, D-5), con **200 unidades disponibles** de un producto:

| | |
|---|---|
| Unidades devueltas | 200 |
| Primera corrida | 10,7 ms |
| Segunda corrida | 5,6 ms |
| La versión de la imagen | 2,1 ms |
| Al navegador | **21.401 bytes** (107 por unidad) |

**El límite conocido, publicado**: a este ritmo, mil unidades de un mismo producto serían unos **107 KB** y unos 30 ms. No hay tope ni paginación, y hoy el costo ya se pagaba —la lista en línea cargaba lo mismo—, así que el rediseño no empeoró nada. Queda como P-1.

**3 · El ancho a 320 px** con dos chips de IMEI completo: el chip más ancho mide **194 px** dentro de un grupo de **212 px**, y el documento no desborda. Lo que quedó **versionado en `tests/e2e/orders.spec.ts`** es la **relación** —que el chip entra en su grupo— y el `console.log` que vuelve a imprimir los dos números en cada corrida; los 194 y los 212 salen de esa corrida, no de una aserción. La revisión independiente señaló además que la relación es difícil de enrojecer, porque el IMEI lleva `break-all` (N-10): **la guarda fuerte del desbordamiento es `anchoDesbordado`**, que sí falla si el documento desborda, y corre en los cinco anchos.

## Comparación visual contra la lámina 02, entrada por entrada

Veintisiete entradas. **Resuelta** = igual a la lámina; **declarada** = diferencia decidida en el brief; **nueva** = algo que la lámina no dibuja; **cosmética aceptada** = diferencia menor, con su motivo.

| # | Entrada de la lámina | Clase | Nota |
|---|---|---|---|
| 1 | Título «Elegir unidades» y botón de cerrar | resuelta | |
| 2 | Miniatura del producto en la cabecera | resuelta | probada cargada, no solo presente |
| 3 | Nombre del producto | cosmética aceptada | lleva el SKU entre paréntesis, que es como lo dejó el buscador de la 19.2, y se trunca |
| 4 | Precio del producto | cosmética aceptada | la lámina escribe «USD 450» y la aplicación «$ 450,00», por `formatMoney`; misma diferencia que la entrada 16 (N-6) |
| 5 | «Buscar por IMEI o código de unidad…» | declarada | V-1: dice «Buscar por IMEI», porque el código no existe |
| 6 | «3 disponibles · 1 seleccionada» | resuelta | |
| 7 | Tarjeta por unidad con casilla | resuelta | |
| 8 | «U-0101» como título de la tarjeta | declarada | V-1: el título es el IMEI |
| 9 | «IMEI …1421», enmascarado | declarada | V-2: completo, hasta que P-4 se haga en todas las pantallas |
| 10 | «Grado A · Batería 91%» | cosmética aceptada | «Batería 91 %», con el espacio que usa el resto del CRM |
| 11 | Precio de la unidad, a la derecha | cosmética aceptada | la posición es la de la lámina; el formato del monto, el de `formatMoney` (N-6) |
| 12 | Fila elegida resaltada | resuelta | |
| 13 | Pie con «Volver» y «Usar selección» | resuelta | |
| 14 | Panel de alto completo, pegado al borde | cosmética aceptada | toma el alto de su contenido y va en el flujo, como los cinco paneles de la 24.6.1 |
| 15 | Miniatura dentro del selector de producto | declarada | D-3: `picker.tsx` lo comparten siete pantallas |
| 16 | «Precio unitario (USD)» con el monto pelado | cosmética aceptada | la etiqueta es «Precio unitario» y el valor «$ 450,00»: `formatMoney` es el único formateador del proyecto y vive fuera de la lista cerrada |
| 17 | «Equipos seleccionados \*» con asterisco | cosmética aceptada | sin asterisco: quién es obligatorio lo decide el producto en el servidor, no el formulario |
| 18 | Chip «U-0102 · IMEI …1422 ✕» | declarada **y** nueva | V-1 y V-2 explican el IMEI completo en lugar del código enmascarado; **el precio dentro del chip la lámina no lo dibuja** y lo pide AC-5, así que esa parte es nueva (N-6) |
| 19 | Ícono de escaneo dentro del campo | cosmética aceptada | sin ícono: no hay uno de escaneo en `icons.tsx` y agregarlo queda fuera de la lista |
| 20 | «Ingresá el IMEI completo» | resuelta | |
| 21 | Botón «Elegir unidades» con ícono | cosmética aceptada | sin ícono, por lo mismo que 19 |
| 22 | «Cantidad» y «Subtotal (USD)» de solo lectura | cosmética aceptada | son campos de solo lectura como la lámina, con la etiqueta «Subtotal» sin «(USD)»: la moneda viaja en el monto (N-6) |
| 23 | «Agregar producto» | declarada | el botón dice «Agregar línea» desde la 19.2; renombrarlo no está en el alcance |
| 24 | Aviso «El pedido se crea pendiente…» | resuelta | |
| 25 | Tarjeta «Total estimado (USD) · USD 450» con «Crear pedido» adentro | cosmética aceptada | dice «Total estimado:», con dos puntos, para que la prueba del alta de la 19.2 siga pasando **sin tocarla** (AC-10) |
| 26 | «Crear pedido» en gris con el panel abierto | resuelta | deshabilitado de verdad, no solo gris |
| 27 | — | nueva | el cuerpo al 60 % de opacidad con el panel abierto: la lámina no lo dibuja, es la convención de la 24.5.3 y la 24.6.1 |

## Revisión independiente (AC-18, D-6)

Hecha el 2026-11-02 por un agente que **no participó del trabajo**, de solo lectura, sobre `d4ab5d9`.
**Veredicto: R2** — un hallazgo bloqueante y once no bloqueantes, **ninguno falso**. Declaró sus
propios límites: sin Bash, así que no pudo correr `git diff`, las pruebas ni `db:generate`, y dijo
dónde eso dejaba un criterio sin verificar. Sí abrió el PNG de la lámina y recorrió las 27 entradas.

**El bloqueante, B-1**, es el que importa: dos casos preexistentes de `tests/e2e/units.spec.ts`
—fuera de la lista cerrada y fuera del cierre— manejan `/pedidos/nuevo` con el selector viejo y
quedaron **rojos**. Se confirmó corriéndolos, no leyéndolos. La causa de que no apareciera antes
está escrita para que no se repita: **la verificación se acotó a las specs que esta subfase tocaba**
—«32 casos entre pedidos y ventas»— y ese recorte es exactamente lo que lo escondió. `units.spec.ts`
cubre las reglas de unidades del pedido, las de la 29.5.2, que el objetivo de este brief declara
intocadas. Se arregló con la tercera ampliación de la lista cerrada, autorizada en el turno.

**La CI de `d4ab5d9` falló con tres casos, no dos.** El tercero, `search.spec.ts`, es un **defecto distinto y también propio**: el caso del alta por equipos enciende la capacidad `serialized_units` en la organización semilla y la spec la apagaba al **empezar** cada caso, nunca al terminar, así que el último la dejaba puesta y **se filtraba al archivo siguiente**. El diálogo de búsqueda global entonces anunciaba «equipos por IMEI» en su alcance —correcto cuando la capacidad está— y `search.spec.ts`, que no la enciende, fallaba. Se apaga ahora en un `afterEach` en las dos specs, que es la convención que `clients.spec.ts` ya usaba con `repairs`. **No lo encontró la revisión ni la verificación local**: lo encontró leer el log de la CI en vez de dar por sentado que las fallas eran las que yo esperaba. Una corrida local de las specs tocadas nunca lo habría mostrado, porque el síntoma aparece en una spec que no se tocó y solo cuando corre después.

Después del hallazgo se buscó el resto del radio: cinco specs nombran `/pedidos/nuevo`
—`clients` y `conversations` solo comprueban el `href` y no abren la pantalla— y los otros cuatro
archivos que usan los locators viejos (`repairs-own-units`, `trade-ins`, `warranty-claims`,
`warranty`) están todos sobre `/ventas/nueva`, que no cambió. **Son cuatro razones más de que D-2
era la decisión correcta**: rediseñar el componente compartido para las dos pantallas habría roto
cuatro specs más.

**Corregidos en el mismo commit que B-1**: N-2 (axe no corría en ninguno de los cinco anchos que
AC-12 nombra, sino a 1280 px; ahora corre en los cinco, con el panel abierto y cerrado, en claro y
en oscuro: veinte corridas), N-3 (una aserción propia que **pasaba por construcción** —un
`getByRole("listitem")` sin ámbito que resolvía a un ítem del menú, así que la medición de ancho se
habría tomado sin un solo chip en pantalla—), N-4 (el nombre del grupo de chips, que lleva el
producto, ahora se comprueba entero: el regex anterior pasaba igual si el producto desaparecía),
N-5 (`HANDOFF.md`, que está en la lista cerrada y seguía diciendo que la 24.6.1-b «necesita su
brief»), N-6 (cuatro entradas de la comparación visual mal clasificadas, todas por el formato del
dinero, más un IMEI mal transcripto), N-7 (**los dos controles nuevos medían ~30 y ~34 px** contra
los 44 que pide el README de la v2; ahora miden 44 y hay una aserción que lo mide), N-9 y N-10.

**Declarados en lugar de corregidos**: N-1 (AC-4 pedía algo que AC-6 vuelve inalcanzable: ver la
enmienda en el criterio), N-8 y N-11 (P-6 y P-7), y N-12, que es el límite honesto de AC-9: la
**conducta** y los **nombres accesibles** de `/ventas/nueva` quedan fijados por su prueba, pero el
«se dibuja exactamente como antes» **no se demostró** —no hay comparación de `getComputedStyle` ni
de captura—, y el comentario que decía «sin un píxel de diferencia» prometía más que eso.

## Recorrido del usuario (AC-19)

Hecho sobre `7eada2a` en producción el 2026-11-02. **Un solo hallazgo, tipográfico**: el campo
«Escanear o agregar IMEI» llevaba `font-mono`, que es la convención del proyecto para un IMEI
—la usan los chips, el `textarea` servido y otros cinco controles—, pero esa clase alcanza
**también al marcador**, y el marcador es prosa en castellano, así que «Ingresá el IMEI completo»
salía en monoespaciada en una pantalla cuyo resto es Manrope.

Es el **único campo del proyecto donde la convención podía verse fallar**: de los seis controles
con `font-mono`, los otros cinco no tienen marcador, así que la regla «el IMEI va en
monoespaciada» nunca se había cruzado con prosa. No es una diferencia con la lámina —la v2 no
fija la tipografía del marcador— ni la habría encontrado axe, el desbordamiento o la comparación
visual entrada por entrada, que compara presencia y texto, no familia tipográfica.

Arreglado con `placeholder:font-sans` sobre el mismo campo, que deja el valor escrito en
monoespaciada y el marcador en la tipografía del sistema. **Queda medido y no afirmado**: la
prueba lee `getComputedStyle` del campo y de su `::placeholder` y exige que difieran, y una
mutación que saca la clase enrojece exactamente esa aserción. Verificado además en el CSS
construido: la regla sale como
`.placeholder\\:font-sans::placeholder{font-family:var(--font-manrope), system-ui, sans-serif}`.

**Falta la recorrida sobre la versión corregida**, que es lo que cierra AC-19.

## Pendientes que esta subfase deja abiertos

- **P-1**: el tope de la lectura de unidades disponibles (D-5). **Medido**: con 200 unidades, 10,7 ms en frío, 5,6 ms en caliente y 21.401 bytes al navegador; mil unidades serían unos 107 KB.
- **P-2**: la miniatura en `picker.tsx` y sus siete pantallas (D-3, alternativa b).
- **P-3**: encender la propiedad de D-2 para `/ventas/nueva`, que es trabajo de la **24.6.2**.
- **P-4**: el enmascarado del IMEI, que sigue fuera de la fase.
- **P-5**: P-3 y P-6 de la 24.6.1, que esta subfase no toma (D-7).
- **P-6**: **«Copiar» el IMEI**, que el README del lote pide junto a «Mostrar» («Debe ofrecer
  Mostrar/Copiar según los permisos y patrones de inventario»). V-2 resolvió «Mostrar» al no
  enmascarar, y «Copiar» **no se implementó ni se había declarado**: cayó entre AC-13, que compara
  contra la lámina —y la lámina no lo dibuja—, y las seis diferencias declaradas. Lo encontró la
  revisión independiente (N-8). Hay un `copy-button.tsx` en `_components` que lo haría barato.
- **P-7**: un **IMEI escrito a mano que no está entre las unidades leídas** cuenta en «M
  seleccionadas» sin ninguna fila marcada en el panel, y no se puede desmarcar desde ahí. No se
  pierde nada —la selección sale intacta— pero roza la primera mitad de AC-4. Sin cobertura: el
  caso que escanea usa un IMEI que sí está en la lista. Lo encontró la revisión independiente
  (N-11).
