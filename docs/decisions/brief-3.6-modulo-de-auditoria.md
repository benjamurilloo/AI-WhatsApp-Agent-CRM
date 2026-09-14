---
schema: task-brief.v1
task_id: 3.6
task_type: implementation
generated_at: 2026-09-14
---

# Brief: 3.6 — Módulo de auditoría

## Objetivo

1. Crear `audit_logs` según [DataModel.md](../architecture/DataModel.md), con su migración.
2. Hacer que la tabla sea de solo inserción por **permisos de base de datos**, como pide la tarea de Notion ("UPDATE y DELETE rechazados por permisos").
3. Implementar el módulo `audit` con una función que registra un cambio **dentro de la transacción del cambio** y no puede usarse fuera de ella.
4. Demostrar contra PostgreSQL real:
   - la atomicidad con el cambio auditado, criterio de la Fase 3 en el [Roadmap](../planning/Roadmap.md);
   - el rechazo de `UPDATE` y `DELETE`.

No incluye productores reales de auditoría: el primero es la gestión de miembros (3.7). Tampoco incluye la consulta del historial (pantallas 4 y 7, Fases 4 y 5).

## Ubicación en la Fase 3

- **Orden previsto**: 3.1 a 3.4 (cerradas) → **3.6** → 3.5 → 3.7.
- **Criterios de la Fase 3 que cubre**: "la auditoría es atómica con el cambio que registra" y la base de FR-AUD-01.
- **Gates de entrada**, que se piden por separado de la aprobación del brief:
  1. autorización explícita para aplicar las migraciones nuevas contra la base local de Docker (desarrollo y test);
  2. Docker Desktop con el contenedor en marcha (verificado el 2026-09-14).

  No hay dependencias nuevas.

## Hallazgos de la verificación previa (2026-09-14)

1. **Estado**:
   - `main` en `882bccc`, con la CI en verde (ejecución 34852370341);
   - un único cambio sin commit: `docs/development/ExecutionProtocol.md`, autorizado por el usuario en el turno anterior para el Knowledge Capture.
2. **Notion**: la tarea 3.6 dice "audit_logs insert-only, escrito en la misma transacción del cambio; UPDATE y DELETE rechazados por permisos".
3. **El rol con el que se conecta todo es superusuario.**
   - En local, `crm` tiene `rolsuper = true` y `rolcreaterole = true` (consultado en `pg_roles` el 2026-09-14). En CI se crea igual, con `POSTGRES_USER` de la imagen oficial.
   - PostgreSQL no verifica permisos para un superusuario, y el dueño de una tabla tiene todos los privilegios sobre ella. **Un `REVOKE` sobre ese rol no restringe nada.**
   - Hoy no existe ningún rol restringido. La aplicación, las migraciones y los tests usan el mismo.
4. **Los roles son objetos del servidor, no de la base.** `crm_dev` y `crm_dev_test` comparten los roles, y la migración que cree uno corre en ambas. Tiene que ser idempotente.
5. **Drizzle no expresa `GRANT` ni triggers en `schema.ts`.** `drizzle-kit` 0.31.10 ofrece `generate --custom`, que crea una migración vacía para SQL propio (verificado con `--help`). Que el paso de desfase de la CI siga limpio después de una migración a medida se comprueba al implementar.
6. **No hay productor de auditoría en esta subfase.** Los cambios que FR-AUD-01 manda auditar llegan así:
   - miembros: 3.7;
   - productos y stock: Fase 4;
   - clientes: Fase 5;
   - estado de conversaciones: Fase 6.

   Por eso la atomicidad se prueba con una escritura real sobre `organization_members` hecha desde el test, dentro de la misma transacción.
7. **Auditar login, logout o cambio de contraseña** figuraba en el `HANDOFF.md` como `inferido`. No está en FR-AUD-01 ni en el enum `entity_type` de DataModel, y `actor_user_id` es obligatorio. Queda fuera.
8. **Contradicción entre RepositoryStructure y DataModel.**
   - [RepositoryStructure.md](../architecture/RepositoryStructure.md): una clave foránea hacia otro módulo importa su `schema.ts` "siguiendo una dependencia ya declarada en Overview".
   - [Overview.md](../architecture/Overview.md): `audit` no declara dependencias, solo quién lo usa.
   - DataModel: `audit_logs.organization_id` → `organizations` y `actor_user_id` → `users`, y la regla 5 exige claves foráneas reales.

   Se resuelve en D-5.
