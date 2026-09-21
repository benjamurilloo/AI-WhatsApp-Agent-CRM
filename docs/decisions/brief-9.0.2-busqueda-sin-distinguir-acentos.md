---
schema: task-brief.v1
task_id: 9.0.2
task_type: implementation
title: Búsqueda sin distinguir acentos
phase: 9
depends_on: []
evidence_level: deterministic
status: aprobado e implementado; validado localmente
---

# 9.0.2 — Búsqueda sin distinguir acentos

## Objetivo

Que buscar `jose` encuentre a `José` y que buscar `cafe` encuentre `Café`, en la búsqueda de clientes por nombre y en la de productos por nombre, sin perder el índice que hoy sostiene esas dos consultas.

## Por qué existe esta subfase

Es la deuda más vieja del proyecto sin aterrizar. El [brief-4.2](brief-4.2-servicio-de-catalogo.md) la excluyó del alcance nombrando la extensión; el [brief-4.4](brief-4.4-ui-de-productos-e-inventario.md) la asignó a la Fase 8; **ninguna de las cinco subfases de la Fase 8 la tomó** y la fase cerró sin ella. La detectó el preflight del cierre. El 2026-09-21 el usuario la reasignó a la Fase 9 y la descomposición la aterrizó acá, con una condición escrita en el Roadmap que esta subfase cumple: que dejara de estar asignada a una fase y pasara a estar asignada a una subfase.

## Hallazgos de verificación (2026-09-21)

Los tres primeros cambian el diseño, no son color.

