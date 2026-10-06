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
  - ~~con el anterior en 0, o en «sin datos», se muestra «sin datos del período anterior», nunca «+∞ %» ni «+100 %»;~~ *Enmendado el 2026-10-06 por decisión del usuario (§Revisión independiente, hallazgo 4)*: una cantidad con el anterior en 0 muestra «Sin comparación: el período anterior fue 0», nunca «+∞ %» ni «+100 %»; en «sin datos», «Sin datos del período anterior»; en «no disponible», «Período anterior no disponible». Las tasas y los promedios con el anterior en 0 se comparan;
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
- ~~Todo gráfico tiene una alternativa accesible con los valores exactos, visible sin JavaScript.~~ *Enmendado el 2026-10-06 por decisión del usuario (§Resultados — 15.3.3)*: todo gráfico tiene una alternativa accesible con los valores exactos, a la vista sin depender del mouse ni del teclado. *Precisado el 2026-10-06 por decisión del usuario (§Revisión independiente, hallazgo 3)*: una tabla en un desplegable «Ver tabla de datos», como la del gráfico diario desde la 7.4, cuenta como a la vista. Desde la 7.4 el dashboard carga cada tarjeta con streaming y no muestra valores sin JavaScript.
- Ningún atributo `style` ni clase de la paleta por defecto de Tailwind en `src/app/`.
- `package.json`, `package-lock.json` y `drizzle/` sin cambios, salvo que D-1 se resuelva por (b).

## Criterios de aceptación

- **AC-1**: D-1 a D-9 tienen resolución del usuario con fecha.
- **AC-2**: el MetricsCatalog define el período anterior y las métricas 13 y 14 antes de que exista código que las dibuje (la etapa 15.3.1 se commitea antes de la 15.3.3).
- **AC-3**: tests de integración contra fixtures calculados a mano prueban el período anterior (incluido un período que cruza un cambio de horario histórico), la métrica 13 (con nulos y con un mensaje cerca de medianoche) y la métrica 14 (con un `delta` exactamente en cada borde de rango), y los invariantes de validación de las dos.
- **AC-4**: tests unitarios prueban el formato y los casos de la variación: anterior en 0, «sin datos», período que incluye hoy, puntos porcentuales y diferencias absolutas.
- **AC-5**: los end-to-end existentes pasan, con sus pasos sin cambios salvo los listados en el informe.
- **AC-6**: end-to-end nuevos prueban la variación y «Ver detalles» de al menos una tarjeta de cada tipo, la lectura del gráfico diario con el mouse y con el teclado, la dona y el histograma con sus valores, ~~y que sin JavaScript los valores siguen visibles~~ y que los valores están a la vista sin la interacción (*enmendado el 2026-10-06*, ver el invariante).
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

## Resultados — 15.3.2

**Qué se hizo.**
- **Variación** ([variation.ts](../../src/app/(autenticado)/_dashboard/variation.ts), función pura con 6 tests unitarios):
  - las cantidades se comparan en porcentaje, las tasas en puntos porcentuales, y el promedio y la mediana como diferencia absoluta;
  - lo que redondea a 0,0 es «sin cambios»;
  - con el anterior en 0 o sin valor, «Sin datos del período anterior»;
  - flecha decorativa (`aria-hidden`), y el texto lleva el signo, con el color atenuado del detalle: sin verde ni rojo.
  - Las flechas son caracteres (↑ ↓ →), no íconos: `icons.tsx` no está en la lista de archivos.
- **Tarjetas** ([cards.tsx](../../src/app/(autenticado)/_dashboard/cards.tsx)): cada una pide los dos períodos en paralelo (`Promise.allSettled`). Si el anterior falla, la tarjeta muestra su valor, dice «No se pudo calcular el período anterior» con el código del log, y no se rompe. La 11 no se compara y lo explica en «Ver detalles».
- **«Ver detalles»** reemplaza a «Definición»: la definición y «Período anterior, del … al …: valor».
- **Hoy incompleto**: si el período incluye hoy, no se pide el anterior, y una sola línea debajo del período lo explica.

