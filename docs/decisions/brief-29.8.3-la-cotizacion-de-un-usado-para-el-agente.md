---
schema: task-brief.v1
task_id: "29.8.3"
task_type: implementation
generated_at: 2026-10-23
---

# Brief 29.8.3 — La cotización de un usado para el agente

- **Contrato**: `task-brief.v1`
- **Tipo de tarea**: `implementation`. Dos rutas nuevas en `read-v3`, código, pruebas, despliegue y una ventana con el agente real. **Sin migración.**
- **Nivel de evidencia objetivo**:
  - `deterministic`, con tests contra PostgreSQL;
  - `producer-consumer` del lado del CRM: contrato ↔ servicio ↔ base;
  - **validado en integración con el agente** en una ventana como la de la 29.8, si el agente adopta el contrato (D-8).
- **Estado**: **aprobado por el usuario el 2026-10-23, con las recomendaciones: U-1 a U-5 en su opción (a).** Como en la 29.8 y la 29.8.2, **no se implementa hasta que el agente confirme por escrito que lo va a usar**, o pida cambios (D-8). La pregunta está en `Pregunta-29.8.3-CRM-al-Agente.md`, en el Escritorio del usuario. **El agente confirmó el mismo día** que las usa sin cambios (§La respuesta del agente). **El usuario decidió el 2026-10-23 seguir con la 29.8.3 después de la ventana de la 29.8.2**, que se concilió ese día. **Cerrado el 2026-10-25**, desplegado (`9a971ae`), con la ventana del agente conciliada y `not_accepted` y `not_quotable` sin leer por el agente (§Cierre).
- **Fuentes**:
  - [ADR 0024](0024-rubros-y-capacidades.md): punto 9 (la cotización de un usado), punto 13 (el perfil y la regla de los valores de ejemplo), punto 14 (lo que el agente nunca lee), punto 15 (el agente) y punto 16 (las dependencias);
  - [ADR 0014](0014-el-agente-de-whatsapp-como-consumidor-del-crm.md);
  - [ADR 0025](0025-tipo-de-cambio.md), punto 10, el precio convertido;
  - [brief-29.7.3](brief-29.7.3-la-cotizacion-de-usados.md): D-4 (la regla), las desviaciones 1 a 8 y O-3 (la falta de `checklist_incomplete`, «a revisar en la 29.8»);
  - [brief-29.8](brief-29.8-el-catalogo-del-rubro-para-el-agente.md), §La división: la 29.8.3 incluye O-3 y la regla de los valores de ejemplo;
  - [brief-29.8.2](brief-29.8.2-las-reparaciones-para-el-agente.md), el molde de dos rutas nuevas en `read-v3`;
  - [contratos](../contracts/): `read-v3.md`.

## Objetivo

Que el agente conteste **«¿Cuánto me dan por mi iPhone 13 de 128 GB?»** con un rango orientativo, en lugar de derivar a una persona (ADR 0024, puntos 9 y 15). **El CRM calcula; el agente pregunta y presenta.**

Para eso el agente necesita dos cosas: **las preguntas** (el checklist activo del negocio, para hacérselas al cliente) y **la respuesta** (la cotización, con las respuestas del cliente y la salud de su batería).

Es una lectura: **no se guarda nada** (punto 9). El precio final lo fija una persona al revisar el equipo, en la recepción. Si el cliente quiere dejar su equipo, el agente deriva.

## Hallazgos (verificados contra el código en `a7a890f`, 2026-10-23)

