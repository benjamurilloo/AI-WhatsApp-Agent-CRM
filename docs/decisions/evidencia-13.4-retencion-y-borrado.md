# Evidencia — 13.4: retención y borrado de datos reales

Salidas de la subfase 13.4 ([brief-13.4](brief-13.4-retencion-y-borrado.md)). Cada bloque es la salida literal del comando que lo precede, salvo los marcados `[transcrito]`. Los tiempos por test se quitaron de las líneas `✓` y `×`. **Autoevaluación**: lo ejecutó y lo registra el mismo agente que implementó. Ningún teléfono, `wamid` ni IP real aparece en este archivo: los datos de los tests son inventados.

## Etapa 13.4.1 — local, 2026-10-01

Contra PostgreSQL de desarrollo en Docker (`crm_dev_test`, recreada por el setup global de la suite de integración).

### AC-1: el ADR 0015

[ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md), aceptado por el usuario el 2026-10-01. El [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) lo enlaza en su «Nota de la 13.4», y el índice lo lista como `aceptada`.

### AC-2 a AC-6: los archivos de la 13.4

```
npx vitest run --project integration tests/integration/erasure.test.ts tests/integration/client-data.test.ts tests/integration/auth-service.test.ts tests/integration/audit.test.ts --reporter=verbose
```

Por archivo `[transcrito]`, contando las líneas de cada uno: `erasure` 25, `client-data` 13, `auth-service` 34, `audit` 25.

```
 Test Files  4 passed (4)
      Tests  97 passed (97)
```

**AC-2, `messages`:**

```
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 1. el vaciado pasa y conserva el resto de la fila
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 2. un mensaje ya vaciado admite el mismo vaciado otra vez, sin cambio
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el texto cambiado por otro: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el texto vaciado sin vaciar la referencia: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza la referencia vaciada sin vaciar el texto: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el vaciado con la fecha cambiada: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el vaciado con la dirección cambiada: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el vaciado con el tipo cambiado: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el vaciado con el autor cambiado: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el vaciado con la fecha de creación cambiada: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 3. rechaza el vaciado con el id cambiado: P0001, y la fila no cambia
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 4. rechaza el vaciado que mueve el mensaje a otra conversación
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 5. un mensaje vaciado no recupera su texto
 ✓ messages: el único UPDATE admitido es el vaciado (AC-2) > 6. DELETE sigue rechazado: P0001
```

**AC-3, `audit_logs`:**

```
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 7. el vaciado de una entrada de cliente pasa y conserva el resto de la fila
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 8. rechaza el mismo vaciado en una entrada de producto: P0001
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 9. rechaza un diff distinto del marcador: P0001, y la fila no cambia
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 9. rechaza el marcador con otra clave: P0001, y la fila no cambia
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 9. rechaza el vaciado con la acción cambiada: P0001, y la fila no cambia
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 9. rechaza el vaciado con la fecha cambiada: P0001, y la fila no cambia
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 9. rechaza el vaciado con la entidad cambiada: P0001, y la fila no cambia
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 9. rechaza el vaciado que la convierte en entrada de producto: P0001, y la fila no cambia
 ✓ audit_logs: el único UPDATE admitido es el vaciado de un cliente (AC-3) > 10. DELETE sigue rechazado, también en una entrada de cliente: P0001
```

**AC-4, `crm_app`.** El vaciado se rechaza por permisos, y el test de cobertura de privilegios de `audit.test.ts` sigue verde sin cambios en el archivo (`git diff` vacío para `tests/integration/audit.test.ts`):

```
 ✓ crm_app no puede vaciar (AC-4) > 11. el vaciado de un mensaje como crm_app: 42501
 ✓ crm_app no puede vaciar (AC-4) > 12. el vaciado de una entrada de cliente como crm_app: 42501
 ✓ audit_logs: solo inserción por permisos (crm_app) > crm_app no puede actualizar ni borrar: 42501
 ✓ privilegios de crm_app en todas las tablas > cada tabla de public tiene los privilegios esperados
 ✓ privilegios de crm_app en todas las tablas > la verificación detecta UPDATE otorgado sobre una tabla de solo inserción
 ✓ privilegios de crm_app en todas las tablas > la verificación detecta DELETE otorgado sobre una tabla sin borrado
```

