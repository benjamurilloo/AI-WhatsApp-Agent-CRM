# Evidencia 13.6 — El archivo del CRM como demo local

Salidas de la ejecución del [brief-13.6](brief-13.6-el-archivo-como-demo-local.md), el
2026-11-18, en el orden del brief. **Sin IP, sin secretos, sin tokens y sin la ruta de la clave
privada.** Las rutas de la máquina del operador van con `%USERPROFILE%`, porque el repositorio es
público. Cada bloque dice de dónde sale: `[leído]` es una salida que la sesión vio, `[transcrito]`
es lo que informó el usuario o el proyecto del agente.

## Paso 1 · El agente deja de consumir producción `[transcrito]`

Respuesta del proyecto del agente, `Respuesta-13.6-Agente-al-CRM.md` en el Escritorio del usuario:

| Condición del aviso | Estado | Evidencia |
| --- | --- | --- |
| `CRM_WRITE_ENABLED`, `CRM_CONTEXT_SOURCE` y `CRM_READ_SOURCE` sin definir, con Deploy | Cumplida | El usuario las borró en el Easypanel de producción, junto con `CRM_TAG_MAP`, y redesplegó. Una sonda de solo lectura (ejecución `72141`, 18:05:37 UTC) las ve `sin_definir` |
| `crm_outbox` vacía | Cumplida | La misma sonda: `is_empty = true`, todo en 0. Última fila, 2026-11-17 12:46:41 UTC |
| Ninguna llamada nueva al CRM | Cumplida, **sin turnos que la pongan a prueba** | Desde el Deploy solo corrió el drenador, sin reclamar nada |

El agente cerró además dos caminos que esos interruptores no cubrían, borrando
`CRM_INGEST_ALLOWED_SENDERS` en un segundo Deploy (después de las 18:09:40 UTC). Eso lo informó el
usuario; la sonda corrió antes y no volvió a correr. Es trabajo del proyecto del agente y no cambia
nada del lado del CRM: con la aplicación detenida, una llamada suelta falla igual.

## AC-4 · Los avisos externos `[transcrito]`

| Aviso | Qué hizo el usuario | Cuándo |
| --- | --- | --- |
| DigitalOcean Uptime `crm-production-health` | **Borró sus tres alertas** (caída, SSL y latencia). El chequeo sigue existiendo | antes del paso 3 |
| DigitalOcean Monitoring `crm-production-memoria-90` y `crm-production-disco-80` | **Las borró** | antes del paso 3 |
| Healthchecks.io: `backup`, `offsite`, `db-size`, `restore-check` y `fx-reader` | **Los pausó** | **después** de AC-5, confirmado a las ~18:46 UTC |

**AC-4 no se cumple como está escrito**: pide los ocho avisos pausados **antes** de AC-5, y los
cinco de Healthchecks.io se pausaron después. El orden se cambió antes del paso 3, propuesto por
la sesión y seguido por el usuario, por un hecho que el brief no vio: **el backup final avisa a
Healthchecks.io al terminar bien, y un chequeo pausado se reactiva al recibir un aviso.**
Pausarlos antes del paso 4 habría vuelto a encender el de `backup`. Mientras los timers siguieron
encendidos no podía saltar ninguno, y entre AC-5 (18:43:56 UTC) y la pausa no vencía ninguno: el
primero, `fx-reader`, vencía alrededor de las 01:00 UTC. Si el cambio funcionó lo dice AC-6, no
este razonamiento.

## Paso 3 · Detener las aplicaciones `[leído]`

```text
crm-production  2026-11-18T18:32:28Z  stop rc=0  inactive  enabled  /api/health local: 000
crm-staging     2026-11-18T18:32:36Z  stop rc=0  inactive  enabled  /api/health local: 000
```

## AC-1 · El backup final, con las aplicaciones detenidas `[leído]`

Producción, por `crm-backup.service`, lanzado a mano a las 18:32:46 UTC:

