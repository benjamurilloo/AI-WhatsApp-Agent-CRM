# 01 — Inicio de sesión

**Estado: diseñado.** Especificación: [Screens.md §1](../Screens.md#1-inicio-de-sesión). Convenciones en el [índice](README.md).

Esta pantalla no lleva el marco común: el usuario todavía no tiene sesión.

## Escritorio

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    ┌──────────────────────────────┐                  │
│                    │        Iniciar sesión        │                  │
│                    │                              │                  │
│                    │  Email                       │                  │
│                    │  [__________________________]│                  │
│                    │                              │                  │
│                    │  Contraseña                  │                  │
│                    │  [____________________] [Ver]│                  │
│                    │                              │                  │
│                    │  ┌──────────────────────────┐│                  │
│                    │  │ ⚠ Email o contraseña     ││  ← región        │
│                    │  │   incorrectos.           ││    aria-live     │
│                    │  └──────────────────────────┘│                  │
│                    │                              │                  │
│                    │  [        Ingresar         ] │                  │
│                    └──────────────────────────────┘                  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Móvil

```text
┌──────────────────────────────┐
│       Iniciar sesión         │
│                              │
│ Email                        │
│ [__________________________] │
│                              │
│ Contraseña                   │
│ [____________________] [Ver] │
│                              │
│ ⚠ Email o contraseña         │
│   incorrectos.               │
│                              │
│ [         Ingresar         ] │
└──────────────────────────────┘
```

Una columna centrada en ambos tamaños; en móvil ocupa el ancho completo.

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Email | entrada del usuario, contrastada con `users.email` | `autocomplete="email"` |
| Contraseña | entrada del usuario, contrastada con `users.password_hash` | `autocomplete="current-password"`. Nunca se muestra el hash. |
| Mensaje de error | derivado: código de error de la taxonomía | Genérico. No revela si la cuenta existe. |

## Acciones por rol

| Acción | No autenticado | Autenticado |
|---|---|---|
| Ingresar | sí | no aplica: se redirige al dashboard |
| Mostrar u ocultar la contraseña | sí, con un botón accesible | — |

## Estados

- **Carga**: `[ Ingresando… ]` deshabilitado mientras responde el servidor.
- **Vacío**: no aplica.
- **Error de credenciales** (`UNAUTHENTICATED`): "Email o contraseña incorrectos." El foco pasa al mensaje.
- **Validación** (`VALIDATION_ERROR`): "Ingresá un email válido", asociado al campo con `aria-describedby`.
- **Límite de intentos** (`RATE_LIMITED`): "Demasiados intentos. Probá de nuevo en N minutos." El botón queda deshabilitado hasta ese momento.
- **Error inesperado** (`INTERNAL`): "No pudimos iniciar sesión. Código: `request_id`."

## Invariantes

- No revela si el email existe: el mismo mensaje sirve para "no existe" y para "contraseña incorrecta".
- La contraseña se muestra oculta por defecto.
- No muestra hashes, tokens ni detalles del servidor.

## Notas

- Cómo se cuenta el tiempo del `RATE_LIMITED` lo define la subfase 3.3, no el modelo de datos. No es una brecha de esta pantalla.
