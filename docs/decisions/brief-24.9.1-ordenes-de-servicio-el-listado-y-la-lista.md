# Brief 24.9.1 — Órdenes de servicio: el listado y la lista de reparaciones

**Estado: aprobado el 2026-11-17.** Preparado ese mismo día con la skill
`planning-and-briefing-phases`, y **las siete decisiones D-1 a D-7 quedaron cerradas en su opción
(a)** por decisión del usuario. **D-3 era la única con la recomendación condicionada** («si se
quiere la lámina entera»): se cierra en (a) por la regla vigente de que las pantallas de la Fase
24 se vean como los PNG de la v2, y porque el buscador es un control visible de la lámina 01, a
diferencia del filtro «Fecha», que el README del lote marca como mejora a confirmar. Tipo de tarea: `implementation` (rediseño de interfaz sobre un
dominio que ya existe completo), con una porción chica de lectura nueva.

**Esto no autoriza a implementar.** Aprobar este brief es aprobar su alcance y sus decisiones;
commit, push, despliegue y cambios en Notion siguen necesitando autorización en su turno.

## Objetivo

Llevar **el listado de órdenes de servicio** y **la lista de reparaciones** a la forma de las
láminas 01 y 06 del lote v2 [15-reparaciones](../ui-redesign/v2/15-reparaciones/README.md), con lo
que ya existe en el módulo `service` y **sin migraciones**. Lo que la fila 487 del Roadmap pide para
estas dos pantallas y hoy no está: el **próximo paso** de cada orden, las **cuatro tarjetas de
contadores** y la forma de las dos pantallas.

## Punto de partida verificado

Leído en el repositorio el 2026-11-17, no recordado:

- **La fila 487 del Roadmap** pide tres cosas: «Lista con próximo paso, contadores y filtro por
  técnico», «Ficha con presupuesto, entrega, unidad propia y reclamo» y «La lista de reparaciones».
  Lecturas nuevas: «Contadores y filtros».
- **La tarea de Notion** `407702be6f4e81e79461d7af3fe70237` está en «Esperando» y agrega: «La
  garantía se deriva, nunca se guarda (brief-29.9 D-2). Sin migraciones. Necesita su brief».
- **El dominio ya está entero.** `src/modules/service/` son **6.229 líneas** en 15 archivos, con
  `listServiceOrders`, `countServiceOrders`, el filtro `open` por tipo de orden, los precios por
  modelo, los tipos de reparación y la garantía. Esta subfase **no agrega reglas de negocio**.
- **La interfaz son 4.635 líneas en 16 archivos** bajo `src/app/(autenticado)/reparaciones/`.
- **El filtro por técnico ya existe** desde la 24.8.2-b (D-5), en `filters.ts`: es a donde lleva «Ver
  reparaciones» de la ficha del proveedor.
- **La batería**: `tests/e2e/repairs.spec.ts`, 494 líneas, 6 pruebas, 14 `expectAccessible`, un caso
  sin JavaScript y **una sola medida de ancho (375 px)**.
- **Producción** corre `4e282e2` con **67 migraciones**; el repositorio, `2a3d1e0`.

## Las fronteras entre módulos, releídas con `grep`

Releídas hoy aunque ya estuvieran en contexto, porque la subfase toca acceso a datos:

- `tests/guards/service-dependencies.test.ts` fija que `service` importa solo de `catalog`, `crm`,
  `inventory`, `purchasing`, `sales`, `numbering`, `organizations` y `audit`, y que **solo `cash` y
  `tradeins` importan `service`**. Los contadores leen `service_orders`, la tabla del propio módulo:
  **ninguna dependencia nueva**, y la guarda no se toca.
- `docs/architecture/Overview.md` (§módulos y §dependencias) coincide: `service → sales`,
  `service → purchasing`, `tradeins → service`, `cash → service`, sin ciclos.
- La pantalla del listado ya importa `listTechnicians` de `purchasing`: es la **capa de pantallas**,
  que las guardas no cuentan como dependencia entre módulos.
- `tests/guards/capability-reads.test.ts` solo vigila `organization_capabilities`. Las dos pantallas
  siguen detrás de la capacidad `repairs` con 404, como hoy.

**Ninguna contradicción entre documentos de arquitectura y el diseño aceptado.** Las que aparecieron
son entre las láminas y decisiones ya tomadas del proyecto, y están abajo.

## Hallazgos que condicionan el alcance