```text
backup: /var/backups/crm-production/crm_production-20261118T183246Z.dump
tamano: 674536 bytes
sha256: 801666e8d8f5ec78504ec5b1d2266648df65eef9c96c3a27e1fda24ededf8fa3
cifrado: /var/backups/crm-production/crm_production-20261118T183246Z.dump.age (674896 bytes)
rotado: /var/backups/crm-production/crm_production-20261112T031920Z.dump
subido: crm_production-20261118T183246Z.dump.age (674896 bytes)
retencion externa: se borro lo de mas de 30 dias
crm-backup-offsite: success · crm-heartbeat@backup: success · crm-db-size: success
```

Staging, a las 18:33:39 UTC:

```text
backup: /var/backups/crm-staging/crm_staging-20261118T183339Z.dump
tamano: 92762 bytes
sha256: 5cd88ac07d30816c3dcec954cb066e7df304a98cd487d113370f3ee9a1d296be
rotado: /var/backups/crm-staging/crm_staging-20261112T031540Z.dump
```

En cada droplet se recalculó el `sha256` y coincidió con el `.sha256` escrito. El `.recuentos`
tiene 77 líneas en producción y 17 en staging. Ninguna unidad fallida.

**Una lectura falsa, corregida.** La primera comprobación de las sumas dio dos «ok» que comparaban
**dos cadenas vacías**: el `cd` a la carpeta de backups falló por permisos y los comandos
siguientes no encontraron los archivos. Se rehízo dentro de `sudo bash`, comprobando que los
valores no estén vacíos. Es el mismo defecto que el HANDOFF registró el 2026-11-17 en el paso 2
del despliegue: una comparación contra una cadena vacía no da un resultado, y se lee igual que el
bueno.

## AC-1 y AC-3 · La copia local `[leído]`

Copiados por `ssh … sudo cat` a `%USERPROFILE%\Backups\crm-final-2026-11-18`: el `.age` de
producción con su `.age.sha256`, el `.sha256` del dump en claro y el `.recuentos`; el dump de
staging con su `.sha256` y su `.recuentos`; y la clave **pública** de `age`. El dump en claro de
producción **no** se copió.

```text
age sha: ok
staging sha: ok
```

El dump de staging se cifró en la máquina local con la misma clave pública
(`crm_staging-20261118T183339Z.dump.age`, 92.978 bytes, con su `.age.sha256`), y su copia en claro
se borró después de restaurarla.

Segunda copia en `%USERPROFILE%\OneDrive\Backups\crm-final-2026-11-18`, **solo los dos `.age`**
con sus `.age.sha256`:

```text
OneDrive crm_production-20261118T183246Z.dump.age: ok
OneDrive crm_staging-20261118T183339Z.dump.age: ok
```

**Esas cuatro salidas no muestran los valores**, así que no prueban que la comparación tuviera la
guarda de no vacío (revisión independiente, N-1). Se rehicieron a las 19:06 UTC imprimiendo los
dos valores:

```text
local crm_production-20261118T183246Z.dump.age calculado=d43e7ae37d596f27… esperado=d43e7ae37d596f27… ok
local crm_staging-20261118T183339Z.dump.age calculado=c024ca1a4944d49e… esperado=c024ca1a4944d49e… ok
OneDrive crm_production-20261118T183246Z.dump.age calculado=d43e7ae37d596f27… esperado=d43e7ae37d596f27… ok
OneDrive crm_staging-20261118T183339Z.dump.age calculado=c024ca1a4944d49e… esperado=c024ca1a4944d49e… ok
```

La clave privada vive en el perfil del usuario, **fuera de las dos carpetas**. Al terminar, la
carpeta local tiene **0** dumps en claro.

## AC-2 · La restauración

En el Postgres de `docker-compose.yml` (`postgres:18.6-trixie`, `127.0.0.1:5432`). El de Vixora CRM,
en otro puerto, no se tocó. El método es el de `deploy/production/crm-restore-check.sh`: base
nueva, `pg_restore --exit-on-error` **sin `--no-owner`**, la misma consulta de recuentos que
escribe el manifiesto, el dueño de las tablas y, en producción, el hash de cada imagen.