- **H-1. La regla ya existe y no escribe.** `quoteTradeIn` (`src/modules/tradeins/quote.ts:486`) junta los datos y llama a `computeTradeInQuote` (`quote-rule.ts`), que es pura. Pero **exige un `admin`** (`requireTradeIns(context, "admin")`), así que el agente necesita una función `…ForService` nueva, que reciba la organización de la credencial.
- **H-2. El costo de las reparaciones también exige un `admin`.** `getRepairCostsForQuote` (`service/repair-list.ts:624`) pasa por `authorize`. Hace falta su `…ForService`. La guarda `tradeins-dependencies` fija **por nombre** lo que `tradeins` importa de `service` (`getRepairCostsForQuote` y `listRepairTypes`): suma un tercer nombre, **sin dependencia nueva entre módulos**.
- **H-3. Lo que calcula la cotización y el agente nunca puede ver**: el **valor exacto** sin redondear (`value`), el **margen** del modelo, el **costo** de cada reparación (`repair_prices.cost`, el costo estimado del técnico, no el precio al cliente), el porcentaje y el paso del redondeo. Con el valor exacto, o con el desglose, el cliente despeja el margen. El rango redondeado hacia abajo existe justamente para eso (punto 9, R-21).
- **H-4. No hay `checklist_incomplete`** (brief-29.7.3, desviación 1, O-3). La pantalla manda los puntos que pasaron, y **un punto que no viene cuenta como fallado**. Para una persona que tilda una lista es razonable. Para el agente no: si se olvida de preguntar un punto, la cotización baja sin que nadie lo note, y si el punto es obligatorio da «no se recibe». Lleva a U-2.
- **H-5. La regla de los valores de ejemplo no se puede aplicar tal como está escrita.** El ADR dice que el agente no cotiza con un valor de ejemplo «en una organización con tráfico real», pero **el CRM no tiene ninguna marca de tráfico real**. «De ejemplo» en la cotización refleja solo `trade_in_settings.is_example` (brief-29.7.3, desviación 7). En «iPhone Demo» ya está apagada: el usuario confirmó los valores el 2026-10-21. Lleva a U-3.
- **H-6. La entrada es un producto usado, no un modelo** (brief-29.7.3, desviación 3). El producto usado ya es una variante (modelo, capacidad y color), y su precio vigente es el precio de referencia. **Si el negocio no tiene un producto usado de esa variante, no hay cotización.** El agente ya encuentra los usados en `GET /api/read/v3/products?condition=used` desde la 29.8, con su `product_id`.
- **H-7. Los motivos de «no hay cotización» son ocho**, más «no se recibe» (`mandatory_failed`) y `product_not_quotable`. La mayoría son configuración que falta (`no_settings`, `no_margin`, `no_reference_price`, `no_repair_cost`, `no_battery_repair_type`, `currency_mismatch`). El agente no puede arreglar ninguno: en todos deriva. Lleva a U-4.
- **H-8. La guarda `agent-contract-fields`** rechaza cualquier clave con `cost` o `margin`. Cubre las rutas nuevas sin cambios si se exportan sus esquemas. **No ve valores**: el valor exacto tiene que quedar fuera por diseño, y lo prueba la integración (D-7).
- **H-9. Una ruta nueva dentro de `read-v3` es un cambio compatible**, como las dos de la 29.8.2. `contract_version` sigue en `"3"`.

## Decisiones del usuario

**Decididas el 2026-10-23: las cinco en su opción (a), la recomendada.**

### U-1. Cómo le llegan al agente las preguntas

- **(a) Una ruta del checklist (recomendada).** `GET /api/read/v3/trade-in-checklist` devuelve los puntos activos, en el orden de la organización, con su id, su nombre y si es obligatorio. El agente los pregunta y manda las respuestas por id. Es configuración del negocio: alcance `read`.
- **(b) Que la cotización devuelva las preguntas que faltan.** Una sola ruta, pero el agente tiene que llamarla dos veces por cotización, y la primera es una cotización fallida.

### U-2. Un punto sin responder (H-4, O-3 de la 29.7.3)

- **(a) Cada punto activo se responde (recomendada).** La cotización recibe `passed` y `failed`, dos listas de ids. **Un punto activo que no está en ninguna de las dos da `checklist_incomplete`**, con los ids que faltan, y no cotiza. Un id que está en las dos es un `400`. Un id que no es de la organización, o de un punto ya inactivo, se ignora, como en la pantalla. Cierra O-3 para el agente; **la pantalla no cambia**.
- **(b) Como la pantalla.** Lo que no viene en `passed` falló. Más simple, pero un olvido del agente baja la cotización en silencio.

### U-3. Los valores de ejemplo (H-5)

- **(a) El agente nunca cotiza con valores de ejemplo, en ninguna organización (recomendada).** Con `trade_in_settings.is_example` encendida, la cotización da `not_quotable`. No hace falta una marca de tráfico real, y es más estricta que el ADR, nunca menos. Un `admin` la apaga guardando la configuración (brief-29.7.3, O-2). Va como nota fechada en el ADR 0024, punto 13.
- **(b) Una marca de tráfico real en la organización.** Necesita una columna, una migración y quién la enciende. Ninguna otra regla la usa hoy.

### U-4. Qué le dice la cotización cuando no cotiza (H-7)

- **(a) Tres motivos (recomendada)**:
  - **`not_accepted`**: un punto obligatorio falló, con los nombres. El agente le dice al cliente que el negocio no recibe el equipo en ese estado;
  - **`checklist_incomplete`**: faltan respuestas, con los ids (U-2). El agente pregunta lo que falta;
  - **`not_quotable`**: todo lo demás. El agente deriva a una persona.

  Los motivos finos quedan para el `admin`, en su pantalla. El contrato no se ata a la lista interna, que puede crecer.
- **(b) Los motivos finos tal como están.** El agente no puede hacer nada distinto con cada uno, y cada motivo nuevo cambiaría el contrato.

### U-5. El rango en la otra moneda

- **(a) Con `range_converted` (recomendada)**: el piso y el techo convertidos con la regla de §El precio convertido de `read-v3`, `null` en los mismos casos, también con la cotización vencida. El agente dice «a la cotización vigente», como con un producto. Una cotización de usado es orientativa, a diferencia del presupuesto de una orden, que no se convierte (brief-29.8.2, D-4).
- **(b) Solo en su moneda.** Si el cliente pregunta en pesos, el agente deriva.

## Decisiones

### D-1 — El borde y la versión

