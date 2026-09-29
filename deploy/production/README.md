# Despliegue de producción

Configuración versionada del entorno `crm.vixoraai.app` ([brief-13.1](../../docs/decisions/brief-13.1-entorno-productivo.md)).

Es el mecanismo de staging ([deploy/staging/README.md](../staging/README.md)), que se verificó en la 9.1 y la 9.2, con las diferencias de la tabla de abajo. **Todo lo que este README no dice se hace como en staging.** Las tres guardas de `tests/guards/staging-*.test.ts` fijan los dos directorios desde la 13.1 (D-12), y fallan si aparece un directorio nuevo bajo `deploy/` sin cubrir.

**Estado al 2026-09-29**: el entorno **no existe todavía**. Estos archivos son la etapa 13.1.1: están validados en local y en CI, y todavía no se desplegaron en ninguna máquina. Lo que los ejercita de verdad es la 13.1.2.

## Diferencias con staging

Cada una es una decisión del brief, o su consecuencia directa.

| # | Diferencia | Por qué |
| --- | --- | --- |
| 1 | Un droplet propio, de 2 GB como mínimo, separado del de staging | D-1. Credenciales, bases y secretos distintos por entorno (SecurityModel). Con 2 GB, `next build` no depende del swap |
| 2 | La aplicación corre como un usuario de sistema propio, `crm`, sin shell ni `sudo`. En staging corre como `benja` | Consecuencia de tener datos reales: en staging, un proceso comprometido corre como un usuario con `sudo`. En producción no hereda ese camino a `root`. **No estaba en el brief**, y se registra acá |
| 3 | Base `crm_production`, creada con collation ICU `es` y **propiedad de `crm_owner` desde el primer día** | D-7, medida en AC-6. Que sea del dueño desde el principio cierra O-3: una restauración con `-O crm_owner` deja el mismo dueño que el original |
| 4 | El backup se cifra con `age` y la copia cifrada sube a object storage en una unidad aparte, con red | D-8. `crm-backup.sh` y los dos archivos nuevos: `crm-backup-offsite.sh` y `crm-backup-offsite.service` |
| 5 | `postgresql-crm-production.conf` con los valores de costo **provisionales** para 2 GB | El método de la 9.3. Se recalcula con `free -m` en el droplet ya aprovisionado |
| 6 | Antes de cada despliegue, la CI del SHA exacto tiene que estar en `success` | D-4 (R-2), opción (a) |
| 7 | Cada despliegue registra el SHA anterior, y hay un procedimiento de vuelta atrás | H-3 del brief: staging no lo tiene |
| 8 | Sin backups ni snapshots de droplet del proveedor | D-5: el disco tiene el dump en claro y los secretos |

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

El número de archivos se cuenta, no se hereda: `ls deploy/production/ | grep -v README | wc -l` tiene que dar lo mismo que las filas de esta tabla (**11**).

## Lo que NO está acá, a propósito

Los secretos. Viven en `/etc/crm-production/`, con permisos `0600` de `root`, y **ninguno se reutiliza de staging** (D-5):

| Archivo | Para qué |
| --- | --- |
| `app.env` | `DATABASE_URL` con el rol de aplicación, `TRUSTED_PROXY=true`, `NODE_ENV=production`. **Sin** `INGESTION_ENABLED` ni `READ_API_ENABLED`: en la 13.1 las dos quedan apagadas |
| `migrate.env` | `DATABASE_URL` con el rol dueño. Solo para migraciones |
| `backup.env` | `PG*`, `BACKUP_DIR=/var/backups/crm-production`, `BACKUP_KEEP`, `BACKUP_GROUP=postgres`, `BACKUP_AGE_RECIPIENTS=/etc/crm-production/backup.age.pub`, `OFFSITE_REMOTE`, `OFFSITE_KEEP_DAYS` y `RCLONE_CONFIG=/etc/crm-production/rclone.conf`. **No trae la contraseña** |
| `backup.pgpass` | La contraseña del rol dueño, para el backup |
| `backup.age.pub` | La clave **pública** de `age`. La privada **nunca** entra al droplet: la guarda el operador fuera de él |
| `rclone.conf` | La clave de acceso al bucket, con permiso **solo** sobre ese bucket |

