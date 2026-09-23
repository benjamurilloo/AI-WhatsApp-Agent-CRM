---
schema: task-brief.v1
task_id: "10"
task_type: audit
generated_at: 2026-09-23
---

# Brief 10 — Evaluación del MVP

- **Contrato**: `task-brief.v1`. Un solo brief para la fase, con tres subfases y criterios de aceptación propios por subfase (ver D-1).
- **Tipo de tarea**: `audit` (10.1), `design` (10.2 y 10.3). **Sin código**: ninguna subfase toca `src/`, `tests/`, `drizzle/`, `deploy/`, `seeds/`, `scripts/` ni `package.json`.
- **Nivel de evidencia objetivo**: ninguno nuevo. La fase **no produce evidencia de runtime**: cada veredicto cita la evidencia vigente con el nivel que ya tiene, y ninguno sube de nivel por figurar en el informe.
- **Orden**: después de la **Fase 9**, cerrada el 2026-09-23 con el gate enmendado.
- **Gate de entrada**: Fase 9 cerrada — cumplido (`15c8faf`, CI `success`). **Gate de salida**: decisión explícita del usuario ([Roadmap](../planning/Roadmap.md) §Fase 10). La subfase que lo cierra (10.3) lleva **revisión independiente obligatoria** ([ExecutionProtocol](../development/ExecutionProtocol.md), paso 4b).
- **Estado de este documento**: **aprobado el 2026-09-23**, con D-1 a D-7 resueltas por la recomendación. Ver §Resolución. **Cerrado el 2026-09-23**: las tres subfases y la fase, con la decisión del usuario.

## Objetivo

Decidir con criterios explícitos qué pasa con el producto después del MVP, y dejar escrito, antes de tocar código, el marco en que el agente de WhatsApp pasa a consumir el CRM.

Son tres trabajos que se ordenan solos:

1. **Evaluar** el MVP contra la Definición de Terminado **tal como está escrita hoy**, con evidencia por criterio, incluido lo incumplido.
2. **Enmendar** los documentos que hoy prohíben la integración que el usuario decidió el 2026-09-23 (brecha B-1).
3. **Planificar** las fases de integración y cerrar el gate con la decisión del usuario.

El orden importa: si se enmendara primero `FR-CONV-05`, la evaluación mediría el MVP contra un requisito escrito después de conocer el resultado. Por eso 10.1 evalúa contra el estado de `15c8faf` y solo después 10.2 cambia los documentos.

## Lo que se verificó antes de escribir este brief

Todo lo de esta sección se leyó el 2026-09-23, contra el repositorio en `967e357`.

### Estado verificado

- `HEAD` y `origin/main` coinciden en `967e357`. Su corrida de CI estaba **`in_progress`** al escribir esto; `15c8faf` y `9e0a1e5` están en `success`. **La cabecera del HANDOFF quedó desactualizada**: dice que el último ref verde es `b492bf0`, y hay dos posteriores en verde. No cambia nada de fondo, pero es la quinta vez que un hash escrito a mano envejece en ese archivo.
- Staging responde `200` en `/login`.
- Notion: el proyecto «Fase 10 — Evaluación del MVP» (`3d8702be6f4e81a19309d760d5860f7b`) está «No comenzado», con **una sola tarea**, «10.1 — Evaluación y decisión» (`3d8702be6f4e8101b562e58fa3f515e3`), en «Bandeja de Entrada» y con la descripción del 2026-09-11, anterior a que el alcance creciera.
- El documento de brechas del usuario se leyó en el repositorio del agente, commit `b75e484`, **como contexto de negocio y sin tocar esa rama**. Nada de ese repositorio entra a este como dependencia.

### Hallazgos del contraste contra las reglas vigentes

El HANDOFF y el Roadmap enumeran **cuatro** documentos a enmendar: `Scope.md`, `FR-CONV-05`, `IntegrationBoundaries.md` y el ADR 0003. Buscando con `grep` qué más contradice la decisión aparecieron más, y se registran acá citando las dos fuentes en vez de resolverlos en silencio.

