# Wireframes de baja fidelidad

**Estado: diseñado.** Entregable de la subfase 1.1 ([brief-1.1](../../decisions/brief-1.1-wireframes-baja-fidelidad.md)). Son bocetos de distribución y datos, no diseño visual: no fijan colores, tipografía ni tamaños.

## Índice

| # | Pantalla | Wireframe |
|---|---|---|
| 1 | Inicio de sesión | [01-inicio-de-sesion.md](01-inicio-de-sesion.md) |
| 2 | Dashboard | [02-dashboard.md](02-dashboard.md) |
| 3 | Lista de productos | [03-lista-de-productos.md](03-lista-de-productos.md) |
| 4 | Detalle y edición de producto | [04-detalle-de-producto.md](04-detalle-de-producto.md) |
| 5 | Ajuste de inventario e historial | [05-ajuste-de-inventario.md](05-ajuste-de-inventario.md) |
| 6 | Lista de clientes | [06-lista-de-clientes.md](06-lista-de-clientes.md) |
| 7 | Detalle y edición de cliente | [07-detalle-de-cliente.md](07-detalle-de-cliente.md) |
| 8 | Lista de conversaciones | [08-lista-de-conversaciones.md](08-lista-de-conversaciones.md) |
| 9 | Detalle de conversación y timeline | [09-detalle-de-conversacion.md](09-detalle-de-conversacion.md) |
| 10 | Usuarios y roles | [10-usuarios-y-roles.md](10-usuarios-y-roles.md) |

## Convenciones

- **Layout**: bloques monoespaciados. El de escritorio representa ≥ 1024 px y el móvil < 640 px. Tablet no se dibuja.
- **Notación**:
  - `[ Botón ]` acción;
  - `[_____]` campo de texto;
  - `[v Opción]` selector;
  - `( ) / (•)` opción única;
  - `░░░░` skeleton de carga;
  - `‹ 1 2 3 ›` paginación;
  - `{admin}` elemento que solo existe para `admin` (el servidor no lo entrega a `viewer`, no solo lo oculta).
- **Datos de ejemplo**: ficticios. Los teléfonos usan el rango `+54 9 11 5555-xxxx`.
- **Origen de cada dato**, en la tabla de datos de cada pantalla:
  - `tabla.columna`: columna de [DataModel.md](../../architecture/DataModel.md);
  - `derivado: <regla>`: se calcula a partir de columnas existentes;
  - `BRECHA B-n`: no existe en el modelo o en la especificación. Ver el listado de abajo.
- **Marco común** (pantallas 2 a 10), omitido en cada dibujo salvo en el dashboard:
  - Escritorio: barra superior con nombre de la organización (`organizations.name`), navegación (Dashboard · Productos · Clientes · Conversaciones · `{admin}` Usuarios), nombre del usuario (`users.name`), rol (`organization_members.role`) y `[ Salir ]`.
  - Móvil: barra con nombre de la organización y `[≡]`, que abre la misma navegación.
- **Fechas**: en la zona horaria de la organización (`organizations.timezone`), indicada en cada pantalla que muestra fechas.

## Brechas y discrepancias

Entrada de la subfase 1.2. Acá se registran, no se corrigen. Las cinco del brief (B-1 a B-5) están confirmadas.

### Datos que faltan en el modelo

| Id | Pantalla | Dato | Motivo |
|---|---|---|---|
| B-1 | 5 | Saldo resultante de cada movimiento | `inventory_movements` no guarda el saldo posterior. Recalcularlo exige una suma acumulada sobre todo el historial del producto por cada página, y el resultado dependería de que el historial esté completo desde saldo 0. |
| B-2 | 6, 7 | Última interacción del cliente (fecha y canal) | No hay columna en `clients`. Se deriva como el `MAX(conversations.last_message_at)` de sus conversaciones, pero la lista 6 ordena por ese dato y ningún índice lo sirve: `(client_id, started_at desc)` ordena por inicio, no por último mensaje. |
| B-3 | 8 | Cantidad de mensajes por conversación | No hay columna. Se deriva con `COUNT(messages)` por conversación, lo que obliga a agregar por cada fila de la lista. Falta decidir si se deriva o se desnormaliza. |
| B-4 | 8 | Filtro de período y orden por último mensaje | El único índice de listado es `(organization_id, status, started_at desc)`. No hay índice sobre `last_message_at`, que es el campo por el que la pantalla filtra y ordena. |
| B-5 | 10 | Activo o inactivo como miembro | `users.is_active` es global. `organization_members` no tiene estado propio, así que desactivar a un usuario en una organización lo desactiva en todas. |
| B-6 | 10 | Contraseña inicial de un solo uso | No hay columna que marque que la contraseña debe cambiarse en el primer ingreso (`users` solo tiene `password_hash`). Sin eso, "de un solo uso" no se puede hacer cumplir. |
| B-7 | 2 | Disponibilidad de la ingestión para la métrica 12 | La métrica muestra "no disponible" mientras no exista la ingestión en el entorno, pero no hay dato ni configuración definida de la que salga esa condición. |

### Discrepancias entre documentos

| Id | Pantalla | Discrepancia |
|---|---|---|
| B-8 | 7 | FR-AUD-02 pide que un `admin` consulte la auditoría de un **cliente**, pero la pantalla 7 de `Screens.md` no la incluye (la pantalla 4 sí la incluye para productos). El wireframe sigue a `Screens.md` y no la dibuja. |
| B-9 | todas | FR-ORG-01 admite que un usuario pertenezca a varias organizaciones, pero ninguna pantalla define cómo elige la organización activa. El marco común muestra solo el nombre de la organización, sin selector. |
| B-10 | 3, 4 | FR-PROD-05 deriva el estado de stock solo de `quantity_on_hand` y `reorder_point`. `products.min_stock` se muestra en la pantalla 4 pero no interviene en ninguna regla, así que hoy es una columna sin consumidor de negocio. |
| B-11 | 5 | El filtro por tipo de movimiento ofrece los cuatro valores del enum, pero en el MVP solo existen caminos para crear `adjustment_positive` y `adjustment_negative`. `inbound` y `outbound` no tienen productor. |

### Descartadas

Ninguna. Las cinco brechas del brief se confirmaron al dibujar.
