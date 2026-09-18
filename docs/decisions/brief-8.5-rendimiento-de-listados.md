---
schema: task-brief.v1
task_id: 8.5
task_type: runtime-validation
generated_at: 2026-09-18
---

# Brief: 8.5 — Rendimiento de los listados

## Objetivo

Medir con `EXPLAIN (ANALYZE, BUFFERS)` y con volumen sintético las consultas de listado que nunca se ejecutaron contra datos reales —productos, inventario, clientes y las dos listas que se componen en memoria—, registrar cada plan, y corregir **solo lo patológico**.

Cierra la última deuda de medición del proyecto: la [matriz de trazabilidad](../architecture/TraceabilityMatrix.md) dice desde la 1.2 que "ninguna consulta se ejecutó: los índices se asignan por la forma de la consulta descrita, no por un plan real". La 6.3 confirmó las de conversaciones. Faltan las de las Fases 4 y 5.

Es la última subfase de la Fase 8. Al cerrarla se cierra la fase.

## Ubicación en la Fase 8

- **Orden**: 8.1 a 8.4 cerradas. Esta es la última.
- **Notion**: tarea "8.5 — Rendimiento de productos e inventario", prioridad Media, creada en el cierre de la 8.1 (hallazgo 11). Su descripción ya dice "las consultas de listado de **las Fases 4 y 5**", o sea productos, inventario **y clientes**.
- **Necesario ahora**: la medición con su plan registrado, y la corrección de lo patológico.
- **Requisito antes de producción, fuera de esta subfase**: medir con **varias organizaciones** en un entorno equivalente a producción. La 6.3 ya dejó registrado que con una sola organización dueña del 99,9 % de las filas el planificador elige recorridos completos que no reflejan el caso real. Eso es Fase 9 y no se puede adelantar acá.
- **Mejora posterior**: objetivos de latencia por pantalla, presupuesto de consultas por carga, índices afinados con tráfico real.
- **Gate de entrada**: 8.4 cerrada, CI en verde en `9658bf1` ([ejecución 35392853821](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35392853821)).

## Hallazgos de la verificación previa (2026-09-18)

1. **El seed de volumen no tiene productos, inventario ni miembros.** `seeds/volume.ts` crea una organización, **un** usuario admin, 10.000 clientes, 10.000 conversaciones y unos 65.000 mensajes. No hay una sola fila de `products`, `inventories` ni `inventory_movements`, y hay un único `organization_members`. **Sin extender el seed no hay nada que medir**: esta subfase es primero una tarea de datos y después una de medición.
2. **`findProducts` no tiene `LIMIT` ni `ORDER BY`**: devuelve **todas** las filas que cumplen texto y actividad, y `inventory` filtra por estado de stock, ordena y pagina **en memoria**. Es el límite que [Overview](../architecture/Overview.md) aceptó a conciencia y mandó medir acá. Lo mismo vale para la lista de miembros y para la de clientes por última interacción. Son tres consultas cuyo costo no lo dice el plan solo: hay que medir también lo que pasa después del `EXPLAIN`.
3. **La lista de miembros es la más cara de sembrar, y por un motivo evitable.** El límite aceptado habla de 500 miembros, y cada usuario nuevo lleva una contraseña con argon2id (`m=19456`, `t=2`): hashear 500 contraseñas de verdad son decenas de segundos de seed, sin aportar nada a la medición. Se resuelve calculando **un** hash y reutilizándolo en todos los usuarios sintéticos, que es legítimo porque el seed no prueba autenticación. Conviene decidirlo antes y no descubrirlo mirando un seed que no termina (D-2).
4. **`inventory_movements` es de solo inserción**, con trigger `BEFORE UPDATE OR DELETE`. Un seed que lo toque tiene que ser idempotente por inserción y no por actualización, como ya hizo la 6.2 con `messages` ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)). Y hay una consistencia extra que `messages` no tenía: **el saldo de `inventories` tiene que coincidir con la suma de sus movimientos**, o el seed deja datos que ninguna operación real podría haber producido.
5. **Discrepancia de alcance entre documentos.** El [Roadmap](../planning/Roadmap.md) dice "el rendimiento de las consultas de productos e inventario"; la descripción de la tarea en Notion, [Risks](../planning/Risks.md) y la [matriz](../architecture/TraceabilityMatrix.md) dicen **productos, inventario y clientes**. Las tres últimas coinciden y son anteriores; la línea del Roadmap es la que quedó corta. Se resuelve en D-6, y es corregir una línea.
6. **Los índices que existen hoy**, para saber qué se está comprobando: `products_organization_name_lower_idx` y el único de SKU por organización; `clients_organization_display_name_lower_idx` y el único de teléfono; `inventory_movements_product_history_idx`. La pregunta de la medición no es si existen, sino **si el planificador los usa** con volumen.
7. **La medición anterior dejó un método listo para reusar** ([brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md) y [brief-7.3](brief-7.3-metrica-de-errores-de-ingestion.md)): `EXPLAIN (ANALYZE, BUFFERS)` desde un script en el scratchpad, con la sesión en solo lectura y los `@/` resueltos desde la raíz. También dejó dos trampas conocidas: un script de medición necesita el import absoluto de drizzle, y una sesión de solo lectura no puede crear vistas temporales.
8. **La 7.2 ya usó un umbral de 200 ms** para decidir que un plan era inaceptable, y ese número nunca se escribió como criterio del proyecto: vivía en ese brief. Conviene fijarlo explícitamente (D-1).

