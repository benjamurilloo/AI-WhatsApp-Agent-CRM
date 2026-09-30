#!/usr/bin/env bash
# 13.2.2, paso 4: la medición. Corre como root. Contra crm_medicion_test; lo único que escribe
# son las transacciones que medir-caminos revierte. No toca /srv/crm-production ni crm_production.
set -uo pipefail
date -u +%Y-%m-%dT%H:%M:%SZ

DIR=/var/lib/crm-production/medicion
OUT=$DIR/salida-13.2
VIGIA=$(mktemp)
TMPD=$(mktemp -d)
(
  while true; do
    printf '%s %s %s\n' "$(date -u +%H:%M:%S)" \
      "$(curl -s -o /dev/null -m 10 -w '%{http_code} %{time_total}' https://crm.vixoraai.app/login || true)" \
      "$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
    sleep 5
  done
) > "$VIGIA" &
VIGIA_PID=$!
trap 'kill $VIGIA_PID 2>/dev/null || true; rm -rf "$VIGIA" "$TMPD"' EXIT

DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env)
export DATABASE_URL
case "$DATABASE_URL" in
  */crm_medicion_test) ;;
  *) echo "la URL no apunta a crm_medicion_test: no se sigue" >&2; exit 1 ;;
esac
test ! -e "$DIR/.env" || exit 1
sudo -u crm mkdir -p "$OUT"
como_crm() {
  sudo -H -u crm --preserve-env=DATABASE_URL,CRM_PLANES,CRM_CONTROL bash -c "cd '$DIR' && $1"
}

medir() { # ordinal-hex, nombre
  local org="5eed0000-$1-4000-8000-000000000021" nombre=$2
  echo "--- $nombre ($org)"
  como_crm "npx tsx scripts/medir-caminos.ts $org 'producción, $nombre' > '$OUT/tiempos-$nombre.md' 2> '$OUT/tiempos-$nombre.err'"
  echo "tiempos $nombre: salida $?"
  export CRM_PLANES="$OUT/planes-$nombre.md"
  como_crm "npx tsx scripts/medir-caminos.ts $org 'producción, $nombre' > '$OUT/planes-$nombre.log' 2>&1"
  echo "planes $nombre: salida $?, $(stat -c %s "$OUT/planes-$nombre.md" 2>/dev/null || echo 0) bytes"
  unset CRM_PLANES
}
medir 0000 grande
medir 0004 chica
medir 0014 concentrada

echo "--- el control negativo de los planes (tiene que salir con 1)"
export CRM_PLANES="$OUT/control.md" CRM_CONTROL=sin-planes
como_crm "npx tsx scripts/medir-caminos.ts 5eed0000-0014-4000-8000-000000000021 control > '$OUT/control.log' 2>&1"
echo "control: salida $?"
tail -5 "$OUT/control.log"
unset CRM_PLANES CRM_CONTROL

echo "--- la ventana del manifiesto (AC-15), con los dos comandos de crm-backup.sh"
PGPASSWORD=$(printf '%s' "$DATABASE_URL" | sed 's|^postgres://crm_medicion:\([^@]*\)@.*$|\1|')
export PGPASSWORD PGHOST=127.0.0.1 PGUSER=crm_medicion PGDATABASE=crm_medicion_test
unset DATABASE_URL
for vuelta in 1 2 3; do
  T0=$(date +%s.%N)
  pg_dump --format=custom --no-password --file="$TMPD/medicion.dump"
  T1=$(date +%s.%N)
  psql --no-password --tuples-only --no-align --command="
    SELECT c.relname || ' ' ||
           (xpath('/row/cnt/text()',
                  query_to_xml(format('select count(*) as cnt from public.%I', c.relname),
                               false, true, '')))[1]::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname" > "$TMPD/medicion.recuentos"
  T2=$(date +%s.%N)
  awk -v a="$T0" -v b="$T1" -v c="$T2" -v v="$vuelta" -v s="$(stat -c %s "$TMPD/medicion.dump")" -v l="$(wc -l < "$TMPD/medicion.recuentos")" \
    'BEGIN { printf "vuelta %s: dump %.2f s (%d bytes), recuentos %.2f s (%d tablas), ventana %.2f s\n", v, b-a, s, c-b, l, c-a }'
done
unset PGPASSWORD PGHOST PGUSER PGDATABASE

echo "--- lo que quedó en $OUT"
ls -l "$OUT" | awk 'NR>1 {print $5, $9}'
grep -c . "$OUT"/*.err

echo "--- crm_production contra la línea de base (vacío = igual)"
RECUENTOS="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as filas from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
sudo -u postgres psql -d crm_production -tA -F' ' -c "$RECUENTOS" | diff /etc/crm-medicion/recuentos-antes.txt -
echo "--- la base de medición después de medir (las transacciones revertidas no dejan filas)"
sudo -u postgres psql -d crm_medicion_test -tAc "select 'conversaciones: ' || count(*) from conversations; select 'mensajes: ' || count(*) from messages; select 'clientes: ' || count(*) from clients"

echo "--- el vigía"
kill $VIGIA_PID 2>/dev/null || true
awk '{ n++; c[$2]++; if ($3 > tmax) tmax = $3; if (mmin == "" || $4 < mmin) mmin = $4 }
     END { printf "muestras: %d\n", n; for (k in c) printf "código %s: %d\n", k, c[k];
           printf "tiempo máximo de /login: %s s\nmemoria disponible mínima: %s MB\n", tmax, mmin }' "$VIGIA"
systemctl is-active crm-production
date -u +%Y-%m-%dT%H:%M:%SZ
