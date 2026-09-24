# Modelo de Seguridad

**Estado: revisado contra el código el 2026-09-18** ([brief-8.4](../decisions/brief-8.4-revision-de-seguridad.md)) y **corregido el mismo día por una revisión independiente**, que encontró cuatro defectos en la revisión anterior: un hallazgo falso (H-2, retirado), un caso no visto de la clase de H-1 (hoy H-7), dos recuentos que no cerraban y un agujero en la guarda que la subfase había dejado como instrumento. De 104 afirmaciones: 75 verificadas con test, guarda o medición citada; 18 verificadas por lectura del código, sin instrumento que las fije; 5 parciales o con hallazgo; 6 no verificables sin TLS, proxy real o entorno persistente, que quedan para la Fase 9. **Ampliado el 2026-09-22** con la verificación en staging de la subfase 9.1: cinco afirmaciones que estaban declaradas `no-verificable-aquí` —HSTS, la cookie `__Host-` bajo TLS, `TRUSTED_PROXY` contra un proxy real, la gestión de secretos y la conexión con un rol miembro de `crm_app`— se midieron contra el entorno desplegado y pasan a `verificado`, cada una con su evidencia en [brief-9.1](../decisions/brief-9.1-infraestructura-de-staging.md). Esa verificación **es autoevaluación** hasta que la revisión independiente de la subfase la confirme.

Cada sección cita el nivel de validación de lo que afirma. Los hallazgos abiertos están en [Risks](../planning/Risks.md); ninguno es crítico.

## Superficie expuesta

**48 puntos de entrada** al 2026-09-24 —19 páginas, 24 Server Actions y 5 Route Handlers—, revisados uno por uno. Eran 36 al 2026-09-18. La etapa 11.1.2 ([brief-11.1](../decisions/brief-11.1-catalogo-comercial.md)) sumó la página de precios de un producto y `setPriceAction`, que exige sesión y rol `admin` en el caso de uso, probado en integración. La 11.2 ([brief-11.2](../decisions/brief-11.2-informacion-del-negocio.md)) sumó las tres páginas de información del negocio (`/informacion`, `/informacion/nueva` y `/informacion/[id]`) y cuatro Server Actions (crear, editar, desactivar y reactivar una entrada), que exigen sesión y rol `admin` en el caso de uso, probado en integración. La etapa 11.3.1 ([brief-11.3](../decisions/brief-11.3-api-de-lectura.md)) sumó los dos Route Handlers de la API de lectura, que no usan la sesión (ver abajo), y la 11.3.2 el tercero, `/api/read/v1/knowledge`. La guarda [`tests/guards/exposed-surface.test.ts`](../../tests/guards/exposed-surface.test.ts) fija los **29 que no son páginas** y falla si aparece uno nuevo sin declarar; las páginas se revisaron por lectura y ninguna guarda las fija.

> El documento decía "20 puntos de entrada" hasta la revisión independiente del 2026-09-18. Era un número que no salía de ninguna agrupación de esta tabla, que suma 36. Corregido.

| Punto de entrada | Cantidad | Exigencia |
| --- | --- | --- |
| Páginas bajo `(autenticado)` | 17 | sesión, y el rol lo exige el caso de uso |
| Páginas del ingreso (`/login`, `/cambiar-contraseña`) | 2 | previo a la sesión |
| Server Actions bajo `(autenticado)` | 20 | sesión, resuelta antes de cualquier efecto |
| Server Actions del ingreso | 2 | previo a la sesión |
| Server Actions públicas (`logoutAction`, `setThemeAction`) | 2 | ninguna, a propósito: cerrar sesión es idempotente y el tema es una cookie sin dato de negocio |
| Route Handlers | 5 | ninguna de sesión (ver abajo) |

