# Brief 24.6.2-c — Mostrador con dos monedas

- **Tipo de tarea**: `implementation`.
- **Estado**: **aprobado por el usuario el 2026-11-03, con las recomendaciones del brief.** La
  forma y el ligado los había decidido él el 2026-11-02 y están en D-1 y D-2, sin reabrirse. Al
  aprobar cerró las **tres decisiones que quedaban abiertas** —D-5, D-6 y D-7, las tres que la nota
  del Roadmap dejó anotadas—, cada una por su opción recomendada. **Aprobar el brief no autoriza
  commit, push ni despliegue**: cada uno se pide en su turno.
- **Decide D-6 del brief de la 24.6.2-b**: pedir este brief eligió el orden, la **-c antes que la
  -d**. Es el orden favorable: el panel de cobro de la -d se va a diseñar sabiendo que una
  operación puede emitir dos comprobantes, en vez de descubrirlo después.

## Objetivo

Que el mostrador (`/ventas/nueva`) acepte líneas en **monedas distintas** y que al emitir produzca
**un comprobante por moneda**, cada uno con su número y su cobro por separado, en **una sola
transacción**.

Sale del recorrido del usuario sobre la 24.6.2 el 2026-11-02: hoy la pantalla **rechaza** la línea
cuyo precio vigente esté en otra moneda que la primera. No es un defecto de aquella subfase —es la
regla vigente, y la lámina la describe—: es un pedido nuevo del negocio, que vende accesorios en
pesos y equipos en dólares en la misma atención.

## Punto de partida verificado

Leído en el código el 2026-11-03, antes de escribir el alcance. Cada afirmación con su archivo y
su línea, porque de acá sale el tamaño.

- **Dónde se rechaza hoy la moneda mezclada**: `evaluateLines`, en `src/shared/lines/rules.ts:326`.
  Toma la moneda de la primera línea y marca `currency_mismatch` en las demás
  (`rules.ts:335-337`). Es una **función pura compartida**: la llaman `sales` (`service.ts:443`) y
  `orders` (`orders/service.ts:262`).
- **Ese código de rechazo viaja en el contrato con el agente de WhatsApp.**
  `currency_mismatch` está en la lista de `src/modules/ingestion/service.ts:157` y lo fijan
  `tests/integration/orders-agent.test.ts:470, 502, 567, 575` y
  `orders-agent-units.test.ts:458`. **Tocar `evaluateLines` es tocar un contrato versionado con
  otro repositorio**, que el ADR 0014 prohíbe modificar de paso.
- **La emisión ya es una sola transacción con el orden de bloqueo del ADR 0021, punto 7**:
  `issueSale` (`src/modules/sales/service.ts:400-404`) toma el cliente en modo compartido, los
  productos por id (`lockProductsForOrder`, `catalog/service.ts:466`, que bloquea **todos** los
  productos de **todas** las líneas de una sola vez), las unidades, y los saldos `FOR UPDATE`
  dentro de `sellStock`.
- **El contador se toma al final, dentro de `sellStock`**: `reason: async () => { number = await
  nextDocumentNumber(...) }` (`sales/service.ts:488-492`). `sellStock`
  (`inventory/service.ts:1291-1315`) bloquea primero las unidades (`lockLineUnits`), después los
  saldos (`lockLines`), y **recién entonces** llama a `reason()` una sola vez.
- **El contador soporta N números sin cambios.** `takeNextNumber`
  (`numbering/repository.ts:14-39`) bloquea su fila `FOR UPDATE` dentro de la transacción del
  documento, lee, suma uno y escribe. Llamado dos veces en la misma transacción, la segunda ve la
  escritura de la primera: los números salen **consecutivos**, y si la transacción se revierte
  **ninguno se consume**.
- **La segunda inserción no pide bloqueos nuevos.** `insertSale` toma `FOR KEY SHARE` sobre el
  cliente y los productos por sus claves foráneas (precisión del 2026-10-13 al ADR 0021, punto 7),
  y esas filas ya quedaron bloqueadas por esta transacción: volver a tomarlas es gratis.
- **La pantalla ya conoce la moneda de cada línea del lado del cliente**: el precio viene del
  buscador (`searchOrderProductsAction`, `OrderProductOption`), y el formulario ya calcula
  `mixed` con eso (`ventas/nueva/sale-form.tsx:179`). **Sin JavaScript no lo conoce**: el buscador
  está detrás de la hidratación.
- **`/pedidos/nuevo` tiene el mismo aviso**, en `pedidos/nuevo/order-form.tsx:142`, y un pedido
  **sigue con una sola moneda**. Las dos pantallas, hoy gemelas, quedan distintas a propósito
  (V-2).
- **Lo que ya está listo del lado del dinero**: la caja guarda el efectivo por moneda
  (`cash/totals.ts`), el saldo del cliente agrupa por moneda desde la 24.4.2, y el cobro recibe en
  otra moneda con una cotización acordada desde la 29.4. **Esta subfase no toca ninguno**.

### El radio de impacto del resultado de `issueSale`, contado antes de tocar nada

| Medición, el 2026-11-03 | Número |
|---|---|
| Archivos de `tests/integration/` que llaman a `issueSale` | **19** |
| Llamadas en total | **53** |
| Archivos que leen `.sale` o afirman `sale: {` del resultado, en una ventana de 14 líneas | **13** |
| Afirmaciones `toEqual({ ok: true, sale: … })`, exactas por definición | **6** |

