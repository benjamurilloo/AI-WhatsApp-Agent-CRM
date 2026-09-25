# Contrato de ingestión v1

**Estado**:
- **Diseñado** en la 6.5.1 ([brief-6.5.1](../decisions/brief-6.5.1-contrato-de-ingestion.md)).
- **Implementado y validado localmente** en la 6.5.1, solo en su validación del payload y su `payload_hash`: [src/modules/ingestion/contract.ts](../../src/modules/ingestion/contract.ts).
- **Implementado y validado localmente** en la 6.5.2 ([brief-6.5.2](../decisions/brief-6.5.2-registro-idempotente-y-proyeccion.md)): el registro, los reenvíos y la proyección, como caso de uso sin HTTP (`recordIngestionEvent`).
- **Implementado y validado localmente** en la 6.5.3 ([brief-6.5.3](../decisions/brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md)): el endpoint, la credencial de servicio, el límite de tasa y el modo de prueba, con requests sintéticos.
- **Implementado y validado localmente** en la 12.1.2 ([brief-12.1](../decisions/brief-12.1-actor-de-servicio-y-cliente-por-telefono.md)): el evento `client.resolved`, con requests sintéticos.

**Ningún emisor real está conectado ni configurado** (FR-CONV-05, [IntegrationBoundaries](../architecture/IntegrationBoundaries.md)). Este contrato no deriva de la forma de eventos de ningún sistema existente. Sus fixtures tienen **forma asumida, no verificada**, y no prueban compatibilidad con ningún emisor.

## Propósito

Permitir que un sistema externo registre en el CRM los mensajes de sus conversaciones y, *desde la 12.1*, resuelva el cliente de un teléfono, sin conocer el modelo interno y sin crear duplicados cuando reintenta.

## Transporte

- **Endpoint**: `POST /api/ingestion/v1/events`. La versión va en la ruta; una versión nueva es otra ruta.
- **Cuerpo**: un solo evento en JSON UTF-8, con `Content-Type: application/json`. No hay lotes.
- **Tamaño máximo**: 64 KiB (`MAX_INGESTION_BODY_BYTES`). Alcanza para un cuerpo de mensaje de 4096 caracteres aunque el emisor los escriba como escapes `\uXXXX`. Si el cuerpo lo supera, la respuesta es `VALIDATION_ERROR` con el campo `body`.
- **Autenticación**: `Authorization: Bearer <token>`, con una credencial de servicio por organización y emisor, distinta de la sesión humana. El token es `crm_ing_` seguido de 32 bytes aleatorios en base64url; el CRM guarda solo su SHA-256 (brief-6.5.3, D-1 y D-2). De la credencial salen la organización y el `source` del evento (D-3). El payload no los trae y no puede cambiarlos. El endpoint no lee cookies: una sesión del CRM no lo autentica (brief-6.5.3, D-5). *Agregado el 2026-09-24 ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md), D-2)*: cada credencial tiene un alcance, y este endpoint exige `ingest`. Una credencial de la API de lectura (`read`, token `crm_read_`) responde `FORBIDDEN` sin consumir el límite.
- **`Content-Type`**: `application/json`, con `charset=utf-8` o sin `charset`. Otro tipo, o bytes que no son UTF-8, responden `VALIDATION_ERROR` con el campo `body`.
- **Límite de tasa**: 120 requests por minuto por credencial, en ventanas fijas de un minuto; en el borde entre dos ventanas pueden pasar hasta el doble (brief-6.5.3, D-3).
- **Modo de prueba**: el endpoint responde `404` sin cuerpo salvo que la configuración lo encienda, y encendido solo acepta las credenciales de una allowlist (brief-6.5.3, D-4).
- **Orden de las comprobaciones**: modo de prueba, credencial, allowlist, límite de tasa, cuerpo y evento. Un rechazo anterior al límite no lo consume.

## Evento `message.recorded`

Cada evento registra un mensaje de una conversación. La conversación no se crea con un evento aparte: nace con su primer mensaje (D-2). El objeto es estricto: un campo desconocido, en cualquier nivel, rechaza el evento.

