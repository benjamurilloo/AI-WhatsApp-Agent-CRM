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
- Teléfono del cliente (FR-CLI-06, [brief-5.2](../decisions/brief-5.2-servicio-de-clientes.md), D-2): el enmascarado vive en el módulo `crm`, no en la presentación. Sus lecturas devuelven a un `viewer` solo los últimos 4 dígitos (ninguno si el número tiene 4 o menos), así que el número completo nunca sale de `crm` hacia una página de `viewer`. La búsqueda por teléfono completo funciona para ambos roles: **riesgo aceptado** en la 1.3 (D-1), un `viewer` puede confirmar si un número es cliente.
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

## Autenticación de servicio (ingestión)

Implementada en la 6.5.3 ([brief-6.5.3](../decisions/brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md)), **validada localmente** con requests sintéticos. No se valida con un emisor real hasta el proyecto de integración ([IntegrationBoundaries](IntegrationBoundaries.md)).

- **Credencial** (D-1 y D-2): una fila de `ingestion_credentials` por organización y emisor, con el SHA-256 de un token `crm_ing_` de 32 bytes aleatorios. El token se muestra una sola vez, al crearlo con `npm run ingestion:credential`, y nunca se guarda ni se registra. Una credencial se revoca con fecha y no se reactiva; para rotarla se crea otra y se revoca la vieja.
- **Transporte**: `Authorization: Bearer <token>`. Sin credencial reconocible, `401`; revocada, `403`.
- **Modo de prueba** (D-4): `INGESTION_ENABLED` apagado por defecto (`404`), y `INGESTION_ALLOWED_CREDENTIALS` con los ids aceptados. Una configuración inválida apaga el endpoint y queda en el log.
- **Límite de tasa** (D-3): 120 requests por minuto por credencial, en `ingestion_rate_windows`, con un `INSERT … ON CONFLICT DO UPDATE` atómico. Se cuenta después de autenticar y antes de leer el cuerpo.
- **Sin auditoría en `audit_logs`**: la creación y la revocación no tienen usuario; la tabla guarda `created_at` y `revoked_at`.
- **Log**: código, organización, `source` y duración; nunca el token, el payload, el teléfono ni el cuerpo.

## Protección de la aplicación web

- **CSRF** ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)): cookie `SameSite=Lax` más verificación de origen, sin tokens de doble envío. Las mutaciones de la UI usan Server Actions, que en Next.js 16.3 solo aceptan `POST` y rechazan un `Origin` distinto del `Host`. Todo Route Handler que modifique datos **con la sesión** verifica `Origin` explícitamente; hasta la 6.5.3 no existe ninguno. El endpoint de ingestión no la verifica (brief-6.5.3, D-5): no lee cookies, la credencial viaja en un encabezado que el navegador no agrega solo y no envía encabezados CORS, así que un sitio ajeno no puede usarlo con la sesión de un usuario. Un test confirma que una sesión válida no lo autentica. **Demostrado en la 8.1** (D-5), no solo confiado al framework: un test captura una Server Action real y la reenvía con el `Origin` de otro sitio; Next aborta la acción con 500 y la base no cambia. La corrida de mutación que agrega ese origen a `serverActions.allowedOrigins` hace que la acción pase a 200, así que el test mide la guarda y no un accidente. El helper de verificación de `Origin` previsto en la 3.4 (D-5) sigue sin escribirse: no hay todavía ningún Route Handler con sesión que lo consuma. Desde la 8.1 hay un `proxy` ([`src/proxy.ts`](../../src/proxy.ts)), pero solo para las cabeceras; la D-6 de la 3.5 sigue vigente en lo suyo ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-6): cada página y cada acción protegida validan la sesión contra la base. Se reevalúa cuando haya varias rutas protegidas (Fase 4), y aun entonces solo para redirecciones optimistas.
- **XSS**: escape automático de la capa de renderizado (evitar `dangerouslySetInnerHTML` o equivalentes sin sanitización), más la Content-Security-Policy de abajo. No hay ni un `dangerouslySetInnerHTML` en `src/` (verificado en la 8.1), así que la CSP es defensa en profundidad y no el parche de un agujero conocido.
- **Content-Security-Policy y cabeceras de seguridad**: implementadas en la 8.1 ([brief-8.1](../decisions/brief-8.1-endurecimiento-web.md)), **validadas en integración** sobre `next start` con Chromium. Las emite [`src/proxy.ts`](../../src/proxy.ts) en todas las respuestas salvo los estáticos de Next.
  - **Nonce por request** (D-1): el proxy genera 16 bytes aleatorios por request y pone la política en la cabecera del request —de donde Next la lee para aplicarle el nonce a sus scripts— y en la de la respuesta. Por eso `script-src` no necesita `'unsafe-inline'` pese a que Next emite el payload RSC inline. El proxy existe solo para esto: no valida la sesión, no lee la base y no redirige, así que la D-6 de la 3.5 sigue en pie.
  - **Política**: `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'nonce-…'`; `style-src-attr 'none'`; `img-src`, `font-src`, `connect-src` y `manifest-src` en `'self'`; `object-src`, `base-uri`, `frame-ancestors` y `frame-src` en `'none'`; `form-action 'self'`. Sin `'unsafe-eval'` y sin `'unsafe-inline'` en ninguna directiva. Se entrega en enforce, no en report-only.
  - **Medición (8.1, D-3)**: las diez pantallas se recorrieron en report-only, en claro y oscuro, con cero violaciones. Las pantallas no tienen ni un `<style>` inline ni un solo atributo `style=`, así que `'unsafe-inline'` no hizo falta en `style-src`, que era la limitación que el brief dejaba aceptable.
  - **Cabeceras** (D-2): `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin` y `Permissions-Policy` negando cámara, micrófono y geolocalización. `frame-ancestors` de la CSP reemplaza a `X-Frame-Options`.
  - **Sin `report-uri`**: no hay receptor de reportes; un endpoint propio quedó fuera de alcance.
  - **Pendiente de la Fase 9**: `Strict-Transport-Security` está definido pero **no se emite**, porque sin TLS no hace nada. Se enciende con el entorno de staging, junto con la cookie detrás de TLS y de un proxy real.