### H-1 · La fila entera es más grande que la que ya obligó a partir una subfase

Medido: **4.635 líneas en 16 archivos**. La 24.8.2-b partió su fila con D-1 porque «las cuatro
pantallas ya son 2.912 líneas en 18 archivos, el tamaño de la 24.8.2 entera». Acá es **1,6 veces
eso**, y las dos últimas subfases de código cerraron con 3.594 y 3.070 inserciones.

Por bloque: el listado y la lista de reparaciones son **1.278 líneas** en 6 archivos; la ficha y sus
flujos —`[serviceOrderId]/`, `nueva/`, `reclamo/`, `actions.ts`, `messages.ts`— son **3.357**. Lo
decide **D-1**.

### H-2 · De los tres puntos del primer bullet, uno ya está hecho

El **filtro por técnico** entró con la 24.8.2-b (D-5). Falta el **próximo paso** y faltan los
**contadores**. La fila no lo dice porque se escribió antes.

### H-3 · Tres de los cuatro contadores no son el filtro de estado, y uno necesita un predicado nuevo

El README del lote define los cuatro:

| Tarjeta | Qué cuenta | Qué hay hoy |
|---|---|---|
| **En curso** | cliente/reclamo sin terminar y propias que siguen en el técnico | **existe**: es exactamente el filtro `open`, que ya distingue por tipo (`OPEN_SERVICE_ORDER_STATUSES`, `OPEN_OWN_UNIT_STATUSES`, `OPEN_WARRANTY_CLAIM_STATUSES`) |
| **Para presupuestar** | equipos de cliente en el técnico **sin presupuesto guardado** | **falta un predicado**: `ServiceOrderListQuery` no sabe filtrar por «sin presupuesto» |
| **Listas para entregar** | reparadas de cliente/reclamo, **nunca** unidades propias | se arma con `statuses` + `kind`, sin nada nuevo |
| **Garantías abiertas** | reclamos abiertos | se arma con `open` + `kind`, sin nada nuevo |

El README además exige que los contadores **respondan a los filtros** y **no se calculen sobre una
página**. El molde ya existe en el proyecto: `getConversationCounts` (brief-24.3, D-1 y D-3) recibe
los filtros **menos el estado** y cuenta sobre toda la organización. Lo fija **D-2**.

### H-4 · La lámina dibuja «Técnicos» en la navegación lateral, y esa pantalla se descartó hoy

La lámina 01 muestra, bajo «Servicio técnico», «Reparaciones» y **«Técnicos»**. Esa pantalla era la
**24.8.2-c**, **descartada el 2026-11-17 por decisión del usuario**. El brief de la 24.8.2-b ya
había escrito que «con ella se va la entrada de navegación». **No se agrega**, y queda como
diferencia declarada y no adoptada (V-4).

### H-5 · El estado de la lámina es un punto de color, y el proyecto decidió lo contrario

La lámina usa un círculo de color más el texto. El proyecto fijó en la 24.1 (D-6) que **el estado
nunca depende solo del color: lleva ícono y texto**, con la insignia compartida, y `sub-nav.tsx` ya
tiene el mapa de íconos por estado. Se conserva la insignia del proyecto (V-5).

### H-6 · El buscador de la lámina busca tres cosas y el de hoy busca una

Hoy el campo busca **solo por número** (`parseServiceOrderNumberSearch`). La lámina dice «Buscar
orden, cliente o equipo…». Eso es una **lectura nueva** sobre `service_orders` con `JOIN` a clientes
o un `ILIKE` sobre el modelo. Lo decide **D-3**.

### H-7 · El filtro «Fecha» no existe, y el README del propio lote lo marca como a confirmar

La lámina tiene un cuarto filtro, «Este mes». El README del lote dice que «filtros combinados,
métricas, paneles… son mejoras de UX cuya persistencia y soporte deben confirmarse». Lo decide
**D-4**.

### H-8 · El «⋯» del encabezado no tiene contenido declarado en ninguna fuente

Ni la lámina ni el README dicen qué hay adentro. El proyecto ya decidió dos veces que un menú «Más»
se dibuja **solo cuando tiene algo que ofrecer** (24.1 y 24.8.2-b, D-8). Lo decide **D-5**.

### H-9 · La lista de reparaciones ya tiene las tres secciones; la lámina las vuelve pestañas

