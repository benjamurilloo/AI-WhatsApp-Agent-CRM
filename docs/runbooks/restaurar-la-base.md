# Runbook — restaurar la base desde un backup

Procedimiento de recuperación de `crm_staging` ([brief-9.2](../decisions/brief-9.2-backups-y-restauracion.md)).

**Este texto se ejecuta, no se lee.** Si algo acá no funciona, el defecto es del runbook y se corrige acá. Ya pasó dos veces el 2026-09-22, y las dos correcciones están abajo en su lugar.

**Qué está ejecutado y qué no**, porque la diferencia importa más que el texto:

| Sección | Estado |
| --- | --- |
| Ejercicio mensual | **ejecutado** el 2026-09-22, salidas en [evidencia-9.2](../decisions/evidencia-9.2-backups.md) — pero con la versión del script que todavía llevaba `--no-owner`. La versión corregida, que además comprueba el dueño, **no está corrida en el servidor** |
| Comprobar que el ejercicio puede fallar | **ejecutado**, y encontró un defecto en este mismo runbook |
| Comprobar servidor contra repositorio | **ejecutado** |
| Crear los roles en una **máquina nueva** | **diseñado, no ejecutado** — no hay una segunda máquina donde probarlo |
| Timer del ejercicio mensual | **versionado, no desplegado** — los archivos están en `deploy/staging/`, el servidor todavía no los tiene |
| **Recuperación real** (renombrar la base viva) | **ejecutada** el 2026-09-22 como simulacro, de punta a punta: la aplicación quedó corriendo sobre la base restaurada y se verificó con un **ingreso autenticado** desde afuera. Encontró dos defectos en este runbook, corregidos arriba |

## Antes de empezar: tres trampas que ya costaron tiempo

**1. Los roles son objetos del SERVIDOR, no de la base, y `pg_dump` no los trae.** El dump trae los `ALTER TABLE ... OWNER TO crm_owner` y los `GRANT ... TO crm_app`, pero no los `CREATE ROLE`: eso lo haría `pg_dumpall`, que no es lo que corre acá. Restaurar en un servidor donde esos roles no existen **falla** con `--exit-on-error`. Es la misma trampa que en la 9.1 hizo que `drizzle-kit migrate` saliera con código 1 sin imprimir un solo error.

Esto **solo pasa en una máquina nueva** — que es, justamente, el único escenario en el que la copia de fuera del droplet sirve de algo. En el droplet actual los dos roles ya existen y este paso no hace nada.

```
# Los DOS, y en este orden. El dueño primero porque la base va a ser suya.
sudo -u postgres psql -c "CREATE ROLE crm_owner NOLOGIN;"
sudo -u postgres psql -c "CREATE ROLE crm_app NOLOGIN;"

# Comprobarlo antes de seguir: si falta uno, pg_restore aborta a mitad de camino
# y deja una base a medio llenar que hay que borrar a mano.
sudo -u postgres psql -tAc \
  "select rolname from pg_roles where rolname in ('crm_owner','crm_app') order by 1"
```

Los dos tienen que aparecer. Falta un tercero, **el rol con login del que se conecta la aplicación**, miembro de `crm_app`: no hace falta para restaurar, pero sí para que la aplicación levante después. Su nombre y su contraseña están en `DATABASE_URL` de `/etc/crm-staging/app.env` y se crean como dice el paso 5 de [deploy/staging/README.md](../../deploy/staging/README.md) — no se inventan acá.

> **Sin verificar**: este bloque está *ejecutado* en la parte que el simulacro del 2026-09-22 recorrió, que fue la restauración en el droplet, donde los roles ya existían. La creación de roles en una máquina nueva está **diseñada, no ejecutada**. Es la diferencia que separa este runbook de estar probado de punta a punta, y se cierra cuando haya una segunda máquina donde probarlo.

**2. Restaurar sobre una base con datos no funciona.** Choca por clave primaria y deja la base a medio llenar. La restauración va **siempre** a una base nueva y vacía. Si hay que reemplazar la base viva, se restaura al lado y se renombra — nunca se restaura encima.

