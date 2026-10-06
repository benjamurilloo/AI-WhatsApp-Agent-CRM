---
schema: task-brief.v1
task_id: "15.2"
task_type: implementation
generated_at: 2026-10-05
---

# Brief: 15.2 — Controles de los listados

**Estado: aprobado el 2026-10-05 por el usuario, con las recomendaciones de D-1 a D-9.** Ese mismo día autorizó el commit de este brief y empezar la etapa 15.2.1. La aprobación no autoriza ningún commit, ningún cambio en Notion, ninguna dependencia nueva ni el despliegue a producción: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` (tests unitarios y de integración contra PostgreSQL real), `producer-consumer` (Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro) e `isolated-runtime` (la versión desplegada en producción, mirada por el usuario).
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**. No certifica «preparado para producción».
- **Orden**: tercera subfase de la Fase 15 en ejecución, después de la 15.1 y la 15.4 ([Roadmap](../planning/Roadmap.md), §Fase 15). Corre en paralelo con la 13.5.2-b: si la 13.5.2-b arranca, se pausa en el último punto con la CI en verde.

## Objetivo

Que los listados de Productos, Clientes y Conversaciones se puedan **ordenar** y mostrar **10, 25 o 50 filas por página**; que Productos se pueda **filtrar por categoría y por marca**; que los buscadores de Productos y de Clientes **sugieran lo que ya existe** mientras se escribe; y que las listas de sugerencias de los formularios (Marca y Categoría del producto, Categoría de la información) dejen la ventana nativa del navegador por un **componente propio** con el estilo del CRM. Todo sin tablas ni columnas nuevas, y funcionando sin JavaScript como hoy.

## Situación

La 15.2 se planificó al abrir la Fase 15 (orden y filas por página) y se amplió el 2026-10-05 dos veces: con los filtros y el autocompletar que el usuario pidió junto con los bocetos de las pantallas internas, y con el componente propio de sugerencias que pidió al ver la ventana nativa en producción (brief-15.4, §Resultados). Los filtros de Clientes que dependen de campos nuevos (tipo, provincia, segmento, etiqueta) son de la Fase 17.

## Hallazgos antes de diseñar

- **H-1. Productos y Clientes ordenan y paginan en memoria; Conversaciones, en la base.**
  - `listProductStock` lee todos los productos que cumplen el texto y la actividad, les suma el saldo, filtra por estado de stock, ordena por nombre y corta la página (`composeProductStockPage`).
  - `searchClientsByLastInteraction` pide a `crm` todos los ids en orden de nombre, los reordena por última interacción y pide los 25 de la página.
  - `findConversations` ordena por último mensaje con `ORDER BY … LIMIT … OFFSET` en SQL, sostenido por `conversations_organization_last_message_idx`.

  Consecuencia: un orden nuevo en Productos o Clientes no cambia ninguna consulta; uno nuevo en Conversaciones, sí.
- **H-2. El precio no viaja con el listado.** La página pide el precio vigente solo de los 25 productos que muestra. Ordenar por precio exige el precio de todos los que cumplen el filtro: una consulta más, con tantos parámetros como productos, del mismo tipo que `findBalances` y con el mismo límite de 65.535 parámetros ([Risks](../planning/Risks.md); tarea en Notion `3eb702be6f4e816f9005e87d52da4388`).
- **H-3. Lo que midió la 13.2 en el droplet de producción** ([evidencia-13.2](evidencia-13.2-mediciones.md), con 9.491 productos, 10.000 clientes y 10.000 conversaciones en una organización): `listProductStock` 624 ms de mediana (el más lento, con un máximo de 951 ms), `searchClientsByLastInteraction` 169 ms y `listConversations` 28 ms. El umbral de esa máquina es 1.508 ms por camino y 754 ms por consulta. Esas cifras valen para el orden de hoy.
- **H-4. Las listas de marcas y categorías ya existen.** `findDistinctValues` devuelve los valores distintos de cada columna, con tope de 200, y alimenta hoy los `datalist` de los formularios. Sirven también para los filtros. Dos valores que difieren solo en mayúsculas o tildes («Celulares» y «celulares») son dos valores distintos: normalizarlos cambia datos y es de la Fase 17.
- **H-5. Sugerir mientras se escribe es una superficie nueva.** Hace falta pedir datos al servidor desde el navegador. Hay un precedente: `loadOlderMessagesAction`, una Server Action de lectura que usa la línea de tiempo de la conversación, exige sesión y está declarada en la guarda de superficie expuesta (`tests/guards/exposed-surface.test.ts`, brief-8.4). Una acción nueva sin autorización es un hallazgo crítico.
- **H-6. Las búsquedas tienen reglas distintas.** Productos busca por palabras sobre nombre, marca y categoría, o por SKU exacto (brief-11.1, D-4). Clientes busca por prefijo de nombre, sin tildes ni mayúsculas, o por teléfono exacto (brief-5.2, D-3). Una sugerencia que la búsqueda después no encuentra confunde: cada autocompletar usa la regla de su buscador.
- **H-7. Los end-to-end asumen 25 filas y el orden actual**: varias aserciones leen el texto «Mostrando 1 a 25 de…», la página 2 o el orden de las filas. Si los valores por defecto no cambian, no deberían cambiar.
- **H-8. `src/modules/crm/repository.ts` arrastra un cambio ajeno, solo de finales de línea**, que nunca entra a un commit. Tocar ese archivo mezclaría ese cambio con el de la subfase. El autocompletar de Clientes puede resolverse con funciones del repositorio que ya existen (`findClients` con su límite), sin tocarlo.

## Decisiones pendientes

### D-1 — Qué órdenes ofrece cada listado

| Listado | Órdenes | Por defecto |
|---|---|---|
| Productos | Nombre (A–Z y Z–A), SKU, Stock (menor y mayor primero), Precio (menor y mayor primero) | Nombre A–Z, como hoy |
| Clientes | Última interacción (más reciente primero), Nombre (A–Z y Z–A) | Última interacción, como hoy |
| Conversaciones | Último mensaje (más reciente y más antiguo primero), Inicio (más reciente primero) | Último mensaje más reciente, como hoy |

Todos con desempate estable (nombre o id), para que una fila no salte de página.

- (a) La tabla completa, con **Precio** sujeto a la medición de D-7;
- (b) la tabla sin Precio.

*Recomendación: (a).* El precio es el dato que más se consulta al vender, y el costo queda acotado: se pide solo cuando se elige ese orden. Si la medición de D-7 supera el umbral, se cae a (b) y se informa.

### D-2 — Filas por página

- (a) **10, 25 y 50**, con 25 por defecto, como enlaces junto a la paginación («Filas por página: 10 · 25 · 50»), que conservan los filtros y vuelven a la página 1;
- (b) un selector dentro del formulario de filtros.

*Recomendación: (a).* Los enlaces funcionan sin JavaScript y sin apretar «Filtrar», y el 25 por defecto deja intactas las mediciones de la 13.2 y los end-to-end. El valor viaja en la URL (`?filas=`); uno desconocido vuelve a 25, como los demás filtros.

### D-3 — Dónde se elige el orden

- (a) un selector **«Ordenar por»** en el formulario de filtros de cada listado, en la URL (`?orden=`);
- (b) los encabezados de la tabla, clicables, con `aria-sort`.

*Recomendación: (a).* En el celular la tabla se vuelve tarjetas y no hay encabezados; el selector sirve en los dos tamaños y funciona sin JavaScript. Cambiar el orden vuelve a la página 1.

### D-4 — Filtros por categoría y por marca

- (a) dos selectores en el formulario de Productos, **«Categoría»** y **«Marca»**, con «Todas» por defecto y las listas de H-4, en la URL (`?categoria=&marca=`), con coincidencia exacta y dentro de la consulta de `searchProducts`;
- (b) un botón que abre un panel con las dos listas.

*Recomendación: (a).* El panel exige JavaScript y no agrega nada que dos selectores no den. Si una organización tiene más de 200 valores, los que no entran en la lista siguen funcionando desde la URL; el límite se declara.

### D-5 — El componente propio de sugerencias

Un componente cliente compartido, `src/app/_components/suggest-input.tsx`, según el patrón **combobox** de ARIA 1.2: el campo de texto con `role="combobox"`, la lista con `role="listbox"`, la opción activa por `aria-activedescendant`, flechas para moverse, Enter para elegir, Escape para cerrar, y el foco siempre en el campo. Con los colores de los tokens, en claro y en oscuro, y sin estilos en línea (CSP).

**Sin JavaScript es el campo de texto de hoy**, con el mismo `name`: el formulario y la búsqueda funcionan igual.

- (a) un solo componente para las dos fuentes: una lista fija que recibe por props (marcas y categorías, filtradas en el navegador sin tildes ni mayúsculas) y una función que pide sugerencias al servidor (los buscadores);
- (b) dos componentes separados.

*Recomendación: (a).* El teclado, el foco y la accesibilidad son lo difícil, y conviene resolverlos una sola vez.

### D-6 — El autocompletar de los buscadores

- **Fuente**: dos Server Actions de lectura, `suggestProductsAction` y `suggestClientsAction`, como `loadOlderMessagesAction`: `requireSession` antes de todo, el rol lo exige el módulo, y las dos declaradas en la guarda de superficie expuesta.
- **Qué devuelven**: hasta 8 sugerencias, con la regla de su buscador (H-6). Productos: nombre y SKU. Clientes: **solo el nombre**, nunca el teléfono, sea cual sea el rol.
- **Cuándo**: desde 2 caracteres, con 250 ms de espera después de la última tecla, descartando las respuestas viejas. Un texto que parece teléfono no pide sugerencias: esa búsqueda es exacta.
- **Qué hace elegir una sugerencia**:
  - (a) **abre el detalle** de ese producto o cliente; Enter sin elegir nada busca como hoy;
  - (b) completa el buscador con ese texto y filtra.

*Recomendación: (a).* Quien elige una sugerencia ya sabe cuál quiere, y una búsqueda por palabras con ese nombre puede traer otros productos. El buscador de clientes de Conversaciones (`buscar_cliente`) queda como está: su resultado es filtrar, no abrir un detalle.

### D-7 — Medición

- (a) medir **en local** con los instrumentos de la 13.2 ([planes-13.2/guiones/](planes-13.2/guiones/) y su analizador), sobre la organización de volumen, los caminos que cambian: Productos ordenado por precio, Conversaciones con cada orden nuevo y las dos consultas de sugerencias. Se registra la mediana y la forma del plan, contra el umbral local de la 13.2. Sin medir en producción, que no tiene volumen;
- (b) además, repetir la medición en el droplet de producción.

*Recomendación: (a).* Lo que se agrega es una consulta del mismo tipo que otras ya medidas en los dos entornos, y la proporción entre las dos máquinas está calculada (3,77×). Un plan que cambie de forma, o un recorrido secuencial nuevo, se informa siempre, aunque esté debajo del umbral.

### D-8 — Etapas y despliegue

- (a) cinco etapas, cada una con su CI en verde:
  - **15.2.1 — Orden y filas por página** en los tres listados (D-1 a D-3);
  - **15.2.2 — Filtros por categoría y por marca** (D-4);
  - **15.2.3 — El componente de sugerencias** en los tres campos de los formularios (D-5);
  - **15.2.4 — El autocompletar de los buscadores** de Productos y Clientes (D-6);
  - **15.2.5 — Despliegue a producción**, con la CI del SHA exacto en verde, la autorización del usuario y el [README de producción](../../deploy/production/README.md), §Desplegar. Sin migraciones ni cambios en `app.env`. Para volver atrás, el SHA que corra entonces.

  Si el usuario lo pide, se despliega antes, al final de cualquier etapa;
- (b) una sola etapa.

*Recomendación: (a).* La 15.2.3 y la 15.2.4 agregan JavaScript y superficie; conviene que lleguen sobre una base ya verificada.

### D-9 — Revisión

- (a) autoevaluación declarada, con axe en los dos modos como evidencia externa al autor;
- (b) además, una **revisión independiente de solo lectura antes de desplegar**, enfocada en las dos Server Actions nuevas, el componente de sugerencias (teclado, foco y lector de pantalla) y los cambios de consulta.

*Recomendación: (b).* La subfase no abre ni cierra un gate, pero, a diferencia de la 15.1 y la 15.4, agrega superficie expuesta y toca consultas en `src/modules/`. La guarda dice que la superficie no crezca en silencio, pero no que la exigencia declarada se cumpla.

## Alcance incluido

1. Registrar la resolución de D-1 a D-9.
2. **Orden y filas por página** en Productos, Clientes y Conversaciones, en la URL, con los valores por defecto de hoy.
3. **Filtros por categoría y por marca** en Productos.
4. **El componente de sugerencias** y su uso en Marca y Categoría del producto y en Categoría de la información, en lugar del `datalist`.
5. **El autocompletar** de los buscadores de Productos y Clientes, con sus dos Server Actions.
6. Tests unitarios de la interpretación de la URL, del orden y del filtrado de sugerencias; tests de integración de las consultas nuevas contra PostgreSQL real; end-to-end nuevos del orden, las filas, los filtros, el teclado del componente y el autocompletar, con axe.
7. La medición de D-7, registrada en este brief.
8. **Despliegue** según D-8.

## Alcance excluido

- Tablas, columnas, índices o migraciones nuevas. Si una medición pide un índice, se detiene y se propone.
- Normalizar marcas y categorías, y los filtros de Clientes que dependen de campos nuevos (Fase 17).
- El buscador global, el orden de Información y de Usuarios, y el buscador de clientes de Conversaciones.
- Cambiar las reglas de búsqueda de Productos o de Clientes.
- El dashboard (15.3).
- Librerías nuevas y cambios en `package.json`.

## Archivos o componentes autorizados

- **`src/modules/`**:
  - `inventory/service.ts` (orden, precio para ordenar y tamaño de página);
  - `catalog/service.ts`, `catalog/repository.ts` e `index.ts` (filtros de categoría y marca, y la consulta de sugerencias de productos);
  - `crm/service.ts` e `index.ts` (tamaño de página y sugerencias de clientes). **`crm/repository.ts` no se toca** (H-8);
  - `conversations/service.ts`, `conversations/repository.ts` e `index.ts` (orden y tamaño de página).

  Con sus tests de servicio e integración.
- **`src/app/_components/`**: `suggest-input.tsx` nuevo, con su lógica de filtrado en un archivo aparte con test; `pagination.tsx` (los enlaces de filas por página); `icons.tsx` y `form-styles.ts` pueden ampliarse.
- **Productos**: `productos/page.tsx`, `productos/filters.ts` y su test, `productos/actions.ts` (la acción de sugerencias), `productos/product-form.tsx` y `productos/messages.ts`.
- **Clientes**: `clientes/page.tsx`, `clientes/filters.ts` y su test, `clientes/actions.ts` y `clientes/messages.ts`.
- **Conversaciones**: `conversaciones/page.tsx`, `conversaciones/filters.ts` y su test, y `conversaciones/conversation-table.tsx`.
- **Información**: `informacion/knowledge-form.tsx`.
- **Tests**: `tests/guards/exposed-surface.test.ts` (solo las dos entradas nuevas), `tests/e2e/` (casos nuevos, y las afirmaciones existentes que cambien a propósito, listadas con su motivo; ningún otro paso cambia).
- **Documentación**: [Screens.md](../product/Screens.md) (nota fechada), este brief y el [índice](README.md).

## Fuentes de verdad

1. El código de los tres listados y de sus consultas (H-1).
2. [evidencia-13.2](evidencia-13.2-mediciones.md): las mediciones y los umbrales.
3. [brief-15.1](brief-15.1-identidad-visual-y-marco.md) y [brief-15.4](brief-15.4-detalles-y-formularios.md): los tokens, los componentes compartidos y las reglas de presentación.
4. [brief-8.4](brief-8.4-revision-de-seguridad.md): la superficie expuesta.
5. El patrón combobox de las [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

## Invariantes

- Ningún color fuera de los tokens; ninguna clase de la paleta por defecto de Tailwind en `src/app/`.
- **Sin parámetros nuevos en la URL, cada listado se ve exactamente como hoy**: el mismo orden, las mismas 25 filas y los mismos filtros.
- Los parámetros nuevos (`orden`, `filas`, `categoria`, `marca`) se interpretan como los existentes: un valor desconocido vuelve al de defecto y nunca da error.
- Ninguna sugerencia muestra un dato que la pantalla no muestre a ese rol: el teléfono de un cliente nunca aparece en una sugerencia.
- Cada Server Action nueva exige sesión antes de cualquier lectura y está declarada en la guarda.
- Todo funciona sin JavaScript: los formularios envían el mismo `name` y los buscadores buscan como hoy.
- La CSP no cambia: sin estilos ni scripts en línea.
- Sin migraciones. `package.json` no cambia.

## Criterios de aceptación

- **AC-1**: D-1 a D-9 tienen resolución del usuario con fecha.
- **AC-2**: los end-to-end existentes pasan en local sobre `next start`, con sus pasos sin cambios salvo los listados, y el recuento en el informe.
- **AC-3**: end-to-end nuevos prueban, en cada listado, cada orden, las tres cantidades de filas y que los parámetros se conserven al paginar; en Productos, los dos filtros; el componente de sugerencias con teclado (flechas, Enter, Escape) y sin JavaScript; y el autocompletar de los dos buscadores, incluido que un `viewer` no vea teléfonos.
- **AC-4**: axe no informa violaciones WCAG 2.x A ni AA, en claro ni en oscuro, en los estados existentes y en el componente con la lista abierta.
- **AC-5**: `grep` no encuentra clases de la paleta por defecto de Tailwind en `src/app/`.
- **AC-6**: la guarda de superficie expuesta declara las dos acciones nuevas con `sesion`, y un test prueba que cada una rechaza un pedido sin sesión.
- **AC-7**: la medición de D-7 está registrada, con mediana y forma del plan de cada camino nuevo, debajo del umbral local; o el desvío está informado y decidido por el usuario.
- **AC-8**: `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit`, `test:integration` y `build` pasan, y el `git diff` de `package.json`, `package-lock.json` y `drizzle/` está vacío.
- **AC-9**: capturas de cada pantalla de la etapa, en claro y en oscuro, a 1280 y a 375 px, con la lista de sugerencias abierta donde corresponda, entregadas al usuario **antes** de desplegar.
- **AC-10**: la revisión de D-9 hecha, con sus hallazgos verificados y resueltos o aceptados por el usuario.
- **AC-11**: la CI en verde en el commit de cada etapa, leída por `headSha` y `conclusion`.
- **AC-12** (15.2.5): producción corre el SHA de AC-11; `/login` responde 200; la ingestión y la lectura siguen respondiendo solo a `agente-demo` (401 sin token); y el usuario mira las pantallas en producción.
- **AC-13**: `git status` muestra solo archivos autorizados.

## Pruebas y evidencia requerida

- **`deterministic`**: unitarios de los filtros de la URL, del orden en memoria y del filtrado de sugerencias; integración de las consultas de orden, de los filtros y de las sugerencias contra PostgreSQL real, con el aislamiento por organización.
- **`producer-consumer`**: Playwright con Chromium sobre `next start` contra PostgreSQL real, con axe en los dos esquemas, incluido un caso con JavaScript desactivado.
- **`isolated-runtime`**: el despliegue en producción y la mirada del usuario (AC-12).
- **No certifica**: la estética, que juzga el usuario con las capturas; el aspecto y el teclado en navegadores distintos de Chromium; el uso con un lector de pantalla real, más allá de lo que mide axe y del patrón ARIA; el rendimiento con volumen en producción, que se infiere de la proporción de la 13.2; ni nada de la 15.3 o de las Fases 16 a 18.

## Condiciones de detención

- Antes de commit, push, merge o deploy.
- Antes de instalar cualquier dependencia.
- Si un end-to-end existente exige cambiar algo distinto de un texto listado: se detiene y se informa, porque es un cambio de comportamiento.
- Si una medición supera el umbral o cambia la forma de un plan: se detiene y se informa antes de seguir.
- Si hace falta un índice, una columna o una migración.
- Si hace falta tocar `src/modules/crm/repository.ts`.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.
- Antes de cambiar el estado en Notion si el usuario no lo autorizó.

## Resultados — 15.2.1

Etapa 15.2.1, orden y filas por página en Productos, Clientes y Conversaciones. Autoevaluación, no revisión independiente: la de D-9 se hace antes del despliegue (15.2.5).

**Qué se hizo.** Los órdenes de D-1 en `?orden=` y las filas de D-2 (10, 25 o 50) en `?filas=`, con un valor desconocido reemplazado por el de defecto. Productos ordena en memoria, como ya componía con el catálogo; el orden por precio pide los precios vigentes solo cuando hace falta, y un producto sin precio va al final en los dos sentidos. Conversaciones ordena en SQL con el mapa `ORDER` del repositorio. Clientes reordena en memoria los ids que el CRM ya devuelve por nombre. Las filas por página son enlaces debajo de la paginación: funcionan sin JavaScript y vuelven a la página 1 con los mismos filtros.

**Desvíos.**
- `src/modules/inventory/index.ts` no estaba en la lista de archivos autorizados: exporta `PRODUCT_SORTS` y `ProductSort`, que la página necesita.
- `scripts/medir-caminos.ts` tampoco estaba: se le agregó el bloque «brief-15.2 (D-7)» con los 8 caminos nuevos, para medir con el mismo instrumento de la 13.2.
- Cuatro aserciones de URL de end-to-end existentes (`clients.spec.ts` ×2, `conversations.spec.ts`, `products.spec.ts`) cambian porque el formulario de filtros ahora envía también `orden`. Es un cambio de comportamiento: se detuvo, y el usuario eligió aceptar `&orden=…` en la URL y actualizar las aserciones (opción a).

**Medición (D-7).** En una base local aparte, sembrada con `seeds/volume.ts medicion` (21 organizaciones, con precios) y borrada después; `crm_dev` no se tocó. Mediana del camino completo, umbral local 400 ms:

| Camino | Organización grande | Organización chica |
|---|---|---|
| Productos, por precio | 226 ms | 13 ms |
| Productos, por stock, 50 filas | 143 ms | 8,5 ms |
| Conversaciones, más antiguo (primera / última página) | 8,5 / 9,2 ms | 7,2 / 5,7 ms |
| Conversaciones, por inicio (primera / última página) | 7,3 / 9,2 ms | 7,0 / 5,9 ms |
| Conversaciones, 50 filas | 9,0 ms | 8,2 ms |
| Clientes, nombre Z–A | 48,8 ms | 8,3 ms |

Todos debajo del umbral. Productos sin orden mide 162 ms en la grande: el orden por precio suma unos 64 ms. Con el factor 3,77× de la 13.2, en producción serían unos 850 ms contra un umbral de 1.508 ms (inferencia, no medición).

Tres planes cambian de forma, informados y **aceptados por el usuario el 2026-10-05 sin índices nuevos**:
1. El orden por precio lee `product_prices` con un recorrido secuencial en la organización grande (21 ms, unas 10.000 filas) y por índice en la chica: una organización dueña de casi toda la tabla se lee entera, como ya registró la 13.2 para productos y saldos.
2. «Más antiguo», en la primera página de la organización grande, lee la tabla y hace un top-N sort (8,5 ms). El índice `last_message_at DESC NULLS LAST` no se puede recorrer al revés para `ASC NULLS LAST`.
3. «Por inicio» usa su índice en la primera página. Las páginas profundas leen la tabla y ordenan, igual que el orden de siempre.

**Verificación.**
- `typecheck`, `lint` y `build` pasan; `prettier --check` sobre los 23 archivos cambiados, limpio.
- `test:unit` 520 de 520; `test:guards` 485 de 485; `test:integration` 678 de 678 (43 archivos).
- End-to-end: la suite completa, 105 de 105 sobre `next start` (11,1 min).
- Casos nuevos: productos 18 (orden por precio, 10 filas y paginación), clientes 17 (nombre Z–A, 10 filas) y conversaciones 12 (más antiguo, por inicio y 50 filas).
- `package.json`, `package-lock.json` y `drizzle/` sin cambios. No se tocó `src/modules/crm/repository.ts`: su diff es solo de finales de línea, ajeno, y queda fuera del commit, igual que `scripts/migrar.ts`.

## Resultados — 15.2.2

Etapa 15.2.2, filtros por categoría y por marca en Productos (D-4, opción a). Autoevaluación, no revisión independiente.

**Qué se hizo.** Dos selectores, «Categoría» y «Marca», después de «Actividad», con «Todas» (valor vacío) por defecto, en `?categoria=&marca=`. La coincidencia es exacta y va dentro de la consulta de `findProducts`: «Almacén» no trae «Almacen» (normalizar es de la Fase 17). Las opciones salen de `findDistinctValues`, la misma consulta de los formularios, con su tope de 200: un valor de la URL que no entra en la lista se agrega al selector para mostrarse elegido. `listProductSuggestions` es solo de admin, así que se agregó `listProductFilterOptions`, que permite admin y viewer: los dos ya ven la marca y la categoría de cada producto. Los filtros se conservan al ordenar, al paginar y al cambiar las filas por página, y cuentan para «Limpiar filtros».

**Desvíos.**
- `scripts/medir-caminos.ts` suma los 3 caminos de esta etapa, como en la 15.2.1.
- Una aserción de URL de end-to-end existente (`products.spec.ts`, caso 8) cambia porque el formulario envía también `categoria=&marca=`. Se detuvo, y el usuario eligió aceptarlo y actualizar la aserción (opción a), en lugar de `categoria=todas&marca=todas`, que impediría filtrar una categoría o marca llamada «todas».

**Medición (D-7).** En una base local aparte sembrada con `seeds/volume.ts medicion` y borrada después. La siembra no carga marca ni categoría: después de sembrar se asignaron «Categoría 00» a «Categoría 19» y «Marca 00» a «Marca 59» repartidas por hash del id (en la organización grande, «Categoría 03» tiene 472 productos activos y 8 con «Marca 07»). Mediana del camino completo:

| Camino | Organización grande | Organización chica |
|---|---|---|
| Productos, sin filtro (referencia de esta corrida) | 191,9 ms | 9,1 ms |
| Productos, por categoría | 17,4 ms | 2,7 ms |
| Productos, por categoría y marca | 5,0 ms | 1,1 ms |
| Opciones de los filtros (las dos listas) | 5,6 ms | 1,4 ms |

Ningún plan cambia de forma. El filtro recorre `products` igual que el camino sin filtro (secuencial en la organización grande, por índice en la chica) y solo suma la condición; filtrar baja el tiempo porque compone menos productos. Las opciones son la consulta que ya usan los formularios desde la 11.1 (recorrido de los productos de la organización, `HashAggregate` y orden); lo nuevo es que el listado la pide en cada carga, unos 5 ms en la organización grande.

**Verificación.**
- `typecheck`, `lint` y `build` pasan; `prettier --check` sobre los archivos cambiados, limpio.
- `test:unit` 521 de 521; `test:guards` 485 de 485; `test:integration` 680 de 680 (2 casos nuevos: los filtros y las opciones por organización y rol).
- End-to-end: la suite completa, 105 de 106 sobre `next start` (7,6 min). Falló por tiempo el caso 9 de Clientes (el navegador de un viewer no recibe el teléfono), que esta etapa no toca: agotó los 30 s sin fallar ninguna aserción, y corrido solo dos veces pasó las dos, en unos 10 s. Antes, el caso 5 de Productos tuvo un cierre del navegador («Target crashed») y pasó al repetirlo. Caso nuevo: productos 19 (los dos filtros, su conservación al ordenar y cambiar las filas, solo marca desde la URL y un valor fuera de la lista).
- `package.json`, `package-lock.json` y `drizzle/` sin cambios.

## Desvío — `source-map-js` (2026-10-06)

La CI de `d7d5a6d` (15.2.2) falló solo en «Auditoría de dependencias» (`npm audit --omit=dev --audit-level=high`) por un aviso publicado después de la CI de `ff139ae`: [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), severidad alta, denegación de servicio en `source-map-js` 1.0.0 a 1.2.1 por un mapa de código fuente armado. Llega por `next` 16.3.8 → `postcss` 8.5.23 → `source-map-js` 1.2.1. Ninguna etapa de la 15.2 tocó dependencias.

El usuario autorizó actualizarla en un commit aparte. Es un desvío de AC-8: `package-lock.json` cambia, `package.json` no. `npm audit fix` subía también `brace-expansion` y `drizzle-kit`, que no estaban autorizados: se revirtió y se aplicó `npm update source-map-js`, que deja solo `source-map-js` 1.2.2, dentro del rango `^1.2.1` que pide `postcss`. `node_modules` se reinstaló con `npm ci` desde ese lock. Las dos auditorías de la CI pasan en local.

Riesgo mientras tanto, inferido del árbol de dependencias y no probado: bajo. `postcss` procesa los estilos propios al compilar y la aplicación no recibe mapas de código fuente de terceros. Producción (`2aaa619`) tiene la 1.2.1 hasta el próximo despliegue (15.2.5).

## Resultados — 15.2.3

Etapa 15.2.3, el componente propio de sugerencias (D-5, opción a). Autoevaluación, no revisión independiente.

**Qué se hizo.** `src/app/_components/suggest-input.tsx` reemplaza el `datalist` en Marca y Categoría del producto y en Categoría de la información. Sigue el patrón combobox de ARIA 1.2 con lista: el campo tiene `role="combobox"`, `aria-expanded`, `aria-controls` y `aria-activedescendant`, y la lista es `role="listbox"` con opciones `role="option"` y `aria-selected`. Escribir, hacer clic o la flecha abajo abren la lista. Las flechas mueven la opción activa, que queda a la vista en una lista larga. Enter elige sin enviar el formulario, y Enter sin opción activa lo envía como siempre. Escape cierra sin cambiar el texto, y salir del campo también la cierra. Con el mouse, la opción se elige en `mousedown`, para que el campo no pierda el foco. El filtrado está en `suggest-filter.ts`: sin tildes ni mayúsculas, primero lo que empieza con el texto y después lo que lo contiene. Los colores salen de los tokens y no hay estilos en línea.

El campo no es controlado, para que el reinicio del formulario después de cada envío (`useActionState`) siga funcionando como en los demás campos. Sin JavaScript es un campo de texto con el mismo `name`. Por ahora solo usa la lista fija; el pedido al servidor de la 15.2.4 se le suma en esa etapa.

**Desvíos.** `suggest-filter.ts` y su test son el «archivo aparte con test» que prevé la lista de archivos; no hay otros.

**Verificación.**
- `typecheck`, `lint` y `build` pasan; `prettier --check` sobre los archivos cambiados, limpio.
- `test:unit` 526 de 526 (5 nuevos del filtrado); `test:guards` 485 de 485; `test:integration` 680 de 680.
- End-to-end: la suite completa, 109 de 109 sobre `next start`. Casos nuevos: productos 20 (teclado, mouse, Escape, Enter que no envía, valor fuera de la lista y axe en claro y oscuro con la lista abierta), productos 21 (sin JavaScript, el alta con marca y categoría se guarda igual) e información 10 (categorías de la organización, filtrado y teclado, con axe). Ningún end-to-end existente cambió: completan los campos por su etiqueta, que sigue igual.
- Capturas con la lista abierta, en claro y oscuro, a 1280 y 375 px: Categoría y Marca del producto y Categoría de la información.

## Resultados — 15.2.4

Etapa 15.2.4, el autocompletar de los buscadores de Productos y Clientes (D-6, opción a). Autoevaluación, no revisión independiente: la de D-9 se hace antes del despliegue.

**Qué se hizo.**
- Dos servicios de lectura:
  - `catalog.suggestProducts` reutiliza `findActiveProductsRanked`, la consulta de la API de lectura con la misma coincidencia del buscador: palabras sobre nombre, marca y categoría, o SKU exacto, con el SKU exacto primero y después la relevancia. Devuelve id, nombre y SKU.
  - `crm.suggestClients` usa `interpretSearch` y `findClients`, el prefijo de nombre sin tildes ni mayúsculas, en orden de nombre. Devuelve **solo id y nombre**: el teléfono no sale del servicio, sea cual sea el rol. Un texto que parece teléfono no sugiere nada.
  - Los dos sugieren solo activos, hasta 8, desde 2 caracteres, y exigen un rol válido: una contraseña pendiente recibe `FORBIDDEN`.
- Dos Server Actions de lectura, `suggestProductsAction` y `suggestClientsAction`, con el esquema de `loadOlderMessagesAction`: `requireSession` antes de todo, el texto acotado a 100 caracteres, y ante un error inesperado una lista vacía y un evento sin el texto buscado. Las dos están declaradas en la guarda de superficie expuesta con `sesion`.
- `SuggestInput` suma la fuente remota (`load`): pide 250 ms después de la última tecla, descarta las respuestas viejas con un número de pedido y, con `skipPhones`, no pide nada para un texto que parece teléfono. Elegir una sugerencia abre el detalle; Enter sin elegir envía el formulario y busca como siempre. El buscador de clientes de Conversaciones no cambia.

**Desvíos.**
- `scripts/medir-caminos.ts` suma los 2 caminos de sugerencias.
- `SuggestInput` acepta un ícono como hijo: dentro de su contenedor, la lupa de los buscadores quedaba tapada por el campo. Se resolvió en el componente para no tocar `page-header.tsx`, que no está en la lista.
- Las capturas mostraron el SKU cortado en dos líneas dentro de la sugerencia: pasó a una línea propia, sin cortes.

**Medición (D-7).** En una base local aparte, sembrada con `seeds/volume.ts medicion` y borrada después. Mediana del camino completo:

| Camino | Organización grande | Organización chica |
|---|---|---|
| Sugerencias de productos («café») | 4,2 ms | 3,5 ms |
| Sugerencias de clientes («ana») | 4,7 ms | 1,9 ms |

Ningún plan cambia de forma. Productos usa `BitmapOr` sobre el índice GIN `products_search_idx` y el índice de SKU, con un top-N, igual que la API de lectura. Clientes usa `clients_organization_display_name_unaccent_idx` con un top-N, igual que el buscador del listado («prefijo de nombre», 9,3 ms en la misma corrida).

**Verificación.**
- `typecheck`, `lint` y `build` pasan; `prettier --check` sobre los archivos cambiados, limpio.
- `test:unit` 528 de 528 (2 nuevos de `looksLikePhone`); `test:guards` 485 de 485; `test:integration` 685 de 685 (5 nuevos: las reglas, el límite, la organización, el rol y que el teléfono no viaje).
- End-to-end: 111 de 111 sobre `next start`, en dos tandas (45 y 66). Antes, dos corridas completas seguidas perdieron el servidor de la aplicación a mitad de camino, en puntos distintos (durante productos y antes de clientes 18), sin ningún error en su salida; todo lo posterior dio `ERR_CONNECTION_REFUSED`. La máquina tenía 0,6 GB libres de 7,7 GB: se atribuye a falta de memoria, por inferencia y no por prueba, y la corrida anterior con el mismo código del producto pasó 110 de 111. Casos nuevos: productos 22 (regla de la búsqueda, inactivos fuera, SKU exacto, Enter que busca, mouse que abre el detalle, axe y AC-6) y clientes 18 (un viewer ve nombres, ni la lista ni las respuestas de la acción contienen el teléfono, un texto que parece teléfono no pide nada, Enter que busca, teclado que abre el detalle, axe y AC-6).
- **AC-6**: cada caso captura la Server Action real y la reenvía sin la cookie de sesión. La respuesta no trae ningún nombre y redirige a `/login`.
- La primera corrida completa falló en clientes 18 por el test: leía el cuerpo de una respuesta después de que la página navegara. Se protegió la lectura y se deja de escuchar antes de navegar; repetido 5 veces, pasó las 5.

## Revisión independiente (D-9) y correcciones (2026-10-06)

Un agente que no participó del trabajo revisó la 15.2.1 a la 15.2.4 con acceso de solo lectura, contra este brief y las reglas vigentes. **Sin hallazgos bloqueantes.** Confirmó que las dos acciones exigen sesión antes de leer, que el teléfono no viaja por ningún camino, que las consultas filtran por organización y no admiten inyección en el orden, y que no hay colores fuera de los tokens ni estilos en línea. Informó cinco hallazgos menores. Cada uno se verificó contra el código antes de aceptarlo, y el usuario aprobó las correcciones.

- **H-1, defecto del componente.** Al llegar una lista remota nueva, `SuggestInput` conservaba la opción marcada de la anterior. Con la tercera opción marcada y una lista nueva de una sola, Enter llamaba a `choose(undefined)` y fallaba con un `TypeError`. Ahora una lista nueva reinicia la opción marcada, y Enter solo elige si la opción existe. Productos 23 lo prueba retrasando a propósito la respuesta de la acción, para que la carrera ocurra siempre.
- **H-2, el orden por precio mezclaba monedas.** Comparaba montos sin mirar la moneda, que es por fila (DataModel): 10 USD salía antes que 990 ARS. Ahora se agrupa primero por moneda, en orden alfabético en los dos sentidos, y dentro de cada moneda se ordena por monto. Hay un test unitario nuevo con ARS y USD. En el piloto todos los precios son ARS, así que en la práctica no cambia nada.
- **H-3, contradicción documental.** `DataModel.md` y `TraceabilityMatrix.md` decían que ninguna consulta ordena por inicio dentro de un estado, pero desde la 15.2.1 `/conversaciones?estado=…&orden=inicio` lo hace. Se midió en una base local aparte, sembrada con `seeds/volume.ts medicion` y borrada después:

  | Camino | Organización grande | Organización chica |
  |---|---|---|
  | Abiertas por inicio (primera / última página) | 6,9 / 7,5 ms | 6,2 / 5,7 ms |

  El plan recorre `conversations_organization_started_idx` hacia atrás, con un `Incremental Sort`, y filtra el estado (3.225 abiertas de 10.000). El recuento hace un recorrido secuencial de `conversations`, como cualquier filtro por estado desde antes de la 15.2, porque no depende del orden. No se repone el índice quitado en la 1.2. Las dos frases se enmendaron con fecha. **Desvío:** esos dos documentos no estaban en la lista de archivos autorizados, y el usuario autorizó tocarlos.
- **H-4, AC-3 no estaba cubierto al pie de la letra.** Se agregaron:
  - en Productos 18, los órdenes `nombre-za`, `sku`, `stock-menor` y `precio-menor`;
  - en Clientes 17, las 50 filas;
  - Conversaciones 13: 10 filas, y el estado y el orden se conservan al paginar.
- **H-5, sin cambio.** `.claude/settings.json` nunca entró en ningún commit.

Además, `Screens.md` suma la nota fechada de la 15.2. `scripts/medir-caminos.ts` suma los dos caminos de H-3.

**Verificación.**
- `typecheck`, `lint` y `build` pasan; `prettier --check` sobre los archivos cambiados sale limpio.
- `test:unit` 529 de 529 y `test:guards` 485 de 485.
- `test:integration`: la primera corrida dio 684 de 685. Falló una vez «D-6: las sugerencias usan la regla del buscador», un test que estas correcciones no tocan. Después pasó 1 de 1 solo, su archivo 3 de 3 y la integración completa 685 de 685, dos veces seguidas. El test tarda 0,2 s, su consulta tiene un orden determinista y los archivos corren en serie. No se guardó el mensaje del primer fallo, así que **la causa no se conoce**: queda registrado como intermitente, sin atribuirle una causa.
- End-to-end: 113 de 113 sobre `next start`, en dos tandas (46 y 67). El primer intento de la segunda tanda no corrió ningún test, porque el servidor de la primera había quedado ocupando el puerto 3100. Se cortó ese proceso y se volvió a correr.
- La CI del commit `defbe57`, que actualiza `sharp` a 0.35.5, está en verde, auditoría incluida.
