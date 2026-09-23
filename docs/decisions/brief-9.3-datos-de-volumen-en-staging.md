# Brief 9.3 — Datos de volumen en staging

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `runtime-validation`
- **Nivel de evidencia objetivo**: `isolated-runtime`
- **Nivel de validación alcanzable**: **validado en staging**, y solo para lo que se mida con evidencia capturada. Esta subfase **no** alcanza *preparado para producción*, y el motivo no es el de siempre: acá el límite es la máquina. Ver §«Lo que esta subfase no va a poder demostrar».
- **Orden**: después de la **9.2**, cerrada el 2026-09-22.
- **No abre ni cierra gate.** Los gates de la Fase 9 son la 9.1 (entrada) y la 9.4 (salida), según [Roadmap](../planning/Roadmap.md) §Fase 9. La revisión independiente **no es obligatoria** acá; se recomienda igual, y el argumento es propio: esta subfase produce **números que van a citarse como evidencia** en la 9.4 y en la Fase 10, y un número mal medido no falla — se cita.
- **Sin precondición bloqueante.** La 9.1 dejó el entorno y la 9.2 dejó el backup que hace reversible cargar volumen.
- **Estado de este documento**: **aprobado el 2026-09-23**. Las siete decisiones están resueltas; ver §Resolución. Las cuatro que bloqueaban el arranque las respondió el usuario ese día, las siete por la recomendación.

## Objetivo

Medir el sistema con **datos de volumen repartidos en varias organizaciones**, en el entorno desplegado, y registrar el plan de cada consulta junto con su tiempo.

El objetivo no es «que sea rápido». Es cerrar una deuda que cuatro subfases distintas dejaron abierta con la misma frase: **todo se midió con una sola organización dueña de casi todas las filas**. Con esa distribución, `where organization_id = X` no filtra nada, así que el planificador elige recorridos completos —y elige bien—. Ese plan no es el que va a elegir cuando haya veinte organizaciones y la consulta toque el 5 % de la tabla. Lo que se midió hasta hoy es correcto y **no predice** el caso que importa.

La deuda es de la 6.3 (D-4), de la 7.1 a la 7.3, de la 8.5 y de la 9.0.2, y hasta el 2026-09-21 no tenía subfase: era de la clase de obligación que sobrevive fases enteras porque nombra una fase y nunca una subfase.

El segundo objetivo viene de la descripción de la tarea en Notion y no del Roadmap: **carga reproducible del seed de volumen y limpieza por identidad exacta**. La limpieza es donde apareció el problema de diseño que domina este brief (D-4).

## Lo que se verificó antes de escribir este brief

Todo lo de esta sección está **medido**, no supuesto. Las mediciones sobre el servidor son de solo lectura.

### La máquina de staging no puede dar un número comparable con producción

```
/dev/vda1  24G  5.6G  18G  24% /
Mem: total 961 MB, disponible 503 MB
nproc: 1
```

**Un núcleo, 961 MB de RAM, y PostgreSQL en la misma máquina que la aplicación.** El [brief-9.1](brief-9.1-infraestructura-de-staging.md) ya lo había dicho al excluir el rendimiento de su alcance: «medirlo en 1 núcleo con 961 MB daría un número que no significa nada para producción», y lo difirió **a esta subfase**. O sea que la 9.3 hereda una medición que el brief anterior declaró imposible de interpretar en esta máquina.

No es una contradicción a resolver ignorando a alguno de los dos. Se resuelve separando dos cosas que la palabra «rendimiento» junta:

- **La forma del plan** —índice o recorrido completo, orden del join, estimación de filas— la decide el planificador a partir de **las estadísticas de la tabla y los parámetros de costo**, no de la velocidad del procesador. Eso **sí** transfiere, con la condición de D-2.
- **El tiempo absoluto en milisegundos** lo decide la máquina. Eso **no** transfiere, y en esta máquina ni siquiera transfiere a sí mismo entre corridas, porque 961 MB de RAM con 128 MB de `shared_buffers` significa que la caché se llena y se vacía según qué corrió antes.