**3. No uses `--no-owner` en una recuperación real.** Deja las tablas propiedad de `postgres` en vez de `crm_owner`. La aplicación anda igual, así que parece que salió bien — y **el próximo despliegue que traiga una migración falla** con `must be owner of table clients`, muy lejos en el tiempo del momento en que se causó. Medido el 2026-09-22 en el simulacro: con `--no-owner`, `crm_owner` no puede alterar ni una tabla; sin él, el dueño se preserva y las migraciones siguen funcionando.

## Recuperación real: la base de staging se perdió o se corrompió

```
# 1. Elegir el backup. Están ordenados por nombre, que es cronológico (UTC, ISO básico).
sudo ls -lh /var/backups/crm-staging/

# 2. Comprobar que el archivo está entero ANTES de tocar nada.
#    Si esto no coincide, el backup está corrupto: probar con el anterior.
cd /var/backups/crm-staging
sha256sum -c <(printf '%s  %s\n' "$(cat ELEGIDO.dump.sha256)" ELEGIDO.dump)

# 3. Parar la aplicación. Restaurar con la app escribiendo deja un estado mezclado.
sudo systemctl stop crm-staging

# 4. Restaurar AL LADO, no encima. SIN --no-owner: ver el recuadro de abajo.
#    -O crm_owner: la base nueva tiene que ser del dueño, no de `postgres`. En el
#    droplet da igual porque después se renombra sobre la vieja; en una máquina nueva
#    no, y es donde se nota.
sudo -u postgres createdb -O crm_owner crm_staging_nueva
sudo -u postgres pg_restore --dbname=crm_staging_nueva --exit-on-error \
  /var/backups/crm-staging/ELEGIDO.dump

# 5. Mirar antes de cambiar nada. Si algo de esto no da lo esperado, PARAR acá:
#    la base vieja todavía existe y todavía se puede volver atrás.
sudo -u postgres psql -d crm_staging_nueva -c "select count(*) from users;"
sudo -u postgres psql -d crm_staging_nueva -c "select count(*) from messages;"

#    Y comprobar que las DEFENSAS sobrevivieron, que es lo que nadie mira:
sudo -u postgres psql -d crm_staging_nueva -tAc \
  "select distinct tableowner from pg_tables where schemaname='public';"   # -> crm_owner
sudo -u postgres psql -d crm_staging_nueva -c \
  "SET ROLE crm_app; DELETE FROM audit_logs;"                             # -> permission denied

# 6. Recién ahora, el cambio. La base vieja se CONSERVA con otro nombre:
#    es la única forma de volver atrás si la restauración resultó peor.
sudo -u postgres psql -d postgres <<'SQL'
ALTER DATABASE crm_staging RENAME TO crm_staging_rota;
ALTER DATABASE crm_staging_nueva RENAME TO crm_staging;
SQL

# 7. Levantar y comprobar por la puerta de entrada, no por la base.
sudo systemctl start crm-staging
curl -sI https://staging.vixoraai.app/login | head -1
```

**No borres `crm_staging_rota` el mismo día.** Es lo único que permite deshacer. Se borra cuando la base restaurada lleve un tiempo funcionando y alguien lo decida a propósito.

> **En un simulacro es al revés.** Ahí `crm_staging_rota` no está rota: es la original sana, y la «restaurada» es una copia suya. Dejar las dos invita a confundir cuál es cuál, así que **un simulacro termina borrando la copia sobrante** y dejando una sola base. La regla de arriba es para una recuperación de verdad, donde la vieja sí está rota y es la única red.

## Ejercicio mensual: comprobar que el backup sirve

Esto es lo que evita que un backup roto se descubra el día de la emergencia. Es **mensual y ejecutado**, no documentado (D-3).

Lo dispara `crm-restore-check.timer`, el día 1 a las 04:30 UTC — después del backup de las 03:15, para que ejercite la copia de esa misma madrugada y no la de ayer.

```
systemctl list-timers crm-restore-check.timer     # ¿cuándo corre el próximo?
journalctl -u crm-restore-check.service -n 80     # ¿cómo salió el último?
```

> **Por qué está agendado y no a mano.** Hasta la revisión independiente de la 9.2, esta sección decía «mensual» y no había nada que lo disparara: dependía de que alguien se acordara. O sea que la parte automatizada era la que *produce* el archivo y la parte manual era la única que distingue un backup de un archivo cualquiera — el mismo modo de falla que este brief denuncia en el backup, trasladado un nivel arriba.

