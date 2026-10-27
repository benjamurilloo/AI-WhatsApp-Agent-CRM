---
schema: task-brief.v1
task_id: "29.10.2"
task_type: implementation
generated_at: 2026-10-26
---

# Brief 29.10.2 — Los turnos para el agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Una ruta nueva en `read-v3`, un `event_type` nuevo en `ingestion-v2`, la migración `0066`, código, pruebas, despliegue y una ventana con el agente real.
- **Nivel de evidencia objetivo**:
  - `deterministic`, con tests contra PostgreSQL;
  - `producer-consumer` del lado del CRM: contrato ↔ servicio ↔ base, y la app que confirma el turno pedido;
  - **validado en integración con el agente** en una ventana como la de la 29.8, si el agente adopta el contrato (D-9).
- **Estado**: **cerrado el 2026-10-27**, desplegado (`0d3c852`, migración `0066`) y con la ventana del agente conciliada (§Cierre). **Aprobado por el usuario el 2026-10-26, con las recomendaciones: U-1 a U-5 en su opción (a).** Como en la 29.8, la 29.8.2 y la 29.8.3, **no se implementa hasta que el agente confirme por escrito que lo va a usar**, o pida cambios (D-9). La pregunta está en `Pregunta-29.10.2-CRM-al-Agente.md`, en el Escritorio del usuario. **El agente confirmó el mismo día** que las usa, con un agregado y una diferencia de conducta, que el usuario aprobó (A-1 y A-2, §La respuesta del agente).
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md): punto 12 (los turnos y su nota del 2026-10-26), punto 14 (lo que el agente nunca lee), punto 15 (el agente: «los horarios libres y el pedido de un turno»; «escribe solo el pedido pendiente y el turno pedido») y punto 16 (las dependencias);
  - [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md);
  - [brief-29.10](brief-29.10-los-turnos.md): U-1 (a) (la división), U-6 («el horizonte del agente lo decide la 29.10.2»), D-1 a D-3 y §Lo que queda abierto;
  - [brief-19.4](brief-19.4-el-pedido-del-agente.md): el pendiente del agente, la credencial como autor, el evento guardado y la arista `ingestion → orders` (H-3, D-7);
  - [brief-29.8.3](brief-29.8.3-la-cotizacion-de-un-usado-para-el-agente.md): el molde de la pregunta al agente y la ventana;
  - contratos: [ingestion-v2](../contracts/ingestion-v2.md) (§Pedidos, §Guía para el emisor, §Versionado) y [read-v3](../contracts/read-v3.md).

## Objetivo

Que el agente conteste **«¿Puedo pasar el jueves a la tarde a ver un iPhone 13?»** ofreciendo las franjas libres del local, y que deje el **turno pedido** cuando el cliente elige una. El turno queda `requested`, ocupa su franja, y una persona lo confirma o lo cancela desde la app (ADR 0024, punto 12). **El CRM decide qué franjas hay; el agente pregunta, ofrece y pide.**

## Hallazgos (verificados contra el código en `acb574c`, 2026-10-26)

