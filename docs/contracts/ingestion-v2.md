# Contrato de ingestión v2

**Estado**:
- **Diseñado e implementado** en la 12.3.1 ([brief-12.3](../decisions/brief-12.3-contrato-de-ingestion-v2.md)): el validador, el `payload_hash`, el endpoint y la proyección del tipo y el autor.
- **Validado localmente y en CI**, con requests sintéticos (`deterministic`).
- **Validado en staging** con requests sintéticos a través del borde real (12.3.2, `isolated-runtime`).
- **Validado en integración** con el agente como emisor, desde su instancia de n8n y con datos sintéticos (12.3.3, `producer-consumer`, 2026-09-27). **No** es el turno completo (12.5) ni producción.

- **Validado en integración con el turno completo** (12.5.2, `producer-consumer`, 2026-09-28; [evidencia-12.5](../decisions/evidencia-12.5-turno-completo.md)): el emisor ya está cableado a la cadena real del agente, con una cola durable que retiene ante `404` y reenvía idéntico. En dos ventanas, la conciliación dio cada mensaje una sola vez, en su conversación. Los dos `409` terminaron según la guía, incluido el reintento con referencias nuevas. El agente **no** está conectado a tráfico real: solo emite en ventanas de prueba. Fuera de ellas, la ingestión de staging está apagada y sus credenciales, revocadas.

- *Desde la 16.2* ([brief-16.2](../decisions/brief-16.2-etiquetas-puestas-por-el-agente.md)): **dos tipos nuevos, solo en v2**, para poner y quitar una etiqueta del catálogo en un cliente (§Etiquetas). **Diseñados, implementados y validados localmente** con requests sintéticos, y desplegados en producción el 2026-10-07 (16.2.2). **Validados en integración** con el agente como emisor real en la organización de demostración de producción (16.2.3, `producer-consumer`, 2026-10-07): 8 eventos conciliados contra `ingestion_events`, las asignaciones y la auditoría, para poner, quitar, `accepted` sin escritura y `tag_not_found`. `client_not_found` y `client_tag_limit` no ocurrieron: quedan validadas localmente. Los `client.tag_removed` los mandó un llamador de prueba del agente, no un turno.

- *Desde la 19.4* ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md)): **un tipo nuevo, solo en v2**, para dejar un pedido pendiente (§Pedidos). **Diseñado, implementado y validado localmente** con requests sintéticos (19.4.1). **No** está desplegado ni validado con el agente: eso es la 19.4.2 y la 19.4.3.

- *Desde la 29.8* ([brief-29.8](../decisions/brief-29.8-el-catalogo-del-rubro-para-el-agente.md), D-7 y U-2): **un tipo nuevo, solo en v2**, `order.placed_with_units`, para dejar un pedido pendiente con las unidades que eligió el cliente (§Pedidos con unidades). Es un cambio compatible dentro de v2: `order.placed` no cambia. **Diseñado, implementado y validado localmente** con requests sintéticos. **No** está validado con el agente: lo confirma la ventana de la 29.8.

- *Desde la 29.10.2* ([brief-29.10.2](../decisions/brief-29.10.2-los-turnos-para-el-agente.md), D-3 y A-2): **un tipo nuevo, solo en v2**, `appointment.requested`, para pedir un turno de visita al local (§Turnos). Es un cambio compatible dentro de v2. **Diseñado, implementado y validado localmente** con requests sintéticos. Desplegado en producción el 2026-10-26 (`0d3c852`). **Validado en integración** con el agente como emisor real en la ventana del 2026-10-27 (su 3.55): `accepted`, `client_has_pending_request`, `slot_full` y `duplicate`, conciliados por `X-Correlation-Id` (brief, §Cierre).

*Hasta la 12.5 este párrafo decía que el emisor seguía sin cablear a su pipeline; actualizado por la revisión independiente de la 12.5 (R-2).* En `tests/fixtures/ingestion/v2/` conviven los fixtures de **forma asumida** (`"shape": "assumed"`, los vectores del contrato) y **seis capturas del agente** (`"shape": "captured"`), que guardan el cuerpo tal como llegó a staging. Este contrato no deriva de la forma de eventos de ningún sistema existente.

## Qué cambia respecto de v1

v2 es la misma superficie de escritura que [v1](ingestion-v1.md), en otra ruta, con los mismos cuatro eventos. *Desde la 16.2* suma dos que v1 no tiene: `client.tag_added` y `client.tag_removed` (§Etiquetas). *Desde la 19.4*, un tercero: `order.placed` (§Pedidos). *Desde la 29.8*, un cuarto: `order.placed_with_units` (§Pedidos con unidades). *Desde la 29.10.2*, un quinto: `appointment.requested` (§Turnos). **v1 sigue funcionando igual**, congelada. Todo lo que este documento no menciona rige como en v1: referencias opacas, fechas, texto, tamaño, identidad, idempotencia, algoritmo del hash, reglas de negocio (`422`), vigencia de la conversación y proyección.

| | v1 | v2 |
|---|---|---|
| Ruta | `POST /api/ingestion/v1/events` | `POST /api/ingestion/v2/events` |
| `contract_version` | `"1"` | `"2"` |
| Tipo original del mensaje | no existe; el mensaje queda con `kind = null` | `message.kind`, obligatorio |
| Autor de una salida | no existe; queda `sent_by = null` | `message.sent_by`, obligatorio en una salida y prohibido en una entrada |
| Nombre del cliente igual al teléfono | se acepta | se rechaza |
| `CONFLICT` | sin motivo | con `reason`, también al reenviar |
| Correlación | no existe | `X-Correlation-Id`, validado antes del límite de tasa |
| Etiquetas del cliente (16.2) | no existen: un `client.tag_added` da `400` en `event_type` | `client.tag_added` y `client.tag_removed` |
| Pedido pendiente (19.4) | no existe: un `order.placed` da `400` en `event_type` | `order.placed` |
| Pedido con unidades (29.8) | no existe: da `400` en `event_type` | `order.placed_with_units` |
| Turno pedido (29.10.2) | no existe: da `400` en `event_type` | `appointment.requested` |

