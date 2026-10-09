#!/usr/bin/env bash
#
# Aviso de tamano de la base de produccion (brief-17.5, D-9; ADR 0018, punto 3).
#
# Las imagenes de producto viven en la base, y el disco carga cerca de 16 veces lo que la
# base ocupa: el dump en claro y el cifrado, 7 copias locales y la base del ejercicio de
# restauracion. El ADR fija 1 GB de base como el punto en que se reconsidera donde se
# guardan las imagenes.
#
# Este trabajo termina bien SOLO mientras la base esta bajo el umbral. Su OnSuccess= manda
# el aviso de vida de `db-size`; pasado el umbral el aviso no llega, y Healthchecks.io
# alerta por email y Telegram, como con el backup. Es el mismo mecanismo invertido: no hace
# falta una herramienta nueva.
#
# Lo dispara el OnSuccess= de crm-backup.service, una vez por dia. Si el backup falla, este
# trabajo no corre y su aviso tampoco llega: alertan los dos, y la del backup explica la otra.
#
# El umbral se puede bajar con CRM_DB_SIZE_THRESHOLD_BYTES en /etc/crm-production/db-size.env,
# que la unidad lee si existe: asi se provoca la alerta para probarla (AC-14 de la 17.5). Sin
# el archivo rige 1 GB. Despues de la prueba, el archivo se borra.
set -euo pipefail

UMBRAL=${CRM_DB_SIZE_THRESHOLD_BYTES:-1073741824}
if [[ ! $UMBRAL =~ ^[1-9][0-9]{0,17}$ ]]; then
  echo "Umbral invalido en CRM_DB_SIZE_THRESHOLD_BYTES: '$UMBRAL'." >&2
  exit 2
fi

# La misma consulta que corre tests/integration/product-images.test.ts.
CONSULTA_TAMANO="select pg_database_size(current_database())"
tamano=$(psql --dbname=crm_production --no-psqlrc --tuples-only --no-align \
  --command="$CONSULTA_TAMANO")
if [[ ! $tamano =~ ^[0-9]+$ ]]; then
  echo "No se pudo leer el tamano de la base." >&2
  exit 2
fi

mb=$((tamano / 1024 / 1024))
umbral_mb=$((UMBRAL / 1024 / 1024))
if ((tamano > UMBRAL)); then
  echo "FALLA: la base ocupa ${mb} MB, por encima del umbral de ${umbral_mb} MB." >&2
  echo "       Se reconsidera donde se guardan las imagenes (ADR 0018, punto 3)." >&2
  exit 1
fi
echo "OK: la base ocupa ${mb} MB, bajo el umbral de ${umbral_mb} MB."