- **`/api/health`**: sin autenticación. Devuelve `{"status":"ok"}` con 200, o `"unavailable"` con 503, y `Cache-Control: no-store`. No expone datos, versiones ni detalles del error; revela únicamente si la base responde.
- **`/api/ingestion/v1/events`**: no usa la sesión. Autentica con una credencial de servicio (ver abajo), y un test confirma que una sesión válida **no** lo autentica.
- **`/api/read/v1/products`**, **`/api/read/v1/products/{product_id}`** y **`/api/read/v1/knowledge`** (11.3): no usan la sesión. Autentican con una credencial de servicio de alcance `read`, están apagadas salvo `READ_API_ENABLED`, y un test confirma que una sesión válida **no** las autentica. Solo leen: productos activos con su precio vigente y su estado de stock, sin la cantidad, y la información del negocio vigente ([contrato de lectura v1](../contracts/read-v1.md)). Las funciones de módulo que usan no pasan por `authorize`, porque no hay persona ni rol; la guarda `service-read-entry-points.test.ts` exige que fuera de los módulos solo las llame `src/app/api/read/`.

La guarda verifica que la superficie no crezca sin que alguien la declare. **No** verifica que la exigencia declarada se cumpla: eso se revisó leyendo cada punto de entrada, porque la autorización se delega entre módulos o vive en un helper del mismo archivo, y ningún patrón de texto lo distingue sin mentir.

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
  - la IP sale de la última entrada de `x-forwarded-for` solo con `TRUSTED_PROXY=true`; sin proxy de confianza todas las requests comparten una clave de IP (D-4). Que la IP sea la correcta depende del proxy del despliegue. **Verificado en staging el 2026-09-22** (9.1, AC-5): la clave almacenada es `sha256` de la IP pública real del cliente, y no la de una cabecera `x-forwarded-for` falsificada por el navegador, porque nginx la reemplaza por `$remote_addr` en vez de agregarla. La lectura por la ultima entrada es correcta **con un solo salto de proxy**, que es la topología desplegada; agregar otro proxy delante invalida esa premisa y obliga a revisarla antes de desplegarlo.
  - **Limitación aceptada del MVP**: un atacante puede bloquear temporalmente la cuenta de otro usuario con 5 intentos cada 15 minutos.
  - **H-3, resuelto en staging el 2026-09-22** (9.1, AC-6), **medido por consecuencia**: con 20 fallos desde una IP, esa IP queda bloqueada mientras la misma cuenta, con la misma contraseña y en el mismo momento, ingresa desde otra. Sigue abierto en cualquier entorno donde `TRUSTED_PROXY` no sea `true`. El enunciado original: mientras `TRUSTED_PROXY` no sea `true`, la clave de IP es la misma para todas las peticiones, así que **20 ingresos fallidos de cualquiera, en cualquier cuenta, bloquean el ingreso de todos** hasta que venza la ventana. El mecanismo estaba escrito; su consecuencia no. En esta configuración el límite por IP es también un vector de denegación de servicio. **Severidad condicional (2026-09-18): `crítico` en cualquier entorno compartido, `mayor` en el único que existe hoy**, que es una máquina de desarrollo de un usuario sin proxy ni adversario. Es **precondición bloqueante de la 9.1**: no se levanta ningún entorno compartido sin `TRUSTED_PROXY=true` contra un proxy real, o con el límite por IP desactivado ([Risks](../planning/Risks.md), [Roadmap](../planning/Roadmap.md) §Fase 9).
  - Los **dos** límites están probados en integración (`tests/integration/auth-service.test.ts`): el de cuenta, y el de IP con el caso "20 fallos desde una IP bloquean también a otras cuentas", que además comprueba que otra IP sigue pudiendo ingresar.

> **Corrección del 2026-09-18.** La revisión de la 8.4 había registrado como hallazgo H-2 que el límite por IP no tenía ninguna prueba. **Era falso**: el test existía desde antes. El error vino de buscarlo con un patrón (`it("`) que no ve la forma de tres argumentos que ese test usa por su `timeout`, y de "confirmarlo" con una segunda búsqueda de `IP_FAILURE_LIMIT`, constante que el test no usa porque escribe `20` a mano. Dos búsquedas ciegas a lo mismo, tomadas como confirmación. H-2 queda retirado y su lugar en la numeración no se reutiliza.

## Autorización