`lista/page.tsx` apila hoy tres `<h2>`: «Precios por modelo», «Tipos de reparación» y «Garantía de
las reparaciones». La lámina 06 las dibuja como **pestañas**. El proyecto ya resolvió esta misma
pregunta en la ficha del proveedor (24.8.2-b, D-4): **pestañas por URL**, que andan sin JavaScript.
Lo confirma **D-6**, para no inventar una forma nueva.

### H-10 · El panel «Editar precio» ya existe, con otra forma

La edición de un precio ya abre por URL (`?editar=<id>`). La lámina la dibuja como **panel lateral**
con moneda e importe para el cliente y para el técnico, más el aviso «Se propone al armar nuevas
órdenes. No modifica presupuestos ya guardados.». Es trabajo de forma, no de dominio, y el aviso es
verdadero hoy: cambiar la lista no toca presupuestos guardados.

### H-11 · `Screens.md` no tiene sección para ninguna de las dos pantallas

El documento llega hasta **§59** y no documenta Reparaciones: solo la nombra al pasar en las reglas
comunes y en la ficha del cliente. Las demás pantallas de la Fase 24 enmendaron su sección; estas
dos **no tienen una que enmendar**. Lo decide **D-7**.

### H-12 · La columna de importe cambia de nombre y de significado para los vacíos

Hoy se llama **«Presupuesto»**. La lámina la llama **«Importe al cliente»** y usa **tres textos
distintos** para la ausencia, que el README prohíbe explícitamente reemplazar por cero: «Sin
presupuesto», «No aplica» (unidad propia) y «Sin cargo al cliente» (reclamo).

### H-13 · La batería no tiene barrido de reflujo, igual que las de la 24.8.2-b

`repairs.spec.ts` mide **un solo ancho (375 px)**. Es el mismo hueco que la 24.8.2-b registró en su
H-8 y cubrió con el caso de `goods-receipts.spec.ts`.

## Diferencias con la v2, declaradas antes de implementar

| id | Lámina | Diferencia | Qué se hace |
|---|---|---|---|
| **V-1** | 01 | La tabla de la lámina **no tiene columna «Fecha»**; la de hoy sí | **Se adopta la lámina**: la fecha sale de la tabla y queda en la ficha y en la actividad |
| **V-2** | 01 | «Importe al cliente» en lugar de «Presupuesto», con tres textos para el vacío (H-12) | Se adopta |
| **V-3** | 01 | Columna **«Próximo paso»**, que hoy no existe | Se adopta: es derivación pura de estado y tipo, **sin lectura nueva** |
| **V-4** | 01 | «Técnicos» en la navegación lateral (H-4) | **No se adopta**: la 24.8.2-c está descartada |
| **V-5** | 01 | El estado como punto de color (H-5) | **No se adopta**: insignia con ícono y texto (24.1, D-6) |
| **V-6** | 01 | Filtro **«Fecha»** (H-7) | **No se adopta** (D-4): queda declarado como mejora posterior |
| **V-7** | 01 | Buscador por orden, cliente o equipo (H-6) | **Se adopta** (D-3), con la lectura medida |
| **V-8** | 01 | Menú **«⋯»** sin contenido declarado (H-8) | **No se adopta** (D-5): no se dibuja un menú vacío |
| **V-9** | 01 | «Lista de reparaciones» como **botón del encabezado** | Se adopta, **además** de la sub-navegación que ya existe |
| **V-10** | 01 | Pie con «Los importes no se suman entre tipos de orden.» | Se adopta: el README lo pide explícitamente |
| **V-11** | 06 | Las tres secciones como **pestañas** (H-9) | **Se adopta** (D-6): pestañas por URL, sin JavaScript |
| **V-12** | 06 | **Panel lateral** «Editar precio» (H-10) | Se adopta sobre la URL que ya existe |
| **V-13** | 06 | **Candado** en «Costo estimado del técnico» | Se adopta como marca de lectura de `admin`; el `viewer` **no recibe el dato**, no lo recibe tachado |
| **V-14** | 06 | «Tipos activos» con chips y «Gestionar tipos» abajo | Se adopta dentro de la pestaña «Tipos de reparación» |
| **V-15** | 01 y 06 | El buscador global del encabezado dice tres textos distintos entre láminas | **No se adopta ninguno**: el buscador global es de la 24.2 y no se toca |
| **V-16** | 01 | El filtro **«Estado» aparece en «Todos»** | **No se adopta**: el listado abre en **«En curso»** por D-10 del [brief 29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md), que es una decisión aprobada sobre qué se ve al entrar. Cambiar el valor inicial escondería las órdenes abiertas entre las terminadas, que es justo lo que esa decisión evita |

