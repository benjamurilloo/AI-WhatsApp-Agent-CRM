# Evidencia 9.3 — Datos de volumen en staging

Salidas crudas de la subfase 9.3 ([brief-9.3](brief-9.3-datos-de-volumen-en-staging.md)). Se escribe a medida que se mide; lo que no está acá **no está medido**.

**Estado al 2026-09-23**: el seed multiorganización está implementado y validado localmente, y la medición en staging está hecha. **Quedan abiertos el AC-10** —recorrer las 10 pantallas con volumen, que exige un navegador— **y el AC-11**, deshacer la carga, que se deja para después del AC-10 porque restaurar borraría el volumen.

---

## Estado de partida del servidor, medido el 2026-09-23

Lecturas de solo lectura sobre el droplet, antes de tocar nada.

### La máquina

```
$ df -h / | tail -1
/dev/vda1        24G  5.6G   18G  24% /

$ free -m | head -2
               total        used        free      shared  buff/cache   available
Mem:             961         457          94          37         602         503

$ nproc
1
```

Un núcleo, 961 MB, 18 GB de disco libres. PostgreSQL y la aplicación comparten la máquina.

### La base

```
$ sudo -u postgres psql -d crm_staging -tAc "select pg_size_pretty(pg_database_size(current_database()))"
8846 kB
```

```
$ sudo -u postgres psql -d crm_staging -tAc "select o.id, o.name, (...) from organizations o order by o.name"
5eed0000-0000-4000-8000-000000000001|Organización de ejemplo|6|10|0
```

Una sola organización, 6 clientes, 10 conversaciones y **0 productos**. Esto confirma por qué la 9.1 no pudo recorrer `/productos/[id]` ni `/productos/[id]/movimientos` en su AC-11: no hay un solo producto que abrir.

### Los parámetros de costo del planificador

```
$ sudo -u postgres psql -d crm_staging -tAc "select name, setting, unit from pg_settings where name in (...)"
effective_cache_size|524288|8kB
maintenance_work_mem|65536|kB
max_connections|100|
random_page_cost|4|
shared_buffers|16384|8kB
work_mem|4096|kB
```

Convertido:

| Parámetro | Valor | Observación |
| --- | --- | --- |
| `shared_buffers` | 128 MB | razonable para 961 MB |
| `effective_cache_size` | **4 GB** | el valor por defecto de PostgreSQL, en una máquina de **961 MB** |
| `random_page_cost` | **4** | el valor por defecto para disco mecánico; el droplet tiene SSD |
| `work_mem` | 4 MB | los ordenamientos sobre 10.000 filas pueden volcarse a disco |

**Este es el hallazgo que cambió el alcance de la subfase.** `effective_cache_size` no reserva memoria: es lo que el planificador *cree* que va a encontrar en caché. Con 4 GB cree que casi todo está cacheado y **abarata los recorridos por índice**. `random_page_cost = 4` empuja al revés: encarece el acceso aleatorio y favorece los recorridos completos.

Los dos errores apuntan en direcciones opuestas, y eso es peor que uno solo: no se cancelan de forma conocida, así que no se puede razonar en qué dirección está sesgado un plan. Medir la forma del plan sobre este modelo de costo sería medir las decisiones de un planificador que describe una máquina imaginaria. Resuelto en D-2(a): se corrigen antes de medir, se versionan, y **se registran junto a cada plan**.

---

## El seed multiorganización

### Lo que cambió

| Archivo | Cambio |
| --- | --- |
| `seeds/volume.ts` | El ordinal de organización entra en la derivación de ids, de correos y del generador pseudoaleatorio. `seedVolumeOrganization` siembra una; `seedVolumeDistribution` recorre las veinte; `seedVolume` queda como estaba. Se agregan eventos de ingestión (D-5). |
| `package.json` | `npm run db:seed:volume:distribucion`. |
| `tests/guards/volume-seed-identity.test.ts` | **Nueva guarda**, 16 casos. |
| `tests/integration/volume-distribution.test.ts` | **Nuevo**, 8 casos contra PostgreSQL real. |
| `docs/development/Environments.md` | Documenta el comando nuevo, y **corrige una línea desactualizada**: decía que los seeds se niegan si la base no termina en `_dev`, `_test` o `_e2e`, y la 9.1 había agregado `_staging`. |

