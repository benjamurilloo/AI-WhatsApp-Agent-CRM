#!/usr/bin/env bash
#
# Aviso de vida de un trabajo programado (brief-13.3, D-3).
#
# Un backup roto no avisa: el timer sigue en verde y el journal guarda el error donde
# nadie lo lee. Este script le dice a un servicio externo "este trabajo termino bien".
# Si el aviso no llega a tiempo, el servicio externo alerta. Asi se cubren las dos
# fallas: el trabajo que falla y el trabajo que nunca corrio.
#
# Lo dispara crm-heartbeat@<trabajo>.service, que a su vez dispara el OnSuccess= de cada
# trabajo. Corre en una unidad aparte porque el backup no tiene red (IPAddressDeny=any),
# y darsela para esto le abriria la red a un proceso que lee el .pgpass del dueno.
#
# Las URLs de aviso NO estan en este repositorio: cualquiera que tenga una puede marcar
# el trabajo como vivo y apagar la alerta. Viven en /etc/crm-production/heartbeat.env,
# 0600 de root, que systemd lee antes de soltar privilegios (EnvironmentFile=).
#
# LIMITES DECLARADOS:
#   - El aviso dice que el trabajo termino con codigo 0, no que su resultado sirva. Que
#     el backup restaure lo dice el ejercicio de restauracion, que tiene su propio aviso.
#   - Si este script falla (sin red, URL mal escrita), el trabajo ya termino bien y
#     el aviso no llega: el servicio externo alerta igual. Es una falsa alarma, no un
#     silencio, y es el lado correcto para equivocarse.

set -euo pipefail

trabajo=${1:-}

# Lista cerrada: un nombre desconocido es un error de configuracion de la unidad, no un
# trabajo nuevo. Sin esto, un typo en el OnSuccess= buscaria una variable vacia.
case $trabajo in
  backup) variable=HEARTBEAT_URL_BACKUP ;;
  offsite) variable=HEARTBEAT_URL_OFFSITE ;;
  restore-check) variable=HEARTBEAT_URL_RESTORE_CHECK ;;
  *)
    echo "Trabajo desconocido: '${trabajo}'. Validos: backup, offsite, restore-check." >&2
    exit 1
    ;;
esac

url=${!variable:-}
if [[ -z $url ]]; then
  echo "Falta $variable en /etc/crm-production/heartbeat.env: el aviso de '$trabajo' no sale." >&2
  exit 1
fi

# La URL no se imprime, ni siquiera en un error: el journal no es un lugar para ella. Por
# eso el mensaje de curl se descarta y solo se informa su codigo de salida, que alcanza
# para distinguir DNS (6), conexion (7), timeout (28) y respuesta HTTP de error (22).
# --fail convierte un 4xx o 5xx en error. Los reintentos cubren un corte breve de red.
codigo=0
curl --fail --silent --max-time 10 --retry 3 --retry-all-errors \
  --output /dev/null "$url" 2>/dev/null || codigo=$?

if ((codigo != 0)); then
  echo "El aviso de '$trabajo' no llego al servicio externo (curl salio con $codigo)." >&2
  exit 1
fi

echo "Aviso de '$trabajo' enviado."
