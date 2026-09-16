---
schema: project-state.v1
project: ai-whatsapp-agent-crm
generated_at: 2026-09-16
git_ref: main — c2fa98b en origin/main (CI en verde, 5.3), más el cierre de la 5.3 y de la Fase 5 (commit y push autorizados por el usuario el 2026-09-16)
active_phase: ninguna; la Fase 5 está cerrada y la siguiente es la Fase 6 — Conversaciones, mensajes e ingestión
active_task: ninguna; la siguiente es la 6.1 (Migraciones de conversaciones), sin brief
confidence: confirmado
---

# Handoff

Este archivo es el traspaso entre sesiones. Cada fase se trabaja en una sesión propia y termina escribiendo acá su estado verificado, para que la sesión siguiente no reconstruya el contexto leyendo el historial.

**Se sobrescribe en cada handoff.** No es un registro histórico: eso es `CHANGELOG.md`. Acá vive únicamente el presente.

**Cómo leerlo.** Cada afirmación lleva su procedencia: `confirmado` (verificado contra la fuente en la pasada que escribió este archivo), `historico` (viene de un documento anterior, no re-verificado), `inferido` (deducido de señales indirectas) o `pendiente` (no se pudo verificar). Un campo `historico` o `inferido` se re-verifica antes de tratarlo como vigente. Ninguna autorización sigue viva por aparecer acá.

---

## 1. Identificación

- **Proyecto**: AI WhatsApp Agent CRM. Independiente del agente de WhatsApp: no comparte código, infraestructura ni base de datos, y no depende de Airtable. `confirmado`
- **Fase 5 — Clientes, cerrada** el 2026-09-16. En Notion, el proyecto de la Fase 5, su tarea espejo y las tareas 5.1, 5.2 y 5.3 quedan en "Completado". `confirmado`
- **Fase 6 — Conversaciones, mensajes e ingestión**: siguiente. En Notion existen el proyecto (`3d8702be6f4e81bb95d0e3a6e38bcb2d`), su tarea espejo (`3d8702be6f4e8199b641e48deb47febb`) y las tareas 6.1 (`3d8702be6f4e815e99e8cabf2eb35636`) y 6.2 (`3d8702be6f4e811591dfcd0b3ca9ea2a`), entre otras. Su estado no se revisó en esta pasada. `pendiente`
- **Sesión**: la Fase 6 debe empezar en una sesión nueva. `confirmado`
- **Fases 0 a 4 cerradas** (2026-09-11 a 2026-09-16). `confirmado`

## 2. Último punto aprobado

- **Fase 5 — Clientes**, cerrada con confirmación del usuario el 2026-09-16, junto con la **subfase 5.3 — UI de clientes**. Entradas en [CHANGELOG.md](CHANGELOG.md); resolución (D-1 a D-5 según la recomendación), evidencia de mutación de H-5, revisión de minimización y ajustes en el [brief-5.3](docs/decisions/brief-5.3-ui-de-clientes.md). `confirmado`
- **CI en verde** en el commit `c2fa98b`: [ejecución 35132808628](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35132808628), con todos los pasos, end-to-end incluido. `confirmado`
- **Subfases 5.1 y 5.2**, cerradas el 2026-09-16 (CI en verde en `d369767` y `62e6b3c`). `confirmado`

## 3. Próximo paso

1. **Al retomar**: seguir el arranque de `CLAUDE.md` y verificar que el commit de cierre de la Fase 5 esté en `origin/main` con la CI en verde (`gh run list -L 1`). `pendiente`
2. **Pasar la Fase 6 a "En progreso"** en Notion (proyecto y tarea espejo), con autorización. `pendiente`
3. **Preparar el brief de la 6.1 — Migraciones de conversaciones.** Tiene que tener en cuenta:
   - `conversations` y `messages` en DataModel, con los índices de las resoluciones D-2 a D-4 del brief-1.2: `conversations (organization_id, client_id, last_message_at desc)` y `conversations (organization_id, last_message_at desc)`;
   - `UNIQUE(organization_id, id)` en `clients`, que la Fase 6 suma para la clave foránea compuesta de `conversations` (5.1, D-4; 4.1, D-3);
   - la idempotencia de la ingestión (Roadmap) y el contrato de [IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md), sin ningún origen real configurado;
   - privilegios de `crm_app` en una migración `--custom` aparte;
   - la retención de mensajes queda para la Fase 9.

   Precedentes: [brief-4.1](docs/decisions/brief-4.1-migraciones-de-catalogo-e-inventario.md) y [brief-5.1](docs/decisions/brief-5.1-migracion-de-clientes.md). `confirmado`