9. **SecurityModel está desactualizado.** Su sección de auditoría cubre solo productos, clientes y stock. FR-AUD-01 suma el estado de las conversaciones y los cambios de rol o de estado de los miembros.
10. **Drizzle exporta `NodePgTransaction`.** Permite exigir por tipo que la auditoría reciba una transacción y no la conexión general.
11. **`TRUNCATE` no dispara triggers de fila.** `resetDatabase` vacía las tablas con `TRUNCATE` desde el rol dueño, así que un trigger `BEFORE UPDATE OR DELETE` no lo bloquea.

## Alcance incluido

1. Registrar la resolución de D-1 a D-5 y escribir el **ADR 0013** con la estrategia de rol de aplicación y tablas de solo inserción (D-2).
2. **`src/modules/audit/schema.ts`**, con `audit_logs` según DataModel y D-1:
   - `id` uuid con `gen_random_uuid()` y `created_at` con `now()`;
   - `organization_id` → `organizations` y `actor_user_id` → `users`, ambas con `ON DELETE RESTRICT`, según D-5;
   - enums `audit_entity_type` y `audit_action`, `entity_id` uuid y `diff` jsonb, todos `NOT NULL`;
   - índice `(organization_id, entity_type, entity_id, created_at desc)`.
3. **Migración generada** (`drizzle/0002_*`) desde el esquema, revisada como SQL.
4. **Migración a medida** (`drizzle/0003_*`, con `generate --custom`), según D-2:
   - crea el rol `crm_app` `NOLOGIN` solo si no existe;
   - `USAGE` sobre el esquema `public`;
   - `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre las tablas existentes (`users`, `organizations`, `organization_members`, `sessions`, `login_attempts`);
   - solo `SELECT` e `INSERT` sobre `audit_logs`;
   - un trigger `BEFORE UPDATE OR DELETE` sobre `audit_logs` que rechaza la operación para cualquier rol, con un código distinto de `42501` para distinguir qué defensa actuó.
5. **`src/modules/audit/repository.ts`**: inserción en `audit_logs` con la transacción recibida.
6. **`src/modules/audit/service.ts`**, según D-3 y D-4:
   - **`recordAudit(tx, entry)`**, donde `tx` es una transacción de Drizzle y no la conexión general; lo exige el tipo;
   - `entry` lleva `organizationId`, `actorUserId`, `entityType`, `entityId`, `action` y `diff`;
   - la entrada se valida con `zod` antes de insertar: enums, uuids, forma del `diff`, `diff` no vacío en `update` y claves prohibidas;
   - una entrada inválida es un error de programación: se lanza y aborta la transacción.
7. **`src/modules/audit/index.ts`**: `recordAudit` y los tipos de la entrada.
8. **`src/shared/db/`**: exportar el tipo de transacción (`DbTransaction`).
9. **Tests de integración** en `tests/integration/audit.test.ts`, contra PostgreSQL real, intentando violar cada invariante:
   - **esquema**: `NOT NULL`, defaults, un valor fuera de enum da `22P02` y un `organization_id` o `actor_user_id` inexistente da `23503`;
   - **permisos**: con `SET ROLE crm_app`, `INSERT` y `SELECT` sobre `audit_logs` funcionan, y `UPDATE` y `DELETE` fallan con `42501`;
   - **trigger**: con el rol dueño, `UPDATE` y `DELETE` fallan con el código del trigger y la fila no cambia;
   - **cobertura de permisos**: toda tabla de `public` tiene los privilegios esperados para `crm_app`. Se prueba también que la verificación falla ante una tabla sin privilegios, creada y borrada dentro del test;
   - **atomicidad**:
     - cambio de rol en `organization_members` más `recordAudit` en la misma transacción, confirmada → persisten ambos;
     - la transacción aborta después de registrar → no persiste ninguno;
     - la inserción de auditoría falla por clave foránea → el cambio de rol se revierte;
   - **validación**: cada entrada inválida lanza y no inserta nada;
   - **tipo**: pasar la conexión general en lugar de una transacción no compila (`@ts-expect-error` en el test).
10. **Tests unitarios** de la validación de la entrada, sin base.
11. **`tests/integration/identity-schema.test.ts`**: solo la lista de tablas esperadas, que suma `audit_logs`.
12. **Documentación**:
    - **DataModel**: `audit_logs` implementada, convención del rol `crm_app` y de las tablas de solo inserción, y regla 10 generalizada;
    - **Overview**: dependencia de `audit` según D-5;
    - **SecurityModel**: sección de auditoría alineada con FR-AUD-01, mecanismo de D-2 y su limitación;
    - **TestingStrategy**: casos obligatorios de `audit_logs` (permisos, trigger, atomicidad, cobertura de permisos);
    - **Environments**: rol `crm_app`, compartido por las bases del servidor, y conexión de la aplicación;
    - **RepositoryStructure**: fila de la 3.6.

## Alcance excluido

- Productores de auditoría: miembros (3.7), productos y stock (Fase 4), clientes (Fase 5), conversaciones (Fase 6).
- Consulta del historial de una entidad (FR-AUD-02) y su paginación: no tiene consumidor hasta las pantallas 4 y 7.
- Auditoría de login, logout o cambio de contraseña (hallazgo 7).
- Rol con login y cambio de la conexión de la aplicación a `crm_app`: necesita credenciales nuevas y va con el aprovisionamiento de entornos y secretos (Fases 8 y 9, subfase 9.1), según D-2.
- Row Level Security.
- Protección contra `TRUNCATE` del dueño y contra que un superusuario desactive el trigger.
- Retención o archivado de `audit_logs`.
- Log con `request_id`, páginas y Server Actions (3.5).
- Cambios en `package.json`, `ci.yml`, `.env.example` o `docker-compose.yml`, y dependencias nuevas.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/audit/`: `schema.ts`, `repository.ts`, `service.ts`, `index.ts` y sus `*.test.ts`.
- `src/shared/db/client.ts` e `index.ts`: solo el tipo de transacción.
- `drizzle/0002_*.sql`, `drizzle/0003_*.sql` y `drizzle/meta/`.
- `tests/integration/audit.test.ts`; `tests/integration/identity-schema.test.ts`, solo la lista de tablas.
- `docs/decisions/0013-*.md`, este brief y sus filas en `docs/decisions/README.md`.
- `DataModel.md`, `Overview.md`, `SecurityModel.md`, `TestingStrategy.md`, `Environments.md` y `RepositoryStructure.md`, en lo indicado en el punto 12.
- `docs/development/ExecutionProtocol.md`: el cambio ya hecho en el turno anterior, sin tocarlo más.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md): columnas de `audit_logs`, reglas 5, 8, 9 y 10.
2. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-AUD-01 y FR-AUD-02.
3. [Overview.md](../architecture/Overview.md): tabla de módulos, reglas de dependencia y atomicidad de todo caso de uso que escribe en más de una tabla.
4. [RepositoryStructure.md](../architecture/RepositoryStructure.md): forma interna de los módulos y claves foráneas entre módulos.
5. [TestingStrategy.md](../development/TestingStrategy.md) y [Roadmap.md](../planning/Roadmap.md), Fase 3.
6. Tarea 3.6 en Notion.