Se creó el rol `crm_owner` (`NOLOGIN`) en el Postgres local, que no lo tenía: los dumps asignan las
tablas a ese rol y `pg_dump` no trae los `CREATE ROLE`.

**Staging**, en `crm_restore_staging`, borrada al terminar `[leído]`:

```text
sha256 dump: 5cd88ac07d30816c3dcec954cb066e7df304a98cd487d113370f3ee9a1d296be
pg_restore termino sin error
OK: 17 tablas coinciden en existencia y recuento
duenos: crm_owner
base crm_restore_staging borrada: 0 restantes
rc=0
```

**Control negativo 1**, el mismo dump cortado a 46.000 bytes `[leído]`:

```text
pg_restore: error: could not read from input file: end of file
FALLA: pg_restore
```

Falla en `pg_restore`, antes de la comparación. La base de prueba quedó borrada.

**Control negativo 2**, el dump bueno contra un manifiesto con un recuento alterado
(`audit_logs 30` → `31`) `[leído]`:

```text
rc script=1
FALLA: recuentos distintos
base crm_restore_negativo2 borrada: 0 restantes
```

**Producción**, en `crm_demo`, que **se conserva** porque es la demo (D-6). El usuario descifró en
su terminal, con su clave; la sesión no la vio `[leído]`:

```text
sha256 descifrado = servidor: SI (674536 bytes)
sha256 dump: 801666e8d8f5ec78504ec5b1d2266648df65eef9c96c3a27e1fda24ededf8fa3
pg_restore termino sin error
OK: 77 tablas coinciden en existencia y recuento
duenos: crm_owner
imagenes: 1, no coinciden con su hash: 0
migraciones registradas: 67
organizaciones: 3
```

El dump descifrado se borró del disco y del contenedor apenas terminó la restauración.

## AC-5 · Systemd después de deshabilitar `[leído]`

Producción, 18:43:45 UTC:

```text
crm-production.service           inactive   disabled
crm-backup.timer                 inactive   disabled
crm-fx-reader.timer              inactive   disabled
crm-restore-check.timer          inactive   disabled
crm-backup.service               inactive   static
crm-backup-offsite.service       inactive   static
crm-db-size.service              inactive   static
crm-heartbeat@backup.service     inactive   static
crm-fx-reader.service            inactive   static
crm-restore-check.service        inactive   static
--- list-timers crm-*: 0
--- failed: 0
nginx: active · postgresql: active · certbot.timer: active
```

Staging, 18:43:56 UTC:

```text
crm-backup.service               inactive   static
crm-restore-check.service        inactive   static
crm-staging.service              inactive   disabled
crm-backup.timer                 inactive   disabled
crm-restore-check.timer          inactive   disabled
--- list-timers crm-*: 0
--- failed: 0
nginx: active · postgresql: active · certbot.timer: active
```

`static` es una unidad sin sección de instalación, que corre solo si otra la llama. Con los timers
deshabilitados nada la llama. **No se borró ninguna unidad, dump ni dato**: las diez unidades
`crm-*` de producción y las cinco de staging siguen instaladas.

## AC-6 · 24 horas sin alertas `[leído]` y `[transcrito]`

**Cumplido.** La ventana va desde AC-5 (2026-11-18 18:43:56 UTC) hasta el 2026-11-19 18:44 UTC.
Se comprobó el 2026-11-19 a las 22:04 UTC, después de que cerrara.

**En los droplets**, leído por `ssh` en solo lectura, contando eventos del journal de las unidades
del CRM (`crm-backup`, `crm-backup-offsite`, `crm-fx-reader`, `crm-restore-check`, `crm-db-size`,
`crm-heartbeat@` y el servicio de cada entorno):

