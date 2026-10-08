---
schema: task-brief.v1
task_id: "16.5"
task_type: design
generated_at: 2026-10-08
---

# Brief 16.5 — ADR: responder desde el CRM

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `design`. El resultado es un ADR y las enmiendas que él ordene. No hay código, migraciones ni cambios de contrato.
- **Nivel de evidencia objetivo**: ninguno de ejecución. Lo que se afirme de Meta o del agente se declara con su fuente y su nivel: «documentado por terceros», «confirmado por el agente» o «pendiente».
- **Nivel de validación alcanzable**: diseñado.
- **Orden**: quinta subfase de la Fase 16 ([Roadmap](../planning/Roadmap.md) §Fase 16), después de la 16.4. Elegida por el usuario el 2026-10-08.
- **Estado**: **aprobado por el usuario el 2026-10-08**, con las recomendaciones de D-1 a D-9. La tarea 16.5 estuvo en «En proceso» en Notion desde ese día. **Cerrado el 2026-10-08** (§Cierre).

## Objetivo

Decidir, con un ADR, cómo una respuesta escrita por una persona del negocio llega al cliente por WhatsApp **y queda en el CRM**, o decidir que el CRM no la escribe. El candidato del Roadmap fija la pregunta y el riesgo:

> cómo llega a WhatsApp una respuesta escrita en el CRM sin que el CRM llame al agente, o si el ADR 0014 se enmienda con decisión del usuario.

> Riesgo: que el dueño conteste desde la app de WhatsApp, por fuera de la API, y esa respuesta no quede en el CRM.

## Lo que se verificó antes de escribir este brief

Contraste con las reglas vigentes, releídas el 2026-10-08:

- **ADR 0014, punto 1**: la dependencia es unidireccional, el agente llama al CRM y «el CRM nunca llama al agente».
- **ADR 0014, punto 5**: «El CRM sigue sin producir efectos externos: no envía mensajes de WhatsApp ni llama a ningún servicio del agente. Enviar es responsabilidad del agente.» Lo repiten [Scope](../product/Scope.md) §Sigue fuera («Que el CRM envíe mensajes o produzca efectos externos») e [IntegrationBoundaries](../architecture/IntegrationBoundaries.md) §Reglas, que agrega qué exigiría hacerlo: ledger, sesgo de entrega decidido y la ventana de 24 h con plantillas de la API oficial.
- **`CLAUDE.md`** prohíbe webhooks salientes y polling **hacia Airtable**. No prohíbe en general que el agente consulte al CRM: es lo que ya hace en cada turno.
- **Lo que ya existe**:
  - la ingestión v2 acepta una salida con `message.sent_by = "person"` ([ingestion-v2](../contracts/ingestion-v2.md) §`message`). El CRM ya sabe registrar una respuesta de una persona; nadie la manda todavía;
  - la pausa de la 16.3: el agente no contesta en una conversación pausada, de mejor esfuerzo;
  - el estado `pending`, «espera a una persona», que pone el agente al derivar;
  - las notas de la 16.4, que no salen al cliente.
- **El agente usa la API oficial de Meta** desde su subfase C (2026-10-02, HANDOFF). Fuera de la ventana de 24 h desde el último mensaje del cliente, solo se pueden mandar plantillas aprobadas.
- **La coexistencia de la app de WhatsApp Business con la API oficial** (H-1): según la documentación de dos proveedores, 360dialog y Telnyx, un número dado de alta en las dos puede contestar desde la app. Meta manda esas respuestas al webhook del número como eventos `smb_message_echoes`. **Es documentación de terceros, no de Meta, y no se probó con el número del agente.** Si se confirma, el riesgo del Roadmap tiene una salida que no toca el CRM.

### Hallazgos

- **H-1. El riesgo y la función son dos problemas distintos.** «Que la respuesta quede en el CRM» se resuelve sin escribir en el CRM: el agente registra lo que la persona contestó desde la app. «Escribir la respuesta en el CRM» exige además una vía de envío. El ADR los decide por separado (D-1).
- **H-2. Cualquier envío desde la pantalla del CRM sin enmendar el ADR 0014 pasa por el agente.** El CRM guarda la respuesta y el agente la retira, la manda y confirma (D-2, opción A). Respeta la dirección. Su costo es que el agente tiene que consultar sin que el cliente haya escrito: un sondeo periódico, no solo al empezar un turno.

