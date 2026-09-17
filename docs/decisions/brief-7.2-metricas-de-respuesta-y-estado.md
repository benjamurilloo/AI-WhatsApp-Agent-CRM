---
schema: task-brief.v1
task_id: 7.2
task_type: implementation
generated_at: 2026-09-17
---

# Brief: 7.2 — Métricas de respuesta y estado

## Objetivo

Sumar al módulo `analytics` las métricas de respuesta y estado de [MetricsCatalog.md](../analytics/MetricsCatalog.md): la 7 (conversaciones respondidas), la 8 (cobertura de respuesta), la 9 (mediana del tiempo a primera respuesta) y la 11 (distribución por estado). Cada una lleva su test de fixture con el valor calculado a mano y sus invariantes probados, incluidos los empates de timestamp, las respuestas posteriores al fin del intervalo y los bordes de zona horaria.

Todo se valida **localmente y en CI**. Esta subfase no crea pantallas, Server Actions ni endpoints, y no reabre ninguna decisión de la 7.1.

## Ubicación en la Fase 7

- **Orden previsto**: 7.1 → **7.2** → 7.3 → 7.4.
- **Notion**: tarea "7.2 — Métricas de respuesta y estado", descripción "M. Métricas 7, 8, 9 y 11, incluidos empates de timestamp y respuestas fuera del intervalo". Estado "Bandeja de Entrada" al escribir este brief (verificado el 2026-09-17).
- **Necesario ahora**:
  - las cuatro métricas en la interfaz pública de `analytics`, con la forma que fijó la 7.1;
  - sus tests de fixture, invariantes y bordes;
  - sus mediciones con volumen.
- **Lo que llega después**:
  - la métrica 12 y el estado "no disponible" (7.3);
  - la pantalla 2, el formato de los valores, los estados de carga y error de cada tarjeta, y los textos de los estados de la métrica 11 (7.4).
- **Gates de entrada**:
  1. 7.1 cerrada, con la CI en verde en `75a6711` ([ejecución 35252525576](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35252525576)). Verificado el 2026-09-17.
  2. Contenedor de PostgreSQL en marcha, con el volumen sembrado en la base de desarrollo.
  3. **Autorización para medir** con `EXPLAIN ANALYZE` y lecturas contra la base de desarrollo, sin escribir en ella (D-6).

## Hallazgos de la verificación previa (2026-09-17)

1. **Estado**: `main` está limpio en `75a6711`, igual que `origin/main`, y la CI de ese commit terminó en `success`. El módulo `analytics` existe con las métricas 1 a 6 y 10.
2. **Índices ya creados en la 6.1**, sin necesidad de migración:
   - `messages_organization_sent_idx` `(organization_id, sent_at)`, para acotar `A` y `A_in` al período;
   - `messages_conversation_sent_idx` `(conversation_id, sent_at)`, para el primer entrante y la primera respuesta de cada conversación. No incluye `direction`, así que el filtro por dirección se resuelve sobre las filas que devuelve el índice;
   - `conversations_organization_id_id_unique` y la clave primaria de `conversations`, para traer el estado actual de las conversaciones de `A` (métrica 11).
3. **Lo que fijó la 7.1 y se reutiliza tal cual**, sin volver a discutirlo: `resolveMetricsPeriod` y la semántica del período (D-2), el envoltorio que autoriza y resuelve el período, `MetricsQuery` con `periodStart`/`periodEnd`, `percentile_cont(0.5)` y los valores sin redondear (D-3), `RatioMetric` con `no_data` (D-4) y una función por tarjeta del wireframe (D-1).
4. **Dos lecturas de la métrica 9 no están acotadas por el período**, a diferencia de todas las métricas de la 7.1:
   - su población es la conversación cuyo **primer entrante de toda la conversación** cae en `I`, lo que exige mirar mensajes anteriores a `I`;
   - su primera respuesta puede ser **posterior al fin de `I`**.

   Ahí está la diferencia de costo con la 7.1, y por eso la forma de la consulta se decide antes de escribirla (D-2).
