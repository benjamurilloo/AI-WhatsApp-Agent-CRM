---
schema: task-brief.v1
task_id: 4.3.2
task_type: deterministic-testing
generated_at: 2026-09-15
---

# Brief: 4.3.2 — Concurrencia de ajustes

## Objetivo

1. Demostrar con conexiones simultáneas contra PostgreSQL real que los bloqueos de la 4.3.1 evitan actualizaciones perdidas y saldo negativo (criterio de salida de la Fase 4 en el Roadmap y caso obligatorio de TestingStrategy).
2. Demostrar que un ajuste y una desactivación del mismo producto no se cruzan (D-1 de la 4.3.1).
3. Demostrar que cada test **falla sin el bloqueo que pone a prueba**, para que no pase igual con una implementación rota.
4. Validar todo **localmente y en CI**, sin cambiar el código de producción.

## Ubicación en la Fase 4

- **Orden previsto**: 4.0 a 4.3.1 (cerradas) → **4.3.2** → 4.3.3 → 4.4.
- **Notion**: "Ajustes simultáneos sin actualizaciones perdidas ni saldo negativo, probado con un test de carrera." Estado: "Bandeja de Entrada".
- **Necesario ahora**: tests de carrera del ajuste y la evidencia de que fallan sin sus bloqueos.
- **En la 4.3.3**: el orden del historial de movimientos (hallazgo 4).
- **Gates de entrada**: 4.3.1 cerrada con CI en verde (`4e7956b`); contenedor de PostgreSQL en marcha. No se esperan migraciones ni cambios en `src/`.

## Hallazgos de la verificación previa (2026-09-15)

1. **Con el saldo esperado de D-2, dos ajustes con el mismo saldo esperado nunca se aplican los dos**: el segundo espera el `FOR UPDATE`, relee el saldo confirmado y recibe `CONFLICT`. Un test que solo mira "no quedó negativo" pasaría también **sin** el `FOR UPDATE`: los dos leerían 5, los dos pasarían la comparación y los dos escribirían 0. El saldo no quedaría negativo, pero habría dos movimientos de −5 y un saldo de 0: una actualización perdida. El test tiene que verificar el **libro**: saldo final igual al inicial más la suma de los movimientos, y un solo ajuste aceptado.
2. **Un `Promise.all` no garantiza la carrera.** Los dos ajustes podrían ejecutarse uno detrás del otro sin llegar a competir, y el test pasaría sin bloqueos. La 3.7 lo resolvió con una tercera conexión que retiene el bloqueo y un `setTimeout` de 300 ms para comprobar que nadie terminó. Acá hay un punto de encuentro natural: el ajuste toma primero el producto con `FOR SHARE`, así que una conexión que retiene el producto con `FOR UPDATE` detiene a los dos ajustes en el mismo paso y los suelta juntos. Sirve también para el producto sin fila de `inventories`, donde no hay fila que retener. Se resuelve en D-1.
3. **El `setTimeout` de la 3.7 prueba que nadie terminó, no que todos esperan en el bloqueo.** Bajo carga en CI, un ajuste lento podría no haber llegado todavía al bloqueo, y la carrera se perdería sin que el test lo note. `pg_stat_activity` informa las conexiones con `wait_event_type = 'Lock'`. Se resuelve en D-2.
4. **`inventory_movements.created_at` es `DEFAULT now()`**, que en PostgreSQL es la hora de **inicio** de la transacción, no la del `INSERT`. Bajo concurrencia, la transacción que empezó antes puede obtener el bloqueo después: su movimiento queda con `created_at` anterior y `balance_after` posterior. Un historial ordenado por `created_at` (FR-PROD-09) podría mostrar saldos fuera de secuencia. No afecta la integridad del saldo, que es lo que prueba esta subfase, pero sí la 4.3.3. Cambiarlo requiere una migración: se registra y se decide en el brief de la 4.3.3, sin tocarlo acá. Esta subfase no ordena movimientos por `created_at` en sus aserciones.
5. **Orden de bloqueos sin ciclos.** Un ajuste toma producto (`FOR SHARE`) → saldo (`FOR UPDATE`) → al insertar el movimiento, `FOR KEY SHARE` sobre el producto por la clave foránea, compatible con `FOR SHARE`. La edición y la desactivación solo toman el producto con `FOR UPDATE`. No hay orden inverso, así que no se espera `40P01`; si aparece, es una condición de detención.
6. **El pool de `getDb()` tiene 10 conexiones** (valor por defecto de `pg`): alcanza para la conexión que retiene, los ajustes y una desactivación en un mismo test.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. **`tests/integration/inventory-concurrency.test.ts`**, contra PostgreSQL real, con `adjustStock` y `deactivateProduct` reales y sin mocks:
   1. **Dos ajustes con el mismo saldo esperado sobre un producto con saldo 5** (−5 y −5): exactamente uno se acepta con saldo 0, el otro recibe `CONFLICT` con `currentQuantityOnHand` 0.000; un solo movimiento, una sola auditoría, y saldo final igual al inicial más la suma de los movimientos.
   2. **Dos primeros ajustes sobre un producto sin fila de `inventories`** (+3 y +4, saldo esperado 0): exactamente uno se acepta, el otro recibe `CONFLICT`; una sola fila de `inventories`, sin `23505` ni `40P01`, y el libro cuadra.
   3. **Ajustes que compiten con reintento** (D-3): varios ajustes simultáneos que, ante `CONFLICT`, reintentan con el saldo informado; al terminar, todos aplicados, saldo final igual al inicial más la suma, cada `balance_after` igual al resultado devuelto por su ajuste, y ningún saldo negativo en ningún movimiento.
   4. **Un ajuste que retiene el producto frena la desactivación**: con la fila de saldo retenida por otra conexión, el ajuste queda esperando con el `FOR SHARE` tomado; una desactivación simultánea queda esperando detrás de él; al soltar, el ajuste se acepta y después la desactivación se aplica. Las dos auditorías quedan en ese orden.
   5. **Una desactivación sin confirmar frena el ajuste**: otra conexión desactiva el producto sin confirmar; el ajuste queda esperando; al confirmar, el ajuste recibe `inactive_product` sin efectos, incluida la fila de `inventories` si no existía.
