# 0017 — Responder desde el CRM

- Estado: **propuesta** (subfase 16.5, [brief-16.5](brief-16.5-adr-responder-desde-el-crm.md), aprobado el 2026-10-08). Pasa a aceptada o rechazada con la decisión del usuario, después de la respuesta del agente a las preguntas de §Pendientes de confirmar.
- Fecha: 2026-10-08

## Contexto

Una persona del negocio necesita contestarle a un cliente cuando el agente no puede o no debe: un reclamo, una derivación (`pending`) o una conversación que pausó (16.3). Hoy lo hace desde la app de WhatsApp del teléfono, y esa respuesta **no llega al CRM**: el historial que el agente lee en el turno siguiente no la tiene, y la pantalla 9 tampoco. Es el riesgo que el [Roadmap](../planning/Roadmap.md) §Fase 16 dejó escrito.

Hay dos problemas distintos:

1. **Que lo que contesta una persona quede en el CRM**, conteste desde donde conteste.
2. **Que la persona pueda escribir y enviar la respuesta desde el CRM**, en la pantalla 9.

Las reglas vigentes que acotan la solución:

- el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md), punto 1: el agente llama al CRM y **el CRM nunca llama al agente**;
- el mismo ADR, punto 5: **el CRM no produce efectos externos** y no envía mensajes de WhatsApp. Enviar es responsabilidad del agente. Lo repiten [Scope](../product/Scope.md) §Sigue fuera e [IntegrationBoundaries](../architecture/IntegrationBoundaries.md);
- IntegrationBoundaries dice qué exigiría que **el CRM** enviara, «si algún día lo hiciera»: un registro durable, un **sesgo de entrega decidido explícitamente** y la ventana de 24 h de la API oficial. Este ADR no hace que el CRM envíe, pero el sesgo y la ventana valen igual para una respuesta escrita en el CRM;
- la ventana de 24 h: fuera de ella, la API oficial de Meta solo admite plantillas aprobadas. Fuente: la nota *WhatsApp Automated Messaging — Official Cloud API vs Unofficial Multi-Device Linking* del vault, y el uso de la API oficial por el agente desde el 2026-10-02 (HANDOFF). Nivel: **documentado**, no medido en este proyecto.

Lo que ya existe:

- la ingestión v2 registra una salida con `message.sent_by = "person"` ([ingestion-v2](../contracts/ingestion-v2.md) §`message`). Nadie la usa todavía;
- la pausa por conversación (16.3), que el agente lee en cada turno y respeta, de mejor esfuerzo: si la lectura falla contesta igual, y su mensaje de emergencia no la mira. Nivel: **validado en integración** en la ventana 16.3.3, con los límites **informados por el agente** ([brief-16.3](brief-16.3-pausar-y-reanudar-al-agente.md), §Resultados 16.3.3);
- las notas internas (16.4), que no salen al cliente.

## Decisión

### 1. El registro de lo que una persona contesta fuera del CRM

**Lo registra el agente, por la ingestión v2 que ya existe.** Si el número del negocio está dado de alta en la app de WhatsApp Business y en la API oficial a la vez (coexistencia), lo que la persona contesta desde la app le llega al webhook del número. El agente lo manda al CRM como un `message.recorded` saliente con `sent_by = "person"`, con sus propias referencias, como cualquier otro mensaje.

- El CRM **no cambia**: ni contrato, ni tabla, ni pantalla. La pantalla 9 ya muestra quién respondió ([brief-12.3](brief-12.3-contrato-de-ingestion-v2.md), D-5).
- **Condicionado a P-1 y P-2.** Si el número del agente no puede estar en coexistencia, o no recibe esas respuestas, este punto no se aplica y el riesgo sigue escrito como hoy. Ver §Consecuencias.

### 2. Escribir y enviar desde el CRM: una bandeja de salida que el agente toma

