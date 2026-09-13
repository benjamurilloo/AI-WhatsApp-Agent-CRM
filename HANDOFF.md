---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-12
git_ref: main — 5d65dbf en origin/main, más el cierre de la subfase 2.3 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 2 — Fundación técnica (en curso)
active_task: 2.4 — Base de datos local (sin brief)
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase activa**: Fase 2 — Fundación técnica, en curso desde el 2026-09-12. En Notion, "En progreso". `confirmado`
- **Orden de la Fase 2**: 2.2 (cerrada) → 2.1 (cerrada) → 2.3 (cerrada) → **2.4** → 2.5 ([Roadmap](docs/planning/Roadmap.md)). `confirmado`

## 2. Último punto aprobado

- **Subfase 2.3 cerrada el 2026-09-12** con confirmación del usuario: entrada en [CHANGELOG.md](CHANGELOG.md), [brief-2.3](docs/decisions/brief-2.3-bootstrap-de-la-aplicacion.md) cerrado y [ADR 0011](docs/decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md) aceptado. `confirmado`
- Subfases 2.2 y 2.1 cerradas el mismo día. `confirmado`

## 3. Próximo paso

1. Preparar el brief de la **2.4 — Base de datos local**. Crea `docker-compose.yml`, `.env.example`, `drizzle.config.ts`, `src/shared/db/`, `src/app/api/health/route.ts` y `tests/integration/` con el test de conectividad real ([RepositoryStructure.md](docs/architecture/RepositoryStructure.md)). `confirmado`
2. Gates de la 2.4: **autorización explícita para instalar** Drizzle y el driver de PostgreSQL, y para levantar PostgreSQL 18 en Docker. Hay que verificar antes que Docker esté disponible en la máquina. `pendiente`
3. En la 2.4: quitar `--passWithNoTests` del script `test` cuando exista el primer test. `confirmado`
4. Punto a decidir en ese brief: driver `pg` o `postgres`. El soporte declarado de PostgreSQL 18 no está verificado. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 aceptado y ADR 0011 para el lint; instalado en la 2.3 | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Estructura del repositorio | diseñado; lo de la 2.3, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| Modelo de datos | sin versionar, diseñado, validado contra pantallas en la 1.2 | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **implementado** para el esqueleto de la aplicación y **diseñado** para todo lo demás. Todavía no hay tests, base de datos ni CI.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| `npm ci`, `typecheck`, `lint`, `format:check`, `build` y `test` salen con 0 | implementado (ejecución local) | Corridas del 2026-09-12 registradas en el brief-2.3 `confirmado` |
| La regla de frontera de ESLint detecta importaciones prohibidas y respeta las excepciones de `schema.ts` y `analytics` | implementado (prueba local temporal, no versionada) | 9 de 9 casos correctos el 2026-09-12; el caso versionado llega en la 2.5 `confirmado` |
| `next dev` sirve `/` y no modifica `CLAUDE.md` | implementado | `GET /` 200 y `git status` limpio el 2026-09-12 `confirmado` |
| Drizzle soporta PostgreSQL 18 y lee el esquema repartido por módulos | **no verificado** | Se valida en la 2.4 y con la primera migración `pendiente` |
| Los enlaces internos resuelven | documental | 0 rotos el 2026-09-12 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0011 aceptados. `confirmado`
- Resoluciones de los briefs 1.3, 1.1, 1.2, 2.2, 2.1 y 2.3 en [docs/decisions/](docs/decisions/README.md). `confirmado`

### Pendientes

- **Solución de estilos** (CSS Modules, Tailwind u otra): no está en el stack aceptado. Se decide antes de la primera pantalla de la Fase 3. `confirmado`
- **Lint de accesibilidad**: `eslint-plugin-jsx-a11y` no soporta ESLint 10. Se revisa antes de la Fase 3. `confirmado`
- Revisiones previstas del stack: Node 26 al entrar a LTS (2026-10-28); TypeScript 7.1 con soporte de `typescript-eslint`; Drizzle 1.0 si sale estable antes de la 3.1. `confirmado`
- Ubicación de la taxonomía de errores y del log con `request_id`: se decide en el brief de la subfase de la Fase 3 que los implemente. `confirmado`
- H-3 búsqueda por prefijo o contenido → Fases 4 y 5. H-5 test de enmascarado para `viewer` → Fase 5. `confirmado`
- Retención de mensajes → Fase 9. Sesión → 3.2. Secretos → 9.1. Backups → 9.2. Personas → Fase 9. Índice en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **Repositorio remoto**: [benjamurilloo/AI-WhatsApp-Agent-CRM](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM), privado. Sin CI hasta la 2.5 ([ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)). `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **PowerShell 5.1 corta los mensajes de commit con comillas dobles**: escribir el mensaje en un archivo y usar `git commit -F`. `confirmado`
- **Resúmenes web no confiables para versiones**: el registro npm (`npm view`) es la fuente primaria. `confirmado`
- **`next build` avisa de un `package-lock.json` en `C:\Users\benja`**, fuera del repositorio. Next lo ignora; es del entorno del usuario y no se toca. `confirmado`
- **`next dev` escribe reglas para agentes en `CLAUDE.md`** si falta `agentRules: false` en `next.config.ts`. No quitar esa opción. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) y [development/EngineeringStandards.md](docs/development/EngineeringStandards.md).
- [architecture/DataModel.md](docs/architecture/DataModel.md): la 2.4 no crea tablas, pero sí la conexión.
- [planning/Roadmap.md](docs/planning/Roadmap.md): Fase 2, orden y gates.
- [development/TestingStrategy.md](docs/development/TestingStrategy.md) y [development/Environments.md](docs/development/Environments.md).

## 9. Cambios ajenos del usuario detectados

Ninguno. El único cambio no autorizado fue el bloque que escribió `next dev` en `CLAUDE.md`. Se descartó con autorización del usuario. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y push del cierre de la 2.3 quedan consumidos. Instalar dependencias, levantar contenedores y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Disponibilidad de Docker en la máquina del usuario, antes de la 2.4.