*V-16 se agregó el 2026-11-17, al implementar el listado*: la lámina dibuja el control en «Todos» y
el proyecto decidió lo contrario. Se declara en vez de cambiar el valor inicial en silencio.

## Decisiones

**Las siete quedaron cerradas en (a) el 2026-11-17**, por decisión del usuario. Se conservan con
sus opciones escritas: lo que se descartó explica tanto como lo que se eligió.

### D-1 · ¿Qué entra en la 24.9.1? (H-1) — CERRADA en (a)

- **(a) El listado y la lista de reparaciones** —láminas 01 y 06—, y la ficha con sus flujos pasa a
  una **24.9.1-b** *(recomendada)*. Son 1.278 líneas en 6 archivos, el tamaño de una subfase de este
  proyecto. Las dos pantallas comparten la sub-navegación y el encabezado de sección, y **ninguna de
  las dos toca las acciones de transición**: se pueden rediseñar sin tocar `actions.ts`.
- **(b) La fila entera**, las nueve láminas de una vez. Mide 1,6 veces lo que ya se consideró
  demasiado una vez.
- **(c) Partir en tres**: listado / ficha / lista de reparaciones. Deja la lista de reparaciones sola
  en una subfase chica y la separa del listado, con el que comparte navegación.

Si se cierra en (a), al cerrar la subfase hay que **crear la 24.9.1-b** en el Roadmap y en Notion,
como hizo la 24.8.2-b, y la fila 487 queda nombrando láminas que esta subfase no toca: **la
discrepancia se declara acá y se corrige al cerrar**.

### D-2 · El ámbito de los cuatro contadores (H-3) — CERRADA en (a)

- **(a)** Responden a los filtros vigentes **menos el estado**, sobre toda la organización, con el
  molde de `getConversationCounts`; «Para presupuestar» suma un predicado «sin presupuesto guardado»
  a `ServiceOrderListQuery` *(recomendada)*. Es lo que pide el README y lo que el proyecto ya hace en
  la bandeja.
- **(b)** Fijos, sin responder a ningún filtro. Más barato y más fácil de malinterpretar: con el
  filtro de técnico puesto, los números hablarían de otra cosa que la tabla.

### D-3 · El buscador ampliado (H-6, V-7) — CERRADA en (a)

- **(a)** Entra: busca número, cliente y modelo, con la lectura medida *(recomendada si se quiere la
  lámina entera)*. *Enmendado el 2026-11-17, al implementar*: el usuario eligió **«número y equipo,
  sin cliente»** cuando se le elevó que la guarda `module-boundary` no deja que un archivo de
  `service` que no sea `schema.ts` importe el esquema de `crm`, así que el JOIN con la tabla de
  clientes que «buscar por cliente» necesita **no está disponible**, y la única búsqueda por nombre de
  `crm` —`searchClients`— está paginada y truncaría en silencio. **El buscador del listado encuentra
  por número de orden O por nombre del modelo del equipo**, y el criterio por cliente queda fuera:
  el buscador global (Ctrl+K) ya encuentra clientes desde la 24.2.
- **(b)** No entra: sigue siendo por número, se declara la diferencia y se deja como mejora
  posterior. El buscador global (Ctrl+K) ya encuentra una orden por número y por cliente desde la
  24.2, así que la pérdida es acotada.

### D-4 · El filtro «Fecha» (H-7, V-6) — CERRADA en (a): no entra

- **(a) No entra** *(recomendada)*: el README del propio lote lo marca como mejora a confirmar, suma
  una variante más a cada contador y la fila del Roadmap no lo pide.
- **(b)** Entra, con el rango en la URL y la lectura medida.

### D-5 · El menú «⋯» del encabezado (H-8, V-8) — CERRADA en (a): no se dibuja

- **(a) No se dibuja** *(recomendada)*: no hay contenido declarado y el proyecto ya decidió dos veces
  que un «Más» vacío no se dibuja.
- **(b)** Se dibuja con lo que haya; hay que decidir qué va adentro, y eso no está en ninguna fuente.

### D-6 · Las pestañas de la lista de reparaciones (H-9, V-11) — CERRADA en (a)

