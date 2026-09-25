---
schema: task-brief.v1
task_id: "12.1"
task_type: implementation
generated_at: 2026-09-25
---

# Brief: 12.1 — Actor de servicio y cliente por teléfono

**Estado: aprobado el 2026-09-25 por el usuario, con las recomendaciones de D-1 a D-13**, incluida la interpretación de §Versionado de D-1. La aprobación no autoriza commits, pushes ni despliegues: se piden en su turno.

**Antes de la 12.1.1**, el mismo día y autorizado aparte por el usuario, se corrigió `tests/e2e/conversations.spec.ts`, caso 2, que no pertenece a esta subfase. La traza del run 36150156775 (intentos 1 y 2 fallados, 3 en verde) mostró una lectura `response.text()` de un prefetch de RSC cortado por la navegación: quedó sin resolver ni rechazar, y `Promise.all(pending)` agotó el test. La corrección aplica el `drain` de `clients.spec.ts`, que lee los cuerpos con la red en reposo antes de cada navegación (convención de la 6.4). En local pasó 100 de 100 con `--repeat-each=10`. Ese número no prueba la corrección, porque antes tampoco fallaba en local: la prueba es la CI.

## Objetivo

Que un servicio autenticado pueda resolver «el cliente de este teléfono» en el CRM —encontrarlo o crearlo—, de forma idempotente, y que toda escritura que eso produzca quede auditada **con un actor de servicio** y no con un usuario humano. Es la primera escritura de la Fase 12 que no es un mensaje, y el primer registro de auditoría sin autor humano.

Resultado verificable: un evento enviado dos veces crea un solo cliente y una sola fila de auditoría, cuyo autor es la credencial que lo envió, y el detalle del cliente lo muestra.

## Situación en la fase

- **Necesario ahora (12.1)**: el actor de servicio, la resolución del cliente por teléfono y la corrección del README de despliegue (E-1).
- **Lo usan las subfases siguientes**: la 12.2 (conversación vigente y derivación) audita el cambio de estado con el mismo actor; la 12.3 (contrato v2) cambia `message.recorded`, que acá **no se toca**.
- **Antes de producción, no acá**: la retención y el borrado real (13.4), y la disponibilidad (13.3).

## Decisiones previas (las decide el usuario al aprobar)

El Roadmap exige que esta subfase decida dos cosas **antes de diseñar**: M-5 (por dónde entra la escritura) y R-3 (datos reales en staging). El resto son decisiones de diseño que dependen de ellas. Cada una lleva mi recomendación. **Si el usuario elige otra opción en D-1, el resto del brief se reescribe antes de aprobarse**: no se aprueba con condicionales.

### D-1 — Por dónde entra «buscar o crear por teléfono» (M-5)

El [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) describe dos superficies: la lectura por la API de servicio y la escritura por el contrato de ingestión. La resolución del cliente escribe, y no es un mensaje.

- **(A) Evento nuevo del contrato de ingestión v1, `client.resolved`**, en el mismo endpoint. **Recomendada.**
  - Reutiliza todo lo que ya está validado: la credencial `ingest`, la allowlist, el modo de prueba, el límite de tasa y, sobre todo, **el ledger de idempotencia** (`ingestion_events`), con sus tres tipos de reenvío.
  - [ingestion-v1.md](../contracts/ingestion-v1.md) §Versionado lo permite dentro de v1: «agregar un `event_type` nuevo» es un cambio compatible. Un emisor que solo manda `message.recorded` no nota nada.
  - No hace falta un ADR: es la superficie de escritura que el 0014 ya prevé.
  - **Costo, dicho explícitamente**: el tipo nuevo responde con datos (el cliente resuelto), cosa que `message.recorded` no hace. Lo interpreto como una respuesta propia de un tipo nuevo, no como un cambio de las respuestas existentes, que §Versionado manda a v2. **Esa interpretación es parte de lo que se aprueba.**
