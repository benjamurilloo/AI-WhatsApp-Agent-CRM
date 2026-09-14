---
schema: task-brief.v1
task_id: 3.4
task_type: implementation
generated_at: 2026-09-14
---

# Brief: 3.4 — Autorización y taxonomía de errores

## Objetivo

1. Implementar la taxonomía de errores de [Overview.md](../architecture/Overview.md) como tipo compartido.
2. Implementar en el módulo `organizations`:
   - el **contexto autenticado**: usuario, organización, rol y `must_change_password`, resuelto en cada request;
   - las **guardas de autorización**.
3. Demostrar contra PostgreSQL real los casos negativos del [Roadmap](../planning/Roadmap.md):
   - otra organización → `NOT_FOUND`;
   - `viewer` en acción de `admin` → `FORBIDDEN`;
   - `must_change_password` → solo cambio de contraseña y logout.
4. Hacer que la CI corra los tests unitarios, que hoy no ejecuta.

No incluye páginas, Server Actions ni `proxy` (3.5), ni auditoría (3.6).

## Ubicación en la Fase 3

- **Orden previsto**: 3.1, 3.2 y 3.3 (cerradas) → **3.4** → 3.6 → 3.5 → 3.7.
- **Criterios de la Fase 3 que cubre**:
  - casos negativos probados;
  - el test obligatorio de aislamiento entre organizaciones de [TestingStrategy.md](../development/TestingStrategy.md).
- **Gates de entrada**: ninguno. No hay dependencias nuevas ni migraciones.
- **Notion no está disponible en esta sesión**: el servidor MCP se desconectó. El cambio de estado de la tarea 3.4 queda pendiente y se hace cuando vuelva, con autorización.

## Hallazgos de la verificación previa (2026-09-14)

1. **Estado verificado**: `main` limpio y sincronizado en `8fe5058`, con la CI en verde (ejecución 34792323578).
2. **Contexto autenticado sin `JOIN` entre módulos** (ADR 0012, nota de la 3.3):
   - `auth.validateSession` ya devuelve `userId`, `mustChangePassword` y `expiresAt`, y rechaza usuarios inactivos;
   - la membresía y el rol están en `organization_members`, que pertenece a `organizations`;
   - `organizations` depende de `auth` ([Overview.md](../architecture/Overview.md)), así que puede componer ambas partes.
