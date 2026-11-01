# Brief 24.5.3 — Modelos y grados

- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe.
- **Tipo de tarea**: `implementation` (rediseño de pantallas existentes, con una lectura nueva).
- **Estado**: **aprobado por el usuario el 2026-11-01, con las recomendaciones.** Las dos que estaban abiertas quedaron resueltas: la revisión independiente **se hace** (D-8) y `Screens.md` **gana las tres secciones** (D-7).
- **Contrato**: `task-brief.v1`. Los ids `AC-n` los reutiliza la revisión tal cual.

## Objetivo

Llevar a la forma de la v2 las **cuatro pantallas que ya existen** detrás de las capacidades
`variants` y `serialized_units` —Modelos, la ficha del modelo, Atributos y Grados— y sumar **una
sola lectura nueva**: lo disponible por modelo. Sin migraciones, sin tablas y sin los datos que el
modelo de hoy no tiene.

Lo que esta subfase **no** es: no agrega campos al modelo ni al grado, y no mueve el grado al
producto. Tres de las cuatro láminas dibujan datos que el [ADR 0024](0024-rubros-y-capacidades.md)
decidió no tener o tener en otro lado, y el [Roadmap](../planning/Roadmap.md) ya los dejó fuera de
la Fase 24 por escrito. Esas diferencias se declaran una por una en §Diferencias con la v2, no se
resuelven inventando campos.

## Punto de partida verificado

Medido sobre el árbol en `c4cdf07`, no supuesto.

| # | Hecho | Dónde |
|---|---|---|
| **H-1** | Las cuatro pantallas **existen**: `/modelos` (208 líneas), `/modelos/[modelId]` (313), `/modelos/atributos` (227) y `/grados` (181), más sus `actions`, `forms` y `messages`. 2.576 líneas en total | `src/app/(autenticado)/modelos/`, `.../grados/` |
| **H-2** | `product_models` tiene `name`, `brand` (opcional), `position`, `is_active`. **No tiene descripción ni imagen** | `src/modules/catalog/schema.ts:58` |
| **H-3** | `unit_grades` tiene `name`, `description`, `position`, `is_active`, `is_example`. **No tiene código, color ni garantía** | `src/modules/inventory/schema.ts:125` |
| **H-4** | Modelos y atributos exigen la capacidad `variants`; Grados, `serialized_units`. Sin la capacidad la respuesta es `NOT_FOUND`, como una sección que no existe | `catalog/variants.ts:34`, `inventory/…:29` |
| **H-5** | `listModels` ya devuelve `productCount` —la columna «Variantes» de la lámina—. **No devuelve nada de stock** | `catalog/variants.ts:55` |
| **H-6** | `inventory` importa de `catalog` por su **API pública** y compone en memoria; `catalog` **no** importa `inventory`. La guarda de frontera prohíbe que un módulo importe el `schema` de otro fuera de `analytics` | `inventory/service.ts:321`, `tests/guards/module-boundary.test.ts` |
| **H-7** | `sumByModel` existe, pero **pliega la página cargada del catálogo filtrado**. Para `/modelos` daría un total equivocado: no es la suma de todos los productos del modelo | `inventory/service.ts:189` |
| **H-8** | La pantalla de Modelos tiene **reordenamiento** (`MoveForm` sobre `position`) que **ninguna lámina dibuja** | `modelos/page.tsx:147` y `:184` |
| **H-9** | `Screens.md` llega hasta la pantalla 56 y **no tiene sección para Modelos, Grados ni Atributos**. Están documentadas solo en `brief-29.2` | `docs/product/Screens.md` |
| **H-10** | Los atributos de hoy son **de la organización** (`/modelos/atributos`), no por modelo, como fija el ADR 0024, punto 4 | `catalog/variants.ts` |
| **H-11** | El end-to-end de `/modelos` vive en `tests/e2e/variants.spec.ts` (443 líneas, 9 referencias); `/grados` aparece en `tests/e2e/warranty.spec.ts` (309) | `tests/e2e/` |

### Las láminas

[V2-04 · Modelos](../ui-redesign/v2/13-modelos/README.md) y [V2-04 · Grados](../ui-redesign/v2/14-grados/README.md):

