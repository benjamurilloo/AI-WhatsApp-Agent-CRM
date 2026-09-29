# Evidencia de la 12.5 — Turno completo en staging

Salidas de las corridas en staging de la [brief-12.5](brief-12.5-turno-completo-en-staging.md). Las tomó quien hizo el trabajo, sin revisión independiente todavía (D-11). Datos sintéticos: la organización del seed del piloto (`5eed0000-0000-4000-9000-000000000001`) y teléfonos del rango `+54911555500xx`. Ningún token aparece en este archivo, ni entero ni en parte.

## 12.5.1 — Preparación del CRM, 2026-09-27

Autorizado por el usuario el 2026-09-27 en tres pasos: el commit de la etapa, el despliegue con la migración `0024` y una prueba corta de la lectura en staging.

### Antes de staging

- `scripts/conciliar-turnos.ts`: 7 casos contra PostgreSQL real (`tests/integration/conciliar-turnos.test.ts`). Dos corridas de mutación, restauradas:
  - **M26**: sin la detección del faltante, fallan «detecta un mensaje esperado que falta» y «no mezcla organizaciones»;
  - **M27**: sin el filtro por organización en los mensajes, falla «no mezcla organizaciones».
- `scripts/probar-api-lectura.ts`, con el historial: **0 fallas contra `next start` local**, con una credencial `read` y otra `context` creadas en la base de desarrollo y revocadas al terminar.
  - El historial devolvió 4 mensajes en orden cronológico, y `limit=1` devolvió el último.
  - Respondieron como se esperaba: `404` para una conversación inexistente, `403` para `context` en el catálogo, `403` para `read` en el historial y `401` sin credencial.
  - Los tokens se capturaron en variables de la terminal y no se imprimieron. Se comprobó con `grep` que ninguna salida contenía `crm_read_` ni `crm_ctx_`.
- Suite local: lint y tipos limpios, **1379 de 1379** en Vitest y **100 de 100** end-to-end.

### AC-1 — Despliegue siguiendo el README (E-1, segunda corrida)

**Antes**: staging corría `49a3cb4`, con las migraciones `0000` a `0023`. `/login` respondía `200`, y la ingestión y la lectura estaban apagadas.

1. **CI del commit en verde** antes de desplegar: `c530558`, run 36347725367, `success`.
2. **Backup previo** con `sudo systemctl start crm-backup.service`: `Result=success`, `ExecMainStatus=0`.
   ```
   backup: /var/backups/crm-staging/crm_staging-20260927T203227Z.dump
   rotado: /var/backups/crm-staging/crm_staging-20260923T134647Z.dump
   -rw-r----- 1 root postgres 79447 Sep 27 20:32 crm_staging-20260927T203227Z.dump
   ```
3. **Código y dependencias**: `git reset --hard origin/main` y quedó `HEAD is now at c530558`. `npm ci` terminó bien, con una advertencia nueva de npm 11.19:
   - saltó los `postinstall` de tres versiones de esbuild, porque no los cubre `allowScripts`;
   - no afectó: la migración y el build, que usan esbuild, anduvieron;
   - **se registra como hallazgo del README** (E-3), sin corregir en esta etapa: decidir si se aprueban esos scripts o se deja constancia de que no hacen falta.
4. **Migración** con `migrate.env`: `Migraciones aplicadas.` Staging queda con los **25** archivos de migración (`0000` a `0024`).
5. **Build con `app.env` y reinicio**, con la línea corregida en la 12.3.2 (`NODE_OPTIONS` y `&&`): sin errores, y el reinicio corrió. El README funcionó tal como está escrito.

**Comprobaciones posteriores**:

| # | Comprobación | Resultado |
|---|---|---|
| — | `/login`, la ingestión y la lectura | `/login` `200`; ingestión v1 y v2 `404`; lectura `404` en `knowledge` y en `messages` |
| 1 | los nueve archivos contra los versionados | **cero diferencias** en los nueve |
| 2 | un solo salto de proxy | **cumplida**, por el usuario: la fila de `login_attempts` de las 20:55:29 UTC tiene el mismo `key_hash` que el `sha256` de su IP pública, la misma que ve su navegador. Antes hubo dos lecturas fallidas (E-4, abajo) |
| 3 | HSTS | presente sobre HTTPS (`max-age=31536000; includeSubDomains`), ausente sobre HTTP |
| 4 | la aplicación solo en loopback | `127.0.0.1:3000` |
| 5 | el rol de la aplicación no borra | **cumplida**, por el usuario: `BEGIN`, `ERROR: permission denied for table audit_logs`, `ROLLBACK`. El clasificador del modo automático había bloqueado el `DELETE` de quien hizo el trabajo, aunque iba dentro de una transacción con `rollback`; no se reintentó por otro camino |

**E-4, hallazgo del README en la comprobación 2.** La primera comparación dio hashes distintos, y la segunda no mostró ninguna fila de hoy: las filas que había eran del 2026-09-25, de antes de este despliegue. No era un salto de proxy de más. Se descartó que la fila guardada fuera la de una IP interna, que la diferencia viniera de IPv6 (staging solo tiene registro A) y que el navegador saliera por otra IP. Tenía dos causas, y las dos estaban en el README:

- **una contraseña de menos de 12 caracteres no deja fila**: la validación del formato corta antes de contar el intento, y la pantalla muestra el mismo mensaje que ante credenciales incorrectas;
- **la consulta usaba `limit 1` sin la hora**, así que una fila vieja se leía como la del intento. La fila del 25 con el hash del usuario habría dado «iguales» sin probar nada de este despliegue.

El README se corrigió en esta etapa: pide una contraseña de 12 caracteres o más, y la consulta muestra la hora de las tres últimas filas.

### AC-2 — La lectura en staging, con `read` y `context`

- **Credenciales**, de `source` `prueba-12-5-1`, creadas por quien hizo el trabajo **solo para el script**, sin ir a ningún emisor: `read` `801614f2-…` y `context` `0a1da617-…`. Los tokens se capturaron en variables de la terminal y no se imprimieron.
- **Encendido**: copia de `app.env`, las dos líneas `READ_API_*` con los dos ids juntos, y reinicio. Sin credencial, `messages` respondió `401`.
- **Corrida** de 20:36:42Z a 20:37:00Z. Para el historial se usó la conversación sintética de la 12.3.3, `wa-conv-wamid-fict-p20260927182133-0001`. Resultado: **0 fallas**.
  - Catálogo e información: 200 con el esquema estricto, los inactivos y los inexistentes en `404`, y sin credencial `401`.
  - **Historial**: 3 mensajes en orden (el entrante y las dos respuestas del agente, con `sent_by: agent`), y `limit=1` devolvió el último.
  - Rechazos: `404` para una conversación inexistente; `403` para `context` en el catálogo y para `read` en el historial; `401` sin credencial.
  - Ninguna salida contenía `crm_read_` ni `crm_ctx_`.
- **Log del servidor en esa ventana**, agrupado por ruta, código y `source`:
  ```
        4 /api/read/v1/knowledge OK prueba-12-5-1
        1 /api/read/v1/messages NOT_FOUND prueba-12-5-1
        2 /api/read/v1/messages OK prueba-12-5-1
        4 /api/read/v1/products OK prueba-12-5-1
        2 /api/read/v1/products/{product_id} NOT_FOUND prueba-12-5-1
        1 /api/read/v1/products/{product_id} OK prueba-12-5-1
  ```
  - Además hay tres `UNAUTHENTICATED` y dos `FORBIDDEN`, sin `source` ni correlación: el log de esos rechazos no los registra, ni siquiera el del `403`, que ya identificó la credencial. Es la conducta actual del borde; no se cambia en la 12.5.
  - **Ninguna línea contiene un token ni la referencia de la conversación** (`grep` en 0).
