---
schema: task-brief.v1
task_id: "13.3"
task_type: runtime-validation
generated_at: 2026-09-30
---

# Brief: 13.3 — Disponibilidad y observabilidad

**Estado: aprobado el 2026-09-30 por el usuario, con las recomendaciones de D-1 a D-8 y un cambio en la condición de detención 2.** Eso fija: un objetivo del 99,5 % mensual medido desde afuera, sin SLA ni guardia, con la consecuencia escrita para el consumidor (D-1); el monitoreo de DigitalOcean si su precio lo permite, y si no un servicio externo gratuito (D-2); un aviso de vida por trabajo programado (D-3); alertas de disco y memoria (D-4); correo más el teléfono (D-5); la reevaluación del APM trasladada a la 13.5 (D-6); el corte del despliegue medido, sin rediseñarlo (D-7); revisión independiente al final (D-8). **El cambio**: el resultado del primer `crm-restore-check.timer` ya no detiene la etapa 13.3.2 entera, solo la parte de AC-10 que toca el aviso del ejercicio de restauración. La aprobación no autoriza ningún efecto sobre un servidor ni sobre una cuenta externa: cada uno se autoriza en su turno.

- **Nivel de evidencia objetivo**: `deterministic` para la etapa local, e `isolated-runtime` para la etapa en producción: fallas provocadas a propósito, sin tráfico real.
- **Nivel de validación alcanzable**: la vigilancia y las alertas **verificadas en el entorno productivo**, cada una con su falla provocada y la alerta vista llegar. No es «preparado para producción»: falta la 13.4, y el comportamiento con tráfico real no se conoce hasta la 13.5.
- **Orden**: tercera subfase de la Fase 13 ([Roadmap](../planning/Roadmap.md), §Fase 13). No cierra un gate por sí sola, pero la observabilidad es parte del gate de salida de la fase.

## Objetivo

Que una caída del CRM, o la falla de un trabajo programado del que depende la recuperación, **le llegue al usuario como alerta** sin que nadie tenga que ir a mirar. Y responder la pregunta 6: qué disponibilidad se le exige al CRM, si el agente depende de él en cada mensaje.

## Situación en la fase

La 13.1 dejó el entorno productivo arriba, con backup diario, copia externa cifrada y un ejercicio mensual de restauración. La 13.2 midió las consultas. Nada de eso avisa cuando falla. La 13.4 decide la retención y el borrado; la 13.5 trae el primer tráfico real. Lo que la 13.3 deje vigilando es lo que va a avisar si la 13.5 rompe algo.

### Obligaciones que toma

| Id | Qué pide | De dónde viene |
|---|---|---|
| R-1, pieza 3 | Medición externa de disponibilidad y latencia, con alerta, contra un criterio de disponibilidad decidido | [evaluación 10.1](evaluacion-10.1-mvp.md), §R-1 |
| R-1, APM | Reevaluar una herramienta de APM o tracing distribuido con tráfico real | evaluación 10.1, §R-1; [Overview](../architecture/Overview.md), §Observabilidad |
| Pregunta 6 | ¿Qué disponibilidad se le exige al CRM, si el agente depende de él en cada mensaje? | [brief-10](brief-10-evaluacion-del-mvp.md), mapa de asignación; [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), §Consecuencias |

## Hallazgos antes de diseñar

Todo lo de esta sección está leído el 2026-09-30. Las lecturas del servidor fueron de solo lectura.

