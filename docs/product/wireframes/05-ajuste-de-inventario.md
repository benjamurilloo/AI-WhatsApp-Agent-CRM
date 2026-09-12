# 05 — Ajuste de inventario e historial de movimientos

**Estado: diseñado.** Especificación: [Screens.md §5](../Screens.md#5-ajuste-de-inventario-e-historial-de-movimientos). Reglas: FR-PROD-06 a 09 y [ADR 0008](../../decisions/0008-stock-nunca-negativo.md). Convenciones en el [índice](README.md).

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ ‹ Café molido 250 g                                                          │
│ Inventario · Stock actual: 6 unidad                                          │
│                                                                              │
│ {admin} ┌─ Registrar ajuste ───────────────────────────────────────────────┐ │
│         │ Tipo *      (•) Positivo (+)   ( ) Negativo (−)                  │ │
│         │ Cantidad *  [4_____]  (mayor a 0)                                │ │
│         │ Motivo *    [Rotura en depósito______________________________]   │ │
│         │                                                                  │ │
│         │ Saldo resultante: 6 − 4 = 2 unidad          ← aria-live          │ │
│         │                                         [ Confirmar ajuste ]     │ │
│         └──────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Historial de movimientos                                                     │
│ Tipo [v Todos]   Período [v Últimos 30 días]   [ Limpiar filtros ]           │
│                                                                              │
│ Fecha        │ Tipo           │ Cantidad │ Saldo result. │ Motivo  │ Autor   │
│──────────────┼────────────────┼──────────┼───────────────┼─────────┼─────────│
│ 10/09 14:02  │ Ajuste negativo│   − 4    │       6       │ Rotura  │ Ana P.  │
│ 02/09 09:15  │ Ajuste positivo│   + 10   │      10       │ Conteo  │ Ana P.  │
│ …                                                                            │
│ 1–25 de 31                                               ‹ 1 2 ›             │
│ Fechas en America/Argentina/Buenos_Aires                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

Orden: del más reciente al más antiguo. No hay ninguna acción por fila: los movimientos no se editan ni se borran.

### Rechazo por saldo negativo

```text
│         │ Tipo *      ( ) Positivo (+)   (•) Negativo (−)                  │
│         │ Cantidad *  [9_____]                                             │
│         │ Saldo resultante: 6 − 9 = −3  ✕ No permitido                     │
│         │ ┌──────────────────────────────────────────────────────────────┐ │
│         │ │ ⚠ El ajuste dejaría el stock negativo. Saldo actual: 6,      │ │
│         │ │   cantidad solicitada: 9. No se registró ningún movimiento.  │ │
│         │ └──────────────────────────────────────────────────────────────┘ │
│         │                               [ Confirmar ajuste ] (deshabil.)   │
```

### Conflicto por cambio concurrente

```text
│         │ ⚠ El stock cambió mientras registrabas el ajuste.                │
│         │   Saldo actualizado: 4. Nuevo saldo resultante: 4 − 4 = 0.       │
│         │   Revisá y confirmá de nuevo.        [ Confirmar ajuste ]        │
```

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ ‹ Café molido 250 g          │
│ Stock actual: 6 unidad       │
│                              │
│ {admin} Registrar ajuste     │
│ (•) Positivo  ( ) Negativo   │
│ Cantidad * [4_____]          │
│ Motivo *                     │
│ [__________________________] │
│ Saldo resultante: 2 unidad   │
│ [    Confirmar ajuste      ] │
│                              │
│ Historial                    │
│ [v Tipo] [v Período]         │
│ ┌──────────────────────────┐ │
│ │ 10/09 14:02 · Ana Pérez  │ │
│ │ Ajuste negativo  − 4     │ │
│ │ Saldo: 6 · Rotura        │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ 02/09 09:15 · Ana Pérez  │ │
│ │ Ajuste positivo  + 10    │ │
│ │ Saldo: 10 · Conteo       │ │
│ └──────────────────────────┘ │
│          ‹ 1 2 ›             │
└──────────────────────────────┘
```

Formulario arriba, historial en tarjetas debajo.

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Nombre del producto | `products.name` | |
| Stock actual | `inventories.quantity_on_hand` | |
| Saldo resultante del formulario | derivado: stock actual ± cantidad según el tipo | vista previa en el cliente; el servidor vuelve a validar |
| Fecha | `inventory_movements.created_at` | |
| Tipo | `inventory_movements.type` | solo `adjustment_positive` y `adjustment_negative`; el filtro ofrece esos dos (D-11 de la 1.2) |
| Cantidad con signo | derivado: `inventory_movements.quantity` con el signo que da `type` | `quantity` siempre es > 0 |
| Saldo resultante por movimiento | `inventory_movements.balance_after` | escrito en la misma transacción que el ajuste (D-1 de la 1.2) |
| Motivo | `inventory_movements.reason` | |
| Autor | derivado: `inventory_movements.created_by` → `users.name` | |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Ver stock e historial, filtrar y paginar | sí | sí |
| Registrar ajuste | sí | el formulario no se entrega |
| Editar o borrar un movimiento | no existe | no existe |

## Estados

- **Carga del historial**: tabla o tarjetas con `░░░░`.
- **Enviando el ajuste**: `[ Confirmando… ]` deshabilitado hasta que responde el servidor.
- **Vacío**: "Este producto no tiene movimientos."
- **Sin resultados**: "Ningún movimiento coincide con estos filtros. [ Limpiar filtros ]".
- **Validación** (`VALIDATION_ERROR`): cantidad ≤ 0 o motivo vacío, junto al campo.
- **Saldo negativo** (`BUSINESS_RULE_VIOLATION`): mensaje con saldo actual y cantidad solicitada, sin movimiento registrado.
- **Producto desactivado** (`BUSINESS_RULE_VIOLATION`): "Este producto está desactivado y no admite ajustes." El formulario no se muestra.
- **Cambio concurrente** (`CONFLICT`): se recarga el saldo y se pide confirmar de nuevo.
- **Producto inexistente** (`NOT_FOUND`) y **error inesperado** (`INTERNAL`): generales.

## Invariantes

- No existe acción para editar ni borrar un movimiento.
- El formulario no ofrece forma de dejar el stock negativo: el servidor lo rechaza aunque se fuerce.
- El motivo es obligatorio en todo ajuste.
- El saldo resultante se anuncia con `aria-live`.
