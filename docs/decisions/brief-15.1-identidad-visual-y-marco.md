---
schema: task-brief.v1
task_id: "15.1"
task_type: implementation
generated_at: 2026-10-05
---

# Brief: 15.1 — Identidad visual, marco y pantallas principales

**Estado: cerrado el 2026-10-05** (§Cierre de la subfase 15.1). Aprobado ese mismo día por el usuario, con las recomendaciones de D-1 a D-12. Eso fija: las piezas de los bocetos según la tabla de D-1; la paleta con el token `action` aparte (D-2); íconos propios copiados de Lucide, sin dependencia (D-3); la marca Vixora con la organización debajo (D-4); el menú para pantallas chicas (D-5); las tres opciones de tema como íconos (D-6); íconos de categoría por palabras clave (D-7); un ícono genérico para el canal (D-8); la paginación numerada (D-9); las etapas 15.1.1, 15.1.2 y 15.1.3 (D-10); el despliegue a producción (D-11); y la autoevaluación declarada (D-12). Ese mismo día, el usuario autorizó crear la Fase 15 en Notion y hacer el commit del Roadmap y de este brief. La aprobación no autoriza ningún commit, ningún cambio en Notion, ninguna dependencia nueva ni el despliegue a producción: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` (cálculo de contraste y tests unitarios), `producer-consumer` (Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro) e `isolated-runtime` (la versión desplegada en producción, mirada por el usuario).
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**. No certifica «preparado para producción»: eso sigue siendo el gate de la Fase 13.
- **Orden**: primera subfase de la Fase 15 ([Roadmap](../planning/Roadmap.md), §Fase 15), que corre en paralelo con la 13.5.2-b. Si la 13.5.2-b arranca a mitad de camino, esta subfase se pausa en el último punto con la CI en verde.

## Objetivo

Que las seis pantallas principales del CRM (el dashboard, Productos, Clientes, Conversaciones, Información del negocio y Usuarios) y su marco común se vean como los bocetos de referencia del usuario, en claro y en oscuro y con contraste AA, desplegadas en producción antes de la reunión con un posible cliente. Todo eso **sin cambiar ningún dato, fórmula, contrato ni comportamiento**.

## Situación

La identidad actual es «Laguna», del [brief-4.0](brief-4.0-diseno-visual-base.md): verde azulado, Manrope y un marco con barra superior (D-7 de ese brief). La 4.0 dejó una propiedad que esta subfase aprovecha: **todo color pasa por los tokens de [globals.css](../../src/app/globals.css)** y está prohibida la paleta por defecto de Tailwind en `src/app/`. Cambiar la paleta es reescribir los valores de los tokens, no recorrer pantallas.

El 2026-10-05, el usuario trajo siete bocetos generados con otra herramienta, cada uno en claro y en oscuro: el dashboard dos veces, y uno por cada listado. Pidió que el CRM quede conforme a ellos, por ahora en lo superficial. Las pantallas de detalle y los formularios, como «Nuevo producto», se revisan después, de a una (Roadmap, 15.4 en adelante).

## Hallazgos antes de diseñar

- **H-1. Los bocetos dibujan cosas que el CRM no tiene.** Un buscador global, una campana de notificaciones, un ítem «Sistema», una tarjeta de versión, la variación contra el período anterior, «Ver detalles», dos métricas nuevas, imágenes de producto, un menú «…» por fila y un selector de filas por página. Se resuelve en D-1.
- **H-2. `primary` es a la vez relleno de botón y color de enlace.** `linkClass` usa `text-primary` sobre la superficie ([form-styles.ts](../../src/app/_components/form-styles.ts)). En oscuro, el violeta saturado de los bocetos (`#7c3aed`) da 3,15:1 sobre la superficie: no sirve como texto. Se resuelve en D-2.
- **H-3. El marco lo usan casi todos los end-to-end.** 27 apariciones en 7 archivos lo localizan: «Salir», los botones del tema, la navegación «Principal». Si el marco conserva los nombres accesibles, esos pasos no cambian. Se resuelve en D-5 y D-6.
- **H-4. Los gráficos ya son SVG generados en el servidor, sin librería** ([chart-geometry.ts](../../src/app/(autenticado)/_dashboard/chart-geometry.ts)), con la tabla de datos como alternativa accesible. Cambiarles el color no exige ninguna librería. Hacerlos interactivos es la 15.3.
- **H-5. La paleta de D-2 se verificó con un cálculo de contraste WCAG** sobre 25 pares de uso en cada modo, más el relleno de acción. Todos cumplen. El mínimo es 3,90:1 en el borde fuerte sobre el fondo claro (se exige 3:1); en texto, 5,96:1. Es un cálculo sobre los valores hexadecimales, no evidencia de la UI: la evidencia de la UI es axe (AC-4).
- **H-6. Los listados ya tienen casi todo lo que dibujan los bocetos.** Los filtros de cada boceto son los que existen hoy. Las columnas también, salvo «Acciones». La paginación ya es por número de página, y cada resultado trae `page`, `pageCount` y `total`. Por eso los números de página y el texto «Mostrando 1 a 10 de 26» se derivan **sin tocar `src/modules/`**. El tamaño de página no: es una constante de cada módulo (`CLIENTS_PAGE_SIZE` y las demás), y el selector «10» lo cambiaría.
- **H-7. Hay end-to-end que afirman textos que los bocetos cambian.** «Página 1 de 2» en `users.spec.ts`, `products.spec.ts` y `conversations.spec.ts`, más los encabezados de algunas pantallas, como «Usuarios», que en el boceto pasa a «Usuarios y roles». Cambiar esos textos a propósito obliga a cambiar esas afirmaciones. Es un cambio de presentación, no de comportamiento, y se lista uno por uno (§Archivos).
- **H-8. Cada fila del boceto tiene un lápiz y un «…».** El lápiz tiene destino: la pantalla de detalle de cada entidad ya existe y edita. El «…» no tiene contenido definido. Mover acciones como desactivar o reactivar al listado ya es funcionalidad. Se resuelve en D-1.

