---
schema: task-brief.v1
task_id: "24.3.1"
task_type: implementation
generated_at: 2026-10-28
---

# Brief: 24.3.1 — Conversaciones como chat

**Estado: aprobado el 2026-10-28 por el usuario, con las recomendaciones de D-3 a D-6.** Las dos primeras las tomó al recorrer la 24.3 en producción: **una fila por cliente con todo su historial en un solo hilo** (D-1, a) y **el panel de vista previa en escritorio, sin texto en las filas** (D-2, a). Eso fija además el panel vacío sin `?ver=` (D-3, a), «Actividad del agente» en el contexto (D-4, a), la tarjeta del teléfono sin la línea de reparación (D-5, b), y la revisión independiente antes del despliegue al cerrar (D-6, a).

## Objetivo

Que la bandeja y el hilo de conversaciones queden **como los mockups de la v2** (`docs/ui-redesign/v2/03-conversaciones/`: 01, 02, 03, 04 y 05), salvo lo que una regla vigente excluye, y que cada diferencia que quede se declare. Es la segunda vuelta de la [24.3](brief-24.3-conversaciones.md): aquella llevó el contenido de la v2, esta lleva la forma.

## Situación

El usuario recorrió la 24.3 en producción (`c3ddae4`) y dijo que no quedó como la imagen. Lo comparó el agente con Claude in Chrome, en la sesión del usuario (organización «iPhone Demo»), contra los mockups:

- **Bandeja (01, 03):**
  - es una tabla con columnas (Cliente, Canal, Estado, Inicio, Último mensaje, Mensajes), no una lista de chats;
  - **un cliente sale una vez por conversación**: en «Todas», Benja Murillo tiene dos filas, una pendiente y una abierta. En la v2, como en WhatsApp, cada cliente es un chat;
  - no hay panel a la derecha;
  - «Buscar cliente» lleva rótulo y ayuda en su propio bloque, y «Más filtros» es un enlace; en la v2 van en una sola línea con los chips, y «Más filtros» es un botón.
- **Hilo (02, 04, 05):**
  - «Volver a conversaciones» en lugar de la flecha con el título «Conversaciones» y las migas;
  - «Más acciones» con texto en lugar del botón «···»;
  - la tarjeta «Mensajes» con título, que la v2 no tiene;
  - la fecha en una línea en lugar de una píldora («27 oct», «Hoy · 27 oct»);
  - las burbujas sin avatar; las del negocio en violeta oscuro con texto blanco en lugar de lila claro; el autor y la hora arriba en lugar de autor arriba y hora abajo;
  - la franja del agente activo, blanca y sin ícono de agente; la v2 la pinta lila, con «Las respuestas automáticas están habilitadas», y pide confirmar antes de tomar (05);
  - la nota al pie sin el aviso amarillo «Solo el equipo puede ver esta nota. No se envía por WhatsApp.» ni el botón ámbar con candado.
- **Contexto (02, 05):** los datos están, la forma no:
  - cada bloque tiene que ser su propia tarjeta, con ícono y rótulo en mayúsculas (REPARACIÓN, TURNO, ETIQUETAS);
  - el título va en negrita («OS-000006 · iPhone 15») y el estado, en su propia línea;
  - «Ver ficha» va arriba a la derecha, con ícono;
  - sin turno, la v2 dice «Sin turno asignado» con «Crear turno»; hoy el bloque no aparece;
  - «Acciones relacionadas» es una lista con ícono y flecha, no dos botones.

*Al margen, para el agente*: en esa conversación el agente dijo «te pedimos el turno» para el jueves 29 a las 17:00 y el viernes 30 a las 11:00, y ninguno de los dos existe en el CRM. El único turno futuro del cliente es el del 28 a las 16:00, cancelado. Es del repositorio del agente, no de esta subfase.

## Hallazgos antes de diseñar