- **H-1. Ninguna falla de un trabajo programado llega a nadie.** `crm-backup`, `crm-backup-offsite` y `crm-restore-check` son unidades `oneshot` de systemd sin `OnFailure=`. El droplet no tiene `mail`, `sendmail` ni `msmtp`. Si el backup deja de correr, solo lo sabe el journal, y nadie lo lee hasta que hace falta restaurar. El primer ejercicio de restauración programado corre el 2026-10-01 a las 04:37 UTC.
- **H-2. `/api/health` existe y nadie lo consulta.** Consulta la base, responde `200` o `503` con `Cache-Control: no-store`, y es público: da `200` desde afuera. No registra nada.
- **H-3. Las piezas 1 y 2 de R-1 existen, pero en producción todavía no producen nada.** `serve.ts` y los dos manejadores de ingestión llaman a `logEvent` con `requestId`, ruta, resultado y `durationMs`, y aceptan la correlación del emisor. La salida va al journal, que ocupa 34 MB sin límite propio configurado. La ingestión y la lectura están apagadas en producción, así que hoy no hay ningún evento de servicio.
- **H-4. El agente de métricas de DigitalOcean corre en el droplet.** `do-agent` está activo. No leí si la cuenta tiene políticas de alerta configuradas: eso es del panel, no del servidor. El droplet tiene un núcleo, 1.967 MB de RAM con 1.427 MB disponibles, y el disco está al 8 %.
- **H-5. Los requisitos no funcionales dicen que no hay SLA.** [NonFunctionalRequirements](../product/NonFunctionalRequirements.md), §Disponibilidad: «No hay SLA de disponibilidad en el MVP: no hay tráfico productivo». El ADR 0014 dice que el criterio se decide en la Fase 13. Esta subfase reemplaza esa línea.
- **H-6. Contradicción: el Roadmap pide reevaluar el APM «con tráfico real» en la 13.3, y en la 13.3 no hay tráfico real.** El primer tráfico real es de la 13.5, que depende de la 13.4. La 8.4 y la 10.1 se negaron a reevaluar sin evidencia por esta misma razón ([Overview](../architecture/Overview.md), §Observabilidad). Se eleva como D-6.
- **H-7. El sandbox del backup no deja salir nada a la red.** `crm-backup.service` tiene `IPAddressDeny=any`. Un aviso de «terminé bien» no puede salir desde esa unidad: tiene que ser otra.
- **H-8. Nadie midió cuánto se cae la aplicación durante un despliegue.** El procedimiento corre `npm ci` y `next build` sobre el mismo directorio del que sirve la aplicación, y después la reinicia. La 13.1 midió 90 s de despliegue completo, pero no cuántos de esos segundos la aplicación respondió mal. Hoy se desplegó `471cf7b` sin mirarlo.
- **H-9. El certificado se renueva con `certbot.timer`**, que está activo. Nada avisa si la renovación falla antes del vencimiento.

## Decisiones previas (las decide el usuario al aprobar)

### D-1 — Qué disponibilidad se le exige al CRM (pregunta 6)

El CRM corre en un solo droplet, con una sola base, un solo operador y despliegues que probablemente cortan el servicio (H-8). Cualquier número tiene que ser compatible con eso.

- **(a) Un objetivo del 99,5 % mensual, medido desde afuera.** Son unas 3 h 39 min de caída por mes. Sin SLA ni guardia: la alerta llega a cualquier hora, y la respuesta es la que el usuario pueda dar.
- **(b) Un objetivo del 99,9 %**: 43 min por mes. No es creíble con un droplet y sin guardia; una sola caída nocturna lo rompe.
- **(c) Sin número**: solo la alerta.

**Recomendación: (a).** Y escribir la consecuencia del lado del consumidor: **el CRM no garantiza estar disponible en cada turno**, así que el agente tiene que tolerar una falla o un timeout sin perder el mensaje. Eso ya lo exige la Fase 12 para la ingestión («ninguna pérdida de mensaje ante `CONFLICT`, timeout o falla»). Para la lectura se escribe en el contrato. El CRM no decide cómo lo resuelve el agente: el agente se adapta al contrato del CRM, no al revés.

### D-2 — Con qué se mide desde afuera

La medición no puede correr en el mismo droplet: si el droplet se cae, se cae con él.

- **(a) El monitoreo de disponibilidad de DigitalOcean.** La cuenta ya existe, y las alertas de recursos (D-4) quedan en el mismo lugar. En contra: el mismo proveedor mide y aloja.
- **(b) Un servicio externo de monitoreo**, con plan gratuito. Es otro proveedor y otra cuenta.
- **(c) Una corrida programada de GitHub Actions** que consulte `/api/health`. Es gratis, pero la frecuencia mínima es de 5 minutos y GitHub no garantiza el horario.

**Recomendación: (a), si su precio y sus límites lo permiten el día de la implementación. Si no, (b).** El precio se verifica ese día, como con R-2. En los dos casos el usuario crea o configura la cuenta en el panel, y ninguna credencial pasa por la conversación. Qué se mide: `/api/health` sobre HTTPS, que incluye la base (H-2), cada minuto, con el vencimiento del certificado si la herramienta lo ofrece (H-9).

### D-3 — Cómo avisan los trabajos programados (H-1)

- **(a) Un aviso de vida por trabajo.** Un servicio externo espera un ping después de cada corrida buena. Si el ping no llega a tiempo, alerta. Cubre la falla **y** el trabajo que nunca corrió. El ping sale de una unidad aparte, disparada por `OnSuccess=`, por H-7. Las URLs de ping viven en `/etc/crm-production/`, nunca en el repositorio.
- **(b) `OnFailure=` con correo.** Hace falta configurar un relevo SMTP en el droplet, con su secreto. No detecta un trabajo que dejó de correr.
- **(c) Revisión manual del journal.** Es lo que hay hoy.

