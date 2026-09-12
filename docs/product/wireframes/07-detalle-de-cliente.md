# 07 — Detalle y edición de cliente

**Estado: diseñado.** Especificación: [Screens.md §7](../Screens.md#7-detalle-y-edición-de-cliente). Reglas: FR-CLI-01 a 07. Convenciones en el [índice](README.md).

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ ‹ Clientes                                                                   │
│ María Gómez   · Activo                          {admin}[ Editar ]            │
│                                                 {admin}[ Desactivar ]        │
│                                                                              │
│ ┌─ Datos ──────────────────────────────────────────────────────────────────┐ │
│ │ Teléfono            +54 9 11 5555-1234     ← viewer: •••• 1234           │ │
│ │ Notas               Prefiere retirar por la tarde.                       │ │
│ │ Última interacción  11/09 18:40 · WhatsApp                               │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Conversaciones                          Estado [v Todos]                     │
│ Inicio        │ Canal    │ Estado     │ Último mensaje │ Mensajes │          │
│───────────────┼──────────┼────────────┼────────────────┼──────────┼──────────│
│ 10/09 09:12   │ WhatsApp │ Abierta    │ 11/09 18:40    │    14    │ [Abrir]  │
│ 21/08 16:30   │ WhatsApp │ Cerrada    │ 22/08 10:02    │     6    │ [Abrir]  │
│ …                                                        ‹ 1 2 ›             │
│                                                                              │
│ {admin} ┌─ Historial de auditoría ─────────────────────────────────────────┐ │
│         │ Fecha        │ Autor      │ Acción      │ Cambio                 │ │
│         │ 10/09 11:02  │ Ana Pérez  │ Edición     │ Notas actualizadas     │ │
│         │ 01/09 16:30  │ Ana Pérez  │ Alta        │ —                      │ │
│         │                                            ‹ 1 ›                 │ │
│         └──────────────────────────────────────────────────────────────────┘ │
│ Fechas en America/Argentina/Buenos_Aires                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Modo edición (solo `admin`)

```text
│ ┌─ Editar cliente ─────────────────────────────────────────┐                 │
│ │ Nombre *     [María Gómez_______________]                │                 │
│ │ Teléfono     [+5491155551234____________]                │                 │
│ │              Formato internacional, ej. +5491155551234   │                 │
│ │              ⚠ Ya existe un cliente con ese teléfono.    │                 │
│ │ Notas        [Prefiere retirar por la tarde.__________]  │                 │
│ │              No registres datos sensibles innecesarios.  │                 │
│ │                            [ Cancelar ]  [ Guardar ]     │                 │
│ └──────────────────────────────────────────────────────────┘                 │
```

La desactivación usa la misma confirmación que la pantalla 4.

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ ‹ Clientes                   │
│ María Gómez · Activo         │
│ {admin}[ Editar ][Desactivar]│
│                              │
│ Teléfono                     │
│ +54 9 11 5555-1234           │  ← viewer: •••• 1234
│ Notas                        │
│ Prefiere retirar por la tarde│
│ Última interacción           │
│ 11/09 18:40 · WhatsApp       │
│                              │
│ Conversaciones  [v Estado]   │
│ ┌──────────────────────────┐ │
│ │ Abierta · WhatsApp       │ │
│ │ Inicio 10/09 · 14 mens.  │ │
│ │ Último 11/09 18:40       │ │
│ └──────────────────────────┘ │
│          ‹ 1 2 ›             │
│                              │
│ {admin} Auditoría            │
│ ┌──────────────────────────┐ │
│ │ 10/09 11:02 · Ana Pérez  │ │
│ │ Edición: notas           │ │
│ └──────────────────────────┘ │
│            ‹ 1 ›             │
└──────────────────────────────┘
```

Datos arriba, conversaciones abajo. Cada tarjeta abre la conversación (pantalla 9).

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Nombre | `clients.display_name` | |
| Activo | `clients.is_active` | |
| Teléfono (`admin`) | `clients.phone_e164` | |
| Teléfono (`viewer`) | derivado en el servidor: últimos 4 dígitos | extensión de D-1 al detalle, confirmada por el usuario el 2026-09-12 |
| Notas | `clients.notes` | con aviso de minimización |
| Última interacción: fecha y canal | derivado: la conversación del cliente con mayor `last_message_at`, su `last_message_at` y su `channel` | sin contenido; índice `(organization_id, client_id, last_message_at desc)` (D-2 de la 1.2) |
| Conversaciones: inicio, canal, estado, último mensaje | `conversations.started_at`, `.channel`, `.status`, `.last_message_at` | ordenadas por último mensaje, mismo índice |
| Conversaciones: cantidad de mensajes | derivado: `COUNT(messages)` sobre las filas de la página | D-3 de la 1.2 |
| Auditoría: fecha, autor, acción, cambio | `audit_logs.created_at`, `.actor_user_id` → `users.name`, `.action`, `.diff` con `entity_type = 'client'` | solo `admin` (D-8 de la 1.2) |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Ver datos y conversaciones, filtrar por estado | sí | sí |
| Abrir una conversación | sí | sí |
| Editar | sí | no se entrega |
| Desactivar o reactivar, con confirmación | sí | no se entrega |
| Ver auditoría del cliente | sí | el servidor no la entrega |

## Estados

- **Carga**: los datos del cliente y la lista de conversaciones cargan por separado, cada uno con su skeleton.
- **Vacío**: "Sin conversaciones registradas."
- **Sin resultados**: "Ninguna conversación con este estado. [ Limpiar filtro ]".
- **Validación** (`VALIDATION_ERROR`): formato E.164 inválido o nombre vacío, junto al campo.
- **Teléfono duplicado** (`CONFLICT`): mensaje en el campo teléfono.
- **Cliente inexistente o de otra organización** (`NOT_FOUND`): "Este cliente no existe. [‹ Volver a clientes]".
- **Error inesperado** (`INTERNAL`): mensaje con `request_id`.

## Invariantes

- El teléfono completo nunca llega a un `viewer`, tampoco en el formulario de edición (que el `viewer` no recibe).
- La última interacción no muestra contenido de mensajes.
- Las notas llevan el aviso para no registrar datos sensibles.
- La auditoría nunca llega a un `viewer`.
