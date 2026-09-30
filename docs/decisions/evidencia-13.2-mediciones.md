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

## Etapa 13.2.2 — la medición en el droplet de producción

Cada paso lo autorizó el usuario en su turno. Los guiones corren como `root` con `ssh crm-production "sudo bash -s" < guion`, y viven en el scratchpad de la sesión: acá va lo que hacen y su salida literal.

### Paso 1: la base y el rol de medición, 2026-09-30

**La CI de la etapa 13.2.1**, antes de tocar el servidor: corrida 36726314512, `headSha` `803571eff65fbb4c78a41fc558ef4d24eb37ffa0`, `conclusion: success`. La API devolvía varios pasos como `pending` con el job ya en `success`; el log de la corrida muestra 14 archivos de guardas, 48 de unitarios, 41 de integración y 100 de 100 end-to-end.

El guion:

1. guarda los recuentos de cada tabla de `crm_production` en `/etc/crm-medicion/recuentos-antes.txt`;
2. genera la contraseña con `openssl`, la escribe en `/etc/crm-medicion/medicion.env` (`0600` de `root`) y crea el rol `crm_medicion` pasándola por la entrada estándar;
3. crea `crm_medicion_test` con ICU `es`, le quita `CONNECT` a `PUBLIC`, precarga `auto_explain` en el rol, le concede sus cinco parámetros y crea `unaccent`.

```text
2026-09-30T14:17:18Z
--- 1. recuentos de crm_production, antes
audit_logs 1
clients 0
conversations 0
ingestion_credentials 0
ingestion_events 0
ingestion_rate_windows 0
inventories 0
inventory_movements 0
knowledge_entries 0
login_attempts 44
messages 0
organization_members 1
organizations 1
product_prices 0
products 0
sessions 2
users 1
--- 2. el rol, con la contraseña generada acá
--- 3 a 5. la base, los permisos, auto_explain y unaccent
--- lo creado
crm_medicion_test|i|es|crm_medicion
crm_production|i|es|crm_owner
crm_medicion|f|f|f|t|{session_preload_libraries=auto_explain}
miembro de crm_app: false
parámetros concedidos: 5
total 16
drwx------   2 root root 4096 Sep 30 14:17 .
drwxr-xr-x 113 root root 4096 Sep 30 14:17 ..
-rw-------   1 root root  163 Sep 30 14:17 medicion.env
-rw-------   1 root root  278 Sep 30 14:17 recuentos-antes.txt
DATABASE_URL
SEED_USER_PASSWORD
--- 6a. el rol de medición contra crm_production, por efecto
clients: ERROR:  permission denied for table clients
```

**El guion se cortó ahí.** El error de `clients` era el esperado, pero con `set -e` y `pipefail` terminó el guion antes de las demás comprobaciones. Todo lo que tenía que crear ya estaba creado. Las comprobaciones se corrieron con un segundo guion, sin `set -e`, que no escribe nada:

```text
2026-09-30T14:17:37Z
--- 6a. el rol de medición contra crm_production, por efecto
clients: ERROR:  permission denied for table clients
users: ERROR:  permission denied for table users
organizations: ERROR:  permission denied for table organizations
messages: ERROR:  permission denied for table messages
audit_logs: ERROR:  permission denied for table audit_logs
sessions: ERROR:  permission denied for table sessions
crear una tabla:                      ^
--- 6b. el rol de medición contra su base, por efecto
DETAIL:  Only roles with privileges of the "pg_read_all_settings" role may examine this parameter.
--- 6c. quién puede conectarse a la base de medición, por catálogo
crm_app_login|f
crm_medicion|t
crm_owner|f
postgres|t
--- la aplicación
active
/login -> 200
```

Dos líneas de esa salida no dicen nada, por un `tail -1` que se quedó con la última línea de un error de varias: la de «crear una tabla» y la de 6b. Se repitieron con la salida entera:

```text
--- crear una tabla en crm_production, como crm_medicion
ERROR:  permission denied for schema public
LINE 1: create table medicion_no_deberia (id int)
                     ^
--- tablas con ese nombre en crm_production
0
--- el rol de medición en su base
crm_medicion|crm_medicion_test|-1
```

Lo que queda comprobado:

- **El rol de medición no lee ni escribe en `crm_production`**, por efecto: `permission denied` en seis tablas y al crear una tabla. Puede conectarse a esa base, porque `PUBLIC` tiene `CONNECT` ahí, y eso no se cambió.
- **El rol de la aplicación no puede conectarse a la base de medición**, por catálogo (`has_database_privilege`) y no por efecto: probarlo por efecto exigía usar la contraseña de la aplicación.
- **`auto_explain` está cargado** en las sesiones del rol de medición: `auto_explain.log_min_duration` devuelve `-1`, su valor de fábrica. En 6b, el primer intento leía `session_preload_libraries`, que un rol sin privilegios no puede leer.
- La aplicación siguió activa, con `/login` en `200`.


### Paso 2: el segundo checkout y la migración, 2026-09-30

Autorizado por el usuario en su turno. El checkout queda en `/var/lib/crm-production/medicion`, de `crm`, en el commit `803571e`, clonado con la deploy key de solo lectura de producción. La migración corrió con el rol de medición, con la URL tomada de `/etc/crm-medicion/medicion.env` y pasada por el entorno. Salida literal:

```text
2026-09-30T14:21:23Z
--- antes
/srv/crm-production en: 938423d0a832e65eb9c42474c51a47a44c54689e
active
/login -> 200
               total        used        free      shared  buff/cache   available
Mem:            1967         545         227          41        1421        1422
  44G
--- 1. el clonado
checkout de medición en: 803571eff65fbb4c78a41fc558ef4d24eb37ffa0
--- 2. npm ci
npm warn install-scripts   esbuild@0.25.12 (postinstall: node install.js)
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
npm ci: 33 s
               total        used        free      shared  buff/cache   available
Mem:            1967         583         729          41         888        1384
/login -> 200
--- 3. la migración de crm_medicion_test, con el rol de medición
Migraciones aplicadas.
--- lo migrado
tablas en public: 17
migraciones aplicadas: 25
dueños de las tablas: crm_medicion
tamaño: 8726 kB
migraciones en el checkout: 25
--- después
/srv/crm-production sin cambios: 938423d0a832e65eb9c42474c51a47a44c54689e
archivos modificados en /srv/crm-production: 0
migraciones en crm_production: 25
checkout de medición: 566M
  44G
active
/login -> 200
```

Lo que queda comprobado:

- **`/srv/crm-production` no cambió**: sigue en `938423d`, sin archivos modificados, y `crm_production` conserva sus 25 migraciones.
- **La base de medición tiene el mismo esquema que producción**: 25 migraciones aplicadas de 25, 17 tablas, todas del rol de medición. Entre `938423d` y `803571e` no hay migraciones nuevas.
- **El `npm ci` no presionó la memoria**: 33 s, con la memoria disponible de 1422 MB a 1384 MB y `/login` en `200` antes y después.
- El aviso `install-scripts` de `npm` dice que el `postinstall` de `esbuild` no corrió. No impidió nada: `tsx` ejecutó la migración.

### Paso 3: la calibración y la carga de la medición, 2026-09-30

Autorizado por el usuario en su turno. Todo contra `crm_medicion_test`. Un vigía pidió `/login` cada 5 s durante el paso entero. Salida literal:

```text
2026-09-30T14:25:51Z
--- 1. carga de calibración: la organización histórica sola
Seed de volumen aplicado para volumen@example.com: 10000 clientes, 10000 conversaciones, 65260 mensajes, 10000 productos, 8563 saldos, 37967 movimientos y 501 miembros en 39.2 s.
organizaciones: 1
tamaño: 47 MB
--- 2. la tanda de la 8.5
$ CRM_TANDA=8.5 npx tsx scripts/medir-caminos.ts 5eed0000-0000-4000-8000-000000000021 calibracion

Tanda 8.5 (CRM_TANDA): no se miden la conversación vigente ni el historial.

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## Caminos completos — calibracion
Mediana de 5 corridas, tras una de calentamiento.

| Camino | Mediana | Mínimo | Máximo | Resultado |
| --- | --- | --- | --- | --- |
| catalog.searchProducts (sin texto) | 187.1 ms | 150.9 ms | 373.7 ms | 9491 filas |
| inventory.listProductStock (sin filtro) | 623.9 ms | 525.1 ms | 950.8 ms | 25/9491 filas |
| inventory.listProductStock (página profunda) | 549.4 ms | 441.6 ms | 637.4 ms | 25/9491 filas |
| crm.searchClients (sin texto) | 29.8 ms | 25.9 ms | 43.1 ms | 25/10000 filas |
| crm.searchClients (página profunda) | 46.0 ms | 42.3 ms | 62.0 ms | 25/10000 filas |
| crm.searchClients (prefijo de nombre) | 32.4 ms | 16.8 ms | 38.2 ms | 25/961 filas |
| conversations.listConversations | 28.0 ms | 17.1 ms | 34.2 ms | 25/10000 filas |
| conversations.searchClientsByLastInteraction | 169.0 ms | 144.5 ms | 292.5 ms | 25/10000 filas |
| organizations.listMembers | 30.1 ms | 18.9 ms | 58.5 ms | 25/501 filas |
| inventory.listProductStock (última página) | 443.3 ms | 410.4 ms | 517.6 ms | 16/9491 filas |
| crm.searchClients (última página) | 50.7 ms | 50.0 ms | 53.7 ms | 25/10000 filas |
| conversations.listConversations (última página) | 51.7 ms | 37.5 ms | 62.3 ms | 25/10000 filas |
| conversations.searchClientsByLastInteraction (última página) | 144.4 ms | 134.1 ms | 158.2 ms | 25/10000 filas |
| organizations.listMembers (última página) | 18.7 ms | 16.3 ms | 20.6 ms | 1/501 filas |
| inventory.listStockMovements (producto con 400, última página) | 10.2 ms | 9.9 ms | 18.4 ms | 25/400 filas |
| inventory.listStockMovements (producto con 400) | 11.5 ms | 9.4 ms | 16.7 ms | 25/400 filas |
| API products: palabras («cafe molido») | 9.9 ms | 7.2 ms | 13.2 ms | 10 filas |
| API products: SKU exacto | 8.4 ms | 5.8 ms | 12.8 ms | 1 filas |
| API products: sin coincidencias | 2.8 ms | 2.6 ms | 3.0 ms | 0 filas |
| API products/{product_id} | 4.6 ms | 4.2 ms | 5.9 ms | 1 filas |
| API knowledge: vigentes sin texto | 3.5 ms | 3.0 ms | 5.9 ms | 0 filas |
| API knowledge: vigentes con texto | 3.8 ms | 3.7 ms | 5.9 ms | 0 filas |
| analytics 1 conversaciones iniciadas | 5.4 ms | 4.1 ms | 6.9 ms | valor 1590 |
| analytics 2 conversaciones activas | 21.0 ms | 19.3 ms | 22.6 ms | valor 1622 |
| analytics 3 clientes únicos | 24.9 ms | 21.8 ms | 39.8 ms | valor {"clients":1197,"withoutClient":35 |
| analytics 4-5 mensajes | 18.2 ms | 16.9 ms | 25.8 ms | valor {"inbound":5747,"outbound":4911} |
| analytics 6 mensajes por conversación | 24.0 ms | 23.1 ms | 30.6 ms | valor {"status":"value","conversations": |
| analytics 10 actividad diaria | 39.5 ms | 36.9 ms | 52.3 ms | valor [{"day":"2026-08-31","started":59, |
| analytics 7 respondidas | 20.2 ms | 18.8 ms | 21.4 ms | valor 1389 |
| analytics 8 cobertura de respuesta | 20.2 ms | 18.4 ms | 22.6 ms | valor {"status":"value","responded":1389 |
| analytics 9 tiempo de primera respuesta | 58.8 ms | 50.2 ms | 60.7 ms | valor {"population":1571,"withoutRespons |
| analytics 11 distribución de estado | 21.2 ms | 18.8 ms | 47.0 ms | valor {"open":523,"pending":559,"closed" |
| analytics 12 errores de ingestión | 3.5 ms | 3.2 ms | 4.4 ms | valor {"status":"unavailable"} |

**Dashboard, las 11 llamadas de una carga en paralelo**: mediana 334.0 ms (mínimo 231.6, máximo 441.2).

**Sentencias preparadas con nombre**: 0 en 10 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.
--- 3. borrar y recrear la base, migrar y cargar la distribución de la medición
Migraciones aplicadas.
  organización 0: 10000 clientes, 10000 conversaciones, 65260 mensajes, 10000 productos, 37967 movimientos, 501 miembros, 20000 eventos, 10883 precios, 200 entradas de información.
  organización 1: 1000 clientes, 1000 conversaciones, 6631 mensajes, 1000 productos, 3848 movimientos, 51 miembros, 2000 eventos, 1107 precios, 200 entradas de información.
  organización 2: 1000 clientes, 1000 conversaciones, 6380 mensajes, 1000 productos, 3808 movimientos, 51 miembros, 2000 eventos, 1079 precios, 200 entradas de información.
  organización 3: 1000 clientes, 1000 conversaciones, 6585 mensajes, 1000 productos, 3787 movimientos, 51 miembros, 2000 eventos, 1062 precios, 200 entradas de información.
  organización 4: 50 clientes, 50 conversaciones, 265 mensajes, 50 productos, 164 movimientos, 6 miembros, 100 eventos, 55 precios, 30 entradas de información.
  organización 5: 50 clientes, 50 conversaciones, 335 mensajes, 50 productos, 142 movimientos, 6 miembros, 100 eventos, 54 precios, 30 entradas de información.
  organización 6: 50 clientes, 50 conversaciones, 329 mensajes, 50 productos, 172 movimientos, 6 miembros, 100 eventos, 51 precios, 30 entradas de información.
  organización 7: 50 clientes, 50 conversaciones, 356 mensajes, 50 productos, 139 movimientos, 6 miembros, 100 eventos, 56 precios, 30 entradas de información.
  organización 8: 50 clientes, 50 conversaciones, 318 mensajes, 50 productos, 146 movimientos, 6 miembros, 100 eventos, 52 precios, 30 entradas de información.
  organización 9: 50 clientes, 50 conversaciones, 313 mensajes, 50 productos, 150 movimientos, 6 miembros, 100 eventos, 57 precios, 30 entradas de información.
  organización 10: 50 clientes, 50 conversaciones, 341 mensajes, 50 productos, 168 movimientos, 6 miembros, 100 eventos, 50 precios, 30 entradas de información.
  organización 11: 50 clientes, 50 conversaciones, 319 mensajes, 50 productos, 173 movimientos, 6 miembros, 100 eventos, 52 precios, 30 entradas de información.
  organización 12: 50 clientes, 50 conversaciones, 340 mensajes, 50 productos, 152 movimientos, 6 miembros, 100 eventos, 49 precios, 30 entradas de información.
  organización 13: 50 clientes, 50 conversaciones, 336 mensajes, 50 productos, 124 movimientos, 6 miembros, 100 eventos, 59 precios, 30 entradas de información.
  organización 14: 50 clientes, 50 conversaciones, 351 mensajes, 50 productos, 157 movimientos, 6 miembros, 100 eventos, 49 precios, 30 entradas de información.
  organización 15: 50 clientes, 50 conversaciones, 318 mensajes, 50 productos, 155 movimientos, 6 miembros, 100 eventos, 52 precios, 30 entradas de información.
  organización 16: 50 clientes, 50 conversaciones, 323 mensajes, 50 productos, 156 movimientos, 6 miembros, 100 eventos, 57 precios, 30 entradas de información.
  organización 17: 50 clientes, 50 conversaciones, 351 mensajes, 50 productos, 134 movimientos, 6 miembros, 100 eventos, 53 precios, 30 entradas de información.
  organización 18: 50 clientes, 50 conversaciones, 337 mensajes, 50 productos, 136 movimientos, 6 miembros, 100 eventos, 48 precios, 30 entradas de información.
  organización 19: 50 clientes, 50 conversaciones, 312 mensajes, 50 productos, 152 movimientos, 6 miembros, 100 eventos, 57 precios, 30 entradas de información.
  organización 20: 300 clientes, 301 conversaciones, 5916 mensajes, 300 productos, 905 movimientos, 6 miembros, 100 eventos, 321 precios, 30 entradas de información.
Distribución de volumen aplicada: 21 organizaciones, 14100 clientes, 14101 conversaciones, 96016 mensajes, 14100 productos, 52735 movimientos, 756 miembros, 27700 eventos de ingestión, 15303 precios y 1310 entradas de información en 58.8 s.
--- 4. ANALYZE
--- lo cargado
audit_logs 0
clients 14100
conversations 14101
ingestion_credentials 0
ingestion_events 27700
ingestion_rate_windows 0
inventories 12097
inventory_movements 52735
knowledge_entries 1310
login_attempts 0
messages 96016
organization_members 756
organizations 21
product_prices 15303
products 14100
sessions 0
users 756
crm_medicion_test|i|es|crm_medicion|78 MB
crm_app_login|f
crm_medicion|t
crm_owner|f
postgres|t
--- crm_production contra la línea de base (vacío = igual)
--- el vigía: /login y memoria disponible durante todo el paso
muestras: 26
código 200: 26
tiempo máximo de /login: 0.553057 s
memoria disponible mínima: 1046 MB
active
  44G
2026-09-30T14:28:09Z
```

