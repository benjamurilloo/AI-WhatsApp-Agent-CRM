---
schema: task-brief.v1
task_id: 8.2
task_type: audit
generated_at: 2026-09-18
---

# Brief: 8.2 — Logs y privacidad

## Objetivo

Demostrar con evidencia ejecutable que los logs de la aplicación no contienen datos personales ni contenido de conversaciones, y producir el procedimiento de exportación y eliminación de los datos de un cliente que [NonFunctionalRequirements](../product/NonFunctionalRequirements.md) §Privacidad exige, **incluida la declaración escrita de qué no se puede eliminar hoy y por qué**.

La subfase tiene dos mitades de naturaleza distinta y no conviene fundirlas: la primera es una verificación con tests (`deterministic`), la segunda es un diseño con un procedimiento ejecutable y su límite declarado. Cada una lleva su propio nivel de evidencia.

## Ubicación en la Fase 8

- **Orden previsto**: 8.1 → **8.2** → 8.4, con la 8.3 en paralelo y la 8.5 sin orden fijado.
- **Notion**: tarea "8.2 — Logs y privacidad", descripción "S. Logs sin PII, verificado con un test, y procedimiento de exportación y eliminación de datos de un cliente". Estado "Bandeja de Entrada" y prioridad media al escribir este brief (verificado el 2026-09-18).
- **Necesario ahora**: la evidencia de logs sin PII, la guarda que impide que un cambio futuro la rompa, y el procedimiento con su límite escrito.
- **Requisito antes de producción**, fuera de esta subfase: la política de retención de mensajes y conversaciones (Fase 9, pendiente de definición de negocio), y el borrado efectivo de lo que hoy es inmutable, si el negocio lo exige.
- **Mejora posterior**: exportación autoservicio desde la UI, borrado programado, anonimización automática por retención.
- **Gates de entrada**:
  1. 8.1 cerrada, con CI en verde en `a5518ad` ([ejecución 35356670129](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35356670129)) y el cierre `df4b9e6` también en verde ([ejecución 35359767642](https://github.com/benjamurilloo/AI-WhatsApp-Agent-CRM/actions/runs/35359767642)). Verificado el 2026-09-18: `main` limpio en `df4b9e6`.
  2. Contenedor de PostgreSQL en marcha.

## Hallazgos de la verificación previa (2026-09-18)

### Sobre los logs

1. **El log ya funciona por lista blanca, no por filtrado.** [`src/shared/log/index.ts`](../../src/shared/log/index.ts) construye el JSON campo por campo desde `LogEvent`: nivel, `request_id`, `route`, `code`, `user_id`, `organization_id`, `source`, `duration_ms` y un `error` reducido a `name` y `code`. Un campo que no esté en esa lista no puede salir aunque llegue en ejecución, y hay un test que lo prueba (`log.test.ts`, 9 casos). Es una base fuerte: la 8.2 no rediseña nada acá.
2. **Las 23 llamadas a `logEvent` pasan un `route` literal constante** (`"login"`, `"clientes.crear"`, `"conversaciones.mensajes_anteriores"`, `"/"`, …). Ninguna arma el `route` con una URL, un id de entidad ni una query. Es lo que hace que el buscador de clientes por teléfono no llegue al log: las páginas de lectura no registran nada, y las Server Actions registran solo ruta y código.
3. **Hay dos rutas de log que no pasan por `logEvent`**: [`src/shared/db/client.ts:19`](../../src/shared/db/client.ts) y [`src/shared/db/health.ts:23`](../../src/shared/db/health.ts), ambas con `console.error` y texto plano. **Hoy son correctas**: las dos reducen el error a `code ?? name` a propósito, con su comentario explicando que el mensaje del driver puede traer host, usuario o contraseña — precisamente el defecto que se encontró y se corrigió en la 2.4. Pero son un camino sin guarda: nada impide que un cambio futuro interpole `error.message`. Se resuelve en D-1.
4. **Ningún otro `console.*` existe en `src/`.** La superficie de log es exactamente esa: `logEvent` y esos dos.
5. **Lo que el proceso escribe no es solo lo que escribe la aplicación.** `next start` puede registrar peticiones por su cuenta, y una URL como `/clientes?q=%2B5491155550001` lleva un teléfono en la query. La lista blanca del módulo de log no controla eso. **No está verificado en ningún sentido** —ni que lo haga ni que no— y una afirmación "los logs no tienen PII" que solo mire `logEvent` no cubre el proceso. Se resuelve en D-1.

### Sobre la eliminación de datos de un cliente

6. **Un cliente con conversaciones no se puede borrar hoy, con ningún rol.** La cadena es cerrada y está verificada en el esquema y en la migración 0012:
   - `messages` tiene un trigger `BEFORE UPDATE OR DELETE` que rechaza las dos operaciones para cualquier rol, y `crm_app` solo tiene `SELECT, INSERT`;
   - `messages` → `conversations` es `ON DELETE RESTRICT`, así que sin borrar los mensajes no se borra la conversación;
   - `conversations` → `clients` también es `ON DELETE RESTRICT`.

   Es decir: mientras exista un solo mensaje, ni el mensaje, ni su conversación, ni el cliente se pueden borrar. **Tampoco se pueden anonimizar**, porque el mismo trigger rechaza `UPDATE`. Solo `TRUNCATE` saltea los triggers de fila, y es todo o nada: no sirve para un cliente.
7. **Un cliente sin conversaciones sí se puede borrar**: `crm_app` tiene `DELETE` sobre `clients` (migración 0009). Los dos casos son muy distintos y el procedimiento tiene que tratarlos por separado.
8. **`audit_logs` guarda el teléfono y las notas del cliente en su `diff` jsonb**, y es de solo inserción con trigger y sin `DELETE` para `crm_app`. Es el bloqueo que la 5.2 (D-6) ya había registrado y que [Risks](../planning/Risks.md) derivó a esta fase.
9. **`ingestion_events` no guarda datos personales.** Tiene `source`, `external_ref`, `event_type`, `payload_hash`, `error_code` y fechas: ni cuerpo ni teléfono. Además `external_ref` está obligado a ser opaco por el validador del contrato (`isOpaqueReference`, 6.5.1). Es el único registro inmutable que **no** complica la eliminación, y conviene decirlo explícitamente en el procedimiento para que nadie lo suponga al revés.
10. **La superficie de datos personales de un cliente es acotada**: `clients.display_name`, `clients.phone_e164` y `clients.notes`; `messages.body_text`; y el `diff` de `audit_logs`. Nada más. Eso hace que la exportación sea sencilla de definir con precisión.

### Discrepancia documental

11. **La NFR dice "exportar o eliminar"; Notion dice "exportación y eliminación".** [NonFunctionalRequirements](../product/NonFunctionalRequirements.md) §Privacidad pide "un mecanismo (aunque sea manual en el MVP) para exportar **o** eliminar los datos de un cliente a pedido"; la tarea de Notion pide las dos. Este brief toma la lectura exigente —las dos— porque la exportación sola no satisface un pedido de borrado, y porque el hallazgo 6 obliga a decir por escrito qué pasa con el borrado. Si el usuario prefiere la lectura mínima, lo dice y el alcance se recorta.

## Alcance incluido

1. Evidencia ejecutable de que los logs no contienen datos personales ni contenido de conversaciones, con el alcance y las capas que fije D-1.
2. Una guarda versionada que impida que un cambio futuro agregue una ruta de log fuera de la lista blanca, con su caso que demuestra que falla (D-1).
3. El procedimiento de **exportación** de los datos de un cliente, con la forma que fije D-2.
4. El procedimiento de **eliminación**, con el alcance que fije D-3, y la declaración escrita de qué no se elimina, por qué, y qué haría falta para cambiarlo.
5. Actualización de [SecurityModel.md](../architecture/SecurityModel.md) §"Política de logs" y §"Retención de datos", de [NonFunctionalRequirements](../product/NonFunctionalRequirements.md) §Privacidad si el alcance real difiere de lo que promete, y de [Risks](../planning/Risks.md) para cerrar o reformular la entrada de la 5.2 (D-6).

## Alcance excluido

- **Cambiar los triggers de solo inserción o el ADR 0013** para permitir el borrado. Si D-3 concluye que hace falta, es una subfase propia con su brief: toca una invariante del modelo de datos.
- **La política de retención de mensajes y conversaciones**: pendiente de definición de negocio, Fase 9.
- **UI de exportación o de borrado**, y cualquier pantalla nueva.
- **Rediseñar el módulo de log**: la lista blanca ya es correcta (hallazgo 1).
- **Auditoría de dependencias** (8.3), **revisión de seguridad ítem por ítem** (8.4) y **rendimiento** (8.5).
- **Dependencias nuevas.**
- **Tocar el endpoint de ingestión** o su contrato.

## Archivos o componentes autorizados

Lista cerrada.

**Siempre:**

- `docs/architecture/SecurityModel.md`
- `docs/planning/Risks.md`
- `docs/decisions/brief-8.2-logs-y-privacidad.md` — este archivo.

**Solo si la decisión indicada lo habilita:**

- `tests/guards/log-surface.test.ts` — nuevo, la guarda de D-1.
- `src/shared/log/log.test.ts` — solo para sumar casos, nunca para relajar los existentes.
- `tests/integration/log-privacy.test.ts` — nuevo, si D-1 elige la capa de integración.
- `docs/runbooks/` — nuevo directorio, si D-2 elige que el procedimiento viva ahí; en ese caso también `docs/architecture/RepositoryStructure.md`, que no lo contempla.
- `scripts/client-data-export.ts` y/o `scripts/client-data-delete.ts` — nuevos, solo si D-2 elige un script.
- `docs/product/NonFunctionalRequirements.md` — solo para alinear la promesa con lo alcanzable (hallazgo 11 y D-3).

**Con autorización explícita del usuario en el turno, al cerrar:**

- `docs/decisions/README.md` y `CHANGELOG.md`.

## Fuentes de verdad

1. El código, las migraciones y los triggers de este repositorio.
2. [product/NonFunctionalRequirements.md](../product/NonFunctionalRequirements.md) §Privacidad y [architecture/SecurityModel.md](../architecture/SecurityModel.md) §"Política de logs" y §"Retención de datos".
3. [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md) y [brief-5.2](brief-5.2-servicio-de-clientes.md), D-6.
4. [brief-3.5](brief-3.5-pantalla-de-inicio-de-sesion.md), D-9 (diseño del log) y [brief-6.5.1](brief-6.5.1-contrato-de-ingestion.md) (opacidad de `external_ref`).
5. [CLAUDE.md](../../CLAUDE.md): vocabulario de validación y prohibición de módulos especulativos.

## Dependencias

- 8.1 cerrada (gate verificado). Nada de esta subfase depende de la 8.3, la 8.4 ni la 8.5.
- PostgreSQL local levantado para la capa de integración, si D-1 la incluye.

## Resolución (2026-09-18)

El usuario leyó el brief y **aprobó las cuatro decisiones según la recomendación**: D-1 con las tres capas más la comprobación del proceso; D-2 con documento y scripts; D-3 con la minimización de los campos personales de `clients` y la declaración escrita de lo retenido, nombrada como minimización y no como eliminación; D-4 con los cuatro orígenes y `ingestion_events` excluido con su razón.

Con eso queda tomada también la lectura exigente del hallazgo 11: se entregan exportación **y** eliminación.

Las condiciones de detención siguen vigentes tal como están escritas.

## Decisiones pendientes

Resueltas arriba. Se conservan con su texto original porque la revisión contrasta contra ellas.

### D-1 — Qué evidencia respalda "los logs no tienen PII", y hasta dónde llega

Hoy la afirmación descansa en un test unitario que construye eventos a mano. Eso prueba el formateador, no el sistema. Tres capas posibles, acumulativas:

- **(a) Unitaria ampliada**: más casos en `log.test.ts` con teléfono, nombre, notas y cuerpo de mensaje entre los campos que llegan de más. Barata; sigue sin salir del formateador.
- **(b) Guarda de superficie**: un test versionado que recorre `src/` y falla si aparece un `console.*` fuera de `src/shared/log/` y de las dos excepciones declaradas de `src/shared/db/`, o si una llamada a `logEvent` arma `route` con algo que no sea un literal. Con su caso que demuestra que falla, como las otras guardas del proyecto.
- **(c) Integración con datos reales**: ejercitar un camino que de verdad transporta datos personales —el endpoint de ingestión, que recibe teléfono y cuerpo del mensaje— capturando la salida de consola y afirmando que ninguno de esos valores aparece en ninguna línea.

Aparte está el hallazgo 5: **qué escribe el proceso además de la aplicación**. Verificarlo es mirar la salida real de `next start` durante un recorrido que incluya una búsqueda por teléfono, y ver si la URL con la query aparece. Es una comprobación, no un test permanente.

**Recomendación: (a) + (b) + (c), más la comprobación del hallazgo 5 registrada como medición.** La (c) es la que convierte la afirmación en evidencia real, y la (b) es la que impide que se degrade en silencio. Si la comprobación encuentra que `next start` registra las URLs con query, eso **no** se arregla en esta subfase: se registra como hallazgo con su recomendación y se eleva, porque tocarlo puede significar configurar el servidor o el despliegue.

Pendiente de resolución del usuario.

### D-2 — Qué forma tiene el procedimiento

- **(a) Solo documento**: un runbook en `docs/` con las consultas SQL a ejecutar a mano. Cumple la NFR, que admite un procedimiento manual.
- **(b) Documento más scripts** en `scripts/`, corridos con `tsx`, como `ingestion-credential.ts`: el de exportación arma un JSON con todo lo del cliente, el de eliminación ejecuta lo que D-3 permita.
- **(c) Caso de uso en un módulo**, con su interfaz pública y sus tests.

**Recomendación: (b)**, con el documento como fuente y los scripts como herramienta. La (a) deja el trabajo librado a escribir SQL a mano en producción, que es donde no conviene equivocarse; la (c) mete en el dominio un caso de uso que nadie invoca desde la aplicación, y [CLAUDE.md](../../CLAUDE.md) prohíbe los módulos especulativos. El script de exportación necesita tests; el de eliminación, más todavía.

Pendiente de confirmación.

### D-3 — Qué significa "eliminar" dado el hallazgo 6

Es la decisión central y no tiene una respuesta cómoda. Un cliente con conversaciones es hoy indeleble e inanonimizable. Opciones:

- **(a) Eliminar lo eliminable y declarar el resto.** Se borra el cliente sin conversaciones; con conversaciones, se documenta que no se puede y qué queda retenido (`messages.body_text`, el `diff` de `audit_logs`). La promesa de la NFR se ajusta a lo que el sistema hace.
- **(b) Vaciar los campos personales de `clients` sin borrar la fila** (`phone_e164` y `notes` a nulo, `display_name` a un marcador), conservando conversaciones y mensajes. `clients` admite `UPDATE`, así que esto sí es posible hoy. No toca `messages` ni `audit_logs`.
- **(c) Cambiar los triggers** para admitir un borrado controlado. Queda **fuera del alcance** de esta subfase por diseño: toca el ADR 0013.

**Recomendación: (b) como mecanismo, (a) como declaración.** Es decir: el procedimiento de eliminación minimiza lo que puede —los campos personales del cliente, que son los que identifican a la persona— y el documento declara con precisión qué se retiene, dónde y por qué, más qué haría falta para borrarlo de verdad. Vaciar `clients.phone_e164` desvincula el registro de la persona aunque los mensajes queden; sin el teléfono ni el nombre, el resto es texto sin titular identificable dentro del sistema.

**Esto es una minimización, no una eliminación, y así hay que escribirlo.** Si el negocio necesita borrado real, la conclusión de esta subfase es que hace falta una subfase que revise el ADR 0013, y eso es una decisión del usuario, no del implementador.

Pendiente de resolución del usuario.

### D-4 — Qué incluye exactamente la exportación

Candidatos, todos los del hallazgo 10: la fila de `clients`; sus conversaciones; sus mensajes con `body_text`; y las entradas de `audit_logs` sobre ese cliente, que incluyen el `diff` con valores anteriores de teléfono y notas.

**Recomendación**: incluir los cuatro, en un JSON con una sección por origen y una cabecera con la fecha, la organización y el id del cliente. Incluir la auditoría es lo correcto: son datos del cliente y el pedido de acceso los abarca. **No** incluir `ingestion_events`, porque no tiene datos personales (hallazgo 9), pero decirlo en el documento.

Pendiente de confirmación.

## Invariantes

1. **No se tocan los triggers de solo inserción ni el ADR 0013.**
2. **No se relaja ningún test ni guarda existente.** Si uno estorba, es un hallazgo.
3. **Ningún script de eliminación borra sin confirmación explícita** y sin decir antes qué va a borrar y qué no.
4. **El procedimiento nunca escribe datos personales en un log**, ni siquiera al registrar que se ejecutó: identificadores solamente.
5. **Un export se escribe donde el operador indique**, nunca en el repositorio ni en un directorio versionado.
6. **Sin dependencias nuevas.**
7. **Nada corre contra una base real sin autorización explícita en el turno.**

## Criterios de aceptación

- **AC-1** — La afirmación "los logs no contienen datos personales ni contenido de conversaciones" tiene evidencia de las capas que fijó D-1, y cada capa declara su nivel; ninguna se presenta como superior al que alcanzó.
- **AC-2** — Existe una guarda versionada que falla si aparece una ruta de log fuera de la lista blanca, con al menos un caso que demuestra que falla.
- **AC-3** — Un camino que transporta datos personales reales se ejercita y ninguna línea de log contiene el teléfono, el nombre ni el cuerpo del mensaje usados.
- **AC-4** — La comprobación del hallazgo 5 está hecha y su resultado registrado, diga lo que diga: si el proceso registra URLs con query, queda como hallazgo elevado, no corregido a escondidas.
- **AC-5** — El procedimiento de exportación existe con la forma de D-2, produce lo que fijó D-4, y se ejercitó al menos una vez contra datos sintéticos.
- **AC-6** — El procedimiento de eliminación existe, hace lo que fijó D-3, y **declara por escrito y con precisión qué datos quedan retenidos, en qué tabla, por qué y qué haría falta para borrarlos.**
- **AC-7** — Un cliente con conversaciones y uno sin conversaciones están tratados por separado y probados por separado: son casos distintos (hallazgos 6 y 7).
- **AC-8** — [SecurityModel.md](../architecture/SecurityModel.md), [Risks](../planning/Risks.md) y, si corresponde, [NonFunctionalRequirements](../product/NonFunctionalRequirements.md) quedan alineados con lo que el sistema realmente hace. La entrada de Risks de la 5.2 (D-6) queda cerrada o reformulada con su nuevo plan, no simplemente borrada.
- **AC-9** — Corrida de mutación sobre la guarda y sobre el test de integración de D-1: cada una falla cuando debe.
- **AC-10** — La suite completa sigue pasando, sin modificar tests existentes.

## Pruebas y evidencia requerida

| Afirmación | Nivel | Dónde |
|---|---|---|
| El formateador nunca emite un campo fuera de la lista | `deterministic` | `src/shared/log/log.test.ts` |
| No hay rutas de log fuera de la lista blanca | `deterministic` | la guarda de AC-2, con su caso que falla |
| Un camino con datos personales reales no los registra | `deterministic` | el test de integración de D-1, con mutación |
| Qué registra el proceso además de la aplicación | medición | recorrido manual sobre `next start`, con su resultado en el brief |
| La exportación produce lo esperado | `deterministic` | ejercicio contra datos sintéticos |
| La eliminación hace lo que dice y nada más | `deterministic` | los dos casos de AC-7 |

**Nivel del proyecto alcanzable**: *validado localmente y en CI* para los logs y para los procedimientos. **No** se alcanza *validado en staging* ni *preparado para producción*: un procedimiento de borrado no está probado de verdad hasta ejecutarse en un entorno con datos reales y backups, que es Fase 9.

## Condiciones de detención

1. **D-1, D-2 y D-3 sin resolver**: no se escribe código. D-3 es la crítica: sin ella no se sabe qué debe hacer el procedimiento.
2. **Si la comprobación del hallazgo 5 encuentra PII en la salida del proceso**: se registra y se eleva, no se corrige acá; la corrección puede tocar configuración de servidor o de despliegue.
3. **Si cumplir la NFR exigiera tocar un trigger, el ADR 0013 o el esquema**: parar. Es otra subfase.
4. **Antes de ejecutar cualquier procedimiento de eliminación contra una base que no sea la de test**, incluida la de desarrollo.
5. **Antes de cualquier commit, push o cambio en Notion**, y antes de tocar `docs/decisions/README.md` o `CHANGELOG.md`.
6. **Si aparece un hallazgo de privacidad fuera de este alcance**: se registra y se eleva.

## Ejecución (2026-09-18)

### Lo que se implementó

**Mitad de logs**, las tres capas de D-1:

- **Unitaria**: `src/shared/log/log.test.ts` suma dos casos. Uno pasa teléfono, nombre, notas y cuerpo de mensaje como campos de más y comprueba que no salen, además de que sí salen los identificadores. El otro registra un error de unicidad de PostgreSQL cuyo mensaje contiene el teléfono —el caso realista, porque el teléfono es único por organización— y comprueba que la línea queda en `{ name, code }`.
- **Guarda**: `tests/guards/log-surface.test.ts`, nueva. Dos reglas: en `src/`, solo el módulo de log usa `console.*`, con las dos excepciones de `src/shared/db/` declaradas por nombre; y ningún `route` se arma interpolando ni concatenando. La guarda también comprueba que las dos excepciones siguen existiendo y siguen usando `console.*`: si una deja de hacerlo, la lista miente y alguien tiene que mirarla.
- **Integración**: `tests/integration/log-privacy.test.ts`, nueva, contra PostgreSQL real.

**Mitad de privacidad**, D-2 a D-4:

- `docs/runbooks/datos-de-un-cliente.md`, nuevo, que es la fuente del procedimiento.
- `scripts/client-data-export.ts` y `scripts/client-data-delete.ts`, nuevos, con sus funciones exportadas para poder probarlas.
- `tests/integration/client-data.test.ts`, nuevo, 10 casos.
- `SecurityModel.md`, `NonFunctionalRequirements.md`, `Risks.md` y `RepositoryStructure.md` actualizados.

### La capa (c) ya existía para ingestión, y no se duplicó

D-1 (c) pedía ejercitar "un camino que de verdad transporta datos personales — el endpoint de ingestión". **Ese test ya existe**: el caso 12 de `tests/integration/ingestion-http.test.ts` (6.5.3) manda eventos reales con teléfono y cuerpo y afirma que no aparecen en el log, junto con el token. Repetirlo habría sido escribir por tercera vez la misma evidencia.

Lo que **no** estaba cubierto era el camino de la UI, que es donde una persona escribe los datos del cliente. Ahí fue el test nuevo, con tres casos que fallan por razones distintas: el dominio no escribe nada en consola ni al crear ni al rechazar; la línea que registra la acción —con el mismo `logEvent` y la misma forma que `logDone` de `clientes/actions.ts`— no lleva datos personales en ninguno de los tres rechazos; y un error inesperado que sí trae el teléfono en su mensaje se registra sin él. El tercero comprueba antes que el error realmente traía el teléfono: si no, no probaría nada.

### La medición del hallazgo 5 encontró algo, en el modo que no esperaba

Se levantaron los dos modos y se pidió `/clientes?q=%2B5491155550123`, con el teléfono en la query:

| Modo | Registra la petición | Consecuencia |
|---|---|---|
| `next start` | **No.** Solo líneas de arranque. | Un entorno desplegado no deja la URL en ningún log. La afirmación de la 8.2 se sostiene. |
| `next dev` | **Sí, con la query completa**: `GET /clientes?q=%2B5491155550123 307 in 200ms` | La terminal de una máquina de desarrollo puede terminar con el teléfono que alguien buscó. |

Es decir: el riesgo existe, pero en el modo local, no en el desplegado. Siguiendo la condición de detención 2 **no se corrigió acá**: quedó registrado en `SecurityModel.md` y en `Risks.md`, con la nota de que no hay acción mientras el desarrollo sea local y de una sola persona, y de que se revisa si aparece un entorno de desarrollo compartido.

Vale la pena registrar el error que casi se comete: medir solo `next start` habría dado "no registra nada" y la afirmación habría quedado escrita sin el matiz.

### El bloqueo del borrado, confirmado en la base

El hallazgo 6 se verificó ejecutándolo, no solo leyendo el esquema: el caso 6 del test nuevo intenta borrar la ficha de un cliente con conversaciones y PostgreSQL la rechaza. Los dos casos del AC-7 quedaron separados y probados por separado, y el caso 10 registra el matiz que faltaba: un cliente **sin** conversaciones se borra, pero si tuvo cambios auditados sus entradas de `audit_logs` quedan igual.

### Una trampa que apareció al escribir la minimización

La primera forma de escribirla era auditarla, como cualquier otro cambio sobre un cliente. **Auditar la minimización vuelve a escribir el teléfono y las notas en el `diff` de `audit_logs`**, que es de solo inserción: el procedimiento habría deshecho su propio efecto y dejado el dato en una tabla de la que ya no se puede sacar. Por eso el script no escribe en `audit_logs` —también porque no hay usuario actor, que era la razón menor— y el runbook pide registrar la ejecución fuera de la base. El caso 7 del test lo fija: la cantidad de entradas de auditoría no cambia al minimizar.

### Desvíos respecto de la lista de archivos autorizados

Dos, los dos por omisión del propio brief, no por ampliación de alcance. **Quedan a confirmación del usuario en el cierre.**

1. **`tests/integration/client-data.test.ts`**, que la lista no nombra. La D-2 aprobada dice "el script de exportación necesita tests; el de eliminación, más todavía", y los AC-5 y AC-7 exigen ejercitarlos, así que el brief pedía tests sin autorizar dónde escribirlos.
2. **No se tocó `package.json`**, que tampoco estaba autorizado: los scripts se invocan con `npx tsx scripts/…` en vez de un alias `npm run`, a diferencia de `ingestion:credential`. Es una inconsistencia menor con el precedente de la 6.5.3, y agregar los dos alias es un candidato para una subfase que toque `package.json`.

### Evidencia de mutación

| Mutación | Efecto | Qué prueba |
|---|---|---|
| `console.log` y `route` interpolado en `src/app/_auth/logout.ts` | fallan las dos reglas del recorrido del repositorio de la guarda | La guarda detecta sobre el repositorio real, no solo sobre cadenas de prueba |
| `message: error.message` en `describeError` | falla el caso 3 de `log-privacy.test.ts` con el teléfono a la vista | El test mide la reducción del error, que es la defensa real |

Las dos tuvieron efecto y los archivos se restauraron, verificado con `git diff` vacío.

### Verificaciones

- `npm run typecheck`, `npm run lint` y `npm run format:check`: limpios.
- `npm run test`: **741 de 741**, 67 archivos (antes 707 y 64).
- `npx playwright test`: **81 de 81**, sin modificar ningún spec. Esta subfase no toca `src/`, así que la suite se corrió para sostener el AC-10, no porque hubiera riesgo de regresión.

#### Una corrida de 2,6 horas que no era un defecto

La primera corrida del end-to-end pasó los 81 casos pero tardó **2,6 horas**, contra 6,1 minutos en el cierre de la 8.1. Los tiempos por caso eran normales (1 a 4 segundos), así que el tiempo no estaba en ejecutar tests. La sospecha era contención de máquina: durante esa corrida convivían el build, dos servidores de Next levantados para la medición del hallazgo 5 y las suites de vitest, sobre 7,7 GB de RAM.

Se repitió con la máquina en reposo y sin nada en paralelo: **81 de 81 en 3,6 minutos** (229 s), más rápido incluso que la corrida de la 8.1. La contención queda confirmada como causa y no hay defecto que investigar. Se registra porque la conclusión opuesta —anotar 2,6 horas como tiempo normal, o salir a buscar un test lento inexistente— eran las dos salidas fáciles.

### Nivel de validación alcanzado

**Validado localmente y en CI** (`deterministic`) para las tres capas de logs y para los dos procedimientos. La medición de los dos modos del servidor es **medición local**, no test permanente, y así está escrita.

**No** se alcanza *validado en staging* ni *preparado para producción*: un procedimiento de borrado no está probado de verdad hasta ejecutarse en un entorno con datos reales y backups (Fase 9). El runbook lo dice en su encabezado.

### Pendientes registrados

- Borrado real de un cliente con conversaciones: necesita una subfase que revise el ADR 0013, registrado en Risks.
- `next dev` y la query en el log: sin acción mientras el desarrollo sea local, registrado en Risks.
- Alias de npm para los dos scripts: cuando una subfase autorice `package.json`.
- La política de retención de mensajes, que es lo que podría vencer los cuerpos retenidos: Fase 9.
