---
schema: task-brief.v1
task_id: 6.2
task_type: implementation
generated_at: 2026-09-16
---

# Brief: 6.2 — Seeds sintéticos de conversaciones

## Objetivo

1. Sumar al seed de desarrollo clientes, conversaciones y mensajes sintéticos, legibles, que cubran los casos que las pantallas 6 a 9 y las métricas necesitan ver:
   - conversaciones sin cliente;
   - los tres estados;
   - bordes de zona horaria;
   - cuerpos que la UI tiene que escapar.
2. Crear un seed de volumen (requisito de rendimiento de [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): hasta ~10.000 filas por organización) para paginar y medir las consultas de la 6.3.
3. Garantizar en los dos seeds los invariantes que la base no puede verificar: `started_at` es el `sent_at` del primer mensaje y `last_message_at` el del último. Validarlo **localmente y en CI**.

Esta subfase solo carga datos: no crea servicios, consultas de negocio, pantallas ni lógica de ingestión.

## Ubicación en la Fase 6

- **Orden previsto**: 6.1 (cerrada) → **6.2** → 6.3 → 6.4, con 6.5.1 → 6.5.2 → 6.5.3 en paralelo.
- **Notion**: "S. Seeds básico y de volumen, con bordes de zona horaria y conversaciones sin cliente". Estado: "Bandeja de Entrada".
- **Necesario ahora**: los dos seeds, sus tests y su documentación.
- **Lo que llega después**:
  - las consultas y su `EXPLAIN` sobre el volumen (6.3);
  - las pantallas que muestran estos datos (6.4);
  - los fixtures de cada métrica, con su valor calculado a mano (Fase 7, [MetricsCatalog](../analytics/MetricsCatalog.md)): son fixtures de test, no este seed.
- **Fuera de esta fase**:
  - el volumen de productos (D-4);
  - los datos de staging (Fase 9).
- **Gates de entrada**:
  1. 6.1 cerrada, con la CI en verde en `7d428c7`. Verificado el 2026-09-16.
  2. Contenedor de PostgreSQL en marcha.
  3. **Autorización para ejecutar los seeds** contra la base local de desarrollo. Las bases `_test` y `_e2e` se recrean solas.

## Hallazgos de la verificación previa (2026-09-16)

1. **Estado**: `main` limpio en `7d428c7`, igual que `origin/main`. `seeds/` solo tiene `basic.ts` (3.5). Crea una organización y tres usuarios con ids fijos y `ON CONFLICT DO UPDATE`, y se niega a correr fuera de una base `_dev`, `_test` o `_e2e`.
2. **Los end-to-end reponen el seed básico antes de cada caso.** `clients.spec.ts` vacía `clients` y llama a `seedBasic`, y su caso 1 espera "Todavía no hay clientes". Si `seedBasic` creara clientes, ese caso fallaría. Se resuelve en D-1.
3. **`messages` es de solo inserción (6.1, D-3).** Un seed idempotente no puede corregir un mensaje en una segunda corrida, ni borrarlo, salvo con `TRUNCATE` de toda la tabla. Las fechas relativas a "hoy" chocan con esa regla: al día siguiente, `started_at` y los mensajes ya no coinciden con lo que calcularía el seed. Se resuelve en D-2.
4. **La coherencia entre filas no tiene constraint**: `started_at` igual al primer `sent_at`, y `last_message_at` igual al último (DataModel, MetricsCatalog, TestingStrategy). La garantizan los productores; el seed es el primero.
5. **Volumen**:
   - RepositoryStructure y TestingStrategy prevén un seed de volumen para paginación y rendimiento que todavía no existe;
   - NonFunctionalRequirements fija la referencia en ~10.000 filas por organización para productos, clientes y conversaciones;
   - TraceabilityMatrix dice que "desde la Fase 4" cada consulta se confirma con `EXPLAIN` sobre ese seed. No se hizo en las Fases 4 y 5: es una discrepancia documental.
   Se resuelve en D-3 y D-4.
