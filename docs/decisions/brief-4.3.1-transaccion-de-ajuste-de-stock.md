---
schema: task-brief.v1
task_id: 4.3.1
task_type: implementation
generated_at: 2026-09-15
---

# Brief: 4.3.1 — Transacción de ajuste de stock

## Objetivo

1. Implementar a nivel de servicio el **ajuste manual de stock** (FR-PROD-06): movimiento, saldo y auditoría en una sola transacción.
2. Rechazar sin efectos, con `BUSINESS_RULE_VIOLATION`, un ajuste que dejaría el saldo negativo (FR-PROD-08, [ADR 0008](0008-stock-nunca-negativo.md)) o que apunta a un producto desactivado (FR-PROD-03).
3. Dejar **una sola vía** en la aplicación para modificar `quantity_on_hand`, siempre junto con su movimiento (FR-PROD-07), y una guarda que lo haga cumplir.
4. Validar todo **localmente y en CI** contra PostgreSQL real.

Es el punto más delicado del MVP según el Roadmap. Los tests de carrera son de la 4.3.2; esta subfase implementa los bloqueos que esos tests van a poner a prueba.

## Ubicación en la Fase 4

- **Orden previsto**: 4.0 a 4.2 (cerradas) → **4.3.1** → 4.3.2 → 4.3.3 → 4.4.
- **Notion**: "Movimiento, saldo y auditoría atómicos (FR-PROD-06, 07 y 08). Saldo negativo devuelve BUSINESS_RULE_VIOLATION sin efectos." Estado: "En proceso" desde la aprobación.
- **Necesario ahora**: el caso de uso `adjustStock`, los bloqueos, los rechazos tipados, la auditoría, la guarda de escrituras y sus tests.
- **En la 4.3.2**: probar con conexiones simultáneas que dos ajustes no pierden actualizaciones ni dejan saldo negativo, incluidos dos primeros ajustes sobre un producto sin fila y un ajuste contra una desactivación.
- **Gates de entrada**: 4.2 cerrada con CI en verde (`0d54498`); contenedor de PostgreSQL en marcha. No se esperan migraciones.

## Hallazgos de la verificación previa (2026-09-15)

1. **Decisiones ya aprobadas que esta subfase aplica sin reabrir**:
   - la fila de `inventories` se crea en el primer ajuste con `INSERT … ON CONFLICT (product_id) DO NOTHING` y después se bloquea; sin fila, el saldo es 0 (brief-4.1, D-7);
   - cantidades como `bigint` en milésimas con `src/shared/quantity/` (brief-4.2, D-2);
   - `recordAudit` recibe la transacción que abre el módulo dueño del caso de uso (3.6 y 3.7).