## Dependencias

- 3.4 cerrada (commit `882bccc`, CI en verde).
- Contenedor de PostgreSQL en marcha para los tests de integración.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Valores de los enums de `audit_logs`

- **Opciones**:
  - (a) **Los de DataModel completos**:
    - `entity_type`: `product`, `client`, `inventory`, `conversation`, `organization_member`;
    - `action`: `create`, `update`, `deactivate`, `reactivate`, `stock_adjustment`, `status_change`, `role_change`.
  - (b) **Solo los que usa la 3.7** (`organization_member` con `create`, `role_change`, `deactivate` y `reactivate`). El resto se agrega con `ALTER TYPE ... ADD VALUE` en cada fase.
- **Recomendación**: (a).
  - Todos los valores tienen productor dentro del MVP según FR-AUD-01, así que cumplen la convención de la 1.2 (D-11): solo tipos con productor en el MVP.
  - El contrato queda idéntico a DataModel.
  - Evita que las Fases 4 a 6 modifiquen el esquema de `audit` para poder usarlo.
- **Consecuencia**: ninguna sobre otros documentos.

### D-2 — Cómo se garantiza la solo inserción

- **Opciones**:
  - (a) **Rol `crm_app` `NOLOGIN` con `GRANT` explícitos**, creado por migración, y test con `SET ROLE`. La aplicación sigue conectándose con el rol dueño hasta el aprovisionamiento de entornos. Mientras tanto, en desarrollo y CI la protección no actúa sobre la aplicación.
  - (b) **(a) más un trigger `BEFORE UPDATE OR DELETE`** que rechaza la operación para cualquier rol. Protege desde hoy en todos los entornos, sin credenciales nuevas. Los permisos quedan listos para cuando la aplicación se conecte con `crm_app`.
  - (c) **(a) más cambiar ya la conexión de la aplicación y de los tests** a un rol con login miembro de `crm_app`. Suma una contraseña nueva, un script de inicialización del contenedor, cambios en CI y una segunda URL de conexión.