5. **Tres métricas que parecen la misma y no lo son**, según el catálogo:
   - la **7** exige el entrante y el saliente **dentro de `I`**, con el saliente estrictamente posterior;
   - la **8** divide la 7 por `|A_in|`, no por `|A|`;
   - la **9** usa el primer entrante de toda la conversación y admite la respuesta fuera de `I`.

   Cada una necesita su propio caso en el fixture, y un caso que discrimine entre ellas.
6. **Redacción del catálogo a ajustar**: la métrica 8 dice "en porcentaje con un decimal" y la 9 "en minutos, con un decimal". Eso choca con D-3 de la 7.1, que puso el redondeo en la presentación. Se corrige la redacción para que el decimal sea de la pantalla; el comportamiento no cambia.
7. **El fixture principal de la 7.1** (`tests/integration/analytics.test.ts`) tiene su cálculo a mano en un comentario, con seis conversaciones. Agregarle mensajes cambiaría valores ya certificados en el cierre de la 7.1. Se resuelve en D-5.
8. **La métrica 11 usa el estado actual**, no el que la conversación tenía durante `I`: el fixture debe incluir una conversación cerrada después de `I`.
9. **El enum `conversation_status`** tiene `open`, `pending` y `closed`. El wireframe 02 los muestra como "Abiertas", "Pendientes" y "Cerradas", en ese orden; los textos son de la 7.4, pero la forma del valor se decide acá (D-4).
10. **Dependencias sin cambios**: las cuatro métricas leen `conversations` y `messages`. Ninguna necesita `crm`, así que `analytics` sigue dependiendo solo de `conversations` y `organizations` (Overview).
11. **Observación fuera de alcance**, ya registrada en el cierre de la 7.1: el bloque de ESLint de `analytics` no le prohíbe importar `next` ni `@/app/*`. No se corrige acá.

## Alcance incluido

1. Registrar la resolución de D-1 a D-6.
2. **`src/modules/analytics/`**: nuevas funciones en `repository.ts` y `service.ts`, exportadas desde `index.ts`. El módulo sigue sin `schema.ts`.
   - Cada función recibe el `AuthContext` y el período como texto, autoriza y resuelve el período con lo que ya existe. `admin` y `viewer` leen.
   - Las funciones, según D-1 a D-4:
     - **`getRespondedConversations`** (métrica 7): conversaciones de `A` con un entrante y un saliente estrictamente posterior, ambos en `I`.
     - **`getResponseCoverage`** (métrica 8): la métrica 7 sobre `|A_in|`, con el numerador y el denominador enteros y el porcentaje sin redondear. Con `|A_in| = 0`, `no_data`.
     - **`getFirstResponseTime`** (métrica 9): mediana del tiempo a la primera respuesta en minutos, sin redondear, con la cantidad de conversaciones de la población y las que no tienen primera respuesta.
     - **`getStatusDistribution`** (métrica 11): conversaciones de `A` agrupadas por su estado actual.
   - Toda consulta filtra por `organization_id` en cada tabla que lee, y ninguna respuesta contiene cuerpos de mensajes, teléfonos ni nombres de clientes.
