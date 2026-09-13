---
schema: task-brief.v1
task_id: 3.2
task_type: design
generated_at: 2026-09-13
---

# Brief: 3.2 — ADR del mecanismo de sesión

## Objetivo

Decidir y registrar como **ADR 0012** cómo se guardan, validan, renuevan y revocan las sesiones de los usuarios humanos del CRM, y con qué librería (o sin ella). El ADR tiene que dejar resueltos la expiración, la revocación, el tratamiento de `must_change_password` y la protección CSRF, para que la 3.3 (autenticación) y la 3.4 (autorización) se implementen sin reabrir el diseño.

Es una subfase de diseño: no escribe código, no instala dependencias y no crea migraciones. La tabla de sesiones queda **diseñada** en DataModel y se crea en la 3.3.

## Ubicación en la Fase 3

- **Orden previsto**: 3.1 (cerrada) → **3.2** → 3.3 → 3.4 → 3.6 → 3.5 → 3.7.
- **Riesgo del Roadmap que mitiga**: "un mecanismo de sesión inadecuado obliga a rehacer trabajo".
- **Qué no decide**: hash de contraseñas y rate limit (3.3), taxonomía de errores en código y log con `request_id` (3.4).
- **Corrección a Notion**: la descripción de la tarea 3.2 menciona "cambio de organización activa". Con el [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md) no existe organización activa que cambiar ([Risks.md](../planning/Risks.md) ya cerró ese riesgo). El ADR 0012 lo registra como fuera de alcance, y la descripción de Notion se corrige al cerrar, con autorización.

## Hallazgos de la verificación previa (2026-09-13)

1. **Lo que ya está fijado y no se reabre** ([SecurityModel.md](../architecture/SecurityModel.md), [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md), [EngineeringStandards.md](../development/EngineeringStandards.md)):
   - sesiones server-side, sin JWT en `localStorage`;
   - cookie `HttpOnly`, `Secure` en todo entorno con TLS y `SameSite=Lax` o `Strict`, con un identificador opaco resuelto contra almacenamiento server-side ("tabla `sessions` o store dedicado, a definir en Fase 3");
   - el cierre de sesión invalida la sesión en el servidor, no solo la cookie;
   - la autenticación como servicio de terceros está descartada salvo ADR nuevo;
   - `organization_id` sale de la sesión autenticada y se verifica contra la membresía (FR-ORG-03: sin sesión válida, redirección a login).