- **Recomendación**: (b).
  - Con (a) sola, en desarrollo y CI un `UPDATE` sobre `audit_logs` desde la aplicación funcionaría: la garantía existiría solo en el diseño hasta la Fase 8.
  - (c) adelanta el manejo de secretos y el aprovisionamiento, que pertenecen a la 9.1.
  - Row Level Security se descarta: sin política de `UPDATE` o `DELETE`, la operación afecta cero filas **sin error**, y el dueño la saltea salvo `FORCE`.
- **Consecuencias**:
  - **ADR 0013**: toda tabla nueva otorga a `crm_app` sus privilegios en su migración, y las de solo inserción (`audit_logs`, y `inventory_movements` en la Fase 4) llevan solo `SELECT` e `INSERT` más el trigger. El test de cobertura de permisos hace que olvidarlo falle.
  - **Limitación registrada**:
    - hasta que la aplicación se conecte con `crm_app`, la defensa efectiva es el trigger;
    - el dueño puede hacer `TRUNCATE`, y un superusuario puede desactivar el trigger;
    - crear el rol exige `CREATEROLE` al usuario de migraciones, algo a verificar en un servicio gestionado (Fases 8 y 9).

### D-3 — Forma de registrar dentro de la transacción

- **Opciones**:
  - (a) **`recordAudit(tx, entry)`**: quien hace el cambio abre la transacción y le pasa `tx` a `audit`. El tipo acepta solo una transacción.
  - (b) **`withAudit(db, fn, entry)`**: `audit` abre la transacción, ejecuta el cambio y después inserta.
  - (c) **Triggers genéricos** en cada tabla auditada, que escriben `audit_logs` desde la base.
- **Recomendación**: (a).
  - Cada módulo conserva el control de su propia transacción, como describe el flujo de ajuste de stock de Overview.
  - Exigir el tipo de transacción hace que llamarla fuera de una no compile.
  - (b) invierte el control y complica los casos con varias escrituras.
  - (c) contradice DataModel ("poblada por la capa de aplicación") y la base no conoce al actor ni qué campos son relevantes.
- **Consecuencia**: `src/shared/db/` exporta el tipo de transacción.

### D-4 — Forma del `diff` y entradas inválidas

- **Opciones**:
  - (a) **Forma fija y validada**: `{ before, after }`, con solo los campos que cambiaron y valores JSON primitivos. `before` es `null` en `create`, y un `update` sin campos cambiados se rechaza. Se prohíben claves que contengan `password`, `hash`, `token` o `secret`. Una entrada inválida lanza una excepción y aborta la transacción.
  - (b) **`jsonb` libre**: la forma y el contenido quedan a cargo de cada productor.
