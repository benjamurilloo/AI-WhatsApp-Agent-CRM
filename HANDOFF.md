---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-13
git_ref: main — bef80d6 en origin/main (CI en verde), más el cierre de la 3.1 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 3 — Identidad, autorización y auditoría (en progreso)
active_task: ninguna; la siguiente es la 3.2, sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 3 en progreso desde el 2026-09-13**, abierta con aprobación del usuario. En Notion: proyecto Fase 3 "En progreso", tarea espejo "En proceso". `confirmado`
- **Subfase 3.1 cerrada el 2026-09-13.** Tarea 3.1 en Notion: "Completado". `confirmado`

## 2. Último punto aprobado

- **3.1 — Migraciones de identidad**, cerrada con confirmación del usuario. Entrada en [CHANGELOG.md](CHANGELOG.md) y resolución en [brief-3.1](docs/decisions/brief-3.1-migraciones-de-identidad.md). `confirmado`
- **CI en verde** en el commit `bef80d6`: [ejecución 34786605412](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34786605412). `confirmado`

## 3. Próximo paso

1. **Al retomar**: leer este archivo, verificar Git y que la CI del commit de cierre de la 3.1 esté en verde (`gh run list -L 1`). `confirmado`
2. **Preparar el brief de la 3.2 — ADR del mecanismo de sesión**: almacenamiento de sesión y librería, cubriendo revocación, expiración y `must_change_password`. Con [ADR 0010](docs/decisions/0010-un-usuario-una-organizacion-en-el-mvp.md) no hay cambio de organización activa, aunque la descripción de Notion lo mencione. `confirmado`
3. **Orden previsto del resto**: 3.2 → 3.3 (autenticación) → 3.4 (autorización y errores) → 3.6 (auditoría) → 3.5 (login) → 3.7 (usuarios). `inferido` del Roadmap y del brief-3.1; se confirma al planificar cada una.
4. **Antes de la primera pantalla (3.5)**: decidir la solución de estilos y el lint de accesibilidad. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg`, `postgres:18.6-trixie`, Drizzle 0.45.2 / Kit 0.31.10 | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Estructura del repositorio | aprobada; lo de la 2.x y la 3.1, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | `.github/workflows/ci.yml`, con acciones por SHA y paso de desfase de migraciones | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Entorno local, migraciones y base de test | Docker Compose con PostgreSQL 18; `db:generate`, `db:migrate`; base `<nombre>_test` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | identidad implementada (3.1); resto diseñado | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Taxonomía de errores | diseñado | [architecture/Overview.md](docs/architecture/Overview.md) |
| Modelo de seguridad | diseñado | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado localmente y en CI** para la fundación técnica y el esquema de identidad; **diseñado** para el resto del dominio. No hay servicios, autenticación ni pantallas.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Lint, typecheck, formato, desfase de migraciones, guardas, integración y build pasan en CI | validado en CI (`deterministic`) | Ejecución 34786605412, `success`, 1m5s `confirmado` |
| Tablas de identidad: unicidades (email sin distinguir mayúsculas, `UNIQUE(user_id)`), enum de rol, FKs, NOT NULL y defaults | validado localmente y en CI | `tests/integration/identity-schema.test.ts`, 17 tests `confirmado` |
| La suite no escribe en la base de desarrollo y los tests no se ven entre sí | validado localmente | Conteos de `crm_dev` antes y después; tests de aislamiento `confirmado` |
| CI detecta un `schema.ts` sin migración | validado localmente con desfase forzado; en verde en CI | brief-3.1, ajustes durante la ejecución `confirmado` |
| Drizzle y `pg` conectan con PostgreSQL 18.6; el health check no expone detalles | validado localmente y en CI | `tests/integration/db-connectivity.test.ts`, 5 tests `confirmado` |
| Guardas de referencias prohibidas y frontera entre módulos | validado localmente y en CI | `tests/guards/`, 19 tests `confirmado` |
| `updated_at` con `$onUpdate` | implementado, sin test | brief-3.1, D-3 `confirmado` |
| Los enlaces internos resuelven | documental | 0 rotos el 2026-09-13 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0011 aceptados. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3, 2.1 a 2.5 y 3.1 en [docs/decisions/](docs/decisions/README.md). Convenciones de la 3.1 para tablas futuras: enums `pgEnum`, `gen_random_uuid()`, `updated_at` en la aplicación. `confirmado`

### Pendientes

- **Mecanismo de sesión**: ADR de la 3.2. `confirmado`
- **Ubicación de la taxonomía de errores y del log con `request_id`**: en la subfase que los implemente (3.4). `confirmado`
- **Roles de base de datos y `GRANT`/`REVOKE`** para `audit_logs` insert-only: 3.6. `confirmado`
- **Seed básico**: nace cuando exista el hash de contraseñas (3.3 o después). `confirmado`
- **Solución de estilos y lint de accesibilidad** (`jsx-a11y` sin soporte de ESLint 10): antes de la 3.5. `confirmado`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Se tratan en la Fase 8. `historico`
- **Protección de rama**: no disponible en el plan actual. Se revisa si se suma otra persona o antes de producción (Fase 9). `confirmado`
- **Revisiones del stack**: Node 26 al entrar a LTS (2026-10-28); TypeScript 7.1 cuando lo soporte `typescript-eslint`; Drizzle 1.0 (en rc.5 al 2026-09-13), con `drizzle-kit up` para convertir `drizzle/`. `confirmado`
- **Ya asignadas a fases posteriores**: H-3 → Fases 4 y 5; H-5 → Fase 5; retención de mensajes → Fase 9; secretos → 9.1; backups → 9.2. El índice está en [Risks.md](docs/planning/Risks.md). `historico`

### Resueltas en esta pasada

- Base de test separada y aislamiento entre tests (brief-3.1, D-1). `confirmado`
- `allowScripts` de npm: `drizzle-kit` funciona en local y en CI pese al aviso; no hace falta aprobar los scripts de `esbuild`. `confirmado`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: nada impide un push en rojo. Ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`. `confirmado`
- **`npm run test` requiere la base local levantada**: `docker compose up -d --wait`. `npm run test:guards` no la necesita. La suite recrea `crm_dev_test` en cada ejecución. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **Tests con `db.execute` crudo**: `timestamptz` llega como texto; compararlo en SQL. Los rechazos se verifican por `error.cause.code`. `confirmado`
- **`format:check` local marca `src/app/page.tsx`** por CRLF en la copia de trabajo de Windows; en CI pasa. `confirmado`
- **Aviso de Vite** por el import sin extensión en `vitest.config.mts`: inocuo hoy. `confirmado`
- **`drizzle-kit generate --out`** no acepta rutas absolutas de Windows: usar rutas relativas. `confirmado`
- **PowerShell 5.1**: corta los mensajes de commit con comillas dobles (usar `git commit -F`); rompe `gh ... --jq` complejo (parsear con `ConvertFrom-Json`). `confirmado`
- **Un hook de seguridad bloquea `Remove-Item` y `taskkill /T /F`**: detener servidores con `Stop-Process` sobre el `OwningProcess` del puerto. `historico`
- **El clasificador de permisos puede bloquear `git push`** aunque el usuario lo autorice en el turno: el usuario lo habilitó en esta sesión. `confirmado`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `historico`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): Fase 3, criterios y gates.
- [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) y [architecture/Overview.md](docs/architecture/Overview.md): sesión, roles y taxonomía de errores.
- [development/EngineeringStandards.md](docs/development/EngineeringStandards.md): fila de autenticación ("se decide en la 3.2").
- [product/wireframes/01-inicio-de-sesion.md](docs/product/wireframes/01-inicio-de-sesion.md) y [decisions/0010-un-usuario-una-organizacion-en-el-mvp.md](docs/decisions/0010-un-usuario-una-organizacion-en-el-mvp.md).
- [decisions/brief-3.1-migraciones-de-identidad.md](docs/decisions/brief-3.1-migraciones-de-identidad.md): convenciones de esquema y tests.

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y el push del cierre de la 3.1 quedan consumidos. Instalar dependencias, ejecutar migraciones, cambios en Notion y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que la CI del commit de cierre de la 3.1 quede en verde. Se verifica al hacer el push y se vuelve a comprobar al retomar.
