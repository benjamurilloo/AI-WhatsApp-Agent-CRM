# 04 — Detalle y edición de producto

**Estado: implementado en la 4.4** ([brief-4.4](../../decisions/brief-4.4-ui-de-productos-e-inventario.md)). Especificación: [Screens.md §4](../Screens.md#4-detalle-y-edición-de-producto). Convenciones en el [índice](README.md).

**Notas de implementación**: la edición y la confirmación de desactivar son segundos pasos en la URL (`?editar=1`, `?confirmar=desactivar`), como en la pantalla 10. La auditoría reúne las ediciones del producto y sus ajustes de stock en una sola lista paginada, que arma `catalog` (brief-4.4, D-1).

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ ‹ Productos                                                                  │
│ Café molido 250 g      ▲ Bajo stock   · Activo     {admin}[ Editar ]         │
│                                                    {admin}[ Desactivar ]     │
│                                                                              │
│ ┌─ Datos ─────────────────────────────┐  ┌─ Stock ────────────────────────┐  │
│ │ SKU               CAF-250           │  │ Disponible        6 unidad     │  │
│ │ Nombre            Café molido 250 g │  │ Punto de reposic. 10           │  │
│ │ Descripción       Tostado medio     │  │                                │  │
│ │ Unidad            unidad            │  │                                │  │
│ └─────────────────────────────────────┘  │ Últimos movimientos            │  │
│                                          │ 10/09 14:02 Ajuste − 4  Rotura │  │
│                                          │ 02/09 09:15 Ajuste + 10 Conteo │  │
│                                          │ [ Ver historial y ajustar › ]  │  │
│                                          └────────────────────────────────┘  │
│                                                                              │
│ {admin} ┌─ Historial de auditoría ─────────────────────────────────────────┐ │
│         │ Fecha        │ Autor      │ Acción      │ Cambio                 │ │
│         │ 10/09 14:02  │ Ana Pérez  │ Ajuste stock│ 10 → 6                 │ │
│         │ 01/09 11:30  │ Ana Pérez  │ Edición     │ Punto reposic.: 5 → 10 │ │
│         │ …                                          ‹ 1 2 ›               │ │
│         └──────────────────────────────────────────────────────────────────┘ │
│ Fechas en America/Argentina/Buenos_Aires                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Modo edición (solo `admin`)

```text
│ ┌─ Editar producto ───────────────────────────────────────┐                  │
│ │ SKU *             [CAF-250_____________]                │                  │
│ │                   ⚠ Ya existe un producto con ese SKU.  │ ← aria-describedby│
│ │ Nombre *          [Café molido 250 g___]                │                  │
│ │ Descripción       [Tostado medio_______]                │                  │
│ │ Unidad *          [unidad______________]                │                  │
│ │ Punto de reposición * [10__]                            │                  │
│ │                                                         │                  │
│ │ El stock no se edita acá: se ajusta en el historial.    │                  │
│ │                          [ Cancelar ]  [ Guardar ]      │                  │
│ └─────────────────────────────────────────────────────────┘                  │
```

### Confirmación de desactivación

```text
┌─ ¿Desactivar "Café molido 250 g"? ───────────────────────┐
│ Dejará de aparecer en las búsquedas por defecto y no      │
│ podrá recibir ajustes de stock. Podés reactivarlo luego.  │
│                        [ Cancelar ]  [ Sí, desactivar ]   │
└───────────────────────────────────────────────────────────┘
```

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ ‹ Productos                  │
│ Café molido 250 g            │
│ ▲ Bajo stock · Activo        │
│ {admin}[ Editar ][Desactivar]│
│                              │
│ Stock                        │
│ Disponible   6 unidad        │
│ Punto de reposición 10       │
│ [ Ver historial y ajustar › ]│
│                              │
│ Datos                        │
│ SKU          CAF-250         │
│ Descripción  Tostado medio   │
│ Unidad       unidad          │
│                              │
│ {admin} Auditoría            │
│ ┌──────────────────────────┐ │
│ │ 10/09 14:02 · Ana Pérez  │ │
│ │ Ajuste stock: 10 → 6     │ │
│ └──────────────────────────┘ │
│        ‹ 1 2 ›               │
└──────────────────────────────┘
```

En móvil el formulario de edición pasa a una columna, con los mismos campos.

## Datos

| Dato | Origen | Notas |
|---|---|---|
| SKU, nombre, descripción, unidad | `products.sku`, `.name`, `.description`, `.unit` | |
| Estado de stock | derivado: FR-PROD-05 | |
| Activo | `products.is_active` | |
| Stock disponible | `inventories.quantity_on_hand` | solo lectura en esta pantalla |
| Punto de reposición | `products.reorder_point` | único umbral del estado de stock; `min_stock` se quitó (D-10 de la 1.2) |
| Últimos movimientos (fecha, tipo, cantidad, motivo) | `inventory_movements.created_at`, `.type`, `.quantity`, `.reason` | los 2 o 3 más recientes; el signo sale de `type` |
| Auditoría: fecha | `audit_logs.created_at` | |
| Auditoría: autor | derivado: `audit_logs.actor_user_id` → `users.name` | |
| Auditoría: acción | `audit_logs.action` | con texto legible |
| Auditoría: cambio | `audit_logs.diff` | solo los campos relevantes, sin IDs internos |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Ver datos, stock y últimos movimientos | sí | sí |
| Editar | sí | no se entrega |
| Desactivar o reactivar, con confirmación | sí | no se entrega |
| Ver auditoría | sí | el servidor no la entrega |
| Ir al historial y ajuste (pantalla 5) | sí | sí (solo historial) |

## Estados

- **Carga**: skeleton del bloque de datos, del bloque de stock y de la auditoría, por separado.
- **Vacío**: no aplica al producto. Sin movimientos: "Sin movimientos todavía". Auditoría sin registros: no ocurre, porque la creación ya se audita.
- **Validación** (`VALIDATION_ERROR`): mensaje junto a cada campo, foco al primer error.
- **SKU duplicado** (`CONFLICT`): mensaje en el campo SKU.
- **Producto inexistente o de otra organización** (`NOT_FOUND`): "Este producto no existe. [‹ Volver a productos]".
- **Sin permiso** (`FORBIDDEN`), si un `viewer` fuerza la edición por URL: "No tenés permiso para esta acción."
- **Error inesperado** (`INTERNAL`): mensaje con `request_id`.
- **Guardando**: `[ Guardando… ]` deshabilitado.

## Invariantes

- La auditoría nunca llega a un `viewer`.
- El stock no es un campo editable: cambia solo con un ajuste en la pantalla 5.
- Desactivar pide confirmación explícita.
