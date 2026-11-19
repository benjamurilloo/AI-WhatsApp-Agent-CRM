# Brief 13.6 — El archivo del CRM como demo local

**Estado: aprobado el 2026-11-18, con D-1 a D-8 cerradas en su opción (a)** por decisión del
usuario. **Se ejecutó el mismo día y se cerró el 2026-11-19**, con la aprobación del usuario
(§Cierre). Tipo de tarea: `operations` (backup final,
apagado de servidores y documentación), **sin código de producto y sin migraciones**. Lo pide el
proyecto **Vixora CRM**, que lo puso como condición de entrada: su [ADR 0004](../../../Vixora-CRM/docs/decisions/0004-infraestructura.md)
(D-8 bis, variante d2, 2026-11-18) hereda el droplet de 2 GB `crm-production` y destruye el de
1 GB `crm-staging`. **Leído en ese repositorio en solo lectura**: la decisión existe y dice lo que
el pedido dice.

**Esto no autoriza nada.** Aprobar este brief es aprobar su alcance y sus decisiones. Cada acción
sobre los droplets, Notion, Git o un servicio externo se autoriza en su turno.

## Objetivo

Que el AI WhatsApp Agent CRM deje de estar desplegado sin perder nada: **backup final de los dos
entornos, restaurado y verificado**; **ningún trabajo programado ni alerta** que siga corriendo o
que dispare en falso; **la demo levantada en localhost** con una guía; y el cambio registrado en un
**ADR 0026**, el vault, Notion, el CHANGELOG y el HANDOFF. Al cerrar, los dos droplets quedan
**libres** para que Vixora CRM los destruya o los recree.

## Punto de partida verificado

Leído el 2026-11-18, en solo lectura, no recordado:

- **Git**: `main` en `8be4dbd`, **dos commits adelante de `origin/main`** (`900464f`): `dcfbf86`, el
  listado de la 24.9.1, y `8be4dbd`, su nota del HANDOFF. Sin empujar por decisión del usuario.
- **Fase en curso**: la **24.9.1 está EN IMPLEMENTACIÓN y PAUSADA**, con la tarea de Notion
  `407702be6f4e81e79461d7af3fe70237` en «En proceso». Su nivel objetivo es **validado en staging**.
  **La Fase 13 — Producción sigue abierta**, con la 13.5.2-b esperando un negocio real.
- **`crm-production`** (16:06 UTC): corre `4e282e2`, **67 migraciones**, la base ocupa **17 MB**.
  Activos y habilitados: `crm-production`, `nginx`, `postgresql@18-main`, `certbot.timer` y los
  **tres timers del CRM**: `crm-backup.timer` (próximo, 19-11 03:16 UTC), `crm-fx-reader.timer`
  (próximo, hoy 18:00 UTC) y `crm-restore-check.timer` (01-12). Sin timer propio, disparados en
  cadena: `crm-backup-offsite`, `crm-db-size` y `crm-heartbeat@<trabajo>`. Último backup y copia
  externa: `success` hoy 03:19 UTC. Último ejercicio de restauración: `success` el 2026-11-01.
  Ninguna unidad fallida.
- **`crm-staging`**: corre `6705457` (26 migraciones), muy atrás de producción. Activos:
  `crm-staging`, `nginx`, `postgresql@18-main`, `certbot.timer`, `crm-backup.timer` y
  `crm-restore-check.timer`. **Su backup no se cifra y no sale del droplet.** Sin avisos de vida.
- **Los avisos que no viven en systemd**, del [runbook de producción](../../deploy/production/README.md)
  §Monitoreo:
  - **Cinco chequeos de Healthchecks.io**: backup, offsite, db-size, restore-check y fx-reader.
  - **Un chequeo de Uptime de DigitalOcean** sobre `/api/health`.
  - **Dos alertas de recursos de DigitalOcean**: disco y memoria.
- **El bucket** `crm-production-backups` (Spaces, NYC3) guarda las copias `.age` de los últimos
  `OFFSITE_KEEP_DAYS` días. Costo informado en la 13.1: **USD 5 por mes**.