## Decisiones pendientes

### D-1 — Qué piezas de los bocetos entran en la 15.1

| Pieza de los bocetos | Destino recomendado | Motivo |
|---|---|---|
| Paleta violeta, en claro y en oscuro | **15.1** | es el pedido |
| Panel lateral con logo, organización e íconos; barra superior con usuario y tema | **15.1** | reubica lo que ya existe |
| Encabezado de cada pantalla con subtítulo y botón «+ Nuevo …» | **15.1** | el botón ya existe como enlace |
| Filtros en una fila, con ícono de lupa y botón «Aplicar filtros» con ícono | **15.1** | son los mismos filtros |
| Tablas con encabezado en versalitas, avatar con iniciales y etiquetas de estado como píldoras | **15.1** | solo presentación |
| Columna «Acciones» con el lápiz, que lleva al detalle | **15.1** | el detalle ya existe |
| Paginación con números y «Mostrando X a Y de Z» | **15.1** | se deriva de lo que ya devuelve cada listado (H-6) |
| Títulos de los bocetos, como «Usuarios y roles» | **15.1** | es texto. Las afirmaciones que cambian se listan (H-7) |
| Dashboard: tarjetas con ícono, período en una tarjeta, gráfico diario recoloreado y selector de serie segmentado | **15.1** | mismos datos. La serie ya viaja en la URL |
| Selector de filas por página («10») | **15.2** | cambia la consulta de cada módulo (H-6) |
| Variación contra el período anterior, «Ver detalles», dona de tipos de mensaje, histograma de primera respuesta, gráficos interactivos | **15.3** | cálculos o métricas nuevas |
| Menú «…» de cada fila | **Fase 16** | no tiene contenido definido (H-8). Un menú vacío promete algo que no existe |
| Imágenes de producto | **Fase 16** | no hay dónde guardarlas: es un dato nuevo |
| Buscador global y campana de notificaciones | **Fase 16, como candidatas** | funcionalidad nueva. Mostrarlas inertes sería peor que no mostrarlas |
| «Sistema», la tarjeta de versión y colapsar el panel | **fuera** | no hay pantalla «Sistema», la versión no le sirve al operador y colapsar requiere estado persistente |

