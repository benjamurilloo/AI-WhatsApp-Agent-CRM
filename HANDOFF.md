---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-15
git_ref: main — cb81303 en origin/main (CI en verde), más el cierre de la 4.3.3 (commit y push autorizados)
active_phase: Fase 4 — Productos e inventario, en progreso desde el 2026-09-14
active_task: ninguna; 4.3.3 cerrada el 2026-09-15, la siguiente es la 4.4 (pantallas 3 a 5 y FR-AUD-02), sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 4 — Productos e inventario, en progreso** desde el 2026-09-14. En Notion, el proyecto de la Fase 4 está en "En progreso" y las tareas 4.0, 4.1, 4.2, 4.3.1, 4.3.2 y 4.3.3 en "Completado". La descripción de la 4.4 suma FR-AUD-02. `confirmado`
- **Sesión**: el usuario decidió el 2026-09-15 seguir la Fase 4 en la misma sesión hasta pasar a la Fase 5. `confirmado`
- **Fase 3 cerrada** el 2026-09-14. `confirmado`

## 2. Último punto aprobado

- **Subfase 4.3.3 — Historial de movimientos**, cerrada con confirmación del usuario el 2026-09-15. Entrada en [CHANGELOG.md](CHANGELOG.md); resolución, cierre y ajustes en el [brief-4.3.3](docs/decisions/brief-4.3.3-historial-de-movimientos.md). `confirmado`
- **CI en verde** en el commit `cb81303`: [ejecución 35030637332](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35030637332), incluido el control de migraciones al día con los esquemas. `confirmado`

## 3. Próximo paso

1. **Al retomar**: leer este archivo, verificar Git y que la CI del commit de cierre de la 4.3.3 esté en verde (`gh run list -L 1`). `confirmado`
2. **Preparar el brief de la 4.4 — Pantallas de productos e inventario** (en Notion: pantallas 3, 4 y 5, más FR-AUD-02). Leer:
   - [Screens.md](docs/product/Screens.md) §3 a §5 y sus wireframes 03, 04 y 05;
   - la interfaz de `inventory`: `listProductStock`, `getProductStock`, `adjustStock` y `listStockMovements` con `MOVEMENTS_PAGE_SIZE`, `timezone` y `productHasMovements`;
   - decisiones que la 4.3.x dejó para acá: **presentación de cantidades** ("2,5" en lugar de "2.500"), **mensajes por `rule`** del ajuste, **períodos predefinidos** del selector del historial traducidos a fechas, **formato de fechas** con la zona devuelta, y **unificar `fields` del `VALIDATION_ERROR` por id inválido**;
   - convenciones de UI vigentes: Server Actions, diálogos como páginas, `organization_id` y duración en el log, tokens de `globals.css` y end-to-end con axe en claro y oscuro.

   `confirmado`
