# Brief 11.2 — Información del negocio

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `feature`
- **Nivel de evidencia objetivo**: `deterministic` para el esquema, el servicio, la vigencia y la búsqueda, contra PostgreSQL real; `producer-consumer` para las pantallas (end-to-end sobre `next start`).
- **Nivel de validación alcanzable**: **validado localmente y en CI**, y **validado en integración** para las pantallas. Nada de esta subfase se despliega a staging. El primero en usarla allá es el piloto (11.4), y el agente, recién con el contrato de lectura (11.3).
- **Orden**: va después de la 11.0 y en paralelo con la 11.1, que cerró el 2026-09-24 ([Roadmap](../planning/Roadmap.md) §Fase 11). La 11.3 depende de esta subfase.
- **No abre ni cierra gate.** La revisión independiente no es obligatoria. Se recomienda igual (D-10): la de la 11.1 encontró dos hallazgos mayores.
- **Estado de este documento**: **aprobado el 2026-09-24**, con las diez decisiones resueltas por la recomendación (ver §Resolución). **Cerrado el 2026-09-24** por el usuario (ver §Cierre).

## Objetivo

Que el negocio pueda cargar en el CRM la información que un vendedor da todos los días: horarios, ubicación, medios de pago, envíos, garantía y cosas parecidas. Que la mantenga al día, con una **vigencia** que permita cargar por adelantado un horario de feriado y que deje de valer sola cuando pasa.

- Un `admin` crea, edita, desactiva y reactiva cada entrada desde una pantalla nueva, con auditoría.
- Cualquier usuario la lista y la busca por palabras sueltas.
- El servicio sabe cuáles entradas están **vigentes hoy**, en la zona horaria de la organización.

El resultado verificable: después de esta subfase, la 11.3 puede escribir el contrato de lectura sin agregar ninguna columna, índice ni consulta. Solo tiene que exponer lo que ya existe, como en la 11.1.

**Obligaciones que toma**:

- **B-9** del documento de brechas: «un módulo nuevo con tabla, servicio, pantalla de edición para `admin`, auditoría y vigencia» ([Roadmap](../planning/Roadmap.md) §Fase 11). La lectura de servicio es de la 11.3.
- **La convención de los FR** ([EngineeringStandards](../development/EngineeringStandards.md)): los requisitos nuevos llevan su identificador en el caso de test que los prueba.

El mapa de la 11.0 no le asignó ninguna obligación numerada a la 11.2 ([brief-11.0](brief-11.0-instrumentos-antes-de-construir-encima.md), fila 11.2).

## Lo que se verificó antes de escribir este brief

Verificado el 2026-09-24 contra el código. Nada de esta sección es supuesto.

- **Qué necesita leer el agente, como contexto de negocio.** El documento de brechas del usuario (repositorio del agente, rama `agent/brechas-crm-airtable`, `b75e484`, B-9) se leyó con `git show`, sin cambiar de rama. Describe la información del negocio de hoy: horarios, ubicación, medios de pago, envíos y demás, cada entrada con una clasificación, un contenido, un estado y un vencimiento, buscada por palabras clave. Del documento se tomó solo **qué** necesita el agente: textos clasificados, activables, con vencimiento y buscables por palabras. **Ninguna tabla, campo ni nombre de este brief viene de las tablas del sistema actual del agente.** La forma sale del modelo del CRM y de sus patrones ya validados.
- **El CRM no tiene nada equivalente.** No hay ninguna tabla, módulo ni pantalla de información del negocio. `DataModel.md` §Explícitamente fuera de este modelo no la excluye: excluye ventas, compras, pagos y contabilidad. Un texto que dice «aceptamos transferencia» es información, no un medio de pago como entidad.
- **Patrones que se repiten, y dónde están**:
  - **entidad editable con auditoría**: `products` y `clients`. Fila con `FOR UPDATE`, `diff` sobre lo leído y última escritura gana (brief-4.2, D-5). Desactivar y reactivar sin borrado. `CONFLICT` por unicidad, con un savepoint y la traducción de `23505` por nombre de constraint;
  - **búsqueda por palabras**: `products.search` (migración `0016`), una columna generada `to_tsvector('simple', immutable_unaccent(lower(…)))` con índice GIN. La consulta se arma desde el mismo vector, así que la sintaxis de `tsquery` nunca llega cruda (`catalog/schema.ts:28-42`, `productSearchQuery`);
  - **fechas de calendario en la zona de la organización**: `src/shared/calendar` (`isCalendarDate`) y el día de hoy calculado en PostgreSQL con `(now() at time zone tz)::date` (`analytics/repository.ts:21`);
  - **lista paginada en SQL**, con conteo y desempate estable (brief-4.3.3, D-2).
