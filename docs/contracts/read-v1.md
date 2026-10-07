# Contrato de lectura v1

**Estado**:
- **Diseñado e implementado** en la 11.3 ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md)), en dos etapas: productos en la 11.3.1 e información del negocio en la 11.3.2.
- **Ampliado en la 12.4** ([brief-12.4](../decisions/brief-12.4-historial-y-memorias.md)) con el historial de una conversación, `GET /api/read/v1/messages`, y su propio alcance de credencial, `context`. Es una ruta nueva, un cambio compatible dentro de v1 (§Versionado): ninguna respuesta existente cambia.
- **Ampliado en la 16.2** ([brief-16.2](../decisions/brief-16.2-etiquetas-puestas-por-el-agente.md), D-7) con el catálogo de etiquetas de clientes, `GET /api/read/v1/client-tags`, con alcance `read`. Es una ruta nueva, un cambio compatible dentro de v1: ninguna respuesta existente cambia. **Validado localmente**, sin consumidor real todavía.
- **Validado localmente y en CI**, con requests sintéticos, contra PostgreSQL real.
- **No validado en integración**: ningún consumidor lo usa todavía. Sus fixtures tienen **forma asumida, no verificada**. Productos e información del negocio se validan con el agente en la 12.3, detrás del modo de prueba. El historial, en la 12.5: no se despliega a staging antes (brief-12.4, D-9). *Corregido el 2026-09-27* ([brief-12.5](../decisions/brief-12.5-turno-completo-en-staging.md), H-1, aprobado por el usuario): **la 12.3 no validó la lectura**, porque su corrida con el agente fue solo de ingestión. Las tres rutas se validan con el agente como consumidor en la 12.5.
- **Validado en integración, en staging** (`producer-consumer`, 12.5.2, 2026-09-28; [evidencia-12.5](../decisions/evidencia-12.5-turno-completo.md)). El agente, con su cadena real y datos sintéticos, leyó las tres rutas con sus credenciales `read` y `context`, sin ningún `429`. Una respuesta de cada ruta es un fixture `"shape": "captured"` en `tests/fixtures/read/v1/`, junto a los de forma asumida. **Salvedad**: n8n guarda el cuerpo ya parseado, así que esas capturas validan el esquema, no los bytes. **No** es producción, y ningún mensaje real pasó.

El contrato se diseñó desde el modelo del CRM ([ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), punto 2). No espeja las tablas ni los campos del sistema que hoy usa el agente, y el agente se adapta a él.

## Propósito

Que un sistema externo lea del CRM, sin sesión humana, lo que necesita para responder a un cliente: los productos activos con su precio y su estado de stock, la información del negocio vigente y, *desde la 12.4*, los últimos mensajes de una conversación. **Solo lectura**: ninguna ruta de este contrato cambia nada. Para escribir mensajes está el [contrato de ingestión](ingestion-v1.md).

La dependencia es unidireccional: el consumidor llama al CRM, y el CRM nunca lo llama a él.

## Transporte

- **Rutas**: `GET` bajo `/api/read/v1/`. La versión va en la ruta; una versión nueva es otra ruta.
- **Autenticación**: `Authorization: Bearer <token>`, con una **credencial de alcance `read`** (o `context` para el historial, ver abajo), por organización y emisor. El token es `crm_read_` seguido de 32 bytes aleatorios en base64url; el CRM guarda solo su SHA-256. De la credencial salen la organización y el `source`: ningún parámetro los trae. La API no lee cookies, así que una sesión del CRM no la autentica.
- **Una credencial, un alcance** (brief-11.3, D-2): una credencial `read` no escribe por la ingestión, y una de ingestión no lee. El consumidor que hace las dos cosas usa dos credenciales, que se revocan por separado.
- **El historial tiene su propio alcance, `context`** (brief-12.4, D-6), con token `crm_ctx_`. Es la única ruta que devuelve lo que escribió un cliente: una credencial `read` no lee el historial, y una `context` no lee productos ni información del negocio. Así, la credencial que el consumidor carga para el catálogo no lee conversaciones. Tiene su propio presupuesto de pedidos y el mismo modo de prueba que el resto de la lectura.
- **Límite de tasa**: 120 pedidos por minuto por credencial, en ventanas fijas de un minuto; en el borde entre dos ventanas pueden pasar hasta el doble. La credencial de lectura tiene su propio presupuesto, separado del de la de ingestión (D-6).
- **Modo de prueba**: la API responde `404` sin cuerpo salvo que `READ_API_ENABLED` sea `true`, y encendida solo acepta las credenciales de `READ_API_ALLOWED_CREDENTIALS`. Es independiente del modo de prueba de la ingestión (D-7).
- **Correlación** (D-5): el consumidor puede mandar `X-Correlation-Id`, que el CRM registra en su log y devuelve en la respuesta. Tiene las reglas de las referencias opacas de la ingestión: de 1 a 200 caracteres y sin caracteres de control. HTTP recorta los espacios de los bordes antes de que el valor llegue. **No debe llevar datos personales**: el CRM no puede comprobarlo.
- **Orden de las comprobaciones**: modo de prueba, credencial y alcance, allowlist, límite de tasa, correlación, parámetros y lectura. Un rechazo anterior al límite no lo consume.
- **Encabezados**: toda respuesta de la API encendida lleva `Cache-Control: no-store` y `X-Request-Id`; la de `401`, `WWW-Authenticate: Bearer`; la de `429`, `Retry-After`. Con la API apagada, el `404` lleva solo `Cache-Control: no-store`, como una ruta que no existe.

