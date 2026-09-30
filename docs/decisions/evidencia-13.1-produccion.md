# Evidencia 13.1 — Entorno productivo

Salidas crudas de la verificación del [brief-13.1](brief-13.1-entorno-productivo.md). Un bloque marcado `[transcrito]` no es literal y dice qué se compuso a mano (regla de la 9.1, N-8).

**Cada bloque trae su comando y su fecha, salvo estos.** Salieron de guiones corridos en el servidor (`ssh crm-production 'sudo bash -s' < guion`) o de comandos que no se copiaron acá, y ni unos ni otros quedaron registrados:
- «El usuario `crm`, los roles y la base» (`aprovisionar-base.sh`);
- «El rol de la aplicación y `app.env`»;
- en «La compilación y el arranque», los bloques de la compilación, de la unidad y de la memoria;
- en «El backup cifrado y la copia externa», los de la configuración, de `rclone.conf`, del primer backup por la unidad y de los timers.

La salida de cada uno sí es literal. Esta lista la pidió la verificación independiente de las correcciones. A los demás bloques que no tenían comando se les agregó en las correcciones de H12, tomándolo del registro de la sesión.

**Autoevaluación.** Todo lo de este archivo lo midió el mismo agente que implementó la subfase. La revisión independiente de D-11 está al final, en «AC-23».

## Etapa 13.1.1 — local, 2026-09-29

### AC-6 — Medición de collation (D-7)

Contra el PostgreSQL 18.6 local de `docker compose` (el mismo `postgres:18.6-trixie` de la CI), con veinte nombres elegidos para separar las candidatas: acentos, mayúsculas, espacios y la `ñ`. El guion está en el bloque siguiente; la salida es literal.

Comando: `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres -f -' < collation.sql`

```sql
\pset pager off
select version();
select collname, collprovider, collversion from pg_collation where collname in ('C.utf8','C.UTF-8','pg_c_utf8','en_US.utf8','es-x-icu','es-AR-x-icu','und-x-icu','es_AR.utf8') order by 1;
create temp table n(v text);
insert into n values ('Zapata'),('Ávila'),('avila'),('Avila'),('Ñandú'),('Nube'),('Oso'),('ñoqui'),('Ana María'),('Ana Maria'),('AnaMaria'),('Anabel'),('Érica'),('Eva'),('éxito'),('Última'),('Uva'),('zeta'),('ábaco'),('Abel');
\echo '--- C.utf8 (staging)'
select string_agg(v, ' | ' order by v collate "C.utf8") from n;
\echo '--- pg_c_utf8 (builtin)'
select string_agg(v, ' | ' order by v collate "pg_c_utf8") from n;
\echo '--- en_US.utf8 (desarrollo)'
select string_agg(v, ' | ' order by v collate "en_US.utf8") from n;
\echo '--- es-x-icu'
select string_agg(v, ' | ' order by v collate "es-x-icu") from n;
\echo '--- und-x-icu'
select string_agg(v, ' | ' order by v collate "und-x-icu") from n;
\echo '--- orden por lower(), como las listas del CRM, con es-x-icu'
select string_agg(v, ' | ' order by lower(v) collate "es-x-icu", v collate "es-x-icu") from n;
\echo '--- igualdad determinística: lower() distingue acentos en todas'
select 'Ávila'=lower('ÁVILA') collate "es-x-icu" as icu_eq_tilde_mayus, lower('Ávila') = lower('ÁVILA') collate "es-x-icu" as icu_lower_eq, 'avila' = 'ávila' collate "es-x-icu" as icu_sin_tilde_eq, (select collisdeterministic from pg_collation where collname='es-x-icu') as es_icu_deterministico;
```

```
Pager usage is off.
                                                      version                                                       
--------------------------------------------------------------------------------------------------------------------
 PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
(1 row)

  collname   | collprovider | collversion 
-------------+--------------+-------------
 C.utf8      | c            | 
 en_US.utf8  | c            | 2.41
 es-AR-x-icu | i            | 153.128.46
 es-x-icu    | i            | 153.128.46
 pg_c_utf8   | b            | 1
 und-x-icu   | i            | 153.128
(6 rows)

CREATE TABLE
INSERT 0 20
--- C.utf8 (staging)
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Abel | Ana Maria | Ana María | AnaMaria | Anabel | Avila | Eva | Nube | Oso | Uva | Zapata | avila | zeta | Ávila | Érica | Ñandú | Última | ábaco | éxito | ñoqui
(1 row)

--- pg_c_utf8 (builtin)
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 Abel | Ana Maria | Ana María | AnaMaria | Anabel | Avila | Eva | Nube | Oso | Uva | Zapata | avila | zeta | Ávila | Érica | Ñandú | Última | ábaco | éxito | ñoqui
(1 row)

--- en_US.utf8 (desarrollo)
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Anabel | Ana Maria | AnaMaria | Ana María | avila | Avila | Ávila | Érica | Eva | éxito | Ñandú | ñoqui | Nube | Oso | Última | Uva | Zapata | zeta
(1 row)

--- es-x-icu
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Ana Maria | Ana María | Anabel | AnaMaria | avila | Avila | Ávila | Érica | Eva | éxito | Nube | Ñandú | ñoqui | Oso | Última | Uva | Zapata | zeta
(1 row)

--- und-x-icu
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Ana Maria | Ana María | Anabel | AnaMaria | avila | Avila | Ávila | Érica | Eva | éxito | Ñandú | ñoqui | Nube | Oso | Última | Uva | Zapata | zeta
(1 row)

--- orden por lower(), como las listas del CRM, con es-x-icu
                                                                             string_agg                                                                             
--------------------------------------------------------------------------------------------------------------------------------------------------------------------
 ábaco | Abel | Ana Maria | Ana María | Anabel | AnaMaria | avila | Avila | Ávila | Érica | Eva | éxito | Nube | Ñandú | ñoqui | Oso | Última | Uva | Zapata | zeta
(1 row)

--- igualdad determinística: lower() distingue acentos en todas
 icu_eq_tilde_mayus | icu_lower_eq | icu_sin_tilde_eq | es_icu_deterministico 
--------------------+--------------+------------------+-----------------------
 f                  | t            | f                | t
(1 row)

```

**Lectura**:
- `es-x-icu` es la única candidata que ordena como en castellano. La «Ñ» va **después** de la «N» (`Nube | Ñandú | ñoqui | Oso`), cada letra acentuada va con su letra, las mayúsculas se intercalan y los espacios cuentan (`Ana Maria` antes que `Anabel`).
- `und-x-icu` pone la «Ñ» **antes** de «Nube».
- `C.utf8` y `pg_c_utf8` (staging) mandan todo lo acentuado al final, y las mayúsculas antes que las minúsculas. Es el E-2.
- `en_US.utf8` (desarrollo) ignora los espacios (`Anabel` antes que `Ana Maria`) y trata la «Ñ» como «N».
- `es-x-icu` es determinística, así que la igualdad no cambia: `'avila' = 'ávila'` da falso, y `lower()` iguala solo mayúsculas con minúsculas. Las unicidades con `lower()` no cambian de resultado.

**Resultado: D-7 se confirma. La base productiva se crea con `LOCALE_PROVIDER icu ICU_LOCALE 'es'`.**

### AC-7 — La `0003` con un dueño sin `CREATEROLE` (O-7), y la base con la collation elegida

En un contenedor descartable (`postgres:18.6-trixie`, `127.0.0.1:55432`), para no tocar el rol `crm_app` del servidor local, que es global a todas sus bases. Se borró al terminar. Las contraseñas son de ese contenedor y no existen en ningún otro lado.

Primero, sin `crm_app`. Se espera que la `0003` falle:

```
### 1. dueño sin CREATEROLE y base con ICU es
CREATE ROLE
CREATE DATABASE
You are now connected to database "crm_production" as user "ensayo_super".
CREATE EXTENSION
                                                  List of databases
      Name      |   Owner   | Encoding | Locale Provider | Collate |  Ctype  | Locale | ICU Rules | Access privileges 
----------------+-----------+----------+-----------------+---------+---------+--------+-----------+-------------------
 crm_production | crm_owner | UTF8     | icu             | C.UTF-8 | C.UTF-8 | es     |           | 
(1 row)

  rolname  | rolcreaterole | rolsuper 
-----------+---------------+----------
 crm_owner | f             | f
(1 row)

### 2. migrar SIN crm_app (se espera falla en la 0003)
Las migraciones NO se aplicaron.
Error de PostgreSQL: permission denied to create role
SQLSTATE: 42501
Detalle: Only roles with the CREATEROLE attribute may create roles.
Failed query: -- Rol de aplicación y solo inserción de audit_logs (brief-3.6, D-2; ADR 0013).
codigo de salida: 1
0
```

Después se crea `crm_app` con el superusuario y se migra de nuevo con el dueño.

**Una corrección al propio ensayo**: en el paso 1 creé `unaccent` a mano como superusuario, y eso podía tapar un problema de la migración que la crea. Se borró antes de migrar, para que la creara la migración con el dueño, como va a pasar en producción. La salida de abajo lo muestra: `unaccent` queda de `crm_owner`.

```
### 3. crm_app creado por el superusuario, extension borrada, migrar con el dueño
DROP EXTENSION
CREATE ROLE
Migraciones aplicadas.
codigo de salida: 0
### 4. estado
 tablas_publicas 
-----------------
              17
(1 row)

 migraciones 
-------------
          25
(1 row)

 extname  | extowner  
----------+-----------
 unaccent | crm_owner
(1 row)

 datcollate | datctype | datlocprovider | datlocale 
------------+----------+----------------+-----------
 C.UTF-8    | C.UTF-8  | i              | es
(1 row)

  lower_icu  
-------------
 ávila ñandú
(1 row)

### 5. rol con login miembro de crm_app, y DELETE sobre audit_logs
CREATE ROLE
ERROR:  permission denied for table audit_logs
codigo: 1
```

### AC-4 y AC-5 — El alta de la organización y el rechazo de los seeds, sobre esa misma base

Con el rol de aplicación `crm_app_login`, como se va a correr en producción. **La contraseña inicial se reemplazó por `[omitida]` con `sed` en la misma tubería**: nunca llegó a este archivo.

```
Organización creada: 695c3078-ae39-448c-9698-4932b82c85ae
Admin creado: f00de641-db7e-4ad7-8d2b-5eff5539cacc
Contraseña inicial (se muestra una sola vez; se cambia al primer ingreso): [omitida]
codigo: 0
### segundo intento, mismo correo
Ya existe un usuario con ese correo. No se creó nada.
codigo: 1
### seed contra la base productiva
El seed solo corre contra una base _dev, _test, _e2e o _staging, no contra "crm_production".
codigo: 1
1|1|1|1
```

`1|1|1|1`: una organización, un usuario, un miembro y una fila de auditoría. El segundo intento no dejó nada, y el seed se negó a correr contra `crm_production`.

**Tests de integración** (`tests/integration/organization-bootstrap.test.ts`): 6 de 6 contra la base `_test`. Incluyen AC-5 por efecto: cinco seeds contra una base `crm_production` creada en el servidor de test y borrada al terminar.

**Mutación de AC-4, ejecutada** `[transcrito]`: se cambió `throw new EmailTakenError()` por `return failure("CONFLICT")`. Así la transacción confirma la organización ya insertada.
- Antes: 6 de 6.
- Después: 1 falló y 5 pasaron. Falló «con un correo ya tomado responde CONFLICT y no deja una organización sin admin», con `expected { organizations: 2, … } to deeply equal { organizations: 1, … }`.
- Se restauró el código.

**Mutación de AC-5, ejecutada** `[transcrito]`: se agregó `production` a `SUFIJOS_SEEDEABLES` en `seeds/basic.ts`. El primer intento lo bloqueó el clasificador de permisos de Claude Code como debilitamiento de seguridad. El usuario la autorizó después, en su propio turno, el mismo día.
- Antes: 6 de 6.
- Después: 1 falló y 5 pasaron. Falló «todos los seeds rechazan la base productiva sin crear nada», con `expected [Function] to throw error including 'no contra "crm_production"' but got 'Failed query: insert into "organizati…'`. Con la mutación, el seed llegó a escribir en la base productiva.
- El archivo se restauró desde una copia en el mismo comando. `cmp` lo dio idéntico y `git status` no muestra cambios en `seeds/`.
- Se volvió a correr sin la mutación: 6 de 6. El `finally` del test borra la base `crm_production` aunque el test falle, así que no quedó ninguna.

### AC-3 — Mutaciones de las guardas sobre los archivos reales de producción

`[transcrito]`: la tabla junta las líneas `Tests` de cada corrida. Cada mutación se aplicó con `sed` sobre el archivo real, se corrió la guarda de ese archivo y se restauró el original desde una copia. Al terminar, `cmp` contra las copias no dio ninguna diferencia.

Antes: `Tests 396 passed (396)` en el proyecto `guards` entero.

| Mutación | Guarda | Después |
| --- | --- | --- |
| `X-Forwarded-For $proxy_add_x_forwarded_for` | proxy | 7 fallan, 34 pasan (41) |
| `set_real_ip_from` en el `server` | proxy | 9 fallan, 32 pasan (41) |
| una segunda `X-Forwarded-For` con `$http_x_forwarded_for` | proxy | 9 fallan, 32 pasan (41) |
| la unidad sin `-H 127.0.0.1` | proxy | 1 falla, 40 pasan (41) |
| la unidad con `User=benja` | proxy | 1 falla, 40 pasan (41) |
| la unidad con el `EnvironmentFile` de staging | proxy | 1 falla, 40 pasan (41) |
| directorio `deploy/demo` sin guarda | proxy | 2 fallan, 39 pasan (41) |
| rotación con `sort -r` | backup | 5 fallan, 110 pasan (115) |
| el cifrado movido después del renombre | backup | 1 falla, 114 pasan (115) |
| sin el control de la clave pública | backup | 1 falla, 114 pasan (115) |
| el dump en claro agregado a la subida | backup | 1 falla, 114 pasan (115) |
| la retención externa sin mínimo | backup | 1 falla, 114 pasan (115) |
| `OnSuccess=` movido a `[Service]` | backup | 1 falla, 114 pasan (115) |
| el backup sin `IPAddressDeny=any` | backup | 1 falla, 114 pasan (115) |
| el timer del backup mensual en vez de diario | backup | 1 falla, 114 pasan (115) |
| `effective_cache_size = 4GB` | postgres | 2 fallan, 33 pasan (35) |
| `random_page_cost = 4` | postgres | 2 fallan, 33 pasan (35) |

**Una mutación no mutó en el primer intento**: la de `sort -r`. `sed` rechazó la expresión mal escapada y el script lo detectó al comparar el archivo contra el original («SIN CAMBIO»), en vez de informarla en verde. Se repitió con una expresión más simple, y la tabla muestra ese segundo resultado.

## Etapa 13.1.2 — El entorno productivo

### El droplet, el acceso y el DNS, 2026-09-29

Creados por el usuario, con los pasos del asistente. `[transcrito]`: lo informó el usuario y el asistente lo verificó donde se indica.

