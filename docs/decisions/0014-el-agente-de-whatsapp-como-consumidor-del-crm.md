# 0014 — El agente de WhatsApp como consumidor del CRM

- Estado: aceptada (decisión del usuario del 2026-09-23, registrada en la subfase 10.2). **Reemplaza parcialmente al [ADR 0003](0003-migracion-legado-proyecto-separado.md)**: la migración deja de ser un proyecto aparte.
- Fecha: 2026-09-23
- *Nota del 2026-09-25 ([brief-12.1](brief-12.1-actor-de-servicio-y-cliente-por-telefono.md), D-1)*: por el contrato de ingestión también se resuelve el cliente de un teléfono (`client.resolved`), no solo se registran conversaciones y mensajes. Es la misma superficie de escritura: la decisión no cambia y no hay una tercera superficie.
- *Nota del 2026-09-25 ([brief-12.2](brief-12.2-conversacion-vigente-y-derivacion.md), D-1 y D-6)*: por la misma superficie, el emisor registra el mensaje entrante en la conversación vigente del cliente (`conversation.resolved`, con la regla de vigencia del CRM) y **deriva una conversación a una persona** (`conversation.escalated`), un cambio de estado de `open` a `pending` auditado con la credencial como actor. Es el único cambio de estado por servicio: no cierra ni reabre. La decisión no cambia.

## Contexto

El MVP del CRM se evaluó en la subfase 10.1 ([evaluación](evaluacion-10.1-mvp.md)): cinco de seis criterios de la Definición de Terminado cumplidos, el piloto incumplido por decisión, y el usuario confirmó que el backoffice resuelve el dolor descrito en [Vision.md](../product/Vision.md).

Del otro lado, el agente de WhatsApp está pausado. Su persistencia es Airtable, cuya cuota mensual de API se agotó el 2026-09-16; desde entonces cada mensaje terminaba en el mensaje de emergencia, y el usuario decidió no pagar Airtable mientras no haya un cliente real que atender. Un análisis de brechas del usuario, leído como contexto de negocio, enumera lo que el agente necesita de un sistema de registro y lo que el CRM no tiene todavía (precio, información del negocio, lecturas para un servicio, entre otras).

El MVP se diseñó para que esto fuera posible sin acoplarse: el contrato de ingestión v1 existe desde la 6.5 precisamente para que «en una fase futura, el agente u otros sistemas puedan alimentar este CRM» ([IntegrationBoundaries](../architecture/IntegrationBoundaries.md)). Lo que faltaba era la decisión de hacerlo, y dónde.

## Decisión

1. **El agente de WhatsApp pasa a ser un consumidor del CRM.** Lee lo que necesita por una **API de servicio versionada de solo lectura** y escribe conversaciones y mensajes por el **contrato de ingestión**, con la credencial de servicio por organización que ya existe o su evolución. La dependencia es **unidireccional**: el agente llama al CRM; el CRM nunca llama al agente.
2. **Los contratos se diseñan desde el modelo del CRM.** No espejan las tablas de Airtable ni el modelo del agente. Viven en `docs/contracts/`, versionados, con validador ejecutable y fixtures, como el de ingestión. El agente se adapta al contrato, no al revés.
3. **La integración y la migración son fases de este repositorio**, con el mismo método, el mismo backlog en Notion y los mismos gates. El roadmap lo escribe la subfase 10.3, en el orden acordado con el usuario: primero lo que el agente lee (catálogo comercial e información del negocio, y el piloto como subfase propia), después el contexto del turno, después producción y al final la migración.
4. **La migración de los datos existentes entra por CSV exportado.** El CRM **nunca** llama a la API de Airtable. El mapeo de los identificadores del sistema legado se diseña en la fase de migración (Fase 14), desde el modelo del CRM.
5. **El CRM sigue sin producir efectos externos**: no envía mensajes de WhatsApp ni llama a ningún servicio del agente. Enviar es responsabilidad del agente.
6. **La independencia técnica se mantiene**: el CRM no comparte código, infraestructura ni base de datos con el agente, y el repositorio del agente sigue siendo solo contexto de negocio al planificar.
7. **El ERP** —ventas, compras, proveedores, pagos, caja, contabilidad— **queda para después de que la integración esté en producción**, por decisión del usuario. Hasta entonces sigue prohibido por `CLAUDE.md`.

### Qué conserva del ADR 0003

- No se migran datos reales antes de tener un modelo validado: el MVP se validó con datos sintéticos, y la migración sigue siendo la **última** fase de integración.
- El esquema del CRM no se diseña a partir del modelo físico del legado.
- El contrato de ingestión no asume el formato de ningún emisor concreto.

### Qué reemplaza

- «La migración y el cutover se planifican y ejecutan como un proyecto independiente», y «el proyecto de migración define su propio backlog»: pasan a ser fases de este repositorio.

## Alternativas descartadas

- **Un proyecto de integración aparte**: descartado por el usuario. Duplicaría método, backlog y gates para un sistema que es uno solo.
- **Una API que espeje las tablas de Airtable** para que el agente cambie solo de URL: reproduciría el modelo físico del legado, que es lo que el ADR 0003 ya descartó, y ataría el CRM a un proveedor que se está dejando.
- **Que el CRM empuje datos al agente** (webhooks salientes, sincronización): convierte al CRM en productor de efectos externos, con el ledger, los reintentos y el sesgo de entrega que eso exige, sin que el agente lo necesite para funcionar.
- **Migrar por la API de Airtable**: prohibido por `CLAUDE.md` y por el ADR 0001.

## Consecuencias

- Se enmiendan, con fecha y conservando el texto anterior, [Scope.md](../product/Scope.md), [Vision.md](../product/Vision.md), `FR-CONV-05` en [FunctionalRequirements.md](../product/FunctionalRequirements.md) y su fila en [TraceabilityMatrix.md](../architecture/TraceabilityMatrix.md), [IntegrationBoundaries.md](../architecture/IntegrationBoundaries.md) y la frase de independencia de `CLAUDE.md`. El [Roadmap](../planning/Roadmap.md) lo enmienda la 10.3.
- **Ninguna prohibición de `CLAUDE.md` cambia.** La integración entra por la puerta que esas prohibiciones dejan abierta: un contrato del CRM que otro sistema consume.
- **Aparece un requisito que el MVP no tenía: disponibilidad.** El agente depende del CRM en cada turno, de forma sincrónica. Si el CRM no responde, el agente no responde. El criterio se decide en la fase de producción (Fase 13).
- **Llega el primer tráfico real.** La conexión de un emisor real va detrás del modo de prueba que ya existe (`INGESTION_ENABLED` y la allowlist de credenciales), y validar la autenticación y los fixtures con tráfico del emisor es gate de la fase que lo conecta, no una formalidad.
- **La guarda de referencias prohibidas sigue igual.** Un nombre de emisor o de credencial que coincida con el nombre del repositorio del agente la hace fallar, y la salida es elegir otro nombre, no abrir una excepción ([brief-10](brief-10-evaluacion-del-mvp.md), C-6).
- Las decisiones sobre datos reales —retención de mensajes y borrado de los datos de un cliente frente a las tablas de solo inserción del [ADR 0013](0013-rol-de-aplicacion-y-tablas-de-solo-insercion.md)— se reabren antes del primer mensaje real ([evaluación 10.1](evaluacion-10.1-mvp.md), R-3 y O-11).
