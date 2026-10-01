# Observar el primer negocio

Qué se mide durante la ventana de observación del primer negocio, cómo, y **qué se decide con cada resultado** ([brief-13.5](../decisions/brief-13.5-primer-cliente.md), D-7). Las reglas de decisión se escribieron el 2026-10-01, **antes de ver un solo dato real**, para que el resultado no las acomode.

**La ventana**: 14 días desde la apertura al negocio ([alta de un negocio](alta-de-un-negocio.md), paso 6), salvo que el usuario fije otra. Las mediciones se corren al final de la ventana, y la de privacidad además cada día.

**Lo que sale de acá son recuentos y tiempos**, nunca un mensaje, un nombre, un teléfono ni un identificador. Las consultas están escritas para devolver solo eso.

Los comandos son para producción. En el ensayo de staging (brief-13.5, AC-4) se cambian `crm-production` por `crm-staging` y la base por `crm_staging`.

## 1. Capacidad por credencial

**Qué responde**: si el límite de 120 pedidos por minuto por credencial alcanza ([Risks](../planning/Risks.md), fila 24). Era una estimación.

`ingestion_rate_windows` guarda solo la ventana actual de cada credencial, así que la historia sale del journal. Cada alcance tiene una sola credencial por negocio, y la ruta dice el alcance: las de ingestión son `ingest`; `products` y `knowledge`, `read`; `messages`, `context`.

```
ssh crm-production "sudo journalctl -u crm-production -o cat --since '-14 days' | jq -Rnr '
[inputs | fromjson? | select(type == \"object\" and .organization_id != null and .route != null)
 | {scope: (if (.route | startswith(\"/api/ingestion\")) then \"ingest\"
            elif (.route | startswith(\"/api/read/v1/messages\")) then \"context\"
            elif (.route | startswith(\"/api/read\")) then \"read\" else null end),
    minute: .time[0:16], limited: (.code == \"RATE_LIMITED\")}
 | select(.scope != null)]
| group_by(.scope)
| map(.[0].scope as \$s | (map(select(.limited)) | length) as \$lim
    | (group_by(.minute) | map(length) | sort) as \$m | (\$m | length) as \$n
    | [\$s, \$n, \$m[-1], \$m[((\$n * 0.99) | ceil) - 1], \$lim])
| ([\"alcance\", \"minutos_con_pedidos\", \"max_por_minuto\", \"p99_por_minuto\", \"rechazados_por_tasa\"], .[])
| @tsv'"
```

Cuenta los pedidos que llegaron a autenticarse con una organización: un `401` no tiene `organization_id`, y no cuenta. **Límite**: el journal guarda 31 días; la medición se corre antes de que la ventana se pierda.

**Regla de decisión**:

- algún `rechazados_por_tasa` mayor que 0, o un turno del agente que falló por tasa: **condición de detención 4**. Se decide antes de seguir, con los números;
- `max_por_minuto` en 96 o más (el 80 % del límite): se registra y se abre una tarea para revisar el límite antes de un segundo negocio;
- por debajo: el límite alcanza para este negocio, y se registra el margen medido.

## 2. Clientes con el teléfono como nombre (R-6)

**Qué responde**: con qué frecuencia el emisor manda el teléfono como nombre. El CRM crea «Sin nombre» cuando no llega nombre, pero un nombre que es un número sin `+` pasa ([evidencia-12.5](../decisions/evidencia-12.5-turno-completo.md), 12.5.2).

```
read -r -p "Id de la organización: " ORG_ID
ssh crm-production "sudo -u postgres psql -d crm_production -XAt -F' ' -c \"
select count(*) as nuevos,
       count(*) filter (where display_name = 'Sin nombre') as sin_nombre,
       count(*) filter (where display_name ~ '[0-9]{7,}') as nombre_con_numero
from clients
where organization_id = '$ORG_ID' and created_at >= now() - interval '14 days'\""
```

Solo recuentos, en ese orden. El id de la organización no es un dato personal.

**Regla de decisión**:

- `nombre_con_numero` mayor que 0: se le pide al agente que no mande un número como nombre, y se abre una tarea para enmascararlo para `viewer` ([Risks](../planning/Risks.md), fila 23);
- `sin_nombre` mayor que la mitad de `nuevos`: la ficha pierde utilidad; se registra y se conversa con el negocio;
- en 0: se registra la frecuencia medida, que es lo que R-6 no tenía.

## 3. Latencia por ruta

El procedimiento es el del [runbook de alertas](responder-a-una-alerta.md), §Diagnosticar una lectura lenta, con `--since '-14 days'`. Da, por ruta, la cantidad, el p50, el p95, el máximo y los errores.

**Regla de decisión**, contra los umbrales de la máquina de producción medidos en la 13.2 (754 ms por consulta y 1508 ms por camino, con datos sintéticos):

- una ruta con p95 por encima de 1508 ms: se lee su plan con los datos reales, como en la 13.2, antes de cerrar;
- una ruta con errores que no sean de negocio (`INTERNAL`): se investiga cada uno por su `request_id`;
- por debajo: se registran los números, que reemplazan a los sintéticos como referencia.

## 4. APM o tracing

**Regla de decisión**, la que dejó escrita la 13.3 (D-6): se adopta una herramienta si en la ventana **hubo un turno lento o fallido del agente que no se pudo explicar** con las dos consultas del runbook de alertas (la distribución y la búsqueda por `correlation_id`). Si no lo hubo, se registra «no se adopta», con la cantidad de turnos revisados.

Un turno se revisa cuando el agente o el negocio lo reportan como lento o fallido. El CRM no ve la calidad de la respuesta del agente.

## 5. Detección de caídas

**Regla de decisión**: si en la ventana hubo una caída real, se compara cuándo empezó (el journal) con cuándo llegó la alerta. Más de 10 minutos, o una caída de 5 minutos o más sin alerta: se revisa la frecuencia del monitor, que hoy avisa entre 4,5 y 9,5 minutos después ([brief-13.3](../decisions/brief-13.3-disponibilidad-y-observabilidad.md), AC-7). Sin caídas, se registra que no hubo ninguna, lo que no prueba nada sobre la detección.

## 6. Privacidad, cada día

**Que H-4 siga en cero**: el script de [alta de un negocio](alta-de-un-negocio.md), paso 5, sin `VERIFICAR_TELEFONO`: busca los teléfonos de los clientes que ya existen.

**Que el journal no tenga números largos**:

```
ssh crm-production "sudo journalctl -u crm-production -o cat --since '-1 day' | grep -cE '[0-9]{10,}'"
```

Cuenta las líneas con diez o más dígitos seguidos, que es la forma de un teléfono. No imprime ninguna.

**Regla de decisión**: cualquiera de los dos distinto de 0 es la **condición de detención 5**. El operador mira las líneas en su terminal, sin copiarlas, y decide; si un teléfono entró por un identificador, se apaga la ingestión ([alta de un negocio](alta-de-un-negocio.md), paso 8).

## 7. Qué se registra al cerrar la ventana

En la evidencia de la subfase: cada tabla de arriba, la regla aplicada y la decisión, con la fecha. Si una regla no se pudo aplicar, se dice cuál y por qué.
