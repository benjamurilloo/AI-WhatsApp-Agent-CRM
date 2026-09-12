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

## Cambio obligatorio de contraseña

Aparece después de un ingreso correcto cuando `users.must_change_password` está en `true` (subfase 1.2, D-6). Mismo layout centrado en escritorio y móvil.

```text
┌──────────────────────────────┐
│  Definí tu nueva contraseña  │
│                              │
│ Tu contraseña inicial es de  │
│ un solo uso.                 │
│                              │
│ Nueva contraseña             │
│ [____________________] [Ver] │
│ Repetir nueva contraseña     │
│ [____________________] [Ver] │
│                              │
│ ⚠ Las contraseñas no         │
│   coinciden.                 │
│                              │
│ [   Guardar y continuar    ] │
└──────────────────────────────┘
```

## Datos

| Dato | Origen | Notas |
|---|---|---|
| Cambio pendiente | `users.must_change_password` | pasa a `false` al guardar la nueva contraseña |
| Nueva contraseña | entrada del usuario, guardada como `users.password_hash` | `autocomplete="new-password"` |
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
- **Cambio de contraseña pendiente**: después de ingresar se muestra "Definí tu nueva contraseña". Si las contraseñas no coinciden o no cumplen el formato (`VALIDATION_ERROR`), el mensaje va junto al campo. Hasta guardar, cualquier ruta protegida devuelve a este paso.

## Invariantes

- No revela si el email existe: el mismo mensaje sirve para "no existe" y para "contraseña incorrecta".
- La contraseña se muestra oculta por defecto.
- No muestra hashes, tokens ni detalles del servidor.

## Notas

- Cómo se cuenta el tiempo del `RATE_LIMITED` lo define la subfase 3.3, no el modelo de datos. No es una brecha de esta pantalla.