4. **Más adelante en la Fase 6**:
   - completar la pantalla 7 con la sección de conversaciones, y la 6 con la última interacción y su orden (FR-CLI-04); esa composición no la hace `crm`, porque `conversations` depende de `crm` (5.2, D-4);
   - verificación de `Origin` con el primer Route Handler mutante;
   - cuerpo de los mensajes escapado en la UI.

   `confirmado`

## 4. Contratos vigentes

| Contrato | Versión | Ruta |
|---|---|---|
| Brief de tarea | `task-brief.v1` | [development/ExecutionProtocol.md](docs/development/ExecutionProtocol.md) |
| Cápsula de estado | `project-state.v1` | este archivo |
| Stack | ADR 0004 y ADR 0011; `pg`, `postgres:18.6-trixie`, Drizzle 0.45.2 / Kit 0.31.10, `@node-rs/argon2` 2.2.1, `zod` 4.6.4, Tailwind CSS 4.3.3, Playwright 1.63.0, `@axe-core/playwright` 4.13.0, `tsx` 4.23.13; Manrope local (sin npm) | [development/EngineeringStandards.md](docs/development/EngineeringStandards.md) |
| Diseño visual base | tokens Laguna, Manrope, tema con cookie `crm_theme`; convención de estilos; sin token de advertencia | [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md), [src/app/globals.css](src/app/globals.css), [form-styles.ts](src/app/_components/form-styles.ts) |
| Mecanismo de sesión | ADR 0012 con notas de la 3.3 y la 3.5 | [decisions/0012-mecanismo-de-sesion.md](docs/decisions/0012-mecanismo-de-sesion.md) |
| Rol de aplicación y solo inserción | ADR 0013; `audit_logs` e `inventory_movements` | [decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) |
| Esquema de catálogo e inventario | `products`, `inventories`, `inventory_movements`; migraciones 0004 a 0007 | [src/modules/catalog/schema.ts](src/modules/catalog/schema.ts), [src/modules/inventory/schema.ts](src/modules/inventory/schema.ts) |
| Esquema de clientes | `clients`; migraciones 0008 y 0009 | [src/modules/crm/schema.ts](src/modules/crm/schema.ts) |
| Interfaz pública de `crm` | `createClient`, `updateClient`, `deactivateClient`, `reactivateClient`, `getClient`, `searchClients`, `CLIENTS_PAGE_SIZE`, `listClientAudit`, `ClientPhone` y sus tipos; el teléfono sale enmascarado para `viewer` | [src/modules/crm/index.ts](src/modules/crm/index.ts) |
| Interfaz pública de `auth` | `login`, `validateSession`, `logout`, `changePassword`, `completeRequiredPasswordChange`, `revokeUserSessions`, `hashPassword`, adaptador de cookie, `validateNewUser`, `prepareInitialPassword`, `createUserWithInitialPassword`, `setUserActive`, `getUserSummaries` | [src/modules/auth/index.ts](src/modules/auth/index.ts) |
| Interfaz pública de `organizations` | `getAuthContext`, `authorize`, `getMember`, `getOrganizationTimezone`, `listMembers`, `createMember`, `changeMemberRole`, `deactivateMember`, `reactivateMember`, `getAppFrame` | [src/modules/organizations/index.ts](src/modules/organizations/index.ts) |
| Interfaz pública de `audit` | `recordAudit(tx, entry)`, `InvalidAuditEntryError`, `listEntityAuditLogs(query)` (sin contexto ni rol: autoriza y compone el autor quien llama), `AUDIT_PAGE_SIZE` y sus tipos | [src/modules/audit/index.ts](src/modules/audit/index.ts) |
| Interfaz pública de `catalog` | `createProduct`, `updateProduct`, `deactivateProduct`, `reactivateProduct`, `getProduct`, `searchProducts`, `deriveStockStatus`, `lockProductForStockChange(tx, …)`, `listProductAudit` y sus tipos | [src/modules/catalog/index.ts](src/modules/catalog/index.ts) |
| Interfaz pública de `inventory` | `listProductStock`, `getProductStock`, `PRODUCTS_PAGE_SIZE`, `adjustStock`, `listStockMovements`, `MOVEMENTS_PAGE_SIZE` y sus tipos | [src/modules/inventory/index.ts](src/modules/inventory/index.ts) |
| Escritura del saldo | solo `lockBalance` y `applyStockChange`; guarda `stock-writes.test.ts` | [src/modules/inventory/repository.ts](src/modules/inventory/repository.ts), [tests/guards/stock-writes.test.ts](tests/guards/stock-writes.test.ts) |
| Cantidades | `parseQuantityInput`, `quantityFromDatabase`, `quantityToDatabase`, `formatQuantity`, `MAX_QUANTITY`; `bigint` en milésimas | [src/shared/quantity/index.ts](src/shared/quantity/index.ts) |
| Fechas en pantalla | `formatShortDateTime`, `formatFullDateTime`, `calendarDayIn`, `shiftDays`, siempre con la zona de la organización | [src/app/_format/date-time.ts](src/app/_format/date-time.ts) |
| Taxonomía de errores | `ErrorCode`, `HTTP_STATUS`, `Failure`, `failure()`; id inválido → `VALIDATION_ERROR` sin `fields` | [src/shared/errors/index.ts](src/shared/errors/index.ts) |
| Log estructurado | `logEvent` con `organizationId` y `durationMs`, `newRequestId`, `formatLogEvent`; solo campos del evento | [src/shared/log/index.ts](src/shared/log/index.ts) |
| Sesión en páginas | `requireSession`, `requirePendingPasswordChange`, `redirectIfAuthenticated`, `currentContext` con `cache`; `logoutAction` | [src/app/_auth/](src/app/_auth/session.ts) |
| Marco común | route group `(autenticado)`: organización, navegación (Productos, Clientes y Usuarios), usuario, tema y salida | [src/app/(autenticado)/layout.tsx](<src/app/(autenticado)/layout.tsx>) |
| Pantallas implementadas | 1, 3, 4, 5, 6, 7 (sin conversaciones) y 10, con filtros en `filters.ts` y mensajes en `messages.ts` por ruta; teléfono con `phoneDisplay` y `PhoneText` | [productos/](<src/app/(autenticado)/productos/page.tsx>), [clientes/](<src/app/(autenticado)/clientes/page.tsx>), [usuarios/](<src/app/(autenticado)/usuarios/page.tsx>) |
| Estructura del repositorio | aprobada; lo de la 2.x y las Fases 3 a 5, implementado | [architecture/RepositoryStructure.md](docs/architecture/RepositoryStructure.md) |
| CI | dependencias, desfase, lint, typecheck, formato, guardas, unitarios, integración, build, Chromium y end-to-end | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| Entornos | Docker Compose; migraciones; base `_test`; rol `crm_app`; seed básico; base `_e2e` | [development/Environments.md](docs/development/Environments.md) |
| Modelo de datos | identidad, sesiones, auditoría, catálogo, inventario y clientes implementados; conversaciones e ingestión diseñados | [architecture/DataModel.md](docs/architecture/DataModel.md) |
| Modelo de seguridad | autenticación, autorización, auditoría, ingreso, gestión de miembros y enmascarado del teléfono implementados; `Origin` diseñado | [architecture/SecurityModel.md](docs/architecture/SecurityModel.md) |
| Wireframes | 10 pantallas; la 1, la 3 a la 7 (la 7 sin conversaciones) y la 10 implementadas, más el marco común | [product/wireframes/](docs/product/wireframes/README.md) |
| Contrato de ingestión | diseñado, no implementado | [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md) |
| Vocabulario de validación | obligatorio | [CLAUDE.md](CLAUDE.md) |

