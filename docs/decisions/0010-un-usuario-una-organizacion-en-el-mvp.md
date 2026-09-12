# 0010 — En el MVP un usuario pertenece a una sola organización

- Estado: aceptada (resuelta por el usuario en la subfase 1.2, 2026-09-12)
- Fecha: 2026-09-12

## Contexto

El modelo aísla todos los datos por `organization_id` y relaciona usuarios con organizaciones mediante `organization_members`, con `UNIQUE(organization_id, user_id)`. Eso permite que un usuario pertenezca a varias organizaciones, y FR-ORG-01 lo decía en plural.

Los wireframes de la 1.1 mostraron el costo de esa posibilidad: ninguna pantalla define cómo se elige la organización activa (brecha B-9). Soportarla exige un selector en el marco común, guardar la organización activa en la sesión y resolver qué pasa al cambiarla con una página abierta. El MVP sirve a un solo negocio.

## Decisión

En el MVP, un usuario pertenece a exactamente una organización:

- `organization_members` pasa a tener `UNIQUE(user_id)`.
- No existe selector de organización. El marco común muestra el nombre de la organización del usuario.
- FR-ORG-01 se reescribe en singular.

La tabla `organization_members` se conserva, y con ella el rol por membresía y el aislamiento por `organization_id` en toda consulta.

## Alternativas descartadas

- **Varias organizaciones por usuario, con selector**: descartado porque ningún caso de uso del MVP lo necesita. Construir el selector y la organización activa en la sesión sería implementar por adelantado, lo que `CLAUDE.md` prohíbe.
- **Eliminar `organization_members` y poner `organization_id` y `role` en `users`**: descartado porque volver a varias organizaciones exigiría mover datos a una tabla nueva. Conservar la tabla deja esa evolución como migración aditiva.

## Consecuencias

- Pasar a varias organizaciones más adelante es aditivo: quitar `UNIQUE(user_id)`, agregar el selector y guardar la organización activa en la sesión. No hay que mover datos.
- El estado activo del usuario puede seguir siendo global (`users.is_active`), porque equivale a su estado en la única organización (subfase 1.2, D-5).
- El email sigue siendo único en todo el sistema. Una misma persona no puede tener cuentas en dos negocios con el mismo email: es un límite aceptado del MVP.
- El test de aislamiento entre organizaciones sigue siendo obligatorio: que un usuario pertenezca a una sola no impide que manipule IDs de otra.