**Desvíos aceptados por el usuario el 2026-10-06 (opción a).** El texto de «Ver detalles» está en la página aunque el desplegable esté cerrado. Cuatro afirmaciones existentes buscaban un texto en toda la tarjeta y pasaron a encontrarlo dos veces, o a encontrarlo donde no debía:
- `dashboard.spec.ts`, caso 1: «0» en «Conversaciones iniciadas» y «Sin datos» en «Mensajes por conversación» pasan a texto exacto;
- `dashboard-sin-ingestion.spec.ts`, caso 1: «Sin datos» en «Mensajes por conversación», a texto exacto;
- `dashboard-sin-ingestion.spec.ts`, caso 2: «la tarjeta no dice "No disponible"» pasa a «ningún elemento es exactamente "No disponible"». El período anterior, sin eventos y con la ingestión apagada, sí es «No disponible», y «Ver detalles» lo nombra con razón.

Se informaron tres y apareció una cuarta en el mismo caso 1, con la misma causa, cuando la primera dejó de cortar el test: se ajustó igual. El caso 8 cambia «Definición» por «Ver detalles», como estaba previsto (H-7). Lo que cada afirmación prueba no cambió.

**Medición (D-7).** En una base local aparte, sembrada con `seeds/volume.ts medicion`, con `ANALYZE` después de sembrar, y borrada al terminar. La siembra reparte los datos en 180 días, así que el período anterior tiene datos. La carga del dashboard, con todas las llamadas en paralelo:

| Carga | Organización grande | Organización chica |
|---|---|---|
| 13 llamadas, un período | 40,9 ms | 14,9 ms |
| 26 llamadas, con el período anterior | 81,1 ms | 28,7 ms |

El costo se duplica, como se esperaba (H-6), y queda debajo del umbral local de 400 ms. `scripts/medir-caminos.ts` arma la lista de métricas como función del período y mide las dos cargas.

**Verificación.** La salida completa de cada paso quedó guardada en el scratchpad de la sesión.
- `typecheck`, `lint` y `build` pasan, y `prettier --check` sobre los archivos cambiados sale limpio.
- `test:unit`: 539 de 539, con 6 nuevos de la variación.
- `test:guards`: 485 de 485.
- `test:integration`: 696 de 696.
- Ningún atributo `style` en `src/app/`.
- End-to-end: 115 de 115 sobre `next start`, en dos tandas (48 y 67). Los dos casos nuevos son:
  - el caso 10, con cada tipo de comparación calculado a mano contra un período anterior sembrado, «Ver detalles» con sus fechas, la métrica 11 sin comparar, y axe con los detalles abiertos;
  - el caso 11, con hoy dentro del período: sin comparación y con la explicación.

  Entre las dos tandas se cortó cualquier proceso que quedara escuchando en el puerto 3100 (lección de la 15.2).

## Resultados — 15.3.3

**Qué se hizo.**
- **Lectura de los gráficos.**
  - El servidor dibuja la línea de lectura y el contenedor enfocable de cada gráfico ([chart-frame.tsx](../../src/app/(autenticado)/_dashboard/chart-frame.tsx)).
  - Los SVG los dibujan componentes que reciben solo números y textos ([chart-svgs.tsx](../../src/app/(autenticado)/_dashboard/chart-svgs.tsx)); cada forma lleva `data-index` y `data-readout`.
  - Un solo componente cliente, montado una vez en la página fuera de las tarjetas ([chart-interactions.tsx](../../src/app/(autenticado)/_dashboard/chart-interactions.tsx)), escucha a todos los gráficos por delegación. Pasar el puntero por una forma, o recorrerlas con las flechas (más Inicio, Fin y Escape) con el gráfico enfocado, escribe su texto en la línea, que es una región `aria-live`.
  - La forma activa se marca atenuando las demás con una clase, y en un gráfico ancho se desplaza hasta quedar a la vista. No se posiciona ningún globo ni se escriben estilos en línea (H-1).
