---
schema: task-brief.v1
task_id: "15.3"
task_type: implementation
generated_at: 2026-10-06
---

# Brief: 15.3 — Dashboard más atractivo e interactivo

**Estado: aprobado el 2026-10-06 por el usuario, con las recomendaciones de D-1 a D-9, salvo los rangos de D-5, que el usuario cambió por los del boceto** (§Boceto). La aprobación no autoriza ningún commit, ningún cambio en Notion, ninguna dependencia nueva ni el despliegue a producción: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` (tests unitarios y de integración contra PostgreSQL real, con fixtures calculados a mano), `producer-consumer` (Playwright sobre `next start` contra PostgreSQL real, con axe en claro y en oscuro) e `isolated-runtime` (la versión desplegada en producción, mirada por el usuario).
- **Nivel de validación alcanzable**: **validado en integración** y **verificado en producción**. No certifica «preparado para producción».
- **Orden**: cuarta y última subfase de la Fase 15 planificada, después de la 15.1, la 15.4 y la 15.2 ([Roadmap](../planning/Roadmap.md), §Fase 15). Corre en paralelo con la 13.5.2-b: si la 13.5.2-b arranca, se pausa en el último punto con la CI en verde.

## Objetivo

Que el dashboard muestre, para cada tarjeta, **cuánto cambió contra el período anterior**; que tenga **«Ver detalles»**; que el gráfico diario sea **interactivo** (pasar el mouse o el foco por un día muestra sus valores); y que sume las dos visualizaciones del boceto: la **distribución por tipo de mensaje** y la **distribución del tiempo a primera respuesta**. Las fórmulas de las doce métricas existentes no cambian. Las dos visualizaciones nuevas son métricas nuevas de solo lectura, y entran al [MetricsCatalog](../analytics/MetricsCatalog.md) con su definición antes de dibujarse.

## Situación

El dashboard ([page.tsx](../../src/app/(autenticado)/page.tsx)) tiene once tarjetas (métricas 1 a 9, 11 y 12), cada una con su propia consulta, su estado de carga y de error, y un desplegable «Definición». Debajo está la métrica 10, la evolución diaria: barras en un SVG generado en el servidor, con un selector de serie (conversaciones o mensajes) que viaja en la URL y una tabla de datos como alternativa accesible. Todo se calcula en vivo sobre `conversations`, `messages` e `ingestion_events` ([ADR 0005](0005-metricas-desde-datos-transaccionales.md)). La 15.1 le dio la identidad visual y dejó para esta subfase lo que exige cálculos nuevos ([brief-15.1](brief-15.1-identidad-visual-y-marco.md), D-1).

## Hallazgos antes de diseñar

- **H-1. La CSP prohíbe los atributos `style`** ([proxy.ts](../../src/proxy.ts): `style-src-attr 'none'`). Las librerías de gráficos para React que se dibujan en el servidor, como Recharts, emiten atributos `style` en el HTML; el navegador los descartaría y el gráfico se vería roto. Una librería sobre `<canvas>` evita eso, pero suma JavaScript, deja de funcionar sin él y cambia `package.json`. Los gráficos de hoy son SVG propios, sin librería, con clases de Tailwind sobre los tokens. Se resuelve en D-1.
- **H-2. El boceto del dashboard no estaba guardado.** Las imágenes de `Vixora/Historial` son capturas del CRM antes y después de la 15.1, no el boceto, y en `Mejoras CRM` están solo los bocetos de la 15.4. El usuario lo volvió a compartir el 2026-10-06, al aprobar este brief: lo que dibuja y cómo se resolvió cada diferencia está en §Boceto.
- **H-3. «Ver detalles» no puede llevar al listado de Conversaciones tal como está.** El período de ese listado filtra por el **último mensaje** e incluye hoy ([conversaciones/filters.ts](../../src/app/(autenticado)/conversaciones/filters.ts), [conversations/repository.ts](../../src/modules/conversations/repository.ts)). La métrica 1 cuenta por **inicio**, la 2 por **cualquier mensaje** del período, y el dashboard excluye hoy. Un enlace directo mostraría otra cantidad que la tarjeta: el operador vería «12» en la tarjeta y 15 filas en la lista. Se resuelve en D-3.
- **H-4. La variación tiene casos que engañan.**
  - Con el período anterior en 0, el porcentaje es infinito.
  - Un período personalizado puede incluir hoy, que es un día parcial (MetricsCatalog, §Convenciones). Compararlo con un período anterior completo muestra una caída que no existe.
  - En la métrica 9, la respuesta puede caer después del fin del período, así que el valor de los días recientes cambia mientras llegan respuestas.
  - «Más» no siempre es mejor: más errores de ingestión es peor, más conversaciones no es bueno ni malo.

  Se resuelve en D-2.
- **H-5. `messages.kind` es nulo en los mensajes de v1 y de los seeds** (DataModel, `messages.kind`: «`null` es "sin dato"»). En el piloto local casi todo es nulo; en producción, los mensajes de la demostración llegan por v2, con su tipo. Una dona que esconda los nulos mentiría sobre el total. Se resuelve en D-4.
- **H-6. La variación duplica las consultas del dashboard**: cada tarjeta lee su métrica dos veces, una por período. La 13.2 midió el dashboard en producción con volumen sintético, y la 15.2 dejó el método para medir en local ([scripts/medir-caminos.ts](../../scripts/medir-caminos.ts)). Se resuelve en D-7.
- **H-7. El dashboard tiene end-to-end que cuentan tarjetas y localizan por nombre** ([dashboard.spec.ts](../../tests/e2e/dashboard.spec.ts) y [dashboard-sin-ingestion.spec.ts](../../tests/e2e/dashboard-sin-ingestion.spec.ts)). Si los nombres accesibles de las tarjetas y de la sección diaria se conservan, esos pasos no cambian. Las aserciones que cambien a propósito se listan.

## Decisiones pendientes

### D-1 — Librería de gráficos o SVG propio

- (a) **SVG propio, como hoy**, más un componente cliente chico para la interacción. Sin dependencia nueva, compatible con la CSP, y sin JavaScript el gráfico se sigue viendo, solo que sin interacción.
- (b) una librería sobre `<canvas>` (por ejemplo, Chart.js). Suma una dependencia que hay que autorizar y auditar, el gráfico no existe sin JavaScript, y la alternativa accesible sigue siendo la tabla.
- (c) una librería SVG para React: choca con la CSP (H-1).

*Recomendación: (a).* La dona y el histograma son geometría simple (arcos y barras), y el proyecto ya prueba su geometría como funciones puras ([chart-geometry.ts](../../src/app/(autenticado)/_dashboard/chart-geometry.ts)). Si alguna visualización resulta inviable sin librería, se detiene y se pide autorización.

### D-2 — La variación contra el período anterior

- **Período anterior**: el de la misma cantidad de días que termina el día antes de que empiece el elegido. Para «Últimos 30 días completos» (del 6/9 al 5/10), el anterior va del 7/8 al 5/9. Lo calcula el módulo `analytics`, no la página, con la misma zona horaria. Entra al catálogo como convención común.
- **Qué muestra cada tarjeta**:

  | Métricas | Variación |
  |---|---|
  | 1, 2, 3, 4, 5 y 7 (cantidades) | porcentaje: «+25 % vs. período anterior» |
  | 8 y 12 (tasas) | puntos porcentuales: «+3,5 p. p.» |
  | 6 (promedio) y 9 (mediana) | diferencia absoluta: «+0,4 min» |
  | 11 (por estado) | sin variación: es el estado actual de cada conversación y no existe el estado del período anterior (MetricsCatalog, «Estado de una conversación») |

- **Casos**:
  - con el anterior en 0, o en «sin datos», se muestra «sin datos del período anterior», nunca «+∞ %» ni «+100 %»;
  - si el período elegido incluye hoy, no se muestra variación y se explica: «hoy está incompleto»;
  - en la métrica 9, la nota existente sobre los días recientes alcanza también a la variación;
  - la métrica 12 «no disponible» no muestra variación.
- **Presentación**: una flecha y el texto, **sin verde ni rojo**. El color diría «bueno» o «malo», y eso depende de la métrica y del negocio (H-4). El valor exacto del período anterior se ve en «Ver detalles» (D-3).

*Recomendación: la tabla y los casos tal como están.*

### D-3 — «Ver detalles»

- (a) **«Ver detalles» reemplaza al desplegable «Definición»** de cada tarjeta y suma, además de la definición, el valor del período anterior con sus fechas, de dónde sale la variación. No lleva a otra pantalla.
- (b) un enlace al listado filtrado: hoy mostraría otra cantidad (H-3). Exigiría filtros nuevos en el listado de Conversaciones (por inicio, sin hoy), que tocan su consulta y su pantalla: alcance de la Fase 16.
- (c) una pantalla de detalle por métrica: es más de lo que el boceto pide, y la mitad de las métricas no tiene serie diaria.

*Recomendación: (a).* Cumple lo que el boceto dibuja sin mostrar números que no cierran. El enlace al listado queda como candidato de la Fase 16, junto con el filtro que lo haga coincidir.

### D-4 — Métrica 13: distribución por tipo de mensaje (la dona)

- **Fórmula propuesta**: `COUNT` de los mensajes **entrantes** con `sent_at ∈ I`, agrupados por `kind`. Los nulos forman su propio grupo, «Sin dato», que siempre se muestra si tiene mensajes.
- **Validación**: la suma de los grupos es igual a la métrica 4.
- **Grupos**: los seis tipos del enum en el orden del dominio, con `0` explícito, más «Sin dato», como los estados de la métrica 11.
- **Por qué solo entrantes**: la pregunta del negocio es qué mandan los clientes (audios, imágenes, documentos). Los salientes son casi todos texto del agente.
- **Presentación**: una dona SVG con la lista de grupos, sus cantidades y porcentajes al costado, que es la alternativa accesible. Sin variación (es una distribución).

*Recomendación: la fórmula tal como está.* La alternativa es contar entrantes y salientes, con la suma igual a 4 + 5.

### D-5 — Métrica 14: distribución del tiempo a primera respuesta (el histograma)

- **Población y `delta`**: los mismos de la métrica 9, así la suma del histograma es igual al número de conversaciones con respuesta de la 9.
- **Rangos**, semiabiertos `[desde, hasta)`: menos de 1 min; 1 a 5 min; 5 a 30 min; 30 a 60 min; 1 h o más. *Decidido por el usuario el 2026-10-06*, los del boceto, en lugar de los seis que se proponían (menos de 1 min; 1 a 5; 5 a 15; 15 a 60 min; 1 a 24 h; 24 h o más). Las conversaciones sin primera respuesta se muestran aparte, como en la métrica 9, y no son una barra.
- **Validación**: la suma de los rangos es igual a «con respuesta» de la métrica 9, y un valor en el borde (exactamente 5 min) cae en el rango que empieza ahí.
- **Presentación**: barras SVG con su tabla de datos. Sin variación.

*Recomendación original: seis rangos*, para separar una respuesta en el día de una que llega al día siguiente. El usuario eligió los cinco del boceto: todo lo que tarda una hora o más queda junto.

### D-6 — Interacción y ubicación

- **Gráfico diario**: pasar el mouse por una barra, o recorrerlas con el teclado (las flechas, con el gráfico enfocado), muestra una línea de lectura arriba del gráfico: «Sáb 12/09: 3 conversaciones iniciadas». La línea es una región `aria-live` cortés, y la tabla de datos sigue siendo la alternativa completa. Sin coordenadas calculadas en el navegador: no hace falta posicionar un globo, y no se choca con la CSP (H-1).
- **Dona e histograma**: la misma línea de lectura al pasar por un segmento o una barra.
- **Ubicación**: debajo de la evolución diaria, una fila con la dona y el histograma, una tarjeta cada uno. En pantallas angostas, una debajo de la otra.

*Recomendación: tal como está*, a ajustar si aparece el boceto (H-2).

### D-7 — Medición

- (a) medir **en local**, con los instrumentos de la 13.2 y la base de volumen (`seeds/volume.ts medicion`), el dashboard completo con la variación (las once tarjetas en los dos períodos) y las dos métricas nuevas. Se registra la mediana y la forma del plan contra el umbral local, y se informa todo recorrido secuencial nuevo, aunque esté debajo del umbral.
- (b) medir también en producción: no tiene volumen.

*Recomendación: (a)*, como en la 15.2. Si una consulta nueva supera el umbral o necesita un índice, se detiene: un índice es una migración y se decide aparte.

### D-8 — Etapas y despliegue

1. **15.3.1 — Catálogo y servicio**: MetricsCatalog con la convención del período anterior y las métricas 13 y 14; en `analytics`, el período anterior y las dos consultas nuevas, con tests contra fixtures calculados a mano (con un mensaje cerca de medianoche y un borde exacto en cada rango); TraceabilityMatrix con sus índices. Sin pantalla.
2. **15.3.2 — Variación y «Ver detalles»** en las tarjetas.
3. **15.3.3 — Gráficos**: la interacción del diario, la dona y el histograma.
4. **15.3.4 — Despliegue** a producción, con la CI en verde y la autorización del usuario en su turno.

Cada etapa con su batería, su commit autorizado y su CI. Capturas en claro y en oscuro, a 1280 y a 375 px, antes de desplegar.

*Recomendación: tal como está.*

### D-9 — Revisión

- (a) **revisión independiente** de solo lectura antes de desplegar, como en la 15.2.
- (b) autoevaluación declarada: la subfase no abre ni cierra un gate.

*Recomendación: (a).* Esta subfase agrega dos métricas al catálogo, que es un contrato de datos (segundo en la jerarquía de fuentes), y la revisión de la 15.2 encontró un defecto real que la autoevaluación no había visto.

## Boceto (2026-10-06)

El usuario compartió el boceto del dashboard, en oscuro y en claro, al aprobar el brief.

**Coincide con lo aprobado:**
- «Ver detalles →» en cada tarjeta (D-3);
- la dona «Tipos de mensajes» y el histograma «Tiempo de primera respuesta», lado a lado debajo de la evolución diaria (D-6);
- la dona con el total de mensajes en el centro y la lista de tipos con su porcentaje al costado (D-4).

**Difiere, y cómo se resolvió:**
- **Rangos del histograma**: el boceto usa cinco; el usuario los eligió en lugar de los seis propuestos (D-5).
- **Alcance de la variación**: el boceto la dibuja solo en las métricas 1, 2, 4, 5 y 7, en verde con una flecha. El usuario confirmó D-2: también en 3, 6, 8, 9 y 12, y sin verde ni rojo.
- **Tipos de la dona**: el boceto dibuja «Ubicación», que no es un tipo de `messages.kind`. La dona muestra los seis tipos del enum (texto, audio, imagen, video, documento y otro) más «Sin dato» (D-4, H-5); una ubicación cae en «otro».
- **Fuera de esta subfase**, como decidió la 15.1 (D-1): el buscador global, la campana de notificaciones, «Sistema», la tarjeta de versión y colapsar el panel.

## Alcance incluido

- La convención del período anterior y las métricas 13 y 14 en el MetricsCatalog, con su definición, validación y casos límite.
- En `src/modules/analytics/`: el período anterior y las consultas de las métricas 13 y 14, sin tocar las fórmulas de las métricas 1 a 12.
- La variación y «Ver detalles» en las tarjetas.
- La interacción del gráfico diario, la dona y el histograma, en SVG propio.
- Las notas en Screens.md y TraceabilityMatrix.md.

## Alcance excluido

- Cambiar la fórmula de cualquier métrica existente.
- Tablas, columnas, índices o migraciones. Si la medición pide un índice, se detiene.
- Dependencias nuevas, salvo que D-1 se resuelva por (b).
- Filtros nuevos en los listados para que «Ver detalles» lleve a ellos (Fase 16).
- Colores de «bueno» y «malo» en la variación.
- Snapshots o caché de métricas (ADR 0005).
- Exportar el dashboard, compararlo entre organizaciones o configurarlo por usuario.

## Archivos o componentes autorizados

- `docs/analytics/MetricsCatalog.md`, `docs/architecture/TraceabilityMatrix.md` y `docs/product/Screens.md`.
- `src/modules/analytics/` (service, repository, index y sus tests).
- `src/app/(autenticado)/page.tsx` y `src/app/(autenticado)/_dashboard/` (archivos existentes y nuevos, con sus tests).
- `tests/integration/analytics*.test.ts` y `tests/integration/analytics-helpers.ts`.
- `tests/e2e/dashboard.spec.ts` y `tests/e2e/dashboard-sin-ingestion.spec.ts`.
- `scripts/medir-caminos.ts`.
- Este brief, `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md` al cerrar.

## Fuentes de verdad

1. El código y las migraciones: `messages`, `conversations` e `ingestion_events`, y el módulo `analytics`.
2. [MetricsCatalog](../analytics/MetricsCatalog.md) y [DataModel](../architecture/DataModel.md).
3. [ADR 0005](0005-metricas-desde-datos-transaccionales.md), [brief-15.1](brief-15.1-identidad-visual-y-marco.md) (D-1) y el [Roadmap](../planning/Roadmap.md), §Fase 15.
4. Notion, para el estado de la subfase.

## Invariantes

- Las métricas 1 a 12 devuelven lo mismo que antes para el mismo período: sus tests existentes pasan sin cambios.
- Toda consulta filtra por `organization_id`.
- Ningún valor es editable desde el dashboard (FR-MET-03).
- «Sin datos», «no disponible» y `0` siguen siendo estados distintos, también en la variación.
- Todo gráfico tiene una alternativa accesible con los valores exactos, visible sin JavaScript.
- Ningún atributo `style` ni clase de la paleta por defecto de Tailwind en `src/app/`.
- `package.json`, `package-lock.json` y `drizzle/` sin cambios, salvo que D-1 se resuelva por (b).

## Criterios de aceptación

- **AC-1**: D-1 a D-9 tienen resolución del usuario con fecha.
- **AC-2**: el MetricsCatalog define el período anterior y las métricas 13 y 14 antes de que exista código que las dibuje (la etapa 15.3.1 se commitea antes de la 15.3.3).
- **AC-3**: tests de integración contra fixtures calculados a mano prueban el período anterior (incluido un período que cruza un cambio de horario histórico), la métrica 13 (con nulos y con un mensaje cerca de medianoche) y la métrica 14 (con un `delta` exactamente en cada borde de rango), y los invariantes de validación de las dos.
- **AC-4**: tests unitarios prueban el formato y los casos de la variación: anterior en 0, «sin datos», período que incluye hoy, puntos porcentuales y diferencias absolutas.
- **AC-5**: los end-to-end existentes pasan, con sus pasos sin cambios salvo los listados en el informe.
- **AC-6**: end-to-end nuevos prueban la variación y «Ver detalles» de al menos una tarjeta de cada tipo, la lectura del gráfico diario con el mouse y con el teclado, la dona y el histograma con sus valores, y que sin JavaScript los valores siguen visibles.
- **AC-7**: axe no informa violaciones WCAG 2.x A ni AA, en claro ni en oscuro, en el dashboard con los detalles abiertos y con una lectura activa.
- **AC-8**: `grep` no encuentra clases de la paleta por defecto de Tailwind ni atributos `style` en `src/app/`.
- **AC-9**: la medición de D-7 está registrada, debajo del umbral local; o el desvío está informado y decidido por el usuario.
- **AC-10**: `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit`, `test:integration` y `build` pasan, y el `git diff` de `package.json`, `package-lock.json` y `drizzle/` está vacío (salvo D-1 b).
- **AC-11**: capturas del dashboard en claro y en oscuro, a 1280 y a 375 px, con «Ver detalles» abierto y una lectura activa, entregadas al usuario **antes** de desplegar.
- **AC-12**: la revisión de D-9 hecha, con sus hallazgos verificados y resueltos o aceptados por el usuario.
- **AC-13**: la CI en verde en el commit de cada etapa, leída por `headSha` y `conclusion`.
- **AC-14** (15.3.4): producción corre el SHA de AC-13; `/login` responde 200; la ingestión y la lectura siguen respondiendo solo a `agente-demo` (401 sin token); y el usuario mira el dashboard en producción.
- **AC-15**: `git status` muestra solo archivos autorizados.

## Pruebas y evidencia requerida

- Unitarios: la geometría de la dona y del histograma, el período anterior como función pura si se puede, y el formato de la variación.
- Integración: las métricas 13 y 14 y el período anterior contra PostgreSQL real, con fixtures calculados a mano y escritos en el test.
- End-to-end: los casos de AC-6, con axe.
- Medición: la tabla de D-7 en este brief.
- Capturas: AC-11, en el scratchpad de la sesión, entregadas al usuario.

## Condiciones de detención

- Si una métrica existente tiene que cambiar su fórmula para mostrar la variación: se detiene.
- Si una consulta nueva supera el umbral local o necesita un índice: se detiene.
- Si una visualización no se puede hacer sin librería: se detiene y se pide autorización.
- Si la interacción exige atributos `style` o relajar la CSP: se detiene.
- Si un end-to-end existente tiene que cambiar algo más que lo listado: se detiene y se informa.
- Si la 13.5.2-b arranca: se pausa en el último punto con la CI en verde.

## Resultados — 15.3.1

**Qué se hizo.**
- **MetricsCatalog**: la convención del período anterior (§Convenciones) y las métricas 13 y 14, con su fórmula, grupos o rangos, validación, denominador cero y casos límite. TraceabilityMatrix suma sus filas de índices.
- **`analytics`**:
  - `previousPeriodInput`, función pura: la misma cantidad de días, terminando el día antes del inicio. El período anterior se pide por la misma entrada validada que cualquier período, así que no hace falta otro camino en el servicio.
  - `getInboundMessageKinds` (métrica 13): los seis tipos del enum con 0 explícito, más los nulos al final. Sin entrantes, «sin datos».
  - `getFirstResponseDistribution` (métrica 14): los cinco rangos del boceto, con las conversaciones sin respuesta aparte. Sin ninguna respuesta, rangos «sin datos».
- **La consulta de la métrica 9 no cambió.** Su CTE pasó a una función, `firstResponseDeltas`, que comparten la 9 y la 14: la misma población y el mismo delta por construcción. La consulta que llega a la base para la 9 es la misma, salvo espacios en blanco. Se midió con el código de `HEAD` y con el nuevo, sobre la misma base: 16 a 19 ms en los dos.
- `scripts/medir-caminos.ts` suma las dos métricas nuevas.

**Desvío.** `tests/integration/analytics-helpers.ts` acepta un `kind` opcional por mensaje, para los fixtures de la métrica 13. Está en la lista de archivos autorizados; los fixtures existentes no lo usan y no cambian.

**Medición (D-7).** En una base local aparte, sembrada con `seeds/volume.ts medicion` y borrada después. Mediana del camino completo, umbral local 400 ms:

| Camino | Organización grande | Organización chica |
|---|---|---|
| Métrica 9, de referencia | 16,6 ms | 5,6 ms |
| Métrica 13, entrantes por tipo | 5,6 ms | 3,3 ms |
| Métrica 14, primera respuesta por rangos | 11,9 ms | 3,9 ms |

- **La primera versión de la métrica 14 tardaba 30,5 ms.** El plan mostraba la subconsulta de la respuesta repetida once veces por conversación: PostgreSQL inlinea el CTE `deltas` y la vuelve a evaluar en cada filtro de rango. Es el mismo efecto que la 7.2 resolvió con `materialized`. La 14 materializa los deltas una vez, y el plan queda con las dos búsquedas por índice de la población.
- **Observación sobre la métrica 9, sin cambio**: su plan evalúa la misma subconsulta tres veces. Corregirla cambiaría la consulta de una métrica existente, que este brief excluye. Con 16,6 ms no hace falta; queda anotado para cuando haga falta.
- **La primera corrida dio 2.952 ms en la métrica 9**, inmediatamente después de sembrar, antes del análisis automático de PostgreSQL (`last_autoanalyze` de `messages` a las 19:05:18). Con las estadísticas al día, 19,6 ms. Una medición recién sembrada sin `ANALYZE` no vale: se registra para que la próxima no la tome por un problema.
- La métrica 13 usa `messages_organization_sent_idx` con un `HashAggregate`, igual que la 4. En la base de volumen todos los mensajes tienen `kind` nulo, porque los seeds no lo cargan. El plan no depende de los valores.

**Mutación.** Con `delta >` en lugar de `delta >=` en los rangos, el test de los bordes falla (3 casos). Restaurado.

**Verificación.** La salida completa de cada paso quedó guardada en el scratchpad de la sesión.
- `typecheck`, `lint` y `build` pasan, y `prettier --check` sobre los archivos cambiados sale limpio.
- `test:unit`: 533 de 533, con 4 nuevos de `previousPeriodInput`.
- `test:guards`: 485 de 485.
- `test:integration`: 696 de 696, con 11 nuevos en `analytics-distributions.test.ts`:
  - la métrica 13, con nulos, bordes de medianoche y otra organización;
  - la métrica 14, con un delta exactamente en cada borde, una respuesta posterior a `I` y el día de 25 horas;
  - el período anterior en el día de 23 horas;
  - los invariantes contra las métricas 4 y 9;
  - la autorización, el aislamiento y que no viajen los cuerpos.
- End-to-end del dashboard: 11 de 11, sin cambios (la pantalla no se tocó en esta etapa).
- `package.json`, `package-lock.json` y `drizzle/` sin cambios.