3. **Después**: cierre de la Fase 4 contra su gate de salida y paso a la Fase 5. `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg`, `postgres:18.6-trixie`, Drizzle 0.45.2 / Kit 0.31.10, `@node-rs/argon2` 2.2.1, `zod` 4.6.4, Tailwind CSS 4.3.3, Playwright 1.63.0, `@axe-core/playwright` 4.13.0, `tsx` 4.23.13; Manrope local (sin npm) | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Diseño visual base | tokens Laguna, Manrope, tema con cookie `crm_theme`; convención de estilos | [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md), [src/app/globals.css](src/app/globals.css), [form-styles.ts](src/app/_components/form-styles.ts) |
| Mecanismo de sesión | ADR 0012 con notas de la 3.3 y la 3.5 | [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md) |
| Rol de aplicación y solo inserción | ADR 0013; `audit_logs` e `inventory_movements` | [decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) |
| Esquema de catálogo e inventario | `products`, `inventories`, `inventory_movements`; migraciones 0004 a 0007 | [src/modules/catalog/schema.ts](src/modules/catalog/schema.ts), [src/modules/inventory/schema.ts](src/modules/inventory/schema.ts) |
| Interfaz pública de `auth` | `login`, `validateSession`, `logout`, `changePassword`, `completeRequiredPasswordChange`, `revokeUserSessions`, `hashPassword`, adaptador de cookie, `validateNewUser`, `prepareInitialPassword`, `createUserWithInitialPassword`, `setUserActive`, `getUserSummaries` | [src/modules/auth/index.ts](src/modules/auth/index.ts) |
| Interfaz pública de `organizations` | `getAuthContext`, `authorize`, `getMember`, `getOrganizationTimezone`, `listMembers`, `createMember`, `changeMemberRole`, `deactivateMember`, `reactivateMember`, `getAppFrame` | [src/modules/organizations/index.ts](src/modules/organizations/index.ts) |
| Interfaz pública de `audit` | `recordAudit(tx, entry)`, `InvalidAuditEntryError` | [src/modules/audit/index.ts](src/modules/audit/index.ts) |
| Interfaz pública de `catalog` | `createProduct`, `updateProduct`, `deactivateProduct`, `reactivateProduct`, `getProduct`, `searchProducts`, `deriveStockStatus`, `lockProductForStockChange(tx, …)` y sus tipos | [src/modules/catalog/index.ts](src/modules/catalog/index.ts) |
| Interfaz pública de `inventory` | `listProductStock`, `getProductStock`, `PRODUCTS_PAGE_SIZE`, `adjustStock`, `listStockMovements`, `MOVEMENTS_PAGE_SIZE` y sus tipos (`StockAdjustmentInput`, `StockAdjustmentResult`, `MovementHistoryFilters`, `StockMovement`, `StockMovementPage`) | [src/modules/inventory/index.ts](src/modules/inventory/index.ts) |
| Escritura del saldo | solo `lockBalance` (crea la fila en 0) y `applyStockChange` (movimiento y saldo); guarda `stock-writes.test.ts` | [src/modules/inventory/repository.ts](src/modules/inventory/repository.ts), [tests/guards/stock-writes.test.ts](tests/guards/stock-writes.test.ts) |
| Cantidades | `parseQuantityInput`, `quantityFromDatabase`, `quantityToDatabase`, `MAX_QUANTITY`; `bigint` en milésimas | [src/shared/quantity/index.ts](src/shared/quantity/index.ts) |
| Taxonomía de errores | `ErrorCode`, `HTTP_STATUS`, `Failure`, `failure()` | [src/shared/errors/index.ts](src/shared/errors/index.ts) |
| Log estructurado | `logEvent`, `newRequestId`, `formatLogEvent`; solo campos del evento | [src/shared/log/index.ts](src/shared/log/index.ts) |
| Sesión en páginas | `requireSession`, `requirePendingPasswordChange`, `redirectIfAuthenticated`, `currentContext` con `cache`; `logoutAction` | [src/app/_auth/](src/app/_auth/session.ts) |
| Marco común | route group `(autenticado)` con su `layout.tsx`: organización, navegación, usuario, selector de tema y salida | [src/app/(autenticado)/layout.tsx](<src/app/(autenticado)/layout.tsx>) |
| Estructura del repositorio | aprobada; lo de la 2.x, la 3.1 a 3.7 y la 4.0 a 4.3.3, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | dependencias, desfase, lint, typecheck, formato, guardas, unitarios, integración, build, Chromium y end-to-end | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| Entornos | Docker Compose; migraciones; base `_test`; rol `crm_app`; seed básico; base `_e2e` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | identidad, `sessions`, `login_attempts`, `audit_logs`, `products`, `inventories` e `inventory_movements` implementadas; clientes, conversaciones e ingestión diseñados | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Modelo de seguridad | autenticación, autorización, auditoría, ingreso y gestión de miembros implementados; `Origin` diseñado | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Wireframes | 10 pantallas; la 1 y la 10 implementadas, más el marco común | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado en integración** para el ingreso, el cambio obligatorio de contraseña, el cierre de sesión, la pantalla 10 y el marco común, en claro y en oscuro. **Validado localmente y en CI** para la fundación técnica, el esquema de identidad, la autenticación, la autorización, la auditoría, la gestión de miembros a nivel de servicio, el esquema de catálogo e inventario, el servicio de catálogo, el ajuste de stock secuencial y bajo concurrencia, y el historial de movimientos. **Diseñado** para las pantallas 3 a 5 y el resto del dominio.

