---
schema: task-brief.v1
task_id: 7.1
task_type: implementation
generated_at: 2026-09-17
---

# Brief: 7.1 — Métricas de volumen

## Objetivo

Crear el módulo `analytics` con las métricas de volumen de [MetricsCatalog.md](../analytics/MetricsCatalog.md): la 1 a la 6 y la 10. Cada una lleva un test de fixture con el valor calculado a mano y la prueba de sus invariantes, incluidos los bordes de zona horaria.

Todo se valida **localmente y en CI**. Esta subfase no crea pantallas, Server Actions ni endpoints.

## Ubicación en la Fase 7

- **Orden previsto**: **7.1** ∥ 7.2 → 7.3 → 7.4. La 7.2 puede ir en paralelo (Roadmap), pero se hace después para reutilizar lo que fije esta subfase: período, forma de "sin datos" y mediana.
- **Notion**: "M. Métricas 1 a 6 y 10, con un test de fixture por métrica y sus invariantes". Estado: "En proceso" desde el 2026-09-17.
- **Necesario ahora**:
  - el módulo `analytics` con su interfaz pública;
  - la resolución y validación del período;
  - las siete métricas, con sus tests y mediciones.
- **Lo que llega después**:
  - las métricas 7, 8, 9 y 11 (7.2);
  - la métrica 12 (7.3);
  - la pantalla 2, el enlace "Dashboard" del marco común y el formato de los valores (7.4).
- **Gates de entrada**:
  1. Fase 6 cerrada, con la CI en verde en `ad1b0a3` ([ejecución 35236188326](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35236188326)). Verificado el 2026-09-17.
  2. Contenedor de PostgreSQL en marcha, con el volumen sembrado en la base de desarrollo.
  3. **Autorización para medir** con `EXPLAIN ANALYZE` y lecturas contra la base de desarrollo, sin escribir en ella (D-5).

## Hallazgos de la verificación previa (2026-09-17)

1. **Estado**:
   - `main` está limpio en `ad1b0a3`, igual que `origin/main`;
   - `src/modules/analytics/` no existe;
   - la frontera ya prevé el módulo: ESLint le permite leer los `schema.ts` ajenos (`eslint.config.mjs`), y `module-boundary.test.ts` tiene dos casos con él.
2. **Índices ya creados en la 6.1** para estas métricas:
   - `conversations_organization_started_idx` `(organization_id, started_at)`, para las métricas 1 y 10;
   - `messages_organization_sent_idx` `(organization_id, sent_at)`, para las métricas 2 a 6 y 10.

   No se prevé ninguna migración.
3. **Dependencias del módulo** (Overview): `conversations` y `organizations`.
   - La métrica 3 solo lee `conversations.client_id`, así que no hace falta `crm`.
   - La zona horaria se obtiene con `getOrganizationTimezone`, como en `conversations`.
4. **El período del catálogo** es `[inicio, fin)` en días de la zona de la organización, y por defecto abarca los últimos 30 días completos, sin hoy.
   - Los filtros de las Fases 4 y 6 usan la misma semántica (4.3.3, D-3; 6.3, D-5): fechas `YYYY-MM-DD` con el fin incluido, que PostgreSQL convierte con `(fecha::date)::timestamp at time zone zona`.
   - En esos filtros, un campo vacío no limita el período y el valor por defecto lo pone la pantalla. Eso no sirve acá: el catálogo fija el valor por defecto como parte de la definición (FR-MET-02), y una serie diaria sin límite no tiene sentido. Se resuelve en D-2.
5. **Tres puntos que el catálogo no define**, pero que la 7.1 necesita fijar:
   - qué mediana usar con una cantidad par de conversaciones (métrica 6);
   - cómo se redondea el promedio;
   - cómo se representa "sin datos".

   Los tres afectan a la 7.2 (mediana de la métrica 9, porcentaje de la 8) y a la 7.4. Se resuelven en D-3 y D-4.
6. **El wireframe 02** carga y falla cada tarjeta por separado ("una métrica lenta no bloquea a las demás"). Eso condiciona la forma de la interfaz. Se resuelve en D-1.
7. **Horario de verano**: `America/Argentina/Buenos_Aires` lo tuvo hasta 2009.
   - El 19/10/2008 duró 23 horas; la 6.3 ya lo usa en sus tests.
   - Falta confirmar la fecha de un día de 25 horas, al terminar ese horario de verano en marzo de 2009. Se consulta a la base de zonas de PostgreSQL antes de fijar el fixture; no se da por supuesta.
