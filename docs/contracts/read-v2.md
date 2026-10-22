# Contrato de lectura v2: productos con lo disponible

**Estado**:
- **Diseñado e implementado** en la 19.4.1 ([brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), D-12), a pedido del agente (respuesta al pedido 19.4 del 2026-10-11).
- **Validado localmente** con requests sintéticos (`deterministic`).
- **Validado en integración** con el agente como consumidor real, en producción, en la organización de demostración, el 2026-10-12 (19.4.3): la búsqueda, el detalle y el stock, conciliados por `X-Request-Id` contra el journal. **Lo disponible con reservas no se vio en producción**: no había nada reservado.
- *Nota del 2026-10-22, 29.8* ([brief-29.8](../decisions/brief-29.8-el-catalogo-del-rubro-para-el-agente.md), H-8), sin cambiar la conducta. Como en v1, **desde la 29.5 los productos usados y desde la 29.6 los de servicio no aparecen**, y dan el 404 del detalle y del stock. El documento no lo decía. Los usados, con su modelo, su variante y sus unidades, se leen por [read-v3](read-v3.md); el agente informó el 2026-10-22 que deja de usar v2 cuando adopte v3.

## Qué cambia respecto de v1

La v2 son **las tres rutas de productos de [v1](read-v1.md)**, con una regla distinta: **el estado de stock sale de lo disponible**, que es el saldo físico menos lo reservado por los pedidos confirmados ([ADR 0020](../decisions/0020-el-pedido.md), puntos 4 y 7). La ruta del stock entrega además los tres números.

| | v1 | v2 |
|---|---|---|
| Rutas | `/api/read/v1/products`, `/products/{product_id}` y `/products/{product_id}/stock` | las mismas bajo `/api/read/v2/` |
| `contract_version` | `"1"` | `"2"` |
| `stock_status` | del saldo físico | **de lo disponible** |
| Cantidades del stock | `quantity_available`: el saldo físico | `quantity_on_hand`, `quantity_reserved` y `quantity_available` (físico menos reservado) |

**v1 no cambia** y sigue funcionando: entrega el saldo físico como `quantity_available`, como desde la 16.6, y lo fijan `read-api.test.ts` (6d) y `read-api-product-stock.test.ts` (8b). **v1 y v2 conviven** hasta que el agente migre, con su aviso (§Versionado de v1). Las demás rutas de lectura (información del negocio, historial, etiquetas, estado de la conversación y horario) **solo existen en v1**: no dependen del stock.

## Transporte

El de v1, sin cambios: la credencial de alcance `read`, el modo de prueba (`READ_API_ENABLED` y `READ_API_ALLOWED_CREDENTIALS`), **el mismo presupuesto de 120 pedidos por minuto que v1** (una lectura por v1 y otra por v2 cuentan juntas), la correlación, los encabezados y el orden de las comprobaciones. Una sesión del CRM no autentica.

## Rutas

### `GET /api/read/v2/products` y `GET /api/read/v2/products/{product_id}`

Iguales a sus v1: los mismos parámetros, el mismo orden, el mismo 404 sin distinguir para un producto inactivo, de otra organización o inexistente, y **el mismo objeto producto**. Solo cambian `contract_version`, que es `"2"`, y la regla de `stock_status`, que sale de lo disponible:

- `disponible`, `bajo_stock` o `sin_stock`, con las mismas reglas que en v1 (el punto de reposición del producto), aplicadas a lo disponible;
- **sin la cantidad**, como en v1.

Un producto con 10 unidades físicas, 8 reservadas y punto de reposición 5 es `disponible` en v1 y `bajo_stock` en v2.

### `GET /api/read/v2/products/{product_id}/stock`

- **Respuesta `200`**:

  ```json
  {
    "contract_version": "2",
    "product_id": "…",
    "quantity_on_hand": "10",
    "quantity_reserved": "8",
    "quantity_available": "2",
    "unit": "unidad",
    "stock_status": "bajo_stock"
  }
  ```

- **Las tres cantidades** son decimales en texto, **nunca un número de JSON**, en la forma canónica de v1: sin ceros de más a la derecha y hasta tres decimales (`"12"`, `"2.5"`, `"0"`). Nunca son `null`: un producto sin movimientos tiene las tres en 0.
- **`quantity_available`** es exactamente `quantity_on_hand` menos `quantity_reserved`, y nunca es negativa: la base no deja que lo reservado supere al saldo.
- **`stock_status`** se deriva de `quantity_available`: nunca contradice ese número.
- **Lo que dice el agente** lo decide el agente. Informó que dirá solo lo disponible, y que los otros dos números le sirven para explicar una diferencia y para las pruebas.
- El mismo 404 y el mismo 400 que v1. **No trae** el punto de reposición, los movimientos, los pedidos que reservan ni la auditoría.

## Errores y log

Los de v1. El log lleva las rutas fijas `/api/read/v2/products`, `/api/read/v2/products/{product_id}` y `/api/read/v2/products/{product_id}/stock`, nunca el id ni la búsqueda.

## Versionado

Las reglas de v1: agregar, quitar o renombrar campos, o cambiar reglas, códigos u orden, exige una versión nueva en otra ruta.

## Evidencia

- **Validado localmente** (`deterministic`):
  - `src/app/api/read/v2/contract.ts` es el validador ejecutable: esquemas estrictos, con el objeto producto de v1;
  - `src/app/api/read/v2/contract.test.ts`: el mapeo de las tres cantidades y los fixtures de `tests/fixtures/read/v2/` (búsqueda, detalle y stock), de forma asumida;
  - `tests/integration/read-api-v2.test.ts`, contra PostgreSQL real: los tres números y el estado con reservas, decimales, todo reservado y sin fila; la búsqueda y el detalle con la forma de v1 y el estado de lo disponible, frente a la v1 con el físico para el mismo producto; el 404 sin distinguir y el 400; el alcance; el borde, con el límite compartido entre v1 y v2; y el log con las rutas fijas;
  - `tests/guards/exposed-surface.test.ts` declara las tres rutas.
- **Validado en integración** (19.4.3, [brief-19.4](../decisions/brief-19.4-el-pedido-del-agente.md), §La conciliación de la lectura v2): la lectura de control del agente y tres turnos reales, con `tests/fixtures/read/v2/captured-product-stock.json` como captura.
- **Sin validar en producción**: un stock con reservas. Lo cubren `read-api-v2.test.ts` y los fixtures de forma asumida.