## Rutas

### `GET /api/read/v1/products`

Busca productos **activos** de la organización de la credencial (FR-API-01).

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `q` | sí | de 1 a 200 caracteres después de recortar los espacios; sin caracteres de control |
| `limit` | no | entero de 1 a 25, sin signo ni ceros de relleno; por defecto, 10 |

- **Coincidencia**: todas las palabras de `q` como prefijo de palabras del nombre, la marca o la categoría, sin distinguir mayúsculas ni acentos; o el SKU exacto, sin distinguir mayúsculas. Los caracteres de la sintaxis de búsqueda de PostgreSQL (`&`, `|`, `!`, `:`, comillas) son texto, no operadores.
- **Orden**: primero el SKU exacto, después la relevancia, después el nombre y el id.
- **Respuesta `200`**: `{ "contract_version": "1", "items": [producto, …] }`. Sin resultados, `items` es `[]`.
- No hay paginación: el consumidor refina la búsqueda.

### `GET /api/read/v1/products/{product_id}`

Un producto activo por su id (FR-API-01).

- **Respuesta `200`**: `{ "contract_version": "1", "product": producto }`.
- Un producto inactivo, de otra organización o inexistente da `404 NOT_FOUND`, **sin distinguir entre los tres**. Un id que no es UUID da `400` con el campo `product_id`.

### Producto

| Campo | Tipo | Nulable | Notas |
|---|---|---|---|
| `product_id` | string | no | UUID del producto en el CRM; estable |
| `sku` | string | no | código del negocio |
| `name` | string | no | |
| `description` | string | sí | texto plano, tal como se cargó; el consumidor lo escapa si lo muestra |
| `unit` | string | no | unidad de venta, como `unidad` |
| `brand` | string | sí | |
| `category` | string | sí | |
| `condition` | string | no | `new` o `refurbished` |
| `price` | objeto | sí | el precio vigente; `null` si nunca se fijó uno |
| `price.amount` | string | no | decimal en texto con los decimales de la moneda: `"1234.50"` en ARS, `"300000"` en CLP. **Nunca un número de JSON** |
| `price.currency` | string | no | ISO 4217, como `ARS` |
| `stock_status` | string | no | `disponible`, `bajo_stock` o `sin_stock`. **Sin la cantidad** |

Los nombres de los campos van en inglés con guion bajo, como la ingestión. Los valores enumerados son los del modelo del CRM, sin traducir. El objeto es estricto: el validador rechaza un campo de más.

Ejemplo (`tests/fixtures/read/v1/products-search.json`):

```json
{
  "contract_version": "1",
  "items": [
    {
      "product_id": "0b6f3c2e-5a4d-4e8f-9c1b-2a3d4e5f6a7b",
      "sku": "AUR-01",
      "name": "Auriculares inalámbricos",
      "description": "Con estuche de carga",
      "unit": "unidad",
      "brand": "Sonora",
      "category": "Audio",
      "condition": "new",
      "price": { "amount": "1234.50", "currency": "ARS" },
      "stock_status": "disponible"
    }
  ]
}
```

Lo que un producto **no** trae: la cantidad en stock, el punto de reposición, el historial de precios, quién los fijó, las fechas y la auditoría.

### `GET /api/read/v1/knowledge`

La información del negocio **vigente hoy** de la organización de la credencial (FR-API-02). Desde la 11.3.2.

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `q` | no | de 1 a 200 caracteres después de recortar los espacios; sin caracteres de control. Vacío o solo espacios es lo mismo que no mandarlo |
| `limit` | no | entero de 1 a 50, sin signo ni ceros de relleno; por defecto, 20 |

