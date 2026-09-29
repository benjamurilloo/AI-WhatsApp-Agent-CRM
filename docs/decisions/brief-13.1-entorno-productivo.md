---
schema: task-brief.v1
task_id: "13.1"
task_type: runtime-validation
generated_at: 2026-09-29
---

# Brief: 13.1 — Entorno productivo

**Estado: aprobado el 2026-09-29 por el usuario, con las recomendaciones de D-1 a D-12.** Eso fija: droplet propio de 2 GB o más (D-1); PostgreSQL 18.6 en el droplet (D-2); host `crm.vixoraai.app` (D-3); **protección de rama: opción (a), sin protección, con el paso obligatorio de `conclusion: success` del SHA exacto antes de cada despliegue productivo** (D-4, R-2; esto cumple AC-1); `EnvironmentFile` propio, sin backups ni snapshots de droplet del proveedor (D-5); Node 24 LTS con versión exacta (D-6); collation ICU en castellano, condicionada a la medición de AC-6 (D-7); backup con copia externa cifrada (D-8); script de alta de organización (D-9); dos etapas (D-10); revisión independiente (D-11); guardas extendidas (D-12). La aprobación no autoriza ningún efecto externo: cada uno se autoriza en su turno (D-10).

- **Nivel de evidencia objetivo**: `isolated-runtime`. Los mecanismos se verifican en el entorno productivo, desde afuera, sin tráfico real.
- **Nivel de validación alcanzable**: los mecanismos de esta subfase quedan **verificados en el entorno productivo**, pero ese nivel **no** es «preparado para producción». Todavía faltan la observabilidad (13.3), las mediciones (13.2) y las decisiones de datos reales (13.4); ese nivel es el gate de salida de la fase, no de esta subfase.
- **Orden**: es la primera subfase de la Fase 13 y va antes que todas ([Roadmap](../planning/Roadmap.md), §Fase 13).
- **Precondición bloqueante**: H-3 (O-29). El entorno no se expone sin `TRUSTED_PROXY=true` detrás de un solo proxy real, demostrado por efecto.

## Objetivo

Levantar el **entorno productivo** del CRM: hosting, base, TLS, secretos, backup con copia externa y un procedimiento de despliegue con vuelta atrás. Además, cerrar con evidencia las obligaciones que la evaluación 10.1 le asignó. Al terminar, el entorno está operable y verificado, **vacío de datos reales**, y con la ingestión y la API de lectura apagadas.

**Resultado verificable**: `https://<host productivo>/login` responde desde afuera. Cada obligación de la tabla de abajo tiene su salida cruda en `evidencia-13.1-produccion.md`. Y la base productiva no tiene ni un cliente, ni una conversación, ni un mensaje, ni un producto.

## Situación en la fase

- **Necesario ahora (13.1)**: el entorno y las obligaciones de la tabla siguiente.
- **Antes de producción, no acá**:
  - 13.2: planes con volumen, O-2, O-39, AC-15 de la 12.3, R-8 de la 12.2 y H-3 de la 12.4.
  - 13.3: medición externa de disponibilidad con alerta, pregunta 6.
  - 13.4: retención (R-3) y borrado real (O-11).
  - 13.5: primer cliente, capacidad por credencial y O-36.
- **Mejora posterior, sin fase**: automatizar el despliegue; Node 26 (ver D-6); E-3 y N-6 de la 11.2.

### Obligaciones que toma

| Id | Obligación | Origen | Dónde se cierra |
|---|---|---|---|
| R-2 / O-30 | Protección de rama, que decide el usuario antes del primer despliegue productivo | [evaluación 10.1](evaluacion-10.1-mvp.md), §4 R-2 | D-4, AC-1 |
| O-29 | H-3 como precondición bloqueante | evaluación 10.1, §5 | AC-14 |
| O-7, O-27 | La `0003` no corre sin `CREATEROLE`; `CREATEROLE` en un servicio gestionado | evaluación 10.1, §5; [brief-9.1](brief-9.1-infraestructura-de-staging.md), hallazgo 1 | D-2, AC-7 |
| O-38 | Gestión de secretos, que en staging se decidió solo para staging | evaluación 10.1, §5; [deploy/staging/README.md](../../deploy/staging/README.md) | D-5, AC-19 |
| O-31 | Versión de runtime fijada antes del primer despliegue | evaluación 10.1, §5 | D-6, AC-16 |
| O-4 | La renovación del certificado vista funcionar (corrida en seco y timer, con su salida) | evaluación 10.1, §5; brief-9.1, T-8 | AC-11 |
| O-6 | La cookie verificada sobre el `Set-Cookie` crudo, no por inferencia | evaluación 10.1, §5 | AC-13 |
| O-3 | El dueño de la base en el runbook de restauración | evaluación 10.1, §5 | AC-18 |
| O-9 | La comparación con lo desplegado es un paso manual; se reabre si el despliegue productivo no puede seguirlo | evaluación 10.1, §5 | AC-20 |
| E-2 | La collation de la base de producción, decidida y no heredada del servidor | [notas-piloto-11.4](notas-piloto-11.4.md) | D-7, AC-6, AC-16 |
| 9.2, D-1 (c) | Copia externa automática (object storage) y cifrado del backup en reposo, registrados como requisito antes de producción | [brief-9.2](brief-9.2-backups-y-restauracion.md), D-1 y §Fuera de alcance | D-8, AC-18 |

