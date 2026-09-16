---
schema: task-brief.v1
task_id: 6.3
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 6.3 — Servicio de consulta y estado

## Objetivo

Crear el servicio del módulo `conversations`, con su interfaz pública, para que la 6.4 pueda construir las pantallas 8 y 9 y completar la 6 y la 7:

1. **Lista de conversaciones** (FR-CONV-01): filtros de período, estado, canal y cliente, sin el contenido de ningún mensaje.
2. **Detalle y timeline** (FR-CONV-02): mensajes en orden cronológico, cargados de a 50.
3. **Cambio de estado** (FR-CONV-03, FR-AUD-01): solo `admin`, auditado en la misma transacción.
4. **Actividad del cliente** (FR-CLI-04): su última interacción, sus conversaciones y la lista de clientes ordenada por última interacción.
5. **Medición**: confirmar cada consulta con `EXPLAIN` y tiempos sobre la organización de volumen.

Todo esto se valida **localmente y en CI**. Esta subfase no crea pantallas, Server Actions ni endpoints.

## Ubicación en la Fase 6

- **Orden previsto**: 6.1 y 6.2 (cerradas) → **6.3** → 6.4, con 6.5.1 → 6.5.2 → 6.5.3 en paralelo.
- **Notion**: "M. FR-CONV-01 a 03 y FR-CLI-04, con el cambio de estado auditado". Estado: "Bandeja de Entrada".
- **Necesario ahora**: servicio, repositorio, interfaz pública, las funciones nuevas de `crm` que pida D-1, tests y mediciones.
- **Lo que llega después**:
  - las pantallas 8 y 9, el cambio de estado desde la UI y la conexión de las pantallas 6 y 7 con estas funciones (6.4);
  - la escritura de conversaciones por ingestión (6.5.2);
  - las métricas (Fase 7).
- **Gates de entrada**:
  1. 6.2 cerrada, con la CI en verde en `04a2f18`. Verificado el 2026-09-16.
  2. Contenedor de PostgreSQL en marcha, con el volumen sembrado en la base de desarrollo.
  3. **Autorización para medir** con `EXPLAIN ANALYZE` y lecturas contra la base de desarrollo. No se escribe nada en ella.

## Hallazgos de la verificación previa (2026-09-16)

1. **Estado**: `main` limpio en `04a2f18`. `src/modules/conversations/` solo tiene `schema.ts`. `audit_logs` ya admite `conversation` / `status_change`.
2. **El orden de la lista de clientes cruza módulos.**
   - Pantalla 6: 25 clientes por página, "ordenado por última interacción de más reciente a más antigua".
   - `crm.searchClients` filtra, ordena por nombre y pagina en SQL (5.2, D-4).
   - `conversations` depende de `crm`, no al revés, así que `crm` no puede ordenar por un dato de `conversations`.
   - La regla de frontera solo deja a `analytics` leer esquemas ajenos, y la convención prohíbe `JOIN` entre módulos.
   - Con el volumen, eso significa ordenar hasta 10.000 clientes fuera de SQL.
   Se resuelve en D-1.
3. **Datos de clientes que necesita `conversations`**:
   - el nombre de cada cliente, para la lista (pantalla 8) y la cabecera (pantalla 9);
   - verificar que un cliente existe en la organización, para la pantalla 7.
   `crm` no expone una lectura por varios ids. Además, el nombre no debe traer el teléfono: la pantalla 8 no lo muestra, y a un `viewer` solo le llega enmascarado (FR-CLI-06).
