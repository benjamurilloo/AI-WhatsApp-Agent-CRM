---
schema: task-brief.v1
task_id: 24.8.1
task_type: implementation
generated_at: 2026-11-06
---

# Brief 24.8.1 — Compras: órdenes y recepciones

- **Estado**: **aprobado por el usuario el 2026-11-06 con las recomendaciones**, con **D-1 a D-8
  cerradas en su opción (a)**. En implementación.
- **Partida al aprobarlo (D-1)**: la fila del Roadmap abarcaba órdenes **y** recepciones. Las
  recepciones pasan a la **24.8.1-b**, hermana y no subtarea. El motivo está medido en H-1.
- **Origen**: fila «24.8.1 Compras: órdenes y recepciones» de
  [Roadmap.md](../planning/Roadmap.md), §Fase 24. Abre el **bloque de Abastecimiento**, el que
  sigue al de Finanzas que cerró la 24.7.3.
- **Láminas**: lote **V2-11**, nueve piezas repartidas en dos carpetas —
  [25-compras](../ui-redesign/v2/25-compras/README.md): `01-ordenes-compra-v2.png`,
  `02-nueva-orden-compra-v2.png`, `03-orden-parcial-v2.png` y
  `estados/04-estados-compras-proveedores-v2.png`;
  [26-recepciones](../ui-redesign/v2/26-recepciones/README.md): `01-recepciones-compra-v2.png`,
  `02-recibir-imei-con-orden-v2.png`, `03-recepcion-sin-orden-v2.png`,
  `04-detalle-anulacion-recepcion-v2.png` y `mobile/05-recibir-imei-mobile-v2.png`.
- **Contratos de negocio**: [ADR 0023](0023-compras-y-proveedores.md) y los briefs
  [22.3](brief-22.3-la-orden-de-compra.md), [22.4](brief-22.4-la-recepcion.md) y
  [22.5](brief-22.5-la-anulacion-de-la-recepcion.md), que construyeron lo que acá se redibuja.

## Objetivo

Que las pantallas de **órdenes de compra** tengan la forma de sus láminas, **sin cambiar una sola
regla de la compra**: ni las transiciones de estado, ni las validaciones del alta, ni el efecto de
una recepción sobre la orden. Es un rediseño, como la 24.7.1 y la 24.7.3: lo que cambia es **cómo se
compone lo que ya se lee**, más **dos lecturas nuevas, las dos declaradas**: la que la fila del
Roadmap anuncia y la que pide el filtro de proveedor de D-5.

Las recepciones quedan fuera, en una subfase hermana. El motivo está medido en **H-1** y la decisión
es **D-1**.

## Punto de partida verificado

Leído en el código en `HEAD` (`6eb0425`), no en la documentación.

**Lo que existe hoy, en líneas, sin contar tests:**

| Ruta | Archivos | Líneas |
|---|---:|---:|
| `/compras/ordenes` (lista, alta, ficha, confirmaciones) | 13 | **2.185** |
| `/compras/recepciones` (lista, alta, ficha, anulación) | 11 | **2.910** |
| **Total de la fila** | 24 | **5.095** |

El módulo `src/modules/purchasing/` son **5.224 líneas en 17 archivos**, y casi no se toca: la fila
es de pantallas.

**Lo que las pantallas de órdenes ya hacen**, y que por lo tanto no hay que construir:

- La lista pagina de a 25 en SQL, con el número enlazado, la fecha, el proveedor, la cantidad de
  líneas, el total y el estado con icono y texto; filtra por número y por estado; en teléfono,
  tarjetas. El proveedor **llega por la URL**, no por un control.
- El alta arranca con **cinco líneas** —para que ande sin JavaScript— y con JavaScript agrega y quita
  hasta 50; proveedor y producto con el buscador del pedido; moneda sin preseleccionar; costo con IVA
  incluido y sin proponer.
- La ficha es **la página imprimible** que se le manda al proveedor, con «Recibido» y «Falta» por
  línea desde la 22.4, la tarjeta «Recepciones» con las anuladas marcadas desde la 22.5, la historia
  de auditoría paginada, «Cancelar la orden» y «Cerrar con faltante» en **segundos pasos de la URL**
  (`?confirmar=cancelar`, `?confirmar=cerrar`), y los estilos de impresión.
- La barra de Compras **ya tiene las cinco pestañas de la lámina** —Órdenes de compra, Recepciones,
  Pagos, A pagar, Proveedores— en `purchasing-sub-nav.tsx`. La §43 de `Screens.md` todavía dice
  «tres»: es prosa vieja, no una diferencia con la v2.

## Las fronteras entre módulos, releídas con `grep`

Releídas acá contra `docs/architecture/Overview.md`, no recordadas, como manda el paso 5 de la
metodología:

- Fila de `purchasing`: depende de **`catalog`, `inventory`, `numbering`, `organizations` y
  `audit`**, y de `auth` solo en `schema.ts`. **No depende de `cash`**: lo fija la guarda
  `tests/guards/purchasing-dependencies.test.ts`. Los que dependen de `purchasing` son `cash` y
  `service`.