- **(B) Tercera superficie**, por ejemplo `POST /api/service/v1/clients:resolve`, con su contrato y su alcance de credencial. Exige un ADR que enmiende el 0014. Descartada: duplica el ledger de idempotencia, el alcance, la allowlist y el límite de tasa para una sola operación, y la 12.2 tendría que decidir de nuevo dónde va el cambio de estado.
- **(C) El cliente se crea como efecto de `message.recorded`**, y el agente lo busca por la API de lectura. Descartada:
  - cambia una regla de v1 («el cliente se resuelve solo al crear la conversación y nunca se crea»), y eso es v2, o sea la 12.3;
  - el agente no tendría el cliente antes de responder el primer mensaje.

### D-2 — Datos personales en staging durante la Fase 12 (R-3)

La [evaluación 10.1](evaluacion-10.1-mvp.md) §R-3 exige que este brief diga si las pruebas contra staging usan teléfonos o mensajes reales, aunque sean de quienes prueban.

- **Recomendación: toda la Fase 12 trabaja con teléfonos y mensajes sintéticos.** La reapertura de la retención **no** se adelanta y sigue en la 13.4.
- Teléfonos sintéticos: los del rango que ya usan los fixtures (`+54911555500xx`), que no pertenecen a nadie de este proyecto.
- **La 12.1 no despliega a staging**: termina validada localmente y en CI.
- **Consecuencia para la 12.5**: el turno completo se recorre con mensajes entrantes simulados hacia el agente, no con WhatsApp desde teléfonos reales. Si para entonces el usuario quiere mensajes reales, esa decisión cambia esta y **la reapertura de R-3 se hace antes de que entre el primer dato real**, no después.

### D-3 — Cómo se modela el actor de servicio

Hoy `audit_logs.actor_user_id` es `NOT NULL` con clave foránea a `users` ([DataModel](../architecture/DataModel.md), [brief-3.6](brief-3.6-modulo-de-auditoria.md)), y la 6.5.2 (§10) y la 6.5.3 (§7) ya registraron que la ingestión no tiene autor humano.

- **Recomendación**: `actor_user_id` pasa a admitir nulos, y se agrega `actor_credential_id uuid` con clave foránea a `ingestion_credentials` (`ON DELETE RESTRICT`), más un `CHECK (num_nonnulls(actor_user_id, actor_credential_id) = 1)`. Una credencial revocada no se borra (se revoca con fecha), así que la clave foránea no bloquea nada que hoy ocurra.
- **Descartado**: un usuario sintético por organización. Abre una cuenta que podría ingresar, aparece en la lista de miembros e interactúa con la regla del último `admin`.
- **Descartado**: guardar el `source` como texto sin clave foránea. Viola la regla de claves foráneas reales del brief-3.6, y el `source` no identifica una credencial (se rota).
- **Enmienda que se registra**: el brief-3.6 (D-5) decía que `auth` y `organizations` eran «la única dependencia» de `audit`. Con esto, `audit/schema.ts` importa también `ingestion/schema`. ESLint ya lo permite (`!@/modules/*/schema`), y la enmienda se escribe con fecha en DataModel.

### D-4 — Cómo se muestra el autor de servicio

- **Recomendación**: `listEntityAuditLogs` devuelve un actor discriminado, `{ kind: "user", userId }` o `{ kind: "service", credentialId, source }`.
- Los tres lectores que componen el autor (`crm`, `catalog` y `knowledge`) muestran **«Servicio · &lt;source&gt;»**.
- En la 12.1 solo los clientes pueden recibir filas de servicio, pero el tipo obliga a tratarlo en los tres, que es lo que se busca: ninguno muestra un autor vacío.

### D-5 — Nombre de un cliente creado por servicio

`clients.display_name` es `NOT NULL`.

- **Recomendación**: el evento trae `client.display_name`, opcional, con las mismas reglas que el alta desde el backoffice. Si viene `null`, el cliente se crea como **«Sin nombre»**.
- **Nunca se usa el teléfono como nombre**: se saltearía el enmascarado del teléfono para `viewer` (H-5), porque el nombre no se enmascara.

