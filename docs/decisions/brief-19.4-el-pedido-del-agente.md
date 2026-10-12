---
schema: task-brief.v1
task_id: "19.4"
task_type: integration
generated_at: 2026-10-11
---

# Brief 19.4 — El pedido del agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `integration`
- **Nivel de evidencia objetivo**:
  - `deterministic` para el esquema, el evento, sus reglas, la lectura v2 y las guardas, contra PostgreSQL real;
  - `producer-consumer` para las pantallas (end-to-end sobre `next start`) y, en la 19.4.3, para el agente como emisor y lector real;
  - `isolated-runtime` para el despliegue (19.4.2).
- **Nivel de validación alcanzable**: **validado localmente y en CI** (19.4.1), **desplegado en producción** (19.4.2) y **validado en integración con el agente** en la organización de demostración (19.4.3). No es «preparado para producción».
- **Orden**: cuarta y última subfase de la Fase 19 — Pedidos ([Roadmap](../planning/Roadmap.md) §Fase 19), después de la 19.3, cerrada el 2026-10-11. Implementa las filas «19.4» del punto 11 del [ADR 0020](0020-el-pedido.md). Se hace porque **el agente confirmó el 2026-10-11 que la usaría** (`Respuesta-19.4-Agente-al-CRM.md`, en el Escritorio del usuario).
- **No abre ni cierra gate**, pero **cambia dos contratos con el agente**: la revisión independiente es **obligatoria** (ADR 0020, §Consecuencias).
- **Estado de este documento**: **aprobado el 2026-10-11** por el usuario, con las recomendaciones de D-1 a D-15. La tarea 19.4 (`3f6702be6f4e81da9df4d463d518b18b`) está en «En proceso» en Notion desde ese día. **Cerrado el 2026-10-12**, junto con la Fase 19 (§Cierre).

## Objetivo

Que el agente de WhatsApp pueda **dejar un pedido pendiente** cuando el cliente confirma un resumen, con un evento nuevo de ingestión v2. Una persona lo confirma, lo entrega o lo cancela desde la app, como cualquier pedido. Y que el agente lea **lo disponible** (el saldo físico menos lo reservado) por una **v2 de las rutas de productos** de la lectura, sin cambiar la v1.

## Lo que se verificó antes de escribir este brief

Releído o verificado en el código, en los contratos y en la respuesta del agente el 2026-10-11.

**Ya está fijado** por el ADR 0020:
- el agente solo deja pedidos `pending`; nunca confirma, cancela ni entrega, ni registra un cobro (punto 9, ADR 0016 punto 5);
- es un `event_type` nuevo de ingestión v2, que su §Versionado admite como cambio compatible (punto 9);
- la cabecera suma un actor de servicio, «exactamente uno, usuario o credencial, con una migración aditiva» (punto 9);
- un pendiente no toca el stock (punto 4); los montos se copian al crear, con las reglas del alta (punto 3); el cliente tiene que estar activo (punto 3);
- descontar lo reservado en lo que lee el agente es un cambio de regla de `read-v1` y exige una v2 diseñada con él (punto 7);
- el aviso al agente es un paso del cierre (punto 9).

**Lo que pidió el agente** (respuesta del 2026-10-11, sobre el resumen del pedido, sin haber leído el ADR):
- dejar el pedido **en el turno siguiente al «sí» del cliente** a un resumen cerrado; nunca con un «lo quiero» suelto;
- ids leídos de `read-v1` en ese mismo turno y cantidades exactas; sin precios; un producto repetido lo suma en una línea; **como mucho 5 líneas**;
- el número `P-000123` no le sirve en el turno, pero lo guardaría si viene; **le importa más el rechazo**: un `422` con un código por motivo, y que el intento rechazado se vea en la app, «por ejemplo como una nota en la conversación»;
- sin lectura del estado de sus pedidos por ahora;
- **una v2 del stock con tres números** (físico, reservado y disponible) y `stock_status` sobre lo disponible, publicada junto con la 19.4, con la v1 igual hasta que migre;
- el `event_id` sale de un hash con clave del mensaje que confirmó; pregunta si el CRM rechazaría un segundo pendiente idéntico del mismo cliente en un plazo corto;
- en el contrato pide: el `event_type` y su forma, el cliente como en las etiquetas, líneas `{ product_id, quantity }`, **la referencia al mensaje que lo originó**, los códigos de rechazo y una respuesta capturada para su fixture.

**Lo que hay en el código y se reutiliza**:
- `ingestion/service.ts`: el ledger idempotente abre la transacción y le pide la proyección a `crm` o `conversations`; un rechazo de negocio queda `failed` con la regla en `error_code` (`rejectByRule`), y un reenvío responde la misma regla. Las etiquetas de la 16.2 (`projectClientTag`, `changeClientTagByPhone`) son el modelo más cercano: cliente por teléfono, credencial como actor, `422` terminales.
- `orders/service.ts`: `createOrder` exige un `admin`, abre su propia transacción, bloquea cliente, productos y contador en el orden del ADR, y rechaza con `inactive_client`, `line_rules` (`inactive_product`, `no_price`, `currency_mismatch`, el total de línea en cero o fuera de rango, `duplicate_product`) y `total_too_large`. Todas las reglas se evalúan **antes** de escribir.
- `src/app/(autenticado)/_audit/actor.ts` ya muestra a un actor de servicio con el `source` de su credencial.
- `read-v1`: el `stock_status` aparece en tres rutas (`/products`, `/products/{id}` y `/products/{id}/stock`); `withPhysicalStock` de la 19.3 lo deriva del saldo físico.

