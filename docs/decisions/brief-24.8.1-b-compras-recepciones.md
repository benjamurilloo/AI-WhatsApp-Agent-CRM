---
schema: task-brief.v1
task_id: 24.8.1-b
task_type: implementation
generated_at: 2026-11-06
---

# Brief 24.8.1-b — Compras: recepciones

- **Estado**: **aprobado por el usuario el 2026-11-06 con las recomendaciones**, con **D-1 a D-9
  cerradas en su opción (a)**. Listo para implementar.
- **Origen**: fila «24.8.1-b Compras: recepciones» de [Roadmap.md](../planning/Roadmap.md), §Fase 24.
  **Nació el 2026-11-06**, al partir la 24.8.1 por **D-1** y nombrarse por **D-8** de
  [brief-24.8.1](brief-24.8.1-compras-ordenes-y-recepciones.md). **Hermana de la 24.8.1, no
  subtarea**, como la 24.4.3, la 24.5.2-b, la 24.6.1-b y la 24.7.2-b. Es la **segunda** del bloque
  de Abastecimiento.
- **Tarea de Notion**: `410702be6f4e8161b6b9e70e35d6137c`, en «Esperando».
- **Láminas**: lote **V2-11**, seis piezas —
  [26-recepciones](../ui-redesign/v2/26-recepciones/README.md): `desktop/01-recepciones-compra-v2.png`,
  `desktop/02-recibir-imei-con-orden-v2.png`, `desktop/03-recepcion-sin-orden-v2.png`,
  `desktop/04-detalle-anulacion-recepcion-v2.png` y `mobile/05-recibir-imei-mobile-v2.png`; más las
  **tarjetas 2 y 3** de `25-compras/estados/04-estados-compras-proveedores-v2.png` («IMEI duplicado
  en unidad» y «No se puede anular una recepción»). **Las seis se abrieron para escribir este
  brief**, y la tabla de diferencias sale de mirarlas, no de su README.
- **Contratos de negocio**: [ADR 0023](0023-compras-y-proveedores.md), [ADR 0024](0024-capacidades-por-rubro.md)
  y los briefs [22.4](brief-22.4-la-recepcion.md), [22.5](brief-22.5-la-anulacion-de-la-recepcion.md)
  y [22.6](brief-22.6-los-pagos-a-proveedores.md), que construyeron lo que acá se redibuja.

## Objetivo

Que las pantallas de **recepciones** —la lista, el alta con orden y sin orden, la ficha, la
anulación y la carga en el teléfono— tengan la forma de sus láminas, **sin cambiar una sola regla de
la recepción**: ni lo que se puede recibir contra una orden, ni el efecto sobre el stock y el costo,
ni las condiciones de la anulación.

Es un rediseño, como la 24.8.1: lo que cambia es **cómo se compone lo que ya se lee**, más **una
lectura nueva declarada** —las **unidades por recepción**, que la fila del Roadmap anuncia— y, si
**D-4** cierra en (a), **una segunda**, las opciones del filtro de proveedor.

Además **cierra los dos lugares que la 24.8.1 dejó declarados y sin dibujar** en la ficha de la
orden, porque los dos dependen exactamente de esa lectura nueva: la columna «Unidades» de la tarjeta
de recepciones y la oración de la recepción parcial de la «Actividad».

## Punto de partida verificado

Leído contra `HEAD` el 2026-11-06, no contra un informe anterior.

- **`HEAD` es `2871584`**, en `main`, limpio salvo `.claude/settings.json` sin seguimiento.
  **Producción corre `a4f2931`**: el commit de `HEAD` es solo documentación.
- **67 migraciones** versionadas en `drizzle/`. **Esta subfase no agrega ninguna.**
- **Once archivos y 2.910 líneas**, como midió H-1 de la 24.8.1. **Con una precisión**: de esas
  2.910, **159 son de `[receiptId]/pagar/page.tsx`**, que es la pantalla 50 y es de la **24.8.2**.
  El alcance real de esta subfase son **diez archivos y 2.751 líneas**. La cifra del Roadmap no se
  corrige: cuenta el árbol, y el árbol tiene once.
- **La barra de Compras ya tiene las cinco pestañas con sus iconos** (`purchasing-sub-nav.tsx`), que
  es lo que dibujan las cuatro láminas de escritorio. No hay trabajo ahí.
- **Las reglas de las dos tarjetas de la lámina 17 ya están implementadas**: `serials_taken` y
  `units_not_available` existen en `messages.ts` y en `goods-receipt-voids.ts`. Lo que falta es
  **dónde y cómo se dicen**, no la regla.

## Las fronteras entre módulos, releídas con `grep`

Releídas el 2026-11-06 **aunque ya se habían leído en esta sesión**, que es el paso que existe
porque una revisión de diseño aprobó un documento contra su propio brief y la contradicción vivía en
otro documento que nadie reabrió.

- **[ADR 0023](0023-compras-y-proveedores.md), punto 11**: «**`purchasing` depende de** … `inventory`,
  para la entrada y la salida del stock». La lectura de unidades **no estrena una dependencia**: ya
  existe y la guarda `tests/guards/purchasing-dependencies.test.ts` la fija.
- **`purchasing` no depende de `cash` ni de `service`**, y «lo pagado en el detalle de una recepción
  **lo compone la página**». La columna «Pagado / Restante en deuda» de la lámina 04 **la compone la
  página**, como hoy: no entra a `purchasing`.
- **`goods_receipt_line_units` es una tabla de `purchasing`**, y la leen solo su repositorio y el
  esquema. No se mueve.
- **`tests/guards/stock-writes.test.ts`** fija que fuera de `inventory` solo `purchasing` llama a
  las funciones de stock de la recepción. Esta subfase no escribe stock.

**No apareció ninguna contradicción** entre el ADR 0023, el `DataModel.md` y las láminas.

## Hallazgos que condicionan el alcance

### H-1 · La recepción en dos pasos sin JavaScript ya tiene molde probado y desplegado

Las láminas 02 y 05 piden **dos pasos** («1 Mercadería» / «2 Revisión»; «Paso 1 de 2»). El proyecto
tiene el mecanismo construido y en producción desde la 24.7.1:
`src/app/(autenticado)/caja/cerrar/close-form.tsx`, «Paso 1 de 2: Conteo» / «Paso 2 de 2: Revisión».

Funciona así, y **anda con JavaScript apagado**: la server action devuelve `status: "review"`, el
formulario se vuelve a dibujar como paso 2 con lo cargado en campos ocultos, y el botón de confirmar
manda `confirm=1`. Hay también un botón `edit` para volver al paso 1.

**No hace falta inventar un mecanismo, ni una ruta nueva, ni pedir una excepción al invariante de
no-JavaScript.** Se copia el molde de la pantalla hermana.

### H-2 · «Unidades» significa dos cosas distintas en las láminas, y solo una es la lectura nueva

1. **La suma de las cantidades.** El resumen de la 03 dice «Unidades · 20 unidades» para veinte
   fundas, que no son unidades serializadas. La 04 dice «Unidades recibidas · 2». Es la misma
   convención que **V-23 y V-33 de la 24.8.1** fijaron para la barra de progreso de la orden: lo que
   se cuenta es la suma de las cantidades de las líneas, no el recuento de líneas, porque una línea
   puede pedir 2,5 de algo.
2. **Las unidades serializadas con IMEI.** La tabla «Productos recibidos» y el diálogo «Unidades a
   anular (2)» de la 04 listan filas de `stock_units`.

**La lectura nueva que la fila del Roadmap anuncia es la primera**, y es barata: una suma sobre
`goods_receipt_lines`, la misma tabla que ya se subconsulta. **La segunda no es una lectura nueva**:
la ficha ya trae las unidades (H-3).

Escribirlo acá es el punto: sin esta distinción, «unidades por recepción» se implementa dos veces o
se implementa la equivocada.

### H-3 · El estado de las unidades en la ficha no cuesta una sentencia

`getGoodsReceipt` **ya llama a `getUnitSerials`** (`goods-receipts.ts:992`) para dibujar los IMEI de
cada línea. Y `getUnitSerials` y `getUnitSummaries` **llaman los dos a `unitRepository.findUnitsByIds`**:

- `getUnitSerials` devuelve un `Map<id, serial>`.
- `getUnitSummaries` devuelve `{ serial, status, productId, gradeName, batteryHealth }`.

Cambiar una llamada por la otra trae el **estado**, el **grado** y la **salud de batería** **sin una
sentencia más**. El precedente está medido y comentado en `src/modules/inventory/units.ts:1372`:
«No cuestan nada: `findUnitsByIds` ya trae las dos columnas» (24.6.1, D-6), y `orders/service.ts:1405`
lo usa así.

### H-4 · «U-000502» no existe

La lámina 04 identifica cada unidad con «U-000501» y «U-000502». **`src/modules/numbering/service.ts:20`
lista todos los prefijos del sistema** —`C-`, `R-`, `AR-`, `D-`, `AD-`, `OC-`, `RC-`, `ARC-`, `PP-`,
`APP-`, `OS-`, `PU-`, `APU-`, `PPU-`, `APPU-`— y **no hay `U-`**. Las unidades se identifican por su
IMEI o número de serie.

Inventar el prefijo sería **una migración y un contrato de numeración nuevo**, que está fuera del
alcance de un rediseño. Es **D-3**.

### H-5 · `lineCount` se queda sin consumidores, y la subconsulta correlacionada se puede ir con él

`GoodsReceiptSummary.lineCount` se calcula como **una subconsulta correlacionada por fila** en
`goods-receipt-repository.ts:333`. Tiene **exactamente dos consumidores** en la interfaz, contados
archivo por archivo y no por resta:

1. `src/app/(autenticado)/compras/recepciones/page.tsx` — la columna «Líneas» y el texto de la
   tarjeta de teléfono.
2. `src/app/(autenticado)/compras/ordenes/[orderId]/page.tsx:730` — la columna «Líneas» de la
   tarjeta «Recepciones», que **V-13 de la 24.8.1 dejó pedida como «Unidades»** y sin dibujar.

**La lámina 01 no dibuja «Líneas»**, y V-13 reemplaza esa columna por «Unidades». Si las dos se
adoptan, `lineCount` **no lo lee nadie** y la subconsulta se reemplaza por la de unidades, en el
mismo lugar y con la misma forma.

Esto es **N-6 de la 24.8.1 aplicado antes y no después**: allá la subconsulta de `lineCount` de la
lista de órdenes siguió costándoles a los tres consumidores después de que el rediseño sacara la
columna de la pantalla, y lo encontró la revisión independiente. Acá se ve venir. Es **D-7**.

### H-6 · El filtro de proveedor repite el problema de D-5 de la 24.8.1, y no se puede reusar su lectura

La lámina 01 dibuja un `<select>` «Proveedor · Todos». Hoy el proveedor **solo llega por la URL**,
desde la ficha del proveedor: no hay control.

La 24.8.1 resolvió lo mismo en la lista de órdenes con `listPurchaseOrderSupplierOptions`, **una sola
sentencia con `limit 51`**. **Esa lectura no sirve acá**: devuelve los proveedores **con órdenes**.
Un proveedor con recepciones sin orden no aparecería, y uno con órdenes y sin recepciones daría un
filtro que no filtra nada. Hace falta la hermana, sobre `goods_receipts`. Es **D-4**.

Y arrastra **H-6 de la 24.8.1**: el `<select>` de la lámina repite el desbordamiento ya medido —403 px
de `min-content` contra 288 dibujados— que se arregla con `w-full min-w-0`.

### H-7 · La ficha es también la página imprimible, y las pestañas de la lámina chocan con eso