### D-6 — Cliente que ya existe

- **Recomendación**: si ya existe un cliente con ese teléfono en la organización, **no se escribe nada**: ni el nombre, aunque el evento traiga otro, ni la auditoría.
- El nombre lo administra el negocio desde el backoffice. El servicio solo lo propone al crear.

### D-7 — Cliente inactivo que escribe

- **Recomendación**: se devuelve ese mismo cliente con `is_active: false`. No se reactiva y no se crea otro, porque la unicidad del teléfono alcanza también a los inactivos (brief-5.1, D-3).
- Qué hace el agente con un cliente inactivo lo decide el agente. El CRM informa, no actúa.

### D-8 — Origen del cliente

- **Recomendación**: sin columna nueva. El origen se deriva de la fila `create` de la auditoría: un actor de servicio o un usuario. El `admin` ya la ve en el detalle del cliente.
- Si una pantalla necesita filtrar por origen, se agrega la columna con su propio brief. Hoy ninguna pantalla lo pide.

### D-9 — Respuesta de `client.resolved`

- **Recomendación**: `200` con `{ "result": "accepted" | "duplicate", "event_id", "client": { "id", "display_name", "is_active" } }`.
- **No lleva teléfono**, porque el agente ya lo tiene. **Tampoco lleva `created`**: `ingestion_events` no guarda resultados (6.5.1, D-5), así que un reenvío no podría responderlo igual que el original.
- **Reenvío** (mismo `event_id` y mismo hash): se vuelve a buscar por teléfono, sin escribir. Si el teléfono ya no pertenece a ningún cliente, porque se editó en el backoffice, responde `duplicate` con `client: null`. **Un reenvío nunca crea.**

### D-10 — Dos eventos distintos con el mismo teléfono a la vez

- **Recomendación**: la creación usa `INSERT … ON CONFLICT (organization_id, phone_e164) WHERE phone_e164 IS NOT NULL DO NOTHING RETURNING`, repitiendo el predicado del índice parcial (convención de la 6.5.2). Después se lee la fila en la misma transacción.
- Solo audita quien insertó. El test lo prueba con requests simultáneos y una corrida sin el `ON CONFLICT`.

### D-11 — Cómo se verifica E-1

- **Recomendación**: las tres secciones de `deploy/staging/README.md` (Aprovisionamiento, paso 5; Desplegar un cambio; Encender y apagar la API de lectura) se reescriben con la forma que funcionó en la 11.4, registrada en [evidencia-11.4](evidencia-11.4-piloto.md) §AC-6.
- La verificación es una **comparación textual contra esa evidencia**, no una corrida nueva, porque la 12.1 no despliega (D-2).
- La primera corrida del README corregido queda registrada como pendiente del próximo despliegue.

### D-12 — Dos etapas, cada una con su CI en verde

- **12.1.1**: actor de servicio (D-3 y D-4) y E-1.
- **12.1.2**: el evento `client.resolved` (D-1 y D-5 a D-10).
- La 12.1.2 no empieza sin la CI de la 12.1.1 en verde.

### D-13 — Revisión independiente

La 12.1 no abre ni cierra un gate, así que la revisión es opcional (ExecutionProtocol, paso 4b).

- **Recomendación: hacerla igual**, al final de la 12.1.2. Cambia el esquema de la tabla de auditoría, que es de solo inserción, y amplía un contrato externo.
- La última observación registrada ([HANDOFF](../../HANDOFF.md) §7) es que ninguna ronda de correcciones propias salió limpia.

## Alcance incluido