## Alcance incluido

1. **Extender el seed de volumen** con productos, saldos, movimientos de inventario y miembros, con los tamaños de D-2, determinista e idempotente como el actual.
2. **Medir con `EXPLAIN (ANALYZE, BUFFERS)`** las consultas de listado de catálogo, inventario, historial de movimientos y clientes, y registrar cada plan.
3. **Medir el costo total de las tres composiciones en memoria** —lista de stock, lista de miembros, clientes por última interacción—, no solo el plan de su consulta: el trabajo que importa ocurre después de la consulta.
4. **Comparar contra el umbral de D-1** y clasificar cada resultado.
5. **Corregir solo lo patológico** según D-5.
6. Actualizar [TraceabilityMatrix](../architecture/TraceabilityMatrix.md) con los planes confirmados, [Risks](../planning/Risks.md) cerrando o reformulando las entradas de medición, [Overview](../architecture/Overview.md) con el resultado de los límites aceptados, y el Roadmap en la línea del hallazgo 5.

## Alcance excluido

- **Varias organizaciones y staging**: Fase 9. Con una sola organización dueña de casi todas las filas, el planificador no se comporta como lo hará en producción, y eso ya está registrado desde la 6.3.
- **Cualquier objetivo de SLA o de latencia productiva.** El umbral de D-1 es un criterio de detección de patologías, no una promesa de servicio.
- **Optimizar lo que no sea patológico.** Una consulta que cumple el umbral no se toca aunque se le vea mejora posible.
- **Rediseñar la composición en memoria.** Si el resultado dice que hay que paginar en SQL cruzando módulos, eso contradice reglas de [Overview](../architecture/Overview.md) y es una subfase propia con su ADR, no un cambio acá.
- **Las métricas del dashboard** (7.1 a 7.3, ya medidas) y **las consultas de conversaciones** (6.3, ya medidas).
- **Tocar `src/`**, salvo lo que D-5 autorice explícitamente.

## Archivos o componentes autorizados

Lista cerrada.

- `seeds/volume.ts` — o el archivo nuevo que decida D-4.
- `docs/architecture/TraceabilityMatrix.md`
- `docs/architecture/Overview.md`
- `docs/planning/Risks.md`
- `docs/planning/Roadmap.md` — solo la línea del hallazgo 5.
- `docs/decisions/brief-8.5-rendimiento-de-listados.md` — este archivo, donde viven las mediciones.
- **Si D-4 lo decide**: `package.json`, solo para el script del seed.
- **Si D-5 autoriza una corrección**: la migración nueva y el `schema.ts` del módulo que corresponda, nombrados de a uno antes de tocarlos.