## Transporte

- **Endpoint**: `POST /api/ingestion/v2/events`.
- **Autenticación, modo de prueba y allowlist**: los de v1. La misma credencial de alcance `ingest` sirve para las dos versiones, y la misma allowlist (`INGESTION_ALLOWED_CREDENTIALS`) las habilita. Con `INGESTION_ENABLED` apagado, las dos rutas responden `404` sin cuerpo.
- **Límite de tasa**: **uno solo por credencial**, compartido entre v1 y v2 (120 pedidos por minuto).
- **Correlación** (brief-12.3, D-6):
  - el emisor puede mandar `X-Correlation-Id`, con las reglas de las referencias opacas: de 1 a 200 caracteres y sin caracteres de control. HTTP recorta los espacios de los bordes antes de que el valor llegue;
  - el CRM lo registra en su log como `correlation_id` y lo devuelve en el encabezado `X-Correlation-Id` de **toda** respuesta posterior a su validación, incluidos el `429` y el `500`;
  - uno inválido responde `400 VALIDATION_ERROR` con el campo `correlation_id`, sin consumir el límite;
  - **no debe llevar datos personales**: el CRM no puede comprobarlo.
- **Orden de las comprobaciones**: modo de prueba, credencial, allowlist, correlación, límite de tasa, cuerpo y evento. Un rechazo anterior al límite no lo consume.

## Campos nuevos

| Campo | Tipo | Nulable | Reglas | En qué eventos |
|---|---|---|---|---|
| `message.kind` | string | no | `"text"`, `"audio"`, `"image"`, `"video"`, `"document"` u `"other"` | `message.recorded` y `conversation.resolved` |
| `message.sent_by` | string | no; se omite en una entrada | `"agent"` o `"person"` | solo `message.recorded`, y solo con `direction = "outbound"` |

- **`kind`** es el tipo original del mensaje. `body_text` sigue siendo el texto útil: **la transcripción de un audio** o el epígrafe de una imagen, o `null` si no hay texto. Lo que el CRM no distingue (ubicación, contacto, sticker) va como `"other"`, nunca con su nombre. **Sin adjuntos**: el CRM no guarda el archivo ni su URL.
- **`sent_by`** dice quién envió una salida: el agente o una persona del negocio. `"person"` no identifica a qué persona.
  - En una **salida** es obligatorio: sin él, `400` con el campo `message.sent_by`.
  - En una **entrada** está prohibido, porque el autor siempre es el cliente: mandarlo, aunque sea `null`, da `400` con `message.sent_by`.
  - En `conversation.resolved`, que siempre es entrante, `sent_by` y `direction` son campos desconocidos: `400` con el campo `message`.
- **`client.display_name`** (brief-12.3, D-8, que cierra R-6 de la 12.1): se rechaza con `400` y el campo `client.display_name` si sus dígitos son los del teléfono del evento. Se comparan solo los dígitos, así que `"+54 9 11 5555-0001"` es el teléfono `+5491155550001`. Un nombre con otros dígitos, como `"Local 12"`, se acepta. **Límite**: un nombre con el teléfono en formato local, sin el código de país (`"11 5555-0001"`), se acepta. *Desde el 2026-09-27*: la 12.3.3 no pudo confirmarlo ni descartarlo, porque el nombre sintético no traía el teléfono; se revisa en la 12.5 con el turno completo, por decisión del usuario ([Risks](../planning/Risks.md)).

Los demás campos de cada evento son los de v1, con `contract_version: "2"`.

## Vectores de prueba y `payload_hash`

El algoritmo es el de v1. `contract_version` entra en el hash, así que **el mismo `event_id` enviado por v1 y por v2 nunca comparte el hash** y da `CONFLICT`. Cada hash se calculó sobre el texto canónico escrito a mano, no con el validador.

**`client.resolved`**:

```json
{
  "contract_version": "2",
  "event_type": "client.resolved",
  "event_id": "evt-v2-client-0001",
  "occurred_at": "2026-09-16T11:59:58-03:00",
  "client": { "phone": "+5491155550001", "display_name": "María Gómez" }
}
```

```text
{"client":{"display_name":"María Gómez","phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-client-0001","event_type":"client.resolved","occurred_at":"2026-09-16T14:59:58.000Z"}
```

`payload_hash`: `a58c8ae0d0a4fef267b8b887345c8e9718c9b60052138cf55c652c67a7fd4ab4`.

**`conversation.resolved`**, un audio transcripto:

```json
{
  "contract_version": "2",
  "event_type": "conversation.resolved",
  "event_id": "evt-v2-conv-0001",
  "occurred_at": "2026-09-16T11:59:58-03:00",
  "conversation": {
    "external_ref": "conv-propuesta-0001",
    "channel": "whatsapp",
    "client_phone": "+5491155550001"
  },
  "message": {
    "external_ref": "msg-v2-0001",
    "kind": "audio",
    "sent_at": "2026-09-16T11:59:57.250-03:00",
    "body_text": "Hola, ¿tienen stock?"
  }
}
```

```text
{"contract_version":"2","conversation":{"channel":"whatsapp","client_phone":"+5491155550001","external_ref":"conv-propuesta-0001"},"event_id":"evt-v2-conv-0001","event_type":"conversation.resolved","message":{"body_text":"Hola, ¿tienen stock?","external_ref":"msg-v2-0001","kind":"audio","sent_at":"2026-09-16T14:59:57.250Z"},"occurred_at":"2026-09-16T14:59:58.000Z"}
```

`payload_hash`: `415aca6aabdcd6e3aeb69361d7a4f47f1275985f9cf9f173bbb1ba2cc28bfba9`.

**`message.recorded`**, la respuesta del agente:

```json
{
  "contract_version": "2",
  "event_type": "message.recorded",
  "event_id": "evt-v2-msg-0001",
  "occurred_at": "2026-09-16T12:00:05-03:00",
  "conversation": {
    "external_ref": "conv-propuesta-0001",
    "channel": "whatsapp",
    "client_phone": "+5491155550001"
  },
  "message": {
    "external_ref": "msg-v2-0002",
    "direction": "outbound",
    "kind": "text",
    "sent_by": "agent",
    "sent_at": "2026-09-16T12:00:04.500-03:00",
    "body_text": "Sí, tenemos stock."
  }
}
```

