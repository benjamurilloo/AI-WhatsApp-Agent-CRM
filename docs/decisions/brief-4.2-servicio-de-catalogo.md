---
schema: task-brief.v1
task_id: 4.2
task_type: implementation
generated_at: 2026-09-15
---

# Brief: 4.2 — Servicio de catálogo

## Objetivo

1. Implementar a nivel de servicio **FR-PROD-01 a 05**: crear, editar, desactivar y reactivar productos, buscarlos y filtrarlos por estado de stock.
2. Auditar cada escritura **en la misma transacción** (FR-AUD-01).
3. Derivar el estado de stock con **comparación decimal exacta**, probando sus bordes.
4. Validar todo **localmente y en CI** contra PostgreSQL real, incluidos `FORBIDDEN`, `NOT_FOUND` entre organizaciones y `CONFLICT` por SKU.

No crea pantallas ni Server Actions: las pantallas 3 y 4 llegan en la 4.4.

## Ubicación en la Fase 4

- **Orden previsto**: 4.0 y 4.1 (cerradas) → **4.2** → 4.3.1 → 4.3.2 → 4.3.3 → 4.4.
- **Notion**: "FR-PROD-01 a 05 con auditoría, incluidos los bordes del estado de stock". Estado: "Bandeja de Entrada".
- **Necesario ahora**: casos de uso de catálogo, lectura del saldo, estado de stock, validación y sus tests.
- **Requisito antes de producción, fuera de esta subfase**: búsqueda sin distinguir acentos y revisión del costo de la composición en memoria con volumen real (Fase 8).
- **Gates de entrada**: 4.1 cerrada con CI en verde (`b33a42f`); contenedor de PostgreSQL en marcha. Si se resuelve D-3 con una migración, autorización para aplicarla en la base de desarrollo.

## Hallazgos de la verificación previa (2026-09-15)

1. **El estado de stock cruza dos módulos.** FR-PROD-04 y 05 filtran por estado, que depende de `inventories.quantity_on_hand` (de `inventory`) y de `products.reorder_point` (de `catalog`). Overview hace depender `inventory` de `catalog`, así que `catalog` no puede leer el saldo sin crear un ciclo, y no hay `JOIN` entre módulos. La 4.1 (D-7) ya fijó que el saldo se compone en memoria con 0 por defecto, pero no en qué módulo. Se resuelve en D-1.
2. **No hay representación decimal en TypeScript.** Drizzle devuelve `numeric(14, 3)` como `string`, y la regla de DataModel prohíbe comparar cantidades con `number`. El estado de stock compara `quantity_on_hand` con `reorder_point`, y el alta recibe `reorder_point` como texto de un formulario ("10", "2,5"). Se resuelve en D-2.
3. **El índice de búsqueda por nombre distingue mayúsculas.** `(organization_id, name text_pattern_ops)` sirve `name LIKE 'Caf%'`, pero no `lower(name) LIKE 'caf%'`: buscar "café" no encontraría "Café molido". El SKU ya es exacto sin distinguir mayúsculas por la 4.1 (D-6). Ninguna búsqueda ignora acentos. Se resuelve en D-3.
4. **DataModel no fija límites de texto.** La 4.1 (D-5) dejó a la 4.2 rechazar `sku`, `name` y `unit` vacíos y recortar espacios. Se resuelve en D-4.
5. **Ediciones simultáneas.** Overview lista "modificación concurrente" como `CONFLICT`, pero el wireframe 4 no tiene mensaje para ese caso. El `diff` de auditoría necesita el estado anterior real. Se resuelve en D-5.
6. **FR-AUD-02 no tiene subfase.** La pantalla 4 muestra la auditoría del producto a `admin`, pero `audit` solo expone `recordAudit` y ninguna tarea de Notion menciona la lectura. Se resuelve en D-6.
7. **Precedentes que se siguen sin decisión nueva**:
   - `CONFLICT` por unicidad: insertar dentro de un savepoint y traducir `23505` con el nombre de la constraint (`insertUserWithInitialPassword`, 3.7);
   - un cambio sin diferencias devuelve `changed: false` y no escribe ni audita (3.7);
   - orden de autorización `must_change_password` → rol → recurso filtrado por organización en SQL (3.4);
   - `recordAudit` recibe la transacción del módulo que abre el caso de uso (3.6 y 3.7).