8. **Volumen de la base de desarrollo**: 10.000 conversaciones repartidas en 180 días (`seeds/volume.ts`).
9. **Observación fuera de alcance**: el bloque de ESLint de `analytics` no le prohíbe importar `next` ni `@/app/*`, a diferencia de los demás módulos de dominio. La tabla de RepositoryStructure tampoco lo incluye entre ellos. No se corrige acá; queda como pendiente en el cierre.

## Alcance incluido

1. Registrar la resolución de D-1 a D-5.
2. **`src/modules/analytics/`**: `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`. El módulo no tiene `schema.ts`, porque no posee tablas.
   - `repository.ts` lee `conversations` y `messages` desde `@/modules/conversations/schema`, siempre filtradas por `organization_id`. Donde une las dos tablas, filtra ambas.
   - Todas las funciones reciben el `AuthContext` y autorizan con `authorize` en el orden vigente: contraseña pendiente → rol. `admin` y `viewer` pueden leer.
   - Cada función recibe el período como texto de la URL (`from`, `to`) y lo resuelve según D-2. Devuelve el período resuelto y la zona horaria junto con el valor.
   - Las funciones, según D-1:
     - **`getConversationsStarted`** (métrica 1): conversaciones con `started_at` dentro de `I`.
     - **`getActiveConversations`** (métrica 2): `|A|`.
     - **`getUniqueClients`** (métrica 3): clientes distintos de A, más la cantidad de conversaciones de A sin cliente.
     - **`getMessageCounts`** (métricas 4 y 5): entrantes y salientes, en una sola consulta.
     - **`getMessagesPerConversation`** (métrica 6): total de mensajes en `I`, `|A|`, promedio y mediana según D-3; "sin datos" según D-4 si `|A| = 0`.
     - **`getDailyActivity`** (métrica 10): para cada día de `I`, las métricas 1, 2, 4 y 5. Los días sin actividad van con `0`. La agrupación diaria sigue la fórmula del catálogo.
   - Ninguna respuesta contiene el cuerpo de un mensaje, un teléfono ni un nombre de cliente.
3. **Tests unitarios** (`service.test.ts`): validación del período (fechas inválidas, `from` posterior a `to`, largo máximo, campos vacíos) y la forma de "sin datos".
4. **Tests de integración** en `tests/integration/analytics.test.ts`, contra PostgreSQL real, con un fixture sintético propio creado por SQL o por las funciones de `seeds/conversations.ts`, siempre que no acoplen los casos:
   - **valor a mano**: un caso por métrica. El valor esperado se calcula a mano y se deja en un comentario junto al fixture: qué conversaciones y mensajes cuentan, y por qué;
   - **bordes**:
     - un mensaje a las 23:30 locales que en UTC cae al día siguiente;
     - un mensaje justo en el inicio de `I`, que cuenta, y otro justo en su fin, que no cuenta;
     - el día de 23 horas y el de 25 horas, en una organización con la zona de Buenos Aires;
     - una organización con otra zona (`UTC`), para demostrar que se usa `organizations.timezone`;
   - **casos límite del catálogo**:
     - una conversación iniciada antes de `I` con mensajes dentro de `I` cuenta en la métrica 2 y no en la 1;
     - una conversación `closed` que vuelve a tener mensajes no se cuenta dos veces;
     - las conversaciones sin cliente no suman a la métrica 3 y aparecen en su contador aparte;
     - en la métrica 6 solo cuentan los mensajes dentro de `I`;
     - la mediana con una cantidad par y con una impar de conversaciones;
   - **invariantes del catálogo**:
     - la suma diaria de la métrica 1 es igual al total;
     - la suma diaria de la métrica 2 supera el total cuando una conversación está activa varios días;
     - la métrica 3 nunca supera `|A|`;
     - la métrica 4 más la 5 es igual al total de mensajes de `I`;
     - el promedio por `|A|` es igual a la métrica 4 más la 5;
     - la serie diaria tiene exactamente un punto por día de `I`, con ceros explícitos;
   - **sin datos**: un período sin mensajes da "sin datos" en la métrica 6, nunca `0`, y `0` en los conteos;
   - **aislamiento**: los mensajes y conversaciones de otra organización, dentro del mismo período, no cambian ningún valor;
   - **autorización**: `viewer` lee; con la contraseña pendiente, `FORBIDDEN`;
   - **período**: valor por defecto (últimos 30 días completos sin hoy, calculado con el reloj de la base) y rechazos con `VALIDATION_ERROR` y sus `fields`.