- **H-1. Casi todo existe.** El estado `requested`, la confirmación y la cancelación desde la app, el cupo bajo el bloqueo de `appointment_settings` (`FOR UPDATE`) y la ocupación que cuenta los `requested` nacieron en la 29.10, listos para el agente (brief-29.10, U-1 (a)). `createAppointment` (`appointments/appointments.ts:389`) tiene todas las reglas del alta, pero **exige un `admin`** y hace nacer el turno `confirmed`: hace falta una función para la ingestión que reciba la transacción y la organización de la credencial, y comparta las reglas.
- **H-2. El turno no sabe quién lo pidió si no es una persona.** `appointments.created_by` es `NOT NULL` con FK a `users`. El pedido del agente resolvió lo mismo en la `0038`: `created_by` nulable, `created_by_credential_id` e `ingestion_event_id` con FK compuestas, un `UNIQUE` del evento y dos `CHECK` (un solo autor; evento si y solo si credencial). La `0066` repite ese molde. El trigger de la `0065` compara la fila entera salvo las columnas que fija cada transición, así que **las columnas nuevas quedan inmutables sin tocarlo**. Sí hay que sumarle una regla al alta: **un turno de una credencial nace `requested`**.
- **H-3. La arista contradice una regla vigente.** El brief-29.10 (D-1), el Overview (fila de `appointments`) y la guarda `appointments-dependencies` («ningún módulo importa appointments») dicen que **ningún módulo depende de `appointments`**. Pero la ingestión abre la transacción del evento y le pide la escritura al módulo dueño: así funciona `order.placed`, con `ingestion → orders` (Overview, fila de `orders`, corregida en la 19.4 por la misma contradicción). Además, `appointments/schema.ts` necesitaría el esquema de `ingestion` para las dos FK compuestas, como `orders`. **No se resuelve sola**: lleva a U-1.
- **H-4. El horizonte del agente quedó pendiente** (brief-29.10, U-6 (a)). La app da turnos hasta 90 días adelante y en cualquier franja que no empezó (`BOOKING_HORIZON_DAYS`, `in_the_past`). Un turno pedido **ocupa la franja hasta que alguien lo mira**: con un horizonte largo o una franja inminente, el agente puede bloquear una franja que nadie va a confirmar a tiempo. Lleva a U-2.
- **H-5. Ninguna regla limita cuántos turnos pide un cliente.** El pedido del agente acepta pendientes repetidos (brief-19.4, D-9), porque **un pendiente no reserva**. Un turno pedido **sí ocupa**: un agente que reintenta mal, o un cliente que pide cinco, llena el calendario de `requested`. Lleva a U-4.
- **H-6. La franja de la hora que falta.** El calendario puede mostrar libre una franja del día que empieza el horario de verano, que el alta rechaza (brief-29.10, §Lo que queda abierto). En la app lo ve una persona; **en el contrato, el agente la ofrecería y el pedido daría `outside_hours`**. La lectura nueva tiene que excluirla, con la misma comprobación de ida y vuelta que `slotExists`.
- **H-7. Un instante en el contrato, una hora local en el CRM.** Las franjas son de hora local en la zona de la organización (brief-29.10, D-3). El agente no tiene por qué saber la zona: la lectura le da cada franja con su **instante con desplazamiento** (`2026-10-29T15:00:00-03:00`), y el pedido lo devuelve tal cual. El CRM lo convierte a la fecha y la hora local de la organización y comprueba que sea el **inicio** de una franja vigente. El `payload_hash` normaliza los instantes a UTC, como `occurred_at` (`ingestion/contract.ts`, `toUtc`), así que el desplazamiento con que llegue no cambia el contenido.
- **H-8. El agente ya ve la capacidad.** `GET /api/read/v3/capabilities` devuelve cualquier valor activo del enum, y «iPhone Demo» tiene `appointments` desde el 2026-10-26. Es compatible (read-v3, §`capabilities`: el emisor ignora lo que no conoce), pero **desde hoy el agente ve una capacidad para la que no tiene ruta**. No hay nada que corregir; la pregunta al agente lo dice.
- **H-9. Ningún contrato existente cambia.** Una ruta nueva en `read-v3` y un `event_type` nuevo en `ingestion-v2` son compatibles (read-v3 y ingestion-v2, §Versionado). `contract_version` sigue en `"3"` y `"2"`.

## Decisiones del usuario

### U-1. La arista `ingestion → appointments` (H-3)

- **(a) Recomendada: como el pedido de la 19.4.** `ingestion` importa de `appointments` dos nombres: `requestAppointmentFromIngestion`, que recibe la transacción, y `findAppointmentRequestedByIngestion`, para el reenvío. `appointments/schema.ts` importa el esquema de `ingestion` para las claves compuestas, como `orders`. **Nota fechada** en el brief-29.10 (D-1), en el ADR 0024 (punto 16) y en el Overview: «ningún módulo depende de `appointments`, salvo `ingestion`, con esos dos nombres». La guarda lo fija por nombre, con la granularidad de la regla.
- **(b) La escritura en la ruta, fuera de la ingestión.** Un endpoint propio de turnos, sin `ingestion_events`. Pierde la idempotencia, el `payload_hash`, la métrica 12 y la guía del emisor, que hoy valen para todo lo que escribe el agente.

### U-2. El horizonte y la anticipación del agente (H-4)

Son valores del negocio: los responde el usuario.

- **(a) Recomendada: 14 días adelante, y nunca una franja que empiece en menos de 2 horas.** La lectura no ofrece nada fuera de esa ventana, y el pedido lo rechaza con `too_far` o `too_soon`. La app sigue con sus 90 días y sin anticipación.
- **(b) Los de la app**: 90 días, y cualquier franja que no empezó.
- **(c) Otros**, que dicta el usuario.

### U-3. Qué lleva el turno pedido

- **(a) Recomendada: el cliente, el motivo, la franja y, opcional, un producto o una unidad.** El producto o la unidad son los que el agente ya leyó en `read-v3` (por ejemplo, el iPhone 13 que el cliente quiere ver). **Sin nota**: la nota es texto libre que puede nombrar a la persona, y la conversación ya está en el CRM.
- **(b) Lo mismo, más una nota** de hasta 500 caracteres escrita por el agente.
- **(c) Sin referencia ni nota**: el cliente, el motivo y la franja.

### U-4. Cuántos turnos pide un cliente (H-5)

