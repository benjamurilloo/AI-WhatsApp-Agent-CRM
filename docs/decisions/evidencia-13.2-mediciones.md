# Evidencia de la 13.2 — Mediciones previas a exponer datos reales

Salidas crudas de la subfase 13.2 ([brief-13.2](brief-13.2-mediciones-previas-a-datos-reales.md)).

**Autoevaluación.** Todo lo de este archivo lo midió el mismo agente que implementó la subfase.

**Datos.** Todos los datos son sintéticos: salen de `seeds/volume.ts`. Los teléfonos, los nombres y los identificadores que aparecen en los planes son de ese seed.

**Cómo leer los bloques.** Cada bloque trae el comando y su salida literal. Un bloque marcado `[transcrito]` no es literal: resume una salida que se leyó en la sesión.

## Etapa 13.2.1 — local, 2026-09-30

Máquina de desarrollo, con PostgreSQL 18.6 en Docker (`postgres:18.6-trixie`). **Ningún tiempo de esta etapa es una medición**: el ensayo prueba que los instrumentos corren, no cuánto tarda producción.

### AC-1 (O-2): las consultas de la aplicación no dejan sentencias preparadas con nombre

**La lectura.** Un agente de solo lectura leyó los paquetes instalados, y las citas se verificaron una por una:

- `pg` 8.23.0, `node_modules/pg/lib/query.js:35-58`: `requiresPreparation()` devuelve verdadero con `this.name`, y si no, solo cuando hay valores. Sin nombre, `pg-protocol` manda la cadena vacía, que es la sentencia sin nombre (`dist/serializer.js:45` y `:90`).
- `drizzle-orm` 0.45.2, `node-postgres/session.js:21-23`: el `name` de la configuración es el argumento que recibe `prepareQuery`. `pg-core/query-builders/select.js:797`: `execute` llama a `this._prepare()` sin nombre. `pg-core/db.js:276-281`: `db.execute` pasa `void 0`.
- En `src/`, `scripts/` y `seeds/` no hay ningún `.prepare(`.

**El efecto**, en `tests/integration/prepared-statements.test.ts`, contra PostgreSQL real:

```text
$ npx vitest run --project integration tests/integration/prepared-statements.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Los cuatro casos:

1. `plan_cache_mode` es `auto`.
2. Tres lecturas de servicio y una escritura con transacción, repetidas siete veces, no dejan ninguna fila en `pg_prepared_statements` en ninguna conexión del pool.
3. **El control**: una consulta de `pg` con `name`, ejecutada seis veces, sí queda en esa vista, con `custom_plans = 5` y `generic_plans = 1`. Es la conducta del servidor que la lectura solo podía suponer: con nombre, la sexta ejecución usa el plan genérico.
4. La misma consulta sin nombre, repetida, no queda.

`scripts/medir-caminos.ts` repite la comprobación al final de cada corrida, sobre todas las conexiones de su pool, y además lee si `plan_cache_mode` está fijado en un rol o en una base. Su salida está más abajo, en el ensayo.

### AC-2: la guarda de las sentencias preparadas con nombre

`tests/guards/named-prepared-statements.test.ts`, 28 casos. Una mutación por cada forma que dice cubrir, sobre archivos reales: se agrega una línea al archivo, se corre la guarda y se restaura el archivo.

```text
antes:       Tests  28 passed (28)
src/modules/crm/repository.ts <- export const m = (q: { prepare: (n: string) => unknown }) => q.prepare
   +   "src/modules/crm/repository.ts: .prepare(",  | Tests 1 failed | 27 passed (28)