- **Validación de entradas**: todo input de usuario se valida con un esquema explícito (tipo, longitud, formato) antes de tocar la capa de dominio; rechazo explícito, no coerción silenciosa.
- **Rate limiting en ingestión**: implementado en la 6.5.3 por credencial de servicio (ver "Autenticación de servicio"). La Fase 8 lo verifica.

## Gestión de secretos

- Variables de entorno para secretos locales (`.env`, nunca commiteado; `.env.example` sí versionado con placeholders).
- En staging/producción, un gestor de secretos del proveedor de hosting elegido (a definir en la subfase 9.1), no variables de entorno planas en el repositorio de CI.
- Ninguna clave de API, contraseña de base de datos o secreto de sesión se escribe en documentación ni en código.

## Política de logs

- Los logs de aplicación registran identificadores (`organization_id`, `user_id`, `request_id`, `entity_id`) y resultados de operación, nunca el cuerpo de mensajes de conversación ni datos personales innecesarios del cliente.
- Los errores no exponen detalles internos (stack traces, queries SQL) al cliente; se registran en el log del servidor con un `request_id` correlacionable.
- Implementación ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-9): `src/shared/log/` escribe solo los campos de su evento (nivel, `request_id`, ruta, código de resultado y `user_id`). De un error registra el tipo y el código, nunca el mensaje, que puede traer datos del usuario. Un test unitario verifica que no aparecen la contraseña, el token ni el email usados.
- **Verificado en la 8.2** ([brief-8.2](../decisions/brief-8.2-logs-y-privacidad.md), D-1), en tres capas, cada una con su nivel:
  - **unitaria**: el formateador arma el JSON campo por campo, así que un dato que no esté en `LogEvent` no puede salir aunque llegue en ejecución. Además del email, la contraseña y el token, se cubren teléfono, nombre, notas y cuerpo de mensaje, y un error de unicidad de PostgreSQL cuyo mensaje trae el teléfono.
  - **guarda** ([`tests/guards/log-surface.test.ts`](../../tests/guards/log-surface.test.ts)): en `src/`, solo el módulo de log usa `console.*`, con dos excepciones declaradas en `src/shared/db/` que reducen el error a `code ?? name`; y ningún `route` de un evento se arma interpolando o concatenando, porque una ruta armada con datos los mete en el log. La guarda falla sobre el repositorio real cuando se la mutó.
  - **integración** ([`tests/integration/log-privacy.test.ts`](../../tests/integration/log-privacy.test.ts)): contra PostgreSQL real, el módulo de dominio no escribe nada en consola ni al crear ni al rechazar, y la línea que registra la acción no lleva datos personales en ningún resultado, incluido un error inesperado que sí trae el teléfono en su mensaje. El camino de ingestión ya estaba cubierto por el caso 12 de `ingestion-http.test.ts`.