## Hallazgos antes de diseñar (paso 5 de la planificación)

Los encontré contrastando el Roadmap con el código y con los documentos vigentes. Ninguno se resuelve en silencio: cada uno tiene una decisión abajo.

- **H-1. El backup de producción no está asignado a ninguna subfase.** El Roadmap, §Fase 13, lo pone entre los entregables de la fase («backup y restauración probados ahí»), pero la descripción de la 13.1 dice «hosting, base, TLS y secretos», y ninguna otra subfase lo nombra. La 9.2 registró la copia en object storage y el cifrado en reposo como «requisito antes de producción». **Propuesta**: tomarlo en la 13.1 (D-8), porque un entorno sin backup no está operable.
- **H-2. No hay forma de crear la primera organización fuera de un seed.**
  - Los seeds rechazan cualquier base cuyo nombre no termine en `_dev`, `_test`, `_e2e` o `_staging` ([seeds/basic.ts:50](../../seeds/basic.ts)), y eso es correcto para producción.
  - `organizations` no expone ninguna operación de alta, y `createMember` exige un `admin` ya existente.
  - Hoy, un entorno productivo recién creado no tiene cómo recibir a su primer usuario. Para verificar el ingreso y la cookie (AC-13), la 13.1 necesita un usuario. → D-9.
- **H-3. No existe ningún procedimiento de vuelta atrás de un despliegue.** El gate de salida de la Fase 13 exige «rollback». [deploy/staging/README.md](../../deploy/staging/README.md) explica cómo desplegar, pero no cómo volver a la versión anterior. Lo único parecido está en [restaurar-la-base.md](../runbooks/restaurar-la-base.md), y trata de la base, no de la aplicación. → alcance, punto 6 y AC-21.
- **H-4. [Environments.md:12](../development/Environments.md) dice «Producción: no existe todavía en el MVP», y [SecurityModel.md](../architecture/SecurityModel.md), §Gestión de secretos, describe solo staging.** Los dos se actualizan al existir el entorno (AC-22).
- **H-5. `cancel-in-progress: true` choca con la opción (a) de R-2.** [ci.yml:9-11](../../.github/workflows/ci.yml) cancela la corrida de un commit cuando llega el siguiente. Si se despliega un SHA cuya corrida quedó `cancelled`, ese SHA no tiene resultado. Con (a), el paso de despliegue tiene que exigir `success` para **ese** SHA exacto, y no alcanza con que la corrida esté «en verde en `main`» (D-4).
- **H-6. Las tres guardas de configuración de despliegue leen rutas fijas de `deploy/staging/`.** Son [staging-proxy-config](../../tests/guards/staging-proxy-config.test.ts), [staging-postgres-config](../../tests/guards/staging-postgres-config.test.ts) y [staging-backup-config](../../tests/guards/staging-backup-config.test.ts). Si se copia la configuración a un directorio de producción sin extender las guardas, la premisa de H-3 en producción queda sin detector de regresión: es el H-1 de la 9.1 repetido. → D-12.
- **H-7. La 9.2 dejó abierta una incógnita: si restaurar a un servicio gestionado exige superusuario.** La misma incógnita condiciona O-7 y O-27. Pesa en D-2.
- **H-8, menor. El recuento de guardas del HANDOFF está desactualizado.** Dice «doce al 2026-09-24», y `ls tests/guards/*.test.ts` da **13** hoy. Se recuenta al cerrar, con el comando.

## Decisiones previas (las decide el usuario al aprobar)

### D-1 — Hosting