La ventana de 14 líneas **subestima**: `tests/integration/trade-ins.test.ts:622` lee `sale.sale.id`
veinte líneas después de la llamada, y no entró en la cuenta. Por eso **la lista cerrada nombra los
19 archivos** y no los 13: el subconjunto exacto lo produce `tsc`, que marca cada lectura, y la
implementación informa cuál fue. Lo que importa es que **ningún sitio queda a la vista del ojo**:
el compilador los enumera y las seis afirmaciones exactas fallan en rojo, no en silencio.

### Las fronteras entre módulos, releídas con `grep` el 2026-11-03

- **`sales` no suma dependencias.** La agrupación por moneda es aritmética dentro de
  `sales/service.ts`; no consulta `cash`, ni `service`, ni `tradeins`.
- **`sales` sigue sin conocer `service`** (`DataModel.md:1441`: «`sales` no conoce `service`»): la
  orden apunta a la venta.
- **`inventory` sigue sin conocer `sales`**: `sellExpandStock` no existe, y `sellStock` recibe
  líneas y un motivo, no una venta. El cambio de D-1 **mantiene** esa dirección: el motivo pasa a
  resolverse por producto, y quien sabe qué venta es cada producto sigue siendo `sales`.
- **Las guardas que fijan quién escribe stock siguen valiendo tal cual.**
  `tests/guards/stock-writes.test.ts` fija el **archivo** (`sales/service.ts`), no la función;
  `tests/guards/unit-writes.test.ts:204` y `:211` fijan además el **nombre** `issueSale`. D-4
  conserva ese nombre a propósito, así que **ninguna guarda se toca** y las dos siguen probando lo
  que probaban.
- **Ninguna tabla, migración ni contrato nuevo.** `sales` y `sale_lines` son insert-only
  (`DataModel.md:25`) y nada en el modelo exige «una venta por operación»: el modelo no conoce la
  operación.

## Hallazgos que condicionan el alcance

### H-1 · El README del lote dice lo contrario, en prosa, y queda superado

`docs/ui-redesign/v2/20-ventas/README.md:42` dice: «Las líneas de monedas distintas se rechazan
según las reglas actuales; no se convierten con un tipo de cambio implícito».

Es un conflicto documental explícito y se resuelve por la jerarquía de fuentes de verdad de
`CLAUDE.md`: la decisión del usuario del 2026-11-02, registrada en `docs/planning/Roadmap.md`
(nivel 3), **corrige** al README del lote de láminas (nivel 5). Lo que el README describía era la
regla vigente ese día, no una decisión de diseño propia.

Dos consecuencias prácticas:

1. **El README no se reescribe.** Es el registro fechado de lo que se dibujó el 27 de octubre; un
   documento de esa clase se cita, no se edita para que coincida con lo que vino después. La
   divergencia queda declarada acá y en `Screens.md`.
2. **La segunda mitad de esa frase sigue viva y es una restricción**: «no se convierten con un
   tipo de cambio implícito». Esta subfase **no convierte nada** ni suma monedas, y la línea 32 del
   mismo README —«Se evita un total único entre ARS y USD»— es la que obliga a D-7.

### H-2 · Llamar dos veces a `issueSale` dejaría mercadería descontada sin comprobante

Verificado en el código, y es el centro del tamaño. `issueSale` **abre su propia transacción**
(`repository.withTransaction`, `service.ts:401`). Dos llamadas son dos transacciones: la primera
podría confirmar y la segunda fallar por stock, dejando **una venta emitida con su mercadería
descontada y la otra no**, sin ningún dato que las relacione para deshacerlo —y el usuario decidió
justamente que **no queden ligadas**, así que no habría de dónde agarrarse—.

### H-3 · El orden de bloqueo prohíbe tomar el contador y después otra fila

El ADR 0021, punto 7, cierra con: «Ningún camino bloquea un contador y después otra fila, ni saldos
antes que productos».

Llamar a `sellStock` una vez por grupo de moneda **violaría esa regla**: los productos de un grupo
no están en otro —un producto tiene un precio vigente y una sola moneda—, así que los saldos del
segundo grupo se bloquearían **después** de que el primer grupo ya tomó el contador, y la
transacción quedaría esperando un saldo con el contador de la organización retenido. Eso es
exactamente el ciclo que la regla evita, y la razón por la que el contador va al final.

**De acá sale el único cambio de firma de la subfase** (D-1): `sellStock` tiene que bloquear
**todas** las líneas de **todas** las monedas antes de tomar cualquier número.

### H-4 · La división es por línea, nunca dentro de una línea

`evaluateLines` tiene **dos** rechazos por moneda, no uno:

- `currency_mismatch` (`rules.ts:335`), cuando el **precio del producto** está en otra moneda que
  la primera línea. Este es el que deja de aplicar en el mostrador: la línea ya no choca, se va a
  otro comprobante.
- `unit_currency_mismatch` (`rules.ts:363-370`), cuando **una unidad** de una línea tiene su precio
  propio en otra moneda que el **producto de esa misma línea**. Este **sigue valiendo**: una línea
  es atómica, va entera a un comprobante, y una unidad no puede irse sola a otro.

El mensaje de hoy dice «otra moneda que la primera línea», y eso pasa a ser falso: tiene que decir
la moneda de **su** línea (D-3).