- **Droplet** `crm-production`: NYC1, la misma región que staging; Ubuntu 24.04 LTS x64; Basic Regular, 2 GB / 1 vCPU; **sin backups ni snapshots del proveedor** (D-5). Costo informado por el usuario: **USD 12 por mes**.
- **Clave SSH propia de producción** (`id_ed25519_crm_production`), distinta de la de staging. La privada no salió de la máquina del usuario.
- **Clave de host verificada fuera de banda**: el usuario comparó la huella ED25519 de la primera conexión con la de `ssh-keygen -lf` en la Web Console de DigitalOcean. Cierra, para producción, la limitación de confianza en el primer uso que declaró la 9.1.
- **Acceso**: usuario `benja` con `sudo`, `root` y contraseñas rechazados con `/etc/ssh/sshd_config.d/00-crm.conf`.
- **DNS**: registro `A` de `crm.vixoraai.app` en Cloudflare, *DNS only*.
- **Bucket** `crm-production-backups` en NYC3, la región de Spaces más cercana a NYC1 (que Spaces esté o no en NYC1 no se verificó), con una clave de acceso *Limited* solo sobre ese bucket. Costo informado por el usuario: **USD 5 por mes**. El secreto lo guarda el usuario y no pasó por la conversación.
- **Clave de `age`** generada en la máquina del usuario. La privada vive fuera del droplet (gestor de contraseñas y copia fuera de línea); la pública la recibió el asistente para `backup.age.pub`.
- **Techo de costo** para la condición de detención 9: **USD 17 por mes**.

Verificación del asistente, 2026-09-29. La IP no se imprime: se compara la que resuelve cada servidor DNS con la del alias de `ssh`, dentro del mismo comando.

```text
$ cfg=$(ssh -G crm-production | awk '/^hostname /{print $2}'); for r in 8.8.8.8 1.1.1.1; do d=$(nslookup crm.vixoraai.app $r | awk '/^Address/{a=$2} END{print a}'); [ "$d" = "$cfg" ] && echo "$r: coincide" || echo "$r: NO coincide"; done
8.8.8.8: coincide
1.1.1.1: coincide
$ ssh crm-production 'echo "usuario: $(whoami)"; sudo -n true && echo "sudo: OK"; lsb_release -ds; free -m | awk "/^Mem:/{print \"RAM total MB: \" \$2}"; sudo sshd -T | grep -E "^(permitrootlogin|passwordauthentication) "; systemctl is-active unattended-upgrades'
usuario: benja
sudo: OK
Ubuntu 24.04.5 LTS
RAM total MB: 1967
permitrootlogin no
passwordauthentication no
active
```

### Los paquetes (AC-16, primera parte), 2026-09-29

Autorizado por el usuario en su turno. Pasos:
1. `apt-get update` y `upgrade`, sin reinicio pendiente al terminar.
2. El repositorio `pgdg` con el script de `postgresql-common`. La versión candidata era `18.6-1.pgdg24.04+2`, la misma de staging y de la CI, y se instaló fijada: `postgresql-18=18.6-1.pgdg24.04+2`. Trae `unaccent`, así que no hace falta el paquete `postgresql-contrib`.
3. NodeSource 24, fijado en `nodejs=24.21.0-1nodesource1`, la misma versión de staging (`v24.21.0`).
4. `nginx`, `certbot`, `python3-certbot-nginx`, `age` y `rclone`, de los repositorios de Ubuntu.

Salida literal:

```text
$ ssh crm-production 'date -u …; lsb_release -ds; node --version; npm --version; psql --version; sudo -u postgres psql -tAc "select version()"; nginx -v; certbot --version; age --version; rclone version | head -1; systemctl is-active postgresql nginx; systemctl is-enabled certbot.timer; free -m | head -3; swapon --show'
2026-09-29T20:35:04Z
Ubuntu 24.04.5 LTS
node v24.21.0
npm 11.19.0
psql (PostgreSQL) 18.6 (Ubuntu 18.6-1.pgdg24.04+2)
PostgreSQL 18.6 (Ubuntu 18.6-1.pgdg24.04+2) on x86_64-pc-linux-gnu, compiled by gcc (Ubuntu 13.3.0-6ubuntu2~24.04.1) 13.3.0, 64-bit
nginx version: nginx/1.24.0 (Ubuntu)
certbot 2.9.0
1.1.1
rclone v1.60.1-DEV
active
active
enabled
               total        used        free      shared  buff/cache   available
Mem:            1967         392         272          21        1503        1575
Swap:              0           0           0
```

`[transcrito]`: parte del comando se abrevió con `…` (fechas, repeticiones o pasos ya mostrados arriba). La salida es literal.

- **Node `v24.21.0`**, dentro del `>=24 <25` de `package.json` (D-6). **PostgreSQL 18.6** (D-6). La collation de la base se mide cuando se cree la base.
- **Sin swap.** Si `next build` lo necesita, se agrega con el motivo registrado (condición de detención 6).
- `rclone v1.60.1` es la del repositorio de Ubuntu. `copyto`, `size --json` y `delete --min-age`, que usa `crm-backup-offsite.sh`, existen desde antes de esa versión. Se confirma por efecto en AC-18.

### El usuario `crm`, los roles y la base (AC-16, collation), 2026-09-29

Autorizado por el usuario en su turno. Son los pasos 4 y 5 del [README](../../deploy/production/README.md), corridos como `root` con un guion (`ssh crm-production 'sudo bash -s' < aprovisionar-base.sh`). La contraseña de `crm_owner` la generó `openssl rand -hex 32` en el servidor, y fue directo a `/etc/crm-production/migrate.env` (`0600`, `root`) y a `psql` por una tubería. **No se imprimió ni pasó por los argumentos de ningún proceso.** El guion aborta si `migrate.env` ya existe, para no pisar un secreto.

Salida literal, salvo los espacios al final de las líneas de `\l`, que se quitaron. La consulta de roles es `select rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin from pg_roles where rolname like 'crm%'`:

```text
2026-09-29T20:38:51Z
--- id crm
uid=997(crm) gid=987(crm) groups=987(crm)
/srv/crm-production:/usr/sbin/nologin
--- carpetas
drwx------ 2 root root 4096 Sep 29 20:38 /etc/crm-production
drwxr-xr-x 2 crm  crm  4096 Sep 29 20:38 /srv/crm-production
drwxr-x--- 2 root root 4096 Sep 29 20:38 /var/lib/crm-production
total 4
-rw------- 1 root root 131 Sep 29 20:38 migrate.env
--- roles
crm_app|f|f|f|f
crm_owner|f|f|f|t
--- \l crm_production
                                                  List of databases
      Name      |   Owner   | Encoding | Locale Provider | Collate |  Ctype  | Locale | ICU Rules | Access privileges
----------------+-----------+----------+-----------------+---------+---------+--------+-----------+-------------------
 crm_production | crm_owner | UTF8     | icu             | C.UTF-8 | C.UTF-8 | es     |           |
(1 row)

--- conexión del dueño con migrate.env
crm_owner|crm_production
```

- `crm` es un usuario de sistema sin shell (I-2).
- `crm_owner` tiene login, pero no es superusuario ni tiene `CREATEROLE` ni `CREATEDB`.
- `crm_app` es `NOLOGIN`, y lo creó el superusuario antes de migrar (O-7).
- **`\l` da proveedor `icu`, locale `es` y dueño `crm_owner`**, como decide D-7 y como se ensayó en AC-6.

Este es el orden real sobre la base productiva, con la versión de la collation que registró PostgreSQL:

```text
$ ssh crm-production "sudo -u postgres psql -d crm_production -tA -c \"select string_agg(n, ' < ' order by n) from (values ('Nora'),('Ñandú'),('Oscar'),('ávila'),('Avila'),('Zapata'),('de la Fuente'),('Delgado')) v(n)\" -c \"select datcollversion from pg_database where datname='crm_production'\""
Avila < ávila < de la Fuente < Delgado < Nora < Ñandú < Oscar < Zapata
153.121.44.8
```

La `Ñ` va después de la `N`, los acentos quedan junto a su letra y el espacio cuenta. Es el mismo orden que midió AC-6 en `postgres:18.6-trixie`, en estos 8 nombres.

**Lo que no es igual, y no se declaró hasta la revisión independiente (H13)**: la versión de ICU.
- AC-6 midió en el contenedor Debian, con `es-x-icu` en **`153.128.46`**.
- Producción, en Ubuntu 24.04, registra `datcollversion` **`153.121.44.8`**.

Son dos bibliotecas ICU distintas, y acá se comparó una muestra de 8 nombres, no el juego de 20 de AC-6. **Que ordenen igual los 20 es una inferencia**: coherente con D-7 y con los 8 comparados, pero no medida.

**El riesgo real de la recuperación es otro, y es mayor que la diferencia de versión.** Lo señaló la verificación independiente de las correcciones (N2), y se midió el 2026-09-30:
- `pg_restore` sin `--create`, sobre una base hecha con `createdb`, **no trae la configuración regional de la base**: la toma de `template1` del servidor de destino.
- En el droplet, `template1` es libc `C.UTF-8`; solo `crm_production` es ICU `es`:

```text
$ ssh crm-production "sudo -u postgres psql -tA -c \"select datname, datlocprovider, datcollate, coalesce(datlocale,'-') from pg_database order by 1\""
crm_production|i|C.UTF-8|es
postgres|c|C.UTF-8|-
template0|c|C.UTF-8|-
template1|c|C.UTF-8|-
```

- Una recuperación con el `createdb -O crm_owner` del runbook perdía entonces la ICU `es` de D-7, sin ningún aviso. En un contenedor descartable, `postgres:18.6-trixie` sin red:

```text
$ docker exec -u postgres crm-icu createdb -O crm_owner como_runbook; docker exec -u postgres crm-icu createdb -O crm_owner --template=template0 --encoding=UTF8 --locale-provider=icu --icu-locale=es --locale=C.UTF-8 con_icu; docker exec -u postgres crm-icu psql -tA -c "select datname, datlocprovider, datcollate, coalesce(datlocale,'-') from pg_database where datname in ('como_runbook','con_icu') order by 1"; for db in como_runbook con_icu; do printf "%s: " $db; docker exec -u postgres crm-icu psql -d $db -tA -c "select string_agg(n, ' ' order by n) from (values ('Ñandú'),('Nube'),('Oso'),('ñoño'),('Árbol'),('Zorro')) t(n)"; done
como_runbook|c|en_US.utf8|-
con_icu|i|C.UTF-8|es
como_runbook: Árbol Ñandú ñoño Nube Oso Zorro
con_icu: Árbol Nube Ñandú ñoño Oso Zorro
```

`[transcrito]`: se omitieron el `docker run`, la espera a `pg_isready`, el `CREATE ROLE crm_owner` y el `docker stop`.

Con el `createdb` del runbook, en ese contenedor, la `Ñ` quedó antes de la `N`, contra lo que decidió D-7. En el droplet, con `C.UTF-8`, el orden sería por punto de código, también distinto de D-7. Esto último se infiere, no se midió. **El runbook se corrigió** (§Producción, punto 1): en producción, la base nueva se crea con los mismos parámetros ICU que la original.

**Y la restauración de AC-18 también quedó en libc**, porque creó la base con `createdb -O crm_owner crm_production`. Eso no cambia lo que AC-18 comprobó: recuentos, dueños, triggers y permisos no dependen de la collation. Pero la afirmación «AC-18 restauró en otra versión de ICU», agregada por H13, era falsa y se retiró.

### La configuración de PostgreSQL, 2026-09-29

Los 2048 MB provisionales de la 13.1.1 se reemplazaron por los **1967 MB** medidos, en el archivo y en la guarda, en el mismo cambio. `effective_cache_size = 1GB` no cambió: es un poco más de la mitad de 1967 MB, y se reconfirma con la aplicación corriendo.

La guarda pasó 35 de 35. Con la mutación `1967 MB` → `1976 MB` en la cabecera, falló 1 (la de la cabecera) y pasaron 34. Después se restauró el archivo, y `cmp` lo confirmó.

Se instaló el archivo versionado y se recargó PostgreSQL. Estos dos parámetros no piden reinicio.

```text
$ ssh crm-production 'sudo install -m 0644 -o root -g root /dev/stdin /etc/postgresql/18/main/conf.d/crm-production.conf && sudo systemctl reload postgresql@18-main && sudo -u postgres psql -tA -c "show effective_cache_size" -c "show random_page_cost" -c "select name, sourcefile from pg_settings where name in (…)"' < deploy/production/postgresql-crm-production.conf
1GB
1.1
effective_cache_size|/etc/postgresql/18/main/conf.d/crm-production.conf
random_page_cost|/etc/postgresql/18/main/conf.d/crm-production.conf
$ ssh crm-production 'sudo cat /etc/postgresql/18/main/conf.d/crm-production.conf' | diff - deploy/production/postgresql-crm-production.conf && echo "servidor = versionado"
servidor = versionado
```

`[transcrito]`: parte del comando se abrevió con `…` (fechas, repeticiones o pasos ya mostrados arriba). La salida es literal.

### La deploy key, el código y las dependencias, 2026-09-29

Autorizado por el usuario en su turno (pasos 1 a 3 de ese pedido).

**La deploy key de producción**, generada en el servidor como `crm`. La privada no salió de ahí.

El primer intento falló con `Saving key "/var/lib/crm-production/ssh/id_ed25519_deploy" failed: Permission denied`: `/var/lib/crm-production` era `0750` de `root`, y `crm` no podía entrar. Se corrigió con `chgrp crm` (I-6).

```text
drwxr-x--- 3 root crm 4096 Sep 29 20:46 /var/lib/crm-production
drwx------ 2 crm  crm 4096 Sep 29 20:46 /var/lib/crm-production/ssh
total 8
-rw------- 1 crm crm 411 Sep 29 20:46 id_ed25519_deploy
-rw-r--r-- 1 crm crm 103 Sep 29 20:46 id_ed25519_deploy.pub
```

La pública se agregó con `gh repo deploy-key add`. Las dos claves son de solo lectura, y distintas:

```text
$ gh repo deploy-key list
164090952	crm-staging (solo lectura)	read-only	ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOTJNxN4QrNWKTpAhvSE3H+5IqYpF77FcoXLLpDdCnLo	2026-09-22T14:24:49Z
164864214	crm-production (solo lectura)	read-only	ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPD9zFRTLKQFGbk111enWBw23/AlrZW2QZCIVYX34Ud+	2026-09-29T20:46:35Z
```

**La clave de host de GitHub se tomó de su API**, no con confianza en el primer uso. El `known_hosts` de `crm` se escribió desde `gh api meta --jq '.ssh_keys[] | "github.com " + .'`, y la conexión se probó con `StrictHostKeyChecking=yes`:

```text
256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)
256 SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM github.com (ECDSA)
3072 SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s github.com (RSA)
Hi benjamurilloo/AI-WhatsApp-Agent-CRM! You've successfully authenticated, but GitHub does not provide shell access.
```

**La CI del SHA exacto (D-4), antes de clonar:**

```text
$ gh run list --commit 938423d0a832e65eb9c42474c51a47a44c54689e --json headSha,conclusion,status
[{"conclusion":"success","headSha":"938423d0a832e65eb9c42474c51a47a44c54689e","status":"completed"}]
```

**El clonado y `npm ci`**, como `crm`, en `/srv/crm-production`. El guion comprueba antes que la carpeta esté vacía. `HEAD` quedó en el SHA verificado, sin cambios locales (`git status --short` da 0 líneas). `npm ci` instaló 183 paquetes en `node_modules/`, con `node_modules/.bin/next` presente.

**Un defecto propio, corregido (I-6).** El home de `crm` era `/srv/crm-production`, como decía el README de la 13.1.1, y `npm ci` dejó su caché dentro del repositorio:

```text
?? .npm/
!! .npm/_logs/
!! node_modules/
```

Se le dio a `crm` un home propio y se borró la caché:

```text
$ ssh crm-production 'sudo install -d -m 0700 -o crm -g crm /var/lib/crm-production/home; sudo usermod -d /var/lib/crm-production/home crm; sudo rm -rf /srv/crm-production/.npm; …'
/var/lib/crm-production/home:/usr/sbin/nologin
!! node_modules/
HOME=/var/lib/crm-production/home
/var/lib/crm-production/home/.npm
```