Los scripts de medición van al scratchpad de la sesión y **no se versionan**: son de una corrida, y su resultado vive en este brief.

## Fuentes de verdad

1. El esquema y las migraciones versionadas, y los planes reales que devuelva PostgreSQL.
2. [architecture/TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md) (qué índice se supone que usa cada consulta) y [architecture/DataModel.md](../architecture/DataModel.md).
3. [architecture/Overview.md](../architecture/Overview.md) §Reglas de dependencia: los tres límites aceptados de composición en memoria y la prohibición de `JOIN` entre módulos.
4. [product/NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md) §Rendimiento: "tiempo interactivo" con datasets de hasta ~10.000 filas por organización, declarado como referencia y no como SLA.
5. [CLAUDE.md](../../CLAUDE.md): la prohibición de ejecutar migraciones contra una base real sin autorización explícita.

## Dependencias

- 8.4 cerrada. Ninguna otra subfase depende de esta.
- Necesita PostgreSQL real con el seed de volumen extendido.

## Decisiones pendientes

### D-1 — Qué umbral separa "aceptable" de "patológico"

**El número se fija antes de medir.** Es la misma disciplina que la 8.4 aplicó a la severidad: si el criterio se escribe después de ver los resultados, se acomoda —sin mala intención— a lo que salió, y la medición deja de poder fallar.

La NFR dice "tiempo interactivo" sin número. La 7.2 usó 200 ms.

- **(a) 200 ms** por consulta, el mismo de la 7.2, medido con `EXPLAIN ANALYZE` sobre el volumen sembrado.
- **(b) 200 ms para la consulta y 400 ms para el camino completo** (consulta más composición en memoria), reconociendo que hay tres listados cuyo costo real no está en el plan.
- **(c) Un número más laxo** (500 ms / 1 s), argumentando que es una pantalla de backoffice sin tráfico.

**Recomendación: (b).** El hallazgo 2 muestra que medir solo el plan dejaría afuera exactamente el trabajo que [Overview](../architecture/Overview.md) mandó vigilar. Y conviene además registrar **siempre** el tipo de plan (recorrido completo o índice) aunque el tiempo cumpla: con 10.000 filas un recorrido completo puede tardar poco y degradarse mal, así que el tiempo solo no alcanza como veredicto. Un recorrido completo que cumple el umbral se registra como hallazgo informativo, no como patología.

Pendiente de resolución del usuario.

### D-2 — Cuánto volumen se siembra

La NFR habla de "hasta ~10.000 filas por organización"; los límites aceptados de `Overview` hablan de 2.000 productos y 500 miembros.

- **(a) Al límite declarado**: 2.000 productos, 500 miembros. Mide exactamente el punto que la documentación dice que hay que revisar.
- **(b) Al límite de la NFR**: 10.000 productos, como los clientes que ya existen, con 500 miembros.
- **(c) Los dos tamaños**, corriendo la medición dos veces.

**Recomendación: (b) para productos y (a) para miembros**, con movimientos suficientes para que el historial de un producto tenga páginas de verdad (unos 20 por producto en promedio, concentrando varios cientos en unos pocos productos, que es el caso que rompe una paginación). Razón: 10.000 productos mantiene la simetría con los clientes ya sembrados y cubre el límite de la NFR, que es el requisito escrito; 500 miembros es el número exacto que `Overview` fijó como condición de revisión, y subirlo inventaría un requisito que nadie pidió. La (c) duplica el trabajo para responder una pregunta que hoy no tenemos.

**Y el hash único para los usuarios sintéticos** (hallazgo 3): se calcula uno y se reutiliza, declarado en el seed.

Pendiente de confirmación.

### D-3 — Contra qué base se mide

La 6.3 midió contra la base de desarrollo en solo lectura. La 7.3 creó 200.011 filas sintéticas en la base de **test**, con autorización, y las borró después.

- **(a) Base de desarrollo**, sembrando el volumen nuevo ahí.
- **(b) Base de test**, sembrando y limpiando.
- **(c) Una base nueva dedicada.**

