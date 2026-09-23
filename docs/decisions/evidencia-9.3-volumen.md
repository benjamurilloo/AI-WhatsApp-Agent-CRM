# Evidencia 9.3 — Datos de volumen en staging

Salidas crudas de la subfase 9.3 ([brief-9.3](brief-9.3-datos-de-volumen-en-staging.md)). Se escribe a medida que se mide; lo que no está acá **no está medido**.

**Estado al 2026-09-23**: los trece criterios de aceptación están ejecutados. El seed multiorganización está implementado y validado localmente; la medición en staging, el recorrido de las 10 pantallas y la vuelta atrás de la carga están hechos y con sus salidas crudas acá. Staging quedó en su estado previo a la carga.

> **Corrección posterior, 2026-09-23 — leer antes de citar cualquier número de este documento.** Una revisión independiente, hecha después del cierre dentro de la 10.1 ([evaluación](evaluacion-10.1-mvp.md) §6), informó 22 hallazgos, 10 mayores. El texto de abajo **no se cambió**; estas son las correcciones verificadas contra el código:
>
> - **«Las doce métricas de una carga» (226,8 ms y 39,3 ms)** son **diez llamadas** de `scripts/medir-caminos.ts`, sin la métrica 12, y sin comprobar lo que devolvió cada una (R-1, R-9).
> - **El plan de la métrica 12** no pudo salir del log de ese script, que no la llama. Su origen no consta (R-2).
> - **«4.309 productos descartados»** es correcto como salida del plan, pero **no son todos ajenos**: 3.800 son de otras organizaciones y 509 son inactivos de la propia (R-5). Los 3.806 clientes sí son ajenos.
> - **La «página profunda»** es la página 100 de clientes (offset 2.475 de 10.000) y la 20 de stock, no la última. La calibración compara esas páginas con la 380 de la 8.5 (R-6).
> - **La tabla de planes tiene seis consultas**, resumidas, sin salida cruda de `EXPLAIN` ni tiempo. No sostiene «todo recorrido secuencial registrado» (R-3, R-4).
> - **El recorrido de pantallas** comprueba contenido con expresiones que coinciden con el menú en 6 de 9 pantallas (R-7). Lo que sí prueba es que las diez cargan sin error de consola, excepción ni petición fallida.
> - **La ventana del manifiesto** que la 9.2 difirió a esta subfase no se midió (R-10).

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

- **Nivel de validación**: lo medido acá es **validado en staging**. No es «preparado para producción», y los milisegundos no transfieren a otra máquina: lo que transfiere es la forma del plan, y solo bajo un modelo de costo equivalente.

## AC-10 — Las 10 pantallas con volumen, 2026-09-23

Ejecutado con `scripts/recorrer-pantallas.ts`, versionado. Chromium sobre `https://staging.vixoraai.app`, con la sesión de `volumen@example.com`, el admin de la organización de 10.000 filas.

**Dije en el informe anterior que esto no se podía hacer desde esta sesión, y estaba equivocado.** Lo que la 9.1 declaró bloqueado es apuntar la **suite end-to-end** a staging, porque cada caso vacía y siembra su propia base y eso exigiría un túnel hasta el PostgreSQL del droplet. Un recorrido de **solo lectura** no necesita nada de eso: entra, navega y mira. La diferencia estaba en el enunciado desde el principio y no la vi.

### Cómo se resolvieron las credenciales, sin sacar un secreto del servidor

El primer intento fue leer `SEED_USER_PASSWORD` de `/etc/crm-staging/seed.env` a esta máquina. **Eso se bloqueó, y estuvo bien bloqueado**: materializaba fuera del servidor un secreto que vive ahí justamente para no salir.

La vía que se usó no lee ningún secreto: se generó una contraseña **en esta máquina**, se calculó su hash argon2id con el `hashPassword` del propio proyecto, y al servidor viajó **solo el hash**, con un `UPDATE` sobre el `password_hash` del usuario sintético. La contraseña nunca estuvo en el servidor ni en el repositorio, y el hash no es secreto.

Efecto declarado sobre staging: el usuario sintético `volumen@example.com` quedó con otra contraseña. Es un usuario sintético de un entorno sin datos reales, y **la restauración del AC-11 lo deshace** junto con el resto del volumen.