**AC-5, el script.** El test 5 barre todas las columnas `text`, `varchar`, `jsonb` y `json` del esquema `public`, en cada tabla. Busca el nombre, el teléfono, las notas, el texto de los dos mensajes y las referencias externas. El mismo barrido corre antes del vaciado como control, y ahí tiene que encontrarlos. El test 6 compara las métricas del período antes y después del vaciado.

```
 ✓ exportación de los datos de un cliente > 1. incluye ficha, conversaciones, mensajes con cuerpo y auditoría
 ✓ exportación de los datos de un cliente > 2. no incluye datos de otro cliente ni de otra organización
 ✓ exportación de los datos de un cliente > 3. de un cliente inexistente devuelve la ficha nula y listas vacías
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 4. el informe dice que no es borrable y qué quedaría
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 5. después del vaciado, ninguna tabla tiene su nombre, su teléfono, sus notas ni sus mensajes
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 6. las métricas del período dan lo mismo antes y después del vaciado
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 7. borrar la ficha de un cliente con conversaciones lo rechaza la base, sin vaciar nada
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 8. el vaciado no escribe en audit_logs, que reintroduciría el teléfono
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 9. un segundo vaciado no cambia nada ni falla
 ✓ cliente con conversaciones: se vacía, no se borra (brief-13.4, D-2) > 10. no toca a otro cliente de la misma organización
 ✓ cliente sin conversaciones: se borra de verdad > 11. el informe lo marca borrable y sin nada retenido
 ✓ cliente sin conversaciones: se borra de verdad > 12. la ficha se borra y no queda rastro de la persona
 ✓ cliente sin conversaciones: se borra de verdad > 13. con auditoría, la ficha se borra y la auditoría queda vaciada
```

**AC-6, `login_attempts`:**

```
 ✓ límite de intentos > un intento borra los vencidos de todas las claves, no solo los de la suya
```

### Mutaciones sobre los archivos reales

Corridas con un script de `node` que aplica cada mutación sobre el archivo real, corre su archivo de tests y restaura los bytes originales. No se usó `git checkout` (evidencia-13.2, incidente de CRLF). Las ocho tienen que dar rojo. Se quitaron las líneas separadoras «Failed Tests» y un aviso de deprecación de Node sobre `shell: true`:

```
== M1 (messages: la fila entera, no una lista de columnas) — drizzle/0025_vaciado_de_mensajes_y_auditoria.sql
     × 3. rechaza el vaciado con la fecha cambiada: P0001, y la fila no cambia
     × 3. rechaza el vaciado con la dirección cambiada: P0001, y la fila no cambia
     × 3. rechaza el vaciado con el tipo cambiado: P0001, y la fila no cambia
     × 3. rechaza el vaciado con el autor cambiado: P0001, y la fila no cambia
     × 3. rechaza el vaciado con la fecha de creación cambiada: P0001, y la fila no cambia
     × 3. rechaza el vaciado con el id cambiado: P0001, y la fila no cambia
     × 4. rechaza el vaciado que mueve el mensaje a otra conversación
      Tests  7 failed | 18 passed (25)
código de salida: 1
restaurado: bytes idénticos
== M2 (messages: el DELETE sigue rechazado) — drizzle/0025_vaciado_de_mensajes_y_auditoria.sql
     × 6. DELETE sigue rechazado: P0001
      Tests  1 failed | 24 passed (25)
código de salida: 1
restaurado: bytes idénticos
== M3 (messages: vaciar las dos columnas, no solo el texto) — drizzle/0025_vaciado_de_mensajes_y_auditoria.sql
     × 3. rechaza el texto vaciado sin vaciar la referencia: P0001, y la fila no cambia
      Tests  1 failed | 24 passed (25)
código de salida: 1
restaurado: bytes idénticos
== M4 (audit_logs: solo entradas de un cliente) — drizzle/0025_vaciado_de_mensajes_y_auditoria.sql
     × 8. rechaza el mismo vaciado en una entrada de producto: P0001
      Tests  1 failed | 24 passed (25)
código de salida: 1
restaurado: bytes idénticos
== M5 (audit_logs: la fila entera, no solo el diff) — drizzle/0025_vaciado_de_mensajes_y_auditoria.sql
     × 9. rechaza el vaciado con la acción cambiada: P0001, y la fila no cambia
     × 9. rechaza el vaciado con la fecha cambiada: P0001, y la fila no cambia
     × 9. rechaza el vaciado con la entidad cambiada: P0001, y la fila no cambia
     × 9. rechaza el vaciado que la convierte en entrada de producto: P0001, y la fila no cambia
      Tests  4 failed | 21 passed (25)
código de salida: 1
restaurado: bytes idénticos
== M6 (login_attempts: el vencimiento borra todas las claves) — src/modules/auth/repository.ts
     × un intento borra los vencidos de todas las claves, no solo los de la suya
      Tests  1 failed | 33 passed (34)
código de salida: 1
restaurado: bytes idénticos
== M7 (script: el vaciado alcanza la auditoría) — scripts/client-data-delete.ts
     × 5. después del vaciado, ninguna tabla tiene su nombre, su teléfono, sus notas ni sus mensajes
      Tests  1 failed | 12 passed (13)
código de salida: 1
restaurado: bytes idénticos
== M8 (script: el vaciado alcanza la referencia de la conversación) — scripts/client-data-delete.ts
     × 5. después del vaciado, ninguna tabla tiene su nombre, su teléfono, sus notas ni sus mensajes
     × 9. un segundo vaciado no cambia nada ni falla
      Tests  2 failed | 11 passed (13)
código de salida: 1
restaurado: bytes idénticos
```

Qué cambia cada mutación `[transcrito]`:

- **M1**: compara solo `body_text` y `external_ref` en nulo, no la fila entera.
- **M2**: deja pasar el `DELETE`.
- **M3**: no exige vaciar `external_ref`.
- **M4**: admite el vaciado en cualquier entidad.
- **M5**: compara solo el `diff`.
- **M6**: vuelve a borrar solo los vencidos de la clave propia.
- **M7**: el script no vacía la auditoría.
- **M8**: el script no vacía `conversations.external_ref`.

### La entrada vaciada en la ficha del cliente

La ficha lee el `diff` sin validarlo, y la marca del vaciado trae una clave que el tipo no declara. Un test unitario nuevo en `audit-summary.test.ts` (I-2) cubre las cuatro acciones:

```
npx vitest run "src/app/(autenticado)/clientes/[clientId]/audit-summary.test.ts"
      Tests  7 passed (7)
```

**Mutación M9.** La línea `if (after === null) return "—";` de `audit-summary.ts` se cambió por `if (after === null && before !== null) return "—";`. Se aplicó con el mismo método de bytes guardados, y el archivo quedó sin diff.

```
     × muestra la acción y un guion en lugar del cambio, en cualquier acción
TypeError: Cannot read properties of null (reading 'displayName')
      Tests  1 failed | 6 passed (7)
restaurado, sin diff
```

Sin esa línea, la ficha de un cliente con auditoría vaciada se rompe.

### D-6: la guarda de journald

```
npx vitest run --project guards tests/guards/production-journald-config.test.ts --reporter=verbose
```

Las mutaciones de esta guarda están dentro del test: cada caso «detecta» aplica una variante al texto del archivo real, y verifica que la guarda la rechace.

```
 ✓ el archivo versionado no tiene problemas
 ✓ lee los valores del archivo real
 ✓ detecta un mes, que son 30,44 días
 ✓ detecta la retención en 0, que la desactiva
 ✓ detecta la retención sin unidad, en segundos de más
 ✓ detecta el archivo por mes, como el valor por defecto
 ✓ detecta sin MaxFileSec
 ✓ detecta una asignación vacía al final, que vuelve al defecto
 ✓ detecta una asignación posterior más larga
 ✓ detecta las claves fuera de [Journal]
 ✓ detecta otra sección
 ✓ detecta una unidad desconocida
 ✓ detecta una clave no prevista
 ✓ detecta sin tope de tamaño
 ✓ acepta formas equivalentes a la real
      Tests  15 passed (15)
```

