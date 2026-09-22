# Estándares de Ingeniería

**Estado: diseñado.** Stack re-verificado contra fuentes oficiales y el registro npm el 2026-09-12, en la subfase 2.2 ([brief-2.2](../decisions/brief-2.2-re-verificacion-del-stack.md), [ADR 0004](../decisions/0004-stack-tecnologico-propuesto.md)). Instalado en la 2.3 ([brief-2.3](../decisions/brief-2.3-bootstrap-de-la-aplicacion.md)); PostgreSQL, Drizzle y `pg`, en la 2.4 ([brief-2.4](../decisions/brief-2.4-base-de-datos-local.md)); Tailwind CSS, Playwright, `@axe-core/playwright` y `tsx`, en la 3.5 ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md)). Instalar no valida: sin tests todavía, el nivel es *implementado*.

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
| Tests end-to-end | Playwright (`@playwright/test`), solo Chromium, sobre `next start` ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-8) | 1.63.x (1.63.0) | Cypress |
| Estilos | Tailwind CSS con `@tailwindcss/postcss`; CSS Modules para lo que no cubra ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-2). Tokens de color semánticos en `src/app/globals.css`, con la paleta por defecto anulada ([brief-4.0](../decisions/brief-4.0-diseno-visual-base.md), D-1) | 4.3.x (4.3.3); sin `prettier-plugin-tailwindcss` | CSS Modules solos; librería de componentes; variantes `dark:` por clase |
| Tipografía | Manrope variable (SIL OFL), subconjunto latino en `src/app/_fonts/`, cargada con `next/font/local` ([brief-4.0](../decisions/brief-4.0-diseno-visual-base.md), D-3) | archivo de Google Fonts v20; sin dependencia de npm | Figtree; fuentes del sistema |
| Accesibilidad | `@axe-core/playwright` en los tests end-to-end, WCAG 2.x A y AA ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-3) | 4.13.x (4.13.0) | `eslint-plugin-jsx-a11y` 6.10: solo ESLint 9. `eslint-plugin-jsx-a11y-x` 0.2: un mantenedor, en 0.x |
| Scripts TypeScript | `tsx`, para `npm run db:seed` con el alias `@/` ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-7) | 4.23.x (4.23.13; ya estaba en el lockfile por `drizzle-kit` y `vite`) | Node con type stripping: no resuelve `@/` |
| Lint | ESLint 10 con `@eslint/js`, `typescript-eslint`, `@next/eslint-plugin-next` (`recommended` y `core-web-vitals`), `eslint-plugin-react-hooks` y `eslint-config-prettier` ([ADR 0011](../decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md)) | ESLint 10.10; `@eslint/js` 10.0; `typescript-eslint` 8.70; `@next/eslint-plugin-next` 16.3; `eslint-plugin-react-hooks` 7.1 | `eslint-config-next`: sus plugins no soportan ESLint 10. Biome 2.5 |
| Formateo | Prettier con `eslint-config-prettier` | 3.9.x | Biome |
| Contenedores | Docker y Docker Compose, solo para PostgreSQL local | Imagen `postgres:18.6-trixie`, con versión menor y distribución fijadas ([brief-2.4](../decisions/brief-2.4-base-de-datos-local.md), D-5) | `postgres:18.6-alpine`: musl ordena distinto que glibc |

La versión exacta de cada paquete queda fijada en el lockfile al instalar (2.3). Un cambio de versión mayor posterior se registra en este documento, no se hace en silencio.

### Convención de estilos (4.0)

- Las pantallas usan solo los tokens de `globals.css` (`bg-surface`, `text-muted`, `bg-primary`…), nunca colores de la paleta de Tailwind ni valores hexadecimales sueltos. La paleta por defecto está anulada con `--color-*: initial`, así que una clase como `bg-slate-50` no genera CSS.
- Un token nuevo se agrega con su valor en claro y en oscuro, y con el contraste AA de su uso verificado.
- Las clases que se repiten viven en `src/app/_components/form-styles.ts`. Un patrón que aparece en tres pantallas se extrae como componente en esa subfase.
- El tema lo decide la cookie `crm_theme`, leída en el layout raíz; sin cookie manda `prefers-color-scheme`. No hay scripts en línea.