2. **El producto desactivado no lo detiene el esquema.** Insertar un movimiento toma `FOR KEY SHARE` sobre el producto por la clave foránea, que no bloquea un `UPDATE` de `is_active` (brief-4.2, hallazgo 9). Además `inventory` no puede leer `products` en SQL: necesita una función de `catalog` que reciba la transacción. Se resuelve en D-1.
3. **El wireframe 5 y Screens §5 piden `CONFLICT` por cambio concurrente**: "El stock cambió mientras registrabas el ajuste", con el saldo actualizado. Sin un dato del saldo que vio el usuario, el servidor no puede detectarlo: el ajuste se aplicaría sobre otro saldo sin avisar. Se resuelve en D-2.
4. **"Sin efectos" incluye la fila de `inventories`.** Si el primer ajuste de un producto sin fila se rechaza (negativo, desactivado o conflicto), el `INSERT … ON CONFLICT DO NOTHING` ya creó la fila con saldo 0. Devolver el rechazo y confirmar la transacción la dejaría escrita. Todo rechazo posterior a esa escritura tiene que revertir la transacción.
5. **Los datos del rechazo no están tipados.** FR-PROD-08 exige informar saldo actual y cantidad solicitada, el wireframe distingue "saldo negativo" de "producto desactivado", y un ajuste positivo puede superar el máximo de `numeric(14, 3)` (el `INSERT` fallaría con `22003`). Se resuelve en D-3.
6. **La auditoría del ajuste no tiene forma definida.** `audit_logs` admite `entity_type = inventory` y `action = stock_adjustment`, y la 3.6 (D-1) dejó registrado que todos los valores del enum tienen productor en el MVP. El wireframe 4 muestra el ajuste en el historial del producto ("Ajuste stock 10 → 6"). Se resuelve en D-4.
7. **El motivo no tiene máximo.** DataModel exige `reason` no vacío por `CHECK` (brief-4.1, D-5), pero no fija largo. Se resuelve en D-5.
8. **FR-PROD-07 no tiene evidencia posible solo con tests de integración**: prueban que el ajuste escribe ambas tablas, no que no exista otra vía. Se resuelve en D-6.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **`catalog`**: una función exportada que recibe la transacción, busca el producto filtrado por organización y lo bloquea según D-1. Devuelve si existe y si está activo.
3. **`inventory`** (`service.ts`, `repository.ts`, `index.ts` y tests unitarios): `adjustStock(context, productId, input)`, solo `admin`, en este orden dentro de una transacción:
   1. autorización y validación de la entrada (D-2 y D-5), antes de abrir la transacción;
   2. bloqueo del producto por `catalog` (D-1): inexistente o de otra organización → `NOT_FOUND`; desactivado → rechazo de D-3;
   3. `INSERT … ON CONFLICT (product_id) DO NOTHING` en `inventories` y lectura del saldo con `FOR UPDATE`;
   4. saldo distinto del esperado → `CONFLICT` con el saldo actual (D-2);
   5. cálculo del saldo resultante con `src/shared/quantity/`: negativo o por encima del máximo → rechazo de D-3;
   6. inserción del movimiento con `balance_after`, actualización de `quantity_on_hand` y auditoría (D-4).

   Todo rechazo posterior al paso 2 revierte la transacción: no queda ni la fila de `inventories` (hallazgo 4).
4. **Una sola escritura del saldo** en `repository.ts`, que inserta el movimiento y actualiza `inventories` juntos, más la guarda de D-6.
5. **Tests unitarios**: cálculo del saldo resultante y sus bordes (queda en 0, queda en −0,001, supera el máximo por una milésima) y validación de la entrada.
6. **Tests de integración** en `tests/integration/inventory-adjustment.test.ts`, contra PostgreSQL real:
   - primer ajuste de un producto sin fila: crea la fila, el movimiento con `balance_after` y la auditoría;
   - varios ajustes seguidos: después de cada uno, `balance_after` del último movimiento es igual a `quantity_on_hand` (caso obligatorio de TestingStrategy);
   - un ajuste negativo que deja el saldo en 0 se acepta; uno que lo dejaría en −0,001 se rechaza con saldo actual y cantidad solicitada;
   - cada rechazo (negativo, desactivado, máximo, `CONFLICT`) no deja movimiento, auditoría ni cambio de saldo, ni la fila de `inventories` si no existía;
   - `viewer` y contraseña pendiente → `FORBIDDEN`; producto de otra organización → `NOT_FOUND`; id inválido y entrada inválida → `VALIDATION_ERROR`;
   - si falla una escritura posterior al saldo, no persiste nada.
7. **Documentación**: DataModel (productor `inventory` de `audit_logs` y orden de la transacción), Overview (flujo del ajuste), TestingStrategy, RepositoryStructure (fila de la 4.3.1 y la guarda nueva).

## Alcance excluido

