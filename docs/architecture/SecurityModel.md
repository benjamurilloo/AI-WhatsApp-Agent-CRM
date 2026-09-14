# Modelo de Seguridad

**Estado: diseñado.**

## Autenticación

- Sesiones server-side (no JWT en localStorage), propias y sin librería ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)):
  - cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain` y `Secure` con TLS (`__Host-crm_session`; `crm_session` en desarrollo sin TLS), con un token aleatorio de 32 bytes;
  - tabla `sessions` en PostgreSQL que guarda el SHA-256 del token, nunca el token ([DataModel.md](DataModel.md));
  - expiración deslizante de 7 días con tope absoluto de 30;
  - en cada request se leen de la base el usuario, su organización, su rol, `is_active` y `must_change_password`; un usuario inactivo o sin membresía no tiene sesión válida;
  - cambiar la contraseña o desactivar al usuario revoca todas sus sesiones, y cada ingreso crea una sesión nueva;
  - con `must_change_password` en `true` solo se permite cambiar la contraseña y cerrar sesión;
  - la cookie vence en el tope absoluto de la sesión (`created_at` + 30 días) y no se reescribe al renovar; la base decide la validez ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-5, y nota del ADR 0012). Su borrado repite `Secure` y `Path=/`, que el prefijo `__Host-` exige.
- Pantalla de ingreso ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md)), validada en integración con Playwright sobre `next start` y PostgreSQL real:
  - credenciales incorrectas, email inexistente, usuario sin membresía y contraseña fuera de política en el ingreso muestran el mismo mensaje;
  - el cambio obligatorio del primer ingreso usa `auth.completeRequiredPasswordChange`, que no pide la contraseña inicial y solo actúa mientras `must_change_password` siga en `true`, condición que repite dentro de la transacción (D-4);
  - **limitación aceptada** (D-4): quien robe la sesión mientras el flag está en `true` puede definir la contraseña sin conocer la inicial. Esa sesión dura lo que tarda el primer ingreso, y la contraseña inicial es de un solo uso.
- Contraseñas con argon2id (`m=19456`, `t=2`, `p=1`, mínimo de OWASP) en formato PHC, con `@node-rs/argon2` ([brief-3.3](../decisions/brief-3.3-autenticacion.md), D-1). Para un email inexistente se verifica igual contra un hash ficticio, para no revelar su existencia por tiempo de respuesta.
- Política de contraseña: entre 12 y 128 caracteres, sin reglas de composición (D-5).
- Cierre de sesión invalida la sesión server-side, no solo borra la cookie del cliente.
- Límite de intentos de login por cuenta y por IP (D-3, tabla `login_attempts`):
  - ventana deslizante de 15 minutos: 5 fallos por cuenta o 20 por IP devuelven `RATE_LIMITED` con el tiempo de espera;
  - se evalúa antes de verificar la contraseña, y un email inexistente acumula igual que uno existente;
  - un login correcto borra los fallos de la cuenta;
  - la IP sale de la última entrada de `x-forwarded-for` solo con `TRUSTED_PROXY=true`; sin proxy de confianza todas las requests comparten una clave de IP (D-4). Que la IP sea la correcta depende del proxy del despliegue y se verifica en la Fase 8 o 9.
  - **Limitación aceptada del MVP**: un atacante puede bloquear temporalmente la cuenta de otro usuario con 5 intentos cada 15 minutos.

## Autorización

- Server-side, en cada caso de uso de aplicación, nunca delegada solo a la UI.
- Modelo: en el MVP un usuario pertenece a una sola organización ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)) vía `organization_members` con rol `admin` o `viewer`. Toda operación de escritura sensible (productos, clientes, ajustes de stock, gestión de usuarios) requiere `admin`. Lectura permitida a ambos roles dentro de su organización.
- Aislamiento por organización: todo repositorio de datos recibe `organization_id` de la sesión autenticada, nunca de un parámetro de request sin verificar contra la membresía del usuario.
- Implementación ([brief-3.4](../decisions/brief-3.4-autorizacion-y-errores.md)):
  - `organizations.getAuthContext(token)` resuelve usuario, organización, rol y `must_change_password` en cada request. Sin sesión válida, usuario inactivo o sin membresía → `UNAUTHENTICATED`.
  - Todo caso de uso protegido llama primero a `authorize(context, { role })`, que verifica en este orden:
    1. `must_change_password` → `FORBIDDEN`;
    2. rol insuficiente → `FORBIDDEN`;
    3. el recurso se busca filtrado por `organization_id` en SQL; si no aparece → `NOT_FOUND`.

    Así un `viewer` no puede averiguar si existe un recurso de otra organización.
  - Next.js 16.3 ofrece `forbidden()` y `unauthorized()`, pero son experimentales (`experimental.authInterrupts`) y no se usan.
- Gestión de miembros ([brief-3.7](../decisions/brief-3.7-gestion-de-usuarios-y-roles.md)), solo para `admin`, validada en integración con Playwright y PostgreSQL real:
  - alta, cambio de rol, desactivación y reactivación son casos de uso de `organizations`. Cada uno abre la transacción con la fila de la organización bloqueada (`SELECT … FOR UPDATE`) y, dentro de ella, vuelve a verificar que el actor siga siendo `admin` activo (D-2 y D-4);
  - regla del último `admin`: quitarle el rol o desactivar al único `admin` activo da `BUSINESS_RULE_VIOLATION` sin escribir nada. El bloqueo serializa los cambios de miembros de una misma organización, y un test con dos conexiones reales lo verifica;
  - desactivar borra todas las sesiones del usuario en la misma transacción;
  - contraseña inicial (D-5): 16 caracteres de un alfabeto de 32 sin símbolos ambiguos, elegidos con `crypto.randomInt` (80 bits) y mostrados en 4 grupos. Solo persiste su hash argon2id. El texto en claro viaja una única vez, en la respuesta de la Server Action del alta, y nunca en la URL, los logs, la auditoría ni el almacenamiento del cliente. Es la excepción declarada a que ninguna contraseña salga del formulario en curso;
  - un `viewer` que abre una página de usuarios recibe "No tenés permiso para ver esta página." sin datos, y sus Server Actions devuelven `FORBIDDEN` (D-10). **Limitación aceptada**: la respuesta es HTTP 200, no 403, mientras `forbidden()` siga siendo experimental.

## Protección de la aplicación web

- **CSRF** ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)): cookie `SameSite=Lax` más verificación de origen, sin tokens de doble envío. Las mutaciones de la UI usan Server Actions, que en Next.js 16.3 solo aceptan `POST` y rechazan un `Origin` distinto del `Host`. Todo Route Handler que modifique datos verifica `Origin` explícitamente; hasta la 3.7 no existe ninguno. No hay `proxy` ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-6): cada página y cada acción protegida validan la sesión contra la base. Se reevalúa cuando haya varias rutas protegidas (Fase 4), y aun entonces solo para redirecciones optimistas.
- **XSS**: escape automático de la capa de renderizado (evitar `dangerouslySetInnerHTML` o equivalentes sin sanitización), Content-Security-Policy restrictiva.
- **Validación de entradas**: todo input de usuario se valida con un esquema explícito (tipo, longitud, formato) antes de tocar la capa de dominio; rechazo explícito, no coerción silenciosa.
- **Rate limiting en ingestión**: el futuro endpoint de ingestión (no conectado a tráfico real en el MVP) debe diseñarse con límite de tasa por credencial de servicio desde el inicio, para no ser una tarea añadida tarde.

## Gestión de secretos

- Variables de entorno para secretos locales (`.env`, nunca commiteado; `.env.example` sí versionado con placeholders).
- En staging/producción, un gestor de secretos del proveedor de hosting elegido (a definir en la subfase 9.1), no variables de entorno planas en el repositorio de CI.
- Ninguna clave de API, contraseña de base de datos o secreto de sesión se escribe en documentación ni en código.

## Política de logs

- Los logs de aplicación registran identificadores (`organization_id`, `user_id`, `request_id`, `entity_id`) y resultados de operación, nunca el cuerpo de mensajes de conversación ni datos personales innecesarios del cliente.
- Los errores no exponen detalles internos (stack traces, queries SQL) al cliente; se registran en el log del servidor con un `request_id` correlacionable.
- Implementación ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-9): `src/shared/log/` escribe solo los campos de su evento (nivel, `request_id`, ruta, código de resultado y `user_id`). De un error registra el tipo y el código, nunca el mensaje, que puede traer datos del usuario. Un test unitario verifica que no aparecen la contraseña, el token ni el email usados.

## Auditoría

- `audit_logs` cubre lo que exige FR-AUD-01 (ver [DataModel.md](DataModel.md)):
  - creación, edición, desactivación y reactivación de productos y clientes;
  - todo ajuste de stock;
  - todo cambio de estado de una conversación;
  - todo cambio de rol o de estado de un miembro.
- Se escribe con `recordAudit(tx, entry)` dentro de la transacción del cambio, y nunca guarda contraseñas, hashes, tokens ni secretos ([brief-3.6](../decisions/brief-3.6-modulo-de-auditoria.md), D-3 y D-4).
- Es de solo inserción, con dos defensas ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)):
  - el rol de aplicación `crm_app` tiene solo `SELECT` e `INSERT` sobre la tabla;
  - un trigger rechaza `UPDATE` y `DELETE` para cualquier rol.
- **Limitación aceptada**: la aplicación todavía se conecta con el rol dueño, así que hoy la defensa efectiva es el trigger. El dueño puede vaciar la tabla con `TRUNCATE`, y un superusuario puede desactivar el trigger. La conexión con `crm_app` llega con el aprovisionamiento de entornos y secretos (Fases 8 y 9).

## Backups y restauración

- Backup lógico automático diario desde que exista un entorno persistente (staging en adelante).
- Restauración probada periódicamente en un entorno aislado (no en el mismo entorno del backup) para verificar que el backup es realmente utilizable.

## Retención de datos

- Mensajes y conversaciones: política de retención pendiente de definición de negocio antes de conectar tráfico real (ver pregunta abierta en [DataModel.md](DataModel.md)).
- Datos de clientes: mecanismo de exportación/eliminación a pedido, aunque sea un procedimiento manual asistido por un admin en el MVP, no necesariamente autoservicio.

## Amenazas consideradas (threat model inicial, nivel STRIDE simplificado)

| Amenaza | Vector | Mitigación de diseño |
|---|---|---|
| Suplantación | Robo de credenciales | Hash lento, rate limit de login, sesión revocable |
| Manipulación de datos | Bypass de autorización cross-org | Filtro obligatorio por `organization_id` en cada repositorio |
| Repudio | Cambios de stock sin rastro | `inventory_movements` inmutable + `audit_logs` |
| Divulgación de información | Logs con contenido de mensajes | Política de logs sin PII/contenido de negocio |
| Denegación de servicio | Abuso del login o de ingestión | Rate limiting en ambos puntos |
| Elevación de privilegios | Un `viewer` invoca una acción de `admin` directamente por API | Autorización server-side en cada caso de uso, no solo en la UI |

## Revisión de dependencias

- Todo paquete de terceros agregado se revisa por mantenimiento activo y ausencia de vulnerabilidades conocidas antes de incorporarse; se ejecuta auditoría automática de dependencias en CI (Fase 8).

## Separación de entornos

- Dev, test, staging y producción con credenciales, bases de datos y secretos completamente distintos. Ningún dato sintético de dev se promueve automáticamente a staging sin un seed explícito versionado.