*Recomendación: la tabla tal como está.* En una demostración, una pieza dibujada que no hace nada luce peor que una pieza ausente.

### D-2 — Paleta

Valores verificados (H-5). Se agregan cuatro tokens. `action`, `action-hover` y `on-action` son el relleno de los botones primarios, del ítem activo del panel y de la página actual, separados de `primary`, que queda para el texto, los enlaces y los acentos. `sidebar` es el fondo del panel. Advertencia, peligro y éxito conservan los valores de la 4.0, que ya cumplen sobre las superficies nuevas.

| Token | Claro | Oscuro |
|---|---|---|
| `background` | `#f6f5fb` | `#0c0b1d` |
| `surface` | `#ffffff` | `#15142c` |
| `surface-muted` | `#efecf9` | `#1e1c3b` |
| `sidebar` *(nuevo)* | `#f1eefb` | `#100f25` |
| `foreground` | `#17142e` | `#ebe9f7` |
| `muted` | `#5a5573` | `#a9a5c6` |
| `border` | `#e3dff0` | `#2b2950` |
| `border-strong` | `#7d7799` | `#7a75a0` |
| `primary` (texto, enlaces, acentos) | `#6d28d9` | `#a48bfa` |
| `primary-hover` | `#5b21b6` | `#bba6fc` |
| `on-primary` | `#ffffff` | `#160f33` |
| `primary-soft` / `on-primary-soft` | `#ede7fe` / `#4c1d95` | `#2c2163` / `#d9cffd` |
| `action` *(nuevo)* / `on-action` *(nuevo)* | `#6d28d9` / `#ffffff` | `#7c3aed` / `#ffffff` |
| `action-hover` *(nuevo)* | `#5b21b6` | `#6d28d9` |
| `focus` | `#1d4ed8` | `#7cb4f5` |

Contrastes clave: texto sobre fondo, 16,5:1 en claro y 16,2:1 en oscuro; enlace sobre superficie, 7,1:1 y 6,6:1; texto blanco sobre el relleno de acción, 7,1:1 y 5,7:1; texto secundario sobre superficie, 7,0:1 y 7,6:1.

- (a) un solo `primary` también en oscuro: los botones quedan lavanda con texto oscuro. Cumple y es más simple, pero se aleja de los bocetos;
- (b) `action` separado: los botones quedan violeta saturado con texto blanco, como en los bocetos.

*Recomendación: (b).* El usuario pidió quedar conforme a los bocetos, y el token extra es el precio de que el violeta saturado cumpla en oscuro.

### D-3 — Íconos

Hacen falta unos 30: la navegación, el tema, salir, el menú, uno por métrica, lupa, filtro, más, lápiz, flechas, calendario y los de estado y categoría.

- (a) la dependencia `lucide-react`: requiere autorizar la instalación y suma un paquete a las dos puertas de `npm audit`;
- (b) un componente propio, `icons.tsx`, con los trazos SVG copiados de Lucide (licencia ISC, que permite copiarlos con su aviso en el encabezado del archivo), sin dependencia nueva.

*Recomendación: (b).* Son íconos fijos, `package.json` no cambia y no hay nada que autorizar ni auditar antes de la reunión. Si la cantidad crece mucho en la 15.3 o después, se reevalúa.

### D-4 — Marca y organización en el panel

Los bocetos muestran «Vixora» arriba del panel. Hoy el marco muestra la inicial y el nombre de la organización.

- (a) solo la marca Vixora;
- (b) solo el nombre de la organización, como hoy;
- (c) la marca Vixora (una «V» en SVG propio y el texto «Vixora») y, debajo, el nombre de la organización en texto secundario.

