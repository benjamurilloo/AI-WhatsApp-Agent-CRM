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
