---
schema: task-brief.v1
task_id: 7.3
task_type: implementation
generated_at: 2026-09-17
---

# Brief: 7.3 — Métrica de errores de ingestión

## Objetivo

Sumar al módulo `analytics` la métrica 12 de [MetricsCatalog.md](../analytics/MetricsCatalog.md): conteo de eventos de ingestión fallidos por origen y código de error, más la tasa de fallos sobre el total de eventos recibidos en el período. Con ella, `RatioMetric` gana su tercer estado, **"no disponible"**, distinto de "sin datos" y de `0`.

Todo se valida **localmente y en CI**. Esta subfase no crea pantallas, Server Actions ni endpoints, y no reabre ninguna decisión de la 7.1 ni de la 7.2.

## Ubicación en la Fase 7

- **Orden previsto**: 7.1 → 7.2 → **7.3** → 7.4.
- **Notion**: tarea "7.3 — Métrica de errores de ingestión", descripción "S. Métrica 12: conteo y tasa de eventos failed de `ingestion_events` por origen y código de error (brief-6.5.1, D-6). La ingestión existe desde la 6.5, sin emisor real conectado". Estado "Bandeja de Entrada" al escribir este brief (verificado el 2026-09-17).
- **Necesario ahora**:
  - la métrica 12 en la interfaz pública de `analytics`, con la forma que fijaron la 7.1 y la 7.2;
  - el estado "no disponible" y su origen;
  - sus tests de fixture, invariantes y bordes.
- **Lo que llega después**: la pantalla 2, con el enlace "Dashboard", el formato de los valores y los estados de carga y error de cada tarjeta (7.4). Es la primera subfase de la fase que toca `src/app/`.
- **Con esto se completa el catálogo**: las 12 métricas quedan implementadas, que es el criterio de aceptación de la Fase 7 en el [Roadmap](../planning/Roadmap.md).
- **Gates de entrada**:
  1. 7.2 cerrada, con la CI en verde en `afb99d9` ([ejecución 35266463066](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35266463066)) y el cierre `ccfb6c3` también en verde ([ejecución 35267104154](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35267104154)). Verificado el 2026-09-17.
  2. 6.5.2 cerrada, que es la dependencia que fija el Roadmap para esta subfase.
  3. Contenedor de PostgreSQL en marcha.

## Hallazgos de la verificación previa (2026-09-17)

1. **Estado**: `main` está limpio en `ccfb6c3`, igual que `origin/main`. `analytics` tiene las métricas 1 a 11 menos la 12.
2. **La tabla ya sostiene la métrica**, sin necesidad de migración:
   - `ingestion_events` tiene `status` (`received`, `processed`, `failed`), `source`, `error_code`, `received_at` y `organization_id`;
   - un `CHECK` garantiza que `error_code` no es nulo **si y solo si** el estado es `failed`, así que agrupar por código no necesita tratar nulos dentro de los fallidos;
   - el índice `ingestion_events_organization_received_idx` `(organization_id, received_at)` está creado desde la 6.1, y su comentario ya dice "Métrica 12".