*Recomendación: (c).* El producto es Vixora, pero el operador tiene que ver en qué organización está trabajando: con dos organizaciones en producción, ocultarla invita a confundirlas.

### D-5 — Panel en pantallas chicas

Los breakpoints son los de [Screens.md](../product/Screens.md): `lg` es 1024 px.

- (a) desde `lg`, el panel fijo a la izquierda. Debajo de `lg`, una barra superior con un botón «Menú» (`aria-expanded`, `aria-controls`) que despliega la navegación, se cierra con Escape y al navegar, y devuelve el foco al botón. Las tablas anchas, como la de productos, se desplazan horizontalmente dentro de su tarjeta, como hoy;
- (b) el panel siempre visible, angosto, con solo íconos en pantallas chicas.

*Recomendación: (a).* A 375 px, un panel con texto ocupa media pantalla, y uno con solo íconos obliga a adivinar.

### D-6 — Selector de tema y salida

Los bocetos muestran un solo botón de luna o sol y un desplegable junto al usuario. Hoy hay tres opciones (Sistema, Claro y Oscuro), que funcionan sin JavaScript y que los end-to-end localizan por nombre.

- (a) las tres opciones, como botones de ícono con el mismo nombre accesible (`aria-label` igual a la etiqueta de hoy, más `aria-pressed`), en la barra superior. «Salir» queda como botón visible junto al usuario;
- (b) un único botón que alterna entre claro y oscuro, como en los bocetos: se pierde «Sistema» y cambian los pasos de los end-to-end;
- (c) un menú desplegable de usuario que contenga el tema y «Salir».

*Recomendación: (a).* Conserva la función y los nombres accesibles, funciona sin JavaScript y no toca los pasos de los end-to-end (H-3).

### D-7 — Íconos de categoría en Información del negocio

El boceto pone un ícono por entrada: un camión para «Envíos», un reloj para «Horarios», una tarjeta para «Pagos». Las categorías son texto libre de cada organización.

- (a) el mismo ícono de documento para todas;
- (b) una tabla chica de palabras clave («envío», «horario», «pago», «ubicación», «garantía», «devolución»), sin distinguir mayúsculas ni acentos, con el ícono de documento como respaldo, y un test unitario de la tabla.

*Recomendación: (b).* Es solo presentación, cubre las categorías de la demostración y no falla con una categoría desconocida.

### D-8 — Canal en Conversaciones

El boceto usa el logo de WhatsApp.

- (a) el logo de WhatsApp: su uso está sujeto a las reglas de marca de Meta;
- (b) un ícono genérico de mensaje en verde, junto al texto «WhatsApp», que ya se muestra.

*Recomendación: (b).* El texto ya dice el canal, y un ícono propio evita depender de las reglas de marca de otro.

### D-9 — Paginación

- (a) enlaces a cada página con el parámetro que ya existe. Se muestran hasta cinco números, con «…» si hay más, y la actual lleva `aria-current="page"`. «Página anterior» y «Página siguiente» quedan como botones de flecha con esos mismos nombres accesibles. El texto visible pasa a «Mostrando X a Y de Z ‹entidad›», y las afirmaciones de H-7 se actualizan;
- (b) conservar «Página X de Y» y solo restilizar.

*Recomendación: (a).* Es lo que muestran los bocetos y se deriva de lo que ya existe (H-6).

### D-10 — Etapas y orden de entrega para la reunión

- (a) tres etapas, cada una desplegable por sí sola con la CI en verde:
  - **15.1.1**: los tokens, el marco y el dashboard;
  - **15.1.2**: los cinco listados;
  - **15.1.3**: el despliegue a producción, según D-11.
  
  Si el tiempo no alcanza para la 15.1.2 antes de la reunión, se despliega solo la 15.1.1 y el usuario decide;
- (b) una sola etapa y un solo despliegue al final.

*Recomendación: (a).* Asegura que algo esté en producción a tiempo, y lo más visible en una demostración es el marco y el dashboard.