**12.1.1**
- Migración `0021` (generada y `--custom`): `actor_user_id` admite nulos, se agrega `actor_credential_id` con su clave foránea y el `CHECK` de exactamente un actor. Los privilegios y el trigger de solo inserción no cambian.
- `recordAudit` acepta el actor discriminado, validado con `zod`. Los productores actuales siguen pasando su usuario, sin cambio de semántica.
- `listEntityAuditLogs` y los tres lectores (`crm`, `catalog` y `knowledge`) con el actor discriminado, y el resumen de auditoría del detalle de cliente mostrando «Servicio · &lt;source&gt;».
- E-1 en `deploy/staging/README.md`.
- FR-AUD-03 (actor de servicio) en FunctionalRequirements. DataModel y SecurityModel actualizados.

**12.1.2**
- `client.resolved` en el contrato v1: esquema estricto, validador, `payload_hash`, vector de prueba y fixtures con forma asumida.
- Caso de uso de resolución en `crm`, llamado por `ingestion` con su transacción. `crm` crea y audita con el actor de servicio. `ingestion` registra el evento, como en la 6.5.2.
- El handler HTTP despacha por `event_type` y responde según D-9. `logEvent` sin teléfono ni nombre.
- FR-API-04 (resolver el cliente por teléfono) en FunctionalRequirements.

## Alcance excluido

- `message.recorded`: ni su forma ni su proyección. Sigue sin crear clientes (eso es la 12.3, si se decide).
- La conversación vigente, la derivación y el cambio de estado por servicio (12.2).
- Cualquier despliegue a staging y cualquier dato no sintético (D-2).
- La tercera superficie y cualquier ADR que enmiende el 0014 (D-1).
- Una columna de origen del cliente (D-8), y cambios en la lista de clientes o en sus filtros.
- La intermitencia de `conversations.spec.ts` caso 2, diagnosticada el 2026-09-25 con la traza del run 36150156775: no entra acá (una subfase por turno).
- Tocar el repositorio del agente, Airtable o cualquier cosa de ERP.

## Archivos o componentes autorizados

Lista cerrada. Tocar otro archivo es un hallazgo bloqueante, salvo ampliación autorizada por el usuario y registrada acá.

**12.1.1**
- `src/modules/audit/`: `schema.ts`, `service.ts`, `repository.ts`, `index.ts` y `service.test.ts`
- `src/modules/crm/service.ts`, `src/modules/catalog/service.ts` y `src/modules/knowledge/service.ts`, solo en la composición del autor
- `src/app/(autenticado)/clientes/[clientId]/audit-summary.ts`, `audit-summary.test.ts` y `page.tsx`, si el tipo lo exige
- las pantallas de auditoría de producto y de información, solo si el tipo del actor obliga a tocarlas; se listan al implementar y se informan
- `drizzle/0021_*.sql` (las dos) y `drizzle/meta/`
- `tests/integration/audit.test.ts`, `tests/integration/crm.test.ts` y `tests/e2e/clients.spec.ts` (un caso: cliente con una fila de servicio insertada por SQL, como fixture sintético)
- `tests/integration/*` que enumeran columnas o tablas de auditoría, si fallan por la columna nueva
- `deploy/staging/README.md`
- `docs/architecture/DataModel.md`, `docs/architecture/SecurityModel.md` y `docs/product/FunctionalRequirements.md`

**12.1.2**
- `src/modules/ingestion/`: `contract.ts`, `contract.test.ts`, `service.ts`, `service.test.ts`, `repository.ts` (si hace falta) e `index.ts`
- `src/modules/crm/`: `service.ts`, `repository.ts`, `index.ts` y sus tests unitarios
- `src/app/api/ingestion/v1/events/handler.ts`
- `tests/fixtures/ingestion/v1/` (fixtures nuevos de `client.resolved`)
- `tests/integration/client-resolution.test.ts` (nuevo) y `tests/integration/ingestion-http.test.ts`
- `docs/contracts/ingestion-v1.md`, `docs/architecture/IntegrationBoundaries.md` y `docs/product/FunctionalRequirements.md`

**Las dos etapas**: este brief, `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md`, al cerrar.

## Fuentes de verdad