3. **La métrica mide menos de lo que su nombre sugiere, y es a propósito** (brief-6.5.1, D-6): solo los eventos que el CRM aceptó procesar dejan fila. Un payload inválido, una credencial inválida o un exceso de tasa se rechazan **sin fila**, así que no cuentan ni en el numerador ni en el denominador. Hoy el único código de negocio que se registra como `failed` es `CONFLICT`. El catálogo ya lo dice en "Alcance"; la pantalla lo aclara en la 7.4.
4. **La base de desarrollo tiene cero eventos de ingestión y ninguna credencial**, así que no hay volumen con el que medir esta métrica como se midieron las otras once. Se resuelve en D-4.
5. **La disponibilidad no sale de los datos** (wireframe 02 y 1.2, D-7): "No disponible" viene de la configuración del entorno. Pero el texto del catálogo dice "mientras el módulo de ingestión no exista en el entorno", y desde la 6.5 el módulo **sí** existe: lo que puede faltar es la configuración que enciende el endpoint. Hace falta fijar qué significa exactamente "no disponible" ahora. Se resuelve en D-1, y el catálogo se ajusta con esa resolución.
6. **`readIngestionConfig(env)` es una función pura** de la interfaz pública de `ingestion`, que devuelve `{ enabled: false, invalid }` tanto si la ingestión está apagada como si su configuración es inválida. El endpoint está apagado por defecto (`INGESTION_ENABLED`), así que en desarrollo la ingestión hoy está apagada.
7. **`analytics` gana una tercera dependencia**, `ingestion`, la primera sobre un módulo que no leía. La frontera ya lo permite: su bloque de ESLint le deja importar los `schema.ts` ajenos, y las interfaces públicas nunca estuvieron prohibidas. Overview se actualiza.
8. **`ingestion_events` no se borra ni se modifica** (ADR 0013, con su trigger): el fixture inserta por SQL con el rol dueño, como ya hacen los tests de esquema de la 6.1. El reset de la base de test vacía la tabla entre casos.
9. **Observación fuera de alcance**, pendiente desde la 7.1: el bloque de ESLint de `analytics` no le prohíbe importar `next` ni `@/app/*`. No se corrige acá.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. **`src/modules/analytics/`**: `getIngestionErrors` en `service.ts`, su lectura en `repository.ts` y su export en `index.ts`.
   - `RatioMetric` gana el estado `unavailable`, como estaba previsto desde la 7.1 (D-4). Los dos estados existentes no cambian de forma.
   - La función autoriza y resuelve el período con lo que ya existe. `admin` y `viewer` leen.
   - Devuelve, según D-2 y D-3: el total de eventos del período, los fallidos, la tasa sin redondear y los grupos por `source` y `error_code`.
   - La consulta filtra por `organization_id` y lee solo `ingestion_events`, desde `ingestion/schema`.
   - Ninguna respuesta contiene payloads, credenciales, encabezados ni datos personales: solo códigos normalizados, orígenes y conteos.
3. **Tests unitarios** en `service.test.ts` para la parte pura que decida D-1 (la lectura de la configuración y su traducción a "no disponible"), incluida una configuración inválida.
4. **Tests de integración** contra PostgreSQL real, en su propio archivo y con su propio fixture, siguiendo la convención que fijó la 7.2 (D-5): el fixture lleva su cálculo a mano en un comentario y no se toca el de ninguna subfase cerrada.
   - **valor a mano**: conteo por origen y código, total y tasa;
   - **bordes del período**: un evento en el inicio exacto, que cuenta, y otro en el fin exacto, que no;
   - **estados**: los `received` y `processed` cuentan en el denominador y no en el numerador;
   - **agrupación**: dos orígenes y dos códigos, con un grupo de un solo evento y otro de varios;
   - **sin datos**: un período sin ningún evento da "sin datos" en la tasa, nunca `0 %`;
   - **no disponible**: con la ingestión apagada, según D-1, la métrica es "no disponible" y no `0`, y el test distingue los tres estados entre sí;
   - **invariantes**: los fallidos no superan el total; la suma de los grupos es igual a los fallidos; la tasa es el cociente y está entre 0 y 100 %;
   - **zona horaria**: el período se interpreta en la zona de la organización, con un evento cerca de la medianoche local;
   - **aislamiento**: los eventos de otra organización, en el mismo período, no cambian ningún valor;
   - **autorización**: `viewer` lee lo mismo que `admin`; con la contraseña pendiente, `FORBIDDEN`;
   - **contenido**: la serialización no contiene payloads ni credenciales.
5. **Evidencia de mutación**, registrada en el brief. Cada cambio se prueba y se restaura:
   - contar todos los estados como fallidos: debe fallar el valor a mano;
   - dividir la tasa por los fallidos en lugar del total: debe fallar la tasa y su invariante;
   - agrupar solo por `error_code`, ignorando el origen: debe fallar el caso de los dos orígenes;
   - quitar el filtro de organización: debe fallar el aislamiento;
   - devolver `no_data` en lugar de `unavailable` con la ingestión apagada: debe fallar el caso que los distingue.