| Campo | Tipo | Nulable | Reglas | Ejemplo |
|---|---|---|---|---|
| `contract_version` | string | no | exactamente `"1"` | `"1"` |
| `event_type` | string | no | `"message.recorded"` para este evento. Desde la 12.1 existe también `"client.resolved"` (ver abajo); cualquier otro tipo se rechaza | `"message.recorded"` |
| `event_id` | string | no | referencia opaca (ver abajo); identidad del evento | `"evt-0001"` |
| `occurred_at` | string | no | fecha (ver abajo); cuándo el emisor produjo el evento | `"2026-09-16T11:59:58-03:00"` |
| `conversation` | objeto | no | | |
| `conversation.external_ref` | string | no | referencia opaca; identifica la conversación en el emisor | `"conv-0001"` |
| `conversation.channel` | string | no | `"whatsapp"` | `"whatsapp"` |
| `conversation.client_phone` | string | sí | E.164 canónico (`^\+[1-9][0-9]{1,14}$`), sin separadores; el CRM no lo normaliza | `"+5491155550001"` |
| `message` | objeto | no | | |
| `message.external_ref` | string | no | referencia opaca; identifica el mensaje en su conversación | `"msg-0001"` |
| `message.direction` | string | no | `"inbound"` (del cliente) o `"outbound"` (del negocio) | `"inbound"` |
| `message.sent_at` | string | no | fecha (ver abajo) | `"2026-09-16T11:59:57.250-03:00"` |
| `message.body_text` | string | sí | de 1 a 4096 puntos de código, sin el carácter NUL; `null` si el mensaje no tiene texto | `"Hola, ¿tienen stock?"` |

- **Referencias opacas**: `event_id` y los `external_ref`:
  - tienen de 1 a 200 caracteres;
  - no tienen espacios al principio ni al final;
  - no tienen caracteres de control;
  - son UTF-16 válido.

  El CRM no las interpreta. Nunca se arman con un teléfono ni con el contenido del mensaje, y no cambian entre reintentos.
- **Fechas**: ISO 8601 con zona obligatoria (`Z` o `±HH:MM`), segundos obligatorios y, como máximo, milisegundos. La fecha tiene que existir (no se acepta el 30 de febrero). Ni `occurred_at` ni `sent_at` pueden superar en más de 5 minutos la hora de recepción. El CRM las guarda en UTC.
- **Texto**: el cuerpo se guarda tal cual, con marcado, saltos de línea y emojis. La UI siempre lo muestra escapado (6.4).
- **Fuera de v1**: adjuntos, mensajes sin texto que necesiten otro tratamiento, estados de entrega, lecturas, otros canales, lotes y cambios de estado de la conversación.

Ejemplo, el vector de prueba:

```json
{
  "contract_version": "1",
  "event_type": "message.recorded",
  "event_id": "evt-0001",
  "occurred_at": "2026-09-16T11:59:58-03:00",
  "conversation": {
    "external_ref": "conv-0001",
    "channel": "whatsapp",
    "client_phone": "+5491155550001"
  },
  "message": {
    "external_ref": "msg-0001",
    "direction": "inbound",
    "sent_at": "2026-09-16T11:59:57.250-03:00",
    "body_text": "Hola, ¿tienen stock?"
  }
}
```

## Evento `client.resolved`

*Agregado el 2026-09-25 ([brief-12.1](../decisions/brief-12.1-actor-de-servicio-y-cliente-por-telefono.md), D-1).* Es un `event_type` nuevo dentro de v1, que §Versionado admite como cambio compatible. Tiene su propia respuesta con datos, algo que `message.recorded` no hace. Esa interpretación la aprobó el usuario con el brief.

Resuelve el cliente de un teléfono: lo devuelve si existe y lo crea si no. Usa el mismo endpoint, la misma credencial `ingest`, el mismo límite de tasa y el mismo registro de idempotencia que `message.recorded`. El objeto es estricto: un campo de `message.recorded` en un `client.resolved` lo rechaza.

