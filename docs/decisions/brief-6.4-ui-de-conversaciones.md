---
schema: task-brief.v1
task_id: 6.4
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 6.4 — UI de conversaciones

## Objetivo

Construir las pantallas de conversaciones y completar las de clientes sobre la interfaz pública de `conversations` (6.3):

1. **Pantalla 8, lista de conversaciones** (FR-CONV-01): filtros de período, estado, canal y cliente, paginada de a 25 y sin contenido de mensajes.
2. **Pantalla 9, detalle y timeline** (FR-CONV-02 y 03):
   - los mensajes, con la dirección nombrada con texto y el cuerpo siempre escapado;
   - "Cargar mensajes anteriores" de a 50;
   - el cambio de estado, solo para `admin`.
3. **Pantalla 7**: la última interacción (fecha y canal) y la sección de conversaciones del cliente, con filtro por estado (FR-CLI-04).
4. **Pantalla 6**: la columna "Última interacción" y el orden por ella (FR-CLI-04).
5. **Navegación**: "Conversaciones" en el marco común.
6. **Carrera de `document-title`**: endurecer los end-to-end que analizan con axe después de navegar (pendiente de la 6.1).

Nivel esperado: **validado en integración** (`producer-consumer`) para las cuatro pantallas, en claro y en oscuro.

## Ubicación en la Fase 6

- **Orden previsto**: 6.1 a 6.3 (cerradas) → **6.4**. En paralelo corre la cadena 6.5.1 → 6.5.2 → 6.5.3, sin empezar.
- **Notion**: "M. Pantallas 8 y 9 y completar la 7, con el cuerpo de los mensajes siempre escapado". Estado: "Bandeja de Entrada".
  - **Discrepancia**: Notion no nombra la pantalla 6. Su orden por última interacción quedó asignado a la Fase 6 por el brief-5.3 (D-3), y el HANDOFF lo pone en esta subfase. Este brief la incluye.
- **Necesario ahora**: las pantallas, sus Server Actions, sus tests unitarios de presentación y sus end-to-end.
- **Lo que llega después**:
  - el dashboard (pantalla 2) y las métricas: Fase 7;
  - la ingestión: 6.5;
  - el rendimiento con varias organizaciones: Fase 9.
- **Gates de entrada**:
  1. 6.3 cerrada, con la CI en verde en `887081d`.
  2. La CI del commit de cierre `ab550f1` en verde. Se verifica antes de implementar.

## Hallazgos de la verificación previa (2026-09-16)

1. **Estado**: `main` limpio en `ab550f1`. `src/app/(autenticado)/` tiene `productos/`, `clientes/` y `usuarios/`. La navegación tiene Inicio, Productos, Clientes y, para `admin`, Usuarios.
2. **El filtro de cliente de la pantalla 8** está dibujado como una caja "buscar cliente". En cambio, `listConversations` recibe un `clientId`, y la búsqueda por nombre es de `crm` (`searchClients`). Se resuelve en D-1.
3. **El período por defecto de la pantalla 8** es "Últimos 30 días" en el wireframe, con dos problemas:
   - las fechas de los seeds quedan fijadas en su primera corrida (6.2, D-2), así que con el tiempo la lista de desarrollo aparecería vacía;
   - "Limpiar filtros" volvería a un período que sigue filtrando.

   La pantalla 5 resolvió lo mismo con atajos y "todo" por defecto (4.4, D-4). Se resuelve en D-2.
