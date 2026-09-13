---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-13
git_ref: main — e820ca4 en origin/main (CI en verde), más el cierre de la Fase 2 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 3 — Identidad, autorización y auditoría (sin abrir)
active_task: ninguna; la primera es la 3.1, sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 2 cerrada el 2026-09-13.** El usuario aprobó el cierre y la estructura del repositorio. `confirmado`
- **Próxima fase**: Fase 3 — Identidad, autorización y auditoría ([Roadmap](docs/planning/Roadmap.md)). Se trabaja en una **sesión nueva**, según la convención del usuario de una fase por sesión. `confirmado`

## 2. Último punto aprobado

- **Fase 2 cerrada el 2026-09-13**, con las subfases 2.2 → 2.1 → 2.3 → 2.4 → 2.5 cerradas y entradas en [CHANGELOG.md](CHANGELOG.md). En Notion quedan en "Completado" la tarea 2.5, el proyecto Fase 2 y su tarea espejo. `confirmado`
- **CI en verde** en el commit `e820ca4`: [ejecución 34783979325](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34783979325). `confirmado`

## 3. Próximo paso

1. **Al abrir la sesión nueva**:
   - retomar desde este archivo;
   - verificar Git, y que la CI del commit de cierre de la Fase 2 esté en verde (`gh run list -L 1`);
   - consultar la Fase 3 en Notion y pasarla a "En progreso" solo con aprobación del usuario. `confirmado`
2. **Preparar el brief de la 3.1** según el Roadmap y Notion. Ahí se decide la **base de test separada y el aislamiento entre tests**, que la 2.4 dejó pendiente. `confirmado`
3. **Antes de la primera migración con `drizzle-kit`**, revisar el aviso de CI sobre `allowScripts`: los `postinstall` de `esbuild` no cubiertos. Si `drizzle-kit` falla en CI por eso, se decide cómo aprobarlos. `pendiente`
4. **Antes de la primera pantalla**, decidir la solución de estilos y revisar el lint de accesibilidad. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg` y `postgres:18.6-trixie` | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Estructura del repositorio | aprobada al cerrar la Fase 2; lo de las subfases 2.x, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | `.github/workflows/ci.yml`, con acciones por SHA | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) (CI) |
| Entorno local | Docker Compose con PostgreSQL 18; `/api/health` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | sin versionar, diseñado, validado contra pantallas en la 1.2 | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Taxonomía de errores | diseñado | [architecture/Overview.md](docs/architecture/Overview.md) |
| Modelo de seguridad | diseñado | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado localmente y en CI** para la fundación técnica; **diseñado** para todo el dominio. No hay tablas, módulos, autenticación ni pantallas.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Lint, typecheck, formato, guardas, integración y build pasan en CI | validado en CI (`deterministic`) | Ejecución 34783979325, `success`, 62 s `confirmado` |
| Drizzle y `pg` conectan con PostgreSQL 18.6; el health check no expone detalles; una conexión cortada no tira el proceso | validado localmente y en CI | `tests/integration/db-connectivity.test.ts`, 5 tests `confirmado` |
| La guarda detecta referencias prohibidas y falla ante una real | validado localmente y en CI | `tests/guards/forbidden-references.test.ts` y caso forzado de AC-3 de la 2.5 `confirmado` |
| La regla de frontera entre módulos detecta importaciones prohibidas | validado localmente y en CI | `tests/guards/module-boundary.test.ts`, 9 casos `confirmado` |
| Los enlaces internos resuelven | documental | 0 rotos el 2026-09-13 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0011 aceptados. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3 y 2.1 a 2.5 en [docs/decisions/](docs/decisions/README.md). `confirmado`

### Pendientes

- **Base de test separada y aislamiento entre tests**: se decide en la 3.1. `confirmado`
- **Mecanismo de sesión**: ADR de la 3.2. `confirmado`
- **Ubicación de la taxonomía de errores y del log con `request_id`**: se decide en la subfase de la Fase 3 que los implemente. `confirmado`
- **Solución de estilos y lint de accesibilidad** (`jsx-a11y` sin soporte de ESLint 10): antes de la primera pantalla. `confirmado`
- **`allowScripts` de npm en CI** para los `postinstall` de `esbuild`: antes de usar `drizzle-kit` en CI. `pendiente`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Se tratan en la Fase 8. `confirmado`
- **Protección de rama**: no disponible en el plan actual. Se revisa si se suma otra persona o antes de producción (Fase 9). `confirmado`
- **Revisiones del stack**:
  - Node 26, al entrar a LTS (2026-10-28);
  - TypeScript 7.1, cuando lo soporte `typescript-eslint`;
  - Drizzle 1.0, si sale estable antes de la 3.1. `confirmado`
- **Ya asignadas a fases posteriores**:
  - H-3 → Fases 4 y 5;
  - H-5 → Fase 5;
  - retención de mensajes → Fase 9;
  - secretos → 9.1;
  - backups → 9.2.

  El índice está en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: nada impide un push en rojo. Ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`. `confirmado`
- **`npm run test` requiere la base local levantada**: `docker compose up -d --wait`. `npm run test:guards` no la necesita. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **PowerShell 5.1**:
  - corta los mensajes de commit con comillas dobles: usar `git commit -F`;
  - rompe `gh ... --jq` con expresiones complejas: parsear con `ConvertFrom-Json`. `confirmado`
- **Un hook de seguridad bloquea comandos con `Remove-Item` o `taskkill /T /F`**: detener servidores con `Stop-Process` sobre el `OwningProcess` del puerto. `confirmado`
- **`module-boundary.test.ts` tarda unos 35 s en Windows** (1,6 s en el runner de Linux), por la inicialización de ESLint. `confirmado`
- **Resúmenes web no confiables para versiones**: la fuente primaria es el registro npm. `confirmado`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): Fase 3, subfases 3.1 a 3.7, criterios y gates.
- [architecture/DataModel.md](docs/architecture/DataModel.md): tablas de identidad, organizaciones y auditoría.
- [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) y [architecture/Overview.md](docs/architecture/Overview.md): roles, taxonomía de errores y observabilidad.
- [decisions/0010-un-usuario-una-organizacion-en-el-mvp.md](docs/decisions/0010-un-usuario-una-organizacion-en-el-mvp.md).
- [development/TestingStrategy.md](docs/development/TestingStrategy.md): casos obligatorios de la Fase 3.
- [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md): módulos `auth`, `organizations` y `audit`.

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y el push del cierre de la Fase 2 quedan consumidos. Abrir la Fase 3, instalar dependencias, ejecutar migraciones y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que la CI del commit de cierre de la Fase 2 quede en verde. Se verifica al hacer el push y se vuelve a comprobar al abrir la sesión de la Fase 3.
