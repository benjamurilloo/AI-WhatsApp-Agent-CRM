---
schema: task-brief.v1
task_id: "16.4"
task_type: implementation
generated_at: 2026-10-07
---

# Brief 16.4 — Notas de la conversación

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el modelo, el servicio, la pantalla y el vaciado, contra PostgreSQL real;
  - `isolated-runtime` para el despliegue y el recorrido del usuario en producción.
- **Nivel de validación alcanzable**: validado localmente y en CI, y desplegado en producción. No hay consumidor externo: no aplica «validado en integración» con el agente. No es «preparado para producción».
- **Orden**: cuarta subfase de la Fase 16 ([Roadmap](../planning/Roadmap.md) §Fase 16), después de la 16.3. No depende del agente.
- **Estado**: **aprobado por el usuario el 2026-10-07**, con las recomendaciones de D-1 a D-10 y la enmienda del ADR 0015. El mismo día, durante la implementación, aprobó la precisión de D-4 y la ampliación del alcance a seis specs end-to-end; el 2026-10-08, la de `identity-schema.test.ts` (§Cambios aprobados durante la implementación).

## Objetivo

Quien atiende una conversación deja notas internas en ella: qué se habló por fuera, qué falta hacer, qué prometió el negocio. Las notas son del equipo del CRM. **No las ve el cliente ni el agente.**

El Roadmap las pide así (§Fase 16, agregado el 2026-10-05):

> notas de la conversación, escritas por un usuario del CRM y distintas de las notas del cliente

Sirven sobre todo junto con la 16.3: cuando una persona pausa al agente y atiende la conversación por la app de WhatsApp, lo que contestó no llega al CRM. Una nota deja constancia.

## Lo que se verificó antes de escribir este brief

- **Las notas del cliente** son una sola columna editable, `clients.notes` (texto, hasta 1000 caracteres, solo `admin`). Su auditoría guarda el texto completo en el `diff` (brief-5.2, D-6), y el vaciado de la 13.4 la borra porque es una entrada de `entity_type = 'client'`.
- **El vaciado no alcanza la auditoría de una conversación.** [ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md), punto 2: el trigger de `audit_logs` solo deja vaciar entradas de un cliente, porque las de conversaciones «no guardan datos de una persona del negocio». `scripts/client-data-delete.ts` vacía solo esas. **Una nota es texto libre y puede tener datos personales**: si su texto entrara en el `diff` de una auditoría de conversación, el vaciado no lo alcanzaría.
- **Las tablas de solo inserción** (regla 10 de [DataModel](../architecture/DataModel.md)) son `inventory_movements`, `audit_logs`, `messages` y `product_prices`. El ADR 0015 abrió un único `UPDATE` de vaciado solo en `messages` y `audit_logs`.
- **Escribir requiere `admin`** ([SecurityModel](../architecture/SecurityModel.md), §Autorización): toda escritura sensible es del admin, y los dos roles leen.
- **Los registros de solo inserción también se auditan**: el cambio de precio (`price_change`) y el ajuste de stock (`stock_adjustment`) tienen la fila propia y además su auditoría.
- **El nombre del autor** sale de `getMemberSummaries` de `organizations`, que filtra por organización (9.0.1). `conversations` ya depende de `organizations` ([Overview](../architecture/Overview.md), §Módulos), así que no hace falta una dependencia nueva.
- **La exportación** (`scripts/client-data-export.ts`) lista tablas una por una: una tabla nueva no entra sola.
- **El agente** no lee nada de esto: ninguna ruta de lectura ni evento de la ingestión toca notas.

### Hallazgos al contrastar con las reglas vigentes

- **H-1. La nota choca con el vaciado, salvo que se diseñe para él.** Las dos reglas que choca son el ADR 0015, punto 2, y el runbook [datos-de-un-cliente](../runbooks/datos-de-un-cliente.md). Lo resuelven D-1 y D-4: el texto vive solo en la tabla de notas, que el vaciado alcanza, y la auditoría no lo copia. Exige **enmendar el ADR 0015** para sumar la tabla nueva, con aprobación del usuario.
- **H-2. Overview se contradice con el código.** Overview §Lectura del historial, paso 5, dice que el autor se compone «con `getUserSummaries` de `auth`». Desde la 9.0.1 todos los módulos usan `getMemberSummaries` de `organizations` (`organizations/service.ts`, y el comentario de `eslint.config.mjs`). Gana el código. Se corrige en esta subfase, porque Overview entra en la lista para describir la lectura de notas.

## Decisiones

### D-1 — El modelo

