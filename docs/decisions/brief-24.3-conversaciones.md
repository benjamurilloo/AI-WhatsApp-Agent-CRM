---
schema: task-brief.v1
task_id: "24.3"
task_type: implementation
generated_at: 2026-10-28
---

# Brief: 24.3 — Conversaciones

**Estado: aprobado el 2026-10-28 por el usuario, con las recomendaciones de D-1 a D-11.** Eso fija las pestañas Abiertas, Pendientes, Cerradas y Todas, con Abiertas por defecto (D-1, a), el nombre «Cerrada» (D-2, a), el filtro «Atención humana» por agente pausado (D-3, a), la búsqueda de cliente de hoy con «Más filtros» (D-4, a), la lectura nueva del hilo con las notas intercaladas (D-5, a), el contexto del cliente con sus acciones relacionadas (D-6, a), la franja del agente y las acciones de estado en el encabezado (D-7, a), solo la nota interna al pie (D-8, a), las tarjetas y «Ver contexto» en el teléfono (D-9, a), el despliegue al cerrar (D-10, a) y la revisión independiente antes de desplegar (D-11, b).

## Objetivo

Llevar la bandeja y el hilo de conversaciones al patrón de la v2, con lo que el CRM ya sabe:
- **la bandeja:** pestañas por estado con su cantidad y el filtro «Atención humana»;
- **el hilo:**
  - las notas internas intercaladas con los mensajes;
  - una franja estable con el control del agente;
  - el contexto del cliente: su reparación, su turno y sus etiquetas.

Es la tercera subfase de la Fase 24 (Roadmap, §Fases 23 a 28). Hereda el marco y los patrones de la 24.1 y el diálogo de la 24.2.

## Situación

- **Hoy:**
  - **Lista** (`/conversaciones`, pantalla 8; brief-6.4 y 15.2): una tabla con filtros de período, estado, canal y cliente (búsqueda en dos pasos), orden y paginación, todo en la URL. Sin el contenido de ningún mensaje ni el teléfono (FR-CONV-01).
  - **Hilo** (`/conversaciones/{id}`, pantalla 9): a la izquierda, los mensajes como burbujas, de a 50, con «cargar anteriores». A la derecha, cuatro tarjetas:
    - «Conversación»: los datos;
    - «Notas»: de a 25, aparte de los mensajes;
    - «Agente»: pausar o reanudar;
    - «Cambiar estado»: un `select`.

    Las dos últimas son solo para `admin`, y agregar una nota también (brief-6.3, 16.3 D-4, 16.4 D-6).
  - **En el teléfono**, desde la 24.1, el hilo no tiene barra inferior.
- **La v2** (`docs/ui-redesign/v2/03-conversaciones/`, lote V2-02, seis mockups y su README):
  - **Bandeja:** las pestañas Abiertas 12, Pendientes 4 y Resueltas; los chips Todas, «Sin leer 8» y «Atención humana 3»; «Buscar nombre o teléfono» y «Más filtros».
    - **Cada fila:** avatar, nombre, hora, la vista previa del último mensaje, «2 sin leer» y las insignias de estado y de agente («Humano» o «Agente»).
    - **En escritorio:** un panel de vista previa del hilo al costado.
  - **Hilo:**
    - nombre, teléfono, estado, «Resolver» y «Más»;
    - una franja «Atención humana · Agente pausado» con «Reactivar agente»;
    - los mensajes con la nota interna intercalada («Solo equipo»);
    - abajo, dos pestañas: «Responder al cliente» («Mensaje por WhatsApp», «Adjuntar», «Enviar mensaje») y «Nota interna».
    - Al costado, «Contexto del cliente»: la reparación con su estado y «Ver reparación», el turno con «Ver turno», las etiquetas y «Acciones relacionadas» («Crear turno» y «Crear pedido»).
  - **Teléfono:** la bandeja en tarjetas; el hilo con volver, «Más» y «Ver contexto», que abre los mismos datos.
  - **Estados:** «Sin conexión», «Enviando», «Entregado», «Leído», «Fallido» y «Estado por confirmar».

## Hallazgos antes de diseñar

- **H-1. El CRM no envía mensajes.** El compositor, «Adjuntar» y los estados de envío, entrega y lectura están **fuera del rediseño** (Roadmap, §Fuera del rediseño). Entran solo con el [ADR 0017](0017-responder-desde-el-crm.md), que espera un negocio real.
  - Del pie del hilo queda solo **la nota interna**.
  - «Tomar conversación» no habilita ningún envío: pausa al agente (brief-16.3).