- **El agente** (repositorio `AI-WhatsApp-Agent`, leído en solo lectura):
  - Sus conciliaciones 3.52, 3.53, 3.54 y 3.54-E1 y el aviso 29.8 trabajan contra
    `https://crm.vixoraai.app`. **Confirmado.**
  - **Corre en un n8n remoto** (Easypanel), con `CRM_ENV=production`.
  - Elige el host del CRM de **una tabla cerrada** en `lib/crm-env.js`, copiada en los Code nodes:
    `staging.vixoraai.app` o `crm.vixoraai.app`. **Producción rechaza cualquier otro host.**
  - **No puede alcanzar un CRM en `localhost`** sin un cambio en su código o en su despliegue.
- **Máquina local**: `age` instalado, `rclone` no. Docker corre `vixora-crm-postgres-1` en
  `127.0.0.1:5433`, así que **no choca** con el `5432` del `docker-compose.yml` de este repositorio.
  Ese contenedor no se toca.

## Hallazgos que condicionan el alcance

### H-1 · El agente no puede apuntar a una demo local sin cambiar su proyecto

Es la condición de detención que el pedido anticipa, y **se cumple ya en la planificación**. Hay
dos caminos, y los dos son trabajo **del proyecto del agente**:

- correr n8n en la máquina del usuario;
- o publicar el CRM local por un túnel y agregar ese host a la tabla cerrada.

Desde acá no se cambian. Ver D-8.

### H-2 · Apagar los timers no evita las alertas: las provoca

Healthchecks.io alerta cuando **deja de recibir** el aviso. Deshabilitar un timer sin pausar su
chequeo produce exactamente la alerta falsa que el pedido prohíbe. Lo mismo pasa con el Uptime de
`/api/health` si se detiene la aplicación. **El orden es: primero pausar o borrar afuera, después
apagar adentro.** Esas cuentas son del usuario.

### H-3 · El droplet de producción guarda datos en claro

`/var/backups/crm-production` tiene el último dump **sin cifrar**, y `/etc/crm-production/` tiene
los secretos. Si Vixora usa el droplet tal como está, sin reconstruirlo, hereda las dos cosas.
**«Libre» exige un *rebuild* o una destrucción**, no una reutilización.

### H-4 · La Fase 13 y la 13.5.2-b dependen de un entorno que deja de existir

La 13.5.2-b, el alta de un negocio real, necesita producción. La **Fase 14 tiene como gate la Fase
13 cerrada**. Ver D-2.

### H-5 · La 24.9.1 apunta a un nivel que ya no se puede alcanzar

«Validado en staging» necesita un entorno equivalente a producción. Sin droplets, una subfase de
pantalla llega como mucho a **validado en integración** (end-to-end sobre `next start` local). Ver
D-3.

## Decisiones

Cada una con su recomendación. **Las ocho quedaron cerradas en (a) el 2026-11-18**, por decisión
del usuario al aprobar el brief.

### D-1 · Dónde vive esta subfase

- **(a) Recomendada.** **13.6, dentro de la Fase 13 — Producción.** Es la fase dueña de los
  droplets, los backups y las alertas.
- (b) Una Fase 30 nueva, «Archivo».

### D-2 · Qué pasa con la Fase 13, la 13.5.2-b y la Fase 14

- **(a) Recomendada.**
  - **La Fase 13 cierra con la 13.6**, como «cerrada por archivo».
  - **La 13.5.2-b queda descartada**, con el motivo escrito. Su tarea pasa a «Completado», como la
    24.8.2-c, porque el estado no tiene la opción «Descartada».
  - **La Fase 14 queda planificada y sin abrir.** Su gate no se cumple por esta vía, y el ADR lo
    dice.
- (b) La Fase 13 queda abierta, «en pausa».

### D-3 · La Fase 24 y la 24.9.1

- **(a) Recomendada.** La 24.9.1 **sigue pausada**, sin tocar su código ni su brief. El ADR 0026
  registra que, desde el archivo, **el nivel máximo alcanzable es validado en integración**. Quien
  la retome enmienda su nivel objetivo en su propio brief.
- **Sobre los dos commits sin empujar**: el commit de cierre de la 13.6 queda encima de ellos, así
  que empujarlo los empuja también. **Se pide aparte, al cerrar**: o se empujan los tres, o no se
  empuja ninguno.

### D-4 · Dónde queda el backup final

