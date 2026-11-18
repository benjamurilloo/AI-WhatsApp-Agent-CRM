# Runbook — la demo del CRM en localhost

Desde el 2026-11-18 el CRM está **archivado como demo en localhost**
([brief-13.6](../decisions/brief-13.6-el-archivo-como-demo-local.md)). Ya no hay producción ni
staging: la demo corre en la máquina del operador, sobre el backup final de producción restaurado
en la base `crm_demo` del Postgres de `docker-compose.yml`.

**Este texto se ejecuta, no se lee.** Si un paso no funciona tal como está escrito, el defecto es
del runbook y se corrige acá.

Todos los comandos son de **Git Bash**, desde la raíz del repositorio.

## Qué hace falta

- Docker Desktop, Node.js 24 y `age` (`winget install FiloSottile.age`).
- El repositorio con `npm ci` hecho y un `.env` copiado de `.env.example`.
- **El backup final de producción**, cifrado: `crm_production-20261118T183246Z.dump.age`, con su
  `.age.sha256` y su `.recuentos`. Está en dos lugares de la máquina del operador: una carpeta
  fuera del repositorio y su copia en OneDrive. El ADR 0026 dice dónde. **La copia de OneDrive no
  trae el `.recuentos`**: con ella sola se puede restaurar, pero no hacer el paso 5, así que la
  restauración queda sin verificar.
- **La clave privada de `age`** del operador. Vive aparte de las copias y nunca entra a este
  repositorio ni a la conversación con un asistente.

En los comandos, `B` es la carpeta del backup y `K` la ruta de la clave privada:

```bash
B="/c/ruta/a/la/carpeta/del/backup"
K="/c/ruta/a/la/clave-privada"
F=crm_production-20261118T183246Z.dump
```

## 1. Levantar el Postgres

```bash
docker compose up -d --wait
```

El servicio publica solo `127.0.0.1:5432`. Otro Postgres en otro puerto (el de otro proyecto, por
ejemplo) no choca y no se toca.

## 2. Comprobar el archivo cifrado

```bash
a="$(sha256sum "$B/$F.age" | cut -d' ' -f1)"; e="$(tr -d '\r\n' < "$B/$F.age.sha256")"
[ -n "$a" ] && [ -n "$e" ] && [ "$a" = "$e" ] \
  && echo "sha256 del .age: OK" || echo "NO COINCIDE, o falta un archivo: no sigas"
```

Antes de comparar, se comprueba que ninguna de las dos sumas esté vacía. Si `$B` está mal
escrito, las dos salen vacías, y **dos cadenas vacías son iguales**.

## 3. Crear los roles y la base

El dump asigna las tablas a `crm_owner` y da permisos a `crm_app` y `crm_fx_reader`. `pg_dump` no
trae los `CREATE ROLE`, así que en un Postgres nuevo hay que crearlos antes de restaurar. Sin
ellos, `pg_restore --exit-on-error` falla. No se usa `--no-owner`: dejaría las tablas de otro
dueño y la próxima migración fallaría.

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q' <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_owner') THEN CREATE ROLE crm_owner NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_app') THEN CREATE ROLE crm_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm_fx_reader') THEN CREATE ROLE crm_fx_reader NOLOGIN; END IF;
END $$;
CREATE DATABASE crm_demo;
SQL
```

Si `crm_demo` ya existe, `CREATE DATABASE` falla y no se pisa nada. Para empezar de cero a
propósito: `docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" crm_demo'`.

## 4. Descifrar y restaurar, sin dejar el dump en claro en el disco

El descifrado va directo a `pg_restore` por una tubería: el dump en claro no se escribe en ningún
archivo.

```bash
age -d -i "$K" "$B/$F.age" \
  | docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" --dbname=crm_demo --exit-on-error' \
  && echo "pg_restore: OK"
```

Sin `pg_restore: OK`, el paso falló. Se borra la base y se repite desde el paso 3.

## 5. Comparar con el manifiesto