4. **"Cargar mensajes anteriores" sin perder la posición** necesita agregar mensajes arriba de los que ya se ven. Hoy toda interacción de las pantallas es una Server Action que muta o un formulario GET. No hay lecturas desde el cliente, y los componentes de cliente no importan `@/modules/*`. Se resuelve en D-3.
5. **La pantalla 7 carga los datos del cliente y sus conversaciones por separado** (Screens §7). Ya usa `?auditoria=` para paginar la auditoría, así que la sección nueva necesita parámetros propios. Se resuelve en D-4.
6. **Datos de los end-to-end**: las conversaciones no se crean desde la UI, y la ingestión no existe todavía. Los specs vacían `messages` y `conversations` con `TRUNCATE`. Se resuelve en D-5.
7. **Carrera de `document-title`**: 12 análisis de axe en 4 specs, y ninguno espera el título. Se resuelve en D-6.
8. **El orden de la pantalla 6 no rompe los tests existentes**: sin conversaciones, `searchClientsByLastInteraction` deja a todos los clientes al final, en orden de nombre (6.3, D-1).
9. **Origen de las Server Actions**: Next.js 16.3 rechaza un `Origin` distinto del `Host` (SecurityModel). Esta subfase no crea Route Handlers mutantes, salvo que D-3 elija (b), que es solo de lectura. La verificación explícita de `Origin` sigue pendiente para el primero.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **Pantalla 8** en `src/app/(autenticado)/conversaciones/page.tsx`, con `filters.ts`, `messages.ts` y sus tests unitarios, siguiendo las convenciones de las pantallas 3 y 6:
   - filtros y página en la URL, y un formulario GET;
   - tabla en escritorio y tarjetas en móvil;
   - leyenda "Fechas en …";
   - "Sin cliente" cuando la conversación no tiene uno;
   - vacío distinto de sin resultados.
3. **Pantalla 9** en `conversaciones/[conversationId]/page.tsx`:
   - cabecera con el cliente enlazado a la pantalla 7 (sin teléfono), el canal y el estado;
   - un timeline como lista semántica, con separadores de día y hora en la zona de la organización;
   - la dirección como texto: "Cliente" o "Negocio";
   - el cuerpo como texto de React, nunca con `dangerouslySetInnerHTML` ni enlaces automáticos, y "(mensaje sin texto)" cuando es nulo;
   - "Cargar mensajes anteriores" según D-3;
   - el cambio de estado para `admin`: una Server Action que registra `logEvent`, con un botón "Cambiando…" deshabilitado mientras responde y el resultado anunciado con `aria-live`. A `viewer` no se le entrega el control;
   - los estados `NOT_FOUND`, `FORBIDDEN` e `INTERNAL`, como en las pantallas existentes.
4. **Pantalla 7**:
   - "Última interacción: fecha · canal", o "Sin interacciones";
   - la sección "Conversaciones", con su filtro de estado, su paginación y su carga según D-4;
   - los vacíos "Sin conversaciones registradas." y "Ninguna conversación con este estado." con "Limpiar filtro".
5. **Pantalla 6**: lista con `searchClientsByLastInteraction`, columna "Última interacción" (o "Sin interacciones") y leyenda de zona horaria. En móvil, la tarjeta muestra la fecha.
6. **Marco común**: "Conversaciones" en la navegación, para los dos roles.
7. **End-to-end** en `tests/e2e/conversations.spec.ts`, con los datos según D-5:
   - lista: filtros, período, paginación, vacío y sin resultados;
   - detalle: orden cronológico, dirección con texto, cuerpo con marcado mostrado literal (el HTML no contiene la etiqueta interpretada), mensaje sin texto y carga de anteriores conservando los ya visibles;
   - cambio de estado como `admin`, con el anuncio y la auditoría en la base;
   - `viewer` sin el control, y la acción forzada rechazada;
   - `NOT_FOUND` para una conversación de otra organización;
   - ausencia de cuerpos en el HTML y las respuestas RSC de la pantalla 8;
   - axe en cada estado, en claro y en oscuro, teclado, foco y móvil a 375 px.
8. **`tests/e2e/clients.spec.ts`**: casos de la última interacción y de las conversaciones del cliente, incluido el orden de la pantalla 6. En esos casos se comprueba que un `viewer` sigue sin recibir el teléfono completo.
9. **D-6** en los cuatro specs existentes.
10. **Documentación**:
    - Screens y los wireframes 06 a 09: estado implementado y desvíos;
    - TraceabilityMatrix y TestingStrategy;
    - RepositoryStructure;
    - SecurityModel, solo si D-3 elige (b).

## Alcance excluido

- Cambios en `src/modules/`. Si una pantalla necesita algo que la interfaz de la 6.3 no da, es una condición de detención.
- Migraciones, seeds y dependencias nuevas.
- Enviar o responder mensajes, buscar por contenido y adjuntos.
- Dashboard y métricas (Fase 7).
- Ingestión y su endpoint (6.5).
- Cambios de tokens en `globals.css`, salvo que el contraste AA lo exija. Ese caso es una condición de detención.
- `ci.yml`.