`[transcrito]`: parte del comando se abrevió con `…` (fechas, repeticiones o pasos ya mostrados arriba). La salida es literal.

El registro de despliegues (`/var/lib/crm-production/despliegues`) **no se escribió**: guarda el SHA que estaba desplegado **antes** de cada despliegue, para poder volver atrás, y este es el primero. El próximo despliegue anota `938423d…`.

### La migración, 2026-09-29

El usuario la autorizó (paso 4 de ese pedido), pero el clasificador de permisos de Claude Code bloqueó al asistente, porque la clasificó como «Production Deploy». **La corrió el usuario en su terminal**, con el comando del README, y pegó la salida:

```text
$ ssh crm-production 'sudo bash -c "set -a && . /etc/crm-production/migrate.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run db:migrate"'

> ai-whatsapp-agent-crm@0.1.0 db:migrate
> tsx scripts/migrar.ts

Migraciones aplicadas.
```

Después, el asistente verificó con consultas de solo lectura:

```text
$ ssh crm-production "sudo -u postgres psql -d crm_production -tA -c \"select count(*) from drizzle.__drizzle_migrations\" -c \"select count(*) from pg_tables where schemaname='public'\" -c \"select e.extname||'|'||r.rolname from pg_extension e join pg_roles r on r.oid=e.extowner where e.extname='unaccent'\" -c \"select count(*) from pg_tables where schemaname='public' and tableowner<>'crm_owner'\" -c \"select (select count(*) from organizations)||'|'||(select count(*) from users)||'|'||(select count(*) from clients)||'|'||(select count(*) from conversations)||'|'||(select count(*) from messages)||'|'||(select count(*) from products)\""
25
17
unaccent|crm_owner
0
0|0|0|0|0|0
$ ls drizzle/*.sql | wc -l
25
```

- Las **25 migraciones** del repositorio, aplicadas, con un dueño sin `CREATEROLE`. `crm_app` ya existía, y la `0003` lo salteó (O-7), igual que en el ensayo de AC-7.
- **17 tablas**, las 17 de `crm_owner`.
- `unaccent` la creó la migración, con dueño `crm_owner`, no a mano.
- `organizations`, `users`, `clients`, `conversations`, `messages` y `products`, **todas en 0**.

### El rol de la aplicación y `app.env` (AC-15), 2026-09-29

Autorizado por el usuario (paso 5). El primer intento del asistente lo bloqueó el clasificador de permisos como «Cloud Storage Mass Delete», por el `delete from audit_logs` sin filtro, que es justamente la prueba de que el rol **no** puede borrar. No se ejecutó nada. El usuario agregó entonces la regla `Bash(ssh crm-production:*)` a su configuración de Claude Code, y el asistente corrió el mismo guion. **La regla se saca al cerrar la 13.1.**

La contraseña la generó `openssl rand -hex 32` en el servidor. Fue a `psql` por una tubería y a `app.env` (`0600`, `root`), y no se imprimió. El guion se detiene si `app.env` ya existe.

Salida literal:

```text
2026-09-29T20:58:31Z
--- archivos
total 8
-rw------- 1 root root 174 Sep 29 20:58 app.env
-rw------- 1 root root 131 Sep 29 20:38 migrate.env
--- claves de app.env (sin valores)
DATABASE_URL
TRUSTED_PROXY
NODE_ENV
--- rol
crm_app_login|f|f|t|crm_app
--- AC-15: conexión con app.env y DELETE sobre audit_logs
crm_app_login|crm_production
ERROR:  permission denied for table audit_logs
```

- `crm_app_login` no es superusuario ni tiene `CREATEROLE`. Tiene login y es miembro de `crm_app` (ADR 0013, punto 5).
- `app.env` **no trae** `INGESTION_ENABLED` ni `READ_API_ENABLED`: la ingestión y la API de lectura quedan apagadas (invariante del brief).
- **AC-15 cumplido**: la conexión de la aplicación recibe `permission denied` al intentar el `DELETE` sobre `audit_logs`. La tabla estaba vacía, así que el intento no podía borrar nada aunque hubiera fallado la protección.

### El certificado, nginx y el firewall (AC-11), 2026-09-29

Autorizado por el usuario en su turno, con la cuenta de Let's Encrypt **sin correo**, como eligió.

**El certificado**, emitido al primer intento. Se usó `certonly`, que no toca la configuración de nginx, porque el archivo versionado ya trae las líneas de TLS:

```text
$ ssh crm-production 'sudo certbot certonly --nginx -d crm.vixoraai.app --non-interactive --agree-tos --register-unsafely-without-email'
2026-09-29T21:01:31Z
Saving debug log to /var/log/letsencrypt/letsencrypt.log
Account registered.
Requesting a certificate for crm.vixoraai.app
Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/crm.vixoraai.app/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/crm.vixoraai.app/privkey.pem
This certificate expires on 2026-12-28.
These files will be updated when the certificate renews.
Certbot has set up a scheduled task to automatically renew this certificate in the background.
```

La renovación quedó con el mismo instalador que staging, así que certbot recarga nginx al renovar:

```text
$ ssh crm-production 'sudo grep -E "authenticator|installer|hook" /etc/letsencrypt/renewal/crm.vixoraai.app.conf'
authenticator = nginx
installer = nginx
$ ssh crm-staging 'sudo grep -E "authenticator|installer|hook" /etc/letsencrypt/renewal/*.conf'
authenticator = nginx
installer = nginx
```

**nginx**: el archivo versionado se instaló tal cual, se desactivó el sitio por defecto, y el servidor quedó igual al repositorio:

```text
/etc/letsencrypt/options-ssl-nginx.conf
/etc/letsencrypt/ssl-dhparams.pem
total 0
lrwxrwxrwx 1 root root 41 Sep 29 21:01 crm-production -> /etc/nginx/sites-available/crm-production
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
active
$ ssh crm-production 'sudo cat /etc/nginx/sites-available/crm-production' | diff - deploy/production/nginx-crm-production.conf && echo "servidor = versionado"
servidor = versionado
```

**UFW**: la regla de SSH se agregó antes de activar el firewall, y `ssh` siguió funcionando después. Es `ufw status verbose` sin los espacios al final de las líneas:

```text
Status: active
Logging: on (low)
Default: deny (incoming), allow (outgoing), disabled (routed)
New profiles: skip

To                         Action      From
--                         ------      ----
22/tcp (OpenSSH)           ALLOW IN    Anywhere
80,443/tcp (Nginx Full)    ALLOW IN    Anywhere
22/tcp (OpenSSH (v6))      ALLOW IN    Anywhere (v6)
80,443/tcp (Nginx Full (v6)) ALLOW IN    Anywhere (v6)
```

**AC-11 (O-4): la renovación en seco y el timer**, con la salida entera, salvo un espacio al final de la línea `Congratulations…`:

```text
$ ssh crm-production 'date -u …; sudo certbot renew --dry-run 2>&1; echo "--- timers"; systemctl list-timers --all certbot.timer; echo "--- unidad"; systemctl cat certbot.timer | grep -E "OnCalendar|RandomizedDelaySec|Persistent"'
2026-09-29T21:02:43Z
Saving debug log to /var/log/letsencrypt/letsencrypt.log

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Processing /etc/letsencrypt/renewal/crm.vixoraai.app.conf
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Account registered.
Simulating renewal of an existing certificate for crm.vixoraai.app

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Congratulations, all simulated renewals succeeded:
  /etc/letsencrypt/live/crm.vixoraai.app/fullchain.pem (success)
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
--- timers
NEXT                            LEFT LAST PASSED UNIT          ACTIVATES
Wed 2026-09-30 00:52:47 UTC 3h 48min -         - certbot.timer certbot.service

1 timers listed.
--- unidad
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=43200
Persistent=true
```

`[transcrito]`: parte del comando se abrevió con `…` (fechas, repeticiones o pasos ya mostrados arriba). La salida es literal.

El timer corre dos veces por día, con hasta 12 horas de demora al azar, y `Persistent=true` recupera una corrida perdida si el droplet estuvo apagado. **AC-11 cumplido.**

La línea `Account registered.` aparece también en la simulación. Es la cuenta del entorno de pruebas de Let's Encrypt, que `--dry-run` usa, y no es una segunda cuenta de producción.

**Desde afuera**, antes de que exista la aplicación: el certificado verifica (`ssl_verify=0` es «sin error») y HTTP redirige a HTTPS. El `502` es lo esperado, porque todavía no hay nada escuchando en el puerto 3000.

```text
$ curl -sS -o /dev/null -w "https: %{http_code} ssl_verify=%{ssl_verify_result}\n" https://crm.vixoraai.app/login
https: 502 ssl_verify=0
$ curl -sS -o /dev/null -w "http: %{http_code} -> %{redirect_url}\n" http://crm.vixoraai.app/login
http: 301 -> https://crm.vixoraai.app/login
```

### La compilación y el arranque (AC-9, AC-10, AC-12), 2026-09-29

Autorizado por el usuario en su turno.

**La compilación**, del SHA `938423d…`, como `crm`, con `app.env` y la forma del README, **sin swap y sin `NODE_OPTIONS`**. No murió por memoria (condición de detención 6), y `dmesg` no registra ningún corte por falta de memoria. Salida literal, desde el final del `next build`, más `free -m` después:

```text
2026-09-29T21:07:46Z
fatal: detected dubious ownership in repository at '/srv/crm-production'
To add an exception for this directory, call:

	git config --global --add safe.directory /srv/crm-production
codigo: 0, segundos: 126
✓ Compiled successfully in 57s
  Running TypeScript ...
  Finished TypeScript in 59s ...
  Collecting page data using 1 worker ...
✓ Generating static pages using 1 worker (20/20) in 894ms
  Finalizing page optimization ...
               total        used        free      shared  buff/cache   available
Mem:            1967         485        1374          38         326        1482
Swap:              0           0           0
```

`[transcrito]`: se quitaron las líneas intermedias del progreso de las páginas estáticas y la tabla de rutas.

**Un defecto del README, corregido.** El `fatal: detected dubious ownership` vino del `git rev-parse HEAD` del guion, que corrió como `benja` sobre el repositorio de `crm`. La compilación no lo usa. Pero es la misma forma del paso «Anotar lo que está desplegado» del README, que en el próximo despliegue habría fallado. El README pasa a `sudo -u crm git -C /srv/crm-production rev-parse HEAD`. Con esa forma, el mismo SHA se leyó bien en el paso siguiente.

**La unidad**, versionada, instalada, habilitada y arrancada:

```text
938423d0a832e65eb9c42474c51a47a44c54689e
Created symlink /etc/systemd/system/multi-user.target.wants/crm-production.service → /etc/systemd/system/crm-production.service.
active
enabled
MainPID=11209
NRestarts=0
User=crm
LISTEN 0      511          0.0.0.0:443       0.0.0.0:*    users:(("nginx",pid=10697,fd=12),("nginx",pid=8475,fd=12))
LISTEN 0      511          0.0.0.0:80        0.0.0.0:*    users:(("nginx",pid=10697,fd=5),("nginx",pid=8475,fd=5))
LISTEN 0      511        127.0.0.1:3000      0.0.0.0:*    users:(("next-server (v1",pid=11222,fd=21))
LISTEN 0      511             [::]:443          [::]:*    users:(("nginx",pid=10697,fd=11),("nginx",pid=8475,fd=11))
LISTEN 0      511             [::]:80           [::]:*    users:(("nginx",pid=10697,fd=6),("nginx",pid=8475,fd=6))
Started crm-production.service - AI WhatsApp Agent CRM - produccion.
> ai-whatsapp-agent-crm@0.1.0 start
> next start -H 127.0.0.1 -p 3000
▲ Next.js 16.3.5
- Local:         http://127.0.0.1:3000
- Network:       http://127.0.0.1:3000
✓ Ready in 618ms
✓ Running next.config.ts took 268ms
$ ssh crm-production 'sudo cat /etc/systemd/system/crm-production.service' | diff - deploy/production/crm-production.service && echo "servidor = versionado"
servidor = versionado
```

La aplicación corre como `crm` (I-2) y escucha **solo en `127.0.0.1:3000`**. Hacia afuera, solo nginx.

**Desde afuera**, desde la máquina del operador. Salida literal:

```text
$ date -u +"%Y-%m-%dT%H:%M:%SZ"; H=https://crm.vixoraai.app; echo "--- AC-9"; for r in "GET /login" "POST /api/ingestion/v1/events" "POST /api/ingestion/v2/events" "GET /api/read/v1/products"; do set -- $r; printf "%-5s %-30s %s\n" "$1" "$2" "$(curl -sS -o /dev/null -w '%{http_code}' -X $1 -H 'content-type: application/json' --data-binary '{}' $( [ $1 = GET ] && echo -G ) "$H$2")"; done; curl -sS "$H/login" | grep -o "<title>[^<]*</title>"; echo "--- AC-10"; curl -sS -o /dev/null -w "verify=%{ssl_verify_result} code=%{http_code}\n" "$H/login"; echo | openssl s_client -connect crm.vixoraai.app:443 -servername crm.vixoraai.app 2>/dev/null | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null; echo "--- AC-12 HTTPS"; curl -sS -D - -o /dev/null "$H/login" | grep -i -E "^HTTP|strict-transport"; echo "--- AC-12 HTTP"; curl -sS -D - -o /dev/null "http://crm.vixoraai.app/login" | grep -i -E "^HTTP|strict-transport|^location"; echo "--- puerto 3000 desde afuera"; curl -sS -m 5 -o /dev/null -w "%{http_code}\n" "http://crm.vixoraai.app:3000/" 2>&1 | tail -1
2026-09-29T21:10:27Z
--- AC-9
GET   /login                         200
POST  /api/ingestion/v1/events       404
POST  /api/ingestion/v2/events       404
GET   /api/read/v1/products          404
<title>Iniciar sesión — AI WhatsApp Agent CRM</title>
--- AC-10
verify=0 code=200
subject=CN=crm.vixoraai.app
issuer=C=US, O=Let's Encrypt, CN=YE2
notBefore=Sep 29 20:03:11 2026 GMT
notAfter=Dec 28 20:03:10 2026 GMT
X509v3 Subject Alternative Name:
    DNS:crm.vixoraai.app
--- AC-12 HTTPS
HTTP/1.1 200 OK
strict-transport-security: max-age=31536000; includeSubDomains
--- AC-12 HTTP
HTTP/1.1 301 Moved Permanently
Location: https://crm.vixoraai.app/login
--- puerto 3000 desde afuera
000
```

- **AC-9 cumplido**: `/login` responde `200` con la aplicación real, y la ingestión v1, la v2 y la API de lectura, `404`.
- **AC-10 cumplido**: `curl` sin `-k` verifica el certificado (`ssl_verify_result` 0), emitido para el host.
- **AC-12 cumplido**: HSTS con `max-age` en la respuesta HTTPS, y sin HSTS en el `301` de HTTP.
- El `000` del puerto 3000 es «sin conexión»: el firewall no lo deja pasar, y la aplicación además escucha solo en loopback.

**La memoria con la aplicación corriendo**, el método de la 9.3:

```text
2026-09-29T21:10:53Z
               total        used        free      shared  buff/cache   available
Mem:            1967         474        1352          38         359        1493
Swap:              0           0           0
RSS de crm (MB): 200
RSS de postgres (MB): 91
```

Hay 1493 MB disponibles con la aplicación y PostgreSQL corriendo, y `effective_cache_size = 1GB` queda por debajo. **Se confirma**, y la RAM de 1967 MB de la guarda es la medida.