**Recomendación: (a)**, porque el seed de volumen **ya vive en la base de desarrollo** desde la 6.2 con sus 10.000 clientes, y los productos tienen que convivir con esos datos para que la medición signifique algo. Requiere autorización explícita para escribir en esa base, que el usuario da o no en el turno. La (b) obligaría a sembrar también clientes y conversaciones para reproducir el contexto, y la (c) agrega una base que después hay que mantener.

Pendiente de resolución del usuario: **escribir en la base de desarrollo necesita su autorización.**

### D-4 — Cómo se extiende el seed

- **(a) Dentro de `seeds/volume.ts`**, con la misma invocación `npm run db:seed:volume`.
- **(b) Un archivo nuevo** (`seeds/volume-catalog.ts`) con su propio script en `package.json`.

**Recomendación: (a).** Es el mismo dataset de la misma organización sintética, y separarlo obligaría a recordar correr dos comandos en orden para obtener un estado coherente. Mantiene la idempotencia por inserción del hallazgo 4, y el saldo de `inventories` se calcula desde los movimientos sembrados, no al revés, para que los datos sean los que una operación real habría dejado. Así no hace falta tocar `package.json`.

Pendiente de confirmación.

### D-5 — Qué se corrige si algo sale mal

- **(a) Nada**: se registra y se abre una tarea.
- **(b) Solo un índice faltante**, si el plan lo señala sin ambigüedad, con su migración.
- **(c) Índices y reescritura de consultas.**
- **(d) Todo lo que haga falta**, incluida la paginación en SQL.

**Recomendación: (b).** Un índice que falta es un defecto acotado, con una migración chica y un plan que lo demuestra antes y después. La (c) y sobre todo la (d) chocan con [Overview](../architecture/Overview.md): paginar en SQL las listas compuestas exigiría `JOIN` entre módulos, que está prohibido por una decisión aprobada y cuya revisión es una subfase con ADR propio. Y toda migración contra la base de desarrollo necesita autorización aparte, en el turno.

Pendiente de confirmación.

### D-6 — La discrepancia del Roadmap (hallazgo 5)

Tres documentos dicen "productos, inventario y clientes" y el Roadmap dice "productos e inventario".

**Recomendación**: incluir clientes y **corregir la línea del Roadmap**, que es la que quedó corta. Las consultas de clientes ya tienen 10.000 filas sembradas desde la 6.2, así que medirlas es casi gratis, y dejarlas afuera cerraría la Fase 8 con la deuda de medición todavía abierta en la matriz de trazabilidad — que es justo lo que esta subfase viene a saldar.

Pendiente de confirmación.

## Invariantes

1. **El umbral se fija antes de medir** (D-1).
2. **Cada medición registra el plan**, no solo el tiempo, y dice con qué volumen y contra qué base se hizo.
3. **Los tiempos se miden con la máquina en reposo.** La 8.2 dejó el precedente: una corrida bajo contención dio 2,6 horas donde en reposo daban 3,6 minutos. Un número medido con otra cosa corriendo al lado no es un número.
4. **El seed es determinista e idempotente**, y no actualiza ninguna fila de una tabla de solo inserción.
5. **El saldo de `inventories` coincide con la suma de sus movimientos.**
6. **No se toca `src/`** salvo por D-5, y ninguna migración se aplica a una base real sin autorización en el turno.
7. **Ningún resultado de esta subfase sube un nivel de validación por encima de "validado localmente"**: una medición con una organización en una máquina de desarrollo no dice nada sobre staging.

## Criterios de aceptación

