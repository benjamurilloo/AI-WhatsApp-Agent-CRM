# Estándares de Ingeniería

**Estado: diseñado.** Stack re-verificado contra fuentes oficiales y el registro npm el 2026-09-12, en la subfase 2.2 ([brief-2.2](../decisions/brief-2.2-re-verificacion-del-stack.md), [ADR 0004](../decisions/0004-stack-tecnologico-propuesto.md)). Elegir una versión no la valida: nada está instalado todavía.

## Stack

| Capa | Elección | Versión fijada (verificada 2026-09-12) | Alternativa considerada |
|---|---|---|---|
| Lenguaje | TypeScript | 6.0.3 | TypeScript 7.0.2: descartado por ahora porque no trae API programática y `typescript-eslint` exige `<6.1.0`. Se reevalúa con TypeScript 7.1 |
| Runtime | Node.js | 24 LTS (Active LTS; mantenimiento desde 2026-10-20; EOL 2028-04-30) | Node 26: Current, entra a LTS el 2026-10-28. Se reevalúa entonces |
| Gestor de paquetes | npm | 11.x, el incluido con Node 24; lockfile `package-lock.json` e instalación con `npm ci` en CI | pnpm 12: dependencias más estrictas, pero suma una herramienta y Corepack no viene con Node desde la 25 |
| Framework full-stack | Next.js | 16.3.x (16.3.5; 16.x en Active LTS; Node `>=20.9.0`) | Remix u otro: sin ventaja concreta sobre el monolito modular buscado |
| UI | React | 19.3.x | — |
| Base de datos | PostgreSQL | 18 (18.6; soportada hasta 2030-11-14) | PostgreSQL 19: en beta |
| ORM / query builder | Drizzle ORM y Drizzle Kit | 0.45.x (0.45.2) y 0.31.x (0.31.10) | Drizzle 1.0: en rc.4. Prisma 7.10: paso de generación de cliente y mayor footprint |
| Migraciones | SQL versionado, generado con Drizzle Kit | — | — |
| Autenticación | Sesiones server-side propias o librería de sesiones madura | se decide en la 3.2 | Auth como servicio de terceros: descartado salvo ADR nuevo |
| Tests unitarios e integración | Vitest | 5.0.x (Node `^22.12 \|\| ^24 \|\| >=26`) | Jest |
| Tests end-to-end | Playwright | 1.63.x | Cypress |
| Lint | ESLint con `eslint-config-next` | ESLint 10.x; `eslint-config-next` 16.3.x (`core-web-vitals` y `typescript`) | Biome 2.5: una sola herramienta, pero sin la configuración que mantiene Next.js |
| Formateo | Prettier con `eslint-config-prettier` | 3.9.x | Biome |
| Contenedores | Docker y Docker Compose, solo para PostgreSQL local | se fija en la 2.4 | — |

La versión exacta de cada paquete queda fijada en el lockfile al instalar (2.3). Un cambio de versión mayor posterior se registra en este documento, no se hace en silencio.

### Compatibilidades verificadas

- Todo el stack acepta Node 24 y Node 26. El más restrictivo es Vitest.
- `eslint-config-next` 16.3.5 depende de `typescript-eslint ^8.46`, que exige `typescript >=4.8.4 <6.1.0`: por eso TypeScript queda en 6.0.x.
- Next.js 16.3.5 acepta React `^18.2.0 || ^19.0.0` y `@playwright/test ^1.51.1`.
- Drizzle 1.0 cambia el formato de migraciones y trae `drizzle-kit up` para convertirlas. Si sale estable antes de la subfase 3.1, se adopta ahí.
- **No verificado**: soporte declarado de PostgreSQL 18 en Drizzle y sus drivers (`pg` 8.23, `postgres` 3.4). Se valida con conectividad real en la 2.4.

## Convenciones de código

- Un módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`, `analytics`, `auth`, `organizations`, `ingestion`, `audit`) = una carpeta `src/modules/<modulo>/` con `index.ts` (interfaz pública), `service.ts`, `repository.ts`, `schema.ts` (sus tablas) y `types.ts`; sin acceso cruzado salvo lo documentado en [architecture/Overview.md](../architecture/Overview.md). La estructura completa y la regla de lint que la hace cumplir están en [architecture/RepositoryStructure.md](../architecture/RepositoryStructure.md).
- Lint con ESLint y formateo con Prettier, obligatorios en CI, sin excepciones por archivo salvo justificación explícita. Next.js 16 ya no corre el lint en `next build`: se ejecuta como script propio.
- Typecheck estricto (`strict: true` en `tsconfig.json`) desde el primer commit.
- Sin `any` implícito ni explícito salvo en límites de librería externa sin tipos, documentado con comentario.

## Control de versiones

- Un commit representa un cambio coherente y completo, no un checkpoint intermedio.
- Mensajes de commit en modo imperativo, explicando el porqué cuando no sea obvio del diff.
- Ninguna rama se mergea sin pasar lint, typecheck, tests y build en CI.
- No se hace commit, push ni merge sin autorización explícita del usuario en el turno actual (ver [CLAUDE.md](../../CLAUDE.md)).

## CI

Pipeline mínimo por PR, con Node 24: `npm ci` → lint → typecheck → tests unitarios e integración → build. Los tests end-to-end corren contra un entorno efímero con base de datos de test y seeds sintéticos, no contra staging compartido.

## Fuentes consultadas (2026-09-12)

- Registro npm (`npm view`): versiones, fechas, `engines` y `peerDependencies` de `next`, `react`, `typescript`, `drizzle-orm`, `drizzle-kit`, `prisma`, `vitest`, `vite`, `@playwright/test`, `eslint`, `eslint-config-next`, `typescript-eslint`, `prettier`, `@biomejs/biome`, `pnpm`, `pg` y `postgres`.
- [Node.js release schedule](https://github.com/nodejs/release), [Node.js | endoflife.date](https://endoflife.date/nodejs) y [Corepack](https://github.com/nodejs/corepack).
- [Next.js Support Policy](https://nextjs.org/support-policy), [Installation](https://nextjs.org/docs/app/getting-started/installation) y [ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint).
- [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/).
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) y [typescript-eslint: dependency versions](https://typescript-eslint.io/users/dependency-versions).
- [Drizzle: upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1).