### H-5 · Sin JavaScript no hay agrupación en vivo, y no es un defecto

El formulario conoce la moneda de cada línea porque el buscador de productos la trae, y ese
buscador está detrás de la hidratación (`Screens.md` §19: «No hay panel ni chips… sin JavaScript el
IMEI se escribe a mano»). Sin JavaScript, el bloque de agrupación **no puede existir** antes de
enviar: el navegador no sabe en qué moneda está cada precio.

Lo que sí tiene que pasar sin JavaScript: **la emisión funciona igual** y produce los N
comprobantes. La agrupación la hace el servidor, que es el único que conoce los precios vigentes.
AC-9 lo fija.

### H-6 · El límite de líneas no cambia, y el de comprobantes no se inventa

`too_many_lines` se valida sobre el formulario entero antes de leer precios
(`rules.ts:104-108`, 50 líneas), y **se queda así**: el tope es de líneas, no de comprobantes. La
cantidad de comprobantes queda acotada por las monedas distintas que haya entre las líneas, que a
su vez están acotadas por los precios del catálogo. **No se agrega un tope nuevo**: sería un número
inventado sin un caso que lo pida.

## Diferencias con la v2, declaradas antes de implementar

### V-1 · El bloque de agrupación no tiene lámina

Las láminas 02 y 06 de [V2-09](../ui-redesign/v2/20-ventas/README.md) dibujan el mostrador con una
sola moneda, porque el caso no existía cuando se dibujaron. **No hay lámina contra la que comparar
el bloque nuevo.**

Lo que no exime de AC-11: todo lo que la lámina **sí** dibuja tiene que seguir coincidiendo entrada
por entrada, y el bloque nuevo tiene que estar escrito en el idioma de la lámina —el resumen «Antes
de emitir», sus filas con ícono, su tipografía de montos—, no en uno propio. La 24.6.2-e midió lo
que cuesta saltear esa comparación: el único defecto que ni 364 casos de extremo a extremo ni una
revisión independiente encontraron apareció al poner el PNG al lado de una captura real.

### V-2 · El mostrador y el alta de un pedido quedan distintos a propósito

Son dos formularios gemelos —el del mostrador se construyó con el del pedido como molde— y hasta
hoy rechazaban la moneda mezclada igual. Desde esta subfase **no**: el mostrador emite N
comprobantes, el pedido sigue rechazando.

El motivo es del modelo, no del gusto: **un pedido tiene una moneda** (`orders`), lo reserva, lo
copia a la venta al entregarse y lo expone en el contrato de ingestión con el agente. Dividir un
pedido en N sería otra subfase, con otro ADR. Queda **excluido** y escrito en un comentario del
código, para que el próximo que mire las dos pantallas no lo lea como un olvido.

### V-3 · El objetivo táctil de 44 px sigue sin cumplirse

Deuda transversal que la 24.6.2-e dejó **medida**: el sólido da 40 px fuera de una tabla y 36
dentro; el de borde, 38. En esta pantalla los dos controles del resumen ya llevan `min-h-11`
(`sale-form.tsx:568` y `:581`), así que **cumplen**. Las filas del bloque nuevo **no son controles**, así
que no les aplica. Nada de esto se corrige acá: arreglar la clase compartida es una subfase propia,
todavía sin abrir.

## Decisiones

### D-1 · Una transacción, todos los bloqueos una vez, los N números al final

Decidido por el ADR 0021, punto 7, y por H-2 y H-3; no es una preferencia.

`issueSale` queda con **una sola** llamada a `sellStock`, con **todas** las líneas de **todas** las
monedas. `sellStock` cambia su motivo de

```ts
reason: () => Promise<string>
```

a un motivo **por producto**, resuelto en una sola llamada después de que estén tomados todos los
bloqueos:

```ts
reason: () => Promise<(productId: string) => string>
```

Así el orden queda: cliente en modo compartido → productos por id → unidades → saldos `FOR
UPDATE` → **los N contadores** → los movimientos, cada uno con el número de **su** venta → las N
cabeceras con sus líneas, sus unidades y su entrada de auditoría.

- Es el **único** cambio de firma de la subfase, y toca una función con **un solo** llamador fuera
  de `inventory` (`sales/service.ts:482`). Las otras funciones de `inventory` que reciben un motivo
  —`restoreSaleStock`, `receiveStock`, `removeReceivedStock`— **no se tocan**.
- Los números salen del mismo patrón que ya existe: hoy la clausura guarda `let number: number |
  null`; pasa a guardar un número por moneda, y el `throw new Error("La venta no tomó su número.")`
  se conserva como invariante, ahora por comprobante.
- **El rechazo es global**: `lockLines` y la comprobación de unidades miran todas las líneas
  juntas, así que si a una le falta stock no se emite **nada** (D-3).

### D-2 · La moneda de cada comprobante es la de sus líneas, y el orden es el de aparición

Decidido por el usuario el 2026-11-02 —una venta por moneda, emitidas juntas, los comprobantes
**no** ligados, las líneas **no** convertidas— y por el ADR 0019, punto 3, que deja a «la fase que
crea el comprobante» decidir cómo se elige la moneda. No se reabre.

- Las líneas se agrupan por la **moneda del precio vigente de su producto**, leída dentro de la
  transacción como hoy.