1. **El CRM guarda la respuesta como pendiente de envío**, en una tabla propia de la conversación, con su autor y su hora. No la guarda en `messages`: un mensaje es lo que efectivamente salió, y todavía no salió. **El texto vive solo en esa tabla**: la auditoría guarda el id de la pendiente, no el texto, como `note_added` en la 16.4, porque el vaciado no alcanza las entradas de auditoría de una conversación ([ADR 0015](0015-vaciado-de-una-sola-direccion-en-tablas-de-solo-insercion.md)).
2. **El agente lista las pendientes** por una ruta nueva de la API de lectura. Listar **no cambia nada**: la lectura sigue siendo de solo lectura ([read-v1](../contracts/read-v1.md) §Propósito), y reintentarla es seguro.
3. **El agente toma una pendiente por la ingestión**, con un tipo de evento nuevo. La primera toma gana; otra toma de la misma pendiente se rechaza, así que dos instancias del agente no la mandan las dos. Tomarla es lo que la saca de la lista.
4. **El agente la envía por la API de Meta y confirma el resultado por la ingestión**, con dos tipos de evento nuevos:
   - enviada: registra el mensaje saliente con `sent_by = "person"` y resuelve la pendiente. El mensaje entra en `messages`;
   - rechazada: la referencia de la pendiente y un motivo de una lista cerrada, por ejemplo la ventana vencida. La pantalla lo muestra.

   Los tres son tipos de evento nuevos, no campos nuevos en `message.recorded`: agregar un `event_type` es compatible dentro de la ingestión v2, y agregar un campo exigiría v3 ([ingestion-v2](../contracts/ingestion-v2.md) §Versionado). *Decidido por el usuario el 2026-10-08, con la recomendación* (revisión independiente, R-1 y R-2).
5. **El agente consulta la bandeja periódicamente**, no solo cuando el cliente escribe: una respuesta de una persona no espera al próximo mensaje del cliente. La frecuencia la decide el agente (P-3).

Así el CRM no llama a nadie y no envía nada: **respeta los puntos 1 y 5 del ADR 0014 sin enmendarlos.** Usa las dos superficies que el ADR ya abrió sin cambiar su naturaleza: la lectura solo lee, y todo lo que cambia una pendiente entra por la ingestión. Los contratos nuevos se diseñan desde el modelo del CRM.

### 3. El sesgo de entrega: a lo sumo una vez

*Decidido por el usuario el 2026-10-08, con la recomendación* (revisión independiente, R-3: el brief no fijaba el sesgo).

- Una pendiente tomada que no se confirma en un plazo **no se vuelve a ofrecer sola**. La pantalla la muestra como «puede haber salido», no como fallida.
- **Una confirmación tardía se acepta siempre** y resuelve la pendiente, enviada o rechazada. El caso más probable de una pendiente sin confirmar es que el agente ya la mandó y la ingestión no respondió: el agente retiene ese evento y lo reenvía idéntico ([ingestion-v2](../contracts/ingestion-v2.md), guía para el emisor). Rechazarlo haría perder el registro de algo que pasó.
- Si la persona quiere, la escribe de nuevo. Para saber si salió, el CRM no alcanza: solo el chat de WhatsApp lo muestra, en la app si se cumplen P-1 y P-2.

El motivo: el CRM no puede saber si el agente la mandó antes de caerse. Reofrecerla sola puede hacerle llegar dos veces el mismo mensaje al cliente, y eso lo ve el cliente. Una respuesta que no salió la ve la persona, que puede repetirla. Del lado del agente, no reenviar una pendiente ya enviada es su responsabilidad, con su propio registro (patrón *Reliable External Effects* del vault, como contexto). El plazo se fija en la implementación.

### 4. Solo con el agente pausado

El formulario para escribir solo se ofrece con la conversación pausada (16.3), y el servicio rechaza una respuesta en una conversación activa. Así se reduce que el cliente reciba dos voces a la vez. No lo garantiza: la pausa es de mejor esfuerzo (§Contexto). Pausar no es automático: es una decisión visible de la persona, como hoy.

### 5. Solo texto, dentro de la ventana de 24 h

- La primera implementación manda **solo texto libre**, sin adjuntos ni plantillas.
- El CRM **no ofrece el envío** si el último mensaje entrante registrado tiene más de 24 h, y lo dice. Es una aproximación: decide Meta, y un mensaje del cliente que no llegó al CRM la corre.
- Si Meta lo rechaza igual, el agente lo confirma como rechazado (punto 2.4), y la pantalla lo muestra.

### 6. Hasta que el punto 2 esté implementado

La persona contesta desde la app de WhatsApp, como hoy, y el punto 1 la registra si se cumplen P-1 y P-2.

## Pendientes de confirmar

Este ADR afirma cosas que solo el agente puede confirmar. Cada una figura con su fuente y su nivel.