## 5. Evidencia

Nivel del proyecto: **validado en integración** para las pantallas 1, 3, 4, 5, 6, 7 (sin conversaciones) y 10 y el marco común, en claro y en oscuro. **Validado localmente y en CI** para la fundación técnica, la identidad, la autorización, la auditoría (escritura y lectura), la gestión de miembros, el catálogo, el ajuste de stock secuencial y bajo concurrencia, el historial de movimientos y el esquema y el servicio de clientes. **Diseñado** para conversaciones, ingestión y métricas. Nada está desplegado. `confirmado`

| Afirmación | Nivel | Evidencia |
|---|---|---|
| Todos los pasos de CI, incluido el desfase de migraciones y el end-to-end | validado en CI | Ejecución 35132808628 `success`, commit `c2fa98b` `confirmado` |
| Pantallas 6 y 7: búsqueda por nombre y teléfono, filtro, alta, edición, `CONFLICT` por teléfono, desactivación, reactivación y auditoría solo para `admin` | validado en integración (`producer-consumer`) | `tests/e2e/clients.spec.ts` (12), con axe en claro y oscuro, teclado y móvil `confirmado` |
| H-5: ni el servicio ni el HTML ni las respuestas RSC entregan a un `viewer` el teléfono completo | validado localmente, en integración y en CI | `crm.test.ts` y `clients.spec.ts`, con evidencia de mutación en los briefs 5.2 y 5.3 `confirmado` |
| Minimización (FR-CLI-05) | revisión escrita | cierre del brief-5.3 `confirmado` |
| Servicio de clientes: escrituras auditadas, `CONFLICT` por teléfono, autorización, aislamiento, lista y auditoría del cliente | validado localmente y en CI | `tests/integration/crm.test.ts` (25) y unitarios de `crm` (17) `confirmado` |
| Esquema de clientes: E.164 canónico, teléfono único por organización también frente a inactivos, `RESTRICT` y privilegios de `crm_app` | validado localmente y en CI | `tests/integration/clients-schema.test.ts` (10) `confirmado` |
| Pantallas 3, 4 y 5 | validado en integración (`producer-consumer`) | `tests/e2e/products.spec.ts` (13) `confirmado` |
| Lectura de auditoría de un producto | validado localmente y en CI | `tests/integration/product-audit.test.ts` (6) `confirmado` |
| Formato de cantidades y fechas; `organizationId` y duración en el log | validado localmente y en CI | unitarios de `quantity`, `date-time` y `log` `confirmado` |
| Historial de movimientos | validado localmente y en CI | `tests/integration/inventory-history.test.ts` (13) `confirmado` |
| Ajustes concurrentes sin actualizaciones perdidas ni saldo negativo | validado localmente y en CI | `tests/integration/inventory-concurrency.test.ts`, con evidencia de mutación en el brief-4.3.2 `confirmado` |
| Ajuste secuencial atómico; movimientos inmutables; servicio de catálogo | validado localmente y en CI | `inventory-adjustment.test.ts`, `catalog-inventory-schema.test.ts`, `stock-writes.test.ts`, `catalog.test.ts` `confirmado` |
| Pantallas 1 y 10 y marco común | validado en integración (`producer-consumer`) | `login.spec.ts` (12) y `users.spec.ts` (13) `confirmado` |
| Regla del último `admin`, auditoría de miembros y `audit_logs` de solo inserción | validado localmente y en CI | `members.test.ts` y `audit.test.ts` `confirmado` |
| Suite completa local | validado localmente | `npm run test`: 449 de 449; `npm run test:e2e`: 50 de 50 `confirmado` |
| Conversaciones, ingestión y métricas | diseñado | Fases 6 y 7 `confirmado` |
| La cookie detrás de TLS y de un proxy real; la aplicación restringida por `crm_app` | diseñado | Fases 8 y 9 `confirmado` |