| Campo | Tipo | Nulable | Reglas | Ejemplo |
|---|---|---|---|---|
| `contract_version` | string | no | exactamente `"1"` | `"1"` |
| `event_type` | string | no | `"client.resolved"` | `"client.resolved"` |
| `event_id` | string | no | referencia opaca; identidad del evento | `"evt-client-0001"` |
| `occurred_at` | string | no | fecha; como máximo 5 minutos después de la recepción | `"2026-09-16T11:59:58-03:00"` |
| `client` | objeto | no | | |
| `client.phone` | string | no | E.164 canónico (`^\+[1-9][0-9]{1,14}$`); el CRM no lo normaliza | `"+5491155550001"` |
| `client.display_name` | string | sí | de 1 a 200 caracteres, sin espacios al borde, sin caracteres de control y UTF-16 válido; se rechaza, no se recorta. `null` si el emisor no lo conoce | `"María Gómez"` |

Ejemplo, el vector de prueba:

```json
{
  "contract_version": "1",
  "event_type": "client.resolved",
  "event_id": "evt-client-0001",
  "occurred_at": "2026-09-16T11:59:58-03:00",
  "client": {
    "phone": "+5491155550001",
    "display_name": "María Gómez"
  }
}
```

## Identidad e idempotencia

- **Identidad del evento**: `(organization_id, source, event_id)`, que se guarda en `ingestion_events` como `(organization_id, source, external_ref)`. La organización y el `source` salen de la credencial (D-3). Dos emisores pueden usar el mismo `event_id` sin chocar.
- **Registro antes de proyectar**: el evento se reserva en `ingestion_events` con `INSERT … ON CONFLICT ON CONSTRAINT ingestion_events_organization_source_external_ref_unique`. La reserva y su efecto van en la misma transacción: la proyección sobre `conversations` y `messages`, o la resolución del cliente de un `client.resolved`. Con otra entrega del mismo evento en curso, la reserva espera a que termine y responde según lo que esa entrega confirmó (brief-6.5.2, D-3).
- **Segunda defensa**: las unicidades parciales de `conversations (organization_id, channel, external_ref)` y `messages (organization_id, conversation_id, external_ref)`.
- **No se depende de que el emisor deduplique**: el CRM se sostiene solo.

## `payload_hash`

Lo calcula el CRM; el emisor no lo envía (D-4).

1. Validar el cuerpo y normalizar el evento: las fechas pasan a UTC con milisegundos (`toISOString()`); el resto queda igual.
2. Serializar el evento normalizado en forma canónica: las claves de cada objeto se ordenan por código de carácter, sin espacios, y los valores se escriben con `JSON.stringify`.
3. Calcular SHA-256 de esos bytes en UTF-8 y escribirlo en hexadecimal en minúsculas (64 caracteres).

Consecuencias:
- el orden de las claves, los espacios y la zona en que se escribió una fecha no cambian el hash;
- cualquier cambio de valor sí lo cambia, incluido un espacio dentro de `body_text`;
- el hash incluye `event_id`, así que dos eventos distintos nunca comparten el hash.

**Vector de prueba**: el ejemplo de arriba se normaliza y serializa como

```text
{"contract_version":"1","conversation":{"channel":"whatsapp","client_phone":"+5491155550001","external_ref":"conv-0001"},"event_id":"evt-0001","event_type":"message.recorded","message":{"body_text":"Hola, ¿tienen stock?","direction":"inbound","external_ref":"msg-0001","sent_at":"2026-09-16T14:59:57.250Z"},"occurred_at":"2026-09-16T14:59:58.000Z"}
```

y su `payload_hash` es `529004aa199e81238af332e09262a30ec458f581188b6da0cdfa1ab53746ee2a`.

**Vector de `client.resolved`**: se serializa como

```text
{"client":{"display_name":"María Gómez","phone":"+5491155550001"},"contract_version":"1","event_id":"evt-client-0001","event_type":"client.resolved","occurred_at":"2026-09-16T14:59:58.000Z"}
```

y su `payload_hash` es `69779577a3a2aa226ef36ccf53a7ed817f3827f2955073967ed3d724b80728cc`, calculado sobre este texto escrito a mano.

## Respuestas

### Éxito y reenvío (D-5)

| Situación | HTTP | Cuerpo |
|---|---|---|
| Evento nuevo, procesado | `201` | `result: "accepted"` |
| Mismo `event_id` y mismo `payload_hash`, ya procesado | `200` | `result: "duplicate"`; no escribe nada |

El cuerpo solo trae referencias del emisor, nunca ids internos del CRM:

```json
{
  "contract_version": "1",
  "event_id": "evt-0001",
  "result": "accepted",
  "conversation_external_ref": "conv-0001",
  "message_external_ref": "msg-0001"
}
```

