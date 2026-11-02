# Brief 24.6.2 — El alta de mostrador

- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe
- **Subfase**: 24.6.2
- **Tipo de tarea**: `implementation`
- **Estado**: **aprobado el 2026-11-02** por el usuario, con las ocho recomendaciones
- **Base**: `main` en `4fd83df`; producción en `6f5b0ac`, 67 migraciones
- **Láminas**: [02 — Alta de mostrador](../ui-redesign/v2/20-ventas/desktop/02-nueva-venta-mostrador-v2.png)
  y [06 — Alta móvil](../ui-redesign/v2/20-ventas/mobile/06-nueva-venta-mobile-v2.png),
  del lote [V2-09](../ui-redesign/v2/20-ventas/README.md)

## Objetivo

Que `/ventas/nueva` elija los equipos como lo hace `/pedidos/nuevo` desde la 24.6.1-b —panel
«Elegir unidades», chips con precio, campo de escaneo, cantidad y subtotal de solo lectura— y que
tenga el resumen **«Antes de emitir»** que la lámina pone al costado en escritorio y al pie en el
teléfono.

Cierra **P-3 de la 24.6.1-b**: encender para `/ventas/nueva` la propiedad que aquella subfase dejó
apagada a propósito.

**Ninguna regla de la emisión cambia.** Lo que cambia es cómo se eligen los equipos y qué se ve
antes de emitir.

## Punto de partida verificado

Verificado en el código el 2026-11-02, sobre `main` (`4fd83df`), **no de memoria**:

- **`/ventas/nueva` son dos archivos, 419 líneas**: `page.tsx` (78) y `sale-form.tsx` (341).
  `sale-form.tsx` nació «con el del alta del pedido como molde» —lo dice su propio comentario— y
  hoy importa de Pedidos el `Picker`, `LineQuantity`, `LineSerials`, `blankLine`, `estimateRow`,
  `sumEstimates` y los dos buscadores de `pedidos/actions.ts`.
- **La propiedad de D-2 de la 24.6.1-b existe y está apagada acá**: `LineSerials` recibe
  `chooseUnits?` y `LineQuantity` recibe `unitNoun?`; `sale-form.tsx` no pasa ninguna de las dos,
  así que ve exactamente la forma anterior —el `textarea` «IMEI de las unidades» más la lista
  servida de «Unidades disponibles»—.
- **El total estimado, el aviso de monedas distintas y «Emitir venta» ya existen**, al pie del
  formulario y sin tarjeta propia.
- **La tarjeta «Cliente y líneas» la arma `page.tsx`**, no el formulario. En Pedidos la 24.6.1-b la
  movió al formulario, porque el panel va **al lado** de la tarjeta.
- **`/ventas/nueva` ya retira la barra inferior del teléfono**: `hidesBottomBar("/ventas/nueva")`
  devuelve `true` y hay una prueba que lo fija (`nav-links.test.ts:227`).
- **`FormActionBar` existe** (24.1, D-8), con `env(safe-area-inset-bottom)`, y la usan dos
  formularios. El alta de Pedidos **no** la usa.
- **`unsaved-changes-dialog.tsx` y `unsaved-changes.ts` existen** desde la 23.2.
- **Cero lecturas nuevas**: todo lo que «Antes de emitir» muestra ya está en el estado del
  borrador. La lista de unidades la trae `searchOrderUnitsAction`, que ya se llama hoy.
- **La miniatura del panel viene incluida**: `LineSerials` pide la imagen con
  `searchOrderUnitsAction(productId, chooseUnits !== undefined)`, así que encender la propiedad
  también enciende la miniatura de la cabecera del panel, sin tocar nada.
- **`sale-form.tsx` no tiene prueba colocada.**
- **`stock_units` sigue sin código legible** y **no hay helper de enmascarado de IMEI**: los dos
  hallazgos H-3 y H-5 de la 24.6.1-b siguen vigentes tal cual.

## Hallazgos que condicionan el alcance

Tres, verificados, y los dos primeros cambian el diseño antes de escribirlo.

