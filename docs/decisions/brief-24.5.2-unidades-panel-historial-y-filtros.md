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
- **H-12 — La auditoría está reservada a `admin` por el modelo de seguridad, y los movimientos no.** *Agregado el 2026-10-31, después de aprobar el brief y antes de escribir código.* [SecurityModel.md](../architecture/SecurityModel.md) dice: «Lectura permitida a ambos roles dentro de su organización, **salvo lo que un caso de uso reserva a `admin`**: la auditoría, los datos de contacto completos del cliente y, desde la 18.2, el costo y el margen». El código lo confirma: `catalog.listProductAudit` empieza con `authorize(context, { role: "admin" })`, mientras que `inventory.listStockMovements` dice explícitamente «Lectura para admin y viewer». **Esto contradecía el AC-12 de este brief**, que daba el historial entero a un `viewer`. Se resolvió con D-10.
- **H-13 — Paginar `listProductUnits` toca tres archivos de prueba que no estaban en la lista cerrada.** *Agregado el 2026-10-31, al enumerar los llamadores como pide AC-4 y antes de tocar nada.* Hay **un solo llamador de producción**, la página de Unidades. Los otros son de prueba: `tests/integration/units.test.ts` (cuatro sitios), `units-orders-sales.test.ts` y `service-own-units.test.ts`, los tres **no autorizados** entonces. **Se paró y se preguntó**, como manda la condición de detención 1; ver la nota de «Archivos autorizados».

*Corregido dos veces el 2026-10-31, por el hallazgo N-4 de la revisión independiente.* Esta enumeración tenía dos errores, y los dos importan porque AC-4 pide precisamente enumerar bien:

1. Decía que el cuarto llamador era **`src/modules/inventory/units.test.ts`**, el del módulo. **No lo es ni lo fue**: ese archivo solo importa `parseUnitSerial`, `splitUnitSerials` y `validateUnitInput`, y no está modificado. El llamador es el homónimo de `tests/integration/`, que ya estaba en la lista de los tres.
2. Decía que uno de los tres «compara el resultado entero con `toEqual`, así que el cambio de forma los rompe con certeza». **Era inexacto**: ese `toEqual` está sobre la rama de fallo (`{ ok: false, code: "NOT_FOUND" }`), que no cambió de forma. Lo que los rompía era el parámetro nuevo, un error de compilación, no una aserción. La autorización seguía siendo necesaria; el motivo estaba dicho más fuerte de lo que era.

Y **apareció un llamador más después**: `scripts/medir-caminos.ts`, al agregarle los caminos de D-9. Está en la lista desde el principio, así que no hubo que pedir nada, pero la enumeración de AC-4 queda completa solo contándolo.
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

**Los dos caminos llevan una prueba cada uno**, con la unidad recorrida de verdad hasta el estado que corresponde (`available → in_repair → in_review → baja` para el segundo), porque el trigger `stock_units_guard` no admite atajos.