- **C-1. `Vision.md` contradice la decisión.** §«Qué no construimos»: «No reemplaza al agente de WhatsApp ni a Airtable hoy. La migración es un proyecto futuro separado». Y la definición de éxito del MVP es explícitamente «sin tráfico productivo». No estaba en la lista de B-1.
- **C-2. El criterio para «continuar» no se puede cumplir como está escrito.** [Roadmap](../planning/Roadmap.md) §Criterios: continuar exige «se cumple la Definición de Terminado sin hallazgos críticos». La Definición de Terminado incluye «Piloto en staging sin bloqueantes, con datos sintéticos», y ese ítem quedó **incumplido por decisión** al cerrar la Fase 9. Además, las tres opciones —continuar, iterar, detener— describen «continuar» como «hacia la migración y luego el ERP», y **ninguna contempla** la decisión que el usuario ya tomó: integrar al agente primero. La evaluación no puede derivar la decisión de los criterios escritos; tiene que registrarse como decisión del usuario **con la brecha a la vista**. El gate de salida lo permite, porque es «decisión explícita del usuario», no un umbral.
- **C-3. Tres lugares más del Roadmap dicen lo contrario de lo decidido**: §Fases futuras («Migración y cutover: proyecto separado»), §Camino crítico (termina en la Fase 10) y §Decisiones que requieren aprobación («Paso de la Fase 10 al proyecto de migración»).
- **C-4. `CLAUDE.md` describe al CRM como independiente del agente** («Pese al nombre, es independiente del agente de WhatsApp»). Sigue siendo cierto a nivel de código, infraestructura y base de datos, y **ninguna de sus prohibiciones necesita cambiar**: el CRM no habla con Airtable, no importa código del agente y no crea módulos de ERP. Pero la frase, leída en una sesión futura, invita a rechazar la integración. Es un archivo de instrucciones del usuario: solo se toca con su autorización (D-4).
- **C-5. `TraceabilityMatrix.md` fija `FR-CONV-05` como invariante**, verificada en el gate de la Fase 6. Enmendar el requisito sin tocar su fila deja la matriz afirmando un invariante que ya no rige.
- **C-6. La guarda de referencias prohibidas va a disparar en las fases de integración si alguien nombra al emisor como el repositorio.** Su patrón es `/ai-whatsapp-agent(?!-crm)/i` sobre todo archivo versionado fuera de la documentación. Un `source` de credencial o un nombre de configuración como `ai-whatsapp-agent` la rompe. **No es un defecto de la guarda** —hace lo que debe— ni trabajo de esta fase: se registra para que el roadmap de 10.3 lo anote en la primera fase de integración y nadie «arregle» la guarda para hacer pasar un nombre.

Ninguno de estos hallazgos cambia lo que decidió el usuario. Cambian **cuánto** hay que enmendar para que lo decidido quede escrito en todos los lugares que hoy lo niegan.

## Descomposición

| Subfase | Tipo | Qué produce | Gate |
|---|---|---|---|
| **10.1 — Evaluación contra la Definición de Terminado** | `audit` | `docs/decisions/evaluacion-10.1-mvp.md`: un veredicto con evidencia por cada criterio de la Definición de Terminado, las tres reevaluaciones heredadas y el inventario de obligaciones abiertas | no |
| **10.2 — Enmiendas de alcance para la integración** | `design` | ADR 0014 y las enmiendas de B-1 más las de C-1 a C-5 | no |
| **10.3 — Roadmap de integración y decisión** | `design` | Las fases de integración en el Roadmap, con el piloto como subfase propia; la decisión del usuario registrada | **cierra el de la Fase 10** |

Situación de cada cosa, sin mezclarlas:

- **Necesario ahora** (esta fase): evaluar, enmendar, planificar y decidir.
- **Requisito antes de producción** (se asigna en 10.3, no se hace acá): APM o tracing si la reevaluación lo exige, protección de rama, retención de `messages` con datos reales, disponibilidad exigida al CRM, y lo que la 9.1 y la 9.3 dejaron abierto.
- **Posterior**: el ERP, después de que la integración esté en producción, por decisión del usuario.

## Alcance

### Incluido

- **10.1**
  - Veredicto `cumplido | incumplido | incumplido por decisión | no verificable` para cada uno de los seis criterios de la [Definición de Terminado](../planning/Roadmap.md) (§Definición de Terminado del MVP), con la evidencia vigente citada por ruta, commit o corrida, y su nivel.
  - La confirmación del criterio de «continuar» que depende del usuario: si el backoffice resuelve el dolor de [Vision.md](../product/Vision.md). Se le pregunta; no se infiere.
  - Las **tres reevaluaciones heredadas de la 9.4**, cada una con su criterio fijado en este brief (§Criterios de las reevaluaciones) y un resultado: decisión tomada, o fase de integración asignada con su condición.
  - El **inventario de obligaciones abiertas**: todo lo que el HANDOFF lista como pendiente en §3 y §6 «Pendientes», y las preguntas abiertas de `Risks.md` con fase límite, cada uno con un destino (ver AC-6).
  - Si el usuario lo aprueba (D-6): una revisión independiente de la evidencia de la 9.3.
- **10.2**
  - Un **ADR nuevo (0014)** que registre la decisión del 2026-09-23: el agente de WhatsApp consume el CRM mediante una API de servicio versionada, diseñada desde el modelo del CRM; la integración y la migración por CSV son fases de este repositorio; el CRM sigue sin hablar con Airtable.
  - El ADR 0003 pasa a «reemplazada parcialmente por 0014», sin borrar su texto.
  - Enmiendas de `Scope.md`, `FR-CONV-05`, `IntegrationBoundaries.md`, `Vision.md`, la fila de `FR-CONV-05` en `TraceabilityMatrix.md` y, si D-4 lo autoriza, la frase de `CLAUDE.md`. Cada enmienda con fecha y referencia al ADR, conservando el texto anterior tachado o citado, como se hizo con el gate de la Fase 9.