- **H-1 · La 24.6.2 de la tabla del Roadmap son seis láminas, no una.** El lote V2-09 tiene seis
  vistas de Ventas: listado (01), alta de mostrador (02), ficha con cobro y permuta (03), anulación
  (04), comprobante (05) y alta móvil (06). Las tres viñetas de la fila del Roadmap —«cobro y
  origen en la lista», «anulación con su efecto en dinero», «mostrador en escritorio y teléfono»—
  las comprimen, y sus tres lecturas nuevas —saldo por lote, número del origen y vista previa de la
  anulación— **cruzan módulos**: `sales` **no depende de `cash`** ni conoce `service`
  ([Overview](../architecture/Overview.md), fila de `sales`), así que lo cobrado por venta y el
  número de la orden de servicio los tiene que componer la página, por lote y con su medición.
  Entero, el alcance es mayor que el de la 24.6.1, que ya volvió **R2** de la revisión
  independiente. Es la razón de **D-1**.
- **H-2 · Encender la propiedad **no** es «una línea», y su radio de impacto son seis specs.** Lo
  dice así la D-2 de la 24.6.1-b y **es inexacto**, medido ahora:
  - del lado del código, la orquestación del panel vive en `order-form.tsx`, que `/ventas/nueva`
    **no comparte**: el estado `unitsFor`, el cuerpo `inert`, el `<UnitDialog>`, el `byUnit` que
    cambia Cantidad por «Precio unitario» y el botón deshabilitado con el panel abierto. Son unas
    setenta líneas que hay que escribir en `sale-form.tsx`;
  - del lado de las pruebas, **seis specs llenan «IMEI de las unidades» en `/ventas/nueva`**:
    `units.spec.ts` (tres lugares: 482, 491, 615), `trade-ins.spec.ts` (276), `warranty.spec.ts`
    (172), `warranty-claims.spec.ts` (185), `repairs-own-units.spec.ts` (340) y `sales.spec.ts`
    (830). Ese campo **desaparece** cuando la pantalla está hidratada y la propiedad está
    encendida. Las seis van a ponerse rojas.

  Esto es exactamente el modo de falla que la revisión independiente de la 24.6.1-b encontró y que
  el vault registra como *A Redesign's Blast Radius Is Every Spec That Drives the Screen, Not the
  Ones You Edited*. Acá está **medido antes de escribir**, y por eso las seis entran en la lista
  cerrada desde el principio (**D-5**).
- **H-3 · `sales.spec.ts:826-846` prueba que la propiedad está apagada.** Es el caso que la
  24.6.1-b escribió para demostrar que Ventas no cambiaba: llena el `textarea` y afirma
  `not.toContainText("Equipos seleccionados")`. Esta subfase lo vuelve falso **por diseño**. No se
  borra: se invierte (**D-6**).

## Diferencias con la v2, declaradas antes de implementar

El README del lote fija la regla que resuelve la mayoría: las líneas de la venta se arman **«con
los mismos patrones de producto, cantidad o equipos de Pedidos»**. Donde la lámina de Ventas y lo
que quedó implementado en el alta de Pedidos no coinciden, **gana Pedidos** y la diferencia se
declara acá.

- **V-1 · Las unidades se identifican por su IMEI, no por un código `U-0403`.** Hereda H-3 de la
  24.6.1-b: la columna no existe y crearla está fuera de la fase.
- **V-2 · El IMEI se muestra completo**, no enmascarado («…2403»). El enmascarado es P-4 y está
  fuera de la fase por decisión del usuario del 2026-10-31.
- **V-3 · Sin JavaScript no hay panel**: queda el camino servido actual, el `textarea` de IMEI más
  la lista de disponibles. Igual que V-3 de la 24.6.1-b.
- **V-4 · El panel no se declara `aria-modal`** y el cuerpo queda `inert`, por el mismo motivo que
  en la 24.6.1 y la 24.6.1-b: `inert` cubre el cuerpo de la página, no el marco.
- **V-5 · Las líneas siguen siendo «Línea N» con su buscador propio**, no un buscador único
  «Buscar producto o escanear código» arriba con una tarjeta por producto elegido. Es la forma que
  tienen hoy las dos altas, y cambiarla es rehacer el formulario entero, no rediseñar el selector.
- **V-6 · La unidad elegida se muestra como chip**, con su IMEI y su precio, no como la tarjeta
  «Unidad agregada» con miniatura, grado y batería que dibuja la lámina móvil. El chip es la forma
  que la 24.6.1-b dejó en Pedidos.
- **V-7 · El botón dice «Agregar línea»**, no «Agregar producto». Hereda la entrada 23 de la
  comparación de la 24.6.1-b.