6. **ADR 0010**: un usuario pertenece a una sola organización. Ver una organización distinta de la del seed básico exige un usuario propio.
7. **Zona horaria**: la organización del seed usa el default `America/Argentina/Buenos_Aires`, sin horario de verano desde 2009. MetricsCatalog pide un mensaje cerca de la medianoche local que en UTC cae en otro día, y un día con cambio de horario tomado de una fecha histórica de esa zona. La 4.3.3 ya usó el 19/10/2008, un día de 23 horas.
8. **`external_ref`**: los seeds no son eventos de ingestión. Con `external_ref` nulo, sus filas no se confunden con las que cree la 6.5.2 y no ocupan sus unicidades. La idempotencia se sostiene con ids fijos. `ingestion_events` no se siembra: es de la 6.5.2 y de los fixtures de la métrica 12.
9. **Sin dependencias nuevas**: los datos del volumen se generan con un generador pseudoaleatorio con semilla fija, escrito en el propio seed, sin `faker`.
10. **Dependencias entre módulos**: `seeds/basic.ts` ya importa `schema.ts` de `auth` y `organizations`. Los seeds nuevos importan los de `crm` y `conversations` e insertan directo, sin servicios ni auditoría, igual que el básico. Los datos sintéticos no son cambios de un usuario.

## Alcance incluido

1. Registrar la resolución de D-1 a D-4.
2. **`seeds/conversations.ts`**, según D-1 y D-2: `seedConversations(db, { referenceDate })` sobre la organización del seed básico, con ids fijos. Crea:
   - **clientes**: unos seis, con y sin teléfono, uno inactivo; teléfonos E.164 sintéticos (`+54 9 11 5555-…`);
   - **conversaciones**: unas diez, con los estados `open`, `pending` y `closed`. Entre ellas:
     - dos sin cliente;
     - una con solo mensajes salientes (proactiva);
     - una cuyo primer entrante no tiene respuesta;
     - una que cruza la medianoche local;
     - una con un mensaje entre las 21:00 y las 23:59 locales, que en UTC cae al día siguiente;
     - una del cliente inactivo;
     - una con mensajes el 19/10/2008 (día de 23 horas en Buenos Aires), en fecha absoluta, sin depender de `referenceDate`;
   - **mensajes**: cuerpos con texto multilínea, uno largo, emojis, uno nulo y uno con marcado (`<script>alert(1)</script>`, `<b>`, `&amp;`), para que la 6.4 pruebe el escape;
   - **fechas**: todas las demás, relativas a `referenceDate` y dentro de los últimos 30 días;
   - `started_at` y `last_message_at` calculados a partir de los mensajes, en el mismo código que los inserta.
3. **`seeds/basic.ts`**: `main()` llama además a `seedConversations`, dentro del mismo comando `npm run db:seed`. `seedBasic` no cambia (D-1).
4. **`seeds/volume.ts`**, según D-3: `seedVolume(db, password, { size, referenceDate })` y su comando.
   - Crea una organización propia con un `admin` (`volumen@example.com`), ids derivados del índice y un generador con semilla fija. Con el mismo `size`, dos corridas dejan los mismos datos.
   - Con el tamaño por defecto, cada fila de las tres tablas lleva `external_ref` nulo:
     - ~10.000 clientes, un 10 % sin teléfono y un 5 % inactivos;
     - 10.000 conversaciones, un 20 % sin cliente, con los tres estados, repartidas en 180 días hasta `referenceDate`;
     - entre 1 y 12 mensajes por conversación, con dirección alternada y a veces repetida.
   - Inserta en lotes, dentro de una transacción por tabla, y termina en pocos minutos en la máquina local. El tiempo se mide y se registra.
5. **`package.json`**: solo el script `db:seed:volume`. Sin dependencias.
6. **Tests de integración** en `tests/integration/conversations-seed.test.ts`, contra `_test`, con un `referenceDate` fijo y un `size` chico para el volumen:
   - `seedConversations` crea lo descrito en el punto 2: cantidades, estados, conversaciones sin cliente, el día de 2008, el mensaje que cambia de día en UTC y los cuerpos con marcado guardados tal cual;
   - **invariantes**, en los dos seeds y para toda conversación: `started_at` es el menor `sent_at`, `last_message_at` el mayor, y toda conversación tiene al menos un mensaje;
   - **aislamiento**: las filas de cada seed pertenecen a su organización, y sus clientes y conversaciones son de la misma;
   - **idempotencia**: una segunda corrida con la misma fecha no agrega filas y repone el estado y los datos editables de conversaciones y clientes; con otra fecha, se comporta según D-2;
   - el volumen con el mismo `size` produce las mismas filas, y su usuario puede ingresar;
   - los dos seeds se niegan a correr fuera de `_dev`, `_test` o `_e2e` sin escribir nada.