3. **Evidencia de fallo sin bloqueo** (D-4): durante la implementación, cada test se corre con su bloqueo quitado temporalmente de `src/`, se registra el fallo en el cierre y se restaura el código. `git diff` sobre `src/` queda vacío.
4. **Documentación**: TestingStrategy (caso obligatorio de concurrencia cubierto, método de espera), el brief con su cierre, y el hallazgo 4 registrado donde la 4.3.3 lo va a leer (DataModel, nota en `inventory_movements.created_at`).

## Alcance excluido

- Cambios en `src/`, migraciones y dependencias.
- El orden del historial y cualquier cambio de `created_at` (hallazgo 4): 4.3.3.
- Concurrencia de la edición del producto con el ajuste: toma el mismo `FOR UPDATE` que la desactivación, así que el caso 4 la cubre por construcción; no se agrega un test propio.
- Pruebas de carga o rendimiento.
- Pantalla 5: 4.4.

## Archivos o componentes autorizados

Lista cerrada:

- `tests/integration/inventory-concurrency.test.ts`.
- `src/modules/inventory/repository.ts` y `src/modules/catalog/repository.ts` **solo para quitar y restaurar el bloqueo durante la evidencia de D-4**, sin que el cambio llegue a un commit.
- `docs/development/TestingStrategy.md` y `docs/architecture/DataModel.md` (nota del hallazgo 4).
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [Roadmap.md](../planning/Roadmap.md), Fase 4: "los ajustes concurrentes no dejan saldo negativo" y gate de salida.
2. [TestingStrategy.md](../development/TestingStrategy.md): "Un ajuste de stock concurrente no deja saldo negativo" y "cada invariante crítico se prueba intentando violarlo".
3. [brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md), D-1 y D-2, y [Overview.md](../architecture/Overview.md), flujo del ajuste.
4. [ADR 0008](0008-stock-nunca-negativo.md) y FR-PROD-06 a 09.
5. `tests/integration/members.test.ts` (3.7): tercera conexión que retiene el bloqueo.

## Dependencias

- 4.3.1 cerrada.
- Contenedor de PostgreSQL en marcha.

## Resolución

El usuario aprobó el brief el 2026-09-15 con la recomendación de cada decisión: D-1 (a), D-2 (a), D-3 (a) y D-4 (a). La tarea pasó a "En proceso" en Notion.

## Decisiones

Cada decisión conserva las opciones evaluadas y la recomendación aprobada.

### D-1 — Cómo sincronizar la carrera