2. **Guía de Next.js 16.3** (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`):
   - distingue sesiones sin estado (cookie cifrada) de sesiones en base de datos, y describe las segundas como "más seguras";
   - recomienda una capa de acceso a datos (DAL) para la verificación segura, y `proxy` solo para chequeos optimistas: "no debe usarse como solución completa de sesión o autorización" (`16-proxy.md`).
3. **CSRF en Next.js 16.3** (`data-security.md`): las Server Actions solo aceptan `POST` y comparan `Origin` con `Host`/`X-Forwarded-Host`, abortando si no coinciden. La guía no describe esa comprobación para Route Handlers: se asume que **no** la tienen (`inferido`).
4. **Registro npm (2026-09-13)**:
   - `lucia` 3.2.2: **deprecado**. Su guía de migración recomienda implementar las sesiones directamente;
   - `@oslojs/crypto` 1.0.1: **deprecado**;
   - `better-auth` 1.7.4 (2026-09-10): acepta `next ^16`, `drizzle-orm ^0.45.2`, `drizzle-kit >=0.31.4` y `pg ^8`. Trae `kysely`, `zod`, `jose`, `@noble/*` y `@better-auth/telemetry`, más adaptadores de Prisma y MongoDB. Usa su propio esquema de tablas (`user`, `session`, `account`, `verification`);
   - `next-auth` 4.24.15 estable, con la v5 todavía en `5.0.0-beta.32`;
   - `iron-session` 9.0.1: cookie cifrada sin estado, sin revocación server-side;
   - `jose` 6.2.12.
5. **Node 24.15 trae `crypto.argon2` nativo**: un `argon2id` con 19 MiB, 2 pasadas y paralelismo 1 tardó 72 ms, sin avisos de API experimental. Es un dato para la 3.3; su estabilidad declarada en la documentación de Node queda **pendiente** de verificar ahí.
6. **Primitivas necesarias disponibles en `node:crypto`** sin dependencias: `randomBytes`, `createHash("sha256")` y `timingSafeEqual`.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. Escribir el **ADR 0012 — Mecanismo de sesión**, con contexto, decisión, alternativas descartadas y consecuencias. Debe cubrir:
   - almacenamiento y forma del identificador;
   - librería o implementación propia;
   - expiración y renovación;
   - eventos que revocan sesiones;
   - qué datos se leen de la sesión y cuáles de la base en cada request;
   - `must_change_password`;
   - atributos de la cookie y CSRF;
   - rol de `proxy` frente a la verificación server-side;
   - fuera de alcance: organización activa (ADR 0010), recordarme, varios dispositivos visibles, 2FA.
3. [DataModel.md](../architecture/DataModel.md): tabla `sessions` **diseñada**, con columnas, claves foráneas, índices y política de limpieza de expiradas según D-1 y D-3, más su fila en el diagrama.
4. [SecurityModel.md](../architecture/SecurityModel.md): reemplazar "a definir en Fase 3" por la decisión y enlazar el ADR. Actualizar la política CSRF según D-6.
5. [EngineeringStandards.md](../development/EngineeringStandards.md): fila "Autenticación" con lo decidido en D-2.
6. [Risks.md](../planning/Risks.md): la fila "Mecanismo de sesión (ADR pendiente)" pasa a resuelta con enlace al ADR.
7. [TestingStrategy.md](../development/TestingStrategy.md): casos obligatorios que el ADR impone a la 3.3 y la 3.4 (logout invalida la sesión en el servidor, sesión expirada rechazada, revocación por cambio de contraseña, usuario desactivado sin acceso inmediato, token manipulado rechazado).
8. Filas del brief y del ADR en `docs/decisions/README.md`.

## Alcance excluido

- Código, `schema.ts`, migraciones, dependencias y cualquier archivo fuera de `docs/`.
- Hash de contraseñas: algoritmo nativo o librería, parámetros y formato (3.3). El hallazgo 5 queda como insumo.
- Rate limiting de login: almacenamiento y ventanas (3.3).
- Implementación de la DAL, de los guards por rol y de la traducción de errores (3.4).
- Pantalla de login y de cambio obligatorio de contraseña (3.5).
- Autenticación de servicio a servicio para la ingestión (Fase 6, [IntegrationBoundaries.md](../architecture/IntegrationBoundaries.md)).
- Varias organizaciones por usuario, "recordarme", listado de sesiones activas, "cerrar sesión en todos los dispositivos" como pantalla, 2FA, OAuth o login sin contraseña.
- CSP y cabeceras de seguridad generales (Fase 8).
- Cambios en Notion, salvo con autorización propia.

## Archivos o componentes autorizados

Lista cerrada:

- `docs/decisions/brief-3.2-adr-mecanismo-de-sesion.md` (este archivo).
- `docs/decisions/0012-mecanismo-de-sesion.md` (nuevo).
- `docs/decisions/README.md`: filas del brief y del ADR 0012.
- `docs/architecture/DataModel.md`: tabla `sessions` y diagrama.
- `docs/architecture/SecurityModel.md`: secciones Autenticación y Protección de la aplicación web.
- `docs/development/EngineeringStandards.md`: fila Autenticación.
- `docs/planning/Risks.md`: fila del mecanismo de sesión.
- `docs/development/TestingStrategy.md`: casos obligatorios de sesión.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [SecurityModel.md](../architecture/SecurityModel.md) y [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): requisitos de sesión ya fijados.
2. [DataModel.md](../architecture/DataModel.md), [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md) y [Overview.md](../architecture/Overview.md): `users`, membresía, módulo `auth` dueño de la sesión, y `UNAUTHENTICATED`/`FORBIDDEN`.
3. [Screens.md §1](../product/Screens.md#1-inicio-de-sesión) y [wireframe 01](../product/wireframes/01-inicio-de-sesion.md): flujo de login y cambio obligatorio de contraseña.
4. Documentación de Next.js 16.3 incluida en `node_modules/next/dist/docs/`: sesiones, `cookies`, `proxy` y CSRF de Server Actions.
5. Registro npm al 2026-09-13 para el estado de las librerías.

## Dependencias

- 3.1 cerrada (commit `6e919e9`, CI en verde en la ejecución 34786887259).

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Almacenamiento de la sesión

- **Opciones**:
  - (a) **Tabla `sessions` en PostgreSQL**. La cookie lleva un token aleatorio de 32 bytes (`randomBytes`, codificado en base64url), y la tabla guarda solo su **SHA-256** como clave primaria, con `user_id`, `created_at` y `expires_at`. Validar es hashear el token recibido y buscar la fila.
  - (b) **Cookie cifrada sin estado** (`iron-session` o `jose`), sin tabla.
  - (c) **Store dedicado** (Redis u otro).
- **Recomendación**: (a).
  - Es la única opción que cumple "el cierre invalida la sesión en el servidor" sin agregar infraestructura.
  - Guardar el hash y no el token hace que una copia filtrada de la base no sirva para suplantar a nadie.
  - (b) no permite revocar: una cookie robada vale hasta que expira. (c) suma un servicio que [Environments.md](../development/Environments.md) excluye sin necesidad concreta.
- **Consecuencia**: una consulta por request para validar la sesión, irrelevante con el volumen del MVP. `sessions` pertenece al módulo `auth` y se crea en la 3.3.

### D-2 — Librería

- **Opciones**:
  - (a) **Implementación propia sobre `node:crypto` y la API `cookies` de Next.js**, sin dependencias. Es el camino que proponen la guía de Next.js para sesiones en base y la migración de Lucia v3.
  - (b) **Better Auth 1.7.4**: compatible por dependencias pares, pero trae su propio esquema de tablas, sus endpoints y un árbol de dependencias (Kysely, Zod, telemetría, adaptadores que no se usan).
  - (c) **Auth.js**: la v5 sigue en beta, y el proveedor de credenciales de la v4 no está pensado para sesiones en base.
  - (d) **`iron-session`**: descartada con D-1 (b).
- **Recomendación**: (a).
  - El alcance es chico y cerrado: crear, validar, renovar y borrar una fila, más una cookie.
  - (b) duplicaría `users` con su propia tabla `user`, o obligaría a adaptar el [DataModel](../architecture/DataModel.md) a la librería. Contradice "el esquema vive en el módulo dueño" y suma superficie que no se usa.
  - El costo de (a) es escribir código de seguridad propio. Se compensa con los casos obligatorios del punto 7 del alcance, probados intentando violarlos.
- **Consecuencia**: la 3.3 no instala dependencias de sesión. `EngineeringStandards.md` registra "sesiones server-side propias".

### D-3 — Expiración y renovación

- **Opciones**:
  - (a) **Deslizante de 7 días con tope absoluto de 30**: cada request válido extiende `expires_at` a 7 días, pero solo escribe en la base cuando queda menos de la mitad. Pasados 30 días desde `created_at` hay que volver a ingresar.
  - (b) **Fija de 7 días**, sin renovación, como el ejemplo de Next.js.
  - (c) **Deslizante de 30 días**, sin tope.
- **Recomendación**: (a). Un admin que trabaja a diario no pierde la sesión cada semana, y una sesión robada no vive indefinidamente. La escritura solo a mitad de ventana evita un `UPDATE` por request.
- **Consecuencia**: `sessions` necesita `created_at` y `expires_at`. Las filas expiradas se borran al detectarlas en la validación y, para el usuario que ingresa, en el login. En el MVP no hay tarea programada.

### D-4 — Qué lleva la sesión y qué se lee de la base

- **Opciones**:
  - (a) **La sesión solo identifica al usuario.** En cada validación se hace un único `JOIN` de `sessions`, `users` y `organization_members` que devuelve `user_id`, `organization_id`, `role`, `is_active` y `must_change_password`. Nada de eso se guarda en la cookie ni en la fila de sesión.
  - (b) **Rol y organización copiados en la sesión** al ingresar.
- **Recomendación**: (a). Un cambio de rol o una desactivación (3.7) rigen desde el request siguiente, sin revocar ni sincronizar nada. Además, la organización sale siempre de la membresía, como exige SecurityModel.
- **Consecuencia**: un usuario con `is_active = false` o sin membresía recibe `UNAUTHENTICATED` aunque su sesión exista. Además se revocan todas sus sesiones:
  - al **cambiar la contraseña**: se borran todas y se crea una nueva para el request actual;
  - al **desactivarlo** (3.7);
  - al **ingresar**, que siempre crea una sesión nueva e impide fijar un identificador de antemano.

### D-5 — `must_change_password`

- **Opciones**:
  - (a) **Sesión normal, con restricción en la validación**: si `must_change_password` es `true`, la capa de autorización (3.4) solo permite el paso de cambio de contraseña y el cierre de sesión. Cualquier otra ruta o acción redirige a ese paso o devuelve `FORBIDDEN`.
  - (b) **Sesión "restringida"** con un campo propio en `sessions`, que se promueve al cambiar la contraseña.
- **Recomendación**: (a). La fuente de verdad es una sola columna (`users.must_change_password`), leída en el mismo `JOIN` de D-4. (b) duplica ese estado en dos tablas.
- **Consecuencia**: el caso obligatorio de [TestingStrategy.md](../development/TestingStrategy.md) se prueba en la 3.4 contra rutas y Server Actions reales.

### D-6 — Cookie y CSRF

- **Opciones**:
  - (a) **Cookie `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain` y `Secure` en todo entorno con TLS**, llamada `__Host-crm_session` con TLS y `crm_session` en desarrollo local sin TLS. **CSRF**: las mutaciones de la UI usan Server Actions, que ya comparan `Origin` con `Host`. Todo Route Handler que modifique datos verifica `Origin` explícitamente. `proxy` solo hace redirecciones optimistas y nunca es la única verificación.
  - (b) La cookie de (a), más **tokens CSRF de doble envío** en todas las mutaciones.
  - (c) **`SameSite=Strict`**: los enlaces entrantes desde otro sitio (por ejemplo, un correo) llegan sin sesión y obligan a ingresar otra vez.
- **Recomendación**: (a). `SameSite=Lax` más la verificación de origen es la defensa que SecurityModel ya prevé y que Next.js implementa. Los tokens de (b) no agregan protección real con `POST` y verificación de origen, y suman estado.
- **Consecuencia**: la 3.4 provee la verificación de `Origin` para Route Handlers mutantes. La Fase 8 verifica CSRF y XSS. El prefijo `__Host-` exige `Secure`, por eso cambia el nombre de la cookie según haya TLS.

## Resolución

Brief aprobado por el usuario el **2026-09-13**. D-1 a D-6 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó además los cambios en Notion: la tarea 3.2 pasa a "En proceso" y su descripción ya no menciona el cambio de organización activa.

Subfase **cerrada el 2026-09-13** con confirmación del usuario. Nivel alcanzado: *diseñado*. AC-1 a AC-8 están cumplidos, con la evidencia en [CHANGELOG.md](../../CHANGELOG.md).

| Decisión | Resolución |
|---|---|
| D-1 Almacenamiento | Tabla `sessions` en PostgreSQL; la cookie lleva un token aleatorio de 32 bytes y la tabla guarda su SHA-256 |
| D-2 Librería | Implementación propia sobre `node:crypto` y `cookies` de Next.js, sin dependencias |
| D-3 Expiración | Deslizante de 7 días, renovada a mitad de ventana, con tope absoluto de 30 días |
| D-4 Contenido | La sesión solo identifica al usuario; rol, organización, `is_active` y `must_change_password` se leen de la base en cada validación; revocación total al cambiar contraseña y al desactivar; sesión nueva en cada ingreso |
| D-5 `must_change_password` | Sesión normal con restricción aplicada en la validación (3.4) |
| D-6 Cookie y CSRF | `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`, `Secure` con TLS (`__Host-crm_session`; `crm_session` sin TLS); Server Actions para mutaciones de UI y verificación de `Origin` en Route Handlers mutantes; `proxy` solo optimista |

## Invariantes

- Nada de código, dependencias, migraciones ni archivos fuera de la lista autorizada.
- No se reabren decisiones aceptadas: sesiones server-side, PostgreSQL propio, sin autenticación de terceros, un usuario y una organización (ADRs 0001, 0004 y 0010; SecurityModel).
- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- Toda afirmación sobre librerías o sobre Next.js cita la fuente consultada y su fecha.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: el ADR 0012 existe con estado **aceptada**, sigue la plantilla de `docs/decisions/README.md` y cubre cada punto del apartado 2 del alcance incluido, incluidas las alternativas descartadas con su motivo.
- **AC-3**: DataModel describe `sessions` con columnas, tipos, clave primaria, clave foránea a `users` con su `ON DELETE`, índices para las consultas de D-3 y D-4 y política de limpieza. Queda marcada como diseñada y dueña `auth`, y aparece en el diagrama.
- **AC-4**: SecurityModel ya no dice "a definir en Fase 3" sobre la sesión, y su política CSRF coincide con D-6.
- **AC-5**: EngineeringStandards (fila Autenticación) y Risks (fila del mecanismo de sesión) reflejan la decisión con enlace al ADR.
- **AC-6**: TestingStrategy lista los casos obligatorios de sesión: logout invalida la sesión en el servidor, sesión expirada rechazada, tope absoluto, revocación por cambio de contraseña, usuario desactivado sin acceso en el request siguiente, token manipulado o inexistente rechazado y `must_change_password` restringido.
- **AC-7**: el ADR no contradice a DataModel, SecurityModel, NonFunctionalRequirements, Overview ni al ADR 0010. Si aparece una contradicción, se documenta explícitamente.
- **AC-8**: `git status` muestra solo archivos autorizados y los enlaces internos resuelven.

## Pruebas y evidencia requerida

- **Evidencia documental**: el ADR 0012, los diffs de los cinco documentos, la verificación de enlaces y el contraste explícito de AC-7 contra cada documento citado.
- La CI del commit de cierre sigue en verde. No valida el diseño, pero confirma que no se rompió nada.

**Nivel resultante esperado: diseñado.** Ninguna parte del mecanismo queda implementada ni validada. Se implementa y valida en la 3.3 y la 3.4.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si una decisión exige reabrir un ADR aceptado o un requisito de SecurityModel o NonFunctionalRequirements: se reporta antes de escribir el ADR.
- Si durante la escritura aparece una elección que D-1 a D-6 no cubren: se detiene y se pregunta, sin inventar política.
- Si hace falta tocar un archivo fuera de la lista autorizada.
- Antes de commit, push o cambios en Notion.
