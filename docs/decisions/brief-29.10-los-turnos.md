---
schema: task-brief.v1
task_id: "29.10"
task_type: implementation
generated_at: 2026-10-26
---

# Brief 29.10 — Los turnos

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Módulo nuevo, migración, pantallas, pruebas y despliegue.
- **Nivel de evidencia objetivo**: `deterministic` (tests contra PostgreSQL) y `producer-consumer` (pantallas ↔ servicio ↔ base, con end-to-end).
- **Estado**: **aprobado por el usuario el 2026-10-26**, con la opción (a) en U-1 a U-6. **Cerrado el 2026-10-26** (§Cierre).
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md): U-1 (los turnos entran), punto 12 (los turnos), punto 13 (el perfil y sus valores), punto 14 (roles), punto 15 (el agente) y punto 16 (`appointments` y sus dependencias);
  - [brief-17.4](brief-17.4-informacion-del-negocio-estructurada.md): `business_hours`, sus excepciones y la lectura de servicio;
  - [ingestion-v2](../contracts/ingestion-v2.md) §Pedidos y [brief-19.4](brief-19.4-el-pedido-del-agente.md): el pendiente que una persona confirma, el modelo del turno pedido;
  - [DataModel](../architecture/DataModel.md) (nota de la Fase 29), [Overview](../architecture/Overview.md) y el [runbook de datos de un cliente](../runbooks/datos-de-un-cliente.md).

## Objetivo

Que un negocio con la capacidad `appointments` lleve una agenda de turnos para visitar el local: un calendario por día y por semana sobre el horario del local, con franjas de la duración de la organización y un cupo por franja, y turnos de sus clientes que una persona carga, confirma, cancela y marca como atendidos o ausentes.

## Hallazgos (verificados contra el código en `86bb7bb`, 2026-10-26)

- **H-1. El horario existe y alcanza, pero su lectura no.** `business_hours` guarda hasta dos tramos por día de la semana, y `business_hour_exceptions` reemplaza un día por fecha (17.4). `getBusinessHoursForService` (`knowledge/hours-service.ts:433`) devuelve solo hoy y los seis días siguientes. Un calendario necesita cualquier fecha: hace falta una lectura nueva en `knowledge`, por rango de fechas, con la excepción aplicada.
- **H-2. «iPhone Demo» no tiene horario.** En producción, solo leyendo: 0 filas en `business_hours` y en sus excepciones. Sin horario no hay franjas. El recorrido exige que el usuario lo cargue antes, desde la pantalla de la 17.4.
- **H-3. `appointments` no es todavía una capacidad.** El enum `capability` tiene `variants`, `serialized_units`, `repairs` y `trade_ins` (`organizations/schema.ts:80`), y el perfil `iphone` no la lista (`profiles/iphone.ts:26`). Agregarla es `ALTER TYPE … ADD VALUE` en la misma migración que la usa: la trampa del enum de la 21.4, que se resuelve con `::text` y el test «hasta N-1, confirmar, N sola».
- **H-4. El cupo no lo puede exigir un `CHECK`.** Cuántos turnos se superponen en una franja depende de otras filas. Lo exige el servicio, con un bloqueo por organización, y se prueba con dos escritores y el bloqueo sostenido desde una tercera conexión.
- **H-5. El agente es otro trabajo.** Pedir un turno es un `event_type` nuevo en `ingestion-v2` (compatible dentro de v2) y leer las franjas libres, una ruta nueva de `read-v3`. Las dos exigen una ventana con el agente, como la 29.8, la 29.8.2 y la 29.8.3, que se dividieron por eso.
- **H-6. El borrado de un cliente se rompería.** Las claves al cliente son `RESTRICT` (runbook de datos de un cliente, que ya anuncia `appointments`). `scripts/client-data-delete.ts` y `client-data-export.ts` cuentan y borran tabla por tabla: sin sumar `appointments`, borrar un cliente con turnos fallaría.
- **H-7. Una franja depende de valores que cambian.** El horario, la duración y el cupo los puede cambiar un `admin` con turnos ya dados. Un turno guarda su inicio y su fin, no un número de franja, y la ocupación se calcula por superposición.
- **H-8. Ningún módulo lee hoy de `knowledge`.** La única lectura del horario fuera de su módulo es la API de lectura (`getBusinessHoursForService`). `appointments` sería el primer módulo de dominio que lo importa: la arista está en el ADR 0024, punto 16, y el Overview (tabla de módulos, fila de `knowledge`) la tiene que sumar. Además, el Overview prohíbe el `JOIN` contra tablas ajenas: el nombre del cliente y del motivo en el calendario se componen en memoria, por ids, como la lista de miembros.