- **AC-1** — El seed de volumen crea productos, saldos, movimientos y miembros con los tamaños de D-2; es determinista, idempotente y deja `inventories` consistente con sus movimientos. Correrlo dos veces no cambia nada ni falla.
- **AC-2** — Cada consulta de listado de catálogo, inventario, historial de movimientos y clientes tiene su `EXPLAIN (ANALYZE, BUFFERS)` registrado en este brief, con el volumen y la base declarados.
- **AC-3** — Las tres composiciones en memoria tienen medido el **camino completo**, no solo el plan de su consulta.
- **AC-4** — Cada medición tiene veredicto contra el umbral de D-1, y todo recorrido completo queda registrado aunque cumpla el tiempo.
- **AC-5** — Lo patológico, si lo hay, se corrigió según D-5 con el plan de antes y de después; lo no patológico no se tocó.
- **AC-6** — La cabecera de [TraceabilityMatrix](../architecture/TraceabilityMatrix.md) deja de decir que las consultas de las Fases 4 y 5 están sin confirmar, y las entradas de [Risks](../planning/Risks.md) sobre medición quedan cerradas o reformuladas con lo que sigue abierto para la Fase 9.
- **AC-7** — Los tres límites aceptados de composición en memoria de [Overview](../architecture/Overview.md) quedan con su medición al lado, y la línea del Roadmap corregida (D-6).
- **AC-8** — La suite completa sigue pasando y ningún test se modificó. Si el seed extendido rompe un test, eso es un hallazgo: significa que algo dependía de que esa organización no tuviera productos.

## Pruebas y evidencia requerida

| Afirmación | Nivel | Dónde |
|---|---|---|
| El seed es idempotente y deja datos consistentes | `deterministic` | dos corridas seguidas, con los conteos y la comprobación de saldos |
| Cada consulta usa el índice previsto, o no | medición | `EXPLAIN (ANALYZE, BUFFERS)` con fecha, volumen y base, en este brief |
| El camino completo de las tres listas compuestas cumple el umbral | medición | tiempo del servicio completo, no del plan |
| Una corrección de índice mejora el plan | medición | plan antes y después, en la misma corrida |

**Nivel del proyecto alcanzable**: *validado localmente*. Con una sola organización y una máquina de desarrollo no se puede afirmar más, y el documento no debe presentarlo como otra cosa.

## Condiciones de detención

1. **D-1, D-2 y D-3 sin resolver**: no se empieza. Sin umbral no hay veredicto, sin tamaño no hay seed y sin base no hay dónde medir.
2. **Escribir en la base de desarrollo sin autorización explícita en el turno**: parar. Aplica también a cualquier migración.
3. **Si la corrección que el resultado pide excede a un índice** (reescribir la consulta, paginar en SQL, cruzar módulos): parar y reportar. Es una subfase con ADR propio, no un arreglo acá.
4. **Si el seed extendido rompe un test existente**: parar y reportar antes de tocar el test. Un test que dependía de la ausencia de datos es un hallazgo.
5. **Si la máquina no está en reposo**: no se registran tiempos. Se registra el plan, que no depende de la contención, y los tiempos se repiten después.
6. **Antes de cualquier commit, push o cambio en Notion**, y antes de tocar `docs/decisions/README.md` o `CHANGELOG.md`.

---

## Resolución (2026-09-18)

El usuario aprobó las seis recomendaciones, incluida la **D-3 con autorización explícita para escribir en la base de desarrollo**.

| Decisión | Resolución |
|---|---|
| **D-1** | 200 ms por consulta y 400 ms para el camino completo. Todo recorrido secuencial se registra aunque cumpla el tiempo. |
| **D-2** | 10.000 productos, 500 miembros, un hash de contraseña compartido por los usuarios sintéticos. |
| **D-3** | Base de desarrollo, con el seed de volumen ya existente. |
| **D-4** | Dentro de `seeds/volume.ts`; `package.json` sin tocar. |
| **D-5** | Solo un índice faltante, si el plan lo señala sin ambigüedad. |
| **D-6** | Clientes incluidos; se corrige la línea del Roadmap. |

## Ejecución (2026-09-18)

### Seed extendido (AC-1)

`seeds/volume.ts` crea ahora, además de lo anterior, productos, saldos, movimientos y miembros. Resultado sobre la base de desarrollo:

```
10000 clientes, 10000 conversaciones, 65260 mensajes,
10000 productos, 8563 saldos, 37967 movimientos y 501 miembros en 8.2 s
```

**Idempotencia**: la segunda corrida devuelve exactamente los mismos siete conteos, en 6,0 s, sin error. Ninguna fila de `inventory_movements` se actualiza —el trigger lo rechazaría—: la idempotencia es por id.

