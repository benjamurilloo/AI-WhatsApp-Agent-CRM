#!/usr/bin/env bash
#
# Backup logico de la base de staging (brief-9.2, D-3 y D-4).
#
# Por que existe: SecurityModel exige backup diario desde que hay un entorno
# persistente, y ese entorno existe desde la 9.1. Lo que esta subfase tiene que
# demostrar no es que el archivo aparezca, sino que se pueda restaurar: ese
# ejercicio vive en crm-restore-check.sh y este script solo produce el insumo.
#
# Quien lo corre: el rol DUENO (crm_owner), no el de la aplicacion. crm_app tiene
# los privilegios recortados a proposito -- ni un solo DELETE sobre audit_logs,
# inventory_movements ni messages (drizzle/0003, 0005, 0012)-- y un pg_dump hecho
# por quien no es dueno puede omitir objetos SIN FALLAR. Por eso AC-4 comprueba que
# el dump salio completo en vez de suponerlo.
#
# Los secretos no viajan ni por argv ni por el entorno: la contrasena vive en un
# .pgpass 0600 de root al que apunta PGPASSFILE. Un `pg_dump "postgres://user:pass@..."`
# habria dejado la contrasena visible en `ps` para cualquier usuario del sistema.
#
# Formato `custom` (-Fc) y no SQL plano: es el unico que permite restaurar
# selectivamente una tabla, que es el caso real de una emergencia.

set -euo pipefail

CONFIG=${CRM_BACKUP_CONFIG:-/etc/crm-staging/backup.env}

if [[ ! -r $CONFIG ]]; then
  echo "No se puede leer $CONFIG" >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a && . "$CONFIG" && set +a

: "${PGHOST:?falta PGHOST en la configuracion}"
: "${PGUSER:?falta PGUSER en la configuracion}"
: "${PGDATABASE:?falta PGDATABASE en la configuracion}"
: "${PGPASSFILE:?falta PGPASSFILE en la configuracion}"
: "${BACKUP_DIR:?falta BACKUP_DIR en la configuracion}"
: "${BACKUP_KEEP:?falta BACKUP_KEEP en la configuracion}"

if [[ ! $BACKUP_KEEP =~ ^[0-9]+$ ]] || (( BACKUP_KEEP < 1 )); then
  echo "BACKUP_KEEP tiene que ser un entero >= 1, es '$BACKUP_KEEP'" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

marca=$(date -u +%Y%m%dT%H%M%SZ)
destino="$BACKUP_DIR/${PGDATABASE}-${marca}.dump"
parcial="$destino.parcial"

# Se escribe a .parcial y se renombra al final. Sin esto, un corte a mitad del dump
# deja un archivo con nombre definitivo que la rotacion cuenta como copia valida y
# que nadie distingue de una buena hasta que hace falta.
limpiar() { rm -f "$parcial" "$parcial.recuentos"; }
trap limpiar EXIT

pg_dump --format=custom --no-password --file="$parcial"

# Manifiesto de recuentos, escrito INMEDIATAMENTE despues del dump.
#
# Por que existe: el ejercicio de restauracion tiene que comparar lo restaurado contra
# algo. Compararlo contra los recuentos de la base LEIDOS EN EL MOMENTO DEL EJERCICIO es
# compararlo contra un blanco movil: cualquier escritura de la aplicacion entre el backup
# y la comprobacion hace fallar el ejercicio por un motivo que no tiene nada que ver con
# el backup. Medido el 2026-09-22 al desplegar: el primer ejercicio por timer fallo con
# `login_attempts 2 -> 0` y `sessions 4 -> 3`, que eran escrituras normales posteriores
# al dump. Una alarma falsa en un verificador de backups es peor que no tenerlo: entrena
# a ignorarlo, que es exactamente el modo de falla que esta subfase existe para evitar.
#
# Es UNA sola sentencia, asi que sus recuentos son consistentes entre si (un snapshot).
# LIMITE DECLARADO Y MEDIDO: el dump ve la base como estaba al EMPEZAR, y esta consulta la
# ve al correr. Una escritura que entre en el medio queda en el manifiesto y no en el dump.
# La ventana va del inicio del dump al fin de esta consulta -- y no las horas que separaban
# el backup del ejercicio--, asi que crece con la duracion del dump. La 9.3 NO la midio
# (evaluacion 10.1, R-10). La midio la 13.2 el 2026-09-30, en el droplet de produccion y no
# en este servidor, con una base de 78 MB y 96.016 mensajes: entre 2,28 y 2,62 s, de los
# que el dump son entre 2,10 y 2,43 s (docs/decisions/evidencia-13.2-mediciones.md). No se
# midio con escrituras concurrentes: es una duracion, no una frecuencia de diferencias.
psql --no-password --tuples-only --no-align --command="
  SELECT c.relname || ' ' ||
         (xpath('/row/cnt/text()',
                query_to_xml(format('select count(*) as cnt from public.%I', c.relname),
                             false, true, '')))[1]::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname" > "$parcial.recuentos"

if [[ ! -s $parcial.recuentos ]]; then
  echo "El manifiesto de recuentos salio vacio: la base no tiene tablas o psql fallo" >&2
  exit 1
fi

mv "$parcial" "$destino"
mv "$parcial.recuentos" "$destino.recuentos"
trap - EXIT

sha256sum "$destino" | awk '{print $1}' > "$destino.sha256"

# El dump lo escribe root, pero el ejercicio de restauracion corre como `postgres`
# (crm-restore-check.sh explica por que). Sin esto los archivos quedan 0600 de root y
# el ejercicio no puede leer lo que tiene que restaurar -- falla por permisos, no por
# el backup, que es la peor clase de rojo: el que hace desconfiar del instrumento
# equivocado. No agrega exposicion: `postgres` es superusuario de la base y ya podia
# leer esos mismos datos en la base misma.
if [[ -n ${BACKUP_GROUP:-} ]]; then
  chgrp "$BACKUP_GROUP" "$destino" "$destino.sha256" "$destino.recuentos"
  chmod 0640 "$destino" "$destino.sha256" "$destino.recuentos"
fi

echo "backup: $destino"
echo "tamano: $(stat -c %s "$destino") bytes"
echo "sha256: $(cat "$destino.sha256")"

# Rotacion. Se ordena por nombre, que es cronologico porque la marca es UTC en formato
# ISO basico -- y se ORDENA de verdad: `find` entrega en orden de directorio, que no
# esta garantizado. `head -n -N` deja pasar todo MENOS las N ultimas lineas, o sea todo
# menos las N copias mas nuevas: lo que sale por la tuberia es lo que se borra.
#
# Los dos eslabones son fragiles de la misma forma: `sort -r` o `head -n N` (sin signo)
# invierten el sentido y borran exactamente lo que habia que conservar, sin fallar y sin
# avisar. Por eso la guarda SIMULA esta tuberia en vez de buscarla como texto
# (tests/guards/staging-backup-config.test.ts).
sobrantes=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PGDATABASE}-*.dump" \
  | sort \
  | head -n "-$BACKUP_KEEP")

if [[ -n $sobrantes ]]; then
  while IFS= read -r viejo; do
    rm -f "$viejo" "$viejo.sha256" "$viejo.recuentos"
    echo "rotado: $viejo"
  done <<< "$sobrantes"
else
  echo "rotado: nada (hay <= $BACKUP_KEEP copias)"
fi