3. **Tests unitarios** en `service.test.ts`, solo si alguna función pura lo justifica (por ejemplo, el cálculo del porcentaje o la forma de "sin datos"). No se repite lo que ya cubre la integración.
4. **Tests de integración** contra PostgreSQL real, con un fixture sintético propio y su cálculo a mano escrito al lado, según D-5:
   - **valor a mano**: un caso por métrica;
   - **casos que discriminan entre la 7, la 8 y la 9**:
     - entrante y saliente posterior, los dos en `I`: cuenta en la 7;
     - **empate exacto de timestamps**: no cuenta en la 7;
     - saliente anterior al entrante dentro de `I`: no cuenta en la 7;
     - entrante en `I` con la respuesta **posterior al fin de `I`**: no cuenta en la 7, sí aporta su delta a la 9;
     - conversación solo con salientes en `I`: no está en `A_in`, así que no entra en el denominador de la 8;
     - conversación cuyo primer entrante es **anterior a `I`** con actividad dentro: está en `A_in`, no en la población de la 9;
     - salientes proactivos antes del primer entrante: se ignoran en la 9;
     - conversación sin ninguna respuesta: suma a "sin primera respuesta" y no a la mediana;
   - **mediana**: una cantidad par y una impar de deltas;
   - **bordes de zona horaria**: un entrante cerca de la medianoche local, y un delta que cruza el día de 23 horas (19/10/2008) y el de 25 horas (14/03/2009) de Buenos Aires, donde el tiempo transcurrido no coincide con la diferencia de horas de reloj;
   - **métrica 11**: un estado sin conversaciones, y una conversación cerrada después de `I` que aparece como `closed`;
   - **invariantes del catálogo**:
     - la métrica 7 nunca supera `|A_in|`;
     - la cobertura está entre 0 y 100 % y es igual a la métrica 7 sobre `|A_in|`;
     - la suma de los grupos de la métrica 11 es igual a `|A|`;
     - la población de la 9 es igual a las conversaciones con respuesta más las que no la tienen, y no supera `|A_in|`;
   - **sin datos**: un período sin entrantes da `no_data` en la 8 y en la mediana de la 9, nunca `0`;
   - **aislamiento**: los datos de otra organización, en el mismo período, no cambian ningún valor;
   - **autorización**: `viewer` lee lo mismo que `admin`; con la contraseña pendiente, `FORBIDDEN`;
   - **contenido**: la serialización de las cuatro respuestas no contiene datos personales.
5. **Evidencia de mutación**, registrada en el brief. Cada cambio se prueba y se restaura:
   - cambiar el `>` por `>=` en la métrica 7: debe fallar el caso del empate;
   - acotar al período la búsqueda de la primera respuesta en la métrica 9: debe fallar el caso de la respuesta posterior al fin de `I`;
   - usar en la métrica 9 el primer entrante **de `I`** en lugar del de toda la conversación: debe fallar el caso del entrante anterior a `I`;
   - dividir la métrica 8 por `|A|` en lugar de `|A_in|`: debe fallar su valor a mano;
   - omitir los estados sin conversaciones en la métrica 11: debe fallar el caso del estado vacío;
   - quitar el filtro de organización de una de las consultas: debe fallar el aislamiento.
6. **Mediciones** según D-6, sobre la organización de volumen de la base de desarrollo, en solo lectura, con un período de 30 días y otro de 180. Los scripts van en el scratchpad y no se versionan.
7. **Documentación**:
   - MetricsCatalog: estado "implementado" para las métricas 7, 8, 9 y 11, la corrección de redacción del hallazgo 6 y las reglas que fijen D-2 a D-4;
   - Overview: interfaz de `analytics` actualizada;
   - TraceabilityMatrix: índices confirmados con `EXPLAIN` para estas métricas;
   - TestingStrategy: casos cubiertos;
   - RepositoryStructure: fila de la 7.2;
   - Risks, solo si la medición deja un riesgo.

## Alcance excluido

