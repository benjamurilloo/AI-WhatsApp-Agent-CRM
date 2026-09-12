# 03 — Lista de productos

**Estado: diseñado.** Especificación: [Screens.md §3](../Screens.md#3-lista-de-productos). Convenciones en el [índice](README.md).

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ Productos                                               {admin}[ + Nuevo ]   │
│                                                                              │
│ Buscar [nombre o SKU______________]  Estado [v Todos]  [v Solo activos]      │
│                                                        [ Limpiar filtros ]   │
│                                                                              │
│ SKU        │ Nombre                  │ Stock │ Unidad │ Estado        │Activo│
│────────────┼─────────────────────────┼───────┼────────┼───────────────┼──────│
│ YER-500    │ Yerba 500 g             │   48  │ unidad │ ✓ Disponible  │  Sí  │
│ CAF-250    │ Café molido 250 g       │    6  │ unidad │ ▲ Bajo stock  │  Sí  │
│ AZU-1K     │ Azúcar 1 kg             │    0  │ unidad │ ✕ Sin stock   │  Sí  │
│ …                                                                            │
│                                                                              │
│ 1–25 de 212                                              ‹ 1 2 3 … 9 ›       │
└──────────────────────────────────────────────────────────────────────────────┘
```

Cada fila abre el detalle (pantalla 4). Orden: nombre ascendente. Filtros, orden y página se reflejan en la URL.

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ Productos   {admin}[ + Nuevo]│
│ [nombre o SKU______________] │
│ [v Estado] [v Solo activos]  │
│                              │
│ ┌──────────────────────────┐ │
│ │ Yerba 500 g              │ │
│ │ 48 unidad   ✓ Disponible │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Café molido 250 g        │ │
│ │ 6 unidad    ▲ Bajo stock │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Azúcar 1 kg  · Inactivo  │ │
│ │ 0 unidad    ✕ Sin stock  │ │
│ └──────────────────────────┘ │
│        ‹ 1 2 3 … 9 ›         │
└──────────────────────────────┘
```

La tarjeta muestra nombre, stock con unidad y estado. SKU y "Activo" pasan al detalle; "Inactivo" se marca en la tarjeta solo cuando el filtro incluye inactivos.

## Datos

| Dato | Origen | Notas |
|---|---|---|
| SKU | `products.sku` | |
| Nombre | `products.name` | |
| Stock disponible | `inventories.quantity_on_hand` | unión 1:1 por `product_id` |
| Unidad | `products.unit` | |
| Estado de stock | derivado: FR-PROD-05 (`sin_stock` si 0; `bajo_stock` si `0 < stock <= reorder_point`; `disponible` en otro caso) | texto e ícono además del color. Ver B-10 sobre `min_stock`. |
| Activo | `products.is_active` | |
| Total de resultados | derivado: `COUNT` con los filtros aplicados | |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Buscar, filtrar y paginar | sí | sí |
| Abrir el detalle | sí | sí |
| Crear producto | sí | el botón no se entrega |

## Estados

- **Carga**: la tabla (o las tarjetas) con filas `░░░░`.
- **Vacío**: "Todavía no hay productos." Con `{admin}[ + Crear el primero ]`; el `viewer` ve solo el texto.
- **Sin resultados**: "Ningún producto coincide con estos filtros. [ Limpiar filtros ]".
- **Error** (`INTERNAL`): "No pudimos cargar los productos. Código: `request_id`. [ Reintentar ]".

## Invariantes

- El estado de stock nunca depende solo del color: lleva ícono y texto.
- No hay acciones de ajuste de stock en la lista; se hacen desde la pantalla 5.
