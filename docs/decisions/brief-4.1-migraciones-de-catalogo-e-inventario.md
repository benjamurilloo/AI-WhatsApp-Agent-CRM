---
schema: task-brief.v1
task_id: 4.1
task_type: implementation
generated_at: 2026-09-15
---

# Brief: 4.1 — Migraciones de catálogo e inventario

## Objetivo

1. Crear en PostgreSQL las tablas `products`, `inventories` e `inventory_movements` de [DataModel.md](../architecture/DataModel.md), con sus constraints, índices y claves foráneas.
2. Hacer que `inventory_movements` sea **de solo inserción por permisos y por trigger**, según el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).
3. Dejar el **invariante de stock no negativo** del [ADR 0008](0008-stock-nunca-negativo.md) como última defensa en la base.
4. Validar cada invariante **localmente y en CI** contra PostgreSQL real, intentando violarlo.

Es una subfase de esquema: no crea servicios, casos de uso, pantallas ni seeds. Esos llegan en la 4.2 (catálogo), la 4.3 (ajuste, concurrencia e historial) y la 4.4 (UI).

## Ubicación en la Fase 4

- **Orden previsto**: 4.0 (cerrada) → **4.1** → 4.2 → 4.3.1 → 4.3.2 → 4.3.3 → 4.4.
- **Notion**: "`products`, `inventories` e `inventory_movements`, con inmutabilidad de movimientos verificada por permisos". Estado: "Bandeja de Entrada".
- **Necesario ahora**: tablas, constraints, privilegios, trigger y sus tests.
- **Requisito antes de producción, fuera de esta subfase**: que la aplicación se conecte con un rol miembro de `crm_app` (Fases 8 y 9, ADR 0013).
- **Gates de entrada**:
  1. 4.0 cerrada, con CI en verde en `0ff4461`.
  2. Contenedor de PostgreSQL en marcha.
  3. **Autorización para ejecutar las migraciones** contra la base local de desarrollo. Las bases `_test` y `_e2e` se recrean solas en cada ejecución.

## Hallazgos de la verificación previa (2026-09-15)

1. **Estado**: `main` limpio en `0ff4461`, con la CI en verde (ejecución 34917086706).
2. **Módulos dueños** (Overview): `products` pertenece a `catalog`; `inventories` e `inventory_movements`, a `inventory`, que depende de `catalog`. Ninguna de las dos carpetas existe. Se resuelve en D-2.
3. **Nada en el diseño impide que un movimiento o un saldo apunte a un producto de otra organización.** `inventory_movements` e `inventories` tienen `organization_id` y `product_id` como claves foráneas independientes. Un defecto de servicio podría escribir un movimiento de la organización A sobre un producto de la B, y ninguna constraint lo rechazaría. Se resuelve en D-3.
4. **`numeric` sin precisión** en `quantity_on_hand`, `quantity`, `balance_after` y `reorder_point` admite cualquier cantidad de decimales. `unit` es texto libre ("unidad", "kg"), así que puede haber cantidades fraccionarias. Además, Drizzle devuelve `numeric` como `string`. Se resuelve en D-4.
5. **`reorder_point` no tiene `CHECK`**, y `reason` es `not null` pero admite texto vacío. DataModel no los restringe, aunque FR-PROD-06 exige "motivo obligatorio". Se resuelve en D-5.
6. **Unicidad del SKU**: DataModel pide `UNIQUE(organization_id, sku)`, que distingue mayúsculas. `CAF-250` y `caf-250` podrían convivir como productos distintos. En la 3.7, el email de `users` resolvió lo mismo con un índice único sobre `lower(email)`. Se resuelve en D-6.
7. **DataModel dice "un registro por producto" en `inventories`**, pero no dice quién lo crea. Si lo crea `catalog` al dar de alta el producto, `catalog` tiene que escribir una tabla de `inventory`, que depende de él: sería un ciclo entre módulos. Un trigger que lo cree llevaría a la base una regla que cruza dos módulos, algo que la 3.7 (D-4) evitó. Afecta al esquema porque decide si la ausencia de fila es un estado válido. Se resuelve en D-7.
8. **Drizzle 0.45.2 expresa todo el esquema en `schema.ts`**: `check()`, índices por expresión y la clase de operador `text_pattern_ops`. Los privilegios y el trigger necesitan una migración a medida, como la `0003` de la 3.6.
9. **Tests existentes que hay que tocar**:
   - `identity-schema.test.ts` exige que existan exactamente seis tablas en `public`;
   - la lista `INSERT_ONLY_TABLES` del test de cobertura de privilegios vive en `audit.test.ts`.

   Ninguno cambia de lógica: solo suman las tablas nuevas.
