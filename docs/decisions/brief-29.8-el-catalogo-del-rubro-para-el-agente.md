---
schema: task-brief.v1
task_id: "29.8"
task_type: implementation
generated_at: 2026-10-21
---

# Brief 29.8 — El catálogo del rubro para el agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Contratos nuevos con el agente, código, pruebas, despliegue y una ventana con el agente real. **Sin migración.**
- **Nivel de evidencia objetivo**:
  - `deterministic`, con tests contra PostgreSQL;
  - `producer-consumer` del lado del CRM: contrato ↔ servicio ↔ base;
  - **validado en integración con el agente** en una ventana como la 19.4.3, si el agente adoptó el contrato (D-11).
- **Estado**: **aprobado por el usuario el 2026-10-22**, con la recomendada de U-1 a U-4. **No se implementa hasta que el agente confirme por escrito que lo va a usar**, o pida cambios (decisión del usuario del 2026-10-21, como en la 19.4). La pregunta está en `Pregunta-29.8-CRM-al-Agente.md`, en el Escritorio del usuario (D-11). **El agente respondió el 2026-10-22** que lo va a usar sin cambios de forma (`Respuesta-29.8-Agente-al-CRM.md`, en el Escritorio), con tres aclaraciones. El usuario decidió ese día sacar la ruta de modelos y aceptar la frase «a la cotización vigente» (§La respuesta del agente). Empezar a implementar lo decide el usuario.
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md), punto 15 y sus notas de la 29.5 a la 29.7.3;
  - [ADR 0025](0025-tipo-de-cambio.md), punto 10;
  - [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md);
  - [ADR 0018](0018-imagenes-de-producto.md), punto 7;
  - [brief-19.4](brief-19.4-el-pedido-del-agente.md), el precedente de un contrato nuevo;
  - [brief-29.5.2](brief-29.5.2-las-unidades-en-pedidos-y-ventas.md), las unidades en el pedido;
  - [contratos](../contracts/): `read-v1.md`, `read-v2.md` e `ingestion-v2.md`.

## Objetivo

Que el agente de WhatsApp **ofrezca lo que vende el negocio del rubro y lo pida**. Hoy no puede: `read-v1` y `read-v2` esconden los usados (ADR 0024, punto 15, R-14), y el pedido del agente rechaza un producto por unidad como `product_not_found` (29.5).

La 29.8 da, por contratos versionados nuevos:
- **las capacidades** de la organización;
- **el catálogo del rubro**: modelo, variante, condición (con los usados), seguimiento y stock;
- **las unidades disponibles** de un producto, con su grado, su batería y su precio, **sin IMEI ni costo**;
- **el precio en la otra moneda**, convertido por el CRM con la cotización vigente (ADR 0025, punto 10);
- **el pedido de una unidad**: una solicitud pendiente que no reserva y que confirma una persona (ADR 0024, punto 15, R-10).

### La división (decisión del usuario del 2026-10-21)

El punto 15 son seis contratos, sin contar los turnos de la 29.10. El usuario los dividió en tres:

- **29.8** (este brief): las capacidades, el catálogo del rubro con el precio en pesos y el pedido de una unidad.
- **29.8.2**: las reparaciones con su precio al cliente, por modelo, y el estado de las órdenes de servicio del cliente con el que habla el agente. Lleva una decisión de privacidad propia: hoy ninguna lectura del agente se busca por teléfono (H-9).
- **29.8.3**: la cotización orientativa de un usado. Incluye la falta de `checklist_incomplete` (brief-29.7.3, O-3) y la regla de que el agente no cotiza con valores de ejemplo (ADR 0024, punto 13).

## Hallazgos (verificados contra el código en `fa94284`, 2026-10-21)

- **H-1. La superficie se enciende entera, no por emisor.**
  - `READ_API_ENABLED` e `INGESTION_ENABLED` encienden las superficies. Las listas `*_ALLOWED_CREDENTIALS` dicen qué credenciales pasan (`src/app/api/read/v1/config.ts`, `src/modules/ingestion/config.ts`).
  - Cada credencial tiene una organización, un emisor y **un solo alcance**: `ingest`, `read` o `context` (`ingestion/schema.ts`).
  - Una ruta nueva bajo `/api/read/` queda detrás del mismo borde (`serve.ts`), sin cambiar la configuración.
- **H-2. El producto de la lectura no tiene dónde decir lo del rubro.**
  - El objeto es estricto (`z.strictObject`) y su `condition` admite solo `new` y `refurbished` (`read/v1/contract.ts`). No tiene modelo, variante, seguimiento ni unidades.
  - Las reglas de versionado (`read-v1.md`, §Versionado) dicen que agregar un campo de respuesta exige una versión nueva. Lleva a U-1.
- **H-3. El pedido del agente rechaza un producto por unidad.**
  - Lo hace en `orders/service.ts:512-524`, a propósito, hasta la 29.8.
  - `order.placed` tiene líneas estrictas de `product_id` y `quantity` (`contract-v2.ts`). Agregarles un campo exige `ingestion-v3`; un `event_type` nuevo es compatible dentro de v2 (`ingestion-v2.md`, §Versionado). Lleva a U-2.
  - **La confirmación ya sabe qué hacer con un pedido que trae sus unidades** (29.5.2): reserva exactamente esas, o rechaza con `units_unavailable`; sin unidades, rechaza con `unit_tracked` (`orders/service.ts:745-780`). El pedido de la pantalla guarda las unidades en `order_line_units` al crearse, sin reservarlas.
