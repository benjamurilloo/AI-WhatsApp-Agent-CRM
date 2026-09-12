# Modelo de Seguridad

**Estado: diseñado.**

## Autenticación

- Sesiones server-side (no JWT en localStorage): cookie de sesión `HttpOnly`, `Secure`, `SameSite=Lax`, con identificador de sesión opaco resuelto contra almacenamiento server-side (tabla `sessions` o store dedicado — a definir en Fase 3).
- Contraseñas con hashing lento y sal (argon2id preferido; bcrypt como alternativa aceptable).
- Cierre de sesión invalida la sesión server-side, no solo borra la cookie del cliente.
- Rate limiting en el endpoint de login (por IP y por cuenta) para mitigar fuerza bruta.

## Autorización

- Server-side, en cada caso de uso de aplicación, nunca delegada solo a la UI.
- Modelo: en el MVP un usuario pertenece a una sola organización ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)) vía `organization_members` con rol `admin` o `viewer`. Toda operación de escritura sensible (productos, clientes, ajustes de stock, gestión de usuarios) requiere `admin`. Lectura permitida a ambos roles dentro de su organización.
- Aislamiento por organización: todo repositorio de datos recibe `organization_id` de la sesión autenticada, nunca de un parámetro de request sin verificar contra la membresía del usuario.

## Protección de la aplicación web

- **CSRF**: tokens de doble envío o dependencia de `SameSite` cookies + verificación de origen (`Origin`/`Referer`) en mutaciones, según lo que el framework elegido soporte nativamente (a confirmar en Fase 2/3 con el stack final).
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

## Auditoría

- `audit_logs` cubre creación/edición/desactivación de productos y clientes, y todo ajuste de stock (ver [DataModel.md](DataModel.md)).
- La auditoría es de solo inserción; no se edita ni se borra un registro de auditoría.

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
