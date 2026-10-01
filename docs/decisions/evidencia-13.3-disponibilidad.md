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

La tercera salida está recortada: muestra dos de sus líneas de fallas y no tiene la línea del recuento. *Corregido el 2026-09-30 por la revisión independiente (hallazgo 11)*: esta nota decía «a sus cuatro primeras líneas», y el bloque tiene dos. La corrida entera, repetida con la guarda de después de la revisión, está en [Correcciones de la revisión independiente](#correcciones-de-la-revisión-independiente).

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

## Etapa 13.3.2 — producción, 2026-09-30

Todas las horas son UTC. La configuración de las cuentas externas la hizo el usuario en sus paneles; lo que se ve de ella está descrito por lo que él mostró, y se marca `[transcrito]`. Los emails de las alertas traen enlaces con identificadores del chequeo y, uno de DigitalOcean y uno de Healthchecks, una IP: **no se copian**. Van solo el texto de la alerta y su hora.

### AC-12: el corte de un despliegue (D-7)

Medido durante el despliegue de `579397e`, con un pedido por segundo a `/login` desde la máquina del operador. El método, un script del scratchpad de la sesión, no versionado:

```
r=$(curl -s -o /dev/null -m 5 -w "%{http_code}\t%{time_total}" https://crm.vixoraai.app/login || true)
[[ -z $r ]] && r=$'000\t5'
printf "%s\t%s\n" "$(date -u +%H:%M:%S)" "$r" >> corte.tsv
```

Un pedido por línea: hora de fin, código y tiempo total. Recuento sobre el archivo:

```
521
19:05:33	200	0.715927
19:15:32	200	0.583229
    520 200
      1 502
124-19:07:53	200	0.559914
125-19:07:54	200	0.606875
126:19:07:55	502	0.566163
127-19:07:58	200	1.757785
128-19:07:58	200	0.626973
129-19:08:00	200	0.619713
```

`ActiveEnterTimestamp` de `crm-production` después del despliegue: 19:07:57. **El corte es de 1 a 3 segundos**: un `502` a las 19:07:55, y el pedido siguiente, que empezó cerca de las 19:07:56, tardó 1,76 s porque esperó el arranque. `npm ci` y `next build`, que corren con la aplicación vieja arriba, no cortaron `/login`. **Límite**: se midió `/login`, no las rutas de servicio, que están apagadas; H-8 no se confirma para ellas.

### Pasos A a E: configuración externa

**Healthchecks.io** `[transcrito]`. Tres chequeos en el proyecto «CRM producción», con integraciones de email y Telegram. El botón «Test!» de cada integración llegó a los dos canales.

| Chequeo | Horario (UTC) | Gracia |
| --- | --- | --- |
| `crm-backup` | `15 3 * * *` | 1 h |
| `crm-offsite` | `15 3 * * *` | 1 h |
| `crm-restore-check` | `30 4 1 * *` | 2 h |

**El archivo de URLs**, verificado sin imprimirlas: dueño, modo, y la forma de cada línea `[transcrito]`, resumido de dos salidas.

```
600 root:root /etc/crm-production/heartbeat.env
HEARTBEAT_URL_BACKUP: forma OK, 56 caracteres
HEARTBEAT_URL_OFFSITE: forma OK, 56 caracteres
HEARTBEAT_URL_RESTORE_CHECK: forma OK, 56 caracteres
URLs repetidas: 0
```

**Instalación de las unidades**, 19:29, con el comando de [Instalar el aviso de vida](../../deploy/production/README.md#instalar-el-aviso-de-vida) más un `diff` de cada archivo contra el checkout:

```
verify OK
script idéntico
crm-heartbeat@.service idéntico
crm-backup.service idéntico
crm-backup-offsite.service idéntico
crm-restore-check.service idéntico
600 root /etc/crm-production/heartbeat.env
755 root /usr/local/bin/crm-heartbeat.sh
```

`OnSuccess=` de los tres trabajos, en ese orden:

```
crm-backup-offsite.service crm-heartbeat@backup.service

crm-heartbeat@offsite.service

crm-heartbeat@restore-check.service
```

**Un aviso de prueba de cada trabajo**, sin correr ningún trabajo. Primero `systemctl start crm-heartbeat@<trabajo>.service` para los tres; después, las líneas de cada uno:

```
ssh crm-production 'for t in backup offsite restore-check; do sudo journalctl -u "crm-heartbeat@$t.service" -n 3 -o short-iso --no-hostname; done'
```

Salida, con la línea «Finished» de systemd quitada de cada trabajo `[transcrito]`:

```
2026-09-30T19:29:34+00:00 crm-heartbeat.sh[20675]: Aviso de 'backup' enviado.
2026-09-30T19:29:34+00:00 systemd[1]: crm-heartbeat@backup.service: Deactivated successfully.
2026-09-30T19:29:34+00:00 crm-heartbeat.sh[20687]: Aviso de 'offsite' enviado.
2026-09-30T19:29:34+00:00 systemd[1]: crm-heartbeat@offsite.service: Deactivated successfully.
2026-09-30T19:29:35+00:00 crm-heartbeat.sh[20698]: Aviso de 'restore-check' enviado.
2026-09-30T19:29:35+00:00 systemd[1]: crm-heartbeat@restore-check.service: Deactivated successfully.
```

Los tres con `Result=success`. En Healthchecks los tres pasaron de «new» a «up» `[transcrito]`.

**DigitalOcean Uptime** `[transcrito]`. Chequeo `crm-production-health`, HTTPS sobre `https://crm.vixoraai.app/api/health`, desde cuatro regiones. Estado *Up* antes de las fallas. Alertas activas, por email:

| Alerta | Umbral | Espera |
| --- | --- | --- |
| Caída (Down) | — (el panel muestra «1ms», que no se usa en este tipo) | 2 min |
| Certificado SSL | 14 días | 2 min |
| Latencia | 2000 ms | 5 min |

**DigitalOcean Monitoring** `[transcrito]`, sobre el droplet `crm-production`, por email:

```
crm-production-memoria-90   Memory Utilization Percent is above 90% for 10 min
crm-production-disco-80     Disk Utilization Percent is above 80% for 5 min
```

Uso del droplet en ese momento:

```
/dev/vda1        48G  3.7G   44G   8% /
               total        used        free      shared  buff/cache   available
Mem:            1967         552         664         114        1038        1415
active
```

### AC-7: la herramienta y su precio

| Qué | Herramienta | Precio, 2026-09-30 |
| --- | --- | --- |
| Disponibilidad desde afuera (D-2) | DigitalOcean Uptime | El primer chequeo, sin costo; cada chequeo más, USD 1 por mes. Se usa uno |
| Avisos de vida (D-3) | Healthchecks.io | Plan gratuito, hasta 20 chequeos. Se usan tres |
| Disco y memoria (D-4) | DigitalOcean Monitoring | Sin costo, sobre el `do-agent` que ya corría |

**Frecuencia**: D-2 pedía una consulta por minuto. **Sumando las cuatro regiones se cumple**: de 19:40 a 20:14, 32 consultas en 34 minutos. **Por región, no**: cada una consulta cada 3 a 9 minutos (AC-8), y la alerta depende de una región, así que el tiempo de detección medido es de 4,5 a 9,5 minutos y no el de una consulta por minuto.

### AC-13: los recuentos de `crm_production`

El mismo comando antes y después de cada falla, en una transacción de solo lectura, con las 17 tablas de las migraciones en orden alfabético: `audit_logs`, `clients`, `conversations`, `ingestion_credentials`, `ingestion_events`, `ingestion_rate_windows`, `inventories`, `inventory_movements`, `knowledge_entries`, `login_attempts`, `messages`, `organization_members`, `organizations`, `product_prices`, `products`, `sessions`, `users`.

```
ssh crm-production 'sudo -u postgres psql -d crm_production -qXAt -c "begin read only; select (select count(*) from audit_logs), (select count(*) from clients), ... (select count(*) from users); commit"'
```

| Momento | Recuentos | `/login` |
| --- | --- | --- |
| Línea de base, 20:11:24 | `1\|0\|0\|0\|0\|0\|0\|0\|0\|44\|0\|1\|1\|0\|0\|2\|1` | — |
| Después de AC-8, 20:24:46 | `1\|0\|0\|0\|0\|0\|0\|0\|0\|44\|0\|1\|1\|0\|0\|2\|1` | `200`, 0,56 s |
| Después del primer intento de AC-9, ~20:40 | `1\|0\|0\|0\|0\|0\|0\|0\|0\|44\|0\|1\|1\|0\|0\|2\|1` | `200`, 0,91 s |
| Después de AC-9, ~20:48 | `1\|0\|0\|0\|0\|0\|0\|0\|0\|44\|0\|1\|1\|0\|0\|2\|1` | `200`, 0,63 s |

Iguales en las cuatro. AC-10 y AC-11 no tocaron el servidor.

### AC-8: la aplicación detenida

```
2026-09-30T20:14:51Z
2026-09-30T20:14:51Z
inactive
502
```

(hora antes y después de `sudo systemctl stop crm-production`, su estado, y `/api/health` desde afuera). La vuelta:

```
2026-09-30T20:24:22Z
2026-09-30T20:24:29Z
active
health 200 a las 20:24:29
```

Emails de DigitalOcean `[transcrito]`:

| Llegó | Texto |
| --- | --- |
| 20:24 | «has been down in se_asia for 2m, beginning at 30 Sep 2026 20:24 UTC» |
| ~20:25 | «has been down in eu_west for 2m, beginning at 30 Sep 2026 20:25 UTC» — **con el sitio ya arriba** |
| 20:35 | «Alert Caída (Down): Your site … is back up» — «has reported as back up in se_asia for 2m, beginning at 30 Sep 2026 20:35 UTC» |

**La alerta llegó unos 9,5 minutos después de la falla, no a los 3 o 4 que había estimado.** La estimación suponía una consulta por minuto. Los logs de nginx la corrigen: las consultas de Uptime por origen, con la dirección reemplazada por una letra y sin imprimirla.

```
origen-A: 19:40:55/200 19:43:55/200 19:46:57/200 19:49:56/200 19:53:02/200 19:55:56/200 19:58:49/200 20:01:52/200 20:04:52/200 20:07:48/200 20:10:47/200 20:13:52/200 20:16:50/502 20:19:49/502 20:22:49/502 20:25:46/200 20:28:40/200 20:31:40/200 20:34:37/200
origen-B: 19:42:12/200 19:45:53/200 19:49:43/200 19:53:34/200 19:57:24/200 20:01:15/200 20:05:13/200 20:09:01/200 20:12:47/200 20:16:37/502 20:20:30/502 20:24:12/502 20:27:55/200 20:31:40/200 20:35:29/200
origen-C: 19:44:08/200 19:52:57/200 20:01:48/200 20:11:15/200 20:20:55/502 20:30:12/200
origen-D: 19:44:39/200 19:49:24/200 19:54:08/200 19:58:48/200 20:03:29/200 20:08:11/200 20:12:51/200 20:17:33/502 20:22:14/502 20:26:52/200 20:31:38/200 20:36:18/200
```

Cada origen consulta cada 3, 4, 9 y 5 minutos. Una región necesita fallos que cubran los 2 minutos de espera, así que con esas frecuencias **la estimación** es de 5 a 10 minutos. **Lo medido**, en AC-8 y AC-9, es de 4,5 a 9,5 minutos, y es el número que citan los demás documentos. Unos cinco minutos después de la recuperación, el panel mostraba todavía «Europe DOWN for 9 minutes» y «USA West DOWN for 7 minutes» `[transcrito]`, con todas las consultas en `200`.

### AC-9: la base detenida

**Primer intento, fallido como prueba.** `sudo systemctl stop postgresql` a las 20:39:13 detuvo también la aplicación:

```
2026-09-30T20:39:13Z
2026-09-30T20:39:13Z
inactive
inactive
api/health 502 0.520660s
login 502 0.559551s
```

La causa está en la unidad: `Requires=postgresql.service`. En el journal de la aplicación:

```
2026-09-30T20:39:13+00:00 systemd[1]: Stopping crm-production.service - AI WhatsApp Agent CRM - produccion...
2026-09-30T20:39:13+00:00 systemd[1]: Stopped crm-production.service - AI WhatsApp Agent CRM - produccion.
```

Se levantaron las dos a las 20:39:53, porque iniciar `postgresql` no inicia la aplicación que la requiere:

```
2026-09-30T20:39:53Z
active
active
  postgresql.service         loaded active exited  PostgreSQL RDBMS
  postgresql@18-main.service loaded active running PostgreSQL Cluster 18-main
health 200 a las 20:39:53
```

La base corre en `postgresql@18-main.service`, con `PartOf=postgresql.service`. Detener solo esa unidad es lo que pasa cuando la base se cae sola: el envoltorio sigue `active (exited)` y la aplicación, arriba. Los 40 segundos de este intento no produjeron alerta.

**Segundo intento**, con autorización propia porque cambiaba el comando:

```
2026-09-30T20:42:38Z
2026-09-30T20:42:38Z
inactive
active
active
api/health 503 0.570150s
login 200 0.631808s
```

(la base, el envoltorio y la aplicación, en ese orden). Consultas de Uptime durante la falla, con las letras reasignadas en esta ventana:

```
origen-A: 20:40:22/200
origen-B: 20:40:29/200 20:43:29/503 20:46:26/503
origen-C: 20:40:58/200 20:45:40/503
origen-D: 20:43:02/503 20:46:44/503
```

La vuelta, a las 20:47:37, sin tocar la aplicación:

```
2026-09-30T20:47:45Z
active
active
NRestarts=0
ActiveEnterTimestamp=Wed 2026-09-30 20:39:53 UTC
health 200 a las 20:47:44, intento 1
```

(la hora del `date` remoto va un segundo adelante de la local). **La aplicación reconectó sola**: ningún reinicio, y la misma hora de arranque que antes de la falla.

Emails `[transcrito]`:

| Llegó | Texto |
| --- | --- |
| 20:47 | «has been down in eu_west for 2m, beginning at 30 Sep 2026 20:47 UTC» |
| 20:50 | «has been down in se_asia for 2m, beginning at 30 Sep 2026 20:50 UTC» — **con el sitio ya arriba** |
| 20:59 | «has reported as back up in se_asia for 2m, beginning at 30 Sep 2026 20:59 UTC» |
| 21:03 | «has reported as back up in eu_west for 2m, beginning at 30 Sep 2026 21:03 UTC» |

Todas las consultas de Uptime después de la vuelta dieron `200`:

```
20:49:20 200 20:50:20 200 20:50:32 200 20:51:01 200 20:52:14 200 20:54:14 200 20:54:59 200 20:55:12 200 20:58:06 200 20:58:10 200
```

La alerta de se_asia de las 20:50 no corresponde a ninguna consulta fallida que haya llegado a nginx. Desde el servidor no se puede saber si es un atraso de la evaluación de DigitalOcean o consultas de esa región que no llegaron; queda sin determinar.

### AC-10: un aviso que no llega

Con un chequeo de prueba en Healthchecks, `crm-prueba-ac10`, de período 1 minuto y gracia 1 minuto, con las mismas integraciones que los de producción. Se le mandó un ping desde el navegador del usuario, y nada más. `[transcrito]`:

| Momento | Hora |
| --- | --- |
| Chequeo creado | 21:13 |
| Ping | 21:14 |
| «Status Changed to Down at» | 21:16:12 |
| Email y Telegram | 21:16, los dos |

Email: «"crm-prueba-ac10" is DOWN (success signal did not arrive on time, grace time passed)», «Total Pings 1», «Last Ping Type: Success». El usuario borró el chequeo de prueba después.

**La otra mitad de AC-10**, que cada trabajo llegue a su aviso, se verifica con las corridas programadas y no a mano: la desviación la aprobó el usuario el 2026-09-30 (ver el brief).

#### Las corridas programadas del 2026-10-01

Leídas en el droplet el 2026-10-01 con `systemctl list-timers`, `systemctl show -p Result -p ExecMainStatus` y `sudo journalctl` de las cinco unidades, sin cambiar nada. Horas UTC.

| Trabajo | Corrió | Resultado | Aviso |
| --- | --- | --- | --- |
| `crm-backup.service` | 03:18:50 → 03:18:51 | `Result=success`, `ExecMainStatus=0`; dump de 67.389 bytes, cifrado en 67.605; «rotado: nada (hay <= 7 copias)» | `crm-heartbeat@backup`: «Aviso de backup enviado.» a las 03:18:52 |
| `crm-backup-offsite.service` | 03:18:51 → 03:18:53 | `Result=success`, `ExecMainStatus=0`; «subido: crm_production-20261001T031850Z.dump.age (67605 bytes)»; «retencion externa: se borro lo de mas de 30 dias» | `crm-heartbeat@offsite`: enviado a las 03:18:53 |
| `crm-restore-check.service` | 04:39:20 → 04:39:22 | `Result=success`, `ExecMainStatus=0`; restauró el dump de las 03:18:50 (mismo sha256); «OK: 17 tablas coinciden en existencia y en recuento», mismo conjunto de tablas, dueño `crm_owner`, base temporal borrada | `crm-heartbeat@restore-check`: enviado a las 04:39:22 |

Los tres avisos salieron por `OnSuccess=` («Triggering OnSuccess= dependencies»). Los recuentos restaurados son los de la línea de base de AC-13. **El primer ejercicio de restauración programado en producción salió bien**: la condición de detención 2 no se activó.

Del lado de Healthchecks.io, `[transcrito]`: el usuario confirmó que `crm-backup`, `crm-offsite` y `crm-restore-check` están *up*, con el último ping a esas mismas horas, y que no llegó ningún aviso de caída por email ni por Telegram durante la noche.

### AC-11: la alerta de disco

`[transcrito]`:

| Momento | Hora |
| --- | --- |
| Umbral de `crm-production-disco-80` bajado a 5 % | 21:10 |
| Email «DigitalOcean monitoring triggered: crm-production-disco-80 - crm-production» | 21:11 |
| Umbral de vuelta en 80 % | 21:12 |

Texto: «Disk Utilization Percent is currently at 7.77%, above setting of 5.00% for the last 5m». Después, en el panel: «crm-production-disco-80 — Disk Utilization Percent is above 80% for 5 min», sobre `crm-production` `[transcrito]`. Llegó al minuto porque la alerta evalúa los 5 minutos anteriores, en los que el disco ya estaba por encima del 5 %.

## Correcciones de la revisión independiente

La revisión independiente de la 13.3 (AC-15), del 2026-09-30, informó 12 hallazgos y 3 observaciones. Cada uno se verificó contra el código o el servidor antes de aceptarlo. Lo que se corrigió en el código tiene su salida acá.

**En el servidor**, para los hallazgos 6 y 9, que la revisión marcó como inferidos:

```
rw,nosuid,nodev,noexec,relatime
RestartUSec=5s
StartLimitIntervalUSec=10s
StartLimitBurst=5
```

(`findmnt -no OPTIONS /proc` y los límites de arranque de `crm-production`). `/proc` no tiene `hidepid`: cualquier usuario local lee los argumentos de un proceso. Y con 5 s entre reinicios, 5 arranques en 10 s no se alcanzan nunca: la aplicación reintenta para siempre en lugar de quedar detenida.

**El script del aviso** ya no pasa la URL como argumento de `curl`, sino por su configuración en la entrada estándar (`--config -`). Probado en local, sin ninguna URL real:

```
sintaxis OK
Aviso de 'backup' enviado.
exit 0
El aviso de 'backup' no llego al servicio externo (curl salio con 6).
exit 1
El aviso de 'backup' no llego al servicio externo (curl salio con 22).
exit 1
```

(`bash -n`, y el script con `https://example.com/`, con un host que no existe y con una ruta que da `404`). **Instalado en el droplet el 2026-10-01**, sin desplegar la aplicación (`9ffd112` no toca `src/`), con autorización del usuario. Se copió el archivo de `git show 9ffd112:deploy/production/crm-heartbeat.sh`, sin ningún CR:

| Paso | Resultado |
| --- | --- |
| Script instalado antes | sha256 `e11c79e5…46df`, igual al de `579397e` |
| Script de `9ffd112` | sha256 `7e2999d9…976c`, verificado en el droplet con `sha256sum -c` antes de instalarlo; `bash -n` sin error |
| `install -m 0755 -o root -g root` | `/usr/local/bin/crm-heartbeat.sh`: `755 root root`, sha256 `7e2999d9…976c`; `heartbeat.env` sigue `600 root` |
| Los tres avisos con `systemctl start crm-heartbeat@<trabajo>`, corridos por el usuario (el clasificador de permisos bloqueó la prueba) | `success` y «Aviso de '<trabajo>' enviado.» en `backup`, `offsite` y `restore-check` `[transcrito]` |
| Healthchecks.io | los tres chequeos con un ping nuevo a esa hora, confirmado por el usuario `[transcrito]` |

La copia del repositorio en el droplet, `/srv/crm-production`, sigue en `579397e`: su `crm-heartbeat.sh` es el anterior hasta el próximo despliegue. La aplicación no se reinició.

**La guarda**, de 126 a 131 casos, todos en verde. Tapa los tres huecos del hallazgo 5: un aviso fuera de `OnSuccess=`, un `OnSuccess=` vacío que vacía la lista, y cualquier uso de la URL fuera de una lista cerrada, que reemplaza a la búsqueda de `echo`. Mutaciones sobre los archivos reales, todas en rojo:

```
mutación: deploy/production/crm-backup.service: «[Unit]» → «[Unit]
OnFailure=crm-heartbeat@backup.service»
     × ningún aviso sale por otro camino que OnSuccess= 8ms
      Tests  1 failed | 130 passed (131)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-backup.service: «OnSuccess=crm-heartbeat@backup.service» → «OnSuccess=crm-heartbeat@backup.service
OnSuccess=»
     × la copia externa corre solo después de un backup exitoso 6ms
     × todo servicio alcanzado desde un timer dispara su aviso 3ms
     × recorre los tres trabajos: el backup, la copia externa y el ejercicio 1ms
     × un trabajo nuevo con timer y sin aviso se detecta 1ms
     × un aviso puesto en [Service] no cuenta: systemd lo ignora ahí 1ms
     × el script acepta exactamente los trabajos que las unidades disparan 1ms
      Tests  6 failed | 125 passed (131)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-heartbeat.sh: «echo "Aviso de '$trabajo' enviado."» → «printf '%s\n' "${!variable}"»
     × el script nunca imprime la URL, ni en el mensaje de curl 9ms
     × un uso nuevo de la URL se detecta 1ms
      Tests  2 failed | 129 passed (131)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-heartbeat.sh: «curl --config - --fail» → «curl --config - -w '%{url_effective}' --fail»
     × el script nunca imprime la URL, ni en el mensaje de curl 6ms
      Tests  1 failed | 130 passed (131)
código de salida: 1
restaurado: bytes idénticos

mutación: deploy/production/crm-heartbeat.sh: «--output /dev/null 2>/dev/null» → «--output /dev/null "$url" 2>/dev/null»
     × el script nunca imprime la URL, ni en el mensaje de curl 6ms
     × la URL no va en los argumentos de curl, que se leen en /proc 1ms
      Tests  2 failed | 129 passed (131)
código de salida: 1
restaurado: bytes idénticos
```

**La última encontró un defecto mío**: en su primera corrida, el caso «la URL no va en los argumentos de curl» quedó en verde, porque miraba línea por línea y la URL estaba en la línea de continuación del comando. Ahora une las líneas continuadas con `\` antes de mirar. La salida de arriba es la de después.

**La tercera mutación de AC-1, repetida entera** con la guarda de después (hallazgo 11):

```
mutación: deploy/production/crm-backup.service: «OnSuccess=crm-backup-offsite.service
OnSuccess=crm-heartbeat@backup.service» → «OnSuccess=crm-backup-offsite.service»
     × todo servicio alcanzado desde un timer dispara su aviso 7ms
     × recorre los tres trabajos: el backup, la copia externa y el ejercicio 1ms
     × un trabajo que pierde su aviso se detecta 1ms
     × un trabajo nuevo con timer y sin aviso se detecta 1ms
     × un aviso puesto en [Service] no cuenta: systemd lo ignora ahí 1ms
     × el script acepta exactamente los trabajos que las unidades disparan 1ms
     × un OnSuccess= vacío debajo del aviso lo borra, como en systemd 0ms
      Tests  7 failed | 124 passed (131)
código de salida: 1
restaurado: bytes idénticos
```

**Observación O-3**, los dos archivos modificados fuera de la lista: `git diff --ignore-cr-at-eol --stat scripts/migrar.ts src/modules/crm/repository.ts` sale vacío. Son solo finales de línea, anteriores a la 13.3, y no entran en ningún commit.
