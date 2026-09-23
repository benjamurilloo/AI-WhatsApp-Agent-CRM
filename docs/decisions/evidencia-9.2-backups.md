# Evidencia de runtime — subfase 9.2

Salidas de la verificación de backup y restauración en `staging.vixoraai.app`, con el comando que las produjo.

**Crudo y transcrito no son lo mismo.** Cada bloque transcrito está marcado **`[transcrito]`** y dice qué se elidió; lo que no lleva marca es copia literal de la terminal. La regla viene de los hallazgos N-8 y T-5 de la 9.1, donde este mismo tipo de documento presentó como crudo lo que estaba compuesto a mano.

- **Capturado**: 2026-09-22
- **Servidor**: `ubuntu-s-1vcpu-1gb-nyc1`
- **Rol del dump**: `crm_owner` (el dueño, no el de la aplicación — brief-9.2, D-4)

---

## AC-1 — el backup corre y produce un archivo legible

```
$ sudo systemctl start crm-backup.service
$ systemctl show crm-backup.service -p Result -p ExecMainStatus --value
success 0

$ sudo journalctl -u crm-backup.service -n 15 --no-pager -o cat
Starting crm-backup.service - AI WhatsApp Agent CRM - backup logico de staging...
backup: /var/backups/crm-staging/crm_staging-20260922T204124Z.dump
tamano: 55980 bytes
sha256: 07112d7cb085b8ed46cfd1504474b63d771de02a10cee83ec8e59a4ea05ef692
rotado: nada (hay <= 7 copias)
crm-backup.service: Deactivated successfully.
Finished crm-backup.service - AI WhatsApp Agent CRM - backup logico de staging.

$ sudo ls -l /var/backups/crm-staging/
-rw-r----- 1 root postgres 55980 Sep 22 20:41 crm_staging-20260922T204124Z.dump
-rw-r----- 1 root postgres    65 Sep 22 20:41 crm_staging-20260922T204124Z.dump.sha256

$ sudo -u postgres pg_restore -l <el dump>
;     dbname: crm_staging
;     TOC Entries: 139
;     Compression: gzip
;     Format: CUSTOM
;     Dumped from database version: 18.6 (Ubuntu 18.6-1.pgdg24.04+2)
```

El formato es `CUSTOM`, que es el que permite restaurar selectivamente una tabla. Un dump en SQL plano no lo permite y en una emergencia eso importa.

## AC-2 — el backup se dispara solo, sin que nadie lo arranque

Se armó un **timer temporal** (`OnActiveSec=30`) apuntando al mismo servicio, se esperó sin tocar nada y se retiró después. Se hizo así y no editando el timer real para no desviar la configuración desplegada de la versionada ni siquiera por un minuto.

```
$ sudo journalctl -u crm-backup.service --since "-4 min" --no-pager -o short
Sep 22 20:44:55 ... systemd[1]: Starting crm-backup.service ...
Sep 22 20:44:56 ... crm-backup.sh[7220]: backup: /var/backups/crm-staging/crm_staging-20260922T204455Z.dump
Sep 22 20:44:56 ... crm-backup.sh[7220]: tamano: 55980 bytes
Sep 22 20:44:56 ... crm-backup.sh[7220]: sha256: 0e37109a870b9d06cf6ee0cd2870b3f0e606e987bcd1b0abc59f04e83d261b57
Sep 22 20:44:56 ... crm-backup.sh[7220]: rotado: nada (hay <= 7 copias)
Sep 22 20:44:56 ... systemd[1]: Finished crm-backup.service ...
```

Nadie ejecutó ese backup. El timer real quedó en pie:

```
$ systemctl list-timers "crm-backup*" --no-pager
NEXT                        LEFT LAST PASSED UNIT             ACTIVATES
Wed 2026-09-23 03:18:16 UTC   6h -         - crm-backup.timer crm-backup.service
```

## AC-3, AC-4 y AC-6 — la restauración, verificada por contenido