- **Recomendación**: (a).
  - Las pantallas 4 y 7 mostrarán "solo los campos relevantes, sin IDs internos". Una forma fija evita que cada fase invente la suya.
  - Las claves prohibidas son una defensa barata contra filtrar un hash de contraseña cuando la 3.7 audite cambios de usuarios.
  - La entrada la arma el código, no el usuario: una inválida es un error de programación y no un `VALIDATION_ERROR` de dominio.
- **Consecuencia**: la forma queda documentada en DataModel.

### D-5 — Dependencias de `audit` para sus claves foráneas

- **Opciones**:
  - (a) **Declarar en Overview** que `audit` depende de `auth` y `organizations` solo a nivel de `schema.ts`, para sus claves foráneas. Su servicio y su repositorio no importan esos módulos.
  - (b) **Sin claves foráneas** en `organization_id` y `actor_user_id`, solo columnas uuid.
- **Recomendación**: (a).
  - (b) viola la regla 5 de DataModel y permitiría auditorías de actores u organizaciones inexistentes.
  - No se crea ciclo de imports: `organizations/schema.ts` no importa `audit`. `organizations/service.ts` usará `@/modules/audit` en la 3.7, lo que ya está declarado en Overview.
- **Consecuencia**: Overview y RepositoryStructure registran la dependencia de esquema.

## Resolución

Brief aprobado por el usuario el **2026-09-14**. D-1 a D-5 se resolvieron el mismo día, todas según la recomendación. El usuario autorizó aplicar las dos migraciones contra la base local de Docker. Mantuvo el orden 3.6 → 3.5 después de confirmar que ninguna de las dos depende de la otra. El cambio de estado en Notion no se autorizó y queda para el cierre.

| Decisión | Resolución |
|---|---|
| D-1 Enums | Los valores completos de DataModel |
| D-2 Solo inserción | Rol `crm_app` `NOLOGIN` con `GRANT` explícitos más trigger `BEFORE UPDATE OR DELETE`; ADR 0013 |
| D-3 Transacción | `recordAudit(tx, entry)`, con el tipo de transacción exigido |
| D-4 `diff` | `{ before, after }` validado, con claves prohibidas; una entrada inválida lanza |
| D-5 Claves foráneas | `audit` depende de `auth` y `organizations` solo en `schema.ts` |

### Ajustes durante la ejecución

- **Desfase tras la migración a medida (hallazgo 5)**: `drizzle-kit generate` respondió "No schema changes" y no creó archivos después de generar `0003` con `--custom`. Confirmado en local; la CI lo vuelve a comprobar.
- **Código de `ON DELETE RESTRICT`**: el test esperaba `23503` al borrar una organización o un actor con auditoría, pero PostgreSQL informa `23001` (`restrict_violation`). `23503` corresponde a `NO ACTION`. El borrado se rechaza como estaba diseñado; se corrigió la expectativa del test y se agregó que el registro sigue presente.
- **Formato antes de verificar**: por el aprendizaje de la 3.4, los archivos nuevos se formatearon con Prettier antes de correr typecheck y lint. La directiva `@ts-expect-error` del test de tipo quedó en su línea, y typecheck confirma que se usa.
- **Aplicación en desarrollo**: las dos migraciones se aplicaron a `crm_dev` y una segunda aplicación no cambió nada (4 migraciones registradas). `information_schema.role_table_grants` muestra `INSERT` y `SELECT` sobre `audit_logs` y los cuatro privilegios sobre las otras cinco tablas. El trigger `audit_logs_insert_only` existe.

