---
schema: task-brief.v1
task_id: "24.5.1"
task_type: implementation
generated_at: 2026-10-30
---

# Brief: 24.5.1 — Productos: catálogo y ficha

**Estado: aprobado el 2026-10-30 por el usuario, con D-1 (a) y las recomendaciones de D-2 a D-9.**

## Objetivo

Que el catálogo de productos y tres partes de la ficha queden **como los mockups de la v2** (`docs/ui-redesign/v2/05-productos/`):

- el **catálogo**, agrupado por modelo con grupos que se abren y cierran, y sus sumas por grupo (01 y 07);
- el **Resumen** de la ficha, respondiendo «qué se puede ofrecer y qué está pendiente», con disponible, reservado y en revisión (09);
- **Movimientos** y **Precios**, alineados con sus láminas (11 y 12).

Cada diferencia que quede se declara en el §Cierre, como en la [24.4.2](brief-24.4.2-clientes-lista-y-formulario.md) y la [24.4.3](brief-24.4.3-clientes-operaciones-y-actividad.md). Es la octava subfase de la Fase 24: las siete anteriores —24.1, 24.2, 24.3, 24.3.1, 24.4.1, 24.4.2 y 24.4.3— ya tienen su `§Cierre`.

**Nota de numeración.** El usuario pidió «el brief de la 24.5». En el plan vigente del [Roadmap](../planning/Roadmap.md) (tabla del 2026-10-28) no existe una 24.5 suelta: está dividida en 24.5.1, 24.5.2 y 24.5.3. La «24.5 Proveedores y compras» pertenece al plan del 2026-10-17, que esa misma tabla reemplaza y que se conserva solo para trazabilidad. Este brief es el de la **24.5.1**, que es la subfase que sigue. Su tarea en Notion ya existe (`406702be6f4e817d9c30c481f4af28fe`, «Esperando»).

## Situación

### El catálogo hoy ([page.tsx](../../src/app/(autenticado)/productos/page.tsx), 599 líneas)

- Tabla en escritorio y tarjetas en el teléfono, con búsqueda, filtros (marca, categoría, condición, estado de stock, actividad, modelo), orden y paginación, todo por parámetros de URL.
- **La agrupación por modelo ya existe**, desde la 29.2 (D-4), pero es **plana**: con `?agrupar=modelo` el servicio ordena por modelo y la página intercala una fila de encabezado antes del primer producto de cada grupo, también al empezar cada página. No se puede cerrar un grupo, y el encabezado no lleva ninguna suma.
- Sin la capacidad `variants`, `?modelo=` y `?agrupar=` no hacen nada: la lista queda como antes de la 29.2.
- Cada fila lleva su `StockStatusBadge` (`disponible`, `bajo_stock`, `sin_stock`), lo disponible y, debajo del nombre, el modelo y la variante.

### La ficha hoy

- Son **cinco páginas con una barra de sub-navegación**, no pestañas ([product-sub-nav.tsx](../../src/app/(autenticado)/productos/[productId]/product-sub-nav.tsx), que lo dice en su propio comentario): Resumen, Unidades (solo con `serialized_units`), Movimientos de stock, Historial de precios y Costos y margen (solo `admin`).
- **Resumen** ([page.tsx](../../src/app/(autenticado)/productos/[productId]/page.tsx)): tarjetas Estado, Información básica, Logística, Ubicación, Imagen, Precio, Costo y margen y Stock. La tarjeta Stock es una `DetailList` con cuatro filas de texto: Stock actual, Reservado, Disponible y Punto de reposición. No hay «En revisión», ni contadores, ni una acción principal «Ver unidades».
- **Movimientos** y **Precios**: páginas propias, con sus filtros y su paginación.

### La v2