5. **Evidencia de mutación**, registrada en el brief. Cada cambio se prueba y se restaura:
   - agrupar por día en UTC en lugar de la zona: debe fallar el borde de medianoche;
   - quitar el filtro de organización de `messages`: debe fallar el aislamiento;
   - contar la métrica 2 sin `DISTINCT`: debe fallar su valor a mano;
   - omitir los días sin actividad: debe fallar la serie.
6. **Mediciones** según D-5, sobre la organización de volumen de la base de desarrollo, en solo lectura, con un período de 30 días y otro de 180. Los scripts van en el scratchpad y no se versionan.
7. **Documentación**:
   - MetricsCatalog: resoluciones de D-2 y D-3, y estado "implementado" para las métricas 1 a 6 y 10;
   - Overview: interfaz de `analytics`;
   - TraceabilityMatrix: índices confirmados con `EXPLAIN`;
   - TestingStrategy: casos cubiertos;
   - RepositoryStructure: fila de la 7.1;
   - Risks, solo si la medición deja un riesgo.

## Alcance excluido

- Las métricas 7, 8, 9 y 11 (7.2) y la 12 (7.3).
- La pantalla 2, el enlace "Dashboard", el formato de los números en pantalla, los estados de carga y error de las tarjetas, y cualquier cambio en `src/app/` (7.4).
- Tablas de agregados, snapshots o caché de métricas ([ADR 0005](0005-metricas-desde-datos-transaccionales.md)).
- Migraciones, índices y cambios en los seeds. Si la medición exige un índice, se activa una condición de detención.
- Cambios en otros módulos y en `eslint.config.mjs` (hallazgo 9).
- Dependencias nuevas, incluida cualquier biblioteca de estadística.
- Métricas entre organizaciones.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/analytics/repository.ts`, `service.ts`, `index.ts` y `service.test.ts` (nuevos).
- `tests/integration/analytics.test.ts` (nuevo).
- Los documentos del punto 7.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [MetricsCatalog.md](../analytics/MetricsCatalog.md): fórmulas, convenciones, casos límite y validaciones.
2. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-MET-01 a 03.
3. [DataModel.md](../architecture/DataModel.md) y [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md), vista 4.
4. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): la excepción de lectura de `analytics`.
5. [Screens.md](../product/Screens.md) §2 y el [wireframe 02](../product/wireframes/02-dashboard.md), para la forma de la interfaz.
6. [ADR 0005](0005-metricas-desde-datos-transaccionales.md).
7. Precedentes:
   - [brief-4.3.3](brief-4.3.3-historial-de-movimientos.md): períodos, D-3 y D-4;
   - [brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md): fechas compartidas en D-5 y umbral de medición en D-4;
   - [brief-6.2](brief-6.2-seeds-sinteticos-de-conversaciones.md): volumen.

## Dependencias

- Fase 6 cerrada (verificado).
- Volumen sembrado en la base de desarrollo (verificado en la 6.2 y la 6.3).
- Autorización para medir contra la base de desarrollo.

## Resolución (2026-09-17)

El usuario aprobó el brief con D-1 a D-5 según la recomendación: (a) en las cinco. También autorizó medir con `EXPLAIN ANALYZE` y lecturas contra la base de desarrollo, en solo lectura.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Forma de la interfaz

- **Opciones**:
  - (a) **Una función por tarjeta del wireframe**. Las métricas 4 y 5 comparten una función, porque salen de la misma consulta. Cada función hace su propia lectura.
  - (b) **Una sola función** que devuelve las siete métricas en una transacción `REPEATABLE READ` de solo lectura.
- **Recomendación**: (a).
  - Con (a), la 7.4 carga y falla cada tarjeta por separado, como pide el wireframe. Con (b), un error en una métrica deja sin datos a todas.
  - Las consultas no comparten trabajo costoso que justifique juntarlas.
- **Consecuencia**:
  - si llega un mensaje entre dos lecturas, dos tarjetas pueden diferir en ese mensaje. Se acepta y se documenta en MetricsCatalog;
  - los invariantes entre métricas se prueban sobre un fixture estático;
  - la 7.2 sigue la misma forma.

### D-2 — Período: valor por defecto y límites

- **Opciones**:
  - (a) **Lo resuelve el servicio**. `from` y `to` son fechas de calendario con el fin incluido; si llegan vacías, se usan los últimos 30 días completos sin hoy, en la zona de la organización y con el reloj de PostgreSQL. Además:
    - `from` posterior a `to` da `VALIDATION_ERROR`;
    - `to` posterior a hoy da `VALIDATION_ERROR`, pero hoy se admite como día parcial;
    - el período no supera los **366 días**.

    Una función pública y pura, `resolveMetricsPeriod`, se reutiliza en cada métrica.
  - (b) **Lo resuelve la pantalla**, como en las Fases 4 y 6, y el servicio exige las dos fechas.
- **Recomendación**: (a).
  - El valor por defecto forma parte de la definición de las métricas (FR-MET-02). Dejarlo en el servicio garantiza que las 12 lo apliquen igual.
  - Calcular "hoy" con el reloj de la base evita diferencias entre el reloj de la aplicación y el de los datos.
  - El límite de 366 días acota la serie diaria y el costo de las consultas. Un año completo entra.
  - Rechazar un `to` futuro evita una serie con días que todavía no existen y que se mostrarían en `0`.
- **Consecuencia**:
  - estas métricas no siguen la convención de "vacío no limita" de las listas. MetricsCatalog lo registra;
  - la 7.4 solo muestra el período que devuelve el servicio.

### D-3 — Mediana y redondeo

- **Opciones de mediana** (métrica 6, y luego la 9):
  - (a) `percentile_cont(0.5)`: con una cantidad par, el promedio de los dos valores centrales;
  - (b) `percentile_disc(0.5)`: el menor de los dos valores centrales, siempre uno observado.
- **Redondeo**: el servicio devuelve los valores sin redondear, y el numerador y el denominador como enteros. La 7.4 formatea con un decimal, como el catálogo ya fija para las métricas 8 y 9.
- **Recomendación**: (a), y el redondeo en la presentación.
  - (a) es la definición estadística habitual y la que espera quien lee "mediana". La métrica 9 ya se muestra con un decimal.
  - Redondear en el servicio perdería precisión en los invariantes: promedio por `|A|` igual a la métrica 4 más la 5.
- **Consecuencia**:
  - MetricsCatalog fija la regla para las métricas 6 y 9;
  - el wireframe muestra "Mediana 9", y con (a) puede aparecer "9,5". No hace falta corregirlo: es un ejemplo.

### D-4 — Representación de "sin datos"

- **Opciones**:
  - (a) **Unión discriminada** para las métricas con denominador: `{ status: "value", … } | { status: "no_data" }`. La 7.3 le suma `{ status: "unavailable" }`. Los conteos devuelven siempre un número, porque `0` es un valor válido.
  - (b) **`null`** en el valor.
- **Recomendación**: (a).
  - El tipo obliga a la pantalla a tratar cada estado, y el wireframe distingue "Sin datos" de "No disponible". Con `null`, los dos se confunden.
- **Consecuencia**: el tipo vive en `analytics` y lo reutilizan la 7.2 y la 7.3.

### D-5 — Medición y umbral

- **Opciones**:
  - (a) **Mismo umbral que la 6.3** (D-4): cada consulta y cada función por debajo de 200 ms, como mediana de 5 corridas en caliente, sobre la organización de volumen, con períodos de 30 y 180 días. Además, `EXPLAIN` sin recorridos completos de `messages` ni `conversations` donde se previó un índice. Si aparece un recorrido completo por la distribución de los datos, como en la 6.3, se detiene y se consulta.
  - (b) **Solo registrar** los tiempos.
- **Recomendación**: (a).
  - Mantiene el criterio verificable que ya se aceptó.
  - Las métricas recorren muchos mensajes por período, así que el riesgo de rendimiento es mayor que en las listas.
- **Consecuencia**:
  - la medición es local y no reemplaza la de staging (Fase 9);
  - si falla, la alternativa (índice, snapshot con ADR, o reducir el período máximo) se decide aparte.

## Invariantes

- Toda consulta filtra por `organization_id`, en cada tabla que lee.
- `analytics` solo lee: no escribe ninguna tabla ni abre transacciones de escritura.
- `analytics` solo importa los `schema.ts` de otros módulos y sus interfaces públicas, nunca sus repositorios ni servicios.
- Ninguna respuesta contiene cuerpos de mensajes, teléfonos ni nombres de clientes.
- Los valores se calculan desde los datos transaccionales en cada llamada, sin caché (FR-MET-03, ADR 0005).
- Un denominador cero nunca se presenta como `0`.
- Sin dependencias, migraciones ni cambios en `src/app/`, en los seeds ni en otros módulos.

## Criterios de aceptación

- **AC-1**: D-1 a D-5 tienen resolución del usuario con fecha.
- **AC-2**: las métricas 1 a 6 y 10 tienen cada una su test con el valor calculado a mano y sus invariantes probados, incluidos el borde de medianoche, los días de 23 y 25 horas y la otra zona. Todo pasa contra PostgreSQL real.
- **AC-3**: las mutaciones del punto 5 quedan registradas: cada una hace fallar el caso previsto.
- **AC-4**: las mediciones del punto 6 quedan registradas y cumplen D-5, o la condición de detención queda resuelta por el usuario.
- **AC-5**: `npm run test` pasa completo, sin cambios en los tests existentes.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-7**: `npm run test:e2e` sigue pasando 65 de 65.
- **AC-8**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`, incluidos sus pasos.
- **AC-9**: `git status` muestra solo archivos autorizados, y los documentos del punto 7 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **`deterministic`**: `npm run test`, con los tests de integración contra PostgreSQL 18.6 real y fixtures sintéticos declarados como tales.
- **Mutación**: los cuatro casos del punto 5.
- **Medición**: `EXPLAIN` y tiempos, declarados como locales.
- **CI**: ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para las métricas 1 a 6 y 10.