- Dos rutas nuevas en **`read-v3`**, un cambio compatible (H-9). `contract_version` sigue en `"3"`.
- El borde es el de v3: 404 apagada, 401, 403 por alcance o por la lista de credenciales permitidas, límite compartido de 120 por minuto, correlación y log con la ruta fija, **sin los parámetros**.
- **Alcance `read`** en las dos: la cotización no lleva cliente ni datos de una persona (brief-29.7.3, D-7).
- **Las dos exigen la capacidad `trade_ins`.** Sin ella, el checklist devuelve `items: []` y la cotización `not_quotable`. El agente sabe si existe por la ruta de capacidades.
- **Son `GET`**: no escriben. Las respuestas del checklist van en la consulta, como ids, nunca texto del cliente.

### D-2 — El checklist (U-1)

`GET /api/read/v3/trade-in-checklist`, sin parámetros.

```json
{
  "contract_version": "3",
  "items": [
    { "item_id": "…", "name": "Face ID funciona", "mandatory": true },
    { "item_id": "…", "name": "Pantalla sin rayas", "mandatory": false }
  ]
}
```

- **Solo los puntos activos**, en el orden de la organización.
- **No lleva** el tipo de reparación de cada punto ni su costo: el agente no lo necesita para preguntar.

### D-3 — La cotización (U-2 y U-4)

`GET /api/read/v3/trade-in-quote?product_id=…&battery_health=…&passed=…&failed=…`

| Parámetro | Obligatorio | Reglas |
|---|---|---|
| `product_id` | sí | un uuid: un producto usado de `GET /api/read/v3/products?condition=used` |
| `battery_health` | sí | un entero de 0 a 100: la «Condición de la batería» del iPhone |
| `passed` | no | ids de puntos, separados por coma |
| `failed` | no | ids de puntos, separados por coma |

- **Un parámetro mal formado** da `400` con sus `fields`. Un id en `passed` y en `failed` a la vez, también.
- **Un producto inexistente, inactivo, de servicio o de otra organización** da el `404` del detalle de producto, sin distinguir.
- **Un producto que no se cotiza** (nuevo, por cantidad o sin modelo) da `not_quotable`.
- **El orden de las comprobaciones** es el de `quoteTradeIn`, con `checklist_incomplete` después de `no_settings` y antes de `not_accepted`.

**Con cotización:**

```json
{
  "contract_version": "3",
  "quote": {
    "product": { "product_id": "…", "name": "iPhone 13 128 GB Usado" },
    "estimate": true,
    "range": { "low": "380.00", "high": "420.00", "currency": "USD" },
    "range_converted": { "low": "…", "high": "…", "currency": "ARS", "rate": "1200", "rate_as_of": "…" },
    "repairs": ["Cambio de batería"]
  },
  "reason": null
}
```

- **`range`**: el piso y el techo de `computeTradeInQuote`, redondeados hacia abajo al paso. **Si el piso es cero**, el contrato dice que el agente presenta «hasta» el techo, como la pantalla.
- **`estimate`**: siempre `true`. Es la marca de orientativa del punto 15; el contrato la explica.
- **`repairs`**: los nombres de las reparaciones que se descontaron, sin montos, para que el agente diga por qué. Sin `repairs`, la reparación se nombra por los puntos que la piden (brief-29.7.3, desviación 4).
- **No lleva** el valor exacto, el precio de referencia con su fecha, el margen, el costo de cada reparación, el porcentaje ni el paso (H-3).

**Sin cotización:** `"quote": null` y `reason`, uno de los tres de U-4:

```json
{ "contract_version": "3", "quote": null, "reason": { "code": "checklist_incomplete", "item_ids": ["…"] } }
```

- `not_accepted` lleva `items`, con los nombres de los puntos obligatorios que fallaron.
- `checklist_incomplete` lleva `item_ids`.
- `not_quotable` no lleva nada más.

### D-4 — Los valores de ejemplo (U-3)

Con `trade_in_settings.is_example` encendida, la cotización da `not_quotable`. Lo comprueba la función `…ForService`, no la ruta.

### D-5 — Lo que el contrato le dice al agente

- **Es orientativa**: nunca «te pagamos», nunca un monto fijo. El precio final lo fija una persona al revisar el equipo.
- **El agente no recibe el equipo**: si el cliente quiere traerlo, deriva (punto 15, «Lo que no registra el agente»).
- **No cotiza por su cuenta** con otra fuente, ni con la de otro modelo, cuando la respuesta es `not_quotable`.
- **El producto es la variante**: si el negocio no tiene un usado de esa capacidad, no hay cotización (H-6), y el agente deriva.

### D-6 — Las dependencias

- `tradeins` expone `listTradeInChecklistForService` y `quoteTradeInForService`, que reciben la organización de la credencial y no pasan por `authorize`, como las demás `…ForService`. **`quoteTradeIn` y `quoteTradeInForService` comparten el cálculo**: la regla no se duplica.
- `service` expone `getRepairCostsForQuoteForService`. `tradeins` suma ese nombre a los dos que ya importa; **ninguna dependencia nueva entre módulos**.
- **Las compone el handler de la ruta**, como las demás de la lectura. El precio convertido sale del mismo ayudante que el de los productos.
- Las guardas al día: `tradeins-dependencies` suma el nombre nuevo a los que `tradeins` importa de `service`. **`service-read-entry-points` no cambia**: cubre cualquier `…ForService` por su nombre, deja que los módulos las compongan y solo las deja llamar desde `src/app/api/read/` (verificado en `a7a890f`).

