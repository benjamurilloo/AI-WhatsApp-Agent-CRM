---
schema: task-brief.v1
task_id: "29.8.2"
task_type: implementation
generated_at: 2026-10-22
---

# Brief 29.8.2 — Las reparaciones y las órdenes de servicio para el agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Dos rutas nuevas en `read-v3`, código, pruebas, despliegue y una ventana con el agente real. **Sin migración.**
- **Nivel de evidencia objetivo**:
  - `deterministic`, con tests contra PostgreSQL;
  - `producer-consumer` del lado del CRM: contrato ↔ servicio ↔ base;
  - **validado en integración con el agente** en una ventana como la de la 29.8, si el agente adopta el contrato (D-8).
- **Estado**: **aprobado por el usuario el 2026-10-22, con las recomendaciones: U-1 a U-4 en su opción (a).** La U-1 es la decisión de privacidad que dejó pendiente la 29.8 (brief-29.8, H-9): el agente identifica al cliente por la conversación, y el teléfono nunca viaja en una lectura. **No se implementa hasta que el agente confirme por escrito que lo va a usar**, o pida cambios (D-8). La pregunta está en `Pregunta-29.8.2-CRM-al-Agente.md`, en el Escritorio del usuario. El agente contestó el mismo día (§La respuesta del agente). **El usuario decidió el 2026-10-22 empezar a implementar**, sin esperar a que el agente adopte las rutas: la ventana queda para cuando lo haga (D-8).
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md): punto 7 (la lista de reparaciones), punto 10 (la orden de servicio), punto 14 (lo que el agente nunca lee), punto 15 (el agente) y la nota de la 29.8;
  - [ADR 0007](0007-identificador-de-cliente-solo-telefono.md), la identidad del cliente;
  - [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md);
  - [ADR 0025](0025-tipo-de-cambio.md), punto 10, el precio convertido;
  - [brief-29.8](brief-29.8-el-catalogo-del-rubro-para-el-agente.md), §La división y H-9;
  - [brief-16.3](brief-16.3-pausar-y-reanudar-al-agente.md), el precedente de una lectura por `conversation_ref`;
  - [contratos](../contracts/): `read-v1.md` (§`messages` y §`conversation-state`) y `read-v3.md`.

## Objetivo

Que el agente conteste dos preguntas que hoy deriva a una persona:

1. **«¿Cuánto sale cambiarle la batería a un iPhone 11?»**: qué reparaciones hace el negocio y su precio al cliente para un modelo (ADR 0024, puntos 7 y 15).
2. **«¿Cómo va mi equipo?»**: en qué estado están las órdenes de servicio del cliente con el que habla y, si ya tiene presupuesto, cuánto es (punto 15).

Las dos son lecturas. **El agente no registra ni aprueba nada** (punto 15, «Lo que no registra el agente»). Si el cliente quiere aprobar un presupuesto, el agente deriva a una persona.

## Hallazgos (verificados contra el código en `5ebd724`, 2026-10-22)

- **H-1. Hoy ninguna lectura del agente recibe un teléfono.** La pregunta 2 es la primera lectura del agente sobre datos de un cliente.
  - Las lecturas por conversación (`messages` y `conversation-state` de `read-v1`) reciben `conversation_ref`, la referencia opaca que el agente mandó en `conversation.resolved`. Exigen el alcance `context`.
  - El teléfono solo entra por la ingestión, en el cuerpo de un `POST` (`conversation.client_phone`, `client.phone`).
  - El log de la lectura nunca guarda la referencia de una conversación (`read-v1.md`, §Observabilidad), porque la arma el consumidor y el CRM no puede comprobar que no lleve un teléfono.
- **H-2. La conversación ya sabe quién es el cliente.** `conversation.resolved` resuelve el cliente por su teléfono (ADR 0007) y deja `conversations.client_id`. La columna admite `null` en la base, para una conversación sin cliente resuelto. Del agente no llega ninguna así, porque `client_phone` es obligatorio.
- **H-3. `service` ya tiene la lectura por cliente**: `listClientServiceOrders` devuelve las 5 últimas (`CLIENT_SERVICE_ORDERS_LIMIT`). Pasa por `authorize` y exige una persona, así que el agente necesita una función `…ForService` nueva. La guarda `service-read-entry-points` fija quién la puede llamar.
- **H-4. Lo que guarda una orden** (`service_orders`):
  - el número (`OS-000123`), el tipo (`customer_device` o `own_unit`), el modelo, el estado y las fechas de cada transición;
  - **el IMEI (`device_serial`) y lo que reporta el cliente (`reported_issue`)**, que son datos personales: el vaciado los deja en `null` (brief-29.6, D-11);
  - el técnico, el presupuesto al cliente (`customer_total` y su moneda), el costo del técnico y la venta.

  Las líneas del presupuesto tienen el tipo de reparación, el precio al cliente y el costo del técnico.