El manifiesto lo escribió el servidor junto con el dump. La consulta es la de
`deploy/production/crm-restore-check.sh`.

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d crm_demo -tAq' > /tmp/restaurado.txt <<'SQL'
SELECT c.relname || ' ' || (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from public.%I', c.relname), false, true, '')))[1]::text
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname;
SQL
n=$(wc -l < /tmp/restaurado.txt)
[ "$n" -gt 0 ] && tr -d '\r' < "$B/$F.recuentos" | diff - <(tr -d '\r' < /tmp/restaurado.txt) \
  && echo "OK: $n tablas coinciden en existencia y recuento" || echo "FALLA: no sigas"
docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d crm_demo -tAc \"select 'duenos de las tablas: ' || string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public'\""
docker compose exec -T postgres sh -c "psql -U \"\$POSTGRES_USER\" -d crm_demo -tAc \"select 'imagenes que no coinciden con su hash: ' || count(*) from product_images where encode(sha256(image), 'hex') <> sha256\""
```

Lo esperado son tres líneas:

- `OK: 77 tablas…`;
- `duenos de las tablas: crm_owner`;
- `imagenes que no coinciden con su hash: 0`.

Una diferencia en las tablas, en los recuentos o en el dueño detiene la demo hasta entender por
qué. Cero tablas es una falla y no un acierto, porque un manifiesto vacío y una base vacía
coinciden. Y si las tablas tienen otro dueño, la próxima migración falla.

**El paso 5 vale solo justo después de restaurar.** Cuando la demo se usa, los recuentos se
apartan del manifiesto: una credencial, un cliente o un evento nuevos ya son una diferencia.

## 6. Arrancar la aplicación sobre `crm_demo`

La aplicación lee `DATABASE_URL` de `.env`, que apunta a `crm_dev`. Para la demo se pisa en la
terminal, sin editar `.env`: ni Next.js ni los scripts reemplazan una variable que ya existe.

```bash
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\r' | sed 's#/crm_dev$#/crm_demo#')"
echo "$DATABASE_URL" | grep -q '/crm_demo$' && echo "apunta a crm_demo" || echo "NO apunta a crm_demo: no sigas"
npm run dev
```

Se entra en `http://localhost:3000` con los usuarios de producción y **sus contraseñas de
producción del 2026-11-18**: el backup las trae tal como estaban. Se ven tres organizaciones:
«Vixora», «Demostración Vixora» e «iPhone Demo».

`npm run db:migrate` no hace falta: el backup ya trae las 67 migraciones. Si el código local
suma una migración nueva, se aplica con el mismo `DATABASE_URL` exportado.

## 7. Encender la API de lectura y la ingestión

Las dos están apagadas por defecto (`404`). Se crean credenciales **locales**, una por alcance, en
otra terminal con el mismo `DATABASE_URL` exportado:

```bash
ORG=<id de la organización>   # por ejemplo, la de «iPhone Demo»
npm run ingestion:credential -- create --org "$ORG" --source demo-local --scope read
npm run ingestion:credential -- create --org "$ORG" --source demo-local
```

El id de cada organización sale de:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d crm_demo -tAc "select id, name from organizations"'
```

Cada comando imprime el id de la credencial y **el token, una sola vez**. El token no se pega en
ningún archivo del repositorio. Se reinicia la aplicación con los ids:

```bash
export READ_API_ENABLED=true READ_API_ALLOWED_CREDENTIALS=<id de la credencial read>
export INGESTION_ENABLED=true INGESTION_ALLOWED_CREDENTIALS=<id de la credencial ingest>
npm run dev
```

Para el historial y la pausa, el alcance es `--scope context`, y su id va también en
`READ_API_ALLOWED_CREDENTIALS`.

## 8. Comprobar que responde

```bash
TR=<token crm_read_>; TI=<token crm_ing_>
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TR" 'http://localhost:3000/api/read/v1/products?q=iphone'
curl -s -H "Authorization: Bearer $TI" -H 'Content-Type: application/json' \
  -d '{"client":{"display_name":"Cliente Demo Local","phone":"+5491155550099"},"contract_version":"2","event_id":"evt-demo-local-'"$(date -u +%s)"'","event_type":"client.resolved","occurred_at":"'"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"'"}' \
  http://localhost:3000/api/ingestion/v2/events
```

Lo esperado es `200` en la lectura y `"result":"accepted"` en la ingestión. Cada corrida arma otro
`event_id` y otro `occurred_at`, así que siempre es un evento nuevo. Si se reenvía **el mismo
cuerpo**, la respuesta es `"duplicate"`. Si se reenvía el mismo `event_id` con otro contenido, es
`409 event_payload_mismatch`. Hay dos errores que no son del CRM:

- La búsqueda de productos **exige `q`**: sin él, `400` con el campo `q`.
- `occurred_at` no puede estar más de 5 minutos en el futuro: `400` con el campo `occurred_at`.

Al terminar, cada credencial se revoca con
`npm run ingestion:credential -- revoke --id <credential_id>`.

## El agente de WhatsApp contra la demo: pendiente en su proyecto

El agente **no puede alcanzar esta demo hoy**. Los motivos viven en su código y en su despliegue,
no en el CRM:

- corre en un n8n remoto, que no llega al `localhost` de esta máquina;
- elige el host del CRM de una tabla cerrada que solo tiene los hosts de `vixoraai.app`, y en
  producción rechaza cualquier otro.

Apuntarlo a la demo es una subfase del proyecto del agente, con su propio brief. Los caminos son
correr n8n en esta máquina, o publicar la demo por un túnel y agregar ese host a su tabla. Del
lado del CRM no cambia nada: las credenciales se crean como en el paso 7, y los contratos
(`read-v1`, `read-v2`, `read-v3`, `ingestion-v2`) son los mismos.

## Detener la demo

| Acción | Comando |
| --- | --- |
| Detener la aplicación | `Ctrl+C` en la terminal de `npm run dev` |
| Detener el Postgres sin perder datos | `docker compose stop` |
| Borrar solo la demo | `docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" crm_demo'` |

`docker compose down -v` borra **todo** el volumen: la demo y las bases de desarrollo.