## Archivos o componentes autorizados

Lista cerrada:

- `src/app/(autenticado)/conversaciones/**` (nuevo).
- `src/app/(autenticado)/clientes/page.tsx`, `clientes/[clientId]/page.tsx` y archivos nuevos dentro de `clientes/` para la sección de conversaciones.
- `src/app/(autenticado)/layout.tsx` y `src/app/_components/app-nav.tsx`, solo para la navegación.
- `src/app/_components/` y `src/app/_format/`: componentes o formatos compartidos nuevos, como la etiqueta de estado o el separador de día, con sus tests.
- `tests/e2e/conversations.spec.ts` (nuevo).
- `tests/e2e/clients.spec.ts`: casos nuevos y D-6.
- `tests/e2e/login.spec.ts`, `products.spec.ts` y `users.spec.ts`: solo D-6.
- Si D-3 elige (b), un Route Handler de lectura dentro de `conversaciones/`.
- Los documentos del punto 10 del alcance incluido.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-CONV-01 a 03, FR-CLI-04 a 06 y FR-AUD-01.
2. [Screens.md](../product/Screens.md): reglas comunes y §6 a §9. Wireframes [06](../product/wireframes/06-lista-de-clientes.md) a [09](../product/wireframes/09-detalle-de-conversacion.md).
3. Interfaz pública de [conversations](../../src/modules/conversations/index.ts) y [brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md).
4. [SecurityModel.md](../architecture/SecurityModel.md): CSRF, autorización y enmascarado.
5. Precedentes de UI:
   - [brief-4.4](brief-4.4-ui-de-productos-e-inventario.md): período, datos por spec y controles;
   - [brief-5.3](brief-5.3-ui-de-clientes.md): H-5 en HTML y RSC, y desvíos de wireframes;
   - [brief-4.0](brief-4.0-diseno-visual-base.md): tokens y modo oscuro.

## Dependencias

- 6.3 cerrada (verificado) y CI del cierre en verde (se verifica).
- `npm run build` antes de cada corrida end-to-end.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-6 según la recomendación: (a) en las seis. También autorizó pasar la tarea 6.4 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Filtro de cliente en la pantalla 8

- **Opciones**:
  - (a) **Búsqueda en dos pasos, sin JavaScript**:
    - la caja "Cliente" envía `?buscar_cliente=` y la página consulta `crm.searchClients` con todos los clientes, activos o no;
    - con un solo resultado, aplica `?cliente=<id>`;
    - con varios, muestra hasta 25 enlaces para elegir;
    - con ninguno, dice "Ningún cliente con ese nombre";
    - el cliente elegido se muestra como "Cliente: María Gómez · Quitar".

    La pantalla 7 suma "Ver en Conversaciones", un enlace con `?cliente=`.
  - (b) **Solo por enlace**: `?cliente=` llega desde la pantalla 7, y la 8 no tiene caja de búsqueda. Es un desvío del wireframe.
  - (c) **Autocompletar en el cliente**: requiere lecturas desde el navegador, igual que D-3 (b), y más JavaScript.
- **Recomendación**: (a). Respeta el wireframe con el patrón de formularios GET que ya usan las pantallas. La búsqueda es la de `crm`, así que encuentra también por teléfono completo sin mostrarlo.

### D-2 — Período de la pantalla 8

- **Opciones**:
  - (a) **Los atajos de la pantalla 5** ("Todo", 7, 30 y 90 días, y "Personalizado" con desde y hasta), **con "Todo" por defecto**. Es un desvío del wireframe, registrado en él.
  - (b) **"Últimos 30 días" por defecto**, como el wireframe. "Limpiar filtros" volvería a esos 30 días, y los datos de desarrollo irían desapareciendo de la vista inicial.
- **Recomendación**: (a). Es la convención de la 4.4, y "Limpiar filtros" muestra todo.

### D-3 — "Cargar mensajes anteriores"

En las tres opciones, el servidor entrega los 50 mensajes más recientes al abrir la pantalla.

