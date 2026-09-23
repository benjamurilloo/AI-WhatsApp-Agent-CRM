# Evidencia 9.3 — Datos de volumen en staging

Salidas crudas de la subfase 9.3 ([brief-9.3](brief-9.3-datos-de-volumen-en-staging.md)). Se escribe a medida que se mide; lo que no está acá **no está medido**.

**Estado al 2026-09-23**: el seed multiorganización está implementado y validado localmente. **Nada se midió todavía en staging** y nada se cargó en el servidor: los AC-3 en adelante están abiertos.

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

## Lo que todavía no está medido

Los AC-3 a AC-13 están abiertos. En particular, **nada se cargó ni se midió en el servidor**, y la corrección de los parámetros de costo de D-2(a) —autorizada— no se ejecutó.