- `Overview.md:49` — «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`».
- **Todo el alcance de esta subfase se resuelve dentro de `purchasing`**: lo recibido por orden sale
  de `purchase_order_lines` y `goods_receipt_lines`, las dos tablas del módulo. El único dato de
  afuera es `tracking`, de `catalog`, del que `purchasing` ya depende, y que **ya viaja** (H-4).
- **No hay contradicción entre los documentos de arquitectura y el diseño aceptado.** Tampoco entre
  el README del lote y el ADR 0023: los dos dicen que la orden no se edita, que cerrada y cancelada
  son finales, y que una anulación de recepción no reabre una orden cerrada.

## Hallazgos que condicionan el alcance

### H-1 · El tamaño: 5.095 líneas y nueve láminas en una sola fila

Medido arriba. Para comparar con lo que ya pasó en esta fase:

| Subfase | Lo que la obligó a partirse | Líneas |
|---|---|---:|
| **24.6.2-d** | el cobro era una ruta aparte | 1.049 |
| **24.7.2** | seis láminas, seis páginas | 1.227 |
| **24.8.1** | **nueve láminas, veinticuatro archivos** | **5.095** |

Es **más del cuádruple** de lo que forzó la partición de la 24.7.2, y **la 24.5.1 y la 24.6.1
volvieron R2 de la revisión independiente por exceso de alcance**. El corte natural existe y es
limpio: órdenes (2.185 líneas, 4 láminas) contra recepciones (2.910, 5 láminas).

**El corte también parte las lecturas nuevas, una para cada lado.** La fila anuncia dos: «lo
recibido en la lista» es de la lista de **órdenes**; «unidades por recepción» es de la ficha de la
**recepción**. Ninguna de las dos mitades se queda sin su trabajo de datos ni carga el de la otra.

Ver **D-1**.

### H-2 · «Cerrada · Completa» y «Cerrada · Con faltante» no son estados de la base

La lámina 01 dibuja **cuatro** etiquetas de estado: Abierta, Cerrada · Completa, Cancelada y
Cerrada · Con faltante. El enum `purchase_order_status` tiene **tres** valores —`open`, `closed`,
`cancelled`— y el trigger de la migración `0048` fija las transiciones entre ellos.

La distinción **no es un estado nuevo: es una derivación**. Una orden cerrada con alguna línea
pendiente es «con faltante»; sin ninguna, «completa». La ficha ya tiene el dato, porque
`PurchaseOrderLine` trae `received` y `pending`. **La lista no lo tiene**: `PurchaseOrderListRow`
son las columnas de la orden más `supplierName` y `lineCount`, las dos subconsultas correlacionadas.

**Eso es exactamente «lo recibido en la lista», la lectura nueva que la fila anuncia**, y no hace
falta ninguna migración para tenerla. Se resuelve con una tercera subconsulta en el mismo `select`,
no con una consulta por fila: la 24.6.2-b midió que la forma obvia costaba **252 consultas** en una
página de 25. Ver **M-1** y **AC-4**.

### H-3 · La lámina 17 de estados no es de una subfase: se reparte en tres

`estados/04-estados-compras-proveedores-v2.png` dibuja seis tarjetas, y **pertenecen a tres
subfases distintas**:

| # | Tarjeta | De quién es |
|---|---|---|
| 1 | Cerrar orden de compra con faltante | **24.8.1**, esta |
| 2 | IMEI duplicado en unidad | recepciones |
| 3 | No se puede anular una recepción | recepciones |
| 4 | Anular un pago de una sesión cerrada | **24.8.2** |
| 5 | Proveedor inactivo | **24.8.2** (proveedores) |
| 6 | Error al leer la cuenta | **24.8.2** (cuenta del proveedor) |

Esta subfase toma **solo la tarjeta 1**. Las otras cinco se declaran fuera y se nombran acá para que
la subfase que las implemente no tenga que volver a descubrirlo. Es el mismo caso que la tarjeta
«¿Anular R-000183?» de la lámina 09 del V2-10, que la 24.7.1 y la 24.7.2-b se repartieron.

### H-4 · La columna «Seguimiento» del alta no cuesta una lectura nueva

La lámina 02 agrega al alta una columna **«Seguimiento»** con «Por unidad». Parece un dato nuevo del
catálogo, y no lo es: `ProductSuggestion` **ya trae `tracking`** (`catalog/service.ts:338-343`), y
`searchPurchaseOrderProductsAction` **lo descarta al mapear** a `{ id, label, detail }`
(`ordenes/actions.ts:250-254`). La columna se paga **dejando de tirar un campo que ya viaja**.

Queda un borde: sin JavaScript la línea se arma con el SKU exacto y el producto lo resuelve el
servidor en `resolve-typed.ts`. La columna se dibuja con lo que haya y, si no hay producto resuelto
todavía, no inventa un valor.

### H-5 · «Creada por» tampoco cuesta una lectura nueva

La lámina 03 pone en la cabecera **«Creada por · Carla Méndez»**. `PurchaseOrderDetail` no tiene
autor, pero la página **ya llama a `listPurchaseOrderAudit` y ya resuelve los nombres** con
`auditActorLabels` (`[orderId]/page.tsx:101-107`), porque con eso dibuja la historia. El autor del
alta es la primera entrada de esa lista. Es composición de la página, no una lectura nueva.

**Lo que este hallazgo dijo mal** (corregido el 2026-11-06, al implementar): el autor del alta **no
es la primera entrada**. `listEntityAuditLogs` ordena **de la más reciente a la más vieja**, así que
el alta es la **última** de la lista. Tomar la primera habría puesto en «Creada por» a quien canceló
o cerró la orden. Se busca por acción —`find((entry) => entry.action === "create")`— y, cuando el
alta no está en la página cargada del historial, el dato se omite en lugar de inventarse.

### H-6 · El `<select>` de proveedor de la lámina repite un desbordamiento ya medido

La lámina 01 dibuja el filtro de proveedor como un `<select>` con «Todos». Hoy el proveedor **solo
llega por la URL**. Agregarlo es alcance real, y además **ya sabemos cómo falla**: la **M-2 de la
24.7.2-b** midió que el `<select>` de clientes mide **403 px de `min-content` y se dibuja en 288 px**
a 320 px de ventana. Es la misma forma de control con la misma clase de contenido.

El desbordamiento **sigue sin arreglarse** y está registrado como límite aceptado. Si el control
entra, entra con el barrido de anchos escrito como prueba (M-2), no declarado a ojo. Ver **D-5**.

**Lo que este hallazgo no contó** (agregado el 2026-11-06): dijo que el control «es alcance real»
pero no que **cuesta una lectura nueva**. El `<select>` de proveedor no existe sin leer los
proveedores, y esta pantalla hoy no los lee. Está resuelto en el recuadro de **D-5**.

### H-7 · El radio de impacto en las pruebas, contado por archivo

| Spec | Líneas | Menciones de `compras/ordenes` | Casos |
|---|---:|---:|---:|
| `tests/e2e/purchase-orders.spec.ts` | 542 | 15 | 6 |
| `tests/e2e/goods-receipts.spec.ts` | 472 | 3 | 4 |
| `tests/e2e/goods-receipt-voids.spec.ts` | 519 | 2 | 7 |
| `tests/e2e/search.spec.ts` | 738 | 1 | 11 |
| `tests/e2e/suppliers.spec.ts` | 276 | 1 | 4 |
| `tests/guards/exposed-surface.test.ts` | 833 | 5 | — |

**Tres textos que las specs fijan hoy cambian con las láminas**, y por eso las specs entran en la
lista cerrada **desde el principio**, no cuando se pongan rojas — la lección de la 24.6.2:

1. `purchase-orders.spec.ts:182` y `:359` clickean **«+ Nueva orden de compra»**; la lámina dice
   **«+ Nueva orden»**.
2. `:290` y `:471` afirman la historia como **«Abierta → Cancelada»** y **«Abierta → Cerrada»**; la
   lámina narra la actividad en oraciones («Orden de compra creada por Carla Méndez.»).
3. `:297` afirma **«Cancelada»** en la tarjeta del teléfono, donde la insignia gana el calificativo.

### H-8 · El propio render contradice al README de su lote, dos veces

- **«Imprimir» duplicado.** La lámina 03 lo dibuja en la cabecera **y** dentro del menú «Más». El
  README del lote lo prohíbe con todas las letras: «Evitar duplicar Imprimir dentro de Más cuando ya
  está visible en la cabecera». **Gana el README**: el menú lleva solo «Cerrar con faltante».
- **El rojo del botón «Cerrar con faltante».** El README fija «cierre con faltante con texto e icono
  **ámbar**» y «el rojo se reserva para el control destructivo y los errores», y la tarjeta 1 de la
  lámina 17 dibuja el botón de confirmación en **rojo**. No es contradicción: la regla ámbar es del
  **estado** —la insignia de la lista, que la lámina 01 dibuja ámbar— y el rojo es del **control que
  confirma algo irreversible**, que es lo que el proyecto ya hace en toda confirmación destructiva.
  Se adoptan los dos, cada uno en su lugar, y queda declarado.

### H-9 · Las miniaturas de producto existen, y aun así no se dibujan

Las láminas 02 y 03 ponen una **miniatura del producto** en cada línea. La tabla `product_images`
existe desde la 17.5, así que el dato es alcanzable — pero traerlo a la orden es **una lectura nueva
contra `catalog` que nadie pidió**, y la ficha de la orden es **la página que se imprime y se le
manda al proveedor**. Se declara como diferencia y no se dibuja.

## Diferencias con la v2, declaradas antes de implementar

| # | Lámina | Qué dibuja | Qué se hace |
|---|---|---|---|
| V-1 | 01 | Columna «Líneas» ausente; orden Proveedor → Fecha → Monto | **Se adopta**: la lista pierde «Líneas» y reordena |
| V-2 | 01 | Cuatro estados, con «Cerrada · Completa» y «Cerrada · Con faltante» | **Se adopta** (H-2), derivado, sin tocar el enum |
| V-3 | 01 | Filtro de estado «Todas» | **No gana «con faltante»**: el filtro sigue con sus cuatro valores de hoy, que son los de la base |
| V-4 | 01 | Franja de etapas Orden → Recepción → Pago | **Se adopta**: es texto fijo, sin datos |
| V-5 | 01 | `<select>` de proveedor | **Según D-5** |
| V-6 | 01 | Columna «Ver ›» | **Se adopta como enlace de texto con chevron**, que es lo que la lámina dibuja. *Corregido el 2026-11-06, antes de implementar*: esta fila decía «con el botón sólido de `/pedidos`», y era falso por los dos lados — `/pedidos` usa `outlineButtonClass` desde la 24.6.2-e, **no** el sólido, y esta lámina no dibuja un botón sino un enlace. Se sigue la lámina y no la pantalla hermana, que es el precedente que fijó la propia 24.6.2-e |
| V-7 | 02 | Una línea, con «Agregar producto» | **No se adopta el arranque en una**: siguen las **cinco** líneas iniciales, que son lo que hace andar el alta sin JavaScript |
| V-8 | 02 | Columna «Seguimiento» | **Se adopta** (H-4), sin lectura nueva |
| V-9 | 02 | Columna «Resumen de la orden» con Productos / Unidades / Total y el aviso ámbar | **Se adopta** |
| V-10 | 02, 03 | Miniatura del producto | **No se dibuja** (H-9) |
| V-11 | 03 | Barra de progreso «2 de 3 unidades recibidas» | **Se adopta** |
| V-12 | 03 | «Creada por» en la cabecera | **Se adopta** (H-5) |
| V-13 | 03 | «Recepciones» con Estado, Unidades y Costo recibido | **Se adopta con «Líneas» en lugar de «Unidades»**. *Corregida el 2026-11-06, al implementar*: la fila era inconstruible como estaba escrita. `GoodsReceiptSummary` no trae unidades —trae `lineCount`—, y el recuento de unidades por recepción es exactamente la lectura nueva que **D-1 mandó a la 24.8.1-b**. Se dibuja el dato que ya existe, y la columna de unidades llega con la subfase hermana |
| V-14 | 03 | «Imprimir» en la cabecera y en «Más» | **Una sola vez** (H-8) |
| V-15 | 03 | Actividad narrada en oraciones | **Según D-6** |
| V-16 | 17-1 | Diálogo modal «Cerrar con faltante» | **Según D-3** |
| V-17 | todas | Icono del proveedor, iconos por fila del resumen | **Se adoptan los del proyecto**, no activos nuevos: lo dice el propio README |
| V-18 | 01 | «Cancelada» en rojo | **Queda en gris**, el tono de hoy: el README fija «Cancelada/Anulada en gris», avisa que «algunos renders varían el color de estas etiquetas» y reserva el rojo al control destructivo y a los errores |
| V-19 | 01 | Fecha **con año y sin hora** («28/10/2026») | **Se adopta** (`formatDate`). *Agregada el 2026-11-06, al implementar*: esta tabla no la había contado. Hoy la columna usa `formatShortDateTime`, que da «28/10 12:30» —**sin año**—, así que seguir la lámina no pierde información sino que agrega la que falta: la hora sigue en la ficha, que es donde se mira una orden |
| V-20 | 03 | Título «OC-000057» | **Se titula «Orden de compra OC-000057»**. *Agregada el 2026-11-06, al implementar*: el `DetailHeader` del proyecto titula con el nombre de la entidad y su número en todas las fichas, y un número suelto es un título ilegible para un lector de pantalla |
| V-21 | 03 | Cabecera de comprobante con CUIT, teléfono, email y moneda del proveedor | **Se dibuja solo en papel** (`hidden print:*`). *Agregada el 2026-11-06, al implementar*: en pantalla el proveedor ya está en la fila de metadatos, y repetirlo arriba duplicaría lo que la lámina pone una sola vez. El precedente de `/ventas` los dibuja también en pantalla; acá se siguió la lámina, y queda declarado porque es un juicio y no una regla |
| V-22 | 03 | «Recibidas» y «Pendientes» entre «Pedidas» y el costo | **Se adoptan en ese orden**, ocultas al imprimir. *Agregada el 2026-11-06, al implementar*: por quedar en el medio, el total del `tfoot` necesita **dos filas** —una de pantalla con `colSpan={5}` y una de papel con `colSpan={3}`—, porque un `colSpan` no se puede acortar con una clase de impresión |
| V-23 | 03 | «2 de 3 ítems recibidos» | **Dice «unidades»**. *Agregada el 2026-11-06, al implementar*: lo que la barra mide es la suma de las cantidades de las líneas, no el recuento de líneas |
| V-24 | 03 | Acción primaria «Recibir mercadería» | **Se adopta el texto de la lámina**, y con él cambia el enlace que hoy dice «Registrar recepción» en la ficha, afirmado por tres specs. *Agregada el 2026-11-06, al implementar* |
| V-25 | 01, 02, 03 | Miga de pan («Abastecimiento › Compras», y de tres niveles en la ficha) | **Se usa el `BackLink` del proyecto**, que es la vuelta de un solo paso que usan todas las fichas. *Agregada el 2026-11-06, en AC-16*: una miga completa sería un componente nuevo en tres pantallas y una convención de navegación para todo el CRM, no un detalle de esta subfase |
| V-26 | 01 | Los tres filtros se aplican solos, sin botón, y el número dice «Buscar número OC…» | **Se quedan «Aplicar filtros» y el placeholder «OC-000123»**. *Agregada el 2026-11-06, en AC-16*: el filtro que se aplica solo supone JavaScript, y andar sin él es criterio de aceptación desde la 22.3; el placeholder de hoy enseña los tres formatos que el buscador acepta, que es lo que «Buscar número OC…» no dice |
| V-27 | 01 | El número en texto plano y «Ver ›» como único enlace de la fila | **El número sigue siendo enlace**, además de «Ver ›». *Agregada el 2026-11-06, en AC-16*: lo es desde la 22.3, tres specs lo afirman, y quitarlo haría más chico el blanco de una fila sin ganar nada |
| V-28 | 17-1 | «Quedará 1 pendiente», «1 pendiente» y «3 ítems en total» en **singular** cuando la cantidad es una | **Se adopta la concordancia** en las cinco frases del cierre y en la barra de progreso de la ficha. *Agregada el 2026-11-06, en AC-16*: el resumen de la ficha ya elegía el singular con esta misma comparación y las otras cinco frases no, así que «Se recibieron 1 de 4 unidades» y «1 de 1 unidades recibidas» salían escritas así. Una orden de una sola unidad no es un borde: comprar un equipo es el caso corriente del rubro. Queda en `byQuantity` de `messages.ts`, con su caso versionado |
| V-29 | 03 | La actividad rotula «Recepción parcial» | **Dice «Recepción»** (y «Recepción anulada»). *Agregada el 2026-11-06, en AC-16*: la misma fila cubre la recepción que completa la orden, y llamarla «parcial» sería falso justo en el caso que cierra la compra; cuál de las dos es se lee en la oración, que es lo que D-6 pide |
| V-30 | 03 | Cabecera «Acciones» visible en la tarjeta de recepciones | **Queda `sr-only`** («Ver la recepción»). *Agregada el 2026-11-06, en AC-16*: es la convención que la propia lista de órdenes usa para su columna de «Ver», y la lámina 01 tampoco le pone texto a esa cabecera |
| V-31 | 17-1 | «Estado de recepción» con una barra de tres segmentos | **Se dibuja la lista con íconos** («2 recibidas», «1 pendiente»), sin la barra. *Agregada el 2026-11-06, en AC-16*: la barra de la lámina es la misma información que la lista de abajo y que la barra de progreso que la ficha ya tiene a dos párrafos de distancia, y segmentarla por línea pedía el recuento por recepción que D-1 mandó a la 24.8.1-b |

## Decisiones

**Las ocho se cerraron en su opción (a) el 2026-11-06**, por el usuario, al aprobar el brief con las
recomendaciones.

### D-1 · ¿Se parte la fila? — CERRADA en (a)

- **(a) Sí, y esta subfase toma las órdenes.** Las recepciones pasan a **24.8.1-b**, hermana y no
  subtarea, como la 24.4.3, la 24.5.2-b, la 24.6.1-b y la 24.7.2-b. Motivo medido en **H-1**; el
  corte es **por naturaleza**, igual que el de la 24.7.2: acá el compromiso con el proveedor, allá
  la entrada de mercadería, el stock y las unidades serializadas. Cada mitad se lleva una de las dos
  lecturas nuevas.
- **(b)** Hacerla entera. Nueve láminas y 5.095 líneas en una subfase, contra dos precedentes de R2
  por exceso de alcance con mucho menos.
- **(c)** Partir en tres, separando el alta de la lista y la ficha. No hace falta: el alta son 449
  líneas entre la página y el formulario.

### D-2 · ¿Qué hace la insignia de la lista con una orden cerrada con faltante? — CERRADA en (a)

- **(a) «Cerrada · Con faltante», con icono de aviso y color ámbar**, y «Cerrada · Completa» en
  verde, como la lámina. El texto lleva el significado; el color acompaña y no lo reemplaza.
- **(b)** Una insignia «Cerrada» más una columna aparte. Agrega una columna que la lámina no tiene.

### D-3 · El «Cerrar con faltante», ¿diálogo modal o paso de la URL? — CERRADA en (a)

- **(a) Sigue siendo un paso de la URL** (`?confirmar=cerrar`, como hoy), **con el contenido de la
  tarjeta 1 de la lámina**: el aviso ámbar con «Se recibieron 2 de 3 ítems. Quedará 1 pendiente.»,
  las dos frases sobre recepciones y pagos, la barra «Estado de recepción» con recibidas y
  pendientes, y los botones «Volver» y «Cerrar con faltante». Es el patrón del proyecto entero y el
  único que **anda sin JavaScript**; la 24.7.1, la 24.7.2-b y la 24.7.3 lo eligieron igual.
- **(b)** Un diálogo modal de verdad. Rompe el recorrido sin JavaScript, que es criterio de
  aceptación desde la 22.3.

### D-4 · ¿«Cancelar la orden» también se muda al menú «Más»? — CERRADA en (a)

- **(a) Sí.** La lámina 03 muestra una orden **con recepciones**, donde cancelar ya no se ofrece, así
  que no dice nada del caso. Por coherencia, en una orden abierta y sin recepciones el menú «Más»
  lleva «Cancelar la orden» en el lugar donde la otra lleva «Cerrar con faltante»: **nunca las dos**,
  que es la regla de negocio de hoy y no cambia.
- **(b)** Dejar «Cancelar la orden» como botón visible. Dos gramáticas distintas para dos variantes
  del mismo encabezado.

### D-5 · El filtro de proveedor, ¿pasa a ser un control? — CERRADA en (a)

- **(a) Sí, un `<select>` con «Todos»**, con el tope del precedente: **hasta 50 proveedores un
  `<select>`; pasado el tope, el campo de texto**, que es exactamente lo que la 24.7.2-b resolvió
  para clientes. Entra con el barrido de anchos de **M-2** escrito como prueba, por **H-6**.

  > **El costo que este brief no contó, corregido el 2026-11-06 antes de implementar.** (a) **no es
  > construible sin una segunda lectura nueva**, y eso chocaba con la condición de detención 1 y con
  > la AC-13 como estaban escritas. La lista de órdenes lee hoy cuatro cosas —`listPurchaseOrders`,
  > `getOrganizationTimezone` y `getSupplier`, esta última solo cuando el filtro viene por URL— y
  > **ninguna enumera proveedores**. El precedente que (a) invoca tampoco compuso el control con
  > algo que ya se leyera: la 24.7.2-b agregó `listReceiptClientOptions`
  > (`src/modules/cash/service.ts:4172`), una lectura dedicada que pide
  > `CASH_CLIENT_FILTER_LIMIT + 1` ids para saber si entra en el tope.
  >
  > **El usuario autorizó la segunda lectura el 2026-11-06**, con la condición de declararla acá.
  > Queda con la forma del precedente y en **una sola sentencia**, más barata que la de aquel: los
  > proveedores son una tabla del propio `purchasing`, así que el nombre sale del mismo `select` y
  > no de una segunda consulta a otro módulo. Trae **solo los proveedores que tienen órdenes**, con
  > `limit 51`; si llegan 51, el control **desaparece** y el proveedor vuelve a llegar solo por la
  > URL, que es la conducta de hoy. **El campo de texto del precedente no se copia**, y lo decidió
  > el usuario el 2026-11-06 al verlo: en la 24.7.2-b ese campo filtra **por nombre en SQL**
  > (`CashClientFilter` tiene `{kind:"name"}`), y acá `listPurchaseOrders` acepta **un id, no un
  > nombre**. Un campo de texto que no filtra nada es peor que ningún control, y hacerle entender
  > nombres era un **tercer** cambio en `purchasing`, con su caso de integración y con el buscador
  > global —que comparte esa lectura— a verificar. El tope son 50 proveedores **que tengan
  > órdenes**. Un `?proveedor=<id>` que no esté
  > entre las opciones se dibuja igual, como opción extra, con el nombre que `getSupplier` ya trae,
  > para que el `<select>` no diga «Todos» con el filtro activo: es el defecto **N-9** que la
  > revisión independiente encontró en la 24.7.2-b.
- **(b)** Dejarlo solo por URL, como hoy, y declarar la diferencia. Más barato y deja la lámina sin
  cumplir en un punto visible.

### D-6 · La «Actividad», ¿se reescribe en oraciones? — CERRADA en (a)

- **(a) Sí**, con el rótulo y la oración de la lámina («Creada» / «Orden de compra creada por Carla
  Méndez.», «Recepción parcial» / «Se registró la recepción RC-000091 por 2 unidades.»). La historia
  de hoy dice «Abierta → Cerrada», que es la transición y no el hecho. **Los textos los compone la
  página a partir de las entradas de auditoría que ya lee**: no se cambia nada de `audit`.
- **(b)** Dejar las transiciones. Dos specs afirman esos textos y no habría que tocarlas (H-7).

**Corregido el 2026-11-06, al implementar**: la fila «Recepción parcial» de la lámina **no puede
salir de la auditoría**. Una recepción que **no** cierra la orden no deja ninguna entrada de
`purchase_order` —se audita el `status_change` del cierre automático, y nada más—, así que la
actividad **mezcla las entradas de auditoría con `order.receipts`**, que la ficha ya lee: no es una
lectura nueva. El merge se limita a la **primera página** del historial, para que una segunda página
no pueda repetir las recepciones. Y la oración dice el **monto** de la recepción y no «2 unidades»,
por el mismo motivo que **V-13**.

### D-7 · ¿Dónde se documenta esto en `Screens.md`? — CERRADA en (a)

- **(a) Se reescriben las secciones 43, 44 y 45**, que ya existen, agregando la fecha de esta
  subfase, y se corrige de paso la prosa que dice «tres pestañas» cuando hay cinco. **No se tocan la
  46 a la 49**, que son de la subfase hermana.
- **(b)** Secciones nuevas. Duplicaría la documentación de las mismas rutas.

### D-8 · ¿Qué nombre lleva la subfase hermana? — CERRADA en (a)

- **(a) «24.8.1-b Compras: recepciones»**, con las cinco láminas del lote 26, la lectura «unidades
  por recepción» y las tarjetas 2 y 3 de la lámina 17.
- **(b)** Meterla en la 24.8.2, que ya tiene pagos, a pagar, proveedores y técnicos con ocho láminas
  propias.

## Alcance

### Incluido

1. **`/compras/ordenes`**: la franja de etapas, el filtro de proveedor según D-5, las columnas de la
   lámina, la insignia de cuatro estados (D-2) y la columna «Ver».
2. **`/compras/ordenes/nueva`**: la columna «Seguimiento», la columna «Resumen de la orden» con su
   aviso, y la barra de pie con «Cancelar» y «Crear orden».
3. **`/compras/ordenes/[orderId]`**: la cabecera con estado, proveedor, fecha y «Creada por»; el
   menú «Más» (D-4); la barra de progreso de recepción; «Productos» con Pedidas / Recibidas /
   Pendientes; «Recepciones» con Estado, Unidades y Costo recibido; «Resumen de la orden»; y la
   «Actividad» según D-6.
4. **La confirmación de «Cerrar con faltante»** con el contenido de la tarjeta 1 (D-3).
5. **Las dos lecturas nuevas**: lo recibido por orden, en la lista, en **una sola sentencia por
   página**; y las opciones del filtro de proveedor (D-5), en **una sola sentencia con `limit 51`**.
6. **Las secciones 43, 44 y 45 de `Screens.md`** (D-7).
7. **Las specs del radio de H-7**, actualizadas, más el caso que fija la distinción completa /
   con faltante y el barrido de anchos.

### Excluido

- **Todo lo de recepciones**: las cinco láminas del lote 26, la ficha, el alta, la anulación, el
  teléfono y la lectura «unidades por recepción». Es la 24.8.1-b (D-1).
- **Las tarjetas 2 a 6 de la lámina 17** (H-3).
- **Pagos, A pagar, proveedores y técnicos**: son la 24.8.2, aunque sus pestañas se vean en las
  láminas.
- **Cualquier cambio a las reglas de la orden o al enum de estados**, y cualquier otra entrada en
  `src/modules/purchasing/` fuera de las tres de la lista cerrada.
- **Miniaturas de producto** (H-9) y cualquier activo de marca nuevo.
- **Migraciones, tablas y contratos nuevos.**

## Lista cerrada de archivos

Tocar algo fuera de esta lista es un hallazgo bloqueante, no una mejora. **Salirse se pregunta antes
de implementar, sin excepción por tamaño**, y eso incluye el archivo vecino que una corrección
autorizada arrastre.

> **Ampliada el 2026-11-06**, antes de implementar y con autorización del usuario en el turno, con
> **un archivo**: `src/app/(autenticado)/compras/proveedores/[supplierId]/page.tsx`.
>
> La insignia de estado es un componente compartido, y la ficha del proveedor también la usa para
> listar las últimas órdenes de ese proveedor. Al separar «Cerrada · Completa» de «Cerrada · Con
> faltante» (D-2), la insignia necesita el dato nuevo, y sin tocar ese archivo **la misma orden
> diría dos cosas distintas en dos pantallas**. El cambio es **una línea**: pasarle `hasPending`,
> que ya viene en la misma lectura que esa ficha hace. No toca ninguna otra cosa de la pantalla del
> proveedor, que es de la 24.8.2.
>
> La alternativa descartada era dejar la propiedad opcional y que la insignia degradara en silencio
> a «Cerrada» donde no se la pase. Se descartó por eso mismo: un prop opcional que degrada sin
> avisar es lo que una revisión encuentra después.

> **Ampliada por segunda vez el 2026-11-06**, también antes de implementar y con autorización del
> usuario en el turno, con **un archivo más**: `src/modules/purchasing/index.ts`.
>
> La segunda lectura que D-5 obliga tiene que ser llamada desde la pantalla, y en este repositorio
> **no existe un solo import profundo desde `src/app` hacia `purchasing`**: todo entra por el
> barrel, y el precedente está exportado igual en `src/modules/cash/index.ts:37`. Sin esa línea, la
> lectura autorizada no es alcanzable. Son **tres líneas de export**: la función y su tipo.
>
> La alternativa descartada era devolver las opciones dentro de `listPurchaseOrders`, que ya está
> exportada y no habría tocado ningún archivo nuevo. Se descartó porque
> `src/app/(autenticado)/buscar/search.ts` también la llama: el buscador pagaría una lectura que no
> usa, mezclaría el filtro con la lista y movería su recuento de sentencias.

> **Ampliada por tercera vez el 2026-11-06**, ya durante la implementación y con autorización del
> usuario en el turno, con **dos archivos de prueba unitaria**:
> `src/app/(autenticado)/compras/ordenes/[orderId]/audit-summary.test.ts` y
> `src/app/(autenticado)/compras/ordenes/messages.test.ts`.
>
> Los dos viven al lado del código que la lista cerrada ya autoriza y afirman justamente lo que esta
> subfase cambia. El primero **fija los textos que D-6 reemplaza** («Alta», «Abierta → Cerrada»):
> queda rojo en el mismo momento en que D-6 entra, así que no tocarlo era dejar la suite rota. El
> segundo es **el lugar más barato para demostrar el estado derivado de H-2 y D-2**, sin navegador.
>
> La alternativa descartada era demostrar las dos cosas solo por e2e. Se descartó porque el estado
> derivado es una función pura con cuatro combinaciones, y pagar un navegador por cada una es más
> lento y prueba menos.

**Pantallas**

- `src/app/(autenticado)/compras/ordenes/page.tsx`
- `src/app/(autenticado)/compras/ordenes/filters.ts` *(solo si D-5 cierra en (a))*
- `src/app/(autenticado)/compras/ordenes/status-badge.tsx`
- `src/app/(autenticado)/compras/ordenes/actions.ts` *(dejar de descartar `tracking`, H-4)*
- `src/app/(autenticado)/compras/ordenes/messages.ts`
- `src/app/(autenticado)/compras/ordenes/nueva/page.tsx`
- `src/app/(autenticado)/compras/ordenes/nueva/purchase-order-form.tsx`
- `src/app/(autenticado)/compras/ordenes/[orderId]/page.tsx`
- `src/app/(autenticado)/compras/ordenes/[orderId]/close-confirm.tsx`
- `src/app/(autenticado)/compras/ordenes/[orderId]/cancel-confirm.tsx` *(solo si D-4 cierra en (a))*
- `src/app/(autenticado)/compras/ordenes/[orderId]/audit-summary.ts` *(solo si D-6 cierra en (a))*
- `src/app/(autenticado)/compras/proveedores/[supplierId]/page.tsx` *(una línea; ver la ampliación
  de arriba)*

**Las lecturas nuevas**

- `src/modules/purchasing/purchase-order-repository.ts` *(la tercera subconsulta de la lista y la
  consulta de opciones de proveedor)*
- `src/modules/purchasing/purchase-orders.ts` *(el campo en `PurchaseOrderSummary` y la lectura de
  opciones de D-5)*
- `src/modules/purchasing/index.ts` *(la línea que exporta esa lectura; ver la segunda ampliación)*

> Son las **tres únicas** entradas dentro de `src/modules/`. No tocan ninguna escritura, ninguna
> transición de estado ni ninguna validación: agregan un campo derivado a una lectura que ya existe,
> una lectura de solo lectura para el filtro, y la línea del barrel que la expone.

**Pruebas**

- `src/app/(autenticado)/compras/ordenes/[orderId]/audit-summary.test.ts` *(los textos que D-6
  reemplaza; ver la tercera ampliación)*
- `src/app/(autenticado)/compras/ordenes/messages.test.ts` *(el estado derivado de H-2 y D-2; ver la
  tercera ampliación)*
- `tests/e2e/purchase-orders.spec.ts`
- `tests/e2e/goods-receipts.spec.ts`
- `tests/e2e/goods-receipt-voids.spec.ts`
- `tests/e2e/search.spec.ts`
- `tests/e2e/suppliers.spec.ts`
- `tests/integration/purchase-orders.test.ts` *(el caso de la lectura nueva)*

**Documentación**

- `docs/product/Screens.md` *(secciones 43, 44 y 45; archivo **CRLF**)*
- `docs/planning/Roadmap.md` *(la fila y, si D-1 cierra en (a), la fila nueva)*
- `docs/architecture/Overview.md` *(solo si la lectura nueva cambia la fila de `purchasing`)*
- `CHANGELOG.md`, `HANDOFF.md` y este brief, al cerrar

## Fuentes de verdad, en orden

1. El código en `HEAD` (`6eb0425`) y las **67** migraciones versionadas.
2. `docs/architecture/DataModel.md` y `docs/architecture/Overview.md`.
3. El [ADR 0023](0023-compras-y-proveedores.md) y los briefs 22.3, 22.4 y 22.5; `Roadmap.md`.
4. Notion, solo para el estado de la tarea.
5. Las láminas y los README del lote V2-11 — **propuestas de interfaz**, que su propio README dice
   que «deben conectarse a las lecturas y escrituras autorizadas, sin suponer que existen nuevos
   contratos».

## Criterios de aceptación

Escritos **sobre el invariante y no sobre el árbol de archivos**: es la lección que dejó **AC-9 de la
24.7.3**, que se declaró no cumplido porque prohibía tocar un directorio entero cuando lo que
protegía era una regla.

| id | Criterio |
|---|---|
| **AC-1** | La **lista** tiene la forma de la lámina 01: franja de etapas, filtros según D-5, columnas Nº / Proveedor / Fecha / Monto / Estado / Ver, y en teléfono, tarjetas. |
| **AC-2** | La insignia distingue los **cuatro** casos de D-2, **con texto e icono**, y se entiende con el color apagado. |
| **AC-3** | **El enum `purchase_order_status` sigue con sus tres valores y el trigger de la `0048` sin tocar**: la distinción completa / con faltante es derivada, y un caso de integración lo demuestra creando las dos y leyéndolas. |
| **AC-4** | **Las dos lecturas nuevas cuestan una sentencia por página, no una por fila**: la de lo recibido va en el mismo `select` de la lista y el recuento es **idéntico con 1 y con 25 órdenes** (M-1); la de las opciones de proveedor es **una sola sentencia con `limit 51`**, contada en la misma medición. |
| **AC-5** | El **alta** tiene la forma de la lámina 02, con «Seguimiento» y el resumen, y **sigue arrancando con cinco líneas y andando con JavaScript apagado**, con el nombre exacto del proveedor y el SKU exacto del producto. |
| **AC-6** | La **ficha** tiene la forma de la lámina 03, con «Creada por», la barra de progreso, las tres columnas de cantidad y las tres del resumen. |
| **AC-7** | **«Imprimir» aparece una sola vez** en la ficha (H-8), y el menú «Más» nunca ofrece a la vez cancelar y cerrar con faltante. |
| **AC-8** | «Cerrar con faltante» se resuelve según **D-3** y **anda con JavaScript apagado**, conservando la página de la historia. |
| **AC-9** | **Ninguna regla de la compra cambió**: las transiciones de estado, las validaciones del alta, el máximo de 50 líneas, el efecto de una recepción sobre la orden y el de una anulación siguen idénticos. El `git diff` de `src/modules/purchasing/**` se adjunta **como evidencia del criterio, no como el criterio**, y se espera que toque solo las tres entradas declaradas. |
| **AC-10** | **La ficha sigue imprimiendo igual**: al imprimir queda solo la orden, sin navegación, botones, historia, progreso ni resumen. |
| **AC-11** | **Un `viewer` sigue sin ver ninguna de las tres pantallas**, con el mismo mensaje y sin datos. |
| **AC-12** | **Ninguna migración, tabla ni contrato nuevo**: siguen **67** migraciones. |
| **AC-13** | **Dos lecturas nuevas y ninguna tercera**: la que la fila anuncia y la que D-5 obliga, autorizada el 2026-11-06 y declarada en el recuadro de D-5. Verificado contra `HEAD` servicio por servicio y escrito en el §Cierre con el nombre de cada llamada antes y después. |
| **AC-14** | Las tres pantallas **no desbordan a 320 ni a 375 px** (M-2), con el barrido escrito en las specs y no declarado a ojo. |
| **AC-15** | `Screens.md` queda al día según **D-7**, incluida la corrección de «tres pestañas». |
| **AC-16** | **Comparación visual entrada por entrada contra las cuatro láminas, con las láminas abiertas**, anotando cada diferencia como cumplida, declarada o descartada. Una diferencia encontrada **se verifica contra el instrumento antes de atribuirla al producto**. |
| **AC-17** | La **batería completa en una sola corrida de CI** en verde sobre el SHA exacto, leída por `headSha`, con el paso «Alcance del cambio» en `codigo=true`. |
| **AC-18** | **Revisión independiente** de un agente que no participó, de solo lectura, contra este brief y contra las reglas vigentes, con sus hallazgos **verificados contra el código antes de aceptarse**. Un subagente revisor no otorga ninguna autorización. |
| **AC-19** | **Despliegue y recorrido del usuario**: las siete verificaciones del runbook y el recorrido declarado. **Sin AC-19 el nivel es «validado en integración», no «validado en staging».** |

## Mediciones requeridas

- **M-1 · El costo de la lectura nueva, medido y no razonado.** Recuento de sentencias de la lista
  con **1 y con 25 órdenes**, contadas en la corrida y no deducidas del código. Si lo que se hace es
  leer el camino de código en vez de contar, **se declara «verificado por camino de código» y no
  «medido»**: la 24.7.2-b llamó «medido» a un recuento que no lo era y lo encontró la revisión
  independiente.
- **M-2 · El barrido de anchos.** `setViewportSize` a 320 y 375 px y comparación de `scrollWidth`
  contra `clientWidth` en las tres pantallas, con el filtro de proveedor desplegado si D-5 cierra en
  (a). Es el instrumento que encontró un desbordamiento de 338 px en la 24.7.2 **después** de que el
  criterio se declarara cumplido sin él, y el que midió los 403 px del `<select>` de clientes.
- **M-3 · Que el caso de la distinción pueda fallar.** Con una orden cerrada con faltante dibujada
  como «Cerrada · Completa», el caso nuevo **se pone rojo**; se comprueba y se revierte. Un caso en
  verde no prueba nada hasta que se lo ve fallar — y toda aserción negativa nombra **los dos roles
  posibles** del control que mire, por la lección de la 24.7.3.

**Las tres mediciones son independientes: ninguna hereda la salvedad de otra.**

## Condiciones de detención

Parar y reportar, sin continuar:

1. **Si algo exige una lectura nueva además de la declarada, o una dependencia nueva entre módulos.**
   No se agrega y se pregunta. En la 24.7.1 se agregó una contra esta misma condición y la encontró
   la revisión independiente, no la autoevaluación.
2. **Si algo exige cambiar una regla de la compra**: transiciones, validaciones del alta, el efecto
   de la recepción o el de la anulación.
3. **Si hace falta una migración o un valor nuevo del enum.**
4. **Antes de tocar un archivo fuera de la lista cerrada**, cualquiera sea su tamaño, incluido el
   que arrastre una corrección autorizada.
5. **Antes de `commit`, `push`, `merge` o despliegue**: autorización explícita del usuario **en el
   turno**. Una anterior no vale.
6. **Si la batería local falla**: no se sube el límite global de una prueba para tapar una falla
   local; se diagnostica y se declara.
7. **Nunca correr Vitest de integración y Playwright a la vez**: comparten la base y producen fallas
   que no existen. Y `npx playwright test` **no construye**: una corrida verde puede estar probando
   código viejo.

## Nivel de validación objetivo

**Validado en staging**, y solo con AC-19. El nivel de evidencia es `deterministic` más
`producer-consumer` para las tres pantallas (UI ↔ servicio ↔ base), y `authenticated-end-to-end`
para el recorrido. **Un nivel superior nunca se infiere de uno inferior.**

## Ubicación en la fase

- **Necesario ahora**: las tres pantallas de órdenes con la forma de sus láminas y la lectura que la
  fila anuncia.
- **Requisito antes de producción**: nada propio. No toca dinero, stock ni contratos.
- **Mejora posterior**: el desbordamiento del `<select>` a 320 px, medido en la 24.7.2-b y todavía
  sin arreglar; el objetivo táctil de 44 px, también medido y pendiente. Los dos son del proyecto,
  no de esta subfase, y **no se arreglan acá de paso**.

Es la primera fila del **bloque de Abastecimiento**. La siguen la 24.8.1-b (D-1) y la 24.8.2.