- **H-5. Los modelos con reparaciones no son los modelos que se venden.** La lista de precios va por modelo (`repair_prices`, punto 7), y un negocio repara modelos que no tiene en venta. El agente no tiene cómo llegar a un modelo sin producto: `read-v3` no tiene ruta de modelos (decisión del usuario del 2026-10-22), y el `model_id` solo sale de un producto.
- **H-6. El producto de servicio sigue fuera de la lectura** desde la 29.6 (ADR 0024, punto 10). Es un solo producto, «Reparación», que se vende solo por su orden. Al agente no le sirve: lo que contesta sale de la lista.
- **H-7. La guarda `agent-contract-fields`** rechaza en las respuestas cualquier clave con `serial`, `imei`, `cost`, `margin`, `dni`, `instagram` o `national_id`. Cubre las rutas nuevas sin cambios si se exportan sus esquemas.
- **H-8. Una ruta nueva dentro de `read-v3` es un cambio compatible**: ninguna respuesta existente cambia, y `contract_version` sigue en `"3"`. Es el precedente de `client-tags` y `conversation-state` en v1.
- **H-9. Lo que ve un `viewer`** de una orden es todo menos el técnico y su costo (punto 14). El agente ve menos que un `viewer` (D-4).

## Decisiones del usuario

**Decididas el 2026-10-22: las cuatro en su opción (a), la recomendada.**

### U-1. Cómo identifica el agente al cliente (la decisión de privacidad)

- **(a) Por la conversación (recomendada).** `GET /api/read/v3/service-orders?conversation_ref=…`, con el alcance `context`, como `messages` y `conversation-state`. El CRM busca la conversación, toma su cliente y devuelve sus órdenes. **El teléfono nunca viaja en una lectura.** No suma una superficie nueva: con la misma credencial, el agente ya lee los mensajes de esa conversación.
- **(b) Por el teléfono, en la consulta.** `?phone=+549…` deja el teléfono en la URL. Una URL termina en logs que el CRM no controla: el proxy, el journal y, si un día los hay, los de un tercero. Contradice H-1, y la regla del log se volvería más difícil de sostener.
- **(c) Por el número de orden.** `?number=OS-000123`, que el cliente le dicta al agente. No necesita saber quién es el cliente, pero **cualquiera que tenga el número ve el estado y el monto**: el número es correlativo y se adivina. Solo valdría combinado con (a), para verificar que la orden sea del cliente de la conversación.

**Límite que se acepta con (a)**, el mismo del ADR 0007: el cliente es su teléfono. Quien escribe desde el WhatsApp de otra persona ve las órdenes de esa persona. Pasa igual con el historial y los pedidos.

### U-2. Qué ve el agente de una orden

- **(a) El estado y el presupuesto (recomendada).** El número, el modelo, el estado, la fecha de la última transición y, desde `quoted`, el total al cliente con su moneda y **las reparaciones presupuestadas con su precio al cliente**. Así el agente contesta «el presupuesto es cambio de pantalla, US$ 120».
- **(b) Solo el estado.** El agente dice «ya está presupuestado» y deriva para el monto.

En los dos casos **no ve** el IMEI, lo que reportó el cliente, el técnico, el costo, la venta ni el motivo de una cancelación (D-4).

### U-3. Qué órdenes ve

- **(a) Las abiertas y las cerradas en los últimos 30 días, hasta 5, de la más nueva a la más vieja (recomendada).** Una orden entregada la semana pasada todavía responde «¿ya la retiré?». Una de hace un año no aporta y solo expone historia.
- **(b) Solo las abiertas** (`received` a `repaired`, y `rejected` sin entregar). El agente no puede confirmar una entrega.
- **(c) Las 5 últimas, sin importar la fecha**, como la ficha del cliente.

Una orden de una unidad propia (`own_unit`) no es de ningún cliente y nunca aparece.

### U-4. Cómo encuentra el agente el modelo de una reparación (H-5)