- **Lo que registra el proceso, además de la aplicación** (8.2, medición): `next start` —el modo con el que corre un entorno desplegado— **no registra las peticiones**, así que una URL como `/clientes?q=<teléfono>` no llega a ningún log. **`next dev` sí las registra, con la query completa**: en una máquina de desarrollo, la terminal puede terminar conteniendo el teléfono que alguien escribió en el buscador. No afecta a staging ni a producción; queda anotado en [Risks](../planning/Risks.md) para el día que exista un entorno compartido de desarrollo.

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
- Datos de clientes: mecanismo de exportación/eliminación a pedido, aunque sea un procedimiento manual asistido por un admin en el MVP, no necesariamente autoservicio. **Implementado en la 8.2** como procedimiento de operador: el runbook [datos-de-un-cliente](../runbooks/datos-de-un-cliente.md) con dos scripts en `scripts/`, sin pantalla.
  - **Exportación**: completa. Reúne `clients`, `conversations`, `messages` con su cuerpo y `audit_logs` con los valores anteriores. `ingestion_events` queda fuera porque no tiene datos personales, y el archivo lo declara.
  - **Eliminación**: **parcial, y se nombra como minimización, no como eliminación** (brief-8.2, D-3). Un cliente sin conversaciones se borra de verdad. Un cliente con conversaciones **no se puede borrar con ningún rol**: `messages` rechaza `DELETE` y `UPDATE` por trigger ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)) y las claves foráneas hacia `conversations` y `clients` son `ON DELETE RESTRICT`, así que la cadena está cerrada. Para ese caso el procedimiento vacía `phone_e164`, `notes` y el nombre de la ficha, y declara qué queda retenido: los cuerpos de `messages`, las conversaciones y el `diff` de `audit_logs`.
  - **La ejecución no se audita en la base**, a propósito: no hay usuario actor, y auditar el cambio volvería a escribir el teléfono y las notas en el `diff`. Se registra fuera.
  - **Un borrado real necesita revisar el ADR 0013** y es una subfase propia, registrada en [Risks](../planning/Risks.md).

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

- Todo paquete de terceros agregado se revisa por mantenimiento activo y ausencia de vulnerabilidades conocidas antes de incorporarse.
- **La CI audita las dependencias en cada ejecución**, con dos puertas de umbral explícito ([brief-8.3](../decisions/brief-8.3-dependencias.md), D-1), inmediatamente después de instalar:

  | Puerta | Comando | Qué cubre |
  | --- | --- | --- |
  | Producción | `npm audit --omit=dev --audit-level=high` | Lo que se despliega. Falla ante una vulnerabilidad alta o crítica. |
  | Árbol completo | `npm audit --audit-level=critical` | Además, las herramientas de desarrollo. Falla solo ante una crítica. |

  La separación es deliberada: una vulnerabilidad en algo que llega a un usuario y una en una herramienta que corre en la máquina de quien desarrolla no merecen el mismo umbral. Ninguna de las dos lleva `continue-on-error`.

- **Medición del 2026-09-18**: `npm audit --omit=dev` informa **cero vulnerabilidades de cualquier severidad**. Lo que se despliega no arrastra ninguna vulnerabilidad conocida. Sobre el árbol completo hay **4 moderadas, 0 altas y 0 críticas**, todas de `devDependencies` y todas de una sola cadena (`drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → `esbuild`), aceptadas por escrito con su condición de salida en [Risks](../planning/Risks.md).
- **Alcance de la garantía**: una auditoría compara un lockfile contra una base de avisos **en un momento dado**, y esa base cambia sin que el proyecto cambie. Que la CI esté en verde hoy no dice nada sobre mañana; lo que la CI garantiza es que se vuelve a comprobar en cada ejecución. No es una garantía permanente ni sustituye la revisión al incorporar un paquete.
- **La CI informa, no bloquea**: sin protección de rama, una auditoría en rojo no impide un push ni un merge (ver [EngineeringStandards](../development/EngineeringStandards.md) §CI).

## Separación de entornos

- Dev, test, staging y producción con credenciales, bases de datos y secretos completamente distintos. Ningún dato sintético de dev se promueve automáticamente a staging sin un seed explícito versionado.