- Server-side, en cada caso de uso de aplicación, nunca delegada solo a la UI.
- Modelo: en el MVP un usuario pertenece a una sola organización ([ADR 0010](../decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)) vía `organization_members` con rol `admin` o `viewer`. Toda operación de escritura sensible (productos, clientes, ajustes de stock, gestión de usuarios) requiere `admin`. Lectura permitida a ambos roles dentro de su organización.
- Teléfono del cliente (FR-CLI-06, [brief-5.2](../decisions/brief-5.2-servicio-de-clientes.md), D-2): el enmascarado vive en el módulo `crm`, no en la presentación. Sus lecturas devuelven a un `viewer` solo los últimos 4 dígitos (ninguno si el número tiene 4 o menos), así que el número completo nunca sale de `crm` hacia una página de `viewer`. La búsqueda por teléfono completo funciona para ambos roles: **riesgo aceptado** en la 1.3 (D-1), un `viewer` puede confirmar si un número es cliente.
- Aislamiento por organización: **todo repositorio de datos de negocio** recibe `organization_id` de la sesión autenticada, nunca de un parámetro de request sin verificar contra la membresía del usuario. Verificado en integración desde la 3.4: un recurso de otra organización da `NOT_FOUND`.
  - **Excepción de `auth`, acotada a un punto de entrada único (H-1, resuelto en la 9.0.1 el 2026-09-21)**: las tablas de `auth` —`users`, `sessions`, `login_attempts`— son globales por diseño, porque un usuario se ata a una organización en `organization_members`, que sí filtra. `findUserSummaries(userIds)` sigue leyendo `id`, `name`, `email` e `isActive` por id **sin filtro de organización**, y eso no cambió. Lo que cambió es quién puede llamarla: los módulos de negocio ahora pasan por `organizations.getMemberSummaries(organizationId, userIds)`, que interseca los ids contra `organization_members` de esa organización **en SQL** antes de leer los usuarios. Una guarda (`tests/guards/user-summaries-entry-point.test.ts`) falla si un archivo fuera de `auth` o de `organizations` accede a `getUserSummaries` por import con nombre, por namespace o por reexportación. Fija el punto de entrada contra el acceso literal, **no contra toda vía posible**: su cabecera enumera lo que no cubre, y en particular no cubre que `analytics` pueda importar `@/modules/*/schema` y leer `users` directo, frontera que cierra la 9.0.3.

    **Por qué el filtro no vive dentro de `auth`, que es lo que Risks prescribía**: `auth` no puede leer `organization_members` sin importar `organizations`, lo que crearía un ciclo —`organizations` ya importa `auth`— y lo que la frontera de ESLint bloquea fuera de los archivos `schema.ts`. El filtro vive entonces del lado dueño de la membresía.

    **Límite que queda, declarado**: la garantía pasó de siete llamadores a uno, no a una defensa estructural. La consulta de `auth` sigue sin filtro propio, y un llamador dentro de `organizations` podría seguir esquivándola. Lo estructural sería RLS por organización, que exige un rol sin `BYPASSRLS` y no está decidido ([Risks](../planning/Risks.md)).
  - **Excepción declarada (H-7, revisión independiente del 2026-09-18)**: la lectura no era el único caso. **Siete funciones de repositorio escriben datos de negocio filtrando solo por id**, sin `organization_id` en el `where`:

    | Función | Tabla |
    | --- | --- |
    | `catalog.updateProductValues`, `catalog.updateProductActive` | `products` |
    | `crm.updateClientValues`, `crm.updateClientActive` | `clients` |
    | `organizations.updateMemberRole` | `organization_members` |
    | `conversations.updateConversationStatus`, `conversations.widenConversationDates` | `conversations` |

    Ninguna era alcanzable: los siete llamadores cargan antes la fila filtrada por organización —con `FOR UPDATE` en la misma transacción— y solo entonces pasan el id. Era exactamente la situación de H-1, con dos diferencias que importan: son **escrituras**, y no son tablas globales por diseño, así que no había nada que justificara la excepción más allá de la disciplina del llamador. `inventory.applyStockChange` sí filtraba por `organization_id` y mostraba que la forma defendible existía en el propio código.

    La corrección de la 8.4 había escrito que la única excepción era `auth`. También era falsa, y más angosta que la anterior.

    **Resuelto en la 9.0.1 el 2026-09-21**: las siete reciben `organizationId` y lo incluyen en el `where`. Además, cero filas actualizadas no puede ser una carrera sino un defecto de programación, así que las siete verifican el `returning` y **lanzan dentro de la transacción**, que revierte. La serialización no es igual en todas: seis leen su fila con `FOR UPDATE` en la misma transacción, y `updateMemberRole` se serializa por el bloqueo de la fila de la organización (`withOrganizationLock`), porque `findMember` no usa `FOR UPDATE`. Probado en `tests/integration/organization-isolation.test.ts`, que llama a los repositorios directamente —por la interfaz pública la operación da `NOT_FOUND` y nunca llega a la escritura, que es justamente lo que hacía al defecto inalcanzable y también invisible para un test de servicio.
  - **Octavo caso de la misma clase, resuelto en la 9.0.4 el 2026-09-21**: la revisión independiente de la 9.0.1 encontró que `ingestion.finishEvent` actualizaba `ingestion_events` filtrando solo por id, y esa tabla tiene `organization_id`. No se corrigió por analogía dentro de la 9.0.1: el alcance lo decidió el usuario. Ya recibe `organizationId`, lo incluye en el `where` y verifica el `returning`. **La justificación del `throw` es distinta de la de las siete anteriores**, y por eso el comentario del código no repite la de ellas: acá el llamador no lee la fila antes de escribir, la **crea** —`reserveEvent` la inserta en la misma transacción y devuelve su id, con el bloqueo del insert vigente hasta el commit—, así que cero filas actualizadas no puede ser una carrera ni una fila ajena. Cubierto por un caso propio del mismo test de integración, con corrida de mutación que falla por el estado de la fila, no por el mensaje.
  - **Novena de la clase, declarada y no corregida**: `ingestion.revokeCredential` filtra por id de credencial sobre `ingestion_credentials`, que también tiene `organization_id`. Diferida por decisión de alcance: su id lo provee un operador que ya tiene acceso al script y a la base, así que el filtro no defendería de nadie que no haya pasado esa puerta. **La condición que la reabre está escrita** en [Risks](../planning/Risks.md): que la revocación se exponga por HTTP o pase a manos no operativas. Lo que hay que vigilar es esa condición, no la función.
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