Por eso el veredicto de esta subfase es sobre **planes**, y los tiempos se registran como línea de base de esta máquina, no como criterio.

### El modelo de costo del planificador describe una máquina que no existe

Leído de `pg_settings` en `crm_staging`:

| Parámetro | Valor en staging | Lo que implica |
| --- | --- | --- |
| `shared_buffers` | **128 MB** | razonable para 961 MB |
| `effective_cache_size` | **4 GB** | el valor por defecto de PostgreSQL, en una máquina que tiene **961 MB en total** |
| `random_page_cost` | **4** | el valor por defecto, pensado para disco mecánico; el droplet tiene SSD |
| `work_mem` | 4 MB | los ordenamientos sobre 10.000 filas pueden volcarse a disco |

**`effective_cache_size` está sobreestimado unas seis veces.** No es un parámetro que reserve memoria: es lo que el planificador *cree* que va a encontrar en caché, y con 4 GB cree que casi todo está cacheado, lo que **abarata los recorridos por índice** y lo inclina a elegirlos.

`random_page_cost = 4` empuja exactamente al revés: encarece el acceso aleatorio y lo inclina a **recorridos completos**.

Que los dos errores apunten en direcciones opuestas es **peor** que uno solo, no mejor: no se cancelan de forma conocida, y deja de poder razonarse en qué dirección está sesgado un plan. Medir la forma del plan sobre este modelo de costo es medir las decisiones de un planificador que describe una máquina imaginaria.

Esto es D-2, y es la decisión que hay que tomar **antes** de medir, no después de ver los resultados. Es la convención del proyecto desde la 8.4 (D-2) y la 8.5 (D-1): el criterio se fija antes de mirar.

### La limpieza «por identidad exacta» está prohibida por el ADR 0013

La descripción de la tarea en Notion pide «limpieza por identidad exacta». Contra el esquema, eso **no se puede hacer** para cuatro tablas. De `drizzle/0012_conversations_privileges_and_insert_only.sql:15`:

```sql
CREATE TRIGGER messages_insert_only
BEFORE UPDATE OR DELETE ON messages
FOR EACH ROW EXECUTE FUNCTION messages_reject_change();
```

La función lanza excepción sin mirar quién ejecuta. **No es un permiso: es un trigger, y corre para todos los roles**, incluido el dueño y un superusuario. El comentario de la migración lo dice explícitamente: «segunda defensa, efectiva para cualquier rol». Lo mismo hacen `audit_logs` (0003), `inventory_movements` (0005) e `ingestion_events` (0012, que además rechaza `DELETE` por separado para no perder la detección de reenvíos).

Entonces hay una contradicción documental, y se registra citando las dos fuentes en vez de resolverla en silencio:

- **Notion, tarea 9.3** (`3d8702be-6f4e-818a-b205-ea19b3541b56`, editada el 2026-09-21): «limpieza por identidad exacta».
- **[ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)** y las migraciones 0003, 0005 y 0012: esas cuatro tablas no admiten `DELETE` por ningún camino que no sea desactivar el trigger.

Según la jerarquía de fuentes de verdad de `CLAUDE.md`, el código y las migraciones versionadas (nivel 1) ganan sobre Notion (nivel 4), que además no vale para decisiones técnicas. Así que **la limpieza por `DELETE` no es una opción de implementación, es una reapertura del ADR 0013**. Es D-4.

### El seed de volumen es de una sola organización, por construcción

`seeds/volume.ts` tiene `VOLUME_ORGANIZATION_ID` como constante y la usa en las veinte inserciones. Los ids se derivan así (`seeds/volume.ts:141`):

```ts
function volumeId(kind: 1|2|3|4|5|6|7, index: number): string {
  return `5eed000${kind}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}
