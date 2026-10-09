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
# LIMITES DECLARADOS, para no confundir lo que esto comprueba con lo que no:
#
#   - **No compara ni un solo valor de columna, salvo uno**: desde la 17.5, cada imagen de
#     producto contra el sha256 que guardo al subirse (product_images.image; la miniatura no
#     tiene hash y no se comprueba). Del resto compara que esten las mismas tablas y
#     que tengan la misma cantidad de filas. Un dump con las filas correctas en cantidad
#     pero con contenido alterado pasa este ejercicio. Detectar eso exigiria comparar
#     sumas por tabla, y no esta hecho. Lo que si acota el riesgo es el `sha256` del
#     dump: si el archivo es el que el backup escribio, su contenido es el que era.
#   - **No compara indices, restricciones ni triggers.** Solo el dueno de las tablas.
#     Un indice que no se restaurara dejaria la base lenta, no incorrecta, y no se
#     notaria aca. El trigger `messages_insert_only` tampoco se ejercita.
#   - **Los recuentos del origen ya no son la referencia** (ver mas abajo): la referencia
#     es el manifiesto que el backup escribio junto al dump. Contra el origen solo se
#     compara el CONJUNTO DE TABLAS, que no deriva con el trafico.

set -euo pipefail

# A un directorio que `postgres` pueda leer. Sin esto, `sudo -u postgres` desde el HOME
# de otro usuario hace que `find` aborte con "Failed to restore initial working
# directory: Permission denied" -- y el ejercicio falla por el directorio desde el que
# se lo invoco, no por el backup. Encontrado ejecutandolo, no leyendolo.
cd /