- **El orden de los comprobantes es el de la primera línea de cada moneda.** La moneda de la
  primera línea del formulario se lleva el número más bajo. Es predecible y es la lectura natural
  de «la moneda del comprobante es la de su primera línea» del ADR 0019.
- Cada grupo pasa por `evaluateLines` **tal como está**, una vez por grupo: el grupo es homogéneo,
  así que la función ve lo que siempre vio y **no se modifica ni una línea de `rules.ts`**. Las
  fallas de los N grupos se **unen** antes de responder, conservando la posición de cada línea, para
  que el formulario marque todas las líneas con problema de una vez y no una tanda por envío. El
  orden de la unión es: los productos que no están, las reglas de línea, el precio que cambió y el
  total. **No es idéntico al de una sola llamada**, y la revisión independiente encontró en qué
  (hallazgo 5): `evaluateLines` comprueba el precio cambiado **entre** sus dos clases de regla de
  línea, así que con dos monedas una entrada que tenga a la vez un precio cambiado en un grupo y un
  total en cero en el otro responde `line_rules` donde con una sola moneda habría respondido
  `CONFLICT`. Ninguna de las dos escribe nada y las dos conservan lo cargado: cambia el mensaje.
- `total_too_large` queda **por comprobante**, que es lo correcto: el tope es del documento.
- No se escribe ningún dato que relacione los comprobantes. Son dos ventas normales.

### D-3 · Todo o nada, y los rechazos que sobreviven

- Si **cualquier** grupo falla por cualquier motivo, no se emite **ninguno** comprobante, no se
  consume **ningún** número y no se mueve **nada** de stock. Es la conducta de hoy, extendida: «si
  no alcanza lo disponible, no se emite nada».
- `currency_mismatch` **deja de poder ocurrir en el mostrador**. Su mensaje queda en
  `ventas/messages.ts` porque el tipo del rechazo lo sigue incluyendo —es compartido con pedidos—,
  con un comentario que diga que en esta pantalla es inalcanzable.
- `unit_currency_mismatch` **sigue vivo** (H-4) y su mensaje se reescribe: «La unidad con IMEI X
  tiene su precio en otra moneda que su línea (ARS): corregí su precio». Hoy dice «que la primera
  línea», que pasa a ser falso.

### D-4 · El resultado pasa a nombrar N ventas, y la función conserva su nombre

`IssueSaleWithoutOrderResult` cambia su rama de éxito:

```ts
| { ok: true; sales: [IssuedSale, ...IssuedSale[]] }   // antes: { ok: true; sale: IssuedSale }
```

Una tupla no vacía, ordenada por número. Y **la función sigue llamándose `issueSale`**.

Las tres alternativas que se descartaron, con su motivo:

| Alternativa | Por qué no |
|---|---|
| Dejar `sale` y agregar `sales` | `sale` sería «la primera de N», que es mentira; y las **6** afirmaciones `toEqual` se rompen igual, porque `toEqual` es exacto. Paga el costo sin comprar la honestidad |
| Una función nueva `issueSales` y `issueSale` como envoltorio | El envoltorio devolvería la primera de N y sería una trampa para el próximo llamador. Además rompe `unit-writes.test.ts:204` y `:211`, que fijan el **nombre** |
| Renombrar a `issueSales` | Suma los 19 sitios de importación y la guarda a un cambio que ya toca 13 archivos, para ganar una letra. El plural vive en el tipo del resultado, donde el compilador lo hace cumplir |

El costo de lo elegido está medido arriba y es **mecánico y verificable**: `tsc` marca cada lectura
de `.sale` y las seis afirmaciones exactas fallan solas.

**El cambio deliberado de una afirmación ajena**: `tests/integration/sales.test.ts:1476` afirma hoy
que `[tv (ARS), dollars (USD)]` se rechaza con `currency_mismatch`. Desde esta subfase **emite dos
comprobantes**, así que esa afirmación se reescribe en su lugar, fechada y con el motivo al lado, y
el caso pasa a comprobar los dos comprobantes. El caso de `too_many_lines` y el de
`total_too_large` del mismo bloque **no cambian**.

### D-5 · A dónde va después de emitir: al detalle con uno, al listado con dos

**Cerrada por el usuario el 2026-11-03 al aprobar el brief: la opción A.** Era la primera de las
tres preguntas que la nota del Roadmap dejó abiertas. Hoy el alta redirige al
detalle de la venta (`actions.ts:223`; la línea 74, la del alta desde un pedido, no se toca) y con dos comprobantes **ya no hay una sola**.

| Opción | Qué pasa | Costo |
|---|---|---|
| **A — Recomendada.** Un comprobante: igual que hoy, al detalle. **Dos o más**: al listado, con el aviso «Se emitieron 2 comprobantes: V-000045 y V-000046.» | El caso común **no cambia en nada**. Con N, las dos ventas son las dos primeras filas del listado, cada una con su «Ver» y su comprobante | Un aviso nuevo en `/ventas`, que hoy no tiene ninguno. El listado ya ignora los parámetros que no conoce (`filters.ts:34`), así que `aviso` y `numeros` no alteran ningún filtro |
| B | Siempre al detalle del **primero**, con un aviso que enlaza al otro | Privilegia un comprobante sin motivo, y con tres monedas el aviso se vuelve una lista dentro de una ficha |
| C | Una pantalla intermedia con los N comprobantes y sus enlaces de impresión | Una pantalla nueva sin lámina, para un caso de dos filas que el listado ya muestra |