### D-11 — Despliegue a producción

- (a) con la CI del SHA exacto en verde, el usuario autoriza y el despliegue sigue el [README de producción](../../deploy/production/README.md), §Desplegar. No hay migraciones ni cambios en `app.env`, y la demostración sigue encendida solo para `agente-demo`. Para volver atrás, `29d6ccc`, que es lo que corre hoy. Si el clasificador de permisos bloquea al asistente, despliega el usuario;
- (b) no desplegar y mostrar la reunión desde local.

*Recomendación: (a).* Es lo que pidió el usuario: lo que se muestre tiene que estar en producción.

### D-12 — Revisión

La 15.1 no abre ni cierra un gate y solo cambia la presentación.

- (a) autoevaluación declarada, con axe en los dos modos como evidencia externa al autor;
- (b) además, una revisión independiente de solo lectura antes de desplegar.

*Recomendación: (a).* La regla del proyecto exige revisión independiente para los gates, y esta subfase no toca ninguno. La (b) se puede pedir igual, pero cuesta horas antes de la reunión.

## Alcance incluido

1. Registrar la resolución de D-1 a D-12.
2. **Tokens** en `globals.css`, según D-2, en los tres bloques (claro, oscuro por `prefers-color-scheme` sin cookie y oscuro por `data-theme`), más su mapeo en `@theme inline`.
3. **Marco común**, según D-4 a D-6: panel lateral con marca, organización y navegación con íconos; barra superior con usuario (iniciales, nombre y rol), tema y «Salir»; menú para pantallas chicas.
4. **Componentes compartidos**: estilos en `form-styles.ts` (botón primario sobre `action`, tarjetas, tablas, campos con ícono y píldoras), encabezado de página con subtítulo y acción, avatar con iniciales y paginación según D-9.
5. **Dashboard, solo presentación** (D-1). La «Definición» de cada métrica y la tabla de datos del gráfico se conservan.
6. **Los cinco listados**: Productos, Clientes, Conversaciones, Información del negocio y Usuarios, según D-1, D-7, D-8 y D-9.
7. **Un caso end-to-end nuevo del marco**: navegación por el panel a 1280 px; a 375 px, el menú se abre, se cierra con Escape y devuelve el foco; axe en claro y en oscuro.
8. **Etapas** según D-10. El despliegue, según D-11.

## Alcance excluido

- Todo lo que D-1 manda a la 15.2, la 15.3 o la Fase 16, o deja fuera.
- Las pantallas de detalle y los formularios (Roadmap, 15.4 en adelante). Heredan los tokens y el marco, pero su marcado no se toca.
- Cambios en `src/modules/`, en las consultas, en las migraciones, en los contratos o en las fórmulas.
- Cambios en la pantalla de inicio de sesión más allá de lo que hereda de los tokens.
- Librerías nuevas (D-3) y cambios en `package.json`.
- Cambiar la fuente: sigue Manrope local.

## Archivos o componentes autorizados

- `src/app/globals.css`
- `src/app/(autenticado)/layout.tsx`
- `src/app/_components/app-nav.tsx`, `theme-selector.tsx` y `form-styles.ts`
- **Nuevos en `src/app/_components/`**: `icons.tsx` (D-3), `brand.tsx` (D-4), `mobile-nav.tsx` (D-5), `page-header.tsx`, `avatar.tsx` y `pagination.tsx` (D-9), con sus tests unitarios donde haya lógica: las iniciales, el rango de páginas y la tabla de D-7.
- **Dashboard**: `src/app/(autenticado)/page.tsx` y, en `_dashboard/`, `metric-card.tsx`, `cards.tsx`, `daily-chart.tsx` y `definitions.ts` (el ícono de cada métrica).
- **Listados**: el `page.tsx` de `productos/`, `clientes/`, `conversaciones/`, `informacion/` y `usuarios/`; `productos/stock-status.tsx`, `conversaciones/conversation-table.tsx`, `conversaciones/status-badge.tsx` e `informacion/status-badge.tsx`; y los `messages.ts` de esas rutas, si cambian los títulos o los subtítulos.
- `tests/e2e/`:
  - **un archivo nuevo**, `frame.spec.ts`;
  - las afirmaciones de texto de H-7 (paginación y títulos) en `users.spec.ts`, `products.spec.ts`, `conversations.spec.ts` y los que tengan las mismas afirmaciones;
  - un localizador del marco, solo si D-6 no alcanzó a preservarlo.
  
  Cada cambio se lista en el informe con su motivo. **Ningún otro paso cambia.**
