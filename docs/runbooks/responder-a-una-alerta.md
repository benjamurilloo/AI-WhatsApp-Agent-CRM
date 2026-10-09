# Runbook — responder a una alerta de producción

Qué hacer cuando llega una alerta de `crm.vixoraai.app` ([brief-13.3](../decisions/brief-13.3-disponibilidad-y-observabilidad.md)). Qué vigila cada alerta y cómo se instala está en el [README de producción](../../deploy/production/README.md#monitoreo-y-alertas).

**Este texto se ejecuta, no se lee.** Si un paso no funciona, el defecto es del runbook y se corrige acá, como en el [runbook de restauración](restaurar-la-base.md).

**Qué está ejecutado y qué no:**

| Alerta | Estado |
| --- | --- |
| El CRM no responde o `/api/health` da `503` | **provocado** el 2026-09-30: la aplicación detenida (AC-8) y la base detenida con la aplicación arriba (AC-9). Las alertas de caída y de recuperación llegaron las dos veces |
| Un aviso de vida no llegó | **provocado** el 2026-09-30 con un chequeo de prueba que recibió un ping y no más (AC-10): la alerta llegó por email y Telegram. El diagnóstico de abajo no se ejecutó, porque ningún trabajo real falló |
| La base pasó de 1 GB | **configurada en la 17.5**; se provoca al desplegarla, con el umbral bajado ([README de producción](../../deploy/production/README.md) §El aviso de tamaño de la base) |
| Disco o memoria | La de disco, **provocada** el 2026-09-30 con el umbral bajado a 5 % (AC-11). La de memoria, **configurada y no provocada** |
| El certificado vence pronto | **configurada y no provocada**: alerta de Uptime a 14 días del vencimiento |
| `/api/health` lento | **configurada y no provocada**: alerta de Uptime con más de 2000 ms durante 5 minutos |
| Distribución de `duration_ms` por ruta | **probado** el 2026-09-30 en el droplet, con `jq` 1.7, contra líneas del formateador real de la aplicación ([evidencia-13.3](../decisions/evidencia-13.3-disponibilidad.md)). Contra el journal de producción corre sin error, pero todavía no hay eventos de servicio: la ingestión y la lectura están apagadas |

## Antes de cualquier alerta: tres preguntas

1. **¿Es el CRM o el que mide?** Un monitor externo también se equivoca. Desde la máquina del operador:

   ```
   curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://crm.vixoraai.app/api/health
   ```

   `200` en menos de un segundo, y la alerta sigue abierta: mirar el monitor antes que el servidor. **Pasa de verdad**: el 2026-09-30, dos alertas de caída de Uptime llegaron con el sitio ya arriba, porque cada región avisa por su cuenta y tarde. Por el mismo motivo, **no esperar un aviso de recuperación por cada región**: llegan entre 11 y 16 minutos después, y no siempre de todas.
2. **¿Hubo un despliegue en los últimos minutos?** `ssh crm-production 'sudo tail -n 2 /var/lib/crm-production/despliegues; systemctl show crm-production -p ActiveEnterTimestamp'`. Si la caída empezó con el despliegue, lo primero es [volver atrás](../../deploy/production/README.md#volver-atrás), no diagnosticar.
3. **¿Llega el `ssh`?** Si no llega, el droplet entero está caído o sin red: se sigue en [El droplet no responde](#el-droplet-no-responde).

**Anotar la hora de la alerta y la de la recuperación.** El objetivo de disponibilidad (99,5 % mensual, brief-13.3, D-1) se cuenta con el historial del monitor. **El monitor tarda en ver una caída**: cada región consulta cada 3 a 9 minutos, y el aviso llegó entre 4,5 y 9,5 minutos después de la falla. Una caída de menos de unos minutos puede no verse (una de 40 segundos, el 2026-09-30, no produjo alerta), y eso es un límite del instrumento, no un dato.

## El CRM no responde, o `/api/health` da `503`

`/api/health` consulta la base: `503` quiere decir que la aplicación responde y la base no. Un timeout o un `502` quiere decir que no responde la aplicación.

```
ssh crm-production 'systemctl is-active crm-production postgresql@18-main nginx
curl -s -o /dev/null -w "local: %{http_code}\n" http://127.0.0.1:3000/api/health
df -h / | tail -1; free -m | sed -n 2p
sudo journalctl -u crm-production -n 30 --no-pager'
```

| Lo que se ve | Qué hacer |
| --- | --- |
| `crm-production` no está `active` | `sudo systemctl restart crm-production`. Tiene `Restart=on-failure` con 5 s entre intentos, y el límite de systemd es de 5 arranques en 10 s, que así no se alcanza: **si falla, reintenta para siempre** y se ve `activating (auto-restart)`, no `inactive`. `inactive` quiere decir que alguien la detuvo, o que se detuvo con `postgresql` (fila de abajo). El journal dice cuál. *Corregido el 2026-09-30 por la revisión independiente de la 13.3 (hallazgo 9)*: decía que quedaba caída tras cinco fallas seguidas |
| `postgresql` no está `active`, o `/api/health` da `503` | La base corre en `postgresql@18-main.service`; `postgresql.service` es un envoltorio que queda `active (exited)` aunque la base esté caída. Mirar `systemctl status postgresql@18-main`, y `sudo systemctl start postgresql@18-main` con `sudo journalctl -u postgresql@18-main -n 50`. Si no arranca, mirar el disco primero: un disco lleno es la causa más común |
| Alguien detuvo `postgresql` (el envoltorio) | `crm-production` tiene `Requires=postgresql.service`, así que **se detuvo con ella, y no vuelve sola**: `sudo systemctl start postgresql crm-production`. Un `restart` de `postgresql` sí reinicia las dos |
| Local da `200` y desde afuera no | El problema está entre nginx y afuera: `sudo nginx -t`, `sudo systemctl status nginx`, y el certificado (`sudo certbot certificates`) |
| El disco al 100 % | Ir a [Disco](#disco-por-encima-del-80-) antes de reiniciar nada: reiniciar con el disco lleno no arregla nada |
| La base arranca, pero los datos están mal | No es esta alerta: es el [runbook de restauración](restaurar-la-base.md) |

Reiniciar la aplicación no pierde datos: no guarda estado propio fuera de la base. Reiniciar PostgreSQL corta las conexiones abiertas, y la aplicación reconecta en el pedido siguiente: el 2026-09-30, con la base detenida cinco minutos y vuelta a levantar, `/api/health` dio `200` en el primer pedido, sin reiniciar la aplicación (AC-9).

## `/api/health` tarda más de 2 segundos

La alerta de latencia de Uptime mide `/api/health` desde cuatro regiones. Lo normal, el 2026-09-30, era de 0,25 s a 0,8 s según la región. `/api/health` hace una sola consulta a la base, así que si tarda, casi siempre es la máquina o la base, no la aplicación.

```
curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://crm.vixoraai.app/api/health
ssh crm-production 'uptime; free -m | sed -n 2p; df -h / | tail -1
curl -s -o /dev/null -w "local: %{http_code} %{time_total}s\n" http://127.0.0.1:3000/api/health
sudo -u postgres psql -XAt -c "select count(*), max(now() - query_start) from pg_stat_activity where state = '"'"'active'"'"'"'
```

| Lo que se ve | Qué hacer |
| --- | --- |
| Rápido desde tu máquina y lento en el monitor | Es una región o la red del monitor. Mirar en el panel si es una sola región: si es una, esperar |
| Lento también en local, con la carga (`uptime`) alta | Algo consume la máquina. `ps -eo pid,user,pcpu,rss,comm --sort=-pcpu \| head` dice qué. Un despliegue en curso lo explica (`next build`) |
| Lento en local, con consultas activas largas | La base está ocupada o bloqueada. Anotar la hora y la consulta más larga; no se cancela nada sin entender qué es |
| Coincide con la alerta de memoria | Seguir en [Memoria](#memoria-por-encima-del-90--sostenida) |

## El droplet no responde

Si ni el `ssh` llega:

1. El panel del proveedor: el estado del droplet y su gráfico de CPU y memoria de la última hora.
2. La consola web del droplet, desde el panel. Si responde, seguir con la sección anterior desde ahí.
3. Si no responde tampoco la consola: apagar y encender desde el panel. Es el último recurso, porque un corte de energía a PostgreSQL es una recuperación de su WAL en el arranque. PostgreSQL está hecho para eso, pero no se hace por gusto.
4. Si el droplet no vuelve, es el caso «droplet perdido» del [runbook de restauración](restaurar-la-base.md), §Producción. **Está diseñado y no ejecutado.**

## Un aviso de vida no llegó

Cada trabajo manda su aviso **después** de terminar bien. Que el aviso no llegue tiene tres causas posibles, y el diagnóstico las separa:

```
ssh crm-production 'T=crm-backup   # o crm-backup-offsite, o crm-restore-check
systemctl list-timers --all --no-pager | grep -E "crm-(backup|restore)"
systemctl status "$T.service" --no-pager -n 0
sudo journalctl -u "$T.service" -n 40 --no-pager
sudo journalctl -u "crm-heartbeat@*" -n 10 --no-pager'
```

| Lo que se ve | Qué pasó | Qué hacer |
| --- | --- | --- |
| El servicio terminó con error | **El trabajo falló.** Es la alerta que importa | Leer su journal, corregir y volver a correrlo a mano: `sudo systemctl start crm-backup.service`. Correr el backup dispara también la copia externa y los dos avisos |
| El servicio no corrió cuando tocaba | El timer no lo disparó | `systemctl list-timers` y `systemctl status crm-backup.timer`. Si está `inactive`: `sudo systemctl enable --now crm-backup.timer` |
| El servicio terminó bien y el aviso dice `curl salio con N` | **Falsa alarma**: el trabajo está bien y el aviso no salió | `6`: DNS; `7`: sin conexión; `28`: timeout; `22`: el servicio de avisos rechazó la URL. Revisar `/etc/crm-production/heartbeat.env` con `sudo nano`, sin copiar la URL a ningún lado |
| El aviso dice `Falta HEARTBEAT_URL_...` | Falta una línea en `heartbeat.env` | Agregarla con `sudo nano /etc/crm-production/heartbeat.env` |

**Qué tan urgente es cada uno:**

- **El backup diario**: el mismo día. El dump anterior sigue ahí, pero cada día sin backup es un día de datos que no se podrían recuperar.
- **La copia externa**: el mismo día. Sin ella, perder el droplet es perder los datos.
- **El ejercicio de restauración**: **es el más grave de los tres**, aunque sea mensual. Si falla, el último backup puede no servir. Leer el journal entero antes de volver a correrlo: `sudo journalctl -u crm-restore-check.service --since today --no-pager`. Si dejó una base de restauración viva, `sudo -u postgres psql -l` la muestra, y el [runbook de restauración](restaurar-la-base.md), §Ejercicio mensual, dice cómo borrarla.

## La base pasó de 1 GB

Es un aviso de vida que no llegó, el de `db-size`, y no una caída: el CRM sigue funcionando. Desde la 17.5 ([brief-17.5](../decisions/brief-17.5-imagenes-de-producto.md), D-9), `crm-db-size.service` corre cada día después del backup y solo manda su aviso mientras la base esté bajo 1 GB.

```
ssh crm-production 'sudo journalctl -u crm-db-size.service -n 5 --no-pager; df -h / | tail -1'
```

| Lo que se ve | Qué pasó | Qué hacer |
| --- | --- | --- |
| `FALLA: la base ocupa … por encima del umbral` | **La base pasó el umbral del [ADR 0018](../decisions/0018-imagenes-de-producto.md), punto 3** | No es urgente mientras el disco tenga lugar: el disco carga cerca de 16 veces la base. Se abre la decisión del almacenamiento con un ADR que enmiende ese punto. Si además suena la de disco, ir a [Disco](#disco-por-encima-del-80-) |
| No corrió hoy | El backup no terminó bien, así que no lo disparó | Es la otra alerta, la del backup: [Un aviso de vida no llegó](#un-aviso-de-vida-no-llegó) |
| Existe `/etc/crm-production/db-size.env` | Quedó el umbral bajado de una prueba | Borrarlo y correr `sudo systemctl start crm-db-size.service` |

## Disco por encima del 80 %

```
ssh crm-production 'df -h /
sudo du -sh /var/backups/crm-production /var/log/journal /var/lib/postgresql /srv/crm-production /var/lib/crm-production 2>/dev/null | sort -h'
```

- **Los backups**: la rotación local guarda `BACKUP_KEEP` copias (`/etc/crm-production/backup.env`). Si crecieron porque creció la base, es la señal de ampliar el disco, no de guardar menos copias.
- **El journal**: `sudo journalctl --vacuum-size=500M` libera espacio ya. Es una salida de emergencia: **la retención del journal se decide en la 13.4**, porque guarda identificadores de organización.
- **PostgreSQL**: si la base es lo que creció, ampliar el volumen del droplet desde el panel del proveedor. Es un cambio con costo: lo decide el usuario.

## Memoria por encima del 90 % sostenida

```
ssh crm-production 'free -m; ps -eo pid,user,rss,comm --sort=-rss | head -8'
```

- **Durante un despliegue es esperable**: `next build` usa buena parte de la memoria del droplet durante uno o dos minutos. Si la alerta coincide con un despliegue y se apaga sola, no hay nada que hacer.
- **`next-server` creciendo sin despliegue**: `sudo systemctl restart crm-production`, y registrar la hora y el tamaño que tenía. Si se repite, es un hallazgo con su brief, no un reinicio periódico.

## El certificado vence pronto

```
ssh crm-production 'sudo certbot certificates; systemctl status certbot.timer --no-pager -n 0; sudo certbot renew --dry-run'
```

`certbot.timer` intenta renovar dos veces por día. Si el `--dry-run` falla, su mensaje dice por qué: casi siempre es el DNS o el puerto 80.

## Diagnosticar una lectura lenta: la distribución de `duration_ms`

La reevaluación del APM quedó para la 13.5, con tráfico real (brief-13.3, D-6). Lo que hay mientras tanto son los logs: cada pedido a la API de servicio registra su ruta, su código, su `duration_ms` y el `correlation_id` del emisor.

**Por ruta, en una ventana**, con percentiles de rango más cercano:

```
ssh crm-production "sudo journalctl -u crm-production -o cat --since '-1 hour' | jq -Rnr '
[inputs | fromjson? | select(type == \"object\" and .duration_ms != null)]
| group_by(.route)
| map((map(.duration_ms) | sort) as \$d | (\$d | length) as \$n
    | [.[0].route, \$n, \$d[((\$n * 0.50) | ceil) - 1], \$d[((\$n * 0.95) | ceil) - 1], \$d[-1],
       (map(select(.code != \"OK\")) | length)])
| ([\"ruta\", \"n\", \"p50_ms\", \"p95_ms\", \"max_ms\", \"errores\"], .[])
| @tsv'"
```

Descarta las líneas que no son JSON, que en el journal de la aplicación son las del arranque de Next. **`errores` cuenta solo los eventos con duración**: un error que corta antes de medir no tiene `duration_ms` y no entra en la tabla.

**Un turno lento del agente**, por su correlación:

```
ssh crm-production "sudo journalctl -u crm-production -o cat --since '-1 day' | jq -Rc 'fromjson? | select(type == \"object\" and .correlation_id == \"<el id del turno>\")'"
```

**Cuándo esto deja de alcanzar**, y la reevaluación del APM se adelanta: cuando un turno lento o fallido del agente no se pueda explicar con estas dos consultas. Por ejemplo, un pedido con `duration_ms` bajo y un turno lento del lado del agente, o un tiempo que no se reparte entre la base y la aplicación.

## Lo que este runbook no cubre

- **Lo que hace el agente cuando el CRM no responde.** Es del agente: el CRM no garantiza estar disponible en cada turno ([contrato de lectura](../contracts/read-v1.md), §Disponibilidad).
- **Una caída del proveedor entero.** Con un solo droplet en una sola región, no hay a dónde mover el servicio. Está aceptado en el objetivo de D-1.
- **Staging.** No tiene alertas (brief-13.3, alcance excluido).