### Compatibilidades verificadas

- Todo el stack acepta Node 24 y Node 26. El más restrictivo es Vitest.
- `typescript-eslint` 8.70 exige `typescript >=4.8.4 <6.1.0`: por eso TypeScript queda en 6.0.x, con rango `~6.0.3` en `package.json` para que npm no suba a 6.1.
- `eslint-config-next` 16.3.5 trae `eslint-plugin-react`, `eslint-plugin-import` y `eslint-plugin-jsx-a11y`, que solo aceptan ESLint 9: por eso el lint se arma con plugins sueltos ([ADR 0011](../decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md)). Verificado instalando en la 2.3: `npm install` sin avisos de dependencias pares.
- Next.js 16.3.5 escribe reglas para agentes de IA en `CLAUDE.md` o `AGENTS.md` al correr `next dev`. `next.config.ts` lo desactiva con `agentRules: false`: las reglas del proyecto viven solo en `CLAUDE.md`.
- Next.js 16.3.5 acepta React `^18.2.0 || ^19.0.0` y `@playwright/test ^1.51.1`.
- Drizzle 1.0 cambia el formato de migraciones y trae `drizzle-kit up` para convertirlas. Al 2026-09-18 sigue sin versión estable: `latest` es 0.31.10 y la línea 1.0 solo publica prelanzamientos con sufijo de commit (`rc` → `1.0.0-rc.4`, `rc5` → `1.0.0-rc.5-5935859`). Por eso la migración inicial de la 3.1 se generó con `drizzle-kit` 0.31.10. Adoptar 1.0 más adelante requiere convertir `drizzle/` con `drizzle-kit up`, y **además saca del árbol los 4 avisos de `npm audit`**: la 1.0 reemplaza `@esbuild-kit/esm-loader` por `jiti` y declara `esbuild ^0.25.10` (verificado con `npm view` el 2026-09-18).
- **Migraciones** ([brief-3.1](../decisions/brief-3.1-migraciones-de-identidad.md)): `drizzle-kit generate` las crea y `drizzle-kit migrate` las aplica a la base de desarrollo. Los tests y CI usan el migrador programático de `drizzle-orm` sobre la base `_test`. CI falla si un `schema.ts` cambió sin su migración.
- **PostgreSQL 18 con Drizzle 0.45 y `pg` 8.23**: conectividad validada localmente en la 2.4. Los tests de integración ejecutan consultas con Drizzle contra `postgres:18.6-trixie` y comprueban `server_version_num` 18.x. Desde la 3.1, las tablas de identidad, el enum de rol, las unicidades y las claves foráneas también están validados localmente contra esa imagen. `postgres` 3.4 no se probó.
- La imagen de PostgreSQL 18 guarda los datos en `/var/lib/postgresql/18/docker` y declara el volumen en `/var/lib/postgresql`. Un volumen montado en `/var/lib/postgresql/data`, como hasta la 17, no conserva los datos.
- `drizzle-kit` 0.31.10 depende de `@esbuild-kit/esm-loader` (deprecado) y, por debajo, de un `esbuild` antiguo. Por eso `npm audit` informa 4 avisos moderados, que afectan solo al servidor de desarrollo de esbuild. Sin `npm audit fix`, que bajaría `drizzle-kit` a 0.18.1, un major hacia atrás. Desde la 8.3 están aceptados por escrito con su condición de salida en [planning/Risks.md](../planning/Risks.md), y el umbral de la auditoría de CI los deja pasar sin silenciarlos.

## Convenciones de código