- Documentación: [Screens.md](../product/Screens.md) (nota fechada del marco y de las pantallas), [EngineeringStandards.md](../development/EngineeringStandards.md) (los tokens nuevos), este brief y el [índice](README.md).

## Fuentes de verdad

1. [brief-4.0](brief-4.0-diseno-visual-base.md): tokens, prohibición de la paleta de Tailwind y axe en los dos modos.
2. [Screens.md](../product/Screens.md): breakpoints y pantallas 2 a 12.
3. [MetricsCatalog.md](../analytics/MetricsCatalog.md): nada de lo que se dibuja cambia una definición.
4. Los bocetos del usuario del 2026-10-05, como referencia de estilo, nunca de datos.

## Invariantes

- Ningún color fuera de los tokens. La prohibición de la paleta de Tailwind en `src/app/` sigue vigente.
- Ningún cambio de comportamiento: las mismas rutas, los mismos parámetros de URL, los mismos formularios, los mismos datos y los mismos nombres accesibles, salvo los textos listados según H-7.
- `src/modules/` no cambia.
- El enmascarado del teléfono para `viewer` y lo que ve cada rol siguen iguales: la presentación nueva no muestra ningún dato que hoy no se muestre.
- Todo funciona sin JavaScript, salvo el menú de pantallas chicas, que sin JavaScript deja la navegación visible.
- La CSP no cambia: los íconos son SVG en línea, sin estilos ni scripts en línea.
- `package.json` no cambia.

## Criterios de aceptación

- **AC-1**: D-1 a D-12 tienen resolución del usuario con fecha.
- **AC-2**: los tokens de `globals.css` son los de D-2, y el cálculo de contraste de los pares de uso da AA en los dos modos, con la salida en el informe.
- **AC-3**: los end-to-end existentes pasan en local sobre `next start`, con sus pasos sin cambios salvo los listados según §Archivos, y el recuento en el informe.
- **AC-4**: axe no informa violaciones WCAG 2.x A ni AA, en claro ni en oscuro, en todos los estados que ya cubre `expectAccessible` y en el caso nuevo del marco.
- **AC-5**: el caso nuevo del marco pasa: navegación por el panel a 1280 px y, a 375 px, el menú se abre, se cierra con Escape y devuelve el foco.
- **AC-6**: `grep` no encuentra clases de la paleta por defecto de Tailwind en `src/app/`.
- **AC-7**: `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit`, `test:integration` y `build` pasan, y el `git diff` de `package.json`, `package-lock.json` y `src/modules/` está vacío.
- **AC-8**: capturas de las seis pantallas, en claro y en oscuro, a 1280 y a 375 px, junto al boceto correspondiente, entregadas al usuario para su revisión visual **antes** de desplegar.
- **AC-9**: la CI en verde en el commit de cada etapa, leída por `headSha` y `conclusion`.
- **AC-10** (15.1.3): producción corre el SHA de AC-9; `/login` responde 200; la ingestión y la lectura siguen respondiendo solo a `agente-demo`; y el usuario mira la demostración en producción, en los dos modos.
- **AC-11**: `git status` muestra solo archivos autorizados.

## Pruebas y evidencia requerida

