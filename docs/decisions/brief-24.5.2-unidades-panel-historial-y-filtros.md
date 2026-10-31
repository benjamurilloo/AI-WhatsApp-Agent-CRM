# Brief 24.5.2 — Unidades: panel, historial y filtros

- **Esquema**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Fase**: 24 — Pantallas rediseñadas con lo que ya existe ([Roadmap](../planning/Roadmap.md) §Fases 23 a 28)
- **Subfase**: 24.5.2 (Notion `407702be6f4e8150bd75d63a504414f0`), que absorbe la tarea «Mostrar el motivo de la baja de una unidad en revisión» (`400702be6f4e8130beffea0fa99a9306`)
- **Láminas de la v2**: 10 (unidades, IMEI y detalle individual), 14 (unidad en móvil) y 15 (estados de inventario), del lote [V2-05](../ui-redesign/v2/05-productos/README-v2-05.md)
- **Nivel de evidencia pedido**: `producer-consumer` (validado en integración)
- **Estado**: **aprobado el 2026-10-31 por el usuario, con las recomendaciones de D-1, P-1 y P-2** («apruebo el brief con las recomendaciones»). Es decir: la subfase se parte y el costo por unidad pasa a 24.5.2-b (D-1); el enmascarado del IMEI queda fuera y se trata aparte (P-1); el valor de inventario es por producto y va en 24.5.2-b (P-2).

## Objetivo

Dar a la pantalla de Unidades la forma de la lámina 10: una lista que se puede filtrar por estado y buscar por IMEI, y un **panel de la unidad con Detalle e Historial**, donde por fin se vea **el motivo de la baja de una unidad en revisión**, que hoy existe solo en la auditoría y ninguna pantalla lee. Separar `in_repair` de `in_review`, y convertir los tres contadores del Resumen en enlaces a la lista filtrada, que es la primera diferencia que la 24.5.1 declaró y dejó pendiente.

Sin migraciones, sin tablas y sin contratos nuevos. Lecturas nuevas en `inventory`, declaradas y medidas.

## Situación

La 24.5.1 cerró el 2026-10-31, desplegada en `7311823` y recorrida ([brief-24.5.1](brief-24.5.1-productos-catalogo-y-ficha.md) §Cierre). Dejó explícitamente para acá cuatro cosas: el filtro por estado de la lista de unidades, separar `in_repair` de `in_review`, el costo y el margen, y **la medición del camino del catálogo agrupado** que su §Riesgos prometía y no se hizo.

La pantalla de Unidades de hoy es una sola página larga, con secciones fijas: «Cómo se lleva el stock», los formularios de baja, reparación, garantía y corrección, «Unidades disponibles» (una tabla con la columna Costo solo para un `admin`), «Cargar unidad», «En reparación y en revisión», «Reparaciones anteriores», «Reservadas y vendidas» y «Dadas de baja». No hay filtro, no hay búsqueda, no hay panel por unidad, y seleccionar una fila no abre nada.

## Hallazgos antes de diseñar

Verificados contra el código y la documentación, no supuestos.