```text
{"contract_version":"2","conversation":{"channel":"whatsapp","client_phone":"+5491155550001","external_ref":"conv-propuesta-0001"},"event_id":"evt-v2-msg-0001","event_type":"message.recorded","message":{"body_text":"Sí, tenemos stock.","direction":"outbound","external_ref":"msg-v2-0002","kind":"text","sent_at":"2026-09-16T15:00:04.500Z","sent_by":"agent"},"occurred_at":"2026-09-16T15:00:05.000Z"}
```

`payload_hash`: `c1fa8fa103c8278affb92ae410ccdf5058e8f69a872c8cd86e7791baac7b4309`.

**`conversation.escalated`**:

```json
{
  "contract_version": "2",
  "event_type": "conversation.escalated",
  "event_id": "evt-v2-escalada-0001",
  "occurred_at": "2026-09-16T12:00:10-03:00",
  "conversation": { "external_ref": "conv-propuesta-0001", "channel": "whatsapp" }
}
```

```text
{"contract_version":"2","conversation":{"channel":"whatsapp","external_ref":"conv-propuesta-0001"},"event_id":"evt-v2-escalada-0001","event_type":"conversation.escalated","occurred_at":"2026-09-16T15:00:10.000Z"}
```

`payload_hash`: `3aa0d77eae924f70a6478082c8e163057b5478557b4f6872ee7dcfe6894ad3a3`.

## Etiquetas (desde la 16.2)

[brief-16.2](../decisions/brief-16.2-etiquetas-puestas-por-el-agente.md), D-1 a D-9. Dos tipos que **solo existen en v2**: v1 está congelada y los rechaza como cualquier `event_type` desconocido (D-8). Agregarlos es un cambio compatible dentro de v2 (§Versionado).

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `event_type` | string | no | `"client.tag_added"` o `"client.tag_removed"` |
| `client.phone` | string | no | E.164, como en `client.resolved`. Es el único campo de `client`: el nombre u otro campo da `400` con `client` |
| `tag.id` | string | no | el id del CRM de la etiqueta, un uuid, leído de [`GET /api/read/v1/client-tags`](read-v1.md). Es el único campo de `tag`: por nombre da `400` con `tag` y `tag.id` (D-3) |

`event_id` y `occurred_at` siguen las reglas de los demás tipos. **El cliente tiene que existir**: el evento nunca lo crea; para eso está `client.resolved` (D-2).

**Qué hace**: pone o quita la etiqueta con **las mismas reglas que la ficha** (FR-CLI-09), en una sola función de `crm`, y lo audita como `tag_change` en el historial del cliente con la **credencial como actor**. Un cliente desactivado se puede etiquetar, como en la ficha. El emisor no crea, renombra ni desactiva etiquetas: el catálogo es del admin.

**Respuesta** (D-5): siempre `200`, sin datos del cliente ni sus etiquetas:

```json
{ "contract_version": "2", "event_id": "evt-v2-etiqueta-0001", "result": "accepted" }
```

- `accepted`: el estado pedido se cumple. Poner una que el cliente ya tiene, o quitar una que no tiene, es `accepted` sin escritura ni auditoría. **Ese caso gana sobre las reglas de abajo**, como en la ficha ([brief-16.1](../decisions/brief-16.1-etiquetas-de-clientes.md), D-6): poner una que el cliente ya tiene es `accepted` aunque esté desactivada o el cliente tenga 10 (revisión independiente de la 16.2.1, hallazgo 1).
- `duplicate`: el reenvío idéntico, sin leer ni escribir.

**Reglas de negocio** (D-6): `422 BUSINESS_RULE_VIOLATION`, **terminales**, con la regla en `rule` y en `error_code`; un reenvío responde la misma regla, aunque ya se cumpla. *Aclarado el 2026-10-12 en la 19.4.3*: `rule` es el campo de la respuesta, cuyo cuerpo es `{ code, request_id, rule }`; `error_code` es la columna de `ingestion_events` donde el CRM la guarda, no un campo de la respuesta:

| `rule` | Cuándo |
|---|---|
| `client_not_found` | el teléfono no es de ningún cliente de la organización |
| `tag_not_found` | la etiqueta no existe o es de otra organización; o, **al poner**, está desactivada. Quitar una desactivada que el cliente tiene se acepta, como en la ficha |
| `client_tag_limit` | al poner, el cliente ya tiene 10 etiquetas |

Lo que hace el emisor ante un `422` es lo de la guía: no reenvía el mismo `event_id`; corrige la causa y manda un evento nuevo. Ante `tag_not_found`, la causa suele ser un catálogo que cambió: vuelve a leer `GET /api/read/v1/client-tags`.

**Orden con `client.resolved`**: un cliente nuevo existe recién cuando su `client.resolved` respondió. Un evento de etiqueta que se manda antes, o en paralelo, puede terminar en `client_not_found`, que es terminal. El emisor espera la respuesta de `client.resolved` antes de etiquetar a ese cliente (revisión independiente de la 16.2.1, duda 3).

**El `tag.id` va en minúsculas, tal como lo devuelve la lectura.** El validador acepta un uuid en mayúsculas y la etiqueta es la misma, pero el contenido no: el mismo `event_id` con otra capitalización da `409 event_payload_mismatch`, como cualquier contenido distinto (revisión independiente de la 16.2.1, duda 4).

**No cuentan en la métrica 12** (D-9): no son mensajes ([MetricsCatalog](../analytics/MetricsCatalog.md) §12).

**`client.tag_added`**:

```json
{
  "contract_version": "2",
  "event_type": "client.tag_added",
  "event_id": "evt-v2-etiqueta-0001",
  "occurred_at": "2026-09-16T12:00:12-03:00",
  "client": { "phone": "+5491155550001" },
  "tag": { "id": "5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f" }
}
```