- La métrica 12 y el estado "no disponible" de `RatioMetric` (7.3).
- La pantalla 2, el enlace "Dashboard", el formato de los números, los textos de los estados y los estados de carga y error de las tarjetas, y cualquier cambio en `src/app/` (7.4).
- Revisar o cambiar las métricas 1 a 6 y 10, sus tests y sus valores a mano.
- Tablas de agregados, snapshots o caché ([ADR 0005](0005-metricas-desde-datos-transaccionales.md)).
- Migraciones, índices y cambios en los seeds. Si la medición exige un índice, se activa una condición de detención.
- Cambios en otros módulos y en `eslint.config.mjs` (hallazgo 11).
- Dependencias nuevas, incluida cualquier biblioteca de estadística.
- Historial de transiciones de estado: la métrica 11 usa el estado actual (catálogo).
- Métricas entre organizaciones.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/analytics/repository.ts`, `service.ts`, `index.ts` y `service.test.ts`.
- `tests/integration/analytics-response.test.ts` y `tests/integration/analytics-helpers.ts` (nuevos, según D-5).
- `tests/integration/analytics.test.ts`, **solo** para importar los ayudantes compartidos si D-5 resuelve (a). Ningún valor esperado de la 7.1 cambia.
- Los documentos del punto 7.
- Este brief y su fila en [README.md](README.md).
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [MetricsCatalog.md](../analytics/MetricsCatalog.md): métricas 7, 8, 9 y 11, convenciones, casos límite y validaciones.
2. [FunctionalRequirements.md](../product/FunctionalRequirements.md): FR-MET-01 a 03.
3. [DataModel.md](../architecture/DataModel.md) y [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md), vista 4.
4. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): la excepción de lectura de `analytics`.
5. [Screens.md](../product/Screens.md) §2 y el [wireframe 02](../product/wireframes/02-dashboard.md).
6. [brief-7.1](brief-7.1-metricas-de-volumen.md): período, forma de las métricas, mediana, "sin datos" y umbral de medición. Sus resoluciones se dan por vigentes.
7. Precedentes: [brief-6.3](brief-6.3-servicio-de-consulta-y-estado.md) (consultas y períodos en la zona de la organización) y [brief-6.2](brief-6.2-seeds-sinteticos-de-conversaciones.md) (volumen).

## Dependencias

- 7.1 cerrada (verificado).
- Volumen sembrado en la base de desarrollo (verificado en la 6.2 y la 6.3).
- Autorización para medir contra la base de desarrollo.

## Resolución (2026-09-17)

El usuario aprobó el brief con D-1 a D-6 según la recomendación: (a) en las seis. También autorizó medir con `EXPLAIN ANALYZE` y lecturas contra la base de desarrollo, en solo lectura, y pasar la 7.2 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Métricas 7 y 8: una función o dos

- **Opciones**:
  - (a) **Dos funciones**, una por tarjeta. `getResponseCoverage` calcula su numerador y su denominador en una sola consulta, así que repite el trabajo de `getRespondedConversations`.
  - (b) **Una función** que devuelve las dos métricas, como `getMessageCounts` hace con la 4 y la 5.
- **Recomendación**: (a).
  - El wireframe carga y falla cada tarjeta por separado, y la 7.1 fijó eso en D-1. Con (b), un error deja sin datos a dos tarjetas.
  - La 4 y la 5 comparten función porque son dos agregados de la **misma** consulta. Acá la 8 necesita además `|A_in|`, así que su consulta no es la misma.
  - El costo extra es un agregado más sobre el mismo rango de `messages`, que D-6 mide.
- **Consecuencia**: si llega un mensaje entre las dos lecturas, la tarjeta 7 y el numerador de la 8 pueden diferir en ese mensaje. Ya es la consecuencia aceptada de D-1 de la 7.1 y el catálogo la documenta.

### D-2 — Cómo se acota la población de la métrica 9

- **Opciones**:
  - (a) **Candidatos desde `A`, y después búsquedas por conversación**: las conversaciones con mensajes en `I` salen del índice `(organization_id, sent_at)`; para cada una se busca su primer entrante y su primera respuesta con el índice `(conversation_id, sent_at)`, sin filtro de período; se descartan las que tienen su primer entrante fuera de `I`.
  - (b) **Una sola pasada** sobre todos los mensajes de la organización, con funciones de ventana, y el filtro de `I` aplicado al final.
- **Recomendación**: (a).
  - Es correcta por construcción: una conversación cuyo primer entrante cae en `I` tiene un mensaje en `I`, así que está en `A`. Restringir a `A` no pierde ninguna conversación.
  - Acota el trabajo al período con el índice que ya existe, y las lecturas fuera del período quedan limitadas a las conversaciones candidatas.
  - (b) recorre toda la historia de la organización aunque el período sea de un día.
- **Consecuencia**:
  - la métrica 9 lee mensajes fuera de `I`, y su valor puede cambiar mientras llegan respuestas. El catálogo ya lo anota y la 7.4 lo aclara en pantalla;
  - si la medición muestra que las búsquedas por conversación dominan el tiempo, se activa la condición de detención de D-6.

### D-3 — Forma y unidad del valor de la métrica 9

- **Opciones**:
  - (a) **La mediana es el estado, y los conteos van siempre**: `{ median: RatioMetric<{ minutes: number }>, population: number, withoutResponse: number }`. Sin respuestas, la mediana es `no_data` y la tarjeta igual muestra "N sin primera respuesta".
  - (b) **`RatioMetric` en el nivel de arriba**, como la métrica 6: sin respuestas, todo el valor es `no_data` y se pierde el conteo de conversaciones sin primera respuesta.
- **Unidad**: minutos, sin redondear, calculados desde el intervalo real entre los dos timestamps. La 7.4 los muestra con un decimal.
- **Recomendación**: (a), con la unidad en minutos.
  - El wireframe muestra la mediana y "N sin primera respuesta" en la misma tarjeta, y el caso interesante es justamente el de una población sin ninguna respuesta: con (b) la tarjeta no podría decir cuántas quedaron sin responder.
  - Tiene precedente en la métrica 3, que devuelve el conteo aparte de las conversaciones sin cliente.
- **Consecuencia**: `RatioMetric` se usa anidado; la 7.3 le suma `unavailable` sin que esto cambie.

### D-4 — Métrica 11: estados presentes o todos

- **Opciones**:
  - (a) **Los tres estados del enum, siempre, en su orden de definición** (`open`, `pending`, `closed`), con `0` en los que no tienen conversaciones.
  - (b) **Solo los estados con conversaciones**, y la pantalla completa el resto.
- **Recomendación**: (a).
  - Es la misma regla que la 7.1 aplicó a la serie diaria: los días vacíos llevan `0` explícito y no se omiten.
  - Un estado ausente y un estado en `0` significan lo mismo, y con (b) la pantalla tendría que conocer el enum para no mostrar una lista que cambia de largo.
  - El orden sale del dominio, no de los datos, así que la tarjeta no reordena sus filas según el período.
- **Consecuencia**: si el enum crece, la métrica devuelve el estado nuevo con `0` sin cambios en `analytics`; los textos son de la 7.4.

### D-5 — Fixture y archivo de tests

- **Opciones**:
  - (a) **Archivo nuevo con fixture propio**, y los ayudantes de inserción movidos a `tests/integration/analytics-helpers.ts`, que importan los dos archivos. El fixture y los valores a mano de la 7.1 no se tocan.
  - (b) **Extender el archivo de la 7.1** con un fixture nuevo y los casos nuevos.
  - (c) **Archivo nuevo duplicando los ayudantes**.
- **Recomendación**: (a).
  - Los valores a mano de la 7.1 están certificados en su cierre: un fixture compartido que crece los pone en riesgo en cada subfase.
  - Mover los ayudantes es un cambio mecánico y sin valores esperados, que el propio `npm run test` verifica.
  - (c) duplicaría cerca de cien líneas que las dos subfases necesitan igual.
- **Consecuencia**:
  - los archivos de integración corren en serie, así que uno nuevo suma tiempo a la suite (hoy 648 casos). Se mide y se registra;
  - la 7.3 sigue el mismo criterio.

### D-6 — Medición y umbral

- **Opciones**:
  - (a) **Mismo umbral que la 7.1** (D-5): cada función por debajo de 200 ms, como mediana de 5 corridas en caliente, sobre la organización de volumen, con períodos de 30 y 180 días. Los recorridos completos de `conversations` y `messages` con 180 días **ya están aceptados y registrados** en Risks, así que no vuelven a activar la condición de detención; sí la activan un plan peor que el de la 7.1 para la misma lectura, o un recorrido de `messages` por conversación sin usar `messages_conversation_sent_idx`.
  - (b) **Solo registrar** los tiempos.
- **Recomendación**: (a).
  - Mantiene el criterio que ya se aceptó y evita volver a discutir un resultado conocido.
  - La métrica 9 es la primera que lee fuera del período, así que es donde el umbral sirve de verdad.
- **Consecuencia**:
  - la medición es local y no reemplaza la de staging (Fase 9);
  - si falla, la alternativa (un índice con `direction`, reducir el período máximo, o un snapshot con su ADR) se decide aparte.

## Invariantes

- Toda consulta filtra por `organization_id`, en cada tabla que lee.
- `analytics` solo lee: no escribe ninguna tabla ni abre transacciones de escritura.
- `analytics` solo importa los `schema.ts` de otros módulos y sus interfaces públicas, nunca sus repositorios ni servicios.
- Ninguna respuesta contiene cuerpos de mensajes, teléfonos ni nombres de clientes.
- Los valores se calculan desde los datos transaccionales en cada llamada, sin caché (FR-MET-03, ADR 0005).
- Un denominador cero nunca se presenta como `0`.
- Las resoluciones de la 7.1 no se modifican: período, mediana, redondeo, "sin datos" y una función por tarjeta.
- Sin dependencias, migraciones ni cambios en `src/app/`, en los seeds ni en otros módulos.

## Criterios de aceptación

- **AC-1**: D-1 a D-6 tienen resolución del usuario con fecha.
- **AC-2**: las métricas 7, 8, 9 y 11 tienen cada una su test con el valor calculado a mano y sus invariantes probados, incluidos el empate de timestamps, la respuesta posterior al fin de `I`, el primer entrante anterior a `I`, el delta que cruza un cambio de horario y el estado vacío. Todo pasa contra PostgreSQL real.
- **AC-3**: las mutaciones del punto 5 quedan registradas: cada una hace fallar el caso previsto.
- **AC-4**: las mediciones del punto 6 quedan registradas y cumplen D-6, o la condición de detención queda resuelta por el usuario.
- **AC-5**: `npm run test` pasa completo, y los casos de la 7.1 siguen siendo los mismos, con sus valores esperados intactos.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-7**: `npm run test:e2e` sigue pasando 65 de 65.
- **AC-8**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`, incluidos sus pasos.
- **AC-9**: `git status` muestra solo archivos autorizados, y los documentos del punto 7 reflejan las resoluciones.