- **10.3**
  - Las **fases de integración** en el Roadmap, con el orden acordado (§Borrador del orden) y, para cada fase, objetivo, alcance, gate y las brechas que cierra.
  - El **piloto como subfase propia** de la primera fase de integración, después de catálogo e información del negocio y antes de que el primer cliente cargue sus datos. Es condición escrita del Roadmap, no intención.
  - Cada pregunta abierta del documento de brechas (§7, seis preguntas) **asignada a una subfase**, no contestada.
  - Las enmiendas de C-2 y C-3 al Roadmap: criterios de decisión, fases futuras, camino crítico y decisiones del usuario.
  - La decisión del usuario, registrada con fecha y con la brecha de la Definición de Terminado a la vista.

### Excluido

- **Todo código, migración, test, guarda, seed o script.** Si una subfase descubre que algo solo se puede decidir midiendo, se detiene y lo eleva (§Condiciones de detención).
- **Diseñar la API de servicio, el contrato v2 de ingestión o el modelo de precios.** Se nombran en el roadmap con su fase; se diseñan en el brief de esa fase. La única excepción es confirmar la *dirección* del precio (D-5), porque el usuario ya la decidió y solo falta registrarla.
- **Contestar las seis preguntas abiertas de las brechas** (escalada, vencimiento de sesión, memorias, qué se migra, límite de 120/min, disponibilidad). Se asignan; no se deciden acá.
- **Cualquier cambio en el repositorio del agente o en su instancia de n8n.** La §5 del documento de brechas es trabajo de ese proyecto.
- **ERP**: ventas, compras, proveedores, pagos, caja y contabilidad siguen prohibidos por `CLAUDE.md`. El roadmap puede nombrarlos como posteriores, sin fases ni tablas.
- **Airtable**: ni SDK, ni API, ni variables, ni mapeos de sus tablas. La migración entra por CSV exportado y su mapeo se diseña en su propia fase, desde el modelo del CRM.
- **Operaciones en staging que escriban**. Se admite `curl` de solo lectura para citar el estado del servicio.
- Reabrir decisiones ya tomadas por el usuario: la integración, el orden, el ERP después de producción, no pagar Airtable sin cliente.

## Archivos autorizados

Lista cerrada. Tocar algo fuera de ella es un hallazgo bloqueante.

| Archivo | 10.1 | 10.2 | 10.3 |
|---|---|---|---|
| `docs/decisions/evaluacion-10.1-mvp.md` (nuevo) | crea | — | agrega la decisión |
| `docs/decisions/0014-*.md` (nuevo) | — | crea | — |
| `docs/decisions/0003-migracion-legado-proyecto-separado.md` (solo el estado y una nota) | — | edita | — |
| `docs/decisions/README.md` (índice) | — | edita | — |
| `docs/decisions/brief-10-evaluacion-del-mvp.md` (este) | resultados | resultados | resultados y cierre |
| `docs/product/Scope.md`, `docs/product/Vision.md`, `docs/product/FunctionalRequirements.md` (solo `FR-CONV-05`) | — | edita | — |
| `docs/architecture/IntegrationBoundaries.md`, `docs/architecture/TraceabilityMatrix.md` (solo `FR-CONV-05`) | — | edita | — |
| `docs/architecture/Overview.md` (solo la línea de APM), `docs/architecture/DataModel.md` y `docs/architecture/SecurityModel.md` (solo la condición de reapertura de la retención), `docs/product/NonFunctionalRequirements.md` (solo la retención) | edita, si la reevaluación cambia lo escrito | — | — |
| `docs/planning/Roadmap.md` | — | — | edita |
| `docs/planning/Risks.md` | edita | — | edita |
| `CLAUDE.md` (solo la frase de C-4) | — | **solo con D-4 aprobada** | — |
| `CHANGELOG.md`, `HANDOFF.md` | — | — | cierre |

## Fuentes de verdad

1. El código y las migraciones en `15c8faf` (= `967e357` en `src/` y `drizzle/`), y las corridas de CI citadas en el HANDOFF.
2. [Roadmap](../planning/Roadmap.md) §Definición de Terminado y §Criterios, **tal como están en `15c8faf`**, para 10.1.
3. `docs/decisions/` y los briefs cerrados de las Fases 1 a 9, para la evidencia de cada criterio.
4. Notion, solo para el estado de las tareas.
5. El documento de brechas del usuario (`b75e484`, repositorio del agente): contexto de negocio. Si contradice a una fuente de este repositorio, gana la de este repositorio y la discrepancia se anota.

## Dependencias

- Fase 9 cerrada: cumplido.
- La CI de `967e357` en `success` antes de citarla. Si queda en rojo, la evaluación se detiene: la Definición de Terminado incluye la guarda de CI.
- Las respuestas del usuario a D-1 a D-4 antes de abrir 10.1; D-5 antes de abrir 10.3; D-6 antes de cerrar 10.1; D-7 antes de cerrar 10.3.

## Decisiones pendientes

Cada una con una recomendación. Ninguna se toma sin el usuario.