## 6. Decisiones

### Vigentes

- ADRs 0001 a 0013 aceptados. `confirmado`
- Resoluciones de los briefs 1.1 a 1.3, 2.1 a 2.5, 3.1 a 3.7, 4.0 a 4.2, 4.3.1 a 4.3.3, 4.4 y 5.1 a 5.3 en [docs/decisions/](docs/decisions/README.md). `confirmado`
- Convenciones:
  - enums `pgEnum`, `gen_random_uuid()`, `updated_at` en la aplicación y validación con `zod`;
  - resultados tipados con `Failure`, y orden de autorización `must_change_password` → rol → recurso filtrado por organización; un id que no es UUID devuelve `VALIDATION_ERROR` sin `fields` (4.4, D-6);
  - cada migración que crea una tabla otorga sus privilegios a `crm_app`; privilegios y triggers en una migración `--custom` aparte de la generada;
  - una tabla que referencia una entidad de negocio de la organización usa clave foránea compuesta `(organization_id, entity_id)` hacia un `UNIQUE(organization_id, id)` del dueño (4.1, D-3); `users` sigue con clave simple (ADR 0010);
  - cantidades `numeric(14, 3)` como `bigint` en milésimas con `src/shared/quantity/`, nunca con `number`, y mostradas con `formatQuantity` (4.1, D-4; 4.4, D-2);
  - identificadores de negocio únicos sin distinguir mayúsculas con índice sobre `lower(...)`; búsqueda por prefijo sobre `lower(...) text_pattern_ops`, escapando `%` y `_` (4.2, D-3);
  - `CONFLICT` por unicidad: escritura en un savepoint y traducción de `23505` por nombre de constraint;
  - un cambio sin diferencias devuelve `changed: false` y no escribe ni audita;
  - un cambio auditado pasa su transacción a `recordAudit`; el módulo dueño del caso de uso abre la transacción y la pasa a los demás, que la exigen por tipo;
  - datos de otro módulo por su interfaz y composición en memoria, sin `JOIN` entre módulos; quien depende compone; ninguna regla que cruza módulos va a un trigger;
  - **`audit` no importa `organizations` ni `auth`** fuera de `schema.ts`: la lectura de auditoría la expone el módulo dueño de la entidad, que autoriza y compone el autor (4.4, ajuste 1);
  - escritura sobre una entidad editable: fila con `FOR UPDATE`, `diff` sobre lo leído y última escritura gana (4.2, D-5);
  - ajuste de stock: producto con `FOR SHARE` y saldo con `FOR UPDATE`; saldo esperado obligatorio con `CONFLICT`; `BUSINESS_RULE_VIOLATION` con `rule` (4.3.1); un rechazo después de escribir se lanza dentro de la transacción;
  - tests de concurrencia: otra conexión retiene el bloqueo, espera en `pg_stat_activity`, y cada test se corre una vez sin su bloqueo para registrar que falla (4.3.2);
  - fecha de una fila de evento ordenada por un bloqueo: `clock_timestamp()` (4.3.3, D-1);
  - listas largas paginadas en SQL con conteo y desempate estable (4.3.3, D-2);
  - períodos por día de calendario semiabiertos, convertidos por PostgreSQL con la zona IANA de la organización (4.3.3, D-3 y D-4); fechas en pantalla formateadas en el servidor con esa zona y la leyenda "Fechas en …" (4.4, D-3);
  - toda mutación de UI es una Server Action que registra `logEvent` con organización y duración, sin datos personales; botón deshabilitado mientras responde; ante un rechazo, la acción revalida la ruta para mostrar datos reales;
  - campos de formulario que deben sobrevivir a un rechazo son controlados: React reinicia los no controlados al terminar la acción (4.4, ajuste 2);
  - filtros y página en la URL; un formulario GET envía todos sus campos, y los enlaces de paginación y "Limpiar filtros" usan la URL canónica;
  - diálogos de los wireframes como páginas, y confirmaciones como segundo paso en la URL;
  - los componentes de cliente no importan `@/modules/*`;
  - cada pantalla tiene su end-to-end con axe en cada estado, en claro y en oscuro, teclado, foco y móvil a 375 px; los datos de cada caso los crea el propio spec (4.4, D-5);
  - estilos solo con tokens de `globals.css`, nunca colores de Tailwind; sin `transition-colors` en elementos que axe analiza tras emular el esquema;
  - un dato que un rol no puede ver se quita en el módulo de dominio, con un tipo distinto por rol, no en la presentación; su test serializa la respuesta y se corre una vez sin la protección (5.2, D-2); en pantalla, el end-to-end revisa el HTML y las respuestas RSC, con un control como `admin` (5.3, D-5);
  - los datos de prueba que no deben aparecer en una respuesta no coinciden con textos que viajan en el JavaScript del cliente, como los ejemplos de ayuda (5.3, ajustes);
  - teléfono de cliente: se acepta solo con `+`, se normaliza a E.164 antes de guardar y de buscar, y la búsqueda de la caja única es teléfono exacto si normaliza o prefijo de nombre si no (5.2, D-1 y D-3); se muestra en E.164, y enmascarado con un texto aparte para lectores de pantalla (5.3, D-1);
  - `jsonb` no conserva el orden de las claves: lo que se muestra de un `diff` recorre un orden fijo de campos (5.3, ajustes).

  `confirmado`
