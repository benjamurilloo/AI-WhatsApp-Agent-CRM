# Evidencia — 13.3: disponibilidad y observabilidad

Salidas de la subfase 13.3 ([brief-13.3](brief-13.3-disponibilidad-y-observabilidad.md)). Cada bloque es la salida literal del comando que lo precede, salvo los marcados `[transcrito]`. **Autoevaluación**: lo ejecutó y lo registra el mismo agente que implementó. Ninguna URL de aviso, dirección de correo ni IP aparece en este archivo.

## Etapa 13.3.1 — local, 2026-09-30

### AC-1: cada trabajo programado manda su aviso de vida

Las unidades de producción, después del cambio (solo las líneas de `OnSuccess=`):

```
deploy/production/crm-backup.service:        OnSuccess=crm-backup-offsite.service
deploy/production/crm-backup.service:        OnSuccess=crm-heartbeat@backup.service
deploy/production/crm-backup-offsite.service: OnSuccess=crm-heartbeat@offsite.service
deploy/production/crm-restore-check.service: OnSuccess=crm-heartbeat@restore-check.service
```

`[transcrito]` de las tres unidades. La guarda `tests/guards/staging-backup-config.test.ts` pasó de 116 a 126 casos, y los 126 están en verde. Son 10 casos nuevos, de 67 a 77 `it(` en el archivo; los casos que corren sobre los dos entornos cuentan doble en el total.

**Mutaciones sobre los archivos reales.** Cada una se aplicó con un script de `node` que guarda los bytes originales, corre la guarda y los restaura. No se usó `git checkout`, que en esta máquina reescribe los finales de línea (evidencia-13.2, incidente de CRLF).

Las que tienen que dar rojo:

```
mutación: deploy/production/crm-restore-check.service: «OnSuccess=crm-heartbeat@restore-check.service» → «»
     × todo servicio alcanzado desde un timer dispara su aviso 9ms
     × recorre los tres trabajos: el backup, la copia externa y el ejercicio 1ms
     × un trabajo que pierde su aviso se detecta 1ms
     × un trabajo nuevo con timer y sin aviso se detecta 1ms
     × el script acepta exactamente los trabajos que las unidades disparan 1ms
      Tests  5 failed | 121 passed (126)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-backup-offsite.service: «OnSuccess=crm-heartbeat@offsite.service» → «# OnSuccess=crm-heartbeat@offsite.service»
     × todo servicio alcanzado desde un timer dispara su aviso 10ms
     × recorre los tres trabajos: el backup, la copia externa y el ejercicio 2ms
     × un trabajo que pierde su aviso se detecta 1ms
     × un trabajo nuevo con timer y sin aviso se detecta 1ms
     × un aviso puesto en [Service] no cuenta: systemd lo ignora ahí 1ms
     × el script acepta exactamente los trabajos que las unidades disparan 1ms
      Tests  6 failed | 120 passed (126)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-backup.service: «OnSuccess=crm-backup-offsite.service
OnSuccess=crm-heartbeat@backup.service» → «OnSuccess=crm-backup-offsite.service»
     × todo servicio alcanzado desde un timer dispara su aviso 8ms
     × recorre los tres trabajos: el backup, la copia externa y el ejercicio 1ms
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-backup.service: «OnSuccess=crm-heartbeat@backup.service» → «OnSuccess=crm-heartbeat@bakup.service»
     × recorre los tres trabajos: el backup, la copia externa y el ejercicio 9ms
     × un trabajo que pierde su aviso se detecta 1ms
     × el script acepta exactamente los trabajos que las unidades disparan 2ms
      Tests  3 failed | 123 passed (126)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-heartbeat.sh: «echo "Aviso de '$trabajo' enviado."» → «echo "Aviso enviado a $url"»
     × el script nunca imprime la URL, ni en el mensaje de curl 5ms
      Tests  1 failed | 125 passed (126)
código de salida: 1
restaurado: bytes idénticos
```

La tercera salida está recortada a sus cuatro primeras líneas de fallas; el código de salida es el de la corrida entera.

**Lo que muestran**:

- **El typo `bakup` no lo ve el caso del grafo**, porque el grafo acepta cualquier nombre de aviso. Lo ve el caso que compara los trabajos que disparan las unidades con los que acepta el script. En el servidor, ese typo haría que el aviso saliera con error y la alerta sonara por ausencia: una falsa alarma, no un silencio.
- **Las mutaciones que borran un aviso ponen en rojo también casos sintéticos**, que parten de los archivos reales. Es esperable: esos casos mutan una copia de un archivo que ya está roto.

La que tiene que dar verde, porque systemd acepta las dos formas:

```
mutación: deploy/production/crm-backup.service: «OnSuccess=crm-backup-offsite.service
OnSuccess=crm-heartbeat@backup.service» → «OnSuccess=crm-backup-offsite.service crm-heartbeat@backup.service»
      Tests  126 passed (126)
código de salida: 0
restaurado: bytes idénticos
```

**Esta encontró un defecto mío**, en su primera corrida. Las unidades reales pasaban, pero el caso «un trabajo que pierde su aviso se detecta» daba rojo: su mutación borraba una línea exacta, y con el archivo en una sola línea dejaba de mutar nada. Se corrigió para quitar la unidad del aviso esté escrita como esté, y para comprobar que la mutación cambió el texto. La salida de arriba es la de después.

