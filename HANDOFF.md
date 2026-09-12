---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-12
git_ref: main — 626acaf en origin/main, más el cierre de la 1.1 sin commitear al escribir este archivo
active_phase: Fase 1 — Diseño UX y validación del modelo
active_task: 1.2 — Validación cruzada del modelo (sin brief todavía)
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase activa**: Fase 1 — Diseño UX y validación del modelo. En Notion, "En progreso". `confirmado`
- **Subfase activa**: 1.2 — Validación cruzada del modelo. Sin brief todavía. `confirmado`
- **Orden de ejecución de la Fase 1**: 1.3 → 1.1 → 1.2, registrado en [Roadmap.md](docs/planning/Roadmap.md). `confirmado`

## 2. Último punto aprobado

- **Subfase 1.3 cerrada el 2026-09-12**, commit `626acaf`. `confirmado`
- **Subfase 1.1 cerrada el 2026-09-12** con aprobación del usuario: wireframes de las 10 pantallas en [docs/product/wireframes/](docs/product/wireframes/README.md), entrada en [CHANGELOG.md](CHANGELOG.md) y tarea "Completado" en Notion. Los nombres de archivo abreviados fueron aceptados. `confirmado`

## 3. Próximo paso

1. Commit del cierre de la 1.1, si el usuario lo autoriza. Incluye la corrección de este handoff sobre el remoto, que el usuario pidió sumar al commit siguiente.
2. Preparar `docs/decisions/brief-1.2-*.md` y pedir su aprobación. Su entrada principal son las brechas B-1 a B-11 del [índice de wireframes](docs/product/wireframes/README.md#brechas-y-discrepancias).

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Modelo de datos | sin versionar, nivel diseñado | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Catálogo de métricas | 12 métricas, nivel diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Wireframes | 10 pantallas, nivel diseñado | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Todo es **documental**, nivel del proyecto **diseñado**. No hay código, pruebas, build ni CI.

| Afirmación | Nivel | Evidencia del 2026-09-12 |
|---|---|---|
| Los 10 wireframes existen con variantes de escritorio y móvil | documental | 11 archivos en `docs/product/wireframes/` (10 más el índice) `confirmado` |
| Los enlaces internos resuelven | documental | Verificador sobre todos los `.md`: 0 rotos `confirmado` |
| Solo se tocaron archivos autorizados por el brief | documental | `git status` contra la lista cerrada del [brief-1.1](docs/decisions/brief-1.1-wireframes-baja-fidelidad.md) `confirmado` |
| Los wireframes no muestran datos prohibidos | documental | Recorrido de invariantes por pantalla y `grep` de términos prohibidos, autoevaluación `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001, 0002, 0003, 0005, 0006, 0007, 0008 y 0009 aceptados. `confirmado`
- Resoluciones de la 1.3 en [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md); W-1 y W-2 en [brief-1.1](docs/decisions/brief-1.1-wireframes-baja-fidelidad.md). `confirmado`

### Pendientes

- **Brechas B-1 a B-11**, a resolver en la 1.2. Las de más impacto: B-9 (cómo se elige la organización activa, sin pantalla definida), B-5 (estado activo global en vez de por organización) y B-6 (contraseña inicial de un solo uso sin soporte en el modelo). `confirmado`
- [ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) en **propuesta** hasta la 2.2. `confirmado`
- Retención de mensajes → Fase 9. Sesión → 3.2. Secretos → 9.1. Backups → 9.2. Personas → Fase 9. Índice en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **Repositorio remoto**: [benjamurilloo/AI-WhatsApp-Agent-CRM](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM), privado, creado el 2026-09-12. Sin CI: GitHub Actions se configura en la Fase 2 ([ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)). `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo.
- [product/wireframes/README.md](docs/product/wireframes/README.md), brechas B-1 a B-11.
- [architecture/DataModel.md](docs/architecture/DataModel.md) y [product/FunctionalRequirements.md](docs/product/FunctionalRequirements.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md), criterios de salida de la Fase 1.
- [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md), plantilla de brief.

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** La aprobación del cierre de la 1.1 quedó consumida en el changelog, Notion y el hub. Commit y push necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

Nada.