- **V-8 · Sin miniatura en la fila del producto.** La hay en la cabecera del panel, que es donde
  la 24.6.1-b la puso (su D-3). P-2 de la 24.6.1-b —la miniatura en `picker.tsx` y sus siete
  pantallas— sigue abierto.
- **V-9 · Sin ícono de escaneo dentro del campo**: no hay uno en `icons.tsx` y agregarlo queda
  fuera de la lista. Hereda la entrada 19.
- **V-10 · Los montos se escriben con `formatMoney`** («$ 480.000,00»), no «ARS 480.000». Hereda la
  entrada 4.
- **V-11 · «Elegir unidades», en plural**, no «Elegir unidad» como escribe la lámina: una línea
  puede llevar varias.

## Decisiones

Ocho. Cada una con su recomendación y, donde la hay, la alternativa que se descarta.

**Las ocho quedaron aprobadas el 2026-11-02 por la recomendación**, sin cambios: D-1 partir, D-2
(a), D-3 tarjeta propia, D-4 sí, D-5 sí, D-6 invertir, D-7 fuera y D-8 sí. Se dejan escritas con
sus alternativas porque la alternativa descartada es parte del registro: explica por qué el código
quedó así y qué habría que revisar si la decisión se reabre.

- **D-1 · Partir la 24.6.2** (H-1). **Recomendado: sí.** Esta subfase es **el alta de mostrador**,
  láminas 02 y 06. El listado, la ficha con sus pestañas, el cobro con permuta, la anulación con su
  efecto en dinero y el comprobante —láminas 01, 03, 04 y 05, y las tres lecturas nuevas que cruzan
  `cash` y `service`— pasan a la **24.6.2-b**, hermana y no subtarea, como la 24.4.3, la 24.5.2-b y
  la 24.6.1-b. Motivos: el tamaño medido en H-1; que esta mitad **no tiene ninguna lectura nueva** y
  la otra tiene tres; y que esta cierra un pendiente abierto y es la continuación natural de lo que
  se acaba de desplegar. **Alternativa**: hacer las seis láminas juntas, que es más alcance que la
  24.6.1 y que la 24.5.1, las dos que volvieron R2 por exceso de alcance.
- **D-2 · Dónde vive la orquestación del panel** (H-2). **Recomendado: (a)** escribirla en
  `sale-form.tsx`, al lado de la de `order-form.tsx`. **Alternativa (b)**: extraerla a un
  componente compartido. Se descarta por ahora porque obliga a reabrir `/pedidos/nuevo`, que está
  cerrado, desplegado y recorrido, para ahorrar duplicación en dos pantallas; y porque las dos
  altas ya son copias deliberadas desde la 20.3. **Costo declarado**: dos orquestaciones parecidas
  en dos archivos, y las dos hay que probarlas. **Disparador de la extracción**: una tercera
  pantalla que la necesite, o que las dos altas dejen de divergir en algo.
- **D-3 · «Antes de emitir» es una tarjeta propia**, columna derecha pegajosa desde `lg` y tarjeta
  al pie en el teléfono, con «Emitir venta» y «Volver sin guardar» adentro. **Recomendado: sí**, es
  lo que dibujan las dos láminas. **Alternativa**: `FormActionBar`, la barra de la 24.1, que es
  correcta en el teléfono y **no** es lo que la lámina de escritorio dibuja; el alta de Pedidos
  tampoco la usa.
- **D-4 · «Volver sin guardar» pregunta si hay algo cargado.** **Recomendado: sí**, reutilizando el
  diálogo de la 23.2 **sin tocarlo**. Si resultara que hay que modificarlo, se para y se pregunta:
  es un componente compartido. **Alternativa**: un enlace pelado, que tira el borrador sin avisar,
  justo lo que el README pide evitar.
- **D-5 · Las seis specs ajenas entran en la lista cerrada desde ahora** (H-2). **Recomendado: sí**,
  y la verificación declarada es **la batería entera**, con su número de casos, no «las specs de
  ventas». **Alternativa**: ampliarlas sobre la marcha, que es literalmente lo que produjo el
  bloqueante de la 24.6.1-b.
