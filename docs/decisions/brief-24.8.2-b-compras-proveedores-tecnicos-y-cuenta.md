---
schema: task-brief.v1
task_id: 24.8.2-b
task_type: implementation
generated_at: 2026-11-17
---

# Brief 24.8.2-b — Compras: proveedores, técnicos y cuenta

- **Estado**: **aprobado por el usuario el 2026-11-17**, con **D-1 a D-9 cerradas en su opción
  recomendada**, las nueve tal como estaban escritas. Listo para implementar. La aprobación del
  alcance no alcanza a los efectos externos: commit, push, despliegue y Notion siguen pidiendo
  autorización en el turno (condición de detención 7).
- **Origen**: fila «**24.8.2-b Compras: proveedores, técnicos y cuenta**» de
  [Roadmap.md](../planning/Roadmap.md), §Fase 24, línea 485. Nació el 2026-11-16 de la división de
  la 24.8.2 al aprobar su brief ([brief-24.8.2](brief-24.8.2-compras-pagos-y-a-pagar.md), D-1),
  **hermana y no subtarea**. Es la **última fila del bloque de Abastecimiento** y la primera de las
  cinco que quedan sin cerrar.
- **Tarea de Notion**: `41b702be-6f4e-8193-8a03-d4f251af4a3f`, en «Esperando», creada al cerrar la
  24.8.2. Anota que la subfase **necesita este brief** y que arrastra **dos decisiones sin tomar**.
- **Láminas**: las **cuatro** del grupo
  [28-proveedores](../ui-redesign/v2/28-proveedores/README.md) —`desktop/01-proveedores-v2.png`
  (pieza 13), `desktop/02-estado-cuenta-v2.png` (11), `desktop/03-ficha-tecnico-v2.png` (14) y
  `desktop/04-alta-edicion-proveedor-v2.png` (15)—, la **07** de
  [16-tecnicos](../ui-redesign/v2/16-tecnicos/README.md) y las **tarjetas 5 y 6** de
  `25-compras/estados/04-estados-compras-proveedores-v2.png`. **Las seis se abrieron para escribir
  este brief**: la tabla de diferencias sale de mirarlas, no de su README.
- **Contratos de negocio**: [ADR 0023](0023-compras-y-proveedores.md) (puntos 2, 9, 11, 12 y 13),
  [ADR 0024](0024-rubros-y-capacidades.md) (puntos 10 y 14) y los briefs
  [22.2](brief-22.2-los-proveedores.md), [22.7](brief-22.7-la-cuenta-del-proveedor.md), 29.4.3 y
  [29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md), que construyeron lo que acá se
  redibuja.

## Objetivo

Rediseñar, con la v2 y **sin cambiar ninguna regla de negocio**, las pantallas del proveedor: el
**listado** con su filtro por tipo, el **alta y la edición**, la **ficha** —incluida la del
proveedor marcado como técnico— y el **estado de cuenta**. Son las pantallas **40, 41, 42 y 55**
de [Screens.md](../product/Screens.md).

Lo que esta subfase **no** hace: cambiar quién puede ver o tocar un proveedor, cómo se valida el
nombre o el CUIT, cómo se imputa un pago, cómo se arma la cuenta ni qué pasa al desactivar. Todo eso
ya está decidido y corre en producción; acá se redibuja.

## Punto de partida verificado

- **Producción corre `8c35914`** desde el 2026-11-17, con **67 migraciones** y la CI en `success`
  sobre ese SHA exacto (run 43991289978, leída por `headSha`, con «Corre todo: true»). Para volver
  atrás: `25e006e`, y entre los dos no hay migraciones.
- **La Fase 24 lleva veintiséis subfases cerradas en veinticinco entradas del CHANGELOG**, que
  cubren **veinticinco de sus 30 filas**. Quedan cinco: esta, la 24.9.1, la 24.9.2, la 24.9.3 y la
  24.10, **ninguna con brief**.
- **El bloque de Abastecimiento lleva cerradas la 24.8.1, la 24.8.1-b y la 24.8.2.** Esta fila lo
  cierra.
- **Las pantallas existen y funcionan**: el listado, el alta, la edición y la ficha desde la
  **22.2**; las tarjetas de órdenes y recepciones desde la **22.3** y la **22.4**; la cuenta y el
  estado de cuenta desde la **22.7**; la marca de técnico desde la **29.6**; y el total de
  referencia desde la **29.4.3**. Nada de esto se reimplementa.
- **Medido el 2026-11-17** con `wc -l`: el código de pantalla de proveedores suma **2.346 líneas en
  16 archivos**, y sus dos baterías e2e, **566 más** (`suppliers.spec.ts` 276,
  `supplier-accounts.spec.ts` 290). **2.912 líneas en 18 archivos**, antes de sumar nada.
- **La pantalla «Técnicos» de la lámina 07 no existe.** Lo verifiqué listando las rutas: bajo
  `src/app/(autenticado)/` no hay ninguna carpeta `tecnicos`. Crearla es **una pantalla nueva**, con
  su ruta, su lectura, su entrada en la navegación y su batería: no es un rediseño. Lo decide
  **D-1**.

## Las fronteras entre módulos, releídas con `grep`

No alcanza con haberlas leído antes. Se volvieron a abrir
`tests/guards/purchasing-dependencies.test.ts`, `src/modules/purchasing/index.ts`,
`src/modules/service/technician-charges.ts` y `src/modules/cash/supplier-accounts.ts`:

- **`purchasing` no depende de `cash`** (ADR 0023, punto 11), y la guarda lo verifica por texto
  sobre todos los archivos de `src/`. La ficha compone: la página llama a `cash`, no el módulo.
- **Entre los módulos, solo `cash` y `service` importan `purchasing`.** Las pantallas lo usan y no
  cuentan. Esta subfase no agrega ningún importador nuevo.
- **La regla 3 de esa guarda vigila quién lee la cuenta del proveedor**: toda llamada a
  `supplierLedger`, `listGoodsReceiptsForAccounts`, `findAccountsSupplierPayments` y
  `listTechnicianChargesForAccount(s)` tiene que estar dentro de una lectura declarada en
  `SNAPSHOT_READS` o del pago, que la hace detrás del bloqueo de cobros. **Una lectura nueva de la
  cuenta no es una decisión de pantalla**: cambia una guarda. Lo condiciona **H-5**.
- **La deuda con el técnico la compone `cash` en memoria**, sumando
  `listTechnicianChargesForAccounts` de `service` a las recepciones. **Sin `JOIN` entre módulos**, y
  `service` no depende de `cash`.

**Una contradicción encontrada, que se eleva y no se resuelve acá**: el README del lote 28 dice que
en el estado de cuenta «se separan Debe, Haber, saldo a pagar/favor y los importes originales», y
**la lámina 02 dibuja solo el saldo por moneda**, en tarjetas, sin Debe ni Haber. Las dos son del
mismo lote y del mismo día. Está en **H-4** y lo decide **D-7**.

## Hallazgos que condicionan el alcance

### H-1 · La fila ya es del tamaño de una subfase entera antes de sumar la pantalla nueva

Las **2.912 líneas en 18 archivos** medidas arriba son casi exactamente lo que la 24.8.2 movió: su
commit `8c35914` fue de **27 archivos, +3.070/−359**. La pantalla «Técnicos» de la lámina 07 suma a
eso una ruta nueva, una lectura nueva en `service`, una entrada de navegación y una batería e2e
propia. **La fila entera no entra en una subfase**, y la fase ya tiene seis precedentes de división
en hermanas —24.4.3, 24.5.2-b, 24.6.1-b, 24.7.2-b, 24.8.1-b y esta misma—. Lo decide **D-1**.

### H-2 · La columna «Tipo» es gratis; el filtro «Tipo» no

`repository.SupplierRow` **ya trae `isTechnician`**, y `listSuppliers` devuelve esas filas enteras.
Dibujar la insignia «Proveedor» o «Técnico» por fila **no cuesta ninguna lectura**.

El **filtro** de la lámina (`Todos · Proveedores · Técnicos`) es otra cosa: necesita una cláusula
nueva en `findSuppliers`, que hoy filtra por estado y por búsqueda. Es una lectura modificada, de
las que la Fase 24 permite **si el brief la declara y la mide**. Y solo tiene sentido con la
capacidad `repairs`: sin ella no hay técnicos, y un filtro de una sola opción **no se dibuja**, por
la regla que dejó la 24.8.2. Lo decide **D-3**.

### H-3 · «Salida registrada» no existe en el contrato de la cuenta

