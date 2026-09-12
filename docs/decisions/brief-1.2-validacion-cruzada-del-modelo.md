---
schema: task-brief.v1
task_id: 1.2
task_type: design
generated_at: 2026-09-12
---

# Brief: 1.2 — Validación cruzada del modelo

## Objetivo

Dejar el modelo de datos, los requisitos y las pantallas consistentes entre sí antes de escribir código. Para eso, esta subfase:

- resuelve las brechas B-1 a B-11 que dejaron los [wireframes](../product/wireframes/README.md#brechas-y-discrepancias);
- propaga cada resolución a los documentos afectados;
- arma la matriz de trazabilidad pantalla ↔ FR ↔ tabla ↔ índice ↔ métrica.

Es la última subfase de la Fase 1: al cerrarla se cumplen los criterios de salida de la fase.

## Ubicación en la Fase 1

- **Orden**: 1.3 (cerrada) → 1.1 (cerrada) → **1.2**.
- **Criterios de salida de la Fase 1** que cubre ([Roadmap.md](../planning/Roadmap.md)):
  - cada dato mostrado existe en el modelo;
  - cada FR tiene pantalla o endpoint;
  - cada índice responde a una consulta real.
- **Secuencia interna**: primero las decisiones, después la propagación y al final la matriz. La matriz se construye sobre el modelo ya corregido; armarla antes obligaría a rehacerla. Por eso no se divide en dos subfases: la segunda parte no tiene sentido sin la primera.

## Alcance incluido

- Presentar cada brecha como decisión, con opciones, recomendación y consecuencia, y registrar la resolución del usuario en este archivo.
- Propagar cada resolución a `DataModel.md`, `FunctionalRequirements.md`, `Screens.md` y los wireframes afectados. En el índice de wireframes, cada brecha pasa a "resuelta" con enlace a su resolución.
- Revisar todos los índices de `DataModel.md` contra las consultas reales de pantallas y métricas: agregar los que falten y quitar los que no sirvan a ninguna consulta, con la justificación en la matriz.
- Crear `docs/architecture/TraceabilityMatrix.md` con cuatro vistas:
  - por pantalla: datos, FR, tablas e índices;
  - por FR: dónde se satisface (pantalla, endpoint o invariante con test);
  - por índice: qué consulta lo usa;
  - por métrica: tablas e índices que la sirven.
- Un ADR solo para las decisiones que costaría revertir (ver cada decisión).

## Alcance excluido

- Migraciones SQL, código, dependencias o esquemas ejecutables: la matriz y el modelo siguen en nivel **diseñado**.
- Rediseñar pantallas más allá de lo que exija una resolución. No se agregan pantallas salvo que una decisión lo requiera y el usuario lo apruebe explícitamente.
- Reabrir decisiones aceptadas: ADRs 0001 a 0003 y 0005 a 0009, resoluciones de la 1.3, y W-1 y W-2 de la 1.1.
- Mecanismo de sesión (3.2), rate limiting (3.3), gestión de secretos (9.1).
- Cerrar la Fase 1. El cierre de fase es un paso aparte, con su propia aprobación.

## Archivos o componentes autorizados

Lista cerrada:

- `docs/decisions/brief-1.2-validacion-cruzada-del-modelo.md` (este archivo) y su fila en `docs/decisions/README.md`.
- `docs/decisions/0010-*.md`, solo si la resolución de D-9 lo requiere, y su fila en el índice.
- `docs/architecture/TraceabilityMatrix.md` (nuevo).
- `docs/architecture/DataModel.md`.
- `docs/product/FunctionalRequirements.md`.
- `docs/product/Screens.md`.
- `docs/product/wireframes/*.md`, solo en lo que cambie una resolución.
- `docs/development/TestingStrategy.md`, solo para sumar invariantes nuevos que salgan de una resolución.
- `docs/planning/Risks.md`, solo si cambia el índice de preguntas abiertas.
- `docs/README.md`, solo para enlazar la matriz.
- `CHANGELOG.md` y `HANDOFF.md`, al cerrar la subfase. El handoff incluye la corrección de su `git_ref`, que quedó desactualizado con el commit `58eb682`.

## Fuentes de verdad

1. [DataModel.md](../architecture/DataModel.md), el contrato de datos. Esta subfase lo corrige; no se contradice en silencio.
2. [MetricsCatalog.md](../analytics/MetricsCatalog.md), las consultas de las 12 métricas, que determinan índices.
3. [FunctionalRequirements.md](../product/FunctionalRequirements.md) y [Screens.md](../product/Screens.md).
4. [Índice de wireframes](../product/wireframes/README.md), las brechas B-1 a B-11.
5. ADRs aceptados y resoluciones de los briefs [1.3](brief-1.3-decisiones-de-producto-abiertas.md) y [1.1](brief-1.1-wireframes-baja-fidelidad.md).

## Dependencias

1.3 y 1.1 cerradas (commit `58eb682`).

## Decisiones pendientes

Cada una lleva una recomendación, que no es una resolución: la resuelve el usuario. Ninguna se propaga antes de estar resuelta.

### D-1 — Saldo resultante por movimiento (B-1, pantalla 5)

- **Opciones**:
  - (a) Agregar `inventory_movements.balance_after numeric not null`, escrito en la misma transacción que el ajuste, con `CHECK (balance_after >= 0)`.
  - (b) Calcularlo al consultar con una suma acumulada.
  - (c) Quitar el dato de la pantalla.
- **Recomendación**: (a).
  - Es exacto e inmutable, como el resto del movimiento.
  - No depende de que el historial esté completo desde saldo 0.
  - Tiene consumidor concreto (la pantalla 5) y agrega un segundo control del invariante del [ADR 0008](0008-stock-nunca-negativo.md).
- **Consecuencia**:
  - Suma un invariante con test: `balance_after` del último movimiento es igual a `inventories.quantity_on_hand`.
  - (b) cuesta una ventana sobre todo el historial en cada página; (c) quita trazabilidad que la pantalla promete.

### D-2 — Última interacción del cliente (B-2, pantallas 6 y 7)

- **Opciones**:
  - (a) Derivarla con `MAX(conversations.last_message_at)` y agregar el índice `conversations (organization_id, client_id, last_message_at desc)`.
  - (b) Desnormalizar en `clients.last_interaction_at`, actualizado por la ingestión.
- **Recomendación**: (a). Aplica el mismo criterio que el [ADR 0005](0005-metricas-desde-datos-transaccionales.md): derivar mientras no se demuestre en staging que es lento. (b) crea una segunda fuente de verdad que la ingestión tendría que mantener sincronizada.
- **Consecuencia**: si en la Fase 9 el orden de la lista 6 degrada, se revisa con medición, no con suposición.

### D-3 — Cantidad de mensajes por conversación (B-3, pantallas 7 y 8)

- **Opciones**:
  - (a) Derivarla con `COUNT(messages)` sobre las filas de la página, usando el índice existente `(conversation_id, sent_at)`.
  - (b) Desnormalizar en `conversations.message_count`.
- **Recomendación**: (a). Son 25 conversaciones por página y el índice ya existe.
- **Consecuencia**: la misma que D-2, con revisión en staging.

### D-4 — Índice para el filtro y el orden por último mensaje (B-4, pantalla 8)

- **Opciones**:
  - (a) Agregar `conversations (organization_id, last_message_at desc)`.
  - (b) Cambiar la pantalla para ordenar por inicio.
- **Recomendación**: (a). La pantalla prioriza por actividad reciente, que es lo útil para quien opera. El índice `(organization_id, status, started_at desc)` se revisa en la auditoría de índices y se conserva solo si una consulta real lo usa (la métrica 1 filtra por `started_at`).
- **Consecuencia**: ninguna sobre el producto.

### D-5 — Estado activo por organización (B-5, pantalla 10)

- **Opciones**:
  - (a) Mover el estado a `organization_members.is_active` y quitar `users.is_active`.
  - (b) Agregar `organization_members.is_active` y conservar `users.is_active` como bloqueo global de la cuenta.
  - (c) Dejarlo global.
- **Recomendación**: depende de D-9.
  - Si un usuario pertenece a una sola organización, (c) basta y la brecha desaparece.
  - Si puede pertenecer a varias, (a): la pantalla 10 administra membresías, y ninguna pantalla del MVP consume un bloqueo global, así que (b) dejaría una columna sin consumidor.
- **Consecuencia**: con (a), la regla "no desactivar al último `admin`" se evalúa por organización.

### D-6 — Contraseña inicial de un solo uso (B-6, pantalla 10)

- **Opciones**:
  - (a) Agregar `users.must_change_password boolean not null default false`, y un paso obligatorio de cambio de contraseña después del login cuando está en `true`.
  - (b) Contraseña inicial sin cambio forzado: el `admin` la comunica y el usuario la conserva.
  - (c) Invitación por enlace con token enviado por email.
- **Recomendación**: (a).
  - (b) deja una contraseña que conoció otra persona como credencial permanente.
  - (c) exige enviar emails, un efecto externo sin infraestructura en el MVP.
  - El paso de cambio de contraseña se agrega como estado del flujo de la pantalla 1, no como pantalla nueva del menú.
- **Consecuencia**:
  - Suma un estado a la pantalla 1 y a su wireframe.
  - Suma un caso a `TestingStrategy.md`: un usuario con cambio pendiente no accede a ninguna ruta protegida.
  - La Fase 3 lo implementa.

### D-7 — Disponibilidad de la ingestión para la métrica 12 (B-7, pantalla 2)

- **Opciones**:
  - (a) Configuración de la aplicación que indica si el módulo de ingestión está habilitado en el entorno, sin tabla.
  - (b) "No disponible" si la organización nunca recibió un evento.
- **Recomendación**: (a). (b) confunde "no hay ingestión" con "hay ingestión y todavía no llegó nada", que es justo la ambigüedad que el catálogo quiere evitar.
- **Consecuencia**: el nombre de la variable y su valor por entorno se definen en la subfase 6.5, no ahora. Acá solo se fija que la fuente es la configuración, no los datos.

### D-8 — Auditoría del cliente en la pantalla 7 (B-8)

- **Opciones**:
  - (a) Agregar el historial de auditoría a la pantalla 7, solo para `admin`, igual que en la pantalla 4.
  - (b) Reducir FR-AUD-02 a productos.
- **Recomendación**: (a). `audit_logs` ya admite `entity_type = 'client'`, FR-AUD-01 ya exige auditar los cambios de clientes, y un registro que nadie puede consultar desde la aplicación no sirve para lo que se registró.
- **Consecuencia**: suma un bloque al wireframe 7, sin cambios en el modelo.

### D-9 — Cantidad de organizaciones por usuario (B-9, todas las pantallas)

- **Opciones**:
  - (a) En el MVP un usuario pertenece a una sola organización: `UNIQUE (user_id)` en `organization_members`, sin selector, y FR-ORG-01 se reescribe en singular.
  - (b) Varias organizaciones por usuario, con selector en el marco común y la organización activa en la sesión.
- **Recomendación**: (a).
  - El MVP sirve a un negocio. Un selector y el manejo de la organización activa en la sesión serían construir por adelantado, lo que `CLAUDE.md` prohíbe.
  - La tabla `organization_members` se conserva, así que pasar a (b) después es una migración aditiva: quitar la restricción y agregar el selector, sin mover datos.
  - El aislamiento por `organization_id` no cambia.
- **Consecuencia**:
  - Requiere **ADR 0010**, porque fija una restricción de unicidad sobre la estructura de tenencia.
  - Con (a), D-5 se resuelve como (c).

### D-10 — `products.min_stock` sin consumidor (B-10, pantallas 3 y 4)

- **Opciones**:
  - (a) Quitar `min_stock` del modelo, de FR-PROD-01 y de la pantalla 4.
  - (b) Darle una regla: por ejemplo, `bajo_stock` por debajo de `min_stock` y un aviso de reposición en `reorder_point`.
- **Recomendación**: (a). FR-PROD-05 ya define el estado con un solo umbral, y el MVP no tiene avisos de reposición. Una columna que solo se muestra, sin regla, es lo que el principio 8 prohíbe. Si el negocio distingue dos umbrales, conviene saberlo ahora y elegir (b).
- **Consecuencia**: con (a), el formulario de producto pierde un campo.

### D-11 — Tipos de movimiento sin productor (B-11, pantalla 5)

- **Opciones**:
  - (a) Dejar el enum `inventory_movements.type` solo con `adjustment_positive` y `adjustment_negative`.
  - (b) Conservar los cuatro valores.
- **Recomendación**: (a). `inbound` y `outbound` los producirían compras y ventas, que están fuera del MVP. En PostgreSQL agregar un valor a un enum es una migración aditiva.
- **Consecuencia**: el filtro de la pantalla 5 ofrece dos tipos.

## Resolución

Brief aprobado y decisiones resueltas por el usuario el **2026-09-12**. Las once, según la recomendación.

| Decisión | Resolución |
|---|---|
| D-1 Saldo resultante | `inventory_movements.balance_after`, escrito en la misma transacción, con `CHECK (balance_after >= 0)` |
| D-2 Última interacción | Derivada con `MAX(conversations.last_message_at)` e índice `(organization_id, client_id, last_message_at desc)` |
| D-3 Cantidad de mensajes | Derivada con `COUNT(messages)` sobre las filas de la página |
| D-4 Orden por último mensaje | Índice `conversations (organization_id, last_message_at desc)` |
| D-5 Estado activo | (c) Global en `users.is_active`, consecuencia de D-9 |
| D-6 Contraseña inicial | `users.must_change_password` y cambio obligatorio después del login, dentro del flujo de la pantalla 1 |
| D-7 Métrica 12 | "No disponible" sale de la configuración del entorno; el nombre se fija en la 6.5 |
| D-8 Auditoría del cliente | Se agrega a la pantalla 7, solo para `admin` |
| D-9 Organizaciones por usuario | Una sola en el MVP: `UNIQUE (user_id)` en `organization_members`, sin selector ([ADR 0010](0010-un-usuario-una-organizacion-en-el-mvp.md)) |
| D-10 `min_stock` | Se quita del modelo, de FR-PROD-01 y de la pantalla 4 |
| D-11 Tipos de movimiento | Solo `adjustment_positive` y `adjustment_negative` |

### Hallazgos durante la ejecución

Al armar la matriz aparecieron cinco hallazgos fuera de las once decisiones. El usuario los resolvió el 2026-09-12 y amplió la autorización a tres archivos fuera de la lista original, solo en las líneas afectadas: `docs/architecture/SecurityModel.md`, `docs/product/Scope.md` y la fila del riesgo de sesión multi-organización en `docs/planning/Risks.md`.

| Hallazgo | Resolución |
|---|---|
| H-1 `deleted_at` sin consumidor | Se quita de `users`, `clients` y `products` |
| H-2 `organizations.slug` sin consumidor | Se quita con su índice único |
| H-3 Búsqueda por prefijo o contenido | Diferido a las Fases 4 y 5 |
| H-4 Contradicciones con ADR 0010 y D-10 fuera de la lista | Se corrigen `SecurityModel.md`, `Scope.md` y el riesgo de `Risks.md` |
| H-5 Test de enmascarado para `viewer` | Diferido a la Fase 5 |

## Hallazgos anticipados a verificar en la auditoría de índices

No son decisiones de producto: son ajustes técnicos que la subfase resuelve y justifica en la matriz. Se aprueban con el cierre.

- Las métricas 2 a 9 filtran `messages` por organización y `sent_at ∈ I`. El único índice de `messages` es `(conversation_id, sent_at)`, que no sirve un rango de fechas de toda la organización. Previsiblemente falta `messages (organization_id, sent_at)`.
- La métrica 12 filtra `ingestion_events` por `received_at ∈ I`. El único índice es el `UNIQUE (organization_id, source, external_ref)`. Previsiblemente falta `ingestion_events (organization_id, received_at)`.
- La lista 10 ordena y filtra miembros de una organización; hay que confirmar que `(organization_id, user_id)` la sirve.

## Invariantes

- Ninguna resolución introduce Airtable, referencias al repositorio del agente de WhatsApp ni módulos fuera del MVP.
- Ninguna columna ni índice sin consumidor concreto en una pantalla, métrica, regla o invariante. Esto aplica a lo que se agrega y a lo que se conserva.
- Las resoluciones de la 1.3 no cambian:
  - teléfono enmascarado para `viewer`;
  - sin vista previa de mensajes;
  - pantalla 10 en el MVP;
  - stock nunca negativo;
  - teléfono como único identificador.
- `inventory_movements` sigue siendo insert-only; `audit_logs` y `messages` no se borran.
- Toda consulta de negocio sigue filtrada por `organization_id`.

## Criterios de aceptación

- **AC-1**: las once decisiones tienen resolución del usuario con fecha en la sección "Resolución" de este archivo.
- **AC-2**: cada resolución está propagada a los documentos que gobierna, sin dejar texto anterior que la contradiga. Cada brecha del índice de wireframes figura como resuelta, con enlace a su resolución.
- **AC-3**: todo dato visible en los wireframes tiene origen en el modelo corregido. Ningún dato queda como `BRECHA`.
- **AC-4**: `TraceabilityMatrix.md` existe con las cuatro vistas del alcance, y ninguna celda queda vacía sin explicación.
- **AC-5**: cada FR de `FunctionalRequirements.md` tiene al menos una pantalla, endpoint o invariante con test que lo satisface, según la matriz.
- **AC-6**: cada índice de `DataModel.md` tiene al menos una consulta real que lo usa, y cada consulta de pantalla o métrica que filtra u ordena tiene índice o una justificación explícita de por qué no lo necesita.
- **AC-7**: si D-9 se resuelve con un ADR, existe e indexado en `docs/decisions/README.md` con su estado real.
- **AC-8**: los enlaces internos del repositorio siguen resolviendo.
- **AC-9**: no se tocó ningún archivo fuera de la lista autorizada.

## Pruebas y evidencia requerida

No aplica evidencia ejecutable: es una subfase de diseño. La evidencia es documental:

- verificación de enlaces internos;
- `grep` de `BRECHA` en los wireframes;
- contraste de cada AC contra los archivos;
- recorrido de la matriz contra `DataModel.md` y `FunctionalRequirements.md`.

La revisión es autoevaluación (`self_assessment: true`). Nivel resultante: **diseñado**.

## Condiciones de detención

- Antes de propagar cualquier cambio, si alguna decisión no está resuelta.
- Si una resolución contradice un ADR aceptado o una resolución de la 1.3: se detiene y se plantea la contradicción.
- Si la matriz revela un FR sin forma de satisfacerse, o un dato que exigiría una pantalla nueva: se detiene y se pregunta, sin agregar la pantalla.
- Antes de tocar un archivo fuera de la lista autorizada.
- Antes de commit, push o cambios de estado en Notion.
