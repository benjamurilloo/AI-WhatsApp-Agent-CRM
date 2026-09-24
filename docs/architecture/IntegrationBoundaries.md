# Límites de Integración

**Estado: diseñado. Nada de lo descrito aquí está conectado a tráfico real.** El contrato de ingestión v1 está en [contracts/ingestion-v1.md](../contracts/ingestion-v1.md) desde la 6.5.1.

**Enmendado el 2026-09-23 por el [ADR 0014](../decisions/0014-el-agente-de-whatsapp-como-consumidor-del-crm.md)**: el agente de WhatsApp pasa a ser un **consumidor** del CRM, en fases de este repositorio posteriores al MVP. Lo escrito para el MVP se conserva; lo que cambia está marcado con fecha, y el texto reemplazado queda tachado.

## Regla general

Este sistema no tiene, en el MVP, ninguna integración saliente ni entrante con sistemas externos reales. Toda mención de integración futura describe un contrato de interfaz, no una conexión activa.

**Después del MVP** (ADR 0014): el CRM tiene un único consumidor externo previsto, el agente de WhatsApp, con **dependencia unidireccional**. El agente llama al CRM por contratos versionados que el CRM diseña desde su propio modelo; el CRM nunca llama al agente ni produce efectos externos. Cada conexión real entra con el gate de la fase que la conecta y detrás del modo de prueba.

## Explícitamente fuera de los límites de este sistema

- **Airtable**: ningún módulo de este repositorio puede depender del SDK, la API HTTP, IDs de base/tabla o variables de entorno de Airtable. Esta regla es permanente para el MVP y se revisa solo mediante un ADR explícito, no por conveniencia de una tarea puntual.
- **Repositorio del agente de WhatsApp** (`AI-WhatsApp-Agent`): no se importa código, no se replica su modelo físico de datos, no se asume su disponibilidad ni su formato de eventos como contrato fijo. Puede usarse como contexto de negocio de solo lectura durante la planificación, nunca como dependencia técnica. **Sigue vigente después del ADR 0014**: que el agente consuma el CRM no convierte su repositorio en dependencia. El agente se adapta a los contratos del CRM, no al revés.
- **Tráfico productivo real** de cualquier canal: el MVP se desarrolla y valida exclusivamente con datos sintéticos, fixtures y seeds propios. *Rige para el MVP. En las fases de integración entra con el gate de la fase que conecta el emisor, detrás del modo de prueba (ADR 0014).*

## ~~El único punto de integración futura: contrato de ingestión~~ Contratos de integración

*Enmendado el 2026-09-23 (ADR 0014).* El título decía «el único punto». Después del MVP son **dos superficies**, las dos del lado del CRM y versionadas en `docs/contracts/`:

- **Escritura: el contrato de ingestión**, descrito abajo, que ya existe.
- **Lectura: una API de servicio de solo lectura** para lo que el agente necesita consultar (catálogo comercial, información del negocio y, más adelante, el contexto del turno). ~~**No existe todavía**~~ **Implementada desde la 11.3** ([contrato de lectura v1](../contracts/read-v1.md), [brief-11.3](../decisions/brief-11.3-api-de-lectura.md)): productos activos con precio y estado de stock desde la 11.3.1, **validada localmente y en CI** con requests sintéticos, apagada por defecto y sin ningún consumidor conectado. Cada credencial tiene un solo alcance, así que una credencial de lectura no escribe. Se diseñó en la primera fase de integración (Fase 11), con el mismo patrón que la ingestión —contrato versionado, validador ejecutable, fixtures, credencial de servicio por organización, límite de tasa— y con dos piezas de observabilidad que la [evaluación 10.1](../decisions/evaluacion-10.1-mvp.md) (R-1) exige desde el diseño: `logEvent` en cada ruta y un identificador de correlación del emisor.

### Contrato de ingestión

Diseño conceptual (no implementado en el MVP más allá de lo necesario para probarlo con fixtures):