## Decisiones del usuario

- **U-1. La división** (H-5).
  - (a) **Recomendada**: la 29.10, los turnos en la app; la **29.10.2**, el agente (las franjas libres en `read-v3`, el turno pedido en `ingestion-v2`, y su ventana). El estado `requested` y la confirmación nacen en la 29.10, listos para el agente.
  - (b) Todo junto, con la ventana del agente antes del cierre.
- **U-2. La duración de una franja.**
  - (a) **Recomendada**: una de 15, 20, 30, 45, 60, 90 o 120 minutos, elegida por el `admin`; la de ejemplo, 30.
  - (b) Solo 30 o 60, como dice el ADR «por ejemplo».
- **U-3. Los valores del perfil `iphone`**: duración 30, cupo 1 y los motivos «Ver o comprar un equipo», «Entregar un usado», «Reparación o diagnóstico», «Retirar un equipo» y «Otro». Son supuestos del negocio: los responde el usuario.
  - (a) **Recomendada**: estos.
  - (b) Otros, que dicta el usuario.
- **U-4. El cliente del turno.**
  - (a) **Recomendada**: obligatorio y existente, elegido como en una venta. Si no existe, se crea antes desde Clientes.
  - (b) Opcional, con un nombre y un teléfono sueltos en el turno.
- **U-5. Los turnos ya dados cuando cambia el horario, la duración o el cupo** (H-7).
  - (a) **Recomendada**: no se mueven ni se cancelan solos. El calendario los muestra con la marca «fuera de horario» o «sobre el cupo», y una persona decide.
  - (b) Un cambio que deja turnos fuera se rechaza hasta cancelarlos.
- **U-6. Hasta cuándo se puede dar un turno.**
  - (a) **Recomendada**: nunca en una franja que ya empezó, y hasta 90 días adelante. El horizonte del agente lo decide la 29.10.2.
  - (b) Sin límite hacia adelante.

  *Nota del 2026-10-26, por la 29.10.2* ([brief-29.10.2](brief-29.10.2-los-turnos-para-el-agente.md), U-2): el horizonte del agente es **14 días**, y nunca una franja que empiece en menos de **2 horas**. La app sigue con los 90 días.

## Decisiones

*Con las opciones (a), aprobadas por el usuario el 2026-10-26.*

### D-1 — La capacidad y el módulo

- **`appointments`** como valor nuevo de `capability` y como módulo de dominio nuevo, en `eslint.config.mjs`, el Overview y su guarda de dependencias.
- `appointments` depende de `crm` (el cliente), `knowledge` (el horario), `catalog` e `inventory` (la referencia opcional), `organizations` y `audit` (ADR 0024, punto 16). **Ningún módulo depende de `appointments`.** La única arista hacia `knowledge` es la lectura nueva de H-1 (H-8). Los nombres de clientes, productos y unidades se piden por ids a su módulo y se componen en memoria, sin `JOIN`.
- **`org:capability --profile iphone`** la activa y copia los valores de U-3, con `is_example`, también en una organización que ya tiene las otras capacidades.

*Nota del 2026-10-26, por la 29.10.2* ([brief-29.10.2](brief-29.10.2-los-turnos-para-el-agente.md), U-1, decisión del usuario): «ningún módulo depende de `appointments`» tiene una excepción, **`ingestion`**, con dos nombres (`requestAppointmentFromIngestion` y `findAppointmentRequestedByIngestion`), como depende de `orders` desde la 19.4. `appointments/schema.ts` suma el esquema de `ingestion` para las claves de la credencial y el evento. La guarda `appointments-dependencies` lo fija por nombre.

### D-2 — Las tablas (migración `0065`)

- **`appointment_settings`**: una fila por organización, con la duración (U-2), el cupo (de 1 a 20) e `is_example`, como `service_settings`.
- **`appointment_reasons`**: por organización, con el nombre (único sin distinguir mayúsculas), el orden y si está activo. No se borran: se desactivan.
- **`appointments`**, por organización:
  - el cliente y el motivo, con FK compuestas a la organización;
  - `starts_at` y `ends_at` (`timestamptz`), con `ends_at > starts_at`;
  - una referencia opcional a un producto **o** a una unidad, nunca las dos (FK compuestas);
  - una nota opcional, de hasta 500 caracteres;
  - el estado (`requested`, `confirmed`, `cancelled`, `attended`, `no_show`), con la fecha de cada paso y un `CHECK` que la ata a su estado;
  - el autor (`created_by`). El origen del agente lo agrega la 29.10.2;
  - un índice por organización e inicio.
