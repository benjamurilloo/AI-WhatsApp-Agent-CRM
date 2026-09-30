#!/usr/bin/env bash
# 13.2.2, paso 5: la limpieza (AC-17). Corre como root. Borra solo lo que creó la medición.
set -uo pipefail
date -u +%Y-%m-%dT%H:%M:%SZ
RECUENTOS="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as filas from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"

echo "--- antes de borrar: crm_production contra la línea de base (vacío = igual)"
sudo -u postgres psql -d crm_production -tA -F' ' -c "$RECUENTOS" > /tmp/recuentos-despues.$$
diff /etc/crm-medicion/recuentos-antes.txt /tmp/recuentos-despues.$$ && echo "iguales"
echo "--- la línea de base, antes de borrarla"
cat /etc/crm-medicion/recuentos-antes.txt
rm -f /tmp/recuentos-despues.$$
PROD_ANTES=$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)

echo "--- 1 y 2. la base, los permisos de parámetros y el rol"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL'
DROP DATABASE crm_medicion_test;
REVOKE SET ON PARAMETER auto_explain.log_min_duration, auto_explain.log_analyze,
  auto_explain.log_buffers, auto_explain.log_timing, auto_explain.log_level FROM crm_medicion;
DROP ROLE crm_medicion;
SQL
echo "psql: salida $?"

echo "--- 3. los archivos"
rm -rf /etc/crm-medicion
rm -rf /var/lib/crm-production/medicion

echo "--- 4. lo que queda"
sudo -u postgres psql -tA -F'|' <<'SQL'
select 'bases de medición: ' || count(*) from pg_database where datname like '%medicion%';
select 'roles de medición: ' || count(*) from pg_roles where rolname like '%medicion%';
select 'permisos de parámetros: ' || count(*) from pg_parameter_acl;
select 'bases: ' || string_agg(datname, ',' order by datname) from pg_database;
select 'roles con login: ' || string_agg(rolname, ',' order by rolname) from pg_roles where rolcanlogin;
select name || ' = ' || setting from pg_settings where name in ('log_statement', 'log_min_duration_statement', 'shared_preload_libraries', 'session_preload_libraries', 'log_parameter_max_length') order by name;
select 'ajustes por rol o base: ' || count(*) from pg_db_role_setting;
SQL
for p in /etc/crm-medicion /var/lib/crm-production/medicion; do
  if [ -e "$p" ]; then echo "$p: TODAVÍA EXISTE"; else echo "$p: no existe"; fi
done
ls -A /var/lib/crm-production
echo "sesiones de crm_medicion en el log de PostgreSQL con sentencias: $(grep -c 'crm_medicion.*statement:' /var/log/postgresql/*.log 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')"
echo "planes en el log de PostgreSQL: $(grep -c 'Query Text:' /var/log/postgresql/*.log 2>/dev/null | awk -F: '{s+=$NF} END {print s+0}')"

echo "--- crm_production y la aplicación"
sudo -u postgres psql -d crm_production -tA -F' ' -c "$RECUENTOS"
test "$PROD_ANTES" = "$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)" && echo "/srv/crm-production sin cambios: $PROD_ANTES"
sudo -u crm git -C /srv/crm-production status --porcelain | wc -l | sed 's/^/archivos modificados en \/srv\/crm-production: /'
systemctl is-active crm-production postgresql
curl -s -o /dev/null -w '/login -> %{http_code}\n' https://crm.vixoraai.app/login
df -h --output=avail / | tail -1
date -u +%Y-%m-%dT%H:%M:%SZ
