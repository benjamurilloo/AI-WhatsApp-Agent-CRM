---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-12
git_ref: main — d7b9bf2 en origin/main, más el cierre de la subfase 2.2 (commit y push autorizados por el usuario al escribir este archivo)
active_phase: Fase 2 — Fundación técnica (en curso)
active_task: 2.1 — Estructura del repositorio (sin brief)
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
- **Orden de la Fase 2**: 2.2 (cerrada) → **2.1** → 2.3 → 2.4 → 2.5 ([Roadmap](docs/planning/Roadmap.md)). `confirmado`

## 2. Último punto aprobado

- **Subfase 2.2 cerrada el 2026-09-12** con confirmación del usuario: entrada en [CHANGELOG.md](CHANGELOG.md), tarea 2.2 en "Completado" en Notion, [ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) aceptado. `confirmado`
- Líneas de estado desactualizadas corregidas en la página del proyecto en Notion y en el hub de Obsidian. `confirmado`

## 3. Próximo paso

1. Preparar el brief de la **2.1 — Estructura del repositorio** sobre el stack aceptado (Next.js 16.3, Drizzle 0.45). Límite ya señalado: no crear carpetas vacías por módulo ni archivos de relleno; la estructura se limita a lo que el stack y [Overview.md](docs/architecture/Overview.md) exigen. Evaluar si conviene fusionarla con la 2.3. `inferido`
2. Gate de la **2.3**: autorización explícita para instalar dependencias. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 aceptado; versiones fijadas el 2026-09-12 | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
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
| Versiones del stack vigentes al 2026-09-12 | documental | Tabla de verificación del [brief-2.2](docs/decisions/brief-2.2-re-verificacion-del-stack.md) (registro npm y páginas oficiales) `confirmado` |
| Compatibilidad declarada entre componentes | documental | `engines` y `peerDependencies` del registro npm `confirmado` |
| Drizzle soporta PostgreSQL 18 | **no verificado** | Sin declaración oficial encontrada; se valida en la 2.4 `pendiente` |
| Los enlaces internos resuelven | documental | Verificador sobre todos los `.md` el 2026-09-12: 0 rotos `confirmado` |
| Constraints, índices y consultas funcionan en PostgreSQL | **no verificado** | Se valida desde la 2.4 y la Fase 4 `pendiente` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0010 aceptados. `confirmado`
- Resoluciones de los briefs 1.3, 1.1, 1.2 y 2.2 en [docs/decisions/](docs/decisions/README.md). `confirmado`

### Pendientes

- Revisiones previstas del stack: Node 26 al entrar a LTS (2026-10-28); TypeScript 7.1 con soporte de `typescript-eslint`; Drizzle 1.0 si sale estable antes de la 3.1. `confirmado`
- H-3 búsqueda por prefijo o contenido → Fases 4 y 5. H-5 test de enmascarado para `viewer` → Fase 5. `confirmado`
- Retención de mensajes → Fase 9. Sesión → 3.2. Secretos → 9.1. Backups → 9.2. Personas → Fase 9. Índice en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **Repositorio remoto**: [benjamurilloo/AI-WhatsApp-Agent-CRM](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM), privado. Sin CI hasta la 2.5 ([ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)). `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **PowerShell 5.1 corta los mensajes de commit con comillas dobles**: escribir el mensaje en un archivo y usar `git commit -F`. `confirmado`
- **Resúmenes web no confiables para versiones**: el resumidor de WebFetch cambió años y versiones; el registro npm (`npm view`) es la fuente primaria. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): Fase 2, orden y gates.
- [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) y [decisions/0004-stack-tecnologico-propuesto.md](docs/decisions/0004-stack-tecnologico-propuesto.md).
- [architecture/Overview.md](docs/architecture/Overview.md): módulos del monolito.
- [development/Environments.md](docs/development/Environments.md) y [development/TestingStrategy.md](docs/development/TestingStrategy.md).

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y push del cierre de la 2.2 quedan consumidos. Instalar dependencias, empezar la 2.1 y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Nada.
