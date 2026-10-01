# Despliegue de staging

Configuración versionada del entorno `staging.vixoraai.app` ([brief-9.1](../../docs/decisions/brief-9.1-infraestructura-de-staging.md)).

**Por qué existe este directorio.** Hasta el 2026-09-22 esta configuración vivía solo en el servidor. La revisión independiente de la 9.1 lo señaló como hallazgo **mayor** (H-1): toda la resolución de H-3 descansa en que nginx **reemplace** `x-forwarded-for` en vez de agregarlo, y esa premisa no se podía auditar ni detectar su regresión. Re-aprovisionar la máquina o poner algo delante —Cloudflare, un balanceador— reintroduce H-3 **en silencio y pasando en verde**.

Los archivos de acá son la fuente de verdad. **Tres** guardas los fijan con casos de fallo: `tests/guards/staging-proxy-config.test.ts` (nginx y la unidad de la aplicación, 9.1), `tests/guards/staging-backup-config.test.ts` (los scripts y las unidades de backup, 9.2) y `tests/guards/staging-postgres-config.test.ts` (los parámetros de costo del planificador, 9.3).

## Archivos

| Archivo | Destino en el servidor |
| --- | --- |
| `nginx-crm-staging.conf` | `/etc/nginx/sites-available/crm-staging`, enlazado en `sites-enabled/` |
| `crm-staging.service` | `/etc/systemd/system/crm-staging.service` |
| `crm-backup.sh` | `/usr/local/bin/crm-backup.sh`, `0755` (9.2) |
| `crm-restore-check.sh` | `/usr/local/bin/crm-restore-check.sh`, `0755` (9.2) |
| `crm-backup.service` | `/etc/systemd/system/crm-backup.service` (9.2) |
| `crm-backup.timer` | `/etc/systemd/system/crm-backup.timer` (9.2) |
| `crm-restore-check.service` | `/etc/systemd/system/crm-restore-check.service` (9.2) |
| `crm-restore-check.timer` | `/etc/systemd/system/crm-restore-check.timer` (9.2) |
| `postgresql-crm-staging.conf` | `/etc/postgresql/18/main/conf.d/crm-staging.conf` (9.3) |

El procedimiento de restauración y el ejercicio mensual viven en [docs/runbooks/restaurar-la-base.md](../../docs/runbooks/restaurar-la-base.md).

**Estado al 2026-09-24**: los **nueve** archivos de la tabla de arriba están desplegados y el `diff` de la sección «Verificar después de desplegar» da **cero diferencias** en los nueve. Los dos timers están habilitados. El noveno lo agregó la 9.3: los parámetros de costo del planificador, que hasta entonces describían una máquina de 4 GB sobre una de 961 MB. La última copia fue `crm-backup.sh`, el 2026-09-24, con un cambio que solo toca comentarios ([brief-11.0](../../docs/decisions/brief-11.0-instrumentos-antes-de-construir-encima.md), D-5).

**El número se cuenta, no se hereda.** Esta línea dijo «seis» mientras la tabla tenía ocho filas, y la 9.3 lo «corrigió» a siete sumándole uno al número equivocado en vez de contar la tabla. Es el cuarto recuento mal registrado de este linaje (antes H-5, N-2 y R-7). Se comprueba así, y el resultado tiene que coincidir con las filas de la tabla:

```
ls deploy/staging/ | grep -v README | wc -l
```

Las líneas marcadas `# managed by Certbot` las escribió `certbot --nginx` y **no se editan a mano**: se regeneran al renovar.

## Lo que NO está acá, a propósito

Los secretos. Viven en `/etc/crm-staging/`, con permisos `0600` de `root`, fuera del repositorio y fuera de CI (D-8):

| Archivo | Para qué |
| --- | --- |
| `app.env` | El que lee `systemd`. `DATABASE_URL` con el rol de aplicación, `TRUSTED_PROXY=true`, `NODE_ENV=production` |
| `migrate.env` | `DATABASE_URL` con el rol dueño. Solo para migraciones |
| `seed.env` | `SEED_USER_PASSWORD` de los usuarios sintéticos |
| `backup.env` | Variables `PG*` y la política de rotación del backup (9.2). **No trae la contraseña** |
| `backup.pgpass` | La contraseña del rol dueño, para el backup. Va acá y no en `backup.env` porque `pg_dump "postgres://user:pass@…"` la dejaría visible en `ps` para cualquier usuario del sistema |