```

El id depende **solo** del índice de fila. Sembrar una segunda organización con el mismo código produciría los mismos ids de cliente y chocaría contra la clave primaria. Así que el esquema de ids tiene que ganar una dimensión de organización **sin perder el determinismo**, que es lo que hace que el seed sea idempotente y que la fila *i* sea la misma con cualquier tamaño.

Es trabajo de implementación real en `seeds/`, no un parámetro de línea de comandos. `src/` no se toca (salvo lo que active D-7).

### El seed puede correr contra staging, y hoy staging no tiene volumen

`isSeedableDatabase` acepta los sufijos `_dev`, `_test`, `_e2e` y `_staging` (`seeds/basic.ts:50`), y la base se llama `crm_staging`, así que el ancla pasa. Estado actual medido:

| Organización | Clientes | Conversaciones | Productos |
| --- | --- | --- | --- |
| Organización de ejemplo | 6 | 10 | **0** |

Tamaño total de la base: **8846 kB**. Es el seed básico y nada más. Eso confirma por qué la 9.1 no pudo recorrer `/productos/[id]` ni `/productos/[id]/movimientos` en su AC-11: no hay un solo producto. Con volumen cargado, esas dos rutas pasan a ser recorribles, y por eso la 9.1 las dejó asignadas acá.

## Umbral y criterio, fijados antes de medir

La 8.5 fijó **200 ms por consulta y 400 ms para el camino completo** (D-1), sobre una máquina de desarrollo. Aplicar el mismo número a un droplet de un núcleo confundiría «esta consulta es patológica» con «esta máquina es chica», que es precisamente el error que invalidaría el resultado. Es D-3.

Sea cual sea la respuesta a D-3, estas dos reglas rigen y no dependen de ella:

1. **El veredicto es sobre la forma del plan.** Un recorrido secuencial se registra **siempre**, cumpla el tiempo o no, con el tamaño de la organización desde la que se midió. Es la regla que la 8.5 ya aplicó, y acá es el entregable principal.
2. **Un plan que cambia de forma entre una organización grande y una chica es el hallazgo que esta subfase existe para encontrar**, y se registra aunque los dos tiempos cumplan.

## Decisiones

Las cuatro primeras **necesitan tu respuesta**. Las tres últimas llevan recomendación y se pueden aprobar en bloque.

### D-1 — Cuántas organizaciones y de qué tamaños (**necesita tu decisión**)

Una sola organización grande no ejercita nada nuevo. Dos organizaciones iguales tampoco: con 50 % cada una, `organization_id = X` sigue sin ser selectivo y el planificador sigue eligiendo recorrido completo, correctamente. **Lo que cambia el plan es la selectividad, y la selectividad la da la asimetría.**

- **(a) 1 grande (10.000) + 3 medianas (1.000) + 16 chicas (50)** — 20 organizaciones, ~13.800 clientes en total. La grande sigue siendo el 72 % (recorrido completo esperado y correcto); las chicas son el 0,4 % (índice esperado). Se mide desde las dos puntas y la comparación es el resultado.
- **(b) 1 grande (10.000) + 1 chica (50)** — el mínimo que produce la comparación. Más barato de cargar y de limpiar; no ejercita la estadística `n_distinct` de `organization_id` con un número realista de valores distintos.
- **(c) 20 organizaciones de 700 cada una** — reparto parejo. Ninguna domina, todas son poco selectivas de la misma forma. No reproduce el caso real y **no** reproduce el actual: no sirve de comparación contra la 8.5.

**Recomendación: (a).** Es la única que produce las tres situaciones a la vez —la organización que domina la tabla, la que es una minoría clara, y un número de organizaciones distintas que hace que `n_distinct` signifique algo— y el costo extra sobre (b) es tiempo de carga, no complejidad de diseño. El volumen total estimado queda cómodo en los 18 GB libres; **el número exacto se mide en la carga y se registra**, no se estima en este brief.

### D-2 — Qué se hace con los parámetros de costo antes de medir (**necesita tu decisión**)

Medido arriba: `effective_cache_size` = 4 GB en una máquina de 961 MB, y `random_page_cost` = 4 sobre SSD.

- **(a) Corregirlos a la máquina antes de medir** — `effective_cache_size` a ~700 MB y `random_page_cost` a ~1.1. Los planes pasan a ser los de un planificador que describe esta máquina. **Es un cambio de configuración en el servidor de staging y afecta a la aplicación que corre ahí, así que necesita tu autorización explícita.** Queda versionado en `deploy/staging/` como el resto de la configuración (H-1 de la 9.1), y eso obliga a extender la guarda de `deploy/staging/` o a declarar por qué no.
- **(b) Medir como está y declarar el sesgo** — no se toca nada, y cada plan queda registrado con la nota de que fue elegido bajo un modelo de costo falso, con los dos errores apuntando en direcciones opuestas. Barato y honesto, pero el entregable principal de la subfase —la forma del plan— queda con una condición que no se puede levantar después sin volver a medir.
- **(c) Medir las dos veces** — la misma tanda con los parámetros por defecto y con los corregidos. Es el doble de trabajo y produce el dato más interesante de los tres: **qué planes cambian solo por corregir el modelo de costo**, que es un hallazgo aprovechable en producción.

**Recomendación: (a)**, y (c) si querés el dato extra. (b) solo si preferís no tocar el servidor en esta subfase — es defendible, pero entonces conviene decirlo ahora y no descubrirlo al leer los resultados.

Y un punto que no depende de cuál elijas: **sea cual sea el valor, se registra junto a cada plan.** Un `EXPLAIN` sin sus parámetros de costo no es reproducible.

### D-3 — Qué umbral vale en esta máquina (**necesita tu decisión**)

- **(a) Los mismos 200 / 400 ms de la 8.5.** Comparable de una sola lectura. Riesgo: en un núcleo compartido con la aplicación, es probable que consultas perfectamente sanas lo pasen, y entonces el veredicto mide la máquina.
- **(b) Recalibrar la máquina primero.** Correr en staging la **misma tanda de la 8.5 con una sola organización**, comparar contra sus números de desarrollo, obtener el factor de esta máquina y escalar el umbral por ese factor. Cuesta una tanda extra y convierte el umbral en un criterio que significa algo acá.
- **(c) Sin umbral de tiempo.** El veredicto es solo la forma del plan; los tiempos se registran sin juicio.

**Recomendación: (b).** Tiene un beneficio que (a) y (c) no tienen: la tanda de calibración es **una reproducción de la 8.5 en otra máquina**, así que si algún plan sale distinto con la misma distribución de datos, eso ya es un hallazgo antes de sembrar la segunda organización — y aísla «cambió la máquina» de «cambió la distribución», que es justamente lo que esta subfase tiene que distinguir.

### D-4 — Cómo se deshace la carga (**necesita tu decisión**)

Medido arriba: `messages`, `audit_logs`, `inventory_movements` e `ingestion_events` rechazan `DELETE` por trigger, para todos los roles.

- **(a) Restaurar el backup previo a la carga.** Se toma un dump antes de sembrar y se restaura después. **No desactiva ningún trigger** y usa el instrumento que la 9.2 dejó probado. Además **paga sola la deuda que la 9.2 dejó a esta subfase**: el tiempo de restauración al volumen real, con el número medido sobre datos que pesan. Contra: devuelve la base al estado anterior, así que se pierde cualquier cosa escrita en staging durante la medición — en staging eso no es una pérdida, y si lo fuera conviene saberlo ahora.
- **(b) Recrear la base**: `dropdb` + `createdb` + migraciones + seed básico. Igual de limpio, no ejercita la restauración y por lo tanto no paga la deuda de la 9.2.
- **(c) `DELETE` con los triggers desactivados**, bajo `ALTER TABLE … DISABLE TRIGGER` en una transacción. Es lo que literalmente pide la tarea en Notion. **Desaconsejado, fuerte**: deja versionado en el repositorio un script cuyo trabajo es apagar la defensa del ADR 0013, y ese script no tiene forma de saber contra qué base lo apuntaron. El ancla `_staging` del seed protege la carga, no el borrado. Si lo querés igual, **es una reapertura del ADR 0013** y se decide ahí, no acá.
- **(d) No limpiar.** El volumen se queda y el piloto de la 9.4 usa una organización propia. Más barato, y deja staging permanentemente distinto de producción.

**Recomendación: (a).** Es la única opción que convierte la limpieza en **evidencia**: el mismo acto que deshace la carga mide la restauración al volumen real, que es exactamente lo que la 9.2 declaró que no podía medir con 55 KB de datos. Y no toca ninguna defensa.

### D-5 — La métrica 12 y los eventos de ingestión

[Risks](../planning/Risks.md) dice que la métrica 12 «se vuelve a medir con datos de staging en la Fase 9, junto con las otras once». Pero `ingestion_events` está vacía, no hay emisor conectado, y el seed de volumen no siembra eventos.

**Recomendación: sembrarla, y solo si D-4 resuelve (a) o (b).** `ingestion_events` rechaza `DELETE` de forma incondicional y sin la rama de excepción que tiene `messages`: si se siembran eventos y la limpieza es por `DELETE`, **no hay vuelta atrás por ningún camino**. Con (a) o (b) el problema no existe. La medición sigue siendo con datos sintéticos y eso se declara: esta subfase **no** cierra la parte de ese riesgo que pide un emisor real.

### D-6 — Dónde corre el seed

Con 961 MB y un núcleo, y con el antecedente de que `next build` murió por memoria en esa máquina hasta que se le puso swap.

**Recomendación: en el droplet, con la aplicación detenida durante la carga**, y con la carga por lotes que el seed ya hace (`BATCH = 1000`). Detener la aplicación quita el competidor de memoria y hace la carga reproducible; staging no tiene tráfico que proteger. La alternativa —sembrar desde la máquina local por un túnel hasta el PostgreSQL del droplet— mueve todas las filas por SSH y expone el puerto de la base, y no vale la pena.

### D-7 — Qué pasa si algo resulta patológico

**Recomendación: el mismo criterio de la 8.5 (D-5).** Se corrige **solo lo patológico**, con el plan de antes y de después; lo que cumple no se toca aunque se le vea mejora. Si la corrección exige una migración de índice, eso es un cambio en `src/` y en `drizzle/` y **se te consulta antes**, con el plan medido como argumento. Si no aparece nada patológico, `src/` no se toca y el resultado se declara con la misma precisión que la 8.5: no significa que el sistema escale, significa que con esta distribución y en esta máquina ninguna consulta lo es.

## Resolución

Respondidas por el usuario el **2026-09-23**. Las siete quedaron según la recomendación.

| Decisión | Resolución |
| --- | --- |
| **D-1** | **(a)** 1 organización de 10.000 + 3 de 1.000 + 16 de 50. Veinte en total. |
| **D-2** | **(a)** Corregir los parámetros de costo a la máquina —`effective_cache_size` a ~700 MB, `random_page_cost` a ~1.1— y versionarlos en `deploy/staging/`. **Autorizado el cambio en el servidor**, y se vuelve a confirmar en el turno en que se ejecute. |
| **D-3** | **(b)** Recalibrar: reproducir la tanda de la 8.5 con una sola organización en staging, obtener el factor de la máquina y escalar el umbral de 200 / 400 ms por ese factor. |
| **D-4** | **(a)** Dump previo a la carga y restauración para deshacerla. No se desactiva ningún trigger y se mide el tiempo de restauración al volumen, que es deuda nominal de la 9.2. |
| **D-5** | Se siembran `ingestion_events` para la métrica 12. Habilitado por D-4(a): con la vuelta atrás por restauración, el `DELETE` incondicional de esa tabla deja de ser un camino sin retorno. Sigue siendo sintético y se declara. |
| **D-6** | El seed corre **en el droplet con la aplicación detenida**, por lotes. No se abre un túnel hasta el PostgreSQL. |
| **D-7** | Se corrige **solo lo patológico**, con el plan de antes y de después, y una migración de índice se consulta antes de escribirla. Es el criterio de la 8.5 (D-5). |

La condición de detención 1 queda **levantada**: D-1 a D-4 están resueltas.

## Alcance

1. **Extender el seed de volumen a varias organizaciones**, con el esquema de ids ganando una dimensión de organización sin perder determinismo ni idempotencia, y con sus tests de integración.
2. **Tomar el dump previo** a la carga (instrumento de la 9.2) y verificarlo.
3. **Calibrar la máquina** reproduciendo la tanda de la 8.5 con una sola organización (D-3).
4. **Cargar el volumen** según D-1, registrando tiempo de carga y tamaño resultante de la base.
5. **Correr `ANALYZE`** y registrar las estadísticas relevantes —`n_distinct` de `organization_id`, filas por tabla y por organización— *antes* de medir. Un plan medido sobre estadísticas viejas no dice nada.
6. **Medir con `EXPLAIN (ANALYZE, BUFFERS)`, desde una organización grande y desde una chica**:
   - las once consultas de listado de la 8.5 (productos, inventario, clientes);
   - las consultas del servicio de conversaciones de la 6.3;
   - las doce métricas de la 7.1 a la 7.3;
   - la búsqueda sin acentos de la 9.0.2, que se comprobó por forma del plan y nunca contra un umbral con volumen;
   - la **paginación profunda** de la lista de clientes (Risks), que es la forma que peor se degrada.
7. **Medir el dashboard fuera de local**: las doce consultas de una carga de pantalla 2, camino completo, no solo los planes.
8. **Recorrer las 10 pantallas con volumen**, incluidas `/productos/[id]` y `/productos/[id]/movimientos`, que la 9.1 no pudo recorrer por falta de productos.
9. **Deshacer la carga según D-4**, y si es (a), **medir el tiempo de restauración al volumen** — deuda explícita de la 9.2 — y **volver a medir la ventana del manifiesto de recuentos**, que la 9.2 declaró que crece con la duración del dump.
10. **Registrar todo en `docs/decisions/evidencia-9.3-volumen.md`** con las salidas crudas, como hicieron la 9.1 y la 9.2, y actualizar `Risks.md` cerrando las filas que esta subfase salde.

## Fuera de alcance, explícitamente

- **Cualquier SLA o promesa de latencia productiva.** El umbral es un detector de patologías, no un compromiso. Lo dice la NFR y lo repitió la 8.5.
- **Optimizar lo que no sea patológico** (D-7).
- **Datos reales o de un emisor real.** Todo lo que se siembra es sintético y se declara como tal. La parte del riesgo de la métrica 12 que exige un emisor **no** se cierra acá.
- **Dimensionar la máquina de producción.** Con un núcleo y 961 MB no se puede concluir nada sobre eso, y esta subfase no lo va a intentar.
- **Apuntar la suite end-to-end contra staging.** Exigiría un túnel hasta el PostgreSQL del droplet y cambiar su configuración; sigue abierto desde la 9.1 y no es de acá.
- **La reevaluación de APM y tracing**, que es de la 9.4 (8.4, D-6).
- **Prueba de carga o de concurrencia.** Esto mide volumen de datos, no usuarios simultáneos. Son cosas distintas y confundirlas sería el mismo error que confundir el plan con el tiempo.

## Criterios de aceptación

- **AC-1** — El seed de volumen siembra varias organizaciones con la distribución de D-1, es determinista e idempotente, y una segunda corrida no cambia ninguna fila. Con test.
- **AC-2** — Los ids siguen siendo derivables y no colisionan entre organizaciones. Con test que lo demuestre fallando si el esquema pierde la dimensión de organización.
- **AC-3** — Existe un dump previo a la carga, verificado con su `sha256` y con su manifiesto de recuentos.
- **AC-4** — La calibración de D-3 está hecha y su factor registrado, o D-3 se resolvió por otra opción y está declarado.
- **AC-5** — Los parámetros de costo quedan registrados junto a cada plan, sea cual sea la resolución de D-2.
- **AC-6** — Cada consulta del alcance tiene su plan medido **desde una organización grande y desde una chica**, con su tiempo, y las dos salidas crudas capturadas.
- **AC-7** — Todo recorrido secuencial está registrado aunque cumpla el tiempo, con el tamaño de la organización desde la que se midió.
- **AC-8** — Toda consulta que **cambia de forma de plan** entre la organización grande y la chica está identificada y explicada.
- **AC-9** — El dashboard tiene medido su camino completo en staging, con volumen, no solo sus planes.
- **AC-10** — Las 10 pantallas cargan sin error de consola con volumen, incluidas las dos rutas de producto que la 9.1 no pudo recorrer.
- **AC-11** — La carga quedó deshecha según D-4, y verificado que se deshizo.
- **AC-12** — Si D-4 es (a): el tiempo de restauración al volumen está medido, y la ventana del manifiesto de recuentos vuelta a medir. Las dos son deudas nominales de la 9.2.
- **AC-13** — `Risks.md` refleja qué filas saldó esta subfase y cuáles no, sin redondear.

## Condiciones de detención

1. **D-1 a D-4 sin resolver: no se empieza.** Sin distribución no hay seed; sin decisión sobre los parámetros de costo, los planes no son interpretables; sin criterio, no hay veredicto; y sin camino de vuelta, la carga es irreversible en cuatro tablas.
2. **Si la carga no entra en disco o la máquina muere por memoria**, se detiene y se informa con la medición, antes de bajar el tamaño por conveniencia.
3. **Si aparece una consulta patológica**, se detiene la medición y se consulta (D-7) antes de tocar `src/` o `drizzle/`.
4. **Si la restauración de D-4(a) falla**, eso es un hallazgo **mayor** de la 9.2, no un contratiempo de la 9.3: significa que el instrumento que se declaró validado no resiste volumen. Se detiene y se informa.
5. **Si al deshacer la carga queda una sola fila sintética**, se informa antes de declarar la limpieza hecha.

## Lo que esta subfase **no** va a poder demostrar

- **Que el sistema rinde en producción.** Un núcleo, 961 MB y la base compartiendo máquina con la aplicación. Los milisegundos de acá no predicen los de allá, y el brief no va a presentarlos como si lo hicieran.
- **Que los planes de producción serán estos.** Dependen de los parámetros de costo y de las estadísticas reales. Con D-2(a) dependen de un modelo de costo *correcto para esta máquina*, que no es el de producción.
- **Que la distribución elegida es la real.** Es una hipótesis sobre cómo se van a repartir las organizaciones, declarada como tal. Si el uso real resulta distinto, la medición se rehace — y eso es de la Fase 10, no una falla de acá.
- **Nada sobre concurrencia.** Ni un solo usuario simultáneo se ejercita acá.
- **Que la métrica 12 funciona con datos reales.** Sigue sin emisor.

## Revisión independiente

No es obligatoria —esta subfase no abre ni cierra gate— y se recomienda igual, por un motivo propio: **el entregable de esta subfase son números que se van a citar**. Un instrumento roto falla y se nota; un número mal medido se cita en la 9.4, en la Fase 10 y en la decisión de dimensionar producción, y nunca falla.

El precedente pesa: la revisión independiente de la 9.2 informó **21 hallazgos, 8 mayores, ninguno falso**, y cinco de esos mayores eran instrumentos que corrían en verde sin hacer lo que prometían. Los tres puntos donde conviene que mire primero:

1. **Que el plan registrado corresponda a la consulta que corre la aplicación**, y no a una versión simplificada escrita a mano para el `EXPLAIN`. Es el modo de falla más probable de toda esta subfase.
2. **Que la organización «chica» desde la que se mide sea de verdad chica** en el momento de medir, y no la grande con otro nombre.
3. **Que la limpieza haya limpiado**, verificado por consulta y no por la ausencia de errores.

La escala de severidad se fija **antes** de mirar el código, como desde la 8.4. La condición de cierre no es que una revisión no encuentre nada: es que ningún hallazgo sea mayor ni toque un número que vaya a citarse.