4. **Timeline de a 50, empezando por los más recientes**, con "cargar mensajes anteriores" (pantalla 9). Con `offset`, un mensaje que llegue mientras se lee corre las páginas y duplica u omite filas. Se resuelve en D-2.
5. **Concurrencia del cambio de estado**: la convención para entidades editables es fila con `FOR UPDATE`, `diff` sobre lo leído y última escritura gana (4.2, D-5). El estado es un solo campo. Se resuelve en D-3.
6. **"Tiempo interactivo" no tiene número**: NonFunctionalRequirements da la referencia de ~10.000 filas por organización, sin umbral. TraceabilityMatrix pide confirmar cada consulta con `EXPLAIN`. Se resuelve en D-4.
7. **La validación de fechas de calendario** (`isCalendarDate`) es interna de `inventory` (4.3.3). El filtro de período de la pantalla 8 necesita la misma validación y la misma semántica: días de la zona de la organización, fin incluido y semiabierto en UTC. Se resuelve en D-5.
8. **Período por defecto**: el wireframe 08 muestra "Últimos 30 días". El servicio de movimientos recibe `from` y `to` vacíos sin límite, y el default lo pone la pantalla. Se sigue esa convención: el servicio no inventa un período.
9. **Una conversación sin mensajes** no existe en los seeds ni la creará la ingestión. Aun así, `last_message_at` admite nulo y el wireframe prevé el vacío "esta conversación no tiene mensajes". El orden por `last_message_at desc` deja los nulos al final (6.1), y un filtro de período los excluye.

## Alcance incluido

1. Registrar la resolución de D-1 a D-5.
2. **`src/modules/conversations/`**: `repository.ts`, `service.ts`, `index.ts` y sus tests unitarios. Todas las funciones reciben el `AuthContext` y autorizan con `authorize` en el orden vigente: contraseña pendiente → rol → recurso filtrado por organización. Un id que no es UUID devuelve `VALIDATION_ERROR` sin `fields`.
   - **`listConversations(context, filters)`**, para `admin` y `viewer`:
     - **filtros**, recibidos como texto de la URL: `from` y `to` (fechas de calendario sobre `last_message_at`, semántica de D-5), `status` (`all` o un estado), `channel` (`all` o un canal) y `clientId` (vacío o UUID);
     - **orden y páginas**: `last_message_at desc`, desempate por `id`, 25 por página en SQL con total, y la página fuera de rango se ajusta como en la 4.3.3;
     - **cada fila**: id, estado, canal, inicio, último mensaje, cantidad de mensajes (un `COUNT` agrupado sobre los ids de la página) y cliente (`{ id, name }` o `null`), con el nombre compuesto por `crm` según D-1;
     - **nunca** el cuerpo de un mensaje (FR-CONV-01);
     - **además devuelve** la zona de la organización y si la organización tiene alguna conversación, para distinguir "sin resultados" de "no hay conversaciones";
     - un filtro inválido da `VALIDATION_ERROR` con sus `fields`.
   - **`getConversation(context, id)`**, para `admin` y `viewer`: cabecera con cliente (`{ id, name, isActive }` o `null`, sin teléfono), canal, estado, inicio, último mensaje y zona. `NOT_FOUND` si no existe o es de otra organización.
   - **`listConversationMessages(context, id, { before })`**, para `admin` y `viewer`:
     - los 50 mensajes anteriores al cursor, o los 50 más recientes si no hay cursor, devueltos del más antiguo al más reciente;
     - cada mensaje con id, dirección, `sent_at` y cuerpo tal cual; el escape es de la 6.4;
     - devuelve el cursor de la página siguiente, o `null` si no hay más;
     - paginación según D-2; un cursor inválido da `VALIDATION_ERROR`.
   - **`changeConversationStatus(context, { conversationId, status })`**, solo para `admin`:
     - `FOR UPDATE` sobre la conversación y `recordAudit` en la misma transacción, con `entity_type = conversation`, `action = status_change` y `diff = { before: { status }, after: { status } }`;
     - el mismo estado devuelve `changed: false` y no escribe ni audita;
     - un estado desconocido da `VALIDATION_ERROR`; `viewer` o contraseña pendiente, `FORBIDDEN`; otra organización, `NOT_FOUND`;
     - concurrencia según D-3.
   - **`listConversationAudit`**: no se crea, porque ninguna pantalla muestra la auditoría de una conversación.
   - **`getClientActivity(context, clientId, { status, page })`**, para `admin` y `viewer`, para la pantalla 7:
     - verifica el cliente por la interfaz de `crm` (`NOT_FOUND` si es de otra organización);
     - devuelve su última interacción (`{ at, channel }` o `null`, sin contenido) y sus conversaciones filtradas por estado, 25 por página, por `last_message_at desc`, con la cantidad de mensajes;
     - la última interacción no depende del filtro de estado.
   - **`searchClientsByLastInteraction(context, filters)`**, para la pantalla 6, según D-1:
     - recibe los mismos filtros que `crm.searchClients` y devuelve la misma forma, con el teléfono enmascarado para `viewer` por `crm`, más `lastInteractionAt` por cliente;
     - orden: última interacción descendente; los clientes sin interacciones al final, por nombre sin distinguir mayúsculas y por `id`.