**Recomendación: A.** Y con una precisión de seguridad que vale un criterio: los números del
parámetro se validan contra `^V-\d{6}$`, hasta diez; cualquier otra cosa cae en el aviso genérico
«Se emitieron los comprobantes.» y nunca se imprime tal cual en la página.

### D-6 · El alta desde un pedido queda igual

La segunda pregunta de la nota. **Cerrada por el usuario el 2026-11-03: queda igual, sin tocar una
línea.**

`issueSaleFromOrder` copia los montos del pedido (ADR 0019, punto 3) y **un pedido tiene una sola
moneda**: no hay nada que dividir. Lo mismo `issueServiceSale`, que emite una línea con el total
aprobado de su orden de servicio, en su moneda. Dividir un pedido en N comprobantes sería cambiar
el modelo del pedido, su reserva y su contrato con el agente: otra subfase y otro ADR (V-2).

### D-7 · Cómo se ve la agrupación antes de emitir

La tercera pregunta de la nota. **Cerrada por el usuario el 2026-11-03**: el resumen «Antes de
emitir» gana un bloque, y las líneas **no se reordenan**.

- **Con una sola moneda, la pantalla no cambia en nada**: el bloque no aparece y el «Total
  estimado» queda tal cual.
- **Con dos o más**, el aviso rojo de hoy —«Hay líneas en monedas distintas: la venta toma la
  moneda de la primera, y las otras se rechazan», `sale-form.tsx:468-472`— **se borra**, porque
  pasa a ser falso, y en su lugar el resumen muestra **«Comprobantes a emitir»** con una fila por
  moneda: la moneda, cuántas líneas y su total estimado.
- **El «Total estimado» único desaparece cuando hay más de una moneda**, reemplazado por el total
  de cada comprobante. Es lo que manda la línea 32 del README del lote —«Se evita un total único
  entre ARS y USD»— y la convención de métricas de la Fase 25, «moneda nativa sin sumar monedas».
- **Las líneas se quedan en el orden en que se cargaron.** Reagruparlas en pantalla movería una
  fila mientras alguien escribe en ella, y el borrador vive en estado de cliente. Qué va en cada
  comprobante se lee en el bloque, y cada línea ya muestra su precio con su moneda.
- Una línea al pie: «Se emiten 2 comprobantes, uno por moneda, cada uno con su número y su cobro.»

### D-8 · El cobro no entra acá

Cada comprobante se cobra **por separado**, con la pantalla de cobro que ya existe, y el panel de
cobro rediseñado con permuta es la **24.6.2-d**. Esta subfase emite; no cobra, no anula y no toca
`cash`.

### D-9 · La posición de una línea se cuenta desde 1 dentro de su comprobante

*Agregada el 2026-11-03, durante la implementación, y **confirmada por el usuario ese mismo día**
después de que la revisión independiente señalara que decide qué se guarda y se había tomado
después de aprobar el alcance (hallazgo 6).* No estaba en el brief aprobado y hubo que decidirla: con las líneas repartidas, la fila 3 del formulario puede ser la segunda línea de su
comprobante, y `sale_lines.position` tiene `CHECK (> 0)` y `UNIQUE (sale_id, position)`, que las
dos formas cumplen.

**Se guarda la posición dentro del comprobante**, de 1 en adelante, porque es la que el comprobante
impreso muestra y la que el DataModel describe («la de la línea del pedido, de 1 en adelante»). La
alternativa —conservar la fila del formulario— dejaría comprobantes con las posiciones 1 y 3, un
hueco que no significa nada para quien lo recibe.

**La posición de la fila del formulario sigue siendo otra cosa y no se toca**: es la que viaja en
los rechazos, la que marca la línea en la pantalla y la que indexa las unidades resueltas. Con una
sola moneda las dos coinciden, que es el caso de siempre. La entrada de auditoría usa la del
comprobante, porque describe el documento.

## Alcance

**Incluido**: la emisión de N comprobantes en una transacción desde `/ventas/nueva`, con el orden
de bloqueo del ADR 0021 respetado y verificado; el motivo por producto de `sellStock`; el resultado
de `issueSale` con sus N ventas y los sitios que lo leen; el bloque «Comprobantes a emitir» del
resumen; el destino posterior a emitir; el mensaje de `unit_currency_mismatch`; las notas fechadas
en los ADR 0019 y 0021; y la comparación visual contra las láminas 02 y 06.

**Excluido**: convertir montos o sumar monedas, que el ADR 0025 prohíbe; ligar los comprobantes con
cualquier dato, que el usuario descartó; el comprobante multimoneda, que exigiría un ADR nuevo;
dividir un pedido en N comprobantes y cualquier cambio a `/pedidos/nuevo`, a `orders` o a
`evaluateLines` (V-2, H-1); el cobro, la permuta y la anulación (D-8); el objetivo táctil de 44 px
(V-3); migraciones, tablas, contratos y lecturas nuevas, que las reglas de la Fase 24 prohíben; y
reescribir el README del lote de láminas (H-1).

## Lista cerrada de archivos

Salir de esta lista **se pregunta antes de implementar**, sin excepción por tamaño.

**Código (7)**