La lámina 02 dibuja, en «Comprobantes», una columna **«Salida registrada»** con `ARS 450.000,00`
frente a un pago de `USD 300,00`: el movimiento de caja en **su** moneda, con la conversión
aplicada. `SupplierStatementDocument` (`src/modules/cash/supplier-accounts.ts`) lleva `currency`,
`amount`, `destination` y `voided`, **y nada del lado de la caja**. Dibujar esa columna no es
presentación: es **un campo nuevo en un contrato de `cash`**, que además hoy nadie más pide.
Lo decide **D-6**.

### H-4 · El resumen de la lámina contradice al README del mismo lote

La lámina 02 reemplaza el bloque «Debe · Haber · Saldo» de hoy por **una tarjeta por moneda con solo
el saldo** («Se le debe USD 720,00»). El README del lote 28 pide explícitamente que «se separen
Debe, Haber, saldo a pagar/favor y los importes originales». **Gana el README**, porque el ADR 0023
(punto 13) manda que el estado de cuenta sea un documento imprimible y completo, y un resumen que
esconde el Debe y el Haber es más pobre que el de hoy. La forma de tarjeta sí se adopta. Lo decide
**D-7**.

### H-5 · Los trabajos reparados de la ficha necesitan una lectura nueva, y hay una guarda en el camino

La lámina 03 dibuja, en la ficha del técnico, una tarjeta **«Trabajo reparado»** con el número de la
orden, **el modelo y el tipo de reparación** («iPhone 12 · Cambio de batería»), el costo técnico y
lo pendiente. Lo que hoy existe es `listTechnicianChargesForAccount(tx, organizationId, supplierId)`
en `service`, que **recibe una transacción** —una página no puede llamarla—, **no trae modelo ni
tipo de reparación**, y **está vigilada por la regla 3** de `purchasing-dependencies.test.ts`: un
llamador nuevo fuera de la lista hace fallar la guarda.

Son dos caminos distintos: una **lectura nueva en `service`** con su propio `authorize(admin)`, que
no toca la cuenta y por lo tanto no toca la guarda; o colgarse de la cuenta, que sí la toca. **La
primera es la correcta**, y es de las que la Fase 24 permite. Lo decide **D-4**, junto con la forma
de la ficha.

### H-6 · «Ver reparaciones» no tiene hoy a dónde ir filtrado

La lámina 03 pone un botón **«Ver reparaciones»** en la ficha del técnico. `/reparaciones` **no
tiene filtro por técnico**: `src/app/(autenticado)/reparaciones/filters.ts` filtra por estado y por
búsqueda, y «en-el-tecnico» es un **estado** de la orden, no un filtro por persona. O el botón lleva
a la lista sin filtrar —y entonces miente sobre lo que va a mostrar— o la subfase agrega el filtro,
que es otra lectura modificada en otro módulo. Lo decide **D-5**.

### H-7 · El «Más» de la ficha es la forma que el proyecto ya decidió dos veces, y acá el recuento cambia

La lámina 03 agrupa acciones en un menú **«Más»**. La **D-2 de la 24.7.2-b** decidió que un *popover*
con JavaScript no se implementa, porque **que las pantallas anden sin JavaScript es un invariante
medido**, y resolvió aquel caso con enlaces planos **porque las acciones eran dos**. La 24.7.1 sí
hizo un `<details>` para su «Más», y dejó escrito que **sin destinos no se dibuja**.

Acá las acciones de la ficha son **cinco** —Editar, Desactivar o Reactivar, Pago a cuenta, Estado de
cuenta y Ver los pagos—, que es el caso para el que un menú de desborde existe. **No se reabre la
decisión del *popover***: si hay menú, es un `<details>`. Lo decide **D-8**.

### H-8 · Ninguna de las dos baterías de estas pantallas tiene barrido de reflujo

Medido con `grep -c scrollWidth`: `tests/e2e/suppliers.spec.ts` **0**,
`tests/e2e/supplier-accounts.spec.ts` **0**. La regla que dejó el cierre de la 24.8.2 es explícita:
**el barrido tiene que incluir la pantalla que la subfase estrena o rediseña, antes de que el cierre
la declare medida**, y nació justamente de una pantalla que no estaba en el barrido y escondía un
desbordamiento real. Las cuatro pantallas de esta subfase entran al barrido. No es decisión: es
**AC-13**.

### H-9 · La tarjeta 6 afirma algo que en esta pantalla es falso

La tarjeta 6 («Error al leer la cuenta») dice «No pudimos leer la cuenta. **Los datos anteriores se
conservan.** Reintentá la consulta.» En la ficha de hoy, cuando `getSupplierAccountSummary` falla no
se conserva ningún dato anterior: se dibuja `ACCOUNT_UNAVAILABLE_TEXT` y nada más. Esa frase quedó
bien puesta donde un panel conserva lo que ya mostró, y **acá sería una afirmación falsa sobre
dinero**, que es exactamente lo que la revisión independiente de la 22.7 (R11) hizo corregir. **Se
adopta la tarjeta sin esa línea**, con «Reintentar» como enlace a la misma URL. No es decisión: es
una diferencia declarada en la tabla.

### H-10 · El índice de briefs quedó sin la fila de la 24.8.2

Contados hoy: **152 briefs y 151 filas** en `docs/decisions/README.md`. El bucle que nombra al que
falta devuelve **`brief-24.8.2-compras-pagos-y-a-pagar.md`**: el cierre de ayer no le escribió su
fila. Es un defecto del cierre anterior, no de esta subfase, y **se corrige en el mismo commit que
registre este brief**, para no dejar el índice roto una subfase más.

## Diferencias con la v2, declaradas antes de implementar

Las seis láminas se abrieron para esta tabla. **La comparación se hizo a 1.280 px**, y la
verificación de **AC-12** vuelve a hacerla declarando el ancho y cubriendo al menos uno entre el
quiebre de la tabla y el `max-width` del contenedor.