- **Opciones**:
  - (a) **Retener el producto con `FOR UPDATE` desde otra conexión**: todos los ajustes se detienen en su `FOR SHARE` y se sueltan juntos al confirmar esa conexión. Para los casos 4 y 5, retener la fila de saldo o una desactivación sin confirmar.
  - (b) **Retener la fila de `inventories`**: no sirve para el producto sin fila (caso 2).
  - (c) **`Promise.all` sin retener nada**.
- **Recomendación**: (a).
  - Un solo mecanismo cubre el producto con y sin fila, y reproduce el punto de entrada real del ajuste.
  - (c) no garantiza que los ajustes compitan (hallazgo 2).
- **Consecuencia**: retener el producto también mide que el `FOR SHARE` de D-1 de la 4.3.1 existe: sin él, los ajustes no esperarían.

### D-2 — Cómo comprobar que todos esperan en el bloqueo

- **Opciones**:
  - (a) **Consultar `pg_stat_activity`** hasta que la cantidad esperada de conexiones de la base de test tenga `wait_event_type = 'Lock'`, con un tope de tiempo que hace fallar el test; recién entonces soltar.
  - (b) **`setTimeout` de 300 ms y comprobar que ninguna promesa terminó**, como la 3.7.
- **Recomendación**: (a).
  - Prueba que las conexiones están detenidas en un bloqueo, no solo que tardan (hallazgo 3).
  - No depende de la velocidad de la máquina de CI: espera lo necesario y ni un milisegundo de más.
- **Consecuencia**: una función auxiliar del test cuenta las esperas de la base actual. La 3.7 no se modifica: sus tests siguen como están.

### D-3 — Carrera con reintento

- **Opciones**:
  - (a) **Incluir el caso 3**: 6 ajustes simultáneos, positivos y negativos, cada uno reintenta ante `CONFLICT` con el saldo informado (hasta un tope); se verifica el libro completo.
  - (b) **Solo los casos de dos ajustes** (1 y 2).
- **Recomendación**: (a).
  - Es el uso real que la 4.4 va a habilitar: la pantalla muestra el saldo nuevo y el usuario reintenta.
  - Con varias vueltas de espera y reintento, un bloqueo que falte deja rastro en el libro aunque los casos de dos ajustes no lo muestren.
- **Consecuencia**: el tope de reintentos (por ejemplo 10) hace que un error de lógica falle en lugar de colgar el test. Los negativos se eligen para que ninguno pueda dejar el saldo negativo en ningún orden, así el caso mide actualizaciones perdidas y no la regla de negativos, que ya prueba la 4.3.1.

### D-4 — Evidencia de que los tests fallan sin sus bloqueos

- **Opciones**:
  - (a) **Mutación manual registrada**: quitar temporalmente el `FOR UPDATE` de `lockBalance`, correr los casos 1 a 3 y registrar que fallan; restaurar; quitar el `FOR SHARE` de `lockProductShared`, correr los casos 4 y 5 y registrar que fallan; restaurar y verificar `git diff` vacío sobre `src/`.
  - (b) **Mutación versionada**: parametrizar el repositorio para desactivar bloqueos desde los tests.
  - (c) **Sin evidencia de fallo**.
- **Recomendación**: (a).
  - Cumple "cada invariante crítico se prueba intentando violarlo" sin meter en producción una opción para apagar bloqueos.
  - (b) agrega a `src/` una vía para saltearse la regla que la 4.3.1 acaba de cerrar.
  - (c) deja tests que podrían pasar con una implementación rota (hallazgos 1 y 2).
- **Consecuencia**: la evidencia vive en el cierre del brief, con el nombre de cada test y el resultado observado; no se repite en CI. Si en el futuro alguien quita un bloqueo, los tests fallan en CI igual que en la mutación.

## Invariantes

