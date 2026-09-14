# Estructura del repositorio

**Estado: diseñado, con lo de la 2.3 y la 2.4 implementado.** Existen `docs/`, la configuración de la 2.3 y `src/app/` con layout y página. La 2.4 agregó Docker Compose, `drizzle.config.ts`, `src/shared/db/`, `/api/health` y `tests/integration/`; la 2.5, `.github/workflows/ci.yml` y `tests/guards/`; la 3.1, los `schema.ts` de `auth` y `organizations`, `drizzle/` con la migración inicial y la base de test de `tests/integration/`. El resto se crea en las subfases que indica la tabla final. Resuelta en la subfase 2.1 ([brief-2.1](../decisions/brief-2.1-estructura-del-repositorio.md)) sobre el stack del [ADR 0004](../decisions/0004-stack-tecnologico-propuesto.md).

Ubica en carpetas los módulos y las reglas de dependencia de [Overview.md](Overview.md). No los cambia: si este documento y Overview se contradicen, manda Overview y la discrepancia se corrige aquí.

## Árbol

```text
/
├── src/
│   ├── app/                         Rutas de Next.js: páginas, layouts y route handlers delgados
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── api/
│   │       └── health/
│   │           └── route.ts         GET /api/health
│   ├── modules/                     Un directorio por módulo de Overview.md
│   │   └── <modulo>/
│   │       ├── index.ts             Interfaz pública: lo único que otros importan
│   │       ├── service.ts           Casos de uso; errores tipados
│   │       ├── repository.ts        Acceso a sus propias tablas
│   │       ├── schema.ts            Tablas de Drizzle que el módulo posee
│   │       ├── types.ts
│   │       └── *.test.ts            Tests unitarios, junto al código
│   └── shared/
│       └── db/                      Cliente de Drizzle, conexión y health check de la base
│           ├── index.ts             Interfaz pública: createDb, getDb, checkDatabase
│           ├── client.ts
│           └── health.ts
├── drizzle/                         Migraciones SQL generadas por Drizzle Kit (versionadas)
├── seeds/                           Seeds sintéticos: básico y volumen
├── tests/
│   ├── guards/                      Guardas sin base: referencias prohibidas y frontera entre módulos
│   ├── integration/                 Contra PostgreSQL real, en la base <nombre>_test
│   │   ├── global-setup.ts          Recrea y migra la base de test en cada ejecución (3.1)
│   │   ├── test-database.ts         Deriva la URL de la base de test desde DATABASE_URL
│   │   ├── reset-database.ts        Vacía las tablas antes de cada test
│   │   └── *.test.ts                db-connectivity (2.4), identity-schema (3.1)
│   └── e2e/                         Playwright sobre las pantallas
├── .github/
│   └── workflows/
│       └── ci.yml                   CI de GitHub Actions
├── docs/
├── package.json · package-lock.json
├── tsconfig.json                    strict: true; alias @/* → src/*
├── next.config.ts
├── eslint.config.mjs                Incluye la regla de frontera entre módulos
├── prettier.config.mjs
├── .prettierignore                  Excluye Markdown y generados
├── vitest.config.mts                Proyectos: unitario, guardas e integración
├── playwright.config.ts
├── drizzle.config.ts                schema: src/modules/*/schema.ts · out: drizzle
├── docker-compose.yml               Solo PostgreSQL local
└── .env.example                     Sin valores reales
```

Los nombres de los archivos de configuración son los convencionales de cada herramienta; la subfase que los crea puede ajustar la extensión si la herramienta lo exige, sin cambiar su ubicación.

## Módulos

| Módulo | Carpeta | Fase que lo crea |
|---|---|---|
| `auth` | `src/modules/auth/` | Fase 3 |
| `organizations` | `src/modules/organizations/` | Fase 3 |
| `audit` | `src/modules/audit/` | Fase 3 |
| `catalog` | `src/modules/catalog/` | Fase 4 |
| `inventory` | `src/modules/inventory/` | Fase 4 |
| `crm` | `src/modules/crm/` | Fase 5 |
| `conversations` | `src/modules/conversations/` | Fase 6 |
| `ingestion` | `src/modules/ingestion/` | Fase 6 |
| `analytics` | `src/modules/analytics/` | Fase 7 |

No hay otros módulos. Uno nuevo requiere primero cambiar la tabla de [Overview.md](Overview.md).

### Forma interna

- **`index.ts`** reexporta los servicios y tipos que el módulo ofrece. Todo lo demás es interno.
- **`service.ts`** valida, autoriza por organización y rol, y produce errores tipados de la taxonomía de Overview. No conoce HTTP, sesiones ni presentación.
- **`repository.ts`** consulta solo las tablas del propio `schema.ts`, siempre filtradas por `organization_id`.
- **`schema.ts`** declara las tablas que el módulo posee. Una clave foránea hacia la tabla de otro módulo importa esa tabla desde el `schema.ts` del módulo dueño, siguiendo una dependencia ya declarada en Overview.
- Un archivo pasa a subcarpeta (`service/`, `repository/`) solo cuando crece; no se anticipa.

### Rutas y handlers

- `src/app/` contiene páginas, layouts y `route.ts`. Una página o un handler obtiene la sesión, llama a la interfaz pública de uno o más módulos y traduce los errores tipados a código HTTP o a mensaje visible.
- Ningún archivo de `src/app/` ejecuta SQL ni importa `repository.ts` o `schema.ts`.
- `/api/health` es infraestructura, no dominio: su handler llama al health check de `src/shared/db/`.

### Código compartido