- **H-4. Las unidades no tienen fotos.** El punto 15 dice «las unidades disponibles con su grado, su batería, su precio **y sus fotos**». No hay una columna ni una tabla de fotos de unidad. Lo único que existe es `product_images`, una imagen por producto (ADR 0018). Además, la ruta de imagen para el agente que prevé el ADR 0018, punto 7, no existe. Lleva a U-4.
- **H-5. Las lecturas del rubro exigen una sesión.**
  - `listAvailableUnits`, `listModels` y `getProductVariants` reciben un `AuthContext`, y una ruta del agente solo tiene `{organizationId, source}`. `listAvailableUnits` además devuelve el IMEI.
  - El patrón es una variante `…ForService` que recibe la organización. La guarda `service-read-entry-points` permite nombrarlas solo en `src/modules/` y `src/app/api/read/`.
- **H-6. `fx` no tiene una lectura para el agente.**
  - `getExchangeSetup(organizationId)` ya recibe la organización y no exige sesión. La usa `cash`.
  - El ADR 0025 (§Consecuencias) anticipa que `src/app/api/read/` depende de `fx` desde la 29.8.
  - La cotización vigente lleva `stale` cuando pasaron más de 24 horas hábiles desde su `asOf`. El ADR no dice qué hace el agente con una vencida. Lleva a U-3.
- **H-7. Ninguna guarda fija lo que el agente nunca lee.** El ADR 0024, punto 14, dice que el agente nunca lee el DNI, el Instagram, un IMEI, un costo ni un margen. Hoy solo lo verifica para el costo un test de integración (`read-api.test.ts`, caso 6c).
- **H-8. Los contratos publicados no dicen lo que ya cambió.**
  - `read-v1.md` y `read-v2.md` no dicen que desde la 29.5 y la 29.6 excluyen los usados y los productos de servicio.
  - `ingestion-v2.md` no dice que `product_not_found` incluye un producto por unidad o de servicio.
  - El código lo hace y lo prueba; los documentos quedaron atrás.
- **H-9. Ninguna lectura del agente se busca por teléfono.** Los mensajes y el estado de la conversación usan una referencia opaca, y los contratos evitan datos personales en la consulta. No afecta a la 29.8, porque nada de esta subfase es del cliente. Es la decisión de privacidad de la 29.8.2.
- **H-10. Datos en producción** (consulta de solo lectura, 2026-10-21):
  - «iPhone Demo» tiene 35 productos activos, de los que 2 son usados y 4 se llevan por unidad, **ninguna unidad disponible**, ninguna imagen y **ninguna credencial de servicio**.
  - Las tres credenciales vigentes son de «Demostración Vixora».
  - Para la ventana (D-11), «iPhone Demo» necesita sus credenciales y unidades disponibles. Las crea el usuario.

## Decisiones del usuario

**Decididas el 2026-10-22: la (a) de cada una**, la recomendada. Las alternativas quedan como registro.

- **U-1, la versión de la lectura** (H-2).
  - **(a) Recomendada. `read-v3`**, en `/api/read/v3/`:
    - copia las tres rutas de productos de v2 con el objeto ampliado (D-2);
    - suma ~~tres rutas nuevas: las unidades de un producto, los modelos y las capacidades (D-3 a D-5)~~ **dos rutas nuevas: las unidades de un producto y las capacidades (D-3 y D-5)**. *Corregido el 2026-10-22*: la de modelos sale (D-4).

    **v1 y v2 no cambian** y siguen sin usados. **Por qué**: es la regla del contrato, la misma que siguió la 19.4 con v2. Un producto que en una ruta tiene modelo y en otra no se contradice.
  - (b) Solo rutas nuevas dentro de v2 (unidades, modelos, capacidades), con el objeto del producto sin cambios. El agente no sabría el modelo ni la variante de un producto de la lista, y los usados seguirían fuera de `products`.
- **U-2, el pedido de una unidad** (H-3).
  - **(a) Recomendada. Un `event_type` nuevo en `ingestion-v2`, `order.placed_with_units`.**
    - Cada línea es de cantidad, `{product_id, quantity}`, como hoy, o de unidades, `{product_id, unit_ids}`, según cómo se lleva el producto.
    - **`order.placed` no cambia** y sigue rechazando un producto por unidad.
    - **Por qué**: es compatible dentro de v2 (§Versionado), no obliga al agente a migrar sus otros eventos, y reusa la creación del pedido con unidades de la 29.5.2.
  - (b) `ingestion-v3`, con `order.placed` ampliado. Copia todos los eventos a otra ruta por un solo cambio.
- **U-3, el precio en pesos con una cotización vencida** (H-6).
  - **(a) Recomendada. Sin equivalente**: el campo va `null` cuando no hay cotización o la vigente está vencida (`stale`). El precio en la moneda del producto sigue igual.
    - **Por qué**: «el CRM calcula, el agente presenta» (ADR 0024, punto 9). Que el CRM no dé un número viejo es más seguro que pedirle al agente que interprete una marca.
  - (b) El equivalente siempre que haya cotización, con su fecha y la marca `stale`, y el agente decide.
