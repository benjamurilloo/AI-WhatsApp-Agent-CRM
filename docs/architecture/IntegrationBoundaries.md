# Límites de Integración

**Estado: diseñado. Nada de lo descrito aquí está conectado a tráfico real.** El contrato de ingestión v1 está en [contracts/ingestion-v1.md](../contracts/ingestion-v1.md) desde la 6.5.1.

## Regla general

Este sistema no tiene, en el MVP, ninguna integración saliente ni entrante con sistemas externos reales. Toda mención de integración futura describe un contrato de interfaz, no una conexión activa.

## Explícitamente fuera de los límites de este sistema

- **Airtable**: ningún módulo de este repositorio puede depender del SDK, la API HTTP, IDs de base/tabla o variables de entorno de Airtable. Esta regla es permanente para el MVP y se revisa solo mediante un ADR explícito, no por conveniencia de una tarea puntual.
- **Repositorio del agente de WhatsApp** (`AI-WhatsApp-Agent`): no se importa código, no se replica su modelo físico de datos, no se asume su disponibilidad ni su formato de eventos como contrato fijo. Puede usarse como contexto de negocio de solo lectura durante la planificación, nunca como dependencia técnica.
- **Tráfico productivo real** de cualquier canal: el MVP se desarrolla y valida exclusivamente con datos sintéticos, fixtures y seeds propios.

## El único punto de integración futura: contrato de ingestión

Diseño conceptual (no implementado en el MVP más allá de lo necesario para probarlo con fixtures):

- **Endpoint**: `POST /api/ingestion/v1/events`, fijado por el [contrato v1](../contracts/ingestion-v1.md) (brief-6.5.1).
- **Propósito**: permitir que, en una fase futura, un sistema externo (potencialmente el agente de WhatsApp u otro) cree conversaciones y mensajes en este CRM sin acoplarse a su modelo interno.
- **Idempotencia**: cada evento se identifica por `(organization_id, source, external_ref)`. Reenviar el mismo evento no debe crear duplicados ni efectos adicionales. Se persiste en `ingestion_events` antes de proyectar el efecto sobre `conversations`/`messages`.
- **Autenticación**: mecanismo de servicio a servicio (API key por organización o similar) — a definir en la 6.5.3, explícitamente distinto de la sesión de usuario humano. De la credencial salen la organización y el `source`; el payload no los trae (brief-6.5.1, D-3).
- **Versionado**: el contrato se versiona explícitamente (ej. `v1`) desde el primer diseño, para poder evolucionarlo sin rupturas silenciosas.
- **Estado del MVP**: el endpoint, si se implementa, solo se ejercita mediante tests automatizados y fixtures. No se habilita ningún origen de tráfico real, no se configura ningún webhook saliente desde el agente de WhatsApp hacia este sistema.

## Conocimiento transversal aplicado al contrato

Estas reglas vienen de patrones y problemas ya validados en el vault de Obsidian. Son conocimiento transversal, no una dependencia técnica del repositorio del agente de WhatsApp.

- **No depender de deduplicación aguas arriba**: la idempotencia del CRM se sostiene sola, con su ledger. No se asume que un emisor futuro filtre mensajes repetidos antes de enviarlos.
- **La autenticación de ingestión no se cierra con requests sintéticos**: en el MVP solo puede validarse a nivel `deterministic`. Un mecanismo que pasa con `curl` puede rechazar el 100 % del tráfico de un emisor real que no envía lo esperado (problema documentado: *An Auth Mechanism Validated Only With Synthetic Requests Can Reject All Real Traffic*). Validarla con tráfico real del emisor es un gate del proyecto de integración.
- **Fixtures del contrato con forma asumida**: los payloads de prueba del MVP no provienen de un emisor real y así se declaran. En el proyecto de integración se derivan de capturas reales antes de afirmar compatibilidad (*Deterministic Fixtures Must Mirror Real Runtime Error Shapes*).
- **Identidad lógica estable**: `external_ref` identifica el evento y no cambia entre reintentos. Nunca se construye con teléfono, contenido del mensaje u otros datos sensibles (*Reliable External Effects*).
- **Primera conexión real detrás de un modo de prueba**: cuando llegue la integración, el borde de entrada acepta solo emisores y organizaciones de una allowlist antes de persistir nada (*Controlled Test Modes for Event-Driven Agents*).
- **El CRM no produce efectos externos**: no envía mensajes. Si algún día lo hiciera, se diseñaría con ledger, un sesgo de entrega decidido explícitamente y la diferencia entre la Cloud API oficial (ventana de 24 h y plantillas) y las integraciones no oficiales por vinculación de dispositivo (sin ventana, pero con riesgo de bloqueo). Queda fuera de alcance.

## Relación con el proyecto futuro de migración

La migración de datos históricos del sistema legado (Airtable) es un proyecto separado, posterior a validar el CRM en staging, que:

- Se planifica y ejecuta con su propio backlog, fuera de este roadmap.
- Puede reutilizar el contrato de ingestión como mecanismo de carga (backfill batch) o puede usar un mecanismo de importación distinto — decisión que se toma cuando ese proyecto comience, no ahora.
- No condiciona ni bloquea ninguna tarea del MVP actual.

## Qué hacer si una tarea del backlog "necesita" tocar Airtable o el agente de WhatsApp

No hacerlo. Si una tarea del backlog parece requerir esa dependencia, es una señal de que la tarea está mal planteada o pertenece al proyecto futuro de migración — se marca como pregunta abierta en [planning/Risks.md](../planning/Risks.md) y se detiene la implementación hasta decisión explícita del usuario.
