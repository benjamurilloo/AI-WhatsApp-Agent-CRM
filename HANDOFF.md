---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-12
git_ref: main — commit "Resolver las decisiones de producto (1.3) y escribir el handoff", sucesor de cf13247
active_phase: Fase 1 — Diseño UX y validación del modelo
active_task: 1.3 — Decisiones de producto pendientes (commiteada, no cerrada)
confidence: mixto
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase activa**: Fase 1 — Diseño UX y validación del modelo. `confirmado` (contra [Roadmap.md](docs/planning/Roadmap.md))
- **Subfase activa**: 1.3 — Decisiones de producto pendientes. Ejecutada, verificada y commiteada; **no cerrada**: sin entrada en `CHANGELOG.md` y sin actualización de estado en Notion. `confirmado`
- **Orden de ejecución alterado**: la 1.3 se ejecutó antes que la 1.1 y la 1.2, porque seis de sus nueve decisiones determinan qué hay que dibujar en los wireframes. El [Roadmap.md](docs/planning/Roadmap.md) todavía enumera las subfases como "1.1 · 1.2 · 1.3" y no registra la inversión. `confirmado`

## 2. Último punto aprobado

- **Fase 0 cerrada el 2026-09-11**, autorizada por el usuario. Entrada en [CHANGELOG.md](CHANGELOG.md), commit `cf13247`. `confirmado`
- **Las nueve decisiones de la 1.3 fueron resueltas por el usuario el 2026-09-11**, todas coincidiendo con la recomendación presentada. Registradas en la sección "Resolución" de [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md). `confirmado`
- **No hay aprobación para cerrar la 1.3.** Resolver las decisiones no es aprobar el cierre de la subfase, y autorizar el commit (2026-09-12) tampoco. `confirmado`

## 3. Próximo paso

En este orden:

1. Que el usuario apruebe (o no) el cierre de la 1.3. El commit ya está hecho.
2. Cerrar la 1.3: entrada en `CHANGELOG.md` con *Certifica* / *No certifica*, y estado en Notion.
3. Recién entonces, la **1.1 — Wireframes de baja fidelidad de las 10 pantallas** de [Screens.md](docs/product/Screens.md), que ya tiene resueltas todas sus dependencias de decisión.

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

Todas las afirmaciones de la 1.3 son **documentales**. No hay código, así que no aplica ninguno de los niveles ejecutables (`deterministic`, `isolated-runtime`, `producer-consumer`, `controlled-real-effect`, `authenticated-end-to-end`, `production-readiness`). Nivel del proyecto: **diseñado**.

| Afirmación | Nivel | Evidencia re-verificada el 2026-09-12 |
|---|---|---|
| Las 9 decisiones tienen resolución con fecha | documental | Tabla "Resolución" en [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md) `confirmado` |
| No quedan marcas "pendiente de confirmación" ni "Decisión propuesta" en `docs/` | documental | `grep` sobre `docs/`: única coincidencia es el texto del propio AC-3 en el brief `confirmado` |
| Los enlaces internos resuelven | documental | Verificador de enlaces sobre todos los `.md`: 0 rotos `confirmado` |
| No hay secretos ni archivos temporales | documental | `find` de `.env*`, `*.tmp`, `*.bak`, `*.log`, `node_modules`: sin resultados `confirmado` |
| Los archivos tocados están dentro del alcance autorizado | documental | `git status` antes del commit: 5 modificados + 4 nuevos de la 1.3, este handoff, y la corrección de las cuatro líneas de estado de `README.md` y `docs/README.md`, autorizada aparte `confirmado` |

**Nada fue probado ejecutando nada.** No hay suite de pruebas, ni build, ni CI: no existen todavía.

## 6. Decisiones

### Vigentes

- ADRs [0001](docs/decisions/0001-base-de-datos-propia-sin-airtable.md), [0002](docs/decisions/0002-monolito-modular.md), [0003](docs/decisions/0003-migracion-legado-proyecto-separado.md), [0005](docs/decisions/0005-metricas-desde-datos-transaccionales.md), [0006](docs/decisions/0006-repositorio-registra-decisiones-no-tareas.md): aceptadas. `confirmado`
- ADRs [0007](docs/decisions/0007-identificador-de-cliente-solo-telefono.md), [0008](docs/decisions/0008-stock-nunca-negativo.md), [0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md): aceptados el 2026-09-11 en la 1.3 y commiteados el 2026-09-12. `confirmado`
- Las 9 resoluciones de la 1.3, propagadas a Screens, FunctionalRequirements, DataModel y Risks. `confirmado`