- **H-1. Un cliente tiene varias conversaciones.** `conversations` guarda una por cada `external_ref` que manda el agente, con `client_id` nulable (DataModel, `conversations`). La lista lee conversaciones. Agrupar por cliente es una lectura nueva dentro de `conversations`, sin `JOIN` con otro módulo, sobre `conversations_organization_client_last_message_idx` `(organization_id, client_id, last_message_at desc)`, que ya existe.
- **H-2. Las acciones son de una conversación.** Pausar, reanudar, cambiar el estado y agregar una nota actúan sobre una conversación (brief-6.3, 16.3, 16.4). En el hilo unido, actúan sobre **la más reciente del cliente**, y las anteriores se leen.
- **H-3. FR-CONV-01 prohíbe el texto en la lista, no en la pantalla.** Dice que la lista no incluye el contenido de ningún mensaje y que su consulta no trae el cuerpo del último mensaje. El panel lee el hilo aparte, como la pantalla 9, y los dos roles ya pueden leer el hilo. No expone nada nuevo a nadie, pero cambia lo que llega a la pantalla 8: se enmienda FR-CONV-01 y su caso end-to-end sigue comprobando la lista sin el panel abierto.
- **H-4. Lo que sigue excluido**, con la misma regla que en la 24.3: el teléfono (FR-CONV-01), la vista previa en la fila, «Sin leer» (Fase 26), «WhatsApp conectado» (ADR 0014), «Responder al cliente», «Adjuntar» y los estados de entrega (ADR 0017). Y «Consulta de producto» de 05: la v2 misma prohíbe inferir del texto del chat.
- **H-5. Fase 24 no admite migraciones.** Si agrupar necesita un índice, se detiene (condiciones).

## Decisiones

### D-1 — La agrupación *(decidida: a)*

- **(a)** Una fila por cliente; el hilo une todas sus conversaciones, con un separador entre ellas («Conversación del 25/10 · Cerrada»). La fila, la franja y el estado son los de la conversación más reciente. Las conversaciones sin cliente siguen siendo una fila cada una.
- (b) Una fila por cliente que abre solo la más reciente. (c) Como hoy.

**Consecuencias que fija (a):**
- Las pestañas, el chip y los filtros se aplican a la conversación más reciente de cada cliente, y las cantidades cuentan filas. Un cliente con una pendiente vieja y una abierta nueva está en Abiertas.
- `/conversaciones/{id}` de una conversación anterior redirige a la más reciente del cliente, con el ancla del separador de la pedida (`#conversacion-{id}`). La ficha del cliente sigue listando sus conversaciones.
- La nota se guarda en la más reciente.

### D-2 — El panel de vista previa *(decidida: a)*

- **(a)** En escritorio (`lg`), lista a la izquierda y la conversación elegida a la derecha, como 01: el encabezado con avatar, nombre, canal, estado y agente; la reparación abierta (con `repairs`); las últimas 20 entradas del hilo, solo para leer; y «Abrir conversación». Una fila lleva a `?ver={id}` conservando los filtros; sin JavaScript también funciona. En el teléfono, la tarjeta abre el hilo. Sin texto en las filas. Enmienda FR-CONV-01 (H-3).
- (b) Con texto en las filas. (c) Sin panel.

### D-3 — El panel sin elegir

- **(a)** Sin `?ver=`, el panel dice «Elegí una conversación para verla acá» y no lee ningún hilo. Recomendada: el servidor no sabe el ancho de la pantalla, y elegir la primera fila mandaría sus mensajes también al teléfono, donde el panel no se ve.
- (b) Elige la primera fila, como 01.

### D-4 — «Actividad del agente» en el contexto (05)

- **(a)** Un bloque con la hora del último mensaje del agente en el hilo («14:09 · Respuesta automática»), si hay. Recomendada: el dato ya está en el hilo y no pide otra lectura.
- (b) Sin el bloque.

### D-5 — La reparación en la tarjeta del teléfono (03)

- (a) Debajo del nombre, «OS-000006 · Presupuestada» de la reparación abierta de cada cliente de la página: una lectura por lote nueva en `service`, medida.
- **(b)** Sin esa línea, por ahora. Recomendada: es la única pieza que pide tocar otro módulo, y el hilo ya la muestra arriba.

### D-6 — Revisión y despliegue

- **(a)** Revisión independiente antes de desplegar y despliegue al cerrar, como la 24.3. Recomendada.

## Alcance incluido

1. **`conversations`**, lecturas nuevas, sin migración:
   - `listClientInbox`: la conversación más reciente de cada cliente, con los filtros, el orden y la paginación de hoy, y las conversaciones sin cliente; y sus cantidades por estado y pausa;
   - `listClientTimeline`: el hilo con las notas de todas las conversaciones de un cliente, con el cursor `(fecha, tipo, id)` de la 24.3 y la conversación de cada entrada.
