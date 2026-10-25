# Contrato de lectura v3: el catálogo del rubro

**Estado**:
- **Diseñado e implementado** en la 29.8 ([brief-29.8](../decisions/brief-29.8-el-catalogo-del-rubro-para-el-agente.md), D-1 a D-6), con la confirmación del agente del 2026-10-22 (`Respuesta-29.8-Agente-al-CRM.md`): lo usa tal como está.
- **Validado localmente** con requests sintéticos, contra PostgreSQL real (`deterministic`).
- ~~**No validado en integración**: ningún consumidor real lo leyó todavía. Sus fixtures tienen **forma asumida**. La ventana con el agente los contrasta (brief-29.8, D-11).~~ *Precisado el 2026-10-23*: el agente leyó las rutas de la 29.8 en sus ventanas 3.50 y 3.51 (brief-29.8, §Cierre). Los fixtures siguen siendo de **forma asumida**, porque las conciliaciones traen ids, no cuerpos.
- *Ampliado en la 29.8.2* ([brief-29.8.2](../decisions/brief-29.8.2-las-reparaciones-para-el-agente.md), D-1 a D-4), con la confirmación del agente del 2026-10-22 (`Respuesta-29.8.2-Agente-al-CRM.md`): **las reparaciones de un modelo** y **las órdenes de servicio del cliente de una conversación**. Son dos rutas nuevas, un cambio compatible: ninguna respuesta existente cambia. **Validadas localmente**. *Desde el 2026-10-23*, **validadas en integración con el agente real**: su ventana 3.52 leyó las dos y coincide con el log de producción (brief-29.8.2, §La ventana). Sus fixtures siguen siendo de forma asumida.
- *Ampliado en la 29.8.3* ([brief-29.8.3](../decisions/brief-29.8.3-la-cotizacion-de-un-usado-para-el-agente.md), D-1 a D-5), con la confirmación del agente del 2026-10-23 (`Respuesta-29.8.3-Agente-al-CRM.md`): **el checklist de un usado** y **su cotización orientativa**, con solo el rango redondeado. Dos rutas nuevas, un cambio compatible. **Validadas localmente**. *Desde el 2026-10-25*, **validadas en integración con el agente real** en su ventana 3.53 (brief-29.8.3, §La ventana): el checklist, el rango y `checklist_incomplete`. **`not_accepted` y `not_quotable` siguen validados solo localmente**: el agente no los leyó. *Desde la ventana corta 3.54, el mismo día, también `not_quotable` está validado en integración; solo `not_accepted` sigue validado localmente* (brief-29.8.3, §La ventana corta). *Desde la ventana del caso 6, el mismo día, también `not_accepted`: las dos rutas quedan validadas en integración enteras* (§La ventana del caso 6). Sus fixtures siguen siendo de forma asumida.

## Qué cambia respecto de v2