| Archivo | Qué cambia |
|---|---|
| `src/modules/sales/service.ts` | La agrupación, los N comprobantes, los N números (D-1, D-2) |
| `src/modules/sales/index.ts` | El tipo del resultado (D-4) |
| `src/modules/inventory/service.ts` | El motivo por producto de `sellStock`, y solo eso (D-1) |
| `src/app/(autenticado)/ventas/actions.ts` | El destino y la moneda del rechazo (D-5, D-3) |
| `src/app/(autenticado)/ventas/messages.ts` | Los textos del bloque, el aviso del listado y `unit_currency_mismatch` (D-3, D-7) |
| `src/app/(autenticado)/ventas/nueva/sale-form.tsx` | El bloque «Comprobantes a emitir»; se borra el aviso rojo (D-7) |
| `src/app/(autenticado)/ventas/page.tsx` | El aviso de los N comprobantes (D-5, opción A) |

**Pruebas (20)**

| Archivo | Qué cambia |
|---|---|
| `tests/integration/sales.test.ts` | Los casos nuevos y el cambio deliberado de la afirmación de `currency_mismatch` (D-4) |
| `tests/e2e/sales.spec.ts` | El caso de extremo a extremo, con y sin JavaScript |
| Los **18** archivos restantes de `tests/integration/` que llaman a `issueSale` | Solo la lectura del resultado, donde `tsc` la marque: `account-receipts`, `client-accounts`, `exchange`, `exchange-outgoing`, `goods-receipt-voids`, `order-receipts`, `receipt-voids`, `receipts`, `refunds`, `sales-list-reads`, `service-orders`, `service-own-units`, `trade-in-payments`, `trade-ins`, `units`, `units-orders-sales`, `warranty`, `warranty-claims` |

**Ninguna guarda se toca.** `unit-writes.test.ts` y `stock-writes.test.ts` quedan tal cual, y eso
es una consecuencia buscada de D-4.

**Extensión registrada de la lista cerrada, autorizada por el usuario el 2026-11-03**

| Archivo | Motivo |
|---|---|
| `src/modules/inventory/unit-repairs.ts` | **Un comentario, sin efecto en la conducta.** Decía «el motivo es una función, **como en `sellStock`**», y esa analogía dejó de ser exacta cuando D-1 le cambió la firma a `sellStock`: el comentario quedó falso **por** esta subfase. Lo encontró la revisión independiente (hallazgo 9). **Se tocó antes de preguntar, que es el error**: la regla es preguntar primero, sin excepción por tamaño. Se informó al terminar y el usuario autorizó dejarlo |

**Documentación (4, más el cierre)**

| Archivo | Qué cambia |
|---|---|
| `docs/decisions/brief-24.6.2-c-mostrador-con-dos-monedas.md` | Este brief, con su §Cierre |
| `docs/decisions/0021-la-venta.md` | Nota fechada en el punto 7: una operación de mostrador puede emitir N comprobantes, y toma todos los bloqueos una vez antes del primer contador |
| `docs/decisions/0019-bases-de-los-comprobantes.md` | Nota fechada en el punto 3: la fase que crea el comprobante decidió N comprobantes de una moneda cada uno, sin convertir |
| `docs/product/Screens.md` | §19 y §17, las dos (D-5, opción A) |
| `CHANGELOG.md`, `docs/planning/Roadmap.md`, `HANDOFF.md` | Al cierre |

## Criterios de aceptación