- Un módulo de dominio (`catalog`, `crm`, `conversations`, `inventory`, `analytics`, `auth`, `organizations`, `ingestion`, `audit`) = una carpeta `src/modules/<modulo>/` con `index.ts` (interfaz pública), `service.ts`, `repository.ts`, `schema.ts` (sus tablas) y `types.ts`; sin acceso cruzado salvo lo documentado en [architecture/Overview.md](../architecture/Overview.md). La estructura completa y la regla de lint que la hace cumplir están en [architecture/RepositoryStructure.md](../architecture/RepositoryStructure.md).
- Lint con ESLint y formateo con Prettier, obligatorios en CI, sin excepciones por archivo salvo justificación explícita. Next.js 16 ya no corre el lint en `next build`: se ejecuta como script propio. Prettier no formatea Markdown (`.prettierignore`).
- Typecheck estricto desde el primer commit: `strict`, `noUncheckedIndexedAccess` y `noImplicitOverride` en `tsconfig.json`.
- Accesibilidad sin lint mientras `eslint-plugin-jsx-a11y` no soporte ESLint 10. La verifica axe sobre el DOM renderizado de cada estado de cada pantalla, más casos de teclado y foco en end-to-end ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-3). El lint se revisa al abrir cada fase con pantallas y cuando el plugin soporte ESLint 10.
- Un componente de cliente no importa módulos de `src/modules/`: arrastraría `pg` y `next/headers` al bundle del navegador.
- Sin `any` implícito ni explícito salvo en límites de librería externa sin tipos, documentado con comentario.

## Control de versiones

- Un commit representa un cambio coherente y completo, no un checkpoint intermedio.
- Mensajes de commit en modo imperativo, explicando el porqué cuando no sea obvio del diff.
- Ninguna rama se mergea sin pasar lint, typecheck, tests y build en CI. Hoy es una regla de procedimiento, sin protección de rama (ver CI).
- No se hace commit, push ni merge sin autorización explícita del usuario en el turno actual (ver [CLAUDE.md](../../CLAUDE.md)).

## CI

`.github/workflows/ci.yml` corre en cada push a `main` y en cada pull request, con Node 24 en `ubuntu-latest` ([brief-2.5](../decisions/brief-2.5-pipeline-de-ci.md)). Los pasos son, en orden:

1. `npm ci`
2. auditoría de dependencias: dos puertas con umbral explícito ([brief-8.3](../decisions/brief-8.3-dependencias.md))
3. desfase de migraciones: `db:generate` no debe cambiar `drizzle/` ([brief-3.1](../decisions/brief-3.1-migraciones-de-identidad.md))
4. lint
5. typecheck
6. `format:check`
7. `test:guards`
8. `test:unit`: proyecto `unit` de Vitest, `src/**/*.test.ts` ([brief-3.4](../decisions/brief-3.4-autorizacion-y-errores.md); hasta la 3.3 no corría en CI)
9. `test:integration`, contra un service container `postgres:18.6-trixie` efímero
10. build
11. instalar Chromium de Playwright con sus dependencias del sistema
12. `test:e2e`: Playwright sobre `next start` del build anterior, en la base `crm_ci_e2e` ([brief-3.5](../decisions/brief-3.5-pantalla-de-inicio-de-sesion.md), D-8)