6. **Medición** según D-4.
7. **Documentación**:
   - MetricsCatalog: estado "implementada" para la métrica 12, la redacción de la disponibilidad según D-1 y la forma de los grupos según D-3;
   - Overview: interfaz de `analytics` y su dependencia nueva de `ingestion`;
   - TraceabilityMatrix: lo que muestre la medición de D-4;
   - TestingStrategy: casos cubiertos;
   - RepositoryStructure: fila de la 7.3;
   - Risks: la falta de medición con volumen de esta métrica, si D-4 la deja abierta.

## Alcance excluido

- La pantalla 2, el formato de los valores, los textos de los tres estados y cualquier cambio en `src/app/` (7.4).
- Revisar o cambiar las métricas 1 a 11, sus tests y sus valores a mano.
- Cambios en el módulo `ingestion`: la métrica solo lee. Nada de columnas de resultado nuevas, ni de registrar los rechazos que hoy no dejan fila (eso sería cambiar el contrato, brief-6.5.1, D-6).
- Seeds de eventos de ingestión, para el dashboard o para los end-to-end.
- Migraciones e índices. Si la medición exige uno, se activa una condición de detención.
- Tablas de agregados, snapshots o caché ([ADR 0005](0005-metricas-desde-datos-transaccionales.md)).
- Cambios en `eslint.config.mjs` (hallazgo 9) y en otros módulos.
- Dependencias nuevas.
- Alertas, notificaciones o cualquier reacción automática a un error de ingestión.

## Archivos o componentes autorizados

Lista cerrada:

- `src/modules/analytics/repository.ts`, `service.ts`, `index.ts` y `service.test.ts`.
- `tests/integration/analytics-ingestion.test.ts` (nuevo) y `tests/integration/analytics-helpers.ts`, si hace falta sumarle un ayudante para insertar eventos.
- Los documentos del punto 7.
- Este brief y su fila en [README.md](README.md).
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar.

## Fuentes de verdad

1. [MetricsCatalog.md](../analytics/MetricsCatalog.md): métrica 12, convenciones y validaciones.
2. [contracts/ingestion-v1.md](../contracts/ingestion-v1.md) y [brief-6.5.1](brief-6.5.1-contrato-de-ingestion.md), D-6: qué deja fila y qué no.
3. [DataModel.md](../architecture/DataModel.md) y [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md), vista 4.
4. [Overview.md](../architecture/Overview.md) y [RepositoryStructure.md](../architecture/RepositoryStructure.md): la frontera de `analytics`.
5. [Screens.md](../product/Screens.md) §2 y el [wireframe 02](../product/wireframes/02-dashboard.md), con el origen de "No disponible" (1.2, D-7).
6. [brief-7.1](brief-7.1-metricas-de-volumen.md) y [brief-7.2](brief-7.2-metricas-de-respuesta-y-estado.md): período, forma de las métricas, "sin datos", fixture propio y umbral de medición. Sus resoluciones se dan por vigentes.
7. [brief-6.5.3](brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md), D-4: la configuración que enciende la ingestión.

## Dependencias

- 7.2 cerrada (verificado).
- 6.5.2 cerrada, dependencia del Roadmap (verificado).

## Resolución (2026-09-17)

El usuario aprobó el brief con D-1 a D-4 según la recomendación: (a) en las cuatro. También autorizó pasar la 7.3 a "En proceso" en Notion con su fila en el índice de decisiones, y escribir eventos sintéticos en la base de **test** para medir, que es la opción (b) de D-4.

Con esa última autorización, D-4 se ejecuta como (a) **más** (b): el `EXPLAIN` con la tabla vacía y la entrada en Risks que fija la recomendación, y además la medición con volumen sintético en la base de test. La entrada de Risks queda igual: un volumen sintético en local no reemplaza la medición de staging.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Qué significa "no disponible", y quién lo decide

- **Opciones**:
  - (a) **La configuración, y además sin eventos en el período**: la métrica es `unavailable` cuando la ingestión no está configurada en el entorno (`readIngestionConfig` devuelve `enabled: false`, también por configuración inválida) **y** el período no tiene ningún evento. Si hay eventos, se muestran, aunque hoy el endpoint esté apagado.
  - (b) **Solo la configuración**: apagada la ingestión, la métrica es `unavailable` sin mirar los datos.
  - (c) **Lo decide quien llama** (la 7.4): `analytics` solo calcula sobre datos y nunca devuelve `unavailable`.