**Contraste con las reglas vigentes** (paso 5 de la skill, con `grep` sobre Overview, DataModel, los dos contratos y el código):
- **H-1. `orders.created_by` es `NOT NULL`** con clave foránea a `users`. El actor de servicio que el ADR adelantó obliga a hacerla nulable con un `CHECK` de exactamente un actor, como `audit_logs` (`num_nonnulls(...) = 1`). No es puramente aditivo: relaja un `NOT NULL`, y el `CHECK` conserva la garantía. Es lo que el punto 9 describe; se declara.
- **H-2. `ingestion_events` no guarda qué creó un evento ni el teléfono del cliente.** Sin un vínculo, un reenvío no puede devolver el número del pedido (D-6), y un intento rechazado no se puede mostrar en la app sin guardar algo nuevo (D-10).
- **H-3. Overview dice que «ningún módulo depende de `orders`».** La 19.4 suma `ingestion → orders`, que el ADR implica. `orders` no depende de `ingestion` salvo en `schema.ts`, para las claves foráneas, como `audit`. Overview se actualiza con fecha.
- **H-4. `createOrder` autoriza a un usuario y abre su transacción.** El camino del agente necesita recibir la transacción de `ingestion` y un actor de servicio, con **las mismas reglas y el mismo orden de bloqueo**. Se comparte la lógica, no se copia (D-7).
- **H-5. El ADR 0020, punto 7, habla de «una v2 de la ruta»**, en singular. El `stock_status` está en tres rutas, y una v2 solo de `/stock` dejaría al agente con dos estados que se contradicen. D-12 propone las tres; si se aprueba, el punto 7 se precisa con fecha.
- **H-6. Tres pedidos del agente difieren de lo que este brief recomienda**: la línea repetida como `422` (D-3), un campo con la referencia al mensaje (D-5) y la nota en la conversación (D-10). Se le explican en la confirmación del contrato (D-15).
- **H-7. El agente contestó sin leer el ADR.** Puede encontrar diferencias al contrastarlo; si cambian el diseño, es una condición de detención.
- **No apareció ninguna contradicción** que obligue a cambiar el texto del ADR 0020; H-5 es una precisión.

## Alcance incluido

1. **Esquema** (migración `0038`):
   - `orders.created_by` pasa a nulable; `orders.created_by_credential_id`, con clave foránea compuesta a `ingestion_credentials (organization_id, id)`, y `CHECK num_nonnulls(created_by, created_by_credential_id) = 1`;
   - `orders.ingestion_event_id`, nulable y único, con clave foránea compuesta a `ingestion_events (organization_id, id)`, que suma el `UNIQUE (organization_id, id)` que hoy no tiene; un `CHECK` que exige el evento si y solo si el actor es una credencial;
   - el trigger de `orders` ya rechaza cambiar cualquier columna fuera de su lista: las tres nuevas quedan fijas sin tocarlo, y un test lo prueba.
2. **El evento `order.placed`** en ingestión v2 (D-1 a D-6), su proyección en `orders` dentro de la transacción de `ingestion` (D-7), fuera de la métrica 12 (D-13).
3. **La lectura v2 de productos** (D-12): tres rutas, con lo disponible.
4. **Las pantallas** (D-11): el origen del pedido en la lista y el detalle.
5. **Documentación**: `ingestion-v2.md` (§Pedidos y la guía del emisor), un `read-v2.md` nuevo, una nota en `read-v1.md`, DataModel, Overview, SecurityModel (88 puntos de entrada), TraceabilityMatrix, FunctionalRequirements, Screens, MetricsCatalog §12, IntegrationBoundaries, EngineeringStandards y la precisión fechada del ADR 0020, punto 7. *Ampliación autorizada por el usuario el 2026-10-11* (R-8): también una nota fechada en §Consecuencias del ADR 0020, sobre la dependencia de `ingestion` hacia `orders`.
6. **La confirmación del contrato al agente** antes de la ventana, y el aviso al cerrar (D-15).

## Alcance excluido

- Que el agente lea sus pedidos o su estado (el agente lo pidió para más adelante).
- Que el agente confirme, cancele o entregue; cualquier cobro o seña.
- Una tabla de intentos rechazados o notas automáticas en la conversación (D-10).
- Rechazar pendientes duplicados (D-9).
- Retirar o cambiar `read-v1`; las demás rutas de lectura en v2.
- El envío, la dirección de entrega y los descuentos.

## Archivos autorizados

Crear o modificar solo estos. Tocar cualquier otro es una condición de detención.

- `drizzle/0038_*.sql` y `drizzle/meta/*`
- `src/modules/orders/` (todos sus archivos)
- `src/modules/ingestion/`: `contract-v2.ts`, `service.ts`, `schema.ts` (solo el `UNIQUE`), `index.ts` y sus tests
- `src/modules/crm/`: **solo** una función que bloquea al cliente por teléfono para el alta, si `orders` no puede reutilizar una existente, y su exportación
- `src/modules/inventory/`: **solo** las lecturas de servicio con lo disponible para la v2, y su exportación
- `src/modules/analytics/`: **solo** si hace falta excluir el tipo nuevo de la métrica 12
- `src/app/api/read/v2/` (nuevo) y, de `src/app/api/read/v1/`, **solo** `serve.ts`, `config.ts` y `contract.ts` para compartir el borde, sin cambiar ninguna respuesta de v1
- `src/app/(autenticado)/pedidos/`
- `src/app/api/ingestion/v1/events/handler.ts`, **solo** la rama de `acceptedResponse` del pedido. *Ampliación autorizada por el usuario el 2026-10-11*: el borde HTTP de la v2 es el de la v1, y sin esa rama el número de D-6 no llega al agente
- `tests/integration/`: un `orders-agent.test.ts` y un `read-api-v2.test.ts` nuevos; `ingestion-v2.test.ts`, `ingestion-v2-http.test.ts`, `orders-schema.test.ts`, `orders.test.ts` y `analytics-ingestion.test.ts`, **solo** los casos del tipo nuevo
- `tests/fixtures/ingestion/v2/` y `tests/fixtures/read/v2/` (nuevos fixtures, forma asumida)
- `tests/guards/`: `exposed-surface.test.ts` (las tres rutas), `order-writes.test.ts` y `module-boundary.test.ts`, **solo** la dependencia nueva
- `tests/e2e/orders.spec.ts`
- los documentos del punto 5 del alcance
- al cerrar cada etapa: este brief, `docs/planning/Roadmap.md`, `docs/decisions/README.md`, `CHANGELOG.md` y `HANDOFF.md`