- **D-1. Forma del brief y de Notion.** El proyecto usa un brief por subfase (`brief-X.Y-*.md`). Esta fase no tiene código y sus tres subfases comparten fuentes, así que se propone **un solo brief para la fase**, con criterios separados por subfase, y **crear 10.2 y 10.3 en Notion** junto a la 10.1 existente, actualizando la descripción de esta última. *Alternativa*: tres briefs. *Recomendación*: uno. Crear las tareas en Notion necesita tu autorización en el turno.
- **D-2. Base de la evaluación.** *Recomendación*: evaluar contra la Definición de Terminado **tal como está en `15c8faf`**, antes de cualquier enmienda, y registrar el piloto como **incumplido por decisión** (lo pide el propio criterio de aceptación de la Fase 10). *Alternativa descartada*: enmendar primero la Definición de Terminado; volvería autocomplaciente a la evaluación.
- **D-3. Forma de la enmienda de B-1.** *Recomendación*: un **ADR 0014 nuevo** que reemplaza parcialmente al 0003 —la migración deja de ser un proyecto aparte y pasa a ser la última fase de integración de este repositorio, por CSV— y enmiendas con fecha en los documentos de C-1 a C-5, conservando el texto anterior visible. *Alternativa*: editar el ADR 0003 en su lugar; se descarta porque un ADR aceptado no se reescribe.
- **D-4. `CLAUDE.md` (C-4).** *Recomendación*: cambiar **solo** la frase de independencia, para que diga que el CRM es independiente en código, infraestructura y base de datos y que el agente lo consume por una API de servicio versionada. **Ninguna prohibición cambia.** *Alternativa*: no tocarlo y confiar en el ADR 0014; el riesgo es que una sesión futura lea la frase y frene la integración.
- **D-5. Dirección del precio.** El HANDOFF lo registra como decisión del usuario, **interpretada**: «tabla de precios de solo inserción con el vigente derivado, el mismo patrón de `inventory_movements`», con moneda. *Recomendación*: confirmarlo acá como dirección de diseño y dejar el esquema para el brief de la fase de catálogo. Si la interpretación está mal, se corrige ahora, antes de que la fase siguiente la dé por buena.
- **D-6. Revisión independiente de la evidencia de la 9.3.** La 9.3 se cerró sin revisión y sus números (planes con veinte organizaciones, umbral de 916 ms, restauración en 5,08 s) van a citarse en la integración. *Recomendación*: sí, dentro de 10.1, con el subagente `independent-reviewer` de solo lectura contra el brief-9.3 y la evidencia-9.3. Es barata y es la única forma de que esos números dejen de ser autoevaluación.
- **D-7. Revisión independiente de 10.1.** La obligatoria es la de 10.3. *Recomendación*: hacer **una sola revisión al final, que cubra 10.1 a 10.3**, porque la evaluación es el insumo de la decisión y el autor de la evaluación es el mismo que implementó las nueve fases evaluadas.

## Resolución

Aprobado por el usuario el 2026-09-23 («apruebo el brief con las recomendaciones»). Las siete decisiones, por la recomendación:

- **D-1**: un solo brief para la fase; se crean 10.2 y 10.3 en Notion y se actualiza la descripción de la 10.1.
- **D-2**: la evaluación se hace contra la Definición de Terminado de `15c8faf`, antes de cualquier enmienda.
- **D-3**: ADR 0014 nuevo, que reemplaza parcialmente al 0003.
- **D-4**: se autoriza cambiar **solo** la frase de independencia de `CLAUDE.md`, en la 10.2. Ninguna prohibición cambia.
- **D-5**: **confirmada la dirección del precio**: tabla de precios de solo inserción, con moneda y el vigente derivado, el patrón de `inventory_movements`. El esquema se diseña en el brief de la fase de catálogo.
- **D-6**: revisión independiente de la evidencia de la 9.3 dentro de la 10.1. Lanzada el 2026-09-23.
- **D-7**: una sola revisión independiente al final, que cubre 10.1 a 10.3.

La aprobación del brief no autoriza commits, push ni operaciones en staging: se piden en su turno.

**Ampliaciones autorizadas durante la 10.1** (2026-09-23, por el usuario, a partir de la revisión independiente de la 9.3):

- **Lista de archivos**: se suman `brief-9.3`, `evidencia-9.3` y `TraceabilityMatrix.md` (fuera de la fila de `FR-CONV-05`), **solo** para agregar notas fechadas de corrección sin borrar texto. `deploy/staging/crm-backup.sh` **no** se suma: su comentario pasa a la primera fase de integración.
- **Una consulta de solo lectura en staging** (O-41). Autorizada por el usuario; bloqueada la primera vez por el clasificador de permisos de Claude Code, y ejecutada después de que el usuario agregara una regla acotada a `psql` en modo de solo lectura. Resultado: apagado.
- **El gate de la Fase 9**: el usuario estuvo de acuerdo en registrar, sin reabrir el cierre, que su criterio de las diez pantallas vale menos de lo que se dijo (evaluación, §6, R-18).

**Ampliación autorizada durante la 10.2** (2026-09-23, por el usuario, «autorizo los dos»): el `grep` de AC-10 encontró dos contradicciones con el ADR 0014 que no estaban en C-1 a C-6, en archivos fuera de la lista. Se paró y se reportó, como pide la condición de detención. Se suman a la lista, **solo** para enmiendas fechadas con el texto anterior visible:

- `README.md` de la raíz: el principio 6 («proyecto futuro separado») y la frase de «Qué es» sobre integrarse por un contrato de ingestión. Su sección «Estado», desactualizada desde la Fase 8, **no** se toca acá: se corrige al cerrar la 10.3, con el HANDOFF.
- `docs/decisions/0001-base-de-datos-propia-sin-airtable.md`: solo una nota fechada al final, sin reescribir la consecuencia que cita el «proyecto futuro de migración».

