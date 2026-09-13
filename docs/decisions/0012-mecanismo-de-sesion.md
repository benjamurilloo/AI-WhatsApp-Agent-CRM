# 0012 — Sesiones server-side propias en PostgreSQL

- Estado: aceptada (resuelta por el usuario en la subfase 3.2, 2026-09-13)
- Fecha: 2026-09-13

## Contexto

[SecurityModel.md](../architecture/SecurityModel.md) y [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md) ya fijan sesiones server-side con cookie `HttpOnly`, `Secure` con TLS y `SameSite=Lax` o `Strict`, un identificador opaco y un cierre de sesión que invalida la sesión en el servidor. Dejaron abierto "tabla `sessions` o store dedicado". [EngineeringStandards.md](../development/EngineeringStandards.md) descarta la autenticación como servicio de terceros.

El [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md) quita la organización activa: un usuario tiene una sola membresía. La pantalla 1 exige un cambio obligatorio de contraseña mientras `users.must_change_password` sea `true` ([wireframe 01](../product/wireframes/01-inicio-de-sesion.md)).

Verificación del 2026-09-13 ([brief-3.2](brief-3.2-adr-mecanismo-de-sesion.md)):

- La guía de Next.js 16.3 describe las sesiones en base de datos como más seguras que las cookies cifradas sin estado. Recomienda verificar en una capa de acceso a datos y usar `proxy` solo para chequeos optimistas.
- Las Server Actions de Next.js 16.3 solo aceptan `POST` y rechazan un `Origin` distinto del `Host`. La guía no describe esa comprobación para Route Handlers.
- En el registro npm, `lucia` y `@oslojs/crypto` están deprecados, Auth.js v5 sigue en beta y Better Auth 1.7.4 trae su propio esquema de tablas.
- `node:crypto` ya ofrece `randomBytes`, `createHash` y `timingSafeEqual`.

## Decisión

**Almacenamiento e identificador.**

- Tabla `sessions` en PostgreSQL, propiedad del módulo `auth` (diseño en [DataModel.md](../architecture/DataModel.md)).
- Al crear una sesión se genera un token aleatorio de 32 bytes con `randomBytes`, codificado en base64url, que va solo en la cookie.
- La tabla guarda como clave primaria el SHA-256 del token, nunca el token.
- Validar consiste en hashear el token recibido y buscar esa clave.

**Implementación.** Propia, sobre `node:crypto` y la API `cookies` de Next.js, sin dependencias de sesión ni de autenticación.

**Expiración y renovación.**

- `expires_at` es deslizante de 7 días. Un request válido la extiende, pero solo escribe en la base cuando queda menos de la mitad de la ventana.
- Tope absoluto de 30 días desde `created_at`: al superarlo, la sesión se rechaza aunque `expires_at` sea futuro.
- Una sesión expirada se borra al detectarla. Al ingresar, se borran las sesiones expiradas del usuario. En el MVP no hay tarea programada de limpieza.

**Validación en cada request.**

- Una única consulta une `sessions`, `users` y `organization_members` y devuelve `user_id`, `organization_id`, `role`, `is_active` y `must_change_password`.
- Ni la cookie ni la fila de sesión guardan rol ni organización.
- Resultados:
  - token ausente, inexistente, expirado o por encima del tope → `UNAUTHENTICATED`;
  - usuario con `is_active = false` o sin membresía → `UNAUTHENTICATED`;
  - sesión válida → el contexto autenticado (usuario, organización y rol) que consumen los servicios. Nunca un `organization_id` tomado del request.

**Revocación.**

- **Cierre de sesión**: borra la fila de la sesión actual y elimina la cookie.
- **Cambio de contraseña**, incluido el obligatorio: borra todas las sesiones del usuario y crea una nueva para el request en curso.
- **Desactivación de un usuario** (3.7): borra todas sus sesiones. Aunque no se borraran, la validación ya lo rechaza por `is_active`.
- **Ingreso**: siempre crea una sesión nueva. Nunca reutiliza un identificador que traiga el cliente.