```text
{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-etiqueta-0001","event_type":"client.tag_added","occurred_at":"2026-09-16T15:00:12.000Z","tag":{"id":"5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f"}}
```

`payload_hash`: `43304fcc44dc4edf9c13b22467835e922eb16d6ed6ac7f5af60af8ada94b84d8`.

**`client.tag_removed`**, la misma etiqueta:

```text
{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-etiqueta-0002","event_type":"client.tag_removed","occurred_at":"2026-09-16T15:00:14.000Z","tag":{"id":"5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f"}}
```

`payload_hash`: `c2f240f686edbefd11e66c132ea51af6e0fd66e9f3c3c32ba135ff5ac03b7ef2`. Los dos hashes se calcularon sobre este texto, escrito a mano, con `sha256sum`.

## Pedidos (desde la 19.4)

[brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), D-1 a D-13; [ADR 0020](../decisions/0020-el-pedido.md), punto 9. Un tipo que **solo existe en v2**: v1 está congelada y lo rechaza como cualquier `event_type` desconocido. Agregarlo es un cambio compatible dentro de v2 (§Versionado).

**Qué hace**: deja un pedido **pendiente** a nombre del cliente, con el número `P-000123` de la organización, **la credencial como actor** y el evento que lo creó guardado en el pedido. **El emisor nunca lo confirma, lo entrega ni lo cancela**, y nunca registra un cobro: eso lo hace una persona desde la app. Cuándo mandarlo lo decide el emisor; el agente informó que lo manda en el turno siguiente al «sí» del cliente a un resumen cerrado.

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `event_type` | string | no | `"order.placed"` |
| `client.phone` | string | no | E.164, como en las etiquetas. Es el único campo de `client` |
| `lines` | arreglo | no | de **1 a 10** líneas, sin repetir un producto. Un producto repetido es un defecto del emisor, que suma las cantidades en una línea, y da `400` (D-3) |
| `lines[].product_id` | string | no | el id del CRM del producto, un uuid, leído de la [lectura](read-v1.md). En minúsculas, como lo devuelve la lectura |
| `lines[].quantity` | string | no | un decimal **en texto**, nunca un número de JSON: mayor que cero, con punto y hasta tres decimales, sin ceros a la izquierda y hasta `99999999999.999`, como `quantity_available` de la lectura |

**El `product_id` va en minúsculas, tal como lo devuelve la lectura** (revisión independiente de la 19.4.1, R-5). El validador acepta un uuid en mayúsculas y el producto es el mismo, pero el contenido no: el mismo `event_id` con otra capitalización da `409 event_payload_mismatch`, como en las etiquetas.

**Sin precios**: el CRM copia el precio vigente de cada producto al crear el pedido, y nunca lo recalcula. Un campo de más en una línea, como un precio, da `400` con `lines`. Todo `400` dentro de las líneas nombra el campo `lines`, sin la posición. `event_id` y `occurred_at` siguen las reglas de los demás tipos. **El cliente tiene que existir**: el evento nunca lo crea; para eso está `client.resolved`, y vale el mismo orden que en las etiquetas (§Etiquetas).

**No mira el stock** (D-8): un pendiente no reserva nada, así que se acepta aunque no alcance. Lo frena, si corresponde, la confirmación de la persona. «Anotado» no es «reservado».

**Un pendiente igual a otro se acepta** (D-9): dos eventos con las mismas líneas, con dos `event_id` distintos, crean dos pedidos. Una persona los ve en la lista con su origen y cancela uno.

**Respuesta** (D-6): siempre `200`, con el número y nada más del pedido:

```json
{ "contract_version": "2", "event_id": "evt-v2-pedido-0001", "result": "accepted", "order": { "number": "P-000001" } }
```

- `accepted`: el pedido quedó creado.
- `duplicate`: el reenvío idéntico, **con el mismo número**, sin escribir. `order` sería `null` solo si el evento procesado no tuviera pedido, lo que no pasa: el pedido y el estado del evento se escriben en la misma transacción.

**Reglas de negocio** (D-6): `422 BUSINESS_RULE_VIOLATION`, **terminales**, con **una sola** regla en `rule` y en `error_code`; un reenvío responde la misma, aunque ya se cumpla. *Aclarado el 2026-10-12 en la 19.4.3*, a partir de una pregunta del agente: el cuerpo es `{ "code": "BUSINESS_RULE_VIOLATION", "request_id": "…", "rule": "…" }`, y `error_code` es la columna de `ingestion_events` donde el CRM guarda la regla, no un campo de la respuesta. Un rechazo no crea el pedido ni consume un número.

| `rule` | Cuándo |
|---|---|
| `client_not_found` | el teléfono no es de ningún cliente de la organización |
| `client_inactive` | el cliente está desactivado |
| `product_not_found` | un producto no existe, es de otra organización o está inactivo, **sin distinguir**, como el `404` de la lectura |
| `product_without_price` | un producto no tiene precio vigente |
| `currency_mismatch` | los precios de las líneas están en monedas distintas: un pedido tiene una sola, la de su primera línea |
| `amount_out_of_range` | el total de una línea redondea a cero, o una línea o el total no caben en `numeric(14, 2)` |

*Nota del 2026-10-22, 29.8* ([brief-29.8](../decisions/brief-29.8-el-catalogo-del-rubro-para-el-agente.md), H-8), sin cambiar la conducta: este documento no lo decía, pero desde la 29.5 **`product_not_found` incluye un producto que se lleva por unidad** (un equipo con su IMEI), y desde la 29.6, **un producto de servicio** (brief-29.5, D-7; brief-29.6, D-5). El código lo hacía y lo probaba; el documento había quedado atrás. Pedir un producto por unidad es `order.placed_with_units` (§Pedidos con unidades).

**Precedencia**: primero el cliente; después las líneas en su orden, y dentro de cada línea las reglas en el orden de la tabla. Se responde la primera que falla.

**Qué hace el emisor ante un `422`** (D-10): lo de la guía (no reenvía el mismo `event_id`) y, como el cliente ya escuchó que su pedido quedó anotado, **deriva la conversación** con `conversation.escalated`, para que una persona lo vea en la app. El CRM no guarda el contenido rechazado.