**Consistencia**, comprobada con cuatro consultas después de sembrar:

| Comprobación | Filas que fallan |
| --- | --- |
| Saldo distinto de la suma de sus movimientos | 0 |
| Saldo distinto del último `balance_after` | 0 |
| Producto con movimientos y sin fila de saldo | 0 |
| Movimiento con `balance_after` negativo | 0 |

Los 1.437 productos sin fila en `inventories` son los que no tienen ningún movimiento, que es el caso "sin fila, saldo 0" del diseño ([brief-4.1](brief-4.1-migraciones-de-productos-e-inventario.md), D-7), no un hueco del seed.

### A. Planes reales (AC-2, AC-4)

`EXPLAIN (ANALYZE, BUFFERS)` sobre la base de desarrollo, organización de volumen, 2026-09-18. Umbral: 200 ms.

| Consulta | Acceso | Tiempo | Veredicto |
| --- | --- | --- | --- |
| Productos, listado base (activos, sin texto) | **Seq Scan** | 4,5 ms | cumple, con recorrido secuencial registrado |
| Productos, prefijo de nombre | Bitmap sobre `products_organization_name_lower_idx` | 1,7 ms | cumple, usa el índice previsto |
| Productos, SKU exacto | Index Scan sobre `products_organization_sku_lower_unique` | 0,05 ms | cumple, usa el índice previsto |
| Saldos por lista de ids | Nested Loop | 0,1 ms | cumple |
| Movimientos, primera página de un producto con 400 | Index Scan sobre `inventory_movements_product_history_idx` | 1,3 ms | cumple, usa el índice previsto |
| Movimientos, página profunda (offset 375) | el mismo índice | 0,5 ms | cumple |
| Movimientos, total de ese producto | Index **Only** Scan sobre el mismo índice | 0,1 ms | cumple |
| Clientes, total | **Seq Scan** | 2,0 ms | cumple, con recorrido secuencial registrado |
| Clientes, última página por nombre (offset 9425) | **Seq Scan** + orden | 24,7 ms | cumple, con recorrido secuencial registrado |
| Clientes, prefijo de nombre | Bitmap sobre `clients_organization_display_name_lower_idx` | 7,6 ms | cumple, usa el índice previsto |
| Clientes, teléfono exacto | Index Scan sobre `clients_organization_phone_unique` | 0,9 ms | cumple, usa el índice previsto |
| Miembros de la organización | **Seq Scan** (501 filas) | 0,1 ms | cumple |

**Ningún índice falta.** Los cinco índices que la matriz de trazabilidad daba por buenos "por la forma de la consulta" son los que el planificador efectivamente elige cuando hay un filtro selectivo.

**Los cuatro recorridos secuenciales se registran por la regla de D-1**, y ninguno es un defecto: son consultas sin filtro selectivo sobre una tabla de ~10.000 filas, donde recorrerla entera es lo que corresponde. El caso a vigilar es el de la última página de clientes, cuyo costo está en el orden y no en la lectura, y que crece con el total y no con el tamaño de la página. Con 10.000 filas son 24,7 ms; es la forma que se degrada peor si una organización creciera un orden de magnitud, y está anotada en [Risks](../planning/Risks.md) para medirla con datos de staging.

### B. Camino completo, no solo el plan (AC-3)

Mediana de 5 corridas con la máquina en reposo, invocando el servicio real. Umbral: 400 ms.

| Camino | Mediana | Veredicto |
| --- | --- | --- |
| `catalog.searchProducts` (sin texto) | 31,4 ms | cumple |
| **`inventory.listProductStock` (sin filtro)** | **133,1 ms** | cumple |
| `inventory.listProductStock` (filtro por estado de stock) | 94,5 ms | cumple |
| `inventory.listProductStock` (página profunda, 380) | 114,5 ms | cumple |
| `inventory.listStockMovements` (producto con 400 movimientos) | 8,2 ms | cumple |
| `crm.searchClients` (sin texto) | 7,9 ms | cumple |
| `conversations.searchClientsByLastInteraction` | 53,6 ms | cumple |
| `organizations.listMembers` | 8,7 ms | cumple |