- **Qué hay que tocar fuera del módulo nuevo**:
  - **La frontera entre módulos** vive en `eslint.config.mjs:79-85`, con una lista explícita de los módulos de dominio. Un módulo nuevo que no esté ahí puede importar `next` o `@/app/*` sin que nada lo detecte.
  - **La auditoría**: `audit_entity_type` (`audit/schema.ts:16-22`) no tiene un valor para esta entidad. Agregarlo es un `ALTER TYPE … ADD VALUE` aditivo, como `price_change` en la `0017`. Las acciones `create`, `update`, `deactivate` y `reactivate` ya existen.
  - **Dos tests enumeran todas las tablas**: `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts`. Ya pasó en la 6.5.3 y en la 11.1.
  - **La superficie expuesta**: `tests/guards/exposed-surface.test.ts` falla con cada Server Action nueva sin declarar, y `SecurityModel.md` lleva el recuento. La 11.1 tuvo que sumar los dos archivos fuera de su lista; esta vez van en la lista desde el principio.
  - **La navegación** está en `src/app/(autenticado)/layout.tsx:21-26`.
  - **`Overview.md` y `RepositoryStructure.md`** enumeran los módulos.
- **Una convención que la 11.1 no siguió**: los privilegios de `product_prices` se agregaron a mano al final de la migración generada `0017`. La convención del proyecto (HANDOFF §6) pone privilegios y triggers en una migración `--custom` aparte, como la `0009` para `clients`. Esta subfase vuelve a la convención.
- **El manifiesto del backup no necesita cambios**: recorre `pg_class`, no una lista fija de tablas (verificado en la 11.1).

## Alcance incluido

Una sola etapa (D-1).

1. **Esquema** (migraciones `0018`, generada, y `0019`, `--custom`):
   - la tabla `knowledge_entries` (D-2), con título, categoría, contenido, estado activo y vigencia (D-3);
   - la columna generada `search` con su índice GIN (D-6);
   - el índice único de título sin distinguir mayúsculas por organización (D-5);
   - el valor `knowledge_entry` en `audit_entity_type`;
   - en la `0019`: `SELECT`, `INSERT` y `UPDATE` para `crm_app`, **sin `DELETE`**, porque ningún camino borra una entrada (D-4).
2. **Búsqueda compartida** (D-6): la construcción del vector y de la consulta pasa de `catalog/schema.ts` a `src/shared/search/`, y `catalog` la importa desde ahí. **La expresión de `products.search` no cambia**: `drizzle-kit generate` no produce ninguna migración para `products`, y los tests de búsqueda de `catalog`, con el `EXPLAIN`, siguen en verde.
3. **Módulo nuevo `knowledge`**, con `schema.ts`, `repository.ts`, `service.ts` e `index.ts`:
   - **crear, editar, desactivar y reactivar**: solo `admin`, con validación, auditoría en la misma transacción y `CONFLICT` por título repetido;
   - **leer una entrada** y **listar** con filtro de estado y página, para cualquier rol;
   - **buscar por palabras** sobre título, categoría y contenido, ordenado por relevancia;
   - **leer solo las vigentes**, con o sin texto de búsqueda. Es la función que la 11.3 va a envolver;
   - **sugerencias de categoría**: los valores que la organización ya usa;
   - **historial de auditoría** de una entrada, para `admin`.
4. **Pantallas** (D-7):
   - `/informacion`: lista con buscador, filtro de estado, paginación y etiqueta de estado por fila (vigente, programada, vencida o inactiva);
   - `/informacion/nueva`: alta;
   - `/informacion/[entryId]`: detalle, edición, desactivación y reactivación para `admin`, con su auditoría; solo lectura para `viewer`;
   - «Información» en la navegación, para los dos roles.
5. **Requisitos**:
   - **FR-INFO-01**: un `admin` puede crear, editar, desactivar y reactivar entradas de información del negocio, con título, categoría, contenido y vigencia. Cada cambio queda auditado;
   - **FR-INFO-02**: cualquier usuario puede listar las entradas, filtrarlas por estado y buscarlas por palabras sueltas sobre título, categoría y contenido, sin distinguir mayúsculas ni acentos;
   - **FR-INFO-03**: una entrada está **vigente** si está activa y el día de hoy, en la zona horaria de la organización, cae dentro de su vigencia. Las lecturas de vigentes no devuelven ninguna otra.
6. **Documentación**:
   - `DataModel.md`: la tabla, el valor del enum, los índices y la regla de vigencia;
   - `FunctionalRequirements.md`: la sección nueva con los tres FR;
   - `Screens.md`: las pantallas 11 y 12;
   - `TraceabilityMatrix.md`: las filas nuevas;
   - `Overview.md` y `RepositoryStructure.md`: el módulo nuevo;
   - `SecurityModel.md`: el recuento de la superficie expuesta.

## Alcance excluido