### D-7 — Lo que el agente nunca lee

- Los esquemas nuevos se exportan desde `src/app/api/read/v3/contract.ts`, y la guarda `agent-contract-fields` los cubre (H-8).
- La integración siembra montos que no son múltiplos del paso y **busca en el cuerpo crudo**: el valor exacto, el margen, el costo de cada reparación y el precio de referencia. Ninguno puede aparecer.

### D-8 — El agente, la nota y la ventana

- **No se implementa hasta que el agente confirme por escrito que lo va a usar, o pida cambios.** La pregunta va en `Pregunta-29.8.3-CRM-al-Agente.md`, en el Escritorio del usuario, con las dos rutas, los campos, los tres motivos y lo que el agente no hace.
- Al desplegar, hace falta en «iPhone Demo»: un producto usado con precio de un modelo con margen, y al menos un punto del checklist con reparación con costo para ese modelo. «iPhone Demo» ya tiene los valores sin la marca de ejemplo, 1 margen y 4 puntos con reparación (brief-29.7.3, AC-14); se verifica antes de la ventana.
- La ventana concilia por `X-Correlation-Id`, como las anteriores.

### D-9 — La documentación

- `read-v3.md`, con las dos rutas y lo que el contrato le dice al agente (D-5).
- Notas fechadas en el ADR 0024:
  - punto 9: el agente ve solo el rango redondeado;
  - punto 13: U-3;
  - punto 15: las dos rutas.
- En el brief-29.7.3, una nota fechada en O-3: cómo quedó para el agente.
- `SecurityModel.md`: las dos rutas en el recuento de puntos de entrada.
- `exposed-surface`: sus entradas.
- `DataModel.md` no cambia, porque no hay migración.

### La respuesta del agente (2026-10-23)

El agente confirmó por escrito que **va a usar las dos rutas con la forma de D-2 y D-3, sin cambios ni datos nuevos** (`Respuesta-29.8.3-Agente-al-CRM.md`). Las adopta en una subfase suya, después de su 3.52. Lo que contó de su lado, verificado por él contra su código en solo lectura y no por el CRM:

- **El producto**: lo busca entre los usados con el modelo y la capacidad que nombra el cliente. Cotiza si coincide exactamente uno; si no hay ninguno, deriva, sin cotizar con otra variante.
- **Las preguntas**: lee el checklist y pregunta cada punto, más la «Condición de la batería», y explica dónde se ve. Sin ese número no cotiza.
- **Antes de llamar**, su código comprueba que cada punto esté en `passed` o en `failed`, y en una sola. Si igual vuelve `checklist_incomplete`, pregunta lo que falta.
- **Lo que dice**: el rango como orientativo, «hasta» el techo con `low` en cero, el convertido «a la cotización vigente» y nunca por su cuenta, las reparaciones por su nombre sin montos. Nunca «te pagamos», un monto fijo ni que el negocio recibe el equipo. Con `not_accepted`, dice que no se recibe en ese estado; con `not_quotable`, un `404` o un error, deriva.
- **No lee `capabilities`**: `not_quotable` lo lleva al mismo lugar.
- **U-2 le sirve**: prefiere una pregunta más a un rango que después baja.

**Sus tres preguntas**, contestadas en `Respuesta-29.8.3-CRM-al-Agente.md`:
1. **Cuántos puntos esperar**: hasta 40 por organización, contando los inactivos (`MAX_CHECKLIST_ITEMS`). «iPhone Demo» tiene 10 activos, 2 obligatorios.
2. **Dos usados que solo cambian de color no cotizan necesariamente igual**: el margen y los costos son por modelo, pero el precio de referencia es el de cada producto. Si coincide más de uno, pregunta el color.
3. **Sin puntos activos, cotiza solo con `battery_health`**, porque no falta ninguna respuesta. **Un id que no es de un punto activo se ignora**, no da `400` (U-2).

**Para la ventana pide**, en «iPhone Demo»: un usado con precio y margen, un punto obligatorio, un punto opcional con reparación, un modelo con usado en una capacidad y no en otra y, si se puede, un caso con `low` en cero. Hoy hay usados del iPhone 12 y del 13, y margen solo para el 12. Se preparan antes de la ventana (D-8).

No cambia ninguna decisión del brief.

## Alcance incluido

- `GET /api/read/v3/trade-in-checklist` y `GET /api/read/v3/trade-in-quote`, con sus validadores y sus esquemas en `contract.ts`.
- Las lecturas `…ForService` de D-6, en `tradeins` y `service`, con el cálculo compartido.
- `tradeins-dependencies`, `exposed-surface` y `agent-contract-fields` al día, con sus casos de fallo.
- Tests unitarios, de integración y de guardas. Fixtures de forma asumida.
- La documentación de D-9, la pregunta y el aviso para el agente, y la ventana.

## Alcance excluido

