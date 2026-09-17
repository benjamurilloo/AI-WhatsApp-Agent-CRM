---
schema: task-brief.v1
task_id: 6.5.3
task_type: implementation
generated_at: 2026-09-17
---

# Brief: 6.5.3 — Autenticación de servicio y rate limit

## Objetivo

Exponer el caso de uso de la 6.5.2 como el endpoint del [contrato v1](../contracts/ingestion-v1.md), `POST /api/ingestion/v1/events`, protegido desde el primer momento:

1. **Credencial de servicio** por organización y emisor, guardada solo como hash. De ella salen la organización y el `source` del evento.
2. **Límite de tasa** por credencial, con `429` y `Retry-After`.
3. **Modo de prueba**: el endpoint está apagado salvo que la configuración lo encienda, y solo acepta las credenciales de una allowlist.
4. **Route Handler** que lee el cuerpo con el límite de 64 KiB, llama a `recordIngestionEvent` y traduce cada resultado a las respuestas del contrato, con log estructurado sin payload.
5. **Decisión sobre `Origin`** para un endpoint de servicio sin cookies.

Nivel esperado: **validado localmente y en CI** (`deterministic`) para la autenticación, el límite de tasa, el modo de prueba y el endpoint, con requests sintéticos y fixtures de forma asumida. **No** se alcanza *validado en integración*: no hay emisor real (Roadmap, Fase 6; IntegrationBoundaries).

## Ubicación en la Fase 6

- **Orden**: 6.5.1 y 6.5.2 (cerradas) → **6.5.3** → cierre de la Fase 6.
- **Notion**: la tarea 6.5.3 (`3d8702be6f4e817eb92fe723d3c430c7`) está en "Bandeja de Entrada". Su descripción: "Credencial por organización con hash y límite de tasa. La validación solo alcanza nivel deterministic: no hay emisor real."
- **Necesario ahora**: la credencial, el límite, el modo de prueba, el endpoint y sus tests.
- **Requisito antes de producción** (Fases 8 y 9): la verificación en Fase 8 del límite de tasa (Roadmap), la gestión de secretos (9.1) y la IP detrás de un proxy real.
- **Mejora posterior**: pantalla de credenciales, métricas de uso por credencial y conexión con un emisor real (proyecto de integración).
- **Gates de entrada**:
  1. 6.5.2 cerrada, con la CI en verde en `6d7626a` y en el cierre `dbc3879`. Verificado el 2026-09-17.
  2. Contenedor de PostgreSQL en marcha.

## Hallazgos de la verificación previa (2026-09-17)