| Id | Criterio | Cómo se verifica |
|---|---|---|
| **AC-1** | Dos líneas, una en ARS y una en USD, emiten **dos** comprobantes con números **consecutivos**; el más bajo es el de la moneda de la primera línea. Cada uno con su moneda, su total y sus líneas | `sales.test.ts` |
| **AC-2** | Tres monedas emiten tres comprobantes, en el orden de aparición de cada moneda | `sales.test.ts` |
| **AC-3** | Si a la línea en USD le falta stock, **no se emite nada**: cero ventas, cero movimientos y el `last_number` del contador **sin cambiar** | `sales.test.ts`, comparando el contador antes y después |
| **AC-4** | Dos emisiones de dos monedas en paralelo, desde dos conexiones, terminan las dos sin interbloqueo, con cuatro números consecutivos | `sales.test.ts`. **No prueba el orden de bloqueo**: con poca contención pasaría igual con el orden mal. Lo prueba AC-5 |
| **AC-5** | Con una **tercera conexión** reteniendo el saldo del producto en USD, la emisión de dos monedas espera **sin haber tomado el contador**: una segunda emisión de una sola moneda, lanzada después, **termina primero y se lleva un número**. Al soltar la tercera conexión, la primera emite con los números siguientes | `sales.test.ts`, con el mecanismo que ya usan `client-tags-ingestion.test.ts:134` y `orders-agent.test.ts:173` (brief-12.2, D-8). Es el criterio que prueba H-3 |
| **AC-6** | El alta de un **pedido** sigue rechazando la moneda mezclada con `currency_mismatch`, y el contrato de ingestión del agente sigue devolviendo ese código | `orders.test.ts` y `orders-agent.test.ts` **sin modificar**, en verde |
| **AC-7** | Una unidad con precio en otra moneda que el producto de su línea sigue rechazándose con `unit_currency_mismatch`, y el mensaje nombra la moneda de **su** línea, no «la primera» | `units-orders-sales.test.ts` y la revisión del texto |
| **AC-8** | Con JavaScript y dos monedas cargadas, el resumen muestra «Comprobantes a emitir» con una fila por moneda —moneda, líneas y total estimado—, **no** muestra un total único, y el aviso rojo de monedas distintas **no existe** | `sales.spec.ts` |
| **AC-9** | **Sin JavaScript**, el bloque no aparece y la emisión produce igual los dos comprobantes | `sales.spec.ts`, con `test.use({ javaScriptEnabled: false })` |
| **AC-10** | Con un comprobante, el destino es el detalle con «Venta emitida.», igual que hoy. Con dos, el destino es el de D-5, con los números nombrados; un parámetro malformado cae en el aviso genérico | `sales.spec.ts` |
| **AC-11** | **Comparación visual contra las láminas 02 y 06**, entrada por entrada, sobre una captura real de la pantalla con dos monedas cargadas, en escritorio y a 375 px. Tabla de diferencias en §Cierre, cada una clasificada como del bloque nuevo (sin lámina, V-1) o como desvío a corregir | Capturas de Playwright al lado de los PNG |
| **AC-12** | Sin desbordamiento horizontal de 320 a 1440 px con el bloque de tres monedas desplegado | Barrido de anchos en `sales.spec.ts`, como el de la 24.6.2 |
| **AC-13** | `axe` sin violaciones en el alta con dos monedas cargadas, y el bloque anunciado por `aria-live` cuando cambia | `sales.spec.ts` |
| **AC-14** | **La batería completa en una sola corrida de CI**, en verde, sobre el SHA exacto | La corrida de CI, leída por `headSha` |
| **AC-15** | `Screens.md` §19 dice qué cambió, incluida la divergencia deliberada con `/pedidos/nuevo` (V-2), y los ADR 0019 y 0021 tienen su nota fechada | Revisión de los documentos |
| **AC-16** | **Revisión independiente** de un agente que no participó, de solo lectura, contra este brief y contra las reglas vigentes | Antes del cierre, por `CLAUDE.md` |
| **AC-17** | **Recorrido del usuario** sobre producción: vende un accesorio en pesos y un equipo en dólares en la misma atención | Después del despliegue, con su autorización |

## AC-11 · Comparación visual contra las láminas 02 y 06, entrada por entrada

Hecha el 2026-11-03 sobre una **captura real** de `/ventas/nueva` con dos monedas cargadas —un
iPhone en USD y dos fundas en ARS—, en escritorio (1672 × 941, la medida de la lámina) y a 390 px,
con un arnés temporal que después se borró.

| Entrada de la lámina 02 | En la pantalla | Veredicto |
|---|---|---|
| «Volver a ventas» y el título «Nueva venta» | Igual | Coincide |
| Tarjeta «Cliente (opcional)» con su ayuda debajo | Igual, con el texto de la 24.6.2 | Coincide |
| Columna derecha «Antes de emitir», pegajosa desde `lg` | Igual | Coincide |
| Fila del cliente y fila del recuento, en cajas apagadas con ícono | Igual: «Consumidor final» y «2 líneas» | Coincide |
| **«Total estimado» con el monto en grande** | **No está**: con dos monedas lo reemplaza «Comprobantes a emitir» | **Diferencia nueva y deliberada** (D-7, V-1): un total único entre ARS y USD es lo que el README del lote y la convención de métricas prohíben |
| — | **«Comprobantes a emitir»**, una fila por moneda en caja apagada —«USD · 1 línea / US$ 450,00»— y la línea «Se emiten 2 comprobantes…» | **Sin lámina** (V-1). Usa el idioma de la lámina: la misma caja apagada y redondeada de las filas de arriba, la misma tipografía de montos y la misma separación con borde superior |
| Los tres avisos con ícono | Iguales y en el mismo orden | Coincide |
| «Emitir venta» sólido violeta y «Volver sin guardar» con borde, a lo ancho | Igual | Coincide |
| «Se comprueban disponibilidad y precios antes de emitir.» al pie | Igual | Coincide |
| Tarjeta de producto con miniatura, IMEI y grado | No aplica: los productos de la captura son por cantidad | Diferencia del dato, no de la pantalla |
| Subtítulo «Venta sin pedido.» | La pantalla dice «La venta se numera al emitirla…» | **Preexistente**, de la 24.6.2; esta subfase no lo toca |

En la **lámina 06** (teléfono) la comparación da lo mismo: el resumen va al pie, el bloque aparece
en el mismo lugar donde la lámina pone «Total estimado», y a 390 px cada fila entra con su monto a
la derecha sin partirse. El orden de los dos botones al pie es el preexistente de la 24.6.2.

**Un matiz que vale anotar**: la lámina le da al total un tamaño grande y en negrita, y las filas
del bloque usan el tamaño del resumen. Con dos monedas **no hay un número grande posible** sin
sumarlas, así que esa prominencia se pierde a propósito. No se corrige.

**Resultado: ningún desvío introducido por esta subfase.** Lo único nuevo es el bloque, que no
tiene lámina contra la cual compararse.

## Revisión independiente

Hecha el 2026-11-03 por un agente que **no participó** del trabajo, de solo lectura, contra este
brief y contra las reglas vigentes, sin recibir las conclusiones de quien implementó. No ejecutó
pruebas ni leyó la CI, y lo dice.