- **Un trigger** fija las transiciones y las columnas que cambia cada una, como en `service_orders`: `requested → confirmed | cancelled`, `confirmed → attended | no_show | cancelled`. `attended` y `no_show` son finales y exigen que el turno haya empezado. Ningún otro campo cambia después del alta.
- Los valores nuevos del enum se comparan con `::text` (H-3).

### D-3 — Las franjas

- **Una función pura** arma las franjas de una fecha: desde la apertura de cada tramo, cada `duración` minutos, mientras la franja termine antes del cierre. El día se toma con su excepción, en la zona de la organización.
- **La ocupación** de una franja es la cantidad de turnos `requested` o `confirmed` que se le superponen. Libre si es menor que el cupo.
- **Un turno nuevo** tiene que empezar y terminar en una franja de la grilla vigente, con lugar, que no haya empezado y dentro del horizonte (U-6). Si no, se rechaza con su motivo: `outside_hours`, `slot_full`, `in_the_past` o `too_far`.
- **El cupo se exige bajo un bloqueo** de la fila de `appointment_settings` de la organización (`FOR UPDATE`), dentro de la transacción del alta (H-4).

### D-4 — Quién hace qué

- **Un `admin`** carga un turno (nace `confirmed`), confirma uno `requested`, lo cancela, lo marca atendido o ausente, y cambia la duración, el cupo y los motivos. Cada cambio, auditado.
- **Un `viewer`** ve el calendario, los turnos y su historia. Las acciones lo rechazan en el servidor.
- **Sin la capacidad**, ninguna pantalla ni acción de turnos existe para esa organización.

### D-5 — Las pantallas

- **Turnos** (`/turnos`), en el menú solo con la capacidad: el calendario por día y por semana, con cada franja libre, ocupada o con lugar (`n de cupo`), y los turnos del día con su cliente, motivo y estado. Las marcas de U-5.
- **Nuevo turno**: el cliente, el motivo, la fecha, la franja libre, la referencia opcional y la nota.
- **El turno**: sus datos, las acciones que le corresponden y su historia.
- **Configuración**: la duración, el cupo y los motivos.
- **La ficha del cliente**: sus turnos próximos y pasados.

*Nota del 2026-10-26, por el usuario*: la revisión independiente (N-10) señaló que la implementación suma un acceso que D-5 no lista, **«Dar un turno» desde cada unidad disponible de un producto**, con la unidad como referencia (FR-TUR-04). El usuario decidió dejarlo.

### D-6 — Datos de un cliente

`client-data-export.ts` y `client-data-delete.ts` suman `appointments` (H-6), y el runbook lo dice. ~~Borrar un cliente borra sus turnos, con la auditoría como en las demás tablas.~~

*Corregido por el usuario el 2026-10-26, antes de implementar*: esa frase contradecía la regla vigente de que borrar es vaciar y conservar la forma ([brief-13.4](brief-13.4-retencion-y-borrado.md), D-2). **Los turnos se tratan como las órdenes de servicio**: quedan y retienen la ficha (`RESTRICT`), así que un cliente con turnos no se borra, se vacía. El vaciado deja la nota del turno en nulo, porque es texto libre que puede nombrar a la persona; el trigger deja pasar ese cambio y ningún otro sin cambio de estado. Quedan el cliente vaciado, el motivo, las fechas y el estado.

### D-7 — Pruebas

- **Unitarias**: la función de las franjas (dos tramos, una excepción cerrada, un tramo que no alcanza para una franja, cambio de horario de verano) y las transiciones.
  *Nota del 2026-10-26, al implementar*: la función de las franjas no tiene zona (es hora local), así que el cambio de horario de verano se prueba en la integración, donde PostgreSQL convierte la hora: la zona de la organización (Tokio), el mismo horario local antes y después del cambio de Nueva York, y la hora que falta (Nueva York y Santiago), que el alta rechaza como fuera de horario. Lo encontró la revisión independiente (B-1).