3. **`src/modules/crm/`**: las funciones que pida D-1, en `service.ts`, `repository.ts` e `index.ts`, con sus tests. Con (a) son dos:
   - `listClientOrderKeys(context, filters)`: ids y nombre de orden de todos los clientes que cumplen los filtros de búsqueda y actividad, sin teléfono;
   - `getClientsByIds(context, ids)`: los clientes de la organización con esos ids, con el teléfono según el rol.
   `searchClients` y el resto de `crm` no cambian.
4. **Fechas de calendario**, según D-5.
5. **Tests de integración** en `tests/integration/conversations.test.ts`, contra PostgreSQL real, con datos creados por cada caso (usan las funciones de `seeds/conversations.ts` solo si no acoplan los casos):
   - **lista**: cada filtro por separado y combinados; período en días de la organización con el borde de medianoche local y el 19/10/2008; orden con desempate; página fuera de rango; conteo de mensajes por fila; cliente nulo; "sin resultados" frente a "no hay conversaciones"; filtros inválidos con sus `fields`;
   - **sin contenido**: la respuesta de la lista, serializada a JSON, no contiene el texto de ningún mensaje. Se corre una vez con la consulta trayendo `body_text` para registrar que falla;
   - **aislamiento**: una conversación, un cliente o un cursor de otra organización no aparecen y dan `NOT_FOUND` donde corresponde; un filtro `clientId` de otra organización no devuelve filas;
   - **timeline**: 120 mensajes recorridos con cursores sin duplicados ni huecos, en orden; un mensaje insertado entre dos páginas no corre la siguiente (D-2); dos mensajes con el mismo `sent_at` quedan ordenados por `id`; una conversación sin mensajes devuelve lista vacía y cursor nulo;
   - **cambio de estado**: auditado con el `diff` exacto; sin cambios no audita; `viewer` y contraseña pendiente → `FORBIDDEN`; si la auditoría falla, el estado no cambia; dos cambios simultáneos según D-3;
   - **actividad del cliente**: última interacción entre varias conversaciones, independiente del filtro; conversaciones filtradas y paginadas; cliente sin conversaciones; cliente inactivo;
   - **clientes por última interacción**: orden con clientes sin interacciones al final y desempate por nombre; búsqueda por nombre y por teléfono completo; filtro de actividad; páginas y total; teléfono enmascarado para `viewer`, con la respuesta serializada (H-5).
6. **Mediciones**, registradas en el brief: `EXPLAIN (ANALYZE, BUFFERS)` y el tiempo de cada consulta y de cada función compuesta, sobre la organización de volumen de la base de desarrollo. Cubren la primera página y una profunda de la lista, un filtro de período, un filtro por cliente, el timeline, la actividad de un cliente con muchas conversaciones y la lista de clientes por última interacción. Cada una se compara con el umbral de D-4. Un script de medición, si hace falta, va en el scratchpad y no se versiona.
7. **Documentación**:
   - Overview: interfaz de `conversations`;
   - DataModel: notas de uso de los índices, si la medición las cambia;
   - TraceabilityMatrix: índices confirmados con `EXPLAIN` y la composición de D-1;
   - TestingStrategy: casos cubiertos;
   - RepositoryStructure: fila de la 6.3;
   - Risks, si la medición deja un riesgo.

