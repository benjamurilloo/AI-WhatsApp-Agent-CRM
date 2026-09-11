# Estándares de Ingeniería

**Estado: diseñado.** Recomendación de stack basada en verificación de versiones actuales (septiembre 2026), no solo en conocimiento histórico del modelo. Fuentes citadas al final.

## Stack recomendado

| Capa | Elección | Versión de referencia verificada (sep. 2026) | Alternativa considerada |
|---|---|---|---|
| Lenguaje | TypeScript | — | — |
| Runtime | Node.js | LTS activo: Node 24 (Node 22 en mantenimiento; Node 26 entra a LTS en oct. 2026) | usar el LTS activo vigente al iniciar Fase 2, re-verificar en ese momento |
| Framework full-stack | Next.js | 16.3.x (última estable) | Remix/otro — descartado por no aportar ventaja concreta sobre el monolito modular buscado |
| Base de datos | PostgreSQL | 18.x estable (19 en beta) | ninguna — requisito explícito del usuario |
| ORM / query builder | Drizzle ORM | 0.45.x estable (1.0 en beta) | Prisma — descartado como default por preferir SQL-shaped queries, tipado nativo TS sin paso de generación, y footprint menor; Prisma es aceptable si el equipo prefiere su tooling de migración más integrado (decisión abierta, ver ADR) |
| Migraciones | SQL versionado (Drizzle Kit generando SQL explícito) | — | — |
| Autenticación | Sesiones server-side propias o librería de sesiones madura para el framework elegido | a confirmar en Fase 3 | Auth-as-a-service de terceros — descartado por defecto para minimizar dependencias externas, salvo que se decida lo contrario con ADR |
| Tests unitarios/integración | Vitest | — | Jest — Vitest preferido por integración nativa con TS/ESM y velocidad |
| Tests end-to-end | Playwright | — | Cypress |
| Contenedores | Docker + Docker Compose (solo para Postgres local y entorno reproducible) | — | — |

**Nota de proceso**: estas versiones deben re-verificarse contra la documentación oficial en el momento real de bootstrap del proyecto (inicio de Fase 2), no asumirse congeladas desde esta planificación. Cualquier cambio de versión mayor respecto a lo aquí anotado se registra como actualización de este documento, no como decisión silenciosa.

## Convenciones de código

- Un módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`, `analytics`, `auth`, `organizations`, `ingestion`, `audit`) = una carpeta con su propio `service`, `repository` y tipos; sin acceso cruzado salvo lo documentado en [architecture/Overview.md](../architecture/Overview.md).
- Lint + formateo automatizado (ESLint + Prettier, o Biome como alternativa a evaluar en Fase 2) obligatorios en CI, sin excepciones por archivo salvo justificación explícita.
- Typecheck estricto (`strict: true` en `tsconfig.json`) desde el primer commit.
- Sin `any` implícito ni explícito salvo en límites de librería externa sin tipos, documentado con comentario.

## Control de versiones

- Un commit representa un cambio coherente y completo, no un checkpoint intermedio.
- Mensajes de commit en modo imperativo, explicando el porqué cuando no sea obvio del diff.
- Ninguna rama se mergea sin pasar lint, typecheck, tests y build en CI.
- No se hace commit, push ni merge sin autorización explícita del usuario en el turno actual (ver [CLAUDE.md](../../CLAUDE.md)).

## CI

Pipeline mínimo por PR: instalar dependencias → lint → typecheck → tests unitarios/integración → build. Tests end-to-end corren contra un entorno efímero con base de datos de test y seeds sintéticos, no contra staging compartido.

## Fuentes consultadas (septiembre 2026)

- [Next.js 16.3](https://nextjs.org/blog/next-16-3) y [Next.js Support Policy](https://nextjs.org/support-policy)
- [Node.js Releases](https://nodejs.org/en/about/previous-releases) y [Node.js | endoflife.date](https://endoflife.date/nodejs)
- [PostgreSQL: Release Notes](https://www.postgresql.org/docs/release/)
- Comparativa Drizzle vs Prisma 2026: [Bytebase](https://www.bytebase.com/blog/drizzle-vs-prisma/), [Encore](https://encore.dev/articles/drizzle-vs-prisma)