7. **`tests/integration/seed.test.ts`**: sin cambios, salvo que D-1 los pida.
8. **Evidencia manual**, registrada en el brief: `npm run db:seed` y `npm run db:seed:volume` contra la base de desarrollo, con el tiempo del volumen, las cantidades resultantes y una segunda corrida sin cambios.
9. **Documentación**:
   - Environments: el seed de conversaciones y el de volumen, con sus comandos, usuarios, organización y alcance;
   - TestingStrategy: los seeds existentes y los invariantes cubiertos;
   - RepositoryStructure: fila de la 6.2 y la línea de `seeds/`;
   - DataModel: quién garantiza hoy la regla de `started_at`;
   - TraceabilityMatrix: la discrepancia del hallazgo 5, según D-4.

## Alcance excluido

- Servicios, consultas, listas y `EXPLAIN` de conversaciones: 6.3.
- Pantallas 6 a 9: 6.4.
- `ingestion_events`, eventos sintéticos y cualquier llamado al futuro endpoint: 6.5.
- Fixtures de métricas con valores calculados a mano: Fase 7.
- Volumen de productos e inventario (D-4).
- Registros de auditoría para los datos sintéticos.
- Un comando para vaciar o reiniciar la base de desarrollo.
- Cambios en `seedBasic`, en `tests/e2e/` o en `global-setup.ts`: los end-to-end siguen sin conversaciones sembradas (D-1).
- Datos reales, o tomados de Airtable o del agente de WhatsApp. Teléfonos o nombres de personas reales.
- Ejecutar el seed de volumen en CI.

## Archivos o componentes autorizados

Lista cerrada:

- `seeds/conversations.ts` y `seeds/volume.ts`.
- `seeds/basic.ts`, solo en su `main()` (punto 3).
- `package.json`, solo el script `db:seed:volume`.
- `tests/integration/conversations-seed.test.ts`.
- `tests/integration/seed.test.ts`, solo si D-1 lo pide.
- Los documentos del punto 9.
- Este brief y su fila en `docs/decisions/README.md`.
- `CHANGELOG.md`, `HANDOFF.md` y las líneas de estado de `README.md` y `docs/README.md`, al cerrar la subfase.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md): `clients`, `conversations` y `messages`, con los `CHECK` y los triggers de la 6.1.
2. [MetricsCatalog.md](../analytics/MetricsCatalog.md): convenciones de zona horaria, `started_at` y casos límite.
3. [NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md): volumen de referencia.
4. [Environments.md](../development/Environments.md) y [TestingStrategy.md](../development/TestingStrategy.md): seeds y bases.
5. [IntegrationBoundaries.md](../architecture/IntegrationBoundaries.md): solo datos sintéticos.
6. [ADR 0007](0007-identificador-de-cliente-solo-telefono.md), [ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md) y [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md).
7. Precedentes: [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md), D-7 (seed básico), y [brief-6.1](brief-6.1-migraciones-de-conversaciones.md).

## Dependencias

- 6.1 cerrada (verificado).
- Contenedor de PostgreSQL en marcha.
- Autorización para `npm run db:seed` y `npm run db:seed:volume` contra la base de desarrollo.

## Resolución (2026-09-16)

El usuario aprobó el brief con D-1 a D-4 según la recomendación: (a) en las cuatro. También autorizó ejecutar los seeds contra la base local de desarrollo y pasar la tarea 6.2 a "En proceso" en Notion.

## Decisiones pendientes

Cada decisión trae una recomendación, no una resolución: la resuelve el usuario.

### D-1 — Dónde viven los datos de conversaciones del seed de desarrollo

- **Opciones**:
  - (a) **Función aparte**, `seedConversations`, que llama `npm run db:seed` después de `seedBasic`. Los end-to-end siguen usando solo `seedBasic`.
  - (b) **Dentro de `seedBasic`**, ajustando los end-to-end que esperan la base sin clientes.
- **Recomendación**: (a).
  - Cada spec crea sus propios datos (4.4, D-5). Datos compartidos en el seed de los end-to-end acoplarían los casos entre sí.
  - Con (b) cambian `clients.spec.ts` y su caso de "lista vacía", fuera del alcance de una subfase de datos.
  - `npm run db:seed` sigue siendo un solo comando para el usuario.
- **Consecuencia**: la 6.4 crea en cada spec las conversaciones que necesita, sin depender de este seed.

### D-2 — Fechas del seed de desarrollo con mensajes de solo inserción

- **Opciones**:
  - (a) **Relativas, ancladas a la primera corrida**. Las fechas se calculan desde `referenceDate` (por defecto, hoy en la zona de la organización) y las filas usan ids fijos. Una corrida posterior no toca mensajes ni fechas: solo repone el estado y los datos editables de conversaciones y clientes. Para ver fechas recientes otra vez, se recrea la base de desarrollo.
  - (b) **Absolutas y fijas** (por ejemplo, septiembre de 2026). Son deterministas, pero con el tiempo quedan fuera del período por defecto de las pantallas y del dashboard (últimos 30 días).
  - (c) **Relativas y reemplazadas en cada corrida**: el seed vacía `messages` y `conversations` con `TRUNCATE` antes de sembrar. Borra también cualquier otro dato de esas tablas en la base de desarrollo.
