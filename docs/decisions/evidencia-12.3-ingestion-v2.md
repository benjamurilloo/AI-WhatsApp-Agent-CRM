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
| 2 | Un solo salto de proxy | **cumplida**, con control. Un ingreso fallido desde el navegador (Playwright headless contra `/login`, con un email y una clave inexistentes) dejó `key_hash = 362e48d2…058d3e` a las 23:45:00, **igual** al `sha256` de la IP pública de quien probó. El mismo intento por un túnel SOCKS a través del servidor (`ssh -f -N -D 1080 crm-staging`) dejó `b9e00b76…b337f` a las 23:45:19, **igual** al hash de la IP de salida del túnel y **distinto** del primero. La aplicación ve la IP del cliente |
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