| # | Lámina | Lo que dibuja | Qué se hace |
|---|---|---|---|
| V-1 | 13 | Filtros, tabla y pie **dentro de una sola tarjeta** | **Se adopta** |
| V-2 | 13 | «Ver cuentas a pagar» junto a «+ Nuevo proveedor» | **Se adopta**: enlaza a `/compras/a-pagar`, que existe desde la 22.7 |
| V-3 | 13 | Columna **«Tipo»** con insignia «Proveedor» o «Técnico» | **Se adopta** si hay capacidad `repairs` (H-2) |
| V-4 | 13 | Filtro **«Tipo»** de tres opciones | **Se adopta** (D-3), solo con capacidad `repairs` |
| V-5 | 13 | **Sin columna CUIT** | **No se adopta**: el CUIT es dato de identificación y hoy se busca por él; se conserva la columna |
| V-6 | 13 | Placeholder «Buscar por nombre…» | **No se adopta**: la búsqueda también es por CUIT desde la 22.2, y el texto tiene que decir lo que hace |
| V-7 | 13 | «Sin datos» donde hoy va «—» | **Se adopta** |
| V-8 | 13 | Acción **«Ver»** por fila, en vez del lápiz | **Se adopta**: el nombre ya abre la ficha, y «Editar» baja al menú de la ficha |
| V-9 | 13 | Pie con el aviso de los inactivos y el total a la derecha | **Se adopta**, conservando la paginación de a 25 |
| V-10 | 13 | Flecha de orden en «Nombre» | **Se adopta como adorno estático**: el orden alfabético es fijo desde la 22.2 y ordenar por otra columna no entra |
| V-11 | 15 | Migas «Abastecimiento › Proveedores › Nuevo proveedor» | **Se adopta** |
| V-12 | 15 | Tres secciones: «Datos del proveedor», «Identificación», «Servicio técnico» | **Se adopta** |
| V-13 | 15 | **Casilla «Es técnico»** en el formulario | **Se adopta** (D-2): en el alta, dentro de la misma transacción que crea el proveedor |
| V-14 | 15 | Aviso «El nombre y el CUIT no pueden repetirse, incluso con proveedores inactivos» | **Se adopta**: es la regla que ya aplica |
| V-15 | 15 | Columna derecha **«Resumen»** con dos viñetas | **No se adopta**: repite lo que el formulario ya dice y «También disponible como técnico» afirma algo que depende de la capacidad |
| V-16 | 15 | Barra de acciones **fija al pie** | **No se adopta**: ninguna pantalla de la fase tiene barra fija; los botones quedan al pie del formulario, como en las otras |
| V-17 | 14 | Migas, ícono de la ficha y subtítulo | **Se adopta** |
| V-18 | 14 | Tira de contacto **Teléfono · Email · CUIT** en una tarjeta ancha | **Se adopta** |
| V-19 | 14 | **Pestañas** Resumen · Cuenta · Compras · Actividad | **No se adopta** (D-4): la ficha queda apilada, y la diferencia se declara |
| V-20 | 14 | «Registrar pago a cuenta» como acción primaria del encabezado | **Se adopta** |
| V-21 | 14 | Menú **«Más»** | **Se adopta como `<details>`** (D-8), y no se dibuja si no le queda ninguna acción |
| V-22 | 14 | Botón **«Ver reparaciones»** | **Se adopta** (D-5), con el filtro por técnico agregado a `/reparaciones` |
| V-23 | 14 | Tarjeta **«Trabajo reparado»** con modelo y tipo de reparación | **Se adopta** (D-4), con una lectura nueva en `service` que no toca la cuenta (H-5) |
| V-24 | 14 | «Actividad» como **línea de tiempo** con íconos | **Se adopta la forma**, sobre la misma auditoría paginada de hoy; no se inventan eventos que la auditoría no registra |
| V-25 | 11 | Título «Nexo Mobile» con «Estado de cuenta» de subtítulo | **Se adopta** |
| V-26 | 11 | Filtro de **moneda** en el encabezado | **Se adopta** (D-9), solo con más de una moneda y sin recortar el impreso |
| V-27 | 11 | Resumen por moneda **en tarjetas, solo el saldo** | **Se adopta la tarjeta**, conservando Debe y Haber (H-4, D-7) |
| V-28 | 11 | «Imputación actual» en **una sola tabla con columna Moneda** | **Se adopta**: hoy es una tabla por moneda |
| V-29 | 11 | Columnas «Pago directo», «Desde cuenta», «Pendiente» | **Se adopta el rótulo**, sobre los mismos tres números de hoy |
| V-30 | 11 | Acción **«Ver detalle»** por fila de imputación | **Se adopta**: es el enlace al comprobante que la fila ya tiene |
| V-31 | 11 | **Sin columna Fecha** en la imputación | **No se adopta**: la fecha es lo que explica el orden de la imputación |
| V-32 | 11 | Columna **«Salida registrada»** | **No se adopta** (D-6): es un campo nuevo en un contrato de `cash` (H-3) |
| V-33 | 11 | La sub-navegación de Compras dentro del estado de cuenta | **No se adopta**: es un documento imprimible, y la 22.7 lo dejó fuera de la sub-navegación a propósito |
| V-34 | 11 | El encabezado del documento (organización, leyenda, CUIT, fecha) **no se ve** | **No se adopta la omisión**: la lámina muestra la vista de pantalla; el documento y su impresión se conservan enteros |
| V-35 | 17-5 | «Este proveedor está inactivo» en tres frases, con «Reactivar proveedor» | **Se adopta**, con el texto de la tarjeta |
| V-36 | 17-6 | «No pudimos leer la cuenta», con «Los datos anteriores se conservan» y «Reintentar» | **Se adopta sin esa línea** (H-9) |
| V-37 | 07 | La pantalla «Técnicos» entera | **No entra acá** (D-1): pasa a la **24.8.2-c** |

## Decisiones

**Las nueve quedaron cerradas el 2026-11-17 en su opción recomendada**, que en todas es la (a). Las
opciones descartadas se conservan escritas: son el motivo por el que la elegida se eligió.

### D-1 · ¿La pantalla «Técnicos» entra en esta subfase? — CERRADA en (a)

- **(a) No: esta subfase toma las cuatro láminas del grupo 28, y «Técnicos» pasa a una hermana
  24.8.2-c** *(recomendada)*. Motivo medido en **H-1**: las cuatro pantallas ya son 2.912 líneas en
  18 archivos, el tamaño de la 24.8.2 entera, y «Técnicos» suma ruta, lectura, navegación y batería.
  Es el mismo corte que la fase hizo seis veces.
- **(b)** Hacerla acá. Es el camino de los dos precedentes de **R2 por exceso de alcance** que la
  D-1 de la 24.8.2 ya citó.
- **(c)** Sacarla de la Fase 24. Es defendible —la fase se llama «Pantallas **rediseñadas** con lo
  que ya existe» y esto es una pantalla nueva—, y tiene precedente: el enmascarado del IMEI salió de
  la fase por decisión del usuario el 2026-10-31. Pero las reglas de la fase **permiten lecturas
  nuevas** y el marco está reabierto, así que la pantalla **cabe**; lo que no cabe es meterla acá.

**Cerrada en (a)**, al cerrar la subfase hay que **crear la 24.8.2-c** en Notion, dentro del
proyecto de la Fase 24 y en «Esperando», y **agregar su fila al Roadmap**: la tabla pasa a **31
filas**. Hasta entonces, la fila 485 del Roadmap sigue nombrando la lámina 07 dentro de esta
subfase: **la discrepancia queda declarada acá y se corrige al cerrar**, como hizo la 24.8.2 con su
propia división.

### D-2 · «Es técnico» en el alta y la edición (la decisión que la fila arrastra) — CERRADA en (a)

El Roadmap manda esta decisión desde que la 29.6 dejó la marca en una acción aparte de la ficha
(brief-29.6, D-3: «un `admin` lo marca en la ficha del proveedor»). El README del lote 28 advierte
que integrarla al formulario «es una propuesta» y que «el checkbox del render **no prueba una
operación atómica existente**».

- **(a) La casilla entra en el formulario, y el alta la guarda en la misma transacción que crea el
  proveedor** *(recomendada)*. Es lo único que cumple la advertencia del README: no hay un estado
  intermedio en el que el proveedor exista y la marca no, y la pantalla nunca dice que se guardó
  algo que falló. En la **edición** la casilla hace lo mismo que hoy hace el botón, y la auditoría
  sigue registrando el cambio de `isTechnician` como la 29.6 lo dejó.
- (b) La casilla solo en la edición, y el alta sin ella. Evita tocar `createSupplier`, pero deja dos
  caminos distintos para el mismo campo y no es lo que la lámina dibuja.
- (c) Se queda como está: acción separada en la ficha. La lámina 15 queda sin cumplir y se declara.

**En las tres**, la casilla **solo se dibuja con la capacidad `repairs`**, y el servidor la exige
igual: sin la capacidad, `setSupplierTechnician` ya responde `NOT_FOUND`.

### D-3 · El filtro «Tipo» del listado (H-2) — CERRADA en (a)

- **(a) Se implementa, con una cláusula nueva en `findSuppliers` y su medición** *(recomendada)*.
  La fase permite lecturas nuevas declaradas y medidas, y el filtro es la única manera de encontrar
  a los técnicos en un listado paginado de a 25.
- (b) Solo la columna «Tipo», sin filtro. Más barato y deja la lámina a medias.

**En las dos**, el control **no se dibuja sin la capacidad `repairs`**, por la regla del filtro de
una sola opción.

### D-4 · La ficha: ¿pestañas por URL o secciones apiladas? (H-5) — CERRADA en (a)

- **(a) Secciones apiladas, con la tarjeta «Trabajo reparado» arriba de «Cuenta» para un técnico, y
  una lectura nueva en `service`** *(recomendada)*. Las pestañas de la lámina **son una propuesta de
  interfaz**, y el README del lote lo dice. Sin JavaScript, cada pestaña es una carga de página: la
  ficha dejaría de poder imprimirse de una, y el historial del navegador se llenaría de estados
  intermedios. Apilada, la ficha sigue siendo una sola lectura compuesta, que es lo que es hoy.
- (b) Pestañas por URL (`?seccion=cuenta`), con «Resumen» por defecto. Es la lámina exacta y **baja
  el costo de la carga**, porque cada pestaña lee lo suyo. Cuesta cuatro caminos nuevos de prueba y
  rompe la impresión de la ficha entera.
- (c) Apiladas y sin la tarjeta «Trabajo reparado». Deja sin cumplir lo único que la fila nombra
  para el técnico.

**La lectura nueva de (a) y (b) es la misma**: los trabajos reparados de un técnico con su modelo y
su tipo de reparación, en `service`, con su propio `authorize(admin)`, **sin tocar la cuenta ni la
guarda** (H-5). Se mide con `explain (analyze, buffers)`.

### D-5 · «Ver reparaciones» (H-6) — CERRADA en (a)

- **(a) El botón lleva a `/reparaciones` filtrado por el técnico, y el filtro se agrega**
  *(recomendada)*. Un botón que promete las reparaciones de este técnico y devuelve todas es el
  defecto que la 24.6.2-e ya registró con otro nombre. El filtro vive en la URL, como todos.