- **Opciones**:
  - (a) **Componente de cliente con una Server Action de lectura** (`loadOlderMessages`), declarada en `actions.ts` de la ruta y sin mutación ni `logEvent`:
    - el componente agrega los mensajes arriba de los visibles y conserva la posición de lectura;
    - mientras carga, muestra un indicador;
    - el cursor es el valor opaco `before`;
    - el cuerpo llega como dato y se renderiza como texto.
  - (b) **Route Handler `GET`** que devuelve JSON. Es la primera API de lectura del proyecto y suma una superficie que documentar en SecurityModel.
  - (c) **Solo URL**: `?anteriores=k` encadena k páginas en el servidor, con un tope, y usa un ancla al primer mensaje que ya se veía. No usa JavaScript, pero cada carga recarga la pantalla y la posición depende del ancla.
- **Recomendación**: (a). Cumple "sin perder la posición", reutiliza la sesión y el control de origen de las Server Actions, y no abre una API. Las Server Actions se ejecutan de a una, y eso alcanza para un botón.

### D-4 — Sección de conversaciones de la pantalla 7

- **Opciones**:
  - (a) **La sección carga por separado**, con `Suspense` y un skeleton, y usa sus propios parámetros de URL: `?estado_conv=` y `?pagina_conv=`, independientes de `?auditoria=`. Cada enlace de paginación conserva los parámetros de la otra sección.
  - (b) **Todo en la misma carga**, sin `Suspense`. Es más simple, pero se desvía de Screens §7.
- **Recomendación**: (a).

### D-5 — Datos de los end-to-end de conversaciones

- **Opciones**:
  - (a) **Cada caso inserta sus filas con SQL** (`db.execute`), con un helper del spec:
    - organización, cliente, conversación y mensajes, con fechas fijas;
    - mensajes con marcado, uno sin texto y 60 para la paginación;
    - una conversación en otra organización.

    Se declaran como fixtures sintéticos, y `beforeEach` vacía con `TRUNCATE` como hoy.
  - (b) **Reutilizar `seedConversations`** con una fecha de referencia fija. Acopla los casos al seed, en contra de la 6.2 (D-1) y la 4.4 (D-5).
- **Recomendación**: (a).

### D-6 — Carrera de `document-title`

- **Opciones**:
  - (a) **En el helper de axe de cada spec**, esperar `await expect(page).toHaveTitle(/.+/)` antes de analizar. Toca una función por spec.
  - (b) Esperar el título solo en `clients.spec.ts`, caso 1.
- **Recomendación**: (a). La carrera puede aparecer en cualquier análisis que siga a una navegación en el cliente.

## Invariantes

- La pantalla 8 y la sección de la 7 no muestran ni reciben el cuerpo de ningún mensaje. Se verifica en el HTML y en las respuestas RSC.
- El cuerpo de un mensaje se renderiza siempre como texto escapado.
- Ni `admin` ni `viewer` ven el teléfono en las pantallas 8 y 9. En la 6 y la 7 sigue el enmascarado para `viewer` (H-5).
- El control de cambio de estado no se entrega a `viewer`, y la acción rechaza su pedido en el servidor.
- La dirección y el estado nunca dependen solo del color o de la alineación.
- Los componentes de cliente no importan `@/modules/*`.
- Solo se usan tokens de `globals.css`.
- Toda fecha se muestra en la zona de la organización, con su leyenda.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: las pantallas 6 a 9 cumplen Screens y sus wireframes, salvo los desvíos registrados en cada wireframe.
- **AC-3**: `tests/e2e/conversations.spec.ts` y los casos nuevos de `clients.spec.ts` pasan, con axe sin violaciones en cada estado, en los dos modos. Queda registrada la evidencia de mutación de dos casos:
  - el escape: con el cuerpo interpretado como HTML, el caso falla;
  - la ausencia de cuerpos en la pantalla 8: con un cuerpo agregado a la vista, el caso falla.