#### La calibración (D-4, AC-16)

La misma organización y los mismos datos que la 8.5: 10.000 clientes, 65.260 mensajes, 8.563 saldos y 37.967 movimientos, los cuatro números de la 8.5. Los siete caminos son los que comparó la 9.3, contra las medianas de la 8.5 en desarrollo que cita [evidencia-9.3-volumen.md](evidencia-9.3-volumen.md).

| Camino | 8.5, desarrollo | producción | Factor |
| --- | --- | --- | --- |
| `catalog.searchProducts` (sin texto) | 31,4 ms | 187,1 ms | **5,96×** |
| `inventory.listProductStock` (sin filtro) | 133,1 ms | 623,9 ms | **4,69×** |
| `inventory.listProductStock` (página profunda) | 114,5 ms | 549,4 ms | **4,80×** |
| `crm.searchClients` (sin texto) | 7,9 ms | 29,8 ms | **3,77×** |
| `conversations.searchClientsByLastInteraction` | 53,6 ms | 169,0 ms | **3,15×** |
| `organizations.listMembers` | 8,7 ms | 30,1 ms | **3,46×** |
| `inventory.listStockMovements` (producto con 400) | 8,2 ms | 11,5 ms | **1,40×** |

**El factor va de 1,40× a 5,96×, con mediana 3,77×.** El de staging en la 9.3 fue 2,29×: esta máquina midió más lenta que staging en los siete caminos. El orden es el mismo que allá: los caminos que componen en memoria son los que más se degradan.

**Umbral resultante**: 400 ms × 3,77 = **1508 ms** para el camino completo, y 200 ms × 3,77 = **754 ms** para la consulta.

Dos límites de este umbral:

- **Es un detector más flojo que el de staging.** Con 1508 ms, un camino puede tardar un segundo y medio sin ser declarado patológico. Las dos reglas de D-4 no dependen de él: todo recorrido secuencial se registra, y todo plan que cambia de forma entre la organización grande y la chica también.
- **Las corridas son ruidosas.** `listProductStock` (sin filtro) fue de 525,1 ms a 950,8 ms en cinco corridas. La aplicación de producción comparte el único núcleo.

#### La carga

- **21 organizaciones y 96.016 mensajes**, los mismos totales que el ensayo. La carga tardó 58,8 s, contra 25,5 s en el contenedor, y la base ocupa 78 MB.
- **AC-1 en esta máquina, en la tanda de calibración**: 0 sentencias preparadas con nombre en 10 conexiones, y `plan_cache_mode` en `auto`.
- **Aislamiento después de recrear la base**: `crm_app_login` y `crm_owner` siguen sin `CONNECT`, por catálogo.
- **`crm_production` tiene los recuentos de la línea de base**: el `diff` salió vacío.
- **La aplicación respondió durante todo el paso**: 26 muestras de `/login`, todas `200`, la más lenta de 0,55 s. La memoria disponible no bajó de 1046 MB.

### Paso 4: la medición, 2026-09-30

Autorizado por el usuario en su turno. Tres organizaciones, cada una con una corrida de tiempos y una de planes, más el control negativo y la ventana del manifiesto. Salida literal:

```text
2026-09-30T14:32:37Z
--- grande (5eed0000-0000-4000-8000-000000000021)
tiempos grande: salida 0
planes grande: salida 0, 2835101 bytes
--- chica (5eed0000-0004-4000-8000-000000000021)
tiempos chica: salida 0
planes chica: salida 0, 144493 bytes
--- concentrada (5eed0000-0014-4000-8000-000000000021)
tiempos concentrada: salida 0
planes concentrada: salida 0, 209759 bytes
--- el control negativo de los planes (tiene que salir con 1)
control: salida 1
- sin plan: analytics 9 tiempo de primera respuesta
- sin plan: analytics 11 distribución de estado
- sin plan: analytics 12 errores de ingestión

**Sentencias preparadas con nombre**: 0 en 2 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.
--- la ventana del manifiesto (AC-15), con los dos comandos de crm-backup.sh
vuelta 1: dump 2.28 s (5108843 bytes), recuentos 0.20 s (17 tablas), ventana 2.48 s
vuelta 2: dump 2.43 s (5108843 bytes), recuentos 0.18 s (17 tablas), ventana 2.62 s
vuelta 3: dump 2.10 s (5108843 bytes), recuentos 0.18 s (17 tablas), ventana 2.28 s
--- lo que quedó en /var/lib/crm-production/medicion/salida-13.2
5045 control.log
3019 control.md
3313 planes-chica.log
144493 planes-chica.md
3350 planes-concentrada.log
209759 planes-concentrada.md
3383 planes-grande.log
2835101 planes-grande.md
0 tiempos-chica.err
4013 tiempos-chica.md
0 tiempos-concentrada.err
4055 tiempos-concentrada.md
0 tiempos-grande.err
4152 tiempos-grande.md
/var/lib/crm-production/medicion/salida-13.2/tiempos-chica.err:0
/var/lib/crm-production/medicion/salida-13.2/tiempos-concentrada.err:0
/var/lib/crm-production/medicion/salida-13.2/tiempos-grande.err:0
--- crm_production contra la línea de base (vacío = igual)
--- la base de medición después de medir (las transacciones revertidas no dejan filas)
conversaciones: 14101
mensajes: 96016
clientes: 14100
--- el vigía
muestras: 14
código 200: 14
tiempo máximo de /login: 1.034683 s
memoria disponible mínima: 1148 MB
active
2026-09-30T14:33:53Z
```

El control negativo salió con código 1, como tiene que salir: sin `auto_explain`, los caminos quedan sin plan y la corrida falla. La aplicación respondió `200` en las 14 muestras, la más lenta de 1,03 s, y `crm_production` conserva los recuentos de la línea de base.

#### Los tiempos

Los tres archivos, enteros:

```text

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## Caminos completos — producción, grande
Mediana de 5 corridas, tras una de calentamiento.

| Camino | Mediana | Mínimo | Máximo | Resultado |
| --- | --- | --- | --- | --- |
| catalog.searchProducts (sin texto) | 195.8 ms | 102.6 ms | 300.2 ms | 9491 filas |
| inventory.listProductStock (sin filtro) | 573.9 ms | 391.1 ms | 665.7 ms | 25/9491 filas |
| inventory.listProductStock (página profunda) | 520.2 ms | 384.6 ms | 655.0 ms | 25/9491 filas |
| crm.searchClients (sin texto) | 28.7 ms | 28.0 ms | 36.6 ms | 25/10000 filas |
| crm.searchClients (página profunda) | 61.4 ms | 47.4 ms | 71.8 ms | 25/10000 filas |
| crm.searchClients (prefijo de nombre) | 17.6 ms | 17.0 ms | 29.3 ms | 25/961 filas |
| conversations.listConversations | 17.9 ms | 13.7 ms | 18.2 ms | 25/10000 filas |
| conversations.searchClientsByLastInteraction | 147.4 ms | 144.7 ms | 174.7 ms | 25/10000 filas |
| organizations.listMembers | 30.1 ms | 18.3 ms | 71.6 ms | 25/501 filas |
| inventory.listProductStock (última página) | 552.5 ms | 486.9 ms | 724.8 ms | 16/9491 filas |
| crm.searchClients (última página) | 83.4 ms | 53.4 ms | 116.6 ms | 25/10000 filas |
| conversations.listConversations (última página) | 22.9 ms | 22.6 ms | 23.7 ms | 25/10000 filas |
| conversations.searchClientsByLastInteraction (última página) | 199.2 ms | 153.7 ms | 255.2 ms | 25/10000 filas |
| organizations.listMembers (última página) | 21.7 ms | 21.0 ms | 32.6 ms | 1/501 filas |
| inventory.listStockMovements (producto con 400, última página) | 13.5 ms | 12.8 ms | 15.3 ms | 25/400 filas |
| inventory.listStockMovements (producto con 400) | 13.4 ms | 11.6 ms | 14.5 ms | 25/400 filas |
| API products: palabras («cafe molido») | 8.8 ms | 8.3 ms | 11.0 ms | 10 filas |
| API products: SKU exacto | 11.1 ms | 6.2 ms | 11.7 ms | 1 filas |
| API products: sin coincidencias | 4.0 ms | 3.5 ms | 4.6 ms | 0 filas |
| API products/{product_id} | 6.6 ms | 6.1 ms | 8.3 ms | 1 filas |
| API knowledge: vigentes sin texto | 4.9 ms | 4.6 ms | 6.8 ms | 20 filas |
| API knowledge: vigentes con texto | 4.9 ms | 4.6 ms | 5.8 ms | 17 filas |
| conversations.resolveIngestedConversation (con vigente) | 8.3 ms | 7.7 ms | 9.1 ms | conversación vigente |
| conversations.resolveIngestedConversation (sin vigente) | 7.4 ms | 6.4 ms | 8.5 ms | conversación nueva |
| conversations.listRecentMessagesForService (20 de 12, de 65260 de la organización) | 6.3 ms | 3.8 ms | 6.9 ms | 12 filas |
| conversations.listRecentMessagesForService (50, el máximo del contrato) | 4.3 ms | 3.4 ms | 6.8 ms | 12 filas |
| analytics 1 conversaciones iniciadas | 5.2 ms | 5.0 ms | 8.9 ms | valor 1590 |
| analytics 2 conversaciones activas | 20.4 ms | 19.4 ms | 29.7 ms | valor 1622 |
| analytics 3 clientes únicos | 22.8 ms | 21.0 ms | 23.5 ms | valor {"clients":1197,"withoutClient":35 |
| analytics 4-5 mensajes | 14.1 ms | 12.0 ms | 15.7 ms | valor {"inbound":5747,"outbound":4911} |
| analytics 6 mensajes por conversación | 28.4 ms | 17.3 ms | 36.0 ms | valor {"status":"value","conversations": |
| analytics 10 actividad diaria | 39.9 ms | 36.7 ms | 102.3 ms | valor [{"day":"2026-08-31","started":59, |
| analytics 7 respondidas | 44.0 ms | 28.9 ms | 50.2 ms | valor 1389 |
| analytics 8 cobertura de respuesta | 27.0 ms | 20.1 ms | 38.0 ms | valor {"status":"value","responded":1389 |
| analytics 9 tiempo de primera respuesta | 71.9 ms | 48.8 ms | 93.2 ms | valor {"population":1571,"withoutRespons |
| analytics 11 distribución de estado | 22.4 ms | 21.1 ms | 44.4 ms | valor {"open":523,"pending":559,"closed" |
| analytics 12 errores de ingestión | 11.8 ms | 11.5 ms | 17.5 ms | valor {"status":"value","total":3340,"fa |

**Dashboard, las 11 llamadas de una carga en paralelo**: mediana 277.6 ms (mínimo 255.2, máximo 283.8).

**Sentencias preparadas con nombre**: 0 en 10 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## Caminos completos — producción, chica
Mediana de 5 corridas, tras una de calentamiento.

| Camino | Mediana | Mínimo | Máximo | Resultado |
| --- | --- | --- | --- | --- |
| catalog.searchProducts (sin texto) | 6.5 ms | 5.3 ms | 11.9 ms | 50 filas |
| inventory.listProductStock (sin filtro) | 43.7 ms | 20.6 ms | 57.0 ms | 25/50 filas |
| inventory.listProductStock (página profunda) | 11.8 ms | 10.3 ms | 19.7 ms | 25/50 filas |
| crm.searchClients (sin texto) | 5.1 ms | 4.7 ms | 7.7 ms | 25/50 filas |
| crm.searchClients (página profunda) | 4.5 ms | 4.2 ms | 9.3 ms | 25/50 filas |
| crm.searchClients (prefijo de nombre) | 4.9 ms | 4.4 ms | 5.6 ms | 5/5 filas |
| conversations.listConversations | 16.1 ms | 13.3 ms | 17.9 ms | 25/50 filas |
| conversations.searchClientsByLastInteraction | 32.3 ms | 22.7 ms | 42.3 ms | 25/50 filas |
| organizations.listMembers | 4.8 ms | 3.2 ms | 11.2 ms | 6/6 filas |
| inventory.listProductStock (última página) | 12.0 ms | 6.2 ms | 19.0 ms | 25/50 filas |
| crm.searchClients (última página) | 4.7 ms | 3.9 ms | 6.5 ms | 25/50 filas |
| conversations.listConversations (última página) | 17.2 ms | 12.4 ms | 33.0 ms | 25/50 filas |
| conversations.searchClientsByLastInteraction (última página) | 15.0 ms | 9.2 ms | 24.7 ms | 25/50 filas |
| organizations.listMembers (última página) | 8.0 ms | 4.0 ms | 14.3 ms | 6/6 filas |
| inventory.listStockMovements (producto con 6, última página) | 8.6 ms | 8.1 ms | 11.4 ms | 6/6 filas |
| inventory.listStockMovements (producto con 6) | 8.8 ms | 8.6 ms | 10.7 ms | 6/6 filas |
| API products: palabras («cafe molido») | 3.9 ms | 3.8 ms | 4.9 ms | 0 filas |
| API products: SKU exacto | 9.9 ms | 6.5 ms | 16.5 ms | 1 filas |
| API products: sin coincidencias | 3.7 ms | 2.9 ms | 3.8 ms | 0 filas |
| API products/{product_id} | 5.3 ms | 4.6 ms | 7.1 ms | 1 filas |
| API knowledge: vigentes sin texto | 3.9 ms | 3.4 ms | 5.1 ms | 20 filas |
| API knowledge: vigentes con texto | 4.5 ms | 4.2 ms | 6.5 ms | 2 filas |
| conversations.resolveIngestedConversation (con vigente) | 8.4 ms | 7.5 ms | 9.7 ms | conversación vigente |
| conversations.resolveIngestedConversation (sin vigente) | 8.0 ms | 6.2 ms | 9.0 ms | conversación nueva |
| conversations.listRecentMessagesForService (20 de 12, de 265 de la organización) | 9.7 ms | 7.5 ms | 12.8 ms | 12 filas |
| conversations.listRecentMessagesForService (50, el máximo del contrato) | 9.6 ms | 7.9 ms | 11.0 ms | 12 filas |
| analytics 1 conversaciones iniciadas | 11.1 ms | 9.5 ms | 20.6 ms | valor 7 |
| analytics 2 conversaciones activas | 10.1 ms | 8.9 ms | 12.1 ms | valor 7 |
| analytics 3 clientes únicos | 12.7 ms | 11.9 ms | 23.3 ms | valor {"clients":5,"withoutClient":2} |
| analytics 4-5 mensajes | 3.6 ms | 3.5 ms | 4.7 ms | valor {"inbound":19,"outbound":13} |
| analytics 6 mensajes por conversación | 4.9 ms | 4.1 ms | 8.8 ms | valor {"status":"value","conversations": |
| analytics 10 actividad diaria | 5.8 ms | 5.6 ms | 7.8 ms | valor [{"day":"2026-08-31","started":0," |
| analytics 7 respondidas | 3.6 ms | 3.2 ms | 5.1 ms | valor 6 |
| analytics 8 cobertura de respuesta | 4.9 ms | 4.2 ms | 6.7 ms | valor {"status":"value","responded":6,"w |
| analytics 9 tiempo de primera respuesta | 8.5 ms | 6.1 ms | 9.9 ms | valor {"population":7,"withoutResponse": |
| analytics 11 distribución de estado | 4.9 ms | 4.3 ms | 9.8 ms | valor {"open":1,"pending":4,"closed":2} |
| analytics 12 errores de ingestión | 4.0 ms | 3.8 ms | 4.4 ms | valor {"status":"value","total":20,"fail |

**Dashboard, las 11 llamadas de una carga en paralelo**: mediana 43.2 ms (mínimo 41.7, máximo 55.9).

**Sentencias preparadas con nombre**: 0 en 10 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.

Parámetros: effective_cache_size = 131072 8kB; plan_cache_mode = auto; random_page_cost = 1.1; seq_page_cost = 1; server_version = 18.6 (Ubuntu 18.6-1.pgdg24.04+2); shared_buffers = 16384 8kB; work_mem = 4096 kB.

## Caminos completos — producción, concentrada
Mediana de 5 corridas, tras una de calentamiento.

| Camino | Mediana | Mínimo | Máximo | Resultado |
| --- | --- | --- | --- | --- |
| catalog.searchProducts (sin texto) | 31.7 ms | 22.7 ms | 51.4 ms | 295 filas |
| inventory.listProductStock (sin filtro) | 30.2 ms | 23.4 ms | 70.2 ms | 25/295 filas |
| inventory.listProductStock (página profunda) | 19.0 ms | 17.8 ms | 23.7 ms | 20/295 filas |
| crm.searchClients (sin texto) | 5.4 ms | 5.1 ms | 9.2 ms | 25/300 filas |
| crm.searchClients (página profunda) | 6.2 ms | 5.6 ms | 8.6 ms | 25/300 filas |
| crm.searchClients (prefijo de nombre) | 5.9 ms | 5.3 ms | 8.7 ms | 25/26 filas |
| conversations.listConversations | 17.5 ms | 15.5 ms | 19.4 ms | 25/301 filas |
| conversations.searchClientsByLastInteraction | 28.7 ms | 16.0 ms | 32.4 ms | 25/300 filas |
| organizations.listMembers | 3.5 ms | 3.2 ms | 4.4 ms | 6/6 filas |
| inventory.listProductStock (última página) | 32.3 ms | 17.0 ms | 65.2 ms | 20/295 filas |
| crm.searchClients (última página) | 6.6 ms | 5.0 ms | 16.3 ms | 25/300 filas |
| conversations.listConversations (última página) | 10.1 ms | 7.4 ms | 18.6 ms | 1/301 filas |
| conversations.searchClientsByLastInteraction (última página) | 22.4 ms | 13.7 ms | 28.2 ms | 25/300 filas |
| organizations.listMembers (última página) | 3.4 ms | 2.6 ms | 5.7 ms | 6/6 filas |
| inventory.listStockMovements (producto con 6, última página) | 21.8 ms | 9.9 ms | 41.7 ms | 6/6 filas |
| inventory.listStockMovements (producto con 6) | 22.8 ms | 19.0 ms | 44.7 ms | 6/6 filas |
| API products: palabras («cafe molido») | 21.8 ms | 13.9 ms | 32.7 ms | 4 filas |
| API products: SKU exacto | 5.8 ms | 4.4 ms | 7.2 ms | 1 filas |
| API products: sin coincidencias | 3.1 ms | 2.5 ms | 5.8 ms | 0 filas |
| API products/{product_id} | 3.9 ms | 3.7 ms | 4.4 ms | 1 filas |
| API knowledge: vigentes sin texto | 3.5 ms | 3.3 ms | 3.7 ms | 20 filas |
| API knowledge: vigentes con texto | 4.6 ms | 3.9 ms | 5.7 ms | 2 filas |
| conversations.resolveIngestedConversation (con vigente) | 7.7 ms | 7.1 ms | 8.2 ms | conversación vigente |
| conversations.resolveIngestedConversation (sin vigente) | 8.1 ms | 7.3 ms | 10.7 ms | conversación nueva |
| conversations.listRecentMessagesForService (20 de 4000, de 5916 de la organización) | 3.5 ms | 2.8 ms | 4.1 ms | 20 filas |
| conversations.listRecentMessagesForService (50, el máximo del contrato) | 4.2 ms | 3.9 ms | 6.8 ms | 50 filas |
| analytics 1 conversaciones iniciadas | 5.9 ms | 3.7 ms | 7.2 ms | valor 38 |
| analytics 2 conversaciones activas | 8.0 ms | 7.3 ms | 16.0 ms | valor 38 |
| analytics 3 clientes únicos | 18.9 ms | 12.2 ms | 22.7 ms | valor {"clients":25,"withoutClient":10} |
| analytics 4-5 mensajes | 6.4 ms | 6.1 ms | 9.4 ms | valor {"inbound":2124,"outbound":2107} |
| analytics 6 mensajes por conversación | 7.3 ms | 5.9 ms | 8.0 ms | valor {"status":"value","conversations": |
| analytics 10 actividad diaria | 13.6 ms | 12.4 ms | 16.1 ms | valor [{"day":"2026-08-31","started":3," |
| analytics 7 respondidas | 7.9 ms | 6.9 ms | 8.2 ms | valor 31 |
| analytics 8 cobertura de respuesta | 10.2 ms | 6.9 ms | 16.2 ms | valor {"status":"value","responded":31," |
| analytics 9 tiempo de primera respuesta | 15.6 ms | 9.1 ms | 28.4 ms | valor {"population":37,"withoutResponse" |
| analytics 11 distribución de estado | 7.0 ms | 6.7 ms | 7.4 ms | valor {"open":10,"pending":14,"closed":1 |
| analytics 12 errores de ingestión | 8.6 ms | 7.6 ms | 9.5 ms | valor {"status":"value","total":21,"fail |

**Dashboard, las 11 llamadas de una carga en paralelo**: mediana 81.4 ms (mínimo 72.7, máximo 128.2).

**Sentencias preparadas con nombre**: 0 en 10 conexiones del pool. `plan_cache_mode` = auto; fijado por rol o base: en ninguno.
```