### Éxito y reenvío de `client.resolved` (brief-12.1, D-9)

Siempre responde `200`, con `result: "accepted"` o `"duplicate"`. Trae el id interno del cliente, porque el emisor lo necesita para seguir el turno. **No trae el teléfono**, que el emisor ya tiene.

```json
{
  "contract_version": "1",
  "event_id": "evt-client-0001",
  "result": "accepted",
  "client": {
    "id": "0b6c…",
    "display_name": "María Gómez",
    "is_active": true
  }
}
```

- **No trae `created`**: `ingestion_events` no guarda resultados, así que un reenvío no podría responderlo igual que el original.
- **Un reenvío** (mismo `event_id` y mismo hash) vuelve a buscar por teléfono, sin escribir. Si el teléfono ya no pertenece a ningún cliente, porque se editó en el backoffice, responde `duplicate` con `"client": null`. Un reenvío nunca crea.
- **Un cliente inactivo** se devuelve con `is_active: false`. Qué hacer con él lo decide el emisor.

### Errores

El cuerpo de error tiene `code`, `request_id` y, en `VALIDATION_ERROR`, `fields`: la lista de campos de la tabla de arriba con notación de puntos, más `body` (cuerpo ilegible o demasiado grande) y `event` (campo desconocido en la raíz). Un campo desconocido se informa por su objeto, nunca por su nombre. Ningún error repite el payload, el teléfono ni el cuerpo.

| Situación | Código | HTTP | ¿Queda en `ingestion_events`? (D-6) | ¿Reintentar? |
|---|---|---|---|---|
| Cuerpo ilegible, demasiado grande o evento inválido | `VALIDATION_ERROR` | 400 | no | no: corregir el evento antes de reenviarlo |
| Credencial ausente o inválida | `UNAUTHENTICATED` | 401 | no | no, hasta corregir la credencial |
| Credencial revocada, fuera de la allowlist del modo de prueba o de otro alcance (desde la 11.3) | `FORBIDDEN` | 403 | no | no |
| Mismo `event_id` con otro `payload_hash` | `CONFLICT` | 409 | no se modifica el registro existente | no: el emisor usa un `event_id` nuevo |
| El mensaje ya existe en la conversación con el mismo `external_ref`, llegado con otro `event_id` | `CONFLICT` | 409 | sí, `failed` con `error_code = 'CONFLICT'` | no |
| Límite de tasa superado | `RATE_LIMITED` | 429 | no | sí, después de `Retry-After` |
| Endpoint apagado (modo de prueba) | — | 404, sin cuerpo | no | no |
| Error inesperado | `INTERNAL` | 500 | no: la transacción se revierte, reserva incluida | sí, con el mismo `event_id` y el mismo contenido |

- **Encabezados**: toda respuesta lleva `Cache-Control: no-store`; la de éxito, `X-Request-Id`; la de `401`, `WWW-Authenticate: Bearer`; la de `429`, `Retry-After` con los segundos hasta la ventana siguiente.
- **Un evento `failed` es terminal.** Reenviarlo con el mismo hash devuelve el mismo error, y con otro hash, `CONFLICT`.
- **Los rechazos que no quedan en el registro** van al log estructurado, con código, `source` y organización cuando se conocen, sin payload.
- **Métrica 12**: cuenta solo los eventos que el CRM aceptó procesar y fallaron ([MetricsCatalog](../analytics/MetricsCatalog.md)).

## Proyección

La hace `conversations` con la transacción de `ingestion` (brief-6.5.2, D-2).

- **Conversación**:
  - se busca por `(organization_id, channel, conversation.external_ref)` y se bloquea hasta el final de la transacción;
  - si no existe, se crea con el primer mensaje, `status = 'open'` y `started_at = last_message_at = message.sent_at`.
- **Cliente** (D-7):
  - al crear la conversación, si `client_phone` coincide con un cliente de la organización, activo o no, la conversación lo referencia; si no, queda sin cliente;
  - `message.recorded` nunca crea clientes (*desde la 12.1, el que los crea es `client.resolved`: ver abajo*);
  - los mensajes siguientes no cambian el cliente de la conversación.