- **(a) Recomendada.**
  - **El destino**: una carpeta fuera del repositorio en la máquina del usuario, con una segunda
    copia en OneDrive. La ruta exacta la elige el usuario y el ADR la nombra **sin datos**.
  - **El formato**: solo archivos **`.age`**. El dump de staging, que hoy sale sin cifrar, se cifra
    en la máquina local con la misma clave pública antes de guardarlo.
  - **La clave privada de `age` no se guarda junto a las copias.**
  - **Costo**: se mantiene.
- (b) Solo en el bucket. Ata el backup a una cuenta paga.

### D-5 · El bucket offsite

- **(a) Recomendada.**
  - **Hoy no se toca.** Queda con lo que tiene: las copias `.age` diarias de producción de los
    últimos días, la final incluida. Con el offsite apagado, nada lo poda ni le agrega.
  - **Vixora decide en su 1.6** si lo reutiliza. Si no, se vacía y se borra con autorización en ese
    turno.
  - **Costo**: se mantiene en USD 5 por mes hasta esa decisión.
  - **Por verificar en la facturación de DigitalOcean**: si borrar el último bucket cancela la
    suscripción a Spaces.
- (b) Borrarlo al cerrar la 13.6, cuando la copia local ya esté verificada. **El gasto baja USD
  5.** Vixora pierde la opción de reutilizarlo con lo que contiene.

### D-6 · Con qué datos corre la demo local

- **(a) Recomendada.** **Con el backup final de producción restaurado.** La restauración de AC-2 es
  la demo misma, en una base aparte `crm_demo` del Postgres del `docker-compose.yml`.
  - Trae las organizaciones de demostración, con los recorridos de todas las fases, y los usuarios
    con sus contraseñas de hoy.
  - Los datos son del usuario: la organización «Vixora» tiene 0 clientes, y el único remitente es
    su propio teléfono.
- (b) Con los seeds sintéticos. Se pierden los recorridos.

### D-7 · Qué se apaga en cada droplet

- **(a) Recomendada.**
  - **Se detienen y se deshabilitan**: los timers del CRM y la aplicación (`crm-production` y
    `crm-staging`).
  - **Quedan corriendo** `nginx`, `postgresql` y `certbot` hasta que Vixora destruya o recree.
    Nada de eso alerta, y la base sigue ahí como respaldo hasta la destrucción.
  - **No se borra nada del disco.**
- (b) Solo los timers, con la aplicación arriba. **No lo recomiendo**: el agente seguiría escribiendo
  después del backup final, y ese backup dejaría de ser el final.

### D-8 · El agente

- **(a) Recomendada.**
  - **La 13.6 entrega la parte del CRM**: la demo local, la guía y cómo crear las credenciales
    locales de lectura e ingestión.
  - **Apuntar el agente a la demo local** queda como **pendiente declarado del proyecto del
    agente**, con un aviso en el Escritorio del usuario.
  - Antes de apagar `crm-production`, **el proyecto del agente** deja sin definir
    `CRM_WRITE_ENABLED`, `CRM_CONTEXT_SOURCE` y `CRM_READ_SOURCE` en su instancia de producción, que
    es su propio interruptor documentado. Si no, cada turno termina en `CRM_READ_UNAVAILABLE` y la
    cola `crm_outbox` retiene filas.
  - **Consecuencia**: la condición 3 de Vixora queda **parcialmente cumplida**, y el resumen lo dice.
- (b) La 13.6 no cierra hasta que el agente corra contra la demo local. Mi cierre queda atado a
  trabajo de otro proyecto.

## Alcance

### Incluido (si D-1 a D-8 cierran en (a))

1. **El backup final** de producción y de staging, **después** de detener la aplicación: un dump
   fresco con su `sha256` y su manifiesto `.recuentos`, por el mismo `crm-backup.service`.
2. **La copia a la máquina local**, cifrada, y **su restauración real**:
   - el usuario descifra con su clave;
   - se restaura en una base nueva del Postgres local;
   - se compara contra el manifiesto, tabla por tabla, y contra los `sha256` de las imágenes de
     producto, con el método de `crm-restore-check.sh`;
   - los archivos en claro se borran.
3. **Los avisos externos, pausados o borrados por el usuario**: los cinco de Healthchecks.io, el
   Uptime y las dos alertas de recursos. Va primero, por H-2.
4. **Apagar y deshabilitar en los dos droplets**, y **comprobarlo leyendo systemd**: `is-active`,
   `is-enabled`, `list-timers` y `--failed`.