**Recomendación: (a)**, para los tres trabajos: backup diario, copia externa diaria y ejercicio mensual de restauración.

### D-4 — Alertas de recursos del droplet

- **(a) Políticas de alerta de DigitalOcean** sobre disco y memoria, con los datos del `do-agent` que ya corre (H-4).
- **(b) Nada por ahora.**

**Recomendación: (a), con disco por encima del 80 % y memoria por encima del 90 % sostenida.** Un disco lleno tira abajo la base y el backup a la vez. Los umbrales son una propuesta; el usuario los fija.

### D-5 — Por dónde llega la alerta

Lo decide el usuario: correo, o correo más un canal de notificación en el teléfono si la herramienta lo ofrece sin costo. **Recomendación**: correo más el teléfono, porque una caída de noche no se ve en el correo hasta la mañana.

### D-6 — La reevaluación del APM (H-6)

- **(a) Trasladarla a la 13.5, con tráfico real.** La 13.3 deja escrito qué la dispararía: un turno lento o fallido que no se pueda explicar con los logs, que llevan `request_id` y `correlation_id`. También deja un procedimiento para sacar del journal la distribución de `durationMs` por ruta. Lleva una enmienda fechada en el Roadmap.
- **(b) Reevaluarla ahora, con tráfico sintético.** Repite lo que la 8.4 y la 10.1 evitaron: decidir por falta de datos.

**Recomendación: (a).**

### D-7 — El corte durante el despliegue (H-8)

- **(a) Medirlo y registrarlo.** En la etapa en producción, durante un despliegue, se consulta `/login` una vez por segundo desde afuera y se cuentan los segundos sin `200`. Si el corte pone en riesgo el objetivo de D-1, se registra en `Risks.md` y se decide aparte.
- **(b) Cambiar ahora el procedimiento** a un build en otro directorio con cambio atómico. Es un rediseño del despliegue sin haber medido el problema.

**Recomendación: (a).**

### D-8 — Revisión independiente

La 13.3 no cierra un gate por sí sola, pero lo que deja es parte del gate de salida de la fase, y una alerta que no llega no se nota hasta que hace falta.

**Recomendación: sí, una revisión independiente de solo lectura** al final, contra este brief y la evidencia.

## Escala de severidad, fijada antes de empezar

- **Crítico**: una URL de ping, un token, una IP o una credencial en el repositorio o en la conversación; la aplicación productiva caída más allá de la ventana de una falla provocada; una alerta dada por funcionando sin haberla visto llegar.
- **Mayor**: un modo de falla declarado cubierto sin su falla provocada; un trabajo programado sin aviso; un número de disponibilidad sin su método de medición; una guarda de `deploy/` que no cubre una unidad nueva.
- **Menor**: un recuento que no cierra, un comando no literal, una frase de estado vieja.

## Alcance incluido

**Etapa 13.3.1 — local**

1. Las unidades del aviso de vida según D-3, en `deploy/production/`, y el `OnSuccess=` de cada trabajo. La URL se lee de un archivo en `/etc/crm-production/`.
2. Las guardas de `deploy/` extendidas: cada trabajo programado de producción dispara su aviso, y ningún archivo versionado contiene una URL de ping.
3. `deploy/production/README.md`: la tabla de archivos con las unidades nuevas, la sección de monitoreo, y el `diff` de la verificación posterior con la cuenta nueva de archivos.
4. Un runbook nuevo, `docs/runbooks/responder-a-una-alerta.md`, con un procedimiento por cada alerta: qué mirar primero, qué comando corre, cuándo se restaura y cuándo se espera.
5. `NonFunctionalRequirements.md`, §Disponibilidad, con el criterio de D-1. El contrato de lectura y `IntegrationBoundaries.md` con la consecuencia para el consumidor.
6. Según D-6, la enmienda fechada del Roadmap, y el procedimiento para sacar `durationMs` del journal.

**Etapa 13.3.2 — en producción y en las cuentas externas** (cada paso, en su turno)

7. El usuario configura la medición externa (D-2), los avisos de vida (D-3), las alertas de recursos (D-4) y el canal (D-5). Escribe en el servidor el archivo con las URLs de ping, sin que pasen por la conversación.
8. Instalar las unidades nuevas en el droplet y correr cada trabajo una vez a mano: el ping llega.
9. Provocar cada falla y ver llegar su alerta, con la hora de la falla, la de la alerta y la de la recuperación:
   - la aplicación detenida;
   - la base detenida, con `/api/health` en `503`;
   - un aviso de vida que no llega;
   - el umbral de disco bajado por debajo del uso actual, y vuelto a su valor.
