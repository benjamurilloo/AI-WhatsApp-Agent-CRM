---
schema: task-brief.v1
task_id: 9.0.4
task_type: hardening
title: Aislamiento por organización en la escritura de ingestion
phase: 9
depends_on: [9.0.1]
evidence_level: deterministic
status: aprobado e implementado; validado localmente
---

# 9.0.4 — Aislamiento por organización en la escritura de `ingestion`

## Objetivo

Que `ingestion.finishEvent` incluya `organization_id` en su `where`, con la misma forma que las siete escrituras corregidas en la 9.0.1, y que quede cubierta por el mismo test de integración. Cierra la única función de esa clase que la 9.0.1 no vio y que el usuario decidió corregir.

## Por qué existe esta subfase

La revisión independiente de la 9.0.1 encontró dos escrituras más de la clase de H-7 que esa subfase no había mirado. No las corrigió por analogía: la condición de detención 3 del [brief-9.0.1](brief-9.0.1-aislamiento-por-organizacion.md) manda registrar y elevar la decisión de alcance. El usuario la tomó el 2026-09-21: `ingestion_events` cuenta como datos de negocio, así que `finishEvent` entra acá, y `revokeCredential` queda diferida con su condición de reapertura escrita en [Risks](../planning/Risks.md).

Que la descomposición de la Fase 9 se corrija por un hallazgo posterior al cierre de la 9.0.1 es el resultado esperado de haber corrido la revisión dentro del ciclo. Lo que no sería aceptable es corregirla sin decirlo.

## Hallazgos de verificación (leídos en el código, 2026-09-21)