- **Toda lectura de servicio**: ni rutas `/api`, ni credenciales, ni un contexto de servicio. Es la 11.3.
- **Adjuntos, imágenes, enlaces con vista previa y formato enriquecido.** El contenido es texto plano, y la pantalla lo muestra escapado y con sus saltos de línea.
- **Categorías como tabla propia, subcategorías y jerarquías** (D-2).
- **Historial de versiones del contenido fuera de la auditoría** (D-4).
- **Borrar una entrada.** Para eso está la desactivación (D-4).
- **Respuestas generadas, resúmenes, embeddings o búsqueda semántica.** La búsqueda es por palabras, como la de productos.
- **Datos de ejemplo en los seeds** (D-9).
- **Los dos instrumentos que recorren pantallas**, `scripts/recorrer-pantallas.ts` y `tests/e2e/security-headers.spec.ts`: no suman las pantallas nuevas en esta subfase (D-8).
- **Ventas, pagos o envíos como entidades.** Un texto que describe cómo se paga o se envía es información del negocio. Una tabla de medios de pago sería un módulo de pagos, y `CLAUDE.md` lo prohíbe.
- **El agente, su repositorio y cualquier cosa del sistema que hoy usa.**
- **Desplegar a staging.**

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0018_*.sql` y `drizzle/0019_*.sql`, con `drizzle/meta/*`. La `0018` se genera con `drizzle-kit generate` y se revisa a mano; la `0019` se genera con `--custom`.
- `src/modules/knowledge/` (nuevo): `schema.ts`, `repository.ts`, `service.ts`, `index.ts` y `service.test.ts`
- `src/shared/search/index.ts` y `src/shared/search/search.test.ts` (nuevos)
- `src/modules/catalog/schema.ts`: **solo** para importar la búsqueda compartida (D-6)
- `src/modules/audit/schema.ts`: **solo** el valor nuevo del enum
- `eslint.config.mjs`: **solo** sumar `knowledge` a la lista de módulos de dominio
- `src/app/(autenticado)/informacion/` (nuevo): páginas, `actions.ts`, `filters.ts`, `messages.ts`, el formulario y los tests unitarios de sus partes puras
- `src/app/(autenticado)/layout.tsx`: **solo** el ítem de navegación
- `tests/integration/knowledge.test.ts` (nuevo), `tests/integration/identity-schema.test.ts` y `tests/integration/audit.test.ts` (**solo** la tabla nueva en sus listas)
- `tests/guards/exposed-surface.test.ts`: **solo** las Server Actions nuevas
- `tests/e2e/knowledge.spec.ts` (nuevo)
- `docs/architecture/DataModel.md`, `TraceabilityMatrix.md`, `Overview.md`, `RepositoryStructure.md` y `SecurityModel.md`; `docs/product/FunctionalRequirements.md` y `Screens.md`
- este brief, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`, al cerrar

## Fuentes de verdad

- **El código y las migraciones**: `catalog` (la entidad editable y la búsqueda), `crm` (unicidad y `CONFLICT`), `audit`, `drizzle/0009`, `0015` y `0016`.
- **Las decisiones anteriores**:
  - el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) (privilegios de `crm_app`);
  - el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md): diseñar desde el modelo del CRM;
  - [brief-4.2](brief-4.2-servicio-de-catalogo.md) (entidad editable), [brief-4.3.3](brief-4.3.3-historial-de-movimientos.md) (períodos por día de calendario y paginación), [brief-9.0.2](brief-9.0.2-busqueda-sin-distinguir-acentos.md) (`immutable_unaccent` y su límite) y [brief-11.1](brief-11.1-catalogo-comercial.md) (búsqueda por palabras, D-4).
- **La documentación de PostgreSQL 18**: búsqueda de texto (`setweight`, `ts_rank`). Se cita con su sección exacta al implementar.
- **Contexto de negocio, nunca dependencia técnica**: el documento de brechas del usuario, B-9.

## Decisiones pendientes

Cada una trae una recomendación. El usuario puede aprobarlas en bloque o cambiar cualquiera.

### D-1 — Etapas

- **(a) Recomendada: una sola etapa**, con un commit. La subfase tiene un tamaño parecido al de la 11.1.1, y todas sus partes dependen de la tabla.
- (b) Dos etapas: primero esquema y servicio, después las pantallas. Duplica el costo de cierre sin reducir el riesgo, porque las pantallas son las que prueban el servicio de punta a punta.

### D-2 — Forma de una entrada

- **(a) Recomendada**: tabla `knowledge_entries` en el módulo `knowledge`, con:
  - `title`: obligatorio, hasta 200 caracteres. Por ejemplo, «Horario de atención»;
  - `category`: obligatoria, hasta 100 caracteres, **texto libre con sugerencias** de las que ya usa la organización, como la marca y la categoría de productos (brief-11.1, D-2). Un solo nivel;
  - `content`: obligatorio, texto plano de hasta 4.000 caracteres;
  - `is_active`, `valid_from`, `valid_until` (D-3), `created_at` y `updated_at`.
  
  En pantalla se llama «Información del negocio»; `knowledge` es solo el nombre interno.
- (b) Categoría como enum fijo (horarios, ubicación, pagos, envíos, garantía, otros). Da consistencia, pero cada categoría nueva exige una migración, y los negocios no se parecen entre sí.
- (c) Categoría y subcategoría. El título ya cumple el papel del segundo nivel.

El límite de 4.000 caracteres es para que cada entrada trate un tema y el agente reciba textos acotados. Si el piloto muestra que no alcanza, subirlo es un cambio de validación y de un `CHECK`, sin migrar datos.

### D-3 — Vigencia

- **(a) Recomendada**: `is_active` más dos fechas de calendario **opcionales**, `valid_from` y `valid_until`, las dos inclusivas y leídas en la zona horaria de la organización, con un `CHECK` que exige `valid_until >= valid_from`. Una entrada está vigente si está activa y hoy cae dentro de las fechas que tenga. Permite cargar con tiempo el horario de un feriado y que deje de valer solo.
- (b) Solo `valid_until`. Resuelve el vencimiento, pero una entrada futura empezaría a valer en el momento de cargarla.
- (c) Solo activa o inactiva. Obliga a alguien a acordarse de desactivar cada entrada a tiempo.

«Hoy» lo calcula PostgreSQL con la zona de la organización, como las métricas, nunca el reloj del servidor de aplicación. Cada lista y cada lectura indica el estado de cada entrada: vigente, programada, vencida o inactiva.

### D-4 — Edición, historial y borrado

- **(a) Recomendada**: entidad editable, como `products`. Fila con `FOR UPDATE`, `diff` sobre lo leído, auditoría en la misma transacción y última escritura gana. **Sin borrado**: se desactiva y se reactiva. El historial de cambios es la auditoría, con el antes y el después de cada campo. `crm_app` no recibe `DELETE`.
- (b) Versiones de solo inserción, como los precios. La información del negocio no es un registro de hechos, y la auditoría ya guarda el historial.
- (c) Control optimista con la versión leída, como el `CONFLICT` del precio. Protege de que dos `admin` pisen la edición del otro, pero ningún otro formulario editable del CRM lo tiene. Queda registrado como riesgo aceptado, a revisar si el piloto lo encuentra.

### D-5 — Unicidad del título

- **(a) Recomendada**: el título es único por organización sin distinguir mayúsculas, **también frente a las entradas inactivas**, con un índice sobre `lower(title)`. Un título repetido da `CONFLICT` en el campo, como el SKU o el teléfono. Dos entradas con el mismo título le darían al agente dos respuestas para la misma pregunta.
- (b) Sin unicidad.

### D-6 — Búsqueda

- **(a) Recomendada**:
  - columna generada `search` con pesos: el título pesa más que la categoría, y la categoría más que el contenido (`setweight` A, B y C). El índice GIN va sobre esa columna, y el orden de los resultados de búsqueda es por relevancia (`ts_rank`), con desempate por título y por id;
  - **la construcción del vector y de la consulta se extrae a `src/shared/search/`**, y `catalog` pasa a usarla. Así, el escape del texto buscado, que es la parte delicada, existe una sola vez. Mover la función no cambia el SQL de `products.search`, y se comprueba con `drizzle-kit generate` sin cambios en `products` y con los tests de `catalog` en verde, incluido el `EXPLAIN`.
- (b) Lo mismo, pero con una copia de la función dentro de `knowledge`. No toca `catalog`, pero deja dos copias del escape de `tsquery`, y un arreglo en una no llega a la otra.
- (c) Búsqueda por prefijo del título, sin índice de texto. El agente busca por palabras del contenido («transferencia», «envío»), no por el comienzo del título.

Los límites de la búsqueda de productos valen igual acá, y se documentan: el prefijo va desde el comienzo de cada palabra, y todas las palabras tienen que estar.

### D-7 — Pantallas y roles

- **(a) Recomendada**:
  - **lista `/informacion`**: buscador, filtro de estado y paginación de 25, con todo en la URL. El filtro de estado tiene cinco valores: todas, vigentes, programadas, vencidas e inactivas; por defecto, todas. Cada fila muestra título, categoría, estado y vigencia, y en móvil la lista son tarjetas;
  - **alta `/informacion/nueva`**: solo `admin`;
  - **detalle `/informacion/[entryId]`**: el contenido completo con sus saltos de línea y la vigencia. Un `admin` además puede editar, desactivar con confirmación y reactivar, y ve la auditoría;
  - **un `viewer` ve la lista y el detalle**, sin formularios ni auditoría, como en productos.
  
  Las pantallas se numeran 11 y 12 en `Screens.md`, sin wireframe nuevo, como la 5b. Cada una tiene su end-to-end con axe en claro y en oscuro, teclado y móvil a 375 px.
- (b) Editar en la misma lista, en línea. Es más rápido para tres entradas, pero rompe la convención de diálogos como páginas y complica la accesibilidad.

### D-8 — Los instrumentos que recorren pantallas

`scripts/recorrer-pantallas.ts` (el recorrido del piloto) y `security-headers.spec.ts` (CSP en cada pantalla) cubren las diez pantallas originales. **Tampoco cubren la 5b de precios**: la 11.1 no la sumó y no quedó registrado.

- **(a) Recomendada: asignarlos a la 11.4**, que es la que usa el recorrido. Los dos suman la 5b y las pantallas 11 y 12 en la misma subfase. Mientras tanto, las tres pantallas usan el mismo `layout` y el mismo `proxy.ts` que las demás, y el end-to-end de cada una corre axe.
- (b) Sumar ahora las pantallas 11 y 12, y la 5b de paso. Agrega a esta lista dos archivos que no son del módulo.

### D-9 — Datos de ejemplo

- **(a) Recomendada: ningún seed.** Cada end-to-end crea sus entradas, y en desarrollo se cargan desde la pantalla. Los datos sintéticos con la forma de los del primer negocio son decisión de la 11.4, que los necesita para el piloto.
- (b) Unas entradas de ejemplo en `seeds/basic.ts`. Los end-to-end reponen ese seed antes de cada caso, así que sus entradas se mezclarían con las de cada spec.

### D-10 — Revisión independiente

- **(a) Recomendada**: una revisión de un agente que no participó, de solo lectura, al final, contra este brief y `CLAUDE.md`. No es obligatoria porque no hay gate. La de la 11.1 encontró dos hallazgos mayores que la autoevaluación no vio.
- (b) Solo autoevaluación, declarada como tal.

## Resolución — 2026-09-24

El usuario aprobó el brief **con las recomendaciones** de las diez decisiones: D-1 a D-10, cada una en su opción (a).

En el mismo turno autorizó el commit del brief, pasar la tarea 11.2 de Notion (`3e4702be6f4e81f0bfe5d3d3c5274e27`) a «En proceso» y empezar la implementación. No autorizó push.

## Invariantes

- Ninguna prohibición de `CLAUDE.md` cambia. `forbidden-references.test.ts` no se toca y sigue en verde.
- Ningún camino de la aplicación borra una entrada. `crm_app` no tiene `DELETE` sobre `knowledge_entries`.
- Toda consulta de `knowledge` filtra por `organization_id`. Una entrada de otra organización es `NOT_FOUND`.
- Todo cambio de una entrada queda auditado en la misma transacción. Un cambio sin diferencias no escribe ni audita.
- La vigencia se evalúa con el día de la zona de la organización, en PostgreSQL.
- El texto buscado nunca llega crudo a `to_tsquery`.
- La búsqueda de productos no cambia de conducta ni de plan.

## Criterios de aceptación

- **AC-1 (esquema)**:
  - la `0018` crea `knowledge_entries` con sus `CHECK` (longitudes, `valid_until >= valid_from`), el índice único sobre `lower(title)`, la columna `search` con su índice GIN y el valor nuevo del enum. No toca ninguna otra tabla;
  - la `0019` otorga `SELECT`, `INSERT` y `UPDATE` a `crm_app`, y un caso comprueba que no tiene `DELETE` (`42501`);
  - `identity-schema` y `audit` incluyen la tabla;
  - `DataModel.md` la describe.
- **AC-2 (FR-INFO-01)**:
  - crear, editar, desactivar y reactivar son solo de `admin`: un `viewer` recibe `FORBIDDEN` y nada se escribe;
  - cada cambio se audita con el tipo de entidad nuevo;
  - editar audita solo lo que cambió, con el antes real, y un cambio sin diferencias no audita;
  - un título repetido, también con otras mayúsculas y frente a una inactiva, da `CONFLICT` en el campo;
  - las validaciones rechazan los campos vacíos, los que pasan los límites, una fecha que no es de calendario y `valid_until` anterior a `valid_from`.
- **AC-3 (FR-INFO-03, vigencia)**. Casos con fechas relativas al día de la organización:
  - sin fechas;
  - desde hoy, y desde mañana (programada);
  - hasta hoy (vigente), y hasta ayer (vencida);
  - inactiva dentro de su vigencia;
  - una organización en una zona donde **ya es mañana**, con una entrada que empieza mañana en UTC.
  
  La lectura de vigentes devuelve exactamente las que corresponden. **Mutación**: con «hoy» calculado en UTC en lugar de la zona de la organización, el caso de la otra zona falla.
- **AC-4 (FR-INFO-02, búsqueda)**:
  - encuentra por prefijo de palabras de título, categoría y contenido, sin mayúsculas ni acentos y con todas las palabras;
  - una coincidencia en el título sale antes que una solo en el contenido;
  - los caracteres de `tsquery` no producen errores;
  - un caso con `EXPLAIN` comprueba que usa el índice GIN. **Mutación**: con la condición recalculando el vector, el caso falla.
- **AC-5 (búsqueda compartida)**:
  - `catalog` importa la búsqueda desde `src/shared/search/`;
  - `drizzle-kit generate` no produce ningún cambio sobre `products`;
  - `catalog.test.ts` pasa entero, con su `EXPLAIN`, sin modificarlo;
  - `src/shared/search/search.test.ts` prueba el escape.
- **AC-6 (aislamiento)**: una entrada de otra organización no se lee, no se edita, no aparece en la lista ni en la búsqueda, y su id da `NOT_FOUND`. Un id que no es UUID da `VALIDATION_ERROR` sin `fields`.
- **AC-7 (frontera)**: `knowledge` está en la lista de módulos de dominio de `eslint.config.mjs`. **Mutación**: un `import` de `next/cache` dentro de `knowledge/service.ts` hace fallar `lint`.
- **AC-8 (pantallas)**. El end-to-end cubre:
  - alta, edición, desactivación con confirmación y reactivación como `admin`, con el resumen en la auditoría;
  - el `CONFLICT` por título, con lo escrito conservado;
  - la búsqueda y los cinco filtros de estado, desde la URL;
  - un `viewer`, que ve la lista y el detalle sin formularios ni auditoría;
  - un contenido con saltos de línea y caracteres de HTML, que se muestra escapado;
  - una entrada de otra organización y un id inválido;
  - axe en claro y en oscuro, el alta completa solo con teclado, y móvil a 375 px.
- **AC-9 (FR y documentación)**: FR-INFO-01 a FR-INFO-03 están escritos y etiquetados en los casos que los prueban. `TraceabilityMatrix.md`, `Screens.md`, `Overview.md` y `RepositoryStructure.md` tienen lo nuevo. `SecurityModel.md` tiene el recuento nuevo, contado contra `exposed-surface.test.ts` y `src/app`.
- **AC-10**: `format:check`, `lint` y `typecheck` en verde. `npm run test` y `npm run test:e2e` completos en verde, con el recuento en este brief. La CI del commit en `success`, leída por `headSha`.
- **AC-11**: `git status` muestra solo archivos de la lista. `forbidden-references.test.ts` no cambió.

## Pruebas y evidencia requerida

- **Contra PostgreSQL real**: el esquema, los privilegios, la vigencia en la zona de la organización, la búsqueda con su `EXPLAIN`, la unicidad y el aislamiento. Nada con mocks de base.
- **Las corridas de mutación** que nombran AC-3, AC-4 y AC-7, con su salida antes y después.
- **La salida de `drizzle-kit generate`** que muestra que `products` no cambia (AC-5).
- **Los end-to-end** sobre `next start`.

## Condiciones de detención

- Antes de commit, push, merge o de abrir un PR.
- Antes de tocar un archivo fuera de la lista.
- Si la migración generada difiere de lo que el esquema declara, o toca una tabla que no es `knowledge_entries` o el enum de auditoría.
- Si mover la búsqueda a `src/shared/search/` cambia el SQL de `products.search`, o si algún test de `catalog` falla.
- Si algún test existente fuera de la lista falla por los cambios.
- Antes de instalar dependencias o crear extensiones de PostgreSQL.
- Antes de ejecutar migraciones contra una base que no sea la local de desarrollo, la de test o la de e2e.

## Resultados — 2026-09-24 (autoevaluación)

Todo lo de esta sección es **autoevaluación**. La revisión independiente (D-10) va en su propia sección.

### Lo que la implementación encontró que el brief no decía

- **Un `textarea` envía los saltos de línea como CRLF.** Lo mostró el end-to-end: el contenido quedaba guardado con `\r\n`. Así lo define HTML para el envío de formularios. Tenía dos efectos: el agente habría recibido retornos de carro, y cada salto de línea contaba doble para el límite de 4000 caracteres. El servicio ahora normaliza `\r\n` y `\r` a `\n` antes de validar. Primero se agregó un test unitario, que falló, y después la corrección.
- **Un campo de fecha de Chromium tiene una parada de tabulación por segmento** (día, mes y año, en el orden del locale del navegador). Es la conducta nativa del control, no un defecto. El caso de teclado avanza hasta salir de cada campo sin suponer cuántas paradas tiene, y `Screens.md` lo dice.
- **Un formulario GET envía todos sus campos**, así que buscar desde el formulario deja `estado=todas` en la URL. Es la convención de la 4.4: los enlaces de paginación y «Limpiar filtros» usan la URL canónica. El end-to-end lo afirma.
- **Un comentario de `catalog/repository.ts` quedó nombrando una función que ya no existe** (`productSearchQuery`, que la búsqueda compartida reemplazó por `searchQuery`). El archivo no está en la lista, así que no se tocó. Por error lo edité y lo revertí con `git checkout`; Git lo dejó con finales CRLF y Prettier lo marcó. Lo devolví a LF, y su contenido es idéntico al de `HEAD` (mismo hash). Queda para la próxima subfase que toque `catalog`.
- **`RepositoryStructure.md` no listaba `src/shared/money/`**, que agregó la 11.1 sin tener el archivo en su lista. Se sumó junto con `src/shared/search/`.
- **Dentro de `src/app/(autenticado)/informacion/`**, además de lo que el brief enumeraba, hay tres archivos más: `status-badge.tsx` (la etiqueta de estado), `[entryId]/entry-actions.tsx` (desactivar y reactivar) y `[entryId]/audit-summary.ts` con su test. Siguen el patrón de productos, y el directorio entero está en la lista.
- **El filtro de estado no tiene índice**: es derivado del día de la organización y cambia solo con el paso de los días. Se justifica en `TraceabilityMatrix.md`, en las consultas sin índice propio.

### Corridas de mutación

| Criterio | Mutación | Resultado | Restaurado |
|---|---|---|---|
| AC-3 | «hoy» calculado en UTC en lugar de la zona de la organización | `Tests 1 failed / 18 passed`. Falla el caso de las dos zonas extremas: era las 19:48 UTC, y la organización de Kiritimati (UTC+14) ya estaba en el día siguiente | 19 de 19 |
| AC-4 | la condición de búsqueda recalculando el vector en lugar de leer la columna | `Tests 1 failed / 18 passed`: el plan pasa a `Seq Scan on knowledge_entries` | 19 de 19 |
| AC-7 | un `import` de `next/cache` en `knowledge/service.ts` | con `knowledge` en la lista de `eslint.config.mjs`, 1 error (`no-restricted-imports`); **control**: sin esa línea, el mismo import da 0 errores | `lint` limpio |

Una salvedad sobre AC-3: el caso de las dos zonas se diseñó para que la mutación falle a cualquier hora. Kiritimati va 14 horas adelante de UTC y Pago Pago, 11 atrás, así que el día de al menos una de las dos siempre difiere del de UTC. La corrida de arriba lo comprobó a una hora; que falle a las demás es un razonamiento, no una medición.

**AC-5**: con la búsqueda movida a `src/shared/search/`, `drizzle-kit generate` respondió `No schema changes, nothing to migrate`, antes de agregar la tabla nueva. `catalog.test.ts` pasa sin modificarlo, con su `EXPLAIN`.

### Contraste por criterio

- **AC-1 (esquema)** — cumplido.
  - La `0018` generada crea la tabla con sus cuatro `CHECK`, el índice único sobre `lower(title)`, la columna `search` con su GIN y el valor `knowledge_entry` del enum. No toca otra tabla.
  - La `0019`, `--custom`, otorga `SELECT`, `INSERT` y `UPDATE`.
  - Aplicadas a la base de desarrollo con `npm run db:migrate`.
  - `knowledge.test.ts` comprueba los privilegios exactos, `42501` al borrar como `crm_app` y `23514` para la vigencia invertida y los límites.
  - `identity-schema` y `audit` incluyen la tabla; en `audit.test.ts`, entre las que no se borran.
- **AC-2 (FR-INFO-01)** — cumplido. Hay casos para:
  - el alta auditada con los valores recortados;
  - un `viewer` rechazado en cada escritura y en la auditoría, sin escribir nada;
  - la edición auditada solo con lo que cambió, y sin diferencias no audita;
  - un id en mayúsculas, que audita con el id de la base (la lección M-3 de la 11.1);
  - el `CONFLICT` con otras mayúsculas y frente a una inactiva;
  - las validaciones, y desactivar y reactivar con su repetición.
- **AC-3 (FR-INFO-03)** — cumplido. Hay casos para:
  - los siete estados relativos al día de Buenos Aires;
  - las dos zonas extremas, con la mutación de arriba.
- **AC-4 (FR-INFO-02)** — cumplido. Hay casos para:
  - prefijo de palabras en los tres campos, sin acentos, con todas las palabras;
  - el límite de prefijo («ferencia» no encuentra);
  - el orden por relevancia;
  - los caracteres de `tsquery` (`!pago` no niega);
  - `EXPLAIN` con `Bitmap Index Scan on knowledge_entries_search_idx`, con su mutación.
- **AC-5 (búsqueda compartida)** — cumplido. `search.test.ts` prueba que el texto buscado viaja como parámetro y nunca dentro del SQL, y la forma del escape. Decía que el escape contra PostgreSQL lo probaban los casos de integración, y **no era cierto**: `'` y `\` son separadores para el parser, así que esos casos pasaban igual sin el escape (revisión independiente, m-5). Ahora hay un caso que sí lo prueba, con su mutación.
- **AC-6 (aislamiento)** — cumplido: lectura, edición, desactivación, auditoría, lista, búsqueda y sugerencias de categoría, con la entrada de la otra organización intacta. Los ids inválidos dan `VALIDATION_ERROR` sin `fields`.
- **AC-7 (frontera)** — cumplido, con la mutación y su control.
- **AC-8 (pantallas)** — cumplido. `knowledge.spec.ts`, 9 casos:
  - alta desde la navegación, con el contenido escapado y sus saltos de línea;
  - validación y `CONFLICT` con lo escrito conservado;
  - edición auditada y sin cambios;
  - desactivar con confirmación, y reactivar;
  - búsqueda y los cinco estados desde la URL;
  - `viewer`, también forzando la URL;
  - otra organización e id inválido;
  - teclado;
  - móvil a 375 px sin desplazamiento horizontal.
  
  axe corre en claro y en oscuro en doce estados. Decía «once»: lo corrigió la revisión independiente (m-3).
- **AC-9 (FR y documentación)** — cumplido.
  - `FunctionalRequirements.md` suma la sección con FR-INFO-01 a 03 y enmienda FR-AUD-01 y FR-AUD-02 con fecha.
  - `Screens.md` suma las pantallas 11 y 12.
  - `TraceabilityMatrix.md`, `DataModel.md`, `Overview.md` y `RepositoryStructure.md` tienen lo nuevo.
  - `SecurityModel.md` pasa a 45 puntos de entrada (19 páginas, 24 Server Actions, 2 Route Handlers), con 26 fijados por la guarda, contados contra el código.
  - Cada FR está en el nombre de los casos que lo prueban.
- **AC-10** — `format:check`, `lint` y `typecheck` limpios. `npm run test` da **1064 de 1064 en 86 archivos** antes de la revisión, y **1067** después, con los archivos nuevos registrados con `git add -N` para que `exposed-surface` los viera, y después vuelto atrás. El end-to-end completo y la CI van en §Cierre.
- **AC-11** — `git status` muestra solo archivos de la lista. `catalog/repository.ts` figura como modificado, pero con el mismo hash que en `HEAD`, así que ningún commit lo incluye. `forbidden-references.test.ts` no cambió.

## Revisión independiente — 2026-09-24 (D-10)

La hizo un agente que no participó del trabajo, con acceso de solo lectura, contra este brief y `CLAUDE.md`, y **fijó la escala de severidad antes de leer el código**. No ejecutó nada. Leyó la sección de resultados mientras se escribía. **Informó 5 hallazgos menores y 8 notas, sin bloqueantes ni mayores.** Cada uno se verificó antes de aceptarlo, y las disposiciones las aprobó el usuario el 2026-09-24.

| Hallazgo | Verificación | Qué se hizo |
|---|---|---|
| **m-1**. `RepositoryStructure.md` no suma `knowledge` a los módulos con la frontera de HTTP | **Confirmado** (línea 134) | Sumado |
| **m-2**. Tres listas generales de `DataModel.md` no nombran la tabla nueva (estado, esquemas por módulo, privilegios) | **Confirmado**. La del estado tampoco nombraba `product_prices`, de la 11.1 | Sumadas las dos tablas |
| **m-3**. axe corre en 12 estados, no en 11 | **Confirmado**: 12 llamadas | Recuento corregido |
| **m-4**. Ningún test prueba el filtro de organización en el `WHERE` de las escrituras: por el servicio, `NOT_FOUND` llega antes | **Confirmado** como hueco de test | Un caso en `knowledge.test.ts` llama al repositorio directamente, dentro de la lista y sin tocar `organization-isolation.test.ts`, como aprobó el usuario. **Mutación**: sin el filtro en `updateEntryActive`, `1 failed / 20 passed`; restaurado, 21 de 21 |
| **m-5**. El escape de `searchQuery` no tenía un test de comportamiento | **Confirmado, con un matiz**, contra PostgreSQL: el parser `simple` deja una URL entera con su comilla (`'x.com/a''b?c=d'`), así que ese escape es alcanzable. La barra invertida nunca sobrevive como lexema: ese escape es defensivo | Un caso busca una URL con comilla. **Mutación**: sin duplicar la comilla, PostgreSQL rechaza la consulta (`syntax error in tsquery`); restaurado, verde. Se corrigió la afirmación de AC-5 |
| **N-1**. `catalog/repository.ts` figura como modificado | Mismo hash que en `HEAD` (`0d4761b`) | Ninguna: no entra en el commit |
| **N-2**. Tres archivos de `informacion/` que el brief no enumeraba | Están en el directorio autorizado y declarados en §Resultados | Ninguna |
| **N-3**. AC-7 no deja una guarda permanente | **Confirmado**: `module-boundary.test.ts` no tiene casos para `knowledge` | **Pendiente**: el archivo está fuera de la lista |
| **N-4**. Casos sin la etiqueta del FR que prueban | **Confirmado** | Etiquetados. Los de aislamiento e id inválido prueban AC-6, no un FR, y quedan sin etiqueta |
| **N-5**. `lower()` fuera de ASCII depende del `LC_CTYPE` | Las tres bases locales usan `en_US.utf8`. Staging, sin verificar. Mismo patrón que el SKU | **Pendiente** para el piloto (11.4) |
| **N-6**. Un carácter NUL en la búsqueda o en un campo llega a PostgreSQL | Sospecha sin ejecutar; `catalog` se comporta igual | **Pendiente**, sin subfase propia: es transversal a los formularios |
| **N-7**. Nombres de test que dicen más de lo que prueban | **Confirmado** | «en la misma transacción» salió del nombre; el caso del viewer suma `reactivar` |
| **N-8**. `whitespace-pre-line` junta la sangría | **Confirmado** | `whitespace-pre-wrap`, y el caso 1 lleva una línea con sangría. **Mutación**: con `pre-line`, el caso 1 falla; restaurado, verde |

**Una ampliación de la lista, autorizada por el usuario el 2026-09-24**: `tests/e2e/users.spec.ts`. El caso 11 tabula desde el principio de la página hasta «Nombre» con un tope de 10, y el ítem «Información» de la navegación suma una parada. Fue la condición de detención «un test existente fuera de la lista falla por los cambios». Se subió el tope a 12, como el de `products.spec.ts`, y nada más.

## Cierre — 2026-09-24 (autoevaluación)

Recuentos finales, después de las correcciones de la revisión independiente:

- `format:check`, `lint` y `typecheck`: limpios.
- Vitest: **1067 de 1067**, en 86 archivos. Los archivos nuevos se registraron con `git add -N` para que `exposed-surface` los viera, y después se volvió atrás.
- `knowledge.test.ts`: 21 de 21. `service.test.ts` de `knowledge`: 11 de 11.
- End-to-end: **94 de 94 en 7,1 minutos**, con `knowledge.spec.ts` en 9 de 9 y `users.spec.ts` en verde con el tope nuevo.

**Nivel alcanzado**: validado localmente y en CI, y validado en integración (`producer-consumer`) para las pantallas: UI, servicio y base.

**CI**: el commit `dd26e9c` corrió en la run 36056855249, leída por `headSha`: **`success` en el intento 1**, con todos los pasos en `success` y el de artefactos de Playwright en `skipped`.

**Cierre**: el usuario autorizó el commit y el push de la implementación y el cierre de la subfase el 2026-09-24.

**Pendientes**: N-3, N-5 y N-6 de §Revisión independiente; el comentario de `catalog/repository.ts` que todavía nombra `productSearchQuery`, fuera de la lista; y D-8, para la 11.4.
