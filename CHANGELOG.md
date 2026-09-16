# Changelog

Registro de cierres de fase y subfase. Cada entrada dice qué se certifica y qué explícitamente no, sin inferir nunca un nivel de validación superior al alcanzado. El seguimiento de tareas vive en [Notion](https://app.notion.com/p/3d8702be6f4e81659e43c3d8bd9a6e1c); el porqué de cada decisión, en [docs/decisions](docs/decisions/README.md).

## 2026-09-16 — Fase 4 cerrada (Productos e inventario)

**Certifica:**

- **Las siete subfases cerradas con confirmación del usuario**, en el orden 4.0 → 4.1 → 4.2 → 4.3.1 → 4.3.2 → 4.3.3 → 4.4. La 4.3 no tuvo implementación propia: agrupa a la 4.3.1, la 4.3.2 y la 4.3.3. El detalle de cada una está en sus entradas, debajo.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - ningún camino modifica `quantity_on_hand` sin su movimiento: `lockBalance` y `applyStockChange` son las únicas escrituras, vigiladas por `tests/guards/stock-writes.test.ts`, y `inventory-adjustment.test.ts` prueba que movimiento, saldo y auditoría son atómicos;
  - los ajustes concurrentes no dejan saldo negativo: `inventory-concurrency.test.ts`, con la evidencia del brief-4.3.2 de que falla sin sus bloqueos;
  - los movimientos son inmutables en la base: `catalog-inventory-schema.test.ts` verifica que `UPDATE` y `DELETE` sobre `inventory_movements` se rechazan.
- **Gate de salida**: suite de inventario en verde, con los invariantes de no negatividad e inmutabilidad, y CI en verde en el commit `dbdf5fa` ([ejecución 35099148671](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35099148671)), end-to-end incluido.
- **Entregables**: FR-PROD-01 a 09 y FR-AUD-02 para productos (la lectura de auditoría quedó pendiente desde la 4.2 y se entregó en la 4.4); diseño visual base con modo claro y oscuro (4.0, sumada a pedido del usuario).
- **Hito demostrable 2**: ajuste de stock con historial visible, de punta a punta en `tests/e2e/products.spec.ts`.
- **Nivel alcanzado**:
  - **validado en integración** para las pantallas 3, 4 y 5, que supera el nivel "validado localmente" que pedía el Roadmap para el dominio;
  - **validado localmente y en CI** para el esquema, el servicio de catálogo, el ajuste de stock secuencial y bajo concurrencia, el historial de movimientos y la lectura de auditoría.

**No certifica:**

- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño; la defensa efectiva de `inventory_movements` y `audit_logs` es el trigger. Fases 8 y 9.
- **Rendimiento con catálogos o historiales grandes**, incluido el costo de `offset` en páginas lejanas: Fase 8.
- **Búsqueda sin distinguir acentos**: Fase 8.
- **El orden del historial con un reloj del servidor que retrocede**: límite aceptado en la 4.3.3.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs y los cierres.

## 2026-09-16 — Subfase 4.4 cerrada (UI de productos e inventario)

**Certifica:**

- **Pantallas 3, 4 y 5** según Screens.md, los wireframes 03 a 05 y el [brief-4.4](docs/decisions/brief-4.4-ui-de-productos-e-inventario.md), con D-1 a D-6 resueltas según la recomendación:
  - `/productos`: búsqueda por nombre o SKU, filtros de estado de stock y actividad y página en la URL; tabla en escritorio y tarjetas en móvil; estado de stock con texto e ícono; "no hay productos" distinto de "sin resultados"; alta solo para `admin`;
  - `/productos/nuevo` y la edición en `/productos/[productId]`: validación en línea y `CONFLICT` por SKU en el campo; desactivar y reactivar con confirmación como segundo paso;
  - `/productos/[productId]`: datos, stock, estado, últimos movimientos y, solo para `admin`, el historial de auditoría paginado con ediciones y ajustes en la misma lista;
  - `/productos/[productId]/movimientos`: ajuste para `admin` con saldo resultante anunciado; mensajes propios de `negative_stock`, `stock_limit`, `inactive_product` y `CONFLICT` con el saldo nuevo; historial para `admin` y `viewer` con filtros de tipo y período ("Todo" por defecto, D-4) y fechas en la zona de la organización.
- **Lectura de auditoría (FR-AUD-02)**: `listEntityAuditLogs` en `audit`, una sola consulta paginada con varios tipos de entidad, sin contexto ni rol; `listProductAudit` en `catalog` autoriza `admin`, verifica la organización y compone el autor con `auth` (ajuste 1 del brief, elegido por el usuario para evitar el ciclo `audit` ↔ `organizations`).
- **Presentación compartida**: `formatQuantity` ("2.500" → "2,5"), formato de fechas en la zona de la organización y `organizationId` y duración en `logEvent`, registrados por cada Server Action de las tres pantallas.
- **`VALIDATION_ERROR` por id inválido unificado sin `fields`** (D-6).
- **Defecto encontrado por el end-to-end y corregido**: un ajuste rechazado perdía el motivo escrito y dejaba el saldo y el historial viejos en pantalla (ajuste 2 del brief).
- **Tests**: 13 end-to-end en `products.spec.ts`, con axe sin violaciones WCAG 2.x A ni AA en cada estado, en claro y oscuro, teclado y móvil a 375 px; 6 de integración en `product-audit.test.ts`; unitarios de filtros, mensajes, resumen de auditoría, fechas, cantidades y log.
- **Suite local**: `npm run test` pasa 374 de 374 y `npm run test:e2e` 38 de 38; typecheck, lint y formato en verde; `db:generate` sin cambios de esquema. Sin dependencias nuevas ni migraciones.
- **CI**: [35099148671](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35099148671), commit `dbdf5fa`, en verde con todos los pasos.
- **Documentación**: Overview (lectura de auditoría), RepositoryStructure, TraceabilityMatrix, TestingStrategy, Screens y wireframes 03 a 05 con sus desvíos.
- **Nivel alcanzado**: **validado en integración** para las pantallas 3, 4 y 5; **validado localmente y en CI** para la lectura de auditoría y los formateadores.

**No certifica:**

- **"Bajo stock" con color propio**: usa el token de énfasis existente, porque la 4.0 no define uno de advertencia (ajuste 3 del brief).
- **El orden de `audit_logs` con registros simultáneos**: su `created_at` sigue con `now()` y desempata por `id` (hallazgo 3).
- **La estabilidad de `product-audit.test.ts` bajo carga**: superó su tiempo de espera una vez en local y no se repitió (ajuste 5 del brief).
- **Rendimiento con catálogos grandes**, **Firefox y WebKit**, y la aplicación en staging o con `crm_app`: Fases 8 y 9.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.3.3 cerrada (Historial de movimientos)

**Certifica:**

- **Historial de movimientos a nivel de servicio** según el [brief-4.3.3](docs/decisions/brief-4.3.3-historial-de-movimientos.md), con D-1 a D-4 resueltas según la recomendación: `listStockMovements` de `inventory`, para `admin` y `viewer` (FR-PROD-09), con `getProduct` de `catalog` resolviendo autorización, id y organización.
- **Orden que sigue la cadena de saldos** (D-1): la migración `0007` cambia el valor por defecto de `inventory_movements.created_at` a `clock_timestamp()`, la hora del `INSERT`. Como el movimiento se inserta con el saldo bloqueado hasta confirmar, el orden por `created_at` (desempatado por `id`) coincide con el orden de los `balance_after`, también con ajustes simultáneos. Es el único cambio de la migración, y no toca filas existentes.
- **Paginación en SQL** (D-2): 25 por página con el total, del más reciente al más antiguo; una página fuera de rango se lleva a la última o a la primera.
- **Período en días de la zona de la organización** (D-3 y D-4): fechas `YYYY-MM-DD` inclusivas, convertidas por PostgreSQL a `[desde 00:00, hasta + 1 día 00:00)` con la zona IANA que aporta `getOrganizationTimezone` de `organizations`, sin dependencias nuevas ni `JOIN` entre módulos. El resultado devuelve esa zona, el autor de cada movimiento (por `getUserSummaries` de `auth`, también si está desactivado) y `productHasMovements`, que distingue "sin resultados" de "sin movimientos".
- **Tests**: 13 de integración en `tests/integration/inventory-history.test.ts` (orden y desempate, paginación, filtro por tipo, bordes del período con medianoche local, otra zona horaria y el 19/10/2008 de Buenos Aires con su día de 23 horas, filtros inválidos, autor, autorización, aislamiento e historial de un producto desactivado); unitarios de la validación de filtros y del cálculo de páginas; un caso de esquema que comprueba que `created_at` queda posterior a `transaction_timestamp()`; y el caso 6 de `inventory-concurrency.test.ts`, que verifica que el historial encadena los saldos después de seis ajustes con reintento.
- **Suite local**: `npm run test` pasa 327 de 327; `npm run test:e2e` pasa 25 de 25; typecheck, lint y formato en verde. Sin dependencias nuevas.
- **CI**: [35030637332](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35030637332), commit `cb81303`, en verde con todos los pasos, incluido el control de migraciones al día con los esquemas.
- **Documentación**: DataModel (`created_at`, límite aceptado e índice), Overview (lectura del historial), TestingStrategy y RepositoryStructure.
- **Nivel alcanzado**: **validado localmente y en CI** para el historial de movimientos a nivel de servicio, con su orden bajo concurrencia.

**No certifica:**

- **Las pantallas 4 y 5**, su formato de fechas y cantidades ni los períodos predefinidos del selector: 4.4.
- **El orden con un reloj del servidor que retrocede** (ajuste de NTP) o dos inserciones en el mismo microsegundo: límite aceptado de D-1, registrado en DataModel.
- **El costo de paginar muy lejos** con volumen real: Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.3.2 cerrada (Concurrencia de ajustes)

**Certifica:**

- **Ajustes de stock bajo concurrencia** según el [brief-4.3.2](docs/decisions/brief-4.3.2-concurrencia-de-ajustes.md), con D-1 a D-4 resueltas según la recomendación, en `tests/integration/inventory-concurrency.test.ts` contra PostgreSQL real y sin cambios en `src/`:
  - dos ajustes con el mismo saldo esperado: uno aceptado y el otro `CONFLICT`, con un solo movimiento y el libro cuadrado (saldo final igual al inicial más la suma de los movimientos);
  - dos primeros ajustes sobre un producto sin fila: una sola fila de `inventories`, sin `23505` ni `40P01`;
  - seis ajustes simultáneos que reintentan ante `CONFLICT`: todos aplicados, libro cuadrado y cada `balance_after` igual al resultado de su ajuste;
  - un ajuste en curso frena la desactivación del producto, y una desactivación sin confirmar frena el ajuste, que termina en `inactive_product` sin efectos.
- **Carrera garantizada** (D-1 y D-2): otra conexión retiene el bloqueo y el test espera en `pg_stat_activity` a que las conexiones queden detenidas en él antes de soltarlo, sin `setTimeout`.
- **Evidencia de que los tests fallan sin sus bloqueos** (D-4), registrada en el brief: sin el `FOR UPDATE` del saldo fallan los casos 1 y 3; sin el `FOR SHARE` del producto, los casos 4 y 5. Ambos bloqueos restaurados y `git diff -- src` vacío.
- **Suite local**: `npm run test` pasa 302 de 302; `npm run test:e2e` pasa 25 de 25; el archivo nuevo pasó 5 corridas seguidas; lint, typecheck y formato en verde.
- **CI**: [35019378208](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35019378208), commit `d255bfd`, en verde con todos los pasos.
- **Documentación**: TestingStrategy (caso obligatorio de concurrencia cubierto y método de espera) y DataModel (nota sobre `inventory_movements.created_at`).
- **Nivel alcanzado**: **validado localmente y en CI** para el ajuste de stock bajo concurrencia. Con la 4.3.1 y la 4.1 se cumplen los tres criterios de aceptación de la Fase 4 a nivel de servicio y base: ningún camino cambia el saldo sin movimiento, los ajustes concurrentes no dejan saldo negativo y los movimientos son inmutables.

**No certifica:**

- **Que el caso 2 pruebe el `FOR UPDATE`**: la espera del `ON CONFLICT` sobre el índice único serializa por sí sola a dos primeros ajustes; el `FOR UPDATE` lo prueban los casos 1 y 3 (ajuste 1 del brief).
- **El orden del historial bajo concurrencia**: `created_at` es la hora de inicio de la transacción y puede quedar fuera de secuencia con `balance_after` (hallazgo 4); se decide en la 4.3.3.
- **Concurrencia bajo carga real** ni con la aplicación conectada con `crm_app`: Fases 8 y 9.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.3.1 cerrada (Transacción de ajuste de stock)

**Certifica:**

- **Ajuste de stock a nivel de servicio** según el [brief-4.3.1](docs/decisions/brief-4.3.1-transaccion-de-ajuste-de-stock.md), con D-1 a D-6 resueltas según la recomendación:
  - `adjustStock` de `inventory`, solo `admin`: movimiento con `balance_after`, saldo y auditoría en una sola transacción (FR-PROD-06);
  - el producto se bloquea con `FOR SHARE` a través de `lockProductForStockChange` de `catalog`, y después la fila de saldo con `FOR UPDATE`, creada en 0 si faltaba (D-1);
  - saldo esperado obligatorio: si cambió, `CONFLICT` con el saldo actual (D-2);
  - `BUSINESS_RULE_VIOLATION` con `rule`: `negative_stock` y `stock_limit` con saldo actual y cantidad solicitada, e `inactive_product` (D-3, FR-PROD-08, ADR 0008);
  - auditoría `inventory` / `stock_adjustment` con el id del producto y `{ quantityOnHand }` antes y después (D-4);
  - motivo recortado de 1 a 500 caracteres y cantidad mayor a 0 (D-5);
  - todo rechazo revierte la transacción entera, incluida la fila de `inventories` recién creada.
- **Una sola vía para cambiar el saldo** (FR-PROD-07, D-6): `applyStockChange` es la única función que actualiza `quantity_on_hand`, siempre junto con su movimiento; `lockBalance` solo crea la fila en 0. `tests/guards/stock-writes.test.ts` falla ante cualquier otra escritura en `src/`, con seis casos que demuestran que detecta y un control de que el repositorio tiene exactamente esas escrituras.
- **Tests**: 13 de integración en `tests/integration/inventory-adjustment.test.ts` contra PostgreSQL real (primer ajuste, serie con `balance_after` igual al saldo, saldo exacto en 0 y en el máximo, cada rechazo comparado contra una foto de la base, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR` y fallo del movimiento sin efectos), y unitarios del cálculo del saldo y de la validación. Ningún test existente cambió y el `CHECK` de la base no se disparó desde el servicio.
- **Suite local**: `npm run test` pasa 297 de 297 (97 unitarios, 30 guardas y 170 de integración); `npm run test:e2e` pasa 25 de 25. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". Sin migraciones ni dependencias nuevas.
- **CI**: [35012071693](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35012071693), commit `a820df1`, en verde con todos los pasos.
- **Documentación**: DataModel (productor `inventory` y escrituras del saldo), Overview (flujo del ajuste), TestingStrategy y RepositoryStructure.
- **Nivel alcanzado**: **validado localmente y en CI** para el ajuste de stock secuencial: atomicidad, rechazos sin efectos y auditoría.

**No certifica:**

- **Ajustes simultáneos**, dos primeros ajustes sobre un producto sin fila y un ajuste contra una desactivación: 4.3.2.
- **Un fallo aislado de la auditoría después de actualizar el saldo**: el test provoca el fallo en el movimiento; no hay caso que haga fallar solo la auditoría.
- **SQL escrito a mano contra la base** que cambie el saldo sin movimiento, ni una tabla que llegue por un alias: fuera del alcance de la guarda (límite de D-6).
- **Pantalla 5** y su Server Action: 4.4.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.2 cerrada (Servicio de catálogo)

**Certifica:**

- **Servicio de catálogo** según el [brief-4.2](docs/decisions/brief-4.2-servicio-de-catalogo.md), con D-1 a D-6 resueltas según la recomendación:
  - `catalog`: `createProduct`, `updateProduct`, `deactivateProduct` y `reactivateProduct`, solo `admin`, auditados en la misma transacción; `getProduct` y `searchProducts` para ambos roles; `deriveStockStatus` según FR-PROD-05;
  - `inventory`, solo lectura: `listProductStock` y `getProductStock` componen productos, saldos (0 sin fila) y estado en memoria, sin `JOIN` y sin que `catalog` importe `inventory` (D-1);
  - cantidades exactas en `src/shared/quantity/`, como `bigint` en milésimas, con entrada con coma o punto (D-2);
  - búsqueda por prefijo de nombre y SKU exacto sin distinguir mayúsculas, con `%` y `_` literales; `drizzle/0006_*` reemplaza el índice de nombre por uno sobre `lower(name)` (D-3);
  - validación con recorte de espacios y límites por campo (D-4); escrituras con la fila bloqueada y última escritura gana (D-5).
- **Tests**: 23 de integración en `tests/integration/catalog.test.ts` contra PostgreSQL real (auditoría con `diff` exacto y reversión si falla, `CONFLICT` por SKU también con dos altas simultáneas, `FORBIDDEN`, `NOT_FOUND` entre organizaciones, `VALIDATION_ERROR`, filtros, orden y paginación de la lista), y unitarios de los bordes del estado de stock, de cantidades, de validación y de la composición de la lista. Ningún test existente cambió.
- **Suite local**: `npm run test` pasa 262 de 262; `npm run test:e2e` pasa 25 de 25. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios. La `0006` está aplicada en la base de desarrollo.
- **CI**: [35002153534](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35002153534), commit `b4e903a`, en verde con todos los pasos.
- **Documentación**: DataModel, TraceabilityMatrix, Overview (composición del estado de stock), RepositoryStructure (`src/shared/quantity/`) y TestingStrategy. En Notion, la 4.4 suma FR-AUD-02 (D-6).
- **Nivel alcanzado**: **validado localmente y en CI** para el servicio de catálogo, la lectura de saldos y el estado de stock.

**No certifica:**

- **Pantallas 3 y 4** ni su accesibilidad: 4.4.
- **Que un producto desactivado no reciba ajustes** (FR-PROD-03): lo verifica la 4.3.1 dentro de su transacción.
- **Rendimiento de la lista con volumen real**: lee todos los productos que cumplen texto y actividad; se revisa en la Fase 8 o con más de 2 000 productos por organización.
- **Búsqueda sin distinguir acentos**: "cafe" no encuentra "Café".
- **Lectura del historial de auditoría** (FR-AUD-02): 4.4.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-15 — Subfase 4.1 cerrada (Migraciones de catálogo e inventario)

**Certifica:**

- **Esquema de catálogo e inventario** según el [brief-4.1](docs/decisions/brief-4.1-migraciones-de-catalogo-e-inventario.md), con D-1 a D-7 resueltas según la recomendación:
  - `products` en `src/modules/catalog/schema.ts`; `inventories` e `inventory_movements` en `src/modules/inventory/schema.ts`, solo con su esquema (D-1, D-2);
  - claves foráneas compuestas `(organization_id, product_id)` → `products(organization_id, id)`: un saldo o un movimiento no puede apuntar al producto de otra organización (D-3);
  - cantidades `numeric(14, 3)` (D-4);
  - `CHECK (reorder_point >= 0)` y `CHECK (btrim(reason) <> '')` (D-5);
  - SKU único por organización sin distinguir mayúsculas, con un índice sobre `lower(sku)` (D-6);
  - a lo sumo una fila de `inventories` por producto; sin fila, el saldo es 0 (D-7).
- **Migraciones**: `drizzle/0004_*`, generada por Drizzle Kit sin SQL a mano, y `drizzle/0005_*`, a medida, con los privilegios de `crm_app` y el trigger `inventory_movements_insert_only`. Aplicadas en la base de desarrollo y sobre bases vacías; aplicarlas otra vez no hace nada.
- **Solo inserción de `inventory_movements`** ([ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)): `UPDATE` y `DELETE` rechazados con `42501` para `crm_app` y con `P0001` para el rol dueño; la tabla entró en la lista del test de cobertura de privilegios.
- **Tests**: 25 casos nuevos en `tests/integration/catalog-inventory-schema.test.ts`, cada uno con su SQLSTATE. Los tests existentes solo sumaron las tablas nuevas: la lista de `audit.test.ts` y la lista de tablas y el título de un caso en `identity-schema.test.ts`.
- **Suite local**: `npm run test` pasa 218 de 218 (65 unitarios, 19 guardas y 134 de integración); `npm run test:e2e` pasa 25 de 25. Con la base detenida pasan typecheck, lint, formato, guardas, unitarios y build, y `db:generate` informa "No schema changes". `package.json` sin cambios.
- **CI**: [34981182897](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34981182897), commit `1824ae1`, en verde con todos los pasos, incluido el de desfase de migraciones.
- **Documentación**: DataModel (tablas, convención de cantidades y diagrama), TraceabilityMatrix, TestingStrategy y RepositoryStructure.
- **Nivel alcanzado**: **validado localmente y en CI** para el esquema de catálogo e inventario y la solo inserción de `inventory_movements`.

**No certifica:**

- **Que la aplicación no pueda saltearse el movimiento**: no hay servicio de ajuste todavía (4.3.1).
- **Ajustes concurrentes**, incluido el primer ajuste simultáneo de un producto sin fila de `inventories` (4.3.2).
- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño (Fases 8 y 9).
- **`TRUNCATE`**: el dueño todavía puede vaciar `inventory_movements`, como `audit_logs`; no tiene test propio en esta tabla.
- **`updated_at` en SQL crudo**: lo mantiene la aplicación, como en las tablas anteriores.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-14 — Subfase 4.0 cerrada (Diseño visual base)

**Certifica:**

- **Diseño visual base** según el [brief-4.0](docs/decisions/brief-4.0-diseno-visual-base.md), aprobado después de revisar una vista previa:
  - paleta Laguna en tokens semánticos de `globals.css`, con modo claro y oscuro; la paleta por defecto de Tailwind queda anulada (D-1, D-2);
  - Manrope variable servida localmente con `next/font/local`, con licencia OFL y cifras tabulares (D-3);
  - selector "Sistema", "Claro" y "Oscuro" en el marco común, con la cookie `crm_theme` leída en el servidor y sin scripts en línea (D-4);
  - clases de `form-styles.ts` reescritas sobre tokens, más título, tarjeta, tabla e insignias (D-5);
  - marco común como barra superior (D-7).
- **Aplicado a las pantallas 1 y 10 y al marco común** sin cambiar comportamiento, textos ni rutas: los 24 end-to-end existentes pasan sin cambios en sus pasos.
- **Accesibilidad**: `expectAccessible` analiza cada estado con axe en claro y en oscuro (D-6), sin violaciones WCAG 2.x A ni AA.
- **Tests**: caso 13 de `users.spec.ts` (tema elegido sobre el sistema, persistencia al recargar, vuelta a "Sistema", fuente cargada y cero pedidos a dominios externos) y 5 unitarios de la cookie de tema.
- **Suite local**: `npm run test:e2e` pasa 25 de 25. `npm run test` pasa 192 de 193: una guarda de frontera superó su timeout de 30 s bajo carga de memoria, y las 19 guardas pasan solas. Con la base detenida pasan typecheck, lint, formato, guardas, 65 unitarios, build y el chequeo de migraciones. `package.json` sin cambios.
- **CI**: [34916460308](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34916460308), commit `8a4bac1`, en verde con los pasos de end-to-end. La ejecución anterior, [34915965363](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34915965363) sobre `e5029e1`, falló en axe en oscuro por `transition-colors`; el arreglo quitó la transición.
- **Documentación**: Screens.md (reglas comunes), EngineeringStandards (tipografía y convención de estilos) y RepositoryStructure.
- **Nivel alcanzado**: **validado en integración** para las pantallas 1 y 10 y el marco común en los dos modos.

**No certifica:**

- **La identidad visual definitiva**: logo, marca e iconografía siguen fuera del MVP.
- **Firefox y WebKit**, incluida la representación de Manrope.
- **Modos de alto contraste forzado** del sistema operativo.
- **Juicio estético**: lo dio el usuario sobre la vista previa y las capturas, no un test.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-14 — Fase 3 cerrada (Identidad, autorización y auditoría)

**Certifica:**

- **Las siete subfases cerradas con confirmación del usuario**, en el orden 3.1 → 3.2 → 3.3 → 3.4 → 3.6 → 3.5 → 3.7. El detalle de cada una está en sus entradas, debajo.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - otra organización → `NOT_FOUND`, en `tests/integration/authorization.test.ts` y `members.test.ts`, y de punta a punta en `users.spec.ts`;
  - `viewer` → `FORBIDDEN`, en los mismos archivos;
  - la auditoría es atómica con el cambio que registra: `audit.test.ts` fuerza el fallo de la inserción de auditoría, y `members.test.ts` lo verifica con los cambios reales de miembros.
- **Gate de salida**: suite de autenticación y autorización en verde, con CI en verde en el commit `49a6209` ([ejecución 34895273473](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34895273473)).
- **Entregables**:
  - FR-ORG-01 a 03: una organización por usuario con aislamiento, gestión de usuarios y roles, y redirección a login sin sesión;
  - base de FR-AUD-01: `audit_logs` de solo inserción y `recordAudit` atómico, con `organization_member` como primer productor;
  - ADRs 0012 (sesiones) y 0013 (rol de aplicación y solo inserción).
- **Hito demostrable 1**: login funcional con roles.
- **Nivel alcanzado**:
  - **validado en integración** para las pantallas 1 y 10 y el marco común, que supera el nivel que pedía el Roadmap para la gestión de usuarios;
  - **validado localmente y en CI** para la autenticación, la autorización, la auditoría y la gestión de miembros a nivel de servicio.

**No certifica:**

- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño, y la defensa efectiva de `audit_logs` es el trigger. Fases 8 y 9.
- **La cookie detrás de TLS y de un proxy real**, y el límite de intentos por IP detrás de un proxy: Fases 8 y 9.
- **Verificación de `Origin`**: no hay Route Handlers mutantes todavía.
- **Diseño visual**: las pantallas usan estilos funcionales y accesibles con Tailwind, sin identidad visual definida. Al cerrar la fase, el usuario pidió sumar la subfase 4.0 (diseño visual base), ya registrada en el Roadmap.
- **Firefox y WebKit**.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs, los cierres y el ADR de sesiones.

## 2026-09-14 — Subfase 3.7 cerrada (Gestión de usuarios y roles)

**Certifica:**

- **Pantalla 10** según Screens.md, el wireframe 10 y el [brief-3.7](docs/decisions/brief-3.7-gestion-de-usuarios-y-roles.md):
  - `/usuarios` con filtros de rol y estado y página en la URL, tabla en escritorio y tarjetas en móvil, "(vos)" y "Limpiar filtros";
  - `/usuarios/nuevo`: alta con contraseña inicial de 16 caracteres en 4 grupos (D-5), mostrada una sola vez con "Copiar", `must_change_password` en `true` y `CONFLICT` por email repetido;
  - `/usuarios/[memberId]`: cambio de rol, desactivación con confirmación como segundo paso (D-6) y reactivación;
  - un `viewer` ve "No tenés permiso para ver esta página." sin datos (D-10), y un miembro de otra organización da `NOT_FOUND`.
- **Marco común** en el route group `(autenticado)` (D-7): organización, navegación con `aria-current`, usuario con su rol y "Salir".
- **`organizations`**: `listMembers`, `createMember`, `changeMemberRole`, `deactivateMember`, `reactivateMember` y `getAppFrame`. Nombre y email vía la interfaz de `auth`, compuestos en memoria, sin `JOIN` entre módulos (D-3).
- **Regla del último `admin`** (ADR 0010, D-4): `SELECT … FOR UPDATE` sobre la organización y conteo de `admin` activos dentro de la transacción. Dentro del bloqueo también se verifica que quien actúa siga siendo `admin` activo.
- **Primer productor de auditoría**: alta, cambio de rol, desactivación y reactivación escriben `organization_member` en la misma transacción, con `diff` sin PII (D-8) y sin registro cuando no hay cambio real.
- **`auth`**: generación de la contraseña inicial con `crypto.randomInt`, alta en un savepoint que traduce `23505` a `CONFLICT`, y desactivación que borra las sesiones del usuario.
- **Tests**:
  - 12 end-to-end nuevos en `users.spec.ts`, con axe sin violaciones WCAG 2.x A ni AA en cada estado, teclado, móvil a 375 px y la sesión abierta de un usuario desactivado cerrándose en otro navegador;
  - 19 de integración nuevos, incluido el de concurrencia: una tercera conexión retiene el bloqueo y, al liberarlo, exactamente uno de dos cambios lo logra;
  - 20 unitarios nuevos: contraseña inicial, filtros, mensajes, composición de la lista y regla del último `admin`.
- **Suite local**: `npm run test` pasa 188 de 188 y `npm run test:e2e` 24 de 24. Con la base detenida pasan typecheck, lint, formato, 19 guardas, 60 unitarios, build y el chequeo de migraciones, sin cambios de esquema.
- **CI**: [34894885454](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34894885454), commit `ff15318`, en verde con los pasos de end-to-end.
- **Decisiones D-1 a D-11** resueltas según la recomendación. Sin dependencias nuevas.
- **Documentación**: SecurityModel, Overview, DataModel, TestingStrategy, RepositoryStructure, Screens y wireframe 10.
- **Nivel alcanzado**:
  - **validado en integración** (UI ↔ Server Action ↔ servicio ↔ base) para la pantalla 10 y el marco común;
  - **validado localmente y en CI** para los casos de uso, la regla del último `admin` con concurrencia y la auditoría.

**No certifica:**

- **La aplicación restringida por `crm_app`**: sigue conectándose con el rol dueño. Fases 8 y 9.
- **Firefox y WebKit**, y un `INTERNAL` real de punta a punta.
- **Entrega de la contraseña inicial por un canal seguro**: el `admin` la copia y la transmite por fuera del CRM.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-14 — Subfase 3.5 cerrada (Pantalla de inicio de sesión)

**Certifica:**

- **Pantalla 1** según Screens.md, el wireframe 01 y el [brief-3.5](docs/decisions/brief-3.5-pantalla-de-inicio-de-sesion.md):
  - `/login` con Server Action. Credenciales incorrectas, email inexistente, usuario sin membresía y contraseña fuera de política dan el mismo mensaje, con el foco en él;
  - email inválido asociado al campo, límite de intentos con el botón deshabilitado, "Ingresando…" y `request_id` visible solo en errores inesperados;
  - `/cambiar-contrasena` para `must_change_password`, y cierre de sesión;
  - `/` protegida provisional. Sin sesión va a `/login` (FR-ORG-03) y con el cambio pendiente vuelve a ese paso. Sin `proxy` (D-6).
- **`auth`**, sin cambios de esquema:
  - `completeRequiredPasswordChange` (D-4): no pide la contraseña inicial, devuelve `FORBIDDEN` con el flag en `false` y repite esa condición dentro de la transacción;
  - la cookie vence en `created_at` + 30 días (D-5), con nota fechada en el ADR 0012;
  - **defecto corregido del adaptador de la 3.3**: el borrado de la cookie `__Host-` no llevaba `Secure` ni `Path=/`, y Chromium la conservaba. La sesión ya se borraba en la base.
- **Infraestructura nacida con la pantalla**:
  - Tailwind CSS 4.3 (D-2);
  - `src/shared/log/`, JSON sin PII (D-9);
  - `seeds/basic.ts` con `npm run db:seed` y `tsx` declarado (D-7);
  - Playwright 1.63 con Chromium y `@axe-core/playwright` sobre `next start`, en la base `<nombre>_e2e` (D-3 y D-8).
- **Tests**:
  - 12 end-to-end, incluidos axe sin violaciones WCAG 2.x A ni AA en siete estados, el recorrido solo con teclado, los atributos y el vencimiento de la cookie en el navegador, el reenvío de la cookie anterior al cierre de sesión y el móvil a 375 px;
  - 13 de integración nuevos: 8 de `auth` y 5 del seed, incluido su rechazo contra una base no permitida;
  - 13 unitarios nuevos, de mensajes y de log. Este último verifica que no aparecen la contraseña, el token ni el email usados.
- **Suite local**: `npm run test` pasa 149 de 149 y `npm run test:e2e` 12 de 12. Con la base detenida pasan typecheck, lint, 19 guardas, 40 unitarios, build y el chequeo de migraciones.
- **CI**: [34881542804](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34881542804), commit `49bfe74`, en verde con los pasos de Chromium y end-to-end.
- **Decisiones D-1 a D-9** resueltas según la recomendación. Dependencias instaladas con autorización y sin avisos de dependencias pares.
- **Documentación**: SecurityModel, Overview, RepositoryStructure, EngineeringStandards, Environments, TestingStrategy y `.env.example`.
- **Nivel alcanzado**:
  - **validado en integración** (UI ↔ Server Action ↔ servicio ↔ base) para el ingreso, el cambio obligatorio, el cierre de sesión, las redirecciones y la cookie;
  - **validado localmente y en CI** para `completeRequiredPasswordChange`, el seed y el log.

**No certifica:**

- **La cookie detrás de TLS y de un proxy real**: Fases 8 y 9. En los tests corre sobre `http://localhost`, que Chromium trata como seguro.
- **Firefox y WebKit**.
- **Un `INTERNAL` real de punta a punta**: solo el mensaje y el log, con tests unitarios.
- **Lint de accesibilidad**: no hay plugin compatible con ESLint 10. La cobertura es axe sobre el DOM.
- **Limitación aceptada (D-4)**: quien robe la sesión del primer ingreso puede definir la contraseña sin conocer la inicial.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-14 — Subfase 3.6 cerrada (Módulo de auditoría)

**Certifica:**

- **`audit_logs`**, según DataModel y el [brief-3.6](docs/decisions/brief-3.6-modulo-de-auditoria.md):
  - enums completos de tipo de entidad y acción (D-1);
  - claves foráneas `ON DELETE RESTRICT` hacia `organizations` y `users` (D-5);
  - índice de historial por entidad;
  - migración `drizzle/0002_audit_logs.sql`, generada y revisada como SQL.
- **Solo inserción** según el [ADR 0013](docs/decisions/0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md), en `drizzle/0003_crm_app_role_and_audit_insert_only.sql`, la primera migración a medida:
  - rol `crm_app` `NOLOGIN`, creado solo si no existe, con privilegios explícitos sobre las seis tablas;
  - solo `SELECT` e `INSERT` sobre `audit_logs`;
  - trigger que rechaza `UPDATE` y `DELETE` para cualquier rol, con `P0001`.
- **Módulo `audit`** (`src/modules/audit/`), según D-3 y D-4:
  - `recordAudit(tx, entry)` exige por tipo una transacción (`DbTransaction` en `src/shared/db/`);
  - valida la entrada con `zod`: forma `{ before, after }`, claves prohibidas y un error que nombra campos sin valores.
- **Tests contra PostgreSQL real**, cada invariante intentando violarlo:
  - 18 de integración: esquema, `42501` para `crm_app`, trigger para el dueño, cobertura de privilegios con sus dos casos de fallo, tres casos de atomicidad, entrada inválida que revierte el cambio y prueba de tipo;
  - 8 unitarios de validación de la entrada.
- **Migraciones**: aplicadas dos veces a desarrollo sin cambios. El paso de desfase quedó limpio después de la migración a medida.
- **Suite local**: `npm run test` pasa 123 de 123. Con la base detenida pasan typecheck, lint, 19 guardas, 27 unitarios y build.
- **CI**: [34874433744](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34874433744), commit `e240bea`, en verde con todos los pasos. Los tests de permisos pasaron en Linux, así que la migración creó el rol y `SET LOCAL ROLE` funcionó.
- **Decisiones D-1 a D-5** resueltas según la recomendación; ADR 0013 aceptado.
- **Documentación**:
  - DataModel, SecurityModel (alineado con FR-AUD-01), TestingStrategy, Environments y RepositoryStructure;
  - Overview, con la dependencia de esquema de `audit`;
  - `ExecutionProtocol.md`, con la lista de cierre corregida en el Knowledge Capture del 2026-09-14.
- **Nivel alcanzado: validado localmente y en CI** para el esquema de `audit_logs`, el rechazo de `UPDATE` y `DELETE` por permisos y por trigger, y la atomicidad de `recordAudit`.

**No certifica:**

- **Restricción en ejecución**: la aplicación sigue conectándose con el rol dueño, y `crm_app` solo se probó con `SET LOCAL ROLE`. La conexión con un rol con login llega en las Fases 8 y 9.
- **`TRUNCATE` del dueño y trigger desactivado por un superusuario**: limitaciones aceptadas. Un test demuestra la primera.
- **`CREATEROLE` en un servicio gestionado**: Fases 8 y 9.
- **Productores reales**: el primero es la 3.7. Productos y stock llegan en la Fase 4, clientes en la 5 y conversaciones en la 6.
- **Consulta del historial** (FR-AUD-02): pantallas 4 y 7.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-14 — Subfase 3.4 cerrada (Autorización y taxonomía de errores)

**Certifica:**

- **Taxonomía de errores** en `src/shared/errors/`: los 8 códigos de [Overview.md](docs/architecture/Overview.md) con su estado HTTP, el tipo `Failure` y `failure()`. `auth` declara `AuthFailure` con ese tipo, sin cambios de comportamiento.
- **Módulo `organizations`** (`src/modules/organizations/`), según el [brief-3.4](docs/decisions/brief-3.4-autorizacion-y-errores.md):
  - `getAuthContext(token)`: llama a `auth.validateSession` y resuelve membresía y rol con su propio repositorio, sin JOIN entre módulos; devuelve un contexto congelado o `UNAUTHENTICATED`;
  - `authorize(context, { role })`: `must_change_password` → `FORBIDDEN`, rol insuficiente → `FORBIDDEN`;
  - `getMember(context, memberId)`: solo `admin`, id validado con `zod`, consulta filtrada por `organization_id` en SQL → `NOT_FOUND` para otra organización.
- **Tests contra PostgreSQL real**:
  - 12 de integración (`tests/integration/authorization.test.ts`): contexto válido, token ausente, inválido o vencido, sin membresía, usuario inactivo, cambio de rol y baja de membresía en el request siguiente, `viewer` con `FORBIDDEN`, `NOT_FOUND` entre organizaciones idéntico al de un id inexistente, id inválido y `must_change_password`;
  - 5 unitarios nuevos: taxonomía y orden de `authorize`.
- **CI con tests unitarios**: paso `npm run test:unit` en `ci.yml`, antes de integración.
- **Suite local**: `npm run test` pasa 97 de 97. Con la base detenida pasan typecheck, lint, 19 guardas, 19 unitarios y build.
- **CI**: [34852017994](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34852017994), commit `800115c`, en verde, con todos los pasos, incluido "Tests unitarios".
- **Decisiones D-1 a D-5** resueltas según la recomendación.
- **Nivel alcanzado: validado localmente y en CI** para contexto autenticado, guardas, aislamiento en `organization_members` y taxonomía, a nivel de servicio.

**No certifica:**

- **Redirecciones y respuestas HTTP** a partir de los códigos: no hay rutas todavía (3.5).
- **Verificación de `Origin` y log con `request_id`**: ubicaciones fijadas (`src/shared/http/`, `src/shared/log/`), sin implementar hasta su primer consumidor.
- **Reescritura de la cookie tras la renovación**: el contexto expone `sessionExpiresAt`, pero nada la reescribe todavía (3.5).
- **Aislamiento de otros recursos**: cada módulo de las Fases 4 a 7 agrega su test.
- **Regla del último `admin`**: 3.7.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Subfase 3.3 cerrada (Autenticación)

**Certifica:**

- **Módulo `auth`** (`src/modules/auth/`), según el [ADR 0012](docs/decisions/0012-mecanismo-de-sesion.md) y el [brief-3.3](docs/decisions/brief-3.3-autenticacion.md):
  - `login`, `validateSession`, `logout`, `changePassword` y `revokeUserSessions`;
  - resultados tipados con `UNAUTHENTICATED`, `VALIDATION_ERROR` y `RATE_LIMITED`;
  - consulta solo sus propias tablas (D-2, nota fechada en el ADR 0012).
- **Contraseñas**:
  - argon2id con `@node-rs/argon2` 2.2.1 (`m=19456`, `t=2`, `p=1`, formato PHC);
  - verificación contra un hash ficticio para emails inexistentes;
  - política de 12 a 128 caracteres; entradas validadas con `zod` 4.6.4.
- **Sesiones**:
  - token de 32 bytes, con solo su SHA-256 en `sessions`;
  - deslizante de 7 días, renovada a mitad de ventana, con tope de 30;
  - revocación total al cambiar la contraseña; sesión nueva en cada ingreso.
- **Límite de intentos** en `login_attempts`, con claves hasheadas: 5 fallos por cuenta o 20 por IP en 15 minutos, evaluado antes de verificar la contraseña. La IP solo sale de `x-forwarded-for` con `TRUSTED_PROXY=true`.
- **Migración `drizzle/0001_*`** con `sessions` y `login_attempts`, revisada como SQL y aplicada dos veces en desarrollo.
- **Tests contra PostgreSQL real**:
  - 30 de integración del servicio, cada invariante intentando violarlo (token no guardado, rechazos indistinguibles, expiración, tope, manipulación, usuario desactivado, renovación, logout, revocación, cambio de contraseña, límites por cuenta e IP, entradas inválidas, sin secretos en consola);
  - 14 unitarios de hash, política, cookie e IP.
- **`updated_at` con `$onUpdate`** ahora probado por el cambio de contraseña (pendiente de la 3.1).
- **Suite local**: `npm run test` pasa 80 de 80; `npm ci` reproduce la instalación. Con la base detenida pasan typecheck, lint, guardas y build.
- **CI**: [34792128446](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34792128446), commit `b779592`, en verde. 47 tests de integración y 19 guardas; paso de desfase sin cambios; sin avisos de `allowScripts` nuevos, y el binario de argon2 funcionó en Linux.
- **Decisiones D-1 a D-7** resueltas según la recomendación.
- **Nivel alcanzado: validado localmente y en CI** para contraseñas, sesiones y límite de intentos, a nivel de servicio.

**No certifica:**

- **Tests unitarios en CI**: `ci.yml` no corre el proyecto `unit`, porque no existía cuando se escribió en la 2.5. Los 14 unitarios solo pasaron en local. Pendiente para la 3.4.
- **Manejo de la cookie de punta a punta**: queda implementado (D-7); se valida en integración con la pantalla, en la 3.5.
- **La IP detrás de un proxy real** (D-4): Fase 8 o 9.
- **Cookie tras la renovación**: se reescribe en Server Actions o Route Handlers (3.4 y 3.5).
- **`@node-rs/argon2` dentro del build de Next.js**: ninguna ruta usa `auth` todavía (3.5).
- **Límite de intentos en el cambio de contraseña**: fuera de alcance.
- **Resistencia real a medición de tiempos**: la verificación ficticia está implementada, pero no se mide.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Subfase 3.2 cerrada (ADR del mecanismo de sesión)

**Certifica:**

- **[ADR 0012](docs/decisions/0012-mecanismo-de-sesion.md) aceptado**: sesiones server-side propias sobre `node:crypto` y `cookies` de Next.js, sin dependencias.
  - **Almacenamiento**: tabla `sessions` en PostgreSQL con el SHA-256 de un token de 32 bytes; el token nunca se guarda.
  - **Expiración**: deslizante de 7 días, renovada a mitad de ventana, con tope absoluto de 30.
  - **Validación**: en cada request se leen de la base rol, organización, `is_active` y `must_change_password`.
  - **Revocación**: todas las sesiones al cambiar la contraseña o desactivar al usuario; sesión nueva en cada ingreso.
  - **`must_change_password`**: restringido en la validación.
  - **Cookie y CSRF**: `HttpOnly`, `SameSite=Lax` y `Secure` con TLS; Server Actions más verificación de `Origin` en Route Handlers mutantes; `proxy` solo optimista.
- **Decisiones D-1 a D-6 del [brief-3.2](docs/decisions/brief-3.2-adr-mecanismo-de-sesion.md)** resueltas según la recomendación.
- **Verificación de fuentes (2026-09-13)**:
  - guía de autenticación, `proxy` y seguridad de datos de Next.js 16.3;
  - registro npm: `lucia` y `@oslojs/crypto` deprecados, Auth.js v5 en beta, Better Auth 1.7.4 con esquema propio;
  - `crypto.argon2` nativo en Node 24.15, sin avisos.
- **Documentación**:
  - `sessions` diseñada en DataModel;
  - SecurityModel sin "a definir" y con la política CSRF;
  - fila Autenticación de EngineeringStandards;
  - pregunta abierta cerrada en Risks;
  - 9 casos obligatorios de sesión en TestingStrategy.
- **Contraste sin contradicciones** con SecurityModel, NonFunctionalRequirements, DataModel, Overview, ADR 0010 y el wireframe 01.
- **Notion**: tarea 3.2 con descripción corregida (sin organización activa).
- Enlaces internos verificados: 0 rotos.
- **Nivel alcanzado: diseñado.**

**No certifica:**

- **Implementación y validación de la sesión**: 3.3 (crear, validar, renovar, revocar y migración de `sessions`) y 3.4 (contexto autenticado, `must_change_password`, `Origin`).
- **Hash de contraseñas y rate limit**: se deciden en la 3.3. La estabilidad declarada de `crypto.argon2` sigue sin verificar.
- **Que Route Handlers no verifiquen `Origin` por su cuenta**: es una inferencia de la documentación, no una prueba.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Subfase 3.1 cerrada (Migraciones de identidad)

**Certifica:**

- **Esquema de identidad** según [DataModel.md](docs/architecture/DataModel.md):
  - `users` en `src/modules/auth/schema.ts`; `organizations` y `organization_members` en `src/modules/organizations/schema.ts`;
  - migración inicial `drizzle/0000_keen_spyke.sql`, generada con `drizzle-kit` 0.31.10 y revisada como SQL: enum `member_role`, `gen_random_uuid()`, índice único sobre `lower(email)`, `UNIQUE(user_id)`, claves foráneas `ON DELETE CASCADE` e índice por `organization_id`.
- **`db:migrate` en la base de desarrollo**: aplicada dos veces, con 1 migración registrada.
- **Base de test aislada** (D-1): `<nombre>_test` recreada y migrada con el migrador de `drizzle-orm` en cada ejecución, `TRUNCATE` antes de cada test y archivos en serie. `crm_dev` tuvo 0 filas antes y después de la suite.
- **`identity-schema.test.ts`**: 17 tests que intentan violar cada invariante y comprueban el código de PostgreSQL (`23505` email repetido, también con otras mayúsculas, y segunda membresía; `23503` FK; `23502` NOT NULL; `22P02` rol inválido), más defaults, reaplicación de migraciones sin efecto y aislamiento entre tests.
- **Suite local**: `npm run test` pasa 41 de 41. Con la base detenida pasan typecheck, lint, guardas y build.
- **CI**: [34786605412](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34786605412), commit `bef80d6`, en verde en 1m5s. El paso nuevo de desfase respondió "No schema changes"; 19 tests de guardas y 22 de integración contra `crm_ci_test`.
- **Detección de desfase probada** contra una copia de `drizzle/`: con una columna temporal generó el `ALTER TABLE`; sin cambios, nada.
- **`allowScripts` resuelto**: `drizzle-kit` funciona en local y en CI pese al aviso de los `postinstall` de `esbuild`.
- **Decisiones D-1 a D-6 del [brief-3.1](docs/decisions/brief-3.1-migraciones-de-identidad.md)** resueltas según la recomendación.
- Enlaces internos verificados: 0 rotos.
- **Nivel alcanzado: validado localmente y en CI**, solo para el esquema de identidad y el aislamiento de los tests.

**No certifica:**

- **Mantenimiento de `updated_at`** con `$onUpdate` (D-3): implementado, sin test. Se ejercita cuando un repositorio actualice filas (3.3 o 3.7).
- **Autenticación, sesiones, autorización, auditoría y reglas de negocio** (último `admin`): subfases 3.2 a 3.7.
- **`format:check` local de `src/app/page.tsx`**: la copia de trabajo en Windows tiene CRLF; en CI pasa. Es previo a la 3.1.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó el brief y el cierre.

## 2026-09-13 — Fase 2 cerrada (Fundación técnica)

**Certifica:**

- **Las cinco subfases cerradas con confirmación del usuario**, en el orden 2.2 → 2.1 → 2.3 → 2.4 → 2.5.
- **Criterios de aceptación del [Roadmap](docs/planning/Roadmap.md)**:
  - lint, typecheck, test y build pasan en local y en CI;
  - la guarda falla ante una referencia prohibida (AC-3 de la 2.5 y casos versionados).
- **Gate de salida**:
  - CI en verde en el commit `e820ca4`;
  - estructura ([RepositoryStructure.md](docs/architecture/RepositoryStructure.md)) aprobada por el usuario el 2026-09-13.
- **Entregables**:
  - app Next.js que compila;
  - PostgreSQL 18 local con health check;
  - CI en verde;
  - ADR 0004 aceptado y ADR 0011 para el lint.
- **Nivel alcanzado: validado localmente y en CI** para la fundación técnica, que incluye la conexión a la base, el health check y las guardas.

**No certifica:**

- **Lógica de negocio, tablas, migraciones, autenticación ni pantallas**: empiezan en la Fase 3.
- **Aislamiento de la base de test**: se decide en la 3.1.
- **Bloqueo de merges en rojo**: no hay protección de rama en el plan gratuito de GitHub; el control es por procedimiento (brief-2.5, D-3).
- **Seguridad de dependencias**: 4 avisos moderados de `npm audit` a través de `drizzle-kit`, que quedan para la Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente. El usuario aprobó los briefs, los cierres y la estructura.

## 2026-09-13 — Subfase 2.5 cerrada (Pipeline de CI)

**Certifica:**

- **`.github/workflows/ci.yml`** corre en cada push a `main` y en cada pull request:
  - pasos: `npm ci`, lint, typecheck, formato, guardas, tests de integración contra PostgreSQL 18.6 efímero y build;
  - permisos solo de lectura, acciones fijadas por SHA y sin secrets.
- **Primera ejecución en verde**: [34783979325](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/34783979325), del commit `e820ca4`. Terminó en 62 s con los 11 pasos en verde.
- **Guardas versionadas en `tests/guards/`**, que corren en local y en CI sin base de datos:
  - **referencias prohibidas**: detecta Airtable, `AIRTABLE_*` y el repositorio del agente de WhatsApp fuera de `.md`, y permite `ai-whatsapp-agent-crm`;
  - **frontera entre módulos**: los 9 casos de la 2.3, ahora como archivos virtuales con `ESLint#lintText`.
- **Caso forzado (AC-3)**: con una referencia a Airtable agregada temporalmente en `src/app/page.tsx`, la guarda falló e indicó `src/app/page.tsx:8 (Airtable)`. El archivo se restauró.
- **Suite local**: `npm run test` pasa 24 de 24 (19 de guardas y 5 de integración), con typecheck, lint y format en verde.
- **Decisiones D-1 a D-4 del [brief-2.5](docs/decisions/brief-2.5-pipeline-de-ci.md)** resueltas según la recomendación: guardas como tests, alcance sin `.md`, CI sin protección de rama aceptada y acciones por SHA.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Que la CI bloquee un push o un merge en rojo**: GitHub no ofrece protección de rama en repositorios privados del plan gratuito.
- **Scripts de instalación de npm en CI**: el runner avisa que los `postinstall` de tres versiones de `esbuild` no están cubiertos por `allowScripts`. No afecta al pipeline actual, pero puede afectar a `drizzle-kit` en la Fase 3.
- **Tests end-to-end**: llegan con Playwright en la Fase 3.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-13 — Subfase 2.4 cerrada (Base de datos local)

**Certifica:**

- **PostgreSQL 18 local** con Docker Compose:
  - imagen `postgres:18.6-trixie`;
  - puerto publicado solo en `127.0.0.1:5432`;
  - volumen en `/var/lib/postgresql`, la ruta que exige la imagen 18. Se verificó que los datos persisten tras `down` y `up`: el `system_identifier` no cambió.
- **Conexión con Drizzle 0.45 y `pg` 8.23**, en `src/shared/db/`. La conexión se abre en el primer uso, con una sola instancia por proceso y timeout de 2 s.
- **`/api/health`** responde 200 `{"status":"ok"}` o 503 `{"status":"unavailable"}`, con `Cache-Control: no-store` y sin detalles. En runtime local respondió 200, luego 503 en 69 ms con la base detenida y otra vez 200 al levantarla, sin reiniciar `next dev`.
- **Cinco tests de integración contra PostgreSQL real** pasan:
  - consulta con Drizzle;
  - versión 18.x del servidor;
  - health check disponible;
  - conexión cortada por el servidor;
  - health check sin servidor, que no expone credenciales.
  - `--passWithNoTests` se retiró.
- **Defecto encontrado y corregido**: sin un manejador de `error`, el pool de `pg` lanzaba un `uncaughtException` cuando la base cortaba una conexión inactiva. Eso podía tirar el proceso, y el volcado incluía la contraseña. Primero se reprodujo con un test que falló; después se corrigió con `pool.on("error")`.
- **Instalación y chequeos**:
  - `npm ci` desde cero sin conflictos de dependencias pares;
  - typecheck, lint, format y build pasan con la base detenida.
- **Decisiones D-1 a D-5 del [brief-2.4](docs/decisions/brief-2.4-base-de-datos-local.md)** resueltas según la recomendación:
  - driver `pg`;
  - una sola base local;
  - health check sin detalles;
  - `process.loadEnvFile()` nativo;
  - imagen `18.6-trixie`.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Tablas, migraciones, tipos de datos ni reglas de negocio**: no existen. `drizzle-kit` está instalado, pero nunca se ejecutó.
- **Aislamiento entre la base de desarrollo y la de tests**: los tests usan la misma base porque solo leen. La separación se decide en la 3.1.
- **Ejecución en CI**: corresponde a la 2.5.
- **`postgres` 3.4 (postgres.js)**: no se probó.
- **Seguridad de dependencias**: `npm audit` informa 4 avisos moderados de `esbuild` a través de `drizzle-kit`, y 0 altos o críticos. Se tratan en la Fase 8.
- **Revisión independiente**: es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.3 cerrada (Bootstrap de la aplicación)

**Certifica:**

- **Instalación manual autorizada por el usuario**, sin `create-next-app`, con las dependencias de primer nivel que lista el [brief-2.3](docs/decisions/brief-2.3-bootstrap-de-la-aplicacion.md). `npm install` y `npm ci` corrieron sin avisos de dependencias pares, sin forzar nada y con 0 vulnerabilidades en `npm audit`.
- **[ADR 0011](docs/decisions/0011-lint-con-eslint-10-sin-eslint-config-next.md) aceptado**: lint con ESLint 10 y plugins sueltos, porque `eslint-config-next` arrastra plugins que solo aceptan ESLint 9.
- **Scripts que salen con 0**: `typecheck`, `lint`, `format:check`, `build` y `test`. `test` pasa con `--passWithNoTests`, porque todavía no hay tests.
- **Regla de frontera entre módulos**: se probó con 9 archivos temporales, 6 importaciones prohibidas y 3 permitidas, entre ellas las excepciones de `schema.ts` y `analytics`. Las 6 prohibidas fallaron y las 3 permitidas pasaron; los archivos se borraron.
- **`next dev`**: sirve `/` con 200, `lang="es"` y el título.
- **Ajustes durante la ejecución**, registrados en el brief:
  - TypeScript con rango `~6.0.3`;
  - `vitest.config.mts`;
  - `agentRules: false`, porque `next dev` escribía un bloque propio en `CLAUDE.md`. El bloque se descartó y se verificó que no vuelve a aparecer.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Validación local.** No hay tests: el nivel es *implementado*.
- **Regla de frontera en CI**: la prueba fue local y temporal. El caso versionado llega en la 2.5.
- **Accesibilidad**: no hay lint mientras `eslint-plugin-jsx-a11y` no soporte ESLint 10.
- **Base de datos, Drizzle, Playwright y estilos**: fuera del alcance.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.1 cerrada (Estructura del repositorio)

**Certifica:**

- **2.1 como subfase de diseño**, sin fusionar con la 2.3, aprobada por el usuario.
- **Seis decisiones resueltas por el usuario** según la recomendación del [brief-2.1](docs/decisions/brief-2.1-estructura-del-repositorio.md):
  - código en `src/`;
  - módulos en `src/modules/<modulo>/` con `index.ts`, `service.ts`, `repository.ts`, `schema.ts` y `types.ts`;
  - cliente de base en `src/shared/db/`;
  - migraciones en `drizzle/` y seeds en `seeds/`;
  - tests unitarios junto al código, integración en `tests/integration/` y end-to-end en `tests/e2e/`;
  - frontera entre módulos con `no-restricted-imports` de ESLint.
- **[RepositoryStructure.md](docs/architecture/RepositoryStructure.md)**: árbol, ubicación de los nueve módulos, reglas de importación y una tabla que asigna cada carpeta a la subfase que le pone su primer archivo real.
- **Consecuencia documentada**: un `schema.ts` puede importar el `schema.ts` de otro módulo para declarar claves foráneas; sin esa excepción, D-3 y D-6 se contradicen.
- Documentos alineados: `Overview.md` (interfaz pública = `index.ts`), `TestingStrategy.md` (`seeds/`) y `EngineeringStandards.md` (forma del módulo). Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Nada creado ni ejecutado.** Ninguna carpeta ni archivo de código existe todavía; todo sigue en nivel *diseñado*.
- **Que la regla de ESLint funcione** como se describe, incluida la excepción de `schema.ts`: se configura en la 2.3 y se prueba en la 2.5.
- **Que Drizzle Kit lea el esquema repartido por módulos** sin problemas: se valida en la 2.4 y con la primera migración de la Fase 3.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Subfase 2.2 cerrada (Re-verificación del stack)

**Certifica:**

- **Orden de la Fase 2**: 2.2 → 2.1 → 2.3 → 2.4 → 2.5, decidido por el usuario y registrado en el [Roadmap](docs/planning/Roadmap.md). La estructura del repositorio depende del stack aceptado.
- **Versiones vigentes verificadas el 2026-09-12** contra el registro npm y las páginas oficiales de soporte, con fuente y fecha en [EngineeringStandards.md](docs/development/EngineeringStandards.md) y la tabla completa en el [brief-2.2](docs/decisions/brief-2.2-re-verificacion-del-stack.md).
- **Seis decisiones resueltas por el usuario** según la recomendación:
  - Node 24 LTS;
  - Drizzle ORM 0.45 y Drizzle Kit 0.31;
  - ESLint 10 + `eslint-config-next` + Prettier;
  - npm 11;
  - PostgreSQL 18;
  - TypeScript 6.0.
- **[ADR 0004](docs/decisions/0004-stack-tecnologico-propuesto.md) aceptado**, con alternativas descartadas y revisiones previstas (Node 26 en LTS, TypeScript 7.1, Drizzle 1.0 antes de la 3.1).
- **Hallazgo D-6**: TypeScript 7.0 salió sin API programática y `typescript-eslint` exige `<6.1.0`, así que el proyecto queda en TypeScript 6.0.
- Enlaces internos verificados: 0 rotos.

**No certifica:**

- **Nada instalado ni ejecutado.** Todo sigue en nivel *diseñado*: sin `package.json`, lockfile, código, base de datos ni CI. La instalación es la 2.3 y requiere autorización.
- **Soporte de PostgreSQL 18 en Drizzle y sus drivers**: no se encontró declaración oficial. Se valida con conectividad real en la 2.4.
- **Compatibilidad en ejecución** entre los componentes: solo se contrastaron `engines` y `peerDependencies` declarados.
- **Revisión independiente.** Es autoevaluación del mismo agente.

## 2026-09-12 — Fase 1 cerrada (Diseño UX y validación del modelo)

**Certifica:**

- **Las tres subfases cerradas con aprobación del usuario**, ejecutadas en el orden 1.3 → 1.1 → 1.2:
  - 1.3: nueve decisiones de producto y ADRs 0007 a 0009;
  - 1.1: wireframes de las 10 pantallas;
  - 1.2: once decisiones de modelo, ADR 0010 y [matriz de trazabilidad](docs/architecture/TraceabilityMatrix.md).

  El detalle de cada una está en sus entradas, debajo.
- **Criterios de salida del [Roadmap](docs/planning/Roadmap.md), a nivel documental**:
  - cada dato mostrado en los wireframes tiene origen en `DataModel.md`;
  - cada FR tiene pantalla, endpoint o invariante con test;
  - cada índice tiene una consulta que lo usa;
  - toda decisión pendiente está resuelta o diferida con fase límite;
  - el usuario aprobó wireframes y decisiones.
- **Repositorio remoto** en GitHub privado desde el 2026-09-12, con todo el historial subido.

**No certifica:**

- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin código, migraciones, dependencias, base de datos ni CI.
- **Que el modelo funcione sobre PostgreSQL.** Constraints, índices y consultas no se ejecutaron; se validan desde la Fase 2 (entorno) y la Fase 4 (`EXPLAIN` con volumen).
- **Usabilidad ni accesibilidad probadas** con usuarios o lectores de pantalla.
- **Que las personas y las reglas reflejen la operación real** más allá de lo que confirmó el usuario: se contrastan en el piloto de la Fase 9.
- **Revisión independiente.** Todas las revisiones de la fase son autoevaluación del mismo agente.

## 2026-09-12 — Subfase 1.2 cerrada (Validación cruzada del modelo)

**Certifica:**

- **Once decisiones del [brief-1.2](docs/decisions/brief-1.2-validacion-cruzada-del-modelo.md)**, resueltas por el usuario el 2026-09-12 según la recomendación, que cierran las brechas B-1 a B-11 de los wireframes:
  - `inventory_movements.balance_after`, con los tipos de movimiento reducidos a los dos ajustes;
  - `users.must_change_password`, con el cambio obligatorio de contraseña en la pantalla 1;
  - `products.min_stock` quitado;
  - auditoría del cliente en la pantalla 7;
  - disponibilidad de la métrica 12 tomada de la configuración;
  - última interacción y cantidad de mensajes derivadas, con índices propios.
- **[ADR 0010](docs/decisions/0010-un-usuario-una-organizacion-en-el-mvp.md)** aceptado: en el MVP un usuario pertenece a una sola organización.
- **Cinco hallazgos surgidos al armar la matriz**, resueltos por el usuario:
  - se quitaron `deleted_at` de `users`, `clients` y `products`, y `organizations.slug` (H-1, H-2);
  - se corrigieron `SecurityModel.md`, `Scope.md` y `Risks.md` con autorización ampliada (H-4);
  - quedan diferidos con fase límite el tipo de búsqueda (H-3, Fases 4 y 5) y el test de enmascarado para `viewer` (H-5, Fase 5).
- **[TraceabilityMatrix.md](docs/architecture/TraceabilityMatrix.md)** con cuatro vistas:
  - cada FR tiene pantalla, endpoint o invariante con test;
  - cada índice de [DataModel.md](docs/architecture/DataModel.md) tiene una consulta que lo usa;
  - cada filtro sin índice propio está justificado.

  En la revisión se agregaron 5 índices y se quitaron 2.
- **Verificaciones documentales**: los enlaces internos resuelven; no queda ningún `BRECHA` en los wireframes; no quedan menciones vigentes a lo quitado; los archivos tocados están dentro de lo autorizado.

**No certifica:**

- **Que los índices sirvan en la práctica.** Se asignaron por la forma de cada consulta, sin ejecutar ninguna. Se confirman con `EXPLAIN` sobre datos de volumen a partir de la Fase 4.
- **Que las derivaciones (última interacción, cantidad de mensajes) rindan bien.** Se revisan con medición en staging.
- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin migraciones, código ni pruebas.
- **El cierre de la Fase 1**, que es un paso aparte con su propia aprobación.
- **Revisión independiente.** Todo el contraste es autoevaluación.

## 2026-09-12 — Subfase 1.1 cerrada (Wireframes de baja fidelidad)

**Certifica:**

- **Wireframes de las 10 pantallas** de [Screens.md](docs/product/Screens.md) en [docs/product/wireframes/](docs/product/wireframes/README.md), aprobados por el usuario el 2026-09-12. Formato Markdown con layout ASCII y variantes de escritorio y móvil, según W-1 y W-2 del [brief-1.1](docs/decisions/brief-1.1-wireframes-baja-fidelidad.md).
- **Cada dato visible tiene origen anotado**: una columna de [DataModel.md](docs/architecture/DataModel.md), una regla de derivación o una brecha. Cada pantalla separa lo que ven y hacen `admin` y `viewer`, y cubre carga, vacío, sin resultados y error.
- **Once brechas y discrepancias registradas** (B-1 a B-11) como entrada de la 1.2: siete datos que faltan en el modelo y cuatro discrepancias entre documentos. Las cinco detectadas al preparar el brief quedaron confirmadas.
- **Verificaciones documentales**: los enlaces internos resuelven; los archivos tocados están dentro de la lista autorizada; ningún wireframe muestra datos prohibidos (teléfono completo a `viewer`, vista previa de mensajes, hashes, auditoría a `viewer`) ni módulos fuera del MVP. Los nombres de archivo abreviados se aceptaron tal cual.

**No certifica:**

- **Que el modelo soporte las pantallas.** Las brechas están registradas, no resueltas: corregir `DataModel.md` y armar la matriz de trazabilidad es la 1.2.
- **Diseño visual, usabilidad ni accesibilidad probadas.** Los wireframes describen las pautas de accesibilidad; nadie los probó con usuarios ni con lectores de pantalla.
- **Nada de implementación.** Todo sigue en nivel *diseñado*.
- **Revisión independiente.** El contraste contra los criterios es autoevaluación del mismo agente que dibujó.

## 2026-09-12 — Subfase 1.3 cerrada (Decisiones de producto pendientes)

**Certifica:**

- **Las nueve decisiones del [brief-1.3](docs/decisions/brief-1.3-decisiones-de-producto-abiertas.md)**, resueltas por el usuario el 2026-09-11 y cerradas con su aprobación el 2026-09-12. Resumen: teléfono completo para `admin` y enmascarado para `viewer`, en la lista y en el detalle del cliente (la extensión al detalle fue interpretación del agente, confirmada por el usuario al cerrar); sin vista previa de mensajes; pantalla 10 de usuarios y roles dentro del MVP; zona horaria por defecto `America/Argentina/Buenos_Aires`; retención de mensajes diferida a la Fase 9; solo `admin` ajusta stock; personas aceptadas como supuesto declarado hasta el piloto.
- **ADRs [0007](docs/decisions/0007-identificador-de-cliente-solo-telefono.md), [0008](docs/decisions/0008-stock-nunca-negativo.md) y [0009](docs/decisions/0009-repositorio-remoto-github-y-ci.md)** aceptados: el cliente se identifica solo por teléfono, el stock nunca es negativo y el remoto es GitHub privado con Actions.
- **Propagación documental** a [Screens](docs/product/Screens.md), [FunctionalRequirements](docs/product/FunctionalRequirements.md), [DataModel](docs/architecture/DataModel.md) y [Risks](docs/planning/Risks.md), en el commit `cec1fc2`. Al cerrar se sumaron las adendas a [MetricsCatalog](docs/analytics/MetricsCatalog.md) (zona horaria por defecto) y [TestingStrategy](docs/development/TestingStrategy.md) (stock negativo rechazado sin movimiento y métricas cruzando un cambio de horario), y se corrigió el [Roadmap](docs/planning/Roadmap.md) para registrar que la 1.3 se ejecutó antes que la 1.1 y la 1.2.
- **Verificaciones documentales**: ninguna marca "pendiente de confirmación" sobre decisiones ya resueltas; los enlaces internos resuelven; no hay secretos ni archivos temporales.

**No certifica:**

- **Nada de implementación.** Todo sigue en nivel *diseñado*: sin código, pruebas, base de datos ni CI.
- **Que las decisiones reflejen la operación real del negocio.** Las reglas se confirmaron con el usuario, pero las personas siguen siendo un supuesto hasta el piloto de la Fase 9.
- **Wireframes ni matriz de trazabilidad**: siguen siendo la 1.1 y la 1.2.
- **Que el repositorio remoto exista.** El ADR 0009 elige el proveedor, pero decidirlo no es crearlo.
- **Revisión independiente.** La verificación es autoevaluación del mismo agente que redactó las decisiones.

## 2026-09-11 — Fase 0 cerrada (Descubrimiento, alcance y decisiones)

**Certifica:**

- **0.1 — Documentación**, aprobada por el usuario. Producto ([Vision](docs/product/Vision.md), [Scope](docs/product/Scope.md), [Personas](docs/product/Personas.md), [requisitos funcionales](docs/product/FunctionalRequirements.md) y [no funcionales](docs/product/NonFunctionalRequirements.md), [Screens](docs/product/Screens.md) con las 10 pantallas del MVP), arquitectura ([Overview](docs/architecture/Overview.md) con módulos, taxonomía de errores y observabilidad, [DataModel](docs/architecture/DataModel.md) con las 11 tablas y su ERD, [SecurityModel](docs/architecture/SecurityModel.md), [IntegrationBoundaries](docs/architecture/IntegrationBoundaries.md)), [catálogo de las 12 métricas](docs/analytics/MetricsCatalog.md) con fórmula, denominador, zona horaria y casos límite por métrica, y desarrollo ([estándares](docs/development/EngineeringStandards.md), [pruebas](docs/development/TestingStrategy.md), [entornos](docs/development/Environments.md), [protocolo de ejecución](docs/development/ExecutionProtocol.md)). Todo en nivel **diseñado**.
- **ADRs 0001 a 0006**: base de datos propia sin Airtable, monolito modular, migración del legado como proyecto separado, stack propuesto, métricas desde datos transaccionales y el repositorio como registro de decisiones. El [0004](docs/decisions/0004-stack-tecnologico-propuesto.md) queda como **propuesta** hasta re-verificar versiones en la subfase 2.2.
- **0.2 — Setup operativo**: repositorio Git en `main` con tres commits (`a3b45da`, `8b7bfa3`, `cf13247`) *(corregido el 2026-09-12: decía "dos commits")*; proyecto en Notion con 11 fases como subproyectos, 11 tareas espejo y 49 subfases como tareas; hub `80 Projects/AI WhatsApp Agent CRM` en el vault de Obsidian; semilla `docs/planning/Backlog.md` retirada tras verificar la carga.
- **Verificaciones documentales**: todos los enlaces internos resuelven (una referencia colgada detectada y corregida antes de cerrar); las menciones a Airtable son solo prohibiciones o contexto histórico, ninguna es una dependencia; las versiones del stack se verificaron contra fuentes oficiales en septiembre de 2026 y quedaron citadas.

**No certifica:**

- **Nada de implementación.** No hay código, dependencias instaladas, migraciones, base de datos, entorno ni CI. Ninguna afirmación de este repositorio supera el nivel *diseñado*.
- **Las decisiones de producto de la subfase 1.3 siguen abiertas**: teléfono enmascarado, vista previa de mensajes, alta de usuarios por pantalla o por script, identificador adicional de cliente, zona horaria por defecto, excepciones al stock negativo, retención de mensajes, y repositorio remoto y proveedor de CI.
- **Personas y varias reglas de negocio son supuestos** documentados, no confirmados con el dueño del negocio ([Risks](docs/planning/Risks.md)).
- **Wireframes y matriz de trazabilidad no existen**: son la Fase 1. `Screens.md` es especificación funcional, no diseño visual validado.
- **No hay repositorio remoto**: los tres commits viven solo en esta máquina *(corregido el 2026-09-12: decía "los dos commits")*.
- **Ninguna conexión con sistemas externos**: el contrato de ingestión está diseñado, sin emisor real ni tráfico.