**Límite declarado**: un `EnvironmentFile` `0600` protege contra otro usuario del sistema, **no** contra quien tenga `root` ni contra un respaldo de disco sin cifrar. Alcanza para un entorno sin datos reales y **no** es lo que se lleva a producción sin volver a decidirlo.

## Aprovisionamiento

Orden importante. Los pasos 4 y 5 son los que el primer despliegue reveló.

1. **Swap antes que nada.** `next build` en 1 núcleo con 961 MB y sin swap muere por memoria, y el síntoma es un proceso muerto sin mensaje claro. 2 GB en `/swapfile`, con `vm.swappiness=10`: si el entorno usa swap en régimen normal, eso es un hallazgo, no un éxito.
2. **Node 24** (NodeSource) y **PostgreSQL 18.6** con `postgresql-contrib` — `contrib` trae `unaccent`, de la que depende la 9.0.2. La versión de PostgreSQL de Ubuntu 24.04 es la 16: hace falta el repositorio `pgdg`.
3. **Base y rol dueño**: `crm_staging`, propiedad de `crm_owner`.
4. **Crear el rol `crm_app` con el superusuario, antes de migrar.** La migración `0003` lo crea si no existe, pero crear un rol es un objeto **del servidor** y exige `CREATEROLE`, que el rol dueño no tiene. En desarrollo nunca falla porque el usuario de `docker-compose` es superusuario.
   > **Cuidado**: si se omite este paso, la migración `0003` falla por falta de privilegio. Hasta la 11.0, `npm run db:migrate` corría `drizzle-kit migrate`, que en ese caso salía con **código 1 sin imprimir ningún error**: cero tablas y ningún mensaje. *Desde la 11.0* corre `scripts/migrar.ts`, que imprime el error de PostgreSQL con su SQLSTATE y la sentencia que falló (O-8). Si las migraciones fallan, empezar por acá.
   >
   > Se resuelve así, y no otorgándole `CREATEROLE` al rol dueño, por menor privilegio: el `IF NOT EXISTS` de la migración lo saltea y el resto de sus `GRANT` corre normal.