10. Medir el corte de un despliegue según D-7.
11. Actualizar `Risks.md`, `Overview.md` y los documentos que decían que no había medición externa.

## Alcance excluido

- Encender la ingestión o la API de lectura en producción, y cualquier dato real.
- Elegir una herramienta de APM o de tracing (D-6).
- Alta disponibilidad: una segunda máquina, réplicas de la base o balanceo.
- Cambiar el procedimiento de despliegue (D-7).
- La retención del journal. Guarda logs con identificadores de organización, así que se decide con la retención, en la 13.4.
- Las alertas de staging. Una caída de staging no tiene impacto de negocio (NonFunctionalRequirements).
- Tocar el repositorio del agente o su n8n. Lo que el agente haga ante una falla del CRM lo decide el agente, con su brief.
- `src/`: nada. `/api/health` ya existe.

## Archivos o componentes autorizados

- `deploy/production/`: unidades nuevas, el `OnSuccess=` de los tres servicios programados y el README.
- `tests/guards/staging-backup-config.test.ts`, u otra guarda nueva de `tests/guards/`.
- `docs/runbooks/` (el runbook nuevo), `docs/product/NonFunctionalRequirements.md`, `docs/architecture/IntegrationBoundaries.md`, `docs/architecture/Overview.md`, `docs/contracts/read-v1.md` (solo la consecuencia de D-1), `docs/planning/Risks.md`, `docs/planning/Roadmap.md`, `docs/architecture/TraceabilityMatrix.md`, `docs/development/EngineeringStandards.md` (la lista de guardas), `docs/decisions/` (este brief y una evidencia nueva), `CHANGELOG.md`, `HANDOFF.md`.
- En el droplet: las unidades nuevas en `/etc/systemd/system/`, el archivo de URLs en `/etc/crm-production/`, y las paradas provocadas de `crm-production` y de `postgresql`, cada una en su turno.
- En las cuentas externas: lo que el usuario configure según D-2 a D-5.

## Fuentes de verdad

La [evaluación 10.1](evaluacion-10.1-mvp.md), §R-1; el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md); [NonFunctionalRequirements](../product/NonFunctionalRequirements.md); [Overview](../architecture/Overview.md), §Observabilidad; [deploy/production/README.md](../../deploy/production/README.md); el [runbook de restauración](../runbooks/restaurar-la-base.md).

## Dependencias

- La 13.2 cerrada.
- El acceso `ssh crm-production`.
- Las cuentas externas que elija el usuario.
- **Dato pendiente**: el resultado del primer `crm-restore-check.timer`, el 2026-10-01. Solo condiciona el aviso del ejercicio de restauración (condición de detención 2). El resto de la 13.3.2 no espera.

## Invariantes

- **Ningún secreto, URL de ping, token ni IP pasa por la conversación ni por el repositorio.**
- **Cada efecto sobre un servidor o una cuenta externa se autoriza en su turno.**
- **Toda falla provocada termina con la aplicación respondiendo `200`**, y `crm_production` con los mismos recuentos antes y después.
- **Una alerta cuenta como verificada solo si se la vio llegar al canal**, con su hora. Que la herramienta diga que está configurada no alcanza.
- **La ingestión y la API de lectura siguen apagadas.**

## Criterios de aceptación

**Etapa 13.3.1**

- **AC-1 (D-3).** Los tres trabajos programados de producción disparan su aviso de vida desde una unidad aparte. Una guarda falla si un trabajo pierde su aviso, con la mutación ejecutada.
- **AC-2.** Una guarda falla si un archivo versionado contiene una URL de ping, con la mutación ejecutada.
- **AC-3.** El README de producción lista las unidades nuevas, su destino y su verificación, y el runbook de alertas tiene un procedimiento por cada alerta de D-2 a D-4.
- **AC-4 (pregunta 6).** NonFunctionalRequirements, el contrato de lectura e IntegrationBoundaries dicen el criterio de D-1 y su consecuencia para el consumidor. La línea «No hay SLA» está reemplazada, con su fecha.
- **AC-5 (D-6).** La reevaluación del APM tiene destino y disparador escritos. El procedimiento de `durationMs` está probado contra un journal con eventos, en local.
- **AC-6.** La suite completa y la CI del commit de la etapa están en verde, leída por `headSha`.

