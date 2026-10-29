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

## Cierre

*Del 2026-10-29, antes del commit de la implementación. El commit, la CI, el despliegue y el recorrido del usuario (AC-11 y AC-12) quedan pendientes de autorización.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `latestPerClient` en `listConversations` y en las cantidades: la más reciente de cada cliente se elige antes de filtrar. `conversation-inbox.test.ts`: una fila por cliente, las sin cliente aparte, y los filtros y las cantidades sobre esa fila. Caso 21: una fila por cliente en la bandeja. Debajo de la lista, «Cada cliente aparece una vez, con su conversación más reciente.» (R-3) |
| AC-2 | cumple | `getConversationThread` y `listConversationTimeline` con `scope: "client"`. `conversation-inbox.test.ts`: el hilo une las conversaciones sin cruzar organizaciones, y R-2 cruza el borde entre dos conversaciones sin perder ni repetir entradas. Caso 21: los separadores y la redirección de una conversación anterior a la más reciente, con `#conversacion-{id}`. Cada conversación lleva un solo ancla |
| AC-3 | cumple | Las acciones, la franja y la nota reciben el id de la más reciente. Casos 7, 14 y 16: anunciados y auditados como en la 24.3. Caso 22: la confirmación de «Tomar conversación» se abre con el teclado, se cierra con Escape y con «Cancelar», devuelve el foco y no pausa; a 375 px entra en la pantalla |
| AC-4 | cumple, sin test sin JavaScript | Caso 21: una fila lleva a `?ver=` conservando los filtros, el panel muestra la conversación y «Abrir conversación» lleva al hilo; sin `?ver=`, el panel no lee ningún hilo (D-3). La fila es un enlace y el panel se arma en el servidor, así que no depende de JavaScript, pero ningún caso lo corre sin JavaScript (m-2, abajo) |
| AC-5 | cumple | El caso 2 (FR-CONV-01) comprueba lo mismo que antes, sobre la lista sin `?ver=` |
| AC-6 | cumple | `client-context.tsx`: una tarjeta por bloque, «Sin turno asignado», «Actividad del agente» (D-4) y las acciones relacionadas como lista solo para `admin`. `client-context-pick.test.ts`. Casos 19 y 20 |
| AC-7 | cumple | Caso 20: el viewer recorre la bandeja, el panel con `?ver=` y el hilo, y lo que recibe no contiene el teléfono, el email ni los importes de la clienta. Casos 15 y 17: sin botones ni formularios |
| AC-8 | cumple | `conversations.spec.ts` llama a axe en 40 estados, en claro y en oscuro: la bandeja con y sin panel, el hilo activo y pausado, la confirmación (también a 375 px), la nota y el teléfono. Los casos 10 y 14 comprueban además que nada se sale del ancho a 375 px |
| AC-9 | cumple, con desvíos a decidir | La comparación, abajo. Lo que no excluye una regla está marcado como desvío para tu decisión |
| AC-10 | cumple, por encima del umbral | La medición, abajo. Las cantidades superan el doble: se informó y el usuario decidió aceptarlo y documentarlo (2026-10-29) |
| AC-11 | pendiente | En local: typecheck, lint y prettier en los archivos cambiados. Vitest unitarias y guardas: 2092 de 2092 en dos corridas; en una primera, 1 de 2092 falló y no guardé la salida, así que no sé cuál fue. Integración completa: 258 archivos, 3942 pruebas, antes de las correcciones de la revisión; después, `conversation-inbox.test.ts` de nuevo, 11 de 11. End-to-end: la suite completa, antes de las correcciones, pasó 304 de 311 en 51,3 minutos; las 7 que fallaron agotaron el tiempo, en una máquina con poca memoria libre, y ninguna es de conversaciones. Después de las correcciones y con un build nuevo, esas 7 más `conversations.spec.ts` e `ingestion.spec.ts` pasaron 31 de 31. La CI, en el SHA del commit |
| AC-12 | pendiente | El despliegue y el recorrido, con autorización. La revisión independiente (D-6) ya se hizo, abajo |

### La medición de R-1

- **Método:** en local, con PostgreSQL de desarrollo, un test temporal de integración, borrado después. 10.000 conversaciones en una organización: 9.500 repartidas en 3.000 clientes y 500 sin cliente, una de cada diez pausada. El hilo de un cliente con 4 conversaciones de 50 mensajes y 30 notas.
- **Corridas:** 20 por variante, con la lectura de la 24.3 en la misma corrida.
- **Resultado:**