- (b) El botón lleva a la lista sin filtrar. Barato y engañoso.
- (c) No se dibuja el botón. La lámina queda sin cumplir y se declara.

### D-6 · «Salida registrada» en el estado de cuenta (H-3) — CERRADA en (a)

- **(a) No se adopta la columna** *(recomendada)*. Es **un campo nuevo en un contrato de `cash`**,
  y la Fase 24 prohíbe contratos nuevos. La conversión del pago ya se ve entera en el comprobante
  del pago, al que la fila enlaza.
- (b) Se agrega el campo al documento del estado de cuenta. Habría que elevarlo como ampliación de
  contrato, con su propio ADR o su fila.

### D-7 · El resumen por moneda del estado de cuenta (H-4) — CERRADA en (a)

- **(a) Tarjeta por moneda con el saldo en grande, y Debe y Haber debajo, dentro de la misma
  tarjeta** *(recomendada)*. Toma la forma de la lámina sin perder lo que el README y el ADR 0023
  (punto 13) piden que el documento tenga.
- (b) Solo el saldo, como la lámina. El documento impreso pierde el Debe y el Haber.
- (c) Como hoy. La lámina queda sin cumplir.

### D-8 · El menú «Más» de la ficha (H-7) — CERRADA en (a)

- **(a) Un `<details>` «Más» con las acciones secundarias, que no se dibuja si no le queda
  ninguna** *(recomendada)*. Es el patrón de la 24.7.1, anda sin JavaScript y acá hay cinco
  acciones, que es el caso para el que el menú existe.
- (b) Enlaces planos, como resolvió la D-2 de la 24.7.2-b. Con cinco acciones, el encabezado se
  llena.
- (c) Un *popover* con JavaScript. **Descartada de entrada**: contra un invariante medido.

### D-9 · El filtro de moneda del estado de cuenta (V-26) — CERRADA en (a)

- **(a) Se implementa sobre la misma lectura, filtrando la presentación, y el resumen de cada moneda
  sigue completo** *(recomendada)*. No cuesta ninguna lectura nueva, vive en la URL
  (`?moneda=`) y **no se dibuja con una sola moneda**, por la regla de la 24.8.2.
- (b) No se implementa. La lámina queda sin cumplir y se declara.

**En las dos**, el documento impreso sale **sin recortar**: un estado de cuenta filtrado que no diga
que está filtrado sería un documento que miente.

## Alcance

### Incluido

1. **El listado (pantalla 40)** con la forma de la lámina 13: tarjeta única, «Ver cuentas a pagar»,
   columna «Tipo», acción «Ver», «Sin datos», el pie con el aviso y el total, y el filtro «Tipo» si
   D-3 se aprueba en (a).
2. **El alta y la edición (pantalla 41)** con la forma de la lámina 15: migas, las tres secciones y
   el aviso de unicidad, más «Es técnico» según D-2. **Ningún rechazo cambia**: el nombre vacío o
   largo, el teléfono mal formado, el email inválido, el CUIT de otra longitud o con verificador que
   no cierra y los dos duplicados siguen dando **el mismo mensaje** y conservando lo escrito.
3. **La ficha (pantalla 42)** con la forma de la lámina 14, según D-4, D-5 y D-8, y con la tarjeta 5
   para el proveedor inactivo y la 6 sin su línea falsa.
4. **El estado de cuenta (pantalla 55)** con la forma de la lámina 11, según D-6, D-7 y D-9,
   **conservando el documento imprimible entero**.
5. **Una lectura nueva en `service`** —los trabajos reparados de un técnico, con modelo y tipo de
   reparación— y **una cláusula nueva en `findSuppliers`** (D-3). Las dos **medidas**.
6. **El barrido de reflujo** en las cuatro pantallas, dentro de las tarjetas y no solo del documento
   (H-8).
7. **`Screens.md`** actualizado en sus secciones 40, 41, 42 y 55.
8. **La fila del índice de briefs de la 24.8.2** que falta, y la de este brief (H-10).

### Excluido

- **La pantalla «Técnicos» de la lámina 07**, por D-1: pasa a la **24.8.2-c**. **Con
  ella se va la entrada de navegación**, que ninguna subfase de la fase tocó todavía.
- **Las pantallas de pago**: la lista, el panel, las dos de registro, la anulación y «A pagar» son
  de la 24.8.2, cerrada. `[supplierId]/pagar/page.tsx` **no se toca**.
- **El marco de la aplicación**: navegación lateral, buscador global y barra superior.
- **Ninguna regla de negocio**: validación del nombre y el CUIT, unicidad, desactivación,
  reactivación, imputación, tope del pago y efecto en la caja quedan como están.
- **El objetivo táctil de 44 px** y **el desbordamiento del `<select>` de moneda**, pendientes
  declarados desde la 24.7.1 y la 24.7.2-b: **no se arreglan acá de paso**. Si un control de esta
  subfase se mide y está mal, se declara y se deja anotado.
- **Migraciones, tablas, columnas y contratos nuevos.** Siguen **67** migraciones.
- **Cualquier módulo o pantalla de ERP fuera de esta fase y de este brief** (CLAUDE.md).

## Lista cerrada de archivos

Tocar algo fuera de esta lista es un hallazgo bloqueante, no una mejora bienvenida. Ampliarla se
**pide antes de implementar**, no después.

**Pantallas** (`src/app/(autenticado)/compras/proveedores/`):

`page.tsx` · `filters.ts` · `filters.test.ts` · `messages.ts` · `messages.test.ts` · `actions.ts` ·
`supplier-form.tsx` · `nuevo/page.tsx` · `[supplierId]/page.tsx` · `[supplierId]/supplier-account.tsx` ·
`[supplierId]/supplier-actions.tsx` · `[supplierId]/audit-summary.ts` ·
`[supplierId]/audit-summary.test.ts` · `[supplierId]/editar/page.tsx` ·
`[supplierId]/cuenta/page.tsx` · `[supplierId]/cuenta/messages.ts`

**Módulos**, lo que habilitan las decisiones cerradas:

- por **D-3**, el filtro «Tipo»: `src/modules/purchasing/repository.ts`,
  `src/modules/purchasing/service.ts` y sus pruebas;
- por **D-2**, el alta con la marca: `src/modules/purchasing/service.ts` y su prueba;
- por **D-4**, los trabajos reparados: un archivo propio en `src/modules/service/`, su prueba y
  `src/modules/service/index.ts`;
- por **D-5**, el filtro por técnico: `src/app/(autenticado)/reparaciones/filters.ts` y su prueba.

**Nada más de `src/modules/`.** `cash` no se toca, y `tests/guards/purchasing-dependencies.test.ts`
tampoco: si algo lo necesitara, es la condición de detención 5.

**Pruebas**: `tests/e2e/suppliers.spec.ts` · `tests/e2e/supplier-accounts.spec.ts`.

**Documentación**: `docs/product/Screens.md` · `docs/decisions/README.md` ·
`docs/decisions/brief-24.8.2-b-compras-proveedores-tecnicos-y-cuenta.md` (este).

## Fuentes de verdad, en orden

1. El código y las migraciones de este repositorio.
2. [DataModel.md](../architecture/DataModel.md), §`suppliers` y la nota de la deuda con el técnico.
3. [ADR 0023](0023-compras-y-proveedores.md) y [ADR 0024](0024-rubros-y-capacidades.md); los
   briefs 22.2, 22.7, 29.4.3 y 29.6; [Roadmap.md](../planning/Roadmap.md) §Fase 24.
4. [Screens.md](../product/Screens.md), secciones 40, 41, 42 y 55.
5. Las láminas y sus README, **para la forma**, no para las reglas.
6. Notion, solo para el estado de la tarea.

## Invariantes

1. **Todo anda sin JavaScript**: el listado, los filtros, los dos formularios, la ficha, el menú si
   lo hay, y el estado de cuenta.
2. **Ninguna regla de negocio cambia**: validación, unicidad, desactivación, reactivación,
   imputación y cuenta quedan exactamente como están.
3. **Ninguna cifra sale de una cuenta propia**: todo de `supplierLedger` e `imputeAccount`.
4. **Sin `JOIN` entre módulos**, y `purchasing` no importa `cash`. La guarda lo verifica.
5. **Ninguna lectura nueva de la cuenta del proveedor** fuera de las declaradas en la regla 3 de la
   guarda.
