---
schema: task-brief.v1
task_id: 3.1
task_type: implementation
generated_at: 2026-09-13
---

# Brief: 3.1 — Migraciones de identidad

## Objetivo

Crear con Drizzle las tablas `organizations`, `users` y `organization_members` según [DataModel.md](../architecture/DataModel.md), generar y aplicar la primera migración versionada en `drizzle/`, y probar contra PostgreSQL real sus unicidades, el enum de rol, las claves foráneas y los valores por defecto.

La subfase también resuelve el pendiente que dejó la 2.4 ([brief-2.4](brief-2.4-base-de-datos-local.md), D-2): una **base de test separada, con aislamiento entre tests**, porque estos son los primeros tests que escriben datos.

No crea servicios, repositorios, sesiones, hashing de contraseñas, seeds ni pantallas.

## Ubicación en la Fase 3

- **Orden previsto**: **3.1** → 3.2 (ADR de sesión) → 3.3 (autenticación) → 3.4 (autorización y errores) → 3.6 (auditoría, junto a la 3.2–3.4 según el [Roadmap](../planning/Roadmap.md)) → 3.5 (pantalla de login) → 3.7 (gestión de usuarios).
- **Qué es necesario ahora**: el esquema de identidad y la infraestructura de migraciones y de tests con escritura, porque todas las subfases siguientes dependen de ellos.
- **Qué no es de esta subfase**: `audit_logs` (3.6), la regla del último `admin` (3.7, es regla de negocio y no constraint), `must_change_password` como bloqueo de rutas (3.3/3.4).
- **Gates de entrada**, que se piden por separado de la aprobación del brief:
  1. autorización explícita para **aplicar migraciones contra la base local de Docker** (la de desarrollo y la de test), según `CLAUDE.md`;
  2. Docker Desktop en marcha.
- No se instalan dependencias: todo lo necesario ya está en `package.json` (`drizzle-orm` 0.45.2, `drizzle-kit` 0.31.10, `pg` 8.23).

## Hallazgos de la verificación previa (2026-09-13)

1. **Drizzle 1.0 no es estable** (registro npm): `drizzle-orm` `latest` = 0.45.2 y `drizzle-kit` `latest` = 0.31.10; la línea 1.0 está en `1.0.0-rc.5`. Según el [ADR 0004](0004-stack-tecnologico-propuesto.md), se sigue con 0.45 y la primera migración se genera en el formato de `drizzle-kit` 0.31. Pasar a 1.0 más adelante requerirá `drizzle-kit up`.
2. **Aviso de `allowScripts` en CI** (ejecución 34784501406, npm 11.12.1 también en local): `esbuild@0.18.20`, `0.25.12` y `0.28.2` tienen `postinstall` no cubierto. El binario de esbuild llega por la dependencia opcional de plataforma (`@esbuild/*`), así que es **probable, no verificado**, que `drizzle-kit` funcione igual. Se verifica en esta subfase si D-4 pone `drizzle-kit` en CI.
3. **Propiedad de las tablas** según [Overview.md](../architecture/Overview.md): `auth` posee "login, sesión, hash de contraseña" y `organizations` posee "organización, membresías, roles", con dependencia `organizations → auth`. Por lo tanto `users` vive en `src/modules/auth/schema.ts`, y `organizations` y `organization_members` en `src/modules/organizations/schema.ts`, que importa `@/modules/auth/schema` para la clave foránea (excepción ya prevista en [RepositoryStructure.md](../architecture/RepositoryStructure.md)). No es una decisión nueva: se deriva de las fuentes.
4. **`ON DELETE`**: la regla 5 de DataModel fija `RESTRICT` por defecto y nombra `organization_members` como ejemplo de `CASCADE`. Ninguna pantalla borra usuarios ni organizaciones (regla 8), así que la cascada no se ejercita en el MVP. Se aplica tal cual.
5. **`UNIQUE(email)` sobre `text` distingue mayúsculas**: `Ana@x.com` y `ana@x.com` serían dos cuentas. DataModel dice `text not null unique` sin precisarlo. Se resuelve en D-5.
6. **PostgreSQL 18 trae `uuidv7()` nativo**, además de `gen_random_uuid()` (v4). DataModel nombra solo el segundo. Se resuelve en D-6.
7. **La base de CI (`crm_ci`) la crea el servicio del runner** con un superusuario, que puede crear bases adicionales. Lo mismo vale para el contenedor local.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. `src/modules/auth/schema.ts`: tabla `users` con las columnas de DataModel, la unicidad de email según D-5, los defaults (`must_change_password false`, `is_active true`, `created_at`/`updated_at` con `now()`) y el mantenimiento de `updated_at` según D-3.
3. `src/modules/organizations/schema.ts`:
   - `organizations` con `timezone` por defecto `'America/Argentina/Buenos_Aires'`;
   - el tipo de rol según D-2, con valores `admin` y `viewer`;
   - `organization_members` con claves foráneas `ON DELETE CASCADE` hacia `organizations` y `users`, `UNIQUE(user_id)` ([ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md)) e índice `(organization_id)`.