- `forbidden()` y `unauthorized()` de Next.js 16.3 no se usan: son experimentales. `historico`

### Pendientes

- **Eliminar los datos de un cliente** frente a `audit_logs` de solo inserción, que guarda su teléfono y notas (5.2, D-6): Fase 8, registrado en Risks. `confirmado`
- **Orden de la lista de clientes por última interacción y sección de conversaciones de la pantalla 7**: Fase 6 (5.2, D-4; 5.3, D-3). `confirmado`
- **`UNIQUE(organization_id, id)` en `clients`**: lo suma la Fase 6 con la clave compuesta de `conversations` (5.1, D-4). `confirmado`
- **Verificación de `Origin`** (`src/shared/http/`): con el primer Route Handler mutante (Fase 6). `confirmado`
- **Token de advertencia** para "bajo stock": se suma si una subfase autoriza `globals.css`. `confirmado`
- **`audit_logs.created_at` con `now()`**: el orden de registros simultáneos desempata por `id`; se revisa si una pantalla lo necesita. `confirmado`
- **Nombre del paso de guardas en `ci.yml`**: no menciona `stock-writes.test.ts`. Se renombra en una subfase que autorice `ci.yml`. `confirmado`
- **`proxy`**: se reevalúa con más rutas protegidas. `confirmado`
- **Búsqueda sin distinguir acentos**, costo de listas en memoria y de `offset` con volumen real: Fase 8. `confirmado`
- **Lint de accesibilidad**: cuando `eslint-plugin-jsx-a11y` soporte ESLint 10. `confirmado`
- **Timeouts bajo carga**: la guarda de frontera (4.0) y un caso de `product-audit.test.ts` (4.4) los superaron una vez en local; si se repiten en CI, subir el `testTimeout` del proyecto con su brief. `confirmado`
- **Conexión con un rol con login miembro de `crm_app`, y `CREATEROLE` en un servicio gestionado**: Fases 8 y 9. `confirmado`
- **Avisos de `npm audit`**: 4 moderados vía `drizzle-kit`. Fase 8. `historico`
- **IP detrás de un proxy real** (`TRUSTED_PROXY`): Fase 8 o 9. `historico`
- **Protección de rama**: se revisa si se suma otra persona o antes de producción (Fase 9). `historico`
- **Revisiones del stack**: Node 26 al entrar a LTS (2026-10-28); TypeScript 7.1; Drizzle 1.0; `crypto.argon2` nativo. `historico`
- **Ya asignadas a fases posteriores**: retención de mensajes → Fase 9; secretos → 9.1; backups → 9.2. `historico`