- **(a) Recomendada: una tabla `conversation_notes`, de solo inserción, con el vaciado del ADR 0015.**
  - Cada nota es una fila: organización, conversación (clave compuesta, como `messages`), autor (`actor_user_id`), texto y fecha.
  - `crm_app` tiene solo `SELECT` e `INSERT`. Un trigger rechaza `UPDATE` y `DELETE` para cualquier rol, salvo un único `UPDATE`: el que lleva el texto a nulo y deja el resto de la fila igual. Es el mismo diseño que `messages`.
  - **No se editan ni se borran** desde la pantalla. Una nota equivocada se corrige con otra.
  - Exige la enmienda del ADR 0015 (H-1).
- (b) Una tabla editable, con borrado lógico (regla 8). Cada edición tendría que auditarse, y el texto anterior quedaría en un `diff` de auditoría de una conversación, que el vaciado no alcanza. Habría que enmendar también el punto 2 del ADR 0015.
- (c) Una columna `notes` en `conversations`, como la del cliente. Una sola nota que se pisa, sin autor por nota, con el mismo problema de auditoría que (b).

### D-2 — Quién escribe y quién lee

- **(a) Recomendada: escribe solo el `admin`; leen los dos roles**, como el resto de la pantalla 9. Es lo que pide SecurityModel. El viewer ya lee el texto de los mensajes, así que leer notas no le abre nada nuevo.
- (b) También escribe el viewer. Contradice SecurityModel y exige enmendarlo.

### D-3 — Contenido y límites

- **(a) Recomendada**:
  - texto plano, de 1 a 1000 caracteres después de recortar, como `clients.notes`; se muestra escapado y con los saltos de línea;
  - sin límite de notas por conversación, con paginado de 25, de la más reciente a la más vieja;
  - una conversación cerrada también acepta notas: lo que pasó después de cerrar también se anota.
- (b) No aceptar notas en una cerrada.

### D-4 — La auditoría

- **(a) Recomendada: una entrada `note_added`** por nota, con la conversación como entidad, el usuario como autor y un `diff` **sin el texto**: `{ before: null, after: { noteId } }`. Así la auditoría de una conversación sigue sin datos de una persona, como afirma el ADR 0015, y el texto vive en un solo lugar.
- **Precisión aprobada el 2026-10-07**: el `diff` es `{ before: { noteId: null }, after: { noteId } }`. El `{ before: null, ... }` que decía (a) choca con `recordAudit`, que reserva `before: null` para `create` ([DataModel](../architecture/DataModel.md), auditoría de `price_change`); lo encontró el test de integración. Es la forma de `tag_change`. Sigue sin el texto.
- (b) Sin auditoría: la fila de la nota ya dice quién y cuándo. Se aparta del precedente de `price_change` y `stock_adjustment`.
- (c) Con el texto en el `diff`. Rompe el ADR 0015, punto 2.

### D-5 — El borrado y la exportación de los datos de un cliente (13.4)

- **(a) Recomendada**:
  - `--vaciar` lleva a nulo el texto de las notas de **todas las conversaciones del cliente**, en la misma transacción, después de bloquear sus conversaciones;
  - el informe cuenta las notas;
  - la exportación las incluye;
  - las notas de una **conversación sin cliente** quedan fuera del alcance, como sus mensajes (`NOT_REACHED`);
  - se actualiza el runbook.
- `--borrar` no cambia: solo borra un cliente sin conversaciones, y una nota siempre tiene conversación.

### D-6 — La pantalla

- **(a) Recomendada: una tarjeta «Notas» en la pantalla 9.**
  - La lista muestra el texto, el autor y la fecha y hora en la zona de la organización, con «Ver anteriores» si hay más de 25.
  - Vacía, dice «Sin notas».
  - El admin ve arriba un campo de texto y «Agregar nota», con el resultado anunciado por `aria-live` y el foco en el error, como el formulario de la pausa.
  - Sirve con teclado, pasa axe y se usa a 375 px.
- La lista de conversaciones (pantalla 8) y la ficha del cliente (pantalla 7) **no** muestran notas.

### D-7 — Lo que no ve el agente

- **(a) Recomendada: nada.** Ninguna ruta de lectura ni evento de ingestión las expone. Si más adelante el agente tiene que leerlas, es un cambio de contrato con su propio brief.

### D-8 — Etapas

- **16.4.1 — Local**: migraciones, servicio, pantalla, vaciado, exportación, tests y documentos. Commit y push con autorización.
- **16.4.2 — Producción**: despliegue con las migraciones `0029` y `0030`, con autorización y recuentos antes y después. Después, **el usuario agrega una nota** en una conversación de la organización de demostración y la ve en la pantalla.