- **Mensaje**: se inserta con `direction`, `sent_at`, `body_text` y `external_ref`. `messages` es de solo inserción.
- **Fechas de la conversación**:
  - `started_at` es siempre el menor `sent_at` de sus mensajes, y `last_message_at` el mayor, aunque los mensajes lleguen desordenados;
  - un mensaje anterior a `started_at` lo adelanta.
- **Estado**: la ingestión no cambia el `status` de una conversación existente. Un mensaje nuevo en una conversación `closed` no la reabre.
- **Registro**: el evento termina `processed` con `processed_at`, o `failed` con su `error_code`, en la misma transacción.

### Resolución de `client.resolved` (brief-12.1, D-5 a D-10)

La hace `crm` con la transacción de `ingestion`, que antes reservó el evento.

- **Teléfono nuevo en la organización**:
  - se crea el cliente con `display_name` o, si viene `null`, con **«Sin nombre»**. Nunca con el teléfono, porque el nombre no se enmascara para `viewer`;
  - se audita la creación en `audit_logs` con la **credencial como actor** (`actor_credential_id`, FR-AUD-03).
- **Teléfono de un cliente existente**, activo o no: se devuelve tal cual. No se renombra, no se reactiva, no se crea otro y no se audita nada.
- **Dos eventos distintos con el mismo teléfono a la vez**: la inserción usa `ON CONFLICT (organization_id, phone_e164) WHERE phone_e164 IS NOT NULL DO NOTHING`, así que uno crea y el otro espera en el índice y lee lo que el primero confirmó. Queda un cliente y una fila de auditoría.
- **Después**: un `message.recorded` con ese teléfono asocia la conversación nueva a ese cliente, como siempre.

## Versionado

- **Cambios compatibles dentro de v1**: agregar un `event_type` nuevo, o un valor nuevo de `channel` que el modelo de datos ya admita. Un emisor v1 que no los usa no nota el cambio.
- **Cambios que requieren v2**, en otra ruta y con otro `contract_version`: agregar, quitar o renombrar campos (el esquema es estricto), o cambiar reglas, respuestas o el algoritmo del hash.
- **Convivencia**: v1 y v2 conviven hasta que ningún emisor use v1.

## Evidencia

- **Validado localmente** (`deterministic`):
  - en `src/modules/ingestion/contract.test.ts` (6.5.1): cada regla del esquema, la normalización, el vector del hash, su sensibilidad a cada campo y su indiferencia al orden y al formato, y los fixtures de `tests/fixtures/ingestion/v1/`, todos con `"shape": "assumed"`;
  - en `tests/integration/ingestion.test.ts` (6.5.2), contra PostgreSQL real: la proyección, el cliente, las fechas y el estado, los tres tipos de reenvío, los rechazos sin registro, la reversión ante un error inesperado y dos casos de entregas simultáneas.
  - en `tests/integration/ingestion-http.test.ts` (6.5.3), contra PostgreSQL real: las respuestas y sus encabezados, la credencial (ausente, desconocida, mal formada, revocada, fuera de la allowlist, de alcance `read` —caso 14, 11.3— o reemplazada por una sesión del CRM), el modo de prueba, el cuerpo (tipo, tamaño y UTF-8), el límite de tasa también bajo concurrencia, el token guardado solo como hash y el log sin secretos;
  - en `tests/e2e/ingestion.spec.ts` (6.5.3), contra `next start`: un evento aceptado que aparece en la pantalla 8, y los `401`. Los requests son sintéticos, así que no es evidencia de integración con un emisor.
  - **`client.resolved`** (12.1.2):
    - en `contract.test.ts`: el esquema, el vector y los cuatro fixtures con forma asumida;
    - en `tests/integration/client-resolution.test.ts`: el alta auditada, el cliente existente y el inactivo, los reenvíos, seis resoluciones simultáneas, el aislamiento y la cadena con `message.recorded`;
    - en `ingestion-http.test.ts`, casos 15 a 17: la respuesta sin teléfono, la misma cadena de rechazos, el límite compartido y el log sin teléfono ni nombre.
- **Sin validar hasta el proyecto de integración (Fase 12, 12.3)**:
  - la compatibilidad con un emisor real;
  - la autenticación con su tráfico ([Risks](../planning/Risks.md)).