- **(a) Pestañas por URL** (`?seccion=precios|tipos|garantia`), como la ficha del proveedor
  (24.8.2-b, D-4): andan sin JavaScript, cada pestaña es una carga de página *(recomendada)*.
- **(b)** Se conservan las tres secciones apiladas y se declara la diferencia.

### D-7 · `Screens.md` y las dos pantallas (H-11) — CERRADA en (a)

- **(a)** Se agregan **dos secciones nuevas**, §60 «Órdenes de servicio» y §61 «Lista de
  reparaciones», con la forma de las demás *(recomendada)*: `Screens.md` es la fuente de verdad de
  producto y hoy no describe ninguna pantalla de Reparaciones.
- **(b)** No se toca, y las dos pantallas siguen sin estar documentadas.

## Alcance

### Incluido (si D-1 cierra en (a))

1. **El listado** con la forma de la lámina 01: encabezado con subtítulo y los dos botones, las
   **cuatro tarjetas de contadores**, la barra de filtros **con el buscador ampliado a orden,
   cliente y equipo** (D-3), la tabla con **Orden · Tipo y cliente ·
   Equipo · Estado · Próximo paso · Importe al cliente**, el pie con el aviso y la paginación que ya
   existe.
2. **El próximo paso**, derivado de estado y tipo, en un archivo propio con su prueba unitaria.
3. **Los contadores**, según D-2 —responden a los filtros vigentes menos el estado, sobre toda la
   organización, y «Para presupuestar» suma el predicado «sin presupuesto guardado»—, con su
   prueba y su medición.
4. **El buscador ampliado** (D-3): número, cliente y modelo, con la lectura medida.
5. **Las tarjetas móviles del listado** con tipo, estado y próximo paso. El README avisa que esta
   adaptación **no tiene lámina propia**.
6. **La lista de reparaciones** con la forma de la lámina 06: pestañas según D-6, selector de modelo,
   tabla con el candado del costo, panel lateral de edición sobre la URL que ya existe, «Tipos
   activos» y la configuración de garantía.
7. **La batería**, ampliada: el barrido de reflujo de AC-14 y los casos nuevos.
8. **La documentación** del cierre.

### Excluido

- **La ficha de la orden y todos sus flujos**: `[serviceOrderId]/`, `nueva/`, `reclamo/`,
  presupuesto, entrega, comprobante, unidad propia y reclamo. Láminas 02, 03, 04, 05, 08, 09, 10 y
  11. Pasan a la **24.9.1-b**.
- **`actions.ts`**: ninguna acción cambia. Si hiciera falta, es la condición de detención 2.
- **La pantalla «Técnicos»**: descartada el 2026-11-17 (H-4).
- **El buscador global y el marco de la aplicación**: son de la 24.1 y la 24.2.
- **Cualquier regla de dominio**: estados, transiciones, garantía, precios y permisos quedan como
  están.
- **Migraciones**: ninguna. Siguen 67.

## Lista cerrada de archivos

Tocar algo fuera de esta lista es un hallazgo bloqueante, no una mejora bienvenida. Ampliarla se
**pide antes de implementar**, no después.

**Pantallas** (`src/app/(autenticado)/reparaciones/`):

`page.tsx` · `filters.ts` · `filters.test.ts` · `messages.ts` · `sub-nav.tsx` · `next-step.ts`
(nuevo) · `next-step.test.ts` (nuevo) · `lista/page.tsx` · `lista/forms.tsx`

**Módulos** (`src/modules/service/`), solo lo que habilita D-2 y, si entra, D-3:

`service-orders.ts` · `repository.ts` · `index.ts` · un archivo de prueba de los contadores.

**Nada más de `src/modules/`.** `repair-list.ts`, `quote.ts`, `warranty-claims.ts`,
`own-unit-orders.ts` y `warranties.ts` **no se tocan**, y
`tests/guards/service-dependencies.test.ts` tampoco: si algo lo necesitara, es la condición de
detención 5.

**Pruebas**: `tests/e2e/repairs.spec.ts`.

**Documentación**: `docs/product/Screens.md` · `docs/decisions/README.md` ·
`docs/decisions/brief-24.9.1-ordenes-de-servicio-el-listado-y-la-lista.md` (este). Al cerrar, además,
`CHANGELOG.md`, `docs/planning/Roadmap.md` y `HANDOFF.md`, con autorización del usuario en su turno.

## Fuentes de verdad, en orden