- **H-1 — La pantalla de Costos ya existe, y no es la de la lámina 13.** `/productos/[id]/costos` existe desde la 18.2 ([brief-18.2](brief-18.2-costo-y-margen.md), FR-PROD-19 a FR-PROD-21) y muestra el **costo del producto** (`product_costs`, de `catalog`) con su margen contra el precio vigente. La lámina 13 pide algo distinto: el **costo por unidad** (`stock_units.cost`, de `inventory`), con la base del margen limitada a las disponibles, el promedio, los porcentajes individuales y una tarjeta aparte para reservada y en revisión. Son dos cosas en la misma pantalla, y la segunda es un trabajo propio. Ver D-1.
- **H-2 — Las cinco pestañas de la v2 son exactamente las cinco rutas que ya existen.** `product-sub-nav.tsx` arma Resumen, Unidades (con `serialized_units`), Movimientos, Precios y Costos (solo `admin`), y la jerarquía de la lámina nombra esas cinco. **No hace falta ninguna ruta nueva** para la barra de pestañas.
- **H-3 — La baja de una unidad escribe el motivo en dos lugares distintos según de dónde venga.** En `src/modules/inventory/units.ts`: desde `available`, escribe un movimiento de stock `adjustment_negative` **con el motivo** y además una entrada de auditoría; desde `in_review`, **solo la entrada de auditoría**, porque una unidad en revisión ya está fuera del saldo y su baja no es un movimiento (U-2 de la [29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md)). El motivo vive en `diff.after.reason` de una entrada `status_change` sobre `stock_unit`.
- **H-4 — Leer esa auditoría no agrega ninguna dependencia.** `inventory` ya depende de `audit` ([Overview](../architecture/Overview.md), fila de `inventory`), y `audit` expone `listEntityAuditLogs` y `nameAuditActors`. La regla del Overview es que **la lectura de `audit` no autoriza ni compone nombres: eso lo hace el módulo dueño de la entidad**, para no invertir la dependencia (D-1 del [brief-4.4](brief-4.4-ui-de-productos-e-inventario.md)). `catalog` ya hace exactamente esto con el historial de auditoría del producto, así que hay un precedente a copiar.
- **H-5 — No existe ninguna lectura de movimientos por unidad.** `MovementHistoryFilters` tiene `type`, `from`, `to` y `page`, y nada más. El historial de una unidad necesita una lectura nueva.
- **H-6 — `listProductUnits` trae todas las unidades de un producto sin `LIMIT`.** Es el mismo hallazgo H-2 de la 24.5.1, que entonces no se tocó porque la subfase no cambiaba esa lista. Ahora sí la cambia: **agregarle un filtro y una búsqueda sin poner un tope empeora el camino en vez de mejorarlo**, porque invita a usarla con más unidades. Ver D-8.
- **H-7 — El panel ya tiene su lectura.** `getUnit(context, unitId)` existe y devuelve la unidad con su `productId`, para los dos roles. No hace falta inventar una.
- **H-8 — El IMEI se muestra entero hoy, a los dos roles, y no hay ningún enmascarado de series en el código.** El único enmascarado del proyecto es el del teléfono de un cliente, en `crm`. La lámina pide el IMEI enmascarado con un «Mostrar» que revela «solo con permiso», y el proyecto tiene dos roles, no permisos por campo. Es una decisión pendiente, no algo que este brief resuelva: ver «Decisiones pendientes».
- **H-9 — La búsqueda global por IMEI exige el IMEI completo y bien formado.** `findUnitsBySerial` (en `warranties.ts`) descarta cualquier texto que no case entero con `UNIT_SERIAL_PATTERN` y después busca por igualdad. Para la búsqueda global está bien; **para la lista sería casi inútil**, porque habría que tipear el IMEI entero. La lámina usa sufijos de cuatro dígitos en su propio ejemplo. Ver D-7.
- **H-10 — `in_repair` e `in_review` comparten una sección.** «En reparación y en revisión» los muestra juntos, y la lámina 10 los quiere separados, con el pendiente y el acceso al checklist en la que está en revisión.
- **H-11 — «Dadas de baja» no muestra ningún motivo**, y su párrafo explicativo dice literalmente que el de una unidad disponible está en los movimientos y el de una en revisión no es un movimiento. Es el texto que la tarea de Notion citó como el síntoma.

## Decisiones

### D-1 — El costo por unidad y el margen salen de esta subfase

**Esta subfase toma la mitad de las unidades. El costo por unidad y el margen estimado de la lámina 13 pasan a una subfase propia, 24.5.2-b.**