5. **La guía** `docs/runbooks/demo-local.md`: levantar la demo, restaurar el backup en `crm_demo`,
   las credenciales locales y qué le hace falta al agente para apuntarla. **Sin secretos ni IP.**
6. **La documentación**: el ADR 0026, este brief cerrado, una evidencia, el índice de decisiones, el
   Roadmap, `Environments.md`, el encabezado de estado de los dos README de `deploy/`, el CHANGELOG
   y el HANDOFF.
7. **Fuera del repositorio**: el hub del vault, Notion (la 13.6, la 13.5.2-b, la Fase 13 y el texto
   «Estado» del raíz), el aviso al agente en el Escritorio y **el resumen para Vixora CRM**.

### Excluido

- Destruir o recrear droplets, y cambiar el DNS. Eso es de Vixora, en su 1.6, o del usuario
  después del cierre.
- Borrar datos de los servidores, o el bucket si D-5 cierra en (a).
- Cualquier cambio en el repositorio, la configuración o el n8n del agente.
- El repositorio, la base y el contenedor `vixora-crm-postgres-1` de Vixora CRM.
- El código de la 24.9.1 y los archivos de `deploy/`, que se conservan como registro. Las guardas
  `staging-*` siguen en verde sin tocarlas.

## Lista cerrada de archivos

| Archivo | Cambio |
|---|---|
| `docs/decisions/brief-13.6-el-archivo-como-demo-local.md` | este brief, con su §Cierre |
| `docs/decisions/0026-el-crm-se-archiva-como-demo-local.md` | nuevo |
| `docs/decisions/evidencia-13.6-archivo.md` | nuevo: salidas, sin IP ni secretos |
| `docs/decisions/README.md` | filas del ADR y del brief |
| `docs/runbooks/demo-local.md` | nuevo |
| `docs/planning/Roadmap.md` | Fase 13: la 13.6 y el cierre |
| `docs/development/Environments.md` | la línea de estado |
| `deploy/production/README.md`, `deploy/staging/README.md` | solo el encabezado de estado |
| `CHANGELOG.md`, `HANDOFF.md` | entrada y reescritura |

## Invariantes

- Ningún dato se borra de un droplet antes de AC-2.
- Ni IP, ni hash de IP, ni secreto, ni URL de aviso de vida en un archivo versionado o en la
  conversación.
- La clave privada de `age` no entra a ningún droplet ni sale de la máquina del usuario.
- Un descifrado en claro vive solo mientras dura la restauración.

## Criterios de aceptación

- **AC-1** · Existe un backup final de cada entorno, tomado con la aplicación detenida, con su
  `sha256` comprobado en la copia local.
- **AC-2** · Cada backup se **restauró** en una base aparte, y la lista de tablas y los recuentos
  coinciden con su manifiesto. En producción, además, cada imagen coincide con su `sha256`.
  **Control negativo**: un dump truncado falla la misma comparación.
- **AC-3** · La copia queda donde dice D-4, cifrada, y el ADR dice dónde.
- **AC-4** · Los ocho avisos externos (cinco, uno y dos) están pausados o borrados **antes** de AC-5,
  confirmados por el usuario.
- **AC-5** · En cada droplet, `systemctl` muestra `inactive` y `disabled` en cada timer del CRM y en
  la aplicación; `list-timers` no lista ningún `crm-*`; y `--failed` da 0. **Se lee después del
  cambio.**
- **AC-6** · **24 h después de AC-5**, Healthchecks.io y DigitalOcean no mandaron ninguna alerta, y
  pasó al menos un disparo programado (el backup de las 03:15 UTC).
- **AC-7** · La demo corre en local sobre `crm_demo`: el usuario entra y ve las organizaciones de
  demostración. Con las credenciales locales, una lectura `GET /api/read/v1/products` da `200` y
  una ingestión de prueba queda registrada.
- **AC-8** · La guía permite repetir AC-7 desde cero. Lo prueba seguirla tal como está escrita, en
  una base nueva.
- **AC-9** · El ADR 0026, el CHANGELOG, el HANDOFF, el hub del vault y Notion dicen «archivado /
  demo en localhost», releídos después de escribirlos.
- **AC-10** · Existe el resumen para Vixora CRM, sin IP ni secretos, con los siete puntos que pide.