## 7. Limitaciones y bloqueos

- **CI sin protección de rama**: ninguna subfase se cierra sin verificar la CI de su commit con `gh run view`, incluidos sus pasos. `confirmado`
- **Docker Desktop no arranca solo**: `docker compose up -d --wait` falla hasta abrirlo. `confirmado`
- **Memoria de la máquina local**: 7,7 GB con muy poca libre; `npm run build` puede fallar con muchas aplicaciones abiertas. `confirmado`
- **Ver el CRM en local**: `docker compose up -d --wait`, `npm run db:migrate`, `npm run db:seed` y `npm run dev`, en `http://localhost:3000`. El `.env` local tiene `SEED_USER_PASSWORD`; la base de desarrollo está migrada hasta la 0009 y sembrada, sin productos ni clientes. El usuario ya sabe levantarlo. `confirmado`
- **No hay Python en la máquina**: los scripts van en Node o PowerShell. `confirmado`
- **End-to-end local**: requiere `npm run build` antes de `npm run test:e2e` (también después de cambiar un módulo, para una corrida de mutación), y `npx playwright install chromium` una vez por máquina. La base `<nombre>_e2e` se recrea en cada ejecución. `confirmado`
- **Orden del historial**: depende del reloj del servidor (4.3.3, D-1). `confirmado`
- **Límites del ajuste de stock**: SQL escrito a mano puede cambiar el saldo sin movimiento, y la guarda lee `src/` como texto. `confirmado`
- **Tests de concurrencia**: el pool de `getDb()` tiene 10 conexiones, y `pg_stat_activity` cuenta las esperas de toda la base de test, así que los archivos de integración corren en serie. `confirmado`
- **Collation de la base**: ignora los espacios al ordenar texto; los tests comparan conjuntos salvo en el caso que prueba el orden (5.2). `confirmado`
- **Tipos viejos en `.next/dev/`**: al mover o borrar una ruta, borrar `.next/dev/` si el typecheck o el build la siguen referenciando. `historico`
- **La guarda de referencias prohibidas lee el índice de Git**: un archivo borrado del disco pero no del índice la hace fallar con `ENOENT`. `confirmado`
- **Cookie en tests**: `next start` la emite `Secure` con `__Host-` sobre `http://localhost`, que Chromium acepta. `confirmado`
- **Límite de intentos por IP compartido sin proxy**: cada test end-to-end borra `login_attempts` antes de empezar. `confirmado`
- **Limitación aceptada (brief-3.5, D-4)**: quien robe la sesión del primer ingreso puede definir la contraseña sin la inicial. `historico`
- **Solo inserción de `audit_logs` e `inventory_movements`**: con el rol dueño la defensa efectiva es el trigger. `confirmado`
- **`npm run test` requiere la base local levantada.** `confirmado`
- **Un solo agente planifica, implementa y revisa.** Toda revisión es autoevaluación. `confirmado`
- **Tests con `db.execute` crudo**: `timestamptz` llega como texto; `numeric` llega con la escala completa (`"5.000"`); `ON DELETE RESTRICT` informa `23001`; ordenar en JavaScript para comparar mayúsculas. `confirmado`
- **Formatear antes de verificar**: Prettier puede partir líneas y dejar sin efecto directivas. `confirmado`
- **Avisos inocuos**: Vite por el import sin extensión en `vitest.config.mts`; Next.js por un `package-lock.json` en `C:\Users\benja`; Git por la conversión LF a CRLF. `confirmado`
- **PowerShell 5.1**: here-string `@'…'@` para el mensaje de commit. `gh run list --commit` necesita el SHA completo. `confirmado`
- **Un hook de seguridad bloquea `Remove-Item` y `taskkill /T /F`**, y a veces comandos de PowerShell que editan texto: usar la herramienta de edición. `confirmado`
- **`agentRules: false` en `next.config.ts`**: no quitarlo. `historico`

