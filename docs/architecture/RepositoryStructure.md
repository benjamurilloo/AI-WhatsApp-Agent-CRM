# Estructura del repositorio

**Estado: diseñado, con lo de la 2.3 y la 2.4 implementado.** Existen `docs/`, la configuración de la 2.3 y `src/app/` con layout y página. La 2.4 agregó Docker Compose, `drizzle.config.ts`, `src/shared/db/`, `/api/health` y `tests/integration/`; la 2.5, `.github/workflows/ci.yml` y `tests/guards/`; la 3.1, los `schema.ts` de `auth` y `organizations`, `drizzle/` con la migración inicial y la base de test de `tests/integration/`; la 3.3 a la 3.6, los módulos `auth`, `organizations` y `audit` y `src/shared/errors/`; la 3.5, las rutas de ingreso, `src/shared/log/`, `seeds/`, `tests/e2e/`, `playwright.config.ts` y `postcss.config.mjs`; la 3.7, el grupo de rutas `(autenticado)/` con el marco común y la pantalla de usuarios; la 4.0, `_theme/` y `_fonts/` con el diseño visual base. El resto se crea en las subfases que indica la tabla final. Resuelta en la subfase 2.1 ([brief-2.1](../decisions/brief-2.1-estructura-del-repositorio.md)) sobre el stack del [ADR 0004](../decisions/0004-stack-tecnologico-propuesto.md).

Ubica en carpetas los módulos y las reglas de dependencia de [Overview.md](Overview.md). No los cambia: si este documento y Overview se contradicen, manda Overview y la discrepancia se corrige aquí.

## Árbol