### D-9 — Revisión independiente

- **(a) Recomendada: sí, antes del commit de la 16.4.1.** Trae una tabla con datos personales, un trigger nuevo y cambios en el vaciado, que es un borrado irreversible.

### D-10 — Cuándo cierra

- **(a) Recomendada**: con la 16.4.2 hecha y el recorrido del usuario en producción, y su aprobación.

## Alcance incluido

- `drizzle/0029_*.sql`, la tabla, y `drizzle/0030_*.sql`, a medida, con los privilegios y el trigger; `drizzle/meta/*`;
- `src/modules/conversations/schema.ts`, `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`;
- `src/modules/audit/schema.ts`: el valor `note_added` de `audit_action`;
- `src/app/(autenticado)/conversaciones/actions.ts` y `messages.ts`;
- `src/app/(autenticado)/conversaciones/[conversationId]/page.tsx`, y un archivo nuevo, `conversation-notes-form.tsx`;
- `scripts/client-data-delete.ts` y `scripts/client-data-export.ts`;
- tests:
  - `tests/integration/conversation-notes.test.ts`, nuevo;
  - `tests/integration/conversations-schema.test.ts`: privilegios y trigger;
  - `tests/integration/audit.test.ts`: la tabla nueva en la cobertura de privilegios de solo inserción;
  - `tests/integration/client-data.test.ts`: vaciado, informe y exportación con notas;
  - `tests/guards/exposed-surface.test.ts`;
  - `tests/e2e/conversations.spec.ts`;
  - `tests/e2e/security-headers.spec.ts`, `ingestion.spec.ts`, `dashboard.spec.ts`, `dashboard-sin-ingestion.spec.ts`, `clients.spec.ts` y `client-tags.spec.ts`: solo `conversation_notes` en su `TRUNCATE` (ampliación aprobada el 2026-10-07);
  - `tests/integration/identity-schema.test.ts`: solo `conversation_notes` en la lista exacta de tablas (ampliación aprobada el 2026-10-08);