## Orden de ejecución

Cada paso con efecto se autoriza en su turno.

1. **El agente deja de consumir producción.** Lo hace su proyecto, por D-8.
2. **El usuario pausa los ocho avisos externos** (AC-4).
3. **Detener las dos aplicaciones.**
4. **Correr el backup final** en cada droplet.
5. **Copiar, restaurar y verificar en local** (AC-1 a AC-3).
6. **Deshabilitar los timers y las aplicaciones**, y leer systemd (AC-5).
7. **Levantar la demo y escribir la guía** (AC-7 y AC-8).
8. **Documentar** y pedir el commit de cierre.
9. **Esperar las 24 h de AC-6** y entregar el resumen a Vixora.

## Condiciones de detención

- **El agente sigue llamando a producción al llegar al paso 3**: se detiene y se avisa.
- **AC-2 no cierra**, por una tabla o un recuento distintos: no se apaga nada más hasta entender
  por qué.
- **El usuario no puede descifrar** con su clave privada: se detiene. El bucket sería la única copia
  y no se toca.
- **Un paso necesita tocar Vixora CRM o el agente**: se detiene.
- **Aparece un costo nuevo**: se detiene.

## Costo mensual

| Concepto | Hoy | Al cerrar la 13.6 | Cuando Vixora destruya `crm-staging` |
|---|---|---|---|
| `crm-production`, 2 GB | USD 12 | USD 12 (pasa a Vixora) | USD 12 (de Vixora) |
| `crm-staging`, 1 GB | el precio del plan de 1 GB, **por verificar en la facturación** | igual | **0** |
| Spaces | USD 5 | USD 5 con D-5 (a), **0** con (b) | según la 1.6 de Vixora |
| Uptime, Healthchecks.io y alertas | 0 | 0 | 0 |

**La 13.6 sola no cambia el gasto**: no destruye nada. Lo baja la destrucción de `crm-staging` y,
según D-5, el bucket.

## Nivel de validación objetivo

No hay código nuevo. El cierre informa **un nivel por cosa**, sin inferir uno de otro:

- «backup **restaurado y verificado**» (AC-2), no «backup generado»;
- «servicios **apagados, leído en systemd**» (AC-5);
- «sin alertas **durante 24 h observadas**» (AC-6);
- «demo **corriendo en local**» (AC-7);
- y para el agente, «**pendiente en su proyecto**», si D-8 cierra en (a).

## Cierre

*Escrito el 2026-11-18, después del paso 7, y corregido ese mismo día tras la revisión
independiente.* **La tabla es autoevaluación**: la escribió la sesión que ejecutó la subfase. La
revisó un agente que no participó, con acceso de solo lectura, contra este brief y `CLAUDE.md`. El
veredicto fue **R1, con 2 hallazgos bloqueantes y 11 no bloqueantes**. Todos se verificaron contra
los archivos y se corrigieron; ver [evidencia-13.6](evidencia-13.6-archivo.md), §La revisión
independiente. La decisión está en el [ADR 0026](0026-el-crm-se-archiva-como-demo-local.md).

**Cerrada el 2026-11-19**, con la aprobación del usuario. Con ella cierra la Fase 13, por archivo y
sin haber alcanzado su gate.

