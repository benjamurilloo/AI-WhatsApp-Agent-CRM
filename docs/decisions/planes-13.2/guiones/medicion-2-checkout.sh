#!/usr/bin/env bash
# 13.2.2, paso 2: el segundo checkout y la migración de la base de medición. Corre como root.
# No toca /srv/crm-production ni crm_production, y no reinicia nada.
set -euo pipefail
date -u +%Y-%m-%dT%H:%M:%SZ

SHA=803571eff65fbb4c78a41fc558ef4d24eb37ffa0
DIR=/var/lib/crm-production/medicion
SSHCMD="ssh -i /var/lib/crm-production/ssh/id_ed25519_deploy -o IdentitiesOnly=yes -o UserKnownHostsFile=/var/lib/crm-production/ssh/known_hosts -o StrictHostKeyChecking=yes"

echo "--- antes"
if [ -e "$DIR" ]; then
  echo "$DIR ya existe: no se sigue" >&2
  exit 1
fi
PROD_ANTES=$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)
echo "/srv/crm-production en: $PROD_ANTES"
systemctl is-active crm-production
curl -s -o /dev/null -w '/login -> %{http_code}\n' https://crm.vixoraai.app/login
free -m | sed -n '1,2p'
df -h --output=avail / | tail -1

echo "--- 1. el clonado"
install -d -m 0750 -o crm -g crm "$DIR"
sudo -H -u crm env GIT_SSH_COMMAND="$SSHCMD" git clone -q git@github.com:benjamurilloo/AI-WhatsApp-Agent-CRM.git "$DIR"
sudo -H -u crm git -C "$DIR" config core.sshCommand "$SSHCMD"
sudo -H -u crm git -C "$DIR" -c advice.detachedHead=false checkout -q --detach "$SHA"
test "$(sudo -u crm git -C "$DIR" rev-parse HEAD)" = "$SHA"
echo "checkout de medición en: $SHA"

echo "--- 2. npm ci"
INICIO=$(date +%s)
sudo -H -u crm bash -c "cd '$DIR' && npm ci --no-audit --no-fund 2>&1 | tail -4"
echo "npm ci: $(( $(date +%s) - INICIO )) s"
free -m | sed -n '1,2p'
curl -s -o /dev/null -w '/login -> %{http_code}\n' https://crm.vixoraai.app/login

echo "--- 3. la migración de crm_medicion_test, con el rol de medición"
test ! -e "$DIR/.env"
DATABASE_URL=$(sed -n 's/^DATABASE_URL=//p' /etc/crm-medicion/medicion.env)
export DATABASE_URL
case "$DATABASE_URL" in
  */crm_medicion_test) ;;
  *) echo "la URL no apunta a crm_medicion_test: no se sigue" >&2; exit 1 ;;
esac
sudo -H -u crm --preserve-env=DATABASE_URL bash -c "cd '$DIR' && npm run -s db:migrate"
unset DATABASE_URL

echo "--- lo migrado"
sudo -u postgres psql -d crm_medicion_test -tA -F'|' <<'SQL'
select 'tablas en public: ' || count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE';
select 'migraciones aplicadas: ' || count(*) from drizzle.__drizzle_migrations;
select 'dueños de las tablas: ' || string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'public';
select 'tamaño: ' || pg_size_pretty(pg_database_size('crm_medicion_test'));
SQL
echo "migraciones en el checkout: $(ls "$DIR"/drizzle/*.sql | wc -l)"

echo "--- después"
PROD_DESPUES=$(sudo -u crm git -C /srv/crm-production rev-parse HEAD)
test "$PROD_ANTES" = "$PROD_DESPUES" && echo "/srv/crm-production sin cambios: $PROD_DESPUES"
sudo -u crm git -C /srv/crm-production status --porcelain | wc -l | sed 's/^/archivos modificados en \/srv\/crm-production: /'
sudo -u postgres psql -d crm_production -tAc "select 'migraciones en crm_production: ' || count(*) from drizzle.__drizzle_migrations"
du -sh "$DIR" | cut -f1 | sed 's/^/checkout de medición: /'
df -h --output=avail / | tail -1
systemctl is-active crm-production
curl -s -o /dev/null -w '/login -> %{http_code}\n' https://crm.vixoraai.app/login