- **D-6 · El caso que prueba que la propiedad está apagada se invierte** (H-3). **Recomendado:
  sí**: pasa a probar que en `/ventas/nueva` la forma nueva **sí** está, y el caso gemelo de
  Pedidos queda como está. Así no se pierde la cobertura, cambia de signo.
- **D-7 · Qué se hace con P-1, P-2, P-6 y P-7 de la 24.6.1-b** —el tope de la lectura de
  disponibles, la miniatura del `Picker`, «Copiar» el IMEI y el IMEI a mano que cuenta sin fila
  marcada—. **Recomendado: fuera.** Ninguno es del alta de mostrador: los cuatro son del panel
  compartido y entran cuando tengan su subfase. P-7 se hereda tal cual, porque el panel es el
  mismo.
- **D-8 · Revisión independiente al cerrar.** **Recomendado: sí.** No por el tamaño, que es chico,
  sino por H-2: esta subfase toca seis specs de módulos que no son el suyo, y ese es exactamente el
  radio que una autoevaluación no mira.

## Alcance

### Incluido

1. **El panel «Elegir unidades» en `/ventas/nueva`**, con la conducta que ya tiene en
   `/pedidos/nuevo`: cabecera con miniatura, buscador por IMEI en memoria, recuento «N disponibles ·
   M seleccionadas», casilla por unidad con grado, batería y precio, y pie «Volver» / «Usar
   selección».
2. **Los chips de «Equipos seleccionados»**, con IMEI, precio y un «Quitar» que nombra la unidad.
3. **El campo «Escanear o agregar IMEI»** al lado del disparador, que agrega con Enter sin enviar
   el formulario.
4. **«Cantidad» y «Subtotal» de solo lectura** cuando la línea va por unidad, con el texto de la
   lámina «Derivada de la unidad seleccionada.».
5. **La tarjeta «Antes de emitir»** (D-3): cliente o «Consumidor final», el recuento de equipos, el
   total estimado y los tres avisos de la lámina —que al emitir el equipo pasa a vendido y sale del
   stock, que el cobro se registra después y que la venta emitida no se edita—, con «Emitir venta»
   y «Volver sin guardar».
6. **«Volver sin guardar» con confirmación** si hay algo cargado (D-4).
7. **El cuerpo `inert` y «Emitir venta» deshabilitado** mientras el panel está abierto.
8. **El recorrido sin JavaScript, intacto.**
9. **Las seis specs ajenas**, actualizadas al selector nuevo (D-5), y el caso invertido (D-6).

### Excluido

- **Las láminas 01, 03, 04 y 05** —listado, ficha, cobro con permuta, anulación y comprobante—:
  son la **24.6.2-b** (D-1).
- **Toda lectura nueva**, incluidas las tres que el Roadmap asigna a la 24.6.2: saldo por lote,
  número del origen y vista previa de la anulación. Son de la 24.6.2-b.
- **Cualquier cambio en las reglas de emisión**: qué se valida, qué se rechaza, qué se descuenta y
  en qué orden queda exactamente como está.
- **Cualquier migración, tabla, columna o contrato nuevo.**
- **`/pedidos/nuevo`**, que está cerrado (D-2).
- **`picker.tsx`** y las siete pantallas que lo usan.
- **El enmascarado del IMEI** (P-4, fuera de la fase).
- **Tope o paginación de la lectura de disponibles** (P-1 de la 24.6.1-b sigue abierto).
- **Cámara.**
- **El buscador único de producto con tarjetas** (V-5).

## Lista cerrada de archivos

Salirse de esta lista **se para y se pregunta en el turno**, sin excepción por tamaño.

| Archivo | Qué |
|---|---|
| `src/app/(autenticado)/ventas/nueva/sale-form.tsx` | la propiedad encendida, la orquestación del panel, «Antes de emitir» |
| `src/app/(autenticado)/ventas/nueva/page.tsx` | la tarjeta que pasa al formulario, como en Pedidos |
| `src/app/(autenticado)/ventas/messages.ts` | los textos nuevos del resumen y de la confirmación |
| `tests/e2e/sales.spec.ts` | los casos nuevos y el caso invertido (D-6) |
| `tests/e2e/units.spec.ts` | tres lugares que llenan «IMEI de las unidades» (D-5) |
| `tests/e2e/trade-ins.spec.ts` | ídem |
| `tests/e2e/warranty.spec.ts` | ídem |
| `tests/e2e/warranty-claims.spec.ts` | ídem |
| `tests/e2e/repairs-own-units.spec.ts` | ídem |
| `docs/product/Screens.md` | §19, Nueva venta |
| `docs/planning/Roadmap.md` | la fila de la 24.6.2 y la fila nueva de la 24.6.2-b |
| `CHANGELOG.md`, `HANDOFF.md`, este brief | el cierre |
| *su prueba colocada, si un archivo listado tiene una* | regla general ratificada en la 24.6.1 |

