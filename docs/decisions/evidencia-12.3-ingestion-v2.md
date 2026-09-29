# Evidencia de la 12.3 — Contrato de ingestión v2

Salidas de las corridas en staging de la [brief-12.3](brief-12.3-contrato-de-ingestion-v2.md). Las tomó quien hizo el trabajo, sin revisión independiente todavía (D-11). Datos sintéticos: la organización del seed del piloto (`5eed0000-0000-4000-9000-000000000001`) y teléfonos del rango `+54911555500xx`.

## 12.3.2 — Despliegue y borde real, 2026-09-25

Autorizado por el usuario en tres pasos: el script, el despliegue y la prueba en staging. El paso 2 se detuvo una vez porque el clasificador del modo automático bloqueó la escritura remota; siguió cuando el usuario agregó el permiso `Bash(ssh crm-staging:*)`.

### AC-13 — Despliegue siguiendo el README (E-1)

**Antes**: staging corría `f241f62`, con 21 migraciones (`0000` a `0020`). `/login` respondía `200`, la API de lectura `404` y la ingestión v1 `404`.

**Backup previo**, con `sudo systemctl start crm-backup.service`: `Result=success`, `ExecMainStatus=0`.

```
backup: /var/backups/crm-staging/crm_staging-20260925T231942Z.dump
tamano: 74533 bytes
sha256: 630ecf99bca601bdc458354a1c9a8383389a3b96de8753b8b836c7d4b5015d0f
rotado: /var/backups/crm-staging/crm_staging-20260922T230050Z.dump
```

La rotación es la política de la 9.2, no un efecto de esta etapa.

**Código y dependencias**, como `benja`: el árbol del servidor estaba limpio. `git reset --hard origin/main` dejó `49a3cb4 Implementar la etapa 12.3.1 — Contrato de ingestión v2`. `npm ci` terminó bien, con un aviso de que no corrió el `postinstall` de `esbuild`; no tuvo efecto, porque las migraciones corren con `tsx`, que usa `esbuild`, y funcionaron.

**Migraciones**, con la línea del README tal cual:

```
> tsx scripts/migrar.ts
Migraciones aplicadas.
exit=0
```

De 21 a **24** migraciones en `drizzle.__drizzle_migrations`: `0021`, `0022` y `0023`.

