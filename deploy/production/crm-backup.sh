#!/usr/bin/env bash
#
# Backup logico de la base de produccion (brief-13.1, D-8).
#
# Es el script de staging (deploy/staging/crm-backup.sh, brief-9.2) con UNA diferencia: despues
# del dump, lo CIFRA con `age` para la clave publica del operador. La copia cifrada es la unica
# que sale del servidor (crm-backup-offsite.sh); la privada vive fuera del droplet, con el
# operador. Asi, quien tenga el bucket no puede leer el dump, y quien tenga el droplet no puede
# descifrar las copias viejas del bucket. Todo lo demas -- por que el rol dueno, por que -Fc, por
# que .parcial, por que el manifiesto -- esta explicado en el script de staging y no se repite.
#
# La copia en claro se queda en el disco del droplet, junto a la base que ya contiene esos mismos
# datos: la usa el ejercicio mensual de restauracion. D-5 pide no activar los backups ni los
# snapshots de disco del proveedor, para que ese disco no se copie fuera sin cifrar.

set -euo pipefail

CONFIG=${CRM_BACKUP_CONFIG:-/etc/crm-production/backup.env}

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
: "${BACKUP_AGE_RECIPIENTS:?falta BACKUP_AGE_RECIPIENTS en la configuracion}"

if [[ ! $BACKUP_KEEP =~ ^[0-9]+$ ]] || (( BACKUP_KEEP < 1 )); then
  echo "BACKUP_KEEP tiene que ser un entero >= 1, es '$BACKUP_KEEP'" >&2
  exit 1
fi

# Sin la clave publica no hay copia que pueda salir del servidor. Se falla ANTES del dump: un
# backup que no se puede cifrar es un backup que se queda solo en el disco, y eso tiene que ser
# rojo, no un dump en claro con el timer en verde.
if [[ ! -s $BACKUP_AGE_RECIPIENTS ]]; then
  echo "No hay clave publica de age en $BACKUP_AGE_RECIPIENTS" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

marca=$(date -u +%Y%m%dT%H%M%SZ)
destino="$BACKUP_DIR/${PGDATABASE}-${marca}.dump"
parcial="$destino.parcial"

limpiar() { rm -f "$parcial" "$parcial.recuentos" "$parcial.age"; }
trap limpiar EXIT

pg_dump --format=custom --no-password --file="$parcial"

# Manifiesto de recuentos, escrito inmediatamente despues del dump (ver el script de staging).
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

# Cifrado, antes de renombrar: la copia cifrada nace junto con la clara y con el mismo destino
# de .parcial, asi que un corte a mitad no deja un .age con nombre definitivo.
age --encrypt --recipients-file "$BACKUP_AGE_RECIPIENTS" --output "$parcial.age" "$parcial"

if [[ ! -s $parcial.age ]]; then
  echo "La copia cifrada salio vacia" >&2
  exit 1
fi

mv "$parcial" "$destino"
mv "$parcial.recuentos" "$destino.recuentos"
mv "$parcial.age" "$destino.age"
trap - EXIT

sha256sum "$destino" | awk '{print $1}' > "$destino.sha256"
sha256sum "$destino.age" | awk '{print $1}' > "$destino.age.sha256"

if [[ -n ${BACKUP_GROUP:-} ]]; then
  chgrp "$BACKUP_GROUP" "$destino" "$destino.sha256" "$destino.recuentos"
  chmod 0640 "$destino" "$destino.sha256" "$destino.recuentos"
fi

echo "backup: $destino"
echo "tamano: $(stat -c %s "$destino") bytes"
echo "sha256: $(cat "$destino.sha256")"
echo "cifrado: $destino.age ($(stat -c %s "$destino.age") bytes)"

# Rotacion local, identica a la de staging: se ordena por nombre, que es cronologico, y
# `head -n -N` deja pasar todo menos las N copias mas nuevas. La guarda SIMULA esta tuberia
# (tests/guards/staging-backup-config.test.ts). La copia externa tiene su propia retencion, en
# crm-backup-offsite.sh.
sobrantes=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PGDATABASE}-*.dump" \
  | sort \
  | head -n "-$BACKUP_KEEP")

if [[ -n $sobrantes ]]; then
  while IFS= read -r viejo; do
    rm -f "$viejo" "$viejo.sha256" "$viejo.recuentos" "$viejo.age" "$viejo.age.sha256"
    echo "rotado: $viejo"
  done <<< "$sobrantes"
else
  echo "rotado: nada (hay <= $BACKUP_KEEP copias)"
fi
