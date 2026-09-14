---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-13
git_ref: main — b779592 en origin/main (CI en verde), más el cierre de la 3.3 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 3 — Identidad, autorización y auditoría (en progreso)
active_task: ninguna; la siguiente es la 3.4, sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 3 en progreso desde el 2026-09-13.** En Notion: proyecto Fase 3 "En progreso", tarea espejo "En proceso". `confirmado`
- **Subfases 3.1, 3.2 y 3.3 cerradas el 2026-09-13.** Tareas en Notion: "Completado". `confirmado`

## 2. Último punto aprobado

- **3.3 — Autenticación**, cerrada con confirmación del usuario. Entrada en [CHANGELOG.md](CHANGELOG.md) y resolución en [brief-3.3](docs/decisions/brief-3.3-autenticacion.md). `confirmado`
- **CI en verde** en el commit `b779592`: [ejecución 34792128446](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34792128446). `confirmado`

## 3. Próximo paso

1. **Al retomar**: leer este archivo, verificar Git y que la CI del commit de cierre de la 3.3 esté en verde (`gh run list -L 1`). `confirmado`
2. **Preparar el brief de la 3.4 — Autorización y taxonomía de errores**. Según Notion, el ADR 0012 y los pendientes de la 3.3, cubre:
   - **contexto autenticado**: `organizations` llama a `auth.validateSession` y resuelve membresía y rol con su propio repositorio (ADR 0012, nota de D-2 de la 3.3); sin membresía → `UNAUTHENTICATED`;
   - guards por rol: `viewer` en acción de `admin` → `FORBIDDEN`; otra organización → `NOT_FOUND`, con test negativo obligatorio;
   - restricción de `must_change_password`: solo cambio de contraseña y logout;
   - verificación de `Origin` en Route Handlers mutantes;
   - reescritura de la cookie tras la renovación, en Server Actions o Route Handlers;
   - taxonomía de errores como tipo compartido y log con `request_id`, con su ubicación a decidir;
   - **agregar el proyecto `unit` de Vitest a `ci.yml`**, que hoy no lo corre.

   `confirmado`
