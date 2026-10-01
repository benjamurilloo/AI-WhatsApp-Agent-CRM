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

**La CI del commit de esta etapa** se registra cuando exista, leída por `headSha`.