## Criterios de aceptación

| Id | Criterio |
|---|---|
| **AC-1** | En `/ventas/nueva`, una línea con un producto por unidad ofrece «Elegir unidades», y el panel abre con la cabecera, el buscador por IMEI, el recuento, la lista con casillas y el pie de la lámina. La miniatura se prueba **cargada**, no solo presente. |
| **AC-2** | Lo elegido queda como chips con IMEI y precio; «Quitar» nombra la unidad en su nombre accesible y mide al menos 44 px de lado. |
| **AC-3** | «Escanear o agregar IMEI» agrega con Enter **sin enviar el formulario**, y el marcador se dibuja en la tipografía del sistema mientras el valor va en monoespaciada. Se mide con `getComputedStyle`, no se afirma en prosa. |
| **AC-4** | Con unidades elegidas, «Cantidad» y «Subtotal» son de solo lectura y la cantidad dice «N equipos», con el texto «Derivada de la unidad seleccionada.». |
| **AC-5** | Con el panel abierto, el cuerpo queda `inert` y «Emitir venta» deshabilitado de verdad; al cerrar, el foco vuelve al disparador. |
| **AC-6** | «Antes de emitir» muestra el cliente o «Consumidor final», el recuento de equipos, el total estimado y los tres avisos; es columna derecha desde `lg` y tarjeta al pie debajo. |
| **AC-7** | «Volver sin guardar» pregunta si hay cliente o alguna línea cargada, y no pregunta si el formulario está vacío. |
| **AC-8** | Sin JavaScript, `/ventas/nueva` sigue funcionando igual que hoy: `textarea` de IMEI, lista servida de disponibles, cantidad, y la venta se emite. |
| **AC-9** | **Ninguna regla de emisión cambia**: se prueba con al menos dos mutaciones en `sales` que tienen que enrojecer un caso existente, y con el rechazo por stock insuficiente y por monedas distintas intactos. |
| **AC-10** | **`/pedidos/nuevo` no cambia**: un caso de Pedidos lo fija. *Enmendado el 2026-11-02* (§Ampliaciones): el diff toca dos archivos de Pedidos, en tres comentarios y ninguna línea ejecutable; lo que el criterio exige es que su conducta no cambie. |
| **AC-11** | La batería local completa pasa en verde, con su número de casos declarado, y la CI pasa con `conclusion: success` sobre el SHA exacto. No se declara «las specs de ventas»: se declara el total. |
| **AC-12** | Comparación visual contra las láminas **02 y 06**, entrada por entrada, clasificando cada una en resuelta / declarada / nueva / cosmética aceptada. |
| **AC-13** | Accesibilidad: axe sin violaciones en la pantalla y con el panel abierto; 320 px sin desplazamiento horizontal; 200 % de zoom; foco visible; errores asociados. |
| **AC-14** | Medición declarada del costo de encender la propiedad: las sentencias que `/ventas/nueva` paga por producto por unidad antes y después (la 24.6.1-b midió Pedidos 3 y Ventas 2). |
| **AC-15** | Sin migraciones: siguen 67. |
| **AC-16** | Revisión independiente de un agente que no participó, de solo lectura, contra este brief (D-8). |
| **AC-17** | Recorrido del usuario sobre producción, sin objeciones. |

## Ampliaciones de la lista cerrada, autorizadas en el turno

- **`src/app/(autenticado)/pedidos/actions.ts` y `src/app/(autenticado)/pedidos/nuevo/line-units.tsx`**,
  autorizados el 2026-11-02, **solo comentarios**. Encender la propiedad vuelve falsas tres frases
  que esos archivos tienen escritas: `actions.ts` afirma que `/ventas/nueva` no dibuja la miniatura
  y por eso «hace **exactamente las mismas consultas** que antes de la 24.6.1-b», y `line-units.tsx`
  dice dos veces «que es lo que ve `/ventas/nueva` **hasta la 24.6.2**». Dejarlas habría guardado un
  comentario que contradice al código. **Enmienda AC-10**: el diff **sí** toca dos archivos de
  Pedidos, y lo que el criterio exige es que **no cambie su conducta**; lo tocado son tres
  comentarios y ninguna línea ejecutable.