**Etapa 13.3.2**

- **AC-7 (R-1, pieza 3).** La medición externa consulta `/api/health` de producción con la frecuencia de D-2. La herramienta y su precio verificado ese día están registrados.
- **AC-8.** La aplicación detenida produce una alerta, y su recuperación, otra. Las dos se vieron llegar, con las horas de la falla, la alerta y la recuperación.
- **AC-9.** La base detenida produce la alerta por `503`, vista llegar.
- **AC-10 (D-3).** Cada trabajo corrido a mano llega a su aviso, y un aviso que no llega produce su alerta, vista llegar.
- **AC-11 (D-4).** La alerta de disco se vio llegar con el umbral bajado, y el umbral quedó en su valor.
- **AC-12 (D-7).** El corte de un despliegue está medido en segundos, con su método.
- **AC-13.** Después de cada falla provocada, `/login` responde `200` y los recuentos de `crm_production` son iguales a los de antes.
- **AC-14.** `Risks.md` y los documentos que decían «nadie lo consulta» o «sin medición externa» dicen lo que quedó.

**Cierre**

- **AC-15.** Hubo revisión independiente según D-8, con sus hallazgos verificados y resueltos o aceptados por el usuario.

## Pruebas y evidencia requerida

Un archivo `evidencia-13.3-disponibilidad.md` con cada comando y su salida literal. Un bloque transcrito se marca `[transcrito]`. Una alerta vista en el correo o en el teléfono la transcribe el usuario, o la describo con lo que él me muestre, y se marca así. **Ninguna URL de ping ni dirección de correo** entra en la evidencia. Todo lo que verifique el mismo agente que implementa se declara autoevaluación.

## Condiciones de detención

1. D-1 a D-8 sin resolver.
2. El primer ejercicio de restauración programado falla: se corrige antes de dar por cumplida la parte de AC-10 que toca su aviso. El resto de la etapa 13.3.2 sigue. *Cambiado por el usuario al aprobar, el 2026-09-30: antes detenía la etapa entera.*
3. La herramienta elegida en D-2 o D-3 tiene costo, o exige algo que el usuario no aprobó: se vuelve a preguntar.
4. Una falla provocada no se recupera sola en la ventana prevista: se restaura el servicio antes de seguir y se registra.
5. Hace falta tocar `src/` o un archivo fuera de la lista.
6. Una URL de ping o una credencial aparece en la conversación o en un archivo versionado: se detiene, se rota y se registra.

## Lo que esta subfase no va a poder demostrar

- **Que el 99,5 % se cumple.** Hace falta un mes de medición; al cierre habrá días.
- **La latencia de las rutas de servicio con tráfico.** La medición externa ve `/api/health`, no la lectura del agente, que sigue apagada. La latencia de servicio sale de `durationMs` en la 13.5.
- **Que el agente tolere una caída del CRM.** Es del lado del agente.
- **Que las alertas lleguen siempre.** Se ve llegar una por modo de falla, no todas.

## Decisiones durante la implementación (13.3.1)

Las tomé yo al implementar, dentro de lo que el brief fijaba. Ninguna cambia una decisión aprobada.

- **I-1. El aviso es una plantilla de systemd, `crm-heartbeat@.service`, con un usuario efímero.** La instancia es el trabajo (`@backup`, `@offsite`, `@restore-check`). `DynamicUser=true` con `EnvironmentFile=/etc/crm-production/heartbeat.env`: systemd lee el archivo como `root` antes de soltar privilegios, así que el archivo sigue siendo `0600` de `root` y el proceso que habla con la red no puede leer ningún otro secreto. El brief pedía «una unidad aparte» (H-7), sin fijar cuál.
- **I-2. El script acepta una lista cerrada de trabajos**, y la guarda exige que coincida con los que disparan las unidades. Un nombre mal escrito sale con error y la alerta suena por ausencia: es una falsa alarma y no un silencio.
- **I-3. El script nunca imprime la URL**, ni en el mensaje de error de `curl`, que puede traerla. Informa solo el código de salida de `curl`.
- **I-4. La guarda de AC-2 es un archivo nuevo**, `tests/guards/heartbeat-urls.test.ts`, y no un bloque de la de backup: recorre todo el repositorio, no `deploy/`. Mira también los archivos nuevos sin versionar.
- **I-5. El procedimiento de `duration_ms` vive en el runbook de alertas** como comandos de `jq`, no como script: `scripts/` no estaba en la lista de archivos autorizados. **Se probó en el droplet, no en local**, como pedía AC-5: la máquina local no tiene `jq`. Se le pasaron por la entrada estándar líneas del formateador real de la aplicación, sin escribir nada en el servidor. *Aceptado por el usuario el 2026-09-30, a raíz de la revisión independiente (hallazgo 4): esta decisión sí cambiaba un criterio aprobado, y la frase de arriba que dice lo contrario no la cubría.*
- **I-6. El monitoreo de producción es un apartado nuevo del README**, «Monitoreo y alertas», con la instalación y la prueba de cada aviso.

