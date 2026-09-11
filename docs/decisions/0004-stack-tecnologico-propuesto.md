# 0004 — Stack tecnológico

- Estado: propuesta (pasa a aceptada cuando se re-verifiquen las versiones al iniciar la Fase 2)
- Fecha: 2026-09-11

## Contexto

Las tareas de fundación técnica necesitan un stack concreto. El usuario propuso como hipótesis TypeScript, un full-stack tipo Next.js, PostgreSQL, un ORM o query builder con migraciones SQL versionadas, sesiones seguras y pruebas en tres niveles. Las versiones cambian con el tiempo y no deben fijarse solo de memoria.

## Decisión

TypeScript, Node.js LTS activo, Next.js, PostgreSQL, Drizzle ORM con migraciones SQL generadas y versionadas, Vitest y Playwright. Las versiones verificadas en septiembre de 2026 y sus fuentes están en [development/EngineeringStandards.md](../development/EngineeringStandards.md).

## Alternativas descartadas

- Prisma en lugar de Drizzle: tooling de migración más integrado, pero con un paso de generación de cliente y mayor footprint. Sigue siendo una alternativa válida si se prefiere al iniciar la Fase 2.
- Autenticación como servicio de terceros: suma una dependencia externa y datos de usuarios fuera de la base propia. Se reconsidera solo con un ADR nuevo.

## Consecuencias

- Antes de instalar cualquier dependencia, la Fase 2 re-verifica las versiones contra fuentes oficiales y actualiza este ADR.
- El mecanismo de sesión concreto se decide en la Fase 3 y se registra como ADR propio.