### El backup cifrado y la copia externa (AC-18, primera parte), 2026-09-29

Autorizado por el usuario en su turno, con 30 días de retención en el bucket.

**La configuración**: el guion corrió como `root`. La contraseña del dueño pasó de `migrate.env` a `backup.pgpass` dentro del servidor, sin imprimirse, y el guion se detiene si alguno de los tres archivos ya existe. `backup.env` no tiene secretos y va entero:

```text
2026-09-29T21:15:45Z
--- archivos
total 20
-rw------- 1 root root 174 Sep 29 20:58 app.env
-rw------- 1 root root  63 Sep 29 21:15 backup.age.pub
-rw------- 1 root root 361 Sep 29 21:15 backup.env
-rw------- 1 root root 105 Sep 29 21:15 backup.pgpass
-rw------- 1 root root 131 Sep 29 20:38 migrate.env
drwxr-x--- 2 root postgres 4096 Sep 29 21:15 /var/backups/crm-production
--- backup.env
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=crm_owner
PGDATABASE=crm_production
PGPASSFILE=/etc/crm-production/backup.pgpass
BACKUP_DIR=/var/backups/crm-production
BACKUP_GROUP=postgres
BACKUP_KEEP=7
BACKUP_AGE_RECIPIENTS=/etc/crm-production/backup.age.pub
OFFSITE_REMOTE=spaces:crm-production-backups
OFFSITE_KEEP_DAYS=30
RCLONE_CONFIG=/etc/crm-production/rclone.conf
--- backup.age.pub
age1zvyqdc6plltpp25se5jw6dtf3426z3vu8q3dzve2mqt2mydtavgqwh09cz
--- el dueño se conecta con backup.pgpass
crm_owner|crm_production
```

**Los tres scripts y las cinco unidades**, instalados desde el repositorio. `diff` contra lo versionado dio `OK` en los ocho, `systemd-analyze verify` no reportó nada, ningún archivo tiene `\r` y `bash -n` pasa en los tres scripts.

**`rclone.conf`**: lo escribió el usuario en el servidor, con `nano`. El asistente lo verificó sin imprimir las claves:

```text
-rw------- 1 root root 197 Sep 29 21:23 /etc/crm-production/rclone.conf
7
[spaces]
type = s3
provider = DigitalOcean
endpoint = nyc3.digitaloceanspaces.com
acl = private
2
rc=0
```

El `2` cuenta las dos líneas de clave con un valor no vacío. `rc=0` es un `rclone lsf` del bucket vacío, sin error.

**El primer backup falló en la subida (defecto propio, corregido).** El backup local salió bien. La unidad de copia externa falló con `403`:

```text
backup: /var/backups/crm-production/crm_production-20260929T212425Z.dump
tamano: 64396 bytes
sha256: 05365d43066872f976f3ef421c134d2e5ee33c1a34005540560b5ec841a03e84
cifrado: /var/backups/crm-production/crm_production-20260929T212425Z.dump.age (64596 bytes)
rotado: nada (hay <= 7 copias)
…
ERROR : crm_production-20260929T212425Z.dump.age: Failed to copy: AccessDenied: Access Denied.
	status code: 403, request id: 049e9658-ba39-219463604, host id:
…
crm-backup-offsite.service: Failed with result 'exit-code'.
```

`[transcrito]`: se omitieron los dos reintentos, que repiten el mismo error.

Se probó con un archivo de 5 bytes, de a una hipótesis por vez:
- **Sin el encabezado de ACL** (`--s3-acl ""`): seguía en `403`. No era eso.
- **Sin la comprobación del bucket** (`--s3-no-check-bucket`): subió, se listó y se borró.

La causa: sin esa opción, `rclone` 1.60 intenta **crear** el bucket antes de subir, y la clave limitada a un bucket no puede crear buckets. Listar sí funcionaba, y por eso el primer control no lo vio.

```text
--- sin chequeo de bucket
        7 2026-09-29 21:24:56.965409328 prueba-rclone.txt
--- borrado de la prueba
fin
```

La corrección va en el script versionado (`--s3-no-check-bucket` en la subida), con su motivo, y no en `rclone.conf`: así queda en el repositorio y la guarda la ve. La guarda de backup tiene una aserción nueva. Pasó 397 de 397, y con la opción quitada del script real falla justo esa aserción (1 falla, 116 pasan en el archivo); después se restauró el script, y `cmp` lo confirmó. El script se reinstaló, y `diff` lo dio igual al versionado.

**El segundo backup**, por la unidad, como lo va a correr el timer:

```text
2026-09-29T21:26:54Z
Result=success
Result=success
ExecMainStatus=0
--- journal offsite
Starting crm-backup-offsite.service - AI WhatsApp Agent CRM - copia externa cifrada del backup de produccion...
subido: crm_production-20260929T212654Z.dump.age (64596 bytes)
retencion externa: se borro lo de mas de 30 dias
crm-backup-offsite.service: Deactivated successfully.
Finished crm-backup-offsite.service - AI WhatsApp Agent CRM - copia externa cifrada del backup de produccion.
--- bucket
    64596 2026-09-29 21:26:54.741794387 crm_production-20260929T212654Z.dump.age
       65 2026-09-29 21:26:54.777798200 crm_production-20260929T212654Z.dump.age.sha256
      277 2026-09-29 21:26:54.723792481 crm_production-20260929T212654Z.dump.recuentos
--- suma local vs remota del .age
caf7306df15fcbdd5a6b66292af3417e573dc8389c0056c597a01dae2880a8c7
caf7306df15fcbdd5a6b66292af3417e573dc8389c0056c597a01dae2880a8c7
--- cabecera del .age remoto
age-encryption.org/v1
-> X25519 F5Gv7wZlI6CiJSsciRpQQNy5yMtk
```

- **En el bucket hay solo lo cifrado**: el `.age`, su suma y el manifiesto de recuentos. El dump en claro no salió del servidor.
- La suma del `.age` remoto, bajado del bucket, es idéntica a la del local.
- El remoto empieza con la cabecera de `age` para una clave X25519: está cifrado para la clave pública del operador.

**Los timers**, habilitados, y **la prueba de restauración local**, corrida una vez a mano. Es la de la 9.2, con la base de producción:

```text
2026-09-29T21:27:09Z
NEXT                            LEFT LAST PASSED UNIT                    ACTIVATES
Wed 2026-09-30 03:19:42 UTC 5h 52min -         - crm-backup.timer        crm-backup.service
Thu 2026-10-01 04:37:13 UTC 1 day 7h -         - crm-restore-check.timer crm-restore-check.service

2 timers listed.
--- prueba de restauración
Result=success
ExecMainStatus=0
== dump ==
archivo: /var/backups/crm-production/crm_production-20260929T212654Z.dump
sha256:  e1ea5064e4c1025740e406e7fdd5adddc961123a8a4eef3baa35b05afe5e9cc2
== restauracion a una base nueva: crm_production_restore_check_20260929T212710Z ==
pg_restore termino sin error
== recuentos: restaurado contra el manifiesto del dump ==
audit_logs 0
…
users 0
OK: 17 tablas coinciden en existencia y en recuento
OK: el conjunto de tablas del origen es el mismo que el restaurado
OK: las tablas restauradas siguen siendo de crm_owner
OK: la base crm_production_restore_check_20260929T212710Z no existe
```

`[transcrito]`: se omitieron 15 de las 17 líneas de recuento. Las 17 dan 0, porque la base todavía no tiene la organización del operador.

**Lo que falta de AC-18**: la restauración **desde el bucket, descifrando con la clave privada fuera del droplet**, con su control negativo contra un dump truncado. Se hace en la máquina del operador, con datos (la organización del operador) para que los recuentos no sean todos cero. *Hecho el 2026-09-30: ver «AC-18, segunda parte», al final.*

### La primera organización: una corrida de más, 2026-09-29

El usuario corrió `org:create` en su terminal, con el comando que le pasó el asistente, para que la contraseña inicial no pasara por la conversación. **La primera vez lo pegó sin reemplazar los valores de ejemplo**, y la segunda, con los suyos. Las dos corridas crearon su organización. El asistente lo verificó con consultas de solo lectura. Por el principio de este archivo, el correo real del operador no se transcribe:

```text
                  id                  |           name            |            timezone            |          created_at           | miembros
--------------------------------------+---------------------------+--------------------------------+-------------------------------+----------
 aa8c2477-491e-478c-b4f1-a50cbb491793 | Nombre de tu organización | America/Argentina/Buenos_Aires | 2026-09-29 21:30:46.741026+00 |        1
 0633244b-13f7-4cf6-8051-803b7e2fee27 | Vixora                    | America/Argentina/Buenos_Aires | 2026-09-29 21:31:50.178741+00 |        1
(2 rows)

 sesiones | intentos
----------+----------
        0 |        0
```

`[transcrito]`: se omitieron la tabla de `users` (dos filas: `tu@correo.com`, el valor de ejemplo, y el correo del operador) y la de `audit_logs` (una fila `organization_member | create` por organización).

- **Ninguna de las dos cuentas se usó**: 0 sesiones y 0 intentos de ingreso.
- **AC-22 no se cumple así**: pide una sola organización, la del operador.
- La organización de ejemplo **no se puede borrar sin más**. `audit_logs` tiene el trigger `audit_logs_insert_only` (`drizzle/0003`), que rechaza `UPDATE` y `DELETE` para cualquier rol. Su fila del alta apunta a la organización y al usuario con claves foráneas `ON DELETE restrict` (`drizzle/0002`).
- **Defecto del asistente**: el comando traía valores de ejemplo con forma válida, y `org:create` los aceptó. Un marcador que el script rechazara (por ejemplo `<correo>`, que no pasa la validación de correo) habría fallado sin crear nada.

### La organización de ejemplo, borrada, 2026-09-29

**Decisión del usuario**: borrar solo la organización de ejemplo, con el trigger de auditoría desactivado dentro de una sola transacción. Era la opción B. Las otras eran recrear la base de cero (A), que conservaba intacto el principio de que la auditoría productiva nunca se toca, o dejarla y declarar AC-22 como límite (C).

El asistente lo intentó con la autorización del usuario, pero el clasificador de permisos de Claude Code lo bloqueó como «Logging/Audit Tampering», aunque estaba la regla de `ssh crm-production`. No se ejecutó nada. **Lo corrió el usuario en su terminal**, con el guion del asistente:
- el guion comprueba antes de borrar que la organización y el usuario sean los de ejemplo, por id, nombre y correo, y que ese usuario no sea miembro de otra organización;
- cada `DELETE` exige exactamente una fila, o se revierte todo;
- el trigger se reactiva **antes** del `COMMIT`, así que la protección nunca queda apagada fuera de esa transacción.

Salida pegada por el usuario, sin el eco del guion:

```text
--- antes
 orgs | usuarios | miembros | auditoria
------+----------+----------+-----------
    2 |        2 |        2 |         2
(1 row)

BEGIN
ALTER TABLE
DO
NOTICE:  borradas 4 filas: auditoría, miembro, usuario y organización de ejemplo
ALTER TABLE
COMMIT
--- después
 orgs | usuarios | miembros | auditoria
------+----------+----------+-----------
    1 |        1 |        1 |         1
(1 row)

  name
--------
 Vixora
(1 row)

         tgname         | tgenabled
------------------------+-----------
 audit_logs_insert_only | O
(1 row)
```

**Lo que se borró de la auditoría productiva**: una fila, `organization_member | create`, de la organización `aa8c2477-491e-478c-b4f1-a50cbb491793` («Nombre de tu organización»). Registraba el alta de la cuenta de ejemplo `tu@correo.com`, que nunca ingresó. **No hubo otro borrado ni otra modificación de `audit_logs` en producción.**

Verificación del asistente, con lecturas. La consulta compara el correo con el valor de ejemplo, para no imprimir el real:

```text
$ ssh crm-production "sudo -u postgres psql -d crm_production -tA -c \"select o.name, m.role, (u.email = 'tu@correo.com') as es_ejemplo, u.must_change_password from organizations o join organization_members m on m.organization_id=o.id join users u on u.id=m.user_id\" -c \"select entity_type, action, (actor_user_id = (select id from users)) as actor_es_admin from audit_logs\" -c \"select tgname, tgenabled, tgfoid::regproc from pg_trigger where tgname='audit_logs_insert_only'\" -c \"select (select count(*) from clients)||'|'||(select count(*) from conversations)||'|'||(select count(*) from messages)||'|'||(select count(*) from products)||'|'||(select count(*) from sessions)\""
Vixora|admin|f|t
organization_member|create|t
audit_logs_insert_only|O|audit_logs_reject_change
0|0|0|0|0
```

- Queda una sola organización, «Vixora», con un único `admin`: el operador, con **cambio de contraseña obligatorio** (D-9).
- La fila de auditoría que queda es la de su alta, con el propio admin como actor (I-1).
- El trigger está **activo** (`O`) y apunta a la misma función de rechazo. **No se probó borrando**: un `DELETE` de prueba sobre `audit_logs` en producción es lo mismo que el clasificador acaba de bloquear, y el rechazo del rol de la aplicación ya lo midió AC-15.
- Clientes, conversaciones, mensajes, productos y sesiones: **0**.

**Corrección para la próxima vez**: el defecto fue el comando que el asistente le pasó al usuario, que traía valores de ejemplo válidos. Comprobado en local: `npm run -s org:create -- --name x --admin-name y --admin-email "<correo>"` responde `Datos inválidos: adminEmail. No se creó nada.`

**Esta nota decía que los marcadores del README los rechaza el script, y era incorrecta** (H14 de la revisión independiente):
- `<correo>` iba **sin comillas** dentro del comando del README. Lo rechazaba la shell, que lo leía como una redirección, no el script. La prueba de arriba usa comillas, así que es otro comando.
- `'<organización>'` el script lo **acepta**. Reemplazar solo el correo creaba una organización con ese nombre.

El README ya no usa marcadores: pide los valores con `read`.

El operador ingresó después por primera vez y cambió la contraseña inicial, como obliga D-9. Lo informó el usuario; el asistente no lo vio.

### AC-20 (O-9): lo versionado contra lo desplegado, 2026-09-29

Autorizado por el usuario. Salida literal, corrida desde `deploy/production/`:

```text
$ chk(){ ssh crm-production "sudo cat $2" | diff - "$1" > /dev/null && echo "$1 OK" || echo "$1 DIFIERE"; }; chk nginx-crm-production.conf /etc/nginx/sites-available/crm-production; …
2026-09-29T21:50:25Z
archivos en el repo: 11
nginx-crm-production.conf OK
crm-production.service OK
crm-backup.sh OK
crm-backup-offsite.sh OK
crm-restore-check.sh OK
crm-backup.service OK
crm-backup-offsite.service OK
crm-backup.timer OK
crm-restore-check.service OK
crm-restore-check.timer OK
postgresql-crm-production.conf OK
/etc/nginx/sites-available/crm-production
crm-production
```

`[transcrito]`: parte del comando se abrevió con `…` (fechas, repeticiones o pasos ya mostrados arriba). La salida es literal.

**AC-20 cumplido**: los 11 archivos de la tabla del README coinciden con los del servidor. El recuento sale de contar los archivos, no de heredarlo del README. En `sites-enabled` hay un solo sitio, y apunta al archivo versionado.

### AC-17: un reinicio real, 2026-09-29

Autorizado por el usuario. `sudo systemctl reboot`, y después la espera desde la máquina del operador:

```text
$ ssh crm-production 'echo "--- antes"; date -u +"%Y-%m-%dT%H:%M:%SZ"; uptime -s; systemctl show crm-production -p MainPID --value; sudo systemctl reboot' 2>&1 | grep -v Pseudo; T0=$(date +%s); sleep 20; for i in $(seq 1 30); do ssh -o ConnectTimeout=5 crm-production true 2>/dev/null && break; sleep 5; done; echo "ssh de vuelta a los $(( $(date +%s) - T0 )) s"; for i in $(seq 1 30); do c=$(curl -s -o /dev/null -w "%{http_code}" https://crm.vixoraai.app/login); [ "$c" = 200 ] && break; sleep 3; done; echo "https /login: $c a los $(( $(date +%s) - T0 )) s"
--- antes
2026-09-29T21:51:08Z
2026-09-29 19:51:27
11209
ssh de vuelta a los 37 s
https /login: 200 a los 43 s
$ ssh crm-production 'echo "--- después"; date -u +"%Y-%m-%dT%H:%M:%SZ"; uptime -s; for u in crm-production nginx postgresql@18-main crm-backup.timer crm-restore-check.timer certbot.timer ufw; do printf "%-26s %s %s\n" $u $(systemctl is-active $u) $(systemctl is-enabled $u); done; systemctl show crm-production -p MainPID -p NRestarts -p User; sudo ss -ltn | awk "NR>1{print \$4}" | sort -u | tr "\n" " "; echo; sudo ufw status | head -1; systemctl --failed --no-legend | wc -l' 2>&1 | grep -v Pseudo
--- después
2026-09-29T21:52:01Z
2026-09-29 21:51:18
crm-production             active enabled
nginx                      active enabled
postgresql@18-main         active enabled-runtime
crm-backup.timer           active enabled
crm-restore-check.timer    active enabled
certbot.timer              active enabled
ufw                        active enabled
MainPID=1076
NRestarts=0
User=crm
0.0.0.0:22 0.0.0.0:443 0.0.0.0:80 127.0.0.1:3000 127.0.0.1:5432 127.0.0.53%lo:53 127.0.0.54:53 [::1]:5432 [::]:22 [::]:443 [::]:80
Status: active
0
```

**AC-17 cumplido.**
- `uptime -s` cambió de 19:51 a 21:51: el reinicio fue real.
- La aplicación volvió sola, con un PID nuevo y **sin reinicios de `systemd`** (`NRestarts=0`). Respondió `200` desde afuera a los 43 segundos de pedir el reinicio.
- nginx, PostgreSQL, los tres timers y el firewall arrancaron solos, y ninguna unidad quedó fallida (el `0` final).
- Los puertos son los mismos que antes: la aplicación y PostgreSQL, solo en loopback.

`enabled-runtime` en `postgresql@18-main` es cómo lo arranca el paquete de Debian, por la unidad `postgresql.service`. Volvió activo igual.

### AC-22: la base productiva sin datos de clientes, 2026-09-29

```text
$ ssh crm-production "sudo -u postgres psql -d crm_production -tA -c \"select 'clients='||(select count(*) from clients)||…\" -c \"select name from organizations\""
clients=0 conversations=0 messages=0 products=0 organizations=1 users=1 organization_members=1
Vixora
```

`[transcrito]`: parte del comando se abrevió con `…` (fechas, repeticiones o pasos ya mostrados arriba). La salida es literal.

**AC-22, primera parte, cumplida**: 0 clientes, 0 conversaciones, 0 mensajes y 0 productos, con una sola organización, la del operador.

**Segunda parte, revisada el 2026-09-29.** Lo que contradecía al entorno desplegado, y cómo quedó:
- [Environments.md](../development/Environments.md):
  - el estado decía «diseñado» y la fila de producción, «todavía no desplegada». Ahora dice desplegada, con la ingestión y la lectura apagadas y sin datos de clientes;
  - la sección del rol `crm_app` no decía cómo se crea en producción, con un dueño sin `CREATEROLE`. Ahora lo dice (O-7, AC-15).
- [SecurityModel.md](../architecture/SecurityModel.md):
  - la gestión de secretos de producción decía «Diseñado, no desplegado». Ahora cita AC-19;
  - la cookie, la IP detrás del proxy, H-3, HSTS y el rol de la aplicación estaban verificados solo en staging. Se agregó la medición en producción (AC-12 a AC-15);
  - la sección de backups solo describía staging, con la copia externa manual y sin cifrado. Se agregó producción, con **AC-18 declarado pendiente**: la corrida del timer y la restauración desde el bucket.

Todo lo agregado se declara autoevaluación hasta AC-23. **AC-22 cumplido en sus dos partes**. La línea de backups de SecurityModel se actualizó al cerrar AC-18, el 2026-09-30.

### AC-13 (O-6): el `Set-Cookie` crudo de un ingreso real, 2026-09-29

Es un ingreso real del operador en producción, **capturado de la cabecera de la respuesta con la API de respuestas de Playwright**, no deducido de que el navegador aceptara la cookie. Esa deducción fue el método de la 9.1, que su revisión independiente señaló. El script (`capturar-cookie.cjs`, en el scratchpad del asistente, fuera del repositorio):
- abre Chromium sin ventana e ingresa por el formulario;
- lee con `response.headersArray()` las cabeceras `Set-Cookie` del `POST` a `/login`;
- **tapa el valor de la cookie** antes de imprimir: reemplaza lo que va entre el primer `=` y el primer `;`.

El correo y la contraseña los tipeó el operador en su terminal con `read` (la contraseña con `read -s`) y le llegaron al script por variables de entorno. El script no los imprime, y no pasaron por la conversación. Salida pegada por el usuario:

```text
2026-09-29T21:59:15.643Z
después del ingreso: /
cabeceras Set-Cookie en el POST de /login: 1
[200] __Host-crm_session=<valor omitido>; Path=/; Expires=Thu, 29 Oct 2026 21:59:15 GMT; Secure; HttpOnly; SameSite=lax
```

**AC-13 cumplido**: `__Host-crm_session`, `Secure`, `HttpOnly`, `SameSite=Lax` (Next.js lo escribe en minúsculas), `Path=/`, y **sin `Domain`**, leído en la cabecera cruda. La sesión dura 30 días. El `200` es cómo responde Next.js a una Server Action que redirige: la navegación a `/` la hace el cliente.

### AC-14 (O-29, H-3): la IP que ve la aplicación y el límite por IP, 2026-09-29

Autorizado por el usuario. Se usaron dos IP de salida:
- **la del operador**: la máquina desde la que corre el asistente;
- **la del droplet de staging**: un túnel SOCKS (`ssh -N -D 1080 crm-staging`), que se cerró al terminar.

Antes de empezar se comprobó que las dos IP son distintas, comparándolas sin imprimirlas. Cada IP de salida **la informa un servicio externo** (`api.ipify.org`), no nginx ni la aplicación, así que la comparación posterior contra las claves de la base no es circular:

```text
$ ssh -N -D 1080 -o ExitOnForwardFailure=yes crm-staging &
$ echo $! > "$TEMP/tunel.pid"; sleep 4; curl -s --socks5-hostname 127.0.0.1:1080 -o /dev/null -w "tunel: %{http_code}\n" https://crm.vixoraai.app/login; A=$(curl -s https://api.ipify.org); B=$(curl -s --socks5-hostname 127.0.0.1:1080 https://api.ipify.org); [ -n "$A" ] && [ -n "$B" ] && [ "$A" != "$B" ] && echo "dos IP distintas: sí" || echo "dos IP distintas: NO"
tunel: 200
dos IP distintas: sí
```

Este comando y los dos que siguen se agregaron el 2026-09-30, tomados del registro de la sesión, por el hallazgo H1 de la revisión independiente: la evidencia original traía las salidas sin sus comandos.

Los intentos los hizo Chromium con Playwright, por el formulario real, porque el ingreso es una Server Action y un `POST` de `curl` no genera el intento. El script es `medir-ac14.cjs`, en el scratchpad del asistente. Usa correos que no existen (`prueba-NN@ejemplo.invalid`, **uno distinto por intento**, para que no salte el límite por cuenta, que es 5) y una contraseña falsa de 21 caracteres, que pasa la validación del formato y deja su fila (E-4 de la 12.5.1).

El orden fue:
1. desde la IP del operador, con un `x-forwarded-for: 203.0.113.7` falsificado (una dirección de documentación, RFC 5737);
2. desde la IP de staging, 20 fallos y un intento 21;
3. desde la IP del operador, un fallo más.

El script, **completo**. La cabecera falsificada la envía `extraHTTPHeaders` en el contexto del primer intento. La contraseña es falsa y los correos son de un dominio `.invalid`:

```js
const { chromium } = require("@playwright/test");

const BASE = "https://crm.vixoraai.app";
const PASSWORD = "contrasena-falsa-2026";
const XFF_FALSA = "203.0.113.7";
const SOCKS = "socks5://127.0.0.1:1080";

async function intento(browser, email, opciones = {}) {
  const context = await browser.newContext(opciones);
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  const mensaje = page.getByText(/Email o contraseña incorrectos\.|Demasiados intentos/);
  await mensaje.waitFor({ timeout: 30000 });
  const texto = await mensaje.textContent();
  await context.close();
  return texto.trim();
}

(async () => {
  const casa = await chromium.launch();
  const tunel = await chromium.launch({ proxy: { server: SOCKS } });
  const log = (fase, email, texto) =>
    console.log(`${new Date().toISOString()} ${fase} ${email}: ${texto}`);

  const e1 = "prueba-xff@ejemplo.invalid";
  log("casa+xff", e1, await intento(casa, e1, { extraHTTPHeaders: { "x-forwarded-for": XFF_FALSA } }));

  for (let i = 1; i <= 21; i++) {
    const email = `prueba-${String(i).padStart(2, "0")}@ejemplo.invalid`;
    log(`tunel#${i}`, email, await intento(tunel, email));
  }

  const e3 = "prueba-casa@ejemplo.invalid";
  log("casa", e3, await intento(casa, e3));

  await casa.close();
  await tunel.close();
})().catch((error) => {
  console.error(`FALLA: ${error.message}`);
  process.exit(1);
});
```

`[transcrito]`: se quitaron del script los comentarios de cabecera y de cada fase.

Salida literal de `NODE_PATH=./node_modules node medir-ac14.cjs`:

```text
2026-09-29T22:01:46.529Z casa+xff prueba-xff@ejemplo.invalid: Email o contraseña incorrectos.
2026-09-29T22:01:49.004Z tunel#1 prueba-01@ejemplo.invalid: Email o contraseña incorrectos.
2026-09-29T22:01:51.444Z tunel#2 prueba-02@ejemplo.invalid: Email o contraseña incorrectos.
…
2026-09-29T22:02:34.535Z tunel#19 prueba-19@ejemplo.invalid: Email o contraseña incorrectos.
2026-09-29T22:02:37.003Z tunel#20 prueba-20@ejemplo.invalid: Email o contraseña incorrectos.
2026-09-29T22:02:39.437Z tunel#21 prueba-21@ejemplo.invalid: Demasiados intentos. Probá de nuevo en 15 minutos.
2026-09-29T22:02:41.601Z casa prueba-casa@ejemplo.invalid: Email o contraseña incorrectos.
```

`[transcrito]`: se omitieron los intentos 3 a 18 del túnel. Los 20 primeros dieron todos «Email o contraseña incorrectos.».

Después se compararon las claves de IP de `login_attempts` con el `sha256` de cada IP y de la dirección falsificada, **dentro del mismo comando y sin imprimir ninguno de los valores**. Se anota solo a cuál corresponde cada clave, cuántos fallos tiene y a qué hora. Las IP salen otra vez de `api.ipify.org`, y se borran de la shell (`unset`) antes de consultar la base:

```text
$ h(){ printf '%s' "$1" | sha256sum | cut -d' ' -f1; }; A=$(curl -s https://api.ipify.org); B=$(curl -s --socks5-hostname 127.0.0.1:1080 https://api.ipify.org); HA=$(h "$A"); HB=$(h "$B"); HX=$(h 203.0.113.7); unset A B; ssh crm-production "sudo -u postgres psql -d crm_production -tA -F ' ' -c \"select key_hash, count(*), to_char(min(attempted_at) at time zone 'UTC','HH24:MI:SS'), to_char(max(attempted_at) at time zone 'UTC','HH24:MI:SS') from login_attempts where scope='ip' and attempted_at > now() - interval '30 minutes' group by key_hash order by 2\"" 2>/dev/null > "$TEMP/filas.txt"; echo "claves de IP en la base (últimos 30 min): $(wc -l < "$TEMP/filas.txt")"; while read -r k n t0 t1; do q="otra"; [ "$k" = "$HA" ] && q="IP del operador"; [ "$k" = "$HB" ] && q="IP de staging (túnel)"; [ "$k" = "$HX" ] && q="LA IP FALSIFICADA"; echo "clave -> $q: $n fallos, de $t0 a $t1 UTC"; done < "$TEMP/filas.txt"; grep -c "$HX" "$TEMP/filas.txt" | sed 's/^/filas con la IP falsificada: /'; rm -f "$TEMP/filas.txt"; ssh crm-production "sudo -u postgres psql -d crm_production -tA -c \"select scope, count(*) from login_attempts where attempted_at > now() - interval '30 minutes' group by scope order by 1\"" 2>/dev/null; kill $(cat "$TEMP/tunel.pid") 2>/dev/null; sleep 1; curl -s -m 3 --socks5-hostname 127.0.0.1:1080 https://crm.vixoraai.app >/dev/null && echo "túnel sigue" || echo "túnel cerrado"
claves de IP en la base (últimos 30 min): 2
clave -> IP del operador: 2 fallos, de 22:01:46 a 22:02:42 UTC
clave -> IP de staging (túnel): 20 fallos, de 22:01:49 a 22:02:37 UTC
filas con la IP falsificada: 0
account|22
ip|22
túnel cerrado
```

**AC-14 cumplido, en sus tres partes:**
1. **Dos IP distintas producen claves distintas**: hay dos claves de IP, cada una igual al hash de su IP.
2. **Un `x-forwarded-for` falsificado no cambia la IP que ve la aplicación**: el intento con la cabecera falsa quedó con la clave de la IP del operador, y ninguna fila tiene la dirección falsificada. **Lo que esta medición no distingue** (H2 de la revisión independiente): la aplicación lee la **última** entrada de `x-forwarded-for`. Si nginx le *agregara* la IP real a la cabecera del cliente en vez de reemplazarla, la cadena sería `203.0.113.7, <IP real>` y la clave saldría igual. La medición solo fallaría si nginx no fijara la cabecera. Que la **reemplaza** (brief-9.1, D-9), con un solo salto de proxy, sale de otro lado:
- de la configuración (`proxy_set_header X-Forwarded-For $remote_addr`);
- de su guarda, con la mutación `$proxy_add_x_forwarded_for` en AC-3;
- del `diff` servidor contra repositorio en AC-20.
3. **20 fallos desde una IP no bloquean el ingreso desde otra**: el intento 21 desde staging salió bloqueado por 15 minutos, y el siguiente desde la IP del operador se evaluó normal («Email o contraseña incorrectos.», no «Demasiados intentos»).

Los recuentos cierran: 22 filas por cuenta y 22 por IP (1 + 20 + 1). El intento 21 no dejó fila, porque el límite corta antes de contar. **Lo que quedó en producción**: esas 44 filas de `login_attempts`, con hashes de correos inexistentes y de las dos IP, que caducan de la ventana a los 15 minutos. No se crearon cuentas.

### AC-19: los secretos productivos, fuera del repositorio, de la CI y de staging, 2026-09-29

**Ningún valor ni hash se imprimió**: todas las comparaciones corren en un mismo comando y dan solo recuentos o nombres de clave. El método:
- En el droplet se extrae cada valor de los archivos de `/etc/crm-production/`: el lado derecho de cada `CLAVE=valor`, la contraseña de cada URL de conexión y el quinto campo de `backup.pgpass`.
- Se toman los de **16 o más caracteres** y se reduce cada uno a su `sha256`.
- Lo mismo en staging, sobre sus archivos de secretos.
- Del repositorio, el `sha256` de cada cadena de 16 o más caracteres del contenido de `git ls-files`.
- Los conjuntos de hashes se cruzan en la máquina del operador.

El umbral de 16 caracteres deja fuera valores cortos que no son secretos, como puertos o nombres de región. Las contraseñas y claves generadas para producción son todas más largas.

**Producción contra staging**, y los permisos:

```text
$ EXTRAER='for f in $(sudo find /etc/crm-DIR -maxdepth 1 -type f); do sudo sed -n "s/^[A-Za-z_]*[ ]*=[ ]*//p" "$f"; sudo sed -n "s#.*://[^:]*:\([^@]*\)@.*#\1#p" "$f"; sudo awk -F: "NF==5{print \$5}" "$f"; done | grep -E ".{16,}" | sort -u | while read -r v; do printf "%s" "$v" | sha256sum | cut -d" " -f1; done'; ssh crm-production "${EXTRAER//DIR/production}" 2>/dev/null | sort -u > "$TEMP/hp.txt"; ssh crm-staging "${EXTRAER//DIR/staging}" 2>/dev/null | sort -u > "$TEMP/hs.txt"; echo "valores de 16+ caracteres en producción: $(wc -l < "$TEMP/hp.txt")"; echo "valores de 16+ caracteres en staging: $(wc -l < "$TEMP/hs.txt")"; echo "coincidencias: $(comm -12 "$TEMP/hp.txt" "$TEMP/hs.txt" | wc -l)"; rm -f "$TEMP/hp.txt" "$TEMP/hs.txt"; echo "--- permisos"; ssh crm-production 'date -u +"%Y-%m-%dT%H:%M:%SZ"; sudo ls -la /etc/crm-production/' 2>&1 | grep -v Pseudo
valores de 16+ caracteres en producción: 12
valores de 16+ caracteres en staging: 7
coincidencias: 0
--- permisos
2026-09-29T22:03:53Z
total 32
drwx------   2 root root 4096 Sep 29 21:23 .
drwxr-xr-x 112 root root 4096 Sep 29 20:48 ..
-rw-------   1 root root  174 Sep 29 20:58 app.env
-rw-------   1 root root   63 Sep 29 21:15 backup.age.pub
-rw-------   1 root root  361 Sep 29 21:15 backup.env
-rw-------   1 root root  105 Sep 29 21:15 backup.pgpass
-rw-------   1 root root  131 Sep 29 20:38 migrate.env
-rw-------   1 root root  197 Sep 29 21:23 rclone.conf
```

**El control, el repositorio y la CI**, en un segundo comando. El control extrae dos veces los valores de producción y los cruza entre sí. Sirve para probar que el método encuentra una coincidencia cuando existe, así que el 0 de arriba no sale de un cruce roto:

```text
$ EXTRAER='…el mismo, con /etc/crm-production…'; ssh crm-production "$EXTRAER" 2>/dev/null | sort -u > "$TEMP/hp.txt"; ssh crm-production "$EXTRAER" 2>/dev/null | sort -u > "$TEMP/hp2.txt"; echo "control, producción contra sí misma: $(comm -12 "$TEMP/hp.txt" "$TEMP/hp2.txt" | wc -l) de $(wc -l < "$TEMP/hp.txt")"; git ls-files -z | xargs -0 grep -ohE "[A-Za-z0-9+/_.:@-]{16,}" 2>/dev/null | sort -u | while read -r v; do printf "%s" "$v" | sha256sum | cut -d' ' -f1; done | sort -u > "$TEMP/hr.txt"; echo "cadenas de 16+ caracteres en el repositorio: $(wc -l < "$TEMP/hr.txt")"; echo "coincidencias producción-repositorio: $(comm -12 "$TEMP/hp.txt" "$TEMP/hr.txt" | wc -l)"; comm -12 "$TEMP/hp.txt" "$TEMP/hr.txt" > "$TEMP/coinc.txt"; rm -f "$TEMP/hp2.txt" "$TEMP/hr.txt"; echo "--- secretos de GitHub Actions"; gh secret list 2>&1; gh variable list 2>&1; echo "(fin)"
control, producción contra sí misma: 12 de 12
cadenas de 16+ caracteres en el repositorio: 6607
coincidencias producción-repositorio: 6
--- secretos de GitHub Actions
(fin)
```

`[transcrito]`: el primer `EXTRAER` del comando se abrevió con `…`. Es el del bloque anterior, con la ruta fija a `/etc/crm-production`.

Entre el encabezado y `(fin)` corrieron **dos** comandos: `gh secret list` y `gh variable list`. Ninguno imprimió nada, así que **GitHub Actions no tiene secretos ni variables**. El encabezado nombra solo los secretos.

Las 6 coincidencias se identificaron por nombre de clave, sin valores. Cada hash del droplet se etiquetó con su archivo y su clave, y se filtró contra los 6 hashes coincidentes:

```text
$ ETIQ='for f in $(sudo find /etc/crm-production -maxdepth 1 -type f); do n=$(basename "$f"); sudo sed -n "s/^\([A-Za-z_]*\)[ ]*=[ ]*\(.*\)/\1\t\2/p" "$f" | while IFS="$(printf "\t")" read -r k v; do [ ${#v} -ge 16 ] && echo "$n:$k $(printf "%s" "$v" | sha256sum | cut -d" " -f1)"; done; …(lo mismo para la contraseña de cada URL y el quinto campo de backup.pgpass)…; done'; ssh crm-production "$ETIQ" 2>/dev/null > "$TEMP/etiq.txt"; echo "etiquetas: $(wc -l < "$TEMP/etiq.txt")"; echo "--- claves de producción que aparecen en el repositorio:"; grep -F -f "$TEMP/coinc.txt" "$TEMP/etiq.txt" | cut -d" " -f1 | sort -u; echo "(fin)"
etiquetas: 13
--- claves de producción que aparecen en el repositorio:
backup.env:BACKUP_AGE_RECIPIENTS
backup.env:BACKUP_DIR
backup.env:OFFSITE_REMOTE
backup.env:PGPASSFILE
backup.env:RCLONE_CONFIG
rclone.conf:endpoint
(fin)
```

`[transcrito]`: en `ETIQ` se resumieron entre `…` los dos ciclos que etiquetan la contraseña de las URL y el quinto campo de `backup.pgpass`, con la misma forma que el primero.

Las seis son **configuración, no secretos**: rutas, el nombre del remoto, la ruta del archivo de destinatarios age y el endpoint de Spaces. El README de producción y los scripts las documentan a propósito.

Los valores que sí son secretos **no coinciden con nada del repositorio**:
- `app.env:DATABASE_URL` y su contraseña;
- `migrate.env:DATABASE_URL` y su contraseña;
- `backup.pgpass`, la contraseña;
- `rclone.conf:access_key_id` y `secret_access_key`.

Son 7 de las 13 etiquetas. Las etiquetas son 13 y los valores únicos 12 porque un valor aparece en dos archivos. Esto es una inferencia: no se imprimió qué valor se repite.

**Permisos:**

```text
$ ssh crm-production 'sudo ls -la /etc/crm-production'
total 32
drwx------   2 root root 4096 Sep 29 21:23 .
drwxr-xr-x 112 root root 4096 Sep 29 20:48 ..
-rw-------   1 root root  174 Sep 29 20:58 app.env
-rw-------   1 root root   63 Sep 29 21:15 backup.age.pub
-rw-------   1 root root  361 Sep 29 21:15 backup.env
-rw-------   1 root root  105 Sep 29 21:15 backup.pgpass
-rw-------   1 root root  131 Sep 29 20:38 migrate.env
-rw-------   1 root root  197 Sep 29 21:23 rclone.conf
```

**AC-19 cumplido**:
- los seis archivos son `0600` de `root`, dentro de un directorio `0700`;
- ningún secreto productivo está en el repositorio ni en la CI;
- ninguno coincide con uno de staging.

Límite declarado: el cruce con el repositorio compara cadenas completas, no subcadenas. Un secreto incrustado dentro de una cadena más larga no se detectaría.

### AC-21 (H-3): una vuelta atrás completa, 2026-09-29

Autorizado por el usuario en su turno. Se siguió el [README](../../deploy/production/README.md), §«Desplegar un cambio» y §«Volver atrás»:
1. se desplegó un SHA posterior;
2. se volvió al anterior, tomado de la última línea de `/var/lib/crm-production/despliegues`.

Los pasos 2 y 3 del README, **en su versión de ese día**, corrieron dentro de un guion. Los comandos son los del README, con cuatro agregados que solo cambian lo que se imprime: `-q`, `--loglevel=error`, `| tail` y la redirección del log del build. El paso 3 del README se reescribió después, por H3. El guion es `desplegar.sh`, del scratchpad del asistente, fuera del repositorio. Agrega marcas de tiempo, espera a que `/login` responda 200 (hasta 60 s) y muestra el SHA antes y después.

El guion, sin sus comentarios. Se agregó el 2026-09-30 por la revisión independiente, porque no estaba registrado en ningún lado. `SHA` le llega por el entorno de la invocación, así que no tuvo el defecto H3 del README:

```bash
set -euo pipefail
: "${SHA:?falta SHA}"
t0=$(date +%s)
marca() { echo "[$(date -u +%H:%M:%S) +$(( $(date +%s) - t0 ))s] $*"; }
marca "desplegado antes: $(sudo -u crm git -C /srv/crm-production rev-parse HEAD)"
sudo -u crm git -C /srv/crm-production rev-parse HEAD | sudo tee -a /var/lib/crm-production/despliegues > /dev/null
marca "anotado; últimas líneas de despliegues:"
sudo tail -n 3 /var/lib/crm-production/despliegues
sudo -u crm bash -c "cd /srv/crm-production && git fetch -q && git checkout -q --detach $SHA && npm ci --no-audit --no-fund --loglevel=error"
marca "código y dependencias: $(sudo -u crm git -C /srv/crm-production rev-parse HEAD)"
sudo bash -c "set -a && . /etc/crm-production/migrate.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=DATABASE_URL npm run db:migrate" 2>&1 | tail -n 2
marca "migraciones"
sudo bash -c "set -a && . /etc/crm-production/app.env && set +a && cd /srv/crm-production && exec sudo -u crm --preserve-env=NODE_ENV,PORT,HOSTNAME,DATABASE_URL,TRUSTED_PROXY npm run build" > /tmp/build-ac21.log 2>&1 \
  || { tail -n 30 /tmp/build-ac21.log; exit 1; }
marca "build"
sudo systemctl restart crm-production
marca "restart"
for i in $(seq 1 60); do
  codigo=$(curl -s -o /dev/null -w '%{http_code}' https://crm.vixoraai.app/login || true)
  [[ $codigo == 200 ]] && break
  sleep 1
done
marca "/login -> $codigo"
marca "servicio: $(systemctl is-active crm-production), NRestarts=$(systemctl show -p NRestarts --value crm-production)"
marca "desplegado ahora: $(sudo -u crm git -C /srv/crm-production rev-parse HEAD)"
rm -f /tmp/build-ac21.log
```

**Límite del guion**: imprime el SHA desplegado al final pero **no lo compara** con el pedido. En las dos corridas coincidió, y así se lee abajo. La comparación la agregó el README corregido.

**El SHA de ida fue `c8fde19`, no el último commit.** `3ade19b` tenía la CI todavía `in_progress`, y el README solo permite desplegar un SHA con `success` (D-4). Entre `938423d` y `c8fde19` no hay migraciones ni cambios en `src/`: cambian `deploy/`, `tests/` y `docs/`. El ensayo mide entonces el **mecanismo** de despliegue y vuelta atrás, no la compatibilidad de un código distinto con el esquema. Ese riesgo está escrito en el README, §«Lo que la vuelta atrás no deshace».

**Paso 1, la CI de los SHA:**

```text
3ade19b: [{"conclusion":"","databaseId":36639661504,"headSha":"3ade19b09f211a5feee46ea11b215b1a88d64353","status":"in_progress"}]
c8fde19: [{"conclusion":"success","databaseId":36634183367,"headSha":"c8fde194eea6bfaa39e6e758284b2ad1eabb959f","status":"completed"}]
938423d: [{"conclusion":"success","databaseId":36616168249,"headSha":"938423d0a832e65eb9c42474c51a47a44c54689e","status":"completed"}]
```

`[transcrito]`: la salida de `gh` venía en una línea por SHA, y se le agregó el prefijo con el SHA corto.

**Ida, a `c8fde19`**, corrida por el asistente:

```text
$ ssh crm-production "SHA=c8fde194eea6bfaa39e6e758284b2ad1eabb959f bash -s" < desplegar.sh
[22:28:28 +0s] desplegado antes: 938423d0a832e65eb9c42474c51a47a44c54689e
[22:28:28 +0s] anotado; últimas líneas de despliegues:
938423d0a832e65eb9c42474c51a47a44c54689e

added 263 packages in 47s
[22:29:17 +49s] código y dependencias: c8fde194eea6bfaa39e6e758284b2ad1eabb959f

Migraciones aplicadas.
[22:29:19 +51s] migraciones
[22:29:54 +86s] build
[22:29:55 +87s] restart
[22:29:58 +90s] /login -> 200
[22:29:58 +90s] servicio: active, NRestarts=0
[22:29:58 +90s] desplegado ahora: c8fde194eea6bfaa39e6e758284b2ad1eabb959f
```

**Vuelta, a `938423d`.** El clasificador de permisos del asistente la bloqueó como «Production Deploy», así que **la corrió el usuario** en su terminal, con los mismos comandos. Salida pegada por el usuario:

```text
última línea de despliegues: 938423d0a832e65eb9c42474c51a47a44c54689e
[
  {
    "conclusion": "success",
    "databaseId": 36616168249,
    "headSha": "938423d0a832e65eb9c42474c51a47a44c54689e",
    "status": "completed"
  }
]
inicio de la vuelta atrás: 23:02:53 UTC
[23:02:56 +0s] desplegado antes: c8fde194eea6bfaa39e6e758284b2ad1eabb959f
[23:02:56 +0s] anotado; últimas líneas de despliegues:
938423d0a832e65eb9c42474c51a47a44c54689e
c8fde194eea6bfaa39e6e758284b2ad1eabb959f

added 263 packages in 25s
[23:03:23 +27s] código y dependencias: 938423d0a832e65eb9c42474c51a47a44c54689e

Migraciones aplicadas.
[23:03:24 +28s] migraciones
[23:03:53 +57s] build
[23:03:53 +57s] restart
[23:03:55 +59s] /login -> 200
[23:03:55 +59s] servicio: active, NRestarts=0
[23:03:55 +59s] desplegado ahora: 938423d0a832e65eb9c42474c51a47a44c54689e
```

**Después, desde afuera:**

```text
$ date -u +%FT%TZ; for u in /login /api/health; do printf "GET %s -> " $u; curl -s -o /dev/null -w '%{http_code}\n' https://crm.vixoraai.app$u; done; for u in /api/ingestion/v1/events /api/ingestion/v2/events; do printf "POST %s -> " $u; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://crm.vixoraai.app$u; done; printf "GET /api/read/v1/products -> "; curl -s -o /dev/null -w '%{http_code}\n' https://crm.vixoraai.app/api/read/v1/products; printf "HSTS: "; curl -sI https://crm.vixoraai.app/login | grep -i strict-transport || echo "ausente"; ssh crm-production 'sudo tail -n 3 /var/lib/crm-production/despliegues; systemctl is-active crm-production crm-backup.timer crm-restore-check.timer'
2026-09-29T23:04:37Z
GET /login -> 200
GET /api/health -> 200
POST /api/ingestion/v1/events -> 404
POST /api/ingestion/v2/events -> 404
GET /api/read/v1/products -> 404
HSTS: strict-transport-security: max-age=31536000; includeSubDomains
938423d0a832e65eb9c42474c51a47a44c54689e
c8fde194eea6bfaa39e6e758284b2ad1eabb959f
active
active
active
```

Las últimas líneas son `despliegues`, seguido de `crm-production`, `crm-backup.timer` y `crm-restore-check.timer`.

**AC-21 cumplido**:
- la vuelta atrás tardó **62 s**, desde que el usuario la inició (23:02:53) hasta `/login` 200 (23:03:55); el guion solo midió 59 s;
- la aplicación quedó sana, sin reinicios, con la ingestión y la lectura apagadas y los timers activos;
- el SHA desplegado es el anterior, y su CI está en `success`.

**Qué ocupa el tiempo:**
- `npm ci`: 47 s la primera vez, 25 s la segunda, con la caché caliente;
- `next build`: unos 30 s.

**Inferido, no medido**: nadie observó la disponibilidad durante el despliegue. Por el procedimiento:
- la aplicación no responde entre el `restart` y el primer 200, unos 2 s según las marcas;
- durante el `npm ci` y el build, el proceso viejo sigue sirviendo con `node_modules` y `.next` cambiándole debajo.

Para un entorno de un operador sin tráfico real es aceptable. Queda anotado para cuando haya tráfico.

**Defecto del README encontrado al ejecutarlo.** Cada despliegue anota el SHA que **estaba** corriendo. «Volver atrás = la última línea» vale justo después de un despliegue, pero **no después de una vuelta atrás**: ahí la última línea es `c8fde19`, la versión de la que se acaba de volver. Una segunda vuelta atrás, siguiendo el texto, volvería a desplegar la versión abandonada. Se corrige en el README, §«Volver atrás».

### AC-18, segunda parte: el timer y la restauración desde el bucket, 2026-09-30

**Primer intento, descartado.** El 2026-09-29 se bajó la única copia que había en el bucket, la de las 21:26:54 UTC, subida por la unidad arrancada a mano. Su manifiesto daba **0 filas en las 17 tablas**, porque era anterior a la primera organización. Restaurarla habría comparado ceros contra ceros: prueba que el descifrado y `pg_restore` funcionan, pero no que el contenido llega entero. El usuario eligió esperar la corrida del timer, que además es la otra mitad del criterio.

**El timer corrió solo**, sin que nadie lo arrancara:

```text
$ ssh crm-production 'systemctl list-timers crm-backup.timer crm-restore-check.timer --no-pager; sudo journalctl -u crm-backup.service -u crm-backup-offsite.service --since "2026-09-30 00:00" ...; sudo rclone ... lsl spaces:crm-production-backups'
NEXT                        LEFT LAST                        PASSED UNIT                    ACTIVATES
Thu 2026-10-01 03:17:09 UTC  16h Wed 2026-09-30 03:17:00 UTC 7h ago crm-backup.timer        crm-backup.service
Thu 2026-10-01 04:37:02 UTC  17h Tue 2026-09-29 21:27:10 UTC      - crm-restore-check.timer crm-restore-check.service
---
2026-09-30T03:17:01+00:00 crm-production crm-backup.sh[5659]: backup: /var/backups/crm-production/crm_production-20260930T031700Z.dump
2026-09-30T03:17:01+00:00 crm-production crm-backup.sh[5659]: cifrado: /var/backups/crm-production/crm_production-20260930T031700Z.dump.age (67605 bytes)
2026-09-30T03:17:01+00:00 crm-production crm-backup.sh[5659]: rotado: nada (hay <= 7 copias)
2026-09-30T03:17:01+00:00 crm-production systemd[1]: crm-backup.service: Deactivated successfully.
2026-09-30T03:17:01+00:00 crm-production systemd[1]: Finished crm-backup.service - AI WhatsApp Agent CRM - backup logico de produccion.
2026-09-30T03:17:02+00:00 crm-production crm-backup-offsite.sh[5690]: subido: crm_production-20260930T031700Z.dump.age (67605 bytes)
2026-09-30T03:17:02+00:00 crm-production systemd[1]: crm-backup-offsite.service: Deactivated successfully.
2026-09-30T03:17:02+00:00 crm-production systemd[1]: Finished crm-backup-offsite.service - AI WhatsApp Agent CRM - copia externa cifrada del backup de produccion.
---
    64596 2026-09-29 21:26:54.741794387 crm_production-20260929T212654Z.dump.age
       65 2026-09-29 21:26:54.777798200 crm_production-20260929T212654Z.dump.age.sha256
      277 2026-09-29 21:26:54.723792481 crm_production-20260929T212654Z.dump.recuentos
    67605 2026-09-30 03:17:01.380700386 crm_production-20260930T031700Z.dump.age
       65 2026-09-30 03:17:01.409702799 crm_production-20260930T031700Z.dump.age.sha256
      278 2026-09-30 03:17:01.331696307 crm_production-20260930T031700Z.dump.recuentos
```

`[transcrito]`, en tres puntos:
- En el comando se abreviaron con `...` las opciones de `journalctl` y la ruta de `rclone.conf`.
- Lo que no se declaró hasta la revisión independiente (H12): la salida de `journalctl` **pasó por un filtro**, `grep -E "Started|Finished|Deactivated|backup:|cifrado:|rotado|subido|Failed|ERROR"`. Por eso faltan líneas que los scripts imprimen siempre: `tamano:` y `sha256:` del backup, y `retencion externa:` de la copia externa. El filtro deja pasar cualquier `Failed` o `ERROR`, así que no ocultó una falla.
- De la salida se quitaron las dos líneas de ayuda de `list-timers`.

**La copia, bajada del bucket** a la máquina del operador (`~/crm-ac18`), con el `rclone` del droplet (`rclone cat`), para no tener credenciales del bucket fuera del servidor:

```text
$ cd ~/crm-ac18 && B=crm_production-20260930T031700Z.dump; for s in .age .age.sha256 .recuentos; do ssh crm-production "sudo rclone --config /etc/crm-production/rclone.conf cat spaces:crm-production-backups/$B$s" > "$B$s"; done; ls -l; echo "--- sha256 del .age bajado contra el .sha256 del bucket:"; sha256sum -c <(printf "%s  %s\n" "$(cat $B.age.sha256)" $B.age); echo "--- cabecera:"; head -c 21 $B.age; echo; echo "--- manifiesto:"; cat $B.recuentos
total 70
-rw-r--r-- 1 benja 197609 67605 Sep 30 08:15 crm_production-20260930T031700Z.dump.age
-rw-r--r-- 1 benja 197609    65 Sep 30 08:15 crm_production-20260930T031700Z.dump.age.sha256
-rw-r--r-- 1 benja 197609   278 Sep 30 08:15 crm_production-20260930T031700Z.dump.recuentos
--- sha256 del .age bajado contra el .sha256 del bucket:
crm_production-20260930T031700Z.dump.age: OK
--- cabecera:
age-encryption.org/v1
--- manifiesto:
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
```

El `OK` es el `sha256` del `.age` bajado, contra el `.age.sha256` del bucket.

**El descifrado lo hizo el usuario**, en su terminal, con la clave privada que nunca estuvo en el droplet ni pasó por la conversación:

```text
$ age --decrypt --identity ~/crm-production-backup.agekey --output crm_production-20260930T031700Z.dump crm_production-20260930T031700Z.dump.age
$ ls -l crm_production-20260930T031700Z.dump
-rw-r--r-- 1 benja 197609 67389 Sep 30 08:20 crm_production-20260930T031700Z.dump
```

`[transcrito]`: el usuario invocó `age` por su ruta completa de WinGet.

El dump descifrado se comparó con la suma en claro que el servidor escribió al hacer el backup (`.dump.sha256`), en un mismo comando y sin imprimir ninguna de las dos:

```text
$ cd ~/crm-ac18 && B=crm_production-20260930T031700Z.dump; servidor=$(ssh crm-production "sudo cat /var/backups/crm-production/$B.sha256"); local_=$(sha256sum $B | cut -d' ' -f1); [ -n "$servidor" ] && [ "$servidor" = "$local_" ] && echo "sha256 del dump descifrado = sha256 que escribió el servidor: SÍ" || echo "NO COINCIDE (o vacío)"
sha256 del dump descifrado = sha256 que escribió el servidor: SÍ
```

Más abajo, `crm-restore-check.sh` imprime el `sha256` completo del dump, porque siempre lo hace. No es un secreto: identifica el archivo, no permite reconstruirlo. Que esta comparación no lo imprimiera fue una elección de método, no una necesidad.

**La restauración, en una máquina nueva.** Se usó un contenedor `postgres:18.6-trixie` descartable, con `--network none` y sin los roles del proyecto, que se borró al terminar. El guion (`restaurar-ac18.sh`, en el scratchpad del asistente) sigue el [runbook](../runbooks/restaurar-la-base.md):
- la trampa 1;
- la «Recuperación real», pasos 4 y 5;
- §Producción, punto 1;
- el `crm-restore-check.sh` **versionado**, copiado del repositorio al contenedor.

Imprime solo recuentos y resultados. Salida literal:

```text
$ date -u +%FT%TZ && MSYS_NO_PATHCONV=1 CHECK_SCRIPT="$(cygpath -m "$PWD/deploy/production/crm-restore-check.sh")" bash restaurar-ac18.sh "$(cygpath -m ~/crm-ac18)" crm_production-20260930T031700Z.dump
2026-09-30T11:23:30Z

== contenedor descartable, sin red ==
PostgreSQL 18.6 (Debian 18.6-1.pgdg13+2) on x86_64-pc-linux-gnu, compiled by gcc (Debian 14.2.0-19) 14.2.0, 64-bit
red: no
sha256 del dump (12 primeros): 53af8409d3fc

== roles del proyecto antes de crearlos (máquina nueva: tiene que salir vacío) ==
(fin)

== runbook, trampa 1: crear los dos roles, el dueño primero ==
CREATE ROLE
CREATE ROLE
crm_app
crm_owner

== runbook, paso 4: restaurar a una base nueva, de crm_owner, SIN --no-owner ==
pg_restore: salida 0

== runbook, paso 5: recuentos restaurados contra el manifiesto del bucket ==
OK: 17 tablas, recuentos idénticos al manifiesto

== las defensas ==
dueño de la base: crm_owner
dueño de las tablas: crm_owner
triggers de solo inserción: audit_logs_insert_only, inventory_movements_insert_only, messages_insert_only, product_prices_insert_only
crm_app DELETE audit_logs: SET
crm_app DELETE audit_logs: ERROR:  permission denied for table audit_logs
superusuario DELETE audit_logs: ERROR:  audit_logs es de solo inserción: DELETE rechazado
superusuario DELETE audit_logs: CONTEXT:  PL/pgSQL function audit_logs_reject_change() line 3 at RAISE
audit_logs después: 1

== crm-restore-check.sh contra el dump ENTERO (tiene que salir 0) ==
== dump ==
archivo: /tmp/crm_production-20260930T031700Z.dump
sha256:  53af8409d3fc93a72567bd309cc9253ffd7d2ce6da7d8439f636da47a5033d56

== restauracion a una base nueva: crm_production_restore_check_20260930T112343Z ==
pg_restore termino sin error

== recuentos: restaurado contra el manifiesto del dump ==

OK: 17 tablas coinciden en existencia y en recuento
OK: el conjunto de tablas del origen es el mismo que el restaurado
OK: las tablas restauradas siguen siendo de crm_owner
OK: la base crm_production_restore_check_20260930T112343Z no existe
salida: 0

== control negativo: el mismo dump truncado a la mitad (tiene que salir distinto de 0) ==
tamaño: entero 67389, truncado 33694
archivo: /tmp/roto.dump
sha256:  5912a0992a021809e3b031946a683ebcfe3095409d5c48662a3066e137737dd6

== restauracion a una base nueva: crm_production_restore_check_20260930T112347Z ==
pg_restore: error: could not read from input file: end of file
OK: la base crm_production_restore_check_20260930T112347Z no existe
salida: 1

contenedor crm-ac18: borrado
```

`[transcrito]`: en el comando, la ruta de `restaurar-ac18.sh` en el scratchpad se abrevió a su nombre. Además, el guion filtró las 17 líneas `tabla recuento` que `crm-restore-check.sh` imprime al mostrar el manifiesto. Son las mismas del manifiesto de arriba. Al control negativo se le dejaron solo sus últimas 6 líneas.

Al terminar se borró `~/crm-ac18` con el dump en claro, como pide el runbook, y se comprobó que el contenedor ya no existe.

**AC-18 cumplido**:
- **El timer ejecuta el backup, y la copia cifrada existe en el object storage.** El timer corrió solo el 2026-09-30 a las 03:17 UTC, y la unidad de la copia externa la subió un segundo después.
- **Se restauró a una base aislada, descifrando con la clave que está fuera del droplet, y se verificó el contenido:**
  - el dump descifrado es byte a byte el que escribió el servidor;
  - los 17 recuentos coinciden con el manifiesto que viajó junto al dump;
  - la base y las tablas son de `crm_owner`;
  - las cuatro tablas de solo inserción conservan su trigger, y `crm_app` recibe `permission denied`.
- **El control negativo falla contra un dump truncado**: `crm-restore-check.sh` sale con 1 y no deja base huérfana.
- **El runbook dice quién queda como dueño** (O-3): en §Producción, punto 1, y medido acá con `crm_owner`.

**De paso, se ejecutó por primera vez lo único del runbook que estaba «diseñado, no ejecutado»: crear los roles en una máquina nueva.** El contenedor no tenía ningún rol `crm%`, y con los dos `CREATE ROLE` del runbook el `pg_restore --exit-on-error` salió con 0. Se actualiza en su tabla de estado.

**Límites declarados:**
- Dentro del contenedor, la «base de origen» contra la que `crm-restore-check.sh` compara el conjunto de tablas y los dueños **es la misma restauración** del paso 4. Esas dos comparaciones son tautológicas acá. Las que prueban algo son el manifiesto, que viene del servidor, y la igualdad del `sha256` con el dump en claro del servidor.
- Como en staging, no se compara ni un valor de columna. Lo acota el `sha256`.
- No se probó que la aplicación arranque sobre la base restaurada: eso lo cubrió el simulacro de staging de la 9.2, y en producción no hace falta para el criterio.

## AC-23: la revisión independiente (D-11), 2026-09-30

Un agente de solo lectura que no participó del trabajo revisó la subfase contra el brief, con la escala de severidad fijada antes de empezar. No tenía acceso al servidor: lo de la 13.1.2 lo conoció por esta evidencia.

**Resultado:**
- 14 hallazgos, **ninguno crítico ni mayor**.
- **H1 tocaba el instrumento de H-3** y, por la regla de parada de D-11, la subfase no se cerraba sin resolverlo.

El revisor señaló además que el brief usa «H-3» para dos cosas: la IP detrás del proxy (O-29) y la vuelta atrás. **El usuario decidió que la D-11 se refiere a O-29**, porque hereda la regla de la 9.1.

**Verificación antes de aceptarlos.** El asistente verificó los 14 contra el código, y los 14 se confirmaron.

Para H1 revisó en el registro de la sesión las dos dudas que el revisor no podía cerrar leyendo:
- la IP del operador salió de un servicio externo (`api.ipify.org`), así que la comparación no era circular;
- el script sí enviaba la cabecera falsificada.

**El usuario aprobó corregir los 14 en una sola tanda, y hacer después una verificación independiente breve de las correcciones.**

| # | Hallazgo | Corrección |
| --- | --- | --- |
| H1 | AC-14 sin comandos ni script: el instrumento de H-3 no se podía auditar leyendo | AC-14 trae ahora los tres comandos y el script completo, tomados del registro de la sesión. No se repitió la medición |
| H2 | La evidencia atribuía a la medición que nginx *reemplaza* la cabecera, y la medición no distingue reemplazar de agregar | Declarado en AC-14. Que la reemplaza sale de la configuración, de su guarda y del `diff` de AC-20 |
| H3 | README, paso 3: `$SHA` se definía en la máquina del operador y se usaba en el servidor. Con `SHA` vacío, `git checkout --detach` no cambia de versión y el despliegue «sale bien» | El paso 3 corre desde la máquina del operador, con `SHA` expandido antes del `ssh`, `test -n`, `set -e` y la comparación final de HEAD contra el SHA pedido. Probado en seco en el servidor, sin desplegar: sale 0 con el SHA corriendo, 1 con otro SHA y 1 con `SHA` vacío. Se agregaron el clonado y `core.sshCommand`, leído del servidor |
| H4 | README, paso 6: la contraseña de `crm_app_login` iba en los argumentos de `psql` | Los pasos 5 y 6 usan el método del aprovisionamiento real: la genera `openssl`, la escribe `printf` y llega a `psql` por la entrada estándar |
| H5 | README: «el entorno no existe todavía» | Estado actualizado |
| H6 | README pedía `postgresql-contrib`, y la evidencia decía que no hacía falta | Corregido en el README |
| H7 | La versión exacta de Node no estaba en el README (D-6) | El README trae `nodejs=24.21.0-1nodesource1` y `postgresql-18=18.6-1.pgdg24.04+2`. Se midió que **no están retenidos** (`apt-mark showhold` vacío) y que `unattended-upgrades` no los toca. Retenerlos cambiaba el servidor: el usuario lo autorizó y quedaron retenidos (salida en «Las mediciones de las correcciones») |
| H8 | Solo la guarda del proxy fallaba ante un directorio de `deploy/` sin cubrir | Las guardas de backup y de PostgreSQL comprueban su propia lista. Mutación: con un `deploy/demo` temporal, **las tres** fallan (2 casos cada una); se borró el directorio |
| H9 | Tres casos de guarda comprobaban su propia mutación, no el detector | Borrados, con un comentario que remite a la mutación real de AC-3 |
| H10 | El runbook no decía de dónde salen las credenciales del bucket si se pierde el droplet, y marcaba «ejecutado» un paso que se corrió de otra forma | El runbook trae los dos casos: con el droplet vivo, lo ejecutado; con el droplet perdido, una clave nueva desde el panel, **diseñado, no ejecutado**. La fila de la tabla dice cómo se bajó de verdad |
| H11 | «Todo lo de arriba vale para producción» dejaba tres huecos | El runbook agrega: `crm_owner` con login después de restaurar, la URL de producción y la comprobación de los 11 archivos. Ese ciclo **se corrió contra el servidor: los 11 coinciden**. Al escribirlo apareció un error propio: el `pgpass` real usa `127.0.0.1`, igual que `PGHOST`, y no `localhost`. Se corrigió antes de versionar |
| H12 | Comandos abreviados sin `[transcrito]`, bloques sin comando, y un filtro `grep` sin declarar en el journal del timer | Los seis comandos abreviados se marcaron. Los bloques de AC-9/10/12, AC-17, AC-18 y AC-19 traen sus comandos, tomados del registro de la sesión. Se declaró el filtro, y se aclaró el `sha256` que imprime `crm-restore-check.sh` |
| H13 | AC-6 midió ICU `153.128.46` y producción tiene `153.121.44.8`, y la evidencia decía «es lo mismo» | Declarado como inferencia. El riesgo que esta corrección agregó estaba mal descrito; ver N2 |
| H14 | En el comando de `org:create` del README, `<correo>` lo rechazaba la shell y `'<organización>'` el script lo aceptaba | El README pide los valores con `read`, sin marcadores. El paso de variables por `sudo` se probó en el servidor con un valor con apóstrofo, sin tocar la base. La nota de esta evidencia que decía lo contrario se corrigió |

**Un defecto que no vio el revisor, encontrado al corregir H12.** El bloque «producción contra staging» de AC-19 **no era literal**: juntaba en uno la salida de dos comandos distintos, con otro formato, y no estaba marcado. Se reemplazó por los dos comandos con su salida literal, tomados del registro de la sesión. Las cifras no cambian: 12, 7, 0, y el control 12 de 12.

**Guardas**: 398 de 398, contra 397 antes: se sacaron 3 casos y se agregaron 4. **Intermitencia**: 2 de las 6 corridas completas dieron 1 falla, siempre en el mismo caso de `module-boundary.test.ts`: el primero, que arranca ESLint. Lo que se midió:
- en las corridas verdes ese caso tarda unos 5,7 s (5752 y 5659 ms), y el archivo solo, 4,7 s en total;
- en las que fallaron, llegó a 45 s y superó el `testTimeout` de 30 s.

**No lo causan estos cambios.** Contra el último commit (`4cc884e`), en un worktree aparte, ese mismo caso tardó 27,8 s en la primera corrida y 3,4 y 3,6 s en las siguientes. Arrancar ESLint en frío ya estaba al borde del límite de 30 s antes de esta tanda, y con la máquina cargada lo supera. Al final de la tanda se contaron 3 fallas en 9 corridas completas. No se agrandó el timeout, y queda como hallazgo aparte, fuera de la 13.1.

Ese worktree mostró además otra cosa, también ajena a la 13.1: al hacer el checkout en esta máquina, Git escribe los scripts con finales de línea CRLF (`core.autocrlf`), y la guarda de backup falla con 17 casos (`sort \ no está modelado`). La copia de trabajo actual tiene LF y pasa. Un `.gitattributes` que fije LF para `deploy/**` lo resolvería. Queda anotado.

**La verificación independiente de las correcciones.** La hizo otro agente, que no participó ni de la subfase, ni de la revisión, ni de las correcciones. Resultado:
- de los 14, 11 resueltos y 3 parciales (H10, H12 y H13), ninguno sin resolver;
- **H1 resuelto**, así que la regla de parada de D-11 ya no aplica;
- **7 hallazgos nuevos, todos menores**, ninguno sobre el instrumento de H-3.

El asistente verificó los 7 contra el código y el servidor, y los 7 se confirmaron. Se corrigieron así:

| # | Hallazgo | Corrección |
| --- | --- | --- |
| N1 | Ni el README ni el runbook creaban `/etc/crm-production/`. Sin el directorio, el rol se creaba con una contraseña que ningún archivo tiene | `install -d`, y la contraseña encadenada con `&&` a la escritura del archivo: si falla una, no corre la otra |
| N2 | El riesgo de ICU agregado por H13 estaba mal descrito. El real es que `pg_restore` sin `--create` toma la configuración regional de `template1`, y **una recuperación con el runbook perdía la ICU `es` de D-7** | Medido en el droplet y en un contenedor (AC-6, arriba). El runbook crea la base con ICU `es` en producción, y se retiró la afirmación falsa sobre AC-18, que también quedó en libc |
| N3 | La fila del runbook decía que la bajada no se hizo «como dice el punto 2», y el punto 2 ya describe ese camino | Reescrita |
| N4 | Los marcadores sin comillas del runbook (`<remoto>:<bucket>`, `<archivo de la clave privada>`) y del README (`<ref a desplegar>`) eran la misma clase de defecto que H14 | Reemplazados por `read` y variables. El paso 1 del README hace `unset SHA` primero, y se probó en local con un SHA, una rama y una referencia inexistente |
| N5 | El clonado remitía a un paso que no se puede usar ahí: corre en otra máquina y migra, compila y reinicia | Comando propio desde la máquina del operador, con `test -n` y la comparación de HEAD |
| N6 | Mediciones de las correcciones afirmadas sin salida en la evidencia | La subsección siguiente las trae, con comando y salida |
| N7 | Tres frases de estado viejas: «la revisión viene después», «al pie de la letra» sobre AC-21 y «SecurityModel se vuelve a tocar» | Actualizadas |

**Los tres parciales**:
- H10 se cerró con N3 y N4.
- H13 se cerró con N2.
- H12 se cerró declarando al principio de este archivo los bloques que siguen sin comando, porque salieron de guiones o comandos que no se registraron, y corrigiendo el `ls` de AC-19, que no traía el `ssh`.

Fuera de las correcciones, el verificador notó que `deploy/staging/README.md` dice que `contrib` trae `unaccent`. No se tocó: es staging y no es parte de la 13.1.

**Las decisiones del usuario, 2026-09-30**:
- **aceptó las correcciones y dio por cumplido el AC-23**, sin una tercera ronda de revisión;
- autorizó retener Node y PostgreSQL (H7). Quedó hecho; la salida está al final de la subsección siguiente;
- pidió registrar en Notion, para después de la 13.1, la nota de `contrib` del README de staging, el timeout de `module-boundary` y la regla de `.gitattributes` para `deploy/**`.

### Las mediciones de las correcciones, 2026-09-30

Las correcciones de arriba afirmaban mediciones que esta evidencia no traía (N6 de la verificación independiente). Acá van, con comando y salida literal. Todas son de solo lectura en el servidor, salvo que se diga otra cosa.

**H7, versiones y retención:**

```text
$ ssh crm-production 'apt-mark showhold; echo "---"; node --version; dpkg-query -W -f="\${Package} \${Version}\n" nodejs postgresql-18'
---
v24.21.0
nodejs 24.21.0-1nodesource1
postgresql-18 18.6-1.pgdg24.04+2
$ ssh crm-production 'systemctl is-enabled unattended-upgrades 2>&1; grep -v "^\s*//" /etc/apt/apt.conf.d/50unattended-upgrades | sed -n "/Allowed-Origins/,/};/p;/Origins-Pattern/,/};/p" | grep -v "^\s*$"; apt-cache policy nodejs postgresql-18 | grep -E "^[a-z]|Installed|Candidate"'
enabled
Unattended-Upgrade::Allowed-Origins {
	"${distro_id}:${distro_codename}";
	"${distro_id}:${distro_codename}-security";
	"${distro_id}ESMApps:${distro_codename}-apps-security";
	"${distro_id}ESM:${distro_codename}-infra-security";
};
nodejs:
  Installed: 24.21.0-1nodesource1
  Candidate: 24.21.0-1nodesource1