#### Los planes (AC-9)

Los tres archivos de planes están en [planes-13.2/](planes-13.2/): [grande](planes-13.2/planes-grande.md), [chica](planes-13.2/planes-chica.md) y [concentrada](planes-13.2/planes-concentrada.md). Son la salida de `auto_explain` de la ejecución real de cada consulta, con su tiempo y sus buffers.

**Un recorte, declarado**: las líneas de más de 3000 caracteres quedaron en sus primeros 600, con una marca que dice el largo original. Son 13 en la grande y 6 en la concentrada, de consultas con cientos o miles de valores en un `IN`: 3 de `Query Text`, 8 de `Query Parameters` y **8 de `Index Cond`**, que son líneas de un nodo de plan. En esas ocho se pierde la lista de identificadores del `ANY(...)`; el nodo, su índice, sus filas, sus tiempos y sus buffers quedan enteros. El archivo de la grande pesaba 2,8 MB y 2,7 MB eran esas líneas. La chica no tiene recortes. Los archivos sin recortar no se versionan y el directorio del servidor se borró en el paso 5. *Corregido por la revisión independiente (H-3): la primera versión decía que ninguna línea de un nodo se había recortado.*

| Organización | Tamaño | Consultas | Con recorrido secuencial | Consulta más lenta |
| --- | --- | --- | --- | --- |
| grande (ordinal 0) | 10.000 clientes, 65.260 mensajes | 118 | 30 | 91,0 ms |
| chica (ordinal 4) | 50 clientes, 265 mensajes | 116 | 19 | 2,3 ms |
| concentrada (ordinal 20) | 300 clientes, 5.916 mensajes | 118 | 19 | 8,4 ms |

Son los mismos recuentos que dio el ensayo. La chica tiene dos consultas menos: la búsqueda por palabras no encuentra productos, y no pide ni sus precios ni su stock.

**Todos los recorridos secuenciales**:

| Tabla | Dónde | Filas leídas | Tiempo del nodo | Lectura |
| --- | --- | --- | --- | --- |
| `organizations` | 19 consultas en cada organización: la lectura de la organización que abre cada camino | 1 a 21, de una tabla de 21 | 0,02 a 0,14 ms | La tabla entra en una página. Un índice no mejora nada. |
| `products` | solo en la grande, 4 consultas: `searchProducts` y las tres de `listProductStock` | 14.100, para devolver 9.491 | 12 a 25 ms | La organización es el 71 % de la tabla: 10.000 productos. Devuelve los 9.491 activos y descarta 4.609: 4.100 ajenos y 509 inactivos propios. |
| `clients` | solo en la grande, 5 consultas: `searchClients` y `searchClientsByLastInteraction` | 14.100, para devolver 10.000 | 14 a 17 ms | La organización es el 71 % de la tabla. |
| `conversations` | solo en la grande, 2 consultas: las métricas 3 y 11 | 14.101, para devolver 10.000 | 3 a 4 ms | La organización es el 71 % de la tabla. |

En las tres tablas de la segunda parte, el recorrido secuencial es el plan correcto: la consulta pide todas las filas de una organización que ocupa el 71 % de la tabla. *Corregido por la revisión independiente (H-5): la primera versión daba 67 % para `products`, que es la proporción de sus productos activos.* Desde la chica y la concentrada, las mismas consultas entran por índice.

**Lo que esto no mide**: a partir de qué proporción de la tabla PostgreSQL deja el índice. Las organizaciones de 1.000 clientes (ordinales 1 a 3) están cargadas y no se midió desde ninguna.

#### Los cambios de forma (AC-10)

Contra la grande, 28 consultas de la chica y **18** de la concentrada tienen otra forma de plan. La comparación la hizo un guion sobre los tres archivos ([analizar-planes.mjs](planes-13.2/guiones/analizar-planes.mjs)), por camino y número de consulta, mirando los nodos sin sus costos. Tres consultas quedaron fuera de esa comparación porque su texto no coincide entre organizaciones, y se miraron a mano: dos tienen la misma forma y una no. La cuarta consulta de la última página de `listConversations` entra por `clients_pkey` desde la grande y por `clients_organization_id_id_unique` desde la concentrada; es de la clase 2. *Corregido por la revisión independiente (H-4): la primera versión decía 17 y que las tres tenían la misma forma.*

Son siete clases:

| Clase | Consultas | Grande | Chica o concentrada | Explicación |
| --- | --- | --- | --- | --- |
| 1 | Todas las filas de la organización en `products`, `clients` y `conversations` | `Seq Scan` | `Index Scan` por un índice de la organización | La proporción de la tabla, como arriba. |
| 2 | `count(*)` de clientes y de conversaciones; clientes por `id`; un miembro por `user_id` | un índice | otro índice de la misma tabla | Dos índices sirven igual. La diferencia está por debajo de 0,1 ms. |
| 3 | Mensajes por conversación en `listConversations` | `Index Scan` por `messages_conversation_sent_idx` | `BitmapAnd` de ese índice con `messages_organization_sent_idx` | En la concentrada lee 4.151 mensajes para 25 conversaciones, porque una tiene 4.000: 3,1 ms. |
| 4 | Búsqueda de productos por palabras | `BitmapOr` de `products_search_idx` y el SKU | `Index Scan` por el índice de la organización | La chica tiene 50 productos: leerlos todos cuesta menos que el índice de texto. |
| 5 | Información del negocio con texto | `BitmapAnd` | `BitmapAnd` con los dos índices en el otro orden | El mismo plan. |
| 6 | Métricas 3, 10 y 11 | `Seq Scan` de `conversations`; `Hash Right Join` en la 10 | `Index Scan`; `Hash Left Join`, y en la concentrada el lado de la tabla hash invertido | La clase 1, más el orden del `join` según cuál lado es más chico. |
| 7 | Última página de `listConversations`, grande contra concentrada | `Incremental Sort` sobre el índice por último mensaje: lee las 10.000 | `Sort` de 301 filas | Con 301 filas, ordenar en memoria cuesta menos que recorrer el índice. |

**Ninguna es patológica.** En todas, el plan de la organización chica es el que corresponde a su tamaño, y ninguna consulta de la chica ni de la concentrada pasa de 8,4 ms.

#### La última página (AC-11)

Desde la grande, con la página calculada a partir de `pageCount`:

| Camino | Mediana del camino | Consulta principal | Plan |
| --- | --- | --- | --- |
| `inventory.listProductStock` | 552,5 ms (máximo 724,8) | 91,0 ms | `Seq Scan` de `products`. La página se arma en memoria: la consulta no lleva `OFFSET`. |
| `conversations.searchClientsByLastInteraction` | 199,2 ms | 51,4 ms | `Sort` de los 10.000 clientes. También compone en memoria. |
| `crm.searchClients` | 83,4 ms | 52,5 ms | `Limit` sobre `Sort` sobre `Seq Scan`: ordena los 10.000 para devolver los últimos 25. |
| `conversations.listConversations` | 22,9 ms | 13,8 ms | `Incremental Sort` sobre el índice por último mensaje: recorre los 10.000. |
| `organizations.listMembers` | 21,7 ms | — | 501 miembros. |
| `inventory.listStockMovements` | 13,5 ms | 0,6 ms | `Limit` sobre `Sort` sobre `Index Scan` por el índice del historial: lee y ordena los 400 movimientos del producto en cada página. |

El peor caso es `listProductStock`, y su última página cuesta lo mismo que la primera (573,9 ms): ese camino lee todos los productos en cualquier página.

#### El dashboard (AC-12)

Las 11 llamadas en paralelo, con la métrica 12 incluida y con el resultado de cada una en la tabla de tiempos:

| Organización | Mediana | Mínimo | Máximo | Métrica 12 |
| --- | --- | --- | --- | --- |
| grande | 277,6 ms | 255,2 ms | 283,8 ms | `value`, total 3.340 |
| chica | 43,2 ms | 41,7 ms | 55,9 ms | `value`, total 20 |
| concentrada | 81,4 ms | 72,7 ms | 128,2 ms | `value`, total 21 |

Ninguna llamada devolvió una falla. En la tanda de calibración la métrica 12 devuelve `unavailable`: ese seed no carga eventos de ingestión.

#### La conversación vigente (AC-13)

La consulta de candidatas tiene **el mismo plan desde las tres organizaciones**: `Index Scan` por `conversations_organization_client_last_message_idx`, con la organización, el cliente y el límite inferior de `last_message_at` en la condición del índice. Con una conversación vigente lee 1 fila y 3 buffers, y tarda entre 0,047 y 0,059 ms; sin ninguna, lee 0 filas y 2 buffers, entre 0,033 y 0,039 ms. El resto de las condiciones se aplica como filtro sobre esa fila.

El camino completo, con su bloqueo del cliente, la inserción del mensaje y la actualización de la conversación, tarda entre 7,4 y 8,4 ms en las tres. Corre dentro de una transacción que el script revierte: los recuentos de la base de medición no cambiaron.

**Lo que no cubre**: un cliente con muchas conversaciones dentro de la ventana. El seed da una candidata por cliente.

#### El historial de la conversación concentrada (AC-14)

La conversación tiene 4.000 de los 5.916 mensajes de su organización: el 68 %.

```text
Limit  (cost=4.39..203.95 rows=50 width=100) (actual time=0.078..0.104 rows=50.00 loops=1)
  Buffers: shared hit=5
  ->  Incremental Sort  (cost=4.39..978.23 rows=244 width=100) (actual time=0.076..0.096 rows=50.00 loops=1)
        Sort Key: sent_at DESC, id DESC
        Presorted Key: sent_at
        Full-sort Groups: 2  Sort Method: quicksort  Average Memory: 29kB  Peak Memory: 29kB
        Buffers: shared hit=5
        ->  Index Scan Backward using messages_conversation_sent_idx on messages  (cost=0.42..967.25 rows=244 width=100) (actual time=0.039..0.059 rows=51.00 loops=1)
              Index Cond: (conversation_id = '5eed000b-0014-4000-8000-000000000000'::uuid)
              Filter: (organization_id = '5eed0000-0014-4000-8000-000000000021'::uuid)
              Index Searches: 1
              Buffers: shared hit=5
```

- **Lee 51 filas para devolver 50**, y 21 para devolver 20. No recorre la conversación: entra por el final del índice y se detiene.
- **0,17 ms y 5 buffers** con el máximo del contrato.
- **El planificador estima 244 filas donde hay 4.000.** No cambia nada acá: el `Limit` corta antes.
- El `Incremental Sort` existe porque el índice ordena por `sent_at` y la consulta desempata por `id`. Ordena grupos de mensajes con la misma fecha, no la conversación.

**Decisión sobre el índice: no hace falta uno nuevo.** `messages_conversation_sent_idx` sirve la consulta en el caso desfavorable. D-6 no se activa y no hay migración que consultar.

#### La ventana del manifiesto (AC-15)

Con los dos comandos de `crm-backup.sh`, contra la base de medición de 78 MB: el `pg_dump` tarda entre 2,10 y 2,43 s y la consulta de recuentos, entre 0,18 y 0,20 s. **La ventana entre el inicio del dump y el fin de los recuentos fue de 2,28, 2,48 y 2,62 s.** El dump pesa 5,1 MB.

Una fila escrita en esa ventana puede estar en el manifiesto y no en el dump. No se midió con escrituras concurrentes: el número es la duración de la ventana, no la frecuencia con que produce una diferencia.

#### Veredicto contra el umbral

- **Consulta más lenta**: 91,0 ms, contra un umbral de 754 ms. Es una sola ejecución, con `auto_explain` midiendo cada nodo: la lectura de `products` de la última página de `listProductStock`. La misma consulta, con el mismo plan, tardó 60,7, 66,8 y 50,6 ms en los otros tres caminos del mismo archivo.
- **Camino más lento**: `inventory.listProductStock`, con 573,9 ms de mediana y 724,8 ms de máximo, contra un umbral de 1508 ms. En la tanda de calibración el mismo camino llegó a 950,8 ms.