Subfase **cerrada el 2026-09-14** con confirmación del usuario. Nivel alcanzado: *validado localmente y en CI* para el esquema de `audit_logs`, el rechazo de `UPDATE` y `DELETE` por permisos y por trigger, y la atomicidad de `recordAudit`. AC-1 a AC-13 están cumplidos. La CI del commit `e240bea` quedó en verde en la ejecución 34874433744, con el paso de desfase limpio. La evidencia está en [CHANGELOG.md](../../CHANGELOG.md).

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- `audit_logs` nunca se actualiza ni se borra desde la aplicación ni desde `crm_app`.
- Ningún registro de auditoría se escribe fuera de la transacción del cambio que registra.
- `audit` no importa servicios ni repositorios de otros módulos, y ningún otro módulo consulta `audit_logs` directamente.
- `organization_id` y `actor_user_id` de un registro los provee el productor desde su contexto autenticado, nunca del request.
- `auth` y `organizations` no cambian de comportamiento: sus tests siguen pasando sin modificaciones, salvo la lista de tablas de `identity-schema.test.ts`.
- Ninguna dependencia nueva, y ningún cambio en la forma de conectarse de la aplicación.

## Criterios de aceptación

- **AC-1**: D-1 a D-5 tienen resolución del usuario con fecha, y el ADR 0013 está escrito y aceptado.
- **AC-2**: `drizzle/0002_*` sale de `db:generate` y `drizzle/0003_*` de `generate --custom`. Ambas se revisaron como SQL, se aplicaron a la base de desarrollo, y aplicarlas otra vez no cambia nada.
- **AC-3**: los tests de esquema de `audit_logs` rechazan `NULL`, valores fuera de enum (`22P02`) y claves foráneas inexistentes (`23503`), y verifican los defaults.
- **AC-4**: con `SET ROLE crm_app`, `INSERT` y `SELECT` sobre `audit_logs` funcionan, y `UPDATE` y `DELETE` fallan con `42501`.
- **AC-5**: con el rol dueño, `UPDATE` y `DELETE` sobre `audit_logs` fallan con el código del trigger y la fila no cambia.
- **AC-6**: un test verifica que toda tabla de `public` tiene los privilegios esperados para `crm_app`, y demuestra que falla ante una tabla sin ellos.
- **AC-7**: los tres casos de atomicidad del punto 9 dan el resultado esperado contra la base real.
- **AC-8**: cada entrada inválida de D-4 lanza sin insertar, con tests unitarios de la validación. Pasar la conexión general a `recordAudit` no compila.
- **AC-9**: `npm run test` pasa con la base levantada, incluidos los tests nuevos y los existentes sin cambios salvo la lista de tablas.
- **AC-10**: la regla de frontera sigue en verde, y `audit` importa solo `@/shared/*` más, en `schema.ts`, los esquemas de `auth` y `organizations`.
- **AC-11**: con el contenedor detenido, `typecheck`, `lint`, `test:guards`, `test:unit` y `build` pasan.
- **AC-12**: CI en verde en el commit de la subfase, con el paso de desfase de migraciones limpio, verificado con `gh run view`.
- **AC-13**: `git status` muestra solo archivos autorizados, los documentos del punto 12 reflejan las resoluciones y los enlaces internos resuelven.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`** contra PostgreSQL 18.6 real en Docker:
  - salidas de `npm run test`;
  - salidas de `typecheck`, `lint`, `test:guards`, `test:unit` y `build` con la base detenida;
  - SQL de las dos migraciones y su segunda aplicación sin cambios.
- **Evidencia de CI**: ejecución en verde con los pasos de desfase, unitarios e integración.

**Nivel resultante esperado: validado localmente y en CI** para el esquema de `audit_logs`, el rechazo de `UPDATE` y `DELETE` por permisos y por trigger, y la atomicidad de `recordAudit`.

**No se valida**:

- que la aplicación en ejecución quede restringida por `crm_app`, porque todavía no se conecta con ese rol;
- ningún productor real, que llega en la 3.7.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si el paso de desfase de la CI marca cambios después de la migración a medida.
- Si `SET ROLE crm_app` no es posible en CI, o crear el rol falla en alguna de las dos bases.
- Si el trigger interfiere con `resetDatabase` o con los tests existentes.
- Si la regla de frontera rechaza los imports de `schema.ts` de D-5.
- Si hace falta una dependencia, cambiar la conexión de la aplicación, o un archivo fuera de la lista autorizada.
- Antes de aplicar migraciones sin la autorización del gate 1.
- Antes de commit, push o cambios en Notion.