- **Recomendación**: (a).
  - El propósito del estado es no sugerir que no hubo errores cuando nadie los estaba registrando. Con (a) eso se cumple, y además nunca esconde eventos que existen: un operador que apaga el endpoint después de un incidente sigue viendo los fallos de ese período, que es justo cuando los necesita.
  - Con (b), apagar el endpoint borra de la vista errores reales ya registrados.
  - Con (c), el tipo no obliga a nadie a tratar el estado y el wireframe pierde la distinción entre "Sin datos" y "No disponible", que es lo que la 7.1 decidió representar en el tipo (D-4).
  - `readIngestionConfig` recibe el entorno por parámetro, así que la parte que decide es pura y se prueba sin tocar variables de entorno globales.
- **Consecuencia**:
  - `analytics` importa la interfaz pública de `ingestion`, además de su `schema.ts`; queda registrado en Overview;
  - la métrica lee la configuración en cada llamada, como el endpoint (6.5.3, D-4): un cambio de configuración no necesita reiniciar nada;
  - en el entorno de desarrollo actual, sin eventos y con la ingestión apagada, la tarjeta dirá "No disponible". Es lo correcto: no hay ingestión configurada;
  - el catálogo cambia "mientras el módulo de ingestión no exista en el entorno" por la regla exacta que fije esta decisión.

### D-2 — Forma del valor

- **Opciones**:
  - (a) **Tres estados en el nivel de arriba**: `RatioMetric<{ total, failed, percentage, groups }>` más `unavailable`. Con `total = 0` es `no_data`, y ahí no hay grupos que mostrar, porque los fallidos son un subconjunto del total.
  - (b) **Los grupos aparte del estado**, como hizo la métrica 9 con su conteo de conversaciones sin respuesta.
- **Recomendación**: (a).
  - Acá no se pierde información: si el denominador es cero, no hay ni un evento, así que no hay grupos ni conteos que mostrar. Es distinto de la métrica 9, donde "sin respuesta" era justamente el dato interesante cuando la mediana no existía.
  - Deja `RatioMetric` como único tipo de estado de las métricas, con sus tres casos, y la 7.4 lo trata una vez.
- **Consecuencia**: el tipo `RatioMetric` se amplía con `unavailable`; las métricas 6, 8 y 9 no lo usan y no cambian, pero la 7.4 tiene que cubrir el caso al tratar el tipo.

### D-3 — Forma y orden de los grupos

- **Opciones**:
  - (a) **Una lista de filas** `{ source, errorCode, count }`, ordenada por `count` descendente y, a igual conteo, por `source` y `errorCode` alfabéticos. Solo aparecen las combinaciones con al menos un evento.
  - (b) **Un objeto anidado** por origen, con sus códigos dentro.
- **Recomendación**: (a).
  - La tarjeta muestra una lista corta, y ordenar por conteo pone arriba lo que importa; el desempate alfabético la hace determinista, que es lo que los tests necesitan.
  - A diferencia de los estados de conversación (7.2, D-4), el código de error y el origen son taxonomías **abiertas**: no existe el conjunto completo para rellenar con ceros, así que solo se listan los presentes.
  - (b) obliga a la pantalla a recorrer dos niveles para mostrar una lista plana.
- **Consecuencia**:
  - la cantidad de grupos no está acotada por el dominio. Hoy solo se registra un código, así que no se agrega un límite; si más adelante crece, el recorte es de la pantalla (7.4);
  - el catálogo registra el orden como parte de la definición.

### D-4 — Medición sin volumen

- **Opciones**:
  - (a) **Registrar que no hay medición representativa**: se corre `EXPLAIN` sobre la base de desarrollo, con la tabla vacía, para confirmar que la consulta usa el índice previsto cuando haya filas, y se anota en Risks que esta métrica queda sin medición de volumen hasta staging (Fase 9), junto con las otras once.
  - (b) **Crear volumen sintético de eventos** en la base de test desde un script del scratchpad, medir ahí y dejar registrado el resultado.