- **(a) Recomendada: un solo turno `requested` por cliente que no haya empezado.** Uno más da `422 client_has_pending_request`, y el agente le dice al cliente que ya tiene uno pedido. No limita los `confirmed`: un cliente con un turno confirmado puede pedir otro.
- **(b) Sin límite**, como el pedido pendiente.

### U-5. Los turnos del cliente para el agente

- **(a) Recomendada: no en esta subfase.** El ADR 0024 (punto 15) le da al agente las franjas libres y el pedido, no la agenda del cliente. Si el cliente pregunta «¿me confirmaron?», el agente deriva. Una ruta nueva es compatible y se suma si el agente la pide en su respuesta.
- **(b) Una ruta de alcance `context`**, como las órdenes de servicio de la 29.8.2: los turnos del cliente de la conversación, próximos y de los últimos 30 días, con su estado.

## Decisiones

*Con las opciones (a), aprobadas por el usuario el 2026-10-26.*

### D-1 — El borde y la versión

- **`GET /api/read/v3/appointment-slots`**, alcance `read`: no lleva cliente ni datos de una persona. Una ruta nueva, compatible (H-9).
- **`appointment.requested`** en `ingestion-v2`, alcance `ingest`, solo en v2: v1 está congelada y lo rechaza como cualquier `event_type` desconocido.
- Los bordes son los de cada contrato, sin cambios: modo de prueba, credencial, lista de credenciales permitidas, correlación, el límite de 120 por minuto de cada uno, y el log con la ruta fija, **sin los parámetros**.

### D-2 — Las franjas libres

`GET /api/read/v3/appointment-slots?from=2026-10-27&days=7`

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `from` | no | una fecha `AAAA-MM-DD`, en la zona de la organización. Sin él, hoy |
| `days` | no | de 1 a 7. Sin él, 7 |

```json
{
  "contract_version": "3",
  "today": "2026-10-27",
  "slot_minutes": 30,
  "reasons": [
    { "reason_id": "…", "name": "Ver o comprar un equipo" },
    { "reason_id": "…", "name": "Entregar un usado" }
  ],
  "days": [
    {
      "date": "2026-10-29",
      "slots": [
        { "starts_at": "2026-10-29T15:00:00-03:00", "ends_at": "2026-10-29T15:30:00-03:00" }
      ]
    }
  ]
}
```

- **`today`**: la fecha de hoy en la zona de la organización, **siempre presente**, también sin la capacidad y aunque hoy no tenga franjas. Con ella el agente pasa «mañana» o «el jueves» a una fecha (respuesta del agente, A-1).
- **Solo las franjas que el agente puede pedir**: con lugar (la ocupación cuenta `requested` y `confirmed`), dentro del horizonte y de la anticipación de U-2, y **que existen en la hora local** (H-6). Un día sin ninguna no aparece.
- **Sin la ocupación ni el cupo**: libre o no aparece.
- **`reasons`**: los motivos activos, en el orden de la organización. Van en la misma respuesta para que pedir un turno no gaste dos lecturas del presupuesto.
- **El instante lleva el desplazamiento de la organización en esa fecha** (H-7).
- **Sin la capacidad, o sin `appointment_settings`**, `{"today": "…", "slot_minutes": null, "reasons": [], "days": []}`. Sin horario cargado, `days: []`. El agente distingue la capacidad por su ruta (H-8).
- **Un `from` mal formado, un `days` fuera de rango o un `from` en el pasado** da `400` con sus `fields`. Un rango que pasa el horizonte se recorta, sin error.
- **La lectura no promete**: entre leer y pedir, otro puede ocupar la franja. Lo dice el contrato (D-6).

### D-3 — El turno pedido

```json
{
  "contract_version": "2",
  "event_type": "appointment.requested",
  "event_id": "evt-v2-turno-0001",
  "occurred_at": "2026-10-27T12:00:16-03:00",
  "client": { "phone": "+5491155550001" },
  "appointment": {
    "reason_id": "…",
    "starts_at": "2026-10-29T15:00:00-03:00",
    "product_id": "…"
  }
}
```

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `client.phone` | string | no | E.164, como en `order.placed`. El cliente tiene que existir: `client.resolved` va antes |
| `appointment.reason_id` | string | no | un uuid de `reasons`, en minúsculas |
| `appointment.starts_at` | string | no | el `starts_at` de una franja, tal como lo devolvió la lectura. Las reglas de fecha de `occurred_at`; normalizado a UTC en el `payload_hash` (H-7) |
| `appointment.product_id` | string | sí, se omite | opcional, un producto de `read-v3`. Nunca junto con `unit_id`: los dos dan `400` con `appointment` |
| `appointment.unit_id` | string | sí, se omite | opcional, una unidad de la ruta de unidades de `read-v3` |