8. **Reactivar** no figura en FR-PROD-03, pero sí en Screens §4, en el wireframe 4 y en FR-AUD-01, y `audit_action` ya tiene `reactivate`. Entra en el alcance.
9. **Interacción con la 4.3.1**: insertar un movimiento toma `FOR KEY SHARE` sobre el producto por la clave foránea, que no bloquea un `UPDATE` de `is_active`. Que un producto desactivado no reciba ajustes (FR-PROD-03) lo tiene que verificar la 4.3.1 dentro de su transacción. Queda anotado, no se decide acá.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **`catalog`** (`index.ts`, `service.ts`, `repository.ts` y tests unitarios):
   - `createProduct(context, input)`: `admin`; valida según D-2 y D-4; `CONFLICT` por SKU; audita `create` con todos los campos editables e `isActive`.
   - `updateProduct(context, productId, input)`: `admin`; también sobre productos inactivos; bloqueo y `diff` según D-5; audita `update` solo con los campos que cambiaron; `CONFLICT` por SKU.
   - `deactivateProduct` y `reactivateProduct`: `admin`; auditan `deactivate` y `reactivate`; sin cambio → `changed: false`.
   - Lecturas para `admin` y `viewer`, filtradas por organización en SQL: un producto por id y los productos que cumplen texto y actividad, según D-1 y D-3.
   - `deriveStockStatus(quantityOnHand, reorderPoint)`, pura: `sin_stock`, `bajo_stock` o `disponible` según FR-PROD-05.
   - Id que no es UUID → `VALIDATION_ERROR`; producto de otra organización o inexistente → `NOT_FOUND`.
3. **`inventory`**, solo lectura, según D-1: saldos por ids de producto, 0 si no hay fila, y la composición de la lista y el detalle con estado de stock.
4. **Cantidades** según D-2, con tests unitarios de parseo, normalización y comparación.
5. **Búsqueda** según D-3. Si D-3 cambia el índice: `schema.ts` de `catalog` y `drizzle/0006_*` generada.
6. **Lista** (FR-PROD-04 y Screens §3):
   - texto en nombre o SKU, estado (`todos`, `disponible`, `bajo_stock`, `sin_stock`) y actividad (por defecto solo activos);
   - orden por nombre, con desempate estable;
   - 25 por página; una página fuera de rango se lleva a la última; devuelve total y cantidad de páginas;
   - `%` y `_` del texto buscado se tratan como literales.
7. **Tests de integración** en `tests/integration/catalog.test.ts`, contra PostgreSQL real:
   - cada escritura con su registro de auditoría y `diff` exacto; si falla la auditoría, no persiste nada;
   - SKU duplicado, también con otras mayúsculas, en alta y en edición → `CONFLICT`, sin auditoría huérfana;
   - dos altas simultáneas con el mismo SKU: exactamente una se crea;
   - `viewer` → `FORBIDDEN` en escrituras y lecturas permitidas; `must_change_password` → `FORBIDDEN`;
   - producto de otra organización → `NOT_FOUND` en lectura, edición, desactivación y reactivación;
   - lista: cada filtro, un producto sin fila de `inventories` como `sin_stock`, orden, paginación y totales.
8. **Documentación**: DataModel (índice si D-3 lo cambia), TraceabilityMatrix, Overview (dónde se compone el estado de stock), RepositoryStructure (fila de la 4.2 y lo que cree D-2) y TestingStrategy.

## Alcance excluido