6. **Solo `admin`**, también en el servidor: un `viewer` recibe el aviso y **ningún dato** en las
   cuatro pantallas. Lo de técnico, además, solo con la capacidad `repairs`.
7. **Sin migraciones**: siguen 67.
8. **No se suman dos monedas** sin una referencia explícita y su tasa.
9. **Una lectura que falla nunca se dibuja como un cero**: ni «No se le debe nada» ni «Los datos
   anteriores se conservan».

## Criterios de aceptación

| id | Criterio | Evidencia |
|---|---|---|
| **AC-1** | El listado tiene la forma de la lámina 13: tarjeta única, columnas, «Ver», pie con aviso y total | e2e |
| **AC-2** | La columna «Tipo» aparece **solo** con la capacidad `repairs`, y el filtro, **solo** si además hay más de una opción | e2e con y sin la capacidad |
| **AC-3** | El alta y la edición tienen la forma de la lámina 15 y **ningún rechazo cambia**: los seis siguen dando el mismo mensaje, con lo escrito conservado y el foco en el campo | e2e, uno por rechazo |
| **AC-4** | **Crear un proveedor con la marca es atómico** (D-2): si la marca falla, el proveedor no queda creado, y la pantalla nunca dice que se guardó | integración, con el fallo forzado |
| **AC-5** | La ficha tiene la forma de la lámina 14, y para un técnico muestra sus trabajos reparados con **modelo y tipo de reparación** | e2e |
| **AC-6** | La ficha de un proveedor inactivo muestra la tarjeta 5 con sus tres frases y «Reactivar proveedor» | e2e |
| **AC-7** | Con la cuenta ilegible, la ficha muestra la tarjeta 6 **sin** «los datos anteriores se conservan» y **sin** un cero | e2e con la lectura forzada a fallar |
| **AC-8** | El estado de cuenta tiene la forma de la lámina 11 y **sigue imprimiéndose entero**: al imprimir queda solo el documento, con organización, leyenda, CUIT y fecha | e2e con `media: print` |
| **AC-9** | El filtro de moneda, si entra, **no recorta el documento impreso** y el resumen de cada moneda sigue completo | e2e |
| **AC-10** | **Todo anda sin JavaScript**: filtros, formularios, menú y paginación | e2e con `javaScriptEnabled: false` |
| **AC-11** | Un `viewer` recibe el aviso y **ningún dato** en las cuatro pantallas, también por URL directa; sin `repairs`, nada de técnico | e2e + integración |
| **AC-12** | **Comparación entrada por entrada con las seis láminas abiertas**, declarando **a qué ancho** se hizo y cubriendo **al menos un ancho entre el quiebre de la tabla y el `max-width` del contenedor** | tabla de diferencias en el §Cierre |
| **AC-13** | **Reflujo medido dentro de las tarjetas** en las cuatro pantallas, a **320, 375, 1.280, 1.440, 1.536 y 1.680 px**, comparando cada fila contra su contenedor | el caso de `goods-receipts.spec.ts` replicado acá (H-8) |
| **AC-14** | **Las lecturas nuevas o modificadas, medidas** con `explain (analyze, buffers)`, y declarado si alguna recorre toda la tabla | medición pegada en el §Cierre |
| **AC-15** | **La guarda de dependencias sigue en verde sin que se la toque**: `purchasing` no importa `cash` y ninguna lectura nueva de la cuenta queda fuera de la regla 3 | la corrida de `purchasing-dependencies.test.ts` |
| **AC-16** | **Sin migraciones nuevas**: siguen 67 | la cuenta de los archivos de migración |
| **AC-17** | axe sin violaciones A ni AA en las cuatro pantallas, con el menú abierto y con el formulario rechazado | `expectAccessible` |
| **AC-18** | La batería completa en CI sobre el **SHA exacto**, leída por `headSha`, con «Corre todo: true» | la corrida de CI citada |
| **AC-19** | **Revisión independiente** de un agente que no participó, contra este brief y contra las reglas vigentes | informe con veredicto |
| **AC-20** | Despliegue con las **siete verificaciones del runbook** y **recorrido del usuario** | journal y la palabra del usuario |

## Mediciones requeridas

1. **El filtro «Tipo»** (D-3), si entra: `explain (analyze, buffers)` del listado filtrado y sin
   filtrar, con el plan pegado y el índice que use declarado.
2. **La lectura de los trabajos reparados de un técnico** (D-4): ídem, sobre un técnico con muchas
   órdenes.
3. **El reflujo dentro de las tarjetas** en los seis anchos de AC-13, midiendo con
   `getBoundingClientRect` **en el navegador** y no razonando sobre la captura.
4. **El tamaño real del cambio**, con `git show --stat` contra la lista cerrada, **antes** de
   escribir el cierre.

## Condiciones de detención

El implementador **para y reporta**, sin seguir, cuando:

1. Una decisión **D-1 a D-9 no está aprobada** y el trabajo la necesita. **Las nueve quedaron
   cerradas en (a) el 2026-11-17**, así que esto alcanza a cualquier decisión nueva que aparezca al
   implementar, no a las nueve.
2. Haría falta **un archivo fuera de la lista cerrada**. Se pide **antes** de tocarlo.
3. Aparece la necesidad de una **migración, una tabla, una columna o un contrato nuevo** —por
   ejemplo, el campo de «Salida registrada» si D-6 cerrara en (b)—.
4. Una lectura nueva **recorre toda una tabla** y la medición lo muestra.
5. Haría falta **tocar `tests/guards/purchasing-dependencies.test.ts`** para que algo pase.
6. Una lámina **contradice** un ADR, un brief aprobado o `Screens.md`: se documenta la discrepancia y
   se eleva, **nunca se resuelve en silencio**.
7. Antes de **commit, push, despliegue, cambios en Notion** o cualquier efecto externo: cada uno
   necesita autorización del usuario **en el turno**.

## Nivel de validación objetivo

**Validado en staging**, y solo con AC-20 cumplido. Hasta el despliegue y el recorrido del usuario el
nivel es **validado en integración**, y **un nivel superior nunca se infiere de uno inferior**.

## Ubicación en la fase

- **Necesario ahora**: las cuatro pantallas del grupo 28, que son las últimas del bloque de
  Abastecimiento. Con ellas el bloque cierra.
- **Requisito antes de producción**: nada propio. Esta subfase no agrega datos ni cambia reglas; lo
  que la frena es su propia revisión y el recorrido.
- **Mejora posterior**: la pantalla «Técnicos» (D-1), el enmascarado de datos de contacto, el orden
  por columna del listado y el objetivo táctil de 44 px, que es **una subfase propia y todavía sin
  abrir**.

## Cierre

*Escrito el 2026-11-17, con las cuatro pantallas implementadas y verificadas localmente.
**Nivel alcanzado: validado en integración.** No es «validado en staging»: eso pide AC-18, AC-19 y
AC-20, y al escribir esto los tres están sin hacer. **Un nivel superior nunca se infiere de uno
inferior.** Esta sección es **una autoevaluación**, no una revisión independiente: la independiente
es AC-19 y todavía no corrió.*

### Alcance real contra la lista cerrada (medición 4)

`git diff --stat HEAD` da **27 archivos versionados, +2.761/−565** —26 de código y documentación
más este brief—, y ese número **no cuenta los archivos nuevos**, que `git diff` no ve. Los nuevos
son **tres, 706 líneas**: `src/modules/service/technician-work.ts` (147),
`tests/integration/technician-work.test.ts` (498) y
`src/app/(autenticado)/reparaciones/filters.test.ts` (61). **Total: 30 archivos.** El recuento se
escribe así porque el cierre de la 24.8.2 tuvo que corregir el suyo justamente por mezclar las dos
cosas. Las cifras son las de después de las correcciones de la revisión independiente, más abajo:
antes de ellas eran 26 + 1 archivos, +2.458/−561, y 654 líneas nuevas. **Son las del árbol antes de
commitear**, así que no son las del commit: el commit incluye además las líneas de este §Cierre y
cuenta los tres archivos nuevos como altas, y su cifra es la que informa `git show --stat` y la que
queda citada al cerrar. Decirlo así es lo que evita el error que el cierre de la 24.8.2 tuvo que
corregir, que fue presentar el `git diff` de los versionados como si fuera el tamaño del commit.

Todo cae dentro de la lista cerrada salvo **tres archivos, pedidos y autorizados por el usuario en
su turno antes de tocarlos**, no después:

| Archivo | Por qué entró |
|---|---|
| `src/modules/service/repository.ts` | D-5: filtrar la lista de reparaciones por técnico es una condición más en la lectura del módulo, y el brief solo había previsto `filters.ts` de la pantalla |
| `src/modules/service/service-orders.ts` | El servicio que expone esa lectura: sin él la condición no llega desde la pantalla |
| `src/app/(autenticado)/reparaciones/page.tsx` | El `<select>` «Técnico» de la lista, que es donde el filtro se ve |

Dos ubicaciones distintas de las que el brief suponía, declaradas y no corregidas en silencio:

- la prueba del archivo nuevo de `service` quedó en **`tests/integration/technician-work.test.ts`**,
  no junto al módulo: necesita PostgreSQL real, y en este repositorio esas pruebas viven en
  `tests/integration/`;
- **`tests/integration/suppliers.test.ts`** creció 326 líneas. La lista nombra «`service.ts` y su
  prueba» sin dar la ruta, y esa es la prueba de `purchasing/service.ts`.

`.claude/settings.json` figura sin versionar **desde antes de esta subfase**: se declara y no se
toca.

### Desvíos del diseño aprobado

| Qué | Qué dice el brief | Qué se hizo y con qué autorización |
|---|---|---|
| El menú «Más» de la ficha (D-8) | Un `<details>` | **`MoreActions`**, el componente que ya usan otras fichas del CRM. **Preguntado y autorizado por el usuario antes de implementarlo**; anda sin JavaScript igual |
| La tarjeta «Técnico» de la ficha | La ficha la conserva | **Se saca.** D-2 mudó la marca al alta y la edición, así que la tarjeta quedaba sin nada que hacer. **Preguntado y autorizado antes de tocarlo** |
| La lectura de la cuenta en la ficha | No lo preveía | `supplier-account.tsx` **atrapa la excepción** y registra el evento. Sin eso la tarjeta 6 **no era alcanzable**: una caída de la base rompía la ficha entera, y el único camino que la dibujaba era un rechazo de permisos, que en la ficha no puede pasar porque un `viewer` no llega. Es lo que AC-7 pide poder probar, y se prueba renombrando la tabla. **El blindaje es solo de esa lectura**: `listSupplierAudit`, las dos de órdenes y recepciones y la nueva `listTechnicianWork` siguen sin red, así que una caída de la base en cualquiera de ellas sigue rompiendo la ficha entera. Blindarlas sería ampliar el alcance; lo que no corresponde es generalizar el arreglo, y lo señaló el hallazgo N-10 de la revisión |

### AC-12 · Comparación entrada por entrada con las seis láminas

Hecha el 2026-11-17 sobre **capturas reales de la aplicación**, no sobre el código, a **900 px** y
**1.440 px**. 900 px está **entre el quiebre de la tabla** (`md`, 768) **y el `max-width` del contenedor** en
tres de las cuatro pantallas: 1.024 en el estado de cuenta y 1.152 en el listado y la ficha. **En el
alta y la edición no**, porque su contenedor mide 896 (`max-w-4xl`) y 900 lo pasa; el criterio pide
«al menos un ancho» y esas dos quedan cubiertas por el barrido de AC-13, que las mide a 375 y a
1.280. La enumeración original de esta línea decía «896 en el alta» como si 900 cayera dentro:
**lo corrige la nota 3 de la revisión independiente**.

**Láminas 13 (listado) y 15 (alta y edición)**: coinciden entrada por entrada. Las únicas
diferencias son las ya declaradas arriba —V-5, V-6, V-10, V-15 y V-16—, más una menor sin declarar:
la lámina no dibuja botón «Buscar» junto al campo y la implementación sí, **porque sin JavaScript
hace falta** (invariante 1).

**Lámina 17, tarjetas 5 y 6**: coinciden, incluida la omisión declarada de «Los datos anteriores se
conservan» (V-36, H-9). La tarjeta 6 se comparó con la cuenta **realmente rota**, no simulada.

**Lámina 07 («Técnicos»)**: no se implementó nada de ella, que es lo que deciden D-1 y V-37.
Verificado además que la marca «Habilitado como técnico» **no se edita en la ficha**, porque D-2 la
mudó al alta y la edición.

**Láminas 14 (ficha) y 11 (estado de cuenta)**, diferencias **no previstas** por el brief:

| # | Lámina | La lámina | La implementación | Resolución |
|---|---|---|---|---|
| 1 | 14 | El saldo de «Cuenta» es un número grande con su leyenda debajo | Era una línea de lista por moneda, la forma de la 22.7 | **Corregida el 2026-11-17**: número grande con «Se le debe {moneda}» debajo, una columna por moneda |
| 2 | 11 | Las tarjetas por moneda llevan ícono en círculo y fondo tenue | Eran blancas, sin ícono | **Corregida el 2026-11-17**: fondo `surface-muted` —que ya tiene su valor en modo oscuro— e ícono en círculo |
| 3 | 14 | «Cuenta» va arriba de «Trabajo reparado» | «Cuenta» queda abajo, después de «Órdenes de compra» y «Recepciones» | **Se declara.** Esas dos tarjetas la lámina ni las dibuja: son de la 22.3 y la 22.4, y reordenarlas es tocar lo que esta subfase no revisa |
| 4 | 14 | La nota de «Trabajo reparado» es un bloque con ícono, y la fila una sub-tarjeta con chevron | Una línea de texto y una fila de tabla | **Se declara**: cosmética, sin cambio de contenido |
| 5 | 11 | Filtro de moneda y los dos botones **en la fila del título** | Los botones bajo el subtítulo y el filtro en su propia fila, con rótulo «Moneda» y botón «Ver» | **Se declara**: el «Ver» es lo que hace andar el filtro sin JavaScript, y arrastra la fila aparte |
| 6 | 11 | Línea «Total de referencia: USD 780,00 · 1 USD = ARS 1.500 · Cotización ilustrativa» | **El estado de cuenta ya trae el total de referencia**, en dos líneas —«Se le debe en total» y «A favor del negocio en total»—, con su tasa y su fecha, desde la 29.4.3, y **dentro del documento imprimible** (`cuenta/page.tsx`, `ReferenceTotal` dentro del `<article data-comprobante>`) | **Se adopta en el fondo y se declara la forma**: la cifra existe y se imprime; lo que no se copia es el formato de una sola línea con la palabra «ilustrativa», porque el componente ya dice «de referencia» con la tasa y la fecha, que es la forma que el invariante 8 exige. **La versión anterior de esta fila decía que la línea «no existe en el estado de cuenta» y que el invariante 8 la prohibía: las dos mitades eran falsas, y las corrigió el hallazgo B-4 de la revisión independiente** |
| 7 | 11 | La columna de acciones se titula «Acciones» | El encabezado es «Detalle» y queda solo para lectores de pantalla | **Se declara**: la columna lleva un enlace por fila, y el rótulo visible sería ruido |

Dos entradas de la tabla de desvíos previos quedaron marcadas «Se adopta» sin estar
implementadas, y las encontró el hallazgo N-2 de la revisión independiente:

- **V-11** (migas «Abastecimiento › Proveedores › Nuevo proveedor» en el alta): **no se adoptan**, y
  no es una omisión de esta subfase: las migas del CRM viven en la barra superior
  (`_components/breadcrumbs.tsx`) y llegan hasta la sección, con una nota propia que dice que el
  nivel del detalle llega «con la subfase de cada módulo». Agregar un segundo juego de migas dentro
  del contenido sería dibujar dos veces lo mismo. Queda escrito en `Screens.md` §41 y **se declara
  acá**, que es donde la tabla lo daba por hecho.
- **V-17** (ícono en el encabezado de la ficha): **faltaba de verdad**. **Corregido el 2026-11-17**:
  la ficha pasa `leading={<HeaderIcon name="building" />}` a `DetailHeader`, como el estado de
  cuenta ya hacía con el suyo.

Dos cosas que **no** son hallazgos, anotadas para que nadie las cuente como defectos: a 900 px la
barra inferior de navegación aparece sobre el contenido en la captura, pero es un artefacto del
`fullPage` sobre un elemento fijo; y la «Actividad» sale vacía en las capturas porque el
instrumento insertó los proveedores por SQL, sin pasar por la auditoría.

### AC-13 y medición 3 · Reflujo dentro de las tarjetas

Barrido automatizado, midiendo con `getBoundingClientRect` **en el navegador**, a **320, 375,
1.280, 1.440, 1.536 y 1.680 px**: **8 pantallas en `tests/e2e/suppliers.spec.ts`** y **2 más en
`tests/e2e/supplier-accounts.spec.ts`** = **10 pantallas × 6 anchos = 60 combinaciones**, en verde.

