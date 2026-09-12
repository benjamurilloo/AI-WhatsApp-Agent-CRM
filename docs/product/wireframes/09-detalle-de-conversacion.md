# 09 — Detalle de conversación y timeline

**Estado: diseñado.** Especificación: [Screens.md §9](../Screens.md#9-detalle-de-conversación-y-timeline). Reglas: FR-CONV-02 y FR-CONV-03. Convenciones en el [índice](README.md).

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ ‹ Conversaciones                                                             │
│ María Gómez › · WhatsApp · Estado: Abierta                                   │
│                              {admin} Estado [v Abierta ] [ Cambiar estado ]  │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │                    [ Cargar mensajes anteriores ]                        │ │
│ │                                                                          │ │
│ │ ── 10/09/2026 ──                                                         │ │
│ │ Cliente · 09:12                                                          │ │
│ │ ┌──────────────────────────────────────┐                                 │ │
│ │ │ Hola, ¿tienen café molido?           │                                 │ │
│ │ └──────────────────────────────────────┘                                 │ │
│ │                                                       Negocio · 09:20    │ │
│ │                                ┌──────────────────────────────────────┐  │ │
│ │                                │ Sí, nos quedan 6 unidades.           │  │ │
│ │                                └──────────────────────────────────────┘  │ │
│ │ ── 11/09/2026 ──                                                         │ │
│ │ Cliente · 18:40                                                          │ │
│ │ ┌──────────────────────────────────────┐                                 │ │
│ │ │ <b>Paso mañana</b>                    │  ← texto plano escapado        │ │
│ │ └──────────────────────────────────────┘                                 │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ Horas en America/Argentina/Buenos_Aires                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Del más antiguo al más reciente. Al abrir se ven los 50 más recientes; "Cargar mensajes anteriores" trae 50 más sin mover la posición de lectura. La dirección se nombra con texto ("Cliente" o "Negocio"), además de la alineación.

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ ‹ Conversaciones             │
│ María Gómez ›                │
│ WhatsApp · Estado: Abierta   │
│ {admin}[v Abierta][Cambiar]  │
│                              │
│ [Cargar mensajes anteriores] │
│ ── 10/09/2026 ──             │
│ Cliente · 09:12              │
│ ┌──────────────────────────┐ │
│ │ Hola, ¿tienen café       │ │
│ │ molido?                  │ │
│ └──────────────────────────┘ │
│ Negocio · 09:20              │
│ ┌──────────────────────────┐ │
│ │ Sí, nos quedan 6         │ │
│ │ unidades.                │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

Burbujas a ancho completo: la dirección depende solo de la etiqueta de texto.

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Cliente | derivado: `conversations.client_id` → `clients.display_name`; "Sin cliente" si es nulo | enlaza a la pantalla 7 si existe; sin teléfono |
| Canal | `conversations.channel` | |
| Estado actual | `conversations.status` | |
| Dirección | `messages.direction` | `inbound` → "Cliente", `outbound` → "Negocio" |
| Hora y separador de día | `messages.sent_at` | en la zona de la organización |
| Cuerpo | `messages.body_text` | texto plano escapado, sin HTML ni enlaces automáticos; vacío si es nulo |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Leer el timeline y cargar mensajes anteriores | sí | sí |
| Cambiar el estado (`open`, `pending`, `closed`), auditado | sí | el control no se entrega |
| Responder o enviar mensajes | no existe en el MVP | no existe |

## Estados

- **Carga inicial**: skeleton de burbujas.
- **Cargando anteriores**: indicador en lugar del botón, sin perder la posición.
- **Vacío**: "Esta conversación no tiene mensajes."
- **Mensaje sin texto** (`body_text` nulo): "(mensaje sin texto)".
- **Cambiando el estado**: `[ Cambiando… ]` deshabilitado; al terminar, "Estado cambiado a Cerrada" anunciado con `aria-live`.
- **Conversación inexistente o de otra organización** (`NOT_FOUND`): "Esta conversación no existe. [‹ Volver]".
- **Sin permiso** (`FORBIDDEN`), si un `viewer` fuerza el cambio: "No tenés permiso para esta acción."
- **Error inesperado** (`INTERNAL`): mensaje con `request_id`.
- **Sin resultados**: no aplica, no hay filtros.

## Invariantes

- El cuerpo se renderiza siempre como texto plano escapado.
- La dirección nunca depende solo de la alineación o el color.
- El timeline es una lista semántica.
- No hay acción para enviar mensajes: el CRM no conecta con tráfico real en el MVP.