Los tres criterios de aceptación de la Fase 4 del Roadmap están cubiertos a nivel de servicio y base; falta la 4.4 (pantallas) para su gate de salida. `confirmado`

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Todos los pasos de CI, incluido el desfase de migraciones y el end-to-end | validado en CI | Ejecución 35030637332 `success`, commit `cb81303` `confirmado` |
| Historial de movimientos: orden, paginación en SQL, filtros por tipo y período en la zona de la organización, autor, autorización y aislamiento | validado localmente y en CI | `tests/integration/inventory-history.test.ts` (13), unitarios de filtros y páginas `confirmado` |
| `created_at` de un movimiento es la hora del `INSERT`, con el saldo bloqueado, y el historial encadena los saldos tras una carrera | validado localmente y en CI | Caso de `tests/integration/catalog-inventory-schema.test.ts` y caso 6 de `inventory-concurrency.test.ts` `confirmado` |
| Ajustes concurrentes sin actualizaciones perdidas ni saldo negativo; ajuste y desactivación sin cruce | validado localmente y en CI | `tests/integration/inventory-concurrency.test.ts`, con evidencia de mutación en el brief-4.3.2 `confirmado` |
| Ajuste de stock secuencial: movimiento, saldo y auditoría atómicos; rechazos sin efectos; autorización y aislamiento | validado localmente y en CI | `tests/integration/inventory-adjustment.test.ts` (13) y unitarios de `inventory` `confirmado` |
| Ninguna escritura del saldo fuera de `lockBalance` y `applyStockChange` en `src/` | validado localmente y en CI | `tests/guards/stock-writes.test.ts`, con casos que fallan `confirmado` |
| Servicio de catálogo: escrituras auditadas, `CONFLICT` por SKU con altas simultáneas, autorización, aislamiento, lista y detalle con estado de stock | validado localmente y en CI | `tests/integration/catalog.test.ts` (23) y unitarios `confirmado` |
| Esquema de catálogo e inventario: unicidad, `CHECK`, claves compuestas, `RESTRICT` y solo inserción de `inventory_movements` | validado localmente y en CI | `tests/integration/catalog-inventory-schema.test.ts` (26) y `audit.test.ts` `confirmado` |
| Pantallas 1 y 10 y marco común con axe en claro y oscuro | validado en integración (`producer-consumer`) | `login.spec.ts` (12) y `users.spec.ts` (13), en local y en CI `confirmado` |
| Regla del último `admin` con concurrencia, alta atómica, `CONFLICT` y auditoría de miembros | validado localmente y en CI | `tests/integration/members.test.ts` `confirmado` |
| `audit_logs` de solo inserción y `recordAudit` atómico | validado localmente y en CI | `tests/integration/audit.test.ts` `confirmado` |
| Suite completa local | validado localmente | `npm run test`: 327 de 327; `npm run test:e2e`: 25 de 25 `confirmado` |
| Pantallas 3 a 5 e historial de auditoría | diseñado | 4.4 `confirmado` |
| La cookie detrás de TLS y de un proxy real | diseñado | Fases 8 y 9 `confirmado` |
| La aplicación en ejecución restringida por `crm_app` | diseñado | Fases 8 y 9 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0013 aceptados. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3, 2.1 a 2.5, 3.1 a 3.7, 4.0 a 4.2, 4.3.1, 4.3.2 y 4.3.3 en [docs/decisions/](docs/decisions/README.md). `confirmado`
- Convenciones:
  - enums `pgEnum`, `gen_random_uuid()`, `updated_at` en la aplicación y validación con `zod`;
  - resultados tipados con `Failure`, y orden de autorización `must_change_password` → rol → recurso filtrado por organización;
  - cada migración que crea una tabla otorga sus privilegios a `crm_app`; privilegios y triggers en una migración `--custom` aparte de la generada;
  - una tabla que referencia una entidad de negocio de la organización usa clave foránea compuesta `(organization_id, entity_id)` hacia un `UNIQUE(organization_id, id)` del dueño (4.1, D-3); `users` sigue con clave simple (ADR 0010);
  - **cantidades `numeric(14, 3)` como `bigint` en milésimas con `src/shared/quantity/`**, nunca con `number` (4.1, D-4; 4.2, D-2);
  - identificadores de negocio únicos sin distinguir mayúsculas con índice sobre `lower(...)` (email en la 3.1, SKU en la 4.1); búsqueda de texto por prefijo sobre `lower(...) text_pattern_ops`, escapando `%` y `_` (4.2, D-3);
  - `CONFLICT` por unicidad: escritura en un savepoint y traducción de `23505` por nombre de constraint (3.7 y 4.2);
  - un cambio sin diferencias devuelve `changed: false` y no escribe ni audita;
  - un cambio auditado pasa su transacción a `recordAudit`; el módulo dueño del caso de uso abre la transacción y la pasa a los demás, que la exigen por tipo (`lockProductForStockChange` en la 4.3.1);
  - datos de otro módulo por su interfaz y composición en memoria, sin `JOIN` entre módulos; quien depende compone (`organizations` con `auth`, `inventory` con `catalog` y con `auth`); ninguna regla que cruza módulos va a un trigger;
  - escritura sobre una entidad editable: fila con `FOR UPDATE`, `diff` sobre lo leído y última escritura gana (4.2, D-5);
  - **ajuste de stock**: orden fijo de bloqueos, producto con `FOR SHARE` y saldo con `FOR UPDATE`; saldo esperado obligatorio con `CONFLICT`; `BUSINESS_RULE_VIOLATION` con `rule` y datos tipados (4.3.1, D-1 a D-3);
  - **un rechazo después de escribir se lanza dentro de la transacción** y se convierte en resultado tipado fuera, para revertirla entera (4.3.1);
  - **tests de concurrencia**: otra conexión retiene el bloqueo, se espera en `pg_stat_activity` a las conexiones con `wait_event_type = 'Lock'` antes de soltar, un `afterEach` suelta lo retenido, y cada test se corre una vez con su bloqueo quitado para registrar que falla (4.3.2, D-1, D-2 y D-4);
  - **fecha de una fila de evento**: `clock_timestamp()`, la hora del `INSERT` con el bloqueo tomado, cuando el orden de lectura tiene que seguir la cadena que ese bloqueo serializa (4.3.3, D-1);
  - **listas largas paginadas en SQL** con conteo y desempate estable, frente a la composición en memoria de miembros y productos, que se usa solo donde el conjunto es acotado (4.3.3, D-2);
  - **períodos por día de calendario** semiabiertos `[desde, hasta + 1 día)`, convertidos por PostgreSQL con la zona IANA de la organización que devuelve `getOrganizationTimezone`, nunca con un desfase fijo (4.3.3, D-3 y D-4);
  - una regla que cuenta filas bajo concurrencia bloquea la fila padre con `FOR UPDATE` y revalida al actor dentro del bloqueo;
  - toda mutación de UI es una Server Action; cada página y acción que toca datos resuelve la sesión contra la base, sin `proxy`. `setThemeAction` es la excepción documentada: no toca datos;
  - diálogos de los wireframes como páginas, y confirmaciones como segundo paso en la URL;
  - los componentes de cliente no importan `@/modules/*`;
  - cada pantalla tiene su end-to-end con axe en cada estado, en claro y en oscuro, teclado y foco;
  - estilos solo con tokens de `globals.css`, nunca colores de Tailwind; sin `transition-colors` en elementos que axe analiza tras emular el esquema.

  `confirmado`