- **01 y 07, el catálogo:** vista «Por modelo» y vista «Lista» sobre los mismos resultados; los grupos se abren y cierran sin perder búsqueda, filtros ni posición; «Ver modelo» tiene un destino distinto del chevron de expansión; alerta «Stock bajo» por umbral, que **no equivale a «Sin stock»**; los accesorios sin modelo tienen su propio grupo; cada precio conserva su moneda.
- **09, el Resumen:** «responde qué se puede ofrecer y qué está pendiente». «Ver unidades» es su acción principal y **cada contador abre la lista filtrada**. El menú de desbordamiento lleva las acciones secundarias.
- **El README de V2-05**, que es la fuente más precisa que tenemos: «las cinco existencias físicas de este ejemplo incluyen una en revisión; el saldo operativo del sistema cuenta solo las tres disponibles y la reservada. Retirar la unidad en revisión no debe restar nuevamente del saldo operativo». Y: «La ficha se divide en Resumen, Unidades, Movimientos, Precios y Costos. Se mantiene el producto y el contexto al cambiar de pestaña. Volver a productos recupera filtros, grupo expandido y posición del catálogo».
- **El README de V2-04:** «Disponible debe usar una definición única de unidades vendibles no reservadas, según las reglas reales. No se resta dos veces lo reservado si el sistema ya devuelve stock neto. Un error se muestra como No disponible, nunca cero».

## Hallazgos antes de diseñar

Verificados contra el código, no supuestos.

- **H-1. Las unidades en revisión están fuera del saldo, y la v2 lo sabe.** [inventory/schema.ts:192](../../src/modules/inventory/schema.ts): «El saldo de un producto `unit` es igual a sus unidades `available` y, desde la 29.5.2, `reserved`; las que están en reparación o en revisión (29.6.2) quedan fuera». El README de V2-05 dice lo mismo con otras palabras. **Consecuencia de diseño:** disponible + reservado + en revisión **no suma** el stock actual, y los tres contadores no pueden presentarse como sumandos de un total.
- **H-2. No existe ninguna lectura que cuente unidades por estado.** La única lectura por producto es `findUnitsOfProduct` ([unit-repository.ts:74](../../src/modules/inventory/unit-repository.ts)), que trae **todas** las unidades del producto **sin `LIMIT`**. Contar «en revisión» con ella significaría cargar el conjunto entero en memoria para devolver tres números.
- **H-3. La pantalla de Unidades no separa revisión de reparación, y no tiene filtro por estado.** [unidades/page.tsx:142](../../src/app/(autenticado)/productos/[productId]/unidades/page.tsx) agrupa en memoria y mete `in_repair` e `in_review` en el mismo `inShop`; no hay ningún parámetro de URL de estado. **Consecuencia:** «cada contador abre la lista filtrada» (V2-05) no es alcanzable sin tocar la pantalla que rediseña la **24.5.2**.
- **H-4. El estado de stock ya usa lo disponible; lo que miente es el nombre del parámetro.** `deriveStockStatus(quantityOnHand, reorderPoint)` ([catalog/service.ts:60](../../src/modules/catalog/service.ts)) se llama con `available` en sus tres llamadores ([inventory/service.ts:70, :86 y :112](../../src/modules/inventory/service.ts)), porque la 19.3 (D-7) lo cambió y enmendó FR-PROD-05 con fecha. Así que la conducta **ya cumple** la «definición única» de la v2 y no resta dos veces lo reservado. Queda un nombre de parámetro que dice lo contrario de lo que recibe: una trampa para quien lo lea después, no un defecto de hoy.
- **H-5. La lista ya carga todos los productos que cumplen texto y actividad antes de paginar en memoria** ([Overview](../architecture/Overview.md), línea 53), **medido en la 8.5** con 10 000 productos —cinco veces el límite—: 133 ms de camino completo, de los cuales 4,5 ms son la consulta. **Consecuencia:** las sumas por modelo sobre el resultado filtrado **no necesitan ninguna consulta nueva**: son un pliegue en memoria sobre un conjunto que ya está cargado.
- **H-6. `catalog` nunca importa `inventory`.** [Overview](../architecture/Overview.md), línea 53: `catalog` deriva el estado con una función pura, e `inventory`, que depende de `catalog`, compone la lista y el detalle. Línea 49: «otro módulo no hace `JOIN` directo contra tablas ajenas fuera de `analytics`». Las sumas por modelo cruzan los modelos de `catalog` con los saldos de `inventory`: las compone quien ya compone la lista, sin `JOIN`.
- **H-7. El umbral existe por producto, no por variante.** `reorderPoint` en [catalog/schema.ts:114](../../src/modules/catalog/schema.ts). La v2 habla de «un umbral configurado para la variante»; en este sistema el producto **es** la entidad al nivel de la variante, así que coincide. No hace falta nada nuevo.
- **H-8. La pantalla de modelos existe**, en `/modelos/[modelId]`. «Ver modelo» tiene un destino real y no hay que inventarlo.
- **H-9. «Volver a productos» pierde el contexto.** El `BackLink` del Resumen apunta a `/productos` sin parámetros, así que volver descarta búsqueda, filtros, orden, página y grupo abierto. La v2 pide explícitamente que los recupere.

