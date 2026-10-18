# 0019 — Las bases de los comprobantes

- Estado: **aceptada** (decisión del usuario del 2026-10-10, después de la revisión independiente y con sus correcciones, entre ellas las de R-1 y R-2 a las recomendaciones D-4 y D-5 del brief; subfase 18.1, [brief-18.1](brief-18.1-adr-bases-de-los-comprobantes.md)). Avisarle al agente que el precio quedó fijado como final queda para más adelante, por decisión del usuario.
- Fecha: 2026-10-10
- Nivel: **diseñado**. No hay código, tablas ni ejecución.
- *Nota del 2026-10-11*: el [ADR 0020](0020-el-pedido.md) usa el contador del punto 2 para el pedido, con el tipo `order`, en un módulo propio (`numbering`), y aplica los puntos 3 y 4 leyendo «emitir» como «crear el pedido». Decide que el pedido no es un comprobante emitido. No cambia este ADR.
- *Nota del 2026-10-12*: el [ADR 0021](0021-la-venta.md), la venta, es el primer comprobante emitido de este ADR. Remite a él en tres puntos, sin cambiar su texto:
  - **punto 3**: la venta de un pedido copia los montos del pedido y no el precio vigente al emitirse, una relectura como la del ADR 0020;
  - **punto 7**: la Fase 20 no discrimina el IVA, así que deja de ser «la primera fase que discrimine el IVA (la 20)». La condición de la organización y las alícuotas esperan a la 13.5.2-b;
  - **§Lo que este ADR no decide**: los montos de la anulación son positivos y el efecto lo da el tipo del comprobante.
- *Nota del 2026-10-13*: el [ADR 0022](0022-cobros-y-caja.md), cobros, caja y cuenta corriente, remite a este en dos puntos, sin cambiar su texto:
  - **punto 2**: las escrituras de dinero toman primero un bloqueo por organización (`pg_advisory_xact_lock`), y el contador sigue al final;
  - **punto 3**: la caja guarda el efectivo por moneda, porque la organización no tiene una moneda por defecto y una venta puede estar en cualquiera.
- *Nota del 2026-10-15*: el [ADR 0023](0023-compras-y-proveedores.md), compras y proveedores, remite a este en dos puntos, sin cambiar su texto:
  - **punto 3**: en una orden de compra y en una recepción sin orden, **la moneda la elige la persona** antes de cargar las líneas, porque sus montos son lo que cobra el proveedor y no salen del precio de venta. Es la elección que este punto deja a la fase que crea el comprobante;
  - **punto 5**: la recepción fija como costo el último costo recibido, con el IVA incluido, en la moneda de la recepción. Si difiere de la del precio, no hay margen, como dice este punto.
- *Nota del 2026-10-18 por el [ADR 0024](0024-rubros-y-capacidades.md), puntos 6 y 10*: el punto 3 se relee en dos casos, sin cambiar su texto. **Un producto con unidades** (IMEI) lleva sus unidades en una tabla hija de la línea, cada una con su precio: el propio de la unidad o, si no tiene, el vigente del producto, y el monto de la línea es su suma. **La venta de una reparación** tiene una sola línea con un producto de servicio, cuyo monto es el total aprobado de la orden de servicio. En los dos casos, una unidad o un monto en otra moneda que el comprobante se rechaza. El tipo de cambio y la moneda del cobro los decide el ADR 0025 (29.3), que supera en parte este punto.
- *Nota del 2026-10-18 por el [ADR 0025](0025-tipo-de-cambio.md)*: **supera en parte el punto 3.** «No hay tipos de cambio» deja de valer para **los movimientos de dinero**: un cobro, una devolución o un pago pueden recibirse o pagarse en otra moneda que su destino, con la cotización guardada (punto 5 del 0025). **El comprobante sigue con una sola moneda y sus líneas no se convierten.** «`organizations` no tiene moneda por defecto» deja de valer para la organización con moneda principal (`main_currency`, punto 2 del 0025). La conversión usa el redondeo del punto 4.