- **`deterministic`**: el cálculo de contraste (un script en el directorio temporal de la sesión, con su salida en el informe; no queda en el repositorio) y los tests unitarios, los existentes y los de los componentes nuevos.
- **`producer-consumer`**: Playwright con Chromium sobre `next start` contra PostgreSQL real, con axe en los dos esquemas.
- **`isolated-runtime`**: el despliegue en producción y la mirada del usuario (AC-10).
- **No certifica**: la estética, que juzga el usuario con las capturas; el aspecto en navegadores distintos de Chromium; ni nada de la 15.2, la 15.3 o la Fase 16.

## Condiciones de detención

- Antes de commit, push, merge o deploy.
- Antes de instalar cualquier dependencia (D-3).
- Si un end-to-end existente exige cambiar algo distinto de lo listado en §Archivos: se detiene y se informa, porque es un cambio de comportamiento.
- Si una pieza de los bocetos exige tocar `src/modules/`: se detiene. Va a la 15.2, a la 15.3 o a la Fase 16.
- Si un par de tokens no llega a AA en la UI aunque haya pasado el cálculo: se ajusta el valor dentro de su tono y se informa. Si exige cambiar de tono, se detiene.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.
- Antes de cambiar el estado en Notion si el usuario no confirmó el cierre.

## Resultados — etapas 15.1.1 y 15.1.2

*Registrado el 2026-10-05. Autoevaluación declarada (D-12): no es una revisión independiente.* Las dos etapas se implementaron en la misma sesión y se verificaron juntas, sobre el mismo árbol: la suite completa corrió sobre las dos, no sobre la 15.1.1 sola con su versión final.

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | aprobación del usuario del 2026-10-05, con las recomendaciones de D-1 a D-12 |
| AC-2 | cumplido | los tokens de D-2 están en los tres bloques de `globals.css`. El cálculo de contraste da AA en los 25 pares de cada modo, más el relleno de acción: mínimo 3,90:1 en el borde fuerte (se exige 3:1) y 5,70:1 en texto. `on-danger` en oscuro pasó de `#04201d` a `#160f33` (6,83:1), para no dejar un verde de Laguna en la paleta |
| AC-3 | cumplido | 102 de 102 end-to-end sobre `next start` (101 existentes y los 2 nuevos del marco; 8,4 min). Los pasos cambiados se listan abajo |
| AC-4 | cumplido | axe sin violaciones en claro y en oscuro en todos los estados de `expectAccessible` y en el caso nuevo del marco. Una corrida intermedia encontró `scrollable-region-focusable` en el gráfico diario a 375 px. El contenedor se hizo enfocable, con nombre y foco visible |
| AC-5 | cumplido | `frame.spec.ts`, casos 1 y 2 |
| AC-6 | cumplido | `grep` de clases de la paleta de Tailwind en `src/app/`: 0 |
| AC-7 | cumplido | `typecheck`, `lint` y `format:check` limpios; 992 de 992 unitarios y guardas (67 archivos); 674 de 674 de integración (43 archivos); `build` compila. El `git diff --ignore-cr-at-eol` de `src/modules/`, `package.json` y `package-lock.json` está vacío (`src/modules/crm/repository.ts` arrastra un cambio previo, solo de finales de línea, que no entra al commit) |
| AC-8 | cumplido | aprobadas por el usuario el 2026-10-05; 24 capturas (6 pantallas × claro y oscuro × 1280 y 375 px) sobre la semilla del piloto en la base local, entregadas en el Escritorio del usuario |
| AC-9 | cumplido | `b00b333`, con autorización del usuario del 2026-10-05; CI 37347328043 en `success` para ese `headSha` |
| AC-10 | cumplido | el usuario miró la demostración en producción, en los dos modos, y la dio por correcta el 2026-10-05. desplegado el 2026-10-05 por el procedimiento del README, ejecutado por Claude Code con aprobación manual del usuario; antes corría `29d6ccc`, anotado en `despliegues`. `HEAD` es `b00b333`, el servicio está `active`, sin errores en el journal; `/login` 200; lectura e ingestión v1 y v2 sin token, 401. La allowlist de `agente-demo` vive en `app.env`, que no cambió desde el 2026-10-03, y el cambio no toca `src/modules/` |
| AC-11 | cumplido, con los agregados de abajo | `git status` |

