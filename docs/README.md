# Documentación — AI WhatsApp Agent CRM

Este repositorio es la fuente técnica de verdad del proyecto: diseño, contratos de datos, decisiones y, más adelante, código y migraciones. Pese al nombre, es independiente del agente de WhatsApp ([architecture/IntegrationBoundaries.md](architecture/IntegrationBoundaries.md)).

## Estado actual

**La fase y la subfase vigentes, con su estado verificado, están en [HANDOFF.md](../HANDOFF.md).** La fundación técnica (Fase 2) está **validada localmente y en CI**. Con las Fases 3 y 4 cerradas existen los módulos `auth`, `organizations`, `audit`, `catalog` e `inventory`, con sus tablas; la Fase 5, cerrada, sumó `crm` con la tabla `clients` (5.1) y su servicio (5.2), **validados localmente y en CI**, con el teléfono enmascarado para `viewer`. La autenticación, la autorización, la auditoría, el servicio de catálogo, el ajuste de stock (secuencial y bajo concurrencia) y el historial de movimientos están **validados localmente y en CI**. Las pantallas 1 (ingreso), 3 (productos), 4 (detalle de producto), 5 (ajuste e historial), 6 (clientes), 7 (detalle de cliente) y 10 (usuarios y roles) están **validadas en integración**, en modo claro y oscuro. La Fase 6 (conversaciones e ingestión) está en curso: la 6.1 sumó los módulos `conversations` e `ingestion`, solo con sus tablas (`conversations`, `messages` e `ingestion_events`), **validadas localmente y en CI**, la 6.2 sus seeds sintéticos (de ejemplo y de volumen) y la 6.3 el servicio de consulta y cambio de estado, con la lista de clientes por última interacción, también **validados localmente y en CI**. Sus pantallas y la ingestión, y las métricas, siguen en nivel **diseñado**. Nada está desplegado ni conectado a datos reales. El seguimiento de fases y tareas vive en el [proyecto de Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c).

## Índice

### Producto
- [Vision.md](product/Vision.md): por qué existe el proyecto y qué problema resuelve.
- [Scope.md](product/Scope.md): qué entra en el MVP y qué queda explícitamente fuera.
- [Personas.md](product/Personas.md): para quién se construye.
- [FunctionalRequirements.md](product/FunctionalRequirements.md): requisitos funcionales verificables.
- [NonFunctionalRequirements.md](product/NonFunctionalRequirements.md): rendimiento, seguridad, privacidad y auditabilidad.
- [Screens.md](product/Screens.md): especificación de las 10 pantallas del MVP.

### Arquitectura
- [Overview.md](architecture/Overview.md): módulos, dependencias, errores, observabilidad y despliegue.
- [DataModel.md](architecture/DataModel.md): modelo de datos, ERD, reglas de inventario y ledger de ingestión.
- [SecurityModel.md](architecture/SecurityModel.md): autenticación, autorización y amenazas.
- [IntegrationBoundaries.md](architecture/IntegrationBoundaries.md): qué no se integra hoy y cómo se integraría mañana.
- [TraceabilityMatrix.md](architecture/TraceabilityMatrix.md): pantalla ↔ requisito ↔ tabla ↔ índice ↔ métrica.
- [RepositoryStructure.md](architecture/RepositoryStructure.md): carpetas, módulos, frontera entre módulos y qué subfase crea cada parte.

### Analítica
- [MetricsCatalog.md](analytics/MetricsCatalog.md): definición exacta y auditable de cada métrica de WhatsApp.

### Desarrollo
- [EngineeringStandards.md](development/EngineeringStandards.md): stack, convenciones y calidad.
- [TestingStrategy.md](development/TestingStrategy.md): qué se prueba y cómo.
- [Environments.md](development/Environments.md): desarrollo, test, staging y producción.
- [ExecutionProtocol.md](development/ExecutionProtocol.md): ciclo por subfase con Claude Code, brief y cierre.

### Planificación
- [Roadmap.md](planning/Roadmap.md): diseño de fases, gates, camino crítico y Definición de Terminado.
- [Risks.md](planning/Risks.md): riesgos y preguntas abiertas.

### Decisiones
- [decisions/README.md](decisions/README.md): ADRs, briefs y cierres.

## Cómo se organiza el trabajo

| Sistema | Responde | Contiene |
|---|---|---|
| [Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c) | ¿Qué falta hacer? | Fases como subproyectos, subfases `X.Y` como tareas, y su estado |
| Este repositorio | ¿Por qué quedó así y qué se certificó? | Diseño, contratos, ADRs, briefs, cierres y `CHANGELOG.md` |
| Obsidian (vault "Segundo Cerebro") | ¿Qué sabemos y cómo trabajamos? | Metodología, patrones y el hub `80 Projects/AI WhatsApp Agent CRM` |

- Claude Code ejecuta el ciclo completo, del contexto al cierre, según [ExecutionProtocol.md](development/ExecutionProtocol.md).
- Cada cierre de fase o subfase agrega una entrada a [CHANGELOG.md](../CHANGELOG.md) con lo que certifica y lo que no.
- Cada fase termina sobrescribiendo [HANDOFF.md](../HANDOFF.md) con su estado verificado, y la siguiente empieza en una sesión nueva leyéndolo.
- No se avanza de fase sin cumplir el gate de salida de la anterior.