- **03** · listado y alta de modelos;
- **04** · ficha del modelo con sus variantes;
- **05** · configuración de atributos;
- **06** · listado y edición de grados.

## Diferencias con la v2, declaradas antes de implementar

Cada una con su fuente. **Ninguna se resuelve agregando un campo**: la Fase 24 es «sin migraciones,
tablas ni contratos nuevos» ([Roadmap](../planning/Roadmap.md), §Fase 24, Reglas).

| # | Lo que dibuja la v2 | Por qué no se implementa |
|---|---|---|
| **V-1** | La **imagen** del modelo (láminas 03 y 04) | Dato nuevo. El Roadmap lo lista en «Necesitan datos nuevos: la descripción y la imagen del modelo» |
| **V-2** | **«Descripción interna»** del modelo (lámina 03) | Igual que V-1 |
| **V-3** | **Atributos por modelo**: las casillas «Atributos de variante» del alta (03), la tarjeta «Atributos del modelo» (04) y **la lámina 05 entera**, que elige qué valores se usan *en este modelo* | Contradice el **ADR 0024, punto 4**: los atributos definidos y sus valores son **de la organización**. El Roadmap lo lista en «Contradicen el ADR 0024» |
| **V-4** | El **código** del grado (`A`, `B`, `C`) y la insignia de letra en la tabla (06) | Dato nuevo. El Roadmap: «el código y el color del grado» |
| **V-5** | El **color identificador** del grado (06) | Igual que V-4 |
| **V-6** | **«Garantía de referencia»** por grado, con el chip «Política vigente / Sin configurar», y el enlace «Ver políticas de garantía» (06) | Contradice: «la garantía por grado… cuando la garantía se deriva y no se guarda» ([brief-29.9](brief-29.9-la-garantia.md), D-2) |
| **V-7** | La columna **Grado** en las variantes del modelo y el grado dentro del SKU (`IP13-128-MN-A`) (04) | Contradice el **ADR 0024, punto 6**: el grado es **de la unidad**, no del producto. El Roadmap: «el grado en el producto o en el SKU» |
| **V-8** | La pestaña y la tarjeta **«Servicios relacionados»** (04 y 05) | No hay hoy una lectura de reparaciones por modelo, y crearla cruza `catalog` con `service` por una pantalla que el Roadmap no pidió. **Queda fuera y como pendiente P-1** |
| **V-9** | — | **Al revés**: la v2 **no dibuja el reordenamiento** de modelos que existe (H-8). **Se conserva**: la fase rediseña lo que existe, y quitarlo sería una regresión |

> Las dos láminas que más se recortan son la 05 y la 06. Conviene leerlo antes de aprobar: de la
> lámina 06, de sus seis campos quedan tres (nombre, criterio y activo); de la lámina 05 queda su
> **forma visual** aplicada a la pantalla de la organización, no su alcance por modelo.

## Decisiones

- **D-1. La lectura nueva vive en `inventory`, no en `catalog`.** Es la única dirección permitida:
  `inventory` ya importa `catalog` por su API pública y compone en memoria (H-6), y la **I-1** de la
  [24.5.1](brief-24.5.1-productos-catalogo-y-ficha.md) —«un módulo no hace `JOIN` contra tablas
  ajenas fuera de `analytics`, y `catalog` no importa `inventory`»— era, además, una condición de
  detención de aquella subfase. Acá se mantiene igual.
- **D-2. «Disponibles» es la cantidad disponible sumada de las variantes del modelo**, con la misma
  definición que ya usa el catálogo, y se rotula **«disponibles»** y no «unidades disponibles» como
  la lámina 04: un modelo puede agrupar productos por cantidad, donde la unidad no existe. Para los
  productos por unidad los dos números coinciden, porque el saldo de un producto `unit` es igual a
  sus unidades disponibles (`inventory/schema.ts`, nota de `stockUnits`).
- **D-3. No se reutiliza `sumByModel`.** Pliega la página cargada del catálogo filtrado (H-7) y
  daría un total que depende del filtro y de la paginación de **otra** pantalla. La lectura nueva
  suma sobre **todos** los productos del modelo.