- **Recomendación**: (a).
  - Es la única que respeta la solo inserción sin vaciar tablas enteras y que, además, muestra datos en el período por defecto al sembrar.
  - (c) usa en el seed la vía que el ADR 0013 reserva para la limpieza de tests.
  - Los tests pasan un `referenceDate` fijo, así que siguen siendo deterministas.
- **Consecuencia**:
  - Environments documenta que las fechas quedan fijadas en la primera corrida;
  - el test de idempotencia prueba que una corrida con otra fecha no mueve nada;
  - el día de 2008 es absoluto en cualquier caso.

### D-3 — Forma del seed de volumen

- **Opciones**:
  - (a) **Organización propia** con su `admin`, ~10.000 clientes y 10.000 conversaciones (entre 1 y 12 mensajes cada una), tamaño parametrizable y comando aparte, fuera de CI.
  - (b) **En la organización del seed básico**, con el mismo volumen.
  - (c) **Más chico** (~1.000 conversaciones), para que corra en cada `db:seed`.
- **Recomendación**: (a).
  - Mantiene legible la organización del seed básico, y un usuario propio respeta el ADR 0010.
  - El tamaño es el de referencia de NonFunctionalRequirements, que es contra lo que se mide la 6.3.
  - Un comando aparte evita que cada `db:seed` tarde minutos. En los tests corre con un `size` chico, y el tamaño completo se ejecuta y se mide a mano.
- **Consecuencia**:
  - el volumen usa la contraseña de `SEED_USER_PASSWORD`;
  - la 6.3 registra sus `EXPLAIN` contra esta organización;
  - un `size` grande con 12 mensajes por conversación puede superar los 100.000 mensajes: el tiempo se mide antes de cerrar.

### D-4 — Volumen de productos y clientes fuera de conversaciones

- **Opciones**:
  - (a) **Solo lo que usa la Fase 6**: clientes (la lista por última interacción de la pantalla 6 los necesita), conversaciones y mensajes. El volumen de productos e inventario queda registrado como pendiente para la Fase 8.
  - (b) **Sumar productos e inventario** al mismo seed de volumen.
- **Recomendación**: (a).
  - Una subfase no mezcla módulos no relacionados (CLAUDE.md). Sembrar inventario exige respetar sus propias reglas (`balance_after` encadenado, movimientos de solo inserción), que no son de esta fase.
  - La Fase 8 (rendimiento con volumen real) ya tiene pendientes el costo de `offset` y las listas en memoria.
- **Consecuencia**:
  - TraceabilityMatrix corrige la afirmación del hallazgo 5: las consultas de las Fases 4 y 5 no se confirmaron con `EXPLAIN`, y eso queda pendiente para la Fase 8;
  - Risks suma la entrada si no la cubre ya.

## Invariantes

- Solo datos sintéticos: ningún nombre, teléfono ni texto real, ni de Airtable ni del agente de WhatsApp.
- Ningún seed corre contra una base cuyo nombre no termine en `_dev`, `_test` o `_e2e`.
- Toda conversación sembrada tiene al menos un mensaje, `started_at` igual a su primer `sent_at` y `last_message_at` igual a su último `sent_at`.
- Ningún seed actualiza ni borra mensajes. Ningún seed usa `TRUNCATE`.
- Cada fila sembrada pertenece a la organización de su seed, y sus referencias apuntan a filas de la misma organización.
- `seedBasic`, los end-to-end y su `global-setup.ts` no cambian.
- Sin dependencias nuevas, sin migraciones y sin cambios en `src/`.
- `ingestion_events` no se siembra.

## Criterios de aceptación

