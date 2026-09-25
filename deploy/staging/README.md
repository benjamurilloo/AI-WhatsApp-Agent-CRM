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
5. **Migrar** con `migrate.env` (`set -a && . /etc/crm-staging/migrate.env && set +a && npm run db:migrate`), después **crear el rol con login miembro de `crm_app`** y recién entonces escribir `app.env`. Las migraciones siguen corriendo con el dueño; la aplicación nunca.
6. **nginx y certbot.** TLS antes del primer intento de ingreso, **no después**: con `NODE_ENV=production` la cookie de sesión pasa a `__Host-` con `Secure`, y sobre HTTP el navegador la descarta. El síntoma parece un fallo de autenticación y no lo es.
7. **UFW**: solo `OpenSSH` y `Nginx Full`. El puerto 3000 nunca se abre.

## Desplegar un cambio

```
cd /srv/crm-staging
git fetch && git reset --hard origin/main
npm ci --no-audit --no-fund
set -a && . /etc/crm-staging/app.env && set +a
npm run build
sudo systemctl restart crm-staging
```

Si el cambio trae migraciones, correrlas con `migrate.env` **antes** del `build`, en una shell aparte para no mezclar las variables con las de `app.env`:

```
set -a && . /etc/crm-staging/migrate.env && set +a
npm run db:migrate
```

Todas las migraciones pendientes se aplican en **una sola transacción**: si falla una, no queda aplicada ninguna del lote. El comando sale con código distinto de 0 e imprime el error; un `Migraciones aplicadas.` es la única salida buena.

## Encender y apagar la API de lectura

La [API de lectura](../../docs/contracts/read-v1.md) está **apagada** en staging y responde `404`. Se enciende solo para una prueba y se apaga al terminar ([brief-11.4](../../docs/decisions/brief-11.4-piloto-en-staging.md), D-6). Nunca se configura una credencial de un emisor real.

1. **Crear una credencial sintética** con el rol de la aplicación, que tiene `INSERT` sobre `ingestion_credentials` (migración `0014`). El token se muestra **una sola vez**: se copia a un gestor local y nunca a un archivo del repositorio, a la evidencia ni a un mensaje.

   ```
   cd /srv/crm-staging
   set -a && . /etc/crm-staging/app.env && set +a
   npm run ingestion:credential -- create --org <organization_id> --source <source> --scope read
   ```

2. **Encenderla**: agregar a `/etc/crm-staging/app.env` las dos líneas de abajo, con el id que imprimió el paso 1, y reiniciar.

   ```
   READ_API_ENABLED=true
   READ_API_ALLOWED_CREDENTIALS=<credential_id>
   ```

   `sudo systemctl restart crm-staging`. Un `GET /api/read/v1/knowledge` sin credencial tiene que dar `401`, no `404`.

3. **Apagarla**: borrar esas dos líneas de `app.env`, reiniciar y revocar la credencial.

   ```
   npm run ingestion:credential -- revoke --id <credential_id>
   ```

   El mismo `GET` tiene que volver a dar `404`, y `select revoked_at from ingestion_credentials where id = '<credential_id>'` no puede ser nulo.

`app.env` no está versionado (D-8), así que ningún `diff` detecta que la API quedó encendida. Se comprueba con ese `GET`.

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

   ```
   # 1. Fallar el ingreso una vez desde el navegador. Después, la clave que quedó.
   #    Se consulta como `postgres` y no con DATABASE_URL: esa variable no existe en una
   #    sesión ssh —vive en /etc/crm-staging/app.env, 0600 de root (D-8)— y `psql ""` se
   #    conectaría a la base por defecto sin avisar. Es la forma que se usó al medir el AC-5.
   ssh crm-staging "sudo -u postgres psql -d crm_staging -tAc \
     \"select key_hash from login_attempts where scope='ip' order by attempted_at desc limit 1;\""

   # 2. El hash de tu IP pública, que es contra lo que se compara.
   curl -s https://api.ipify.org | tr -d '\n' | sha256sum | cut -d' ' -f1
   ```

   Los dos hashes tienen que ser **iguales** (el `cut` está para quitarle a `sha256sum` el ` -` del final, que si no impide compararlos de un vistazo). Si no lo son, la aplicación no está viendo la IP del cliente: hay un salto de proxy de más, todas las peticiones comparten una clave interna y eso **es** H-3 reproducido. El control que le da valor a la comparación es repetirla desde otra IP —un túnel SOCKS alcanza, `ssh -f -N -D 1080`— y comprobar que el hash cambia.

   Lo que este paso **no** cubre: que un cliente pueda falsificar la cabecera. Eso depende de que nginx reemplace en vez de agregar, y de eso se ocupa la guarda sobre el archivo versionado más el paso 1 de esta lista, que comprueba que el servidor tenga ese archivo. Ninguno de los dos sustituye al otro.
3. **HSTS presente sobre HTTPS y ausente sobre HTTP**: `curl -I https://staging.vixoraai.app/login` y `curl -I http://staging.vixoraai.app/login`. El segundo es el que da valor al primero.
4. **La aplicación solo en loopback**: `sudo ss -tlnp | grep 3000` tiene que decir `127.0.0.1:3000`. `next start` **ignora la variable `HOSTNAME`**; el enlace depende del flag `-H` de la unidad.
5. **El rol de la aplicación no es el dueño**: `DELETE FROM audit_logs` con la conexión de `app.env` tiene que responder `permission denied`.