La lámina 04 parte la ficha en **cuatro pestañas**: General, Productos, Pagos e Historial. La
pantalla 48 de `Screens.md` dice que la ficha **es la página imprimible** de la recepción (ADR 0023,
punto 13) y que «al imprimir queda solo el comprobante».

Unas pestañas sin JavaScript son cuatro renders distintos por `?seccion=`, y al imprimir habría que
forzar las cuatro: el comprobante impreso no puede depender de en qué pestaña estaba el usuario.
Además la historia ya usa `?historial=N` y la anulación, `?confirmar=anular`. Es **D-1**.

### H-8 · La anulación de la lámina es un diálogo modal, y el proyecto ya decidió lo contrario

La lámina 04 dibuja la anulación como un **modal** sobre la ficha. **D-3 de la 24.8.1 cerró en el
paso de la URL** para «Cerrar con faltante», por el mismo motivo por el que la anulación de la
recepción ya vive en `?confirmar=anular` desde la 22.5: anda sin JavaScript. Lo que sí se puede
adoptar es **todo su contenido**. Es **D-6**.

### H-9 · El radio en las pruebas, contado archivo por archivo

| Archivo | Líneas | Por qué entra |
|---|---|---|
| `tests/e2e/goods-receipts.spec.ts` | 472 | La lista y el alta cambian de forma y de pasos |
| `tests/e2e/goods-receipt-voids.spec.ts` | 534 | La confirmación cambia de contenido |
| `tests/e2e/purchase-orders.spec.ts` | región «Recepciones», línea 580 | La tarjeta de la orden gana «Unidades» |
| `tests/e2e/units.spec.ts` | 1.418 | Recorre `/compras/recepciones/nueva` (línea 190): el alta en dos pasos la rompe |
| `tests/integration/goods-receipts.test.ts` | 1.411 | `GoodsReceiptSummary` cambia de campo |
| `tests/integration/goods-receipt-voids.test.ts` | 1.119 | Los textos de `units_not_available` |
| `src/app/(autenticado)/compras/recepciones/messages.test.ts` | 211 | Los mensajes que cambian |
| `src/app/(autenticado)/compras/recepciones/filters.test.ts` | 87 | El filtro nuevo de D-5 |
| `src/app/(autenticado)/compras/ordenes/[orderId]/audit-summary.test.ts` | 72 | La oración de la recepción parcial |

`tests/e2e/sales.spec.ts`, `tests/integration/orders.test.ts` y `tests/integration/audit.test.ts`
aparecen al buscar «Líneas» y `lineCount`, y **no entran**: son de ventas y de pedidos, otro
`lineCount`.

### H-10 · Lo que el README del lote 26 descarta, y conviene no reimplementar de buena fe

El README del lote dice explícitamente que la carga en el teléfono **no promete cámara, ni lector de
código de barras, ni autoguardado**. Son tres cosas que una lámina de teléfono invita a agregar y
que **no se agregan**.

## Diferencias con la v2, declaradas antes de implementar

| # | Lámina | Qué dibuja | Qué se hace |
|---|---|---|---|
| V-1 | 01 | «Recepciones de compra» / «Entradas de mercadería y su costo.» | **Se adopta** el título y la bajada de la lámina |
| V-2 | 01 | Columnas Nº RC / Proveedor / Orden de compra / Fecha / Moneda y costo / Estado / Ver | **Se adopta**: reordena, **pierde «Líneas»** y gana «Estado» y «Ver» |
| V-3 | 01 | El estado como columna propia, con punto e icono: «Vigente» / «Anulada» | **Se adopta**, con texto e icono y no solo color. Hoy la marca cuelga del número |
| V-4 | 01 | `<select>` de proveedor | **Según D-4** |
| V-5 | 01 | Filtro «Con orden o sin orden» con icono de ayuda | **Según D-5**. No cuesta una lectura: es un `where` sobre `purchase_order_id` |
| V-6 | 01 | «+ Nueva recepción» sólido, en la fila de filtros | **Se adopta la posición**; el botón es el sólido del proyecto |
| V-7 | 01 | Columna «Ver ›» | **Se adopta como enlace con chevron**, igual que V-6 de la 24.8.1 |
| V-8 | 01 | Pie con dos avisos («La orden es opcional…» y «Vigencia del documento y pago se consultan por separado.») | **Se adopta el primero**. El segundo **no**: describe una pantalla que no existe acá y no dice nada verificable |
| V-9 | 01 | Sin paginación ni «Fechas en {zona}» | **Las dos se conservan**: son del producto y la lámina dibuja tres filas |
| V-10 | 02, 05 | Dos pasos, «1 Mercadería» / «2 Revisión» y «Paso 1 de 2» | **Se adopta**, con el molde de `caja/cerrar` (H-1) |
| V-11 | 02 | «Resumen de la recepción» a la derecha, con el aviso ámbar «Esta recepción completaría la orden y la cerraría. / No registra un pago.» | **Se adopta** |
| V-12 | 02 | Cabecera «Recibir mercadería» con «OC-000057 · Nexo Mobile · USD» | **Se adopta** |
| V-13 | 02 | Por línea: «Falta recibir» y «Costo esperado» de solo lectura, «Cantidad a recibir» y «Costo unitario recibido» editables | **Se adopta**. Hoy el dato de lo que falta está en la prosa |
| V-14 | 02 | El `stepper` ▲▼ de la cantidad | **Se adopta solo si es el nativo de `type="number"`**; no se construye uno, que necesitaría JavaScript |
| V-15 | 02 | Contador «1 de 1 cargado» con tilde verde junto al IMEI | **Se adopta como texto**, calculado en el servidor en el paso 2; en el paso 1, sin JavaScript, no hay recuento vivo |
| V-16 | 02, 03 | Barra de pie con «Volver»/«Cancelar» y «Revisar recepción ›» | **Se adopta** |
| V-17 | 02 | Miniatura del producto e insignia «Nuevo» | **La miniatura no se dibuja** (H-9 de la 24.8.1). **El grado sí**, y solo con la capacidad `serialized_units` encendida (ADR 0024) |
| V-18 | 03 | «Nueva recepción · Sin orden», con miga «Abastecimiento › Recepciones» | **Se adopta** |
| V-19 | 03 | «Datos de la recepción»: Proveedor, Remito, Moneda, en una fila | **Se adopta**, con `w-full min-w-0` en el `<select>` (H-6) |
| V-20 | 03 | Tabla Producto / SKU / Seguimiento / Cantidad / Costo unitario / Total, con tacho por fila | **Se adopta**. «Seguimiento» no cuesta una lectura: el alta ya lee `tracking` (H-4 de la 24.8.1) |
| V-21 | 03 | Resumen Productos / Unidades / Costo recibido / Total y el recuadro «Al registrar, se incorporan 20 unidades y el costo vigente pasa a …» | **Se adopta** |
| V-22 | 03 | «El precio de venta está en USD. / Con un costo en ARS no se calcula el margen entre monedas.» | **Se adopta el texto de la lámina** en lugar del de hoy |
| V-23 | 03 | El alta arranca con **una** fila | **No se adopta**: siguen las **cinco**, que son lo que hace andar el alta sin JavaScript. Mismo motivo que V-7 de la 24.8.1 |
| V-24 | 03 | «IVA incluido» bajo el costo unitario | **No se adopta**: el CRM no modela IVA, y escribirlo afirmaría algo falso |
| V-25 | 04 | Miga, insignia «Vigente» en el título y subtítulo «Nexo Mobile · OC-000057» | **Se adopta** |
| V-26 | 04 | Pestañas General / Productos / Pagos / Historial | **Según D-1** |
| V-27 | 04 | Columna derecha: Total recepción / Unidades recibidas / Pagado / Restante en deuda | **Se adopta**; lo pagado **lo compone la página** con `cash`, como hoy |
| V-28 | 04 | «Productos recibidos (2)» con filas **por unidad**: Unidad / IMEI / Costo unitario / Estado | **Según D-2**, con el estado real de cada unidad (H-3) |
| V-29 | 04 | La unidad identificada «U-000501» | **Según D-3**: ese identificador no existe (H-4) |
| V-30 | 04 | IMEI abreviado «…5101», con el completo consultable | **Se adopta**, y el completo se muestra entero en la tabla de la ficha, que es donde el README lo exige |
| V-31 | 04 | «Imprimir» con icono y menú «⋮» | **«Imprimir» sí**; el **menú «⋮» no se implementa**, por decisión registrada y repetida desde la 24.7.2-b: necesita JavaScript |
| V-32 | 04 | La anulación como diálogo modal, con «Motivo» en `<select>`, «Unidades a anular (2)» con Estado, «Al confirmar:» en tres viñetas e «Importante» en ámbar | **El contenido se adopta entero; el modal no** — **según D-6** |
| V-33 | 05 | Tarjeta de la orden con insignia «Abierta», campos apilados, insignia «Falta 1» | **Se adopta** |
| V-34 | 05 | Barra de pie fija con «Total a recibir» y «Revisar recepción» | **Se adopta** |
| V-35 | 05 | Sin navegación global durante la carga | **Según D-9** |
| V-36 | 05 | — | **No se agregan cámara, lector de código ni autoguardado**, que el README del lote descarta (H-10) |
| V-37 | 17-2 | El error del IMEI duplicado **en el campo**, con borde rojo, «Ya está activo en otra unidad.», recuadro informativo y «Revisar IMEI» | **Se adopta el error por campo y el texto**. **«Revisar IMEI» no se dibuja**: llevaría a una búsqueda de unidades por IMEI que no existe como pantalla |
| V-38 | 17-3 | «No se puede anular RC-000091 · U-000502» con **el estado real** de la unidad, «Ver unidad» y «Entendido» | **Se adopta**: el mensaje nombra la unidad y su estado, en vez de enumerar las seis causas posibles como hoy. El estado es gratis (H-3) |

## Decisiones

**Las nueve quedaron cerradas en (a)** el 2026-11-06, al aprobar el usuario el brief con las
recomendaciones. Las opciones descartadas se conservan escritas: el motivo por el que no se
eligieron es parte de la decisión.

### D-1 · ¿La ficha gana las cuatro pestañas de la lámina? — CERRADA en (a)

- **(a) No. Recomendada.** La ficha sigue en secciones apiladas, como hoy y como la ficha de la
  orden que dejó la 24.8.1. Se declara la diferencia. Motivo: la ficha **es la página imprimible**
  (H-7), y el comprobante no puede depender de la pestaña abierta.
- **(b) Sí, por URL (`?seccion=`)**, con las cuatro secciones forzadas al imprimir. Cuesta cuatro
  renders, se cruza con `?historial=` y con `?confirmar=anular`, y agrega un estado más a una
  pantalla que ya tiene tres.

### D-2 · «Productos recibidos», ¿por unidad o por línea? — CERRADA en (a)

- **(a) Por línea, con las unidades como filas hijas. Recomendada.** Cada línea conserva cantidad,
  costo unitario y total —que es lo que el comprobante impreso necesita— y, cuando el producto se
  lleva por unidad, debajo va una fila por IMEI con su estado. Cubre los dos casos en la misma
  tabla: la lámina 04 muestra dos unidades serializadas, pero la 03 recibe veinte fundas que no son
  unidades.
- **(b) Por unidad, como la lámina**, y las líneas por cantidad en una segunda tabla. Más fiel a la
  04 y peor para una recepción mixta, que es la corriente.

### D-3 · ¿Qué identifica a cada unidad en la tabla y en la anulación? — CERRADA en (a)

- **(a) El IMEI, y la columna «Unidad» se va. Recomendada.** Es el identificador real del rubro y el
  que el README del lote exige poder consultar completo.