- Tests de carrera con conexiones simultáneas: 4.3.2.
- Historial de movimientos y sus filtros: 4.3.3.
- Pantalla 5, Server Actions y la vista previa del saldo resultante: 4.4.
- Lectura del historial de auditoría (FR-AUD-02): 4.4.
- Tipos de movimiento distintos de los dos ajustes.
- Migraciones y cambios en `audit_logs`, sus enums o `recordAudit`.
- Seeds.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/inventory/`: `service.ts`, `repository.ts`, `index.ts` y sus tests unitarios.
- `src/modules/catalog/`: `service.ts`, `repository.ts` e `index.ts`, solo para la función de D-1.
- `src/shared/quantity/` y su test, solo si el cálculo necesita una función que hoy no existe.
- `tests/integration/inventory-adjustment.test.ts`.
- La guarda de D-6 en `tests/guards/`.
- Los documentos del punto 7.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-PROD-03, 06, 07 y 08, y FR-AUD-01.
2. [ADR 0008](0008-stock-nunca-negativo.md): stock nunca negativo, `BUSINESS_RULE_VIOLATION` con saldo actual y cantidad solicitada.
3. [DataModel.md](../architecture/DataModel.md): reglas 10 a 12, `inventories`, `inventory_movements` y forma de `diff`.
4. [Screens.md](../product/Screens.md) §5 y [wireframe 05](../product/wireframes/05-ajuste-de-inventario.md): estados de validación, saldo negativo, producto desactivado y cambio concurrente.
5. [Overview.md](../architecture/Overview.md): flujo del ajuste, taxonomía de errores y composición entre módulos.
6. [brief-4.1](brief-4.1-migraciones-de-catalogo-e-inventario.md) (D-7) y [brief-4.2](brief-4.2-servicio-de-catalogo.md) (D-1, D-2 y hallazgo 9).

## Dependencias

- 4.2 cerrada.
- Contenedor de PostgreSQL en marcha.

## Resolución

El usuario aprobó el brief el 2026-09-15 con la recomendación de cada decisión: D-1 (a), D-2 (a), D-3 (a), D-4 (a), D-5 (a) y D-6 (a).

## Decisiones

Cada decisión conserva las opciones evaluadas y la recomendación aprobada.

### D-1 — Cómo el ajuste verifica y protege el producto

- **Opciones**:
  - (a) **`FOR SHARE` sobre el producto**, con una función de `catalog` que recibe la transacción. Varios ajustes del mismo producto la toman a la vez, y se serializan después en la fila de `inventories`. Una desactivación o una edición, que toman `FOR UPDATE` desde la 4.2, esperan a que el ajuste termine, y viceversa.
  - (b) **`FOR UPDATE` sobre el producto**: serializa todo en esa fila, incluidos los ajustes entre sí.
  - (c) **Leer `is_active` sin bloqueo**.
- **Recomendación**: (a).
  - Cierra la carrera del hallazgo 2 sin bloquear más de lo necesario.
  - (b) también funciona, pero hace que una edición del nombre espere detrás de cada ajuste y viceversa, sin ganar nada sobre (a).
  - (c) deja pasar un ajuste sobre un producto desactivado en el mismo instante.
- **Consecuencias**:
  - orden fijo de bloqueos en todo ajuste: producto (`FOR SHARE`) y después `inventories` (`FOR UPDATE`); la 4.3.2 lo pone a prueba;
  - `catalog` suma a su interfaz una función que exige la transacción por tipo, como `recordAudit`.

### D-2 — Detección del cambio concurrente

- **Opciones**:
  - (a) **Saldo esperado obligatorio en la entrada**: el ajuste lleva el saldo que el usuario vio. Bajo el bloqueo, si el saldo actual es otro → `CONFLICT` con el saldo actual, sin efectos.
  - (b) **Sin saldo esperado**: el ajuste se aplica sobre el saldo que haya, y solo lo detiene la regla de no negatividad.
- **Recomendación**: (a).
  - Es lo que especifican Screens §5 y el wireframe 5: sin el saldo esperado, el servidor no puede saber que el usuario confirmó sobre un número viejo.
  - Un ajuste casi siempre corrige un conteo: aplicarlo sobre otro saldo registra un movimiento correcto en forma pero equivocado en intención.
- **Consecuencia**: la 4.4 envía el saldo mostrado junto con el formulario y, ante `CONFLICT`, muestra el saldo actualizado.

### D-3 — Forma de los rechazos

- **Opciones**:
  - (a) **`BUSINESS_RULE_VIOLATION` con `rule`**:
    - `negative_stock`, con `currentQuantityOnHand` y `requestedQuantity`;
    - `inactive_product`;
    - `stock_limit`, con `currentQuantityOnHand` y `requestedQuantity`, si el saldo resultante supera 99 999 999 999,999;

    y `CONFLICT` con `currentQuantityOnHand`. Las cantidades van como texto en la escala de la base.
  - (b) **Un solo `BUSINESS_RULE_VIOLATION` sin datos**, y la pantalla vuelve a consultar.
- **Recomendación**: (a).
  - FR-PROD-08 y el ADR 0008 exigen informar saldo actual y cantidad solicitada.
  - El wireframe muestra mensajes distintos para cada caso.
  - El máximo se rechaza como regla de negocio y no como un `22003` que terminaría en `INTERNAL`, como pide Overview para las constraints.
- **Consecuencia**: el tipo `Failure` ya admite datos propios por código; no cambia `src/shared/errors/`.

### D-4 — Auditoría del ajuste

- **Opciones**:
  - (a) **`entity_type = inventory`, `entity_id` = id del producto**, `action = stock_adjustment`, `diff = { before: { quantityOnHand }, after: { quantityOnHand } }`.
  - (b) **`entity_type = product`**, con el mismo `entity_id` y `diff`.
  - (c) **`entity_type = inventory`, `entity_id` = id de la fila de `inventories`**.
- **Recomendación**: (a).
  - Mantiene lo que registró la 3.6: `inventory` tiene productor, y distingue un ajuste de una edición del producto.
  - Con el id del producto, la pantalla 4 de la 4.4 lee el historial del producto con una sola condición sobre `entity_id` y los dos tipos, sin buscar la fila de `inventories`, que ni siquiera existe antes del primer ajuste.
  - (b) deja `inventory` sin productor; (c) obliga a la 4.4 a traducir ids.
- **Consecuencia**: DataModel documenta el productor `inventory` como la 3.7 documentó `organization_member`. El id del movimiento no entra al `diff`, porque `before` y `after` llevan los mismos campos; el movimiento se ubica por producto y fecha.

### D-5 — Validación de la entrada

- **Opciones**:
  - (a) **Validación estricta**:
    - `type`: `adjustment_positive` o `adjustment_negative`;
    - `quantity`: mayor a 0, según `parseQuantityInput`;
    - `expectedQuantityOnHand`: cantidad válida según D-2;
    - `reason`: se recorta, de 1 a 500 caracteres.
  - (b) **Igual, con `reason` sin máximo**.
- **Recomendación**: (a).
  - 500 caracteres alcanzan para explicar un ajuste, y el historial de la 4.3.3 y la pantalla 5 muestran el motivo en una celda.
- **Consecuencia**: `VALIDATION_ERROR` con la lista de campos, como `createProduct` en la 4.2.

### D-6 — Evidencia de que no hay otra vía (FR-PROD-07)

- **Opciones**:
  - (a) **Una sola función de escritura y una guarda**:
    - `repository.ts` expone una única función que inserta el movimiento y actualiza `inventories` en la misma llamada;
    - una guarda versionada en `tests/guards/` recorre `src/` y falla si `inventories` o `inventory_movements` se escriben en otro archivo o fuera de esa función;
    - la guarda tiene casos que demuestran que falla, como las guardas de la 2.5.
  - (b) **Trigger diferido en la base** que exige un movimiento con `balance_after` igual al saldo nuevo en la misma transacción.
  - (c) **Solo tests de integración y revisión**.
- **Recomendación**: (a).
  - Hace fallar la CI ante la vía nueva más probable: un `update(inventories)` escrito en otro lado.
  - (b) protege también SQL crudo, pero cruza dos tablas con un trigger diferido difícil de probar y de mantener, para una vía que la aplicación no tiene.
  - (c) no demuestra ausencia.
- **Consecuencia**: **límite documentado**: SQL escrito a mano contra la base puede cambiar el saldo sin movimiento; el `CHECK` sigue impidiendo el negativo.

## Invariantes

- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.
- Sin `JOIN` entre módulos; `catalog` no importa `inventory`.
- `quantity_on_hand` solo cambia junto con un movimiento cuyo `balance_after` es el saldo nuevo, en la misma transacción y con su auditoría.
- Un rechazo no deja ningún efecto en ninguna tabla.
- El saldo nunca queda negativo; el `CHECK` no llega a dispararse desde el servicio.
- Ninguna cantidad se compara ni se suma con `number`.
- Sin migraciones ni dependencias nuevas.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: tests unitarios del cálculo del saldo resultante y de la validación, con los bordes del punto 5.
- **AC-3**: el primer ajuste crea la fila, el movimiento con `balance_after` y la auditoría de D-4; después de cada ajuste de una serie, `balance_after` del último movimiento es igual a `quantity_on_hand`.
- **AC-4**: saldo exacto en 0 aceptado; −0,001 rechazado con `negative_stock`, saldo actual y cantidad solicitada, sin movimiento, sin auditoría y sin cambio de saldo.
- **AC-5**: producto desactivado, máximo superado y saldo esperado distinto se rechazan según D-2 y D-3 sin efectos, incluida la fila de `inventories` de un producto que no la tenía.
- **AC-6**: `viewer` y contraseña pendiente → `FORBIDDEN`; otra organización → `NOT_FOUND`; id o entrada inválidos → `VALIDATION_ERROR`; si falla una escritura posterior, no persiste nada.
- **AC-7**: la guarda de D-6 pasa sobre el repositorio y sus casos demuestran que detecta una escritura fuera de la función autorizada.
- **AC-8**:
  - `npm run test` pasa completo;
  - `npm run test:e2e` pasa 25 de 25;
  - con la base detenida pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-9**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-10**: `git status` muestra solo archivos autorizados, y los documentos del punto 7 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests unitarios, de integración contra PostgreSQL 18.6 real y guarda versionada, en local y en CI.

**Nivel resultante esperado**: **validado localmente y en CI** para el ajuste de stock secuencial: atomicidad, rechazos sin efectos y auditoría.

**No se valida**:

- ajustes simultáneos ni la carrera con una desactivación (4.3.2);
- la pantalla 5 (4.4);
- SQL escrito a mano contra la base que cambie el saldo sin movimiento (límite de D-6).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si hace falta una migración, un cambio en `audit_logs` o una dependencia nueva.
- Si verificar el producto requiere `JOIN` entre módulos o que `catalog` importe `inventory`.
- Si algún test existente necesita cambios.
- Si un rechazo no se puede revertir sin dejar la fila de `inventories`.
- Si el `CHECK` de la base se dispara en algún test del servicio.
- Si aparece la necesidad de pantallas, Server Actions o tests de carrera.
- Antes de commit, push o cambios en Notion.

## Ajustes durante la implementación

1. **D-6, dos funciones autorizadas en lugar de una.** La fila de `inventories` se crea y se bloquea antes de conocer el saldo (paso 3), así que esa inserción no puede vivir en la misma función que escribe el saldo (paso 6). La guarda autoriza `lockBalance`, que solo inserta la fila en 0 con `ON CONFLICT DO NOTHING`, y `applyStockChange`, la única que cambia `quantity_on_hand` y siempre junto con su movimiento. El objetivo de D-6 se mantiene: ninguna otra vía cambia el saldo. La guarda además exige que el repositorio tenga exactamente esas tres escrituras, para que un cambio en los patrones no la deje vacía.
2. **Rechazos por excepción.** Todo rechazo dentro de la transacción se lanza como `AdjustmentRejected` y se convierte en resultado tipado fuera de ella, para que la transacción se revierta entera (hallazgo 4). Incluye `NOT_FOUND` e `inactive_product`, que ocurren antes de escribir: una sola forma para todos los rechazos.
3. **Límite del fallo provocado (AC-6).** Un actor inexistente rompe primero la clave foránea del movimiento, así que el test demuestra que no persisten ni la fila nueva ni el cambio de saldo cuando falla el movimiento. No hay un caso que haga fallar solo la auditoría después de actualizar el saldo sin agregar mecanismos de test fuera del alcance; la misma transacción de Drizzle cubre ambos fallos.
4. **Test de `CONFLICT` sin fila.** El segundo caso usa otro producto en lugar de borrar `inventories`, para no depender de un privilegio de `DELETE` en el test.