```text
                                           producción   staging
líneas del journal en la ventana                 9108      7450
eventos de unidades del CRM en la ventana           0         0
lo mismo hasta las 22:04 UTC del 19                 0         0
entre 03:00 y 03:30 UTC del 19 (el backup)          0         0
control: el mismo filtro, 18/11 17:00–18:44        38        16
último dump en disco                    el final 18:32  el final 18:33
timers del CRM                       disabled/inactive disabled/inactive
```

El control prueba que el filtro ve lo que busca: encuentra las detenciones del 18, como
`Stopped crm-backup.timer` a las 18:43:46. **El horario del backup pasó sin disparo**, y no hay un
dump posterior al final, así que tampoco se mandó nada al bucket. La primera lectura usó «crm» como
filtro y no servía en producción, porque el nombre del host lo contiene y aparece en cada línea; se
rehízo con los nombres de las unidades.

**Los avisos externos**: el usuario informó el 2026-11-19 que **no le llegó ninguna alerta**, ni de
Healthchecks.io ni de DigitalOcean, en la ventana. `[transcrito]` La sesión no ve esos paneles.
No se confirmó que los cinco chequeos de Healthchecks.io sigan en «paused»: que no haya llegado
ningún aviso es lo que pide el criterio.

## AC-7 · La demo sobre `crm_demo` `[leído]`

`npm run dev` con `DATABASE_URL` apuntado a `crm_demo` en la terminal, sin editar `.env`:

```text
GET /api/health: 200 · GET /login: 200 · GET /: 307 -> /login
organizaciones: Vixora · Demostración Vixora · iPhone Demo
GET /api/read/v1/products?q=iphone: 200 (contract_version 1, 10 items)
POST /api/ingestion/v2/events: 200 {"result":"accepted", ...}
el mismo evento repetido: 200 {"result":"duplicate", ...}
ingestion_events: client.resolved | processed | demo-local | iPhone Demo
lectura sin token: 401
```

Con credenciales locales `read` e `ingest` de «iPhone Demo», creadas con
`npm run ingestion:credential` y **revocadas al terminar** (0 sin revocar). Los tokens no se
imprimieron en la conversación.

**Dos errores del instrumento, no del CRM**: la primera lectura dio `400` con el campo `q`, que es
obligatorio y no se mandó, y la primera ingestión dio `400` con `occurred_at`, que estaba más de
5 minutos en el futuro. La guía los nombra.

**Lo que queda en `crm_demo` por esta prueba**: el cliente sintético «Cliente Demo Local» en
«iPhone Demo», y su evento de ingestión.

**Lo que la sesión no comprobó**: el ingreso del usuario a la interfaz con su contraseña. La parte
de AC-7 que dice «el usuario entra y ve las organizaciones» la confirma el usuario. *Confirmado
por el usuario el 2026-11-18, después del push de `bb24d1a`*: «entro a la demo y veo las tres
organizaciones». `[transcrito]`

## AC-8 · La guía seguida desde cero `[leído]`

[`docs/runbooks/demo-local.md`](../runbooks/demo-local.md), seguida tal como está escrita en un
Postgres **nuevo**: el mismo `docker-compose.yml` con otro nombre de proyecto (`crm-guia`) sobre un
volumen vacío. El Postgres de desarrollo se detuvo sin perder datos. El paso 4 lo corrió el usuario
con su clave.

```text
paso 1: crm-guia-postgres-1 Healthy
paso 2: sha256 del .age: OK
paso 3: rc 0; crm_demo creada
paso 4: pg_restore: OK            (dump en claro nunca escrito a disco)
paso 5: OK: 77 tablas coinciden en existencia y recuento
        imagenes que no coinciden con su hash: 0
        roles: crm, crm_app, crm_fx_reader, crm_owner
paso 6: apunta a crm_demo · /api/health 200 · /login 200 · lectura con la API apagada 404
paso 7: dos credenciales creadas (rc 0)
paso 8: lectura 200 · ingestión {"result":"accepted"} · ingestion_events: processed
```