- Pantallas, Server Actions y rutas: 4.4.
- Ajustes de stock y cualquier escritura en `inventories` o `inventory_movements`: 4.3.1.
- Últimos movimientos e historial: 4.3.3.
- Lectura del historial de auditoría (FR-AUD-02): según D-6.
- Búsqueda sin distinguir acentos, que necesitaría la extensión `unaccent`.
- Seeds de productos.
- `organization_id` y duración en el log: llegan con las Server Actions de la 4.4.
- Cambios en `audit_logs`, sus enums o `recordAudit`.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/catalog/`: `index.ts`, `service.ts`, `repository.ts` y sus tests unitarios; `schema.ts` solo si D-3 cambia el índice.
- `src/modules/inventory/`: `index.ts`, `service.ts` y `repository.ts` de solo lectura, y sus tests unitarios.
- La ubicación de cantidades que resuelva D-2, con su test.
- `drizzle/0006_*` y `drizzle/meta/`, solo si D-3 cambia el índice.
- `tests/integration/catalog.test.ts`.
- Los documentos del punto 8.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-PROD-01 a 05 y FR-AUD-01.
2. [DataModel.md](../architecture/DataModel.md): `products`, `inventories` y convención de cantidades.
3. [Screens.md](../product/Screens.md) §3 y §4, con los wireframes [03](../product/wireframes/03-lista-de-productos.md) y [04](../product/wireframes/04-detalle-de-producto.md).
4. [Overview.md](../architecture/Overview.md): módulos, composición en memoria y taxonomía de errores.
5. [SecurityModel.md](../architecture/SecurityModel.md): lectura para ambos roles, escritura solo `admin`.
6. [brief-4.1](brief-4.1-migraciones-de-catalogo-e-inventario.md): D-3 a D-7 y sus consecuencias.
7. [brief-3.7](brief-3.7-gestion-de-usuarios-y-roles.md) y `src/modules/organizations/` como patrón de servicio.

## Dependencias

- 4.1 cerrada.
- Contenedor de PostgreSQL en marcha.
- Si D-3 agrega una migración: autorización para `npm run db:migrate` contra la base de desarrollo.

## Resolución (2026-09-15)

El usuario aprobó el brief con D-1 a D-6 según la recomendación: (a) en todas. También autorizó aplicar la migración de D-3 en la base local de desarrollo y pasar la 4.2 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Dónde se compone el estado de stock

- **Opciones**:
  - (a) **En `inventory`**, que ya depende de `catalog`. `catalog` es dueño de las escrituras, de sus lecturas y de `deriveStockStatus`. `inventory` expone la lista y el detalle con saldo y estado: lee los productos por la interfaz de `catalog`, sus saldos en SQL, y filtra por estado, ordena y pagina en memoria.
  - (b) **En la página** (4.4): la página pide productos a `catalog` y saldos a `inventory`, y filtra y pagina ella.
  - (c) **`catalog` depende de `inventory`** para leer saldos, invirtiendo Overview.
- **Recomendación**: (a).
  - Respeta la dirección de Overview: quien depende compone, como `organizations` compone con `auth` en la 3.7.
  - (b) deja reglas de negocio (filtro por estado, paginación) en la presentación, fuera de los tests de servicio.
  - (c) crea un ciclo en cuanto la 4.3.1 necesite validar el producto desde `inventory`.
- **Consecuencias**:
  - la 4.2 crea `index.ts`, `service.ts` y `repository.ts` de `inventory`, solo con lecturas;
  - Overview registra que el estado de stock se deriva en `catalog` y se compone en `inventory`;
  - **límite aceptado**: la lista lee todos los productos de la organización que cumplen texto y actividad. Se revisa en la Fase 8 o si una organización supera los 2 000 productos.

### D-2 — Representación de cantidades

- **Opciones**:
  - (a) **Módulo propio en `src/shared/quantity/`**, sin dependencias: parsea entrada con coma o punto, hasta 3 decimales, no negativa y dentro de `numeric(14, 3)`; normaliza a la forma de la base (`"10.000"`); compara y suma como `bigint` en milésimas.
  - (b) **Lo mismo dentro de `catalog`**, exportado por su interfaz para `inventory`.
  - (c) **Una librería decimal** (`decimal.js` o similar).
- **Recomendación**: (a).
  - Las cantidades son de `catalog` y de `inventory`, y la 4.3.1 va a sumar y restar con la misma representación; en `shared` no depende de ningún módulo.
  - `bigint` en milésimas es exacto para la escala fija de la 4.1 y no agrega dependencias.
  - (c) necesita autorización de instalación para algo que resuelven unas pocas funciones probadas.
- **Consecuencias**:
  - RepositoryStructure suma `src/shared/quantity/` a las carpetas compartidas;
  - la 4.3.1 calcula `balance_after` con estas funciones, y la base sigue como última defensa.

### D-3 — Búsqueda por texto

- **Opciones**:
  - (a) **Prefijo de nombre sin distinguir mayúsculas y SKU exacto sin distinguir mayúsculas**, como fijan DataModel y TraceabilityMatrix. `drizzle/0006_*` reemplaza el índice por `(organization_id, lower(name) text_pattern_ops)`.
  - (b) **Mantener el índice actual**: prefijo de nombre distinguiendo mayúsculas.
  - (c) **"Contiene" en nombre y SKU** (`ILIKE '%texto%'`), sin índice para el nombre; se borra el índice actual.
- **Recomendación**: (a).
  - Conserva el diseño aprobado en la 1.2 y corrige que el índice no sirve para la búsqueda que el usuario espera.
  - (b) hace que "café" no encuentre "Café molido".
  - (c) cambia el diseño de búsqueda, recorre toda la organización y deja un índice creado ayer sin consumidor.
- **Consecuencias**:
  - migración generada, sin SQL a mano; necesita autorización para aplicarla en desarrollo;
  - **límite documentado**: no ignora acentos ("cafe" no encuentra "Café").

### D-4 — Validación de campos

- **Opciones**:
  - (a) **Recortar espacios en todos los textos**, y:
    - `sku`: 1 a 64 caracteres, sin espacios internos;
    - `name`: 1 a 200;
    - `unit`: 1 a 32;
    - `description`: hasta 2 000, y vacía se guarda como `null`;
    - `reorderPoint`: obligatorio, según D-2.
  - (b) **Solo no vacíos**, sin máximos.
- **Recomendación**: (a).
  - Los máximos evitan que un texto enorme rompa la tabla y las tarjetas de la 4.4.
  - Un SKU con espacios internos es casi siempre un error de tipeo y complica la búsqueda exacta.
- **Consecuencia**: `VALIDATION_ERROR` con la lista de campos inválidos, como `createMember` en la 3.7.

### D-5 — Ediciones simultáneas del mismo producto

- **Opciones**:
  - (a) **Bloqueo de la fila y última escritura gana**: cada escritura lee el producto con `FOR UPDATE` en su transacción, calcula el `diff` sobre lo leído y escribe.
  - (b) **Control optimista**: la edición envía el `updated_at` que vio, y si cambió devuelve `CONFLICT`.
- **Recomendación**: (a).
  - La auditoría queda correcta en ambos casos: cada `diff` parte del estado real.
  - (b) exige un mensaje y un flujo de recarga que el wireframe 4 no tiene, para un caso raro en organizaciones chicas.
- **Consecuencia**: **límite documentado**: si dos `admin` editan a la vez, gana el último, y la auditoría muestra los dos cambios.

### D-6 — Lectura del historial de auditoría (FR-AUD-02)

- **Opciones**:
  - (a) **En la 4.4**, junto con la pantalla 4: una lectura paginada en `audit`, con los nombres de autor por la interfaz de `auth`.
  - (b) **En la 4.2**, como servicio.
- **Recomendación**: (a).
  - Es otro módulo y su único consumidor es la pantalla 4; la 4.2 ya suma `inventory` por D-1.
  - Queda asignada en vez de huérfana.
- **Consecuencia**: al cerrar la 4.2, la descripción de la 4.4 en Notion suma FR-AUD-02, con autorización.

## Invariantes

- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.
- Sin `JOIN` entre módulos; `catalog` no importa `inventory`.
- Toda consulta de negocio filtra por `organization_id` en SQL, que sale del contexto y nunca del input.
- Toda escritura de producto y su auditoría son atómicas.
- Ninguna cantidad se compara ni se suma con `number`.
- Ninguna vía de esta subfase escribe `inventories` ni `inventory_movements`.
- Sin dependencias nuevas.
- `drizzle-kit generate` no produce migraciones después de la última versionada.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: tests unitarios de `deriveStockStatus` en sus bordes:
  - saldo 0 → `sin_stock`;
  - saldo igual al punto → `bajo_stock`;
  - 0,001 por encima del punto → `disponible`;
  - punto 0 con saldo positivo → `disponible`;
  - valores fraccionarios.

  Además, tests de cantidades según D-2 (formatos válidos, más de 3 decimales, negativos, desborde, coma y punto) y de validación según D-4.
- **AC-3**: crear, editar, desactivar y reactivar escriben su registro de auditoría con `diff` exacto en la misma transacción; un cambio sin diferencias no escribe ni audita; si la auditoría falla, el producto no cambia.
- **AC-4**: SKU duplicado, también con otras mayúsculas, en alta y en edición → `CONFLICT` sin auditoría; dos altas simultáneas con el mismo SKU → una sola se crea.
- **AC-5**: `viewer` → `FORBIDDEN` en las escrituras y acceso en las lecturas; `must_change_password` → `FORBIDDEN`; id ajeno → `NOT_FOUND`; id inválido → `VALIDATION_ERROR`.
- **AC-6**: la lista cumple el punto 6 del alcance, con un producto sin fila de `inventories` como `sin_stock`, verificado contra PostgreSQL real.
- **AC-7**: si D-3 lo resuelve así, la `0006` se aplica sobre base vacía y sobre la de desarrollo, y `db:generate` no produce migraciones nuevas.
- **AC-8**:
  - `npm run test` pasa completo;
  - `npm run test:e2e` pasa 25 de 25;
  - con la base detenida pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`.