**No se valida**:

- la presentación de las métricas (7.4);
- las métricas 7 a 9, 11 y 12;
- el rendimiento con varias organizaciones o en staging (Fase 9);
- valores con datos reales: no hay emisor conectado.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si una medición supera el umbral de D-5, si `EXPLAIN` muestra un recorrido completo no previsto, o si hace falta un índice, una migración o un snapshot.
- Si una fórmula del catálogo resulta ambigua frente a un caso del fixture, más allá de lo que resuelve D-3. Se consulta; no se elige en silencio.
- Si `analytics` necesita leer una tabla de un módulo que no está en sus dependencias (Overview), o un repositorio ajeno.
- Si un test existente necesita cambios, o si aparece la necesidad de tocar `src/app/`, los seeds, otro módulo o una dependencia.
- Antes de medir contra la base de desarrollo, y antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-17)

La implementación está terminada y el cierre está pendiente. Se activó la condición de detención de D-5, y el usuario autorizó cómo seguir.

### D-5: recorridos completos

Las funciones cumplen el umbral con holgura, pero siete consultas recorren tablas completas donde se preveía un índice:

- **con 180 días**, las métricas 1 a 6 y 10 recorren `conversations` y `messages`. El período contiene el 99,5 % de los mensajes de la organización de volumen, que tiene el 99,9 % de la tabla;
- **con 30 días**, la métrica 3 recorre `conversations` (10.000 filas) para el `IN`: A tiene el 17 % de las conversaciones.