### AC-7: la suite completa

**El primer recorrido falló.** El test «todos los seeds rechazan la base productiva sin crear nada», de `organization-bootstrap.test.ts` (13.1), superó el límite de 5 s. `[transcrito]`:

- con la suite entera: 650 de 651 en verde, ese test entre 5039 y 5059 ms en varias corridas;
- solo: 1168 ms;
- con los tres archivos de la 13.4 delante: 2886 ms.

**Bisección**, sacando un archivo de la 13.4 por vez:

```
== sin erasure
      Tests  626 passed (626)
== sin client-data
     × todos los seeds rechazan la base productiva sin crear nada 5041ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
      Tests  1 failed | 637 passed (638)
== sin auth-service
      Tests  617 passed (617)
```

Los archivos corren en serie (`fileParallelism: false`), así que no es carga en paralelo. **Causa probable, no comprobada:** el test crea una base, y eso fuerza un checkpoint de lo que escribieron los archivos anteriores; en Docker sobre Windows el disco es lento. El tiempo depende de cuánto se escribió antes, y no de un archivo en particular.

Corrección (I-2): un límite propio de 30 s en ese `describe`, con el patrón que ya usan otros archivos de la suite. No cambia lo que el test comprueba. Después:

```
npx vitest run --project integration
 Test Files  42 passed (42)
      Tests  651 passed (651)
```

```
npx vitest run --project unit
 Test Files  48 passed (48)
      Tests  492 passed (492)
npx vitest run --project guards
 Test Files  16 passed (16)
      Tests  485 passed (485)
```

`npm run typecheck`, `npm run lint` y `npm run format:check` salen con código 0 `[transcrito]`.

**La CI del commit de esta etapa**, leída por `headSha`:

```
gh run list --commit 9f3dc2b26ceb51b1a80d942941a7c01a11cd936f --json databaseId,headSha,status,conclusion,name
[{"conclusion":"success","databaseId":36881395401,"headSha":"9f3dc2b26ceb51b1a80d942941a7c01a11cd936f","name":"CI","status":"completed"}]
```

AC-7 cumplida.

## Etapa 13.4.2 — en el droplet de producción, 2026-10-01

Autorizada por el usuario el 2026-10-01, los tres pasos en un mismo mensaje. Los comandos se mandaron por `ssh crm-production` desde la máquina del operador.

### AC-8 (D-4): H-4

No se verificó en el droplet: se resolvió en el contrato (brief, I-1, opción A1) y se mira con el primer evento real de la API oficial, en la 13.5.

### AC-9: la migración 0025 en producción

**Recuentos de `crm_production`**, en una transacción de solo lectura. Son las 17 tablas en orden alfabético, como en AC-13 de la 13.3:

```
2026-10-01T15:18:38Z antes 1|0|0|0|0|0|0|0|0|44|0|1|1|0|0|2|1
2026-10-01T15:21:05Z despues 1|0|0|0|0|0|0|0|0|44|0|1|1|0|0|2|1
2026-10-01T15:26:16Z final 1|0|0|0|0|0|0|0|0|44|0|1|1|0|0|2|1
```

`login_attempts` sigue en 44 filas. El vencimiento global (D-7) corre cuando alguien intenta iniciar sesión, y entre los dos recuentos nadie lo hizo.

**El despliegue de `9f3dc2b`**, con el script de AC-21 de la 13.1, que sigue los pasos 2 y 3 del README de producción. Antes había 25 migraciones aplicadas; `npm run db:migrate` aplicó la 0025:

```
[15:19:02 +0s] desplegado antes: 579397ef7be533c901d9afb88d539e2caf20046c
[15:19:03 +1s] anotado; últimas líneas de despliegues:
938423d0a832e65eb9c42474c51a47a44c54689e
471cf7be29878097652cc3f53c76ae2977296b24
579397ef7be533c901d9afb88d539e2caf20046c

added 263 packages in 25s
[15:19:29 +27s] código y dependencias: 9f3dc2b26ceb51b1a80d942941a7c01a11cd936f

Migraciones aplicadas.
[15:19:32 +30s] migraciones
[15:20:40 +98s] build
[15:20:41 +99s] restart
[15:20:44 +102s] /login -> 200
[15:20:44 +102s] servicio: active, NRestarts=0
[15:20:44 +102s] desplegado ahora: 9f3dc2b26ceb51b1a80d942941a7c01a11cd936f
```