## Alcance excluido

- Pantallas, Server Actions, Route Handlers y verificación de `Origin`: 6.4.
- Cambios en `src/app/`. Las pantallas 6 y 7 siguen usando lo que usan hoy hasta la 6.4.
- Escritura de conversaciones o mensajes, e ingestión: 6.5.
- Métricas y consultas de `analytics`: Fase 7.
- Búsqueda de conversaciones por contenido de mensajes.
- Migraciones o índices nuevos, salvo que la medición los exija. En ese caso es una condición de detención.
- Cambios en `audit`, `organizations`, `auth`, `catalog` o en los seeds. `inventory` solo cambia según D-5.
- Envío de mensajes (no existe en el MVP).

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/conversations/repository.ts`, `service.ts`, `index.ts` y sus tests unitarios.
- `src/modules/crm/service.ts`, `repository.ts`, `index.ts` y `service.test.ts`, solo para lo que pida D-1.
- Lo que pida D-5: `src/shared/calendar/` (nuevo) y `src/modules/inventory/service.ts` (solo el reemplazo de su validación local), o nada.
- `tests/integration/conversations.test.ts`.
- `tests/integration/crm.test.ts`, solo para sumar los casos de las funciones nuevas de `crm`.
- Los documentos del punto 7.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-CONV-01 a 03, FR-CLI-04 a 06 y FR-AUD-01.
2. [Screens.md](../product/Screens.md) §6 a §9 y los wireframes 06 a 09.
3. [DataModel.md](../architecture/DataModel.md) y [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md).
4. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): módulos, dependencias y frontera.
5. [SecurityModel.md](../architecture/SecurityModel.md): autorización, aislamiento y enmascarado.
6. [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): volumen de referencia.
7. Precedentes: [brief-4.3.3](brief-4.3.3-historial-de-movimientos.md) (período y páginas), [brief-4.2](brief-4.2-servicio-de-catalogo.md) (D-5), [brief-5.2](brief-5.2-servicio-de-clientes.md) (D-2 y D-4) y [brief-6.2](brief-6.2-seeds-sinteticos-de-conversaciones.md).

## Dependencias

- 6.2 cerrada (verificado).
- Volumen sembrado en la base de desarrollo (verificado en la 6.2).
- Autorización para medir contra la base de desarrollo.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-5 según la recomendación: (a) en las cinco. También autorizó medir con `EXPLAIN ANALYZE` y lecturas contra la base de desarrollo, y pasar la tarea 6.3 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Lista de clientes ordenada por última interacción

- **Opciones**:
  - (a) **Composición en `conversations`**, respetando la frontera:
    1. `crm` devuelve los ids y nombres de todos los clientes que cumplen los filtros (`listClientOrderKeys`);
    2. `conversations` obtiene la última interacción por cliente con una consulta agrupada sobre su índice;
    3. ordena y corta la página en memoria;
    4. `crm` devuelve esos 25 clientes con el teléfono según el rol (`getClientsByIds`).
    Son tres consultas y, como mucho, unas 10.000 filas livianas en memoria.
  - (b) **Desnormalizar** `clients.last_interaction_at`, mantenida por quien escribe conversaciones a través de una función de `crm`, en la misma transacción. Requiere una migración, cambiar los seeds y la 6.5.2, y reabre la resolución D-2 del brief-1.2, que eligió un dato derivado.
  - (c) **Ampliar la excepción de frontera**: que `conversations` lea `crm/schema` y haga el `JOIN` en SQL, como `analytics`. Es la opción más rápida, pero duplica en `conversations` la búsqueda y el enmascarado de `crm`, o los expone. Cambia RepositoryStructure y su guarda.
- **Recomendación**: (a), con la condición de D-4.
  - Mantiene las dos convenciones vigentes (sin `JOIN` entre módulos; quien depende compone) y deja en `crm` la búsqueda y el enmascarado de H-5.
  - Con el volumen de referencia, el costo esperado es de milisegundos. D-4 lo mide antes de aceptarlo.
  - (b) y (c) siguen disponibles, con su propia decisión, si la medición falla.
- **Consecuencia**:
  - `crm` suma dos funciones públicas;
  - el costo de la lista en memoria se suma al pendiente de la Fase 8;
  - la 6.4 conecta la pantalla 6 con la función nueva y deja `crm.searchClients` para los usos que no ordenan por interacción.

### D-2 — Paginación del timeline

- **Opciones**:
  - (a) **Por cursor** (`sent_at`, `id`): "mensajes anteriores a este", con el índice `(conversation_id, sent_at)` y desempate por `id`.
  - (b) **Por `offset`** desde el más reciente.
- **Recomendación**: (a).
  - Un mensaje nuevo no corre las páginas ya cargadas: con (b), cargar anteriores después de una ingestión duplicaría un mensaje.
  - Es la forma natural de "cargar anteriores" y no necesita un total.
- **Consecuencia**:
  - el cursor es opaco para la pantalla: el servicio lo emite y lo valida, codificado en texto seguro para la URL;
  - un cursor manipulado da `VALIDATION_ERROR`, y uno de otra conversación no devuelve filas ajenas.

### D-3 — Cambios de estado simultáneos

- **Opciones**:
  - (a) **Última escritura gana** (4.2, D-5): `FOR UPDATE`, `diff` sobre lo leído; los dos cambios se auditan en orden.
  - (b) **Estado esperado obligatorio**: la pantalla envía el estado que vio, y si cambió devuelve `CONFLICT`.
- **Recomendación**: (a).
  - Es la convención de las entidades editables. El estado es un solo campo, sin datos que se pierdan, y la auditoría deja las dos transiciones con su autor.
  - (b) se justificó en el stock porque un saldo equivocado es irreversible. Un estado se corrige con otro cambio.
- **Consecuencia**:
  - el `diff` de cada registro refleja el estado realmente leído bajo el bloqueo;
  - el test de concurrencia verifica que la segunda transacción ve el estado de la primera.

### D-4 — Umbral de la medición

- **Opciones**:
  - (a) **Cada consulta y cada función compuesta por debajo de 200 ms** en la máquina local con la organización de volumen (mediana de 5 corridas en caliente), y `EXPLAIN` sin recorridos secuenciales sobre `conversations` o `messages` donde se previó un índice.
  - (b) **Solo registrar** los tiempos, sin umbral.
- **Recomendación**: (a).
  - Convierte "tiempo interactivo" en un criterio verificable para esta fase, sin presentarlo como SLA de producción.
  - 200 ms deja margen para el render de la pantalla dentro de una respuesta interactiva.
- **Consecuencia**:
  - si una consulta supera el umbral, la implementación se detiene y se presenta una alternativa (índice, opción (b) o (c) de D-1) con su propia decisión;
  - la medición local se declara como tal y no reemplaza la de staging (Fase 9).

### D-5 — Validación de fechas de calendario compartida

- **Opciones**:
  - (a) **Extraer** `isCalendarDate` y el esquema de fecha opcional a `src/shared/calendar/`, con sus tests, y usarlos desde `inventory` y `conversations`. Es un cambio mecánico en `inventory`, sin cambio de comportamiento.
  - (b) **Duplicar** la validación en `conversations`.
- **Recomendación**: (a).
  - Dos copias de una regla de fechas divergen con el tiempo.
  - El cambio en `inventory` es de una línea de importación, y lo cubren sus tests existentes, que no cambian.
- **Consecuencia**: `src/shared/calendar/` no importa módulos, y `inventory` conserva su interfaz.

## Invariantes

- Ninguna respuesta de la lista de conversaciones ni de la actividad del cliente contiene el cuerpo de un mensaje.
- Ninguna respuesta de `conversations` contiene el teléfono de un cliente, salvo la que arma `crm` para la pantalla 6, que lo enmascara para `viewer`.
- Toda consulta filtra por `organization_id`.
- `conversations` usa `crm`, `organizations` y `audit` solo por sus interfaces públicas, sin `JOIN` entre módulos.
- `messages` no se actualiza ni se borra.
- Un cambio de estado y su auditoría se confirman o se revierten juntos.
- Sin dependencias, migraciones ni cambios en `src/app/`.

## Criterios de aceptación

- **AC-1**: D-1 a D-5 tienen resolución del usuario con fecha.
- **AC-2**: los casos del punto 5 pasan contra PostgreSQL real, con la evidencia de mutación de "sin contenido" registrada.
- **AC-3**: las mediciones del punto 6 quedan registradas y cumplen D-4.
- **AC-4**: `npm run test` pasa completo; los tests existentes solo cambian en lo autorizado.
- **AC-5**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-6**: `npm run test:e2e` sigue pasando 50 de 50.
- **AC-7**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`.
- **AC-8**: `git status` muestra solo archivos autorizados, y los documentos del punto 7 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: `npm run test` con los tests de integración contra PostgreSQL 18.6 real.
- **Evidencia de mutación**: "sin contenido" y un caso de H-5 en la lista por última interacción.
- **Evidencia de medición**: `EXPLAIN` y tiempos, declarados como locales.
- **Evidencia de CI**: ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para el servicio de conversaciones.