## Mediciones requeridas

Una sola, porque esta subfase **no agrega ninguna lectura**: la de AC-14. Se mide con el contador
de sentencias del proyecto, interceptando `pool.query` **y** el cliente de `pool.connect()` sobre
el singleton `getDb()`, como en la 24.6.1-b.

## Condiciones de detención

Se para y se pregunta, en el turno, si:

- hace falta tocar un archivo fuera de la lista cerrada, **sin excepción por tamaño**;
- algo del alcance exige una migración, una columna o un contrato nuevo;
- el diálogo de cambios sin guardar de la 23.2 no sirve sin modificarlo (D-4);
- una de las seis specs ajenas falla por un motivo que **no** es el selector nuevo: eso sería un
  defecto que esta subfase destapó, no uno que causó, y se decide aparte;
- la batería local no puede correrse completa.

## Nivel de validación objetivo

**Validado en staging**, con el recorrido del usuario sobre producción (AC-17). No certifica
«preparado para producción».

## Ubicación en la fase

- **Necesario ahora**: todo lo incluido. Cierra P-3 de la 24.6.1-b y deja las dos altas con la
  misma forma, que es lo que el README del lote pide.
- **Requisito antes de producción**: nada nuevo; el alta de mostrador ya está en producción y esta
  subfase la rediseña.
- **Mejora posterior**: la 24.6.2-b (listado, ficha, cobro, anulación y comprobante), y los cuatro
  pendientes heredados de la 24.6.1-b (D-7).

## Resultado de las mediciones

**1 · Las sentencias del camino de las unidades (AC-14).** Contadas interviniendo `pool.query` **y**
la conexión que devuelve `pool.connect()`, sobre el mismo `getDb()` que usan los servicios, con un
arnés temporal que se borró después de medir.

| | Sentencias |
|---|---|
| `listAvailableUnits` | 2 |
| `getProductImageVersions` | 1 |
| Las dos juntas | 3 |
| **`/ventas/nueva` antes de esta subfase** | **2** |
| **`/ventas/nueva` desde esta subfase** | **3** |

El costo de encender la propiedad es **una sentencia más por producto por unidad elegido**: la
versión de la imagen, que el panel dibuja en su cabecera. Es una lectura indexada por `productId`,
una sola vez por producto, la misma que ya hace la lista de productos. Es exactamente el número que
la 24.6.1-b declaró para Pedidos, y ahora las dos altas pagan lo mismo.

**2 · El barrido de anchos encontró un defecto real (AC-13).** A **1024 px**, con el panel abierto,
el documento desbordaba **32 px**. La causa: la columna derecha se había escrito `lg:w-80` (320 px)
y el panel que vive en ella es `lg:w-96` (384 px) y `shrink-0`, así que se salía de su columna. Se
corrigió igualando la columna al panel. **No lo vio la vista: lo midió `scrollWidth - clientWidth`**
en los cinco anchos, que es la razón de tener el barrido y no una mirada.

## Comparación visual contra las láminas 02 y 06, entrada por entrada

Treinta y cuatro entradas, sobre capturas reales de la pantalla construida. **Resuelta** = igual a
la lámina; **declarada** = diferencia decidida en el brief; **nueva** = algo que la lámina no
dibuja; **cosmética aceptada** = diferencia menor, con su motivo.

### Lámina 02 — escritorio