## Resultados — etapa 13.3.1, 2026-09-30

Las salidas crudas están en [evidencia-13.3-disponibilidad.md](evidencia-13.3-disponibilidad.md). **Autoevaluación**: lo verificó el mismo agente que lo implementó.

| AC | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | Los tres trabajos disparan su aviso desde `crm-heartbeat@.service`. La guarda de backup suma 10 casos: el grafo desde cada timer, la coherencia con el script y la unidad del aviso. Cinco mutaciones sobre archivos reales en rojo, y una en verde que encontró un caso sintético que dejaba de mutar |
| AC-2 | cumplido | Guarda nueva, 12 casos, dos mutaciones en rojo y dos en verde, que son los límites declarados. **En su primera corrida con la suite entera marcó la evidencia de esta misma etapa**: una fuga de tokens inventados, corregida sin eximir el archivo, y un falso positivo del detector, corregido con dos casos nuevos |
| AC-3 | cumplido | README de producción: 13 archivos en la tabla, `heartbeat.env` entre los secretos, el apartado de monitoreo con la instalación y la prueba. Runbook nuevo con un procedimiento por alerta |
| AC-4 | cumplido | NonFunctionalRequirements, el contrato de lectura (§Disponibilidad) e IntegrationBoundaries dicen el 99,5 % mensual y la consecuencia para el consumidor. La línea «No hay SLA» está tachada, con su fecha |
| AC-5 | cumplido, **con el desvío de I-5** | La enmienda del Roadmap traslada el APM a la 13.5 con su disparador. El procedimiento dio los percentiles calculados a mano sobre líneas del formateador real, y corre sin error sobre el journal de producción, que todavía no tiene eventos de servicio |
| AC-6 | cumplido | Formato, lint y typecheck en verde; guardas 465 de 465 (15 archivos); unitarios 491 de 491. No se corrieron en local la integración ni el end-to-end: esta etapa no toca `src/`. CI del commit `579397e`: `success`, corrida 36762045106, leída por `headSha` |

## Decisiones durante la etapa 13.3.2

- **I-7. Desviación de AC-10, aprobada por el usuario el 2026-09-30.** «Cada trabajo corrido a mano llega a su aviso» se verifica con las **corridas programadas**: el backup y la copia externa del 2026-10-01 a las 03:15, y el ejercicio de restauración del mismo día a las 04:30. Recorren el camino real completo, del timer al trabajo y del trabajo al aviso, y no generan un backup ni una subida externa de más. El camino del aviso ya se probó sin correr ningún trabajo, con `systemctl start crm-heartbeat@<trabajo>`. La otra mitad, un aviso que no llega, se provocó con un chequeo de prueba en Healthchecks y no rompiendo un trabajo real: los chequeos de producción usan las mismas integraciones.
- **I-8. La base se detiene por su unidad de cluster, `postgresql@18-main`.** El primer intento de AC-9 detuvo `postgresql`, y systemd detuvo también la aplicación, que tiene `Requires=postgresql.service`: dio `502`, no `503`. El segundo intento, con su propia autorización, detuvo solo el cluster, que es lo que pasa cuando la base se cae sola.
- **I-9. Los recuentos de AC-13 se toman con un único comando exacto**, de solo lectura, que el usuario habilitó como permiso para esta subfase. Se saca al cerrarla.

## Resultados — etapa 13.3.2, 2026-09-30

Las salidas están en [evidencia-13.3-disponibilidad.md](evidencia-13.3-disponibilidad.md). Todas las horas son UTC. **Autoevaluación**. Las alertas las vio llegar el usuario, y lo que él mostró está marcado `[transcrito]`.