`catalog`, `numbering`, `audit`, `conversations`, `src/shared/`, las demás rutas de `src/app/api/` y el esquema de `inventory` **no** se tocan.

## Fuentes de verdad

- **El código y las migraciones**: `orders`, `ingestion`, `inventory` (`withPhysicalStock`, `getAvailableStock`), `drizzle/0036_orders.sql` y `0037_reserved_stock.sql`.
- **Las decisiones**: el [ADR 0020](0020-el-pedido.md), puntos 3, 4, 7 y 9; el [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md), punto 5; el [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md); el [brief-16.2](brief-16.2-etiquetas-puestas-por-el-agente.md) como modelo de un evento que escribe en otro módulo.
- **Los contratos**: [ingestion-v2](../contracts/ingestion-v2.md) y [read-v1](../contracts/read-v1.md), con sus §Versionado.
- **La respuesta del agente**: `Respuesta-19.4-Agente-al-CRM.md`, en el Escritorio del usuario. Es contexto del consumidor, no una fuente de verdad del CRM.

## Decisiones pendientes

**D-1. El evento.** **Recomendada**: `order.placed`, solo en v2, con este cuerpo estricto:

```json
{
  "contract_version": "2",
  "event_type": "order.placed",
  "event_id": "evt-v2-pedido-0001",
  "occurred_at": "2026-10-11T12:00:20-03:00",
  "client": { "phone": "+5491155550001" },
  "lines": [
    { "product_id": "…", "quantity": "2" }
  ]
}
```

`client` lleva solo `phone`, como las etiquetas. **El cliente tiene que existir**: el evento nunca lo crea (lo crea `client.resolved`). `occurred_at`, el momento del mensaje que confirmó.

**D-2. Las líneas.** **Recomendada**: de 1 a **10** líneas (el doble de las 5 del agente; un número propio del contrato, para que un cambio de la app no lo cambie sin v3). `product_id`, un uuid, en minúsculas como lo devuelve la lectura. `quantity`, un decimal **en texto**, nunca un número de JSON, mayor que cero, con hasta tres decimales y dentro de `numeric(14, 3)`, como `quantity_available` de la lectura.

**D-3. Un producto repetido.** **Recomendada**: `400 VALIDATION_ERROR` con el campo `lines`, no un `422`. Es la forma del evento, se valida antes de leer nada, y el agente ya suma las cantidades de su lado: si llega, es un defecto del emisor. El agente lo pidió como `422`; se le explica (H-6).

**D-4. El actor y el vínculo.** **Recomendada**: el esquema del punto 1 del alcance. La credencial es el actor de la cabecera y de la auditoría (`create`), como en las etiquetas. El vínculo con el evento es lo que permite responder el mismo número a un reenvío (D-6) y saber qué evento creó cada pedido.

**D-5. La referencia al mensaje.** **Recomendada**: **sin un campo propio**. El `event_id` ya sale del mensaje que confirmó (respuesta del agente, §6), y el CRM guarda qué evento creó el pedido (D-4). Un campo con la referencia del mensaje ataría `orders` a `conversations` y obligaría a decidir qué pasa si el mensaje no está. Si más adelante el detalle del pedido tiene que llevar a la conversación, es otra decisión. El agente lo pidió; se le explica (H-6).

**D-6. Las respuestas.** **Recomendada**:
- **Éxito**: `200` con `{ "contract_version": "2", "event_id", "result": "accepted", "order": { "number": "P-000123" } }`. Sin estado, total ni líneas.
- **Reenvío idéntico**: `200` con `"result": "duplicate"` y **el mismo número**, leído por el vínculo de D-4, sin escribir.
- **Reglas** (`422 BUSINESS_RULE_VIOLATION`, **terminales**, una sola regla en `rule` y en `error_code`; un reenvío responde la misma):

  | `rule` | Cuándo |
  |---|---|
  | `client_not_found` | el teléfono no es de ningún cliente de la organización |
  | `client_inactive` | el cliente está desactivado |
  | `product_not_found` | un producto no existe, es de otra organización o está inactivo, **sin distinguir**, como el `404` de la lectura |
  | `product_without_price` | un producto no tiene precio vigente |
  | `currency_mismatch` | los precios de las líneas están en monedas distintas |
  | `amount_out_of_range` | el total de una línea redondea a cero, o una línea o el total no caben en `numeric(14, 2)` |

  **Precedencia**: primero el cliente; después las líneas en su orden, y en cada línea las reglas en el orden de la tabla. Se responde la primera que falla: así la respuesta es una sola y un reenvío la repite sin guardar más que `error_code`.
- Un rechazo **no consume número** ni escribe nada fuera de `ingestion_events`.

**D-7. Dónde vive la regla.** **Recomendada**: `orders` expone una función que recibe la transacción de `ingestion`, el actor de servicio y el evento, y **comparte con `createOrder` la validación, el orden de bloqueo y la escritura**; `createOrder` sigue igual para la app. El cliente se bloquea por teléfono en modo compartido, como en el alta por id (precisión del punto 6). `ingestion` traduce el resultado a las reglas de D-6. La guarda `order-writes` se extiende a la función nueva si escribe.

**D-8. El stock.** **Recomendada**: un pendiente del agente **no mira el stock**, como cualquier pendiente (ADR 0020, punto 4): se acepta aunque no alcance, y lo rechaza la confirmación de la persona. Se escribe en el contrato para que el agente no lo lea como una reserva.

**D-9. Un pendiente duplicado.** **Recomendada**: **se acepta**, sin regla de plazo. La regla del agente ya exige un resumen en el turno anterior; dos pendientes iguales los ve una persona en la lista, con su origen (D-11), y cancela uno. Una regla de plazo es una decisión de negocio sin datos todavía; se revisa con pedidos reales.