1. `finishEvent(tx, eventId, outcome)` actualiza `status`, `error_code` y `processed_at` de `ingestion_events` filtrando **solo por `id`** ([repository.ts:68-81](../../src/modules/ingestion/repository.ts#L68-L81)). La tabla tiene `organization_id`.
2. Tiene **dos llamadores**, los dos en [service.ts:123](../../src/modules/ingestion/service.ts#L123) y [service.ts:129](../../src/modules/ingestion/service.ts#L129), dentro de la misma transacción.
3. **El id no viene de una lectura: lo crea esta misma transacción.** `reserveEvent` hace `insert ... returning id` con `organization_id` ([repository.ts:30-43](../../src/modules/ingestion/repository.ts#L30-L43)). Es una diferencia con las siete de la 9.0.1, donde el llamador **leía** la fila ya filtrada por organización. Acá la fila es nueva y el `insert` mantiene su bloqueo hasta el final de la transacción.
4. Por eso el defecto es **inalcanzable hoy** con más margen que H-7: no hay forma de que el id apunte a una fila de otra organización, porque la fila no existía antes de esta transacción.
5. `context.organizationId` ya está disponible en el servicio, en el mismo alcance que las dos llamadas. El cambio no agrega dependencias ni cruza módulos.
6. `revokeCredential` **no entra**: su id lo provee un operador desde `scripts/ingestion-credential.ts`, que ya exige acceso a la base. El filtro no defendería de nadie que no haya pasado esa puerta.

## Alcance incluido

- `finishEvent` recibe `organizationId` y lo incluye en el `where`.
- Verifica el `returning` y lanza dentro de la transacción si no actualizó ninguna fila, con la justificación del hallazgo 3 escrita en el código.
- Los dos llamadores pasan `context.organizationId`.
- Un caso nuevo en `tests/integration/organization-isolation.test.ts`, con corrida de mutación que lo hace fallar.
- Actualización de `Risks.md`, `SecurityModel.md`, `NonFunctionalRequirements.md` y `Roadmap.md` al estado real.

## Alcance excluido

- **`revokeCredential`.** Diferida por decisión del usuario, con condición de reapertura registrada. No se toca ni "de paso".
- **RLS.** Sigue siendo lo único estructural y sigue sin decidirse. No se abre acá.
- Cualquier otra función de `ingestion`, el contrato de ingestión, el rate limit y el endpoint HTTP.
- Reescribir el invariante de `ingestion_events` en `DataModel.md`: ese documento ya dice lo correcto (admite `UPDATE` de estado); el que estaba mal escrito era el brief de la 9.0.1, y ya quedó anotado ahí.

## Lista cerrada de archivos

| Archivo | Qué cambia |
| --- | --- |
| `src/modules/ingestion/repository.ts` | firma y `where` de `finishEvent`, más el chequeo del `returning` |
| `src/modules/ingestion/service.ts` | los dos llamadores pasan la organización |
| `tests/integration/organization-isolation.test.ts` | un caso nuevo |
| `docs/planning/Risks.md` | cierra la fila de las dos escrituras, dejando abierta solo `revokeCredential` |
| `docs/architecture/SecurityModel.md` | el alcance de la afirmación sobre escrituras |
| `docs/product/NonFunctionalRequirements.md` | de "se corrige en la 9.0.4" a corregido |
| `docs/planning/Roadmap.md` | estado de la 9.0.4 |
| este brief | resultado y desvíos |

Tocar algo fuera de esta lista exige autorización en el turno.

## Decisiones

- **D-1 — El `throw` va dentro de la transacción, igual que en la 9.0.1, pero con otra justificación.** En la 9.0.1 el argumento era que el llamador ya había leído la fila con `FOR UPDATE`. Acá es más fuerte: la fila la creó esta transacción. Cero filas actualizadas no puede ser una carrera. La justificación se escribe en el código, porque copiar el comentario de la 9.0.1 sería propagar una afirmación que no aplica —y una afirmación de esa clase, copiada sin verificar, es exactamente uno de los defectos que la revisión de la 9.0.1 encontró.
- **D-2 — El parámetro se agrega como tercer argumento posicional, después de `tx`**, igual que las siete de la 9.0.1, para que la forma sea reconocible de un vistazo. No se introduce un objeto de opciones.
- **D-3 — El caso de test inserta la fila por SQL, no por `reserveEvent`.** El test necesita una fila de la organización B y una llamada desde la organización A; pasar por `reserveEvent` obligaría a montar el contexto de ingestión completo sin agregar evidencia sobre el `where`. El fixture se declara sintético, como el resto del archivo.

## Invariantes que no se rompen

- `ingestion_events` admite `UPDATE` de su estado; no admite borrado ni cambio de identidad ([DataModel](../architecture/DataModel.md)).
- El endpoint de ingestión no cambia de contrato, ni de códigos, ni de conducta observable.
- Ningún módulo gana una dependencia nueva.

## Criterios de aceptación

- **AC-1** — `finishEvent` incluye el filtro por `organizationId` en su `where`, además del `id`.
- **AC-2** — `finishEvent` lanza si el `returning` viene vacío, dentro de la transacción, y el comentario justifica el caso con el `insert` de `reserveEvent`, no con `FOR UPDATE`.
- **AC-3** — Los dos llamadores pasan `context.organizationId`; ninguno pasa un valor derivado de la entrada sin validar.
- **AC-4** — Un caso de `organization-isolation.test.ts` prueba que `finishEvent` desde otra organización **no modifica la fila** y lanza. La aserción sobre el estado de la base se evalúa **antes** que la del mensaje, y la transacción se deja confirmar, como quedó el resto del archivo tras la revisión de la 9.0.1.
- **AC-5** — Corrida de mutación: quitando el filtro de organización, el caso nuevo falla por la aserción de estado, no solo por el mensaje. Se registra la salida textual.
- **AC-6** — 781 tests (302 unitarios, 79 guardas, 400 de integración) y 81 end-to-end, con typecheck, lint y formato limpios. Las cifras se miden, no se estiman: en este linaje ya hubo cuatro recuentos mal registrados.
- **AC-7** — Ningún documento queda afirmando en presente algo que esta entrega volvió falso.

Nivel de evidencia: `deterministic`. No sube a `producer-consumer`: el camino de ingestión real no ejercita el defecto, precisamente porque el defecto es inalcanzable.

## Condiciones de detención

1. No hay commit, push ni despliegue sin autorización explícita en el turno.
2. Si aparece una escritura más de esta clase en cualquier módulo, se **registra** en `Risks.md` y se eleva. No se corrige por analogía, ni siquiera si el cambio parece de una línea. Es la tercera vez que esta condición hace falta en este linaje.
3. Si el cambio obliga a tocar un archivo fuera de la lista cerrada, se detiene y se pide autorización.
4. Si `context.organizationId` no está disponible en alguno de los dos llamadores, se detiene: significaría que el hallazgo 5 era falso.
5. Si el test nuevo pasa sin la corrección, se detiene y se revisa el test, no el código.

## Resultado (2026-09-21)

Implementada según el brief, sin desvíos de alcance. `revokeCredential` no se tocó.

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| AC-1 | cumplido | `finishEvent` filtra por `organizationId` y por `id` en `src/modules/ingestion/repository.ts` |
| AC-2 | cumplido | lanza si el `returning` viene vacío; el comentario justifica con el `insert` de `reserveEvent`, no con `FOR UPDATE` |
| AC-3 | cumplido | los dos llamadores pasan `context.organizationId` |
| AC-4 | cumplido | caso `finishEvent` en `tests/integration/organization-isolation.test.ts`, con las tres aserciones de estado antes que la del mensaje y la transacción confirmando |
| AC-5 | cumplido | mutación (filtro quitado): `AssertionError: expected 'failed' to be 'received'` — falla por el estado de la fila, no por el mensaje |
| AC-6 | cumplido | 781 tests (302 unitarios, 79 guardas, 400 de integración) y 81 end-to-end; typecheck, lint y formato limpios |
| AC-7 | cumplido | `Risks.md`, `SecurityModel.md`, `NonFunctionalRequirements.md` y `Roadmap.md` actualizados. `CHANGELOG.md` **no** hacía falta: sus cifras viven dentro de entradas fechadas, que es como se lee un registro histórico |

### Lo que la verificación destapó y no es de esta subfase

1. **Un worker de Vitest murió una vez** con código 3221226505 corriendo `tests/integration/db-connectivity.test.ts`, sin marcar ningún test como fallado. No se reprodujo en tres corridas del archivo ni en tres de la suite completa. Importa porque ese archivo prueba justamente que el proceso **no** se cae cuando la base corta una conexión. Registrado en `HANDOFF.md`, **sin subfase asignada**: no se corrige acá.
2. **Dos corridas con fallas que fueron mías, no del repositorio.** Una suite completa dio 4 fallas en `auth-service.test.ts` con `Connection terminated unexpectedly` porque lancé un build en paralelo y esos tests hashean contraseñas. Dos corridas end-to-end se cortaron con `ERR_CONNECTION_REFUSED` tras 66 y 31 casos, con el contenedor de Postgres arriba más de dos horas y conexiones acumuladas; reiniciado el contenedor y sin nada más corriendo, dieron 81 de 81. Queda escrito para no leer esas corridas como intermitencia del código.