Las dos últimas las agregó el hallazgo N-1 de la revisión independiente, y **no eran un detalle de
recuento**. El barrido original recorría la URL del estado de cuenta con un proveedor creado por
`insertSupplier`, es decir **sin una sola recepción ni un solo pago**: en los seis anchos la
pantalla dibujaba el encabezado y «Este proveedor no tiene recepciones ni pagos.», y **ninguna** de
las tarjetas que esta subfase estrena ahí —el saldo grande con su ícono, «Imputación actual» de ocho
columnas, «Comprobantes», la fila del filtro de moneda—. La URL estaba en el barrido; el contenido
no. Es el mismo patrón que la 24.8.2 ya había registrado: *la pantalla estaba, el defecto estaba
adentro*.

**El barrido nuevo, sobre el estado de cuenta con dos monedas, pagos e imputación, encontró un
defecto real**: a **320 px el documento pedía 808 px**, o sea desbordaba el teléfono más chico. La
causa no era la tabla —su contenedor `overflow-x-auto` la contiene bien, medido: ancho 286,
`scrollWidth` 807—, sino que los `sr-only` de la tabla son `position: absolute` y, dentro de un
scroller **estático**, se cuelgan del bloque inicial y estiran el documento entero. **Corregido**
agregando `relative` a los dos scrollers, con lo cual el overflow los contiene. Es **la misma
lección que la 24.8.2 aprendió** con los radios `sr-only` del filtro «Tipo», que allá se arregló
envolviéndolos en un `<label className="relative">`: reapareció acá porque la regla se había
guardado como «el radio necesita su label relative» y no como «un `sr-only` necesita un ancestro
posicionado».

### AC-14 y mediciones 1 y 2 · Las lecturas, medidas

**Medición 1 — el listado filtrado por «Tipo» (D-3)**, con 2.000 proveedores en la organización, la
mitad técnicos, después de `analyze`:

```
sin filtrar
Limit (cost=0.41..4.62 rows=25) (actual time=0.047..0.050 rows=25.00 loops=1)  Buffers: shared hit=3
  -> Incremental Sort  Sort Key: (lower(name)), id  Presorted Key: (lower(name))
     -> Index Scan using suppliers_organization_name_lower_unique on suppliers
          Index Cond: (organization_id = …)   Filter: is_active   Rows Removed by Filter: 6
Planning Time: 0.108 ms · Execution Time: 0.080 ms

solo técnicos
Limit (cost=0.53..7.76 rows=25) (actual time=0.056..0.059 rows=25.00 loops=1)  Buffers: shared hit=4
  -> Incremental Sort  Sort Key: (lower(name)), id  Presorted Key: (lower(name))
     -> Index Scan using suppliers_organization_name_lower_unique on suppliers
          Index Cond: (organization_id = …)   Filter: (is_active AND is_technician)
          Rows Removed by Filter: 38
Planning Time: 0.096 ms · Execution Time: 0.083 ms
```

Las dos usan **el mismo índice del orden alfabético, que ya existía**; la cláusula nueva entra como
filtro y **no agrega ningún recorrido de la tabla entera**. El caso está versionado y falla si
aparece un `Seq Scan on suppliers`.

**Medición 2 — los trabajos reparados de un técnico (D-4)**, con **10.021 órdenes de servicio** de
las cuales 21 son del técnico, después de `analyze`:

```
Limit (cost=44.05..44.07 rows=5) (actual time=0.041..0.043 rows=5.00 loops=1)  Buffers: shared hit=24
  -> Sort  Sort Key: repaired_at DESC, number DESC  top-N heapsort  Memory: 25kB
     -> Index Scan using service_orders_technician_idx on service_orders
          Index Cond: (organization_id = … AND technician_id = …)
          Filter: ((repaired_at IS NOT NULL) AND (technician_total IS NOT NULL))
Planning Time: 0.315 ms · Execution Time: 0.053 ms
```

Usa **`service_orders_technician_idx`**, el índice parcial `(organization_id, technician_id) where
technician_id is not null` que **ya existía desde la 29.6**: esta subfase **no agrega ningún índice
ni ninguna migración**. La primera corrida de esta medición dio **`Seq Scan`** con 2.001 órdenes y
la mitad del técnico; no era un índice faltante sino la elección del planificador con esa
selectividad, y se comprobó en `pg_indexes` antes de concluir nada. La medición quedó con la forma
que el caso real tiene —muchas órdenes, pocas de un técnico— y el caso versionado **afirma el
nombre del índice**, no solo la ausencia de `Seq Scan`.

**Medición 4 — la lista de `/reparaciones` filtrada por técnico**, la **tercera lectura
modificada**, que este §Cierre declaraba sin medir hasta que la encontró el hallazgo B-3 de la
revisión independiente: `service/repository.ts` sumó `technician_id` a `listConditions`, que es el
`where` de **`countServiceOrders`** y de **`findServiceOrders`**, las dos consultas de la pantalla.
Con las mismas **10.021 órdenes** y después de `analyze`:

```
count(*)
Aggregate (cost=43.76..43.77 rows=1) (actual time=0.037..0.038 rows=1.00 loops=1)  Buffers: shared hit=23
  -> Index Only Scan using service_orders_technician_idx on service_orders  (rows=21.00 loops=1)
       Index Cond: ((organization_id = …) AND (technician_id = …))
Planning Time: 0.268 ms · Execution Time: 0.050 ms

la página
Limit (cost=44.17..44.22 rows=21) (actual time=0.122..0.124 rows=21.00 loops=1)  Buffers: shared hit=30
  -> Sort  Sort Key: created_at DESC, id DESC  quicksort  Memory: 26kB
     -> Index Scan using service_orders_technician_idx on service_orders  (rows=21.00 loops=1)
          Index Cond: ((organization_id = …) AND (technician_id = …))
Planning Time: 0.707 ms · Execution Time: 0.170 ms
```

Las dos usan el mismo índice de la 29.6, una como **Index Only Scan**; **ninguna recorre la tabla
entera**, y el caso versionado afirma el nombre del índice y la ausencia de `Seq Scan`. El caso
además llama a `listServiceOrders` de verdad con el filtro de la pantalla y comprueba que devuelve
las **21** órdenes del técnico, que es el mismo universo que cuenta la tarjeta de la ficha.

**Las cuatro mediciones transcriben el SQL a mano**, porque el repositorio no expone su builder: si
mañana una de esas lecturas cambia de forma, el caso sigue verde midiendo una consulta que ya no
existe. Se declara, es el mismo límite que registró la 24.8.1 en su N-1, y lo que lo acota es que
cada medición llama además al servicio real y compara su resultado.

### Estado de los criterios de aceptación

| id | Estado | Evidencia |
|---|---|---|
| AC-1, AC-2, AC-5 a AC-11, AC-17 | **Cumplidos** | `tests/e2e/suppliers.spec.ts` **15/15** y `tests/e2e/supplier-accounts.spec.ts` **6/6**, con build fresco, `expectAccessible` en cada pantalla, el menú abierto, el formulario rechazado y la impresión. El CUIT impreso quedó cubierto al corregir el hallazgo N-3: el caso de impresión corría sobre el único proveedor del fixture **sin** CUIT |
| **AC-3** | **Cumplido con una salvedad declarada** | El criterio pide «e2e, uno por rechazo» para los seis. Se agregaron los dos que faltaban y **sí son alcanzables** —la forma del CUIT y el CUIT repetido—, con lo cual la batería ejercita **cinco**: teléfono, forma del CUIT, dígito verificador, nombre repetido y CUIT repetido. Los otros **no son alcanzables desde el navegador**: «Nombre» es `required` con `maxLength={120}` y «Email» es `type="email"`, así que la validación nativa los ataja antes de enviar, y el rechazo del servidor —que existe igual, como defensa en profundidad— se prueba en `tests/integration/suppliers.test.ts`. **El criterio quedó escrito pidiendo algo que el formulario hace imposible observar en e2e**; se declara en vez de reescribirlo, como hizo la 24.7.3 con su AC-9. Lo encontró el hallazgo B-2 de la revisión independiente, que tenía razón: la versión anterior de esta tabla lo daba por cumplido con tres de los seis |
| AC-4 | **Cumplido** | `tests/integration/suppliers.test.ts` **23/23**. La atomicidad es **estructural**: la marca es una columna del mismo `insert` dentro de `withTransaction` (`purchasing/service.ts`), así que **no existe un «fallo de la marca» que forzar**. Lo que el caso prueba es que **un alta rechazada no deja ni proveedor ni marca**, forzando un CUIT repetido. La versión anterior de esta fila decía «con el fallo de la marca forzado dentro de la transacción», que es más de lo que el caso hace: lo corrige el hallazgo N-4 de la revisión |
| AC-12 | **Cumplido** | La tabla de arriba, a 900 y 1.440 px, con la fila 6 corregida y V-11 y V-17 declarados |
| AC-13 | **Cumplido** | **60 combinaciones** en verde, con el estado de cuenta medido **con movimientos** después del hallazgo N-1 |
| AC-14 | **Cumplido** | Las **cuatro** mediciones de arriba; ninguna lectura recorre la tabla entera. La cuarta la agregó el hallazgo B-3 |
| AC-15 | **Cumplido** | `tests/guards/` **920/920 en 33 archivos**, con `purchasing-dependencies.test.ts` **sin tocar** |
| AC-16 | **Cumplido** | 67 archivos de migración, los mismos de producción |
| AC-18 | **Pendiente** | La CI no corrió: no hay commit |
| AC-19 | **Cumplido** | La revisión de abajo: un agente que no participó, de solo lectura. Veredicto **R1**, cuatro hallazgos bloqueantes, **los cuatro verificados contra el código y corregidos** |
| AC-20 | **Pendiente** | Sin despliegue ni recorrido |