| Lectura | 24.3.1, mediana (p95) | 24.3, mediana (p95) | Veces |
|---|---|---|---|
| La primera página de la lista | 16,2 ms (19,1 ms) | 9,6 ms (12,2 ms) | 1,7 |
| Las cantidades de las pestañas | 20,3 ms (22,0 ms) | 4,3 ms (10,2 ms) | 4,7 |
| La lista con «Atención humana» | 9,7 ms (13,0 ms) | — | — |
| La última página de la lista | 54,2 ms (63,5 ms) | — | — |
| El hilo unido | 10,5 ms (17,5 ms) | 8,2 ms (9,9 ms), una conversación | 1,3 |

- **Conclusión:** la condición de detención se cumplió en las cantidades: 4,7 veces más lentas. La lista sola tarda 1,7 veces más y el hilo, 1,3. Lista y cantidades juntas suman unos 36 ms por carga, contra unos 14 ms en la 24.3. Se informó antes de seguir, y el usuario decidió **aceptarlo y documentarlo** (2026-10-29), sin índice ni migración: la Fase 24 no los admite (H-5). Queda anotado en `DataModel.md`, y se vuelve a medir si una organización llega a un volumen mucho mayor.

### La comparación visual (AC-9)

Capturas de la bandeja con y sin panel, los filtros y la bandeja en el teléfono, el hilo pausado, el hilo activo con la confirmación y el hilo en el teléfono, comparadas con 01 a 05. Las capturas son del build anterior a las correcciones de la revisión; esas correcciones cambiaron la ayuda de un viewer, un ancla y el ancho de un formulario, no la forma.

| Diferencia con la v2 | Mockup | Por qué queda |
|---|---|---|
| Sin el teléfono del cliente | 01 a 05 | FR-CONV-01 (H-4) |
| Sin la vista previa del mensaje en la fila | 01, 03 | FR-CONV-01, enmendado: el texto solo en el panel (H-3, H-4) |
| Sin «Sin leer» ni «2 sin leer» | 01, 03 | Fase 26 (H-4) |
| Sin «WhatsApp conectado» | 01 | ADR 0014 (H-4) |
| Sin «Responder», «Adjuntar» ni «Entregado» | 02, 04, 05 | ADR 0017 (H-4) |
| Sin «Consulta de producto» | 05 | La v2 prohíbe inferir del texto del chat (H-4) |
| La tarjeta del teléfono sin la línea de reparación | 03 | D-5 (b) |
| El panel sin elegir dice «Elegí una conversación para verla acá» en lugar de mostrar la primera | 01 | D-3 (a) |
| El panel muestra 8 entradas, no 20 | 01 | Desvío de D-2, decidido por el usuario el 2026-10-29: con 8 se ve como 01 |
| El ancho máximo del contenido y el título de la página | 01, 02 | El marco de la 24.1 |
| Los separadores entre conversaciones | 02 | D-1 (a): la v2 no tiene un cliente con varias conversaciones |
| Las insignias dicen «Atención humana» y «Agente activo», no «Humano» y «Agente» | 01, 03 | Las etiquetas de la 24.3 (D-3), que la franja comparte |
| «Cerrar conversación», no «Resolver»; la pestaña es «Cerradas», no «Resueltas» | 01, 02 | brief-24.3, D-2: el estado se sigue llamando «Cerrada» |
| La paginación va debajo de la lista, fuera de su tarjeta | 01 | El patrón de paginación de la 24.1 |
| En escritorio, la franja pausada sigue diciendo desde cuándo | 02 | Desvío: el dato es de la 16.3 y la v2 no lo muestra. A decidir |
| «Guardar nota» en ámbar oscuro, no ámbar claro | 05 | Desvío: no hay un ámbar sólido con contraste AA en los tokens. Gana el contraste (Invariantes) |
| «Todas» no aparece en el teléfono | 03 | Desvío: en 375 px no entra en la línea de «Atención humana» y «Filtros». A decidir |
| Las pestañas del teléfono son subrayadas con desplazamiento, no un control segmentado | 03 | Desvío: el patrón de `SubNav` de la 24.1. A decidir |
| «Ver contexto» va arriba de la tarjeta, no debajo del encabezado | 04 | Desvío: el contexto va antes en el orden de lectura. Corrige la nota de la 24.3 (D-9) en `Screens.md` |
| Sin migas en el hilo; «···» sin el texto «Más»; el avatar de una persona es un ícono, no sus iniciales; el pie dice «Mostrando 1 a N de M» | 02, 04, 05 | Desvíos de detalle que encontró la revisión (m-4). A decidir |
| Sin la reparación en la tarjeta del hilo en el teléfono; «Crear turno» solo en las acciones relacionadas | 04, 05 | Desvíos de detalle (m-4). A decidir |
| La confirmación de «Tomar conversación» es un panel flotante, no un menú anclado | 05 | Desvío: el panel tiene foco, Escape y «Cancelar» (AC-3). A decidir |

