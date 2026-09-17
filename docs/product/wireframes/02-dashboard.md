# 02 — Dashboard

**Estado: implementado y validado en integración** en la subfase 7.4 ([brief-7.4](../../decisions/brief-7.4-dashboard.md)), con datos sintéticos. Tres detalles se resolvieron ahí: la pantalla vive en `/` y el marco común la enlaza como "Dashboard" en lugar de "Inicio" (D-1); "Definición" es un desplegable con el texto en la pantalla, no un enlace al catálogo, que no se sirve desde la aplicación (D-3); el selector de serie del gráfico son dos enlaces que viajan en la URL, sin estado de cliente (D-4). Especificación: [Screens.md §2](../Screens.md#2-dashboard). Métricas: [MetricsCatalog.md](../../analytics/MetricsCatalog.md). Convenciones en el [índice](README.md).

Este es el único wireframe que dibuja el marco común; las demás pantallas lo omiten.

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Tienda Ejemplo │ Dashboard · Productos · Clientes · Conversaciones · {admin}  │
│                │ Usuarios                          Ana Pérez (admin) [Salir]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Dashboard                                                                    │
│ Período: [v Últimos 30 días completos]   Zona horaria: America/Argentina/... │
│ Del 13/08/2026 al 11/09/2026 (hoy no incluido)                               │
│                                                                              │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │
│ │ 1 Conversac.  │ │ 2 Con         │ │ 3 Clientes    │ │ 4 Mensajes    │      │
│ │   iniciadas   │ │   actividad   │ │   únicos      │ │   entrantes   │      │
│ │      128      │ │      156      │ │      97       │ │     1.204     │      │
│ │ Definición ›  │ │ Definición ›  │ │ 12 sin cliente│ │ Definición ›  │      │
│ └───────────────┘ └───────────────┘ │ Definición ›  │ └───────────────┘      │
│                                     └───────────────┘                        │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐      │
│ │ 5 Mensajes    │ │ 6 Mensajes    │ │ 7 Conversac.  │ │ 8 Cobertura   │      │
│ │   salientes   │ │   por conv.   │ │   respondidas │ │   de respuesta│      │
│ │      987      │ │ Prom. 14,0    │ │      131      │ │     88,5 %    │      │
│ │ Definición ›  │ │ Mediana 9     │ │ Definición ›  │ │ Definición ›  │      │
│ └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘      │
│ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐                        │
│ │ 9 Mediana 1.ª │ │ 11 Por estado │ │ 12 Errores de │                        │
│ │   respuesta   │ │ Abiertas   40 │ │    ingestión  │                        │
│ │   12,4 min    │ │ Pendientes 16 │ │ No disponible │                        │
│ │ 7 sin 1.ª resp│ │ Cerradas  100 │ │ Definición ›  │                        │
│ │ Definición ›  │ │ Definición ›  │ └───────────────┘                        │
│ └───────────────┘ └───────────────┘                                          │
│                                                                              │
│ 10 Evolución diaria        (•) Conversaciones  ( ) Mensajes  [Ver tabla]     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  ▁▃▅▂▇▆▃▁▂▅▆▇▅▃▂▁▃▅▆▇▅▃▂▁▂▃▅▆▇▅                                            │ │
│ │  13/08                                                          11/09    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ "Con actividad" diario no se suma: una conversación activa varios días       │
│ cuenta una vez por día.                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Móvil

```text
┌──────────────────────────────┐
│ Tienda Ejemplo           [≡] │
├──────────────────────────────┤
│ Dashboard                    │
│ [v Últimos 30 días completos]│
│ 13/08 – 11/09 · Buenos Aires │
│                              │
│ ┌──────────────────────────┐ │
│ │ 1 Conversaciones inic.   │ │
│ │ 128          Definición ›│ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ 2 Con actividad          │ │
│ │ 156          Definición ›│ │
│ └──────────────────────────┘ │
│   … una tarjeta por fila,    │
│   mismo orden: 3 a 9, 11, 12 │
│                              │
│ 10 Evolución diaria          │
│ ┌──────────────────────────┐ │
│ │ ▁▃▅▂▇▆▃▁▂▅▆▇ →  (desliza)│ │
│ └──────────────────────────┘ │
│ [ Ver tabla de datos ]       │
└──────────────────────────────┘
```

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Nombre de la organización | `organizations.name` | marco común |
| Nombre y rol del usuario | `users.name`, `organization_members.role` | marco común |
| Período activo | derivado: por defecto, los últimos 30 días completos en la zona de la organización, sin hoy | intervalo `[inicio, fin)` del catálogo |
| Zona horaria | `organizations.timezone` | por defecto `America/Argentina/Buenos_Aires` |
| Métricas 1 a 9 y 11 | derivado: fórmula de cada métrica en `MetricsCatalog.md` sobre `conversations` y `messages` | |
| "N sin cliente" (métrica 3) | derivado: conversaciones de A con `client_id IS NULL` | |
| "N sin primera respuesta" (métrica 9) | derivado: población de la métrica 9 sin `outbound` posterior | |
| Métrica 12 | derivado: `ingestion_events` con `status = 'failed'`, por origen y código | "No disponible" cuando la ingestión no está configurada **y** el período no registró eventos (7.3, D-1) |
| Gráfico diario (métrica 10) | derivado: métricas 1, 2, 4 y 5 por día | con tabla alternativa |
| Definición de la métrica | texto corto versionado en la pantalla, en un desplegable | el catálogo sigue siendo la fuente de verdad (7.4, D-3) |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Ver métricas | sí | sí |
| Cambiar el período | sí | sí |
| Alternar serie y ver la tabla del gráfico | sí | sí |
| Editar un valor de métrica | no existe | no existe |

## Estados

- **Carga**: cada tarjeta muestra `░░░░` por separado. Una métrica lenta no bloquea a las demás.
- **Sin datos**: si el denominador es 0, la tarjeta dice "Sin datos", nunca `0`.
- **Métrica 12 sin ingestión**: "No disponible", nunca `0`.
- **Días sin actividad en el gráfico**: `0` explícito en el eje, sin omitir el día.
- **Error de una métrica** (`INTERNAL`): la tarjeta dice "No se pudo calcular. Código: `request_id`. [Reintentar]" y las demás siguen visibles.
- **Sin resultados**: no aplica, el período no filtra entidades.

## Invariantes

- No muestra contenido de mensajes ni teléfonos.
- Ningún valor es editable.
- El gráfico tiene tabla alternativa; los estados de la métrica 11 se nombran con texto, no solo con color.
