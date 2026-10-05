---
schema: task-brief.v1
task_id: "15.4"
task_type: implementation
generated_at: 2026-10-05
---

# Brief: 15.4 — Pantallas de detalle y formularios

**Estado: aprobado el 2026-10-05 por el usuario, con las recomendaciones de D-1 a D-11.** Ese mismo día autorizó crear la tarea en Notion y el commit de este brief, del Roadmap y del ADR 0016. La aprobación no autoriza ningún commit, ningún cambio en Notion, ninguna dependencia nueva ni el despliegue a producción: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` (tests unitarios), `producer-consumer` (Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro) e `isolated-runtime` (la versión desplegada en producción, mirada por el usuario).
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**. No certifica «preparado para producción».
- **Orden**: segunda subfase de la Fase 15 en ejecución, antes de la 15.2, por decisión del usuario del 2026-10-05 ([Roadmap](../planning/Roadmap.md), §Fase 15). Corre en paralelo con la 13.5.2-b: si la 13.5.2-b arranca, se pausa en el último punto con la CI en verde.

## Objetivo

Que las pantallas internas del CRM —el detalle, el alta y la edición de productos, clientes, información del negocio y usuarios, y el detalle de una conversación— se vean como los bocetos del usuario, en claro y en oscuro y con contraste AA, **con los campos que ya existen** y sin cambiar ningún dato, regla, contrato ni comportamiento. Es la continuación de la [15.1](brief-15.1-identidad-visual-y-marco.md), que dejó la paleta, el marco y los componentes compartidos.

## Situación

El 2026-10-05, después de cerrar la 15.1, el usuario trajo once bocetos de pantallas internas, cada uno en claro y en oscuro: el detalle de un cliente (dos variantes), «Nuevo cliente», el detalle de una conversación, el detalle de una entrada de información, «Nueva entrada», el detalle de un producto (dos variantes), «Nuevo producto», «Editar usuario» y «Nuevo usuario». Pidió usarlos como referencia «para lograr un resultado visualmente atractivo y una operatividad mejorada», sabiendo que dibujan campos que todavía no existen.

Ese mismo día decidió el destino de lo que no existe: los campos nuevos van a la **Fase 17**, el costo y el margen a la **Fase 18** (ERP, [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), propuesto), y las etiquetas, las notas de la conversación y responder desde el CRM a la **Fase 16**.

Hoy, cada detalle tiene su edición en la misma ruta (`?editar=1`), y las acciones de desactivar piden confirmación en un segundo paso de la URL. Productos tiene además dos subpantallas, el historial de precios (`precios/`) y los movimientos de stock (`movimientos/`), cada una con su formulario.

## Hallazgos antes de diseñar

- **H-1. Los bocetos dibujan campos que no existen.** Clientes: email, tipo de cliente, documento, CUIT, dirección, ciudad, provincia, código postal, empresa, cargo, segmento, foto y etiquetas. Productos: imágenes, costo, margen, código de barras, peso, dimensiones, ubicación, estante, «visible en catálogo» y etiquetas. Información: horarios, zonas y costos, métodos de entrega y un mapa. Conversación: notas, etiquetas, el campo para escribir y los tildes de leído. Se resuelve en D-1 y D-2.
- **H-2. Las pestañas de los bocetos no tienen contenido propio.** «Resumen», «Conversaciones», «Información», «Notas» e «Historial» en el cliente; «Horarios», «Zonas y costos» y «Condiciones» en la información. Con los datos de hoy, casi todas mostrarían lo mismo que el resumen o nada. Se resuelve en D-3.
- **H-3. «Nuevo producto» pide precio y stock inicial.** Hoy el alta crea el producto, y el precio y el stock se cargan después, en sus subpantallas, cada uno con su historial inmutable. Juntarlos cambia la acción del alta. Se resuelve en D-4.
- **H-4. «Nuevo usuario» promete un email.** El boceto dice «el usuario recibirá un email con las instrucciones». El CRM no envía emails: muestra una contraseña inicial de un solo uso. Se resuelve en D-8.
- **H-5. Los end-to-end localizan estas pantallas por sus textos.** Los títulos de sección, los términos de las listas de definición (`dt`), los botones («Desactivar», «Reactivar», «Guardar»…) y la paginación del historial. Si se conservan los nombres accesibles, los pasos no cambian. Cada afirmación que cambie por un texto nuevo se lista, como en la 15.1.
- **H-6. El detalle del cliente pagina sus conversaciones con «Página X de Y».** Es la misma paginación que la 15.1 reemplazó en los listados.

## Decisiones pendientes

### D-1 — Qué piezas de los bocetos entran en la 15.4

| Pieza de los bocetos | Destino recomendado | Motivo |
|---|---|---|
| Encabezado con «Volver a…», avatar o ícono, nombre, estado como píldora y acciones («Editar», «Desactivar») | **15.4** | reubica lo que ya existe |
| Datos en tarjetas con ícono por sección y una lista de definición con ícono por fila | **15.4** | mismos datos |
| Formularios en tarjetas por sección, con «Cancelar» y el botón principal abajo | **15.4** | mismos campos y la misma acción |
| Historial de auditoría como tabla en su tarjeta, con la paginación de la 15.1 | **15.4** | mismos datos |
| Detalle de producto: precio, stock y punto de reposición en tarjetas, con enlaces a «Historial de precios» y «Movimientos de stock» | **15.4** | las subpantallas ya existen |
| Las subpantallas de precios y de movimientos con la misma presentación, aunque no tengan boceto | **15.4** | que no queden con el estilo viejo al lado de las nuevas |
| Estadísticas del cliente (D-6) | **15.4**, con lo que ya existe | se derivan de datos ya cargados |
| Mensajes de la conversación como burbujas, a la izquierda los entrantes y a la derecha los salientes, con el separador de día | **15.4** | misma línea de tiempo |
| «Cambiar estado» de la conversación | **15.4** | el formulario de estado ya existe |
| Campos que no existen (H-1) | **Fase 17** | datos nuevos |
| Costo y margen | **Fase 18** | ERP, ADR 0016 |
| Imágenes de producto y foto de perfil | **Fase 17, con ADR** | no hay dónde guardar archivos |
| Etiquetas, notas de la conversación y el menú «…» | **Fase 16** | funciones nuevas |
| El campo para escribir y enviar un mensaje | **Fase 16, con ADR** | es responder desde el CRM |
| Tildes de leído | **fuera** | el CRM no recibe el estado de entrega |
| Buscador global, campana, «Sistema» y versión | **como en la 15.1** | D-1 de la 15.1 |

*Recomendación: la tabla tal como está.*

### D-2 — Los campos que todavía no existen

- (a) no se dibujan: la tarjeta muestra solo lo que existe, y una sección entera sin datos no aparece;
- (b) se dibujan deshabilitados, con «Próximamente».

*Recomendación: (a).* Un campo inerte en una demostración invita a usarlo y no hace nada. Cuando llegue la Fase 17, cada campo entra en su tarjeta.

### D-3 — Pestañas

- (a) sin pestañas: las secciones van una debajo de otra, como en el boceto de una sola columna. En el producto, una barra de enlaces lleva a las subpantallas que ya existen (historial de precios y movimientos de stock), con la actual marcada con `aria-current`;
- (b) pestañas como en los bocetos, aunque varias repitan el resumen o queden vacías.

*Recomendación: (a).* Una pestaña tiene que mostrar algo distinto. Cuando las Fases 16 y 17 traigan notas, etiquetas o información estructurada, las pestañas se agregan con contenido real.

### D-4 — Precio y stock en «Nuevo producto»

- (a) como hoy: el alta crea el producto, y el precio y el stock inicial se cargan después, desde sus tarjetas en el detalle, con enlaces visibles a cada formulario;
- (b) juntarlos en el alta: la acción crearía el producto, su primer precio y su primer movimiento en una sola operación.

*Recomendación: (a).* La (b) cambia una acción y cruza tres módulos (`catalog`, `inventory` y la auditoría), y esta subfase no toca `src/modules/`. Si el usuario la quiere, es una subfase propia, con su brief.

### D-5 — Teléfono del cliente

El boceto muestra un selector de país con bandera y el número aparte.

- (a) un solo campo, como hoy, con la indicación «+54 9 351 555 1234» y la misma validación E.164;
- (b) el selector de país.

*Recomendación: (a).* El selector cambia cómo se arma el valor que valida el servidor, y la bandera es un dibujo más que mantener. Se puede reconsiderar cuando haya clientes de otros países.

### D-6 — Estadísticas del cliente

El boceto muestra «21 total mensajes», «5 conversaciones» y «12 días desde la última interacción».

- (a) dos tarjetas con lo que la página ya carga: la cantidad de conversaciones (el total de la lista) y los días desde la última interacción (calculados en el servidor con la zona horaria de la organización). El total de mensajes no se muestra, porque exigiría una consulta nueva;
- (b) las tres, con una consulta nueva en `src/modules/conversations`.

*Recomendación: (a).* La (b) toca `src/modules/`. El total de mensajes puede llegar en la 15.3 o en la Fase 16, con su consulta.

### D-7 — Detalle de la conversación

- (a) los mensajes como burbujas (entrantes a la izquierda en `surface-muted`, salientes a la derecha en `action`), con la hora y quién lo envió (el agente o una persona) como hoy, y el separador de día; a la derecha, una tarjeta con los datos del cliente y otra con los de la conversación (estado, canal, creada, último mensaje) y el formulario de estado restilizado. Sin campo para escribir, sin tildes y sin «Cerrar conversación» aparte, porque cerrar ya es una opción del formulario de estado;
- (b) agregar un botón «Cerrar conversación» que envíe el mismo formulario con el estado fijo.

*Recomendación: (a).* La (b) duplica una acción que ya existe y suma un formulario más que probar. Las burbujas conservan el texto que hoy identifica a quien envía, para que no dependan solo del color.

### D-8 — El aviso de «Nuevo usuario»

- (a) el recuadro «Importante» del boceto, con lo que realmente pasa: «Al crear el usuario se muestra una contraseña inicial de un solo uso. Compartila por un medio seguro: el usuario la cambia al entrar.»;
- (b) el texto del boceto.

*Recomendación: (a).* El texto del boceto promete un email que el CRM no envía.

### D-9 — Contadores de caracteres

Los bocetos muestran «0/500» y «0/4000» bajo los campos de texto largo.

- (a) el límite como texto fijo debajo del campo («Hasta 4000 caracteres»), donde el servidor ya valida un máximo;
- (b) un contador que cambia mientras se escribe, con JavaScript y una región `aria-live`.

*Recomendación: (a).* Informa el límite sin JavaScript y sin anuncios repetidos para un lector de pantalla. El servidor sigue siendo quien valida.

### D-10 — Etapas y despliegue

- (a) cinco etapas, cada una con su CI en verde:
  - **15.4.1 — Productos**: detalle, alta, edición, historial de precios y movimientos de stock;
  - **15.4.2 — Clientes**: detalle, alta y edición;
  - **15.4.3 — Conversaciones e Información**: el detalle de la conversación, y el detalle, el alta y la edición de una entrada;
  - **15.4.4 — Usuarios**: el detalle con su edición y el alta;
  - **15.4.5 — Despliegue a producción**, con la CI del SHA exacto en verde, la autorización del usuario y el [README de producción](../../deploy/production/README.md), §Desplegar. Sin migraciones ni cambios en `app.env`. Para volver atrás, `b00b333`.

  Si el usuario lo pide, se despliega antes, al final de cualquier etapa;
- (b) una sola etapa.

*Recomendación: (a).* Son cuatro módulos independientes: cada etapa se verifica y se puede mostrar por sí sola.

### D-11 — Revisión

- (a) autoevaluación declarada, con axe en los dos modos como evidencia externa al autor;
- (b) además, una revisión independiente de solo lectura antes de desplegar.

*Recomendación: (a).* La subfase no abre ni cierra un gate y solo cambia la presentación, como la 15.1.

## Alcance incluido

1. Registrar la resolución de D-1 a D-11.
2. **Componentes compartidos** en `src/app/_components/`: la tarjeta de sección con ícono y título, la lista de definición con ícono por fila, el encabezado de detalle (volver, avatar o ícono, título, estado y acciones), la tarjeta de estadística y la barra de enlaces de D-3, con tests unitarios donde haya lógica.
3. **Productos** (15.4.1), **Clientes** (15.4.2), **Conversaciones e Información** (15.4.3) y **Usuarios** (15.4.4), según D-1 a D-9.
4. La paginación de las conversaciones del cliente (H-6) y la del historial de auditoría, con el componente de la 15.1.
5. Las afirmaciones de texto de los end-to-end que cambien a propósito, listadas con su motivo.
6. **Despliegue** según D-10.

## Alcance excluido

- Todo lo que D-1 manda a las Fases 16, 17 o 18, o deja fuera.
- Cambios en `src/modules/`, en las consultas, en las migraciones, en los contratos o en las acciones del servidor (`actions.ts`), salvo que un texto de un mensaje de `messages.ts` cambie.
- Los listados, el marco y el dashboard, que son de la 15.1, la 15.2 y la 15.3.
- La pantalla de inicio de sesión y el cambio de contraseña.
- Librerías nuevas y cambios en `package.json`.

## Archivos o componentes autorizados

- **Nuevos en `src/app/_components/`**: `section-card.tsx`, `detail-list.tsx`, `detail-header.tsx`, `stat-tile.tsx` y `sub-nav.tsx`, con sus tests donde haya lógica. `icons.tsx`, `form-styles.ts`, `page-header.tsx` y `pagination.tsx` pueden ampliarse.
- **Productos**: en `src/app/(autenticado)/productos/`, `nuevo/page.tsx`, `product-form.tsx`, `messages.ts`, y en `[productId]/`, `page.tsx`, `product-actions.tsx`, `precios/page.tsx`, `precios/price-form.tsx`, `precios/messages.ts`, `movimientos/page.tsx` y `movimientos/adjust-form.tsx`.
- **Clientes**: `clientes/nuevo/page.tsx`, `clientes/client-form.tsx`, `clientes/messages.ts`, `clientes/phone-text.tsx`, y en `clientes/[clientId]/`, `page.tsx`, `client-actions.tsx` y `client-conversations.tsx`.
- **Conversaciones**: en `conversaciones/[conversationId]/`, `page.tsx`, `status-form.tsx` y `timeline.tsx`; `conversaciones/status-badge.tsx`.
- **Información**: `informacion/nueva/page.tsx`, `informacion/knowledge-form.tsx`, `informacion/messages.ts`, y en `informacion/[entryId]/`, `page.tsx` y `entry-actions.tsx`.
- **Usuarios**: `usuarios/nuevo/page.tsx`, `usuarios/nuevo/new-member-form.tsx`, `usuarios/messages.ts`, y en `usuarios/[memberId]/`, `page.tsx` y `member-forms.tsx`.
- `tests/e2e/`: solo las afirmaciones de texto que cambien a propósito (H-5 y H-6), en los archivos que las tengan. Cada cambio se lista en el informe con su motivo. **Ningún otro paso cambia.**
- Documentación: [Screens.md](../product/Screens.md) (nota fechada de las pantallas internas), este brief y el [índice](README.md).

## Fuentes de verdad

1. [brief-15.1](brief-15.1-identidad-visual-y-marco.md): los tokens, los componentes compartidos y las reglas de presentación.
2. [brief-4.0](brief-4.0-diseno-visual-base.md): tokens, prohibición de la paleta de Tailwind y axe en los dos modos.
3. [Screens.md](../product/Screens.md): breakpoints y pantallas.
4. Los bocetos del usuario del 2026-10-05, como referencia de estilo, nunca de datos.

## Invariantes

- Ningún color fuera de los tokens. La prohibición de la paleta de Tailwind en `src/app/` sigue vigente.
- Ningún cambio de comportamiento: las mismas rutas, los mismos parámetros de URL (incluidos `?editar=1` y las confirmaciones de desactivar), los mismos campos con los mismos `name`, las mismas validaciones, las mismas acciones del servidor y los mismos nombres accesibles, salvo los textos listados.
- `src/modules/` no cambia.
- El enmascarado del teléfono para `viewer` y lo que ve y puede hacer cada rol siguen iguales: la presentación nueva no muestra ningún dato que hoy no se muestre y no muestra a `viewer` ninguna acción de `admin`.
- Todo funciona sin JavaScript donde hoy funciona sin JavaScript.
- La CSP no cambia: sin estilos ni scripts en línea.
- `package.json` no cambia.

## Criterios de aceptación

- **AC-1**: D-1 a D-11 tienen resolución del usuario con fecha.
- **AC-2**: los end-to-end existentes pasan en local sobre `next start`, con sus pasos sin cambios salvo los listados, y el recuento en el informe.
- **AC-3**: axe no informa violaciones WCAG 2.x A ni AA, en claro ni en oscuro, en todos los estados que ya cubre `expectAccessible`.
- **AC-4**: `grep` no encuentra clases de la paleta por defecto de Tailwind en `src/app/`.
- **AC-5**: `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit`, `test:integration` y `build` pasan, y el `git diff` de `package.json`, `package-lock.json` y `src/modules/` está vacío.
- **AC-6**: capturas de cada pantalla de la etapa, en claro y en oscuro, a 1280 y a 375 px, entregadas al usuario para su revisión **antes** de desplegar.
- **AC-7**: la CI en verde en el commit de cada etapa, leída por `headSha` y `conclusion`.
- **AC-8** (15.4.5): producción corre el SHA de AC-7; `/login` responde 200; la ingestión y la lectura siguen respondiendo solo a `agente-demo`; y el usuario mira las pantallas en producción.
- **AC-9**: `git status` muestra solo archivos autorizados.

## Pruebas y evidencia requerida

- **`deterministic`**: los tests unitarios, los existentes y los de los componentes nuevos.
- **`producer-consumer`**: Playwright con Chromium sobre `next start` contra PostgreSQL real, con axe en los dos esquemas.
- **`isolated-runtime`**: el despliegue en producción y la mirada del usuario (AC-8).
- **No certifica**: la estética, que juzga el usuario con las capturas; el aspecto en navegadores distintos de Chromium; ni nada de las Fases 16 a 18.

## Condiciones de detención

- Antes de commit, push, merge o deploy.
- Antes de instalar cualquier dependencia.
- Si un end-to-end existente exige cambiar algo distinto de un texto listado: se detiene y se informa, porque es un cambio de comportamiento.
- Si una pieza de los bocetos exige tocar `src/modules/` o una acción del servidor: se detiene. Va a la fase que corresponda según D-1.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.
- Antes de cambiar el estado en Notion si el usuario no confirmó el cierre.
