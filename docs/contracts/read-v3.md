# Contrato de lectura v3: el catálogo del rubro

**Estado**:
- **Diseñado e implementado** en la 29.8 ([brief-29.8](../decisions/brief-29.8-el-catalogo-del-rubro-para-el-agente.md), D-1 a D-6), con la confirmación del agente del 2026-10-22 (`Respuesta-29.8-Agente-al-CRM.md`): lo usa tal como está.
- **Validado localmente** con requests sintéticos, contra PostgreSQL real (`deterministic`).
- **No validado en integración**: ningún consumidor real lo leyó todavía. Sus fixtures tienen **forma asumida**. La ventana con el agente los contrasta (brief-29.8, D-11).

## Qué cambia respecto de v2

La v3 es el catálogo de un negocio con rubro ([ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 15): **las tres rutas de productos de [v2](read-v2.md), con el objeto ampliado**, y dos rutas nuevas.

| | v2 | v3 |
|---|---|---|
| Rutas de productos | lista, detalle y stock | las mismas bajo `/api/read/v3/` |
| `contract_version` | `"2"` | `"3"` |
| Productos usados | fuera, desde la 29.5 | **dentro** |
| Productos de servicio | fuera, desde la 29.6 | fuera: son de la 29.8.2 |
| El producto | el objeto de v1 | el de v1, con `condition` que admite `used`, y `tracking`, `model`, `attributes` y `price_converted` |
| Filtros de la lista | `q` y `limit` | más `model_id` y `condition` |
| Rutas nuevas | — | las unidades disponibles de un producto y las capacidades |

**v1 y v2 no cambian** y siguen sin los usados. Las demás rutas de lectura (información del negocio, historial, etiquetas, estado de la conversación y horario) **solo existen en v1**.

*Decidido el 2026-10-22* (brief-29.8, D-4): **no hay ruta de modelos**. El agente busca por `q`. Una ruta nueva dentro de v3 es compatible (§Versionado), así que se suma cuando la pida.

## Transporte

El de v1, sin cambios:
- la credencial de alcance `read`;
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
| `price` | objeto | sí | como en v1. **En un producto por unidad es el precio base**, el que heredan las unidades sin precio propio, y puede no coincidir con ninguna unidad disponible: el precio de cada equipo sale de la ruta de unidades |
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
- **No hay un total convertido**: solo el precio de cada producto y de cada unidad.
- **Lo que dice el agente** (aceptado por el usuario el 2026-10-22): **«a la cotización vigente»**, nunca «de hoy», porque la vigente puede ser de ayer o del viernes. Nunca lo presenta como un precio fijo en esa moneda.

## Lo que nunca se lee

[ADR 0024](../decisions/0024-rubros-y-capacidades.md), punto 14.

Ninguna respuesta de este contrato, ni de v1, v2 o la ingestión, trae el IMEI, el costo, el margen, el DNI ni el Instagram. Hay dos pruebas:
- **La guarda `tests/guards/agent-contract-fields.test.ts`** recorre las claves de cada esquema de respuesta y falla si una nombra esos campos. Tiene un caso de fallo por cada clave.
- **`tests/integration/read-api-v3.test.ts`** busca el IMEI y el costo de cada unidad en el cuerpo crudo de la ruta de unidades.

## Errores y log

Los de v1. El log lleva las rutas fijas, nunca el id ni la búsqueda:
- `/api/read/v3/products`;
- `/api/read/v3/products/{product_id}`;
- `/api/read/v3/products/{product_id}/stock`;
- `/api/read/v3/products/{product_id}/units`;
- `/api/read/v3/capabilities`.

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
- **`tests/guards/exposed-surface.test.ts`** declara las cinco rutas.

**Sin validar en integración**: todo el contrato, hasta la ventana con el agente.