- **Integración**:
  - el alta con cada rechazo de D-3 y su motivo;
  - el cupo con dos escritores, con el bloqueo sostenido desde una tercera conexión;
  - el trigger y los `CHECK` sin pasar por el servicio, con el nombre exacto de cada restricción;
  - U-5: los turnos que quedan fuera después de un cambio;
  - roles, capacidad, aislamiento entre organizaciones y la auditoría;
  - el vaciado y la exportación de un cliente con turnos;
  - `org:capability` con el perfil.
- **`migration-0065.test.ts`**: hasta la `0064` con datos, confirmar, la `0065` sola.
- **Guardas**: `capability-reads`, `exposed-surface`, la de dependencias de `appointments`.
- **End-to-end**: el recorrido de un `admin` (configurar, dar un turno, ver la franja llena, confirmar uno pedido, marcarlo atendido) y el de un `viewer`.

### D-8 — Revisión, despliegue y cierre

- **Revisión independiente** antes del despliegue: un módulo nuevo, una migración con un enum ampliado y una regla de cupo con bloqueo.
- **Despliegue** con el runbook y la `0065`, con la autorización del usuario. Después, `org:capability --profile iphone` en «iPhone Demo», que corre el usuario o yo con su autorización.
- **El recorrido**: el usuario carga el horario de «iPhone Demo» (H-2), da turnos hasta llenar una franja, cancela uno, confirma y marca atendido otro.

## Alcance incluido

- La migración `0065`: el valor de la capacidad, las tres tablas, las restricciones y el trigger.
- El módulo `appointments`, con la lectura nueva del horario en `knowledge`.
- Las pantallas de D-5 y la entrada del menú.
- `org:capability` con los valores del perfil.
- Los scripts y el runbook de datos de un cliente.
- DataModel, Overview, SecurityModel (la superficie), ADR 0024 (nota fechada en el punto 12 con U-1 a U-6) y Roadmap.

## Alcance excluido

- **Todo lo del agente** (U-1 (a)): `read-v3`, `ingestion-v2` y la ventana. Es la 29.10.2.
- Reprogramar un turno: se cancela y se da otro.
- Recordatorios o avisos (ADR 0024, punto 12; Scope).
- Turnos por empleado, por sala o con recursos.
- Turnos de varias franjas seguidas.
- Métricas de turnos o de ausencias.
- Que un turno cree una venta, una orden de servicio o una recepción.

## Invariantes

- **Ningún turno tiene un estado o una fecha incoherente**, aunque se salte el servicio.
- **Un turno nuevo nunca supera el cupo** de su franja en el momento del alta, aun con altas simultáneas.
- **Nada existente cambia**: ninguna tabla de antes, salvo el enum de capacidades.
- **El horario sigue siendo de `knowledge`**: `appointments` lo lee, nunca lo escribe.
- **Ningún contrato del agente cambia.**
- **Cada lectura y cada FK filtran por organización.**

## Criterios de aceptación

- **AC-1**: la `0065` crea la capacidad, las tablas, las restricciones y el trigger, y aplicada sola sobre la `0064` no cambia ninguna fila existente.
- **AC-2**: las franjas de una fecha salen del horario de ese día, con su excepción, en la zona de la organización, con la duración vigente.
- **AC-3**: un `admin` da un turno en una franja libre, y se rechaza fuera de horario, en una franja llena, en una que ya empezó y más allá del horizonte, cada uno con su motivo.
- **AC-4**: dos altas simultáneas en la última plaza de una franja dejan un solo turno.
- **AC-5**: las transiciones de D-2 y ninguna otra; la base lo exige aunque se salte el servicio.
- **AC-6**: un cambio de horario, duración o cupo no mueve ni cancela turnos, y el calendario los marca (U-5).
- **AC-7**: `org:capability --profile iphone` activa `appointments` y copia los valores de U-3, de ejemplo y auditados.
- **AC-8**: las pantallas de D-5; un `viewer` las ve y las acciones lo rechazan en el servidor; sin la capacidad, no existen.
- **AC-9**: ninguna FK ni lectura cruza organizaciones.
- **AC-10**: vaciar y exportar un cliente con turnos funciona (el vaciado deja la nota en nulo, y un cliente con turnos no se borra: D-6, corregido), y el runbook lo dice.
- **AC-11**: `appointments` solo depende de los módulos de D-1, y ninguno depende de él; la guarda lo vigila.
- **AC-12**: las guardas, las unitarias, la integración entera y el end-to-end pasan en la CI.
- **AC-13**: revisión independiente antes del despliegue, con sus hallazgos verificados y resueltos.
- **AC-14**: desplegada, con la capacidad activada en «iPhone Demo» y recorrida por el usuario.

