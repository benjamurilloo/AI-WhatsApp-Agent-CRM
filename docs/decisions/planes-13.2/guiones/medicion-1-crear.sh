#!/usr/bin/env bash
# 13.2.2, paso 1: la base y el rol de medición en el droplet de producción. Corre como root.
# No toca crm_production, /srv/crm-production ni /etc/crm-production, y no reinicia nada.
set -euo pipefail
date -u +%Y-%m-%dT%H:%M:%SZ

RECUENTOS="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int as filas from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"

echo "--- 1. recuentos de crm_production, antes"
install -d -m 0700 -o root -g root /etc/crm-medicion
sudo -u postgres psql -d crm_production -tA -F' ' -c "$RECUENTOS" | tee /etc/crm-medicion/recuentos-antes.txt
chmod 0600 /etc/crm-medicion/recuentos-antes.txt

echo "--- 2. el rol, con la contraseña generada acá"
if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname = 'crm_medicion'" | grep -q 1; then
  echo "el rol crm_medicion ya existe: no se sigue" >&2
  exit 1
fi
PW=$(openssl rand -hex 24)
SEED=$(openssl rand -hex 12)
umask 077
printf 'DATABASE_URL=postgres://crm_medicion:%s@127.0.0.1:5432/crm_medicion_test\nSEED_USER_PASSWORD=%s\n' "$PW" "$SEED" > /etc/crm-medicion/medicion.env
chmod 0600 /etc/crm-medicion/medicion.env
printf "CREATE ROLE crm_medicion LOGIN PASSWORD '%s' NOSUPERUSER NOCREATEROLE NOCREATEDB;\n" "$PW" | sudo -u postgres psql -v ON_ERROR_STOP=1 -q
unset PW SEED

echo "--- 3 a 5. la base, los permisos, auto_explain y unaccent"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE DATABASE crm_medicion_test OWNER crm_medicion TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'es' LOCALE 'C.UTF-8';
REVOKE CONNECT ON DATABASE crm_medicion_test FROM PUBLIC;
GRANT CONNECT ON DATABASE crm_medicion_test TO crm_medicion;
ALTER ROLE crm_medicion SET session_preload_libraries = 'auto_explain';
GRANT SET ON PARAMETER auto_explain.log_min_duration, auto_explain.log_analyze,
  auto_explain.log_buffers, auto_explain.log_timing, auto_explain.log_level TO crm_medicion;
\c crm_medicion_test
CREATE EXTENSION IF NOT EXISTS unaccent;
SQL

echo "--- lo creado"
sudo -u postgres psql -tA -F'|' <<'SQL'
select datname, datlocprovider, datlocale, pg_get_userbyid(datdba) from pg_database where datname in ('crm_production', 'crm_medicion_test') order by 1;
select rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolconfig from pg_roles where rolname = 'crm_medicion';
select 'miembro de crm_app: ' || pg_has_role('crm_medicion', 'crm_app', 'member');
select 'parámetros concedidos: ' || count(*) from pg_parameter_acl;
SQL
ls -la /etc/crm-medicion
sed -n 's/=.*//p' /etc/crm-medicion/medicion.env

echo "--- 6a. el rol de medición contra crm_production, por efecto"
URL_PROD=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env | sed 's|/crm_medicion_test$|/crm_production|')
for tabla in clients users organizations messages; do
  printf '%s: ' "$tabla"
  psql "$URL_PROD" -tAc "select count(*) from $tabla" 2>&1 | tail -1
done
unset URL_PROD

echo "--- 6b. el rol de medición contra su base, por efecto"
URL=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env)
psql "$URL" -tAc "select current_user, current_database(), current_setting('session_preload_libraries')"
unset URL

echo "--- 6c. quién puede conectarse a la base de medición, por catálogo"
sudo -u postgres psql -tA -F'|' -c "select rolname, has_database_privilege(rolname, 'crm_medicion_test', 'CONNECT') from pg_roles where rolcanlogin and rolname not like 'pg\_%' order by 1"

echo "--- la aplicación"
systemctl is-active crm-production
curl -s -o /dev/null -w '/login -> %{http_code}\n' https://crm.vixoraai.app/login