## Decisiones

Cada una lleva una recomendación. El usuario aprueba, cambia o rechaza.

### D-1 — Qué resuelve el ADR

- **Opción 1**: solo el registro de lo que la persona contesta por fuera del CRM.
- **Opción 2**: solo escribir y enviar desde el CRM.
- **Opción 3**: las dos cosas, como decisiones separadas del mismo ADR, cada una con su propio camino de implementación.

**Recomendación**: opción 3. El registro cierra el riesgo que el Roadmap ya escribió y es lo más barato; escribir desde el CRM es la función que dibuja el boceto. Mezclarlas obliga a implementar la cara para resolver la barata.

### D-2 — Cómo llega a WhatsApp una respuesta escrita en el CRM

- **A. Bandeja de salida que el agente retira.** El CRM guarda la respuesta como pendiente de envío. El agente la lee por la API de lectura, la manda por Meta y confirma el resultado por la ingestión: enviada, como `message.recorded` con `sent_by = "person"`, o rechazada, con el motivo. Respeta el ADR 0014 completo: el CRM no llama a nadie y no envía. Exige un contrato nuevo, de lectura y de ingestión, y un sondeo del agente.
- **B. El CRM envía directo por la API de Meta.** Enmienda el punto 5 del ADR 0014, Scope e IntegrationBoundaries. El CRM guarda el token de Meta y necesita ledger, reintentos, la ventana de 24 h y plantillas. Hay dos emisores para el mismo número.
- **C. El CRM avisa al agente con un webhook saliente.** Enmienda el punto 1 del ADR 0014. Invierte la dependencia que el ADR descartó a propósito («Que el CRM empuje datos al agente»).
- **D. No se escribe en el CRM.** La persona contesta desde la app de WhatsApp Business, en coexistencia, y el agente registra esas respuestas (D-3).

**Recomendación**: A como diseño para escribir desde el CRM, y D como la práctica hasta que A se implemente. B y C quedan como alternativas descartadas en el ADR, con sus motivos: B convierte al CRM en emisor con secretos de Meta y duplica el emisor; C invierte la dependencia.

### D-3 — El registro de lo que la persona contesta desde la app

El agente, si recibe los ecos de la coexistencia, los manda por la ingestión v2 que ya existe, como salidas con `sent_by = "person"`. El CRM no cambia.

**Recomendación**: el ADR lo adopta como **condicionado a H-1**. Se pide al agente que confirme si su número puede estar en coexistencia y si recibe los ecos (D-6). Si no puede, el riesgo queda escrito como hoy y A es la única salida.

### D-4 — Respuesta escrita en el CRM y agente activo

Si una persona escribe desde el CRM con el agente activo, el cliente puede recibir dos voces.

**Recomendación**: con A, escribir desde el CRM exige la conversación pausada (16.3). El formulario no se ofrece sin la pausa, y el servicio lo rechaza. Pausar no es automático: es una decisión visible de la persona, como ya es hoy.

### D-5 — La ventana de 24 h

**Recomendación**: la primera implementación de A manda solo texto libre dentro de la ventana. Fuera de ella, el CRM no ofrece el envío y lo dice; las plantillas quedan fuera. Si Meta rechaza igual, por ejemplo con `131047`, el agente lo confirma como rechazado y la pantalla lo muestra. El CRM calcula la ventana con el último mensaje entrante que tiene registrado, y se declara que es una aproximación: Meta decide.

### D-6 — Coordinación con el agente

El ADR afirma cosas que solo el agente puede confirmar: si puede sondear la bandeja, con qué frecuencia, y si su número admite coexistencia y le llegan los ecos.

**Recomendación**: el ADR se escribe como **propuesto**, con esas afirmaciones marcadas como pendientes. Con tu autorización, preparo un pedido al agente con las preguntas, en el Escritorio como en las subfases anteriores. El ADR pasa a **aceptado** con tu decisión, después de su respuesta. Si el agente no puede sondear, A no se acepta como está, y el ADR vuelve a decidir entre B, C o quedarse en D.

### D-7 — Qué cambia en otros documentos cuando el ADR se acepta

**Recomendación**:
- el ADR 0014 suma una nota fechada, como las de la 12.1, la 12.2 y la 16.2, porque A usa la misma superficie de lectura y de ingestión y no cambia su decisión. Si el usuario eligiera B o C, sería una enmienda del ADR 0014, con el texto anterior conservado;
- IntegrationBoundaries y Risks: el riesgo de las respuestas por fuera del CRM, con la salida elegida;
- el Roadmap: la implementación como subfases nuevas, sin número ni orden fijos hasta que el usuario las abra.

