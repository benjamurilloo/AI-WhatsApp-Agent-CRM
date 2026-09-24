# Contrato de lectura v1

**Estado**:
- **Diseñado e implementado** en la 11.3 ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md)), en dos etapas: productos en la 11.3.1 e información del negocio en la 11.3.2.
- **Validado localmente y en CI**, con requests sintéticos, contra PostgreSQL real.
- **No validado en integración**: ningún consumidor lo usa todavía. Sus fixtures tienen **forma asumida, no verificada**. Se valida con el agente en la 12.3, detrás del modo de prueba.

El contrato se diseñó desde el modelo del CRM ([ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), punto 2). No espeja las tablas ni los campos del sistema que hoy usa el agente, y el agente se adapta a él.

## Propósito

Que un sistema externo lea del CRM, sin sesión humana, lo que necesita para responder a un cliente: los productos activos con su precio y su estado de stock, y la información del negocio vigente. **Solo lectura**: ninguna ruta de este contrato cambia nada. Para escribir mensajes está el [contrato de ingestión](ingestion-v1.md).

La dependencia es unidireccional: el consumidor llama al CRM, y el CRM nunca lo llama a él.

## Transporte

- **Rutas**: `GET` bajo `/api/read/v1/`. La versión va en la ruta; una versión nueva es otra ruta.
- **Autenticación**: `Authorization: Bearer <token>`, con una **credencial de alcance `read`**, por organización y emisor. El token es `crm_read_` seguido de 32 bytes aleatorios en base64url; el CRM guarda solo su SHA-256. De la credencial salen la organización y el `source`: ningún parámetro los trae. La API no lee cookies, así que una sesión del CRM no la autentica.
- **Una credencial, un alcance** (brief-11.3, D-2): una credencial `read` no escribe por la ingestión, y una de ingestión no lee. El consumidor que hace las dos cosas usa dos credenciales, que se revocan por separado.
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

## Errores

El cuerpo de error tiene `code`, `request_id` y, en `VALIDATION_ERROR`, `fields`: los parámetros inválidos (`q`, `limit`, `product_id` o `correlation_id`). Ningún error repite el texto buscado.

| Situación | Código | HTTP | ¿Reintentar? |
|---|---|---|---|
| API apagada (modo de prueba) | — | 404, sin cuerpo | no |
| Credencial ausente, desconocida o mal formada | `UNAUTHENTICATED` | 401 | no, hasta corregir la credencial |
| Credencial revocada, de otro alcance o fuera de la allowlist | `FORBIDDEN` | 403 | no |
| Límite de tasa superado | `RATE_LIMITED` | 429 | sí, después de `Retry-After` |
| Parámetro o correlación inválidos | `VALIDATION_ERROR` | 400 | no: corregir el pedido |
| Producto inactivo, ajeno o inexistente | `NOT_FOUND` | 404 | no |
| Error inesperado | `INTERNAL` | 500 | sí |

## Log

Cada respuesta de la API encendida, incluidos los rechazos y el `500`, queda en el log estructurado con `request_id`, la ruta **fija** (`/api/read/v1/products`, `/api/read/v1/products/{product_id}` o `/api/read/v1/knowledge`, nunca la URL), el código, la duración y, cuando se conocen, la organización, el `source` y el `correlation_id` (R-1 de la [evaluación 10.1](../decisions/evaluacion-10.1-mvp.md), piezas 1 y 2). **Nunca** el token, el texto buscado, el `limit` ni un id buscado: el texto viene de lo que escribió un cliente.

## Versionado

- **Cambios compatibles dentro de v1**: una ruta nueva; un parámetro opcional nuevo, como un cursor de paginación; un valor nuevo de un enumerado que el modelo ya admita. **Un campo nuevo en una respuesta no es compatible**: el validador es estricto, y un consumidor que valide igual lo rechazaría.
- **Cambios que requieren v2**, en otra ruta y con otro `contract_version`: agregar, quitar o renombrar campos de una respuesta, o cambiar reglas, códigos u orden.
- **Convivencia**: v1 y v2 conviven hasta que ningún consumidor use v1.

## Evidencia

- **Validado localmente** (`deterministic`):
  - en `src/app/api/read/v1/contract.test.ts`: los parámetros, el monto con los decimales de la moneda, el validador estricto y los fixtures de `tests/fixtures/read/v1/`, todos con `"shape": "assumed"`;
  - en `tests/integration/read-api.test.ts`, contra PostgreSQL real: toda respuesta de éxito pasa el validador; el borde completo (modo de prueba, credencial, alcance, allowlist, límite, sesión que no autentica, encabezados, correlación); el aislamiento entre organizaciones; los productos inactivos; la vigencia de la información, con la zona de la organización; los caracteres de búsqueda; el NUL, que nunca llega a PostgreSQL; el log sin secretos y el `500`;
  - en el mismo archivo, el plan de las tres consultas de la API, capturadas tal como las ejecuta la lectura: la búsqueda de productos usa el índice GIN y el del SKU, el precio vigente usa el índice del historial y la búsqueda de información usa su GIN;
  - en `tests/integration/ingestion-http.test.ts`, caso 14: una credencial de lectura no escribe;
  - en `tests/e2e/read-api.spec.ts`, sobre `next start`: las cabeceras de `proxy.ts` en las tres rutas y la API apagada por defecto;
  - en `scripts/medir-caminos.ts`: las lecturas de las tres rutas contra el volumen de desarrollo (10 000 productos), sin el borde. Ese volumen no tiene precios ni entradas de información ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md), §Resultados de la 11.3.2).
- **Sin validar hasta la 12.3**:
  - la compatibilidad con un consumidor real;
  - la autenticación con su tráfico;
  - si 120 pedidos por minuto alcanzan: es una estimación, no una medición ([Risks](../planning/Risks.md)).
