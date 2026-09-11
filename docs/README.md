# Documentación — AI WhatsApp Agent CRM

Este repositorio es la fuente técnica de verdad del proyecto: diseño, contratos de datos, decisiones y, más adelante, código y migraciones. Pese al nombre, es independiente del agente de WhatsApp ([architecture/IntegrationBoundaries.md](architecture/IntegrationBoundaries.md)).

## Estado actual

**Fase 0 (Descubrimiento, alcance y decisiones) en curso.** Todo lo que describe `docs/` está en nivel **diseñado**. Nada está implementado, desplegado ni conectado a datos reales. El estado de fases y tareas vive en Notion, cuyo proyecto está pendiente de creación.

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
- [Backlog.md](planning/Backlog.md): **semilla temporal** para cargar Notion. Se retira al verificar la carga.

### Decisiones
- [decisions/README.md](decisions/README.md): ADRs, briefs y cierres.

## Cómo se organiza el trabajo

| Sistema | Responde | Contiene |
|---|---|---|
| Notion | ¿Qué falta hacer? | Fases y subfases `X.Y` como proyectos, tareas y estado |
| Este repositorio | ¿Por qué quedó así y qué se certificó? | Diseño, contratos, ADRs, briefs, cierres y `CHANGELOG.md` |
| Obsidian (vault "Segundo Cerebro") | ¿Qué sabemos y cómo trabajamos? | Metodología, patrones y el hub `80 Projects/AI WhatsApp Agent CRM` |

- Claude Code ejecuta el ciclo completo, del contexto al cierre, según [ExecutionProtocol.md](development/ExecutionProtocol.md).
- Cada cierre de fase o subfase agrega una entrada a `CHANGELOG.md` con lo que certifica y lo que no. El archivo se crea al cerrar la Fase 0.
- No se avanza de fase sin cumplir el gate de salida de la anterior.