**D-10. Que un rechazo llegue a una persona.** **Recomendada**: **el emisor, ante un `422` de `order.placed`, deriva la conversación** con el evento que ya existe, `conversation.escalated`. La conversación queda a la vista de quien atiende, que lee qué pidió el cliente. Se escribe en la guía del emisor. El CRM no guarda el contenido rechazado: `ingestion_events` no guarda el cuerpo ni el teléfono, y una tabla de intentos con datos de un cliente no se crea para esto. El agente propuso una nota; se le explica (H-6).

**D-11. Las pantallas.** **Recomendada**: la lista y el detalle del pedido muestran **«Agente»** como origen de un pedido creado por una credencial, con el `source` en el detalle, por la función que ya usa la historia (`_audit/actor.ts`). Sin filtro por origen. Lo demás no cambia: confirmar, entregar y cancelar son iguales.

**D-12. La lectura v2.** **Recomendada**: `GET /api/read/v2/products`, `/api/read/v2/products/{product_id}` y `/api/read/v2/products/{product_id}/stock`, iguales a sus v1 salvo:
- `contract_version: "2"`;
- `stock_status` se deriva de **lo disponible** en las tres;
- `/stock` devuelve `quantity_on_hand`, `quantity_reserved` y `quantity_available` (físico menos reservado), en texto canónico como en v1, con su `unit` y su `stock_status`.

Las tres porque el estado no puede contradecirse entre la búsqueda y el stock (H-5). La misma credencial `read`, la misma allowlist y el mismo presupuesto de tasa que v1. Las demás rutas siguen solo en v1. **v1 no cambia**: los tests de la 19.3 que lo fijan siguen. Un `docs/contracts/read-v2.md` nuevo, con fixtures de forma asumida.

**D-13. La métrica 12.** **Recomendada**: `order.placed` no cuenta, como las etiquetas: no es un mensaje.

**D-14. Las etapas.** **Recomendada**, como la 16.2:
- **19.4.1**: implementación, validada en local y en CI, con la revisión independiente obligatoria antes del commit;
- **19.4.2**: el despliegue a producción con la `0038`, autorizado aparte;
- **19.4.3**: la ventana con el agente en la organización de demostración, autorizada aparte: el agente manda eventos reales y lee la v2; se concilian `ingestion_events`, `orders`, `order_lines` y la auditoría, y se capturan sus fixtures. Al terminar, los pedidos de prueba se cancelan desde la app.

**D-15. La comunicación con el agente.** **Recomendada**: al cerrar la 19.4.1, una **confirmación del contrato** en el Escritorio (`Confirmacion-19.4-CRM-al-Agente.md`), con los dos contratos, los fixtures, D-8 y las tres diferencias de H-6, para que el agente implemente antes de la ventana. Al cerrar la 19.4.3, el aviso de cierre.

## Invariantes

- El agente nunca confirma, cancela ni entrega un pedido, ni registra un cobro.
- Un pedido tiene exactamente un actor que lo creó, usuario o credencial, y nunca cambia.
- Un pendiente no toca el stock; lo reservado sigue siendo la suma de los confirmados.
- Un rechazo no escribe nada fuera de `ingestion_events` ni consume un número.
- Un reenvío idéntico nunca crea un segundo pedido.
- `read-v1` y los cuatro eventos anteriores de ingestión responden lo mismo que antes.
- `inventory` no depende de `orders`, y `orders` no depende de `ingestion` salvo en `schema.ts`.
- Las cantidades y los montos nunca pasan por `number`.

## Criterios de aceptación

**19.4.1**
- **AC-1 (esquema)**: la `0038` aplica; el `CHECK` rechaza ningún actor y los dos; el vínculo es único y exige la credencial; el trigger rechaza cambiar las tres columnas nuevas; con el dueño y con `crm_app`. Lo prueba `orders-schema.test.ts`.
- **AC-2 (contrato)**: `contract-v2.test.ts` valida los vectores nuevos contra su texto canónico y su `payload_hash`, calculado a mano con `sha256sum`, y cada `400` de D-1 a D-3: sin líneas, más de 10, producto repetido, cantidad en número de JSON o fuera de rango, uuid inválido, campos de más en `client`, en una línea o en el cuerpo. v1 rechaza `order.placed` en `event_type`.
- **AC-3 (proyección)**: `orders-agent.test.ts`, contra PostgreSQL real: un evento válido crea un pendiente con su número, las líneas con los precios copiados, la credencial como actor, el vínculo al evento y la auditoría `create` con la credencial; el stock no cambia; el reenvío idéntico responde `duplicate` con el mismo número sin escribir; otro contenido con el mismo `event_id` responde `409 event_payload_mismatch`.
- **AC-4 (reglas)**: cada regla de D-6 con su precedencia; terminal; un reenvío responde la misma; ningún pedido ni número consumido; el evento queda `failed` con la regla.
- **AC-5 (concurrencia)**: el evento contra la desactivación del cliente o de un producto y contra un cambio de precio termina coherente; dos eventos del mismo cliente crean dos pedidos con números distintos; el mismo evento enviado en paralelo crea uno solo.
- **AC-6 (aislamiento)**: la credencial de una organización no crea pedidos con clientes ni productos de otra.
- **AC-7 (lectura v2)**: `read-api-v2.test.ts`: las tres rutas pasan su validador estricto; el estado y los tres números con lo reservado; el borde completo (modo de prueba, credencial, alcance, allowlist, tasa compartida con v1, correlación, log con las rutas fijas); y la v1 sigue entregando el saldo físico.
- **AC-8 (pantallas)**: `orders.spec.ts`: un pedido creado por una credencial muestra «Agente» en la lista y el detalle, y la historia muestra su `source`; un `admin` lo confirma como cualquier otro; axe en claro y oscuro.
- **AC-9 (métrica 12)**: `analytics-ingestion.test.ts`: `order.placed` no cuenta.
- **AC-10 (guardas)**: `exposed-surface` con las tres rutas (88); `module-boundary` con `ingestion → orders`; `order-writes` con la función nueva, si escribe, y su evidencia de mutación.
- **AC-11**: la batería completa pasa en local y en la CI del SHA del cierre.
- **AC-12**: la documentación del punto 5 del alcance, con las precisiones fechadas, sin reescribir ninguna decisión anterior.
- **AC-13**: la confirmación del contrato al agente (D-15).