## Autenticación de servicio (ingestión y lectura)

Implementada en la 6.5.3 ([brief-6.5.3](../decisions/brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md)), **validada localmente** con requests sintéticos. No se valida con un emisor real hasta el proyecto de integración (Fase 12, 12.3) ([IntegrationBoundaries](IntegrationBoundaries.md)).

- **Credencial** (D-1 y D-2): una fila de `ingestion_credentials` por organización y emisor, con el SHA-256 de un token `crm_ing_` de 32 bytes aleatorios. **Desde la 11.3** (D-2), cada credencial tiene un solo alcance: `ingest` para la ingestión o `read` para la API de lectura, con token `crm_read_`. El alcance se compara con el guardado en la base, no con el prefijo; una credencial en la superficie de otro alcance da `403` sin consumir el límite. Así, una credencial de lectura filtrada no escribe. El token se muestra una sola vez, al crearlo con `npm run ingestion:credential`, y nunca se guarda ni se registra. Una credencial se revoca con fecha y no se reactiva; para rotarla se crea otra y se revoca la vieja.
- **Transporte**: `Authorization: Bearer <token>`. Sin credencial reconocible, `401`; revocada, `403`.
- **Modo de prueba** (D-4): `INGESTION_ENABLED` apagado por defecto (`404`), y `INGESTION_ALLOWED_CREDENTIALS` con los ids aceptados. Una configuración inválida apaga el endpoint y queda en el log. La API de lectura tiene los suyos, `READ_API_ENABLED` y `READ_API_ALLOWED_CREDENTIALS`, independientes (11.3, D-7).
- **Límite de tasa** (D-3): 120 requests por minuto por credencial, en `ingestion_rate_windows`, con un `INSERT … ON CONFLICT DO UPDATE` atómico. Se cuenta después de autenticar y antes de leer el cuerpo. La credencial de lectura tiene su propio presupuesto (11.3, D-6).
- **Sin auditoría en `audit_logs`**: la creación y la revocación no tienen usuario; la tabla guarda `created_at` y `revoked_at`.
- **Log**: código, organización, `source` y duración; nunca el token, el payload, el teléfono ni el cuerpo. La API de lectura registra además el `correlation_id` del emisor, y nunca el texto buscado ni un id buscado (11.3, D-5).
- **Revocación** (O-33): `revokeIngestionCredential` filtra solo por id y la usa solo el script de operador. Desde la 11.3, una regla de `exposed-surface.test.ts` falla si un archivo de `src/app` la nombra o reexporta el módulo entero, con su corrida de mutación: la condición que reabre O-33 queda fijada por guarda.