```text
/
├── src/
│   ├── app/                         Rutas de Next.js: páginas, layouts y route handlers delgados
│   │   ├── layout.tsx               Fuente y tema leídos en el servidor (4.0)
│   │   ├── globals.css              Tailwind CSS (3.5) y tokens del diseño visual base (4.0)
│   │   ├── (autenticado)/           Grupo de rutas con el marco común; no agrega segmento a la URL (3.7)
│   │   │   ├── layout.tsx           Marco común: organización, usuario, navegación y salida
│   │   │   ├── page.tsx             / protegida provisional (3.5)
│   │   │   └── usuarios/            Pantalla 10: lista, nuevo/ y [memberId]/, acciones y mensajes (3.7)
│   │   ├── login/                   Pantalla 1: página, formulario y Server Action (3.5)
│   │   ├── cambiar-contrasena/      Cambio obligatorio de contraseña (3.5)
│   │   ├── _auth/                   Helper de sesión y redirecciones, mensajes, cierre de sesión (3.5)
│   │   ├── _components/             Componentes compartidos de pantalla (3.5, 3.7 y 4.0)
│   │   ├── _theme/                  Preferencia de tema: lectura, validación y Server Action (4.0)
│   │   ├── _fonts/                  Manrope variable y su licencia OFL (4.0)
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
│       ├── db/                      Cliente de Drizzle, conexión y health check de la base
│       │   ├── index.ts             Interfaz pública: createDb, getDb, checkDatabase
│       │   ├── client.ts
│       │   └── health.ts
│       ├── errors/                  Taxonomía de errores (3.4)
│       └── log/                     Log estructurado JSON con request_id (3.5)
├── drizzle/                         Migraciones SQL generadas por Drizzle Kit (versionadas)
├── seeds/                           Seeds sintéticos: basic.ts (3.5), conversations.ts y volume.ts (6.2)
├── tests/
│   ├── guards/                      Guardas sin base: referencias prohibidas, frontera entre módulos y escrituras del saldo
│   ├── integration/                 Contra PostgreSQL real, en la base <nombre>_test
│   │   ├── global-setup.ts          Recrea y migra la base de test en cada ejecución (3.1)
│   │   ├── test-database.ts         Deriva las URL de las bases _test y _e2e desde DATABASE_URL
│   │   ├── reset-database.ts        Vacía las tablas antes de cada test
│   │   └── *.test.ts                db-connectivity (2.4), identity-schema (3.1) y siguientes
│   ├── fixtures/                    Fixtures compartidos: ingestion/v1/, con forma asumida (6.5.1)
│   └── e2e/                         Playwright sobre las pantallas, en la base <nombre>_e2e (3.5)
│       ├── global-setup.ts          Recrea, migra y siembra la base de e2e
│       └── *.spec.ts                login (3.5) y users (3.7)
├── .github/
│   └── workflows/
│       └── ci.yml                   CI de GitHub Actions
├── docs/                            Incluye contracts/ con los contratos versionados (6.5.1)
├── package.json · package-lock.json
├── tsconfig.json                    strict: true; alias @/* → src/*
├── next.config.ts
├── eslint.config.mjs                Incluye la regla de frontera entre módulos
├── prettier.config.mjs
├── .prettierignore                  Excluye Markdown y generados
├── vitest.config.mts                Proyectos: unitario, guardas e integración
├── playwright.config.ts             Chromium sobre next start (3.5)
├── postcss.config.mjs               Plugin de Tailwind CSS (3.5)
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
- Las carpetas con guion bajo (`_auth/`, `_components/`, `_theme/`, `_fonts/`) son privadas de Next.js: no crean rutas. Guardan lo que comparten varias pantallas (3.5 y 4.0).
- Las carpetas entre paréntesis, como `(autenticado)/`, son grupos de rutas: comparten un layout sin agregar un segmento a la URL. El layout del grupo muestra el marco común, pero no reemplaza la verificación de sesión de cada página y cada acción (3.7).
- Un componente de cliente no importa `@/modules/*`: recibe datos y estado ya resueltos por la página o la Server Action.

### Código compartido

- `src/shared/db/` es la única carpeta compartida fijada en esta estructura: cliente de Drizzle, conexión y health check.
- `src/shared/errors/` (3.4) contiene la taxonomía de errores de Overview: códigos, HTTP por código y tipo `Failure`.
- `src/shared/log/` (3.5) contiene el log estructurado con `request_id`.
- `src/shared/quantity/` (4.2) contiene las cantidades `numeric(14, 3)` como `bigint` en milésimas: parseo de entrada, conversión desde y hacia la base, sin `number` ([brief-4.2](../decisions/brief-4.2-servicio-de-catalogo.md), D-2).
- `src/shared/http/` (6.5.3) contiene la lectura del cuerpo con límite de bytes y la comprobación de `Content-Type`. Estaba prevista en la 3.4 (D-5) para la verificación de `Origin`, que el endpoint de ingestión no necesita (brief-6.5.3, D-5).
- `scripts/` (6.5.3) contiene tareas locales que se corren con `tsx`, como `ingestion-credential.ts`. No se importa desde `src/`.
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
| Guardas | `tests/guards/` | Proyecto `guards` de Vitest, sin base de datos: referencias prohibidas, frontera entre módulos y escrituras del saldo (4.3.1) |
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
| 3.5 — Pantalla de inicio de sesión | `postcss.config.mjs` y `src/app/globals.css`; `src/app/login/`, `src/app/cambiar-contrasena/`, `src/app/_auth/` y `src/app/_components/`; `/` protegida provisional; `src/shared/log/`; `seeds/basic.ts`; `playwright.config.ts` y `tests/e2e/`; `tests/integration/seed.test.ts` |
| 3.7 — Gestión de usuarios y roles | `src/app/(autenticado)/` con el marco común (`layout.tsx`), `/` movida desde `src/app/page.tsx` y `usuarios/`; `app-nav.tsx`, `copy-button.tsx` y `page-notice.tsx` en `src/app/_components/`; casos de uso de miembros en `organizations` y funciones con transacción en `auth`; `src/modules/auth/initial-password.test.ts`; `tests/integration/members.test.ts` y `tests/e2e/users.spec.ts` |
| 4.0 — Diseño visual base | Tokens en `src/app/globals.css`; `src/app/_fonts/` (Manrope y OFL); `src/app/_theme/` (`theme.ts` y su test, `read-theme.ts`, `actions.ts`); `theme-selector.tsx` en `src/app/_components/`; caso 13 de `tests/e2e/users.spec.ts` y axe en claro y oscuro |
| 4.1 — Migraciones de catálogo e inventario | `src/modules/catalog/schema.ts` (`products`) y `src/modules/inventory/schema.ts` (`inventories`, `inventory_movements`), solo con su esquema; `drizzle/0004_*` y `drizzle/0005_*` (privilegios y trigger de solo inserción); `tests/integration/catalog-inventory-schema.test.ts` |
| 4.2 — Servicio de catálogo | En `src/modules/catalog/`: `index.ts`, `service.ts` (casos de uso, validación y `deriveStockStatus`), `repository.ts` y su test unitario; en `src/modules/inventory/`: `index.ts`, `service.ts` (lista y detalle con saldo y estado), `repository.ts` (solo lectura) y su test unitario; `src/shared/quantity/` con su test; `drizzle/0006_*` (índice de nombre sin distinguir mayúsculas); `tests/integration/catalog.test.ts` |
| 4.3.1 — Transacción de ajuste de stock | En `src/modules/inventory/`: `adjustStock`, su validación y el cálculo del saldo en `service.ts`, `lockBalance` y `applyStockChange` (única escritura del saldo) en `repository.ts`, con sus tests unitarios; `lockProductForStockChange` en `catalog`; `tests/guards/stock-writes.test.ts`; `tests/integration/inventory-adjustment.test.ts` |
| 4.4 — UI de productos e inventario | `src/app/(autenticado)/productos/` completo (lista, alta, detalle con edición y auditoría, y movimientos con ajuste), con sus `filters.ts`, `messages.ts`, `actions.ts`, componentes de cliente y tests unitarios; `src/app/_format/` (fechas en la zona de la organización); `formatQuantity` en `src/shared/quantity/`; `organization_id` y duración en `src/shared/log/`; lectura de auditoría en `src/modules/audit/` y `listProductAudit` en `catalog`; `tests/integration/product-audit.test.ts` y `tests/e2e/products.spec.ts` |
| 4.3.3 — Historial de movimientos | En `src/modules/inventory/`: `listStockMovements`, la validación de filtros y la página en `service.ts`, y las consultas del historial en `repository.ts`, con sus tests unitarios; `getOrganizationTimezone` en `organizations`; `drizzle/0007_*` (`created_at` con `clock_timestamp()`); `tests/integration/inventory-history.test.ts` |
| 5.1 — Migración de clientes | `src/modules/crm/schema.ts` (`clients`), solo con su esquema; `drizzle/0008_*` y `drizzle/0009_*` (privilegios); `tests/integration/clients-schema.test.ts` |
| 5.2 — Servicio de clientes | En `src/modules/crm/`: `index.ts`, `service.ts` (casos de uso, validación, búsqueda, lista y auditoría del cliente), `repository.ts` y `phone.ts` (normalización y enmascarado), con sus tests unitarios; `tests/integration/crm.test.ts` |
| 5.3 — UI de clientes | `src/app/(autenticado)/clientes/` completo (lista, alta y detalle con edición, desactivación y auditoría), con sus `filters.ts`, `messages.ts`, `actions.ts`, `phone-display.ts` y `phone-text.tsx`, el resumen de auditoría, los componentes de cliente y sus tests unitarios; enlace "Clientes" en el marco común; `tests/e2e/clients.spec.ts` |
| 6.1 — Migraciones de conversaciones | `src/modules/conversations/schema.ts` (`conversations`, `messages`) y `src/modules/ingestion/schema.ts` (`ingestion_events`), solo con su esquema; `UNIQUE(organization_id, id)` en `clients`; `drizzle/0010_*` (ese `UNIQUE`), `drizzle/0011_*` (tablas) y `drizzle/0012_*` (privilegios y triggers); `tests/integration/conversations-schema.test.ts` |
| 6.2 — Seeds sintéticos de conversaciones | `seeds/conversations.ts` (conversaciones de ejemplo, llamado desde `npm run db:seed`) y `seeds/volume.ts` (`npm run db:seed:volume`); `tests/integration/conversations-seed.test.ts` |
| 6.3 — Servicio de consulta y estado | En `src/modules/conversations/`: `index.ts`, `service.ts` (lista, detalle, timeline por cursor, cambio de estado auditado, actividad del cliente y clientes por última interacción) y `repository.ts`, con su test unitario; `listClientOrderKeys` y `getClientsByIds` en `crm`; `src/shared/calendar/` (fechas de calendario, también para `inventory`); `tests/integration/conversations.test.ts` |
| 6.4 — UI de conversaciones | `src/app/(autenticado)/conversaciones/` (lista y detalle con timeline y cambio de estado, con `filters.ts`, `messages.ts`, `actions.ts`, la tabla y la etiqueta de estado compartidas y sus tests unitarios); última interacción y sección de conversaciones en `clientes/`; enlace "Conversaciones" en el marco común; `formatDate` y `formatTime` en `_format`; `tests/e2e/conversations.spec.ts` |
| 6.5.1 — Contrato de ingestión y validación | `docs/contracts/ingestion-v1.md`; en `src/modules/ingestion/`: `contract.ts` (esquema del evento v1 y `payload_hash`), `index.ts` y `contract.test.ts`; `tests/fixtures/ingestion/v1/` |
| 6.5.2 — Registro idempotente y proyección | En `src/modules/ingestion/`: `service.ts` (`recordIngestionEvent`), `repository.ts` y `service.test.ts`; `recordIngestedMessage` en `conversations`; `findClientIdByPhone` en `crm`; `tests/integration/ingestion.test.ts` |
| 6.5.3 — Autenticación de servicio y rate limit | En `src/modules/ingestion/`: `credentials.ts`, `rate-limit.ts`, `config.ts` y `credentials.test.ts`, y las tablas nuevas en `schema.ts`; `drizzle/0013` y `0014`; `src/shared/http/`; `src/app/api/ingestion/v1/events/` (`route.ts` y `handler.ts`); `scripts/ingestion-credential.ts`; `tests/integration/ingestion-http.test.ts` y `tests/e2e/ingestion.spec.ts` |
| 7.1 — Métricas de volumen | En `src/modules/analytics/`: `index.ts`, `service.ts` (período y métricas 1 a 6 y 10), `repository.ts` (lecturas sobre `conversations/schema`) y `service.test.ts`, sin `schema.ts`; `tests/integration/analytics.test.ts` |
| 7.2 — Métricas de respuesta y estado | Métricas 7, 8, 9 y 11 en `service.ts` y `repository.ts` de `analytics`; `tests/integration/analytics-response.test.ts` con su propio fixture y `tests/integration/analytics-helpers.ts`, con los ayudantes de inserción que comparten las dos suites de métricas |
| 7.3 — Métrica de errores de ingestión | Métrica 12 en `service.ts` y `repository.ts` de `analytics`, que pasa a leer `ingestion/schema` y la interfaz pública de `ingestion`; `tests/integration/analytics-ingestion.test.ts` con su propio fixture, y el ayudante de inserción de eventos en `analytics-helpers.ts` |
| Fase 4 | `src/modules/catalog/` e `inventory/` |
| Fase 5 | `src/modules/crm/` |
| Fase 6 | `src/modules/conversations/` e `ingestion/` |
| Fase 7 | `src/modules/analytics/` |

`public/` no se crea mientras no haya un recurso estático que servir.
