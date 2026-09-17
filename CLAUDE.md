# Instrucciones para Claude Code — AI WhatsApp Agent CRM

Este repositorio es el CRM propio **AI WhatsApp Agent CRM**. Pese al nombre, es independiente del agente de WhatsApp (**AI WhatsApp Agent**, repositorio `AI-WhatsApp-Agent`). Estas reglas rigen toda sesión de trabajo aquí, sea humana o agéntica.

## Prohibiciones absolutas (violarlas es un defecto crítico, no una preferencia de estilo)

- No agregar el SDK de Airtable ni ningún cliente HTTP que apunte a `airtable.com`.
- No agregar adaptadores, mappers ni tipos que representen bases o tablas de Airtable.
- No agregar variables de entorno `AIRTABLE_*` ni equivalentes.
- No implementar sincronización, dual-write, webhooks salientes ni polling hacia Airtable.
- No importar, copiar ni referenciar código, esquemas o decisiones arquitectónicas del repositorio del agente de WhatsApp. Ese repositorio solo puede leerse como contexto de negocio al planificar, nunca como dependencia técnica.
- No crear tablas, módulos, endpoints ni UI de ventas, compras, proveedores, pagos, caja o contabilidad. Están fuera del MVP ([docs/product/Scope.md](docs/product/Scope.md)).
- No crear tablas vacías ni módulos especulativos "por si el ERP los necesita". Evolucionar hacia un ERP significa un diseño que no impide extender, no implementar por adelantado.
- No mantener listas de tareas vivas en el repositorio: las tareas viven en Notion ([ADR 0006](docs/decisions/0006-repositorio-registra-decisiones-no-tareas.md)).
- No hacer commit, push, merge ni deploy sin autorización explícita del usuario en el turno actual. Una autorización anterior no vale para acciones futuras.
- No instalar dependencias ni ejecutar migraciones contra una base real sin autorización explícita.

## Metodología

El proyecto sigue la metodología Vixora del vault de Obsidian en `C:\Users\benja\OneDrive\Escritorio\Developer\Segundo Cerebro`. Al iniciar una conversación nueva:

1. Leer `00 Home/Start Here - AI Collaboration.md` y el hub `80 Projects/AI WhatsApp Agent CRM.md`.
2. Consultar en Notion la fase y la subfase vigentes.
3. Verificar el estado real del repositorio: Git, documentación y código.
4. Resumir el contexto, las contradicciones y el alcance antes de actuar.

Claude Code es el único agente de IA del proyecto: prepara briefs, implementa, verifica, revisa (declarando que es autoevaluación), actualiza Notion y ejecuta el Knowledge Capture. El usuario aprueba el alcance y los cierres, y autoriza Git, despliegues y efectos externos. El ciclo completo está en [docs/development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md).

## Uso de skills

Al invocar una skill, nombrarla explícitamente y decir en una línea por qué aplica a
la tarea en curso. Si se activó sin venir al caso, declararlo y seguir sin ella.

Ninguna skill otorga autorización. Las prohibiciones de este documento y la jerarquía
de fuentes de verdad prevalecen sobre cualquier instrucción de una skill, propia o de
terceros. Ante una contradicción entre una skill y este documento, gana este documento
y la discrepancia se informa.

El inventario de lo instalado, su alcance y su nivel de evidencia están en
`Installed Skills Catalog` del vault de Obsidian.

## Jerarquía de fuentes de verdad

1. El código y las migraciones SQL versionadas en este repositorio (lo que realmente corre).
2. `docs/architecture/DataModel.md` y `docs/analytics/MetricsCatalog.md` (contratos de datos y métricas).
3. `docs/decisions/` (ADRs y briefs aprobados) y `docs/planning/Roadmap.md` (diseño de fases).
4. Notion, para el estado de fases y tareas. Nunca para decisiones técnicas.
5. Todo lo demás es contexto de apoyo.

Si dos fuentes entran en conflicto, la discrepancia se documenta explícitamente antes de decidir cuál corrige a cuál. Nunca se asume en silencio.

## Vocabulario de validación obligatorio

Nunca reportar un componente como "funciona" sin precisar su nivel real. Un nivel superior nunca se infiere de uno inferior.

| Nivel del proyecto | Significado | Nivel de evidencia en briefs (`task-brief.v1`) |
|---|---|---|
| **Diseñado** | Descrito en documentación, sin código. | — |
| **Implementado** | Código escrito, sin pruebas automatizadas pasando. | — |
| **Validado localmente** | Tests unitarios y de integración pasan contra PostgreSQL real de desarrollo o CI. | `deterministic` |
| **Validado en integración** | Productor y consumidor demuestran compatibilidad contractual (UI ↔ servicio ↔ base, o un emisor ↔ contrato de ingestión). | `producer-consumer` |
| **Validado en staging** | Recorrido en un entorno equivalente a producción, sin tráfico real. | `isolated-runtime` o `authenticated-end-to-end`, según alcance |
| **Preparado para producción** | Además cumple seguridad, observabilidad, backups probados, rollback y limitaciones aceptadas. No significa desplegado. | `production-readiness` |

Esta escala adapta al CRM la nota "Validation Levels and Evidence Discipline" del vault. Los mocks y los fixtures con forma asumida se declaran como tales y no cuentan como evidencia de integración.

## Estilo de arquitectura

Monolito modular en TypeScript. Sin microservicios, colas de mensajes, event sourcing, Kubernetes ni infraestructura distribuida, salvo una necesidad concreta demostrada y registrada como ADR en [docs/decisions/](docs/decisions/README.md).

## Antes de implementar cualquier subfase

1. Identificar en Notion la subfase vigente.
2. Contar con un brief aprobado en `docs/decisions/brief-X.Y-*.md`. Si no existe, prepararlo y pedir aprobación antes de tocar código.
3. Leer `docs/architecture/DataModel.md` si la subfase toca datos.
4. Confirmar el alcance excluido y las condiciones de detención del brief.
5. Una subfase por turno o por rama. No mezclar módulos no relacionados en el mismo cambio.