- **Vigente** (FR-INFO-03): activa, y el día de hoy **en la zona horaria de la organización** cae dentro de su vigencia. Las dos fechas son opcionales e inclusivas. Nunca sale una entrada inactiva, programada o vencida.
- **Con `q`**: todas las palabras como prefijo de palabras del título, la categoría o el contenido, sin distinguir mayúsculas ni acentos. Ordena por relevancia: una coincidencia en el título sale antes que una solo en el contenido. Después, por título y por id.
- **Sin `q`**: todas las vigentes, por categoría, título e id.
- **Respuesta `200`**: `{ "contract_version": "1", "items": [entrada, …] }`. Sin resultados, `items` es `[]`.
- No hay paginación: el consumidor refina la búsqueda.
- **Límite conocido** (H-9 del agente, brief-12.5, 2026-09-27): la respuesta no trae el total. Sin `q` y con `limit=50`, el consumidor no puede distinguir una organización con 50 entradas vigentes de una con más, y **el recorte no se nota**. El agente trata 50 ítems exactos como posible recorte y lo registra. Si una organización supera las 50 entradas vigentes, se revisa en la subfase que agregue la búsqueda por «cualquier palabra» (el disparador de H-6), que es cuando conviene agregar el total.

### Entrada de información del negocio

| Campo | Tipo | Nulable | Notas |
|---|---|---|---|
| `entry_id` | string | no | UUID de la entrada en el CRM; estable |
| `title` | string | no | único por organización, sin distinguir mayúsculas |
| `category` | string | no | texto libre |
| `content` | string | no | texto plano, hasta 4000 caracteres, con saltos de línea `\n`; el consumidor lo escapa si lo muestra |
| `valid_from` | string | sí | fecha de calendario `YYYY-MM-DD`, inclusiva; `null` si no tiene inicio |
| `valid_until` | string | sí | fecha de calendario `YYYY-MM-DD`, inclusiva; `null` si no vence |

Ejemplo (`tests/fixtures/read/v1/knowledge-current.json`):

```json
{
  "contract_version": "1",
  "items": [
    {
      "entry_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "title": "Horarios",
      "category": "Atención",
      "content": "De lunes a viernes, de 9 a 18.\nSábados, de 9 a 13.",
      "valid_from": null,
      "valid_until": null
    }
  ]
}
```

Lo que una entrada **no** trae: su estado, si está activa, las fechas de alta y de cambio, y la auditoría.

### `GET /api/read/v1/messages`

Los **últimos mensajes** de una conversación de la organización de la credencial, del más viejo al más nuevo (FR-API-08). Desde la 12.4. **Exige una credencial de alcance `context`.**

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `conversation_ref` | sí | la referencia de la conversación que devolvió `conversation.resolved` del [contrato de ingestión](ingestion-v2.md), con sus reglas: de 1 a 200 caracteres, sin espacios al borde ni caracteres de control. No se recorta |
| `limit` | no | entero de 1 a 50, sin signo ni ceros de relleno; por defecto, 20 |

- **Los últimos, nunca los primeros**: los `limit` mensajes con `sent_at` más reciente, desempatados por su id, y devueltos en orden ascendente. Un mensaje que llegó tarde con un `sent_at` anterior queda en su lugar, como en la pantalla 9.
- **Entra el último mensaje registrado**, así que después de `conversation.resolved` el último ítem es el entrante que el consumidor está por contestar. Lo reconoce por su `external_ref`.
- **Solo esa conversación**, del canal `whatsapp`. Nunca otras conversaciones del mismo cliente (brief-12.4, D-2).
- **Una conversación cerrada también se lee**, y una sin mensajes da `items: []`.
- **Respuesta `200`**: `{ "contract_version": "1", "items": [mensaje, …] }`.
- Una conversación de otra organización o inexistente da `404 NOT_FOUND`, **sin distinguir entre las dos**.
- No hay paginación hacia atrás. Un cursor, si hace falta, es un parámetro opcional y compatible.

### Mensaje del historial

| Campo | Tipo | Nulable | Notas |
|---|---|---|---|
| `external_ref` | string | sí | la referencia del mensaje que mandó el emisor; `null` si el mensaje no la tiene |
| `direction` | string | no | `inbound` u `outbound` |
| `kind` | string | sí | `text`, `audio`, `image`, `video`, `document` u `other`. `null` es «sin dato»: mensajes de la ingestión v1 y de los seeds |
| `sent_by` | string | sí | `agent` o `person`, solo en salidas. `null` en toda entrada y en las salidas sin dato |
| `sent_at` | string | no | ISO 8601 en UTC, con milisegundos |
| `body_text` | string | sí | tal como se guardó; el consumidor lo escapa si lo muestra |