### AC-2: ninguna URL de aviso en el repositorio

Guarda nueva, `tests/guards/heartbeat-urls.test.ts`, con 12 casos. Recorre `git ls-files --cached --others --exclude-standard`, así que también ve los archivos nuevos sin versionar. Se exime solo a sí misma.

**La guarda encontró dos cosas en su primera corrida con la suite entera**, las dos en este mismo archivo de evidencia:

1. **Una fuga verdadera**, de la clase que la guarda tiene que atrapar. La salida literal de las mutaciones traía los tokens inventados, así que la evidencia contenía URLs con forma de aviso. No se eximió el archivo: en las salidas de abajo los tokens están reemplazados por `<token inventado>`, y esos bloques están marcados `[transcrito]`.
2. **Un falso positivo del detector.** Con el token ya reemplazado, `https://uptime.betterstack.com/api/v1/heartbeat/<token inventado>` seguía marcado. La primera versión marcaba cualquier cosa después del host de un servicio conocido. Ahora busca un segmento de ruta con 8 caracteres de token o más que no sea una palabra de la ruta del servicio (`heartbeat`). Hay dos casos nuevos: el marcador en una ruta profunda no se marca, y un token pegado a un `}` de una expansión de shell sí.

Las mutaciones se repitieron **después** del cambio del detector. `[transcrito, con los tokens reemplazados]`; el reemplazo lo hizo `sed` sobre la salida, no a mano.

Las que tienen que dar rojo:

```
mutación: deploy/production/crm-heartbeat.sh: «set -euo pipefail» → «set -euo pipefail
HEARTBEAT_URL_BACKUP=${HEARTBEAT_URL_BACKUP:-https://hc-ping.com/<token inventado>}»
     × el repositorio no tiene URLs de aviso 299ms
      Tests  1 failed | 11 passed (12)
código de salida: 1
restaurado: bytes idénticos

mutación: docs/decisions/brief-13.3-disponibilidad-y-observabilidad.md: «## Objetivo» → «## Objetivo

Prueba: https://uptime.betterstack.com/api/v1/heartbeat/<token inventado>»
     × el repositorio no tiene URLs de aviso 324ms
      Tests  1 failed | 11 passed (12)
código de salida: 1
restaurado: bytes idénticos
```

El brief todavía no estaba en el índice de Git cuando se corrió la segunda. Eso prueba que la guarda ve los archivos nuevos.

Las que tienen que dar verde, porque son los límites declarados en la cabecera de la guarda:

```
mutación: deploy/production/crm-heartbeat.sh: «set -euo pipefail» → «set -euo pipefail
BASE="https://hc-ping.com"; RUTA="/0f3c2a1e-9b7d-4c1a"»
      Tests  12 passed (12)
código de salida: 0
restaurado: bytes idénticos

mutación: deploy/production/crm-heartbeat.sh: «set -euo pipefail» → «set -euo pipefail
# https://avisos.otracosa.net/x/Zx9Yw8Vu7Ts6Qa»
      Tests  12 passed (12)
código de salida: 0
restaurado: bytes idénticos
```

Los tokens de las mutaciones son inventados. Los de estas dos mutaciones quedan literales, porque la guarda no los marca: esa es la limitación que prueban.

### AC-5: el procedimiento de `duration_ms`

**Dónde se probó.** En el droplet, porque la máquina local no tiene `jq`. Se probó **pasándole líneas por la entrada estándar**, que no escribe nada en el servidor. Las líneas las genera el formateador real de la aplicación (`formatLogEvent` de `src/shared/log/index.ts`) y mezclan lo que trae el journal: dos líneas de arranque de Next que no son JSON, 100 eventos de `/api/read/v1/products` de 1 a 100 ms, 10 de `/api/read/v1/messages` de 200 ms y uno de 3000 ms con código `INTERNAL`, y un evento de error sin duración.

Lo esperado, calculado a mano con el percentil de rango más cercano:
- `products`: p50 = 50, p95 = 95, máximo 100;
- `messages`: 11 eventos, p50 = 200, p95 = 3000, un error;
- el evento sin duración no cuenta.

El comando del runbook, **copiado tal como está escrito**, con `cat` en lugar de `journalctl`:

```
$ ssh crm-production "cat | jq -Rnr '...'" < lineas-log.txt
ruta	n	p50_ms	p95_ms	max_ms	errores
/api/read/v1/messages	11	200	3000	3000	1
/api/read/v1/products	100	50	95	100	0
```

Contra el journal real de producción de la última hora, con el mismo comando:

```
ruta	n	p50_ms	p95_ms	max_ms	errores
salida: 0
```

El journal de `crm-production` desde el 2026-09-29 tiene 26 líneas JSON, y ninguna con `duration_ms`. Son eventos de las Server Actions, que no miden duración. **No hay eventos de servicio**, porque la ingestión y la lectura están apagadas (H-3). El comando corre sobre el journal real sin error, pero todavía no midió nada real.

La búsqueda por correlación, con el mismo método:

```
{"time":"2026-09-30T19:00:00.000Z","level":"info","request_id":"r42","route":"/api/read/v1/products","code":"OK","source":"agente","correlation_id":"c42","duration_ms":42}
```

`jq` en el droplet: `jq-1.7`.