## Decisiones

### D-1 — La ficha: pestañas de presentación, sin mover las páginas

La v2 dice «La ficha se divide en Resumen, Unidades, Movimientos, Precios y Costos» y «se mantiene el producto y el contexto al cambiar de pestaña». Hoy son cinco páginas con una barra de sub-navegación. Hay dos maneras de llegar a la v2:

- **(a) Recomendada: conservar las cinco rutas y reemplazar la presentación de la barra** por la de pestañas de la v2, con `aria-current`, el desplazamiento horizontal en el teléfono y el acceso por teclado. El contexto se mantiene porque cada pestaña es la misma ficha del mismo producto, y las cinco páginas con sus formularios, sus `redirect` y sus mensajes **no se tocan**.
- **(b) Mover el contenido a una sola página con `?pestana=`,** como la ficha del cliente de la [24.4.1](brief-24.4.1-clientes-ficha.md) (D-1).

**Se elige (a).** La (b) obligaría a reescribir cinco páginas que funcionan, incluidas las de Unidades y Costos, cuyo contenido rediseña la **24.5.2**: una subfase visual terminaría moviendo formularios de alta, ajuste y precio que nadie pidió mover, y la mitad del trabajo quedaría pisada por la subfase siguiente. La (a) consigue lo que el mockup muestra —una barra de pestañas— sin tocar nada que ya ande. La diferencia con la 24.4.1 se declara: la ficha del cliente son pestañas de verdad, la del producto son páginas que se ven como pestañas.

**El usuario aprobó (a) el 2026-10-30.** La (b) queda descartada para esta subfase; si alguna vez se unifican las dos fichas, es trabajo de la 24.5.2 o posterior, con su propia decisión.

### D-2 — Las sumas por modelo

El encabezado de cada grupo muestra, **del resultado filtrado y no del modelo entero**: la cantidad de presentaciones, lo disponible y, si hay algo, lo reservado. Se calculan **en memoria**, como un pliegue sobre el conjunto que la lista ya carga (H-5), en una función pura con sus tests (`model-groups.ts`), y las compone la página, sin `JOIN` y sin lectura nueva (H-6).

El encabezado dice que las sumas son del resultado filtrado cuando hay algún filtro activo, para no afirmar un total que no es el del modelo. Los productos sin modelo van a un grupo propio al final, «Sin modelo», como ya hace la agrupación de la 29.2.

### D-3 — Los grupos que se abren y cierran, sin JavaScript

El estado abierto viaja **en la URL**, en un parámetro `abierto` repetible (`?abierto=<modelId>&abierto=<modelId>`), y el chevron es un **enlace** que lo agrega o lo quita. Así funciona sin JavaScript, como todo el resto de la fase, y además satisface «volver recupera el grupo expandido» (H-9) sin ningún estado de cliente.