No hay `seed.env`: en producción no corre ningún seed, y los seeds rechazan la base `crm_production` (AC-5).

**Rotación de un secreto**: se genera el valor nuevo, se escribe en su archivo, se reinicia la unidad que lo lee y, si es una contraseña de base, se hace `ALTER ROLE ... PASSWORD` **antes** de reiniciar. El valor nuevo nunca pasa por una conversación con un asistente ni por un archivo del repositorio.

**Límite declarado**: un `EnvironmentFile` `0600` no protege contra quien tenga `root`. Por eso D-5 pide no copiar el disco fuera del droplet.

## Aprovisionamiento

Es el orden de staging, con los cambios marcados. **Cada paso que crea algo afuera** (el droplet, el DNS, el bucket o el certificado) **lo autoriza el usuario en el turno**, y las cuentas y los pagos los hace él (brief-13.1, D-10).

1. **El droplet**: Ubuntu 24.04, 2 GB o más, en la misma región que staging. **Sin** backups ni snapshots del proveedor. El acceso es por clave, con `root` rechazado, igual que staging. La clave de host se verifica contra la consola del proveedor, no con `accept-new`: en staging quedó como confianza en el primer uso (brief-9.1).
2. **El DNS**: registro `A` de `crm.vixoraai.app` en *DNS only*, apuntando al droplet. Se verifica desde dos resolvers independientes, como en la 9.1.
3. **Node 24 LTS** (NodeSource), con la versión exacta anotada en la evidencia (D-6), y **PostgreSQL 18.6** del repositorio `pgdg`, con `postgresql-contrib`. Se instalan también `age` y `rclone`. **El swap solo si `next build` lo necesita**: si hace falta en régimen normal, es un hallazgo.
4. **El usuario de sistema**: `sudo useradd --system --home /srv/crm-production --shell /usr/sbin/nologin crm`. El código vive en `/srv/crm-production`, que es de `crm`. El registro de despliegues vive en `/var/lib/crm-production/despliegues` (`sudo install -d -m 0750 /var/lib/crm-production`).
5. **La base, con la collation decidida** (AC-6, ensayada el 2026-09-29 en `postgres:18.6-trixie`):

   ```
   sudo -u postgres psql <<'SQL'
   CREATE ROLE crm_owner LOGIN PASSWORD '<desde migrate.env>' NOCREATEROLE NOCREATEDB;
   CREATE DATABASE crm_production OWNER crm_owner TEMPLATE template0 ENCODING 'UTF8'
     LOCALE_PROVIDER icu ICU_LOCALE 'es' LOCALE 'C.UTF-8';
   CREATE ROLE crm_app NOLOGIN;
   SQL
   ```

   `crm_app` se crea **acá, con el superusuario, antes de migrar**. La `0003` lo crea solo si no existe, y crear un rol exige `CREATEROLE`, que el dueño no tiene a propósito (O-7). Sin este paso, `npm run db:migrate` sale con `permission denied to create role` (`42501`) y cero tablas, medido en el ensayo. **No se crea `unaccent` a mano**: la crea la migración `0015` con el dueño, y así quedó en el ensayo.
6. **Migrar** con `migrate.env`, como en staging. Después se crea el rol con login miembro de `crm_app`, y recién entonces se escribe `app.env`:

   ```
   sudo -u postgres psql -c "CREATE ROLE crm_app_login LOGIN PASSWORD '<desde app.env>' IN ROLE crm_app"
   ```

7. **nginx y certbot**, con TLS antes del primer ingreso (motivo en el README de staging, paso 6). Después: `sudo certbot renew --dry-run` y `systemctl list-timers` para la renovación, **con la salida capturada** (O-4).
8. **UFW**: solo `OpenSSH` y `Nginx Full`.
9. **El backup**: los scripts, las unidades y los timers de la tabla de archivos. Los dos timers se habilitan; `crm-backup-offsite.service` no lleva timer, porque lo dispara el backup.
10. **La primera organización**: la del operador, con el script de D-9. Corre con la conexión de `app.env`:

    ```
    sudo bash -c "set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run --silent org:create -- --name '<organización>' --admin-name '<nombre>' --admin-email <correo>"
    ```

    Imprime la contraseña inicial **una sola vez**. La ejecuta el operador en su propia terminal, para que no pase por una conversación con un asistente, y la cambia en el primer ingreso.