La aplicación estuvo caída entre el reinicio y el primer `200`, unos 3 s. El cambio de las funciones no se midió por separado: un `CREATE OR REPLACE FUNCTION` no reescribe tablas. La condición de detención 4 no se activó.

**Después**, `[transcrito]` de un solo comando por `ssh`:

- `drizzle.__drizzle_migrations`: 26 filas;
- `messages_reject_change` y `audit_logs_reject_change` contienen `vaciada`: son las de la 0025;
- triggers `messages_insert_only` y `audit_logs_insert_only`, habilitados (`O`);
- `crm_app` en `messages` y `audit_logs`: `INSERT,SELECT`, sin `UPDATE` ni `DELETE`;
- `/login`: `200`, 0,71 s.

### AC-10 (D-6): la retención del journal

**Antes**, `[transcrito]`:

- no existía `/etc/systemd/journald.conf.d/`, y `cat-config` no mostraba ninguna de las claves: todo estaba en los valores por defecto;
- 33,5 MB, con la primera entrada del 2026-09-29T19:51:33Z;
- el archivo de `/srv/crm-production` y el de `9f3dc2b` tenían el mismo sha256, `228c0d8b…893f92`.

**Instalación**, con los comandos del README §Retención del journal, al pie de la letra:

```
Vacuuming done, freed 0B of archived journals from /var/log/journal.
Vacuuming done, freed 0B of archived journals from /var/log/journal/40e536c8010e4d8495ddfada0248ad81.
Vacuuming done, freed 0B of archived journals from /run/log/journal.
exit 0
```

**Verificación**, con el comando del README más el estado de las unidades:

```
MaxRetentionSec=30day
MaxFileSec=1day
SystemMaxUse=1G
Archived and active journals take up 52.6M in the file system.
2026-09-29T19:51:33+00:00
total 4
-rw-r--r-- 1 root root 690 Oct  1 15:21 crm-production.conf
active
active
Journal started
System Journal (/var/log/journal/40e536c8010e4d8495ddfada0248ad81) is 37.5M, max 1.0G, 986.4M free.
System Journal (/var/log/journal/40e536c8010e4d8495ddfada0248ad81) is 37.5M, max 1.0G, 986.4M free.
Received client request to rotate journal, rotating.
Vacuuming done, freed 0B of archived journals from /var/log/journal/40e536c8010e4d8495ddfada0248ad81.
200
```

journald tomó el tope («max 1.0G»). El uso creció a 52,6 MB porque `--rotate` abre archivos nuevos. **Límite:** el vencimiento a los 30 días no se puede observar todavía, porque la entrada más vieja tiene dos días. Se puede comprobar a partir del 2026-10-30, mirando que la primera entrada tenga como mucho 31 días.

### AC-11 (D-8): el vaciado en una base aparte

Tres scripts, corridos como `root` con `ssh crm-production "sudo bash -s" < script`, con el patrón de la 13.2.2: un rol propio sin privilegios de administración, y una base que solo ese rol y `postgres` pueden abrir. La contraseña se generó en el servidor y no salió de él. Los datos son inventados: los teléfonos son del rango ficticio del proyecto, y los identificadores, UUID fijos que empiezan con `13400000`.

Un primer intento de la parte B no llegó a ejecutarse: la shell local lo rechazó por un error de comillas antes de mandarlo. La base seguía vacía (`select count(*) from clients` → `0`).

**Parte A: el rol, la base y las migraciones**, con el código desplegado:

```
2026-10-01T15:23:31Z
--- migraciones, con el código desplegado, como crm

Migraciones aplicadas.
--- lo creado
crm_vaciado_test|crm_vaciado
migraciones: 26
tablas: 17
dueño de messages: crm_vaciado
funciones con vaciado: 2
crm_app_login|f
crm_owner|f
crm_vaciado|t
postgres|t
```