El chevron y el nombre del modelo son dos destinos distintos, como pide la v2: el chevron abre o cierra el grupo; el nombre y «Ver modelo» van a `/modelos/<modelId>` (H-8).

**Por defecto los grupos arrancan abiertos**, para no esconder resultados a quien llega con una búsqueda hecha. Cerrarlos es una acción del usuario, no el estado inicial.

### D-4 — Vista «Por modelo» y vista «Lista»

El `?agrupar=modelo` que ya existe pasa a presentarse como las dos vistas de la v2, sobre los mismos resultados y los mismos filtros. Sin la capacidad `variants` la alternativa no se ofrece, igual que hoy: no hay modelos que agrupar.

### D-5 — Volver al catálogo con su contexto

El enlace de cada producto en el catálogo lleva la cadena de consulta del catálogo en un parámetro `desde`, y el «Volver a productos» de la ficha la usa si está. Sin ella, vuelve a `/productos`, como hoy.

**La posición del scroll queda fuera** y se declara: recuperarla pide JavaScript o un ancla por fila, y ninguna de las dos cosas pertenece a esta subfase.

### D-6 — «En revisión»: una lectura nueva que cuenta en SQL

Se agrega a `inventory` una lectura `countUnitsByStatus(context, productId)` que agrupa **en SQL** (`GROUP BY status`) y devuelve el recuento por estado. No se usa `findUnitsOfProduct` para esto (H-2): traer todas las unidades para devolver tres números es exactamente lo que la regla de la fase manda medir, y acá se puede evitar.

- Solo se pide para un producto con `tracking === "unit"`. Para un producto por cantidad **no existen unidades**, así que «En revisión» **no se muestra** — no se muestra en cero (invariante I-2).
- Los contadores del Resumen se presentan como lo que son, con «Físicas» como marco y una línea que dice que lo que está en revisión y en reparación no entra en el saldo. **No se dibuja un total que los sume** (H-1).
- Los contadores enlazan a `/productos/<id>/unidades`, **sin filtro**, y la diferencia con la v2 («cada contador abre la lista filtrada») se declara: el filtro por estado pertenece a la pantalla que rediseña la 24.5.2 (H-3).

### D-7 — El nombre del parámetro de `deriveStockStatus`

Se renombra el primer parámetro de `quantityOnHand` a `quantityAvailable`, con un comentario que cite la 19.3 (D-7). Es un cambio de una línea, **sin ningún cambio de conducta**: los tres llamadores ya pasan lo disponible (H-4). Entra porque esta subfase es la que lee ese código y la trampa es cara de encontrar después. Sus tests no cambian de valores esperados.

### D-8 — Movimientos y Precios

Alineación visual con las láminas 11 y 12: encabezado, tarjetas, tabla y estados con los patrones de la 24.1. **Sin lecturas nuevas, sin cambios en los filtros ni en la paginación, y sin tocar las acciones.** Si la comparación visual pide un dato que hoy no se lee, se declara y no se agrega.

### D-9 — Revisión independiente, despliegue y recorrido

Como en la 24.4.2 y la 24.4.3: **una revisión independiente** de un agente que no participó, de solo lectura, antes del cierre; después, la CI verde sobre el árbol entregado, el despliegue y el recorrido del usuario. La revisión informa hallazgos y **no autoriza nada**.

## Alcance incluido

1. El catálogo con las dos vistas, los grupos que se abren y cierran por URL, las sumas por grupo y «Ver modelo» (D-2, D-3, D-4).
2. El catálogo en el teléfono, con los grupos y las tarjetas de la lámina 07, sin comprimir la tabla.
3. El Resumen de la ficha con los contadores, «Ver unidades» como acción principal y el menú de desbordamiento (D-6).
4. La barra de pestañas de la ficha, de presentación (D-1 (a)).
5. «Volver a productos» con el contexto del catálogo (D-5).
6. Movimientos y Precios alineados (D-8).
7. La lectura nueva `countUnitsByStatus` en `inventory`, con sus tests (D-6).
8. El renombre del parámetro de `deriveStockStatus` (D-7).
9. Los estados de la lámina 08: catálogo vacío, búsqueda sin resultados, y «No disponible» en lugar de cero cuando una lectura falla.