### La decisión de diseño que sostiene la calibración

El ordinal viaja en el **segundo grupo del UUID**, que estaba fijo en `0000`:

```
5eed0001-0000-4000-8000-000000000000   ordinal 0, cliente 0   (idéntico a antes de la 9.3)
5eed0001-0003-4000-8000-000000000000   ordinal 3, cliente 0
```

Para el ordinal 0 el identificador es el histórico **carácter por carácter**, y lo mismo vale para la semilla del generador, que recibe el ordinal por XOR con un multiplicador propio (`Math.imul(0, …) = 0`).

No es una cortesía hacia los tests. La calibración de D-3 reproduce en staging la tanda de la 8.5 para separar «cambió la máquina» de «cambió la distribución». Si los datos de la organización histórica hubieran cambiado, esa resta mediría **tres** cosas a la vez y no lo diría.

### La trampa que aparece recién con la segunda organización

`users.email` es único en **toda** la tabla, no por organización. Con una sola organización esa restricción nunca se ejercitaba; con veinte es la primera que se rompe, y se rompe **a mitad de la carga**, después de haber escrito cientos de miles de filas. Por eso el correo lleva el ordinal —conservando el histórico para el 0— y hay un caso que lo comprueba contra la base.

### La guarda: 16 casos, con dos mutaciones ejecutadas

```
$ npx vitest run --project guards tests/guards/volume-seed-identity.test.ts
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

Las dos mutaciones no son decorativas: cada una vuelve verde un caso que sin ella no discriminaría nada.

| Mutación | Qué simula | Resultado |
| --- | --- | --- |
| Derivar todos los ids con `ordinal = 0` | que el id pierda la dimensión de organización, que es la forma anterior a la 9.3 | 1.000 ids colapsan a 50 |
| Dominio de correo sin el ordinal | que el correo de los miembros no se distinga entre organizaciones | aparecen repetidos |

Lo que la guarda **no** comprueba, declarado en su cabecera: el contenido de las filas. Que el cliente *i* tenga el mismo nombre y el mismo teléfono depende del generador y se mira contra la base, no en una función pura.

### Los casos de integración: 8, contra PostgreSQL real

```
$ npx vitest run --project integration tests/integration/volume-distribution.test.ts
 Test Files  1 passed (1)
      Tests  8 passed (8)
```

El que sostiene la subfase es «la organización 0 queda igual que con el seed de una sola organización»: siembra con `seedVolume`, calcula la huella md5 de clientes, conversaciones y mensajes, vacía la base, siembra la distribución y compara. **Tiene control negativo**: otra organización del mismo tamaño **no** da la misma huella, así que la igualdad no viene de una huella que no discrimina.

**Un defecto propio, encontrado al ejecutar.** El caso de los correos usaba `where email = any(${esperados})`, y Drizzle expande un array de JavaScript como **lista de parámetros**, no como array: PostgreSQL respondió `op ANY/ALL (array) requires array on right side` (SQLSTATE 42809). Reescrito comparando conjuntos, que además es más fuerte: ahora falla tanto si falta un correo como si sobra uno que el seed no debería haber escrito.

### Suite completa

```
$ npm run test
 Test Files  76 passed (76)
      Tests  924 passed (924)