1. **`unaccent()` es `STABLE`, no `IMMUTABLE`.** Leído en la fuente instalada de la extensión, no en documentación web ni de memoria: `/usr/share/postgresql/18/extension/unaccent--1.1.sql` declara las dos sobrecargas como `LANGUAGE C STABLE STRICT PARALLEL SAFE`. **Consecuencia directa: `unaccent(...)` no puede aparecer en una expresión de índice.** PostgreSQL solo admite funciones inmutables ahí, porque un índice cuyo contenido pueda cambiar sin que la fila cambie es un índice corrupto. Este es el problema central de la subfase, y es la razón por la que "agregar `unaccent` a la consulta" no es un cambio de una línea.
2. **La extensión es `trusted`.** `unaccent.control` dice `trusted = true`, así que en PostgreSQL 13+ la puede instalar el **dueño de la base** sin ser superusuario. Importa para la 9.1: el despliegue no necesita credenciales de superusuario para esto. **No verificado todavía** contra el rol concreto de staging, que no existe.
3. **Sería la primera extensión del proyecto.** `grep "CREATE EXTENSION" drizzle/*.sql` no devuelve nada. No hay precedente de cómo se declara ni de cómo se ordena respecto de los `GRANT` a `crm_app` ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)).
4. **Son exactamente dos consultas y dos índices.** Búsqueda de productos por nombre: `lower(name) like` en [catalog/repository.ts:110](../../src/modules/catalog/repository.ts#L110), sostenida por `products_organization_name_lower_idx` (`0006`, `text_pattern_ops`). Búsqueda de clientes por nombre: `lower(display_name) like` en [crm/repository.ts:86](../../src/modules/crm/repository.ts#L86), sostenida por `clients_organization_display_name_lower_idx` (`0008`, `text_pattern_ops`).
5. **Hay un tercer y un cuarto uso de `lower(display_name)` que NO son búsqueda: son orden.** [crm/repository.ts:116](../../src/modules/crm/repository.ts#L116) y [:132](../../src/modules/crm/repository.ts#L132) ordenan por `lower(display_name)`. Cambiarlos alteraría el orden visible de la lista de clientes —`Ávila` dejaría de ir después de `Avila`— y eso **no es lo que se pidió**. Quedan fuera.
6. **El SKU no entra.** [catalog/repository.ts:111](../../src/modules/catalog/repository.ts#L111) compara `lower(sku) = lower(texto)`: igualdad exacta sobre un código, no búsqueda de texto. Un SKU con acento sería un dato anómalo, y hay un índice único `products_organization_sku_lower_unique` que define la identidad del producto. Tocarlo cambiaría qué SKUs colisionan.
7. **El teléfono tampoco.** La búsqueda de clientes por teléfono compara `phone_e164` exacto y no tiene texto que acentuar.
8. **`likePrefix` escapa `%`, `_` y `\`** en los dos módulos, duplicado en ambos ([catalog:93](../../src/modules/catalog/repository.ts#L93), [crm:69](../../src/modules/crm/repository.ts#L69)). El escape se mantiene: quitarlo abriría una inyección de patrón.

## Alcance incluido

- Migración nueva que crea la extensión `unaccent` y lo que haga falta para poder indexar (ver D-1), con sus `GRANT` si corresponde.
- Las **dos** consultas de búsqueda por nombre dejan de distinguir acentos.
- Los **dos** índices se rehacen sobre la expresión nueva, para que la búsqueda por prefijo siga usando índice.
- Tests de integración con datos acentuados, en los dos módulos, incluida la dirección inversa: buscar `josé` encuentra `Jose`.
- Evidencia de que el índice se usa, con `EXPLAIN`, antes y después.
- Actualización de `DataModel.md`, `brief-4.2`, `brief-4.4`, `Roadmap.md` y `EngineeringStandards.md` si la extensión cambia el procedimiento de puesta en marcha.

## Alcance excluido

- **El orden de la lista de clientes** (hallazgo 5). Es otra decisión de producto: si `Ávila` y `Avila` deben ordenarse juntos. No se toca de paso.
- **El SKU y el teléfono** (hallazgos 6 y 7).
- **Búsqueda por palabra interior o difusa** (`pg_trgm`, `%texto%`, similitud). Sigue siendo búsqueda por prefijo. Ampliarla es otra subfase y cambiaría el costo de las consultas medido en la 8.5.
- **Búsqueda de texto completo** (`tsvector`). No se abre.
- **Normalización de los datos guardados.** El nombre se guarda como lo escribió la persona; lo que cambia es cómo se compara.
- **Reevaluar el rendimiento con volumen**, que es de la 9.3. Acá solo se comprueba que el índice se **usa**, no que la consulta cumpla un umbral con 10.000 filas.

## Lista cerrada de archivos

| Archivo | Qué cambia |
| --- | --- |
| `drizzle/0015_*.sql` (nueva) | extensión, función de envoltura si D-1 la necesita, índices nuevos |
| `src/modules/catalog/schema.ts` y `src/modules/crm/schema.ts` | declaración de los índices, para que el control de desfase de CI no falle |
| `src/modules/catalog/repository.ts` | la consulta del hallazgo 4 |
| `src/modules/crm/repository.ts` | la consulta del hallazgo 4, **no** las de orden |
| `tests/integration/catalog.test.ts` y `tests/integration/crm.test.ts` | casos con acentos |
| `docs/architecture/DataModel.md` | la extensión y los índices |
| `docs/decisions/brief-4.2-*.md` y `brief-4.4-*.md` | cerrar el puntero de la deuda |
| `docs/planning/Roadmap.md` | estado de la 9.0.2 |
| este brief | resultado y desvíos |

Tocar algo fuera de esta lista exige autorización en el turno. En particular: **si hace falta cambiar `EngineeringStandards.md`, `ci.yml` o `docker-compose.yml` para que la extensión exista en CI, se detiene y se pide autorización** (condición de detención 4).

## Decisiones a tomar, con recomendación

- **D-1 — Cómo indexar una función que no es inmutable.** Tres caminos:
  1. **Función de envoltura declarada `IMMUTABLE`** que llama a `unaccent('unaccent'::regdictionary, $1)`. Es la forma que usa la comunidad y la única que permite un índice de expresión. **Tiene una mentira adentro**: se le declara al planificador una inmutabilidad que la función no tiene. Es correcta solo mientras el diccionario `unaccent` no cambie; si cambiara, los índices quedarían silenciosamente mal y habría que reindexar. Pasar el diccionario explícito en vez de depender del `search_path` es parte de lo que la hace segura.
  2. **Columna generada** `name_normalized` con el texto ya normalizado, indexada directamente. No miente sobre inmutabilidad… salvo que una columna generada **también** exige una expresión inmutable, así que necesita la misma envoltura. Además agrega una columna por tabla y toca el modelo de datos.
  3. **Sin índice**: aceptar el recorrido secuencial en la búsqueda por nombre. Descartado: la 8.5 midió y fijó estos caminos, y la 9.3 va a medir con volumen; perder el índice acá sería introducir a mano la regresión que esas subfases existen para evitar.

  **Recomendación: (1), con la limitación escrita en la migración y en `DataModel.md`, y con el diccionario explícito.** Es el menor cambio de modelo y el único que no agrega una columna. La limitación se declara, no se esconde: **la corrección del índice depende de que el diccionario `unaccent` no cambie**, y eso hay que escribirlo donde se vea.
- **D-2 — Qué hace la consulta con el texto buscado.** Recomendación: aplicar la misma normalización a los dos lados, `envoltura(lower(columna)) like envoltura(lower(texto))`, con el orden de `lower` y la envoltura **fijado y usado igual** en la consulta y en el índice. Si los dos no coinciden exactamente, el índice no se usa y nada falla de forma visible — solo se vuelve lento. Por eso AC-4 lo comprueba con `EXPLAIN` y no por lectura.
- **D-3 — Qué pasa con los índices viejos.** Recomendación: **reemplazarlos**, no sumar. Las dos consultas dejan de existir en su forma actual, así que los índices de `0006` y `0008` quedarían sin ningún usuario, ocupando espacio y costando en cada escritura.
- **D-4 — `CREATE EXTENSION IF NOT EXISTS` o sin `IF NOT EXISTS`.** Recomendación: **con** `IF NOT EXISTS`, porque la base de test se recrea y la de CI se levanta de cero en cada corrida, y una migración que falla por algo ya presente no aporta seguridad.

## Invariantes que no se rompen

- El nombre guardado no cambia: la normalización es de comparación, no de almacenamiento.
- El orden de la lista de clientes no cambia (hallazgo 5).
- Qué SKUs colisionan no cambia (hallazgo 6).
- `likePrefix` sigue escapando `%`, `_` y `\`.
- El aislamiento por organización de las dos consultas no se toca: ambas conservan su `organization_id` en el `where`, cerrado en la 3.4 y reverificado en la 9.0.1.

## Criterios de aceptación

- **AC-1** — Buscar sin acentos encuentra el registro acentuado, **y al revés**, en productos y en clientes: cuatro casos mínimos (`jose`→`José`, `josé`→`Jose`, y los equivalentes en productos).
- **AC-2** — La búsqueda sigue siendo **por prefijo**: `ose` no encuentra `José`. Un caso que lo demuestre, para que la subfase no amplíe el alcance sin decirlo.
- **AC-3** — Mayúsculas y minúsculas siguen sin distinguirse, y el escape de `%` y `_` sigue vigente: un caso con `50%` en el nombre.
- **AC-4** — `EXPLAIN` muestra que las dos búsquedas **usan el índice nuevo**, con la salida registrada en el brief. Es el criterio que no se puede cumplir por lectura del código.
- **AC-5** — El control de desfase de migraciones de CI pasa: los índices declarados en los `schema.ts` coinciden con la migración.
- **AC-6** — El orden de la lista de clientes no cambió: un caso con `Avila`, `Ávila` y `Bravo` que fije el orden actual.
- **AC-7** — 781 tests o más, más los nuevos, y 81 end-to-end, con typecheck, lint y formato limpios. Las cifras se miden.
- **AC-8** — La limitación de D-1 queda escrita en la migración y en `DataModel.md`: el índice es correcto mientras el diccionario `unaccent` no cambie.

Nivel de evidencia: `deterministic`. La extensión corre en el PostgreSQL real de desarrollo y de CI, no en un mock.

## Autorizaciones que esta subfase necesita

1. **Crear una migración y aplicarla contra la base local de desarrollo y de test.** `CLAUDE.md` lo exige explícitamente. No hay base de staging ni de producción todavía, así que el efecto queda en el entorno local.
2. Nada más. No instala dependencias de npm: `unaccent` viene con la imagen de PostgreSQL, ya verificado en el contenedor.

## Condiciones de detención

1. No hay commit, push ni despliegue sin autorización explícita en el turno.
2. **Si la envoltura inmutable no permite que el índice se use** —AC-4 falla—, se detiene y se informa antes de seguir. No se acepta perder el índice en silencio, que es justamente lo que la 8.5 midió para evitar.
3. Si aparece un tercer lugar del código que compare nombres y no esté en los hallazgos, se **registra** y se eleva. No se corrige por analogía: es la cuarta vez que esta condición hace falta en este linaje, y las tres anteriores encontraron algo.
4. Si la extensión no puede crearse en CI o en el contenedor local sin cambiar `ci.yml`, `docker-compose.yml` o `EngineeringStandards.md`, se detiene y se pide autorización: esos archivos no están en la lista cerrada.
5. Si el orden de la lista de clientes cambia, se detiene: significaría que el hallazgo 5 se aplicó mal.

## Resultado (2026-09-21)

Implementada según el brief, con D-1 a D-4 en la forma recomendada y **un cambio de diseño que el brief no traía** (ver más abajo). El orden de la lista de clientes, el SKU y el teléfono quedaron sin tocar.

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| AC-1 | cumplido | cuatro direcciones cubiertas en `catalog.test.ts` y `crm.test.ts`: `azucar`→«Azúcar», `cafe molido`→«Café molido», `yérba`→«Yerba», `jose`/`josé`→«José Ñandú» y «Jose Simple» |
| AC-2 | cumplido | `zucar` y `andu` no encuentran nada: sigue siendo prefijo |
| AC-3 | cumplido | los casos de `50%` y `5_` que ya existían siguen pasando; `immutable_unaccent(lower('José Ñandú Café 50%'))` devuelve `jose nandu cafe 50%`, con el `%` intacto |
| AC-4 | cumplido | `EXPLAIN` muestra `Index Cond: (... AND immutable_unaccent(lower(name)) ~>=~ 'caf' AND ... ~<~ 'cag')` sobre `products_organization_name_unaccent_idx`, y el equivalente en `clients` |
| AC-5 | cumplido | `drizzle-kit generate` responde «No schema changes, nothing to migrate» |
| AC-6 | cumplido | el orden sigue siendo `Ángel`, `Avila`, `Ávila`, `Bravo`, fijado en un caso propio |
| AC-7 | cumplido | 786 tests (302 unitarios, 79 guardas, 405 de integración) y 81 end-to-end; typecheck, lint y formato limpios |
| AC-8 | cumplido | la limitación está en la cabecera de `0015` y en la sección nueva de [DataModel](../architecture/DataModel.md) |

### Cambio de diseño que el brief no traía: una sola definición de la expresión

El brief daba por sentado que la expresión del índice y la de la consulta estarían escritas **dos veces** —una en `schema.ts`, otra en `repository.ts`— y que un test con `EXPLAIN` vigilaría que no se separaran. Al implementarlo quedó claro que eso deja el problema abierto: el test comprueba el estado de hoy y no impide que mañana alguien toque una de las dos.

Como `schema.ts` y `repository.ts` son **el mismo módulo**, la expresión se define una sola vez, en `searchNormalized`, y la usan el índice y la consulta. La desincronización pasa de «vigilada por un test» a **imposible**. Es un cambio dentro de la lista cerrada de archivos y no amplía el alcance.

### Un defecto propio, encontrado al comprobar que el test podía fallar

La primera versión del caso de AC-4 afirmaba que el plan **nombra** el índice. **No discriminaba nada.** Los dos índices normalizados empiezan por `organization_id`, así que el planificador los usa igual para resolver solo la organización, dejando el nombre en `Filter`. Verificado: con la consulta sin normalizar, el plan seguía nombrando un índice.

Es la tercera vez en este linaje que aparece una aserción que no puede fallar —después de las siete de la 9.0.1 y del detector de la guarda— y esta vez la encontró la propia implementación, al ejecutar la mutación en lugar de suponer su resultado. La aserción se cambió por la que sí discrimina: que el prefijo entre como **cota del índice** (`~>=~`) y no como `Filter`. Bajo la mutación, el prefijo cae a `Filter` y el planificador cambia de índice, así que el caso falla.

Efecto secundario: el caso necesita filas. Con tres, el planificador elige cualquier índice para la organización y deja el nombre en `Filter`, sin que eso signifique nada. Cada caso inserta 2.000 filas sintéticas, declaradas como tales.

### Lo que esta subfase no certifica

- **Rendimiento con volumen.** Se comprueba la **forma del plan**, no que la consulta cumpla un umbral. Eso es de la 9.3, que además va a medir con varias organizaciones.
- **Que el diccionario `unaccent` no cambie.** Es la limitación de D-1, aceptada y escrita, no resuelta.
- **Nada sobre el orden de la lista de clientes**, que sigue distinguiendo acentos a propósito. Si alguna vez se decide unificarlo, es una decisión de producto con su propia subfase.
