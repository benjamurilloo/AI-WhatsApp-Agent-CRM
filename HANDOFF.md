---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-12
git_ref: main — cec1fc2 más los cambios de cierre de la 1.3, sin commitear al escribir este archivo
active_phase: Fase 1 — Diseño UX y validación del modelo
active_task: 1.1 — Wireframes de baja fidelidad (sin brief todavía)
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase activa**: Fase 1 — Diseño UX y validación del modelo. En Notion figura "En progreso". `confirmado`
- **Subfase activa**: 1.1 — Wireframes de baja fidelidad de las 10 pantallas. Sin brief todavía. `confirmado`
- **Orden de ejecución de la Fase 1**: 1.3 → 1.1 → 1.2, registrado en [Roadmap.md](docs/planning/Roadmap.md). `confirmado`

## 2. Último punto aprobado

- **Subfase 1.3 cerrada el 2026-09-12** con aprobación del usuario. Hay entrada en [CHANGELOG.md](CHANGELOG.md) y la tarea figura "Completado" en Notion. `confirmado`
- En el cierre el usuario confirmó que D-1 (enmascarado para `viewer`) también se aplica al detalle del cliente (pantalla 7). `confirmado`
- Cambios del cierre: entrada en el changelog; corrección de "dos commits" a "tres" en la entrada de la Fase 0, con nota de corrección; Roadmap con el orden de ejecución y sin la línea de estado caducada; adendas a [MetricsCatalog.md](docs/analytics/MetricsCatalog.md) y [TestingStrategy.md](docs/development/TestingStrategy.md). `confirmado`

## 3. Próximo paso

1. Commit de los cambios del cierre de la 1.3, si el usuario lo autoriza.
2. Crear el repositorio remoto (GitHub privado, [ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)) y hacer el primer push, si el usuario lo autoriza.
3. Preparar `docs/decisions/brief-1.1-*.md` y pedir su aprobación antes de dibujar.

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Modelo de datos | sin versionar, nivel diseñado | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Catálogo de métricas | 12 métricas, nivel diseñado | [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Todo es **documental**, nivel del proyecto **diseñado**. No hay código, pruebas, build ni CI.

| Afirmación | Nivel | Evidencia del 2026-09-12 |
|---|---|---|
| La 1.3 está cerrada | documental | Entrada en `CHANGELOG.md` y estado "Completado" en Notion `confirmado` |
| Los enlaces internos resuelven | documental | Verificador sobre los `.md` versionados: 0 rotos `confirmado` |
| No quedan líneas de estado caducadas conocidas | documental | `grep` de "dos commits" y "en curso y ninguna": solo aparecen en las notas de corrección `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001, 0002, 0003, 0005, 0006, 0007, 0008 y 0009 aceptados. `confirmado`
- Las 9 resoluciones de la 1.3 están en [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md). `confirmado`

### Pendientes

- [ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) en **propuesta** hasta la 2.2. `confirmado`
- Retención de mensajes → Fase 9. Sesión → 3.2. Secretos → 9.1. Backups → 9.2. Personas → Fase 9. Índice en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **Sin repositorio remoto** mientras no se autorice crearlo. Bloquea la apertura de la Fase 2, no la Fase 1. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo.
- [product/Screens.md](docs/product/Screens.md), las 10 pantallas.
- [architecture/DataModel.md](docs/architecture/DataModel.md), para que cada dato dibujado exista en el modelo.
- [planning/Roadmap.md](docs/planning/Roadmap.md), Fase 1.
- [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md), plantilla de brief.

## 9. Cambios ajenos del usuario detectados

Ninguno. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** Las del 2026-09-12 (cierre de la 1.3, correcciones y adendas, estado en Notion) quedaron consumidas en ese cierre. Commit, push y creación del remoto necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

Nada.