- **(b) Un número dentro de la recepción (1, 2, 3…)**, que no es un identificador del sistema y se
  puede confundir con uno.
- **(c) Agregar el prefijo `U-` a `numbering`.** Es una migración y un contrato nuevo: **fuera del
  alcance de un rediseño**, y chocaría con la condición de detención 3.

### D-4 · El filtro de proveedor de la lista, ¿pasa a ser un control? — CERRADA en (a)

- **(a) Sí, con una lectura nueva propia de recepciones. Recomendada.** Espejo de
  `listPurchaseOrderSupplierOptions`: **una sola sentencia con `limit 51`**, sobre `goods_receipts`.
  Con más de 50 proveedores, el control se degrada al campo de hoy, como en la lista de órdenes. Es
  **la segunda lectura nueva** y se declara como tal.
- **(b) Reusar la lectura de órdenes.** **Descartada, no es una opción real**: devuelve los
  proveedores con órdenes, así que un proveedor con recepciones sin orden no aparecería (H-6).
- **(c) Dejarlo como hoy**, solo por URL. Más barato, y deja la lámina sin cumplir en un punto
  visible, con la lista hermana ya desplegada con su control.

### D-5 · ¿Se adopta el filtro «Con orden o sin orden»? — CERRADA en (a)

- **(a) Sí. Recomendada.** Es un `where` sobre `purchase_order_id`: **ni una sentencia ni una lectura
  nuevas**, y responde a una pregunta real del negocio.
- **(b) No**, y se declara la diferencia.

### D-6 · La anulación, ¿diálogo modal o el paso de la URL de hoy? — CERRADA en (a)

- **(a) El paso `?confirmar=anular`, con el contenido entero de la lámina. Recomendada.** Anda sin
  JavaScript, es lo que ya existe desde la 22.5, y es el mismo precedente que **D-3 de la 24.8.1**
  cerró para «Cerrar con faltante». Se adoptan «Unidades a anular (N)» con estado, «Al confirmar:»
  en tres viñetas y el recuadro «Importante».
- **(b) Un modal**, que necesita JavaScript y rompe un invariante medido del proyecto.

### D-7 · `lineCount`, ¿se va? — CERRADA en (a)

- **(a) Sí. Recomendada.** Sus dos consumidores lo pierden (H-5) y la subconsulta correlacionada se
  reemplaza por la suma de cantidades, en el mismo lugar: **el costo por fila no crece, y la columna
  que se dibuja es la que se lee**. Es N-6 aplicado antes y no después.
- **(b) Se deja**, por si algún consumidor futuro lo quiere. Es exactamente lo que N-6 encontró:
  trabajo por fila que nadie dibuja.

### D-8 · ¿Dónde se documenta esto en `Screens.md`? — CERRADA en (a)

- **(a) En las secciones 46, 47, 48 y 49, actualizadas en su lugar. Recomendada.** No se crea una
  sección nueva: son las mismas pantallas con otra forma. La 50 (Pagar recepción) **no se toca**: es
  de la 24.8.2.
- **(b)** Dejarlo para el cierre de la fase, y que `Screens.md` describa durante semanas una pantalla
  que ya no existe.

### D-9 · En el teléfono, ¿la carga esconde la navegación global? — CERRADA en (a)

- **(a) No. Recomendada.** El marco es el layout de `(autenticado)` y sacarlo para una ruta es un
  cambio estructural, no un rediseño de pantalla. Se declara la diferencia.
- **(b) Sí**, con una variante del layout para esa ruta. Toca un archivo compartido por todas las
  pantallas autenticadas, que es el tipo de cambio que esta fase evita.

## Alcance

### Incluido

1. **`/compras/recepciones`**: el título y la bajada, las columnas de la lámina 01, la columna de
   estado, la columna «Ver», el filtro de proveedor según D-4, el filtro «con orden o sin orden»
   según D-5, y en teléfono, tarjetas.
2. **`/compras/recepciones/nueva`**, con orden y sin orden: **los dos pasos** con el molde de
   `caja/cerrar` (H-1), el resumen de la derecha, los campos de solo lectura de la lámina 02, la
   tabla de la 03, y la forma de teléfono de la 05.
3. **`/compras/recepciones/[receiptId]`**: la cabecera con insignia, el resumen de la derecha con
   **las unidades recibidas**, «Productos recibidos» según D-2 y D-3 con **el estado de cada
   unidad**, y lo pagado compuesto con `cash` como hoy.
4. **La anulación** según D-6, con el contenido de la lámina 04 y de la tarjeta 17-3.
5. **El IMEI duplicado** según V-37, con el error en su campo.
6. **La lectura nueva declarada**: las **unidades por recepción**, en **una sola sentencia por
   página**, reemplazando la subconsulta de `lineCount` (D-7). Y, si D-4 cierra en (a), **la
   segunda**: las opciones del filtro de proveedor, en **una sola sentencia con `limit 51`**.
7. **Los dos lugares que la 24.8.1 dejó declarados**: la columna «Unidades» de la tarjeta
   «Recepciones» de la ficha de la orden, y la oración de la recepción parcial de la «Actividad»,
   que pasa a decir las unidades y no el monto.
8. **Las secciones 46 a 49 de `Screens.md`** (D-8).
9. **Las pruebas del radio de H-9**, actualizadas, más los casos nuevos de las unidades y del filtro.

### Excluido

- **Pagos, «A pagar», proveedores y técnicos**, y la **pantalla 50 (Pagar recepción)**: son la
  **24.8.2**, aunque sus pestañas y sus columnas se vean en las láminas.
- **Las tarjetas 1, 4, 5 y 6 de la lámina 17**: la 1 ya la hizo la 24.8.1; las otras tres son de la
  24.8.2 (H-3 de la 24.8.1).
- **Cualquier cambio a las reglas de la recepción o de la anulación**: lo que se puede recibir contra
  una orden, el efecto sobre el stock y el costo, las condiciones de la anulación, el máximo de
  líneas.
- **Migraciones, tablas, valores de enum y contratos nuevos**, incluido el prefijo `U-` de D-3(c).
- **Miniaturas de producto**, cámara, lector de código y autoguardado (H-10).
- **El menú «⋮»**, el **objetivo táctil de 44 px** y el **desbordamiento del `<select>` de «cobrar a
  cuenta» y «pagos a proveedores»**: son deudas del proyecto con subfase propia, y **no se arreglan
  acá de paso**. El `<select>` **de esta pantalla** sí se arregla, porque es una pantalla de esta
  subfase (H-6).

## Lista cerrada de archivos

Tocar algo fuera de esta lista es un hallazgo bloqueante, no una mejora. **Salirse se pregunta antes
de implementar, sin excepción por tamaño**, y eso incluye el archivo vecino que una corrección
autorizada arrastre.

**Las pantallas de recepciones** (once archivos, 2.751 líneas sin contar `pagar/`):

1. `src/app/(autenticado)/compras/recepciones/page.tsx`
2. `src/app/(autenticado)/compras/recepciones/filters.ts`
3. `src/app/(autenticado)/compras/recepciones/filters.test.ts`
4. `src/app/(autenticado)/compras/recepciones/messages.ts`
5. `src/app/(autenticado)/compras/recepciones/messages.test.ts`
6. `src/app/(autenticado)/compras/recepciones/actions.ts`
7. `src/app/(autenticado)/compras/recepciones/nueva/page.tsx`
8. `src/app/(autenticado)/compras/recepciones/nueva/goods-receipt-form.tsx`
9. `src/app/(autenticado)/compras/recepciones/[receiptId]/page.tsx`
10. `src/app/(autenticado)/compras/recepciones/[receiptId]/void-confirm.tsx`
11. `src/app/(autenticado)/compras/recepciones/[receiptId]/anulacion/page.tsx`

**Los dos lugares heredados de la 24.8.1**, fuera del árbol de recepciones y declarados acá porque
los dos dependen de la lectura nueva:

12. `src/app/(autenticado)/compras/ordenes/[orderId]/page.tsx` — **solo** la columna «Unidades» de la
    tarjeta «Recepciones».
13. `src/app/(autenticado)/compras/ordenes/[orderId]/audit-summary.ts` — **solo** la oración de la
    recepción parcial.
14. `src/app/(autenticado)/compras/ordenes/[orderId]/audit-summary.test.ts`

**El módulo** (solo estas tres entradas):

15. `src/modules/purchasing/goods-receipts.ts`
16. `src/modules/purchasing/goods-receipt-repository.ts`
17. `src/modules/purchasing/index.ts` — **solo si D-4 cierra en (a)**, para exportar la lectura nueva
    por el barrel. En este repositorio **no existe un import profundo desde `src/app` hacia
    `purchasing`**, y el precedente es la segunda ampliación de la 24.8.1.

**Las pruebas** (H-9):

18. `tests/e2e/goods-receipts.spec.ts`
19. `tests/e2e/goods-receipt-voids.spec.ts`
20. `tests/e2e/purchase-orders.spec.ts`
21. `tests/e2e/units.spec.ts`
22. `tests/integration/goods-receipts.test.ts`
23. `tests/integration/goods-receipt-voids.test.ts`
24. `tests/integration/units.test.ts` — **agregado el 2026-11-06, con autorización del usuario en el
    turno**, y declarado acá y en el §Cierre. Su aserción de los IMEI de la ficha quedó vieja con
    D-2 y su alta, con el paso 2 de V-10: H-9 contó el radio en las pruebas y no vio este archivo.

**La documentación**:

25. `docs/product/Screens.md` (§§46 a 49, **más la §45, agregada el 2026-11-06 con autorización del
    usuario en el turno**: ver el §Cierre, AC-20, hallazgo 1)
26. `docs/decisions/brief-24.8.1-b-compras-recepciones.md` (este archivo)

**Dos ampliaciones más, nacidas de la revisión independiente** y autorizadas por el usuario en el
turno del 2026-11-06, declaradas acá y en el §Cierre:

27. `src/modules/inventory/units.ts` — se borra `getUnitSerials`, que esta subfase dejó **sin un solo
    consumidor** al mudar el único a `getUnitSummaries` (hallazgo 4). Se comprobó antes que no hay
    cascada y que ninguna guarda enumera esos exports por nombre.
28. `src/modules/inventory/index.ts` — su línea del barrel.

Al cerrar, y **con autorización en el turno**: `CHANGELOG.md`, `docs/decisions/README.md`,
`docs/planning/Roadmap.md` y `HANDOFF.md`.

## Fuentes de verdad, en orden

1. El código en `HEAD` (`2871584`) y las **67** migraciones versionadas.
2. `docs/architecture/DataModel.md` y `docs/architecture/Overview.md`.
3. El [ADR 0023](0023-compras-y-proveedores.md), el [ADR 0024](0024-capacidades-por-rubro.md), los
   briefs 22.4, 22.5 y 22.6, el [brief-24.8.1](brief-24.8.1-compras-ordenes-y-recepciones.md) y
   `Roadmap.md`.
4. Notion, solo para el estado de la tarea.
5. Las láminas y el README del lote 26 — **propuestas de interfaz**, que su propio README dice que
   «deben conectarse a las lecturas y escrituras autorizadas, sin suponer que existen nuevos
   contratos».

## Invariantes

- **Sin JavaScript, todo anda**: los dos pasos del alta, la anulación y los filtros.
- **Ninguna regla de la recepción cambia.**
- **`purchasing` no gana una dependencia**: `inventory` ya está, `cash` se compone en la página.
- **El comprobante impreso sigue imprimiéndose entero**, sin navegación, botones ni historia.
- **Un `viewer` sigue sin ver ninguna de estas pantallas**, con el mismo mensaje y sin datos.
- **67 migraciones**, ningún valor de enum nuevo, ninguna tabla nueva.