**`must_change_password`.** La sesión es normal. Mientras la columna esté en `true`, la capa de autorización (3.4) solo permite el paso de cambio de contraseña y el cierre de sesión. Cualquier otra página redirige a ese paso, y cualquier otra acción o Route Handler responde `FORBIDDEN`.

**Cookie.**

- `HttpOnly`, `SameSite=Lax`, `Path=/` y sin `Domain`.
- `Secure` en todo entorno con TLS.
- Nombre `__Host-crm_session` con TLS y `crm_session` en desarrollo local sin TLS, porque el prefijo `__Host-` exige `Secure`.
- Su vencimiento coincide con `expires_at`.

**CSRF.**

- Las mutaciones iniciadas desde la UI usan Server Actions, que ya exigen `POST` y verifican `Origin` contra `Host`.
- Todo Route Handler que modifique datos verifica `Origin` explícitamente (la utilidad llega en la 3.4). `SameSite=Lax` es la segunda defensa.
- `/api/health` y los futuros endpoints de ingestión, autenticados por credencial de servicio, no usan la cookie de sesión.

**`proxy`.** Opcional y solo optimista: redirigir a login si falta la cookie. Nunca es la única verificación: toda página, Server Action y Route Handler protegido valida la sesión contra la base.

## Alternativas descartadas

- **Cookie cifrada sin estado** (`iron-session`, `jose`): no permite invalidar una sesión en el servidor, y SecurityModel lo exige. Una cookie robada valdría hasta su expiración.
- **Store dedicado** (Redis u otro): suma un servicio que [Environments.md](../development/Environments.md) excluye sin necesidad concreta. PostgreSQL alcanza para el volumen del MVP.
- **Better Auth**: impone su esquema (`user`, `session`, `account`, `verification`), sus endpoints y un árbol de dependencias que el MVP no usa. Duplicaría `users` o obligaría a adaptar el modelo de datos a la librería.
- **Auth.js**: la v5 sigue en beta, y el proveedor de credenciales de la v4 no está pensado para sesiones en base.
- **Lucia**: deprecada. Su propia guía de migración recomienda implementar las sesiones directamente.
- **Rol y organización copiados en la sesión**: un cambio de rol o una desactivación no regirían hasta revocar o sincronizar las sesiones.
- **Sesión "restringida" para `must_change_password`**: duplicaría en `sessions` un estado que ya vive en `users`.
- **Tokens CSRF de doble envío**: no agregan protección real sobre `POST` con verificación de origen y `SameSite=Lax`, y suman estado.
- **`SameSite=Strict`**: un enlace entrante desde otro sitio llegaría sin sesión y obligaría a ingresar de nuevo, sin una amenaza concreta que lo justifique.
- **Expiración fija de 7 días o deslizante sin tope**: la fija corta cada semana a quien trabaja a diario; la deslizante sin tope deja vivir indefinidamente una sesión robada.

## Consecuencias

- La 3.3 crea `sessions` con su migración e implementa crear, validar, renovar y revocar, sin dependencias nuevas de sesión. El algoritmo y la librería de hash de contraseñas se deciden en la 3.3.
- La 3.4 implementa el contexto autenticado, la restricción de `must_change_password`, los guards por rol y la verificación de `Origin` para Route Handlers mutantes.
- Cada request autenticado hace una consulta de validación, más un `UPDATE` como máximo cada media ventana.
- El código de sesión es propio y, por lo tanto, responsabilidad del proyecto. [TestingStrategy.md](../development/TestingStrategy.md) fija los casos obligatorios que lo prueban intentando violarlo.
- **Fuera de alcance en el MVP**: organización activa (ADR 0010), "recordarme", listado de sesiones activas, cierre de sesión en todos los dispositivos como pantalla, 2FA, OAuth y login sin contraseña. Agregarlos más adelante no requiere cambiar la forma de `sessions`, salvo columnas aditivas.
- La autenticación de servicio a servicio de la ingestión (Fase 6) es un mecanismo distinto y no usa esta tabla.