## Archivos autorizados

Lista cerrada. Tocar algo fuera de acá es un hallazgo bloqueante en la revisión, no una mejora bienvenida.

**Catálogo**
- `src/app/(autenticado)/productos/page.tsx`
- `src/app/(autenticado)/productos/filters.ts` y `filters.test.ts`
- `src/app/(autenticado)/productos/model-groups.ts` y `model-groups.test.ts` *(nuevos)*
- `src/app/(autenticado)/productos/messages.ts` y `messages.test.ts`

**Ficha**
- `src/app/(autenticado)/productos/[productId]/page.tsx`
- `src/app/(autenticado)/productos/[productId]/product-sub-nav.tsx`
- `src/app/(autenticado)/productos/[productId]/unit-counts.ts` y `unit-counts.test.ts` *(nuevos, composición pura)*
- `src/app/(autenticado)/productos/[productId]/movimientos/page.tsx`
- `src/app/(autenticado)/productos/[productId]/precios/page.tsx`

**Módulos**
- `src/modules/inventory/unit-repository.ts` (la consulta agrupada)
- `src/modules/inventory/units.ts` (el servicio)
- `src/modules/inventory/index.ts` (el export)
- `src/modules/catalog/service.ts` (solo el renombre de D-7)

**Pruebas**
- `tests/e2e/` : el recorrido del catálogo agrupado y el del Resumen
- `src/modules/inventory/*.test.ts` : la lectura nueva

**Documentación**
- este brief (`§Cierre`)
- `docs/architecture/Overview.md` : la nota de composición de las sumas por modelo
- `docs/product/Screens.md` : el catálogo y el Resumen
- `docs/decisions/README.md` : la fila del brief
- `CHANGELOG.md` y `HANDOFF.md` : al cerrar

## Alcance excluido

- **Toda migración, tabla, columna y contrato nuevo.** Es la primera regla de la fase.
- **El formulario de alta y edición de producto** (lámina 02). No está en el contenido de la 24.5.1 del Roadmap y no se le asignó subfase; queda señalado como hueco del plan, abajo.
- **Las pestañas Unidades y Costos por dentro**, el filtro por estado de la lista de unidades, el costo y el margen, el valor de inventario y el motivo de la baja: **24.5.2**.
- **Modelos, atributos y grados**: **24.5.3**. Esta subfase solo enlaza a `/modelos/<id>`.
- **Separar `in_repair` de `in_review` en la pantalla de Unidades** (H-3): 24.5.2.
- **La posición del scroll al volver** (D-5).
- **La recepción de unidades** y cualquier flujo de alta de inventario.
- **Cambiar la definición del estado de stock, del saldo o de lo disponible.** Ya cumplen la v2 (H-4).
- **La selección múltiple de unidades** y cualquier acción masiva.
- **El precio en ARS equivalente**: la v2 lo prohíbe sin fecha, fuente y reglas explícitas, y eso es de `fx`.

## Decisiones pendientes

No queda ninguno que el implementador deba rellenar: D-1 a D-9 cubren el alcance, y la variante de D-1 la eligió el usuario al aprobar —(a)—. Si durante la implementación aparece un hueco de política, se señala y se para, no se inventa (condición de detención 4).

**Hueco del plan, para que lo decidas aparte:** la lámina **02, «Alta y estructura de edición» de producto**, no aparece en el contenido de ninguna de las tres subfases de la 24.5 del Roadmap. Puede ser (i) un olvido del replanificado del 2026-10-28, (ii) deliberado, porque el formulario de producto ya se rehizo en la 17.2, o (iii) material para una 24.5.4. **No lo resuelvo yo** y no entra en esta subfase; queda anotado acá y conviene decidirlo antes de cerrar la 24.5.3.