Ejemplo (`tests/fixtures/read/v1/messages-history.json`, recortado):

```json
{
  "contract_version": "1",
  "items": [
    {
      "external_ref": "msg-v2-0001",
      "direction": "inbound",
      "kind": "audio",
      "sent_by": null,
      "sent_at": "2026-09-16T14:59:57.250Z",
      "body_text": "Hola, ¿tienen stock?"
    },
    {
      "external_ref": "msg-v2-0002",
      "direction": "outbound",
      "kind": "text",
      "sent_by": "agent",
      "sent_at": "2026-09-16T15:00:04.500Z",
      "body_text": "Sí, tenemos stock."
    }
  ]
}
```

Lo que un mensaje **no** trae: su id y el de la conversación, el cliente, su teléfono, el estado de la conversación y si hay mensajes más viejos. El estado lo devuelve `conversation.resolved`. **Agregar cualquiera de estos campos es un cambio de v2** (§Versionado).

### `GET /api/read/v1/client-tags`

Las **etiquetas activas** del catálogo de la organización de la credencial, por nombre, sin distinguir mayúsculas (FR-CLI-11). Desde la 16.2. **Exige una credencial de alcance `read`**: el catálogo es configuración de la organización, no datos de una persona. Sin parámetros ni paginación: son 50 como mucho.

Sirve para que el emisor sepa qué etiquetas existen y con qué `tag_id` las pone o las quita por los eventos `client.tag_added` y `client.tag_removed` del [contrato de ingestión v2](ingestion-v2.md) (§Etiquetas).