- **U-4, las fotos** (H-4).
  - **(a) Recomendada. Sin fotos en la 29.8.** Una nota fechada en el ADR 0024, punto 15, registra que la unidad no tiene fotos y que la imagen del producto para el agente es la ruta del ADR 0018, punto 7, para una subfase propia cuando el agente la pida.
    - **Por qué**: fotos por unidad es un diseño nuevo (almacenamiento, carga en la recepción, datos de quien entregó el equipo), y el agente todavía no dijo cómo mandaría una imagen.
  - (b) Sumar en la 29.8 la ruta de la imagen del producto del ADR 0018, punto 7. No resuelve las fotos de cada unidad, y agranda la subfase.

## Decisiones

### D-1 — El borde y la versión (U-1)

- `read-v3` comparte el borde de v1 y v2 (`serve.ts` y `config.ts`): la credencial de alcance `read`, la lista de credenciales permitidas, el límite de pedidos, el `X-Correlation-Id`, un 404 sin cuerpo si la superficie está apagada, y un log con la ruta fija.
- **No hay configuración nueva.**
- Cada respuesta lleva `contract_version: "3"`.
- `docs/contracts/read-v3.md` documenta lo que cambia respecto de v2, como `read-v2.md` respecto de v1. Los validadores ejecutables y los fixtures (de forma asumida) siguen el mismo patrón.

### D-2 — El producto en v3

**El objeto de v2, más:**
- **`condition`**: `new`, `refurbished` o **`used`**.
- **`tracking`**: `quantity` o `unit`.
- **`model`**: `{model_id, name, brand}` o `null`. Es `null` sin la capacidad `variants` o sin modelo.
- **`attributes`**: los valores de las variantes, en el orden de la organización, `[{key, name, value}]`. Es vacío sin `variants`. Van **solo los atributos que son variante y están activos**: capacidad, color y «trae caja» en el perfil `iphone`.
- **`price_converted`**: `{amount, currency, rate, rate_as_of}` o `null` (D-6).

**Qué productos entran:**
- Entran los usados.
- **Siguen fuera los productos de servicio**: son de la 29.8.2.
- **`stock_status` y la ruta de stock** siguen la regla de v2, sobre lo disponible. Para un producto por unidad, lo disponible son sus unidades `available` (invariante de la 29.5).

**Filtros**, como parámetros opcionales de la lista:
- `model_id`;
- `condition`;
- `q`, `limit` y el orden, como hoy.

**Nunca:** costo, IMEI, unidades sueltas en la lista, ni el precio propio de una unidad.

**El `price` de un producto por unidad** es su precio base, el que heredan las unidades sin precio propio (D-3). Puede no coincidir con ninguna unidad disponible. El contrato lo dice, y el precio que el agente cita sale de `units` (aclaración 1 del agente, 2026-10-22).

### D-3 — Las unidades de un producto

`GET /api/read/v3/products/{product_id}/units`

- **Qué devuelve**: las unidades `available` del producto, `[{unit_id, grade, battery_health, price, price_converted}]`.
  - `grade` es el nombre del grado, o `null`.
  - `battery_health` es un entero de 1 a 100, o `null`.
  - `price` es **el precio propio de la unidad, o el del producto si no tiene uno**.
- **El orden**: por precio, de menor a mayor.
- **Nunca**: el IMEI, el costo, el origen, ni las unidades en otro estado (`reserved`, `in_review`, `in_repair`, vendidas o dadas de baja).
- **Un producto por cantidad** devuelve una lista vacía.
- **Un producto inexistente, inactivo, de servicio o de otra organización** da `404`, como el detalle.

La lectura es `listAvailableUnitsForService` de `inventory`. Recibe la organización y no devuelve el IMEI (H-5).

### ~~D-4 — Los modelos~~

*Sacada de la 29.8 por el usuario el 2026-10-22*: el agente no la va a usar, porque busca por `q`. Una ruta nueva dentro de v3 es compatible, así que se suma cuando la pida. **El filtro `model_id` de la lista (D-2) se queda**: el `model_id` sale del objeto producto. El texto de abajo queda como registro.

~~`GET /api/read/v3/models`~~

- **Qué devuelve**: los modelos activos, en el orden de la organización, `[{model_id, name, brand}]`.
- **Sin la capacidad `variants`**: una lista vacía.

Sirve para que el agente sepa qué modelos trabaja el negocio y filtre la lista de productos por `model_id`.

### D-5 — Las capacidades

`GET /api/read/v3/capabilities`

- **Qué devuelve**: `{capabilities: [...]}`, las activas de la organización, con los valores del enum.
- **Un valor nuevo del enum es compatible.**

Es la primera lectura de la lista completa fuera de `getAppFrame`. Es `listCapabilitiesForService` de `organizations`, y la guarda `capability-reads` suma esa función.

### D-6 — El precio en la otra moneda (ADR 0025, punto 10; U-3)