- [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) e [IntegrationBoundaries](../architecture/IntegrationBoundaries.md): las dos superficies.
- [ingestion-v1.md](../contracts/ingestion-v1.md) §Versionado: qué cabe en v1.
- [DataModel](../architecture/DataModel.md), tablas `audit_logs`, `clients` e `ingestion_credentials`.
- [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md): `audit_logs` de solo inserción.
- [brief-3.6](brief-3.6-modulo-de-auditoria.md) (D-5), [brief-5.1](brief-5.1-migracion-de-clientes.md) (D-3), [brief-6.5.2](brief-6.5.2-registro-idempotente-y-proyeccion.md) y [brief-6.5.3](brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md).
- [Roadmap](../planning/Roadmap.md) §Fase 12 y la [evaluación 10.1](evaluacion-10.1-mvp.md) §R-3.
- [evidencia-11.4](evidencia-11.4-piloto.md) §AC-6, para E-1.

## Invariantes

- Sin referencias a Airtable ni al repositorio del agente. Ningún nombre de emisor que dispare la guarda de referencias prohibidas.
- `audit_logs` sigue siendo de solo inserción: privilegios de `crm_app` y trigger intactos.
- Toda fila de auditoría tiene exactamente un actor.
- La organización sale de la credencial, nunca del payload.
- Un teléfono pertenece a un solo cliente por organización, activo o no.
- Ni los logs ni las respuestas llevan el teléfono. El nombre del cliente no va a los logs.
- El `viewer` nunca recibe el teléfono completo (H-5), tampoco a través del nombre (D-5).
- Un reenvío nunca produce una segunda escritura.

## Criterios de aceptación

**12.1.1 — Actor de servicio y E-1**

- **AC-1**: la migración `0021` aplica sobre una base con datos. Un `INSERT` sin actor o con los dos responde `23514`. Una credencial inexistente responde `23503`. `UPDATE` y `DELETE` siguen rechazados para `crm_app` y para el dueño.
- **AC-2**: `recordAudit` acepta `{ userId }` o `{ credentialId }` y rechaza lo demás. Los productores existentes no cambian de comportamiento: sus tests pasan sin tocarlos, salvo el tipo.
- **AC-3**: los tres lectores devuelven el actor discriminado. Una fila de servicio se muestra «Servicio · &lt;source&gt;», nunca con un autor vacío. Hay una corrida de mutación: con la rama de servicio quitada, el test falla.
- **AC-4**: el detalle de un cliente, como `admin`, muestra el autor de servicio (end-to-end, con axe en claro y oscuro). Como `viewer` sigue sin ver la auditoría.
- **AC-5**: las tres secciones de E-1 coinciden con los comandos de la evidencia de la 11.4 §AC-6. Las guardas de staging siguen en verde.
- **AC-6**: DataModel, SecurityModel y FunctionalRequirements (FR-AUD-03) actualizados, con la enmienda del brief-3.6 D-5 fechada.

**12.1.2 — `client.resolved`**

- **AC-7**: el contrato documenta `client.resolved` con su tabla de campos, sus reglas, su respuesta (D-9), su vector de prueba y su `payload_hash`. El validador es estricto y rechaza NUL y UTF-16 inválido. Los fixtures nuevos declaran `"shape": "assumed"`.
- **AC-8**: `message.recorded` no cambia: su vector da el mismo hash, sus tests pasan sin tocarlos y un tipo desconocido se sigue rechazando.
- **AC-9**: con un teléfono nuevo, se crea el cliente con el nombre del evento o «Sin nombre», y una fila `create` auditada con el actor de servicio y su diff. Con un cliente existente, activo o inactivo, se devuelve sin escribir nada. Nunca se reactiva ni se renombra. Nunca se usa el teléfono como nombre.
- **AC-10**: un reenvío con el mismo hash responde `duplicate`, sin un segundo cliente ni una segunda fila de auditoría. Con el mismo `event_id` y otro contenido, `CONFLICT`. Dos eventos distintos simultáneos con el mismo teléfono dejan exactamente un cliente y una fila de auditoría: se prueba con requests simultáneos y una corrida sin el `ON CONFLICT`.
- **AC-11**: por HTTP rige la misma cadena que para `message.recorded`: modo de prueba, credencial, alcance `ingest` (`read` da `FORBIDDEN`), allowlist y límite de tasa compartido. La respuesta es la de D-9. El log no lleva el teléfono ni el nombre: `log-surface` en verde y un caso de integración que lo busca en la salida.
- **AC-12**: aislamiento. Un cliente de otra organización con el mismo teléfono no se devuelve, y el nuevo se crea en la organización de la credencial.
- **AC-13**: un `message.recorded` posterior con el mismo teléfono asocia la conversación al cliente resuelto. Es la cadena completa dentro del CRM, en `deterministic`.
- **AC-14**: cada caso nuevo lleva en su nombre el identificador del requisito que prueba (FR-AUD-03 o FR-API-04), según la convención de la evaluación 10.1 §2.