- **El fin lo pone el CRM**, con la duración vigente: el agente no lo manda.
- **Qué hace**: deja el turno `requested`, con la credencial como autor y el evento guardado (D-4), auditado con la credencial como actor. Ocupa la franja desde ese momento.
- **El emisor nunca confirma, cancela ni marca un turno.** Lo hace una persona desde la app.
- **Respuesta**: siempre `200`, con la franja y nada más:

  ```json
  { "contract_version": "2", "event_id": "evt-v2-turno-0001", "result": "accepted", "appointment": { "starts_at": "2026-10-29T15:00:00-03:00", "ends_at": "2026-10-29T15:30:00-03:00" } }
  ```

  `duplicate` es el reenvío idéntico, con la misma franja y sin escribir.

**Reglas de negocio**: `422 BUSINESS_RULE_VIOLATION`, terminales, con una sola `rule`. **Precedencia**: la de la tabla; se responde la primera que falla. Un rechazo no escribe el turno, y un reenvío responde la misma regla aunque la franja se haya liberado.

| `rule` | Cuándo |
|---|---|
| `not_offered` | la organización no tiene la capacidad, o no tiene `appointment_settings` |
| `client_not_found` | el teléfono no es de ningún cliente de la organización |
| `client_inactive` | el cliente está desactivado |
| `reason_not_found` | el motivo no existe, es de otra organización o está inactivo, **sin distinguir** |
| `reference_not_found` | el producto o la unidad no existe, es de otra organización o está inactivo, sin distinguir |
| `client_has_pending_request` | el cliente ya tiene un turno `requested` que no empezó (U-4) |
| `outside_hours` | `starts_at` no es el inicio de una franja vigente, o cae en la hora que falta |
| `in_the_past` | la franja ya empezó |
| `too_soon` | empieza en menos de la anticipación de U-2 |
| `too_far` | pasa el horizonte de U-2 |
| `slot_full` | la franja no tiene lugar al momento del pedido |

- **Qué hace el emisor ante un `422`**: lo de la guía (no reenvía el mismo `event_id`) y **deriva la conversación** con `conversation.escalated`, ante **cualquier** regla, como con `order.placed`. El agente manda el evento después de responderle al cliente, así que el cliente ya escuchó que su turno quedó pedido; una persona del local le ofrece otra franja. Las reglas finas quedan para el diagnóstico, en `ingestion_events.error_code`. *Así lo aprobó el usuario el 2026-10-26 (A-2), a partir de la respuesta del agente; antes, esta tabla decía que ante las reglas de la franja el emisor volvía a leer y ofrecía otra.*
- **No cuenta en la métrica 12**: no es un mensaje, como el pedido.

### D-4 — La migración `0066`

- `appointments.created_by` nulable; `created_by_credential_id` e `ingestion_event_id`, con FK compuestas a `ingestion_credentials` e `ingestion_events` (`RESTRICT`) y un `UNIQUE` del evento.
- `appointments_one_creator` (un solo autor) y `appointments_event_iff_credential` (evento si y solo si credencial), como la `0038`.
- **El trigger suma una regla al alta**: un turno de una credencial nace `requested`. El resto del trigger no cambia (H-2).
- **No toca ninguna fila existente**: todos los turnos de hoy tienen `created_by`, y lo prueba `migration-0066.test.ts` (hasta la `0065` con datos, confirmar, la `0066` sola).

### D-5 — El código

- **`appointments`** expone:
  - `requestAppointmentFromIngestion(tx, …)`: recibe la transacción de la ingestión, la organización y la credencial. **Comparte con `createAppointment` las reglas de la franja y el cupo bajo el mismo bloqueo**: la regla no se duplica. Bloquea al cliente por teléfono con `crm`, como el pedido;
  - `findAppointmentRequestedByIngestion`: la franja del turno de un evento ya procesado, para `duplicate`;
  - `listFreeSlotsForService(organizationId, from, days)`: la lectura de D-2, sin `authorize`, como las demás `…ForService`. Excluye la hora que falta en SQL, con el mismo ida y vuelta que `slotExists`.
- **El horario se lee dentro de la transacción del pedido**, no antes. Así el pedido del agente no repite N-3 de la 29.10.

  *Precisado el 2026-10-26, al implementar*: el horario se lee **después** de tomar el bloqueo de los valores, pero `getEffectiveBusinessDays` usa su propia conexión, no la transacción del pedido, y quien cambia el horario (`knowledge`) no toma ese bloqueo. N-3 se achica (la lectura es posterior al bloqueo, no anterior a la transacción) pero no desaparece: un cambio de horario en ese mismo instante puede dejar un turno pedido fuera de horario, que el calendario marca (U-5 de la 29.10). Cerrarlo exigiría que `knowledge` tome el bloqueo de `appointments` o reciba la transacción, una arista que D-1 no admite.

  *Corregido el 2026-10-26, por la revisión independiente (N-5)*: la lectura del horario en otra conexión, junto con la del producto, la unidad y la zona, pedía conexiones del pool mientras se sostenía el bloqueo de los valores. Con tantos pedidos de la misma organización esperando ese bloqueo como conexiones tiene el pool, quien lo tenía no conseguía otra y el pedido daba 500. Ahora `getEffectiveBusinessDays` recibe la transacción como parámetro opcional, como `hasCapability`, y lee **dentro de la transacción del pedido**, como pedía este punto. La zona, el producto y la unidad, que el bloqueo no protege, se leen antes de tomarlo, y sus reglas se aplican igual en su precedencia. Recibir la transacción no es una arista nueva: `appointments` ya importaba esa función. N-3 queda como dice el párrafo de arriba, porque quien cambia el horario sigue sin tomar el bloqueo.