El motivo es el tamaño, medido contra lo que ya pasó: la 24.5.1 tenía un alcance comparable al de la mitad de unidades sola —catálogo agrupado, barra de pestañas, contadores y dos pantallas alineadas— y volvió **R2** de la revisión independiente, con tres bloqueantes. Sumarle acá el costo por unidad, con su superficie de permisos (FR-PROD-21), su regla de «costo desconocido no se sustituye por cero» y su base de cálculo limitada a las disponibles, da un alcance mayor que el de una subfase que ya fue difícil de cerrar.

**`24.5.2-b` y no `24.5.3`**, para que «24.5.3 — Modelos y grados» conserve su número y su tarea de Notion. El precedente del proyecto es `13.5.2-b`.

La alternativa —hacer las dos mitades juntas— quedó registrada y era del usuario. **Eligió partir, el 2026-10-31**, así que este brief no cubre la lámina 13 y 24.5.2-b necesita su propio brief antes de tocar código.

### D-2 — El panel de la unidad va por parámetro de la URL, no por una ruta nueva

El panel se abre con `?unidad=<id>` sobre la misma pantalla de Unidades. Razones, en orden:

1. **Es el patrón que la pantalla ya usa**: `?baja=<id>`, `?corregir=<id>` y `?garantia=<id>` ya abren sus formularios así.
2. **Funciona sin JavaScript**, como todo lo de la Fase 24.
3. **Conserva los filtros y la búsqueda en la misma URL**, así que cerrar el panel vuelve exactamente a la lista que se estaba mirando, sin el problema de `?desde=` que la 24.5.1 declaró.

En el teléfono el panel se dibuja **arriba de la lista**, en la misma página, y no como la página aparte de la lámina 14. Es una diferencia declarada: una ruta `/unidades/[unitId]` sería una sexta ruta de producto, y la variante (a) de D-1 de la 24.5.1 fijó que las rutas no se mueven en esta parte de la fase.

Las dos pestañas de la lámina 14, **Detalle e Historial**, sí se implementan, también por la URL (`?unidad=<id>&vista=historial`), con el mismo `SubNav` del proyecto.

### D-3 — El historial de la unidad se compone de dos fuentes, en memoria

El Historial del panel une:

- **los movimientos de stock de esa unidad** (`inventory`, lectura nueva, con tope — ver D-8);
- **las entradas de auditoría de `stock_unit`** de esa unidad, leídas **a través de `inventory`**, que autoriza y compone el nombre del autor con `getMemberSummaries` de `organizations`, como manda el Overview y como ya hace `catalog` con el producto (H-4).

Se unen y se ordenan en memoria, **de más nuevo a más viejo**, sin `JOIN`. La lámina recomienda ese orden por defecto, y es el que la pantalla de Movimientos ya usa.

**Una reserva y un pase a revisión no se dibujan como una entrada o salida física.** La lámina lo pide explícitamente y el modelo lo respalda: no hay movimiento detrás. Cada fila dice de qué tipo de evento viene.

### D-4 — El motivo de la baja se muestra por los dos caminos, y cada uno tiene su prueba

- Una unidad dada de baja **desde `available`**: el motivo sale del movimiento, que ya lo tiene.
- Una unidad dada de baja **desde `in_review`**: el motivo sale de la auditoría, de `diff.after.reason`.

Se muestra en el Historial del panel **y** en la sección «Dadas de baja», que hoy no muestra ninguno. El párrafo explicativo de H-11, que hoy dice que el motivo está en otra parte, se reemplaza.