### La revisión independiente

La hizo un agente que no participó del trabajo, con acceso de solo lectura, contra este brief, la v2 y las reglas del proyecto. Cada hallazgo se verificó contra el código antes de aceptarlo. No ejecutó pruebas.

- **Mayores:**
  - **M-1**, las cantidades a más del doble de la 24.3: informado, y el usuario lo aceptó (arriba). El revisor notó además que la línea base (9,6 y 4,3 ms) no coincide con la publicada en la 24.3 (14,4 ms con cantidades): aquella fue otra corrida, con otros datos; esta midió las dos lecturas en la misma corrida, sobre los mismos datos.
  - **M-2**, el test de R-2 del hilo unido no cruzaba el borde de página en el límite entre conversaciones: corregido. Ahora la primera conversación tiene 30 entradas y la segunda 50, el corte cae entre a29 y b0, y el test lo comprueba.
  - **M-3**, el panel lee 8 entradas y D-2 decía 20, y el test probaba 20: el usuario decidió dejar 8 (2026-10-29), y el test prueba 8.
- **Menores:**
  - **m-1**, AC-7 no se probaba en el panel: corregido; el caso 20 recorre también `/conversaciones?ver=` como viewer.
  - **m-2**, ningún caso recorre la bandeja, el panel ni «Tomar conversación» sin JavaScript: queda, declarado en AC-4.
  - **m-3**, R-3 pedía una ayuda en la pestaña: resuelto con una línea debajo de la lista, «Cada cliente aparece una vez, con su conversación más reciente.», no en la pestaña.
  - **m-4**, desvíos de detalle de la forma: en la tabla de AC-9.
  - **m-5**, los nombres de las lecturas difieren del brief: `listClientInbox` es la opción `latestPerClient` de `listConversations` y de las cantidades, y `listClientTimeline` es `scope: "client"` de `listConversationTimeline`, más `getConversationThread`. El comportamiento es el del brief, y `DataModel.md` documenta los nombres reales.
  - **m-6**, el cambio de `SubNav` en el teléfono afectaba a todas sus pantallas: corregido; ahora es la opción `scroll`, que solo usa esta bandeja.
  - **m-7**, «Ver contexto» arriba de la tarjeta contradice la nota de la 24.3 (D-9): documentado en `Screens.md`. Queda que, en el teléfono, el `h2` del contexto se lee antes que el `h1`.
- **Notas:**
  - **n-1**: la lista sigue leyendo la cantidad de mensajes, que la fila ya no muestra, y el título del caso 2 todavía dice «y cantidad». Queda.
  - **n-2**: un viewer leía en el panel «Abrí la conversación para agregar una nota.»: corregido; lee «Abrí la conversación para leerla entera.».
  - **n-3**: el panel muestra la conversación de `?ver=`, no siempre la más reciente, y las pestañas conservan `?ver=`. Solo se nota con una URL escrita a mano o al cambiar de pestaña. Queda.
  - **n-4**: un viewer lee «Las respuestas automáticas están habilitadas» en una cerrada. Queda.
  - **n-5**: `.claude/settings.json`, sin seguimiento y ajeno a la subfase, no entra en el commit.
- **Sospechas, no verificadas:**
  - **s-1**, dos separadores con el mismo `id` si dos conversaciones se intercalan: corregido, un ancla por conversación.
  - **s-2**, la confirmación podía salirse de la pantalla a 375 px: corregido; el caso 22 comprueba que entra.
  - **s-3**, la redirección con `#conversacion-…` se prueba en navegación de documento y no en navegación del cliente: queda.

### Desvíos

- **D-2:** 8 entradas en el panel, no 20 (decidido por el usuario).
- **Alcance incluido 1:** los nombres de las lecturas (m-5).
- **Archivos autorizados:** `SubNav` ganó las opciones `scroll` e ícono, y `Avatar` el tono `soft`, dentro de `src/app/_components/`, que el brief permite para una opción nueva.
- **AC-9:** los desvíos de forma de la tabla, a decidir en el recorrido.

### Autoevaluación

Este cierre, los criterios y la tabla de AC-9 son **autoevaluación** del agente que implementó. La revisión independiente encontró 3 hallazgos mayores, 7 menores, 5 notas y 3 sospechas que la autoevaluación no había visto. Esa revisión no otorga ninguna autorización.
