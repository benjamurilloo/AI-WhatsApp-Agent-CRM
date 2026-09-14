# Estándares de Ingeniería

**Estado: diseñado.** Stack re-verificado contra fuentes oficiales y el registro npm el 2026-09-12, en la subfase 2.2 ([brief-2.2](../decisions/brief-2.2-re-verificacion-del-stack.md), [ADR 0004](../decisions/0004-stack-tecnologico-propuesto.md)). Instalado en la 2.3 ([brief-2.3](../decisions/brief-2.3-bootstrap-de-la-aplicacion.md)); PostgreSQL, Drizzle y `pg`, en la 2.4 ([brief-2.4](../decisions/brief-2.4-base-de-datos-local.md)). Falta Playwright. Instalar no valida: sin tests todavía, el nivel es *implementado*.

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
| Driver de PostgreSQL | `pg` (node-postgres) con `@types/pg` | 8.23.x ([brief-2.4](../decisions/brief-2.4-base-de-datos-local.md), D-1) | `postgres` 3.4 (postgres.js) |
| Migraciones | SQL versionado, generado con Drizzle Kit | — | — |
| Autenticación | Sesiones server-side propias sobre `node:crypto` y `cookies` de Next.js, en tabla `sessions` de PostgreSQL ([ADR 0012](../decisions/0012-mecanismo-de-sesion.md)) | sin dependencia de sesión | Better Auth, Auth.js, `iron-session` y Lucia (deprecada): descartadas en el ADR 0012. Auth como servicio de terceros: descartado salvo ADR nuevo |
| Hash de contraseñas | argon2id con `@node-rs/argon2`, `m=19456`, `t=2`, `p=1`, formato PHC ([brief-3.3](../decisions/brief-3.3-autenticacion.md), D-1) | 2.2.x (2.2.1; binarios precompilados, sin script de instalación) | `crypto.argon2` nativo: Experimental en Node al 2026-09-13; se reevalúa cuando sea estable. `argon2` 0.45: script `install` con `node-gyp-build` |
| Validación de entradas | `zod`, convención para todos los módulos ([brief-3.3](../decisions/brief-3.3-autenticacion.md), D-6) | 4.6.x (4.6.4) | `valibot` 1.5; validadores a mano |
| Tests unitarios e integración | Vitest, con Vite como dependencia par | Vitest 5.0.x (Node `^22.12 \|\| ^24 \|\| >=26`); Vite 8.3.x | Jest |
| Tipos | `@types/node`, `@types/react`, `@types/react-dom` | 24.x (la línea de Node 24, no el `latest` 22.x); 19.3.x | — |
| Tests end-to-end | Playwright | 1.63.x | Cypress |
| Lint | ESLint 10 con `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next` (`recommended` y `core-web-vitals`), `eslint-plugin-react-hooks` y `eslint-config-prettier` ([ADR 0011](../decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md)) | ESLint 10.10; `@eslint/js` 10.0; `typescript-eslint` 8.70; `@next/eslint-plugin-next` 16.3; `eslint-plugin-react-hooks` 7.1 | `eslint-config-next`: sus plugins no soportan ESLint 10. Biome 2.5 |
| Formateo | Prettier con `eslint-config-prettier` | 3.9.x | Biome |
| Contenedores | Docker y Docker Compose, solo para PostgreSQL local | Imagen `postgres:18.6-trixie`, con versión menor y distribución fijadas ([brief-2.4](../decisions/brief-2.4-base-de-datos-local.md), D-5) | `postgres:18.6-alpine`: musl ordena distinto que glibc |

La versión exacta de cada paquete queda fijada en el lockfile al instalar (2.3). Un cambio de versión mayor posterior se registra en este documento, no se hace en silencio.

### Compatibilidades verificadas

- Todo el stack acepta Node 24 y Node 26. El más restrictivo es Vitest.
- `typescript-eslint` 8.70 exige `typescript >=4.8.4 <6.1.0`: por eso TypeScript queda en 6.0.x, con rango `~6.0.3` en `package.json` para que npm no suba a 6.1.
- `eslint-config-next` 16.3.5 trae `eslint-plugin-react`, `eslint-plugin-import` y `eslint-plugin-jsx-a11y`, que solo aceptan ESLint 9: por eso el lint se arma con plugins sueltos ([ADR 0011](../decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md)). Verificado instalando en la 2.3: `npm install` sin avisos de dependencias pares.
- Next.js 16.3.5 escribe reglas para agentes de IA en `CLAUDE.md` o `AGENTS.md` al correr `next dev`. `next.config.ts` lo desactiva con `agentRules: false`: las reglas del proyecto viven solo en `CLAUDE.md`.
- Next.js 16.3.5 acepta React `^18.2.0 || ^19.0.0` y `@playwright/test ^1.51.1`.
- Drizzle 1.0 cambia el formato de migraciones y trae `drizzle-kit up` para convertirlas. Al 2026-09-13 seguía en `1.0.0-rc.5` (registro npm), así que la migración inicial de la 3.1 se generó con `drizzle-kit` 0.31.10. Adoptar 1.0 más adelante requiere convertir `drizzle/` con `drizzle-kit up`.
- **Migraciones** ([brief-3.1](../decisions/brief-3.1-migraciones-de-identidad.md)): `drizzle-kit generate` las crea y `drizzle-kit migrate` las aplica a la base de desarrollo. Los tests y CI usan el migrador programático de `drizzle-orm` sobre la base `_test`. CI falla si un `schema.ts` cambió sin su migración.
- **PostgreSQL 18 con Drizzle 0.45 y `pg` 8.23**: conectividad validada localmente en la 2.4. Los tests de integración ejecutan consultas con Drizzle contra `postgres:18.6-trixie` y comprueban `server_version_num` 18.x. Desde la 3.1, las tablas de identidad, el enum de rol, las unicidades y las claves foráneas también están validados localmente contra esa imagen. `postgres` 3.4 no se probó.
- La imagen de PostgreSQL 18 guarda los datos en `/var/lib/postgresql/18/docker` y declara el volumen en `/var/lib/postgresql`. Un volumen montado en `/var/lib/postgresql/data`, como hasta la 17, no conserva los datos.
- `drizzle-kit` 0.31.10 depende de `@esbuild-kit/esm-loader` (deprecado) y de un `esbuild` antiguo. Por eso `npm audit` informa 4 avisos moderados, que afectan solo al servidor de desarrollo de esbuild. Se registran para la Fase 8 sin `npm audit fix`, que bajaría `drizzle-kit` a 0.18.