- **AC-9**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-10**: `git status` muestra solo archivos autorizados, y los documentos del punto 8 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests unitarios y de integración contra PostgreSQL 18.6 real, local y en CI.

**Nivel resultante esperado**: **validado localmente y en CI** para el servicio de catálogo, la lectura de saldos y el estado de stock.

**No se valida**:

- las pantallas 3 y 4 ni su accesibilidad (4.4);
- que un producto desactivado no reciba ajustes (4.3.1);
- el rendimiento de la lista con volumen real (Fase 8).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si componer el estado de stock requiere `JOIN` entre módulos o que `catalog` importe `inventory`.
- Si hace falta una dependencia nueva, un cambio en `audit_logs` o una migración distinta de la de D-3.
- Si algún test existente necesita cambios.
- Si aparece la necesidad de pantallas, Server Actions o escrituras de inventario.
- Si una comparación de cantidades no se puede resolver sin `number`.
- Antes de ejecutar migraciones contra la base de desarrollo, de commit, de push o de cambios en Notion.

## Cierre (2026-09-15)

Cerrado con confirmación del usuario. Los diez criterios se cumplen; la evidencia está en [CHANGELOG.md](../../CHANGELOG.md). CI en verde en el commit `b4e903a` ([ejecución 35002153534](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35002153534)). Nivel alcanzado: **validado localmente y en CI**. Según D-6, la descripción de la 4.4 en Notion suma FR-AUD-02.

### Ajustes durante la ejecución

- **Ninguna condición de detención se activó**: la composición no necesitó `JOIN` ni que `catalog` importe `inventory`, la `0006` la generó Drizzle Kit sin SQL a mano y ningún test existente cambió.
- **Entrada de cantidades**: exige al menos un dígito entero (",5" se rechaza) y no admite separador de miles. Queda cubierto por los tests unitarios de `src/shared/quantity/`.
- **Búsqueda**: el texto se recorta; el SKU se compara exacto con `lower()` y el nombre por prefijo con `lower(name) LIKE`, escapando `\`, `%` y `_`.
- **Fallo de auditoría en los tests**: se provoca con un contexto cuyo `userId` no existe, sin mocks: la clave foránea de `audit_logs` falla después del insert y la transacción entera se revierte.
- **Un test unitario mal escrito**: afirmaba que `number` no redondeaba una suma cerca del máximo; se reemplazó por una comparación que muestra la diferencia real.
- **Detalle pendiente para la 4.4**: `updateProduct` con un id inválido devuelve `VALIDATION_ERROR` con `fields: []`, mientras las demás funciones devuelven el código solo. Se unifica cuando la pantalla consuma el resultado.
