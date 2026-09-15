---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-14
git_ref: main — 8a4bac1 en origin/main (CI en verde), más el cierre de la 4.0 (commit y push autorizados)
active_phase: Fase 4 — Productos e inventario, en progreso desde el 2026-09-14
active_task: ninguna; 4.0 cerrada el 2026-09-14, la siguiente es la 4.1 (migraciones de catálogo e inventario), sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 4 — Productos e inventario, en progreso** desde el 2026-09-14. En Notion, el proyecto de la Fase 4 está en "En progreso" y la tarea 4.0 en "Completado". `confirmado`
- **Fase 3 cerrada** el 2026-09-14. `confirmado`

## 2. Último punto aprobado

- **Subfase 4.0 — Diseño visual base**, cerrada con confirmación del usuario el 2026-09-14. Entrada en [CHANGELOG.md](CHANGELOG.md); resolución y ajustes en el [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md). `confirmado`
- **CI en verde** en el commit `8a4bac1`: [ejecución 34916460308](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34916460308). `confirmado`

## 3. Próximo paso

1. **Al retomar**: leer este archivo, verificar Git y que la CI del commit de cierre de la 4.0 esté en verde (`gh run list -L 1`). `confirmado`
2. **Preparar el brief de la 4.1 — Migraciones de catálogo e inventario** (en Notion: "`products`, `inventories` e `inventory_movements`, con inmutabilidad de movimientos verificada por permisos"). Leer:
   - [DataModel.md](docs/architecture/DataModel.md);
   - [ADR 0008](docs/decisions/0008-stock-nunca-negativo.md): stock nunca negativo;
   - [ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md): `inventory_movements` de solo inserción, con privilegios a `crm_app` y trigger;
   - Roadmap, Fase 4: criterios de aceptación y gate de salida.

   `confirmado`
