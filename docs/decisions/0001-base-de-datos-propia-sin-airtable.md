# 0001 — Base de datos propia, sin dependencia de Airtable

- Estado: aceptada (principio fijado por el usuario en la instrucción inicial, 2026-09-11)
- Fecha: 2026-09-11

## Contexto

El negocio opera hoy con Airtable como persistencia de su automatización conversacional. La experiencia del equipo con Airtable dejó limitaciones concretas para un sistema de registro: no hay garantía documentada de unicidad efectiva ni de atomicidad en upserts concurrentes, no hay integridad referencial real y el modelo queda acoplado a una herramienta colaborativa de hojas de cálculo.

## Decisión

El CRM tiene su propia base de datos PostgreSQL y es dueño de sus datos. En ninguna forma incluye SDK de Airtable, adaptadores, IDs de bases o tablas, variables de entorno de Airtable, sincronización, dual-write ni consultas en tiempo real a Airtable.

## Alternativas descartadas

- Mantener Airtable como backend y construir solo una capa de presentación encima: no resuelve las garantías de integridad, unicidad y transacciones que motivan el proyecto.
- Dual-write temporal CRM + Airtable durante el desarrollo: acopla el MVP al sistema legado antes de validarlo y crea dos fuentes de verdad.

## Consecuencias

- Modelado, migraciones y seeds propios desde cero.
- Control total sobre integridad referencial, transacciones e idempotencia, expresadas como constraints de base.
- Los datos históricos solo llegan al CRM mediante el proyecto futuro de migración ([0003](0003-migracion-legado-proyecto-separado.md)).