10. **`resetDatabase` vacía todas las tablas de `public`** con `truncate … cascade`, así que las tablas nuevas entran solas. El `beforeEach` de los end-to-end borra organizaciones distintas de la del seed; como no hay productos en esa base, las claves foráneas `RESTRICT` no lo bloquean.
11. **`audit_logs` ya admite `product` e `inventory`** como `entity_type` y `stock_adjustment` como acción. No hace falta tocar sus enums.

## Alcance incluido

1. Registrar la resolución de D-1 a D-7.
2. **`src/modules/catalog/schema.ts`** con `products`:
   - columnas de DataModel;
   - la unicidad del SKU según D-6, el índice `(organization_id, name text_pattern_ops)` y lo que pida D-3;
   - `CHECK` según D-4 y D-5;
   - `organization_id` con `ON DELETE RESTRICT`;
   - `updated_at` con `$onUpdate`.
3. **`src/modules/inventory/schema.ts`** con:
   - el enum `inventory_movement_type` (`adjustment_positive`, `adjustment_negative`);
   - `inventories`: `UNIQUE(product_id)`, `CHECK (quantity_on_hand >= 0)`, `updated_at` con `$onUpdate`;
   - `inventory_movements`: `CHECK (quantity > 0)`, `CHECK (balance_after >= 0)`, el índice `(organization_id, product_id, created_at desc)` y lo que pida D-5;
   - claves foráneas hacia `organizations`, `products` y `users`, todas con `ON DELETE RESTRICT` y la forma de D-3.
4. **Migraciones**:
   - `drizzle/0004_*`, generada por `drizzle-kit generate`;
   - `drizzle/0005_*`, a medida (`--custom`): `GRANT SELECT, INSERT, UPDATE, DELETE` sobre `products` e `inventories`; `GRANT SELECT, INSERT` sobre `inventory_movements`; función y trigger `BEFORE UPDATE OR DELETE` propios de `inventory_movements` con SQLSTATE `P0001`. La `0003` no se modifica.
5. **Tests de integración** en `tests/integration/catalog-inventory-schema.test.ts`, con SQL directo:
   - defaults: `id`, `unit = 'unidad'`, `reorder_point = 0`, `is_active = true`, `quantity_on_hand = 0` y timestamps;
   - `NOT NULL` de cada columna obligatoria;
   - SKU repetido en la misma organización (con las variantes de D-6) → `23505`; el mismo SKU en otra organización se acepta;
   - segunda fila de `inventories` para el mismo producto → `23505`;
   - `quantity_on_hand < 0`, `quantity <= 0`, `balance_after < 0` y los `CHECK` de D-4 y D-5 → `23514`;
   - `type` fuera del enum → `22P02`;
   - claves foráneas inexistentes → `23503`, y borrar una organización, un producto o un usuario referenciados → `23001`;
   - lo que D-3 prohíbe: un saldo o un movimiento con el producto de otra organización;
   - `inventory_movements` como `crm_app` (`SET LOCAL ROLE`): inserta y lee; `UPDATE` y `DELETE` → `42501`;
   - `inventory_movements` como rol dueño: `UPDATE` y `DELETE` → `P0001`, y la fila no cambia;
   - `products` e `inventories` como `crm_app`: `SELECT`, `INSERT`, `UPDATE` y `DELETE` permitidos.
