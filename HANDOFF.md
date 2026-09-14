---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-14
git_ref: main — e240bea en origin/main (CI en verde), más el cierre de la 3.6 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 3 — Identidad, autorización y auditoría (en progreso)
active_task: ninguna; la siguiente es la 3.5, sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 3 en progreso desde el 2026-09-13.** En Notion: proyecto Fase 3 "En progreso" (leído el 2026-09-14). `confirmado`
- **Subfases cerradas**: 3.1 a 3.3 el 2026-09-13; 3.4 y 3.6 el 2026-09-14. Tareas en Notion: "Completado". Siguen la 3.5 y la 3.7, en "Bandeja de Entrada". `confirmado`

## 2. Último punto aprobado

- **3.6 — Módulo de auditoría**, cerrada con confirmación del usuario. Entrada en [CHANGELOG.md](CHANGELOG.md), resolución en [brief-3.6](docs/decisions/brief-3.6-modulo-de-auditoria.md) y [ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md). `confirmado`
- **CI en verde** en el commit `e240bea`: [ejecución 34874433744](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34874433744). `confirmado`

## 3. Próximo paso

1. **Al retomar**: leer este archivo, verificar Git y que la CI del commit de cierre de la 3.6 esté en verde (`gh run list -L 1`). `confirmado`
2. **Preparar el brief de la 3.5 — Pantalla de inicio de sesión.** Notion: "Pantalla 1 de Screens.md, con errores que no revelan si la cuenta existe". Según el Roadmap, el login se valida en integración (UI ↔ servicio ↔ base). Debe resolver o incluir:
   - **antes de escribir la primera pantalla**: solución de estilos y lint de accesibilidad;
   - Server Action de login y logout con el adaptador de cookie de `auth`, y reescritura de la cookie tras la renovación con `sessionExpiresAt`;
   - `proxy` solo optimista, redirección a login (FR-ORG-03) y paso de cambio de contraseña con `must_change_password`;
   - log estructurado con `request_id` en `src/shared/log/` (D-5 de la 3.4);
   - `@node-rs/argon2` dentro del build de Next.js;
   - seed básico en `seeds/`;
   - `playwright.config.ts` y `tests/e2e/` con el login.

   Verificar el alcance en Notion, en [Screens.md](docs/product/Screens.md) y en el wireframe 01 antes de escribirlo. `inferido` de los briefs 3.3, 3.4 y RepositoryStructure.