**Esta es la medición que justificaba la D-1(b).** La consulta de productos tarda 4,5 ms y el camino completo de la lista de stock tarda 133 ms: **el 96 % del tiempo ocurre después del `EXPLAIN`**, en la composición en memoria —leer los 9.491 productos activos, pedir sus saldos, derivar el estado de stock, filtrar, ordenar con `Intl.Collator` y paginar—. Una medición que solo hubiera mirado el plan habría dado "4,5 ms, excelente" sobre el listado más caro del sistema.

### Los tres límites aceptados de `Overview`, medidos (AC-7)

| Límite aceptado | Condición de revisión | Medición | Resultado |
| --- | --- | --- | --- |
| Lista de stock: lee todos los productos que cumplen texto y actividad | "si una organización supera los 2.000 productos" | **10.000 productos**, 5× el límite: 133 ms | El límite se sostiene con holgura |
| Lista de miembros: compone en memoria | "si una organización supera los 500" | **500 miembros**, exactamente el límite: 8,7 ms | El límite se sostiene; era un no-problema |
| Clientes por última interacción: lee los ids de todos los que cumplen el filtro | "se revisa en la Fase 8" | 10.000 clientes: 53,6 ms | Coincide con la medición de la 6.3 (<100 ms) |

Los tres se midieron **en o por encima de su condición de revisión**, así que la revisión que pedían está hecha y ninguno exige rediseño hoy.

### Correcciones aplicadas (AC-5)

**Ninguna.** No apareció ningún índice faltante ni ninguna consulta por encima de su umbral, así que la D-5 no se activó. Nada de `src/` se tocó.

Es el resultado que más conviene declarar con precisión: no significa que el sistema escale, significa que **con una organización de 10.000 filas por tabla, en una máquina de desarrollo, ninguna consulta de listado es patológica**.

### Hallazgos de la ejecución

1. **El script de medición no puede vivir en el scratchpad de la sesión.** `npx tsx` desde ahí no resuelve `drizzle-orm` ni los alias `@/`, porque la carpeta está fuera del árbol del proyecto y `node_modules` se busca hacia arriba. Se resolvió poniéndolo en `dist/medicion/`, que `.gitignore` ya excluye: resuelve dependencias y alias como cualquier archivo del proyecto y no puede colarse en un commit. El directorio se borró al terminar.
2. **Un `offset` más grande que el total no mide lo que parece.** La primera corrida de la página profunda de clientes usó `offset 9975` sobre 9.456 clientes activos y devolvió 0 filas: medía el orden pero no la materialización de la página. Repetida con `offset 9425` dio 24,7 ms en vez de 37,2 ms. Una medición de paginación profunda tiene que usar un `offset` que devuelva filas, o está midiendo otra cosa.
3. **Sembrar 500 usuarios con contraseñas reales habría costado más que toda la medición.** El hash único (D-2) mantiene el seed completo en 8,2 s. Queda declarado en el código: el seed no prueba autenticación.
4. **La suite de integración ya ejercitaba el seed de volumen** (`tests/integration/conversations-seed.test.ts`), así que la extensión quedó cubierta por tests existentes sin escribir ninguno nuevo, y su idempotencia se verifica también contra la base de test. 390 de 390 siguen pasando sin modificar ningún test.

### Lo que esta subfase no certifica

- **Que el sistema escale.** Una organización, 10.000 filas por tabla, una máquina de desarrollo. La 6.3 ya dejó registrado que con una sola organización dueña de casi todas las filas el planificador no se comporta como lo hará con varias, y eso sigue siendo Fase 9.
- **Ningún objetivo de latencia productiva.** Los umbrales de D-1 son criterios de detección de patologías, no un SLA.
- **El comportamiento con volúmenes mayores.** Lo medido cubre el límite escrito en la NFR y las tres condiciones de revisión de `Overview`; nada dice sobre 100.000 productos.
- **Las pantallas.** Se midieron los servicios, no el render ni la carga de la página completa.