## Contexto

El [ADR 0016](0016-el-crm-se-amplia-hacia-un-erp-por-fases.md) amplió el CRM hacia un ERP por fases. La primera fase, la 18, está a cargo de lo que comparten las siguientes. El [Roadmap](../planning/Roadmap.md) le asignó tres cosas: el costo del producto con historial y su margen, la numeración de comprobantes por organización, y la moneda y los impuestos como datos de los comprobantes.

Al abrir la fase el 2026-10-10 se comprobó que **solo el costo tiene un uso real dentro de ella**. El primer comprobante aparece en la Fase 19 (el pedido) o en la 20 (la venta). Una tabla de numeración o de alícuotas creada ahora quedaría vacía, y eso lo prohíben `CLAUDE.md` y el punto 2 del ADR 0016. **El usuario decidió ese día** que la numeración, la moneda y los impuestos entren en la Fase 18 como decisiones de este ADR, y que sus tablas se creen con el primer comprobante que las use.

Lo que acota la decisión, verificado el 2026-10-10:

- **El dinero ya tiene forma**: `numeric(14, 2)`, leído como `bigint` en centésimos con `src/shared/money/`, nunca como `number`. La moneda va en cada fila, en ISO 4217, validada contra `Intl` y sin las monedas de tres decimales ([DataModel](../architecture/DataModel.md) §`product_prices`).
- **El precio de venta no dice si incluye impuestos**: ni DataModel ni FR-PROD-12 lo aclaran.
- **El agente lee ese precio y se lo dice a los clientes** (`price.amount` y `price.currency` en [read-v1](../contracts/read-v1.md) §Productos).
- **No hay tipos de cambio**, y un producto puede tener el precio en una moneda y el costo en otra.
- **`organizations`** solo tiene `name` y `timezone`: ni moneda ni condición fiscal.
- **Una secuencia de PostgreSQL no garantiza una numeración sin huecos.** Un `nextval` no se devuelve si la transacción se revierte (documentado por PostgreSQL, *Sequence Manipulation Functions*). El CRM ya serializa escrituras bloqueando una fila `FOR UPDATE` dentro de la transacción, como el saldo de `inventories` ([brief-4.3.1](brief-4.3.1-transaccion-de-ajuste-de-stock.md)).
- **No hay un negocio real** (13.5.2-b). Su condición frente al IVA, de la que depende buena parte del tratamiento, no se conoce.

**Lo que se sabe del marco fiscal, con su nivel.** Este ADR no da asesoramiento fiscal: fija cómo guarda los datos el CRM.

