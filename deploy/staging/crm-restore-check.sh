#!/usr/bin/env bash
#
# Ejercicio de restauracion (brief-9.2, D-5 y D-6). Es el entregable real de la
# subfase: un backup no esta validado hasta que se restaura y se comprueba que lo
# restaurado sirve.
#
# Que hace, y por que cada paso:
#   1. Crea una base NUEVA Y VACIA. SecurityModel:163 pide un entorno aislado, "no el
#      mismo entorno del backup". Ademas una restauracion sobre una base con datos
#      chocaria por clave primaria, asi que "aislada" no es solo higiene.
#   2. Restaura ahi el dump.
#   3. Compara CONTENIDO -- la lista de tablas y el recuento fila por fila -- contra
#      la base de origen. Comparar el codigo de salida de pg_restore no es evidencia:
#      es el modo de falla clasico de los backups, el cron en verde durante meses
#      sobre un dump incompleto.
#   4. BORRA la base restaurada, pase lo que pase. Dejarla viva es crear una segunda
#      copia de los datos sin ninguna de las defensas del original.
#
# Control negativo (AC-5): contra un dump truncado esto TIENE que fallar. Una
# verificacion que no puede fallar no distingue un backup bueno de si misma rota.
#
# Se corre como `postgres` (autenticacion peer, sin contrasena en ningun lado):
# crear y borrar una base exige CREATEDB, que el rol dueno no tiene a proposito.
#
# LIMITE DECLARADO: los recuentos del origen se leen AHORA, no en el instante del
# dump. Eso vale en staging porque no hay trafico concurrente. En produccion la
# comparacion necesita un metodo consistente con el snapshot, y este script NO lo es.

set -euo pipefail

# A un directorio que `postgres` pueda leer. Sin esto, `sudo -u postgres` desde el HOME
# de otro usuario hace que `find` aborte con "Failed to restore initial working
# directory: Permission denied" -- y el ejercicio falla por el directorio desde el que
# se lo invoco, no por el backup. Encontrado ejecutandolo, no leyendolo.
cd /

# Este script NO lee /etc/crm-staging/backup.env y no necesita ningun secreto: corre
# como `postgres` con autenticacion peer. Es deliberado -- el archivo de secretos es
# 0600 de root y `postgres` no puede leerlo, asi que hacerlo depender de el obligaria
# a correr el ejercicio como root. Un ejercicio de restauracion no necesita root.
ORIGEN=${CRM_DB:-crm_staging}
BACKUP_DIR=${CRM_BACKUP_DIR:-/var/backups/crm-staging}
DUMP=${1:-}

if [[ -z $DUMP ]]; then
  DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${ORIGEN}-*.dump" | sort | tail -n 1)
fi

if [[ -z $DUMP || ! -r $DUMP ]]; then
  echo "No hay un dump legible que restaurar (probe: ${DUMP:-<ninguno>})" >&2
  exit 1
fi

DESTINO="${ORIGEN}_restore_check_$(date -u +%Y%m%dT%H%M%SZ)"
TRABAJO=$(mktemp -d)

# El borrado va en un trap: si la restauracion revienta a la mitad, la base a medio
# llenar no queda dando vueltas. `|| true` porque el trap corre tambien cuando la
# base nunca llego a crearse.
limpiar() {
  dropdb --if-exists "$DESTINO" 2>/dev/null || true
  rm -rf "$TRABAJO"
}
trap limpiar EXIT

echo "== dump =="
echo "archivo: $DUMP"
echo "sha256:  $(sha256sum "$DUMP" | awk '{print $1}')"

echo
echo "== restauracion a una base nueva: $DESTINO =="
createdb "$DESTINO"
# SIN --no-owner, a proposito. Con ese flag las tablas quedan de `postgres` en vez de
# `crm_owner`: los recuentos coinciden, la aplicacion anda, el ejercicio sale en verde
# -- y la proxima migracion falla con `must be owner of table clients`, muy lejos en el
# tiempo del momento en que se causo. Medido el 2026-09-22 en el simulacro. Un ejercicio
# que restaura distinto de como restaura una recuperacion real no ensaya la recuperacion
# real. Exige que el rol dueno EXISTA en el servidor: eso es parte de lo que se ensaya.
pg_restore --dbname="$DESTINO" --exit-on-error "$DUMP"
echo "pg_restore termino sin error"

# --- Comparacion por contenido -------------------------------------------------

recuentos() {
  local base=$1
  local tabla
  while IFS= read -r tabla; do
    [[ -z $tabla ]] && continue
    printf '%s %s\n' "$tabla" \
      "$(psql --dbname="$base" --tuples-only --no-align --command="select count(*) from public.\"$tabla\"")"
  done < <(psql --dbname="$base" --tuples-only --no-align \
    --command="select tablename from pg_tables where schemaname='public' order by 1")
}

recuentos "$ORIGEN" > "$TRABAJO/origen.txt"
recuentos "$DESTINO" > "$TRABAJO/restaurado.txt"

echo
echo "== recuentos por tabla =="
echo "origen ($ORIGEN):"
cat "$TRABAJO/origen.txt"

if ! diff -u "$TRABAJO/origen.txt" "$TRABAJO/restaurado.txt" > "$TRABAJO/diferencia.txt"; then
  echo
  echo "FALLA: lo restaurado no coincide con el origen" >&2
  cat "$TRABAJO/diferencia.txt" >&2
  exit 1
fi

tablas=$(wc -l < "$TRABAJO/origen.txt")
if (( tablas == 0 )); then
  echo "FALLA: cero tablas. Una comparacion de dos conjuntos vacios pasa siempre" >&2
  exit 1
fi

echo
echo "OK: $tablas tablas coinciden en existencia y en recuento"

# --- Las defensas, no solo los datos -------------------------------------------
#
# Un dump restaurado con los datos correctos y el dueno equivocado pasa cualquier
# comparacion de recuentos. El sintoma aparece una migracion despues, y para entonces
# nadie lo asocia con la restauracion. Comparar contra el ORIGEN y no contra un nombre
# escrito a mano evita que este chequeo se vuelva obsoleto si el rol cambia de nombre.
duenos=$(psql --dbname="$DESTINO" --tuples-only --no-align --command="select distinct tableowner from pg_tables where schemaname='public' order by 1")
esperado=$(psql --dbname="$ORIGEN" --tuples-only --no-align --command="select distinct tableowner from pg_tables where schemaname='public' order by 1")

if [[ $duenos != "$esperado" ]]; then
  echo "FALLA: las tablas restauradas son de [$duenos] y en el origen son de [$esperado]." >&2
  echo "       La proxima migracion fallaria con: must be owner of table ..." >&2
  exit 1
fi

echo "OK: las tablas restauradas siguen siendo de $duenos"

# --- El borrado, comprobado ----------------------------------------------------

dropdb "$DESTINO"
trap - EXIT
rm -rf "$TRABAJO"

if psql --dbname=postgres --tuples-only --no-align \
     --command="select 1 from pg_database where datname='$DESTINO'" | grep -q 1; then
  echo "FALLA: la base de restauracion sigue existiendo" >&2
  exit 1
fi

echo "OK: la base $DESTINO fue borrada"