```
$ sudo -u postgres /usr/local/bin/crm-restore-check.sh
== dump ==
archivo: /var/backups/crm-staging/crm_staging-20260922T204124Z.dump
sha256:  07112d7cb085b8ed46cfd1504474b63d771de02a10cee83ec8e59a4ea05ef692

== restauracion a una base nueva: crm_staging_restore_check_20260922T204210Z ==
pg_restore termino sin error

== recuentos por tabla ==
origen (crm_staging):
audit_logs 0
clients 6
conversations 10
ingestion_credentials 0
ingestion_events 0
ingestion_rate_windows 0
inventories 0
inventory_movements 0
login_attempts 0
messages 26
organization_members 3
organizations 1
products 0
sessions 3
users 3

OK: 15 tablas coinciden en existencia y en recuento
OK: la base crm_staging_restore_check_20260922T204210Z fue borrada
SALIDA: 0
```

Las 15 tablas del origen existen en la restauración con el mismo recuento fila por fila.

> **Esta corrida es histórica y el razonamiento que la acompañaba era falso.** Decía: «la comparación es contra el origen leído en ese momento, y **vale porque staging no tiene tráfico concurrente**». Desplegar el timer lo desmintió el mismo día — el ejercicio falló por dos escrituras normales de la aplicación posteriores al dump. La premisa deja de valer en cuanto alguien usa la aplicación, que es todo el tiempo. Desde la corrección, el ejercicio compara contra un manifiesto escrito junto al dump; ver «Despliegue de las correcciones» al final de este documento.

### El primer intento falló, y el defecto era del script

```
$ sudo -u postgres /usr/local/bin/crm-restore-check.sh
find: Failed to restore initial working directory: /home/benja: Permission denied
SALIDA: 1
```

`sudo -u postgres` desde el `$HOME` de otro usuario deja a `find` sin poder volver al directorio inicial. Se corrigió con un `cd /` al principio del script. **Es el motivo por el que el runbook se ejecuta en vez de escribirse de memoria**: escrito de memoria, este comando habría quedado publicado como si funcionara.

## AC-5 — el control negativo, y por qué la primera versión no controlaba nada

**Primer intento, que pasó cuando tenía que fallar:**

```
$ cp <dump> /tmp/roto.dump
$ truncate -s 50% /tmp/roto.dump
$ /usr/local/bin/crm-restore-check.sh /tmp/roto.dump
...
OK: 15 tablas coinciden en existencia y en recuento
SALIDA: 0
```

Salida 0 contra un dump que se creía roto. **El dump no estaba roto**: `truncate -s 50%` no trunca al 50 %, falla con `Invalid number: '50%'`, y como estaba en una cadena `cp && truncate` sin `set -e` el error se tragó y el ejercicio corrió contra el archivo **intacto**.

Es el hallazgo más útil de la subfase y es exactamente lo que AC-5 existe para atrapar: **una verificación que no puede fallar no distingue un backup bueno de sí misma rota**. Si AC-5 no existiera, la conclusión habría sido «el ejercicio pasa», que es verdadera y no significa nada.

**Segundo intento, con truncado real** — **`[transcrito]`**. Se elidió la ruta completa del dump, y las anotaciones `<-` las agregué yo: no las imprimió ninguna orden. La última orden tampoco está literal; abajo se explica por qué.

```
$ stat -c %s <dump>
55980
$ truncate -s 50% /tmp/pad.dump
truncate: Invalid number: '50%'
$ stat -c %s /tmp/pad.dump
55980                       <- anotación mía: no cambió

$ truncate -s 27990 /tmp/roto.dump
$ stat -c %s /tmp/roto.dump
27990                       <- anotación mía: esto sí trunca

$ /usr/local/bin/crm-restore-check.sh /tmp/roto.dump
== restauracion a una base nueva: crm_staging_restore_check_20260922T204251Z ==
pg_restore: error: could not read from input file: end of file
SALIDA: 1
```

