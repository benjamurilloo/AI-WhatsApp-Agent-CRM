# 08 — Lista de conversaciones

**Estado: diseñado.** Especificación: [Screens.md §8](../Screens.md#8-lista-de-conversaciones). Reglas: FR-CONV-01 y FR-CONV-03. Convenciones en el [índice](README.md).

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ Conversaciones                                                               │
│                                                                              │
│ Período (último mensaje) [v Últimos 30 días]  Estado [v Todos]               │
│ Canal [v Todos]   Cliente [buscar cliente_______]   [ Limpiar filtros ]      │
│                                                                              │
│ Cliente            │ Canal    │ Estado      │ Inicio      │ Último mens. │ N │
│────────────────────┼──────────┼─────────────┼─────────────┼──────────────┼───│
│ María Gómez        │ WhatsApp │ Abierta     │ 10/09 09:12 │ 11/09 18:40  │ 14│
│ Sin cliente        │ WhatsApp │ Pendiente   │ 11/09 08:03 │ 11/09 08:10  │  3│
│ Juan Ruiz          │ WhatsApp │ Cerrada     │ 05/09 12:00 │ 09/09 10:05  │ 22│
│ …                                                                            │
│ 1–25 de 156                                             ‹ 1 2 … 7 ›          │
│ N = cantidad de mensajes · Fechas en America/Argentina/Buenos_Aires          │
└──────────────────────────────────────────────────────────────────────────────┘
```

Orden: último mensaje, del más reciente al más antiguo. Cada fila abre el detalle (pantalla 9). No hay columna de vista previa.

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ Conversaciones               │
│ [v Período] [v Estado]       │
│ [v Canal]   [buscar cliente] │
│                              │
│ ┌──────────────────────────┐ │
│ │ María Gómez              │ │
│ │ Abierta · WhatsApp       │ │
│ │ Último 11/09 18:40 · 14 m│ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Sin cliente              │ │
│ │ Pendiente · WhatsApp     │ │
│ │ Último 11/09 08:10 · 3 m │ │
│ └──────────────────────────┘ │
│        ‹ 1 2 … 7 ›           │
└──────────────────────────────┘
```

La tarjeta muestra cliente, estado, canal, último mensaje y cantidad. El inicio pasa al detalle.

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Cliente | derivado: `conversations.client_id` → `clients.display_name`; "Sin cliente" si es nulo | nunca el teléfono |
| Canal | `conversations.channel` | |
| Estado | `conversations.status` | con texto |
| Inicio | `conversations.started_at` | |
| Último mensaje (fecha) | `conversations.last_message_at` | filtro de período y orden con índice `(organization_id, last_message_at desc)` (D-4 de la 1.2) |
| Cantidad de mensajes | derivado: `COUNT(messages)` sobre las 25 filas de la página | D-3 de la 1.2 |
| Opciones del filtro de cliente | `clients.display_name` | búsqueda por nombre |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Filtrar por período, estado, canal y cliente; paginar | sí | sí |
| Abrir el detalle | sí | sí |
| Cambiar el estado desde la lista | no existe; se cambia en la pantalla 9 | no existe |

## Estados

- **Carga**: skeleton.
- **Vacío**: "No hay conversaciones." En el MVP solo existen las de seeds o tests de ingestión.
- **Sin resultados**: "Ninguna conversación coincide con estos filtros. [ Limpiar filtros ]".
- **Error** (`INTERNAL`): mensaje con `request_id` y `[ Reintentar ]`.

## Invariantes

- No hay vista previa del contenido de ningún mensaje, ni truncada. La consulta no trae el cuerpo.
- El estado se muestra con texto, no solo con color.
- No se muestra el teléfono del cliente.
