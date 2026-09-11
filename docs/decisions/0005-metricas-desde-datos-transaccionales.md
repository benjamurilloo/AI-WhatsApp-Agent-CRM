# 0005 — Métricas calculadas desde datos transaccionales, sin tabla de agregados

- Estado: aceptada (aprobada por el usuario al cerrar la Fase 0, 2026-09-11)
- Fecha: 2026-09-11

## Contexto

Las métricas de WhatsApp pueden vivir en una tabla de agregados o calcularse por consulta sobre `conversations`, `messages` e `ingestion_events`. Se exige que sean exactas, auditables y reconstruibles.

## Decisión

En el MVP, todas las métricas de [analytics/MetricsCatalog.md](../analytics/MetricsCatalog.md) se calculan por consulta directa sobre los datos transaccionales. No existe tabla de métricas ni snapshots.

## Alternativas descartadas

- Tabla diaria de métricas precalculadas: con el volumen del MVP no hace falta, y se convertiría en una segunda fuente de verdad que habría que reconciliar.

## Consecuencias

- Una métrica siempre es reconstruible y no puede desincronizarse de su fuente.
- Si en staging el volumen degrada el dashboard con evidencia medida, se evalúa un snapshot idempotente, recalculable por día desde la fuente y nunca editable a mano, registrado en un ADR nuevo.