3. **Después**: 3.7 (usuarios y roles). Es el primer productor real de `recordAudit` y trae la regla del último `admin`. `inferido`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg`, `postgres:18.6-trixie`, Drizzle 0.45.2 / Kit 0.31.10, `@node-rs/argon2` 2.2.1, `zod` 4.6.4 | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Mecanismo de sesión | ADR 0012 con nota de la 3.3; implementado a nivel de servicio | [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md) |
| Rol de aplicación y solo inserción | ADR 0013: `crm_app` `NOLOGIN`, privilegios explícitos por migración, trigger en tablas de solo inserción | [decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) |
| Interfaz pública de `auth` | `login`, `validateSession`, `logout`, `changePassword`, `revokeUserSessions`, `hashPassword`, adaptador de cookie | [src/modules/auth/index.ts](src/modules/auth/index.ts) |
| Interfaz pública de `organizations` | `getAuthContext`, `authorize`, `getMember`; tipos `AuthContext`, `MemberRole`, `Member` | [src/modules/organizations/index.ts](src/modules/organizations/index.ts) |
| Interfaz pública de `audit` | `recordAudit(tx, entry)`, `InvalidAuditEntryError`; tipos `AuditEntry`, `AuditEntityType`, `AuditAction` | [src/modules/audit/index.ts](src/modules/audit/index.ts) |
| Taxonomía de errores | `ErrorCode`, `HTTP_STATUS`, `Failure`, `failure()` | [src/shared/errors/index.ts](src/shared/errors/index.ts) |
| Estructura del repositorio | aprobada; lo de la 2.x, la 3.1 a 3.4 y la 3.6, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | dependencias, desfase de migraciones, lint, typecheck, formato, guardas, unitarios, integración y build | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| Entorno local, migraciones y base de test | Docker Compose con PostgreSQL 18; `db:generate`, `db:migrate`, migraciones a medida con `--custom`; base `<nombre>_test`; rol `crm_app` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | identidad (3.1), `sessions` y `login_attempts` (3.3) y `audit_logs` (3.6) implementadas; resto diseñado | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Modelo de seguridad | contraseñas, sesiones, límite de intentos, autorización y auditoría a nivel de servicio implementados; `Origin` diseñado | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado localmente y en CI** para la fundación técnica, el esquema de identidad, la autenticación, la autorización y la auditoría a nivel de servicio. **Diseñado** para pantallas y el resto del dominio.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Dependencias, desfase, lint, typecheck, formato, guardas, unitarios, integración y build pasan en CI | validado en CI (`deterministic`) | Ejecución 34874433744 `success` `confirmado` |
| `audit_logs` de solo inserción por permisos (`crm_app`) y por trigger; privilegios de `crm_app` en todas las tablas | validado localmente y en CI | `tests/integration/audit.test.ts`, 18 tests `confirmado` |
| `recordAudit` atómico con el cambio, exige transacción y valida la entrada | validado localmente y en CI | `audit.test.ts` y `src/modules/audit/service.test.ts`, 8 tests `confirmado` |
| Contexto autenticado, guardas por rol, `must_change_password` y aislamiento en `organization_members` | validado localmente y en CI | `tests/integration/authorization.test.ts`, 12 tests `confirmado` |
| Login, sesiones, logout, cambio de contraseña y límite de intentos | validado localmente y en CI | `tests/integration/auth-service.test.ts`, 30 tests `confirmado` |
| Tablas de identidad y lista de tablas del esquema | validado localmente y en CI | `tests/integration/identity-schema.test.ts` `confirmado` |
| Manejo de la cookie con `next/headers` | implementado | brief-3.3, D-7 `historico` |
| Guardas de referencias prohibidas y frontera entre módulos | validado localmente y en CI | `tests/guards/`, 19 tests `confirmado` |
| Suite completa local | validado localmente | `npm run test`: 123 de 123 en 12 archivos (27 unitarios, 19 guardas, 77 de integración) `confirmado` |
| La aplicación en ejecución queda restringida por `crm_app` | diseñado | no se conecta con ese rol hasta las Fases 8 y 9 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0013 aceptados. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3, 2.1 a 2.5, 3.1 a 3.4 y 3.6 en [docs/decisions/](docs/decisions/README.md). `confirmado`
- Convenciones:
  - enums `pgEnum`, `gen_random_uuid()`, `updated_at` en la aplicación y validación con `zod`;
  - resultados tipados con `Failure`, y orden de autorización `must_change_password` → rol → recurso filtrado por organización;
  - cada migración que crea una tabla otorga sus privilegios a `crm_app`, y las de solo inserción llevan trigger;
  - un cambio auditado pasa su transacción a `recordAudit`.

  `confirmado`
- `forbidden()` y `unauthorized()` de Next.js 16.3 no se usan: son experimentales. `historico`

### Pendientes

- **Solución de estilos, lint de accesibilidad y seed básico**: antes o durante la 3.5. `confirmado`
- **Log con `request_id`** (`src/shared/log/`), **reescritura de la cookie** con `sessionExpiresAt` y **`@node-rs/argon2` dentro del build**: 3.5. `confirmado`
- **Verificación de `Origin`** (`src/shared/http/`): con el primer Route Handler mutante. `confirmado`
- **Regla del último `admin`, nombre y email de miembros vía `auth`, y primer productor de auditoría**: 3.7. `confirmado`
- **`inventory_movements` de solo inserción según el ADR 0013**: Fase 4. `confirmado`
- **Conexión de la aplicación con un rol con login miembro de `crm_app`, y `CREATEROLE` en un servicio gestionado**: Fases 8 y 9 (subfase 9.1). `confirmado`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Fase 8. `historico`
- **IP detrás de un proxy real** (`TRUSTED_PROXY`): Fase 8 o 9. `historico`
- **Protección de rama**: no disponible en el plan actual; se revisa si se suma otra persona o antes de producción (Fase 9). `historico`
- **Revisiones del stack**:
  - Node 26 al entrar a LTS (2026-10-28);
  - TypeScript 7.1 cuando lo soporte `typescript-eslint`;
  - Drizzle 1.0 (rc.5 al 2026-09-13);
  - `crypto.argon2` nativo cuando deje de ser Experimental.

  `historico`
- **Ya asignadas a fases posteriores**: H-3 → Fases 4 y 5; H-5 → Fase 5; retención de mensajes → Fase 9; secretos → 9.1; backups → 9.2. El índice está en [Risks.md](docs/planning/Risks.md). `historico`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: nada impide un push en rojo. Ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`. `confirmado`
- **Solo inserción de `audit_logs`**:
  - mientras la aplicación se conecte con el rol dueño, la defensa efectiva es el trigger;
  - el dueño puede vaciar la tabla con `TRUNCATE`, que `resetDatabase` usa en los tests;
  - un superusuario puede desactivar el trigger.

  `confirmado`