- **La app**: el turno muestra su origen («Pedido por el agente», con el emisor de la credencial, como el pedido de la 19.4) en el detalle y en la lista del día, y la historia muestra la credencial como actor. **Confirmar y cancelar no cambian**: ya existen.
- **Las guardas**:
  - `appointments-dependencies`: su regla de «ningún módulo importa appointments» admite solo a `ingestion`, y solo con los dos nombres de U-1; `appointments/schema.ts` puede importar el esquema de `ingestion`. Con un caso de fallo **dentro del grano**: `ingestion` importando otro nombre de `appointments`;
  - `agent-contract-fields` cubre los esquemas nuevos de `read-v3/contract.ts` e `ingestion/contract-v2.ts`;

    *Precisado el 2026-10-26, por la revisión independiente (N-7)*: la guarda lee los esquemas de respuesta, así que cubre el de `read-v3/contract.ts` sin cambios. De la ingestión lee las respuestas de los `handler.ts`, no `contract-v2.ts`, cuyo esquema nuevo es de entrada. No hay nada que cubrir ahí;
  - `service-read-entry-points`, `exposed-surface` y `capability-reads`, al día.

### D-6 — Lo que el contrato le dice al agente

- **Es un pedido, no un turno dado.** El agente dice «te lo pedimos; el local te lo confirma», nunca «te espero el jueves» ni «quedó agendado».
- **El CRM no avisa**: no manda mensajes. La confirmación se la da una persona del local (ADR 0024, punto 12).
- **La lectura no reserva**: entre ofrecer y pedir, la franja se puede ocupar. Con `slot_full`, como con cualquier `422`, el agente deriva (A-2).
- **No inventa franjas**: solo ofrece las que leyó, y nunca las calcula con el horario de `business-hours`.
- **No confirma, cancela ni mueve turnos.** Si el cliente quiere cambiar o cancelar, deriva.

### D-7 — Lo que el agente nunca lee

- La lectura no trae turnos, clientes, ocupación ni cupo. La integración busca en el cuerpo crudo el teléfono y el nombre de los clientes con turnos en ese rango, y la nota de un turno. Ninguno puede aparecer.
- La respuesta del pedido no trae el id del turno ni el del cliente.

### D-8 — Pruebas

- **Unitarias**: el contrato de los dos esquemas (cada campo, el `400` de `product_id` con `unit_id`, `starts_at` normalizado en el vector del `payload_hash`, fijado a mano con `sha256sum` como los anteriores).
- **Integración**:
  - la lectura: el rango, el horizonte y la anticipación, una franja llena que no aparece, un `requested` que ocupa, los motivos activos, sin capacidad y sin valores; **la hora que falta (Nueva York y Santiago) que no aparece**; una organización en otra zona (Tokio) con su desplazamiento;
  - el pedido: cada regla de D-3 en su precedencia, el reenvío `duplicate` con la misma franja, el reenvío de un `422` con la misma regla, y el `409 event_payload_mismatch`;
  - **el cupo**: un pedido del agente y un alta de la app a la vez en la última plaza dejan un turno, con el bloqueo sostenido desde una tercera conexión;
  - la base sin el servicio: un turno de credencial que nace `confirmed`, uno con los dos autores y uno con credencial sin evento, rechazados con el nombre exacto de cada restricción;
  - el turno pedido se confirma y se cancela desde la app, con su historia;
  - el aislamiento entre organizaciones, y el vaciado y la exportación de un cliente con un turno del agente.
- **`migration-0066.test.ts`** (D-4).
- **Guardas**: las de D-5, cada una con su caso de fallo.
- **End-to-end**: un `admin` ve un turno pedido por el agente, con su origen, y lo confirma.

*Nota del 2026-10-26, por la revisión independiente (N-1, N-2, N-8)*. Lo que se sumó:
- **El pedido en la hora que falta**: en Nueva York, una franja que termina en la hora que falta da `outside_hours` y no `too_far`. De los dos instantes de la hora repetida, uno solo es la franja.
- **Los pares de precedencia que faltaban**:
  - `not_offered` antes que `client_not_found`;
  - `outside_hours` antes que `in_the_past`;
  - `in_the_past` y `too_far` antes que `slot_full`;
  - `reference_not_found`, con un producto inactivo, antes que `client_has_pending_request`.