**Cambios en end-to-end existentes**, cada uno por un texto o un valor que la 15.1 cambia a propósito:

- `users.spec.ts`, caso 13: los colores de fondo esperados de los dos temas pasan a los de D-2 (`rgb(246, 245, 251)` y `rgb(12, 11, 29)`). La brief no los había listado: son consecuencia directa de D-2.
- `users.spec.ts`, caso 9; `products.spec.ts`, caso 8; `conversations.spec.ts`, caso 3; y `clients.spec.ts`, caso 4: el texto de la paginación pasa de «Página X de Y» a «Mostrando X a Y de Z ‹entidad›» (D-9). Los enlaces «Página anterior» y «Página siguiente» conservan su nombre accesible.

**Desvíos y agregados**:

- **D-4**: la organización quedó en la barra superior y no debajo de la marca. `users.spec.ts` la busca dentro del `banner`, que es además donde la encuentra un lector de pantalla. La marca Vixora queda sola en el panel.
- **Archivo fuera de la lista**: `informacion/category-icon.ts` y su test. Los pedía D-7 («una tabla chica de palabras clave… y un test unitario de la tabla»), pero la lista no los nombraba.
- **`page-header.tsx`** exporta también `SearchIcon` y `EditLink`, la lupa de los buscadores y el lápiz de las filas, para no sumar dos archivos.
- **El lápiz** se llama «Editar» y lleva el nombre de la fila como descripción (`aria-describedby`). Si el nombre de la fila fuera parte del nombre del enlace, chocaría con los end-to-end que buscan el enlace por ese nombre. Solo lo ve el `admin`, y lleva a `?editar=1`, la edición que ya existía en cada detalle.
- **El dashboard** muestra el nombre de cada métrica sin su número. El número sigue en el catálogo y en `definitions.ts`.
- **Productos** usa menos relleno horizontal en su tabla (diez columnas) y la tarjeta se desplaza en lugar de recortar.
- **Una falla intermitente**: en una de las corridas completas, `clients.spec.ts` caso 9 superó los 30 s mientras se sembraba la base de desarrollo en paralelo. Solo, pasó en 32,9 s con el arranque del servidor, y en la corrida final pasó.

**No certifica**: la estética, que juzga el usuario con las capturas; el aspecto en navegadores distintos de Chromium; el contraste de cada pantalla más allá de lo que mide axe; ni nada de la 15.2, la 15.3 o la Fase 16.

## Cierre de la subfase 15.1, 2026-10-05

- **Commits**: `bb21073` (Roadmap y este brief) y `b00b333` (15.1.1 y 15.1.2, en uno solo porque se verificaron juntas; CI `success`, run 37347328043, leída por `headSha`).
- **Criterios**: AC-1 a AC-11 cumplidos, con los desvíos y agregados de §Resultados, aceptados por el usuario al aprobar las capturas.
- **En producción**: `crm.vixoraai.app` corre `b00b333` desde el 2026-10-05, sin migraciones nuevas y con `app.env` sin tocar; la ingestión y la lectura siguen encendidas solo para `agente-demo`. La versión anterior, para volver atrás, es `29d6ccc`. El clasificador de permisos bloqueó el despliegue al asistente; lo corrió el asistente con la aprobación manual del usuario.
- **Nivel**: validado en integración (`producer-consumer`: Playwright con axe sobre PostgreSQL real) y verificado en producción por el usuario (`isolated-runtime`). No es «preparado para producción», que sigue siendo el gate de la Fase 13.
- **Revisión**: autoevaluación declarada (D-12). La subfase no abre ni cierra un gate, así que no lleva revisión independiente.
- **Lo que hereda el resto de la fase**: el orden y las filas por página (15.2); el dashboard interactivo, la variación, «Ver detalles» y las dos métricas nuevas (15.3); los detalles y formularios, de a uno (15.4 en adelante). Lo funcional de los bocetos, a la Fase 16.