## Fuentes de verdad

Si dos se contradicen, manda la de arriba, y la contradicción se documenta antes de decidir.

1. El código y las migraciones versionadas.
2. [`docs/architecture/Overview.md`](../architecture/Overview.md) (líneas 49, 52 y 53) y [`DataModel.md`](../architecture/DataModel.md).
3. Este brief, y el [Roadmap](../planning/Roadmap.md) §Fase 24 para el alcance de la subfase.
4. Los mockups `docs/ui-redesign/v2/05-productos/` y sus dos README, para la forma.
5. [`FunctionalRequirements.md`](../product/FunctionalRequirements.md) FR-PROD-05, **enmendado por la 19.3**, para el estado de stock.

## Dependencias

Todas satisfechas: la 24.1 dejó los patrones (`detail-header`, `more-actions`, `stat-tile`, `section-card`, `sub-nav`), la 29.2 dejó `variants`, `listModels` y `hasVariants`, la 29.5 dejó las unidades y `serialized_units`, y la 29.6.2 dejó `in_review`.

## Invariantes

- **I-1.** Un módulo no hace `JOIN` contra tablas ajenas fuera de `analytics`, y `catalog` no importa `inventory`. Las sumas por modelo se componen en memoria.
- **I-2.** **Un valor que no se pudo leer nunca se muestra como cero ni como vacío.** Una lectura fallida se anuncia: «No disponible», como pide la v2. Un dato que no existe para ese producto —«En revisión» en un producto por cantidad— **no se muestra**, tampoco en cero.
- **I-3.** Los tres recuentos de unidades no se presentan como sumandos de un total, porque no lo son (H-1).
- **I-4.** Todo funciona **sin JavaScript**: vistas, grupos, filtros, búsqueda y paginación son enlaces y parámetros de URL.
- **I-5.** El aislamiento por organización no se afloja: toda consulta nueva filtra por `organization_id` en SQL.
- **I-6.** Los permisos no se aflojan: el costo y el margen no se exhiben a quien no es `admin`, y ocultar un enlace es presentación — la página y el servicio siguen rechazando por su cuenta.
- **I-7.** No se suman importes de monedas distintas, y cada precio conserva la suya.

## Criterios de aceptación

| id | Criterio |
|---|---|
| **AC-1** | El catálogo ofrece «Por modelo» y «Lista» sobre los mismos resultados; con la capacidad `variants` apagada, la alternativa no se ofrece y la lista queda como antes. |
| **AC-2** | Cada grupo se abre y se cierra con un enlace, el estado viaja en `?abierto=`, y funciona con JavaScript deshabilitado. Los grupos arrancan abiertos. |
| **AC-3** | El encabezado de cada grupo muestra presentaciones, disponible y reservado del **resultado filtrado**, y lo dice cuando hay un filtro activo. Función pura con tests de: un modelo, varios, sin modelo, filtro activo y cero disponible. |
| **AC-4** | El chevron y «Ver modelo» son destinos distintos; «Ver modelo» llega a `/modelos/<modelId>`. |
| **AC-5** | El Resumen muestra disponible, reservado y, solo si el producto es por unidad, en revisión; **sin un total que los sume**; con una línea que explica que revisión y reparación están fuera del saldo. |
| **AC-6** | En un producto por cantidad, «En revisión» **no aparece** (ni en cero). En el producto de servicio, el Resumen sigue diciendo que no tiene stock. |
| **AC-7** | `countUnitsByStatus` agrupa en SQL, filtra por organización, y tiene tests de: sin unidades, un solo estado, los seis estados, y otra organización que no se ve. |
| **AC-8** | Si una lectura del Resumen falla, se anuncia «No disponible»; no se muestra cero. Probado con la lectura forzada a fallar. |
| **AC-9** | La barra de pestañas de la ficha tiene la forma de la v2, con `aria-current`, desplazamiento horizontal en el teléfono y recorrido por teclado. Las cinco páginas siguen respondiendo en sus rutas actuales. |
| **AC-10** | «Volver a productos» recupera búsqueda, filtros, orden, página y grupo abierto cuando se llegó desde el catálogo; sin `desde`, vuelve a `/productos`. |
| **AC-11** | Comparación visual contra 01, 07, 09, 11 y 12, en escritorio y teléfono, con las diferencias que queden declaradas una por una en el §Cierre. |
| **AC-12** | `axe` sin violaciones en el catálogo agrupado y en el Resumen, y reflujo a 320 px sin scroll horizontal, con objetivos táctiles de 44 px. |
| **AC-13** | La batería entera —lint, typecheck, unit, guards, integración, e2e, build— **verde en la CI sobre el SHA que se despliega**. |
| **AC-14** | Una revisión independiente, de solo lectura, de un agente que no participó, contra este brief; sus hallazgos verificados contra el código antes de aceptarse. |
| **AC-15** | Desplegado en producción y recorrido por el usuario, con el nivel de validación declarado sin inferir. |