## Pruebas y evidencia requerida

- **Nivel: `deterministic`**, o sea validado localmente y en CI con requests sintéticos. En AC-4, `producer-consumer` para la pantalla.
- **No se certifica** compatibilidad con ningún emisor real: eso es la 12.3.
- Por etapa: `npm run lint`, `npm run typecheck`, formato, `npm run test` (guardas, unitarios e integración), `npm run build` y `npm run test:e2e`, más la CI del commit de la etapa leída por `headSha` y `conclusion`.
- Cada corrida de mutación se registra en este brief con su salida, incluida la que no tenga efecto.

## Condiciones de detención

- Antes de cualquier commit, push, merge o despliegue.
- Antes de ejecutar migraciones contra una base que no sea la local o la de test.
- Antes de instalar cualquier dependencia (no se prevé ninguna).
- Si la interpretación de §Versionado de D-1 no se sostiene al escribir el contrato, o si `client.resolved` exige cambiar algo de `message.recorded`: se detiene y se eleva, no se pasa a v2 por conveniencia.
- Si la clave foránea de D-3 choca con una regla de frontera o con una guarda: se detiene y se pregunta.
- Si hace falta tocar un archivo fuera de la lista.
- Antes de cambiar estados en Notion sin el cierre confirmado por el usuario.

## Resultados — etapa 12.1.1

**Autoevaluación** (`self_assessment: true`), del 2026-09-25. La revisión independiente es la de D-13, al final de la 12.1.2.

### Decisión tomada durante la implementación: cómo se compone el autor de servicio

Al escribir la lectura apareció un choque que el brief no vio.
- D-4 pide «Servicio · &lt;source&gt;», y el `source` vive en `ingestion_credentials`.
- La convención vigente prohíbe el `JOIN` entre módulos.
- Que `crm` importara `ingestion` crearía un ciclo (`ingestion` → `conversations` → `crm`).

Se detuvo el trabajo y se preguntó. **El usuario eligió componerlo en la página**:
- `audit` y los tres lectores devuelven el actor de servicio con su `credentialId`;
- la página le pide el `source` a `ingestion` por su interfaz, con `getCredentialSources`.

Es el mismo hallazgo que el paso 5 de la planificación debía encontrar antes de aprobar: se registra como tal.

### Desvíos respecto del brief

1. **Dos migraciones, no una.**
   - `0021` agrega el `UNIQUE (organization_id, id)` de `ingestion_credentials`.
   - `0022` agrega el actor en `audit_logs`.

   Motivo: la convención de la 6.1. Drizzle Kit emite el `UNIQUE` al final si va en la misma migración que la clave foránea que lo usa, y PostgreSQL la rechaza con `42830`. Se generaron en dos pasos, sin editar SQL a mano. **No hizo falta migración `--custom`**: los privilegios y el trigger de `audit_logs` no cambian.
