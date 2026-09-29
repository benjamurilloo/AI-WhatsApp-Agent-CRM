#!/usr/bin/env bash
#
# Copia externa del backup de produccion (brief-13.1, D-8; brief-9.2, D-1 opcion c).
#
# Sube al object storage la ultima copia CIFRADA que dejo crm-backup.sh, y nada mas: nunca el
# dump en claro. Corre en su propia unidad, disparada por OnSuccess= de crm-backup.service, por
# una razon de aislamiento: el backup no tiene red (IPAddressDeny=any) y esta subida si. Separar
# las dos deja al proceso que lee la base sin salida a internet, y al que tiene salida sin acceso
# a la base ni al dump en claro.
#
# Retencion externa: borra del remoto lo que tenga mas de OFFSITE_KEEP_DAYS dias. Es la unica
# forma de que el bucket no crezca para siempre, y va aca y no en una regla de la consola del
# proveedor para que este versionada y la guarda la vea. Borrar por antiguedad no puede vaciar el
# bucket aunque los backups se corten durante semanas: este script solo corre despues de un
# backup exitoso (OnSuccess=) y acaba de subir una copia de hoy, que no tiene antiguedad.

set -euo pipefail

CONFIG=${CRM_BACKUP_CONFIG:-/etc/crm-production/backup.env}

if [[ ! -r $CONFIG ]]; then
  echo "No se puede leer $CONFIG" >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a && . "$CONFIG" && set +a

: "${PGDATABASE:?falta PGDATABASE en la configuracion}"
: "${BACKUP_DIR:?falta BACKUP_DIR en la configuracion}"
: "${OFFSITE_REMOTE:?falta OFFSITE_REMOTE en la configuracion}"
: "${OFFSITE_KEEP_DAYS:?falta OFFSITE_KEEP_DAYS en la configuracion}"
: "${RCLONE_CONFIG:?falta RCLONE_CONFIG en la configuracion}"

if [[ ! $OFFSITE_KEEP_DAYS =~ ^[0-9]+$ ]] || (( OFFSITE_KEEP_DAYS < 7 )); then
  echo "OFFSITE_KEEP_DAYS tiene que ser un entero >= 7, es '$OFFSITE_KEEP_DAYS'" >&2
  exit 1
fi

ultima=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PGDATABASE}-*.dump.age" | sort | tail -n 1)

if [[ -z $ultima ]]; then
  echo "No hay ninguna copia cifrada que subir en $BACKUP_DIR" >&2
  exit 1
fi

# Se sube el .age, su suma y el manifiesto de recuentos. El manifiesto tiene nombres de tabla y
# cantidades de filas, ningun dato de un cliente, y es lo que permite verificar una restauracion
# hecha desde el bucket sin acceso al servidor.
base=${ultima%.age}
for archivo in "$ultima" "$ultima.sha256" "$base.recuentos"; do
  rclone copyto --config "$RCLONE_CONFIG" "$archivo" "$OFFSITE_REMOTE/$(basename "$archivo")"
done

# La subida se COMPRUEBA, no se supone: el remoto tiene que devolver el mismo tamano que el
# archivo local. rclone copyto sale 0 ante ciertos cortes silenciosos de algunos backends.
local_bytes=$(stat -c %s "$ultima")
remoto_bytes=$(rclone size --config "$RCLONE_CONFIG" --json "$OFFSITE_REMOTE/$(basename "$ultima")" \
  | sed -E 's/.*"bytes":([0-9]+).*/\1/')

if [[ $local_bytes != "$remoto_bytes" ]]; then
  echo "FALLA: el remoto tiene $remoto_bytes bytes y el local $local_bytes" >&2
  exit 1
fi

echo "subido: $(basename "$ultima") ($local_bytes bytes)"

rclone delete --config "$RCLONE_CONFIG" --min-age "${OFFSITE_KEEP_DAYS}d" "$OFFSITE_REMOTE"
echo "retencion externa: se borro lo de mas de $OFFSITE_KEEP_DAYS dias"