**No se valida**:

- las pantallas y el escape del cuerpo (6.4);
- el rendimiento en staging (Fase 9);
- la ingestión (6.5).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si una medición supera el umbral de D-4, o si hace falta un índice, una migración o una desnormalización.
- Si `conversations` necesita leer una tabla de otro módulo sin su interfaz pública.
- Si un test existente necesita cambios fuera de lo autorizado.
- Si aparece la necesidad de tocar `src/app/`, los seeds o una dependencia.
- Antes de medir contra la base de desarrollo, y antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-16)

La implementación está terminada y el cierre está pendiente. Se activó una condición de detención (D-4), y el usuario autorizó cómo seguir.

### Umbral de D-4: recorridos completos de `conversations`

Tres consultas recorren la tabla completa, aunque tienen un índice previsto: el total sin filtros, la página 400 y la última interacción por cliente. La causa es la distribución de los datos: la organización de volumen tiene 10.000 de las 10.010 conversaciones de la base de desarrollo, y leer la tabla es más barato. Con `enable_seqscan = off`, PostgreSQL usa los índices previstos (`conversations_organization_last_message_idx` y `conversations_organization_client_last_message_idx`) y tarda más: 12 a 22 ms contra 2 a 11 ms.

El usuario decidió aceptar el resultado y registrarlo:

- se cumple el tiempo y el índice queda probado;
- la condición se vuelve a medir en staging con varias organizaciones (Fase 9);
- Risks y TraceabilityMatrix lo registran.

### Ajustes dentro del alcance

- **Orden de las filas.** La lista ordena con `last_message_at desc nulls last`, igual que los índices generados en la 6.1. Con `desc` a secas, PostgreSQL ordena los nulos primero y no puede usar el índice.
- **Cursor del timeline.** Lleva `sent_at` con microsegundos, formateado por PostgreSQL, porque `Date` de JavaScript solo tiene milisegundos y el cursor perdería mensajes. Un caso inserta mensajes que difieren en un microsegundo.
- **`crm` no importa `conversations`.** `getClientsByIds` también le da a `conversations` los nombres de los clientes, y `conversations` descarta el teléfono.
- **Casos de `crm` en el test nuevo.** Los casos de `listClientOrderKeys` y `getClientsByIds` quedaron en `tests/integration/conversations.test.ts`; `crm.test.ts` no cambió.
- **Tests de las fechas compartidas.** `src/shared/calendar/` tiene su propio test unitario.
- **Overview** registra la dependencia de `conversations` con `audit` y la composición de D-1.

### Evidencia

- **Tests de conversaciones**: `tests/integration/conversations.test.ts` pasa 29 casos, `conversations/service.test.ts` pasa 7 y `shared/calendar` pasa 3. Los tests de `inventory` pasan sin cambios después de D-5.
- **Mutaciones**:
  - con la lista trayendo el último cuerpo (subconsulta con la referencia explícita a `"conversations"."id"`), falla el caso "no entrega el contenido", además de los de igualdad exacta. Un primer intento con `${conversations.id}` no probó nada: Drizzle lo escribe sin el nombre de la tabla, la subconsulta comparaba contra `m.id` y devolvía nulo;
  - con `getClientsByIds` sin enmascarar, fallan el caso de H-5 y el de `crm`;
  - en los dos casos se restauró el archivo.