*Precisado el 2026-10-31, al verlo en el recorrido*: en la baja de una unidad **disponible**, el motivo aparece **dos veces** en el historial, y es correcto: la baja escribe los dos registros —el movimiento de stock y la entrada de auditoría— porque son dos eventos distintos, el efecto sobre el saldo y el cambio de estado. Cada fila lleva su tipo, así que se distinguen. Queda declarado para que se mire en el recorrido: si resulta ruidoso, la decisión es de presentación y no cambia nada de lo que se escribe. En la baja **desde `in_review`** aparece una sola vez, porque no hay movimiento, y a un `viewer` también una sola, porque no ve la auditoría. Es exactamente el error que la [nota del vault](#fuentes-de-verdad) sobre la señal de la aserción pide evitar: la prueba del camino de la auditoría tiene que fallar si se borra la lectura de la auditoría, y eso se demuestra.

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

### D-10 — El historial respeta la frontera de roles que ya existe, y no la mueve

*Agregada el 2026-10-31, por decisión del usuario, al encontrar H-12 antes de escribir código.*

El historial de la unidad tiene dos fuentes y **cada una cae de un lado distinto de la línea que el modelo de seguridad ya trazó**:

| Fuente | Quién la ve | Por qué |
|---|---|---|
| Los movimientos de stock de la unidad | **los dos roles** | `listStockMovements` es «para admin y viewer» desde siempre |
| Las entradas de auditoría de `stock_unit` | **solo `admin`** | SecurityModel reserva la auditoría a `admin` (H-12) |

Así que la lectura nueva de la auditoría de una unidad **empieza con `authorize(context, { role: "admin" })`**, igual que `catalog.listProductAudit`. A un `viewer` el panel le muestra su mitad —los movimientos— y una línea que dice que los cambios de estado los ve un `admin`: **no se le dibuja un historial incompleto como si fuera completo**, que sería la misma falta que I-2 prohíbe para un dato que no se pudo leer.

**La consecuencia, declarada y aceptada**: el motivo de una baja **desde `available`** lo ven los dos roles, porque vive en el movimiento; el de una baja **desde `in_review`** lo ve solo un `admin`, porque vive solo en la auditoría. La asimetría no es un invento de esta subfase: es dónde quedó cada dato en la 29.6.2, y el modelo de seguridad decide quién lee cada lugar.

**Lo que esto cierra**: la tarea de Notion preguntaba «qué ve un `viewer`» y ésta es la respuesta, con su fundamento. Mover la línea —abrirle la auditoría a un `viewer`— **sigue siendo posible pero es otra cosa**: enmienda `SecurityModel.md` y, por su peso, pide un ADR. No entra acá.

### D-11 — Las cinco secciones fijas de la pantalla se vuelven una sola lista

*Agregada el 2026-10-31, al implementar. No estaba escrita en el brief aprobado y conviene que lo esté, porque saca de la pantalla secciones que el usuario ya conocía.*

Hasta ahora la pantalla tenía cinco secciones fijas —«Unidades disponibles», «En reparación y en revisión», «Reparaciones anteriores», «Reservadas y vendidas» y «Dadas de baja»— que se armaban **filtrando en memoria** sobre todas las unidades del producto. Pasan a ser **una sola lista** con el filtro por estado, que es lo que dibuja la lámina 10.

**No es una elección de forma: D-8 la fuerza.** Con la lectura paginada, una sección que filtra en memoria ve solo las unidades de la página que se está mirando, así que «Unidades disponibles» mostraría las disponibles *de esa página* y parecería que no hay más. Mantener las secciones **y** paginar es incoherente; mantener las secciones **sin** paginar es H-6, el problema que vinimos a arreglar.

Lo que cada sección aportaba no se pierde:

| Sección que se va | Dónde vive ahora |
|---|---|
| «Unidades disponibles» | la lista con `?estado=disponibles`, que es el chip por defecto del Resumen |
| «En reparación y en revisión» | dos chips distintos, por D-6, con el estado en la columna Estado |
| «Reservadas y vendidas» | la columna Estado, con su pedido o su venta |
| «Reparaciones anteriores» | la columna Estado, con sus órdenes de servicio, y el Historial del panel |
| «Dadas de baja» | `?estado=bajas`, y el **motivo** en el Historial del panel |

**Consecuencia sobre AC-7, precisada acá**: el motivo de la baja se muestra **en el panel**, y la lista lleva a él. No se muestra en cada fila de la lista porque el motivo de una baja desde `in_review` vive en la auditoría y `listEntityAuditLogs` lee **una** entidad por llamada: una columna «motivo» en la lista costaría una lectura de auditoría por fila. Batearlas pediría una lectura nueva en `audit`, que está fuera de la lista cerrada de archivos autorizados. Entre una lectura por fila y una cuando se abre la unidad, se eligió la segunda.

**Efecto colateral declarado**: seis aserciones de la batería end-to-end vigilaban los títulos de esas secciones, en tres archivos. Dos de esos archivos estaban fuera de la lista cerrada; **se paró y se preguntó**, y el usuario los autorizó el 2026-10-31.

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

*Ampliada el 2026-10-31, con autorización del usuario en el turno, antes de escribir código*: los tres archivos de `tests/integration/` marcados abajo. El motivo es H-13, y la regla **funcionó como se esperaba**: al enumerar los llamadores de `listProductUnits` como pide AC-4, aparecieron tres archivos de prueba fuera de la lista, se paró, se preguntó y se autorizaron. No se amplió sola, que es lo que pasó en la 24.5.1.

*Ampliada tres veces más el 2026-10-31*, y **una de ellas mal**. Lo encontró la revisión independiente como su bloqueante B-1, y conviene que quede escrito con precisión porque es la misma regla que esta subfase heredó de la 24.5.1 como su lección principal:

- **`seeds/volume.ts` y `tests/guards/volume-seed-identity.test.ts`: se paró, se preguntó y el usuario los autorizó**, cada uno en su turno. Lo que estuvo mal no fue el procedimiento sino el registro: **no se agregaron a esta tabla en el momento**, así que durante varias horas el brief decía una cosa y el árbol de trabajo mostraba otra. H-14 seguía afirmando «se para y se pregunta» sin registrar que se había preguntado y que la respuesta había sido sí. Un brief cuya virtud declarada es registrar las ampliaciones con fecha no puede dejarlas sin registrar.
- **`src/modules/inventory/repository.ts`: no se preguntó.** La lectura nueva `findUnitMovements` se escribió ahí porque los movimientos de stock viven en ese archivo, y la lista autorizaba `unit-repository.ts`, que es otro. **Es un cruce de la condición de detención 1**, exactamente el que la 24.5.1 escribió como su lección: «salirse de la lista cerrada se para y se pregunta, sin excepción por tamaño ni por confinamiento». El razonamiento implícito fue el de siempre —«es donde corresponde, son cuarenta líneas»— y es el razonamiento que la regla prohíbe. El usuario lo autorizó **retroactivamente** el 2026-10-31, después de que la revisión lo encontrara.

**Lo que esto dice de la regla**: funcionó tres veces de cuatro, y la vez que falló no la detectó ni la autoevaluación ni ninguna prueba, sino la revisión independiente leyendo el `git status` contra la tabla. La precaución que faltaba es barata: **antes de pedir la revisión, comparar la lista de archivos tocados contra la tabla, uno por uno**. Pasa a ser parte del cierre.

*Séptima observación sobre la misma regla, y la que corrige la precaución, el 2026-10-31*: **la CI encontró un cuarto archivo de pruebas roto por D-11**, `tests/e2e/trade-ins.spec.ts`, después del commit `dba970c`. 334 pruebas pasaron y falló una.

La enumeración que armó la segunda tanda buscó los archivos que **nombran las secciones eliminadas** —«En reparación y en revisión», «Reparaciones anteriores», «Reservadas y vendidas»— y encontró dos. `trade-ins.spec.ts` no nombra ninguna sección: afirmaba sobre el **texto de la fila**, `"· En revisión"`, un formato que D-11 reemplaza por una insignia en su columna. La búsqueda no podía alcanzarlo.

**Y la precaución que esta subfase se había impuesto tampoco**, porque cubre una sola dirección: «comparar los archivos tocados contra la tabla» detecta un archivo que toqué sin autorización, y no detecta **un archivo que el cambio rompe y que nunca enumeré**. Son dos huecos distintos y hacen falta las dos comprobaciones:

1. **Hacia adelante**: todo archivo tocado figura en la tabla. La que ya estaba.
2. **Hacia atrás**: antes de cerrar, buscar en las pruebas **los textos y las formas que el cambio elimina**, no solo los nombres de lo eliminado. Acá habría bastado con grepear `"· "` junto a cada etiqueta de estado, que es como la lista vieja componía sus filas.

Lo barrido después del fallo, con los seis textos del formato viejo: `trade-ins.spec.ts` era el único que quedaba.

**Lo que esto dice del gate**: AC-17 —la batería entera verde en la CI sobre el SHA que se despliega— hizo exactamente su trabajo. La batería local no lo habría encontrado tampoco, porque la detuvo el entorno en la prueba 60 de 298 y `trade-ins.spec.ts` corre mucho después.

*Nota sobre un hallazgo de B-1 que no corresponde*: la revisión incluyó `.claude/settings.json` entre los archivos fuera de la lista. **No es de esta subfase**: está sin seguimiento desde antes de empezarla —aparece así en el primer `git status` de la sesión— y el usuario decidió el 2026-10-31, durante la 24.5.1, dejarlo como está. No se tocó.

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
| `tests/integration/units.test.ts` | **Ampliación autorizada el 2026-10-31.** Aserciones a la forma paginada |
| `tests/integration/units-orders-sales.test.ts` | **Ampliación autorizada el 2026-10-31.** Idem |
| `tests/integration/service-own-units.test.ts` | **Ampliación autorizada el 2026-10-31.** Idem |
| `tests/e2e/warranty.spec.ts` | **Ampliación autorizada el 2026-10-31** (segunda tanda). Aserción de «Reservadas y vendidas», sección que D-11 elimina |
| `tests/e2e/repairs-own-units.spec.ts` | **Ampliación autorizada el 2026-10-31** (segunda tanda). Aserciones de «En reparación y en revisión» y «Reparaciones anteriores», idem |
| `seeds/volume.ts` | **Ampliación autorizada el 2026-10-31** (tercera tanda, por H-14). La capacidad `variants`, los modelos y el producto por unidad, sin los cuales las dos mediciones de D-9 no se podían hacer |
| `tests/guards/volume-seed-identity.test.ts` | **Ampliación autorizada el 2026-10-31** (tercera tanda). El guard que fija la distribución de medición: todo campo nuevo cae en su igualdad y la rompe, así que extender el seed obliga a pasar por él |
| `src/modules/inventory/repository.ts` | **Ampliación autorizada el 2026-10-31, RETROACTIVAMENTE** (cuarta tanda). La lectura nueva `findUnitMovements`. Ver la nota de abajo: acá **no se paró a preguntar y había que hacerlo** |
| `src/app/(autenticado)/productos/[productId]/unidades/list-data.ts` | **Nuevo. Ampliación autorizada el 2026-10-31** (quinta tanda, al arreglar B-2). La lectura de la lista en la capa de composición, con el `catch` y la lectura inyectada |
| `src/app/(autenticado)/productos/[productId]/unidades/list-data.test.ts` | **Nuevo. Ampliación autorizada el 2026-10-31** (quinta tanda). Sus cinco pruebas, incluida la del fallo forzado |
| `src/app/(autenticado)/productos/[productId]/unidades/forms.tsx` | **Ampliación autorizada el 2026-11-01** (séptima tanda, en el recorrido). `ReleaseUnitForm` acepta `className` e `icon` para entrar en el menú «···» de la fila, con sus valores de siempre por omisión |
| `tests/e2e/trade-ins.spec.ts` | **Ampliación autorizada el 2026-10-31** (sexta tanda, después de que la CI fallara). Afirmaba «· En revisión» con el formato de fila que D-11 elimina. Ver la nota de abajo: **lo encontró la CI, no la enumeración** |
| `deploy/staging/README.md` | **Ampliación autorizada el 2026-11-01** (octava tanda, después del segundo despliegue). Corrige la frase falsa del §2 de «Verificar después de desplegar» y agrega el `curl` que sí deja la fila |
| `deploy/production/README.md` | **Ampliación autorizada el 2026-11-01** (octava tanda). El paso 2 remite a ese `curl`, y escribe las tres comprobaciones que hacen válida la comparación más el control negativo |
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
- **I-9** — La lectura de la auditoría de una unidad **autoriza en el servicio**, no en la presentación: a un `viewer` le responde `FORBIDDEN`, y ocultarle el bloque es presentación además, no en lugar de. Es la regla que `product-sub-nav.tsx` ya enuncia para la pestaña de Costos.

## Criterios de aceptación

| Id | Criterio |
|---|---|
| **AC-1** | La lista de unidades se filtra por estado con `?estado=`, con «Todas» como ausencia del parámetro, y los seis estados tienen su valor. Probado con JavaScript deshabilitado. |
| **AC-2** | Los tres contadores del Resumen son enlaces a la lista filtrada por su estado, y llegan a una lista efectivamente filtrada. El Resumen sigue sin un total que los sume. |
| **AC-3** | La lista se busca por sufijo de IMEI de cuatro caracteres o más. Con menos de cuatro no filtra y lo dice; con un sufijo que no casa, el resultado vacío **conserva los filtros** y ofrece restablecerlos. |
| **AC-4** | La lista está paginada, con su total real, y el filtro y la búsqueda se aplican en SQL. Enumerados y revisados todos los llamadores de `listProductUnits`. |
| **AC-5** | `?unidad=<id>` abre el panel de la unidad con Detalle, y `&vista=historial` lo abre en Historial. Las dos pestañas tienen `aria-current` y se recorren por teclado. Cerrar el panel vuelve a la lista con sus filtros intactos. |
| **AC-6** | El Historial une los movimientos de la unidad y sus entradas de auditoría, de más nuevo a más viejo, y **cada fila dice de qué tipo de evento viene**. Una reserva y un pase a revisión no aparecen como entrada ni salida física. |
| **AC-7** | *Modificado el 2026-10-31 por decisión del usuario, tras el hallazgo N-7 de la revisión independiente; antes decía «en el panel y en “Dadas de baja”».* El motivo de la baja se muestra para una unidad dada de baja **desde `available`** (desde el movimiento) y para una **desde `in_review`** (desde la auditoría), **en el panel**, y la lista lleva a él. **Una prueba por camino**, con la unidad recorrida de verdad hasta su estado. **El cambio es de alcance sobre un criterio ya aprobado**: lo propuso D-11 al implementar, la revisión lo marcó como tal y lo decidió el usuario, no yo. El motivo es el costo —una lectura de auditoría por fila de la lista, o una lectura nueva en `audit` que está fuera de alcance—, y la sección «Dadas de baja» que el criterio nombraba ya no existe: es el chip `?estado=bajas`. |
| **AC-8** | Borrar la lectura de la auditoría hace fallar la prueba del segundo camino, y solo esa. Demostrado en los dos sentidos. |
| **AC-9** | «En reparación» y «En revisión» son dos secciones con dos valores de filtro distintos. La de en revisión muestra el pendiente y el acceso a su checklist. Ningún total cambia. |
| **AC-10** | Si la lectura de la auditoría falla, el Historial lo anuncia y no dice «sin eventos». Probado con la lectura forzada a fallar, **sin mockear el módulo**, y comprobado que sin el `catch` la prueba falla. |
| **AC-11** | Cada lectura nueva filtra por organización en SQL, probado llamando al **repositorio** con una organización ajena, con un control positivo, en `tests/integration/organization-isolation.test.ts`. Borrar el filtro hace fallar solo la prueba nueva. |
| **AC-12** | *Corregido el 2026-10-31 por H-12 y D-10; antes decía que un `viewer` ve «la lista, el panel y el historial sin el costo», lo que contradecía `SecurityModel.md`.* Un `viewer` ve la lista y el panel **sin el costo**, comprobado sobre lo que llega al navegador, y ningún total le permite deducirlo. Del historial ve **solo los movimientos**, con una línea que dice que los cambios de estado los ve un `admin`; **no** ve ninguna entrada de auditoría, y la lectura nueva de la auditoría le responde `FORBIDDEN` en el servicio, no solo le oculta el enlace. |
| **AC-19** | El motivo de una baja **desde `available`** lo ven los dos roles (vive en el movimiento) y el de una baja **desde `in_review`**, solo un `admin` (vive solo en la auditoría). Las dos mitades probadas, con el `viewer` comprobado contra el servicio. |
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

### Los umbrales de D-9, fijados antes de medir

*Escritos el 2026-10-31, **antes** de correr una sola medición.* Fijarlos después es elegir el umbral que el número ya cumple, que es exactamente lo que vuelve inútil a la medición.

| Camino | Umbral | Por qué ese número |
|---|---|---|
| `inventory.listProductStock` **agrupado por modelo** | **400 ms** de camino completo | El mismo que la 21.6 y la 24.4.3 fijaron para una pantalla de lista. H-5 de la 24.5.1 sostenía que el agrupado no agrega ninguna consulta —es un pliegue en memoria sobre un conjunto ya cargado—, así que se espera **cerca del camino sin agrupar**; si se despega mucho de él, H-5 era falso y eso es el hallazgo |
| `inventory.listProductUnits` con filtro y búsqueda | **400 ms** | Idem. El caso que más puede costar es la búsqueda por sufijo, porque un `like '%…'` no puede usar el índice del serial |

Las dos se miden con `scripts/medir-caminos.ts` sobre la base local, mediana de 5 corridas, y **el número se anota en el cierre aunque pase**. Si se supera, se informa (condición de detención).

#### H-14 — Por qué la medición de la 24.5.1 no se había hecho: la siembra de volumen no tiene unidades ni modelos

*Agregado el 2026-10-31, al ir a medir.* Los dos caminos de arriba están ya **agregados al script** y los umbrales están fijados, pero **no se pueden correr sobre un caso que signifique algo**, y el motivo no es falta de tiempo:

`seeds/volume.ts` es de la 8.5 y **no siembra nada de lo que estos dos caminos necesitan**. Verificado por búsqueda en el archivo: no tiene `organization_capabilities`, ni `product_models`, ni `tracking`, ni una sola fila de `stock_units`. Entonces, en la organización de volumen:

- **el catálogo agrupado no agrupa nada**: sin la capacidad `variants` la vista no se ofrece, y sin modelos todos los productos caerían en «Sin modelo»;
- **la lista de unidades no tiene unidades que listar**: ningún producto es `tracking = 'unit'`.

La única organización que sí tiene modelos, variantes y unidades es la de demostración «iPhone Demo», con un puñado de filas: medir ahí da un número real de un caso que no es el peor, y presentarlo como la medición de §Riesgos sería peor que no medir.

**Esto explica, y nadie lo había escrito, por qué la medición que la 24.5.1 prometió no se hizo**: no era una omisión de la 24.5.1, era que el instrumento no alcanza al camino. El brief de la 24.5.1 lo atribuyó a que «el camino nuevo no está en `scripts/medir-caminos.ts`», que era verdad pero no era la causa: agregarlo, como se acaba de hacer, no alcanza.

**Lo que haría falta**: extender `seeds/volume.ts` con la capacidad `variants`, unos modelos asignados a los productos, y un producto `tracking = 'unit'` con cientos de unidades. Estaba fuera de la lista cerrada, así que se paró y se preguntó (condición de detención 1). Es un arreglo que sirve más allá de esta subfase: cualquier medición futura de un camino de unidades, modelos o capacidades se va a topar con lo mismo.

*Resuelto el 2026-10-31*: **el usuario autorizó `seeds/volume.ts`**, y después `tests/guards/volume-seed-identity.test.ts`, que es la puerta obligatoria de cualquier cambio a la distribución de medición. Las dos ampliaciones están en la tabla de «Archivos autorizados». Con eso **las dos mediciones se hicieron**: sus condiciones y sus números están en «Las mediciones de D-9». Este párrafo se conserva porque explica **por qué la deuda venía de la 24.5.1**, que es lo que no estaba escrito en ninguna parte.

### Las mediciones de D-9: hechas, con sus números

*Corridas el 2026-10-31, después de fijar los umbrales y de verificar los datos.* **La deuda que la 24.5.1 dejó queda pagada.**

**Condiciones**, que se declaran porque un número sin ellas no se puede volver a comparar:

- Base local `crm_medicion_test`, creada para esto, con las **67 migraciones** —las mismas que producción— y **vacía de antes**. `crm_dev` no se tocó.
- PostgreSQL **18.6**, `shared_buffers` 16384×8kB, `work_mem` 4096 kB, `effective_cache_size` 524288×8kB, `random_page_cost` 4, `plan_cache_mode` auto.
- **Colación `en_US.utf8` con proveedor libc**, igual que `crm_dev` y **distinta de producción**, que usa ICU `es` (13.2). Para estos dos caminos casi no cambia nada —la búsqueda por sufijo lleva un `like '%…'` que ningún índice btree puede usar bajo ninguna colación—, pero la diferencia queda dicha.
- `seeds/volume.ts medicion`: 21 organizaciones, 14.120 productos, 96.016 mensajes. La medida, la ordinal 0, con **10.001 productos, 50 modelos, 8.001 productos con modelo y 2.000 sin modelo** (grupos de unas 160 presentaciones) y **500 unidades** en un producto por unidad.
- Mediana de **5 corridas tras una de calentamiento**, una llamada por vez. No mide concurrencia.
- Máquina con poca memoria libre (~1,2 GB de 7,7 GB), como la de la 24.4.3.

**Los datos se verificaron antes de medir, no después.** Si los modelos no hubieran entrado, el catálogo «agrupado» habría medido una agrupación trivial y el número habría salido excelente por el motivo equivocado.

| Camino | Mediana | Mínimo | Máximo | Umbral |
|---|---|---|---|---|
| `listProductStock` **agrupado por modelo** | **339,4 ms** | 304,0 | 360,1 | 400 ✅ |
| `listProductStock` agrupado, 50 filas | **324,0 ms** | 298,7 | 346,4 | 400 ✅ |
| `listProductStock` **sin agrupar** (referencia) | 317,0 ms | 255,5 | 330,0 | — |
| `listProductUnits`, 500 unidades | **4,8 ms** | 4,0 | 5,2 | 400 ✅ |
| `listProductUnits` por estado | **5,2 ms** | 4,8 | 5,7 | 400 ✅ |
| `listProductUnits` búsqueda por sufijo | **4,6 ms** | 4,2 | 5,6 | 400 ✅ |

**H-5 de la 24.5.1 queda confirmada, y es el resultado que importa más que el número**: agrupar cuesta **22,4 ms sobre 317,0**, un 7 %. El pliegue de `sumByModel` es una operación en memoria sobre un conjunto que la lista ya tenía cargado, **no una consulta nueva**. Si hubiera sido una consulta por grupo, con 50 modelos el número se habría despegado y el hallazgo habría sido el contrario.

**La lista de unidades no tiene problema de camino**, y la búsqueda por sufijo **no es más lenta** que la lista sin filtro (4,6 contra 4,8 ms): con 500 unidades de un producto, recorrerlas es trivial y el `like '%…'` no se nota. El tope de D-8 no se puso por el tiempo de hoy sino porque la lectura **no tenía ninguno**, y 500 unidades en un producto es un número chico para un negocio con varios años.

Controles del propio script, los dos en orden: **0 sentencias preparadas con nombre** en 10 conexiones del pool, y `plan_cache_mode` en `auto`, sin fijar por rol ni por base.

**Observación, ajena a esta subfase**: con el mismo umbral de 400 ms, **dos caminos que ya están en producción lo superan** — `listProductStock` ordenado por precio (**459,0 ms**) y ordenado por stock con 50 filas (**402,0 ms**), los dos de la 15.2. No los toca esta subfase y no son una regresión suya; quedan dichos porque el umbral que usé los deja afuera y eso es información del proyecto, no un detalle de forma.

## Hallazgos de la implementación

*Escritos el 2026-10-31, mientras se implementaba. Se doblan al §Cierre cuando la subfase cierre; se anotan acá para no perderlos.*

### H-15 — Un `sr-only` dentro de un contenedor que scrollea estira el documento, salvo que el contenedor sea un bloque contenedor

**Defecto real, encontrado por AC-13 y corregido.** La pantalla de unidades **desbordaba horizontalmente a 375 px**.

No se diagnosticó por inspección: un diagnóstico temporal le preguntó al navegador qué elementos se salen del ancho, y la respuesta fue precisa. `body` tenía `scrollWidth` 375 y **`html` tenía 1011**, que es la firma de algo fuera del flujo.

La causa son los `<span class="sr-only">` de la tabla —el encabezado «Acciones» y el IMEI que cada acción agrega a su nombre accesible—. Están **posicionados en absoluto**, así que sin un ancestro posicionado resuelven su bloque contenedor contra el documento: quedaban en x≈1000, **escapaban del `div` con `overflow-x-auto`** y estiraban el `scrollWidth` del `html`. El arreglo es una clase, `relative` en ese contenedor, y está comentado en el código con su motivo.

**Por qué no había aparecido antes**: la tabla anterior a esta subfase era angosta —una sección y menos columnas—, así que sus `sr-only` caían dentro de los 375 px. El defecto estaba **latente en el patrón**, no en el código viejo: lo destapó ensanchar la tabla a 1005 px con la lista única de D-11. Cualquier tabla ancha del proyecto con un `sr-only` adentro tiene el mismo problema esperando.

Verificado en los dos sentidos: con `relative`, `scrollWidth` 375 = `innerWidth` 375; sin él, 1011.

### H-16 — Una aserción de URL demasiado laxa no podía fallar, y tapaba un defecto de la propia prueba

**Defecto de mis pruebas, no del código.** La prueba del panel afirmaba, después de cerrarlo, `toHaveURL(/\?estado=bajas/)`. Esa URL **también la cumple la página con el panel abierto**, porque la URL del panel contiene `?estado=bajas` y sigue con `&unidad=…`. La aserción pasaba sin importar si cerrar funcionaba.

Y no funcionaba: el clic siguiente caía en el panel **anterior**, que todavía estaba en el DOM, así que la prueba comprobaba el historial de la unidad equivocada. La aserción que debía detectarlo no podía fallar.

Corregido: `toHaveURL(/\?estado=bajas(#.*)?$/)`, más `toHaveCount(0)` del panel, más esperar a que el panel sea el de **esa** unidad antes de tocar sus pestañas. Es la misma familia que las notas del vault sobre la señal de la aserción: **una prueba que no puede fallar no vigila nada.**

De paso, un detalle de localizadores que vale anotar: el **nombre accesible** de un chip es `"Disponible 0"`, **con espacio**, mientras su `textContent` es `"Disponible0"`, sin espacio. `getByRole(name:)` usa el primero y `toHaveText` el segundo. Los localizadores de los chips pasaron a expresiones regulares.

### O-1 — Una prueba de integración falla en Windows porque `spawnSync("bash")` es el `bash` de WSL, que no hereda el entorno

**Observación ajena a esta subfase, no corregida acá: el archivo está fuera de la lista cerrada.**

`tests/integration/product-images.test.ts` → «D-9: el aviso de tamaño termina bien bajo el umbral y con error por encima» **falla en esta máquina**. Es el único fallo de la batería de integración: **1878 de 1879 pasan**.

No es de la 24.5.2: no toca ni `deploy/production/crm-db-size.sh` ni ese archivo de prueba, y ninguno de los dos está modificado en el árbol de trabajo.

La causa, medida y no supuesta:

1. El script, corrido a mano desde Git Bash con `CRM_DB_SIZE_THRESHOLD_BYTES=1`, **funciona**: sale por `exit 1` con «por encima del umbral». Con el umbral por omisión sale `OK`. El script está bien.
2. La prueba lo invoca con `spawnSync("bash", …)` pasándole la variable en `env`. En esta máquina **`bash` resuelve a `C:\windows\system32\bash.exe`, que es el lanzador de WSL**, y una sonda propia lo confirma: con `spawnSync("bash")` el proceso es `/bin/bash` y la variable llega como `NO_DEFINIDA`; invocando el `bash` de Git explícitamente, llega como `llego`.
3. El caso «bajo el umbral» pasa igual porque solo depende del `PATH`, que WSL **sí** importa por interoperabilidad; el que se pierde es la variable propia.

Así que la prueba toma el umbral por omisión de 1 GB, la base de test ocupa 117 MB, y el script sale `OK` cuando la prueba espera el error.

**Es la segunda observación de la nota del vault** `bash Called From PowerShell on Windows Can Be WSL, Which Drops the Caller's Environment`, esta vez desde el `spawnSync` de Node y no desde PowerShell. Vale como adenda a esa nota.

El arreglo —resolver el `bash` de Git, o pasar el umbral por argumento en vez de por entorno— **corresponde a un cambio aparte**, como los cuatro instrumentos que encontró la 24.4.3. En la CI, que corre en Linux, esto no se ve.

**Ampliación del 2026-10-31, medida al cerrar, y es peor de lo que decía arriba.** La misma prueba, sin tocar una línea, **pasa o falla según desde qué consola se lance vitest**:

| Consola | `bash` que resuelve | Resultado |
|---|---|---|
| PowerShell | `C:\windows\system32\bash.exe` (lanzador de WSL) | **1 falla**, 12 pasan |
| Git Bash | el `bash` de Git | **13 pasan** |

Las dos corridas son del mismo archivo, con la misma base y a un minuto de distancia. `spawnSync("bash")` resuelve contra el `PATH` **de quien lanzó el proceso**, y ese `PATH` es distinto en cada consola.

Lo que esto cambia: no es «una prueba que falla en Windows», es **una prueba cuyo resultado depende de un dato que nadie declaró** —la consola—. Pasa en verde y no por eso está comprobada. Es exactamente la forma de un falso verde, y vale como segunda adenda a la nota del vault.

### O-4 — `secondaryButtonClass` da 38 px de alto, y es la clase de botón secundario de todo el proyecto

**Encontrado al cubrir AC-13 dentro del panel (N-6), corregido solo en el panel.**

La prueba nueva midió el alto de «Cerrar» y dio **38 px**, contra los 44 que pide AC-13: `secondaryButtonClass` es `px-3 py-2 text-sm` más el borde, sin `min-h`. Las dos pestañas del panel sí dan 44, porque llevan `min-h-11` explícito.

El arreglo acá es local: «Cerrar» lleva `min-h-11 min-w-11`. **No se tocó la clase compartida**, y conviene decir por qué y qué queda abierto:

- `secondaryButtonClass` y `secondaryLinkClass` las usa **todo el proyecto** —caja, reparaciones, ventas, compras, cada acción de fila de esta misma pantalla—. Cambiar el alto de base mueve la altura de decenas de pantallas y es un cambio de sistema visual, con su propio brief.
- Por lo tanto **las acciones de fila y las del panel que vienen de `extras` siguen midiendo 38 px**. AC-13 se cumple para los controles propios de esta subfase —los chips del filtro, las dos pestañas y «Cerrar»—, y **no** para los botones secundarios heredados. Queda declarado, no disimulado.

Lo que esto confirma, que es lo que AC-13 buscaba al pedir «medidos, no inferidos de clases»: la clase estaba puesta con intención y el número no era el que se suponía. Inferirlo de leer el código habría dado 44.

### O-3 — La batería de integración completa terminó con un worker caído y **salió con código 0**

**Observación de la corrida de cierre, no un defecto del código de la subfase.**

La batería entera —1.186 segundos— informó **113 de 114 archivos** pasados, **1.884 pruebas pasadas, ninguna fallada**, y **un error**: el worker que corría `tests/integration/migration-0059.test.ts` murió con código `3221226505` (`0xC0000409`, el *fast fail* de Windows) «during started state», es decir **antes de ejecutar ninguna de sus pruebas**.

Dos comprobaciones:

1. **Ese archivo, corrido solo, pasa** —junto con `product-images.test.ts`, 14 pruebas en 26 segundos—. No es un defecto del archivo ni de esta subfase, que no lo toca.
2. **El proceso salió con código 0.** Un archivo que nunca corrió, un error informado en el resumen, y aun así la corrida se reporta como exitosa ante cualquier cosa que mire el código de salida.

Lo segundo es lo que importa anotar: **el código de salida no distingue «todo pasó» de «un archivo no llegó a correr»**. En una corrida local eso se ve leyendo el resumen; en un `&&` de script, no. Para esta subfase se resolvió corriendo el archivo caído por separado, que es lo que deja la afirmación en pie; vale como precaución general —**contar los archivos del resumen, no confiar en el código de salida**— y, si se quiere una guarda, corresponde a un cambio aparte.

### O-2 — `npm run format:check` falla en esta máquina por quince archivos de la Fase 29 que están en CRLF

**Observación ajena a esta subfase, no corregida acá.**

`npx prettier --check .` informa **18 archivos** con problemas de estilo. Ninguno es de la 24.5.2: son quince archivos de `reparaciones/` y `modules/service/` de la Fase 29, dos pruebas de esa misma fase, y `.claude/settings.json`. Los tres grupos están **sin modificar** en el árbol de trabajo.

La causa, medida: esos quince archivos están en **CRLF** y los otros 693 de `src` en LF. Con `core.autocrlf=true` y sin `.gitattributes`, el índice guarda LF y lo que queda en disco depende de quién escribió el archivo —`git` al reponerlo, o las herramientas de esta sesión—. Prettier, con su `endOfLine: "lf"` por omisión, marca el archivo entero.

Dos consecuencias que importan:

1. **En la CI no se ve**, porque ahí el repositorio se clona en Linux y sale del índice en LF. Es la misma asimetría que O-1, con otra causa.
2. **`format:check` local no es una señal utilizable tal como está**: falla por archivos que nadie tocó. Lo que se comprobó para esta subfase es `prettier --check` **sobre los archivos de este cambio**, y está limpio. `eslint` tiene el problema simétrico: 749 errores, todos de `.claude/skills/impeccable/scripts/*.js`, que son de una skill de terceros, están en `.gitignore` y no los ignora la configuración de ESLint. Acotado a `src tests scripts seeds`, limpio.

Arreglarlo —un `.gitattributes` con `* text=auto eol=lf`, más una pasada de Prettier, más un `ignores` de ESLint para `.claude/`— **corresponde a un cambio aparte**: toca quince archivos de otra fase y la configuración de dos herramientas.

## AC-15 — La comparación visual contra las láminas 10, 14 y 15

Hecha el 2026-10-31 sobre el build de producción, con capturas tomadas del navegador: la lista y el panel a 1440 px, el panel y la lista a 390 px, y los estados. Las capturas fueron temporales y **no quedan versionadas**: el instrumento que las tomó se agregó a `units.spec.ts`, se usó y se borró, y el archivo volvió a su estado exacto.

**Cómo leer esta sección**: cada diferencia se declara una por una, con su motivo y con quién la decidió. Ninguna «se parece bastante». Las que ya estaban decididas antes de implementar se marcan con la decisión que las fijó.

### Lámina 10 — Unidades (escritorio)

| # | Diferencia | Motivo |
|---|---|---|
| 1 | **El panel va arriba de la lista, no a la derecha** | **Ya declarada en D-2.** La lámina lo dibuja como columna fija a la derecha; acá es una tarjeta sobre la lista, en la misma página y por URL. Una ruta `/unidades/[unitId]` sería una sexta ruta de producto y la variante (a) de D-1 de la 24.5.1 fijó que las rutas no se mueven en esta parte de la fase |
| 2 | **El filtro por estado son chips con su cantidad, no dos desplegables** | **Ya declarada en D-5.** La lámina tiene «Estado» y «Batería» como `select`; acá son chips que son **enlaces**, porque el filtro tiene que funcionar sin JavaScript y ser compartible por URL. El chip además lleva la cantidad, que en la lámina vive en una fila aparte |
| 3 | **No existe el filtro por batería** | Fuera de alcance: no estaba en el alcance incluido ni tiene criterio. La batería se muestra en su columna |
| 4 | **La fila de resumen «5 físicas · 3 disponibles · 1 reservada · 1 en revisión» no existe como tal** | Sus números están en los chips. Mantener las dos cosas sería decir dos veces lo mismo, y la lámina las tiene separadas porque sus chips no llevan número |
| 5 | **No hay columna de selección múltiple** | **Ya declarada en el alcance excluido**: la selección múltiple y su barra de acciones quedan como mejora posterior |
| 6 | **No hay columna «Unidad» con un código U-0101** | **El modelo no tiene ese dato.** Una unidad se identifica por su IMEI o serie, que es su columna. Inventar un código correlativo sería crear un campo nuevo fuera del brief |
| 7 | **El IMEI se muestra entero, sin «Mostrar» ni «Copiar»** | **Ya declarada en D-1 y en el alcance excluido**: el enmascarado pide un ADR y quedó fuera de la Fase 24 |
| 8 | **La tabla tiene más columnas que la lámina y necesita desplazamiento horizontal a 1440 px** | La lámina muestra cinco columnas; acá hay ocho más las acciones, porque D-11 trajo a la lista única lo que vivía en las cinco secciones fijas —precio, costo, origen, alta— y las acciones por fila que ya existían. Es la consecuencia directa de D-11 y se ve: a 1440 px la columna de acciones queda cortada y la tabla scrollea. **No se recorta ninguna columna acá**, porque cada una venía de una sección que esta subfase eliminó y sacarla sería perder un dato que el usuario ya tenía. Queda anotado como candidato a revisar en la 24.5.2-b, junto con el costo y el margen |
| 9 | **El botón «Recibir unidades» no está arriba de la lista** | Las altas de unidades entran por recepciones de compra o por el alta manual, que ya tienen su lugar. No se movió nada de eso en esta subfase |
| 10 | **La cabecera del producto no tiene miniatura, ni «Usado · Grado A», ni «Editar producto», ni «···»** | **Anterior a esta subfase**: la cabecera es la que dejó la 24.5.1 y su lámina. No se tocó |
| 11 | **La tarjeta «Cómo se lleva el stock» no está en la lámina** | Anterior a esta subfase. Explica por qué el seguimiento no se puede cambiar, que es información que la lámina no contempla |

### Lámina 14 — Unidad (teléfono)

| # | Diferencia | Motivo |
|---|---|---|
| 12 | **No es una pantalla propia con «‹ Unidades» arriba: es el panel dentro de la pantalla de unidades** | **Ya declarada en D-2**, por el mismo motivo que la diferencia 1 |
| 13 | **Las dos pestañas Detalle e Historial sí están**, con la misma forma y el mismo subrayado | Sin diferencia. Son enlaces reales, así que andan sin JavaScript, y miden los 44 px de AC-13 |
| 14 | **El Detalle es una lista de pares etiqueta/valor, no cuatro tarjetas con ícono** | La lámina agrupa en «Identificación», «Estado del equipo», «Origen» y «Garantía». Acá son ocho campos en dos columnas. Agrupar en tarjetas dentro de un panel que ya es una tarjeta agrega un nivel de anidado sin dato nuevo; y dos de esos grupos dependen de datos que no tenemos (ver 15 y 16) |
| 15 | **No hay fila «Checklist · Verificado» ni enlace «Ver checklist»** | **El dato existe pero es de otro módulo**: el checklist vive en la orden de servicio (`service`), y la unidad en revisión **ya enlaza su orden** desde la columna Estado de la lista, que es el acceso al checklist que pide AC-9. Repetirlo adentro del panel pedía una lectura más por unidad |
| 16 | **No hay sección «Origen» con recepción y fecha ni «Ver recepción»** | El panel muestra «Origen: Alta manual» y la fecha de alta. El enlace al comprobante de origen —recepción o usado— existe **en la fila de la lista**, no en el panel; duplicarlo era otra lectura |
| 17 | **No hay sección «Garantía» con estado y «Revisar política»** | La garantía de la unidad se edita con «Días de garantía», que está entre las acciones del panel, y se muestra en la columna Estado de la lista. La política de garantía es una pantalla de administración, no un enlace de esta vista |
| 18 | **El aviso «El grado es una clasificación estética» no está** | Es una leyenda de la lámina sin dato detrás. No se agregó texto que no estuviera decidido |
| 19 | **«Editar unidad» no es un botón primario a ancho completo: son «Corregir», «Días de garantía», «Dar de baja» y «Cerrar»** | Son las acciones que el sistema ya tiene para una unidad, con los nombres que ya usa. «Editar unidad» como acción única no existe |

### Lámina 15 — Estados y validaciones del inventario

| # | Estado de la lámina | Qué hay |
|---|---|---|
| 20 | **«Sin unidades disponibles»** con sus tres números y «Ver reservas» | **Está, con otra forma**: «Ninguna unidad coincide con el filtro o la búsqueda», con los chips mostrando la cantidad de cada estado y «Restablecer» para volver. Los tres números de la lámina son los chips, y «Ver reservas» es el chip «Reservada» |
| 21 | **«No se pudo consultar el inventario»**, con el último dato conocido y «Reintentar» | **Está el anuncio, no el último dato conocido ni el reintento**: si la lectura falla se dice «No disponible: no pudimos leer las unidades de este producto. No significa que no tenga», y si fallan los recuentos los chips van sin número y se dice. **No guardamos un último valor conocido**, y mostrarlo sería afirmar un número viejo como si fuera el de ahora, que es justo lo que I-2 prohíbe. «Reintentar» es recargar: no hay estado que preservar |
| 22 | **«IMEI ya registrado»**, con el enlace a la unidad existente | Anterior a esta subfase: el alta rechaza un IMEI repetido con su mensaje. **El enlace «Abrir U-0101» no está** y sería una mejora real; no entra acá porque el formulario de alta no es de esta subfase |
| 23 | **«Inventario actualizado por otra persona»** | **No está, y no corresponde todavía**: la pantalla no tiene edición concurrente con borrador. Cuando la 24.5.2-b traiga la edición de la unidad, ahí sí |
| 24 | **«Costos restringidos»**, con una tarjeta que lo explica | **El `viewer` no ve la columna Costo y no se le explica por qué.** Verificado en la captura: su tabla tiene siete columnas en vez de ocho. La lámina propone decirlo; acá se omite en silencio, que es lo que el proyecto viene haciendo desde la 18.2 con el costo y el margen (FR-PROD-21). **Es la única diferencia de esta lámina que vale como mejora y no tiene decisión en contra**: queda anotada para la 24.5.2-b, que es la que toca costo y margen |
| 25 | **«Ajuste por cantidad»** | No es de esta pantalla: el ajuste por cantidad es de un producto sin seguimiento por unidad y vive en Movimientos. La propia lámina lo aclara al pie |

**Resumen honesto**: de las 25 diferencias, 13 estaban decididas antes de implementar (D-1, D-2, D-5, D-11 y el alcance excluido), 7 son de pantallas o datos anteriores a esta subfase, 3 son datos que el modelo no tiene, y **2 son mejoras reales que la lámina propone y el sistema no da**: el enlace a la unidad existente cuando el IMEI está repetido (22) y decirle al `viewer` por qué no ve el costo (24). Las dos quedan anotadas para la 24.5.2-b. Ninguna se presenta como implementada.

## La revisión independiente del 2026-10-31 y qué se hizo con cada hallazgo

Veredicto **R2**: tres bloqueantes y diez no bloqueantes. El revisor tuvo **solo `Read`, `Grep` y `Glob`**: no corrió nada, así que todo lo que informó se verificó contra el código —y dos veces contra la ejecución— antes de aceptarlo. Un hallazgo resultó equivocado y se dice cuál.

| Hallazgo | Verificación | Qué se hizo |
|---|---|---|
| **B-1**. Archivos tocados fuera de la lista cerrada y ampliaciones sin registrar | **Real en parte**: `src/modules/inventory/repository.ts` se tocó **sin preguntar**, que es un cruce de la condición de detención 1; tres ampliaciones estaban acordadas pero no escritas. **Equivocado** en `.claude/settings.json`: es anterior a la subfase, no está versionado, y el usuario decidió dejarlo | Las cuatro ampliaciones registradas con su fecha; `repository.ts` autorizado **retroactivamente** por el usuario y marcado como tal; la precaución nueva anotada: antes de pedir la revisión, comparar los archivos tocados contra la tabla, uno por uno |
| **B-2**. La rama que anuncia «no pudimos leer las unidades» es inalcanzable | **Real**, y es **el mismo defecto que el B-3 de la 24.5.1**: la página ya había leído el producto, y un error de base lanza en vez de volver como `Failure` | `list-data.ts` nuevo, con el `catch` en la capa de composición y la lectura inyectada, más cinco pruebas. **Mutación demostrada**: sin el `catch`, dos pruebas fallan |
| **B-3**. Ninguna prueba llama a `listUnitAudit` ni a `listUnitMovements` | **Real**: la frontera de roles de D-10 no tenía prueba de servicio | Cuatro pruebas de integración nuevas, con el fixture armado por los casos de uso reales. **Mutación demostrada**: al quitar `{ role: "admin" }` del `authorize`, falla **exactamente** la del `viewer` |
| **N-1**. El recorte del historial estaba mitigado solo para los movimientos | Real: el `total` de la auditoría se descartaba, así que 26 entradas se veían como 25 completas | El aviso de recorte cubre las dos fuentes, con su prueba |
| **N-2**. Las otras cuatro acciones de auditoría se dibujaban como «cambio de estado» y sin dato | Real: `update`, `price_change`, `cost_change` y `create` caían en la misma rama | Cada acción con su etiqueta y sus campos; pruebas por acción |
| **N-3**. El comentario de mutación de `unit-repository.ts` atribuía mal lo que la mutación prueba | Real. **Medido hoy en los dos sentidos**: al borrar el filtro fallan **dos** de las tres pruebas, no tres, y ninguna de las 29 de `units.test.ts` | Comentario corregido en `unit-repository.ts`, y uno nuevo en `findUnitMovements` con su propia medición: borrar **ese** filtro hace fallar **una sola** prueba. Cada filtro tiene su prueba y ninguna cubre al otro |
| **N-4**. La enumeración de §Situación tenía dos errores | Real, y pesa porque AC-4 pide justamente enumerar bien | Corregida dos veces |
| **N-5**. `writeOffReasonFrom` quedó sin uso al mover el motivo al panel | Real | Retirada, con un comentario donde estaba que explica por qué |
| **N-6**. AC-13 no estaba cubierto **dentro** del panel | Real: se medían los 320 px y los 44 px de la lista, y el criterio dice «en la lista y en el panel». El panel tiene su propio `sr-only`, que es la clase de elemento de H-15 | Bloque nuevo en la prueba del panel: desbordamiento a 320 px con el panel abierto, y el alto de las dos pestañas y de «Cerrar» **medidos** del navegador |
| **N-7**. La prueba de aislamiento del recuento por estado pasaría con el filtro por organización borrado | Real, por el mismo motivo que las otras: el servicio devuelve `NOT_FOUND` antes de que la consulta corra | Prueba nueva contra el repositorio, en `organization-isolation.test.ts` |
| **N-8**. Una tercera forma de nombrar al autor de una entrada de auditoría | Real | El panel recibe la etiqueta ya resuelta por `auditActorLabels`, la misma que el resto de las vistas de auditoría |
| **N-9**. AC-9 pedía el pendiente y el acceso a su checklist, y nadie lo había comprobado | **El código lo cumplía**: la celda de estado compone la orden de servicio de cada unidad, en cualquier estado. Lo que faltaba era la prueba | Aserciones nuevas en `repairs-own-units.spec.ts`: la unidad en revisión muestra «Orden OS-000001», y el chip de «En revisión» la lista con su orden |
| **N-10**. Un `?unidad=` que no resuelve no dibujaba nada y no decía nada | Real, y al verificarlo apareció **un segundo caso que el hallazgo no nombraba**: `getUnit` resuelve por id dentro de la organización, así que un `?unidad=` de **otro producto** abría el panel con una unidad ajena a la lista que se está mirando | El panel exige que la unidad sea de este producto, y si `?unidad=` no resuelve la pantalla **lo dice**, con la vuelta a la lista. Mensaje propio: la lectura salió bien, así que no es «no disponible» |

**Lo que esta revisión deja como lección, y no es el recuento de hallazgos.** B-2 es el defecto de la 24.5.1 repetido en la misma subfase, en la lista, mientras se hacía bien en el panel, a diez líneas de distancia —y con la nota del vault que lo nombra entre las que este brief se obliga a tener a la vista. Tenerla a la vista no alcanzó. Lo que sí lo encontró fue leer el código buscando una **forma reconocible**: una rama de error que ningún camino alcanza. Eso es buscable, no intuible.

## Situación en la fase

- **Necesario ahora**: el panel, el historial, el motivo de la baja, el filtro y la separación de estados. Cierran la primera diferencia declarada de la 24.5.1 y la tarea que viene arrastrándose desde la 29.6.2.
- **Requisito antes de producción**: las dos mediciones y la revisión independiente.
- **Mejora posterior**: el enmascarado del IMEI (P-1), el valor de inventario de toda la organización (P-2), la edición de la unidad con varios IMEI y la selección múltiple con su barra de acciones.

Después de esta subfase y de 24.5.2-b viene **24.5.3 — Modelos y grados**, que conserva su número y su tarea de Notion.

## Cierre

*Escrito el 2026-10-31.*

### Qué quedó hecho

La pantalla de Unidades es **una sola lista**: chips por estado con su cantidad, búsqueda por sufijo de IMEI de cuatro caracteres o más, paginación de 25, y todo por la URL y sin JavaScript. Reemplaza las cinco secciones fijas que filtraban en memoria sobre todas las unidades del producto; lo que cada una aportaba vive en la columna **Estado**, que lleva la insignia y el pedido, la venta o la orden de servicio de la unidad. **`in_repair` e `in_review` son dos estados con dos chips distintos**, y los tres contadores del Resumen son enlaces a esta lista filtrada: era la primera diferencia que la 24.5.1 declaró y dejó pendiente.

Al tocar una unidad se abre su **panel**, con **Detalle** e **Historial** como dos enlaces reales. El Historial une **dos fuentes en memoria** —los movimientos de stock, que ven los dos roles, y los cambios de estado de la auditoría, que **solo ve un `admin`**—, y ahí aparece por fin **el motivo de la baja de una unidad en revisión**, que existía solo en `audit_logs` y ninguna pantalla leía desde la 29.6.2. Si una de las dos fuentes no se pudo leer, se dice, y **nunca se dibuja «sin eventos»** en su lugar.

Por dentro: tres lecturas nuevas (`listUnitAudit`, `listUnitMovements` y la forma paginada de `listProductUnits`), el filtro por organización en SQL en cada una, la composición de las dos fuentes fuera de los módulos, y **ninguna migración, tabla ni columna nueva** (67 migraciones, las mismas).

### Nivel de validación alcanzado

Con el vocabulario del proyecto, y **sin inferir un nivel de otro**:

- **Validado localmente**: las funciones puras —los filtros de la URL, la composición del historial, la lectura de la lista— y las lecturas nuevas contra PostgreSQL real. 2.183 pruebas de `unit` y `guards`; la batería de `integration` con 1.884 pruebas, **con la salvedad de O-3**: un archivo ajeno a esta subfase no llegó a correr por una caída de worker y se verificó aparte.
- **Validado en integración, con el alcance exacto de lo que corrió**: los recorridos de `units.spec.ts` —18 pruebas, incluidas la lista con filtro, búsqueda, paginación, 320 px y 44 px medidos; el panel con los dos motivos de baja y el caso del `viewer`; y el describe sin JavaScript— y los de `repairs-own-units.spec.ts`, contra el build de producción, con Server Actions y PostgreSQL real. **Con una precisión que conviene no redondear**: 17 de esas 18 pasaron en la corrida anterior al arreglo de O-4, y la prueba del panel —la que encontró los 38 px— pasó en una corrida posterior, sola. El archivo entero no volvió a estar verde **en una sola corrida** después de ese arreglo, que agrega dos clases de alto mínimo y nada más.
- **La batería end-to-end completa NO está corrida sobre estos cambios.** Se lanzó y **la detuvo el entorno por falta de memoria** en la prueba 60 de 298: 59 pasadas, el resto no corrió, y los fallos que figuran en el log son `Target crashed` y `worker process exited unexpectedly`, no aserciones. **No cuenta como evidencia de nada**, ni a favor ni en contra. Lo que la cubre es AC-17: la batería entera en la CI, sobre Linux y sobre el SHA que se despliega, que es además el gate que el brief fijó.
- **Y el gate sirvió.** La primera corrida de CI, la del commit `dba970c` (run 41249814697), volvió **`failure`**: 334 pruebas pasadas y **una fallada**, `trade-ins.spec.ts`, que afirmaba sobre el formato de fila que D-11 elimina. Un cuarto archivo roto por el mismo motivo que los otros tres, y el único que la enumeración previa no alcanzó. Corregido con autorización del usuario en el turno, y anotado arriba, en §Archivos autorizados. **La batería local no lo habría encontrado**: se había detenido en la prueba 60 de 298, y esa corre mucho después.
- **No alcanzado todavía al escribir esto**: validado en staging y preparado para producción. AC-17 (la batería entera verde **en la CI sobre el SHA que se despliega**) y AC-18 (desplegada y recorrida por el usuario) quedan pendientes. Cumplirlos **no mueve el nivel a «preparado para producción»**, que además pide seguridad, observabilidad, backups probados y rollback: eso se evalúa por fase, no por subfase.

Las mediciones de D-9 son **evidencia de rendimiento sobre una base sembrada**, no sobre datos reales, y su base no tiene la intercalación de producción: está declarado junto a los números.

### Las tres mutaciones que el brief exigía, y lo que probó cada una

| Mutación | Qué falla | Qué prueba |
|---|---|---|
| Quitar el `catch` de `list-data.ts` | 2 pruebas de `list-data.test.ts` | Que la rama que anuncia «no pudimos leer» **se alcanza** (AC-10, I-2) |
| Quitar `{ role: "admin" }` de `listUnitAudit` | **solo** la prueba del `viewer` | Que la frontera de roles de D-10 la sostiene el servicio, no la pantalla |
| Borrar el filtro por organización de `unitConditions` | 2 de las 3 de `organization-isolation.test.ts`, y **ninguna** de las 29 de `units.test.ts` | Que el `where` se prueba donde es observable (AC-11) |
| Borrar el filtro por organización de `findUnitMovements` | **1 sola**, la de los movimientos | Que cada filtro tiene su prueba y ninguna cubre al otro (N-3) |

La cuarta fila no estaba en el brief: salió de corregir el comentario mal atribuido que encontró N-3, y es la que convirtió una afirmación en una medición.

### Lo que esta subfase deja anotado para la 24.5.2-b

- **La tabla necesita desplazamiento horizontal a 1440 px** con sus ocho columnas más las acciones (diferencia 8 de AC-15). Es consecuencia directa de D-11 y no se recortó nada acá, porque cada columna venía de una sección eliminada.
- **Al `viewer` no se le dice por qué no ve el costo** (diferencia 24). La lámina 15 propone decirlo; el proyecto lo omite en silencio desde la 18.2.
- **El enlace a la unidad existente cuando el IMEI está repetido** (diferencia 22), que es del formulario de alta.
- El enmascarado del IMEI sigue pidiendo un ADR, y el valor de inventario por organización sigue fuera.

### Lo que no se arregló acá, y por qué

Cuatro observaciones de entorno, las cuatro ajenas a esta subfase y las cuatro declaradas arriba: **O-1** (el resultado de una prueba depende de la consola que lanza el runner), **O-2** (`format:check` y `eslint` locales fallan por archivos de otra fase y por una skill de terceros), **O-3** (la batería salió con código 0 con un archivo que no corrió) y **O-4** (`secondaryButtonClass` da 38 px en todo el proyecto). Ninguna se tocó: las cuatro cruzan archivos de otras fases o configuración de herramientas, y entrarían a esta subfase por la puerta que la condición de detención 1 prohíbe.

## Lo que encontró el recorrido del usuario (AC-18), el 2026-11-01

El recorrido en producción encontró **cuatro cosas**. Tres son defectos míos; la cuarta es una diferencia que yo había declarado como aceptada y el usuario decidió al revés. Las cuatro están corregidas.

### 1. El rótulo de la búsqueda tocaba el campo

El `div` que envuelve `label` e `input` no tenía `flex flex-col gap-1`, así que el `label`, que es en línea, quedaba pegado al campo. La búsqueda de Clientes, de la 24.4.2, ya lo hacía bien y esta pantalla no lo copió. Una línea.

### 2. El panel no se encontraba, y la causa no era el panel

El usuario recorrió la pantalla y **no encontró Detalle e Historial**. El panel funcionaba —las pruebas lo abren y lo recorren—, y ese es justamente el punto: **una prueba que sabe dónde hacer clic no mide si se encuentra**.

El IMEI abría el panel, pero estaba pintado con `secondaryLinkClass`: una caja con borde, **idéntica a los cinco botones de acción de la misma fila**. Entre seis cajas iguales, nada decía cuál lleva a algún lado. Ahora es `linkClass` —violeta y subrayado—, y además «Ver unidad» es el primer ítem del menú de la fila.

**Lo que esto deja como lección**: la cobertura de una prueba de recorrido y la descubribilidad son cosas distintas, y ninguna implica la otra. AC-5 pedía que el panel se abriera por la URL y eso se cumplía; nadie había escrito un criterio que dijera que **se tiene que poder encontrar**.

### 3 y 4. Cinco botones por fila, y el desplazamiento horizontal que provocaban

Un `admin` veía hasta **cinco** cajas por unidad: Corregir, Mandar a reparar, Dar un turno, Días de garantía y Dar de baja. Eso es lo que empujaba la tabla más allá de la ventana, que es la **diferencia 8 de AC-15**: yo la había declarado como consecuencia aceptada de D-11 y no la toqué. El usuario decidió lo contrario, y tenía razón por un motivo que yo no había mirado: **la lámina 10 no tiene cinco botones por fila, tiene un «···»**, y el proyecto ya tenía ese patrón resuelto desde la 24.1 (`MoreActions`, D-8: las acciones menos frecuentes y las destructivas salen de la fila principal). La tabla de clientes lo usa desde la 24.4.2, con «Ver ficha» como primer ítem.

Las acciones pasan a un menú «···» por fila, con «Ver unidad» primero y «Dar de baja» último en rojo. `floating` —que la 24.4.2 agregó porque dentro de una tabla que se desplaza el menú se recortaba— y **sin JavaScript la lista queda a la vista**, así que la pantalla sigue andando sin scripts.

Con eso solo no alcanzaba. Medido, comparando la tabla contra su contenedor:

| Ventana | Antes | Con el menú | Con el menú y sin Origen ni Alta |
|---|---|---|---|
| 1440 | se desplaza | **entra** | **entra** |
| 1280 | se desplaza | se desplaza (1006 contra 910) | **entra** |
| 1024 | se desplaza | se desplaza | se desplaza (812 contra 654) |
| 320 | — | sin desbordar el documento | sin desbordar el documento |

Por decisión del usuario, **Origen y Alta salen de la tabla**: 194 px, y las dos ya estaban en el panel. No es un recorte arbitrario: **la lámina 10 tiene cinco columnas**, así que sacarlas acerca a la v2. De 1024 para abajo la tabla se sigue desplazando dentro de su contenedor, que es el comportamiento diseñado para pantallas chicas y lo que hace que a 320 px entre.

**Un dato que casi se pierde en el camino**: la columna Origen no era solo una etiqueta, llevaba **el enlace al comprobante del usado**. Al sacarla se habría ido con ella, porque el panel mostraba solo la etiqueta. El panel ahora recibe el origen ya compuesto y es el único lugar donde vive ese enlace; la prueba de `trade-ins` lo comprueba ahí.

### «Liberar a la venta», la acción que no era un enlace

Es la única acción de una unidad que es **un formulario y no un enlace**, y su botón vive en `forms.tsx`, que no estaba en la lista cerrada. Con su clase actual, adentro del menú se habría dibujado como un botón violeta macizo entre ítems de texto. **Se paró y se preguntó**, el usuario amplió la lista en el turno, y `ReleaseUnitForm` pasó a aceptar `className` e `icon`, con sus valores de siempre por omisión: sin pasarlos se comporta igual que antes, así que ningún otro llamador cambia.

Ahora las seis acciones están adentro del «···», sin excepciones, que es lo que hace que la columna sea un ícono y no una lista de cajas de ancho variable.

### Dos cosas que las pruebas enseñaron al adaptarlas

1. **El ayudante `sendToRepair` lo usan la prueba con JavaScript y la de sin.** Sin scripts la lista del menú ya está desplegada y su botón no hace nada, así que abrirlo siempre colgaba la prueba sin JavaScript. Ahora el menú se abre **solo si la acción no está ya a la vista**, y eso deja escrito en la prueba que las dos formas tienen que funcionar.
2. **Con el panel abierto hay dos de cada acción**: la de la fila y la del panel, que las comparten a propósito. Un localizador sin alcance resuelve a dos elementos y rompe por modo estricto. Es la quinta vez en esta subfase que el modo estricto encuentra una ambigüedad real en lugar de una molestia.

### Despliegue y recorrido

**Desplegada en producción el 2026-11-01 (UTC), en el SHA `704bbb8`.** Para volver atrás, `7311823`, anotado en `/var/lib/crm-production/despliegues` antes de desplegar.

El SHA desplegado **no es el de la implementación**: `dba970c` falló en la CI por la aserción de `trade-ins.spec.ts`, y lo que se despliega es el commit que la corrige, con su propia corrida verde. AC-17 pide CI en `success` sobre el SHA que se despliega, y eso es lo que hay: **run 41253997942, `success`, 23 minutos**, con las tres baterías y los 335 end-to-end.

Verificaciones del runbook, corridas después del despliegue:

| # | Paso | Resultado |
|---|---|---|
| — | Servicio y versión | `active`; HEAD del servidor igual al SHA pedido |
| — | Migraciones | **67**, ninguna nueva |
| 1 | Configuración desplegada igual a la versionada | **18 de 18** archivos idénticos, y `deploy/production/` tiene 18 |
| 2 | Un solo salto de proxy | **NO SE CORRIÓ** (ver abajo) |
| 3 | HSTS | presente sobre HTTPS (`max-age=31536000; includeSubDomains`), ausente sobre HTTP, que redirige con `301` |
| 4 | La aplicación escucha solo en loopback | `127.0.0.1:3000`; nginx en `:80` y `:443` |
| 5 | El rol de la aplicación no es el dueño | aplicación `crm_app_login`, dueño de la base `crm_owner` |
| 6 | Ingestión y lectura desde afuera | los tres endpoints en **`401`**, como corresponde con la ingestión encendida para un emisor |
| 7 | Ningún dato real de un cliente | «Vixora» en **0 clientes, 0 mensajes, 0 productos**; las otras dos son de demostración |

Journal desde el despliegue: **ninguna advertencia sin explicación**. Hay una, `Failed to kill control group … Invalid argument`, del `systemctl stop` previo al build, y es la que systemd emite al detener un servicio cuyo grupo ya se vació; y tres `UNAUTHENTICATED` que son **las tres sondas del paso 6**, con sus `request_id`.

**El paso 2 queda otra vez sin correr, y se declara igual que en la 24.5.1**: comprobar el salto único de proxy exige un ingreso fallido **desde el navegador**, porque `curl` no deja la fila en `login_attempts`. La comparación byte a byte de `nginx-crm-production.conf` del paso 1 cubre la configuración, pero eso es indirecto y **no sustituye la medición por consecuencia**. Es la segunda subfase seguida con esta verificación de menos: conviene resolverlo con un procedimiento propio en vez de arrastrarlo. *Corregido el 2026-11-01, más abajo*: la razón que da este párrafo —que `curl` no puede dejar la fila— es **falsa**, se midió que sí puede, y el paso se corrió ese día con su control negativo.

**Recorrido del usuario (AC-18)**: pendiente al escribir esto.

### Segundo despliegue: las correcciones del recorrido, el 2026-11-01

**Desplegado en producción el 2026-11-01 (UTC), en el SHA `0641393`.** Para volver atrás, `704bbb8`, anotado en `/var/lib/crm-production/despliegues` antes de desplegar.

AC-17 sobre ese SHA: **run 41269461279, `success`**, con los **335 end-to-end en 20,8 minutos**. Se comprobó además que `0641393` fuera el `refs/heads/main` del remoto, porque el servidor hace `git fetch` y necesita alcanzarlo.

| # | Paso | Resultado |
|---|---|---|
| — | Servicio y versión | `active` desde las 04:33:23 UTC; HEAD del servidor igual al SHA pedido |
| — | Migraciones | **67**, ninguna nueva |
| 1 | Configuración desplegada igual a la versionada | **18 de 18** archivos idénticos, y `deploy/production/` tiene 18 |
| 2 | Un solo salto de proxy | **CORRIDO Y CUMPLIDO**, con su control negativo (ver abajo) |
| 3 | HSTS | presente sobre HTTPS (`max-age=31536000; includeSubDomains`), ausente sobre HTTP, que redirige con `301` |
| 4 | La aplicación escucha solo en loopback | `127.0.0.1:3000` |
| 5 | El rol de la aplicación no es el dueño | `DELETE FROM audit_logs` con la conexión de `app.env` → `ERROR: permission denied for table audit_logs` |
| 6 | Ingestión y lectura desde afuera | los tres endpoints en **`401`** |
| 7 | Ningún dato real de un cliente | «Vixora» en **0 clientes, 0 mensajes, 0 productos**; «Demostración Vixora» 2/130/13 y «iPhone Demo» 2/148/38, las dos de demostración |

Journal desde el despliegue: una sola advertencia, `Failed to kill control group … Invalid argument`, la del `systemctl stop` previo al build. **Está explicada y es recurrente**: 17 apariciones en 20 días, y ya figura en el brief de la 17.4. Las demás advertencias del período son del 20 de octubre, de los incidentes de memoria de la 29.5 y la 29.6.

#### El paso 2, por fin medido — y la razón por la que no se corría era falsa

Se corrió por primera vez desde la 24.5.0. Resultado: la fila más reciente de `login_attempts` con `scope='ip'` tenía **25 segundos** de antigüedad, era **la única** en la ventana de 15 minutos —así que no hay una fila vieja dando un «iguales» sin probar nada— y su `key_hash` **coincide** con el `sha256` de la IP pública del operador, y **no** es el `sha256` de la constante `'sin-proxy'` que `service.ts:126` usa cuando no recibe IP. El control negativo que el runbook pide se ejecutó: un segundo intento por un túnel SOCKS (`ssh -f -N -D 1080`), comprobando antes que la IP de salida fuera distinta, dejó una **segunda clave distinta**. Dos intentos, dos IP, dos claves. H-3 no se reproduce.

Nada de esto se versiona salvo el veredicto: ni la IP ni su hash entraron en un comando impreso, en un archivo ni en esta nota. La comparación se hizo dentro de la shell y lo único que salió fue «iguales» o «distintos».

**Corrección a lo que dijeron la 24.5.1 y la tabla de arriba.** Las dos justificaron el paso sin correr diciendo que la medición «exige un ingreso fallido **desde el navegador**, porque `curl` no deja la fila en `login_attempts`». Eso es **falso**, y haberlo creído costó tres subfases de verificación de menos:

- El formulario de ingreso funciona **sin JavaScript** —es una decisión del proyecto, con pruebas que la cubren—, así que su marcado trae los campos ocultos que un navegador sin scripts envía: `$ACTION_REF_1`, `$ACTION_1:0` con el id de la acción, `$ACTION_1:1` y `$ACTION_KEY`. Se leen del HTML que el propio servidor sirve a un cliente sin sesión.
- Con esos cuatro campos más `email` y `password`, un `POST` `multipart/form-data` de `curl` ejecuta la Server Action igual que el navegador: devolvió `200` con «Email o contraseña incorrectos» y **dejó la fila**.
- El intento de hacerlo por el navegador fue justamente lo que destapó el error: el Chrome del usuario tiene sesión abierta, así que `/login` redirige al panel. El camino «desde el navegador» no solo no era necesario: era el **más difícil** de los dos, y pedía cerrar la sesión del usuario en producción.

La lección es la que el proyecto ya aprendió en otra forma: **una precaución que nadie volvió a medir se convierte en una limitación inventada**. El runbook decía «un `POST` suelto de `curl` no genera el intento», que es verdad para un `POST` suelto, y de ahí se concluyó que ningún `curl` podía. Hay que corregir esa frase del runbook de staging y la del de producción.

Se usó `prueba@ejemplo.invalid` con `contrasena-falsa-2026`, los valores que el runbook fija. Son dos literales públicos que no autentican a nadie: el propósito del paso es que el ingreso **falle**. Gastaron 2 de los 20 intentos por IP y 2 de los 5 por cuenta de una dirección inexistente, en una ventana de 15 minutos.