- **(a) Por texto (recomendada).** `GET /api/read/v3/repairs?q=iphone 11` busca entre **los modelos que tienen al menos un precio de un tipo activo**, por prefijo de palabra en el nombre y la marca, como la búsqueda de productos. También acepta `model_id`, para cuando el agente ya viene de un producto. Devuelve cada modelo con sus reparaciones y sus precios.
- **(b) Solo por `model_id`.** Más simple, pero el agente no encuentra un modelo que el negocio repara y no vende. Es el caso más común de una reparación.

## Decisiones

### D-1 — El borde y la versión

- Dos rutas nuevas en **`read-v3`**, un cambio compatible (H-8). `contract_version` sigue en `"3"`.
- El borde es el de v3: 404 apagada, 401, 403 por alcance o por la lista de credenciales permitidas, límite, correlación y log fijo.
- **Las dos exigen la capacidad `repairs`.** Sin ella, `repairs` devuelve `items: []` y `service-orders` también, como el filtro por modelo sin `variants`. El agente sabe si existe por la ruta de capacidades.
- **Alcances**: `repairs` es `read`, porque la lista es configuración del negocio. `service-orders` es `context`, porque son datos de una persona, y comparte el límite de 120 pedidos por minuto con `messages` y `conversation-state`.

### D-2 — Las reparaciones (U-4)

`GET /api/read/v3/repairs`, con `q` (las reglas de `q` de la lista de productos) o `model_id`; **uno de los dos es obligatorio**, y los dos juntos son un `400`. Hasta 10 modelos, ordenados por nombre.

```json
{
  "contract_version": "3",
  "items": [
    {
      "model": { "model_id": "…", "name": "iPhone 11", "brand": "Apple" },
      "repairs": [
        {
          "repair_type_id": "…",
          "name": "Cambio de batería",
          "price": { "amount": "45.00", "currency": "USD" },
          "price_converted": { "amount": "…", "currency": "ARS", "rate": "…", "as_of": "…" }
        }
      ]
    }
  ]
}
```

- **Entran los tipos activos que tienen precio para ese modelo**, en el orden de la organización. Un modelo sin ninguno no aparece.
- **Solo el precio al cliente.** El costo estimado nunca sale (punto 7).
- **`price_converted`** con la regla de v3 (ADR 0025, punto 10): `null` en cada caso en que es `null` para un producto.
- **Un tipo con la marca `is_example` entra igual.** La marca dice que el nombre vino del perfil. Los precios los carga siempre el negocio, porque el perfil no trae precios de reparación (brief-29.6).

### D-3 — Las órdenes del cliente (U-1 y U-3)

`GET /api/read/v3/service-orders?conversation_ref=…`, con las reglas de `conversation_ref` de v1.

- **Una conversación inexistente o de otra organización da `404 NOT_FOUND`**, sin distinguir, como en `conversation-state`.
- **Una conversación sin cliente**, o un cliente sin órdenes, da `items: []`.
- **Cuáles**: las `customer_device` del cliente, según U-3, de la más nueva a la más vieja. Nunca una `own_unit`.
- **La referencia no queda en el log**, como en v1.

### D-4 — Qué lleva cada orden (U-2)

| Campo | Notas |
|---|---|
| `number` | `"OS-000123"`, el número que el cliente tiene en su comprobante |
| `model` | `{model_id, name, brand}` |
| `status` | `received`, `sent`, `quoted`, `approved`, `rejected`, `repaired`, `delivered` o `cancelled` |
| `status_at` | la fecha de la última transición |
| `received_at` | la fecha de alta |
| `quote` | `null` antes de `quoted`. Desde ahí: `{total: {amount, currency}, repairs: [{name, price}]}` |

- **El contrato explica cada estado en palabras del cliente.** Por ejemplo, `rejected` significa que el cliente no aprobó el presupuesto y el equipo espera a que lo retire, y `repaired` que está listo para retirar. Así el agente no lo deduce.
- **No lleva** el IMEI, lo que reportó el cliente, el técnico, el costo, la venta ni el motivo de una cancelación. El motivo puede ser `entered_by_mistake`, que no es para el cliente.
- **El presupuesto no lleva `price_converted`.** Un presupuesto es un monto comprometido en su moneda, y la conversión de hoy no es lo que se cobra al entregar. Si el cliente pregunta en pesos, el agente deriva.

### D-5 — Los productos de servicio siguen fuera