- **Hay equivalente** si la organización tiene moneda principal, configuración y cotización vigente sin vencer, y el precio está en una de las dos monedas del par.
- **Cómo se convierte**: con la conversión pura de `src/shared/money/` y la cotización vigente de `getExchangeSetup`. Se redondea a los decimales de la moneda de destino. Lleva la tasa (`rate`) y su fecha (`rate_as_of`, el `asOf` de la vigente).
- **Va `null`** cuando no hay cotización, está vencida, la moneda del precio no es del par, o la conversión no cabe.
- **El CRM convierte; el agente no lee la fuente** (ADR 0025, punto 10).
- **No hay un total de referencia**: solo el precio de cada producto y de cada unidad.
- **`rate` nunca se invierte** (aclaración 3 del agente, 2026-10-22): es la cotización de la organización tal como está guardada, cuántas unidades de la otra moneda vale una de la principal, siempre ≥ 1. Es la misma en las dos direcciones; lo que cambia es si `convertMoney` multiplica (`to_quote`) o divide (`to_base`). El contrato lo dice con un ejemplo de cada dirección.
- **La frase del contrato es «a la cotización vigente»**, no «de hoy» (aclaración 2 del agente, aceptada por el usuario el 2026-10-22): una vigente puede tener hasta 24 horas hábiles.

### D-7 — El pedido con unidades (U-2)

`order.placed_with_units`, en `ingestion-v2`, con la credencial de alcance `ingest`.

| Campo | Reglas |
|---|---|
| `client.phone` | E.164, como en `order.placed` |
| `lines` | de 1 a 10, sin repetir un producto, **cada una de un tipo**: |
| `lines[]` de cantidad | `{product_id, quantity}`, como en `order.placed`. Solo para un producto por cantidad |
| `lines[]` de unidades | `{product_id, unit_ids}`: de 1 a 10 ids, sin repetir. Solo para un producto por unidad. La cantidad es la cuenta de ids |

**Las reglas de `order.placed` valen en el mismo orden.** Después de `product_without_price`, cada línea de unidades suma:

| `rule` | Cuándo |
|---|---|
| `unit_tracking_mismatch` | una línea de cantidad para un producto por unidad, o una de unidades para uno por cantidad |
| `unit_not_available` | una unidad no existe, es de otro producto o de otra organización, o **no está `available` en ese momento**, sin distinguir |

**Otras reglas:**
- **El precio de cada unidad** se copia al crear el pedido: el suyo, o el del producto. La moneda de todo el pedido tiene que ser una, como hoy (`currency_mismatch`).
- **No reserva** (ADR 0020; ADR 0024, punto 15, R-10). Guarda las unidades en `order_line_units`, como el pedido de la pantalla. Dos pendientes pueden pedir la misma unidad; la primera confirmación la reserva, y la segunda falla con `units_unavailable`.
- **La respuesta**: la de `order.placed`, `{result, order: {number}}`.
- **Ante un `422`, el emisor deriva**, como en `order.placed`.
- **El contrato lo dice**: es una solicitud sujeta a confirmación, y el agente nunca dice «te la reservo».
- **Con una línea de cantidad para un producto por unidad**, el evento rechaza. No hay un pedido sin unidades elegidas.
- **`order.placed` no cambia**: sigue rechazando el producto por unidad como `product_not_found`.

`placeOrderFromIngestion` de `orders` se amplía; no se duplica. La idempotencia, el número `P-`, el actor y la auditoría son los de la 19.4.

### D-8 — Lo que el agente nunca lee (H-7)

- **Una guarda nueva**, `agent-contract-fields`, recorre los esquemas de las respuestas de `read-v1`, `read-v2` y `read-v3` y de las respuestas de ingestión. **Falla si una clave nombra** `serial`, `imei`, `cost`, `margin`, `dni`, `national_id` o `instagram`.
- **Cada clave prohibida tiene su caso de mutación versionado** (*Version the Failing Case of Every Project Guard*).
- **Los tests de integración de v3 verifican el cuerpo crudo**: que no contenga el IMEI ni el costo de ninguna unidad de la base de prueba.

### D-9 — Las dependencias

`src/app/api/read/` suma `fx` (`getExchangeSetup`), como anticipa el ADR 0025. Las funciones nuevas son:
- `listAvailableUnitsForService` (`inventory`);
- la lectura de modelo y atributos del producto (`catalog`). ~~`listModelsForService`~~ sale con D-4;
- `listCapabilitiesForService` (`organizations`).

**Ningún módulo suma una dependencia de otro.** Se actualizan las guardas `exposed-surface` (con las dos rutas nuevas y las tres copiadas), `service-read-entry-points` y `capability-reads`.

### D-10 — La documentación

- **Contratos**:
  - `read-v3.md`, nuevo;
  - `ingestion-v2.md` suma §«Pedidos con unidades»;
  - **H-8 se corrige con notas fechadas**: `read-v1.md` y `read-v2.md` dicen que excluyen usados y servicios desde la 29.5 y la 29.6, e `ingestion-v2.md` lo dice de `product_not_found`.