La comprobación de que no quedó base huérfana se corrió así, y **la palabra `ninguna` la imprimió el `echo`, no `psql`**: con `-tAc` y cero filas, `psql` no imprime ninguna palabra, imprime una línea vacía. La primera versión de esta evidencia mostraba `ninguna` como si fuera salida de `psql`, que es el defecto N-8/T-5 de la 9.1 repetido por tercera vez en este linaje de documentos.

```
$ psql -d postgres -tAc "select datname from pg_database where datname like '%restore_check%'" | grep . || echo "ninguna"
ninguna
```

Dos cosas: el ejercicio **falla** contra un dump truncado, y **no deja base huérfana** aunque `pg_restore` reviente a la mitad. Lo segundo prueba el `trap` bajo fallo, que es cuando importa.

## AC-7 — la rotación borra las viejas y conserva las nuevas

Se crearon nueve dumps falsos con fecha forzada, más los dos reales, y se corrió el backup con `BACKUP_KEEP=7`.

**`[transcrito]`**: se elidieron el host y el resto de los campos de `journalctl` (reemplazados por `...`), y las anotaciones `<- real` las agregué yo — `ls -1` no las imprime.

```
$ sudo journalctl -u crm-backup.service --no-pager -o short
Sep 22 20:43:14 ... rotado: /var/backups/crm-staging/crm_staging-20260915T000000Z.dump
Sep 22 20:43:14 ... rotado: /var/backups/crm-staging/crm_staging-20260916T000000Z.dump
Sep 22 20:43:14 ... rotado: /var/backups/crm-staging/crm_staging-20260917T000000Z.dump
Sep 22 20:43:14 ... rotado: /var/backups/crm-staging/crm_staging-20260918T000000Z.dump

$ sudo ls -1 /var/backups/crm-staging/*.dump
crm_staging-20260919T000000Z.dump
crm_staging-20260920T000000Z.dump
crm_staging-20260921T000000Z.dump
crm_staging-20260922T000000Z.dump
crm_staging-20260922T204124Z.dump      <- real
crm_staging-20260922T204314Z.dump      <- real
crm_staging-20260923T000000Z.dump
```

El par completo: borró exactamente los 4 más viejos y **conservó los 7 más nuevos**, incluidos los dos reales. Los `.sha256` acompañaron a sus dumps y no quedó ninguno huérfano (7 dumps, 7 sumas).

**La secuencia completa, que la primera versión no dejaba reconstruir** (R-10). Leída del journal, que registra cada rotación:

```
$ sudo journalctl -u crm-backup.service -o short-iso --since '20:40' --until '20:56' | grep -E 'backup:|rotado:'
20:41:24 backup: .../crm_staging-20260922T204124Z.dump
20:41:24 rotado: nada (hay <= 7 copias)
20:43:14 backup: .../crm_staging-20260922T204314Z.dump
20:43:14 rotado: .../crm_staging-20260915T000000Z.dump
20:43:14 rotado: .../crm_staging-20260916T000000Z.dump
20:43:14 rotado: .../crm_staging-20260917T000000Z.dump
20:43:14 rotado: .../crm_staging-20260918T000000Z.dump
20:44:56 backup: .../crm_staging-20260922T204455Z.dump
20:44:56 rotado: nada (hay <= 7 copias)
```

A las 20:43:14 quedaron 7 copias, así que el backup de las 20:44:56 debería haber sido el octavo y rotado uno — y dice «nada». **La explicación es que entre medio borré a mano los 5 dumps falsos que quedaban**, y eso no estaba escrito. Se confirma por ausencia: la rotación registra en el journal cada archivo que borra, y **no hay ninguna línea `rotado:` para esos cinco**, así que no los borró el script. Hoy el directorio no tiene ningún dump falso.

La aritmética de AC-7 no depende de esto: el par que importa —4 borrados, 7 conservados, los 7 lexicográficamente mayores— está en las dos salidas de arriba y se sostiene solo.

## AC-8 — la copia fuera del droplet