```json
{
  "contract_version": "1",
  "items": [
    { "tag_id": "5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f", "name": "Reclamo" }
  ]
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `tag_id` | string, uuid | el id del CRM; no cambia si el admin renombra la etiqueta |
| `name` | string | de 1 a 40 caracteres, como lo escribió el admin |

**No trae**: el color, las desactivadas, cuántos clientes la tienen ni las etiquetas de ningún cliente. Agregar cualquiera de esos campos es un cambio de v2 (§Versionado). *La 16.2.1 nombró el campo `tag_id` y no `id`, como `product_id` y `entry_id`; es una precisión de D-7 del [brief-16.2](../decisions/brief-16.2-etiquetas-puestas-por-el-agente.md) **pendiente de la aprobación del usuario**, y este contrato no se publica al emisor antes de esa aprobación.*

## Errores

El cuerpo de error tiene `code`, `request_id` y, en `VALIDATION_ERROR`, `fields`: los parámetros inválidos (`q`, `limit`, `product_id`, `conversation_ref` o `correlation_id`). Ningún error repite el texto buscado ni la referencia.

| Situación | Código | HTTP | ¿Reintentar? |
|---|---|---|---|
| API apagada (modo de prueba) | — | 404, sin cuerpo | no |
| Credencial ausente, desconocida o mal formada | `UNAUTHENTICATED` | 401 | no, hasta corregir la credencial |
| Credencial revocada, de otro alcance o fuera de la allowlist | `FORBIDDEN` | 403 | no |
| Límite de tasa superado | `RATE_LIMITED` | 429 | sí, después de `Retry-After` |
| Parámetro o correlación inválidos | `VALIDATION_ERROR` | 400 | no: corregir el pedido |
| Producto inactivo, ajeno o inexistente; conversación ajena o inexistente | `NOT_FOUND` | 404 | no |
| Error inesperado | `INTERNAL` | 500 | sí |

## Disponibilidad

*Agregado el 2026-09-30 por la 13.3* ([brief-13.3](../decisions/brief-13.3-disponibilidad-y-observabilidad.md), D-1). No es un cambio del contrato: no toca ninguna ruta, campo ni código.

- **El objetivo de producción es el 99,5 % mensual**, medido desde afuera ([NonFunctionalRequirements](../product/NonFunctionalRequirements.md), §Disponibilidad). No es un SLA.
- **El consumidor tiene que tolerar que el CRM no responda**: un timeout, un error de conexión, un `502` o un `503` durante una caída o un despliegue. Esos casos no traen el cuerpo de error de §Errores, porque la aplicación no llegó a responder.
- **Qué hace el consumidor en ese caso lo decide el consumidor.** El CRM no fija su timeout, sus reintentos ni su respuesta al cliente. Reintentar una lectura es seguro: no tiene efectos.

## Log

Cada respuesta de la API encendida, incluidos los rechazos y el `500`, queda en el log estructurado con `request_id`, la ruta **fija** (`/api/read/v1/products`, `/api/read/v1/products/{product_id}`, `/api/read/v1/knowledge`, `/api/read/v1/messages` o, desde la 16.2, `/api/read/v1/client-tags`, nunca la URL), el código, la duración y, cuando se conocen, la organización, el `source` y el `correlation_id` (R-1 de la [evaluación 10.1](../decisions/evaluacion-10.1-mvp.md), piezas 1 y 2). **Nunca** el token, el texto buscado, el `limit`, un id buscado, la referencia de una conversación ni el texto de un mensaje: el texto viene de lo que escribió un cliente, y la referencia la genera el consumidor, así que el CRM no puede comprobar que no traiga un teléfono.

## Versionado

- **Cambios compatibles dentro de v1**: una ruta nueva; un parámetro opcional nuevo, como un cursor de paginación; un valor nuevo de un enumerado que el modelo ya admita. **Un campo nuevo en una respuesta no es compatible**: el validador es estricto, y un consumidor que valide igual lo rechazaría.
- **Cambios que requieren v2**, en otra ruta y con otro `contract_version`: agregar, quitar o renombrar campos de una respuesta, o cambiar reglas, códigos u orden.
- **Convivencia**: v1 y v2 conviven hasta que ningún consumidor use v1.

## Evidencia

- **Validado localmente** (`deterministic`):
  - en `src/app/api/read/v1/contract.test.ts`: los parámetros, el monto con los decimales de la moneda, el validador estricto y los fixtures de `tests/fixtures/read/v1/`: los de forma asumida (`"shape": "assumed"`) y, desde la 12.5.2, las tres capturas del agente (`"shape": "captured"`), sin encabezados ni tokens y con el historial exacto del turno 2;
  - en `tests/integration/read-api.test.ts`, contra PostgreSQL real: toda respuesta de éxito pasa el validador; el borde completo (modo de prueba, credencial, alcance, allowlist, límite, sesión que no autentica, encabezados, correlación); el aislamiento entre organizaciones; los productos inactivos; la vigencia de la información, con la zona de la organización; los caracteres de búsqueda; el NUL, que nunca llega a PostgreSQL; el log sin secretos y el `500`;
  - en el mismo archivo, el plan de las tres consultas de la API, capturadas tal como las ejecuta la lectura: la búsqueda de productos usa el índice GIN y el del SKU, el precio vigente usa el índice del historial y la búsqueda de información usa su GIN;
  - en `tests/integration/ingestion-http.test.ts`, caso 14: una credencial de lectura no escribe;
  - en `tests/e2e/read-api.spec.ts`, sobre `next start`: las cabeceras de `proxy.ts` en las tres rutas (cuatro desde la 12.4) y la API apagada por defecto;
  - en `scripts/medir-caminos.ts`: las lecturas de las tres rutas contra el volumen de desarrollo (10 000 productos), sin el borde. Ese volumen no tiene precios ni entradas de información ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md), §Resultados de la 11.3.2);
  - **el historial, desde la 12.4**, en `tests/integration/read-api-messages.test.ts`: los últimos N y nunca los primeros; el orden por `sent_at` con desempate estable; los mensajes sin tipo ni autor; el mismo `404` para una conversación ajena o inexistente; el alcance `context` en las dos direcciones; el borde, el log sin la referencia ni el texto y el `500`; y el plan de la consulta, que usa `messages_conversation_sent_idx` y corta con `LIMIT` en SQL. `read-api.spec.ts` suma la ruta a las cabeceras de `proxy.ts`. No se desplegó en staging en la 12.4 (D-9): llegó con la 12.5.1.
  - **el catálogo de etiquetas, desde la 16.2**, en `tests/integration/read-api.test.ts`: las activas de la organización por nombre, sin datos de clientes, el catálogo vacío, el alcance `read` (`401` sin token, `403` con `ingest` o `context`) y la API apagada. La mutación sin el filtro por organización lo hace fallar;
- **Validado en staging** (`isolated-runtime`, 12.5.1, 2026-09-27): `scripts/probar-api-lectura.ts` recorrió las tres rutas a través del borde real, con credenciales `read` y `context`, y dio 0 fallas.
- **Validado en integración, en staging** (`producer-consumer`, 12.5.2, 2026-09-28): el agente como consumidor real. Se validaron la compatibilidad y la autenticación con su tráfico, de 1 a 3 lecturas por turno, sin ningún `429` ([Risks](../planning/Risks.md), pregunta 5). *Hasta la 12.5, esta línea decía «sin validar hasta la 12.5»; actualizada por la revisión independiente de la 12.5 (R-2).*
- **Sin validar**: el tráfico real y varios clientes a la vez (13.5).