| Criterio | Estado |
| --- | --- |
| AC-1 | **Cumplido.** El backup final de los dos entornos se tomó con las aplicaciones detenidas. El `sha256` se comprobó en la copia local, imprimiendo los dos valores |
| AC-2 | **Cumplido, con un desvío en el control negativo.** Producción se restauró en `crm_demo`: coinciden las 77 tablas y la única imagen. Staging se restauró en una base aparte: coinciden sus 17 tablas. El criterio pide que el dump truncado falle **la misma comparación**, pero **falla antes**, en `pg_restore`. Por eso se sumó un segundo control, el dump bueno contra un manifiesto alterado, que sí falla la comparación |
| AC-3 | **Cumplido.** Solo hay `.age`, en la carpeta local y en OneDrive, con la clave privada aparte. El ADR nombra las dos rutas con `%USERPROFILE%`. La copia de OneDrive no trae los `.recuentos` |
| AC-4 | **No cumplido como está escrito.** Antes del paso 3 se borraron los tres avisos de DigitalOcean: las tres alertas del chequeo de Uptime, que sigue existiendo, y las dos alertas de recursos. Los cinco chequeos de Healthchecks.io se pausaron **después** de AC-5, porque el backup final reactiva un chequeo pausado al avisar (ver abajo). Lo confirmó el usuario |
| AC-6 | **Cumplido.** Comprobado el 2026-11-19, con la ventana cerrada: cero eventos de unidades del CRM en los dos droplets, con un control que sí los encuentra antes de AC-5, y el horario del backup pasado sin disparo `[leído]`. Ninguna alerta de Healthchecks.io ni de DigitalOcean, según el usuario `[transcrito]` |
| AC-7 | **Cumplido.** La lectura dio `200` y la ingestión quedó `processed`. El 2026-11-18 el usuario confirmó que entra a la interfaz de la demo y ve las tres organizaciones `[transcrito]` |
| AC-8 | **Cumplido en parte.** La guía se siguió tal como estaba escrita, en un Postgres nuevo, con lectura `200` e ingestión `accepted`. Tiene dos límites. El ingreso a la interfaz no se comprobó sobre esa base: el usuario lo confirmó sobre `crm_demo` (AC-7). Y la guía **cambió después** por la revisión: los pasos cambiados se corrieron, pero la guía entera no se volvió a seguir desde cero |
| AC-9 | **Cumplido.** En el repositorio, escrito. En Notion, la 13.5, las cinco tareas y el «Estado» del raíz, el 2026-11-18; la 13.6, el proyecto de la Fase 13 y su tarea espejo en «Completado», el 2026-11-19. Todo releído después de escribir. El hub del vault se actualizó los dos días |
| AC-10 | **Cumplido, con un desvío.** El resumen se entregó **provisional** el 2026-11-18, antes de AC-6, y **final** el 2026-11-19, al cerrar. Sin IPs ni secretos |

**Desvíos y su motivo:**

- **El orden de los avisos (AC-4).** El brief puso pausar los ocho antes del paso 3. Antes de
  empezar apareció un hecho que el brief no vio: `crm-backup.service` encadena
  `crm-heartbeat@backup`, y en Healthchecks.io un chequeo pausado se reactiva cuando recibe un
  aviso. La sesión propuso borrar las alertas de DigitalOcean antes del paso 3 y pausar
  Healthchecks.io después del paso 6, y el usuario siguió ese orden. AC-6 mostró que alcanzó: ningún aviso en las 24 h.
- **El resumen para Vixora CRM se adelantó (AC-10).** El brief lo ponía después de AC-6. El usuario
  lo pidió antes, para que Vixora CRM pudiera avanzar, y se entregó marcado como provisional, con lo
  que todavía faltaba. La versión final se entregó al cerrar.
- **El control negativo de AC-2**, por lo que explica la tabla.
- **La búsqueda de productos de AC-7 lleva `q`.** `GET /api/read/v1/products` sin `q` da `400` por
  contrato (`read-v1.md`), así que la prueba usó `?q=iphone`.
- **Un rol local de más.** El Postgres de desarrollo ganó `crm_owner` (`NOLOGIN`), que la
  restauración necesita. La guía lo crea junto con `crm_app` y `crm_fx_reader`.

**Pendientes que el cierre de la Fase 13 deja con destino:**

- **En Notion**, *hecho el 2026-11-18 y el 2026-11-19*, cada paso con su autorización:
  - la 13.6, la 13.5.2-b (descartada, con el motivo), el proyecto de la fase y su tarea espejo;
  - las cinco tareas de la Fase 13 que siguen en «Esperando». **El usuario aprobó esta propuesta
    el 2026-11-18**, y se aplica en Notion en su turno. Quedan sin objeto las dos atadas a los droplets: la rotación de syslog y la nota de
    `contrib` del README de staging. Las otras tres siguen valiendo para el repositorio y pasan a
    sueltas: la regla LF de `deploy/**`, el timeout de `module-boundary` y paginar el stock de
    productos.
- **Los avisos externos.** Los cinco chequeos de Healthchecks.io quedan pausados, no borrados. El
  chequeo de Uptime de DigitalOcean sigue existiendo, sin alertas. **Borrarlos lo decide el usuario
  después de AC-6.** Mientras tanto no cuestan nada.
- **Los dos droplets y el bucket**, para Vixora CRM, según los puntos 4 y 5 del ADR.