## Protección de la aplicación web

- **CSRF** ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)): cookie `SameSite=Lax` más verificación de origen, sin tokens de doble envío. Las mutaciones de la UI usan Server Actions, que en Next.js 16.3 solo aceptan `POST` y rechazan un `Origin` distinto del `Host`. Todo Route Handler que modifique datos **con la sesión** verifica `Origin` explícitamente; hasta la 6.5.3 no existe ninguno. El endpoint de ingestión no la verifica (brief-6.5.3, D-5): no lee cookies, la credencial viaja en un encabezado que el navegador no agrega solo y no envía encabezados CORS, así que un sitio ajeno no puede usarlo con la sesión de un usuario. Un test confirma que una sesión válida no lo autentica. **Demostrado en la 8.1** (D-5), no solo confiado al framework: un test captura una Server Action real y la reenvía con el `Origin` de otro sitio; Next aborta la acción con 500 y la base no cambia. La corrida de mutación que agrega ese origen a `serverActions.allowedOrigins` hace que la acción pase a 200, así que el test mide la guarda y no un accidente. El helper de verificación de `Origin` previsto en la 3.4 (D-5) sigue sin escribirse: no hay todavía ningún Route Handler con sesión que lo consuma. Desde la 8.1 hay un `proxy` ([`src/proxy.ts`](../../src/proxy.ts)), pero solo para las cabeceras; la D-6 de la 3.5 sigue vigente en lo suyo ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-6): cada página y cada acción protegida validan la sesión contra la base. Reevaluado el 2026-09-22 con las 13 páginas protegidas que existen hoy (9.1, punto 8 del alcance): **la decisión se mantiene** y `proxy.ts` sigue sin validar sesión. Las 13 llaman a `requireSession` por sí mismas, así que moverlo al proxy no agregaría una defensa sino una segunda donde equivocarse. Se reabre solo si aparece una ruta protegida que no pueda comprobar su sesión por sí misma, y solo para esa ruta.
- **XSS**: escape automático de la capa de renderizado (evitar `dangerouslySetInnerHTML` o equivalentes sin sanitización), más la Content-Security-Policy de abajo. No hay ni un `dangerouslySetInnerHTML` en `src/` (verificado en la 8.1), así que la CSP es defensa en profundidad y no el parche de un agujero conocido.
- **Content-Security-Policy y cabeceras de seguridad**: implementadas en la 8.1 ([brief-8.1](../decisions/brief-8.1-endurecimiento-web.md)), **validadas en integración** sobre `next start` con Chromium. Las emite [`src/proxy.ts`](../../src/proxy.ts) en todas las respuestas salvo los estáticos de Next.
  - **Nonce por request** (D-1): el proxy genera 16 bytes aleatorios por request y pone la política en la cabecera del request —de donde Next la lee para aplicarle el nonce a sus scripts— y en la de la respuesta. Por eso `script-src` no necesita `'unsafe-inline'` pese a que Next emite el payload RSC inline. El proxy existe solo para esto: no valida la sesión, no lee la base y no redirige, así que la D-6 de la 3.5 sigue en pie.
  - **Política**: `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'`; `style-src 'self' 'nonce-…'`; `style-src-attr 'none'`; `img-src`, `font-src`, `connect-src` y `manifest-src` en `'self'`; `object-src`, `base-uri`, `frame-ancestors` y `frame-src` en `'none'`; `form-action 'self'`. Sin `'unsafe-eval'` y sin `'unsafe-inline'` en ninguna directiva. Se entrega en enforce, no en report-only.
  - **Medición (8.1, D-3)**: las diez pantallas se recorrieron en report-only, en claro y oscuro, con cero violaciones. Las pantallas no tienen ni un `<style>` inline ni un solo atributo `style=`, así que `'unsafe-inline'` no hizo falta en `style-src`, que era la limitación que el brief dejaba aceptable.
  - **Cabeceras** (D-2): `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Cross-Origin-Opener-Policy: same-origin` y `Permissions-Policy` negando cámara, micrófono y geolocalización. `frame-ancestors` de la CSP reemplaza a `X-Frame-Options`.
  - **Sin `report-uri`**: no hay receptor de reportes; un endpoint propio quedó fuera de alcance.
  - **`Strict-Transport-Security`**, emitido desde la 9.1: `max-age=31536000; includeSubDomains`, **sin** `preload`. Se emite solo cuando `x-forwarded-proto` dice `https` (`src/proxy.ts`), no siempre: si saliera tambien sobre texto plano, verla en la respuesta no probaría que el TLS está en su lugar. **Verificado en staging el 2026-09-22** (AC-3) con su control sobre HTTP, que devuelve `301` sin la cabecera.
    > **Fe de errata.** Hasta la 9.1 esta línea decía que la cabecera «está definida pero no se emite». En el codigo no estaba definida: había un comentario explicando por qué no se emitía. La afirmación sobrevivió porque «definida» se podía leer como «definida en este documento».