### Pendientes

- [ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) sigue en **propuesta**: las versiones se re-verifican en la subfase 2.2. `confirmado`
- Retención de mensajes → Fase 9. Mecanismo de sesión → 3.2. Gestión de secretos → 9.1. Backups → 9.2. Validación de personas → Fase 9. Índice completo con fase límite en [Risks.md](docs/planning/Risks.md). `confirmado`

## 7. Limitaciones y bloqueos

- **No hay repositorio remoto.** Los 4 commits existen solo en el disco del usuario. El [ADR 0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md) decide GitHub privado con Actions, pero **decidir no es crear**: hace falta autorización explícita, y debe ocurrir antes de abrir la Fase 2, cuyo criterio de salida es "CI en verde". `confirmado`
- **Notion no fue verificable en la sesión que escribió este handoff**: el conector estaba desconectado. La última lectura (2026-09-11) mostraba la tarea 1.3 en "Bandeja de Entrada" y la Fase 1 en "No comenzado", lo que **ya no coincide** con el estado real del repositorio. `historico`
- **Un solo agente planifica, implementa y revisa.** Toda revisión de este proyecto es autoevaluación, nunca revisión independiente. `confirmado`

## 8. Rutas necesarias para continuar

Mínimo indispensable para la 1.1, sin abrir el repositorio entero:

- [CLAUDE.md](CLAUDE.md) — prohibiciones y vocabulario de validación.
- Este archivo.
- [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md) — qué se decidió y por qué.
- [product/Screens.md](docs/product/Screens.md) — las 10 pantallas, ya actualizadas con D-1, D-2 y D-3.
- [architecture/DataModel.md](docs/architecture/DataModel.md) — para que cada dato dibujado exista en el modelo.
- [planning/Roadmap.md](docs/planning/Roadmap.md) — Fase 1, gates y criterios.
- [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) — ciclo y plantilla de brief.

## 9. Cambios ajenos del usuario detectados

Ninguno. Todo lo commiteado es de la subfase 1.3, de este handoff o de la corrección de estado autorizada. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** En particular, y de forma explícita:

- No hay autorización para commit, push, merge ni deploy. La autorización de commit del 2026-09-12 se consumió en el commit que contiene este archivo y no se traslada.
- No hay autorización para crear el repositorio remoto ni para hacer el primer push, pese a que el ADR 0009 fija el proveedor.
- No hay autorización para instalar dependencias ni para iniciar la Fase 2.

Las autorizaciones otorgadas en la Fase 0 no se trasladan.

## 11. Aspectos pendientes de confirmar

Antes de actuar, la próxima sesión debe resolver con el usuario:

1. ~~Cuatro líneas de estado desactualizadas en `README.md` y `docs/README.md`~~ — **corregidas el 2026-09-12** con autorización del usuario. Ya no afirman la fase vigente: remiten a este archivo, para que no vuelvan a caducar. `confirmado`
2. **La entrada de la Fase 0 en `CHANGELOG.md` dice "los dos commits" en dos lugares**, cuando al cerrarla eran tres (`a3b45da`, `8b7bfa3`, `cf13247`). Un changelog es registro histórico y no se reescribe a la ligera: la corrección la decide el usuario.
3. **[Roadmap.md](docs/planning/Roadmap.md) tiene dos problemas, a resolver en el mismo cambio:**
   - No registra que la 1.3 se ejecutó antes que la 1.1 y la 1.2. Sin eso, la próxima sesión puede asumir el orden numérico.
   - Su línea 3 dice "La Fase 0 está en curso y ninguna otra fase empezó". Es una quinta línea de estado caducada, encontrada por `grep` al verificar la corrección de las otras cuatro. No se corrigió porque la autorización cubría solo esas cuatro. `confirmado`
4. **La extensión de D-1 al detalle del cliente (pantalla 7) fue una interpretación del agente, no una respuesta del usuario.** Está declarada como tal en el brief. Si el usuario quería que el `viewer` viera el teléfono completo en el detalle, hay que revertirla.
5. **Dos archivos necesitan una adenda** que quedó fuera del alcance autorizado: [analytics/MetricsCatalog.md](docs/analytics/MetricsCatalog.md) (nombrar la zona horaria por defecto) y [development/TestingStrategy.md](docs/development/TestingStrategy.md) (caso del stock negativo rechazado sin movimiento registrado, y cálculo de métricas cruzando cambio de horario). Ninguno contradice lo resuelto.