**19.4.2**
- **AC-14**: producción corre el SHA de la 19.4.1 con la `0038`; los recuentos anteriores sin cambios; las tres rutas v2 responden `401` sin token desde afuera.

**19.4.3**
- **AC-15**: en la organización de demostración, el agente deja al menos un pedido aceptado, un reenvío `duplicate` y un `422`, y lee la v2; la conciliación cierra contra `ingestion_events`, `orders`, `order_lines` y la auditoría; las capturas quedan como fixtures `"shape": "captured"`; los pedidos de prueba quedan cancelados; el aviso de cierre sale (D-15).

## Pruebas y evidencia requerida

- `deterministic`: AC-1 a AC-7, AC-9 y AC-10, contra PostgreSQL real de desarrollo y de la CI.
- `producer-consumer`: AC-8 (UI ↔ servicio ↔ base) y AC-15 (el agente como emisor y lector real).
- `isolated-runtime`: AC-14.
- La batería se corre **desde Git Bash**, y cada archivo nuevo va al índice con `git add -N` al crearlo.

## Condiciones de detención

Parar e informar antes de seguir si:
- hace falta tocar un archivo fuera de la lista autorizada;
- el diseño exigiría cambiar el texto del ADR 0020 más allá de la precisión de H-5, o el de los ADR 0014 y 0016;
- `read-v1`, `ingestion-v1` o los eventos anteriores de v2 tendrían que cambiar una respuesta;
- `inventory` tendría que depender de `orders`, u `orders` de `ingestion` fuera de `schema.ts`;
- aparece un camino por el que el agente confirma, cancela o entrega, o un rechazo escribe o consume un número;
- la respuesta del agente a la confirmación cambia el diseño (H-7);
- un test que pasaba deja de pasar y la causa no es de esta subfase.

Y siempre **antes** de: el commit, el push, pasar tareas de estado en Notion, ejecutar migraciones contra una base que no sea la local o la de la CI, desplegar, abrir la ventana con el agente y enviarle la confirmación o el aviso. Cada una necesita autorización explícita en su turno.

## Resultados de la 19.4.1 — 2026-10-11 (autoevaluación)

Implementado el 2026-10-11. **Esta sección es autoevaluación**: la escribió quien implementó. La revisión independiente de D-14 va aparte, abajo.

### Lo que la implementación encontró que el brief no decía

- **El borde HTTP de la v2 es el de la v1** (`src/app/api/ingestion/v1/events/handler.ts`), que no estaba en la lista: sin una rama nueva en `acceptedResponse`, el número de D-6 no llegaba al agente. **El usuario autorizó la ampliación** el 2026-10-11; la rama es la única línea tocada, y v1 nunca llega a ella.
- **La migración generada ponía la clave foránea antes de su `UNIQUE`**: `drizzle-kit` escribió la clave de `orders.ingestion_event_id` antes del `UNIQUE (organization_id, id)` de `ingestion_events`, que PostgreSQL exige. Se reordenó a mano en la `0038`, con un comentario.
- **Las cantidades de la v2 vienen de una función nueva de `inventory`** (`withServiceAvailableStock`), y no de `withAvailableStock` de las pantallas, porque las lecturas de servicio reciben el producto de servicio y no el de pantalla. `withPhysicalStock` sigue igual para la v1.
- **`module-boundary` no tiene una lista de dependencias permitidas**: prohíbe importar el interior de otro módulo, pero no distingue qué módulo depende de cuál. «`orders` no depende de `ingestion` salvo en `schema.ts`» (invariante) se verificó por lectura y búsqueda, no con una guarda. Se declara como límite.
- **`order-writes` no cambia**: el pedido del agente escribe por las mismas `insertOrder` e `insertOrderLines`, a través de `writeOrder`, que ahora comparten la app y la ingestión (D-7). La única función nueva del repositorio, `findOrderNumberByIngestionEvent`, solo lee.
- **El reenvío del pedido busca por el id del evento guardado**, así que `duplicate()` de la ingestión recibe ese id; los demás tipos lo ignoran.
- **La pantalla muestra «Equipo»** para un pedido de la app, además de «Agente» (D-11 nombraba solo el segundo), para que la columna «Origen» nunca quede vacía.

### Archivos