- **(a) Un droplet de DigitalOcean propio para producción, separado del de staging.** Es la recomendación. Repite el mecanismo que ya se demostró en la 9.1 y la 9.2 (nginx, `systemd`, TLS en el servidor, un solo salto de proxy), así que O-9 sigue aceptada tal como está. Separarlo de staging cumple [SecurityModel.md](../architecture/SecurityModel.md), §«credenciales, bases y secretos completamente distintos» por entorno.
- **(b) Una plataforma gestionada.** Suma un salto de proxy de la plataforma, y con él H-3 vuelve a depender de cómo la plataforma arma `x-forwarded-for`. La 9.1 ya la descartó por licencia y costo.

**Tamaño recomendado: 2 GB de RAM como mínimo.** Staging tiene 961 MB y necesitó 2 GB de swap solo para compilar (brief-9.1, D-6). En producción el swap no debería usarse en régimen normal. **El precio se verifica en la página de DigitalOcean el día de la decisión**: no lo escribo de memoria.

### D-2 — La base

- **(a) PostgreSQL 18.6 en el mismo droplet**, como staging. Es la recomendación.
  - Resuelve O-7 como en staging: el superusuario crea `crm_app` antes de migrar, y la `0003` lo saltea por su `IF NOT EXISTS`.
  - O-27 no aplica, porque la base no es gestionada.
  - El backup es el mecanismo de la 9.2, más D-8.
- **(b) DigitalOcean Managed PostgreSQL.** Trae backups propios, pero abre O-27 (`CREATEROLE` en un servicio gestionado) y la incógnita de H-7. Además, la versión 18.6 exacta habría que verificarla. Si la elegís, la subfase agrega una etapa de verificación antes de crear la base, y **se detiene si la `0003` o la restauración exigen un privilegio que el servicio no da**.

**O-7, en los dos casos**: la migración `0003` **no se reescribe**, porque ya está aplicada en todos los entornos y cambiarla rompe su hash. El procedimiento se documenta en `deploy/production/README.md` y se ejercita en local con un dueño sin `CREATEROLE` (AC-7).

### D-3 — El nombre del host productivo

Lo elegís vos. Sugiero `crm.vixoraai.app`: queda en el mismo dominio, el TLD `.app` está precargado en HSTS (juega a favor en producción) y el registro `A` va en *DNS only*, como en la 9.1, D-4. Como ahí, el nombre vive solo en `deploy/production/`, nunca en `src/`, y la guarda `deployment-hostnames` ya lo verifica.

### D-4 — Protección de rama (R-2)