**Ampliación autorizada durante la 10.3** (2026-09-23, por el usuario, opción «a»): la [evaluación 10.1](evaluacion-10.1-mvp.md) §Traspaso manda reemplazar los rótulos provisionales «en todos los documentos que los usen», y siete de esos documentos no estaban en la lista de la 10.3. Inconsistencia interna de este brief, detectada antes de escribir, reportada y resuelta. Se suman `Overview.md`, `DataModel.md`, `SecurityModel.md`, `NonFunctionalRequirements.md`, `IntegrationBoundaries.md`, el ADR 0014 y `brief-9.3`, más la evaluación 10.1 fuera de su decisión, **solo** para agregar el número de fase junto al rótulo, sin reescribir el texto. Las entradas ya cerradas de `CHANGELOG.md` no se tocan: son historia.

**Segunda ampliación de la 10.3** (2026-09-23, por el usuario, a partir de la revisión independiente de la fase): se suman, **solo** para notas fechadas o números de fase, sin borrar texto: la evaluación 10.1 (correcciones de M-1, M-2, M-3 y m-5), `brief-9.3` (m-1), `docs/contracts/ingestion-v1.md` y `docs/development/TestingStrategy.md` (número junto a «proyecto de integración», m-3), `docs/README.md` (la frase de independencia, m-4), `docs/decisions/README.md` (índice, m-6) y el ADR 0003 (nota de la decisión, n-2). En la misma respuesta el usuario decidió que **los datos reales del primer negocio entran en la Fase 13**, no antes (M-1).

## Criterios de las reevaluaciones

Fijados antes de mirar, como manda la convención de la 8.4 (D-2) y la 8.5 (D-1).

- **APM y tracing** (8.4, D-6). Pregunta: ¿los logs con `request_id` alcanzan para diagnosticar una lectura lenta o fallida del agente, que depende del CRM **de forma sincrónica** en cada turno? Resultado posible: *no hace falta* (con el argumento), o *hace falta antes de producción*, asignado a la fase de producción con lo mínimo que debe cubrir. No se elige herramienta.
- **Protección de rama** (2.5, D-3). Dato nuevo que la motiva: de los nueve refs de la 9.3, cinco quedaron `cancelled` porque un push pisó al anterior, y uno se informó en verde por error. Resultado posible: seguir sin protección con la disciplina actual, pagar un plan que la ofrezca en repositorios privados, u otra compensación. **El costo lo decide el usuario**; la subfase presenta las opciones con su precio verificado el día de la evaluación, no de memoria.
- **Retención de `messages`** (9.2, D-2). Su condición de reapertura es «el primer tráfico real», que llega con la integración. Resultado posible: la política vigente (conservar indefinidamente) sigue hasta una subfase nombrada de la fase de producción, antes del primer mensaje real, o se decide ahora. Cualquier horizonte de borrado exige revisar el ADR 0013 y el trigger `messages_insert_only`, que rechaza `DELETE` para todo rol.

## Borrador del orden de las fases de integración

Es el insumo de 10.3, **no una decisión**. Lo fija el orden acordado con el usuario el 2026-09-23; los números de fase y la partición en subfases se deciden en 10.3.

1. **Lectura del agente**: catálogo comercial (B-8: precio con historial y moneda, marca, categoría, condición, búsqueda por palabras), información del negocio (B-9) y la API de servicio de solo lectura (lectura de B-2). Termina con el **piloto como subfase propia**, antes de que el primer cliente cargue sus datos.
2. **Contexto del turno**: cliente por teléfono con actor de servicio (B-3), conversación vigente (B-4), derivación (B-5), mensajes con tipo y autor (B-6, contrato v2) e historial de los últimos N (B-7).
3. **Producción** (B-11), con lo que 10.1 le asigne: reevaluaciones, disponibilidad, pendientes de la 9.1 y de la 9.3.
4. **Migración por CSV** (B-12).

El corte del agente ocurre en su propio repositorio. B-10 (memorias) no tiene lugar en el orden acordado y queda como pregunta asignada.

## Invariantes

- Ninguna prohibición de `CLAUDE.md` se relaja. La integración entra por la puerta que esas prohibiciones dejan abierta: una API del CRM que otro sistema consume.
- Ningún veredicto de 10.1 sube el nivel de una evidencia. «Validado en staging» no pasa a «preparado para producción» por figurar en un informe.
- Un criterio incumplido se escribe como incumplido, aunque la decisión del usuario lo vuelva irrelevante.
- Ninguna enmienda borra el texto anterior: se conserva visible, con fecha y referencia.
- Ninguna obligación abierta queda asignada a una fase sin llegar a una subfase, o sin la declaración explícita de que se acepta sin fase ([[An Obligation Assigned to Two Phases Is Assigned to None]]).

## Criterios de aceptación

### 10.1

