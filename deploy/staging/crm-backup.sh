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
limpiar() { rm -f "$parcial"; }
trap limpiar EXIT

pg_dump --format=custom --no-password --file="$parcial"

mv "$parcial" "$destino"
trap - EXIT

sha256sum "$destino" | awk '{print $1}' > "$destino.sha256"

# El dump lo escribe root, pero el ejercicio de restauracion corre como `postgres`
# (crm-restore-check.sh explica por que). Sin esto los archivos quedan 0600 de root y
# el ejercicio no puede leer lo que tiene que restaurar -- falla por permisos, no por
# el backup, que es la peor clase de rojo: el que hace desconfiar del instrumento
# equivocado. No agrega exposicion: `postgres` es superusuario de la base y ya podia
# leer esos mismos datos en la base misma.
if [[ -n ${BACKUP_GROUP:-} ]]; then
  chgrp "$BACKUP_GROUP" "$destino" "$destino.sha256"
  chmod 0640 "$destino" "$destino.sha256"
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
    rm -f "$viejo" "$viejo.sha256"
    echo "rotado: $viejo"
  done <<< "$sobrantes"
else
  echo "rotado: nada (hay <= $BACKUP_KEEP copias)"
fi