## Pruebas y evidencia requerida

- Los tests de D-7 y una CI en `success` sobre el SHA que se despliega.
- La integración entera en local antes del push.
- Los recuentos de producción antes y después, solo leyendo.
- El recorrido del usuario.

## Condiciones de detención

- Si `appointments` necesita escribir el horario, o cualquier arista fuera de D-1.
- Si el cupo no se puede exigir sin bloquear más que la organización.
- Si la migración obliga a tocar filas existentes.
- Cualquier cambio en un contrato del agente.
- Si un turno tuviera que crear una venta, una orden o un cobro.

## Cierre

*Del 2026-10-26, después del despliegue y del recorrido del usuario, que lo aprobó sin observaciones.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `migration-0065.test.ts`: la `0064` confirmada con datos, la `0065` sola, las filas iguales; en producción, 66 migraciones, las tres tablas, el trigger y la capacidad |
| AC-2 | cumple | `appointments.test.ts`: las franjas de cada fecha con su excepción; la zona de la organización (Tokio) y el mismo horario local a los dos lados del cambio de Nueva York, que antes no tenían prueba (revisión independiente, B-1). Sabotear la zona hace fallar los dos tests |
| AC-3 | cumple | `appointments.test.ts`: cada rechazo con su motivo; la hora que falta del horario de verano se rechaza como fuera de horario (`slotExists`, B-1) |
| AC-4 | cumple | `appointments.test.ts`: dos altas a la vez y el bloqueo sostenido desde una tercera conexión; sin el `FOR UPDATE` el test falla |
| AC-5 | cumple | `appointments.test.ts`: las transiciones por el servicio, y en la base `confirmed -> requested`, `cancelled -> confirmed`, `attended -> cancelled` y `requested -> attended` sin pasar por él (N-5) |
| AC-6 | cumple | `appointments.test.ts`: un cambio de cupo, horario o duración no mueve ningún turno y el calendario los marca |
| AC-7 | cumple | `variants.test.ts` lee la salida de `org:capability` (N-6); en producción, «iPhone Demo» con 30 minutos, 1 por franja, de ejemplo, y los cinco motivos, auditados |
| AC-8 | cumple | `appointments.spec.ts` (el `admin`, con confirmar uno pedido, B-2, y el `viewer`); `appointments.test.ts`: sin la capacidad, lecturas y escrituras dan `NOT_FOUND` (N-7); el recorrido del usuario |
| AC-9 | cumple | las FK compuestas de la `0065`; `appointments.test.ts`, el aislamiento entre organizaciones |
| AC-10 | cumple | `appointments.test.ts` y `client-data.test.ts`; el runbook, con sus filas en las tablas de exportar y vaciar (N-2) |
| AC-11 | cumple | `appointments-dependencies`: desde la revisión (N-1), de `knowledge` solo admite `getEffectiveBusinessDays`; volver a importar `getBusinessHoursForService` la hace fallar |
| AC-12 | cumple | CI de `c667765` (run 40395689186, `success`): guardas 891, unitarias 1156, integración 1809, e2e 298 |
| AC-13 | cumple | revisión independiente: dos bloqueantes (B-1, B-2) y once no bloqueantes, verificados contra el código; corregidos B-1, B-2 y N-1 a N-7; N-10 lo decidió el usuario (se queda); N-11 no era un hallazgo |
| AC-14 | cumple | desplegada en `c667765` con la `0065`; la capacidad activada en «iPhone Demo» con autorización del usuario; el recorrido del usuario, sin observaciones |

### Lo que queda abierto, a sabiendas

- **N-3**: el horario se lee antes de la transacción del alta; un cambio de horario en ese instante puede dejar un turno fuera de horario, que el calendario marca (U-5).
- **N-8**: la base fija qué fecha cambia en cada transición, no su valor.
- **N-9**: `NEW.status = OLD.status` sin `::text`, inocuo porque el enum nace en la misma migración.
- El calendario puede mostrar libre una franja de la hora que falta del horario de verano, que el alta rechaza; solo en un local abierto a esa hora.
- Las correcciones de la revisión son autoevaluación: no hubo una segunda revisión independiente.