- **Que el agente reciba un equipo**, registre una recepción o pague: lo hace una persona (punto 15).
- **Cambios en la pantalla de cotizar** y en `quoteTradeIn` para el `admin`, salvo extraer el cálculo compartido sin cambiar su conducta.
- **Una cotización por modelo** sin producto usado (H-6).
- **Guardar la cotización** o su historial (punto 9).
- **Una marca de tráfico real** (U-3 (b)).
- La garantía (29.9) y los turnos (29.10).
- Cambios en `read-v1`, `read-v2`, en las rutas existentes de `read-v3` y en la ingestión.

## Invariantes

- **El agente nunca ve el valor exacto, el margen, el costo de una reparación, el porcentaje ni el paso.** Solo el rango redondeado hacia abajo.
- **El agente nunca cotiza con valores de ejemplo** (U-3).
- La cotización no escribe nada: ni filas, ni auditoría, ni contadores.
- Un producto o un punto de otra organización nunca entra en una cotización.
- La pantalla del `admin` cotiza igual que antes.
- Ninguna ruta existente cambia su respuesta.
- Ningún módulo suma una dependencia.

## Criterios de aceptación

- **AC-1**: el checklist devuelve los puntos activos de la organización, en su orden, con id, nombre y obligatoriedad, y `items: []` sin `trade_ins`.
- **AC-2**: la cotización da el mismo piso y techo que `quoteTradeIn` para las mismas entradas, probado con al menos una reparación de un punto, la batería bajo el umbral y un piso en cero.
- **AC-3**: un punto activo sin responder da `checklist_incomplete` con sus ids; un punto obligatorio fallado da `not_accepted` con su nombre; cada motivo fino de `quoteTradeIn`, los valores de ejemplo y la capacidad apagada dan `not_quotable`.
- **AC-4**: un parámetro mal formado y un id en las dos listas dan `400`; un producto ajeno, inactivo, de servicio o inexistente da el `404` sin distinguir.
- **AC-5**: el cuerpo crudo no contiene el valor exacto, el margen, el costo de una reparación ni el precio de referencia, probado con valores sembrados. La guarda `agent-contract-fields` pasa.
- **AC-6**: `range_converted` aparece con una cotización vigente y va `null` en cada caso de la regla de v3, también vencida.
- **AC-7**: el borde de v3 en las dos rutas, probado: 404 apagada, 401, 403 por alcance o por lista, límite, correlación y log fijo sin los parámetros.
- **AC-8**: aislamiento entre organizaciones, en el producto y en los puntos.
- **AC-9**: la pantalla de cotizar y `quoteTradeIn` responden igual; `read-v1`, `read-v2`, las rutas existentes de `read-v3` y la ingestión, también.
- **AC-10**: guardas, unitarias, integración y end-to-end pasan en CI, y `trade-ins.test.ts` pasa antes del push.
- **AC-11**: la revisión independiente se hizo antes del despliegue, con cada hallazgo verificado.
- **AC-12**: desplegada. Si el agente adoptó el contrato, hay una ventana conciliada. Si no, la ventana queda en «Esperando» (D-8).

## Pruebas y evidencia requerida

- **Unitarias**: los validadores de las dos rutas, con cada `400`; el paso de los motivos finos a los tres de U-4.
- **Integración** contra PostgreSQL:
  - cada ruta, con aislamiento y con la capacidad apagada;
  - el mismo rango que `quoteTradeIn`, con los mismos datos;
  - cada motivo, incluido el de los valores de ejemplo;
  - un punto inactivo y un id ajeno, ignorados;
  - el cuerpo crudo sin el valor exacto, el margen, los costos ni el precio de referencia;
  - que la cotización no escribe: los recuentos de las tablas y de la auditoría no cambian.
- **Guardas** con sus casos de fallo.
- **Fixtures** de forma asumida, y capturados después de la ventana.

## Condiciones de detención

- **Si el agente pide el desglose**, el valor exacto, el margen o un costo, se para y lo decide el usuario: rompe H-3.
- **Si el agente pide cotizar por modelo**, sin producto usado, se para: cambia la regla del punto 9 y la entrada de `quoteTradeIn`.
- **Si el agente pide escribir algo**, como reservar la recepción o dejar la cotización guardada, se para: es otra subfase.
- **Si extraer el cálculo compartido cambia la conducta de `quoteTradeIn`** o de la pantalla, se para.
- **Si hace falta una dependencia nueva entre módulos**, se para y se documenta antes.

## Implementación

*Del 2026-10-23, sobre `48f4fa4`.* Autoevaluación; la revisión independiente está en la sección siguiente.

- **`tradeins`**: `computeQuote`, interna, tiene la regla que antes estaba dentro de `quoteTradeIn`; la llaman `quoteTradeIn` (la pantalla) y `quoteTradeInForService` (el agente), con lo que cambia como parámetro: las respuestas (`failed` es `null` en la pantalla) y el rechazo de los valores de ejemplo. Más `listTradeInChecklistForService`.
- **`service`**: `getRepairCostsForQuoteForService`, que comparte el cuerpo con `getRepairCostsForQuote` (`readRepairCostsForQuote`).
- **Las rutas**: `src/app/api/read/v3/trade-in-checklist/` y `trade-in-quote/`, con los esquemas y el mapeo en `contract.ts`.

