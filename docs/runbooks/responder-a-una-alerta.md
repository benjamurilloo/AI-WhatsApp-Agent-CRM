# Runbook — responder a una alerta de producción

Qué hacer cuando llega una alerta de `crm.vixoraai.app` ([brief-13.3](../decisions/brief-13.3-disponibilidad-y-observabilidad.md)). Qué vigila cada alerta y cómo se instala está en el [README de producción](../../deploy/production/README.md#monitoreo-y-alertas).

**Este texto se ejecuta, no se lee.** Si un paso no funciona, el defecto es del runbook y se corrige acá, como en el [runbook de restauración](restaurar-la-base.md).

**Qué está ejecutado y qué no:**

| Alerta | Estado |
| --- | --- |
| El CRM no responde o `/api/health` da `503` | **diseñado**. Se provoca en la 13.3.2 (AC-8 y AC-9) |
| Un aviso de vida no llegó | **diseñado**. Se provoca en la 13.3.2 (AC-10) |
| Disco o memoria | **diseñado**. La de disco se provoca en la 13.3.2 (AC-11); la de memoria no se provoca |
| El certificado vence pronto | **diseñado**, sin falla provocada: depende de lo que ofrezca la herramienta de D-2 |
| Distribución de `duration_ms` por ruta | **probado** el 2026-09-30 en el droplet, con `jq` 1.7, contra líneas del formateador real de la aplicación ([evidencia-13.3](../decisions/evidencia-13.3-disponibilidad.md)). Contra el journal de producción corre sin error, pero todavía no hay eventos de servicio: la ingestión y la lectura están apagadas |

## Antes de cualquier alerta: tres preguntas

1. **¿Es el CRM o el que mide?** Un monitor externo también se equivoca. Desde la máquina del operador:

   ```
   curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://crm.vixoraai.app/api/health
   ```

   `200` en menos de un segundo, y la alerta sigue abierta: mirar el monitor antes que el servidor.
2. **¿Hubo un despliegue en los últimos minutos?** `ssh crm-production 'sudo tail -n 2 /var/lib/crm-production/despliegues; systemctl show crm-production -p ActiveEnterTimestamp'`. Si la caída empezó con el despliegue, lo primero es [volver atrás](../../deploy/production/README.md#volver-atrás), no diagnosticar.
3. **¿Llega el `ssh`?** Si no llega, el droplet entero está caído o sin red: se sigue en [El droplet no responde](#el-droplet-no-responde).

**Anotar la hora de la alerta y la de la recuperación.** El objetivo de disponibilidad (99,5 % mensual, brief-13.3, D-1) se cuenta con el historial del monitor. Una caída que el monitor no vio porque duró menos de un minuto no cuenta, y eso es un límite del instrumento, no un dato.

## El CRM no responde, o `/api/health` da `503`

`/api/health` consulta la base: `503` quiere decir que la aplicación responde y la base no. Un timeout o un `502` quiere decir que no responde la aplicación.

```
ssh crm-production 'systemctl is-active crm-production postgresql nginx
curl -s -o /dev/null -w "local: %{http_code}\n" http://127.0.0.1:3000/api/health
df -h / | tail -1; free -m | sed -n 2p
sudo journalctl -u crm-production -n 30 --no-pager'
```

| Lo que se ve | Qué hacer |
| --- | --- |
| `crm-production` no está `active` | `sudo systemctl restart crm-production`. Tiene `Restart=on-failure`, así que si está caída es porque falló cinco veces seguidas o porque alguien la detuvo. El journal dice cuál |
| `postgresql` no está `active` | `sudo systemctl start postgresql` y `sudo journalctl -u postgresql -n 50`. Si no arranca, mirar el disco primero: un disco lleno es la causa más común |
| Local da `200` y desde afuera no | El problema está entre nginx y afuera: `sudo nginx -t`, `sudo systemctl status nginx`, y el certificado (`sudo certbot certificates`) |
| El disco al 100 % | Ir a [Disco](#disco-por-encima-del-80-) antes de reiniciar nada: reiniciar con el disco lleno no arregla nada |
| La base arranca, pero los datos están mal | No es esta alerta: es el [runbook de restauración](restaurar-la-base.md) |

Reiniciar la aplicación no pierde datos: no guarda estado propio fuera de la base. Reiniciar PostgreSQL corta las conexiones abiertas, y la aplicación reconecta en el pedido siguiente.

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