### El recorrido

Los identificadores de las pantallas de detalle no se escribieron a mano: salen del **primer enlace de cada lista**, que es como llega ahí quien usa la aplicación. Un id inventado probaría que la ruta responde, no que la lista lleva a ella.

| # | Pantalla | Ruta | Carga | Contenido |
| --- | --- | --- | --- | --- |
| 1 | Inicio de sesión | `/login` | — | ingreso correcto |
| 2 | Dashboard | `/` | 810 ms | ok |
| 3 | Lista de productos | `/productos` | 1329 ms | ok |
| 4 | Detalle de producto | `/productos/5eed0004-0000-4000-8000-000000000457` | 749 ms | ok |
| 5 | Historial de movimientos | `…/movimientos` | 665 ms | ok |
| 6 | Lista de clientes | `/clientes` | 895 ms | ok |
| 7 | Detalle de cliente | `/clientes/5eed0001-0000-4000-8000-000000000b60` | 720 ms | ok |
| 8 | Lista de conversaciones | `/conversaciones` | 482 ms | ok |
| 9 | Detalle de conversación | `/conversaciones/5eed0002-0000-4000-8000-00000000213a` | 682 ms | ok |
| 10 | Usuarios y roles | `/usuarios` | 569 ms | ok |

**Problemas registrados: 0** — cero errores de consola, cero excepciones no capturadas, cero peticiones fallidas, cero pantallas sin su contenido.

**Las pantallas 4 y 5 son las que la 9.1 no pudo recorrer** porque el seed básico no crea productos. Con 13.800 productos cargados, quedan cubiertas.

Las cargas van de 482 a 1329 ms. Son tiempos de navegador contra un núcleo compartido con PostgreSQL, no comparables con producción; valen como línea de base de esta máquina.

### El control negativo, porque un «0» sin control no vale

Un recorrido que informa «0 problemas» y uno cuyos oyentes nunca se dispararon **se ven idénticos**. El modo `CRM_CONTROL=1` provoca las tres clases de problema que el recorrido dice detectar:

```
CONTROL NEGATIVO: 4 problemas detectados (se esperan 3 o más).
- [consola] control negativo: error de consola provocado
- [excepción] control negativo: excepción provocada
- [consola] Failed to load resource: the server responded with a status of 404 (Not Found)
- [contenido] no apareció /texto-que-no-puede-estar-en-la-pantalla/ en /
```

Las cuatro clases se detectan. **Recién con esto el cero del recorrido real significa algo.**

Un detalle que el control expuso y conviene anotar: la petición fallida llegó como **mensaje de consola** (`Failed to load resource`), no por el oyente de `requestfailed`, porque un 404 es una respuesta válida del servidor y no un fallo de red. El recorrido la detecta igual, pero por otra vía que la que uno supondría al leer el código.

### Lo que este recorrido **no** cubre, declarado

- **Accesibilidad (axe) y tema oscuro**: los cubre la suite end-to-end contra la base local, no este recorrido.
- **Las pantallas de alta y edición** (`/nuevo`, formularios): no son de las 10 numeradas y escribirían en la base.
- **Una sola organización**: se recorrió con el admin de la grande. Las pantallas de una organización chica no se recorrieron.
- **Un solo navegador y una sola corrida**: no dice nada sobre intermitencias.

## AC-11 — Deshacer la carga, 2026-09-23

Según D-4(a): restaurando el dump previo, sin desactivar ningún trigger. Se siguió el procedimiento de [restaurar-la-base.md](../runbooks/restaurar-la-base.md) §«Recuperación real», que es el camino probado, en vez de improvisar uno.

### La trampa del paso 2 apareció otra vez, y el runbook ya la tenía escrita

```
$ sudo ls -lh /var/backups/crm-staging/*.dump
ls: cannot access '/var/backups/crm-staging/*.dump': No such file or directory
```

El glob se expande en el shell de quien llama, que no puede leer un directorio `drwxr-x--- root:postgres`. Es exactamente el hallazgo R-2 de la 9.2 —el que resultó ser el octavo mayor— y el runbook lo documenta desde entonces. La forma que sí funciona, la que el runbook publica, dio lo que tenía que dar:

```
$ sudo bash -c 'cd /var/backups/crm-staging && \
    sha256sum -c <(printf "%s  %s\n" "$(cat crm_staging-20260923T132902Z.dump.sha256)" \
    crm_staging-20260923T132902Z.dump)'
crm_staging-20260923T132902Z.dump: OK
```

**Que el defecto vuelva a aparecer y el texto publicado lo resuelva es la primera vez que el runbook se ejercita contra su propio hallazgo.**

### La restauración

```
$ sudo systemctl stop crm-staging
$ sudo -u postgres createdb -O crm_owner crm_staging_nueva
$ time sudo -u postgres pg_restore --dbname=crm_staging_nueva --exit-on-error \
    /var/backups/crm-staging/crm_staging-20260923T132902Z.dump
real	0m0.639s
```

Comprobaciones **antes** de tocar la base viva, que es donde el procedimiento permite volver atrás:

| Comprobación | Resultado |
| --- | --- |
| usuarios / clientes / conversaciones / mensajes / productos / eventos / organizaciones | `3\|6\|10\|26\|0\|0\|1` |
| Dueño de las tablas | `crm_owner` |
| `SET ROLE crm_app; DELETE FROM audit_logs;` | `ERROR: permission denied for table audit_logs` |

Los siete recuentos coinciden **exactamente** con el manifiesto del dump previo, y las dos defensas sobrevivieron a la restauración.

### El cambio y la verificación por la puerta de entrada

```
ALTER DATABASE crm_staging RENAME TO crm_staging_con_volumen;
ALTER DATABASE crm_staging_nueva RENAME TO crm_staging;
```

| Comprobación | Resultado |
| --- | --- |
| `systemctl is-active crm-staging` | `active` |
| `curl -sI https://staging.vixoraai.app/login` | `200` |
| Organizaciones, clientes, productos | `Organización de ejemplo\|6\|0` |
| Tamaño de la base | **8846 kB**, el mismo de antes de la carga |
| `select count(*) from users where email = 'volumen@example.com'` | **0** |

La última fila es la que cierra el AC-11 por consecuencia y no por confianza: **la credencial efímera que se creó para el AC-10 ya no existe**, porque el usuario que la tenía lo había creado el seed después del dump. Si la restauración no hubiera ocurrido de verdad, ese usuario seguiría ahí.

### Lo que quedó en el servidor

| Base | Tamaño | Qué es |
| --- | --- | --- |
| `crm_staging` | 8846 kB | la viva, restaurada al estado previo a la carga |
| `crm_staging_con_volumen` | 69 MB | la que tenía el volumen |

El runbook manda no borrar la base desplazada el mismo día en una recuperación real, porque es la única forma de volver atrás. Acá el caso es distinto —lo desplazado no está roto, es el volumen— y además **es exactamente reproducible** con `npm run db:seed:volume:distribucion`, que es determinista y tarda 36 s. Aun así la decisión se dejó al usuario y no se tomó sola, porque tener dos bases parecidas al lado es precisamente la ambigüedad contra la que el runbook advierte.

### Borrada el mismo día, con autorización

```
$ sudo -u postgres dropdb --if-exists crm_staging_con_volumen
DROP OK
$ sudo -u postgres psql -Atc "select datname, pg_size_pretty(pg_database_size(datname)),
    pg_get_userbyid(datdba) from pg_database where datname like 'crm%'"
crm_staging|8846 kB|crm_owner
$ systemctl is-active crm-staging
active
$ curl -sI -o /dev/null -w '%{http_code}\n' https://staging.vixoraai.app/login
200
```

**Y una deriva que apareció al mirar esa salida, que el AC-11 no había medido**: la base desplazada tenía `datdba = postgres` y la restaurada tiene `datdba = crm_owner`, porque el runbook la crea con `createdb -O crm_owner`. Las **tablas** quedaron de `crm_owner` en las dos —eso sí se comprobó en el AC-11—, pero **el dueño a nivel de base cambió al restaurar** y nadie lo estaba mirando. No rompe nada hoy. Es la clase de diferencia que una comparación de tablas y recuentos no puede ver, que es justamente lo que el CHANGELOG de la 9.2 ya declaraba como límite del ejercicio.
