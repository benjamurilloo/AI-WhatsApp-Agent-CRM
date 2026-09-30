# Despliegue de producción

Configuración versionada del entorno `crm.vixoraai.app` ([brief-13.1](../../docs/decisions/brief-13.1-entorno-productivo.md)).

Es el mecanismo de staging ([deploy/staging/README.md](../staging/README.md)), que se verificó en la 9.1 y la 9.2, con las diferencias de la tabla de abajo. **Todo lo que este README no dice se hace como en staging.** Las tres guardas de `tests/guards/staging-*.test.ts` fijan los dos directorios desde la 13.1 (D-12), y fallan si aparece un directorio nuevo bajo `deploy/` sin cubrir.

**Estado al 2026-09-30**: **desplegado**. El entorno existe desde el 2026-09-29 y corre la configuración de este directorio. La etapa 13.1.1 escribió estos archivos, y la 13.1.2 los desplegó y los verificó contra el entorno ([evidencia-13.1](../../docs/decisions/evidencia-13.1-produccion.md)).

## Diferencias con staging

Cada una es una decisión del brief, o su consecuencia directa.

| # | Diferencia | Por qué |
| --- | --- | --- |
| 1 | Un droplet propio, de 2 GB como mínimo, separado del de staging | D-1. Credenciales, bases y secretos distintos por entorno (SecurityModel). Con 2 GB, `next build` no depende del swap |
| 2 | La aplicación corre como un usuario de sistema propio, `crm`, sin shell ni `sudo`. En staging corre como `benja` | Consecuencia de tener datos reales: en staging, un proceso comprometido corre como un usuario con `sudo`. En producción no hereda ese camino a `root`. **No estaba en el brief**, y se registra acá |
| 3 | Base `crm_production`, creada con collation ICU `es` y **propiedad de `crm_owner` desde el primer día** | D-7, medida en AC-6. Que sea del dueño desde el principio cierra O-3: una restauración con `-O crm_owner` deja el mismo dueño que el original |
| 4 | El backup se cifra con `age` y la copia cifrada sube a object storage en una unidad aparte, con red | D-8. `crm-backup.sh` y los dos archivos nuevos: `crm-backup-offsite.sh` y `crm-backup-offsite.service` |
| 5 | `postgresql-crm-production.conf` con los valores de costo para la RAM medida del droplet (1967 MB) | El método de la 9.3: `free -m` en el droplet aprovisionado, el 2026-09-29, y se reconfirma con la aplicación corriendo |
| 6 | Antes de cada despliegue, la CI del SHA exacto tiene que estar en `success` | D-4 (R-2), opción (a) |
| 7 | Cada despliegue registra el SHA anterior, y hay un procedimiento de vuelta atrás | H-3 del brief: staging no lo tiene |
| 8 | Sin backups ni snapshots de droplet del proveedor | D-5: el disco tiene el dump en claro y los secretos |
| 9 | Cada trabajo programado manda un aviso de vida a un servicio externo, que alerta si no llega; la disponibilidad se mide desde afuera, con alerta | brief-13.3, D-2 a D-5. Staging no lo tiene: su caída no tiene impacto de negocio. Ver [Monitoreo y alertas](#monitoreo-y-alertas) |

## Archivos

| Archivo | Destino en el servidor |
| --- | --- |
| `nginx-crm-production.conf` | `/etc/nginx/sites-available/crm-production`, enlazado en `sites-enabled/` |
| `crm-production.service` | `/etc/systemd/system/crm-production.service` |
| `crm-backup.sh` | `/usr/local/bin/crm-backup.sh`, `0755` |
| `crm-backup-offsite.sh` | `/usr/local/bin/crm-backup-offsite.sh`, `0755` |
| `crm-restore-check.sh` | `/usr/local/bin/crm-restore-check.sh`, `0755` |
| `crm-backup.service` | `/etc/systemd/system/crm-backup.service` |
| `crm-backup-offsite.service` | `/etc/systemd/system/crm-backup-offsite.service` |
| `crm-backup.timer` | `/etc/systemd/system/crm-backup.timer` |
| `crm-restore-check.service` | `/etc/systemd/system/crm-restore-check.service` |
| `crm-restore-check.timer` | `/etc/systemd/system/crm-restore-check.timer` |
| `postgresql-crm-production.conf` | `/etc/postgresql/18/main/conf.d/crm-production.conf` |
| `crm-heartbeat.sh` | `/usr/local/bin/crm-heartbeat.sh`, `0755` |
| `crm-heartbeat@.service` | `/etc/systemd/system/crm-heartbeat@.service` |

El número de archivos se cuenta, no se hereda: `ls deploy/production/ | grep -v README | wc -l` tiene que dar lo mismo que las filas de esta tabla (**13**, desde la 13.3; eran 11).

## Lo que NO está acá, a propósito

Los secretos. Viven en `/etc/crm-production/`, con permisos `0600` de `root`, y **ninguno se reutiliza de staging** (D-5):

| Archivo | Para qué |
| --- | --- |
| `app.env` | `DATABASE_URL` con el rol de aplicación, `TRUSTED_PROXY=true`, `NODE_ENV=production`. **Sin** `INGESTION_ENABLED` ni `READ_API_ENABLED`: en la 13.1 las dos quedan apagadas |
| `migrate.env` | `DATABASE_URL` con el rol dueño. Solo para migraciones |
| `backup.env` | `PG*`, `BACKUP_DIR=/var/backups/crm-production`, `BACKUP_KEEP`, `BACKUP_GROUP=postgres`, `BACKUP_AGE_RECIPIENTS=/etc/crm-production/backup.age.pub`, `OFFSITE_REMOTE`, `OFFSITE_KEEP_DAYS` y `RCLONE_CONFIG=/etc/crm-production/rclone.conf`. **No trae la contraseña** |
| `backup.pgpass` | La contraseña del rol dueño, para el backup |
| `backup.age.pub` | La clave **pública** de `age`. La privada **nunca** entra al droplet: la guarda el operador fuera de él |
| `rclone.conf` | La clave de acceso al bucket, con permiso **solo** sobre ese bucket. Un remoto `[spaces]` con `type = s3`, `provider = DigitalOcean`, `endpoint = nyc3.digitaloceanspaces.com`, `acl = private` y las dos claves. Lo escribe el operador en el servidor, con `nano`, y nunca pasa por una conversación con un asistente |
| `heartbeat.env` | Desde la 13.3: `HEARTBEAT_URL_BACKUP`, `HEARTBEAT_URL_OFFSITE` y `HEARTBEAT_URL_RESTORE_CHECK`, las URLs de aviso de vida. **Son credenciales**: quien tenga una puede marcar un trabajo como vivo y apagar su alerta. Lo escribe el operador en el servidor, con `nano`, y nunca pasa por una conversación con un asistente. Una guarda (`tests/guards/heartbeat-urls.test.ts`) falla si una aparece en un archivo del repositorio |

No hay `seed.env`: en producción no corre ningún seed, y los seeds rechazan la base `crm_production` (AC-5).

**Rotación de un secreto**: se genera el valor nuevo, se escribe en su archivo, se reinicia la unidad que lo lee y, si es una contraseña de base, se hace `ALTER ROLE ... PASSWORD` **antes** de reiniciar. El valor nuevo nunca pasa por una conversación con un asistente ni por un archivo del repositorio.

**Límite declarado**: un `EnvironmentFile` `0600` no protege contra quien tenga `root`. Por eso D-5 pide no copiar el disco fuera del droplet.

## Aprovisionamiento

Es el orden de staging, con los cambios marcados. **Cada paso que crea algo afuera** (el droplet, el DNS, el bucket o el certificado) **lo autoriza el usuario en el turno**, y las cuentas y los pagos los hace él (brief-13.1, D-10).

1. **El droplet**: Ubuntu 24.04, 2 GB o más, en la misma región que staging. **Sin** backups ni snapshots del proveedor. El acceso es por clave, con `root` rechazado, igual que staging. La clave de host se verifica contra la consola del proveedor, no con `accept-new`: en staging quedó como confianza en el primer uso (brief-9.1).
2. **El DNS**: registro `A` de `crm.vixoraai.app` en *DNS only*, apuntando al droplet. Se verifica desde dos resolvers independientes, como en la 9.1.
3. **Node y PostgreSQL, con versión exacta** (D-6). Las instaladas el 2026-09-29 son:
   - **`nodejs=24.21.0-1nodesource1`**, de NodeSource, que es Node `v24.21.0`;
   - **`postgresql-18=18.6-1.pgdg24.04+2`**, del repositorio `pgdg`.

   Se instalan también `age` y `rclone`. **No hace falta `postgresql-contrib`**: el paquete del servidor ya trae `unaccent`, la única extensión que usa el proyecto. **El swap solo si `next build` lo necesita**: si hace falta en régimen normal, es un hallazgo.

   Después de instalarlos, se retienen, para que un `apt upgrade` a mano no los actualice. `unattended-upgrades` tampoco los toca, porque solo toma los orígenes de Ubuntu. En producción quedaron retenidos el 2026-09-30:

   ```
   sudo apt-mark hold nodejs postgresql-18
   apt-mark showhold   # -> nodejs, postgresql-18
   ```

   Una versión nueva de cualquiera de los dos se sube a propósito, con su propio brief: `apt-mark unhold`, la instalación con la versión exacta y otra vez `apt-mark hold`.
4. **El usuario de sistema, con su home fuera del código** (I-6 del brief):

   ```
   sudo useradd --system --home /var/lib/crm-production/home --shell /usr/sbin/nologin crm
   sudo install -d -m 0750 -o root -g crm /var/lib/crm-production
   sudo install -d -m 0700 -o crm -g crm /var/lib/crm-production/home /var/lib/crm-production/ssh
   sudo install -d -m 0755 -o crm -g crm /srv/crm-production
   ```

   El código vive en `/srv/crm-production`, que es de `crm`. **El home no puede ser esa carpeta**: la caché de `npm` (`~/.npm`) y cualquier `~/.ssh` quedarían dentro del repositorio clonado. Pasó en la 13.1.2, con `.npm/` como archivo sin seguimiento. El registro de despliegues vive en `/var/lib/crm-production/despliegues`. La carpeta es del grupo `crm` para que `crm` llegue a `ssh/`, pero no puede escribir en ella.

   **La deploy key de producción**, propia y de solo lectura (no se comparte con staging):

   ```
   sudo -u crm ssh-keygen -q -t ed25519 -N "" -C "crm-production-deploy" -f /var/lib/crm-production/ssh/id_ed25519_deploy
   ```

   La pública se agrega en GitHub desde la máquina del operador, de solo lectura, que es el valor por defecto. El `known_hosts` de GitHub se arma desde su API, no con confianza en el primer uso:

   ```
   ssh crm-production 'sudo cat /var/lib/crm-production/ssh/id_ed25519_deploy.pub' > deploy-production.pub
   gh repo deploy-key add deploy-production.pub --title "crm-production (solo lectura)" && rm deploy-production.pub
   gh api meta --jq '.ssh_keys[] | "github.com " + .' | ssh crm-production 'sudo -u crm tee /var/lib/crm-production/ssh/known_hosts > /dev/null'
   ```

   **El clonado**, en el servidor (`ssh crm-production`). `core.sshCommand` queda fijado en el repositorio, así que `git fetch` usa esa clave y ese `known_hosts` sin depender del home:

   ```
   SSHCMD="ssh -i /var/lib/crm-production/ssh/id_ed25519_deploy -o IdentitiesOnly=yes -o UserKnownHostsFile=/var/lib/crm-production/ssh/known_hosts -o StrictHostKeyChecking=yes"
   sudo -u crm env GIT_SSH_COMMAND="$SSHCMD" git clone git@github.com:benjamurilloo/AI-WhatsApp-Agent-CRM.git /srv/crm-production
   sudo -u crm git -C /srv/crm-production config core.sshCommand "$SSHCMD"
   ```

   Después, **desde la máquina del operador**, se hace el checkout del SHA y `npm ci`. Primero se corre el paso 1 de «Desplegar un cambio», que fija `$SHA` y comprueba su CI. En esa misma terminal:

   ```
   ssh crm-production "set -euo pipefail
   test -n '$SHA'
   sudo -u crm bash -c 'cd /srv/crm-production && git checkout --detach $SHA && npm ci --no-audit --no-fund'
   test \"\$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)\" = '$SHA' && echo 'código en: $SHA'"
   ```

   Es la primera mitad del paso 3 de «Desplegar un cambio», sin la migración, el build ni el reinicio, que en este punto todavía no pueden correr: no hay base, `app.env` ni unidad.
5. **La base, con la collation decidida** (AC-6, ensayada el 2026-09-29 en `postgres:18.6-trixie`):

   Como `root` (`sudo -i`), para que la contraseña no pase por los argumentos de ningún proceso:
   - la genera `openssl`;
   - la escribe `printf`, que es un comando interno de `bash` y no aparece en `ps`;
   - llega a `psql` por la entrada estándar.

   ```
   umask 077
   install -d -m 0700 -o root -g root /etc/crm-production &&
     PW=$(openssl rand -hex 32) &&
     printf 'DATABASE_URL=postgresql://crm_owner:%s@localhost:5432/crm_production\n' "$PW" > /etc/crm-production/migrate.env &&
     printf "CREATE ROLE crm_owner LOGIN PASSWORD '%s' NOCREATEROLE NOCREATEDB;\n" "$PW" | sudo -u postgres psql -v ON_ERROR_STOP=1 -q
   unset PW
   sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
   CREATE DATABASE crm_production OWNER crm_owner TEMPLATE template0 ENCODING 'UTF8'
     LOCALE_PROVIDER icu ICU_LOCALE 'es' LOCALE 'C.UTF-8';
   CREATE ROLE crm_app NOLOGIN;
   SQL
   ```

   La contraseña nunca se escribe a mano en un comando: quedaría en el historial de la shell y, como argumento de `psql -c`, visible en `ps` y en el registro de `sudo`.

   Los pasos van encadenados con `&&`. Si falla la escritura del archivo, por ejemplo porque falta el directorio, el rol no se crea. Sin eso quedaría un rol con una contraseña que ningún archivo tiene (N1 de la verificación independiente de la 13.1).

   `crm_app` se crea **acá, con el superusuario, antes de migrar**. La `0003` lo crea solo si no existe, y crear un rol exige `CREATEROLE`, que el dueño no tiene a propósito (O-7). Sin este paso, `npm run db:migrate` sale con `permission denied to create role` (`42501`) y cero tablas, medido en el ensayo. **No se crea `unaccent` a mano**: la crea la migración `0015` con el dueño, y así quedó en el ensayo.
6. **Migrar** con `migrate.env`, como en staging. Después se crea el rol con login miembro de `crm_app` y se escribe `app.env`, con el mismo cuidado con la contraseña. Como `root`:

   ```
   umask 077
   PW=$(openssl rand -hex 32) &&
     printf 'DATABASE_URL=postgresql://crm_app_login:%s@localhost:5432/crm_production\nTRUSTED_PROXY=true\nNODE_ENV=production\n' "$PW" > /etc/crm-production/app.env &&
     printf "CREATE ROLE crm_app_login LOGIN PASSWORD '%s' IN ROLE crm_app;\n" "$PW" | sudo -u postgres psql -v ON_ERROR_STOP=1 -q
   unset PW
   ```

7. **nginx y certbot**, con TLS antes del primer ingreso (motivo en el README de staging, paso 6). Después: `sudo certbot renew --dry-run` y `systemctl list-timers` para la renovación, **con la salida capturada** (O-4).
8. **UFW**: solo `OpenSSH` y `Nginx Full`.
9. **El backup**: los scripts, las unidades y los timers de la tabla de archivos. Los dos timers se habilitan; `crm-backup-offsite.service` no lleva timer, porque lo dispara el backup.
10. **La primera organización**: la del operador, con el script de D-9. Corre con la conexión de `app.env`:

    En el servidor (`ssh crm-production`):

    ```
    read -r -p "Organización: " ORG; read -r -p "Tu nombre: " NOMBRE; read -r -p "Tu correo: " CORREO
    sudo ORG="$ORG" NOMBRE="$NOMBRE" CORREO="$CORREO" bash -c 'set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run --silent org:create -- --name "$ORG" --admin-name "$NOMBRE" --admin-email "$CORREO"'
    ```

    **El comando no lleva marcadores a propósito.** La versión anterior tenía `'<organización>'`, `'<nombre>'` y `<correo>`, con dos problemas:
    - `<correo>` no lo rechazaba el script sino la shell, porque lo leía como una redirección;
    - `'<organización>'` el script lo aceptaba, así que reemplazar solo el correo creaba una organización con ese nombre.

    Es la clase de defecto que dejó una organización de ejemplo en producción el 2026-09-29 ([evidencia-13.1](../../docs/decisions/evidencia-13.1-produccion.md)). Con `read`, no hay nada que olvidarse de reemplazar.

    Imprime la contraseña inicial **una sola vez**. La ejecuta el operador en su propia terminal, para que no pase por una conversación con un asistente, y la cambia en el primer ingreso.

## Desplegar un cambio

Como en staging, pero con `crm` en lugar de `benja` y con dos pasos nuevos al principio.

**1. La CI del SHA exacto (D-4, R-2).** Se corre en la máquina del operador, antes de tocar el servidor:

```
unset SHA; read -r -p "Ref a desplegar (SHA, rama o tag): " REF
SHA=$(git rev-parse --verify "$REF^{commit}") && echo "SHA: $SHA"
gh run list --commit "$SHA" --json headSha,conclusion,status
```

El `unset` va primero: en una terminal reutilizada, un `SHA` viejo no puede sobrevivir a un `rev-parse` que falla. Hasta la verificación independiente de la 13.1, este paso traía un marcador (`<ref a desplegar>`) que la shell lee como una redirección (N4).

Solo se despliega con `"conclusion":"success"` de **ese** `headSha`. `cancelled` no es `success`: `ci.yml` cancela la corrida de un commit cuando llega el siguiente (H-5), y ese commit queda sin resultado. Sin una corrida en `success`, **no se despliega**, y se vuelve a lanzar la CI de ese commit.

**2. Anotar lo que está desplegado**, para poder volver atrás:

```
ssh crm-production 'sudo -u crm git -C /srv/crm-production rev-parse HEAD | sudo tee -a /var/lib/crm-production/despliegues'
```

Git corre como `crm`, que es el dueño del repositorio. Como el usuario del `ssh`, Git se niega a leerlo (`fatal: detected dubious ownership`). Lo midió la 13.1.2 con la primera versión de este comando, que no tenía `sudo -u crm`.

**3. Código, dependencias, migraciones, build y reinicio.** Desde la máquina del operador, en la **misma terminal** del paso 1, porque usa su `$SHA`:

```
ssh crm-production "set -euo pipefail
test -n '$SHA'
sudo -u crm bash -c 'cd /srv/crm-production && git fetch && git checkout --detach $SHA && npm ci --no-audit --no-fund'
sudo bash -c 'set -a && . /etc/crm-production/migrate.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run db:migrate'
sudo bash -c 'set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=NODE_ENV,PORT,HOSTNAME,DATABASE_URL,TRUSTED_PROXY npm run build'
sudo systemctl restart crm-production
test \"\$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)\" = '$SHA' && echo 'desplegado: $SHA'"
```

`$SHA` lo expande la shell del operador, **antes** de que el comando salga por `ssh`. Así llega al servidor como texto fijo. La primera versión de este paso se corría ya dentro del servidor, donde `$SHA` no existe. `git checkout --detach` sin argumento no falla: deja HEAD donde estaba. Así, el despliegue «salía bien» sin cambiar de versión. Lo encontró la revisión independiente de la 13.1. Por eso:
- `test -n` corta si `SHA` llegó vacío;
- la última línea compara HEAD con el SHA pedido;
- `set -e` detiene todo en el primer paso que falle.

Se despliega un **SHA**, no `origin/main`: lo que se comprobó en el paso 1 es un SHA, y `main` puede haber avanzado entre la comprobación y el despliegue.

## Volver atrás

Es el mismo procedimiento de «Desplegar un cambio» con el SHA anterior. **Incluye el paso 1**: ese SHA ya pasó la CI cuando se desplegó, y se vuelve a comprobar igual, porque la comprobación es barata.

**Cuál es el SHA anterior.** `/var/lib/crm-production/despliegues` anota, en cada despliegue, el SHA que **estaba** corriendo:
- **Justo después de un despliegue**, el anterior es la última línea.
- **Después de una vuelta atrás, no.** La vuelta atrás también es un despliegue, y anota la versión de la que se volvió. Seguir la regla una segunda vez desplegaría esa misma versión.

Se mira el registro entero, se elige el SHA a propósito y se lo compara con el que corre:

```
ssh crm-production 'sudo tail -n 5 /var/lib/crm-production/despliegues; sudo -u crm git -C /srv/crm-production rev-parse HEAD'
```

Lo midió la 13.1.2 al ejecutar la vuelta atrás (AC-21). Ese ensayo, un despliegue y su vuelta atrás, tardó 90 s de ida y 62 s de vuelta.

**Lo que la vuelta atrás no deshace: las migraciones.** Volver el código no vuelve el esquema. Las migraciones del proyecto son aditivas, así que el código anterior sigue funcionando sobre el esquema nuevo **mientras la migración no borre ni renombre nada que ese código use**. Una migración que sí lo haga necesita su propio plan de vuelta atrás, escrito en su brief **antes** de desplegarla. Si la base misma quedó mal, la vuelta atrás es la restauración ([runbook](../../docs/runbooks/restaurar-la-base.md)), no esto.

La 13.1.2 ejecutó una vuelta atrás completa el 2026-09-29 (AC-21): de `938423d` a `c8fde19` y de vuelta a `938423d`, con la aplicación sana al final ([evidencia-13.1](../../docs/decisions/evidencia-13.1-produccion.md)).

## Verificar después de desplegar

Los mismos cinco pasos de staging, con `crm-production` en lugar de `crm-staging` y `crm.vixoraai.app` en lugar de `staging.vixoraai.app`, más dos pasos propios de producción:

1. **La configuración desplegada es la versionada** (O-9). Se hace el `diff` de los **trece** archivos de la tabla, como en staging. Eran once hasta la 13.3.
2. **Un solo salto de proxy**, medido por consecuencia (AC-14). Se comparan hashes y **nunca se versiona ni la IP ni su hash**.
3. **HSTS** presente sobre HTTPS y ausente sobre HTTP.
4. **La aplicación escucha solo en loopback.**
5. **El rol de la aplicación no es el dueño.**
6. **La ingestión y la API de lectura, apagadas**: `POST /api/ingestion/v1/events`, `POST /api/ingestion/v2/events` y `GET /api/read/v1/products` responden `404` desde afuera.
7. **Ningún dato real de un cliente**: `select count(*)` de `clients`, `conversations`, `messages` y `products` da 0 en las cuatro, y `organizations` da 1.

## Monitoreo y alertas

Desde la 13.3 ([brief-13.3](../../docs/decisions/brief-13.3-disponibilidad-y-observabilidad.md)). Antes, una falla de un trabajo programado quedaba en el journal y nadie la leía (H-1), y nadie consultaba `/api/health` desde afuera (H-2). Qué hacer cuando llega cada alerta está en el [runbook de alertas](../../docs/runbooks/responder-a-una-alerta.md).

| Qué se vigila | Cómo | Decisión |
| --- | --- | --- |
| La aplicación y la base, desde afuera | Un chequeo de Uptime de DigitalOcean consulta `https://crm.vixoraai.app/api/health` desde cuatro regiones. `/api/health` consulta la base y responde `503` si no llega. Alertas: caída (2 min de espera), latencia de más de 2000 ms durante 5 min, y certificado a 14 días de vencer. Llegan por email | D-1 y D-2 |
| El backup diario, la copia externa y el ejercicio mensual de restauración | Cada uno, al terminar bien, dispara `crm-heartbeat@<trabajo>.service`, que manda un aviso de vida a Healthchecks.io. Si el aviso no llega a tiempo, alerta por email y Telegram. Backup y copia: `15 3 * * *` UTC con 1 h de gracia; ejercicio: `30 4 1 * *` UTC con 2 h | D-3 |
| El disco y la memoria del droplet | Alertas de recursos de DigitalOcean sobre las métricas de `do-agent`: disco por encima del 80 % durante 5 min y memoria por encima del 90 % durante 10 min. Llegan por email | D-4 |

**Cuánto tarda cada alerta**, medido el 2026-09-30 con fallas provocadas ([evidencia de la 13.3](../../docs/decisions/evidencia-13.3-disponibilidad.md)). Cada número salió de una o dos mediciones: es un orden de magnitud, no una garantía.

- **Uptime no consulta cada minuto.** En los logs de nginx, cada región consultó cada 3 a 9 minutos. El aviso de caída llegó entre 4,5 y 9,5 minutos después de la falla, y el de recuperación, entre 11 y 16 minutos después de que el sitio volvió. Dos veces llegó un aviso de caída con el sitio ya arriba.
- **Healthchecks.io avisa al segundo** en que vencen el período y la gracia.
- **La alerta de disco** llegó al minuto de bajar el umbral, porque evalúa los 5 minutos ya transcurridos.

La herramienta de cada fila y su precio están en la evidencia. **Las URLs de aviso no**: viven solo en `/etc/crm-production/heartbeat.env`.

**Por qué el aviso sale de una unidad aparte.** `crm-backup.service` no tiene red (`IPAddressDeny=any`), y dársela para esto le abriría la red a un proceso que lee el `.pgpass` del dueño. `crm-heartbeat@.service` corre con un usuario efímero (`DynamicUser=true`), sin escribir en disco. systemd lee `heartbeat.env` como `root` antes de soltar privilegios, así que el archivo sigue siendo `0600` de `root` y el proceso no puede leer ningún otro secreto. **Límites**: el proceso recibe las tres URLs, no solo la de su trabajo. Y la URL no va en los argumentos de `curl` sino en su configuración por la entrada estándar, porque el droplet no monta `/proc` con `hidepid` y cualquier usuario local leería los argumentos (revisión independiente de la 13.3, hallazgo 6).

**Lo que el aviso no dice.** Que el trabajo terminó con código 0, no que su resultado sirva. Que el backup se pueda restaurar lo dice el ejercicio de restauración, que tiene su propio aviso.

### Instalar el aviso de vida

Con el código de la 13.3.1 ya desplegado en `/srv/crm-production` (el procedimiento de [Desplegar un cambio](#desplegar-un-cambio)). Primero, **el operador** escribe el archivo de URLs, en su terminal:

```
ssh -t crm-production 'sudo test -e /etc/crm-production/heartbeat.env || sudo install -m 0600 -o root -g root /dev/null /etc/crm-production/heartbeat.env; sudo nano /etc/crm-production/heartbeat.env'
```

Con las tres líneas, sin comillas:

```
HEARTBEAT_URL_BACKUP=<la URL del aviso del backup>
HEARTBEAT_URL_OFFSITE=<la URL del aviso de la copia externa>
HEARTBEAT_URL_RESTORE_CHECK=<la URL del aviso del ejercicio>
```

El `test -e` va primero porque `install` sobre un archivo que ya existe lo vacía. Después, las unidades:

```
ssh crm-production 'set -euo pipefail
cd /srv/crm-production/deploy/production
sudo install -m 0755 -o root -g root crm-heartbeat.sh /usr/local/bin/crm-heartbeat.sh
for f in crm-heartbeat@.service crm-backup.service crm-backup-offsite.service crm-restore-check.service; do
  sudo install -m 0644 -o root -g root "$f" "/etc/systemd/system/$f"
done
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/crm-heartbeat@.service /etc/systemd/system/crm-backup.service /etc/systemd/system/crm-backup-offsite.service /etc/systemd/system/crm-restore-check.service
sudo stat -c "%a %U %n" /etc/crm-production/heartbeat.env'
```

La última línea tiene que decir `600 root`. **Probar cada aviso sin correr su trabajo**:

```
ssh crm-production 'for t in backup offsite restore-check; do sudo systemctl start "crm-heartbeat@$t.service"; systemctl show -p Result --value "crm-heartbeat@$t.service"; sudo journalctl -u "crm-heartbeat@$t.service" -n 3 -o cat; done'
```

Cada uno tiene que decir `success` y, entre sus tres últimas líneas, `Aviso de '<trabajo>' enviado.` Las otras dos son de systemd («Deactivated successfully» y «Finished»). Además, el servicio externo tiene que mostrar el aviso recibido. Un error dice el código de salida de `curl`, nunca la URL.