- **D-4. La lectura nueva se mide**, porque lee por lote. Lo exige la regla de la fase: «las que
  leen por lote, las mide». La medición va en §Mediciones con el volumen de `seeds/volume.ts`.
- **D-5. Los atributos quedan donde están.** `/modelos/atributos` sigue siendo de la organización
  (H-10) y recibe **la forma visual** de la lámina 05: una tarjeta por atributo, el chip del tipo de
  selección, la lista con casillas, el alta en línea de un valor, el aviso de que un valor en uso no
  se quita y la barra de cambios sin guardar. El botón «Administrar atributos generales» de la
  lámina es, de hecho, el nombre correcto de esta pantalla.
- **D-6. Se agrega el recuento «N variantes lo usan»** por valor de atributo (lámina 05). Es una
  lectura nueva **intramódulo** —`catalog` contando sus propios `attribute_values`—, así que no toca
  la frontera de D-1 y no necesita medición por lote.
- **D-7. `Screens.md` gana tres secciones**: Modelos, Atributos y Grados (H-9). Hoy la fuente de
  verdad de pantallas **miente por omisión**: describe 56 pantallas y el CRM tiene estas tres más
  desde la Fase 29.
- **D-8. Esta subfase lleva revisión independiente.** *Decidido por el usuario el 2026-11-01.* El
  [Roadmap](../planning/Roadmap.md) §Gate de salida dice que las Fases 23 a 25 cierran **con
  autoevaluación declarada, salvo que su brief diga otra cosa**, y este brief dice otra cosa. El
  motivo está medido, no supuesto: las dos subfases anteriores volvieron **R2 y R1 con bloqueantes
  reales**, uno de ellos un cambio de dibujo en seis pantallas ajenas que la autoevaluación no vio.
  La revisión la hace un agente que **no participó** del trabajo, de solo lectura, contra este brief
  y contra las reglas vigentes, y **no otorga ninguna autorización**: informa hallazgos, que se
  verifican contra el código antes de aceptarse.

## Alcance

### Incluido

1. **`/modelos`** (lámina 03): encabezado con su bajada, acciones «Administrar atributos» y «Nuevo
   modelo», buscador por nombre, filtro de estado, y la tabla con **Modelo · Variantes ·
   Disponibles · Estado**, con el estado en ícono **y** texto. El alta y la edición en panel lateral
   con nombre, marca y activo. Se conserva el reordenamiento (V-9).
2. **`/modelos/[modelId]`** (lámina 04): encabezado con nombre, marca y estado; las dos tarjetas de
   resumen —variantes registradas y disponibles—; y la tabla de variantes del modelo con
   **Producto · Disponibles · Precio**, sin la columna Grado (V-7).
3. **`/modelos/atributos`** (lámina 05, con el alcance de D-5): tarjetas por atributo, recuento de
   uso por valor (D-6), alta en línea y el aviso de los valores en uso.
4. **`/grados`** (lámina 06, con el alcance de V-4 a V-6): encabezado con su bajada, «Nuevo grado», y
   la tabla **Grado · Criterio estético · Estado**, con el alta y la edición en panel lateral.
5. **Una lectura nueva**: lo disponible por modelo (D-1 a D-4), con su medición.
6. **Documentación**: las tres secciones de `Screens.md` (D-7), la fila del Roadmap, el CHANGELOG y
   el HANDOFF.

### Excluido

- **Cualquier migración, tabla, columna o contrato nuevo.** Si un criterio los pidiera, se para
  (condición 1).
- Todo lo de V-1 a V-8.
- **La pantalla de productos y la de unidades**: esta subfase no las toca. Si un cambio en un
  componente compartido las alcanzara, se para (condición 3).
- El orden de los grados en la v2 y cualquier cambio de la **lógica** de negocio: no se tocan
  `actions.ts` salvo lo que exija el formulario nuevo.

### Lista cerrada de archivos

Fuera de esta lista no se edita nada. Ampliarla es una decisión del usuario, pedida en el turno.