- **H-2. Sin vista previa ni teléfono.** Los dos están en la lista de lo que excede el modelo (Roadmap, «Sumado el 2026-10-28»), con FR-CONV-01: la lista no trae ningún cuerpo de mensaje, ni recortado, y la pantalla 9 no muestra el teléfono.
  - **Se caen la vista previa en la fila y el panel de vista previa de escritorio**, que muestra mensajes en la pantalla de la lista.
  - Una fila abre el hilo.
- **H-3. «Sin leer» no existe en el modelo.** No hay lectura por usuario. Las no leídas son de la Fase 26 (Roadmap). Tampoco existe el estado de conexión de WhatsApp: es del agente ([ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)), fuera del rediseño.
- **H-4. «Atención humana» y «Pendiente» son dos cosas distintas.** La v2 dice que el filtro «Atención humana» selecciona la automatización pausada, «independientemente del estado del hilo». En el modelo:
  - `agent_paused_at` es independiente de `status`: la derivación y el cambio de estado no la tocan, y pausar no cambia el estado (DataModel, `conversations`);
  - `pending` significa «espera a una persona», y es adonde deriva el agente (FR-CONV-03; brief-12.2, D-4).

  Una conversación que el agente derivó está `pending` con el agente activo. Una que un `admin` tomó puede seguir `open`. **Se sigue a la v2**: el filtro es la pausa, y la pestaña Pendientes es el estado. La franja y las insignias dicen las dos cosas por separado.
- **H-5. Los permisos ya están fijados.** Pausar, reanudar, cambiar el estado y agregar una nota son solo para `admin`; leer el hilo, las notas y la marca de pausa es para los dos roles (brief-6.3, 16.3 y 16.4). La v2 dice «sujetos a permisos»: un `viewer` ve la franja sin botón, las notas sin formulario y el contexto sin «Acciones relacionadas».
- **H-6. Las lecturas del contexto ya existen**, para los dos roles y con su capacidad (`NOT_FOUND` sin ella), y la ficha del cliente ya las usa:
  - **la reparación:** `listClientServiceOrders(context, clientId)` de `service`, las últimas 5 por creación;
  - **el turno:** `listClientAppointments(context, clientId)` de `appointments`, los últimos 20 por inicio;
  - **las etiquetas:** `getClient(context, clientId)` de `crm`.

  Se componen en la aplicación, como la 24.2. El estado sale de la orden de servicio, nunca del texto de un mensaje (README de la v2).
- **H-7. Los formularios ya aceptan el cliente elegido:** `/pedidos/nuevo?cliente=` y `/turnos/nuevo?cliente=`. Los dos son solo para `admin`, y el de turnos da 404 sin `appointments`.
- **H-8. Hay que agregar dos lecturas en `conversations`**, permitidas por el Roadmap («Contadores por estado y contexto del cliente»):
  - **el filtro por pausa** y **las cantidades por estado**, con los mismos filtros de la lista. No hay índice sobre `agent_paused_at`;
  - **el hilo con las notas intercaladas** (D-5): hoy los mensajes y las notas se paginan aparte, con cursores distintos.
- **H-9. Una sola pantalla enlaza a la lista con filtros**: la ficha del cliente, con `/conversaciones?cliente=…` («Ver en Conversaciones»). El menú y la barra inferior llevan a `/conversaciones` sin filtros. Si la pestaña por defecto pasa a ser Abiertas (D-1), el enlace de la ficha tiene que pedir todos los estados.
- **H-10. Lo que los end-to-end esperan hoy:**
  - `conversations.spec.ts` tiene 17 casos, entre ellos el de FR-CONV-01: la lista serializada no contiene el texto de ningún mensaje ni el teléfono (TestingStrategy).
  - `clients.spec.ts`, `frame.spec.ts` e `ingestion.spec.ts` llegan a la lista o al hilo.
  - Cambian los pasos (las pestañas en lugar del `select`, los botones en lugar del formulario de estado), no lo que se comprueba.

## Decisiones pendientes

### D-1 — Las pestañas de estado

- (a) **Abiertas, Pendientes, Cerradas y Todas**, cada una con su cantidad. Abiertas por defecto. `?estado=` sigue igual (`abierta`, `pendiente`, `cerrada`, `todos`), y el enlace de la ficha del cliente pide `estado=todos` (H-9).
- (b) Solo las tres de la v2, sin Todas.

*Recomendación: (a).* Hoy se puede ver todo, y la ficha del cliente lo necesita. Las pestañas son enlaces de un formulario GET, así que funcionan sin JavaScript.

### D-2 — El nombre del estado `closed`