| # | Entrada de la lámina | Clase | Nota |
|---|---|---|---|
| 1 | Migas «Comercial › Ventas» | resuelta | |
| 2 | «← Volver a ventas» | resuelta | |
| 3 | Título «Nueva venta» con «Venta sin pedido.» | cosmética aceptada | el subtítulo es el de la 20.3: «La venta se numera al emitirla y descuenta el stock disponible. No se puede modificar.» |
| 4 | «Cliente (opcional)» con buscador | resuelta | |
| 5 | «Sin cliente: Consumidor final.» | cosmética aceptada | dice «Vacío, la venta es a «Consumidor final».», el texto de la 20.3 |
| 6 | Ícono de persona, «✕» y chevron dentro del campo de cliente | cosmética aceptada | el `Picker` es un campo de texto con lista; agregarle adornos es tocar un componente de siete pantallas |
| 7 | «Buscar producto o escanear código», un buscador único arriba | declarada | V-5: las líneas siguen siendo «Línea N» con su buscador propio |
| 8 | Tarjeta del producto con miniatura, «U-0403 · IMEI …2403 · Grado A · Batería 89%» y «✕» | declarada | V-1, V-2, V-5, V-6 y V-8: la línea es un `fieldset`, el equipo va como chip con su IMEI completo y su precio, y la miniatura vive en la cabecera del panel |
| 9 | «Precio vigente del producto» bajo el nombre | declarada | el precio está, en su campo «Precio unitario»; la leyenda no se agrega |
| 10 | Ícono de escaneo dentro del campo | cosmética aceptada | V-9: no hay uno en `icons.tsx` |
| 11 | «Ingresá el IMEI completo» | resuelta | y el marcador va en la tipografía del sistema, medido |
| 12 | «Elegir unidad», enlace a la derecha del campo | declarada | V-11: es un botón y dice «Elegir unidades», en plural |
| 13 | «Cantidad» de solo lectura con «1» | cosmética aceptada | dice «1 equipo», que es la palabra de la lámina en el resumen |
| 14 | «Derivada de la unidad seleccionada.» | resuelta | vive en `sale-form.tsx` y no en el componente compartido, porque la lámina de Pedidos no la dibuja |
| 15 | «Subtotal» de solo lectura | resuelta | |
| 16 | «+ Agregar producto» | declarada | V-7: «Agregar línea», como desde la 19.2 |
| 17 | Tarjeta «Antes de emitir» en la columna derecha | resuelta | |
| 18 | Fila del cliente con su ícono | resuelta | |
| 19 | «1 equipo» con ícono de teléfono | resuelta | y cuando no hay equipos cuenta líneas |
| 20 | «Total estimado» con el monto grande a la derecha | cosmética aceptada | dice «Total estimado:», con dos puntos, para que la prueba del alta de la 20.3 siga pasando **sin tocarla** |
| 21 | Los tres avisos con sus íconos | resuelta | |
| 22 | «Emitir venta», primario y a todo el ancho | resuelta | vive fuera del `<form>` y lo alcanza por el atributo `form` |
| 23 | «Volver sin guardar», secundario | resuelta | y pregunta si hay algo cargado |
| 24 | — | nueva | la columna derecha es pegajosa desde `lg`; la lámina no dibuja desplazamiento |
| 25 | Una sola línea de producto dibujada | declarada | el formulario arranca con cinco líneas desde la 19.2, para que sin JavaScript se puedan cargar varias |
| 26 | — | nueva | el panel «Elegir unidades» ocupa la columna derecha arriba del resumen: la lámina 02 de Ventas no lo dibuja, y es el de la 24.6.1-b |
| 27 | — | nueva | el cuerpo al 60 % de opacidad con el panel abierto, convención de la 24.5.3 y la 24.6.1 |

### Lámina 06 — teléfono

| # | Entrada de la lámina | Clase | Nota |
|---|---|---|---|
| 28 | Una columna de tarjetas | resuelta | |
| 29 | Sin barra global durante el alta | resuelta | ya lo hacía: `hidesBottomBar("/ventas/nueva")` desde la 24.1 |
| 30 | «Producto» como selector con miniatura | declarada | V-8 |
| 31 | Tarjeta «Unidad agregada» con miniatura, grado, batería, precio, «1 equipo» y «Quitar unidad» | declarada | V-6: es un chip con el IMEI y el precio, la forma que la 24.6.1-b dejó en Pedidos |
| 32 | Barra de acciones fija al pie con los dos botones | cosmética aceptada | los dos botones van dentro de «Antes de emitir», que en el teléfono queda al pie y se desplaza con la página; `FormActionBar` se descartó en D-3 porque la lámina de escritorio los pone en la tarjeta |
| 33 | «Vacío: Consumidor final.» | cosmética aceptada | igual que la entrada 5 |
| 34 | «Al emitir sale 1 equipo del stock. El cobro se registra después.», condensado | declarada | se usan los tres avisos de la lámina 02, que son un superconjunto del de la 06 |