- **P-1. El número del agente puede estar en coexistencia** con la app de WhatsApp Business. Fuente: documentación de dos proveedores de la API, [360dialog](https://docs.360dialog.com/partner/waba-management/phone-number-and-hosting/whatsapp-coexistence/coexistence-webhooks) y [Telnyx](https://developers.telnyx.com/docs/messaging/whatsapp/coexistence/webhooks), leída el 2026-10-08. Nivel: **documentado por terceros**, no por Meta ni probado con ese número. **Pendiente.**
- **P-2. El agente recibe las respuestas hechas desde la app**, como eventos `smb_message_echoes` en el webhook del número, según las mismas fuentes. Nivel: **documentado por terceros. Pendiente.**
- **P-3. El agente puede consultar la bandeja periódicamente**, sin un mensaje del cliente que lo dispare, y con qué frecuencia. Nivel: **pendiente.**
- **P-4. El agente puede tomar una pendiente y confirmar su envío o su rechazo por la ingestión**, con la referencia de la pendiente, y distinguir un rechazo por la ventana. Nivel: **pendiente.**

Si P-3 o P-4 no se cumplen, el punto 2 no se acepta como está, y este ADR vuelve a decidir entre las alternativas de abajo o quedarse en el punto 6.

## Alternativas descartadas

- **Para el registro: que una persona cargue a mano en el CRM lo que contestó desde la app.** Depende de que se acuerde, duplica el trabajo y deja el texto escrito dos veces, con diferencias. Si P-1 o P-2 no se cumplen, sigue siendo peor que escribir desde el CRM (punto 2).
- **El CRM envía directo por la API de Meta.** Enmienda el punto 5 del ADR 0014, Scope e IntegrationBoundaries. El CRM guardaría el token de Meta del negocio y tendría que llevar el registro de envíos, los reintentos, la ventana y las plantillas. Además habría dos emisores para el mismo número, el CRM y el agente, sin que ninguno vea lo que manda el otro antes de registrarlo.
- **El CRM avisa al agente con un webhook saliente.** Enmienda el punto 1 del ADR 0014 e invierte la dependencia, que es lo que ese ADR descartó con «Que el CRM empuje datos al agente». El sondeo del punto 2 tiene más demora, pero mantiene al CRM sin efectos externos.
- **Guardar la respuesta pendiente en `messages`.** `messages` registra lo que salió y es de solo inserción ([ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)): una pendiente que se rechaza quedaría como un mensaje que nunca existió, sin poder corregirse.
- **Pausar al agente automáticamente al escribir.** Ocultaría una decisión que la persona tiene que ver. Si la olvida reanudar, el agente queda callado en esa conversación sin que nadie lo haya decidido.
- **No escribir nunca desde el CRM y depender solo de la app.** Deja el registro atado a P-1 y P-2. Si no se cumplen, el riesgo no tiene salida.

## Consecuencias

- **Ninguna prohibición de `CLAUDE.md` cambia**, ni los puntos 1 y 5 del ADR 0014, ni Scope §Sigue fuera («Que el CRM envíe mensajes o produzca efectos externos»). Al aceptarse, el ADR 0014 suma una nota fechada, como las de la 12.1, la 12.2 y la 16.2.
- **El punto 1 no tiene trabajo en el CRM.** Es trabajo del agente, en su repositorio, si se cumplen P-1 y P-2. Se valida en integración conciliando una respuesta hecha desde la app con su fila en `messages`.
- **El punto 2 es una subfase nueva**, con su brief, que diseña:
  - la tabla de pendientes y su borrado en el pedido de un cliente. Una pendiente cambia de estado, así que no es de solo inserción, y el mecanismo del ADR 0015 no se le aplica tal cual;
  - la ruta de lectura que lista las pendientes, sin efectos;
  - los tres tipos de evento de la ingestión v2: tomar, enviada y rechazada;
  - el formulario de la pantalla 9;
  - qué rol escribe: se propone `admin`, el mismo que pausa;
  - qué pasa con una pendiente sin enviar si la persona reanuda al agente o cierra la conversación: se cancela, o el agente no la envía si la conversación ya no está pausada;
  - el aislamiento por organización de la bandeja, y a qué emisor se asigna una pendiente si la organización tiene más de uno;
  - con qué credencial y alcance se lee la bandeja, con la regla de una credencial, un alcance.

  Cambia contratos con el agente, así que lleva revisión independiente y trabajo coordinado en su repositorio.
- **La demora de una respuesta escrita en el CRM depende del sondeo del agente**, no del CRM. Si el agente o la ingestión están caídos, la pantalla distingue una pendiente sin tomar de una tomada sin confirmar.
- **IntegrationBoundaries, Risks y el Roadmap** cambian al aceptarse: el riesgo de las respuestas por fuera del CRM queda con su salida, la regla «el CRM no produce efectos externos» sigue igual, y el Roadmap suma la subfase del punto 2, sin número ni orden fijos.

## Lo que este ADR no decide

- Adjuntos, plantillas y mensajes fuera de la ventana.
- Respuestas de varias personas a la vez en la misma conversación.
- El orden de la subfase del punto 2 frente al resto del Roadmap: lo decide el usuario al abrirla.