**Build: la línea del README falló**, que es justamente lo que E-1 quería descubrir.
- El primer `npm run build` murió en el chequeo de tipos: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` y `Failed to type check.` En esta máquina Node reserva **529 MB** de heap por defecto (`v8.getHeapStatistics().heap_size_limit`), y la memoria no era el límite: había 520 MB libres y 1,8 GB de swap.
- **El reinicio corrió igual**, porque el README lo tenía en otra línea y el comando que armé los encadenaba con `;`. Con el `.next` a medio escribir, el servicio no arrancó: **staging respondió `502` durante 3 minutos y 11 segundos**, de 23:26:07 a 23:29:18 UTC, con 22 arranques fallidos en el journal. **Es un error de quien hizo el despliegue**, no solo del README.
- **Lo que funcionó**: `NODE_OPTIONS=--max-old-space-size=1536` en el build, con el reinicio encadenado con `&&`. `build_exit=0`, el servicio quedó `active` y `/login` volvió a `200` a las 23:29:18.
- **El README quedó corregido** con esa línea y el motivo de cada cambio ([deploy/staging/README.md](../../deploy/staging/README.md), §Desplegar un cambio).

**Comprobaciones posteriores** (README, §Verificar después de desplegar):

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Los nueve archivos contra lo versionado | **cero diferencias** en los nueve: nginx, `crm-staging.service`, los dos scripts de backup, las cuatro unidades y la configuración de PostgreSQL |
| 2 | Un solo salto de proxy | **cumplida**, con control. Un ingreso fallido desde el navegador (Playwright headless contra `/login`, con un email y una clave inexistentes) dejó un `key_hash` a las 23:45:00, **igual** al `sha256` de la IP pública de quien probó. El mismo intento por un túnel SOCKS a través del servidor (`ssh -f -N -D 1080 crm-staging`) dejó otro `key_hash` a las 23:45:19, **igual** al hash de la IP de salida del túnel y **distinto** del primero. La aplicación ve la IP del cliente |
| 3 | HSTS | `strict-transport-security: max-age=31536000; includeSubDomains` sobre HTTPS; **0** encabezados sobre HTTP |
| 4 | La aplicación solo en loopback | `LISTEN 0 511 127.0.0.1:3000`, `next-server` |
| 5 | El rol de la aplicación no es el dueño | **cumplida**: `delete from audit_logs` con la conexión de `app.env` respondió `ERROR: permission denied for table audit_logs`, y la tabla siguió con sus 14 filas. La primera vez la bloqueó el clasificador del modo automático, porque el comando empezaba con `cd` y no con `ssh crm-staging`; corrió sola después de que el usuario lo confirmara |

### AC-14 — El contrato v2 por el borde real

1. **Credencial** con la línea del README, de alcance `ingest` y `source` `prueba-12-3-2`: `f862cb75-9365-4c3a-ada6-3e1a7eba14eb`. El token se guardó en un archivo local fuera del repositorio y se borró al terminar.
2. **Encendido**: `INGESTION_ENABLED=true` e `INGESTION_ALLOWED_CREDENTIALS=f862cb75-…` en `app.env`, y reinicio. Sin credencial, v1 y v2 respondieron **`401`**; la API de lectura siguió en `404`.
3. **`scripts/probar-ingestion.ts`**, desde fuera de la red del servidor, a las 23:34:30 UTC:

```
# Prueba del contrato de ingestión v2 — https://staging.vixoraai.app/api/ingestion/v2/events
Corrida 18b21df0, correlación prueba-12-3-2-18b21df0
client.resolved → 200
conversation.resolved (audio) → 200    conversación: conv-propuesta-0001-18b21df0 · open
message.recorded (agente) → 201
message.recorded (reenvío idéntico) → 200
message.recorded (persona, imagen) → 201
message.recorded (entrada sin teléfono) → 201
conversation.escalated → 200
409 mensaje ya registrado → 409
409 otro contenido → 409
400 (los 7 fixtures inválidos) → 400, cada uno con sus campos
400 correlación inválida → 400
401 sin credencial → 401
Pedidos enviados: 18
**Fallas: 0**
```

   Cada respuesta de éxito pasó un esquema estricto (un campo de más es falla), con `Cache-Control: no-store` y el `X-Correlation-Id` devuelto. Los dos `409` trajeron el `reason` esperado. El script se había probado antes contra `next start` local: 0 fallas en 18 pedidos.

4. **Log del servidor** (`journalctl -u crm-staging`, desde las 23:34:25):
   - **18 líneas** de `/api/ingestion/v2/events`: 7 `OK`, 2 `CONFLICT`, 8 `VALIDATION_ERROR` y 1 `UNAUTHENTICATED`;
   - **16** con la correlación de la corrida. Faltan las dos esperables: la correlación inválida no se registra, y el `401` corta antes de validarla;
   - **0** apariciones del token, del teléfono (con y sin `+`), del nombre y de los dos textos.
5. **Apagado**: `INGESTION_ENABLED=false` y la allowlist vacía, reinicio y revocación. `revoked_at = 2026-09-25 23:36:25.430632+00`. v1 y v2 volvieron a `404`, y `/login` a `200`.

**Lo que quedó escrito en staging**, con datos sintéticos: un cliente con el teléfono `+5491155550001` (o el existente con ese teléfono), una conversación `conv-propuesta-0001-18b21df0`, **ahora `pending`**, y **7 filas** de `ingestion_events`: 6 `processed` y 1 `failed` con `error_code = 'message_already_recorded'`. El reenvío idéntico y el `event_payload_mismatch` no agregan filas. Los cuatro mensajes de la conversación quedaron así, leídos de la base: `inbound/audio/—`, `outbound/text/agent`, `outbound/image/person` e `inbound/document/—`. **El tipo y el autor llegan a la base de staging**, y el motivo del `CONFLICT` queda en `error_code`.

**Incidente de manejo del secreto**: al comprobar el log, la etiqueta de un `echo` de quien hizo la prueba imprimió en la conversación con el asistente los **primeros 6 caracteres** del sufijo del token. No quedó en el repositorio, en esta evidencia ni en el servidor. El riesgo es bajo, porque quedan 37 caracteres aleatorios y la credencial se revocó dos minutos después. Aun así viola la regla del propio script, y se registra.

### AC-15 — El plan de la conversación vigente

**Sin medir.** Staging tiene 2 organizaciones, 51 conversaciones, 190 mensajes y 37 clientes: el seed del piloto, **no el volumen de la 9.3** que el brief suponía. La organización más grande tiene 41 conversaciones, y ningún cliente más de 2. Un `EXPLAIN (ANALYZE, BUFFERS)` sobre eso mide una tabla chica, no el plan que importa. **Trasladado a la 13.2 por decisión del usuario** (2026-09-25), entre tres opciones: moverlo, cargar el volumen en staging o medir en local. La 13.2 ya mide planes con volumen, salida cruda y tiempo antes de los datos reales, y el Roadmap lleva la enmienda fechada.

Las comprobaciones 2 y 5 las autorizó el usuario después del resto, con dos permisos más para el túnel. Dejaron **dos filas** en `login_attempts`, lejos del umbral de 20. El túnel se cerró con `Stop-Process`, porque Git Bash en Windows no trae `pkill`, y se comprobó cerrado.

**Nivel de la 12.3.2 hasta acá**: el contrato v2 está **validado en staging** con requests sintéticos a través del borde real (`isolated-runtime`). **No** con un emisor real.

## 12.3.3 — Emisor real, 2026-09-27

Autorizado por el usuario el 2026-09-27: la ventana de staging de 15:00 a 16:00 ART, y tocar staging para abrirla y cerrarla. El emisor es la instancia de n8n del agente, con su brief-3.22 en su repositorio. Esta sección registra lo que el CRM vio de su lado. El informe y las capturas del agente se leyeron como insumo, y lo que el CRM puede ver de su lado (respuestas, log, filas y dashboard) se cruzó antes de aceptarlo. Lo que solo consta en el agente (su serialización, su guarda de nombres) se declara como tal.

### La ventana

1. **Estado previo**: staging en `49a3cb4`, `INGESTION_ENABLED=false`, `/login` `200`, v1 y v2 `404`.
2. **Credencial**: la creó **el usuario en su propia terminal**, con la línea del README, de alcance `ingest` y `source` `agente-12-3-3`: `8c516f09-161a-457b-aebe-373a91496f19`. El token fue directo a la credencial Bearer `CRM Ingestion v2 - staging` de la instancia del agente. **No pasó por la conversación con el asistente**, a diferencia de la 12.3.2.
3. **Encendido**, a las 18:10 UTC: copia previa de `app.env` en `/etc/crm-staging/app.env.bak-12-3-3`; `INGESTION_ENABLED=true` y la credencial en la allowlist, y reinicio. Sin credencial, v1 y v2 respondieron **`401`**; la API de lectura siguió en `404` y `/login` en `200`.
4. **Corrida del agente**: de 18:21:33Z a 18:23:24Z, 7 pedidos.
5. **Apagado**, a las 18:30 UTC: `INGESTION_ENABLED=false` y la allowlist vacía, reinicio y revocación. v1 y v2 volvieron a `404`, y `/login` a `200`. `revoked_at = 2026-09-27 18:30:28.943417+00`, leído por el usuario en su terminal.

### AC-16 — Los pedidos del emisor real

| # | Evento | Correlación | Respuesta de staging | Línea del log del CRM |
|---|---|---|---|---|
| 1 | `client.resolved` | turno | `200 accepted` | 18:21:34.556Z `OK`, 123 ms |
| 2 | `conversation.resolved` | turno | `200 accepted`, `open` | 18:21:35.034Z `OK`, 41 ms |
| 3 | `message.recorded` de salida, `sent_by: agent` | turno | `201 accepted` | 18:21:35.596Z `OK`, 34 ms |
| 4 | `message.recorded` de salida, `sent_by: agent` | turno | `201 accepted` | 18:21:36.029Z `OK`, 27 ms |
| 5 | `conversation.escalated` | turno | `200 accepted`, `pending` | 18:21:36.486Z `OK`, 26 ms |
| 6 | reenvío idéntico del 1 | turno | `200 duplicate`, el mismo `client.id` | 18:21:36.992Z `OK`, 24 ms |
| 7 | `client.resolved` con `display_name` vacío, **deliberado** | la suya | `400 VALIDATION_ERROR`, `client.display_name` | 18:23:23.604Z `VALIDATION_ERROR`, el mismo `request_id` `ebdcbc93-…` |

- Correlación del turno: `probe-12-3-3-p20260927182133`; la del caso deliberado: `probe-12-3-3-ac6-b20260927182323`. **Las siete líneas del log llevan la correlación**, la organización del piloto y el `source` `agente-12-3-3`, y **ninguna** lleva token, teléfono ni texto del mensaje.
- **Ningún rechazo inesperado.** El único `400` fue deliberado: el emisor salteó a propósito su propia guarda, que en producción convierte el nombre vacío en `null`.
- **La base de staging** (consulta del usuario en su terminal, sobre `source = 'agente-12-3-3'`):

  ```
         event_type       |  status   | error_code | count
  ------------------------+-----------+------------+-------
   client.resolved        | processed |            |     1
   conversation.escalated | processed |            |     1
   conversation.resolved  | processed |            |     1
   message.recorded       | processed |            |     2
  ```

  Son las **cinco filas** que da la cuenta a mano: el reenvío no dejó otra, y el `400` no deja fila (brief-6.5.1, D-6).

### AC-17 — Las capturas como fixtures

Seis archivos `tests/fixtures/ingestion/v2/captured-*.json`, con `"shape": "captured"` y el cuerpo como texto, **tal como lo registró la captura del emisor**: el log del CRM no guarda el cuerpo, así que su fidelidad se apoya en la captura (ver el cruce de `payload_hash` más abajo). El reenvío no se guardó, porque es idéntico al pedido 1. `contract-v2.test.ts` valida ese texto con `parseIngestionEventV2` y da lo mismo que staging: cinco válidos y un inválido en `client.display_name`. Un caso nuevo exige que las capturas cubran los cuatro tipos y una salida con autor, y ninguna puede contener un prefijo `crm_…_`. **Corrida de mutación**: sin el `sent_by` de una captura, el test falla. El archivo se restauró.

**Cruce de los cuerpos con staging** (revisión independiente, H-2). El log del CRM no guarda el cuerpo, así que la fidelidad de las capturas se comprobó por el `payload_hash` que staging calculó y guardó al recibir cada evento. La consulta la corrió el usuario en su terminal:

```
              external_ref               |                           payload_hash
