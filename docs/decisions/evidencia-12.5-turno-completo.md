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
| 2 | un solo salto de proxy | **cumplida**, por el usuario: la fila de `login_attempts` de las 20:55:29 UTC tiene el mismo `key_hash` que su IP pública (`362e48d2…`), la misma que ve su navegador. Antes hubo dos lecturas fallidas (E-4, abajo) |
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
