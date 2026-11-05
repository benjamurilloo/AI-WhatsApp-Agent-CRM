---
schema: task-brief.v1
task_id: 24.7.2-b
task_type: implementation
generated_at: 2026-11-05
---

# Brief 24.7.2-b — Cobros y devoluciones de la caja

- **Estado**: **cerrada el 2026-11-05**, **validada en staging** (ver §Cierre). Aprobada por el
  usuario el 2026-11-05 con las recomendaciones, con D-1 a D-4
  cerradas en su opción (a) y el tope de D-1 en 50. **D-4 y D-7 de la 24.7.2
  no se reabren**: las decidió el usuario el 2026-11-04 y acá se conservan tal cual, como D-0a y
  D-0b.
- **Origen**: la división de la 24.7.2 al aprobar su brief
  ([brief-24.7.2](brief-24.7.2-cobros-devoluciones-y-cuentas.md), D-1). **Hermana, no subtarea**,
  como la 24.4.3, la 24.5.2-b y la 24.6.1-b.
- **Láminas**: `21-caja/desktop/06-cobros-recibo-conversion-v2.png`,
  `21-caja/desktop/07-devolucion-venta-sin-cliente-v2.png` y la tarjeta «¿Anular R-000183?» de
  `21-caja/estados/09-estados-caja-cuentas-v2.png`, cuya otra mitad implementó la 24.7.1.

## Objetivo

Dar a **Cobros** y a **Devoluciones** la forma del lote V2-10 y cerrar la pregunta que hoy no tiene
respuesta sin abrir una ficha: **«¿qué le cobré a esta persona?»**. Con esto queda rediseñado el
documento de caja —el recibo y la devolución, cada uno con su número, su panel y su anulación—,
que es la otra mitad de lo que la 24.7.2 dejó: allá la cuenta del cliente, acá el comprobante.

## Punto de partida verificado

Leído en el código el 2026-11-05, no de memoria:

- **`listReceipts(context, { number, page })`** y **`listRefunds`** filtran **solo por número**,
  cuentan y paginan **en SQL** (`countReceipts` / `findReceipts` con `limit`/`offset`), y después
  piden a `crm` los nombres de los clientes **de la página** con `getClientsByIds`. La paginación
  en SQL es el activo que hay que conservar: es lo que hace que el costo no crezca con la
  organización.
- **La barra de la caja ya coincide con la lámina**: «Caja actual · Sesiones · Cobros ·
  Devoluciones · Más», con «Cotización» y «Medios de pago» adentro del `<details>` que hizo la
  24.7.1 (D-3). Deudores salió de ahí en la 24.7.2. **No hay nada que cambiar en la barra.**
- **El patrón de panel por URL existe y está probado**: `?panel=cobro` en la ficha de la venta
  (`ventas/[saleId]/page.tsx`), con la regla de que el panel **vive en una sola pestaña y el
  código lo hace cumplir** —una dirección escrita a mano no lo dibuja en otra—, corrección que
  salió de la revisión independiente de la 24.6.2-d.
- **El `<dialog>` nativo de anulación existe**: `ventas/[saleId]/void-sale.tsx`. D-0b dice que la
  tarjeta «¿Anular R-000183?» es ese diálogo y **no se reescribe**.
- **Las pantallas 29, 30, 32, 33, 34, 35 y 36 de `Screens.md`** describen lo que hay hoy. Las rutas
  son `/caja/cobros`, `/caja/devoluciones`, `/cobros/[id]`, `/cobros/[id]/anular`,
  `/devoluciones/[id]`, `/devoluciones/[id]/anular`, `/clientes/[id]/devolver` y
  `/ventas/[id]/devolver`.
- **Siguen 67 migraciones.** Producción corre `e7d4052`.

## Las fronteras entre módulos, releídas con grep

Releídas hoy en `docs/architecture/Overview.md` —**no dadas por incorporadas por haberlas leído
ayer**, que es el paso que esta skill exige y el que una subfase anterior se salteó—:

