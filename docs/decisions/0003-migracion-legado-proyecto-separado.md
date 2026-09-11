# 0003 — Migración del sistema legado como proyecto futuro separado

- Estado: aceptada (principio fijado por el usuario en la instrucción inicial, 2026-09-11)
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