- **AC-1.** Los seis criterios de la Definición de Terminado de `15c8faf` tienen veredicto, evidencia citada por ruta, commit o corrida, y nivel. El del piloto figura como **incumplido por decisión**, con la fecha y la referencia al gate enmendado.
- **AC-2.** El veredicto sobre «Todos los FR implementados y probados» enumera cada FR de `FunctionalRequirements.md` contra su fila de `TraceabilityMatrix.md`, y dice cuántos son. El recuento se obtiene contando, no copiado de otro documento.
- **AC-3.** La confirmación del usuario sobre el dolor de `Vision.md` está registrada con sus palabras o como «no confirmada». No se infiere.
- **AC-4.** Las tres reevaluaciones tienen resultado según su criterio de este brief. Las que no se deciden llevan subfase de destino y condición.
- **AC-5.** Si alguna reevaluación cambia lo escrito en `Overview.md`, `DataModel.md`, `SecurityModel.md`, `NonFunctionalRequirements.md` o `Risks.md`, esos documentos quedan coherentes con el resultado, y un `grep` de «9.4» y de «Fase 10» en `docs/` no deja ninguna obligación apuntando a algo que ya no va a ocurrir.
- **AC-6.** El inventario de obligaciones abiertas cubre, como mínimo: HANDOFF §3.2 (lo que deja la 9.3: plan genérico, dueño de la base), §3.3 (lo abierto de la 9.1: AC-2, AC-4, AC-6, `CREATEROLE`, `drizzle-kit` sin error, suite e2e contra staging), §6 «Pendientes» y las filas de `Risks.md` con fase límite en la 9 o la 10. Cada una tiene destino: fase de integración nombrada, «aceptada sin fase» con motivo, o «cerrada» con evidencia.
- **AC-7.** Si D-6 se aprueba, los hallazgos de la revisión de la 9.3 están registrados, cada uno verificado contra el código o la evidencia antes de aceptarse o descartarse, sin borrar lo que decía el cierre de la 9.3.

### 10.2

- **AC-8.** El ADR 0014 existe, está en el índice y registra: el agente como consumidor por API versionada; la API diseñada desde el modelo del CRM; la migración por CSV como fase de este repositorio; el CRM sin hablar con Airtable; el ERP posterior a la integración en producción.
- **AC-9.** El ADR 0003 figura como reemplazado parcialmente por el 0014, con su texto intacto.
- **AC-10.** `Scope.md`, `FR-CONV-05`, `IntegrationBoundaries.md`, `Vision.md` y la fila de `FR-CONV-05` en la matriz están enmendados con fecha y referencia al ADR 0014, con el texto anterior visible. Un `grep` de «proyecto futuro separado», «no conectado a tráfico real» y «ninguna integración» en `docs/` solo encuentra texto histórico marcado como tal.
- **AC-11.** Si D-4 se aprueba, `CLAUDE.md` cambió solo en la frase de C-4, y el diff lo muestra. Si no, C-4 queda registrado como riesgo aceptado.
- **AC-12.** Ninguna prohibición de `CLAUDE.md` cambió, y la guarda de referencias prohibidas sigue en verde sin modificarse.

### 10.3

- **AC-13.** El Roadmap tiene las fases de integración en el orden acordado, cada una con objetivo, alcance, brechas que cierra, gate de entrada y de salida.
- **AC-14.** El piloto figura como **subfase propia** de la primera fase de integración, después de catálogo e información del negocio y antes de la carga de datos del primer cliente. La condición de la Fase 9 se marca cumplida con la referencia.
- **AC-15.** Las seis preguntas abiertas de las brechas, B-10 y C-6 tienen subfase asignada.
- **AC-16.** §Criterios, §Fases futuras, §Camino crítico y §Decisiones del Roadmap están enmendados (C-2 y C-3), con el texto anterior visible.
- **AC-17.** La decisión del usuario está registrada con fecha en la evaluación y en el Roadmap, junto con la lista de criterios de la Definición de Terminado incumplidos.
- **AC-18.** La revisión independiente se hizo, sus hallazgos están verificados y registrados en este brief, y la fase no se cierra con hallazgos bloqueantes abiertos.

## Pruebas y evidencia requerida

- Esta fase no ejecuta tests. La evidencia que cita es la vigente: la CI de `967e357` (o del commit que cierre cada subfase), los briefs, las evidencias de la 9.1 a la 9.3 y las corridas del HANDOFF. **Evidencia vigente es la que sigue atada al artefacto actual**: como `src/` no cambió desde `c2edbb5`, las corridas de las subfases valen, y eso se comprueba con `git diff --name-only`, no se supone.
- Cada commit de la fase lleva su CI en verde, leída por `headSha` y `conclusion`, nunca por el rótulo de una tarea. Un `cancelled` no es un `success`.
- Los recuentos (FR, obligaciones, preguntas asignadas) se obtienen contando y se muestran cómo se contaron.

## Condiciones de detención

Parar y reportar, sin continuar, cuando:

- una evaluación, reevaluación o asignación **solo se pueda resolver midiendo o escribiendo código**;
- aparezca una **contradicción documental nueva** no listada en C-1 a C-6;
- una enmienda parezca exigir **relajar una prohibición** de `CLAUDE.md`;
- la CI del commit citado **no esté en `success`**;
- la revisión independiente informe un hallazgo **bloqueante**;
- antes de **cualquier** commit, push, cambio en Notion, edición de `CLAUDE.md` u operación en staging que no sea de lectura. Ninguna autorización anterior vale.