A mano se corre igual, y es lo que hay que hacer después de tocar el script o el backup:

```
sudo -u postgres /usr/local/bin/crm-restore-check.sh
```

El script crea una base nueva, restaura el último dump **sin `--no-owner`**, compara la lista de tablas y el recuento fila por fila contra el origen, comprueba que el dueño de las tablas restauradas sea el mismo que en el origen, y **borra la base al terminar**. Sale distinto de cero si algo no coincide.

Si falla, el backup no sirve y hay que averiguar por qué **antes** de necesitarlo. El fallo más probable no es que el archivo esté corrupto: es que el dump salga incompleto porque cambió el rol con el que corre.

### Comprobar que el ejercicio puede fallar

Un chequeo que no puede fallar no es un chequeo. Una vez por año, o cuando se toque el script, se corre contra un dump roto a propósito:

```
cp /var/backups/crm-staging/ULTIMO.dump /tmp/roto.dump
entero=$(stat -c %s /tmp/roto.dump)
truncate -s $((entero / 2)) /tmp/roto.dump
stat -c %s /tmp/roto.dump          # tiene que ser la mitad; si no, PARAR acá
sudo -u postgres /usr/local/bin/crm-restore-check.sh /tmp/roto.dump ; echo "salida: $?"
rm -f /tmp/roto.dump
```

Tiene que salir **distinto de cero**. Si sale cero, el problema es el chequeo, no el dump.

> **No uses `truncate -s 50%`.** La primera versión de este runbook lo decía y **no trunca nada**: falla con `Invalid number: '50%'`, y dentro de una cadena `cp && truncate` el error se traga sin que se note. El ejercicio corre entonces contra el archivo intacto, pasa en verde, y uno se queda creyendo que comprobó que el chequeo puede fallar. Se descubrió ejecutando esto el 2026-09-22 — por eso está el `stat` en el medio, para que el tamaño se vea antes de sacar conclusiones.

## Qué hay y dónde

| Qué | Dónde |
| --- | --- |
| Copias | `/var/backups/crm-staging/*.dump` con su `.sha256` |
| Script de backup | `/usr/local/bin/crm-backup.sh` ← `deploy/staging/crm-backup.sh` |
| Script del ejercicio | `/usr/local/bin/crm-restore-check.sh` ← `deploy/staging/crm-restore-check.sh` |
| Timer del backup | `crm-backup.timer`, diario 03:15 UTC, `Persistent=true` |
| Timer del ejercicio | `crm-restore-check.timer`, día 1 a las 04:30 UTC, `Persistent=true` |
| Credencial | `/etc/crm-staging/backup.env` y su `.pgpass`, `0600` de `root` |

```
systemctl list-timers crm-backup.timer     # ¿cuándo corre la próxima?
journalctl -u crm-backup.service -n 50     # ¿cómo salió la última?
```

## Comprobar que el servidor tiene lo que el repositorio dice

Ninguna guarda puede hacerlo: un test lee el repositorio, no la máquina. Es manual a propósito — es el punto 2 del alcance del [brief-9.2](../decisions/brief-9.2-backups-y-restauracion.md), no un criterio de aceptación, y un test que fingiera cubrirlo sería peor que no tenerlo.

```
for f in crm-backup.sh crm-restore-check.sh; do
  ssh crm-staging "sudo cat /usr/local/bin/$f" | diff - "deploy/staging/$f" && echo "$f OK"
done
for f in crm-backup.service crm-backup.timer crm-restore-check.service crm-restore-check.timer; do
  ssh crm-staging "sudo cat /etc/systemd/system/$f" | diff - "deploy/staging/$f" && echo "$f OK"
done
```

## Lo que este runbook NO cubre

- **Restaurar al volumen real.** Staging tiene datos sintéticos y pocos. El tiempo de restauración que sale acá no predice el de una base con volumen; esa medición es de la [9.3](../planning/Roadmap.md).
- **Restaurar en un servicio gestionado.** Podría exigir superusuario para `createdb` o para los `GRANT`. Está sin verificar y condiciona la elección de hosting de producción.
- **La copia fuera del droplet.** Es manual (D-1, opción b): si la máquina de destino no está encendida, ese día no hay copia externa.
- **Que alguien sepa hacer esto bajo presión.** Un ejercicio en calma no es un simulacro.