- **Apagado**, a las 20:37 UTC: se borraron las dos líneas, y `app.env` quedó idéntico a la copia previa. La copia se borró. Reinicio y revocación de las dos credenciales, con `Credencial revocada: …` para cada una. Quedó comprobado:
  - lectura: `404` en `knowledge` y en `messages`;
  - ingestión v1 y v2: `404`;
  - `/login`: `200`.

**Nivel**: la lectura de las tres rutas queda **validada en staging** con requests sintéticos a través del borde real (`isolated-runtime`). **No** con el agente como consumidor: eso es la 12.5.2 (AC-9).

## 12.5.2 — El turno completo con el agente, 2026-09-28

Autorizado por el usuario el 2026-09-28, para ese día y solo para las dos ventanas: tocar staging (copia de `app.env`, encendido, apagado de la ingestión en el turno 4 con sus reinicios y restauración), crear y revocar la credencial de la semilla y mandar sus dos eventos, y revocar las credenciales del agente al terminar.

**Lo que vio el CRM** está en esta sección: respuestas, filas, log y dashboard. **Lo que solo consta en el agente** va marcado así: su cola, sus alertas, su contexto degradado y el contenido de las lecturas que recibió.

### Preparación

- **Los teléfonos del guion no existían**: la consulta del usuario sobre `clients`, `conversations` y `messages`, antes de la ventana, no devolvió filas para `+5491155550051` a `…053` ni para `+5491155550090`, ni referencias `wa-conv-wamid-fict-w…`, `…-t5…` o `wa-msg-…` equivalentes.
- **Credenciales**:
  - las del agente, `source` `agente-12-5-2`, **las creó el usuario en su terminal** y cargó cada token en n8n: ingestión `1e60ea01-…`, lectura `3bdac6f8-…` y contexto `f6239893-…`. Ningún token pasó por la conversación con el asistente;
  - la de la semilla, `source` `siembra-12-5-2`: `bc9dba2a-…`, creada por quien hizo el trabajo dentro de un script en el servidor. El token quedó en una variable de ese script y nunca se imprimió.
- **Encendido**, a las 22:20 UTC: copia `app.env.bak-12-5-2` (0600, root). `app.env` ya tenía `INGESTION_ENABLED=false` y la allowlist vacía. Se encendieron con el id de ingestión y se agregaron las dos líneas de lectura con los ids de lectura y contexto. Después del reinicio, sin credencial, la ingestión v2, `knowledge`, `products` y `messages` respondieron `401`, y `/login` `200`.

### Ventana 1 — turnos 1 a 3, de 22:20:00 a 22:33:00 UTC

- **El agente informó**: la cola quedó vacía a las 22:32 UTC, con 10 eventos aceptados. **Hallazgo del agente**: el turno 3 **no derivó**. Tomó «Quiero hablar con una persona» como consulta, respondió y no mandó `conversation.escalated`.
- **Conciliación** (`conciliar-turnos.ts`, corrida por el usuario), con 7 esperados: los 4 entrantes y las 3 salidas del agente.
  ```
  events: client.resolved processed 3 · conversation.resolved processed 4 · message.recorded processed 3
  metric_12_by_hand: total 7, failed 0
  conversations: wa-conv-wamid-fict-w1-t1-1  open  inbound 4  outbound 3
  reconciliation: expected 7, found 7, missing [], duplicated [], wrong_conversation [], wrong_direction [], unexpected [], ok true
  ```
  El esperado de la métrica era 4 + *N*, con *N* = 3.

### Ventana 2 — semilla, turnos 4, 5 y 5b y el duplicado, de 22:39:00 a 22:58:00 UTC

1. **Semilla de H-8** (22:39:40–22:39:46): se sumó la credencial de la semilla a la allowlist y se reinició.
   - `client.resolved` `seed-h8-cli-0001`: `200 accepted`, con el cliente «Cliente Semilla H8».
   - `conversation.resolved` `seed-h8-conv-0001`: `200 accepted`, con `wa-conv-wamid-fict-t5-conflict-0001` en `open` y el mensaje `wa-msg-seed-h8-0001`.