3. **Orden previsto del resto**: 3.4 → 3.6 (auditoría) → 3.5 (login, seed básico, `@node-rs/argon2` dentro del build) → 3.7 (usuarios). `inferido` del Roadmap y los briefs; se confirma al planificar cada una.
4. **Antes de la primera pantalla (3.5)**: decidir la solución de estilos y el lint de accesibilidad. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg`, `postgres:18.6-trixie`, Drizzle 0.45.2 / Kit 0.31.10, `@node-rs/argon2` 2.2.1, `zod` 4.6.4 | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Mecanismo de sesión | ADR 0012 con nota de la 3.3; implementado a nivel de servicio | [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md) |
| Interfaz pública de `auth` | `login`, `validateSession`, `logout`, `changePassword`, `revokeUserSessions`, `hashPassword`, adaptador de cookie | [src/modules/auth/index.ts](src/modules/auth/index.ts) |
| Estructura del repositorio | aprobada; lo de la 2.x, la 3.1 y la 3.3, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | `.github/workflows/ci.yml`: lint, typecheck, formato, desfase de migraciones, guardas, integración y build. **Sin el proyecto `unit`** | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Entorno local, migraciones y base de test | Docker Compose con PostgreSQL 18; `db:generate`, `db:migrate`; base `<nombre>_test`; `TRUSTED_PROXY` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | identidad (3.1), `sessions` y `login_attempts` (3.3) implementadas; resto diseñado | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Modelo de seguridad | diseñado; contraseñas, sesiones y límite de intentos implementados | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Taxonomía de errores | diseñado; `auth` usa sus códigos como resultados tipados | [architecture/Overview.md](docs/architecture/Overview.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado localmente y en CI** para la fundación técnica, el esquema de identidad y la autenticación a nivel de servicio; **diseñado** para autorización, auditoría, pantallas y el resto del dominio.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Lint, typecheck, formato, desfase de migraciones, guardas, integración y build pasan en CI | validado en CI (`deterministic`) | Ejecución 34792128446 `success` `confirmado` |
| Login, sesiones, logout, cambio de contraseña y límite de intentos | validado localmente y en CI | `tests/integration/auth-service.test.ts`, 30 tests `confirmado` |
| Hash argon2id, política de contraseña, atributos de cookie e IP | validado localmente (no corre en CI) | `src/modules/auth/*.test.ts`, 14 tests `confirmado` |
| Manejo de la cookie con `next/headers` | implementado | brief-3.3, D-7 `confirmado` |
| Tablas de identidad: unicidades, enum de rol, FKs, NOT NULL y defaults | validado localmente y en CI | `tests/integration/identity-schema.test.ts`, 17 tests `confirmado` |
| La suite no escribe en la base de desarrollo y los tests no se ven entre sí | validado localmente | brief-3.1 `historico` |
| Drizzle y `pg` conectan con PostgreSQL 18.6; health check sin detalles | validado localmente y en CI | `tests/integration/db-connectivity.test.ts` `confirmado` |
| Guardas de referencias prohibidas y frontera entre módulos | validado localmente y en CI | `tests/guards/`, 19 tests `confirmado` |
| Los enlaces internos resuelven | documental | 0 rotos el 2026-09-13 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0012 aceptados; el 0012 con nota fechada de la 3.3 sobre las dos consultas. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3, 2.1 a 2.5 y 3.1 a 3.3 en [docs/decisions/](docs/decisions/README.md). Convenciones: enums `pgEnum`, `gen_random_uuid()`, `updated_at` en la aplicación, validación con `zod`. `confirmado`

### Pendientes

- **Ubicación de la taxonomía de errores y del log con `request_id`**: 3.4. `confirmado`
- **Proyecto `unit` en CI**: 3.4. `confirmado`
- **Roles de base de datos y `GRANT`/`REVOKE`** para `audit_logs` insert-only: 3.6. `confirmado`
- **Seed básico y solución de estilos y accesibilidad**: antes o durante la 3.5. `confirmado`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Fase 8. `confirmado`
- **IP detrás de un proxy real** (`TRUSTED_PROXY`): Fase 8 o 9. `confirmado`
- **Protección de rama**: no disponible en el plan actual; se revisa si se suma otra persona o antes de producción (Fase 9). `historico`
- **Revisiones del stack**:
  - Node 26 al entrar a LTS (2026-10-28);
  - TypeScript 7.1 cuando lo soporte `typescript-eslint`;
  - Drizzle 1.0 (rc.5 al 2026-09-13);
  - `crypto.argon2` nativo cuando deje de ser Experimental.

  `confirmado`
- **Ya asignadas a fases posteriores**: H-3 → Fases 4 y 5; H-5 → Fase 5; retención de mensajes → Fase 9; secretos → 9.1; backups → 9.2. El índice está en [Risks.md](docs/planning/Risks.md). `historico`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: nada impide un push en rojo. Ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`. `confirmado`
- **CI sin tests unitarios**: el proyecto `unit` solo corre en local con `npm run test`. `confirmado`
- **`npm run test` requiere la base local levantada**: `docker compose up -d --wait`. `npm run test:guards` no la necesita. La suite recrea `crm_dev_test` en cada ejecución. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **Tests con `db.execute` crudo**: `timestamptz` llega como texto; compararlo en SQL. Los rechazos se verifican por `error.cause.code`. `confirmado`
- **La cookie de sesión no se reescribe al renovar**: `validateSession` extiende la base, pero la cookie conserva el vencimiento del login hasta que una Server Action o un Route Handler la vuelva a escribir. `confirmado`
- **`format:check` local marca `src/app/page.tsx`** por CRLF en la copia de trabajo de Windows; en CI pasa. `confirmado`
- **Aviso de Vite** por el import sin extensión en `vitest.config.mts`: inocuo hoy. `confirmado`
- **`drizzle-kit generate --out`** no acepta rutas absolutas de Windows: usar rutas relativas. `historico`
- **PowerShell 5.1**: corta los mensajes de commit con comillas dobles (usar `git commit -F`); rompe `gh ... --jq` complejo (parsear con `ConvertFrom-Json`). `confirmado`
- **Un hook de seguridad bloquea `Remove-Item` y `taskkill /T /F`**: detener servidores con `Stop-Process` sobre el `OwningProcess` del puerto. `historico`
- **El clasificador de permisos puede bloquear `git push`** aunque el usuario lo autorice en el turno. `historico`
- **Resúmenes web no confiables para versiones**: la documentación de Node se leyó con un resumen que dio una versión de alta dudosa para `crypto.argon2`. `confirmado`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `historico`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md) y [decisions/brief-3.3-autenticacion.md](docs/decisions/brief-3.3-autenticacion.md).
- [architecture/Overview.md](docs/architecture/Overview.md): taxonomía de errores, reglas de dependencia y observabilidad.
- [architecture/SecurityModel.md](docs/architecture/SecurityModel.md): autorización, aislamiento y CSRF.
- [development/TestingStrategy.md](docs/development/TestingStrategy.md): aislamiento entre organizaciones, `must_change_password` y casos de sesión de la 3.4.
- [src/modules/auth/index.ts](src/modules/auth/index.ts) y [.github/workflows/ci.yml](.github/workflows/ci.yml).

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y el push del cierre de la 3.3 quedan consumidos. Instalar dependencias, ejecutar migraciones, cambios en Notion y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que la CI del commit de cierre de la 3.3 quede en verde. Se verifica al hacer el push y se vuelve a comprobar al retomar.