- `src/shared/db/` es la única carpeta compartida fijada en esta estructura: cliente de Drizzle, conexión y health check.
- `src/shared/errors/` (3.4) contiene la taxonomía de errores de Overview: códigos, HTTP por código y tipo `Failure`.
- Ubicaciones fijadas en la 3.4 (D-5), que nacen con su primer consumidor: `src/shared/log/` para el log estructurado con `request_id` (3.5) y `src/shared/http/` para la verificación de `Origin` del primer Route Handler mutante.
- `src/shared/` no importa nada de `src/modules/`, para no crear ciclos.

## Frontera entre módulos

Se hace cumplir con la regla `no-restricted-imports` de ESLint, incluida en ESLint y sin dependencias nuevas:

| Quién importa | Permitido | Prohibido |
|---|---|---|
| Cualquier archivo | `@/modules/<modulo>` (su `index.ts`) y `@/shared/...` | `@/modules/<modulo>/<archivo interno>` y rutas relativas que salgan del propio módulo (`../`) |
| `src/modules/*/schema.ts` | Además, `@/modules/<dueño>/schema` para declarar claves foráneas | Cualquier otro archivo interno ajeno |
| `src/modules/analytics/**` | Además, `@/modules/*/schema` para lecturas de solo lectura entre dominios | `repository.ts` y `service.ts` internos de otros módulos |
| `catalog`, `crm`, `conversations`, `inventory` | — | `next`, `next/*` y `@/app/*`: el dominio no conoce HTTP ni presentación |
| `src/shared/**` | — | `@/modules/*` |

- La 2.3 escribe la regla en `eslint.config.mjs`.
- `tests/guards/module-boundary.test.ts` (2.5) aplica la configuración real a los 9 casos de esta tabla como archivos virtuales, y corre en local y en CI.
- La excepción de `schema.ts` sale de combinar D-3 (el esquema vive en el módulo dueño) con D-6 (solo se importa la interfaz pública): sin ella, una clave foránea entre módulos violaría la regla.
- ESLint reemplaza la configuración de una regla cuando otro bloque aplica a los mismos archivos. Los bloques de excepción repiten las prohibiciones generales en vez de heredarlas.

## Tests, seeds y migraciones

| Qué | Dónde | Cómo corre |
|---|---|---|
| Tests unitarios | `src/**/*.test.ts`, junto al código | Proyecto unitario de Vitest, sin base de datos |
| Guardas | `tests/guards/` | Proyecto `guards` de Vitest, sin base de datos: referencias prohibidas y frontera entre módulos |
| Tests de integración | `tests/integration/` | Proyecto de integración de Vitest, contra PostgreSQL real de test |
| Tests end-to-end | `tests/e2e/` | Playwright, contra un entorno efímero con seeds sintéticos |
| Fixtures | Junto al test que los usa | Sintéticos; los de ingestión se marcan como forma asumida |
| Seeds | `seeds/` | Básico para desarrollo y volumen para paginación y rendimiento |
| Migraciones | `drizzle/` | Generadas por Drizzle Kit, versionadas y aplicadas en forma explícita |

## Qué crea cada subfase

Ninguna carpeta se crea vacía: nace con el primer archivo real de la subfase que la usa. Las fases 3 a 7 asignan la subfase exacta en su propio brief.

| Subfase | Crea |
|---|---|
| 2.3 — Bootstrap | `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` (con la regla de frontera), `prettier.config.mjs`, `.prettierignore`, `vitest.config.mts` (proyectos unitario e integración), `src/app/layout.tsx`, `src/app/page.tsx` y las entradas de `.gitignore` del stack |
| 2.4 — Base de datos local | `docker-compose.yml`, `.env.example`, `drizzle.config.ts`, `src/shared/db/`, `src/app/api/health/route.ts` y `tests/integration/` con el test de conectividad real |
| 2.5 — CI | `.github/workflows/ci.yml` y `tests/guards/`, con la guarda de referencias prohibidas y el caso que demuestra que la regla de frontera falla |
| 3.1 — Migraciones de identidad | `src/modules/auth/schema.ts` (`users`), `src/modules/organizations/schema.ts` (`organizations`, `organization_members`), `drizzle/` con la migración inicial, y `global-setup.ts`, `test-database.ts`, `reset-database.ts` e `identity-schema.test.ts` en `tests/integration/` |
| 3.3 — Autenticación | En `src/modules/auth/`: `index.ts`, `service.ts`, `repository.ts`, `password.ts` (argon2id y política), `session-cookie.ts` (cookie e IP) y sus tests unitarios; `sessions` y `login_attempts` en `schema.ts`; `drizzle/0001_*`; `tests/integration/auth-service.test.ts` |
| 3.4 — Autorización y taxonomía de errores | `src/shared/errors/`; en `src/modules/organizations/`: `index.ts`, `service.ts` (`getAuthContext`, `authorize`, `getMember`), `repository.ts` y su test unitario; `tests/integration/authorization.test.ts` |
| 3.6 — Módulo de auditoría | En `src/modules/audit/`: `schema.ts` (`audit_logs`), `repository.ts`, `service.ts` (`recordAudit`), `index.ts` y su test unitario; el tipo `DbTransaction` en `src/shared/db/`; `drizzle/0002_*` y `drizzle/0003_*` (rol `crm_app`, privilegios y trigger); `tests/integration/audit.test.ts` |
| Resto de la Fase 3 | `seeds/` con el seed básico; `src/shared/log/`; `playwright.config.ts` y `tests/e2e/` con el login |
| Fase 4 | `src/modules/catalog/` e `inventory/` |
| Fase 5 | `src/modules/crm/` |
| Fase 6 | `src/modules/conversations/` e `ingestion/` |
| Fase 7 | `src/modules/analytics/` |

`public/` no se crea mientras no haya un recurso estático que servir.