2. **La bandeja** (01, 03): título y subtítulo; pestañas subrayadas con la cantidad en píldora; en una línea, «Todas», «Atención humana N», la búsqueda («Buscar nombre o teléfono», con rótulo para lectores de pantalla) y el botón «Más filtros»; la lista de chats (avatar, nombre, hora, insignias de estado y de agente, flecha, fila elegida resaltada); el pie «Mostrando N de M conversaciones»; el panel (D-2, D-3).
3. **El hilo** (02, 04, 05):
   - el encabezado con la flecha, «Conversaciones», las migas y una tarjeta con avatar, nombre, ícono de WhatsApp y estado; la acción principal con ícono y «···» con nombre accesible «Más acciones»;
   - la franja: lila con el ícono del agente cuando está activo, ámbar con el de persona cuando está pausado; «Tomar conversación» pide confirmar en un panel («Tomar atención humana · Pausa al agente para que puedas responder.»), y sin JavaScript envía directo;
   - sin la tarjeta «Mensajes»; la fecha en píldora; las burbujas con avatar del cliente a la izquierda y del autor a la derecha (iniciales de la persona o el ícono del agente), las del negocio en lila claro con texto oscuro, el autor arriba y la hora abajo; los separadores entre conversaciones (D-1);
   - la nota intercalada como 02: candado, «Nota interna · autor · hora» y «Solo equipo» a la derecha;
   - la nota al pie como 05: el encabezado «Nota interna» con candado, el aviso, «Nota para el equipo», «Guardar una nota no pausa al agente.» y «Guardar nota» ámbar con candado;
   - en el teléfono (04): «← Chats», avatar, nombre, estado y «··· Más» arriba; la reparación con «Ver contexto».
4. **El contexto** (02, 05): tarjetas por bloque con ícono y rótulo, «Ver ficha» arriba a la derecha, «Sin turno asignado» con «Crear turno» (con `appointments`, para `admin`), «Actividad del agente» (D-4) y «Acciones relacionadas» como lista.
5. **FR-CONV-01** enmendado (H-3), y las notas fechadas en `Screens.md` (pantallas 8 y 9) y `DataModel.md` (`conversations` y `conversation_notes`).
6. **Los tests:** integración de las dos lecturas (agrupación, sin cliente, filtros sobre la más reciente, cantidades, el hilo unido en el borde de dos conversaciones, aislamiento por organización); los end-to-end de la 24.3 con los pasos nuevos, más el panel, la redirección, los separadores y la confirmación; axe en claro y en oscuro a 1280 y 375 px.
7. **La comparación visual** (AC-9): capturas de la bandeja, el panel, el hilo con el agente activo y pausado, la nota y el teléfono, lado a lado con 01 a 05, y la tabla de diferencias que quedan en el §Cierre.

## Archivos autorizados

- `src/modules/conversations/service.ts`, `repository.ts` e `index.ts`. Sin `schema.ts` ni migraciones.
- `src/app/(autenticado)/conversaciones/**`.
- `src/app/(autenticado)/clientes/[clientId]/client-conversations.tsx`, solo los enlaces.
- `src/app/_components/`, solo si un patrón compartido necesita una opción nueva.
- `tests/integration/conversation-inbox.test.ts`, `tests/e2e/conversations.spec.ts`, los specs que llegan a la lista o al hilo y `tests/guards/exposed-surface.test.ts` si cambian las Server Actions.
- `docs/product/FunctionalRequirements.md` (FR-CONV-01), `docs/product/Screens.md`, `docs/architecture/DataModel.md` (`conversations` y `conversation_notes`), `docs/architecture/SecurityModel.md` (la cuenta de puntos de entrada, si cambia) y este brief.

## Alcance excluido

- Lo de H-4: teléfono, vista previa en la fila, «Sin leer», estado de WhatsApp, responder, adjuntar, estados de entrega y «Consulta de producto».
- Unir las conversaciones en el modelo: la agrupación es de lectura, cada conversación sigue siendo la que manda el agente.
- La línea de reparación por fila, con D-5 (b).
- Los otros módulos: cada uno, en su subfase de la Fase 24.