Lo verifiqué el 2026-09-29:
- La documentación de planes de GitHub incluye «Protected branches» en GitHub Pro para repositorios privados.
- **El precio de GitHub Pro sigue sin figurar en ninguna página oficial**: [github.com/pricing](https://github.com/pricing) muestra solo Free, Team y Enterprise. Una fuente de terceros dice USD 4 por mes; **no está verificado** y el precio real se ve en la configuración de facturación de tu cuenta.
- Team cuesta USD 4 por usuario por mes (los primeros 12 meses) y exige pasar el repositorio a una organización.

- **(a) Seguir sin protección**, con un paso nuevo y obligatorio en el despliegue productivo: antes de desplegar un SHA, se lee `gh run list --commit <SHA completo>` y se exige `conclusion: success` **de ese SHA exacto**. `cancelled` no vale (H-5). Es la recomendación. El riesgo que motivaba R-2, un commit en rojo con camino hasta datos reales, **solo existe al desplegar**, y ese paso lo corta justo ahí. Costo: cero.
- **(b) GitHub Pro o Team, con una regla que exija la CI en verde.** Obliga a trabajar con ramas y pull requests, cosa que el proyecto no hace hoy. También exigiría tocar `ci.yml` (el disparador de `pull_request`), que queda fuera de esta lista de archivos: si la elegís, es una ampliación que se registra.

Sea cual sea la opción, **la decisión queda escrita antes del primer despliegue** (AC-1), como exige el Roadmap.

### D-5 — Secretos (O-38)

- **(a) El mismo esquema de staging, `EnvironmentFile` de `systemd` `0600` de `root` en `/etc/crm-production/`, con secretos propios de producción**, ninguno reutilizado de staging. Es la recomendación.
  - Lo que cambia con datos reales es la amenaza del respaldo de disco sin cifrar. La recomendación es **no activar los backups ni los snapshots de droplet del proveedor** y apoyarse en el backup lógico cifrado de D-8, que no lleva secretos.
  - El límite declarado se mantiene: no protege contra quien tenga `root`.
  - La rotación de cada secreto se documenta en el README.
- **(b) Secretos cifrados y versionados con `sops`/`age`.** Suma una herramienta y una clave más que custodiar, y no cambia la protección contra `root` en ejecución.

### D-6 — Runtime (O-31)

- **Node 24 LTS**, con la versión exacta fijada y escrita en el README, dentro del `>=24 <25` de `package.json`. Es la recomendación. Node 24 es la línea con la que corren la CI y staging.
- **PostgreSQL 18.6**, la misma de la CI (`postgres:18.6-trixie`) y de staging.
- **Node 26 entra en LTS el 2026-10-28**, después de esta subfase. Migrar exige cambiar `engines` y la CI, y se hace con su propio brief, no mezclado con el primer despliegue. O-31 pide fijar la versión antes del primer despliegue, no usar la más nueva.

### D-7 — Collation (E-2)

Hoy cada entorno tiene una distinta:
- desarrollo: `en_US.utf8`, que ignora los espacios al ordenar (HANDOFF §7);
- staging: `C.UTF-8`, que ordena «Ávila» después de «Zapata» y las mayúsculas antes que las minúsculas ([evidencia-11.4](evidencia-11.4-piloto.md), §N-5).

Las opciones son:
- **(a) `C.UTF-8`, como staging.** Ordena mal en castellano.
- **(b) Una locale de glibc en castellano** (por ejemplo `es_AR.UTF-8`). Su orden depende de la versión de glibc del sistema, así que una actualización del sistema puede cambiarlo e invalidar los índices de texto.
- **(c) Una collation ICU en castellano.** Es la recomendación, **condicionada a una medición previa (AC-6)**: antes de crear la base, se mide en un contenedor local el orden real de las listas del CRM (acentos, mayúsculas, espacios y la `ñ`) con cada candidata, con la salida cruda. Recomiendo ICU porque PostgreSQL registra la versión de la collation y avisa si cambia, en vez de dejar un índice inválido sin decirlo. **Si la medición contradice la recomendación, se para y se vuelve a decidir.**

Las unicidades con `lower()` (por ejemplo el título de `knowledge_entries`) comparan por igualdad, y una collation determinística no cambia su resultado. Lo verifica el mismo AC-6.

### D-8 — Backup de producción (H-1)

Recomendación: el mecanismo de la 9.2 (`pg_dump -Fc` diario con el rol dueño, rotación y prueba de restauración con control negativo), más dos cosas que la 9.2 dejó como requisito antes de producción:
- **copia externa automática en object storage** (por ejemplo DigitalOcean Spaces);
- **cifrado del dump antes de que salga del servidor**, con una clave asimétrica: el servidor guarda solo la pública y la privada vive fuera del droplet, con vos. Así, quien tenga el bucket no puede leer el dump, y quien tenga el droplet no puede descifrar las copias viejas.

**El costo del almacenamiento se verifica el día de la decisión.** Dónde se custodia la clave privada lo decidís vos, y el runbook lo dice sin escribir la clave.

### D-9 — La primera organización y el primer usuario (H-2)

- **(a) Un script versionado, `scripts/crear-organizacion.ts`, que crea en una sola transacción una organización y su primer `admin`** con contraseña inicial de cambio obligatorio. Es la recomendación.
  - Reutiliza `prepareInitialPassword` y `createUserWithInitialPassword` de `auth`. Para el alta de la organización, agrega a `organizations` una función de repositorio y de servicio que reciba la transacción.
  - Muestra la contraseña inicial una sola vez en la terminal y nunca la escribe en el log.
  - Si el correo ya existe, falla sin dejar nada a medias.
  - En la 13.1 crea **la organización del operador** (Vixora), con tu cuenta como `admin`, para verificar el ingreso. En la 13.5, el mismo script crea la del primer cliente.
- **(b) Un seed especial para producción.** Rompe la regla de [seeds/basic.ts](../../seeds/basic.ts) de que ningún seed toca una base productiva. Lo desaconsejo.

**Dato personal que entra**: tu nombre y tu correo como operador. Son tuyos y los cargás vos. No son datos de un cliente, y no adelantan R-3 ni O-11. Queda dicho para que no aparezca después como sorpresa.

### D-10 — Etapas

- **13.1.1 — Preparación en el repositorio.** Todo lo que se valida en local y en CI:
  - `deploy/production/`;
  - las guardas extendidas;
  - el script de D-9;
  - la medición de collation;
  - el ejercicio de la `0003`;
  - el procedimiento de despliegue y de vuelta atrás;
  - la documentación.

  No toca ningún servidor.
- **13.1.2 — Aprovisionamiento y verificación.** Se crea el droplet y el DNS, se despliega y se mide cada AC de runtime desde afuera. **Cada efecto externo** (crear el droplet, el DNS, el bucket, pedir el certificado, desplegar, migrar) **se autoriza en el turno**, como exige `CLAUDE.md`. Las cuentas y los pagos los hacés vos, en tu consola.

### D-11 — Revisión independiente

El Roadmap no marca la 13.1 como subfase de gate. **Recomiendo igual una revisión independiente antes de cerrarla**, con la escala de severidad fijada abajo antes de empezar:
- la 13.1 resuelve una precondición bloqueante (H-3) en el primer entorno que va a recibir datos reales;
- la 9.1, su equivalente en staging, necesitó cuatro revisiones, y ninguna de sus rondas de correcciones propias salió limpia.

Uso la misma regla de parada que la 9.1: se cierra salvo que aparezca un hallazgo mayor, uno de mayor severidad o uno que afecte al instrumento de H-3.

### D-12 — Las guardas de despliegue (H-6)

Recomendación: **extender las tres guardas para que recorran `deploy/staging/` y `deploy/production/`**, con el mismo analizador. Además:
- una mutación ejecutada **por cada forma sintáctica** sobre los archivos de producción, con el resultado antes y después ([EngineeringStandards](../development/EngineeringStandards.md), regla de la 9.1);
- un caso que falla si aparece un directorio nuevo bajo `deploy/` sin guarda.

Los archivos pueden cambiar de nombre (`deploy-proxy-config.test.ts`, etcétera). Si cambian, el cambio se registra.

## Escala de severidad, fijada antes de empezar

Se adopta sin cambios la **D-2 del [brief-8.4](brief-8.4-revision-de-seguridad.md), con su enmienda de disponibilidad del 2026-09-18**, igual que en la 9.1:

- **Crítico (bloquea)**: cualquiera de estos casos.
  - Permite acceder a datos de otra organización o modificarlos.
  - Permite a un `viewer` hacer una operación de `admin`.
  - Expone credenciales, tokens o contraseñas.
  - Permite operar sin sesión válida algo que la exige.
  - Permite a un actor no autenticado dejar sin servicio a todos los usuarios de una organización, a costo despreciable y de forma renovable.
- **Mayor**: debilita una defensa declarada, sin abrir por sí solo un acceso indebido.
- **Menor**: documentación que no coincide con el código, sin consecuencia de seguridad.

Un hallazgo crítico detiene el trabajo y se informa de inmediato. La severidad se evalúa contra los entornos que existen; **desde esta subfase, eso incluye uno productivo**.

## Alcance incluido

1. **`deploy/production/`**: la unidad de `systemd`, nginx con TLS y un solo salto de proxy que **reemplaza** `x-forwarded-for` (brief-9.1, D-9), `-H 127.0.0.1`, la configuración de PostgreSQL, y el backup con su copia externa cifrada y su prueba de restauración.
2. **Las guardas extendidas**, según D-12.
3. **`scripts/crear-organizacion.ts`** y la operación de alta en `organizations`, con sus tests de integración, según D-9.
4. **La medición de collation** (D-7) y el ejercicio de la `0003` con un dueño sin `CREATEROLE` (D-2).
5. **El aprovisionamiento**: el droplet, el swap solo si la compilación lo exige, Node y PostgreSQL en las versiones de D-6, nginx, UFW con solo 22, 80 y 443, el certificado de Let's Encrypt y la base con la collation de D-7.
6. **El despliegue y la vuelta atrás**:
   - el procedimiento escrito en `deploy/production/README.md`, con el paso de D-4;
   - la comparación de lo versionado con lo desplegado (O-9);
   - una **vuelta atrás ejecutada una vez** a la versión anterior: se despliega un ref, se despliega el siguiente y se vuelve al primero, midiendo el tiempo y el estado final.
7. **La verificación en el entorno productivo** de cada AC de runtime, con su salida cruda en `evidencia-13.1-produccion.md`.
8. **La documentación**: Environments, SecurityModel, Risks, el runbook de restauración (O-3) y el cierre en Roadmap, CHANGELOG y HANDOFF.

## Alcance excluido

- **Cualquier dato real de un cliente**: clientes, conversaciones, mensajes, productos, información del negocio. Son de la 13.5, después de la 13.4.
- **Encender la ingestión o la API de lectura en producción**, o crear credenciales de servicio ahí. Son de la 13.5.
- **Conectar el agente de WhatsApp a producción.**
- **La medición externa de disponibilidad, alertas, APM**: son de la 13.3.
- **Mediciones de rendimiento y planes con volumen**: son de la 13.2. En producción no se carga el seed de volumen.
- **Tocar staging**, salvo leerlo para comparar.
- **Automatizar el despliegue** o introducir contenedores.
- **Migrar a Node 26** (D-6).
- **Cambiar `ci.yml`**, salvo que elijas D-4 (b) y amplíes la lista.
- **Airtable, ERP y el repositorio del agente**, como en toda fase.

## Archivos o componentes autorizados

- `deploy/production/` (nuevo): `README.md`, unidad de `systemd` de la aplicación, configuración de nginx, configuración de PostgreSQL, y el script, las unidades y los timers del backup y de la prueba de restauración.
- `tests/guards/staging-proxy-config.test.ts`, `staging-postgres-config.test.ts` y `staging-backup-config.test.ts`, con el renombre que registre D-12.
- `scripts/crear-organizacion.ts` (nuevo) y `package.json`, **solo** para agregar su entrada en `scripts`.
- `src/modules/organizations/repository.ts`, `service.ts` e `index.ts`, **solo** para la operación de alta de D-9.
- `tests/integration/` (un archivo nuevo para el script y el alta).
- `.env.example`.
- Documentación: [Environments.md](../development/Environments.md), [SecurityModel.md](../architecture/SecurityModel.md), [Risks.md](../planning/Risks.md), [EngineeringStandards.md](../development/EngineeringStandards.md) (recuento de guardas), [restaurar-la-base.md](../runbooks/restaurar-la-base.md), [Roadmap.md](../planning/Roadmap.md), este brief, `evidencia-13.1-produccion.md` (nuevo), [decisions/README.md](README.md), `CHANGELOG.md` y `HANDOFF.md`.

Tocar cualquier otro archivo es un hallazgo bloqueante, salvo ampliación autorizada y registrada.

## Fuentes de verdad

1. El código, las migraciones y `deploy/staging/`: el mecanismo que ya funciona.
2. [SecurityModel.md](../architecture/SecurityModel.md), [DataModel.md](../architecture/DataModel.md) y el [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) (rol de aplicación).
3. [Roadmap](../planning/Roadmap.md), §Fase 13, y la [evaluación 10.1](evaluacion-10.1-mvp.md), §4 y §5.
4. [brief-9.1](brief-9.1-infraestructura-de-staging.md), [brief-9.2](brief-9.2-backups-y-restauracion.md) y sus evidencias: cómo se verificó cada pieza la primera vez y qué quedó sin capturar.

## Dependencias

- Fase 12 cerrada (lo está desde el 2026-09-29).
- Para la 13.1.2: la decisión de D-4 escrita; el droplet, el DNS y el bucket creados por vos; y la etapa 13.1.1 con su CI en `success`.

## Invariantes

- **Ningún dato real de un cliente entra a la base productiva.** El único dato personal es el del operador (D-9).
- **La ingestión y la API de lectura quedan apagadas** en producción (`404` desde afuera), y no se crea ninguna credencial de servicio.
- **La aplicación se conecta con un rol con login, miembro de `crm_app`**, nunca con el dueño (ADR 0013, punto 5).
- **Ningún secreto en el repositorio ni en la CI**, y ninguno compartido con staging.
- **El hostname productivo no aparece en `src/`.**
- **Ningún seed corre contra la base productiva.**
- **Staging no cambia.**
- **Nada se despliega sin `conclusion: success` del SHA exacto** (si D-4 queda en (a)).

## Criterios de aceptación

**Antes del primer despliegue**

- **AC-1.** La decisión de protección de rama (R-2) está escrita en este brief con su fecha, antes de cualquier despliegue productivo.

**Etapa 13.1.1 (local y CI)**

- **AC-2.** `deploy/production/` existe y sus diferencias con `deploy/staging/` son solo las que justifican D-1 a D-8. El README las enumera una por una.
- **AC-3.** Las guardas de D-12 cubren los dos directorios. Hay una mutación ejecutada por forma sintáctica sobre los archivos de producción, con el resultado antes y después, y el caso del directorio sin guarda falla cuando debe.
- **AC-4.** `crear-organizacion.ts` crea la organización y su `admin` en una sola transacción, con cambio de contraseña obligatorio. Un segundo intento con el mismo correo termina en `CONFLICT` sin dejar una organización huérfana. La contraseña no aparece en el log. Hay tests de integración contra PostgreSQL real.
- **AC-5.** Un seed ejecutado contra una base con el nombre productivo se rechaza. Se verifica por efecto, no por lectura del patrón.
- **AC-6.** La medición de collation de D-7 existe con su salida cruda (orden de las listas y unicidades con `lower()`), y la collation elegida está escrita con su motivo.
- **AC-7.** El procedimiento de O-7 está escrito y se ejercitó en local con un dueño sin `CREATEROLE`: primero la falla, después el procedimiento que la resuelve y las migraciones completas.
- **AC-8.** La suite completa pasa en local, y la CI del commit de la etapa tiene `conclusion: success`, leída por `headSha`.

**Etapa 13.1.2 (entorno productivo, verificado desde afuera)**

- **AC-9.** `https://<host>/login` responde `200` con la aplicación real, y `POST /api/ingestion/v1/events`, la ruta v2 y `GET /api/read/v1/products` responden `404`.
- **AC-10.** El certificado es válido para el host, y `curl` sin `-k` no protesta.
- **AC-11 (O-4).** La salida de `certbot renew --dry-run` y la de `systemctl list-timers` para la renovación están capturadas enteras.
- **AC-12.** HSTS con `max-age` en la respuesta HTTPS cruda, y sin HSTS en el `301` de HTTP.
- **AC-13 (O-6).** El `Set-Cookie` crudo de un ingreso real está capturado de la cabecera de la respuesta (con `curl` o con la API de respuestas de Playwright) y dice: `__Host-crm_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` y sin `Domain`.
- **AC-14 (O-29, H-3).** Se demuestran tres cosas:
  - dos IP distintas producen claves de límite distintas;
  - un `x-forwarded-for` falsificado no cambia la IP que ve la aplicación;
  - 20 fallos desde una IP no bloquean el ingreso desde otra.

  Los fallos se reparten entre correos, para no disparar el límite por cuenta (lección de la 9.1, AC-6).
- **AC-15.** La conexión de la aplicación recibe `permission denied` al intentar un `DELETE` sobre `audit_logs`.
- **AC-16 (O-31, E-2).** Salida cruda de: las versiones de Node y de PostgreSQL, y la collation de la base (`\l`), que coincide con la de D-7.
- **AC-17.** El servicio sobrevive a un `reboot` real y vuelve sin intervención.
- **AC-18 (O-3, D-8).** El timer ejecuta el backup, y la copia cifrada existe en el object storage. Además:
  - una restauración a una base aislada, descifrando con la clave que está fuera del droplet, verifica el contenido, y el control negativo falla contra un dump truncado;
  - el runbook dice quién queda como dueño de la base después de restaurar.
- **AC-19 (O-38).** Ningún secreto productivo está en el repositorio ni en la CI. `ls -l /etc/crm-production/` muestra `0600` de `root`. Ningún secreto coincide con uno de staging: se comparan los hashes, sin imprimir los valores.
- **AC-20 (O-9).** Se ejecutó el paso de comparación entre lo versionado y lo desplegado, con su salida.
- **AC-21 (H-3).** Se ejecutó una vuelta atrás a la versión anterior, con el tiempo que tardó y la aplicación sana al final.
- **AC-22.** La base productiva tiene 0 clientes, 0 conversaciones, 0 mensajes y 0 productos, y una sola organización, la del operador. Environments y SecurityModel ya no contradicen el entorno.

**Cierre**

- **AC-23.** Hubo revisión independiente según D-11, con sus hallazgos verificados contra el código y resueltos o aceptados por vos.

## Pruebas y evidencia requerida

- **13.1.1**: `deterministic`. Tests unitarios, de integración y de guardas contra PostgreSQL real, más la CI.
- **13.1.2**: `isolated-runtime`. Salidas crudas con su comando y su fecha en `evidencia-13.1-produccion.md`. Todo bloque que no sea literal se marca `[transcrito]` (regla de la 9.1, N-8).
- **Lo que no certifica**: carga, disponibilidad ni latencia (13.2 y 13.3); que el sistema esté preparado para producción (gate de la fase); ni que esta autoevaluación sea correcta, que para eso está D-11.

## Condiciones de detención

Se para y se consulta, sin buscar una salida alternativa:

1. **Antes de cada efecto externo**: crear el droplet, el DNS, el bucket o el certificado, desplegar o migrar. Cada uno se autoriza en el turno.
2. **Si la medición de collation contradice D-7.**
3. **Si la `0003` o la restauración exigen un privilegio** que el entorno elegido no da (D-2, H-7).
4. **Si Let's Encrypt no emite el certificado después de dos intentos.**
5. **Si falla cualquiera de las tres mediciones de AC-14**, en especial la de la cabecera falsificada.
6. **Si `next build` muere por memoria** en el tamaño elegido.
7. **Si aparece cualquier dato real de un cliente**, o si algún paso exige cargarlo.
8. **Si cumplir un AC exige tocar lógica de negocio** más allá del alta de D-9, `ci.yml` o un archivo fuera de la lista.
9. **Si el costo mensual supera lo que aprobaste.**
10. **Antes de cada commit y cada push.**

## Decisiones durante la implementación (13.1.1)

Las tomé yo al implementar. Las tres primeras necesitaban la confirmación del usuario, porque el brief no las fijaba; **el usuario las confirmó el 2026-09-29**.

- **I-1. Quién queda como actor en la auditoría del alta de D-9.** `audit_logs` exige exactamente un actor, y al crear la organización no existe ningún usuario más que el admin recién creado. La auditoría del alta del miembro lleva como actor **al propio admin**. La alternativa era no auditar, como el script de borrado de datos de un cliente (que lo declara como limitación). Preferí dejar un rastro en la base. *Confirmada.*
- **I-2. En producción, la aplicación corre con un usuario de sistema propio (`crm`), sin shell ni `sudo`.** En staging corre como `benja`, el usuario del `ssh`, que tiene `sudo`. Con datos reales, un proceso comprometido no debería heredar un camino a `root`. Es una diferencia con staging que el brief no nombraba. Está registrada en [deploy/production/README.md](../../deploy/production/README.md), diferencia 2, y la fija la guarda del proxy. *Confirmada.*
- **I-3. La copia externa corre en una unidad aparte**, disparada por `OnSuccess=` del backup. El backup queda sin red y la subida sin acceso a la base. D-8 no decía cómo repartirlo. *Confirmada.*
- **I-4. Los archivos de las guardas conservan su nombre `staging-*.test.ts`.** D-12 permitía renombrarlos, y no lo hice: el HANDOFF, EngineeringStandards y los dos README los citan por ese nombre, y cambiarlo tocaba archivos solo para eso.
- **I-5. La RAM de producción en la guarda de PostgreSQL es provisional (2048 MB)**, igual que `effective_cache_size = 1GB`. Los dos se reemplazan en la 13.1.2 con `free -m` medido en el droplet.

## Resultados — etapa 13.1.1, 2026-09-29

Las salidas crudas están en [evidencia-13.1-produccion.md](evidencia-13.1-produccion.md). **Autoevaluación**: lo midió el mismo agente que lo implementó.

| AC | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | D-4 (a) escrita en el estado del brief, con fecha, antes de cualquier despliegue |
| AC-2 | cumplido | `deploy/production/`, 11 archivos más el README. Las diferencias con staging están enumeradas en el README, entre ellas I-2, confirmada |
| AC-3 | cumplido | Las tres guardas recorren los dos directorios, más el caso del directorio sin guarda. 17 mutaciones sobre los archivos reales de producción, las 17 en rojo, con el antes y el después |
| AC-4 | cumplido | 6 de 6 tests de integración, con una mutación que pone en rojo el caso de la organización huérfana. Probado también en la base de ensayo con el rol de aplicación |
| AC-5 | cumplido | Por efecto: cinco seeds contra una base `crm_production` real (test) y `db:seed` contra la base de ensayo. La mutación que demuestra que el caso puede fallar se ejecutó con autorización del usuario, y el test falló como se esperaba (ver la evidencia) |
| AC-6 | cumplido | Medición con salida cruda: `es-x-icu` es la única candidata que ordena como en castellano. D-7 confirmada |
| AC-7 | cumplido | Ensayo en un contenedor descartable: la falla (`42501`, cero tablas), el procedimiento y las 25 migraciones aplicadas con un dueño sin `CREATEROLE` |
| AC-8 | cumplido en local; **CI pendiente** | Local, 2026-09-29: lint, typecheck y formato en verde; Vitest 1494 de 1494 (100 archivos); build y 100 de 100 end-to-end. La CI se lee por `headSha` cuando haya commit, que espera autorización |

**Hallazgo al pasar, corregido**: la lista de guardas de EngineeringStandards no nombraba la de lecturas de servicio de la 11.3, y decía «doce» con trece en la carpeta. Es la tercera vez del defecto H-4 de la 8.4. Es el H-8 de este brief, que había detectado el número pero no la guarda que faltaba.