## Criterios de aceptación

Escritos **sobre el invariante y no sobre el árbol de archivos**, que es la lección de AC-9 de la
24.7.3.

| id | Criterio |
|---|---|
| **AC-1** | La **lista** tiene la forma de la lámina 01: título y bajada, columnas Nº RC / Proveedor / Orden / Fecha / Moneda y costo / Estado / Ver, filtros según D-4 y D-5, y tarjetas en teléfono. |
| **AC-2** | La **insignia de estado** distingue vigente y anulada **con texto e icono**, y se entiende con el color apagado. |
| **AC-3** | El **alta anda en dos pasos con JavaScript apagado**, con orden y sin orden, con el nombre exacto del proveedor y el SKU exacto del producto, y **sigue arrancando con cinco filas** sin orden. Volver del paso 2 al 1 conserva lo cargado. |
| **AC-4** | El **alta** tiene la forma de las láminas 02 y 03: los campos de solo lectura, el resumen de la derecha con su aviso, la columna «Seguimiento» y la barra de pie. |
| **AC-5** | La **ficha** tiene la forma de la lámina 04: cabecera con insignia, resumen con **unidades recibidas**, «Productos recibidos» según D-2 y D-3 **con el estado real de cada unidad**, y lo pagado compuesto con `cash`. |
| **AC-6** | La **anulación** se resuelve según **D-6**, **anda con JavaScript apagado**, y muestra antes de confirmar las unidades con su estado, las tres consecuencias y el recuadro «Importante». |
| **AC-7** | **El IMEI duplicado se señala en su campo** (V-37) y **el bloqueo de la anulación nombra la unidad y su estado real** (V-38), no la lista de causas posibles. |
| **AC-8** | **La lectura nueva cuesta una sentencia por página, no una por fila**: el recuento de sentencias de la lista es **idéntico con 1 y con 25 recepciones** (M-1), y **el recuento de `getGoodsReceipt` es idéntico antes y después** del cambio de `getUnitSerials` a `getUnitSummaries`. |
| **AC-9** | **El costo por fila de la lista no creció**, demostrado con `explain` sobre la consulta vieja y la nueva (M-2) y no razonado. Es la deuda exacta que dejó N-1 de la 24.8.1. |
| **AC-10** | **Las lecturas nuevas son las declaradas y ninguna más**: la de unidades, y la del filtro de proveedor solo si D-4 cierra en (a). Verificado contra `HEAD` servicio por servicio y escrito en el §Cierre con el nombre de cada llamada antes y después. |
| **AC-11** | **Ninguna regla de la recepción cambió**: lo recibible contra una orden, el efecto sobre stock y costo, las condiciones de la anulación y el máximo de líneas siguen idénticos. El `git diff` de `src/modules/purchasing/**` se adjunta **como evidencia del criterio, no como el criterio**, y se espera que toque solo las tres entradas declaradas. |
| **AC-12** | **Los dos lugares heredados quedan cerrados**: la tarjeta «Recepciones» de la ficha de la orden dibuja «Unidades», y la oración de la recepción parcial dice las unidades y no el monto. |
| **AC-13** | **La ficha y la anulación siguen imprimiendo igual**: al imprimir queda solo el comprobante. |
| **AC-14** | **Un `viewer` sigue sin ver ninguna de estas pantallas**, con el mismo mensaje y sin datos. |
| **AC-15** | **Ninguna migración, tabla, valor de enum ni contrato nuevo**: siguen **67** migraciones y `numbering` sigue sin prefijo `U-`. |
| **AC-16** | Las pantallas **no desbordan a 320 ni a 375 px** (M-3), con el `<select>` de proveedor desplegado, y el barrido escrito en las specs y no declarado a ojo. |
| **AC-17** | `Screens.md` queda al día según **D-8**, en sus §§46 a 49. |
| **AC-18** | **Comparación visual entrada por entrada contra las seis láminas, con las láminas abiertas**, anotando cada diferencia como cumplida, declarada o descartada. Una diferencia encontrada **se verifica contra el instrumento antes de atribuirla al producto**. |
| **AC-19** | La **batería completa en una sola corrida de CI** en verde sobre el SHA exacto, leída por `headSha`, con el paso «Alcance del cambio» en `codigo=true`. |
| **AC-20** | **Revisión independiente** de un agente que no participó, de solo lectura, contra este brief y contra las reglas vigentes, con sus hallazgos **verificados contra el código antes de aceptarse**. Un subagente revisor no otorga ninguna autorización. |
| **AC-21** | **Despliegue y recorrido del usuario**: las siete verificaciones del runbook y el recorrido declarado. **Sin AC-21 el nivel es «validado en integración», no «validado en staging».** |

## Mediciones requeridas

- **M-1 · El recuento de sentencias.** De la lista con **1 y con 25 recepciones**, y de
  `getGoodsReceipt` **antes y después**, contadas en la corrida y no deducidas del código. Si lo que
  se hace es leer el camino de código, **se declara «verificado por camino de código» y no
  «medido»**.
- **M-2 · La forma de la consulta, con `explain`.** Sobre la consulta de la lista **vieja y nueva**.
  **Esta medición existe por N-1 de la 24.8.1**, que quedó razonada y sin medir, y por la nota
  `A Statement Count Is Not a Cost Measurement` del vault: **un recuento de sentencias prueba
  cardinalidad de ida y vuelta y nada más**, y acá el trabajo nuevo viaja **dentro de una sola
  sentencia**, que es exactamente lo que M-1 no ve.
- **M-3 · El barrido de anchos.** `setViewportSize` a 320 y 375 px y comparación de `scrollWidth`
  contra `clientWidth` en las cuatro pantallas, con el `<select>` de proveedor desplegado.
- **M-4 · Que el caso de la anulación bloqueada pueda fallar.** Con una unidad reservada, el caso
  nuevo **se pone rojo** si el mensaje no nombra la unidad y su estado; se comprueba y se revierte.
  Un caso en verde no prueba nada hasta que se lo ve fallar.

**Las cuatro mediciones son independientes: ninguna hereda la salvedad de otra.**

## Condiciones de detención

Parar y reportar, sin continuar:

1. **Si algo exige una lectura nueva además de las declaradas, o una dependencia nueva entre
   módulos.** No se agrega y se pregunta. En la 24.7.1 se agregó una contra esta misma condición y
   la encontró la revisión independiente, no la autoevaluación.
2. **Si algo exige cambiar una regla de la recepción o de la anulación.**
3. **Si hace falta una migración, un valor de enum o un prefijo de numeración nuevo.**
4. **Antes de tocar un archivo fuera de la lista cerrada**, cualquiera sea su tamaño, incluido el que
   arrastre una corrección autorizada.
5. **Si los dos pasos del alta no se pueden hacer andar sin JavaScript** con el molde de
   `caja/cerrar`: se para y se reporta, no se acepta una pantalla que necesite JavaScript.
6. **Antes de `commit`, `push`, `merge` o despliegue**: autorización explícita del usuario **en el
   turno**. Una anterior no vale.
7. **Si la batería local falla**: no se sube el límite global de una prueba para tapar una falla
   local; se diagnostica y se declara.
8. **Nunca correr Vitest de integración y Playwright a la vez**: comparten la base y producen fallas
   que no existen. Y `npx playwright test` **no construye**: una corrida verde puede estar probando
   código viejo.

## Nivel de validación objetivo

**Validado en staging**, y solo con AC-21. El nivel de evidencia es `deterministic` más
`producer-consumer` para las cuatro pantallas (UI ↔ servicio ↔ base), y `authenticated-end-to-end`
para el recorrido. **Un nivel superior nunca se infiere de uno inferior.**

## Ubicación en la fase

- **Necesario ahora**: todo el alcance incluido. Es la segunda fila del bloque de Abastecimiento y la
  que cierra la fila original de la 24.8.1.
- **Requisito antes de producción, y no de esta subfase**: el objetivo táctil de 44 px y el
  desbordamiento del `<select>` de «cobrar a cuenta» y «pagos a proveedores», los dos medidos y con
  subfase propia pendiente.
- **Mejora posterior**: el menú «⋮», que hoy no se implementa por decisión registrada; y una pantalla
  de búsqueda de unidades por IMEI, que es lo que haría dibujable el botón «Revisar IMEI» de la
  tarjeta 17-2.

Quedan después **cinco filas**: la 24.8.2, la 24.9.1, la 24.9.2, la 24.9.3 y la 24.10.

## Cierre

**Todavía no está cerrada.** Estado al **2026-11-06**: **implementada, commiteada en `34839a6` y
con la CI en verde sobre ese SHA, y revisada por un agente independiente**. **AC-19 y AC-20 están
cumplidos. AC-21 sigue pendiente**, y necesita autorización del usuario **en el turno**. **El nivel alcanzado hasta acá es «validado en
integración»** —UI ↔ servicio ↔ base en las cuatro pantallas—: «validado en staging» lo da **AC-21 y
nada más**, y un nivel superior nunca se infiere de uno inferior. Esta sección es **una
autoevaluación** y no una revisión independiente.

**La salvedad que esta sección tenía quedó saldada, y se deja escrita con su desenlace**: la
batería de integración de Vitest **no se pudo correr entera en esta máquina**, y **la CI la corrió
entera en verde** —115 archivos y 1.931 casos en 479 s— sobre este mismo SHA. Los tres casos en
rojo de la corrida local **eran fallas de entorno, no regresiones**, y los dos archivos que no se
pudieron identificar quedan resueltos ahí. El detalle de lo que sí se corrió acá, y de lo que no,
se conserva en §«La batería local, con lo que no se pudo correr dicho», porque **el hueco de
instrumentación que lo causó es el hallazgo, y no desaparece porque la CI haya salido verde**.

### El alcance entregado, contra la tabla de la lista cerrada

**En dos rondas.** La primera es el commit **`34839a6`**: **24 archivos, +3.041/−848**, más el
propio brief. La segunda son las correcciones de la revisión independiente: **9 archivos,
+132/−49** contra ese commit, de los cuales **dos son archivos nuevos en la entrega**
—`src/modules/inventory/units.ts` y su barrel, los puntos 27 y 28 de la lista—. **El total contra
`2871584` es de 27 archivos, +3.915/−859**, y **los veintisiete están dentro de la lista cerrada y
de sus tres ampliaciones autorizadas**, ninguno fuera. La segunda ronda **todavía no está
commiteada**.

- **La primera ampliación**: `tests/integration/units.test.ts`, el punto **24** de la lista, **preguntada y
  autorizada por el usuario antes de tocar el archivo**. Su aserción de los IMEI de la ficha quedó
  vieja con D-2, y su alta, con el paso 2 de V-10. **H-9 contó el radio en las pruebas y no vio este
  archivo**: es el hallazgo que esta subfase deja sobre su propio instrumento.
- **Dos archivos autorizados quedaron sin usar**, y se dicen para que no se los cuente como alcance
  entregado: `src/app/(autenticado)/compras/recepciones/[receiptId]/anulacion/page.tsx` —el
  comprobante de la anulación **no necesitó un solo cambio**, que es justamente lo que AC-13 pide— y
  `tests/integration/goods-receipt-voids.test.ts`, porque el bloqueo de V-38 se probó **de extremo a
  extremo con una unidad reservada real** y no con un fixture de forma supuesta.
- `docs/decisions/README.md` (+1) es **la fila de este brief en el índice**, escrita al planificar.
  Está en el conjunto que la lista cerrada autoriza al cerrar, y se declara acá para que el recuento
  de veinticuatro no sorprenda.