- **Recomendación**: (a).
  - Es la consulta más simple de las doce: un agregado sobre una sola tabla, con un rango sobre su índice y sin subconsultas ni uniones. El riesgo que justificaba medir en la 7.1 y la 7.2 —lecturas que cruzan tablas o salen del período— acá no existe.
  - Con la tabla vacía, cualquier número sería ruido: PostgreSQL elige el plan por las estadísticas, y las de una tabla vacía no dicen nada de la de producción.
  - (b) construye un volumen que ninguna otra parte del proyecto usa, y `ingestion_events` no se puede borrar (ADR 0013), así que esas filas quedarían en la base de test hasta el siguiente reset.
- **Consecuencia**:
  - queda una entrada en Risks con nombre propio: la métrica 12 nunca se midió con datos;
  - si el usuario prefiere la evidencia, (b) está disponible y no cambia el código, solo agrega una medición y su tabla en el brief.

## Invariantes

- Toda consulta filtra por `organization_id`.
- `analytics` solo lee: no escribe ninguna tabla ni abre transacciones de escritura.
- `analytics` solo importa los `schema.ts` de otros módulos y sus interfaces públicas, nunca sus repositorios ni servicios internos.
- Ninguna respuesta contiene payloads, credenciales, encabezados, cuerpos de mensajes, teléfonos ni nombres de clientes.
- Los valores se calculan desde los datos transaccionales en cada llamada, sin caché (FR-MET-03, ADR 0005).
- Un denominador cero nunca se presenta como `0`, y "no disponible" nunca se presenta como `0` ni como "sin datos".
- La métrica no cambia el contrato de ingestión ni lo que este registra.
- Sin dependencias, migraciones ni cambios en `src/app/`, en los seeds ni en otros módulos.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: la métrica 12 tiene su test con el valor calculado a mano, sus invariantes, los bordes del período, la agrupación por origen y código, la zona horaria, el aislamiento y la autorización. Todo pasa contra PostgreSQL real.
- **AC-3**: un test distingue los tres estados entre sí: valor, "sin datos" y "no disponible".
- **AC-4**: las mutaciones del punto 5 quedan registradas: cada una hace fallar el caso previsto, o se registra como defensa redundante con su explicación.
- **AC-5**: `npm run test` pasa completo, y los casos de la 7.1 y la 7.2 siguen con sus valores esperados intactos.
- **AC-6**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-7**: `npm run test:e2e` sigue pasando 65 de 65.
- **AC-8**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`, incluidos sus pasos.
- **AC-9**: `git status` muestra solo archivos autorizados, y los documentos del punto 7 reflejan las resoluciones, incluida la entrada de Risks que deje D-4.

## Pruebas y evidencia requerida

- **`deterministic`**: `npm run test`, con los tests de integración contra PostgreSQL 18.6 real y fixtures sintéticos declarados como tales.
- **Mutación**: los cinco casos del punto 5.
- **Plan de consulta**: `EXPLAIN` según D-4, declarado como local y sin volumen.
- **CI**: ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para la métrica 12.

**No se valida**:

- la presentación de la métrica ni de sus tres estados (7.4);
- el rendimiento de esta métrica con datos, en ningún volumen (Fase 9);
- el comportamiento con un emisor real conectado: no hay ninguno, así que los eventos fallidos del fixture son sintéticos;
- que la taxonomía de códigos de error sea completa: hoy el contrato solo registra rechazos de negocio.

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si la métrica necesita un índice, una migración o un cambio en `ingestion`, incluido registrar rechazos que hoy no dejan fila.
- Si `EXPLAIN` muestra que la consulta no puede usar el índice previsto por la forma en que está escrita.
- Si la definición del catálogo resulta ambigua frente a un caso del fixture, más allá de lo que resuelven D-1 a D-3. Se consulta; no se elige en silencio.
- Si un valor esperado de la 7.1 o de la 7.2 necesita cambiar, o si hace falta tocar sus tests más allá de sumar un ayudante compartido.
- Si "no disponible" no se puede decidir sin leer variables de entorno globales dentro de `analytics`.
- Si aparece la necesidad de tocar `src/app/`, los seeds, otro módulo o una dependencia.
- Antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-17)

### Lo que se implementó

- `repository.ts`: `ingestionErrors`, una sola consulta que devuelve el total del período, los fallidos y los grupos ya ordenados. Los tres salen de la misma lectura, así que la tasa y los grupos no pueden discrepar entre sí. Solo se leen `status`, `source` y `error_code`: la referencia externa, el hash del payload y el tipo de evento no salen de la base.
- `service.ts`: `RatioMetric` suma `unavailable`; `isIngestionUnavailable(config, totalEvents)` es la parte pura de D-1, y `getIngestionErrors` recibe el entorno por parámetro, con `process.env` por defecto.
- `index.ts`: se exportan `getIngestionErrors`, `isIngestionUnavailable` y los tipos `IngestionErrors` e `IngestionErrorGroup`.
- Tests: 11 casos de integración en `tests/integration/analytics-ingestion.test.ts` con fixture propio, y 4 unitarios de la decisión de disponibilidad. Los de la 7.1 y la 7.2 no se tocaron. Total del proyecto: **680 pasan**, y los 65 end-to-end siguen pasando.

### Error del cálculo a mano

El primer caso que falló fue el del evento cercano a la medianoche local, y el error estaba en el cálculo, no en el código: el día local 02/09 es `[02/09 03:00Z, 03/09 03:00Z)`, así que **dos** eventos del 03/09 en UTC caen en él —E3 a las 02:30Z y E7 a la 01:00Z—, y el total es 6, no 5. Se corrigió el valor esperado y se registró el error, sin tocar el código para que coincidiera.

### Evidencia de mutación

Cada mutación se aplicó sola, se corrieron los tests de la métrica 12 y se restauró el archivo.

| Mutación | Tests que fallaron |
|---|---|
| Contar todos los estados como fallidos | 3: el valor a mano, los invariantes y el día local |
| Dividir la tasa por los fallidos en lugar del total | 2: el valor a mano y los invariantes |
| Agrupar solo por `error_code`, ignorando el origen | 2: la agrupación y el día local |
| Quitar el filtro de organización de la consulta | 4, entre ellos el de aislamiento |
| Devolver `no_data` en lugar de `unavailable` | 2: el que distingue los tres estados y el de la zona horaria |

Ninguna resultó una defensa redundante: las cinco hicieron fallar los casos previstos.

### Medición (D-4, opciones (a) y (b))

**Con la tabla vacía, en la base de desarrollo y en solo lectura** (`default_transaction_read_only=on`): `EXPLAIN (VERBOSE, COSTS OFF)` muestra un único `Index Scan using ingestion_events_organization_received_idx`, con la organización y los dos extremos del período en el `Index Cond`. El CTE de los eventos se calcula una vez y lo leen las tres agregaciones: PostgreSQL lo materializa solo, porque tiene más de una referencia. Es el caso opuesto al de la métrica 9 de la 7.2, donde el CTE de un solo uso había que materializarlo a mano.

**Con volumen sintético en la base de test**, autorizado por el usuario: 200.011 eventos en tres organizaciones sobre 120 días, con 34.895 en un período de 30 días de la organización medida y 15.393 fallidos en total.

| Corrida | 1 | 2 | 3 | 4 | 5 | Mediana |
|---|---|---|---|---|---|---|
| Tiempo de ejecución (ms) | 23,8 | 25,8 | 27,7 | 26,2 | 28,4 | **26,2** |

El plan con volumen mantiene el índice previsto (`Bitmap Index Scan` con las tres condiciones), 3.959 buffers, todos en caché, y el mayor costo es recorrer el CTE materializado tres veces, no las búsquedas por índice. Queda muy por debajo del umbral de 200 ms que fijó la 7.1.

Las dos mediciones son **locales y sintéticas**: la de la tabla vacía no dice nada del plan con datos, y la del volumen usa una distribución uniforme que no es la de producción. La entrada de Risks lo registra y la Fase 9 lo vuelve a medir. Los datos de la medición se borraron de la base de test al terminar, y la base de desarrollo no se escribió: siguió con 0 eventos.

### Nivel de validación alcanzado

**Validado localmente** para la métrica 12, con fixtures sintéticos declarados como tales. Falta la verificación de la CI, que necesita autorización para commit y push.

### Pendientes registrados

- La métrica 12 nunca se midió con datos reales de ingestión (Risks, Fase 9).
- El bloque de ESLint de `analytics` no le prohíbe importar `next` ni `@/app/*` (hallazgo 9, fuera de alcance).