| # | Archivo | Qué cambia |
|---|---|---|
| 1 | `src/modules/inventory/service.ts` | la lectura nueva (D-1) |
| 2 | `src/modules/inventory/index.ts` | exportarla |
| 3 | `src/modules/inventory/service.test.ts` | sus casos |
| 4 | `src/modules/catalog/variants.ts` | el recuento de uso por valor (D-6) |
| 5 | `src/modules/catalog/variants-repository.ts` | su consulta |
| 6 | `src/modules/catalog/variants.test.ts` | sus casos |
| 7 | `src/app/(autenticado)/modelos/page.tsx` | lámina 03 |
| 8 | `src/app/(autenticado)/modelos/forms.tsx` | el panel de alta y edición |
| 9 | `src/app/(autenticado)/modelos/messages.ts` | los textos |
| 10 | `src/app/(autenticado)/modelos/[modelId]/page.tsx` | lámina 04 |
| 11 | `src/app/(autenticado)/modelos/atributos/page.tsx` | lámina 05 |
| 12 | `src/app/(autenticado)/grados/page.tsx` | lámina 06 |
| 13 | `src/app/(autenticado)/grados/forms.tsx` | el panel |
| 14 | `src/app/(autenticado)/grados/messages.ts` | los textos |
| 15 | `tests/e2e/variants.spec.ts` | modelos, ficha y atributos |
| 16 | `tests/e2e/warranty.spec.ts` | grados (ya navega `/grados`) |
| 17 | `docs/product/Screens.md` | las tres secciones (D-7) |
| 18 | `docs/planning/Roadmap.md` | la fila de la 24.5.3 |
| 19 | `docs/decisions/brief-24.5.3-modelos-y-grados.md` | este brief |
| 20 | `CHANGELOG.md` · `HANDOFF.md` | el cierre |

**Cada archivo nuevo entra al índice con `git add -N` al crearlo.** *Desde el 2026-11-01 las guardas
ven los archivos sin versionar, así que esto ya no decide si las guardas miran; sigue siendo la
costumbre correcta.*

## Criterios de aceptación

| # | Criterio |
|---|---|
| **AC-1** | `/modelos` muestra, por fila, **modelo, marca, cantidad de variantes, disponibles y estado**, con el estado en ícono y texto. Verificado con `getBoundingClientRect`/texto, no a ojo |
| **AC-2** | «Disponibles» de un modelo **es igual** a la suma de lo disponible de sus productos, comprobado contra una organización sembrada con productos por cantidad **y** por unidad, incluido un modelo con **0 disponibles** y un modelo **sin productos** |
| **AC-3** | Un producto **sin modelo** no entra en ningún total por modelo, y los productos inactivos se cuentan con el mismo criterio que usa el catálogo, declarado en el brief al implementar |
| **AC-4** | La ficha del modelo muestra las dos tarjetas de resumen y la tabla de variantes con **Producto, Disponibles y Precio**, y **no** muestra una columna Grado (V-7) |
| **AC-5** | `/modelos/atributos` tiene la forma de la lámina 05 con el alcance de D-5, y cada valor muestra **cuántas variantes lo usan** (D-6), con el caso 0 incluido |
| **AC-6** | Un valor de atributo **en uso** no se puede quitar, y la pantalla lo dice antes de intentarlo |
| **AC-7** | `/grados` muestra **nombre, criterio estético y estado**, con alta y edición en panel, y **sin** código, color ni garantía (V-4 a V-6) |
| **AC-8** | **Las capacidades siguen mandando**: sin `variants`, `/modelos` y `/modelos/atributos` responden `NOT_FOUND`; sin `serialized_units`, `/grados` también. Un `viewer` lee y no escribe |
| **AC-9** | **El reordenamiento de modelos sigue funcionando** (V-9), comprobado moviendo uno y leyendo el orden después |
| **AC-10** | **Sin migraciones**: `npm run db:generate` deja `drizzle/` sin cambios —`git status --porcelain drizzle/` vacío, que es lo que comprueba el paso «Migraciones al día con los esquemas» de la CI— y el recuento sigue en **67** |
| **AC-11** | **La frontera entre módulos se respeta**: `catalog` no importa `inventory`, no hay `JOIN` contra tablas ajenas, y la guarda `module-boundary` pasa (I-1, D-1) |
| **AC-12** | **Desbordamiento cero a 320 px** en las cuatro pantallas y **axe sin violaciones** en claro y en oscuro sobre las cuatro |
| **AC-13** | **Comparación visual** contra las láminas 03 a 06, con **cada diferencia numerada y clasificada** en «resuelta», «declarada» (V-1 a V-9) o «nueva» |
| **AC-14** | **Medición de la lectura nueva** (D-4) en §Mediciones, con el volumen de `seeds/volume.ts`, el tiempo y la cantidad de consultas |
| **AC-15** | **Batería local completa en verde**, y **CI en `success` sobre el SHA exacto que se despliega**. Un `cancelled` no es `success` |
| **AC-16** | `Screens.md` gana las tres secciones (D-7), y la fila del Roadmap queda al día |
| **AC-17** | Recorrido del usuario sobre producción, anotado con su fecha |
| **AC-18** | **Revisión independiente** (D-8): la hace un agente que no participó, de solo lectura; **cada hallazgo se verifica contra el código antes de aceptarse**, los bloqueantes se resuelven y los no bloqueantes se corrigen o se declaran uno por uno, incluidos los que resulten falsos |