Todos los tocados están en la lista autorizada, con la ampliación de arriba. `catalog`, `numbering`, `audit`, `conversations`, `src/shared/` y el esquema de `inventory` no se tocaron. De `src/app/api/read/v1/` no se tocó ningún archivo: la v2 importa su borde y su contrato. De `crm`, solo `lockClientForOrderByPhone` (con su consulta en el repositorio) y su exportación.

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumplido | `orders-schema.test.ts`, cuatro casos nuevos: el pedido del agente como dueño y como `crm_app`; los dos `CHECK` con los cuatro casos inválidos, con los dos roles; el `UNIQUE` del evento y las dos claves compuestas; y el trigger, que rechaza cambiar el autor o el evento y que un pedido de la app pase a ser del agente. Desde R-3, el `UNIQUE`, la clave compuesta y el trigger también con `crm_app` |
| AC-2 | cumplido | `contract-v2.test.ts`: el vector con su texto canónico y su hash, calculado con `sha256sum`; cada `400` de D-1 a D-3; y v1 que rechaza el tipo. Cuatro fixtures de forma asumida |
| AC-3 | cumplido | `orders-agent.test.ts`: el pendiente con su número, los precios copiados, la credencial, el vínculo y la auditoría; sin tocar el stock; el reenvío con el mismo número; el `409`; dos pendientes iguales (D-9); y v1. `ingestion-v2-http.test.ts`, las respuestas HTTP |
| AC-4 | cumplido | `orders-agent.test.ts`: las seis reglas, incluido un total que no cabe con líneas que sí (**corregido por R-1**: la primera versión no lo probaba); la precedencia en seis casos, dos de ellos de R-6; el reenvío con la misma regla aunque ya se cumpla; ningún número consumido |
| AC-5 | cumplido | `orders-agent.test.ts`: contra la desactivación del cliente y del producto en curso, contra un cambio de precio en curso (toma el nuevo), dos eventos en paralelo y el mismo evento en paralelo |
| AC-6 | cumplido | `orders-agent.test.ts`: el cliente y el producto de otra organización |
| AC-7 | cumplido | `read-api-v2.test.ts`, siete casos (desde R-4, la allowlist en las tres rutas), y `src/app/api/read/v2/contract.test.ts` con el mapeo y tres fixtures de forma asumida; la v1 sigue con el físico en el caso 3 y en los tests de la 19.3 |
| AC-8 | cumplido | `orders.spec.ts` caso 7: «Origen» en la lista con «Agente» y «Equipo», «Agente · emisor» en el detalle, la credencial en la historia y la confirmación de un pedido del agente; axe en claro y oscuro. `pedidos/messages.test.ts`, el texto |
| AC-9 | cumplido | `analytics-ingestion.test.ts`, un caso nuevo con los totales calculados a mano |
| AC-10 | cumplido en parte | `exposed-surface` con las tres rutas (88); `order-writes` sin cambios, porque no hay escrituras nuevas. **`module-boundary` no cumple lo que pide el criterio**: no lleva dependencias permitidas, así que no vigila `ingestion → orders` (R-2). El invariante se cumple hoy, verificado por búsqueda de imports, sin una guarda que lo fije |
| AC-11 | cumplido | la batería, abajo; la CI del commit `9c8bc54b312d276597cd3bcf9136c3c4f5d28111`, leída por su hash completo: `success` (run 38193892481, unos 12 minutos) |
| AC-12 | cumplido | los contratos (`ingestion-v2.md` §Pedidos, `read-v2.md` nuevo, la nota de `read-v1.md`), DataModel, Overview, SecurityModel (88), TraceabilityMatrix (FR-ORD-11 y FR-API-11), FunctionalRequirements, Screens, MetricsCatalog §12, IntegrationBoundaries, EngineeringStandards y la precisión fechada del ADR 0020, punto 7 |
| AC-13 | cumplido | `Confirmacion-19.4-CRM-al-Agente.md` en el Escritorio del usuario, autorizada el 2026-10-11: los dos contratos, los fixtures, D-8, D-9 y las tres diferencias de H-6 |

**Mutaciones** sobre el código real, cada una corrida y revertida:

| Mutación | Test | Resultado |
|---|---|---|
| la búsqueda v2 deriva el estado del saldo físico | `read-api-v2.test.ts` | falla, 1 caso |
| el agente deja pedidos a un cliente desactivado | `orders-agent.test.ts` | fallan 2 |
| el reenvío no busca el pedido por su evento | `orders-agent.test.ts` | fallan 2 |
| un producto inactivo se acepta en el pedido del agente | `orders-agent.test.ts` | fallan 3 |
| el agente no rechaza un total que no cabe (desde R-1) | `orders-agent.test.ts` | falla 1; antes de R-1, ninguno |
| sin mutación | los dos | 21 en verde |

**Batería local** (2026-10-11, Git Bash): formato, lint, typecheck y build en verde; 702 unitarios, 559 guardas, 1008 de integración en 59 archivos, y el end-to-end en dos tandas sobre `next start`: 80 y 81, con un fallo en la primera. **El fallo es `clients.spec` caso 9**, que el HANDOFF ya registraba como intermitente desde la 19.2: falló por el límite de 30 s del caso, sin ninguna aserción en rojo; corrido solo, falló una vez de dos y pasó 5 de 5 con repeticiones, entre 10 y 25 s. En total, 2 de 9 corridas. No toca pedidos ni la lectura. Se declara, no se explica.

## Revisión independiente de la 19.4.1 — 2026-10-11

Un agente de solo lectura que no participó del trabajo revisó la entrega contra este brief, el ADR 0020, los contratos y las reglas vigentes, sin ejecutar nada. **Veredicto**: 2 hallazgos medios y 6 bajos, ninguno bloqueante. Cada uno se verificó contra el código antes de aceptarlo:

- **R-1 (medio, verificado)**: el caso «dos líneas que caben y un total que no» usaba una segunda línea que **ya no cabía sola** (1500 × 99 999 999 999), así que la rama del total del pedido nunca corría, y la autoevaluación decía que sí. **Corregido**: dos líneas de 599 999 999 999,99 y 600 000 000 000, y una mutación que quita la rama ahora falla.
- **R-2 (medio, verificado)**: AC-10 pide que `module-boundary` vigile `ingestion → orders`, y la guarda no tiene dependencias permitidas. **No corregido**: AC-10 queda «cumplido en parte». **Decisión del usuario (2026-10-11)**: una guarda de dependencias entre módulos se hace en una subfase posterior, que se registra en Notion al cerrar la 19.4; mientras tanto, la dependencia se verificó por búsqueda de imports.
- **R-3 (bajo, verificado)**: el trigger, el `UNIQUE` y las claves nuevas se probaban solo con el dueño. **Corregido**: también con `crm_app`.
- **R-4 (bajo, verificado)**: faltaba una credencial `read` fuera de la allowlist en la v2. **Corregido**, en las tres rutas.
- **R-5 (bajo, verificado)**: §Pedidos decía «en minúsculas» sin la asimetría que sí documentan las etiquetas. **Corregido** en `ingestion-v2.md`.
- **R-6 (bajo, verificado)**: faltaban dos precedencias: el cliente desactivado antes que un producto, y la moneda antes que el monto en la misma línea. **Agregadas**.
- **R-7 (bajo, verificado)**: un comentario de `orders.spec.ts` quedó separado de su bloque. **Corregido**.
- **R-8 (bajo, verificado)**: el ADR 0020, §Consecuencias, dice «Ningún módulo existente depende de `orders`», y desde la 19.4 `ingestion` depende. Overview ya lo corrige con fecha; el ADR no, porque este brief prohibía tocar su texto más allá del punto 7. **Corregido** con autorización del usuario (2026-10-11): una nota fechada en §Consecuencias, verificada por búsqueda de imports (`ingestion/service.ts` importa `@/modules/orders`; `orders` importa de `ingestion` solo en `schema.ts`).