- Sin cambios en `src/` al terminar, sin migraciones y sin dependencias nuevas.
- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.
- Ningún test depende de un `setTimeout` para asumir que hay carrera.
- Ninguna aserción ordena movimientos por `created_at` (hallazgo 4).
- Los tests existentes no cambian.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: caso 1 — mismo saldo esperado: un aceptado, un `CONFLICT` con 0.000, un movimiento, una auditoría y el libro cuadra.
- **AC-3**: caso 2 — producto sin fila: un aceptado, un `CONFLICT`, una sola fila de `inventories`, sin `23505` ni `40P01`, y el libro cuadra.
- **AC-4**: caso 3 — carrera con reintento: todos aplicados, saldo final igual al inicial más la suma, cada `balance_after` igual al resultado de su ajuste y ningún `balance_after` negativo.
- **AC-5**: casos 4 y 5 — el ajuste frena la desactivación y la desactivación sin confirmar frena el ajuste, con los resultados y efectos descritos.
- **AC-6**: en cada caso, la espera se comprueba en `pg_stat_activity` antes de soltar (D-2).
- **AC-7**: evidencia de D-4 registrada en el cierre: con el `FOR UPDATE` quitado fallan los casos 1 a 3, con el `FOR SHARE` quitado fallan los casos 4 y 5, y `git diff src/` queda vacío al final. Si un caso no falla con su bloqueo quitado, se detiene y se informa.
- **AC-8**:
  - `npm run test` pasa completo, y el archivo nuevo pasa 5 veces seguidas sin fallos intermitentes;
  - `npm run test:e2e` pasa 25 de 25;
  - `typecheck`, `lint` y `format:check` pasan.
- **AC-9**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-10**: `git status` muestra solo archivos autorizados, y TestingStrategy y DataModel reflejan la cobertura y el hallazgo 4.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests de integración con conexiones simultáneas contra PostgreSQL 18.6 real, en local y en CI, más la evidencia de mutación registrada en el cierre.

**Nivel resultante esperado**: **validado localmente y en CI** para el ajuste de stock bajo concurrencia: sin actualizaciones perdidas, sin saldo negativo y sin cruce con la desactivación.

**No se valida**:

- concurrencia bajo carga real ni con muchas organizaciones (Fase 8);
- el orden del historial bajo concurrencia (4.3.3, hallazgo 4);
- la aplicación conectada con `crm_app` (Fases 8 y 9).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si algún test revela un defecto que requiere cambiar `src/`, una migración o una dependencia: se detiene y se informa antes de corregir.
- Si aparece `40P01` (deadlock) o `23505` en un ajuste.
- Si un caso no falla con su bloqueo quitado (D-4).
- Si el archivo nuevo falla de forma intermitente en alguna de las 5 corridas.
- Si algún test existente necesita cambios.
- Antes de commit, push o cambios en Notion.

## Ajustes durante la implementación

1. **El caso 2 no pone a prueba el `FOR UPDATE` (se activó la condición de detención de AC-7).** Con el `FOR UPDATE` de `lockBalance` quitado, los casos 1 y 3 fallaron, pero el caso 2 siguió pasando. Motivo: cuando dos primeros ajustes insertan la fila de `inventories` a la vez, el segundo `INSERT … ON CONFLICT DO NOTHING` espera a que el primero confirme por el índice único de `product_id`, y la lectura siguiente ya ve el saldo confirmado. Esa espera serializa la carrera por sí sola. El usuario eligió el 2026-09-15 la opción (a): mantener el caso 2 con su propósito real, **una sola fila, sin `23505` ni `40P01` y con el libro cuadrado**, y dejar la evidencia del `FOR UPDATE` en los casos 1 y 3. AC-7 queda corregido así: sin el `FOR UPDATE` fallan los casos 1 y 3; sin el `FOR SHARE`, los casos 4 y 5.
2. **Bloqueos retenidos liberados aunque el test falle.** En la mutación del `FOR SHARE`, el caso 4 falló con la conexión que retenía el bloqueo todavía abierta, y el `TRUNCATE` del test siguiente quedó esperando. Cada bloqueo retenido se registra y un `afterEach` lo suelta, para que un fallo no arrastre a los demás tests.
3. **Evidencia de D-4**, registrada el 2026-09-15:

   | Bloqueo quitado | Caso 1 | Caso 2 | Caso 3 | Caso 4 | Caso 5 |
   |---|---|---|---|---|---|
   | `FOR UPDATE` de `lockBalance` | falla: los dos ajustes aceptados | pasa (ajuste 1) | falla: saldo 103 en lugar de 111 | — | — |
   | `FOR SHARE` de `lockProductShared` | — | — | — | falla: la desactivación no espera ("se esperaban 2 conexiones en un bloqueo y hay 1") | falla: el ajuste no espera ("hay 0"), corrido solo |

   Sin el `FOR SHARE`, los casos 1 a 3 siguieron pasando: la verificación de la clave foránea al insertar en `inventories` toma `FOR KEY SHARE` sobre el producto, que también espera al `FOR UPDATE` retenido. Ambos bloqueos restaurados; `git diff -- src` vacío. Con el código restaurado, el archivo pasó 5 corridas seguidas.