- **La cancelación desde la app** de un turno del agente, con su historia.
- **La respuesta HTTP del evento** en `ingestion-v2-http.test.ts`: `200` con la franja, `duplicate`, un `422`, el `400` de producto y unidad juntos, y v1 que rechaza el tipo.

Lo que **se desvía** de este punto, **aceptado por el usuario el 2026-10-26**:
- **«La hora que falta no aparece» no se prueba sobre la lectura**, porque la lectura usa la hora de la base y solo mira 14 días adelante. Para compensarlo, la exclusión se movió a la consulta: `bookable` exige que la franja exista, y la lectura filtra solo por `bookable`. La prueba del repositorio afirma `bookable` en falso para la hora que falta en 2027 (Nueva York y Santiago), sin anticipación. Así, quitar esa condición hace fallar una prueba. Probarlo sobre la lectura pediría pasarle la hora al servicio.
- **La unidad dada de baja como `reference_not_found` no tiene prueba propia**: darla de baja exige la capacidad de unidades. Sí se prueban la unidad inexistente y el producto inactivo.

### D-9 — El agente, la pregunta y la ventana

- **No se implementa hasta que el agente confirme por escrito que lo va a usar, o pida cambios.** La pregunta va en `Pregunta-29.10.2-CRM-al-Agente.md`, en el Escritorio del usuario: la ruta, el evento, las reglas con lo que hace el emisor, lo que el contrato le dice (D-6), y U-5 como pregunta abierta (si necesita los turnos del cliente).
- **Un cambio que pida el agente** y toque una decisión de este brief vuelve al usuario antes de implementar.
- **La ventana**, en «iPhone Demo» de producción, que ya tiene la capacidad y el horario: el agente lee las franjas, pide un turno, el usuario lo confirma en la app, y el agente provoca al menos `slot_full` y `client_has_pending_request`. Se concilia por `X-Correlation-Id` contra el log, `ingestion_events` y `appointments`, como las anteriores.

### D-10 — La documentación

- `ingestion-v2.md`, §Turnos (desde la 29.10.2), con el vector y su `payload_hash`; `read-v3.md`, la ruta nueva.
- Notas fechadas en el ADR 0024: punto 12 (U-2 a U-4), punto 15 (la ruta y el evento) y punto 16 (U-1); y en el brief-29.10: D-1 (U-1) y U-6 (U-2).
- `DataModel.md` (la `0066`), `Overview.md` (las filas de `ingestion` y `appointments`), `SecurityModel.md` (los puntos de entrada) y el Roadmap.

### La respuesta del agente (2026-10-26)

El agente confirmó por escrito que **va a usar la ruta y el evento con esta forma** (`Respuesta-29.10.2-Agente-al-CRM.md`). Lo que contó de su lado está verificado por él contra su código, en solo lectura, y no por el CRM. De su lado no hay nada implementado: lo hace en una subfase suya nueva, sin fecha, que ordena el usuario.

- **Pide `today` en la lectura** (§1 de su respuesta): la fecha de hoy en la zona del negocio, para pasar «mañana» o «el jueves» a una fecha. Hoy no aparece si no tiene franjas. Sin el campo, haría una lectura más a `business-hours` (`now_local`), solo para la fecha. No frena la implementación. Lleva a A-1.
- **Deriva ante cualquier `422`, también los de la franja** (§4): sus eventos salen de una cola **después de entregar la respuesta**, así que cuando llega el `422` el cliente ya leyó «te lo pedimos; el local te lo confirma». Contradice la columna «Qué hace el emisor» de D-3, que para las reglas de la franja decía «vuelve a leer y ofrece otras». Volver a ofrecer exigiría que el agente escriba dentro del turno: un cambio de arquitectura suyo, fuera de esta subfase. Para que pase poco, lee las franjas en el turno de la propuesta, y la propuesta vence a los 30 minutos. Lleva a A-2.
- **Los turnos del cliente** (U-5): no los necesita ahora. Más adelante le servirían para saber, antes de ofrecer, si el cliente ya tiene un turno pedido, porque hoy `client_has_pending_request` termina en una derivación después de que el cliente leyó la respuesta.
- **Cómo elige la franja**: entre las de la lectura de ese turno, hasta cuatro, por la hora local de `starts_at`; el cliente elige por la hora. El código comprueba que `starts_at`, `reason_id` y `product_id` salieron de una lectura de ese turno. **No usa `unit_id`** en esta subfase.
- **El momento**: dos turnos, como el pedido. `event_id` `wa-apt-k1-<HMAC>` sobre el id del mensaje del «sí», `occurred_at` la hora de ese mensaje, en la misma cola que `client.resolved`.
- **Sin la capacidad** (`slot_minutes: null` o `days: []`) no ofrece turnos. No lee `capabilities` para esto.
- **La ventana**: le sirve como está. `slot_full` y `client_has_pending_request` terminan en derivación (A-2); se concilian el `422` con su `rule`, la derivación y que el cliente no lea nada falso. Escribe desde el teléfono de prueba de las ventanas anteriores, que ya es cliente de «iPhone Demo».