- **Validación de entradas**: todo input de usuario se valida con un esquema explícito (tipo, longitud, formato) antes de tocar la capa de dominio; rechazo explícito, no coerción silenciosa.
- **Rate limiting**, verificado en la 8.4 en sus dos puntos:

  | Punto | Límite | Evidencia |
  | --- | --- | --- |
  | Ingreso, por cuenta | 5 / 15 min | `tests/integration/auth-service.test.ts`: bloquea aun con la contraseña correcta, la ventana vence, un ingreso correcto limpia los fallos, y los intentos guardan hashes y no el email ni la IP |
  | Ingreso, por IP | 20 / 15 min | `tests/integration/auth-service.test.ts`, caso "20 fallos desde una IP bloquean también a otras cuentas": agota la clave de IP con emails distintos y comprueba que otra IP sigue ingresando. Ver H-3 arriba: probado no es lo mismo que sano |
  | Ingestión, por credencial | 120 / min | `tests/integration/ingestion-http.test.ts` caso 9: el pedido excedente responde `429` con `Retry-After`, no escribe nada, otra credencial de la misma organización no se ve afectada y la ventana siguiente reinicia la cuenta |

## Gestión de secretos

- Variables de entorno para secretos locales (`.env`, nunca commiteado; `.env.example` sí versionado con placeholders).
- En staging, un `EnvironmentFile` de `systemd` con permisos `0600` de `root`, fuera del repositorio y fuera de la configuración de CI (9.1, D-8). **El proveedor elegido es un VPS y no tiene gestor de secretos propio**, así que la decisión no fue cuál usar sino qué lo reemplaza. **Límite declarado**: protege contra otro usuario del sistema, **no** contra quien tenga `root` ni contra un respaldo de disco sin cifrar. Es suficiente para un entorno sin datos reales y **no** es lo que se lleva a produccion sin volver a decidirlo.
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
- **En staging la aplicación ya se conecta con un rol miembro de `crm_app`** (9.1, AC-7), no con el dueño. Verificado por efecto el 2026-09-22: `DELETE FROM audit_logs` responde `permission denied`, mientras `SELECT` e `INSERT` siguen permitidos. **La limitación sigue vigente en desarrollo local**, donde la conexión es la del dueño y la defensa efectiva es el trigger: el dueño puede vaciar la tabla con `TRUNCATE` y un superusuario puede desactivar el trigger.

## Backups y restauración