- `forbidden()` y `unauthorized()` de Next.js 16.3 no se usan: son experimentales. `historico`

### Pendientes

- **Presentación de cantidades** ("2,5" en lugar de "2.500"), **mensajes por `rule`** del ajuste, **períodos predefinidos** del historial y **formato de fechas** con la zona devuelta: 4.4. `confirmado`
- **`VALIDATION_ERROR` por id inválido**: `updateProduct` y `adjustStock` lo devuelven con `fields: []`, `listStockMovements` y las demás funciones sin `fields`; se unifica en la 4.4. `confirmado`
- **Nombre del paso de guardas en `ci.yml`**: sigue diciendo "referencias prohibidas y frontera entre módulos", aunque corre también `stock-writes.test.ts`. Se renombra en una subfase que autorice `ci.yml`. `confirmado`
- **`proxy`**: se reevalúa con más rutas protegidas (Fase 4). `confirmado`
- **Verificación de `Origin`** (`src/shared/http/`): con el primer Route Handler mutante. `confirmado`
- **`organization_id` y duración en el log**: con las Server Actions de la 4.4. `inferido`
- **Búsqueda sin distinguir acentos** y costo de la lista en memoria con volumen real: Fase 8. `confirmado`
- **Costo de `offset` en páginas lejanas del historial**: se revisa con volumen real en la Fase 8. `confirmado`
- **Lint de accesibilidad**: cuando `eslint-plugin-jsx-a11y` soporte ESLint 10. `confirmado`
- **Timeout de la guarda de frontera bajo carga**: no se repitió desde la 4.1; si se repite en CI, subir el `testTimeout` del proyecto `guards` con su brief. `inferido`
- **Conexión con un rol con login miembro de `crm_app`, y `CREATEROLE` en un servicio gestionado**: Fases 8 y 9. `confirmado`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Fase 8. `historico`
- **IP detrás de un proxy real** (`TRUSTED_PROXY`): Fase 8 o 9. `historico`
- **Protección de rama**: se revisa si se suma otra persona o antes de producción (Fase 9). `historico`
- **Revisiones del stack**: Node 26 al entrar a LTS (2026-10-28); TypeScript 7.1; Drizzle 1.0; `crypto.argon2` nativo. `historico`
- **Ya asignadas a fases posteriores**: H-3 → Fases 4 y 5; H-5 → Fase 5; retención de mensajes → Fase 9; secretos → 9.1; backups → 9.2. `historico`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`, incluidos sus pasos. `confirmado`
- **Docker Desktop no arranca solo**: puede estar detenido al empezar la sesión. `docker compose up -d --wait` falla hasta abrirlo. `confirmado`
- **Memoria de la máquina local**: 7,7 GB con muy poca libre. `npm run build` falló por falta de memoria en la 4.0 hasta cerrar aplicaciones; desde la 4.1 pasó. `confirmado`
- **Ver el CRM en local**: `docker compose up -d --wait`, `npm run db:migrate`, `npm run db:seed` y `npm run dev`, en `http://localhost:3000`. El `.env` local tiene `SEED_USER_PASSWORD`; la base de desarrollo está migrada hasta la 0007 y sembrada, sin productos. `confirmado`
- **End-to-end local**: requiere `npm run build` antes de `npm run test:e2e`, y `npx playwright install chromium` una vez por máquina. La base `<nombre>_e2e` se recrea en cada ejecución. `confirmado`
- **Orden del historial**: depende del reloj del servidor. Un ajuste de NTP que retroceda, o dos inserciones en el mismo microsegundo, pueden desordenarlo; una columna de secuencia lo evitaría (4.3.3, D-1). `confirmado`
- **Límites del ajuste de stock**: SQL escrito a mano puede cambiar el saldo sin movimiento, y la guarda lee `src/` como texto (no ve alias de tablas); no hay un test que haga fallar solo la auditoría después de actualizar el saldo; el caso de dos primeros ajustes no prueba el `FOR UPDATE`, porque lo serializa la espera del `ON CONFLICT`. `confirmado`
- **Tests de concurrencia**: el pool de `getDb()` tiene 10 conexiones; un test con más ajustes simultáneos que eso no llegaría a esperar en el bloqueo. `pg_stat_activity` cuenta las esperas de toda la base de test, así que dependen de que los archivos de integración corran en serie. `confirmado`
- **Tipos viejos en `.next/dev/`**: al mover o borrar una ruta, borrar `.next/dev/` si el typecheck o el build la siguen referenciando. `historico`
- **La guarda de referencias prohibidas lee el índice de Git**: un archivo borrado del disco pero no del índice la hace fallar con `ENOENT`. La de escrituras del saldo lee el disco. `confirmado`
- **Cookie en tests**: `next start` la emite `Secure` con `__Host-` sobre `http://localhost`, que Chromium acepta. Detrás de TLS real no se probó. `confirmado`
- **Límite de intentos por IP compartido sin proxy**: todos los tests end-to-end comparten una clave. Cada test borra `login_attempts` antes de empezar. `confirmado`
- **Limitación aceptada (brief-3.5, D-4)**: quien robe la sesión del primer ingreso puede definir la contraseña sin la inicial. `historico`
- **Contraseña inicial**: el `admin` la transmite por fuera del CRM. `historico`
- **Solo inserción de `audit_logs` e `inventory_movements`**: con el rol dueño la defensa efectiva es el trigger; `TRUNCATE` y un superusuario pueden saltearlo. `confirmado`
- **`npm run test` requiere la base local levantada**: `docker compose up -d --wait`. `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **Tests con `db.execute` crudo**: `timestamptz` llega como texto; compararlo en SQL. `numeric` llega como texto con la escala completa (`"5.000"`), y `quantityFromDatabase` exige ese formato. `ON DELETE RESTRICT` informa `23001`. `order by` sobre texto depende del collation de la base: ordenar en JavaScript para comparar mayúsculas. `confirmado`
- **Fallo de escritura en tests de servicio**: se provoca con un `AuthContext` cuyo `userId` no existe, sin mocks. En el ajuste rompe primero el movimiento. `confirmado`
- **Formatear antes de verificar**: Prettier puede partir líneas y dejar sin efecto directivas. `confirmado`
- **Avisos inocuos**: Vite por el import sin extensión en `vitest.config.mts`; Next.js por un `package-lock.json` fuera del repositorio en `C:\Users\benja`; Git por la conversión LF a CRLF. `confirmado`
- **PowerShell 5.1**: un here-string `@'…'@` para el mensaje de commit y comillas escapadas en `--jq` funcionan. `gh run list --commit` necesita el SHA completo; se filtra por `headSha`. `confirmado`
- **Un hook de seguridad bloquea `Remove-Item` y `taskkill /T /F`**. `historico`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `historico`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): alcance, criterios y gate de salida de la Fase 4.
- [product/Screens.md](docs/product/Screens.md) §3 a §5 y [product/wireframes/](docs/product/wireframes/README.md) 03 a 05; FR-PROD-01 a 09 y FR-AUD-02 en [product/FunctionalRequirements.md](docs/product/FunctionalRequirements.md).
- [architecture/Overview.md](docs/architecture/Overview.md): flujo del ajuste y lectura del historial.
- [brief-4.3.3](docs/decisions/brief-4.3.3-historial-de-movimientos.md), [brief-4.3.1](docs/decisions/brief-4.3.1-transaccion-de-ajuste-de-stock.md) y [brief-3.7](docs/decisions/brief-3.7-gestion-de-usuarios-y-roles.md) (pantalla con filtros y paginación ya implementada).
- [src/modules/inventory/](src/modules/inventory/index.ts) y [src/app/(autenticado)/](<src/app/(autenticado)/layout.tsx>).

## 9. Cambios ajenos del usuario detectados

Ninguno en el repositorio. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** Los cambios en Notion, la migración `0007` contra las bases locales y los commits y pushes de la 4.3.3 y de su cierre quedan consumidos al ejecutarse. Instalar dependencias, ejecutar migraciones, cambios en Notion y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que la CI del commit de cierre de la 4.3.3 quede en verde. Se verifica al hacer el push y se vuelve a comprobar al retomar.
- Alcance exacto de la 4.4 contra Screens §3 a §5, FR-AUD-02 y el Roadmap, al preparar su brief.