- De `src/modules/purchasing/**` entraron **exactamente las tres entradas declaradas** —la lectura
  nueva y el campo derivado en `goods-receipts.ts` (+109/−19) y en `goods-receipt-repository.ts`
  (+67), y seis líneas de barrel en `index.ts`—: **+163/−19 en total, y ninguna cuarta entrada**.

### Los veintiún criterios

| id | Veredicto |
|---|---|
| **AC-1** | **Cumplido.** La lista tiene el título y la bajada de la lámina 01, las columnas Número RC / Proveedor / Orden de compra / Fecha / Moneda y costo / Estado / Ver, el filtro de proveedor de D-4 con su degradación por encima de 50, el de D-5 y las tarjetas en teléfono. Verificado por la comparación de AC-18 y por los casos de `goods-receipts.spec.ts` y `goods-receipt-voids.spec.ts` que la recorren. |
| **AC-2** | **Cumplido.** «Vigente» y «Anulada» llevan **texto e ícono**, no solo color, y se leen con el color apagado. «Anulada» queda en gris y no en el rojo de la lámina: el rojo está reservado al control destructivo y a los errores, como en la orden. |
| **AC-3** | **Cumplido.** El caso `sin JavaScript` recorre los **dos pasos** con orden y sin orden, con el nombre exacto del proveedor y el SKU exacto del producto; el alta sin orden **sigue arrancando con cinco filas**; y «Corregir» vuelve al paso 1 con todo lo cargado, incluidos los IMEI, porque los campos viajan ocultos. |
| **AC-4** | **Cumplido.** «Falta recibir» y «Costo esperado» son campos de solo lectura; el resumen de la derecha lleva Productos, Unidades, «Costo recibido» cuando hay una sola línea y el Total, con su aviso; la tabla sin orden tiene la columna «Seguimiento»; y la barra de pie lleva el total en el teléfono. |
| **AC-5** | **Cumplido.** Cabecera con insignia y subtítulo «{proveedor} · {orden}», resumen con **Unidades recibidas**, «Productos recibidos» por línea con **una fila por unidad, su IMEI completo y su estado de hoy**, y lo pagado **compuesto por la página** con `cash`: `purchasing` no lo sabe. |
| **AC-6** | **Cumplido.** La anulación sigue siendo el paso `?confirmar=anular` (D-6), el caso sin JavaScript la ejecuta entera, y antes de confirmar muestra «Unidades a anular (N)» con el estado de cada una, «Al confirmar:» en tres viñetas y el recuadro «Importante». |
| **AC-7** | **Cumplido.** El IMEI duplicado se señala **en el campo de su línea**, con «Ya está activo en otra unidad.» y el recuadro de la tarjeta 17-2, fijado como función pura en `messages.test.ts`; y el bloqueo de la anulación **nombra la unidad y su estado** en vez de las seis causas posibles, con el caso de extremo a extremo que **M-4 probó que puede fallar**. |
| **AC-8** | **Cumplido y medido (M-1).** El recuento de sentencias de la lista es **2 con una recepción y 2 con veinticinco**, y el de `getGoodsReceipt` es **7 antes y 7 después** del cambio de `getUnitSerials` a `getUnitSummaries`, contados en la corrida y no deducidos del código. |
| **AC-9** | **Cumplido y medido (M-2), con lo que la medición muestra escrito tal cual.** El `explain (analyze, buffers)` de la consulta vieja y de la nueva, con 2.100 recepciones, da **el mismo plan**: `Limit → Result → Sort (top-N heapsort, 34 kB) → Seq Scan on goods_receipts`, con las cuatro subconsultas correlacionadas a `loops=25` resueltas por índice. La única diferencia es el ancho del `Aggregate` (4 → 32) y una décima de milisegundo. **El costo por fila no creció.** Es la deuda exacta que dejó N-1 de la 24.8.1, saldada con `explain` y no con un razonamiento. |
| **AC-10** | **Cumplido, verificado pantalla por pantalla contra `HEAD`**: la tabla de abajo. **Una sola llamada nueva en las cuatro pantallas**, y la otra lectura declarada viaja **dentro** de una sentencia que ya existía. |
| **AC-11** | **Cumplido.** Ninguna regla cambió: lo recibible contra una orden, el efecto sobre el stock y el costo, las condiciones de la anulación y el tope de 50 líneas quedaron idénticos. El `git diff` de `src/modules/purchasing/**` se adjunta **como evidencia del criterio y no como el criterio**: toca las tres entradas declaradas, y son una lectura nueva, un campo derivado que reemplaza a otro y seis líneas de barrel. |
| **AC-12** | **Cumplido.** La tarjeta «Recepciones» de la ficha de la orden dibuja **«Unidades»** con el recuento, fijado por el caso de `purchase-orders.spec.ts`; y la oración de la recepción parcial dice **«Se registró la recepción RC-000091 por 1 unidad.»**, con sus tres formas —singular, plural y anulada— fijadas en `audit-summary.test.ts`. |
| **AC-13** | **Cumplido.** La ficha y la anulación siguen imprimiendo solo el comprobante: lo nuevo que no va en papel —el resumen de la derecha, la tarjeta de anulación, los pagos y la historia— lleva `print:hidden`, y los dos casos de impresión siguen verdes. El comprobante de la anulación **no cambió ni una línea**. |
| **AC-14** | **Cumplido.** Los casos del `viewer` recorren la lista, el alta y la ficha, y las tres dan el mensaje de permiso **sin datos**. |
| **AC-15** | **Cumplido.** **67** migraciones, contadas en `drizzle/`; ninguna tabla, ningún valor de enum y ningún contrato nuevo, y `numbering` sigue **sin prefijo `U-`** (D-3 descartó esa opción por ser una migración encubierta). |
| **AC-16** | **Cumplido y medido (M-3).** `setViewportSize` a 320 y a 375 px y `scrollWidth` contra `clientWidth` en **las cinco pantallas** —lista, alta sin orden, alta con orden, ficha y anulación—, con el proveedor **más largo elegido** en el `<select>`, la lista filtrada y el paso de revisión. **Ninguna desborda**, y el barrido está escrito en la spec, no declarado a ojo. |
| **AC-17** | **Cumplido.** `Screens.md` queda al día en sus **§§46 a 49**, actualizadas en su lugar según D-8, con las cadenas que esta subfase volvió falsas **jubiladas por nombre**. La **§50 no se tocó**: es de la 24.8.2. |
| **AC-18** | **Cumplido.** Comparación entrada por entrada **con las seis láminas abiertas**: el detalle, abajo. Las treinta y ocho diferencias de la tabla del brief, más **diez** que aparecieron al mirar: nueve declaradas y **una corregida en el producto**. |
| **AC-19** | **Cumplido.** Corrida **42316301814** sobre **`34839a6d0329d01ded58f77fcf1e85e157cc5655`**, leído por `headSha`, en `success`, con «Alcance del cambio» en **«Corre todo: true»**. Los diecisiete pasos en verde: lint, tipos, formato, migraciones al día, **guardas 33 archivos**, **unitarias 123 archivos**, **integración 115 archivos / 1.931 casos**, build y **extremo a extremo 386 casos**. |
| **AC-20** | **Cumplido, con hallazgos.** Un agente que no participó, de solo lectura, dio **R2**: un bloqueante —una contradicción entre el código y la §45 de `Screens.md` que esta autoevaluación no había visto— y siete no bloqueantes. **Los ocho se verificaron contra el código y los ocho resultaron ciertos**; seis se corrigieron dentro de la lista cerrada y dos, fuera de ella, con autorización del usuario en el turno. El detalle, y el límite que el propio revisor declaró, en §«AC-20 · La revisión independiente». |
| **AC-21** | **Pendiente.** Despliegue y recorrido del usuario. **Sin AC-21 el nivel es «validado en integración», no «validado en staging»**, y así queda escrito arriba. |

### AC-10 · Las lecturas nuevas, pantalla por pantalla

El criterio pedía **el nombre de cada llamada antes y después**. Medido con `git show 2871584:<ruta>`
contra el árbol de trabajo, pantalla por pantalla:

| Pantalla | Antes (`2871584`) | Después | Diferencia |
|---|---|---|---|
| `compras/recepciones/page.tsx` | `listGoodsReceipts`, `getOrganizationTimezone`, `getSupplier` (condicional) | las mismas tres **más `listGoodsReceiptSupplierOptions`** | **+1**, la que D-4 obliga, en `Promise.all` con la lista |
| `compras/recepciones/nueva/page.tsx` | `getPurchaseOrder`, `getCurrentPrices`, `getProductsByIds` | **idéntico** | **0** |
| `compras/recepciones/[receiptId]/page.tsx` | `getGoodsReceipt`, `listGoodsReceiptAudit`, `getGoodsReceiptPayments`, `getOrganizationTimezone`, `getAppFrame`, `getAvailableStock` (condicional), `auditActorLabels` | **idéntico** | **0** — el estado de cada unidad viaja en la sentencia que `getGoodsReceipt` ya hacía (H-3) |
| `compras/ordenes/[orderId]/page.tsx` | `getPurchaseOrder`, `listPurchaseOrderAudit`, `getOrganizationTimezone`, `getAppFrame`, `auditActorLabels` | **idéntico** | **0** — «Unidades» sale de la lectura que la ficha ya hacía |

**La primera lectura declarada no es una llamada de página**: las unidades por recepción van dentro
del mismo `select` de `listGoodsReceipts` y de `getGoodsReceipt`, **reemplazando** a la subconsulta
de `lineCount`, que se fue con D-7. **La segunda —el filtro de proveedor— es la única llamada
agregada en las cuatro pantallas.** Dos lecturas declaradas, y ninguna tercera.

### Las cuatro mediciones

**Las cuatro son independientes y ninguna hereda la salvedad de otra.**

- **M-1 · Medido, no razonado.** El recuento de sentencias de la lista es **2 con una recepción y 2
  con veinticinco** —`countGoodsReceipts` y `findGoodsReceipts`, y el recuento de la página y las
  cuatro subconsultas correlacionadas viajan **dentro de la segunda**—, y el de `getGoodsReceipt` es
  **7 antes y 7 después**. *Corregido el 2026-11-06, hallazgo 2 de la revisión independiente*: este
  párrafo atribuía las dos sentencias al `limit 51` del filtro de proveedor y a la lista. **El
  número es correcto y la atribución era falsa**: el filtro es una llamada aparte, que la página hace
  y que esta medición no cuenta, así que la **página** manda más de dos. Un lector que hubiera usado
  el párrafo anterior como línea de base habría medido otra cosa. El «antes» no se dedujo: se midió **sobreescribiendo los tres archivos de
  `purchasing` con `git show HEAD:<ruta>`**, corriendo la medición y restaurándolos, con
  `git diff --stat` devuelto a 67/109/6 líneas como comprobación de que la restauración fue exacta.
  *Apretado el 2026-11-06, hallazgo 3 de la revisión independiente*: lo versionado fijaba
  **igualdad** entre las dos corridas de la lista y un **techo de 8** para la ficha, de modo que
  **una sentencia de más pasaba en verde** y la cifra de 7 quedaba como afirmación de esta
  autoevaluación. Hoy la prueba fija **`toBe(2)`** y **`toBe(7)`**: las cifras de AC-8 se vuelven a
  comprobar solas. Lo que sigue sin ser repetible es la mitad **«antes»**, medida una vez
  sobreescribiendo los tres archivos con `git show`, y queda dicho.
  El arnés envuelve **los clientes que entrega `pool.connect`** —nunca `Pool.query`, que contaría
  doble—, cubre las dos formas de `connect`, de callback y de promesa, y desenvuelve al terminar.
  **Lo que M-1 no mide está declarado**: cuenta sentencias, no filas leídas, y por ese hueco pasó
  N-1 de la 24.8.1. Por eso existe M-2.