3. **No hay todavía datos de negocio por organización** (productos y clientes llegan en las Fases 4 y 5). El único recurso con `organization_id` y uso real en el MVP es `organization_members`, que consume la pantalla 10 (3.7; [Screens.md §10](../product/Screens.md#10-usuarios-y-roles): "solo `admin`").
4. **`organizations` no puede leer `users`**: el nombre y el email pertenecen a `auth`. Un recurso de `organizations` en esta subfase solo expone columnas de `organization_members`.
5. **`auth` ya usa códigos de la taxonomía** como resultados tipados (`AuthFailure`), sin un tipo compartido.
6. **Next.js 16.3**: `forbidden()` y `unauthorized()` son experimentales y requieren `experimental.authInterrupts` (`forbidden.md`, `version: experimental`). Es un dato para la 3.5.
7. **CI**: `.github/workflows/ci.yml` corre `test:guards` y `test:integration`, pero no el proyecto `unit` de Vitest, y `package.json` no tiene un script `test:unit`. Los 14 tests unitarios de la 3.3 solo pasaron en local.
8. **No existen Route Handlers mutantes ni pantallas**: hoy la única ruta es `GET /api/health`.

## Alcance incluido

1. Registrar la resolución de D-1 a D-5.
2. **Taxonomía compartida** según D-1, en `src/shared/errors/`:
   - los 8 códigos de Overview;
   - su código HTTP;
   - el tipo de resultado fallido que usan los servicios.

   `auth` pasa a tipar sus fallos con ese tipo, sin cambiar su comportamiento.
3. **`src/modules/organizations/repository.ts`**, siempre filtrado por `organization_id` cuando lee un recurso:
   - membresía por `user_id`;
   - un miembro por `id` dentro de una organización.
4. **`src/modules/organizations/service.ts`**:
   - **`getAuthContext(token)`**:
     - llama a `auth.validateSession` y busca la membresía;
     - sin sesión válida, usuario inactivo o sin membresía → `UNAUTHENTICATED`;
     - si no, devuelve `userId`, `organizationId`, `role`, `mustChangePassword` y `sessionExpiresAt`;
     - `organizationId` sale siempre de la membresía, nunca del request;
   - **`authorize(context, { role })`**, según D-4:
     - con `must_change_password` → `FORBIDDEN`;
     - con `role: "admin"` y el contexto en `viewer` → `FORBIDDEN`;
   - **`getMember(context, memberId)`** según D-3: solo `admin`; si el miembro no existe o es de otra organización → `NOT_FOUND`; un id con formato inválido → `VALIDATION_ERROR`.
5. **`src/modules/organizations/index.ts`**: interfaz pública con el servicio y sus tipos.
6. **Tests de integración** en `tests/integration/authorization.test.ts`, contra PostgreSQL real, intentando violar cada invariante:
   - **`getAuthContext` rechaza** con `UNAUTHENTICATED`:
     - token ausente, inválido o expirado;
     - usuario con sesión válida pero sin membresía;
     - usuario desactivado;
   - **contexto válido**: devuelve la organización y el rol de la membresía;
   - **cambio de rol**: rige en el request siguiente, sin revocar sesiones;
   - **quitar la membresía**: da `UNAUTHENTICATED` en el request siguiente;
   - **`viewer`** en `getMember` → `FORBIDDEN`;
   - **aislamiento**: un `admin` de la organización A que pide un miembro de la organización B por su `id` real → `NOT_FOUND`, igual que un `id` inexistente. La respuesta no distingue ambos casos;
   - **`must_change_password`**: un `admin` con el flag obtiene contexto, pero `authorize` y `getMember` dan `FORBIDDEN`;
   - **caso positivo**: un `admin` obtiene su propio miembro.
7. **Tests unitarios**:
   - la tabla de códigos cubre los 8 de Overview con su HTTP;
   - `authorize` resuelve el orden de verificación de D-4 sin base.
8. **CI**: script `test:unit` en `package.json` y paso "Tests unitarios" en `ci.yml`, antes de los de integración.
9. **Documentación**:
   - Overview: ubicación de la taxonomía y decisión de D-5;
   - RepositoryStructure: `src/shared/errors/` y los archivos de `organizations`;
   - SecurityModel: orden de verificación y `authInterrupts`;
   - TestingStrategy: el caso de aislamiento queda cubierto para `organization_members`;
   - EngineeringStandards: sección CI.

## Alcance excluido

- Páginas, Server Actions, `proxy`, redirección a login (FR-ORG-03) y paso de cambio de contraseña en la UI (3.5).
- Reescritura de la cookie tras la renovación: necesita una Server Action o un Route Handler (3.5).
- `forbidden()`, `unauthorized()` y `experimental.authInterrupts`.
- Verificación de `Origin` en Route Handlers mutantes (D-5): no existe ninguno.
- Log estructurado con `request_id` (D-5).
- Listado de miembros con filtros y paginación, nombre y email del miembro, alta, cambio de rol, desactivación y regla del último `admin` (3.7).
- Auditoría (3.6).
- Recursos de negocio de las Fases 4 a 6.
- Dependencias nuevas y migraciones.
- Cambios en Notion: no disponible en esta sesión.

## Archivos o componentes autorizados

Lista cerrada:

- `src/shared/errors/`: `index.ts` y su test unitario.
- `src/modules/organizations/`: `repository.ts`, `service.ts`, `index.ts` y sus `*.test.ts`. `schema.ts` no cambia.
- `src/modules/auth/service.ts` e `index.ts`: solo para tipar los fallos con la taxonomía compartida.
- `tests/integration/authorization.test.ts`.
- `package.json`: solo el script `test:unit`.
- `.github/workflows/ci.yml`: solo el paso de tests unitarios.
- `docs/decisions/brief-3.4-autorizacion-y-errores.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `Overview.md`, `RepositoryStructure.md`, `SecurityModel.md`, `TestingStrategy.md` y `EngineeringStandards.md`, en lo indicado en el punto 9.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [Overview.md](../architecture/Overview.md): taxonomía de errores, reglas de dependencia y "`NOT_FOUND` si el recurso pertenece a otra organización".
2. [SecurityModel.md](../architecture/SecurityModel.md) y [ADR 0012](0012-mecanismo-de-sesion.md) con su nota: autorización server-side, `organization_id` de la sesión y `must_change_password`.
3. [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md) y [DataModel.md](../architecture/DataModel.md): una membresía por usuario y columnas de `organization_members`.
4. [TestingStrategy.md](../development/TestingStrategy.md) y [Roadmap.md](../planning/Roadmap.md), Fase 3: casos negativos obligatorios.
5. [RepositoryStructure.md](../architecture/RepositoryStructure.md): forma interna de los módulos y frontera.

## Dependencias

- 3.3 cerrada (commit `8fe5058`, CI en verde).
- Docker Desktop en marcha para los tests de integración.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Forma de la taxonomía de errores

- **Opciones**:
  - (a) **Resultados tipados**. `src/shared/errors/` exporta:
    - el tipo `ErrorCode` con los 8 códigos;
    - `HTTP_STATUS` por código;
    - un tipo `Failure<C>` con `ok: false`, el código y datos opcionales (por ejemplo `retryAfterSeconds`).

    Los servicios devuelven `{ ok: true, ... } | Failure`, como ya hace `auth`. Solo los errores inesperados se lanzan como excepción, y la capa HTTP o la UI los traduce a `INTERNAL`.
  - (b) **Excepciones tipadas** (`class AppError`), capturadas en cada página, acción o handler.
  - (c) **Sin tipo compartido**: cada módulo define sus códigos.
- **Recomendación**: (a).
  - Overview exige que "un error de dominio nunca termine en `INTERNAL`". Con resultados tipados, TypeScript obliga a quien llama a manejar cada fallo, mientras que una excepción olvidada termina justamente en `INTERNAL`.
  - Es la forma que `auth` ya usa y prueba.
- **Consecuencia**: `src/shared/errors/` es la ubicación fijada de la taxonomía, y Overview y RepositoryStructure lo registran. Los módulos de las Fases 4 a 6 siguen esta convención.

### D-2 — Qué devuelve el contexto autenticado

- **Opciones**:
  - (a) **Un objeto de solo lectura** con `userId`, `organizationId`, `role`, `mustChangePassword` y `sessionExpiresAt`. Todos los servicios de negocio lo reciben como primer argumento, y los repositorios reciben `organizationId` desde él.
  - (b) **Solo `userId`**, dejando que cada servicio resuelva su membresía.
- **Recomendación**: (a). Resuelve la membresía una vez por request y hace que "el `organization_id` sale de la sesión, nunca del request" ([SecurityModel](../architecture/SecurityModel.md)) quede en la firma de cada servicio, visible en revisión. `sessionExpiresAt` le permite a la 3.5 reescribir la cookie tras la renovación.
- **Consecuencia**: los módulos de dominio importan el tipo del contexto desde `@/modules/organizations`, siguiendo la dependencia que ya declara Overview.

### D-3 — Recurso con el que se prueba el aislamiento

- **Opciones**:
  - (a) **`getMember(context, memberId)`**, solo lectura y solo `admin`, sobre `organization_members`, que la pantalla 10 consume en la 3.7. Sirve para probar a la vez `FORBIDDEN` (`viewer`) y `NOT_FOUND` (miembro de otra organización) sobre un caso de uso real.
  - (b) **Probar las guardas en abstracto**, con tests unitarios, y dejar los tests negativos de aislamiento a cada módulo de las Fases 4 a 7.
  - (c) **Mover los tests negativos a la 3.7**, junto con la gestión de usuarios.
- **Recomendación**: (a).
  - El Roadmap fija los casos negativos como criterio de esta fase, y TestingStrategy los quiere contra el motor real. Con (b), la primera prueba real llegaría en la Fase 4.
  - `getMember` no es especulativo: la 3.7 lo usa para cambiar el rol y desactivar a un miembro concreto.
- **Consecuencia**: `getMember` devuelve solo columnas de `organization_members` (`id`, `userId`, `role`, `createdAt`). El nombre y el email llegan en la 3.7 a través de la interfaz pública de `auth`.

### D-4 — Orden de verificación y `must_change_password`

- **Opciones**:
  - (a) **Una única función `authorize(context, { role })`** que todo caso de uso protegido llama primero:
    1. `mustChangePassword` → `FORBIDDEN`;
    2. rol insuficiente → `FORBIDDEN`;
    3. el repositorio busca el recurso filtrado por `context.organizationId`; si no aparece → `NOT_FOUND`.

    `changePassword` y `logout` de `auth` no pasan por `authorize`.
  - (b) **Dos guardas separadas**, una para `must_change_password` y otra para el rol, que cada caso de uso combina.
- **Recomendación**: (a).
  - Con una sola llamada es imposible exigir el rol y olvidar la restricción de contraseña.
  - Verificar el rol antes de buscar el recurso hace que un `viewer` reciba `FORBIDDEN` sin que la respuesta revele si el recurso de otra organización existe.
- **Consecuencia**: la 3.5 usa el mismo `getAuthContext` para decidir la redirección de las páginas (a login o al paso de cambio de contraseña), y las Server Actions reciben `FORBIDDEN` de los servicios.

### D-5 — Verificación de `Origin` y log con `request_id`

- **Opciones**:
  - (a) **Implementar ahora** un verificador de `Origin` en `src/shared/http/` y un log estructurado con `request_id` en `src/shared/log/`, probados de forma aislada.
  - (b) **Fijar ahora la ubicación y la regla, e implementar con su primer consumidor**:
    - el log con `request_id` va en `src/shared/log/` y se implementa en la 3.5, con la primera página y Server Action que registran errores;
    - el verificador de `Origin` va en `src/shared/http/` y se implementa con el primer Route Handler mutante.

    Mientras no exista, la revisión de cada subfase comprueba que ningún Route Handler mutante se agregue sin esa verificación.
- **Recomendación**: (b). Hoy no existe ningún request que registrar ni ningún Route Handler mutante, y [CLAUDE.md](../../CLAUDE.md) prohíbe los módulos especulativos. La ubicación y la regla quedan escritas, así que la 3.5 no las reabre.
- **Consecuencia**: Overview y RepositoryStructure registran las dos ubicaciones, y SecurityModel mantiene la regla de `Origin` como obligatoria.

## Resolución

Brief aprobado por el usuario el **2026-09-14**. D-1 a D-5 se resolvieron el mismo día, todas según la recomendación. Docker Desktop, en marcha. Notion volvió a estar disponible, pero el cambio de estado de la tarea no se autorizó explícitamente y queda para el cierre.

| Decisión | Resolución |
|---|---|
| D-1 Taxonomía | Resultados tipados; `ErrorCode`, `HTTP_STATUS` y `Failure` en `src/shared/errors/` |
| D-2 Contexto | Objeto de solo lectura con `userId`, `organizationId`, `role`, `mustChangePassword` y `sessionExpiresAt` |
| D-3 Aislamiento | `getMember(context, memberId)` sobre `organization_members`, solo `admin` |
| D-4 Orden | `authorize(context, { role })`: `must_change_password`, rol y luego recurso filtrado por organización |
| D-5 `Origin` y log | Ubicaciones fijadas (`src/shared/http/`, `src/shared/log/`); se implementan con su primer consumidor |

### Ajustes durante la ejecución

- **Contenedor detenido**: Docker Desktop estaba en marcha, pero el contenedor de PostgreSQL no. Se levantó con `docker compose up -d --wait`, sin cambios de configuración.
- **Tipo `Failure`**: el valor por defecto `{}` del segundo parámetro necesitaba un `eslint-disable-next-line`. Prettier partió la declaración en varias líneas, la directiva dejó de aplicar y lint falló. Se reemplazó por `Record<never, never>`, equivalente, sin directiva.
- **`auth` sin cambios de comportamiento**: solo cambió la declaración de `AuthFailure`. Sus 30 tests de integración y 14 unitarios pasan sin modificaciones.
- **`sessionExpiresAt` en el contexto**: `getAuthContext` lo expone para que la 3.5 reescriba la cookie tras la renovación. Esta subfase no lo usa.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- `organization_id` nunca llega de un parámetro del request: sale de la membresía.
- `organizations` no consulta `users` ni `sessions`; `auth` no importa `organizations`; `src/shared/` no importa módulos.
- Una consulta de un recurso por organización siempre filtra por `organization_id` en SQL, no en memoria después de leer.
- `NOT_FOUND` es indistinguible para un recurso inexistente y para uno de otra organización.
- El comportamiento de `auth` no cambia: sus 30 tests de integración y 14 unitarios siguen pasando sin modificaciones.
- Ninguna dependencia ni migración nueva.

## Criterios de aceptación

- **AC-1**: D-1 a D-5 tienen resolución del usuario con fecha.
- **AC-2**: `src/shared/errors/` define los 8 códigos de Overview con su HTTP, y un test unitario falla si falta alguno.
- **AC-3**: `getAuthContext` rechaza con `UNAUTHENTICATED` cada caso del punto 6 y devuelve el contexto correcto en el caso válido.
- **AC-4**: un cambio de rol y la eliminación de una membresía rigen en el request siguiente sin revocar sesiones.
- **AC-5**: un `viewer` recibe `FORBIDDEN` en `getMember`.
- **AC-6**:
  - un `admin` recibe `NOT_FOUND` al pedir un miembro de otra organización por su `id` real;
  - el resultado es idéntico al de un `id` inexistente;
  - la consulta filtra por `organization_id` en SQL.
- **AC-7**: con `must_change_password`, `authorize` y `getMember` dan `FORBIDDEN`.
- **AC-8**: `npm run test` pasa con la base levantada, incluidos los tests nuevos y los existentes sin cambios.
- **AC-9**: la regla de frontera sigue en verde, y `organizations` solo importa `@/modules/auth` (interfaz pública) y `@/shared/*`.
- **AC-10**: con el contenedor detenido, `typecheck`, `lint`, `test:guards`, `test:unit` y `build` pasan.
- **AC-11**: CI en verde en el commit de la subfase, con el paso "Tests unitarios" ejecutado, verificado con `gh run view`.
- **AC-12**: `git status` muestra solo archivos autorizados; los documentos del punto 9 reflejan las resoluciones y los enlaces internos resuelven.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`** contra PostgreSQL 18.6 real en Docker: salidas de `npm run test`, `typecheck`, `lint`, `test:guards`, `test:unit` y `build` con la base detenida.
- **Evidencia de CI**: ejecución en verde con el paso de tests unitarios.

**Nivel resultante esperado: validado localmente y en CI** para el contexto autenticado, las guardas, el aislamiento sobre `organization_members` y la taxonomía. No se valida redirección ni ninguna respuesta HTTP, porque no hay páginas ni Server Actions (3.5).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si un caso de uso obliga a que `organizations` consulte `users` o `sessions`, o a que `auth` importe `organizations`.
- Si tipar `auth` con la taxonomía compartida cambia el comportamiento de alguno de sus tests.
- Si hace falta una dependencia, una migración, o un archivo o carpeta fuera de la lista autorizada.
- Si la CI no ejecuta el paso de tests unitarios o los tests unitarios fallan en Linux.
- Antes de commit, push o cambios en Notion.