- (a) **Sigue siendo «Cerrada»**: la pestaña «Cerradas» y el botón «Cerrar conversación». Es el nombre del dashboard («Cerradas»), de MetricsCatalog y de la URL.
- (b) «Resuelta» y «Resolver», como la v2, en las pantallas de conversaciones y en la tarjeta del dashboard.

*Recomendación: (a).* El rótulo de la v2 es ilustrativo, y (b) cambia un nombre que ya usan el dashboard y el catálogo de métricas.

### D-3 — El filtro «Atención humana»

- (a) **Un chip que filtra las conversaciones con el agente pausado**, combinable con la pestaña y los demás filtros, con su cantidad. `?atencion=humana` en la URL. Cada fila lleva su insignia: «Atención humana» o «Agente activo».
- (b) El chip sin cantidad.

*Recomendación: (a).* La cantidad sale de la misma lectura que la de las pestañas (D-4). Sin «Sin leer» (H-3).

### D-4 — La búsqueda y los demás filtros

- (a) **La búsqueda de cliente de hoy**, en dos pasos y en la URL, con el campo «Buscar cliente» y el texto de ayuda «Nombre o teléfono». `searchClients` ya acepta el teléfono entero, que se escribe y nunca se devuelve, como en `/buscar` (H-7 de la 23.3, riesgo aceptado). Período, canal y orden pasan a «Más filtros», un `<details>` abierto si alguno no es el de por defecto.
- (b) Solo por nombre.

*Recomendación: (a).*

### D-5 — Las notas en el hilo

- (a) **Una lectura nueva en `conversations`, `listConversationTimeline`**: los mensajes y las notas en un solo orden por fecha, de a 50 con un cursor `(fecha, tipo, id)`.
  - Cada página trae los 50 mensajes anteriores al cursor, y las notas entre el más viejo de ellos y el cursor.
  - En la última página, las notas que queden.
  - La nota se dibuja intercalada, con candado, «Nota interna», su autor y «Solo equipo».
- (b) La composición en la aplicación con las dos lecturas de hoy. Tiene dos cursores, y una nota puede quedar fuera de orden en el borde de una página.
- (c) Las notas siguen en su tarjeta.

*Recomendación: (a).* Es la única que garantiza el orden. Es una lectura de un solo módulo, sin `JOIN` con otro, y se mide (R-1).

### D-6 — El contexto del cliente

- (a) **Un panel «Contexto del cliente»** con «Ver ficha» y tres bloques, cada uno solo si hay dato y, los dos primeros, solo con su capacidad:
  - **Reparación:** la más reciente que no esté entregada ni cancelada, de las 5 que lee la ficha, con su número, modelo, estado y «Ver reparación».
  - **Turno:** el próximo pedido o confirmado, desde hoy, con su fecha, horario, motivo, estado y «Ver turno».
  - **Etiquetas.**

  Para `admin`, además, «Acciones relacionadas»: «Crear turno» (con `appointments`) y «Crear pedido», con `?cliente=` (H-7). Una conversación sin cliente dice que no tiene cliente asociado.
- (b) Lo mismo sin «Acciones relacionadas».

*Recomendación: (a).*

### D-7 — La franja del agente y las acciones de estado

- (a) **Una franja debajo del encabezado, para los dos roles**:
  - con el agente pausado: «Atención humana · Agente pausado» y desde cuándo;
  - activo: «Agente activo · Responde automáticamente».

  **Para `admin`:**
  - En la franja, «Tomar conversación» (pausa) o «Reactivar agente» (reanuda), con un clic y el aviso de la 23.2, como hoy. Una conversación cerrada no ofrece tomarla, como hoy.
  - En el encabezado, el principal es «Cerrar conversación» (con D-2, a) en una abierta o pendiente, y «Reabrir» en una cerrada.
  - En «Más acciones» (24.1): «Marcar como pendiente» o «Marcar como abierta».
  - Cerrar no reactiva al agente: las dos marcas son independientes (H-4).
- (b) Las tarjetas «Agente» y «Cambiar estado» de hoy, con otro aspecto.

*Recomendación: (a).*

### D-8 — La nota al pie del hilo

- (a) **Para `admin`, un formulario al pie del hilo:**
  - el título «Nota interna» con un candado;
  - el campo «Nota para el equipo», con la ayuda «El cliente no la ve ni la recibe el agente»;
  - el botón «Guardar nota», con el límite de 1000 caracteres de hoy (`maxLength`, sin contador).

  Sin pestaña «Responder al cliente» (H-1). La nota guardada aparece al final del hilo.