## Desplegar un cambio

Como en staging, pero con `crm` en lugar de `benja` y con dos pasos nuevos al principio.

**1. La CI del SHA exacto (D-4, R-2).** Se corre en la máquina del operador, antes de tocar el servidor:

```
SHA=$(git rev-parse <ref a desplegar>)
gh run list --commit "$SHA" --json headSha,conclusion,status
```

Solo se despliega con `"conclusion":"success"` de **ese** `headSha`. `cancelled` no es `success`: `ci.yml` cancela la corrida de un commit cuando llega el siguiente (H-5), y ese commit queda sin resultado. Sin una corrida en `success`, **no se despliega**, y se vuelve a lanzar la CI de ese commit.

**2. Anotar lo que está desplegado**, para poder volver atrás:

```
ssh crm-production 'cd /srv/crm-production && git rev-parse HEAD | sudo tee -a /var/lib/crm-production/despliegues'
```

**3. Código, dependencias, migraciones, build y reinicio**, con la forma de staging:

```
sudo -u crm bash -c "cd /srv/crm-production && git fetch && git checkout --detach $SHA && npm ci --no-audit --no-fund"
sudo bash -c "set -a && . /etc/crm-production/migrate.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run db:migrate"
sudo bash -c "set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=NODE_ENV,PORT,HOSTNAME,DATABASE_URL,TRUSTED_PROXY npm run build" && sudo systemctl restart crm-production
```

Se despliega un **SHA**, no `origin/main`: lo que se comprobó en el paso 1 es un SHA, y `main` puede haber avanzado entre la comprobación y el despliegue.

## Volver atrás

Es el mismo procedimiento de «Desplegar un cambio» con el SHA anterior: la última línea de `/var/lib/crm-production/despliegues`. **Incluye el paso 1**: ese SHA ya pasó la CI cuando se desplegó, y se vuelve a comprobar igual, porque la comprobación es barata.

**Lo que la vuelta atrás no deshace: las migraciones.** Volver el código no vuelve el esquema. Las migraciones del proyecto son aditivas, así que el código anterior sigue funcionando sobre el esquema nuevo **mientras la migración no borre ni renombre nada que ese código use**. Una migración que sí lo haga necesita su propio plan de vuelta atrás, escrito en su brief **antes** de desplegarla. Si la base misma quedó mal, la vuelta atrás es la restauración ([runbook](../../docs/runbooks/restaurar-la-base.md)), no esto.

La 13.1.2 ejecuta una vuelta atrás completa (AC-21): despliega un ref, despliega el siguiente, vuelve al primero y mide el tiempo.

## Verificar después de desplegar

Los mismos cinco pasos de staging, con `crm-production` en lugar de `crm-staging` y `crm.vixoraai.app` en lugar de `staging.vixoraai.app`, más dos pasos propios de producción:

1. **La configuración desplegada es la versionada** (O-9). Se hace el `diff` de los **once** archivos de la tabla, como en staging.
2. **Un solo salto de proxy**, medido por consecuencia (AC-14). Se comparan hashes y **nunca se versiona ni la IP ni su hash**.
3. **HSTS** presente sobre HTTPS y ausente sobre HTTP.
4. **La aplicación escucha solo en loopback.**
5. **El rol de la aplicación no es el dueño.**
6. **La ingestión y la API de lectura, apagadas**: `POST /api/ingestion/v1/events`, `POST /api/ingestion/v2/events` y `GET /api/read/v1/products` responden `404` desde afuera.
7. **Ningún dato real de un cliente**: `select count(*)` de `clients`, `conversations`, `messages` y `products` da 0 en las cuatro, y `organizations` da 1.