3. **Después**: 4.2 → 4.3 (4.3.1 a 4.3.3) → 4.4, en ese orden. Las pantallas 3 a 5 de la 4.4 nacen con los tokens y las clases de la 4.0, y con axe en claro y en oscuro. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg`, `postgres:18.6-trixie`, Drizzle 0.45.2 / Kit 0.31.10, `@node-rs/argon2` 2.2.1, `zod` 4.6.4, Tailwind CSS 4.3.3, Playwright 1.63.0, `@axe-core/playwright` 4.13.0, `tsx` 4.23.13; Manrope local (sin npm) | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Diseño visual base | tokens Laguna, Manrope, tema con cookie `crm_theme`; convención de estilos | [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md), [src/app/globals.css](src/app/globals.css), [form-styles.ts](src/app/_components/form-styles.ts) |
| Mecanismo de sesión | ADR 0012 con notas de la 3.3 y la 3.5 | [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md) |
| Rol de aplicación y solo inserción | ADR 0013 | [decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) |
| Interfaz pública de `auth` | `login`, `validateSession`, `logout`, `changePassword`, `completeRequiredPasswordChange`, `revokeUserSessions`, `hashPassword`, adaptador de cookie, `validateNewUser`, `prepareInitialPassword`, `createUserWithInitialPassword`, `setUserActive`, `getUserSummaries` | [src/modules/auth/index.ts](src/modules/auth/index.ts) |
| Interfaz pública de `organizations` | `getAuthContext`, `authorize`, `getMember`, `listMembers`, `createMember`, `changeMemberRole`, `deactivateMember`, `reactivateMember`, `getAppFrame` | [src/modules/organizations/index.ts](src/modules/organizations/index.ts) |
| Interfaz pública de `audit` | `recordAudit(tx, entry)`, `InvalidAuditEntryError` | [src/modules/audit/index.ts](src/modules/audit/index.ts) |
| Taxonomía de errores | `ErrorCode`, `HTTP_STATUS`, `Failure`, `failure()` | [src/shared/errors/index.ts](src/shared/errors/index.ts) |
| Log estructurado | `logEvent`, `newRequestId`, `formatLogEvent`; solo campos del evento | [src/shared/log/index.ts](src/shared/log/index.ts) |
| Sesión en páginas | `requireSession`, `requirePendingPasswordChange`, `redirectIfAuthenticated`, `currentContext` con `cache`; `logoutAction` | [src/app/_auth/](src/app/_auth/session.ts) |
| Marco común | route group `(autenticado)` con su `layout.tsx`: organización, navegación, usuario, selector de tema y salida | [src/app/(autenticado)/layout.tsx](<src/app/(autenticado)/layout.tsx>) |
| Estructura del repositorio | aprobada; lo de la 2.x, la 3.1 a 3.7 y la 4.0, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | dependencias, desfase, lint, typecheck, formato, guardas, unitarios, integración, build, Chromium y end-to-end | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| Entornos | Docker Compose; migraciones; base `_test`; rol `crm_app`; seed básico; base `_e2e` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | identidad, `sessions`, `login_attempts` y `audit_logs` implementadas; catálogo e inventario diseñados | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Modelo de seguridad | autenticación, autorización, auditoría, ingreso y gestión de miembros implementados; `Origin` diseñado | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Wireframes | 10 pantallas; la 1 y la 10 implementadas, más el marco común | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado en integración** para el ingreso, el cambio obligatorio de contraseña, el cierre de sesión, la pantalla 10 y el marco común, en claro y en oscuro. **Validado localmente y en CI** para la fundación técnica, el esquema de identidad, la autenticación, la autorización, la auditoría y la gestión de miembros a nivel de servicio. **Diseñado** para las demás pantallas y el resto del dominio.

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Todos los pasos de CI, incluido el end-to-end | validado en CI | Ejecución 34916460308 `success`, commit `8a4bac1` `confirmado` |
| Pantallas 1 y 10 y marco común con axe en claro y oscuro | validado en integración (`producer-consumer`) | `login.spec.ts` (12) y `users.spec.ts` (13), en local y en CI `confirmado` |
| Selector de tema, persistencia y fuente sin red | validado en integración (`producer-consumer`) | caso 13 de `users.spec.ts` `confirmado` |
| Regla del último `admin` con concurrencia, alta atómica, `CONFLICT` y auditoría de miembros | validado localmente y en CI | `tests/integration/members.test.ts` `confirmado` |
| `audit_logs` de solo inserción y `recordAudit` atómico | validado localmente y en CI | `tests/integration/audit.test.ts` `confirmado` |
| Suite completa local | validado localmente | `npm run test`: 192 de 193 (65 unitarios, 18 de 19 guardas por un timeout bajo carga, 109 de integración); guardas solas 19 de 19; `npm run test:e2e`: 25 de 25 `confirmado` |
| La cookie detrás de TLS y de un proxy real | diseñado | Fases 8 y 9 `confirmado` |
| La aplicación en ejecución restringida por `crm_app` | diseñado | Fases 8 y 9 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0013 aceptados. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3, 2.1 a 2.5, 3.1 a 3.7 y 4.0 en [docs/decisions/](docs/decisions/README.md). `confirmado`
- Convenciones:
  - enums `pgEnum`, `gen_random_uuid()`, `updated_at` en la aplicación y validación con `zod`;
  - resultados tipados con `Failure`, y orden de autorización `must_change_password` → rol → recurso filtrado por organización;
  - cada migración que crea una tabla otorga sus privilegios a `crm_app`;
  - un cambio auditado pasa su transacción a `recordAudit`; el módulo dueño del caso de uso abre la transacción y la pasa a los demás;
  - datos de otro módulo por su interfaz y composición en memoria, sin `JOIN` entre módulos;
  - una regla que cuenta filas bajo concurrencia bloquea la fila padre con `FOR UPDATE` y revalida al actor dentro del bloqueo;
  - toda mutación de UI es una Server Action; cada página y acción que toca datos resuelve la sesión contra la base, sin `proxy`. `setThemeAction` es la excepción documentada: no toca datos;
  - diálogos de los wireframes como páginas, y confirmaciones como segundo paso en la URL;
  - los componentes de cliente no importan `@/modules/*`;
  - cada pantalla tiene su end-to-end con axe en cada estado, en claro y en oscuro, teclado y foco;
  - **estilos solo con tokens** de `globals.css`, nunca colores de Tailwind; sin `transition-colors` en elementos que axe analiza tras emular el esquema.

  `confirmado`
- `forbidden()` y `unauthorized()` de Next.js 16.3 no se usan: son experimentales. `historico`

### Pendientes

- **`proxy`**: se reevalúa con más rutas protegidas (Fase 4). `confirmado`
- **Verificación de `Origin`** (`src/shared/http/`): con el primer Route Handler mutante. `confirmado`
- **`organization_id` y duración en el log**: con los casos de uso de la Fase 4. `inferido`
- **Lint de accesibilidad**: cuando `eslint-plugin-jsx-a11y` soporte ESLint 10. `confirmado`
- **`inventory_movements` de solo inserción según el ADR 0013**: 4.1. `confirmado`
- **Timeout de la guarda de frontera bajo carga**: si se repite en CI, subir el `testTimeout` del proyecto `guards` con su brief. `inferido`
- **Conexión con un rol con login miembro de `crm_app`, y `CREATEROLE` en un servicio gestionado**: Fases 8 y 9. `confirmado`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Fase 8. `historico`
- **IP detrás de un proxy real** (`TRUSTED_PROXY`): Fase 8 o 9. `historico`
- **Protección de rama**: se revisa si se suma otra persona o antes de producción (Fase 9). `historico`
- **Revisiones del stack**: Node 26 al entrar a LTS (2026-10-28); TypeScript 7.1; Drizzle 1.0; `crypto.argon2` nativo. `historico`
- **Ya asignadas a fases posteriores**: H-3 → Fases 4 y 5; H-5 → Fase 5; retención de mensajes → Fase 9; secretos → 9.1; backups → 9.2. `historico`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`. La 4.0 dejó `main` en rojo unos minutos (`e5029e1`) hasta el arreglo. `confirmado`
- **Memoria de la máquina local**: 7,7 GB con muy poca libre. `npm run build` falló por falta de memoria hasta cerrar aplicaciones. `confirmado`
- **Ver el CRM en local**: `docker compose up -d --wait`, `npm run db:migrate`, `npm run db:seed` y `npm run dev`, en `http://localhost:3000`. El `.env` local tiene `SEED_USER_PASSWORD`; la base de desarrollo está migrada y sembrada. `confirmado`
- **End-to-end local**: requiere `npm run build` antes de `npm run test:e2e`, y `npx playwright install chromium` una vez por máquina. La base `<nombre>_e2e` se recrea en cada ejecución. `confirmado`
- **Tipos viejos en `.next/dev/`**: al mover o borrar una ruta, borrar `.next/dev/` si el typecheck o el build la siguen referenciando. `historico`
- **La guarda de referencias prohibidas lee el índice de Git**: un archivo borrado del disco pero no del índice la hace fallar con `ENOENT`. `historico`
- **Cookie en tests**: `next start` la emite `Secure` con `__Host-` sobre `http://localhost`, que Chromium acepta. Detrás de TLS real no se probó. `confirmado`
- **Límite de intentos por IP compartido sin proxy**: todos los tests end-to-end comparten una clave. Cada test borra `login_attempts` antes de empezar. `confirmado`
- **Limitación aceptada (brief-3.5, D-4)**: quien robe la sesión del primer ingreso puede definir la contraseña sin la inicial. `historico`
- **Contraseña inicial**: el `admin` la transmite por fuera del CRM. `historico`
- **Solo inserción de `audit_logs`**: con el rol dueño la defensa efectiva es el trigger; `TRUNCATE` y un superusuario pueden saltearlo. `historico`
- **`npm run test` requiere la base local levantada**: `docker compose up -d --wait`. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **Tests con `db.execute` crudo**: `timestamptz` llega como texto; compararlo en SQL. `ON DELETE RESTRICT` informa `23001`. `historico`
- **Formatear antes de verificar**: Prettier puede partir líneas y dejar sin efecto directivas. `confirmado`
- **Avisos inocuos**: Vite por el import sin extensión en `vitest.config.mts`; Next.js por un `package-lock.json` fuera del repositorio en `C:\Users\benja`. `confirmado`
- **PowerShell 5.1**: corta los mensajes de commit con comillas dobles y rompe expresiones `jq` con comillas simples; usar Bash. `confirmado`
- **Un hook de seguridad bloquea `Remove-Item` y `taskkill /T /F`**. `historico`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `historico`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): alcance y criterios de la Fase 4.
- [architecture/DataModel.md](docs/architecture/DataModel.md), [ADR 0008](docs/decisions/0008-stock-nunca-negativo.md) y [ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).
- [product/Screens.md](docs/product/Screens.md) §3 a §5 con sus wireframes, para la 4.4.
- [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md) y [EngineeringStandards.md](docs/development/EngineeringStandards.md), convención de estilos.
- [src/modules/organizations/index.ts](src/modules/organizations/index.ts), [src/modules/audit/index.ts](src/modules/audit/index.ts) y `drizzle/0002_*` y `0003_*` como referencia de privilegios y trigger de solo inserción.

## 9. Cambios ajenos del usuario detectados

Ninguno en el repositorio. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y el push del cierre de la 4.0 y el cambio de estado en Notion quedan consumidos al ejecutarse. Instalar dependencias, ejecutar migraciones, cambios en Notion y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que la CI del commit de cierre de la 4.0 quede en verde. Se verifica al hacer el push y se vuelve a comprobar al retomar.
- Alcance exacto de la 4.1 contra DataModel, al preparar su brief.