### Desviaciones y decisiones de implementación

Registradas para la revisión independiente. Ninguna toca una condición de detención.

1. **`quoteTradeInForService` devuelve solo lo que ve el agente**: el producto, la moneda, el piso, el techo y los nombres de las reparaciones. El valor exacto, el margen y los costos no salen del módulo, no solo del contrato (D-3, H-3).
2. **El orden de las comprobaciones**, que D-3 fijaba solo para `checklist_incomplete`: los `400`, el producto (`404`), la capacidad, el producto que no se cotiza, `no_settings`, **los valores de ejemplo**, `checklist_incomplete`, `not_accepted` y el cálculo. Los valores de ejemplo van antes que las respuestas: con ellos no se cotiza, así que no tiene sentido pedir lo que falta.
3. **Tres reglas de la consulta que el brief no fijaba**:
   - **hasta 100 ids por lista** (`TRADE_IN_ANSWERS_MAX`), holgado sobre los 40 puntos de una organización;
   - **`battery_health` sin ceros a la izquierda** (`07` es un `400`); la pantalla los acepta;
   - **el parámetro repetido** (`passed=a&passed=b`) cuenta todas sus apariciones.
4. **Un piso en cero se convierte a cero** en `range_converted`: `convertPrice` no convierte un monto que no es positivo, y sin esto el convertido entero sería `null`.
5. **El tipo del costo se deriva** en `tradeins` del de `getRepairCostsForQuoteForService`, en vez de importar `RepairCostForQuote`: la guarda `tradeins-dependencies` fija por nombre lo que se importa de `service`, y la lista suma solo la función.
6. **El motivo interno `no_capability`**, que el contrato muestra como `not_quotable`. El producto se busca antes: un producto ajeno sigue dando el mismo `404` sin la capacidad.
7. **`DataModel.md` sí cambia**, contra D-9: decía que `tradeins` lee de `service` solo dos funciones, y ahora son tres. Lleva una nota fechada, y el ADR 0024 otra en el punto 16 (revisión, NB-4).
8. **Sin la capacidad `repairs`, ninguna reparación llega nombrada por sus puntos**, contra lo que D-3 tomaba del brief-29.7.3: sin `repairs` no hay costos, y una reparación necesaria da `no_repair_cost`, que el agente ve como `not_quotable`. El nombre por los puntos sigue existiendo en la pantalla del `admin`, que muestra el motivo fino. El contrato lo dice así (revisión, NB-1).

### Evidencia

Nivel: **validado localmente** (`deterministic`), contra PostgreSQL real de desarrollo. Los requests son sintéticos; el agente no los vio.

- `tsc` y `eslint` (src, tests) limpios.
- Unitarias y guardas: 139 archivos, 1994 tests.
- Integración de lo que toca la subfase: `read-api-v3-trade-in-quote` (12), `trade-in-quotes` (la regresión de `quoteTradeIn`, AC-9), `trade-ins`, `read-api-v3` y `read-api-v3-repairs`, 60 tests.
- Suite completa de integración, antes de la revisión: 1773 de 1775. Fallaron el rendimiento de `supplier-payments`, que falla en local conocido, y por carga `organization-isolation` (un test, 10,5 s) y `migration-0061`; los dos últimos, corridos solos, pasan (26 tests).
- Mutaciones, una por vez, cada una detectada por la suite nueva y revertida: cotizar con valores de ejemplo, ignorar los puntos sin responder, quitar cada comprobación de `trade_ins`, aceptar un id en las dos listas, y quitar el filtro por organización de los puntos (3d).

## Revisión independiente

Necesaria antes del cierre: la subfase abre un contrato con un consumidor externo (CLAUDE.md, desde el 2026-09-21).

*Del 2026-10-23*, por un agente revisor que no participó del trabajo, con acceso de solo lectura, contra este brief, el ADR 0024, el brief-29.7.3, `read-v3.md`, `SecurityModel.md` y `DataModel.md`, sobre el working tree de `48f4fa4`. Escala fijada antes de leer el código. **Veredicto: sin bloqueantes, cinco no bloqueantes y seis observaciones.** No pudo ejecutar nada ni comparar con `HEAD`; lo que exige ejecución lo cubren las corridas de §Evidencia. Cada hallazgo se verificó contra el código antes de aceptarlo:

| Hallazgo | Verificación | Qué se hizo |
|---|---|---|
| **NB-1.** El contrato prometía reparaciones «nombradas por los puntos» sin `repairs`, algo que el agente nunca recibe | **Cierto**: sin `repairs`, `readRepairCostsForQuote` devuelve los tipos vacíos, el costo queda `null` y la regla da `no_repair_cost` | `read-v3.md` corregido; desviación 8 |
| **NB-2.** AC-8 no estaba probado para los puntos: orgB no tiene `trade_ins` ni puntos, y `UNKNOWN_ID` no es de nadie | **Cierto** | Test 3d: una tercera organización con el perfil completo. Su checklist no comparte ids con el de A; sus puntos no responden los de A; un obligatorio suyo en `failed` no rechaza el equipo de A. Con el filtro por organización de `findChecklistItems` quitado, el 3d falla |
| **NB-3.** Faltaban las unitarias de los validadores que pide §Pruebas, y la regla del parámetro repetido no estaba en el contrato | **Cierto** | `trade-in-quote/handler.test.ts`, 7 tests; `read-v3.md` dice cómo cuentan los parámetros repetidos |
| **NB-4.** `DataModel.md` y el ADR 0024 decían que `tradeins` lee dos funciones de `service`, y son tres | **Cierto**; contradecía D-9 | Notas fechadas en los dos; desviación 7 |
| **NB-5.** El piso en cero no se comparaba con `quoteTradeIn` | **Cierto** | El test 2b compara con la pantalla: valor 10,50, piso 0 y techo 10 |
| O-1. Un comentario de `quote.ts` decía que el resto «no se arma» | Cierto: se calcula y se descarta | Comentario corregido |
| O-2. Las cabeceras de `v1/contract.ts` y `v3/contract.ts` no mencionaban la 29.8.3 | Cierto | Actualizadas |
| O-3. El caso «permite» de `tradeins-dependencies` no lleva el nombre nuevo | Cierto; la lista permitida lo cubre | Sin cambio |
| O-4. La regresión de `quoteTradeIn` para AC-9 es `trade-in-quotes.test.ts`, no `trade-ins.test.ts` | Cierto | Las dos suites corren en §Evidencia |
| O-5. `agent-contract-fields` no fija una clave de los esquemas nuevos | Cierto; la guarda los recorre por nombre | Sin cambio |
| O-6. `.claude/settings.json` sin seguimiento | Cierto | Queda fuera del commit |

Un hallazgo del revisor no autoriza nada: el commit, el push y el despliegue los autoriza el usuario.

## Cierre

*Del 2026-10-25, después del despliegue y de la ventana del agente (su 3.53). El usuario decidió cerrar con `not_accepted` y `not_quotable` sin leer por el agente: quedan declarados abajo, y su ventana corta, en «Esperando».*

### Criterios

| Criterio | Estado | Evidencia |
|---|---|---|
| AC-1 | cumple | `read-api-v3-trade-in-quote.test.ts`, casos 1 y 3c: los puntos activos en su orden, sin el inactivo, y `items: []` sin `trade_ins`, también con los datos intactos |
| AC-2 | cumple | casos 2 y 2b: el mismo piso y techo que `quoteTradeIn`, con la reparación de un punto, la batería bajo el umbral y un piso en cero (este, desde la revisión, NB-5) |
| AC-3 | cumple | casos 3, 3b y 3c, y las unitarias del mapeo: `checklist_incomplete` con sus ids, `not_accepted` con sus nombres, y cada motivo fino, los valores de ejemplo y la capacidad apagada como `not_quotable` |
| AC-4 | cumple | caso 4 y `trade-in-quote/handler.test.ts` (desde la revisión, NB-3): cada `400` por su campo y el mismo `404` para un producto ajeno, inactivo, de servicio o inexistente |
| AC-5 | cumple | caso 5, con montos sembrados que no aparecen en ningún otro campo; `agent-contract-fields` pasa en la CI |
| AC-6 | cumple | caso 2 con la cotización vigente y vencida; las unitarias de `convertRange`, con cada caso `null` |
| AC-7 | cumple | casos 7 y 8, en las dos rutas |
| AC-8 | cumple | casos 4 y 3d (desde la revisión, NB-2): el producto y los puntos de otra organización con `trade_ins`. Quitar el filtro por organización de los puntos hace fallar el 3d |
| AC-9 | cumple | `trade-in-quotes.test.ts`, la regresión de `quoteTradeIn`, y las suites de v1, v2, v3 y la ingestión, sin cambios, en la CI |
| AC-10 | cumple | CI run 40032175544 en `success` sobre `9a971ae`: guardas, unitarias, integración, build y end-to-end. `trade-ins.test.ts` pasó en local antes de cada push |
| AC-11 | cumple | revisión independiente del 2026-10-23, antes del despliegue (§Revisión independiente) |
| AC-12 | cumple, con lo que no se leyó declarado | desplegada en `9a971ae` el 2026-10-23; la ventana 3.53 se concilió el 2026-10-25 (§La ventana). `not_accepted` y `not_quotable` no los leyó el agente |

**Nivel alcanzado**: validado localmente, desplegado y **validado en integración con el agente real** (`producer-consumer`) para el checklist, el rango (con una reparación, la batería bajo el umbral y un piso igual al techo) y `checklist_incomplete`. **`not_accepted` y `not_quotable` quedan validados localmente**: el agente no llegó a leerlos. Los fixtures siguen siendo de forma asumida. No hay negocio real.

### `zod` 4.6.7

