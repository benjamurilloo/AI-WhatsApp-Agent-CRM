# 10 — Usuarios y roles

**Estado: implementado en la 3.7 y validado en integración** ([brief-3.7](../../decisions/brief-3.7-gestion-de-usuarios-y-roles.md)). Especificación: [Screens.md §10](../Screens.md#10-usuarios-y-roles). Reglas: FR-ORG-02 y FR-AUD-01. Convenciones en el [índice](README.md).

Solo `admin`. Un `viewer` no ve la entrada en la navegación y, si entra por URL, recibe `FORBIDDEN`.

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ (marco común)                                                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ Usuarios y roles                                        [ + Nuevo usuario ]  │
│                                                                              │
│ Rol [v Todos]   [v Solo activos]   [ Limpiar filtros ]                       │
│                                                                              │
│ Nombre          │ Email                 │ Rol          │ Activo │            │
│─────────────────┼───────────────────────┼──────────────┼────────┼────────────│
│ Ana Pérez (vos) │ ana@ejemplo.test      │ admin        │  Sí    │ [Editar]   │
│ Pablo Díaz      │ pablo@ejemplo.test    │ viewer       │  Sí    │ [Editar]   │
│ Carla Sosa      │ carla@ejemplo.test    │ viewer       │  No    │ [Editar]   │
│ …                                                        ‹ 1 ›               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Nuevo usuario

```text
┌─ Nuevo usuario ────────────────────────────────────────────┐
│ Nombre *   [___________________________]                   │
│ Email *    [___________________________]                   │
│            ⚠ Ya existe un usuario con ese email.           │
│ Rol *      ( ) admin   (•) viewer                          │
│                                                            │
│ Se generará una contraseña inicial de un solo uso.         │
│                           [ Cancelar ]  [ Crear usuario ]  │
└────────────────────────────────────────────────────────────┘
```

### Contraseña inicial (se muestra una sola vez)

```text
┌─ Usuario creado ───────────────────────────────────────────┐
│ Contraseña inicial de Pablo Díaz:                          │
│   [ K7QM-2XJV-9RTP-4HWN ]  [ Copiar ]                      │
│ No se volverá a mostrar. Deberá cambiarla al ingresar.     │
│                                          [ Entendido ]     │
└────────────────────────────────────────────────────────────┘
```

### Editar miembro

```text
┌─ Editar a Ana Pérez ───────────────────────────────────────┐
│ Rol        (•) admin   ( ) viewer                          │
│ Estado     [ Desactivar ]                                  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ⚠ No podés quitar ni desactivar al último admin de la  │ │
│ │   organización.                                        │ │
│ └────────────────────────────────────────────────────────┘ │
│                           [ Cancelar ]  [ Guardar ]        │
└────────────────────────────────────────────────────────────┘
```

Desactivar pide confirmación explícita, igual que en las pantallas 4 y 7.

## Móvil

```text
┌──────────────────────────────┐
│ (marco común)                │
├──────────────────────────────┤
│ Usuarios y roles             │
│ [ + Nuevo usuario ]          │
│ [v Rol] [v Solo activos]     │
│                              │
│ ┌──────────────────────────┐ │
│ │ Ana Pérez (vos)          │ │
│ │ ana@ejemplo.test         │ │
│ │ admin · Activo  [Editar] │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Carla Sosa               │ │
│ │ carla@ejemplo.test       │ │
│ │ viewer · Inactivo[Editar]│ │
│ └──────────────────────────┘ │
│           ‹ 1 ›              │
└──────────────────────────────┘
```

Los diálogos de alta, contraseña inicial y edición ocupan la pantalla completa en móvil.

**Implementación (3.7)**: los diálogos son páginas, `/usuarios/nuevo` y `/usuarios/[memberId]`, y la confirmación de desactivar es un segundo paso de la misma página ([brief-3.7](../../decisions/brief-3.7-gestion-de-usuarios-y-roles.md), D-6). La contraseña inicial tiene 16 caracteres en 4 grupos; el ejemplo original, de 11, no cumplía la política (D-5). Un `viewer` ve "No tenés permiso para ver esta página." sin datos (D-10).

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Nombre | `users.name` | |
| Email | `users.email` | |
| Rol | `organization_members.role` | de su única organización ([ADR 0010](../../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)) |
| Activo | `users.is_active` | global; con una organización por usuario equivale al estado del miembro (D-5 de la 1.2) |
| "(vos)" | derivado: el miembro coincide con el usuario de la sesión | |
| Contraseña inicial | generada por el servidor; se guarda solo como `users.password_hash` | se muestra una vez. El cambio obligatorio al ingresar se marca con `users.must_change_password` (D-6 de la 1.2) |

## Acciones por rol

| Acción | admin | viewer |
|---|---|---|
| Ver la lista, filtrar y paginar | sí | `FORBIDDEN` |
| Crear usuario con contraseña inicial, auditado | sí | `FORBIDDEN` |
| Cambiar rol, auditado | sí | `FORBIDDEN` |
| Desactivar o reactivar, con confirmación y auditado | sí | `FORBIDDEN` |

## Estados

- **Carga**: skeleton de tabla o tarjetas.
- **Vacío**: no aplica, siempre existe al menos el `admin` actual.
- **Sin resultados**: "Ningún usuario coincide con estos filtros. [ Limpiar filtros ]".
- **Validación** (`VALIDATION_ERROR`): email con formato inválido o nombre vacío.
- **Email existente** (`CONFLICT`): mensaje en el campo email.
- **Último admin** (`BUSINESS_RULE_VIOLATION`): mensaje en el diálogo; no se guarda nada.
- **Sin permiso** (`FORBIDDEN`): "No tenés permiso para ver esta página."
- **Error inesperado** (`INTERNAL`): mensaje con `request_id`.
- **Guardando**: botón deshabilitado.

## Invariantes

- La contraseña inicial no se vuelve a mostrar después de cerrar el diálogo.
- Nunca se muestran hashes.
- Un `viewer` no recibe ni la entrada de navegación ni los datos.
- No se puede dejar la organización sin `admin`.