- **`npm run test` requiere la base local levantada**: `docker compose up -d --wait`. Docker Desktop puede estar en marcha con el contenedor detenido; comprobar con `docker compose ps`. `npm run test:guards` y `npm run test:unit` no la necesitan. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **Tests con `db.execute` crudo**: `timestamptz` llega como texto; compararlo en SQL. Los rechazos se verifican por `error.cause.code`. `ON DELETE RESTRICT` informa `23001`, no `23503`. `confirmado`
- **La cookie de sesión no se reescribe al renovar** hasta la 3.5. `confirmado`
- **Formatear antes de verificar**: Prettier puede partir líneas y dejar sin efecto directivas como `eslint-disable-next-line`. `confirmado`
- **`format:check` local marca `src/app/page.tsx`** por CRLF en la copia de trabajo de Windows; en CI pasa. `confirmado`
- **Aviso de Vite** por el import sin extensión en `vitest.config.mts`: inocuo hoy. `confirmado`
- **`drizzle-kit generate --out`** no acepta rutas absolutas de Windows: usar rutas relativas. `historico`
- **PowerShell 5.1**: corta los mensajes de commit con comillas dobles; usar Bash con heredoc. `confirmado`
- **Un hook de seguridad bloquea `Remove-Item` y `taskkill /T /F`**: detener servidores con `Stop-Process` sobre el `OwningProcess` del puerto. `historico`
- **El conector de Notion puede desconectarse** entre sesiones. `historico`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `historico`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [product/Screens.md](docs/product/Screens.md) y [product/wireframes/](docs/product/wireframes/README.md): pantalla 1.
- [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md), [decisions/brief-3.3-autenticacion.md](docs/decisions/brief-3.3-autenticacion.md) (D-7, cookie) y [decisions/brief-3.4-autorizacion-y-errores.md](docs/decisions/brief-3.4-autorizacion-y-errores.md) (D-5, log y `Origin`).
- [architecture/SecurityModel.md](docs/architecture/SecurityModel.md), [architecture/Overview.md](docs/architecture/Overview.md) y [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md).
- [development/TestingStrategy.md](docs/development/TestingStrategy.md): end-to-end y `must_change_password`.
- [src/modules/auth/index.ts](src/modules/auth/index.ts) y [src/modules/organizations/index.ts](src/modules/organizations/index.ts).

## 9. Cambios ajenos del usuario detectados

Ninguno en el repositorio. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y el push de la 3.6, el cierre y el cambio de estado en Notion quedan consumidos. Instalar dependencias, ejecutar migraciones, cambios en Notion y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que la CI del commit de cierre de la 3.6 quede en verde. Se verifica al hacer el push y se vuelve a comprobar al retomar.
- Alcance exacto de la 3.5 en Notion y en la pantalla 1.