- (b) El formulario de hoy en su tarjeta.

*Recomendación: (a).*

### D-9 — El teléfono

- (a) **La bandeja en tarjetas** (avatar, nombre, hora e insignias) y el hilo a pantalla completa, con:
  - «Volver a conversaciones»;
  - las acciones de estado en «Más acciones»;
  - «Ver contexto», un botón que abre y cierra el panel del contexto debajo del encabezado (`aria-expanded`).
- (b) «Ver contexto» como un diálogo modal.

*Recomendación: (a).* Es el patrón de «Más» de la 24.1, sin otro diálogo. El contenido se renderiza solo abierto (24.1, nota de los nombres ocultos).

### D-10 — Despliegue a producción

- (a) Al cerrar, después de la CI en verde, con el recorrido del usuario.
- (b) Sin desplegar.

*Recomendación: (a).*

### D-11 — Revisión

- (a) Autoevaluación declarada.
- (b) **Revisión independiente antes de desplegar**, como la 24.1 y la 24.2: las dos encontraron bloqueantes con todas las pruebas en verde.

*Recomendación: (b).* La subfase suma dos lecturas en un módulo y muestra datos de tres módulos más en una pantalla que lee un `viewer`.

## Alcance incluido

1. **`conversations`**, dos lecturas nuevas, sin migración:
   - el filtro por pausa en `listConversations` y una lectura de las cantidades por estado y por pausa con los mismos filtros (D-1, D-3);
   - `listConversationTimeline` (D-5).

   Con sus tests de servicio contra PostgreSQL, incluido el aislamiento por organización.
2. **La bandeja** (`conversaciones/page.tsx`, `conversation-table.tsx`, `filters.ts`, `messages.ts`): pestañas, chip, búsqueda, «Más filtros», filas y tarjetas (D-1 a D-4, D-9).
3. **El hilo** (`conversaciones/[conversationId]/`):
   - el encabezado con las acciones y la franja (D-7);
   - el hilo con las notas intercaladas y su carga de anteriores (D-5);
   - la nota al pie (D-8);
   - el contexto (D-6);
   - el teléfono (D-9).
4. **El enlace de la ficha del cliente** con `estado=todos` (H-9).
5. **Los unitarios** de `filters.ts` y `messages.ts`, y los de la composición del contexto: qué reparación y qué turno se eligen.
6. **Los end-to-end**:
   - **`conversations.spec.ts`:** sus 17 casos, con los pasos nuevos, y casos nuevos:
     - las pestañas y el chip con sus cantidades;
     - el hilo con una nota entre dos mensajes y en el borde de una página;
     - tomar y reactivar desde la franja, y cerrar y reabrir;
     - el contexto en una organización con `repairs` y `appointments`, y sin ellas;
     - el `viewer` sin botones ni formularios, y sin teléfono en ningún cuerpo de la lista ni del hilo;
     - el teléfono a 375 px.
   - **Las comprobaciones de siempre:** axe en claro y en oscuro, a 1280 y 375 px. El caso de FR-CONV-01 se conserva tal cual.
7. **La medición de R-1** y la nota fechada en `docs/product/Screens.md`, y las notas de las lecturas nuevas en `DataModel.md` (`conversations`).

## Archivos autorizados

- `src/modules/conversations/service.ts`, `repository.ts`, `index.ts` y `service.test.ts`. Sin `schema.ts` ni migraciones.
- `src/app/(autenticado)/conversaciones/**`.
- `src/app/(autenticado)/clientes/[clientId]/client-conversations.tsx`, solo el enlace.
- `src/app/_components/`, solo si un patrón compartido necesita una opción nueva.
- `tests/e2e/conversations.spec.ts` y los specs que llegan a la lista o al hilo, con el paso que cambia listado al cerrar.
- `docs/product/Screens.md`, `docs/architecture/DataModel.md` (sección `conversations`) y este brief.

## Alcance excluido

- **El compositor y el envío de mensajes**, con «Adjuntar» y los estados de envío, entrega y lectura ([ADR 0017](0017-responder-desde-el-crm.md); H-1).
- **La vista previa** en la fila y el panel de vista previa, y el teléfono (FR-CONV-01; H-2).
- **«Sin leer», las cantidades por fila y «En línea»** (Fase 26), y el estado de conexión de WhatsApp (ADR 0014; H-3).
- **Las actualizaciones en vivo** y el acceso «Nuevos mensajes»: hoy el hilo se lee al entrar.
- **Asignaciones, SLA y plantillas**: la v2 dice que no se presuponen.
- **Cambios en `service`, `appointments` o `crm`**, una migración o un contrato.