**No cuenta en la métrica 12** (D-13): no es un mensaje ([MetricsCatalog](../analytics/MetricsCatalog.md) §12).

**`order.placed`**:

```json
{
  "contract_version": "2",
  "event_type": "order.placed",
  "event_id": "evt-v2-pedido-0001",
  "occurred_at": "2026-09-16T12:00:16-03:00",
  "client": { "phone": "+5491155550001" },
  "lines": [
    { "product_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "quantity": "2" },
    { "product_id": "9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d", "quantity": "1.5" }
  ]
}
```

```text
{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-pedido-0001","event_type":"order.placed","lines":[{"product_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","quantity":"2"},{"product_id":"9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d","quantity":"1.5"}],"occurred_at":"2026-09-16T15:00:16.000Z"}
```

`payload_hash`: `9c312d278d0e5a3fb0d212270a8940fe75cae1e169b7bf3b6059d753e5f49fab`, calculado sobre este texto, escrito a mano, con `sha256sum`. Las líneas conservan el orden en que llegan: otro orden es otro contenido.

## Pedidos con unidades (desde la 29.8)

[brief-29.8](../decisions/brief-29.8-el-catalogo-del-rubro-para-el-agente.md), D-7 y U-2; [ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 15. Un tipo que **solo existe en v2**, compatible dentro de v2 (§Versionado). **`order.placed` no cambia**: sigue rechazando un producto por unidad como `product_not_found`.

**Qué hace**: lo mismo que `order.placed` (§Pedidos), con una diferencia: **una línea puede traer las unidades que eligió el cliente**, por su `unit_id`, leído de la ruta de unidades de [read-v3](read-v3.md). Deja un pedido **pendiente**, con las unidades guardadas en el pedido, **sin reservarlas**.

**Cuándo usarlo**: el agente informó que lo manda solo cuando el pedido tiene al menos una línea de unidades, y que un pedido solo de cantidades sigue por `order.placed`. Los dos caminos valen: este tipo acepta también un pedido solo de cantidades.

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `event_type` | string | no | `"order.placed_with_units"` |
| `client.phone` | string | no | E.164, como en `order.placed` |
| `lines` | arreglo | no | de **1 a 10** líneas, sin repetir un producto. **Cada línea es de un tipo**: de cantidad o de unidades. Una con los dos campos, o con ninguno, da `400` con `lines` |
| línea de cantidad | objeto | no | `{product_id, quantity}`, con las reglas de `order.placed`. Para un producto que se lleva por cantidad |
| línea de unidades | objeto | no | `{product_id, unit_ids}`: de **1 a 10** uuid, sin repetir en la línea, también con otra capitalización. Para un producto que se lleva por unidad. **La cantidad de la línea es la cuenta de ids** |

**Sin precios**, como en `order.placed`:
- el CRM copia al crear el pedido **el precio de cada unidad**: el propio, o el del producto si no tiene uno;
- cada unidad se redondea como una línea de cantidad 1, y el monto de la línea es la suma.

**Reglas de negocio**: las de `order.placed`, con dos nuevas.

| `rule` | Cuándo |
|---|---|
| `client_not_found` | como en `order.placed` |
| `client_inactive` | como en `order.placed` |
| `product_not_found` | como en `order.placed`, pero **un producto por unidad sí se acepta**. Un producto de servicio sigue fuera |
| `product_without_price` | como en `order.placed` |
| `unit_tracking_mismatch` | una línea de cantidad para un producto que se lleva por unidad, o una de unidades para uno que se lleva por cantidad |
| `unit_not_available` | una unidad no existe, es de otro producto o de otra organización, o **ya no está disponible**: reservada, en revisión, en reparación, vendida o dada de baja. **Sin distinguir** |
| `currency_mismatch` | como en `order.placed`, y además una unidad con precio propio en otra moneda que el pedido |
| `amount_out_of_range` | como en `order.placed`, para la línea de cantidad o para cada unidad |

**Precedencia**: la de `order.placed`. Primero el cliente; después las líneas en su orden, y dentro de cada línea las reglas en el orden de la tabla. Se responde la primera que falla. **Un rechazo no crea el pedido ni consume un número**, y un reenvío responde la misma regla.

**No reserva** ([ADR 0020](../decisions/0020-el-pedido.md); ADR 0024, punto 15, R-10):
- dos pendientes pueden pedir la misma unidad, y los dos se aceptan;
- la persona que confirma el primero la reserva, y confirmar el segundo falla porque la unidad ya no está disponible;
- **el emisor nunca dice «te la reservo» ni «es tuya»**: es una solicitud que confirma el local.

**Respuesta**: la de `order.placed`, `{result, order: {number}}`. El reenvío idéntico es `duplicate`, con el mismo número.

**Qué hace el emisor ante un `422`**: lo de `order.placed`, **deriva la conversación** con `conversation.escalated`. El agente informó que guarda en la propuesta los `unit_id` que leyó en ese turno, así que una unidad vendida entre el resumen y el «sí» del cliente llega como `unit_not_available`.

**No cuenta en la métrica 12**: no es un mensaje ([MetricsCatalog](../analytics/MetricsCatalog.md) §12).

**`order.placed_with_units`**:

```json
{
  "contract_version": "2",
  "event_type": "order.placed_with_units",
  "event_id": "evt-v2-pedido-unidades-0001",
  "occurred_at": "2026-09-16T12:00:18-03:00",
  "client": { "phone": "+5491155550001" },
  "lines": [
    { "product_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "unit_ids": ["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"] },
    { "product_id": "9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d", "quantity": "1" }
  ]
}
```

```text
{"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-pedido-unidades-0001","event_type":"order.placed_with_units","lines":[{"product_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","unit_ids":["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"]},{"product_id":"9b2f4d1a-6c3e-4f8a-b5d7-2e1c0a9f8b6d","quantity":"1"}],"occurred_at":"2026-09-16T15:00:18.000Z"}
```

`payload_hash`: `5223e47c7c08f334e8017421fe57cd0a8bd39b5d28ca3cec53f8854224f45d2d`, calculado sobre este texto con SHA-256, y fijado como vector en `contract-v2.test.ts`. **Los ids de las unidades conservan el orden en que llegan**: otro orden es otro contenido.

## Turnos (desde la 29.10.2)

[brief-29.10.2](../decisions/brief-29.10.2-los-turnos-para-el-agente.md), D-3 y A-2; [ADR 0024](../decisions/0024-rubros-y-capacidades.md), puntos 12 y 15. Un tipo que **solo existe en v2**, compatible dentro de v2 (§Versionado).

**Qué hace**: deja un turno **pedido** (`requested`) para visitar el local, a nombre del cliente, con **la credencial como autor** y el evento que lo creó guardado en el turno. El turno **ocupa su franja** desde ese momento. **El emisor nunca lo confirma, lo cancela, lo mueve ni lo marca**: eso lo hace una persona desde la app.

**Cuándo mandarlo**: el agente informó que lo manda como el pedido, en el turno siguiente al «sí» del cliente a un resumen cerrado, con la franja y el motivo que leyó en el turno del resumen.

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `event_type` | string | no | `"appointment.requested"` |
| `client.phone` | string | no | E.164, como en `order.placed`. Es el único campo de `client`. El cliente tiene que existir: `client.resolved` va antes |
| `appointment.reason_id` | string | no | un `reason_id` de [`GET /api/read/v3/appointment-slots`](read-v3.md), en minúsculas |
| `appointment.starts_at` | string | no | el `starts_at` de una franja de esa lectura, **tal como vino**. Sigue las reglas de fecha de `occurred_at`, pero puede estar en el futuro |
| `appointment.product_id` | string | se omite | opcional: un producto de `read-v3`, por ejemplo el equipo que el cliente quiere ver |
| `appointment.unit_id` | string | se omite | opcional: una unidad de la ruta de unidades de `read-v3`. **Nunca junto con `product_id`**: los dos dan `400` con `appointment` |

- **Sin nota ni fin**: un campo de más dentro de `appointment` da `400` con `appointment`. El fin lo pone el CRM con la duración vigente.
- **`starts_at` se normaliza a UTC en el `payload_hash`**, como `occurred_at`: el mismo instante con otro desplazamiento es el mismo contenido.

**Respuesta**: siempre `200`, con la franja y nada más, sin el id del turno ni el del cliente:

```json
{ "contract_version": "2", "event_id": "evt-v2-turno-0001", "result": "accepted", "appointment": { "starts_at": "2026-09-18T15:00:00-03:00", "ends_at": "2026-09-18T15:30:00-03:00" } }
```

`duplicate` es el reenvío idéntico, con la misma franja y sin escribir.

**Reglas de negocio**: `422 BUSINESS_RULE_VIOLATION`, **terminales**, con una sola `rule`, en este orden de precedencia; se responde la primera que falla. **Un rechazo no escribe el turno**, y un reenvío responde la misma regla aunque la franja se haya liberado.

| `rule` | Cuándo |
|---|---|
| `not_offered` | la organización no tiene la capacidad `appointments`, o no tiene duración y cupo |
| `client_not_found` | el teléfono no es de ningún cliente de la organización |
| `client_inactive` | el cliente está desactivado |
| `reason_not_found` | el motivo no existe, es de otra organización o está inactivo, **sin distinguir** |
| `reference_not_found` | el producto o la unidad no existe, es de otra organización, está inactivo o dado de baja, sin distinguir |
| `client_has_pending_request` | el cliente ya tiene **un turno pedido que no empezó**: uno por cliente. Uno confirmado no cuenta |
| `outside_hours` | `starts_at` no es el inicio de una franja vigente en la hora local del negocio, o cae en la hora que falta del horario de verano |
| `in_the_past` | la franja ya empezó |
| `too_soon` | empieza en menos de **2 horas** |
| `too_far` | empieza más de **14 días** después de hoy, en la fecha del negocio |
| `slot_full` | la franja no tiene lugar al momento del pedido: la lectura no reserva |

**Qué hace el emisor ante un `422`**: lo de la guía (no reenvía el mismo `event_id`) y **deriva la conversación** con `conversation.escalated`, ante **cualquier** regla, como con `order.placed`. El agente manda el evento después de responderle al cliente, así que el cliente ya escuchó que su turno quedó pedido; una persona del local le ofrece otra franja (A-2). Las reglas finas quedan para el diagnóstico, en `ingestion_events.error_code`.

**Lo que el emisor dice**: «te lo pedimos; el local te lo confirma». Nunca «te espero», «quedó agendado» ni «confirmado». **El CRM no avisa**: no manda mensajes.

**No cuenta en la métrica 12**: no es un mensaje ([MetricsCatalog](../analytics/MetricsCatalog.md) §12).

**`appointment.requested`**:

```json
{
  "contract_version": "2",
  "event_type": "appointment.requested",
  "event_id": "evt-v2-turno-0001",
  "occurred_at": "2026-09-16T12:00:20-03:00",
  "client": { "phone": "+5491155550001" },
  "appointment": {
    "reason_id": "3c5e7a9b-1d2f-4a6b-8c0d-2e4f6a8b0c1d",
    "starts_at": "2026-09-18T15:00:00-03:00",
    "product_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"
  }
}
```

```text
{"appointment":{"product_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","reason_id":"3c5e7a9b-1d2f-4a6b-8c0d-2e4f6a8b0c1d","starts_at":"2026-09-18T18:00:00.000Z"},"client":{"phone":"+5491155550001"},"contract_version":"2","event_id":"evt-v2-turno-0001","event_type":"appointment.requested","occurred_at":"2026-09-16T15:00:20.000Z"}
```

`payload_hash`: `90d9c7f4e6a9e8e6d42cde8de08199fab246529bbd9dbb40f68d3fac62097eef`, calculado sobre este texto, escrito a mano, con `sha256sum`, y fijado como vector en `contract-v2.test.ts`.

## Respuestas

- **Éxito y reenvío**: las formas y los códigos de v1 para cada evento, con `"contract_version": "2"`. `message.recorded` responde `201` al aceptar y `200` al reenvío; los otros tres, desde la 16.2 los dos de etiquetas, desde la 19.4 el pedido, desde la 29.8 el pedido con unidades y desde la 29.10.2 el turno pedido, siempre `200`.
- **Errores**: la tabla de v1, con dos diferencias: el campo `correlation_id` en `VALIDATION_ERROR` y el `reason` del `409`.

### `CONFLICT` con motivo (brief-12.3, D-7)

El cuerpo del `409` es `{ "code": "CONFLICT", "request_id", "reason" }`.

| `reason` | Qué pasó | ¿Se perdió el mensaje? | ¿Queda en `ingestion_events`? |
|---|---|---|---|
| `event_payload_mismatch` | mismo `event_id`, otro contenido. También el mismo `event_id` enviado antes por v1 | **puede**: el CRM guardó el primero | no se modifica el registro existente |
| `message_already_recorded` | el mensaje ya está en la conversación, llegado con otro `event_id` | **no**: ya está guardado | sí, `failed` con `error_code = 'message_already_recorded'` |
| `conversation_ref_taken` | solo `conversation.resolved`: la referencia propuesta ya es de otra conversación (vencida, cerrada o de otro cliente) | **sí, si el emisor no reintenta** | sí, `failed` con `error_code = 'conversation_ref_taken'` |

**Un reenvío responde el mismo `reason`**, porque queda guardado en `error_code` (enmienda de D-7, decisión del usuario del 2026-09-25). Los eventos de v1 siguen guardando `CONFLICT`. La métrica 12 los cuenta igual que antes, agrupados por ese código.

## Guía para el emisor (brief-12.3, D-7)

**Lo que el CRM garantiza**: un reenvío **idéntico** (mismo `event_id` y mismo contenido) nunca pierde ni duplica un mensaje, cualquiera sea el resultado del primero. **Lo que no garantiza**: un mensaje que el emisor deja de reenviar. Cuántas veces reintenta y qué hace mientras tanto lo decide el emisor.

- **`event_id` estable por hecho**: se deriva de la identidad del mensaje en el canal y del tipo de evento, nunca del teléfono ni del contenido. El mismo hecho siempre lleva el mismo `event_id`, y dos hechos distintos, dos distintos.
- **Contenido reproducible**: todo el cuerpo se deriva del hecho, incluido `occurred_at`, que sale del momento del mensaje o del envío y nunca del reloj del emisor al armar el pedido. Si el reenvío lleva otro contenido bajo el mismo `event_id`, el CRM responde `409 event_payload_mismatch` y el reenvío deja de ser seguro. *Agregado el 2026-09-27 por la 12.3.3, a partir de un hallazgo del emisor (H-1), con la aprobación del usuario.*
- **Una correlación por turno**, en `X-Correlation-Id`, sin datos personales: permite encontrar en el log del CRM todos los pedidos de ese turno.
- **Identificadores sin datos personales**: `event_id`, `conversation.external_ref` y `message.external_ref` no llevan el teléfono, ni en claro ni codificado. Eso excluye el `wamid` crudo de la API oficial de WhatsApp, que según su formato conocido públicamente lleva el teléfono codificado en base64 (no verificado en este proyecto), y el `remoteJid` de una conexión por dispositivo vinculado (`<número>@s.whatsapp.net`). El emisor deriva cada identificador con un hash con clave propia del identificador del canal, por ejemplo `wa-msg-<HMAC-SHA256 del wamid>`, que es estable para el mismo hecho y no se puede revertir sin la clave. El motivo: el CRM guarda `event_id` en `ingestion_events`, cuya identidad nadie puede modificar, y un pedido de borrado no la alcanza ([brief-13.4](../decisions/brief-13.4-retencion-y-borrado.md), H-4). **El CRM no lo valida**: rechazarlo cambiaría una respuesta y exigiría v3 (§Versionado). *Agregado el 2026-10-01 por la 13.4, con la aprobación del usuario (opción A1 de H-4).*

| Respuesta | Qué significa | Qué hace el emisor |
|---|---|---|
| `200` o `201` | procesado, o reenvío de uno ya procesado (`duplicate`, con los mismos datos) | sigue |
| sin respuesta (timeout) o conexión caída | no se sabe si el CRM confirmó | reenvía el **mismo** evento. Si ya había confirmado, recibe `duplicate` con los mismos datos |
| `500 INTERNAL` | el CRM no confirmó nada: la reserva se revirtió | reenvía el **mismo** evento |
| `429 RATE_LIMITED` | no se procesó | espera `Retry-After` y reenvía el mismo evento |
| `409` con `message_already_recorded` | el mensaje ya está guardado | lo trata como guardado |
| `409` con `conversation_ref_taken` | el mensaje **no** se guardó | reenvía con una referencia propuesta **y** un `event_id` nuevos |
| `409` con `event_payload_mismatch` | el emisor armó dos contenidos con el mismo `event_id` | **alerta**: es un defecto del emisor, y el segundo contenido no se guardó |
| `400 VALIDATION_ERROR` | el evento o la correlación son inválidos | no reenvía el mismo: corrige y manda uno nuevo |
| `401`, `403` o `404` | credencial, alcance, allowlist o endpoint apagado | no reenvía hasta corregir la configuración: **retiene** el evento, avisa y lo reenvía igual cuando la configuración se corrige. **Nunca lo descarta** |
| `422 BUSINESS_RULE_VIOLATION` | una regla de negocio, con `rule`; es **terminal** | no reenvía el mismo `event_id`: corrige la causa y manda un evento nuevo. *Desde la 19.4*, ante un `422` de `order.placed`, además deriva la conversación (§Pedidos); *desde la 29.8*, también ante uno de `order.placed_with_units` (§Pedidos con unidades); *desde la 29.10.2*, también ante uno de `appointment.requested` (§Turnos) |

*Aclarado el 2026-09-27 por la 12.5* ([brief-12.5](../decisions/brief-12.5-turno-completo-en-staging.md), a partir del hallazgo H-5 del emisor, con la aprobación del usuario). La fila de `401`, `403` y `404` decía solo «no reenvía hasta corregir la configuración». Se leyó como «el evento se descarta», y con esa lectura, **apagar la ingestión para mantenimiento hace perder mensajes**. No es lo que quería decir:

- un error de configuración **detiene el envío, no el evento**. El emisor lo guarda en un lugar durable, avisa a una persona y lo reenvía, **idéntico**, cuando la ruta vuelve a aceptarlo. Un reenvío idéntico nunca duplica (§Lo que el CRM garantiza);
- mientras tanto puede volver a probar con una espera creciente. **Mientras la ingestión esté apagada**, el CRM responde `404` sin cuerpo, sin distinguir el mantenimiento de una ruta que no existe. Es a propósito: la ruta apagada no se deja ver;
- **perder un evento por una credencial mal cargada es tan grave como perderlo por un apagón**. Por eso la regla vale para los tres códigos.

Las respuestas del CRM no cambian: es una aclaración de la guía, no un cambio de contrato.

## Proyección

La de v1, con dos columnas más en `messages` ([DataModel](../architecture/DataModel.md)):
- **`kind`**: el de `message.kind`;
- **`sent_by`**: el de `message.sent_by` en una salida, y `null` en una entrada, garantizado por el `CHECK messages_sent_by_only_outbound`.

Un mensaje de v1 queda con los dos en `null`, que significa «sin dato». **La conversación vigente, las reglas de negocio y la derivación no cambian**: son las de la 12.2.

## Versionado

Las reglas de v1: agregar un `event_type` o un canal que el modelo admita es compatible dentro de v2, y agregar, quitar o renombrar campos, o cambiar reglas o respuestas, exige v3. **v1 y v2 conviven** hasta que ningún emisor use v1. Cuándo se retira v1 se decide cuando el agente use v2 en producción (Fase 13).

## Evidencia

- **Validado localmente y en CI** (`deterministic`), con requests sintéticos:
  - `src/modules/ingestion/contract-v2.test.ts`: los cuatro vectores (seis desde la 16.2) comparados con su texto canónico, cada regla nueva, las heredadas de v1 y los fixtures de `tests/fixtures/ingestion/v2/`, con `"shape": "assumed"` o, desde la 12.3.3, `"captured"`;
  - `tests/integration/ingestion-v2.test.ts`, contra PostgreSQL real: la migración `0023` y su `CHECK`, `messages` todavía de solo inserción, v1 guardando `null`, el turno completo con tipo y autor, los bordes de la vigencia por v2, los tres motivos del `CONFLICT` y su reenvío, lo que afirma la guía (reenvío idéntico, reversión ante un error inesperado, `422` terminal) y el aislamiento;
  - `tests/integration/ingestion-v2-http.test.ts`: las respuestas de v2, el `409` con motivo y el de v1 sin él, la correlación en cada respuesta y en el log (también en el `429` y el `500`), la correlación inválida sin consumir el límite, el límite compartido con v1, la cadena de rechazos y el log sin secretos;
  - `tests/e2e/conversations.spec.ts`, caso 11: el rótulo de tipo y autor en la pantalla 9.
- **Validado en staging** (12.3.2): el borde real con requests sintéticos, en [evidencia-12.3](../decisions/evidencia-12.3-ingestion-v2.md).
- **Validado en integración** (12.3.3, O-35): la autenticación y el validador con el tráfico del agente, cruzados con el log, las filas, el `payload_hash` y el dashboard, en la misma evidencia.
- **Etiquetas, desde la 16.2** (`deterministic`): `contract-v2.test.ts` con los dos vectores y la validación; `client-tags-ingestion.test.ts`, contra PostgreSQL real, con las tres reglas, los reenvíos, el actor, la concurrencia con la ficha y el aislamiento; `analytics-ingestion.test.ts`, fuera de la métrica 12. Fixtures de forma asumida. **Validado en integración** con el agente como emisor real, en la ventana 16.2.3 de la organización de demostración de producción ([brief-16.2](../decisions/brief-16.2-etiquetas-puestas-por-el-agente.md), §Resultados 16.2.3).
- **Pedido del agente, desde la 19.4** (`deterministic`): `contract-v2.test.ts` con el vector y cada `400` de las líneas; `orders-agent.test.ts`, contra PostgreSQL real, con la proyección, el reenvío con el mismo número, cada regla con su precedencia, la concurrencia con la desactivación y el cambio de precio, y el aislamiento; `ingestion-v2-http.test.ts` con las respuestas; `analytics-ingestion.test.ts`, fuera de la métrica 12. Fixtures de forma asumida. **Validado en integración** con el agente como emisor real, en la ventana 19.4.3 de la organización de demostración de producción (2026-10-12): un pedido aceptado (`P-000004`), su reenvío `duplicate` con el mismo número, un `422 product_not_found` sin consumir un número y su `conversation.escalated`, conciliados contra `ingestion_events`, `orders`, `order_lines`, la auditoría y el journal ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), §La conciliación del pedido). Dos capturas: `captured-order-placed.json` y `captured-order-placed-rejected.json`, con el teléfono reemplazado por uno sintético. **Sin validar con el emisor real**: `client_inactive`, `currency_mismatch` y `amount_out_of_range`, y un pedido de más de una línea.
- **Pedido con unidades, desde la 29.8** (`deterministic`):
  - `contract-v2.test.ts`: el vector, cada `400` de las líneas y que `order.placed` no admite una línea de unidades;
  - `orders-agent-units.test.ts`, contra PostgreSQL real: el pendiente con sus unidades sin reservarlas, el precio de cada una, el reenvío con el mismo número, la auditoría sin el IMEI, cada regla nueva con su precedencia y sin consumir un número, los dos pendientes con la misma unidad y la segunda confirmación que falla, y `order.placed` que sigue rechazando el producto por unidad;
  - `analytics-ingestion.test.ts`, fuera de la métrica 12;
  - fixtures de forma asumida.

  **Sin validar con el emisor real**: todo, hasta la ventana de la 29.8.
- **Sin validar**: un turno que haya recorrido la cadena real del agente, la referencia que el CRM devuelve distinta de la propuesta, y los dos `409` con el emisor real.