- documentos:
  - `docs/architecture/DataModel.md`: la tabla, la regla 10 y el valor de auditoría;
  - `docs/architecture/SecurityModel.md`: la acción nueva en el inventario de entradas;
  - `docs/architecture/Overview.md`: la lectura de notas y la corrección de H-2;
  - `docs/architecture/TraceabilityMatrix.md`;
  - `docs/decisions/0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md`: la enmienda fechada;
  - `docs/runbooks/datos-de-un-cliente.md`;
  - `docs/product/FunctionalRequirements.md`: FR-CONV-07, nuevo;
  - `docs/product/Screens.md`: la pantalla 9;
  - este brief;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md`, `docs/decisions/README.md` y `docs/planning/Roadmap.md`.

## Cambios aprobados durante la implementación

- **Precisión de D-4** (2026-10-07): el `diff` de `note_added` lleva `before: { noteId: null }`, no `before: null`. Ver D-4.
- **Seis specs end-to-end más** (2026-10-07): vacían `conversations` con un `TRUNCATE` sin `CASCADE`, y PostgreSQL lo rechaza (`0A000`) desde que `conversation_notes` la referencia, aunque no haya notas. Se comprobó contra la base de test, en una transacción revertida. El cambio es solo sumar `conversation_notes` a ese `TRUNCATE`, como se hizo con `client_tag_assignments` en la 16.1.
- **`identity-schema.test.ts`** (2026-10-08): compara la lista exacta de tablas de `public`, y la tabla nueva la hacía fallar. El cambio es solo sumar `conversation_notes`, en orden alfabético.

## Alcance excluido

- **Editar o borrar una nota** desde la pantalla (D-1).
- **Notas en la lista de conversaciones o en la ficha del cliente** (D-6).
- **Que el agente lea o escriba notas** (D-7).
- **Menciones, adjuntos, formato o notificaciones.**
- **Responder desde el CRM**: es la 16.5, solo un ADR.
- **Cambios en la ingestión o en la lectura.**

## Fuentes de verdad

- Las migraciones y el código.
- DataModel, SecurityModel y Overview.
- El ADR 0013, el ADR 0015 y el runbook de datos de un cliente.
- El Roadmap.

## Invariantes

1. **Una nota nunca cambia de texto, solo puede perderlo** por el vaciado. Lo garantiza el trigger, para cualquier rol.
2. **El texto de una nota vive solo en `conversation_notes`**: no se copia a la auditoría, al log ni a ninguna respuesta de la API.
3. **Solo el admin escribe**, solo en conversaciones de su organización. Ninguna organización lee las notas de otra.
4. **El vaciado de un cliente alcanza las notas de todas sus conversaciones**, en la misma transacción que sus mensajes.
5. **Ninguna respuesta de la ingestión o de la lectura cambia.**

## Criterios de aceptación

- **AC-1** (D-1, D-3): un admin agrega una nota en una conversación `open`, `pending` o `closed`. Queda con su autor y su fecha. El texto vacío o de más de 1000 caracteres se rechaza con `VALIDATION_ERROR`.
- **AC-2** (D-4): cada nota deja un `note_added` con el usuario como autor y el `diff` sin el texto. Si la auditoría falla, la nota no queda.
- **AC-3** (D-2, invariante 3): un `viewer` lee las notas y no puede agregar ninguna, ni desde la pantalla ni llamando a la acción. Una conversación de otra organización da el mismo `NOT_FOUND` que una inexistente, al leer y al escribir.
- **AC-4** (D-1, invariante 1):
  - `crm_app` no tiene `UPDATE` ni `DELETE` sobre `conversation_notes`;
  - el trigger rechaza todo `UPDATE` y todo `DELETE` del dueño, salvo el vaciado;
  - un vaciado repetido se acepta, y no se puede devolver texto a una nota vaciada.
- **AC-5** (D-5, invariante 4): `--vaciar` deja sin texto las notas de las conversaciones del cliente, y no toca las de otro cliente ni las de otra organización. El informe las cuenta y la exportación las trae.
- **AC-6** (D-6): la pantalla 9 muestra las notas con autor y fecha, pagina de a 25 y deja agregar al admin. Lo cubre un end-to-end con teclado y axe, también a 375 px. El viewer no ve el formulario.
- **AC-7** (invariante 2, invariante 5): el texto de la nota no aparece en `audit_logs`, en el log estructurado ni en ninguna respuesta de la API. Los tests de la ingestión y de la lectura siguen iguales.
- **AC-8**:
  - la acción nueva está en la guarda de superficie expuesta y en SecurityModel;
  - FR-CONV-07 aparece en los tests;
  - la enmienda del ADR 0015 y el runbook están escritos;
  - los documentos de la lista no se contradicen.
- **AC-9**: la batería completa da verde: formato, lint, tipos, unitarios, guardas, integración, build y end-to-end. Además, cada una de estas mutaciones da rojo:
  - agregar sin comprobar el rol;
  - leer sin filtrar por organización;
  - un trigger que deja cambiar el texto por otro;
  - el vaciado sin las notas.
- **AC-10** (D-9): hay revisión independiente antes del commit, con cada hallazgo verificado contra el código.
- **AC-11** (16.4.2), con autorización:
  - el despliegue aplica la `0029` y la `0030`, y quedan 31 migraciones;
  - los recuentos son iguales antes y después;
  - el usuario agrega una nota en producción y la ve;
  - el usuario aprueba el cierre.

## Pruebas y evidencia requerida

- `deterministic`: servicio, trigger, privilegios y vaciado contra PostgreSQL real, con las mutaciones de AC-9 en rojo.
- `isolated-runtime`: el despliegue y el recorrido de la 16.4.2, con comandos y salidas en este brief, sin secretos ni IP.

## Condiciones de detención

Detenerse y avisar al usuario si pasa algo de esto:

- hace falta tocar un archivo fuera de la lista, o una tercera migración;
- el vaciado exige dar `UPDATE` a `crm_app` o desactivar un trigger;
- el texto de una nota tiene que pasar por la auditoría o por el log;
- cambia una respuesta existente de la ingestión o de la lectura;
- la enmienda del ADR 0015 resulta más amplia que sumar la tabla nueva.

También hay que pedir autorización explícita en su turno **antes de** cada uno de estos pasos:

- el commit de la 16.4.1 y el push;
- el despliegue con las migraciones;
- los cambios en Notion;
- el cierre.

## Resultados 16.4.1

**Nivel alcanzado**: validado localmente (`deterministic`), sin commit hasta la autorización del usuario. No desplegado.

- **Implementado**:
  - la migración `drizzle/0029_conversation_notes.sql`, generada, con la tabla, su `CHECK`, sus claves foráneas, su índice y el valor `note_added`;
  - la migración `drizzle/0030_conversation_notes_privileges.sql`, a medida, con `SELECT` e `INSERT` para `crm_app` y el trigger de solo inserción que deja pasar únicamente el vaciado del texto;
  - `addConversationNote` y `listConversationNotes` en `conversations`, y la tarjeta «Notas» de la pantalla 9;
  - el informe, la exportación y el vaciado de `scripts/client-data-*.ts`, con las notas.
- **Archivos sumados a la lista** con autorización del usuario: los seis specs end-to-end, el 2026-10-07, e `identity-schema.test.ts`, el 2026-10-08 (§Cambios aprobados durante la implementación).
- **Batería** (2026-10-08):
  - formato, lint, tipos y build pasan;
  - unitarios: 584 tests; guardas: 485;
  - integración: 792 tests en 49 archivos, entre ellos los de `conversation-notes.test.ts` y los casos 21 a 26 de `client-data.test.ts`;
  - end-to-end: 132, con los casos 16 y 17 de conversaciones.
  - **Dos caídas de proceso sin causa encontrada**, que no se repitieron:
    - el 2026-10-07, un worker de Vitest terminó con `3221226505` durante `conversations-schema.test.ts`. Esa suite pasó sola, y la integración completa pasó entera el 2026-10-08;
    - el 2026-10-08, el servidor de `next start` dejó de responder en el caso 17. Las 89 pruebas siguientes fallaron por conexión rechazada, y el log no muestra el error. Con el mismo build, la corrida siguiente dio 132 de 132.
- **Mutaciones de AC-9**, cada una en rojo y revertida byte por byte:
  - agregar sin comprobar el rol: 1 test unitario y 1 de integración en rojo;
  - leer sin filtrar por organización, sin `findReadable` y sin el filtro de `findNotesBefore`: 1 test de integración;
  - el trigger asignando `NEW.body_text` a la fila esperada, lo que deja cambiar el texto por otro: 2 tests de esquema;
  - el `UPDATE` de notas del vaciado con `and false`: 1 test de `client-data`;
  - además, por R-1, el `UPDATE` de notas antes del bloqueo de las conversaciones: el caso 25 en rojo.
- **AC-7, el log estructurado**: verificado por lectura, no por un test. `addConversationNoteAction` y `loadOlderNotesAction` pasan a `logEvent` solo el código, y `logEvent` registra del error solo el nombre y el código (revisión independiente, R-5).

### Revisión independiente (D-9, AC-10)

La hizo un agente que no participó del trabajo, con acceso de solo lectura, antes de estas correcciones. Cada hallazgo se verificó contra el código. **Las correcciones son autoevaluación**: el revisor no las vio.

- **R-1**, medio: ninguna prueba cubría una nota confirmada mientras corre el vaciado. **Confirmado y corregido**: el caso 25 de `client-data.test.ts` retiene la inserción de la nota en otra conexión, y el vaciado espera y la alcanza. La mutación de arriba lo pone en rojo.
- **R-2**, bajo: Overview y el runbook describían un solo orden de llegada. **Confirmado y corregido**:
  - una nota escrita después del vaciado conserva su texto hasta un vaciado repetido; lo fija el caso 26 y lo dicen Overview §Notas y el runbook;
  - el runbook ahora nombra `conversation_notes` entre las tablas cuyo único cambio es el del script.
- **R-3**, bajo: en el caso 23, la nota de otra organización no discrimina el filtro por organización del `UPDATE`, porque la clave foránea compuesta ya lo impide. **Confirmado**: queda dicho en un comentario del caso y en la matriz de trazabilidad.
- **R-4**, bajo: `conversations/schema.ts` importa `users` de `auth` para la clave foránea del autor, y Overview §Módulos no lo declaraba. **Confirmado y corregido** en la fila de `conversations`. Contradice la frase «no hace falta una dependencia nueva» de §Lo que se verificó: vale para leer el nombre, no para el esquema.
- **R-5**, bajo: lo de AC-7 sobre el log, arriba.
- **R-6**, nota: el revisor pidió dónde estaban las mutaciones. Están arriba.
- **R-7**, nota: con un id inválido, el formulario mostraba el mensaje del texto. **Confirmado y corregido**: sin `fields` muestra el de conversación inexistente, y el campo se marca inválido solo si el rechazo fue por el texto. El caso 17 lo comprueba con el rechazo a quien dejó de ser admin.
- **R-8**, nota: el `maxLength` del navegador cuenta unidades UTF-16, y el `CHECK` cuenta caracteres. **Confirmado, sin cambio**: el navegador puede rechazar antes, nunca dejar pasar de más, y el servidor valida igual.
- **R-9**, nota: `.claude/settings.json`, sin seguimiento, no entra en el commit. **Confirmado**.
- **Fuera de la lista**, para el cierre: `NonFunctionalRequirements.md` y SecurityModel §Auditoría no nombran todavía `conversation_notes` entre las tablas de solo inserción. La omisión ya existía antes de esta subfase.