**Decidido por el usuario el 2026-10-26, antes de implementar** (D-9: tocan D-2 y D-3), las dos en la opción recomendada:
- **A-1. `today` en la lectura**: se suma, siempre presente, también sin la capacidad (D-2).
- **A-2. La guía del `422`**: se acepta la conducta del agente. Deriva ante cualquier `422`, como con `order.placed`, y las reglas quedan finas para el diagnóstico (D-3). Las reglas, su precedencia y la respuesta no cambian.

## Alcance incluido

- La ruta de D-2, el evento de D-3 y la migración `0066`.
- Las funciones de D-5 en `appointments`, y el despacho del evento en `ingestion`.
- El origen del turno en la app.
- Las guardas, las pruebas y la documentación de D-8 y D-10.
- La pregunta al agente, el despliegue y la ventana.

## Alcance excluido

- **Los turnos del cliente para el agente** (U-5 (a)), salvo que el agente los pida y el usuario lo apruebe.
- Que el agente confirme, cancele, mueva o marque un turno.
- Recordatorios o avisos al cliente (ADR 0024, punto 12).
- Que un turno pedido venza solo si nadie lo confirma.
- Cambios en `createAppointment` más allá de compartir sus reglas, o en las pantallas de la 29.10 más allá del origen.
- Los cambios del lado del agente: los hace él, en su repositorio.

## Invariantes

- **Ningún turno supera el cupo**, sea de la app o del agente, aun con altas simultáneas.
- **Un turno del agente nace `requested`**, y la base lo exige aunque se salte el servicio.
- **La lectura nunca ofrece una franja que el pedido rechazaría** en ese momento, salvo por una ocupación posterior.
- **Ninguna respuesta existente cambia**: ni de `read-v3` ni de `ingestion-v2`, ni de v1.
- **El agente no lee datos de clientes** en la lectura nueva.
- **Cada lectura y cada FK filtran por organización.**

## Criterios de aceptación

- **AC-1**: la `0066` agrega el autor de servicio y el evento, sus restricciones y la regla del alta, y aplicada sola sobre la `0065` no cambia ninguna fila existente.
- **AC-2**: la lectura devuelve solo franjas que el agente puede pedir, con su desplazamiento, y nunca una de la hora que falta.
- **AC-3**: `appointment.requested` deja un turno `requested`, con la credencial y el evento, auditado; el reenvío idéntico da `duplicate` con la misma franja.
- **AC-4**: cada regla de D-3 se responde en su precedencia, sin escribir.
- **AC-5**: un pedido del agente y un alta de la app a la vez en la última plaza dejan un solo turno.
- **AC-6**: la base rechaza un turno de credencial que no nace `requested`, uno con dos autores y uno con credencial sin evento.
- **AC-7**: un `admin` ve el origen del turno pedido y lo confirma o lo cancela desde la app.
- **AC-8**: ninguna respuesta nueva trae datos de un cliente, ocupación ni cupo; ninguna existente cambia.
- **AC-9**: las dependencias son las de U-1 y la guarda las fija por nombre.
- **AC-10**: las guardas, las unitarias, la integración entera y el end-to-end pasan en la CI.
- **AC-11**: el agente confirmó por escrito antes de implementar.
- **AC-12**: revisión independiente antes del despliegue, con sus hallazgos verificados y resueltos.
- **AC-13**: desplegada, y la ventana del agente conciliada.

## Pruebas y evidencia requerida

- Los tests de D-8 y una CI en `success` sobre el SHA que se despliega.
- La integración entera en local antes del push.
- La respuesta escrita del agente.
- Los recuentos de producción antes y después, solo leyendo.
- La conciliación de la ventana.

## Condiciones de detención

- Si el agente pide cambios que tocan una decisión de este brief: vuelven al usuario.
- Si el pedido necesita que `appointments` dependa de `ingestion` más allá de su esquema, o cualquier arista fuera de U-1.
- Si compartir las reglas con `createAppointment` obliga a cambiar la conducta de la app.
- Si la migración obliga a tocar filas existentes.
- Cualquier cambio en una respuesta existente de un contrato del agente.
- Si el agente tuviera que confirmar, cancelar o mover un turno.

## Cierre