```

Por proyecto: **194 guardas en 10 archivos**, 316 unitarios, 414 de integración.

### Una intermitencia observada, sin explicación

Una corrida del proyecto `guards` falló **una vez**: `Tests 1 failed | 193 passed (194)`. La salida se filtró con `grep` y **el nombre del caso se perdió**. Once corridas posteriores del mismo proyecto dieron 194/194, seis de ellas con la salida completa capturada en archivo.

No se reprodujo y **no se le pone diagnóstico**. Es la segunda observación de esta clase sobre el mismo proyecto de tests: la 9.0.1 registró una corrida de 44 s contra 2,7 s de las estables, también sin reproducir, y la 9.0.3 tumbó la explicación que tenía —el techo de 5 s— sin poder reemplazarla. Queda anotada acá por si aparece una tercera, que sería el momento de investigarla en serio.

El error de método está identificado y corregido para las próximas: **filtrar la salida de una corrida con `grep` pierde exactamente la información que hace falta cuando falla**. Desde acá se escribe a archivo y se filtra después.

---


## La medición en staging, 2026-09-23

Todo lo de acá se midió con la aplicación **detenida** durante la carga (D-6) y con el script versionado `scripts/medir-caminos.ts`, que invoca los **servicios reales**. Mediana de 5 corridas tras una de calentamiento.

### Un defecto del método, descubierto antes de medir

El script de medición de la 8.5 **vivía en el scratchpad y no se versionó**, así que su tanda no se puede repetir: la 9.3 tuvo que reconstruirla. Por eso el de esta subfase queda en `scripts/`. Un número que no se puede volver a medir no es una línea de base.

### Un defecto del instrumento, descubierto midiendo

La primera tanda dio esto:

```
| conversations.listConversations                  | 0.4 ms |
| inventory.listStockMovements (producto con 400)  | 2.3 ms |   (8.5 en desarrollo: 8.2 ms)
```

Un camino **más rápido que en una máquina de desarrollo cuatro veces más veloz** no es un buen número, es un síntoma. Las dos llamadas estaban fallando la validación de filtros y volviendo sin tocar la base: `allOr(...)` espera `"all"` y se le pasaba `""`. **Un `Failure` devuelto en microsegundos es indistinguible de una consulta veloz si el instrumento solo mira el reloj.**

Corregido en dos partes: los filtros, y el instrumento, que ahora declara en cada fila qué devolvió la llamada —filas leídas o el código de la falla—. Con eso, un camino que no se ejecutó no puede entrar en la tabla como el más rápido del sistema.

### AC-4 — Calibración de la máquina (D-3b)

Misma organización, mismos datos, los mismos 10.000 clientes que la 8.5. La única diferencia es la máquina. Los recuentos de la carga lo confirman antes de comparar nada: 10.000 clientes, 65.260 mensajes, 8.563 saldos y 37.967 movimientos, **los mismos cuatro números de la 8.5**.

| Camino | 8.5, desarrollo | staging | Factor |
| --- | --- | --- | --- |
| `catalog.searchProducts` (sin texto) | 31,4 ms | 130,8 ms | **4,17×** |
| `inventory.listProductStock` (sin filtro) | 133,1 ms | 425,7 ms | **3,20×** |
| `inventory.listProductStock` (página profunda) | 114,5 ms | 388,5 ms | **3,39×** |
| `crm.searchClients` (sin texto) | 7,9 ms | 18,1 ms | **2,29×** |
| `conversations.searchClientsByLastInteraction` | 53,6 ms | 118,2 ms | **2,21×** |
| `organizations.listMembers` | 8,7 ms | 14,7 ms | **1,69×** |
| `inventory.listStockMovements` | 8,2 ms | 6,7 ms | **0,82×** |

**El factor de esta máquina no es un número: va de 0,82× a 4,17×, con mediana 2,29×.** Y la dispersión tiene una explicación medible, no es ruido: los caminos que **componen en memoria** se degradan 3-4× —el núcleo único— y los que son casi puro SQL, 1-2×. `listStockMovements`, que lee 25 filas por índice, es incluso más rápido acá.

Eso confirma desde otro ángulo lo que la 8.5 ya había medido: en `listProductStock` el 96 % del tiempo ocurre **después** del plan. Un solo núcleo castiga exactamente esa parte.

**Umbral resultante**: 400 ms × 2,29 = **916 ms** para el camino completo en esta máquina.

Y una consecuencia concreta de haber elegido D-3(b) y no D-3(a): `inventory.listProductStock` mide **440,3 ms**, por encima del umbral de 400 ms de la 8.5. Con el umbral sin recalibrar se habría declarado patológica una consulta que no cambió y cuyo plan es el correcto. **El veredicto habría medido la máquina.**

### AC-5 — Los parámetros de costo, corregidos y versionados

Aplicados con `deploy/staging/postgresql-crm-staging.conf` en `conf.d`, y verificados efectivos:

```
effective_cache_size|76800|8kB      (= 600 MB, antes 4 GB)
random_page_cost|1.1|               (antes 4)
shared_buffers|16384|8kB            (sin tocar)
work_mem|4096|kB                    (sin tocar)
```

`diff` del archivo del servidor contra el del repositorio: **cero diferencias**.

Con **una sola organización**, corregirlos **no movió ningún tiempo** más allá del ruido. Es el resultado esperado y conviene decirlo en vez de esconderlo: con una organización dueña de todo, `organization_id = X` no filtra nada y el recorrido completo es la decisión correcta bajo cualquier modelo de costo. El modelo de costo importa cuando hay una decisión que tomar.

### La carga de la distribución

```
Distribución de volumen aplicada: 20 organizaciones, 13800 clientes, 13800 conversaciones,
90100 mensajes, 13800 productos, 51830 movimientos, 750 miembros y 27600 eventos de
ingestión en 35.6 s.
```

Base: **69 MB** (antes 8.846 kB). Disco: 18 GB libres, sin cambio apreciable.

Estadísticas después de `ANALYZE`, que es lo que hace que la medición signifique algo:

| Tabla | `n_distinct` de `organization_id` |
| --- | --- |
| clients | 21 |
| conversations | 21 |
| messages | 21 |
| products | 20 |
| inventory_movements | 20 |
| ingestion_events | 20 |

Pasó de **1** a **20-21**. Ese número es la premisa de toda la subfase: es lo que le permite al planificador estimar selectividad.

### AC-6 y AC-8 — Los planes, desde las dos puntas

El SQL no se escribió a mano. Se encendió `log_min_duration_statement = 0` en el rol, se corrió el script, y se extrajeron del log de PostgreSQL las sentencias que los servicios **realmente emiten**. Es el primer punto que el brief mandó vigilar.

| Consulta | Organización GRANDE (10.000) | Organización CHICA (50) | Cambia |
| --- | --- | --- | --- |
| Productos activos | **Seq Scan**, 9.491 filas, **4.309 descartadas** | Index Scan (`products_organization_sku_lower_unique`) | **Sí** |
| Clientes, total | Index Only Scan (`clients_organization_id_id_unique`) | Index Only Scan (`clients_organization_display_name_unaccent_idx`) | **Sí**, otro índice |
| Clientes, página profunda | **Seq Scan** + top-N heapsort 705 kB, **3.806 descartadas** | Index Scan + quicksort 30 kB | **Sí** |
| Conversaciones, listado | Index Scan + Incremental Sort | igual | no |
| Clientes, prefijo con `unaccent` | Index Scan (`..._unaccent_idx`), 961 filas | igual, 3 filas | no |
| Eventos de ingestión por período (métrica 12) | Index Only Scan, 3.281 filas | igual, 23 filas | no |

**Tres de seis cambian de forma según el tamaño de la organización.** Es exactamente el hallazgo que esta subfase existía para producir, y que con una sola organización era invisible por construcción.

**El hallazgo que más enseña está en la columna de la izquierda**, no en la comparación: sobre la organización grande, el recorrido secuencial ahora **lee y descarta las filas de las otras organizaciones** —4.309 productos y 3.806 clientes que no son suyos—. Con una sola organización eso era imposible: no había filas ajenas que descartar. **La organización dominante paga por las demás**, y ese costo crece con el total de la tabla, no con su propio tamaño.

No es patológico hoy y no se corrige (D-7): el plan es correcto, la consulta cumple el umbral, y la 8.5 ya fijó que lo que cumple no se toca. Queda **registrado** por la regla de D-1 de la 8.5, que manda anotar todo recorrido secuencial aunque cumpla el tiempo, porque el tiempo solo no dice cómo se degrada.

**Límite del método**: los planes se tomaron con `EXPLAIN` sobre valores literales, o sea el plan *custom*. La aplicación usa sentencias preparadas con parámetros, donde PostgreSQL puede pasar a un plan *genérico* después de varias ejecuciones. No se comprobó si alguno de estos seis cambia al genérico; queda declarado y no medido.

### AC-6 — Caminos completos con las veinte organizaciones

| Camino | GRANDE (10.000) | CHICA (50) |
| --- | --- | --- |
| `catalog.searchProducts` | 121,3 ms | 4,5 ms |
| `inventory.listProductStock` (sin filtro) | **440,3 ms** | 9,3 ms |
| `inventory.listProductStock` (página profunda) | 424,7 ms | 11,2 ms |
| `crm.searchClients` (sin texto) | 23,1 ms | 3,9 ms |
| `crm.searchClients` (página profunda) | 38,7 ms | 4,9 ms |
| `crm.searchClients` (prefijo) | 17,6 ms | 4,0 ms |
| `conversations.listConversations` | 15,0 ms | 9,4 ms |
| `conversations.searchClientsByLastInteraction` | 142,4 ms | 8,7 ms |
| `organizations.listMembers` | 19,9 ms | 4,0 ms |
| `inventory.listStockMovements` | 12,7 ms | 7,8 ms |
| Métricas 1 a 11, la más lenta (tiempo de primera respuesta) | 51,1 ms | 6,8 ms |

**Veredicto contra el umbral recalibrado de 916 ms: ninguna consulta es patológica.** El máximo es `listProductStock` con 440,3 ms, menos de la mitad del umbral. **D-7 no se activó y `src/` no se tocó.**

### AC-9 — El dashboard fuera de local

Las doce métricas de una carga, en paralelo, que es como las pide la pantalla 2:

| Escenario | Mediana |
| --- | --- |
| 1 organización, parámetros por defecto | 169,8 ms |
| 1 organización, parámetros corregidos | 188,4 ms |
| 20 organizaciones, desde la GRANDE | **226,8 ms** |
| 20 organizaciones, desde una CHICA | 39,3 ms |

Es la primera medición del dashboard fuera de la máquina de desarrollo: 226,8 ms para la pantalla entera sobre un núcleo, con veinte organizaciones.

### AC-12 — Backup y restauración al volumen real

La deuda que la 9.2 dejó nominalmente a esta subfase, porque allá la base eran 55 KB y el número no predecía nada.

| Medición | Con 55 KB (9.2) | Con volumen (9.3) |
| --- | --- | --- |
| Tamaño del dump | 55.996 bytes | **4.746.187 bytes** |
| Backup completo, por `systemctl start` | ~1 s | **~2 s** |
| Ejercicio de restauración completo | ~2 s | **5,08 s** |

El ejercicio pasó con la aplicación **corriendo**:

```
OK: 15 tablas coinciden en existencia y en recuento
OK: el conjunto de tablas del origen es el mismo que el restaurado
OK: las tablas restauradas siguen siendo de crm_owner
OK: la base crm_staging_restore_check_20260923T134700Z no existe
```

Restaurar 90.126 mensajes, 51.830 movimientos y 27.600 eventos lleva **cinco segundos** en esta máquina. Y el manifiesto de recuentos que la 9.2 introdujo **aguantó el volumen**: no hubo falla por deriva pese a que la aplicación estaba viva durante el ejercicio, que es el escenario exacto que hizo fallar la primera corrida por timer.

### Lo que sigue abierto

- **AC-10 — las 10 pantallas con volumen, sin error de consola.** **No ejecutado.** Exige un navegador autenticado y no se puede hacer desde esta sesión. La carga está puesta y la aplicación corriendo en `https://staging.vixoraai.app` (responde 200 en `/login`), así que el recorrido se puede hacer cuando haya quien lo haga; `/productos/[id]` y `/productos/[id]/movimientos`, que la 9.1 no pudo abrir por falta de productos, ahora tienen 13.800.
- **AC-11 — deshacer la carga.** Deliberadamente **no ejecutado todavía**: restaurar el dump previo borraría el volumen y con él la posibilidad de hacer el AC-10. El dump previo está verificado y esperando (`crm_staging-20260923T132902Z.dump`, sha256 `b1455087…`).
- **AC-13 — `Risks.md`.** Pendiente hasta que cierren los dos anteriores.
- **Nivel de validación**: lo medido acá es **validado en staging**. No es «preparado para producción», y los milisegundos no transfieren a otra máquina: lo que transfiere es la forma del plan, y solo bajo un modelo de costo equivalente.