- **Suite local**: `npm run test` pasa 533 de 533.
- **Con el contenedor detenido**: pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (198) y `build`, y `db:generate` no produce migraciones.
- **End-to-end**: `npm run test:e2e` pasa 50 de 50.

### Mediciones

Se tomaron en la base de desarrollo, en local y en solo lectura: la conexión fijó `default_transaction_read_only = on`, y un intento de escritura fue rechazado con `25006`. El contexto se armó sin iniciar sesión. Los scripts quedaron en el scratchpad.

| Consulta (`EXPLAIN ANALYZE`) | Tiempo | Plan |
|---|---|---|
| Lista: total | 1,0 ms | recorrido completo (ver arriba) |
| Lista: página 1 | 0,06 ms | ordenamiento incremental |
| Lista: página 400 | 5,4 ms | recorrido completo y ordenamiento (ver arriba) |
| Lista: período de 30 días, total | 3,8 ms | index only scan, `last_message` |
| Lista: período de 30 días, página 1 | 0,08 ms | ordenamiento incremental |
| Lista: estado `closed`, página 1 | 0,12 ms | ordenamiento incremental |
| Lista: por cliente | 1,4 ms | ordenamiento incremental |
| Conteo de mensajes de una página | 8,4 ms | index scan, `messages_conversation_sent_idx` |
| Timeline: últimos 51 | 0,14 ms | ordenamiento incremental |
| Última interacción por cliente | 3,4 ms | recorrido completo y hash (ver arriba) |
| Última interacción de un cliente | 0,04 ms | index scan, `client_last_message` |
| `crm`: ids en orden de nombre | 46,7 ms | recorrido completo de `clients` y ordenamiento |
| `crm`: clientes por ids | 0,2 ms | index scan, clave primaria |

| Función (mediana de 5 corridas en caliente) | Mediana | Máximo |
|---|---|---|
| `listConversations`, página 1 | 43,2 ms | 80,4 ms |
| `listConversations`, página 400 | 17,9 ms | 27,3 ms |
| `listConversations`, período de 30 días | 28,7 ms | 29,7 ms |
| `listConversations`, por cliente | 11,9 ms | 14,4 ms |
| `getConversation` | 7,8 ms | 8,5 ms |
| `listConversationMessages` | 8,5 ms | 8,8 ms |
| `getClientActivity` | 15,4 ms | 16,2 ms |
| `searchClientsByLastInteraction`, página 1 (`admin`) | 93,0 ms | 101,4 ms |
| `searchClientsByLastInteraction`, página 400 (`viewer`) | 69,9 ms | 85,9 ms |
| `searchClientsByLastInteraction`, por nombre | 33,5 ms | 34,2 ms |

Todas quedan por debajo de los 200 ms de D-4.

Pendiente: commit, push, CI (AC-7) y cierre.