- **El gráfico diario** usa esa lectura. Cada barra nombra el día con su día de la semana y la serie elegida, por ejemplo «Sáb 12/09/2026: 2 conversaciones iniciadas», o «3 mensajes (2 entrantes, 1 saliente)».
- **La dona de la métrica 13**, «Tipos de mensajes»:
  - segmentos SVG calculados por una función pura ([donut-geometry.ts](../../src/app/(autenticado)/_dashboard/donut-geometry.ts));
  - el total en el centro, y al costado la lista de los seis tipos con su cantidad y su porcentaje, más «Sin dato» cuando tiene mensajes.
- **El histograma de la métrica 14**, «Tiempo de primera respuesta»: los cinco rangos con su lectura, las conversaciones sin respuesta aparte y «Ver tabla de datos».
- Las dos tarjetas van lado a lado debajo de la evolución diaria (en pantallas angostas, una debajo de la otra), sin variación. Los textos de lectura salen de funciones puras ([readouts.ts](../../src/app/(autenticado)/_dashboard/readouts.ts)).

**Colores de los gráficos (decidido por el usuario el 2026-10-06).** Los tokens existentes no daban siete tonos distinguibles sin usar `success` y `danger`, que dirían «bueno» y «malo». El usuario autorizó tocar `src/app/globals.css`, que estaba fuera de la lista, para sumar `--chart-text` a `--chart-none` en los tres bloques de tema y en `@theme`. Solo los usan los gráficos. El contraste con la superficie (WCAG 1.4.11 pide 3:1) se calculó sobre los valores hexadecimales:

| Grupo | Claro | vs. `#ffffff` / `#f6f5fb` | Oscuro | vs. `#15142c` |
|---|---|---|---|---|
| Texto | `#6d28d9` | 7,10 / 6,55 | `#a48bfa` | 6,55 |
| Audio | `#2563eb` | 5,17 / 4,77 | `#60a5fa` | 7,07 |
| Imagen | `#0e7490` | 5,36 / 4,94 | `#22d3ee` | 9,95 |
| Video | `#b45309` | 5,02 / 4,63 | `#fbbf24` | 10,77 |
| Documento | `#be185d` | 6,04 / 5,57 | `#f472b6` | 6,79 |
| Otro | `#4d7c0f` | 4,99 / 4,61 | `#a3e635` | 11,92 |
| Sin dato | `#7d7799` | 4,22 / 3,90 | `#8a85b0` | 5,19 |

Es un cálculo, no evidencia de la interfaz; la evidencia de la interfaz es axe.

**Hallazgo: la CSP y el streaming de los SVG.** La primera versión pasaba el SVG que dibuja el servidor como `children` de un componente cliente. La guarda de CSP de `security-headers.spec.ts` (caso 3) encontró violaciones de `style-src-attr` en el dashboard, de forma intermitente. La causa, medida y no supuesta:
- React manda la página en partes. Cuando una parte se corta **dentro de un `<svg>`**, la inserta con un contenedor `<svg aria-hidden style="display:none">`, porque el atributo `hidden` no vale en SVG, y la CSP lo bloquea. Fuera de un SVG usa `hidden`, que sí está permitido.
- Antes de la 15.3 el SVG diario era chico y el corte nunca cayó adentro. Con la lectura, el contenido creció. Se probó contando los contenedores en el HTML servido, 12 cargas por versión:

| Versión | Cargas con contenedores en el SVG |
|---|---|
| Lectura como `children` del componente cliente | 4 de 12 |
| Sin la lectura | 0 de 12 |
| Lectura con atributos en el SVG del servidor y un componente fuera de las tarjetas | 7 de 12 |
| **SVG dibujado por componentes que reciben solo datos** (la versión final) | **0 de 12**, y después 0 atributos `style` en 40 cargas, con hasta 49 partes por carga |