- **M-2 · Medido con `explain`, y lo que mostró está escrito tal cual.** Con **2.100 recepciones**,
  la consulta vieja —`count(*)` de líneas— y la nueva —`coalesce(sum(l.quantity), 0)`— dan **el mismo
  plan**: `Limit → Result → Sort (top-N heapsort, 34 kB) → Seq Scan on goods_receipts`, con las
  cuatro subconsultas correlacionadas a `loops=25`, resueltas por
  `goods_receipt_lines_receipt_position_unique`. La única diferencia es el ancho del `Aggregate`
  (4 → 32) y una décima de milisegundo sobre ~0,27 ms. **El nodo externo sí es un `Seq Scan` con
  `Sort`**, igual antes y después: eso **no lo empeora esta subfase**, y queda **declarado y no
  escondido**. La aserción versionada es la del `loops=25` por índice, para que la medición se pueda
  repetir; el plan completo se imprime con `CRM_SQL`.
- **M-3 · Medido.** `setViewportSize` a **320 y 375 px** y `scrollWidth` contra `clientWidth` en las
  **cinco** pantallas, con el **proveedor de nombre más largo elegido** en el `<select>`, la lista
  filtrada por él y el **paso de revisión** del alta. **Ninguna desborda**: el barrido está escrito
  en `goods-receipts.spec.ts` y se vuelve a correr solo. Es el instrumento que encontró 338 px en la
  24.7.2 y 239 px en la 24.7.3.
- **M-4 · Comprobado que falla, dos veces.** Con una unidad **reservada** de verdad, el caso nuevo se
  puso **rojo** al romper `voidBlockedHeading` para que no dijera el IMEI, y **rojo otra vez** al
  romper `voidBlockedDetail` para que no dijera el estado. Las dos roturas se revirtieron desde la
  copia y la suite volvió a verde. **Un caso en verde no prueba nada hasta que se lo ve fallar.**

### AC-18 · La comparación entrada por entrada, con las seis láminas abiertas

Las seis se abrieron de nuevo **al terminar de implementar**, no solo al planificar: la lámina 01,
la 02, la 03, la 04, la 05 y la de estados con sus tarjetas 2 y 3. De la tabla de diferencias del
brief:

- **Adoptadas y verificadas en pantalla**: V-1, V-2, V-3, V-5, V-6, V-7, V-10, V-11, V-12, V-13,
  V-16, V-19, V-21, V-22, V-25, V-27, V-28, V-30, V-34, V-38, más V-4 por D-4, V-29 por D-3 y
  V-32 por D-6.
- **Adoptadas en parte, con lo que falta dicho**: V-8 (el primer aviso del pie sí, el segundo no),
  V-15 (el recuento «{n} de {m} cargados» lo calcula el servidor en el paso 2; en el paso 1, sin
  JavaScript, no hay recuento vivo), V-18 (el título sí, la miga no), V-20 (las columnas y el
  «Quitar» sí, el tacho no: el juego de íconos no tiene uno y `icons.tsx` está fuera de la lista
  cerrada), V-31 («Imprimir» sí, el menú «⋮» no), V-37 (el error en su campo y el recuadro sí,
  «Revisar IMEI» no) y **V-33** (la tarjeta de la orden con sus campos apilados y la insignia
  «Abierta» sí; **la insignia «Falta 1» no**: lo que falta aparece como el campo de solo lectura
  «Falta recibir», que es la forma de V-13). *Reclasificada el 2026-11-06, hallazgo 5 de la revisión
  independiente*: este cierre tenía V-33 entre las adoptadas enteras, y es **un desvío de fidelidad
  visual que estaba sin declarar en la lista que existe para declararlos**.
- **No adoptadas, declaradas**: V-9 (la paginación y «Fechas en {zona}» se conservan), V-14 (sin
  `stepper`: el nativo solo viene con `type="number"` y la cantidad se escribe con coma), V-23 (las
  cinco filas), V-24 (sin «IVA incluido»), V-26 por D-1 (sin pestañas), V-35 por D-9 (la navegación
  global sigue visible en el teléfono) y V-36 (sin cámara, lector ni autoguardado).
- **V-17, la única diferencia con el propio brief.** V-17 decía que la miniatura no se dibuja y
  **que el grado sí**. La miniatura no se dibujó, y **el grado tampoco en el alta**: lo decidió el
  usuario en el turno, preguntado antes de implementarlo, y se declara acá porque **contradice lo
  que el brief dejó escrito**. En la **ficha** el grado sí aparece, junto a la batería, en la fila
  de cada unidad, y no cuesta una lectura: viene en la misma sentencia que el estado (H-3).

**Diez diferencias más aparecieron al mirar**, que la tabla del brief no tenía. Nueve se declaran y
**una se corrigió en el producto**:

| # | Lámina | Qué dibuja | Qué quedó |
|---|---|---|---|
| **A-1** | 01 | Los filtros **sin botón de envío**: filtran solos | **Declarada.** Sin JavaScript un formulario `GET` necesita su botón; «Aplicar filtros» es el mismo de la lista de órdenes, ya desplegada |
| **A-2** | 01 | Marcador de posición «Buscar número de recepción…» | **Declarada.** Queda «RC-000123 o ARC-000001», que dice los formatos que acepta, como la lista de órdenes dice «OC-000123» |
| **A-3** | 01 | «Ver» como botón con contorno por fila | **Declarada.** Es un enlace con chevron, la misma decisión que V-6 de la 24.8.1 ya desplegó |
| **A-4** | 03 | Asterisco rojo en «Proveedor» y «Moneda» | **Declarada.** El CRM marca lo obligatorio **con el rechazo** y no con un asterisco; estrenarlo en una pantalla lo volvería convención de todas |
| **A-5** | 03 | Ícono de ayuda junto a «Costo unitario (ARS)» | **Declarada.** Lo que explica es «IVA incluido», que **V-24 descarta**: un ícono sin nada verdadero que decir no se dibuja |
| **A-6** | 02 vs 03 | El resumen de la 02 dice «Una unidad nueva» y «Costo de la unidad»; el de la 03, Productos / Unidades / Costo recibido | **Declarada.** Se unificó en el de la 03, que sirve para los dos casos; el de la 02 solo sirve cuando entra **una** unidad serializada |
| **A-7** | 05 | «N° de remito (opcional)» **debajo** de la tarjeta del producto | **Declarada.** Va arriba, como en la 02: el dato es **de la recepción** y no de la línea, y las dos láminas se contradicen |
| **A-8** | 17-3 | «Revisá el pedido vinculado.» en el recuadro | **Declarada.** La página **no lee** de dónde viene la reserva; nombrar un pedido que no leyó sería afirmar algo que no sabe |
| **A-9** | 04 | «Unidades a anular» con Unidad · IMEI · Costo unitario · Estado | **Declarada.** Queda IMEI · Producto · Estado: «Unidad» se va con D-3, y «Producto» ocupa su lugar porque la tabla es **una sola para toda la recepción** y con más de una línea es lo que distingue cada unidad; el costo unitario es el de la línea y está en la ficha |
| **A-10** | 04 | El título en afirmación: «Anular recepción RC-000091» | **Corregida en el producto.** Decía «¿Anular la recepción {número}?», heredado de la 22.5. Hoy dice **«Anular recepción {número}»**, con el mismo precedente que la **D-3 de la 24.8.1** cerró para «Cerrar {número} con faltante». El caso de teclado que miraba esa cadena se actualizó y sigue verde |

Una aclaración que no es diferencia: **el campo de IMEI es un `<details>`** que viene abierto cuando
el producto se lleva por unidad (brief-29.5, D-6), que es el caso que dibujan la 02 y la 05. Sin
JavaScript no se puede saber si un producto elegido a mano se lleva por unidad, y por eso el campo
existe plegado para todos; en la pantalla de la lámina se ve igual.

### La batería local, con lo que no se pudo correr dicho

Todo lo de abajo es del **2026-11-06**, en la máquina del usuario, y es **autoevaluación**.

| Puerta | Resultado |
|---|---|
| `npx tsc --noEmit` | **Limpio.** |
| `npx eslint` sobre los archivos tocados | **Limpio.** No se usó `npm run lint`, que acá da 749 errores de archivos ignorados por git. |
| `npx prettier --check` sobre los archivos tocados | **Limpio**, el brief incluido. |
| Vitest, unitarias | **123 archivos / 1.315 casos, verdes.** |
| Vitest, guardas | **33 archivos / 920 casos, verdes**, incluidas `purchasing-dependencies`, `cost-writes`, `stock-writes` y `exposed-surface`, que son las que vigilan lo que esta subfase toca. |
| `npm run build` | **Correcto.** `BUILD_ID` del **2026-11-06T22:32:06.772Z**, que la guarda de frescura imprime en cada corrida de extremo a extremo. |
| Vitest, integración | **No se pudo correr la batería entera de forma confiable. Ver abajo.** |
| Playwright | **Corrido en tandas. 33 de 34 casos, con una falla que no reproduce. Ver abajo.** |

**La integración, sin maquillar.** La primera corrida terminó con **3 archivos y 3 casos en rojo
sobre 115 / 1.931**. Dos cosas se perdieron ahí por **un error de instrumentación mío**: canalicé la
salida por `tail -12` para no inundar el contexto, y la tubería **devolvió el código de salida de
`tail`**, así que un rojo llegó informado como `exit code 0`, y el recorte **se comió los nombres de
los tres archivos**. La segunda corrida, con la salida entera, **la cortó el sistema a los pocos
segundos por falta de memoria** (0,69 GB libres de 7,68). Por decisión del usuario se corrió
entonces **el conjunto afectado**, que resultó ser de **19 archivos y no de 4**: los dos que esta
subfase modifica, los diecisiete que leen recepciones o unidades, y `product-audit.test.ts` y
`catalog.test.ts`. **21 archivos / 471 casos, todos verdes**, `supplier-payments.test.ts` incluida,
que era uno de los dos sospechosos de la nota del entorno. `product-audit.test.ts` —el único de los
tres rojos cuyo nombre sobrevivió al recorte— **pasa corriéndolo solo**.

Lo que **no** se puede afirmar: **dos de los tres archivos en rojo siguen sin identificar**, y 94 de
los 115 no se volvieron a correr. **La batería entera la resuelve la CI en AC-19**, en su propia
máquina y de una sola vez, y hasta entonces esto **no es** una batería de integración en verde. Lo
que sí queda establecido es más acotado y es lo que importa para el riesgo: **todo archivo que esta
subfase toca y todo archivo que lee lo que cambió está verde.**

**Playwright, en tandas**, porque la batería completa mata al servidor local a los 19 minutos y
correrla de una vez es trabajo de la CI. Las cuatro specs del alcance, todas con el build de las
22:32:06 UTC:

- `goods-receipt-voids.spec.ts` — **8 de 8**.
- `goods-receipts.spec.ts` — **5 de 5**, incluido el barrido de M-3.
- `purchase-orders.spec.ts` + `units.spec.ts` — **20 de 21**, con una falla.

**La falla, y por qué no es una regresión de esta subfase.** `units.spec.ts:475`, el estado
«comprobante de la anulación con IMEI»: axe reportó `document-title: html` sobre el comprobante de
anulación de una **venta**. Tres hechos, medidos y no deducidos: el caso está en la línea 475 y
**las cuatro porciones que esta subfase cambió en ese archivo están en el ayudante y en el caso de la
línea 196**; la página es `ventas/[saleId]/anulacion/page.tsx`, **fuera de la lista cerrada**, y
**define su título estáticamente** (`"Anulación — AI WhatsApp Agent CRM"`), igual que las otras
cuatro páginas de anulación del CRM; y el propio ayudante comprueba `toHaveTitle(/.+/)` **sobre esa
misma página, milisegundos antes** de que axe dijera que no hay título, de modo que las dos lecturas
se contradicen. Eso es la forma de una carrera. **Re-corrido solo con `--repeat-each=2`: 2 de 2.**
Queda declarado como **falla que no reproduce**, no como verde, y no se tocó nada para taparlo.