- **ADR**: notas fechadas en el ADR 0024, punto 15 (la división, U-4 y lo que entra), y en el ADR 0025, punto 10 (U-3).
- **Arquitectura y producto**:
  - DataModel, solo la nota: no hay tablas;
  - SecurityModel, con las rutas y su recuento;
  - IntegrationBoundaries;
  - Overview, con la dependencia de `fx`;
  - FunctionalRequirements.

### D-11 — El agente, la nota y la ventana

1. **Antes de implementar**, una nota para el agente en el Escritorio del usuario, `Pregunta-29.8-CRM-al-Agente.md`, como en la 19.4. Lleva:
   - el contrato propuesto: rutas, campos, reglas y ejemplos;
   - qué no cambia;
   - lo que el contrato le exige (nunca «te la reservo»; el precio convertido es orientativo, «a la cotización de hoy», cambiada después por «a la cotización vigente», D-6);
   - preguntas puntuales: si va a usar `read-v3` y `order.placed_with_units`, cuándo, y si necesita otra forma.

   El usuario se la pasa. Si el agente pide cambios, el brief se ajusta y se vuelve a aprobar antes de escribir código.
2. **Implementación**, local y en CI, con la revisión independiente obligatoria, porque cambia contratos con el agente.
3. **Despliegue.** Después, el usuario crea en «iPhone Demo» las credenciales ~~`read` e `ingest`~~ **`read`, `ingest` y `context`** del agente (*corregido el 2026-10-22* con la respuesta del agente, §6), las suma a las listas permitidas y da de alta unidades disponibles (H-10). Para la ventana, además:
   - **las etiquetas**: el agente las pone por `tag_id` (`CRM_TAG_MAP`), y sus ids son de «Demostración Vixora». Se cargan los de «iPhone Demo» o se quita el mapa durante la ventana;
   - **una organización a la vez**: la instancia de producción del agente habla con una sola. Pasarla a «iPhone Demo» la saca de «Demostración Vixora». Lo decide el usuario, que cambia los tokens en las credenciales de n8n de producción.
4. **La ventana con el agente real**, como la 19.4.3, si el agente ya adoptó el contrato:
   - se leen productos, unidades y capacidades;
   - un pedido con unidades aceptado, su reenvío `duplicate`, y un `422 unit_not_available` con su derivación;
   - se concilia por `X-Request-Id` contra `ingestion_events`, `orders`, `order_line_units`, la auditoría y el journal;
   - las capturas se guardan como fixtures `captured`.

   Si el agente no llega, la 29.8 cierra en el paso 3, con el contrato **validado localmente y desplegado**, y la ventana queda en «Esperando» como tarea propia.

### La respuesta del agente (2026-10-22)

`Respuesta-29.8-Agente-al-CRM.md`, en el Escritorio del usuario. Es contexto del consumidor, no una fuente de verdad del CRM.

- **Usa el contrato tal como está**, sin cambios de forma.
  - Pasa a v3 las tres rutas de productos y suma `units` y `capabilities`. **Deja de usar v2.** Lo demás sigue en v1.
  - **No usa `models`**: busca por `q`. El usuario decidió sacarla (D-4).
- **Usa `order.placed_with_units` solo cuando el pedido tiene alguna línea de unidades.** Los pedidos solo de cantidades siguen por `order.placed`.
  - Sus límites caben en los del contrato: de 1 a 5 líneas, y las cantidades enteras de 1 a 999.
  - Guarda en la propuesta los `unit_id` leídos de `units` en el mismo turno.
- **Grado, batería y precio le alcanzan.** Qué significa cada grado lo explica una entrada de conocimiento del negocio, sin campo nuevo.
- **Sus tres aclaraciones**, respondidas en D-2 y D-6:
  1. el `price` de un producto por unidad es el base;
  2. la frase es «a la cotización vigente»;
  3. `rate` no se invierte.
- **Sin fecha.** Del lado del agente son dos subfases: primero la lectura v3 y después el pedido con unidades. Lo más probable es que la 29.8 cierre en el paso 3 de D-11, con la ventana en «Esperando».
- **La respuesta del CRM** va en `Confirmacion-29.8-CRM-al-Agente.md`, en el Escritorio, como en la 19.4. El usuario autoriza mandarla.

## Alcance incluido

- Las rutas de `read-v3` y sus validadores, fixtures y tests.
- Las lecturas `…ForService` nuevas y la conversión en `src/app/api/read/v3/`.
- `order.placed_with_units`: el validador y la regla en `orders`.
- La guarda `agent-contract-fields` y las guardas actualizadas.
- La documentación de D-10.
- La nota para el agente, el despliegue y la ventana.

## Alcance excluido

- **Las reparaciones y las órdenes de servicio** (29.8.2), **la cotización de un usado** (29.8.3) y **los turnos** (29.10).
- **Las fotos** (U-4) y la ruta de imagen del ADR 0018, punto 7.
- **Cambios en `read-v1`, `read-v2`, `ingestion-v1` y `order.placed`**: solo cambian sus documentos, con notas (H-8).
- **Retirar una versión vieja.**
- **Cualquier cambio en el repositorio del agente.** Lo adopta en su fase (ADR 0014, punto 2).
- **Escribir unidades, reservas o confirmaciones desde el agente**: escribe solo el pendiente.
- **Migraciones.** Si hace falta una, es una condición de detención.