5. **Migrar** con `migrate.env`, con la forma de [Desplegar un cambio](#desplegar-un-cambio), después **crear el rol con login miembro de `crm_app`** y recién entonces escribir `app.env`. Las migraciones siguen corriendo con el dueño; la aplicación nunca.
6. **nginx y certbot.** TLS antes del primer intento de ingreso, **no después**: con `NODE_ENV=production` la cookie de sesión pasa a `__Host-` con `Secure`, y sobre HTTP el navegador la descarta. El síntoma parece un fallo de autenticación y no lo es.
7. **UFW**: solo `OpenSSH` y `Nginx Full`. El puerto 3000 nunca se abre.

## Desplegar un cambio

*Corregido el 2026-09-25 ([brief-12.1](../../docs/decisions/brief-12.1-actor-de-servicio-y-cliente-por-telefono.md), E-1).* Los archivos de `/etc/crm-staging/` son `0600` de `root` (D-8 de la 9.1), así que `. /etc/crm-staging/<x>.env` como el usuario del ssh falla con `Permission denied`. La forma que funciona es la que se usó en la 11.4 ([evidencia](../../docs/decisions/evidencia-11.4-piloto.md), §AC-6):
- `root` lee el archivo;
- `npm` corre como `benja`, el dueño de `/srv/crm-staging`, para que ningún archivo del repositorio quede de `root`;
- a `npm` le llegan **solo** las variables que nombra el `export`.

*Corregido el 2026-10-01 ([brief-13.5](../../docs/decisions/brief-13.5-primer-cliente.md), revisión independiente de la 13.5.1).* La forma anterior pasaba `DATABASE_URL` con `sudo -u … --preserve-env`, y `sudo` registra en su log, `/var/log/auth.log` y el journal, **el valor** de cada variable que se le pasa así: la contraseña de la base quedaba escrita en cada línea. Ahora el shell de `root` carga el archivo sin `set -a`, exporta solo las variables que nombra, y cambia de usuario con `runuser`, que no pasa por `sudo`. Medido en staging y en producción ([evidencia-13.5](../../docs/decisions/evidencia-13.5-primer-cliente.md)).

Los nombres de cada archivo se listan sin sus valores con `sudo sed -E "s/=.*//" /etc/crm-staging/<x>.env`.

Código y dependencias, como `benja`:

```
cd /srv/crm-staging
git fetch && git reset --hard origin/main
npm ci --no-audit --no-fund
```

Si el cambio trae migraciones, correrlas con `migrate.env` **antes** del `build`. Cada comando carga su propio archivo, así que las variables de `migrate.env` y de `app.env` no se mezclan:

```
sudo bash -c ". /etc/crm-staging/migrate.env && export DATABASE_URL && cd /srv/crm-staging && exec runuser -u benja -- npm run db:migrate"
```

Build con `app.env` y reinicio. La lista del `export` son las variables de `app.env` al 2026-09-25 que el build y la aplicación usan. Se agrega una si la aplicación pasa a necesitarla para compilar; las dos de la API de lectura (`READ_API_*`) no hacen falta en el build y no se agregan al encenderla:

```
sudo bash -c ". /etc/crm-staging/app.env && export NODE_ENV PORT HOSTNAME DATABASE_URL TRUSTED_PROXY INGESTION_ENABLED INGESTION_ALLOWED_CREDENTIALS && export NODE_OPTIONS=--max-old-space-size=1536 && cd /srv/crm-staging && exec runuser -u benja -- npm run build" && sudo systemctl restart crm-staging
```

*Corregido el 2026-09-25 en la primera corrida real de esta sección ([brief-12.3](../../docs/decisions/brief-12.3-contrato-de-ingestion-v2.md), 12.3.2, E-1). Dos cambios:*
- **`NODE_OPTIONS=--max-old-space-size=1536`**: con 961 MB, Node reserva 529 MB de heap por defecto, y desde la 12.3.1 el chequeo de tipos de `next build` los supera. Muere con `JavaScript heap out of memory` y el build termina en `Failed to type check.` El resto lo cubren los 2 GB de swap del paso 1 del aprovisionamiento.
- **El reinicio va encadenado con `&&`**: solo corre si el build terminó bien. La versión anterior eran dos líneas, y la segunda corría aunque la primera fallara. Con el `.next` a medio escribir, el servicio no arranca: en esa corrida staging respondió **`502`** hasta que un build correcto lo recuperó.

Las migraciones de arriba y el `npm ci` funcionaron tal como están escritos.

Todas las migraciones pendientes se aplican en **una sola transacción**: si falla una, no queda aplicada ninguna del lote. El comando sale con código distinto de 0 e imprime el error; un `Migraciones aplicadas.` es la única salida buena.

## Encender y apagar la API de lectura

La [API de lectura](../../docs/contracts/read-v1.md) está **apagada** en staging y responde `404`. Se enciende solo para una prueba y se apaga al terminar ([brief-11.4](../../docs/decisions/brief-11.4-piloto-en-staging.md), D-6). Nunca se configura una credencial de un emisor real.

1. **Crear una credencial sintética** con el rol de la aplicación, que tiene `INSERT` sobre `ingestion_credentials` (migración `0014`). El token se muestra **una sola vez**: se copia a un gestor local y nunca a un archivo del repositorio, a la evidencia ni a un mensaje.

   ```
   sudo bash -c ". /etc/crm-staging/app.env && export DATABASE_URL && cd /srv/crm-staging && exec runuser -u benja -- npm run --silent ingestion:credential -- create --org <organization_id> --source <source> --scope read"
   ```

   Es la forma de [Desplegar un cambio](#desplegar-un-cambio). Solo hace falta la conexión de `app.env`.

2. **Encenderla**: agregar a `/etc/crm-staging/app.env` las dos líneas de abajo, con el id que imprimió el paso 1, y reiniciar.

   ```
   READ_API_ENABLED=true
   READ_API_ALLOWED_CREDENTIALS=<credential_id>
   ```

   `sudo systemctl restart crm-staging`. Un `GET /api/read/v1/knowledge` sin credencial tiene que dar `401`, no `404`.

3. **Apagarla**: borrar esas dos líneas de `app.env`, reiniciar y revocar la credencial.

   ```
   sudo bash -c ". /etc/crm-staging/app.env && export DATABASE_URL && cd /srv/crm-staging && exec runuser -u benja -- npm run --silent ingestion:credential -- revoke --id <credential_id>"
   ```

   La evidencia de la 11.4 registra la salida de la revocación, no su comando literal. Esta línea aplica la forma probada con `create`.

   El mismo `GET` tiene que volver a dar `404`, y `select revoked_at from ingestion_credentials where id = '<credential_id>'` no puede ser nulo.

`app.env` no está versionado (D-8), así que ningún `diff` detecta que la API quedó encendida. Se comprueba con ese `GET`.

*Agregado el 2026-09-27 ([brief-12.5](../../docs/decisions/brief-12.5-turno-completo-en-staging.md), 12.5.1).* **Desde la 12.4 hay dos alcances de lectura**, y cada uno lleva su propia credencial:

- **`read`**: catálogo e información del negocio;
- **`context`**: el historial, `GET /api/read/v1/messages`. Necesita la migración `0024`.

Cada una se crea con el paso 1, cambiando `--scope`. Los dos ids van juntos en la allowlist, separados por coma: `READ_API_ALLOWED_CREDENTIALS=<id_read>,<id_context>`. Al apagar, se revocan las dos.

- **Comprobación de más**: un `GET /api/read/v1/messages?conversation_ref=x` sin credencial tiene que dar `401` con la API encendida, y `404` apagada.
- **La ingestión se enciende igual**, con `INGESTION_ENABLED=true` e `INGESTION_ALLOWED_CREDENTIALS`, y una credencial `--scope ingest`. Se comprueba con un `POST /api/ingestion/v2/events` sin credencial: `401` encendida, `404` apagada ([evidencia-12.3](../../docs/decisions/evidencia-12.3-ingestion-v2.md), §12.3.3).
- **Si el token va a un emisor, lo crea el usuario en su propia terminal** y lo pega directo en el emisor. Así no pasa por la conversación con un asistente. Desde la 12.3.3, porque en la 12.3.2 un `echo` imprimió 6 caracteres de un token.

## Verificar después de desplegar

Los dos primeros comprueban lo que ninguna guarda puede: que el servidor tenga lo que el repositorio dice.

1. **Que la configuración desplegada sea la versionada.** Es el único paso que cierra el hueco de H-1, y es manual a propósito: un test que fingiera comprobarlo sería peor que no tenerlo.
   **Los nueve archivos, no dos.** La versión anterior de este paso comparaba solo los dos de la 9.1 y dejaba fuera los que agregaron la 9.2 y la 9.3, pese a ser el paso que este mismo README llama «el único que cierra el hueco de H-1».

   ```
   ssh crm-staging 'sudo cat /etc/nginx/sites-available/crm-staging' | diff - deploy/staging/nginx-crm-staging.conf
   ssh crm-staging 'sudo cat /etc/systemd/system/crm-staging.service'  | diff - deploy/staging/crm-staging.service

   for f in crm-backup.sh crm-restore-check.sh; do
     ssh crm-staging "sudo cat /usr/local/bin/$f" | diff - "deploy/staging/$f" && echo "$f OK"
   done
   for f in crm-backup.service crm-backup.timer crm-restore-check.service crm-restore-check.timer; do
     ssh crm-staging "sudo cat /etc/systemd/system/$f" | diff - "deploy/staging/$f" && echo "$f OK"
   done

   ssh crm-staging "sudo cat /etc/postgresql/18/main/conf.d/crm-staging.conf" |
     diff - deploy/staging/postgresql-crm-staging.conf && echo "postgresql OK"
   ```
2. **Que siga habiendo un solo salto de proxy.** Si alguna vez hay dos, `session-cookie.ts` lee una IP interna idéntica para todas las peticiones y H-3 vuelve sin que nada falle. La aplicación **no registra** la cabecera en el log, así que no se mira ahí: se mide por consecuencia, con el mismo método del AC-5. La clave del límite por IP es `sha256(ip)` sin sal y queda guardada en `login_attempts.key_hash`, así que comparar hashes decide el asunto sin ambigüedad.

   El ingreso es una **Server Action**: un `POST` suelto de `curl` no genera el intento. La fila se produce fallando el ingreso desde el navegador, en `https://staging.vixoraai.app/login`.

   **La contraseña del intento tiene que tener 12 caracteres o más**, por ejemplo `contrasena-falsa-2026` con el email `prueba@ejemplo.invalid`. Una más corta no pasa la validación del formato, que corta antes de contar el intento: no deja fila, y la pantalla muestra el mismo «Email o contraseña incorrectos.», así que no se nota (E-4, 12.5.1).

   ```
   # 1. Fallar el ingreso una vez desde el navegador. Después, las claves que quedaron,
   #    con su hora: una fila vieja de otro despliegue da «iguales» sin probar nada.
   #    Se consulta como `postgres` y no con DATABASE_URL: esa variable no existe en una
   #    sesión ssh —vive en /etc/crm-staging/app.env, 0600 de root (D-8)— y `psql ""` se
   #    conectaría a la base por defecto sin avisar. Es la forma que se usó al medir el AC-5.
   ssh crm-staging "sudo -u postgres psql -d crm_staging -tAc \
     \"select attempted_at, key_hash from login_attempts where scope='ip' order by attempted_at desc limit 3;\""

   # 2. El hash de tu IP pública, que es contra lo que se compara.
   curl -s https://api.ipify.org | tr -d '\n' | sha256sum | cut -d' ' -f1
   ```

   La primera fila tiene que ser **de recién** (la hora sale en UTC), y su hash y el tuyo, **iguales** (el `cut` está para quitarle a `sha256sum` el ` -` del final, que si no impide compararlos de un vistazo). Si no lo son, la aplicación no está viendo la IP del cliente: hay un salto de proxy de más, todas las peticiones comparten una clave interna y eso **es** H-3 reproducido. El control que le da valor a la comparación es repetirla desde otra IP —un túnel SOCKS alcanza, `ssh -f -N -D 1080`— y comprobar que el hash cambia.

   **Nunca se versiona ni la IP ni su hash**: ni en la evidencia ni en un mensaje que termine en el repositorio. Se anota solo si coinciden o no, y a qué hora es la fila. La clave es `sha256(ip)` **sin sal**, y un hash de una IPv4 se revierte en minutos probando todas las direcciones. Hasta el 2026-09-29 la evidencia de la 9.1, la 11.4, la 12.3 y la 12.5 tenía la IP pública del usuario o su hash, y se reemplazaron por marcadores (revisión independiente de la 12.5, R-1). El historial de Git conserva los valores viejos: el repositorio es privado, y el usuario decidió no reescribirlo.

   Lo que este paso **no** cubre: que un cliente pueda falsificar la cabecera. Eso depende de que nginx reemplace en vez de agregar, y de eso se ocupa la guarda sobre el archivo versionado más el paso 1 de esta lista, que comprueba que el servidor tenga ese archivo. Ninguno de los dos sustituye al otro.
3. **HSTS presente sobre HTTPS y ausente sobre HTTP**: `curl -I https://staging.vixoraai.app/login` y `curl -I http://staging.vixoraai.app/login`. El segundo es el que da valor al primero.
4. **La aplicación solo en loopback**: `sudo ss -tlnp | grep 3000` tiene que decir `127.0.0.1:3000`. `next start` **ignora la variable `HOSTNAME`**; el enlace depende del flag `-H` de la unidad.
5. **El rol de la aplicación no es el dueño**: `DELETE FROM audit_logs` con la conexión de `app.env` tiene que responder `permission denied`.