4. Generar la primera migración con `drizzle-kit generate` en `drizzle/` y versionarla, **revisando el SQL generado** contra DataModel antes de aplicarlo.
5. Scripts en `package.json`: `db:generate` (`drizzle-kit generate`) y `db:migrate` (`drizzle-kit migrate`), para aplicar migraciones de forma explícita en la base local de desarrollo.
6. Base de test y aislamiento según D-1, en `vitest.config.mts` y un `globalSetup` en `tests/integration/`.
7. `tests/integration/identity-schema.test.ts`, con SQL directo contra la base de test (sin importar `schema.ts`, que la regla de frontera reserva a otros esquemas). Cada invariante se prueba intentando violarlo:
   - las tres tablas existen después de aplicar las migraciones;
   - un segundo usuario con el mismo email se rechaza, también con otra combinación de mayúsculas (según D-5);
   - una segunda membresía del mismo usuario se rechaza (`UNIQUE(user_id)`);
   - un rol fuera de `admin`/`viewer` se rechaza;
   - una membresía hacia una organización o un usuario inexistentes se rechaza (FK);
   - los defaults de `timezone`, `must_change_password`, `is_active`, `id`, `created_at` y `updated_at` se aplican;
   - las columnas `not null` rechazan `NULL`;
   - aplicar las migraciones una segunda vez no hace nada.
8. Test de aislamiento: los datos que escribe un test no están visibles en el siguiente, y la suite no escribe en la base de `DATABASE_URL` de desarrollo.
9. El test de conectividad de la 2.4 sigue pasando sin cambios de comportamiento (puede pasar a correr contra la base de test).
10. CI según D-4.
11. `.prettierignore`: excluir `drizzle/`, que es generado.
12. Documentación:
    - [DataModel.md](../architecture/DataModel.md): estado "implementado para identidad", y lo resuelto en D-2, D-5 y D-6;
    - [Environments.md](../development/Environments.md): base de test y comandos `db:*`;
    - [RepositoryStructure.md](../architecture/RepositoryStructure.md): archivos creados por la 3.1 y ubicación del `globalSetup`;
    - [EngineeringStandards.md](../development/EngineeringStandards.md): Drizzle 1.0 sigue en rc al 2026-09-13, y cómo se aplican las migraciones (D-1);
    - [TestingStrategy.md](../development/TestingStrategy.md): mecanismo de aislamiento de los tests de integración.

## Alcance excluido