**Parte B: el recorrido.** Se cargan dos clientes: Ana, que se vacía, y Bruno, que es el control. El barrido busca cada texto en todas las columnas `text`, `varchar`, `jsonb` y `json` de cada tabla.

«Lo que cuentan las métricas» es una aproximación: las columnas que conserva el vaciado, fila por fila (dirección, tipo, autor y fecha de cada mensaje; estado y fechas de cada conversación; acción y fecha de cada entrada de auditoría). Las funciones de métricas de la aplicación no se corrieron acá. Esa comparación está en el test 6 de `client-data.test.ts`, en local.

```
2026-10-01T15:25:30Z
--- 1. datos inventados, como el dueño
insertado: salida 0
--- 2. control: el barrido encuentra los datos antes del vaciado (aguja | columna | filas)
5491155550191|audit_logs.diff|1
5491155550191|clients.phone_e164|1
Ana Vaciado|audit_logs.diff|1
Ana Vaciado|clients.display_name|1
Bruno Control|audit_logs.diff|1
Bruno Control|clients.display_name|1
conv-inventada-134-a|conversations.external_ref|1
Mensaje de control de Bruno|messages.body_text|1
Mensaje inventado de Ana|messages.body_text|1
msg-inventado-134-in|messages.external_ref|1
msg-inventado-134-out|messages.external_ref|1
Nota inventada|audit_logs.diff|2
Nota inventada|clients.notes|1
Respuesta inventada para Ana|messages.body_text|1
--- 3. el informe, con el script real, como crm y con el rol dueño
Cliente 13400000-0000-4000-8000-00000000000a: 1 conversaciones, 2 mensajes, 2 entradas de auditoría.
Con conversaciones: la ficha no se puede borrar. Con --vaciar se vacía su contenido y el de todo lo suyo.
Después del vaciado quedaría:
  - En la base: 2 mensajes en 'messages', sin texto ni referencia externa: quedan la fecha, la dirección, el tipo y el autor, que cuentan las métricas.
  - En la base: 1 conversaciones en 'conversations', sin referencia externa: quedan sus fechas y su estado.
  - En la base: 2 entradas en 'audit_logs', sin valores: queda que hubo un cambio, de qué tipo y cuándo.
  - Fuera de la base: Las copias de seguridad: hasta 30 días en la copia externa y 7 en el servidor. Si se restaura una copia anterior a hoy, este vaciado se vuelve a aplicar (docs/runbooks/restaurar-la-base.md).
  - Fuera de la base: La copia del agente de WhatsApp y de su n8n: el CRM no la alcanza. Hay que avisarle al agente.
Informe solamente: no se escribió nada.
informe: salida 0
--- 4. el vaciado
Cliente 13400000-0000-4000-8000-00000000000a: 1 conversaciones, 2 mensajes, 2 entradas de auditoría.
Vaciado: la ficha, 1 conversaciones, 2 mensajes y 2 entradas de auditoría.
Queda, sin nada que identifique a la persona:
  - En la base: 2 mensajes en 'messages', sin texto ni referencia externa: quedan la fecha, la dirección, el tipo y el autor, que cuentan las métricas.
  - En la base: 1 conversaciones en 'conversations', sin referencia externa: quedan sus fechas y su estado.
  - En la base: 2 entradas en 'audit_logs', sin valores: queda que hubo un cambio, de qué tipo y cuándo.
  - Fuera de la base: Las copias de seguridad: hasta 30 días en la copia externa y 7 en el servidor. Si se restaura una copia anterior a hoy, este vaciado se vuelve a aplicar (docs/runbooks/restaurar-la-base.md).
  - Fuera de la base: La copia del agente de WhatsApp y de su n8n: el CRM no la alcanza. Hay que avisarle al agente.
Registrá la ejecución fuera de la base, como indica docs/runbooks/datos-de-un-cliente.md.
vaciado: salida 0
--- 5. el barrido después: solo pueden aparecer las agujas de Bruno
Bruno Control|audit_logs.diff|1
Bruno Control|clients.display_name|1
Mensaje de control de Bruno|messages.body_text|1
--- 6. lo que cuentan las métricas, antes contra después (vacío = igual)
iguales: 11 filas
--- 7. cómo quedaron la ficha, los mensajes, la conversación y la auditoría de Ana
Cliente eliminado 13400000|null|null
inbound|null|null
outbound|null|null
null|closed
create|{"after": null, "before": null, "vaciado": true}
update|{"after": null, "before": null, "vaciado": true}
product|create|Producto inventado 13.4
--- 8. un segundo vaciado no cambia nada
  - En la base: 2 mensajes en 'messages', sin texto ni referencia externa: quedan la fecha, la dirección, el tipo y el autor, que cuentan las métricas.
  - En la base: 1 conversaciones en 'conversations', sin referencia externa: quedan sus fechas y su estado.
  - En la base: 2 entradas en 'audit_logs', sin valores: queda que hubo un cambio, de qué tipo y cuándo.
  - Fuera de la base: Las copias de seguridad: hasta 30 días en la copia externa y 7 en el servidor. Si se restaura una copia anterior a hoy, este vaciado se vuelve a aplicar (docs/runbooks/restaurar-la-base.md).
  - Fuera de la base: La copia del agente de WhatsApp y de su n8n: el CRM no la alcanza. Hay que avisarle al agente.
Registrá la ejecución fuera de la base, como indica docs/runbooks/datos-de-un-cliente.md.
--- 9. los rechazos (cada uno tiene que fallar)
dueño, otro texto en un mensaje vaciado: ERROR:  messages es de solo inserción: UPDATE rechazado
dueño, otro texto en un mensaje vaciado: CONTEXT:  PL/pgSQL function messages_reject_change() line 13 at RAISE
dueño, cambiar un mensaje sin vaciar: ERROR:  messages es de solo inserción: UPDATE rechazado
dueño, cambiar un mensaje sin vaciar: CONTEXT:  PL/pgSQL function messages_reject_change() line 13 at RAISE
dueño, DELETE de auditoría: ERROR:  audit_logs es de solo inserción: DELETE rechazado
dueño, DELETE de auditoría: CONTEXT:  PL/pgSQL function audit_logs_reject_change() line 12 at RAISE
dueño, vaciar un producto: ERROR:  audit_logs es de solo inserción: UPDATE rechazado
dueño, vaciar un producto: CONTEXT:  PL/pgSQL function audit_logs_reject_change() line 12 at RAISE
crm_app, vaciado: ERROR:  permission denied for table messages
--- 10. Bruno sigue intacto
Bruno Control Inventado|+5491155550192
Mensaje de control de Bruno 13.4|msg-inventado-134-b
2026-10-01T15:25:39Z
Cliente 13400000-0000-4000-8000-00000000000a: 1 conversaciones, 2 mensajes, 2 entradas de auditoría.
Vaciado: la ficha, 0 conversaciones, 0 mensajes y 0 entradas de auditoría.
```

Las dos últimas líneas son de una corrida más del vaciado: en el punto 8, `tail` había cortado la línea con los recuentos. La ficha se vuelve a escribir con el mismo valor, porque `clients` no es de solo inserción.

**Parte C: la limpieza**, seguida del recuento final de `crm_production` (al pie del bloque de AC-9):

```
2026-10-01T15:26:13Z
--- 1. la base y el rol
psql: salida 0
--- 2. los archivos
/etc/crm-vaciado: no existe
--- 3. lo que queda
bases de vaciado: 0
roles de vaciado: 0
bases: crm_production,postgres,template0,template1
roles con login: crm_app_login,crm_owner,postgres
--- 4. /srv/crm-production y la aplicación
desplegado: 9f3dc2b26ceb51b1a80d942941a7c01a11cd936f
archivos modificados en /srv/crm-production: 0
active
active
/login -> 200
2026-10-01T15:26:14Z
```

El recuento final es igual a la línea de base. **Nivel alcanzado:** `isolated-runtime`. El vaciado se probó en el entorno productivo, con el código desplegado y sin datos reales.