```
$ scp crm-staging:/var/backups/crm-staging/crm_staging-20260922T204314Z.dump ~/crm-backups/

sha256 en el servidor:  6495b375fd4d9f8e53bbb3b1838cb3d0ce1843f96e54163cc2b70289b42c3675
sha256 de la copia:     6495b375fd4d9f8e53bbb3b1838cb3d0ce1843f96e54163cc2b70289b42c3675
```

Idénticos. **Cuál dump es, que la primera versión elidía** (R-18 de la revisión): el de las 20:43:14, el de AC-7 — no el de AC-1 (`07112d7c…`, 20:41:24) ni el de AC-2 (`0e37109a…`, 20:44:55). Los tres hashes son distintos porque son tres dumps distintos, y sin el nombre del archivo esa diferencia parecía una contradicción. Comprobado el 2026-09-22 con `sha256sum` sobre los cinco dumps del servidor. La copia vive en `~/crm-backups/`, **fuera del repositorio**, para que no haya forma de que termine en un commit.

**Limitación, no detalle**: esta copia es manual (D-1, opción b). Si la máquina de destino no está encendida, ese día no hay copia externa. El almacenamiento de objetos queda registrado como requisito antes de producción.

## Lo desplegado es lo versionado — punto 2 del alcance

Esto **no es AC-11**. La primera versión de este documento lo tituló así y el runbook repitió la etiqueta (R-4 de la revisión independiente); AC-11 es la mutación de la guarda y está en la sección siguiente. El diff contra el servidor es el punto 2 del alcance del brief, que existe porque ninguna guarda puede leer la máquina.

```
$ ssh crm-staging "sudo cat /usr/local/bin/crm-backup.sh"        | diff - deploy/staging/crm-backup.sh
$ ssh crm-staging "sudo cat /usr/local/bin/crm-restore-check.sh" | diff - deploy/staging/crm-restore-check.sh
$ ssh crm-staging "sudo cat /etc/systemd/system/crm-backup.service" | diff - deploy/staging/crm-backup.service
$ ssh crm-staging "sudo cat /etc/systemd/system/crm-backup.timer"   | diff - deploy/staging/crm-backup.timer
```

Los cuatro sin diferencias **cuando se corrió, el 2026-09-22 antes de la revisión**. Se comprobaron también los dos de la 9.1 —`nginx-crm-staging.conf` y `crm-staging.service`— y seguían idénticos.

> **Ya no vale, y es deliberado.** Las correcciones de la revisión cambiaron `crm-restore-check.sh` (se le quitó `--no-owner` y se le agregó la comprobación de dueño), un comentario de `crm-backup.sh`, y agregaron `crm-restore-check.service` y `.timer`, que el servidor todavía no tiene. **El repositorio va adelante del servidor**: desplegarlo es un efecto sobre la máquina y necesita autorización aparte. Hasta que se despliegue y este diff se vuelva a correr, el nivel de la 9.2 es **validado localmente** para lo corregido y **validado en staging** solo para lo que se midió antes de corregir.

## AC-11 — la guarda detecta las regresiones que dice detectar

Diez mutaciones **ejecutadas** sobre los archivos reales, una por forma sintáctica, con el resultado antes y después. «Antes» es la guarda tal como estaba al terminar la implementación (20 casos); «después», la reescrita tras la revisión (42 casos). Los archivos se restauraron desde copia después de cada mutación y `git status` quedó limpio al final.