- **AC-1**: D-1 a D-4 tienen resolución del usuario con fecha.
- **AC-2**: los casos del punto 6 pasan contra PostgreSQL real.
- **AC-3**: `npm run db:seed` y `npm run db:seed:volume` corren contra la base de desarrollo; una segunda corrida no agrega filas; las cantidades y el tiempo del volumen quedan registrados en el brief.
- **AC-4**: `npm run test` pasa completo; los tests existentes no cambiaron salvo lo que indique el punto 7.
- **AC-5**: con el contenedor detenido pasan `typecheck`, `lint`, `format:check`, `test:guards`, `test:unit` y `build`, y `db:generate` no produce migraciones.
- **AC-6**: `npm run test:e2e` sigue pasando 50 de 50.
- **AC-7**: la CI queda en verde en el commit de la subfase, verificada con `gh run view`.
- **AC-8**: `git status` muestra solo archivos autorizados, `package.json` cambia solo en el script nuevo, y los documentos del punto 9 reflejan las resoluciones.
- **AC-9**: una búsqueda en los seeds nuevos confirma que no hay URLs, credenciales ni datos que no sean sintéticos.

## Pruebas y evidencia requerida

- **Evidencia `deterministic`**: salida de `npm run test` con los tests del seed contra PostgreSQL 18.6 real, con fecha de referencia fija.
- **Evidencia manual** (AC-3): salida de los dos comandos contra la base de desarrollo, con cantidades por tabla y tiempo.
- **Evidencia de protección**: el test de invariantes se corre una vez con un seed alterado (un `started_at` corrido) para registrar que falla.
- **Evidencia de CI**: ejecución en verde.

**Nivel resultante esperado**: **validado localmente y en CI** para los seeds.

**No se valida**:

- que las pantallas muestren bien estos datos (6.4);
- el rendimiento de las consultas sobre el volumen (6.3);
- los valores de las métricas (Fase 7).

La revisión es una autoevaluación (`self_assessment: true`).

## Condiciones de detención

- Si sembrar exige actualizar o borrar mensajes, usar `TRUNCATE`, o cambiar un `CHECK` o un trigger de la 6.1.
- Si el volumen completo tarda más de 10 minutos o no entra en la memoria de la máquina local.
- Si algún test existente o algún end-to-end necesita cambios.
- Si aparece la necesidad de una dependencia, una migración o código en `src/`.
- Antes de ejecutar los seeds contra la base de desarrollo, y antes de cualquier commit, push o cambio en Notion.

## Ejecución (2026-09-16)

La implementación está terminada y el cierre está pendiente. No se activó ninguna condición de detención.

Ajustes dentro del alcance:

- **Horas locales como JSON.** `drizzle-orm` expande un arreglo de JavaScript en una lista de parámetros, así que `localTimesToUtc` las recibe como `jsonb` y no como `text[]`.
- **Un generador por fila en el volumen.** Cada fila usa un generador derivado de su índice, y los ids de los mensajes salen de la conversación y la posición, no de un contador global. Así, una corrida con otro tamaño no le suma mensajes a una conversación existente ni rompe sus invariantes. Lo cubre un caso propio.
- **Sin ciclo de carga entre seeds.** `seeds/basic.ts` importa `seeds/conversations.ts` con `import()` dentro de `main()`, porque `conversations.ts` importa de `basic.ts`.
- **Evidencia de protección permanente.** Además de la corrida de mutación, un caso permanente corre el inicio de una conversación y demuestra que la verificación de invariantes lo detecta.
- **Risks** suma la entrada de D-4.

Evidencia:

- **Tests del seed**: `tests/integration/conversations-seed.test.ts` pasa 13 casos. En la corrida de mutación, `started_at` se calculó con el último mensaje: fallaron 3 casos (los dos de invariantes y el de otra fecha de referencia) y después se restauró el archivo.
- **Suite local**: `npm run test` pasa 494 de 494.
- **Con el contenedor detenido**: pasan `typecheck`, `lint`, `format:check`, `test:guards` (30), `test:unit` (188) y `build`, y `db:generate` no produce migraciones.
- **End-to-end**: `npm run test:e2e` pasa 50 de 50, sin cambios en `tests/e2e/`.
- **Base de desarrollo (AC-3)**:
  - `npm run db:seed`, dos veces: la organización de ejemplo queda con 10 conversaciones y 26 mensajes;
  - `npm run db:seed:volume`, dos veces: 10.000 clientes, 10.000 conversaciones y 65.260 mensajes, en 4,9 s la primera corrida y 3,3 s la segunda, sin cambios;
  - ninguna conversación de la base incumple los invariantes.
- **Dato ajeno al seed**: la organización de ejemplo tiene 7 clientes. El séptimo, "Matias Garavano", lo creó el usuario desde la pantalla el 2026-09-16 a las 18:12 UTC, y el seed no lo toca.
- **AC-9**: los seeds nuevos solo leen `DATABASE_URL` y `SEED_USER_PASSWORD`, como el básico, y no tienen URLs ni credenciales.

Pendiente: commit, push, CI (AC-7) y cierre.