- **Auditoría de dependencias** (desde la 8.3): `npm audit --omit=dev --audit-level=high` para lo que se despliega y `npm audit --audit-level=critical` para el árbol completo. Va inmediatamente después de instalar, para que una vulnerabilidad crítica aparezca en los primeros segundos y no después de los tests. El umbral se escribe en el comando y no se hereda del valor por defecto de npm, que puede cambiar entre versiones. El detalle y los avisos aceptados están en [architecture/SecurityModel.md](../architecture/SecurityModel.md) §"Revisión de dependencias".
- **Guardas** (`tests/guards/`, sin base de datos). El paso de CI se llama "Guardas del repositorio" a secas: el detalle de cuáles son vive en la carpeta, no en el nombre del paso, que quedó desactualizado dos veces por nombrarlas. El recuento va una sola vez, al final de la lista, por el mismo motivo: escribirlo también acá lo dejó contradiciéndose a sí mismo (N-2 de la segunda revisión independiente de la 9.1). Son:
  - **referencias prohibidas**: Airtable o el repositorio del agente de WhatsApp en archivos versionados que no son `.md`;
  - **frontera entre módulos**: aplica `eslint.config.mjs` a 20 archivos virtuales con `ESLint#lintText`, en pares prohibido/permitido (9.0.3);
  - **escrituras de stock** (4.3.1): `inventories` e `inventory_movements` solo se escriben desde las funciones autorizadas de `src/modules/inventory/repository.ts`;
  - **superficie de logs** (8.2): solo el módulo de log usa `console.*`, y ningún `route` de un evento se arma interpolando;
  - **superficie expuesta** (8.4): cada Server Action exportada y cada Route Handler de `src/app` está declarado con su exigencia de sesión, y lo declarado público dice por qué. Comprueba la declaración, no el mecanismo, y su cabecera explica por qué no puede comprobar el mecanismo sin mentir;
  - **punto de entrada del resumen de usuarios** (9.0.1): `users` se lee por `organizations.getMemberSummaries` y no por acceso literal;
  - **nombres de despliegue** (9.1): ninguna URL absoluta a un host no local, ni IPv4 o IPv6 pública, en el código de `src/` que se despliega;
  - **configuración del proxy de staging** (9.1): parsea el nginx versionado y exige, en **cada** bloque que hace `proxy_pass`, que `X-Forwarded-For` y `X-Forwarded-Proto` queden fijadas exactamente una vez y con el valor correcto, aplicando la regla de herencia real de nginx; y que la unidad de `systemd` enlace solo a loopback. Es la premisa de la que depende que H-3 siga resuelto.

  Cada guarda incluye casos que demuestran que detecta lo que prohíbe. **Son ocho al 2026-09-22**, y la lista de arriba es la enumeración viva: agregar una guarda sin agregarla acá es el defecto H-4 de la 8.4, que ya ocurrió una vez.

  **Una guarda nueva no se da por escrita hasta ejecutar una mutación por cada forma sintáctica que dice cubrir**, y la mutación se registra con el resultado antes y después. No es una precaución teórica: **cuatro** detectores del proyecto nacieron viendo una sola de las formas posibles —superficie expuesta (8.4), punto de entrada del resumen de usuarios (9.0.1), nombres de despliegue (9.1) y configuración del proxy de staging (9.1)—, y las cuatro veces lo encontró una revisión independiente, nunca la autoevaluación. La cuarta se escribió **un día después** de dejar registrado este mismo modo de falla, así que conocerlo tampoco alcanza. Una mutación por guarda no alcanzó; hacen falta por forma.
- **Acciones fijadas por SHA de commit**, con la versión en un comentario. Actualizarlas es un cambio explícito.
- **Permisos**: `contents: read`. Sin secrets: la base de CI es efímera y sus valores no son secretos.
- **Sin protección de rama**: el plan gratuito de GitHub no la ofrece para repositorios privados. La CI informa pero no bloquea un push ni un merge. Por procedimiento, ninguna subfase se cierra sin verificar con `gh run view` que la ejecución de su commit está en verde. Se revisa si se suma otra persona al proyecto o antes de producción (Fase 9).
- Los tests end-to-end corren contra un entorno efímero (el build de producción del runner, con la base `_e2e` recreada y sembrada con datos sintéticos), no contra staging compartido. Desde la 3.5.

## Fuentes consultadas (2026-09-12)

- Registro npm (`npm view`): versiones, fechas, `engines` y `peerDependencies` de `next`, `react`, `typescript`, `drizzle-orm`, `drizzle-kit`, `prisma`, `vitest`, `vite`, `@playwright/test`, `eslint`, `eslint-config-next`, `typescript-eslint`, `prettier`, `@biomejs/biome`, `pnpm`, `pg` y `postgres`.
- [Node.js release schedule](https://github.com/nodejs/release), [Node.js | endoflife.date](https://endoflife.date/nodejs) y [Corepack](https://github.com/nodejs/corepack).
- [Next.js Support Policy](https://nextjs.org/support-policy), [Installation](https://nextjs.org/docs/app/getting-started/installation) y [ESLint Plugin](https://nextjs.org/docs/app/api-reference/config/eslint).
- [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/).
- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) y [typescript-eslint: dependency versions](https://typescript-eslint.io/users/dependency-versions).
- [Drizzle: upgrade to v1](https://orm.drizzle.team/docs/upgrade-v1).