- **Endpoint**: `POST /api/ingestion/v1/events`, fijado por el [contrato v1](../contracts/ingestion-v1.md) (brief-6.5.1).
- **Propósito**: permitir que, en una fase futura, un sistema externo (potencialmente el agente de WhatsApp u otro) cree conversaciones y mensajes en este CRM sin acoplarse a su modelo interno.
- **Idempotencia**: cada evento se identifica por `(organization_id, source, external_ref)`. Reenviar el mismo evento no debe crear duplicados ni efectos adicionales. Se persiste en `ingestion_events` antes de proyectar el efecto sobre `conversations`/`messages`.
- **Autenticación**: credencial de servicio por organización y emisor, con `Authorization: Bearer`, distinta de la sesión de usuario humano ([brief-6.5.3](../decisions/brief-6.5.3-autenticacion-de-servicio-y-rate-limit.md), D-1 y D-2). De la credencial salen la organización y el `source`; el payload no los trae (brief-6.5.1, D-3). Límite de tasa por credencial (D-3).
- **Versionado**: el contrato se versiona explícitamente (ej. `v1`) desde el primer diseño, para poder evolucionarlo sin rupturas silenciosas.
- **Estado del MVP**: el endpoint está implementado desde la 6.5.3 y solo se ejercita con tests automatizados y fixtures. Está apagado por defecto (`INGESTION_ENABLED`), y encendido solo acepta las credenciales de `INGESTION_ALLOWED_CREDENTIALS` (D-4). No se habilita ningún origen de tráfico real y no se configura ningún webhook saliente desde el agente de WhatsApp hacia este sistema.

## Conocimiento transversal aplicado al contrato

Estas reglas vienen de patrones y problemas ya validados en el vault de Obsidian. Son conocimiento transversal, no una dependencia técnica del repositorio del agente de WhatsApp.

- **No depender de deduplicación aguas arriba**: la idempotencia del CRM se sostiene sola, con su ledger. No se asume que un emisor futuro filtre mensajes repetidos antes de enviarlos.
- **La autenticación de ingestión no se cierra con requests sintéticos**: en el MVP solo puede validarse a nivel `deterministic`. Un mecanismo que pasa con `curl` puede rechazar el 100 % del tráfico de un emisor real que no envía lo esperado (problema documentado: *An Auth Mechanism Validated Only With Synthetic Requests Can Reject All Real Traffic*). Validarla con tráfico real del emisor es un gate del proyecto de integración (Fase 12, 12.3).
- **Fixtures del contrato con forma asumida**: los payloads de prueba del MVP no provienen de un emisor real y así se declaran. En el proyecto de integración (Fase 12, 12.3) se derivan de capturas reales antes de afirmar compatibilidad (*Deterministic Fixtures Must Mirror Real Runtime Error Shapes*).
- **Identidad lógica estable**: `external_ref` identifica el evento y no cambia entre reintentos. Nunca se construye con teléfono, contenido del mensaje u otros datos sensibles (*Reliable External Effects*).
- **Primera conexión real detrás de un modo de prueba**: cuando llegue la integración, el borde de entrada acepta solo emisores y organizaciones de una allowlist antes de persistir nada (*Controlled Test Modes for Event-Driven Agents*). Desde la 6.5.3, esa allowlist es la lista de credenciales de `INGESTION_ALLOWED_CREDENTIALS`, que se comprueba antes de contar el límite y de leer el cuerpo.
- **El CRM no produce efectos externos**: no envía mensajes. Si algún día lo hiciera, se diseñaría con ledger, un sesgo de entrega decidido explícitamente y la diferencia entre la Cloud API oficial (ventana de 24 h y plantillas) y las integraciones no oficiales por vinculación de dispositivo (sin ventana, pero con riesgo de bloqueo). Queda fuera de alcance.

## ~~Relación con el proyecto futuro de migración~~ La migración

La migración de datos históricos del sistema legado (Airtable) ~~es un proyecto separado, posterior a validar el CRM en staging, que~~:

- ~~Se planifica y ejecuta con su propio backlog, fuera de este roadmap.~~ **Desde el ADR 0014 (2026-09-23) es la última fase de integración de este repositorio**, con su backlog en el mismo Notion y su lugar en el [Roadmap](../planning/Roadmap.md).
- **Los datos entran por CSV exportado.** El CRM nunca llama a la API de Airtable, tampoco para migrar. Cómo se cargan esos archivos —reutilizando el contrato de ingestión como backfill o con un mecanismo de importación propio— se decide en esa fase, no ahora.
- No condiciona ni bloquea ninguna tarea del MVP actual. *Sigue siendo cierto; ahora tampoco condiciona las fases de integración anteriores a ella.*

## Qué hacer si una tarea del backlog "necesita" tocar Airtable o el agente de WhatsApp

No hacerlo. Si una tarea del backlog parece requerir esa dependencia, es una señal de que la tarea está mal planteada o pertenece ~~al proyecto futuro de migración~~ a la fase de migración (Fase 14) — se marca como pregunta abierta en [planning/Risks.md](../planning/Risks.md) y se detiene la implementación hasta decisión explícita del usuario.

*Precisión del 2026-09-23 (ADR 0014)*: una tarea que **expone un contrato** para que el agente lo consuma no «toca al agente» y no está alcanzada por esta regla. Sí lo está una que haga que el CRM llame al agente, dependa de su disponibilidad, lea su base o su repositorio, o adopte su formato interno como contrato.