La comprobación de los roles **antes** del paso 3 falló por las comillas de la consulta, así que
no hay salida que muestre el volumen sin roles `crm*`. Lo que sí prueba el paso 3 es que
`pg_restore --exit-on-error` termina bien con los roles que la guía crea.

Al terminar: el proyecto `crm-guia` se borró con su volumen (`0` restantes), el Postgres de
desarrollo volvió a levantarse con `crm_demo` intacta, y las credenciales de prueba se revocaron.

**Un defecto del entorno que la guía no tiene**: `TaskStop` cortó la terminal de `npm run dev` pero
dejó vivo el proceso de Next en el puerto 3000. Se detuvo a mano.

## El bucket

*Listado el 2026-11-18 a las 19:15 UTC, con autorización del usuario, en solo lectura:
`rclone lsl` y `rclone size` desde el droplet de producción, con la configuración de
`backup.env`.* `[leído]`

- **96 objetos, 19,823 MiB.** Son **32 backups de producción**, cada uno con su `.dump.age`, su
  `.age.sha256` y su `.recuentos`:
  - uno por día, del 2026-10-20 al 2026-11-18;
  - uno extra el 2026-10-27 a la 01:05;
  - **el final**, `crm_production-20261118T183246Z`, subido a las 18:32:46.
- **El `.age` final mide 674.896 bytes**, igual que la copia local.
- **No hay nada de staging** ni ningún dump en claro.

Con los timers apagados, nada lo poda ni le agrega. **Lo más viejo es del 2026-10-20**, al borde
de los 30 días de retención, y queda ahí porque la poda ya no corre.

El bucket es **la única copia que tiene el `.recuentos` fuera de la máquina del operador**: con él
se puede verificar una restauración aunque se pierda la carpeta local (N-8).

## La revisión independiente y lo que cambió después `[leído]`

Un agente que no participó revisó la entrega en solo lectura, contra el brief y `CLAUDE.md`. El
veredicto fue **R1, con 2 hallazgos bloqueantes y 11 no bloqueantes**. Cada hallazgo se verificó
contra los archivos antes de aceptarlo, y se aceptaron todos.

- **B-1.** Los documentos daban la Fase 13 por cerrada con AC-6 abierto. Ahora dicen que **se
  cierra** por archivo, cuando pasen AC-6 y la aprobación del usuario.
- **B-2.** El §Cierre no se declaraba autoevaluación. Ahora sí, y nombra esta revisión.

Cambios en la guía, después de AC-8:

- el paso 2 comprueba que las sumas no estén vacías (N-1);
- el paso 5 suma la guarda de cero tablas y el dueño de las tablas (N-2), y aclara que vale solo
  justo después de restaurar;
- el paso 8 arma un `event_id` nuevo en cada corrida, corrige lo que dice de `duplicate` (N-3) y usa
  un teléfono del rango ficticio de los contratos (N-11).

Esos pasos cambiados se corrieron a las 19:06 UTC, **pero no la guía entera desde cero**:

- **Paso 2.** Con la carpeta real dio `sha256 del .age: OK`. Con `B` mal escrito, `NO COINCIDE, o
  falta un archivo: no sigas`.
- **Paso 5**, contra el `crm_demo` de hoy. Dio `FALLA: no sigas`, con cinco diferencias:
  `audit_logs` 530→531, `clients` 4→5, `ingestion_credentials` 10→12, `ingestion_events` 487→488
  e `ingestion_rate_windows` 6→8. Son **las escrituras de la prueba de AC-7**: un cliente, dos
  credenciales y un evento. Es el resultado correcto para una base usada. Recién restaurada,
  la comparación había dado 77 tablas iguales (§AC-2).
- **El dueño**: `duenos de las tablas: crm_owner`.
- **Control de la guarda de cero tablas**: un manifiesto vacío contra un resultado vacío da
  `FALLA: no sigas`.

El paso 8 nuevo **no se corrió**.