La tercera fila descartó que la causa fuera el componente cliente: lo es que haya elementos del servidor dentro del `<svg>`. La regla queda escrita en [chart-svgs.tsx](../../src/app/(autenticado)/_dashboard/chart-svgs.tsx): ningún `<svg>` del dashboard se arma con elementos del servidor.

**Desvíos.**
- **Sin JavaScript (decidido por el usuario el 2026-10-06).** El brief suponía que el dashboard muestra sus valores sin JavaScript, pero desde la 7.4 carga cada tarjeta con `Suspense` y streaming, y sin JavaScript todas quedan en «cargando». Se probó con un caso end-to-end sin JavaScript: fallaba en todas las tarjetas, no solo en las nuevas. El usuario eligió registrarlo y seguir: el invariante y AC-6 se enmendaron con fecha, y el caso se quitó. La limitación es de la 7.4 y queda como dato conocido. Quitar el streaming cambiaría la carga por tarjeta que decidió esa subfase (D-2).
- `cards.tsx` exporta su componente `Card` para las dos tarjetas nuevas, que están en un archivo propio ([distributions.tsx](../../src/app/(autenticado)/_dashboard/distributions.tsx)).
- Las métricas 13 y 14 suman su nombre, definición e ícono en `definitions.ts`, con los nombres del boceto. Los íconos (`mail` y `clock`) ya existían.
- En el caso 12, el puntero sobre un segmento de la dona se simula con el evento `pointerover`. El centro de la caja de un arco puede caer en el hueco, y ahí no hay segmento que leer. El texto del centro de la dona lleva `pointer-events-none`, para no tapar los segmentos.
- Al aplicar ese último cambio, un reemplazo mal guardado duplicó el contenido de `distributions.tsx`, que todavía no estaba en Git. Se reconstruyó desde la primera copia, que estaba completa, y se volvió a verificar: el formato, los tipos, el build y los casos pasan.

**Medición.** Las métricas 13 y 14 ya estaban en la carga medida en la 15.3.2 (13 llamadas, 40,9 ms; con el período anterior, 81,1 ms). Las dos tarjetas nuevas no se comparan, así que no suman llamadas.

**Capturas (AC-11).** Hay 16, en claro y en oscuro, a 1280 y a 375 px, en el scratchpad de la sesión (`capturas-153`): la página entera, «Ver detalles» abierto, el gráfico diario con una lectura y las distribuciones con lecturas activas. Se tomaron sobre la organización del piloto en `crm_dev`, con el período del 01/09 al 30/09, cuyo período anterior tiene datos desde el 25/08. Allí 66 de los 68 entrantes no tienen tipo, así que la dona muestra sobre todo «Sin dato», que es lo que hay. En la captura oscura de página completa el panel lateral sale abajo: es un efecto de capturar la página entera después de desplazarla, con el panel fijo.

**Verificación.** La salida completa de cada paso quedó guardada en el scratchpad de la sesión (`bateria-1533`).
- `typecheck`, `lint` y `build` pasan, y `prettier --check` sobre los archivos cambiados sale limpio.
- `test:unit`: 548 de 548, con 9 nuevos de la geometría de la dona y de los textos de lectura.
- `test:guards`: 485 de 485.
- `test:integration`: 696 de 696.
- En `src/app/`, ningún atributo `style` y ninguna clase de la paleta por defecto de Tailwind (AC-8).
- End-to-end: 118 de 118 sobre `next start`, en dos tandas (51 y 67), incluida la guarda de CSP. Los tres casos nuevos son:
  - el caso 12: la dona, con su lista, la lectura con el puntero y con el teclado, y axe;
  - el caso 13: el histograma, con su tabla, la lectura con el teclado, Escape y axe;
  - el caso 14: el gráfico diario, con el puntero y el teclado en las dos series, y axe.
- La primera corrida de la tanda B perdió el servidor de la aplicación a mitad de camino (62 `ERR_CONNECTION_REFUSED`), con 0,4 GB libres en la máquina, como en la 15.2. Repetida sola, pasó 67 de 67.
- Las capturas se volvieron a tomar con la versión final.

