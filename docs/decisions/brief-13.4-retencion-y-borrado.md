---
schema: task-brief.v1
task_id: "13.4"
task_type: design
generated_at: 2026-09-30
---

# Brief: 13.4 — Retención y borrado de datos reales

**Estado: propuesto el 2026-09-30, sin aprobar.** Nada de este brief se implementa hasta que el usuario lo apruebe. La aprobación no autoriza migrar producción, cambiar la configuración del droplet ni ningún commit: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` para la etapa local (triggers, permisos y scripts contra PostgreSQL real de test, con mutaciones), e `isolated-runtime` para la etapa en el droplet: la migración aplicada en producción y el borrado recorrido de punta a punta en una base aparte, con datos sintéticos, que se borra al terminar.
- **Nivel de validación alcanzable**: el mecanismo de borrado **validado localmente y en el entorno productivo sin datos reales**. No se ejerce contra un pedido real hasta que haya uno.
- **Orden**: cuarta subfase de la Fase 13 ([Roadmap](../planning/Roadmap.md), §Fase 13). **Va antes del primer mensaje real**: la 13.5 no abre sin la 13.4 cerrada.

## Objetivo

Que, antes de que entre el primer dato real, el CRM pueda cumplir un pedido de borrado de los datos de una persona **sin mentir sobre lo que queda**, y que la retención de `messages` sea una decisión tomada y no un «indefinidamente» heredado de cuando no había datos reales.

## Situación en la fase

La 13.1 dejó producción arriba, la 13.2 midió las consultas y la 13.3 dejó la vigilancia. La 13.5 trae el primer negocio real: sus clientes, sus mensajes y sus teléfonos. Hoy, si uno de esos clientes pide que se borren sus datos, el sistema solo puede **minimizar** la ficha. Sus mensajes quedan enteros, con el texto, y la auditoría conserva el teléfono anterior ([runbook de datos de un cliente](../runbooks/datos-de-un-cliente.md), caso B).

### Obligaciones que toma

| Id | Qué pide | De dónde viene |
|---|---|---|
| R-3 | La retención de `messages`: la política «conservar indefinidamente» se reabre antes del primer mensaje real | [evaluación 10.1](evaluacion-10.1-mvp.md), §R-3; [DataModel](../architecture/DataModel.md), §Preguntas abiertas |
| O-11 | El borrado real de los datos de un cliente frente a `audit_logs` de solo inserción | evaluación 10.1, §5; [Risks](../planning/Risks.md), fila del borrado real |
| brief-13.3, alcance excluido | La retención del journal, que guarda identificadores de organización | [brief-13.3](brief-13.3-disponibilidad-y-observabilidad.md) |

## Hallazgos antes de diseñar

Leído el 2026-09-30. Las lecturas del servidor fueron de solo lectura.

- **H-1. La cadena del borrado está cerrada, con cualquier rol.** `messages` tiene el trigger `messages_insert_only`, que rechaza `UPDATE` y `DELETE` sin mirar quién ejecuta (`drizzle/0012_conversations_privileges_and_insert_only.sql`). `messages` → `conversations` → `clients` son `ON DELETE RESTRICT`. `audit_logs` tiene el mismo trigger (`drizzle/0003`) y `diff` es `jsonb not null`.
- **H-2. Contradicción entre documentos.** [DataModel](../architecture/DataModel.md), §Preguntas abiertas, dice que el trigger de `messages` rechaza «para cualquier rol que no sea superusuario». La migración lo rechaza para todo rol, y [Risks](../planning/Risks.md) ya se corrigió el 2026-09-23 contra el código. DataModel quedó con el texto viejo. **Manda la migración**: se corrige DataModel en esta subfase.
- **H-3. Las métricas no leen el texto de los mensajes.** Las métricas 2 a 10 cuentan filas de `messages` por `sent_at` y `direction`, y ninguna lee `body_text` ([MetricsCatalog](../analytics/MetricsCatalog.md)). Borrar filas cambiaría métricas de períodos pasados; vaciar el texto no cambia ninguna.
- **H-4. Los identificadores del agente se arman con el `wamid` de WhatsApp.** En las capturas del emisor real (`tests/fixtures/ingestion/v2/captured-*.json`), `event_id` es `wa-out-wamid-…`, la conversación es `wa-conv-wamid-…` y el mensaje `wa-msg-wamid-…`. Esos van a `ingestion_events.external_ref`, `conversations.external_ref` y `messages.external_ref`. **Según el formato conocido de WhatsApp, un `wamid` real lleva el teléfono del remitente codificado en base64. No lo verifiqué en este proyecto**: las capturas son sintéticas. Si es así, el runbook se equivoca al decir que `ingestion_events` «no tiene datos personales», y la identidad de esa tabla es inmutable por trigger (`ingestion_events_identity_immutable`).
- **H-5. Los backups conservan lo borrado.** En producción: `BACKUP_KEEP=7` copias locales diarias y `OFFSITE_KEEP_DAYS=30` en la copia externa cifrada. Un dato borrado hoy sigue en las copias hasta 30 días. Y restaurar una copia anterior al borrado **lo trae de vuelta**, con el registro del borrado incluido si ese registro vive en la base.
- **H-6. El journal no tiene límite propio.** 33,5 MB, con la configuración por defecto de journald. Guarda `organization_id`, `user_id` y `request_id`; por diseño, ni cuerpos de mensajes ni teléfonos (brief-8.2). nginx rota sus logs a 14 días; las IP que guarda son las del operador, las del servidor del agente y las del monitor, no las de los clientes del negocio.
- **H-7. `login_attempts` guarda hashes de IP sin vencimiento real.** La tabla se limpia **por clave**: `recentFailures` borra lo vencido solo de la clave que vuelve a intentar (`src/modules/auth/repository.ts:188-220`). Una clave que no vuelve queda para siempre. En producción hay 44 filas. Un hash sin sal de una IP es la IP (nota del vault «An Unsalted Hash of an IP Address Is Still the IP Address»). Son datos del operador, no de los clientes del negocio.
- **H-8. El agente tiene su propia copia.** Lo que el CRM borre sigue en el agente y en su n8n. Es del lado del agente (ADR 0014); el CRM solo puede avisar.

## Decisiones requeridas

### D-1 — La retención de `messages` (R-3)

- **(a) Conservar mientras haga falta, con borrado a pedido** (D-2 a D-5). No se fija un horizonte por edad. Se reabre si el negocio lo pide, si el volumen lo exige o si una obligación legal lo impone.
- **(b) Un horizonte por edad**, por ejemplo 24 meses, con un timer que vacía lo más viejo usando el mismo mecanismo de D-3.
- **(c) Seguir como está**, sin borrado a pedido.

**Recomendación: (a).** Lo que no se puede postergar es poder cumplir un pedido de borrado. Un horizonte por edad todavía se decidiría sin datos: el negocio no dijo cuánto historial necesita, y el agente lee el historial para dar contexto. El mecanismo de D-3 hace que agregar un horizonte después sea un timer, no un rediseño. **Este brief no afirma cumplimiento legal**: si el negocio tiene una obligación concreta sobre plazos (por ejemplo, la ley 25.326 de Argentina), la fija el usuario y se agrega como condición.

### D-2 — Qué significa «borrar» para un cliente con conversaciones

- **(a) Borrar las filas**: sus mensajes, sus conversaciones, su auditoría y su ficha. Es la eliminación literal, y cambia las métricas de los períodos pasados (H-3).
- **(b) Vaciar el contenido y conservar la forma**: los mensajes quedan sin texto y sin referencias externas, la auditoría del cliente pierde los valores, y la ficha se minimiza como hoy. Quedan fechas, direcciones y cantidades, sin nada que identifique a la persona.
- **(c) Seguir con la minimización de hoy.**

**Recomendación: (b).** Borra todo lo que identifica a la persona o dice algo de ella, y no reescribe la historia de las métricas. Lo que queda es la forma de la conversación, sin titular. Hay que decírselo así a quien pide el borrado.

### D-3 — Por dónde se vacía, y el ADR 0013

El ADR 0013 levantó la inmutabilidad a propósito, y esta subfase la toca. Hace falta un **ADR nuevo (0015)** que la enmiende con alcance acotado.

- **(a) Un vaciado de una sola dirección, garantizado por el trigger.** El trigger deja pasar un único `UPDATE`: el que lleva el texto y las referencias externas a nulo, con el resto de la fila idéntico. Cualquier otro cambio sigue rechazado, y el `DELETE` también. `crm_app` sigue sin `UPDATE`, así que la aplicación no puede vaciar nada: lo hace el operador con el rol dueño, desde un script. **El invariante nuevo**: un mensaje nunca cambia; solo puede perder su contenido.
- **(b) Desactivar el trigger en una transacción.** Es DDL, toma un bloqueo sobre toda la tabla y deja la tabla sin garantía mientras dura. El runbook de hoy lo prohíbe por eso.
- **(c) Mover el texto a una tabla aparte, borrable.** Cambia todas las lecturas de mensajes y es una migración de datos. Es el diseño correcto solo si el vaciado tuviera que ser masivo.

**Recomendación: (a),** con la misma regla en `audit_logs`: `diff` solo puede pasar a un objeto fijo que marca el vaciado, y nada más de la fila cambia.

### D-4 — Las referencias externas y `ingestion_events` (H-4)

- **(a) Vaciarlas en `messages` y `conversations`, y en `ingestion_events` solo si H-4 se confirma.** La idempotencia de un reenvío no depende de la referencia del mensaje: la primera defensa es `ingestion_events` por `event_id`. Pero si `event_id` también lleva el teléfono, hay que elegir entre la idempotencia de ese evento y el borrado.
- **(b) Pedirle al agente que deje de mandar el `wamid` crudo**, por ejemplo con un hash con sal propio. Es un cambio del contrato del lado del emisor.

**Recomendación: verificar H-4 primero, con un `wamid` real de la cuenta de prueba del agente, sin guardarlo en el repositorio.** Si se confirma, se detiene y se eleva al usuario (condición de detención 3): es una decisión de contrato entre los dos sistemas, no una de esta subfase sola.

### D-5 — Los backups y la restauración (H-5)

- **(a) Aceptar que lo borrado vence con las copias**, a los 30 días como mucho, y decirlo en la respuesta al pedido. **El registro de cada borrado vive fuera de la base**, en el ticket del pedido, igual que hoy. El runbook de restauración suma un paso: después de restaurar, se vuelven a aplicar los borrados posteriores a la fecha de la copia.
- **(b) Rehacer las copias** después de cada borrado. Hay que descifrar, filtrar y volver a cifrar treinta copias externas: es caro y frágil.

**Recomendación: (a).**

### D-6 — La retención de los logs (H-6)

- **(a) El journal a 30 días** (`MaxRetentionSec=30day` y un tope de tamaño), con un archivo versionado en `deploy/production/`. nginx sigue en 14 días.
- **(b) Dejarlo por defecto.**

**Recomendación: (a).** Treinta días alcanzan para diagnosticar y coinciden con la copia externa.

### D-7 — Los hashes de IP vencidos (H-7)

- **(a) Borrar todas las filas vencidas en cada intento**, no solo las de la clave que vuelve. Es un cambio chico en `src/modules/auth/repository.ts`, con su test.
- **(b) Un timer diario** que las borre con el rol dueño.
- **(c) Dejarlo.**

**Recomendación: (a).** Deja el vencimiento donde ya está, en el mismo camino y sin una pieza nueva.

### D-8 — Dónde se valida

- **Etapa 13.4.1, local**: el ADR 0015, las migraciones, los scripts y los tests, con una mutación por regla.
- **Etapa 13.4.2, en el droplet**: la migración aplicada en producción (se autoriza en su turno), la retención del journal, y el vaciado recorrido de punta a punta **en una base aparte en el droplet**, con datos sintéticos, que se borra al terminar, como hizo la 13.2. `crm_production` no recibe datos sintéticos.

### D-9 — Revisión independiente

**Recomendación: sí.** Esta subfase enmienda un ADR que protege un invariante y define qué se le promete a una persona que pide borrar sus datos. Una revisión de solo lectura, contra este brief y el ADR 0015, antes del cierre.

## Escala de severidad, fijada antes de empezar

- **Crítico**: un camino por el que `crm_app` pueda modificar o borrar un mensaje o una entrada de auditoría; un vaciado que deje el teléfono o el texto en alguna tabla sin declararlo; una migración aplicada a producción sin autorización; un dato real o un `wamid` real en el repositorio.
- **Mayor**: una regla del trigger sin su mutación; un documento que prometa un borrado que el sistema no hace; el paso de restauración que no vuelve a aplicar los borrados.
- **Menor**: un recuento que no cierra, un comando no literal, una frase de estado vieja.

## Alcance incluido

**Etapa 13.4.1 — local**

1. ADR 0015, que enmienda el ADR 0013 según D-3.
2. Una migración con los triggers nuevos de `messages` y `audit_logs` (y de `conversations`, si D-4 lo pide), sin cambiar los privilegios de `crm_app`.
3. `scripts/client-data-delete.ts`: una opción de vaciado según D-2, con informe previo que no escribe.
4. Tests de integración: el vaciado permitido, cada cambio no permitido rechazado, `crm_app` rechazado, y una mutación por regla. El test de cobertura de privilegios de `audit.test.ts` sigue verde.
5. Según D-7, el vencimiento global de `login_attempts`, con su test.
6. Según D-6, el archivo de journald en `deploy/production/` y la guarda que lo cubra.
7. Documentos: el runbook de datos de un cliente, el runbook de restauración (el paso de D-5), DataModel (H-2 y las reglas nuevas), NonFunctionalRequirements (§Privacidad y §Retención), SecurityModel si corresponde, Risks.

**Etapa 13.4.2 — en el droplet** (cada paso, en su turno)

8. Verificar H-4 con el agente (D-4), sin guardar el `wamid`.
9. Aplicar la migración en `crm_production`, con los recuentos antes y después iguales.
10. Instalar la retención del journal.
11. Recorrer el vaciado en una base aparte en el droplet, con datos sintéticos, y borrarla.

## Alcance excluido

- Un horizonte de retención por edad (D-1), salvo que el usuario elija (b).
- Una pantalla de borrado. Lo corre un operador, como hoy.
- Borrar en el agente o en su n8n (H-8). El runbook dice que hay que avisarle.
- Cambiar el contrato de ingestión (D-4 b): si hace falta, se detiene.
- Rehacer los backups existentes (D-5 b).
- Cualquier dato real.

## Archivos o componentes autorizados

- `docs/decisions/`: este brief, el ADR 0015, una evidencia nueva y el índice.
- `drizzle/`: una migración nueva, y su registro en el journal de Drizzle.
- `scripts/client-data-delete.ts` y su test.
- `src/modules/auth/repository.ts` (D-7) y sus tests.
- `tests/integration/`: los tests del vaciado y `audit.test.ts` si cambia su lista.
- `deploy/production/`: el archivo de journald y el README; `tests/guards/` para cubrirlo.
- `docs/runbooks/datos-de-un-cliente.md`, `docs/runbooks/restaurar-la-base.md`, `docs/architecture/DataModel.md`, `docs/architecture/SecurityModel.md`, `docs/product/NonFunctionalRequirements.md`, `docs/planning/Risks.md`, `docs/planning/Roadmap.md`, `CHANGELOG.md`, `HANDOFF.md`.
- En el droplet: la migración en `crm_production`, el archivo de journald, y una base aparte que se crea y se borra.

## Invariantes

- **`crm_app` no puede modificar ni borrar un mensaje ni una entrada de auditoría.** Ni antes ni después de esta subfase.
- **Un mensaje nunca cambia de contenido: solo puede perderlo.** Lo mismo para el `diff` de una entrada de auditoría.
- **Ningún dato real, teléfono real ni `wamid` real entra al repositorio ni a la conversación.**
- **Cada efecto sobre el droplet se autoriza en su turno.** `crm_production` termina con los mismos recuentos que antes de la migración.
- **Nada promete más de lo que hace**: lo retenido se declara, con dónde y por cuánto tiempo.

## Criterios de aceptación

**Etapa 13.4.1**

- **AC-1.** El ADR 0015 está escrito y aceptado por el usuario, y el ADR 0013 lo enlaza.
- **AC-2 (D-3).** El vaciado de un mensaje pasa, y todo otro `UPDATE` o `DELETE` de `messages` se rechaza con `P0001`, para cualquier rol. Una mutación por regla, ejecutada.
- **AC-3 (D-3).** Lo mismo para `audit_logs.diff`.
- **AC-4.** `crm_app` no puede vaciar: rechazado por permisos (`42501`). El test de cobertura de privilegios sigue verde sin cambiar la lista de tablas de solo inserción.
- **AC-5 (D-2).** El script informa sin escribir, y vacía un cliente con conversaciones. Después, ninguna tabla contiene su teléfono, su nombre, sus notas ni el texto de sus mensajes. Las métricas de su período dan lo mismo que antes.
- **AC-6 (D-7).** Las filas vencidas de `login_attempts` se borran en cualquier intento, con su mutación.
- **AC-7.** La suite completa y la CI del commit de la etapa en verde, leída por `headSha`.

**Etapa 13.4.2**

- **AC-8 (D-4).** H-4 confirmado o descartado, con el método y sin el `wamid` en ningún archivo.
- **AC-9.** La migración aplicada en producción, con los recuentos de `crm_production` iguales antes y después, y `/login` en `200`.
- **AC-10 (D-6).** El journal con su retención configurada y verificada en el droplet.
- **AC-11 (D-8).** El vaciado recorrido en una base aparte del droplet, y la base borrada.
- **AC-12.** Los runbooks de datos de un cliente y de restauración dicen qué se borra, qué queda, por cuánto tiempo y el paso de volver a aplicar los borrados después de restaurar. NonFunctionalRequirements, DataModel y Risks dicen lo mismo.

**Cierre**

- **AC-13.** Revisión independiente según D-9, con sus hallazgos verificados y resueltos o aceptados por el usuario.

## Pruebas y evidencia requerida

Un archivo `evidencia-13.4-retencion-y-borrado.md` con cada comando y su salida literal. Un bloque transcrito se marca `[transcrito]`. Ningún teléfono, `wamid` ni IP real. Todo lo que verifique el mismo agente que implementa se declara autoevaluación.

## Condiciones de detención

1. D-1 a D-9 sin resolver.
2. El diseño de D-3 necesita dar `UPDATE` a `crm_app`: se detiene y se vuelve a decidir.
3. H-4 se confirma y el borrado choca con la idempotencia de `ingestion_events` o con el contrato: se eleva al usuario, y al agente si hace falta.
4. La migración no se puede aplicar en producción sin bloquear la aplicación más que un despliegue: se mide antes y se decide.
5. Hace falta tocar un archivo fuera de la lista.

## Lo que esta subfase no va a poder demostrar

- **Un borrado real a pedido de una persona real.** No hay datos reales hasta la 13.5.
- **Que lo borrado desaparezca del agente.** Es del agente.
- **Cumplimiento legal.** El brief implementa lo que el usuario decida; no lo certifica.