# Este script NO lee /etc/crm-production/backup.env y no necesita ningun secreto: corre
# como `postgres` con autenticacion peer. Es deliberado -- el archivo de secretos es
# 0600 de root y `postgres` no puede leerlo, asi que hacerlo depender de el obligaria
# a correr el ejercicio como root. Un ejercicio de restauracion no necesita root.
ORIGEN=${CRM_DB:-crm_production}
BACKUP_DIR=${CRM_BACKUP_DIR:-/var/backups/crm-production}
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
# llenar no queda dando vueltas. `|| true` porque el trap corre tambien cuando la base
# nunca llego a crearse.
#
# Y DESPUES SE COMPRUEBA. Un `|| true` solo sobre el dropdb se traga el fallo y deja
# viva una copia de la base sin ninguna de las defensas del original -- justo lo que D-5
# existe para impedir. El caso concreto: una conexion abierta contra la base restaurada
# hace fallar el dropdb. Antes esta comprobacion vivia al final del camino feliz, o sea
# que no corria nunca en el unico camino donde el borrado puede fallar de verdad.
limpiar() {
  local estado=$?
  rm -rf "$TRABAJO"

  dropdb --if-exists "$DESTINO" 2>/dev/null || true

  if psql --dbname=postgres --tuples-only --no-align \
       --command="select 1 from pg_database where datname='$DESTINO'" 2>/dev/null \
       | grep -q 1; then
    echo "FALLA GRAVE: quedo viva la base $DESTINO." >&2
    echo "  Es una copia de los datos sin las defensas del original (brief-9.2, D-5)." >&2
    echo "  Borrala a mano: sudo -u postgres dropdb $DESTINO" >&2
    exit 1
  fi

  echo "OK: la base $DESTINO no existe"
  exit "$estado"
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

# Una sola sentencia, asi que los recuentos son consistentes entre si. Es la MISMA
# consulta que usa crm-backup.sh para escribir el manifiesto: si las dos divergieran,
# el ejercicio fallaria por la diferencia entre dos consultas y no por el backup.
recuentos() {
  psql --dbname="$1" --tuples-only --no-align --command="
    SELECT c.relname || ' ' ||
           (xpath('/row/cnt/text()',
                  query_to_xml(format('select count(*) as cnt from public.%I', c.relname),
                               false, true, '')))[1]::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname"
}

recuentos "$DESTINO" > "$TRABAJO/restaurado.txt"

# Contra QUE se compara, que es la decision entera de este ejercicio.
#
# Contra el manifiesto que el backup escribio junto al dump, NO contra los recuentos de
# la base de origen leidos ahora. El origen es un blanco movil: toda escritura posterior
# al dump lo mueve, y el ejercicio fallaria por trafico normal. Medido el 2026-09-22 al
# desplegar por primera vez el timer: fallo con `login_attempts 2 -> 0` y `sessions 4 -> 3`,
# escrituras legitimas de la aplicacion hechas despues del backup. El instrumento habria
# dado rojo todos los meses por un motivo que no es el backup, y un verificador que grita
# en falso deja de mirarse.
MANIFIESTO="$DUMP.recuentos"

if [[ -r $MANIFIESTO ]]; then
  referencia="$MANIFIESTO"
  echo
  echo "== recuentos: restaurado contra el manifiesto del dump =="
else
  # Dumps anteriores a que existiera el manifiesto, o un archivo suelto pasado a mano
  # (el control negativo, por ejemplo). Se compara contra el origen y se DICE que se
  # esta haciendo, porque esa comparacion puede fallar por deriva y no por el backup.
  referencia="$TRABAJO/origen.txt"
  recuentos "$ORIGEN" > "$referencia"
  echo
  echo "== recuentos: restaurado contra el ORIGEN (este dump no trae manifiesto) =="
  echo "   AVISO: una diferencia aca puede ser deriva posterior al dump, no un backup malo."
fi

cat "$referencia"

if ! diff -u "$referencia" "$TRABAJO/restaurado.txt" > "$TRABAJO/diferencia.txt"; then
  echo
  echo "FALLA: lo restaurado no coincide con la referencia" >&2
  cat "$TRABAJO/diferencia.txt" >&2
  exit 1
fi

tablas=$(wc -l < "$referencia")
if (( tablas == 0 )); then
  echo "FALLA: cero tablas. Una comparacion de dos conjuntos vacios pasa siempre" >&2
  exit 1
fi

# El manifiesto fija los recuentos, pero no puede detectar que al origen le HAYA APARECIDO
# una tabla nueva que el dump no traiga -- una migracion desplegada sin que el backup
# corriera despues, por ejemplo. El conjunto de tablas no deriva con el trafico, asi que
# esa comparacion si se puede hacer contra el origen sin alarmas falsas.
tablas_de() { cut -d' ' -f1 "$1" | sort; }

recuentos "$ORIGEN" > "$TRABAJO/origen-ahora.txt"
if ! diff -u <(tablas_de "$TRABAJO/origen-ahora.txt") <(tablas_de "$TRABAJO/restaurado.txt") \
     > "$TRABAJO/tablas.txt"; then
  echo
  echo "FALLA: el conjunto de tablas restaurado no es el del origen" >&2
  echo "       (el dump quedo atras de una migracion, o salio incompleto)" >&2
  cat "$TRABAJO/tablas.txt" >&2
  exit 1
fi

echo
echo "OK: $tablas tablas coinciden en existencia y en recuento"
echo "OK: el conjunto de tablas del origen es el mismo que el restaurado"

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

# --- El contenido de las imagenes (brief-17.5, D-10) ---------------------------
#
# Los recuentos no miran ningun valor. Una imagen de producto guarda al subirse el hash de
# su propio contenido, asi que cada una se compara contra el suyo, en la base restaurada:
# no contra el origen, que cambia con el trafico. Una imagen corrupta en el dump falla aca.
# La consulta es la misma que corre tests/integration/product-images.test.ts.
CONSULTA_IMAGENES="select count(*) from public.product_images where encode(sha256(image), 'hex') <> sha256"
alteradas=$(psql --dbname="$DESTINO" --tuples-only --no-align --command="$CONSULTA_IMAGENES")
if [[ $alteradas != "0" ]]; then
  echo "FALLA: $alteradas imagenes de producto no coinciden con su hash en lo restaurado." >&2
  exit 1
fi
echo "OK: cada imagen de producto coincide con su hash"

# --- El borrado ----------------------------------------------------------------
#
# No se borra aca: lo hace `limpiar`, que corre en TODOS los caminos y COMPRUEBA el
# resultado. Antes el borrado estaba duplicado -- una vez aca, comprobado, y otra en el
# trap con `|| true`, sin comprobar-- asi que el unico camino donde el dropdb puede
# fallar de verdad era el unico que no se miraba.