### D-8 — Revisión independiente

El ADR fija una frontera de arquitectura con el agente.

**Recomendación**: sí, antes de pedirte la aceptación, con un agente de solo lectura contra este brief, el ADR 0014, Scope e IntegrationBoundaries.

### D-9 — Cuándo cierra

**Recomendación**: cuando el ADR está aceptado o rechazado por el usuario y las enmiendas de D-7 están escritas. Si la respuesta del agente tarda, la subfase puede cerrar con el ADR propuesto y la pregunta abierta, por decisión del usuario.

## Alcance incluido

- `docs/decisions/0017-responder-desde-el-crm.md`, nuevo;
- este brief;
- con el ADR aceptado:
  - `docs/decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md`: la nota fechada;
  - `docs/architecture/IntegrationBoundaries.md`;
  - `docs/planning/Risks.md`;
  - `docs/planning/Roadmap.md`;
- el pedido al agente, fuera del repositorio, en el Escritorio, con autorización;
- en el cierre: `CHANGELOG.md`, `HANDOFF.md` y `docs/decisions/README.md`.

## Alcance excluido

- **Código, migraciones, contratos y fixtures.** La implementación de A, si se acepta, es otra subfase con su brief.
- **El campo para escribir en la pantalla 9.** No se dibuja antes de que el ADR esté aceptado (Roadmap §Fase 16).
- **Plantillas de Meta** y mensajes fuera de la ventana.
- **Cambios en el agente.** Los hace él, en su repositorio y con sus briefs.
- **Leer el repositorio del agente como dependencia técnica.** Solo contexto de negocio, según `CLAUDE.md`.

## Fuentes de verdad

- El ADR 0014, Scope e IntegrationBoundaries.
- Los contratos `ingestion-v2` y `read-v1`.
- Los briefs de la 16.3 y la 16.4.
- El Roadmap §Fase 16.

## Invariantes

1. **Ninguna prohibición de `CLAUDE.md` cambia.**
2. **El ADR no enmienda el ADR 0014 sin decisión explícita del usuario.**
3. **Toda afirmación sobre Meta o sobre el agente lleva su fuente y su nivel.** Ninguna se presenta como verificada si no lo está.

## Criterios de aceptación

- **AC-1**: el ADR 0017 responde por separado las dos preguntas de D-1, con la decisión, las alternativas descartadas y sus motivos, y las consecuencias.
- **AC-2**: el ADR dice explícitamente si respeta o enmienda los puntos 1 y 5 del ADR 0014, y Scope §Sigue fuera.
- **AC-3**: cada afirmación sobre Meta o sobre el agente lleva su fuente y su nivel. H-1 figura como pendiente hasta que el agente lo confirme.
- **AC-4**: el ADR trata la pausa (D-4), la ventana de 24 h (D-5) y qué pasa cuando Meta rechaza un envío.
- **AC-5**: hay revisión independiente del ADR antes de pedir la aceptación, con cada hallazgo verificado.
- **AC-6**: con el ADR aceptado, las enmiendas de D-7 están escritas y no se contradicen con el ADR.
- **AC-7**: el usuario acepta o rechaza el ADR, o decide cerrar con el ADR propuesto (D-9).

## Pruebas y evidencia requerida

No hay ejecución. La evidencia es documental: el ADR, la revisión independiente con sus hallazgos verificados y, si llega, la respuesta del agente.

## Condiciones de detención

Detenerse y avisar si pasa algo de esto:

- el ADR necesita enmendar el ADR 0014 o una prohibición de `CLAUDE.md` sin una decisión del usuario;
- hace falta tocar código, un contrato o un archivo fuera de la lista;
- la respuesta del agente contradice una premisa del ADR.

También hay que pedir autorización explícita en su turno **antes de**:

- pasar la tarea 16.5 a «En proceso» en Notion;
- mandar el pedido al agente;
- cada commit y push;
- el cierre.

## Resultados

### El ADR propuesto

`docs/decisions/0017-responder-desde-el-crm.md`, escrito el 2026-10-08 como **propuesto**. Nivel: diseñado.

### Revisión independiente (D-8, AC-5)