**Los dos caminos llevan una prueba cada uno**, con la unidad recorrida de verdad hasta el estado que corresponde (`available → in_repair → in_review → baja` para el segundo), porque el trigger `stock_units_guard` no admite atajos. Es exactamente el error que la [nota del vault](#fuentes-de-verdad) sobre la señal de la aserción pide evitar: la prueba del camino de la auditoría tiene que fallar si se borra la lectura de la auditoría, y eso se demuestra.

### D-5 — El filtro por estado va en la URL, y los contadores del Resumen son sus enlaces

`?estado=<estado>` sobre la lista de unidades, con «Todas» como ausencia del parámetro. Los tres contadores del Resumen (disponibles, reservadas, en revisión) pasan a ser **enlaces** a `/productos/<id>/unidades?estado=…`, que es la primera diferencia declarada de la 24.5.1 y la razón por la que se declaró: la pantalla de destino no tenía el filtro.

El Resumen **no suma un total** y eso no cambia: convertir los contadores en enlaces no toca D-6 de la 24.5.1.

### D-6 — `in_repair` e `in_review` se separan

Dos secciones y dos valores de filtro distintos, con sus etiquetas de la v2: «En reparación» y «En revisión». La de en revisión muestra el pendiente y el acceso a su checklist, como pide la lámina. El saldo sigue contando **solo** disponibles y reservadas, y el texto del Resumen que lo explica no cambia.

### D-7 — La búsqueda de la lista es por sufijo del IMEI, de cuatro caracteres como mínimo

La búsqueda global se deja como está: exige el IMEI entero (H-9), y cambiarla está fuera de alcance. En la lista, buscar por sufijo de al menos cuatro caracteres, que es como la propia lámina identifica sus unidades de ejemplo («sufijo 1421»).

El mínimo de cuatro no es decorativo: **impide enumerar identificadores tipeando un dígito**. Con menos de cuatro caracteres la lista no filtra y lo dice, en lugar de devolver todo. La búsqueda no revela nada que la lista no mostrara ya a ese rol.

Que esto cree una segunda regla de «buscar por IMEI», distinta de la global, queda **declarado** en el cierre.

### D-8 — La lista de unidades se pagina, con su total

Por H-6. `listProductUnits` pasa a traer una página con su total real, con el tamaño de página de las otras listas del proyecto, y el filtro y la búsqueda se aplican **en SQL**, no en memoria: filtrar en memoria sobre una lectura sin tope sería mover el problema, no resolverlo.

Es un cambio de contrato de una lectura existente con varios consumidores. **Antes de tocarla se enumeran todos sus llamadores** y, si alguno queda afuera del alcance de esta subfase, se para y se pregunta (ver «Condiciones de detención»).

### D-9 — Las dos mediciones

1. **La diferida de la 24.5.1**: el camino completo del catálogo agrupado, con el conjunto más grande disponible. La autorización para tocar `scripts/medir-caminos.ts` ya está registrada (decisión del usuario del 2026-10-31).
2. **La nueva**: el camino de la lista de unidades con filtro y búsqueda, en el peor caso disponible.

Las dos con **el umbral fijado por escrito antes de medir**, y el número anotado en el cierre. Si una no se puede medir, se dice que no se midió: no se infiere de la otra.

## Alcance incluido

- Panel de la unidad con Detalle e Historial, por la URL (D-2, D-3).
- El motivo de la baja, por los dos caminos, en el panel y en «Dadas de baja» (D-4).
- Filtro por estado y contadores del Resumen como enlaces (D-5).
- `in_repair` separado de `in_review` (D-6).
- Búsqueda por sufijo de IMEI en la lista (D-7).
- Paginación de la lista con su total (D-8).
- Las dos mediciones (D-9).
- Reflujo a 320 px, objetivos táctiles de 44 px y `axe` sin violaciones en claro y en oscuro, en la lista y en el panel.

## Archivos autorizados

Lista **cerrada**. Salirse de ella **se para y se pregunta, sin excepción por tamaño ni por evidencia de que el cambio esté confinado** — es la regla que la 24.5.1 escribió después de romperla ([brief-24.5.1](brief-24.5.1-productos-catalogo-y-ficha.md) §Archivos autorizados).

| Archivo | Para qué |
|---|---|
| `src/app/(autenticado)/productos/[productId]/unidades/page.tsx` | La lista, el filtro, la búsqueda, las secciones separadas y el panel |
| `src/app/(autenticado)/productos/[productId]/unidades/messages.ts` | Etiquetas y textos nuevos |
| `src/app/(autenticado)/productos/[productId]/unidades/unit-panel.tsx` | **Nuevo.** El panel con sus dos pestañas |
| `src/app/(autenticado)/productos/[productId]/unidades/unit-history.ts` | **Nuevo.** La composición de las dos fuentes, con la lectura inyectada |
| `src/app/(autenticado)/productos/[productId]/unidades/unit-history.test.ts` | **Nuevo.** Sus pruebas, incluida la del fallo forzado |
| `src/app/(autenticado)/productos/[productId]/unidades/filters.ts` | **Nuevo.** Los filtros de la URL de esta pantalla |
| `src/app/(autenticado)/productos/[productId]/unit-counters-panel.tsx` | Los contadores como enlaces |
| `src/app/(autenticado)/productos/[productId]/page.tsx` | Pasarle al panel los destinos de los enlaces |
| `src/modules/inventory/units.ts` | Las lecturas nuevas y el cambio de `listProductUnits` |
| `src/modules/inventory/unit-repository.ts` | Sus consultas, con el filtro por organización en SQL |
| `src/modules/inventory/index.ts` | Lo que se exporta |
| `src/modules/inventory/units.test.ts` | Pruebas del módulo |
| `tests/integration/organization-isolation.test.ts` | El filtro por organización de cada lectura nueva, donde es observable |
| `tests/e2e/units.spec.ts` | Los recorridos |
| `scripts/medir-caminos.ts` | Las dos mediciones (autorización del 2026-10-31) |
| `docs/architecture/Overview.md` | La fila de `inventory`, por las lecturas nuevas |
| `docs/product/Screens.md` | La pantalla de Unidades |
| `docs/decisions/brief-24.5.2-unidades-panel-historial-y-filtros.md` | Este documento y su cierre |
| `CHANGELOG.md`, `HANDOFF.md` | El cierre |

## Alcance excluido

- **El costo por unidad, el margen estimado y el valor de inventario por producto** (lámina 13): pasan a 24.5.2-b por D-1 y P-2.
- **El valor de inventario de toda la organización**: no es de 24.5.2-b tampoco; si se quiere, va a su propia subfase con su medición (P-2).
- **El enmascarado del IMEI** y su «Mostrar»: fuera por P-1, y protegido por la condición de detención 6.
- **La búsqueda global**: su regla de IMEI entero no se toca (H-9).
- **Modelos, grados y atributos por modelo**: 24.5.3.
- **El formulario de alta y edición de producto** (lámina 02): sigue sin subfase asignada; es una decisión del usuario, no un hueco que esta subfase llene.
- **La edición de la unidad con sus grupos persistentes** y los casos de varios IMEI: la propia lámina dice que no tienen imagen en este lote.
- **Recibir unidades**: conduce al flujo de recepción que ya existe; no se abre ninguna entrada genérica.
- **Selección múltiple de unidades**: la lámina dibuja una casilla y advierte que no debe implicar una operación masiva sin barra de acciones y alcance explícito. Sin esa barra, no se dibuja la casilla.
- **La posición del scroll** al cerrar el panel.
- **Cualquier migración, tabla, columna o contrato nuevo.**

## Decisiones resueltas al aprobar

Las dos entraron al brief como pendientes y **el usuario las resolvió el 2026-10-31 aceptando la recomendación de cada una**. Se conserva el planteo completo, porque el motivo de la decisión importa más que la decisión.

**P-1 — El enmascarado del IMEI. Resuelto: queda fuera de esta subfase y se trata aparte.** Hoy el IMEI se muestra entero a los dos roles y no existe ningún enmascarado de series (H-8). La lámina lo quiere enmascarado con un «Mostrar» que revela «solo con permiso». Hay tres cosas que decidir y ninguna la decide este brief:

1. si el IMEI pasa a estar enmascarado para los dos roles, solo para un `viewer`, o se deja como está;
2. qué significa «con permiso» en un proyecto con dos roles y sin permisos por campo;
3. cómo se revela sin JavaScript: un parámetro de la URL pondría el identificador completo en la barra de direcciones y en los logs del proxy, y la regla del proyecto es no poner datos sensibles en la cadena de consulta.

**Recomendación, aprobada**: dejarlo como está en esta subfase y declararlo como diferencia, y tratarlo aparte —probablemente con un ADR, porque toca el modelo de seguridad— en lugar de resolverlo de paso. Que el IMEI sea visible a un `viewer` es la conducta vigente desde la 29.5 y nadie la objetó; cambiarla sin decidir el punto 2 produciría un «Mostrar» que no restringe nada.

**Consecuencia operativa**: la condición de detención 6 sigue en pie y es la que protege esta decisión. Si al implementar el enmascarado aparece como necesario para cumplir un criterio, **se para**: no se decide implementando. Queda además como tarea aparte, sin subfase asignada, para que el usuario decida cuándo.

**P-2 — El alcance del «valor de inventario». Resuelto: por producto, en 24.5.2-b.** El Roadmap lo pide en esta subfase como «la suma de los costos registrados, sin método de valuación». No dice si es **por producto** —en su pantalla de Costos— o **de toda la organización**, que sería una lectura nueva sobre todos los productos y una pantalla de Finanzas. **Recomendación, aprobada**: por producto, en 24.5.2-b junto al resto del costo. Si después se quiere el total de la organización, va a su propia subfase **con su medición**, porque una suma sobre todos los productos es exactamente el tipo de lectura que el Roadmap obliga a medir.

## Fuentes de verdad

1. El código y las migraciones versionadas. En particular `src/modules/inventory/units.ts`, `unit-repository.ts` y `warranties.ts`.
2. [DataModel.md](../architecture/DataModel.md) (`stock_units`, `inventory_movements`, `audit_logs`) y [Overview.md](../architecture/Overview.md) (las filas de `inventory` y `audit`, y las reglas de frontera de las líneas 9 y 52).
3. [brief-24.5.1](brief-24.5.1-productos-catalogo-y-ficha.md) §Cierre (lo que dejó pendiente y las reglas que escribió), [brief-29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md) (U-2), [brief-29.5](brief-29.5-las-unidades.md) (las unidades), [brief-18.2](brief-18.2-costo-y-margen.md) (la pantalla de Costos que ya existe) y [Roadmap](../planning/Roadmap.md) §Fase 24.
4. Notion, solo para el estado de la subfase.
5. La v2: [README-v2-05](../ui-redesign/v2/05-productos/README-v2-05.md) y las láminas 10, 14 y 15.

Del vault, dos notas que esta subfase tiene que tener a la vista porque describen defectos que la 24.5.1 cometió en este mismo código: `A Test for a Later Rule in an Ordered Chain Can Pass on an Earlier Rule` (la señal de la aserción puede venir de otra capa) y `An Announced Error State Is Dead Code When the Real Error Throws Instead of Returning a Failure`.

## Dependencias

`inventory` → `catalog`, `organizations`, `audit`, `auth`. **Ninguna cambia.** No se agrega ninguna dependencia nueva, y `catalog` sigue sin conocer `inventory`.

## Invariantes

- **I-1** — Ningún `JOIN` contra tablas de otro módulo fuera de `analytics`. El historial de la unidad se compone en memoria.
- **I-2** — Un dato que no se pudo leer se anuncia, nunca se dibuja como cero ni como vacío. Si la auditoría no se pudo leer, el Historial lo dice y **no** se presenta como «sin eventos». El `catch` va en la capa de composición, con la lectura inyectada para poder forzar el fallo sin mocks, como quedó en la 24.5.1.
- **I-3** — El saldo cuenta disponibles y reservadas. Separar `in_repair` de `in_review` no cambia ningún total.
- **I-4** — El costo de una unidad no lo ve un `viewer` (FR-PROD-21), y ningún total nuevo de esta pantalla le permite deducirlo.
- **I-5** — Una reserva o un pase a revisión no se dibujan como un movimiento físico.
- **I-6** — Toda lectura nueva filtra por organización **en SQL**, y eso se prueba donde es observable: llamando al repositorio, no al servicio.
- **I-7** — Sin JavaScript: filtro, búsqueda, paginación, panel y sus dos pestañas funcionan con enlaces y formularios `GET`.
- **I-8** — Ningún identificador completo aparece en un mensaje de error.

## Criterios de aceptación

| Id | Criterio |
|---|---|
| **AC-1** | La lista de unidades se filtra por estado con `?estado=`, con «Todas» como ausencia del parámetro, y los seis estados tienen su valor. Probado con JavaScript deshabilitado. |
| **AC-2** | Los tres contadores del Resumen son enlaces a la lista filtrada por su estado, y llegan a una lista efectivamente filtrada. El Resumen sigue sin un total que los sume. |
| **AC-3** | La lista se busca por sufijo de IMEI de cuatro caracteres o más. Con menos de cuatro no filtra y lo dice; con un sufijo que no casa, el resultado vacío **conserva los filtros** y ofrece restablecerlos. |
| **AC-4** | La lista está paginada, con su total real, y el filtro y la búsqueda se aplican en SQL. Enumerados y revisados todos los llamadores de `listProductUnits`. |
| **AC-5** | `?unidad=<id>` abre el panel de la unidad con Detalle, y `&vista=historial` lo abre en Historial. Las dos pestañas tienen `aria-current` y se recorren por teclado. Cerrar el panel vuelve a la lista con sus filtros intactos. |
| **AC-6** | El Historial une los movimientos de la unidad y sus entradas de auditoría, de más nuevo a más viejo, y **cada fila dice de qué tipo de evento viene**. Una reserva y un pase a revisión no aparecen como entrada ni salida física. |
| **AC-7** | El motivo de la baja se muestra para una unidad dada de baja **desde `available`** (desde el movimiento) y para una **desde `in_review`** (desde la auditoría), en el panel y en «Dadas de baja». **Una prueba por camino**, con la unidad recorrida de verdad hasta su estado. |
| **AC-8** | Borrar la lectura de la auditoría hace fallar la prueba del segundo camino, y solo esa. Demostrado en los dos sentidos. |
| **AC-9** | «En reparación» y «En revisión» son dos secciones con dos valores de filtro distintos. La de en revisión muestra el pendiente y el acceso a su checklist. Ningún total cambia. |
| **AC-10** | Si la lectura de la auditoría falla, el Historial lo anuncia y no dice «sin eventos». Probado con la lectura forzada a fallar, **sin mockear el módulo**, y comprobado que sin el `catch` la prueba falla. |
| **AC-11** | Cada lectura nueva filtra por organización en SQL, probado llamando al **repositorio** con una organización ajena, con un control positivo, en `tests/integration/organization-isolation.test.ts`. Borrar el filtro hace fallar solo la prueba nueva. |
| **AC-12** | Un `viewer` ve la lista, el panel y el historial **sin el costo**, comprobado sobre lo que llega al navegador, y ningún total le permite deducirlo. |
| **AC-13** | Reflujo a 320 px con desbordamiento cero en la lista y en el panel; objetivos táctiles de 44 px **medidos**, no inferidos de clases; `axe` sin violaciones en claro y en oscuro. |
| **AC-14** | Las dos mediciones de D-9 hechas, con su umbral escrito **antes** de medir y el número anotado en el cierre. Si una no se pudo hacer, se declara. |
| **AC-15** | Comparación visual contra las láminas 10, 14 y 15, con **cada diferencia declarada una por una** y su motivo. |
| **AC-16** | Revisión de un agente que **no participó**, de solo lectura, contra este brief y contra las reglas vigentes, antes del cierre. Sus hallazgos se verifican contra el código antes de aceptarse. |
| **AC-17** | La batería entera verde **en la CI sobre el SHA que se despliega**, y ese SHA es el que se despliega. |
| **AC-18** | Desplegada en producción y recorrida por el usuario. |

## Pruebas y evidencia requerida

- **Unitarias**: la composición del historial con la lectura inyectada (el caso feliz, el que lanza, el `Failure`, y el que recorre todos los resultados comprobando que ninguno es «sin eventos»); los filtros de la URL; la regla del sufijo de cuatro caracteres.
- **Integración contra PostgreSQL real**: las lecturas nuevas, el filtro por organización de cada una, y las dos bajas recorridas de verdad por la máquina de estados.
- **End-to-end**: el filtro, la búsqueda, la paginación, el panel con sus dos pestañas, los dos motivos de baja, el enlace desde cada contador del Resumen, el caso de un `viewer`, y las mediciones de 44 px escritas **como aserciones**, para que un fallo informe el número real.
- **Mutaciones exigidas**: quitar el `catch` (AC-10), borrar el filtro por organización (AC-11) y borrar la lectura de la auditoría (AC-8). Las tres tienen que hacer fallar una prueba, y se comprueba cuál.
- Los mocks y los fixtures con forma asumida se declaran como tales y **no cuentan como evidencia de integración**.

## Condiciones de detención

Se para y se pregunta, sin implementar, cuando:

1. **Un archivo quedaría fuera de la lista cerrada de «Archivos autorizados»** — sin excepción por tamaño ni por confinamiento.
2. **Un llamador de `listProductUnits` quedaría afectado y está fuera del alcance** (D-8).
3. Haría falta **una migración, una tabla, una columna o un contrato nuevo**.
4. Haría falta **una dependencia nueva entre módulos**, o un `JOIN` contra tablas ajenas.
5. Haría falta **un requisito funcional nuevo** (`FunctionalRequirements.md`) o cambiar el modelo de seguridad — en particular, cualquier cosa que se parezca a resolver P-1 de paso.
6. **El enmascarado del IMEI** aparece como necesario para cumplir un criterio: es P-1, y no se decide implementando.
7. Una de las dos mediciones **no se puede hacer**: se declara, no se infiere de la otra ni se da por hecha. Es exactamente el compromiso que la 24.5.1 incumplió.
8. Aparece una **contradicción entre dos fuentes de verdad**: se documenta citando las dos antes de decidir.

## Riesgos

- **R-1 — El cambio de contrato de `listProductUnits`** (D-8) es el riesgo real de esta subfase: es una lectura con varios consumidores y un tope nuevo puede recortarle filas a una pantalla que hoy las recibe todas. Mitigación: enumerar los llamadores **antes** de tocarla (AC-4) y la condición de detención 2.
- **R-2 — El historial de dos fuentes puede mentir sobre su completitud.** Si cada fuente tiene su tope y se unen, el resultado puede parecer completo y no serlo. Mitigación: el panel dice el tope y cuántos eventos trajo, como la tabla de Operaciones de la 24.4.3.
- **R-3 — La medición diferida se vuelve a diferir.** Ya pasó una vez. Mitigación: AC-14 la pone como criterio y la condición de detención 7 obliga a declararla si no se pudo.

## Situación en la fase

- **Necesario ahora**: el panel, el historial, el motivo de la baja, el filtro y la separación de estados. Cierran la primera diferencia declarada de la 24.5.1 y la tarea que viene arrastrándose desde la 29.6.2.
- **Requisito antes de producción**: las dos mediciones y la revisión independiente.
- **Mejora posterior**: el enmascarado del IMEI (P-1), el valor de inventario de toda la organización (P-2), la edición de la unidad con varios IMEI y la selección múltiple con su barra de acciones.

Después de esta subfase y de 24.5.2-b viene **24.5.3 — Modelos y grados**, que conserva su número y su tarea de Notion.
