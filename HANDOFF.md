---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-12
git_ref: main — 04951e4 en origin/main, más el cierre de la Fase 1 (commit pendiente de autorización al escribir este archivo)
active_phase: Fase 2 — Fundación técnica (sin empezar)
active_task: ninguna; la primera es preparar el brief de la 2.1
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Última fase cerrada**: Fase 1 — Diseño UX y validación del modelo, el 2026-09-12. `confirmado`
- **Fase siguiente**: Fase 2 — Fundación técnica. Sin empezar y sin brief. En Notion conserva el estado que tenga; la sesión nueva lo verifica antes de actuar. `pendiente`

## 2. Último punto aprobado

- **Fase 1 cerrada el 2026-09-12** con aprobación del usuario: entrada de fase en [CHANGELOG.md](CHANGELOG.md), proyecto y tarea espejo de la Fase 1 en "Completado" en Notion, hub de Obsidian actualizado. `confirmado`
- Subfases 1.3, 1.1 y 1.2 cerradas el mismo día, cada una con su entrada. `confirmado`

## 3. Próximo paso

1. Commit y push del cierre de la Fase 1, si el usuario lo autoriza.
2. En una **sesión nueva**: retomar desde este archivo, verificar en Notion el estado de la Fase 2 y preparar el brief de la 2.1 según el [Roadmap](docs/planning/Roadmap.md).
3. Gate de entrada de la Fase 2: autorización explícita para instalar dependencias. La 2.2 re-verifica las versiones del stack antes de instalar y resuelve el [ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md).

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Modelo de datos | sin versionar, diseñado, validado contra pantallas en la 1.2 | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Matriz de trazabilidad | diseñado | [architecture/TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) |
| Catálogo de métricas | 12 métricas, diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Todo es **documental**, nivel del proyecto **diseñado**. No hay código, dependencias, base de datos, pruebas, build ni CI.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Criterios de salida de la Fase 1 cubiertos | documental | Entradas de la 1.1, la 1.2 y la Fase 1 en `CHANGELOG.md`; [TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md) `confirmado` |
| Los enlaces internos resuelven | documental | Verificador sobre todos los `.md` el 2026-09-12: 0 rotos `confirmado` |
| Constraints, índices y consultas funcionan en PostgreSQL | **no verificado** | Nada se ejecutó; se valida desde la Fase 2 y la Fase 4 `pendiente` |

## 6. Decisiones

### Vigentes

- ADRs 0001, 0002, 0003 y 0005 a 0010 aceptados. `confirmado`
- Resoluciones de los briefs 1.3, 1.1 y 1.2 en [docs/decisions/](docs/decisions/README.md). `confirmado`

### Pendientes

- [ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) en **propuesta** hasta la 2.2. `confirmado`
- H-3 búsqueda por prefijo o contenido → Fases 4 y 5. H-5 test de enmascarado para `viewer` → Fase 5. `confirmado`
- Retención de mensajes → Fase 9. Sesión → 3.2. Secretos → 9.1. Backups → 9.2. Personas → Fase 9. Índice en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **Repositorio remoto**: [benjamurilloo/AI-WhatsApp-Agent-CRM](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM), privado. Sin CI: GitHub Actions se configura en la Fase 2 ([ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)). `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **PowerShell 5.1 corta los mensajes de commit con comillas dobles**: escribir el mensaje en un archivo y usar `git commit -F`. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): Fase 2, subfases 2.1 a 2.5, gates.
- [decisions/0004-stack-tecnologico-propuesto.md](docs/decisions/0004-stack-tecnologico-propuesto.md) y [development/EngineeringStandards.md](docs/development/EngineeringStandards.md).
- [development/Environments.md](docs/development/Environments.md) y [development/TestingStrategy.md](docs/development/TestingStrategy.md).
- [architecture/Overview.md](docs/architecture/Overview.md): módulos del monolito.

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** La aprobación del cierre de la Fase 1 queda consumida en el changelog, Notion y el hub. El commit de ese cierre, la instalación de dependencias y el inicio de la Fase 2 necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Estado de la Fase 2 en Notion, no consultado al escribir este archivo. `pendiente`