**Una corrección que salió de mirar la corrida**, y que se declara porque cambia un recuento que
este mismo cierre afirma: el caso del barrido de viewports se llamaba **«las cuatro pantallas
entran en 320 y 375 px»** y su cuerpo recorre **cinco** —lista, alta sin orden, alta con orden,
ficha y anulación— más tres estados (la lista con el proveedor largo elegido, la lista ya filtrada y
el paso 2 del alta). **El título se contaba de menos a sí mismo**; hoy dice «las cinco pantallas».
Es una cadena del propio nombre del caso, no una aserción: no cambia conducta y no mueve el recuento
del `git diff`, porque la línea pertenece a un bloque que esta subfase agregó.


### AC-20 · La revisión independiente, y qué se hizo con cada hallazgo

Un agente que **no participó del trabajo**, con acceso de solo lectura, revisó la entrega contra este
brief y contra las reglas vigentes. **Veredicto: R2** —un bloqueante y siete no bloqueantes—, y
**ningún defecto bloqueante en el código entregado**: el bloqueante era una contradicción entre el
código y `docs/product/Screens.md` que **ninguna parte de esta autoevaluación había visto**.

**El revisor no otorgó ninguna autorización**, y así lo declaró. Los ocho hallazgos se verificaron
**uno por uno contra el código** antes de aceptarse, y **los ocho resultaron ciertos**. Seis caían
dentro de la lista cerrada y se corrigieron; los dos que caían fuera se le preguntaron al usuario
**antes** de tocar nada, y los autorizó en el turno.

| # | Hallazgo | Verificación | Qué se hizo |
|---|---|---|---|
| **1** | **BLOQUEANTE.** `Screens.md` §45 sigue diciendo en presente cuatro cosas que esta entrega volvió falsas: la tarjeta «Recepciones» con **«Líneas»**, la oración «Se registró la recepción RC-000091 **por US$ 1.020,00**.», «su oración dice **el monto y no las unidades**» y «**las columnas «Unidades» … no se dibujan**». | **Cierto.** Las cuatro están en `Screens.md:934`. Y la §45 las había escrito como *todavía no*: dice que ese recuento «es la lectura que **la 24.8.1-b** trae», que es esta subfase. | **Corregido, fuera de la lista cerrada y con autorización del usuario en el turno.** Una viñeta fechada en la §45 jubila las cuatro cadenas nombrándolas, con el mismo patrón que la propia sección ya usaba. D-8 había acotado el permiso a las §§46–49: **la ampliación se declara acá y en la lista cerrada**. |
| **2** | El relato de M-1 atribuye las dos sentencias al `limit 51` del filtro de proveedor y a la lista. | **Cierto.** El arnés mide **solo `listGoodsReceipts`** (`tests/integration/goods-receipts.test.ts:1571`), cuyas dos sentencias son `countGoodsReceipts` y `findGoodsReceipts`; el filtro es una llamada aparte que la medición no cuenta. **El número 2 era correcto y la atribución falsa.** | **Corregido** en §«Las cuatro mediciones». Importa porque quien usara ese párrafo como línea de base habría medido otra cosa. |
| **3** | El artefacto repetible de M-1 es más débil que las cifras que AC-8 afirma: fijaba **igualdad** y un **techo de 8** para una cifra de 7. | **Cierto.** Una sentencia de más pasaba en verde. | **Corregido en código**: la prueba fija **`toBe(2)`** y **`toBe(7)`**, y **se volvió a correr en verde**, así que las cifras de AC-8 se comprueban solas. La mitad «antes» sigue sin ser repetible, y queda dicho. |
| **4** | `getUnitSerials` quedó **sin un solo consumidor** —esta subfase mudó el único a `getUnitSummaries`— con su comentario diciendo todavía «para el detalle de una recepción». | **Cierto.** Cero llamadas en todo el repositorio. Es la misma lección que el cierre de la 24.8.1 registró por `lineCount`, repetida sobre una función. | **Borrada, fuera de la lista cerrada y con autorización del usuario en el turno**: la función y su línea del barrel. Se comprobó antes que **no hay cascada** —`findUnitsByIds` conserva consumidor en `getUnitSummaries`— y que **ninguna guarda enumera esos exports por nombre**. El comentario de `goods-receipts.ts` que la nombraba en presente también se corrigió. |
| **5** | **V-33** está clasificada entre las «adoptadas y verificadas en pantalla», y su insignia **«Falta 1» no se dibuja**. | **Cierto.** `OrderCard` dibuja solo la insignia «Abierta»; la única aparición de «Falta» en el formulario es el campo de solo lectura «Falta recibir», que es la forma de **V-13**. | **Reclasificada** a «adoptadas en parte». Era **un desvío de fidelidad visual sin declarar, en la lista que existe para declararlos**. |
| **6** | Dos citas equivocadas en comentarios nuevos: `units.spec.ts` atribuye los dos pasos a **D-2**, y `goods-receipt-voids.spec.ts` atribuye el título en afirmación a **V-32**. | **Cierto.** D-2 decide «"Productos recibidos", por unidad o por línea»; V-32 decide el contenido de la anulación, no su título. | **Corregidas**: los dos pasos citan **V-10, V-15 y AC-3**; el título cita **A-10 de este §Cierre**. Una cita que apunta a la decisión equivocada manda a releer la decisión equivocada. |
| **7** | Tercera copia local de `TRACKING_LABEL`, tipada `Record<string, string>` y sin prueba que la fije. | **Cierto.** Ya existían dos, las dos tipadas contra `StockTracking`, y la de `compras/ordenes/messages.ts` **fijada por `messages.test.ts:203`**. El formulario **ya importaba de esa carpeta vecina**, así que compartirla no cruzaba ninguna frontera. | **Unificada**: se importa la de `ordenes/messages`, con la comprobación antes de indexar que ya usa `productos/[productId]/audit-summary`. La pantalla hereda la prueba que fija el rótulo. |
| **8** | El §Cierre se fechaba **2026-11-07**. | **Cierto.** Lo escribí tomando la hora **UTC** de la CI; en hora local era el **2026-11-06**. | **Corregido.** Las fechas de los cierres son el eje con el que este proyecto ordena qué afirmación es vigente. |

**El límite que el propio revisor declaró, y que no se tapa**: no tuvo herramienta `Bash`, así que
**no pudo correr un solo comando de `git`** y dejó explícitamente sin verificar todo lo que depende
del diff —el recuento de 24 archivos, que no haya nada fuera de la lista cerrada, las tres entradas
de `purchasing`, la tabla de AC-10 y que el comprobante de la anulación no cambiara—. **Esa mitad
sigue siendo autoevaluación.** Lo que sí se puede ofrecer como evidencia independiente del alcance
es el cruce que se corrió antes de commitear: el conjunto preparado contra la tabla de la lista
cerrada dio **nada fuera de ella**, y las cinco entradas sin preparar fueron `CHANGELOG.md`,
`HANDOFF.md`, `docs/planning/Roadmap.md` y los dos archivos autorizados que no hicieron falta.

**Lo que el revisor buscó y no encontró**, que es tan informativo como lo que encontró: ninguna
coincidencia de Airtable en `src/` ni en el brief; ninguna referencia al repositorio del agente de
WhatsApp; ninguna migración, tabla, valor de enum ni contrato nuevo; ninguna tabla vacía ni módulo
especulativo; ninguna lista de tareas viva agregada; nada de ERP fuera de la fila abierta;
`purchasing` **no importa `cash`**; **ninguna acción ni ruta nueva** en la superficie expuesta; el
estado derivado de la orden **sin riesgo de decir dos cosas en dos pantallas**; la §50 intacta; y
—lo que más importaba de todo el encargo— **ninguna de las cinco aserciones que cambiaron se
debilitó para pasar**.

**Deuda documental que el revisor midió y que este cierre no podía tocar todavía**, porque los cuatro
archivos están autorizados «al cerrar, y con autorización en el turno»: `HANDOFF.md:6`, `:26` y `:68`
siguen diciendo que la 24.8.1-b está «**todavía sin brief**»; `CHANGELOG.md:30` dice que la columna
«Unidades» «**no se dibuja**»; y la fila del `Roadmap.md:483` sigue descrita como abierta. **Las
cinco son falsas hoy** y se saldan en el cierre administrativo, después del despliegue.

**La segunda corrida de CI, que es la que prueba estas correcciones.** Las ocho fueron al commit
**`ccb980d`** —9 archivos, +140/−53—, empujado a `main` el 2026-11-07 con autorización del usuario
en el turno, y la CI **42374240790** volvió en **`success`** sobre
`ccb980d9c6cb7430a56c9539f40dd4c88f6704af`, con **«Corre todo: true»**: **21 pasos en verde**, y el
único no exitoso **salteado** —«Subir artefactos de Playwright», que solo corre cuando algo falla—.
Las cifras: **guardas 33/33**, **unitarias 123/123**, **integración 115/115** y **e2e 386 en
17,4 min**.

**Por qué esta corrida no era una formalidad**: de los ocho arreglos, el del formulario —la
unificación de `TRACKING_LABEL`, hallazgo 7— **no estaba probado en extremo a extremo en ninguna
parte**. Editar el formulario dejó viejo el build local, y `playwright` **no construye**, así que una
corrida local en verde habría estado probando el código anterior. **Esta corrida de CI es la única
evidencia de que la pantalla sigue dibujando el rótulo correcto**, y por eso AC-20 no se declaró
cumplido antes de tenerla.


### AC-21 · El despliegue y las siete verificaciones

Desplegado el **2026-11-07** en `ccb980d9c6cb7430a56c9539f40dd4c88f6704af`, con autorización del
usuario en el turno. `rc=0`, `BUILD_ID` presente, **cero reinicios** del servicio y **163 segundos de
caída** (13:47:10 → 13:49:53 UTC, un solo `Stopped` y un solo `Started`, **leídos del journal y no
inferidos** del tiempo total del script). HEAD igual al SHA pedido. Y **67 migraciones aplicadas
contra 67 versionadas**: es AC-15 comprobado también del lado de producción —`db:migrate` corrió y no
tenía nada que aplicar—, que es lo que una subfase sin migraciones tiene que mostrar.

Es la **quinta prueba real** de las correcciones que dejó la 24.7.2 —swap de 2 GB, build desacoplado
del `ssh` y arranque decidido por el `BUILD_ID` y no por el código de salida del build— y las tres
volvieron a funcionar. **El swap no siguió la serie que la 24.8.1 dejó anotada**: 78 MB en la
24.7.2-b, 84,7 en la 24.7.3, 160 en la 24.8.1, y ahora **79 MB antes del build y 96 después**. La
cifra **bajó** en vez de subir, así que esa serie **no describe una fuga** y no conviene leerla como
una: el `used` de swap baja cuando el kernel recupera páginas o mueren los procesos que las tenían.
Lo único que esta medición afirma es que **el pico de este build costó 17 MB** de swap, con 1.459 MB
disponibles al empezar y 1.640 al terminar.

Las siete verificaciones, todas en verde:

1. **18 de 18** archivos de configuración desplegados **idénticos** a los versionados.
2. **Un solo salto de proxy, medido por consecuencia** sobre `login_attempts.key_hash`: **dos filas
   en la ventana de quince minutos**, las dos de recién (13:52:44 y 13:52:47 UTC), con **dos claves
   distintas**; la del operador **igual** al `sha256` de su IP pública —o sea que la aplicación ve la
   IP del cliente y no una interna—, la del control negativo **distinta**, y **ninguna igual al
   `sha256` de `'sin-proxy'`**, que es lo que `src/modules/auth/service.ts` hashea cuando no recibe
   IP. El control negativo fue **la variante del README** —el mismo `curl` del intento, corrido
   **dentro del droplet** contra el dominio público, que sale a internet y vuelve por nginx—, y **no
   se gastó el intento del túnel SOCKS**, como el propio runbook aconseja desde que el clasificador
   de permisos del asistente lo rechaza.
3. **HSTS** presente sobre HTTPS (`max-age=31536000; includeSubDomains`) y **ausente** sobre HTTP,
   que devuelve **301** al dominio seguro. El segundo es el que le da valor al primero.
4. La aplicación escucha **solo en `127.0.0.1:3000`**.
5. El rol de la aplicación **no es el dueño**: `crm_app_login` contra `crm_owner`, con **`INSERT=t`,
   `UPDATE=f` y `DELETE=f`** sobre `audit_logs`, leído del catálogo y sin mandar ninguna escritura.
6. **Ingestión y lectura desde afuera en `401`** en las tres rutas: `POST /api/ingestion/v1/events`,
   `POST /api/ingestion/v2/events` y `GET /api/read/v1/products`.
7. **Ningún dato real de un cliente**, comprobado **por organización** y no en total: **«Vixora» en
   0 clientes, 0 mensajes y 0 productos**, y las otras dos son de demostración —«Demostración
   Vixora» en 2/130/13 e «iPhone Demo» en 2/157/38—.

**Ni la IP ni su hash salieron de la shell ni entran acá**: el script de la verificación 2 imprime
solo la hora de cada fila y el veredicto de la comparación, nunca un hash. Un `sha256` de una IPv4
sin sal se revierte en minutos y **este repositorio es público desde el 2026-10-30**.

Además, `/compras`, `/compras/ordenes`, `/compras/recepciones` y `/compras/recepciones/nueva`
responden **`307` al ingreso** desde afuera, que es lo correcto sin sesión y prueba que **el build
nuevo las sirve**.

### El recorrido del usuario, primer tramo: cuatro defectos visuales y su corrección

El usuario abrió las pantallas desplegadas y **paró en las primeras**: «a simple vista se ve que
estéticamente hay cosas fuera de su lugar, todo improlijo, los botones salidos de las tarjetas o
desalineadas, también cuadros para insertar texto deformes, texto encima de otro». Los cuatro
defectos son reales, están medidos y **ninguna prueba de esta subfase los buscaba**. Esto es
exactamente lo que el punto 3 de la lista de abajo anticipaba de la 24.7.3: una revisión contra el
diseño no encuentra un defecto del diseño.

**Antes de corregir se midió, y la primera explicación que dio el asistente resultó falsa.** Dijo
que las siete columnas no entraban «en la ventana del usuario», con una cuenta de anchos. El
navegador lo desmintió: la fila medía **714 px tanto a 1.280 como a 1.920**. La causa real es que
`main` lleva `max-w-6xl` —1.152 px— y el contenido no crece nunca: la fila ya se salía de su
contenedor, y a 1.280, con el resumen de 20rem al costado, el contenedor eran **574 px**. La
corrección se decidió sobre la medición, no sobre la cuenta.

| # | Lo que se veía | Lo medido | La corrección |
|---|---|---|---|
| 1 | «ProdSKUto»: el rótulo «Producto» encima del de «SKU» | Las siete columnas fijas pedían **680 px** de ancho más gaps donde la fila tiene **670** de contenido: a «Producto» le quedaban **2 px** y el campo quedaba de **26 px** | `FREE_LINE_GRID` pasa a columnas fluidas, `minmax(10rem,1fr)` para «Producto» y el resto ajustado al contenido real, con `gap-x-2` |
| 2 | «Quitar» afuera de la tarjeta | Fila de **714 px** en un contenedor de **574** a 1.280 px | La tabla se dibuja **desde `xl` (1.280)** y el resumen **baja hasta `2xl` (1.536)**: decisión del usuario en el turno, entre tres opciones medidas |
| 3 | Los tres campos de «Datos de la recepción» arrancando a alturas distintas | «Remito o factura del proveedor (opcional)» ocupa dos renglones y los otros uno | `FIELD_LABEL_ALIGN`, un piso de alto compartido de `sm:min-h-10` |
| 4 | «+ Nueva recepción» solo, en un renglón propio, pegado al borde | Caía **a todo ancho medido**: 1.280, 1.440 y 1.680 px | Los tres controles de acción agrupados en un bloque con `sm:ml-auto`: o entran los tres, o bajan los tres juntos |

Se arregló además la cabecera de la tabla, que estaba corrida de sus celdas: las filas son
`fieldset` con `p-4` y un borde de 1 px, así que su contenido arranca a 17 px y la cabecera
necesita `px-[17px]`, no `px-1`.

**El defecto 3 se corrigió dos veces en el mismo turno.** La primera versión del piso de alto usaba
`sm:flex`, y un `label` en `flex` convierte el texto y el `<span>` de «(opcional)» en **dos ítems
del flex**: «(opcional)» se iba al costado del bloque y se comía el espacio que los separa. Se vio
en la captura posterior a la corrección, se midió y quedó en `sm:block sm:min-h-10` —`block` porque
un `label` es `inline` y un `inline` no respeta `min-height`—.

**Lo medido después de corregir**, sobre el build de producción servido localmente:

- **Sin desbordes en ningún ancho**: 375, 768, 1.024, 1.280, 1.440, 1.536, 1.680 y 1.920 px. La fila
  mide exactamente lo que su contenedor en los ocho —301, 694, 662, 918, 1.046, 702, 702 y 702—.
- **Los tres campos alineados** a 768, 1.024, 1.280, 1.440 y 1.680 px: los tres arrancan en la misma
  `y` (408 o 410) en los cinco anchos.
- **La cabecera arranca donde arranca cada columna**, con una desviación tolerada de 1 px.

**La prueba que faltaba.** El defecto pasó porque el barrido de M-3 **no podía encontrarlo**: mide
`scrollWidth` del documento a 320 y 375 px, anchos donde la tabla ni siquiera se dibuja, y un
desbordamiento *dentro* de una tarjeta no mueve el `scrollWidth` del documento. Se agregó a
`tests/e2e/goods-receipts.spec.ts` el caso **«la tabla de productos entra en su tarjeta a los anchos
de escritorio»**, que a 1.280, 1.440, 1.536 y 1.680 px comprueba cuatro cosas: la fila entra en su
contenedor, ningún control se sale de la fila, el campo de producto nunca baja de 9rem y cada rótulo
de la cabecera arranca donde arranca su celda.

**Se demostró que falla.** Se puso en su lugar el `goods-receipt-form.tsx` de `ccb980d`, se
construyó, y el caso nuevo devolvió **12 problemas a 1.280 px**: «la fila (714 px) se sale de su
contenedor (574 px)», «"Quitar la línea 1" se sale de la fila», «el campo de producto mide 26 px,
menos de 9rem» y los seis rótulos corridos de su columna. Después se restituyó la versión corregida
y se volvió a construir.

**Las baterías, sobre el build final:** `tsc --noEmit` **0 errores**, `eslint` sobre los tres
archivos **0**, `prettier --check` limpio, y Playwright **26 de 26** sobre `goods-receipts`,
`goods-receipt-voids`, `order-receipts` y `receipts` —incluido el barrido de M-3 y el caso nuevo—,
revalidadas 14 de 14 después de la segunda corrección del rótulo.

**Nada de esto salió de la lista cerrada de archivos**: los tres tocados son el 1
(`recepciones/page.tsx`), el 8 (`nueva/goods-receipt-form.tsx`) y el 18
(`tests/e2e/goods-receipts.spec.ts`).

**Lo que no se tocó, y por qué:** el botón «Quitar» sigue siendo texto y no un ícono de tacho,
porque el set de íconos no tiene uno y `icons.tsx` está fuera de la lista cerrada; y el rótulo
«Remito o factura del proveedor» conserva su texto, que está registrado en `Screens.md:954` y lo
afirman cuatro casos e2e.

Estas correcciones **no están desplegadas**: viven en el árbol de trabajo, sin commit. El recorrido
del usuario sigue abierto, y no puede continuar en producción hasta que se autoricen `commit`,
`push`, CI y un despliegue nuevo.

### Lo que falta para cerrar, y de quién depende

Nada de esto lo puede hacer el asistente por su cuenta: **los tres primeros necesitan autorización
del usuario en el turno** (condición de detención 6).

1. ~~`commit` y `push`, y con ellos AC-19.~~ **Hecho el 2026-11-07, con autorización del usuario en
   el turno**: commit **`34839a6`** con 25 archivos —los 24 de la subfase más este brief—, empujado
   a `main`, y la CI **42316301814** en `success` sobre el SHA exacto con «Corre todo: true». Con
   eso quedó resuelta también **la batería de integración completa** que esta máquina no pudo
   terminar.
2. ~~**AC-20**, la revisión independiente.~~ **Hecha el 2026-11-06**: veredicto **R2**, ocho
   hallazgos, los ocho ciertos, los ocho resueltos. La subfase **abre el bloque de Abastecimiento en
   su segunda fila y cierra la fila original de la 24.8.1**, así que no podía cerrarse con
   autoevaluación, y el bloqueante demuestra por qué: **lo encontró el revisor y no este cierre**.
   El revisor **no otorgó ninguna autorización**. Las ocho correcciones fueron al commit
   **`ccb980d`**, empujado a `main` el 2026-11-07 con autorización del usuario en el turno, y la CI
   **42374240790** volvió en `success` sobre ese SHA. El detalle, al final de §«AC-20».
3. **AC-21**. ~~El despliegue~~ **hecho el 2026-11-07**, con las **siete verificaciones en verde**
   (§«AC-21 · El despliegue y las siete verificaciones»). Falta **el recorrido del usuario**, que es
   la mitad que ninguna revisión puede hacer por él: en la 24.7.3 encontró dos defectos que las dos
   revisiones no habían visto, porque una revisión contra el diseño no puede encontrar un defecto
   del diseño. Su **primer tramo ocurrió el 2026-11-07 y encontró cuatro defectos visuales**, los
   cuatro ciertos y ninguno visto por la revisión independiente ni por las cuatro mediciones:
   están corregidos, medidos y con una prueba de regresión que se demostró **roja contra el build
   de `ccb980d`** (§«El recorrido del usuario, primer tramo»). Faltan entonces dos cosas: **llevar
   esas correcciones a producción** —`commit`, `push`, CI sobre el SHA exacto y un despliegue
   nuevo, cada uno con autorización del usuario en su turno— y **que el usuario termine el
   recorrido** sobre lo desplegado. **Hasta que ocurra, el nivel es «validado en integración» y no
   «validado en staging».**
4. Después del despliegue, el cierre administrativo: **CHANGELOG, Roadmap, HANDOFF**, el estado en
   **Notion** —la subfase a «Completado» y su espejo— y el **Knowledge Capture** en el vault y en el
   hub del CRM.

Dos cosas que **no** son de esta subfase y no entran en su commit:

- **`.claude/settings.json`**, sin versionar, que apareció en el `git status` al abrir la sesión.
- El objetivo táctil de **44 px** y el desbordamiento del `<select>` de «cobrar a cuenta» y «pagos a
  proveedores», los dos medidos y con subfase propia pendiente, y la sección de estado de 324 líneas
  del hub. Ninguno se arregló acá y ninguno es un hallazgo nuevo.