## Invariantes

- Las respuestas de `read-v1`, `read-v2`, `ingestion-v1` y `order.placed` **no cambian ni un byte** para los mismos datos.
- **El agente nunca recibe** un IMEI, un costo, un margen, un DNI ni un Instagram.
- **Un pendiente nunca reserva.** La reserva la hace la confirmación de una persona, como hoy.
- **La organización y el emisor salen de la credencial**, nunca de un parámetro.
- **Sin una capacidad, su parte no aparece**: sin `variants`, sin modelo ni atributos; sin `serialized_units`, ninguna unidad.

## Criterios de aceptación

- **AC-1**: `read-v3` lista y detalla productos con `condition` (también `used`), `tracking`, `model`, `attributes` y `price_converted`. Los filtros funcionan, y los productos de servicio siguen fuera.
- **AC-2**: las unidades de un producto son solo las `available`, con grado, batería y precio (el propio o el del producto), en el orden de D-3. El cuerpo crudo no contiene el IMEI ni el costo.
- **AC-3**: ~~los modelos y~~ las capacidades se leen, y salen vacías sin ninguna. *Corregido el 2026-10-22*: sin la ruta de modelos (D-4).
- **AC-4**: el precio convertido aparece con una cotización vigente y va `null` en cada caso de D-6, también con la cotización vencida.
- **AC-5**: `order.placed_with_units` crea un pendiente con sus unidades en `order_line_units`, sin reservarlas. Su reenvío es `duplicate` con el mismo número. Cada regla de D-7 rechaza en su orden, sin consumir un número.
- **AC-6**: dos pendientes con la misma unidad se aceptan. Confirmar el primero la reserva, y el segundo falla con `units_unavailable`.
- **AC-7**: la guarda `agent-contract-fields` pasa y su caso de mutación falla por cada clave prohibida.
- **AC-8**: `read-v1`, `read-v2`, `ingestion-v1` y `order.placed` responden igual que antes. Sus suites pasan sin cambios de conducta.
- **AC-9**: el borde de v3 es el de v2: 404 apagada, 401, 403 por alcance o lista, límite, correlación y log fijo, probado.
- **AC-10**: guardas, unitarias, integración y end-to-end pasan en CI.
- **AC-11**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-12**: desplegada. Si el agente adoptó el contrato, hay una ventana conciliada con capturas; si no, la ventana queda en «Esperando» (D-11).

## Pruebas y evidencia requerida

- **Unitarias**: los validadores de v3 y del evento nuevo, con cada `400`, y la conversión de D-6.
- **Integración** contra PostgreSQL: cada ruta de v3, con aislamiento entre organizaciones y cada capacidad apagada; el pedido con unidades con cada regla, su precedencia, la idempotencia y la carrera de AC-6; el cuerpo crudo sin campos prohibidos.
- **Guardas** con sus casos de fallo.
- **Fixtures** de forma asumida, y capturados después de la ventana.

## Condiciones de detención

Detenerse y consultar si:
- **hace falta una migración**;
- **cambia una respuesta de `read-v1`, `read-v2`, `ingestion-v1` u `order.placed`**;
- **un módulo necesita depender de otro** fuera de lo de D-9;
- **el agente pide una forma distinta** del contrato;
- **una lectura `…ForService` necesitaría devolver** un IMEI, un costo o un dato del cliente;
- **el pedido con unidades necesitaría reservar** o tocar `stock_units`.

## Desviaciones de la implementación

1. **D-5 y D-9, las guardas `capability-reads` y `service-read-entry-points` no cambiaron** (revisión independiente, H-1). El brief decía que se actualizaban, pero las dos ya cubren lo nuevo por su forma:
   - `capability-reads` vigila el acceso a la tabla, y `listCapabilitiesForService` lee por `findCapabilities`, la única lectura autorizada;
   - `service-read-entry-points` vigila los nombres `…ForService` por patrón, y las funciones nuevas viven en `src/modules/` y se llaman desde `src/app/api/read/`, las dos carpetas permitidas.

   Agregarles un caso no sumaba detección. `exposed-surface` sí cambió, con las cinco rutas.
2. **D-4, sin ruta de modelos**: decisión del usuario del 2026-10-22 (§La respuesta del agente).

## Revisión independiente

Un agente que no participó del trabajo revisó la implementación en solo lectura, contra este brief y las reglas vigentes, el 2026-10-22. **Veredicto: R1, sin bloqueantes**, con 5 no bloqueantes y 4 observaciones. Cada hallazgo se verificó contra el código antes de aceptarlo (autoevaluación de la verificación):