## Revisión independiente

Obligatoria en 10.3, que cierra el gate. Con el subagente `independent-reviewer`, de solo lectura, contra este brief, las reglas vigentes y los documentos enmendados. Informa hallazgos, no aprueba: cada uno se verifica antes de aceptarse, y nada de lo que diga sustituye la decisión del usuario. Alcance según D-7.

## Cierre de la 10.1 — 2026-09-23

Aprobado por el usuario. Resultado en la [evaluación 10.1](evaluacion-10.1-mvp.md). Todo es **autoevaluación**, salvo la revisión independiente de la 9.3; la revisión obligatoria de la fase (D-7) la cubre al cierre de la 10.3.

- **AC-1**: cinco de seis criterios de la Definición de Terminado cumplidos; el piloto, **incumplido por decisión**.
- **AC-2**: 29 de 29 requisitos con un caso de test concreto; solo 15 etiquetados en los tests.
- **AC-3**: confirmado por el usuario: «Sí, creo que resuelve el dolor».
- **AC-4**: APM y tracing, tres piezas mínimas antes de producción y sin herramienta ahora; protección de rama, decisión del usuario antes del primer despliegue a producción, con el dato que la motivaba corregido (los `cancelled` los produce `cancel-in-progress`); retención, sigue y se reabre en producción o ante un dato personal no sintético.
- **AC-5**: `Overview.md`, `DataModel.md`, `SecurityModel.md`, `NonFunctionalRequirements.md` y `Risks.md` coherentes con los resultados.
- **AC-6**: 42 obligaciones inventariadas, cada una con destino. Una no estaba en las fuentes del brief (O-38, secretos productivos), escrita dentro de una fila cerrada de Risks.
- **AC-7**: revisión independiente de la 9.3 con 22 hallazgos, 10 mayores, ninguno bloqueante; los de más peso verificados contra el código. Corrige números que la integración iba a citar y el valor del criterio de las diez pantallas con que se cerró el gate de la Fase 9.

**Lo que no se cerró acá y pasa a la 10.3**: reemplazar los rótulos provisionales por números de fase, corregir los números de la 9.3 en `Roadmap.md`, `CHANGELOG.md` y `HANDOFF.md` (O-42), y escribir la opción de decisión que el Roadmap no tiene.

## Cierre de la 10.2 — 2026-09-23

Aprobado por el usuario. Todo es **autoevaluación**; la revisión obligatoria de la fase (D-7) la cubre al cierre de la 10.3.

- **AC-8**: el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md) existe y está en el índice, con los cinco puntos del criterio.
- **AC-9**: el ADR 0003 figura como reemplazado parcialmente por el 0014, con su texto intacto y una nota fechada.
- **AC-10**: `Scope.md`, `FR-CONV-05`, `IntegrationBoundaries.md`, `Vision.md` y la fila de la matriz, enmendados con fecha y el texto anterior visible. El `grep` encontró dos contradicciones nuevas (`README.md` y el ADR 0001); se paró, se reportó y se enmendaron con la ampliación autorizada. Lo que el `grep` sigue encontrando está tachado, calificado como del MVP o es cita histórica, salvo `Roadmap.md:183`, que es de la 10.3.
- **AC-11**: `CLAUDE.md` cambió en una sola línea, la frase de C-4.
- **AC-12**: ninguna prohibición cambió; la guarda de referencias prohibidas, 10 de 10 en verde, sin modificarse.

**Lo que pasa a la 10.3**: `Roadmap.md:183` y el resto de C-2 y C-3, y la sección «Estado» de `README.md`, desactualizada desde la Fase 8.

## Resultados de la 10.3

### Cumplimiento del traspaso de la evaluación 10.1

Los rótulos quedan numerados en la tabla de [evaluación 10.1](evaluacion-10.1-mvp.md) §Destinos provisionales, y cada destino baja a una subfase del [Roadmap](../planning/Roadmap.md). *Esta tabla estaba primero en la evaluación; la revisión independiente (M-4) señaló que excedía la ampliación, que solo permitía agregar números allí, y se trasladó acá.*

| Subfase | Obligaciones y decisiones de esta evaluación | Preguntas de las brechas y hallazgos del brief |
|---|---|---|
| 11.0 | O-8, O-21, O-40; `cancel-in-progress` en `main` (R-2, a registrar); convención de etiquetar los FR (§2) | — |
| 11.1 | O-17 (con su condición) | — |
| 11.3 | R-1, piezas 1 y 2; O-22 y O-33 (comprobaciones de sus condiciones) | pregunta 5 (límite de 120/min); C-6 (nombre del emisor frente a la guarda) |
| 11.4 | O-10, O-36 | — |
| 12.1 | R-3: decidir si las pruebas usan datos personales reales, y adelantar la reapertura si los usan | — |
| 12.2 | — | preguntas 1 (derivación) y 2 (vencimiento de sesión) |
| 12.3 | O-34, O-35 | — |
| 12.4 | — | pregunta 3 (memorias, B-10) |
| 13.1 | O-3, O-4, O-6, O-7, O-27, O-29, O-31, O-38; R-2 (decisión del usuario antes del primer despliegue); O-9 si se reabre | — |
| 13.2 | O-2, O-39 | — |
| 13.3 | R-1, pieza 3 y la reevaluación de APM | pregunta 6 (disponibilidad) |
| 13.4 | R-3, O-11 | — |
| 14.1 | — | pregunta 4 (qué se migra) |

