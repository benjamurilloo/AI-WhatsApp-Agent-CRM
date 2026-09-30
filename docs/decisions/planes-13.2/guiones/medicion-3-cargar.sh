#!/usr/bin/env bash
# 13.2.2, paso 3: la calibración del umbral y la carga de la medición. Corre como root.
# Solo escribe en crm_medicion_test. No toca /srv/crm-production ni crm_production.
set -euo pipefail
date -u +%Y-%m-%dT%H:%M:%SZ

DIR=/var/lib/crm-production/medicion
ORG0=5eed0000-0000-4000-8000-000000000021
VIGIA=$(mktemp)
RECUENTOS="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as filas from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"

# El vigía: cada 5 s, el código y el tiempo de /login, y la memoria disponible.
(
  while true; do
    printf '%s %s %s\n' "$(date -u +%H:%M:%S)" \
      "$(curl -s -o /dev/null -m 10 -w '%{http_code} %{time_total}' https://crm.vixoraai.app/login || true)" \
      "$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
    sleep 5
  done
) > "$VIGIA" &
VIGIA_PID=$!
trap 'kill $VIGIA_PID 2>/dev/null || true; rm -f "$VIGIA"' EXIT

DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env)
SEED_USER_PASSWORD=$(sed -n 's/^SEED_USER_PASSWORD=//p' /etc/crm-medicion/medicion.env)
export DATABASE_URL SEED_USER_PASSWORD
case "$DATABASE_URL" in
  */crm_medicion_test) ;;
  *) echo "la URL no apunta a crm_medicion_test: no se sigue" >&2; exit 1 ;;
esac
test ! -e "$DIR/.env"
como_crm() {
  sudo -H -u crm --preserve-env=DATABASE_URL,SEED_USER_PASSWORD,CRM_TANDA bash -c "cd '$DIR' && $1"
}

echo "--- 1. carga de calibración: la organización histórica sola"
como_crm "npx tsx seeds/volume.ts"
sudo -u postgres psql -d crm_medicion_test -q -c "ANALYZE"
sudo -u postgres psql -d crm_medicion_test -tAc "select 'organizaciones: ' || count(*) from organizations; select 'tamaño: ' || pg_size_pretty(pg_database_size('crm_medicion_test'))"

echo "--- 2. la tanda de la 8.5"
echo "\$ CRM_TANDA=8.5 npx tsx scripts/medir-caminos.ts $ORG0 calibracion"
export CRM_TANDA=8.5
como_crm "npx tsx scripts/medir-caminos.ts $ORG0 calibracion"
unset CRM_TANDA

echo "--- 3. borrar y recrear la base, migrar y cargar la distribución de la medición"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL'
DROP DATABASE crm_medicion_test;
CREATE DATABASE crm_medicion_test OWNER crm_medicion TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'es' LOCALE 'C.UTF-8';
REVOKE CONNECT ON DATABASE crm_medicion_test FROM PUBLIC;
GRANT CONNECT ON DATABASE crm_medicion_test TO crm_medicion;
\c crm_medicion_test
CREATE EXTENSION IF NOT EXISTS unaccent;
SQL
como_crm "npm run -s db:migrate"
como_crm "npx tsx seeds/volume.ts medicion"
unset DATABASE_URL SEED_USER_PASSWORD

echo "--- 4. ANALYZE"
sudo -u postgres psql -d crm_medicion_test -q -c "ANALYZE"

echo "--- lo cargado"
sudo -u postgres psql -d crm_medicion_test -tA -F' ' -c "$RECUENTOS"
sudo -u postgres psql -tA -F'|' <<'SQL'
select datname, datlocprovider, datlocale, pg_get_userbyid(datdba), pg_size_pretty(pg_database_size(datname)) from pg_database where datname = 'crm_medicion_test';
select rolname, has_database_privilege(rolname, 'crm_medicion_test', 'CONNECT') from pg_roles where rolcanlogin and rolname not like 'pg\_%' order by 1;
SQL

echo "--- crm_production contra la línea de base (vacío = igual)"
sudo -u postgres psql -d crm_production -tA -F' ' -c "$RECUENTOS" | diff /etc/crm-medicion/recuentos-antes.txt - || true

echo "--- el vigía: /login y memoria disponible durante todo el paso"
kill $VIGIA_PID 2>/dev/null || true
awk '{ n++; c[$2]++; if ($3 > tmax) tmax = $3; if (mmin == "" || $4 < mmin) mmin = $4 }
     END { printf "muestras: %d\n", n; for (k in c) printf "código %s: %d\n", k, c[k];
           printf "tiempo máximo de /login: %s s\nmemoria disponible mínima: %s MB\n", tmax, mmin }' "$VIGIA"
systemctl is-active crm-production
df -h --output=avail / | tail -1
date -u +%Y-%m-%dT%H:%M:%SZ