- **AC-4**: `npm run test` pasa completo, y `npm run test:e2e` pasa completo con los specs existentes cambiados solo por D-6 y los casos nuevos.
- **AC-5**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-6**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`.
- **AC-7**: `git status` muestra solo archivos autorizados, y los documentos reflejan las resoluciones y los desvíos.

## Pruebas y evidencia requerida

- **Evidencia `producer-consumer`**: Chromium contra `next start`, con las Server Actions, `conversations`, `crm`, `audit` y PostgreSQL real, sin mocks. Los datos insertados por SQL se declaran como fixtures sintéticos.
- **Evidencia de mutación**: los dos casos de AC-3. El archivo se restaura después de cada corrida.
- **Tests unitarios**: filtros de URL, mensajes y formatos nuevos.
- **Evidencia de CI**: una ejecución en verde.

**Nivel resultante esperado**: **validado en integración** para las pantallas 6 a 9.

**No se valida**:

- el rendimiento con volumen en pantalla (Fase 9);
- la ingestión (6.5);
- lectores de pantalla reales: solo axe y teclado.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si una pantalla necesita cambios en `src/modules/`, una migración, un seed o una dependencia.
- Si el contraste AA exige tocar `globals.css`.
- Si un spec existente necesita cambios fuera de D-6.
- Si un test muestra un cuerpo de mensaje o un teléfono completo donde no corresponde, y la causa no está en la presentación.
- Antes de cualquier commit, push o cambio en Notion.

## Cierre (2026-09-16)

Cerrado con autorización del usuario. Se cumplen los siete criterios; la condición de detención del caso 1 de `clients.spec.ts` quedó resuelta por el usuario, como detalla la ejecución. La CI quedó en verde en el commit `3904548` ([ejecución 35153243944](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35153243944), todos los pasos). Nivel alcanzado: **validado en integración** para las pantallas 6 a 9. La evidencia está en [CHANGELOG.md](../../CHANGELOG.md).

## Ejecución (2026-09-16)

La implementación está terminada y el cierre está pendiente. Se activó una condición de detención, que el usuario resolvió.

### Condición de detención

- **Un spec existente necesitaba cambios fuera de D-6.** El caso 1 de `clients.spec.ts` comprobaba que "Última interacción" no aparecía, con el comentario "Sin conversaciones hasta la Fase 6". El usuario autorizó invertir esas dos aserciones: el detalle y la lista muestran "Sin interacciones". No cambió nada más de ese caso.

### Ajustes durante la implementación

- **Registro de la lectura de mensajes (D-3)**: la Server Action no registra `logEvent` en las lecturas normales, pero sí ante un error inesperado. Sin ese registro, el código que ve el usuario no tendría un evento al que remitir.
- **`FORBIDDEN` en el cambio de estado no revalida la página.** El caso 8 lo encontró: la página se regeneraba para alguien que ya no era `admin`, el formulario desaparecía y el mensaje de rechazo se perdía con él. La conversación no cambió, así que no hay datos que refrescar. Los demás rechazos sí revalidan.
- **El formulario GET envía todos sus campos**, como en las demás pantallas. Los tests comprueban el parámetro que importa, y los enlaces usan la URL canónica.
- **Presentación**:
  - `startsDay` vive en `messages.ts`, para que el componente del timeline no arrastre el formateo de fechas al navegador;
  - `formatDate` y `formatTime` se sumaron a `_format`, con su test;
  - la tabla de conversaciones y la etiqueta de estado son compartidas por las pantallas 7 y 8.

### Evidencia

- **End-to-end**:
  - `tests/e2e/conversations.spec.ts` pasa 10 casos;
  - `clients.spec.ts` pasa 15: los 12 anteriores y los casos 13 a 15;
  - `npm run test:e2e` pasa 63 de 63.
- **Mutaciones** (AC-3), con el archivo restaurado después de cada una:
  - con el cuerpo renderizado con `dangerouslySetInnerHTML`, el caso 5 falla: el texto visible pasa a "Paso mañana ver", sin el marcado;
  - con el último cuerpo de la primera conversación agregado a la pantalla 8 (en un texto solo para lectores), el caso 2 falla, porque el cuerpo aparece en lo que recibe el navegador.
- **Suite local**: `npm run test` pasa 546 de 546, con 13 unitarios nuevos (filtros, textos, timeline y formatos).
- **Con el contenedor detenido**: pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (211) y `build`, y `db:generate` no produce migraciones.
- **`src/modules/`**: sin cambios.

Pendiente al terminar la ejecución (resuelto en el cierre): commit, push, CI (AC-6) y cierre.