2. **Apagado de la ingestión** (22:40:04): `INGESTION_ENABLED=false` y reinicio. Sin credencial, la ingestión v2 respondió `404`, y la lectura siguió en `401`. El turno 4 empezó después de ese aviso.
3. **Turno 4**, según el agente: el `client.resolved` recibió `404` y quedó `held`, con 2 filas `pending` detrás en la misma clave y ninguna en `dead_letter`, y salió la alerta. El agente respondió con **contexto degradado**: sin cliente resuelto y, por eso, sin leer el historial (H-7). La información del negocio dio `200`. **Del lado del CRM**: con la ingestión apagada el pedido se corta antes del log, así que no hay línea. La única línea del turno es la lectura de `knowledge` de las 22:41:50.
4. **Reencendido** (22:46:04): `INGESTION_ENABLED=true` y reinicio. Sin credencial, la ingestión v2 respondió `401`.
5. **Drenado del turno 4**, a las 22:50:24: 3 eventos en orden (200, 200 y 201), según el agente. Coincide con el log: 3 `OK` de ingestión bajo una sola correlación.
6. **Turno 5**:
   - `409 conversation_ref_taken` sobre la semilla, y reintento con `wa-conv-wamid-fict-t5-conflict-0001~r2`;
   - el mensaje quedó en la conversación nueva, **no** en la de la semilla. Esa conversación sigue con su único entrante y sin salidas.
7. **Turno 5b**: un cliente nuevo y una conversación nueva, `wa-conv-wamid-fict-w2-t5b-1`.
8. **Duplicado**, a las 22:57:32: el `conversation.resolved` con `event_id` `wa-conv-wamid-fict-w1-t1-1-dup-w1` y correlación `dup-w1` recibió `409 message_already_recorded`. El CRM no guardó nada.
   - **Origen**: el llamador temporal acordado, que reenvía el cuerpo del primer mensaje del turno 1 con otro `event_id`, porque el agente deriva el `event_id` del id del mensaje y su cadena real no puede producir este caso.
   - Por eso es una prueba **del emisor y su clasificador, no de la cadena real**.
   - El CRM no distingue quién lo mandó: el origen consta en lo acordado y en el aviso del agente. El resultado no depende de eso, porque el mensaje ya estaba en la conversación vigente del cliente y el `409` sale igual.
9. **El agente informó** la cola vacía a las 22:57 UTC.

**Conciliación**, con 7 esperados: la semilla, los entrantes de los turnos 4, 5 y 5b y sus 3 salidas. El duplicado quedó fuera.
```
events: client.resolved processed 3 · conversation.resolved failed conversation_ref_taken 1 ·
        conversation.resolved failed message_already_recorded 1 · conversation.resolved processed 3 ·
        message.recorded processed 3
metric_12_by_hand: total 9, failed 2
conversations: wa-conv-wamid-fict-t5-conflict-0001      open  inbound 1  outbound 0
               wa-conv-wamid-fict-w1-t1-1               open  inbound 1  outbound 1
               wa-conv-wamid-fict-t5-conflict-0001~r2   open  inbound 1  outbound 1
               wa-conv-wamid-fict-w2-t5b-1              open  inbound 1  outbound 1
reconciliation: expected 7, found 7, missing [], duplicated [], wrong_conversation [], wrong_direction [], unexpected [], ok true
```
El esperado de la métrica era 6 + *N*, con *N* = 3. Incluye la semilla, porque la métrica es de toda la organización.

**R-6**, por consulta del usuario:
```
+5491155550052|Sin nombre
+5491155550053|1155550053
```
- **Según el agente**, el perfil del turno 5 traía el teléfono como nombre y su guarda lo convirtió en `null`. El CRM solo ve el resultado: ante `null`, crea el cliente como «Sin nombre» (`UNNAMED_CLIENT_LABEL`), nunca con el teléfono.
- El 5b, con el formato local, pasó las dos guardas, que es el límite escrito.