Con `enable_seqscan = off`, PostgreSQL usa índices y los tiempos son iguales o peores:

- 180 días: la métrica 1 pasa de 1,1 a 11,0 ms; la 10, de 75,9 a 54,4 ms;
- 30 días: la métrica 3 pasa de 8,2 a 8,8 ms con la clave primaria.

Con los índices forzados, las lecturas de `messages` sobre 180 días eligen `messages_conversation_sent_idx` en lugar de `messages_organization_sent_idx`.

El usuario decidió aceptar el resultado y registrarlo, como en la 6.3:

- se cumple el tiempo y los índices quedan probados;
- se vuelve a medir con varias organizaciones en staging (Fase 9);
- Risks y TraceabilityMatrix lo registran.

### Ajustes dentro del alcance

- **Día de 25 horas.** La base de zonas de PostgreSQL da el 14/03/2009 como el día de 25 horas de Buenos Aires, no el 15. En esa zona, el cambio a la hora estándar ocurre a la medianoche del 15, que vuelve a las 23:00 del 14. El test usa esa fecha. La consulta también confirmó que el 19/10/2008 dura 23 horas.
- **Error del cálculo a mano.** La primera corrida falló en el 04/09 de la métrica 10: el valor esperado omitía el entrante de C3 a las 03:00Z, que queda fuera de I pero dentro de ese día local. El código era correcto; se corrigieron el valor esperado y su comentario.
- **"Sin datos" en integración.** Esa forma depende del resultado de la consulta, así que se prueba en `analytics.test.ts` y no en los tests unitarios.
- **Una sola fecha.** Si llega solo una de las dos fechas, el período se rechaza con el campo vacío.
- **Defensa doble en la métrica 3.** Sin el filtro de organización en `messages`, la métrica 3 no cambia, porque la consulta exterior filtra `conversations` por organización.

