---
schema: task-brief.v1
task_id: 4.3.3
task_type: implementation
generated_at: 2026-09-15
---

# Brief: 4.3.3 — Historial de movimientos

## Objetivo

1. Implementar la consulta del historial de movimientos de un producto (FR-PROD-09), paginada y con filtros por tipo y período, a nivel de servicio.
2. Garantizar que el orden del historial coincide con la secuencia real de saldos también bajo concurrencia (hallazgo 4 de la 4.3.2).
3. Validarlo **localmente y en CI**, dejando a la 4.4 un contrato listo para las pantallas 4 y 5.

## Ubicación en la Fase 4

- **Orden previsto**: 4.0 a 4.3.2 (cerradas) → **4.3.3** → 4.4.
- **Notion**: "FR-PROD-09: historial paginado, con filtros por tipo y período." Estado: "Bandeja de Entrada".
- **Necesario ahora**: el servicio del historial, su orden bajo concurrencia y la zona horaria de la organización para el período.
- **En la 4.4**: la pantalla 5, los "últimos movimientos" de la pantalla 4 (primera página de esta misma consulta), los períodos predefinidos del selector y el formato de fechas y cantidades.
- **Gates de entrada**: 4.3.2 cerrada con CI en verde (`b7af477`); contenedor de PostgreSQL en marcha. Se espera **una migración** (D-1).

## Hallazgos de la verificación previa (2026-09-15)

1. **El orden por `created_at` puede contradecir los saldos.** `created_at` es `DEFAULT now()`, la hora de **inicio** de la transacción. Una transacción que empezó antes pero obtuvo el `FOR UPDATE` del saldo después queda con `created_at` anterior y `balance_after` posterior. El índice `inventory_movements_product_history_idx` ordena por `created_at desc`, así que la pantalla 5 podría mostrar "saldo 6" debajo de "saldo 10" cuando la secuencia real fue la inversa.
2. **`clock_timestamp()` se evalúa en el `INSERT`**, que en `applyStockChange` ocurre después de tomar el `FOR UPDATE` del saldo, y ese bloqueo se retiene hasta confirmar. Para un mismo producto, el orden de inserción es el orden de los bloqueos, que es el orden de la cadena de saldos. Límites: un reloj del servidor que retrocede (ajuste de NTP) o dos inserciones en el mismo microsegundo, en cuyo caso el desempate por `id` no refleja la secuencia.
3. **El desorden no se reproduce de forma determinista a través del servicio.** Las conexiones que esperan el mismo bloqueo lo obtienen en orden de llegada, que suele coincidir con el orden de inicio de sus transacciones. La evidencia de D-1 se toma en la base: dentro de una transacción, esperar y después insertar; con `now()` el `created_at` es igual a `transaction_timestamp()`, con `clock_timestamp()` es posterior. El test discrimina por construcción.
4. **El historial crece sin tope.** A diferencia de miembros (3.7) y productos (4.2, D-1), paginar en memoria leería todos los movimientos del producto. El índice existente sirve para ordenar y limitar en SQL.
5. **La zona horaria no está disponible para `inventory`.** `organizations.timezone` existe, pero `AuthContext` no la trae, la interfaz de `organizations` no la expone y un `JOIN` entre módulos está prohibido.
6. **Convención de períodos**: [MetricsCatalog.md](../analytics/MetricsCatalog.md) define intervalos semiabiertos `[inicio, fin)` en días calendario de la zona de la organización, convertidos a UTC para consultar; la conversión con zona IANA resuelve los días de 23 o 25 horas. PostgreSQL la hace con `AT TIME ZONE`, sin dependencias nuevas.
7. **`getProduct` de `catalog` ya resuelve autorización y existencia**: autoriza a `admin` y `viewer`, da `VALIDATION_ERROR` con un id inválido, `NOT_FOUND` con uno de otra organización, y devuelve también productos inactivos. FR-PROD-09 pide el historial completo, así que un producto desactivado conserva su historial visible.
8. **El autor** es `created_by` → nombre por `getUserSummaries` de `auth`, con a lo sumo 25 ids por página.
9. **La pantalla 5 distingue "vacío" de "sin resultados"**: con filtros activos y ninguna fila, la 4.4 necesita saber si el producto tiene algún movimiento.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. **Migración `0007`** (D-1): `inventory_movements.created_at` pasa a `DEFAULT clock_timestamp()`. Generada con Drizzle Kit desde `schema.ts`, sin otros cambios. Aplicada a la base local de desarrollo y a la de test.
3. **`organizations`**: `getOrganizationTimezone(context)` en su interfaz pública (D-4).
4. **`inventory`**: `listStockMovements(context, productId, filters)` y `MOVEMENTS_PAGE_SIZE = 25`:
   - **Filtros** como texto de la URL, validados con `zod`: `type` (`all` o un valor del enum), `from` y `to` (fechas `YYYY-MM-DD` opcionales, ambas inclusivas) y `page`. Un filtro inválido da `VALIDATION_ERROR` con `fields`; `from` posterior a `to` es inválido.
   - **Orden**: `created_at desc, id desc`.
   - **Paginación en SQL** (D-2): conteo con los mismos filtros, y una página fuera de rango se lleva a la última, como en las listas existentes.
   - **Período** (D-3): `[from 00:00, to + 1 día 00:00)` en la zona de la organización, convertido en SQL.
   - **Resultado**: `movements` (`id`, `type`, `quantity`, `balanceAfter`, `reason`, `createdAt`, `author: { id, name }`), `total`, `page`, `pageCount`, `timezone` y `productHasMovements`.
   - **Errores**: los de `getProduct` (`FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`) más `VALIDATION_ERROR` por filtros.