- Backup lógico automático diario desde que exista un entorno persistente (staging en adelante). **Cumplido en staging desde el 2026-09-22** (9.2): `pg_dump` en formato `custom` con el rol dueño, disparado por un timer de `systemd` a las 03:15 UTC con `Persistent=true`, con rotación de 7 copias. **Verificado por efecto**, no por lectura: se observó al servicio correr sin que nadie lo arrancara ([evidencia-9.2](../decisions/evidencia-9.2-backups.md), AC-2). Estuvo declarado **incumplido** entre el momento en que existió el entorno persistente y esta subfase, por el hallazgo H-2 de la revisión independiente de la 9.1.
- Restauración probada periódicamente en un entorno aislado (no en el mismo entorno del backup) para verificar que el backup es realmente utilizable. **Cumplido en staging desde el 2026-09-22** (9.2): el ejercicio crea una base nueva, restaura, compara la lista de tablas y el recuento fila por fila contra el origen, y borra la base al terminar. Cadencia mensual, **ejecutada y no documentada**, y desde la revisión de la 9.2 también **agendada**: hasta entonces el backup tenía timer y la comprobación que lo valida dependía de que alguien se acordara. `crm-restore-check.timer` corre el día 1 a las 04:30 UTC, después del backup, para ejercitar la copia de esa madrugada.
  - **El ejercicio restaura sin `--no-owner` y comprueba el dueño.** Con ese flag las tablas quedan de `postgres` en vez de `crm_owner`: los recuentos coinciden, la aplicación anda, el ejercicio sale en verde, y la próxima migración falla con `must be owner of table`. Medido en el simulacro del 2026-09-22. La versión anterior del ejercicio usaba el flag, o sea que nunca ensayaba el paso que rompe una recuperación real.
  - **Nivel real de esta línea**: el timer del ejercicio y el ejercicio corregido están **validados localmente**, no en staging — el servidor todavía tiene la versión anterior. Lo que está **validado en staging** es el ejercicio tal como corrió el 2026-09-22, con `--no-owner` y disparado a mano.
  - **El ejercicio tiene control negativo ejecutado**: contra un dump truncado sale distinto de cero y no deja base huérfana. Importa porque la primera versión de ese control **no controlaba nada** —`truncate -s 50%` falla en vez de truncar, y el error se tragaba— así que el ejercicio pasaba en verde contra un archivo intacto. Una verificación que no puede fallar no distingue un backup bueno de sí misma rota.
  - **Nivel: validado en staging, y solo el mecanismo.** La base son 55 KB de datos sintéticos: el tiempo de restauración medido acá no predice el de una base con volumen, y esa medición es de la 9.3. **Esto no es «preparado para producción».**
  - **Límites declarados**: la copia fuera del droplet es manual, así que depende de una máquina que puede estar apagada; el cifrado del backup en reposo queda como requisito antes de producción; y está sin verificar si un servicio gestionado exigirá superusuario para restaurar, lo que condiciona la elección de hosting.

## Retención de datos

- Mensajes y conversaciones: **se conservan indefinidamente**, decidido en la 9.2 el 2026-09-22 con condición de reapertura cuando haya tráfico real —escrita como «en la 9.4»; la 9.4 se disolvió el 2026-09-23 y la reapertura pasó a la **Fase 10**, que es donde se decide conectar al agente— ([brief-9.2](../decisions/brief-9.2-backups-y-restauracion.md), D-2; el análisis de lo que costaría un horizonte de borrado está en [DataModel.md](DataModel.md)). Dejó de ser «pendiente»: es una decisión con fecha y con condición, que se puede auditar. **Reevaluada en la 10.1 el 2026-09-23** (R-3 de la [evaluación](../decisions/evaluacion-10.1-mvp.md)): sigue vigente y se reabre en la fase de producción de la integración (Fase 13), o antes si entra un dato personal no sintético.
- Datos de clientes: mecanismo de exportación/eliminación a pedido, aunque sea un procedimiento manual asistido por un admin en el MVP, no necesariamente autoservicio. **Implementado en la 8.2** como procedimiento de operador: el runbook [datos-de-un-cliente](../runbooks/datos-de-un-cliente.md) con dos scripts en `scripts/`, sin pantalla.
  - **Exportación**: completa. Reúne `clients`, `conversations`, `messages` con su cuerpo y `audit_logs` con los valores anteriores. `ingestion_events` queda fuera porque no tiene datos personales, y el archivo lo declara.
  - **Eliminación**: **parcial, y se nombra como minimización, no como eliminación** (brief-8.2, D-3). Un cliente sin conversaciones se borra de verdad. Un cliente con conversaciones **no se puede borrar con ningún rol**: `messages` rechaza `DELETE` y `UPDATE` por trigger ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)) y las claves foráneas hacia `conversations` y `clients` son `ON DELETE RESTRICT`, así que la cadena está cerrada. Para ese caso el procedimiento vacía `phone_e164`, `notes` y el nombre de la ficha, y declara qué queda retenido: los cuerpos de `messages`, las conversaciones y el `diff` de `audit_logs`.
  - **La ejecución no se audita en la base**, a propósito: no hay usuario actor, y auditar el cambio volvería a escribir el teléfono y las notas en el `diff`. Se registra fuera.
  - **Un borrado real necesita revisar el ADR 0013** y es una subfase propia, registrada en [Risks](../planning/Risks.md).