## Invariantes

- Ninguna lista ni respuesta de la bandeja contiene el cuerpo de un mensaje ni el teléfono de un cliente (FR-CONV-01).
- Ningún cuerpo que llega al navegador de un `viewer` contiene un teléfono, un email ni un importe, tampoco desde el contexto.
- Pausar, reanudar, cambiar el estado y agregar una nota siguen siendo solo de `admin`, en el servicio y en la pantalla. Cada uno se audita como hoy.
- La pausa y el estado son independientes: ninguna acción cambia los dos.
- Sin la capacidad, su bloque del contexto no aparece y su lectura no se pide.
- Toda lectura nueva filtra por `organization_id`.
- La lista funciona sin JavaScript: pestañas, chip y búsqueda son enlaces o formularios GET.
- La accesibilidad verificada con axe no retrocede.

## Criterios de aceptación

- **AC-1**: la bandeja muestra Abiertas, Pendientes, Cerradas y Todas (con D-1, a), con su cantidad, y la pestaña elegida queda en la URL y marcada con `aria-current`.
- **AC-2**: el chip «Atención humana» filtra las conversaciones con el agente pausado dentro de la pestaña y los demás filtros, con su cantidad, y se puede quitar.
- **AC-3**: cada fila muestra el cliente, la hora del último mensaje y las insignias de estado y de agente, sin el texto de ningún mensaje ni el teléfono. El caso de FR-CONV-01 pasa sin cambios en lo que comprueba.
- **AC-4**: el hilo intercala las notas con los mensajes en orden de fecha, también al cargar los anteriores. Una nota se distingue de un mensaje por el texto y el ícono, no solo por el color.
- **AC-5**: un `admin` toma y reactiva al agente desde la franja, y cierra, reabre y marca como pendiente desde el encabezado y «Más acciones». Cada acción se anuncia y se audita. La pausa y el estado no se tocan entre sí.
- **AC-6**: el contexto muestra la reparación abierta más reciente y el próximo turno del cliente, solo con su capacidad, sus etiquetas y «Ver ficha»; para `admin`, «Crear turno» y «Crear pedido» con el cliente elegido.
- **AC-7**: un `viewer` ve la franja, las notas y el contexto sin botones ni formularios, y no recibe un teléfono, un email ni un importe en ningún cuerpo de la bandeja ni del hilo.
- **AC-8**: a 375 px la bandeja va en tarjetas y el hilo abre y cierra «Ver contexto» con el teclado, sin desplazamiento horizontal.
- **AC-9**: axe no reporta violaciones en la bandeja, el hilo con el contexto abierto y la nota, en claro y en oscuro, a 1280 y 375 px.
- **AC-10**: la medición de R-1 está en el §Cierre.
- **AC-11**: la CI pasa completa en el SHA que se despliega.
- **AC-12**: desplegado en producción y recorrido por el usuario. Con D-11 (b), con la revisión independiente antes.

## Condiciones de detención

- Si una lectura nueva necesita una migración, un índice o un cambio fuera de `conversations`: se detiene y se consulta.
- Si R-1 mide la lista con las cantidades más del doble de lenta que la de hoy, o el hilo intercalado más del doble que el de hoy: se informa antes de seguir.
- Si axe reporta una violación que no se resuelve sin apartarse de la v2: gana la accesibilidad, y se informa.
- Antes de cada commit, del push, del despliegue y de cada cambio en Notion: cada uno se autoriza en su turno.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Riesgos

- **R-1: las lecturas nuevas.**
  - **El conteo:** la lista ya lee la página y el total, y ahora suma un conteo agrupado por estado y por pausa, sin índice sobre `agent_paused_at`.
  - **El hilo:** pasa de dos lecturas a una compuesta.
  - **Medición:** en local, con 10.000 conversaciones en una organización, como la 15.2: la lista con y sin el conteo, y el hilo de una conversación con 200 mensajes y 30 notas, con las lecturas de hoy y con la nueva, en 20 corridas.
- **R-2: el borde del cursor.** Una nota y un mensaje con la misma hora no pueden perderse ni repetirse entre páginas. El cursor desempata por tipo y por id, y un test lo cubre.
- **R-3: los pasos de los end-to-end** cambian en `conversations.spec.ts` y en los specs que llegan a la lista. Se listan los que cambian.
- **R-4: los nombres nuevos.** «Atención humana», «Tomar conversación» y «Ver contexto» pueden capturar localizadores por subcadena en otros specs, como pasó en la 24.2. Se buscan en todos los specs antes de correr la suite.