## Revisión independiente (D-9) — 2026-10-06

Agente `independent-reviewer`, de solo lectura, que no participó del trabajo, sobre `7190108`, `7461da3` y `aeb3f2a`. Escala fijada antes de mirar. Informó 9 hallazgos (1 alto, 2 medios, 6 bajos) y 7 observaciones; no encontró errores en las fórmulas de las métricas 13 y 14, ni violaciones de la CSP o de CLAUDE.md. Cada hallazgo se verificó contra el código antes de aceptarlo (autoevaluación de quien implementó).

| # | Severidad | Hallazgo | Verificación | Resolución |
|---|---|---|---|---|
| 1 | Alto | Un período anterior «no disponible» se mostraba como «Sin datos del período anterior» (rompe el invariante de estados distintos) | Confirmado: `rateOf` y los promedios devolvían `null` para cualquier estado | `Comparable` suma `{ kind: "unavailable" }`; la variación dice «Período anterior no disponible». Test unitario y aserción en `dashboard-sin-ingestion.spec.ts`, caso 2 |
| 2 | Medio | Archivos fuera de la lista en el árbol de trabajo | Confirmado, y ajenos a la entrega: `scripts/migrar.ts` y `src/modules/crm/repository.ts` solo difieren en finales de línea, y `.claude/settings.json` es configuración local. Ninguno entró en un commit de la 15.3 | Sin cambio |
| 3 | Medio | La tabla del histograma está en un desplegable cerrado | Confirmado; el gráfico diario usa el mismo patrón desde la 7.4 | Decisión del usuario (2026-10-06): se deja así; el invariante lo precisa |
| 4 | Bajo | D-2 manda «sin datos del período anterior» con el anterior en 0, y el invariante distingue 0 de «sin datos» | Confirmado: contradicción del brief | Decisión del usuario (2026-10-06): «Sin comparación: el período anterior fue 0»; D-2 y el catálogo enmendados |
| 5 | Bajo | «Ver detalles» no se probaba en una cantidad ni en una tasa | Confirmado | El caso 10 abre los detalles de la 1, la 8 y la 9 |
| 6 | Bajo | «El período incluye hoy» sin test unitario | Confirmado | `includesToday` en `variation.ts`, con tests |
| 7 | Bajo | Dos aserciones negativas podían pasar sobre el esqueleto de carga | Confirmado | Casos 10 y 11: la negativa va después de esperar el contenido de cada tarjeta |
| 8 | Bajo | Cambiar la serie con el teclado dejaba la lectura y el atenuado de antes | Plausible por lectura; no se reprodujo contra el código anterior | Cada bloque de gráfico lleva una clave por período y serie (`chartKey`) y se monta de nuevo; el caso 14 cambia la serie con Mayús+Tab y Enter y verifica la línea y el atenuado |
| 9 | Bajo | Comentarios desactualizados («sin JavaScript», «doce métricas», «no se oculta») y Screens.md sin las métricas 13 y 14; la regla de los SVG no contemplaba los íconos | Confirmado | Corregidos; la regla dice ahora «ningún `<svg>` con formas de datos» y nombra los íconos |

**Observaciones** sin cambio: la variación se calcula sobre valores sin redondear (coherente con el catálogo); las tasas con el anterior en 0 se comparan en puntos porcentuales (el catálogo se precisó con la decisión del hallazgo 4); en pantallas táctiles la lectura dura mientras se toca; el arco casi completo de la dona y la carrera de medianoche son hipotéticos; los lectores de pantalla en modo navegación interceptan las flechas, y la alternativa es la lista o la tabla; la autorización de `globals.css` consta en este brief.

**Verificación después de las correcciones:** tipos y lint pasan; unitarios e integración 1.732 de 1.732; end-to-end del dashboard, sin ingestión y cabeceras de seguridad (CSP) 21 de 21 sobre un build nuevo.