6. **Tests existentes**, solo en lo indicado:
   - `audit.test.ts`: `inventory_movements` se suma a `INSERT_ONLY_TABLES`;
   - `identity-schema.test.ts`: la lista exacta de tablas suma las tres nuevas.
7. **Documentación**:
   - DataModel: estado de las tres tablas, resoluciones de D-3 a D-7 y módulos dueños;
   - TraceabilityMatrix: índices según D-3 y D-6;
   - TestingStrategy: invariantes de esquema cubiertos, y qué queda para la 4.3;
   - RepositoryStructure: fila de la 4.1;
   - la tabla de módulos de Overview no cambia.

## Alcance excluido

- Servicios, casos de uso e interfaces públicas (`index.ts`) de `catalog` e `inventory`: 4.2 y 4.3.
- La transacción de ajuste, el bloqueo de concurrencia y el cálculo de `balance_after`: 4.3.1 y 4.3.2.
- Consultas de listado, búsqueda e historial: 4.2 y 4.3.3.
- Pantallas 3 a 5: 4.4.
- Seeds de productos o de volumen.
- Cambios en `audit_logs`, en sus enums o en `recordAudit`.
- Conectar la aplicación con `crm_app`: Fases 8 y 9.
- Tipos de movimiento de compras o ventas.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/catalog/schema.ts` y `src/modules/inventory/schema.ts`.
- `drizzle/0004_*.sql`, `drizzle/0005_*.sql` y los archivos de `drizzle/meta/` que genera Drizzle Kit.
- `tests/integration/catalog-inventory-schema.test.ts`.
- `tests/integration/audit.test.ts` e `tests/integration/identity-schema.test.ts`, solo en lo que dice el punto 6.
- Los documentos del punto 7.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md): reglas de diseño 1 a 12 y tablas `products`, `inventories` e `inventory_movements`.
2. [ADR 0008](0008-stock-nunca-negativo.md) y [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).
3. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-PROD-01 a 09.
4. [Overview.md](../architecture/Overview.md): módulos y dependencias.
5. [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md): índices de las pantallas 3 a 5.
6. [brief-3.1](brief-3.1-migraciones-de-identidad.md) (convenciones de esquema) y [brief-3.6](brief-3.6-modulo-de-auditoria.md) (solo inserción).

## Dependencias

- 4.0 cerrada.
- Contenedor de PostgreSQL en marcha.
- Autorización para `npm run db:migrate` contra la base de desarrollo.

## Resolución (2026-09-15)

El usuario aprobó el brief con D-1 a D-7 según la recomendación: (a) en todas. También autorizó ejecutar las migraciones contra la base local de desarrollo y pasar la 4.1 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Una subfase o dos

- **Opciones**:
  - (a) **Una subfase**: las tres tablas, privilegios, trigger y tests.
  - (b) **Dividir**: `products` primero; `inventories` e `inventory_movements` después.
- **Recomendación**: (a).
  - Las claves foráneas de inventario apuntan a `products`: la segunda parte no se prueba sin la primera.
  - Es solo esquema, con un patrón ya probado en la 3.1 y la 3.6.
- **Consecuencia**: ninguna en Notion.

### D-2 — Módulos dueños y carpetas

- **Opciones**:
  - (a) **Según Overview**: `products` en `src/modules/catalog/schema.ts`; `inventories` e `inventory_movements` en `src/modules/inventory/schema.ts`, que importa `products` desde el `schema.ts` de `catalog` para sus claves foráneas. Cada carpeta nace solo con `schema.ts`, como `auth` y `organizations` en la 3.1.
  - (b) **Las tres tablas en `inventory`**, y `catalog` las lee por su interfaz.
- **Recomendación**: (a).
  - Respeta la tabla de módulos de Overview y la excepción de `schema.ts` de la regla de frontera.
  - (b) contradice Overview, que asigna los productos a `catalog`.
- **Consecuencia**: `drizzle.config.ts` ya toma `src/modules/*/schema.ts`; no cambia.

### D-3 — Integridad entre organización y producto

- **Opciones**:
  - (a) **Claves foráneas compuestas**: `products` suma `UNIQUE(organization_id, id)`; `inventories` e `inventory_movements` referencian `(organization_id, product_id)` → `products(organization_id, id)`. Un saldo o un movimiento con el producto de otra organización es imposible en la base.
  - (b) **Claves foráneas simples**, como dice DataModel, y la coherencia la garantiza el servicio de la 4.3.
- **Recomendación**: (a).
  - La regla 2 de DataModel pone el aislamiento por organización "desde el diseño, no como capa añadida después".
  - `inventory_movements` es de solo inserción: un movimiento cruzado no se puede corregir después.
  - El costo es un índice único más sobre `products`, que PostgreSQL necesita para la referencia.
- **Consecuencia**: DataModel y TraceabilityMatrix registran el índice y las claves compuestas. `users` (`created_by`) sigue con clave simple: un usuario pertenece a una sola organización (ADR 0010), y eso lo verifica la autorización.

### D-4 — Precisión de las cantidades

- **Opciones**:
  - (a) **`numeric(14, 3)`** en `reorder_point`, `quantity_on_hand`, `quantity` y `balance_after`: hasta 99 999 999 999,999, con tres decimales para unidades como "kg".
  - (b) **`numeric` sin precisión**, como dice DataModel.
  - (c) **`integer`**: solo cantidades enteras.
- **Recomendación**: (a).
  - `unit` es texto libre, así que (c) impediría vender por peso o por litro.
  - (b) acepta cualquier cantidad de decimales: dos ajustes pueden dejar un saldo como `0,1000000001`, que en pantalla parece cero y no lo es para el `CHECK` ni para FR-PROD-05.
  - Con escala fija, PostgreSQL redondea al guardar y las comparaciones son exactas.
- **Consecuencia**: Drizzle devuelve `string` para `numeric`. La 4.2 y la 4.3 comparan y suman en SQL o con una representación decimal exacta, nunca con `number` de JavaScript. Queda escrito en DataModel.

### D-5 — `CHECK` adicionales

- **Opciones**:
  - (a) **Sumar** `CHECK (reorder_point >= 0)` y `CHECK (btrim(reason) <> '')`.
  - (b) **Solo los `CHECK` de DataModel**, y el servicio valida el resto.
- **Recomendación**: (a).
  - Un punto de reposición negativo no tiene significado en FR-PROD-05.
  - FR-PROD-06 exige motivo, y en una tabla de solo inserción un motivo vacío no se puede corregir.
  - Siguen el criterio del ADR 0008: la base es la última defensa; el servicio valida antes y devuelve el error de dominio.
- **Consecuencia**: `sku`, `name` y `unit` vacíos los valida el servicio de la 4.2, porque son editables y se corrigen.

### D-6 — Unicidad del SKU

- **Opciones**:
  - (a) **Índice único sobre `(organization_id, lower(sku))`**, como el email de `users`. `CAF-250` y `caf-250` chocan; el SKU se guarda como lo escribió el usuario.
  - (b) **`UNIQUE(organization_id, sku)`** como dice DataModel, con el servicio de la 4.2 normalizando a mayúsculas.
- **Recomendación**: (a).
  - Mismo criterio que el email en la 3.7, y la unicidad queda en la base (regla 7 de DataModel), no en una normalización que un camino futuro podría saltear.
  - La búsqueda exacta de la 4.2 usa `lower(sku) = lower($1)` y aprovecha el mismo índice.
- **Consecuencia**: DataModel y TraceabilityMatrix cambian el índice. Espacios al principio o al final los recorta el servicio de la 4.2.

### D-7 — Quién crea la fila de `inventories`

- **Opciones**:
  - (a) **`inventory` la crea en el primer ajuste**, dentro de la misma transacción (`INSERT … ON CONFLICT (product_id) DO NOTHING` y después el bloqueo de la fila). Un producto sin fila tiene saldo 0.
  - (b) **Trigger `AFTER INSERT` sobre `products`** que crea la fila con saldo 0.
  - (c) **`catalog` la crea al dar de alta el producto**, llamando a `inventory`.
- **Recomendación**: (a).
  - (c) crea un ciclo: `inventory` depende de `catalog` según Overview.
  - (b) lleva a la base una regla que cruza dos módulos, lo que la 3.7 (D-4) descartó.
  - (a) respeta FR-PROD-07: la única escritura de `quantity_on_hand` sigue siendo la del ajuste, junto a su movimiento.
- **Consecuencias**:
  - DataModel pasa de "un registro por producto" a "a lo sumo un registro por producto; sin registro, el saldo es 0";
  - la 4.2 y la 4.4 componen el saldo en memoria con 0 por defecto, sin `JOIN` entre módulos;
  - el test de concurrencia de la 4.3.2 cubre dos primeros ajustes simultáneos sobre un producto sin fila.

## Invariantes

- No hay referencias a Airtable ni al repositorio del agente de WhatsApp.
- Toda tabla nueva tiene `organization_id` y claves foráneas con `ON DELETE RESTRICT`.
- `quantity_on_hand` nunca queda negativo por ninguna vía de escritura, incluido SQL directo.
- `inventory_movements` rechaza `UPDATE` y `DELETE`: con `42501` para `crm_app` y con `P0001` para el rol dueño.
- Cada tabla de `public` tiene los privilegios esperados para `crm_app`.
- Ningún `JOIN` entre módulos ni código de servicio: esta subfase es solo esquema.
- Sin dependencias nuevas.
- `drizzle-kit generate` no produce migraciones después de la 0005.

## Criterios de aceptación

- **AC-1**: D-1 a D-7 tienen resolución del usuario con fecha.
- **AC-2**: las migraciones 0004 y 0005 se aplican sobre una base vacía y sobre la de desarrollo, y aplicarlas otra vez no hace nada.
- **AC-3**: los casos del punto 5 pasan contra PostgreSQL real, cada uno con el SQLSTATE esperado.
- **AC-4**: el test de cobertura de privilegios pasa con `inventory_movements` en la lista de solo inserción, y sigue detectando una tabla sin privilegios.
- **AC-5**: `npm run test` pasa completo; los tests existentes solo cambiaron en lo que indica el punto 6.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones nuevas.
- **AC-7**: `npm run test:e2e` sigue pasando 25 de 25.
- **AC-8**: CI en verde en el commit de la subfase, incluido el paso de desfase de migraciones, verificado con `gh run view`.
- **AC-9**: `git status` muestra solo archivos autorizados y los documentos del punto 7 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: salida de `npm run test` con los tests de integración contra PostgreSQL 18.6 real, y verificaciones con la base detenida.
- **Evidencia de CI**: ejecución en verde con el paso de desfase y la integración.

**Nivel resultante esperado**: **validado localmente y en CI** para el esquema de catálogo e inventario y la solo inserción de `inventory_movements`.

**No se valida**:

- que la aplicación no pueda saltearse el movimiento: no hay servicio todavía (4.3.1);
- ajustes concurrentes (4.3.2);
- la aplicación conectada con `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si Drizzle Kit no puede generar alguna constraint o índice de D-3 a D-6 y hace falta SQL a mano fuera de la 0005.
- Si una clave foránea compuesta de D-3 no se puede declarar en `schema.ts` sin romper la regla de frontera.
- Si algún test existente necesita cambios distintos de los del punto 6.
- Si el paso de desfase de la CI detecta diferencias después de la 0005.
- Si aparece la necesidad de código de servicio, seeds o una dependencia nueva.
- Antes de ejecutar migraciones contra la base de desarrollo, de commit, de push o de cambios en Notion.