Las notas N-1 a N-8 no son defectos. N-1 se incorporó al contrato: `duplicate` con `order: null` solo si el evento no tuviera pedido, que no pasa. Las demás: la `0038` no es puramente aditiva (declarado en H-1); el Roadmap sigue en futuro hasta el cierre; el e2e arma el pedido del agente por SQL; «Equipo» está declarado; la consulta de `crm` es lo mínimo que la función necesita; `order-writes` verificado.

## Despliegue de la 19.4.2 — 2026-10-12

Autorizado por el usuario el 2026-10-12. Según [deploy/production/README.md](../../deploy/production/README.md) §Desplegar un cambio (autoevaluación):

- **La CI del SHA exacto**: `9c8bc54b312d276597cd3bcf9136c3c4f5d28111`, `success`, leída por `headSha`. Se despliega el SHA de la 19.4.1, no el commit posterior de documentación.
- **Volver atrás**: se anotó `50da0be` en el registro de despliegues. Ese código no conoce al autor de servicio, pero mientras no haya pedidos del agente, los `CHECK` de la `0038` los cumple: sus pedidos llevan siempre usuario.
- **El despliegue**: checkout, `npm ci`, la migración, el build y el reinicio terminaron sin errores, con HEAD igual al SHA pedido.
- **AC-14 cumplido**:
  - migraciones de 38 a 39;
  - `orders.created_by` nulable, `created_by_credential_id` e `ingestion_event_id`, los `CHECK` `orders_one_creator` y `orders_event_iff_credential`, y el `UNIQUE` `ingestion_events_organization_id_id_unique` existen;
  - los recuentos quedaron iguales: `organizations` (2), `clients` (2), `products` (5), `orders` (3, los tres con usuario), `order_lines` (4), `inventories` (4), `inventory_movements` (6), `ingestion_events` (146) y `audit_logs` (70), con el saldo total en 44 y lo reservado en 0;
  - el servicio está activo, sin avisos en el journal;
  - desde afuera: `/login` responde `200`, las tres rutas v2 y `GET /api/read/v1/products` responden `401` sin token. **No se probó con token**: el token no pasa por la conversación; lo prueba la 19.4.3.

## La ventana de la 19.4.3 — abierta el 2026-10-12

El usuario autorizó el 2026-10-12 el aviso del despliegue y abrir la ventana en el mismo aviso: `Aviso-19.4.2-CRM-al-Agente.md`, en el Escritorio. El agente hace primero una lectura de control de las tres rutas v2. Si da `200` con la forma del contrato, promueve sus cinco tools, incluida la que deja pedidos, solo en Demostración Vixora. Se pidieron un pedido aceptado, su reenvío `duplicate`, un `422` con su `conversation.escalated` y las capturas de cada evento y lectura, sin el token.

### La conciliación de la lectura v2 — 2026-10-12

El agente informó su parte en `Conciliacion-3.48-Ventana-19.4.3.md` (Escritorio del usuario). Se concilió contra producción, en solo lectura (autoevaluación):

- **Las nueve lecturas informadas están en el journal**, cada una con su `X-Request-Id`, la misma ruta, `code: OK`, la organización Demostración Vixora, la fuente `agente-demo` y la misma correlación:
  - el control a las 12:27 UTC: la búsqueda, el detalle y el stock v2, y el stock v1 para comparar;
  - tres turnos reales del usuario por WhatsApp, entre las 12:55 y las 12:57: dos búsquedas y un stock v2 (Celular Aurora X3 64 GB), una búsqueda v2 (Aurora X5) y `knowledge` v1.
- **Hay una más que el agente no informó**: una búsqueda v2 a las 12:25:29, con la correlación del control, `OK`. Las otras siete lecturas de esa franja son las v1 de contexto de cada turno.
- **El stock leído coincide con la base**: el Aurora X3 tiene 1 físico y 0 reservado, y la v2 dio `"1"`, `"0"`, `"1"` y `bajo_stock`, igual que la v1. **Lo disponible con reservas no se vio en producción**: no hay nada reservado.
- **Sin avisos** en el journal desde las 12:20. Siguen 3 pedidos, y no llegó ningún `order.placed` ni `conversation.escalated` hoy.
- **El agente no mandó `order.placed`**: es su subfase 3.49, sin brief ni código todavía. Los pasos 2 a 4 de la ventana no se hicieron. **AC-15 queda cumplido solo para la lectura v2.**
- **Su pregunta sobre el `422`** encontró una ambigüedad del contrato: «la regla en `rule` y en `error_code`» se lee como dos campos de la respuesta, y `error_code` es la columna de `ingestion_events`. El cuerpo es `{ code, request_id, rule }`, y así lo tomó el agente. Se aclaró con fecha en `ingestion-v2.md`, en §Etiquetas y en §Pedidos. La confirmación al agente repetía la frase.

### La conciliación del pedido — 2026-10-12

El agente avisó que estaba listo en `Aviso-3.49-Ventana-19.4.3.md`, y su conciliación está en `Conciliacion-3.49-Ventana-19.4.3.md` (los dos en el Escritorio del usuario). Se concilió contra producción, en solo lectura (autoevaluación):