postgresql-18:
  Installed: 18.6-1.pgdg24.04+2
  Candidate: 18.6-1.pgdg24.04+2
```

`apt-mark showhold` no imprime nada antes del `---`. `unattended-upgrades` solo acepta los orígenes de Ubuntu y de ESM, sin `Origins-Pattern`. NodeSource y `pgdg` quedan fuera.

Con la autorización del usuario, después de aceptar el AC-23, se retuvieron los dos paquetes:

```text
$ ssh crm-production 'sudo apt-mark hold nodejs postgresql-18; echo "---"; apt-mark showhold'
nodejs set on hold.
postgresql-18 set on hold.
---
nodejs
postgresql-18
```

**H3, el paso 3 nuevo del README, en seco.** Se usaron los mismos `test`, y el checkout se reemplazó por un `echo`:

```text
$ for SHA in 938423d0a832e65eb9c42474c51a47a44c54689e c8fde194eea6bfaa39e6e758284b2ad1eabb959f ""; do echo "=== SHA='${SHA:0:7}'"; ssh crm-production "set -euo pipefail
test -n '$SHA'
sudo -u crm bash -c 'cd /srv/crm-production && echo simulado: git checkout --detach $SHA'
test \"\$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)\" = '$SHA' && echo 'desplegado: $SHA'"; echo "salida: $?"; done
=== SHA='938423d'
simulado: git checkout --detach 938423d0a832e65eb9c42474c51a47a44c54689e
desplegado: 938423d0a832e65eb9c42474c51a47a44c54689e
salida: 0
=== SHA='c8fde19'
simulado: git checkout --detach c8fde194eea6bfaa39e6e758284b2ad1eabb959f
salida: 1
=== SHA=''
salida: 1
```

**N4, el paso 1 nuevo del README**, en la máquina del operador:

```text
$ SHA=viejo; for entrada in 938423d main no-existe; do unset SHA; read -r REF <<< "$entrada"; SHA=$(git rev-parse --verify "$REF^{commit}" 2>/dev/null) && echo "$entrada -> SHA: $SHA" || echo "$entrada -> falló, SHA='${SHA:-}'"; done
938423d -> SHA: 938423d0a832e65eb9c42474c51a47a44c54689e
main -> SHA: 4cc884e63517d306e3a2cd85c0b96b038189dc70
no-existe -> falló, SHA=''
```

**H14, que `sudo` pasa las variables al `bash -c`**, con un apóstrofo en el valor y sin tocar la base:

```text
$ ssh crm-production 'ORG="Mi Org d'"'"'Prueba"; sudo ORG="$ORG" bash -c '"'"'printf "[%s]\n" "$ORG"; exec sudo -u crm --preserve-env=ORG bash -c "printf \"como crm: [%s]\n\" \"\$ORG\""'"'"''
[Mi Org d'Prueba]
como crm: [Mi Org d'Prueba]
```

**H11, el `backup.pgpass` real y los 11 archivos.** Del `pgpass` se leyeron solo los primeros cuatro campos, sin la contraseña:

```text
$ ssh crm-production 'sudo cut -d: -f1-4 /etc/crm-production/backup.pgpass'
127.0.0.1:5432:crm_production:crm_owner
$ ssh crm-production 'sudo grep -E "^PGHOST=" /etc/crm-production/backup.env'
PGHOST=127.0.0.1
```

El ciclo de los 11 archivos es el del runbook, §Producción, punto 5:

```text
crm-backup.sh OK
crm-backup-offsite.sh OK
crm-restore-check.sh OK
crm-production.service OK
crm-backup.service OK
crm-backup-offsite.service OK
crm-backup.timer OK
crm-restore-check.service OK
crm-restore-check.timer OK
nginx OK
postgresql OK
```

`[transcrito]`: el comando no se repite acá; es el del runbook.

**H8, la mutación con un directorio sin guarda.** Se creó `deploy/demo` vacío, se corrió cada guarda y se borró el directorio:

```text
$ mkdir deploy/demo && for g in proxy backup postgres; do printf "%s: " $g; npx vitest run --project guards tests/guards/staging-$g-config.test.ts 2>&1 | grep -E "^\s+Tests " ; done; rmdir deploy/demo; ls deploy
proxy:       Tests  2 failed | 38 passed (40)
backup:       Tests  2 failed | 114 passed (116)
postgres:       Tests  2 failed | 35 passed (37)
production
staging
```

**Datos de la app**: las claves de `app.env`, leídas sin valores:

```text
$ ssh crm-production 'sudo sed -n "s/=.*//p" /etc/crm-production/app.env; echo ---; sudo grep -E "^(TRUSTED_PROXY|NODE_ENV|PORT|HOSTNAME)=" /etc/crm-production/app.env'
DATABASE_URL
TRUSTED_PROXY
NODE_ENV
---
TRUSTED_PROXY=true
NODE_ENV=production
```

**N2** tiene sus dos bloques en AC-6, más arriba: la configuración regional de las bases del droplet y la prueba de `createdb` en un contenedor.