**Dashboard**, mirado por el usuario el 2026-09-29, con el período del 2026-09-28: métrica 12 **«12,5 %, 2 fallidos de 16 eventos»**, con `agente-12-5-2 · conversation_ref_taken: 1` y `agente-12-5-2 · message_already_recorded: 1`. Coincide con los dos conteos a mano: 7 + 9 eventos, 0 + 2 fallidos.

### El log del servidor en las dos ventanas

De 22:19 a 23:00 UTC hubo 45 líneas con ruta. **Ninguna contiene `crm_`**, y no hubo ningún `429`.
```
   2 /api/ingestion/v2/events CONFLICT agente-12-5-2
  19 /api/ingestion/v2/events OK agente-12-5-2
   2 /api/ingestion/v2/events OK siembra-12-5-2
   2 /api/read/v1/knowledge OK agente-12-5-2
   5 /api/read/v1/messages OK agente-12-5-2
   4 /api/read/v1/products OK agente-12-5-2
  10 rechazos UNAUTHENTICATED sin source: las comprobaciones sin credencial de quien hizo el trabajo, a las 22:20, 22:40 y 22:46
   1 login UNAUTHENTICATED, a las 22:39:54: no explicado (ver abajo)
```
**El rechazo de ingreso de las 22:39:54 queda sin explicar.** Primero se lo atribuyó al sondeo de `/login` tras un reinicio, pero no cierra (revisión independiente, R-10):
- el reinicio de la semilla terminó a las 22:39:46;
- el del apagado se comprobó a las 22:40:04;
- los sondeos de quien hizo el trabajo son `GET` y en los otros reinicios no dejaron línea.

Es un intento de ingreso fallido, sin `source`, en un entorno público. Un solo intento está por debajo de los límites de la 3.3 y no afecta a la corrida.

Los 21 pedidos de ingestión del agente son los 10 eventos de la ventana 1 más los 11 de la ventana 2. Duración: mediana de 35 ms y máximo de 128 ms, en la ingestión.

**Pedidos por turno** (AC-8), agrupados por correlación. El agente usa una correlación para la ingestión de cada turno y otra para cada lectura del catálogo o la información. Los turnos se reconstruyen por hora:

| Turno | Escritura | Historial | Catálogo | Información | Notas |
|---|---|---|---|---|---|
| 1 | 3 | 1 | 1 | 0 | un segmento; no leyó la información, aunque la pregunta incluía el horario |
| 2 | 4 | 1 | 0 | 0 | dos mensajes, un segmento |
| 3 | 3 | 1 | 0 | 1 | sin derivar |
| 4 | 3, al drenar | 0 | 0 | 1 | contexto degradado: sin historial |
| 5 | 4 | 1 | 2 | 0 | incluye el `409` y el reintento |
| 5b | 3 | 1 | 1 | 0 | |

- **Escritura**: `2 + segmentos`, más 1 por cada mensaje extra del turno y más 1 por cada reintento de `409`. En estos turnos, de 3 a 4.
- **Lectura**: de 1 a 3 por turno, con cada alcance en su propio presupuesto.

**Hallazgo menor, para el agente**: la guía del emisor (`ingestion-v2.md`) pide **una correlación por turno**, y el agente usa una para la ingestión y otra por cada lectura. Encontrar un turno en el log exige reconstruirlo por hora. No rompe nada.

### Apagado, 2026-09-28 a las 23:04:35 UTC

- `app.env` restaurado desde la copia y comprobado **idéntico** con `cmp` (225 bytes, 0600, root). La copia se borró.
- Reinicio. **Las cuatro credenciales están revocadas**, cada una con `Credencial revocada: …`: `1e60ea01`, `3bdac6f8`, `f6239893` y `bc9dba2a`.
- Las listas de esperados se borraron de `/tmp` del servidor.
- Desde afuera: `/login` `200`; la ingestión v1 y v2, `knowledge` y `messages`, `404`.

### Las capturas de lectura (D-8, AC-9), 2026-09-29

El agente mandó una respuesta de cada ruta, tomada de los datos de ejecución que conservó n8n, **sin encabezados**:

| Fixture | Ruta | Turno | Llegó (UTC) |
|---|---|---|---|
| `captured-products-search.json` | `products?q=cargador&limit=10` | 5b | 22:56:25.624 |
| `captured-knowledge.json` | `knowledge?limit=50` | 3 | 22:30:55.631 |
| `captured-messages-history.json` | `messages?conversation_ref=wa-conv-wamid-fict-w1-t1-1&limit=10` | 2 | 22:29:09.798 |

- **Salvedad declarada en cada fixture**: n8n guarda el cuerpo **ya parseado**, así que la captura es ese objeto reserializado. Conserva las claves, los tipos y los textos, pero no necesariamente los bytes. Valida el esquema, **no** los bytes. En la ingestión (12.3.3), en cambio, los bytes sí eran los que viajaron.
- **Qué se comprueba en CI** (`src/app/api/read/v1/contract.test.ts`):
  - cada captura pasa el esquema estricto de su ruta;
  - hay una captura por ruta;
  - cada una declara la forma y la nota, y no tiene encabezados ni `crm_<alcance>_`;
  - el historial está en orden y trae una respuesta del agente.
- **AC-7 confirmado** con la captura: el historial del turno 2 trae el entrante y la respuesta del turno 1 (`sent_by: agent`) y los dos entrantes del turno 2, del más viejo al más nuevo.
- **Lo que muestran las capturas**:
  - **en el catálogo**, `q=cargador` devolvió «Cargador 20W (2da gen.)»;
  - **en la información**, llegaron doce entradas vigentes. Una, «Promoción Día de la Madre», no viene del seed: la cargó `piloto-admin` desde la UI en el piloto del 2026-09-25 ([notas-piloto-11.4](notas-piloto-11.4.md), registro de auditoría);
  - **en el turno 1**, la respuesta del agente preguntó si el horario era «en tienda o atención telefónica», en vez de leerlo de la información. Coincide con el log, que no tiene lectura de `knowledge` en ese turno.

**Mutaciones**, cada una restaurada después:

| # | Cambio | Falla |
|---|---|---|
| M28 | la captura del catálogo con la cantidad en stock | «captured-products-search.json declara su forma y pasa el validador» |
| M29 | dos mensajes del historial capturado invertidos | «FR-API-08 (AC-7): el historial capturado trae el turno anterior con la respuesta del agente, en orden» |
| M30 | la captura de la información con un encabezado `Authorization` | «D-8: captured-knowledge.json es una captura declarada, sin encabezados ni tokens» |

Después de restaurar: 33 de 33 en el archivo, y 787 de 787 entre unitarios y guardas. Lint, tipos y formato quedaron limpios.

**Después de la revisión independiente** (2026-09-29), dos mutaciones más, también restauradas:

| # | Cambio | Falla |
|---|---|---|
| M31 | `reconcile` sin exigir esperados únicos ni conteos iguales (R-4) | «FR-API-07: una referencia repetida en los esperados no tapa un faltante» |
| M32 | el historial capturado sin los dos mensajes del turno 2 (R-5). Con el test anterior, esta mutación pasaba | «FR-API-08 (AC-7): el historial capturado trae el turno anterior con la respuesta del agente, en orden» |

Después de restaurar: 41 de 41 entre `conciliar-turnos.test.ts`, contra PostgreSQL real, y `contract.test.ts`.

### Lo que queda sin probar

- **La derivación por el agente real** (turno 3): no se probaron el `conversation.escalated` emitido por la cadena real ni el paso a `pending`. La ingestión de ese evento está validada desde la 12.3.3, con el emisor. **El usuario decidió cerrar la 12.5 con esto como límite conocido** (2026-09-29, opción a). Se prueba en una ventana corta cuando el agente lo corrija.

**Nivel**: el turno completo del agente queda **validado en integración, en staging** (`producer-consumer`), con la cadena real del agente, entrada simulada, envío a un doble y datos sintéticos. **No** es `authenticated-end-to-end`, porque ningún mensaje real de WhatsApp pasó. **No** es producción.
