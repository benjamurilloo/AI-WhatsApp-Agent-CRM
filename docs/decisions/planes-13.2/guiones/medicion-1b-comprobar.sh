#!/usr/bin/env bash
# 13.2.2, paso 1, segunda parte: las comprobaciones que el primer guion no llegó a correr. El
# error esperado de la primera tabla lo cortó, por `set -e` con `pipefail`. Acá no escribe nada.
set -uo pipefail
date -u +%Y-%m-%dT%H:%M:%SZ

echo "--- 6a. el rol de medición contra crm_production, por efecto"
URL_PROD=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env | sed 's|/crm_medicion_test$|/crm_production|')
for tabla in clients users organizations messages audit_logs sessions; do
  printf '%s: ' "$tabla"
  psql "$URL_PROD" -tAc "select count(*) from $tabla" 2>&1 | tail -1
done
printf 'crear una tabla: '
psql "$URL_PROD" -tAc "create table medicion_no_deberia (id int)" 2>&1 | tail -1
unset URL_PROD

echo "--- 6b. el rol de medición contra su base, por efecto"
URL=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env)
psql "$URL" -tAc "select current_user, current_database(), current_setting('session_preload_libraries')" 2>&1 | tail -1
unset URL

echo "--- 6c. quién puede conectarse a la base de medición, por catálogo"
sudo -u postgres psql -tA -F'|' -c "select rolname, has_database_privilege(rolname, 'crm_medicion_test', 'CONNECT') from pg_roles where rolcanlogin and rolname not like 'pg\_%' order by 1"

echo "--- la aplicación"
systemctl is-active crm-production
curl -s -o /dev/null -w '/login -> %{http_code}\n' https://crm.vixoraai.app/login