## 8. Rutas necesarias para continuar

- [CLAUDE.md](CLAUDE.md), este archivo, [CHANGELOG.md](CHANGELOG.md).
- [planning/Roadmap.md](docs/planning/Roadmap.md): alcance, subfases, criterios y gates de la Fase 6.
- [architecture/DataModel.md](docs/architecture/DataModel.md) §`conversations` y §`messages`; [architecture/IntegrationBoundaries.md](docs/architecture/IntegrationBoundaries.md); [brief-1.2](docs/decisions/brief-1.2-validacion-cruzada-del-modelo.md) (D-2 a D-4).
- FR-CONV-01 a 05 y FR-CLI-04 en [product/FunctionalRequirements.md](docs/product/FunctionalRequirements.md); [product/Screens.md](docs/product/Screens.md) §7 a §9 y los wireframes 07 a 09.
- [brief-5.1](docs/decisions/brief-5.1-migracion-de-clientes.md) (precedente de migración más reciente) y [brief-5.3](docs/decisions/brief-5.3-ui-de-clientes.md) (precedente de UI).

## 9. Cambios ajenos del usuario detectados

Ninguno en el repositorio. `confirmado`

## 10. Autorizaciones vigentes

**Ninguna.** El commit y push de la 5.3 y del cierre de la fase, y los cambios en Notion, quedan consumidos al ejecutarse. Instalar dependencias, ejecutar migraciones, cambios en Notion y cualquier operación Git futura necesitan autorización explícita.

## 11. Aspectos pendientes de confirmar

- Que el commit de cierre de la Fase 5 esté en `origin/main` con la CI en verde.
- Estado en Notion del proyecto de la Fase 6, su tarea espejo y sus subfases.
- Alcance exacto de la 6.1, al preparar su brief.