- **Antes de la ventana**: 3 pedidos, 195 eventos y 73 registros de auditoría, sin nada reservado. Un primer intento del agente, parado de su lado, dejó dos `conversation.escalated` procesados (15:14 y 15:19 UTC) y ningún `order.placed`.
- **El pedido (paso 2b)**: el `order.placed` `…92b6baa2e468` quedó `processed` a las 17:24:27 y creó **`P-000004`**:
  - `pending`, en ARS, sin usuario y con la credencial `ingest` de `agente-demo` como autor, vinculado a su evento;
  - una línea: el Celular Aurora X5 128 GB, cantidad 1, con el precio vigente copiado (450 000,00), y total 450 000,00;
  - en la auditoría, un `create` de `order` con la credencial como actor;
  - el contador de pedidos de la organización, en 4.
- **El reenvío (paso 2c)**: a las 17:32:31, `OK` en el journal con la correlación del pedido. **No hay un evento ni un pedido nuevos**: sigue un solo `order.placed` con esa referencia. El agente recibió `duplicate` con `P-000004`.
- **El rechazo (paso 3b)**: la Funda se desactivó a las 17:26:14 y se reactivó a las 17:30:12, con su `deactivate` y su `reactivate` en la auditoría. El `order.placed` `…9a4f42dc916f` quedó `failed` con `error_code = product_not_found`, y el journal registra el `422` con el `request_id` que informó el agente. **No consumió un número**: el contador sigue en 4. Su `conversation.escalated` quedó `processed` a las 17:26:54.
- **El segundo «sí» (paso 4)**: ningún pedido. Hubo una derivación común que el aviso no anunciaba (`…5b5b5f24a1f3`, `processed`), por un control nuevo del agente. Es un límite del agente, que lo corrige de su lado sin cambiar el contrato.
- **Después**: 4 pedidos, 5 líneas, 222 eventos y 76 registros de auditoría, con lo reservado en 0. Los dos productos están activos. La conversación de prueba quedó `pending`. El journal no tiene avisos del sistema; su única línea `warn` es el `422`.
- **Un límite aceptado**: el agente no vuelve a leer los productos en el «sí», y guarda su propuesta 30 minutos. Un producto desactivado en el medio lo frena el `422`, como en el paso 3. **Un precio cambiado en el medio no**: el CRM copia el vigente, que puede no ser el que leyó el cliente. Lo resuelve la persona que confirma el pendiente.
- **AC-15**: cumplido en lectura v2, pedido aceptado, `duplicate`, `422` y derivación, con la conciliación cerrada. **Faltan**: cancelar `P-000004` desde la app y las capturas como fixtures `"shape": "captured"`.

## Cierre de la subfase 19.4 y de la Fase 19, 2026-10-12

Cierra el 2026-10-12 con la aprobación del usuario («cierre completo»), después de la ventana con el agente en producción.

- **AC-1 a AC-15 cumplidos**, con dos salvedades:
  - **AC-10, en parte**: `module-boundary` no vigila `ingestion → orders` (R-2). Por decisión del usuario, una guarda de dependencias entre módulos va en una subfase posterior, con su tarea en Notion. La dependencia se verificó por búsqueda de imports.
  - **AC-15, sin el aviso de cierre de D-15**: el usuario decidió no mandarlo, porque el agente ya cerró su subfase. Lo que el aviso iba a llevar, que el `422` es `{ code, request_id, rule }`, el agente ya lo había tomado así.
- **Las capturas** (AC-15), con su test ajustado para aceptarlas:
  - `tests/fixtures/ingestion/v2/captured-order-placed.json`: el pedido aceptado, con sus respuestas `accepted` y `duplicate`;
  - `tests/fixtures/ingestion/v2/captured-order-placed-rejected.json`: el `422 product_not_found`. Un `422` es una regla sobre una forma válida, así que la captura valida;
  - `tests/fixtures/read/v2/captured-product-stock.json`: el stock v2 de la lectura de control.

  El agente mandó el teléfono tapado; **se reemplazó por uno del rango sintético**, lo único cambiado de los cuerpos, como dicen sus notas. n8n guarda los cuerpos ya parseados: las capturas validan la forma, no los bytes.
- **La limpieza**: `P-000004` cancelado desde la app y la Funda reactivada.
- **Revisión**: la independiente de la 19.4.1 (R-1 a R-8, arriba). La batería, el despliegue, las dos conciliaciones y este cierre son autoevaluación declarada.
- **Decisiones del usuario**:
  - el brief, con las recomendaciones, y la ampliación a `src/app/api/ingestion/v1/events/handler.ts`;
  - R-2 a una subfase posterior y la nota fechada de R-8 en el ADR 0020;
  - la confirmación del contrato y el aviso que abrió la ventana en el mismo paso;
  - esperar la 3.49 del agente para los pasos 2 a 4;
  - las capturas con el teléfono reemplazado, el cierre completo con la Fase 19 y sin aviso de cierre;
  - el commit y el push de `9c8bc54` y de los registros, el despliegue y este cierre.
- **Nivel**:
  - validado localmente y en CI;
  - **validado en integración** con el agente como emisor y consumidor real, en la organización de demostración de producción: la lectura v2, un pedido aceptado, su reenvío, un rechazo y su derivación;
  - desplegado en producción.

  No es «preparado para producción».
- **No certifica**:
  - **lo disponible con reservas en producción**: el agente leyó la v2 sin nada reservado;
  - con el emisor real, `client_inactive`, `currency_mismatch`, `amount_out_of_range` ni un pedido de más de una línea: lo cubren los tests de integración;
  - que el precio del pedido sea el que leyó el cliente: el agente guarda la propuesta 30 minutos, y el CRM copia el precio vigente al crear el pedido;
  - que un segundo «sí» no derive la conversación: es un límite del agente, que lo corrige de su lado;
  - una guarda que fije la dependencia `ingestion → orders` (R-2).

### La Fase 19

**La Fase 19 — Pedidos cierra con sus cuatro subfases** (19.1 a 19.4): el ADR 0020; el pedido con su número, sus líneas y su cancelación; la reserva, la entrega y lo disponible; y el pedido del agente con la lectura v2. **La decisión del ADR 0020, punto 7, quedó tomada en la 19.4**: el agente lee lo disponible por la v2, y la v1 sigue con el saldo físico hasta que el agente la deje.