La 29.8 dejó el producto de servicio fuera de `read-v3` «hasta la 29.8.2». **La 29.8.2 lo deja fuera** (H-6): lo que el agente contesta sale de la lista. Va como nota fechada en el ADR 0024, punto 15.

### D-6 — Las dependencias

- `service` expone dos lecturas nuevas, `listRepairPricesForService` y `listClientServiceOrdersForService`. Las dos reciben la organización de la credencial y no pasan por `authorize`, como las demás `…ForService`. Entran en la lista de la guarda `service-read-entry-points`.
- `conversations` expone `getConversationClientForService`: la referencia da el cliente, o `NOT_FOUND`.
- **Las compone el handler de la ruta**, como las demás de la lectura. **Ningún módulo suma una dependencia.** `service` no conoce `conversations`, y al revés tampoco.
- La regla 2 de `service-dependencies` ya admite `src/app/`.

### D-7 — Lo que el agente nunca lee

- Los esquemas nuevos se exportan desde `src/app/api/read/v3/contract.ts`, y la guarda `agent-contract-fields` los cubre sin cambios (H-7).
- Los tests de integración buscan en el cuerpo crudo de cada respuesta:
  - el IMEI de la orden;
  - lo que reportó el cliente;
  - el costo del técnico de cada línea;
  - el costo estimado de la lista;
  - el teléfono del cliente.

### D-8 — El agente, la nota y la ventana

- Como en la 29.8: **no se implementa hasta que el agente confirme por escrito que lo va a usar, o pida cambios**. La pregunta va en `Pregunta-29.8.2-CRM-al-Agente.md`, en el Escritorio del usuario, con las rutas, los campos, los estados y lo que no hace.
- Al desplegar, hace falta en «iPhone Demo»:
  - una lista con al menos un modelo y precios;
  - una orden de servicio de prueba de un cliente que tenga una conversación del agente.
- La ventana concilia por `X-Correlation-Id`, como la de la 29.8.

### D-9 — La documentación

- `read-v3.md`, con las dos rutas.
- Notas fechadas en el ADR 0024:
  - punto 15: las dos rutas, U-1 y D-5;
  - punto 14: lo que el agente lee de una orden.
- `SecurityModel.md`: las dos rutas en el recuento de puntos de entrada.
- `exposed-surface`: sus entradas.
- `DataModel.md` no cambia, porque no hay migración.

### La respuesta del agente (2026-10-22)

El agente confirmó por escrito que **va a usar las dos rutas con la forma de D-2 a D-4, sin cambios ni datos nuevos**. Las adopta en una subfase suya, después de su 3.51, todavía sin fecha. Lo que contó de su lado, verificado por él contra su código en solo lectura y no por el CRM:

- **`repairs`**:
  - busca solo por `q`, con el modelo que nombra el cliente, y no usa `model_id`;
  - nunca manda la reparación en `q`, porque la búsqueda exige todas las palabras;
  - con varios modelos que empiezan igual (el 11 y el 11 Pro), toma el que coincide exacto o le pregunta al cliente;
  - con `items: []`, deriva a una persona, y no lee las capacidades.
- **`service-orders`**:
  - la lee solo cuando el cliente pregunta por su equipo, con la `conversation_ref` del turno;
  - sin referencia, o con un `404`, deriva a una persona;
  - nunca aprueba un presupuesto ni promete una fecha;
  - **acepta el límite del teléfono** de U-1, y lo anota entre sus limitaciones.
- **Sus dos preguntas, contestadas** en `Respuesta-29.8.2-CRM-al-Agente.md`:
  - el tope de reparaciones por modelo: no hay ninguno, porque la lista no tiene un máximo, y el perfil de iPhone trae 6 tipos;
  - el número de la orden: **se le puede decir al cliente**, porque figura en el comprobante de recepción que se lleva (brief-29.6).
- **Para la ventana** (D-8), escribe desde el mismo teléfono de prueba de la ventana de la 29.8, cuyo cliente ya existe en «iPhone Demo». Pide:
  - un modelo con precios que el negocio no vende;
  - dos modelos con nombres que empiezan igual;
  - una orden `quoted` con presupuesto;
  - otra en un estado anterior.

No cambia ninguna decisión del brief.

## Alcance incluido

- `GET /api/read/v3/repairs` y `GET /api/read/v3/service-orders`, con sus validadores y sus esquemas en `contract.ts`.
- Las lecturas `…ForService` de D-6, en `service` y `conversations`.
- Las guardas `service-read-entry-points`, `exposed-surface` y `agent-contract-fields` al día, con sus casos de fallo.
- Tests unitarios, de integración y de guardas. Fixtures de forma asumida.
- La documentación de D-9, la nota para el agente y la ventana.