Fuera de los criterios, el estado del árbol: `tsc --noEmit` limpio, `eslint` limpio sobre los
archivos tocados, `prettier --check` limpio sobre los archivos tocados, **unit y guardas
2.247/2.247 en 157 archivos** después de las correcciones de la revisión, y **integración
1.950/1.950**.

**La batería e2e completa no se pudo correr localmente hasta el final**, y se declara en vez de
redondearse. Se lanzó después de las correcciones, con build fresco, y el sistema la **mató por
falta de memoria**: 226 pasaron, **22 fallaron y 158 no corrieron**. Los 22 fallos **no son de
aserción**: 21 dicen `worker process exited unexpectedly (code=3221225794)` y uno
`browserContext.newPage: Target crashed`, o sea el proceso del navegador se cayó, y a partir de ahí
cascada. Tres de esos 22 son de las specs de proveedores, que **media hora antes, con el mismo
build y corridas solas, habían dado 21/21**. Lo que queda probado localmente son las dos specs
tocadas en aislamiento; **la evidencia de «toda la batería en una pasada» es la de AC-18**. Esto último, con una salvedad que no se redondea: la batería de
integración completa **no cerró en una sola corrida local**. Un worker se cayó
(`exit code 3221226505`) con `tests/integration/read-api-v3-repairs.test.ts`, que corrido solo da
**10/10**; son 1.950 en dos corridas, no 1.950 de una, y la evidencia de «toda la batería en una
pasada» es la de AC-18.

### AC-19 · Revisión independiente

Hecha el **2026-11-17** por un agente que **no participó del trabajo**, con acceso de **solo
lectura**, contra este brief, `CLAUDE.md`, los ADR 0023 y 0024, `DataModel.md`, `Screens.md` y la
guarda de dependencias. **No es una autoevaluación**, y **no autoriza nada**: informa hallazgos, que
se verificaron **uno por uno contra el código** antes de aceptarse, como pide `CLAUDE.md`.

**Veredicto: R1** — 4 bloqueantes, 10 no bloqueantes, 6 notas. El propio informe declara su límite:
**no tuvo shell**, así que no corrió tests ni mediciones ni abrió las láminas; todo lo que afirma
sale de leer los archivos. Los cuatro bloqueantes **eran ciertos**:

| # | Hallazgo | Verificación | Qué se hizo |
|---|---|---|---|
| **B-1** | «Ver las {n} reparaciones de este técnico» prometía un número y llevaba a una lista que mostraba menos | **Cierto.** El enlace iba sin `estado`, y `reparaciones/filters.ts` resuelve eso a `open`, que **excluye `delivered`** y, en unidades propias, todo lo reparado; el total de la tarjeta cuenta `repaired_at is not null`, que las incluye. El caso e2e no podía fallar porque tenía una sola orden, en `repaired`, el único estado donde las dos cifras coinciden | **Corregido**, con la forma que el usuario eligió: el enlace lleva `&estado=todas` —donde está todo lo que la tarjeta cuenta— y el rótulo pasa a **«Ver las órdenes de este técnico»**, sin cifra. Ningún estado del filtro reproduce exactamente ese universo, así que prometer un número era la parte insostenible. El e2e afirma ahora el `href` de los dos enlaces y que la lista llega con «Todas» puesta |
| **B-2** | AC-3 declarado cumplido con 3 de los 6 rechazos en e2e | **Cierto** | Dos casos nuevos y la salvedad declarada en la tabla de criterios, arriba |
| **B-3** | AC-14 declarado cumplido sin medir la tercera lectura modificada | **Cierto**: `technician_id` entró en `listConditions`, que alimenta las dos consultas de `/reparaciones` | **Medición 4**, arriba, con los dos planes |
| **B-4** | La fila 6 de AC-12 afirmaba lo contrario de lo que hace el código | **Cierto**: `cuenta/page.tsx` dibuja dos `ReferenceTotal` **dentro** del `<article data-comprobante>`, o sea el total de referencia existe y se imprime, y el invariante 8 no lo prohíbe: lo permite con tasa explícita, que es justo lo que el componente muestra | Fila reescrita, arriba |

De los diez no bloqueantes, **tres destaparon defectos o huecos reales y se corrigieron**: N-1 (el
barrido medía el estado de cuenta vacío, y al llenarlo apareció el desborde a 320 px), N-2 (V-17
faltaba de verdad) y N-3 (el CUIT nunca se probó impreso). N-4, N-6 y N-10 **corrigen afirmaciones
de este §Cierre** y están aplicados en su lugar. Los cuatro restantes **se declaran y no se
tocan**:

- **N-5** · Nadie probaba que la casilla «Es técnico» sobreviva a un rechazo. **Corregido** dentro
  del caso nuevo de B-2, que la marca, provoca dos rechazos y comprueba que sigue marcada.
- **N-7** · `setTechnicianAction` quedó **sin ningún llamador**: ya existía antes de esta subfase y
  esta no la tocó, pero sí **le quitó su único llamador** al sacar la tarjeta «Técnico» (desvío
  autorizado). No hay riesgo de autorización —exige admin y `repairs`, y la guarda de superficie la
  cubre—, pero es superficie viva justificada por una subfase que todavía no existe. **Borrarla
  tocaría `tests/guards/exposed-surface.test.ts`, que está fuera de la lista cerrada**, así que
  **queda como decisión del usuario**, con la 24.8.2-c o antes.
- **N-8** · El instrumento de AC-7 renombra `supplier_payments` y lo restituye en `finally`; si el
  worker muere entre las dos sentencias, otra batería falla con un error que no se parece al
  defecto. **Riesgo conocido del instrumento**, declarado.
- **N-9** · `Screens.md` §55 conservaba dos rótulos que el código dejó de dibujar en la 29.6 y en
  esta subfase. **Corregido**, que es lo que el punto 7 del alcance pedía.

De las seis notas, la **3** corrigió la frase de los 900 px (arriba) y la **6** apunta a un enlace
roto en `Roadmap.md` (`brief-29.6-las-reparaciones.md`, que no existe; el real es
`brief-29.6-las-reparaciones-de-equipos-de-clientes.md`), **fuera de esta entrega**: se informa y
**no se toca**. Las otras cuatro confirman recuentos, el nombre del índice, los `max-width` y que la
lección del `sr-only` de la 24.8.2 estaba aplicada **en el filtro**, que es exactamente donde
estaba, y no en la tabla, que es donde faltaba.

### Lo que falta para cerrar

1. **AC-18**, la CI sobre el SHA exacto, leída por `headSha`, con «Corre todo: true».
2. **AC-20**, el despliegue con las siete verificaciones del runbook y el recorrido del usuario.
3. La decisión sobre **N-7** (`setTechnicianAction` sin llamador): se borra ahora, tocando la guarda
   de superficie, o se conserva para la 24.8.2-c.
4. La fila de este brief en [README.md](README.md), que hoy termina en «**Pendiente de
   implementar**», y el CHANGELOG, el Roadmap y el HANDOFF. **Los tres últimos están fuera de la
   lista cerrada**: se piden en su turno, como todo lo demás.
5. La **24.8.2-c** («Técnicos», D-1): su tarea en Notion y su fila en el Roadmap, que **todavía no
   existen**.