| Hallazgo | Verificación | Resolución |
|---|---|---|
| H-1, las guardas que el brief decía actualizar | cierto | desviación 1, declarada |
| H-2, sin prueba con cada capacidad apagada | cierto | caso 10 de `read-api-v3.test.ts`, que borra las filas de capacidad en la base de prueba. Falla si se quita la comprobación de `serialized_units` (probado y revertido) |
| H-3, puntos ciegos de `agent-contract-fields` | cierto | la guarda separa también por camelCase; la regla de texto ve claves anidadas en la misma línea y abreviaturas entre llaves; el recorrido usa la definición interna de zod 4 (pipe, intersección, lazy, record, tupla, default) y lanza ante un tipo contenedor que no conoce; fija claves de los esquemas con `.refine()`. Cada forma nueva tiene su caso de fallo |
| H-4, dos frases de FunctionalRequirements | cierto | corregidas con nota fechada (FR-USA-13 y la precisión de la 29.5) |
| H-5, la nota del ADR 0024 decía que v1 y v2 no tienen productos por unidad | cierto | corregida: un producto nuevo por unidad aparece en v1 y v2 desde la 29.5; solo los usados y los de servicio quedan fuera |
| H-6, «la única lectura» de las capacidades | cierto | DataModel, Overview y el comentario de `organizations/service.ts` nombran `listCapabilitiesForService` |
| H-7, `order.placed_with_units` no consulta `serialized_units` | cierto | aceptado sin cambio: el pedido de la pantalla tampoco la consulta, y una capacidad no se desactiva, así que no hay producto por unidad sin ella |
| H-8, la guía del emisor no nombraba el tipo nuevo | cierto | la fila del `422` lo nombra |
| H-9, sin prueba de `client_inactive` ni `amount_out_of_range` por la rama de unidades | cierto | caso nuevo en `orders-agent-units.test.ts` |

## Cierre

*Del 2026-10-22, después del despliegue y de la ventana del agente.*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `read-api-v3.test.ts`: lista y detalle con `condition` (también `used`), `tracking`, `model`, `attributes` y `price_converted`, con los filtros `q`, `limit`, `model_id` y `condition`, y sin productos de servicio. En la ventana, el agente leyó el iPhone 13 usado y los nueve iPhone 15 |
| AC-2 | cumple | solo las `available`, con grado, batería y precio propio o heredado, de la más barata a la más cara; el cuerpo crudo sin el IMEI ni el costo, en integración. En la ventana, las dos unidades del usado llegaron en ese orden (US$ 399 y US$ 429) |
| AC-3 | cumple | las capacidades en el orden del enum, y vacías sin ninguna (caso 10, que borra las filas); sin la ruta de modelos (D-4) |
| AC-4 | cumple | `contract.test.ts` y la integración: el precio convertido con una cotización vigente, y `null` en cada caso de D-6, también con la cotización vencida. En la ventana, «a la cotización vigente» con la cotización de «iPhone Demo» |
| AC-5 | cumple localmente | `orders-agent-units.test.ts`: el pendiente con sus unidades en `order_line_units`, sin reservarlas; el reenvío es `duplicate` con el mismo número; cada regla en su orden, sin consumir un número. **El agente todavía no lo usa** (su 3.51) |
| AC-6 | cumple localmente | dos pendientes con la misma unidad se aceptan; confirmar el primero la reserva y el segundo falla con `units_unavailable`, en integración |
| AC-7 | cumple | `agent-contract-fields` pasa, y cada clave prohibida falla en cada forma, desde la revisión también con camelCase y los tipos de zod que contienen otros (H-3). El comentario del contrato v3 que nombraba el Instagram lo rechazó `trade-ins.test.ts` en la CI de `94865f2`, y se corrigió en `dd43606` |
| AC-8 | cumple | las suites de v1, v2, `ingestion-v1` y `order.placed` pasan sin cambios de conducta. En la ventana, el agente siguió usando v1 para el contexto y `order.placed` para su pedido |
| AC-9 | cumple | `read-api-v3.test.ts`: 404 apagada, 401, 403 por alcance o por la allowlist, el límite, la correlación y el log fijo. En producción, las cinco rutas dieron 401 sin credencial después del despliegue |
| AC-10 | cumple | CI run 39793399047 en `success` sobre `dd43606786723ec2653dec69ddb455a3714d4ebb`: guardas 867, unitarias 1104, integración 1754 y end-to-end 291. La corrida de `94865f2` había fallado solo por ese comentario (AC-7) |
| AC-11 | cumple | revisión independiente del 2026-10-22, antes del despliegue (§Revisión independiente) |
| AC-12 | cumple para la lectura | desplegada (`dd43606`, sin migraciones). El agente adoptó `read-v3` el mismo día y mandó su aviso de la ventana; el CRM lo concilió por `X-Correlation-Id` (§La ventana). **`order.placed_with_units` no tuvo ventana**: el agente lo va a usar en su 3.51 |

**Nivel alcanzado**:
- **`read-v3`**: validado en integración (`producer-consumer`), con el agente real contra producción, sobre una organización demo.
- **`order.placed_with_units`**: validado localmente, y desplegado. *Desde el 2026-10-23, validado en integración* (`producer-consumer`) con la 3.51 del agente (§La ventana de `order.placed_with_units`).

No hay negocio real.

### La ventana

El 2026-10-22 el usuario creó las tres credenciales de «iPhone Demo» (`read`, `ingest` y `context`, con `source` `agente-iphone-demo`) y las sumó a las allowlists, sin quitar las de `agente-demo`. Se cargaron cuatro unidades de prueba por la pantalla:
- dos en el iPhone 13 128 GB Azul usado;
- dos en el iPhone 15 128 GB Azul, que pasó a llevarse por unidad porque no tenía movimientos.