*Del 2026-10-27, después del despliegue y de la ventana con el agente (su 3.55), conciliada ese día.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `migration-0066.test.ts`: la `0065` con datos, la `0066` sola, las filas iguales. En producción: 67 migraciones, las tres columnas y las tres restricciones, y el turno que ya existía con su autor intacto |
| AC-2 | cumple | `appointments-agent.test.ts`: el rango, el horizonte, la anticipación, la ocupación y Tokio. Desde la revisión (N-1), `bookable` exige que la franja exista: la prueba del repositorio la afirma en falso para la hora que falta en 2027 (Nueva York y Santiago), y quitar la condición la hace fallar. La prueba sobre la ruta queda como desvío aceptado (D-8) |
| AC-3 | cumple | `appointments-agent.test.ts` e `ingestion-v2-http.test.ts` (N-8): `200` con la franja y `duplicate`. En la ventana: el `accepted` del paso 2 y el `duplicate` del paso 7, sin sumar fila |
| AC-4 | cumple | `appointments-agent.test.ts`: cada regla y, desde la revisión (N-2), los pares de precedencia que faltaban y el pedido en la hora que falta. En la ventana: `client_has_pending_request` y `slot_full` |
| AC-5 | cumple | `appointments-agent.test.ts`: un pedido del agente y un alta de la app a la vez, con el bloqueo sostenido desde una tercera conexión |
| AC-6 | cumple | `appointments-agent.test.ts` y `migration-0066.test.ts`: cada rechazo con el nombre exacto de su restricción o del trigger |
| AC-7 | cumple | `appointments.spec.ts` («Pedido por el agente» y el origen) y `appointments-agent.test.ts` (confirmar y, desde la revisión, cancelar). En la ventana, el usuario confirmó el turno del agente y después lo canceló |
| AC-8 | cumple | `appointments-agent.test.ts` sobre el cuerpo crudo; `agent-contract-fields`; ningún esquema existente cambió |
| AC-9 | cumple | `appointments-dependencies`: `ingestion` solo con los dos nombres, y desde la revisión (N-4), el caso de `appointments` importando la interfaz de `ingestion`. Importar un tercer nombre la hizo fallar |
| AC-10 | cumple | CI de `0d3c852` (run 40426668024, `success`): guardas 898, unitarias 1170, integración 1839, e2e 298. Antes fallaron dos corridas, por dos defectos de prueba (§Lo que falló en la CI) |
| AC-11 | cumple | `Respuesta-29.10.2-Agente-al-CRM.md`, del 2026-10-26: A-1 y A-2, aprobadas por el usuario |
| AC-12 | cumple | Revisión independiente: un bloqueante (B-1, el turno contaba en la métrica 12) y nueve no bloqueantes, verificados contra el código. Todos corregidos, salvo los dos desvíos de D-8 que el usuario aceptó |
| AC-13 | cumple | Desplegada el 2026-10-26 en `0d3c852` con la `0066`. La ventana del 2026-10-27, de 18:59 a 19:20 UTC, conciliada por `X-Correlation-Id` contra el log, `ingestion_events`, `appointments` y la auditoría: 5 lecturas `OK`; los eventos `accepted`, `client_has_pending_request`, `slot_full` y `duplicate`; dos derivaciones de `open` a `pending`; ningún `400`, `409` ni `429` |

### Lo que falló en la CI

- **`6b6370c`**: el TRUNCATE de `dashboard-sin-ingestion.spec.ts` vaciaba `ingestion_events` sin `appointments`, que la referencia desde la `0066`. Se corrigió en `5c25c1d`. Localmente solo se habían corrido los e2e de turnos.
- **`5c25c1d`**: la prueba de la anticipación esperaba la primera franja a menos de media hora. La CI corrió a las 21:05 locales, y con el día abierto hasta las 23:59 la siguiente franja era la de 00:00, a 55 minutos. Se corrigió en `0d3c852`, con un margen de una hora. El caso no se reprodujo localmente: la corrección se sostiene en que el hueco más largo de esa grilla es de una hora.

### Lo que queda abierto, a sabiendas

- **N-3 de la 29.10**: el horario se lee en la transacción del pedido, pero quien lo cambia no toma el bloqueo. Un cambio en ese instante puede dejar un turno pedido fuera de horario, que una persona ve antes de confirmar (D-5).
- **Los dos desvíos de D-8**, aceptados por el usuario el 2026-10-26: la hora que falta no se prueba sobre la ruta, y la unidad dada de baja no tiene prueba propia.
- **Los turnos del cliente para el agente** (U-5): fuera. El agente dijo que le servirían para no ofrecer franjas a quien ya tiene un turno pedido. Sería una subfase nueva.
- **Ofrecer otra franja después de un `422`** sigue siendo de una persona. Que lo haga el agente es una decisión de su arquitectura.
- **Las correcciones de la revisión son autoevaluación**: no hubo una segunda revisión independiente.