2. **Clave foránea compuesta** `(organization_id, actor_credential_id)`, no simple. Lo exige la convención de la 4.1, D-3, y la sección 4 de `crm-write-discipline`. D-3 no la especificaba.
3. **Forma de la entrada**: `recordAudit` acepta `actorUserId` o `actorCredentialId`, con una unión de objetos estrictos, en lugar de `{ userId }` o `{ credentialId }`. Los 14 productores existentes no cambian de código.

### Ampliación de la lista de archivos

Todas se desprenden de la decisión del usuario sobre la composición y de la clave foránea compuesta:
- `src/modules/ingestion/schema.ts`, `credentials.ts`, `repository.ts` e `index.ts`: el `UNIQUE` y `getCredentialSources`;
- `src/app/(autenticado)/_audit/actor.ts` y `actor.test.ts`, nuevos: el rótulo del autor, compartido por las tres páginas;
- las páginas y los `audit-summary.test.ts` de productos y de información, que el brief listaba como condicionales, y `tests/integration/product-audit.test.ts` y `knowledge.test.ts`, que construían el actor con la forma anterior.

### Contraste por criterio

| AC | Resultado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `audit.test.ts`, bloque «actor de servicio»: credencial como único actor; sin actor o con los dos, `23514` con el nombre del `CHECK`; credencial inexistente o de otra organización, `23503`; borrar la credencial, `23001`; `UPDATE` de la fila, `P0001`. Las pruebas previas de privilegios y trigger pasan sin cambios. |
| AC-2 | cumplido | `service.test.ts`, caso FR-AUD-03: acepta la credencial y rechaza ninguno, los dos y un id que no es uuid. Los 14 productores siguen igual (typecheck y suite en verde). |
| AC-3 | cumplido | `audit.test.ts` (lectura discriminada) y `crm.test.ts` (fila de servicio sin nombre de usuario), más `actor.test.ts` («Servicio · emisor», «Servicio» sin emisor, nunca vacío). **Mutación**: con la rama de servicio de `nameAuditActors` convertida en usuario, el caso de `crm.test.ts` falla (1 fallado, salida 1). Restaurada. |
| AC-4 | cumplido | `clients.spec.ts` caso 16: el `admin` ve «Servicio · emisor-e2e» y «Alta», con axe en claro y oscuro; el `viewer` no recibe el emisor. 16 de 16. **Sin corrida de mutación del end-to-end**: la rama la fijan AC-3 y `actor.test.ts`. |
| AC-5 | cumplido, con una salvedad | Las tres secciones usan la forma de la evidencia de la 11.4 (§AC-6, líneas 100, 114 y 293). **El `revoke` no está literal en la evidencia**: solo su salida. La línea aplica la forma probada con `create`, y el README lo dice. Guardas de staging en verde. |
| AC-6 | cumplido | DataModel (columna, `CHECK`, clave compuesta y enmienda del brief-3.6 D-5, con fecha), SecurityModel y FR-AUD-03 en FunctionalRequirements. |

**Mutación adicional**, de la clave foránea compuesta. En una transacción revertida sobre la base de desarrollo, se reemplazó por una simple hacia `ingestion_credentials(id)`: una credencial de la organización B firmó una fila de la A («MUTACION: credencial ajena aceptada con FK simple»). Después del `rollback`, las tres restricciones siguen en su lugar.

### Verificación de la etapa

- `lint`, `typecheck` y `format:check`: 0.
- `npm run test`: **1181 de 1181 en 91 archivos**.
- `npm run build`: 0.
- `npm run test:e2e`: **98 de 98**.
- **Una corrida de guardas dio 1 falla que no se capturó**: la salida se filtró con `Select-String` y se perdió el nombre del caso, justo lo que el HANDOFF §7 advierte. Las tres corridas siguientes dieron 296 de 296. Queda como falla no identificada. Que sea la intermitencia de `module-boundary` es una hipótesis.

**Nivel**: validado localmente (`deterministic`), y `producer-consumer` para la pantalla 7. Falta la CI del commit de la etapa.