**Veredicto: R1, nueve hallazgos, ninguno bloqueante. Los nueve son reales**: los verifiqué contra
el código antes de aceptarlos, y ninguno resultó falso. Los dos más caros tocaban criterios que
**no se cumplían tal como estaban escritos**, y los dos eran míos.

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **AC-12 se verificaba con dos monedas y el criterio nombra tres.** La tercera fila es la que suma alto | Corregido: el barrido carga una tercera moneda antes de recorrer los cinco anchos |
| 2 | **AC-7 se apoyaba en un caso de `createOrder`**, la pantalla gemela que esta subfase declaró distinta a propósito. Ningún caso ejercitaba `unit_currency_mismatch` por el camino de la venta | Corregido: caso nuevo en `units-orders-sales.test.ts`, con dos monedas en el formulario, que es lo que prueba que la división es por línea y no dentro de una |
| 3 | **La región viva se desmontaba y nacía otra** al pasar de una a dos monedas, y una región que nace con su contenido no se anuncia. La segunda mitad de AC-13 no tenía afirmación | Corregido: una sola región `aria-live` **permanente**, con un gancho para afirmar que es la misma antes y después |
| 4 | **El aviso del listado descartaba los números malformados y seguía con los válidos**, donde D-5 dice que cualquier otra cosa cae en el genérico; y el texto genérico no era el que D-5 fijó | Corregido: cualquier token sin la forma manda al genérico, con el texto del brief, y el caso de extremo a extremo prueba los tres modos de malformado |
| 5 | **La precedencia que el brief y el comentario le atribuían a `evaluateLines` no es la suya**: comprueba el precio cambiado entre sus dos clases de regla de línea | Corregido en los dos lugares, con la diferencia escrita y medida. No se cambió la conducta: ninguno de los dos caminos escribe nada |
| 6 | **D-9 se agregó al brief después de aprobarlo** y decide qué se guarda en `sale_lines.position` | Declarado. **Lo confirma el usuario antes del cierre**: es una decisión sobre lo que se escribe, tomada después de la aprobación del alcance |
| 7 | **El Roadmap y el `HANDOFF` decían «No tiene brief» y «el orden lo decide el usuario»**, las dos falsas desde que este brief existe, y el Roadmap es nivel 3 de la jerarquía | Corregido en los dos |
| 8 | Las dos notas fechadas en los ADR quedaron **antes** de notas más viejas | Corregido: las dos al final de su serie |
| 9 | Comentarios que describían lo anterior: el bloque de `sellStock` en singular, tres analogías «como en sellStock» que dejaron de ser exactas, el texto inalcanzable de `currency_mismatch` y una constante exportada sin consumidor | Corregidos los cinco |

**Una sospecha que la revisión no pudo confirmar y que acá queda cerrada**: dudó si las
afirmaciones convertidas eran `toEqual` antes y pasaron a `toMatchObject`, lo que habría perdido la
comprobación de que el `id` existe. **No pasó**: las cinco de `sales.test.ts` ya eran
`toMatchObject` y solo cambió `sale:` por `sales: [...]`, que sobre un array exige la misma
longitud. La afirmación exacta del caso nuevo sí es `toEqual`, con `id: expect.any(String)`.

**Lo que la revisión no pudo verificar por lectura**: AC-11, la comparación visual, porque su
evidencia es una captura que no se versiona. Lo anotó como lo que es —**sigue siendo
autoevaluación**— y tiene razón: es el criterio que en la 24.6.2-e encontró el único defecto que
nada más vio. Queda cubierto por AC-17, el recorrido del usuario sobre producción.

## Condiciones de detención

Se para y se pregunta, sin seguir:

1. **Si hace falta tocar `src/shared/lines/rules.ts`, `orders` o `/pedidos/nuevo`.** Es el contrato
   con el agente de WhatsApp (H-1) y una decisión de modelo que este brief excluye.
2. **Si el orden de bloqueo no se puede respetar** con el cambio de D-1, o si AC-5 muestra que el
   contador se toma antes de los saldos. Eso sería un ADR, no una subfase.
3. **Si aparece la necesidad de una migración, una tabla, un contrato o una lectura nueva.** La nota
   del Roadmap afirma que no hacen falta; si se equivoca, la subfase no cabe en la Fase 24.
4. **Si hay que salir de la lista cerrada de archivos**, por chico que sea el cambio.
5. **Si `tsc` marca lecturas del resultado fuera de los 19 archivos contados**, lo que querría decir
   que el radio de impacto estaba mal medido.

## Nivel de validación objetivo

**Validado localmente** al terminar la implementación, con AC-1 a AC-13 en verde. **Validado en
integración** con AC-14. **Validado en staging** solo después del despliegue y del recorrido del
usuario (AC-17). No certifica **preparado para producción**.

## Ubicación en la fase

- **Necesario ahora**: todo lo de esta subfase. El negocio vende en dos monedas en la misma
  atención y hoy la pantalla se lo impide.
- **Requisito antes de producción, pero de otra subfase**: el panel de cobro con permuta y la
  anulación con vista previa, la **24.6.2-d**, que ahora se diseña sabiendo que una operación puede
  emitir dos comprobantes.
- **Mejora posterior**: el objetivo táctil de 44 px en la clase compartida (V-3), y el enmascarado
  del IMEI, que espera un ADR.