5. **Tests**:
   - unitarios de la validación de filtros y de la página;
   - `tests/integration/inventory-history.test.ts`: orden, paginación, filtros, bordes del período, autor, autorización y aislamiento;
   - un caso nuevo en `catalog-inventory-schema.test.ts`: el `created_at` es posterior a `transaction_timestamp()` (hallazgo 3);
   - un caso nuevo en `inventory-concurrency.test.ts`: tras la carrera con reintento, el historial devuelto encadena los saldos.
6. **Documentación**: DataModel (`created_at` e índice), TestingStrategy, RepositoryStructure y Overview (lectura del historial), además de este brief con su cierre.

## Alcance excluido

- Pantallas 4 y 5, períodos predefinidos, formato de fechas y cantidades: 4.4.
- Historial de auditoría del producto (FR-AUD-02): 4.4.
- Cambios en `lockBalance`, `applyStockChange` o la guarda de escrituras del saldo.
- Nuevos tipos de movimiento, exportación del historial y paginación por cursor.
- Unificar `fields` del `VALIDATION_ERROR` por id inválido: 4.4, como está pendiente.
- Cambiar los `created_at` de filas existentes: no hay datos reales y la migración solo cambia el valor por defecto.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/inventory/schema.ts`, `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`.
- `drizzle/0007_*.sql` y los archivos de `drizzle/meta/` que genere Drizzle Kit.
- `src/modules/organizations/repository.ts`, `service.ts` e `index.ts`, solo para `getOrganizationTimezone`.
- `tests/integration/inventory-history.test.ts` (nuevo); `tests/integration/catalog-inventory-schema.test.ts` e `inventory-concurrency.test.ts`, solo para agregar los casos del alcance.
- `docs/architecture/DataModel.md`, `Overview.md` y `RepositoryStructure.md`; `docs/development/TestingStrategy.md`.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. FR-PROD-09 en [FunctionalRequirements.md](../product/FunctionalRequirements.md); [Screens.md](../product/Screens.md) §4 y §5 y el [wireframe 05](../product/wireframes/05-ajuste-de-inventario.md).
2. [DataModel.md](../architecture/DataModel.md): `inventory_movements`, su índice y la regla 3 de timestamps.
3. [MetricsCatalog.md](../analytics/MetricsCatalog.md): zona horaria e intervalo `I`.
4. [brief-4.3.2](brief-4.3.2-concurrencia-de-ajustes.md), hallazgo 4, y [brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md).
5. Convenciones de HANDOFF: composición sin `JOIN`, resultados con `Failure` y orden de autorización.

## Dependencias

- 4.3.2 cerrada.
- Contenedor de PostgreSQL en marcha.
- **Autorización para ejecutar la migración `0007` contra las bases locales de desarrollo y de test**, pedida junto con la aprobación de este brief.

## Resolución

El usuario aprobó el brief el 2026-09-15 con la recomendación de cada decisión: D-1 (a), D-2 (a), D-3 (a) y D-4 (a). También autorizó ejecutar la migración `0007` contra las bases locales de desarrollo y de test, y pasar la tarea a "En proceso" en Notion.

## Decisiones

Cada decisión conserva las opciones evaluadas y la recomendación.

### D-1 — Orden del historial bajo concurrencia

- **Opciones**:
  - (a) **`DEFAULT clock_timestamp()`** en `created_at` con una migración; orden `created_at desc, id desc`, con el índice existente.
  - (b) **Columna de secuencia** (`bigint generated always as identity`) con su índice; se ordena por ella y `created_at` solo se muestra.
  - (c) **Mantener `now()`**, ordenar por `created_at, id` y documentar que bajo concurrencia el historial puede mostrar saldos fuera de secuencia.
  - (d) **Escribir `clock_timestamp()` explícito** en `applyStockChange`, sin migración.
- **Recomendación**: (a).
  - Una sola columna ordena y se muestra, y queda exacta por el bloqueo del saldo (hallazgo 2).
  - (b) también resiste un reloj que retrocede, pero suma columna e índice por un riesgo que un servidor con NTP en modo gradual no presenta.
  - (c) deja incoherente la pantalla que el Roadmap usa como demostración de fin de la Fase 4.
  - (d) contradice el esquema: cualquier otro productor futuro heredaría el defecto.
- **Consecuencia**: el límite del hallazgo 2 queda como limitación aceptada en DataModel. La evidencia es el caso de base del hallazgo 3 más el historial encadenado tras la carrera.

### D-2 — Paginación

- **Opciones**:
  - (a) **En SQL con `limit` y `offset`**, más un conteo con los mismos filtros.
  - (b) **En memoria**, como miembros y productos.
  - (c) **Por cursor** sobre `(created_at, id)`.
- **Recomendación**: (a).
  - El wireframe muestra "1–25 de 31" y números de página, que un cursor no da.
  - (b) lee el historial completo en cada página (hallazgo 4).
- **Consecuencia**: dos consultas por página. El costo de `offset` en páginas muy lejanas se acepta en el MVP y se revisa en la Fase 8.

### D-3 — Forma del filtro de período

- **Opciones**:
  - (a) **Fechas `from` y `to` opcionales** (`YYYY-MM-DD`, inclusivas) interpretadas en la zona de la organización como `[from 00:00, to + 1 día 00:00)`; sin fechas, el historial completo.
  - (b) **Períodos predefinidos en el servicio** (7, 30 o 90 días, o todo).
  - (c) **Instantes UTC** calculados por quien llama.
- **Recomendación**: (a).
  - Sigue la convención de intervalos de MetricsCatalog y deja la conversión en un solo lugar.
  - Los predefinidos del wireframe ("Últimos 30 días") se traducen a fechas en la 4.4, sin atar el servicio a una lista.
  - (c) repartiría la conversión de zona entre las pantallas.
- **Consecuencia**: el test cubre un borde de medianoche local y un día con cambio de horario de una fecha histórica de `America/Argentina/Buenos_Aires`, como pide MetricsCatalog.

### D-4 — De dónde sale la zona horaria

- **Opciones**:
  - (a) **`getOrganizationTimezone(context)`** en la interfaz de `organizations`, y el resultado del historial devuelve `timezone`.
  - (b) **Agregar `timezone` a `AuthContext`**.
  - (c) **`JOIN` con `organizations`** en la consulta de `inventory`.
- **Recomendación**: (a).
  - Sigue el patrón de `getAppFrame`: lectura por la interfaz del módulo dueño.
  - (b) cambia un tipo que usa cada request y cada test para un dato que hoy solo necesita el historial.
  - (c) está prohibido por la frontera entre módulos.
- **Consecuencia**: la 4.4 formatea y muestra "Fechas en …" con el `timezone` devuelto, sin otra consulta.

## Invariantes

- Sin cambios en `lockBalance`, `applyStockChange` ni `tests/guards/stock-writes.test.ts`.
- La migración solo cambia el valor por defecto de `created_at`.
- Sin `JOIN` entre módulos, sin dependencias nuevas y sin cálculos de cantidades con `number`.
- Los tests existentes no cambian; solo se agregan casos.
- Sin referencias a Airtable ni al repositorio del agente de WhatsApp.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: la migración `0007` solo cambia el default a `clock_timestamp()`; el control de desfase pasa; el caso de base muestra `created_at` posterior a `transaction_timestamp()` tras una espera dentro de la transacción.
- **AC-3**: orden `created_at desc, id desc`; 25 por página con `total` y `pageCount` correctos; una página fuera de rango se lleva a la última, y una página no numérica o ≤ 0 a la primera.
- **AC-4**: el filtro por tipo devuelve solo ese tipo; un tipo desconocido da `VALIDATION_ERROR` con `fields: ["type"]`.
- **AC-5**: el período respeta la zona de la organización: un movimiento a las 23:59:59 locales entra en su día y no en el siguiente, y un día con cambio de horario histórico incluye exactamente sus movimientos; fechas inválidas o `from` posterior a `to` dan `VALIDATION_ERROR` con sus `fields`.
- **AC-6**: cada movimiento trae el nombre de su autor, también si el usuario está desactivado; el resultado trae `timezone` y `productHasMovements` distingue vacío de sin resultados.
- **AC-7**: `viewer` consulta; `must_change_password` da `FORBIDDEN`; otra organización da `NOT_FOUND`; id inválido da `VALIDATION_ERROR`; un producto inactivo muestra su historial.
- **AC-8**: tras la carrera con reintento, el historial devuelto encadena los saldos: cada `balance_after` es el del movimiento anterior más o menos su cantidad, y el primero de la lista es el saldo actual.
- **AC-9**:
  - `npm run test` pasa completo;
  - `npm run test:e2e` pasa 25 de 25;
  - `typecheck`, `lint` y `format:check` pasan.
- **AC-10**: CI en verde en el commit de la subfase, verificado con `gh run view`.
- **AC-11**: `git status` muestra solo archivos autorizados, y la documentación del alcance refleja el orden, la limitación de D-1 y la cobertura.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: tests unitarios y de integración contra PostgreSQL 18.6 real, en local y en CI.

**Nivel resultante esperado**: **validado localmente y en CI** para el historial de movimientos a nivel de servicio, con su orden bajo concurrencia.

**No se valida**:

- las pantallas 4 y 5 ni su formato (4.4, `producer-consumer`);
- el costo de `offset` con volumen real (Fase 8);
- un reloj del servidor que retrocede (limitación aceptada de D-1).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si Drizzle Kit genera en la `0007` algo más que el cambio del default.
- Si `getUserSummaries` no devuelve usuarios desactivados.
- Si el caso encadenado de AC-8 falla con `clock_timestamp()`.
- Si hace falta cambiar `lockBalance`, `applyStockChange`, la guarda de escrituras o un test existente.
- Si hace falta una dependencia nueva para la zona horaria.
- Antes de commit, push o cambios en Notion.

## Cierre

Cerrada con confirmación del usuario el 2026-09-15. AC-1 a AC-11 cumplidos, con el ajuste 1 sobre la invariante de los tests existentes: `npm run test` 327 de 327, `npm run test:e2e` 25 de 25, y CI en verde en el commit `cb81303` ([ejecución 35030637332](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35030637332)), incluido el control de migraciones al día. Nivel: **validado localmente y en CI** para el historial de movimientos a nivel de servicio. Detalle en `CHANGELOG.md`. Revisión: autoevaluación (`self_assessment: true`).

## Ajustes durante la implementación

1. **Un test existente comprobaba el default anterior (se activó la condición de detención).** El caso "aplica los defaults" de `catalog-inventory-schema.test.ts` verificaba `created_at = now()`, que deja de cumplirse con `clock_timestamp()`. El usuario eligió el 2026-09-15 la opción (a): cambiar esa única aserción a `created_at between now() and clock_timestamp()`, que sigue verificando el default real. El caso nuevo del hallazgo 3 prueba la diferencia con el inicio de la transacción. Con este ajuste, la invariante "los tests existentes no cambian" admite esa única modificación.
2. **Comentario de cabecera de `inventory-concurrency.test.ts`**: decía que ninguna aserción ordena por `created_at`; ahora aclara que los casos 1 a 5 no lo hacen y que el caso 6 comprueba ese orden.
