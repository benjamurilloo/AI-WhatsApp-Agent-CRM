# 0003 — Migración del sistema legado como proyecto futuro separado

- Estado: aceptada (principio fijado por el usuario en la instrucción inicial, 2026-09-11). **Reemplazada parcialmente por el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) el 2026-09-23**: la migración deja de ser un proyecto independiente y pasa a ser la última fase de integración de este repositorio. El resto de este ADR sigue vigente; ver §Nota del 2026-09-23.
- Fecha: 2026-09-11

## Contexto

Migrar datos reales antes de validar el CRM obligaría a construir sobre un modelo no probado y a acoplar el ritmo del MVP a la disponibilidad y al formato del sistema legado.

## Decisión

La migración y el cutover desde el sistema legado se planifican y ejecutan como un proyecto independiente. Solo empieza cuando el MVP pasó su evaluación (Fase 10) con la decisión explícita de continuar. No es parte del MVP ni una dependencia de su arquitectura.

## Alternativas descartadas

- Migración incremental en paralelo al desarrollo: introduce datos reales y dependencia del legado antes de tener un modelo validado.
- Diseñar el schema del CRM a partir del modelo físico del legado: reproduciría sus limitaciones en vez de modelar el dominio.

## Consecuencias

- El MVP se desarrolla y valida solo con datos sintéticos.
- El proyecto de migración define su propio backlog, su mecanismo de carga (el contrato de ingestión u otro) y su estrategia de cutover cuando comience.
- El contrato de ingestión se diseña sin asumir el formato de ningún emisor concreto.

## Nota del 2026-09-23

Este ADR no se reescribe. El [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) reemplaza **una parte** de él:

- **Deja de regir**: que la migración y el cutover sean «un proyecto independiente» con «su propio backlog». Pasan a ser la última fase de integración de este repositorio, en el mismo Notion y con los mismos gates.
- **Sigue vigente, y se está cumpliendo en la Fase 10**: «solo empieza cuando el MVP pasó su evaluación (Fase 10) con la decisión explícita de continuar». La evaluación ya se hizo en la [subfase 10.1](evaluacion-10.1-mvp.md); la decisión explícita todavía no, y se registra al cerrar la 10.3.
- **Sigue vigente**: no migrar datos reales antes de un modelo validado, no diseñar el esquema desde el modelo físico del legado, y un contrato de ingestión que no asume el formato de ningún emisor. El mecanismo de carga se sigue decidiendo al empezar la migración; lo que el 0014 fija es la fuente, **CSV exportado**, nunca la API de Airtable.