| # | Mutación | Qué causaría en producción | Antes | Después |
| --- | --- | --- | --- | --- |
| M1 | `sort` → `sort -r` en la rotación | **borra las 3 copias más nuevas** y conserva las viejas | 20/20 verde | **5 fallan** |
| M2 | `head -n "-$BACKUP_KEEP"` → `head -n "$BACKUP_KEEP"` | borra las 7 más nuevas | 20/20 verde | **7 fallan** |
| M3 | quitar la etapa `\| sort` | el resultado depende del orden del directorio | 20/20 verde | **3 fallan** |
| M4 | quitar `set -euo pipefail` de `crm-backup.sh` | un `pg_dump` fallido se renombra como copia buena y el servicio sale 0 | 20/20 verde | **1 falla** |
| M5 | `OnCalendar=*-*-*` → `*-*-01` | el backup diario pasa a mensual, sin que nada se queje | 20/20 verde | **1 falla** |
| M6 | devolver `--no-owner` al ejercicio | el ejercicio deja de ensayar la restitución de dueño | no cubierto | **1 falla** |
| M7 | `sort` → `shuf` | herramienta desconocida: el simulador no puede opinar | 20/20 verde | **9 fallan** |
| M8 | timer del ejercicio: `*-*-01` → `*-*-*` | el ejercicio pasa a crear y borrar una base todos los días | no existía | **1 falla** |
| M9 | ejercicio a las 02:30 en vez de 04:30 | ejercita la copia de ayer y nunca la de hoy | no existía | **1 falla** |
| M10 | quitar `[Install] WantedBy` del timer del ejercicio | habilitado nunca arranca | no existía | **1 falla** |

**M1 es el hallazgo de la subfase.** Cinco caracteres, la subcadena que la guarda buscaba intacta, y el caso que debía atraparlo se llamaba literalmente «la rotación conserva las más nuevas, no las más viejas». Es la **quinta** vez que este patrón aparece en el proyecto —después de superficie expuesta (8.4), resumen de usuarios (9.0.1), nombres de despliegue (9.1) y proxy de staging (9.1)— y la primera en una guarda escrita **el mismo día** que la regla de mutación que la habría evitado. Las cinco veces lo encontró una revisión independiente.

Lo que cambió para que M1..M3 y M7 se detecten: la guarda ya no busca el texto de la tubería, la **extrae del script, la interpreta y la ejecuta** sobre diez nombres sintéticos, afirmando qué archivos sobrevivirían. Ante una orden que no conoce, falla en vez de dejarla pasar. Eso es lo que hace que M7 se ponga roja sin que nadie haya previsto `shuf`.

**Lo que esta sección no demuestra**: que la guarda cubra todas las formas posibles. Cubre las diez de arriba, medidas. Un `find` con `-newer`, un `awk` intercalado o una rotación reescrita en otro lenguaje caen en el caso «orden desconocida», que falla — pero eso es detención, no cobertura.

## AC-12 — los secretos

```
$ sudo ls -l /etc/crm-staging/
-rw------- 1 root root 225 Sep 22 14:28 app.env
-rw------- 1 root root 183 Sep 22 20:40 backup.env
-rw------- 1 root root  68 Sep 22 20:40 backup.pgpass
-rw------- 1 root root  94 Sep 22 14:19 migrate.env
-rw------- 1 root root  48 Sep 22 15:30 seed.env

$ ls -ld /var/backups/crm-staging
drwxr-x--- 2 root postgres 4096 Sep 22 20:40 /var/backups/crm-staging
```

La contraseña del rol dueño **no viaja por `argv` ni por el entorno**: vive en `backup.pgpass`, al que apunta `PGPASSFILE`. Un `pg_dump "postgres://user:pass@..."` la habría dejado visible en `ps` para cualquier usuario del sistema.

El directorio es `0750 root:postgres` y los dumps `0640 root:postgres`, para que el ejercicio de restauración pueda leerlos corriendo como `postgres` sin ser root. **No agrega exposición**: `postgres` es superusuario de la base y ya podía leer esos mismos datos en la base misma.

## Simulacro de recuperación completa — ejecutado

El procedimiento de recuperación del runbook, de punta a punta, con la aplicación quedando sobre la base restaurada. **Encontró dos defectos en el runbook**, los dos corregidos.

### Defecto 1: `--no-owner` rompe las migraciones futuras

El runbook decía `pg_restore --no-owner`. Medido:

```
$ sudo -u postgres psql -d crm_staging_nueva -tAc \
    "select distinct tableowner from pg_tables where schemaname='public'"
postgres                     <- deberia ser crm_owner

$ sudo -u postgres psql -d crm_staging_nueva -c "SET ROLE crm_owner; ALTER TABLE clients ADD COLUMN prueba_9_2 text;"
SET
ERROR:  must be owner of table clients
```