La CI del push de la implementación (`e01e071`) se cortó en la auditoría de dependencias, antes de lint y de las pruebas: GHSA-mrhx-c7xc-m3w5 (alto), publicado contra `zod` anterior a 4.6.6, que puede agotar la memoria al validar colecciones restringidas demasiado grandes. Producción corría 4.6.4. Con la autorización del usuario se subió a 4.6.7 en `9a971ae`, un commit propio, solo el parche. Pasaron en local tsc, eslint, unitarias, guardas y las cinco suites de integración de la cotización y de `read-v3`, y la CI de `9a971ae` cubrió los dos commits.

### El despliegue

`9a971ae`, el 2026-10-23, con el runbook de `deploy/production/README.md`, sobre `a7a890f`, que es el SHA para volver atrás. Sin migraciones. Después: el servicio activo, `/api/health` y `/login` `200`, la hoja de estilos `200`, y `trade-in-checklist` y `trade-in-quote` `401` sin token.

### Los datos de la ventana

No se cargó nada: «iPhone Demo» ya tenía lo que pedía D-8. Se verificó en producción, solo leyendo:
- los valores confirmados: umbral 80, rango 10 %, paso 10 USD, sin la marca de ejemplo;
- 10 puntos activos, 2 obligatorios, 4 con reparación;
- el **iPhone 12 64 GB Negro**, usado, a US$ 299, con margen de US$ 100 y costos para sus reparaciones;
- el **iPhone 13 128 GB Azul**, usado, sin margen: `not_quotable`;
- ningún iPhone 12 de 128 GB usado.

El piso en cero no se da con esos costos. El agente no lo pidió: queda en sus pruebas y en las nuestras (caso 2b). Los casos esperados, calculados con la regla, están en `Ventana-29.8.3-CRM-al-Agente.md`, en el Escritorio del usuario.

### La ventana (3.53)

*Del 2026-10-25.* Antes de la ventana, el CRM le marcó al agente que su paso 8 iba a dar `not_accepted` y no `not_quotable`: el CRM revisa las respuestas antes que el margen, y el agente iba a reusar las del iPhone 12 (`Respuesta-3.53-CRM-al-Agente.md`). El agente eligió que las respuestas son de un equipo, y partió el paso 8 en tres turnos (`Respuesta-3.53-Agente-al-CRM.md`).

La ventana fue entre las 01:36 y las 01:45 UTC, desde el teléfono del usuario, en «iPhone Demo» (`Conciliacion-3.53-Ventana-29.8.3.md`). **Sus 31 lecturas coinciden con el log de producción** por `X-Request-Id`, ruta, `OK` y correlación: 11 a `products`, 10 a `trade-in-checklist` y 10 a `trade-in-quote`. De 01:33 a 01:50, los 84 pedidos del log son de `agente-iphone-demo` y todos `OK`: ningún `400` ni `429`.

| Paso | Correlación | Lo que recibió | Esperado |
|---|---|---|---|
| 1 | `35306:r1:i1` | `checklist_incomplete`, 10 ids | sí: el agente tomó la batería de un turno de prueba anterior |
| 3 | `35339:r1:i1` | `170.00`–`190.00` | caso 1 |
| 4 | `35371:r1:i1` y `r2:i1` | `150.00`–`160.00`, «Cambio de batería», dos veces | caso 2 |
| 5 | `35408:r1:i1` | `80.00`–`90.00`, «Cámara trasera» | caso 3 |
| 6 | `35441:r1:i1` y `r2:i1` | `checklist_incomplete` (8 ids) y `70.00`–`70.00`, «Face ID» | caso 5 |
| 8b | `35547:r1:i1` | `checklist_incomplete`, 10 ids | sí |
| 8c | `35581:r1:i1` y `r2:i1` | `checklist_incomplete`, 9 y 2 ids | no llegó a `not_quotable` |

- **Lo que salió distinto es del lado del agente**, y lo corrige en una subfase suya. En el paso 7 tomó «no toma señal» como un problema técnico y no cotizó, así que `not_accepted` no se leyó. En el 8c mandó los puntos en partes, así que `not_quotable` tampoco. En los pasos 4 y 8c, su límite de rondas cortó el turno.
- **Una lectura nº 32, que la conciliación del agente no listaba**: `products` a las 01:45:24 (`35617:r1:i1`), su paso 9. Encontró «iPhone 12 128 GB Azul reacondicionado», que existe en «iPhone Demo» con condición `refurbished`, y dijo que estaba sin stock. El dato salió del CRM, no lo inventó el agente.
- **Ningún monto salió de otro lado que la cotización del turno**, según la conciliación del agente. Nunca dijo «te pagamos» ni un monto fijo.
- **No hay fixtures capturados**: la conciliación trae los ids y lo que dijo el agente, no los cuerpos.

La respuesta es `Respuesta-Conciliacion-3.53-CRM-al-Agente.md`, en el Escritorio del usuario.

### Lo que queda

- **Una ventana corta con `not_accepted` y `not_quotable`**, cuando el agente corrija sus pasos 7, 8c y 9: una tarea en «Esperando». «iPhone Demo» queda como está hasta entonces.
- **En la máquina local**, la suite completa de integración sigue dando fallas de tiempo que en la CI pasan.
