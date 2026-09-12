# 06 — Lista de clientes

**Estado: diseñado.** Especificación: [Screens.md §6](../Screens.md#6-lista-de-clientes). Reglas: FR-CLI-03 y FR-CLI-06. Convenciones en el [índice](README.md).

## Escritorio, vista `admin`

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ Clientes                                                {admin}[ + Nuevo ]   │
│                                                                              │
│ Buscar [nombre o teléfono completo_____]  [v Solo activos]                   │
│                                           [ Limpiar filtros ]                │
│                                                                              │
│ Nombre                  │ Teléfono            │ Última interacción │ Activo  │
│─────────────────────────┼─────────────────────┼────────────────────┼─────────│
│ María Gómez             │ +54 9 11 5555-1234  │ 11/09 18:40        │   Sí    │
│ Juan Ruiz               │ +54 9 11 5555-8812  │ 09/09 10:05        │   Sí    │
│ Lucía Fernández         │ —                   │ Sin interacciones  │   Sí    │
│ …                                                                            │
│ 1–25 de 340                                            ‹ 1 2 3 … 14 ›        │
│ Fechas en America/Argentina/Buenos_Aires                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Escritorio, vista `viewer`

```text
│ Clientes                                                                     │
│                                                                              │
│ Buscar [nombre o teléfono completo_____]  [v Solo activos]                   │
│                                                                              │
│ Nombre                  │ Teléfono            │ Última interacción │ Activo  │
│─────────────────────────┼─────────────────────┼────────────────────┼─────────│
│ María Gómez             │ •••• 1234           │ 11/09 18:40        │   Sí    │
│ Juan Ruiz               │ •••• 8812           │ 09/09 10:05        │   Sí    │
```

El `viewer` no recibe el botón "Nuevo" ni el número completo. `•••• 1234` tiene el texto accesible "Teléfono enmascarado, termina en 1234".

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ Clientes    {admin}[ + Nuevo]│
│ [nombre o teléfono_________] │
│ [v Solo activos]             │
│                              │
│ ┌──────────────────────────┐ │
│ │ María Gómez              │ │
│ │ +54 9 11 5555-1234       │ │  ← viewer: •••• 1234
│ │ Última: 11/09 18:40      │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Lucía Fernández          │ │
│ │ Sin teléfono             │ │
│ │ Sin interacciones        │ │
│ └──────────────────────────┘ │
│       ‹ 1 2 3 … 14 ›         │
└──────────────────────────────┘
```

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Nombre | `clients.display_name` | |
| Teléfono (`admin`) | `clients.phone_e164` | formateado para lectura; `—` si es nulo |
| Teléfono (`viewer`) | derivado en el servidor: últimos 4 dígitos de `clients.phone_e164` | la respuesta no contiene el número completo |
| Última interacción | derivado: `MAX(conversations.last_message_at)` del cliente | orden de la lista; sin índice que lo sirva, **BRECHA B-2** |
| Activo | `clients.is_active` | |
| Total de resultados | derivado: `COUNT` con filtros | |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Buscar por nombre o por teléfono completo | sí | sí; el filtro se resuelve en la consulta |
| Filtrar activos o inactivos, paginar | sí | sí |
| Abrir el detalle | sí | sí |
| Crear cliente | sí | no se entrega |

## Estados

- **Carga**: skeleton de tabla o tarjetas.
- **Vacío**: "Todavía no hay clientes." Con `{admin}[ + Crear el primero ]`.
- **Sin resultados**: "Ningún cliente coincide con esta búsqueda. [ Limpiar filtros ]".
- **Error** (`INTERNAL`): mensaje con `request_id` y `[ Reintentar ]`.

## Invariantes

- El teléfono completo nunca llega a un `viewer`, en la tabla ni en las tarjetas.
- Buscar por teléfono completo no revela el número al `viewer`: la fila se muestra enmascarada igual.
- No se muestra contenido de mensajes en la última interacción, solo la fecha.