La aplicación **andaría igual**: lee y escribe por `crm_app`, que conserva sus privilegios. Lo que se rompe es el **próximo despliegue con migraciones**, muy lejos en el tiempo del momento en que se causó. Es la peor clase de defecto: el que no se manifiesta cuando se comete.

Sin `--no-owner`, con el mismo dump:

```
$ sudo -u postgres pg_restore --dbname=crm_staging_nueva --exit-on-error <dump>
$ ... select distinct tableowner ...
crm_owner

$ ... "SET ROLE crm_owner; ALTER TABLE clients ADD COLUMN prueba_9_2 text; ALTER TABLE clients DROP COLUMN prueba_9_2;"
ALTER TABLE
ALTER TABLE

$ ... "SET ROLE crm_app; DELETE FROM audit_logs;"
SET
ERROR:  permission denied for table audit_logs
```

El par completo: el dueño recupera su capacidad de migrar **y** el rol de la aplicación sigue sin poder borrar `audit_logs`. **Las defensas del ADR 0013 sobreviven a la restauración**, que es algo que nadie había comprobado.

### Defecto 2: el runbook no mandaba comprobar las defensas

Los pasos de verificación miraban recuentos de filas. Un dump puede traer todas las filas y ninguna de las defensas. Se agregaron las dos comprobaciones de arriba al paso 5.

### El renombrado y la vuelta al servicio

```
$ sudo -u postgres psql -d postgres
ALTER DATABASE crm_staging RENAME TO crm_staging_rota;
ALTER DATABASE crm_staging_nueva RENAME TO crm_staging;
ALTER DATABASE
ALTER DATABASE

$ sudo systemctl start crm-staging && systemctl is-active crm-staging
active

$ curl -s -o /dev/null -w "%{http_code}" https://staging.vixoraai.app/login
200
```

### La prueba que decide: un ingreso autenticado contra la base restaurada

`/api/health` devolver `ok` no prueba que la aplicación lea la base. Un ingreso sí.

```
[transcrito] Salida de un script de Playwright corrido desde la maquina del usuario
contra la URL publica. El script no quedo versionado; las tres lineas son las que imprimio.
url:      https://staging.vixoraai.app/
visible:  O Organización de ejemplo Dashboard Productos Clientes Conversaciones
          Lectura de ejemplo (viewer) Sistema Claro Oscuro Salir Dashb
cookie:   __Host-crm_session secure=true httpOnly=true
```

La aplicación **leyó** `users` de la base restaurada, verificó el hash de la contraseña, **escribió** una sesión y sirvió el dashboard. Antes de eso, un ingreso fallido había dejado su rastro en la misma base (`login_attempts`: 0 → 1 de alcance `account` y 1 de alcance `ip`), que es lo que prueba que la aplicación está conectada a **esa** base y no a otra.

### Secuencias: la trampa que no aplica acá

```
$ sudo -u postgres psql -d crm_staging -tAc "select sequencename, last_value from pg_sequences where schemaname = 'public'"
$
```

**`(ninguna fila)` era una anotación mía y no salida de `psql`.** Con `-tAc` y cero filas la orden no imprime nada: vuelve el prompt. `psql` sí imprime `(0 rows)` en su modo normal, pero `-t` lo suprime — es exactamente la clase de detalle que, escrito de memoria, hace que una evidencia diga algo que la terminal nunca dijo.

El esquema no tiene secuencias —los identificadores son UUID—, así que el clásico «la restauración dejó la secuencia atrás y los INSERT chocan» no aplica. **Aplicaría** el día que alguna tabla use una columna de identidad.

### Estado final

```
$ sudo -u postgres psql -d postgres -tAc "select datname from pg_database where datname like 'crm%'"
crm_staging
```

Una sola base. La copia del simulacro se borró: en un simulacro `crm_staging_rota` no está rota, es la original sana, y dejar las dos invita a confundir cuál es cuál. En una recuperación real se conserva, y el runbook ahora distingue los dos casos.

---

## Despliegue de las correcciones — 2026-09-22, y el defecto que encontró