- `audit_logs` y el módulo `audit` (3.6). Cualquier tabla de dominio fuera de las tres.
- `index.ts`, `service.ts`, `repository.ts` y `types.ts` de `auth` y `organizations`: nacen con la subfase que los usa (3.3, 3.4, 3.7).
- Hash de contraseñas, argon2 y cualquier dependencia nueva (3.3).
- Tabla o almacenamiento de sesiones (ADR de la 3.2).
- `seeds/`: el seed básico necesita contraseñas hasheadas, así que nace en la 3.3 o después.
- Regla del último `admin` y `BUSINESS_RULE_VIOLATION` (3.7). Taxonomía de errores y log con `request_id` (3.4).
- `CHECK` que DataModel no pide (formato de email, nombre no vacío, validez de la zona IANA): son validación de aplicación y no se inventan acá.
- Roles de base de datos y permisos `GRANT`/`REVOKE` (los necesita la 3.6 para `audit_logs`).
- Drizzle 1.0, `drizzle-kit up` y `drizzle-kit push`.
- Migraciones aplicadas automáticamente al arrancar la aplicación.
- `npm audit fix`.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/auth/schema.ts` y `src/modules/organizations/schema.ts`.
- `drizzle/`, con la migración generada y su carpeta `meta/`.
- `package.json`, solo los scripts `db:generate` y `db:migrate`. `package-lock.json` no debe cambiar.
- `drizzle.config.ts`, solo si la generación lo exige.
- `vitest.config.mts`, para la base de test, el `globalSetup` y la ejecución secuencial de integración.
- `tests/integration/`: `global-setup.ts`, un helper de limpieza si D-1 lo requiere, `identity-schema.test.ts` y el ajuste mínimo de `db-connectivity.test.ts` si cambia de base.
- `.env.example`, solo si D-1 necesita una variable nueva, sin secretos.
- `.github/workflows/ci.yml`, según D-4.
- `.prettierignore`.
- `docs/decisions/brief-3.1-migraciones-de-identidad.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `DataModel.md`, `Environments.md`, `RepositoryStructure.md`, `EngineeringStandards.md` y `TestingStrategy.md`, en lo indicado en el punto 12.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.
- Fuera del repositorio: la base local de desarrollo y la base de test en el contenedor existente.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md) y [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md): columnas, constraints, índices y reglas de diseño.
2. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): módulo dueño de cada tabla, regla de frontera y ubicación de archivos.
3. [TestingStrategy.md](../development/TestingStrategy.md): tests contra PostgreSQL real, sin mocks, forzando la violación de cada invariante.
4. [Environments.md](../development/Environments.md): migraciones explícitas y una base por entorno.
5. Registro npm y [documentación de Drizzle](https://orm.drizzle.team/docs/migrations) al momento de implementar.

## Dependencias

- Fase 2 cerrada (commit `239e4ac`, CI en verde en la ejecución 34784501406).
- Docker Desktop en marcha y la base local levantada.
- Autorización del gate 1.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Base de test y aislamiento entre tests

- **Opciones**:
  - (a) **Base `<POSTGRES_DB>_test` en el mismo contenedor, migrada desde cero en cada ejecución, con `TRUNCATE` antes de cada test y archivos de integración en serie.** Un `globalSetup` se conecta con la URL de `DATABASE_URL`, borra y recrea la base de test, y le aplica las migraciones con el migrador programático de `drizzle-orm` (`drizzle-orm/node-postgres/migrator`). El proyecto de integración de Vitest recibe la URL derivada. Un helper trunca las tablas de dominio antes de cada test.
  - (b) **La misma base de test, pero cada test envuelto en una transacción que se revierte.** Más rápido, pero no sirve para lo que viene: la 3.6 prueba que la auditoría es atómica con el cambio y la Fase 4 prueba ajustes concurrentes, y ambas necesitan transacciones reales y varias conexiones.
  - (c) **La base de desarrollo, con truncado.** Borra los datos locales del desarrollador en cada `npm run test` y contradice "cada entorno tiene su propia base" de `Environments.md`.
- **Recomendación**: (a).
  - Recrear la base en cada ejecución prueba además que las migraciones se aplican desde cero, igual que en un entorno nuevo.
  - El migrador programático no usa `esbuild`, así que los tests no dependen del aviso de `allowScripts`.
  - En serie es suficiente para el volumen del MVP. Si la suite se vuelve lenta, se mide antes de paralelizar.
- **Consecuencia**: la base de test se deriva de `DATABASE_URL`, sin variable nueva ni cambios en Docker Compose. En CI se crea `crm_ci_test` junto a `crm_ci`. `db:migrate` queda solo para la base de desarrollo.

### D-2 — Tipo del rol

- **Opciones**:
  - (a) **Tipo `ENUM` de PostgreSQL** (`pgEnum` de Drizzle, p. ej. `member_role`);
  - (b) **`text` con `CHECK (role in ('admin','viewer'))`**.
- **Recomendación**: (a). Drizzle deriva el tipo TypeScript del enum, la regla 4 de DataModel lo admite, y agregar un rol más adelante es un `ALTER TYPE ... ADD VALUE` aditivo. Quitar un valor es costoso, pero el MVP no lo prevé.
- **Consecuencia**: fija la convención para los enums de las fases siguientes (`audit_logs`, inventario, conversaciones), salvo que alguna justifique lo contrario.

### D-3 — Mantenimiento de `updated_at`

- **Opciones**:
  - (a) **En la aplicación**: `defaultNow()` más `$onUpdate(() => new Date())` de Drizzle;
  - (b) **Trigger de base de datos** por tabla.
- **Recomendación**: (a). Todo cambio pasa por los repositorios de los módulos; un trigger suma SQL escrito a mano en cada migración de cada tabla futura.
- **Consecuencia**: un `UPDATE` escrito en SQL crudo no actualiza `updated_at`. Queda documentado como limitación en DataModel.

### D-4 — Migraciones en CI

- **Opciones**:
  - (a) **Solo el migrador programático de los tests** (D-1): CI aplica las migraciones desde cero, sin ejecutar `drizzle-kit`;
  - (b) **(a) más un paso que detecta desfase entre `schema.ts` y `drizzle/`**: correr `drizzle-kit generate` y fallar si `git status --porcelain drizzle/` muestra cambios.
- **Recomendación**: (b). Olvidarse de generar la migración después de cambiar un esquema es el error más probable con Drizzle, y hoy nada lo detectaría. Siguiendo la práctica de la 2.5, el paso se prueba forzando un desfase local antes de darlo por válido.
- **Consecuencia**: `drizzle-kit` corre en CI, así que se verifica el aviso de `allowScripts`. Si falla por eso, se aplica la condición de detención y se decide aparte cómo aprobar los scripts.

### D-5 — Unicidad del email

- **Opciones**:
  - (a) **Índice único sobre `lower(email)`**, sin extensiones;
  - (b) **Extensión `citext`** y columna `citext unique`;
  - (c) **`text unique` tal cual**, normalizando en la aplicación (3.3 y 3.7).
- **Recomendación**: (a). La base garantiza la regla aunque un camino futuro olvide normalizar (regla 7 de DataModel: la unicidad vive en la base), sin sumar una extensión que cada entorno gestionado debe habilitar.
- **Consecuencia**: DataModel pasa de `unique` a "único sin distinguir mayúsculas". El login de la 3.3 busca por `lower(email)` para usar el índice.

### D-6 — Generación de UUID

- **Opciones**:
  - (a) **`gen_random_uuid()`** (v4) como default de base, como nombra DataModel;
  - (b) **`uuidv7()`** nativo de PostgreSQL 18, ordenado por tiempo.
- **Recomendación**: (a). Coincide con DataModel, no expone la fecha de creación en IDs que aparecerán en URLs y, con el volumen del MVP, la localidad de índice de v7 no se nota.
- **Consecuencia**: ninguna migración futura necesita cambiar; si una tabla de alto volumen (`messages`) lo justifica con medición, puede usar v7 por su cuenta.

## Resolución

Brief aprobado por el usuario el **2026-09-13**. D-1 a D-6 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó explícitamente aplicar migraciones contra la base local de Docker (desarrollo y test), con Docker Desktop en marcha.

| Decisión | Resolución |
|---|---|
| D-1 Base de test | `<POSTGRES_DB>_test` en el mismo contenedor, recreada y migrada con el migrador programático en cada ejecución, `TRUNCATE` antes de cada test y archivos de integración en serie |
| D-2 Tipo del rol | `ENUM` de PostgreSQL (`pgEnum`) |
| D-3 `updated_at` | En la aplicación: `defaultNow()` más `$onUpdate` |
| D-4 Migraciones en CI | Migrador programático de los tests, más un paso que detecta desfase entre `schema.ts` y `drizzle/` |
| D-5 Email | Índice único sobre `lower(email)` |
| D-6 UUID | `gen_random_uuid()` |

### Ajustes durante la ejecución

- **Timestamps como texto**: con `db.execute` crudo, `drizzle-orm` devuelve `timestamptz` como string, no como `Date`. Los dos tests de defaults fallaron por esa suposición, no por el esquema. Se corrigieron comparando en SQL `created_at = now() and updated_at = now()` dentro del mismo `INSERT`.
- **Detección de desfase probada sin tocar `drizzle/`**: `drizzle-kit generate` se corrió contra una copia de `drizzle/` en el scratchpad de la sesión. Sin cambios de esquema respondió "No schema changes"; con una columna `drift_probe` agregada temporalmente a `users` generó `ALTER TABLE "users" ADD COLUMN "drift_probe" text;`. La columna se revirtió. El paso exacto de CI (`git status --porcelain drizzle/`) solo puede verse en verde después del commit.
- **`drizzle-kit` y `allowScripts`**: `generate` y `migrate` funcionaron en local con npm 11.12.1 y el mismo aviso. En CI queda por verificar en la ejecución del commit.
- **Aviso de Vite** al cargar `vitest.config.mts`: el futuro `configLoader: 'native'` no admitirá el import sin extensión de `test-database.ts`. Hoy es solo un aviso y no afecta a ningún resultado.
- **`src/app/page.tsx` en `format:check` local**: la copia de trabajo tiene CRLF (Git en Windows) y el índice LF. Es previo a la 3.1, no está en su diff, y en CI (Linux, LF) el formato pasó. No se tocó.
- **Migración de desarrollo**: `db:migrate` corrió dos veces sobre `crm_dev`, con 1 migración registrada. Las tres tablas tenían 0 filas antes y después de la suite.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- Solo existen las tablas `organizations`, `users` y `organization_members`, más la tabla de control de migraciones de Drizzle.
- Las migraciones son SQL versionado en `drizzle/` y se aplican de forma explícita: nunca al importar módulos ni al arrancar la aplicación.
- `npm run test` no escribe en la base de `DATABASE_URL` de desarrollo.
- Ninguna dependencia nueva: `package-lock.json` no cambia.
- La regla de frontera sigue en verde: `organizations/schema.ts` importa solo `@/modules/auth/schema`, y `auth` no importa `organizations`.
- `next build` sigue sin requerir la base.
- Ningún secreto real en archivos versionados.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: `drizzle/` contiene una única migración inicial generada por `drizzle-kit generate`, cuyo SQL crea exactamente las tres tablas con las columnas, tipos, defaults, `ON DELETE`, unicidades e índices de DataModel y de D-2, D-5 y D-6. La revisión contrasta el SQL, no solo el TypeScript.
- **AC-3**: `npm run db:migrate` aplica la migración en la base local de desarrollo, y una segunda ejecución no hace nada.
- **AC-4**: `npm run test` pasa con la base levantada e incluye cada caso del punto 7. Cada invariante tiene un test que intenta violarlo y comprueba el rechazo por el código de error de PostgreSQL (`23505` unicidad, `23503` FK, `23502` not null, `22P02` o `23514` para el rol), no solo que "falle".
- **AC-5**: aislamiento según D-1, probado: un test no ve los datos de otro, y después de `npm run test` la base de desarrollo no tiene filas nuevas (conteo antes y después).
- **AC-6**: la base de test se crea y se migra desde cero en cada ejecución, tanto en local como en CI.
- **AC-7**: el test de conectividad de la 2.4 sigue pasando.
- **AC-8**: con el contenedor detenido, `npm run typecheck`, `lint`, `format:check`, `test:guards` y `build` pasan.
- **AC-9**: CI según D-4 queda en verde en el commit de la subfase, verificado con `gh run view`. Si D-4 es (b), un desfase forzado localmente hace fallar el paso de detección.
- **AC-10**: `git status` muestra solo archivos autorizados y `package-lock.json` no cambió.
- **AC-11**: los cinco documentos del punto 12 reflejan las resoluciones y los enlaces internos siguen resolviendo.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**, contra PostgreSQL 18.6 real en Docker: SQL de la migración, salidas de `db:migrate` (dos veces), `npm run test`, `typecheck`, `lint`, `format:check`, `test:guards` y `build` con la base detenida, y los conteos de la base de desarrollo antes y después de la suite.
- **Evidencia de CI**: ejecución en verde del commit de la subfase y, si D-4 es (b), la salida del caso de desfase forzado.

**Nivel resultante esperado: validado localmente y en CI**, solo para el esquema de identidad y el aislamiento de los tests. No se valida autenticación, autorización, sesiones ni reglas de negocio, que no existen todavía.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- **Antes de aplicar cualquier migración**, si no hay autorización explícita del gate 1, o si Docker Desktop no responde.
- Si el SQL generado difiere de DataModel en algo que D-1 a D-6 no resuelven: se reporta en vez de ajustarlo a mano.
- Si `drizzle-kit generate` o `migrate` fallan por el aviso de `allowScripts` o por incompatibilidad con PostgreSQL 18: se reporta con la salida, sin cambiar de versión de Drizzle.
- Si hace falta una dependencia, archivo o carpeta fuera de la lista autorizada.
- Si el aislamiento de D-1 no puede garantizar que la suite no escribe en la base de desarrollo.
- Antes de commit, push o cambios de estado en Notion.