## Alcance excluido

- **Que el agente apruebe o rechace un presupuesto**, cree una orden o cambie un estado: lo hace una persona (punto 15).
- **La garantía** (29.9) y **los turnos** (29.10).
- **La cotización de un usado** (29.8.3).
- **El producto de servicio en la lectura** (D-5).
- Cambios en `read-v1`, `read-v2`, en las rutas existentes de `read-v3` y en la ingestión.
- Una ruta de modelos (decisión del usuario del 2026-10-22).
- Avisarle al cliente cuando cambia el estado: el CRM no envía mensajes (Scope, §Sigue fuera).

## Invariantes

- **El teléfono nunca viaja en una lectura**, ni en la consulta ni en la respuesta.
- El agente nunca lee un IMEI, un costo, un margen, un DNI, un Instagram, lo que reportó el cliente ni el técnico.
- Una orden de otra organización, de otro cliente o de una unidad propia nunca aparece.
- La referencia de la conversación no queda en el log.
- Ninguna ruta existente cambia su respuesta.
- Ningún módulo suma una dependencia.

## Criterios de aceptación

- **AC-1**: `repairs` busca por `q` y por `model_id`. Devuelve solo los modelos con un precio de un tipo activo, con el precio al cliente y su `price_converted`. Rechaza con `400` la falta de los dos parámetros y los dos juntos.
- **AC-2**: `service-orders` devuelve las órdenes `customer_device` del cliente de la conversación, según U-3, con los campos de D-4. Da `404` sin distinguir una conversación ajena de una inexistente, y `items: []` sin cliente o sin órdenes.
- **AC-3**: el presupuesto aparece desde `quoted`, con su total y sus reparaciones, y es `null` antes.
- **AC-4**: sin la capacidad `repairs`, las dos rutas devuelven `items: []`.
- **AC-5**: el cuerpo crudo no contiene el IMEI, lo que reportó el cliente, un costo ni el teléfono, probado con valores sembrados. La guarda `agent-contract-fields` pasa.
- **AC-6**: el borde de v3 en las dos rutas, probado: 404 apagada, 401, 403 por alcance (`read` en `service-orders` da 403) o por lista, límite, correlación y log fijo sin la referencia.
- **AC-7**: aislamiento entre organizaciones y entre clientes de la misma organización.
- **AC-8**: `read-v1`, `read-v2`, las rutas de `read-v3` de la 29.8 y la ingestión responden igual que antes.
- **AC-9**: guardas, unitarias, integración y end-to-end pasan en CI, y `trade-ins.test.ts` pasa antes del push.
- **AC-10**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-11**: desplegada. Si el agente adoptó el contrato, hay una ventana conciliada. Si no, la ventana queda en «Esperando» (D-8).

## Pruebas y evidencia requerida

- **Unitarias**: los validadores de las dos rutas, con cada `400`.
- **Integración** contra PostgreSQL:
  - cada ruta, con aislamiento y con la capacidad apagada;
  - la ventana de U-3 en sus bordes, 30 días justos y 5 órdenes;
  - cada estado, con y sin presupuesto;
  - un tipo inactivo y un modelo sin precios;
  - el cuerpo crudo sin campos prohibidos.
- **Guardas** con sus casos de fallo.
- **Fixtures** de forma asumida, y capturados después de la ventana.

## Condiciones de detención

- **Si una conversación del agente puede quedar sin cliente** por un camino que no sea el de H-2, se para: la regla de D-3 cambia.
- **Si el agente pide escribir algo**, como aprobar un presupuesto o pedir una reparación, se para: es otra subfase y otra decisión.
- **Si el agente pide un campo de los prohibidos** o lo que reportó el cliente, se para y lo decide el usuario.
- **Si hace falta una dependencia nueva entre módulos**, se para y se documenta antes.
- **Si la búsqueda de U-4 necesita un índice nuevo** para responder a tiempo, se para: sería una migración que este brief no prevé.

## Revisión independiente

Esta subfase le da al agente datos de un cliente por primera vez. **Lleva una revisión independiente** de un agente que no participó del trabajo, con acceso de solo lectura, contra este brief y contra las reglas vigentes, antes del despliegue (AC-10). La revisión no autoriza nada.