**Recuento**, contado fila por fila contra la evaluación, §5: las 5 de I-Lectura, las 2 de I-Turno y las 11 de I-Producción tienen subfase (18 de 18); las tres reevaluaciones también, en las piezas en que se dividieron; las seis preguntas y C-6, también. I-Migración no tenía obligaciones heredadas: solo la pregunta 4.

## Cierre de la 10.3 y de la Fase 10 — 2026-09-23

Aprobado por el usuario («sí», 2026-09-23), con la decisión de salida: continuar ampliando el alcance.

### Criterios de la 10.3

Autoevaluación, contrastada con la revisión independiente de la fase (abajo).

- **AC-13**: las Fases 11 a 14 en el [Roadmap](../planning/Roadmap.md), cada una con objetivo, alcance, brechas, subfases, entregables, criterios de aceptación y gates de entrada y salida.
- **AC-14**: el piloto es la **11.4**, después de la 11.1 (catálogo) y la 11.2 (información del negocio), y antes de la carga de los datos del primer negocio, que el usuario ubicó en la **13.5**. La condición de la Fase 9 figura cumplida, con la referencia.
- **AC-15**: las seis preguntas de las brechas en 11.3, 12.2 (dos), 12.4, 13.3 y 14.1; B-10 en la 12.4; C-6 en la 11.3.
- **AC-16**: §Criterios, §Fases futuras, §Camino crítico y §Decisiones enmendados, con el texto anterior tachado.
- **AC-17**: decisión del usuario del 2026-09-23, **continuar ampliando el alcance**, registrada en la [evaluación 10.1](evaluacion-10.1-mvp.md) §7 y en el Roadmap §Fase 10, con los criterios incumplidos a la vista.
- **AC-18**: revisión independiente hecha, hallazgos verificados y registrados abajo; ninguno bloqueante.

### Revisión independiente de la fase (D-7)

Hecha el 2026-09-23 con el subagente `independent-reviewer`, de solo lectura, contra este brief y las reglas vigentes, sobre la 10.1, la 10.2 y la 10.3. `self_assessment: false`. No pudo leer Git, la CI ni Notion. **23 hallazgos: 0 bloqueantes, 7 mayores, 11 menores, 5 notas.** Verificados antes de aceptarse:

| # | Qué | Verificación | Resolución |
|---|---|---|---|
| M-1 | Contradicción sobre cuándo entran los datos reales del primer negocio | confirmada: Roadmap §Fase 9, evaluación §4 y `Environments.md:17` | **el usuario decidió: Fase 13 (13.5)**; notas fechadas en Roadmap y evaluación |
| M-2 | «15 FR etiquetados en tests» es falso: son 8 | confirmada con `grep` en `tests/` | corrección en la evaluación §2, con un caso para 6 de los 7 restantes; FR-MET-03 solo indirecto |
| M-3 | Nueve hallazgos de la 9.3 aceptados sin verificar | confirmada por lectura | verificados: 5 confirmados, 1 de criterio, 3 no reproducidos y declarados así |
| M-4 | La tabla de subfases excedía la ampliación en la evaluación | confirmada | trasladada a este brief, §Resultados de la 10.3 |
| M-5 | La Fase 12 planifica escrituras que el ADR 0014 no prevé | confirmada: `0014:16` | registrada en el Roadmap como decisión previa de la 12.1, con ADR si es tercera superficie |
| M-6 | El importador de la Fase 14 choca con la prohibición de mappers de Airtable | confirmada por lectura de `CLAUDE.md` | registrado en el Roadmap: la 14.1 lo resuelve antes de diseñar o se detiene y eleva |
| M-7 | Filas de Risks con destinos vencidos | confirmada: filas de personas y de borrado real | notas fechadas |
| m-1 a m-11 | Rótulos sin número, «proyecto de integración», la frase de `docs/README.md`, O-1 en curso, índice de decisiones, CHANGELOG por subfase, protección de rama en dos lugares, tráfico real de la 13.5, campos faltantes de las Fases 11 a 14, filas de Risks | confirmadas | corregidas; las que estaban fuera de la lista, con la segunda ampliación. La m-7 se resuelve con una sola entrada de CHANGELOG que cubre las tres subfases, y queda dicho ahí |
| n-1 a n-4 | Corrección de O-42 en el CHANGELOG, frase en futuro del ADR 0003, subfase que cierra el gate de la Fase 12, dependencia de la 11.0 | confirmadas | corregidas (la 12.5 es nueva) |
| n-5 | Numeración de las seis preguntas | verificada contra el documento de brechas, §7 | coincide; sin cambio |

**Recuento**: 7 + 11 + 5 = 23. Ninguno quedó abierto. Esta revisión es **una sola pasada**: no garantiza que no quede otro defecto.