## Pruebas y evidencia requerida

- **`deterministic`**: `npm run test`, con los tests de integración contra PostgreSQL 18.6 real y fixtures sintéticos declarados como tales.
- **Mutación**: los seis casos del punto 5.
- **Medición**: `EXPLAIN` y tiempos, declarados como locales.
- **CI**: ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para las métricas 7, 8, 9 y 11.

**No se valida**:

- la presentación de las métricas (7.4);
- la métrica 12 (7.3);
- el rendimiento con varias organizaciones o en staging (Fase 9);
- valores con datos reales: no hay emisor conectado.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si una medición supera el umbral de D-6, si aparece un plan peor que el de la 7.1 para la misma lectura, o si hace falta un índice, una migración o un snapshot.
- Si una fórmula del catálogo resulta ambigua frente a un caso del fixture, más allá de lo que resuelven D-2 a D-4. Se consulta; no se elige en silencio.
- Si un valor esperado de la 7.1 necesita cambiar, o si hace falta tocar sus tests más allá del movimiento mecánico de D-5.
- Si `analytics` necesita leer una tabla de un módulo que no está en sus dependencias, o un repositorio ajeno.
- Si aparece la necesidad de tocar `src/app/`, los seeds, otro módulo o una dependencia.
- Antes de medir contra la base de desarrollo, y antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-17)