-----------------------------------------+------------------------------------------------------------------
 wa-cli-wamid-fict-p20260927182133-0001  | cb0422d245725a082ff338b0b425f274813931d2a83bd3dbbeb66f08d4b3126a
 wa-conv-wamid-fict-p20260927182133-0001 | f835026c1d29be9491f03efccf0e9089f331d5b7cc728b8c5e0edf8b43565304
 wa-out-wamid-out-p20260927182133-0001   | 0f09768b90a14ab4bed11711e8b95211decc58e57469bc618531f16b5d625d2e
 wa-out-wamid-out-p20260927182133-0002   | 33e8448551500cb91677d94ee238fb371ae781380f772d4e9659149881b7fd9e
 wa-esc-wamid-fict-p20260927182133-0001  | 3e284159002b38b32964f646670d7314226d9d1f643cfc79e98090ac58284e0d
```

**Los cinco coinciden** con el `expected.payload_hash` de su fixture. Staging normalizó y hasheó lo que recibió, así que las capturas guardan el mismo evento que llegó. El pedido inválido no deja fila y no tiene con qué cruzarse: su `400` y su campo se cruzan con el log.

### AC-19 — Pedidos por turno y R-6

- **5 pedidos de escritura en el turno de la prueba** (un mensaje, dos segmentos y la derivación; coincide con la fórmula `2 + segmentos`, más 1 si deriva, que informa el emisor, observada en un solo turno), **0 lecturas** (esta prueba era solo de ingestión) y **ningún `429`**. Registrado en [Risks](../planning/Risks.md).
- **R-6 ni confirmada ni descartada**: el nombre sintético no trae el teléfono. La regla del CRM (`isPhoneAsName`) sigue como defensa, y la guarda del emisor usa la misma regla.

### AC-18 — La métrica 12 con eventos del emisor real (O-34)

**Conteo a mano sobre `ingestion_events`**, aplicando la regla de [MetricsCatalog](../analytics/MetricsCatalog.md) §12: de las cinco filas, `client.resolved` no cuenta (desde la 12.1) y `conversation.escalated` tampoco (desde la 12.2). Quedan **3 eventos**: `conversation.resolved` y los dos `message.recorded`. Los tres son `processed`, así que hay **0 fallidos** y la tasa es **0 %**, sin grupos.

**El dashboard de staging**, leído por el usuario para la organización del piloto con el período del 27/09/2026 al 27/09/2026 en `America/Argentina/Buenos_Aires`: **«0,0 %», «0 fallidos de 3 eventos»**. **Coincide.**
**Supuesto comprobado** (revisión independiente, H-8): el conteo a mano filtra por `source` y el dashboard cuenta por organización y período. Una consulta de la organización del piloto entre `2026-09-27 03:00+00` y `2026-09-28 03:00+00` (el 27/09 en ART) dio **5 filas**, las mismas cinco: ese día no hubo otros eventos de ingestión.

**Error de quien hizo el trabajo, registrado**: antes de mirar el dashboard, el valor esperado se anunció como **4 eventos**, olvidando que `conversation.escalated` no cuenta. El dashboard dio 3, y la regla escrita en el catálogo le da la razón. El recuento se corrigió contra la regla, no contra la pantalla.

Las otras métricas de ese día también coinciden con el turno:
- **1** conversación iniciada, con actividad y respondida, con **1** cliente único;
- **1** mensaje entrante, **2** salientes y un promedio de **3,0** mensajes por conversación;
- **cobertura del 100 %** y una **mediana de primera respuesta de 0,1 min**: 7,5 s entre 17:59:57.000Z y 18:00:04.500Z;
- **1 conversación `pending`**, por la derivación.

**Nivel de la 12.3.3**: el contrato de ingestión v2 queda **validado en integración** (`producer-consumer`), con el agente como emisor y datos sintéticos. **No** es el turno completo (12.5) ni producción, y el turno no recorrió la cadena real del agente.

### Limitaciones

1. **El turno fue sintético.** Ningún mensaje real de WhatsApp recorrió la cadena del agente, y su emisor sigue sin cablear al pipeline.
2. **La referencia devuelta no se puso a prueba**: el CRM devolvió la misma que se propuso, así que la corrida no distingue si el emisor usaría otra (el AC-3 de ellos). Ni `409 conversation_ref_taken` ni `message_already_recorded` se ejercitaron con el emisor real.
3. **Los encabezados de las capturas son los que el emisor dice que manda**, no los que n8n puso en el pedido. La correlación sí se ve del lado del CRM, en el log.
4. **El turno consolidado del agente** (su H-2) no afectó esta prueba, que usó un turno de un solo mensaje. Es condición de entrada de la 12.5.