La hizo un agente que no participó del trabajo, con acceso de solo lectura, el 2026-10-08. Fijó la escala antes de mirar. Cada hallazgo se verificó contra los documentos citados.

- **R-1**, bloqueante: el ADR reservaba la pendiente al leerla, y la lectura es de solo lectura (ADR 0014, punto 1; read-v1: «**Solo lectura**: ninguna ruta de este contrato cambia nada»). **Confirmado.** Era una condición de detención. **Decisión del usuario del 2026-10-08, con la recomendación**: la lectura solo lista, y el agente toma la pendiente por la ingestión.
- **R-2**, medio: una referencia nueva en `message.recorded` exigía ingestión v3 (ingestion-v2 §Versionado). **Confirmado y corregido** con la decisión de R-1: tomar, enviada y rechazada son tres tipos de evento nuevos, compatibles dentro de v2.
- **R-3**, medio: el sesgo de entrega era una decisión nueva, fuera de D-1 a D-9, y no cubría una confirmación tardía. **Confirmado. Decisión del usuario del 2026-10-08, con la recomendación**: a lo sumo una vez. Una pendiente sin confirmar se muestra como «puede haber salido», y una confirmación tardía se acepta siempre.
- **R-4**, medio: la auditoría de la pendiente podía guardar el texto, que el vaciado no alcanza en las entradas de una conversación (ADR 0015). **Confirmado y corregido**: el texto vive solo en la tabla, y la auditoría guarda el id.
- **R-5**, medio: afirmaciones sobre Meta y sobre la pausa sin fuente ni nivel. **Confirmado y corregido.**
- **R-6**, medio: faltaban decisiones para la implementación: rol, reanudar o cerrar con una pendiente, aislamiento, emisor y credencial. **Confirmado**: quedan listadas como lo que decide el brief de la implementación.
- **R-7**, bajo: «no recibe dos voces» exageraba, porque la pausa es de mejor esfuerzo. **Confirmado y corregido.**
- **R-8**, bajo: Scope §Sigue fuera no figuraba explícito (AC-2). **Confirmado y corregido.**
- **R-9**, bajo: faltaban el Roadmap entre las enmiendas (D-7) y una alternativa descartada para el registro (AC-1). **Confirmado y corregido.**
- **R-10**, nota: la cita de IntegrationBoundaries omitía su condición, «si algún día lo hiciera». **Confirmado y corregido.** `.claude/settings.json` no entra en ningún commit.

Las correcciones son autoevaluación: el revisor no las vio.

### La respuesta del agente (D-6)

Pedido entregado el 2026-10-08 por el usuario, en su Escritorio; respuesta del agente del mismo día. Lo que contestó está en el ADR, §Lo que confirmó el agente:

- **P-1**: el número de producción es el número de prueba de Meta, que no puede estar en coexistencia. Con un número real, la da de alta un Solution Partner o un Tech Provider, y el agente no es ninguno de los dos.
- **P-2**: los ecos los documenta Meta; sin probar, porque depende de P-1.
- **P-3**: puede consultar la bandeja una vez por minuto.
- **P-4**: puede tomar, confirmar y rechazar, si la toma responde en el momento y una toma repetida se distingue de un error. Propone una lista de motivos de rechazo.

Ninguna respuesta contradice una premisa del ADR (condición de detención): P-1 la deja sin aplicar, como el ADR preveía.

### La decisión del usuario (AC-7)

El 2026-10-08 el usuario **aceptó el ADR 0017 y pospuso su implementación**: la bandeja se abre como subfase con un negocio real atendido, y el registro desde la app espera a que el número real esté en coexistencia. Las enmiendas de D-7 están escritas: la nota en el ADR 0014, IntegrationBoundaries, una fila en Risks y el Roadmap (AC-6).

## Cierre

Cerrada el 2026-10-08 por el usuario.

- **Criterios**: AC-1 a AC-7 cumplidos.
- **Nivel**: diseñado. No hay código ni ejecución.
- **Decisiones del usuario**: el brief con D-1 a D-9; R-1, la toma por la ingestión; R-3, a lo sumo una vez; el pedido al agente; aceptar el ADR y posponer su implementación; y el cierre.
- **Revisión**: independiente para el ADR propuesto. Las correcciones y la actualización con la respuesta del agente, autoevaluación declarada.
- **Notion**: la tarea 16.5 en «Completado».