1. El código y las migraciones de este repositorio.
2. `docs/architecture/DataModel.md` (`service_orders`, `service_order_lines`, `repair_types`,
   `repair_prices`) y `docs/analytics/MetricsCatalog.md`.
3. Los briefs aprobados que rigen acá: [29.6](brief-29.6-las-reparaciones-de-equipos-de-clientes.md)
   (D-10, la lista y sus filtros), [29.6.2](brief-29.6.2-las-reparaciones-de-unidades-propias.md)
   (D-7, el tipo), [29.9](brief-29.9-la-garantia.md) (D-1 y D-2, la garantía derivada),
   [24.1](brief-24.1-marco-y-patrones.md) (D-6, el estado con ícono y texto) y
   [24.8.2-b](brief-24.8.2-b-compras-proveedores-tecnicos-y-cuenta.md) (D-4, las pestañas por URL;
   D-5, el filtro por técnico; D-8, el menú «Más»).
4. El README del lote [15-reparaciones](../ui-redesign/v2/15-reparaciones/README.md) y sus láminas
   **01** y **06**.
5. Notion, solo para el estado de la fase.

Si dos fuentes se contradicen, la discrepancia se documenta antes de decidir cuál corrige a cuál.

## Invariantes

1. **Sin migraciones**: siguen 67.
2. **Ninguna regla de dominio cambia**: estados, transiciones, permisos, garantía y precios.
3. **Ninguna acción cambia de comportamiento**; ningún mensaje existente cambia de significado.
4. **La capacidad `repairs` sigue siendo la puerta**: sin ella, 404 en las dos pantallas.
5. **El `viewer` no recibe el costo del técnico**, ni en la tabla, ni en el panel, ni en el HTML.
6. **Todo anda sin JavaScript**: filtros, pestañas, panel, formularios y paginación.
7. **Los importes no se suman entre tipos de orden ni entre monedas**, y un importe ausente **nunca
   se dibuja como cero**.
8. **Los contadores no se calculan sobre la página** de resultados.

## Criterios de aceptación

| id | Criterio | Evidencia |
|---|---|---|
| **AC-1** | El listado tiene la forma de la lámina 01: encabezado, cuatro tarjetas, filtros, las seis columnas y el pie con el aviso | e2e |
| **AC-2** | **El próximo paso** es el de la lámina para los cinco casos dibujados —Entregar, Presupuestar, Enviar al técnico, Registrar reparación, Ver venta— y **no ejecuta la transición**: lleva a donde se hace | unitaria del derivador + e2e |
| **AC-3** | Los **cuatro contadores** dan el número correcto sobre un conjunto armado a mano, con órdenes de los tres tipos, incluidas entregadas, canceladas y propias reparadas que **no** deben contar | integración con fixture calculado a mano |
| **AC-4** | Los contadores **responden a los filtros** según D-2 y **no cambian** al pasar de página | e2e |
| **AC-5** | «Para presupuestar» cuenta **solo equipos de cliente en el técnico sin presupuesto guardado**: una orden presupuestada del mismo técnico no suma | integración |
| **AC-6** | El importe ausente dice **«Sin presupuesto», «No aplica» o «Sin cargo al cliente»** según el tipo, y **nunca** un cero | e2e, uno por tipo |
| **AC-7** | **El buscador ampliado** (D-3) encuentra la orden por **número, por cliente y por modelo**, no distingue mayúsculas, y **no devuelve nada de otra organización** | e2e + integración con dos organizaciones |
| **AC-8** | El estado se dibuja con **ícono y texto**, no solo con color (24.1, D-6) | e2e |
| **AC-9** | La **navegación no gana una entrada «Técnicos»** (H-4) | e2e sobre el marco |
| **AC-10** | La lista de reparaciones tiene la forma de la lámina 06, con las pestañas por URL de D-6, el panel de edición y el aviso de que no modifica presupuestos guardados | e2e |
| **AC-11** | Un **`viewer` no recibe el costo del técnico** en ninguna de las dos pantallas, tampoco por URL directa ni en el HTML | e2e + integración |
| **AC-12** | **Sin la capacidad `repairs`, 404** en las dos pantallas | e2e |
| **AC-13** | **Todo anda sin JavaScript**: filtros, buscador, pestañas, panel de edición, formularios y paginación | e2e con `javaScriptEnabled: false` |
| **AC-14** | **Reflujo medido** a **320, 375, 1.280, 1.440, 1.536 y 1.680 px**, comparando cada fila y cada tarjeta contra su contenedor, con `getBoundingClientRect` en el navegador (H-13) | el caso de `goods-receipts.spec.ts` replicado acá |
| **AC-15** | **Las lecturas nuevas, medidas** con `explain (analyze, buffers)` —los cuatro contadores y el buscador ampliado—, declarando el índice usado y si alguna recorre toda la tabla | medición pegada en el §Cierre |
| **AC-16** | **Comparación entrada por entrada con las láminas 01 y 06 abiertas**, declarando a qué ancho se hizo | tabla de diferencias en el §Cierre |
| **AC-17** | axe sin violaciones A ni AA en las dos pantallas, con el panel abierto y con un formulario rechazado | `expectAccessible` |
| **AC-18** | **Sin migraciones nuevas**: siguen 67 | la cuenta de los archivos de migración |
| **AC-19** | **La guarda `service-dependencies` sigue en verde sin que se la toque** | su corrida |
| **AC-20** | La batería completa en CI sobre el **SHA exacto**, leída por `headSha`, con «Corre todo: true» | la corrida citada |
| **AC-21** | **Revisión independiente** de un agente que no participó, contra este brief y contra las reglas vigentes | informe con veredicto |
| **AC-22** | Despliegue con las **siete verificaciones del runbook** y **recorrido del usuario** | journal y la palabra del usuario |