La v3 es el catálogo de un negocio con rubro ([ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 15): **las tres rutas de productos de [v2](read-v2.md), con el objeto ampliado**, y dos rutas nuevas. *Desde la 29.8.2 (2026-10-22)*, cuatro: las reparaciones y las órdenes de servicio. *Desde la 29.8.3 (2026-10-23)*, seis: el checklist y la cotización de un usado.

| | v2 | v3 |
|---|---|---|
| Rutas de productos | lista, detalle y stock | las mismas bajo `/api/read/v3/` |
| `contract_version` | `"2"` | `"3"` |
| Productos usados | fuera, desde la 29.5 | **dentro** |
| Productos de servicio | fuera, desde la 29.6 | fuera. *Desde la 29.8.2* (D-5): siguen fuera; lo que contesta el agente sale de la ruta de reparaciones |
| El producto | el objeto de v1 | el de v1, con `condition` que admite `used`, y `tracking`, `model`, `attributes` y `price_converted` |
| Filtros de la lista | `q` y `limit` | más `model_id` y `condition` |
| Rutas nuevas | — | las unidades disponibles de un producto y las capacidades; *desde la 29.8.2*, las reparaciones y las órdenes de servicio; *desde la 29.8.3*, el checklist y la cotización de un usado |

**v1 y v2 no cambian** y siguen sin los usados. Las demás rutas de lectura (información del negocio, historial, etiquetas, estado de la conversación y horario) **solo existen en v1**.

*Decidido el 2026-10-22* (brief-29.8, D-4): **no hay ruta de modelos**. El agente busca por `q`. Una ruta nueva dentro de v3 es compatible (§Versionado), así que se suma cuando la pida.

## Transporte

El de v1, sin cambios:
- la credencial de alcance `read`. *Desde la 29.8.2*, **las órdenes de servicio exigen `context`**, como el historial y el estado de la conversación de v1, porque son datos de una persona;
- el modo de prueba (`READ_API_ENABLED` y `READ_API_ALLOWED_CREDENTIALS`);
- **el mismo presupuesto de 120 pedidos por minuto que v1 y v2**: una lectura de cada versión cuenta junta;
- la correlación, los encabezados y el orden de las comprobaciones.

Una sesión del CRM no autentica.

## Rutas

### `GET /api/read/v3/products` y `GET /api/read/v3/products/{product_id}`

Los parámetros, el orden y el 404 de v2, más los usados. **Un producto inactivo, de servicio, de otra organización o inexistente da el mismo 404**, sin distinguir.

**Parámetros de la lista**:

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `q` | sí | como en v1 |
| `limit` | no | como en v1 |
| `model_id` | no | un uuid; solo los productos de ese modelo. Sin la capacidad `variants` no hay modelos, y la lista sale vacía |
| `condition` | no | `new`, `refurbished` o `used` |

Un parámetro inválido da `400` con su nombre en `fields`.

### El producto

El objeto de v1, con estos cambios:

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `condition` | string | no | `new`, `refurbished` o **`used`** |
| `price` | objeto | sí | como en v1: `null` si nunca se fijó uno. **En un producto por unidad es el precio base**, el que heredan las unidades sin precio propio, y puede no coincidir con ninguna unidad disponible: el precio de cada equipo sale de la ruta de unidades. *Precisado el 2026-10-22, al cierre de la 29.8, a pedido del agente*: **un producto activo sin precio es un estado válido**, por ejemplo mientras se termina de cargar. El agente no lo ofrece a un precio ni anota un pedido con él, porque la ingestión lo rechazaría con `product_without_price`: ofrece pasar con una persona. La forma no cambia |
| `stock_status` | string | no | la regla de v2, sobre lo disponible. En un producto por unidad, lo disponible son sus unidades `available` |
| `tracking` | string | no | `quantity`: se vende por cantidad. `unit`: cada equipo es una unidad, con su grado, su batería y su precio |
| `model` | objeto | sí | `{model_id, name, brand}`; `null` sin la capacidad `variants` o si el producto no tiene modelo. `brand` es nulable |
| `attributes` | arreglo | no | los valores de la variante, en el orden de la organización: `[{key, name, value}]`. **Solo los atributos que son variante y están activos**, como capacidad, color y «trae caja» en el perfil `iphone`. Un atributo sin valor no aparece. Vacío sin `variants` |
| `price_converted` | objeto | sí | el precio en la otra moneda (§El precio convertido) |

**Nunca trae** el costo, el margen, el IMEI ni las unidades sueltas. Lo fija la guarda `tests/guards/agent-contract-fields.test.ts` (§Lo que nunca se lee).

Ejemplo (`tests/fixtures/read/v3/product-detail.json`):

```json
{
  "contract_version": "3",
  "product": {
    "product_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "sku": "IP13-128-AZUL-USADO",
    "name": "iPhone 13 128 GB Azul",
    "description": null,
    "unit": "unidad",
    "brand": "Apple",
    "category": "Celulares",
    "condition": "used",
    "price": { "amount": "420.00", "currency": "USD" },
    "stock_status": "disponible",
    "tracking": "unit",
    "model": {
      "model_id": "3f1c2b4a-8d6e-4f0a-9b7c-1e2d3c4b5a69",
      "name": "iPhone 13",
      "brand": "Apple"
    },
    "attributes": [
      { "key": "capacidad", "name": "Capacidad", "value": "128 GB" },
      { "key": "color", "name": "Color", "value": "Azul" },
      { "key": "trae_caja", "name": "Trae caja", "value": "No" }
    ],
    "price_converted": {
      "amount": "504000.00",
      "currency": "ARS",
      "rate": "1200",
      "rate_as_of": "2026-10-22T13:00:00.000Z"
    }
  }
}
```

### `GET /api/read/v3/products/{product_id}/stock`

La de v2, con `contract_version: "3"` y los usados.

### `GET /api/read/v3/products/{product_id}/units`

Las unidades **disponibles** de un producto, de la más barata a la más cara (brief-29.8, D-3):

```json
{
  "contract_version": "3",
  "product_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "items": [
    {
      "unit_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      "grade": "B",
      "battery_health": 81,
      "price": { "amount": "395.00", "currency": "USD" },
      "price_converted": {
        "amount": "474000.00",
        "currency": "ARS",
        "rate": "1200",
        "rate_as_of": "2026-10-22T13:00:00.000Z"
      }
    }
  ]
}
```

| Campo | Tipo | Nulable | Reglas |
|---|---|---|---|
| `unit_id` | string | no | el id de la unidad, un uuid. Es el que lleva `order.placed_with_units` ([ingestion-v2](ingestion-v2.md), §Pedidos con unidades). No se le muestra al cliente |
| `grade` | string | sí | el nombre del grado; `null` si no tiene. Qué significa cada grado lo explica una entrada de información del negocio, por `knowledge` en v1 |
| `battery_health` | número | sí | un entero de 1 a 100; `null` si no hay dato |
| `price` | objeto | sí | **el precio propio de la unidad, o el del producto** si no tiene uno; `null` si ninguno de los dos existe |
| `price_converted` | objeto | sí | el de `price` en la otra moneda (§El precio convertido) |

**El orden**:
1. de menor a mayor precio, entre las del precio del producto;
2. después, las de otra moneda, por código y por precio;
3. al final, las sin precio;
4. a igual precio, por id.

**Nunca trae** el IMEI, el costo, el origen ni una unidad en otro estado: reservada, en revisión, en reparación, vendida o dada de baja.

- **Un producto por cantidad** devuelve `items: []`.
- **Sin la capacidad `serialized_units`**, ninguna unidad.
- **Un producto inexistente, inactivo, de servicio o de otra organización** da el 404 del detalle.

### `GET /api/read/v3/capabilities`

```json
{ "contract_version": "3", "capabilities": ["variants", "serialized_units", "repairs", "trade_ins"] }
```

Las capacidades activas de la organización, en el orden del enum del CRM. Sin ninguna, `[]`.

**Un valor nuevo es compatible**: el validador acepta cualquier nombre en minúsculas, y el emisor ignora los que no conoce. El agente informó que la guarda un rato, para no gastar el presupuesto en cada turno.

### `GET /api/read/v3/repairs`

*Desde la 29.8.2* (brief-29.8.2, D-2 y U-4). Qué reparaciones hace el negocio para un modelo y su **precio al cliente**. Alcance `read`.

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `q` | uno de los dos | las reglas de `q` de la lista de productos. Busca entre los modelos **activos**, por prefijo de cada palabra en el nombre y la marca: todas las palabras tienen que estar |
| `model_id` | uno de los dos | un uuid |

- **Ninguno de los dos, o los dos juntos**, dan `400` con `fields: ["q", "model_id"]`.
- **Los modelos que se reparan no son los que se venden**: un modelo sin producto en venta aparece si tiene precios de reparación. Por eso existe `q`.
- **Entran los tipos activos que tienen precio para el modelo**, en el orden de la organización. Un modelo sin ninguno no aparece. Hasta 10 modelos, por nombre.
- **Solo el precio al cliente.** El costo estimado del técnico nunca sale (ADR 0024, punto 7).
- **`price_converted`** con la regla de §El precio convertido.
- **Un modelo que es prefijo de otro** («iPhone 11» y «iPhone 11 Pro») trae los dos. El agente informó que elige el de nombre exacto o le pregunta al cliente.
- **Sin la capacidad `repairs`, o sin `variants`**, que es la de los modelos, `items: []`.
- **No hay un tope de tipos por modelo**: la lista de un negocio no tiene máximo. El perfil de iPhone trae 6.

```json
{
  "contract_version": "3",
  "items": [
    {
      "model": { "model_id": "3f1c2b4a-8d6e-4f0a-9b7c-1e2d3c4b5a69", "name": "iPhone 11", "brand": "Apple" },
      "repairs": [
        {
          "repair_type_id": "5f0c9a8e-3b1d-4c2a-9e7f-1a2b3c4d5e6f",
          "name": "Cambio de batería",
          "price": { "amount": "45.00", "currency": "USD" },
          "price_converted": { "amount": "54000.00", "currency": "ARS", "rate": "1200", "rate_as_of": "2026-10-22T13:00:00.000Z" }
        }
      ]
    }
  ]
}
```

Fixture, con forma asumida: `repairs.json`.

### `GET /api/read/v3/service-orders`

*Desde la 29.8.2* (brief-29.8.2, D-3, D-4, U-1 a U-3). Las órdenes de servicio del cliente con el que habla el agente. **Alcance `context`**.

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `conversation_ref` | sí | la referencia de la conversación que devolvió `conversation.resolved`, con las reglas de `messages` de [v1](read-v1.md) |

- **El teléfono nunca viaja en una lectura** (U-1). El CRM busca la conversación, toma su cliente y devuelve sus órdenes.
- **Una conversación inexistente o de otra organización** da `404 NOT_FOUND`, sin distinguir, como `conversation-state`. **Una sin cliente**, o un cliente sin órdenes, da `items: []`.
- **Cuáles** (U-3): las del equipo de un cliente, **abiertas** y **cerradas** (entregadas o canceladas) **en los últimos 30 días**, hasta 5, de la más nueva a la más vieja. Nunca la orden de una unidad propia del negocio. *Precisado el 2026-10-23* (revisión independiente de la 29.8.2, O-2; decisión del usuario): **nunca una cancelada como cargada por error** (`entered_by_mistake`), porque pudo ser de otro cliente.
- **Sin la capacidad `repairs`**, `items: []`. La conversación se busca antes: sin la capacidad, una inexistente o ajena sigue dando el mismo `404`.
- **Una orden cancelada o rechazada después del presupuesto conserva su `quote`**: es el que se le dio al cliente, y el `status` dice que ya no está vigente.
- **Límite aceptado** (U-1; ADR 0007): el cliente es su teléfono. Quien escribe desde el WhatsApp de otra persona ve las órdenes de esa persona, como el historial y los pedidos.

| Campo | Tipo | Notas |
|---|---|---|
| `number` | string | `"OS-000123"`, el número que el cliente tiene en su comprobante de recepción. Se le puede decir |
| `model` | objeto | `{model_id, name, brand}`, aunque el modelo esté inactivo o falte `variants` |
| `status` | string | uno de la tabla de abajo |
| `status_at` | string, fecha | la de la transición que dejó la orden en su estado; en `received`, la del alta |
| `received_at` | string, fecha | la del alta |
| `quote` | objeto | `null` antes del presupuesto. Desde ahí, `{total: {amount, currency}, repairs: [{name, price}]}`, **sin convertir**: es un monto comprometido en su moneda |

| `status` | Qué significa para el cliente |
|---|---|
| `received` | lo recibimos en el local |
| `sent` | está en el técnico, revisándolo |
| `quoted` | ya tiene presupuesto y esperamos que lo apruebe |
| `approved` | lo aprobó y se está reparando |
| `rejected` | no aprobó el presupuesto, y el equipo está listo para retirar sin reparar |
| `repaired` | está reparado y listo para retirar |
| `delivered` | ya lo retiró |
| `cancelled` | la orden se canceló |

**No trae** el IMEI, lo que reportó el cliente, el técnico, el costo, la venta ni el motivo de una cancelación. **El agente no aprueba ni rechaza un presupuesto** y no promete fechas: deriva a una persona (ADR 0024, punto 15).

Fixture, con forma asumida: `service-orders.json`.

### `GET /api/read/v3/trade-in-checklist`

*Desde la 29.8.3* (brief-29.8.3, D-2 y U-1). Las preguntas que el agente le hace al cliente antes de cotizar su usado. Alcance `read`. Sin parámetros.

```json
{
  "contract_version": "3",
  "items": [
    { "item_id": "7b2e1c4d-5f6a-4b7c-8d9e-0f1a2b3c4d5e", "name": "Face ID funciona", "mandatory": true },
    { "item_id": "8c3f2d5e-6a7b-4c8d-9e0f-1a2b3c4d5e6f", "name": "Pantalla sin rayas", "mandatory": false }
  ]
}
```

- **Solo los puntos activos**, en el orden de la organización. Una organización tiene hasta 40 puntos, contando los inactivos; el perfil de iPhone trae 10.
- **No lleva** la reparación de cada punto ni su costo.
- **Sin la capacidad `trade_ins`**, `items: []`.

Fixture, con forma asumida: `trade-in-checklist.json`.

### `GET /api/read/v3/trade-in-quote`

*Desde la 29.8.3* (brief-29.8.3, D-3 a D-5, U-2 a U-5). La cotización orientativa de un usado ([ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 9): **el CRM calcula; el agente pregunta y presenta**. Alcance `read`: no lleva cliente. **No escribe nada.**

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `product_id` | sí | un uuid: un producto **usado** de `GET /api/read/v3/products?condition=used`. El usado ya es la variante: modelo, capacidad y color |
| `battery_health` | sí | un entero de 0 a 100, sin ceros a la izquierda: la «Condición de la batería» del iPhone |
| `passed` | no | ids de los puntos que pasaron, separados por coma; hasta 100 |
| `failed` | no | ids de los puntos que no pasaron, separados por coma; hasta 100 |

- **Cada punto activo tiene que estar en `passed` o en `failed`** (U-2). Si falta alguno, no cotiza: `checklist_incomplete`.
- **Un id que no es de un punto activo** (de un checklist viejo, inactivo o de otra organización) **se ignora**. Sin puntos activos, cotiza solo con `battery_health`.
- **Un parámetro mal formado** da `400` con sus `fields`: un id sin forma de uuid, un hueco entre comas o más de 100 ids. `passed` y `failed` repetidos suman sus ids (el tope cuenta todos); `product_id` y `battery_health` repetidos toman el primero. **Un id en las dos listas** da `400` con `fields: ["passed", "failed"]`.
- **Un producto inexistente, inactivo, de servicio o de otra organización** da el `404` del detalle de producto, sin distinguir. Se busca antes que la capacidad.
- **Dos usados que solo cambian de color** no cotizan necesariamente igual: el precio de referencia es el de cada producto.

**Con cotización:**

```json
{
  "contract_version": "3",
  "quote": {
    "product": { "product_id": "9d4a3e6f-7b8c-4d9e-8f01-2b3c4d5e6f70", "name": "iPhone 13 128 GB Usado" },
    "estimate": true,
    "range": { "low": "330.00", "high": "370.00", "currency": "USD" },
    "range_converted": { "low": "396000.00", "high": "444000.00", "currency": "ARS", "rate": "1200", "rate_as_of": "2026-10-22T13:00:00.000Z" },
    "repairs": ["Cambio de pantalla", "Cambio de batería"]
  },
  "reason": null
}
```

| Campo | Notas |
|---|---|
| `range` | el piso y el techo, **los dos redondeados hacia abajo** al paso de la organización. **Si `low` es cero**, el agente presenta «hasta» el techo |
| `range_converted` | el piso y el techo con la regla de §El precio convertido, y `null` en los mismos casos. Un piso en cero es cero en las dos monedas |
| `repairs` | los nombres de los tipos de reparación que se descontaron, sin montos. Sin la capacidad `repairs` no hay costos, así que una reparación necesaria da `not_quotable` y no llega nombrada |
| `estimate` | siempre `true`: la marca de que el rango es orientativo (ADR 0024, punto 15) |

**Sin cotización:** `"quote": null` y un `reason`:

| `reason.code` | Lleva | Qué hace el agente |
|---|---|---|
| `checklist_incomplete` | `item_ids`, los puntos activos sin responder | los pregunta y vuelve a cotizar |
| `not_accepted` | `items`, los nombres de los puntos obligatorios que fallaron | dice que el negocio no recibe el equipo en ese estado |
| `not_quotable` | nada | deriva a una persona |

`not_quotable` junta **todo lo demás** (U-4): un producto que no se cotiza (nuevo, por cantidad o sin modelo), la organización sin la capacidad `trade_ins` o sin valores de la cotización, **los valores todavía de ejemplo** (U-3: el agente nunca cotiza con ellos, en ninguna organización), y lo que falta para calcular: el precio, el margen, el costo de una reparación, la reparación de la batería, montos en monedas distintas o un valor que no da positivo. Los motivos finos los ve el `admin` en su pantalla. Un motivo nuevo de la regla cae en `not_quotable`: el contrato no cambia.

**No trae nunca** el valor exacto, el precio de referencia, el margen, el costo de una reparación, el porcentaje del rango ni el paso del redondeo: con cualquiera de ellos se despeja el margen (brief-29.8.3, H-3). La función del módulo ni siquiera los devuelve.

**Lo que el contrato le pide al agente** (D-5):
- **es orientativa**: nunca «te pagamos» ni un monto fijo. El precio final lo fija una persona al revisar el equipo;
- **no recibe el equipo**: si el cliente quiere traerlo, deriva;
- **no cotiza por su cuenta**, con otra fuente ni con otra variante, cuando la respuesta es `not_quotable` o no hay un usado de esa capacidad.

Fixture, con forma asumida: `trade-in-quote.json`.

## El precio convertido

[ADR 0025](../decisions/0025-tipo-de-cambio.md), punto 10; brief-29.8, D-6 y U-3.

**El CRM convierte; el agente no lee la fuente de la cotización.**

```json
{ "amount": "504000.00", "currency": "ARS", "rate": "1200", "rate_as_of": "2026-10-22T13:00:00.000Z" }
```

- **Cómo se convierte**: con la cotización vigente de la organización y la conversión de `src/shared/money/`, redondeado a los decimales de la moneda de destino, con el medio hacia afuera del cero.
- **`amount`**: con los decimales de la moneda, como `price.amount`.
- **`rate`**: la cotización tal como está guardada, **cuántas unidades de la otra moneda vale una de la moneda principal**, siempre ≥ 1, sin ceros de más a la derecha.
  - **No se invierte nunca.** Es la misma en las dos direcciones: de la principal a la otra se multiplica, y de la otra a la principal se divide.
  - Con `rate: "1200"` y el dólar como moneda principal, USD 420 da ARS 504000, y ARS 120000 da USD 100.
- **`rate_as_of`**: desde cuándo vale esa cotización.
- **Va `null`**:
  - sin moneda principal, configuración o cotización vigente;
  - **si la vigente está vencida**, con más de 24 horas hábiles (U-3);
  - si la moneda del precio no es ninguna de las dos del par;
  - si la conversión redondea a cero o no cabe.

  Con `null`, el emisor ofrece el precio en su moneda y **no convierte por su cuenta**.
- **No hay un total convertido**: solo el precio de cada producto y de cada unidad, *desde la 29.8.2* el de cada reparación y *desde la 29.8.3* el rango de la cotización de un usado. **El presupuesto de una orden no se convierte** (brief-29.8.2, D-4).
- **Lo que dice el agente** (aceptado por el usuario el 2026-10-22): **«a la cotización vigente»**, nunca «de hoy», porque la vigente puede ser de ayer o del viernes. Nunca lo presenta como un precio fijo en esa moneda.

## Lo que nunca se lee

[ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 14.

Ninguna respuesta de este contrato, ni de v1, v2 o la ingestión, trae el IMEI, el costo, el margen, el DNI ni el Instagram. Hay dos pruebas:
- **La guarda `tests/guards/agent-contract-fields.test.ts`** recorre las claves de cada esquema de respuesta y falla si una nombra esos campos. Tiene un caso de fallo por cada clave.
- **`tests/integration/read-api-v3.test.ts`** busca el IMEI y el costo de cada unidad en el cuerpo crudo de la ruta de unidades.
- *Desde la 29.8.2*, **`tests/integration/read-api-v3-repairs.test.ts`** busca en el cuerpo crudo de las dos rutas nuevas el costo de la lista y de cada línea, el IMEI de la orden, lo que reportó el cliente, el nombre del técnico y el teléfono del cliente. Las consultas de esas rutas no leen esas columnas.

## Errores y log

Los de v1. El log lleva las rutas fijas, nunca el id, la búsqueda ni la referencia de una conversación:
- `/api/read/v3/products`;
- `/api/read/v3/products/{product_id}`;
- `/api/read/v3/products/{product_id}/stock`;
- `/api/read/v3/products/{product_id}/units`;
- `/api/read/v3/capabilities`;
- *desde la 29.8.2*, `/api/read/v3/repairs` y `/api/read/v3/service-orders`;
- *desde la 29.8.3*, `/api/read/v3/trade-in-checklist` y `/api/read/v3/trade-in-quote`, nunca el producto ni las respuestas.

## Versionado

Las reglas de v1:
- agregar, quitar o renombrar campos, o cambiar reglas, códigos u orden, exige una versión nueva en otra ruta;
- **una ruta nueva y un valor nuevo de `capabilities` son compatibles**.

## Evidencia

**Validado localmente** (`deterministic`):
- **`src/app/api/read/v3/contract.ts`** es el validador ejecutable: esquemas estrictos, el mapeo campo por campo y la conversión.
- **`src/app/api/read/v3/contract.test.ts`** prueba:
  - la conversión en cada caso de `null`, el redondeo y las dos direcciones con la misma tasa;
  - el orden de las unidades;
  - los esquemas;
  - los fixtures de `tests/fixtures/read/v3/`, de forma asumida.
- **`tests/integration/read-api-v3.test.ts`**, contra PostgreSQL real, prueba:
  - el usado con su seguimiento, modelo, variante y convertido;
  - los filtros, y `model_id` sin la capacidad;
  - v1 y v2 sin el usado;
  - las unidades en su orden, sin el IMEI ni el costo en el cuerpo crudo y sin la dada de baja;
  - el convertido `null` con la cotización vencida y sin configuración;
  - las capacidades;
  - el 404 sin distinguir y el 400;
  - el alcance, la allowlist, el apagado, el límite compartido y la correlación;
  - el log con las rutas fijas.
- *Desde la 29.8.2*, **`tests/integration/read-api-v3-repairs.test.ts`**, contra PostgreSQL real, prueba:
  - la búsqueda por texto y por id, con un modelo que no se vende, dos que empiezan igual, el modelo y el tipo inactivos, y el precio en pesos convertido a dólares;
  - las órdenes del cliente de la conversación, con el presupuesto desde `quoted`, sin la de otro cliente, de otra organización ni de una unidad propia;
  - cada estado con su `status_at` y su presupuesto, también la orden rechazada, entregada o cancelada después del presupuesto, y que una cancelada por error no aparece ni ocupa un lugar del tope;
  - la ventana de 30 días justos, a un milisegundo de cada lado, y el tope de 5;
  - el 404 sin distinguir, la conversación sin cliente y el 400;
  - cada capacidad apagada y el log;
  - el borde en las dos rutas: el alcance, la allowlist, el 401, la correlación válida e inválida y el apagado; el límite de tasa, en la de órdenes, porque es el mismo `serveRead` compartido.

  Las dos comprobaciones de la capacidad `repairs` se quitaron una por vez, y el caso 6 falló en las dos.
- *Desde la 29.8.3*, **`tests/integration/read-api-v3-trade-in-quote.test.ts`**, contra PostgreSQL real, prueba:
  - el checklist activo en su orden, sin el inactivo;
  - el mismo rango que la pantalla del `admin` con las mismas respuestas, el convertido, el convertido `null` con la cotización vencida y un piso en cero;
  - `checklist_incomplete` con los ids que faltan, un id ajeno o inactivo ignorado y `not_accepted` con los nombres;
  - `not_quotable` con los valores de ejemplo, sin margen, sin precio, con un producto nuevo, con una reparación sin costo y sin la capacidad, también con todos los datos intactos;
  - cada `400` por su campo y el mismo `404` para un producto inexistente, ajeno, inactivo o de servicio;
  - el cuerpo crudo sin el valor exacto, el margen, los costos ni el precio de referencia, con montos sembrados;
  - que no escribe: los recuentos de la auditoría y de las tablas de la cotización no cambian;
  - el borde en las dos rutas y el log con las rutas fijas, sin el producto ni las respuestas;
  - los puntos de otra organización con `trade_ins`, que no se ven ni responden los propios.

  Seis mutaciones, una por vez, hicieron fallar la suite: quitar el rechazo de los valores de ejemplo, el de los puntos sin responder, cada una de las dos comprobaciones de `trade_ins`, el `400` de un id en las dos listas y el filtro por organización de los puntos. Los validadores de la consulta tienen sus unitarias en `trade-in-quote/handler.test.ts`.
- **`tests/guards/exposed-surface.test.ts`** declara las nueve rutas.

~~**Sin validar en integración**: todo el contrato, hasta la ventana con el agente.~~ *Desde el 2026-10-23*, las dos rutas de la 29.8.2 están validadas en integración con el agente real (su ventana 3.52, brief-29.8.2, §La ventana). *Desde el 2026-10-25*, también las dos de la 29.8.3, salvo `not_accepted` y `not_quotable` (su ventana 3.53, brief-29.8.3, §La ventana); *desde la 3.54, el mismo día, solo `not_accepted`* (§La ventana corta); *desde la ventana del caso 6, enteras* (§La ventana del caso 6). Los fixtures siguen siendo de forma asumida.