## Pruebas y evidencia requerida

- **`deterministic`** para las funciones puras (`model-groups`, `unit-counts`, filtros) y para `countUnitsByStatus` contra PostgreSQL real de CI.
- **`authenticated-end-to-end`** para los recorridos de Playwright del catálogo agrupado y del Resumen, contra el build de producción, como ya corre la suite.
- La comparación visual (AC-11) es **evidencia de forma, no de integración**, y se declara como tal.
- Los mocks y los fixtures con forma asumida se declaran y **no cuentan** como evidencia de integración.
- El nivel que se alcanza al cerrar se escribe con el vocabulario del proyecto, y **un nivel superior nunca se infiere de uno inferior**.

## Condiciones de detención

Parar y reportar, sin seguir:

1. Si el trabajo necesita salirse de la lista cerrada de archivos autorizados, o de la variante (a) de D-1 que el usuario aprobó.
2. Si la forma de la v2 **exige un dato que hoy no existe**: se declara y no se agrega la columna ni la tabla.
3. Si cumplir un criterio obligara a un `JOIN` entre módulos o a que `catalog` importe `inventory` (I-1).
4. Si aparece una contradicción entre dos fuentes de verdad: se documenta citando las dos y se eleva, sin resolverla en silencio.
5. **Antes de cualquier commit, push, merge o despliegue**, que necesitan autorización explícita del usuario en el turno. Una autorización anterior no vale.
6. Si el alcance real empieza a comerse la 24.5.2 —el filtro por estado de las unidades, el costo, el margen—: se corta y se declara.

## Riesgos

- **El catálogo agrupado con muchos modelos.** Las sumas son un pliegue en memoria sobre un conjunto ya cargado (H-5), así que el riesgo no es la suma sino el tamaño del HTML con todos los grupos abiertos. Mitigación: la paginación no cambia; los grupos describen la página, no el catálogo entero. Se mide el camino completo con el conjunto más grande que tengamos y se anota.
- **D-1 (a) deja una diferencia con la 24.4.1.** Dos fichas con dos mecanismos para la misma forma visual. Es deuda declarada, y la 24.5.2 puede unificarlas si conviene.
- **«Cada contador abre la lista filtrada» queda a medias** hasta la 24.5.2 (H-3). Declarado, no escondido.

## Situación en la fase

- **Necesario ahora:** el catálogo y el Resumen, que son las dos pantallas que la 24.5.1 nombra, y la lectura que «En revisión» necesita.
- **Requisito antes de producción:** AC-12 a AC-15 —accesibilidad, CI verde sobre el árbol entregado, revisión independiente y recorrido—, como en las seis subfases anteriores.
- **Mejora posterior:** el filtro por estado de las unidades y la unificación del mecanismo de pestañas (24.5.2); la posición del scroll al volver, si alguna vez se pide.