## Invariantes

- La consulta de la lista no trae ningún cuerpo de mensaje ni el teléfono. El panel solo con `?ver=`.
- Ningún cuerpo que llega a un `viewer` contiene un teléfono, un email ni un importe.
- Pausar, reanudar, cambiar el estado y agregar una nota siguen siendo solo de `admin` y se auditan como hoy, sobre una sola conversación.
- Toda lectura nueva filtra por `organization_id`; un cliente de otra organización no agrupa nada.
- La lista y el panel funcionan sin JavaScript.
- La accesibilidad verificada con axe no retrocede. Si el lila de la burbuja no da contraste, gana el contraste.

## Criterios de aceptación

- **AC-1**: cada cliente es una fila, con su conversación más reciente; las conversaciones sin cliente, una fila cada una; pestañas, chip, filtros y cantidades sobre esas filas.
- **AC-2**: el hilo de un cliente une sus conversaciones en orden, con separadores, y pagina sin perder ni repetir entradas en el borde entre dos conversaciones. Una conversación anterior redirige a la más reciente con su ancla.
- **AC-3**: las acciones y la nota actúan sobre la más reciente, se anuncian y se auditan; la confirmación de «Tomar conversación» se abre y se cancela con el teclado.
- **AC-4**: en escritorio, una fila abre el panel con `?ver=` sin perder los filtros, y «Abrir conversación» lleva al hilo; sin `?ver=`, el panel no lee ningún hilo (con D-3, a). Sin JavaScript, igual.
- **AC-5**: el caso de FR-CONV-01 pasa sin cambios en lo que comprueba, sobre la lista sin el panel.
- **AC-6**: el contexto, con la forma de 02 y 05, solo con sus capacidades; para `admin`, las acciones relacionadas.
- **AC-7**: un `viewer` ve la lista, el panel, el hilo y el contexto sin botones ni formularios, y no recibe un teléfono, un email ni un importe.
- **AC-8**: axe sin violaciones en la bandeja con y sin panel, el hilo activo y pausado, la confirmación y la nota, en claro y en oscuro, a 1280 y 375 px.
- **AC-9**: la comparación visual con 01 a 05 está en el §Cierre, y cada diferencia que queda cita la regla que la excluye o se corrige.
- **AC-10**: la medición de R-1 está en el §Cierre.
- **AC-11**: la CI pasa completa en el SHA que se despliega.
- **AC-12**: desplegado y recorrido por el usuario, con la revisión independiente antes (D-6).

## Condiciones de detención

- Si una lectura nueva necesita una migración, un índice o un cambio fuera de `conversations`: se detiene y se consulta.
- Si R-1 mide la lista agrupada o el hilo unido más del doble de lentos que los de la 24.3: se informa antes de seguir.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y se informa.
- Antes de cada commit, del push, del despliegue y de cada cambio en Notion: cada uno se autoriza en su turno.

## Riesgos

- **R-1: la lista agrupada.** Elegir la más reciente por cliente antes de filtrar y paginar. Medición: 10.000 conversaciones en una organización, repartidas en 3.000 clientes y 500 sin cliente, en 20 corridas, contra la lista de la 24.3.
- **R-2: el borde del hilo unido.** Dos conversaciones con una entrada a la misma hora no pueden perder ni repetir entradas: el cursor ya desempata por tipo e id, y un test cruza el borde.
- **R-3: la semántica de los filtros.** Una pendiente vieja deja de verse en Pendientes cuando el cliente abre otra. Se dice en `Screens.md` y en la ayuda de la pestaña.
- **R-4: los pasos de los end-to-end.** Cambian otra vez; los localizadores nuevos («Más acciones» como ícono, «Chats», «Abrir conversación») se buscan en todos los specs antes de correr la suite.

## Situación en la fase

- **Necesario ahora:** la agrupación, el hilo unido, el panel y la forma de 01 a 05.
- **Antes de producción:** nada nuevo; la 24.3 ya está desplegada y esta la reemplaza.
- **Después:** la línea de reparación por fila (D-5), «Sin leer» (Fase 26) y responder (ADR 0017). Y, para el resto de la Fase 24, la comparación visual de AC-9 se vuelve un criterio de cada subfase.