| AC | Estado | Evidencia |
|---|---|---|
| AC-7 | cumplido, **con un hallazgo de frecuencia** | DigitalOcean Uptime sobre `/api/health`, cuatro regiones, un chequeo sin costo. Sumando las regiones hay una consulta por minuto, como pedía D-2. Por región, una cada 3 a 9 minutos, así que la detección tarda de 4,5 a 9,5 minutos. **Aceptado por el usuario el 2026-09-30** (opción a): el atraso no compromete el margen del 99,5 %, y se revisa en la 13.5 con tráfico real (fila de `Risks.md`). La alternativa era sumar un monitor de otro proveedor |
| AC-8 | cumplido | Detenida a las 20:14:51. Alerta de caída a las 20:24 (se_asia). Levantada a las 20:24:29. Alerta de recuperación a las 20:35. Llegó además un aviso de caída de eu_west con el sitio ya arriba |
| AC-9 | cumplido en el segundo intento (I-8) | Base detenida a las 20:42:38, `/api/health` en `503` y `/login` en `200`. Alerta a las 20:47 (eu_west). Base de vuelta a las 20:47:37, y la aplicación reconectó sola: `200` al primer pedido y ningún reinicio. Recuperación avisada a las 20:59 y a las 21:03 |
| AC-10 | cumplido, **la segunda mitad el 2026-10-01** (I-7) | Chequeo de prueba: un ping a las 21:14, *down* a las 21:16:12, email y Telegram a las 21:16. Los tres avisos de prueba salieron a las 19:29, con `Result=success`. Corridas programadas del 2026-10-01: backup a las 03:18:50 y copia externa a las 03:18:51, con aviso a las 03:18:52 y 03:18:53; ejercicio de restauración a las 04:39:20, 17 tablas iguales, aviso a las 04:39:22. Todas con `Result=success`. Los tres chequeos *up* en Healthchecks y ningún aviso de caída, confirmado por el usuario. La condición de detención 2 no se activó |
| AC-11 | cumplido | Umbral bajado a 5 % a las 21:10, email a las 21:11, vuelta a 80 % a las 21:12, confirmada con la captura del panel |
| AC-12 | cumplido | Corte de 1 a 3 s en el despliegue de `579397e`: un `502` en 521 pedidos a `/login` en 10 minutos, uno cada 1,15 s de promedio, porque cada pedido espera el segundo después de terminar. `npm ci` y `next build` no cortaron nada. Solo se midió `/login` |
| AC-13 | cumplido | Los 17 recuentos, iguales en la línea de base y después de cada una de las tres paradas. `/login` en `200` después de cada una |
| AC-14 | cumplido, **después de la revisión independiente** (hallazgos 1 y 10) | `Risks.md`: fila nueva con lo que quedó y lo que no cubre. `Overview.md` §Observabilidad: la tercera pieza existe. README de producción: las herramientas, los umbrales y cuánto tarda cada alerta. Runbook: el estado de cada alerta y los hallazgos de AC-8 y AC-9 |

**Hallazgos de la etapa**, además de las filas:

1. **Uptime avisa tarde y a veces fuera de tiempo.** Recuperación avisada entre 11 y 16 minutos después. Dos avisos de caída con el sitio arriba. Una caída de 40 segundos, sin alerta. El runbook ya manda confirmar `/api/health` a mano antes de actuar.
2. **Detener `postgresql` detiene la aplicación, y levantarla no la levanta** (`Requires=`). Queda en el runbook. No se cambió la unidad: es un cambio de comportamiento de producción, fuera del alcance de esta etapa.
3. **El diagnóstico del runbook miraba el envoltorio de PostgreSQL**, que sigue `active` con la base caída. Corregido: mira `postgresql@18-main`.

## Revisión independiente (AC-15), 2026-09-30