Desplegar lo corregido no fue un trámite: el primer ejercicio disparado **por la unidad**, y no a mano, falló. Queda acá porque es el hallazgo más instructivo de la ronda.

```
$ sudo systemctl start crm-restore-check.service
...
FALLA: lo restaurado no coincide con el origen
-login_attempts 2
+login_attempts 0
-sessions 4
+sessions 3
```

El backup estaba sano. Lo que fallaba era el **instrumento**: comparaba lo restaurado contra los recuentos del origen **leídos en ese momento**, y entre el dump y la comprobación la aplicación había escrito un intento de ingreso y una sesión. El script declaraba ese límite en su encabezado —«los recuentos del origen se leen AHORA»— y yo lo había dado por aceptable razonando que en staging no hay tráfico concurrente. Ejecutarlo mostró que la premisa es falsa en cuanto alguien usa la aplicación, y que con el timer mensual esto habría dado rojo casi todos los meses **por un motivo que no es el backup**.

Es el mismo patrón que R-1, R-5 y R-6: un instrumento que existe, corre, y no hace lo que se espera de él. La diferencia es que este solo aparece cuando se lo dispara de verdad.

**La corrección**: `crm-backup.sh` escribe un `.recuentos` junto al dump, en **una sola sentencia** (recuentos consistentes entre sí) e inmediatamente después del `pg_dump`; el ejercicio compara contra ese manifiesto. Contra el origen se compara solo el **conjunto de tablas**, que no deriva con el tráfico y detecta el caso que el manifiesto no puede ver: una migración desplegada sin que el backup volviera a correr.

**Límite declarado y medible**, porque esto no es atómico: entre el fin del `pg_dump` y la consulta del manifiesto puede entrar una escritura. La ventana pasó de *horas* (backup a las 03:15, ejercicio a las 04:30) a *la que separa dos órdenes consecutivas*. Con volumen crece con la duración del dump, y se vuelve a medir en la 9.3.

### Después de corregir

```
$ sudo systemctl start crm-restore-check.service
Result=success   ExecMainStatus=0

OK: 15 tablas coinciden en existencia y en recuento
OK: el conjunto de tablas del origen es el mismo que el restaurado
OK: las tablas restauradas siguen siendo de crm_owner
OK: la base crm_staging_restore_check_20260922T230630Z no existe
```

La tercera línea es la que prueba que quitar `--no-owner` (R-5) hace lo que tenía que hacer: el dueño se restituye y la próxima migración no va a fallar.

### Que el ejercicio pueda fallar, por las dos vías

**`[transcrito]`**: se elidieron rutas y las líneas intermedias del diff.

```
$ truncate -s 27998 /tmp/roto.dump            # el dump a la mitad
$ sudo -u postgres /usr/local/bin/crm-restore-check.sh /tmp/roto.dump
pg_restore: error: could not read from input file: end of file
SALIDA: 1

$ sed -i "s/^messages 26$/messages 99/" /tmp/manifiesto.dump.recuentos   # el manifiesto miente
$ sudo -u postgres /usr/local/bin/crm-restore-check.sh /tmp/manifiesto.dump
-messages 99
+messages 26
SALIDA: 1

$ sudo -u postgres psql -d postgres -tAc "select datname from pg_database where datname like '%restore_check%'" | grep . || echo "(psql no imprimio nada: no hay ninguna)"
(psql no imprimio nada: no hay ninguna)
```

El segundo control es nuevo y hacía falta: sin él, el manifiesto podría no compararse con nada y el ejercicio pasaría igual.

### El camino de fallo del borrado (R-16)

`dropdb --if-exists … || true` se tragaba el fallo, y la comprobación de no-existencia vivía al final del **camino feliz** — o sea que no corría nunca en el único camino donde el borrado puede fallar de verdad. Se reprodujo el fallo abriendo una conexión contra la base antes de borrarla:

```
$ createdb "$B"; psql --dbname="$B" -c "select pg_sleep(25)" &   # conexion abierta
$ dropdb --if-exists "$B" 2>/dev/null || true
$ psql -d postgres -tAc "select 1 from pg_database where datname='$B'" | grep -q 1 && echo DETECTADO
DETECTADO: quedo viva la base crm_staging_restore_check_pruebafallo
```

Ahora el borrado y su comprobación viven los dos en el `trap`, que corre en **todos** los caminos, y el script sale distinto de cero si la base sobrevive.

### El paso 2 del runbook no se podía ejecutar (R-2)

La comprobación de integridad —el primer comando de una recuperación real, el que decide si el backup sirve— estaba escrita sin `sudo`:

```
$ cd /var/backups/crm-staging
bash: line 1: cd: /var/backups/crm-staging: Permission denied
$ cat /var/backups/crm-staging/<elegido>.dump.sha256
cat: ...: Permission denied
```

El directorio es `drwxr-x--- root:postgres` y el operador está en `sudo`, no en `postgres`. Un `sudo` delante de cada orden tampoco alcanza: la sustitución `$(cat …)` corre en el shell del usuario. La forma corregida, ejecutada, con su control negativo:

```
$ sudo bash -c 'cd /var/backups/crm-staging && sha256sum -c <(printf "%s  %s\n" "$(cat ELEGIDO.dump.sha256)" ELEGIDO.dump)'
crm_staging-20260922T230050Z.dump: OK
SALIDA: 0

$ printf ZZZZ >> /tmp/x.dump && sudo bash -c 'cd /tmp && sha256sum -c <(...)'
x.dump: FAILED
sha256sum: WARNING: 1 computed checksum did NOT match
SALIDA: 1
```

### Cinco mutaciones más sobre la guarda

Las de la conducta nueva, ejecutadas sobre los archivos reales. Con las diez de AC-11 son **quince**.

| # | Mutación | Qué causaría | Resultado |
| --- | --- | --- | --- |
| M11 | quitar la escritura del manifiesto | el ejercicio vuelve a compararse contra un blanco móvil | **1 falla** |
| M12 | quitar el corte del manifiesto vacío | un manifiesto vacío hace pasar el ejercicio siempre | **1 falla** |
| M13 | el ejercicio se compara contra el origen otra vez | la alarma falsa vuelve | **1 falla** |
| M14 | las dos consultas de recuento divergen | el ejercicio falla por la diferencia entre dos consultas, no por el backup | **1 falla** |
| M15 | la rotación deja huérfanos los `.recuentos` | el directorio acumula manifiestos de dumps borrados | **1 falla** |

### El servidor tiene lo que el repositorio dice

```
crm-backup.sh OK              crm-backup.service OK            nginx-crm-staging.conf OK (9.1)
crm-restore-check.sh OK       crm-backup.timer OK              crm-staging.service OK (9.1)
                              crm-restore-check.service OK
                              crm-restore-check.timer OK
```

Los ocho sin diferencias, comprobado después de desplegar. Y los dos timers agendados:

```
$ systemctl list-timers 'crm-*' --all
NEXT                             LEFT         UNIT                     ACTIVATES
Wed 2026-09-23 03:15:47 UTC      4h 18min     crm-backup.timer         crm-backup.service
Thu 2026-10-01 04:33:18 UTC      1 week 1 day crm-restore-check.timer  crm-restore-check.service
```

## Lo que esta evidencia **no** demuestra

- **Que la restauración funcione al volumen real.** La base son 55 KB y 26 mensajes. El tiempo de restauración que sale acá no predice nada; esa medición es de la 9.3.
- **Que los datos restaurados sean los reales.** Son sintéticos.
- **Que el backup sobreviva a la pérdida del droplet**, salvo por la copia manual de AC-8 y con su limitación declarada.
- **Que alguien sepa restaurar bajo presión.** El runbook se ejecutó una vez, en calma, por quien lo escribió. Un simulacro anunciado no es un incidente.
- **Que la recuperación funcione con la base en uso.** El simulacro paró la aplicación primero. Una recuperación con escrituras en vuelo es otra cosa y no se probó.