## Amenazas consideradas (threat model inicial, nivel STRIDE simplificado)

Revisado fila por fila en la 8.4. La columna de veredicto dice **cómo se comprobó** la mitigación, no solo que esté diseñada: una mitigación sin evidencia y una mitigación probada no son lo mismo y la tabla no las distinguía.

| Amenaza | Vector | Mitigación de diseño | Veredicto (2026-09-18) |
|---|---|---|---|
| Suplantación | Robo de credenciales | Hash lento, rate limit de login, sesión revocable | `verificado`: argon2id con los mínimos de OWASP y verificación contra un hash ficticio para un email inexistente; la sesión guarda el SHA-256 del token y se revoca al cambiar la contraseña o desactivar al usuario; los dos límites del ingreso probados en integración, el de cuenta y el de IP |
| Manipulación de datos | Bypass de autorización cross-org | Filtro obligatorio por `organization_id` en cada repositorio | `verificado` para los datos de negocio: probado en integración desde la 3.4, y desde la 9.0.1 también en el repositorio, con las siete escrituras de H-7 filtrando por organización y un caso de aislamiento por cada una; la 9.0.4 sumó `ingestion.finishEvent` con su propio caso. Queda declarada y no corregida `ingestion.revokeCredential`, con su condición de reapertura escrita. Queda una excepción declarada y acotada: las tablas de `auth` son globales por diseño (H-1) y su lectura de resúmenes pasa por un punto de entrada único fijado por guarda, no por un filtro propio |
| Repudio | Cambios de stock sin rastro | `inventory_movements` inmutable + `audit_logs` | `verificado`: rol `crm_app` y trigger `BEFORE UPDATE OR DELETE` ([ADR 0013](../decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)), con la limitación ya aceptada de que la aplicación se conecta hoy con el rol dueño |
| Divulgación de información | Logs con contenido de mensajes | Política de logs sin PII/contenido de negocio | `verificado`: las tres capas de la 8.2 —unitaria, guarda y integración— más el enmascarado del teléfono probado en la 5.2 |
| Denegación de servicio | Abuso del login o de ingestión | Rate limiting en ambos puntos | `parcial`, **y con hallazgo**: la ingestión y los dos límites del ingreso están probados, pero sin proxy de confianza el límite por IP es además un vector de denegación de servicio (H-3). Que la defensa esté probada no la vuelve sana: el test confirma que bloquea, y H-3 dice a quién |
| Elevación de privilegios | Un `viewer` invoca una acción de `admin` directamente por API | Autorización server-side en cada caso de uso, no solo en la UI | `verificado-por-lectura`: los 48 puntos de entrada revisados uno por uno; probado en integración para productos, precios, clientes, stock, miembros e información del negocio |

**Lo que este threat model no cubre**: no contempla un atacante con acceso a la base ni al servidor, ni cadena de suministro más allá de la auditoría de dependencias, ni abuso por parte de un `admin` legítimo de su propia organización.

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