src/modules/crm/repository.ts <- export const m = (q: Record<string, (n: string) => unknown>) => q["pre
   +   "src/modules/crm/repository.ts: [\"prepare\"]",  | Tests 1 failed | 27 passed (28)
scripts/medir-caminos.ts <- export const m = (c: { query: (q: object) => unknown }) => c.query({ n
   +   "scripts/medir-caminos.ts: .query({ name })",  | Tests 1 failed | 27 passed (28)
seeds/volume.ts <- export const m = { text: "select 1", queryMode: "extended" };
   +   "seeds/volume.ts: queryMode",  | Tests 1 failed | 27 passed (28)
src/modules/crm/repository.ts <- export const m = "prepare vigente as select 1";
   +   "src/modules/crm/repository.ts: PREPARE … AS",  | Tests 1 failed | 27 passed (28)
scripts/medir-caminos.ts <- export const m = "set plan_cache_mode = force_generic_plan";
   +   "scripts/medir-caminos.ts: fijar plan_cache_mode",  | Tests 1 failed | 27 passed (28)
src/modules/crm/repository.ts <- import { Pool as PoolM } from "pg"; export const m = PoolM;
   +   "src/modules/crm/repository.ts: importa pg",  | Tests 1 failed | 27 passed (28)
después:       Tests  28 passed (28)
```

De la salida se quitó la línea separadora que Vitest imprime antes del recuento; el resto es literal. Las siete ponen la guarda en rojo, y cada una nombra su forma. Después de restaurar, `git status` no muestra ningún archivo de `src/` modificado.

**Un defecto de la primera versión de la guarda, encontrado al escribir el script.** La forma de `plan_cache_mode` marcaba cualquier mención. `scripts/medir-caminos.ts` lo lee, para comprobar que es `auto`, y la guarda falló contra él:

```text
- []
+ [
+   "scripts/medir-caminos.ts: plan_cache_mode",
+ ]
```

Ahora marca solo que se lo fije: `set plan_cache_mode`, o `plan_cache_mode = force_…` en las opciones de la conexión.

### AC-3: el seed de volumen

Las formas nuevas de `seeds/volume.ts` son opcionales: referencias del emisor, precios, información del negocio y una conversación concentrada. `VOLUME_MEASUREMENT` es la distribución de la 9.3 con las tres primeras, más la organización 20.

```text
$ npx vitest run --project guards tests/guards/volume-seed-identity.test.ts
      Tests  24 passed (24)
$ npx vitest run --project integration tests/integration/volume-distribution.test.ts
      Tests  15 passed (15)
```

Mutaciones sobre `seeds/volume.ts`, cada una restaurada después:

| Mutación | Caso que falla |
| --- | --- |
| La conversación concentrada termina 200 días antes, no una hora antes | «la conversación concentrada tiene la mayoría de los mensajes, y son los más recientes» |
| Las conversaciones pierden la referencia del emisor | «siembra precios con historial, información con vigencias y una referencia por conversación» |
| La distribución de la medición cambia el tamaño de una organización de la 9.3 | «es la de la 9.3, con referencias, precios e información, más una organización» (guarda) |
| El precio vigente pierde su fecha fija | «dos cargas desde cero dan los mismos precios, la misma información y las mismas referencias» |
| La información pierde sus fechas fijas | el mismo |

`[transcrito]`: la tabla resume cinco corridas; de cada una se leyó `1 failed` y el nombre del caso.

**Una mutación sobrevivió la primera vez.** Sin la fecha fija del precio, la prueba de idempotencia seguía en verde: la segunda corrida no escribe, así que no ve una fecha que sale del reloj. Faltaba un caso de determinismo, con dos cargas desde cero. Se agregó, y con él la mutación falla.

Además, esa mutación no se había aplicado la primera vez: el `sed` no coincidió con la línea y el archivo quedó igual. Se detectó contando las coincidencias antes y después (`1` y `1`), y se repitió con el recuento en `0`.

### AC-7 (R-8 de la 12.2): los dos bordes de concurrencia

`tests/integration/conversation-resolution-concurrency.test.ts`. Tres conexiones, en un orden fijado: una conexión aparte retiene un bloqueo que la resolución necesita después de bloquear al cliente, y se mira en `pg_stat_activity` quién espera a quién.

```text
$ npx vitest run --project integration tests/integration/conversation-resolution-concurrency.test.ts
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

**Borde 1, el modo del bloqueo del cliente: confirmado, sin pérdida de datos.**

- Con una resolución en curso, un `message.recorded` que crea una conversación del mismo cliente **espera**. Lo que espera es su `insert into conversations`, y quien lo bloquea es la conexión de la resolución (`pg_blocking_pids`).
- Al soltar, los dos terminan bien y cada mensaje queda en su conversación.
- Con el cliente retenido en `FOR NO KEY UPDATE`, el mismo `message.recorded` termina sin esperar. Con `FOR UPDATE`, espera. La diferencia es el modo y nada más.

**Borde 2, la candidata cerrada en ese momento: lo que R-8 temía no ocurre.**

- Con una sola candidata, que un `admin` cierra mientras la resolución la espera, el mensaje abre una conversación nueva. Es lo correcto: una conversación cerrada no es vigente.
- Con dos candidatas, al cerrarse la más cercana, el mensaje **va a la otra**. `limit 1 for update` no devuelve cero filas: PostgreSQL descarta la fila que dejó de cumplir y sigue con la siguiente. No se abre una tercera conversación.

Límites de estos casos: el cierre del `admin` y el bloqueo en `FOR NO KEY UPDATE` son sentencias escritas en el test, no el código de la aplicación. El servicio real no se puede detener a mitad de su transacción, y el código no usa ese modo.

### AC-4, AC-5, AC-6 y AC-8: el ensayo en un contenedor

Un PostgreSQL 18.6 descartable, con los parámetros de costo de producción, una base `crm_medicion_test` con ICU `es` y un rol `crm_medicion` que **no es superusuario**, preparado como se va a preparar en el droplet.

```text
$ bash ensayo-13.2-preparar.sh
crm_medicion_test|i|es
crm_medicion|f|{session_preload_libraries=auto_explain}
effective_cache_size|131072
random_page_cost|1.1
server_version|18.6 (Debian 18.6-1.pgdg13+2)
```

El guion crea `crm_app` y la extensión `unaccent` con el superusuario, le quita `CONNECT` a `PUBLIC` sobre la base de medición, precarga `auto_explain` en el rol y le da permiso para fijar sus cinco parámetros (`GRANT SET ON PARAMETER`). `[transcrito]`: el guion vive en el scratchpad de la sesión; sus sentencias pasan al procedimiento de la etapa 13.2.2.

**La carga**, con el rol de medición:

```text
$ npm run --silent db:migrate && time npx tsx seeds/volume.ts medicion
Migraciones aplicadas.
  organización 0: 10000 clientes, 10000 conversaciones, 65260 mensajes, 10000 productos, 37967 movimientos, 501 miembros, 20000 eventos, 10883 precios, 200 entradas de información.
  organización 1: 1000 clientes, 1000 conversaciones, 6631 mensajes, 1000 productos, 3848 movimientos, 51 miembros, 2000 eventos, 1107 precios, 200 entradas de información.
  [...]
  organización 4: 50 clientes, 50 conversaciones, 265 mensajes, 50 productos, 164 movimientos, 6 miembros, 100 eventos, 55 precios, 30 entradas de información.
  [...]
  organización 20: 300 clientes, 301 conversaciones, 5916 mensajes, 300 productos, 905 movimientos, 6 miembros, 100 eventos, 321 precios, 30 entradas de información.
Distribución de volumen aplicada: 21 organizaciones, 14100 clientes, 14101 conversaciones, 96016 mensajes, 14100 productos, 52735 movimientos, 756 miembros, 27700 eventos de ingestión, 15303 precios y 1310 entradas de información en 25.5 s.

real	0m30.291s
```

Se omitieron con `[...]` las líneas de las organizaciones 2, 3 y 5 a 19. En la organización 20, la conversación concentrada tiene 4.000 de los 5.916 mensajes: el 68 %. La base cargada pesa 79 MB.

**Los tiempos**, después de un `ANALYZE`. Organización grande:

```text
$ npx tsx scripts/medir-caminos.ts 5eed0000-0000-4000-8000-000000000021 "ensayo, grande"
Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Debian 18.6-1.pgdg13+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## Caminos completos — ensayo, grande
Mediana de 5 corridas, tras una de calentamiento.

| Camino | Mediana | Mínimo | Máximo | Resultado |
| --- | --- | --- | --- | --- |
| catalog.searchProducts (sin texto) | 72.6 ms | 68.6 ms | 81.8 ms | 9491 filas |
| inventory.listProductStock (sin filtro) | 249.8 ms | 229.0 ms | 436.4 ms | 25/9491 filas |
| inventory.listProductStock (página profunda) | 157.2 ms | 152.5 ms | 173.5 ms | 25/9491 filas |
| crm.searchClients (sin texto) | 17.8 ms | 17.6 ms | 18.9 ms | 25/10000 filas |
| crm.searchClients (página profunda) | 29.9 ms | 26.2 ms | 32.7 ms | 25/10000 filas |
| crm.searchClients (prefijo de nombre) | 12.5 ms | 11.1 ms | 14.0 ms | 25/961 filas |
| conversations.listConversations | 12.2 ms | 10.1 ms | 13.1 ms | 25/10000 filas |
| conversations.searchClientsByLastInteraction | 65.0 ms | 62.0 ms | 76.3 ms | 25/10000 filas |
| organizations.listMembers | 12.9 ms | 12.6 ms | 13.6 ms | 25/501 filas |
| inventory.listProductStock (última página) | 168.6 ms | 158.9 ms | 177.1 ms | 16/9491 filas |
| crm.searchClients (última página) | 31.0 ms | 30.1 ms | 31.9 ms | 25/10000 filas |
| conversations.listConversations (última página) | 16.9 ms | 15.9 ms | 19.5 ms | 25/10000 filas |
| conversations.searchClientsByLastInteraction (última página) | 75.3 ms | 68.7 ms | 106.3 ms | 25/10000 filas |
| organizations.listMembers (última página) | 12.2 ms | 11.5 ms | 12.8 ms | 1/501 filas |
| inventory.listStockMovements (producto con 400, última página) | 12.6 ms | 11.2 ms | 20.8 ms | 25/400 filas |
| inventory.listStockMovements (producto con 400) | 10.4 ms | 9.9 ms | 14.5 ms | 25/400 filas |
| API products: palabras («cafe molido») | 8.1 ms | 6.7 ms | 9.4 ms | 10 filas |
| API products: SKU exacto | 5.4 ms | 4.5 ms | 7.2 ms | 1 filas |
| API products: sin coincidencias | 2.6 ms | 2.3 ms | 3.1 ms | 0 filas |
| API products/{product_id} | 5.9 ms | 5.1 ms | 7.1 ms | 1 filas |
| API knowledge: vigentes sin texto | 5.4 ms | 4.5 ms | 6.4 ms | 20 filas |
| API knowledge: vigentes con texto | 5.1 ms | 4.2 ms | 5.5 ms | 17 filas |
| conversations.resolveIngestedConversation (con vigente) | 11.1 ms | 10.1 ms | 12.6 ms | conversación vigente |
| conversations.resolveIngestedConversation (sin vigente) | 10.0 ms | 8.9 ms | 11.1 ms | conversación nueva |
| conversations.listRecentMessagesForService (20 de 12, de 65260 de la organización) | 4.1 ms | 3.6 ms | 4.6 ms | 12 filas |
| conversations.listRecentMessagesForService (50, el máximo del contrato) | 4.8 ms | 3.6 ms | 6.1 ms | 12 filas |
| analytics 1 conversaciones iniciadas | 5.4 ms | 5.1 ms | 6.4 ms | valor 1590 |
| analytics 2 conversaciones activas | 12.2 ms | 11.5 ms | 13.5 ms | valor 1622 |
| analytics 3 clientes únicos | 12.8 ms | 12.1 ms | 13.5 ms | valor {"clients":1197,"withoutClient":35 |
| analytics 4-5 mensajes | 10.1 ms | 8.9 ms | 11.5 ms | valor {"inbound":5747,"outbound":4911} |
| analytics 6 mensajes por conversación | 12.0 ms | 10.2 ms | 14.4 ms | valor {"status":"value","conversations": |
| analytics 10 actividad diaria | 21.6 ms | 20.4 ms | 22.0 ms | valor [{"day":"2026-08-31","started":59, |
| analytics 7 respondidas | 11.8 ms | 9.9 ms | 12.2 ms | valor 1389 |
| analytics 8 cobertura de respuesta | 12.2 ms | 11.3 ms | 13.7 ms | valor {"status":"value","responded":1389 |
| analytics 9 tiempo de primera respuesta | 29.1 ms | 27.1 ms | 30.6 ms | valor {"population":1571,"withoutRespons |
| analytics 11 distribución de estado | 13.6 ms | 12.4 ms | 14.2 ms | valor {"open":523,"pending":559,"closed" |
| analytics 12 errores de ingestión | 9.3 ms | 8.9 ms | 10.5 ms | valor {"status":"value","total":3340,"fa |

**Dashboard, las 11 llamadas de una carga en paralelo**: mediana 52.7 ms (mínimo 51.3, máximo 53.2).

**Sentencias preparadas con nombre**: 0 en 10 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.
```

Organización con la conversación concentrada, solo las filas nuevas de la 13.2:

```text
$ npx tsx scripts/medir-caminos.ts 5eed0000-0014-4000-8000-000000000021 "ensayo, concentrada" | grep -E "resolveIngested|listRecent|última página|Dashboard|Sentencias"
| inventory.listProductStock (última página) | 14.9 ms | 14.2 ms | 18.3 ms | 20/295 filas |
| crm.searchClients (última página) | 7.5 ms | 7.3 ms | 7.9 ms | 25/300 filas |
| conversations.listConversations (última página) | 14.3 ms | 13.2 ms | 14.7 ms | 1/301 filas |
| conversations.searchClientsByLastInteraction (última página) | 19.8 ms | 17.7 ms | 21.3 ms | 25/300 filas |
| organizations.listMembers (última página) | 8.9 ms | 7.5 ms | 22.9 ms | 6/6 filas |
| inventory.listStockMovements (producto con 6, última página) | 24.3 ms | 22.2 ms | 32.3 ms | 6/6 filas |
| conversations.resolveIngestedConversation (con vigente) | 17.4 ms | 15.2 ms | 22.2 ms | conversación vigente |
| conversations.resolveIngestedConversation (sin vigente) | 18.8 ms | 16.5 ms | 26.2 ms | conversación nueva |
| conversations.listRecentMessagesForService (20 de 4000, de 5916 de la organización) | 6.7 ms | 6.4 ms | 7.7 ms | 20 filas |
| conversations.listRecentMessagesForService (50, el máximo del contrato) | 8.0 ms | 7.5 ms | 8.2 ms | 50 filas |
**Dashboard, las 11 llamadas de una carga en paralelo**: mediana 33.0 ms (mínimo 28.6, máximo 36.1).
**Sentencias preparadas con nombre**: 0 en 10 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.
```

Lo que muestran, como prueba del instrumento:

- **AC-4**: cada listado paginado tiene su fila de «última página», pedida a partir del `pageCount` que devuelve la primera.
- **AC-5**: la resolución de la conversación vigente informa cuál de los dos caminos tomó, y el historial lee la conversación de 4.000 mensajes. La resolución corre dentro de una transacción que se deshace.
- **AC-1**: la última línea de cada corrida.

**Los planes**, con `CRM_PLANES`:

```text
planes grande: salida 0, 118 consultas, 30 Seq Scan
planes chica: salida 0, 116 consultas, 19 Seq Scan
planes concentrada: salida 0, 118 consultas, 19 Seq Scan
```

`[transcrito]`: son las tres líneas que imprimió el ciclo que corrió los dos modos para cada organización. Los archivos de planes del ensayo quedaron en el scratchpad y no se versionan: los que cuentan son los de la etapa 13.2.2.

Un plan, tal como lo devuelve `auto_explain`. Es el historial de la conversación concentrada:

```text
duration: 0.081 ms  plan:
Query Text: select "external_ref", "direction", "sent_at", "body_text", "kind", "sent_by" from "messages" where ("messages"."organization_id" = $1 and "messages"."conversation_id" = $2) order by "messages"."sent_at" desc, "messages"."id" desc limit $3
Query Parameters: $1 = '5eed0000-0014-4000-8000-000000000021', $2 = '5eed000b-0014-4000-8000-000000000000', $3 = '20'
Limit  (cost=4.23..80.85 rows=20 width=100) (actual time=0.051..0.056 rows=20.00 loops=1)
  Buffers: shared hit=5
  ->  Incremental Sort  (cost=4.23..981.20 rows=255 width=100) (actual time=0.050..0.052 rows=20.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 1  Sort Method: quicksort  Average Memory: 27kB  Peak Memory: 27kB
        Buffers: shared hit=5
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..969.73 rows=255 width=100) (actual time=0.032..0.037 rows=21.00 loops=1)
              Index Cond: (conversation_id = '5eed000b-0014-4000-8000-000000000000'::uuid)
              Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=5
```

Con esa proporción, en el ensayo el planificador usó `messages_conversation_sent_idx`, el índice de la conversación. **No es el veredicto de H-3 de la 12.4**: ese sale de la etapa 13.2.2, en la máquina de producción.

**El control negativo de AC-6**, sin encender `auto_explain`:

```text
$ CRM_PLANES=ensayo-control.md CRM_CONTROL=sin-planes npx tsx scripts/medir-caminos.ts 5eed0000-0014-4000-8000-000000000021 control
[...]
**37 caminos sin ningún plan y 0 fallidos**: la corrida no vale.
[...]
salida: 1
```

**La tanda de calibración**, que saltea lo que el seed histórico no puede medir:

```text
$ CRM_TANDA=8.5 npx tsx scripts/medir-caminos.ts 5eed0000-0014-4000-8000-000000000021 control
Tanda 8.5 (CRM_TANDA): no se miden la conversación vigente ni el historial.
[...]
salida: 0
```

### El aislamiento y la limpieza, ensayados

En el mismo contenedor se creó una base `crm_production` de otro dueño, con una tabla `clients` y un rol de aplicación miembro de `crm_app`.

```text
--- el rol de medición contra crm_production:
ERROR:  permission denied for table clients
--- el rol de la aplicación contra la base de medición:
psql: error: connection to server at "127.0.0.1", port 5432 failed: FATAL:  permission denied for database "crm_medicion_test"
DETAIL:  User does not have CONNECT privilege.
```

Después de `DROP DATABASE`, `REVOKE SET ON PARAMETER` y `DROP ROLE`, los tres recuentos dan cero: la base, el rol y `pg_parameter_acl`.

`[transcrito]`: los comandos están en la sesión; en la etapa 13.2.2 se registran literales.

**Lo que el ensayo no cubrió**: la ventana del manifiesto (AC-15), la calibración del umbral (AC-16) y la carga con la aplicación productiva corriendo en la misma máquina.