## Convenciones de código

- Un módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`, `analytics`, `auth`, `organizations`, `ingestion`, `audit`) = una carpeta `src/modules/<modulo>/` con `index.ts` (interfaz pública), `service.ts`, `repository.ts`, `schema.ts` (sus tablas) y `types.ts`; sin acceso cruzado salvo lo documentado en [architecture/Overview.md](../architecture/Overview.md). La estructura completa y la regla de lint que la hace cumplir están en [architecture/RepositoryStructure.md](../architecture/RepositoryStructure.md).
- Lint con ESLint y formateo con Prettier, obligatorios en CI, sin excepciones por archivo salvo justificación explícita. Next.js 16 ya no corre el lint en `next build`: se ejecuta como script propio. Prettier no formatea Markdown (`.prettierignore`).
- Typecheck estricto desde el primer commit: `strict`, `noUncheckedIndexedAccess` y `noImplicitOverride` en `tsconfig.json`.
- Accesibilidad sin lint mientras `eslint-plugin-jsx-a11y` no soporte ESLint 10: se revisa antes de la primera pantalla (Fase 3).
- Sin `any` implícito ni explícito salvo en límites de librería externa sin tipos, documentado con comentario.

## Control de versiones

- Un commit representa un cambio coherente y completo, no un checkpoint intermedio.
- Mensajes de commit en modo imperativo, explicando el porqué cuando no sea obvio del diff.
- Ninguna rama se mergea sin pasar lint, typecheck, tests y build en CI. Hoy es una regla de procedimiento, sin protección de rama (ver CI).
- No se hace commit, push ni merge sin autorización explícita del usuario en el turno actual (ver [CLAUDE.md](../../CLAUDE.md)).

## CI

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request, con Node 24 en `ubuntu-latest` ([brief-2.5](../decisions/brief-2.5-pipeline-de-ci.md)). Los pasos son, en orden:

1. `npm ci`
2. lint
3. typecheck
4. `format:check`
5. `test:guards`
6. `test:integration`, contra un service container `postgres:18.6-trixie` efímero
7. build

- **Guardas** (`tests/guards/`, sin base de datos):
  - **referencias prohibidas**: Airtable o el repositorio del agente de WhatsApp en archivos versionados que no son `.md`;
  - **frontera entre módulos**: aplica `eslint.config.mjs` a 9 archivos virtuales con `ESLint#lintText`.

  Cada guarda incluye casos que demuestran que detecta lo que prohíbe.
- **Acciones fijadas por SHA de commit**, con la versión en un comentario. Actualizarlas es un cambio explícito.
- **Permisos**: `contents: read`. Sin secrets: la base de CI es efímera y sus valores no son secretos.
- **Sin protección de rama**: el plan gratuito de GitHub no la ofrece para repositorios privados. La CI informa pero no bloquea un push ni un merge. Por procedimiento, ninguna subfase se cierra sin verificar con `gh run view` que la ejecución de su commit está en verde. Se revisa si se suma otra persona al proyecto o antes de producción (Fase 9).
- Los tests end-to-end, cuando existan, corren contra un entorno efímero con base de datos de test y seeds sintéticos, no contra staging compartido.

## Fuentes consultadas (2026-09-12)

- Registro npm (`npm view`): versiones, fechas, `engines` y `peerDependencies` de `next`, `react`, `typescript`, `drizzle-orm`, `drizzle-kit`, `prisma`, `vitest`, `vite`, `@playwright/test`, `eslint`, `eslint-config-next`, `typescript-eslint`, `prettier`, `@biomejs/biome`, `pnpm`, `pg` y `postgres`.
- [Node.js release schedule](https://github.com/nodejs/release), [Node.js | endoflife.date](https://endoflife.date/nodejs) y [Corepack](https://github.com/nodejs/corepack).
- [Next.js Support Policy](https://nextjs.org/support-policy), [Installation](https://nextjs.org/docs/app/getting-started/installation) y [ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint).
- [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/).
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) y [typescript-eslint: dependency versions](https://typescript-eslint.io/users/dependency-versions).
- [Drizzle: upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1).