La implementación está terminada y ninguna condición de detención quedó activa.

### Interfaz agregada

`getRespondedConversations`, `getResponseCoverage`, `getFirstResponseTime` y `getStatusDistribution`, con los tipos `ResponseCoverage`, `FirstResponseTime` y `StatusDistribution`. Las cuatro reutilizan el envoltorio de la 7.1, así que autorizan y resuelven el período igual que las métricas de volumen.

### Ajuste dentro del alcance

La consulta de la métrica 9 materializa el CTE del primer entrante (`with first_inbound as materialized (…)`). Sin eso, PostgreSQL lo inlinea y repite esa subconsulta una vez por cada condición que la filtra: el plan mostraba dos ejecuciones (SubPlan 20 y 22) con 9.960 y 9.767 búsquedas por índice. Materializado, el resultado es idéntico y el tiempo baja a la mitad. Es un cambio de la consulta nueva, sin índices ni migraciones.

### Evidencia

- `npm run test`: **665 de 665** (648 de la 7.1 más los 17 casos nuevos), con los tests de integración contra PostgreSQL 18.6 real.
- `npm run typecheck`, `npm run lint` y el chequeo de formato pasan; `npm run db:generate` no produce migraciones.
- Los 25 casos de la 7.1 quedaron con sus valores esperados intactos: el único cambio en su archivo fue importar los ayudantes compartidos.