- **:49** — «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`».
- **:52** — «una lista con datos de dos módulos se compone en memoria, sin `JOIN`».
- **:36** — `cash` ya depende de `crm` por `getClientsByIds`, entre otras. **«Ningún módulo depende
  de `cash`»**, y esta subfase no lo cambia.
- **:69** — la lista de deudores, y la enmienda de la 24.7.2 (D-5): con búsqueda por nombre pide
  los ids **de todo el filtro** y no los de la página, porque la búsqueda de `crm` devuelve de a 25.

**Resultado de la relectura: D-0a se sostiene, y por un motivo que conviene dejar escrito.** D-0a
filtra **por id de cliente, en SQL, sobre `receipts` y `refunds`, que son tablas de `cash`**. Eso
no cruza ninguna frontera y conserva la paginación en SQL. Lo que **sí** cruza —y el brief de la
24.7.2 no lo dijo— es de dónde salen las **opciones** del filtro, que son nombres de `crm`. Ese
hueco es H-1, no una reapertura de D-0a.

## Hallazgos que condicionan el alcance

### H-1 · D-0a fijó el filtro, no su control, y el control es un `<select>`

La lámina 06 dibuja **«Cliente» como un `<select>`** con «Todos», no como un cuadro de texto. D-0a
decidió el mecanismo del filtro («parámetro opcional de `listReceipts` y `listRefunds`, filtrando
en SQL») y **no decidió de dónde salen sus opciones**, que es lo único que toca `crm`.

Dos cosas lo vuelven una decisión y no un detalle:

1. **La 24.7.1 midió que el ancho mínimo de un `<select>` es el de su opción más larga: 413 px.**
   Un `<select>` de nombres de clientes es el caso peor imaginable de esa medición, y sin
   `w-full min-w-0` desborda a 320 px. Es, además, **el pendiente declarado y sin medir** que
   arrastran «cobrar a cuenta» y «pagos a proveedores» desde la 24.7.1.
2. **No hay tope natural**: una organización con mil clientes produce mil `<option>`.

Lo decide **D-1**.

### H-2 · El menú «…» de la lámina 06 necesita JavaScript, y el no-JavaScript es un invariante medido

La lámina 06 pone «Anular recibo» dentro de un **menú de desborde «…»** que se despliega sobre el
panel. Un menú así es un *popover*: o lo abre JavaScript, o es un `<details>`. **Que las pantallas
anden sin JavaScript es un invariante que esta fase mide** con `javaScriptEnabled: false`, no una
preferencia.

La 24.7.1 ya resolvió exactamente esta forma una vez: su «Más» de la barra **es un `<details>`**, y
al hacerlo apareció que cuando no le queda ningún destino **no se dibuja**. Lo decide **D-2**.

### H-3 · La lámina 07 es una de las dos entradas del mismo formulario, y rediseñar una sola es el defecto que la 24.7.2 ya cometió

`Screens.md` §35 dice, textual, que «Registrar devolución» son **«dos rutas, solo `admin`, con el
mismo formulario»**: `/clientes/[id]/devolver` y `/ventas/[id]/devolver`. La lámina 07 dibuja la
segunda —el caso «sin cliente», sobre una venta anulada—.

**La 24.7.2 ya cometió este error con la lámina 02** y le costó su hallazgo bloqueante B-1: hizo
una de las dos entradas y escribió en el cierre que la pantalla «ya existía y coincidía». Acá queda
como criterio explícito: **AC-6**. La entrada desde la cuenta ya recibió su estado vacío «No hay
saldo a favor» en la 24.7.2; lo que falta es que **las dos** tengan la forma de la lámina 07.

### H-4 · La «Revisión de importes» de la lámina 07 es aritmética, no una lectura

La lámina muestra tres filas —«A devolver actual», «Por devolver ahora», «Quedará por devolver»— y
las tres salen de lo que la página **ya leyó** más lo que el usuario escribe. Es el mismo patrón que
la D-2 de la 24.7.1, que declaró la previsión del movimiento como **aritmética y no como lectura**,
y con la misma consecuencia conocida: **sin JavaScript no sigue lo que se escribe**, y eso se
declara como inherente en vez de descubrirse al final.

### H-5 · Las dos tarjetas de contexto de la lámina 07 pueden costar una lectura, y hay que mirarlo antes

La lámina 07 encabeza con dos tarjetas: **«Venta V-000220 · Anulada»** con su fecha, importe
cobrado y medio, y **«Anulación A-000011»** con su fecha y motivo. Si `/ventas/[id]/devolver` hoy
no lee el comprobante de anulación, dibujarlo **es una lectura nueva** y cae bajo la condición de
detención 1. **No lo di por resuelto**: se verifica contra `HEAD` antes de escribir la pantalla, y
si falta, se pregunta.

**Verificado contra `HEAD` el 2026-11-05, antes de escribir una línea, y el resultado es mejor que
lo que este brief suponía:**

- **El comprobante de anulación ya se lee.** `getSaleForReceipt` (`src/modules/sales`) trae
  `voidRef: { displayNumber, createdAt }` con un **`LEFT JOIN` a `sale_voids` que ya existe**,
  puesto por la 21.6 (D-6 y H-7) porque tres subconsultas por fila costaban el doble en la lista de
  deudores. **El número y la fecha de la anulación no son una lectura nueva.**
- **La fecha de la venta** (`createdAt`) y **lo cobrado** (`standing.collected`) también están ya
  en memoria; lo que `getSaleRefundForm` hace es **no devolverlos**. Exponerlos es
  `src/modules/cash/service.ts`, que está en la lista cerrada.
- **El medio** sale de `repository.findPaymentMethods`, que esa misma función ya llama.
- **Lo único que falta es el motivo**: `sale_voids.reason` existe en la tabla y **no está en el
  `select`** de `saleForReceiptColumns`. Agregarlo es **una columna más en el `JOIN` que ya
  está**, no una consulta más — pero toca `src/modules/sales/repository.ts` y
  `src/modules/sales/service.ts`, **fuera de la lista cerrada**.

**Desvío preguntado y autorizado por el usuario el 2026-11-05, antes de implementar**, por la
condición de detención 3. Queda en la lista cerrada con ese nombre. **La condición de detención 1 no
se activó**: no hay ninguna consulta nueva.

### H-6 · «Registrar cobro» sigue deshabilitado, y eso ya está decidido

> **Superado el 2026-11-05**, en el recorrido de la 24.7.3: el botón **se sacó**. El razonamiento de
> abajo cierra bien sobre la lámina y falla en uso. Que el control esté apagado *con* su motivo
> escrito al lado es, en la pantalla real, un botón que no se enciende nunca más un párrafo que
> ocupa el encabezado para decir que no sirve. La información que el párrafo daba —dónde se registra
> un cobro— ya la daba el **estado vacío**, que es donde alguien la busca. Lo pidió el usuario
> mirando la pantalla, que es la única instancia que ve esto; ninguna revisión lo había visto, ni la
> autoevaluación ni la independiente, porque las dos comprobaron que el botón estuviera como la
> lámina lo pedía. El detalle y la diferencia con la lámina quedan en la §30 de
> [Screens.md](../product/Screens.md).

La lámina 06 dibuja «Registrar cobro» **deshabilitado** en el encabezado. El brief de la 24.7.2 ya
lo declaró como diferencia con la v2: un cobro necesita un destino, y hoy se registra desde su
venta o desde la cuenta del cliente; agregarlo obligaría a una pantalla de elección de destino que
no existe. **Se conserva la declaración, no se reabre.**

## Diferencias con la v2, declaradas antes de implementar

| Lámina | Qué no se va a hacer igual | Por qué |
|---|---|---|
| 06 | «Registrar cobro» queda **deshabilitado** | H-6; ya declarado por la 24.7.2 |
| 06 | El menú «…» no será un *popover* con JavaScript | H-2; el no-JavaScript es un invariante medido |
| 06 | El panel muestra la cotización usada **solo si el cobro la tiene** | La lámina dibuja un cobro con conversión; uno en la misma moneda no tiene qué mostrar |
| 06 | La columna se llama **«Destino»** y no «Venta» | *Agregado el 2026-11-05, antes de escribir la pantalla.* El destino de un cobro **no siempre es una venta**: desde la 21.4 puede ser la seña de un pedido y desde la 21.6, la cuenta del cliente. La lámina dibuja solo el caso de la venta; llamar «Venta» a la columna haría que una fila con «Pedido P-000011» contradijera su propio encabezado. Las celdas sí dicen «Venta V-000223», como la lámina |
| 07 | El encabezado «Buscar en Vixora…» de la lámina difiere del real | Es el marco de la aplicación, fuera del alcance de esta subfase |

*Las cinco de abajo las encontró la **revisión independiente** (N-7), comparando entrada por entrada, y se agregaron el 2026-11-05: **no estaban declaradas, que es el defecto**, no que existan.*

| Lámina | Qué no se va a hacer igual | Por qué |
|---|---|---|
| 06 | Debajo del botón apagado va un párrafo que dice **por qué** está apagado | La lámina dibuja solo el botón. Un control apagado sin motivo es una trampa; y desde la revisión, **solo lo ve un `admin`** (B-3) |
| 06 | El filtro por número lleva `placeholder` «R-000123» y un botón «Buscar» | La lámina pone «Todos» y no dibuja el botón. El botón es lo que hace que el filtro ande **sin JavaScript**, y es anterior a esta subfase |
| 06 | La fila «Fecha» del panel agrega la zona horaria entre paréntesis | La lámina la pone en la barra superior de la aplicación, que acá no la tiene. Una fecha de caja sin su zona no se puede comparar con otra |
| 07 | El texto bajo «Moneda que sale» es «Sale en ARS, la moneda de lo que hay que devolver» y no «Esta venta está emitida en ARS» | **El formulario es uno solo para sus dos entradas** (AC-6), y desde la cuenta no hay ninguna venta que nombrar |
| 07 | «Registrar devolución» lleva subtítulo, que la lámina no tiene | Dice de cuánto se está hablando antes de las tarjetas. Es la misma información que la lámina pone en el contexto |
| 09 | El ícono de la tarjeta es un documento y la lámina usa un documento con cruz | El repertorio de íconos del proyecto no tiene esa variante, y agregarla está fuera del alcance |

## Decisiones

### D-0a · El filtro por cliente — **CERRADA el 2026-11-04** (D-4 de la 24.7.2), no se reabre

Entra, declarado y medido, como parámetro opcional de `listReceipts` y `listRefunds`, **filtrando
en SQL sobre tablas de `cash`**.

### D-0b · El recibo es un panel por URL — **CERRADA el 2026-11-04** (D-7 de la 24.7.2), no se reabre

Panel que abre y cierra por la URL, como `?panel=cobro` de la 24.6.2-d. La anulación es el
`<dialog>` nativo de la 24.6.2-d, **que ya existe y no se reescribe**.

### D-1 · De dónde salen las opciones del filtro «Cliente» (H-1) — CERRADA en (a)

- **(a) Un `<select>` con los clientes que tienen cobros, ordenados por nombre** *(recomendada)*.
  Una consulta `distinct` sobre `receipts.client_id` —tabla de `cash`— más `getClientsByIds` para
  los nombres, que ya es dependencia. Con `w-full min-w-0` obligatorio y **con un tope**: pasado
  cierto número de clientes, el `<select>` se reemplaza por el cuadro de texto de (b).
- (b) Un cuadro de texto por nombre, como el de `/cuentas`. Coherente con la pantalla hermana, pero
  **no es lo que la lámina dibuja** y obliga a resolver nombre → ids con `listClientOrderKeys`.
- (c) Sin filtro por cliente, declarado como diferencia. Contradice D-0a, que ya está cerrada.

**Por qué (a)**: es lo que la lámina dibuja, el filtro queda por id y en SQL como D-0a fijó, y el
costo de las opciones está acotado por los clientes **que tienen cobros**, no por todos. El tope es
lo que impide que una organización grande reciba un `<select>` de mil opciones; **cuál es el tope
es parte de esta decisión y lo propongo en 50**, el mismo orden que `CLIENT_SUGGEST_LIMIT`.

*Cerrada el 2026-11-05 en (a), con el tope en 50.* **El tope no es cosmético**: es lo que impide
que el `<select>` crezca sin límite, y M-2 lo mide. Superado el tope, el control pasa a ser el
cuadro de texto de (b), así que **las dos formas se implementan** y la que se dibuja depende del
dato, no del rol ni de una preferencia — el mismo criterio que la D-1 de la 24.7.1, donde el
aviso se decide por el dato.

### D-2 · El menú «…» del panel (H-2) — CERRADA en (a)

- **(a) Sin menú: «Anular recibo» es un enlace al pie del panel, junto a «Imprimir»** *(recomendada)*.
- (b) Un `<details>` que imita el menú, como el «Más» de la barra de la 24.7.1.
- (c) Un *popover* con JavaScript, con alternativa sin él.

**Por qué (a)**: un menú de desborde existe para esconder acciones cuando sobran, y acá hay **dos**.
La 24.7.1 ya dejó escrito que un desplegable sin destinos no se dibuja; un desplegable con una sola
opción es la misma idea un paso más adelante. (b) es defendible si se quiere la forma exacta de la
lámina, y se declara como la diferencia que no es.

### D-3 · Qué pasa con el filtro cuando se abre el panel — CERRADA en (a)

- **(a) El panel conserva los filtros y la página en la URL** *(recomendada)*, como la redirección
  de `/caja/deudores` conserva `moneda`, `cliente` y `pagina`.
- (b) El panel limpia los filtros.

**Por qué (a)**: cerrar el panel tiene que devolver al listado **donde estaba**. Es la misma regla
que la 24.7.2 aplicó al volver de «cobrar a cuenta», y su hallazgo B-3 mostró lo que cuesta no
pensarla: la vuelta estaba escrita en la documentación y era falsa en el código.

### D-4 · El alcance de la anulación en esta subfase — CERRADA en (a)

- **(a) Se rediseña la confirmación con la forma de la tarjeta de la lámina 09, en las dos
  anulaciones —recibo y devolución—** *(recomendada)*.
- (b) Solo la del recibo, que es la que la lámina dibuja.

**Por qué (a)**: `Screens.md` §36 dice que anular una devolución usa **«la confirmación de la
pantalla 32»**. Son la misma pantalla con otro sustantivo: rediseñar una sola las separa y deja la
contradicción escrita en el documento. Es el mismo razonamiento de H-3.

## Alcance

**Incluido:**

1. **`/caja/cobros` con la forma de la lámina 06**: el filtro por número y el filtro por cliente
   (D-1), la tabla con Número R · Cliente · Venta · Medio · Importe · Estado, y «Consumidor final»
   donde hoy va el guion.
2. **El recibo como panel por URL** (D-0b) sobre ese listado, con los datos de la lámina: estado,
   tarjeta de la organización con «Documento no válido como factura», Cliente, Destino, Medio,
   Sesión de caja, Fecha, «Aplicado a la venta», «Recibido físicamente» cuando hubo conversión, la
   cotización usada con «copiada al registrar», el aviso «La deuda baja en X; la caja recibe Y», y
   «Imprimir» más «Anular recibo» (D-2).
3. **La anulación con la forma de la tarjeta «¿Anular R-000183?»** de la lámina 09 (D-4): los tres
   datos, el motivo de su lista cerrada, el aviso de qué deja de contar y qué resta de la caja, y
   los dos botones «Conservar recibo» / «Anular recibo».
4. **`/caja/devoluciones`** con el mismo filtro por cliente (D-0a) y la forma hermana del listado.
5. **«Registrar devolución» con la forma de la lámina 07, en sus dos entradas** (H-3): las tarjetas
   de contexto, «Datos de la devolución» y la «Revisión de importes» (H-4).
6. **`Screens.md`** §29, §30, §32, §33, §34, §35 y §36 actualizadas.

**Excluido, y dicho para que no se cuele:**

- **Habilitar «Registrar cobro»** (H-6).
- **Cualquier cambio a una regla de dinero**: la imputación, los topes y los rechazos de `cash` no
  se tocan. Esta subfase es de pantallas y de un filtro.
- **Migraciones, tablas y contratos nuevos.** Siguen 67 migraciones.
- **El objetivo táctil de 44 px**, que es una subfase propia.
- **El desbordamiento del `<select>` en «cobrar a cuenta» y «pagos a proveedores»**: sigue
  declarado y sin medir, y **no entra acá**. Lo que sí entra es no repetirlo en el `<select>` nuevo.

## Lista cerrada de archivos

| Archivo | Por qué |
|---|---|
| `src/modules/cash/service.ts` | D-0a: el parámetro opcional en `listReceipts` y `listRefunds`, y las opciones del filtro (D-1) |
| `src/modules/cash/repository.ts` | El `where` por cliente en las cuatro consultas y el `distinct` de D-1 |
| `src/app/(autenticado)/caja/cobros/page.tsx` | Láminas 06 y 09 |
| `src/app/(autenticado)/caja/devoluciones/page.tsx` | El filtro y la forma hermana |
| `src/app/(autenticado)/cobros/[receiptId]/page.tsx` | El panel se compone desde el listado; la pantalla suelta sigue existiendo |
| `src/app/(autenticado)/cobros/[receiptId]/anular/{page.tsx,void-form.tsx}` | D-4 |
| `src/app/(autenticado)/devoluciones/[refundId]/{page.tsx,anular/page.tsx}` | D-4 |
| `src/app/(autenticado)/clientes/[clientId]/devolver/**` y `src/app/(autenticado)/ventas/[saleId]/devolver/**` | H-3: las **dos** entradas |
| `tests/e2e/receipts.spec.ts`, `tests/e2e/refunds.spec.ts` | Los criterios |
| `docs/product/Screens.md` | §29, §30, §32, §33, §34, §35, §36 |
| `docs/architecture/Overview.md` | Solo si D-1 agrega una lectura que haya que registrar en la fila de `cash` |
| `src/modules/sales/repository.ts` y `src/modules/sales/service.ts` | **Agregados el 2026-11-05 con autorización del usuario**, por H-5: el motivo de la anulación, una columna más en el `LEFT JOIN` que ya existe y **ninguna consulta nueva** |
| `tests/e2e/exchange.spec.ts` y `tests/e2e/accounts.spec.ts` | **Agregados el 2026-11-05 con autorización del usuario**: la lámina 07 dibuja «Medio de pago» como `<select>` y el importe con la etiqueta «Importe», y las dos specs localizan el formulario de la devolución por los nombres viejos. *`accounts.spec.ts` se preguntó aparte y después*: al pedir la primera autorización dije que `exchange.spec.ts` era **el único**, y no lo era. El `grep` previo buscó **por la etiqueta del control** y esa spec localiza **por rol**, así que no podía encontrarla; la encontró la batería. Es la misma forma de defecto que AC-10 persigue: **un recuento declarado tiene que decir cómo se obtuvo**, porque el método decide qué queda afuera |
| `docs/planning/Roadmap.md` | **Agregado el 2026-11-05 con autorización del usuario**, por el hallazgo B-4 de la revisión independiente: la fila de la 24.7.2-b afirmaba que su única lectura nueva era el filtro por cliente sobre tablas de `cash`, **declarado y medido**, y era falsa por tres lados. Es la misma clase de corrección que la 24.7.1 pidió autorización para hacer en este mismo archivo |

Salirse de esta lista **se pregunta antes, sin excepción por tamaño**.

## Criterios de aceptación

| | | Evidencia |
|---|---|---|
| **AC-1** | `/caja/cobros` tiene la forma de la lámina 06, con sus seis columnas y «Consumidor final» | e2e + comparación visual |
| **AC-2** | El filtro por cliente devuelve **solo** los cobros de ese cliente, **filtra en SQL** y conserva el filtro por número y la página | e2e + lectura del código |
| **AC-3** | El recibo abre y cierra **por la URL**, y el panel **no se dibuja fuera de su listado** aunque se escriba la dirección a mano | e2e, incluida la URL escrita a mano |
| **AC-4** | La anulación tiene la forma de la tarjeta de la lámina 09, **en el recibo y en la devolución** | e2e con las dos |
| **AC-5** | **Ninguna regla de dinero cambió**: imputación, topes y rechazos iguales | `git diff` de `src/modules/cash/**` + integración |
| **AC-6** | «Registrar devolución» tiene la forma de la lámina 07 **desde sus dos entradas**, y es **el mismo formulario** | e2e desde las dos rutas |
| **AC-7** | La «Revisión de importes» coincide con lo que el registro deja, y un importe de más se **rechaza en el servidor** | e2e + integración |
| **AC-8** | Un `viewer` consulta y no ve acciones de gestión en ninguna de las cinco pantallas | e2e con los dos roles |
| **AC-9** | Las pantallas andan **sin JavaScript**, incluidos el panel y el filtro | e2e con `javaScriptEnabled: false` |
| **AC-10** | **Sin desbordamiento horizontal de 320 a 1440 px** en las cinco rutas, **con el `<select>` de clientes poblado** | e2e con `setViewportSize`, no declarado |
| **AC-11** | axe sin violaciones A ni AA en cada estado, incluido el panel abierto | `expectAccessible` |
| **AC-12** | Las lecturas nuevas son **solo** las que D-0a y D-1 aprueban, verificado contra `HEAD` archivo por archivo | `git show HEAD:<archivo>`, no de memoria |
| **AC-13** | La impresión del recibo y de la devolución **no cambió**: sin navegación y sin el contacto del cliente | e2e de impresión |
| **AC-14** | Comparación visual contra las tres láminas, **entrada por entrada** | tabla en el §Cierre |
| **AC-15** | La batería completa en **una sola corrida de CI**, en verde, sobre el SHA exacto | leída por `headSha` |
| **AC-16** | Revisión independiente de un agente que no participó, **con el diff del commit a la vista** | su veredicto |
| **AC-17** | Recorrido del usuario en producción | tu confirmación |

**AC-10 y AC-12 llevan ese nombre a propósito.** La 24.7.2 declaró AC-10 cumplido sin que existiera
un solo `setViewportSize`, y al escribirlo apareció un desbordamiento de 338 px. Acá el criterio
exige además **el `<select>` poblado**, porque un `<select>` vacío no mide nada.

**AC-16 incorpora lo que la 24.7.2 aprendió de método**: al revisor se le deja el diff escrito en
archivos que pueda leer. Con eso, sus doce hallazgos fueron los doce reales y el más caro llegó
confirmado en vez de como sospecha.

## Mediciones requeridas

- **M-1 · El costo del filtro por cliente.** Con un fixture de **al menos 200 cobros** repartidos
  entre **al menos 20 clientes**: el **número de consultas** y el **tiempo**, con y sin filtro. Si
  el contador de sentencias no alcanza porque Next corre en otro proceso —como en la 24.6.2-b, la
  24.6.2-d, la 24.7.1 y la 24.7.2—, se declara **verificado por camino de código y no medido**,
  **con ese nombre y no con otro**, y se dice qué parte quedó sin medir. **El recuento y el tiempo
  son dos cosas con dos nombres**, y ninguno hereda la salvedad del otro.
- **M-2 · El ancho del `<select>` de clientes poblado**, medido como lo midió la 24.7.1: el
  `min-content` del control con su opción más larga. Es la medición que falta desde entonces en dos
  pantallas, y acá no se puede volver a diferir, porque el `<select>` es nuevo.

## Condiciones de detención

1. **Una lectura nueva que no sea D-0a ni D-1 se pregunta, no se agrega al pasar.** Incluye
   agregar un campo que obligue a una consulta más — H-5 es el caso concreto ya identificado.
   *Verificado el 2026-11-05: **no se activó**. H-5 resultó no costar ninguna consulta, y lo que
   sí costó —dos archivos fuera de la lista cerrada— se preguntó por la condición 3.*
2. **Una regla de dinero que haya que cambiar para que la pantalla se parezca a la lámina** se para
   y se pregunta: toca el ADR 0022.
3. **Salirse de la lista cerrada de archivos** se pregunta antes, sin excepción por tamaño.
4. **Si la paginación en SQL se vuelve imposible de conservar**, se para y se pregunta en vez de
   pasar a paginar en memoria: ese cambio altera el costo de la pantalla para toda organización, no
   solo para quien filtra.
5. **Si al implementar el alcance resulta más grande de lo que este brief supone**, se para y se
   parte, en vez de entregar algo que vuelva R2.
6. **Una contradicción entre dos documentos** se eleva con los dos citados, no se resuelve sola.

## Nivel de validación objetivo

**Validado localmente** al terminar, con AC-1 a AC-14 en verde. **Validado en integración** con
AC-15. **Validado en staging** solo después del despliegue **y de tu recorrido** (AC-17). No
certifica **preparado para producción**.

## Ubicación en la fase

Es la **vigésimo segunda** subfase de la Fase 24 y la tercera del bloque de Finanzas. Después queda
la **24.7.3** (cotización y medios de pago) y con eso **cierra Finanzas**.

- **Necesario ahora**: completa el rediseño del documento de caja, que es la mitad que la 24.7.2
  dejó pendiente al partirse.
- **Requisito antes de producción**: nada que esta subfase agregue.
- **Mejora posterior**: el objetivo táctil de 44 px, y el desbordamiento del `<select>` en «cobrar
  a cuenta» y «pagos a proveedores» — que M-2 vuelve más fácil de atacar, porque deja la medición
  hecha.

## Cierre

**Cerrada el 2026-11-05.** Nivel alcanzado: **validada en staging** — desplegada en producción en
`3cfd7fc`, verificada con los siete pasos del runbook y recorrida por el usuario. No certifica
preparado para producción.

### Lo que cambió respecto de lo aprobado, y por qué

| Qué | Por qué | Autorización |
|---|---|---|
| `src/modules/sales/{repository,service}.ts`, fuera de la lista cerrada | H-5: la tarjeta «Anulación» de la lámina 07 necesita el **motivo**, y el comprobante de anulación ya se leía. Costó **cero consultas**: una columna más en un `LEFT JOIN` que ya existía | Pedida y concedida antes de implementar (condición de detención 3) |
| «Medio de pago» pasa a ser un `<select>` y el campo pasa a llamarse «Importe en {moneda}» | Copiar la lámina 07, que dibuja un desplegable | Pedida y concedida; obligó a actualizar `tests/e2e/exchange.spec.ts` |
| `tests/e2e/accounts.spec.ts` | **El recuento anterior estuvo mal.** Informé que `exchange.spec.ts` era la única spec afectada; `accounts.spec.ts:300` también se rompía, porque mi `grep` buscó **por la etiqueta del control** y esa spec localiza **por rol** | Pedida y concedida después de corregir el recuento |
| `docs/planning/Roadmap.md` | Hallazgo B-4: la fila de esta subfase afirmaba tres cosas falsas | Pedida y concedida |
| La columna «Venta» de la lámina 06 se llama **«Destino»** | Un cobro puede aplicarse a una venta, a un pedido o a la cuenta, y la columna muestra los tres | Declarada **antes** de implementarla, en la tabla de diferencias |

### AC-12 · Las lecturas nuevas, verificadas contra `HEAD`

Son **dos, y las dos estaban aprobadas**, leídas de `git show HEAD:<archivo>` y no de memoria:

1. El **filtro por cliente**, que resuelve **por id y en SQL** sobre `receipts` y `refunds`, tablas
   propias de `cash`.
2. **`listClientOrderKeys` de `crm`**, que solo se usa cuando los clientes con comprobantes pasan
   el tope de 50 y el control deja de ser un `<select>`. Resuelve el nombre a ids **sin `JOIN`**,
   que es lo que exige `Overview.md:49`, y quedó registrada en la fila de `cash`.

La condición de detención 1 **no se activó**: H-5, que era el caso identificado de riesgo, resultó
no costar ninguna consulta.

### Mediciones

**M-1 · El costo del filtro por cliente.** Fixture de 200 cobros repartidos entre 20 clientes.

| | Tiempo |
|---|---|
| Sin filtro | 675 ms |
| Con filtro | 832 ms |
| Página 2 del listado filtrado | 676 ms |

El filtro cuesta **157 ms** sobre el listado sin filtrar, y **la segunda página del listado
filtrado cuesta lo mismo que la primera sin filtro**: la paginación sigue resolviéndose en SQL y no
en memoria, que es lo que la condición de detención 4 protegía.

**El recuento de consultas queda verificado por camino de código y no medido**, con ese nombre y no
con otro: el contador de sentencias no alcanza porque Next corre en otro proceso, igual que en la
24.6.2-b, la 24.6.2-d, la 24.7.1 y la 24.7.2. **Lo medido es el tiempo; el recuento, no.** El
camino verificado es: `countReceipts` y `findReceipts` comparten un único `receiptFilter`, y el
filtro por id no agrega ninguna consulta porque el `<select>` ya trae los ids. El hallazgo N-4
encontró que esta enumeración estaba incompleta y se completó.

**M-2 · El ancho del `<select>` de clientes poblado.** **403 px de `min-content` contra 288 px
dibujados** a 320 px de ventana. Es la medición que faltaba desde la 24.7.1 y que ahora está hecha:
el control se dibuja más angosto que su opción más larga, y no desborda porque lleva
`w-full min-w-0`. El desbordamiento de «cobrar a cuenta» y «pagos a proveedores» sigue abierto,
ahora con la medición hecha.

### AC-14 · Comparación visual contra las láminas, entrada por entrada

Cada pantalla se capturó del build y se miró **al lado** de su lámina, no de memoria. Las
diferencias están todas acá.

**Lámina 06 · Cobros, con el recibo en el panel**

| Entrada de la lámina | Qué quedó |
|---|---|
| Título «Cobros», pestañas «Caja actual / Sesiones / Cobros / Devoluciones / Más» | ✔ |
| Filtros «Número R» y «Cliente» en dos columnas | ✔ |
| Tabla de seis columnas, con la fila abierta resaltada | ✔ (`bg-primary-soft/40` y `aria-current`) |
| Columna **«Venta»** | ✘ se llama **«Destino»**: un cobro se aplica a una venta, a un pedido o a la cuenta, y la columna muestra los tres. Declarada antes de implementar |
| «—» para el cobro sin cliente | ✘ dice **«Consumidor final»**, que es lo que AC-1 pide |
| Estado «● Vigente» | ✔ con diferencia menor: es una píldora con ícono de tilde, no un punto |
| «Registrar cobro» apagado | ✔ apagado (`disabled:opacity-60`), y **solo lo ve un `admin`** desde B-3. Debajo va un párrafo que dice **por qué** está apagado — declarada |
| Filtro «Número R» con marcador «Todos» | ✘ el marcador es «R-000123» y lleva botón «Buscar»: es lo que hace que el filtro ande **sin JavaScript**, y es anterior a esta subfase |
| Panel: título, estado, tarjeta del negocio, «Imprimir» | ✔ |
| Fila «Sesión de caja» del panel | ✔, y **solo aparece cuando el cobro tiene sesión** |
| «Recibido físicamente», «Cotización usada» y el aviso de conversión | ✔, y **solo aparecen cuando hubo cambio de moneda** |
| Fila «Fecha» | ✘ agrega la zona horaria entre paréntesis, y con su nombre IANA completo. La lámina la pone en la barra superior, que acá no la tiene — declarada |
| «Anular recibo» dentro de un menú «…» | ✘ es un botón visible al lado de «Imprimir»: el menú necesita JavaScript, que es un invariante medido (H-2) — declarada |
| Encabezado «Buscar en Vixora…» y miga «Finanzas › Caja» | ✘ es el marco de la aplicación, fuera del alcance — declarada |
| Subtítulo «Cada cobro de una venta, con su recibo.» y «Mostrando 1 a 2 de 2 cobros» | ✘ la lámina no los dibuja; **los dos son anteriores a esta subfase** |

**Lámina 07 · Registrar devolución**

| Entrada de la lámina | Qué quedó |
|---|---|
| Título, aviso «Previsión. La devolución aún no se registró.» | ✔ |
| Tarjetas de contexto: Venta con «Anulada», fecha, importe cobrado, medio | ✔ |
| Tarjeta «Anulación» con su número enlazado, fecha y motivo | ✔ — es lo que H-5 hizo posible |
| Aviso «Sin cliente: la devolución se registra sobre la venta anulada.» | ✔ |
| «Datos de la devolución» con medio, moneda y importe | ✔ |
| «Revisión de importes»: a devolver actual, por devolver ahora, quedará por devolver | ✔ |
| Aviso «Confirmá que el dinero fue entregado.» y los dos botones | ✔ |
| Etiquetas **a la izquierda** del control | ✘ van **arriba** del control, como el resto de los formularios del proyecto |
| «Medio de pago» con «Transferencia» ya elegido | ✘ arranca en «Elegí un medio de pago»: es un campo obligatorio y preseleccionar un medio de pago elige por quien devuelve |
| «Importe» | ✘ se llama **«Importe en {moneda}»**, por decisión del usuario al copiar la lámina |
| Importe escrito «80.000,00» | ✘ el campo trae el número crudo y debajo va «Se lee: $ 80.000,00», que es la lectura compartida de toda la caja, anterior a esta subfase |
| «Esta venta está emitida en ARS.» | ✘ dice «Sale en ARS, la moneda de lo que hay que devolver», porque **el formulario es uno solo para sus dos entradas** y desde la cuenta no hay venta que nombrar — declarada |
| Sin texto de ayuda bajo «Medio de pago» | ✘ lleva «Una devolución en efectivo sale de la sesión de caja abierta.», anterior a esta subfase |
| Sin subtítulo bajo el título | ✘ lleva uno que dice de cuánto se está hablando — declarada |
| Miga «Finanzas › Caja › Devoluciones › Registrar devolución» | ✘ la arma el marco desde la ruta; **las dos entradas se distinguen por el «Volver»**: «Volver a la venta» y «Volver al cliente» |
| — | **Desde la cuenta** la tarjeta de contexto se reemplaza por la explicación de qué está a favor, con «Ver estado de cuenta». Es la misma pantalla: AC-6 verificado a la vista desde las dos entradas |

**Lámina 09 · La tarjeta «¿Anular R-000183?»**

| Entrada de la lámina | Qué quedó |
|---|---|
| Ícono redondo en rojo suave, pregunta corta con el número | ✔ |
| Lista «Aplicado / Recibido / Efectivo» | ✔, y **solo se dibujan las filas que existen**: sin cambio de moneda no hay «Recibido», sin sesión no hay «Efectivo» |
| «Motivo» como desplegable | ✔ |
| Caja de información que explica qué deja de contar y que no devuelve dinero | ✔ |
| «Conservar recibo» / «Anular recibo» en rojo | ✔ |
| Motivo con «La plata no entró» ya elegido | ✘ arranca vacío: es obligatorio y preseleccionar un motivo lo elige por quien anula |
| Ícono de documento **con cruz** | ✘ el repertorio del proyecto no tiene esa variante — declarada |
| La tarjeta suelta en una galería de estados | ✘ vive en su propia pantalla, con título, subtítulo y «Volver»; y **la misma tarjeta sirve a la anulación de la devolución** (AC-4) |

**Lo que esta comparación encontró y no se vio antes:** el título de la tarjeta de la lámina 09
aparecía con un recuadro de foco en la primera captura. **No es un defecto**: se comprobó llegando
con el mouse, como un usuario, y el recuadro no aparece. Lo pintaba la navegación sintética de
Playwright, que cuenta como modalidad de teclado; el foco se mueve al título a propósito, para que
un lector de pantalla anuncie la pregunta.

### Revisión independiente (AC-16)

Un agente que no participó, de solo lectura, con el diff escrito en archivos que pudiera leer.
**Cuatro hallazgos bloqueantes y nueve no bloqueantes.** Los cuatro bloqueantes se verificaron
contra el código antes de aceptarse, resultaron **los cuatro reales** y están corregidos:

| | Hallazgo | Cómo quedó |
|---|---|---|
| **B-1** | La «Revisión de importes» afirmaba en rojo un rechazo que no existe, y **sumaba dos monedas distintas** | La tarjeta dejó de restar una moneda de la otra y dice que el cálculo con la cotización lo hace el registro. **Convertir en la página habría reimplementado una regla de dinero que el brief excluye** |
| **B-2** | AC-10: el barrido de anchos no cubría dos de las cinco pantallas de la subfase, y sí cubría una que no es de la subfase | Segundo barrido para las pantallas de devolución |
| **B-3** | AC-8: un `viewer` veía «Registrar cobro» y la instrucción de cómo registrar un cobro | El botón y su párrafo quedan tras `context.role === "admin"` |
| **B-4** | La lectura nueva de `cash` sobre `crm` no estaba registrada, y **dos documentos decían lo contrario del código** | `Overview.md` registra `listClientOrderKeys`; la fila del Roadmap se corrigió con autorización |

Los nueve no bloqueantes también están corregidos: el panel cerrado reservaba 22 rem vacíos (N-1),
por debajo de 1024 px se dibujaba después de toda la tabla (N-2), la segunda forma del control de
D-1 no tenía ni test ni medición (N-3), el camino de código de M-1 estaba incompleto (N-4), axe no
corría sobre la anulación de la devolución (N-5), ningún test combinaba los dos filtros (N-6), cinco
diferencias con las láminas no estaban declaradas (N-7, ahora en la tabla de diferencias), dos
archivos quedaban fuera de la lista cerrada (N-8, los de `sales`, cuya autorización ya estaba y
quedó escrita), y el `<select>` de clientes mentía cuando la dirección traía un cliente sin cobros
(N-9).

**El revisor no otorgó ninguna autorización**, y no la sustituye: cada desvío se pidió al usuario.

### AC-15 · La batería completa en una sola corrida de CI

Corrida **42055301946**, `conclusion: success`, leída por `headSha` sobre
`3cfd7fcd668d1935c99e86440d531df95f7351f1`, 25 min 55 s. Los diecisiete pasos en verde, **incluido
el end-to-end completo en Chromium**: el workflow lo saltea cuando el cambio es solo `.md`, y acá no
se salteó.

**Tres casos que fallaban en la máquina del operador pasaron en CI**, así que eran del entorno local
y no del código: `sales.spec.ts:474`, `tests/guards/forbidden-references.test.ts` y
`receipts.spec.ts:148`, que acá tarda 46 s contra un límite de 30 y allá entró holgado. **El límite
global no se tocó**: taparlo habría escondido el mismo síntoma en toda la batería.

**Lo que esta subfase aprendió de método, a costa propia:** correr Vitest de integración y Playwright
**al mismo tiempo contra la misma base** produjo nueve fallas de integración y varias e2e que no
existían. Las dos baterías reponen la base antes de cada caso. Corridas por separado: **156 de 156**
en los siete archivos de integración de `cash` y `sales`.

### AC-17 · Despliegue y recorrido

Desplegada el 2026-11-05 en `3cfd7fc`, con `e7d4052` anotado como vuelta atrás. Sin migraciones.
El build corrió **desprendido del `ssh`** y el arranque se decidió **por el `BUILD_ID`**, que son las
dos correcciones que dejó el despliegue anterior: terminó con `rc=0`, **78 MB de swap** usados en el
pico y **cero reinicios** del servicio, contra los 42 de aquella vez.

Los siete pasos de verificación, en verde: los **18 de 18** archivos de configuración idénticos al
repositorio; **un solo salto de proxy**, con dos filas y dos claves distintas en la ventana de quince
minutos, la del operador coincidiendo con el hash de su IP y ninguna igual al `sha256` de
`'sin-proxy'`; HSTS presente sobre HTTPS y ausente sobre HTTP; la aplicación solo en `127.0.0.1:3000`;
`crm_app_login` distinto de `crm_owner`, con `INSERT=t`, `DELETE=f` y `UPDATE=f`; `401` en las tres
rutas de ingestión y lectura; y la organización real en cero clientes, cero mensajes y cero productos.

**Tercer despliegue consecutivo con la variante del control negativo** —el `curl` desde dentro del
droplet— en lugar del túnel SOCKS. En la práctica la variante es el camino principal.

El recorrido del usuario llegó el 2026-11-05 y fue conforme.