1. **No existe ningún Route Handler mutante.** El único es `GET /api/health`. SecurityModel exige que todo Route Handler que modifique datos verifique `Origin`, pensando en la sesión por cookie.
2. **No hay tabla para credenciales de servicio.** DataModel no la prevé, y la descripción de Notion pide una credencial "con hash". Hace falta una migración nueva (la última es la 0012).
3. **Precedente de token**: la sesión guarda el SHA-256 de un token aleatorio de 32 bytes, nunca el token (ADR 0012).
4. **Precedente de límite de tasa**: el ingreso usa la tabla `login_attempts` en PostgreSQL, no memoria (brief-3.3, D-4).
5. **La taxonomía ya tiene `RATE_LIMITED` → 429** y el resto de los códigos del contrato (`src/shared/errors/`).
6. **`recordIngestionEvent(context, body, receivedAt)`** ya valida el `source`, el cuerpo y el tamaño en caracteres del mensaje, y devuelve resultados tipados sin HTTP.
7. **`audit_logs` exige un `actor_user_id`**: la creación de una credencial desde un script no tiene usuario.
8. **Los end-to-end levantan `next start` con el entorno del proceso** (`playwright.config.ts`): una variable nueva se pasa ahí.
9. **Gate de salida de la Fase 6**: una búsqueda que confirme que no hay orígenes reales configurados.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **Esquema en `src/modules/ingestion/schema.ts`** y migraciones generadas (0013) más una `--custom` de privilegios (0014), según D-1 y D-3:
   - `ingestion_credentials`: `id`, `organization_id` (FK a `organizations`), `source`, `token_hash` (único), `created_at`, `revoked_at` nulo. `CHECK` de `source` y `token_hash` no vacíos;
   - `ingestion_rate_windows`: `credential_id` (FK), `window_start`, `request_count`, con clave primaria `(credential_id, window_start)`;
   - privilegios de `crm_app`: `SELECT`, `INSERT` y `UPDATE` sobre credenciales, sin `DELETE`; `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre las ventanas.
3. **`src/modules/ingestion/credentials.ts`** (o dentro de `service.ts`), según D-2:
   - `createIngestionCredential(organizationId, source)`: valida el `source` con `isOpaqueReference`, genera el token, guarda su hash y devuelve el token una sola vez;
   - `revokeIngestionCredential(credentialId)`;
   - `authenticateIngestionRequest(authorizationHeader)`: devuelve la credencial con `organizationId` y `source`, `UNAUTHENTICATED` o `FORBIDDEN` (revocada).
4. **Límite de tasa** en `ingestion`, según D-3: `consumeIngestionRate(credentialId, now)` devuelve permitido, o `RATE_LIMITED` con los segundos de espera.
5. **Modo de prueba**, según D-4: `INGESTION_ENABLED` y `INGESTION_ALLOWED_CREDENTIALS`, leídas y validadas en `ingestion`, con `.env.example` documentado y apagado por defecto.
6. **Script de credenciales**, según D-2: `scripts/ingestion-credential.ts` con `create --org <slug> --source <source>` y `revoke --id <id>`, y su script en `package.json` (`ingestion:credential`). Imprime el token solo al crearlo.
7. **Route Handler** `src/app/api/ingestion/v1/events/route.ts`, delgado. Orden de las comprobaciones:
   1. modo de prueba apagado → `404` sin cuerpo;
   2. `Authorization: Bearer <token>` → `401` o `403`;
   3. credencial fuera de la allowlist → `403`;
   4. límite de tasa → `429` con `Retry-After`;
   5. `Content-Type` distinto de `application/json`, cuerpo de más de 64 KiB (por `Content-Length` y contando los bytes leídos) o no UTF-8 → `400` con `fields: ["body"]`;
   6. `recordIngestionEvent` → `201`, `200`, `400`, `409`;
   7. error inesperado → `500` con `INTERNAL`.

   Toda respuesta lleva `Cache-Control: no-store` y el `request_id`. Cada request registra `logEvent` con organización y `source` cuando se conocen, código y duración, nunca el token, el payload, el teléfono ni el cuerpo.
8. **Lectura del cuerpo con límite** en `src/shared/http/`, reutilizable y con test unitario.
9. **Tests de integración** en `tests/integration/ingestion-http.test.ts`, que llaman al `POST` exportado con objetos `Request` contra PostgreSQL real:
   - credencial válida: `201` y luego `200` para el mismo evento, con el cuerpo del contrato y sin ids internos;
   - la organización y el `source` salen de la credencial: el mismo evento con dos credenciales de distinto `source` da dos eventos;
   - sin encabezado, con otro esquema, con un token desconocido o mal formado → `401`; revocada → `403`; fuera de la allowlist → `403`; modo apagado → `404`. Ninguno escribe en `ingestion_events`;
   - `VALIDATION_ERROR` por tipo de contenido, por tamaño (`Content-Length` y cuerpo real sin él) y por evento inválido, sin repetir el payload;
   - `409` para otro contenido y para el mensaje repetido con otro `event_id`;
   - límite de tasa: el request `N + 1` de la ventana da `429` con `Retry-After`, otra credencial no se ve afectada y la ventana siguiente vuelve a permitir. El tiempo se inyecta, sin esperas reales;
   - concurrencia del contador: `N + k` requests simultáneos permiten exactamente `N`;
   - la base guarda solo el hash: el token no aparece en ninguna fila;
   - el log no contiene el token, el teléfono ni el cuerpo del mensaje;
   - cada rechazo por autenticación, allowlist o tasa se corre una vez sin su protección para registrar que el test falla.
10. **Tests unitarios**: el formato del token, la lectura del encabezado, la configuración del modo de prueba y la lectura del cuerpo con límite.
11. **Un end-to-end mínimo** `tests/e2e/ingestion.spec.ts` contra `next start`, según D-6: un evento aceptado y su conversación visible en la pantalla 8 para un `admin`, y un `401`. `playwright.config.ts` enciende el modo de prueba con una credencial creada por el propio spec.
12. **Documentos**:
    - el contrato: estado, autenticación (formato del encabezado), modo de prueba, `404`, `Retry-After` y evidencia;
    - SecurityModel: credencial de servicio, límite de tasa, modo de prueba y la decisión sobre `Origin` (D-5);
    - DataModel: las dos tablas nuevas y el diagrama;
    - IntegrationBoundaries, Environments (variables y script), TestingStrategy, TraceabilityMatrix (FR-CONV-04 y 05), RepositoryStructure y el índice de decisiones.

## Alcance excluido

- Cualquier emisor real, URL, credencial real o configuración que apunte a un sistema existente.
- Pantalla de credenciales y su auditoría en `audit_logs` (hallazgo 7).
- Rotación automática, expiración, permisos por tipo de evento y `last_used_at`.
- CORS: el endpoint no responde a `OPTIONS` ni envía encabezados CORS.
- Límite de tasa por IP (sin proxy confiable no es fiable) y cambios al límite del ingreso.
- Cambios al caso de uso de la 6.5.2 más allá de lo que el Route Handler necesite leer, y cambios al contrato fuera de lo listado.
- Dependencias nuevas.
- El cierre de la Fase 6: va aparte, después de esta subfase.

## Archivos o componentes autorizados

- `src/modules/ingestion/`: `schema.ts`, `service.ts`, `repository.ts`, `index.ts`, archivos nuevos de credenciales, tasa y configuración, y sus tests unitarios.
- `drizzle/0013_*.sql`, `drizzle/0014_*.sql` y `drizzle/meta/`, generados con `npm run db:generate` (la 0014 con `--custom`).
- `src/shared/http/` (nuevo), con su test.
- `src/app/api/ingestion/v1/events/route.ts` (nuevo).
- `scripts/ingestion-credential.ts` (nuevo) y la entrada `ingestion:credential` en `package.json`, sin tocar dependencias.
- `.env.example`, `playwright.config.ts` (solo el entorno del servidor) y `tests/e2e/global-setup.ts` si el spec necesita limpiar las tablas nuevas.
- Tests nuevos: `tests/integration/ingestion-http.test.ts`, `tests/e2e/ingestion.spec.ts`. Si el esquema necesita casos propios, `tests/integration/ingestion-credentials-schema.test.ts`.
- Documentos listados en el punto 12 del alcance.

## Fuentes de verdad

1. [contracts/ingestion-v1.md](../contracts/ingestion-v1.md) y `src/modules/ingestion/`.
2. [DataModel](../architecture/DataModel.md) y las migraciones hasta la 0012.
3. [SecurityModel](../architecture/SecurityModel.md), [IntegrationBoundaries](../architecture/IntegrationBoundaries.md) y [ADR 0012](0012-mecanismo-de-sesion.md) (token con hash) y [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) (privilegios).
4. [brief-3.3](brief-3.3-autenticacion.md) (límite de intentos), [brief-6.5.1](brief-6.5.1-contrato-de-ingestion.md) (D-3) y [brief-6.5.2](brief-6.5.2-registro-idempotente-y-proyeccion.md) (D-1).
5. [Roadmap](../planning/Roadmap.md), Fase 6: criterios y gate de salida.

## Dependencias

- 6.5.2 cerrada.
- El cierre de la Fase 6 depende de esta subfase.
- La Fase 8 verifica el límite de tasa implementado acá.

## Resolución (2026-09-17)

El usuario aprobó el brief con las recomendaciones de D-1 a D-6, incluida la allowlist por credencial (D-4), y autorizó pasar la tarea 6.5.3 a "En proceso" en Notion (hecho). Aplicar las migraciones a la base de desarrollo sigue necesitando su autorización.

## Decisiones pendientes

### D-1 — ¿Dónde viven las credenciales?

- (a) **Tabla `ingestion_credentials`** en `ingestion`, con el SHA-256 del token, organización, `source` y revocación. Varias credenciales por organización y emisor permiten rotar sin corte: se crea la nueva y se revoca la vieja.
- (b) Variable de entorno con los hashes y su organización. Evita la migración, pero cambiar una credencial exige redesplegar y no hay revocación con fecha.

**Recomendación: (a).** Es lo que describe Notion, sigue el precedente de `sessions` y deja la revocación registrada. Un token de 32 bytes aleatorios no necesita un hash lento: SHA-256 alcanza, como en la sesión.

### D-2 — Formato del token y gestión

- **Formato**: `crm_ing_` seguido de 32 bytes aleatorios en base64url. El prefijo permite reconocerlo en un escáner de secretos.
- **Transporte**: `Authorization: Bearer <token>`. Cualquier otro esquema o formato es `401`.
- **Gestión**: un script local (`npm run ingestion:credential`) crea y revoca, sin pantalla. El token se imprime una sola vez. Sin auditoría en `audit_logs`, porque no hay usuario; la tabla guarda `created_at` y `revoked_at`.

**Recomendación: así.** Una pantalla de credenciales es una mejora posterior y no está en los wireframes.

### D-3 — Almacenamiento del límite de tasa

- (a) **Ventana fija en PostgreSQL**: `ingestion_rate_windows`, una fila por credencial y minuto, incrementada con `INSERT … ON CONFLICT DO UPDATE … RETURNING request_count` en su propia transacción, antes de leer el cuerpo. Las ventanas viejas de la credencial se borran en la misma operación.
- (b) Contador en memoria del proceso. No sobrevive a reinicios ni sirve con más de una instancia.
- (c) Una fila por request, como `login_attempts`. Más filas para el mismo resultado.

**Recomendación: (a), con 120 requests por minuto por credencial** como constante del módulo. Es atómica bajo concurrencia sin bloqueos explícitos y sirve con varias instancias. Límite aceptado: una ventana fija admite hasta el doble del límite en el borde entre dos minutos. `Retry-After` son los segundos que faltan para la ventana siguiente.

### D-4 — Modo de prueba

- **`INGESTION_ENABLED`**: si no es `"true"`, el endpoint responde `404` sin tocar la base. Por defecto, apagado.
- **`INGESTION_ALLOWED_CREDENTIALS`**: lista de ids de credencial separados por comas. Una credencial válida que no está en la lista recibe `403`, antes de contar para el límite y de leer el cuerpo. Vacía, rechaza todo.
- Una configuración inválida (por ejemplo, un id que no es UUID) apaga el endpoint y queda en el log.

**Recomendación: así.** Cumple el modo de prueba de IntegrationBoundaries sin ningún emisor configurado. Queda la pregunta de si la allowlist debe ser por credencial o por organización y `source`; la recomendación es por credencial, porque es lo que se revoca.

### D-5 — ¿Se verifica `Origin`?

- (a) **No.** El endpoint no lee cookies ni sesión, y la credencial viaja en un encabezado que un navegador no agrega solo. Sin encabezados CORS, un sitio ajeno no puede enviarlo. SecurityModel se actualiza: la regla de `Origin` aplica a los Route Handlers que usan la sesión.
- (b) Sí, rechazando todo request con `Origin`. Bloquea el uso desde un navegador, que el contrato no prevé, pero puede rechazar emisores que envían el encabezado por defecto.

**Recomendación: (a)**, con un test que confirma que una cookie de sesión válida no autentica el endpoint.

### D-6 — Nivel y forma de la evidencia HTTP

- (a) **Integración llamando al `POST` exportado** con `Request` contra PostgreSQL real, para todos los casos, más **un end-to-end mínimo** contra `next start` que prueba que la ruta existe, que el entorno se lee y que el evento aparece en la pantalla 8.
- (b) Solo el end-to-end: más lento, y el tiempo y la concurrencia son más difíciles de controlar.

**Recomendación: (a).** El nivel declarado es *validado localmente y en CI* (`deterministic`): los requests son sintéticos y los fixtures, de forma asumida.

## Invariantes

- La organización y el `source` salen solo de la credencial; el payload no puede cambiarlos.
- El token nunca se guarda, se registra ni se devuelve, salvo al crearlo en el script.
- Ningún rechazo previo al caso de uso (modo, credencial, allowlist, tasa, cuerpo) escribe en `ingestion_events`, `conversations` ni `messages`.
- Un request rechazado por credencial o allowlist no consume límite.
- Las respuestas de éxito solo traen referencias del emisor; las de error no repiten el payload.
- Con la configuración por defecto, el endpoint está apagado.
- Ningún archivo del repositorio configura un emisor, una URL o una credencial real.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 resueltas y registradas; migraciones 0013 y 0014 generadas con Drizzle Kit, aplicadas a la base de test y, con autorización, a la de desarrollo, y `db:generate` sin cambios después.
- **AC-2**: los casos del punto 9 del alcance pasan contra PostgreSQL real, con las corridas sin protección registradas en el brief.
- **AC-3**: el end-to-end mínimo pasa contra `next start`, y los end-to-end existentes siguen en verde.
- **AC-4**: typecheck, lint, formato, guardas, unitarios, integración y build pasan en local.
- **AC-5**: los documentos del punto 12 quedan actualizados, sin afirmar un nivel mayor al alcanzado.
- **AC-6**: una búsqueda en el repositorio confirma que no hay emisores, URLs ni credenciales reales configurados.
- **AC-7**: la CI queda en verde con todos los pasos, verificada con `gh run view`.

## Pruebas y evidencia requerida

- Salida de `npm run test` y del end-to-end, con el número de casos.
- Corridas de mutación: sin la verificación de revocación, sin la allowlist, sin el `ON CONFLICT DO UPDATE` del contador y sin el límite de bytes, cada una con los casos que fallan.
- Confirmación de que el token no aparece en la base ni en el log.
- Resultado de la búsqueda de AC-6.
- Toda revisión es autoevaluación del mismo agente.

## Condiciones de detención

- Una migración que Drizzle Kit no genere sin editar SQL a mano, o que falle al aplicarse.
- Necesitar una dependencia nueva.
- Necesitar cambiar el comportamiento de `recordIngestionEvent` o el contrato fuera de lo listado.
- Que Next.js 16 no permita leer el cuerpo como stream con límite en un Route Handler.
- Que un end-to-end existente falle por el cambio.
- Antes de ejecutar migraciones contra la base de desarrollo, de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-17)

La implementación está terminada. No se activó ninguna condición de detención. Con autorización del usuario, las migraciones 0013 y 0014 se aplicaron a la base de desarrollo el 2026-09-17 (AC-1); con el endpoint apagado en `.env`, responde `404`.

### Desvíos respecto del brief, confirmados por el usuario el 2026-09-17

1. **`src/shared/log/index.ts` suma el campo opcional `source`**, con su caso en `log.test.ts`. El contrato promete registrar el `source` de los rechazos y `LogEvent` no tenía dónde. No cambia ningún otro evento.
2. **`tests/integration/audit.test.ts` e `identity-schema.test.ts` suman las tablas nuevas** a sus listas: `ingestion_credentials` entre las tablas sin borrado, y las dos tablas entre las esperadas. Sin ese cambio fallaban 5 casos, porque ambos tests enumeran todas las tablas.
3. **La lógica del endpoint vive en `handler.ts`, junto a `route.ts`**, para que los tests de integración le pasen la hora. `route.ts` solo la llama. Next.js solo expone `route.ts`.

### Precisiones de la implementación

- **El script recibe `--org <organization_id>`**: `organizations` no tiene slug.
- **Modo de prueba**: se lee en cada request. Apagado, responde `404` sin tocar la base.
- **Encabezados**:
  - `401` lleva `WWW-Authenticate: Bearer`;
  - las respuestas de éxito llevan `X-Request-Id`;
  - toda respuesta lleva `Cache-Control: no-store`.
- **`Content-Type`**: se acepta `application/json` con `charset=utf-8` o sin `charset`.
- **Cuerpo**: se lee como stream y se corta en cuanto supera 64 KiB. Los bytes que no son UTF-8 dan `VALIDATION_ERROR` con `body`.
- **Un `source` inválido que llega desde una credencial** se trata como error interno: la credencial ya lo validó al crearse.
- **El contador borra las ventanas vencidas** de la credencial en la misma sentencia que cuenta.
- **El end-to-end no analiza con axe**: no agrega pantallas, y la pantalla 8 ya tiene sus casos de accesibilidad.
- **Base de desarrollo**: migrada hasta la 0014. El endpoint está apagado en `.env`, así que el CRM local funciona igual.

### Evidencia

- **`tests/integration/ingestion-http.test.ts`**: 13 casos en verde contra PostgreSQL 18.6 real.
- **Mutaciones (AC-2)**, con los archivos restaurados después y los 13 casos en verde otra vez:
  - sin la verificación de revocación, falla el caso 4;
  - sin la allowlist, fallan el 4 y el 5;
  - sin el contador atómico (leer y después escribir), falla el 10 (concurrencia), y también el 9, porque la mutación no borra las ventanas vencidas;
  - sin el límite de bytes, falla el 7.
- **Unitarios**: 15 nuevos (8 en `credentials.test.ts` y 7 en `read-body.test.ts`) y uno en `log.test.ts`: de 246 a 262.
- **End-to-end**: `tests/e2e/ingestion.spec.ts` pasa sus 2 casos, y `npm run test:e2e` pasa 65 de 65 (AC-3).
- **Suite local**: `npm run test` pasa 623 de 623 (AC-4).
- **Con el contenedor detenido**: pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (262) y `build`, y `db:generate` no produce migraciones.
- **Token**: no aparece en ninguna fila de `ingestion_credentials` ni en el log (casos 11 y 12).
- **Script**: probado contra la base de test. Crea, revoca, informa una revocación repetida y rechaza datos inválidos.
- **AC-6**, búsqueda en los archivos versionados y nuevos:
  - no hay URLs fuera de `localhost`, `example.com` y referencias de licencias o de la guarda;
  - `INGESTION_ENABLED` solo vale `true` en tests y en `playwright.config.ts`, con la credencial sintética;
  - no hay tokens `crm_ing_` literales;
  - `.env` no tiene variables de ingestión.
- **Revisión**: autoevaluación del mismo agente.