## Mediciones requeridas

1. **Los cuatro contadores**: `explain (analyze, buffers)` de cada uno, con y sin filtros puestos, y
   el índice declarado. `service_orders_status_idx` y `service_orders_list_idx` ya existen.
2. **El buscador ampliado** (D-3, cerrada en (a)): ídem, sobre una organización con muchas órdenes,
   declarando si el `JOIN` con clientes o el `ILIKE` sobre el modelo obliga a recorrer la tabla.
3. **El reflujo** en los seis anchos de AC-14, midiendo en el navegador y no razonando sobre la
   captura.
4. **El tamaño real del cambio**, con `git show --stat` contra la lista cerrada, **antes** de
   escribir el cierre.

## Condiciones de detención

El implementador **para y reporta**, sin seguir, cuando:

1. Una decisión **D-1 a D-7 no está aprobada** y el trabajo la necesita. **Las siete quedaron
   cerradas en (a) el 2026-11-17**, así que esto alcanza a cualquier decisión **nueva** que
   aparezca al implementar, no a las siete.
2. Haría falta **un archivo fuera de la lista cerrada**, en particular `actions.ts` o cualquier otro
   del bloque de la ficha. Se pide **antes** de tocarlo.
3. Aparece la necesidad de una **migración, una tabla, una columna o un contrato nuevo**.
4. Una lectura nueva **recorre toda la tabla** y la medición lo muestra.
5. Haría falta **tocar una guarda** para que algo pase.
6. Una lámina **contradice** un ADR, un brief aprobado o `Screens.md`: se documenta la discrepancia y
   se eleva, **nunca se resuelve en silencio**.
7. Antes de **commit, push, despliegue, cambios en Notion** o cualquier efecto externo: cada uno
   necesita autorización del usuario **en el turno**.

## Nivel de validación objetivo

**Validado en staging**, como las subfases hermanas de la Fase 24: pruebas deterministas en verde en
CI sobre el SHA exacto, revisión independiente, despliegue con las siete verificaciones del runbook y
recorrido del usuario. **No** «preparado para producción»: esta subfase no agrega datos, no cambia
reglas y no toca seguridad ni backups.

## Ubicación en la fase

- **Necesario ahora**: la forma de las dos pantallas, el próximo paso y los contadores. Es lo que la
  fila 487 pide y lo que falta para que Reparaciones se vea como el resto de la Fase 24.
- **Requisito antes de producción**: nada propio. Lo que la frena es su revisión y el recorrido.
- **Mejora posterior**: el filtro «Fecha», que D-4 dejó afuera; el objetivo táctil de 44 px y el desbordamiento del `<select>`, abiertos y
  medidos desde la 24.7.1 y la 24.7.2-b, que son **una subfase propia y todavía sin abrir**.

Después de esta subfase, la Fase 24 queda con **24.9.1-b** —que D-1 creó al cerrarse en (a)—,
**24.9.2 Usados**,
**24.9.3 Turnos** y **24.10 Información, horarios y usuarios**.