### Evidencia

- **Tests de métricas**: `tests/integration/analytics.test.ts` pasa 18 casos y `analytics/service.test.ts` pasa 7.
- **Mutaciones**. Con cada una se corrió el archivo de integración y después se restauró `repository.ts`, comprobado con `cmp`:

  | Mutación | Casos que fallan |
  |---|---|
  | Días en UTC | 4: métrica 10, invariantes, 23 horas y 25 horas |
  | Sin filtro de organización en `messages` | 8, incluido el aislamiento |
  | Métrica 2 sin `DISTINCT` | 4, incluidos su valor a mano y la conversación reabierta |
  | Serie sin días vacíos (`join` en lugar de `left join`) | 2: métrica 10 y sin datos |

- **Suite local**: `npm run test` pasa 648 de 648.
- **Verificaciones**: pasan `typecheck`, `lint` y `format:check`. Con el contenedor detenido, pasan `test:guards` (30), `test:unit` (269) y `build`, y `db:generate` no produce migraciones.
- **End-to-end**: `npm run test:e2e` pasa 65 de 65.

### Mediciones

Se tomaron en la base de desarrollo, en local y en solo lectura:

- la conexión fijó `default_transaction_read_only = on` con `PGOPTIONS`, y un intento de escritura fue rechazado con `25006`;
- el contexto se armó sin iniciar sesión;
- los scripts quedaron en el scratchpad.

La organización de volumen tiene 10.000 conversaciones y 65.260 mensajes. Los períodos medidos son 16/08 a 14/09/2026 (30 días) y 19/03 a 14/09/2026 (180 días).

| Consulta (`EXPLAIN ANALYZE`) | 30 días | Plan | 180 días | Plan |
|---|---|---|---|---|
| 1 Iniciadas | 0,4 ms | index only scan, `started` | 1,1 ms | recorrido completo (ver arriba) |
| 2 Con actividad | 6,2 ms | bitmap, `organization_sent` | 28,6 ms | index scan, `conversation_sent` |
| 3 Clientes únicos | 8,2 ms | recorrido de `conversations` y bitmap (ver arriba) | 25,2 ms | recorridos completos |
| 4 y 5 Por dirección | 3,2 ms | bitmap, `organization_sent` | 8,7 ms | recorrido completo |
| 6 Por conversación | 4,6 ms | bitmap, `organization_sent` | 15,4 ms | recorrido completo |
| 10 Diaria | 10,4 ms | index only scan, `started`, y bitmap, `organization_sent` | 75,9 ms | recorridos completos |

| Función (mediana de 5 corridas en caliente) | 30 días | Máximo | 180 días | Máximo |
|---|---|---|---|---|
| `getConversationsStarted` | 6,2 ms | 7,2 ms | 5,2 ms | 7,3 ms |
| `getActiveConversations` | 8,6 ms | 9,3 ms | 14,2 ms | 14,9 ms |
| `getUniqueClients` | 9,6 ms | 11,6 ms | 18,9 ms | 19,7 ms |
| `getMessageCounts` | 7,0 ms | 7,6 ms | 11,1 ms | 14,7 ms |
| `getMessagesPerConversation` | 8,2 ms | 8,9 ms | 17,7 ms | 26,5 ms |
| `getDailyActivity` | 16,5 ms | 17,1 ms | 54,9 ms | 57,4 ms |

Todas quedan por debajo de los 200 ms de D-5.

### Pendiente

- Commit, push, CI (AC-8) y cierre.
- **Al cerrar, registrar en HANDOFF**: el bloque de ESLint de `analytics` no prohíbe `next` ni `@/app/*` (hallazgo 9).