**Ninguna consulta es patológica. D-6 no se activó y `src/` no se tocó.**

Una observación que el umbral no recoge: `listProductStock` tarda más de medio segundo con 10.000 productos en esta máquina, y sus dos consultas suman unos 100 ms. El resto ocurre en Node, armando la página en memoria. Es lo que la 8.5 y la 9.3 ya habían medido; acá pesa más porque la máquina es más lenta. No depende de un índice.

#### Lo que el análisis no había mencionado

Lo señaló la revisión independiente, y está verificado contra los planes. Nada de esto supera los umbrales.

- **La métrica 9 es la segunda consulta más lenta**: 75,1 ms desde la grande, con 34.857 buffers. Tiene cuatro subplanes que se ejecutan entre 1.369 y 1.622 veces, uno por conversación del período. Su costo crece con las conversaciones activas.
- **`listProductStock` manda un `IN` con un parámetro por producto activo**: 9.490 desde la grande. El protocolo de PostgreSQL admite 65.535 parámetros por sentencia. Una organización con más productos activos que eso no vería este camino más lento: lo vería fallar. No se midió; el límite es del protocolo, no de esta medición. `listMembers` usa la misma forma, con 501.
- **`listStockMovements` ordena todos los movimientos del producto en cada página**: el índice no sirve el orden. Con 400 movimientos tarda 0,6 ms.
- **La información del negocio sin texto estima 1 fila y lee 119**: recorre las entradas de la organización y descarta 81.
- **Siete de las once llamadas del dashboard releen las mismas 10.658 filas de `messages`**, con unos 10.596 buffers cada una.

#### Límites del instrumento

También de la revisión independiente, verificados contra `scripts/medir-caminos.ts` y contra `pg-pool`:

- **El control de los planes exige un plan por camino, no uno por consulta.** «118 consultas» son 118 planes capturados; nada cuenta aparte las consultas emitidas. Los recuentos coinciden con los del ensayo.
- **La comprobación de sentencias preparadas mira las conexiones vivas al final de la corrida.** El pool cierra las ociosas a los 10 s, así que «0 en 10 conexiones» vale para el pool final. Cubre los caminos medidos; no cubre el ingreso, la sesión ni las escrituras de la interfaz, que descansan en la lectura del driver y en la guarda.
- **La fila «página profunda» de la calibración compara páginas distintas.** La 8.5 midió la página 380 de `listProductStock` y acá se midió la 20. Ese camino cuesta lo mismo en cualquier página, y la mediana sale de otra fila.

**Autoevaluación**: midió y analizó el mismo agente que escribió el instrumento. La revisión independiente es el AC-19.

### Paso 5: la limpieza, 2026-09-30 (AC-17)

Autorizado por el usuario en su turno. Salida literal:

```text
2026-09-30T14:42:16Z
--- antes de borrar: crm_production contra la línea de base (vacío = igual)
iguales
--- la línea de base, antes de borrarla
audit_logs 1
clients 0
conversations 0
ingestion_credentials 0
ingestion_events 0
ingestion_rate_windows 0
inventories 0
inventory_movements 0
knowledge_entries 0
login_attempts 44
messages 0
organization_members 1
organizations 1
product_prices 0
products 0
sessions 2
users 1
--- 1 y 2. la base, los permisos de parámetros y el rol
psql: salida 0
--- 3. los archivos
--- 4. lo que queda
bases de medición: 0
roles de medición: 0
permisos de parámetros: 0
bases: crm_production,postgres,template0,template1
roles con login: crm_app_login,crm_owner,postgres
log_min_duration_statement = -1
log_parameter_max_length = -1
log_statement = none
session_preload_libraries = 
shared_preload_libraries = 
ajustes por rol o base: 0
/etc/crm-medicion: no existe
/var/lib/crm-production/medicion: no existe
despliegues
home
ssh
sesiones de crm_medicion en el log de PostgreSQL con sentencias: 0
planes en el log de PostgreSQL: 0
--- crm_production y la aplicación
audit_logs 1
clients 0
conversations 0
ingestion_credentials 0
ingestion_events 0
ingestion_rate_windows 0
inventories 0
inventory_movements 0
knowledge_entries 0
login_attempts 44
messages 0
organization_members 1
organizations 1
product_prices 0
products 0
sessions 2
users 1
/srv/crm-production sin cambios: 938423d0a832e65eb9c42474c51a47a44c54689e
archivos modificados en /srv/crm-production: 0
active
active
/login -> 200
  44G
2026-09-30T14:42:18Z
```

Lo que queda comprobado:

- **La base y el rol de medición no existen más**, ni sus cinco permisos de parámetros, ni `/etc/crm-medicion`, ni el segundo checkout.
- **El registro de sentencias está apagado**: `log_statement = none`, `log_min_duration_statement = -1`, ninguna biblioteca precargada y ningún ajuste por rol o por base. El log de PostgreSQL no tiene ningún plan ni ninguna sentencia del rol de medición.
- **Los recuentos de `crm_production` son los de la línea de base**, comparados con `diff` antes de borrarla y listados otra vez después.
- **`/srv/crm-production` sigue en `938423d`**, sin archivos modificados, y la aplicación responde `200`.

Dos límites: la búsqueda en el log miró los archivos sin comprimir de `/var/log/postgresql`, y el `npm ci` del segundo checkout dejó paquetes en la caché de `npm` del usuario `crm`, que ya existía por los despliegues y no se tocó.

## Revisión independiente: las correcciones, 2026-09-30

Los hallazgos y lo que se hizo con cada uno están en el [brief](brief-13.2-mediciones-previas-a-datos-reales.md), §«Revisión independiente». Acá queda la salida de lo que se ejecutó.

**La guarda corregida (H-2)**, con tres mutaciones sobre archivos reales, cada una revertida después:

```text
M1 en src/modules/crm/repository.ts   (se agrega: export const poolDeMutacion = () => getDb().$client;)
+   "src/modules/crm/repository.ts: usa el pool crudo",
      Tests  1 failed | 40 passed (41)
M2   (se agrega drizzle/9999_mutacion.sql: ALTER ROLE crm_app SET plan_cache_mode = force_generic_plan;)
+   "drizzle/9999_mutacion.sql: fijar plan_cache_mode",
      Tests  1 failed | 40 passed (41)
M3   (se agrega a scripts/migrar.ts: // await cliente.query({ values: [{ a: 1 }], text, name: "x" });)
+   "scripts/migrar.ts: .query({ name })",
      Tests  1 failed | 40 passed (41)
sin mutaciones
      Tests  41 passed (41)
```

`[transcrito]`: las líneas entre paréntesis describen cada mutación; el resto es la salida de Vitest filtrada.

**Local, después de las correcciones**: formato, lint y typecheck en verde; guardas, 443 de 443 en 14 archivos. Los tests de integración y los end-to-end no se volvieron a correr: desde el commit `803571e` no cambió nada de `src/` ni de `seeds/`.

**Un incidente de las correcciones**: revertir con `git checkout` dejó tres archivos con finales de línea CRLF, y la guarda del backup de staging falló ocho casos hasta devolverlos a LF. Es la tarea de `.gitattributes` que ya está en Notion.