## Mediciones requeridas

- **La lectura nueva**, por AC-14: cuántas consultas hace `/modelos`, cuánto tarda y cómo escala con
  la cantidad de productos. Si hace una consulta **por modelo**, es un `N+1` y se corrige antes de
  cerrar.
- **El ancho de las cuatro pantallas** a 390, 640, 1082 y 1440 px, por AC-12, con la convención de
  anchos por contenedor que fijó la [24.5.1-b](brief-24.5.1-b-anchos-por-contenedor.md): un
  componente dentro de una columna no decide su medida por la ventana.

## Riesgos

- **R-1. La lectura nueva carga todos los productos para contar.** Es el costo de no cruzar módulos
  (D-1). Si la medición da mal, la salida **no** es un `JOIN`: es una condición de detención y una
  decisión del usuario.
- **R-2. Las láminas 05 y 06 quedan bastante recortadas** por V-3 a V-6. El resultado se va a
  parecer menos al dibujo que en las subfases anteriores, y eso es correcto, no un defecto.
- **R-3. `warranty.spec.ts` no es el lugar natural de los grados.** Se usa porque ya navega
  `/grados` y tiene la capacidad montada; crear un spec nuevo suma minutos de CI. Si los casos no
  entran con comodidad, se propone `tests/e2e/grades.spec.ts` como ampliación de la lista.

## Condiciones de detención

Se para, se informa con números y se espera decisión del usuario si:

1. **cumplir un criterio exigiera una migración, una tabla, una columna o un contrato nuevo**;
2. **cumplir un criterio exigiera un `JOIN` entre módulos o que `catalog` importe `inventory`**
   (I-1, D-1);
3. **un cambio en un componente compartido alcanzara a una pantalla fuera de esta subfase**. Es
   exactamente lo que pasó en la 24.5.1-b, donde un umbral nuevo cambió seis pantallas ajenas y la
   prueba no lo detectó porque derivaba lo que esperaba de la propia medición;
4. **la medición de la lectura nueva saliera mal** (R-1);
5. **aparece una diferencia con la v2 que no está en V-1 a V-9** y que exige un dato que no existe.

## Nivel de validación objetivo

**Validado en integración** al cerrar, contra el build de producción con PostgreSQL real. Sube a
**validado en staging** con el recorrido del usuario (AC-17). Ningún nivel se infiere del anterior.

## Pendientes que esta subfase deja abiertos

- **P-1.** «Servicios relacionados» del modelo (V-8): necesita una lectura de reparaciones por
  modelo y una decisión sobre la frontera `catalog`↔`service`.
- **P-2.** El código, el color y la garantía del grado, y la imagen y la descripción del modelo:
  datos nuevos, fuera de la Fase 24 por el Roadmap.
- **P-3.** Los heredados que siguen abiertos y son ajenos a esta subfase: el `.gitattributes` que
  falta, `/ventas/[saleId]` con 13 px de desbordamiento a 390 px, «Guardar imagen» a 40 px, la
  lámina 02 sin subfase y el margen en el catálogo de métricas.