### Errores propios que encontraron los tests y la medición

- Ninguno en los valores calculados a mano: los 17 casos pasaron en la primera corrida. Las fechas y los instantes del cambio de horario se confirmaron antes en la base de zonas (`01:30Z` y `02:30Z` del 15/03/2009 son las dos 23:30 locales del 14/03).
- Dos errores en scripts de medición del scratchpad, no en el código: una consulta de exploración con un producto cartesiano, cancelada con `pg_cancel_backend`, y un intento de crear una vista temporal en una sesión de solo lectura.

### Mutaciones

Cada una se aplicó sola y se restauró, verificando el archivo con `cmp`.

| Mutación | Casos que fallan | Previsto |
|---|---|---|
| `>=` en lugar de `>` en la métrica 7 | 4, entre ellos el empate de timestamps | sí |
| Primera respuesta de la métrica 9 acotada al período | 2: la mediana del fixture y el día de 23 horas | sí |
| Primer entrante de `I` en lugar del de toda la conversación (métrica 9) | 1: el fixture, por la conversación con su primer entrante antes de `I` | sí |
| Métrica 8 dividida por `\|A\|` | 2: su valor a mano y el caso "sin datos" | sí |
| Métrica 11 sin los estados en `0` | 3, entre ellos el estado vacío | sí |
| Sin filtro de organización en la métrica 11 | **ninguno** | no |
| Sin filtro de organización en la métrica 8 | 2, entre ellos el aislamiento | sí |

**Defensa doble en la métrica 11**: quitarle el filtro de organización no cambia ningún valor, porque las conversaciones ya vienen acotadas por el subconjunto de `messages`, que sí filtra por organización, y un id de conversación es único en toda la tabla. Es un hallazgo, no una falta de cobertura: el aislamiento de esa lectura lo protege el filtro del subconjunto, y la mutación equivalente sobre la métrica 8 sí falla.

### Mediciones

Organización de volumen de la base de desarrollo (10.000 conversaciones y 65.260 mensajes, del 18/03/2026 al 15/09/2026), en solo lectura: la sesión rechazó una escritura con `25006` antes de medir. Mediana de 5 corridas en caliente, sobre las funciones del repositorio.

| Métrica | 30 días | 180 días |
|---|---|---|
| 7 Conversaciones respondidas | 4,8 ms | 16,3 ms |
| 8 Cobertura de respuesta | 4,3 ms | 14,8 ms |
| 9 Mediana de primera respuesta | 16,3 ms | 75,6 ms |
| 11 Distribución por estado | 4,7 ms | 12,0 ms |

Antes de materializar el CTE, la métrica 9 daba 55,2 ms con 30 días y **199,5 ms con 180** (máximo de 211,4), es decir, contra el umbral. Las cuatro funciones quedan ahora muy por debajo de los 200 ms de D-6.

Planes con `EXPLAIN (ANALYZE, BUFFERS)`, con las consultas transcritas con literales y verificadas contra los valores que devuelve el código:

- las búsquedas por conversación de la métrica 9 usan `messages_conversation_sent_idx`, una por conversación candidata: es lo que D-2 buscaba, y no hay recorrido de `messages` por conversación;
- con 180 días, las cuatro métricas recorren `messages` completa, y la 11 también `conversations`: es el resultado ya aceptado y registrado en Risks en la 7.1, por la distribución de los datos de esa única organización;
- se vuelve a medir con varias organizaciones en staging (Fase 9).