| Afirmación | Fuente | Nivel |
|---|---|---|
| Las alícuotas de IVA vigentes incluyen el 10,5 %, el 21 % y el 27 %, además del 0 % y el exento | [ARCA, tablas del Libro IVA Digital](https://www.afip.gob.ar/iva/documentos/Libro-IVA-Digital-Tablas-del-Sistema.pdf) | documentado por ARCA, sin releer la tabla completa en esta subfase |
| Un monotributista emite comprobantes clase C, que no discriminan el IVA; un responsable inscripto discrimina el impuesto según el comprador | [ARCA, preguntas frecuentes de facturación](https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?id_nivel1=562&id_nivel2=603&id_nivel3=3166&p=Facturaci%C3%B3n+a+Monotributistas) | documentado por ARCA; la respuesta citada es de 2021 |
| Los comprobantes que emite un comercializador deben detallar el IVA contenido, con la leyenda «Régimen de Transparencia Fiscal al Consumidor Ley 27.743» | [ARCA, novedad del 01/04/2025](https://servicioscf.afip.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=4709), RG 5614/2024 | documentado por ARCA. Rige para los **comprobantes fiscales**; un comprobante interno del CRM no lo es (punto 6) |
| Quien vende a consumidores finales debe exhibir, junto al precio final, el precio sin impuestos nacionales; los monotributistas estarían exceptuados | Ley 27.743, art. 99, según un aviso del Boletín Oficial y la prensa | **pendiente**: no se leyó el texto de la ley ni una fuente de ARCA. Ver el punto 4 |
| Un responsable inscripto computa como crédito fiscal el IVA de sus compras; para un monotributista, el IVA que paga es parte del costo | — | **práctica habitual, sin fuente** citada en este ADR. Ninguna decisión depende de ella: el punto 5 carga el costo con el IVA incluido para cualquier condición |
| La leyenda de la Ley 27.743 no se exige en un documento interno, no fiscal | — | **pendiente**: es una interpretación del alcance de la RG 5614/2024. Se confirma con la 13.5.2-b (punto 6) |

## Decisión

### 1. Qué decide este ADR

**Decide**:
- la numeración;
- la moneda de un comprobante;
- el tratamiento del IVA y la semántica del precio;
- que los comprobantes son internos;
- la base del margen;
- qué se crea en cada fase.

**No decide**:
- el diseño del pedido y de la venta (Fases 19 y 20);
- la factura electrónica de ARCA, que lleva un ADR propio (ADR 0016, punto 6);
- los tipos de cambio, las listas de precios y los descuentos, que no tienen fase.

### 2. La numeración: correlativa, sin huecos, por organización y por tipo

- Cada tipo de comprobante numerado tiene **una serie por organización**: 1, 2, 3, y así, sin huecos.
- El número sale de **un contador por `(organization_id, tipo)`**: una fila que se bloquea `FOR UPDATE` y se incrementa en la misma transacción que emite el comprobante.
  - **La fila nace en la primera emisión**, dentro de la misma transacción, con `INSERT … ON CONFLICT DO NOTHING` y después el bloqueo. Es el patrón del saldo de `inventories` (DataModel §`inventories`). Así también se serializan dos primeras emisiones simultáneas.
  - Si la transacción se revierte, el número no se consume.
  - Dos emisiones simultáneas del mismo tipo en la misma organización se serializan en esa fila. Es un costo aceptado mientras el volumen sea el de un negocio chico.
  - El contador lo escribe **una sola función** del módulo dueño, con una guarda de escrituras como la de `price-writes` y `stock-writes`.
- Un comprobante tiene `UNIQUE (organization_id, tipo, número)`. La base, y no solo la aplicación, impide repetir un número (DataModel, regla 7).
- El número se asigna **al emitir** y nunca se reutiliza. Un comprobante emitido no se edita ni se borra: **se anula con otro**, y el anulado conserva su número (ADR 0016, punto 4).
- **Se muestra con un prefijo por tipo y con ceros a la izquierda**: por ejemplo, `P-000123`. Cada fase que crea un tipo fija su prefijo. La base guarda el número como entero.
- **Hay un solo punto de emisión por organización.** Los puntos de venta son de la factura de ARCA, si llega.

### 3. La moneda: una por comprobante, sin conversión

- **Un comprobante tiene una sola moneda.** Cada línea copia el monto y la moneda del precio vigente de su producto al emitirse.
- **La moneda del comprobante es la de su primera línea.** Un comprobante sin líneas no se emite.
- **Se rechaza la línea cuyo precio vigente esté en una moneda distinta de la del comprobante**, con un mensaje que lo diga, y también **la línea de un producto sin precio**. Si el usuario puede elegir la moneda antes de cargar líneas, lo decide la fase que crea el comprobante.
- **No hay tipos de cambio.** Entran sin fase, cuando el uso los pida.
- `organizations` no tiene moneda por defecto: la toman las líneas.

### 4. El IVA y la semántica del precio

- **El precio de `product_prices` es el precio final al consumidor, con los impuestos incluidos si corresponden.**
  - Es lo que un cliente espera pagar, y la lectura natural de «el precio vigente» que el agente recibe en `read-v1`. Cómo lo presenta el agente **no está verificado**: el CRM no lo ve.
  - **Hasta hoy la semántica no estaba escrita; este ADR la fija.** Se escribe en DataModel, en FR-PROD-12 y en `read-v1`.
  - **No es un cambio de v2** según `read-v1` §Versionado: no cambia la forma, ni una regla de cálculo, ni un código. Ningún consumidor pudo depender de otra lectura, porque ninguna estaba escrita, y los precios cargados no cambian. Si el agente los presentara como netos, la precisión lo pondría en evidencia: por eso conviene el aviso opcional (brief-18.1, D-8).
- **El comprobante guarda lo que valía al emitirse** y nunca se recalcula a partir del producto:
  - en cada línea, el precio unitario final, la cantidad y el total;
  - si la organización discrimina el IVA, también la alícuota, el neto y el IVA de la línea.
- **El redondeo es por línea, a los decimales de la moneda del comprobante** (dos en ARS o USD, ninguno en CLP, según `currencyDecimals` de `src/shared/money/`), **con el medio hacia afuera del cero**, y el total del comprobante es la suma de los totales de sus líneas. El neto de una línea se calcula a partir de su total final y de su alícuota, y el IVA es la diferencia. Así, el neto y el IVA siempre suman el total.
- **La condición de la organización frente al IVA** (responsable inscripto, monotributo o exento) **y la alícuota de cada producto** se crean con **la primera fase que las use** (punto 7). Hasta entonces el CRM no las guarda.
- **Pendiente para el negocio real**: si la Ley 27.743 le exige al negocio exhibir el precio sin impuestos junto al final (ver la tabla), el CRM lo derivaría del precio final y de la alícuota. Esto **se resuelve con la 13.5.2-b**, con la condición del negocio y una fuente leída. **Este ADR no afirma que la obligación alcance a lo que cotiza el agente.**

### 5. La base del margen

La usa la 18.2.

- **El costo es lo que el negocio paga por una unidad, con el IVA incluido**, lo recupere o no. Es la misma base que el precio final, así que precio y costo se comparan con los impuestos incluidos de los dos lados.
- **El margen es el precio vigente menos el costo vigente.** Su porcentaje se calcula **sobre el precio**: `(precio − costo) / precio`.
- **Si el precio y el costo están en monedas distintas, no hay margen**, y la pantalla lo dice. Tampoco lo hay si falta uno de los dos.
- **El límite, escrito**: para un responsable inscripto, que recupera el IVA de la compra, con la misma alícuota en la compra y en la venta, **el porcentaje es exacto pero el monto incluye el IVA**. Por ejemplo, un precio de 121 y un costo de 60,50 dan un margen del 50 % y un monto de 60,50, cuando el neto es de 50. Si las alícuotas difieren, el porcentaje tampoco es exacto.
- **Se revisa con la 13.5.2-b**, cuando se conozca la condición del negocio real. Si es responsable inscripto, el margen pasa a montos netos con la alícuota del punto 4.

### 6. Comprobantes internos, no fiscales

- Todo comprobante del CRM lleva la leyenda **«Documento no válido como factura»**.
- Su numeración es independiente de cualquier numeración de ARCA.
- El CRM **no calcula percepciones, retenciones ni otros impuestos** además del IVA del punto 4.
- La leyenda de la Ley 27.743 rige para los comprobantes fiscales, y este ADR no la agrega a los internos. Que un documento interno entregado a un consumidor final quede fuera es una interpretación **pendiente**: se confirma con la 13.5.2-b, con una fuente leída.

### 7. Qué se crea y en qué fase

**Solo la fase que usa una tabla la crea.**

| Qué | Dónde y cuándo |
|---|---|
| `product_costs`, de solo inserción como `product_prices` | **18.2**, con la base del margen del punto 5 |
| El contador de numeración del punto 2 | con el primer tipo numerado: la **Fase 19** si el pedido lleva número, o la **20** |
| La condición de la organización frente al IVA y la alícuota de cada producto | con la primera fase que discrimine el IVA (la **20**), o antes si la 13.5.2-b cambia la base del margen (punto 5) |
| Las líneas con su moneda, sus montos y su IVA guardados al emitir | con cada comprobante, en su fase |

## Alternativas descartadas

- **Crear ahora las tablas de numeración y de impuestos**, como decía el Roadmap. Quedarían vacías hasta la Fase 19 o la 20.
- **Una secuencia de PostgreSQL por organización y tipo.** Es más simple, pero deja un hueco con cada transacción revertida, y un hueco se lee como un comprobante borrado.
- **El `id` como único identificador.** Un UUID no se le dicta a un cliente por WhatsApp.
- **Precios netos con el IVA sumado en el comprobante.** Cambiaría la semántica de lo que el agente cotiza hoy: exigiría coordinarlo con él y una versión nueva del contrato.
- **Recalcular el comprobante con el precio vigente.** Un comprobante emitido diría otra cosa cada vez que cambiara el precio.
- **Redondear sobre el total.** Las líneas dejarían de sumar el total.
- **Redondear siempre a centésimos.** En una moneda sin decimales, como el CLP, las líneas tendrían centavos que la moneda no tiene, y al mostrarlas dejarían de sumar el total.
- **El costo sin los impuestos que se recuperan.** Para un responsable inscripto, compararía un costo neto con un precio final, y el margen saldría inflado: con un precio de 121 y un costo neto de 50, un 58,7 % en lugar de un 50 %.
- **El margen sobre montos netos desde la 18.2.** Exige la condición frente al IVA y las alícuotas de un negocio que todavía no existe.
- **Convertir monedas con un tipo de cambio cargado a mano.** Suma una tabla y una fuente de error para un caso que nadie pidió.

## Consecuencias

- **Enmiendas, con fecha y conservando el texto anterior** (brief-18.1, D-8):
  - el **Roadmap** §Fases 18 a 22, con el perímetro de la Fase 18;
  - **DataModel**: la regla 14 y §«Explícitamente fuera de este modelo», con una nota de diseño y sin tablas, y la semántica del precio en §`product_prices`;
  - **FR-PROD-12**: el precio es el final;
  - **`read-v1`** §Productos: la misma precisión, **sin cambio de versión**.
- **La 18.2** usa el punto 5 tal como está.
- **Las Fases 19 y 20** usan los puntos 2 a 4 y crean sus tablas según el punto 7.
- **La 13.5.2-b suma dos preguntas** para el negocio real: su condición frente al IVA y si la exhibición del precio sin impuestos lo alcanza (puntos 4 y 5).
- **Riesgo**: que la condición del negocio real sea responsable inscripto y el margen de la 18.2 se lea como neto cuando no lo es. Lo mitiga que la pantalla diga sobre qué base está calculado.

## Lo que este ADR no decide

- El diseño de un pedido, de una venta, de la caja o de una compra.
- La factura electrónica de ARCA, los puntos de venta, las percepciones y las retenciones.
- Los tipos de cambio, las listas de precios y los descuentos.
- Quién ve el costo y el margen: lo decide el brief de la 18.2.
- Si además del margen se muestra el **recargo sobre el costo**, `(precio − costo) / costo`: lo decide el brief de la 18.2 (brief-18.1, D-5 (c)).
- **Si un pedido numerado es un comprobante emitido** en el sentido del punto 2: el pedido tiene estados (pendiente, confirmado, entregado, cancelado; Roadmap §Fase 19), y una tabla con estado mutable no es de solo inserción (ADR 0013). Es una pregunta de la Fase 19.
- **El signo de los montos de una anulación**: hoy `moneyToDatabase` rechaza los negativos. Si el efecto lo da el tipo del comprobante, como en `inventory_movements`, o si van montos negativos, lo decide la fase que cree la anulación.