Un agente que no participó del trabajo revisó la subfase entera, con acceso de solo lectura, salvo la mitad de AC-10 que todavía no ocurrió. Informó **1 crítico, 1 mayor, 10 menores y 3 observaciones**. Cada hallazgo se verificó contra el código o contra el servidor antes de aceptarlo, y **los doce se confirmaron**. Los dos que la revisión marcó como inferidos (6 y 9) se confirmaron en el droplet. Las salidas están en la [evidencia](evidencia-13.3-disponibilidad.md#correcciones-de-la-revisión-independiente).

| # | Severidad | Hallazgo | Resolución |
|---|---|---|---|
| 1 | crítico, por la letra de la escala | Overview y Risks decían que cada alerta se vio llegar con su falla provocada; la memoria, la latencia y el certificado no se provocaron | Corregidos los dos: qué se provocó y qué está solo configurado |
| 2 | mayor | D-5 pedía correo más el teléfono, y las alertas de Uptime y de recursos llegan solo por email, sin registrarlo | I-10, abajo. **Aceptado por el usuario el 2026-09-30** |
| 3 | menor | El runbook no tenía procedimiento para la alerta de latencia (AC-3) | Sección nueva, con el comando probado en el droplet |
| 4 | menor | I-5 cambió dónde se probó AC-5 sin aprobación registrada | **Aceptado por el usuario el 2026-09-30**, después de hecho: I-5 queda como desvío aprobado |
| 5 | menor | La guarda no veía un aviso en `OnFailure=`, un `OnSuccess=` vacío ni otros modos de imprimir la URL | Tres reglas nuevas, de 126 a 131 casos, cinco mutaciones en rojo. Una encontró un defecto de la corrección misma, corregido |
| 6 | menor | La URL iba en los argumentos de `curl`, legibles en `/proc` | El droplet no tiene `hidepid`: confirmado. La URL va ahora por la entrada estándar de `curl`, con una guarda. **Instalado en el droplet el 2026-10-01**, sin reiniciar la aplicación, y probado en los tres avisos |
| 7 | menor | El comando de prueba del README mostraba la línea de systemd, no la del script | Muestra el resultado y las tres últimas líneas. La evidencia dice qué comando produjo su salida |
| 8 | menor | Una línea en blanco partía la tabla de secretos del README | Quitada |
| 9 | menor | El runbook decía que la aplicación queda caída tras cinco fallas; con `RestartSec=5` reintenta para siempre | Confirmado en el droplet y corregido |
| 10 | menor | NonFunctionalRequirements decía que el corte del despliegue «se mide en la 13.3.2» y que el despliegue corta mientras dura | Dice lo medido: de 1 a 3 s, solo en el reinicio |
| 11 | menor | La nota de una salida recortada de AC-1 no coincidía con el bloque | Nota corregida, y la mutación repetida entera |
| 12 | menor | `HANDOFF.md` decía que producción corre `471cf7b` y que sigue el brief de la 13.3 | Actualizado |
| O-1 | observación | Dos rangos de detección sin decir cuál es estimado y cuál medido | Aclarado en la evidencia |
| O-2 | observación | «Uno por segundo» en AC-12, cuando fue uno cada 1,15 s | Corregido |
| O-3 | observación | Dos archivos modificados fuera de la lista | Solo finales de línea, anteriores a la 13.3, fuera de todo commit: `git diff --ignore-cr-at-eol` vacío |

La revisión también señaló dos frases viejas de Overview que no son de la 13.3: la de los campos que `logEvent` «todavía no registra» y la de «producción sigue siendo diseño». Se corrigieron, porque Overview está en la lista autorizada.

- **I-10. D-5 se cumple con el email en el teléfono.** Las alertas de Uptime y de recursos de DigitalOcean llegan por email. Los canales que ofrecía el panel eran email y Slack, sin Telegram. En el paso E, el usuario confirmó que la casilla de esas alertas la lee en el celular, con notificaciones. Healthchecks.io llega además por Telegram. **Límite**: una notificación de email se silencia más fácil que un canal dedicado. *Aceptado por el usuario el 2026-09-30.*

## Cierre de la subfase 13.3, 2026-10-01

- **Commits**: `579397e` (13.3.1, CI `success`, run 36762045106), `e96ec8e` (13.3.2, CI `success`, run 36779330317) y `9ffd112` (correcciones de la revisión, CI `success`, run 36782158848), leídas por `headSha`.
- **Criterios**: AC-1 a AC-15 cumplidos, con los desvíos aprobados I-5, I-7 e I-10 y el hallazgo de frecuencia de AC-7, aceptado por el usuario. La segunda mitad de AC-10 se cumplió el 2026-10-01 con las corridas programadas, incluido el primer ejercicio de restauración programado en producción.
- **En el droplet**: la aplicación sigue en `579397e`. El script del aviso es el de `9ffd112`, instalado solo el 2026-10-01 y probado en los tres avisos. La copia del repositorio en `/srv/crm-production` lo trae con el próximo despliegue.
- **Nivel**: verificado en el entorno productivo, sin tráfico real (`isolated-runtime`). No es «preparado para producción»: falta la 13.4.
- **Lo que hereda el resto de la fase**: la frecuencia de detección de Uptime y la reevaluación del APM, en la 13.5 con tráfico real; el mes de medición que dirá si el 99,5 % se cumple; `Requires=postgresql.service` sin cambiar, escrito en el runbook.
- **Local, al cerrar**: formato, lint, typecheck, guardas (470 de 470) y unitarios (491 de 491) en verde. Integración y end-to-end no se corrieron en local: la subfase no tocó `src/`.