El agente probó sus tres tokens y recorrió usados, unidades, la referencia en pesos y un pedido por cantidad (`Aviso-3.50-Ventana-29.8.md`, del agente). Lo que el CRM concilió con su log, de 19:00 a 20:05 UTC:
- **la prueba de tokens**, a las 19:11 y a las 19:13: `read` y `units` en `OK`, `context` en `NOT_FOUND` y `ingest` en `VALIDATION_ERROR`, como lo cuenta el agente;
- **cada lectura de su tabla, con el mismo `request_id`**, en `OK`;
- **el pedido `31136`**, a las 19:57:36 en `OK`. En el CRM es `P-000002`: pendiente, origen «Agente», 2 × $12.000;
- **ningún `401` ni `403`**, y ningún uso de `agente-demo` desde las 19:00.

Hubo tres diferencias menores:
- una lectura del agente figura a las 19:47, no a las 19:46;
- hay lecturas que su tabla no nombra;
- el log no guarda el tipo del evento, así que el pedido se confirmó en el CRM.

**No hay fixtures capturados**: el aviso trae los códigos y los ids, no los cuerpos. Los fixtures de `tests/fixtures/read/v3/` siguen siendo de forma asumida. Según su aviso, las respuestas reales pasaron la validación estricta del agente.

El agente preguntó si `price: null` es válido. Lo es desde v1, y `read-v3.md` lo precisa ahora. Su otra propuesta, que la app no deje activar un producto por cantidad sin precio, cambiaría una regla del producto: queda para que la decida el usuario.

### La ventana de `order.placed_with_units` (3.51)

*Del 2026-10-23.* El agente usó `order.placed_with_units` por primera vez sobre «iPhone Demo» (`Aviso-3.51-Ventana-29.8.md` y `Conciliacion-3.51-Ventana-29.8.md`, del agente). El CRM lo concilió con su log por `X-Correlation-Id`:
- **el pedido de una unidad** (`32711`, 15:44:39 UTC): `OK`, **`P-000004`**, pendiente, origen «Agente», US$ 399, con la unidad sin reservar. La lectura de unidades de la que salió el `unit_id` es de segundos antes (`32691:r1:i1`);
- **su reenvío idéntico** (15:52:09): `OK`, sin un segundo pedido;
- **una unidad ya reservada** por un pedido que el usuario confirmó (`31434`, 2026-10-22 a las 22:42:11): `BUSINESS_RULE_VIOLATION`, y detrás la escalada en `OK`. El usuario canceló después ese pedido (`P-000003`) y la unidad volvió a estar disponible;
- **un producto con `price: null`** (`32892`): ningún pedido;
- **un pedido por cantidad** (`32972`): `order.placed`, **`P-000005`**.

Hubo una escalada que el aviso no anunciaba (`31500`): un «sí» del agente sin una propuesta con `unit_id`, que el agente corrigió de su lado. Ningún `401`, `403` ni `INTERNAL`. Hubo dos diferencias menores:
- las horas del agente llegan un minuto antes;
- los dos `X-Request-Id` que el agente cita para la búsqueda de «usbc» son de turnos anteriores al paso 4.

El log no guarda el tipo de evento ni distingue `accepted` de `duplicate`: el pedido y la falta de un segundo se confirmaron en la app. La respuesta del CRM es `Respuesta-Conciliacion-3.51-CRM-al-Agente.md`, en el Escritorio del usuario.

**Nivel**: `order.placed_with_units` queda **validado en integración** (`producer-consumer`), con el agente real contra producción, sobre una organización demo. La búsqueda de «usbc» contra «USB-C» es la misma clase de caso que «128gb»: la resuelve el agente, sin tarea del CRM.

### Lo que queda

- ~~**`order.placed_with_units` con el agente real**: su 3.51. Se concilia cuando avise.~~ *Conciliado el 2026-10-23* (§La ventana de `order.placed_with_units`).
- **La búsqueda con la unidad pegada** («128gb» contra «128 GB»): el agente la resolvió de su lado. Queda como mejora posible de la búsqueda del CRM, sin tarea.
- **Las correcciones de la revisión no tuvieron una segunda revisión independiente**: son autoevaluación, verificadas por sus pruebas y la CI.
- **En la máquina local**, la suite completa de integración da seis fallas de tiempo ajenas a la 29.8, que en la CI pasan:
  - cuatro en `client-tags.test.ts`, que pasan al correr el archivo solo;
  - dos de rendimiento, en `supplier-payments.test.ts` y `product-images.test.ts`, que también fallan solas.

### El despliegue

Sin incidentes en el servidor. No había migraciones. El build, con el servicio detenido y el heap de 1.536 MB, terminó a la primera. Antes, la CI de `94865f2` falló en `trade-ins.test.ts` por el comentario (AC-7): esa suite no se había corrido completa en local antes del push. Se corrigió en `dd43606`, que es lo desplegado. El auto-mode bloqueó el paso 3 del runbook y el usuario cambió a modo manual. Después del despliegue:
- el servicio activo;
- `/api/health` y la hoja de estilos en 200;
- las rutas v3, `read/v1` e `ingestion/v2` en 401 sin credencial.

Para volver atrás, `b2b22fe`.
